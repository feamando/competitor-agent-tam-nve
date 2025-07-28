/**
 * Smart Scheduling Service - Phase 1.2 Implementation (Updated for Task 1.3.5)
 * Intelligent snapshot scheduling with condition-based triggering
 * 
 * Features:
 * - 7-day freshness threshold for snapshots
 * - Immediate scraping for missing snapshots  
 * - Priority-based task scheduling
 * - Comprehensive error handling and correlation tracking
 * - Optimized resource usage
 * - NEW: Unified DataService integration with feature flags
 */

import { logger, generateCorrelationId, trackErrorWithCorrelation } from '@/lib/logger';
import { ProductScrapingService } from './productScrapingService';
import { WebScraperService } from './webScraper';
import { dataService } from './domains/DataService';
import { dataServiceFeatureFlags } from './migration/DataServiceFeatureFlags';
import prisma from '@/lib/prisma';

// Smart Scheduling interfaces
export interface ScrapingTask {
  type: 'PRODUCT' | 'COMPETITOR';
  targetId: string;
  reason: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  url?: string;
  targetName?: string;
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

export interface ScrapingStatus {
  triggered: boolean;
  tasksExecuted: number;
  results: ScrapingTaskResult[];
}

export interface NeedsScrapingCheck {
  required: boolean;
  reason: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
}

interface ProjectSnapshot {
  id: string;
  createdAt: Date;
  updatedAt?: Date;
}

interface FreshnessStatus {
  overallStatus: 'FRESH' | 'STALE' | 'CRITICAL';
  productCount: number;
  competitorCount: number;
  stalePsroductCount: number;
  staleCompetitorCount: number;
  lastChecked: Date;
  nextRecommendedCheck: Date;
  summary: string;
  recommendedActions: string[];
}

export class SmartSchedulingService {
  private readonly FRESHNESS_THRESHOLD_DAYS = 7;
  private readonly HIGH_PRIORITY_THRESHOLD_DAYS = 14;
  private readonly TASK_EXECUTION_DELAY = 2000; // 2 seconds between tasks
  
  // Legacy service instances
  private productScrapingService: ProductScrapingService;
  private webScraperService: WebScraperService;

  constructor() {
    this.productScrapingService = new ProductScrapingService();
    this.webScraperService = new WebScraperService();
  }

  /**
   * Main smart scheduling method - checks and triggers scraping based on freshness
   * Phase 1.2 core implementation with Task 1.3.5 DataService integration
   */
  public async checkAndTriggerScraping(projectId: string): Promise<ScrapingStatus> {
    const correlationId = generateCorrelationId();
    const context = { projectId, correlationId, operation: 'smartScheduling' };

    try {
      logger.info('Smart scheduling check started', {
        ...context,
        useUnifiedDataService: dataServiceFeatureFlags.isEnabledForSmartScheduling()
      });

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
      logger.error('Smart scheduling failed', error as Error, context);
      trackErrorWithCorrelation(error as Error, correlationId, 'smartScheduling');
      
      return {
        triggered: false,
        tasksExecuted: 0,
        results: [{
          taskType: 'PRODUCT',
          targetId: projectId,
          success: false,
          error: (error as Error).message,
          duration: 0,
          correlationId
        }]
      };
    }
  }

  /**
   * Get freshness status for a project - used by SmartAIService integration
   * CRITICAL: This method must be preserved for AnalysisService integration
   */
  public async getFreshnessStatus(projectId: string): Promise<FreshnessStatus> {
    const correlationId = generateCorrelationId();
    const context = { projectId, correlationId, operation: 'getFreshnessStatus' };

    try {
      logger.info('Checking project freshness status', context);

      const freshnessThreshold = new Date();
      freshnessThreshold.setDate(freshnessThreshold.getDate() - this.FRESHNESS_THRESHOLD_DAYS);

      // Get product snapshots
      const products = await prisma.product.findMany({
        where: { projectId },
        include: {
          snapshots: {
            orderBy: { createdAt: 'desc' },
            take: 1
          }
        }
      });

      // Get competitor snapshots
      const competitors = await prisma.competitor.findMany({
        where: { 
          projects: {
            some: { id: projectId }
          }
        },
        include: {
          snapshots: {
            orderBy: { createdAt: 'desc' },
            take: 1
          }
        }
      });

      const productCount = products.length;
      const competitorCount = competitors.length;

             const staleProducts = products.filter(p => 
         !p.snapshots?.length || (p.snapshots[0] && p.snapshots[0].createdAt < freshnessThreshold)
       );

       const staleCompetitors = competitors.filter(c => 
         !c.snapshots?.length || (c.snapshots[0] && c.snapshots[0].createdAt < freshnessThreshold)
       );

      const stalePsroductCount = staleProducts.length;
      const staleCompetitorCount = staleCompetitors.length;

      let overallStatus: 'FRESH' | 'STALE' | 'CRITICAL';
      if (stalePsroductCount === 0 && staleCompetitorCount === 0) {
        overallStatus = 'FRESH';
      } else if (stalePsroductCount < productCount * 0.5 && staleCompetitorCount < competitorCount * 0.5) {
        overallStatus = 'STALE';
      } else {
        overallStatus = 'CRITICAL';
      }

      const summary = `${productCount} products, ${competitorCount} competitors. ${stalePsroductCount} stale products, ${staleCompetitorCount} stale competitors.`;
      
      const recommendedActions: string[] = [];
      if (stalePsroductCount > 0) {
        recommendedActions.push(`Update ${stalePsroductCount} product snapshots`);
      }
      if (staleCompetitorCount > 0) {
        recommendedActions.push(`Update ${staleCompetitorCount} competitor snapshots`);
      }

      const nextRecommendedCheck = new Date();
      nextRecommendedCheck.setHours(nextRecommendedCheck.getHours() + 6); // Check every 6 hours

      const status: FreshnessStatus = {
        overallStatus,
        productCount,
        competitorCount,
        stalePsroductCount,
        staleCompetitorCount,
        lastChecked: new Date(),
        nextRecommendedCheck,
        summary,
        recommendedActions
      };

      logger.info('Freshness status checked', { ...context, status });
      return status;

    } catch (error) {
      logger.error('Failed to get freshness status', error as Error, context);
      throw error;
    }
  }

  /**
   * Execute scraping tasks with unified DataService integration
   * Uses feature flags to determine which service to use
   */
  private async executeScrapingTasks(
    tasks: ScrapingTask[], 
    correlationId: string
  ): Promise<ScrapingTaskResult[]> {
    const results: ScrapingTaskResult[] = [];
    const sortedTasks = this.prioritizeTasks(tasks);
    const useUnifiedService = dataServiceFeatureFlags.isEnabledForSmartScheduling();

    logger.info('Executing scraping tasks', {
      correlationId,
      taskCount: sortedTasks.length,
      useUnifiedService,
      operation: 'executeScrapingTasks'
    });

    for (const [index, task] of sortedTasks.entries()) {
      const startTime = Date.now();
      const taskContext = {
        correlationId,
        taskType: task.type,
        targetId: task.targetId,
        targetName: task.targetName,
        priority: task.priority,
        taskIndex: index + 1,
        totalTasks: sortedTasks.length,
        useUnifiedService
      };

      try {
        logger.info(`Executing scraping task ${index + 1}/${sortedTasks.length}`, taskContext);

        let snapshotId: string | undefined;

        if (useUnifiedService) {
          // Use unified DataService
          await dataService.initialize();
          
          if (task.type === 'PRODUCT') {
            const productScraper = dataService.getProductScraper();
            const snapshot = await productScraper.scrapeProductById(task.targetId);
            snapshotId = snapshot.id;
          } else {
            const webScraper = dataService.getWebScraper();
            snapshotId = await webScraper.scrapeCompetitor(task.targetId);
          }
        } else {
          // Use legacy services
          if (task.type === 'PRODUCT') {
            const snapshot = await this.productScrapingService.scrapeProductById(task.targetId);
            snapshotId = snapshot.id;
          } else {
            snapshotId = await this.webScraperService.scrapeCompetitor(task.targetId);
          }
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
        const errorMessage = (error as Error).message;

        logger.error('Scraping task failed', error as Error, taskContext);

        const result: ScrapingTaskResult = {
          taskType: task.type,
          targetId: task.targetId,
          success: false,
          error: errorMessage,
          duration,
          correlationId
        };

        results.push(result);

        // Continue with next task even if current one fails
      }
    }

    // Cleanup unified service if used
    if (useUnifiedService) {
      try {
        await dataService.close();
      } catch (error) {
        logger.error('Failed to cleanup unified DataService', error as Error, { correlationId });
      }
    } else {
      // Cleanup legacy services
      try {
        await this.productScrapingService.cleanup();
        await this.webScraperService.close();
      } catch (error) {
        logger.error('Failed to cleanup legacy services', error as Error, { correlationId });
      }
    }

    logger.info('Scraping tasks execution completed', {
      correlationId,
      totalTasks: sortedTasks.length,
      successfulTasks: results.filter(r => r.success).length,
      failedTasks: results.filter(r => !r.success).length,
      totalDuration: results.reduce((sum, r) => sum + r.duration, 0),
      useUnifiedService
    });

    return results;
  }

  /**
   * Check if snapshot needs scraping based on age and type
   */
  private needsScrapingCheck(snapshot: ProjectSnapshot | null, type: 'PRODUCT' | 'COMPETITOR'): NeedsScrapingCheck {
    if (!snapshot) {
      return {
        required: true,
        reason: `No ${type.toLowerCase()} snapshot exists`,
        priority: 'HIGH'
      };
    }

    const now = new Date();
    const ageInDays = (now.getTime() - snapshot.createdAt.getTime()) / (1000 * 60 * 60 * 24);

    if (ageInDays > this.HIGH_PRIORITY_THRESHOLD_DAYS) {
      return {
        required: true,
        reason: `${type} snapshot is ${Math.round(ageInDays)} days old (high priority threshold: ${this.HIGH_PRIORITY_THRESHOLD_DAYS} days)`,
        priority: 'HIGH'
      };
    }

    if (ageInDays > this.FRESHNESS_THRESHOLD_DAYS) {
      return {
        required: true,
        reason: `${type} snapshot is ${Math.round(ageInDays)} days old (freshness threshold: ${this.FRESHNESS_THRESHOLD_DAYS} days)`,
        priority: 'MEDIUM'
      };
    }

    return {
      required: false,
      reason: `${type} snapshot is fresh (${Math.round(ageInDays)} days old)`,
      priority: 'LOW'
    };
  }

  /**
   * Prioritize tasks based on priority and type
   */
  private prioritizeTasks(tasks: ScrapingTask[]): ScrapingTask[] {
    const priorityOrder = { 'HIGH': 1, 'MEDIUM': 2, 'LOW': 3 };
    
    return tasks.sort((a, b) => {
      // First sort by priority
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      
      // Then by type (products first, then competitors)
      if (a.type !== b.type) {
        return a.type === 'PRODUCT' ? -1 : 1;
      }
      
      // Finally by name for consistency
      return (a.targetName || '').localeCompare(b.targetName || '');
    });
  }
}
