import { NextRequest, NextResponse } from 'next/server';
import { bedrockInstanceManager } from '@/services/bedrock/instanceManager';
import { BedrockServiceFactory } from '@/services/bedrock/bedrockServiceFactory';
import { logger, generateCorrelationId } from '@/lib/logger';

/**
 * GET /api/bedrock/instances
 * Returns current BedrockService instance status and statistics
 */
export async function GET(request: NextRequest) {
  const correlationId = generateCorrelationId();
  const context = { correlationId, operation: 'getBedrockInstanceStatus', endpoint: 'GET' };

  try {
    logger.info('BedrockService instance status API called', context);

    // Get instance statistics
    const instanceStats = bedrockInstanceManager.getInstanceStats();
    
    // Get health check results
    const healthCheck = bedrockInstanceManager.performHealthCheck();
    
    // Get memory estimation
    const memoryEstimate = bedrockInstanceManager.getMemoryEstimate();

    const response = {
      success: true,
      timestamp: new Date().toISOString(),
      correlationId,
      instances: {
        statistics: instanceStats,
        health: {
          isHealthy: healthCheck.isHealthy,
          issues: healthCheck.issues,
          recommendations: healthCheck.recommendations
        },
        memory: memoryEstimate,
        monitoring: {
          isActive: instanceStats.monitoring.isActive,
          interval: instanceStats.monitoring.interval
        }
      }
    };

    logger.info('BedrockService instance status retrieved successfully', {
      ...context,
      cachedInstances: instanceStats.cachedInstances,
      isHealthy: healthCheck.isHealthy,
      estimatedMemoryMB: memoryEstimate.estimatedTotalMemoryMB
    });

    return NextResponse.json(response);

  } catch (error) {
    logger.error('Failed to get BedrockService instance status', error as Error, context);
    
    return NextResponse.json({
      success: false,
      error: 'Failed to retrieve instance status',
      correlationId,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

/**
 * POST /api/bedrock/instances
 * BedrockService instance management operations (cleanup, monitoring)
 */
export async function POST(request: NextRequest) {
  const correlationId = generateCorrelationId();
  const context = { correlationId, operation: 'manageBedrockInstances', endpoint: 'POST' };

  try {
    const body = await request.json();
    const { action, options = {} } = body;

    logger.info('BedrockService instance management API called', {
      ...context,
      action,
      options
    });

    let result: any = {};

    switch (action) {
      case 'cleanup':
        result = await bedrockInstanceManager.forceCleanup(options);
        break;

      case 'start-monitoring':
        bedrockInstanceManager.startMonitoring();
        result = { monitoring: true };
        break;

      case 'stop-monitoring':
        bedrockInstanceManager.stopMonitoring();
        result = { monitoring: false };
        break;

      case 'clear-cache':
        await BedrockServiceFactory.clearCache(options.provider);
        result = { cacheCleared: true, provider: options.provider };
        break;

      case 'health-check':
        result = bedrockInstanceManager.performHealthCheck();
        break;

      case 'dispose-all':
        await BedrockServiceFactory.disposeAllInstances();
        result = { disposedAll: true };
        break;

      default:
        return NextResponse.json({
          success: false,
          error: `Unknown action: ${action}`,
          availableActions: [
            'cleanup', 
            'start-monitoring', 
            'stop-monitoring', 
            'clear-cache', 
            'health-check', 
            'dispose-all'
          ],
          correlationId
        }, { status: 400 });
    }

    // Get updated statistics after action
    const updatedStats = bedrockInstanceManager.getInstanceStats();

    const response = {
      success: true,
      action,
      result,
      timestamp: new Date().toISOString(),
      correlationId,
      updatedStats
    };

    logger.info('BedrockService instance management operation completed', {
      ...context,
      action,
      cachedInstances: updatedStats.cachedInstances
    });

    return NextResponse.json(response);

  } catch (error) {
    logger.error('BedrockService instance management operation failed', error as Error, context);
    
    return NextResponse.json({
      success: false,
      error: 'Instance management operation failed',
      correlationId,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

/**
 * DELETE /api/bedrock/instances
 * Force cleanup of all BedrockService instances
 */
export async function DELETE(request: NextRequest) {
  const correlationId = generateCorrelationId();
  const context = { correlationId, operation: 'deleteAllBedrockInstances', endpoint: 'DELETE' };

  try {
    logger.warn('Force cleanup of all BedrockService instances requested', context);

    const initialStats = bedrockInstanceManager.getInstanceStats();
    
    // Dispose all instances
    await BedrockServiceFactory.disposeAllInstances();
    
    // Stop monitoring as well
    bedrockInstanceManager.stopMonitoring();

    const finalStats = bedrockInstanceManager.getInstanceStats();

    const response = {
      success: true,
      timestamp: new Date().toISOString(),
      correlationId,
      cleanup: {
        initialInstanceCount: initialStats.cachedInstances,
        finalInstanceCount: finalStats.cachedInstances,
        disposedCount: initialStats.cachedInstances - finalStats.cachedInstances,
        monitoringStopped: true
      }
    };

    logger.warn('All BedrockService instances force cleanup completed', {
      ...context,
      disposedCount: response.cleanup.disposedCount
    });

    return NextResponse.json(response);

  } catch (error) {
    logger.error('Force cleanup of BedrockService instances failed', error as Error, context);
    
    return NextResponse.json({
      success: false,
      error: 'Force cleanup failed',
      correlationId,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
} 