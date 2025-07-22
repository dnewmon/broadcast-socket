import { BroadcastMessage, Client } from './types.js';
import { RedisManager } from './redis.js';
import { SubscriptionManager } from './subscription.js';
import { StreamManager } from './stream.js';
export declare class BroadcastManager {
    private redis;
    private subscriptionManager;
    private streamManager;
    private clients;
    private deduplicationCache;
    private messagePollingInterval;
    constructor(redis: RedisManager, subscriptionManager: SubscriptionManager, clients: Map<string, Client>);
    private startMessagePolling;
    private pollAndDeliverMessages;
    broadcastToChannel(channel: string, data: unknown, senderId?: string): Promise<string>;
    broadcastToAll(data: unknown, senderId?: string): Promise<string>;
    private deliverStreamMessageToClient;
    private sendAcknowledgment;
    handleClientAcknowledgment(clientId: string, messageId: string): Promise<void>;
    initializeClientStreams(clientId: string): Promise<void>;
    updateClientStreams(clientId: string): Promise<void>;
    cleanupClientStreams(clientId: string): Promise<void>;
    getPendingMessageCount(clientId: string): number;
    getTotalPendingMessages(): number;
    getMessageHistory(channel: string, limit?: number): Promise<BroadcastMessage[]>;
    shutdown(): Promise<void>;
    getStreamManager(): StreamManager;
}
//# sourceMappingURL=broadcast.d.ts.map