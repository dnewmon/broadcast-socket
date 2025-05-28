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
    this.client.on('error', (err) => console.error('Redis Client Error:', err));
    this.publisher.on('error', (err) => console.error('Redis Publisher Error:', err));
    this.subscriber.on('error', (err) => console.error('Redis Subscriber Error:', err));
  }

  async connect(): Promise<void> {
    await Promise.all([
      this.client.connect(),
      this.publisher.connect(),
      this.subscriber.connect()
    ]);
  }

  async disconnect(): Promise<void> {
    await Promise.all([
      this.client.disconnect(),
      this.publisher.disconnect(),
      this.subscriber.disconnect()
    ]);
  }

  async publishMessage(channel: string, message: any): Promise<void> {
    await this.publisher.publish(channel, JSON.stringify(message));
  }

  async subscribeToChannel(channel: string, callback: (message: string) => void): Promise<void> {
    await this.subscriber.subscribe(channel, callback);
  }

  async unsubscribeFromChannel(channel: string): Promise<void> {
    await this.subscriber.unsubscribe(channel);
  }

  async storeMessage(messageId: string, message: any, ttl: number = 3600): Promise<void> {
    await this.client.setEx(`message:${messageId}`, ttl, JSON.stringify(message));
  }

  async getMessage(messageId: string): Promise<any | null> {
    const message = await this.client.get(`message:${messageId}`);
    return message ? JSON.parse(message) : null;
  }

  async storeClientSubscriptions(clientId: string, subscriptions: string[]): Promise<void> {
    const key = `client:${clientId}:subscriptions`;
    await this.client.del(key);
    if (subscriptions.length > 0) {
      await this.client.sAdd(key, subscriptions);
      await this.client.expire(key, 3600);
    }
  }

  async getClientSubscriptions(clientId: string): Promise<string[]> {
    const key = `client:${clientId}:subscriptions`;
    return await this.client.sMembers(key);
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