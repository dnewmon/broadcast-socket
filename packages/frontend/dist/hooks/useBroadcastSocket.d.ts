export interface BroadcastMessage {
    data: any;
    timestamp: number;
    sender?: string;
}
interface UseBroadcastSocketReturn {
    messages: BroadcastMessage[];
    isConnected: boolean;
    sendMessage: (data: any) => void;
    connect: (serverUrl: string, channel: string) => void;
    disconnect: () => void;
}
export declare function useBroadcastSocket(): UseBroadcastSocketReturn;
export {};
//# sourceMappingURL=useBroadcastSocket.d.ts.map