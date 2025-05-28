import WebSocket from 'ws';
import { BroadcastServer } from '../src/server';

describe('BroadcastServer', () => {
  let server: BroadcastServer;
  const TEST_PORT = 8081;

  beforeEach(() => {
    process.env.PORT = TEST_PORT.toString();
    process.env.REDIS_URL = 'redis://localhost:6379';
    server = new BroadcastServer();
  });

  afterEach(async () => {
    if (server) {
      await server.stop();
    }
  });

  describe('Server Initialization', () => {
    test('should create server instance', () => {
      expect(server).toBeInstanceOf(BroadcastServer);
    });

    test('should start server on specified port', async () => {
      await server.start();
      
      // Test HTTP health endpoint
      const response = await fetch(`http://localhost:${TEST_PORT}/health`);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.status).toBe('healthy');
    });
  });

  describe('WebSocket Connections', () => {
    beforeEach(async () => {
      await server.start();
    });

    test('should accept WebSocket connections', (done) => {
      const ws = new WebSocket(`ws://localhost:${TEST_PORT}`);
      
      ws.on('open', () => {
        expect(ws.readyState).toBe(WebSocket.OPEN);
        ws.close();
        done();
      });

      ws.on('error', (error) => {
        done(error);
      });
    });

    test('should send welcome message on connection', (done) => {
      const ws = new WebSocket(`ws://localhost:${TEST_PORT}`);
      
      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        
        if (message.data?.type === 'welcome') {
          expect(message.data.clientId).toBeTruthy();
          expect(message.data.serverTime).toBeTruthy();
          ws.close();
          done();
        }
      });

      ws.on('error', (error) => {
        done(error);
      });
    });

    test('should handle subscription messages', (done) => {
      const ws = new WebSocket(`ws://localhost:${TEST_PORT}`);
      
      ws.on('open', () => {
        const subscribeMessage = {
          type: 'subscribe',
          channel: 'test-channel',
          messageId: 'test-123'
        };
        
        ws.send(JSON.stringify(subscribeMessage));
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'ack' && message.messageId === 'test-123') {
          ws.close();
          done();
        }
      });

      ws.on('error', (error) => {
        done(error);
      });
    });
  });

  describe('HTTP Endpoints', () => {
    beforeEach(async () => {
      await server.start();
    });

    test('should return server stats', async () => {
      const response = await fetch(`http://localhost:${TEST_PORT}/stats`);
      const stats = await response.json();
      
      expect(response.status).toBe(200);
      expect(stats).toHaveProperty('totalConnections');
      expect(stats).toHaveProperty('activeConnections');
      expect(stats).toHaveProperty('uptime');
    });

    test('should handle broadcast via HTTP', async () => {
      const broadcastData = {
        channel: 'test-channel',
        data: { message: 'Hello World' }
      };

      const response = await fetch(`http://localhost:${TEST_PORT}/broadcast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(broadcastData)
      });

      const result = await response.json();
      
      expect(response.status).toBe(200);
      expect(result).toHaveProperty('messageId');
      expect(result).toHaveProperty('timestamp');
    });
  });
});