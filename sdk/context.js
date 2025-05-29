import React, { createContext, useContext } from 'react';
import { useBroadcastSocket } from './hooks';
export const BroadcastContext = createContext(null);
export function BroadcastSocketProvider({ url, options = {}, children }) {
    const { state, send, subscribe, unsubscribe, broadcast, addMessageListener } = useBroadcastSocket(url, options);
    const contextValue = {
        socket: null,
        state,
        subscribe,
        unsubscribe,
        broadcast,
        send,
        addMessageListener
    };
    return React.createElement(BroadcastContext.Provider, { value: contextValue }, children);
}
export function useBroadcastContext() {
    const context = useContext(BroadcastContext);
    if (!context) {
        throw new Error('useBroadcastContext must be used within a BroadcastSocketProvider');
    }
    return context;
}
//# sourceMappingURL=context.js.map