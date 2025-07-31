/**
 * Task 4.1: Enhanced Emergency Fallback System
 * Implements circuit breaker patterns, advanced retry mechanisms, and comprehensive error recovery
 */

import { logger, generateCorrelationId, createCorrelationLogger, trackBusinessEvent } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { createId } from '@paralleldrive/cuid2';

// Error classification types
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export enum ErrorCategory {
  NETWORK = 'network',
  SERVICE_UNAVAILABLE = 'service_unavailable',
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  RATE_LIMIT = 'rate_limit',
  DATA_VALIDATION = 'data_validation',
  RESOURCE_EXHAUSTION = 'resource_exhaustion',
  EXTERNAL_DEPENDENCY = 'external_dependency',
  CONFIGURATION = 'configuration',
  UNKNOWN = 'unknown'
}

export enum RecoveryStrategy {
  IMMEDIATE_RETRY = 'immediate_retry',
  EXPONENTIAL_BACKOFF = 'exponential_backoff',
  CIRCUIT_BREAKER = 'circuit_breaker',
  FALLBACK_SERVICE = 'fallback_service',
  EMERGENCY_MODE = 'emergency_mode',
  USER_NOTIFICATION = 'user_notification',
  NO_RECOVERY = 'no_recovery'
}

// Error classification result
export interface ErrorClassification {
  category: ErrorCategory;
  severity: ErrorSeverity;
  recoveryStrategy: RecoveryStrategy;
  retryable: boolean;
  userFriendlyMessage: string;
  technicalDetails: string;
  estimatedRecoveryTime?: number;
  actionRequired?: string;
}

// Circuit breaker states
export enum CircuitBreakerState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half_open'
}

// Circuit breaker configuration
export interface CircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeout: number;
  monitoringPeriod: number;
  halfOpenMaxCalls: number;
}

// Retry configuration
export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitterEnabled: boolean;
}

// Emergency fallback options
export interface EmergencyFallbackOptions {
  projectId: string;
  operationType: 'report_generation' | 'analysis' | 'data_collection' | 'service_initialization';
  originalError: Error;
  correlationId?: string;
  retryConfig?: Partial<RetryConfig>;
  circuitBreakerConfig?: Partial<CircuitBreakerConfig>;
  enableEmergencyMode?: boolean;
  userNotification?: boolean;
}

// Fallback result
export interface EmergencyFallbackResult<T = any> {
  success: boolean;
  data?: T;
  fallbackUsed: boolean;
  fallbackType: 'retry' | 'circuit_breaker' | 'emergency_service' | 'emergency_report' | 'none';
  errorClassification: ErrorClassification;
  recoveryTime: number;
  attemptsUsed: number;
  circuitBreakerState?: CircuitBreakerState;
  warnings: string[];
  userMessage: string;
}

// Circuit breaker status
interface CircuitBreakerStatus {
  state: CircuitBreakerState;
  failureCount: number;
  lastFailureTime: number;
  nextRetryTime: number;
  halfOpenCalls: number;
}

/**
 * Enhanced Emergency Fallback System
 * Provides comprehensive error recovery with circuit breakers and advanced retry mechanisms
 */
export class EmergencyFallbackSystem {
  private static instance: EmergencyFallbackSystem;
  private circuitBreakers = new Map<string, CircuitBreakerStatus>();
  private retryHistory = new Map<string, Array<{ timestamp: number; success: boolean }>>();
  private emergencyModeActive = new Set<string>();

  // Default configurations
  private static readonly DEFAULT_RETRY_CONFIG: RetryConfig = {
    maxAttempts: 3,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
    jitterEnabled: true
  };

  private static readonly DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
    failureThreshold: 5,
    recoveryTimeout: 60000,
    monitoringPeriod: 300000,
    halfOpenMaxCalls: 3
  };

  private constructor() {
    // Start circuit breaker monitoring
    this.startCircuitBreakerMonitoring();
  }

  public static getInstance(): EmergencyFallbackSystem {
    if (!EmergencyFallbackSystem.instance) {
      EmergencyFallbackSystem.instance = new EmergencyFallbackSystem();
    }
    return EmergencyFallbackSystem.instance;
  }

  /**
   * Execute operation with emergency fallback protection
   */
  public async executeWithFallback<T>(
    operation: () => Promise<T>,
    options: EmergencyFallbackOptions
  ): Promise<EmergencyFallbackResult<T>> {
    const correlationId = options.correlationId || generateCorrelationId();
    const correlatedLogger = createCorrelationLogger(correlationId);
    const startTime = Date.now();

    const context = {
      operationType: options.operationType,
      projectId: options.projectId,
      correlationId
    };

    correlatedLogger.info('Starting operation with emergency fallback protection', context);

    // Check circuit breaker state
    const circuitBreakerKey = `${options.operationType}-${options.projectId}`;
    const circuitBreakerState = this.getCircuitBreakerState(circuitBreakerKey);

    if (circuitBreakerState === CircuitBreakerState.OPEN) {
      correlatedLogger.warn('Circuit breaker is OPEN, using emergency fallback', {
        ...context,
        circuitBreakerKey
      });

      return this.handleCircuitBreakerOpen(options, correlationId, startTime);
    }

    // Execute with retry mechanism
    const retryConfig = { ...EmergencyFallbackSystem.DEFAULT_RETRY_CONFIG, ...options.retryConfig };
    
    for (let attempt = 1; attempt <= retryConfig.maxAttempts; attempt++) {
      try {
        correlatedLogger.info(`Operation attempt ${attempt}/${retryConfig.maxAttempts}`, {
          ...context,
          attempt
        });

        const result = await operation();
        
        // Success - reset circuit breaker
        this.recordSuccess(circuitBreakerKey, correlatedLogger);
        
        const recoveryTime = Date.now() - startTime;
        
        correlatedLogger.info('Operation completed successfully', {
          ...context,
          attempt,
          recoveryTime
        });

        return {
          success: true,
          data: result,
          fallbackUsed: false,
          fallbackType: 'none',
          errorClassification: this.classifyError(new Error('No error')),
          recoveryTime,
          attemptsUsed: attempt,
          warnings: [],
          userMessage: 'Operation completed successfully'
        };

      } catch (error) {
        const errorClassification = this.classifyError(error as Error);
        
        correlatedLogger.warn(`Operation attempt ${attempt} failed`, {
          ...context,
          attempt,
          error: (error as Error).message,
          errorClassification
        });

        // Record failure for circuit breaker
        this.recordFailure(circuitBreakerKey, correlatedLogger);

        // Check if we should continue retrying
        if (attempt < retryConfig.maxAttempts && errorClassification.retryable) {
          const delay = this.calculateBackoffDelay(attempt, retryConfig);
          
          correlatedLogger.info(`Waiting ${delay}ms before retry`, {
            ...context,
            attempt,
            delay,
            nextAttempt: attempt + 1
          });

          await this.sleep(delay);
          continue;
        }

        // All retries exhausted or non-retryable error
        correlatedLogger.error('All retry attempts exhausted, initiating emergency fallback', {
          ...context,
          totalAttempts: attempt,
          finalError: (error as Error).message,
          errorClassification
        });

        return this.handleFallback(options, error as Error, correlationId, startTime, attempt);
      }
    }

    // Should never reach here, but handle it
    return this.handleFallback(options, new Error('Unexpected retry loop end'), correlationId, startTime, retryConfig.maxAttempts);
  }

  /**
   * Classify error and determine recovery strategy
   */
  public classifyError(error: Error): ErrorClassification {
    const message = error.message.toLowerCase();
    const stack = error.stack?.toLowerCase() || '';

    // Network errors
    if (message.includes('network') || message.includes('connection') || message.includes('timeout') || 
        message.includes('econnrefused') || message.includes('enotfound')) {
      return {
        category: ErrorCategory.NETWORK,
        severity: ErrorSeverity.MEDIUM,
        recoveryStrategy: RecoveryStrategy.EXPONENTIAL_BACKOFF,
        retryable: true,
        userFriendlyMessage: 'Network connection issue. Please try again in a moment.',
        technicalDetails: error.message,
        estimatedRecoveryTime: 30000,
        actionRequired: 'Automatic retry in progress'
      };
    }

    // Service unavailable
    if (message.includes('service unavailable') || message.includes('503') || 
        message.includes('server error') || message.includes('internal server error')) {
      return {
        category: ErrorCategory.SERVICE_UNAVAILABLE,
        severity: ErrorSeverity.HIGH,
        recoveryStrategy: RecoveryStrategy.CIRCUIT_BREAKER,
        retryable: true,
        userFriendlyMessage: 'Service is temporarily unavailable. We\'re working to restore it.',
        technicalDetails: error.message,
        estimatedRecoveryTime: 120000,
        actionRequired: 'Please wait, automatic recovery in progress'
      };
    }

    // Authentication/Authorization
    if (message.includes('unauthorized') || message.includes('401') || message.includes('403') ||
        message.includes('credentials') || message.includes('authentication')) {
      return {
        category: ErrorCategory.AUTHENTICATION,
        severity: ErrorSeverity.HIGH,
        recoveryStrategy: RecoveryStrategy.USER_NOTIFICATION,
        retryable: false,
        userFriendlyMessage: 'Authentication issue detected. Please check your credentials.',
        technicalDetails: error.message,
        actionRequired: 'Please contact support or check system configuration'
      };
    }

    // Rate limiting
    if (message.includes('rate limit') || message.includes('429') || message.includes('too many requests')) {
      return {
        category: ErrorCategory.RATE_LIMIT,
        severity: ErrorSeverity.MEDIUM,
        recoveryStrategy: RecoveryStrategy.EXPONENTIAL_BACKOFF,
        retryable: true,
        userFriendlyMessage: 'Request rate limit reached. Please wait before trying again.',
        technicalDetails: error.message,
        estimatedRecoveryTime: 60000,
        actionRequired: 'Automatic retry with extended delay'
      };
    }

    // Resource exhaustion
    if (message.includes('memory') || message.includes('disk space') || message.includes('quota') ||
        message.includes('limit exceeded')) {
      return {
        category: ErrorCategory.RESOURCE_EXHAUSTION,
        severity: ErrorSeverity.HIGH,
        recoveryStrategy: RecoveryStrategy.EMERGENCY_MODE,
        retryable: false,
        userFriendlyMessage: 'System resources are currently limited. Using emergency mode.',
        technicalDetails: error.message,
        actionRequired: 'System administrator notification sent'
      };
    }

    // Data validation
    if (message.includes('validation') || message.includes('invalid') || message.includes('missing required')) {
      return {
        category: ErrorCategory.DATA_VALIDATION,
        severity: ErrorSeverity.LOW,
        recoveryStrategy: RecoveryStrategy.USER_NOTIFICATION,
        retryable: false,
        userFriendlyMessage: 'Data validation error. Please check your input and try again.',
        technicalDetails: error.message,
        actionRequired: 'Please review and correct the input data'
      };
    }

    // External dependency failures
    if (message.includes('external') || message.includes('third party') || message.includes('api') ||
        stack.includes('bedrock') || stack.includes('aws')) {
      return {
        category: ErrorCategory.EXTERNAL_DEPENDENCY,
        severity: ErrorSeverity.MEDIUM,
        recoveryStrategy: RecoveryStrategy.FALLBACK_SERVICE,
        retryable: true,
        userFriendlyMessage: 'External service issue. Using alternative methods.',
        technicalDetails: error.message,
        estimatedRecoveryTime: 90000,
        actionRequired: 'Automatic fallback in progress'
      };
    }

    // Default classification
    return {
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.MEDIUM,
      recoveryStrategy: RecoveryStrategy.EXPONENTIAL_BACKOFF,
      retryable: true,
      userFriendlyMessage: 'An unexpected error occurred. Please try again.',
      technicalDetails: error.message,
      estimatedRecoveryTime: 60000,
      actionRequired: 'Automatic retry in progress'
    };
  }

  /**
   * Handle circuit breaker open state
   */
  private async handleCircuitBreakerOpen(
    options: EmergencyFallbackOptions,
    correlationId: string,
    startTime: number
  ): Promise<EmergencyFallbackResult> {
    const correlatedLogger = createCorrelationLogger(correlationId);
    
    correlatedLogger.warn('Circuit breaker is open, executing emergency fallback', {
      operationType: options.operationType,
      projectId: options.projectId
    });

    // Execute emergency fallback based on operation type
    let fallbackData;
    let fallbackType: EmergencyFallbackResult['fallbackType'] = 'circuit_breaker';

    try {
      switch (options.operationType) {
        case 'report_generation':
          fallbackData = await this.generateEmergencyReport(options.projectId, correlatedLogger);
          fallbackType = 'emergency_report';
          break;
        case 'analysis':
          fallbackData = await this.performEmergencyAnalysis(options.projectId, correlatedLogger);
          fallbackType = 'emergency_service';
          break;
        case 'data_collection':
          fallbackData = await this.performEmergencyDataCollection(options.projectId, correlatedLogger);
          fallbackType = 'emergency_service';
          break;
        default:
          throw new Error(`No emergency fallback available for operation type: ${options.operationType}`);
      }
    } catch (fallbackError) {
      correlatedLogger.error('Emergency fallback also failed', fallbackError as Error);
      
      return {
        success: false,
        fallbackUsed: true,
        fallbackType: 'circuit_breaker',
        errorClassification: this.classifyError(fallbackError as Error),
        recoveryTime: Date.now() - startTime,
        attemptsUsed: 0,
        circuitBreakerState: CircuitBreakerState.OPEN,
        warnings: ['Emergency fallback failed'],
        userMessage: 'System is experiencing difficulties. Please try again later or contact support.'
      };
    }

    const recoveryTime = Date.now() - startTime;

    trackBusinessEvent('emergency_fallback_executed', {
      operationType: options.operationType,
      projectId: options.projectId,
      fallbackType,
      recoveryTime,
      correlationId
    });

    return {
      success: true,
      data: fallbackData,
      fallbackUsed: true,
      fallbackType,
      errorClassification: this.classifyError(new Error('Circuit breaker open')),
      recoveryTime,
      attemptsUsed: 0,
      circuitBreakerState: CircuitBreakerState.OPEN,
      warnings: ['Used emergency fallback due to circuit breaker'],
      userMessage: 'Operation completed using emergency backup system'
    };
  }

  /**
   * Handle fallback after retry exhaustion
   */
  private async handleFallback(
    options: EmergencyFallbackOptions,
    error: Error,
    correlationId: string,
    startTime: number,
    attemptsUsed: number
  ): Promise<EmergencyFallbackResult> {
    const correlatedLogger = createCorrelationLogger(correlationId);
    const errorClassification = this.classifyError(error);

    // Determine fallback strategy based on error classification
    switch (errorClassification.recoveryStrategy) {
      case RecoveryStrategy.FALLBACK_SERVICE:
        return this.executeFallbackService(options, error, correlationId, startTime, attemptsUsed);
      
      case RecoveryStrategy.EMERGENCY_MODE:
        return this.executeEmergencyMode(options, error, correlationId, startTime, attemptsUsed);
      
      case RecoveryStrategy.USER_NOTIFICATION:
        return this.executeUserNotification(options, error, correlationId, startTime, attemptsUsed);
      
      default:
        return this.executeDefaultFallback(options, error, correlationId, startTime, attemptsUsed);
    }
  }

  /**
   * Execute fallback service strategy
   */
  private async executeFallbackService(
    options: EmergencyFallbackOptions,
    error: Error,
    correlationId: string,
    startTime: number,
    attemptsUsed: number
  ): Promise<EmergencyFallbackResult> {
    const correlatedLogger = createCorrelationLogger(correlationId);
    
    try {
      let fallbackData;
      
      switch (options.operationType) {
        case 'report_generation':
          fallbackData = await this.generateEmergencyReport(options.projectId, correlatedLogger);
          break;
        case 'analysis':
          fallbackData = await this.performEmergencyAnalysis(options.projectId, correlatedLogger);
          break;
        default:
          throw new Error(`No fallback service available for ${options.operationType}`);
      }

      return {
        success: true,
        data: fallbackData,
        fallbackUsed: true,
        fallbackType: 'emergency_service',
        errorClassification: this.classifyError(error),
        recoveryTime: Date.now() - startTime,
        attemptsUsed,
        warnings: ['Used fallback service due to primary service failure'],
        userMessage: 'Operation completed using backup system'
      };
    } catch (fallbackError) {
      return this.executeEmergencyMode(options, fallbackError as Error, correlationId, startTime, attemptsUsed);
    }
  }

  /**
   * Execute emergency mode strategy
   */
  private async executeEmergencyMode(
    options: EmergencyFallbackOptions,
    error: Error,
    correlationId: string,
    startTime: number,
    attemptsUsed: number
  ): Promise<EmergencyFallbackResult> {
    const correlatedLogger = createCorrelationLogger(correlationId);
    
    // Enable emergency mode for this project
    this.emergencyModeActive.add(options.projectId);
    
    correlatedLogger.warn('Activating emergency mode', {
      projectId: options.projectId,
      operationType: options.operationType
    });

    try {
      let emergencyData;
      
      if (options.operationType === 'report_generation') {
        emergencyData = await this.generateEmergencyReport(options.projectId, correlatedLogger);
      } else {
        // For non-report operations, provide minimal fallback
        emergencyData = {
          emergency: true,
          message: 'System operating in emergency mode',
          limitedFunctionality: true
        };
      }

      // Notify administrators
      this.notifyAdministrators(options, error, correlatedLogger);

      return {
        success: true,
        data: emergencyData,
        fallbackUsed: true,
        fallbackType: 'emergency_service',
        errorClassification: this.classifyError(error),
        recoveryTime: Date.now() - startTime,
        attemptsUsed,
        warnings: ['System operating in emergency mode', 'Limited functionality available'],
        userMessage: 'System is operating with limited functionality. Full service will be restored soon.'
      };
    } catch (emergencyError) {
      return {
        success: false,
        fallbackUsed: true,
        fallbackType: 'emergency_service',
        errorClassification: this.classifyError(emergencyError as Error),
        recoveryTime: Date.now() - startTime,
        attemptsUsed,
        warnings: ['Emergency mode failed'],
        userMessage: 'System is experiencing severe difficulties. Please contact support immediately.'
      };
    }
  }

  /**
   * Execute user notification strategy
   */
  private async executeUserNotification(
    options: EmergencyFallbackOptions,
    error: Error,
    correlationId: string,
    startTime: number,
    attemptsUsed: number
  ): Promise<EmergencyFallbackResult> {
    const errorClassification = this.classifyError(error);
    
    // Log for user notification systems
    logger.warn('User notification required for error', {
      projectId: options.projectId,
      operationType: options.operationType,
      errorClassification,
      correlationId
    });

    return {
      success: false,
      fallbackUsed: false,
      fallbackType: 'none',
      errorClassification,
      recoveryTime: Date.now() - startTime,
      attemptsUsed,
      warnings: ['User intervention required'],
      userMessage: errorClassification.userFriendlyMessage
    };
  }

  /**
   * Execute default fallback strategy
   */
  private async executeDefaultFallback(
    options: EmergencyFallbackOptions,
    error: Error,
    correlationId: string,
    startTime: number,
    attemptsUsed: number
  ): Promise<EmergencyFallbackResult> {
    const errorClassification = this.classifyError(error);
    
    return {
      success: false,
      fallbackUsed: false,
      fallbackType: 'none',
      errorClassification,
      recoveryTime: Date.now() - startTime,
      attemptsUsed,
      warnings: ['No suitable fallback available'],
      userMessage: 'Operation failed. Please try again later.'
    };
  }

  /**
   * Generate emergency report when primary report generation fails
   */
  private async generateEmergencyReport(projectId: string, logger: any): Promise<any> {
    logger.info('Generating emergency fallback report', { projectId });

    try {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
          competitors: {
            include: {
              snapshots: {
                orderBy: { createdAt: 'desc' },
                take: 1
              }
            }
          }
        }
      });

      if (!project) {
        throw new Error(`Project ${projectId} not found`);
      }

      const emergencyReport = {
        id: createId(),
        title: `Emergency Report - ${project.name}`,
        summary: 'This is an emergency report generated due to system issues.',
        content: `# Emergency Report for ${project.name}

**Generated:** ${new Date().toISOString()}
**Status:** Emergency Fallback Mode

## Project Overview
- **Name:** ${project.name}
- **Competitors:** ${project.competitors?.length || 0}
- **Last Updated:** ${new Date().toISOString()}

## System Status
- **Mode:** Emergency Fallback
- **Functionality:** Limited
- **Data Freshness:** May be outdated

## Next Steps
1. System recovery is in progress
2. Full report will be available once services are restored
3. Please check back in a few minutes

*This report was generated using emergency fallback procedures.*`,
        metadata: {
          emergency: true,
          generatedAt: new Date(),
          competitorIds: project.competitors?.map(c => c.id) || [],
          reportType: 'emergency_fallback'
        },
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Save emergency report
      await prisma.report.create({
        data: {
          id: emergencyReport.id,
          name: emergencyReport.title,
          description: 'Emergency fallback report',
          projectId: projectId,
          competitorId: project.competitors?.[0]?.id || '',
          status: 'COMPLETED'
        }
      });

      trackBusinessEvent('emergency_report_generated', {
        projectId,
        reportId: emergencyReport.id
      });

      return emergencyReport;
    } catch (error) {
      logger.error('Failed to generate emergency report', error as Error);
      throw error;
    }
  }

  /**
   * Perform emergency analysis when primary analysis fails
   */
  private async performEmergencyAnalysis(projectId: string, logger: any): Promise<any> {
    logger.info('Performing emergency analysis', { projectId });

    return {
      emergency: true,
      analysisType: 'emergency_fallback',
      results: {
        message: 'Emergency analysis mode active',
        limitedData: true,
        recommendation: 'Full analysis will be available once systems are restored'
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Perform emergency data collection
   */
  private async performEmergencyDataCollection(projectId: string, logger: any): Promise<any> {
    logger.info('Performing emergency data collection', { projectId });

    return {
      emergency: true,
      collectionType: 'emergency_fallback',
      data: {
        message: 'Emergency data collection mode',
        limitedData: true,
        recommendation: 'Full data collection will resume once systems are restored'
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Calculate backoff delay with jitter
   */
  private calculateBackoffDelay(attempt: number, config: RetryConfig): number {
    const exponentialDelay = Math.min(
      config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt - 1),
      config.maxDelayMs
    );

    if (config.jitterEnabled) {
      // Add ±25% jitter
      const jitter = exponentialDelay * 0.25 * (Math.random() * 2 - 1);
      return Math.max(0, Math.floor(exponentialDelay + jitter));
    }

    return exponentialDelay;
  }

  /**
   * Get circuit breaker state
   */
  private getCircuitBreakerState(key: string): CircuitBreakerState {
    const breaker = this.circuitBreakers.get(key);
    if (!breaker) {
      return CircuitBreakerState.CLOSED;
    }

    const now = Date.now();
    
    if (breaker.state === CircuitBreakerState.OPEN) {
      if (now >= breaker.nextRetryTime) {
        breaker.state = CircuitBreakerState.HALF_OPEN;
        breaker.halfOpenCalls = 0;
      }
    }

    return breaker.state;
  }

  /**
   * Record successful operation
   */
  private recordSuccess(key: string, logger: any): void {
    const breaker = this.circuitBreakers.get(key);
    if (breaker) {
      if (breaker.state === CircuitBreakerState.HALF_OPEN) {
        breaker.halfOpenCalls++;
        if (breaker.halfOpenCalls >= EmergencyFallbackSystem.DEFAULT_CIRCUIT_BREAKER_CONFIG.halfOpenMaxCalls) {
          breaker.state = CircuitBreakerState.CLOSED;
          breaker.failureCount = 0;
          logger.info('Circuit breaker reset to CLOSED state', { key });
        }
      } else if (breaker.state === CircuitBreakerState.CLOSED) {
        breaker.failureCount = Math.max(0, breaker.failureCount - 1);
      }
    }

    // Record success in history
    this.recordOperationHistory(key, true);
  }

  /**
   * Record failed operation
   */
  private recordFailure(key: string, logger: any): void {
    let breaker = this.circuitBreakers.get(key);
    if (!breaker) {
      breaker = {
        state: CircuitBreakerState.CLOSED,
        failureCount: 0,
        lastFailureTime: 0,
        nextRetryTime: 0,
        halfOpenCalls: 0
      };
      this.circuitBreakers.set(key, breaker);
    }

    breaker.failureCount++;
    breaker.lastFailureTime = Date.now();

    if (breaker.state === CircuitBreakerState.HALF_OPEN) {
      breaker.state = CircuitBreakerState.OPEN;
      breaker.nextRetryTime = Date.now() + EmergencyFallbackSystem.DEFAULT_CIRCUIT_BREAKER_CONFIG.recoveryTimeout;
      logger.warn('Circuit breaker opened from HALF_OPEN state', { key });
    } else if (breaker.state === CircuitBreakerState.CLOSED && 
               breaker.failureCount >= EmergencyFallbackSystem.DEFAULT_CIRCUIT_BREAKER_CONFIG.failureThreshold) {
      breaker.state = CircuitBreakerState.OPEN;
      breaker.nextRetryTime = Date.now() + EmergencyFallbackSystem.DEFAULT_CIRCUIT_BREAKER_CONFIG.recoveryTimeout;
      logger.warn('Circuit breaker opened due to failure threshold', { key, failureCount: breaker.failureCount });
    }

    // Record failure in history
    this.recordOperationHistory(key, false);
  }

  /**
   * Record operation history for monitoring
   */
  private recordOperationHistory(key: string, success: boolean): void {
    let history = this.retryHistory.get(key);
    if (!history) {
      history = [];
      this.retryHistory.set(key, history);
    }

    history.push({ timestamp: Date.now(), success });

    // Keep only last 100 entries
    if (history.length > 100) {
      history.splice(0, history.length - 100);
    }
  }

  /**
   * Start circuit breaker monitoring
   */
  private startCircuitBreakerMonitoring(): void {
    setInterval(() => {
      const now = Date.now();
      const monitoringPeriod = EmergencyFallbackSystem.DEFAULT_CIRCUIT_BREAKER_CONFIG.monitoringPeriod;

      // Clean up old history
      for (const [key, history] of this.retryHistory.entries()) {
        const recentHistory = history.filter(entry => now - entry.timestamp <= monitoringPeriod);
        this.retryHistory.set(key, recentHistory);
      }

      // Log circuit breaker states
      if (this.circuitBreakers.size > 0) {
        const states = Array.from(this.circuitBreakers.entries()).map(([key, breaker]) => ({
          key,
          state: breaker.state,
          failureCount: breaker.failureCount
        }));
        
        logger.debug('Circuit breaker status', { states });
      }
    }, 60000); // Check every minute
  }

  /**
   * Notify administrators of critical issues
   */
  private notifyAdministrators(options: EmergencyFallbackOptions, error: Error, logger: any): void {
    logger.error('Critical system issue - administrator notification', {
      projectId: options.projectId,
      operationType: options.operationType,
      error: error.message,
      emergencyModeActive: Array.from(this.emergencyModeActive)
    });

    trackBusinessEvent('administrator_notification_sent', {
      projectId: options.projectId,
      operationType: options.operationType,
      severity: 'critical',
      error: error.message
    });
  }

  /**
   * Check if emergency mode is active for a project
   */
  public isEmergencyModeActive(projectId: string): boolean {
    return this.emergencyModeActive.has(projectId);
  }

  /**
   * Disable emergency mode for a project
   */
  public disableEmergencyMode(projectId: string): void {
    this.emergencyModeActive.delete(projectId);
    logger.info('Emergency mode disabled', { projectId });
  }

  /**
   * Get system status
   */
  public getSystemStatus(): {
    circuitBreakers: Array<{ key: string; state: CircuitBreakerState; failureCount: number }>;
    emergencyModeProjects: string[];
    totalOperations: number;
  } {
    const circuitBreakers = Array.from(this.circuitBreakers.entries()).map(([key, breaker]) => ({
      key,
      state: breaker.state,
      failureCount: breaker.failureCount
    }));

    const totalOperations = Array.from(this.retryHistory.values())
      .reduce((total, history) => total + history.length, 0);

    return {
      circuitBreakers,
      emergencyModeProjects: Array.from(this.emergencyModeActive),
      totalOperations
    };
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const emergencyFallbackSystem = EmergencyFallbackSystem.getInstance(); 