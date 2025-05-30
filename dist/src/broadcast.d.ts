import { BroadcastMessage, Client } from './types';
import { RedisManager } from './redis';
import { SubscriptionManager } from './subscription';
export declare class BroadcastManager {
    private redis;
    private subscriptionManager;
    private clients;
    private messageQueue;
    private deduplicationCache;
    constructor(redis: RedisManager, subscriptionManager: SubscriptionManager, clients: Map<string, Client>);
    private setupRedisSubscriptions;
    broadcastToChannel(channel: string, data: any, senderId?: string): Promise<string>;
    broadcastToAll(data: any, senderId?: string): Promise<string>;
    private handleIncomingBroadcast;
    private deliverToChannelSubscribers;
    private deliverToAllClients;
    private deliverToClient;
    private sendAcknowledgment;
    private queueMessage;
    deliverQueuedMessages(clientId: string): Promise<void>;
    retryFailedDeliveries(): Promise<void>;
    getQueuedMessageCount(clientId: string): number;
    getTotalQueuedMessages(): number;
    clearClientQueue(clientId: string): void;
    getMessageHistory(channel: string, limit?: number): Promise<BroadcastMessage[]>;
}
//# sourceMappingURL=broadcast.d.ts.map