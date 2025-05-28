import React, { ReactNode } from 'react';
import { BroadcastContextValue, BroadcastSocketOptions } from './types';
export declare const BroadcastContext: React.Context<BroadcastContextValue | null>;
export interface BroadcastProviderProps {
    url: string;
    options?: BroadcastSocketOptions;
    children: ReactNode;
}
export declare function BroadcastProvider({ url, options, children }: BroadcastProviderProps): React.ReactElement;
export declare function useBroadcastContext(): BroadcastContextValue;
//# sourceMappingURL=context.d.ts.map