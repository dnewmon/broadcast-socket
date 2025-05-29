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
npm install dnewmon/broadcast-socket
```

### Basic Setup

```typescript
import React from 'react';
import { BroadcastSocketProvider } from 'broadcast-socket/sdk';

function App() {
  return (
    <BroadcastSocketProvider url="ws://localhost:8080">
      <YourComponent />
    </BroadcastSocketProvider>
  );
}
```

### Using Hooks

```typescript
import { useBroadcastSocket, useSubscription, useBroadcast } from 'broadcast-socket/sdk';

function ChatComponent() {
  // Main connection hook
  const { state } = useBroadcastSocket('ws://localhost:8080');
  
  // Subscribe to a channel
  const { state: subState, messages, subscribe, addMessageListener } = useSubscription('chat-room');
  
  // Broadcasting capabilities
  const { broadcast } = useBroadcast();
  
  // Subscribe to the channel
  useEffect(() => {
    subscribe();
  }, [subscribe]);
  
  // Listen for incoming messages with custom handler
  useEffect(() => {
    const removeListener = addMessageListener((message) => {
      console.log('New message received:', message.data);
      // Custom message handling logic here
    });
    
    return removeListener; // Cleanup listener on unmount
  }, [addMessageListener]);
  
  const sendMessage = () => {
    broadcast('chat-room', { text: 'Hello World!' });
  };
  
  return (
    <div>
      <div>Status: {state.connected ? 'Connected' : 'Disconnected'}</div>
      <div>Subscribed: {subState.subscribed ? 'Yes' : 'No'}</div>
      <div>Messages: {messages.length}</div>
      <button onClick={sendMessage}>Send Message</button>
    </div>
  );
}
```

### useSubscription Hook API

The `useSubscription` hook provides channel-specific subscription management with message handling capabilities.

#### Basic Usage

```typescript
import { useSubscription } from 'broadcast-socket/sdk';

function ChannelComponent() {
  const { 
    state, 
    messages, 
    subscribe, 
    unsubscribe, 
    clearMessages, 
    addMessageListener 
  } = useSubscription('my-channel');
  
  // Automatically subscribe when component mounts
  useEffect(() => {
    subscribe();
    return () => unsubscribe(); // Clean up on unmount
  }, [subscribe, unsubscribe]);
  
  return (
    <div>
      <div>Channel: {state.channel}</div>
      <div>Subscribed: {state.subscribed ? 'Yes' : 'No'}</div>
      <div>Message Count: {state.messageCount}</div>
      <div>Recent Messages: {messages.length}</div>
    </div>
  );
}
```

#### Return Values

- **`state`**: Subscription state object containing:
  - `channel` - The channel name
  - `subscribed` - Whether actively subscribed
  - `subscribing` - Whether subscription is in progress
  - `error` - Any subscription error message
  - `messageCount` - Total messages received
  - `lastMessage` - Timestamp of last message
  
- **`messages`**: Array of recent messages (last 100)
- **`subscribe()`**: Function to subscribe to the channel
- **`unsubscribe()`**: Function to unsubscribe from channel
- **`clearMessages()`**: Function to clear message history
- **`addMessageListener(callback)`**: Function to add custom message handlers

#### Custom Message Handling

```typescript
function CustomHandlerComponent() {
  const { addMessageListener, subscribe } = useSubscription('notifications');
  
  useEffect(() => {
    subscribe();
  }, [subscribe]);
  
  // Add custom message listener
  useEffect(() => {
    const removeListener = addMessageListener((message) => {
      // Handle different message types
      if (message.data?.type === 'alert') {
        showNotification(message.data.text);
      } else if (message.data?.type === 'update') {
        updateUI(message.data.payload);
      }
    });
    
    // Clean up listener when component unmounts
    return removeListener;
  }, [addMessageListener]);
  
  return <div>Listening for notifications...</div>;
}
```

#### Multiple Subscriptions

```typescript
function MultiChannelComponent() {
  const chatSub = useSubscription('chat');
  const alertSub = useSubscription('alerts');
  const userSub = useSubscription('user-updates');
  
  useEffect(() => {
    // Subscribe to all channels
    chatSub.subscribe();
    alertSub.subscribe();
    userSub.subscribe();
  }, []);
  
  // Different handlers for each channel
  useEffect(() => {
    const removeChatListener = chatSub.addMessageListener((msg) => {
      console.log('Chat message:', msg.data);
    });
    
    const removeAlertListener = alertSub.addMessageListener((msg) => {
      showAlert(msg.data);
    });
    
    return () => {
      removeChatListener();
      removeAlertListener();
    };
  }, [chatSub.addMessageListener, alertSub.addMessageListener]);
  
  return (
    <div>
      <div>Chat Messages: {chatSub.messages.length}</div>
      <div>Alerts: {alertSub.messages.length}</div>
      <div>User Updates: {userSub.messages.length}</div>
    </div>
  );
}
```

### Advanced Configuration

```typescript
const options = {
  reconnect: true,              // Enable automatic reconnection
  reconnectInterval: 1000,      // Initial reconnect delay (ms)
  reconnectAttempts: 5,         // Maximum reconnection attempts
  heartbeatInterval: 30000,     // Heartbeat interval (ms)
  messageQueueSize: 100,        // Maximum queued messages
  debug: false,                 // Enable debug logging
};

<BroadcastSocketProvider url="ws://localhost:8080" options={options}>
  <App />
</BroadcastSocketProvider>
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
  reconnectAttempts?: number;
  reconnectInterval?: number;
  heartbeatInterval?: number;
  messageQueueSize?: number;
  debug?: boolean;
}

interface BroadcastSocketState {
  connected: boolean;
  connecting: boolean;
  error: string | null;
  reconnectAttempt: number;
  lastConnected: number | null;
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