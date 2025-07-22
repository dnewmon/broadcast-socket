export class RedisDataKeys {
    static PREFIX = 'sockets:';
    static message(messageId) {
        return `${this.PREFIX}message:${messageId}`;
    }
    static clientSubscriptions(clientId) {
        return `${this.PREFIX}client:${clientId}:subscriptions`;
    }
    static broadcastChannel(channel) {
        return `${this.PREFIX}broadcast:${channel}`;
    }
    static broadcastPattern() {
        return `${this.PREFIX}broadcast:*`;
    }
    static totalMessagesStats() {
        return `${this.PREFIX}stats:total_messages`;
    }
    static channelMessagesStats(channel) {
        return `${this.PREFIX}stats:channel:${channel}:messages`;
    }
    static messageHistoryPattern() {
        return `${this.PREFIX}message:*`;
    }
    static channelStream(channel) {
        return `${this.PREFIX}stream:channel:${channel}`;
    }
    static globalStream() {
        return `${this.PREFIX}stream:global`;
    }
    static clientConsumerGroup(clientId) {
        return `client:${clientId}`;
    }
    static clientConsumerName(workerId, clientId) {
        return `worker:${workerId}:client:${clientId}`;
    }
    static clientAckState(clientId, streamKey) {
        const streamSuffix = streamKey.replace(`${this.PREFIX}stream:`, '');
        return `${this.PREFIX}client:${clientId}:ack:${streamSuffix}`;
    }
    static streamPattern() {
        return `${this.PREFIX}stream:*`;
    }
    static clientPendingMessages(clientId) {
        return `${this.PREFIX}client:${clientId}:pending`;
    }
}
//# sourceMappingURL=RedisDataKeys.js.map