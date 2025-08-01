/**
 * Alert Scheduler - Task 7.2
 * 
 * Automated scheduler for orphaned report detection and alerting.
 * Runs periodic checks for orphaned reports and triggers alerts
 * based on configurable schedules and thresholds.
 * 
 * Features:
 * - Configurable check intervals (hourly, daily, custom)
 * - Health monitoring of alert system itself
 * - Graceful error handling and recovery
 * - Performance metrics for alert system
 * - Manual trigger capabilities
 * 
 * Part of TP-013-20250801-project-report-association-fix
 */

import { orphanedReportAlerts, AlertHelpers } from './orphanedReportAlerts';
import { logger, generateCorrelationId } from '@/lib/logger';

export interface AlertSchedulerConfig {
  enabled: boolean;
  schedules: {
    quickCheck: {
      enabled: boolean;
      intervalMinutes: number;  // Quick checks every X minutes
    };
    comprehensive: {
      enabled: boolean;
      intervalMinutes: number;  // Full comprehensive checks every X minutes
    };
    healthCheck: {
      enabled: boolean;
      intervalMinutes: number;  // Alert system health check interval
    };
  };
  maxConsecutiveFailures: number;  // Max failures before alerting about scheduler
  quietHours: {
    enabled: boolean;
    startHour: number;    // 24-hour format (e.g., 22 = 10 PM)
    endHour: number;      // 24-hour format (e.g., 6 = 6 AM)
    timezone: string;     // Timezone for quiet hours
  };
}

const DEFAULT_SCHEDULER_CONFIG: AlertSchedulerConfig = {
  enabled: true,
  schedules: {
    quickCheck: {
      enabled: true,
      intervalMinutes: 15  // Quick check every 15 minutes
    },
    comprehensive: {
      enabled: true,
      intervalMinutes: 60  // Comprehensive check every hour
    },
    healthCheck: {
      enabled: true,
      intervalMinutes: 30  // Health check every 30 minutes
    }
  },
  maxConsecutiveFailures: 3,
  quietHours: {
    enabled: false,  // Disabled by default - alerting 24/7
    startHour: 22,   // 10 PM
    endHour: 6,      // 6 AM
    timezone: 'UTC'
  }
};

export interface SchedulerStats {
  status: 'running' | 'stopped' | 'error';
  uptime: number;
  totalChecks: number;
  successfulChecks: number;
  failedChecks: number;
  consecutiveFailures: number;
  lastSuccessfulCheck: Date | null;
  lastFailedCheck: Date | null;
  averageCheckDuration: number;
  lastCheckResults: {
    timestamp: Date;
    orphanedCount: number;
    alertsTriggered: number;
    alertsSuppressed: number;
    duration: number;
  } | null;
}

/**
 * Alert Scheduler for Orphaned Report Detection
 */
export class AlertScheduler {
  private config: AlertSchedulerConfig;
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private stats: SchedulerStats;
  private startTime: Date;
  private isRunning: boolean = false;
  
  constructor(config?: Partial<AlertSchedulerConfig>) {
    this.config = { ...DEFAULT_SCHEDULER_CONFIG, ...config };
    this.startTime = new Date();
    this.stats = this.initializeStats();
    
    logger.info('AlertScheduler initialized', {
      config: this.config,
      enabled: this.config.enabled
    });
  }
  
  /**
   * Start the alert scheduler
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('AlertScheduler is already running');
      return;
    }
    
    if (!this.config.enabled) {
      logger.info('AlertScheduler is disabled by configuration');
      return;
    }
    
    this.isRunning = true;
    this.startTime = new Date();
    this.stats = this.initializeStats();
    
    logger.info('Starting AlertScheduler', {
      quickCheckInterval: this.config.schedules.quickCheck.intervalMinutes,
      comprehensiveCheckInterval: this.config.schedules.comprehensive.intervalMinutes,
      healthCheckInterval: this.config.schedules.healthCheck.intervalMinutes
    });
    
    // Schedule different types of checks
    if (this.config.schedules.quickCheck.enabled) {
      this.scheduleQuickChecks();
    }
    
    if (this.config.schedules.comprehensive.enabled) {
      this.scheduleComprehensiveChecks();
    }
    
    if (this.config.schedules.healthCheck.enabled) {
      this.scheduleHealthChecks();
    }
    
    // Initial immediate check
    setTimeout(() => {
      this.runComprehensiveCheck();
    }, 1000);
    
    logger.info('AlertScheduler started successfully');
  }
  
  /**
   * Stop the alert scheduler
   */
  stop(): void {
    if (!this.isRunning) {
      logger.warn('AlertScheduler is not running');
      return;
    }
    
    logger.info('Stopping AlertScheduler');
    
    // Clear all timers
    this.timers.forEach((timer, name) => {
      clearInterval(timer);
      logger.debug(`Cleared timer: ${name}`);
    });
    this.timers.clear();
    
    this.isRunning = false;
    this.stats.status = 'stopped';
    
    logger.info('AlertScheduler stopped');
  }
  
  /**
   * Restart the alert scheduler
   */
  restart(): void {
    logger.info('Restarting AlertScheduler');
    this.stop();
    setTimeout(() => {
      this.start();
    }, 1000);
  }
  
  /**
   * Schedule quick checks (lightweight, frequent)
   */
  private scheduleQuickChecks(): void {
    const intervalMs = this.config.schedules.quickCheck.intervalMinutes * 60 * 1000;
    
    const timer = setInterval(async () => {
      if (this.isInQuietHours()) {
        logger.debug('Skipping quick check due to quiet hours');
        return;
      }
      
      await this.runQuickCheck();
    }, intervalMs);
    
    this.timers.set('quickCheck', timer);
    
    logger.info('Quick checks scheduled', {
      intervalMinutes: this.config.schedules.quickCheck.intervalMinutes
    });
  }
  
  /**
   * Schedule comprehensive checks (full analysis, less frequent)
   */
  private scheduleComprehensiveChecks(): void {
    const intervalMs = this.config.schedules.comprehensive.intervalMinutes * 60 * 1000;
    
    const timer = setInterval(async () => {
      await this.runComprehensiveCheck();
    }, intervalMs);
    
    this.timers.set('comprehensiveCheck', timer);
    
    logger.info('Comprehensive checks scheduled', {
      intervalMinutes: this.config.schedules.comprehensive.intervalMinutes
    });
  }
  
  /**
   * Schedule health checks (system health monitoring)
   */
  private scheduleHealthChecks(): void {
    const intervalMs = this.config.schedules.healthCheck.intervalMinutes * 60 * 1000;
    
    const timer = setInterval(async () => {
      await this.runHealthCheck();
    }, intervalMs);
    
    this.timers.set('healthCheck', timer);
    
    logger.info('Health checks scheduled', {
      intervalMinutes: this.config.schedules.healthCheck.intervalMinutes
    });
  }
  
  /**
   * Run quick check (basic orphaned report detection)
   */
  private async runQuickCheck(): Promise<void> {
    const correlationId = generateCorrelationId();
    const startTime = Date.now();
    
    try {
      logger.debug('Starting quick orphaned report check', { correlationId });
      
      // Quick check - just count recent orphaned reports
      const result = await orphanedReportAlerts.checkForOrphanedReports();
      
      const duration = Date.now() - startTime;
      this.updateSuccessStats(result, duration);
      
      logger.info('Quick check completed successfully', {
        correlationId,
        orphanedCount: result.orphanedCount,
        alertsTriggered: result.alertsTriggered,
        duration
      });
      
    } catch (error) {
      const duration = Date.now() - startTime;
      this.updateFailureStats(error as Error, duration);
      
             logger.error('Quick check failed', error as Error, {
         correlationId,
         metadata: {
           consecutiveFailures: this.stats.consecutiveFailures
         }
       });
      
      // Check if we should alert about scheduler health
      await this.checkSchedulerHealth();
    }
  }
  
  /**
   * Run comprehensive check (full orphaned report analysis)
   */
  private async runComprehensiveCheck(): Promise<void> {
    const correlationId = generateCorrelationId();
    const startTime = Date.now();
    
    try {
      logger.info('Starting comprehensive orphaned report check', { correlationId });
      
      const result = await orphanedReportAlerts.checkForOrphanedReports();
      
      const duration = Date.now() - startTime;
      this.updateSuccessStats(result, duration);
      
      logger.info('Comprehensive check completed successfully', {
        correlationId,
        orphanedCount: result.orphanedCount,
        alertsTriggered: result.alertsTriggered,
        alertsSuppressed: result.alertsSuppressed,
        duration
      });
      
    } catch (error) {
      const duration = Date.now() - startTime;
      this.updateFailureStats(error as Error, duration);
      
             logger.error('Comprehensive check failed', error as Error, {
         correlationId,
         metadata: {
           consecutiveFailures: this.stats.consecutiveFailures
         }
       });
      
      // Check if we should alert about scheduler health
      await this.checkSchedulerHealth();
    }
  }
  
  /**
   * Run health check (monitor alert system health)
   */
  private async runHealthCheck(): Promise<void> {
    const correlationId = generateCorrelationId();
    
    try {
      logger.debug('Starting alert system health check', { correlationId });
      
      const alertStatus = AlertHelpers.getStatus();
      const schedulerStats = this.getStats();
      
      // Check for concerning conditions
      const concerns: string[] = [];
      
      if (schedulerStats.consecutiveFailures >= 2) {
        concerns.push(`${schedulerStats.consecutiveFailures} consecutive check failures`);
      }
      
      if (alertStatus.activeAlerts > 10) {
        concerns.push(`${alertStatus.activeAlerts} active alerts (high volume)`);
      }
      
      if (schedulerStats.averageCheckDuration > 30000) { // 30 seconds
        concerns.push(`High average check duration: ${schedulerStats.averageCheckDuration}ms`);
      }
      
      const timeSinceLastCheck = schedulerStats.lastSuccessfulCheck ? 
        Date.now() - schedulerStats.lastSuccessfulCheck.getTime() : 
        Date.now() - this.startTime.getTime();
      
      if (timeSinceLastCheck > 2 * 60 * 60 * 1000) { // 2 hours
        concerns.push(`No successful check in ${Math.round(timeSinceLastCheck / 60000)} minutes`);
      }
      
      if (concerns.length > 0) {
        logger.warn('Alert system health concerns detected', {
          correlationId,
          concerns,
          alertStatus,
          schedulerStats
        });
      } else {
        logger.debug('Alert system health check passed', {
          correlationId,
          alertStatus,
          schedulerStats
        });
      }
      
    } catch (error) {
      logger.error('Health check failed', error as Error, { correlationId });
    }
  }
  
  /**
   * Check if current time is within quiet hours
   */
  private isInQuietHours(): boolean {
    if (!this.config.quietHours.enabled) {
      return false;
    }
    
    const now = new Date();
    const currentHour = now.getHours(); // This uses local timezone
    
    const startHour = this.config.quietHours.startHour;
    const endHour = this.config.quietHours.endHour;
    
    // Handle overnight quiet hours (e.g., 22:00 to 06:00)
    if (startHour > endHour) {
      return currentHour >= startHour || currentHour < endHour;
    } else {
      return currentHour >= startHour && currentHour < endHour;
    }
  }
  
  /**
   * Update statistics for successful check
   */
  private updateSuccessStats(result: any, duration: number): void {
    this.stats.status = 'running';
    this.stats.totalChecks++;
    this.stats.successfulChecks++;
    this.stats.consecutiveFailures = 0;
    this.stats.lastSuccessfulCheck = new Date();
    
    // Update average duration
    const totalDuration = this.stats.averageCheckDuration * (this.stats.successfulChecks - 1) + duration;
    this.stats.averageCheckDuration = totalDuration / this.stats.successfulChecks;
    
    this.stats.lastCheckResults = {
      timestamp: new Date(),
      orphanedCount: result.orphanedCount,
      alertsTriggered: result.alertsTriggered,
      alertsSuppressed: result.alertsSuppressed,
      duration
    };
  }
  
  /**
   * Update statistics for failed check
   */
  private updateFailureStats(error: Error, duration: number): void {
    this.stats.status = 'error';
    this.stats.totalChecks++;
    this.stats.failedChecks++;
    this.stats.consecutiveFailures++;
    this.stats.lastFailedCheck = new Date();
  }
  
  /**
   * Check scheduler health and alert if needed
   */
  private async checkSchedulerHealth(): Promise<void> {
    if (this.stats.consecutiveFailures >= this.config.maxConsecutiveFailures) {
      logger.error('Alert scheduler health degraded - too many consecutive failures', {
        consecutiveFailures: this.stats.consecutiveFailures,
        maxAllowed: this.config.maxConsecutiveFailures,
        lastError: this.stats.lastFailedCheck
      });
      
      // This would trigger a system alert about the scheduler itself
      // For now, we'll use structured logging
    }
  }
  
  /**
   * Initialize statistics
   */
  private initializeStats(): SchedulerStats {
    return {
      status: 'running',
      uptime: 0,
      totalChecks: 0,
      successfulChecks: 0,
      failedChecks: 0,
      consecutiveFailures: 0,
      lastSuccessfulCheck: null,
      lastFailedCheck: null,
      averageCheckDuration: 0,
      lastCheckResults: null
    };
  }
  
  /**
   * Get current scheduler statistics
   */
  getStats(): SchedulerStats {
    return {
      ...this.stats,
      uptime: Date.now() - this.startTime.getTime()
    };
  }
  
  /**
   * Get scheduler configuration
   */
  getConfig(): AlertSchedulerConfig {
    return { ...this.config };
  }
  
  /**
   * Update scheduler configuration
   */
  updateConfig(newConfig: Partial<AlertSchedulerConfig>): void {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...newConfig };
    
    logger.info('Scheduler configuration updated', {
      oldConfig,
      newConfig: this.config
    });
    
    // Restart if running to apply new configuration
    if (this.isRunning) {
      this.restart();
    }
  }
  
  /**
   * Manually trigger immediate comprehensive check
   */
  async triggerImmediateCheck(): Promise<{
    orphanedCount: number;
    alertsTriggered: number;
    alertsSuppressed: number;
  }> {
    logger.info('Manual trigger of immediate orphaned report check');
    
    try {
      const result = await orphanedReportAlerts.checkForOrphanedReports();
      
      logger.info('Manual check completed successfully', {
        orphanedCount: result.orphanedCount,
        alertsTriggered: result.alertsTriggered,
        alertsSuppressed: result.alertsSuppressed
      });
      
      return result;
    } catch (error) {
      logger.error('Manual check failed', error as Error);
      throw error;
    }
  }
  
  /**
   * Get active timer information
   */
  getActiveTimers(): { name: string; intervalMs: number }[] {
    const timers: { name: string; intervalMs: number }[] = [];
    
    if (this.timers.has('quickCheck')) {
      timers.push({
        name: 'quickCheck',
        intervalMs: this.config.schedules.quickCheck.intervalMinutes * 60 * 1000
      });
    }
    
    if (this.timers.has('comprehensiveCheck')) {
      timers.push({
        name: 'comprehensiveCheck',
        intervalMs: this.config.schedules.comprehensive.intervalMinutes * 60 * 1000
      });
    }
    
    if (this.timers.has('healthCheck')) {
      timers.push({
        name: 'healthCheck',
        intervalMs: this.config.schedules.healthCheck.intervalMinutes * 60 * 1000
      });
    }
    
    return timers;
  }
  
  /**
   * Check if scheduler is currently running
   */
  isActive(): boolean {
    return this.isRunning;
  }
}

// Global scheduler instance
export const alertScheduler = new AlertScheduler();

/**
 * Helper functions for scheduler operations
 */
export const SchedulerHelpers = {
  /**
   * Start the alert scheduler
   */
  start: () => {
    alertScheduler.start();
  },
  
  /**
   * Stop the alert scheduler
   */
  stop: () => {
    alertScheduler.stop();
  },
  
  /**
   * Restart the alert scheduler
   */
  restart: () => {
    alertScheduler.restart();
  },
  
  /**
   * Get scheduler statistics
   */
  getStats: () => {
    return alertScheduler.getStats();
  },
  
  /**
   * Trigger immediate check
   */
  triggerCheck: async () => {
    return await alertScheduler.triggerImmediateCheck();
  },
  
  /**
   * Update scheduler configuration
   */
  updateConfig: (config: Partial<AlertSchedulerConfig>) => {
    alertScheduler.updateConfig(config);
  }
}; 