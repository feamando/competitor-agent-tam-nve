// Memory Monitoring Initializer
// Implementation for Task 1.1 - Address Memory Pressure Issues
// Date: July 29, 2025

import { memoryManager } from './memoryMonitoring';
import { getMemoryConfig, validateMemoryConfig } from '../../../config/memory.config';
import { logger } from '@/lib/logger';

/**
 * Initialize memory monitoring for the application
 * This should be called early in the application startup process
 */
export function initializeMemoryMonitoring(): void {
  try {
    const config = getMemoryConfig();
    
    // Validate memory configuration
    const validationErrors = validateMemoryConfig(config);
    if (validationErrors.length > 0) {
      logger.error('Memory configuration validation failed', {
        errors: validationErrors
      } as any);
      throw new Error(`Memory configuration invalid: ${validationErrors.join(', ')}`);
    }

    // Log memory configuration
    logger.info('Initializing memory monitoring', {
      environment: process.env.NODE_ENV,
      warningThreshold: (config.warningThreshold * 100).toFixed(0) + '%',
      criticalThreshold: (config.criticalThreshold * 100).toFixed(0) + '%',
      maxOldSpaceSize: config.maxOldSpaceSize + 'MB',
      gcEnabled: config.gcEnabled,
      nodeOptions: process.env.NODE_OPTIONS
    });

    // Check if garbage collection is available
    if (!global.gc && config.gcEnabled) {
      logger.warn('Garbage collection not available - application not started with --expose-gc flag', {
        recommendation: 'Add --expose-gc to NODE_OPTIONS for optimal memory management'
      });
    }

    // Log initial memory status
    const initialStats = memoryManager.getMemoryStats();
    logger.info('Initial memory status', {
      heapUsedMB: initialStats.heapUsed,
      heapTotalMB: initialStats.heapTotal,
      heapUsagePercent: initialStats.heapUsagePercent.toFixed(2) + '%',
      rssMB: initialStats.rss,
      systemMemoryUsagePercent: (initialStats.percentage * 100).toFixed(2) + '%'
    });

    // Provide memory recommendations
    const recommendations = memoryManager.getMemoryRecommendations();
    if (recommendations.length > 0) {
      logger.info('Memory recommendations', { recommendations });
    }

    logger.info('Memory monitoring initialized successfully');
    
  } catch (error) {
    logger.error('Failed to initialize memory monitoring', error as Error);
    // Don't throw - we don't want to prevent app startup
    // but we should definitely log this critical issue
  }
}

/**
 * Get current memory status for health checks
 */
export function getMemoryStatus(): {
  status: 'healthy' | 'warning' | 'critical';
  stats: any;
  recommendations: string[];
} {
  const stats = memoryManager.getMemoryStats();
  const recommendations = memoryManager.getMemoryRecommendations();
  
  let status: 'healthy' | 'warning' | 'critical' = 'healthy';
  
  if (memoryManager.isCriticalMemoryPressure()) {
    status = 'critical';
  } else if (memoryManager.isMemoryPressure()) {
    status = 'warning';
  }
  
  return {
    status,
    stats: {
      heapUsedMB: stats.heapUsed,
      heapTotalMB: stats.heapTotal,
      heapUsagePercent: stats.heapUsagePercent,
      rssMB: stats.rss,
      systemMemoryUsagePercent: stats.percentage * 100
    },
    recommendations
  };
}

/**
 * Force garbage collection if available (for emergency situations)
 */
export function forceGarbageCollection(): boolean {
  logger.info('Manual garbage collection requested');
  return memoryManager.performGarbageCollection();
}

/**
 * Get recent memory alerts for monitoring dashboards
 */
export function getRecentMemoryAlerts(minutes: number = 60) {
  return memoryManager.getRecentAlerts(minutes);
}

/**
 * Cleanup memory monitoring (for graceful shutdown)
 */
export function cleanupMemoryMonitoring(): void {
  logger.info('Cleaning up memory monitoring');
  memoryManager.cleanup();
} 