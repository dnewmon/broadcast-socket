export interface BroadcastSocketOptions {
    reconnect?: boolean;
    reconnectAttempts?: number;
    reconnectInterval?: number;
    heartbeatInterval?: number;
    messageQueueSize?: number;
    debug?: boolean;
}
export interface BroadcastSocketState {
    connected: boolean;
    connecting: boolean;
    error: string | null;
    reconnectAttempt: number;
    lastConnected: number | null;
}
export interface BroadcastMessage {
    type: 'message' | 'ack' | 'error' | 'ping';
    channel?: string;
    data?: any;
    messageId?: string;
    timestamp: number;
}
export interface SendMessage {
    type: 'subscribe' | 'unsubscribe' | 'broadcast';
    channel?: string;
    data?: any;
    messageId?: string;
}
export interface SubscriptionState {
    channel: string;
    subscribed: boolean;
    subscribing: boolean;
    error: string | null;
    messageCount: number;
    lastMessage: number | null;
}
export interface BroadcastHookReturn {
    state: BroadcastSocketState;
    send: (message: SendMessage) => Promise<void>;
    subscribe: (channel: string) => Promise<void>;
    unsubscribe: (channel: string) => Promise<void>;
    broadcast: (channel: string, data: any) => Promise<void>;
    disconnect: () => void;
    reconnect: () => void;
}
export interface SubscriptionHookReturn {
    state: SubscriptionState;
    messages: BroadcastMessage[];
    subscribe: () => Promise<void>;
    unsubscribe: () => Promise<void>;
    clearMessages: () => void;
}
export interface BroadcastContextValue {
    socket: WebSocket | null;
    state: BroadcastSocketState;
    subscribe: (channel: string) => Promise<void>;
    unsubscribe: (channel: string) => Promise<void>;
    broadcast: (channel: string, data: any) => Promise<void>;
    send: (message: SendMessage) => Promise<void>;
}
//# sourceMappingURL=types.d.ts.map