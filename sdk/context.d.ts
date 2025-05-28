import { ReactNode } from 'react';
import { BroadcastContextValue, BroadcastSocketOptions } from './types';
export declare const BroadcastContext: any;
export interface BroadcastProviderProps {
    url: string;
    options?: BroadcastSocketOptions;
    children: ReactNode;
}
export declare function BroadcastProvider({ url, options, children }: BroadcastProviderProps): JSX.Element;
export declare function useBroadcastContext(): BroadcastContextValue;
//# sourceMappingURL=context.d.ts.map