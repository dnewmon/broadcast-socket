export interface ClientMessage {
    type: 'subscribe' | 'unsubscribe' | 'broadcast';
    channel?: string;
    data?: unknown;
    messageId?: string;
    streamName?: string;
}
export interface ServerMessage {
    type: 'message' | 'ack' | 'error' | 'ping';
    channel?: string | undefined;
    data?: unknown;
    messageId?: string | undefined;
    timestamp: number;
}
import { WebSocket } from 'ws';
export interface Client {
    id: string;
    sessionId: string;
    streamName: string;
    ws: WebSocket;
    subscriptions: Set<string>;
    lastPing: number;
    isAlive: boolean;
}
export interface BroadcastMessage {
    channel: string;
    data: unknown;
    messageId: string;
    timestamp: number;
    senderId?: string | undefined;
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
    data?: unknown;
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
export interface WorkerStatsData {
    connections?: number;
    messages?: number;
    uptime?: number;
}
export interface UserSession {
    sessionId: string;
    streamName: string;
    createdAt: number;
    lastActivity: number;
    activeConnections: number;
}
export interface SessionLookup {
    [streamName: string]: string;
}
//# sourceMappingURL=types.d.ts.map