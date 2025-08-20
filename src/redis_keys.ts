/**
 * Centralized Redis key management for the broadcast socket service.
 * All keys are prefixed with "websockets:" to prevent collisions with other systems.
 */
export class RedisKeys {
  private static readonly PREFIX = 'websockets:';

  /**
   * Generate key for message storage
   * @param messageId - Unique message identifier
   * @returns Redis key for message storage
   */
  static message(messageId: string): string {
    return `${this.PREFIX}message:${messageId}`;
  }

  /**
   * Generate key for client subscriptions storage
   * @param clientId - Unique client identifier (sessionId)
   * @returns Redis key for client subscriptions
   */
  static clientSubscriptions(clientId: string): string {
    return `${this.PREFIX}client:${clientId}:subscriptions`;
  }

  /**
   * Generate key for broadcast channel publishing
   * @param channel - Channel name (* for global broadcasts)
   * @returns Redis key for broadcast channel
   */
  static broadcastChannel(channel: string): string {
    return `${this.PREFIX}broadcast:${channel}`;
  }

  /**
   * Generate key for total messages statistics counter
   * @returns Redis key for total messages counter
   */
  static statsTotalMessages(): string {
    return `${this.PREFIX}stats:total_messages`;
  }

  /**
   * Generate key for channel-specific message statistics counter
   * @param channel - Channel name
   * @returns Redis key for channel message counter
   */
  static statsChannelMessages(channel: string): string {
    return `${this.PREFIX}stats:channel:${channel}:messages`;
  }

  /**
   * Generate key for user session storage
   * @param sessionId - Unique session identifier
   * @returns Redis key for session data
   */
  static session(sessionId: string): string {
    return `${this.PREFIX}session:${sessionId}`;
  }

  /**
   * Generate key for stream name to session ID mapping
   * @param streamName - Stream name identifier
   * @returns Redis key for stream mapping
   */
  static stream(streamName: string): string {
    return `${this.PREFIX}stream:${streamName}`;
  }

  /**
   * Get the wildcard pattern for broadcast channels
   * @returns Redis pattern for all broadcast channels
   */
  static broadcastChannelPattern(): string {
    return `${this.PREFIX}broadcast:*`;
  }

  /**
   * Get the wildcard pattern for all message keys
   * @returns Redis pattern for all message keys
   */
  static messagePattern(): string {
    return `${this.PREFIX}message:*`;
  }

  /**
   * Get the wildcard pattern for all session keys
   * @returns Redis pattern for all session keys
   */
  static sessionPattern(): string {
    return `${this.PREFIX}session:*`;
  }

  /**
   * Get the prefix used for all websocket keys
   * @returns The websockets prefix
   */
  static getPrefix(): string {
    return this.PREFIX;
  }
}