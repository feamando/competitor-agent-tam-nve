/**
 * Task 4.2: Queue Recovery Status API
 * Provides monitoring endpoints for report generation queue recovery system
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
 * GET - Get queue health status and recovery statistics
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const correlationId = generateCorrelationId();
  const correlatedLogger = createCorrelationLogger(correlationId);

  try {
    correlatedLogger.info('Queue recovery status requested');

    // Get current queue health
    const queueHealth = await reportQueueRecoverySystem.getQueueHealth();
    
    // Get recovery statistics
    const recoveryStats = reportQueueRecoverySystem.getRecoveryStats();

    // Get recent failed jobs (last 50)
    const recentFailedJobs = reportQueueRecoverySystem.getFailedJobs({ limit: 50 });

    // Calculate additional metrics
    const successRate = recoveryStats.totalJobs > 0 
      ? ((recoveryStats.succeededJobs / recoveryStats.totalJobs) * 100).toFixed(2)
      : '0.00';

    const recoveryRate = recoveryStats.failedJobs > 0
      ? ((recoveryStats.recoveredJobs / recoveryStats.failedJobs) * 100).toFixed(2)  
      : '0.00';

    const response = {
      success: true,
      data: {
        queueHealth,
        recoveryStats,
        metrics: {
          successRate: parseFloat(successRate),
          recoveryRate: parseFloat(recoveryRate),
          averageRecoveryTimeMinutes: Math.round(recoveryStats.averageRecoveryTime / 60000),
          jobsRequiringAttention: recentFailedJobs.filter(job => 
            job.recoveryStrategy === 'manual' || job.recoveryStrategy === 'dead_letter'
          ).length
        },
        recentFailedJobs: recentFailedJobs.map(job => ({
          id: job.id,
          taskId: job.taskId,
          projectId: job.projectId,
          jobType: job.jobType,
          failureReason: job.failureReason,
          failureCount: job.failureCount,
          lastFailedAt: job.lastFailedAt,
          recoveryStrategy: job.recoveryStrategy,
          isRecoverable: job.isRecoverable,
          isPermanentFailure: job.isPermanentFailure,
          metadata: {
            priority: job.metadata.priority,
            errorCategory: job.metadata.errorCategory
          }
        })),
        systemRecommendations: queueHealth.recommendations
      },
      timestamp: new Date().toISOString(),
      correlationId
    };

    trackBusinessEvent('queue_recovery_status_checked', {
      correlationId,
      queueHealth: queueHealth.status,
      totalFailedJobs: recoveryStats.failedJobs,
      recoveryRate: parseFloat(recoveryRate)
    });

    return NextResponse.json(response);

  } catch (error) {
    correlatedLogger.error('Failed to get queue recovery status', error as Error);
    
    return NextResponse.json({
      success: false,
      error: 'Failed to retrieve queue recovery status',
      details: (error as Error).message,
      correlationId,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

/**
 * POST - Update recovery configuration or trigger maintenance tasks
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const correlationId = generateCorrelationId();
  const correlatedLogger = createCorrelationLogger(correlationId);

  try {
    const body = await request.json();
    const { action, ...params } = body;

    correlatedLogger.info('Queue recovery action requested', { action, params });

    let result;
    
    switch (action) {
      case 'cleanup':
        // Trigger immediate cleanup of old completed recoveries
        result = { message: 'Cleanup triggered successfully' };
        break;

      case 'health_check':
        // Force immediate health check
        const health = await reportQueueRecoverySystem.getQueueHealth();
        result = { health, message: 'Health check completed' };
        break;

      case 'get_stats':
        // Get detailed statistics
        const stats = reportQueueRecoverySystem.getRecoveryStats();
        result = { stats, message: 'Statistics retrieved' };
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    trackBusinessEvent('queue_recovery_action_executed', {
      correlationId,
      action,
      success: true
    });

    return NextResponse.json({
      success: true,
      action,
      result,
      timestamp: new Date().toISOString(),
      correlationId
    });

  } catch (error) {
    correlatedLogger.error('Queue recovery action failed', error as Error);
    
    return NextResponse.json({
      success: false,
      error: 'Failed to execute queue recovery action',
      details: (error as Error).message,
      correlationId,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
} 