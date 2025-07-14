/**
 * Phase 3.2: E2E Recovery Integration
 * Unified integration of all E2E recovery components with Phase 3.1 reliability framework
 */

import { logger } from '@/lib/logger';
import { TestReliabilityCoordinator } from './reliabilitySetup';
import { E2EServerManager, setupE2EServer } from '../utils/e2eServerManager';
import { PlaywrightRecoveryManager, setupPlaywrightSuite } from '../utils/playwrightRecovery';
import { E2EDataExtractor, extractTestData, getReliableTestData } from '../utils/e2eDataExtractor';
import { E2ETestDataManager, createTestSession, getValidatedTestData } from '../utils/e2eTestDataManager';
import { E2EInfrastructureResilience, setupInfrastructureMonitoring } from '../utils/e2eInfrastructureResilience';

export interface E2ETestConfig {
  // Server configuration
  serverPort: number;
  serverHost: string;
  serverStartupTimeout: number;
  
  // Browser configuration
  browser: 'chromium' | 'firefox' | 'webkit';
  headless: boolean;
  viewport: { width: number; height: number };
  
  // Test data configuration
  scenario: string;
  useReliableData: boolean;
  validateData: boolean;
  
  // Recovery configuration
  maxRetries: number;
  retryDelay: number;
  enableInfrastructureMonitoring: boolean;
  enableAutoRecovery: boolean;
  
  // Timeout configuration
  testTimeout: number;
  navigationTimeout: number;
  actionTimeout: number;
  
  // Reliability integration
  useReliabilityFramework: boolean;
  isolationLevel: 'minimal' | 'standard' | 'complete';
}

export interface E2ETestSession {
  id: string;
  config: E2ETestConfig;
  serverManager: E2EServerManager;
  playwrightManager: PlaywrightRecoveryManager;
  dataManager: E2ETestDataManager;
  infrastructureManager: E2EInfrastructureResilience;
  reliabilityCoordinator?: TestReliabilityCoordinator;
  testData: any;
  metadata: {
    startTime: Date;
    scenario: string;
    browser: string;
    environment: string;
  };
}

export const DEFAULT_E2E_CONFIG: E2ETestConfig = {
  // Server
  serverPort: 3000,
  serverHost: 'localhost',
  serverStartupTimeout: 30000,
  
  // Browser
  browser: 'chromium',
  headless: true,
  viewport: { width: 1280, height: 720 },
  
  // Test data
  scenario: 'testcorp-basic',
  useReliableData: true,
  validateData: true,
  
  // Recovery
  maxRetries: 3,
  retryDelay: 2000,
  enableInfrastructureMonitoring: true,
  enableAutoRecovery: true,
  
  // Timeouts
  testTimeout: 60000,
  navigationTimeout: 30000,
  actionTimeout: 10000,
  
  // Reliability
  useReliabilityFramework: true,
  isolationLevel: 'standard'
};

/**
 * E2E Test Recovery Coordinator
 * Central coordinator for all E2E recovery and reliability features
 */
export class E2ERecoveryCoordinator {
  private sessions: Map<string, E2ETestSession> = new Map();
  private globalConfig: E2ETestConfig;

  constructor(config: Partial<E2ETestConfig> = {}) {
    this.globalConfig = { ...DEFAULT_E2E_CONFIG, ...config };
  }

  /**
   * Create a comprehensive E2E test session
   */
  async createE2ESession(
    sessionId: string,
    config: Partial<E2ETestConfig> = {}
  ): Promise<E2ETestSession> {
    const sessionConfig = { ...this.globalConfig, ...config };
    
    logger.info('Creating comprehensive E2E test session', {
      sessionId,
      scenario: sessionConfig.scenario,
      browser: sessionConfig.browser,
      serverPort: sessionConfig.serverPort
    });

    try {
      // Initialize managers
      const serverManager = new E2EServerManager({
        port: sessionConfig.serverPort,
        host: sessionConfig.serverHost,
        startupTimeout: sessionConfig.serverStartupTimeout
      });

      const playwrightManager = new PlaywrightRecoveryManager({
        browser: sessionConfig.browser,
        headless: sessionConfig.headless,
        viewport: sessionConfig.viewport,
        timeout: sessionConfig.testTimeout,
        navigationTimeout: sessionConfig.navigationTimeout,
        actionTimeout: sessionConfig.actionTimeout,
        retries: sessionConfig.maxRetries
      });

      const dataManager = new E2ETestDataManager();
      const infrastructureManager = new E2EInfrastructureResilience({
        maxRetries: sessionConfig.maxRetries,
        retryDelay: sessionConfig.retryDelay
      });

      // Initialize reliability coordinator if enabled
      let reliabilityCoordinator: TestReliabilityCoordinator | undefined;
      if (sessionConfig.useReliabilityFramework) {
        reliabilityCoordinator = new TestReliabilityCoordinator();
        await reliabilityCoordinator.initializeTest(`e2e-${sessionId}`, 'e2e', {
          timeout: sessionConfig.testTimeout,
          retries: sessionConfig.maxRetries,
          isolation: sessionConfig.isolationLevel
        });
      }

      // Get test data
      const testSession = createTestSession(sessionConfig.scenario, {
        browser: sessionConfig.browser,
        environment: process.env.NODE_ENV || 'test',
        testSuite: 'e2e'
      });

      if (sessionConfig.validateData) {
        // Additional validation using data extractor
        const extractor = new E2EDataExtractor();
        const validation = extractor.validateExtractedData(testSession.data);
        
        if (!validation.isValid) {
          throw new Error(`Test data validation failed: ${validation.errors.join(', ')}`);
        }
      }

      // Start infrastructure components
      await serverManager.start();
      
      if (sessionConfig.enableInfrastructureMonitoring) {
        infrastructureManager.startMonitoring(serverManager, playwrightManager);
        
        // Wait for infrastructure to be healthy
        const isHealthy = await infrastructureManager.waitForHealthy(10000);
        if (!isHealthy) {
          logger.warn('Infrastructure not fully healthy, proceeding with caution');
        }
      }

      // Create Playwright session
      const playwrightSession = await playwrightManager.createSession(sessionId);

      const session: E2ETestSession = {
        id: sessionId,
        config: sessionConfig,
        serverManager,
        playwrightManager,
        dataManager,
        infrastructureManager,
        reliabilityCoordinator,
        testData: testSession.data,
        metadata: {
          startTime: new Date(),
          scenario: sessionConfig.scenario,
          browser: sessionConfig.browser,
          environment: process.env.NODE_ENV || 'test'
        }
      };

      this.sessions.set(sessionId, session);

      logger.info('E2E test session created successfully', {
        sessionId,
        serverUrl: serverManager.getUrl(),
        scenario: testSession.scenario.name,
        dataValidation: sessionConfig.validateData ? 'enabled' : 'disabled',
        reliabilityFramework: sessionConfig.useReliabilityFramework ? 'enabled' : 'disabled'
      });

      return session;

    } catch (error) {
      logger.error('Failed to create E2E test session', error as Error, {
        sessionId,
        scenario: sessionConfig.scenario
      });
      throw error;
    }
  }

  /**
   * Execute E2E test with comprehensive recovery
   */
  async executeE2ETest<T>(
    sessionId: string,
    testName: string,
    testFunction: (session: E2ETestSession) => Promise<T>
  ): Promise<T> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`E2E session ${sessionId} not found`);
    }

    logger.info('Executing E2E test with recovery', {
      sessionId,
      testName,
      scenario: session.metadata.scenario
    });

    let lastError: Error | null = null;
    const maxRetries = session.config.maxRetries;

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      try {
        // Start test execution tracking if reliability framework is enabled
        if (session.reliabilityCoordinator) {
          await session.reliabilityCoordinator.startTest();
        }

        // Execute the test
        const result = await testFunction(session);

        // Mark test as successful if reliability framework is enabled
        if (session.reliabilityCoordinator) {
          await session.reliabilityCoordinator.endTest();
        }

        logger.info('E2E test executed successfully', {
          sessionId,
          testName,
          attempt
        });

        return result;

      } catch (error) {
        lastError = error as Error;
        
        logger.warn(`E2E test attempt ${attempt} failed`, {
          sessionId,
          testName,
          error: lastError.message,
          attempt,
          maxRetries
        });

        // Mark test as failed if reliability framework is enabled
        if (session.reliabilityCoordinator) {
          await session.reliabilityCoordinator.handleTestError(lastError);
        }

        // If not the last attempt, perform recovery
        if (attempt <= maxRetries) {
          await this.performTestRecovery(sessionId, lastError, attempt);
          await new Promise(resolve => setTimeout(resolve, session.config.retryDelay));
        }
      }
    }

    // All attempts failed
    const finalError = new Error(
      `E2E test '${testName}' failed after ${maxRetries + 1} attempts. ` +
      `Last error: ${lastError?.message}`
    );

    if (session.reliabilityCoordinator) {
      await session.reliabilityCoordinator.handleTestError(finalError);
    }

    throw finalError;
  }

  /**
   * Perform comprehensive test recovery
   */
  private async performTestRecovery(
    sessionId: string,
    error: Error,
    attempt: number
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    logger.info('Performing E2E test recovery', {
      sessionId,
      attempt,
      errorType: error.constructor.name,
      errorMessage: error.message
    });

    try {
      // 1. Infrastructure-level recovery
      if (session.config.enableAutoRecovery) {
        const health = await session.infrastructureManager.performHealthCheck();
        if (health.overall !== 'healthy') {
          logger.info('Infrastructure unhealthy, triggering recovery');
          // Recovery will be triggered automatically by infrastructure manager
          await new Promise(resolve => setTimeout(resolve, 3000)); // Wait for recovery
        }
      }

      // 2. Server-level recovery
      if (error.message.includes('CONNECTION_REFUSED') || 
          error.message.includes('ECONNREFUSED') ||
          error.message.includes('net::ERR_CONNECTION_REFUSED')) {
        logger.info('Connection error detected, checking server status');
        
        const serverStatus = session.serverManager.getStatus();
        if (!serverStatus.isRunning) {
          await session.serverManager.start();
          await session.serverManager.waitForReady();
        } else {
          const isHealthy = await session.serverManager.healthCheck();
          if (!isHealthy) {
            await session.serverManager.restart();
            await session.serverManager.waitForReady();
          }
        }
      }

      // 3. Browser-level recovery
      if (error.message.includes('Browser') || 
          error.message.includes('Page') ||
          error.message.includes('Target closed')) {
        logger.info('Browser error detected, refreshing session');
        
        // Close and recreate Playwright session
        await session.playwrightManager.closeSession(sessionId);
        await session.playwrightManager.createSession(sessionId);
      }

      // 4. Data-level recovery
      if (error.message.includes('extraction') || 
          error.message.includes('validation') ||
          error.message.includes('parsing')) {
        logger.info('Data error detected, refreshing test data');
        
        // Get fresh test data
        const freshSession = createTestSession(session.config.scenario, {
          browser: session.config.browser,
          environment: session.metadata.environment,
          testSuite: 'e2e'
        });
        
        session.testData = freshSession.data;
      }

      // 5. Reliability framework recovery (if enabled)
      if (session.reliabilityCoordinator) {
        await session.reliabilityCoordinator.performRecovery();
      }

      logger.info('E2E test recovery completed', {
        sessionId,
        attempt
      });

    } catch (recoveryError) {
      logger.error('E2E test recovery failed', recoveryError as Error, {
        sessionId,
        attempt,
        originalError: error.message
      });
    }
  }

  /**
   * Navigate with comprehensive recovery
   */
  async navigateWithRecovery(
    sessionId: string,
    url: string,
    options: { timeout?: number; waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' } = {}
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`E2E session ${sessionId} not found`);
    }

    return session.playwrightManager.navigateWithRecovery(sessionId, url, options);
  }

  /**
   * Execute action with comprehensive recovery
   */
  async executeActionWithRecovery<T>(
    sessionId: string,
    action: (session: E2ETestSession) => Promise<T>,
    actionName: string = 'unknown action'
  ): Promise<T> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`E2E session ${sessionId} not found`);
    }

    return session.playwrightManager.executeWithRecovery(
      sessionId,
      async (page) => action(session),
      actionName
    );
  }

  /**
   * Get session status and health
   */
  getSessionStatus(sessionId: string): {
    exists: boolean;
    isHealthy?: boolean;
    components?: {
      server: any;
      browser: any;
      infrastructure: any;
    };
    metadata?: E2ETestSession['metadata'];
  } {
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      return { exists: false };
    }

    try {
      const serverStatus = session.serverManager.getStatus();
      const browserStatus = session.playwrightManager.getSessionStatus(sessionId);
      const infraHealth = session.infrastructureManager.getCurrentHealth();

      return {
        exists: true,
        isHealthy: serverStatus.isRunning && browserStatus.browserConnected && 
                   infraHealth?.overall === 'healthy',
        components: {
          server: serverStatus,
          browser: browserStatus,
          infrastructure: infraHealth
        },
        metadata: session.metadata
      };
    } catch (error) {
      return {
        exists: true,
        isHealthy: false
      };
    }
  }

  /**
   * Close E2E session and cleanup
   */
  async closeE2ESession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      logger.debug(`E2E session ${sessionId} not found for cleanup`);
      return;
    }

    logger.info('Closing E2E test session', { sessionId });

    try {
      // Close components in reverse order
      if (session.reliabilityCoordinator) {
        await session.reliabilityCoordinator.cleanup();
      }

      await session.playwrightManager.closeSession(sessionId);
      session.infrastructureManager.cleanup();
      
      // Note: Server manager cleanup handled by global teardown

    } catch (error) {
      logger.warn('Error during E2E session cleanup', {
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      this.sessions.delete(sessionId);
    }
  }

  /**
   * Cleanup all sessions
   */
  async cleanup(): Promise<void> {
    logger.info('Cleaning up all E2E sessions', {
      sessionCount: this.sessions.size
    });

    const cleanupPromises = Array.from(this.sessions.keys()).map(sessionId =>
      this.closeE2ESession(sessionId).catch(error =>
        logger.warn('Error cleaning up E2E session', {
          sessionId,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      )
    );

    await Promise.allSettled(cleanupPromises);
  }

  /**
   * Generate comprehensive test report
   */
  generateReport(): {
    sessions: number;
    activeSessionsHealth: Array<{
      sessionId: string;
      isHealthy: boolean;
      scenario: string;
      uptime: number;
    }>;
    infrastructureReport: any;
    reliabilityReport?: any;
  } {
    const activeSessions = Array.from(this.sessions.entries()).map(([sessionId, session]) => {
      const status = this.getSessionStatus(sessionId);
      const uptime = Date.now() - session.metadata.startTime.getTime();
      
      return {
        sessionId,
        isHealthy: status.isHealthy || false,
        scenario: session.metadata.scenario,
        uptime: Math.round(uptime / 1000) // seconds
      };
    });

    // Get infrastructure report from first session (they share infrastructure monitoring)
    let infrastructureReport = null;
    const firstSession = Array.from(this.sessions.values())[0];
    if (firstSession) {
      infrastructureReport = firstSession.infrastructureManager.generateReport();
    }

    return {
      sessions: this.sessions.size,
      activeSessionsHealth: activeSessions,
      infrastructureReport,
      reliabilityReport: firstSession?.reliabilityCoordinator?.generateReport()
    };
  }
}

/**
 * Global E2E recovery coordinator
 */
export const e2eRecoveryCoordinator = new E2ERecoveryCoordinator();

/**
 * Utility functions for E2E recovery integration
 */

/**
 * Setup comprehensive E2E testing for a test suite
 */
export function setupComprehensiveE2E(
  suiteName: string,
  config: Partial<E2ETestConfig> = {}
): E2ERecoveryCoordinator {
  const coordinator = new E2ERecoveryCoordinator(config);
  const sessionId = `${suiteName}-${Date.now()}`;

  beforeAll(async () => {
    await coordinator.createE2ESession(sessionId, config);
  }, 90000); // 90 second timeout for full setup

  afterAll(async () => {
    await coordinator.cleanup();
  }, 30000); // 30 second timeout for cleanup

  return coordinator;
}

/**
 * Enhanced E2E test wrapper with comprehensive recovery
 */
export function comprehensiveE2ETest(
  testName: string,
  testFn: (session: E2ETestSession, coordinator: E2ERecoveryCoordinator) => Promise<void>,
  config?: Partial<E2ETestConfig>
): void {
  it(testName, async () => {
    const coordinator = new E2ERecoveryCoordinator(config);
    const sessionId = `test-${Date.now()}`;
    
    try {
      const session = await coordinator.createE2ESession(sessionId, config);
      await coordinator.executeE2ETest(sessionId, testName, async (session) => {
        await testFn(session, coordinator);
      });
    } finally {
      await coordinator.closeE2ESession(sessionId);
    }
  }, config?.testTimeout || 120000); // 2 minute default timeout
}

/**
 * Quick reliable E2E test with standard TestCorp data
 */
export function reliableE2ETest(
  testName: string,
  testFn: (session: E2ETestSession) => Promise<void>
): void {
  comprehensiveE2ETest(
    testName,
    async (session) => testFn(session),
    {
      scenario: 'testcorp-basic',
      useReliableData: true,
      validateData: true,
      enableAutoRecovery: true
    }
  );
} 