/**
 * Phase 3.2: Playwright Test Recovery System
 * Comprehensive recovery and stability system for Playwright E2E tests
 */

import { Browser, BrowserContext, Page, chromium, firefox, webkit } from '@playwright/test';
import { logger } from '@/lib/logger';
import { E2EServerManager, ensureServerRunning } from './e2eServerManager';

export interface PlaywrightConfig {
  browser: 'chromium' | 'firefox' | 'webkit';
  headless: boolean;
  timeout: number;
  navigationTimeout: number;
  actionTimeout: number;
  retries: number;
  slowMo: number;
  viewport: { width: number; height: number };
  serverConfig?: {
    port: number;
    host: string;
    startupTimeout: number;
  };
}

export interface PlaywrightSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  serverManager: E2EServerManager;
  config: PlaywrightConfig;
}

export interface RecoveryOptions {
  maxRecoveryAttempts: number;
  recoveryDelayMs: number;
  checkServerHealth: boolean;
  restartServerOnFailure: boolean;
  clearStorageOnRecovery: boolean;
}

export const DEFAULT_PLAYWRIGHT_CONFIG: PlaywrightConfig = {
  browser: 'chromium',
  headless: true,
  timeout: 60000, // 60 seconds
  navigationTimeout: 30000, // 30 seconds
  actionTimeout: 10000, // 10 seconds
  retries: 3,
  slowMo: 0,
  viewport: { width: 1280, height: 720 },
  serverConfig: {
    port: 3000,
    host: 'localhost',
    startupTimeout: 30000
  }
};

export const DEFAULT_RECOVERY_OPTIONS: RecoveryOptions = {
  maxRecoveryAttempts: 3,
  recoveryDelayMs: 2000,
  checkServerHealth: true,
  restartServerOnFailure: true,
  clearStorageOnRecovery: true
};

/**
 * Playwright Recovery Manager
 * Handles browser session management, connection recovery, and test stability
 */
export class PlaywrightRecoveryManager {
  private config: PlaywrightConfig;
  private recoveryOptions: RecoveryOptions;
  private sessions: Map<string, PlaywrightSession> = new Map();
  private serverManager: E2EServerManager | null = null;

  constructor(
    config: Partial<PlaywrightConfig> = {},
    recoveryOptions: Partial<RecoveryOptions> = {}
  ) {
    this.config = { ...DEFAULT_PLAYWRIGHT_CONFIG, ...config };
    this.recoveryOptions = { ...DEFAULT_RECOVERY_OPTIONS, ...recoveryOptions };
  }

  /**
   * Create a new Playwright session with comprehensive error handling
   */
  async createSession(sessionId: string): Promise<PlaywrightSession> {
    logger.info('Creating Playwright session', {
      sessionId,
      browser: this.config.browser,
      headless: this.config.headless
    });

    try {
      // Ensure server is running first
      this.serverManager = await ensureServerRunning(this.config.serverConfig);
      await this.serverManager.waitForReady();

      // Launch browser with retry logic
      const browser = await this.launchBrowserWithRetry();
      
      // Create context with proper configuration
      const context = await browser.newContext({
        viewport: this.config.viewport,
        ignoreHTTPSErrors: true,
        acceptDownloads: false,
        permissions: ['clipboard-read', 'clipboard-write']
      });

      // Set timeouts
      context.setDefaultTimeout(this.config.timeout);
      context.setDefaultNavigationTimeout(this.config.navigationTimeout);

      // Create page
      const page = await context.newPage();
      
      // Configure page settings
      await this.configurePage(page);

      const session: PlaywrightSession = {
        browser,
        context,
        page,
        serverManager: this.serverManager,
        config: this.config
      };

      this.sessions.set(sessionId, session);

      logger.info('Playwright session created successfully', {
        sessionId,
        serverUrl: this.serverManager.getUrl()
      });

      return session;

    } catch (error) {
      logger.error('Failed to create Playwright session', error as Error, {
        sessionId,
        browser: this.config.browser
      });
      throw error;
    }
  }

  /**
   * Launch browser with retry and recovery logic
   */
  private async launchBrowserWithRetry(): Promise<Browser> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= this.config.retries; attempt++) {
      try {
        logger.debug(`Launching ${this.config.browser} browser (attempt ${attempt})`);
        
        const launchOptions = {
          headless: this.config.headless,
          slowMo: this.config.slowMo,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-extensions',
            '--disable-gpu',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding'
          ]
        };

        let browser: Browser;
        switch (this.config.browser) {
          case 'firefox':
            browser = await firefox.launch(launchOptions);
            break;
          case 'webkit':
            browser = await webkit.launch(launchOptions);
            break;
          case 'chromium':
          default:
            browser = await chromium.launch(launchOptions);
            break;
        }

        return browser;

      } catch (error) {
        lastError = error as Error;
        logger.warn(`Browser launch attempt ${attempt} failed`, {
          error: lastError.message,
          browser: this.config.browser,
          attempt
        });

        if (attempt < this.config.retries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }

    throw new Error(`Failed to launch ${this.config.browser} after ${this.config.retries} attempts. Last error: ${lastError?.message}`);
  }

  /**
   * Configure page with optimal settings for E2E testing
   */
  private async configurePage(page: Page): Promise<void> {
    // Set timeouts
    page.setDefaultTimeout(this.config.actionTimeout);
    page.setDefaultNavigationTimeout(this.config.navigationTimeout);

    // Handle console messages
    page.on('console', msg => {
      if (process.env.VERBOSE_PLAYWRIGHT) {
        console.log(`[PAGE CONSOLE] ${msg.type()}: ${msg.text()}`);
      }
    });

    // Handle page errors
    page.on('pageerror', err => {
      logger.warn('Page error detected', {
        error: err.message,
        stack: err.stack
      });
    });

    // Handle request failures
    page.on('requestfailed', request => {
      logger.debug('Request failed', {
        url: request.url(),
        method: request.method(),
        failure: request.failure()?.errorText
      });
    });

    // Set extra HTTP headers
    await page.setExtraHTTPHeaders({
      'User-Agent': 'Playwright-E2E-Test'
    });
  }

  /**
   * Navigate to URL with connection recovery
   */
  async navigateWithRecovery(
    sessionId: string,
    url: string,
    options: { timeout?: number; waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' } = {}
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const { timeout = this.config.navigationTimeout, waitUntil = 'domcontentloaded' } = options;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.recoveryOptions.maxRecoveryAttempts; attempt++) {
      try {
        logger.debug(`Navigating to ${url} (attempt ${attempt})`, { sessionId });

        // Check server health if configured
        if (this.recoveryOptions.checkServerHealth && session.serverManager) {
          const isHealthy = await session.serverManager.healthCheck();
          if (!isHealthy) {
            if (this.recoveryOptions.restartServerOnFailure) {
              logger.info('Server unhealthy, attempting restart');
              await session.serverManager.restart();
              await session.serverManager.waitForReady();
            } else {
              throw new Error('Server is not healthy');
            }
          }
        }

        // Attempt navigation
        await session.page.goto(url, { timeout, waitUntil });
        
        // Wait for page to be fully loaded
        await session.page.waitForLoadState('networkidle', { timeout: 5000 });

        logger.debug(`Successfully navigated to ${url}`, { sessionId });
        return;

      } catch (error) {
        lastError = error as Error;
        
        logger.warn(`Navigation attempt ${attempt} failed`, {
          sessionId,
          url,
          error: lastError.message,
          attempt
        });

        // If not the last attempt, try recovery
        if (attempt < this.recoveryOptions.maxRecoveryAttempts) {
          await this.performRecovery(sessionId, lastError);
          await new Promise(resolve => setTimeout(resolve, this.recoveryOptions.recoveryDelayMs));
        }
      }
    }

    throw new Error(`Failed to navigate to ${url} after ${this.recoveryOptions.maxRecoveryAttempts} attempts. Last error: ${lastError?.message}`);
  }

  /**
   * Perform recovery actions based on error type
   */
  private async performRecovery(sessionId: string, error: Error): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    logger.info('Performing recovery actions', {
      sessionId,
      errorMessage: error.message
    });

    try {
      // Clear storage if configured
      if (this.recoveryOptions.clearStorageOnRecovery) {
        await session.context.clearCookies();
        await session.context.clearPermissions();
      }

      // Check if it's a connection error
      if (error.message.includes('net::ERR_CONNECTION_REFUSED') || 
          error.message.includes('CONNECTION_REFUSED') ||
          error.message.includes('ECONNREFUSED')) {
        
        logger.info('Connection refused detected, checking server status');
        
        if (session.serverManager) {
          const isRunning = session.serverManager.getStatus().isRunning;
          if (!isRunning) {
            logger.info('Server not running, attempting to start');
            await session.serverManager.start();
            await session.serverManager.waitForReady();
          } else {
            logger.info('Server appears to be running, attempting restart');
            await session.serverManager.restart();
            await session.serverManager.waitForReady();
          }
        }
      }

      // Check if it's a timeout error
      if (error.message.includes('Timeout') || error.message.includes('timeout')) {
        logger.info('Timeout detected, waiting for system to stabilize');
        await new Promise(resolve => setTimeout(resolve, 3000));
      }

      // Reload the page if it's loaded but in bad state
      try {
        if (session.page.url() && !session.page.url().includes('about:blank')) {
          await session.page.reload({ timeout: 10000 });
        }
      } catch (reloadError) {
        // Ignore reload errors
        logger.debug('Page reload failed during recovery', {
          error: reloadError instanceof Error ? reloadError.message : 'Unknown error'
        });
      }

    } catch (recoveryError) {
      logger.warn('Recovery action failed', {
        sessionId,
        error: recoveryError instanceof Error ? recoveryError.message : 'Unknown error'
      });
    }
  }

  /**
   * Execute action with retry and recovery
   */
  async executeWithRecovery<T>(
    sessionId: string,
    action: (page: Page) => Promise<T>,
    actionName: string = 'unknown action'
  ): Promise<T> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.recoveryOptions.maxRecoveryAttempts; attempt++) {
      try {
        logger.debug(`Executing ${actionName} (attempt ${attempt})`, { sessionId });
        
        const result = await action(session.page);
        
        logger.debug(`Successfully executed ${actionName}`, { sessionId });
        return result;

      } catch (error) {
        lastError = error as Error;
        
        logger.warn(`Action ${actionName} attempt ${attempt} failed`, {
          sessionId,
          error: lastError.message,
          attempt
        });

        // If not the last attempt, try recovery
        if (attempt < this.recoveryOptions.maxRecoveryAttempts) {
          await this.performRecovery(sessionId, lastError);
          await new Promise(resolve => setTimeout(resolve, this.recoveryOptions.recoveryDelayMs));
        }
      }
    }

    throw new Error(`Failed to execute ${actionName} after ${this.recoveryOptions.maxRecoveryAttempts} attempts. Last error: ${lastError?.message}`);
  }

  /**
   * Take screenshot for debugging
   */
  async captureScreenshot(sessionId: string, name: string): Promise<Buffer | null> {
    try {
      const session = this.sessions.get(sessionId);
      if (!session) return null;

      return await session.page.screenshot({
        path: `test-results/screenshots/${sessionId}-${name}-${Date.now()}.png`,
        fullPage: true
      });
    } catch (error) {
      logger.warn('Failed to capture screenshot', {
        sessionId,
        name,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }

  /**
   * Get session status and health information
   */
  getSessionStatus(sessionId: string): {
    exists: boolean;
    browserConnected?: boolean;
    pageUrl?: string;
    serverStatus?: any;
  } {
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      return { exists: false };
    }

    try {
      return {
        exists: true,
        browserConnected: session.browser.isConnected(),
        pageUrl: session.page.url(),
        serverStatus: session.serverManager?.getStatus()
      };
    } catch (error) {
      return {
        exists: true,
        browserConnected: false
      };
    }
  }

  /**
   * Close session and cleanup resources
   */
  async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      logger.debug(`Session ${sessionId} not found for cleanup`);
      return;
    }

    logger.info('Closing Playwright session', { sessionId });

    try {
      // Close page
      if (session.page && !session.page.isClosed()) {
        await session.page.close();
      }

      // Close context
      if (session.context) {
        await session.context.close();
      }

      // Close browser
      if (session.browser && session.browser.isConnected()) {
        await session.browser.close();
      }

      // Note: We don't close the server manager here as it might be shared
      // The server will be cleaned up by the global test teardown

    } catch (error) {
      logger.warn('Error during session cleanup', {
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      this.sessions.delete(sessionId);
    }
  }

  /**
   * Close all sessions and cleanup
   */
  async cleanup(): Promise<void> {
    logger.info('Cleaning up all Playwright sessions', {
      sessionCount: this.sessions.size
    });

    const cleanupPromises = Array.from(this.sessions.keys()).map(sessionId =>
      this.closeSession(sessionId).catch(error =>
        logger.warn('Error cleaning up session', {
          sessionId,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      )
    );

    await Promise.allSettled(cleanupPromises);

    if (this.serverManager) {
      // Note: Server cleanup is handled by the global server manager
      this.serverManager = null;
    }
  }
}

/**
 * Global Playwright recovery manager instance
 */
export const playwrightRecoveryManager = new PlaywrightRecoveryManager();

/**
 * Utility functions for Playwright tests
 */

/**
 * Create a Playwright session with automatic recovery
 */
export async function createPlaywrightSession(
  sessionId: string,
  config?: Partial<PlaywrightConfig>
): Promise<PlaywrightSession> {
  const manager = new PlaywrightRecoveryManager(config);
  return manager.createSession(sessionId);
}

/**
 * Setup Playwright for test suite with automatic server management
 */
export function setupPlaywrightSuite(
  suiteName: string,
  config?: Partial<PlaywrightConfig>
): PlaywrightRecoveryManager {
  const manager = new PlaywrightRecoveryManager(config);
  const sessionId = `${suiteName}-${Date.now()}`;

  beforeAll(async () => {
    await manager.createSession(sessionId);
  }, 60000); // 60 second timeout

  afterAll(async () => {
    await manager.cleanup();
  }, 30000); // 30 second timeout

  return manager;
}

/**
 * Enhanced test wrapper with Playwright recovery
 */
export function playwrightTest(
  testName: string,
  testFn: (session: PlaywrightSession, manager: PlaywrightRecoveryManager) => Promise<void>,
  config?: Partial<PlaywrightConfig>
): void {
  it(testName, async () => {
    const manager = new PlaywrightRecoveryManager(config);
    const sessionId = `test-${Date.now()}`;
    
    try {
      const session = await manager.createSession(sessionId);
      await testFn(session, manager);
    } finally {
      await manager.closeSession(sessionId);
    }
  }, config?.timeout || 60000);
} 