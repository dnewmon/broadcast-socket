import React, { ReactNode } from 'react';
import { BroadcastContextValue, BroadcastSocketOptions } from './types';
export declare const BroadcastContext: React.Context<BroadcastContextValue | null>;
export interface BroadcastSocketProviderProps {
    url: string;
    options?: BroadcastSocketOptions;
    children: ReactNode;
}
export declare function BroadcastSocketProvider({ url, options, children }: BroadcastSocketProviderProps): React.ReactElement;
export declare function useBroadcastContext(): BroadcastContextValue;
//# sourceMappingURL=context.d.ts.map