/**
 * Phase 3.1: Timeout Management System
 * Advanced timeout handling and optimization for test reliability
 */

import { logger } from '@/lib/logger';

export interface TimeoutConfig {
  unit: number;
  integration: number;
  e2e: number;
  performance: number;
  critical: number;
}

export interface AdaptiveTimeoutConfig {
  baseTimeout: number;
  maxTimeout: number;
  scaleFactor: number;
  retryMultiplier: number;
  environmentMultiplier: Record<string, number>;
}

export const DEFAULT_TIMEOUTS: TimeoutConfig = {
  unit: 15000,        // 15 seconds for unit tests
  integration: 30000, // 30 seconds for integration tests
  e2e: 60000,         // 60 seconds for E2E tests
  performance: 120000, // 2 minutes for performance tests
  critical: 180000     // 3 minutes for critical operations
};

export const ADAPTIVE_CONFIG: AdaptiveTimeoutConfig = {
  baseTimeout: 15000,
  maxTimeout: 300000, // 5 minutes max
  scaleFactor: 1.5,
  retryMultiplier: 2.0,
  environmentMultiplier: {
    'development': 1.0,
    'test': 1.0,
    'ci': 2.0,
    'docker': 1.5,
    'github-actions': 2.5,
    'slow-machine': 3.0
  }
};

/**
 * Adaptive Timeout Manager
 * Intelligently adjusts timeouts based on context and performance
 */
export class AdaptiveTimeoutManager {
  private static instance: AdaptiveTimeoutManager | null = null;
  private performanceHistory: Map<string, number[]> = new Map();
  private environmentFactor: number = 1.0;
  private config: AdaptiveTimeoutConfig;

  constructor(config: Partial<AdaptiveTimeoutConfig> = {}) {
    this.config = { ...ADAPTIVE_CONFIG, ...config };
    this.detectEnvironment();
  }

  static getInstance(): AdaptiveTimeoutManager {
    if (!AdaptiveTimeoutManager.instance) {
      AdaptiveTimeoutManager.instance = new AdaptiveTimeoutManager();
    }
    return AdaptiveTimeoutManager.instance;
  }

  static reset(): void {
    AdaptiveTimeoutManager.instance = null;
  }

  /**
   * Detect the current environment and set appropriate multiplier
   */
  private detectEnvironment(): void {
    // Check environment indicators
    if (process.env.CI) {
      if (process.env.GITHUB_ACTIONS) {
        this.environmentFactor = this.config.environmentMultiplier['github-actions'] || 2.5;
      } else {
        this.environmentFactor = this.config.environmentMultiplier['ci'] || 2.0;
      }
    } else if (process.env.DOCKER) {
      this.environmentFactor = this.config.environmentMultiplier['docker'] || 1.5;
    } else if (process.env.NODE_ENV === 'development') {
      this.environmentFactor = this.config.environmentMultiplier['development'] || 1.0;
    } else {
      this.environmentFactor = this.config.environmentMultiplier['test'] || 1.0;
    }

    // Check for slow machine indicators
    if (process.env.SLOW_MACHINE || this.isSlowMachine()) {
      this.environmentFactor = Math.max(
        this.environmentFactor, 
        this.config.environmentMultiplier['slow-machine'] || 3.0
      );
    }

    logger.debug('Adaptive timeout environment detected', {
      environmentFactor: this.environmentFactor,
      ci: !!process.env.CI,
      docker: !!process.env.DOCKER,
      githubActions: !!process.env.GITHUB_ACTIONS,
      nodeEnv: process.env.NODE_ENV
    });
  }

  /**
   * Simple heuristic to detect slow machines
   */
  private isSlowMachine(): boolean {
    // Basic performance check
    const start = Date.now();
    for (let i = 0; i < 1000000; i++) {
      Math.random();
    }
    const duration = Date.now() - start;
    
    // If this simple operation takes too long, consider it a slow machine
    return duration > 100; // milliseconds
  }

  /**
   * Get adaptive timeout for a specific operation
   */
  getTimeout(
    operationName: string, 
    baseTimeout: number = this.config.baseTimeout,
    context: {
      retryCount?: number;
      priority?: 'low' | 'normal' | 'high' | 'critical';
      isPerformanceTest?: boolean;
    } = {}
  ): number {
    const { retryCount = 0, priority = 'normal', isPerformanceTest = false } = context;

    // Start with base timeout
    let timeout = baseTimeout;

    // Apply environment factor
    timeout *= this.environmentFactor;

    // Apply retry multiplier
    if (retryCount > 0) {
      timeout *= Math.pow(this.config.retryMultiplier, retryCount);
    }

         // Apply priority factor
     const priorityMultipliers: Record<string, number> = {
       'low': 0.8,
       'normal': 1.0,
       'high': 1.5,
       'critical': 2.0
     };
     timeout *= priorityMultipliers[priority] || 1.0;

    // Apply performance test factor
    if (isPerformanceTest) {
      timeout *= 2.0;
    }

    // Use historical data to adjust
    const historicalAverage = this.getHistoricalAverage(operationName);
    if (historicalAverage > 0) {
      // Use 95th percentile approach: historical average + 50%
      const adaptiveTimeout = historicalAverage * 1.5;
      timeout = Math.max(timeout, adaptiveTimeout);
    }

    // Ensure timeout is within bounds
    timeout = Math.min(timeout, this.config.maxTimeout);
    timeout = Math.max(timeout, 1000); // Minimum 1 second

    logger.debug(`Adaptive timeout calculated for ${operationName}`, {
      baseTimeout,
      environmentFactor: this.environmentFactor,
      retryCount,
      priority,
      isPerformanceTest,
      historicalAverage,
      finalTimeout: timeout
    });

    return Math.round(timeout);
  }

  /**
   * Record performance data for future adaptation
   */
  recordPerformance(operationName: string, duration: number): void {
    if (!this.performanceHistory.has(operationName)) {
      this.performanceHistory.set(operationName, []);
    }

    const history = this.performanceHistory.get(operationName)!;
    history.push(duration);

    // Keep only last 50 measurements
    if (history.length > 50) {
      history.shift();
    }
  }

  /**
   * Get historical average for an operation
   */
  private getHistoricalAverage(operationName: string): number {
    const history = this.performanceHistory.get(operationName);
    if (!history || history.length === 0) {
      return 0;
    }

    return history.reduce((sum, duration) => sum + duration, 0) / history.length;
  }

  /**
   * Get performance percentile
   */
  getPerformancePercentile(operationName: string, percentile: number = 95): number {
    const history = this.performanceHistory.get(operationName);
    if (!history || history.length === 0) {
      return 0;
    }

    const sorted = [...history].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)] || 0;
  }

  /**
   * Clear performance history
   */
  clearHistory(operationName?: string): void {
    if (operationName) {
      this.performanceHistory.delete(operationName);
    } else {
      this.performanceHistory.clear();
    }
  }

  /**
   * Get performance metrics
   */
  getMetrics(): TimeoutMetrics {
    const operations = Array.from(this.performanceHistory.keys());
    const metrics: TimeoutMetrics = {
      environmentFactor: this.environmentFactor,
      trackedOperations: operations.length,
      operations: {}
    };

    operations.forEach(operation => {
      const history = this.performanceHistory.get(operation)!;
      metrics.operations[operation] = {
        samples: history.length,
        average: this.getHistoricalAverage(operation),
        p95: this.getPerformancePercentile(operation, 95),
        p99: this.getPerformancePercentile(operation, 99),
        min: Math.min(...history),
        max: Math.max(...history)
      };
    });

    return metrics;
  }
}

/**
 * Test-specific timeout utilities
 */
export class TestTimeoutManager {
  private timeouts: Map<string, NodeJS.Timeout> = new Map();
  private adaptiveManager: AdaptiveTimeoutManager;

  constructor() {
    this.adaptiveManager = AdaptiveTimeoutManager.getInstance();
  }

  /**
   * Create a timeout with automatic cleanup
   */
  setTimeout(
    testId: string,
    callback: () => void,
    timeout: number,
    operationName: string = 'generic'
  ): NodeJS.Timeout {
    // Clear existing timeout for this test
    this.clearTimeout(testId);

    // Get adaptive timeout
    const adaptiveTimeout = this.adaptiveManager.getTimeout(operationName, timeout);

    // Create timeout
    const timeoutHandle = setTimeout(() => {
      callback();
      this.timeouts.delete(testId);
    }, adaptiveTimeout);

    this.timeouts.set(testId, timeoutHandle);
    return timeoutHandle;
  }

  /**
   * Clear a specific timeout
   */
  clearTimeout(testId: string): void {
    const timeout = this.timeouts.get(testId);
    if (timeout) {
      clearTimeout(timeout);
      this.timeouts.delete(testId);
    }
  }

  /**
   * Clear all timeouts
   */
  clearAllTimeouts(): void {
    for (const [testId, timeout] of this.timeouts) {
      clearTimeout(timeout);
    }
    this.timeouts.clear();
  }

  /**
   * Get active timeout count
   */
  getActiveTimeoutCount(): number {
    return this.timeouts.size;
  }

  /**
   * Create a timeout promise that rejects after specified time
   */
  createTimeoutPromise<T>(
    timeout: number,
    operationName: string = 'promise',
    errorMessage?: string
  ): Promise<T> {
    const adaptiveTimeout = this.adaptiveManager.getTimeout(operationName, timeout);
    
    return new Promise<T>((_, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(
          errorMessage || `Operation timed out after ${adaptiveTimeout}ms`
        ));
      }, adaptiveTimeout);

      // Store for cleanup
      const testId = `promise-${Date.now()}-${Math.random()}`;
      this.timeouts.set(testId, timeoutId);
    });
  }

  /**
   * Race a promise against a timeout
   */
  async withTimeout<T>(
    promise: Promise<T>,
    timeout: number,
    operationName: string = 'operation',
    errorMessage?: string
  ): Promise<T> {
    const timeoutPromise = this.createTimeoutPromise<T>(
      timeout, 
      operationName, 
      errorMessage
    );

    const startTime = Date.now();
    
    try {
      const result = await Promise.race([promise, timeoutPromise]);
      
      // Record performance for future adaptation
      const duration = Date.now() - startTime;
      this.adaptiveManager.recordPerformance(operationName, duration);
      
      return result;
    } catch (error) {
      // Record failed operation time as well
      const duration = Date.now() - startTime;
      this.adaptiveManager.recordPerformance(`${operationName}_failed`, duration);
      throw error;
    }
  }

  /**
   * Cleanup - call this in test teardown
   */
  cleanup(): void {
    this.clearAllTimeouts();
  }
}

/**
 * Global timeout configuration for Jest
 */
export function configureJestTimeouts(): void {
  const adaptiveManager = AdaptiveTimeoutManager.getInstance();

  // Set Jest timeout based on environment
  const baseTimeout = 30000; // 30 seconds base
  const jestTimeout = adaptiveManager.getTimeout('jest-global', baseTimeout, {
    priority: 'normal'
  });

  jest.setTimeout(jestTimeout);

  logger.info('Jest timeouts configured', {
    jestTimeout,
    environment: process.env.NODE_ENV,
    ci: !!process.env.CI
  });
}

/**
 * Test suite timeout configurations
 */
export const SUITE_TIMEOUTS = {
  unit: () => AdaptiveTimeoutManager.getInstance().getTimeout('unit-test', DEFAULT_TIMEOUTS.unit),
  integration: () => AdaptiveTimeoutManager.getInstance().getTimeout('integration-test', DEFAULT_TIMEOUTS.integration),
  e2e: () => AdaptiveTimeoutManager.getInstance().getTimeout('e2e-test', DEFAULT_TIMEOUTS.e2e),
  performance: () => AdaptiveTimeoutManager.getInstance().getTimeout('performance-test', DEFAULT_TIMEOUTS.performance, {
    isPerformanceTest: true
  }),
  critical: () => AdaptiveTimeoutManager.getInstance().getTimeout('critical-operation', DEFAULT_TIMEOUTS.critical, {
    priority: 'critical'
  })
};

/**
 * Types for timeout metrics
 */
export interface TimeoutMetrics {
  environmentFactor: number;
  trackedOperations: number;
  operations: Record<string, {
    samples: number;
    average: number;
    p95: number;
    p99: number;
    min: number;
    max: number;
  }>;
}

/**
 * Utility function to wrap test functions with adaptive timeouts
 */
export function withAdaptiveTimeout<T extends (...args: any[]) => Promise<any>>(
  testFn: T,
  operationName: string,
  baseTimeout?: number
): T {
  return (async (...args: any[]) => {
    const manager = new TestTimeoutManager();
    const timeout = baseTimeout || DEFAULT_TIMEOUTS.unit;
    
    try {
      return await manager.withTimeout(
        testFn(...args),
        timeout,
        operationName,
        `Test ${operationName} timed out`
      );
    } finally {
      manager.cleanup();
    }
  }) as T;
}

/**
 * Export singleton instances for global use
 */
export const adaptiveTimeoutManager = AdaptiveTimeoutManager.getInstance();
export const testTimeoutManager = new TestTimeoutManager(); 