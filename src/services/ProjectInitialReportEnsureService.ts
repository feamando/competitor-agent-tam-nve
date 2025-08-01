/**
 * Project Initial Report Ensure Service - Task 5.3
 * 
 * This service ensures that ALL new projects, regardless of creation method,
 * get initial comparative reports generated consistently and reliably.
 * 
 * Key Functions:
 * - Task 5.3: Ensure all new projects get initial comparative report
 * - Monitor project creation across all methods (API, chat, manual)
 * - Provide fallback mechanisms for missed initial reports
 * - Validate and verify initial report generation success
 * - Queue retry mechanisms for failed initial report attempts
 * 
 * Integration Points:
 * - API project creation (src/app/api/projects/route.ts)
 * - Chat project creation (src/lib/chat/conversation.ts)
 * - Manual project creation flows
 * - Project creation event hooks
 */

import { PrismaClient, Project, Report } from '@prisma/client';
import { logger, generateCorrelationId, createCorrelationLogger } from '../lib/logger';

interface ProjectCreationContext {
  projectId: string;
  creationMethod: 'api' | 'chat' | 'manual' | 'import' | 'unknown';
  correlationId: string;
  userEmail?: string | undefined;
  createdAt: Date;
  metadata?: Record<string, any> | undefined;
}

interface InitialReportRequirements {
  projectId: string;
  hasCompetitors: boolean;
  competitorCount: number;
  hasProduct: boolean;
  productId?: string;
  priority: 'high' | 'normal' | 'low';
  template: 'comprehensive' | 'executive' | 'technical' | 'strategic';
  fallbackEnabled: boolean;
  retryEnabled: boolean;
  maxRetries: number;
  timeout: number;
}

interface ReportGenerationResult {
  success: boolean;
  reportId?: string;
  reportTitle?: string;
  attempts: number;
  processingTime: number;
  error?: string;
  fallbackUsed: boolean;
  correlationId: string;
}

interface ProjectValidationResult {
  isValid: boolean;
  hasCompetitors: boolean;
  hasProduct: boolean;
  competitorCount: number;
  issues: string[];
  recommendations: string[];
}

export class ProjectInitialReportEnsureService {
  private prisma: PrismaClient;
  private processingQueue: Map<string, Promise<ReportGenerationResult>>;
  private retryQueue: Map<string, number>;

  constructor() {
    this.prisma = new PrismaClient();
    this.processingQueue = new Map();
    this.retryQueue = new Map();
  }

  /**
   * Task 5.3: Main method - Ensure project gets initial comparative report
   * This is the primary entry point for all project creation flows
   */
  async ensureInitialComparativeReport(
    projectId: string,
    context: Partial<ProjectCreationContext> = {}
  ): Promise<ReportGenerationResult> {
    const correlationId = context.correlationId || generateCorrelationId();
    const reportLogger = createCorrelationLogger(correlationId);
    const startTime = Date.now();

    const fullContext: ProjectCreationContext = {
      projectId,
      creationMethod: context.creationMethod || 'unknown',
      correlationId,
      userEmail: context.userEmail,
      createdAt: context.createdAt || new Date(),
      metadata: context.metadata || {}
    };

    try {
      reportLogger.info('Task 5.3: Starting initial report generation ensure process', {
        projectId,
        creationMethod: fullContext.creationMethod,
        correlationId
      });

      // Step 1: Check if already processing to prevent duplicates
      if (this.processingQueue.has(projectId)) {
        reportLogger.info('Task 5.3: Project already being processed, waiting for existing process', {
          projectId,
          correlationId
        });
        return await this.processingQueue.get(projectId)!;
      }

      // Step 2: Start processing and track it
      const processingPromise = this.processInitialReportGeneration(fullContext, reportLogger);
      this.processingQueue.set(projectId, processingPromise);

      try {
        const result = await processingPromise;
        return result;
      } finally {
        // Clean up processing queue
        this.processingQueue.delete(projectId);
      }

    } catch (error) {
      reportLogger.error('Task 5.3: Initial report ensure process failed', error as Error, {
        projectId,
        correlationId,
        processingTime: Date.now() - startTime
      });

      // Track failure
      trackBusinessEvent('initial_report_ensure_failed', {
        projectId,
        correlationId,
        creationMethod: fullContext.creationMethod,
        error: (error as Error).message,
        task: 'Task 5.3'
      });

      return {
        success: false,
        attempts: 1,
        processingTime: Date.now() - startTime,
        error: (error as Error).message,
        fallbackUsed: false,
        correlationId
      };
    }
  }

  /**
   * Task 5.3: Process initial report generation with comprehensive validation
   */
  private async processInitialReportGeneration(
    context: ProjectCreationContext,
    reportLogger: any
  ): Promise<ReportGenerationResult> {
    const startTime = Date.now();

    try {
      // Step 1: Validate project readiness
      const validationResult = await this.validateProjectReadiness(context.projectId, reportLogger);
      
      if (!validationResult.isValid) {
        reportLogger.warn('Task 5.3: Project validation failed, attempting to fix issues', {
          projectId: context.projectId,
          issues: validationResult.issues,
          correlationId: context.correlationId
        });

        // Attempt to fix validation issues
        await this.attemptToFixValidationIssues(context.projectId, validationResult, reportLogger);
        
        // Re-validate after fixes
        const revalidationResult = await this.validateProjectReadiness(context.projectId, reportLogger);
        if (!revalidationResult.isValid) {
          throw new Error(`Project validation failed: ${revalidationResult.issues.join(', ')}`);
        }
      }

      // Step 2: Check if initial report already exists
      const existingReport = await this.checkForExistingInitialReport(context.projectId, reportLogger);
      if (existingReport) {
        reportLogger.info('Task 5.3: Initial report already exists, skipping generation', {
          projectId: context.projectId,
          existingReportId: existingReport.id,
          correlationId: context.correlationId
        });

        return {
          success: true,
          reportId: existingReport.id,
          reportTitle: existingReport.name || existingReport.title,
          attempts: 0,
          processingTime: Date.now() - startTime,
          fallbackUsed: false,
          correlationId: context.correlationId
        };
      }

      // Step 3: Build initial report requirements
      const requirements = await this.buildInitialReportRequirements(
        context.projectId, 
        context, 
        validationResult, 
        reportLogger
      );

      // Step 4: Generate initial report with retry logic
      const generationResult = await this.generateInitialReportWithRetry(
        requirements, 
        context, 
        reportLogger
      );

      // Step 5: Validate generation success
      if (generationResult.success) {
        await this.validateReportGenerationSuccess(
          context.projectId, 
          generationResult.reportId!, 
          reportLogger
        );
      }

      // Step 6: Track completion
      trackBusinessEvent('initial_report_ensure_completed', {
        projectId: context.projectId,
        correlationId: context.correlationId,
        creationMethod: context.creationMethod,
        success: generationResult.success,
        attempts: generationResult.attempts,
        processingTime: generationResult.processingTime,
        fallbackUsed: generationResult.fallbackUsed,
        task: 'Task 5.3'
      });

      reportLogger.info('Task 5.3: Initial report ensure process completed', {
        projectId: context.projectId,
        success: generationResult.success,
        reportId: generationResult.reportId,
        attempts: generationResult.attempts,
        correlationId: context.correlationId
      });

      return generationResult;

    } catch (error) {
      reportLogger.error('Task 5.3: Report generation process failed', error as Error, {
        projectId: context.projectId,
        correlationId: context.correlationId,
        processingTime: Date.now() - startTime
      });

      return {
        success: false,
        attempts: 1,
        processingTime: Date.now() - startTime,
        error: (error as Error).message,
        fallbackUsed: false,
        correlationId: context.correlationId
      };
    }
  }

  /**
   * Task 5.3: Validate project readiness for initial report generation
   */
  private async validateProjectReadiness(
    projectId: string, 
    reportLogger: any
  ): Promise<ProjectValidationResult> {
    try {
      const project = await this.prisma.project.findUnique({
        where: { id: projectId },
        include: {
          competitors: {
            select: { id: true, name: true, website: true }
          },
          products: {
            select: { id: true, name: true, website: true }
          },
          reports: {
            where: { isInitialReport: true },
            select: { id: true, name: true, status: true }
          }
        }
      });

      if (!project) {
        return {
          isValid: false,
          hasCompetitors: false,
          hasProduct: false,
          competitorCount: 0,
          issues: ['Project not found'],
          recommendations: ['Verify project exists before generating report']
        };
      }

      const issues: string[] = [];
      const recommendations: string[] = [];

      // Check competitors
      const hasCompetitors = project.competitors.length > 0;
      const competitorCount = project.competitors.length;

      if (!hasCompetitors) {
        issues.push('No competitors assigned to project');
        recommendations.push('Assign competitors to enable comparative analysis');
      } else if (competitorCount < 2) {
        issues.push('Insufficient competitors for meaningful comparison');
        recommendations.push('Add more competitors for better comparative analysis');
      }

      // Check competitor data quality
      const validCompetitors = project.competitors.filter(c => 
        c.name && c.name.trim().length > 0 && c.website && c.website.trim().length > 0
      );

      if (validCompetitors.length < competitorCount * 0.5) {
        issues.push('Many competitors have incomplete data');
        recommendations.push('Update competitor data (names and websites) for better analysis');
      }

      // Check product entity
      const hasProduct = project.products.length > 0;
      if (!hasProduct) {
        issues.push('No product entity associated with project');
        recommendations.push('Create product entity for enhanced competitive positioning analysis');
      }

      // Check project status
      if (project.status === 'ARCHIVED' || project.status === 'DELETED') {
        issues.push('Project is in inactive status');
        recommendations.push('Reactivate project before generating reports');
      }

      const isValid = hasCompetitors && competitorCount >= 1 && project.status === 'ACTIVE';

      reportLogger.info('Task 5.3: Project validation completed', {
        projectId,
        isValid,
        hasCompetitors,
        competitorCount,
        hasProduct,
        issuesCount: issues.length
      });

      return {
        isValid,
        hasCompetitors,
        hasProduct,
        competitorCount,
        issues,
        recommendations
      };

    } catch (error) {
      reportLogger.error('Task 5.3: Project validation failed', error as Error, { projectId });
      return {
        isValid: false,
        hasCompetitors: false,
        hasProduct: false,
        competitorCount: 0,
        issues: [`Validation error: ${(error as Error).message}`],
        recommendations: ['Fix database connectivity and retry validation']
      };
    }
  }

  /**
   * Task 5.3: Attempt to fix validation issues automatically
   */
  private async attemptToFixValidationIssues(
    projectId: string, 
    validationResult: ProjectValidationResult,
    reportLogger: any
  ): Promise<void> {
    reportLogger.info('Task 5.3: Attempting to fix validation issues', {
      projectId,
      issues: validationResult.issues
    });

    try {
      // Fix 1: Auto-assign competitors if none exist
      if (!validationResult.hasCompetitors) {
        await this.autoAssignCompetitors(projectId, reportLogger);
      }

      // Fix 2: Activate project if in wrong status
      const project = await this.prisma.project.findUnique({
        where: { id: projectId },
        select: { status: true }
      });

      if (project && (project.status === 'DRAFT' || project.status === 'PAUSED')) {
        await this.prisma.project.update({
          where: { id: projectId },
          data: { status: 'ACTIVE' }
        });
        
        reportLogger.info('Task 5.3: Project status updated to ACTIVE', { projectId });
      }

      reportLogger.info('Task 5.3: Validation issue fixes attempted', { projectId });

    } catch (error) {
      reportLogger.warn('Task 5.3: Failed to fix some validation issues', {
        projectId,
        error: (error as Error).message
      });
    }
  }

  /**
   * Task 5.3: Auto-assign competitors to project
   */
  private async autoAssignCompetitors(projectId: string, reportLogger: any): Promise<void> {
    try {
      const availableCompetitors = await this.prisma.competitor.findMany({
        select: { id: true, name: true },
        take: 10, // Limit to avoid performance issues
        where: {
          name: { not: null },
          website: { not: null }
        }
      });

      if (availableCompetitors.length === 0) {
        reportLogger.warn('Task 5.3: No competitors available for auto-assignment', { projectId });
        return;
      }

      await this.prisma.project.update({
        where: { id: projectId },
        data: {
          competitors: {
            connect: availableCompetitors.map(c => ({ id: c.id }))
          }
        }
      });

      reportLogger.info('Task 5.3: Competitors auto-assigned to project', {
        projectId,
        competitorCount: availableCompetitors.length,
        competitorNames: availableCompetitors.map(c => c.name)
      });

    } catch (error) {
      reportLogger.error('Task 5.3: Failed to auto-assign competitors', error as Error, { projectId });
    }
  }

  /**
   * Task 5.3: Check for existing initial report
   */
  private async checkForExistingInitialReport(
    projectId: string, 
    reportLogger: any
  ): Promise<Report | null> {
    try {
      const existingReport = await this.prisma.report.findFirst({
        where: {
          projectId,
          isInitialReport: true,
          status: { in: ['COMPLETED', 'PROCESSING'] }
        },
        orderBy: { createdAt: 'desc' }
      });

      if (existingReport) {
        reportLogger.info('Task 5.3: Found existing initial report', {
          projectId,
          reportId: existingReport.id,
          reportStatus: existingReport.status
        });
      }

      return existingReport;

    } catch (error) {
      reportLogger.warn('Task 5.3: Error checking for existing report', {
        projectId,
        error: (error as Error).message
      });
      return null;
    }
  }

  /**
   * Task 5.3: Build initial report requirements based on project data
   */
  private async buildInitialReportRequirements(
    projectId: string,
    context: ProjectCreationContext,
    validationResult: ProjectValidationResult,
    reportLogger: any
  ): Promise<InitialReportRequirements> {
    // Get project details for configuration
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        products: { select: { id: true } }
      }
    });

    // Determine priority based on creation method and age
    let priority: 'high' | 'normal' | 'low' = 'normal';
    if (context.creationMethod === 'api' || context.creationMethod === 'chat') {
      priority = 'high'; // User-initiated projects get high priority
    }

    // Determine template based on competitor count and product availability
    let template: 'comprehensive' | 'executive' | 'technical' | 'strategic' = 'comprehensive';
    if (validationResult.competitorCount >= 5 && validationResult.hasProduct) {
      template = 'comprehensive';
    } else if (validationResult.competitorCount >= 3) {
      template = 'executive';
    } else {
      template = 'technical';
    }

    // Configure retry and fallback based on project importance
    const isHighImportance = context.creationMethod === 'api' || context.creationMethod === 'chat';
    
    const requirements: InitialReportRequirements = {
      projectId,
      hasCompetitors: validationResult.hasCompetitors,
      competitorCount: validationResult.competitorCount,
      hasProduct: validationResult.hasProduct,
      productId: project?.products[0]?.id,
      priority,
      template,
      fallbackEnabled: true,
      retryEnabled: true,
      maxRetries: isHighImportance ? 3 : 2,
      timeout: isHighImportance ? 300000 : 180000 // 5 or 3 minutes
    };

    reportLogger.info('Task 5.3: Built initial report requirements', {
      projectId,
      requirements: {
        priority: requirements.priority,
        template: requirements.template,
        maxRetries: requirements.maxRetries,
        timeout: requirements.timeout
      }
    });

    return requirements;
  }

  /**
   * Task 5.3: Generate initial report with comprehensive retry logic
   */
  private async generateInitialReportWithRetry(
    requirements: InitialReportRequirements,
    context: ProjectCreationContext,
    reportLogger: any
  ): Promise<ReportGenerationResult> {
    const startTime = Date.now();
    let lastError: Error | null = null;
    let fallbackUsed = false;

    for (let attempt = 1; attempt <= requirements.maxRetries + 1; attempt++) {
      try {
        reportLogger.info(`Task 5.3: Attempting initial report generation (attempt ${attempt}/${requirements.maxRetries + 1})`, {
          projectId: requirements.projectId,
          attempt,
          correlationId: context.correlationId
        });

        // Import and initialize service
        const { InitialComparativeReportService } = await import('./reports/initialComparativeReportService');
        const reportService = new InitialComparativeReportService();

        // Configure report options based on attempt
        const reportOptions = {
          template: requirements.template,
          priority: requirements.priority,
          timeout: requirements.timeout,
          fallbackToPartialData: attempt > 1, // Use fallback after first failure
          notifyOnCompletion: true,
          requireFreshSnapshots: attempt === 1, // Only require fresh on first attempt
          forceGeneration: attempt > 1,
          correlationId: context.correlationId,
          retryAttempt: attempt > 1 ? attempt : undefined,
          task53Implementation: true
        };

        // Generate report
        const report = await reportService.generateInitialComparativeReport(
          requirements.projectId,
          reportOptions
        );

        // Success - track and return
        trackBusinessEvent('initial_report_generated_via_ensure_service', {
          projectId: requirements.projectId,
          reportId: report.id,
          reportTitle: report.title,
          attempt,
          correlationId: context.correlationId,
          processingTime: Date.now() - startTime,
          creationMethod: context.creationMethod,
          task: 'Task 5.3'
        });

        reportLogger.info('Task 5.3: Initial report generated successfully', {
          projectId: requirements.projectId,
          reportId: report.id,
          reportTitle: report.title,
          attempt,
          processingTime: Date.now() - startTime,
          correlationId: context.correlationId
        });

        return {
          success: true,
          reportId: report.id,
          reportTitle: report.title,
          attempts: attempt,
          processingTime: Date.now() - startTime,
          fallbackUsed: reportOptions.fallbackToPartialData,
          correlationId: context.correlationId
        };

      } catch (error) {
        lastError = error as Error;
        
        reportLogger.warn(`Task 5.3: Report generation attempt ${attempt} failed`, {
          projectId: requirements.projectId,
          attempt,
          error: lastError.message,
          willRetry: attempt <= requirements.maxRetries,
          correlationId: context.correlationId
        });

        // Wait before retry with exponential backoff
        if (attempt <= requirements.maxRetries) {
          const waitTime = Math.min(2000 * Math.pow(2, attempt - 1), 30000); // Max 30 seconds
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }

    // All attempts failed - return failure result
    reportLogger.error('Task 5.3: All report generation attempts failed', lastError!, {
      projectId: requirements.projectId,
      totalAttempts: requirements.maxRetries + 1,
      correlationId: context.correlationId,
      processingTime: Date.now() - startTime
    });

    return {
      success: false,
      attempts: requirements.maxRetries + 1,
      processingTime: Date.now() - startTime,
      error: lastError?.message || 'Unknown error',
      fallbackUsed,
      correlationId: context.correlationId
    };
  }

  /**
   * Task 5.3: Validate report generation success
   */
  private async validateReportGenerationSuccess(
    projectId: string,
    reportId: string,
    reportLogger: any
  ): Promise<void> {
    try {
      const generatedReport = await this.prisma.report.findUnique({
        where: { id: reportId },
        select: {
          id: true,
          name: true,
          status: true,
          isInitialReport: true,
          projectId: true,
          createdAt: true
        }
      });

      if (!generatedReport) {
        throw new Error('Generated report not found in database');
      }

      if (generatedReport.projectId !== projectId) {
        throw new Error('Generated report associated with wrong project');
      }

      if (!generatedReport.isInitialReport) {
        reportLogger.warn('Task 5.3: Generated report not marked as initial report', {
          projectId,
          reportId
        });
      }

      reportLogger.info('Task 5.3: Report generation success validated', {
        projectId,
        reportId,
        reportStatus: generatedReport.status,
        isInitialReport: generatedReport.isInitialReport
      });

    } catch (error) {
      reportLogger.error('Task 5.3: Report validation failed', error as Error, {
        projectId,
        reportId
      });
      throw error;
    }
  }

  /**
   * Task 5.3: Get processing status for a project
   */
  async getProcessingStatus(projectId: string): Promise<{
    isProcessing: boolean;
    retryCount: number;
    estimatedCompletion?: Date;
  }> {
    return {
      isProcessing: this.processingQueue.has(projectId),
      retryCount: this.retryQueue.get(projectId) || 0,
      estimatedCompletion: this.processingQueue.has(projectId) 
        ? new Date(Date.now() + 180000) // Estimate 3 minutes
        : undefined
    };
  }

  /**
   * Task 5.3: Cleanup resources
   */
  async cleanup(): Promise<void> {
    try {
      // Wait for any ongoing processing to complete
      const ongoingProcesses = Array.from(this.processingQueue.values());
      if (ongoingProcesses.length > 0) {
        await Promise.allSettled(ongoingProcesses);
      }

      // Clear queues
      this.processingQueue.clear();
      this.retryQueue.clear();

      // Disconnect database
      await this.prisma.$disconnect();
    } catch (error) {
      logger.error('Failed to cleanup ProjectInitialReportEnsureService', error as Error);
    }
  }
}

/**
 * Task 5.3: Global instance for service reuse
 */
let globalEnsureService: ProjectInitialReportEnsureService | null = null;

/**
 * Task 5.3: Get or create global ensure service instance
 */
export function getProjectInitialReportEnsureService(): ProjectInitialReportEnsureService {
  if (!globalEnsureService) {
    globalEnsureService = new ProjectInitialReportEnsureService();
  }
  return globalEnsureService;
}

/**
 * Task 5.3: Convenience function for easy integration
 */
export async function ensureProjectHasInitialReport(
  projectId: string,
  context?: Partial<ProjectCreationContext>
): Promise<ReportGenerationResult> {
  const service = getProjectInitialReportEnsureService();
  return await service.ensureInitialComparativeReport(projectId, context);
} 