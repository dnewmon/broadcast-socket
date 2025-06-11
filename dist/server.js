import WebSocket, { WebSocketServer } from 'ws';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { RedisManager } from './redis.js';
import { SubscriptionManager } from './subscription.js';
import { BroadcastManager } from './broadcast.js';
import { getServerConfig, validateMessage, sanitizeData, logWithTimestamp, createRateLimiter, generateClientId } from './utils.js';
export class BroadcastServer {
    server;
    httpServer;
    app;
    redis;
    subscriptionManager;
    broadcastManager;
    clients = new Map();
    startTime = Date.now();
    config = getServerConfig();
    rateLimiter = createRateLimiter(100, 60000);
    healthCheckInterval = null;
    constructor() {
        this.app = express();
        this.setupExpress();
        this.httpServer = createServer(this.app);
        this.server = new WebSocketServer({ server: this.httpServer });
        this.redis = new RedisManager(this.config.redisUrl);
        this.subscriptionManager = new SubscriptionManager(this.redis);
        this.broadcastManager = new BroadcastManager(this.redis, this.subscriptionManager, this.clients);
        this.setupWebSocketServer();
        this.setupHealthChecks();
    }
    setupExpress() {
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
                const messageId = await this.broadcastManager.broadcastToChannel(channel, sanitizeData(data));
                res.json({ messageId, timestamp: Date.now() });
            }
            catch (error) {
                logWithTimestamp('error', 'HTTP broadcast error:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
    }
    setupWebSocketServer() {
        this.server.on('connection', (ws, req) => {
            const clientId = generateClientId();
            const clientIp = req.socket.remoteAddress || 'unknown';
            logWithTimestamp('debug', `[SERVER] New WebSocket connection attempt from ${clientIp}`);
            if (!this.rateLimiter(clientIp)) {
                logWithTimestamp('warn', `Rate limit exceeded for IP: ${clientIp}`);
                ws.close(1008, 'Rate limit exceeded');
                return;
            }
            const client = {
                id: clientId,
                ws,
                subscriptions: new Set(),
                lastPing: Date.now(),
                isAlive: true
            };
            this.clients.set(clientId, client);
            logWithTimestamp('info', `[SERVER] Client connected: ${clientId} from ${clientIp}`);
            logWithTimestamp('debug', `[SERVER] Total connected clients: ${this.clients.size}`);
            this.sendWelcomeMessage(client);
            this.restoreClientSubscriptions(clientId);
            ws.on('message', async (data) => {
                logWithTimestamp('debug', `[SERVER] Received message from client ${clientId}: ${data.toString()}`);
                await this.handleClientMessage(client, data);
            });
            ws.on('pong', () => {
                client.lastPing = Date.now();
                client.isAlive = true;
            });
            ws.on('close', (code, reason) => {
                logWithTimestamp('debug', `[SERVER] Client ${clientId} connection closed with code ${code}`);
                this.handleClientDisconnect(clientId, code, reason);
            });
            ws.on('error', (error) => {
                logWithTimestamp('error', `WebSocket error for client ${clientId}:`, error);
                this.handleClientDisconnect(clientId, 1011, Buffer.from('Internal error'));
            });
        });
        this.setupHeartbeat();
        logWithTimestamp('info', `WebSocket server initialized`);
    }
    async handleClientMessage(client, data) {
        try {
            const message = JSON.parse(data.toString());
            const validation = validateMessage(message);
            if (!validation.valid) {
                this.sendErrorMessage(client, validation.error);
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
        }
        catch (error) {
            logWithTimestamp('error', `Error handling message from client ${client.id}:`, error);
            this.sendErrorMessage(client, 'Invalid message format');
        }
    }
    async handleSubscribe(client, message) {
        if (!message.channel) {
            logWithTimestamp('error', `[SERVER] Subscribe failed for client ${client.id}: no channel specified`);
            this.sendErrorMessage(client, 'Channel is required for subscription');
            return;
        }
        logWithTimestamp('debug', `[SERVER] Processing subscription for client ${client.id} to channel: ${message.channel}`);
        const subscribed = await this.subscriptionManager.subscribeClient(client.id, message.channel);
        if (subscribed) {
            client.subscriptions.add(message.channel);
            logWithTimestamp('info', `[SERVER] Client ${client.id} subscribed to channel: ${message.channel}`);
            logWithTimestamp('debug', `[SERVER] Client ${client.id} now has ${client.subscriptions.size} subscriptions: [${Array.from(client.subscriptions).join(', ')}]`);
            await this.broadcastManager.deliverQueuedMessages(client.id);
        }
        else {
            logWithTimestamp('warn', `[SERVER] Client ${client.id} was already subscribed to channel: ${message.channel}`);
        }
        this.sendAckMessage(client, message.messageId);
    }
    async handleUnsubscribe(client, message) {
        if (!message.channel) {
            this.sendErrorMessage(client, 'Channel is required for unsubscription');
            return;
        }
        const unsubscribed = await this.subscriptionManager.unsubscribeClient(client.id, message.channel);
        if (unsubscribed) {
            client.subscriptions.delete(message.channel);
            logWithTimestamp('info', `Client ${client.id} unsubscribed from channel: ${message.channel}`);
        }
        this.sendAckMessage(client, message.messageId);
    }
    async handleBroadcast(client, message) {
        const channel = message.channel || '*';
        const data = sanitizeData(message.data);
        logWithTimestamp('debug', `[SERVER] Processing broadcast from client ${client.id} to channel: ${channel}`);
        logWithTimestamp('debug', `[SERVER] Broadcast data:`, data);
        try {
            const messageId = await this.broadcastManager.broadcastToChannel(channel, data, client.id);
            this.sendAckMessage(client, message.messageId, messageId);
            logWithTimestamp('info', `[SERVER] Client ${client.id} broadcast to channel: ${channel} with messageId: ${messageId}`);
        }
        catch (error) {
            logWithTimestamp('error', `[SERVER] Broadcast error for client ${client.id}:`, error);
            this.sendErrorMessage(client, 'Failed to broadcast message');
        }
    }
    sendWelcomeMessage(client) {
        const welcomeMessage = {
            type: 'message',
            data: {
                type: 'welcome',
                clientId: client.id,
                serverTime: Date.now()
            },
            timestamp: Date.now()
        };
        this.sendMessage(client, welcomeMessage);
    }
    sendAckMessage(client, messageId, broadcastMessageId) {
        const ackMessage = {
            type: 'ack',
            messageId,
            data: broadcastMessageId ? { broadcastMessageId } : undefined,
            timestamp: Date.now()
        };
        this.sendMessage(client, ackMessage);
    }
    sendErrorMessage(client, error) {
        const errorMessage = {
            type: 'error',
            data: { error },
            timestamp: Date.now()
        };
        this.sendMessage(client, errorMessage);
    }
    sendMessage(client, message) {
        try {
            if (client.ws.readyState === WebSocket.OPEN) {
                const messageStr = JSON.stringify(message);
                logWithTimestamp('debug', `[SERVER] Sending message to client ${client.id}: ${messageStr}`);
                client.ws.send(messageStr);
            }
            else {
                logWithTimestamp('warn', `[SERVER] Cannot send message to client ${client.id}: WebSocket not open (state: ${client.ws.readyState})`);
            }
        }
        catch (error) {
            logWithTimestamp('error', `[SERVER] Error sending message to client ${client.id}:`, error);
        }
    }
    async handleClientDisconnect(clientId, code, reason) {
        const client = this.clients.get(clientId);
        if (!client)
            return;
        await this.subscriptionManager.unsubscribeClientFromAll(clientId);
        this.broadcastManager.clearClientQueue(clientId);
        this.clients.delete(clientId);
        logWithTimestamp('info', `Client disconnected: ${clientId} (code: ${code}, reason: ${reason.toString()})`);
    }
    async restoreClientSubscriptions(clientId) {
        try {
            const subscriptions = await this.subscriptionManager.restoreClientSubscriptions(clientId);
            const client = this.clients.get(clientId);
            if (client && subscriptions.length > 0) {
                subscriptions.forEach(channel => client.subscriptions.add(channel));
                logWithTimestamp('info', `Restored ${subscriptions.length} subscriptions for client ${clientId}`);
            }
        }
        catch (error) {
            logWithTimestamp('error', `Error restoring subscriptions for client ${clientId}:`, error);
        }
    }
    setupHeartbeat() {
        const interval = setInterval(() => {
            this.server.clients.forEach((ws) => {
                const client = Array.from(this.clients.values()).find(c => c.ws === ws);
                if (!client)
                    return;
                if (!client.isAlive) {
                    this.handleClientDisconnect(client.id, 1000, Buffer.from('Heartbeat timeout'));
                    return;
                }
                client.isAlive = false;
                const pingMessage = {
                    type: 'ping',
                    timestamp: Date.now()
                };
                try {
                    ws.ping();
                    this.sendMessage(client, pingMessage);
                }
                catch (error) {
                    logWithTimestamp('error', `Error sending ping to client ${client.id}:`, error);
                }
            });
        }, this.config.pingInterval);
        this.server.on('close', () => {
            clearInterval(interval);
        });
    }
    setupHealthChecks() {
        this.healthCheckInterval = setInterval(() => {
            this.broadcastManager.retryFailedDeliveries();
        }, 30000);
    }
    getServerStats() {
        return {
            totalConnections: this.clients.size,
            activeConnections: Array.from(this.clients.values()).filter(c => c.isAlive).length,
            totalMessages: 0,
            messagesPerSecond: 0,
            channels: this.subscriptionManager.getChannelStats(),
            uptime: Date.now() - this.startTime
        };
    }
    async start() {
        try {
            await this.redis.connect();
            logWithTimestamp('info', 'Connected to Redis');
            this.httpServer.listen(this.config.port, () => {
                logWithTimestamp('info', `Broadcast WebSocket server running on port ${this.config.port}`);
                logWithTimestamp('info', `CORS origin: ${this.config.corsOrigin}`);
                logWithTimestamp('info', `Redis URL: ${this.config.redisUrl}`);
            });
        }
        catch (error) {
            logWithTimestamp('error', 'Failed to start server:', error);
            process.exit(1);
        }
    }
    async stop() {
        logWithTimestamp('info', 'Shutting down server...');
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }
        this.server.clients.forEach((ws) => {
            ws.close(1001, 'Server shutting down');
        });
        this.server.close();
        this.httpServer.close();
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
//# sourceMappingURL=server.js.map