import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateCorrelationId, logger, trackEvent, trackError } from '@/lib/logger';
import { getCurrentProfileId } from '@/lib/profile/profileUtils';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const correlationId = generateCorrelationId();
  const { id: reportId } = await context.params;
  
  const logContext = {
    operation: 'getReport',
    reportId,
    correlationId
  };

  try {
    logger.info('Fetching report', logContext);

    trackEvent({
      eventType: 'report_view_request',
      category: 'user_action',
      metadata: { reportId }
    }, logContext);

    // Get current profile ID for access control
    const currentProfileId = await getCurrentProfileId();
    
    // Fetch report with profile access control - only allow access if user owns the associated project
    const report = await prisma.report.findFirst({
      where: { 
        id: reportId,
        project: {
          profileId: currentProfileId
        }
      },
      include: {
        versions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            version: true,
            content: true,
            createdAt: true,
            updatedAt: true
          }
        },
        project: {
          select: {
            id: true,
            name: true,
            profileId: true, // Include for verification
            competitors: {
              select: {
                id: true,
                name: true,
                website: true
              }
            }
          }
        },
        competitor: {
          select: {
            id: true,
            name: true,
            website: true,
            industry: true
          }
        }
      }
    });

    if (!report) {
      logger.warn('Report not found', { ...logContext, reportId });
      return NextResponse.json(
        { 
          error: 'Report not found',
          message: `Report with ID ${reportId} does not exist`,
          correlationId 
        },
        { status: 404 }
      );
    }

    // Get the latest version content
    const latestVersion = report.versions[0];
    if (!latestVersion) {
      logger.warn('No report content found', { ...logContext, reportId });
      return NextResponse.json(
        { 
          error: 'No report content found',
          message: 'This report exists but has no content versions',
          correlationId 
        },
        { status: 404 }
      );
    }

    // Build the response with only guaranteed fields
    const response = {
      id: report.id,
      title: report.name,
      description: report.description,
      status: report.status,
      reportType: report.reportType,
      createdAt: report.createdAt,
      updatedAt: report.updatedAt,
      
      // Version information
      version: {
        id: latestVersion.id,
        number: latestVersion.version,
        createdAt: latestVersion.createdAt,
        updatedAt: latestVersion.updatedAt
      },
      
      // Content from the latest version
      content: latestVersion.content,
      
      // Project information
      project: report.project ? {
        id: report.project.id,
        name: report.project.name,
        competitorCount: report.project.competitors?.length || 0,
        competitors: report.project.competitors || []
      } : null,
      
      // Competitor information (for individual reports)
      competitor: report.competitor || null,
      
      // Optional monitoring fields (with safe access)
      monitoring: {
        isInitialReport: (report as any).isInitialReport || false,
        dataCompletenessScore: (report as any).dataCompletenessScore || null,
        dataFreshness: (report as any).dataFreshness || null,
        competitorSnapshotsCaptured: (report as any).competitorSnapshotsCaptured || 0,
        generationStartTime: (report as any).generationStartTime || null,
        generationEndTime: (report as any).generationEndTime || null
      },
      
      // Metadata
      metadata: {
        correlationId,
        viewedAt: new Date().toISOString(),
        reportId
      }
    };

    trackEvent({
      eventType: 'report_viewed',
      category: 'user_action',
      metadata: { 
        reportId,
        reportType: report.reportType,
        projectId: report.project?.id || 'unknown'
      }
    }, logContext);

    logger.info('Report fetched successfully', {
      ...logContext,
      reportType: report.reportType,
      hasContent: !!latestVersion.content,
      projectId: report.project?.id || 'unknown'
    });

    return NextResponse.json(response);

  } catch (error) {
    logger.error('Failed to fetch report', error as Error, logContext);
    
    trackError(error as Error, 'getReport', {
      ...logContext,
      service: 'ReportAPI'
    });

    return NextResponse.json(
      { 
        error: 'Internal Server Error',
        message: 'Failed to fetch report',
        correlationId 
      }, 
      { status: 500 }
    );
  }
}

export async function HEAD(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: reportId } = await context.params;
  
  try {
    // Get current profile ID for access control
    const currentProfileId = await getCurrentProfileId();
    
    // Check if report exists and user has access through project ownership
    const report = await prisma.report.findFirst({
      where: { 
        id: reportId,
        project: {
          profileId: currentProfileId
        }
      },
      select: { id: true, updatedAt: true }
    });

    if (!report) {
      return new NextResponse(null, { status: 404 });
    }

    return new NextResponse(null, { 
      status: 200,
      headers: {
        'Last-Modified': report.updatedAt.toUTCString(),
        'Cache-Control': 'public, max-age=300' // 5 minutes
      }
    });

  } catch (error) {
    return new NextResponse(null, { status: 500 });
  }
} 