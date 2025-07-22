import { BroadcastManager } from '../src/broadcast';
import { SubscriptionManager } from '../src/subscription';
import { RedisManager } from '../src/redis';
import { Client } from '../src/types';

jest.mock('../src/redis');

describe('BroadcastManager', () => {
  let broadcastManager: BroadcastManager;
  let mockRedis: jest.Mocked<RedisManager>;
  let mockSubscriptionManager: jest.Mocked<SubscriptionManager>;
  let mockClients: Map<string, Client>;

  beforeEach(() => {
    mockRedis = new RedisManager('redis://test') as jest.Mocked<RedisManager>;
    
    // Mock all the new stream methods
    mockRedis.addToStream = jest.fn().mockResolvedValue('1234567890-0');
    mockRedis.createConsumerGroup = jest.fn().mockResolvedValue(undefined);
    mockRedis.deleteConsumerGroup = jest.fn().mockResolvedValue(undefined);
    mockRedis.readFromConsumerGroup = jest.fn().mockResolvedValue([]);
    mockRedis.readPendingMessages = jest.fn().mockResolvedValue([]);
    mockRedis.acknowledgeMessage = jest.fn().mockResolvedValue(1);
    
    mockSubscriptionManager = {
      getChannelSubscribers: jest.fn(),
      subscribeClient: jest.fn(),
      unsubscribeClient: jest.fn(),
      unsubscribeClientFromAll: jest.fn(),
      getClientSubscriptions: jest.fn(),
      isClientSubscribed: jest.fn(),
      getAllChannels: jest.fn(),
      getChannelCount: jest.fn(),
      getTotalSubscriptions: jest.fn(),
      getChannelStats: jest.fn(),
      restoreClientSubscriptions: jest.fn(),
      exportState: jest.fn(),
      importState: jest.fn()
    } as any;

    mockClients = new Map();
    
    broadcastManager = new BroadcastManager(
      mockRedis,
      mockSubscriptionManager,
      mockClients
    );
  });

  describe('Broadcasting', () => {
    test('should broadcast message to channel', async () => {
      const channel = 'test-channel';
      const data = { message: 'Hello World' };
      
      mockRedis.storeMessage.mockResolvedValue();
      mockRedis.publishMessage.mockResolvedValue();
      mockRedis.incrementCounter.mockResolvedValue(1);

      const messageId = await broadcastManager.broadcastToChannel(channel, data);
      
      expect(messageId).toBeTruthy();
      expect(mockRedis.storeMessage).toHaveBeenCalled();
      expect(mockRedis.publishMessage).toHaveBeenCalledWith(
        `broadcast:${channel}`,
        expect.objectContaining({
          channel,
          data,
          messageId
        })
      );
    });

    test('should broadcast to all channels', async () => {
      const data = { message: 'Global message' };
      
      mockRedis.storeMessage.mockResolvedValue();
      mockRedis.publishMessage.mockResolvedValue();
      mockRedis.incrementCounter.mockResolvedValue(1);

      const messageId = await broadcastManager.broadcastToAll(data);
      
      expect(messageId).toBeTruthy();
      expect(mockRedis.publishMessage).toHaveBeenCalledWith(
        'broadcast:*',
        expect.objectContaining({
          channel: '*',
          data
        })
      );
    });

    test('should increment message counters', async () => {
      const channel = 'test-channel';
      const data = { test: true };
      
      mockRedis.storeMessage.mockResolvedValue();
      mockRedis.publishMessage.mockResolvedValue();
      mockRedis.incrementCounter.mockResolvedValue(1);

      await broadcastManager.broadcastToChannel(channel, data);
      
      expect(mockRedis.incrementCounter).toHaveBeenCalledWith('stats:total_messages');
      expect(mockRedis.incrementCounter).toHaveBeenCalledWith(`stats:channel:${channel}:messages`);
    });
  });

  describe('Stream Management', () => {
    test('should get pending message count for client', () => {
      const clientId = 'test-client';
      const pendingCount = broadcastManager.getPendingMessageCount(clientId);
      
      expect(typeof pendingCount).toBe('number');
    });

    test('should get total pending messages', () => {
      const total = broadcastManager.getTotalPendingMessages();
      expect(typeof total).toBe('number');
    });

    test('should initialize client streams', async () => {
      const clientId = 'test-client';
      mockSubscriptionManager.getClientSubscriptions.mockReturnValue(['test-channel']);
      
      await expect(broadcastManager.initializeClientStreams(clientId)).resolves.not.toThrow();
    });
  });

  describe('Message History', () => {
    test('should fetch message history', async () => {
      const channel = 'test-channel';
      
      mockRedis.getClient.mockReturnValue({
        keys: jest.fn().mockResolvedValue(['message:1', 'message:2'])
      } as any);
      
      mockRedis.getMessage
        .mockResolvedValueOnce({ channel, data: 'msg1', timestamp: 1 })
        .mockResolvedValueOnce({ channel, data: 'msg2', timestamp: 2 });

      const history = await broadcastManager.getMessageHistory(channel, 10);
      
      expect(Array.isArray(history)).toBe(true);
    });

    test('should handle history fetch errors', async () => {
      const channel = 'test-channel';
      
      mockRedis.getClient.mockReturnValue({
        keys: jest.fn().mockRejectedValue(new Error('Redis error'))
      } as any);

      const history = await broadcastManager.getMessageHistory(channel);
      
      expect(history).toEqual([]);
    });
  });
});