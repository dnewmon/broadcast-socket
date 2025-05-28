import { createClient, RedisClientType } from 'redis';

export class RedisManager {
  private client: RedisClientType;
  private publisher: RedisClientType;
  private subscriber: RedisClientType;

  constructor(redisUrl: string) {
    this.client = createClient({ url: redisUrl });
    this.publisher = createClient({ url: redisUrl });
    this.subscriber = createClient({ url: redisUrl });

    this.setupErrorHandlers();
  }

  private setupErrorHandlers(): void {
    this.client.on('error', (err) => console.error('[REDIS] Client Error:', err));
    this.publisher.on('error', (err) => console.error('[REDIS] Publisher Error:', err));
    this.subscriber.on('error', (err) => console.error('[REDIS] Subscriber Error:', err));
    
    this.client.on('connect', () => console.log('[REDIS] Client connected'));
    this.publisher.on('connect', () => console.log('[REDIS] Publisher connected'));
    this.subscriber.on('connect', () => console.log('[REDIS] Subscriber connected'));
  }

  async connect(): Promise<void> {
    console.log('[REDIS] Connecting to Redis...');
    await Promise.all([
      this.client.connect(),
      this.publisher.connect(),
      this.subscriber.connect()
    ]);
    console.log('[REDIS] All Redis connections established');
  }

  async disconnect(): Promise<void> {
    await Promise.all([
      this.client.disconnect(),
      this.publisher.disconnect(),
      this.subscriber.disconnect()
    ]);
  }

  async publishMessage(channel: string, message: any): Promise<void> {
    const messageStr = JSON.stringify(message);
    console.log(`[REDIS] Publishing to channel ${channel}:`, messageStr);
    const result = await this.publisher.publish(channel, messageStr);
    console.log(`[REDIS] Message published to ${channel}, ${result} subscribers received it`);
  }

  async subscribeToChannel(channel: string, callback: (message: string) => void): Promise<void> {
    console.log(`[REDIS] Subscribing to channel: ${channel}`);
    
    const wrappedCallback = (message: string, channel: string) => {
      console.log(`[REDIS] Received message on channel ${channel}:`, message);
      callback(message);
    };
    
    await this.subscriber.subscribe(channel, wrappedCallback);
    console.log(`[REDIS] Successfully subscribed to channel: ${channel}`);
  }

  async unsubscribeFromChannel(channel: string): Promise<void> {
    await this.subscriber.unsubscribe(channel);
  }

  async storeMessage(messageId: string, message: any, ttl: number = 3600): Promise<void> {
    const key = `message:${messageId}`;
    const messageStr = JSON.stringify(message);
    console.log(`[REDIS] Storing message with key ${key} (TTL: ${ttl}s):`, messageStr);
    await this.client.setEx(key, ttl, messageStr);
    console.log(`[REDIS] Message ${messageId} stored successfully`);
  }

  async getMessage(messageId: string): Promise<any | null> {
    const message = await this.client.get(`message:${messageId}`);
    return message ? JSON.parse(message) : null;
  }

  async storeClientSubscriptions(clientId: string, subscriptions: string[]): Promise<void> {
    const key = `client:${clientId}:subscriptions`;
    console.log(`[REDIS] Storing subscriptions for client ${clientId}:`, subscriptions);
    
    await this.client.del(key);
    if (subscriptions.length > 0) {
      await this.client.sAdd(key, subscriptions);
      await this.client.expire(key, 3600);
      console.log(`[REDIS] Stored ${subscriptions.length} subscriptions for client ${clientId}`);
    } else {
      console.log(`[REDIS] Cleared subscriptions for client ${clientId} (no subscriptions)`);
    }
  }

  async getClientSubscriptions(clientId: string): Promise<string[]> {
    const key = `client:${clientId}:subscriptions`;
    console.log(`[REDIS] Retrieving subscriptions for client ${clientId}`);
    const subscriptions = await this.client.sMembers(key);
    console.log(`[REDIS] Retrieved ${subscriptions.length} subscriptions for client ${clientId}:`, subscriptions);
    return subscriptions;
  }

  async removeClientSubscriptions(clientId: string): Promise<void> {
    await this.client.del(`client:${clientId}:subscriptions`);
  }

  async incrementCounter(key: string, ttl: number = 3600): Promise<number> {
    const count = await this.client.incr(key);
    if (count === 1) {
      await this.client.expire(key, ttl);
    }
    return count;
  }

  async getCounter(key: string): Promise<number> {
    const count = await this.client.get(key);
    return count ? parseInt(count, 10) : 0;
  }

  getClient(): RedisClientType {
    return this.client;
  }
}