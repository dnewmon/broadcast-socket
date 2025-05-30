export interface ClientMessage {
    type: 'subscribe' | 'unsubscribe' | 'broadcast';
    channel?: string;
    data?: any;
    messageId?: string;
}
export interface ServerMessage {
    type: 'message' | 'ack' | 'error' | 'ping';
    channel?: string;
    data?: any;
    messageId?: string;
    timestamp: number;
}
export interface Client {
    id: string;
    ws: any;
    subscriptions: Set<string>;
    lastPing: number;
    isAlive: boolean;
}
export interface BroadcastMessage {
    channel: string;
    data: any;
    messageId: string;
    timestamp: number;
    senderId?: string;
}
export interface SubscriptionState {
    clientId: string;
    channels: string[];
    lastActivity: number;
}
export interface ServerStats {
    totalConnections: number;
    activeConnections: number;
    totalMessages: number;
    messagesPerSecond: number;
    channels: Record<string, number>;
    uptime: number;
}
export interface ClusterMessage {
    type: 'broadcast' | 'client-connect' | 'client-disconnect' | 'ping';
    data?: any;
    workerId: number;
    timestamp: number;
}
export interface ServerConfig {
    port: number;
    corsOrigin: string;
    redisUrl: string;
    workers: number;
    pingInterval: number;
    heartbeatTimeout: number;
}
//# sourceMappingURL=types.d.ts.map