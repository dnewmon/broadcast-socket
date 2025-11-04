export interface ServerConfig {
    port: number;
    corsOrigin: string;
}

export interface ChannelMessage {
    data: any;
    timestamp: number;
    sender?: string;
}
