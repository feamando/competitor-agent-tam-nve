/**
 * Task 6.2: Business Logic Monitoring and Logging
 * 
 * Comprehensive monitoring system for all business logic operations
 * Integrates with existing monitoring infrastructure and provides
 * performance tracking, alerting, and dashboard capabilities.
 */

import { createCorrelationLogger, logger } from '../logger';
import { generateCorrelationId } from '../correlation';
import { ErrorMessageTemplates, StandardizedError } from '../errorMessages';
import { trackBusinessEvent, trackPerformance, trackError } from '../businessTracking';

// Business Logic Operation Types
export type BusinessLogicOperation = 
  | 'conversation_state_management'
  | 'project_creation'
  | 'analysis_service_execution'
  | 'report_generation'
  | 'data_validation'
  | 'error_handling'
  | 'aws_service_integration'
  | 'database_transaction';

// Operation Status
export type OperationStatus = 'started' | 'in_progress' | 'completed' | 'failed' | 'timeout';

// Performance Metrics
export interface PerformanceMetrics {
  duration: number;
  memoryUsage?: number;
  cpuUsage?: number;
  dbQueries?: number;
  apiCalls?: number;
}

// Business Logic Operation Context
export interface BusinessLogicContext {
  operationId: string;
  correlationId: string;
  operation: BusinessLogicOperation;
  component: string;
  userId?: string;
  projectId?: string;
  startTime: Date;
  endTime?: Date;
  status: OperationStatus;
  metadata?: Record<string, any>;
  performance?: PerformanceMetrics;
  error?: StandardizedError;
}

// Alert Threshold Configuration
export interface AlertThresholds {
  maxDuration: number;
  maxFailureRate: number;
  maxErrorRate: number;
  criticalFailureCount: number;
}

// Business Logic Health Metrics
export interface BusinessLogicHealthMetrics {
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  timeoutOperations: number;
  averageDuration: number;
  errorRate: number;
  failurePatterns: Map<string, number>;
  performanceTrends: PerformanceMetrics[];
}

/**
 * Task 6.2: Comprehensive Business Logic Monitor
 */
export class BusinessLogicMonitor {
  private static instance: BusinessLogicMonitor;
  private activeOperations = new Map<string, BusinessLogicContext>();
  private operationHistory: BusinessLogicContext[] = [];
  private healthMetrics: BusinessLogicHealthMetrics;
  private alertThresholds: Map<BusinessLogicOperation, AlertThresholds>;
  
  private readonly MAX_HISTORY_SIZE = 10000;
  private readonly ALERT_CHECK_INTERVAL = 60000; // 1 minute

  private constructor() {
    this.healthMetrics = {
      totalOperations: 0,
      successfulOperations: 0,
      failedOperations: 0,
      timeoutOperations: 0,
      averageDuration: 0,
      errorRate: 0,
      failurePatterns: new Map(),
      performanceTrends: []
    };

    this.alertThresholds = new Map([
      ['conversation_state_management', { maxDuration: 5000, maxFailureRate: 0.05, maxErrorRate: 0.1, criticalFailureCount: 5 }],
      ['project_creation', { maxDuration: 30000, maxFailureRate: 0.02, maxErrorRate: 0.05, criticalFailureCount: 3 }],
      ['analysis_service_execution', { maxDuration: 60000, maxFailureRate: 0.1, maxErrorRate: 0.15, criticalFailureCount: 10 }],
      ['report_generation', { maxDuration: 120000, maxFailureRate: 0.05, maxErrorRate: 0.1, criticalFailureCount: 5 }],
      ['data_validation', { maxDuration: 2000, maxFailureRate: 0.1, maxErrorRate: 0.2, criticalFailureCount: 20 }],
      ['error_handling', { maxDuration: 1000, maxFailureRate: 0.01, maxErrorRate: 0.02, criticalFailureCount: 2 }],
      ['aws_service_integration', { maxDuration: 15000, maxFailureRate: 0.15, maxErrorRate: 0.2, criticalFailureCount: 15 }],
      ['database_transaction', { maxDuration: 10000, maxFailureRate: 0.02, maxErrorRate: 0.05, criticalFailureCount: 5 }]
    ]);

    // Set up periodic alert checking
    setInterval(() => this.checkAlertThresholds(), this.ALERT_CHECK_INTERVAL);
  }

  public static getInstance(): BusinessLogicMonitor {
    if (!BusinessLogicMonitor.instance) {
      BusinessLogicMonitor.instance = new BusinessLogicMonitor();
    }
    return BusinessLogicMonitor.instance;
  }

  /**
   * Start tracking a business logic operation
   */
  public startOperation(
    operation: BusinessLogicOperation,
    component: string,
    metadata?: Record<string, any>,
    correlationId?: string
  ): string {
    const operationId = generateCorrelationId();
    const correlation = correlationId || generateCorrelationId();
    
    const context: BusinessLogicContext = {
      operationId,
      correlationId: correlation,
      operation,
      component,
      startTime: new Date(),
      status: 'started',
      metadata,
      userId: metadata?.userId,
      projectId: metadata?.projectId
    };

    this.activeOperations.set(operationId, context);
    this.healthMetrics.totalOperations++;

    // Log operation start
    const correlatedLogger = createCorrelationLogger(correlation);
    correlatedLogger.info('Business logic operation started', {
      operationId,
      operation,
      component,
      metadata
    });

    // Track business event
    trackBusinessEvent('business_logic_operation_started', {
      operationId,
      correlationId: correlation,
      operation,
      component,
      timestamp: context.startTime.toISOString(),
      ...metadata
    });

    return operationId;
  }

  /**
   * Update operation status and metadata
   */
  public updateOperation(
    operationId: string,
    status: OperationStatus,
    metadata?: Record<string, any>
  ): void {
    const context = this.activeOperations.get(operationId);
    if (!context) {
      logger.warn('Operation not found for update', { operationId });
      return;
    }

    context.status = status;
    if (metadata) {
      context.metadata = { ...context.metadata, ...metadata };
    }

    const correlatedLogger = createCorrelationLogger(context.correlationId);
    correlatedLogger.info('Business logic operation updated', {
      operationId,
      status,
      operation: context.operation,
      component: context.component,
      metadata
    });
  }

  /**
   * Complete a business logic operation successfully
   */
  public completeOperation(
    operationId: string,
    performance?: PerformanceMetrics,
    metadata?: Record<string, any>
  ): void {
    const context = this.activeOperations.get(operationId);
    if (!context) {
      logger.warn('Operation not found for completion', { operationId });
      return;
    }

    context.endTime = new Date();
    context.status = 'completed';
    context.performance = performance;
    if (metadata) {
      context.metadata = { ...context.metadata, ...metadata };
    }

    const duration = context.endTime.getTime() - context.startTime.getTime();
    if (context.performance) {
      context.performance.duration = duration;
    } else {
      context.performance = { duration };
    }

    // Update health metrics
    this.healthMetrics.successfulOperations++;
    this.updatePerformanceMetrics(context);

    // Log completion
    const correlatedLogger = createCorrelationLogger(context.correlationId);
    correlatedLogger.info('Business logic operation completed', {
      operationId,
      operation: context.operation,
      component: context.component,
      duration: `${duration}ms`,
      performance: context.performance,
      metadata: context.metadata
    });

    // Track performance
    trackPerformance(`business_logic_${context.operation}`, duration, {
      correlationId: context.correlationId,
      component: context.component,
      operation: context.operation
    });

    // Track business event
    trackBusinessEvent('business_logic_operation_completed', {
      operationId,
      correlationId: context.correlationId,
      operation: context.operation,
      component: context.component,
      duration,
      performance: context.performance,
      timestamp: context.endTime.toISOString()
    });

    // Move to history and cleanup
    this.moveToHistory(context);
    this.activeOperations.delete(operationId);
  }

  /**
   * Fail a business logic operation
   */
  public failOperation(
    operationId: string,
    error: StandardizedError,
    performance?: PerformanceMetrics,
    metadata?: Record<string, any>
  ): void {
    const context = this.activeOperations.get(operationId);
    if (!context) {
      logger.warn('Operation not found for failure', { operationId });
      return;
    }

    context.endTime = new Date();
    context.status = 'failed';
    context.error = error;
    context.performance = performance;
    if (metadata) {
      context.metadata = { ...context.metadata, ...metadata };
    }

    const duration = context.endTime.getTime() - context.startTime.getTime();
    if (context.performance) {
      context.performance.duration = duration;
    } else {
      context.performance = { duration };
    }

    // Update health metrics
    this.healthMetrics.failedOperations++;
    this.updateFailurePatterns(context.operation, error.code);
    this.updatePerformanceMetrics(context);

    // Log failure
    const correlatedLogger = createCorrelationLogger(context.correlationId);
    correlatedLogger.error('Business logic operation failed', new Error(error.message), {
      operationId,
      operation: context.operation,
      component: context.component,
      duration: `${duration}ms`,
      errorCode: error.code,
      errorTitle: error.title,
      metadata: context.metadata
    });

    // Track error
    trackError(new Error(error.message), `business_logic_${context.operation}`, {
      correlationId: context.correlationId,
      component: context.component,
      operation: context.operation,
      errorCode: error.code,
      severity: error.severity
    });

    // Track business event
    trackBusinessEvent('business_logic_operation_failed', {
      operationId,
      correlationId: context.correlationId,
      operation: context.operation,
      component: context.component,
      duration,
      errorCode: error.code,
      errorTitle: error.title,
      severity: error.severity,
      timestamp: context.endTime.toISOString()
    });

    // Move to history and cleanup
    this.moveToHistory(context);
    this.activeOperations.delete(operationId);

    // Check for immediate alert triggers
    this.checkImmediateAlerts(context);
  }

  /**
   * Get current health metrics
   */
  public getHealthMetrics(): BusinessLogicHealthMetrics {
    this.updateErrorRate();
    return { ...this.healthMetrics };
  }

  /**
   * Get detailed operation statistics
   */
  public getOperationStatistics(operation?: BusinessLogicOperation): {
    totalOperations: number;
    successRate: number;
    averageDuration: number;
    errorRate: number;
    recentFailures: BusinessLogicContext[];
    performanceTrends: PerformanceMetrics[];
  } {
    const relevantOperations = operation 
      ? this.operationHistory.filter(op => op.operation === operation)
      : this.operationHistory;

    const successfulOps = relevantOperations.filter(op => op.status === 'completed').length;
    const totalOps = relevantOperations.length;
    const failedOps = relevantOperations.filter(op => op.status === 'failed').length;

    const avgDuration = relevantOperations
      .filter(op => op.performance?.duration)
      .reduce((sum, op) => sum + (op.performance?.duration || 0), 0) / relevantOperations.length;

    const recentFailures = relevantOperations
      .filter(op => op.status === 'failed')
      .sort((a, b) => (b.endTime?.getTime() || 0) - (a.endTime?.getTime() || 0))
      .slice(0, 10);

    const performanceTrends = relevantOperations
      .filter(op => op.performance)
      .map(op => op.performance!)
      .slice(-50); // Last 50 operations

    return {
      totalOperations: totalOps,
      successRate: totalOps > 0 ? successfulOps / totalOps : 0,
      averageDuration: avgDuration,
      errorRate: totalOps > 0 ? failedOps / totalOps : 0,
      recentFailures,
      performanceTrends
    };
  }

  /**
   * Private helper methods
   */
  private moveToHistory(context: BusinessLogicContext): void {
    this.operationHistory.push(context);
    if (this.operationHistory.length > this.MAX_HISTORY_SIZE) {
      this.operationHistory = this.operationHistory.slice(-this.MAX_HISTORY_SIZE);
    }
  }

  private updatePerformanceMetrics(context: BusinessLogicContext): void {
    if (context.performance) {
      this.healthMetrics.performanceTrends.push(context.performance);
      if (this.healthMetrics.performanceTrends.length > 100) {
        this.healthMetrics.performanceTrends = this.healthMetrics.performanceTrends.slice(-100);
      }

      // Update average duration
      const totalDuration = this.healthMetrics.performanceTrends
        .reduce((sum, p) => sum + p.duration, 0);
      this.healthMetrics.averageDuration = totalDuration / this.healthMetrics.performanceTrends.length;
    }
  }

  private updateFailurePatterns(operation: BusinessLogicOperation, errorCode: string): void {
    const key = `${operation}:${errorCode}`;
    const current = this.healthMetrics.failurePatterns.get(key) || 0;
    this.healthMetrics.failurePatterns.set(key, current + 1);
  }

  private updateErrorRate(): void {
    const totalOps = this.healthMetrics.totalOperations;
    const failedOps = this.healthMetrics.failedOperations;
    this.healthMetrics.errorRate = totalOps > 0 ? failedOps / totalOps : 0;
  }

  private checkAlertThresholds(): void {
    for (const [operation, thresholds] of this.alertThresholds) {
      const stats = this.getOperationStatistics(operation);
      
      // Check failure rate
      if (stats.errorRate > thresholds.maxErrorRate) {
        this.triggerAlert('high_error_rate', operation, {
          currentRate: stats.errorRate,
          threshold: thresholds.maxErrorRate,
          recentFailures: stats.recentFailures.length
        });
      }

      // Check average duration
      if (stats.averageDuration > thresholds.maxDuration) {
        this.triggerAlert('high_average_duration', operation, {
          currentDuration: stats.averageDuration,
          threshold: thresholds.maxDuration
        });
      }
    }
  }

  private checkImmediateAlerts(context: BusinessLogicContext): void {
    const thresholds = this.alertThresholds.get(context.operation);
    if (!thresholds) return;

    // Check for critical error severity
    if (context.error?.severity === 'critical') {
      this.triggerAlert('critical_error', context.operation, {
        operationId: context.operationId,
        errorCode: context.error.code,
        errorMessage: context.error.message
      });
    }

    // Check duration threshold
    const duration = context.performance?.duration || 0;
    if (duration > thresholds.maxDuration) {
      this.triggerAlert('operation_timeout', context.operation, {
        operationId: context.operationId,
        duration,
        threshold: thresholds.maxDuration
      });
    }
  }

  private triggerAlert(alertType: string, operation: BusinessLogicOperation, data: any): void {
    const alertContext = {
      alertType,
      operation,
      timestamp: new Date().toISOString(),
      data
    };

    logger.error(`Business logic alert triggered: ${alertType}`, new Error(`Alert: ${alertType}`), alertContext);

    trackBusinessEvent('business_logic_alert', {
      alertType,
      operation,
      severity: 'high',
      ...data
    });

    // Integration point for alert notification systems
    // This could trigger emails, Slack notifications, PagerDuty, etc.
  }
}

/**
 * Helper function to create business logic monitor instance
 */
export function getBusinessLogicMonitor(): BusinessLogicMonitor {
  return BusinessLogicMonitor.getInstance();
}

/**
 * Decorator for automatic business logic monitoring
 */
export function monitorBusinessLogic(
  operation: BusinessLogicOperation,
  component: string
) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const monitor = getBusinessLogicMonitor();
      const operationId = monitor.startOperation(operation, component, {
        method: propertyName,
        args: args.length
      });

      try {
        const startTime = Date.now();
        const result = await method.apply(this, args);
        const duration = Date.now() - startTime;

        monitor.completeOperation(operationId, { duration });
        return result;
      } catch (error) {
        const standardizedError = ErrorMessageTemplates.generateStandardizedError(
          ErrorMessageTemplates.SYSTEM.UNEXPECTED_ERROR,
          { operation, component },
          { reason: (error as Error).message }
        );

        monitor.failOperation(operationId, standardizedError);
        throw error;
      }
    };
  };
} 