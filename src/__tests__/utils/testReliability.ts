/**
 * Phase 3.1: Test Reliability Framework
 * Comprehensive utilities for improving test stability and reliability
 */

import { logger } from '@/lib/logger';
import { TimeoutTracker } from './testCleanup';

export interface TestReliabilityConfig {
  timeout: number;
  retries: number;
  cleanupTimeout: number;
  isolationLevel: 'strict' | 'moderate' | 'minimal';
  errorRecovery: boolean;
  resourceTracking: boolean;
}

export const DEFAULT_RELIABILITY_CONFIG: TestReliabilityConfig = {
  timeout: 30000,
  retries: 2,
  cleanupTimeout: 5000,
  isolationLevel: 'moderate',
  errorRecovery: true,
  resourceTracking: true
};

/**
 * Test Reliability Manager - Central coordination for test stability
 */
export class TestReliabilityManager {
  private static instance: TestReliabilityManager | null = null;
  private activeTests: Map<string, TestExecution> = new Map();
  private globalResources: Set<any> = new Set();
  private timeoutTracker: TimeoutTracker = new TimeoutTracker();
  private config: TestReliabilityConfig;

  constructor(config: Partial<TestReliabilityConfig> = {}) {
    this.config = { ...DEFAULT_RELIABILITY_CONFIG, ...config };
  }

  static getInstance(config?: Partial<TestReliabilityConfig>): TestReliabilityManager {
    if (!TestReliabilityManager.instance) {
      TestReliabilityManager.instance = new TestReliabilityManager(config);
    }
    return TestReliabilityManager.instance;
  }

  static reset(): void {
    if (TestReliabilityManager.instance) {
      TestReliabilityManager.instance.cleanup();
      TestReliabilityManager.instance = null;
    }
  }

  /**
   * Register a test execution for tracking
   */
  registerTest(testId: string, testName: string, config?: Partial<TestReliabilityConfig>): TestExecution {
    const testConfig = { ...this.config, ...config };
    const execution = new TestExecution(testId, testName, testConfig, this.timeoutTracker);
    this.activeTests.set(testId, execution);
    return execution;
  }

  /**
   * Unregister and cleanup a test execution
   */
  async unregisterTest(testId: string): Promise<void> {
    const execution = this.activeTests.get(testId);
    if (execution) {
      await execution.cleanup();
      this.activeTests.delete(testId);
    }
  }

  /**
   * Global resource registration for cleanup
   */
  registerGlobalResource(resource: any): void {
    this.globalResources.add(resource);
  }

  unregisterGlobalResource(resource: any): void {
    this.globalResources.delete(resource);
  }

  /**
   * Comprehensive cleanup of all active tests and resources
   */
  async cleanup(): Promise<void> {
    try {
      // Cleanup all active test executions
      const cleanupPromises = Array.from(this.activeTests.values()).map(execution => 
        execution.cleanup().catch(error => 
          logger.error('Error cleaning up test execution', error as Error)
        )
      );
      
      await Promise.allSettled(cleanupPromises);
      this.activeTests.clear();

      // Cleanup global resources
      for (const resource of this.globalResources) {
        try {
          if (resource && typeof resource.close === 'function') {
            await resource.close();
          } else if (resource && typeof resource.destroy === 'function') {
            await resource.destroy();
          } else if (resource && typeof resource.cleanup === 'function') {
            await resource.cleanup();
          }
        } catch (error) {
          logger.error('Error cleaning up global resource', error as Error);
        }
      }
      this.globalResources.clear();

      // Cleanup timeout tracker
      this.timeoutTracker.clearAll();

    } catch (error) {
      logger.error('Error during reliability manager cleanup', error as Error);
    }
  }

  /**
   * Get reliability metrics for monitoring
   */
  getMetrics(): ReliabilityMetrics {
    const activeTestCount = this.activeTests.size;
    const resourceCount = this.globalResources.size;
    
    const testMetrics = Array.from(this.activeTests.values()).map(execution => ({
      testId: execution.testId,
      testName: execution.testName,
      duration: execution.getDuration(),
      retryCount: execution.getRetryCount(),
      status: execution.getStatus()
    }));

    return {
      activeTests: activeTestCount,
      globalResources: resourceCount,
      tests: testMetrics,
      timestamp: new Date()
    };
  }
}

/**
 * Individual test execution tracking and management
 */
export class TestExecution {
  public readonly testId: string;
  public readonly testName: string;
  private config: TestReliabilityConfig;
  private timeoutTracker: TimeoutTracker;
  private startTime: number;
  private endTime?: number;
  private retryCount: number = 0;
  private status: 'pending' | 'running' | 'completed' | 'failed' | 'timeout' = 'pending';
  private resources: Set<any> = new Set();
  private mocks: Set<jest.SpyInstance> = new Set();
  private errors: Error[] = [];

  constructor(
    testId: string, 
    testName: string, 
    config: TestReliabilityConfig,
    timeoutTracker: TimeoutTracker
  ) {
    this.testId = testId;
    this.testName = testName;
    this.config = config;
    this.timeoutTracker = timeoutTracker;
    this.startTime = Date.now();
  }

  /**
   * Start test execution with timeout protection
   */
  start(): void {
    this.status = 'running';
    this.startTime = Date.now();

    // Set up timeout protection
    this.timeoutTracker.setTimeout(() => {
      if (this.status === 'running') {
        this.status = 'timeout';
        this.recordError(new Error(`Test timed out after ${this.config.timeout}ms`));
        logger.warn(`Test ${this.testName} timed out`, {
          testId: this.testId,
          duration: this.getDuration(),
          timeout: this.config.timeout
        });
      }
    }, this.config.timeout);
  }

  /**
   * Complete test execution
   */
  complete(success: boolean = true): void {
    if (this.status === 'running') {
      this.status = success ? 'completed' : 'failed';
      this.endTime = Date.now();
    }
  }

  /**
   * Register a resource for cleanup
   */
  registerResource(resource: any): void {
    this.resources.add(resource);
  }

  /**
   * Register a mock for cleanup
   */
  registerMock(mock: jest.SpyInstance): void {
    this.mocks.add(mock);
  }

  /**
   * Record an error for tracking
   */
  recordError(error: Error): void {
    this.errors.push(error);
  }

  /**
   * Increment retry count
   */
  incrementRetry(): void {
    this.retryCount++;
  }

  /**
   * Get current execution duration
   */
  getDuration(): number {
    const endTime = this.endTime || Date.now();
    return endTime - this.startTime;
  }

  /**
   * Get retry count
   */
  getRetryCount(): number {
    return this.retryCount;
  }

  /**
   * Get current status
   */
  getStatus(): string {
    return this.status;
  }

  /**
   * Get recorded errors
   */
  getErrors(): Error[] {
    return [...this.errors];
  }

  /**
   * Cleanup all resources and mocks
   */
  async cleanup(): Promise<void> {
    try {
      // Cleanup mocks
      for (const mock of this.mocks) {
        try {
          mock.mockRestore();
        } catch (error) {
          logger.debug('Error restoring mock', { error: error instanceof Error ? error.message : 'Unknown error' });
        }
      }
      this.mocks.clear();

      // Cleanup resources
      const cleanupPromises = Array.from(this.resources).map(async (resource) => {
        try {
          if (resource && typeof resource.close === 'function') {
            await resource.close();
          } else if (resource && typeof resource.destroy === 'function') {
            await resource.destroy();
          } else if (resource && typeof resource.cleanup === 'function') {
            await resource.cleanup();
          }
        } catch (error) {
          logger.debug('Error cleaning up resource', { error: error instanceof Error ? error.message : 'Unknown error' });
        }
      });

      await Promise.allSettled(cleanupPromises);
      this.resources.clear();

    } catch (error) {
      logger.error('Error during test execution cleanup', error as Error);
    }
  }
}

/**
 * Enhanced test wrapper with reliability features
 */
export async function withReliability<T>(
  testName: string,
  testFn: (execution: TestExecution) => Promise<T>,
  config?: Partial<TestReliabilityConfig>
): Promise<T> {
  const manager = TestReliabilityManager.getInstance();
  const testId = `${testName}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const execution = manager.registerTest(testId, testName, config);
  
  try {
    execution.start();
    const result = await testFn(execution);
    execution.complete(true);
    return result;
  } catch (error) {
    execution.recordError(error as Error);
    execution.complete(false);
    throw error;
  } finally {
    await manager.unregisterTest(testId);
  }
}

/**
 * Retry wrapper with exponential backoff
 */
export async function withRetry<T>(
  testFn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 1000,
  backoffFactor: number = 2
): Promise<T> {
  let lastError: Error;
  let delay = initialDelay;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await testFn();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt <= maxRetries) {
        logger.debug(`Test attempt ${attempt} failed, retrying in ${delay}ms`, {
          error: lastError.message,
          attempt,
          maxRetries
        });
        
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= backoffFactor;
      }
    }
  }

  throw lastError!;
}

/**
 * Test isolation utilities
 */
export class TestIsolation {
  private originalEnv: Record<string, string | undefined> = {};
  private originalConsole: Console;
  private mockRestore: (() => void)[] = [];

  constructor() {
    this.originalConsole = { ...console };
  }

  /**
   * Isolate environment variables
   */
  isolateEnvironment(envVars: Record<string, string | undefined>): void {
    // Store original values
    Object.keys(envVars).forEach(key => {
      this.originalEnv[key] = process.env[key];
      if (envVars[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = envVars[key];
      }
    });
  }

  /**
   * Isolate console output
   */
  isolateConsole(silent: boolean = true): void {
    if (silent) {
      console.log = jest.fn();
      console.info = jest.fn();
      console.debug = jest.fn();
      console.warn = jest.fn();
      // Keep error for debugging
    }
  }

  /**
   * Add mock to restoration list
   */
  addMockRestore(restoreFn: () => void): void {
    this.mockRestore.push(restoreFn);
  }

  /**
   * Restore all isolation changes
   */
  restore(): void {
    // Restore environment
    Object.keys(this.originalEnv).forEach(key => {
      if (this.originalEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = this.originalEnv[key];
      }
    });

    // Restore console
    Object.assign(console, this.originalConsole);

    // Restore mocks
    this.mockRestore.forEach(restore => {
      try {
        restore();
      } catch (error) {
        logger.debug('Error restoring mock', { error: error instanceof Error ? error.message : 'Unknown error' });
      }
    });
    this.mockRestore = [];
  }
}

/**
 * Types for reliability metrics
 */
export interface ReliabilityMetrics {
  activeTests: number;
  globalResources: number;
  tests: Array<{
    testId: string;
    testName: string;
    duration: number;
    retryCount: number;
    status: string;
  }>;
  timestamp: Date;
}

/**
 * Global setup/teardown hooks
 */
export function setupReliabilityHooks(): void {
  beforeEach(() => {
    // Clear all mocks to prevent cross-test contamination
    jest.clearAllMocks();
    
    // Reset any global state
    TestReliabilityManager.reset();
  });

  afterEach(async () => {
    // Cleanup any remaining resources
    const manager = TestReliabilityManager.getInstance();
    await manager.cleanup();
  });

  afterAll(async () => {
    // Final cleanup
    TestReliabilityManager.reset();
  });
}

/**
 * Utility to wait for async operations with timeout
 */
export async function waitForAsync<T>(
  operation: () => Promise<T>,
  timeout: number = 5000,
  pollInterval: number = 100
): Promise<T> {
  const startTime = Date.now();
  let lastError: Error;

  while (Date.now() - startTime < timeout) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
  }

  throw lastError! || new Error(`Operation timed out after ${timeout}ms`);
} 