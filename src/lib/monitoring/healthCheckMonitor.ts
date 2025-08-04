// Task 8.1.1: Add failure rate counter to metrics
// Task 8.1.2: Calculate failure rate over 5-minute window
// Task 8.1.3: Store failure rate in component state
// Task 8.1.4: Log failure rate every 10 failures

interface HealthCheckAttempt {
  timestamp: number;
  success: boolean;
  duration?: number;
  errorType?: string;
  correlationId: string;
  // Task 8.3.2: Track retry delay patterns
  retryAttempt?: number;
  retryDelay?: number;
  retryStrategy?: string;
}

interface FailureRateMetrics {
  totalAttempts: number;
  failureCount: number;
  successCount: number;
  failureRate: number; // percentage
  windowStart: number;
  windowEnd: number;
  lastCalculated: number;
}

interface PerformanceMetrics {
  averageResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  p95ResponseTime: number;
  totalRequests: number;
}

class HealthCheckMonitor {
  private attempts: HealthCheckAttempt[] = [];
  private readonly WINDOW_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds
  private readonly MAX_STORED_ATTEMPTS = 1000; // Limit memory usage
  private readonly FAILURE_LOG_THRESHOLD = 10; // Log every 10 failures
  
  // Task 8.2.1: Add failure rate threshold check
  private readonly FAILURE_RATE_THRESHOLD = 50; // 50% failure rate threshold
  
  // Task 8.1.1: Add failure rate counter to metrics
  private totalFailures = 0;
  private consecutiveFailures = 0;
  private lastFailureRateLog = 0;
  
  // Task 8.2.2: Trigger console warning when threshold exceeded
  private lastHighFailureRateAlert = 0;
  private readonly HIGH_FAILURE_RATE_ALERT_INTERVAL = 2 * 60 * 1000; // 2 minutes between alerts
  
  // Task 8.1.3: Store failure rate in component state
  private currentMetrics: FailureRateMetrics = {
    totalAttempts: 0,
    failureCount: 0,
    successCount: 0,
    failureRate: 0,
    windowStart: Date.now(),
    windowEnd: Date.now(),
    lastCalculated: Date.now()
  };

  private performanceMetrics: PerformanceMetrics = {
    averageResponseTime: 0,
    minResponseTime: Infinity,
    maxResponseTime: 0,
    p95ResponseTime: 0,
    totalRequests: 0
  };

  /**
   * Task 8.3.2: Record a retry attempt with delay pattern tracking
   */
  recordRetryAttempt(
    success: boolean, 
    duration?: number, 
    errorType?: string,
    retryAttempt?: number,
    retryDelay?: number,
    retryStrategy?: string
  ): string {
    const correlationId = this.generateCorrelationId();
    const attempt: HealthCheckAttempt = {
      timestamp: Date.now(),
      success,
      correlationId,
      ...(duration !== undefined && { duration }),
      ...(errorType !== undefined && { errorType }),
      ...(retryAttempt !== undefined && { retryAttempt }),
      ...(retryDelay !== undefined && { retryDelay }),
      ...(retryStrategy !== undefined && { retryStrategy })
    };

    this.attempts.push(attempt);
    this.cleanupOldAttempts();

    // Update counters
    if (!success) {
      this.totalFailures++;
      this.consecutiveFailures++;
    } else {
      this.consecutiveFailures = 0;
    }

    // Log retry pattern analysis
    if (retryAttempt !== undefined && retryAttempt > 1) {
      this.logRetryPatterns();
    }

    // Task 8.1.4: Log failure rate every 10 failures
    if (this.totalFailures > 0 && this.totalFailures % this.FAILURE_LOG_THRESHOLD === 0) {
      this.logFailureRate();
    }

    // Recalculate metrics
    this.calculateMetrics();
    
    // Task 8.2.2: Check for high failure rate and trigger alert
    this.checkHighFailureRateAlert();

    return correlationId;
  }

  /**
   * Task 8.1.1: Record a health check attempt
   */
  recordAttempt(success: boolean, duration?: number, errorType?: string): string {
    const correlationId = this.generateCorrelationId();
    const attempt: HealthCheckAttempt = {
      timestamp: Date.now(),
      success,
      correlationId,
      ...(duration !== undefined && { duration }),
      ...(errorType !== undefined && { errorType })
    };

    this.attempts.push(attempt);
    this.cleanupOldAttempts();

    // Update counters
    if (!success) {
      this.totalFailures++;
      this.consecutiveFailures++;
    } else {
      this.consecutiveFailures = 0;
    }

    // Task 8.1.4: Log failure rate every 10 failures
    if (this.totalFailures > 0 && this.totalFailures % this.FAILURE_LOG_THRESHOLD === 0) {
      this.logFailureRate();
    }

    // Recalculate metrics
    this.calculateMetrics();
    
    // Task 8.2.2: Check for high failure rate and trigger alert
    this.checkHighFailureRateAlert();

    return correlationId;
  }

  /**
   * Task 8.1.2: Calculate failure rate over 5-minute window
   */
  calculateMetrics(): FailureRateMetrics {
    const now = Date.now();
    const windowStart = now - this.WINDOW_DURATION;
    
    // Filter attempts within the 5-minute window
    const windowAttempts = this.attempts.filter(
      attempt => attempt.timestamp >= windowStart
    );

    const totalAttempts = windowAttempts.length;
    const failureCount = windowAttempts.filter(attempt => !attempt.success).length;
    const successCount = totalAttempts - failureCount;
    const failureRate = totalAttempts > 0 ? (failureCount / totalAttempts) * 100 : 0;

    this.currentMetrics = {
      totalAttempts,
      failureCount,
      successCount,
      failureRate,
      windowStart,
      windowEnd: now,
      lastCalculated: now
    };

    // Update performance metrics if we have duration data
    this.updatePerformanceMetrics(windowAttempts);

    return this.currentMetrics;
  }

  /**
   * Update performance metrics from attempts with duration data
   */
  private updatePerformanceMetrics(attempts: HealthCheckAttempt[]): void {
    const attemptsWithDuration = attempts.filter(a => a.duration !== undefined);
    
    if (attemptsWithDuration.length === 0) return;

    const durations = attemptsWithDuration.map(a => a.duration!).sort((a, b) => a - b);
    const sum = durations.reduce((acc, d) => acc + d, 0);
    
    this.performanceMetrics = {
      averageResponseTime: sum / durations.length,
      minResponseTime: Math.min(...durations),
      maxResponseTime: Math.max(...durations),
      p95ResponseTime: durations[Math.floor(durations.length * 0.95)] || 0,
      totalRequests: attemptsWithDuration.length
    };
  }

  /**
   * Task 8.1.3: Get current failure rate metrics
   */
  getMetrics(): FailureRateMetrics {
    return { ...this.currentMetrics };
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): PerformanceMetrics {
    return { ...this.performanceMetrics };
  }

  /**
   * Get consecutive failure count
   */
  getConsecutiveFailures(): number {
    return this.consecutiveFailures;
  }

  /**
   * Task 8.2.2: Check for high failure rate and trigger alert
   */
  private checkHighFailureRateAlert(): void {
    const metrics = this.currentMetrics;
    const now = Date.now();
    
    // Only alert if we have enough attempts and failure rate exceeds threshold
    if (metrics.totalAttempts >= 5 && metrics.failureRate >= this.FAILURE_RATE_THRESHOLD) {
      // Avoid duplicate alerts within short time periods
      if (now - this.lastHighFailureRateAlert >= this.HIGH_FAILURE_RATE_ALERT_INTERVAL) {
        console.warn('[Health Monitor] HIGH FAILURE RATE ALERT', {
          failureRate: metrics.failureRate.toFixed(2) + '%',
          threshold: this.FAILURE_RATE_THRESHOLD + '%',
          windowAttempts: metrics.totalAttempts,
          windowFailures: metrics.failureCount,
          consecutiveFailures: this.consecutiveFailures,
          timeWindow: '5 minutes',
          alertLevel: 'HIGH',
          timestamp: new Date().toISOString()
        });
        
        this.lastHighFailureRateAlert = now;
        
        // Task 8.2.4: Send telemetry event for high failure rate
        this.sendHighFailureRateTelemetry({
          failureRate: metrics.failureRate,
          threshold: this.FAILURE_RATE_THRESHOLD,
          windowAttempts: metrics.totalAttempts,
          windowFailures: metrics.failureCount,
          consecutiveFailures: this.consecutiveFailures
        });
      }
    }
  }

  /**
   * Task 8.2.4: Send telemetry event for high failure rate
   */
  private sendHighFailureRateTelemetry(data: {
    failureRate: number;
    threshold: number;
    windowAttempts: number;
    windowFailures: number;
    consecutiveFailures: number;
  }): void {
    // For now, log structured telemetry data that can be picked up by monitoring systems
    console.warn('[Telemetry] High Failure Rate Event', {
      event: 'high_failure_rate',
      service: 'aws_health_monitor',
      severity: 'warning',
      metrics: data,
      timestamp: new Date().toISOString(),
      tags: ['monitoring', 'aws', 'health_check', 'failure_rate']
    });
    
    // In production, this would send to actual telemetry service:
    // - AWS CloudWatch Custom Metrics
    // - DataDog
    // - New Relic
    // - Custom monitoring endpoint
  }

  /**
   * Task 8.3.2: Log retry delay patterns
   */
  private logRetryPatterns(): void {
    const now = Date.now();
    const windowStart = now - this.WINDOW_DURATION;
    
    const retryAttempts = this.attempts.filter(
      attempt => attempt.timestamp >= windowStart && attempt.retryAttempt !== undefined
    );
    
    if (retryAttempts.length > 0) {
      const delayPatterns = retryAttempts.map(a => ({
        attempt: a.retryAttempt,
        delay: a.retryDelay,
        strategy: a.retryStrategy,
        success: a.success
      }));
      
      console.info('[Health Monitor] Retry Pattern Analysis', {
        windowMinutes: 5,
        totalRetries: retryAttempts.length,
        delayPatterns,
        averageDelay: retryAttempts.reduce((sum, a) => sum + (a.retryDelay || 0), 0) / retryAttempts.length,
        successfulRetries: retryAttempts.filter(a => a.success).length,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Task 8.1.4: Log failure rate every 10 failures
   */
  private logFailureRate(): void {
    const metrics = this.calculateMetrics();
    const now = Date.now();
    
    // Avoid duplicate logs within short time periods
    if (now - this.lastFailureRateLog < 30000) { // 30 seconds
      return;
    }
    
    console.warn('[Health Monitor] Failure rate alert', {
      totalFailures: this.totalFailures,
      consecutiveFailures: this.consecutiveFailures,
      windowFailureRate: metrics.failureRate.toFixed(2) + '%',
      windowAttempts: metrics.totalAttempts,
      windowFailures: metrics.failureCount,
      timeWindow: '5 minutes',
      timestamp: new Date().toISOString()
    });
    
    this.lastFailureRateLog = now;
  }

  /**
   * Clean up old attempts to prevent memory leaks
   */
  private cleanupOldAttempts(): void {
    const cutoff = Date.now() - this.WINDOW_DURATION * 2; // Keep 10 minutes of data
    this.attempts = this.attempts.filter(attempt => attempt.timestamp > cutoff);
    
    // Also limit total stored attempts
    if (this.attempts.length > this.MAX_STORED_ATTEMPTS) {
      this.attempts = this.attempts.slice(-this.MAX_STORED_ATTEMPTS);
    }
  }

  /**
   * Generate unique correlation ID for request tracking
   */
  private generateCorrelationId(): string {
    return `hc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Reset all metrics (useful for testing or manual reset)
   */
  reset(): void {
    this.attempts = [];
    this.totalFailures = 0;
    this.consecutiveFailures = 0;
    this.lastFailureRateLog = 0;
    this.currentMetrics = {
      totalAttempts: 0,
      failureCount: 0,
      successCount: 0,
      failureRate: 0,
      windowStart: Date.now(),
      windowEnd: Date.now(),
      lastCalculated: Date.now()
    };
    this.performanceMetrics = {
      averageResponseTime: 0,
      minResponseTime: Infinity,
      maxResponseTime: 0,
      p95ResponseTime: 0,
      totalRequests: 0
    };
  }

  /**
   * Task 8.4.4: Log performance metrics to console
   */
  logPerformanceMetrics(): void {
    const metrics = this.getMetrics();
    const perf = this.getPerformanceMetrics();
    
    console.info('[Health Monitor] Performance Metrics', {
      timestamp: new Date().toISOString(),
      timeWindow: '5 minutes',
      failureMetrics: {
        failureRate: metrics.failureRate.toFixed(2) + '%',
        totalAttempts: metrics.totalAttempts,
        failureCount: metrics.failureCount,
        successCount: metrics.successCount,
        consecutiveFailures: this.consecutiveFailures
      },
      performanceMetrics: {
        averageResponseTime: Math.round(perf.averageResponseTime),
        minResponseTime: Math.round(perf.minResponseTime),
        maxResponseTime: Math.round(perf.maxResponseTime),
        p95ResponseTime: Math.round(perf.p95ResponseTime),
        totalRequests: perf.totalRequests
      },
      healthStatus: metrics.failureRate > 50 ? 'CRITICAL' : metrics.failureRate > 25 ? 'WARNING' : 'HEALTHY'
    });
  }

  /**
   * Get summary for debugging/display
   */
  getSummary(): string {
    const metrics = this.getMetrics();
    const perf = this.getPerformanceMetrics();
    
    return `Health Check Summary:
- Failure Rate: ${metrics.failureRate.toFixed(2)}% (${metrics.failureCount}/${metrics.totalAttempts} in 5min window)
- Consecutive Failures: ${this.consecutiveFailures}
- Total Failures: ${this.totalFailures}
- Avg Response Time: ${perf.averageResponseTime.toFixed(0)}ms
- P95 Response Time: ${perf.p95ResponseTime.toFixed(0)}ms`;
  }
}

// Singleton instance for global use
export const healthCheckMonitor = new HealthCheckMonitor();

export type { HealthCheckAttempt, FailureRateMetrics, PerformanceMetrics };
export { HealthCheckMonitor }; 