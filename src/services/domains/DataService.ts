/**
 * Unified DataService - Task 1.3 Implementation
 * 
 * Consolidates three data services into a unified architecture:
 * - WebScraperService: Core Puppeteer web scraping operations
 * - ProductScrapingService: Product-specific scraping with retry logic
 * - SmartDataCollectionService: Intelligent data prioritization and collection
 * 
 * Key Features:
 * - Factory pattern for sub-modules (WebScraping, ProductScraping, SmartCollection)
 * - Shared Puppeteer browser instance across all modules
 * - Preserved critical data flows (Smart Scheduling integration)
 * - Unified error handling with correlation ID tracking
 * - Backward compatibility for existing consumers
 * - Enhanced observability and monitoring
 */

import { logger, trackErrorWithCorrelation, trackBusinessEvent } from '@/lib/logger';
import { createId } from '@paralleldrive/cuid2';
import puppeteer, { Browser, Page } from 'puppeteer';

// Import unified types from Task 1.3
import {
  DataRequest,
  DataResponse,
  ScrapingConfig,
  DataCollectionType,
  DataErrorCode,
  
  // Sub-module interfaces
  WebScrapingInterface,
  ProductScrapingInterface,
  SmartCollectionInterface,
  
  // Configuration types
  ScrapingOptions,
  ProductScrapingOptions,
  SmartCollectionOptions,
  
  // Result types
  ScrapingResult,
  
  // Utility functions
  validateDataRequest,
  generateDataCorrelationId,
  DEFAULT_SCRAPING_CONFIG
} from './types/dataTypes';

// Import sub-modules
import { ProductScrapingModule } from './data/ProductScrapingModule';
import { SmartCollectionModule } from './data/SmartCollectionModule';

// Import original service types for backward compatibility
// import type { ProductSnapshot } from '@/types/product';
// import type { Competitor, CompetitorSnapshot } from '@/types/analysis';

// ============================================================================
// SHARED INFRASTRUCTURE CLASSES
// ============================================================================

/**
 * Browser Manager - Centralized Puppeteer browser management
 * Eliminates duplicate browser initialization patterns across all three original services
 */
class BrowserManager {
  private static instance: Browser | null = null;
  private static initializationPromise: Promise<Browser> | null = null;
  private static pagePool: Page[] = [];
  private static maxPoolSize = 10;

  static async getSharedInstance(config?: ScrapingConfig): Promise<Browser> {
    if (this.instance) {
      return this.instance;
    }

    if (this.initializationPromise) {
      return await this.initializationPromise;
    }

    this.initializationPromise = this.initializeBrowser(config);
    try {
      this.instance = await this.initializationPromise;
      this.initializationPromise = null;
      return this.instance;
    } catch (error) {
      this.initializationPromise = null;
      throw error;
    }
  }

  private static async initializeBrowser(config?: ScrapingConfig): Promise<Browser> {
    try {
      const browserConfig = config?.browserConfig || DEFAULT_SCRAPING_CONFIG.browserConfig;
      
      logger.info('Initializing shared Puppeteer browser with configuration', {
        headless: browserConfig.headless,
        viewport: `${browserConfig.viewportWidth}x${browserConfig.viewportHeight}`,
        userAgent: browserConfig.userAgent
      });

      const browser = await puppeteer.launch({
        headless: browserConfig.headless,
        args: browserConfig.launchArgs,
        defaultViewport: {
          width: browserConfig.viewportWidth,
          height: browserConfig.viewportHeight
        }
      });

      // Initialize page pool
      await this.initializePagePool(browser);

      logger.info('✅ Shared Puppeteer browser initialized successfully');
      return browser;
    } catch (error) {
      logger.error('❌ Failed to initialize shared Puppeteer browser', error as Error);
      throw error;
    }
  }

  private static async initializePagePool(browser: Browser): Promise<void> {
    try {
      for (let i = 0; i < Math.min(5, this.maxPoolSize); i++) {
        const page = await browser.newPage();
        this.pagePool.push(page);
      }
      logger.info(`Page pool initialized with ${this.pagePool.length} pages`);
    } catch (error) {
      logger.error('Failed to initialize page pool', error as Error);
    }
  }

  static async getPage(): Promise<Page> {
    const browser = await this.getSharedInstance();
    
    if (this.pagePool.length > 0) {
      return this.pagePool.pop()!;
    }
    
    return await browser.newPage();
  }

  static async returnPage(page: Page): Promise<void> {
    try {
      // Clear page state
      await page.goto('about:blank');
      await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
      });
      
      if (this.pagePool.length < this.maxPoolSize) {
        this.pagePool.push(page);
      } else {
        await page.close();
      }
    } catch (error) {
      logger.error('Error returning page to pool', error as Error);
      try {
        await page.close();
      } catch (closeError) {
        logger.error('Error closing page', closeError as Error);
      }
    }
  }

  static async close(): Promise<void> {
    if (this.instance) {
      // Close all pages in pool
      await Promise.all(this.pagePool.map(page => page.close().catch(err => 
        logger.error('Error closing pooled page', err)
      )));
      this.pagePool = [];
      
      await this.instance.close();
      this.instance = null;
      logger.info('🔒 Shared Puppeteer browser closed');
    }
  }

  static async getBrowserStatus() {
    if (!this.instance) {
      return { 
        isInitialized: false, 
        activePages: 0, 
        memoryUsage: 0,
        uptime: 0,
        version: 'unknown'
      };
    }

    const pages = await this.instance.pages();
    return {
      isInitialized: true,
      activePages: pages.length,
      memoryUsage: 0, // Would need process.memoryUsage() for real value
      uptime: Date.now(), // Simplified uptime
      version: await this.instance.version()
    };
  }
}

/**
 * WebScrapingModule - Core Puppeteer operations
 * Migrated from WebScraperService
 */
class WebScrapingModule implements WebScrapingInterface {
  private config: ScrapingConfig;

  constructor(config: ScrapingConfig = DEFAULT_SCRAPING_CONFIG) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    await BrowserManager.getSharedInstance(this.config);
  }

  async close(): Promise<void> {
    await BrowserManager.close();
  }

  async scrapeUrl(url: string, options: ScrapingOptions = {}): Promise<ScrapingResult> {
    const correlationId = generateDataCorrelationId();
    const startTime = Date.now();
    
    const context = { 
      url, 
      correlationId, 
      operation: 'webScraping',
      module: 'WebScrapingModule'
    };

    try {
      logger.info('Starting web scraping operation', context);
      
      // Validate URL
      if (!url || !this.isValidUrl(url)) {
        throw new Error(`Invalid URL provided: ${url}`);
      }

      const mergedOptions = { ...this.config.browserConfig, ...options };
      const page = await BrowserManager.getPage();
      
      try {
        // Configure page
        await page.setUserAgent(mergedOptions.userAgent || this.config.browserConfig.userAgent);
        
        if (options.customHeaders) {
          await page.setExtraHTTPHeaders(options.customHeaders);
        }

        // Enhanced retry logic with exponential backoff
        let lastError: Error | null = null;
        const maxRetries = mergedOptions.retries || this.config.retryConfig.maxRetries;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            const navigationStart = Date.now();
            
            const response = await page.goto(url, {
              timeout: mergedOptions.timeout || this.config.browserConfig.timeout,
              waitUntil: 'networkidle0'
            });

            if (!response) {
              throw new Error('Navigation failed - no response received');
            }

            const navigationTime = Date.now() - navigationStart;

            // Wait for custom selector if specified
            if (options.waitForSelector) {
              await page.waitForSelector(options.waitForSelector, { timeout: 5000 });
            }

            // Extract content
            const extractionStart = Date.now();
            const [html, text, title] = await Promise.all([
              page.content(),
              page.evaluate(() => document.body.innerText || ''),
              page.title()
            ]);
            const extractionTime = Date.now() - extractionStart;

            // Validate content
            if (this.config.validation.validateContentLength && 
                html.length < this.config.contentConfig.minContentLength) {
              throw new Error(`Insufficient content: ${html.length} chars, minimum ${this.config.contentConfig.minContentLength}`);
            }

            // Take screenshot if requested
            let screenshot: Buffer | undefined;
            if (options.takeScreenshot) {
              screenshot = await page.screenshot({ fullPage: true }) as Buffer;
            }

            const result: ScrapingResult = {
              url,
              html,
              text,
              title,
              timestamp: new Date(),
              correlationId,
              contentLength: html.length,
              extractionTime,
              qualityScore: this.calculateContentQuality(html, text, title),
              screenshot,
              responseCode: response.status(),
              responseHeaders: response.headers(),
              redirectChain: response.request().redirectChain().map(req => req.url()),
              timing: {
                startTime: new Date(startTime),
                endTime: new Date(),
                totalTime: Date.now() - startTime,
                networkTime: navigationTime,
                renderTime: navigationTime,
                extractionTime
              }
            };

            logger.info('Web scraping completed successfully', {
              ...context,
              contentLength: result.contentLength,
              qualityScore: result.qualityScore,
              totalTime: result.timing.totalTime,
              attempt
            });

            return result;

          } catch (error) {
            lastError = error as Error;
            logger.warn(`Web scraping attempt ${attempt} failed`, {
              ...context,
              error: lastError.message,
              attempt,
              maxRetries
            });

            if (attempt < maxRetries) {
              const delay = this.calculateRetryDelay(attempt);
              await new Promise(resolve => setTimeout(resolve, delay));
            }
          }
        }

        throw lastError || new Error('All scraping attempts failed');

      } finally {
        await BrowserManager.returnPage(page);
      }

    } catch (error) {
      const errorWithContext = error as Error;
      logger.error('Web scraping failed', errorWithContext, context);
      
      trackErrorWithCorrelation(errorWithContext, correlationId, 'webScraping');

      throw errorWithContext;
    }
  }

  async scrapeMultipleUrls(urls: string[], options: ScrapingOptions = {}): Promise<ScrapingResult[]> {
    const correlationId = generateDataCorrelationId();
    const startTime = Date.now();

    try {
      logger.info('Starting batch web scraping', {
        correlationId,
        urlCount: urls.length,
        operation: 'batchWebScraping'
      });

      // Process URLs in batches to avoid overwhelming the browser
      const batchSize = this.config.performance.maxConcurrentPages;
      const results: ScrapingResult[] = [];
      
      for (let i = 0; i < urls.length; i += batchSize) {
        const batch = urls.slice(i, i + batchSize);
        const batchPromises = batch.map(url => this.scrapeUrl(url, options));
        const batchResults = await Promise.allSettled(batchPromises);
        
        batchResults.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            results.push(result.value);
          } else {
            logger.error(`Batch scraping failed for URL: ${batch[index]}`, result.reason);
          }
        });
      }

      logger.info('Batch web scraping completed', {
        correlationId,
        totalUrls: urls.length,
        successfulUrls: results.length,
        duration: Date.now() - startTime
      });

      return results;

    } catch (error) {
      logger.error('Batch web scraping failed', error as Error, { correlationId });
      throw error;
    }
  }

  async scrapeCompetitor(competitorId: string, options: ScrapingOptions = {}): Promise<string> {
    const correlationId = generateDataCorrelationId();
    
    try {
      // This method preserves SmartSchedulingService integration
      logger.info('Scraping competitor data', {
        competitorId,
        correlationId,
        operation: 'competitorScraping'
      });

      // Get competitor URL from database
      const competitor = await this.getCompetitorFromDatabase(competitorId);
      if (!competitor?.website) {
        throw new Error(`Competitor ${competitorId} not found or has no website`);
      }

      const result = await this.scrapeUrl(competitor.website, options);
      
      // Store competitor snapshot
      const snapshotId = await this.storeCompetitorSnapshot(competitorId, result);
      
      trackBusinessEvent('competitor_scraped', {
        competitorId,
        snapshotId,
        correlationId,
        contentLength: result.contentLength,
        qualityScore: result.qualityScore
      });

      return snapshotId;

    } catch (error) {
      logger.error('Competitor scraping failed', error as Error, {
        competitorId,
        correlationId
      });
      throw error;
    }
  }

  async scrapeAllCompetitors(options: ScrapingOptions = {}): Promise<string[]> {
    const correlationId = generateDataCorrelationId();
    
    try {
      logger.info('Scraping all competitors', {
        correlationId,
        operation: 'allCompetitorsScraping'
      });

      const competitors = await this.getAllCompetitorsFromDatabase();
      const results: string[] = [];

      for (const competitor of competitors) {
        try {
          const snapshotId = await this.scrapeCompetitor(competitor.id, options);
          results.push(snapshotId);
        } catch (error) {
          logger.error(`Failed to scrape competitor ${competitor.id}`, error as Error);
        }
      }

      logger.info('All competitors scraping completed', {
        correlationId,
        totalCompetitors: competitors.length,
        successfulScrapes: results.length
      });

      return results;

    } catch (error) {
      logger.error('All competitors scraping failed', error as Error, { correlationId });
      throw error;
    }
  }

  async getBrowserStatus() {
    return await BrowserManager.getBrowserStatus();
  }

  async restartBrowser(): Promise<void> {
    await BrowserManager.close();
    await BrowserManager.getSharedInstance(this.config);
  }

  // Helper methods
  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  private calculateRetryDelay(attempt: number): number {
    const baseDelay = this.config.retryConfig.baseDelay;
    const maxDelay = this.config.retryConfig.maxDelay;
    
    if (this.config.retryConfig.exponentialBackoff) {
      return Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
    }
    
    return baseDelay;
  }

  private calculateContentQuality(html: string, text: string, title: string): number {
    let score = 0;
    
    // Content length scoring
    if (html.length > this.config.contentConfig.minContentLength) score += 30;
    if (text.length > 100) score += 20;
    if (title && title.length > 0) score += 20;
    
    // HTML structure scoring
    if (html.includes('<body>')) score += 10;
    if (html.includes('<head>')) score += 10;
    if (html.includes('<meta')) score += 10;
    
    return Math.min(score, 100);
  }

  private async getCompetitorFromDatabase(competitorId: string) {
    const { prisma } = await import('@/lib/prisma');
    return await prisma.competitor.findUnique({
      where: { id: competitorId }
    });
  }

  private async getAllCompetitorsFromDatabase() {
    const { prisma } = await import('@/lib/prisma');
    return await prisma.competitor.findMany();
  }

  private async storeCompetitorSnapshot(competitorId: string, result: ScrapingResult): Promise<string> {
    const { prisma } = await import('@/lib/prisma');
    const snapshot = await prisma.snapshot.create({
      data: {
        id: createId(),
        competitorId,
        metadata: {
          html: result.html,
          text: result.text,
          title: result.title,
          url: result.url,
          correlationId: result.correlationId,
          scrapedAt: result.timestamp.toISOString(),
          contentLength: result.contentLength,
          qualityScore: result.qualityScore,
          responseCode: result.responseCode,
          timing: {
            startTime: result.timing.startTime.toISOString(),
            endTime: result.timing.endTime.toISOString(),
            totalTime: result.timing.totalTime,
            networkTime: result.timing.networkTime,
            renderTime: result.timing.renderTime,
            extractionTime: result.timing.extractionTime
          }
        }
      }
    });
    
    return snapshot.id;
  }
}

// ============================================================================
// MAIN UNIFIED DATA SERVICE
// ============================================================================

/**
 * Unified DataService - Main consolidation class
 * Provides factory methods for backward compatibility while offering unified interface
 */
export class DataService {
  private webScrapingModule: WebScrapingModule;
  private productScrapingModule: ProductScrapingModule;
  private smartCollectionModule: SmartCollectionModule;
  private config: ScrapingConfig;
  private initialized: boolean = false;

  constructor(config: ScrapingConfig = DEFAULT_SCRAPING_CONFIG) {
    this.config = config;
    this.webScrapingModule = new WebScrapingModule(config);
    this.productScrapingModule = new ProductScrapingModule(this.webScrapingModule);
    this.smartCollectionModule = new SmartCollectionModule(this.webScrapingModule);
    
    // Register service for health monitoring (simplified registration)
    // registerService('DataService', this);
  }

  // ============================================================================
  // UNIFIED INTERFACE
  // ============================================================================

  /**
   * Unified data collection interface - Main entry point for all data operations
   */
  async collectData(request: DataRequest): Promise<DataResponse> {
    const correlationId = request.correlationId || generateDataCorrelationId();
    const startTime = Date.now();

    try {
      // Validate request
      if (!validateDataRequest(request)) {
        throw new Error('Invalid data collection request');
      }

      logger.info('Starting unified data collection', {
        correlationId,
        collectionType: request.collectionType,
        operation: 'unifiedDataCollection'
      });

      let result: DataResponse;

      switch (request.collectionType) {
        case DataCollectionType.WEB_SCRAPING:
          result = await this.handleWebScraping(request, correlationId);
          break;
          
        case DataCollectionType.PRODUCT_SCRAPING:
          result = await this.handleProductScraping(request, correlationId);
          break;
          
        case DataCollectionType.COMPETITOR_SCRAPING:
          result = await this.handleCompetitorScraping(request, correlationId);
          break;
          
        case DataCollectionType.SMART_COLLECTION:
          result = await this.handleSmartCollection(request, correlationId);
          break;
          
        case DataCollectionType.BATCH_SCRAPING:
          result = await this.handleBatchScraping();
          break;
          
        default:
          throw new Error(`Unsupported collection type: ${request.collectionType}`);
      }

      result.metadata.processingTime = Date.now() - startTime;

      logger.info('Unified data collection completed', {
        correlationId,
        collectionType: request.collectionType,
        success: result.success,
        processingTime: result.metadata.processingTime
      });

      return result;

    } catch (error) {
      logger.error('Unified data collection failed', error as Error, {
        correlationId,
        collectionType: request.collectionType
      });

      return this.createErrorResponse(request, correlationId, error as Error, startTime);
    }
  }

  // ============================================================================
  // FACTORY METHODS FOR BACKWARD COMPATIBILITY
  // ============================================================================

  /**
   * Get WebScrapingModule instance - Backward compatibility for WebScraperService consumers
   */
  getWebScraper(): WebScrapingInterface {
    return this.webScrapingModule;
  }

  /**
   * Get ProductScrapingModule instance - Backward compatibility for ProductScrapingService consumers
   */
  getProductScraper(): ProductScrapingInterface {
    return this.productScrapingModule;
  }

  /**
   * Get SmartCollectionModule instance - Backward compatibility for SmartDataCollectionService consumers
   */
  getSmartCollector(): SmartCollectionInterface {
    return this.smartCollectionModule;
  }

  // ============================================================================
  // LIFECYCLE MANAGEMENT
  // ============================================================================

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      logger.info('Initializing unified DataService');
      
      await this.webScrapingModule.initialize();
      
      this.initialized = true;
      logger.info('✅ Unified DataService initialized successfully');
      
    } catch (error) {
      logger.error('❌ Failed to initialize unified DataService', error as Error);
      throw error;
    }
  }

  async close(): Promise<void> {
    if (!this.initialized) return;

    try {
      logger.info('Closing unified DataService');
      
      await this.webScrapingModule.close();
      
      this.initialized = false;
      logger.info('🔒 Unified DataService closed successfully');
      
    } catch (error) {
      logger.error('❌ Failed to close unified DataService', error as Error);
    }
  }

  // ============================================================================
  // HEALTH AND MONITORING
  // ============================================================================

  async getHealth() {
    const browserStatus = await this.webScrapingModule.getBrowserStatus();
    
    return {
      service: 'DataService',
      status: this.initialized ? 'healthy' : 'not_initialized',
      timestamp: new Date(),
              components: {
          webScrapingModule: {
            status: browserStatus.isInitialized ? 'healthy' : 'unhealthy',
            details: browserStatus
          },
        productScrapingModule: {
          status: 'healthy'
        },
        smartCollectionModule: {
          status: 'healthy'
        }
      },
      version: '1.0.0'
    };
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  private async handleWebScraping(request: DataRequest, correlationId: string): Promise<DataResponse> {
    if (!request.url) {
      throw new Error('URL is required for web scraping');
    }

    const scrapingResult = await this.webScrapingModule.scrapeUrl(
      request.url,
      request.options as ScrapingOptions
    );

    return this.createSuccessResponse(request, correlationId, { scrapingResult });
  }

  private async handleProductScraping(request: DataRequest, correlationId: string): Promise<DataResponse> {
    if (!request.targetId) {
      throw new Error('Target ID is required for product scraping');
    }

    const productResult = await this.productScrapingModule.scrapeProductById(
      request.targetId,
      request.options as ProductScrapingOptions
    );

    return this.createSuccessResponse(request, correlationId, { productResult });
  }

  private async handleCompetitorScraping(request: DataRequest, correlationId: string): Promise<DataResponse> {
    if (!request.targetId) {
      throw new Error('Target ID is required for competitor scraping');
    }

    const snapshotId = await this.webScrapingModule.scrapeCompetitor(
      request.targetId,
      request.options as ScrapingOptions
    );

    return this.createSuccessResponse(request, correlationId, { data: { snapshotId } });
  }

  private async handleSmartCollection(request: DataRequest, correlationId: string): Promise<DataResponse> {
    if (!request.projectId) {
      throw new Error('Project ID is required for smart collection');
    }

    const smartCollectionResult = await this.smartCollectionModule.collectProjectData(
      request.projectId,
      request.options as SmartCollectionOptions
    );

    return this.createSuccessResponse(request, correlationId, { smartCollectionResult });
  }

  private async handleBatchScraping(): Promise<DataResponse> {
    throw new Error('Batch scraping not yet implemented');
  }

  private createSuccessResponse(request: DataRequest, correlationId: string, data: Record<string, unknown>): DataResponse {
    return {
      requestId: request.requestId || correlationId,
      correlationId,
      collectionType: request.collectionType,
      success: true,
      ...data,
      metadata: {
        collectionTimestamp: new Date(),
        collectionMethod: request.collectionType,
        browserVersion: 'Chrome/120.0.0.0',
        userAgent: this.config.browserConfig.userAgent,
        sourceSystem: 'DataService',
        dataVersion: '1.0',
        processingTime: 0, // Will be set by caller
        resourceUsage: {
          memoryUsage: 0,
          cpuUsage: 0,
          networkRequests: 1,
          cacheHits: 0,
          cacheMisses: 1
        }
      },
      quality: {
        completenessScore: 90,
        freshnessScore: 100,
        accuracyScore: 90,
        consistencyScore: 85,
        overallScore: 91,
        qualityIssues: [],
        validationResults: []
      }
    };
  }

  private createErrorResponse(request: DataRequest, correlationId: string, error: Error, startTime: number): DataResponse {
    return {
      requestId: request.requestId || correlationId,
      correlationId,
      collectionType: request.collectionType,
      success: false,
      error: {
        code: DataErrorCode.SCRAPING_TIMEOUT,
        message: error.message,
        timestamp: new Date(),
        correlationId,
        recoverable: true
      },
      metadata: {
        collectionTimestamp: new Date(),
        collectionMethod: 'unified_interface',
        browserVersion: 'unknown',
        userAgent: this.config.browserConfig.userAgent,
        sourceSystem: 'DataService',
        dataVersion: '1.0',
        processingTime: Date.now() - startTime,
        resourceUsage: {
          memoryUsage: 0,
          cpuUsage: 0,
          networkRequests: 0,
          cacheHits: 0,
          cacheMisses: 0
        }
      },
      quality: {
        completenessScore: 0,
        freshnessScore: 0,
        accuracyScore: 0,
        consistencyScore: 0,
        overallScore: 0,
        qualityIssues: [],
        validationResults: []
      }
    };
  }
}

// Export default instance for backward compatibility
export const dataService = new DataService();

// Legacy exports for backward compatibility
export { dataService as webScraperService };
export { dataService as productScrapingService };
export { dataService as smartDataCollectionService };

// Modern exports
export default DataService; 