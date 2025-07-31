import { logger } from '@/lib/logger';

// Memory cleanup configuration
export const MEMORY_CLEANUP_CONFIG = {
  MAX_ANALYSIS_TIME_MS: 5 * 60 * 1000, // 5 minutes timeout
  CLEANUP_CHECK_INTERVAL_MS: 30 * 1000, // 30 seconds
  MEMORY_WARNING_THRESHOLD_MB: 500,
  MEMORY_CRITICAL_THRESHOLD_MB: 750,
  MAX_STALLED_ANALYSES: 10,
  STALL_CLEANUP_INTERVAL_MS: 2 * 60 * 1000, // 2 minutes
} as const;

// Analysis tracking for timeout management
export interface AnalysisTracker {
  analysisId: string;
  startTime: number;
  analysisType: string;
  projectId?: string;
  correlationId?: string;
  largeObjects: WeakRef<any>[];
  cleanupCallbacks: Array<() => void>;
  isCompleted: boolean;
}

// Memory usage statistics
export interface MemoryStats {
  heapUsed: number; // MB
  heapTotal: number; // MB
  external: number; // MB
  rss: number; // MB
  timestamp: number;
}

/**
 * Analysis Memory Cleanup Manager
 * Handles memory cleanup for analysis services with timeout management
 */
export class AnalysisMemoryCleanup {
  private static instance: AnalysisMemoryCleanup | null = null;
  private activeAnalyses = new Map<string, AnalysisTracker>();
  private stalledAnalysisTimer?: NodeJS.Timeout;
  private memoryMonitorTimer?: NodeJS.Timeout;
  private cleanupStats = {
    totalCleanups: 0,
    timeoutCleanups: 0,
    memoryThresholdCleanups: 0,
    explicitCleanups: 0,
    averageAnalysisTime: 0,
    lastCleanupTime: Date.now()
  };

  private constructor() {
    this.startStalledAnalysisMonitoring();
    this.startMemoryMonitoring();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): AnalysisMemoryCleanup {
    if (!AnalysisMemoryCleanup.instance) {
      AnalysisMemoryCleanup.instance = new AnalysisMemoryCleanup();
    }
    return AnalysisMemoryCleanup.instance;
  }

  /**
   * Start tracking an analysis for memory cleanup
   */
  public startAnalysisTracking(
    analysisId: string,
    analysisType: string,
    options?: {
      projectId?: string;
      correlationId?: string;
      timeoutMs?: number;
    }
  ): void {
    const memoryBefore = this.getMemoryStats();
    
    const tracker: AnalysisTracker = {
      analysisId,
      startTime: Date.now(),
      analysisType,
      ...(options?.projectId && { projectId: options.projectId }),
      ...(options?.correlationId && { correlationId: options.correlationId }),
      largeObjects: [],
      cleanupCallbacks: [],
      isCompleted: false
    };

    this.activeAnalyses.set(analysisId, tracker);

    const logContext: any = {
      analysisId,
      analysisType,
      memoryUsageMB: memoryBefore.heapUsed,
      activeAnalysesCount: this.activeAnalyses.size
    };
    
    if (options?.projectId) logContext.projectId = options.projectId;
    if (options?.correlationId) logContext.correlationId = options.correlationId;
    
    logger.info('Analysis tracking started', logContext);

    // Set individual analysis timeout if specified
    if (options?.timeoutMs) {
      setTimeout(() => {
        this.cleanupStalledAnalysis(analysisId, 'custom_timeout');
      }, options.timeoutMs);
    }
  }

  /**
   * Register large objects for cleanup tracking
   */
  public registerLargeObject(analysisId: string, obj: any): void {
    const tracker = this.activeAnalyses.get(analysisId);
    if (tracker && obj) {
      tracker.largeObjects.push(new WeakRef(obj));
    }
  }

  /**
   * Register cleanup callback for custom cleanup logic
   */
  public registerCleanupCallback(analysisId: string, callback: () => void): void {
    const tracker = this.activeAnalyses.get(analysisId);
    if (tracker) {
      tracker.cleanupCallbacks.push(callback);
    }
  }

  /**
   * Complete analysis and perform cleanup
   */
  public async completeAnalysis(
    analysisId: string,
    result?: any,
    options?: {
      preserveResult?: boolean;
      customCleanup?: () => Promise<void>;
    }
  ): Promise<void> {
    const tracker = this.activeAnalyses.get(analysisId);
    if (!tracker) {
      logger.warn('Attempted to complete analysis that is not being tracked', { analysisId });
      return;
    }

    const memoryBefore = this.getMemoryStats();
    const analysisTime = Date.now() - tracker.startTime;

    try {
      logger.info('Starting analysis completion cleanup', {
        analysisId,
        analysisType: tracker.analysisType,
        analysisTimeMs: analysisTime,
        memoryBeforeCleanupMB: memoryBefore.heapUsed,
        largeObjectsTracked: tracker.largeObjects.length,
        cleanupCallbacks: tracker.cleanupCallbacks.length
      });

      // Execute custom cleanup if provided
      if (options?.customCleanup) {
        await options.customCleanup();
      }

      // Execute registered cleanup callbacks
      for (const callback of tracker.cleanupCallbacks) {
        try {
          callback();
        } catch (error) {
          logger.warn('Cleanup callback failed', {
            analysisId,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      // Clear large objects explicitly
      await this.clearLargeObjects(tracker);

      // Clear result object if not preserving
      if (result && !options?.preserveResult) {
        this.clearObjectMemory(result);
      }

      // Mark as completed
      tracker.isCompleted = true;

      // Update statistics
      this.updateCleanupStats(analysisTime, 'explicit');

      const memoryAfter = this.getMemoryStats();
      const memoryFreed = memoryBefore.heapUsed - memoryAfter.heapUsed;

      const completionLogContext: any = {
        analysisId,
        analysisType: tracker.analysisType,
        analysisTimeMs: analysisTime,
        memoryBeforeCleanupMB: memoryBefore.heapUsed,
        memoryAfterCleanupMB: memoryAfter.heapUsed,
        memoryFreedMB: memoryFreed
      };
      if (tracker.correlationId) completionLogContext.correlationId = tracker.correlationId;
      
      logger.info('Analysis completion cleanup finished', completionLogContext);

    } catch (error) {
      logger.error('Error during analysis completion cleanup', error as Error, {
        analysisId,
        analysisType: tracker.analysisType
      });
    } finally {
      // Remove tracker
      this.activeAnalyses.delete(analysisId);
    }
  }

  /**
   * Force cleanup of stalled analysis
   */
  public async cleanupStalledAnalysis(analysisId: string, reason: string): Promise<void> {
    const tracker = this.activeAnalyses.get(analysisId);
    if (!tracker || tracker.isCompleted) {
      return;
    }

    const stalledTime = Date.now() - tracker.startTime;
    
    logger.warn('Cleaning up stalled analysis', {
      analysisId,
      analysisType: tracker.analysisType,
      stalledTimeMs: stalledTime,
      reason,
      projectId: tracker.projectId,
      correlationId: tracker.correlationId
    });

    try {
      // Execute cleanup callbacks
      for (const callback of tracker.cleanupCallbacks) {
        try {
          callback();
        } catch (error) {
          logger.warn('Stalled analysis cleanup callback failed', {
            analysisId,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      // Clear large objects
      await this.clearLargeObjects(tracker);

      // Update statistics
      this.updateCleanupStats(stalledTime, 'timeout');

      // Mark as completed
      tracker.isCompleted = true;

    } catch (error) {
      logger.error('Error during stalled analysis cleanup', error as Error, {
        analysisId,
        reason
      });
    } finally {
      // Remove tracker
      this.activeAnalyses.delete(analysisId);
    }
  }

  /**
   * Get current memory statistics
   */
  public getMemoryStats(): MemoryStats {
    try {
      const usage = process.memoryUsage();
      return {
        heapUsed: Math.round(usage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(usage.heapTotal / 1024 / 1024),
        external: Math.round(usage.external / 1024 / 1024),
        rss: Math.round(usage.rss / 1024 / 1024),
        timestamp: Date.now()
      };
    } catch (error) {
      logger.warn('Could not get memory stats', { error: error instanceof Error ? error.message : 'Unknown error' });
      return {
        heapUsed: 0,
        heapTotal: 0,
        external: 0,
        rss: 0,
        timestamp: Date.now()
      };
    }
  }

  /**
   * Log memory usage for analysis
   */
  public logMemoryUsage(
    operation: string,
    analysisId?: string,
    additionalContext?: Record<string, any>
  ): MemoryStats {
    const stats = this.getMemoryStats();
    
    const logContext = {
      operation,
      analysisId,
      memoryStats: stats,
      activeAnalysesCount: this.activeAnalyses.size,
      ...additionalContext
    };

    if (stats.heapUsed >= MEMORY_CLEANUP_CONFIG.MEMORY_CRITICAL_THRESHOLD_MB) {
      logger.error('Critical memory usage detected', logContext);
      this.triggerEmergencyCleanup();
    } else if (stats.heapUsed >= MEMORY_CLEANUP_CONFIG.MEMORY_WARNING_THRESHOLD_MB) {
      logger.warn('High memory usage detected', logContext);
    } else {
      logger.info(`Memory usage during ${operation}`, logContext);
    }

    return stats;
  }

  /**
   * Get cleanup statistics
   */
  public getCleanupStats(): typeof this.cleanupStats {
    return { ...this.cleanupStats };
  }

  /**
   * Force cleanup of all active analyses (emergency)
   */
  public async emergencyCleanupAll(): Promise<void> {
    logger.warn('Emergency cleanup of all active analyses triggered', {
      activeAnalysesCount: this.activeAnalyses.size
    });

    const analysisIds = Array.from(this.activeAnalyses.keys());
    
    await Promise.allSettled(
      analysisIds.map(id => this.cleanupStalledAnalysis(id, 'emergency_cleanup'))
    );

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }

    logger.info('Emergency cleanup completed', {
      cleanedAnalyses: analysisIds.length
    });
  }

  /**
   * Shutdown cleanup manager
   */
  public shutdown(): void {
    if (this.stalledAnalysisTimer) {
      clearInterval(this.stalledAnalysisTimer);
    }
    if (this.memoryMonitorTimer) {
      clearInterval(this.memoryMonitorTimer);
    }
    
    // Cleanup remaining analyses
    this.emergencyCleanupAll();
    
    AnalysisMemoryCleanup.instance = null;
    
    logger.info('Analysis memory cleanup manager shutdown completed');
  }

  /**
   * Private methods
   */
  private startStalledAnalysisMonitoring(): void {
    this.stalledAnalysisTimer = setInterval(() => {
      this.cleanupStalledAnalyses();
    }, MEMORY_CLEANUP_CONFIG.STALL_CLEANUP_INTERVAL_MS);
  }

  private startMemoryMonitoring(): void {
    this.memoryMonitorTimer = setInterval(() => {
      const stats = this.getMemoryStats();
      
      if (stats.heapUsed >= MEMORY_CLEANUP_CONFIG.MEMORY_WARNING_THRESHOLD_MB) {
        this.triggerMemoryThresholdCleanup();
      }
    }, MEMORY_CLEANUP_CONFIG.CLEANUP_CHECK_INTERVAL_MS);
  }

  private cleanupStalledAnalyses(): void {
    const now = Date.now();
    const stalledAnalyses: string[] = [];

    for (const [analysisId, tracker] of this.activeAnalyses.entries()) {
      if (!tracker.isCompleted && (now - tracker.startTime) > MEMORY_CLEANUP_CONFIG.MAX_ANALYSIS_TIME_MS) {
        stalledAnalyses.push(analysisId);
      }
    }

    if (stalledAnalyses.length > 0) {
      logger.warn('Found stalled analyses for cleanup', {
        stalledCount: stalledAnalyses.length,
        maxAnalysisTimeMs: MEMORY_CLEANUP_CONFIG.MAX_ANALYSIS_TIME_MS
      });

      stalledAnalyses.forEach(id => {
        this.cleanupStalledAnalysis(id, 'timeout');
      });
    }
  }

  private async clearLargeObjects(tracker: AnalysisTracker): Promise<void> {
    let clearedCount = 0;
    
    for (const objRef of tracker.largeObjects) {
      const obj = objRef.deref();
      if (obj) {
        this.clearObjectMemory(obj);
        clearedCount++;
      }
    }

    // Clear the array
    tracker.largeObjects.length = 0;
    tracker.cleanupCallbacks.length = 0;

    logger.debug('Large objects cleared', {
      analysisId: tracker.analysisId,
      clearedCount
    });
  }

  private clearObjectMemory(obj: any): void {
    if (!obj || typeof obj !== 'object') {
      return;
    }

    try {
      // Clear arrays
      if (Array.isArray(obj)) {
        obj.length = 0;
        return;
      }

      // Clear object properties
      for (const key of Object.keys(obj)) {
        if (obj.hasOwnProperty(key)) {
          const value = obj[key];
          
          // Recursively clear nested objects
          if (value && typeof value === 'object') {
            this.clearObjectMemory(value);
          }
          
          // Set to null
          obj[key] = null;
        }
      }
    } catch (error) {
      // Ignore errors when clearing objects (they might be frozen/sealed)
    }
  }

  private triggerMemoryThresholdCleanup(): void {
    logger.warn('Memory threshold cleanup triggered', {
      currentMemoryMB: this.getMemoryStats().heapUsed,
      threshold: MEMORY_CLEANUP_CONFIG.MEMORY_WARNING_THRESHOLD_MB,
      activeAnalysesCount: this.activeAnalyses.size
    });

    // Find oldest analyses for cleanup
    const oldestAnalyses = Array.from(this.activeAnalyses.entries())
      .sort(([,a], [,b]) => a.startTime - b.startTime)
      .slice(0, Math.min(3, this.activeAnalyses.size)) // Cleanup up to 3 oldest
      .map(([id]) => id);

    oldestAnalyses.forEach(id => {
      this.cleanupStalledAnalysis(id, 'memory_threshold');
    });

    this.updateCleanupStats(0, 'memory_threshold');
  }

  private triggerEmergencyCleanup(): void {
    logger.error('Emergency memory cleanup triggered - critical memory usage', {
      currentMemoryMB: this.getMemoryStats().heapUsed,
      criticalThreshold: MEMORY_CLEANUP_CONFIG.MEMORY_CRITICAL_THRESHOLD_MB,
      activeAnalysesCount: this.activeAnalyses.size
    });

    // Cleanup all analyses immediately
    this.emergencyCleanupAll();
  }

  private updateCleanupStats(analysisTime: number, cleanupType: 'explicit' | 'timeout' | 'memory_threshold'): void {
    this.cleanupStats.totalCleanups++;
    this.cleanupStats.lastCleanupTime = Date.now();

    switch (cleanupType) {
      case 'explicit':
        this.cleanupStats.explicitCleanups++;
        break;
      case 'timeout':
        this.cleanupStats.timeoutCleanups++;
        break;
      case 'memory_threshold':
        this.cleanupStats.memoryThresholdCleanups++;
        break;
    }

    // Update average analysis time (only for completed analyses)
    if (cleanupType === 'explicit' && analysisTime > 0) {
      const totalTime = this.cleanupStats.averageAnalysisTime * (this.cleanupStats.explicitCleanups - 1) + analysisTime;
      this.cleanupStats.averageAnalysisTime = Math.round(totalTime / this.cleanupStats.explicitCleanups);
    }
  }
}

/**
 * Utility functions for analysis memory management
 */
export const analysisMemoryUtils = {
  /**
   * Decorator for automatic memory cleanup
   */
  withMemoryCleanup<T extends any[], R>(
    analysisType: string,
    fn: (...args: T) => Promise<R>
  ) {
    return async (...args: T): Promise<R> => {
      const cleanup = AnalysisMemoryCleanup.getInstance();
      const analysisId = `${analysisType}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      cleanup.startAnalysisTracking(analysisId, analysisType);
      cleanup.logMemoryUsage(`${analysisType}_start`, analysisId);
      
      try {
        const result = await fn(...args);
        cleanup.logMemoryUsage(`${analysisType}_end`, analysisId);
        await cleanup.completeAnalysis(analysisId, result);
        return result;
      } catch (error) {
        cleanup.logMemoryUsage(`${analysisType}_error`, analysisId);
        await cleanup.cleanupStalledAnalysis(analysisId, 'function_error');
        throw error;
      }
    };
  },

  /**
   * Create cleanup-aware analysis context
   */
  createAnalysisContext(analysisType: string, options?: {
    projectId?: string;
    correlationId?: string;
    timeoutMs?: number;
  }): {
    analysisId: string;
    cleanup: AnalysisMemoryCleanup;
    registerLargeObject: (obj: any) => void;
    registerCleanupCallback: (callback: () => void) => void;
    complete: (result?: any) => Promise<void>;
  } {
    const cleanup = AnalysisMemoryCleanup.getInstance();
    const analysisId = `${analysisType}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    cleanup.startAnalysisTracking(analysisId, analysisType, options);
    
    return {
      analysisId,
      cleanup,
      registerLargeObject: (obj: any) => cleanup.registerLargeObject(analysisId, obj),
      registerCleanupCallback: (callback: () => void) => cleanup.registerCleanupCallback(analysisId, callback),
      complete: (result?: any) => cleanup.completeAnalysis(analysisId, result)
    };
  }
};

// Export singleton instance getter
export const getAnalysisMemoryCleanup = () => AnalysisMemoryCleanup.getInstance(); 