"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubscriptionManager = void 0;
class SubscriptionManager {
    constructor(redis) {
        this.subscriptions = new Map();
        this.clientSubscriptions = new Map();
        this.redis = redis;
    }
    async subscribeClient(clientId, channel) {
        if (!this.subscriptions.has(channel)) {
            this.subscriptions.set(channel, new Set());
        }
        if (!this.clientSubscriptions.has(clientId)) {
            this.clientSubscriptions.set(clientId, new Set());
        }
        const channelSubscribers = this.subscriptions.get(channel);
        const clientChannels = this.clientSubscriptions.get(clientId);
        if (channelSubscribers.has(clientId)) {
            return false;
        }
        channelSubscribers.add(clientId);
        clientChannels.add(channel);
        await this.persistClientSubscriptions(clientId);
        return true;
    }
    async unsubscribeClient(clientId, channel) {
        const channelSubscribers = this.subscriptions.get(channel);
        const clientChannels = this.clientSubscriptions.get(clientId);
        if (!channelSubscribers || !clientChannels) {
            return false;
        }
        if (!channelSubscribers.has(clientId)) {
            return false;
        }
        channelSubscribers.delete(clientId);
        clientChannels.delete(channel);
        if (channelSubscribers.size === 0) {
            this.subscriptions.delete(channel);
        }
        if (clientChannels.size === 0) {
            this.clientSubscriptions.delete(clientId);
            await this.redis.removeClientSubscriptions(clientId);
        }
        else {
            await this.persistClientSubscriptions(clientId);
        }
        return true;
    }
    async unsubscribeClientFromAll(clientId) {
        const clientChannels = this.clientSubscriptions.get(clientId);
        if (!clientChannels) {
            return [];
        }
        const unsubscribedChannels = Array.from(clientChannels);
        for (const channel of clientChannels) {
            const channelSubscribers = this.subscriptions.get(channel);
            if (channelSubscribers) {
                channelSubscribers.delete(clientId);
                if (channelSubscribers.size === 0) {
                    this.subscriptions.delete(channel);
                }
            }
        }
        this.clientSubscriptions.delete(clientId);
        await this.redis.removeClientSubscriptions(clientId);
        return unsubscribedChannels;
    }
    getChannelSubscribers(channel) {
        const subscribers = this.subscriptions.get(channel);
        return subscribers ? Array.from(subscribers) : [];
    }
    getClientSubscriptions(clientId) {
        const subscriptions = this.clientSubscriptions.get(clientId);
        return subscriptions ? Array.from(subscriptions) : [];
    }
    isClientSubscribed(clientId, channel) {
        const clientChannels = this.clientSubscriptions.get(clientId);
        return clientChannels ? clientChannels.has(channel) : false;
    }
    getAllChannels() {
        return Array.from(this.subscriptions.keys());
    }
    getChannelCount() {
        return this.subscriptions.size;
    }
    getTotalSubscriptions() {
        let total = 0;
        for (const subscribers of this.subscriptions.values()) {
            total += subscribers.size;
        }
        return total;
    }
    getChannelStats() {
        const stats = {};
        for (const [channel, subscribers] of this.subscriptions.entries()) {
            stats[channel] = subscribers.size;
        }
        return stats;
    }
    async restoreClientSubscriptions(clientId) {
        try {
            const storedSubscriptions = await this.redis.getClientSubscriptions(clientId);
            for (const channel of storedSubscriptions) {
                await this.subscribeClient(clientId, channel);
            }
            return storedSubscriptions;
        }
        catch (error) {
            console.error(`Error restoring subscriptions for client ${clientId}:`, error);
            return [];
        }
    }
    async persistClientSubscriptions(clientId) {
        const subscriptions = this.getClientSubscriptions(clientId);
        await this.redis.storeClientSubscriptions(clientId, subscriptions);
    }
    exportState() {
        const states = [];
        for (const [clientId, channels] of this.clientSubscriptions.entries()) {
            states.push({
                clientId,
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
exports.SubscriptionManager = SubscriptionManager;
//# sourceMappingURL=subscription.js.map