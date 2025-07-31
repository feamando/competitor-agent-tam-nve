import { NextRequest, NextResponse } from 'next/server';
import { aiRequestQueue } from '@/lib/queue/aiRequestQueue';
import { queueManager } from '@/lib/queue/queueManager';
import { logger, generateCorrelationId } from '@/lib/logger';

/**
 * GET /api/queue/status
 * Returns current AI request queue status and health information
 */
export async function GET(request: NextRequest) {
  const correlationId = generateCorrelationId();
  const context = { correlationId, operation: 'getQueueStatus', endpoint: 'GET' };

  try {
    logger.info('Queue status API called', context);

    // Get detailed queue status
    const queueStatus = aiRequestQueue.getDetailedStatus();
    
    // Get queue health check
    const healthCheck = queueManager.performHealthCheck();

    // Get basic statistics
    const stats = aiRequestQueue.getStats();

    const response = {
      success: true,
      timestamp: new Date().toISOString(),
      correlationId,
      queue: {
        status: queueStatus,
        health: {
          isHealthy: healthCheck.isHealthy,
          level: queueStatus.queueHealth,
          issues: healthCheck.issues,
          recommendations: healthCheck.recommendations
        },
        statistics: stats,
        performance: {
          averageProcessingTime: Math.round(queueStatus.averageProcessingTime),
          throughput: stats.totalProcessed > 0 ? 
            Math.round((stats.completed / (Date.now() / 1000 / 60))) : 0, // requests per minute
          successRate: stats.totalProcessed > 0 ? 
            Math.round((stats.completed / stats.totalProcessed) * 100) : 100
        }
      }
    };

    logger.info('Queue status retrieved successfully', {
      ...context,
      queueHealth: queueStatus.queueHealth,
      queueSize: queueStatus.queueSize,
      totalProcessed: stats.totalProcessed
    });

    return NextResponse.json(response);

  } catch (error) {
    logger.error('Failed to get queue status', error as Error, context);
    
    return NextResponse.json({
      success: false,
      error: 'Failed to retrieve queue status',
      correlationId,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

/**
 * POST /api/queue/status
 * Queue management operations (pause, resume, clear)
 */
export async function POST(request: NextRequest) {
  const correlationId = generateCorrelationId();
  const context = { correlationId, operation: 'manageQueue', endpoint: 'POST' };

  try {
    const body = await request.json();
    const { action, reason } = body;

    logger.info('Queue management API called', {
      ...context,
      action,
      reason
    });

    switch (action) {
      case 'pause':
        queueManager.emergencyPause(reason || 'Manual pause via API');
        break;

      case 'resume':
        queueManager.emergencyResume(reason || 'Manual resume via API');
        break;

      case 'clear':
        queueManager.emergencyClear(reason || 'Manual clear via API');
        break;

      case 'health-check':
        // Just return health status, no action needed
        break;

      default:
        return NextResponse.json({
          success: false,
          error: `Unknown action: ${action}`,
          availableActions: ['pause', 'resume', 'clear', 'health-check'],
          correlationId
        }, { status: 400 });
    }

    // Get updated status after action
    const updatedStatus = aiRequestQueue.getDetailedStatus();
    const healthCheck = queueManager.performHealthCheck();

    const response = {
      success: true,
      action,
      reason,
      timestamp: new Date().toISOString(),
      correlationId,
      queue: {
        status: updatedStatus,
        health: healthCheck
      }
    };

    logger.info('Queue management operation completed', {
      ...context,
      action,
      newQueueHealth: updatedStatus.queueHealth,
      queueSize: updatedStatus.queueSize
    });

    return NextResponse.json(response);

  } catch (error) {
    logger.error('Queue management operation failed', error as Error, context);
    
    return NextResponse.json({
      success: false,
      error: 'Queue management operation failed',
      correlationId,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
} 