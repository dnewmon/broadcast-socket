export declare class ClusterManager {
    private config;
    private workers;
    private workerStats;
    constructor();
    private setupClusterEvents;
    private handleWorkerMessage;
    private broadcastToOtherWorkers;
    private forkWorker;
    private shutdown;
    start(): void;
    private setupMasterHealthCheck;
    private startWorker;
    getClusterStats(): any;
}
export declare class WorkerBroadcastBridge {
    private workerId;
    constructor();
    private setupMessageHandling;
    private handleClusterBroadcast;
    broadcastToCluster(data: any): void;
    notifyClientConnect(clientId: string): void;
    notifyClientDisconnect(clientId: string): void;
}
//# sourceMappingURL=cluster.d.ts.map