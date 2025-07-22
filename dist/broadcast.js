import { v4 as uuidv4 } from 'uuid';
import { RedisDataKeys } from './RedisDataKeys.js';
import { StreamManager } from './stream.js';
export class BroadcastManager {
    redis;
    subscriptionManager;
    streamManager;
    clients;
    deduplicationCache = new Set();
    messagePollingInterval = null;
    constructor(redis, subscriptionManager, clients) {
        this.redis = redis;
        this.subscriptionManager = subscriptionManager;
        this.clients = clients;
        this.streamManager = new StreamManager(redis);
        this.startMessagePolling();
    }
    startMessagePolling() {
        console.log('[BROADCAST] Starting stream-based message polling');
        this.messagePollingInterval = setInterval(async () => {
            await this.pollAndDeliverMessages();
        }, 1000);
    }
    async pollAndDeliverMessages() {
        const activeClients = Array.from(this.clients.entries()).filter(([, client]) => client.isAlive);
        for (const [clientId] of activeClients) {
            try {
                const messages = await this.streamManager.readMessagesForClient(clientId, 10);
                for (const streamMessage of messages) {
                    if (streamMessage.parsedData) {
                        await this.deliverStreamMessageToClient(clientId, streamMessage);
                    }
                }
            }
            catch (error) {
                console.error(`[BROADCAST] Error polling messages for client ${clientId}:`, error);
            }
        }
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
            senderId,
        };
        console.log(`[BROADCAST] Storing message in Redis: ${messageId}`);
        await this.redis.storeMessage(messageId, broadcastMessage);
        console.log(`[BROADCAST] Publishing to stream for channel: ${channel}`);
        await this.streamManager.publishMessage(channel, broadcastMessage);
        await this.redis.incrementCounter(RedisDataKeys.totalMessagesStats());
        await this.redis.incrementCounter(RedisDataKeys.channelMessagesStats(channel));
        console.log(`[BROADCAST] Successfully broadcast message ${messageId} to channel ${channel}`);
        return messageId;
    }
    async broadcastToAll(data, senderId) {
        return this.broadcastToChannel('*', data, senderId);
    }
    async deliverStreamMessageToClient(clientId, streamMessage) {
        const broadcastMessage = streamMessage.parsedData;
        console.log(`[BROADCAST] Delivering stream message ${broadcastMessage.messageId} to client ${clientId}`);
        if (this.deduplicationCache.has(broadcastMessage.messageId)) {
            console.log(`[BROADCAST] Message ${broadcastMessage.messageId} already processed (deduplication)`);
            await this.streamManager.acknowledgeMessage(clientId, streamMessage.streamKey, streamMessage.id);
            return;
        }
        if (broadcastMessage.senderId === clientId) {
            console.log(`[BROADCAST] Skipping message ${broadcastMessage.messageId} - same sender`);
            await this.streamManager.acknowledgeMessage(clientId, streamMessage.streamKey, streamMessage.id);
            return;
        }
        this.deduplicationCache.add(broadcastMessage.messageId);
        setTimeout(() => {
            this.deduplicationCache.delete(broadcastMessage.messageId);
        }, 60000);
        if (broadcastMessage.channel !== '*') {
            const isSubscribed = this.subscriptionManager.isClientSubscribed(clientId, broadcastMessage.channel);
            if (!isSubscribed) {
                console.log(`[BROADCAST] Client ${clientId} not subscribed to channel ${broadcastMessage.channel}, ACKing without delivery`);
                await this.streamManager.acknowledgeMessage(clientId, streamMessage.streamKey, streamMessage.id);
                return;
            }
        }
        const client = this.clients.get(clientId);
        if (!client || !client.isAlive) {
            console.log(`[BROADCAST] Client ${clientId} not available, message will remain in pending state`);
            return;
        }
        const serverMessage = {
            type: 'message',
            channel: broadcastMessage.channel,
            data: broadcastMessage.data,
            messageId: broadcastMessage.messageId,
            timestamp: broadcastMessage.timestamp,
        };
        try {
            if (client.ws.readyState === 1) {
                console.log(`[BROADCAST] Sending stream message ${broadcastMessage.messageId} to client ${clientId}`);
                client.ws.send(JSON.stringify(serverMessage));
                console.log(`[BROADCAST] Stream message ${broadcastMessage.messageId} sent successfully to client ${clientId}`);
                await this.sendAcknowledgment(client, broadcastMessage.messageId);
            }
            else {
                console.log(`[BROADCAST] Client ${clientId} WebSocket not ready (state: ${client.ws.readyState}), message remains pending`);
            }
        }
        catch (error) {
            console.error(`[BROADCAST] Error delivering stream message to client ${clientId}:`, error);
        }
    }
    async sendAcknowledgment(client, messageId) {
        if (!messageId)
            return;
        const ackMessage = {
            type: 'ack',
            messageId,
            timestamp: Date.now(),
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
    async handleClientAcknowledgment(clientId, messageId) {
        console.log(`[BROADCAST] Handling client ACK for message ${messageId} from client ${clientId}`);
        const consumerInfo = this.streamManager.getConsumerInfo(clientId);
        if (!consumerInfo) {
            console.log(`[BROADCAST] No consumer info found for client ${clientId} - cannot ACK`);
            return;
        }
        for (const streamKey of consumerInfo.streamKeys) {
            try {
                await this.streamManager.acknowledgeMessage(clientId, streamKey, messageId);
                console.log(`[BROADCAST] Successfully ACK'd message ${messageId} from stream ${streamKey} for client ${clientId}`);
                break;
            }
            catch {
                continue;
            }
        }
    }
    async initializeClientStreams(clientId) {
        const subscriptions = this.subscriptionManager.getClientSubscriptions(clientId);
        console.log(`[BROADCAST] Initializing streams for client ${clientId} with subscriptions:`, subscriptions);
        await this.streamManager.createClientConsumer(clientId, subscriptions);
        console.log(`[BROADCAST] Initialized consumer for client ${clientId}`);
    }
    async updateClientStreams(clientId) {
        const subscriptions = this.subscriptionManager.getClientSubscriptions(clientId);
        console.log(`[BROADCAST] Updating streams for client ${clientId} with subscriptions:`, subscriptions);
        await this.streamManager.updateClientChannels(clientId, subscriptions);
        console.log(`[BROADCAST] Updated consumer for client ${clientId}`);
    }
    async cleanupClientStreams(clientId) {
        console.log(`[BROADCAST] Cleaning up streams for client ${clientId}`);
        await this.streamManager.destroyClientConsumer(clientId);
        console.log(`[BROADCAST] Cleaned up consumer for client ${clientId}`);
    }
    getPendingMessageCount(clientId) {
        const consumerInfo = this.streamManager.getConsumerInfo(clientId);
        return consumerInfo ? consumerInfo.streamKeys.length : 0;
    }
    getTotalPendingMessages() {
        const consumers = this.streamManager.getAllConsumers();
        return consumers.reduce((total, consumer) => total + consumer.streamKeys.length, 0);
    }
    async getMessageHistory(channel, limit = 50) {
        try {
            const pattern = RedisDataKeys.messageHistoryPattern();
            const keys = await this.redis.getClient().keys(pattern);
            const messages = [];
            for (const key of keys.slice(-limit)) {
                const message = await this.redis.getMessage(key.replace(RedisDataKeys.message(''), ''));
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
    async shutdown() {
        console.log('[BROADCAST] Shutting down BroadcastManager');
        if (this.messagePollingInterval) {
            clearInterval(this.messagePollingInterval);
        }
        await this.streamManager.shutdown();
        console.log('[BROADCAST] BroadcastManager shutdown complete');
    }
    getStreamManager() {
        return this.streamManager;
    }
}
//# sourceMappingURL=broadcast.js.map