# Broadcast Socket

A broadcast websocket server system with channel support, built with Node.js, Express, Socket.IO, React, and TypeScript.

**GitHub Repository**: [github.com/dnewmon/broadcast-socket](https://github.com/dnewmon/broadcast-socket)

## Features

-   **Channel-based communication**: Connect to specific channels using query parameters
-   **Real-time messaging**: Send and receive messages in real-time within channels
-   **REST API proxy endpoint**: Send messages to channels via HTTP POST requests
-   **React Hook Library**: Installable npm package with `useBroadcastSocket()` hook
-   **TypeScript**: Fully typed codebase for both frontend and backend
-   **CLI wrapper**: Easy-to-use command-line interface for the server

## Installation

```bash
npm install ./
```

This will install all dependencies for the backend, frontend library, and example app.

## Building

```bash
npm run build
```

This will compile TypeScript for all packages.

## Usage

### Backend Server

Start the server using the CLI:

```bash
npx broadcast-socket-server
```

With custom options:

```bash
npx broadcast-socket-server --port 12000 --cors-origin http://localhost:5173
```

CLI Options:

-   `-p, --port <number>`: Port to run the server on (default: 12000)
-   `-c, --cors-origin <string>`: CORS origin (default: http://localhost:5173)

### Frontend Library

The `@broadcast-socket/frontend` package exports a React hook for easy WebSocket integration.

Install in your React project:

```bash
npm install @broadcast-socket/frontend
```

Use in your React components:

```typescript
import { useBroadcastSocket } from "@broadcast-socket/frontend";

function MyComponent() {
    const { messages, isConnected, sendMessage, connect, disconnect } = useBroadcastSocket();

    const handleConnect = () => {
        connect("http://localhost:12000", "my-channel");
    };

    const handleSend = () => {
        sendMessage({ text: "Hello!" });
    };

    return (
        <div>
            <button onClick={handleConnect}>{isConnected ? "Disconnect" : "Connect"}</button>
            <button onClick={handleSend} disabled={!isConnected}>
                Send Message
            </button>
            <div>
                {messages.map((msg, i) => (
                    <div key={i}>{JSON.stringify(msg.data)}</div>
                ))}
            </div>
        </div>
    );
}
```

### Example App

Run the example application:

```bash
npm run dev:example
```

Or from the example directory:

```bash
cd packages/frontend/example
npm run dev
```

The example app will be available at `http://localhost:5173`

## API

### React Hook: `useBroadcastSocket()`

Returns an object with:

-   **`messages`**: `BroadcastMessage[]` - Array of received messages
-   **`isConnected`**: `boolean` - Connection status
-   **`connect(serverUrl: string, channel: string)`**: Function to connect to a server and channel
-   **`disconnect()`**: Function to disconnect
-   **`sendMessage(data: any)`**: Function to send a message to the current channel

### WebSocket Connection (Direct)

Connect to a channel by specifying it in the query parameters:

```javascript
import { io } from "socket.io-client";

const socket = io("http://localhost:12000", {
    query: { channel: "home" },
});
```

### REST Endpoint

Send messages to a channel via HTTP:

```bash
curl -X POST "http://localhost:12000/proxy?channel=home" \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello from proxy!"}'
```

### Health Check

```bash
curl http://localhost:12000/health
```

## Architecture

### Backend (`packages/backend`)

-   **Express server** with Socket.IO integration
-   **Channel-based rooms**: Clients join rooms based on the `channel` query parameter
-   **Message broadcasting**: Messages are broadcast to all clients in the same channel
-   **REST proxy endpoint**: POST requests to `/proxy?channel=<name>` send messages to that channel
-   **CORS support**: Configurable CORS origin for security

### Frontend Library (`packages/frontend`)

-   **Installable npm package** exporting React hooks
-   **`useBroadcastSocket` hook**: Manages WebSocket connection lifecycle
-   **TypeScript types**: Fully typed for excellent developer experience
-   **Peer dependency on React**: Works with React 18+

### Example App (`packages/frontend/example`)

-   **React application** demonstrating the library usage
-   **Channel selector**: Choose which channel to connect to
-   **Message display**: Real-time message feed with sender identification
-   **Connection status**: Visual indicator of connection state

## Message Format

Messages follow this structure:

```typescript
interface BroadcastMessage {
    data: any; // Your message payload
    timestamp: number; // Unix timestamp
    sender?: string; // Socket ID, 'system', or 'proxy'
}
```

## Development

### Project Structure

```
broadcast-socket/
├── package.json (monorepo root)
├── packages/
│   ├── backend/
│   │   ├── src/
│   │   │   ├── index.ts (CLI entry)
│   │   │   ├── server.ts (Express + Socket.IO)
│   │   │   └── types.ts
│   │   └── bin/cli.js
│   └── frontend/
│       ├── src/
│       │   ├── index.ts (library exports)
│       │   └── hooks/
│       │       └── useBroadcastSocket.ts (useBroadcastSocket hook)
│       └── example/
│           ├── src/
│           │   ├── App.tsx
│           │   └── main.tsx
│           └── index.html
└── README.md
```

### Running in Development

Terminal 1 - Backend:

```bash
npm run dev:backend
```

Terminal 2 - Frontend Library (watch mode):

```bash
npm run dev:frontend
```

Terminal 3 - Example App:

```bash
npm run dev:example
```

## Example Use Case

1. Start the backend server on port 12000
2. Open multiple browser tabs with the example app
3. Connect all tabs to the same channel (e.g., "home")
4. Send messages from any tab - they'll appear in all tabs
5. Use the proxy endpoint to send messages from external services:
    ```bash
    curl -X POST "http://localhost:12000/proxy?channel=home" \
      -H "Content-Type: application/json" \
      -d '{"notification": "New user joined!"}'
    ```

## License

MIT
