export declare class BroadcastServer {
    private server;
    private httpServer;
    private app;
    private redis;
    private subscriptionManager;
    private broadcastManager;
    private clients;
    private startTime;
    private config;
    private rateLimiter;
    private healthCheckInterval;
    constructor();
    private setupExpress;
    private setupWebSocketServer;
    private handleClientMessage;
    private handleSubscribe;
    private handleUnsubscribe;
    private handleBroadcast;
    private handleClientAck;
    private sendWelcomeMessage;
    private sendAckMessage;
    private sendErrorMessage;
    private sendMessage;
    private handleClientDisconnect;
    private restoreClientSubscriptions;
    private setupHeartbeat;
    private setupHealthChecks;
    private getServerStats;
    start(): Promise<void>;
    stop(): Promise<void>;
}
//# sourceMappingURL=server.d.ts.map