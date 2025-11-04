"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSocketServer = createSocketServer;
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const cors_1 = __importDefault(require("cors"));
function createSocketServer(config) {
    const app = (0, express_1.default)();
    const httpServer = (0, http_1.createServer)(app);
    // Initialize Socket.IO with CORS
    const io = new socket_io_1.Server(httpServer, {
        cors: {
            origin: config.corsOrigin,
            methods: ["GET", "POST"],
        },
    });
    // Express middleware
    app.use((0, cors_1.default)({ origin: config.corsOrigin }));
    app.use(express_1.default.json());
    // Health check endpoint
    app.get("/health", (req, res) => {
        res.json({ status: "ok", timestamp: Date.now() });
    });
    // Proxy endpoint to send messages to a channel
    app.post("/proxy", (req, res) => {
        const channel = req.query.channel;
        if (!channel) {
            return res.status(400).json({ error: "Channel parameter is required" });
        }
        const message = {
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
        const channel = socket.handshake.query.channel;
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
        socket.on("message", (data) => {
            const message = {
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
