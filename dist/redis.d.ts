import { RedisClientType } from 'redis';
export declare class RedisManager {
    private client;
    private publisher;
    private subscriber;
    constructor(redisUrl: string);
    private setupErrorHandlers;
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    publishMessage(channel: string, message: unknown): Promise<void>;
    subscribeToChannel(channel: string, callback: (message: string) => void): Promise<void>;
    unsubscribeFromChannel(channel: string): Promise<void>;
    storeMessage(messageId: string, message: unknown, ttl?: number): Promise<void>;
    getMessage(messageId: string): Promise<unknown | null>;
    storeClientSubscriptions(clientId: string, subscriptions: string[]): Promise<void>;
    getClientSubscriptions(clientId: string): Promise<string[]>;
    removeClientSubscriptions(clientId: string): Promise<void>;
    incrementCounter(key: string, ttl?: number): Promise<number>;
    getCounter(key: string): Promise<number>;
    getClient(): RedisClientType;
    addToStream(streamKey: string, data: Record<string, string>, maxLength?: number): Promise<string>;
    createConsumerGroup(streamKey: string, groupName: string, startId?: string): Promise<void>;
    deleteConsumerGroup(streamKey: string, groupName: string): Promise<void>;
    readFromConsumerGroup(streamKey: string, groupName: string, consumerName: string, count?: number, blockTime?: number): Promise<any[]>;
    readPendingMessages(streamKey: string, groupName: string, consumerName: string, count?: number): Promise<any[]>;
    acknowledgeMessage(streamKey: string, groupName: string, messageId: string): Promise<number>;
    claimMessages(streamKey: string, groupName: string, consumerName: string, minIdleTime: number, messageIds: string[]): Promise<any[]>;
    getStreamInfo(streamKey: string): Promise<any>;
    getStreamLength(streamKey: string): Promise<number>;
    deleteOldMessages(streamKey: string, maxAgeMs: number): Promise<number>;
}
//# sourceMappingURL=redis.d.ts.map