// Global test setup
beforeAll(async () => {
  // Setup test environment
});

afterAll(async () => {
  // Cleanup test environment
});

// Mock Redis for tests
jest.mock('../src/redis', () => {
  return {
    RedisManager: jest.fn().mockImplementation(() => {
      return {
        connect: jest.fn(),
        disconnect: jest.fn(),
        publishMessage: jest.fn(),
        subscribeToChannel: jest.fn(),
        unsubscribeFromChannel: jest.fn(),
        storeMessage: jest.fn(),
        getMessage: jest.fn(),
        storeClientSubscriptions: jest.fn(),
        getClientSubscriptions: jest.fn(),
        removeClientSubscriptions: jest.fn(),
        incrementCounter: jest.fn(),
        getCounter: jest.fn(),
        getClient: jest.fn()
      };
    })
  };
});