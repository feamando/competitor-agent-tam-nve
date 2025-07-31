import { BedrockServiceFactory } from './bedrockServiceFactory';
import { ModelProvider } from './types';
import { logger, generateCorrelationId } from '@/lib/logger';

/**
 * Instance Manager for BedrockService
 * Provides high-level management and monitoring of BedrockService instances
 */
export class BedrockInstanceManager {
  private static instance: BedrockInstanceManager;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private isMonitoring = false;
  private readonly MONITORING_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

  private constructor() {}

  public static getInstance(): BedrockInstanceManager {
    if (!BedrockInstanceManager.instance) {
      BedrockInstanceManager.instance = new BedrockInstanceManager();
    }
    return BedrockInstanceManager.instance;
  }

  /**
   * Start monitoring Bedrock service instances
   */
  public startMonitoring(): void {
    if (this.isMonitoring) {
      return;
    }

    this.isMonitoring = true;
    this.monitoringInterval = setInterval(() => {
      this.logInstanceStatus();
      this.checkInstanceHealth();
    }, this.MONITORING_INTERVAL_MS);

    logger.info('BedrockService instance monitoring started', {
      monitoringInterval: this.MONITORING_INTERVAL_MS
    });
  }

  /**
   * Stop monitoring
   */
  public stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    this.isMonitoring = false;
    logger.info('BedrockService instance monitoring stopped');
  }

  /**
   * Get comprehensive instance statistics
   */
  public getInstanceStats(): {
    cachedInstances: number;
    activeInitializations: number;
    providers: string[];
    oldestInstance?: Date;
    totalAccessCount: number;
    monitoring: {
      isActive: boolean;
      interval: number;
    };
    instanceAge: number | null;
    averageAccessCount: number;
  } {
    const stats = BedrockServiceFactory.getCacheStats();
    const now = new Date();
    
    return {
      ...stats,
      monitoring: {
        isActive: this.isMonitoring,
        interval: this.MONITORING_INTERVAL_MS
      },
      instanceAge: stats.oldestInstance ? 
        now.getTime() - stats.oldestInstance.getTime() : null,
      averageAccessCount: stats.cachedInstances > 0 ? 
        Math.round(stats.totalAccessCount / stats.cachedInstances) : 0
    };
  }

  /**
   * Perform health check on instances
   */
  public performHealthCheck(): {
    isHealthy: boolean;
    issues: string[];
    recommendations: string[];
    stats: {
      cachedInstances: number;
      activeInitializations: number;
      providers: string[];
      oldestInstance?: Date;
      totalAccessCount: number;
      monitoring: {
        isActive: boolean;
        interval: number;
      };
      instanceAge: number | null;
      averageAccessCount: number;
    };
  } {
    const stats = this.getInstanceStats();
    const issues: string[] = [];
    const recommendations: string[] = [];

    // Check for too many cached instances
    if (stats.cachedInstances > 10) {
      issues.push('High number of cached instances');
      recommendations.push('Consider clearing unused instances or reducing TTL');
    }

    // Check for very old instances
    if (stats.instanceAge && stats.instanceAge > 60 * 60 * 1000) { // 1 hour
      issues.push('Very old instances detected');
      recommendations.push('Check if periodic cleanup is working properly');
    }

    // Check for instances with very low access count
    if (stats.averageAccessCount < 2 && stats.cachedInstances > 3) {
      issues.push('Many instances with low access count');
      recommendations.push('Consider reducing instance TTL or improving access patterns');
    }

    // Check for many active initializations (could indicate connection issues)
    if (stats.activeInitializations > 5) {
      issues.push('High number of active initializations');
      recommendations.push('Check AWS Bedrock connectivity or consider connection pooling');
    }

    return {
      isHealthy: issues.length === 0,
      issues,
      recommendations,
      stats
    };
  }

  /**
   * Force cleanup of instances based on criteria
   */
  public async forceCleanup(options: {
    provider?: ModelProvider;
    olderThan?: number; // milliseconds
    lowAccessCount?: number;
    all?: boolean;
  } = {}): Promise<{
    disposedCount: number;
    remainingCount: number;
  }> {
    const correlationId = generateCorrelationId();
    
    logger.info('Starting forced BedrockService instance cleanup', {
      correlationId,
      options
    });

    let disposedCount = 0;

    try {
      if (options.all) {
        const initialCount = BedrockServiceFactory.getCacheStats().cachedInstances;
        await BedrockServiceFactory.disposeAllInstances();
        disposedCount = initialCount;
      } else if (options.provider) {
        const initialCount = BedrockServiceFactory.getCacheStats().cachedInstances;
        await BedrockServiceFactory.disposeProviderInstances(options.provider);
        const remainingCount = BedrockServiceFactory.getCacheStats().cachedInstances;
        disposedCount = initialCount - remainingCount;
      } else {
        // Custom cleanup logic would go here
        // For now, we'll perform a standard cache clear
        const initialCount = BedrockServiceFactory.getCacheStats().cachedInstances;
        await BedrockServiceFactory.clearCache();
        disposedCount = initialCount;
      }

      const remainingCount = BedrockServiceFactory.getCacheStats().cachedInstances;

      logger.info('Forced BedrockService instance cleanup completed', {
        correlationId,
        disposedCount,
        remainingCount
      });

      return { disposedCount, remainingCount };

    } catch (error) {
      logger.error('Forced BedrockService instance cleanup failed', error as Error, {
        correlationId,
        options
      });
      throw error;
    }
  }

  /**
   * Get memory usage estimation for cached instances
   */
  public getMemoryEstimate(): {
    estimatedTotalMemoryMB: number;
    instanceCount: number;
    averageMemoryPerInstanceMB: number;
  } {
    const stats = BedrockServiceFactory.getCacheStats();
    
    // Rough estimation: each BedrockService instance might use ~1-2MB
    // This includes the service object, cached credentials, and internal state
    const averageMemoryPerInstanceMB = 1.5;
    const estimatedTotalMemoryMB = stats.cachedInstances * averageMemoryPerInstanceMB;

    return {
      estimatedTotalMemoryMB: Math.round(estimatedTotalMemoryMB * 100) / 100,
      instanceCount: stats.cachedInstances,
      averageMemoryPerInstanceMB
    };
  }

  private logInstanceStatus(): void {
    const stats = this.getInstanceStats();
    const memoryEstimate = this.getMemoryEstimate();
    
    if (stats.cachedInstances > 0) {
      logger.info('BedrockService instance status report', {
        cachedInstances: stats.cachedInstances,
        activeInitializations: stats.activeInitializations,
        providers: stats.providers,
        totalAccessCount: stats.totalAccessCount,
        averageAccessCount: stats.averageAccessCount,
        oldestInstanceAge: stats.instanceAge ? Math.round(stats.instanceAge / 1000 / 60) : null, // minutes
        estimatedMemoryMB: memoryEstimate.estimatedTotalMemoryMB
      });
    }
  }

  private checkInstanceHealth(): void {
    const healthCheck = this.performHealthCheck();
    
    if (!healthCheck.isHealthy) {
      logger.warn('BedrockService instance health check failed', {
        issues: healthCheck.issues,
        recommendations: healthCheck.recommendations,
        stats: {
          cachedInstances: healthCheck.stats.cachedInstances,
          instanceAge: healthCheck.stats.instanceAge,
          averageAccessCount: healthCheck.stats.averageAccessCount
        }
      });

      // Auto-remediation for critical issues
      if (healthCheck.stats.cachedInstances > 15) {
        logger.warn('CRITICAL: Too many cached BedrockService instances, initiating emergency cleanup');
        this.forceCleanup({ all: false }).catch(error => {
          logger.error('Emergency cleanup failed', error as Error);
        });
      }
    }
  }
}

// Export singleton instance
export const bedrockInstanceManager = BedrockInstanceManager.getInstance(); 