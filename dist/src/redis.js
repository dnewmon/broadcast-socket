"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisManager = void 0;
const redis_1 = require("redis");
class RedisManager {
    constructor(redisUrl) {
        this.client = (0, redis_1.createClient)({ url: redisUrl });
        this.publisher = (0, redis_1.createClient)({ url: redisUrl });
        this.subscriber = (0, redis_1.createClient)({ url: redisUrl });
        this.setupErrorHandlers();
    }
    setupErrorHandlers() {
        this.client.on('error', (err) => console.error('Redis Client Error:', err));
        this.publisher.on('error', (err) => console.error('Redis Publisher Error:', err));
        this.subscriber.on('error', (err) => console.error('Redis Subscriber Error:', err));
    }
    async connect() {
        await Promise.all([
            this.client.connect(),
            this.publisher.connect(),
            this.subscriber.connect()
        ]);
    }
    async disconnect() {
        await Promise.all([
            this.client.disconnect(),
            this.publisher.disconnect(),
            this.subscriber.disconnect()
        ]);
    }
    async publishMessage(channel, message) {
        await this.publisher.publish(channel, JSON.stringify(message));
    }
    async subscribeToChannel(channel, callback) {
        await this.subscriber.subscribe(channel, callback);
    }
    async unsubscribeFromChannel(channel) {
        await this.subscriber.unsubscribe(channel);
    }
    async storeMessage(messageId, message, ttl = 3600) {
        await this.client.setEx(`message:${messageId}`, ttl, JSON.stringify(message));
    }
    async getMessage(messageId) {
        const message = await this.client.get(`message:${messageId}`);
        return message ? JSON.parse(message) : null;
    }
    async storeClientSubscriptions(clientId, subscriptions) {
        const key = `client:${clientId}:subscriptions`;
        await this.client.del(key);
        if (subscriptions.length > 0) {
            await this.client.sAdd(key, subscriptions);
            await this.client.expire(key, 3600);
        }
    }
    async getClientSubscriptions(clientId) {
        const key = `client:${clientId}:subscriptions`;
        return await this.client.sMembers(key);
    }
    async removeClientSubscriptions(clientId) {
        await this.client.del(`client:${clientId}:subscriptions`);
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
exports.RedisManager = RedisManager;
//# sourceMappingURL=redis.js.map