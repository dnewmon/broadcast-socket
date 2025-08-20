import { v4 as uuidv4 } from 'uuid';
export class BroadcastManager {
    redis;
    subscriptionManager;
    clients;
    messageQueue = new Map();
    deduplicationCache = new Set();
    constructor(redis, subscriptionManager, clients) {
        this.redis = redis;
        this.subscriptionManager = subscriptionManager;
        this.clients = clients;
        this.setupRedisSubscriptions();
    }
    setupRedisSubscriptions() {
        console.log('[BROADCAST] Setting up Redis subscriptions for broadcast:* pattern');
        this.redis.subscribeToChannel('broadcast:*', (message) => {
            try {
                console.log('[BROADCAST] Received Redis message:', message);
                const broadcastMessage = JSON.parse(message);
                console.log('[BROADCAST] Parsed broadcast message:', broadcastMessage);
                this.handleIncomingBroadcast(broadcastMessage);
            }
            catch (error) {
                console.error('[BROADCAST] Error parsing broadcast message:', error);
            }
        });
    }
    async broadcastToChannel(channel, data, senderId) {
        const messageId = uuidv4();
        const timestamp = Date.now();
        console.log(`[BROADCAST] Broadcasting to channel: ${channel}, messageId: ${messageId}, senderId: ${senderId}`);
        console.log(`[BROADCAST] Broadcast data:`, data);
        const broadcastMessage = {
            channel,
            data,
            messageId,
            timestamp,
            senderId
        };
        console.log(`[BROADCAST] Storing message in Redis: ${messageId}`);
        await this.redis.storeMessage(messageId, broadcastMessage);
        console.log(`[BROADCAST] Publishing to Redis channel: broadcast:${channel}`);
        await this.redis.publishMessage(`broadcast:${channel}`, broadcastMessage);
        await this.redis.incrementCounter('stats:total_messages');
        await this.redis.incrementCounter(`stats:channel:${channel}:messages`);
        console.log(`[BROADCAST] Successfully broadcast message ${messageId} to channel ${channel}`);
        return messageId;
    }
    async broadcastToAll(data, senderId) {
        return this.broadcastToChannel('*', data, senderId);
    }
    async handleIncomingBroadcast(broadcastMessage) {
        console.log(`[BROADCAST] Handling incoming broadcast: ${broadcastMessage.messageId} for channel: ${broadcastMessage.channel}`);
        if (this.deduplicationCache.has(broadcastMessage.messageId)) {
            console.log(`[BROADCAST] Message ${broadcastMessage.messageId} already processed (deduplication)`);
            return;
        }
        this.deduplicationCache.add(broadcastMessage.messageId);
        setTimeout(() => {
            this.deduplicationCache.delete(broadcastMessage.messageId);
        }, 60000);
        const { channel, data, messageId, timestamp, senderId } = broadcastMessage;
        console.log(`[BROADCAST] Processing message ${messageId} from sender ${senderId} for channel ${channel}`);
        if (channel === '*') {
            console.log(`[BROADCAST] Delivering to all clients (global broadcast)`);
            await this.deliverToAllClients(data, messageId, timestamp, senderId);
        }
        else {
            console.log(`[BROADCAST] Delivering to channel subscribers: ${channel}`);
            await this.deliverToChannelSubscribers(channel, data, messageId, timestamp, senderId);
        }
    }
    async deliverToChannelSubscribers(channel, data, messageId, timestamp, senderId) {
        const subscribedSessions = this.subscriptionManager.getChannelSubscribers(channel);
        console.log(`[BROADCAST] Channel ${channel} has ${subscribedSessions.length} subscribed sessions: [${subscribedSessions.join(', ')}]`);
        const serverMessage = {
            type: 'message',
            channel,
            data,
            messageId,
            timestamp
        };
        const targetClientIds = [];
        for (const [clientId, client] of this.clients.entries()) {
            if (subscribedSessions.includes(client.sessionId)) {
                if (senderId && (senderId === clientId || senderId === client.sessionId)) {
                    continue;
                }
                targetClientIds.push(clientId);
            }
        }
        console.log(`[BROADCAST] Delivering to ${targetClientIds.length} active clients for subscribed sessions (excluding sender ${senderId}): [${targetClientIds.join(', ')}]`);
        const deliveryPromises = targetClientIds.map(clientId => this.deliverToClient(clientId, serverMessage));
        const results = await Promise.allSettled(deliveryPromises);
        const failures = results.filter(r => r.status === 'rejected').length;
        console.log(`[BROADCAST] Delivery completed for channel ${channel}: ${results.length - failures}/${results.length} successful`);
    }
    async deliverToAllClients(data, messageId, timestamp, senderId) {
        const serverMessage = {
            type: 'message',
            channel: '*',
            data,
            messageId,
            timestamp
        };
        const deliveryPromises = Array.from(this.clients.keys())
            .filter(clientId => clientId !== senderId)
            .map(clientId => this.deliverToClient(clientId, serverMessage));
        await Promise.allSettled(deliveryPromises);
    }
    async deliverToClient(clientId, message) {
        console.log(`[BROADCAST] Attempting to deliver message ${message.messageId} to client ${clientId}`);
        const client = this.clients.get(clientId);
        if (!client) {
            console.log(`[BROADCAST] Client ${clientId} not found in clients map, cannot queue without session info`);
            return;
        }
        if (!client.isAlive) {
            console.log(`[BROADCAST] Client ${clientId} is not alive, queueing message for session ${client.sessionId}`);
            this.queueMessageForSession(client.sessionId, {
                channel: message.channel || '',
                data: message.data,
                messageId: message.messageId || '',
                timestamp: message.timestamp
            });
            return;
        }
        try {
            if (client.ws.readyState === 1) {
                console.log(`[BROADCAST] Sending message ${message.messageId} to client ${clientId}`);
                client.ws.send(JSON.stringify(message));
                console.log(`[BROADCAST] Message ${message.messageId} sent successfully to client ${clientId}`);
                await this.sendAcknowledgment(client, message.messageId);
            }
            else {
                console.log(`[BROADCAST] Client ${clientId} WebSocket not ready (state: ${client.ws.readyState}), queueing message for session ${client.sessionId}`);
                this.queueMessageForSession(client.sessionId, {
                    channel: message.channel || '',
                    data: message.data,
                    messageId: message.messageId || '',
                    timestamp: message.timestamp
                });
            }
        }
        catch (error) {
            console.error(`[BROADCAST] Error delivering message to client ${clientId}:`, error);
            this.queueMessageForSession(client.sessionId, {
                channel: message.channel || '',
                data: message.data,
                messageId: message.messageId || '',
                timestamp: message.timestamp
            });
        }
    }
    async sendAcknowledgment(client, messageId) {
        if (!messageId)
            return;
        const ackMessage = {
            type: 'ack',
            messageId,
            timestamp: Date.now()
        };
        try {
            if (client.ws.readyState === 1) {
                client.ws.send(JSON.stringify(ackMessage));
            }
        }
        catch (error) {
            console.error(`Error sending acknowledgment to client ${client.id}:`, error);
        }
    }
    queueMessageForSession(sessionId, message) {
        console.log(`[BROADCAST] Queueing message ${message.messageId} for session ${sessionId}`);
        if (!this.messageQueue.has(sessionId)) {
            this.messageQueue.set(sessionId, []);
        }
        const queue = this.messageQueue.get(sessionId);
        queue.push(message);
        if (queue.length > 100) {
            const dropped = queue.shift();
            console.log(`[BROADCAST] Queue full for session ${sessionId}, dropped message ${dropped?.messageId}`);
        }
        console.log(`[BROADCAST] Session ${sessionId} now has ${queue.length} queued messages`);
    }
    async deliverQueuedMessagesForSession(sessionId) {
        const queue = this.messageQueue.get(sessionId);
        if (!queue || queue.length === 0) {
            return;
        }
        let activeClientId = null;
        for (const [clientId, client] of this.clients.entries()) {
            if (client.sessionId === sessionId && client.isAlive) {
                activeClientId = clientId;
                break;
            }
        }
        if (!activeClientId) {
            console.log(`[BROADCAST] No active client found for session ${sessionId}, keeping messages queued`);
            return;
        }
        console.log(`[BROADCAST] Delivering ${queue.length} queued messages for session ${sessionId} to client ${activeClientId}`);
        const messages = queue.splice(0);
        for (const queuedMessage of messages) {
            const serverMessage = {
                type: 'message',
                channel: queuedMessage.channel,
                data: queuedMessage.data,
                messageId: queuedMessage.messageId,
                timestamp: queuedMessage.timestamp
            };
            await this.deliverToClient(activeClientId, serverMessage);
        }
        if (queue.length === 0) {
            this.messageQueue.delete(sessionId);
        }
    }
    async deliverQueuedMessages(clientId) {
        const client = this.clients.get(clientId);
        if (client) {
            await this.deliverQueuedMessagesForSession(client.sessionId);
        }
    }
    async retryFailedDeliveries() {
        const retryPromises = Array.from(this.messageQueue.keys()).map(sessionId => this.deliverQueuedMessagesForSession(sessionId));
        await Promise.allSettled(retryPromises);
    }
    getQueuedMessageCountForSession(sessionId) {
        const queue = this.messageQueue.get(sessionId);
        return queue ? queue.length : 0;
    }
    getQueuedMessageCount(clientId) {
        const client = this.clients.get(clientId);
        return client ? this.getQueuedMessageCountForSession(client.sessionId) : 0;
    }
    getTotalQueuedMessages() {
        let total = 0;
        for (const queue of this.messageQueue.values()) {
            total += queue.length;
        }
        return total;
    }
    clearSessionQueue(sessionId) {
        this.messageQueue.delete(sessionId);
    }
    clearClientQueue(clientId) {
        const client = this.clients.get(clientId);
        if (client) {
            this.clearSessionQueue(client.sessionId);
        }
    }
    async getMessageHistory(channel, limit = 50) {
        try {
            const pattern = `message:*`;
            const keys = await this.redis.getClient().keys(pattern);
            const messages = [];
            for (const key of keys.slice(-limit)) {
                const message = await this.redis.getMessage(key.replace('message:', ''));
                if (message && typeof message === 'object' && message !== null) {
                    const broadcastMessage = message;
                    if (channel === '*' || broadcastMessage.channel === channel) {
                        messages.push(broadcastMessage);
                    }
                }
            }
            return messages.sort((a, b) => b.timestamp - a.timestamp);
        }
        catch (error) {
            console.error('Error fetching message history:', error);
            return [];
        }
    }
}
//# sourceMappingURL=broadcast.js.map