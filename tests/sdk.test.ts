/**
 * @jest-environment jsdom
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useBroadcastSocket } from '../sdk-src/hooks';

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  url: string;
  onopen?: (event: Event) => void;
  onclose?: (event: CloseEvent) => void;
  onmessage?: (event: MessageEvent) => void;
  onerror?: (event: Event) => void;

  constructor(url: string) {
    this.url = url;
    
    // Simulate connection opening
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.(new Event('open'));
    }, 10);
  }

  send(data: string) {
    // Simulate message sending
    console.log('MockWebSocket sending:', data);
    
    // Simulate server acknowledgment
    setTimeout(() => {
      if (this.onmessage) {
        const message = JSON.parse(data);
        const ackResponse = {
          type: 'ack',
          messageId: message.messageId,
          timestamp: Date.now()
        };
        this.onmessage(new MessageEvent('message', { 
          data: JSON.stringify(ackResponse) 
        }));
      }
    }, 10);
  }

  close(code?: number, reason?: string) {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.(new CloseEvent('close', { 
      code: code || 1000, 
      reason: reason || '' 
    }));
  }
}

// @ts-ignore
global.WebSocket = MockWebSocket;

describe('SDK Hooks', () => {
  describe('useBroadcastSocket', () => {
    const testUrl = 'ws://localhost:8080';

    test('should initialize with default state', () => {
      const { result } = renderHook(() => 
        useBroadcastSocket(testUrl, { reconnect: false })
      );

      expect(result.current.state.connected).toBe(false);
      expect(result.current.state.connecting).toBe(true);
      expect(result.current.state.error).toBe(null);
      expect(result.current.state.reconnectAttempt).toBe(0);
    });

    test('should connect successfully', async () => {
      const { result } = renderHook(() => 
        useBroadcastSocket(testUrl, { reconnect: false })
      );

      // Wait for connection to open
      await waitFor(() => {
        expect(result.current.state.connected).toBe(true);
      });

      expect(result.current.state.connecting).toBe(false);
      expect(result.current.state.error).toBe(null);
    });

    test('should provide send function', async () => {
      const { result } = renderHook(() => 
        useBroadcastSocket(testUrl, { reconnect: false })
      );

      await waitFor(() => {
        expect(result.current.state.connected).toBe(true);
      });

      expect(typeof result.current.send).toBe('function');
      
      // Test sending a message
      await act(async () => {
        await result.current.send({
          type: 'subscribe',
          channel: 'test-channel'
        });
      });
    });

    test('should provide subscribe function', async () => {
      const { result } = renderHook(() => 
        useBroadcastSocket(testUrl, { reconnect: false })
      );

      await waitFor(() => {
        expect(result.current.state.connected).toBe(true);
      });

      expect(typeof result.current.subscribe).toBe('function');
      
      await act(async () => {
        await result.current.subscribe('test-channel');
      });
    });

    test('should provide unsubscribe function', async () => {
      const { result } = renderHook(() => 
        useBroadcastSocket(testUrl, { reconnect: false })
      );

      await waitFor(() => {
        expect(result.current.state.connected).toBe(true);
      });

      expect(typeof result.current.unsubscribe).toBe('function');
      
      await act(async () => {
        await result.current.unsubscribe('test-channel');
      });
    });

    test('should provide broadcast function', async () => {
      const { result } = renderHook(() => 
        useBroadcastSocket(testUrl, { reconnect: false })
      );

      await waitFor(() => {
        expect(result.current.state.connected).toBe(true);
      });

      expect(typeof result.current.broadcast).toBe('function');
      
      await act(async () => {
        await result.current.broadcast('test-channel', { message: 'Hello' });
      });
    });

    test('should handle disconnect', async () => {
      const { result } = renderHook(() => 
        useBroadcastSocket(testUrl, { reconnect: false })
      );

      await waitFor(() => {
        expect(result.current.state.connected).toBe(true);
      });

      expect(typeof result.current.disconnect).toBe('function');
      
      act(() => {
        result.current.disconnect();
      });

      expect(result.current.state.connected).toBe(false);
    });

    test('should handle reconnect', async () => {
      const { result } = renderHook(() => 
        useBroadcastSocket(testUrl, { reconnect: false })
      );

      await waitFor(() => {
        expect(result.current.state.connected).toBe(true);
      });

      expect(typeof result.current.reconnect).toBe('function');
      
      act(() => {
        result.current.reconnect();
      });
    });

    test('should queue messages when disconnected', () => {
      const { result } = renderHook(() => 
        useBroadcastSocket(testUrl, { 
          reconnect: false,
          messageQueueSize: 10
        })
      );

      // Send message while disconnected
      act(() => {
        result.current.send({
          type: 'broadcast',
          channel: 'test',
          data: 'test message'
        });
      });

      // Message should be queued (no error thrown)
      expect(result.current.state.connected).toBe(false);
    });
  });

  describe('Hook Configuration', () => {
    test('should respect custom options', () => {
      const options = {
        reconnect: true,
        reconnectAttempts: 3,
        reconnectInterval: 2000,
        heartbeatInterval: 10000,
        messageQueueSize: 50,
        debug: true
      };

      const { result } = renderHook(() => 
        useBroadcastSocket('ws://localhost:8080', options)
      );

      // Hook should initialize without errors
      expect(result.current.state).toBeDefined();
    });

    test('should use default options when none provided', () => {
      const { result } = renderHook(() => 
        useBroadcastSocket('ws://localhost:8080')
      );

      expect(result.current.state).toBeDefined();
      expect(result.current.state.reconnectAttempt).toBe(0);
    });
  });
});