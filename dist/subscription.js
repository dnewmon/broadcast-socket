export class SubscriptionManager {
    channelSubscriptions = new Map();
    sessionSubscriptions = new Map();
    redis;
    constructor(redis) {
        this.redis = redis;
    }
    async subscribeClient(sessionId, channel) {
        console.log(`[SUBSCRIPTION] Attempting to subscribe session ${sessionId} to channel: ${channel}`);
        if (!this.channelSubscriptions.has(channel)) {
            console.log(`[SUBSCRIPTION] Creating new channel: ${channel}`);
            this.channelSubscriptions.set(channel, new Set());
        }
        if (!this.sessionSubscriptions.has(sessionId)) {
            console.log(`[SUBSCRIPTION] Creating subscription set for new session: ${sessionId}`);
            this.sessionSubscriptions.set(sessionId, new Set());
        }
        const channelSubscribers = this.channelSubscriptions.get(channel);
        const sessionChannels = this.sessionSubscriptions.get(sessionId);
        if (channelSubscribers.has(sessionId)) {
            console.log(`[SUBSCRIPTION] Session ${sessionId} already subscribed to channel: ${channel}`);
            return false;
        }
        channelSubscribers.add(sessionId);
        sessionChannels.add(channel);
        console.log(`[SUBSCRIPTION] Successfully subscribed session ${sessionId} to channel: ${channel}`);
        console.log(`[SUBSCRIPTION] Channel ${channel} now has ${channelSubscribers.size} subscribers: [${Array.from(channelSubscribers).join(', ')}]`);
        console.log(`[SUBSCRIPTION] Session ${sessionId} now subscribed to ${sessionChannels.size} channels: [${Array.from(sessionChannels).join(', ')}]`);
        await this.persistSessionSubscriptions(sessionId);
        return true;
    }
    async unsubscribeClient(sessionId, channel) {
        console.log(`[SUBSCRIPTION] Attempting to unsubscribe session ${sessionId} from channel: ${channel}`);
        const channelSubscribers = this.channelSubscriptions.get(channel);
        const sessionChannels = this.sessionSubscriptions.get(sessionId);
        if (!channelSubscribers || !sessionChannels) {
            console.log(`[SUBSCRIPTION] Unsubscribe failed: channel or session not found`);
            return false;
        }
        if (!channelSubscribers.has(sessionId)) {
            console.log(`[SUBSCRIPTION] Session ${sessionId} was not subscribed to channel: ${channel}`);
            return false;
        }
        channelSubscribers.delete(sessionId);
        sessionChannels.delete(channel);
        console.log(`[SUBSCRIPTION] Successfully unsubscribed session ${sessionId} from channel: ${channel}`);
        if (channelSubscribers.size === 0) {
            console.log(`[SUBSCRIPTION] Channel ${channel} has no more subscribers, removing`);
            this.channelSubscriptions.delete(channel);
        }
        if (sessionChannels.size === 0) {
            console.log(`[SUBSCRIPTION] Session ${sessionId} has no more subscriptions, removing`);
            this.sessionSubscriptions.delete(sessionId);
            await this.redis.removeClientSubscriptions(sessionId);
        }
        else {
            await this.persistSessionSubscriptions(sessionId);
        }
        return true;
    }
    async unsubscribeClientFromAll(sessionId) {
        console.log(`[SUBSCRIPTION] Unsubscribing session ${sessionId} from all channels`);
        const sessionChannels = this.sessionSubscriptions.get(sessionId);
        if (!sessionChannels) {
            console.log(`[SUBSCRIPTION] Session ${sessionId} has no subscriptions to remove`);
            return [];
        }
        const unsubscribedChannels = Array.from(sessionChannels);
        console.log(`[SUBSCRIPTION] Removing session ${sessionId} from ${unsubscribedChannels.length} channels: [${unsubscribedChannels.join(', ')}]`);
        for (const channel of sessionChannels) {
            const channelSubscribers = this.channelSubscriptions.get(channel);
            if (channelSubscribers) {
                channelSubscribers.delete(sessionId);
                if (channelSubscribers.size === 0) {
                    console.log(`[SUBSCRIPTION] Channel ${channel} now empty, removing`);
                    this.channelSubscriptions.delete(channel);
                }
            }
        }
        this.sessionSubscriptions.delete(sessionId);
        await this.redis.removeClientSubscriptions(sessionId);
        console.log(`[SUBSCRIPTION] Successfully unsubscribed session ${sessionId} from all channels`);
        return unsubscribedChannels;
    }
    getChannelSubscribers(channel) {
        const subscribers = this.channelSubscriptions.get(channel);
        const result = subscribers ? Array.from(subscribers) : [];
        console.log(`[SUBSCRIPTION] Channel ${channel} has ${result.length} subscribers: [${result.join(', ')}]`);
        return result;
    }
    getSessionSubscriptions(sessionId) {
        const subscriptions = this.sessionSubscriptions.get(sessionId);
        return subscriptions ? Array.from(subscriptions) : [];
    }
    isSessionSubscribed(sessionId, channel) {
        const sessionChannels = this.sessionSubscriptions.get(sessionId);
        return sessionChannels ? sessionChannels.has(channel) : false;
    }
    getAllChannels() {
        return Array.from(this.channelSubscriptions.keys());
    }
    getChannelCount() {
        return this.channelSubscriptions.size;
    }
    getTotalSubscriptions() {
        let total = 0;
        for (const subscribers of this.channelSubscriptions.values()) {
            total += subscribers.size;
        }
        return total;
    }
    getChannelStats() {
        const stats = {};
        for (const [channel, subscribers] of this.channelSubscriptions.entries()) {
            stats[channel] = subscribers.size;
        }
        return stats;
    }
    async restoreClientSubscriptions(sessionId) {
        try {
            const storedSubscriptions = await this.redis.getClientSubscriptions(sessionId);
            if (Array.isArray(storedSubscriptions)) {
                for (const channel of storedSubscriptions) {
                    await this.subscribeClient(sessionId, channel);
                }
                return storedSubscriptions;
            }
            return [];
        }
        catch (error) {
            console.error(`Error restoring subscriptions for session ${sessionId}:`, error);
            return [];
        }
    }
    async persistSessionSubscriptions(sessionId) {
        const subscriptions = this.getSessionSubscriptions(sessionId);
        await this.redis.storeClientSubscriptions(sessionId, subscriptions);
    }
    exportState() {
        const states = [];
        for (const [sessionId, channels] of this.sessionSubscriptions.entries()) {
            states.push({
                clientId: sessionId,
                channels: Array.from(channels),
                lastActivity: Date.now()
            });
        }
        return states;
    }
    async importState(states) {
        for (const state of states) {
            for (const channel of state.channels) {
                await this.subscribeClient(state.clientId, channel);
            }
        }
    }
}
//# sourceMappingURL=subscription.js.map