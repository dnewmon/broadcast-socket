"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BroadcastServer = void 0;
const ws_1 = __importDefault(require("ws"));
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const http_1 = require("http");
const redis_1 = require("./redis");
const subscription_1 = require("./subscription");
const broadcast_1 = require("./broadcast");
const utils_1 = require("./utils");
class BroadcastServer {
    constructor() {
        this.clients = new Map();
        this.startTime = Date.now();
        this.config = (0, utils_1.getServerConfig)();
        this.rateLimiter = (0, utils_1.createRateLimiter)(100, 60000);
        this.app = (0, express_1.default)();
        this.setupExpress();
        this.httpServer = (0, http_1.createServer)(this.app);
        this.server = new ws_1.default.Server({ server: this.httpServer });
        this.redis = new redis_1.RedisManager(this.config.redisUrl);
        this.subscriptionManager = new subscription_1.SubscriptionManager(this.redis);
        this.broadcastManager = new broadcast_1.BroadcastManager(this.redis, this.subscriptionManager, this.clients);
        this.setupWebSocketServer();
        this.setupHealthChecks();
    }
    setupExpress() {
        this.app.use((0, cors_1.default)({ origin: this.config.corsOrigin }));
        this.app.use(express_1.default.json({ limit: '1mb' }));
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'healthy',
                uptime: Date.now() - this.startTime,
                connections: this.clients.size
            });
        });
        this.app.get('/stats', (req, res) => {
            res.json(this.getServerStats());
        });
        this.app.post('/broadcast', async (req, res) => {
            try {
                const { channel, data } = req.body;
                if (!channel || !data) {
                    return res.status(400).json({ error: 'Channel and data are required' });
                }
                const messageId = await this.broadcastManager.broadcastToChannel(channel, (0, utils_1.sanitizeData)(data));
                res.json({ messageId, timestamp: Date.now() });
            }
            catch (error) {
                (0, utils_1.logWithTimestamp)('error', 'HTTP broadcast error:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
    }
    setupWebSocketServer() {
        this.server.on('connection', (ws, req) => {
            const clientId = (0, utils_1.generateClientId)();
            const clientIp = req.socket.remoteAddress || 'unknown';
            if (!this.rateLimiter(clientIp)) {
                (0, utils_1.logWithTimestamp)('warn', `Rate limit exceeded for IP: ${clientIp}`);
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
            (0, utils_1.logWithTimestamp)('info', `Client connected: ${clientId} from ${clientIp}`);
            this.sendWelcomeMessage(client);
            this.restoreClientSubscriptions(clientId);
            ws.on('message', async (data) => {
                await this.handleClientMessage(client, data);
            });
            ws.on('pong', () => {
                client.lastPing = Date.now();
                client.isAlive = true;
            });
            ws.on('close', (code, reason) => {
                this.handleClientDisconnect(clientId, code, reason);
            });
            ws.on('error', (error) => {
                (0, utils_1.logWithTimestamp)('error', `WebSocket error for client ${clientId}:`, error);
                this.handleClientDisconnect(clientId, 1011, Buffer.from('Internal error'));
            });
        });
        this.setupHeartbeat();
        (0, utils_1.logWithTimestamp)('info', `WebSocket server initialized`);
    }
    async handleClientMessage(client, data) {
        try {
            const message = JSON.parse(data.toString());
            const validation = (0, utils_1.validateMessage)(message);
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
            (0, utils_1.logWithTimestamp)('error', `Error handling message from client ${client.id}:`, error);
            this.sendErrorMessage(client, 'Invalid message format');
        }
    }
    async handleSubscribe(client, message) {
        if (!message.channel) {
            this.sendErrorMessage(client, 'Channel is required for subscription');
            return;
        }
        const subscribed = await this.subscriptionManager.subscribeClient(client.id, message.channel);
        if (subscribed) {
            client.subscriptions.add(message.channel);
            (0, utils_1.logWithTimestamp)('info', `Client ${client.id} subscribed to channel: ${message.channel}`);
            await this.broadcastManager.deliverQueuedMessages(client.id);
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
            (0, utils_1.logWithTimestamp)('info', `Client ${client.id} unsubscribed from channel: ${message.channel}`);
        }
        this.sendAckMessage(client, message.messageId);
    }
    async handleBroadcast(client, message) {
        const channel = message.channel || '*';
        const data = (0, utils_1.sanitizeData)(message.data);
        try {
            const messageId = await this.broadcastManager.broadcastToChannel(channel, data, client.id);
            this.sendAckMessage(client, message.messageId, messageId);
            (0, utils_1.logWithTimestamp)('info', `Client ${client.id} broadcast to channel: ${channel}`);
        }
        catch (error) {
            (0, utils_1.logWithTimestamp)('error', `Broadcast error for client ${client.id}:`, error);
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
            if (client.ws.readyState === ws_1.default.OPEN) {
                client.ws.send(JSON.stringify(message));
            }
        }
        catch (error) {
            (0, utils_1.logWithTimestamp)('error', `Error sending message to client ${client.id}:`, error);
        }
    }
    async handleClientDisconnect(clientId, code, reason) {
        const client = this.clients.get(clientId);
        if (!client)
            return;
        await this.subscriptionManager.unsubscribeClientFromAll(clientId);
        this.broadcastManager.clearClientQueue(clientId);
        this.clients.delete(clientId);
        (0, utils_1.logWithTimestamp)('info', `Client disconnected: ${clientId} (code: ${code}, reason: ${reason.toString()})`);
    }
    async restoreClientSubscriptions(clientId) {
        try {
            const subscriptions = await this.subscriptionManager.restoreClientSubscriptions(clientId);
            const client = this.clients.get(clientId);
            if (client && subscriptions.length > 0) {
                subscriptions.forEach(channel => client.subscriptions.add(channel));
                (0, utils_1.logWithTimestamp)('info', `Restored ${subscriptions.length} subscriptions for client ${clientId}`);
            }
        }
        catch (error) {
            (0, utils_1.logWithTimestamp)('error', `Error restoring subscriptions for client ${clientId}:`, error);
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
                    (0, utils_1.logWithTimestamp)('error', `Error sending ping to client ${client.id}:`, error);
                }
            });
        }, this.config.pingInterval);
        this.server.on('close', () => {
            clearInterval(interval);
        });
    }
    setupHealthChecks() {
        setInterval(() => {
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
            (0, utils_1.logWithTimestamp)('info', 'Connected to Redis');
            this.httpServer.listen(this.config.port, () => {
                (0, utils_1.logWithTimestamp)('info', `Broadcast WebSocket server running on port ${this.config.port}`);
                (0, utils_1.logWithTimestamp)('info', `CORS origin: ${this.config.corsOrigin}`);
                (0, utils_1.logWithTimestamp)('info', `Redis URL: ${this.config.redisUrl}`);
            });
        }
        catch (error) {
            (0, utils_1.logWithTimestamp)('error', 'Failed to start server:', error);
            process.exit(1);
        }
    }
    async stop() {
        (0, utils_1.logWithTimestamp)('info', 'Shutting down server...');
        this.server.clients.forEach((ws) => {
            ws.close(1001, 'Server shutting down');
        });
        this.server.close();
        this.httpServer.close();
        await this.redis.disconnect();
        (0, utils_1.logWithTimestamp)('info', 'Server shutdown complete');
    }
}
exports.BroadcastServer = BroadcastServer;
if (require.main === module) {
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