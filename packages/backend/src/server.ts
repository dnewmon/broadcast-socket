import express, { Request, Response } from "express";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import cors from "cors";
import { ServerConfig, ChannelMessage } from "./types";

export function createSocketServer(config: ServerConfig) {
    const app = express();
    const httpServer = createServer(app);

    // Initialize Socket.IO with CORS
    const io = new SocketIOServer(httpServer, {
        cors: {
            origin: config.corsOrigin,
            methods: ["GET", "POST"],
        },
    });

    // Express middleware
    app.use(cors({ origin: config.corsOrigin }));
    app.use(express.json());

    // Health check endpoint
    app.get("/health", (req: Request, res: Response) => {
        res.json({ status: "ok", timestamp: Date.now() });
    });

    // Proxy endpoint to send messages to a channel
    app.post("/proxy", (req: Request, res: Response) => {
        const channel = req.query.channel as string;

        if (!channel) {
            return res.status(400).json({ error: "Channel parameter is required" });
        }

        const message: ChannelMessage = {
            data: req.body,
            timestamp: Date.now(),
            sender: "proxy",
        };

        // Emit message to all sockets in the channel room
        io.to(channel).emit("message", message);

        res.json({
            success: true,
            channel,
            message: "Message sent to channel",
        });
    });

    // Socket.IO connection handling
    io.on("connection", (socket) => {
        const channel = socket.handshake.query.channel as string;

        if (!channel) {
            console.log("Client connected without channel, disconnecting");
            socket.disconnect();
            return;
        }

        console.log(`Client ${socket.id} connected to channel: ${channel}`);

        // Join the channel room
        socket.join(channel);

        // Send welcome message
        socket.emit("message", {
            data: { text: `Welcome to channel: ${channel}` },
            timestamp: Date.now(),
            sender: "system",
        });

        // Handle incoming messages from client
        socket.on("message", (data: any) => {
            const message: ChannelMessage = {
                data,
                timestamp: Date.now(),
                sender: socket.id,
            };

            // Broadcast to all clients in the same channel (including sender)
            io.to(channel).emit("message", message);
        });

        // Handle disconnection
        socket.on("disconnect", () => {
            console.log(`Client ${socket.id} disconnected from channel: ${channel}`);
        });
    });

    // Start the server
    httpServer.listen(config.port, () => {
        console.log(`Simple Socket Server running on port ${config.port}`);
        console.log(`CORS origin: ${config.corsOrigin}`);
    });

    return { app, httpServer, io };
}
