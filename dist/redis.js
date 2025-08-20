import { createClient } from 'redis';
import { RedisKeys } from './redis_keys.js';
export class RedisManager {
    client;
    publisher;
    subscriber;
    constructor(redisUrl) {
        this.client = createClient({ url: redisUrl });
        this.publisher = createClient({ url: redisUrl });
        this.subscriber = createClient({ url: redisUrl });
        this.setupErrorHandlers();
    }
    setupErrorHandlers() {
        this.client.on('error', (err) => console.error('[REDIS] Client Error:', err));
        this.publisher.on('error', (err) => console.error('[REDIS] Publisher Error:', err));
        this.subscriber.on('error', (err) => console.error('[REDIS] Subscriber Error:', err));
        this.client.on('connect', () => console.log('[REDIS] Client connected'));
        this.publisher.on('connect', () => console.log('[REDIS] Publisher connected'));
        this.subscriber.on('connect', () => console.log('[REDIS] Subscriber connected'));
    }
    async connect() {
        console.log('[REDIS] Connecting to Redis...');
        await Promise.all([
            this.client.connect(),
            this.publisher.connect(),
            this.subscriber.connect()
        ]);
        console.log('[REDIS] All Redis connections established');
    }
    async disconnect() {
        await Promise.all([
            this.client.disconnect(),
            this.publisher.disconnect(),
            this.subscriber.disconnect()
        ]);
    }
    async publishMessage(channel, message) {
        const messageStr = JSON.stringify(message);
        console.log(`[REDIS] Publishing to channel ${channel}:`, messageStr);
        const result = await this.publisher.publish(channel, messageStr);
        console.log(`[REDIS] Message published to ${channel}, ${result} subscribers received it`);
    }
    async subscribeToChannel(channel, callback) {
        console.log(`[REDIS] Subscribing to channel: ${channel}`);
        const wrappedCallback = (message, channel) => {
            console.log(`[REDIS] Received message on channel ${channel}:`, message);
            callback(message);
        };
        if (channel.includes('*')) {
            await this.subscriber.pSubscribe(channel, wrappedCallback);
            console.log(`[REDIS] Successfully pattern subscribed to channel: ${channel}`);
        }
        else {
            await this.subscriber.subscribe(channel, wrappedCallback);
            console.log(`[REDIS] Successfully subscribed to channel: ${channel}`);
        }
    }
    async unsubscribeFromChannel(channel) {
        if (channel.includes('*')) {
            await this.subscriber.pUnsubscribe(channel);
        }
        else {
            await this.subscriber.unsubscribe(channel);
        }
    }
    async storeMessage(messageId, message, ttl = 3600) {
        const key = RedisKeys.message(messageId);
        const messageStr = JSON.stringify(message);
        console.log(`[REDIS] Storing message with key ${key} (TTL: ${ttl}s):`, messageStr);
        await this.client.setEx(key, ttl, messageStr);
        console.log(`[REDIS] Message ${messageId} stored successfully`);
    }
    async getMessage(messageId) {
        const message = await this.client.get(RedisKeys.message(messageId));
        return message ? JSON.parse(message) : null;
    }
    async storeClientSubscriptions(clientId, subscriptions) {
        const key = RedisKeys.clientSubscriptions(clientId);
        console.log(`[REDIS] Storing subscriptions for client ${clientId}:`, subscriptions);
        await this.client.del(key);
        if (subscriptions.length > 0) {
            await this.client.sAdd(key, subscriptions);
            await this.client.expire(key, 3600);
            console.log(`[REDIS] Stored ${subscriptions.length} subscriptions for client ${clientId}`);
        }
        else {
            console.log(`[REDIS] Cleared subscriptions for client ${clientId} (no subscriptions)`);
        }
    }
    async getClientSubscriptions(clientId) {
        const key = RedisKeys.clientSubscriptions(clientId);
        console.log(`[REDIS] Retrieving subscriptions for client ${clientId}`);
        const subscriptions = await this.client.sMembers(key);
        console.log(`[REDIS] Retrieved ${subscriptions.length} subscriptions for client ${clientId}:`, subscriptions);
        return subscriptions;
    }
    async removeClientSubscriptions(clientId) {
        await this.client.del(RedisKeys.clientSubscriptions(clientId));
    }
    async incrementCounter(key, ttl = 3600) {
        const count = await this.client.incr(key);
        if (count === 1) {
            await this.client.expire(key, ttl);
        }
        return count;
    }
    async getCounter(key) {
        const count = await this.client.get(key);
        return count ? parseInt(count, 10) : 0;
    }
    getClient() {
        return this.client;
    }
}
//# sourceMappingURL=redis.js.map