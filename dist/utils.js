import { v4 as uuidv4 } from 'uuid';
import { cpus } from 'os';
export function generateClientId() {
    return uuidv4();
}
export function generateMessageId() {
    return uuidv4();
}
export function isValidChannel(channel) {
    if (!channel || typeof channel !== 'string') {
        return false;
    }
    return /^[a-zA-Z0-9_\-\.]+$/.test(channel) && channel.length <= 100;
}
export function sanitizeData(data) {
    if (data === null || data === undefined) {
        return data;
    }
    if (typeof data === 'string') {
        return data.length > 10000 ? data.substring(0, 10000) : data;
    }
    if (typeof data === 'object') {
        const stringified = JSON.stringify(data);
        if (stringified.length > 10000) {
            return { error: 'Message too large', originalSize: stringified.length };
        }
        return data;
    }
    return data;
}
export function validateMessage(message) {
    if (!message || typeof message !== 'object') {
        return { valid: false, error: 'Message must be an object' };
    }
    const msg = message;
    if (!msg.type || typeof msg.type !== 'string') {
        return { valid: false, error: 'Message must have a valid type' };
    }
    const validTypes = ['subscribe', 'unsubscribe', 'broadcast'];
    if (!validTypes.includes(msg.type)) {
        return { valid: false, error: 'Invalid message type' };
    }
    if (msg.type === 'subscribe' || msg.type === 'unsubscribe') {
        if (!msg.channel || !isValidChannel(msg.channel)) {
            return { valid: false, error: 'Invalid or missing channel' };
        }
    }
    if (msg.type === 'broadcast') {
        if (msg.channel && !isValidChannel(msg.channel)) {
            return { valid: false, error: 'Invalid channel' };
        }
    }
    return { valid: true };
}
export function getServerConfig() {
    return {
        port: parseInt(process.env.PORT || '8080', 10),
        corsOrigin: process.env.CORS_ORIGIN || '*',
        redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
        workers: parseInt(process.env.WORKERS || '0', 10) || cpus().length,
        pingInterval: parseInt(process.env.PING_INTERVAL || '30000', 10),
        heartbeatTimeout: parseInt(process.env.HEARTBEAT_TIMEOUT || '60000', 10)
    };
}
export function formatError(error) {
    return `${error.name}: ${error.message}`;
}
export function logWithTimestamp(level, message, ...args) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`, ...args);
}
export function debounce(func, wait) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}
export function throttle(func, limit) {
    let lastFunc;
    let lastRan;
    return (...args) => {
        if (!lastRan) {
            func(...args);
            lastRan = Date.now();
        }
        else {
            clearTimeout(lastFunc);
            lastFunc = setTimeout(() => {
                if ((Date.now() - lastRan) >= limit) {
                    func(...args);
                    lastRan = Date.now();
                }
            }, limit - (Date.now() - lastRan));
        }
    };
}
export function exponentialBackoff(attempt, baseDelay = 1000, maxDelay = 30000) {
    const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
    return delay + Math.random() * 1000;
}
export function parseWebSocketUrl(url) {
    const urlObj = new URL(url);
    return {
        protocol: urlObj.protocol,
        host: urlObj.hostname,
        port: parseInt(urlObj.port) || (urlObj.protocol === 'wss:' ? 443 : 80),
        path: urlObj.pathname
    };
}
export function formatBytes(bytes) {
    if (bytes === 0)
        return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
export function formatUptime(uptimeMs) {
    const seconds = Math.floor(uptimeMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) {
        return `${days}d ${hours % 24}h ${minutes % 60}m`;
    }
    else if (hours > 0) {
        return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    }
    else if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s`;
    }
    else {
        return `${seconds}s`;
    }
}
export function createRateLimiter(maxRequests, windowMs) {
    const requests = new Map();
    return (identifier) => {
        const now = Date.now();
        const windowStart = now - windowMs;
        if (!requests.has(identifier)) {
            requests.set(identifier, []);
        }
        const clientRequests = requests.get(identifier);
        while (clientRequests.length > 0 && clientRequests[0] < windowStart) {
            clientRequests.shift();
        }
        if (clientRequests.length >= maxRequests) {
            return false;
        }
        clientRequests.push(now);
        return true;
    };
}
//# sourceMappingURL=utils.js.map