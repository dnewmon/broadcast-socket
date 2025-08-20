export declare class RedisKeys {
    private static readonly PREFIX;
    static message(messageId: string): string;
    static clientSubscriptions(clientId: string): string;
    static broadcastChannel(channel: string): string;
    static statsTotalMessages(): string;
    static statsChannelMessages(channel: string): string;
    static session(sessionId: string): string;
    static stream(streamName: string): string;
    static broadcastChannelPattern(): string;
    static messagePattern(): string;
    static sessionPattern(): string;
    static getPrefix(): string;
}
//# sourceMappingURL=redis_keys.d.ts.map