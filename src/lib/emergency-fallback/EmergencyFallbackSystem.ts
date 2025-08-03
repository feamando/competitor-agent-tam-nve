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
        correlatedLogger.error('All retry attempts exhausted, initiating emergency fallback', error as Error, {
          projectId: options.projectId,
          operationType: options.operationType,
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
   * Task 5.1: Enhanced to include available partial data
   */
  private async generateEmergencyReport(projectId: string, logger: any): Promise<any> {
    logger.info('Generating enhanced emergency fallback report with partial data', { projectId });

    try {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
          products: {
            include: {
              snapshots: {
                orderBy: { createdAt: 'desc' },
                take: 1
              }
            }
          },
          competitors: {
            include: {
              snapshots: {
                orderBy: { createdAt: 'desc' },
                take: 3 // Get more snapshots for better partial analysis
              }
            }
          }
        }
      });

      if (!project) {
        throw new Error(`Project ${projectId} not found`);
      }

      // Task 5.1: Collect available partial data
      const partialData = await this.collectPartialDataForEmergency(project, logger);
      
      // Task 5.2: Generate user-friendly explanations
      const dataExplanations = this.generateDataExplanations(partialData);

      const emergencyReport = {
        id: createId(),
        title: `Emergency Report - ${project.name}`,
        summary: `Emergency report with ${partialData.dataAvailabilityScore}% data availability`,
        content: await this.generateEnhancedEmergencyContent(project, partialData, dataExplanations),
        metadata: {
          emergency: true,
          generatedAt: new Date(),
          competitorIds: project.competitors?.map(c => c.id) || [],
          reportType: 'emergency_fallback',
          dataAvailabilityScore: partialData.dataAvailabilityScore,
          partialDataIncluded: partialData.hasPartialData,
          missingDataReasons: partialData.missingDataReasons,
          // Task 5.4: Add emergency metrics
          emergencyMetrics: {
            triggerReason: 'system_failure',
            dataCompleteness: partialData.dataAvailabilityScore,
            competitorsWithData: partialData.competitorsWithData,
            productDataAvailable: partialData.productDataAvailable,
            generationTime: Date.now()
          }
        },
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Save emergency report
      await prisma.report.create({
        data: {
          id: emergencyReport.id,
          name: emergencyReport.title,
          description: `Emergency report with ${partialData.dataAvailabilityScore}% data availability`,
          projectId: projectId,
          competitorId: project.competitors?.[0]?.id || '',
          status: 'COMPLETED'
        }
      });

      // Task 5.4: Track enhanced emergency metrics
      trackBusinessEvent('enhanced_emergency_report_generated', {
        projectId,
        reportId: emergencyReport.id,
        dataAvailabilityScore: partialData.dataAvailabilityScore,
        competitorsWithData: partialData.competitorsWithData,
        productDataAvailable: partialData.productDataAvailable,
        emergencyTriggerReason: 'system_failure'
      });

      logger.info('Enhanced emergency report generated successfully', {
        projectId,
        reportId: emergencyReport.id,
        dataAvailabilityScore: partialData.dataAvailabilityScore
      });

      return emergencyReport;
    } catch (error) {
      logger.error('Failed to generate enhanced emergency report', error as Error);
      throw error;
    }
  }

  /**
   * Task 5.1: Collect available partial data for emergency report
   */
  private async collectPartialDataForEmergency(project: any, logger: any): Promise<any> {
    logger.info('Collecting partial data for emergency report', { projectId: project.id });

    const partialData = {
      hasPartialData: false,
      dataAvailabilityScore: 0,
      competitorsWithData: 0,
      productDataAvailable: false,
      missingDataReasons: [] as string[],
      availableCompetitorData: [] as any[],
      productSnapshot: null as any,
      lastDataUpdate: null as Date | null
    };

    try {
      // Check product data availability
      if (project.products && project.products.length > 0) {
        const product = project.products[0];
        if (product.snapshots && product.snapshots.length > 0) {
          partialData.productDataAvailable = true;
          partialData.productSnapshot = product.snapshots[0];
          partialData.lastDataUpdate = new Date(product.snapshots[0].createdAt);
        } else {
          partialData.missingDataReasons.push('No product snapshots available');
        }
      } else {
        partialData.missingDataReasons.push('No product data configured');
      }

      // Check competitor data availability
      if (project.competitors && project.competitors.length > 0) {
        project.competitors.forEach((competitor: any) => {
          if (competitor.snapshots && competitor.snapshots.length > 0) {
            partialData.competitorsWithData++;
            partialData.availableCompetitorData.push({
              id: competitor.id,
              name: competitor.name,
              url: competitor.url,
              latestSnapshot: competitor.snapshots[0],
              snapshotCount: competitor.snapshots.length
            });
          }
        });

        if (partialData.competitorsWithData === 0) {
          partialData.missingDataReasons.push('No competitor snapshots available');
        }
      } else {
        partialData.missingDataReasons.push('No competitors configured');
      }

      // Calculate data availability score
      const totalPossibleData = 1 + (project.competitors?.length || 0); // 1 product + N competitors
      const availableData = (partialData.productDataAvailable ? 1 : 0) + partialData.competitorsWithData;
      partialData.dataAvailabilityScore = Math.round((availableData / totalPossibleData) * 100);
      partialData.hasPartialData = partialData.dataAvailabilityScore > 0;

      logger.info('Partial data collected for emergency report', {
        projectId: project.id,
        dataAvailabilityScore: partialData.dataAvailabilityScore,
        competitorsWithData: partialData.competitorsWithData,
        productDataAvailable: partialData.productDataAvailable
      });

      return partialData;
    } catch (error) {
      logger.error('Failed to collect partial data for emergency report', error as Error);
      partialData.missingDataReasons.push('Data collection system failure');
      return partialData;
    }
  }

  /**
   * Task 5.2: Generate user-friendly explanations for missing data
   */
  private generateDataExplanations(partialData: any): any {
    const explanations = {
      missingDataExplanation: '',
      userFriendlyMessage: '',
      recommendations: [] as string[],
      technicalDetails: partialData.missingDataReasons
    };

    if (partialData.dataAvailabilityScore === 0) {
      explanations.missingDataExplanation = 'No product or competitor data is currently available due to system maintenance or data collection issues.';
      explanations.userFriendlyMessage = '🔧 We\'re experiencing temporary data collection issues. Our team is working to restore full functionality.';
      explanations.recommendations = [
        'Check back in 15-30 minutes for a complete report',
        'Contact support if this issue persists',
        'Consider refreshing your project data once systems are restored'
      ];
    } else if (partialData.dataAvailabilityScore < 50) {
      explanations.missingDataExplanation = `Only ${partialData.dataAvailabilityScore}% of your project data is currently available. Some competitor information may be missing.`;
      explanations.userFriendlyMessage = '⚠️ This report contains partial data. Some competitor analysis may be incomplete.';
      explanations.recommendations = [
        'Review the available data sections below',
        'A complete report will be generated once all data is available',
        'Consider updating your competitor list if needed'
      ];
    } else {
      explanations.missingDataExplanation = `${partialData.dataAvailabilityScore}% of your project data is available. Most analysis can be completed.`;
      explanations.userFriendlyMessage = '✅ Most of your project data is available. This report provides a comprehensive analysis.';
      explanations.recommendations = [
        'Review the complete analysis below',
        'Minor updates may be available in the next report refresh'
      ];
    }

    return explanations;
  }

  /**
   * Task 5.1 & 5.2: Generate enhanced emergency content with partial data and explanations
   */
  private async generateEnhancedEmergencyContent(project: any, partialData: any, explanations: any): Promise<string> {
    const currentTime = new Date().toISOString();
    
    let content = `# Emergency Report - ${project.name}

**Generated:** ${currentTime}  
**Status:** Emergency Fallback Mode  
**Data Availability:** ${partialData.dataAvailabilityScore}%

---

## 📊 Data Availability Summary

${explanations.userFriendlyMessage}

**Available Data:**
- Product Data: ${partialData.productDataAvailable ? '✅ Available' : '❌ Missing'}
- Competitors with Data: ${partialData.competitorsWithData} of ${project.competitors?.length || 0}
- Overall Completeness: ${partialData.dataAvailabilityScore}%

`;

    // Add partial data sections if available
    if (partialData.hasPartialData) {
      content += `---

## 🏢 Product Information
`;
      
      if (partialData.productDataAvailable && partialData.productSnapshot) {
        const product = project.products[0];
        const snapshot = partialData.productSnapshot;
        content += `
**Product Name:** ${product.name || 'N/A'}
**URL:** ${product.url || 'N/A'}
**Last Updated:** ${new Date(snapshot.createdAt).toLocaleDateString()}
**Data Quality:** ${snapshot.metadata?.qualityScore || 'N/A'}%

`;
      } else {
        content += `
⚠️ Product data is currently unavailable. This may be due to:
- Product page not accessible
- Data collection system maintenance
- Configuration issues

`;
      }

      content += `---

## 🏭 Competitor Analysis
`;

      if (partialData.competitorsWithData > 0) {
        content += `
**Competitors with Available Data:** ${partialData.competitorsWithData}

`;
        partialData.availableCompetitorData.forEach((competitor: any) => {
          content += `### ${competitor.name}
- **URL:** ${competitor.url}  
- **Last Snapshot:** ${new Date(competitor.latestSnapshot.createdAt).toLocaleDateString()}  
- **Data Points:** ${competitor.snapshotCount} snapshots available  

`;
        });
      } else {
        content += `
⚠️ No competitor data is currently available. This may be due to:
- Competitor websites not accessible
- Data collection system maintenance
- Network connectivity issues

`;
      }
    }

    content += `---

## 🔧 System Status & Next Steps

**Current Status:** ${explanations.missingDataExplanation}

**Recommended Actions:**
`;
    
    explanations.recommendations.forEach((rec: string) => {
      content += `- ${rec}\n`;
    });

    content += `
**Technical Details:**
`;
    partialData.missingDataReasons.forEach((reason: string) => {
      content += `- ${reason}\n`;
    });

    content += `
---

## 📞 Support Information

If you need immediate assistance or this issue persists:
- Contact our support team
- Reference Report ID: ${new Date().getTime()}
- Include Project ID: ${project.id}

---

*This emergency report was generated using available partial data. A complete report will be automatically generated once all systems are fully operational.*
`;

    return content;
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
   * Task 5.3: Emergency report regeneration trigger system
   */
  public async triggerEmergencyReportRegeneration(
    projectId: string, 
    options: {
      forceRegeneration?: boolean;
      dataAvailabilityThreshold?: number;
      maxRetries?: number;
    } = {}
  ): Promise<{
    success: boolean;
    regenerated: boolean;
    reportId?: string;
    dataAvailabilityScore?: number;
    message: string;
  }> {
    const correlationId = createId();
    const logger = createCorrelationLogger(correlationId);
    
    logger.info('Triggering emergency report regeneration', { 
      projectId, 
      options 
    });

    try {
      // Check if we should regenerate based on data availability
      const shouldRegenerate = await this.shouldRegenerateEmergencyReport(
        projectId, 
        options.dataAvailabilityThreshold || 70,
        logger
      );

      if (!shouldRegenerate && !options.forceRegeneration) {
        return {
          success: true,
          regenerated: false,
          message: 'Emergency report regeneration not needed - data availability sufficient'
        };
      }

      // Generate new emergency report
      const newReport = await this.generateEmergencyReport(projectId, logger);
      
      // Track regeneration event
      trackBusinessEvent('emergency_report_regenerated', {
        projectId,
        reportId: newReport.id,
        dataAvailabilityScore: newReport.metadata.dataAvailabilityScore,
        triggerReason: options.forceRegeneration ? 'manual_trigger' : 'data_availability_improved'
      });

      return {
        success: true,
        regenerated: true,
        reportId: newReport.id,
        dataAvailabilityScore: newReport.metadata.dataAvailabilityScore,
        message: 'Emergency report successfully regenerated'
      };

    } catch (error) {
      logger.error('Failed to regenerate emergency report', error as Error);
      return {
        success: false,
        regenerated: false,
        message: `Failed to regenerate emergency report: ${(error as Error).message}`
      };
    }
  }

  /**
   * Task 5.3: Check if emergency report should be regenerated
   */
  private async shouldRegenerateEmergencyReport(
    projectId: string, 
    dataThreshold: number,
    logger: any
  ): Promise<boolean> {
    try {
      // Get current project data state
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
          products: {
            include: {
              snapshots: {
                orderBy: { createdAt: 'desc' },
                take: 1
              }
            }
          },
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
        return false;
      }

      // Collect current partial data
      const partialData = await this.collectPartialDataForEmergency(project, logger);
      
      // Check if data availability has improved beyond threshold
      const shouldRegenerate = partialData.dataAvailabilityScore >= dataThreshold;
      
      logger.info('Emergency report regeneration assessment', {
        projectId,
        currentDataScore: partialData.dataAvailabilityScore,
        threshold: dataThreshold,
        shouldRegenerate
      });

      return shouldRegenerate;

    } catch (error) {
      logger.error('Failed to assess regeneration need', error as Error);
      return false;
    }
  }

  /**
   * Task 5.3: Schedule automatic regeneration checks
   */
  public scheduleEmergencyReportRegenerationCheck(
    projectId: string,
    intervalMinutes: number = 15
  ): NodeJS.Timeout {
    const logger = createCorrelationLogger(createId());
    
    logger.info('Scheduling emergency report regeneration checks', { 
      projectId, 
      intervalMinutes 
    });

    return setInterval(async () => {
      try {
        await this.triggerEmergencyReportRegeneration(projectId, {
          dataAvailabilityThreshold: 70
        });
      } catch (error) {
        logger.error('Scheduled regeneration check failed', error as Error);
      }
    }, intervalMinutes * 60 * 1000);
  }

  /**
   * Task 5.4: Enhanced emergency metrics tracking
   */
  public trackEmergencyFallbackMetrics(
    projectId: string,
    eventType: 'triggered' | 'resolved' | 'regenerated' | 'escalated',
    metrics: {
      triggerReason?: string;
      dataAvailabilityScore?: number;
      systemRecoveryTime?: number;
      userImpact?: 'low' | 'medium' | 'high';
      fallbackQuality?: number;
      additionalContext?: Record<string, any>;
    }
  ): void {
    const timestamp = Date.now();
    
    // Track comprehensive emergency metrics
    trackBusinessEvent('emergency_fallback_metrics', {
      projectId,
      eventType,
      timestamp,
      triggerReason: metrics.triggerReason || 'unknown',
      dataAvailabilityScore: metrics.dataAvailabilityScore || 0,
      systemRecoveryTime: metrics.systemRecoveryTime || 0,
      userImpact: metrics.userImpact || 'medium',
      fallbackQuality: metrics.fallbackQuality || 0,
      emergencyMode: this.emergencyModeActive.has(projectId),
      circuitBreakerStates: this.getCircuitBreakerSummary(),
      ...metrics.additionalContext
    });

    // Track specific KPIs
    this.updateEmergencyKPIs(projectId, eventType, metrics);
  }

  /**
   * Task 5.4: Update emergency KPIs
   */
  private updateEmergencyKPIs(
    projectId: string,
    eventType: string,
    metrics: any
  ): void {
    const kpiData = {
      projectId,
      eventType,
      timestamp: Date.now(),
      // Availability metrics
      emergencyReportCount: eventType === 'triggered' ? 1 : 0,
      dataAvailabilityScore: metrics.dataAvailabilityScore || 0,
      // Performance metrics
      systemRecoveryTime: metrics.systemRecoveryTime || 0,
      fallbackQuality: metrics.fallbackQuality || 0,
      // User experience metrics
      userImpactLevel: this.calculateUserImpactScore(metrics.userImpact || 'medium'),
      // System health metrics
      circuitBreakerStatus: this.getCircuitBreakerHealthScore(),
      emergencyModeActive: this.emergencyModeActive.has(projectId)
    };

    trackBusinessEvent('emergency_fallback_kpis', kpiData);
  }

  /**
   * Task 5.4: Calculate user impact score for metrics
   */
  private calculateUserImpactScore(impact: 'low' | 'medium' | 'high'): number {
    switch (impact) {
      case 'low': return 1;
      case 'medium': return 5;
      case 'high': return 10;
      default: return 5;
    }
  }

  /**
   * Task 5.4: Get circuit breaker health score
   */
  private getCircuitBreakerHealthScore(): number {
    const totalBreakers = this.circuitBreakers.size;
    if (totalBreakers === 0) return 100;

    const openBreakers = Array.from(this.circuitBreakers.values())
      .filter(breaker => breaker.state === CircuitBreakerState.OPEN).length;

    return Math.round(((totalBreakers - openBreakers) / totalBreakers) * 100);
  }

  /**
   * Task 5.4: Get circuit breaker summary for metrics
   */
  private getCircuitBreakerSummary(): Record<string, any> {
    const summary: Record<string, any> = {};
    
    this.circuitBreakers.forEach((breaker, key) => {
      summary[key] = {
        state: breaker.state,
        failureCount: breaker.failureCount,
        lastFailureTime: breaker.lastFailureTime
      };
    });

    return summary;
  }

  /**
   * Task 5.4: Generate emergency metrics report
   */
  public generateEmergencyMetricsReport(projectId?: string): {
    summary: any;
    metrics: any[];
    recommendations: string[];
  } {
    const activeEmergencies = this.emergencyModeActive.size;
    const circuitBreakerHealth = this.getCircuitBreakerHealthScore();
    
    const summary = {
      timestamp: new Date().toISOString(),
      activeEmergencies,
      totalProjects: projectId ? 1 : this.emergencyModeActive.size,
      circuitBreakerHealth,
      overallSystemHealth: this.calculateOverallSystemHealth()
    };

    const metrics = this.collectDetailedMetrics(projectId);
    const recommendations = this.generateMetricsRecommendations(summary, metrics);

    return { summary, metrics, recommendations };
  }

  /**
   * Task 5.4: Calculate overall system health
   */
  private calculateOverallSystemHealth(): number {
    const circuitBreakerHealth = this.getCircuitBreakerHealthScore();
    const emergencyModeImpact = Math.max(0, 100 - (this.emergencyModeActive.size * 10));
    
    return Math.round((circuitBreakerHealth + emergencyModeImpact) / 2);
  }

  /**
   * Task 5.4: Collect detailed metrics
   */
  private collectDetailedMetrics(projectId?: string): any[] {
    const metrics: any[] = [];
    
    // Circuit breaker metrics
    this.circuitBreakers.forEach((breaker, key) => {
      metrics.push({
        type: 'circuit_breaker',
        key,
        state: breaker.state,
        failureCount: breaker.failureCount,
        lastFailureTime: breaker.lastFailureTime
      });
    });

    // Emergency mode metrics
    this.emergencyModeActive.forEach(pid => {
      if (!projectId || pid === projectId) {
        metrics.push({
          type: 'emergency_mode',
          projectId: pid,
          activeSince: Date.now(), // This would be tracked in real implementation
          impact: 'active'
        });
      }
    });

    return metrics;
  }

  /**
   * Task 5.4: Generate recommendations based on metrics
   */
  private generateMetricsRecommendations(summary: any, metrics: any[]): string[] {
    const recommendations: string[] = [];

    if (summary.circuitBreakerHealth < 80) {
      recommendations.push('Review and fix circuit breaker issues to improve system reliability');
    }

    if (summary.activeEmergencies > 0) {
      recommendations.push('Investigate root causes of emergency mode activations');
    }

    if (summary.overallSystemHealth < 70) {
      recommendations.push('System health is degraded - consider maintenance window');
    }

    const openCircuitBreakers = metrics.filter(m => 
      m.type === 'circuit_breaker' && m.state === CircuitBreakerState.OPEN
    );

    if (openCircuitBreakers.length > 0) {
      recommendations.push(`${openCircuitBreakers.length} circuit breakers are open - check service dependencies`);
    }

    return recommendations;
  }

  /**
   * Perform emergency data collection
   */
  private async performEmergencyDataCollection(projectId: string, logger: any): Promise<any> {
    logger.info('Performing emergency data collection', { projectId });

    // Task 5.4: Track emergency data collection metrics
    this.trackEmergencyFallbackMetrics(projectId, 'triggered', {
      triggerReason: 'data_collection_failure',
      userImpact: 'medium',
      additionalContext: {
        collectionType: 'emergency_data_collection'
      }
    });

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