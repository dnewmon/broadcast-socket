import { SubscriptionState } from './types.js';
import { RedisManager } from './redis.js';

export class SubscriptionManager {
  private channelSubscriptions: Map<string, Set<string>> = new Map();
  private clientSubscriptions: Map<string, Set<string>> = new Map();
  private redis: RedisManager;

  constructor(redis: RedisManager) {
    this.redis = redis;
  }

  async subscribeClient(clientId: string, channel: string): Promise<boolean> {
    console.log(`[SUBSCRIPTION] Attempting to subscribe client ${clientId} to channel: ${channel}`);
    
    if (!this.channelSubscriptions.has(channel)) {
      console.log(`[SUBSCRIPTION] Creating new channel: ${channel}`);
      this.channelSubscriptions.set(channel, new Set());
    }

    if (!this.clientSubscriptions.has(clientId)) {
      console.log(`[SUBSCRIPTION] Creating subscription set for new client: ${clientId}`);
      this.clientSubscriptions.set(clientId, new Set());
    }

    const channelSubscribers = this.channelSubscriptions.get(channel)!;
    const clientChannels = this.clientSubscriptions.get(clientId)!;

    if (channelSubscribers.has(clientId)) {
      console.log(`[SUBSCRIPTION] Client ${clientId} already subscribed to channel: ${channel}`);
      return false;
    }

    channelSubscribers.add(clientId);
    clientChannels.add(channel);

    console.log(`[SUBSCRIPTION] Successfully subscribed client ${clientId} to channel: ${channel}`);
    console.log(`[SUBSCRIPTION] Channel ${channel} now has ${channelSubscribers.size} subscribers: [${Array.from(channelSubscribers).join(', ')}]`);
    console.log(`[SUBSCRIPTION] Client ${clientId} now subscribed to ${clientChannels.size} channels: [${Array.from(clientChannels).join(', ')}]`);

    await this.persistClientSubscriptions(clientId);
    return true;
  }

  async unsubscribeClient(clientId: string, channel: string): Promise<boolean> {
    console.log(`[SUBSCRIPTION] Attempting to unsubscribe client ${clientId} from channel: ${channel}`);
    
    const channelSubscribers = this.channelSubscriptions.get(channel);
    const clientChannels = this.clientSubscriptions.get(clientId);

    if (!channelSubscribers || !clientChannels) {
      console.log(`[SUBSCRIPTION] Unsubscribe failed: channel or client not found`);
      return false;
    }

    if (!channelSubscribers.has(clientId)) {
      console.log(`[SUBSCRIPTION] Client ${clientId} was not subscribed to channel: ${channel}`);
      return false;
    }

    channelSubscribers.delete(clientId);
    clientChannels.delete(channel);

    console.log(`[SUBSCRIPTION] Successfully unsubscribed client ${clientId} from channel: ${channel}`);

    if (channelSubscribers.size === 0) {
      console.log(`[SUBSCRIPTION] Channel ${channel} has no more subscribers, removing`);
      this.channelSubscriptions.delete(channel);
    }

    if (clientChannels.size === 0) {
      console.log(`[SUBSCRIPTION] Client ${clientId} has no more subscriptions, removing`);
      this.clientSubscriptions.delete(clientId);
      await this.redis.removeClientSubscriptions(clientId);
    } else {
      await this.persistClientSubscriptions(clientId);
    }

    return true;
  }

  async unsubscribeClientFromAll(clientId: string): Promise<string[]> {
    console.log(`[SUBSCRIPTION] Unsubscribing client ${clientId} from all channels`);
    
    const clientChannels = this.clientSubscriptions.get(clientId);
    if (!clientChannels) {
      console.log(`[SUBSCRIPTION] Client ${clientId} has no subscriptions to remove`);
      return [];
    }

    const unsubscribedChannels = Array.from(clientChannels);
    console.log(`[SUBSCRIPTION] Removing client ${clientId} from ${unsubscribedChannels.length} channels: [${unsubscribedChannels.join(', ')}]`);

    for (const channel of clientChannels) {
      const channelSubscribers = this.channelSubscriptions.get(channel);
      if (channelSubscribers) {
        channelSubscribers.delete(clientId);
        if (channelSubscribers.size === 0) {
          console.log(`[SUBSCRIPTION] Channel ${channel} now empty, removing`);
          this.channelSubscriptions.delete(channel);
        }
      }
    }

    this.clientSubscriptions.delete(clientId);
    await this.redis.removeClientSubscriptions(clientId);

    console.log(`[SUBSCRIPTION] Successfully unsubscribed client ${clientId} from all channels`);
    return unsubscribedChannels;
  }

  getChannelSubscribers(channel: string): string[] {
    const subscribers = this.channelSubscriptions.get(channel);
    const result = subscribers ? Array.from(subscribers) : [];
    console.log(`[SUBSCRIPTION] Channel ${channel} has ${result.length} subscribers: [${result.join(', ')}]`);
    return result;
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
    return Array.from(this.channelSubscriptions.keys());
  }

  getChannelCount(): number {
    return this.channelSubscriptions.size;
  }

  getTotalSubscriptions(): number {
    let total = 0;
    for (const subscribers of this.channelSubscriptions.values()) {
      total += subscribers.size;
    }
    return total;
  }

  getChannelStats(): Record<string, number> {
    const stats: Record<string, number> = {};
    for (const [channel, subscribers] of this.channelSubscriptions.entries()) {
      stats[channel] = subscribers.size;
    }
    return stats;
  }

  async restoreClientSubscriptions(clientId: string): Promise<string[]> {
    try {
      const storedSubscriptions = await this.redis.getClientSubscriptions(clientId);
      
      // Ensure we have an array before iterating
      if (Array.isArray(storedSubscriptions)) {
        for (const channel of storedSubscriptions) {
          await this.subscribeClient(clientId, channel);
        }
        return storedSubscriptions;
      }
      
      return [];
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