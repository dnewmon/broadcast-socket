import { RedisClientType } from 'redis';
export declare class RedisManager {
    private client;
    private publisher;
    private subscriber;
    constructor(redisUrl: string);
    private setupErrorHandlers;
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    publishMessage(channel: string, message: any): Promise<void>;
    subscribeToChannel(channel: string, callback: (message: string) => void): Promise<void>;
    unsubscribeFromChannel(channel: string): Promise<void>;
    storeMessage(messageId: string, message: any, ttl?: number): Promise<void>;
    getMessage(messageId: string): Promise<any | null>;
    storeClientSubscriptions(clientId: string, subscriptions: string[]): Promise<void>;
    getClientSubscriptions(clientId: string): Promise<string[]>;
    removeClientSubscriptions(clientId: string): Promise<void>;
    incrementCounter(key: string, ttl?: number): Promise<number>;
    getCounter(key: string): Promise<number>;
    getClient(): RedisClientType;
}
//# sourceMappingURL=redis.d.ts.map