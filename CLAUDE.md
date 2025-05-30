# Broadcast Socket Service

## Architecture Overview

A real-time WebSocket broadcasting service built with Node.js and TypeScript that enables scalable fan-out messaging with Redis-backed persistence and React client SDK.

## Technology Stack

- **Runtime**: Node.js 22+ with TypeScript (ESM modules)
- **WebSocket**: `ws` library for WebSocket server implementation
- **Process Management**: Node.js Cluster module for horizontal scaling
- **Message Broker**: Redis for pub/sub and message persistence
- **HTTP Framework**: Express.js for REST endpoints and health checks
- **CORS**: Cross-origin request support with configurable origins
- **Client SDK**: React hooks and context providers

## Core Components

### 1. WebSocket Server (`src/server.ts`)
- Main BroadcastServer class with WebSocket and HTTP servers
- Client connection management with unique IDs and heartbeat monitoring
- Message validation, rate limiting, and error handling
- HTTP endpoints: `/health`, `/stats`, `/broadcast` (POST)
- Graceful shutdown with proper cleanup

### 2. Broadcasting System (`src/broadcast.ts`)
- BroadcastManager handles message distribution and queuing
- Redis pub/sub for cross-process message routing
- Message deduplication and delivery guarantees
- Failed message queuing and retry mechanism
- Support for channel-specific and global broadcasts

### 3. Subscription Management (`src/subscription.ts`)
- Channel-based subscription tracking with Redis persistence
- Client subscription state management and restoration
- Dynamic subscription/unsubscription with cleanup
- Channel statistics and subscriber tracking

### 4. Cluster Management (`src/cluster.ts`)
- Multi-worker process management with automatic restart
- Inter-worker communication via cluster messaging
- Worker health monitoring and statistics collection
- Graceful cluster shutdown coordination

### 5. React SDK (`sdk/`)
- TypeScript hooks: `useBroadcastSocket`, `useSubscription`, `useBroadcast`
- Context provider for shared connection state
- Automatic reconnection and message queuing
- Type-safe message handling

## Key Features

### Message Broadcasting
- Real-time message distribution to all connected clients
- Channel-based subscriptions for targeted messaging  
- Global broadcasts to all clients (`channel: "*"`)
- Message persistence in Redis with TTL
- Deduplication to prevent duplicate message delivery

### Connection Management
- Unique client IDs with WebSocket connection tracking
- Heartbeat monitoring with ping/pong for health checks
- Rate limiting (100 messages per minute per IP)
- Automatic reconnection support in React SDK
- Graceful handling of client disconnections

### Scalability
- Multi-worker cluster mode for CPU utilization
- Redis pub/sub for cross-worker message distribution
- Subscription state persistence for reconnections
- Message queuing for offline/reconnecting clients
- Horizontal scaling support with stateless workers

### Developer Experience
- TypeScript-first with comprehensive type definitions
- ESM module support (Node.js 22+)
- React hooks for easy frontend integration
- HTTP API for server-side message broadcasting
- Comprehensive logging and debugging output

## API Reference

### WebSocket Protocol
```typescript
// Client -> Server
{
  type: 'subscribe' | 'unsubscribe' | 'broadcast',
  channel?: string,
  data?: unknown,
  messageId?: string
}

// Server -> Client  
{
  type: 'message' | 'ack' | 'error' | 'ping',
  channel?: string,
  data?: unknown,
  messageId?: string,
  timestamp: number
}
```

### HTTP Endpoints
- `GET /health` - Health status and connection count
- `GET /stats` - Server statistics and channel info
- `POST /broadcast` - Send message to channel via HTTP

### React SDK
```typescript
// Hooks
useBroadcastSocket(url, options)  // Main connection
useSubscription(channel)          // Subscribe to channel
useBroadcast()                   // Send messages

// Context
<BroadcastSocketProvider url="ws://localhost:8080">
  <App />
</BroadcastSocketProvider>
```

## Configuration

### Environment Variables
- `PORT=8080` - Server port
- `REDIS_URL=redis://localhost:6379` - Redis connection
- `CORS_ORIGIN=*` - CORS allowed origins  
- `WORKERS=<CPU cores>` - Cluster worker count
- `NODE_ENV=development` - Environment mode

### Development Scripts
```bash
npm run dev          # Development server with auto-reload
npm run build        # TypeScript compilation (server + SDK)
npm run test         # Jest test suite
npm run lint         # ESLint + TypeScript checks
npm start           # Production server
```