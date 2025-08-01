/**
 * Project Creation Integration - Task 5.3 Integration Points
 * 
 * This module provides integration points for the ProjectInitialReportEnsureService
 * to be used across all project creation methods (API, chat, manual).
 * 
 * Key Functions:
 * - Task 5.3: Integration with existing project creation flows
 * - Standardized initial report generation across all creation methods
 * - Centralized configuration and monitoring
 * - Event-driven initial report triggering
 */

import { logger, generateCorrelationId } from '../../lib/logger';
import { 
  ProjectInitialReportEnsureService, 
  getProjectInitialReportEnsureService,
  ensureProjectHasInitialReport 
} from '../ProjectInitialReportEnsureService';

/**
 * Task 5.3: Integration with API project creation
 * 
 * Usage in src/app/api/projects/route.ts:
 * 
 * ```typescript
 * import { integrateInitialReportGenerationForAPI } from '@/services/integrations/projectCreationIntegration';
 * 
 * // After successful project creation
 * const reportResult = await integrateInitialReportGenerationForAPI(
 *   project.id,
 *   json,
 *   correlationId
 * );
 * ```
 */
export async function integrateInitialReportGenerationForAPI(
  projectId: string,
  requestData: any,
  correlationId?: string
): Promise<{
  success: boolean;
  reportId?: string;
  reportTitle?: string;
  processingTime: number;
  error?: string;
}> {
  const startTime = Date.now();
  const context = {
    projectId,
    creationMethod: 'api' as const,
    correlationId: correlationId || generateCorrelationId(),
    userEmail: requestData.userEmail,
    createdAt: new Date(),
    metadata: {
      apiRequest: {
        projectName: requestData.name,
        productName: requestData.productName,
        productWebsite: requestData.productWebsite,
        autoGenerateInitialReport: requestData.autoGenerateInitialReport,
        reportTemplate: requestData.reportTemplate || 'comprehensive'
      }
    }
  };

  try {
    logger.info('Task 5.3: Starting API project initial report integration', {
      projectId,
      correlationId: context.correlationId,
      userEmail: context.userEmail
    });

    // Use the ensure service to guarantee initial report generation
    const result = await ensureProjectHasInitialReport(projectId, context);

    logger.info('Task 5.3: API project initial report integration completed', {
      projectId,
      success: result.success,
      reportId: result.reportId,
      attempts: result.attempts,
      processingTime: result.processingTime,
      correlationId: context.correlationId
    });

    return {
      success: result.success,
      reportId: result.reportId,
      reportTitle: result.reportTitle,
      processingTime: Date.now() - startTime,
      error: result.error
    };

  } catch (error) {
    logger.error('Task 5.3: API project initial report integration failed', error as Error, {
      projectId,
      correlationId: context.correlationId
    });

    return {
      success: false,
      processingTime: Date.now() - startTime,
      error: (error as Error).message
    };
  }
}

/**
 * Task 5.3: Integration with Chat project creation
 * 
 * Usage in src/lib/chat/conversation.ts:
 * 
 * ```typescript
 * import { integrateInitialReportGenerationForChat } from '@/services/integrations/projectCreationIntegration';
 * 
 * // After successful project creation
 * const reportResult = await integrateInitialReportGenerationForChat(
 *   project.id,
 *   this.chatState,
 *   correlationId
 * );
 * ```
 */
export async function integrateInitialReportGenerationForChat(
  projectId: string,
  chatState: any,
  correlationId?: string
): Promise<{
  success: boolean;
  reportId?: string;
  reportTitle?: string;
  processingTime: number;
  error?: string;
}> {
  const startTime = Date.now();
  const context = {
    projectId,
    creationMethod: 'chat' as const,
    correlationId: correlationId || generateCorrelationId(),
    userEmail: chatState.collectedData?.userEmail,
    createdAt: new Date(),
    metadata: {
      chatSession: {
        sessionId: chatState.sessionId,
        projectName: chatState.projectName,
        productName: chatState.collectedData?.productName,
        productUrl: chatState.collectedData?.productUrl,
        reportFrequency: chatState.collectedData?.reportFrequency,
        currentStep: chatState.currentStep
      }
    }
  };

  try {
    logger.info('Task 5.3: Starting Chat project initial report integration', {
      projectId,
      correlationId: context.correlationId,
      userEmail: context.userEmail,
      sessionId: chatState.sessionId
    });

    // Use the ensure service to guarantee initial report generation
    const result = await ensureProjectHasInitialReport(projectId, context);

    logger.info('Task 5.3: Chat project initial report integration completed', {
      projectId,
      success: result.success,
      reportId: result.reportId,
      attempts: result.attempts,
      processingTime: result.processingTime,
      correlationId: context.correlationId
    });

    return {
      success: result.success,
      reportId: result.reportId,
      reportTitle: result.reportTitle,
      processingTime: Date.now() - startTime,
      error: result.error
    };

  } catch (error) {
    logger.error('Task 5.3: Chat project initial report integration failed', error as Error, {
      projectId,
      correlationId: context.correlationId
    });

    return {
      success: false,
      processingTime: Date.now() - startTime,
      error: (error as Error).message
    };
  }
}

/**
 * Task 5.3: Integration for manual/imported projects
 * 
 * Usage for manually created or imported projects:
 * 
 * ```typescript
 * import { integrateInitialReportGenerationForManual } from '@/services/integrations/projectCreationIntegration';
 * 
 * // After manual project creation
 * const reportResult = await integrateInitialReportGenerationForManual(
 *   project.id,
 *   'manual',
 *   { userEmail: 'admin@example.com' }
 * );
 * ```
 */
export async function integrateInitialReportGenerationForManual(
  projectId: string,
  creationMethod: 'manual' | 'import',
  options: {
    userEmail?: string;
    metadata?: Record<string, any>;
    correlationId?: string;
  } = {}
): Promise<{
  success: boolean;
  reportId?: string;
  reportTitle?: string;
  processingTime: number;
  error?: string;
}> {
  const startTime = Date.now();
  const context = {
    projectId,
    creationMethod,
    correlationId: options.correlationId || generateCorrelationId(),
    userEmail: options.userEmail,
    createdAt: new Date(),
    metadata: options.metadata || {}
  };

  try {
    logger.info(`Task 5.3: Starting ${creationMethod} project initial report integration`, {
      projectId,
      correlationId: context.correlationId,
      userEmail: context.userEmail,
      creationMethod
    });

    // Use the ensure service to guarantee initial report generation
    const result = await ensureProjectHasInitialReport(projectId, context);

    logger.info(`Task 5.3: ${creationMethod} project initial report integration completed`, {
      projectId,
      success: result.success,
      reportId: result.reportId,
      attempts: result.attempts,
      processingTime: result.processingTime,
      correlationId: context.correlationId
    });

    return {
      success: result.success,
      reportId: result.reportId,
      reportTitle: result.reportTitle,
      processingTime: Date.now() - startTime,
      error: result.error
    };

  } catch (error) {
    logger.error(`Task 5.3: ${creationMethod} project initial report integration failed`, error as Error, {
      projectId,
      correlationId: context.correlationId
    });

    return {
      success: false,
      processingTime: Date.now() - startTime,
      error: (error as Error).message
    };
  }
}

/**
 * Task 5.3: Batch process initial reports for multiple projects
 * 
 * Useful for ensuring existing projects have initial reports
 */
export async function batchEnsureInitialReports(
  projectIds: string[],
  options: {
    maxConcurrent?: number;
    creationMethod?: 'api' | 'chat' | 'manual' | 'import';
    userEmail?: string;
    correlationId?: string;
  } = {}
): Promise<{
  totalProcessed: number;
  successCount: number;
  failureCount: number;
  results: Array<{
    projectId: string;
    success: boolean;
    reportId?: string;
    error?: string;
  }>;
}> {
  const maxConcurrent = options.maxConcurrent || 5;
  const correlationId = options.correlationId || generateCorrelationId();
  
  logger.info('Task 5.3: Starting batch initial report processing', {
    totalProjects: projectIds.length,
    maxConcurrent,
    correlationId
  });

  const results: Array<{
    projectId: string;
    success: boolean;
    reportId?: string;
    error?: string;
  }> = [];

  // Process in batches to avoid overwhelming the system
  for (let i = 0; i < projectIds.length; i += maxConcurrent) {
    const batch = projectIds.slice(i, i + maxConcurrent);
    
    const batchPromises = batch.map(async (projectId) => {
      try {
        const context = {
          projectId,
          creationMethod: options.creationMethod || 'manual' as const,
          correlationId: `${correlationId}_${projectId}`,
          userEmail: options.userEmail,
          createdAt: new Date(),
          metadata: { batchProcessing: true }
        };

        const result = await ensureProjectHasInitialReport(projectId, context);
        
        return {
          projectId,
          success: result.success,
          reportId: result.reportId,
          error: result.error
        };
      } catch (error) {
        return {
          projectId,
          success: false,
          error: (error as Error).message
        };
      }
    });

    const batchResults = await Promise.allSettled(batchPromises);
    
    batchResults.forEach((result, index) => {
      const projectId = batch[index];
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        results.push({
          projectId,
          success: false,
          error: result.reason?.message || 'Unknown error'
        });
      }
    });

    // Small delay between batches
    if (i + maxConcurrent < projectIds.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  const successCount = results.filter(r => r.success).length;
  const failureCount = results.length - successCount;

  logger.info('Task 5.3: Batch initial report processing completed', {
    totalProcessed: results.length,
    successCount,
    failureCount,
    successRate: Math.round((successCount / results.length) * 100),
    correlationId
  });

  return {
    totalProcessed: results.length,
    successCount,
    failureCount,
    results
  };
}

/**
 * Task 5.3: Check initial report status for a project
 */
export async function checkInitialReportStatus(
  projectId: string
): Promise<{
  hasInitialReport: boolean;
  isProcessing: boolean;
  reportId?: string;
  reportTitle?: string;
  reportStatus?: string;
  createdAt?: Date;
}> {
  try {
    const service = getProjectInitialReportEnsureService();
    const processingStatus = await service.getProcessingStatus(projectId);

    // Also check database for existing report
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();

    try {
      const existingReport = await prisma.report.findFirst({
        where: {
          projectId,
          isInitialReport: true
        },
        select: {
          id: true,
          name: true,
          title: true,
          status: true,
          createdAt: true
        },
        orderBy: { createdAt: 'desc' }
      });

      return {
        hasInitialReport: !!existingReport,
        isProcessing: processingStatus.isProcessing,
        reportId: existingReport?.id,
        reportTitle: existingReport?.name || existingReport?.title,
        reportStatus: existingReport?.status,
        createdAt: existingReport?.createdAt
      };
    } finally {
      await prisma.$disconnect();
    }

  } catch (error) {
    logger.error('Task 5.3: Failed to check initial report status', error as Error, { projectId });
    return {
      hasInitialReport: false,
      isProcessing: false
    };
  }
}

/**
 * Task 5.3: Health check for the initial report ensure service
 */
export async function healthCheckInitialReportService(): Promise<{
  healthy: boolean;
  processingCount: number;
  error?: string;
}> {
  try {
    const service = getProjectInitialReportEnsureService();
    
    // Test basic functionality by checking processing status for a test project
    const testStatus = await service.getProcessingStatus('health-check-test');
    
    return {
      healthy: true,
      processingCount: 0, // Would need to track this in the service
      error: undefined
    };
  } catch (error) {
    return {
      healthy: false,
      processingCount: 0,
      error: (error as Error).message
    };
  }
} 