import { SubscriptionState } from './types.js';
import { RedisManager } from './redis.js';
export declare class SubscriptionManager {
    private subscriptions;
    private clientSubscriptions;
    private redis;
    constructor(redis: RedisManager);
    subscribeClient(clientId: string, channel: string): Promise<boolean>;
    unsubscribeClient(clientId: string, channel: string): Promise<boolean>;
    unsubscribeClientFromAll(clientId: string): Promise<string[]>;
    getChannelSubscribers(channel: string): string[];
    getClientSubscriptions(clientId: string): string[];
    isClientSubscribed(clientId: string, channel: string): boolean;
    getAllChannels(): string[];
    getChannelCount(): number;
    getTotalSubscriptions(): number;
    getChannelStats(): Record<string, number>;
    restoreClientSubscriptions(clientId: string): Promise<string[]>;
    private persistClientSubscriptions;
    exportState(): SubscriptionState[];
    importState(states: SubscriptionState[]): Promise<void>;
}
//# sourceMappingURL=subscription.d.ts.map