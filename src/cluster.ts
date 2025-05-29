import cluster from 'cluster';
import { BroadcastServer } from './server';
import { getServerConfig, logWithTimestamp } from './utils';
import { ClusterMessage, WorkerStatsData } from './types';

export class ClusterManager {
  private config = getServerConfig();
  private workers: Map<number, import('cluster').Worker> = new Map();
  private workerStats: Map<number, {lastPing: number; data?: WorkerStatsData}> = new Map();

  constructor() {
    this.setupClusterEvents();
  }

  private setupClusterEvents(): void {
    if (cluster.isPrimary) {
      cluster.on('exit', (worker, code, signal) => {
        logWithTimestamp('warn', `Worker ${worker.process.pid} died (${signal || code}). Restarting...`);
        this.workers.delete(worker.id);
        this.workerStats.delete(worker.id);
        this.forkWorker();
      });

      cluster.on('message', (worker, message: ClusterMessage) => {
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

  private handleWorkerMessage(worker: import('cluster').Worker, message: ClusterMessage): void {
    switch (message.type) {
      case 'ping':
        this.workerStats.set(worker.id, {
          lastPing: Date.now(),
          data: message.data as WorkerStatsData
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

  private broadcastToOtherWorkers(senderId: number, message: ClusterMessage): void {
    for (const [workerId, worker] of this.workers) {
      if (workerId !== senderId && worker.isDead() === false) {
        worker.send(message);
      }
    }
  }

  private forkWorker(): import('cluster').Worker {
    const worker = cluster.fork();
    this.workers.set(worker.id, worker);
    
    logWithTimestamp('info', `Worker ${worker.process.pid} started (ID: ${worker.id})`);
    
    return worker;
  }

  private shutdown(): void {
    logWithTimestamp('info', 'Shutting down cluster...');

    for (const worker of this.workers.values()) {
      worker.kill('SIGTERM');
    }

    setTimeout(() => {
      logWithTimestamp('info', 'Cluster shutdown complete');
      process.exit(0);
    }, 5000);
  }

  start(): void {
    if (cluster.isPrimary) {
      const numWorkers = this.config.workers;
      logWithTimestamp('info', `Starting cluster with ${numWorkers} workers`);
      logWithTimestamp('info', `Master process ID: ${process.pid}`);

      for (let i = 0; i < numWorkers; i++) {
        this.forkWorker();
      }

      this.setupMasterHealthCheck();
    } else {
      this.startWorker();
    }
  }

  private setupMasterHealthCheck(): void {
    setInterval(() => {
      const aliveWorkers = Array.from(this.workers.values()).filter(w => !w.isDead()).length;
      const totalConnections = Array.from(this.workerStats.values())
        .reduce((sum, stats) => sum + (stats.data?.connections || 0), 0);

      logWithTimestamp('info', `Cluster health: ${aliveWorkers}/${this.config.workers} workers alive, ${totalConnections} total connections`);

      for (const worker of this.workers.values()) {
        if (!worker.isDead()) {
          worker.send({
            type: 'ping',
            workerId: 0,
            timestamp: Date.now()
          } as ClusterMessage);
        }
      }
    }, 60000);
  }

  private async startWorker(): Promise<void> {
    const workerId = cluster.worker?.id || 0;
    logWithTimestamp('info', `Starting worker ${workerId} (PID: ${process.pid})`);

    const server = new BroadcastServer();
    
    const sendClusterMessage = (message: Omit<ClusterMessage, 'workerId' | 'timestamp'>) => {
      if (process.send) {
        process.send({
          ...message,
          workerId,
          timestamp: Date.now()
        } as ClusterMessage);
      }
    };

    process.on('message', (message: ClusterMessage) => {
      if (message.type === 'broadcast') {
        logWithTimestamp('info', `Worker ${workerId} received cluster broadcast:`, message.data);
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
      logWithTimestamp('info', `Worker ${workerId} shutting down...`);
      await server.stop();
      process.exit(0);
    });

    try {
      await server.start();
      
      sendClusterMessage({
        type: 'client-connect',
        data: { workerId, status: 'started' }
      });
    } catch (error) {
      logWithTimestamp('error', `Worker ${workerId} failed to start:`, error);
      process.exit(1);
    }
  }

  getClusterStats(): unknown {
    if (!cluster.isPrimary) {
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

export class WorkerBroadcastBridge {
  private workerId: number;

  constructor() {
    this.workerId = cluster.worker?.id || 0;
    this.setupMessageHandling();
  }

  private setupMessageHandling(): void {
    process.on('message', (message: ClusterMessage) => {
      if (message.type === 'broadcast') {
        this.handleClusterBroadcast(message);
      }
    });
  }

  private handleClusterBroadcast(message: ClusterMessage): void {
    logWithTimestamp('info', `Worker ${this.workerId} processing cluster broadcast`, message.data);
  }

  broadcastToCluster(data: unknown): void {
    if (process.send) {
      const message: ClusterMessage = {
        type: 'broadcast',
        data,
        workerId: this.workerId,
        timestamp: Date.now()
      };
      
      process.send(message);
    }
  }

  notifyClientConnect(clientId: string): void {
    if (process.send) {
      process.send({
        type: 'client-connect',
        data: { clientId },
        workerId: this.workerId,
        timestamp: Date.now()
      } as ClusterMessage);
    }
  }

  notifyClientDisconnect(clientId: string): void {
    if (process.send) {
      process.send({
        type: 'client-disconnect',
        data: { clientId },
        workerId: this.workerId,
        timestamp: Date.now()
      } as ClusterMessage);
    }
  }
}

if (require.main === module) {
  const clusterManager = new ClusterManager();
  clusterManager.start();
}