/**
 * Smart Scheduling Service - Phase 1.2 Implementation
 * Intelligent snapshot scheduling with condition-based triggering
 * 
 * Features:
 * - 7-day freshness threshold for snapshots
 * - Immediate scraping for missing snapshots  
 * - Priority-based task scheduling
 * - Comprehensive error handling and correlation tracking
 * - Optimized resource usage
 */

import { logger, generateCorrelationId, trackErrorWithCorrelation, trackPerformance } from '@/lib/logger';
import { ProductScrapingService } from './productScrapingService';
import { WebScraperService } from './webScraper';
import prisma from '@/lib/prisma';
import { getCompetitorsWithoutSnapshots } from '@/utils/snapshotHelpers';
import { CompetitorSnapshotTrigger } from './competitorSnapshotTrigger';
import { SnapshotFreshnessService } from './snapshotFreshnessService';

// Smart Scheduling interfaces
export interface ScrapingTask {
  type: 'PRODUCT' | 'COMPETITOR';
  targetId: string;
  reason: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  url?: string;
  targetName?: string;
}

export interface ScrapingNeed {
  required: boolean;
  reason: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface ScrapingStatus {
  triggered: boolean;
  tasksExecuted: number;
  results: ScrapingTaskResult[];
}

export interface ScrapingTaskResult {
  taskType: 'PRODUCT' | 'COMPETITOR';
  targetId: string;
  success: boolean;
  snapshotId?: string;
  error?: string;
  duration: number;
  correlationId: string;
}

export interface ProjectFreshnessStatus {
  projectId: string;
  projectName: string;
  products: {
    id: string;
    name: string;
    needsScraping: boolean;
    lastSnapshot?: Date;
    daysSinceLastSnapshot?: number;
    reason: string;
  }[];
  competitors: {
    id: string;
    name: string;
    needsScraping: boolean;
    lastSnapshot?: Date;
    daysSinceLastSnapshot?: number;
    reason: string;
  }[];
  overallStatus: 'FRESH' | 'STALE' | 'MISSING_DATA';
  recommendedActions: string[];
}

export class SmartSchedulingService {
  private readonly FRESHNESS_THRESHOLD_DAYS = 7;
  private readonly HIGH_PRIORITY_THRESHOLD_DAYS = 14;
  private readonly TASK_EXECUTION_DELAY = 2000; // 2 seconds between tasks
  
  private productScrapingService: ProductScrapingService;
  private webScraperService: WebScraperService;

  constructor() {
    this.productScrapingService = new ProductScrapingService();
    this.webScraperService = new WebScraperService();
  }

  /**
   * Main smart scheduling method - checks and triggers scraping based on freshness
   * Phase 1.2 core implementation
   */
  public async checkAndTriggerScraping(projectId: string): Promise<ScrapingStatus> {
    const correlationId = generateCorrelationId();
    const context = { projectId, correlationId, operation: 'smartScheduling' };

    try {
      logger.info('Smart scheduling check started', context);

      // Get project details
      const project = await prisma.project.findUnique({
        where: { id: projectId }
      });

      if (!project) {
        throw new Error(`Project ${projectId} not found`);
      }

      const scrapingTasks: ScrapingTask[] = [];

      // Check product snapshots separately to avoid Prisma include issues
      const products = await prisma.product.findMany({
        where: { projectId }
      });

      for (const product of products) {
        const latestSnapshot = await prisma.productSnapshot.findFirst({
          where: { productId: product.id },
          orderBy: { createdAt: 'desc' }
        });

        const needsScraping = this.needsScrapingCheck(latestSnapshot, 'PRODUCT');
        if (needsScraping.required) {
          scrapingTasks.push({
            type: 'PRODUCT',
            targetId: product.id,
            reason: needsScraping.reason,
            priority: needsScraping.priority,
            url: product.website,
            targetName: product.name
          });
        }
      }

      // Check competitor snapshots separately
      const competitors = await prisma.competitor.findMany({
        where: { 
          projects: {
            some: { id: projectId }
          }
        }
      });

      for (const competitor of competitors) {
        const latestSnapshot = await prisma.snapshot.findFirst({
          where: { competitorId: competitor.id },
          orderBy: { createdAt: 'desc' }
        });

        const needsScraping = this.needsScrapingCheck(latestSnapshot, 'COMPETITOR');
        if (needsScraping.required) {
          scrapingTasks.push({
            type: 'COMPETITOR',
            targetId: competitor.id,
            reason: needsScraping.reason,
            priority: needsScraping.priority,
            url: competitor.website,
            targetName: competitor.name
          });
        }
      }

      // Execute scraping tasks if needed
      if (scrapingTasks.length > 0) {
        logger.info('Triggering smart scraping', {
          ...context,
          taskCount: scrapingTasks.length,
          tasks: scrapingTasks.map(t => ({ 
            type: t.type, 
            targetName: t.targetName, 
            priority: t.priority, 
            reason: t.reason 
          }))
        });

        const results = await this.executeScrapingTasks(scrapingTasks, correlationId);
        
        logger.info('Smart scraping completed', {
          ...context,
          tasksExecuted: scrapingTasks.length,
          successfulTasks: results.filter(r => r.success).length,
          failedTasks: results.filter(r => !r.success).length
        });

        return {
          triggered: true,
          tasksExecuted: scrapingTasks.length,
          results
        };
      }

      logger.info('No scraping needed - data is fresh', context);
      return { triggered: false, tasksExecuted: 0, results: [] };

    } catch (error) {
      trackErrorWithCorrelation(
        error as Error,
        'checkAndTriggerScraping',
        correlationId,
        {
          ...context,
          service: 'SmartSchedulingService',
          method: 'checkAndTriggerScraping',
          isRecoverable: false,
          suggestedAction: 'Check project data and database connectivity'
        }
      );
      throw error;
    }
  }

  /**
   * Evaluates whether scraping is needed based on snapshot age and existence
   * Core intelligence for smart scheduling
   */
  private needsScrapingCheck(latestSnapshot: any, type: 'PRODUCT' | 'COMPETITOR'): ScrapingNeed {
    // No snapshot exists - immediate scraping required
    if (!latestSnapshot) {
      return {
        required: true,
        reason: `No ${type} snapshot exists`,
        priority: 'HIGH'
      };
    }

    // Check freshness based on 7-day threshold
    const snapshotAge = Date.now() - new Date(latestSnapshot.createdAt).getTime();
    const daysSinceSnapshot = snapshotAge / (1000 * 60 * 60 * 24);

    if (daysSinceSnapshot > this.FRESHNESS_THRESHOLD_DAYS) {
      return {
        required: true,
        reason: `${type} snapshot is ${Math.round(daysSinceSnapshot)} days old (exceeds ${this.FRESHNESS_THRESHOLD_DAYS} day threshold)`,
        priority: daysSinceSnapshot > this.HIGH_PRIORITY_THRESHOLD_DAYS ? 'HIGH' : 'MEDIUM'
      };
    }

    return {
      required: false,
      reason: `${type} snapshot is fresh (${Math.round(daysSinceSnapshot)} days old)`,
      priority: 'LOW'
    };
  }

  /**
   * Executes scraping tasks with priority ordering and error handling
   * Implements optimized resource usage with delays between tasks
   */
  private async executeScrapingTasks(
    tasks: ScrapingTask[], 
    correlationId: string
  ): Promise<ScrapingTaskResult[]> {
    const results: ScrapingTaskResult[] = [];
    
    // Sort tasks by priority: HIGH -> MEDIUM -> LOW
    const priorityOrder = { 'HIGH': 0, 'MEDIUM': 1, 'LOW': 2 };
    const sortedTasks = tasks.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    for (const [index, task] of sortedTasks.entries()) {
      const taskContext = {
        correlationId,
        taskType: task.type,
        targetId: task.targetId,
        targetName: task.targetName,
        priority: task.priority,
        operation: 'executeScrapingTask'
      };

      const startTime = Date.now();

      try {
        logger.info(`Executing scraping task ${index + 1}/${sortedTasks.length}`, taskContext);

        let snapshotId: string | undefined;

        if (task.type === 'PRODUCT') {
          // Use enhanced ProductScrapingService from Phase 1.1
          const snapshot = await this.productScrapingService.scrapeProductById(task.targetId);
          snapshotId = snapshot.id;
        } else {
          // Use WebScraperService for competitors
          snapshotId = await this.webScraperService.scrapeCompetitor(task.targetId);
        }

        const duration = Date.now() - startTime;

        const result: ScrapingTaskResult = {
          taskType: task.type,
          targetId: task.targetId,
          success: true,
          snapshotId,
          duration,
          correlationId
        };

        results.push(result);

        logger.info('Scraping task completed successfully', {
          ...taskContext,
          snapshotId,
          duration
        });

        // Add delay between tasks to optimize resource usage
        if (index < sortedTasks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, this.TASK_EXECUTION_DELAY));
        }

      } catch (error) {
        const duration = Date.now() - startTime;

        const result: ScrapingTaskResult = {
          taskType: task.type,
          targetId: task.targetId,
          success: false,
          error: (error as Error).message,
          duration,
          correlationId
        };

        results.push(result);

        trackErrorWithCorrelation(
          error as Error,
          'executeScrapingTask',
          correlationId,
          {
            ...taskContext,
            service: 'SmartSchedulingService',
            method: 'executeScrapingTasks',
            retryAttempt: 1,
            maxRetries: 1,
            isRecoverable: true,
            suggestedAction: 'Individual task failed but processing continues'
          }
        );

        logger.error('Scraping task failed', {
          ...taskContext,
          error: (error as Error).message,
          duration
        });
      }
    }

    return results;
  }

  /**
   * Gets comprehensive freshness status for a project
   * Useful for monitoring and manual checks
   */
  public async getFreshnessStatus(projectId: string): Promise<ProjectFreshnessStatus> {
    const correlationId = generateCorrelationId();
    const context = { projectId, correlationId, operation: 'getFreshnessStatus' };

    try {
      logger.info('Getting project freshness status', context);

      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
          products: {
            include: {
              snapshots: {
                orderBy: { createdAt: 'desc' },
                take: 1
              }
            }
          },
          competitors: {
            include: {
              snapshots: {
                orderBy: { createdAt: 'desc' },
                take: 1
              }
            }
          }
        }
      });

      if (!project) {
        throw new Error(`Project ${projectId} not found`);
      }

      const status: ProjectFreshnessStatus = {
        projectId: project.id,
        projectName: project.name,
        products: [],
        competitors: [],
        overallStatus: 'FRESH',
        recommendedActions: []
      };

      let hasStaleData = false;
      let hasMissingData = false;

      // Analyze product freshness
      for (const product of project.products) {
        const latestSnapshot = product.snapshots[0];
        const needsScraping = this.needsScrapingCheck(latestSnapshot, 'PRODUCT');
        
        let daysSinceLastSnapshot: number | undefined;
        if (latestSnapshot) {
          const snapshotAge = Date.now() - new Date(latestSnapshot.createdAt).getTime();
          daysSinceLastSnapshot = snapshotAge / (1000 * 60 * 60 * 24);
        }

        status.products.push({
          id: product.id,
          name: product.name,
          needsScraping: needsScraping.required,
          lastSnapshot: latestSnapshot?.createdAt,
          daysSinceLastSnapshot,
          reason: needsScraping.reason
        });

        if (needsScraping.required) {
          if (!latestSnapshot) {
            hasMissingData = true;
          } else {
            hasStaleData = true;
          }
        }
      }

      // Analyze competitor freshness
      for (const competitor of project.competitors) {
        const latestSnapshot = competitor.snapshots[0];
        const needsScraping = this.needsScrapingCheck(latestSnapshot, 'COMPETITOR');
        
        let daysSinceLastSnapshot: number | undefined;
        if (latestSnapshot) {
          const snapshotAge = Date.now() - new Date(latestSnapshot.createdAt).getTime();
          daysSinceLastSnapshot = snapshotAge / (1000 * 60 * 60 * 24);
        }

        status.competitors.push({
          id: competitor.id,
          name: competitor.name,
          needsScraping: needsScraping.required,
          lastSnapshot: latestSnapshot?.createdAt,
          daysSinceLastSnapshot,
          reason: needsScraping.reason
        });

        if (needsScraping.required) {
          if (!latestSnapshot) {
            hasMissingData = true;
          } else {
            hasStaleData = true;
          }
        }
      }

      // Determine overall status and recommendations
      if (hasMissingData) {
        status.overallStatus = 'MISSING_DATA';
        status.recommendedActions.push('Immediate scraping required for missing snapshots');
      } else if (hasStaleData) {
        status.overallStatus = 'STALE';
        status.recommendedActions.push('Scheduled scraping recommended for stale data');
      } else {
        status.overallStatus = 'FRESH';
        status.recommendedActions.push('All data is fresh - no action needed');
      }

      const needsScrapingCount = status.products.filter(p => p.needsScraping).length + 
                               status.competitors.filter(c => c.needsScraping).length;

      if (needsScrapingCount > 0) {
        status.recommendedActions.push(`Run smart scheduling to update ${needsScrapingCount} stale snapshots`);
      }

      logger.info('Project freshness status completed', {
        ...context,
        overallStatus: status.overallStatus,
        productsNeedingScraping: status.products.filter(p => p.needsScraping).length,
        competitorsNeedingScraping: status.competitors.filter(c => c.needsScraping).length
      });

      return status;

    } catch (error) {
      trackErrorWithCorrelation(
        error as Error,
        'getFreshnessStatus',
        correlationId,
        {
          ...context,
          service: 'SmartSchedulingService',
          method: 'getFreshnessStatus',
          isRecoverable: false
        }
      );
      throw error;
    }
  }

  /**
   * Task 4.4: Batch processing for multiple missing snapshots
   * Efficiently handles multiple competitors without snapshots
   */
  public async triggerMissingSnapshotsBatch(projectId: string): Promise<{
    triggered: boolean;
    totalMissing: number;
    processedCount: number;
    results: Array<{ competitorId: string; success: boolean; error?: string }>;
  }> {
    const correlationId = generateCorrelationId();
    const logContext = { projectId, correlationId, operation: 'triggerMissingSnapshotsBatch' };

    try {
      logger.info('Starting batch processing for missing snapshots', logContext);

      // Task 4.2: Get competitors without snapshots
      const missingCompetitors = await getCompetitorsWithoutSnapshots(projectId);

      if (missingCompetitors.length === 0) {
        logger.info('No competitors missing snapshots', logContext);
        return {
          triggered: false,
          totalMissing: 0,
          processedCount: 0,
          results: []
        };
      }

      logger.info('Found competitors missing snapshots', {
        ...logContext,
        totalMissing: missingCompetitors.length,
        highPriority: missingCompetitors.filter(c => c.priority === 'high').length
      });

      // Task 4.4: Use CompetitorSnapshotTrigger for batch processing
      const snapshotTrigger = CompetitorSnapshotTrigger.getInstance();
      const competitorIds = missingCompetitors.map(c => c.competitorId);
      
      // Trigger batch snapshots with staggered execution
      await snapshotTrigger.triggerBatchSnapshots(competitorIds, {
        correlationId,
        priority: 'high',
        retryAttempts: 2
      });

      logger.info('Batch snapshot triggers initiated', {
        ...logContext,
        processedCount: competitorIds.length
      });

      return {
        triggered: true,
        totalMissing: missingCompetitors.length,
        processedCount: competitorIds.length,
        results: competitorIds.map(id => ({ competitorId: id, success: true }))
      };

    } catch (error) {
      logger.error('Failed to trigger missing snapshots batch', error as Error, logContext);
      trackErrorWithCorrelation(
        error as Error,
        'triggerMissingSnapshotsBatch',
        correlationId,
        logContext
      );

      return {
        triggered: false,
        totalMissing: 0,
        processedCount: 0,
        results: []
      };
    }
  }

  /**
   * Task 4.1: Enhanced method to detect and trigger missing snapshots
   * Extends existing functionality to specifically handle missing snapshots
   */
  public async checkAndTriggerMissingSnapshots(projectId: string): Promise<{
    triggered: boolean;
    missingSnapshotsFound: number;
    triggeredCount: number;
  }> {
    const correlationId = generateCorrelationId();
    const logContext = { projectId, correlationId, operation: 'checkAndTriggerMissingSnapshots' };

    try {
      logger.info('Checking for missing snapshots', logContext);

      // Get competitors without snapshots
      const missingCompetitors = await getCompetitorsWithoutSnapshots(projectId);

      if (missingCompetitors.length === 0) {
        logger.info('No missing snapshots found', logContext);
        return {
          triggered: false,
          missingSnapshotsFound: 0,
          triggeredCount: 0
        };
      }

      // Filter high priority competitors for immediate processing
      const highPriorityMissing = missingCompetitors.filter(c => c.priority === 'high');
      const competitorsToProcess = highPriorityMissing.length > 0 ? highPriorityMissing : missingCompetitors.slice(0, 5);

      logger.info('Triggering snapshots for missing competitors', {
        ...logContext,
        totalMissing: missingCompetitors.length,
        processingCount: competitorsToProcess.length,
        highPriorityCount: highPriorityMissing.length
      });

      // Use the existing CompetitorSnapshotTrigger for consistency
      const snapshotTrigger = CompetitorSnapshotTrigger.getInstance();
      
      for (const competitor of competitorsToProcess) {
        await snapshotTrigger.triggerImmediateSnapshot({
          competitorId: competitor.competitorId,
          priority: competitor.priority === 'high' ? 'high' : 'normal',
          correlationId
        });
      }

      logger.info('Missing snapshots triggered successfully', {
        ...logContext,
        triggeredCount: competitorsToProcess.length
      });

      return {
        triggered: true,
        missingSnapshotsFound: missingCompetitors.length,
        triggeredCount: competitorsToProcess.length
      };

    } catch (error) {
      logger.error('Failed to check and trigger missing snapshots', error as Error, logContext);
      trackErrorWithCorrelation(
        error as Error,
        'checkAndTriggerMissingSnapshots',
        correlationId,
        logContext
      );

      return {
        triggered: false,
        missingSnapshotsFound: 0,
        triggeredCount: 0
      };
    }
  }

  /**
   * Task 5.3: Implement automatic refresh trigger for stale snapshots (>7 days)
   * Task 5.4: Add configurable staleness threshold (defaulting to 7 days)
   */
  public async checkAndTriggerStaleSnapshots(
    projectId: string, 
    maxAgeInDays: number = 7
  ): Promise<{
    triggered: boolean;
    staleSnapshotsFound: number;
    triggeredCount: number;
    results: Array<{ competitorId: string; competitorName: string; ageInDays: number; triggered: boolean }>;
  }> {
    const correlationId = generateCorrelationId();
    const logContext = { projectId, maxAgeInDays, correlationId, operation: 'checkAndTriggerStaleSnapshots' };

    try {
      logger.info('Checking for stale snapshots', logContext);

      // Use SnapshotFreshnessService to get stale snapshots
      const freshnessService = SnapshotFreshnessService.getInstance();
      const staleSnapshots = await freshnessService.getStaleSnapshots(projectId, maxAgeInDays);

      if (staleSnapshots.length === 0) {
        logger.info('No stale snapshots found', logContext);
        return {
          triggered: false,
          staleSnapshotsFound: 0,
          triggeredCount: 0,
          results: []
        };
      }

      logger.info('Found stale snapshots, triggering refresh', {
        ...logContext,
        staleSnapshotsCount: staleSnapshots.length,
        averageAge: Math.round(staleSnapshots.reduce((sum, s) => sum + s.ageInDays, 0) / staleSnapshots.length)
      });

      // Trigger refresh for stale snapshots using batch processing
      const snapshotTrigger = CompetitorSnapshotTrigger.getInstance();
      const competitorIds = staleSnapshots.map(s => s.competitorId);
      
      // Use batch processing for efficiency
      await snapshotTrigger.triggerBatchSnapshots(competitorIds, {
        correlationId,
        priority: 'normal', // Stale snapshots get normal priority (vs high for missing)
        retryAttempts: 2
      });

      const results = staleSnapshots.map(stale => ({
        competitorId: stale.competitorId,
        competitorName: stale.competitorName,
        ageInDays: stale.ageInDays,
        triggered: true
      }));

      logger.info('Stale snapshots refresh triggered successfully', {
        ...logContext,
        triggeredCount: results.length
      });

      return {
        triggered: true,
        staleSnapshotsFound: staleSnapshots.length,
        triggeredCount: results.length,
        results
      };

    } catch (error) {
      logger.error('Failed to check and trigger stale snapshots', error as Error, logContext);
      trackErrorWithCorrelation(
        error as Error,
        'checkAndTriggerStaleSnapshots',
        correlationId,
        logContext
      );

      return {
        triggered: false,
        staleSnapshotsFound: 0,
        triggeredCount: 0,
        results: []
      };
    }
  }

  /**
   * Task 5.1: Get comprehensive freshness analysis for report generation
   * Returns detailed information about snapshot freshness for decision making
   */
  public async getSnapshotFreshnessAnalysis(
    projectId: string, 
    maxAgeInDays: number = 7
  ): Promise<{
    freshSnapshots: number;
    staleSnapshots: number;
    missingSnapshots: number;
    totalCompetitors: number;
    recommendations: Array<{
      action: 'refresh' | 'capture' | 'none';
      competitorId: string;
      competitorName: string;
      reason: string;
      priority: 'high' | 'medium' | 'low';
    }>;
    overallFreshness: 'fresh' | 'partially_stale' | 'mostly_stale' | 'critical';
  }> {
    const correlationId = generateCorrelationId();
    const logContext = { projectId, maxAgeInDays, correlationId, operation: 'getSnapshotFreshnessAnalysis' };

    try {
      logger.info('Analyzing snapshot freshness for project', logContext);

      const freshnessService = SnapshotFreshnessService.getInstance();
      
      // Get comprehensive freshness summary
      const summary = await freshnessService.getFreshnessSummary(projectId, maxAgeInDays);
      
      // Get detailed stale and missing snapshots
      const [staleSnapshots, missingCompetitors] = await Promise.all([
        freshnessService.getStaleSnapshots(projectId, maxAgeInDays),
        getCompetitorsWithoutSnapshots(projectId)
      ]);

      // Build recommendations
      const recommendations = [];

      // Add missing snapshot recommendations
      for (const missing of missingCompetitors) {
        recommendations.push({
          action: 'capture' as const,
          competitorId: missing.competitorId,
          competitorName: missing.competitorName,
          reason: missing.reason,
          priority: missing.priority
        });
      }

      // Add stale snapshot recommendations
      for (const stale of staleSnapshots) {
        recommendations.push({
          action: 'refresh' as const,
          competitorId: stale.competitorId,
          competitorName: stale.competitorName,
          reason: stale.reason,
          priority: stale.ageInDays > maxAgeInDays * 2 ? 'high' as const : 'medium' as const
        });
      }

      // Determine overall freshness level
      const stalenessRatio = (summary.staleSnapshots + summary.missingSnapshots) / summary.totalCompetitors;
      let overallFreshness: 'fresh' | 'partially_stale' | 'mostly_stale' | 'critical';
      
      if (stalenessRatio === 0) {
        overallFreshness = 'fresh';
      } else if (stalenessRatio <= 0.25) {
        overallFreshness = 'partially_stale';
      } else if (stalenessRatio <= 0.75) {
        overallFreshness = 'mostly_stale';
      } else {
        overallFreshness = 'critical';
      }

      const result = {
        freshSnapshots: summary.freshSnapshots,
        staleSnapshots: summary.staleSnapshots,
        missingSnapshots: summary.missingSnapshots,
        totalCompetitors: summary.totalCompetitors,
        recommendations,
        overallFreshness
      };

      logger.info('Snapshot freshness analysis completed', {
        ...logContext,
        ...result,
        recommendationCount: recommendations.length
      });

      return result;

    } catch (error) {
      logger.error('Failed to analyze snapshot freshness', error as Error, logContext);
      
      return {
        freshSnapshots: 0,
        staleSnapshots: 0,
        missingSnapshots: 0,
        totalCompetitors: 0,
        recommendations: [],
        overallFreshness: 'critical'
      };
    }
  }

  /**
   * Cleanup method to close resources
   */
  public async cleanup(): Promise<void> {
    await this.productScrapingService.cleanup();
    await this.webScraperService.close();
    logger.info('SmartSchedulingService cleanup completed');
  }
}

// Add default export for compatibility with import statements
export default SmartSchedulingService;
