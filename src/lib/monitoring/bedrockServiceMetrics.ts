/**
 * Bedrock Service Monitoring and Metrics Collection
 * Implements TP-029 Task 5.0: Service monitoring and alerting
 */

import { BedrockServiceMetrics, BedrockHealthStatus } from '@/types/bedrockHealth';
import { bedrockCircuitBreaker } from '@/lib/health/bedrockHealthChecker';
import { logger } from '@/lib/logger';

export class BedrockServiceMonitor {
  private static instance: BedrockServiceMonitor;
  private metrics: BedrockServiceMetrics;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private readonly HEALTH_CHECK_INTERVAL_MS = 60000; // 1 minute

  private constructor() {
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      lastHealthCheck: new Date().toISOString(),
      circuitBreakerState: 'CLOSED'
    };
  }

  static getInstance(): BedrockServiceMonitor {
    if (!BedrockServiceMonitor.instance) {
      BedrockServiceMonitor.instance = new BedrockServiceMonitor();
    }
    return BedrockServiceMonitor.instance;
  }

  /**
   * Start continuous monitoring
   * Implements TP-029 Task 5.1: Bedrock service initialization metrics and monitoring
   */
  startMonitoring(): void {
    if (this.healthCheckInterval) {
      return; // Already monitoring
    }

    logger.info('[BedrockServiceMonitor] Starting continuous Bedrock service monitoring');

    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.performHealthCheck();
      } catch (error) {
        logger.error('[BedrockServiceMonitor] Health check failed', { error: error.message });
      }
    }, this.HEALTH_CHECK_INTERVAL_MS);

    // Perform initial health check
    this.performHealthCheck().catch(error => {
      logger.error('[BedrockServiceMonitor] Initial health check failed', { error: error.message });
    });
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      logger.info('[BedrockServiceMonitor] Stopped Bedrock service monitoring');
    }
  }

  /**
   * Record a service request attempt
   * Implements TP-029 Task 5.1: Metrics collection
   */
  recordRequest(startTime: number, success: boolean): void {
    const responseTime = Date.now() - startTime;
    
    this.metrics.totalRequests++;
    
    if (success) {
      this.metrics.successfulRequests++;
    } else {
      this.metrics.failedRequests++;
    }

    // Update rolling average response time
    const currentAvg = this.metrics.averageResponseTime;
    const currentTotal = this.metrics.totalRequests;
    this.metrics.averageResponseTime = ((currentAvg * (currentTotal - 1)) + responseTime) / currentTotal;

    // Update circuit breaker state
    this.metrics.circuitBreakerState = bedrockCircuitBreaker.getState();

    logger.debug('[BedrockServiceMonitor] Recorded request', {
      responseTime,
      success,
      totalRequests: this.metrics.totalRequests,
      successRate: this.getSuccessRate()
    });
  }

  /**
   * Perform health check and update metrics
   */
  private async performHealthCheck(): Promise<void> {
    const startTime = Date.now();

    try {
      // Call the health check endpoint internally
      const response = await fetch('/api/system-health/bedrock');
      const healthData: BedrockHealthStatus = await response.json();

      this.metrics.lastHealthCheck = new Date().toISOString();
      this.metrics.circuitBreakerState = bedrockCircuitBreaker.getState();

      if (healthData.status === 'healthy') {
        this.recordRequest(startTime, true);
        logger.debug('[BedrockServiceMonitor] Health check passed');
      } else {
        this.recordRequest(startTime, false);
        this.triggerAlert('unhealthy', healthData.error || 'Unknown error');
      }

    } catch (error) {
      this.recordRequest(startTime, false);
      this.triggerAlert('unreachable', error.message);
    }
  }

  /**
   * Trigger alerts for service degradation
   * Implements TP-029 Task 5.2: Alerts for service degradation and repeated failures
   */
  private triggerAlert(alertType: 'unhealthy' | 'unreachable' | 'high_failure_rate', details: string): void {
    const alertData = {
      alertType,
      details,
      metrics: this.getMetrics(),
      timestamp: new Date().toISOString(),
      circuitBreakerState: bedrockCircuitBreaker.getState()
    };

    logger.error('[BedrockServiceMonitor] SERVICE ALERT TRIGGERED', alertData);

    // In a production environment, this would integrate with:
    // - AWS CloudWatch Alarms
    // - PagerDuty
    // - Slack notifications
    // - Email alerts
    console.error('🚨 BEDROCK SERVICE ALERT 🚨', alertData);

    // Check for high failure rate
    const failureRate = this.getFailureRate();
    if (failureRate > 0.5 && this.metrics.totalRequests > 10) {
      this.triggerHighFailureRateAlert(failureRate);
    }
  }

  /**
   * Trigger specific alert for high failure rate
   */
  private triggerHighFailureRateAlert(failureRate: number): void {
    logger.error('[BedrockServiceMonitor] HIGH FAILURE RATE ALERT', {
      failureRate: `${(failureRate * 100).toFixed(1)}%`,
      totalRequests: this.metrics.totalRequests,
      failedRequests: this.metrics.failedRequests,
      circuitBreakerState: this.metrics.circuitBreakerState
    });

    console.error('🚨 HIGH FAILURE RATE DETECTED 🚨', {
      failureRate: `${(failureRate * 100).toFixed(1)}%`,
      recommendation: 'Consider enabling maintenance mode or investigating AWS service status'
    });
  }

  /**
   * Get current metrics
   */
  getMetrics(): BedrockServiceMetrics {
    return { ...this.metrics };
  }

  /**
   * Get success rate as percentage
   */
  getSuccessRate(): number {
    if (this.metrics.totalRequests === 0) return 100;
    return (this.metrics.successfulRequests / this.metrics.totalRequests);
  }

  /**
   * Get failure rate as percentage
   */
  getFailureRate(): number {
    if (this.metrics.totalRequests === 0) return 0;
    return (this.metrics.failedRequests / this.metrics.totalRequests);
  }

  /**
   * Reset metrics (useful for testing)
   */
  resetMetrics(): void {
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      lastHealthCheck: new Date().toISOString(),
      circuitBreakerState: bedrockCircuitBreaker.getState()
    };
    
    logger.info('[BedrockServiceMonitor] Metrics reset');
  }
}

// Singleton instance
export const bedrockServiceMonitor = BedrockServiceMonitor.getInstance();