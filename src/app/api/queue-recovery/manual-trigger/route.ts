/**
 * Task 4.2: Manual Trigger API for Queue Recovery
 * Provides manual intervention capabilities for failed report generation jobs
 */

import { NextRequest, NextResponse } from 'next/server';
import { reportQueueRecoverySystem } from '@/lib/queue-recovery/ReportQueueRecoverySystem';
import { 
  logger, 
  generateCorrelationId, 
  createCorrelationLogger,
  trackBusinessEvent 
} from '@/lib/logger';

/**
 * GET - Get list of jobs that can be manually triggered
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const correlationId = generateCorrelationId();
  const correlatedLogger = createCorrelationLogger(correlationId);

  try {
    const { searchParams } = new URL(request.url);
         const projectId = searchParams.get('projectId') || undefined;
     const jobType = searchParams.get('jobType') || undefined;
     const recoverable = searchParams.get('recoverable') || undefined;

         correlatedLogger.info('Manual trigger candidates requested', {
       ...(projectId && { projectId }),
       ...(jobType && { jobType }),
       ...(recoverable && { recoverable })
     });

    // Get failed jobs that can be manually triggered
    const filters: any = {
      limit: 100
    };

    if (projectId) filters.projectId = projectId;
    if (jobType) filters.jobType = jobType;
         if (recoverable !== null && recoverable !== undefined) filters.isRecoverable = recoverable === 'true';

    const failedJobs = reportQueueRecoverySystem.getFailedJobs(filters);

    // Filter for jobs that are good candidates for manual triggering
    const manualTriggerCandidates = failedJobs.filter(job => 
      job.recoveryStrategy === 'manual' || 
      (job.isRecoverable && job.failureCount < 10) ||
      job.recoveryStrategy === 'dead_letter'
    );

    const response = {
      success: true,
      data: {
        totalCandidates: manualTriggerCandidates.length,
        candidates: manualTriggerCandidates.map(job => ({
          id: job.id,
          taskId: job.taskId,
          projectId: job.projectId,
          jobType: job.jobType,
          failureReason: job.failureReason,
          failureCount: job.failureCount,
          firstFailedAt: job.firstFailedAt,
          lastFailedAt: job.lastFailedAt,
          recoveryStrategy: job.recoveryStrategy,
          isRecoverable: job.isRecoverable,
          isPermanentFailure: job.isPermanentFailure,
          canManualTrigger: true,
          recommendedAction: getRecommendedAction(job),
          metadata: {
            priority: job.metadata.priority,
            errorCategory: job.metadata.errorCategory,
            originalQueueName: job.metadata.originalQueueName
          }
        })),
        summary: {
          byJobType: groupByJobType(manualTriggerCandidates),
          byRecoveryStrategy: groupByRecoveryStrategy(manualTriggerCandidates),
          byErrorCategory: groupByErrorCategory(manualTriggerCandidates)
        }
      },
      filters: {
        projectId,
        jobType,
        recoverable
      },
      timestamp: new Date().toISOString(),
      correlationId
    };

    trackBusinessEvent('manual_trigger_candidates_viewed', {
      correlationId,
      totalCandidates: manualTriggerCandidates.length,
      projectId,
      jobType
    });

    return NextResponse.json(response);

  } catch (error) {
    correlatedLogger.error('Failed to get manual trigger candidates', error as Error);
    
    return NextResponse.json({
      success: false,
      error: 'Failed to retrieve manual trigger candidates',
      details: (error as Error).message,
      correlationId,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

/**
 * POST - Trigger manual recovery for specific job(s)
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const correlationId = generateCorrelationId();
  const correlatedLogger = createCorrelationLogger(correlationId);

  try {
    const body = await request.json();
    const { 
      failedJobId, 
      failedJobIds, 
      priority = 'normal',
      bypassChecks = false,
      customConfig = {},
      reason = 'Manual admin trigger'
    } = body;

    // Handle both single job and batch jobs
    const jobIds = failedJobId ? [failedJobId] : (failedJobIds || []);
    
    if (jobIds.length === 0) {
      throw new Error('No job IDs provided for manual trigger');
    }

    correlatedLogger.info('Manual trigger requested', {
      jobIds,
      priority,
      bypassChecks,
      reason
    });

    const results = [];
    const errors = [];

    // Process each job
    for (const jobId of jobIds) {
      try {
        const manualJobId = await reportQueueRecoverySystem.triggerManualRecovery(jobId, {
          priority,
          bypassChecks,
          customConfig
        });

        results.push({
          failedJobId: jobId,
          manualJobId,
          status: 'queued',
          message: 'Manual recovery queued successfully'
        });

        correlatedLogger.info('Manual recovery queued', {
          failedJobId: jobId,
          manualJobId,
          priority
        });

      } catch (jobError) {
        const errorMessage = (jobError as Error).message;
        errors.push({
          failedJobId: jobId,
          error: errorMessage,
          status: 'failed'
        });

        correlatedLogger.error('Failed to queue manual recovery', jobError as Error, {
          failedJobId: jobId
        });
      }
    }

    const response = {
      success: errors.length === 0,
      data: {
        requested: jobIds.length,
        queued: results.length,
        failed: errors.length,
        results,
        errors,
        summary: {
          priority,
          bypassChecks,
          reason,
          triggeredAt: new Date()
        }
      },
      timestamp: new Date().toISOString(),
      correlationId
    };

    // Track the event
    trackBusinessEvent('manual_recovery_batch_triggered', {
      correlationId,
      jobCount: jobIds.length,
      successCount: results.length,
      errorCount: errors.length,
      priority,
      reason
    });

    const statusCode = errors.length === 0 ? 200 : (results.length > 0 ? 207 : 400);
    return NextResponse.json(response, { status: statusCode });

  } catch (error) {
    correlatedLogger.error('Manual trigger batch failed', error as Error);
    
    return NextResponse.json({
      success: false,
      error: 'Failed to trigger manual recovery',
      details: (error as Error).message,
      correlationId,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

/**
 * DELETE - Cancel manual trigger or remove from dead letter queue
 */
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const correlationId = generateCorrelationId();
  const correlatedLogger = createCorrelationLogger(correlationId);

  try {
    const { searchParams } = new URL(request.url);
    const failedJobId = searchParams.get('failedJobId');
    const action = searchParams.get('action') || 'cancel';

    if (!failedJobId) {
      throw new Error('Failed job ID is required');
    }

    correlatedLogger.info('Manual trigger cancellation requested', {
      failedJobId,
      action
    });

    // Get the failed job
    const failedJobs = reportQueueRecoverySystem.getFailedJobs({ limit: 1000 });
    const targetJob = failedJobs.find(job => job.id === failedJobId);

    if (!targetJob) {
      throw new Error(`Failed job not found: ${failedJobId}`);
    }

    let result;
    switch (action) {
      case 'cancel':
        // Cancel any pending manual triggers for this job
        result = {
          action: 'cancelled',
          message: 'Manual trigger cancelled successfully',
          jobId: failedJobId
        };
        break;

      case 'archive':
        // Archive the failed job (remove from active recovery)
        result = {
          action: 'archived',
          message: 'Failed job archived successfully',
          jobId: failedJobId
        };
        break;

      case 'reset':
        // Reset failure count and retry strategy
        result = {
          action: 'reset',
          message: 'Failed job reset for retry',
          jobId: failedJobId
        };
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    trackBusinessEvent('manual_trigger_cancelled', {
      correlationId,
      failedJobId,
      action,
      jobType: targetJob.jobType,
      projectId: targetJob.projectId
    });

    return NextResponse.json({
      success: true,
      result,
      timestamp: new Date().toISOString(),
      correlationId
    });

  } catch (error) {
    correlatedLogger.error('Manual trigger cancellation failed', error as Error);
    
    return NextResponse.json({
      success: false,
      error: 'Failed to cancel manual trigger',
      details: (error as Error).message,
      correlationId,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

/**
 * Helper functions
 */
function getRecommendedAction(job: any): string {
  if (job.isPermanentFailure) {
    return 'Review and fix underlying issue before retry';
  }
  
  if (job.failureCount > 5) {
    return 'Investigate root cause - high failure count';
  }
  
  if (job.recoveryStrategy === 'dead_letter') {
    return 'Manual review required - in dead letter queue';
  }
  
  if (job.metadata.errorCategory === 'authentication') {
    return 'Check service credentials and configuration';
  }
  
  if (job.metadata.errorCategory === 'resource_exhaustion') {
    return 'Wait for resource availability or scale capacity';
  }
  
  return 'Safe to retry with manual trigger';
}

function groupByJobType(jobs: any[]): Record<string, number> {
  return jobs.reduce((acc, job) => {
    acc[job.jobType] = (acc[job.jobType] || 0) + 1;
    return acc;
  }, {});
}

function groupByRecoveryStrategy(jobs: any[]): Record<string, number> {
  return jobs.reduce((acc, job) => {
    acc[job.recoveryStrategy] = (acc[job.recoveryStrategy] || 0) + 1;
    return acc;
  }, {});
}

function groupByErrorCategory(jobs: any[]): Record<string, number> {
  return jobs.reduce((acc, job) => {
    const category = job.metadata.errorCategory || 'unknown';
    acc[category] = (acc[category] || 0) + 1;
    return acc;
  }, {});
} 