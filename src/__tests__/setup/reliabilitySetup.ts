/**
 * Phase 3.1: Comprehensive Test Reliability Setup
 * Integrates all reliability improvements into a unified test setup system
 */

import { setupReliabilityHooks, TestReliabilityManager, TestIsolation } from '../utils/testReliability';
import { configureJestTimeouts, TestTimeoutManager, AdaptiveTimeoutManager } from '../utils/timeoutManager';
import { testErrorRecovery, TestErrorRecovery } from '../utils/errorRecovery';
import { setupTestCleanup, teardownTestCleanup } from '../utils/testCleanup';
import { logger } from '@/lib/logger';

/**
 * Global test reliability configuration
 */
export interface GlobalTestConfig {
  enableReliabilityFeatures: boolean;
  enableTimeoutAdaptation: boolean;
  enableErrorRecovery: boolean;
  enableTestIsolation: boolean;
  enableResourceTracking: boolean;
  maxRetries: number;
  defaultTimeout: number;
  cleanupTimeout: number;
  environment: 'unit' | 'integration' | 'e2e' | 'performance';
}

export const DEFAULT_GLOBAL_CONFIG: GlobalTestConfig = {
  enableReliabilityFeatures: true,
  enableTimeoutAdaptation: true,
  enableErrorRecovery: true,
  enableTestIsolation: true,
  enableResourceTracking: true,
  maxRetries: 3,
  defaultTimeout: 30000,
  cleanupTimeout: 5000,
  environment: 'unit'
};

/**
 * Comprehensive Test Reliability Coordinator
 * Central orchestrator for all reliability features
 */
export class TestReliabilityCoordinator {
  private static instance: TestReliabilityCoordinator | null = null;
  private config: GlobalTestConfig;
  private reliabilityManager: TestReliabilityManager;
  private timeoutManager: TestTimeoutManager;
  private errorRecovery: TestErrorRecovery;
  private isolation: TestIsolation;
  private isSetup: boolean = false;

  constructor(config: Partial<GlobalTestConfig> = {}) {
    this.config = { ...DEFAULT_GLOBAL_CONFIG, ...config };
    this.reliabilityManager = TestReliabilityManager.getInstance();
    this.timeoutManager = new TestTimeoutManager();
    this.errorRecovery = testErrorRecovery;
    this.isolation = new TestIsolation();
  }

  static getInstance(config?: Partial<GlobalTestConfig>): TestReliabilityCoordinator {
    if (!TestReliabilityCoordinator.instance) {
      TestReliabilityCoordinator.instance = new TestReliabilityCoordinator(config);
    }
    return TestReliabilityCoordinator.instance;
  }

  static reset(): void {
    if (TestReliabilityCoordinator.instance) {
      TestReliabilityCoordinator.instance.cleanup();
      TestReliabilityCoordinator.instance = null;
    }
  }

  /**
   * Setup all reliability features
   */
  async setup(): Promise<void> {
    if (this.isSetup) {
      return;
    }

    logger.info('Setting up test reliability features', {
      config: this.config,
      environment: process.env.NODE_ENV
    });

    try {
      // Configure Jest timeouts if enabled
      if (this.config.enableTimeoutAdaptation) {
        configureJestTimeouts();
      }

      // Setup global hooks if enabled
      if (this.config.enableReliabilityFeatures) {
        this.setupGlobalHooks();
      }

      // Setup test isolation if enabled
      if (this.config.enableTestIsolation) {
        this.setupTestIsolation();
      }

      this.isSetup = true;
      
      logger.info('Test reliability setup completed successfully');
    } catch (error) {
      logger.error('Failed to setup test reliability features', error as Error);
      throw error;
    }
  }

  /**
   * Setup global Jest hooks
   */
  private setupGlobalHooks(): void {
    // Global setup for all tests
    beforeAll(async () => {
      await this.globalSetup();
    });

    // Global teardown for all tests
    afterAll(async () => {
      await this.globalTeardown();
    });

    // Test-specific setup
    beforeEach(async () => {
      await this.testSetup();
    });

    // Test-specific teardown
    afterEach(async () => {
      await this.testTeardown();
    });
  }

  /**
   * Setup test isolation
   */
  private setupTestIsolation(): void {
    beforeEach(() => {
      // Isolate console output for cleaner test runs
      this.isolation.isolateConsole(process.env.VERBOSE_TESTS !== 'true');
      
      // Isolate environment variables for each test
      this.isolation.isolateEnvironment({
        NODE_ENV: 'test',
        TESTING: 'true'
      });
    });

    afterEach(() => {
      // Restore isolation changes
      this.isolation.restore();
    });
  }

  /**
   * Global setup performed once before all tests
   */
  private async globalSetup(): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Initialize global resources
      if (this.config.enableResourceTracking) {
        await this.initializeGlobalResources();
      }

      // Reset all managers
      TestReliabilityManager.reset();
      AdaptiveTimeoutManager.reset();
      
      logger.info('Global test setup completed', {
        duration: Date.now() - startTime,
        environment: this.config.environment
      });
    } catch (error) {
      logger.error('Global test setup failed', error as Error);
      throw error;
    }
  }

  /**
   * Global teardown performed once after all tests
   */
  private async globalTeardown(): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Cleanup global resources
      await this.reliabilityManager.cleanup();
      
      // Generate test run summary
      await this.generateTestSummary();
      
      logger.info('Global test teardown completed', {
        duration: Date.now() - startTime
      });
    } catch (error) {
      logger.error('Global test teardown failed', error as Error);
    }
  }

  /**
   * Setup performed before each test
   */
  private async testSetup(): Promise<void> {
    // Clear all mocks to prevent cross-test contamination
    jest.clearAllMocks();
    jest.clearAllTimers();
    
    // Setup test cleanup
    if (this.config.enableResourceTracking) {
      setupTestCleanup();
    }

    // Reset timeout manager for each test
    this.timeoutManager.clearAllTimeouts();
  }

  /**
   * Teardown performed after each test
   */
  private async testTeardown(): Promise<void> {
    try {
      // Cleanup test resources
      if (this.config.enableResourceTracking) {
        await teardownTestCleanup();
      }

      // Cleanup timeouts
      this.timeoutManager.cleanup();

    } catch (error) {
      logger.debug('Test teardown encountered issues', { error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  /**
   * Initialize global resources
   */
  private async initializeGlobalResources(): Promise<void> {
    // Register global cleanup handlers
    process.on('exit', () => {
      this.cleanup();
    });

    process.on('SIGINT', () => {
      this.cleanup();
      process.exit(0);
    });
  }

  /**
   * Generate test run summary with reliability metrics
   */
  private async generateTestSummary(): Promise<void> {
    const metrics = this.reliabilityManager.getMetrics();
    const errorMetrics = this.errorRecovery.getErrorMetrics();
    const timeoutMetrics = AdaptiveTimeoutManager.getInstance().getMetrics();

    const summary = {
      testReliability: metrics,
      errorRecovery: errorMetrics,
      timeoutAdaptation: timeoutMetrics,
      timestamp: new Date(),
      environment: this.config.environment
    };

    logger.info('Test run reliability summary', summary);

    // In development, you might want to write this to a file
    if (process.env.NODE_ENV === 'development' && process.env.WRITE_TEST_SUMMARY) {
      const fs = require('fs');
      const path = require('path');
      
      const summaryPath = path.join(process.cwd(), 'test-reports', 'reliability-summary.json');
      fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
    }
  }

  /**
   * Execute a test with full reliability features
   */
  async executeTest<T>(
    testFn: () => Promise<T>,
    testName: string,
    options: {
      timeout?: number;
      retries?: number;
      isolation?: boolean;
      errorRecovery?: boolean;
    } = {}
  ): Promise<T> {
    const {
      timeout = this.config.defaultTimeout,
      retries = this.config.maxRetries,
      isolation = this.config.enableTestIsolation,
      errorRecovery = this.config.enableErrorRecovery
    } = options;

    // Create test isolation if enabled
    const testIsolation = isolation ? new TestIsolation() : null;
    
    try {
      if (testIsolation) {
        testIsolation.isolateConsole();
      }

      // Execute with timeout management
      const timeoutResult = await this.timeoutManager.withTimeout(
        errorRecovery 
          ? this.errorRecovery.executeWithRecovery(testFn, {
              testName,
              maxAttempts: retries
            })
          : testFn(),
        timeout,
        testName
      );

      return timeoutResult;
      
    } finally {
      if (testIsolation) {
        testIsolation.restore();
      }
    }
  }

  /**
   * Cleanup all resources
   */
  async cleanup(): Promise<void> {
    try {
      await this.reliabilityManager.cleanup();
      this.timeoutManager.cleanup();
      this.isolation.restore();
      this.isSetup = false;
    } catch (error) {
      logger.error('Cleanup failed', error as Error);
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): GlobalTestConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<GlobalTestConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}

/**
 * Environment-specific configurations
 */
export const ENVIRONMENT_CONFIGS: Record<string, Partial<GlobalTestConfig>> = {
  unit: {
    environment: 'unit',
    defaultTimeout: 15000,
    maxRetries: 2,
    enableErrorRecovery: true,
    enableTestIsolation: true
  },
  integration: {
    environment: 'integration',
    defaultTimeout: 30000,
    maxRetries: 3,
    enableErrorRecovery: true,
    enableTestIsolation: true
  },
  e2e: {
    environment: 'e2e',
    defaultTimeout: 60000,
    maxRetries: 2,
    enableErrorRecovery: true,
    enableTestIsolation: false // E2E tests may need global state
  },
  performance: {
    environment: 'performance',
    defaultTimeout: 120000,
    maxRetries: 1,
    enableErrorRecovery: false, // Performance tests should fail fast
    enableTestIsolation: false
  }
};

/**
 * Initialize reliability features for specific environment
 */
export async function initializeTestReliability(
  environment: keyof typeof ENVIRONMENT_CONFIGS = 'unit'
): Promise<TestReliabilityCoordinator> {
  const config = ENVIRONMENT_CONFIGS[environment] || ENVIRONMENT_CONFIGS.unit;
  const coordinator = TestReliabilityCoordinator.getInstance(config);
  await coordinator.setup();
  return coordinator;
}

/**
 * Utility functions for common test patterns
 */

/**
 * Wrapper for reliable test execution
 */
export async function runReliableTest<T>(
  testFn: () => Promise<T>,
  testName: string,
  options: {
    timeout?: number;
    retries?: number;
    errorRecovery?: boolean;
  } = {}
): Promise<T> {
  const coordinator = TestReliabilityCoordinator.getInstance();
  
  // Filter out undefined values to satisfy exactOptionalPropertyTypes
  const filteredOptions: {
    timeout?: number;
    retries?: number;
    errorRecovery?: boolean;
  } = {};
  
  if (options.timeout !== undefined) filteredOptions.timeout = options.timeout;
  if (options.retries !== undefined) filteredOptions.retries = options.retries;
  if (options.errorRecovery !== undefined) filteredOptions.errorRecovery = options.errorRecovery;
  
  return coordinator.executeTest(testFn, testName, filteredOptions);
}

/**
 * Wrapper for test suite setup
 */
export function setupReliableTestSuite(
  suiteName: string,
  environment: keyof typeof ENVIRONMENT_CONFIGS = 'unit'
): void {
  describe(`${suiteName} (Reliability Enhanced)`, () => {
    let coordinator: TestReliabilityCoordinator;

    beforeAll(async () => {
      coordinator = await initializeTestReliability(environment);
    });

    afterAll(async () => {
      if (coordinator) {
        await coordinator.cleanup();
      }
    });

    // Additional suite-specific setup can be added here
  });
}

/**
 * Enhanced test wrapper with full reliability features
 */
export function reliableTest(
  testName: string,
  testFn: () => Promise<void>,
  options: {
    timeout?: number;
    retries?: number;
    skipReliability?: boolean;
  } = {}
): void {
  const { timeout, retries, skipReliability = false } = options;

  if (skipReliability) {
    it(testName, testFn, timeout);
    return;
  }

  it(testName, async () => {
    const testOptions: { timeout?: number; retries?: number } = {};
    if (timeout !== undefined) testOptions.timeout = timeout;
    if (retries !== undefined) testOptions.retries = retries;
    await runReliableTest(testFn, testName, testOptions);
  }, timeout);
}

/**
 * Global setup function to be called in Jest setup files
 */
export async function setupGlobalTestReliability(): Promise<void> {
  // Determine environment from test command or environment variable
  const environment = process.env.TEST_ENVIRONMENT as keyof typeof ENVIRONMENT_CONFIGS || 'unit';
  
  await initializeTestReliability(environment);
  
  logger.info('Global test reliability initialized', {
    environment,
    timestamp: new Date()
  });
}

// Export singleton instance for global access
export const testReliabilityCoordinator = TestReliabilityCoordinator.getInstance(); 