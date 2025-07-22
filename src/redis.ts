import { createClient, RedisClientType } from 'redis';
import { RedisDataKeys } from './RedisDataKeys.js';

export class RedisManager {
    private client: RedisClientType;
    private publisher: RedisClientType;
    private subscriber: RedisClientType;

    constructor(redisUrl: string) {
        this.client = createClient({ url: redisUrl });
        this.publisher = createClient({ url: redisUrl });
        this.subscriber = createClient({ url: redisUrl });

        this.setupErrorHandlers();
    }

    private setupErrorHandlers(): void {
        this.client.on('error', (err) => console.error('[REDIS] Client Error:', err));
        this.publisher.on('error', (err) => console.error('[REDIS] Publisher Error:', err));
        this.subscriber.on('error', (err) => console.error('[REDIS] Subscriber Error:', err));

        this.client.on('connect', () => console.log('[REDIS] Client connected'));
        this.publisher.on('connect', () => console.log('[REDIS] Publisher connected'));
        this.subscriber.on('connect', () => console.log('[REDIS] Subscriber connected'));
    }

    async connect(): Promise<void> {
        console.log('[REDIS] Connecting to Redis...');
        await Promise.all([this.client.connect(), this.publisher.connect(), this.subscriber.connect()]);
        console.log('[REDIS] All Redis connections established');
    }

    async disconnect(): Promise<void> {
        await Promise.all([this.client.close(), this.publisher.close(), this.subscriber.close()]);
    }

    async publishMessage(channel: string, message: unknown): Promise<void> {
        const messageStr = JSON.stringify(message);
        console.log(`[REDIS] Publishing to channel ${channel}:`, messageStr);
        const result = await this.publisher.publish(channel, messageStr);
        console.log(`[REDIS] Message published to ${channel}, ${result} subscribers received it`);
    }

    async subscribeToChannel(channel: string, callback: (message: string) => void): Promise<void> {
        console.log(`[REDIS] Subscribing to channel: ${channel}`);

        const wrappedCallback = (message: string, channel: string) => {
            console.log(`[REDIS] Received message on channel ${channel}:`, message);
            callback(message);
        };

        // Use pattern subscribe for wildcard channels
        if (channel.includes('*')) {
            await this.subscriber.pSubscribe(channel, wrappedCallback);
            console.log(`[REDIS] Successfully pattern subscribed to channel: ${channel}`);
        } else {
            await this.subscriber.subscribe(channel, wrappedCallback);
            console.log(`[REDIS] Successfully subscribed to channel: ${channel}`);
        }
    }

    async unsubscribeFromChannel(channel: string): Promise<void> {
        if (channel.includes('*')) {
            await this.subscriber.pUnsubscribe(channel);
        } else {
            await this.subscriber.unsubscribe(channel);
        }
    }

    async storeMessage(messageId: string, message: unknown, ttl: number = 3600): Promise<void> {
        const key = RedisDataKeys.message(messageId);
        const messageStr = JSON.stringify(message);
        console.log(`[REDIS] Storing message with key ${key} (TTL: ${ttl}s):`, messageStr);
        await this.client.setEx(key, ttl, messageStr);
        console.log(`[REDIS] Message ${messageId} stored successfully`);
    }

    async getMessage(messageId: string): Promise<unknown | null> {
        const message = await this.client.get(RedisDataKeys.message(messageId));
        return message ? JSON.parse(message) : null;
    }

    async storeClientSubscriptions(clientId: string, subscriptions: string[]): Promise<void> {
        const key = RedisDataKeys.clientSubscriptions(clientId);
        console.log(`[REDIS] Storing subscriptions for client ${clientId}:`, subscriptions);

        await this.client.del(key);
        if (subscriptions.length > 0) {
            await this.client.sAdd(key, subscriptions);
            await this.client.expire(key, RedisDataKeys.CLIENT_SUBSCRIPTIONS_TTL);
            console.log(`[REDIS] Stored ${subscriptions.length} subscriptions for client ${clientId}`);
        } else {
            console.log(`[REDIS] Cleared subscriptions for client ${clientId} (no subscriptions)`);
        }
    }

    async getClientSubscriptions(clientId: string): Promise<string[]> {
        const key = RedisDataKeys.clientSubscriptions(clientId);
        console.log(`[REDIS] Retrieving subscriptions for client ${clientId}`);
        const subscriptions = await this.client.sMembers(key);
        console.log(`[REDIS] Retrieved ${subscriptions.length} subscriptions for client ${clientId}:`, subscriptions);
        return subscriptions;
    }

    async removeClientSubscriptions(clientId: string): Promise<void> {
        await this.client.del(RedisDataKeys.clientSubscriptions(clientId));
    }

    async incrementCounter(key: string, ttl: number = RedisDataKeys.COUNTER_TTL): Promise<number> {
        const count = await this.client.incr(key);
        if (count === 1) {
            await this.client.expire(key, ttl);
        }
        return count;
    }

    async getCounter(key: string): Promise<number> {
        const count = await this.client.get(key);
        return count ? parseInt(count, 10) : 0;
    }

    getClient(): RedisClientType {
        return this.client;
    }

    // Redis Streams operations for message broadcasting
    async addToStream(streamKey: string, data: Record<string, string>, maxLength: number = RedisDataKeys.STREAM_MAX_LENGTH): Promise<string> {
        const options: any = {};
        if (maxLength) {
            options.TRIM = { strategy: 'MAXLEN', strategyModifier: '~', threshold: maxLength };
        }
        
        console.log(`[REDIS] Adding to stream ${streamKey}:`, data);
        const messageId = await this.client.xAdd(streamKey, '*', data, options);
        console.log(`[REDIS] Message added to stream ${streamKey} with ID: ${messageId}`);
        
        // Set TTL of 1 hour on the stream
        await this.client.expire(streamKey, RedisDataKeys.STREAM_TTL);
        return messageId;
    }

    async createConsumerGroup(streamKey: string, groupName: string, startId: string = '$'): Promise<void> {
        try {
            console.log(`[REDIS] Creating consumer group ${groupName} for stream ${streamKey} starting from ${startId}`);
            await this.client.xGroupCreate(streamKey, groupName, startId, { MKSTREAM: true });
            console.log(`[REDIS] Consumer group ${groupName} created successfully`);
        } catch (error: any) {
            if (error.message?.includes('BUSYGROUP')) {
                console.log(`[REDIS] Consumer group ${groupName} already exists`);
            } else {
                throw error;
            }
        }
    }

    async deleteConsumerGroup(streamKey: string, groupName: string): Promise<void> {
        try {
            console.log(`[REDIS] Deleting consumer group ${groupName} from stream ${streamKey}`);
            await this.client.xGroupDestroy(streamKey, groupName);
            console.log(`[REDIS] Consumer group ${groupName} deleted successfully`);
        } catch (error: any) {
            if (!error.message?.includes('NOGROUP')) {
                console.error(`[REDIS] Error deleting consumer group ${groupName}:`, error);
            }
        }
    }

    async readFromConsumerGroup(
        streamKey: string, 
        groupName: string, 
        consumerName: string, 
        count?: number,
        blockTime?: number
    ): Promise<any[]> {
        const options: any = {};
        if (count) options.COUNT = count;
        if (blockTime !== undefined) options.BLOCK = blockTime;

        console.log(`[REDIS] Reading from consumer group ${groupName} as consumer ${consumerName}`);
        
        const result = await this.client.xReadGroup(
            groupName,
            consumerName,
            [{ key: streamKey, id: '>' }],
            options
        );

        console.log(`[REDIS] Read ${result?.length || 0} messages from consumer group`);
        return result || [];
    }

    async readPendingMessages(
        streamKey: string, 
        groupName: string, 
        consumerName: string,
        count?: number
    ): Promise<any[]> {
        try {
            console.log(`[REDIS] Reading pending messages for consumer ${consumerName} in group ${groupName}`);
            
            // First get the pending list for this consumer
            const pendingInfo = await this.client.xPending(streamKey, groupName);
            
            if (!pendingInfo || pendingInfo.pending === 0) {
                console.log(`[REDIS] No pending messages for consumer ${consumerName}`);
                return [];
            }

            console.log(`[REDIS] Found ${pendingInfo.pending} pending messages for consumer ${consumerName}`);

            const result = await this.client.xReadGroup(
                groupName,
                consumerName,
                [{ key: streamKey, id: '0' }], // Read from beginning to get pending messages
                { COUNT: count || RedisDataKeys.STREAM_BATCH_SIZE }
            );

            return result || [];
        } catch (error) {
            console.error(`[REDIS] Error reading pending messages:`, error);
            return [];
        }
    }

    async acknowledgeMessage(streamKey: string, groupName: string, messageId: string): Promise<number> {
        console.log(`[REDIS] Acknowledging message ${messageId} in group ${groupName} for stream ${streamKey}`);
        const result = await this.client.xAck(streamKey, groupName, messageId);
        console.log(`[REDIS] Acknowledged ${result} message(s)`);
        return result;
    }

    async claimMessages(
        streamKey: string, 
        groupName: string, 
        consumerName: string, 
        minIdleTime: number,
        messageIds: string[]
    ): Promise<any[]> {
        if (messageIds.length === 0) return [];
        
        console.log(`[REDIS] Claiming ${messageIds.length} messages older than ${minIdleTime}ms for consumer ${consumerName}`);
        const result = await this.client.xClaim(streamKey, groupName, consumerName, minIdleTime, messageIds);
        console.log(`[REDIS] Claimed ${result?.length || 0} messages`);
        return result || [];
    }

    async getStreamInfo(streamKey: string): Promise<any> {
        try {
            return await this.client.xInfoStream(streamKey);
        } catch (error: any) {
            if (error.message?.includes('no such key')) {
                return null;
            }
            throw error;
        }
    }

    async getStreamLength(streamKey: string): Promise<number> {
        try {
            return await this.client.xLen(streamKey);
        } catch (error: any) {
            if (error.message?.includes('no such key')) {
                return 0;
            }
            throw error;
        }
    }

    async deleteOldMessages(streamKey: string, maxAgeMs: number): Promise<number> {
        const cutoffTime = Date.now() - maxAgeMs;
        const cutoffId = `${cutoffTime}-0`;
        
        console.log(`[REDIS] Deleting messages older than ${cutoffId} from stream ${streamKey}`);
        try {
            // Use XTRIM with MINID to delete old messages
            const result = await this.client.sendCommand(['XTRIM', streamKey, 'MINID', cutoffId]) as number;
            console.log(`[REDIS] Trimmed ${result} old messages from stream ${streamKey}`);
            return result;
        } catch (error) {
            console.error(`[REDIS] Error trimming old messages from stream ${streamKey}:`, error);
            return 0;
        }
    }
}
