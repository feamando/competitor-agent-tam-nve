/**
 * Task 5.1: Comprehensive Memory Monitoring System
 * Implements real-time memory usage tracking, multi-threshold alerting,
 * and automatic memory cleanup triggers with historical trends
 */

import { logger, generateCorrelationId, createCorrelationLogger, trackBusinessEvent } from '@/lib/logger';
import { createId } from '@paralleldrive/cuid2';

// Memory monitoring interfaces
export interface MemoryThreshold {
  level: 'normal' | 'warning' | 'high' | 'critical';
  percentage: number;
  heapPercentage: number;
  actions: MemoryAction[];
  description: string;
}

export interface MemoryAction {
  type: 'log' | 'gc' | 'alert' | 'emergency' | 'throttle' | 'cleanup';
  priority: 'low' | 'medium' | 'high' | 'critical';
  config?: any;
}

export interface MemorySnapshot {
  timestamp: Date;
  rss: number;          // Resident Set Size in MB
  heapUsed: number;     // Heap used in MB  
  heapTotal: number;    // Heap total in MB
  external: number;     // External memory in MB
  arrayBuffers: number; // Array buffers in MB
  systemUsed: number;   // System memory used in MB
  systemTotal: number;  // System total memory in MB
  systemPercentage: number;  // System memory usage percentage
  heapPercentage: number;    // Heap usage percentage
  gcCount: number;      // Garbage collection count since start
  gcDuration: number;   // Total GC time in ms
  processUptime: number; // Process uptime in seconds
}

export interface MemoryTrend {
  timeWindow: '1m' | '5m' | '15m' | '1h' | '6h' | '24h';
  averageUsage: number;
  peakUsage: number;
  minUsage: number;
  gcFrequency: number;
  alertCount: number;
  trendDirection: 'stable' | 'increasing' | 'decreasing' | 'volatile';
}

export interface MemoryAlert {
  id: string;
  level: MemoryThreshold['level'];
  timestamp: Date;
  snapshot: MemorySnapshot;
  message: string;
  actions: MemoryAction[];
  resolved: boolean;
  resolvedAt?: Date;
  correlationId: string;
}

export interface MemoryMetrics {
  currentSnapshot: MemorySnapshot;
  trends: Record<string, MemoryTrend>;
  recentAlerts: MemoryAlert[];
  recommendations: string[];
  healthStatus: 'healthy' | 'warning' | 'critical' | 'emergency';
  nextCleanupAt: Date;
  autoCleanupEnabled: boolean;
}

/**
 * Comprehensive Memory Monitoring System
 */
export class ComprehensiveMemoryMonitor {
  private static instance: ComprehensiveMemoryMonitor;
  private snapshots: MemorySnapshot[] = [];
  private alerts: MemoryAlert[] = [];
  private gcStats = { count: 0, totalDuration: 0 };
  private monitoringInterval: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private isInitialized = false;

  // Configuration
  private readonly SNAPSHOT_INTERVAL = 5000; // 5 seconds
  private readonly CLEANUP_INTERVAL = 300000; // 5 minutes
  private readonly MAX_SNAPSHOTS = 2880; // 24 hours at 30s intervals
  private readonly MAX_ALERTS = 1000;

  // Memory thresholds with comprehensive actions
  private readonly THRESHOLDS: MemoryThreshold[] = [
    {
      level: 'normal',
      percentage: 0.70, // 70%
      heapPercentage: 70,
      actions: [
        { type: 'log', priority: 'low' }
      ],
      description: 'Normal memory usage - system healthy'
    },
    {
      level: 'warning',
      percentage: 0.85, // 85%
      heapPercentage: 85,
      actions: [
        { type: 'log', priority: 'medium' },
        { type: 'gc', priority: 'medium' },
        { type: 'alert', priority: 'medium' }
      ],
      description: 'Memory usage approaching high levels - monitoring closely'
    },
    {
      level: 'high',
      percentage: 0.90, // 90%
      heapPercentage: 90,
      actions: [
        { type: 'log', priority: 'high' },
        { type: 'gc', priority: 'high' },
        { type: 'alert', priority: 'high' },
        { type: 'cleanup', priority: 'high' },
        { type: 'throttle', priority: 'medium' }
      ],
      description: 'High memory usage detected - active intervention required'
    },
    {
      level: 'critical',
      percentage: 0.95, // 95%
      heapPercentage: 95,
      actions: [
        { type: 'log', priority: 'critical' },
        { type: 'gc', priority: 'critical' },
        { type: 'alert', priority: 'critical' },
        { type: 'cleanup', priority: 'critical' },
        { type: 'throttle', priority: 'high' },
        { type: 'emergency', priority: 'critical' }
      ],
      description: 'Critical memory usage - immediate action required'
    }
  ];

  private constructor() {
    this.initialize();
  }

  public static getInstance(): ComprehensiveMemoryMonitor {
    if (!ComprehensiveMemoryMonitor.instance) {
      ComprehensiveMemoryMonitor.instance = new ComprehensiveMemoryMonitor();
    }
    return ComprehensiveMemoryMonitor.instance;
  }

  /**
   * Initialize comprehensive memory monitoring
   */
  private initialize(): void {
    if (this.isInitialized) return;

    logger.info('Initializing comprehensive memory monitoring system');

    // Take initial snapshot
    this.takeSnapshot();

    // Start real-time monitoring
    this.startRealTimeMonitoring();

    // Start cleanup processes
    this.startAutoCleanup();

    // Setup process handlers
    this.setupProcessHandlers();

    this.isInitialized = true;
    logger.info('Comprehensive memory monitoring system initialized');
  }

  /**
   * Start real-time memory monitoring with configurable intervals
   */
  private startRealTimeMonitoring(): void {
    this.monitoringInterval = setInterval(() => {
      try {
        const snapshot = this.takeSnapshot();
        this.analyzeMemoryUsage(snapshot);
        this.updateTrends();
        this.cleanupOldData();
      } catch (error) {
        logger.error('Error in memory monitoring cycle', error as Error);
      }
    }, this.SNAPSHOT_INTERVAL);

    logger.info('Real-time memory monitoring started', {
      interval: this.SNAPSHOT_INTERVAL,
      maxSnapshots: this.MAX_SNAPSHOTS
    });
  }

  /**
   * Take memory snapshot with comprehensive metrics
   */
  private takeSnapshot(): MemorySnapshot {
    const memUsage = process.memoryUsage();
    const totalMem = require('os').totalmem();
    const freeMem = require('os').freemem();
    const usedMem = totalMem - freeMem;

    const snapshot: MemorySnapshot = {
      timestamp: new Date(),
      rss: Math.round(memUsage.rss / 1024 / 1024),
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      external: Math.round(memUsage.external / 1024 / 1024),
      arrayBuffers: Math.round(memUsage.arrayBuffers / 1024 / 1024),
      systemUsed: Math.round(usedMem / 1024 / 1024),
      systemTotal: Math.round(totalMem / 1024 / 1024),
      systemPercentage: usedMem / totalMem,
      heapPercentage: (memUsage.heapUsed / memUsage.heapTotal) * 100,
      gcCount: this.gcStats.count,
      gcDuration: this.gcStats.totalDuration,
      processUptime: Math.round(process.uptime())
    };

    this.snapshots.push(snapshot);

    // Limit snapshots to prevent memory growth
    if (this.snapshots.length > this.MAX_SNAPSHOTS) {
      this.snapshots = this.snapshots.slice(-this.MAX_SNAPSHOTS);
    }

    return snapshot;
  }

  /**
   * Analyze memory usage and trigger appropriate actions
   */
  private analyzeMemoryUsage(snapshot: MemorySnapshot): void {
    const activeThreshold = this.getActiveThreshold(snapshot);
    
    if (activeThreshold.level !== 'normal') {
      this.triggerMemoryAlert(activeThreshold, snapshot);
      this.executeMemoryActions(activeThreshold.actions, snapshot);
    }

    // Check for memory leaks (continuous growth over time)
    this.detectMemoryLeaks(snapshot);
  }

  /**
   * Get the active memory threshold based on current usage
   */
  private getActiveThreshold(snapshot: MemorySnapshot): MemoryThreshold {
    // Check both system memory and heap usage
    for (let i = this.THRESHOLDS.length - 1; i >= 0; i--) {
      const threshold = this.THRESHOLDS[i];
      if (snapshot.systemPercentage >= threshold.percentage || 
          snapshot.heapPercentage >= threshold.heapPercentage) {
        return threshold;
      }
    }
    return this.THRESHOLDS[0]; // Return normal threshold
  }

  /**
   * Trigger memory alert based on threshold
   */
  private triggerMemoryAlert(threshold: MemoryThreshold, snapshot: MemorySnapshot): void {
    const correlationId = generateCorrelationId();
    const correlatedLogger = createCorrelationLogger(correlationId);

    // Check if we already have a recent alert for this level to avoid spam
    const recentAlert = this.alerts.find(alert => 
      alert.level === threshold.level && 
      !alert.resolved &&
      Date.now() - alert.timestamp.getTime() < 60000 // Within last minute
    );

    if (recentAlert) return;

    const alert: MemoryAlert = {
      id: createId(),
      level: threshold.level,
      timestamp: new Date(),
      snapshot,
      message: threshold.description,
      actions: threshold.actions,
      resolved: false,
      correlationId
    };

    this.alerts.push(alert);

    // Log alert based on severity
    const logContext = {
      level: threshold.level,
      systemMemory: `${(snapshot.systemPercentage * 100).toFixed(1)}%`,
      heapMemory: `${snapshot.heapPercentage.toFixed(1)}%`,
      rss: `${snapshot.rss}MB`,
      heapUsed: `${snapshot.heapUsed}MB`,
      heapTotal: `${snapshot.heapTotal}MB`,
      correlationId
    };

    switch (threshold.level) {
      case 'warning':
        correlatedLogger.warn('Memory usage warning threshold reached', logContext);
        break;
      case 'high':
        correlatedLogger.warn('High memory usage detected', logContext);
        break;
      case 'critical':
        correlatedLogger.error('CRITICAL: Memory usage at dangerous levels', logContext);
        break;
    }

    // Track business event
    trackBusinessEvent('memory_threshold_alert', {
      level: threshold.level,
      systemPercentage: snapshot.systemPercentage * 100,
      heapPercentage: snapshot.heapPercentage,
      correlationId
    });

    // Limit alerts to prevent memory growth
    if (this.alerts.length > this.MAX_ALERTS) {
      this.alerts = this.alerts.slice(-this.MAX_ALERTS);
    }
  }

  /**
   * Execute memory actions based on threshold
   */
  private executeMemoryActions(actions: MemoryAction[], snapshot: MemorySnapshot): void {
    for (const action of actions) {
      try {
        switch (action.type) {
          case 'gc':
            this.performGarbageCollection();
            break;
          case 'cleanup':
            this.performMemoryCleanup(action.priority);
            break;
          case 'throttle':
            this.activateMemoryThrottling(action.priority);
            break;
          case 'emergency':
            this.activateEmergencyMode(snapshot);
            break;
        }
      } catch (error) {
        logger.error(`Failed to execute memory action: ${action.type}`, error as Error);
      }
    }
  }

  /**
   * Perform garbage collection with timing
   */
  private performGarbageCollection(): boolean {
    if (!global.gc) {
      logger.warn('Garbage collection not available - app not started with --expose-gc');
      return false;
    }

    const startTime = Date.now();
    try {
      global.gc();
      const duration = Date.now() - startTime;
      
      this.gcStats.count++;
      this.gcStats.totalDuration += duration;

      logger.info('Garbage collection completed', {
        duration: `${duration}ms`,
        totalGcCount: this.gcStats.count,
        averageGcDuration: `${Math.round(this.gcStats.totalDuration / this.gcStats.count)}ms`
      });

      return true;
    } catch (error) {
      logger.error('Garbage collection failed', error as Error);
      return false;
    }
  }

  /**
   * Perform memory cleanup based on priority
   */
  private performMemoryCleanup(priority: MemoryAction['priority']): void {
    logger.info('Performing memory cleanup', { priority });

    // Clear old snapshots more aggressively
    if (priority === 'high' || priority === 'critical') {
      const keepCount = Math.floor(this.MAX_SNAPSHOTS * 0.5); // Keep only 50%
      this.snapshots = this.snapshots.slice(-keepCount);
    }

    // Clear resolved alerts
    this.alerts = this.alerts.filter(alert => !alert.resolved);

    // Force garbage collection
    this.performGarbageCollection();

    // Clear Node.js internal caches if critical
    if (priority === 'critical') {
      if (global.gc) {
        // Multiple GC cycles for thorough cleanup
        for (let i = 0; i < 3; i++) {
          global.gc();
        }
      }
    }

    logger.info('Memory cleanup completed', { priority });
  }

  /**
   * Activate memory throttling to reduce memory allocation
   */
  private activateMemoryThrottling(priority: MemoryAction['priority']): void {
    logger.warn('Memory throttling activated', { priority });

    // This would integrate with application-specific throttling mechanisms
    // For example, reducing concurrent processing, pausing non-critical operations, etc.
    
    trackBusinessEvent('memory_throttling_activated', {
      priority,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Activate emergency mode for critical memory situations
   */
  private activateEmergencyMode(snapshot: MemorySnapshot): void {
    logger.error('EMERGENCY: Memory usage critical - activating emergency mode', {
      systemMemory: `${(snapshot.systemPercentage * 100).toFixed(1)}%`,
      heapMemory: `${snapshot.heapPercentage.toFixed(1)}%`,
      rss: `${snapshot.rss}MB`
    });

    // Perform aggressive cleanup
    this.performMemoryCleanup('critical');

    // This would integrate with the emergency fallback system from Task 4.1
    trackBusinessEvent('memory_emergency_mode_activated', {
      systemPercentage: snapshot.systemPercentage * 100,
      heapPercentage: snapshot.heapPercentage,
      rss: snapshot.rss,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Detect potential memory leaks
   */
  private detectMemoryLeaks(snapshot: MemorySnapshot): void {
    if (this.snapshots.length < 60) return; // Need at least 5 minutes of data

    const recent = this.snapshots.slice(-60); // Last 5 minutes
    const older = this.snapshots.slice(-120, -60); // 5-10 minutes ago

    if (older.length === 0) return;

    const recentAvg = recent.reduce((sum, s) => sum + s.heapUsed, 0) / recent.length;
    const olderAvg = older.reduce((sum, s) => sum + s.heapUsed, 0) / older.length;

    // Check for consistent growth (>20% increase over 5 minutes)
    const growthPercentage = ((recentAvg - olderAvg) / olderAvg) * 100;

    if (growthPercentage > 20) {
      logger.warn('Potential memory leak detected', {
        growthPercentage: `${growthPercentage.toFixed(1)}%`,
        olderAverage: `${olderAvg.toFixed(1)}MB`,
        recentAverage: `${recentAvg.toFixed(1)}MB`,
        recommendation: 'Monitor closely and consider heap dump analysis'
      });

      trackBusinessEvent('potential_memory_leak_detected', {
        growthPercentage,
        olderAverage: olderAvg,
        recentAverage: recentAvg
      });
    }
  }

  /**
   * Update memory usage trends
   */
  private updateTrends(): void {
    // This would calculate trends for different time windows
    // Implementation would analyze snapshots for patterns
  }

  /**
   * Start automatic cleanup processes
   */
  private startAutoCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.performScheduledCleanup();
    }, this.CLEANUP_INTERVAL);

    logger.info('Automatic memory cleanup scheduled', {
      interval: this.CLEANUP_INTERVAL,
      nextCleanup: new Date(Date.now() + this.CLEANUP_INTERVAL)
    });
  }

  /**
   * Perform scheduled cleanup
   */
  private performScheduledCleanup(): void {
    logger.debug('Performing scheduled memory cleanup');

    // Clean old data
    this.cleanupOldData();

    // Proactive garbage collection if memory usage is moderate
    const latest = this.snapshots[this.snapshots.length - 1];
    if (latest && latest.heapPercentage > 60 && latest.heapPercentage < 85) {
      this.performGarbageCollection();
    }
  }

  /**
   * Clean up old monitoring data
   */
  private cleanupOldData(): void {
    const now = Date.now();
    const cutoff = now - (24 * 60 * 60 * 1000); // 24 hours ago

    // Remove old snapshots
    this.snapshots = this.snapshots.filter(s => s.timestamp.getTime() > cutoff);

    // Remove old resolved alerts
    this.alerts = this.alerts.filter(a => 
      !a.resolved || a.timestamp.getTime() > cutoff
    );
  }

  /**
   * Setup process event handlers
   */
  private setupProcessHandlers(): void {
    const cleanup = () => {
      if (this.monitoringInterval) {
        clearInterval(this.monitoringInterval);
      }
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
      }
      
      // Final cleanup
      this.performGarbageCollection();
      
      logger.info('Memory monitoring system shutdown completed');
    };

    process.on('SIGTERM', cleanup);
    process.on('SIGINT', cleanup);
    process.on('exit', cleanup);
  }

  /**
   * Get comprehensive memory metrics
   */
  public getMemoryMetrics(): MemoryMetrics {
    const currentSnapshot = this.snapshots[this.snapshots.length - 1];
    const recentAlerts = this.alerts.filter(a => 
      Date.now() - a.timestamp.getTime() < 3600000 // Last hour
    ).slice(-10);

    const healthStatus = this.determineHealthStatus(currentSnapshot);
    const recommendations = this.generateRecommendations(currentSnapshot, recentAlerts);

    return {
      currentSnapshot,
      trends: this.calculateTrends(),
      recentAlerts,
      recommendations,
      healthStatus,
      nextCleanupAt: new Date(Date.now() + this.CLEANUP_INTERVAL),
      autoCleanupEnabled: this.cleanupInterval !== null
    };
  }

  /**
   * Determine overall health status
   */
  private determineHealthStatus(snapshot: MemorySnapshot): MemoryMetrics['healthStatus'] {
    if (!snapshot) return 'warning';

    if (snapshot.systemPercentage >= 0.95 || snapshot.heapPercentage >= 95) {
      return 'emergency';
    }
    if (snapshot.systemPercentage >= 0.90 || snapshot.heapPercentage >= 90) {
      return 'critical';
    }
    if (snapshot.systemPercentage >= 0.85 || snapshot.heapPercentage >= 85) {
      return 'warning';
    }
    return 'healthy';
  }

  /**
   * Generate intelligent recommendations
   */
  private generateRecommendations(snapshot: MemorySnapshot, alerts: MemoryAlert[]): string[] {
    const recommendations: string[] = [];

    if (!snapshot) return recommendations;

    // High memory usage recommendations
    if (snapshot.heapPercentage > 85) {
      recommendations.push('Consider increasing heap size with --max-old-space-size');
    }

    if (snapshot.systemPercentage > 0.90) {
      recommendations.push('System memory usage is high - consider scaling or reducing load');
    }

    // GC recommendations
    if (!global.gc) {
      recommendations.push('Enable garbage collection with --expose-gc flag for better memory management');
    }

    // Alert-based recommendations
    const criticalAlerts = alerts.filter(a => a.level === 'critical' && !a.resolved);
    if (criticalAlerts.length > 3) {
      recommendations.push('Multiple critical memory alerts - investigate for memory leaks');
    }

    // Growth pattern recommendations
    if (this.snapshots.length > 100) {
      const recent = this.snapshots.slice(-50);
      const avgGrowth = recent.reduce((sum, s, i) => {
        if (i === 0) return sum;
        return sum + (s.heapUsed - recent[i - 1].heapUsed);
      }, 0) / (recent.length - 1);

      if (avgGrowth > 1) { // More than 1MB growth per snapshot
        recommendations.push('Memory usage growing consistently - monitor for potential leaks');
      }
    }

    return recommendations;
  }

  /**
   * Calculate memory trends for different time windows
   */
  private calculateTrends(): Record<string, MemoryTrend> {
    const trends: Record<string, MemoryTrend> = {};
    const now = Date.now();

    // Define time windows
    const windows = {
      '1m': 60000,
      '5m': 300000,
      '15m': 900000,
      '1h': 3600000,
      '6h': 21600000,
      '24h': 86400000
    };

    for (const [window, duration] of Object.entries(windows)) {
      const cutoff = now - duration;
      const windowSnapshots = this.snapshots.filter(s => s.timestamp.getTime() > cutoff);

      if (windowSnapshots.length > 0) {
        const usages = windowSnapshots.map(s => s.heapPercentage);
        const averageUsage = usages.reduce((sum, u) => sum + u, 0) / usages.length;
        const peakUsage = Math.max(...usages);
        const minUsage = Math.min(...usages);

        // Calculate trend direction
        let trendDirection: MemoryTrend['trendDirection'] = 'stable';
        if (windowSnapshots.length > 10) {
          const firstHalf = usages.slice(0, Math.floor(usages.length / 2));
          const secondHalf = usages.slice(Math.floor(usages.length / 2));
          const firstAvg = firstHalf.reduce((sum, u) => sum + u, 0) / firstHalf.length;
          const secondAvg = secondHalf.reduce((sum, u) => sum + u, 0) / secondHalf.length;
          
          const change = ((secondAvg - firstAvg) / firstAvg) * 100;
          if (change > 10) trendDirection = 'increasing';
          else if (change < -10) trendDirection = 'decreasing';
          else if (Math.abs(change) > 5) trendDirection = 'volatile';
        }

        trends[window] = {
          timeWindow: window as MemoryTrend['timeWindow'],
          averageUsage,
          peakUsage,
          minUsage,
          gcFrequency: this.gcStats.count / (duration / 60000), // GCs per minute
          alertCount: this.alerts.filter(a => a.timestamp.getTime() > cutoff).length,
          trendDirection
        };
      }
    }

    return trends;
  }

  /**
   * Force memory cleanup (external trigger)
   */
  public forceCleanup(): boolean {
    logger.info('Manual memory cleanup triggered');
    this.performMemoryCleanup('high');
    return true;
  }

  /**
   * Get current memory snapshot
   */
  public getCurrentSnapshot(): MemorySnapshot | null {
    return this.snapshots[this.snapshots.length - 1] || null;
  }

  /**
   * Get memory alerts for a specific time range
   */
  public getMemoryAlerts(minutes: number = 60): MemoryAlert[] {
    const cutoff = Date.now() - (minutes * 60000);
    return this.alerts.filter(a => a.timestamp.getTime() > cutoff);
  }

  /**
   * Resolve memory alert
   */
  public resolveAlert(alertId: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert && !alert.resolved) {
      alert.resolved = true;
      alert.resolvedAt = new Date();
      logger.info('Memory alert resolved', { alertId, level: alert.level });
      return true;
    }
    return false;
  }
}

// Export singleton instance
export const comprehensiveMemoryMonitor = ComprehensiveMemoryMonitor.getInstance(); 