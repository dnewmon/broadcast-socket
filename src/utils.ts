import { v4 as uuidv4 } from 'uuid';
import { ServerConfig } from './types';

export function generateClientId(): string {
  return uuidv4();
}

export function generateMessageId(): string {
  return uuidv4();
}

export function isValidChannel(channel: string): boolean {
  if (!channel || typeof channel !== 'string') {
    return false;
  }
  
  return /^[a-zA-Z0-9_\-\.]+$/.test(channel) && channel.length <= 100;
}

export function sanitizeData(data: unknown): unknown {
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

export function validateMessage(message: unknown): { valid: boolean; error?: string } {
  if (!message || typeof message !== 'object') {
    return { valid: false, error: 'Message must be an object' };
  }

  const msg = message as Record<string, unknown>;

  if (!msg.type || typeof msg.type !== 'string') {
    return { valid: false, error: 'Message must have a valid type' };
  }

  const validTypes = ['subscribe', 'unsubscribe', 'broadcast'];
  if (!validTypes.includes(msg.type)) {
    return { valid: false, error: 'Invalid message type' };
  }

  if (msg.type === 'subscribe' || msg.type === 'unsubscribe') {
    if (!msg.channel || !isValidChannel(msg.channel as string)) {
      return { valid: false, error: 'Invalid or missing channel' };
    }
  }

  if (msg.type === 'broadcast') {
    if (msg.channel && !isValidChannel(msg.channel as string)) {
      return { valid: false, error: 'Invalid channel' };
    }
  }

  return { valid: true };
}

export function getServerConfig(): ServerConfig {
  return {
    port: parseInt(process.env.PORT || '8080', 10),
    corsOrigin: process.env.CORS_ORIGIN || '*',
    redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
    workers: parseInt(process.env.WORKERS || '0', 10) || require('os').cpus().length,
    pingInterval: parseInt(process.env.PING_INTERVAL || '30000', 10),
    heartbeatTimeout: parseInt(process.env.HEARTBEAT_TIMEOUT || '60000', 10)
  };
}

export function formatError(error: Error): string {
  return `${error.name}: ${error.message}`;
}

export function logWithTimestamp(level: string, message: string, ...args: unknown[]): void {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`, ...args);
}

export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

export function throttle<T extends (...args: unknown[]) => unknown>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let lastFunc: NodeJS.Timeout;
  let lastRan: number;
  
  return (...args: Parameters<T>) => {
    if (!lastRan) {
      func(...args);
      lastRan = Date.now();
    } else {
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

export function exponentialBackoff(attempt: number, baseDelay: number = 1000, maxDelay: number = 30000): number {
  const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
  return delay + Math.random() * 1000;
}

export function parseWebSocketUrl(url: string): { protocol: string; host: string; port: number; path: string } {
  const urlObj = new URL(url);
  return {
    protocol: urlObj.protocol,
    host: urlObj.hostname,
    port: parseInt(urlObj.port) || (urlObj.protocol === 'wss:' ? 443 : 80),
    path: urlObj.pathname
  };
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function formatUptime(uptimeMs: number): string {
  const seconds = Math.floor(uptimeMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

export function createRateLimiter(maxRequests: number, windowMs: number) {
  const requests = new Map<string, number[]>();

  return (identifier: string): boolean => {
    const now = Date.now();
    const windowStart = now - windowMs;

    if (!requests.has(identifier)) {
      requests.set(identifier, []);
    }

    const clientRequests = requests.get(identifier)!;
    
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