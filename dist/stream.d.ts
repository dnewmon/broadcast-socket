import { RedisManager } from './redis.js';
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
export declare class StreamManager {
    private redis;
    private consumers;
    private cleanupInterval;
    private readonly workerId;
    constructor(redis: RedisManager, workerId?: string);
    createClientConsumer(clientId: string, subscribedChannels: string[]): Promise<ConsumerInfo>;
    updateClientChannels(clientId: string, newChannels: string[]): Promise<void>;
    destroyClientConsumer(clientId: string): Promise<void>;
    publishMessage(channel: string, broadcastMessage: BroadcastMessage): Promise<string>;
    readMessagesForClient(clientId: string, maxCount?: number): Promise<StreamMessage[]>;
    readPendingMessagesForClient(clientId: string): Promise<StreamMessage[]>;
    readNewMessagesForClient(clientId: string, maxCount: number): Promise<StreamMessage[]>;
    acknowledgeMessage(clientId: string, streamKey: string, messageId: string): Promise<void>;
    private parseStreamMessage;
    private extractTimestampFromStreamId;
    private startCleanupTimer;
    private cleanupOldMessages;
    getConsumerInfo(clientId: string): ConsumerInfo | undefined;
    getAllConsumers(): ConsumerInfo[];
    shutdown(): Promise<void>;
}
//# sourceMappingURL=stream.d.ts.map