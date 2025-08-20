import WebSocket, { WebSocketServer } from 'ws';
import express from 'express';
import cors from 'cors';
import { createServer, Server } from 'http';

import { Client, ClientMessage, ServerMessage, ServerStats } from './types.js';
import { RedisManager } from './redis.js';
import { SubscriptionManager } from './subscription.js';
import { BroadcastManager } from './broadcast.js';
import { UserSessionManager } from './session.js';
import { 
  getServerConfig, 
  validateMessage, 
  sanitizeData, 
  logWithTimestamp, 
  createRateLimiter,
  generateClientId 
} from './utils.js';

export class BroadcastServer {
  private server: WebSocketServer;
  private httpServer: Server;
  private app: express.Application;
  private redis: RedisManager;
  private subscriptionManager: SubscriptionManager;
  private broadcastManager: BroadcastManager;
  private sessionManager: UserSessionManager;
  private clients: Map<string, Client> = new Map();
  private startTime: number = Date.now();
  private config = getServerConfig();
  private rateLimiter = createRateLimiter(100, 60000);
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.app = express();
    this.setupExpress();
    this.httpServer = createServer(this.app);
    this.server = new WebSocketServer({ server: this.httpServer });
    
    this.redis = new RedisManager(this.config.redisUrl);
    this.sessionManager = new UserSessionManager(this.redis);
    this.subscriptionManager = new SubscriptionManager(this.redis);
    this.broadcastManager = new BroadcastManager(this.redis, this.subscriptionManager, this.clients);
    
    this.setupWebSocketServer();
    this.setupHealthChecks();
  }

  private setupExpress(): void {
    this.app.use(cors({ origin: this.config.corsOrigin }));
    this.app.use(express.json({ limit: '1mb' }));
    
    this.app.get('/health', (_req, res) => {
      res.json({ 
        status: 'healthy', 
        uptime: Date.now() - this.startTime,
        connections: this.clients.size 
      });
    });

    this.app.get('/stats', (_req, res) => {
      res.json(this.getServerStats());
    });

    this.app.post('/broadcast', async (req, res) => {
      try {
        const { channel, data } = req.body;
        
        if (!channel || !data) {
          res.status(400).json({ error: 'Channel and data are required' });
          return;
        }

        const messageId = await this.broadcastManager.broadcastToChannel(
          channel, 
          sanitizeData(data)
        );

        res.json({ messageId, timestamp: Date.now() });
      } catch (error) {
        logWithTimestamp('error', 'HTTP broadcast error:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });
  }

  private setupWebSocketServer(): void {
    this.server.on('connection', (ws: WebSocket, req) => {
      const clientId = generateClientId();
      const clientIp = req.socket.remoteAddress || 'unknown';
      
      logWithTimestamp('debug', `[SERVER] New WebSocket connection attempt from ${clientIp}`);
      
      if (!this.rateLimiter(clientIp)) {
        logWithTimestamp('warn', `Rate limit exceeded for IP: ${clientIp}`);
        ws.close(1008, 'Rate limit exceeded');
        return;
      }

      // Extract streamName from URL query params, default to 'default'
      const url = new URL(req.url || '', `ws://${req.headers.host}`);
      const streamName = url.searchParams.get('streamName') || 'default';

      // Create session and client after streamName is determined
      this.initializeClientSession(ws, clientId, clientIp, streamName);
    });

    this.setupHeartbeat();
    logWithTimestamp('info', `WebSocket server initialized`);
  }

  private async initializeClientSession(ws: WebSocket, clientId: string, clientIp: string, streamName: string): Promise<void> {
    try {
      // Get or create session for this stream
      const sessionId = await this.sessionManager.getOrCreateSession(streamName);
      
      const client: Client = {
        id: clientId,
        sessionId: sessionId,
        streamName: streamName,
        ws,
        subscriptions: new Set(),
        lastPing: Date.now(),
        isAlive: true
      };

      this.clients.set(clientId, client);
      await this.sessionManager.incrementConnectionCount(sessionId);
      
      logWithTimestamp('info', `[SERVER] Client connected: ${clientId} (session: ${sessionId}, stream: ${streamName}) from ${clientIp}`);
      logWithTimestamp('debug', `[SERVER] Total connected clients: ${this.clients.size}`);

      this.sendWelcomeMessage(client);
      await this.restoreClientSubscriptions(sessionId);

      // Set up WebSocket event handlers
      ws.on('message', async (data: WebSocket.RawData) => {
        logWithTimestamp('debug', `[SERVER] Received message from client ${clientId}: ${data.toString()}`);
        await this.handleClientMessage(client, data);
      });

      ws.on('pong', () => {
        client.lastPing = Date.now();
        client.isAlive = true;
      });

      ws.on('close', (code: number, reason: Buffer) => {
        logWithTimestamp('debug', `[SERVER] Client ${clientId} connection closed with code ${code}`);
        this.handleClientDisconnect(clientId, code, reason);
      });

      ws.on('error', (error: Error) => {
        logWithTimestamp('error', `WebSocket error for client ${clientId}:`, error);
        this.handleClientDisconnect(clientId, 1011, Buffer.from('Internal error'));
      });

    } catch (error) {
      logWithTimestamp('error', `[SERVER] Error initializing client session for ${clientId}:`, error);
      ws.close(1011, 'Session initialization failed');
    }
  }

  private async handleClientMessage(client: Client, data: WebSocket.RawData): Promise<void> {
    try {
      const message: ClientMessage = JSON.parse(data.toString());
      const validation = validateMessage(message);

      if (!validation.valid) {
        this.sendErrorMessage(client, validation.error!);
        return;
      }

      switch (message.type) {
        case 'subscribe':
          await this.handleSubscribe(client, message);
          break;
        case 'unsubscribe':
          await this.handleUnsubscribe(client, message);
          break;
        case 'broadcast':
          await this.handleBroadcast(client, message);
          break;
        default:
          this.sendErrorMessage(client, 'Unknown message type');
      }
    } catch (error) {
      logWithTimestamp('error', `Error handling message from client ${client.id}:`, error);
      this.sendErrorMessage(client, 'Invalid message format');
    }
  }

  private async handleSubscribe(client: Client, message: ClientMessage): Promise<void> {
    if (!message.channel) {
      logWithTimestamp('error', `[SERVER] Subscribe failed for client ${client.id}: no channel specified`);
      this.sendErrorMessage(client, 'Channel is required for subscription');
      return;
    }

    logWithTimestamp('debug', `[SERVER] Processing subscription for session ${client.sessionId} (client ${client.id}) to channel: ${message.channel}`);
    const subscribed = await this.subscriptionManager.subscribeClient(client.sessionId, message.channel);
    
    if (subscribed) {
      client.subscriptions.add(message.channel);
      logWithTimestamp('info', `[SERVER] Session ${client.sessionId} (client ${client.id}) subscribed to channel: ${message.channel}`);
      logWithTimestamp('debug', `[SERVER] Client ${client.id} now has ${client.subscriptions.size} subscriptions: [${Array.from(client.subscriptions).join(', ')}]`);
      
      await this.broadcastManager.deliverQueuedMessages(client.id);
    } else {
      logWithTimestamp('warn', `[SERVER] Session ${client.sessionId} (client ${client.id}) was already subscribed to channel: ${message.channel}`);
    }

    this.sendAckMessage(client, message.messageId);
  }

  private async handleUnsubscribe(client: Client, message: ClientMessage): Promise<void> {
    if (!message.channel) {
      this.sendErrorMessage(client, 'Channel is required for unsubscription');
      return;
    }

    const unsubscribed = await this.subscriptionManager.unsubscribeClient(client.sessionId, message.channel);
    
    if (unsubscribed) {
      client.subscriptions.delete(message.channel);
      logWithTimestamp('info', `Session ${client.sessionId} (client ${client.id}) unsubscribed from channel: ${message.channel}`);
    }

    this.sendAckMessage(client, message.messageId);
  }

  private async handleBroadcast(client: Client, message: ClientMessage): Promise<void> {
    const channel = message.channel || '*';
    const data = sanitizeData(message.data);

    logWithTimestamp('debug', `[SERVER] Processing broadcast from client ${client.id} to channel: ${channel}`);
    logWithTimestamp('debug', `[SERVER] Broadcast data:`, data);

    try {
      const messageId = await this.broadcastManager.broadcastToChannel(channel, data, client.id);
      this.sendAckMessage(client, message.messageId, messageId);
      
      logWithTimestamp('info', `[SERVER] Client ${client.id} broadcast to channel: ${channel} with messageId: ${messageId}`);
    } catch (error) {
      logWithTimestamp('error', `[SERVER] Broadcast error for client ${client.id}:`, error);
      this.sendErrorMessage(client, 'Failed to broadcast message');
    }
  }

  private sendWelcomeMessage(client: Client): void {
    const welcomeMessage: ServerMessage = {
      type: 'message',
      data: {
        type: 'welcome',
        clientId: client.id,
        sessionId: client.sessionId,
        streamName: client.streamName,
        serverTime: Date.now()
      },
      timestamp: Date.now()
    };

    this.sendMessage(client, welcomeMessage);
  }

  private sendAckMessage(client: Client, messageId?: string, broadcastMessageId?: string): void {
    const ackMessage: ServerMessage = {
      type: 'ack',
      messageId,
      data: broadcastMessageId ? { broadcastMessageId } : undefined,
      timestamp: Date.now()
    };

    this.sendMessage(client, ackMessage);
  }

  private sendErrorMessage(client: Client, error: string): void {
    const errorMessage: ServerMessage = {
      type: 'error',
      data: { error },
      timestamp: Date.now()
    };

    this.sendMessage(client, errorMessage);
  }

  private sendMessage(client: Client, message: ServerMessage): void {
    try {
      if (client.ws.readyState === WebSocket.OPEN) {
        const messageStr = JSON.stringify(message);
        logWithTimestamp('debug', `[SERVER] Sending message to client ${client.id}: ${messageStr}`);
        client.ws.send(messageStr);
      } else {
        logWithTimestamp('warn', `[SERVER] Cannot send message to client ${client.id}: WebSocket not open (state: ${client.ws.readyState})`);
      }
    } catch (error) {
      logWithTimestamp('error', `[SERVER] Error sending message to client ${client.id}:`, error);
    }
  }

  private async handleClientDisconnect(clientId: string, code: number, reason: Buffer): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client) return;

    await this.subscriptionManager.unsubscribeClientFromAll(client.sessionId);
    this.broadcastManager.clearClientQueue(clientId); // This uses legacy method that converts to session
    await this.sessionManager.decrementConnectionCount(client.sessionId);
    this.clients.delete(clientId);

    logWithTimestamp('info', `Client disconnected: ${clientId} (session: ${client.sessionId}, stream: ${client.streamName}) (code: ${code}, reason: ${reason.toString()})`);
  }

  private async restoreClientSubscriptions(sessionId: string): Promise<void> {
    try {
      const subscriptions = await this.subscriptionManager.restoreClientSubscriptions(sessionId);
      
      if (subscriptions.length > 0) {
        // Find client with this sessionId and restore their local subscriptions
        for (const [clientId, client] of this.clients.entries()) {
          if (client.sessionId === sessionId) {
            subscriptions.forEach(channel => client.subscriptions.add(channel));
            logWithTimestamp('info', `Restored ${subscriptions.length} subscriptions for session ${sessionId} (client ${clientId})`);
            break;
          }
        }
      }
    } catch (error) {
      logWithTimestamp('error', `Error restoring subscriptions for session ${sessionId}:`, error);
    }
  }

  private setupHeartbeat(): void {
    const interval = setInterval(() => {
      this.server.clients.forEach((ws: WebSocket) => {
        const client = Array.from(this.clients.values()).find(c => c.ws === ws);
        
        if (!client) return;

        if (!client.isAlive) {
          this.handleClientDisconnect(client.id, 1000, Buffer.from('Heartbeat timeout'));
          return;
        }

        client.isAlive = false;
        
        const pingMessage: ServerMessage = {
          type: 'ping',
          timestamp: Date.now()
        };

        try {
          ws.ping();
          this.sendMessage(client, pingMessage);
        } catch (error) {
          logWithTimestamp('error', `Error sending ping to client ${client.id}:`, error);
        }
      });
    }, this.config.pingInterval);

    this.server.on('close', () => {
      clearInterval(interval);
    });
  }

  private setupHealthChecks(): void {
    this.healthCheckInterval = setInterval(() => {
      this.broadcastManager.retryFailedDeliveries();
    }, 30000);
  }

  private getServerStats(): ServerStats {
    return {
      totalConnections: this.clients.size,
      activeConnections: Array.from(this.clients.values()).filter(c => c.isAlive).length,
      totalMessages: 0,
      messagesPerSecond: 0,
      channels: this.subscriptionManager.getChannelStats(),
      uptime: Date.now() - this.startTime
    };
  }

  async start(): Promise<void> {
    try {
      await this.redis.connect();
      logWithTimestamp('info', 'Connected to Redis');

      this.httpServer.listen(this.config.port, () => {
        logWithTimestamp('info', `Broadcast WebSocket server running on port ${this.config.port}`);
        logWithTimestamp('info', `CORS origin: ${this.config.corsOrigin}`);
        logWithTimestamp('info', `Redis URL: ${this.config.redisUrl}`);
      });
    } catch (error) {
      logWithTimestamp('error', 'Failed to start server:', error);
      process.exit(1);
    }
  }

  async stop(): Promise<void> {
    logWithTimestamp('info', 'Shutting down server...');

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    this.server.clients.forEach((ws: WebSocket) => {
      ws.close(1001, 'Server shutting down');
    });

    this.server.close();
    this.httpServer.close();
    await this.sessionManager.stop();
    await this.redis.disconnect();

    logWithTimestamp('info', 'Server shutdown complete');
  }
}

if (process.env.NODE_ENV !== 'test' && process.argv[1] && process.argv[1].endsWith('server.js')) {
  const server = new BroadcastServer();
  
  process.on('SIGINT', async () => {
    await server.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await server.stop();
    process.exit(0);
  });

  server.start().catch(console.error);
}