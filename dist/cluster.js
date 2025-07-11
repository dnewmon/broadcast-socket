import cluster from 'cluster';
import { BroadcastServer } from './server.js';
import { getServerConfig, logWithTimestamp } from './utils.js';
export class ClusterManager {
    config = getServerConfig();
    workers = new Map();
    workerStats = new Map();
    constructor() {
        this.setupClusterEvents();
    }
    setupClusterEvents() {
        if (cluster.isPrimary) {
            cluster.on('exit', (worker, code, signal) => {
                logWithTimestamp('warn', `Worker ${worker.process.pid} died (${signal || code}). Restarting...`);
                this.workers.delete(worker.id);
                this.workerStats.delete(worker.id);
                setTimeout(() => {
                    this.forkWorker();
                }, 250);
            });
            cluster.on('message', (worker, message) => {
                this.handleWorkerMessage(worker, message);
            });
            process.on('SIGINT', () => {
                this.shutdown();
            });
            process.on('SIGTERM', () => {
                this.shutdown();
            });
        }
    }
    handleWorkerMessage(worker, message) {
        switch (message.type) {
            case 'ping':
                this.workerStats.set(worker.id, {
                    lastPing: Date.now(),
                    data: message.data,
                });
                break;
            case 'broadcast':
                this.broadcastToOtherWorkers(worker.id, message);
                break;
            case 'client-connect':
            case 'client-disconnect':
                logWithTimestamp('info', `Worker ${worker.id}: ${message.type}`, message.data);
                break;
            default:
                logWithTimestamp('warn', `Unknown message type from worker ${worker.id}:`, message.type);
        }
    }
    broadcastToOtherWorkers(senderId, message) {
        for (const [workerId, worker] of this.workers) {
            if (workerId !== senderId && worker.isDead() === false) {
                worker.send(message);
            }
        }
    }
    forkWorker() {
        const worker = cluster.fork();
        this.workers.set(worker.id, worker);
        logWithTimestamp('info', `Worker ${worker.process.pid} started (ID: ${worker.id})`);
        return worker;
    }
    shutdown() {
        logWithTimestamp('info', 'Shutting down cluster...');
        for (const worker of this.workers.values()) {
            worker.kill('SIGTERM');
        }
        setTimeout(() => {
            logWithTimestamp('info', 'Cluster shutdown complete');
            process.exit(0);
        }, 5000);
    }
    start() {
        if (cluster.isPrimary) {
            const numWorkers = this.config.workers;
            logWithTimestamp('info', `Starting cluster with ${numWorkers} workers`);
            logWithTimestamp('info', `Master process ID: ${process.pid}`);
            for (let i = 0; i < numWorkers; i++) {
                this.forkWorker();
            }
            this.setupMasterHealthCheck();
        }
        else {
            this.startWorker();
        }
    }
    setupMasterHealthCheck() {
        setInterval(() => {
            const aliveWorkers = Array.from(this.workers.values()).filter((w) => !w.isDead()).length;
            const totalConnections = Array.from(this.workerStats.values()).reduce((sum, stats) => sum + (stats.data?.connections || 0), 0);
            logWithTimestamp('info', `Cluster health: ${aliveWorkers}/${this.config.workers} workers alive, ${totalConnections} total connections`);
            for (const worker of this.workers.values()) {
                if (!worker.isDead()) {
                    worker.send({
                        type: 'ping',
                        workerId: 0,
                        timestamp: Date.now(),
                    });
                }
            }
        }, 60000);
    }
    async startWorker() {
        const workerId = cluster.worker?.id || 0;
        logWithTimestamp('info', `Starting worker ${workerId} (PID: ${process.pid})`);
        const server = new BroadcastServer();
        const sendClusterMessage = (message) => {
            if (process.send) {
                process.send({
                    ...message,
                    workerId,
                    timestamp: Date.now(),
                });
            }
        };
        process.on('message', (message) => {
            if (message.type === 'broadcast') {
                logWithTimestamp('info', `Worker ${workerId} received cluster broadcast:`, message.data);
            }
        });
        setInterval(() => {
            sendClusterMessage({
                type: 'ping',
                data: {
                    connections: 0,
                    uptime: process.uptime(),
                },
            });
        }, 30000);
        process.on('SIGTERM', async () => {
            logWithTimestamp('info', `Worker ${workerId} shutting down...`);
            await server.stop();
            process.exit(0);
        });
        try {
            await server.start();
            sendClusterMessage({
                type: 'client-connect',
                data: { workerId, status: 'started' },
            });
        }
        catch (error) {
            logWithTimestamp('error', `Worker ${workerId} failed to start:`, error);
            process.exit(1);
        }
    }
    getClusterStats() {
        if (!cluster.isPrimary) {
            return null;
        }
        const workers = Array.from(this.workers.values()).map((worker) => ({
            id: worker.id,
            pid: worker.process.pid,
            isDead: worker.isDead(),
            stats: this.workerStats.get(worker.id) || {},
        }));
        return {
            master: {
                pid: process.pid,
                uptime: process.uptime(),
            },
            workers,
            totalWorkers: this.workers.size,
            aliveWorkers: workers.filter((w) => !w.isDead).length,
        };
    }
}
export class WorkerBroadcastBridge {
    workerId;
    constructor() {
        this.workerId = cluster.worker?.id || 0;
        this.setupMessageHandling();
    }
    setupMessageHandling() {
        process.on('message', (message) => {
            if (message.type === 'broadcast') {
                this.handleClusterBroadcast(message);
            }
        });
    }
    handleClusterBroadcast(message) {
        logWithTimestamp('info', `Worker ${this.workerId} processing cluster broadcast`, message.data);
    }
    broadcastToCluster(data) {
        if (process.send) {
            const message = {
                type: 'broadcast',
                data,
                workerId: this.workerId,
                timestamp: Date.now(),
            };
            process.send(message);
        }
    }
    notifyClientConnect(clientId) {
        if (process.send) {
            process.send({
                type: 'client-connect',
                data: { clientId },
                workerId: this.workerId,
                timestamp: Date.now(),
            });
        }
    }
    notifyClientDisconnect(clientId) {
        if (process.send) {
            process.send({
                type: 'client-disconnect',
                data: { clientId },
                workerId: this.workerId,
                timestamp: Date.now(),
            });
        }
    }
}
//# sourceMappingURL=cluster.js.map