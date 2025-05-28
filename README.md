# Broadcast Socket Service

A horizontally scalable WebSocket broadcasting service built with Node.js that supports fan-out messaging patterns with CORS-enabled connections.

## Features & Functionality

### Core Features
- **WebSocket Broadcasting**: Real-time message broadcasting to all connected clients
- **Channel-Based Subscriptions**: Subscribe to specific channels/topics for targeted messaging
- **Horizontal Scaling**: Multi-process architecture with Redis for inter-process communication
- **CORS Support**: Cross-origin WebSocket connections with configurable origins
- **React SDK**: TypeScript-first React hooks and context providers
- **Automatic Reconnection**: Built-in reconnection with exponential backoff
- **Message Persistence**: Redis-based message storage for reliability
- **Health Monitoring**: HTTP endpoints for health checks and statistics

### WebSocket Message Types
- `subscribe` - Subscribe to a channel
- `unsubscribe` - Unsubscribe from a channel  
- `broadcast` - Send a message to a channel
- `message` - Receive broadcasted messages
- `ack` - Message acknowledgments
- `error` - Error notifications
- `ping` - Connection health checks

### HTTP Endpoints
- `GET /health` - Health check endpoint
- `POST /broadcast` - HTTP-based broadcasting
- `GET /stats` - Connection and performance statistics

## Requirements

### System Requirements
- **Node.js**: >= 22.0.0
- **Redis**: >= 6.0 (for message persistence and inter-process communication)
- **Memory**: Minimum 512MB RAM (scales with concurrent connections)

### Dependencies
- `ws` - WebSocket server implementation
- `redis` - Redis client for message persistence
- `express` - HTTP server for health checks
- `cors` - CORS middleware
- `uuid` - Unique identifier generation

## Installation & Usage

### Server Installation

```bash
# Clone the repository
git clone <repository-url>
cd broadcast-socket

# Install dependencies
npm install

# Build the project
npm run build
```

### Environment Configuration

Create a `.env` file or set environment variables:

```bash
PORT=8080                    # WebSocket server port
REDIS_URL=redis://localhost:6379  # Redis connection string
CORS_ORIGIN=*               # CORS allowed origins (comma-separated)
WORKERS=4                   # Number of worker processes (default: CPU cores)
NODE_ENV=production         # Environment mode
```

### Running the Server

```bash
# Development mode
npm run dev

# Production mode
npm run build
npm start

# With Docker
docker build -t broadcast-socket .
docker run -p 8080:8080 broadcast-socket

# With Docker Compose (includes Redis)
docker-compose up
```

## React SDK Usage

### Installation

```bash
# Install from GitHub repository
npm install git+ssh://github.com/dnewmon/broadcast-socket.git

# Or install from npm (when published)
npm install broadcast-socket
```

### Basic Setup

```typescript
import React from 'react';
import { BroadcastProvider } from 'broadcast-socket';

function App() {
  return (
    <BroadcastProvider url="ws://localhost:8080">
      <YourComponent />
    </BroadcastProvider>
  );
}
```

### Using Hooks

```typescript
import { useBroadcastSocket, useSubscription, useBroadcast } from 'broadcast-socket';

function ChatComponent() {
  // Main connection hook
  const { isConnected, connectionState } = useBroadcastSocket();
  
  // Subscribe to a channel
  const { messages, isSubscribed } = useSubscription('chat-room');
  
  // Broadcasting capabilities
  const { broadcast } = useBroadcast();
  
  const sendMessage = () => {
    broadcast('chat-room', { text: 'Hello World!' });
  };
  
  return (
    <div>
      <div>Status: {isConnected ? 'Connected' : 'Disconnected'}</div>
      <div>Messages: {messages.length}</div>
      <button onClick={sendMessage}>Send Message</button>
    </div>
  );
}
```

### Advanced Configuration

```typescript
const options = {
  reconnect: true,              // Enable automatic reconnection
  reconnectInterval: 1000,      // Initial reconnect delay (ms)
  maxReconnectInterval: 30000,  // Maximum reconnect delay (ms)
  reconnectDecay: 1.5,          // Exponential backoff factor
  maxReconnectAttempts: 10,     // Maximum reconnection attempts
  timeoutInterval: 2000,        // Connection timeout (ms)
};

<BroadcastProvider url="ws://localhost:8080" options={options}>
  <App />
</BroadcastProvider>
```

## Docker Container

### Building the Container

```bash
# Build production image
docker build -t broadcast-socket .

# Build with custom tag
docker build -t broadcast-socket:v1.0.0 .
```

### Running the Container

```bash
# Basic run
docker run -p 8080:8080 broadcast-socket

# With environment variables
docker run -p 8080:8080 \
  -e REDIS_URL=redis://redis:6379 \
  -e CORS_ORIGIN=https://yourdomain.com \
  broadcast-socket

# With Redis using Docker Compose
docker-compose up
```

### Docker Compose Setup

```yaml
version: '3.8'
services:
  broadcast-socket:
    build: .
    ports:
      - "8080:8080"
    environment:
      - REDIS_URL=redis://redis:6379
      - CORS_ORIGIN=*
    depends_on:
      - redis
    
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
```

## Development Commands

```bash
npm run dev          # Start development server with hot reload
npm run build        # Build TypeScript to JavaScript
npm run test         # Run test suite
npm run lint         # Run ESLint code linting
npm run typecheck    # Run TypeScript type checking
npm start           # Start production server
```

## API Reference

### WebSocket Message Format

```typescript
// Client to Server
interface ClientMessage {
  type: 'subscribe' | 'unsubscribe' | 'broadcast';
  channel?: string;
  data?: any;
  messageId?: string;
}

// Server to Client
interface ServerMessage {
  type: 'message' | 'ack' | 'error' | 'ping';
  channel?: string;
  data?: any;
  messageId?: string;
  timestamp: number;
}
```

### React SDK Types

```typescript
interface BroadcastSocketOptions {
  reconnect?: boolean;
  reconnectInterval?: number;
  maxReconnectInterval?: number;
  reconnectDecay?: number;
  maxReconnectAttempts?: number;
  timeoutInterval?: number;
}

interface BroadcastSocketState {
  isConnected: boolean;
  connectionState: 'connecting' | 'connected' | 'disconnected' | 'error';
  lastError?: Error;
}
```

## Limitations

### Technical Limitations
- **Memory Usage**: Connection state stored in memory; high connection counts require adequate RAM
- **Redis Dependency**: Requires Redis for horizontal scaling and message persistence
- **Single Region**: No built-in multi-region support; requires external load balancing
- **Message Size**: WebSocket message size limited by Node.js buffer limits (~1GB theoretical)

### Scaling Limitations
- **Sticky Sessions**: Load balancers may need sticky session support for optimal performance
- **Redis Bottleneck**: Redis becomes bottleneck at very high message throughput
- **File Descriptors**: Limited by OS file descriptor limits (ulimit)

### Feature Limitations
- **No Authentication**: No built-in authentication; implement at application level
- **No Message Ordering**: No guaranteed message ordering across channels
- **No Persistence**: Messages not persisted beyond Redis memory (configure Redis persistence as needed)
- **No Binary Messages**: Optimized for JSON messages; binary support available but not optimized

### Browser Limitations
- **WebSocket Limits**: Browser WebSocket connection limits (typically 255 per domain)
- **CORS Restrictions**: Subject to browser CORS policies
- **Memory Usage**: Large message histories stored in browser memory

## Performance Considerations

- **Concurrent Connections**: ~10,000 connections per process on modern hardware
- **Message Throughput**: ~50,000 messages/second with Redis clustering
- **Memory Usage**: ~1KB per connection + message buffers
- **Latency**: <10ms message delivery in local network environments

## License

MIT License - see LICENSE file for details.