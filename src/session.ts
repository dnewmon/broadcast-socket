import { v4 as uuidv4 } from 'uuid';
import { RedisManager } from './redis.js';
import { UserSession } from './types.js';
import { logWithTimestamp } from './utils.js';
import { RedisKeys } from './redis_keys.js';

export class UserSessionManager {
  private redis: RedisManager;
  private sessionTtl: number = 24 * 60 * 60; // 24 hours in seconds
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(redis: RedisManager) {
    this.redis = redis;
    this.startCleanupTask();
  }

  async getOrCreateSession(streamName: string = 'default'): Promise<string> {
    try {
      // First check if a session already exists for this stream
      const sessionId = await this.getSessionIdByStream(streamName);
      
      if (sessionId) {
        // Update last activity and return existing session
        await this.updateSessionActivity(sessionId);
        logWithTimestamp('debug', `[SESSION] Found existing session ${sessionId} for stream ${streamName}`);
        return sessionId;
      }

      // Create new session
      const newSessionId = uuidv4();
      const session: UserSession = {
        sessionId: newSessionId,
        streamName,
        createdAt: Date.now(),
        lastActivity: Date.now(),
        activeConnections: 0
      };

      await this.createSession(session);
      logWithTimestamp('info', `[SESSION] Created new session ${newSessionId} for stream ${streamName}`);
      
      return newSessionId;
    } catch (error) {
      logWithTimestamp('error', '[SESSION] Error getting/creating session:', error);
      throw error;
    }
  }

  async updateSessionActivity(sessionId: string): Promise<void> {
    try {
      const sessionKey = RedisKeys.session(sessionId);
      const client = this.redis.getClient();
      const exists = await client.exists(sessionKey);
      
      if (!exists) {
        logWithTimestamp('warn', `[SESSION] Session ${sessionId} not found for activity update`);
        return;
      }

      await client.hSet(sessionKey, 'lastActivity', Date.now().toString());
      await client.expire(sessionKey, this.sessionTtl);
      
      logWithTimestamp('debug', `[SESSION] Updated activity for session ${sessionId}`);
    } catch (error) {
      logWithTimestamp('error', '[SESSION] Error updating session activity:', error);
    }
  }

  async incrementConnectionCount(sessionId: string): Promise<void> {
    try {
      const sessionKey = RedisKeys.session(sessionId);
      const client = this.redis.getClient();
      await client.hIncrBy(sessionKey, 'activeConnections', 1);
      await this.updateSessionActivity(sessionId);
      
      logWithTimestamp('debug', `[SESSION] Incremented connection count for session ${sessionId}`);
    } catch (error) {
      logWithTimestamp('error', '[SESSION] Error incrementing connection count:', error);
    }
  }

  async decrementConnectionCount(sessionId: string): Promise<void> {
    try {
      const sessionKey = RedisKeys.session(sessionId);
      const client = this.redis.getClient();
      const connections = await client.hIncrBy(sessionKey, 'activeConnections', -1);
      
      // Ensure it doesn't go below 0
      if (connections < 0) {
        await client.hSet(sessionKey, 'activeConnections', '0');
      }
      
      await this.updateSessionActivity(sessionId);
      logWithTimestamp('debug', `[SESSION] Decremented connection count for session ${sessionId}`);
    } catch (error) {
      logWithTimestamp('error', '[SESSION] Error decrementing connection count:', error);
    }
  }

  async getSession(sessionId: string): Promise<UserSession | null> {
    try {
      const sessionKey = RedisKeys.session(sessionId);
      const client = this.redis.getClient();
      const sessionData = await client.hGetAll(sessionKey);
      
      if (!sessionData || Object.keys(sessionData).length === 0) {
        return null;
      }

      return {
        sessionId: sessionData.sessionId,
        streamName: sessionData.streamName,
        createdAt: parseInt(sessionData.createdAt),
        lastActivity: parseInt(sessionData.lastActivity),
        activeConnections: parseInt(sessionData.activeConnections) || 0
      };
    } catch (error) {
      logWithTimestamp('error', '[SESSION] Error getting session:', error);
      return null;
    }
  }

  private async getSessionIdByStream(streamName: string): Promise<string | null> {
    try {
      const streamKey = RedisKeys.stream(streamName);
      const client = this.redis.getClient();
      const sessionId = await client.get(streamKey);
      
      if (sessionId) {
        // Verify the session still exists
        const sessionExists = await client.exists(RedisKeys.session(sessionId));
        if (sessionExists) {
          return sessionId;
        } else {
          // Clean up the dangling stream reference
          await client.del(streamKey);
          logWithTimestamp('warn', `[SESSION] Cleaned up dangling stream reference for ${streamName}`);
        }
      }
      
      return null;
    } catch (error) {
      logWithTimestamp('error', '[SESSION] Error getting session ID by stream:', error);
      return null;
    }
  }

  private async createSession(session: UserSession): Promise<void> {
    try {
      const sessionKey = RedisKeys.session(session.sessionId);
      const streamKey = RedisKeys.stream(session.streamName);
      const client = this.redis.getClient();
      
      // Store session data
      await client.hSet(sessionKey, {
        sessionId: session.sessionId,
        streamName: session.streamName,
        createdAt: session.createdAt.toString(),
        lastActivity: session.lastActivity.toString(),
        activeConnections: session.activeConnections.toString()
      });
      
      // Set TTL for session
      await client.expire(sessionKey, this.sessionTtl);
      
      // Create stream -> session mapping
      await client.setEx(streamKey, this.sessionTtl, session.sessionId);
      
    } catch (error) {
      logWithTimestamp('error', '[SESSION] Error creating session:', error);
      throw error;
    }
  }

  async getAllSessions(): Promise<UserSession[]> {
    try {
      const pattern = RedisKeys.sessionPattern();
      const client = this.redis.getClient();
      const keys = await client.keys(pattern);
      const sessions: UserSession[] = [];
      
      for (const key of keys) {
        const sessionData = await client.hGetAll(key);
        if (sessionData && Object.keys(sessionData).length > 0) {
          sessions.push({
            sessionId: sessionData.sessionId,
            streamName: sessionData.streamName,
            createdAt: parseInt(sessionData.createdAt),
            lastActivity: parseInt(sessionData.lastActivity),
            activeConnections: parseInt(sessionData.activeConnections) || 0
          });
        }
      }
      
      return sessions;
    } catch (error) {
      logWithTimestamp('error', '[SESSION] Error getting all sessions:', error);
      return [];
    }
  }

  private startCleanupTask(): void {
    // Clean up expired sessions every 30 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();
    }, 30 * 60 * 1000);
  }

  private async cleanupExpiredSessions(): Promise<void> {
    try {
      const now = Date.now();
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
      const sessions = await this.getAllSessions();
      
      let cleanedCount = 0;
      
      for (const session of sessions) {
        if (now - session.lastActivity > maxAge || session.activeConnections === 0) {
          await this.deleteSession(session.sessionId);
          cleanedCount++;
        }
      }
      
      if (cleanedCount > 0) {
        logWithTimestamp('info', `[SESSION] Cleaned up ${cleanedCount} expired sessions`);
      }
    } catch (error) {
      logWithTimestamp('error', '[SESSION] Error during cleanup:', error);
    }
  }

  private async deleteSession(sessionId: string): Promise<void> {
    try {
      const session = await this.getSession(sessionId);
      if (session) {
        // Delete session data
        const client = this.redis.getClient();
        await client.del(RedisKeys.session(sessionId));
        // Delete stream mapping
        await client.del(RedisKeys.stream(session.streamName));
        
        logWithTimestamp('debug', `[SESSION] Deleted session ${sessionId} for stream ${session.streamName}`);
      }
    } catch (error) {
      logWithTimestamp('error', '[SESSION] Error deleting session:', error);
    }
  }

  async stop(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    logWithTimestamp('info', '[SESSION] Session manager stopped');
  }
}