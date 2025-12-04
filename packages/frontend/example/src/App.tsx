import React, { useState, useRef, useEffect } from "react";
import { useBroadcastSocket } from "@broadcast-socket/frontend";

function App() {
    const [serverUrl, setServerUrl] = useState("http://localhost:12000");
    const [channel, setChannel] = useState("home");
    const [messageText, setMessageText] = useState("");
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const { messages, isConnected, sendMessage, connect, disconnect } = useBroadcastSocket();

    const handleConnect = () => {
        if (isConnected) {
            disconnect();
        } else {
            connect(serverUrl, channel);
        }
    };

    const handleSendMessage = (e: React.FormEvent) => {
        e.preventDefault();
        if (messageText.trim() && isConnected) {
            sendMessage({ text: messageText });
            setMessageText("");
        }
    };

    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    return (
        <div style={styles.container}>
            <h1 style={styles.title}>Broadcast Socket Client</h1>

            <div style={styles.connectionPanel}>
                <div style={styles.inputGroup}>
                    <label style={styles.label}>Server URL:</label>
                    <input
                        type="text"
                        value={serverUrl}
                        onChange={(e) => setServerUrl(e.target.value)}
                        disabled={isConnected}
                        style={styles.input}
                        placeholder="http://localhost:12000"
                    />
                </div>

                <div style={styles.inputGroup}>
                    <label style={styles.label}>Channel:</label>
                    <input type="text" value={channel} onChange={(e) => setChannel(e.target.value)} disabled={isConnected} style={styles.input} placeholder="home" />
                </div>

                <button
                    onClick={handleConnect}
                    style={{
                        ...styles.button,
                        ...(isConnected ? styles.disconnectButton : styles.connectButton),
                    }}
                >
                    {isConnected ? "Disconnect" : "Connect"}
                </button>

                <div style={styles.statusIndicator}>
                    <div
                        style={{
                            ...styles.statusDot,
                            backgroundColor: isConnected ? "#4ade80" : "#f87171",
                        }}
                    />
                    <span style={styles.statusText}>{isConnected ? `Connected to ${channel}` : "Disconnected"}</span>
                </div>
            </div>

            <div style={styles.messagesContainer}>
                <h2 style={styles.sectionTitle}>Messages</h2>
                <div style={styles.messagesList}>
                    {messages.length === 0 ? (
                        <div style={styles.emptyState}>No messages yet</div>
                    ) : (
                        messages.map((message, index) => (
                            <div key={index} style={styles.messageItem}>
                                <div style={styles.messageHeader}>
                                    <span style={styles.messageSender}>
                                        {message.sender === "system" ? "🔵 System" : message.sender === "proxy" ? "🟢 Proxy" : `👤 ${message.sender?.substring(0, 8)}`}
                                    </span>
                                    <span style={styles.messageTime}>{new Date(message.timestamp).toLocaleTimeString()}</span>
                                </div>
                                <div style={styles.messageContent}>{JSON.stringify(message.data, null, 2)}</div>
                            </div>
                        ))
                    )}
                    <div ref={messagesEndRef} />
                </div>
            </div>

            <form onSubmit={handleSendMessage} style={styles.sendForm}>
                <input
                    type="text"
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    disabled={!isConnected}
                    placeholder={isConnected ? "Type a message..." : "Connect to send messages"}
                    style={styles.messageInput}
                />
                <button
                    type="submit"
                    disabled={!isConnected || !messageText.trim()}
                    style={{
                        ...styles.button,
                        ...styles.sendButton,
                        opacity: !isConnected || !messageText.trim() ? 0.5 : 1,
                    }}
                >
                    Send
                </button>
            </form>
        </div>
    );
}

const styles: { [key: string]: React.CSSProperties } = {
    container: {
        maxWidth: "800px",
        margin: "0 auto",
        padding: "20px",
        fontFamily: "system-ui, -apple-system, sans-serif",
    },
    title: {
        textAlign: "center",
        color: "#1f2937",
        marginBottom: "20px",
    },
    connectionPanel: {
        backgroundColor: "#f9fafb",
        padding: "20px",
        borderRadius: "8px",
        marginBottom: "20px",
    },
    inputGroup: {
        marginBottom: "15px",
    },
    label: {
        display: "block",
        marginBottom: "5px",
        fontWeight: "500",
        color: "#374151",
    },
    input: {
        width: "100%",
        padding: "10px",
        border: "1px solid #d1d5db",
        borderRadius: "6px",
        fontSize: "14px",
        boxSizing: "border-box",
    },
    button: {
        padding: "10px 20px",
        border: "none",
        borderRadius: "6px",
        fontSize: "14px",
        fontWeight: "500",
        cursor: "pointer",
        transition: "all 0.2s",
    },
    connectButton: {
        backgroundColor: "#3b82f6",
        color: "white",
    },
    disconnectButton: {
        backgroundColor: "#ef4444",
        color: "white",
    },
    statusIndicator: {
        display: "flex",
        alignItems: "center",
        marginTop: "15px",
    },
    statusDot: {
        width: "10px",
        height: "10px",
        borderRadius: "50%",
        marginRight: "8px",
    },
    statusText: {
        fontSize: "14px",
        color: "#6b7280",
    },
    messagesContainer: {
        marginBottom: "20px",
    },
    sectionTitle: {
        fontSize: "18px",
        fontWeight: "600",
        color: "#1f2937",
        marginBottom: "10px",
    },
    messagesList: {
        backgroundColor: "#ffffff",
        border: "1px solid #e5e7eb",
        borderRadius: "8px",
        padding: "15px",
        height: "400px",
        overflowY: "auto",
    },
    emptyState: {
        textAlign: "center",
        color: "#9ca3af",
        padding: "20px",
    },
    messageItem: {
        marginBottom: "15px",
        padding: "10px",
        backgroundColor: "#f9fafb",
        borderRadius: "6px",
        borderLeft: "3px solid #3b82f6",
    },
    messageHeader: {
        display: "flex",
        justifyContent: "space-between",
        marginBottom: "8px",
    },
    messageSender: {
        fontSize: "12px",
        fontWeight: "600",
        color: "#374151",
    },
    messageTime: {
        fontSize: "12px",
        color: "#9ca3af",
    },
    messageContent: {
        fontSize: "14px",
        color: "#1f2937",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        fontFamily: "monospace",
        backgroundColor: "#ffffff",
        padding: "8px",
        borderRadius: "4px",
    },
    sendForm: {
        display: "flex",
        gap: "10px",
    },
    messageInput: {
        flex: 1,
        padding: "10px",
        border: "1px solid #d1d5db",
        borderRadius: "6px",
        fontSize: "14px",
    },
    sendButton: {
        backgroundColor: "#10b981",
        color: "white",
    },
};

export default App;
