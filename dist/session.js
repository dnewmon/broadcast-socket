import { v4 as uuidv4 } from 'uuid';
import { logWithTimestamp } from './utils.js';
import { RedisKeys } from './redis_keys.js';
export class UserSessionManager {
    redis;
    sessionTtl = 24 * 60 * 60;
    cleanupInterval = null;
    constructor(redis) {
        this.redis = redis;
        this.startCleanupTask();
    }
    async getOrCreateSession(streamName = 'default') {
        try {
            const sessionId = await this.getSessionIdByStream(streamName);
            if (sessionId) {
                await this.updateSessionActivity(sessionId);
                logWithTimestamp('debug', `[SESSION] Found existing session ${sessionId} for stream ${streamName}`);
                return sessionId;
            }
            const newSessionId = uuidv4();
            const session = {
                sessionId: newSessionId,
                streamName,
                createdAt: Date.now(),
                lastActivity: Date.now(),
                activeConnections: 0
            };
            await this.createSession(session);
            logWithTimestamp('info', `[SESSION] Created new session ${newSessionId} for stream ${streamName}`);
            return newSessionId;
        }
        catch (error) {
            logWithTimestamp('error', '[SESSION] Error getting/creating session:', error);
            throw error;
        }
    }
    async updateSessionActivity(sessionId) {
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
        }
        catch (error) {
            logWithTimestamp('error', '[SESSION] Error updating session activity:', error);
        }
    }
    async incrementConnectionCount(sessionId) {
        try {
            const sessionKey = RedisKeys.session(sessionId);
            const client = this.redis.getClient();
            await client.hIncrBy(sessionKey, 'activeConnections', 1);
            await this.updateSessionActivity(sessionId);
            logWithTimestamp('debug', `[SESSION] Incremented connection count for session ${sessionId}`);
        }
        catch (error) {
            logWithTimestamp('error', '[SESSION] Error incrementing connection count:', error);
        }
    }
    async decrementConnectionCount(sessionId) {
        try {
            const sessionKey = RedisKeys.session(sessionId);
            const client = this.redis.getClient();
            const connections = await client.hIncrBy(sessionKey, 'activeConnections', -1);
            if (connections < 0) {
                await client.hSet(sessionKey, 'activeConnections', '0');
            }
            await this.updateSessionActivity(sessionId);
            logWithTimestamp('debug', `[SESSION] Decremented connection count for session ${sessionId}`);
        }
        catch (error) {
            logWithTimestamp('error', '[SESSION] Error decrementing connection count:', error);
        }
    }
    async getSession(sessionId) {
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
        }
        catch (error) {
            logWithTimestamp('error', '[SESSION] Error getting session:', error);
            return null;
        }
    }
    async getSessionIdByStream(streamName) {
        try {
            const streamKey = RedisKeys.stream(streamName);
            const client = this.redis.getClient();
            const sessionId = await client.get(streamKey);
            if (sessionId) {
                const sessionExists = await client.exists(RedisKeys.session(sessionId));
                if (sessionExists) {
                    return sessionId;
                }
                else {
                    await client.del(streamKey);
                    logWithTimestamp('warn', `[SESSION] Cleaned up dangling stream reference for ${streamName}`);
                }
            }
            return null;
        }
        catch (error) {
            logWithTimestamp('error', '[SESSION] Error getting session ID by stream:', error);
            return null;
        }
    }
    async createSession(session) {
        try {
            const sessionKey = RedisKeys.session(session.sessionId);
            const streamKey = RedisKeys.stream(session.streamName);
            const client = this.redis.getClient();
            await client.hSet(sessionKey, {
                sessionId: session.sessionId,
                streamName: session.streamName,
                createdAt: session.createdAt.toString(),
                lastActivity: session.lastActivity.toString(),
                activeConnections: session.activeConnections.toString()
            });
            await client.expire(sessionKey, this.sessionTtl);
            await client.setEx(streamKey, this.sessionTtl, session.sessionId);
        }
        catch (error) {
            logWithTimestamp('error', '[SESSION] Error creating session:', error);
            throw error;
        }
    }
    async getAllSessions() {
        try {
            const pattern = RedisKeys.sessionPattern();
            const client = this.redis.getClient();
            const keys = await client.keys(pattern);
            const sessions = [];
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
        }
        catch (error) {
            logWithTimestamp('error', '[SESSION] Error getting all sessions:', error);
            return [];
        }
    }
    startCleanupTask() {
        this.cleanupInterval = setInterval(() => {
            this.cleanupExpiredSessions();
        }, 30 * 60 * 1000);
    }
    async cleanupExpiredSessions() {
        try {
            const now = Date.now();
            const maxAge = 24 * 60 * 60 * 1000;
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
        }
        catch (error) {
            logWithTimestamp('error', '[SESSION] Error during cleanup:', error);
        }
    }
    async deleteSession(sessionId) {
        try {
            const session = await this.getSession(sessionId);
            if (session) {
                const client = this.redis.getClient();
                await client.del(RedisKeys.session(sessionId));
                await client.del(RedisKeys.stream(session.streamName));
                logWithTimestamp('debug', `[SESSION] Deleted session ${sessionId} for stream ${session.streamName}`);
            }
        }
        catch (error) {
            logWithTimestamp('error', '[SESSION] Error deleting session:', error);
        }
    }
    async stop() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        logWithTimestamp('info', '[SESSION] Session manager stopped');
    }
}
//# sourceMappingURL=session.js.map