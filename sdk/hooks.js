"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useBroadcastSocket = useBroadcastSocket;
exports.useSubscription = useSubscription;
exports.useBroadcast = useBroadcast;
const react_1 = require("react");
const context_1 = require("./context");
const DEFAULT_OPTIONS = {
    reconnect: true,
    reconnectAttempts: 5,
    reconnectInterval: 1000,
    heartbeatInterval: 30000,
    messageQueueSize: 100,
    debug: false
};
function useBroadcastSocket(url, options = {}) {
    const config = { ...DEFAULT_OPTIONS, ...options };
    const [state, setState] = (0, react_1.useState)({
        connected: false,
        connecting: false,
        error: null,
        reconnectAttempt: 0,
        lastConnected: null
    });
    const socketRef = (0, react_1.useRef)(null);
    const reconnectTimeoutRef = (0, react_1.useRef)(null);
    const heartbeatIntervalRef = (0, react_1.useRef)(null);
    const messageQueueRef = (0, react_1.useRef)([]);
    const pendingMessagesRef = (0, react_1.useRef)(new Map());
    const log = (0, react_1.useCallback)((message, ...args) => {
        if (config.debug) {
            console.log(`[BroadcastSocket] ${message}`, ...args);
        }
    }, [config.debug]);
    const generateMessageId = (0, react_1.useCallback)(() => {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }, []);
    const connect = (0, react_1.useCallback)(() => {
        if (state.connecting || state.connected) {
            return;
        }
        setState(prev => ({ ...prev, connecting: true, error: null }));
        log('Connecting to', url);
        try {
            const socket = new WebSocket(url);
            socketRef.current = socket;
            socket.onopen = () => {
                log('Connected');
                setState(prev => ({
                    ...prev,
                    connected: true,
                    connecting: false,
                    error: null,
                    reconnectAttempt: 0,
                    lastConnected: Date.now()
                }));
                flushMessageQueue();
                setupHeartbeat();
            };
            socket.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    handleMessage(message);
                }
                catch (error) {
                    log('Error parsing message:', error);
                }
            };
            socket.onclose = (event) => {
                log('Disconnected', event.code, event.reason);
                cleanup();
                setState(prev => ({
                    ...prev,
                    connected: false,
                    connecting: false,
                    error: event.reason || 'Connection closed'
                }));
                if (config.reconnect && state.reconnectAttempt < config.reconnectAttempts) {
                    scheduleReconnect();
                }
            };
            socket.onerror = (error) => {
                log('WebSocket error:', error);
                setState(prev => ({ ...prev, error: 'Connection error' }));
            };
        }
        catch (error) {
            log('Error creating WebSocket:', error);
            setState(prev => ({
                ...prev,
                connecting: false,
                error: 'Failed to create connection'
            }));
        }
    }, [url, state.connecting, state.connected, state.reconnectAttempt, config.reconnect, config.reconnectAttempts, log]);
    const disconnect = (0, react_1.useCallback)(() => {
        log('Disconnecting');
        cleanup();
        if (socketRef.current) {
            socketRef.current.close(1000, 'User initiated disconnect');
            socketRef.current = null;
        }
        setState(prev => ({
            ...prev,
            connected: false,
            connecting: false,
            error: null,
            reconnectAttempt: 0
        }));
    }, [log]);
    const cleanup = (0, react_1.useCallback)(() => {
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
        }
        if (heartbeatIntervalRef.current) {
            clearInterval(heartbeatIntervalRef.current);
            heartbeatIntervalRef.current = null;
        }
    }, []);
    const scheduleReconnect = (0, react_1.useCallback)(() => {
        if (reconnectTimeoutRef.current) {
            return;
        }
        const delay = config.reconnectInterval * Math.pow(2, state.reconnectAttempt);
        log(`Reconnecting in ${delay}ms (attempt ${state.reconnectAttempt + 1}/${config.reconnectAttempts})`);
        setState(prev => ({ ...prev, reconnectAttempt: prev.reconnectAttempt + 1 }));
        reconnectTimeoutRef.current = setTimeout(() => {
            reconnectTimeoutRef.current = null;
            connect();
        }, delay);
    }, [config.reconnectInterval, config.reconnectAttempts, state.reconnectAttempt, log, connect]);
    const setupHeartbeat = (0, react_1.useCallback)(() => {
        if (heartbeatIntervalRef.current) {
            clearInterval(heartbeatIntervalRef.current);
        }
        heartbeatIntervalRef.current = setInterval(() => {
            if (socketRef.current?.readyState === WebSocket.OPEN) {
                send({ type: 'broadcast', data: { type: 'heartbeat' } });
            }
        }, config.heartbeatInterval);
    }, [config.heartbeatInterval]);
    const handleMessage = (0, react_1.useCallback)((message) => {
        log('Received message:', message);
        if (message.type === 'ack' && message.messageId) {
            const resolver = pendingMessagesRef.current.get(message.messageId);
            if (resolver) {
                resolver(message);
                pendingMessagesRef.current.delete(message.messageId);
            }
        }
    }, [log]);
    const send = (0, react_1.useCallback)(async (message) => {
        return new Promise((resolve, reject) => {
            const messageWithId = {
                ...message,
                messageId: message.messageId || generateMessageId()
            };
            if (!state.connected || !socketRef.current) {
                if (messageQueueRef.current.length < config.messageQueueSize) {
                    messageQueueRef.current.push(messageWithId);
                    log('Message queued:', messageWithId);
                }
                else {
                    log('Message queue full, dropping message:', messageWithId);
                }
                resolve();
                return;
            }
            try {
                socketRef.current.send(JSON.stringify(messageWithId));
                log('Message sent:', messageWithId);
                if (messageWithId.messageId) {
                    pendingMessagesRef.current.set(messageWithId.messageId, resolve);
                    setTimeout(() => {
                        if (pendingMessagesRef.current.has(messageWithId.messageId)) {
                            pendingMessagesRef.current.delete(messageWithId.messageId);
                            reject(new Error('Message timeout'));
                        }
                    }, 5000);
                }
                else {
                    resolve();
                }
            }
            catch (error) {
                log('Error sending message:', error);
                reject(error);
            }
        });
    }, [state.connected, config.messageQueueSize, log, generateMessageId]);
    const flushMessageQueue = (0, react_1.useCallback)(() => {
        const queue = messageQueueRef.current.splice(0);
        log(`Flushing ${queue.length} queued messages`);
        queue.forEach(message => {
            send(message).catch(error => {
                log('Error sending queued message:', error);
            });
        });
    }, [send, log]);
    const subscribe = (0, react_1.useCallback)(async (channel) => {
        return send({ type: 'subscribe', channel });
    }, [send]);
    const unsubscribe = (0, react_1.useCallback)(async (channel) => {
        return send({ type: 'unsubscribe', channel });
    }, [send]);
    const broadcast = (0, react_1.useCallback)(async (channel, data) => {
        return send({ type: 'broadcast', channel, data });
    }, [send]);
    const reconnect = (0, react_1.useCallback)(() => {
        setState(prev => ({ ...prev, reconnectAttempt: 0 }));
        connect();
    }, [connect]);
    (0, react_1.useEffect)(() => {
        connect();
        return () => {
            cleanup();
            disconnect();
        };
    }, []);
    return {
        state,
        send,
        subscribe,
        unsubscribe,
        broadcast,
        disconnect,
        reconnect
    };
}
function useSubscription(channel) {
    const context = (0, react_1.useContext)(context_1.BroadcastContext);
    if (!context) {
        throw new Error('useSubscription must be used within a BroadcastProvider');
    }
    const [subscriptionState, setSubscriptionState] = (0, react_1.useState)({
        channel,
        subscribed: false,
        subscribing: false,
        error: null,
        messageCount: 0,
        lastMessage: null
    });
    const [messages, setMessages] = (0, react_1.useState)([]);
    const subscribe = (0, react_1.useCallback)(async () => {
        setSubscriptionState(prev => ({ ...prev, subscribing: true, error: null }));
        try {
            await context.subscribe(channel);
            setSubscriptionState(prev => ({
                ...prev,
                subscribed: true,
                subscribing: false
            }));
        }
        catch (error) {
            setSubscriptionState(prev => ({
                ...prev,
                subscribing: false,
                error: error instanceof Error ? error.message : 'Subscription failed'
            }));
        }
    }, [context, channel]);
    const unsubscribe = (0, react_1.useCallback)(async () => {
        try {
            await context.unsubscribe(channel);
            setSubscriptionState(prev => ({
                ...prev,
                subscribed: false,
                subscribing: false
            }));
        }
        catch (error) {
            setSubscriptionState(prev => ({
                ...prev,
                error: error instanceof Error ? error.message : 'Unsubscription failed'
            }));
        }
    }, [context, channel]);
    const clearMessages = (0, react_1.useCallback)(() => {
        setMessages([]);
        setSubscriptionState(prev => ({
            ...prev,
            messageCount: 0,
            lastMessage: null
        }));
    }, []);
    (0, react_1.useEffect)(() => {
        const handleMessage = (message) => {
            if (message.channel === channel) {
                setMessages(prev => [...prev, message].slice(-100));
                setSubscriptionState(prev => ({
                    ...prev,
                    messageCount: prev.messageCount + 1,
                    lastMessage: Date.now()
                }));
            }
        };
        return () => {
        };
    }, [channel]);
    return {
        state: subscriptionState,
        messages,
        subscribe,
        unsubscribe,
        clearMessages
    };
}
function useBroadcast() {
    const context = (0, react_1.useContext)(context_1.BroadcastContext);
    if (!context) {
        throw new Error('useBroadcast must be used within a BroadcastProvider');
    }
    return {
        broadcast: context.broadcast,
        send: context.send,
        state: context.state
    };
}
//# sourceMappingURL=hooks.js.map