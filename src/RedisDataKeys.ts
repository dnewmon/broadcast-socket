/**
 * Central location for generating all Redis keys used throughout the broadcast socket system.
 * All keys are prefixed with "sockets:" for namespace isolation in shared Redis instances.
 */
export class RedisDataKeys {
    private static readonly PREFIX = 'sockets:';
    
    /**
     * Message timeout in milliseconds (10 minutes).
     * Messages older than this will be automatically acknowledged and cleaned up.
     */
    static readonly MESSAGE_TIMEOUT_MS = 10 * 60 * 1000;

    /**
     * TTL for client subscriptions in Redis (1 hour in seconds).
     */
    static readonly CLIENT_SUBSCRIPTIONS_TTL = 3600;

    /**
     * TTL for Redis streams (1 hour in seconds).
     */
    static readonly STREAM_TTL = 3600;

    /**
     * TTL for counters in Redis (1 hour in seconds).
     */
    static readonly COUNTER_TTL = 3600;

    /**
     * Maximum length for Redis streams to prevent unbounded growth.
     */
    static readonly STREAM_MAX_LENGTH = 20;

    /**
     * Default batch size for reading messages from Redis streams.
     */
    static readonly STREAM_BATCH_SIZE = 20;

    /**
     * Key for storing broadcast messages with TTL.
     * Format: sockets:message:{messageId}
     */
    static message(messageId: string): string {
        return `${this.PREFIX}message:${messageId}`;
    }

    /**
     * Key for storing client subscription state.
     * Format: sockets:client:{clientId}:subscriptions
     */
    static clientSubscriptions(clientId: string): string {
        return `${this.PREFIX}client:${clientId}:subscriptions`;
    }

    /**
     * Key for publishing messages to specific broadcast channels.
     * Format: sockets:broadcast:{channel}
     */
    static broadcastChannel(channel: string): string {
        return `${this.PREFIX}broadcast:${channel}`;
    }

    /**
     * Pattern for subscribing to all broadcast channels.
     * Format: sockets:broadcast:*
     */
    static broadcastPattern(): string {
        return `${this.PREFIX}broadcast:*`;
    }

    /**
     * Key for tracking total message statistics.
     * Format: sockets:stats:total_messages
     */
    static totalMessagesStats(): string {
        return `${this.PREFIX}stats:total_messages`;
    }

    /**
     * Key for tracking per-channel message statistics.
     * Format: sockets:stats:channel:{channel}:messages
     */
    static channelMessagesStats(channel: string): string {
        return `${this.PREFIX}stats:channel:${channel}:messages`;
    }

    /**
     * Pattern for querying all message history keys.
     * Format: sockets:message:*
     */
    static messageHistoryPattern(): string {
        return `${this.PREFIX}message:*`;
    }

    /**
     * Key for Redis Streams - channel-specific message streams.
     * Format: sockets:stream:channel:{channel}
     */
    static channelStream(channel: string): string {
        return `${this.PREFIX}stream:channel:${channel}`;
    }

    /**
     * Key for Redis Streams - global broadcast stream for all clients.
     * Format: sockets:stream:global
     */
    static globalStream(): string {
        return `${this.PREFIX}stream:global`;
    }

    /**
     * Consumer group name for a specific client.
     * Format: client:{clientId}
     */
    static clientConsumerGroup(clientId: string): string {
        return `client:${clientId}`;
    }

    /**
     * Consumer name for a specific worker process handling a client.
     * Format: worker:{workerId}:client:{clientId}
     */
    static clientConsumerName(workerId: string, clientId: string): string {
        return `worker:${workerId}:client:${clientId}`;
    }

    /**
     * Key for tracking client's last acknowledged message ID per stream.
     * Format: sockets:client:{clientId}:ack:{streamKey}
     */
    static clientAckState(clientId: string, streamKey: string): string {
        const streamSuffix = streamKey.replace(`${this.PREFIX}stream:`, '');
        return `${this.PREFIX}client:${clientId}:ack:${streamSuffix}`;
    }

    /**
     * Pattern for finding all stream keys.
     * Format: sockets:stream:*
     */
    static streamPattern(): string {
        return `${this.PREFIX}stream:*`;
    }

    /**
     * Key for storing pending message metadata for offline clients.
     * Format: sockets:client:{clientId}:pending
     */
    static clientPendingMessages(clientId: string): string {
        return `${this.PREFIX}client:${clientId}:pending`;
    }
}
