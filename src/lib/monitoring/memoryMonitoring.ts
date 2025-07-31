// Memory monitoring utility for tracking memory usage and performing cleanup
import { logger } from '@/lib/logger';
import { getMemoryConfig, type MemoryConfig } from '../../../config/memory.config';

interface MemoryStats {
  used: number;
  total: number;
  percentage: number;
  rss: number;
  heapUsed: number;
  heapTotal: number;
  heapUsagePercent: number;
  external: number;
  arrayBuffers: number;
}

interface MemoryAlert {
  level: 'warning' | 'critical';
  message: string;
  stats: MemoryStats;
  timestamp: Date;
}

class MemoryManager {
  private config: MemoryConfig;
  private checkInterval: NodeJS.Timeout | null = null;
  private gcInterval: NodeJS.Timeout | null = null;
  private alertHistory: MemoryAlert[] = [];
  private lastGcTime = 0;

  constructor(config?: MemoryConfig) {
    this.config = config || getMemoryConfig();
    this.startMonitoring();
    this.setupProcessHandlers();
  }

  /**
   * Get current memory statistics with enhanced metrics
   */
  getMemoryStats(): MemoryStats {
    const memUsage = process.memoryUsage();
    const totalMemory = require('os').totalmem();
    const freeMemory = require('os').freemem();
    const usedMemory = totalMemory - freeMemory;

    return {
      used: usedMemory,
      total: totalMemory,
      percentage: (usedMemory / totalMemory),
      rss: Math.round(memUsage.rss / 1024 / 1024), // MB
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
      heapUsagePercent: (memUsage.heapUsed / memUsage.heapTotal) * 100,
      external: Math.round(memUsage.external / 1024 / 1024), // MB
      arrayBuffers: Math.round(memUsage.arrayBuffers / 1024 / 1024) // MB
    };
  }

  /**
   * Check if memory usage is above warning threshold (85%)
   */
  isMemoryPressure(): boolean {
    const stats = this.getMemoryStats();
    return stats.percentage > this.config.warningThreshold || stats.heapUsagePercent > (this.config.warningThreshold * 100);
  }

  /**
   * Check if memory usage is above critical threshold (95%)
   */
  isCriticalMemoryPressure(): boolean {
    const stats = this.getMemoryStats();
    return stats.percentage > this.config.criticalThreshold || stats.heapUsagePercent > (this.config.criticalThreshold * 100);
  }

  /**
   * Perform garbage collection if available and conditions are met
   */
  performGarbageCollection(): boolean {
    const now = Date.now();
    
    // Respect cooldown period
    if (now - this.lastGcTime < this.config.gcCooldownMs) {
      return false;
    }

    if (global.gc) {
      const beforeStats = this.getMemoryStats();
      global.gc();
      this.lastGcTime = now;
      
      const afterStats = this.getMemoryStats();
      const freedMB = beforeStats.heapUsed - afterStats.heapUsed;
      
      logger.info('Garbage collection performed', {
        freedMemoryMB: freedMB,
        beforeHeapMB: beforeStats.heapUsed,
        afterHeapMB: afterStats.heapUsed,
        heapUsagePercent: afterStats.heapUsagePercent.toFixed(2)
      });
      
      return true;
    } else {
      logger.warn('Garbage collection not available. Application started without --expose-gc flag');
      return false;
    }
  }

  /**
   * Enhanced memory monitoring with 85% threshold alerts
   */
  private startMonitoring(): void {
    // Check memory every 30 seconds
    this.checkInterval = setInterval(() => {
      const stats = this.getMemoryStats();
      
      // Warning threshold (85%)
      if (stats.percentage > this.config.warningThreshold || stats.heapUsagePercent > (this.config.warningThreshold * 100)) {
        const alert: MemoryAlert = {
          level: 'warning',
          message: `Memory usage above 85% threshold`,
          stats,
          timestamp: new Date()
        };
        
        this.alertHistory.push(alert);
        
        logger.warn('Memory usage above 85% threshold', {
          systemMemoryPercent: (stats.percentage * 100).toFixed(2),
          heapUsagePercent: stats.heapUsagePercent.toFixed(2),
          usedMB: Math.round(stats.used / 1024 / 1024),
          totalMB: Math.round(stats.total / 1024 / 1024),
          heapUsedMB: stats.heapUsed,
          heapTotalMB: stats.heapTotal
        } as any);

        // Attempt garbage collection for warning level
        this.performGarbageCollection();
      }

      // Critical threshold (95%)
      if (this.isCriticalMemoryPressure()) {
        const alert: MemoryAlert = {
          level: 'critical',
          message: `Critical memory usage above 95% threshold`,
          stats,
          timestamp: new Date()
        };
        
        this.alertHistory.push(alert);
        
        logger.error('CRITICAL: Memory usage above 95% threshold', {
          systemMemoryPercent: (stats.percentage * 100).toFixed(2),
          heapUsagePercent: stats.heapUsagePercent.toFixed(2),
          usedMB: Math.round(stats.used / 1024 / 1024),
          totalMB: Math.round(stats.total / 1024 / 1024),
          heapUsedMB: stats.heapUsed,
          heapTotalMB: stats.heapTotal,
          rss: stats.rss,
          external: stats.external
        } as any);

        // Force garbage collection for critical level
        this.performGarbageCollection();
      }

      // Limit alert history to configured limit
      if (this.alertHistory.length > this.config.alertHistoryLimit) {
        this.alertHistory = this.alertHistory.slice(-this.config.alertHistoryLimit);
      }
      
    }, this.config.monitorIntervalMs);

    // Periodic proactive garbage collection
    this.gcInterval = setInterval(() => {
      const stats = this.getMemoryStats();
      
      // Proactive GC if heap usage is above proactive threshold but below warning threshold
      const proactiveThresholdPercent = this.config.proactiveGcThreshold * 100;
      const warningThresholdPercent = this.config.warningThreshold * 100;
      
      if (stats.heapUsagePercent > proactiveThresholdPercent && stats.heapUsagePercent < warningThresholdPercent) {
        logger.info('Performing proactive garbage collection', {
          heapUsagePercent: stats.heapUsagePercent.toFixed(2),
          proactiveThreshold: proactiveThresholdPercent
        });
        this.performGarbageCollection();
      }
    }, this.config.proactiveGcIntervalMs);
  }

  /**
   * Setup process signal handlers for graceful memory cleanup
   */
  private setupProcessHandlers(): void {
    const cleanup = () => {
      if (global.gc) {
        global.gc();
        logger.info('Final garbage collection performed on process exit');
      }
    };

    process.on('SIGTERM', cleanup);
    process.on('SIGINT', cleanup);
    process.on('exit', cleanup);
  }

  /**
   * Get memory recommendations based on current usage
   */
  getMemoryRecommendations(): string[] {
    const stats = this.getMemoryStats();
    const recommendations: string[] = [];

    if (stats.heapUsagePercent > 90) {
      recommendations.push('Critical: Consider restarting the application');
      recommendations.push('Increase --max-old-space-size if possible');
    } else if (stats.heapUsagePercent > 85) {
      recommendations.push('Warning: Monitor memory usage closely');
      recommendations.push('Consider implementing memory optimization');
    } else if (stats.heapUsagePercent > 70) {
      recommendations.push('Info: Proactive garbage collection recommended');
    }

    if (!global.gc) {
      recommendations.push('Start application with --expose-gc flag for better memory management');
    }

    return recommendations;
  }

  /**
   * Get recent memory alerts
   */
  getRecentAlerts(minutes: number = 60): MemoryAlert[] {
    const cutoff = new Date(Date.now() - (minutes * 60 * 1000));
    return this.alertHistory.filter(alert => alert.timestamp > cutoff);
  }

  /**
   * Get memory history for monitoring dashboards
   */
  async getMemoryHistory(): Promise<any[]> {
    // This would integrate with your monitoring system
    // For now, return recent alerts as history
    return this.getRecentAlerts(60);
  }

  /**
   * Detect potential memory leaks
   */
  async detectMemoryLeaks(): Promise<any> {
    const stats = this.getMemoryStats();
    const recentAlerts = this.getRecentAlerts(30);
    
    return {
      suspiciousGrowth: stats.heapUsagePercent > 80 && recentAlerts.length > 5,
      alertFrequency: recentAlerts.length,
      currentHeapUsage: stats.heapUsagePercent,
      recommendations: this.getMemoryRecommendations()
    };
  }

  /**
   * Get large objects registry (placeholder for advanced monitoring)
   */
  getLargeObjects(): any {
    return {
      note: 'Advanced object tracking would require additional instrumentation',
      heapSnapshot: 'Consider using --inspect for detailed heap analysis'
    };
  }

  /**
   * Stop memory monitoring
   */
  stopMonitoring(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    if (this.gcInterval) {
      clearInterval(this.gcInterval);
      this.gcInterval = null;
    }
  }

  /**
   * Clean up resources and stop monitoring
   */
  cleanup(): void {
    this.stopMonitoring();
  }
}

// Export singleton instance
export const memoryManager = new MemoryManager();

// Export for testing
export { MemoryManager };
export type { MemoryStats }; 