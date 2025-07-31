import { aiRequestQueue, AIQueueStats } from './aiRequestQueue';
import { logger } from '@/lib/logger';

/**
 * Queue Manager provides high-level operations and monitoring for the AI request queue
 */
export class QueueManager {
  private static instance: QueueManager;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private isMonitoring = false;

  private constructor() {}

  public static getInstance(): QueueManager {
    if (!QueueManager.instance) {
      QueueManager.instance = new QueueManager();
    }
    return QueueManager.instance;
  }

  /**
   * Start monitoring queue health and performance
   */
  public startMonitoring(intervalMs: number = 60000): void {
    if (this.isMonitoring) {
      return;
    }

    this.isMonitoring = true;
    this.monitoringInterval = setInterval(() => {
      this.logQueueStatus();
      this.checkQueueHealth();
    }, intervalMs);

    logger.info('AI Queue monitoring started', {
      interval: intervalMs,
      monitoringActive: this.isMonitoring
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

    logger.info('AI Queue monitoring stopped');
  }

  /**
   * Get comprehensive queue status
   */
  public getStatus() {
    return aiRequestQueue.getDetailedStatus();
  }

  /**
   * Emergency queue management - pause processing
   */
  public emergencyPause(reason: string): void {
    aiRequestQueue.pause();
    logger.error('EMERGENCY: AI request queue paused', new Error(reason), {
      timestamp: new Date().toISOString(),
      queueStatus: this.getStatus()
    });
  }

  /**
   * Resume queue after emergency pause
   */
  public emergencyResume(reason: string): void {
    aiRequestQueue.resume();
    logger.info('AI request queue resumed after emergency', {
      reason,
      timestamp: new Date().toISOString(),
      queueStatus: this.getStatus()
    });
  }

  /**
   * Emergency clear - removes all pending requests
   */
  public emergencyClear(reason: string): void {
    const statusBefore = this.getStatus();
    aiRequestQueue.clear();
    
    logger.error('EMERGENCY: AI request queue cleared', new Error(reason), {
      statusBefore,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Health check - returns detailed health assessment
   */
  public performHealthCheck(): {
    isHealthy: boolean;
    issues: string[];
    recommendations: string[];
    stats: ReturnType<typeof aiRequestQueue.getDetailedStatus>;
  } {
    const stats = this.getStatus();
    const issues: string[] = [];
    const recommendations: string[] = [];

    // Check queue health
    if (stats.queueHealth === 'critical') {
      issues.push('Queue health is critical');
      recommendations.push('Consider clearing queue or restarting service');
    } else if (stats.queueHealth === 'degraded') {
      issues.push('Queue health is degraded');
      recommendations.push('Monitor closely and reduce load if possible');
    }

    // Check queue size
    if (stats.queueSize > 40) {
      issues.push('Queue size is very large');
      recommendations.push('Investigate slow processing or consider rate limiting');
    } else if (stats.queueSize > 20) {
      issues.push('Queue size is growing');
      recommendations.push('Monitor processing times and consider optimization');
    }

    // Check processing times
    if (stats.averageProcessingTime > 120000) { // 2 minutes
      issues.push('Average processing time is very high');
      recommendations.push('Investigate AI service performance or optimize prompts');
    }

    // Check failure rate
    const failureRate = stats.totalProcessed > 0 ? stats.failed / stats.totalProcessed : 0;
    if (failureRate > 0.3) {
      issues.push('High failure rate detected');
      recommendations.push('Check AI service connectivity and error patterns');
    }

    return {
      isHealthy: issues.length === 0,
      issues,
      recommendations,
      stats
    };
  }

  private logQueueStatus(): void {
    const status = this.getStatus();
    
    if (status.totalProcessed > 0) {
      logger.info('AI Queue Status Report', {
        pending: status.pending,
        running: status.running,
        completed: status.completed,
        failed: status.failed,
        totalProcessed: status.totalProcessed,
        averageProcessingTime: Math.round(status.averageProcessingTime),
        queueHealth: status.queueHealth,
        queueSize: status.queueSize
      });
    }
  }

  private checkQueueHealth(): void {
    const healthCheck = this.performHealthCheck();
    
    if (!healthCheck.isHealthy) {
      logger.warn('AI Queue health check failed', {
        issues: healthCheck.issues,
        recommendations: healthCheck.recommendations,
        stats: {
          queueHealth: healthCheck.stats.queueHealth,
          queueSize: healthCheck.stats.queueSize,
          averageProcessingTime: healthCheck.stats.averageProcessingTime,
          pending: healthCheck.stats.pending,
          running: healthCheck.stats.running
        }
      });

      // Auto-remediation for critical issues
      if (healthCheck.stats.queueHealth === 'critical') {
        if (healthCheck.stats.queueSize > 45) {
          logger.error('CRITICAL: Queue size exceeded safe limits, emergency pause activated');
          this.emergencyPause('Queue size exceeded safe limits');
        }
      }
    }
  }
}

// Export singleton instance
export const queueManager = QueueManager.getInstance(); 