import { RedisManager } from './redis.js';
import { RedisDataKeys } from './RedisDataKeys.js';
import { BroadcastMessage } from './types.js';

export interface StreamMessage {
    id: string;
    streamKey: string;
    fields: Record<string, string>;
    parsedData?: BroadcastMessage;
}

export interface ConsumerInfo {
    clientId: string;
    workerId: string;
    groupName: string;
    consumerName: string;
    streamKeys: string[];
    isActive: boolean;
}

export class StreamManager {
    private redis: RedisManager;
    private consumers: Map<string, ConsumerInfo> = new Map();
    private cleanupInterval: NodeJS.Timeout | null = null;
    private readonly workerId: string;

    constructor(redis: RedisManager, workerId: string = process.pid.toString()) {
        this.redis = redis;
        this.workerId = workerId;
        this.startCleanupTimer();
    }

    async createClientConsumer(clientId: string, subscribedChannels: string[]): Promise<ConsumerInfo> {
        const groupName = RedisDataKeys.clientConsumerGroup(clientId);
        const consumerName = RedisDataKeys.clientConsumerName(this.workerId, clientId);

        console.log(`[STREAM] Creating consumer for client ${clientId} with channels:`, subscribedChannels);

        const streamKeys: string[] = [];

        // Always add global stream
        const globalStreamKey = RedisDataKeys.globalStream();
        streamKeys.push(globalStreamKey);
        await this.redis.createConsumerGroup(globalStreamKey, groupName, '0');

        // Add channel-specific streams
        for (const channel of subscribedChannels) {
            const streamKey = RedisDataKeys.channelStream(channel);
            streamKeys.push(streamKey);
            await this.redis.createConsumerGroup(streamKey, groupName, '0');
        }

        const consumerInfo: ConsumerInfo = {
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

    async updateClientChannels(clientId: string, newChannels: string[]): Promise<void> {
        const consumer = this.consumers.get(clientId);
        if (!consumer) {
            console.log(`[STREAM] Consumer for client ${clientId} not found, creating new one`);
            await this.createClientConsumer(clientId, newChannels);
            return;
        }

        console.log(`[STREAM] Updating channels for client ${clientId} from [${consumer.streamKeys.join(', ')}] to [${newChannels.join(', ')}]`);

        const newStreamKeys = [RedisDataKeys.globalStream()];
        newChannels.forEach(channel => newStreamKeys.push(RedisDataKeys.channelStream(channel)));

        // Add new streams
        for (const streamKey of newStreamKeys) {
            if (!consumer.streamKeys.includes(streamKey)) {
                await this.redis.createConsumerGroup(streamKey, consumer.groupName, '0');
            }
        }

        consumer.streamKeys = newStreamKeys;
        console.log(`[STREAM] Updated consumer for client ${clientId} to ${newStreamKeys.length} streams`);
    }

    async destroyClientConsumer(clientId: string): Promise<void> {
        const consumer = this.consumers.get(clientId);
        if (!consumer) {
            console.log(`[STREAM] No consumer found for client ${clientId} to destroy`);
            return;
        }

        console.log(`[STREAM] Destroying consumer for client ${clientId}`);
        consumer.isActive = false;

        // Clean up consumer groups from all streams
        for (const streamKey of consumer.streamKeys) {
            try {
                await this.redis.deleteConsumerGroup(streamKey, consumer.groupName);
            } catch (error) {
                console.error(`[STREAM] Error deleting consumer group for stream ${streamKey}:`, error);
            }
        }

        // Clean up any pending message metadata
        await this.redis.getClient().del(RedisDataKeys.clientPendingMessages(clientId));

        this.consumers.delete(clientId);
        console.log(`[STREAM] Destroyed consumer for client ${clientId}`);
    }

    async publishMessage(channel: string, broadcastMessage: BroadcastMessage): Promise<string> {
        const messageData = {
            messageId: broadcastMessage.messageId,
            channel: broadcastMessage.channel,
            data: JSON.stringify(broadcastMessage.data),
            timestamp: broadcastMessage.timestamp.toString(),
            senderId: broadcastMessage.senderId || ''
        };

        let streamKey: string;
        if (channel === '*') {
            streamKey = RedisDataKeys.globalStream();
        } else {
            streamKey = RedisDataKeys.channelStream(channel);
        }

        console.log(`[STREAM] Publishing message ${broadcastMessage.messageId} to stream ${streamKey}`);
        const streamMessageId = await this.redis.addToStream(streamKey, messageData);
        
        console.log(`[STREAM] Message published with stream ID: ${streamMessageId}`);
        return streamMessageId;
    }

    async readMessagesForClient(clientId: string, maxCount: number = 10): Promise<StreamMessage[]> {
        const consumer = this.consumers.get(clientId);
        if (!consumer || !consumer.isActive) {
            console.log(`[STREAM] No active consumer found for client ${clientId}`);
            return [];
        }

        const messages: StreamMessage[] = [];

        // First, read pending messages
        const pendingMessages = await this.readPendingMessagesForClient(clientId);
        messages.push(...pendingMessages);

        // Then read new messages if we haven't hit the limit
        if (messages.length < maxCount) {
            const remainingCount = maxCount - messages.length;
            const newMessages = await this.readNewMessagesForClient(clientId, remainingCount);
            messages.push(...newMessages);
        }

        // Filter out messages older than 10 minutes and auto-ACK them
        const tenMinutesAgo = Date.now() - (10 * 60 * 1000);
        const validMessages: StreamMessage[] = [];

        for (const message of messages) {
            const messageTime = this.extractTimestampFromStreamId(message.id);
            if (messageTime < tenMinutesAgo) {
                console.log(`[STREAM] Auto-ACKing old message ${message.id} (${new Date(messageTime).toISOString()})`);
                await this.acknowledgeMessage(clientId, message.streamKey, message.id);
            } else {
                validMessages.push(message);
            }
        }

        return validMessages;
    }

    async readPendingMessagesForClient(clientId: string): Promise<StreamMessage[]> {
        const consumer = this.consumers.get(clientId);
        if (!consumer || !consumer.isActive) {
            return [];
        }

        const messages: StreamMessage[] = [];

        for (const streamKey of consumer.streamKeys) {
            try {
                const result = await this.redis.readPendingMessages(
                    streamKey, 
                    consumer.groupName, 
                    consumer.consumerName,
                    5
                );

                for (const streamData of result) {
                    if (streamData && streamData.messages) {
                        for (const messageData of streamData.messages) {
                            const message = this.parseStreamMessage(messageData, streamKey);
                            if (message) messages.push(message);
                        }
                    }
                }
            } catch (error) {
                console.error(`[STREAM] Error reading pending messages for stream ${streamKey}:`, error);
            }
        }

        console.log(`[STREAM] Found ${messages.length} pending messages for client ${clientId}`);
        return messages;
    }

    async readNewMessagesForClient(clientId: string, maxCount: number): Promise<StreamMessage[]> {
        const consumer = this.consumers.get(clientId);
        if (!consumer || !consumer.isActive) {
            return [];
        }

        const messages: StreamMessage[] = [];

        for (const streamKey of consumer.streamKeys) {
            try {
                const result = await this.redis.readFromConsumerGroup(
                    streamKey,
                    consumer.groupName,
                    consumer.consumerName,
                    Math.ceil(maxCount / consumer.streamKeys.length),
                    1000 // 1 second block time
                );

                for (const streamData of result) {
                    if (streamData && streamData.messages) {
                        for (const messageData of streamData.messages) {
                            const message = this.parseStreamMessage(messageData, streamKey);
                            if (message) messages.push(message);
                        }
                    }
                }
            } catch (error) {
                console.error(`[STREAM] Error reading new messages for stream ${streamKey}:`, error);
            }
        }

        console.log(`[STREAM] Found ${messages.length} new messages for client ${clientId}`);
        return messages;
    }

    async acknowledgeMessage(clientId: string, streamKey: string, messageId: string): Promise<void> {
        const consumer = this.consumers.get(clientId);
        if (!consumer) {
            console.log(`[STREAM] Cannot ACK message ${messageId} - no consumer for client ${clientId}`);
            return;
        }

        try {
            await this.redis.acknowledgeMessage(streamKey, consumer.groupName, messageId);
            console.log(`[STREAM] ACK'd message ${messageId} for client ${clientId} in stream ${streamKey}`);
        } catch (error) {
            console.error(`[STREAM] Error ACKing message ${messageId} for client ${clientId}:`, error);
        }
    }

    private parseStreamMessage(messageData: any, streamKey: string): StreamMessage | null {
        try {
            const message: StreamMessage = {
                id: messageData.id,
                streamKey,
                fields: messageData.message || {}
            };

            // Parse the broadcast message from the fields
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
        } catch (error) {
            console.error(`[STREAM] Error parsing stream message:`, error);
            return null;
        }
    }

    private extractTimestampFromStreamId(streamId: string): number {
        const parts = streamId.split('-');
        return parseInt(parts[0], 10);
    }

    private startCleanupTimer(): void {
        // Clean up old messages every 5 minutes
        this.cleanupInterval = setInterval(async () => {
            await this.cleanupOldMessages();
        }, 5 * 60 * 1000);
    }

    private async cleanupOldMessages(): Promise<void> {
        console.log('[STREAM] Running periodic cleanup of old messages');
        
        try {
            const pattern = RedisDataKeys.streamPattern();
            const keys = await this.redis.getClient().keys(pattern);
            
            const tenMinutesMs = 10 * 60 * 1000;
            
            for (const streamKey of keys) {
                await this.redis.deleteOldMessages(streamKey, tenMinutesMs);
            }
        } catch (error) {
            console.error('[STREAM] Error during cleanup:', error);
        }
    }

    getConsumerInfo(clientId: string): ConsumerInfo | undefined {
        return this.consumers.get(clientId);
    }

    getAllConsumers(): ConsumerInfo[] {
        return Array.from(this.consumers.values());
    }

    async shutdown(): Promise<void> {
        console.log('[STREAM] Shutting down StreamManager');
        
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }

        // Clean up all consumers
        const clientIds = Array.from(this.consumers.keys());
        for (const clientId of clientIds) {
            await this.destroyClientConsumer(clientId);
        }

        console.log('[STREAM] StreamManager shutdown complete');
    }
}