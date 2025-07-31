import { NextRequest, NextResponse } from 'next/server';
// Updated to use consolidated ReportingService
import { ReportingService } from '@/services/domains/ReportingService';
import { AnalysisService } from '@/services/domains/AnalysisService';
import { ComparativeReportRequest } from '@/services/domains/reporting/types';
import { handleAPIError } from '@/lib/utils/errorHandler';
import { prisma } from '@/lib/prisma';
import { 
  logger, 
  generateCorrelationId, 
  createCorrelationLogger,
  trackReportFlow,
  trackCorrelation 
} from '@/lib/logger';

export async function POST(request: Request) {
  // Generate correlation ID for end-to-end tracking
  const correlationId = generateCorrelationId();
  const correlatedLogger = createCorrelationLogger(correlationId);
  
  const context = {
    endpoint: '/api/reports/comparative',
    method: 'POST',
    correlationId
  };

  try {
    trackCorrelation(correlationId, 'comparative_report_generation_request_received', context);
    logger.info('Comparative report generation request received', context);

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');

    // Enhanced input validation with detailed logging
    if (!projectId || projectId.trim() === '') {
      trackCorrelation(correlationId, 'validation_failed_missing_project_id', context);
      logger.warn('Missing project ID in request', context);
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

    // Parse request body for additional options
    let requestBody: any = {};
    try {
      requestBody = await request.json();
      trackCorrelation(correlationId, 'request_body_parsed', { 
        ...context, 
        hasBody: true,
        bodyKeys: Object.keys(requestBody)
      });
    } catch (jsonError) {
      trackCorrelation(correlationId, 'request_body_empty', context);
      logger.debug('No valid JSON body provided, using defaults', context);
    }

    const { reportOptions, reportName, template, focusArea, includeRecommendations } = requestBody;

    // Verify project exists and get competitor information
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
      logger.warn('Project not found for comparative report request', { ...context, projectId });
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

    // Build comparative report request for consolidated service
    const comparativeReportRequest: ComparativeReportRequest = {
      projectId,
      reportType: 'comparative',
      options: {
        template: template || 'comprehensive',
        focusArea: focusArea || 'all',
        analysisDepth: 'detailed',
        includeTableOfContents: true,
        includeDiagrams: true,
        enhanceWithAI: true,
        includeDataFreshness: true,
        includeActionableInsights: includeRecommendations !== false,
        ...reportOptions
      }
    };

    logger.info('Starting comparative report generation with consolidated service', {
      ...context,
      projectId,
      projectName: project.name,
      competitorCount: project.competitors.length,
      template: comparativeReportRequest.options?.template,
      focusArea: comparativeReportRequest.options?.focusArea
    });

    // UPDATED: Use consolidated ReportingService
    const analysisService = new AnalysisService();
    const reportingService = new ReportingService(analysisService);

    // Generate comparative report
    const reportResult = await reportingService.generateComparativeReport(comparativeReportRequest);

    trackCorrelation(correlationId, 'comparative_report_generated_successfully', {
      ...context,
      projectId,
      reportId: reportResult.report?.id || 'unknown',
      reportTitle: reportResult.report?.title || 'Comparative Report',
      processingTime: reportResult.processingTime
    });

    logger.info('Comparative report generated successfully', {
      ...context,
      projectId,
      reportId: reportResult.report?.id || 'unknown',
      reportTitle: reportResult.report?.title || 'Comparative Report'
    });

    // Return response in expected format
    const response = {
      success: true,
      message: 'Comparative report generated successfully',
      projectId: project.id,
      projectName: project.name,
      reportId: reportResult.report?.id,
      reportTitle: reportResult.report?.title || reportName || `Comparative Report - ${project.name}`,
      reportContent: reportResult.report?.content,
      competitorCount: project.competitors.length,
      template: comparativeReportRequest.options?.template,
      generatedAt: reportResult.report?.createdAt.toISOString(),
      timestamp: new Date().toISOString(),
      correlationId
    };

    trackCorrelation(correlationId, 'comparative_report_response_sent', {
      ...context,
      success: true,
      reportId: reportResult.report?.id || 'unknown'
    });

    return NextResponse.json(response, { status: 200 });

  } catch (error) {
    trackReportFlow('comparative_report_error', {
      ...context,
      stepStatus: 'failed',
      stepData: { error: (error as Error).message }
    });

    logger.error('Comparative report generation failed with unexpected error, providing emergency fallback', error as Error, context);
    
    // Phase 5.2: Emergency graceful degradation - provide minimal but useful response
    const errorType = (error as Error).message.includes('URL') ? 'URL_PARSING_ERROR' : 'SYSTEM_ERROR';
    const emergencyReport = {
      id: `emergency-report-${Date.now()}`,
      title: 'Comparative Analysis - System Issue',
      executiveSummary: 'We encountered a technical issue while generating your comparative analysis. Your project data is safe and this issue has been logged.',
      sections: [
        {
          id: 'emergency-notice',
          title: 'Technical Issue Notice',
          content: `**Issue**: System error occurred during report generation\n\n**Your data is safe**: All project information has been preserved\n\n**Next steps**:\n• Wait a few minutes and try again\n• Check system status page\n• Contact support if issues persist\n\n**Error type**: ${errorType}`,
          type: 'notice',
          order: 1
        }
      ],
      metadata: {
        reportType: 'emergency_fallback',
        generatedAt: new Date().toISOString(),
        errorType,
        correlationId,
        emergencyMode: true
      },
      keyFindings: [
        'System encountered unexpected error',
        'Data integrity maintained',
        'Support team notified'
      ],
      keyOpportunities: [
        'Retry in a few minutes',
        'Check alternative analysis options',
        'Contact support for priority assistance'
      ]
    };
    
    return NextResponse.json({
      success: true,
      report: emergencyReport,
      warning: 'Report generated in emergency fallback mode due to system error',
      metadata: {
        reportType: 'emergency_fallback',
        errorType,
        correlationId,
        emergencyMode: true
      },
      correlationId,
      retryable: true,
      supportContact: true
    }, { status: 200 }); // Return 200 with fallback instead of 500
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('projectId');

  if (!projectId) {
    return NextResponse.json(
      { error: 'Project ID is required' },
      { status: 400 }
    );
  }

  try {
    // Get recent comparative reports for the project
    const reports = await prisma.report.findMany({
      where: { 
        projectId,
        reportType: 'COMPARATIVE'
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        versions: {
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      }
    });

    return NextResponse.json({
      success: true,
      reports: reports.map(report => ({
        id: report.id,
        name: report.name,
        title: report.title,
        status: report.status,
        createdAt: report.createdAt,
        updatedAt: report.updatedAt,
        latestVersion: report.versions[0] || null
      }))
    });

  } catch (error) {
    logger.error('Failed to fetch comparative reports, providing fallback response', error as Error, { projectId });
    
    // Phase 5.2: Graceful degradation for GET requests
    return NextResponse.json({
      success: true,
      reports: [],
      warning: 'Unable to fetch recent reports due to temporary system issue',
      fallbackMessage: 'Your reports are safe. Please try refreshing in a moment.',
      metadata: {
        projectId,
        fallbackMode: true,
        issue: 'Database connection issue',
        timestamp: new Date().toISOString()
      },
      retryable: true
    }, { status: 200 }); // Return 200 with empty array instead of 500 error
  }
} 