import React, { createContext, useContext, ReactNode } from 'react';
import { 
  BroadcastContextValue, 
  BroadcastSocketOptions 
} from './types';
import { useBroadcastSocket } from './hooks';

export const BroadcastContext = createContext<BroadcastContextValue | null>(null);

export interface BroadcastProviderProps {
  url: string;
  options?: BroadcastSocketOptions;
  children: ReactNode;
}

export function BroadcastProvider({ 
  url, 
  options = {}, 
  children 
}: BroadcastProviderProps): React.ReactElement {
  const { 
    state, 
    send, 
    subscribe, 
    unsubscribe, 
    broadcast,
    addMessageListener
  } = useBroadcastSocket(url, options);

  const contextValue: BroadcastContextValue = {
    socket: null, // WebSocket instance not directly exposed for security
    state,
    subscribe,
    unsubscribe,
    broadcast,
    send,
    addMessageListener
  };

  return React.createElement(
    BroadcastContext.Provider,
    { value: contextValue },
    children
  );
}

export function useBroadcastContext(): BroadcastContextValue {
  const context = useContext(BroadcastContext);
  
  if (!context) {
    throw new Error('useBroadcastContext must be used within a BroadcastProvider');
  }
  
  return context;
}