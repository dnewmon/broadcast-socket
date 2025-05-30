"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateClientId = generateClientId;
exports.generateMessageId = generateMessageId;
exports.isValidChannel = isValidChannel;
exports.sanitizeData = sanitizeData;
exports.validateMessage = validateMessage;
exports.getServerConfig = getServerConfig;
exports.formatError = formatError;
exports.logWithTimestamp = logWithTimestamp;
exports.debounce = debounce;
exports.throttle = throttle;
exports.exponentialBackoff = exponentialBackoff;
exports.parseWebSocketUrl = parseWebSocketUrl;
exports.formatBytes = formatBytes;
exports.formatUptime = formatUptime;
exports.createRateLimiter = createRateLimiter;
const uuid_1 = require("uuid");
function generateClientId() {
    return (0, uuid_1.v4)();
}
function generateMessageId() {
    return (0, uuid_1.v4)();
}
function isValidChannel(channel) {
    if (!channel || typeof channel !== 'string') {
        return false;
    }
    return /^[a-zA-Z0-9_\-\.]+$/.test(channel) && channel.length <= 100;
}
function sanitizeData(data) {
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
function validateMessage(message) {
    if (!message || typeof message !== 'object') {
        return { valid: false, error: 'Message must be an object' };
    }
    if (!message.type || typeof message.type !== 'string') {
        return { valid: false, error: 'Message must have a valid type' };
    }
    const validTypes = ['subscribe', 'unsubscribe', 'broadcast'];
    if (!validTypes.includes(message.type)) {
        return { valid: false, error: 'Invalid message type' };
    }
    if (message.type === 'subscribe' || message.type === 'unsubscribe') {
        if (!message.channel || !isValidChannel(message.channel)) {
            return { valid: false, error: 'Invalid or missing channel' };
        }
    }
    if (message.type === 'broadcast') {
        if (message.channel && !isValidChannel(message.channel)) {
            return { valid: false, error: 'Invalid channel' };
        }
    }
    return { valid: true };
}
function getServerConfig() {
    return {
        port: parseInt(process.env.PORT || '8080', 10),
        corsOrigin: process.env.CORS_ORIGIN || '*',
        redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
        workers: parseInt(process.env.WORKERS || '0', 10) || require('os').cpus().length,
        pingInterval: parseInt(process.env.PING_INTERVAL || '30000', 10),
        heartbeatTimeout: parseInt(process.env.HEARTBEAT_TIMEOUT || '60000', 10)
    };
}
function formatError(error) {
    return `${error.name}: ${error.message}`;
}
function logWithTimestamp(level, message, ...args) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`, ...args);
}
function debounce(func, wait) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}
function throttle(func, limit) {
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
function exponentialBackoff(attempt, baseDelay = 1000, maxDelay = 30000) {
    const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
    return delay + Math.random() * 1000;
}
function parseWebSocketUrl(url) {
    const urlObj = new URL(url);
    return {
        protocol: urlObj.protocol,
        host: urlObj.hostname,
        port: parseInt(urlObj.port) || (urlObj.protocol === 'wss:' ? 443 : 80),
        path: urlObj.pathname
    };
}
function formatBytes(bytes) {
    if (bytes === 0)
        return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
function formatUptime(uptimeMs) {
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
function createRateLimiter(maxRequests, windowMs) {
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