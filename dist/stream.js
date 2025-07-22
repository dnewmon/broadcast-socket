import { RedisDataKeys } from './RedisDataKeys.js';
export class StreamManager {
    redis;
    consumers = new Map();
    cleanupInterval = null;
    workerId;
    constructor(redis, workerId = process.pid.toString()) {
        this.redis = redis;
        this.workerId = workerId;
        this.startCleanupTimer();
    }
    async createClientConsumer(clientId, subscribedChannels) {
        const groupName = RedisDataKeys.clientConsumerGroup(clientId);
        const consumerName = RedisDataKeys.clientConsumerName(this.workerId, clientId);
        console.log(`[STREAM] Creating consumer for client ${clientId} with channels:`, subscribedChannels);
        const streamKeys = [];
        const globalStreamKey = RedisDataKeys.globalStream();
        streamKeys.push(globalStreamKey);
        await this.redis.createConsumerGroup(globalStreamKey, groupName, '0');
        for (const channel of subscribedChannels) {
            const streamKey = RedisDataKeys.channelStream(channel);
            streamKeys.push(streamKey);
            await this.redis.createConsumerGroup(streamKey, groupName, '0');
        }
        const consumerInfo = {
            clientId,
            workerId: this.workerId,
            groupName,
            consumerName,
            streamKeys,
            isActive: true
        };
        this.consumers.set(clientId, consumerInfo);
        console.log(`[STREAM] Created consumer ${consumerName} for client ${clientId} with ${streamKeys.length} streams`);
        return consumerInfo;
    }
    async updateClientChannels(clientId, newChannels) {
        const consumer = this.consumers.get(clientId);
        if (!consumer) {
            console.log(`[STREAM] Consumer for client ${clientId} not found, creating new one`);
            await this.createClientConsumer(clientId, newChannels);
            return;
        }
        console.log(`[STREAM] Updating channels for client ${clientId} from [${consumer.streamKeys.join(', ')}] to [${newChannels.join(', ')}]`);
        const newStreamKeys = [RedisDataKeys.globalStream()];
        newChannels.forEach(channel => newStreamKeys.push(RedisDataKeys.channelStream(channel)));
        for (const streamKey of newStreamKeys) {
            if (!consumer.streamKeys.includes(streamKey)) {
                await this.redis.createConsumerGroup(streamKey, consumer.groupName, '0');
            }
        }
        consumer.streamKeys = newStreamKeys;
        console.log(`[STREAM] Updated consumer for client ${clientId} to ${newStreamKeys.length} streams`);
    }
    async destroyClientConsumer(clientId) {
        const consumer = this.consumers.get(clientId);
        if (!consumer) {
            console.log(`[STREAM] No consumer found for client ${clientId} to destroy`);
            return;
        }
        console.log(`[STREAM] Destroying consumer for client ${clientId}`);
        consumer.isActive = false;
        for (const streamKey of consumer.streamKeys) {
            try {
                await this.redis.deleteConsumerGroup(streamKey, consumer.groupName);
            }
            catch (error) {
                console.error(`[STREAM] Error deleting consumer group for stream ${streamKey}:`, error);
            }
        }
        await this.redis.getClient().del(RedisDataKeys.clientPendingMessages(clientId));
        this.consumers.delete(clientId);
        console.log(`[STREAM] Destroyed consumer for client ${clientId}`);
    }
    async publishMessage(channel, broadcastMessage) {
        const messageData = {
            messageId: broadcastMessage.messageId,
            channel: broadcastMessage.channel,
            data: JSON.stringify(broadcastMessage.data),
            timestamp: broadcastMessage.timestamp.toString(),
            senderId: broadcastMessage.senderId || ''
        };
        let streamKey;
        if (channel === '*') {
            streamKey = RedisDataKeys.globalStream();
        }
        else {
            streamKey = RedisDataKeys.channelStream(channel);
        }
        console.log(`[STREAM] Publishing message ${broadcastMessage.messageId} to stream ${streamKey}`);
        const streamMessageId = await this.redis.addToStream(streamKey, messageData);
        console.log(`[STREAM] Message published with stream ID: ${streamMessageId}`);
        return streamMessageId;
    }
    async readMessagesForClient(clientId, maxCount = 10) {
        const consumer = this.consumers.get(clientId);
        if (!consumer || !consumer.isActive) {
            console.log(`[STREAM] No active consumer found for client ${clientId}`);
            return [];
        }
        const messages = [];
        const pendingMessages = await this.readPendingMessagesForClient(clientId);
        messages.push(...pendingMessages);
        if (messages.length < maxCount) {
            const remainingCount = maxCount - messages.length;
            const newMessages = await this.readNewMessagesForClient(clientId, remainingCount);
            messages.push(...newMessages);
        }
        const tenMinutesAgo = Date.now() - (10 * 60 * 1000);
        const validMessages = [];
        for (const message of messages) {
            const messageTime = this.extractTimestampFromStreamId(message.id);
            if (messageTime < tenMinutesAgo) {
                console.log(`[STREAM] Auto-ACKing old message ${message.id} (${new Date(messageTime).toISOString()})`);
                await this.acknowledgeMessage(clientId, message.streamKey, message.id);
            }
            else {
                validMessages.push(message);
            }
        }
        return validMessages;
    }
    async readPendingMessagesForClient(clientId) {
        const consumer = this.consumers.get(clientId);
        if (!consumer || !consumer.isActive) {
            return [];
        }
        const messages = [];
        for (const streamKey of consumer.streamKeys) {
            try {
                const result = await this.redis.readPendingMessages(streamKey, consumer.groupName, consumer.consumerName, 5);
                for (const streamData of result) {
                    if (streamData && streamData.messages) {
                        for (const messageData of streamData.messages) {
                            const message = this.parseStreamMessage(messageData, streamKey);
                            if (message)
                                messages.push(message);
                        }
                    }
                }
            }
            catch (error) {
                console.error(`[STREAM] Error reading pending messages for stream ${streamKey}:`, error);
            }
        }
        console.log(`[STREAM] Found ${messages.length} pending messages for client ${clientId}`);
        return messages;
    }
    async readNewMessagesForClient(clientId, maxCount) {
        const consumer = this.consumers.get(clientId);
        if (!consumer || !consumer.isActive) {
            return [];
        }
        const messages = [];
        for (const streamKey of consumer.streamKeys) {
            try {
                const result = await this.redis.readFromConsumerGroup(streamKey, consumer.groupName, consumer.consumerName, Math.ceil(maxCount / consumer.streamKeys.length), 1000);
                for (const streamData of result) {
                    if (streamData && streamData.messages) {
                        for (const messageData of streamData.messages) {
                            const message = this.parseStreamMessage(messageData, streamKey);
                            if (message)
                                messages.push(message);
                        }
                    }
                }
            }
            catch (error) {
                console.error(`[STREAM] Error reading new messages for stream ${streamKey}:`, error);
            }
        }
        console.log(`[STREAM] Found ${messages.length} new messages for client ${clientId}`);
        return messages;
    }
    async acknowledgeMessage(clientId, streamKey, messageId) {
        const consumer = this.consumers.get(clientId);
        if (!consumer) {
            console.log(`[STREAM] Cannot ACK message ${messageId} - no consumer for client ${clientId}`);
            return;
        }
        try {
            await this.redis.acknowledgeMessage(streamKey, consumer.groupName, messageId);
            console.log(`[STREAM] ACK'd message ${messageId} for client ${clientId} in stream ${streamKey}`);
        }
        catch (error) {
            console.error(`[STREAM] Error ACKing message ${messageId} for client ${clientId}:`, error);
        }
    }
    parseStreamMessage(messageData, streamKey) {
        try {
            const message = {
                id: messageData.id,
                streamKey,
                fields: messageData.message || {}
            };
            if (message.fields.messageId && message.fields.data) {
                message.parsedData = {
                    messageId: message.fields.messageId,
                    channel: message.fields.channel || '',
                    data: JSON.parse(message.fields.data),
                    timestamp: parseInt(message.fields.timestamp, 10),
                    senderId: message.fields.senderId || undefined
                };
            }
            return message;
        }
        catch (error) {
            console.error(`[STREAM] Error parsing stream message:`, error);
            return null;
        }
    }
    extractTimestampFromStreamId(streamId) {
        const parts = streamId.split('-');
        return parseInt(parts[0], 10);
    }
    startCleanupTimer() {
        this.cleanupInterval = setInterval(async () => {
            await this.cleanupOldMessages();
        }, 5 * 60 * 1000);
    }
    async cleanupOldMessages() {
        console.log('[STREAM] Running periodic cleanup of old messages');
        try {
            const pattern = RedisDataKeys.streamPattern();
            const keys = await this.redis.getClient().keys(pattern);
            const tenMinutesMs = 10 * 60 * 1000;
            for (const streamKey of keys) {
                await this.redis.deleteOldMessages(streamKey, tenMinutesMs);
            }
        }
        catch (error) {
            console.error('[STREAM] Error during cleanup:', error);
        }
    }
    getConsumerInfo(clientId) {
        return this.consumers.get(clientId);
    }
    getAllConsumers() {
        return Array.from(this.consumers.values());
    }
    async shutdown() {
        console.log('[STREAM] Shutting down StreamManager');
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        const clientIds = Array.from(this.consumers.keys());
        for (const clientId of clientIds) {
            await this.destroyClientConsumer(clientId);
        }
        console.log('[STREAM] StreamManager shutdown complete');
    }
}
//# sourceMappingURL=stream.js.map