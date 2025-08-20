import { RedisManager } from './redis.js';
import { UserSession } from './types.js';
export declare class UserSessionManager {
    private redis;
    private sessionTtl;
    private cleanupInterval;
    constructor(redis: RedisManager);
    getOrCreateSession(streamName?: string): Promise<string>;
    updateSessionActivity(sessionId: string): Promise<void>;
    incrementConnectionCount(sessionId: string): Promise<void>;
    decrementConnectionCount(sessionId: string): Promise<void>;
    getSession(sessionId: string): Promise<UserSession | null>;
    private getSessionIdByStream;
    private createSession;
    getAllSessions(): Promise<UserSession[]>;
    private startCleanupTask;
    private cleanupExpiredSessions;
    private deleteSession;
    stop(): Promise<void>;
}
//# sourceMappingURL=session.d.ts.map