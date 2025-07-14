/**
 * Memory Usage Monitoring API
 * Phase 5.2: Memory Optimization
 * 
 * GET /api/monitoring/memory-usage - Get current memory usage metrics
 * POST /api/monitoring/memory-usage/optimize - Trigger memory optimization
 */

import { NextRequest, NextResponse } from 'next/server';
import { memoryManager } from '@/lib/monitoring/memoryMonitoring';
import { generateCorrelationId } from '@/lib/logger';
import { logger } from '@/lib/logger';
import { withCache } from '@/lib/cache';

// Cache TTL for memory metrics (1 minute)
const MEMORY_METRICS_CACHE_TTL = 60 * 1000;

/**
 * GET /api/monitoring/memory-usage
 * Returns current memory usage metrics and history
 */
export async function GET(request: NextRequest) {
  const correlationId = generateCorrelationId();
  const { searchParams } = new URL(request.url);
  
  // Query parameters
  const includeHistory = searchParams.get('history') === 'true';
  const includeLeakDetection = searchParams.get('leak_detection') === 'true';
  const includeLargeObjects = searchParams.get('large_objects') === 'true';
  
  const context = {
    correlationId,
    endpoint: '/api/monitoring/memory-usage',
    includeHistory,
    includeLeakDetection
  };
  
  try {
    logger.info('Memory usage metrics requested', context);
    
    // Get current memory stats (not cached)
    const currentStats = memoryManager.getMemoryStats();
    
    // Use caching for expensive operations
    const response: any = {
      timestamp: new Date().toISOString(),
      correlationId,
      currentMemory: {
        heapUsedMB: currentStats.heapUsed,
        heapTotalMB: currentStats.heapTotal,
        heapUsagePercent: currentStats.heapUsagePercent,
        rssMB: currentStats.rss,
        externalMB: currentStats.external,
        arrayBuffersMB: currentStats.arrayBuffers
      },
      recommendations: memoryManager.getMemoryRecommendations()
    };
    
    // Include memory history if requested
    if (includeHistory) {
      response.history = await withCache(
        async () => memoryManager.getMemoryHistory(),
        'memory_history',
        {},
        MEMORY_METRICS_CACHE_TTL
      );
    }
    
    // Include leak detection if requested
    if (includeLeakDetection) {
      response.leakDetection = await withCache(
        async () => memoryManager.detectMemoryLeaks(),
        'memory_leak_detection',
        {},
        MEMORY_METRICS_CACHE_TTL
      );
    }
    
    // Include large objects registry if requested
    if (includeLargeObjects) {
      response.largeObjects = memoryManager.getLargeObjects();
    }
    
    // Add status indicator
    if (currentStats.heapUsagePercent > 90) {
      response.status = 'critical';
    } else if (currentStats.heapUsagePercent > 75) {
      response.status = 'warning';
    } else {
      response.status = 'healthy';
    }
    
    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
        'X-Correlation-ID': correlationId
      }
    });
    
  } catch (error) {
    logger.error('Failed to retrieve memory usage metrics', {
      ...context,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    return NextResponse.json({
      error: 'Failed to retrieve memory usage metrics',
      message: error instanceof Error ? error.message : 'Unknown error',
      correlationId
    }, { status: 500 });
  }
}

/**
 * POST /api/monitoring/memory-usage/optimize
 * Triggers memory optimization
 */
export async function POST(request: NextRequest) {
  const correlationId = generateCorrelationId();
  let requestBody;
  
  try {
    requestBody = await request.json();
  } catch {
    requestBody = {};
  }
  
  const options = {
    forceGc: requestBody.forceGc === true,
    clearReferences: requestBody.clearReferences === true
  };
  
  const context = {
    correlationId,
    endpoint: '/api/monitoring/memory-usage/optimize',
    options
  };
  
  try {
    logger.info('Memory optimization requested', context);
    
    // Take snapshot before optimization
    const beforeSnapshot = memoryManager.takeSnapshot('pre-optimization');
    
    // Attempt to start continuous monitoring if requested
    if (requestBody.startMonitoring === true) {
      memoryManager.startMonitoring(
        requestBody.monitoringInterval || undefined
      );
    }
    
    // Attempt to stop continuous monitoring if requested
    if (requestBody.stopMonitoring === true) {
      memoryManager.stopMonitoring();
    }
    
    // Optimize memory
    const afterSnapshot = await import('@/lib/monitoring/memoryMonitoring')
      .then(mod => mod.optimizeMemory(options));
    
    // Calculate improvements
    const heapUsedReduction = beforeSnapshot.heapUsed - afterSnapshot.heapUsed;
    const heapUsedReductionPercent = Math.round((heapUsedReduction / beforeSnapshot.heapUsed) * 100);
    
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      correlationId,
      success: true,
      optimizationApplied: options,
      before: {
        heapUsedMB: beforeSnapshot.heapUsed,
        heapUsagePercent: beforeSnapshot.heapUsagePercent
      },
      after: {
        heapUsedMB: afterSnapshot.heapUsed,
        heapUsagePercent: afterSnapshot.heapUsagePercent
      },
      improvements: {
        heapUsedReductionMB: Math.max(0, heapUsedReduction),
        heapUsedReductionPercent: Math.max(0, heapUsedReductionPercent),
      },
      monitoringStatus: requestBody.startMonitoring ? 'started' : 
                        (requestBody.stopMonitoring ? 'stopped' : 'unchanged'),
      recommendations: memoryManager.getMemoryRecommendations()
    }, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
        'X-Correlation-ID': correlationId
      }
    });
    
  } catch (error) {
    logger.error('Failed to optimize memory', {
      ...context,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    return NextResponse.json({
      error: 'Failed to optimize memory',
      message: error instanceof Error ? error.message : 'Unknown error',
      correlationId
    }, { status: 500 });
  }
} 