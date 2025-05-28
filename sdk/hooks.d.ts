import { BroadcastSocketOptions, BroadcastSocketState, SendMessage, BroadcastHookReturn, SubscriptionHookReturn } from './types';
export declare function useBroadcastSocket(url: string, options?: BroadcastSocketOptions): BroadcastHookReturn;
export declare function useSubscription(channel: string): SubscriptionHookReturn;
export declare function useBroadcast(): {
    broadcast: (channel: string, data: any) => Promise<void>;
    send: (message: SendMessage) => Promise<void>;
    state: BroadcastSocketState;
};
//# sourceMappingURL=hooks.d.ts.map