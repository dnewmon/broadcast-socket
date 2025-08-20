export class RedisKeys {
    static PREFIX = 'websockets:';
    static message(messageId) {
        return `${this.PREFIX}message:${messageId}`;
    }
    static clientSubscriptions(clientId) {
        return `${this.PREFIX}client:${clientId}:subscriptions`;
    }
    static broadcastChannel(channel) {
        return `${this.PREFIX}broadcast:${channel}`;
    }
    static statsTotalMessages() {
        return `${this.PREFIX}stats:total_messages`;
    }
    static statsChannelMessages(channel) {
        return `${this.PREFIX}stats:channel:${channel}:messages`;
    }
    static session(sessionId) {
        return `${this.PREFIX}session:${sessionId}`;
    }
    static stream(streamName) {
        return `${this.PREFIX}stream:${streamName}`;
    }
    static broadcastChannelPattern() {
        return `${this.PREFIX}broadcast:*`;
    }
    static messagePattern() {
        return `${this.PREFIX}message:*`;
    }
    static sessionPattern() {
        return `${this.PREFIX}session:*`;
    }
    static getPrefix() {
        return this.PREFIX;
    }
}
//# sourceMappingURL=redis_keys.js.map