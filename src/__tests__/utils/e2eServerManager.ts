/**
 * Phase 3.2: E2E Test Server Management
 * Robust development server management for reliable E2E testing
 */

import { spawn, ChildProcess } from 'child_process';
import { logger } from '@/lib/logger';
import fetch from 'node-fetch';

export interface ServerConfig {
  port: number;
  host: string;
  command: string;
  args: string[];
  startupTimeout: number;
  healthCheckPath: string;
  shutdownTimeout: number;
  env?: Record<string, string>;
}

export interface ServerStatus {
  isRunning: boolean;
  pid?: number;
  port: number;
  startTime?: Date;
  healthCheckUrl: string;
  lastHealthCheck?: Date;
  errorCount: number;
}

export const DEFAULT_SERVER_CONFIG: ServerConfig = {
  port: 3000,
  host: 'localhost',
  command: 'npm',
  args: ['run', 'dev'],
  startupTimeout: 30000, // 30 seconds
  healthCheckPath: '/',
  shutdownTimeout: 10000, // 10 seconds
  env: {
    NODE_ENV: 'test',
    PORT: '3000',
    NEXT_TELEMETRY_DISABLED: '1'
  }
};

/**
 * E2E Development Server Manager
 * Handles server lifecycle for E2E testing with robust error recovery
 */
export class E2EServerManager {
  private static instance: E2EServerManager | null = null;
  private config: ServerConfig;
  private serverProcess: ChildProcess | null = null;
  private status: ServerStatus;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private startupPromise: Promise<void> | null = null;

  constructor(config: Partial<ServerConfig> = {}) {
    this.config = { ...DEFAULT_SERVER_CONFIG, ...config };
    this.status = {
      isRunning: false,
      port: this.config.port,
      healthCheckUrl: `http://${this.config.host}:${this.config.port}${this.config.healthCheckPath}`,
      errorCount: 0
    };
  }

  static getInstance(config?: Partial<ServerConfig>): E2EServerManager {
    if (!E2EServerManager.instance) {
      E2EServerManager.instance = new E2EServerManager(config);
    }
    return E2EServerManager.instance;
  }

  static reset(): void {
    if (E2EServerManager.instance) {
      E2EServerManager.instance.stop();
      E2EServerManager.instance = null;
    }
  }

  /**
   * Start the development server with comprehensive error handling
   */
  async start(): Promise<void> {
    // If startup is already in progress, wait for it
    if (this.startupPromise) {
      return this.startupPromise;
    }

    // If server is already running, verify it's healthy
    if (this.status.isRunning) {
      const isHealthy = await this.healthCheck();
      if (isHealthy) {
        logger.debug('Server already running and healthy', {
          port: this.config.port,
          pid: this.status.pid
        });
        return;
      } else {
        logger.warn('Server marked as running but health check failed, restarting');
        await this.stop();
      }
    }

    this.startupPromise = this.doStart();
    try {
      await this.startupPromise;
    } finally {
      this.startupPromise = null;
    }
  }

  private async doStart(): Promise<void> {
    logger.info('Starting E2E development server', {
      command: `${this.config.command} ${this.config.args.join(' ')}`,
      port: this.config.port,
      timeout: this.config.startupTimeout
    });

    // Check if port is already in use
    const portInUse = await this.isPortInUse(this.config.port);
    if (portInUse) {
      logger.info('Port already in use, attempting to connect to existing server');
      const isHealthy = await this.healthCheck();
      if (isHealthy) {
        this.status.isRunning = true;
        this.status.startTime = new Date();
        this.startHealthChecking();
        logger.info('Connected to existing server successfully');
        return;
      } else {
        throw new Error(`Port ${this.config.port} is in use but server is not responding to health checks`);
      }
    }

    // Start new server process
    await this.spawnServerProcess();
    
    // Wait for server to be ready
    const startTime = Date.now();
    let lastError: Error | null = null;

    while (Date.now() - startTime < this.config.startupTimeout) {
      try {
        const isHealthy = await this.healthCheck();
        if (isHealthy) {
          this.status.isRunning = true;
          this.status.startTime = new Date();
          this.startHealthChecking();
          
          logger.info('E2E development server started successfully', {
            port: this.config.port,
            pid: this.status.pid,
            startupTime: Date.now() - startTime
          });
          
          return;
        }
      } catch (error) {
        lastError = error as Error;
        // Continue retrying
      }

      // Wait before next health check
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Server failed to start within timeout
    await this.stop();
    throw new Error(
      `Server failed to start within ${this.config.startupTimeout}ms. ` +
      `Last error: ${lastError?.message || 'Unknown error'}`
    );
  }

  private async spawnServerProcess(): Promise<void> {
    return new Promise((resolve, reject) => {
      const env = {
        ...process.env,
        ...this.config.env
      };

      this.serverProcess = spawn(this.config.command, this.config.args, {
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false
      });

      this.status.pid = this.serverProcess.pid || undefined;

      // Handle server output
      this.serverProcess.stdout?.on('data', (data) => {
        const output = data.toString();
        if (process.env.VERBOSE_E2E_SERVER) {
          console.log(`[SERVER] ${output}`);
        }
        
        // Look for server ready indicators
        if (output.includes('Ready on') || output.includes('started server on')) {
          logger.debug('Server startup detected in output');
        }
      });

      this.serverProcess.stderr?.on('data', (data) => {
        const output = data.toString();
        if (process.env.VERBOSE_E2E_SERVER) {
          console.error(`[SERVER ERROR] ${output}`);
        }
        
        // Check for common startup errors
        if (output.includes('EADDRINUSE') || output.includes('port') && output.includes('already in use')) {
          reject(new Error(`Port ${this.config.port} is already in use`));
          return;
        }
      });

      this.serverProcess.on('error', (error) => {
        logger.error('Server process error', error, {
          command: this.config.command,
          args: this.config.args
        });
        reject(error);
      });

      this.serverProcess.on('exit', (code, signal) => {
        logger.info('Server process exited', {
          code,
          signal,
          pid: this.status.pid
        });
        
        this.status.isRunning = false;
        this.status.pid = undefined;
      });

      // Give the process a moment to start
      setTimeout(() => resolve(), 2000);
    });
  }

  /**
   * Stop the development server gracefully
   */
  async stop(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    if (!this.serverProcess || !this.status.isRunning) {
      this.status.isRunning = false;
      return;
    }

    logger.info('Stopping E2E development server', {
      pid: this.status.pid,
      port: this.config.port
    });

    return new Promise((resolve) => {
      if (!this.serverProcess) {
        resolve();
        return;
      }

      const shutdownTimeout = setTimeout(() => {
        logger.warn('Server shutdown timeout, force killing', {
          pid: this.status.pid
        });
        
        if (this.serverProcess && !this.serverProcess.killed) {
          this.serverProcess.kill('SIGKILL');
        }
        resolve();
      }, this.config.shutdownTimeout);

      this.serverProcess.on('exit', () => {
        clearTimeout(shutdownTimeout);
        this.status.isRunning = false;
        this.status.pid = undefined;
        logger.info('Server stopped successfully');
        resolve();
      });

      // Try graceful shutdown first
      this.serverProcess.kill('SIGTERM');
      
      // If that doesn't work, try SIGINT
      setTimeout(() => {
        if (this.serverProcess && !this.serverProcess.killed) {
          this.serverProcess.kill('SIGINT');
        }
      }, 2000);
    });
  }

  /**
   * Restart the development server
   */
  async restart(): Promise<void> {
    logger.info('Restarting E2E development server');
    await this.stop();
    await new Promise(resolve => setTimeout(resolve, 1000)); // Brief pause
    await this.start();
  }

  /**
   * Perform health check on the server
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(this.status.healthCheckUrl, {
        timeout: 5000,
        headers: {
          'User-Agent': 'E2E-Test-Health-Check'
        }
      });

      const isHealthy = response.ok;
      this.status.lastHealthCheck = new Date();
      
      if (isHealthy) {
        this.status.errorCount = 0;
      } else {
        this.status.errorCount++;
        logger.warn('Server health check failed', {
          status: response.status,
          statusText: response.statusText,
          url: this.status.healthCheckUrl
        });
      }

      return isHealthy;
    } catch (error) {
      this.status.errorCount++;
      this.status.lastHealthCheck = new Date();
      
      logger.debug('Health check failed', {
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        url: this.status.healthCheckUrl,
        errorCount: this.status.errorCount
      });
      
      return false;
    }
  }

  /**
   * Start periodic health checking
   */
  private startHealthChecking(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(async () => {
      const isHealthy = await this.healthCheck();
      
      // If server becomes unhealthy and error count is high, mark as down
      if (!isHealthy && this.status.errorCount >= 3) {
        logger.error('Server marked as unhealthy after multiple failed health checks', {
          errorCount: this.status.errorCount,
          port: this.config.port
        });
        
        this.status.isRunning = false;
        if (this.healthCheckInterval) {
          clearInterval(this.healthCheckInterval);
          this.healthCheckInterval = null;
        }
      }
    }, 10000); // Check every 10 seconds
  }

  /**
   * Check if a port is in use
   */
  private async isPortInUse(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const net = require('net');
      const tester = net.createServer()
        .once('error', () => resolve(true))
        .once('listening', () => {
          tester.once('close', () => resolve(false)).close();
        })
        .listen(port);
    });
  }

  /**
   * Wait for server to be ready with retry logic
   */
  async waitForReady(timeout: number = 30000): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      if (this.status.isRunning) {
        const isHealthy = await this.healthCheck();
        if (isHealthy) {
          return;
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    throw new Error(`Server not ready within ${timeout}ms`);
  }

  /**
   * Get current server status
   */
  getStatus(): ServerStatus {
    return { ...this.status };
  }

  /**
   * Get server URL
   */
  getUrl(path: string = ''): string {
    return `http://${this.config.host}:${this.config.port}${path}`;
  }

  /**
   * Cleanup - call this when tests are done
   */
  async cleanup(): Promise<void> {
    await this.stop();
  }
}

/**
 * Global server manager instance
 */
export const e2eServerManager = E2EServerManager.getInstance();

/**
 * Utility functions for E2E tests
 */

/**
 * Ensure server is running before E2E tests
 */
export async function ensureServerRunning(config?: Partial<ServerConfig>): Promise<E2EServerManager> {
  const manager = config ? new E2EServerManager(config) : E2EServerManager.getInstance();
  await manager.start();
  return manager;
}

/**
 * Setup server for test suite
 */
export function setupE2EServer(config?: Partial<ServerConfig>): void {
  let serverManager: E2EServerManager;

  beforeAll(async () => {
    serverManager = await ensureServerRunning(config);
    
    // Give server extra time to stabilize
    await new Promise(resolve => setTimeout(resolve, 2000));
  }, 45000); // 45 second timeout for server startup

  afterAll(async () => {
    if (serverManager) {
      await serverManager.cleanup();
    }
  }, 15000); // 15 second timeout for cleanup
}

/**
 * Wait for server to be responsive
 */
export async function waitForServerReady(
  url: string, 
  timeout: number = 30000,
  interval: number = 1000
): Promise<void> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    try {
      const response = await fetch(url, { timeout: 5000 });
      if (response.ok) {
        return;
      }
    } catch (error) {
      // Continue retrying
    }
    
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  
  throw new Error(`Server at ${url} not ready within ${timeout}ms`);
} 