// Memory monitoring utility for tracking memory usage and performing cleanup
import { logger } from '@/lib/logger';

interface MemoryStats {
  used: number;
  total: number;
  percentage: number;
  rss: number;
  heapUsed: number;
  heapTotal: number;
}

class MemoryManager {
  private memoryThreshold = 0.9; // 90% memory usage threshold
  private checkInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startMonitoring();
  }

  /**
   * Get current memory statistics
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
      rss: memUsage.rss,
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal
    };
  }

  /**
   * Check if memory usage is above threshold
   */
  isMemoryPressure(): boolean {
    const stats = this.getMemoryStats();
    return stats.percentage > this.memoryThreshold;
  }

  /**
   * Perform garbage collection if available
   */
  performGarbageCollection(): void {
    if (global.gc) {
      global.gc();
      logger.info('Garbage collection performed');
    } else {
      logger.warn('Garbage collection not available. Run with --expose-gc flag to enable.');
    }
  }

  /**
   * Start memory monitoring
   */
  private startMonitoring(): void {
    // Check memory every 30 seconds
    this.checkInterval = setInterval(() => {
      const stats = this.getMemoryStats();
      
      if (stats.percentage > this.memoryThreshold) {
        logger.warn('Memory usage high', {
          percentage: (stats.percentage * 100).toFixed(2),
          usedMB: Math.round(stats.used / 1024 / 1024),
          totalMB: Math.round(stats.total / 1024 / 1024)
        });

        // Attempt garbage collection if memory pressure is high
        this.performGarbageCollection();
      }
    }, 30000);
  }

  /**
   * Stop memory monitoring
   */
  stopMonitoring(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
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