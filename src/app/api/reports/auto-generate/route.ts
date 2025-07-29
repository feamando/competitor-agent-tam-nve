import { NextRequest, NextResponse } from 'next/server';
import { getAutoReportService } from '@/services/autoReportGenerationService';
// Updated to use consolidated ReportingService
import { ReportingService } from '@/services/domains/ReportingService';
import { AnalysisService } from '@/services/domains/AnalysisService';
import { InitialReportOptions } from '@/services/domains/reporting/types';
import { handleAPIError } from '@/lib/utils/errorHandler';
import { prisma } from '@/lib/prisma';
import { 
  logger, 
  generateCorrelationId, 
  createCorrelationLogger,
  trackBusinessEvent,
  trackCorrelation 
} from '@/lib/logger';
import { formatErrorResponse } from '@/constants/errorMessages';

export async function POST(request: Request) {
  const correlationId = generateCorrelationId();
  const correlatedLogger = createCorrelationLogger(correlationId);
  
  const context = {
    endpoint: '/api/reports/auto-generate',
    method: 'POST',
    correlationId
  };

  try {
    trackCorrelation(correlationId, 'auto_report_generation_request_received', context);
    logger.info('Auto report generation request received', context);

    const body = await request.json();
    const { projectId, immediate = true, template = 'comprehensive', notify = true } = body;

    // Enhanced input validation
    if (!projectId || projectId.trim() === '') {
      trackCorrelation(correlationId, 'validation_failed_missing_project_id', context);
      logger.warn('Missing project ID in auto-generate request', context);
      return NextResponse.json(
        { 
          error: 'Project ID is required',
          code: 'MISSING_PROJECT_ID',
          retryable: false,
          correlationId
        },
        { status: 400 }
      );
    }

    const validTemplates = ['comprehensive', 'executive', 'technical', 'strategic'];
    if (!validTemplates.includes(template)) {
      trackCorrelation(correlationId, 'validation_failed_invalid_template', { ...context, template });
      logger.warn('Invalid report template in request', { ...context, template });
      return NextResponse.json(
        { 
          error: `Template must be one of: ${validTemplates.join(', ')}`,
          code: 'INVALID_TEMPLATE',
          retryable: false,
          correlationId
        },
        { status: 400 }
      );
    }

    trackCorrelation(correlationId, 'input_validation_passed', { 
      ...context, 
      projectId, 
      template,
      immediate,
      notify
    });

    // Verify project exists and has competitors
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        competitors: {
          select: { id: true, name: true }
        }
      }
    });

    if (!project) {
      trackCorrelation(correlationId, 'project_not_found', { ...context, projectId });
      logger.warn('Project not found for auto-generate request', { ...context, projectId });
      return NextResponse.json(
        { 
          error: 'Project not found',
          code: 'PROJECT_NOT_FOUND',
          retryable: false,
          correlationId
        },
        { status: 404 }
      );
    }

    if (!project.competitors || project.competitors.length === 0) {
      trackCorrelation(correlationId, 'no_competitors_assigned', { ...context, projectId });
      logger.warn('No competitors assigned to project', { ...context, projectId });
      return NextResponse.json(
        { 
          error: 'No competitors assigned to project',
          code: 'NO_COMPETITORS_ASSIGNED',
          retryable: false,
          correlationId
        },
        { status: 422 }
      );
    }

    trackBusinessEvent('auto_report_manual_trigger_requested', {
      ...context,
      projectId,
      projectName: project.name,
      competitorCount: project.competitors.length,
      template,
      immediate
    });

    logger.info('Starting auto report generation', {
      ...context,
      projectId,
      projectName: project.name,
      competitorCount: project.competitors.length,
      template
    });

    // UPDATED: Use consolidated ReportingService
    const analysisService = new AnalysisService();
    const reportingService = new ReportingService(analysisService);
    
    if (immediate) {
      try {
        // Generate initial comparative report using consolidated service
        logger.info('Generating initial comparative report immediately', {
          ...context,
          projectId,
          projectName: project.name,
          template
        });

        const initialReportOptions: InitialReportOptions = {
          template: template as 'comprehensive' | 'executive' | 'technical' | 'strategic',
          priority: 'high',
          timeout: 120000, // 2 minutes
          fallbackToPartialData: true,
          requireFreshSnapshots: true
        };

        const initialReport = await reportingService.generateInitialReport(
          projectId,
          initialReportOptions
        );

        trackBusinessEvent('initial_comparative_report_generated_successfully', {
          ...context,
          projectId,
          reportId: initialReport.report?.id || 'unknown',
          reportTitle: initialReport.report?.title || 'Initial Report',
          isComparative: true
        });

        logger.info('Initial comparative report generated successfully', {
          ...context,
          projectId,
          reportId: initialReport.report?.id || 'unknown',
          reportTitle: initialReport.report?.title || 'Initial Report'
        });

        const response = {
          success: true,
          projectId: project.id,
          projectName: project.name,
          reportId: initialReport.report?.id,
          reportTitle: initialReport.report?.title,
          reportType: 'comparative',
          competitorCount: project.competitors.length,
          template,
          generatedAt: initialReport.generatedAt.toISOString(),
          timestamp: new Date().toISOString(),
          correlationId
        };

        trackCorrelation(correlationId, 'initial_report_generation_response_sent', {
          ...context,
          success: true,
          reportId: initialReport.report?.id || 'unknown'
        });

        return NextResponse.json(response, { status: 200 });

      } catch (reportError) {
        // Enhanced error classification for better fallback messages
        const errorMessage = (reportError as Error).message;
        const { error: friendlyError } = formatErrorResponse('AI_SERVICE_ERROR', errorMessage, correlationId);
        
        logger.warn('Immediate initial report generation failed, falling back to queue', {
          ...context,
          projectId,
          error: errorMessage,
          errorClassification: friendlyError.code,
          userFriendlyMessage: friendlyError.message
        });

        const autoReportService = getAutoReportService();
        const reportTask = await autoReportService.generateInitialReport(projectId, {
          reportTemplate: template,
          reportName: `Manual Report - ${project.name}`,
          priority: 'high'
        });

        trackBusinessEvent('initial_report_fallback_queued', {
          ...context,
          projectId,
          taskId: reportTask.taskId,
          queuePosition: reportTask.queuePosition,
          fallbackReason: errorMessage,
          friendlyReason: friendlyError.message
        });

        logger.info('Initial report fallback task queued', {
          ...context,
          projectId,
          taskId: reportTask.taskId,
          queuePosition: reportTask.queuePosition,
          friendlyReason: friendlyError.message
        });

        // Get current queue status
        const queueStatus = await autoReportService.getQueueStatus(projectId);

        const response = {
          success: true,
          projectId: project.id,
          projectName: project.name,
          taskId: reportTask.taskId,
          queuePosition: reportTask.queuePosition,
          estimatedCompletion: new Date(Date.now() + (reportTask.queuePosition * 120000)), // 2 min per report
          competitorCount: project.competitors.length,
          template,
          queueStatus,
          fallbackUsed: true,
          fallbackReason: friendlyError.message,
          fallbackDetails: {
            originalError: errorMessage,
            errorCode: friendlyError.code,
            userAction: friendlyError.userAction,
            canRetry: true,
            suggestedWaitTime: '2-3 minutes'
          },
          timestamp: new Date().toISOString(),
          correlationId
        };

        trackCorrelation(correlationId, 'initial_report_fallback_response_sent', {
          ...context,
          success: true,
          taskId: reportTask.taskId,
          friendlyReason: friendlyError.message
        });

        return NextResponse.json(response, { status: 200 });
      }
    } else {
      // Just check current status without generating new report
      const autoReportService = getAutoReportService();
      const queueStatus = await autoReportService.getQueueStatus(projectId);

      const response = {
        success: true,
        projectId: project.id,
        projectName: project.name,
        queueStatus,
        message: 'Queue status retrieved without generating new report',
        timestamp: new Date().toISOString(),
        correlationId
      };

      trackCorrelation(correlationId, 'queue_status_retrieved', {
        ...context,
        projectId,
        isGenerating: queueStatus.isGenerating
      });

      return NextResponse.json(response, { status: 200 });
    }

  } catch (error) {
    trackCorrelation(correlationId, 'unexpected_error_occurred', {
      ...context,
      errorMessage: (error as Error).message
    });

    logger.error('Unexpected error in auto report generation endpoint', error as Error, context);
    
    const errorResponse = handleAPIError(error as Error, 'auto_report_generation', context);
    
    // Add correlation ID to error response
    if (errorResponse instanceof NextResponse) {
      const body = await errorResponse.json();
      return NextResponse.json({
        ...body,
        correlationId
      }, { status: errorResponse.status });
    }
    
    return errorResponse;
  }
} 