/**
 * Automated Analysis Service - Phase 2.1 Implementation
 * 
 * Objectives:
 * - Monitor for fresh snapshots and trigger analysis generation
 * - Target: <2 hour time to first analysis for new projects
 * - Integrate with Smart Scheduling Service from Phase 1.2
 * - Quality validation and retry logic for analysis generation
 * - Performance monitoring for analysis generation times
 */

import { logger, generateCorrelationId, trackErrorWithCorrelation, trackPerformance } from '@/lib/logger';
import { SmartSchedulingService } from './smartSchedulingService';
import { ComparativeAnalysisService } from './analysis/comparativeAnalysisService';
import { AnalysisService } from './domains/AnalysisService';
import { shouldUseUnifiedAnalysisService, featureFlags } from './migration/FeatureFlags';
import { AutoReportGenerationService } from './autoReportGenerationService';
import prisma from '@/lib/prisma';

export interface AnalysisTask {
  id: string;
  projectId: string;
  productIds: string[];
  competitorIds: string[];
  taskType: 'FRESH_DATA_ANALYSIS' | 'INITIAL_ANALYSIS' | 'COMPARATIVE_ANALYSIS';
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  correlationId: string;
  createdAt: Date;
  scheduledFor?: Date;
}

export interface AnalysisResult {
  taskId: string;
  projectId: string;
  success: boolean;
  analysisId?: string;
  reportId?: string;
  processingTimeMs: number;
  error?: string;
  completedAt: Date;
}

export interface AnalysisMonitoringStatus {
  projectId: string;
  freshDataDetected: boolean;
  lastAnalysisTime?: Date;
  nextScheduledAnalysis?: Date;
  timeToFirstAnalysisMs?: number;
  analysisQuality: 'HIGH' | 'MEDIUM' | 'LOW' | 'FAILED';
  needsAnalysis: boolean;
}

export interface FreshDataEvent {
  projectId: string;
  productSnapshots: {
    productId: string;
    snapshotId: string;
    createdAt: Date;
  }[];
  competitorSnapshots: {
    competitorId: string;
    snapshotId: string;
    createdAt: Date;
  }[];
  triggeredBy: 'SMART_SCHEDULING' | 'MANUAL_SCRAPING' | 'PERIODIC_CHECK';
  correlationId: string;
}

export class AutomatedAnalysisService {
  private readonly TARGET_TIME_TO_ANALYSIS_MS = 2 * 60 * 60 * 1000; // 2 hours
  private readonly ANALYSIS_QUALITY_THRESHOLD = 100; // Minimum characters for quality analysis
  private readonly MAX_RETRY_ATTEMPTS = 3;
  private readonly RETRY_DELAY_BASE = 5000; // 5 seconds base delay

  private smartSchedulingService: SmartSchedulingService;
  private comparativeAnalysisService: ComparativeAnalysisService;
  private unifiedAnalysisService: AnalysisService | null = null;
  private autoReportService: AutoReportGenerationService;
  private monitoringInterval?: NodeJS.Timeout;

  constructor() {
    this.smartSchedulingService = new SmartSchedulingService();
    this.comparativeAnalysisService = new ComparativeAnalysisService();
    this.autoReportService = new AutoReportGenerationService();
    
    // Initialize unified service if feature flag is enabled
    if (featureFlags.isEnabledForScheduledJobs()) {
      this.unifiedAnalysisService = new AnalysisService();
    }
  }

  /**
   * Initialize automated analysis monitoring
   */
  public async initialize(): Promise<void> {
    const correlationId = generateCorrelationId();
    
    try {
      logger.info('Initializing Automated Analysis Service', { correlationId });

      // Start monitoring for fresh data every 30 minutes
      this.monitoringInterval = setInterval(async () => {
        await this.monitorAllProjects();
      }, 30 * 60 * 1000); // 30 minutes

      // Initial check
      await this.monitorAllProjects();

      logger.info('Automated Analysis Service initialized successfully', { correlationId });
    } catch (error) {
      trackErrorWithCorrelation(error as Error, 'initialize', correlationId);
      throw error;
    }
  }

  /**
   * Monitor all active projects for fresh data and trigger analysis
   */
  private async monitorAllProjects(): Promise<void> {
    const correlationId = generateCorrelationId();
    
    try {
      logger.info('Starting project monitoring cycle', { correlationId });

      const activeProjects = await prisma.project.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true, name: true }
      });

      const monitoringResults = await Promise.allSettled(
        activeProjects.map(project => 
          this.monitorProjectForFreshData(project.id, correlationId)
        )
      );

      const successful = monitoringResults.filter(result => result.status === 'fulfilled').length;
      const failed = monitoringResults.length - successful;

      logger.info('Project monitoring cycle completed', {
        correlationId,
        totalProjects: activeProjects.length,
        successful,
        failed
      });

    } catch (error) {
      trackErrorWithCorrelation(error as Error, 'monitorAllProjects', correlationId);
    }
  }

  /**
   * Monitor specific project for fresh data and trigger analysis if needed
   */
  public async monitorProjectForFreshData(
    projectId: string, 
    correlationId?: string
  ): Promise<AnalysisMonitoringStatus> {
    const corrId = correlationId || generateCorrelationId();
    const context = { projectId, correlationId: corrId };

    try {
      logger.info('Monitoring project for fresh data', context);

      // Check data freshness using Smart Scheduling Service
      const freshnessStatus = await this.smartSchedulingService.getFreshnessStatus(projectId);
      
      // Get latest analysis time (Analysis model relates to competitors, not projects directly)
      const latestAnalysis = await prisma.analysis.findFirst({
        where: { 
          competitor: { 
            projects: { 
              some: { id: projectId } 
            } 
          } 
        },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true, id: true }
      });

      const now = new Date();
      const lastAnalysisTime = latestAnalysis?.createdAt;
      const timeToFirstAnalysisMs = lastAnalysisTime 
        ? now.getTime() - lastAnalysisTime.getTime()
        : undefined;

      // Determine if analysis is needed
      const needsAnalysis = this.determineAnalysisNeed(freshnessStatus, lastAnalysisTime);
      
      if (needsAnalysis) {
        logger.info('Fresh data detected, triggering analysis', {
          ...context,
          freshnessStatus: freshnessStatus.overallStatus,
          timeSinceLastAnalysis: timeToFirstAnalysisMs
        });

        await this.triggerAutomatedAnalysis(projectId, {
          triggeredBy: 'FRESH_DATA_DETECTED',
          freshDataEvent: {
            projectId,
            productSnapshots: [],
            competitorSnapshots: [],
            triggeredBy: 'SMART_SCHEDULING',
            correlationId: corrId
          }
        });
      }

      return {
        projectId,
        freshDataDetected: freshnessStatus.overallStatus === 'FRESH',
        lastAnalysisTime,
        timeToFirstAnalysisMs,
        analysisQuality: this.determineAnalysisQuality(latestAnalysis),
        needsAnalysis
      };

    } catch (error) {
      trackErrorWithCorrelation(error as Error, 'monitorProjectForFreshData', corrId, context);
      
      return {
        projectId,
        freshDataDetected: false,
        analysisQuality: 'FAILED',
        needsAnalysis: false
      };
    }
  }

  /**
   * Trigger automated analysis for a project
   */
  public async triggerAutomatedAnalysis(
    projectId: string,
    options: {
      triggeredBy: 'FRESH_DATA_DETECTED' | 'PROJECT_CREATION' | 'MANUAL_TRIGGER';
      freshDataEvent?: FreshDataEvent;
      priority?: 'HIGH' | 'MEDIUM' | 'LOW';
    }
  ): Promise<AnalysisResult> {
    const correlationId = generateCorrelationId();
    const context = { projectId, correlationId, triggeredBy: options.triggeredBy };
    const startTime = Date.now();

    try {
      logger.info('Triggering automated analysis', context);

      // Get project data with separate queries
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { id: true, name: true }
      });

      if (!project) {
        throw new Error(`Project ${projectId} not found`);
      }

      // Get products and competitors separately
      const products = await prisma.product.findMany({
        where: { projectId },
        select: { id: true, name: true }
      });

      const competitors = await prisma.competitor.findMany({
        where: { projects: { some: { id: projectId } } },
        select: { id: true, name: true }
      });

      if (products.length === 0 && competitors.length === 0) {
        throw new Error(`Project ${projectId} has no products or competitors to analyze`);
      }

      // Create analysis task
      const analysisTask: AnalysisTask = {
        id: generateCorrelationId(),
        projectId,
        productIds: products.map((p: { id: string; name: string }) => p.id),
        competitorIds: competitors.map((c: { id: string; name: string }) => c.id),
        taskType: options.triggeredBy === 'PROJECT_CREATION' ? 'INITIAL_ANALYSIS' : 'FRESH_DATA_ANALYSIS',
        priority: options.priority || 'HIGH',
        correlationId,
        createdAt: new Date()
      };

      // Execute analysis with retry logic
      const analysisResult = await this.executeAnalysisWithRetry(analysisTask);
      
      const processingTimeMs = Date.now() - startTime;

      // Check if we met the 2-hour target
      if (processingTimeMs < this.TARGET_TIME_TO_ANALYSIS_MS) {
        logger.info('Analysis completed within target time', {
          ...context,
          processingTimeMs,
          targetTimeMs: this.TARGET_TIME_TO_ANALYSIS_MS,
          performanceStatus: 'TARGET_MET'
        });
      } else {
        logger.warn('Analysis exceeded target time', {
          ...context,
          processingTimeMs,
          targetTimeMs: this.TARGET_TIME_TO_ANALYSIS_MS,
          performanceStatus: 'TARGET_EXCEEDED'
        });
      }

      return {
        taskId: analysisTask.id,
        projectId,
        success: analysisResult.success,
        analysisId: analysisResult.analysisId,
        reportId: analysisResult.reportId,
        processingTimeMs,
        completedAt: new Date()
      };

    } catch (error) {
      const processingTimeMs = Date.now() - startTime;
      trackErrorWithCorrelation(error as Error, 'triggerAutomatedAnalysis', correlationId, context);
      
      return {
        taskId: correlationId,
        projectId,
        success: false,
        processingTimeMs,
        error: (error as Error).message,
        completedAt: new Date()
      };
    }
  }

  /**
   * Execute analysis with retry logic
   */
  private async executeAnalysisWithRetry(task: AnalysisTask): Promise<{
    success: boolean;
    analysisId?: string;
    reportId?: string;
  }> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.MAX_RETRY_ATTEMPTS; attempt++) {
      try {
        logger.info('Executing analysis', {
          taskId: task.id,
          projectId: task.projectId,
          attempt,
          maxAttempts: this.MAX_RETRY_ATTEMPTS
        });

        // Generate comparative analysis - simplified for now
        // For Phase 2.1, we'll use a simplified approach and integrate properly with existing analysis
        const analysisResult = {
          id: task.id,
          content: `Automated analysis for project ${task.projectId}`,
          success: true
        };

        // Validate analysis quality
        if (!this.validateAnalysisQuality(analysisResult)) {
          throw new Error('Analysis quality validation failed');
        }

        // Trigger report generation
        const reportResult = await this.autoReportService.generateInitialReport(task.projectId, {
          reportTemplate: 'comprehensive',
          priority: task.priority.toLowerCase() as 'high' | 'normal' | 'low'
        });

        return {
          success: true,
          analysisId: analysisResult.id,
          reportId: reportResult.taskId
        };

      } catch (error) {
        lastError = error as Error;
        logger.warn('Analysis attempt failed', {
          taskId: task.id,
          projectId: task.projectId,
          attempt,
          error: lastError.message
        });

        if (attempt < this.MAX_RETRY_ATTEMPTS) {
          const delay = this.RETRY_DELAY_BASE * Math.pow(2, attempt - 1);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('Analysis failed after all retry attempts');
  }

  /**
   * Determine if analysis is needed based on data freshness and last analysis
   */
  private determineAnalysisNeed(
    freshnessStatus: any,
    lastAnalysisTime?: Date
  ): boolean {
    const now = new Date();
    
    // Always analyze if no analysis exists
    if (!lastAnalysisTime) {
      return true;
    }

    // Analyze if data is fresh and last analysis was more than 4 hours ago
    if (freshnessStatus.overallStatus === 'FRESH') {
      const hoursSinceLastAnalysis = (now.getTime() - lastAnalysisTime.getTime()) / (1000 * 60 * 60);
      return hoursSinceLastAnalysis > 4;
    }

    // Analyze if data is stale and last analysis was more than 24 hours ago
    if (freshnessStatus.overallStatus === 'STALE') {
      const hoursSinceLastAnalysis = (now.getTime() - lastAnalysisTime.getTime()) / (1000 * 60 * 60);
      return hoursSinceLastAnalysis > 24;
    }

    return false;
  }

  /**
   * Validate analysis quality
   */
  private validateAnalysisQuality(analysisResult: any): boolean {
    if (!analysisResult || !analysisResult.content) {
      return false;
    }

    const content = typeof analysisResult.content === 'string' 
      ? analysisResult.content 
      : JSON.stringify(analysisResult.content);

    return content.length >= this.ANALYSIS_QUALITY_THRESHOLD;
  }

  /**
   * Determine analysis quality based on latest analysis
   */
  private determineAnalysisQuality(latestAnalysis: any): 'HIGH' | 'MEDIUM' | 'LOW' | 'FAILED' {
    if (!latestAnalysis) {
      return 'FAILED';
    }

    // This is a simplified quality check - could be enhanced with more sophisticated metrics
    const analysisAge = Date.now() - new Date(latestAnalysis.createdAt).getTime();
    const hoursOld = analysisAge / (1000 * 60 * 60);

    if (hoursOld < 4) return 'HIGH';
    if (hoursOld < 24) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Get analysis monitoring status for a project
   */
  public async getAnalysisStatus(projectId: string): Promise<AnalysisMonitoringStatus> {
    return this.monitorProjectForFreshData(projectId);
  }

  /**
   * Cleanup and shutdown
   */
  public async cleanup(): Promise<void> {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }
    
    logger.info('Automated Analysis Service cleanup completed');
  }
}

// Add default export for compatibility with import statements
export default AutomatedAnalysisService;

// Export singleton instance
let automatedAnalysisServiceInstance: AutomatedAnalysisService | null = null;

export function getAutomatedAnalysisService(): AutomatedAnalysisService {
  if (!automatedAnalysisServiceInstance) {
    automatedAnalysisServiceInstance = new AutomatedAnalysisService();
  }
  return automatedAnalysisServiceInstance;
} 