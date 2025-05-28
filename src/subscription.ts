import { SubscriptionState } from './types';
import { RedisManager } from './redis';

export class SubscriptionManager {
  private subscriptions: Map<string, Set<string>> = new Map();
  private clientSubscriptions: Map<string, Set<string>> = new Map();
  private redis: RedisManager;

  constructor(redis: RedisManager) {
    this.redis = redis;
  }

  async subscribeClient(clientId: string, channel: string): Promise<boolean> {
    if (!this.subscriptions.has(channel)) {
      this.subscriptions.set(channel, new Set());
    }

    if (!this.clientSubscriptions.has(clientId)) {
      this.clientSubscriptions.set(clientId, new Set());
    }

    const channelSubscribers = this.subscriptions.get(channel)!;
    const clientChannels = this.clientSubscriptions.get(clientId)!;

    if (channelSubscribers.has(clientId)) {
      return false;
    }

    channelSubscribers.add(clientId);
    clientChannels.add(channel);

    await this.persistClientSubscriptions(clientId);
    return true;
  }

  async unsubscribeClient(clientId: string, channel: string): Promise<boolean> {
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
    } else {
      await this.persistClientSubscriptions(clientId);
    }

    return true;
  }

  async unsubscribeClientFromAll(clientId: string): Promise<string[]> {
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

  getChannelSubscribers(channel: string): string[] {
    const subscribers = this.subscriptions.get(channel);
    return subscribers ? Array.from(subscribers) : [];
  }

  getClientSubscriptions(clientId: string): string[] {
    const subscriptions = this.clientSubscriptions.get(clientId);
    return subscriptions ? Array.from(subscriptions) : [];
  }

  isClientSubscribed(clientId: string, channel: string): boolean {
    const clientChannels = this.clientSubscriptions.get(clientId);
    return clientChannels ? clientChannels.has(channel) : false;
  }

  getAllChannels(): string[] {
    return Array.from(this.subscriptions.keys());
  }

  getChannelCount(): number {
    return this.subscriptions.size;
  }

  getTotalSubscriptions(): number {
    let total = 0;
    for (const subscribers of this.subscriptions.values()) {
      total += subscribers.size;
    }
    return total;
  }

  getChannelStats(): Record<string, number> {
    const stats: Record<string, number> = {};
    for (const [channel, subscribers] of this.subscriptions.entries()) {
      stats[channel] = subscribers.size;
    }
    return stats;
  }

  async restoreClientSubscriptions(clientId: string): Promise<string[]> {
    try {
      const storedSubscriptions = await this.redis.getClientSubscriptions(clientId);
      
      for (const channel of storedSubscriptions) {
        await this.subscribeClient(clientId, channel);
      }

      return storedSubscriptions;
    } catch (error) {
      console.error(`Error restoring subscriptions for client ${clientId}:`, error);
      return [];
    }
  }

  private async persistClientSubscriptions(clientId: string): Promise<void> {
    const subscriptions = this.getClientSubscriptions(clientId);
    await this.redis.storeClientSubscriptions(clientId, subscriptions);
  }

  exportState(): SubscriptionState[] {
    const states: SubscriptionState[] = [];
    
    for (const [clientId, channels] of this.clientSubscriptions.entries()) {
      states.push({
        clientId,
        channels: Array.from(channels),
        lastActivity: Date.now()
      });
    }

    return states;
  }

  async importState(states: SubscriptionState[]): Promise<void> {
    for (const state of states) {
      for (const channel of state.channels) {
        await this.subscribeClient(state.clientId, channel);
      }
    }
  }
}