"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BroadcastManager = void 0;
const uuid_1 = require("uuid");
class BroadcastManager {
    constructor(redis, subscriptionManager, clients) {
        this.messageQueue = new Map();
        this.deduplicationCache = new Set();
        this.redis = redis;
        this.subscriptionManager = subscriptionManager;
        this.clients = clients;
        this.setupRedisSubscriptions();
    }
    setupRedisSubscriptions() {
        this.redis.subscribeToChannel('broadcast:*', (message) => {
            try {
                const broadcastMessage = JSON.parse(message);
                this.handleIncomingBroadcast(broadcastMessage);
            }
            catch (error) {
                console.error('Error parsing broadcast message:', error);
            }
        });
    }
    async broadcastToChannel(channel, data, senderId) {
        const messageId = (0, uuid_1.v4)();
        const timestamp = Date.now();
        const broadcastMessage = {
            channel,
            data,
            messageId,
            timestamp,
            senderId
        };
        await this.redis.storeMessage(messageId, broadcastMessage);
        await this.redis.publishMessage(`broadcast:${channel}`, broadcastMessage);
        await this.redis.incrementCounter('stats:total_messages');
        await this.redis.incrementCounter(`stats:channel:${channel}:messages`);
        return messageId;
    }
    async broadcastToAll(data, senderId) {
        return this.broadcastToChannel('*', data, senderId);
    }
    async handleIncomingBroadcast(broadcastMessage) {
        if (this.deduplicationCache.has(broadcastMessage.messageId)) {
            return;
        }
        this.deduplicationCache.add(broadcastMessage.messageId);
        setTimeout(() => {
            this.deduplicationCache.delete(broadcastMessage.messageId);
        }, 60000);
        const { channel, data, messageId, timestamp, senderId } = broadcastMessage;
        if (channel === '*') {
            await this.deliverToAllClients(data, messageId, timestamp, senderId);
        }
        else {
            await this.deliverToChannelSubscribers(channel, data, messageId, timestamp, senderId);
        }
    }
    async deliverToChannelSubscribers(channel, data, messageId, timestamp, senderId) {
        const subscribers = this.subscriptionManager.getChannelSubscribers(channel);
        const serverMessage = {
            type: 'message',
            channel,
            data,
            messageId,
            timestamp
        };
        const deliveryPromises = subscribers
            .filter(clientId => clientId !== senderId)
            .map(clientId => this.deliverToClient(clientId, serverMessage));
        await Promise.allSettled(deliveryPromises);
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
        const client = this.clients.get(clientId);
        if (!client || !client.isAlive) {
            this.queueMessage(clientId, {
                channel: message.channel || '',
                data: message.data,
                messageId: message.messageId || '',
                timestamp: message.timestamp
            });
            return;
        }
        try {
            if (client.ws.readyState === 1) {
                client.ws.send(JSON.stringify(message));
                await this.sendAcknowledgment(client, message.messageId);
            }
            else {
                this.queueMessage(clientId, {
                    channel: message.channel || '',
                    data: message.data,
                    messageId: message.messageId || '',
                    timestamp: message.timestamp
                });
            }
        }
        catch (error) {
            console.error(`Error delivering message to client ${clientId}:`, error);
            this.queueMessage(clientId, {
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
    queueMessage(clientId, message) {
        if (!this.messageQueue.has(clientId)) {
            this.messageQueue.set(clientId, []);
        }
        const queue = this.messageQueue.get(clientId);
        queue.push(message);
        if (queue.length > 100) {
            queue.shift();
        }
    }
    async deliverQueuedMessages(clientId) {
        const queue = this.messageQueue.get(clientId);
        if (!queue || queue.length === 0) {
            return;
        }
        const client = this.clients.get(clientId);
        if (!client || !client.isAlive) {
            return;
        }
        const messages = queue.splice(0);
        for (const queuedMessage of messages) {
            const serverMessage = {
                type: 'message',
                channel: queuedMessage.channel,
                data: queuedMessage.data,
                messageId: queuedMessage.messageId,
                timestamp: queuedMessage.timestamp
            };
            await this.deliverToClient(clientId, serverMessage);
        }
        if (queue.length === 0) {
            this.messageQueue.delete(clientId);
        }
    }
    async retryFailedDeliveries() {
        const retryPromises = Array.from(this.messageQueue.keys()).map(clientId => this.deliverQueuedMessages(clientId));
        await Promise.allSettled(retryPromises);
    }
    getQueuedMessageCount(clientId) {
        const queue = this.messageQueue.get(clientId);
        return queue ? queue.length : 0;
    }
    getTotalQueuedMessages() {
        let total = 0;
        for (const queue of this.messageQueue.values()) {
            total += queue.length;
        }
        return total;
    }
    clearClientQueue(clientId) {
        this.messageQueue.delete(clientId);
    }
    async getMessageHistory(channel, limit = 50) {
        try {
            const pattern = `message:*`;
            const keys = await this.redis.getClient().keys(pattern);
            const messages = [];
            for (const key of keys.slice(-limit)) {
                const message = await this.redis.getMessage(key.replace('message:', ''));
                if (message && (channel === '*' || message.channel === channel)) {
                    messages.push(message);
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
exports.BroadcastManager = BroadcastManager;
//# sourceMappingURL=broadcast.js.map