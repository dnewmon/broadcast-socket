import { ServerConfig } from './types';
export declare function generateClientId(): string;
export declare function generateMessageId(): string;
export declare function isValidChannel(channel: string): boolean;
export declare function sanitizeData(data: any): any;
export declare function validateMessage(message: any): {
    valid: boolean;
    error?: string;
};
export declare function getServerConfig(): ServerConfig;
export declare function formatError(error: Error): string;
export declare function logWithTimestamp(level: string, message: string, ...args: any[]): void;
export declare function debounce<T extends (...args: any[]) => any>(func: T, wait: number): (...args: Parameters<T>) => void;
export declare function throttle<T extends (...args: any[]) => any>(func: T, limit: number): (...args: Parameters<T>) => void;
export declare function exponentialBackoff(attempt: number, baseDelay?: number, maxDelay?: number): number;
export declare function parseWebSocketUrl(url: string): {
    protocol: string;
    host: string;
    port: number;
    path: string;
};
export declare function formatBytes(bytes: number): string;
export declare function formatUptime(uptimeMs: number): string;
export declare function createRateLimiter(maxRequests: number, windowMs: number): (identifier: string) => boolean;
//# sourceMappingURL=utils.d.ts.map