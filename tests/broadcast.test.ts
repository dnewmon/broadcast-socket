import { BroadcastManager } from '../src/broadcast';
import { SubscriptionManager } from '../src/subscription';
import { RedisManager } from '../src/redis';
import { Client } from '../src/types';
import { RedisDataKeys } from '../src/RedisDataKeys';

jest.mock('../src/redis');

// Mock StreamManager
const mockStreamManager = {
  createClientConsumer: jest.fn(),
  deleteClientConsumer: jest.fn(),
  publishMessage: jest.fn(),
  readMessagesForClient: jest.fn().mockResolvedValue([]),
  getConsumerInfo: jest.fn(),
  getAllConsumers: jest.fn().mockReturnValue([]),
  shutdown: jest.fn()
};

jest.mock('../src/stream', () => ({
  StreamManager: jest.fn().mockImplementation(() => mockStreamManager)
}));

describe('BroadcastManager', () => {
  let broadcastManager: BroadcastManager;
  let mockRedis: jest.Mocked<RedisManager>;
  let mockSubscriptionManager: jest.Mocked<SubscriptionManager>;
  let mockClients: Map<string, Client>;

  beforeEach(() => {
    // Clear any existing timers
    jest.clearAllTimers();
    mockRedis = new RedisManager('redis://test') as jest.Mocked<RedisManager>;
    
    // Mock Redis methods used by broadcast manager
    mockRedis.storeMessage = jest.fn().mockResolvedValue(undefined);
    mockRedis.incrementCounter = jest.fn().mockResolvedValue(1);
    mockRedis.getClient = jest.fn().mockReturnValue({
      keys: jest.fn().mockResolvedValue([]),
      get: jest.fn().mockResolvedValue(null)
    });
    mockRedis.getMessage = jest.fn().mockResolvedValue(null);
    
    // Mock Redis stream methods
    mockRedis.addToStream = jest.fn().mockResolvedValue('1234567890-0');
    mockRedis.createConsumerGroup = jest.fn().mockResolvedValue(undefined);
    mockRedis.deleteConsumerGroup = jest.fn().mockResolvedValue(undefined);
    mockRedis.readFromConsumerGroup = jest.fn().mockResolvedValue([]);
    mockRedis.readPendingMessages = jest.fn().mockResolvedValue([]);
    mockRedis.acknowledgeMessage = jest.fn().mockResolvedValue(1);
    mockRedis.claimMessages = jest.fn().mockResolvedValue([]);
    mockRedis.getStreamInfo = jest.fn().mockResolvedValue(null);
    mockRedis.getStreamLength = jest.fn().mockResolvedValue(0);
    mockRedis.deleteOldMessages = jest.fn().mockResolvedValue(0);
    
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

  afterEach(async () => {
    // Clean up any running timers
    if (broadcastManager) {
      await broadcastManager.shutdown();
    }
    jest.clearAllTimers();
  });

  describe('Broadcasting', () => {
    test('should broadcast message to channel', async () => {
      const channel = 'test-channel';
      const data = { message: 'Hello World' };
      
      mockRedis.storeMessage.mockResolvedValue();
      mockRedis.incrementCounter.mockResolvedValue(1);

      const messageId = await broadcastManager.broadcastToChannel(channel, data);
      
      expect(messageId).toBeTruthy();
      expect(mockRedis.storeMessage).toHaveBeenCalledWith(
        messageId,
        expect.objectContaining({
          channel,
          data,
          messageId,
          senderId: undefined,
          timestamp: expect.any(Number)
        })
      );
    });

    test('should broadcast to all channels', async () => {
      const data = { message: 'Global message' };
      
      mockRedis.storeMessage.mockResolvedValue();
      mockRedis.incrementCounter.mockResolvedValue(1);

      const messageId = await broadcastManager.broadcastToAll(data);
      
      expect(messageId).toBeTruthy();
      expect(mockRedis.storeMessage).toHaveBeenCalledWith(
        messageId,
        expect.objectContaining({
          channel: '*',
          data,
          messageId,
          senderId: undefined,
          timestamp: expect.any(Number)
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
      
      expect(mockRedis.incrementCounter).toHaveBeenCalledWith(RedisDataKeys.totalMessagesStats());
      expect(mockRedis.incrementCounter).toHaveBeenCalledWith(RedisDataKeys.channelMessagesStats(channel));
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
      
      // Verify StreamManager methods were called
      expect(mockStreamManager.createClientConsumer).toHaveBeenCalledWith(clientId, ['test-channel']);
    });
  });

  describe('Message History', () => {
    test('should fetch message history', async () => {
      const channel = 'test-channel';
      
      mockRedis.getClient.mockReturnValue({
        keys: jest.fn().mockResolvedValue([RedisDataKeys.message('1'), RedisDataKeys.message('2')])
      } as any);
      
      mockRedis.getMessage
        .mockResolvedValueOnce({ channel, data: 'msg1', timestamp: 1 })
        .mockResolvedValueOnce({ channel, data: 'msg2', timestamp: 2 });

      const history = await broadcastManager.getMessageHistory(channel, 10);
      
      expect(Array.isArray(history)).toBe(true);
      expect(mockRedis.getClient().keys).toHaveBeenCalledWith(RedisDataKeys.messageHistoryPattern());
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