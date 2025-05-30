import { BroadcastSocketOptions, BroadcastHookReturn, SubscriptionHookReturn } from './types';
export declare function useBroadcastSocket(url: string, options?: BroadcastSocketOptions): BroadcastHookReturn;
export declare function useSubscription(channel: string): SubscriptionHookReturn;
export declare function useBroadcast(): {
    broadcast: any;
    send: any;
    state: any;
};
//# sourceMappingURL=hooks.d.ts.map