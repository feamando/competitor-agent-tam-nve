import { NextRequest, NextResponse } from 'next/server';
import { getCronJobManager } from '@/services/cronJobManager';
import { 
  logger, 
  generateCorrelationId, 
  createCorrelationLogger,
  trackBusinessEvent
} from '@/lib/logger';

/**
 * GET /api/cron-jobs - Get cron job status and health information
 */
export async function GET(request: NextRequest) {
  const correlationId = generateCorrelationId();
  const jobLogger = createCorrelationLogger(correlationId);
  
  try {
    jobLogger.info('Fetching cron job status and health information');
    
    const cronJobManager = getCronJobManager();
    
    // Get job status information
    const jobStatus = cronJobManager.getJobStatus();
    
    // Perform health checks
    const healthStatus = await cronJobManager.performHealthChecks();
    
    // Calculate summary statistics
    const totalJobs = jobStatus.length;
    const activeJobs = jobStatus.filter(job => job.config.isActive).length;
    const healthyJobs = Array.from(healthStatus.values()).filter(health => health.isHealthy).length;
    const unhealthyJobs = Array.from(healthStatus.values()).filter(health => !health.isHealthy).length;
    
    // Get recent executions (last 24 hours)
    const recentExecutions = jobStatus.flatMap(job => job.recentExecutions);
    const successfulExecutions = recentExecutions.filter(exec => exec.status === 'SUCCESS').length;
    const failedExecutions = recentExecutions.filter(exec => exec.status === 'FAILED').length;
    
    const response = {
      correlationId,
      timestamp: new Date().toISOString(),
      summary: {
        totalJobs,
        activeJobs,
        healthyJobs,
        unhealthyJobs,
        recentExecutions: {
          total: recentExecutions.length,
          successful: successfulExecutions,
          failed: failedExecutions,
          successRate: recentExecutions.length > 0 
            ? Math.round((successfulExecutions / recentExecutions.length) * 100) 
            : 0
        }
      },
      jobs: jobStatus.map(job => ({
        id: job.config.id,
        name: job.config.name,
        jobType: job.config.jobType,
        cronPattern: job.config.cronPattern,
        projectId: job.config.projectId,
        isActive: job.config.isActive,
        health: {
          isHealthy: job.health.isHealthy,
          healthStatus: job.health.healthStatus,
          consecutiveFailures: job.health.consecutiveFailures,
          lastHealthCheck: job.health.lastHealthCheck,
          lastSuccessfulExecution: job.health.lastSuccessfulExecution,
          lastFailedExecution: job.health.lastFailedExecution,
          issues: job.health.issues
        },
        recentExecutions: job.recentExecutions.slice(0, 5).map(exec => ({
          executionId: exec.executionId,
          startTime: exec.startTime,
          endTime: exec.endTime,
          status: exec.status,
          duration: exec.duration,
          attempt: exec.attempt,
          error: exec.error
        })),
        createdAt: job.config.createdAt,
        updatedAt: job.config.updatedAt
      }))
    };
    
    trackBusinessEvent('cron_jobs_status_retrieved', {
      correlationId,
      totalJobs,
      activeJobs,
      healthyJobs,
      unhealthyJobs
    });
    
    return NextResponse.json(response);
    
  } catch (error) {
    jobLogger.error('Failed to fetch cron job status', error as Error);
    
    return NextResponse.json(
      {
        error: 'Failed to fetch cron job status',
        message: error instanceof Error ? error.message : 'Unknown error',
        correlationId
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/cron-jobs - Create a new cron job
 */
export async function POST(request: NextRequest) {
  const correlationId = generateCorrelationId();
  const jobLogger = createCorrelationLogger(correlationId);
  
  try {
    const body = await request.json();
    
    jobLogger.info('Creating new cron job', {
      jobId: body.id,
      jobType: body.jobType
    });
    
    const cronJobManager = getCronJobManager();
    
    // Validate required fields
    if (!body.id || !body.name || !body.cronPattern || !body.jobType) {
      return NextResponse.json(
        {
          error: 'Missing required fields',
          message: 'id, name, cronPattern, and jobType are required',
          correlationId
        },
        { status: 400 }
      );
    }
    
    // Create the cron job
    const jobId = await cronJobManager.scheduleJob({
      id: body.id,
      name: body.name,
      cronPattern: body.cronPattern,
      projectId: body.projectId,
      jobType: body.jobType,
      isActive: body.isActive ?? true,
      maxRetries: body.maxRetries ?? 3,
      retryDelayMs: body.retryDelayMs ?? 60000,
      timeoutMs: body.timeoutMs ?? 600000,
      metadata: body.metadata || {}
    });
    
    trackBusinessEvent('cron_job_created_via_api', {
      correlationId,
      jobId,
      jobType: body.jobType
    });
    
    return NextResponse.json({
      success: true,
      jobId,
      message: 'Cron job created successfully',
      correlationId
    });
    
  } catch (error) {
    jobLogger.error('Failed to create cron job', error as Error);
    
    return NextResponse.json(
      {
        error: 'Failed to create cron job',
        message: error instanceof Error ? error.message : 'Unknown error',
        correlationId
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/cron-jobs/[jobId]/[action] - Manage cron jobs (pause/resume)
 */
export async function PUT(request: NextRequest) {
  const correlationId = generateCorrelationId();
  const jobLogger = createCorrelationLogger(correlationId);
  
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');
    const action = searchParams.get('action');
    
    if (!jobId || !action) {
      return NextResponse.json(
        {
          error: 'Missing parameters',
          message: 'jobId and action are required',
          correlationId
        },
        { status: 400 }
      );
    }
    
    const cronJobManager = getCronJobManager();
    
    switch (action) {
      case 'pause':
        await cronJobManager.pauseJob(jobId);
        jobLogger.info('Cron job paused', { jobId });
        break;
        
      case 'resume':
        await cronJobManager.resumeJob(jobId);
        jobLogger.info('Cron job resumed', { jobId });
        break;
        
      default:
        return NextResponse.json(
          {
            error: 'Invalid action',
            message: 'Action must be either "pause" or "resume"',
            correlationId
          },
          { status: 400 }
        );
    }
    
    trackBusinessEvent('cron_job_action_executed', {
      correlationId,
      jobId,
      action
    });
    
    return NextResponse.json({
      success: true,
      message: `Cron job ${action}d successfully`,
      jobId,
      action,
      correlationId
    });
    
  } catch (error) {
    jobLogger.error('Failed to manage cron job', error as Error);
    
    return NextResponse.json(
      {
        error: 'Failed to manage cron job',
        message: error instanceof Error ? error.message : 'Unknown error',
        correlationId
      },
      { status: 500 }
    );
  }
} 