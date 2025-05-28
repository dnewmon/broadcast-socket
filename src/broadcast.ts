import { v4 as uuidv4 } from 'uuid';
import { BroadcastMessage, ServerMessage, Client } from './types';
import { RedisManager } from './redis';
import { SubscriptionManager } from './subscription';

export class BroadcastManager {
  private redis: RedisManager;
  private subscriptionManager: SubscriptionManager;
  private clients: Map<string, Client>;
  private messageQueue: Map<string, BroadcastMessage[]> = new Map();
  private deduplicationCache: Set<string> = new Set();

  constructor(redis: RedisManager, subscriptionManager: SubscriptionManager, clients: Map<string, Client>) {
    this.redis = redis;
    this.subscriptionManager = subscriptionManager;
    this.clients = clients;
    this.setupRedisSubscriptions();
  }

  private setupRedisSubscriptions(): void {
    this.redis.subscribeToChannel('broadcast:*', (message: string) => {
      try {
        const broadcastMessage: BroadcastMessage = JSON.parse(message);
        this.handleIncomingBroadcast(broadcastMessage);
      } catch (error) {
        console.error('Error parsing broadcast message:', error);
      }
    });
  }

  async broadcastToChannel(channel: string, data: any, senderId?: string): Promise<string> {
    const messageId = uuidv4();
    const timestamp = Date.now();

    const broadcastMessage: BroadcastMessage = {
      channel,
      data,
      messageId,
      timestamp,
      senderId
    };

    await this.redis.storeMessage(messageId, broadcastMessage);
    await this.redis.publishMessage(`broadcast:${channel}`, broadcastMessage);

    await this.redis.incrementCounter('stats:total_messages');
    await this.redis.incrementCounter(`stats:channel:${channel}:messages`);

    return messageId;
  }

  async broadcastToAll(data: any, senderId?: string): Promise<string> {
    return this.broadcastToChannel('*', data, senderId);
  }

  private async handleIncomingBroadcast(broadcastMessage: BroadcastMessage): Promise<void> {
    if (this.deduplicationCache.has(broadcastMessage.messageId)) {
      return;
    }

    this.deduplicationCache.add(broadcastMessage.messageId);
    setTimeout(() => {
      this.deduplicationCache.delete(broadcastMessage.messageId);
    }, 60000);

    const { channel, data, messageId, timestamp, senderId } = broadcastMessage;

    if (channel === '*') {
      await this.deliverToAllClients(data, messageId, timestamp, senderId);
    } else {
      await this.deliverToChannelSubscribers(channel, data, messageId, timestamp, senderId);
    }
  }

  private async deliverToChannelSubscribers(
    channel: string, 
    data: any, 
    messageId: string, 
    timestamp: number, 
    senderId?: string
  ): Promise<void> {
    const subscribers = this.subscriptionManager.getChannelSubscribers(channel);
    
    const serverMessage: ServerMessage = {
      type: 'message',
      channel,
      data,
      messageId,
      timestamp
    };

    const deliveryPromises = subscribers
      .filter(clientId => clientId !== senderId)
      .map(clientId => this.deliverToClient(clientId, serverMessage));

    await Promise.allSettled(deliveryPromises);
  }

  private async deliverToAllClients(
    data: any, 
    messageId: string, 
    timestamp: number, 
    senderId?: string
  ): Promise<void> {
    const serverMessage: ServerMessage = {
      type: 'message',
      channel: '*',
      data,
      messageId,
      timestamp
    };

    const deliveryPromises = Array.from(this.clients.keys())
      .filter(clientId => clientId !== senderId)
      .map(clientId => this.deliverToClient(clientId, serverMessage));

    await Promise.allSettled(deliveryPromises);
  }

  private async deliverToClient(clientId: string, message: ServerMessage): Promise<void> {
    const client = this.clients.get(clientId);
    
    if (!client || !client.isAlive) {
      this.queueMessage(clientId, {
        channel: message.channel || '',
        data: message.data,
        messageId: message.messageId || '',
        timestamp: message.timestamp
      });
      return;
    }

    try {
      if (client.ws.readyState === 1) {
        client.ws.send(JSON.stringify(message));
        await this.sendAcknowledgment(client, message.messageId);
      } else {
        this.queueMessage(clientId, {
          channel: message.channel || '',
          data: message.data,
          messageId: message.messageId || '',
          timestamp: message.timestamp
        });
      }
    } catch (error) {
      console.error(`Error delivering message to client ${clientId}:`, error);
      this.queueMessage(clientId, {
        channel: message.channel || '',
        data: message.data,
        messageId: message.messageId || '',
        timestamp: message.timestamp
      });
    }
  }

  private async sendAcknowledgment(client: Client, messageId?: string): Promise<void> {
    if (!messageId) return;

    const ackMessage: ServerMessage = {
      type: 'ack',
      messageId,
      timestamp: Date.now()
    };

    try {
      if (client.ws.readyState === 1) {
        client.ws.send(JSON.stringify(ackMessage));
      }
    } catch (error) {
      console.error(`Error sending acknowledgment to client ${client.id}:`, error);
    }
  }

  private queueMessage(clientId: string, message: BroadcastMessage): void {
    if (!this.messageQueue.has(clientId)) {
      this.messageQueue.set(clientId, []);
    }

    const queue = this.messageQueue.get(clientId)!;
    queue.push(message);

    if (queue.length > 100) {
      queue.shift();
    }
  }

  async deliverQueuedMessages(clientId: string): Promise<void> {
    const queue = this.messageQueue.get(clientId);
    if (!queue || queue.length === 0) {
      return;
    }

    const client = this.clients.get(clientId);
    if (!client || !client.isAlive) {
      return;
    }

    const messages = queue.splice(0);
    
    for (const queuedMessage of messages) {
      const serverMessage: ServerMessage = {
        type: 'message',
        channel: queuedMessage.channel,
        data: queuedMessage.data,
        messageId: queuedMessage.messageId,
        timestamp: queuedMessage.timestamp
      };

      await this.deliverToClient(clientId, serverMessage);
    }

    if (queue.length === 0) {
      this.messageQueue.delete(clientId);
    }
  }

  async retryFailedDeliveries(): Promise<void> {
    const retryPromises = Array.from(this.messageQueue.keys()).map(clientId => 
      this.deliverQueuedMessages(clientId)
    );

    await Promise.allSettled(retryPromises);
  }

  getQueuedMessageCount(clientId: string): number {
    const queue = this.messageQueue.get(clientId);
    return queue ? queue.length : 0;
  }

  getTotalQueuedMessages(): number {
    let total = 0;
    for (const queue of this.messageQueue.values()) {
      total += queue.length;
    }
    return total;
  }

  clearClientQueue(clientId: string): void {
    this.messageQueue.delete(clientId);
  }

  async getMessageHistory(channel: string, limit: number = 50): Promise<BroadcastMessage[]> {
    try {
      const pattern = `message:*`;
      const keys = await this.redis.getClient().keys(pattern);
      const messages: BroadcastMessage[] = [];

      for (const key of keys.slice(-limit)) {
        const message = await this.redis.getMessage(key.replace('message:', ''));
        if (message && (channel === '*' || message.channel === channel)) {
          messages.push(message);
        }
      }

      return messages.sort((a, b) => b.timestamp - a.timestamp);
    } catch (error) {
      console.error('Error fetching message history:', error);
      return [];
    }
  }
}