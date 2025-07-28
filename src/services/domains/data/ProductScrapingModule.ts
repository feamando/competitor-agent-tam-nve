/**
 * ProductScrapingModule - Product-specific scraping operations
 * Migrated from ProductScrapingService with enhanced functionality
 * 
 * Key Features:
 * - Enhanced retry logic with exponential backoff
 * - Content validation and quality checks
 * - Product snapshot creation and management
 * - Integration with productRepository
 * - Preserved backward compatibility
 */

import { logger, generateCorrelationId, trackErrorWithCorrelation, trackBusinessEvent } from '@/lib/logger';
import { createId } from '@paralleldrive/cuid2';
import { prisma } from '@/lib/prisma';

// Import types
import {
  ProductScrapingInterface,
  ProductScrapingOptions,
  ProductScrapingResult,
  ContentQuality,
  ValidationResult,
  ProductScrapingStatus,
  DataErrorCode
} from '../types/dataTypes';

import type { ProductSnapshot } from '@/types/product';
import type { WebScrapingInterface } from '../types/dataTypes';

/**
 * ProductScrapingModule Implementation
 * Consolidates product-specific scraping functionality
 */
export class ProductScrapingModule implements ProductScrapingInterface {
  private webScrapingModule: WebScrapingInterface;
  private readonly MAX_RETRIES = 3;
  private readonly MIN_CONTENT_LENGTH = 100;
  private readonly BASE_RETRY_DELAY = 1000; // 1 second

  constructor(webScrapingModule: WebScrapingInterface) {
    this.webScrapingModule = webScrapingModule;
  }

  /**
   * Enhanced product website scraping with retry logic and content validation
   * Migrated from ProductScrapingService.scrapeProductWebsite()
   */
  async scrapeProductWebsite(productId: string): Promise<ProductSnapshot> {
    const correlationId = generateCorrelationId();
    const context = { productId, correlationId, operation: 'scrapeProductWebsite' };
    
    try {
      logger.info('Product scraping started', context);
      
      const product = await this.getProductFromDatabase(productId);
      
      if (!product) {
        throw new Error(`Product ${productId} not found`);
      }

      if (!product.website) {
        throw new Error(`Product ${productId} has no website URL`);
      }

      // Enhanced scraping with retry logic
      const scrapedData = await this.scrapeWithRetry(product.website, this.MAX_RETRIES, correlationId);
      
      // Validate scraped content
      if (!scrapedData.html || scrapedData.html.length < this.MIN_CONTENT_LENGTH) {
        throw new Error(
          `Insufficient content scraped from ${product.website}. ` +
          `Got ${scrapedData.html?.length || 0} characters, minimum required: ${this.MIN_CONTENT_LENGTH}`
        );
      }

      // Create enhanced snapshot with comprehensive metadata
      const snapshot = await this.createProductSnapshot(productId, scrapedData, correlationId);

      logger.info('Product scraping completed successfully', {
        ...context,
        snapshotId: snapshot.id,
        contentLength: scrapedData.html.length,
        qualityScore: this.calculateContentQuality(scrapedData).overallScore
      });

      trackBusinessEvent('product_scraped', {
        productId,
        snapshotId: snapshot.id,
        correlationId,
        contentLength: scrapedData.html.length
      });

      return snapshot;

    } catch (error) {
      logger.error('Product scraping failed', error as Error, context);
      trackErrorWithCorrelation(error as Error, correlationId, {
        operation: 'scrapeProductWebsite',
        productId
      });
      throw error;
    }
  }

  /**
   * Scrape product by ID with options
   * Enhanced version with better error handling and validation
   */
  async scrapeProductById(productId: string, options: ProductScrapingOptions = {}): Promise<ProductSnapshot> {
    const correlationId = generateCorrelationId();
    const context = { productId, correlationId, operation: 'scrapeProductById' };

    try {
      logger.info('Starting product scraping by ID', { ...context, options });

      const product = await this.getProductFromDatabase(productId);
      if (!product?.website) {
        throw new Error(`Product ${productId} not found or has no website`);
      }

      // Use web scraping module with product-specific options
      const scrapingOptions = {
        timeout: options.timeout || 30000,
        retries: options.retries || this.MAX_RETRIES,
        retryDelay: options.retryDelay || this.BASE_RETRY_DELAY,
        userAgent: options.userAgent,
        takeScreenshot: options.takeScreenshot || false,
        enableJavaScript: options.enableJavaScript !== false,
        blockedResourceTypes: options.blockedResourceTypes || ['image', 'font', 'media']
      };

      const scrapedData = await this.webScrapingModule.scrapeUrl(product.website, scrapingOptions);

      // Enhanced validation if requested
      if (options.validateContent) {
        const validationResult = await this.validateScrapedContent(scrapedData, options);
        if (!validationResult.valid) {
          throw new Error(`Content validation failed: ${validationResult.error}`);
        }
      }

      // Create snapshot with enhanced metadata
      const snapshot = await this.createProductSnapshot(productId, scrapedData, correlationId, options);

      logger.info('Product scraping by ID completed', {
        ...context,
        snapshotId: snapshot.id,
        contentLength: scrapedData.html?.length || 0
      });

      return snapshot;

    } catch (error) {
      logger.error('Product scraping by ID failed', error as Error, context);
      throw error;
    }
  }

  /**
   * Ensure recent product data exists, scrape if needed
   * Preserves existing freshness validation logic
   */
  async ensureRecentProductData(productId: string): Promise<boolean> {
    const correlationId = generateCorrelationId();
    const context = { productId, correlationId, operation: 'ensureRecentProductData' };

    try {
      logger.info('Checking product data freshness', context);

      const recentSnapshot = await this.getRecentProductSnapshot(productId);
      const now = new Date();
      const freshnessThreshold = 24 * 60 * 60 * 1000; // 24 hours

      if (recentSnapshot && (now.getTime() - recentSnapshot.createdAt.getTime()) < freshnessThreshold) {
        logger.info('Product data is fresh, no scraping needed', {
          ...context,
          lastScrapedAt: recentSnapshot.createdAt,
          ageHours: (now.getTime() - recentSnapshot.createdAt.getTime()) / (60 * 60 * 1000)
        });
        return true;
      }

      logger.info('Product data is stale, triggering fresh scrape', {
        ...context,
        lastScrapedAt: recentSnapshot?.createdAt,
        ageHours: recentSnapshot ? (now.getTime() - recentSnapshot.createdAt.getTime()) / (60 * 60 * 1000) : null
      });

      await this.scrapeProductWebsite(productId);
      return true;

    } catch (error) {
      logger.error('Failed to ensure recent product data', error as Error, context);
      return false;
    }
  }

  /**
   * Validate product data quality and completeness
   */
  async validateProductData(productId: string): Promise<ValidationResult> {
    const correlationId = generateCorrelationId();
    
    try {
      const recentSnapshot = await this.getRecentProductSnapshot(productId);
      
      if (!recentSnapshot) {
        return {
          field: 'snapshot',
          valid: false,
          error: 'No recent product snapshot found',
          suggestion: 'Run product scraping to generate fresh data'
        };
      }

      const content = recentSnapshot.content as any;
      const validationChecks = [
        {
          field: 'html',
          condition: content?.html && content.html.length > this.MIN_CONTENT_LENGTH,
          error: `HTML content too short (${content?.html?.length || 0} chars, minimum ${this.MIN_CONTENT_LENGTH})`
        },
        {
          field: 'title',
          condition: content?.title && content.title.length > 0,
          error: 'Missing page title'
        },
        {
          field: 'text',
          condition: content?.text && content.text.length > 50,
          error: 'Insufficient text content extracted'
        }
      ];

      const failedCheck = validationChecks.find(check => !check.condition);
      
      if (failedCheck) {
        return {
          field: failedCheck.field,
          valid: false,
          error: failedCheck.error,
          suggestion: 'Re-run product scraping to get better content'
        };
      }

      return {
        field: 'all',
        valid: true
      };

    } catch (error) {
      logger.error('Product data validation failed', error as Error, { productId, correlationId });
      return {
        field: 'validation',
        valid: false,
        error: (error as Error).message
      };
    }
  }

  /**
   * Scrape multiple products in batch
   */
  async scrapeMultipleProducts(productIds: string[]): Promise<ProductSnapshot[]> {
    const correlationId = generateCorrelationId();
    const context = { productIds, correlationId, operation: 'scrapeMultipleProducts' };

    try {
      logger.info('Starting batch product scraping', {
        ...context,
        productCount: productIds.length
      });

      const results: ProductSnapshot[] = [];
      const batchSize = 3; // Process in small batches to avoid overwhelming

      for (let i = 0; i < productIds.length; i += batchSize) {
        const batch = productIds.slice(i, i + batchSize);
        const batchPromises = batch.map(productId => 
          this.scrapeProductById(productId).catch(error => {
            logger.error(`Batch scraping failed for product ${productId}`, error);
            return null;
          })
        );

        const batchResults = await Promise.allSettled(batchPromises);
        batchResults.forEach(result => {
          if (result.status === 'fulfilled' && result.value) {
            results.push(result.value);
          }
        });

        // Small delay between batches
        if (i + batchSize < productIds.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      logger.info('Batch product scraping completed', {
        ...context,
        totalProducts: productIds.length,
        successfulScrapes: results.length
      });

      return results;

    } catch (error) {
      logger.error('Batch product scraping failed', error as Error, context);
      throw error;
    }
  }

  /**
   * Get current product scraping status and metrics
   */
  async getProductScrapingStatus(): Promise<ProductScrapingStatus> {
    try {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      const [totalProducts, recentSnapshots, todaySnapshots] = await Promise.all([
        prisma.product.count(),
        prisma.productSnapshot.count({
          where: {
            createdAt: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
            }
          }
        }),
        prisma.productSnapshot.count({
          where: {
            createdAt: {
              gte: todayStart
            }
          }
        })
      ]);

      // Calculate approximate metrics
      const failureRate = Math.max(0, (totalProducts - recentSnapshots) / totalProducts * 100);
      const averageTime = 15000; // Approximate average scraping time

      return {
        activeProducts: 0, // Not tracking active scraping currently
        queuedProducts: 0, // Not using queues currently
        completedToday: todaySnapshots,
        failureRate,
        averageTime
      };

    } catch (error) {
      logger.error('Failed to get product scraping status', error as Error);
      throw error;
    }
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  private async scrapeWithRetry(url: string, maxRetries: number, correlationId: string): Promise<any> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.info(`Product scraping attempt ${attempt}`, {
          url,
          correlationId,
          attempt,
          maxRetries
        });

        const result = await this.webScrapingModule.scrapeUrl(url, {
          timeout: 30000,
          retries: 1, // Single attempt per retry cycle
          takeScreenshot: false,
          enableJavaScript: true
        });

        return result;

      } catch (error) {
        lastError = error as Error;
        logger.warn(`Product scraping attempt ${attempt} failed`, {
          url,
          correlationId,
          attempt,
          maxRetries,
          error: lastError.message
        });

        if (attempt < maxRetries) {
          const delay = this.BASE_RETRY_DELAY * Math.pow(2, attempt - 1);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error(`All ${maxRetries} scraping attempts failed`);
  }

  private async createProductSnapshot(
    productId: string, 
    scrapedData: any, 
    correlationId: string,
    options?: ProductScrapingOptions
  ): Promise<ProductSnapshot> {
    const contentQuality = this.calculateContentQuality(scrapedData);
    
    const snapshotData = {
      id: createId(),
      productId,
      content: {
        html: scrapedData.html,
        text: scrapedData.text,
        title: scrapedData.title,
        description: this.extractDescription(scrapedData.html),
        url: scrapedData.url,
        timestamp: new Date()
      },
      metadata: {
        scrapedAt: new Date().toISOString(),
        correlationId,
        url: scrapedData.url,
        contentLength: scrapedData.html?.length || 0,
        scrapingDuration: scrapedData.timing?.totalTime || 0,
        textLength: scrapedData.text?.length || 0,
        titleLength: scrapedData.title?.length || 0,
        scrapingMethod: 'enhanced_retry',
        validationPassed: contentQuality.overallScore > 70,
        retryCount: 0,
        headers: scrapedData.responseHeaders || {},
        statusCode: scrapedData.responseCode || 200,
        lastModified: scrapedData.responseHeaders?.['last-modified'],
        scrapingTimestamp: new Date(),
        htmlLength: scrapedData.html?.length || 0,
        qualityScore: contentQuality.overallScore,
        contentQuality
      }
    };

    const snapshot = await prisma.productSnapshot.create({
      data: snapshotData
    });

    return snapshot;
  }

  private calculateContentQuality(scrapedData: any): ContentQuality {
    const html = scrapedData.html || '';
    const text = scrapedData.text || '';
    const title = scrapedData.title || '';

    let completeness = 0;
    let accuracy = 90; // Assume high accuracy for successful scrapes
    let freshness = 100; // Freshly scraped
    let consistency = 85; // Assume good consistency

    // Completeness scoring
    if (html.length > this.MIN_CONTENT_LENGTH) completeness += 40;
    if (text.length > 100) completeness += 30;
    if (title.length > 0) completeness += 20;
    if (html.includes('<meta')) completeness += 10;

    const issues: string[] = [];
    if (html.length < this.MIN_CONTENT_LENGTH) {
      issues.push(`Low HTML content (${html.length} chars)`);
    }
    if (text.length < 100) {
      issues.push(`Low text content (${text.length} chars)`);
    }
    if (!title) {
      issues.push('Missing page title');
    }

    return {
      completeness,
      accuracy,
      freshness,
      consistency,
      overallScore: (completeness + accuracy + freshness + consistency) / 4,
      issues
    };
  }

  private async validateScrapedContent(scrapedData: any, options: ProductScrapingOptions): Promise<ValidationResult> {
    const html = scrapedData.html || '';
    const minLength = options.minContentLength || this.MIN_CONTENT_LENGTH;

    if (html.length < minLength) {
      return {
        field: 'content_length',
        valid: false,
        error: `Content too short: ${html.length} chars, minimum ${minLength}`,
        suggestion: 'Check if website loaded properly or increase timeout'
      };
    }

    if (!scrapedData.title) {
      return {
        field: 'title',
        valid: false,
        warning: 'No page title found',
        suggestion: 'Page might not have loaded completely'
      };
    }

    return {
      field: 'all',
      valid: true
    };
  }

  private extractDescription(html: string): string {
    // Extract meta description or first paragraph
    const metaDescMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["'][^>]*>/i);
    if (metaDescMatch) {
      return metaDescMatch[1];
    }

    const pMatch = html.match(/<p[^>]*>([^<]+)</i);
    if (pMatch) {
      return pMatch[1].substring(0, 200);
    }

    return '';
  }

  private async getProductFromDatabase(productId: string) {
    return await prisma.product.findUnique({
      where: { id: productId }
    });
  }

  private async getRecentProductSnapshot(productId: string) {
    return await prisma.productSnapshot.findFirst({
      where: { productId },
      orderBy: { createdAt: 'desc' }
    });
  }
} 