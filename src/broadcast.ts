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
    console.log('[BROADCAST] Setting up Redis subscriptions for broadcast:* pattern');
    this.redis.subscribeToChannel('broadcast:*', (message: string) => {
      try {
        console.log('[BROADCAST] Received Redis message:', message);
        const broadcastMessage: BroadcastMessage = JSON.parse(message);
        console.log('[BROADCAST] Parsed broadcast message:', broadcastMessage);
        this.handleIncomingBroadcast(broadcastMessage);
      } catch (error) {
        console.error('[BROADCAST] Error parsing broadcast message:', error);
      }
    });
  }

  async broadcastToChannel(channel: string, data: any, senderId?: string): Promise<string> {
    const messageId = uuidv4();
    const timestamp = Date.now();

    console.log(`[BROADCAST] Broadcasting to channel: ${channel}, messageId: ${messageId}, senderId: ${senderId}`);
    console.log(`[BROADCAST] Broadcast data:`, data);

    const broadcastMessage: BroadcastMessage = {
      channel,
      data,
      messageId,
      timestamp,
      senderId
    };

    console.log(`[BROADCAST] Storing message in Redis: ${messageId}`);
    await this.redis.storeMessage(messageId, broadcastMessage);
    
    console.log(`[BROADCAST] Publishing to Redis channel: broadcast:${channel}`);
    await this.redis.publishMessage(`broadcast:${channel}`, broadcastMessage);

    await this.redis.incrementCounter('stats:total_messages');
    await this.redis.incrementCounter(`stats:channel:${channel}:messages`);

    console.log(`[BROADCAST] Successfully broadcast message ${messageId} to channel ${channel}`);
    return messageId;
  }

  async broadcastToAll(data: any, senderId?: string): Promise<string> {
    return this.broadcastToChannel('*', data, senderId);
  }

  private async handleIncomingBroadcast(broadcastMessage: BroadcastMessage): Promise<void> {
    console.log(`[BROADCAST] Handling incoming broadcast: ${broadcastMessage.messageId} for channel: ${broadcastMessage.channel}`);
    
    if (this.deduplicationCache.has(broadcastMessage.messageId)) {
      console.log(`[BROADCAST] Message ${broadcastMessage.messageId} already processed (deduplication)`);
      return;
    }

    this.deduplicationCache.add(broadcastMessage.messageId);
    setTimeout(() => {
      this.deduplicationCache.delete(broadcastMessage.messageId);
    }, 60000);

    const { channel, data, messageId, timestamp, senderId } = broadcastMessage;
    console.log(`[BROADCAST] Processing message ${messageId} from sender ${senderId} for channel ${channel}`);

    if (channel === '*') {
      console.log(`[BROADCAST] Delivering to all clients (global broadcast)`);
      await this.deliverToAllClients(data, messageId, timestamp, senderId);
    } else {
      console.log(`[BROADCAST] Delivering to channel subscribers: ${channel}`);
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
    console.log(`[BROADCAST] Channel ${channel} has ${subscribers.length} subscribers: [${subscribers.join(', ')}]`);
    
    const serverMessage: ServerMessage = {
      type: 'message',
      channel,
      data,
      messageId,
      timestamp
    };

    const targetClients = subscribers.filter(clientId => clientId !== senderId);
    console.log(`[BROADCAST] Delivering to ${targetClients.length} clients (excluding sender ${senderId}): [${targetClients.join(', ')}]`);

    const deliveryPromises = targetClients.map(clientId => this.deliverToClient(clientId, serverMessage));

    const results = await Promise.allSettled(deliveryPromises);
    const failures = results.filter(r => r.status === 'rejected').length;
    console.log(`[BROADCAST] Delivery completed for channel ${channel}: ${results.length - failures}/${results.length} successful`);
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
    console.log(`[BROADCAST] Attempting to deliver message ${message.messageId} to client ${clientId}`);
    const client = this.clients.get(clientId);
    
    if (!client) {
      console.log(`[BROADCAST] Client ${clientId} not found in clients map, queueing message`);
      this.queueMessage(clientId, {
        channel: message.channel || '',
        data: message.data,
        messageId: message.messageId || '',
        timestamp: message.timestamp
      });
      return;
    }

    if (!client.isAlive) {
      console.log(`[BROADCAST] Client ${clientId} is not alive, queueing message`);
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
        console.log(`[BROADCAST] Sending message ${message.messageId} to client ${clientId}`);
        client.ws.send(JSON.stringify(message));
        console.log(`[BROADCAST] Message ${message.messageId} sent successfully to client ${clientId}`);
        await this.sendAcknowledgment(client, message.messageId);
      } else {
        console.log(`[BROADCAST] Client ${clientId} WebSocket not ready (state: ${client.ws.readyState}), queueing message`);
        this.queueMessage(clientId, {
          channel: message.channel || '',
          data: message.data,
          messageId: message.messageId || '',
          timestamp: message.timestamp
        });
      }
    } catch (error) {
      console.error(`[BROADCAST] Error delivering message to client ${clientId}:`, error);
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
    console.log(`[BROADCAST] Queueing message ${message.messageId} for client ${clientId}`);
    
    if (!this.messageQueue.has(clientId)) {
      this.messageQueue.set(clientId, []);
    }

    const queue = this.messageQueue.get(clientId)!;
    queue.push(message);

    if (queue.length > 100) {
      const dropped = queue.shift();
      console.log(`[BROADCAST] Queue full for client ${clientId}, dropped message ${dropped?.messageId}`);
    }
    
    console.log(`[BROADCAST] Client ${clientId} now has ${queue.length} queued messages`);
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