import { BroadcastMessage, Client } from './types.js';
import { RedisManager } from './redis.js';
import { SubscriptionManager } from './subscription.js';
export declare class BroadcastManager {
    private redis;
    private subscriptionManager;
    private clients;
    private messageQueue;
    private deduplicationCache;
    constructor(redis: RedisManager, subscriptionManager: SubscriptionManager, clients: Map<string, Client>);
    private setupRedisSubscriptions;
    broadcastToChannel(channel: string, data: unknown, senderId?: string): Promise<string>;
    broadcastToAll(data: unknown, senderId?: string): Promise<string>;
    private handleIncomingBroadcast;
    private deliverToChannelSubscribers;
    private deliverToAllClients;
    private deliverToClient;
    private sendAcknowledgment;
    private queueMessageForSession;
    deliverQueuedMessagesForSession(sessionId: string): Promise<void>;
    deliverQueuedMessages(clientId: string): Promise<void>;
    retryFailedDeliveries(): Promise<void>;
    getQueuedMessageCountForSession(sessionId: string): number;
    getQueuedMessageCount(clientId: string): number;
    getTotalQueuedMessages(): number;
    clearSessionQueue(sessionId: string): void;
    clearClientQueue(clientId: string): void;
    getMessageHistory(channel: string, limit?: number): Promise<BroadcastMessage[]>;
}
//# sourceMappingURL=broadcast.d.ts.map