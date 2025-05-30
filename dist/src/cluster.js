"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkerBroadcastBridge = exports.ClusterManager = void 0;
const cluster_1 = __importDefault(require("cluster"));
const server_1 = require("./server");
const utils_1 = require("./utils");
class ClusterManager {
    constructor() {
        this.config = (0, utils_1.getServerConfig)();
        this.workers = new Map();
        this.workerStats = new Map();
        this.setupClusterEvents();
    }
    setupClusterEvents() {
        if (cluster_1.default.isMaster) {
            cluster_1.default.on('exit', (worker, code, signal) => {
                (0, utils_1.logWithTimestamp)('warn', `Worker ${worker.process.pid} died (${signal || code}). Restarting...`);
                this.workers.delete(worker.id);
                this.workerStats.delete(worker.id);
                this.forkWorker();
            });
            cluster_1.default.on('message', (worker, message) => {
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
                    data: message.data
                });
                break;
            case 'broadcast':
                this.broadcastToOtherWorkers(worker.id, message);
                break;
            case 'client-connect':
            case 'client-disconnect':
                (0, utils_1.logWithTimestamp)('info', `Worker ${worker.id}: ${message.type}`, message.data);
                break;
            default:
                (0, utils_1.logWithTimestamp)('warn', `Unknown message type from worker ${worker.id}:`, message.type);
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
        const worker = cluster_1.default.fork();
        this.workers.set(worker.id, worker);
        (0, utils_1.logWithTimestamp)('info', `Worker ${worker.process.pid} started (ID: ${worker.id})`);
        return worker;
    }
    shutdown() {
        (0, utils_1.logWithTimestamp)('info', 'Shutting down cluster...');
        for (const worker of this.workers.values()) {
            worker.kill('SIGTERM');
        }
        setTimeout(() => {
            (0, utils_1.logWithTimestamp)('info', 'Cluster shutdown complete');
            process.exit(0);
        }, 5000);
    }
    start() {
        if (cluster_1.default.isMaster) {
            const numWorkers = this.config.workers;
            (0, utils_1.logWithTimestamp)('info', `Starting cluster with ${numWorkers} workers`);
            (0, utils_1.logWithTimestamp)('info', `Master process ID: ${process.pid}`);
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
            const aliveWorkers = Array.from(this.workers.values()).filter(w => !w.isDead()).length;
            const totalConnections = Array.from(this.workerStats.values())
                .reduce((sum, stats) => sum + (stats.data?.connections || 0), 0);
            (0, utils_1.logWithTimestamp)('info', `Cluster health: ${aliveWorkers}/${this.config.workers} workers alive, ${totalConnections} total connections`);
            for (const [workerId, worker] of this.workers) {
                if (!worker.isDead()) {
                    worker.send({
                        type: 'ping',
                        workerId: 0,
                        timestamp: Date.now()
                    });
                }
            }
        }, 60000);
    }
    async startWorker() {
        const workerId = cluster_1.default.worker?.id || 0;
        (0, utils_1.logWithTimestamp)('info', `Starting worker ${workerId} (PID: ${process.pid})`);
        const server = new server_1.BroadcastServer();
        const sendClusterMessage = (message) => {
            if (process.send) {
                process.send({
                    ...message,
                    workerId,
                    timestamp: Date.now()
                });
            }
        };
        process.on('message', (message) => {
            if (message.type === 'broadcast') {
                (0, utils_1.logWithTimestamp)('info', `Worker ${workerId} received cluster broadcast:`, message.data);
            }
        });
        setInterval(() => {
            sendClusterMessage({
                type: 'ping',
                data: {
                    connections: 0,
                    uptime: process.uptime()
                }
            });
        }, 30000);
        process.on('SIGTERM', async () => {
            (0, utils_1.logWithTimestamp)('info', `Worker ${workerId} shutting down...`);
            await server.stop();
            process.exit(0);
        });
        try {
            await server.start();
            sendClusterMessage({
                type: 'client-connect',
                data: { workerId, status: 'started' }
            });
        }
        catch (error) {
            (0, utils_1.logWithTimestamp)('error', `Worker ${workerId} failed to start:`, error);
            process.exit(1);
        }
    }
    getClusterStats() {
        if (!cluster_1.default.isMaster) {
            return null;
        }
        const workers = Array.from(this.workers.values()).map(worker => ({
            id: worker.id,
            pid: worker.process.pid,
            isDead: worker.isDead(),
            stats: this.workerStats.get(worker.id) || {}
        }));
        return {
            master: {
                pid: process.pid,
                uptime: process.uptime()
            },
            workers,
            totalWorkers: this.workers.size,
            aliveWorkers: workers.filter(w => !w.isDead).length
        };
    }
}
exports.ClusterManager = ClusterManager;
class WorkerBroadcastBridge {
    constructor() {
        this.workerId = cluster_1.default.worker?.id || 0;
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
        (0, utils_1.logWithTimestamp)('info', `Worker ${this.workerId} processing cluster broadcast`, message.data);
    }
    broadcastToCluster(data) {
        if (process.send) {
            const message = {
                type: 'broadcast',
                data,
                workerId: this.workerId,
                timestamp: Date.now()
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
                timestamp: Date.now()
            });
        }
    }
    notifyClientDisconnect(clientId) {
        if (process.send) {
            process.send({
                type: 'client-disconnect',
                data: { clientId },
                workerId: this.workerId,
                timestamp: Date.now()
            });
        }
    }
}
exports.WorkerBroadcastBridge = WorkerBroadcastBridge;
if (require.main === module) {
    const clusterManager = new ClusterManager();
    clusterManager.start();
}
//# sourceMappingURL=cluster.js.map