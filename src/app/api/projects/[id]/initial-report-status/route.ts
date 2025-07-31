import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger, generateCorrelationId, trackCorrelation } from '@/lib/logger';
import { handleAPIError } from '@/lib/utils/errorHandler';
import Bull from 'bull';

// Initial Report Status interface as defined in implementation plan
export interface InitialReportStatus {
  projectId: string;
  reportExists: boolean;
  reportId?: string;
  status: 'generating' | 'completed' | 'failed' | 'not_started';
  dataCompletenessScore?: number;
  generatedAt?: string;
  error?: string;
  estimatedCompletionTime?: string;
  competitorSnapshotsStatus: {
    captured: number;
    total: number;
    capturedAt?: string;
    failures?: string[];
  };
  dataFreshness: 'new' | 'existing' | 'mixed' | 'basic';
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const correlationId = generateCorrelationId();
  const { id: projectId } = await context.params;
  
  const logContext = {
    operation: 'getInitialReportStatus',
    projectId,
    correlationId
  };

  try {
    logger.info('Checking initial report status', logContext);

    // 1. Verify project exists
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        name: true,
        competitors: {
          select: {
            id: true,
            name: true,
            website: true
          }
        }
      }
    });

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found', correlationId },
        { status: 404 }
      );
    }

    // 2. Check for existing initial report
    const initialReport = await prisma.report.findFirst({
      where: {
        projectId,
        reportType: 'INITIAL'
      },
      select: {
        id: true,
        createdAt: true,
        status: true,
        description: true,
        versions: {
          select: {
            content: true
          },
          orderBy: {
            createdAt: 'desc'
          },
          take: 1
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // 3. Check queue status for ongoing generation
    const queueStatus = await getInitialReportQueueStatus(projectId);

    // 4. Get competitor snapshots status
    const competitorSnapshotsStatus = await getCompetitorSnapshotsStatus(projectId, project.competitors.length);

    // 5. Determine overall status and extract metadata
    let status: InitialReportStatus['status'] = 'not_started';
    let error: string | undefined;
    let estimatedCompletionTime: string | undefined;
    let dataCompletenessScore: number | undefined;
    let dataFreshness: InitialReportStatus['dataFreshness'] = 'basic';

    if (queueStatus.isGenerating) {
      status = 'generating';
      if (queueStatus.estimatedCompletion) {
        estimatedCompletionTime = queueStatus.estimatedCompletion.toISOString();
      }
    } else if (initialReport) {
      if (initialReport.status === 'COMPLETED') {
        status = 'completed';
      } else if (initialReport.status === 'FAILED') {
        status = 'failed';
        error = initialReport.description || 'Report generation failed';
      } else if (initialReport.status === 'IN_PROGRESS') {
        status = 'generating';
      }

      // Extract metadata from the latest report version
      if (initialReport.versions.length > 0) {
        const reportContent = initialReport.versions[0]?.content as any;
        if (reportContent?.metadata) {
          dataCompletenessScore = reportContent.metadata.dataCompletenessScore;
          dataFreshness = reportContent.metadata.dataFreshness || 'basic';
        }
      }
    }

    // 6. Build response
    const response: InitialReportStatus = {
      projectId,
      reportExists: !!initialReport,
      ...(initialReport?.id && { reportId: initialReport.id }),
      status,
      dataCompletenessScore,
      generatedAt: initialReport?.createdAt?.toISOString(),
      error,
      estimatedCompletionTime,
      competitorSnapshotsStatus,
      dataFreshness
    };

    trackCorrelation(correlationId, 'initial_report_status_retrieved', {
      ...logContext,
      status: response.status,
      reportExists: response.reportExists,
      dataCompletenessScore: response.dataCompletenessScore
    });

    logger.info('Initial report status retrieved successfully', {
      ...logContext,
      status: response.status,
      reportExists: response.reportExists,
      isGenerating: queueStatus.isGenerating
    });

    return NextResponse.json(response);

  } catch (error) {
    logger.error('Failed to get initial report status', error as Error, logContext);
    return handleAPIError(error as Error, correlationId);
  }
}

/**
 * Get queue status for initial report generation
 */
async function getInitialReportQueueStatus(projectId: string): Promise<{
  isGenerating: boolean;
  queuePosition: number;
  estimatedCompletion: Date | null;
}> {
  try {
    // Connect to the high-priority queue used for initial reports
    const initialReportQueue = new Bull('initial-report-generation', {
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD
      }
    });

    // Get queue metrics
    const [active, waiting] = await Promise.all([
      initialReportQueue.getActive(),
      initialReportQueue.getWaiting()
    ]);

    // Check if current project has active/waiting tasks
    const projectTasks = [...active, ...waiting].filter(job => 
      job.data.projectId === projectId
    );

    const isGenerating = projectTasks.length > 0;
    const queuePosition = waiting.findIndex(job => job.data.projectId === projectId) + 1;

    // Estimate completion time
    let estimatedCompletion: Date | null = null;
    if (isGenerating && queuePosition > 0) {
      // Use 45 seconds average for initial reports (per implementation plan)
      const estimatedMs = queuePosition * 45000;
      estimatedCompletion = new Date(Date.now() + estimatedMs);
    }

    // Close the queue connection
    await initialReportQueue.close();

    return {
      isGenerating,
      queuePosition: queuePosition > 0 ? queuePosition : 0,
      estimatedCompletion
    };

  } catch (error) {
    logger.error('Failed to get initial report queue status', error as Error, { projectId });
    
    // Return default status on error
    return {
      isGenerating: false,
      queuePosition: 0,
      estimatedCompletion: null
    };
  }
}

/**
 * Get competitor snapshots status
 */
async function getCompetitorSnapshotsStatus(projectId: string, totalCompetitors: number): Promise<{
  captured: number;
  total: number;
  capturedAt?: string;
  failures?: string[];
}> {
  const logContext = {
    operation: 'getCompetitorSnapshotsStatus',
    projectId,
    totalCompetitors
  };

  try {
    logger.info('Checking competitor snapshots status', logContext);

    // Get all competitors for this project with their latest snapshots
    const projectCompetitors = await prisma.competitor.findMany({
      where: {
        projects: {
          some: {
            id: projectId
          }
        }
      },
      select: {
        id: true,
        name: true,
        snapshots: {
          select: {
            id: true,
            createdAt: true,
            metadata: true,
            captureSuccess: true,
            errorMessage: true
          },
          orderBy: {
            createdAt: 'desc'
          },
          take: 1 // Get only the latest snapshot for each competitor
        }
      }
    });

    logger.debug('Retrieved project competitors', {
      ...logContext,
      competitorsFound: projectCompetitors.length,
      competitorsWithSnapshots: projectCompetitors.filter(c => c.snapshots.length > 0).length
    });

    // Count successfully captured snapshots
    let capturedCount = 0;
    const failures: string[] = [];
    let latestSnapshotDate: Date | null = null;

    for (const competitor of projectCompetitors) {
      const latestSnapshot = competitor.snapshots[0];
      
      if (!latestSnapshot) {
        // No snapshot exists for this competitor
        failures.push(`${competitor.name}: No snapshot captured`);
        continue;
      }

      // Check if snapshot was successful using multiple indicators
      const isSuccessful = isSnapshotSuccessful(latestSnapshot);

      if (isSuccessful) {
        capturedCount++;
        
        // Track the latest successful snapshot date
        if (!latestSnapshotDate || latestSnapshot.createdAt > latestSnapshotDate) {
          latestSnapshotDate = latestSnapshot.createdAt;
        }
      } else {
        // Extract error message from various sources
        const errorMsg = latestSnapshot.errorMessage || 
                        extractErrorFromMetadata(latestSnapshot.metadata) || 
                        'Capture failed';
        failures.push(`${competitor.name}: ${errorMsg}`);
      }
    }

    const result = {
      captured: capturedCount,
      total: totalCompetitors,
      capturedAt: latestSnapshotDate?.toISOString(),
      failures: failures.length > 0 ? failures : undefined
    };

    logger.info('Competitor snapshots status calculated', {
      ...logContext,
      ...result,
      failureCount: failures.length
    });

    return result;

  } catch (error) {
    logger.error('Failed to get competitor snapshots status', error as Error, logContext);
    
    return {
      captured: 0,
      total: totalCompetitors,
      capturedAt: undefined,
      failures: ['Failed to check snapshot status']
    };
  }
}

/**
 * Determine if a snapshot was captured successfully
 */
function isSnapshotSuccessful(snapshot: {
  captureSuccess?: boolean;
  errorMessage?: string | null;
  metadata: any;
}): boolean {
  // Check explicit success flag first
  if (snapshot.captureSuccess === false) {
    return false;
  }

  // Check for explicit error message
  if (snapshot.errorMessage) {
    return false;
  }

  // Check metadata for success indicators
  if (snapshot.metadata) {
    const metadata = snapshot.metadata as any;
    
    // Check explicit status in metadata
    if (metadata.status) {
      return metadata.status === 'completed' || 
             metadata.status === 'success' || 
             metadata.status === 'ok';
    }

    // Check for content indicators (from WebsiteScraper)
    if (metadata.html || metadata.text || metadata.title) {
      // Has meaningful content, likely successful
      return true;
    }

    // Check for scraping indicators (from WebScraperService)  
    if (metadata.content || metadata.textContent || metadata.htmlContent) {
      return true;
    }

    // Check status code if available
    if (metadata.statusCode) {
      return metadata.statusCode >= 200 && metadata.statusCode < 400;
    }
  }

  // Default to successful if captureSuccess is not explicitly false
  return snapshot.captureSuccess !== false;
}

/**
 * Extract error message from snapshot metadata
 */
function extractErrorFromMetadata(metadata: any): string | null {
  if (!metadata) return null;
  
  // Check various error fields that might exist in metadata
  return metadata.error || 
         metadata.errorMessage || 
         metadata.errorDetails || 
         metadata.lastError || 
         null;
} 