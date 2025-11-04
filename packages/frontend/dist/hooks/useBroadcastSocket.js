import { useEffect, useState, useCallback, useRef } from "react";
import { io } from "socket.io-client";
export function useBroadcastSocket() {
    const [messages, setMessages] = useState([]);
    const [isConnected, setIsConnected] = useState(false);
    const socketRef = useRef(null);
    const disconnect = useCallback(() => {
        if (socketRef.current) {
            socketRef.current.disconnect();
            socketRef.current = null;
            setIsConnected(false);
            setMessages([]);
        }
    }, []);
    const connect = useCallback((serverUrl, channel) => {
        // Disconnect existing connection if any
        disconnect();
        // Create new socket connection with channel query param
        const socket = io(serverUrl, {
            query: { channel },
        });
        socket.on("connect", () => {
            console.log("Connected to server");
            setIsConnected(true);
        });
        socket.on("disconnect", () => {
            console.log("Disconnected from server");
            setIsConnected(false);
        });
        socket.on("message", (message) => {
            console.log("Received message:", message);
            setMessages((prev) => [...prev, message]);
        });
        socket.on("connect_error", (error) => {
            console.error("Connection error:", error);
            setIsConnected(false);
        });
        socketRef.current = socket;
    }, [disconnect]);
    const sendMessage = useCallback((data) => {
        if (socketRef.current && isConnected) {
            socketRef.current.emit("message", data);
        }
        else {
            console.warn("Cannot send message: not connected");
        }
    }, [isConnected]);
    // Cleanup on unmount
    useEffect(() => {
        return () => {
            disconnect();
        };
    }, [disconnect]);
    return {
        messages,
        isConnected,
        sendMessage,
        connect,
        disconnect,
    };
}
