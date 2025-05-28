import { useState, useEffect, useRef, useCallback, useContext } from 'react';
import { 
  BroadcastSocketOptions, 
  BroadcastSocketState, 
  BroadcastMessage, 
  SendMessage,
  BroadcastHookReturn,
  SubscriptionHookReturn,
  SubscriptionState 
} from './types';
import { BroadcastContext } from './context';

const DEFAULT_OPTIONS: Required<BroadcastSocketOptions> = {
  reconnect: true,
  reconnectAttempts: 5,
  reconnectInterval: 1000,
  heartbeatInterval: 30000,
  messageQueueSize: 100,
  debug: false
};

export function useBroadcastSocket(
  url: string, 
  options: BroadcastSocketOptions = {}
): BroadcastHookReturn {
  const config = { ...DEFAULT_OPTIONS, ...options };
  const [state, setState] = useState<BroadcastSocketState>({
    connected: false,
    connecting: false,
    error: null,
    reconnectAttempt: 0,
    lastConnected: null
  });

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const messageQueueRef = useRef<SendMessage[]>([]);
  const pendingMessagesRef = useRef<Map<string, (response: any) => void>>(new Map());
  const messageListenersRef = useRef<Set<(message: BroadcastMessage) => void>>(new Set());

  const log = useCallback((message: string, ...args: any[]) => {
    if (config.debug) {
      console.log(`[BroadcastSocket] ${message}`, ...args);
    }
  }, [config.debug]);

  const generateMessageId = useCallback(() => {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  const send = useCallback(async (message: SendMessage): Promise<void> => {
    return new Promise((resolve, reject) => {
      const messageWithId = {
        ...message,
        messageId: message.messageId || generateMessageId()
      };

      if (!state.connected || !socketRef.current) {
        if (messageQueueRef.current.length < config.messageQueueSize) {
          messageQueueRef.current.push(messageWithId);
          log('Message queued:', messageWithId);
        } else {
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
            if (pendingMessagesRef.current.has(messageWithId.messageId!)) {
              pendingMessagesRef.current.delete(messageWithId.messageId!);
              reject(new Error('Message timeout'));
            }
          }, 5000);
        } else {
          resolve();
        }
      } catch (error) {
        log('Error sending message:', error);
        reject(error);
      }
    });
  }, [state.connected, config.messageQueueSize, log, generateMessageId]);

  const flushMessageQueue = useCallback(() => {
    const queue = messageQueueRef.current.splice(0);
    log(`Flushing ${queue.length} queued messages`);

    queue.forEach((message: SendMessage) => {
      send(message).catch((error: Error) => {
        log('Error sending queued message:', error);
      });
    });
  }, [send, log]);

  const connect = useCallback(() => {
    if (state.connecting || state.connected) {
      return;
    }

    setState((prev: BroadcastSocketState) => ({ ...prev, connecting: true, error: null }));
    log('Connecting to', url);

    try {
      const socket = new WebSocket(url);
      socketRef.current = socket;

      socket.onopen = () => {
        log('Connected');
        setState((prev: BroadcastSocketState) => ({
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
          const message: BroadcastMessage = JSON.parse(event.data);
          handleMessage(message);
        } catch (error) {
          log('Error parsing message:', error);
        }
      };

      socket.onclose = (event) => {
        log('Disconnected', event.code, event.reason);
        cleanup();
        
        setState((prev: BroadcastSocketState) => ({
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
        setState((prev: BroadcastSocketState) => ({ ...prev, error: 'Connection error' }));
      };

    } catch (error) {
      log('Error creating WebSocket:', error);
      setState((prev: BroadcastSocketState) => ({
        ...prev,
        connecting: false,
        error: 'Failed to create connection'
      }));
    }
  }, [url, state.connecting, state.connected, state.reconnectAttempt, config.reconnect, config.reconnectAttempts, log]);

  const disconnect = useCallback(() => {
    log('Disconnecting');
    cleanup();
    
    if (socketRef.current) {
      socketRef.current.close(1000, 'User initiated disconnect');
      socketRef.current = null;
    }

    setState((prev: BroadcastSocketState) => ({
      ...prev,
      connected: false,
      connecting: false,
      error: null,
      reconnectAttempt: 0
    }));
  }, [log]);

  const cleanup = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
  }, []);

  const scheduleReconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      return;
    }

    const delay = config.reconnectInterval * Math.pow(2, state.reconnectAttempt);
    log(`Reconnecting in ${delay}ms (attempt ${state.reconnectAttempt + 1}/${config.reconnectAttempts})`);

    setState((prev: BroadcastSocketState) => ({ ...prev, reconnectAttempt: prev.reconnectAttempt + 1 }));

    reconnectTimeoutRef.current = setTimeout(() => {
      reconnectTimeoutRef.current = null;
      connect();
    }, delay);
  }, [config.reconnectInterval, config.reconnectAttempts, state.reconnectAttempt, log, connect]);

  const setupHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
    }

    heartbeatIntervalRef.current = setInterval(() => {
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        send({ type: 'broadcast', data: { type: 'heartbeat' } });
      }
    }, config.heartbeatInterval);
  }, [config.heartbeatInterval]);

  const handleMessage = useCallback((message: BroadcastMessage) => {
    log('Received message:', message);

    if (message.type === 'ack' && message.messageId) {
      const resolver = pendingMessagesRef.current.get(message.messageId);
      if (resolver) {
        resolver(message);
        pendingMessagesRef.current.delete(message.messageId);
      }
    }

    messageListenersRef.current.forEach((listener: (message: BroadcastMessage) => void) => {
      try {
        listener(message);
      } catch (error) {
        log('Error in message listener:', error);
      }
    });
  }, [log]);

  const addMessageListener = useCallback((listener: (message: BroadcastMessage) => void): (() => void) => {
    messageListenersRef.current.add(listener);
    
    return () => {
      messageListenersRef.current.delete(listener);
    };
  }, []);



  const subscribe = useCallback(async (channel: string): Promise<void> => {
    return send({ type: 'subscribe', channel });
  }, [send]);

  const unsubscribe = useCallback(async (channel: string): Promise<void> => {
    return send({ type: 'unsubscribe', channel });
  }, [send]);

  const broadcast = useCallback(async (channel: string, data: any): Promise<void> => {
    return send({ type: 'broadcast', channel, data });
  }, [send]);

  const reconnect = useCallback(() => {
    setState((prev: BroadcastSocketState) => ({ ...prev, reconnectAttempt: 0 }));
    connect();
  }, [connect]);

  useEffect(() => {
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
    reconnect,
    addMessageListener
  };
}

export function useSubscription(channel: string): SubscriptionHookReturn {
  const context = useContext(BroadcastContext);
  
  if (!context) {
    throw new Error('useSubscription must be used within a BroadcastProvider');
  }

  const [subscriptionState, setSubscriptionState] = useState<SubscriptionState>({
    channel,
    subscribed: false,
    subscribing: false,
    error: null,
    messageCount: 0,
    lastMessage: null
  });

  const [messages, setMessages] = useState<BroadcastMessage[]>([]);

  const subscribe = useCallback(async () => {
    setSubscriptionState((prev: SubscriptionState) => ({ ...prev, subscribing: true, error: null }));
    
    try {
      await context.subscribe(channel);
      setSubscriptionState((prev: SubscriptionState) => ({
        ...prev,
        subscribed: true,
        subscribing: false
      }));
    } catch (error) {
      setSubscriptionState((prev: SubscriptionState) => ({
        ...prev,
        subscribing: false,
        error: error instanceof Error ? error.message : 'Subscription failed'
      }));
    }
  }, [context, channel]);

  const unsubscribe = useCallback(async () => {
    try {
      await context.unsubscribe(channel);
      setSubscriptionState((prev: SubscriptionState) => ({
        ...prev,
        subscribed: false,
        subscribing: false
      }));
    } catch (error) {
      setSubscriptionState((prev: SubscriptionState) => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Unsubscription failed'
      }));
    }
  }, [context, channel]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setSubscriptionState((prev: SubscriptionState) => ({
      ...prev,
      messageCount: 0,
      lastMessage: null
    }));
  }, []);

  useEffect(() => {
    const handleMessage = (message: BroadcastMessage) => {
      if (message.channel === channel && message.type === 'message') {
        setMessages((prev: BroadcastMessage[]) => [...prev, message].slice(-100));
        setSubscriptionState((prev: SubscriptionState) => ({
          ...prev,
          messageCount: prev.messageCount + 1,
          lastMessage: Date.now()
        }));
      }
    };

    const removeListener = context.addMessageListener(handleMessage);

    return removeListener;
  }, [channel, context]);

  return {
    state: subscriptionState,
    messages,
    subscribe,
    unsubscribe,
    clearMessages
  };
}

export function useBroadcast() {
  const context = useContext(BroadcastContext);
  
  if (!context) {
    throw new Error('useBroadcast must be used within a BroadcastProvider');
  }

  return {
    broadcast: context.broadcast,
    send: context.send,
    state: context.state
  };
}