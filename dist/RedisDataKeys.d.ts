export declare class RedisDataKeys {
    private static readonly PREFIX;
    static message(messageId: string): string;
    static clientSubscriptions(clientId: string): string;
    static broadcastChannel(channel: string): string;
    static broadcastPattern(): string;
    static totalMessagesStats(): string;
    static channelMessagesStats(channel: string): string;
    static messageHistoryPattern(): string;
    static channelStream(channel: string): string;
    static globalStream(): string;
    static clientConsumerGroup(clientId: string): string;
    static clientConsumerName(workerId: string, clientId: string): string;
    static clientAckState(clientId: string, streamKey: string): string;
    static streamPattern(): string;
    static clientPendingMessages(clientId: string): string;
}
//# sourceMappingURL=RedisDataKeys.d.ts.map