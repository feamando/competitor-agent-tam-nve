import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateCorrelationId, logger, trackEvent, trackError } from '@/lib/logger';
import { ProfileScopedQueries, getCurrentProfileId } from '@/lib/profile/profileUtils';

export async function GET(request: NextRequest) {
  const correlationId = generateCorrelationId();
  const { searchParams } = new URL(request.url);
  
  const projectId = searchParams.get('projectId');
  const limit = parseInt(searchParams.get('limit') || '10');
  const offset = parseInt(searchParams.get('offset') || '0');
  
  const logContext = {
    operation: 'getReports',
    projectId: projectId || 'all',
    limit,
    offset,
    correlationId
  };

  try {
    logger.info('Fetching reports with filters', logContext);

    trackEvent({
      eventType: 'reports_list_request',
      category: 'user_action',
      metadata: { projectId, limit, offset }
    }, logContext);

    // Get current profile ID for scoped access
    const currentProfileId = await getCurrentProfileId();

    // Build where clause with profile scoping - only show reports from projects owned by current profile
    const whereClause: any = {
      project: {
        profileId: currentProfileId
      }
    };
    
    if (projectId) {
      whereClause.projectId = projectId;
    }

    // Fetch reports from database with profile-scoped filtering
    const reports = await prisma.report.findMany({
      where: whereClause,
      include: {
        project: {
          select: {
            id: true,
            name: true,
            profileId: true, // Include profileId for verification
            competitors: {
              select: { id: true }
            }
          }
        },
        competitor: {
          select: {
            id: true,
            name: true
          }
        },
        versions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            version: true,
            createdAt: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      skip: offset,
      take: limit
    });

    // Get total count for pagination with same profile scoping
    const totalCount = await prisma.report.count({
      where: whereClause
    });

    // Transform reports to match expected format
    const transformedReports = reports.map(report => {
      // Determine report type
      let reportType: 'comparative' | 'individual' | 'unknown' = 'unknown';
      let competitorCount = 0;
      
      if (report.name?.toLowerCase().includes('comparative') || 
          report.name?.toLowerCase().includes('competitive analysis') ||
          report.name?.toLowerCase().includes(' vs ') ||
          report.name?.toLowerCase().includes('comparison')) {
        reportType = 'comparative';
        competitorCount = report.project?.competitors?.length || 0;
      } else {
        reportType = 'individual';
        competitorCount = 1;
      }

      return {
        id: report.id,
        projectId: report.projectId,
        projectName: report.project?.name || 'Unknown Project',
        title: report.name,
        description: report.description,
        status: report.status,
        reportType: report.reportType || reportType,
        competitorName: report.competitor?.name || (reportType === 'comparative' ? 'Multiple Competitors' : 'Unknown Competitor'),
        competitorCount,
        createdAt: report.createdAt,
        updatedAt: report.updatedAt,
        latestVersion: report.versions[0] || null,
        downloadUrl: `/api/reports/database/${report.id}`,
        source: 'database'
      };
    });

    const response = {
      success: true,
      reports: transformedReports,
      total: totalCount,
      limit,
      offset,
      hasMore: offset + limit < totalCount,
      correlationId
    };

    trackEvent({
      eventType: 'reports_fetched',
      category: 'system_event',
      metadata: { 
        projectId, 
        reportCount: transformedReports.length,
        totalCount 
      }
    }, logContext);

    logger.info('Reports fetched successfully', {
      ...logContext,
      reportCount: transformedReports.length,
      totalCount
    });

    return NextResponse.json(response);

  } catch (error) {
    logger.error('Failed to fetch reports', error as Error, logContext);
    
    trackError(error as Error, 'getReports', {
      ...logContext,
      service: 'ReportsAPI'
    });

    return NextResponse.json(
      { 
        error: 'Internal Server Error',
        message: 'Failed to fetch reports',
        correlationId 
      }, 
      { status: 500 }
    );
  }
} 