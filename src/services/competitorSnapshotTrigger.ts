import { prisma } from '@/lib/prisma';
import { logger, generateCorrelationId, trackCorrelation, trackError } from '@/lib/logger';
import { WebsiteScraper } from '@/lib/scraper';
import { SnapshotFreshnessService } from './snapshotFreshnessService';

/**
 * CompetitorSnapshotTrigger - Handles automatic snapshot collection for new competitors
 * Task 3.2: Add post-creation hook to trigger immediate snapshot collection
 * Task 3.3: Implement async snapshot triggering to avoid blocking competitor creation
 * Task 3.4: Add error handling and retry logic for failed initial snapshots
 */

export interface SnapshotTriggerOptions {
  competitorId: string;
  priority?: 'high' | 'normal' | 'low';
  retryAttempts?: number;
  delayMs?: number;
  correlationId?: string;
}

export interface SnapshotTriggerResult {
  success: boolean;
  snapshotId?: string;
  error?: string;
  retryCount: number;
  totalDuration?: number;
}

export class CompetitorSnapshotTrigger {
  private static instance: CompetitorSnapshotTrigger;
  private retryQueue: Map<string, SnapshotTriggerOptions> = new Map();

  /**
   * Get singleton instance
   */
  public static getInstance(): CompetitorSnapshotTrigger {
    if (!CompetitorSnapshotTrigger.instance) {
      CompetitorSnapshotTrigger.instance = new CompetitorSnapshotTrigger();
    }
    return CompetitorSnapshotTrigger.instance;
  }

  /**
   * Task 3.2 & 3.3: Trigger immediate async snapshot collection for a new competitor
   * Task 6.1: Enhanced with fresh snapshot pre-check to skip unnecessary collections
   * This method returns immediately without blocking the competitor creation
   */
  public async triggerImmediateSnapshot(options: SnapshotTriggerOptions): Promise<void> {
    const {
      competitorId,
      priority = 'high', // New competitors get high priority
      retryAttempts = 3,
      delayMs = 0,
      correlationId = generateCorrelationId()
    } = options;

    const logContext = {
      operation: 'triggerImmediateSnapshot',
      competitorId,
      priority,
      correlationId
    };

    try {
      logger.info('Triggering immediate snapshot for competitor', logContext);

      // Task 6.1: Pre-check if snapshot is already fresh to avoid unnecessary work
      const shouldSkip = await this.shouldSkipFreshSnapshot(competitorId, correlationId);
      
      if (shouldSkip.skip) {
        logger.info('Skipping fresh snapshot collection - optimization', {
          ...logContext,
          reason: shouldSkip.reason,
          ageInDays: shouldSkip.ageInDays,
          optimizationSaved: true
        });

        // Task 6.3: Log performance optimization
        this.logSkippedOperation(competitorId, shouldSkip, correlationId);
        
        trackCorrelation(correlationId, 'snapshot_skipped_fresh_optimization', {
          ...logContext,
          ageInDays: shouldSkip.ageInDays,
          reason: shouldSkip.reason
        });
        
        return; // Exit early - no processing needed
      }

      // Task 3.3: Use async processing to avoid blocking
      setImmediate(() => {
        this.processSnapshotAsync({
          competitorId,
          priority,
          retryAttempts,
          delayMs,
          correlationId
        }).catch(error => {
          logger.error('Async snapshot processing failed', error as Error, logContext);
        });
      });

      trackCorrelation(correlationId, 'immediate_snapshot_triggered', logContext);
      logger.debug('Immediate snapshot trigger queued', logContext);

    } catch (error) {
      logger.error('Failed to trigger immediate snapshot', error as Error, logContext);
      trackError(error as Error, 'snapshot_trigger', logContext);
    }
  }

  /**
   * Task 3.3: Process snapshot collection asynchronously
   */
  private async processSnapshotAsync(options: SnapshotTriggerOptions): Promise<SnapshotTriggerResult> {
    const {
      competitorId,
      priority = 'normal',
      retryAttempts = 3,
      delayMs = 0,
      correlationId = generateCorrelationId()
    } = options;

    const startTime = Date.now();
    const logContext = {
      operation: 'processSnapshotAsync',
      competitorId,
      priority,
      correlationId
    };

    try {
      logger.info('Starting async snapshot processing', logContext);

      // Add delay if specified (for retry scenarios)
      if (delayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
        logger.debug('Delay completed before snapshot processing', { ...logContext, delayMs });
      }

      // Get competitor details
      const competitor = await prisma.competitor.findUnique({
        where: { id: competitorId },
        select: {
          id: true,
          name: true,
          website: true
        }
      });

      if (!competitor) {
        const error = `Competitor not found: ${competitorId}`;
        logger.error(error, undefined as any, logContext);
        return {
          success: false,
          error,
          retryCount: 0
        };
      }

      // Attempt snapshot collection with retry logic
      const result = await this.attemptSnapshotWithRetry(competitor, retryAttempts, correlationId);

      const totalDuration = Date.now() - startTime;
      logger.info('Async snapshot processing completed', {
        ...logContext,
        success: result.success,
        retryCount: result.retryCount,
        totalDuration
      });

      trackCorrelation(correlationId, 'async_snapshot_completed', {
        ...logContext,
        success: result.success,
        totalDuration
      });

      return {
        ...result,
        totalDuration
      };

    } catch (error) {
      const totalDuration = Date.now() - startTime;
      logger.error('Async snapshot processing failed', error as Error, {
        ...logContext,
        totalDuration
      });

      trackError(error as Error, 'async_snapshot_processing', logContext);

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        retryCount: 0,
        totalDuration
      };
    }
  }

  /**
   * Task 3.4: Attempt snapshot collection with retry logic
   */
  private async attemptSnapshotWithRetry(
    competitor: { id: string; name: string; website: string },
    maxRetries: number,
    correlationId: string
  ): Promise<SnapshotTriggerResult> {
    const logContext = {
      operation: 'attemptSnapshotWithRetry',
      competitorId: competitor.id,
      competitorName: competitor.name,
      maxRetries,
      correlationId
    };

    let lastError: string | undefined;
    let retryCount = 0;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        logger.debug('Attempting snapshot collection', {
          ...logContext,
          attempt: attempt + 1,
          totalAttempts: maxRetries + 1
        });

        const result = await this.collectSnapshot(competitor, correlationId);

        if (result.success) {
          logger.info('Snapshot collection successful', {
            ...logContext,
            snapshotId: result.snapshotId,
            attemptNumber: attempt + 1,
            retryCount: attempt
          });

          return {
            success: true,
            ...(result.snapshotId && { snapshotId: result.snapshotId }),
            retryCount: attempt
          };
        } else {
          lastError = result.error;
          retryCount = attempt;
        }

      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        retryCount = attempt;
        
        logger.warn('Snapshot collection attempt failed', error as Error, {
          ...logContext,
          attempt: attempt + 1,
          error: lastError
        });
      }

      // Apply exponential backoff for retries
      if (attempt < maxRetries) {
        const backoffDelay = Math.min(1000 * Math.pow(2, attempt), 30000); // Max 30 seconds
        logger.debug('Applying retry backoff', {
          ...logContext,
          nextAttempt: attempt + 2,
          backoffDelay
        });
        
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
      }
    }

    // All attempts failed
    logger.error('All snapshot collection attempts failed', undefined, {
      ...logContext,
      totalAttempts: maxRetries + 1,
      finalError: lastError
    });

    // Log failed attempt to database for monitoring
    await this.logFailedSnapshot(competitor.id, lastError || 'Unknown error', retryCount, correlationId);

    return {
      success: false,
      error: lastError || 'Unknown error after all retry attempts',
      retryCount
    };
  }

  /**
   * Collect snapshot for a competitor
   */
  private async collectSnapshot(
    competitor: { id: string; name: string; website: string },
    correlationId: string
  ): Promise<{ success: boolean; snapshotId?: string; error?: string }> {
    const logContext = {
      operation: 'collectSnapshot',
      competitorId: competitor.id,
      competitorName: competitor.name,
      website: competitor.website,
      correlationId
    };

    let scraper: WebsiteScraper | null = null;

    try {
      logger.debug('Starting website scraping', logContext);

      scraper = new WebsiteScraper();
      const snapshot = await scraper.takeSnapshot(competitor.website);

      logger.debug('Website scraping completed, saving to database', {
        ...logContext,
        snapshotSize: JSON.stringify(snapshot).length,
        hasContent: !!(snapshot.html && snapshot.text),
        statusCode: snapshot.metadata?.statusCode
      });

      // Save snapshot to database
      const savedSnapshot = await prisma.snapshot.create({
        data: {
          competitorId: competitor.id,
          metadata: JSON.parse(JSON.stringify(snapshot)),
          captureStartTime: new Date(),
          captureEndTime: new Date(),
          captureSuccess: true,
          captureSize: JSON.stringify(snapshot).length
        }
      });

      logger.info('Snapshot collected and saved successfully', {
        ...logContext,
        snapshotId: savedSnapshot.id,
        captureSize: savedSnapshot.captureSize
      });

      trackCorrelation(correlationId, 'snapshot_collected_successfully', {
        ...logContext,
        snapshotId: savedSnapshot.id
      });

      return {
        success: true,
        snapshotId: savedSnapshot.id
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      logger.error('Snapshot collection failed', error as Error, logContext);
      trackError(error as Error, 'snapshot_collection', logContext);

      return {
        success: false,
        error: errorMessage
      };

    } finally {
      if (scraper) {
        try {
          await scraper.close();
        } catch (closeError) {
          logger.warn('Failed to close scraper', closeError as Error, logContext);
        }
      }
    }
  }

  /**
   * Task 3.4: Log failed snapshot attempts for monitoring and analysis
   */
  private async logFailedSnapshot(
    competitorId: string, 
    error: string, 
    retryCount: number, 
    correlationId: string
  ): Promise<void> {
    const logContext = {
      operation: 'logFailedSnapshot',
      competitorId,
      error,
      retryCount,
      correlationId
    };

    try {
      await prisma.snapshot.create({
        data: {
          competitorId,
          metadata: {
            error,
            status: 'failed',
            timestamp: new Date(),
            retryCount,
            correlationId,
            errorType: 'initial_snapshot_failed'
          },
          captureStartTime: new Date(),
          captureSuccess: false,
          errorMessage: error
        }
      });

      logger.info('Failed snapshot attempt logged to database', logContext);

    } catch (dbError) {
      logger.error('Failed to log failed snapshot to database', dbError as Error, logContext);
    }
  }

  /**
   * Get retry queue status (for monitoring)
   */
  public getRetryQueueStatus(): {
    queueSize: number;
    pendingCompetitors: string[];
  } {
    return {
      queueSize: this.retryQueue.size,
      pendingCompetitors: Array.from(this.retryQueue.keys())
    };
  }

  /**
   * Batch trigger snapshots for multiple competitors (useful for project setup)
   * Task 6.1: Enhanced with batch fresh snapshot optimization
   */
  public async triggerBatchSnapshots(
    competitorIds: string[],
    options: Partial<SnapshotTriggerOptions> = {}
  ): Promise<void> {
    const correlationId = options.correlationId || generateCorrelationId();
    const logContext = {
      operation: 'triggerBatchSnapshots',
      competitorCount: competitorIds.length,
      correlationId
    };

    logger.info('Triggering batch snapshots with optimization', logContext);

    let skippedCount = 0;
    let processedCount = 0;

    // Task 6.1: Pre-filter fresh snapshots for batch optimization
    const competitorsToProcess = [];
    
    for (const competitorId of competitorIds) {
      const shouldSkip = await this.shouldSkipFreshSnapshot(competitorId, correlationId);
      
      if (shouldSkip.skip) {
        skippedCount++;
        this.logSkippedOperation(competitorId, shouldSkip, correlationId);
      } else {
        competitorsToProcess.push(competitorId);
      }
    }

    logger.info('Batch snapshot optimization completed', {
      ...logContext,
      totalCompetitors: competitorIds.length,
      skippedFresh: skippedCount,
      toProcess: competitorsToProcess.length,
      optimizationRatio: Math.round((skippedCount / competitorIds.length) * 100)
    });

    // Stagger the triggers to avoid overwhelming the system
    for (let i = 0; i < competitorsToProcess.length; i++) {
      const competitorId = competitorsToProcess[i];
      
      // Add a small delay between triggers
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Direct call to processSnapshotAsync to bypass fresh check (already done)
      setImmediate(() => {
        this.processSnapshotAsync({
          competitorId,
          priority: options.priority || 'normal',
          retryAttempts: options.retryAttempts || 3,
          delayMs: options.delayMs || 0,
          correlationId
        }).catch(error => {
          logger.error('Batch snapshot processing failed', error as Error, {
            competitorId,
            correlationId
          });
        });
      });

      processedCount++;
    }

    logger.info('Batch snapshot triggers completed', {
      ...logContext,
      processedCount,
      skippedCount,
      totalEfficiency: Math.round(((skippedCount) / competitorIds.length) * 100)
    });
  }

  /**
   * Task 6.1: Check if snapshot should be skipped due to freshness
   * Task 6.2: Implements caching mechanism for recent freshness checks
   */
  private async shouldSkipFreshSnapshot(
    competitorId: string, 
    correlationId: string,
    maxAgeInDays: number = 7
  ): Promise<{
    skip: boolean;
    reason?: string;
    ageInDays?: number;
    cacheHit?: boolean;
  }> {
    const logContext = {
      operation: 'shouldSkipFreshSnapshot',
      competitorId,
      maxAgeInDays,
      correlationId
    };

    try {
      // Task 6.2: Check cache first for recent freshness checks
      const cachedResult = await this.getCachedFreshnessCheck(competitorId);
      
      if (cachedResult) {
        logger.debug('Using cached freshness check', {
          ...logContext,
          cacheAge: Date.now() - cachedResult.checkedAt.getTime(),
          cachedResult: cachedResult.isFresh
        });

        return {
          skip: cachedResult.isFresh,
          reason: cachedResult.isFresh ? 'Fresh snapshot (cached)' : 'Stale snapshot (cached)',
          ageInDays: cachedResult.ageInDays,
          cacheHit: true
        };
      }

      // Use SnapshotFreshnessService for fresh check
      const freshnessService = SnapshotFreshnessService.getInstance();
      const freshnessResult = await freshnessService.isSnapshotFresh(competitorId, maxAgeInDays);

      // Task 6.2: Cache the result for future use
      await this.cacheFreshnessCheck(competitorId, freshnessResult);

      const shouldSkip = freshnessResult.isFresh;
      
      logger.debug('Fresh snapshot check completed', {
        ...logContext,
        isFresh: freshnessResult.isFresh,
        ageInDays: freshnessResult.ageInDays,
        shouldSkip
      });

      return {
        skip: shouldSkip,
        reason: freshnessResult.reason,
        ageInDays: freshnessResult.ageInDays,
        cacheHit: false
      };

    } catch (error) {
      logger.error('Failed to check snapshot freshness', error as Error, logContext);
      
      // On error, don't skip (safer to collect than miss)
      return {
        skip: false,
        reason: 'Error checking freshness - proceeding with collection'
      };
    }
  }

  /**
   * Task 6.2: Cache freshness check results to avoid repeated database queries
   */
  private freshnessCache = new Map<string, {
    competitorId: string;
    isFresh: boolean;
    ageInDays: number;
    checkedAt: Date;
  }>();

  private async getCachedFreshnessCheck(competitorId: string): Promise<{
    isFresh: boolean;
    ageInDays: number;
    checkedAt: Date;
  } | null> {
    const cached = this.freshnessCache.get(competitorId);
    
    if (!cached) {
      return null;
    }

    // Cache expires after 5 minutes
    const cacheAge = Date.now() - cached.checkedAt.getTime();
    const CACHE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
    
    if (cacheAge > CACHE_EXPIRY_MS) {
      this.freshnessCache.delete(competitorId);
      return null;
    }

    return {
      isFresh: cached.isFresh,
      ageInDays: cached.ageInDays,
      checkedAt: cached.checkedAt
    };
  }

  private async cacheFreshnessCheck(
    competitorId: string, 
    freshnessResult: { isFresh: boolean; ageInDays: number }
  ): Promise<void> {
    this.freshnessCache.set(competitorId, {
      competitorId,
      isFresh: freshnessResult.isFresh,
      ageInDays: freshnessResult.ageInDays,
      checkedAt: new Date()
    });

    // Clean up old cache entries periodically
    if (this.freshnessCache.size > 1000) {
      this.cleanupFreshnessCache();
    }
  }

  private cleanupFreshnessCache(): void {
    const CACHE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
    const now = Date.now();

    for (const [competitorId, cached] of this.freshnessCache.entries()) {
      const cacheAge = now - cached.checkedAt.getTime();
      
      if (cacheAge > CACHE_EXPIRY_MS) {
        this.freshnessCache.delete(competitorId);
      }
    }
  }

  /**
   * Task 6.3: Log performance optimization for skipped snapshot operations
   */
  private logSkippedOperation(
    competitorId: string,
    skipInfo: { skip: boolean; reason?: string; ageInDays?: number; cacheHit?: boolean },
    correlationId: string
  ): void {
    const logContext = {
      operation: 'logSkippedOperation',
      competitorId,
      correlationId,
      optimizationMetrics: {
        skipped: skipInfo.skip,
        reason: skipInfo.reason,
        snapshotAge: skipInfo.ageInDays,
        cacheHit: skipInfo.cacheHit,
        timestamp: new Date().toISOString()
      }
    };

    logger.info('Snapshot operation skipped - performance optimization', logContext);

    // Task 6.4: Track metrics for dashboard
    trackCorrelation(correlationId, 'snapshot_optimization_skip', {
      ...logContext,
      performanceGain: true,
      resourcesSaved: true
    });
  }

  /**
   * Task 6.4: Get snapshot efficiency metrics for dashboard tracking
   */
  public getEfficiencyMetrics(): {
    cacheSize: number;
    cacheHitRatio: number;
    optimizationStats: {
      totalChecks: number;
      skippedOperations: number;
      efficiencyRate: number;
    };
  } {
    // This would be enhanced with actual metrics collection in a production system
    return {
      cacheSize: this.freshnessCache.size,
      cacheHitRatio: 0, // Would track actual cache hits vs misses
      optimizationStats: {
        totalChecks: 0, // Would track from metrics
        skippedOperations: 0, // Would track from metrics
        efficiencyRate: 0 // Percentage of operations optimized away
      }
    };
  }

  /**
   * Clear freshness cache (useful for testing or reset)
   */
  public clearFreshnessCache(): void {
    this.freshnessCache.clear();
    logger.info('Freshness cache cleared');
  }
} 