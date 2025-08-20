import { SubscriptionState } from './types.js';
import { RedisManager } from './redis.js';
export declare class SubscriptionManager {
    private channelSubscriptions;
    private sessionSubscriptions;
    private redis;
    constructor(redis: RedisManager);
    subscribeClient(sessionId: string, channel: string): Promise<boolean>;
    unsubscribeClient(sessionId: string, channel: string): Promise<boolean>;
    unsubscribeClientFromAll(sessionId: string): Promise<string[]>;
    getChannelSubscribers(channel: string): string[];
    getSessionSubscriptions(sessionId: string): string[];
    isSessionSubscribed(sessionId: string, channel: string): boolean;
    getAllChannels(): string[];
    getChannelCount(): number;
    getTotalSubscriptions(): number;
    getChannelStats(): Record<string, number>;
    restoreClientSubscriptions(sessionId: string): Promise<string[]>;
    private persistSessionSubscriptions;
    exportState(): SubscriptionState[];
    importState(states: SubscriptionState[]): Promise<void>;
}
//# sourceMappingURL=subscription.d.ts.map