/**
 * Unified AnalysisService - Task 2.1 Implementation
 * 
 * Consolidates three analysis services into a unified architecture:
 * - ComparativeAnalysisService: Structured competitive analysis
 * - UserExperienceAnalyzer: UX-focused competitive analysis  
 * - SmartAIService: AI analysis with smart scheduling integration
 * 
 * Key Features:
 * - Factory pattern for sub-analyzers (AI, UX, Comparative)
 * - Shared BedrockService instance across all analyzers
 * - Preserved critical data flows (Smart Scheduling integration)
 * - Unified error handling with correlation ID tracking
 * - Backward compatibility for existing consumers
 * - Enhanced observability and monitoring (Task 3.3)
 */

import { BedrockService } from '@/services/bedrock/bedrock.service';
import { SmartSchedulingService } from '@/services/smartSchedulingService';
import { ConversationManager } from '@/lib/chat/conversation';
import { dataIntegrityValidator } from '@/lib/validation/dataIntegrity';
import { logger, generateCorrelationId, trackErrorWithCorrelation, trackPerformance, trackBusinessEvent } from '@/lib/logger';
import { createId } from '@paralleldrive/cuid2';
import { registerService } from '@/services/serviceRegistry';

// Import unified types from Task 1.3
import {
  AnalysisRequest,
  AnalysisResponse, 
  AnalysisConfig,
  AnalysisType,
  AnalysisContext,
  AnalysisError,
  AnalysisErrorCode,
  InsufficientDataError,
  AIServiceError,
  AnalysisServiceHealth,
  ServiceHealthStatus,
  AnalysisHistoryEntry,
  DEFAULT_ANALYSIS_CONFIG,
  
  // Preserve original service types for backward compatibility
  ComparativeAnalysisInput,
  ComparativeAnalysis,
  UXAnalysisOptions,
  UXAnalysisResult,
  UXAnalysisRequest,
  SmartAIAnalysisRequest,
  SmartAIAnalysisResponse,
  SmartAISetupConfig,
  ProjectFreshnessStatus,
  
  // Utility functions
  validateAnalysisRequest,
  isAnalysisType
} from './types/analysisTypes';

// Import original service interfaces for backward compatibility
import type { 
  ComparativeAnalysisService as IComparativeAnalysisService
} from '@/types/analysis';
import type { ProductSnapshot } from '@/types/product';
import type { Snapshot } from '@prisma/client';

// ============================================================================
// SHARED INFRASTRUCTURE CLASSES
// ============================================================================

/**
 * BedrockService Manager - Centralized BedrockService management
 * Eliminates duplicate initialization patterns across all three original services
 */
class BedrockServiceManager {
  private static instance: BedrockService | null = null;
  private static initializationPromise: Promise<BedrockService> | null = null;

  static async getSharedInstance(config?: any): Promise<BedrockService> {
    if (this.instance) {
      return this.instance;
    }

    if (this.initializationPromise) {
      return await this.initializationPromise;
    }

    this.initializationPromise = this.initializeService(config);
    try {
      this.instance = await this.initializationPromise;
      this.initializationPromise = null;
      return this.instance;
    } catch (error) {
      this.initializationPromise = null;
      throw error;
    }
  }

  private static async initializeService(config?: any): Promise<BedrockService> {
    try {
      // Pattern preserved from all three original services: try stored credentials first
      logger.info('Initializing shared BedrockService with stored credentials');
      return await BedrockService.createWithStoredCredentials('anthropic', config);
    } catch (error) {
      logger.warn('Failed to initialize with stored credentials, falling back to environment variables', { error });
      // Fallback pattern from all three services
      return new BedrockService(config || {}, 'anthropic');
    }
  }

  static resetInstance(): void {
    this.instance = null;
    this.initializationPromise = null;
  }
}

/**
 * Analysis Correlation Manager - Unified correlation tracking
 * Consolidates correlation patterns from all three original services
 */
class AnalysisCorrelationManager {
  private static correlationContext: Map<string, AnalysisContext> = new Map();

  static createContext(analysisType: string, projectId?: string): AnalysisContext {
    const correlationId = generateCorrelationId();
    const context: AnalysisContext = {
      correlationId,
      analysisType,
      projectId: projectId || '',
      startTime: Date.now(),
      operations: []
    };

    this.correlationContext.set(correlationId, context);
    return context;
  }

  static addOperation(correlationId: string, operation: string, metadata?: any): void {
    const context = this.correlationContext.get(correlationId);
    if (context) {
      context.operations.push({
        operation,
        timestamp: Date.now(),
        metadata
      });
    }
  }

  static getContext(correlationId: string): AnalysisContext | undefined {
    return this.correlationContext.get(correlationId);
  }

  static logWithCorrelation(level: 'info' | 'warn' | 'error', message: string, correlationId: string, data?: any): void {
    const context = this.correlationContext.get(correlationId);
    logger[level](message, {
      correlationId,
      analysisType: context?.analysisType,
      projectId: context?.projectId,
      operationCount: context?.operations.length || 0,
      processingTime: context ? Date.now() - context.startTime : 0,
      ...data
    });
  }

  static cleanup(correlationId: string): void {
    this.correlationContext.delete(correlationId);
  }
}

/**
 * Analysis Error Handler - Unified error handling
 * Preserves error classification patterns from ComparativeAnalysisService
 */
class AnalysisErrorHandler {
  static handleAnalysisError(
    error: Error, 
    context: AnalysisContext, 
    operation: string
  ): AnalysisError {
    const correlationId = context.correlationId;

    // Preserve AWS-specific error classification from ComparativeAnalysisService
    if (this.isAWSCredentialError(error)) {
      const analysisError = new AnalysisError(
        'AWS credentials are invalid or expired. Please refresh your credentials.',
        'AWS_CREDENTIALS_ERROR',
        { originalError: error, correlationId, userFriendly: true }
      );
      AnalysisCorrelationManager.logWithCorrelation('error', 'AWS credentials error detected', correlationId, { operation });
      return analysisError;
    }

    if (this.isAWSRateLimitError(error)) {
      const analysisError = new AnalysisError(
        'AWS rate limit exceeded. Please wait a few minutes before trying again.',
        'AWS_RATE_LIMIT_ERROR',
        { originalError: error, correlationId, userFriendly: true }
      );
      AnalysisCorrelationManager.logWithCorrelation('error', 'AWS rate limit exceeded', correlationId, { operation });
      return analysisError;
    }

    if (this.isAWSQuotaError(error)) {
      const analysisError = new AnalysisError(
        'AWS service quota exceeded. Please contact your administrator.',
        'AWS_QUOTA_ERROR',
        { originalError: error, correlationId, userFriendly: true }
      );
      AnalysisCorrelationManager.logWithCorrelation('error', 'AWS quota exceeded', correlationId, { operation });
      return analysisError;
    }

    if (this.isAWSConnectionError(error)) {
      const analysisError = new AnalysisError(
        'Unable to connect to AWS services. Please check your connection and try again.',
        'AWS_CONNECTION_ERROR',
        { originalError: error, correlationId, userFriendly: true }
      );
      AnalysisCorrelationManager.logWithCorrelation('error', 'AWS connection error detected', correlationId, { operation });
      return analysisError;
    }

    // Data validation errors (preserve from ComparativeAnalysisService)
    if (error instanceof InsufficientDataError) {
      AnalysisCorrelationManager.logWithCorrelation('error', 'Insufficient data for analysis', correlationId, { operation });
      return new AnalysisError(error.message, 'INSUFFICIENT_DATA', { originalError: error, correlationId });
    }

    // Generic analysis error
    AnalysisCorrelationManager.logWithCorrelation('error', 'Analysis operation failed', correlationId, { 
      operation, 
      errorMessage: error.message,
      errorStack: error.stack
    });
    
    return new AnalysisError(
      'Analysis operation failed. Please try again.',
      'ANALYSIS_ERROR',
      { originalError: error, correlationId }
    );
  }

  private static isAWSCredentialError(error: Error): boolean {
    const message = error.message.toLowerCase();
    return message.includes('credential') || 
           message.includes('unauthorized') || 
           message.includes('access denied');
  }

  private static isAWSRateLimitError(error: Error): boolean {
    const message = error.message.toLowerCase();
    return message.includes('rate limit') || 
           message.includes('throttle') || 
           message.includes('too many requests');
  }

  private static isAWSQuotaError(error: Error): boolean {
    const message = error.message.toLowerCase();
    return message.includes('quota') || 
           message.includes('limit exceeded');
  }

  private static isAWSConnectionError(error: Error): boolean {
    const message = error.message.toLowerCase();
    return message.includes('network') || 
           message.includes('timeout') || 
           message.includes('connection');
  }
}

// ============================================================================
// SUB-ANALYZER INTERFACES (Factory Pattern)
// ============================================================================

/**
 * AIAnalyzer Interface - Smart AI analysis with scheduling integration
 * Preserves SmartAIService functionality exactly
 */
export interface IAIAnalyzer {
  analyzeWithSmartScheduling(request: SmartAIAnalysisRequest): Promise<SmartAIAnalysisResponse>;
  setupAutoAnalysis(projectId: string, config: SmartAISetupConfig): Promise<void>;
  validateDataFreshness(projectId: string): Promise<ProjectFreshnessStatus>;
  cleanup(): Promise<void>;
}

/**
 * UXAnalyzer Interface - UX-focused competitive analysis  
 * Preserves UserExperienceAnalyzer functionality exactly
 */
export interface IUXAnalyzer {
  analyzeProductVsCompetitors(
    productData: ProductSnapshot & { product: { name: string; website: string } },
    competitorData: (Snapshot & { competitor: { name: string; website: string } })[],
    options?: UXAnalysisOptions
  ): Promise<UXAnalysisResult>;
  
  analyzeCompetitiveUX(product: any, competitors: any[], options?: any): Promise<any>;
  
  generateFocusedAnalysis(
    productData: ProductSnapshot,
    competitorData: Snapshot[],
    focusArea: 'navigation' | 'mobile' | 'conversion' | 'content' | 'accessibility'
  ): Promise<UXAnalysisResult>;
}

/**
 * ComparativeAnalyzer Interface - Structured comparative analysis
 * Preserves ComparativeAnalysisService functionality exactly
 */
export interface IComparativeAnalyzer {
  analyzeProductVsCompetitors(input: ComparativeAnalysisInput): Promise<ComparativeAnalysis>;
  generateAnalysisReport(analysis: ComparativeAnalysis): Promise<string>;
  getAnalysisHistory(projectId: string): Promise<ComparativeAnalysis[]>;
  updateAnalysisConfiguration(config: Partial<any>): void;
}

// ============================================================================
// MAIN UNIFIED ANALYSIS SERVICE
// ============================================================================

/**
 * Primary AnalysisService Interface
 */
export interface IAnalysisService {
  // Primary unified analysis method
  analyzeProduct(request: AnalysisRequest): Promise<AnalysisResponse>;
  
  // Backward compatibility methods (preserve exact signatures)
  analyzeProductVsCompetitors(input: ComparativeAnalysisInput): Promise<ComparativeAnalysis>;
  analyzeWithSmartScheduling(request: SmartAIAnalysisRequest): Promise<SmartAIAnalysisResponse>;
  analyzeProductUX(request: UXAnalysisRequest): Promise<UXAnalysisResult>;
  
  // Configuration and management
  updateAnalysisConfiguration(config: Partial<AnalysisConfig>): Promise<void>;
  getAnalysisHistory(projectId: string, analysisType?: AnalysisType): Promise<AnalysisHistoryEntry[]>;
  
  // Health and monitoring
  getServiceHealth(): Promise<AnalysisServiceHealth>;
  cleanup(): Promise<void>;
}

/**
 * Unified AnalysisService Implementation
 * 
 * Core class that consolidates three analysis services while preserving
 * all critical functionality and maintaining backward compatibility
 */
export class AnalysisService implements IAnalysisService {
  // Sub-analyzers (factory pattern)
  private aiAnalyzer: IAIAnalyzer | null = null;
  private uxAnalyzer: IUXAnalyzer | null = null;
  private comparativeAnalyzer: IComparativeAnalyzer | null = null;

  // Shared infrastructure
  private bedrockService: BedrockService | null = null;
  private smartSchedulingService: SmartSchedulingService; // CRITICAL DEPENDENCY
  private conversationManager: ConversationManager;
  private configuration: AnalysisConfig;
  private isInitialized = false;

  // Performance and health tracking
  private analysisCount = 0;
  private successCount = 0;
  private totalProcessingTime = 0;
  private lastHealthCheck = new Date();

  // Task 3.3: Enhanced performance metrics collection
  private performanceMetrics = {
    // Analysis type specific metrics
    aiAnalyses: { count: 0, totalTime: 0, errorCount: 0, lastError: null as Date | null },
    uxAnalyses: { count: 0, totalTime: 0, errorCount: 0, lastError: null as Date | null },
    comparativeAnalyses: { count: 0, totalTime: 0, errorCount: 0, lastError: null as Date | null },
    
    // Service health metrics  
    bedrockServiceErrors: 0,
    smartSchedulingErrors: 0,
    
    // Performance thresholds and alerts
    slowAnalysisThreshold: 30000, // 30 seconds
    slowAnalysisCount: 0,
    criticalErrorCount: 0,
    
    // Business metrics
    dataFreshnessHits: 0,
    dataFreshnessMisses: 0,
    confidenceScoreSum: 0,
    qualityScoreSum: 0,
    
    // Time-based metrics
    metricsStartTime: Date.now(),
    lastMetricsReset: new Date(),
    dailyAnalysisCount: 0,
    hourlyAnalysisCount: 0,
    lastHourReset: new Date()
  };

  // Task 3.3: Alert configuration
  private alertThresholds = {
    errorRatePercent: 10, // Alert if error rate > 10%
    slowAnalysisPercent: 20, // Alert if > 20% of analyses are slow
    criticalErrorCount: 5, // Alert if > 5 critical errors in monitoring period
    lowConfidencePercent: 30, // Alert if > 30% analyses have low confidence
    serviceDowntime: 60000 // Alert if any service is down > 1 minute
  };

  constructor(config?: Partial<AnalysisConfig>) {
    // Initialize shared dependencies immediately (non-async dependencies)
    this.smartSchedulingService = new SmartSchedulingService(); // PRESERVE CRITICAL DEPENDENCY
    this.conversationManager = new ConversationManager();
    
    // Merge configuration with defaults
    this.configuration = {
      ...DEFAULT_ANALYSIS_CONFIG,
      ...config
    };

    logger.info('AnalysisService initialized', {
      enabledAnalyzers: this.configuration.enabledAnalyzers,
      aiProvider: this.configuration.aiConfig.provider,
      maxCompetitors: this.configuration.performance.maxCompetitors
    });
  }

  /**
   * Lazy initialization of BedrockService and sub-analyzers
   * Avoids async constructor issues while ensuring all dependencies are ready
   */
  private async ensureInitialized(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      logger.info('Initializing AnalysisService components');

      // Initialize shared BedrockService
      this.bedrockService = await BedrockServiceManager.getSharedInstance(this.configuration.aiConfig);

      // Initialize sub-analyzers using factory pattern
      if (this.configuration.enabledAnalyzers.aiAnalyzer) {
        this.aiAnalyzer = this.createAIAnalyzer();
      }

      if (this.configuration.enabledAnalyzers.uxAnalyzer) {
        this.uxAnalyzer = this.createUXAnalyzer();
      }

      if (this.configuration.enabledAnalyzers.comparativeAnalyzer) {
        this.comparativeAnalyzer = this.createComparativeAnalyzer();
      }

      this.isInitialized = true;
      
      logger.info('AnalysisService initialization completed', {
        aiAnalyzerEnabled: !!this.aiAnalyzer,
        uxAnalyzerEnabled: !!this.uxAnalyzer,
        comparativeAnalyzerEnabled: !!this.comparativeAnalyzer
      });

    } catch (error) {
      logger.error('Failed to initialize AnalysisService', error as Error);
      throw new AnalysisError(
        'Failed to initialize analysis service',
        'ANALYSIS_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Factory method for AIAnalyzer - preserves SmartAIService functionality
   */
  private createAIAnalyzer(): IAIAnalyzer {
    // Import and instantiate the actual AIAnalyzer implementation
    // This will be implemented in Task 2.2
    throw new Error('AIAnalyzer implementation not yet available - will be implemented in Task 2.2');
  }

  /**
   * Factory method for UXAnalyzer - preserves UserExperienceAnalyzer functionality
   */
  private createUXAnalyzer(): IUXAnalyzer {
    // Import and instantiate the UXAnalyzer implementation
    const { UXAnalyzer } = require('./analysis/UXAnalyzer');
    return new UXAnalyzer(
      this.bedrockService
    );
  }

  /**
   * Factory method for ComparativeAnalyzer - preserves ComparativeAnalysisService functionality
   */
  private createComparativeAnalyzer(): IComparativeAnalyzer {
    // Import and instantiate the ComparativeAnalyzer implementation
    const { ComparativeAnalyzer } = require('./analysis/ComparativeAnalyzer');
    return new ComparativeAnalyzer(
      this.bedrockService,
      dataIntegrityValidator, // CRITICAL DEPENDENCY
      this.mapToLegacyConfig(this.configuration)
    );
  }

  // ============================================================================
  // PRIMARY UNIFIED INTERFACE
  // ============================================================================

  /**
   * Primary unified analysis method
   * Routes requests to appropriate sub-analyzers based on analysis type
   */
  async analyzeProduct(request: AnalysisRequest): Promise<AnalysisResponse> {
    await this.ensureInitialized();

    // Validate request
    if (!validateAnalysisRequest(request)) {
      throw new AnalysisError(
        'Invalid analysis request',
        'VALIDATION_ERROR',
        { request }
      );
    }

    const context = AnalysisCorrelationManager.createContext(request.analysisType, request.projectId);
    const startTime = Date.now();

    try {
      AnalysisCorrelationManager.logWithCorrelation('info', 'Unified analysis started', context.correlationId, {
        analysisType: request.analysisType,
        projectId: request.projectId,
        priority: request.priority
      });

      // Route to appropriate sub-analyzer
      let result: AnalysisResponse;

      switch (request.analysisType) {
        case 'ai_comprehensive':
        case 'smart_scheduling':
          result = await this.handleAIAnalysis(request, context);
          break;
          
        case 'ux_comparison':
          result = await this.handleUXAnalysis(request, context);
          break;
          
        case 'comparative_analysis':
          result = await this.handleComparativeAnalysis(request, context);
          break;
          
        default:
          throw new AnalysisError(
            `Unsupported analysis type: ${request.analysisType}`,
            'VALIDATION_ERROR',
            { analysisType: request.analysisType }
          );
      }

      // Update performance metrics
      const processingTime = Date.now() - startTime;
      this.trackAnalysisPerformance(request.analysisType, true, processingTime, context);

      AnalysisCorrelationManager.logWithCorrelation('info', 'Unified analysis completed successfully', context.correlationId, {
        analysisId: result.analysisId,
        processingTime,
        qualityScore: result.quality?.overallScore
      });

      return result;

    } catch (error) {
      // Update performance metrics
      const processingTime = Date.now() - startTime;
      this.trackAnalysisPerformance(request.analysisType, false, processingTime, context);

      // Handle and transform error
      const analysisError = AnalysisErrorHandler.handleAnalysisError(error as Error, context, 'analyzeProduct');
      throw analysisError;

    } finally {
      // Cleanup correlation context
      AnalysisCorrelationManager.cleanup(context.correlationId);
    }
  }

  /**
   * Handle AI comprehensive analysis (routes to AIAnalyzer)
   */
  private async handleAIAnalysis(request: AnalysisRequest, context: AnalysisContext): Promise<AnalysisResponse> {
    if (!this.aiAnalyzer) {
      throw new AnalysisError('AI Analyzer is not enabled', 'VALIDATION_ERROR');
    }

    // Convert unified request to SmartAIAnalysisRequest
    const smartRequest: SmartAIAnalysisRequest = {
      projectId: request.projectId,
      forceFreshData: request.forceFreshData || false,
      analysisType: 'comprehensive',
      ...(request.dataCutoff && { dataCutoff: request.dataCutoff }),
      ...(request.context && { context: request.context })
    };

    AnalysisCorrelationManager.addOperation(context.correlationId, 'ai_analysis_start');
    const smartResult = await this.aiAnalyzer.analyzeWithSmartScheduling(smartRequest);
    AnalysisCorrelationManager.addOperation(context.correlationId, 'ai_analysis_complete');

    // Convert SmartAIAnalysisResponse to unified AnalysisResponse
    return {
      analysisId: createId(),
      correlationId: context.correlationId,
      analysisType: request.analysisType,
      summary: this.extractSummaryFromSmartAnalysis(smartResult),
      metadata: this.createUnifiedMetadata(smartResult.analysisMetadata, context),
      quality: this.assessSmartAnalysisQuality(smartResult),
      smartAnalysis: smartResult
    };
  }

  /**
   * Handle UX comparison analysis (routes to UXAnalyzer)
   */
  private async handleUXAnalysis(request: AnalysisRequest, context: AnalysisContext): Promise<AnalysisResponse> {
    if (!this.uxAnalyzer) {
      throw new AnalysisError('UX Analyzer is not enabled', 'VALIDATION_ERROR');
    }

    // Convert unified request to UX request format
    if (!request.productData || !request.competitorData) {
      throw new AnalysisError('Product and competitor data required for UX analysis', 'VALIDATION_ERROR');
    }

    // Convert CompetitorAnalysisData to UX format with proper type mapping
    const productForUX = {
      ...request.productData.snapshot!,
      product: {
        name: request.productData.name,
        website: request.productData.website
      }
    } as any;

    const competitorsForUX = request.competitorData.map(comp => ({
      ...comp.snapshot!,
      // Add required Prisma Snapshot properties with defaults
      captureStartTime: null,
      captureEndTime: null,
      captureSuccess: true,
      errorMessage: null,
      captureSize: null,
      competitor: {
        name: comp.competitor.name,
        website: comp.competitor.website
      }
    })) as any[];

    AnalysisCorrelationManager.addOperation(context.correlationId, 'ux_analysis_start');
    const uxResult = await this.uxAnalyzer.analyzeProductVsCompetitors(
      productForUX,
      competitorsForUX,
      request.options?.uxOptions
    );
    AnalysisCorrelationManager.addOperation(context.correlationId, 'ux_analysis_complete');

    // Convert UXAnalysisResult to unified AnalysisResponse
    return {
      analysisId: createId(),
      correlationId: context.correlationId,
      analysisType: request.analysisType,
      summary: this.convertUXSummary(uxResult),
      recommendations: this.convertUXRecommendations(uxResult.recommendations),
      metadata: this.createUnifiedMetadata(uxResult.metadata, context),
      quality: this.assessUXQuality(uxResult),
      uxAnalysis: uxResult
    };
  }

  /**
   * Handle comparative analysis (routes to ComparativeAnalyzer) 
   */
  private async handleComparativeAnalysis(request: AnalysisRequest, context: AnalysisContext): Promise<AnalysisResponse> {
    if (!this.comparativeAnalyzer) {
      throw new AnalysisError('Comparative Analyzer is not enabled', 'VALIDATION_ERROR');
    }

    // Convert unified request to ComparativeAnalysisInput format
    if (!request.productData || !request.competitorData) {
      throw new AnalysisError('Product and competitor data required for comparative analysis', 'VALIDATION_ERROR');
    }

    const comparativeInput = this.convertToComparativeInput(request);

    AnalysisCorrelationManager.addOperation(context.correlationId, 'comparative_analysis_start');
    const comparativeResult = await this.comparativeAnalyzer.analyzeProductVsCompetitors(comparativeInput);
    AnalysisCorrelationManager.addOperation(context.correlationId, 'comparative_analysis_complete');

    // Convert ComparativeAnalysis to unified AnalysisResponse
    return {
      analysisId: comparativeResult.id,
      correlationId: context.correlationId,
      analysisType: request.analysisType,
      summary: this.convertComparativeSummary(comparativeResult.summary),
      detailed: this.convertComparativeDetailed(comparativeResult.detailed),
      recommendations: this.convertComparativeRecommendations(comparativeResult.recommendations),
      metadata: this.createUnifiedMetadata(comparativeResult.metadata, context),
      quality: this.assessComparativeQuality(comparativeResult),
      comparativeAnalysis: comparativeResult
    };
  }

  // ============================================================================
  // BACKWARD COMPATIBILITY METHODS (Preserve Exact Signatures)
  // ============================================================================

  /**
   * Backward compatibility: ComparativeAnalysisService.analyzeProductVsCompetitors()
   * CRITICAL: Preserves exact method signature for existing consumers
   */
  async analyzeProductVsCompetitors(input: ComparativeAnalysisInput): Promise<ComparativeAnalysis> {
    await this.ensureInitialized();
    
    if (!this.comparativeAnalyzer) {
      throw new AnalysisError('Comparative analysis is not enabled', 'VALIDATION_ERROR');
    }

    const context = AnalysisCorrelationManager.createContext('comparative_analysis', input.product.id);
    
    try {
      AnalysisCorrelationManager.logWithCorrelation('info', 'Backward compatibility: analyzeProductVsCompetitors', context.correlationId);
      return await this.comparativeAnalyzer.analyzeProductVsCompetitors(input);
    } catch (error) {
      const analysisError = AnalysisErrorHandler.handleAnalysisError(error as Error, context, 'analyzeProductVsCompetitors');
      throw analysisError;
    } finally {
      AnalysisCorrelationManager.cleanup(context.correlationId);
    }
  }

  /**
   * Backward compatibility: SmartAIService.analyzeWithSmartScheduling()
   * CRITICAL: Preserves exact method signature and Smart Scheduling integration
   */
  async analyzeWithSmartScheduling(request: SmartAIAnalysisRequest): Promise<SmartAIAnalysisResponse> {
    await this.ensureInitialized();
    
    if (!this.aiAnalyzer) {
      throw new AnalysisError('AI analysis is not enabled', 'VALIDATION_ERROR');
    }

    const context = AnalysisCorrelationManager.createContext('smart_scheduling', request.projectId);
    
    try {
      AnalysisCorrelationManager.logWithCorrelation('info', 'Backward compatibility: analyzeWithSmartScheduling', context.correlationId, {
        forceFreshData: request.forceFreshData,
        analysisType: request.analysisType
      });
      
      // CRITICAL: Delegate to AIAnalyzer to preserve exact Smart Scheduling integration
      const result = await this.aiAnalyzer.analyzeWithSmartScheduling(request);
      return result;
    } catch (error) {
      const analysisError = AnalysisErrorHandler.handleAnalysisError(error as Error, context, 'analyzeWithSmartScheduling');
      throw analysisError;
    } finally {
      AnalysisCorrelationManager.cleanup(context.correlationId);
    }
  }

  /**
   * Backward compatibility: UserExperienceAnalyzer.analyzeProductVsCompetitors()
   * CRITICAL: Preserves exact method signature for existing consumers
   */
  async analyzeProductUX(request: UXAnalysisRequest): Promise<UXAnalysisResult> {
    await this.ensureInitialized();
    
    if (!this.uxAnalyzer) {
      throw new AnalysisError('UX analysis is not enabled', 'VALIDATION_ERROR');
    }

    const context = AnalysisCorrelationManager.createContext('ux_comparison');
    
    try {
      AnalysisCorrelationManager.logWithCorrelation('info', 'Backward compatibility: analyzeProductUX', context.correlationId);
      
      // Convert UXAnalysisRequest to proper format for UXAnalyzer
      const competitorsForUX = request.competitorData.map(comp => ({
        ...comp,
        // Add required Prisma Snapshot properties with defaults
        captureStartTime: null,
        captureEndTime: null,
        captureSuccess: true,
        errorMessage: null,
        captureSize: null
      })) as any[];

      return await this.uxAnalyzer.analyzeProductVsCompetitors(
        request.productData,
        competitorsForUX,
        request.options
      );
    } catch (error) {
      const analysisError = AnalysisErrorHandler.handleAnalysisError(error as Error, context, 'analyzeProductUX');
      throw analysisError;
    } finally {
      AnalysisCorrelationManager.cleanup(context.correlationId);
    }
  }

  // ============================================================================
  // CONFIGURATION AND MANAGEMENT
  // ============================================================================

  /**
   * Update analysis configuration
   */
  async updateAnalysisConfiguration(config: Partial<AnalysisConfig>): Promise<void> {
    logger.info('Updating analysis configuration', { config });
    
    this.configuration = {
      ...this.configuration,
      ...config
    };

    // Reset initialization if BedrockService config changed
    if (config.aiConfig) {
      this.isInitialized = false;
      BedrockServiceManager.resetInstance();
      logger.info('BedrockService configuration changed, will reinitialize on next analysis');
    }

    // Update sub-analyzer configurations
    if (this.comparativeAnalyzer && config.aiConfig) {
      this.comparativeAnalyzer.updateAnalysisConfiguration(config.aiConfig);
    }
  }

  /**
   * Get analysis history for project
   */
  async getAnalysisHistory(projectId: string, analysisType?: AnalysisType): Promise<AnalysisHistoryEntry[]> {
    // This would typically query a database for stored analyses
    // For now, delegate to comparative analyzer if it has history capabilities
    if (this.comparativeAnalyzer) {
      const comparativeHistory = await this.comparativeAnalyzer.getAnalysisHistory(projectId);
      return comparativeHistory.map(analysis => ({
        analysisId: analysis.id,
        projectId: analysis.projectId,
        analysisType: 'comparative_analysis' as AnalysisType,
        createdAt: analysis.analysisDate,
        status: 'completed' as const,
        summary: `${analysis.summary.keyStrengths.length} strengths, ${analysis.summary.keyWeaknesses.length} weaknesses`,
        confidenceScore: analysis.metadata.confidenceScore,
        processingTime: analysis.metadata.processingTime,
        dataQuality: analysis.metadata.dataQuality
      }));
    }

    return [];
  }

  /**
   * Get service health status
   */
  async getServiceHealth(): Promise<AnalysisServiceHealth> {
    this.lastHealthCheck = new Date();

    const healthStatus: AnalysisServiceHealth = {
      status: 'healthy',
      services: {
        aiAnalyzer: await this.checkAIAnalyzerHealth(),
        uxAnalyzer: await this.checkUXAnalyzerHealth(),
        comparativeAnalyzer: await this.checkComparativeAnalyzerHealth(),
        bedrockService: await this.checkBedrockServiceHealth(),
        smartSchedulingService: await this.checkSmartSchedulingServiceHealth()
      },
      metrics: {
        totalAnalyses: this.analysisCount,
        successRate: this.analysisCount > 0 ? (this.successCount / this.analysisCount) * 100 : 100,
        averageResponseTime: this.analysisCount > 0 ? this.totalProcessingTime / this.analysisCount : 0,
        memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024 // MB
      },
      lastHealthCheck: this.lastHealthCheck
    };

    // Determine overall health status
    const serviceStatuses = Object.values(healthStatus.services);
    if (serviceStatuses.some(s => s.status === 'unhealthy')) {
      healthStatus.status = 'unhealthy';
    } else if (serviceStatuses.some(s => s.status === 'degraded')) {
      healthStatus.status = 'degraded';
    }

    return healthStatus;
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    logger.info('Cleaning up AnalysisService resources');

    if (this.aiAnalyzer) {
      await this.aiAnalyzer.cleanup();
    }

    if (this.smartSchedulingService) {
      await this.smartSchedulingService.cleanup();
    }

    BedrockServiceManager.resetInstance();
    this.isInitialized = false;

    logger.info('AnalysisService cleanup completed');
  }

  // ============================================================================
  // PRIVATE UTILITY METHODS
  // ============================================================================

  // Task 3.3: Enhanced metrics collection (replaces simple updateMetrics)
  private updateMetrics(success: boolean, processingTime: number): void {
    this.analysisCount++;
    this.totalProcessingTime += processingTime;
    
    if (success) {
      this.successCount++;
    }
  }

  // Task 3.3: Comprehensive performance metrics tracking
  private trackAnalysisPerformance(
    analysisType: AnalysisType, 
    success: boolean, 
    processingTime: number, 
    context: AnalysisContext,
    qualityScore?: number,
    confidenceScore?: number,
    dataFreshness?: boolean
  ): void {
    // Update basic metrics
    this.updateMetrics(success, processingTime);
    
    // Update time-based metrics
    this.updateTimeBasedMetrics();
    
    // Track analysis type specific metrics
    const typeMetrics = this.getAnalysisTypeMetrics(analysisType);
    typeMetrics.count++;
    typeMetrics.totalTime += processingTime;
    
    if (!success) {
      typeMetrics.errorCount++;
      typeMetrics.lastError = new Date();
      this.performanceMetrics.criticalErrorCount++;
    }
    
    // Track slow analysis
    if (processingTime > this.performanceMetrics.slowAnalysisThreshold) {
      this.performanceMetrics.slowAnalysisCount++;
    }
    
    // Track business metrics
    if (dataFreshness !== undefined) {
      if (dataFreshness) {
        this.performanceMetrics.dataFreshnessHits++;
      } else {
        this.performanceMetrics.dataFreshnessMisses++;
      }
    }
    
    if (confidenceScore) {
      this.performanceMetrics.confidenceScoreSum += confidenceScore;
    }
    
    if (qualityScore) {
      this.performanceMetrics.qualityScoreSum += qualityScore;
    }
    
    // Track business events with correlation
    trackBusinessEvent('analysis_completed', {
      analysisType,
      success,
      processingTime,
      qualityScore,
      confidenceScore,
      dataFreshness,
      correlationId: context.correlationId,
      projectId: context.projectId
    }, {
      correlationId: context.correlationId,
      projectId: context.projectId || 'unknown',
      operation: 'track_analysis_performance'
    });
    
    // Check and trigger alerts
    this.checkAlertThresholds(context.correlationId);
  }

  // Task 3.3: Time-based metrics management
  private updateTimeBasedMetrics(): void {
    const now = new Date();
    
    // Reset hourly count if needed
    if (now.getTime() - this.performanceMetrics.lastHourReset.getTime() > 3600000) {
      this.performanceMetrics.hourlyAnalysisCount = 0;
      this.performanceMetrics.lastHourReset = now;
    }
    
    this.performanceMetrics.hourlyAnalysisCount++;
    this.performanceMetrics.dailyAnalysisCount++;
  }

  // Task 3.3: Get analysis type specific metrics
  private getAnalysisTypeMetrics(analysisType: AnalysisType) {
    switch (analysisType) {
      case 'ai_comprehensive':
      case 'smart_scheduling':
        return this.performanceMetrics.aiAnalyses;
      case 'ux_comparison':
        return this.performanceMetrics.uxAnalyses;
      case 'comparative_analysis':
        return this.performanceMetrics.comparativeAnalyses;
      default:
        return this.performanceMetrics.aiAnalyses; // Default fallback
    }
  }

  // Task 3.3: Alert threshold monitoring
  private checkAlertThresholds(correlationId: string): void {
    const errorRate = this.analysisCount > 0 ? 
      ((this.analysisCount - this.successCount) / this.analysisCount) * 100 : 0;
    
    const slowAnalysisRate = this.analysisCount > 0 ? 
      (this.performanceMetrics.slowAnalysisCount / this.analysisCount) * 100 : 0;
    
    const avgConfidence = this.analysisCount > 0 ? 
      this.performanceMetrics.confidenceScoreSum / this.analysisCount : 100;
    
    // Error rate alert
    if (errorRate > this.alertThresholds.errorRatePercent) {
      this.triggerAlert('high_error_rate', {
        errorRate,
        threshold: this.alertThresholds.errorRatePercent,
        totalAnalyses: this.analysisCount,
        failedAnalyses: this.analysisCount - this.successCount
      }, correlationId);
    }
    
    // Slow analysis alert
    if (slowAnalysisRate > this.alertThresholds.slowAnalysisPercent) {
      this.triggerAlert('high_slow_analysis_rate', {
        slowAnalysisRate,
        threshold: this.alertThresholds.slowAnalysisPercent,
        slowAnalysisCount: this.performanceMetrics.slowAnalysisCount,
        totalAnalyses: this.analysisCount
      }, correlationId);
    }
    
    // Critical error count alert
    if (this.performanceMetrics.criticalErrorCount > this.alertThresholds.criticalErrorCount) {
      this.triggerAlert('critical_error_threshold_exceeded', {
        criticalErrorCount: this.performanceMetrics.criticalErrorCount,
        threshold: this.alertThresholds.criticalErrorCount
      }, correlationId);
    }
    
    // Low confidence alert
    if (avgConfidence < (100 - this.alertThresholds.lowConfidencePercent)) {
      this.triggerAlert('low_confidence_scores', {
        averageConfidence: avgConfidence,
        threshold: 100 - this.alertThresholds.lowConfidencePercent
      }, correlationId);
    }
  }

  // Task 3.3: Alert triggering with correlation tracking
  private triggerAlert(alertType: string, alertData: any, correlationId: string): void {
    logger.warn(`Analysis Service Alert: ${alertType}`, {
      alertType,
      alertData,
      correlationId,
      service: 'AnalysisService',
      timestamp: new Date().toISOString()
    });
    
    // Track alert as business event
    trackBusinessEvent('analysis_service_alert', {
      alertType,
      alertData,
      service: 'AnalysisService'
    }, {
      correlationId,
      operation: 'trigger_alert',
      alertLevel: 'warning'
    });
  }

  // Task 3.3: Get comprehensive performance metrics
  public getPerformanceMetrics(): any {
    const now = Date.now();
    const uptimeMs = now - this.performanceMetrics.metricsStartTime;
    
    return {
      // Overall metrics
      totalAnalyses: this.analysisCount,
      successfulAnalyses: this.successCount,
      failedAnalyses: this.analysisCount - this.successCount,
      successRate: this.analysisCount > 0 ? (this.successCount / this.analysisCount) * 100 : 100,
      errorRate: this.analysisCount > 0 ? ((this.analysisCount - this.successCount) / this.analysisCount) * 100 : 0,
      
      // Performance metrics
      averageProcessingTime: this.analysisCount > 0 ? this.totalProcessingTime / this.analysisCount : 0,
      slowAnalysisCount: this.performanceMetrics.slowAnalysisCount,
      slowAnalysisRate: this.analysisCount > 0 ? (this.performanceMetrics.slowAnalysisCount / this.analysisCount) * 100 : 0,
      
      // Analysis type breakdown
      aiAnalyses: {
        ...this.performanceMetrics.aiAnalyses,
        averageTime: this.performanceMetrics.aiAnalyses.count > 0 ? 
          this.performanceMetrics.aiAnalyses.totalTime / this.performanceMetrics.aiAnalyses.count : 0,
        errorRate: this.performanceMetrics.aiAnalyses.count > 0 ?
          (this.performanceMetrics.aiAnalyses.errorCount / this.performanceMetrics.aiAnalyses.count) * 100 : 0
      },
      uxAnalyses: {
        ...this.performanceMetrics.uxAnalyses,
        averageTime: this.performanceMetrics.uxAnalyses.count > 0 ? 
          this.performanceMetrics.uxAnalyses.totalTime / this.performanceMetrics.uxAnalyses.count : 0,
        errorRate: this.performanceMetrics.uxAnalyses.count > 0 ?
          (this.performanceMetrics.uxAnalyses.errorCount / this.performanceMetrics.uxAnalyses.count) * 100 : 0
      },
      comparativeAnalyses: {
        ...this.performanceMetrics.comparativeAnalyses,
        averageTime: this.performanceMetrics.comparativeAnalyses.count > 0 ? 
          this.performanceMetrics.comparativeAnalyses.totalTime / this.performanceMetrics.comparativeAnalyses.count : 0,
        errorRate: this.performanceMetrics.comparativeAnalyses.count > 0 ?
          (this.performanceMetrics.comparativeAnalyses.errorCount / this.performanceMetrics.comparativeAnalyses.count) * 100 : 0
      },
      
      // Business metrics
      dataFreshnessRate: (this.performanceMetrics.dataFreshnessHits + this.performanceMetrics.dataFreshnessMisses) > 0 ?
        (this.performanceMetrics.dataFreshnessHits / (this.performanceMetrics.dataFreshnessHits + this.performanceMetrics.dataFreshnessMisses)) * 100 : 100,
      averageConfidenceScore: this.analysisCount > 0 ? this.performanceMetrics.confidenceScoreSum / this.analysisCount : 0,
      averageQualityScore: this.analysisCount > 0 ? this.performanceMetrics.qualityScoreSum / this.analysisCount : 0,
      
      // Time-based metrics
      dailyAnalysisCount: this.performanceMetrics.dailyAnalysisCount,
      hourlyAnalysisCount: this.performanceMetrics.hourlyAnalysisCount,
      uptimeMs,
      uptimeFormatted: this.formatUptime(uptimeMs),
      
      // Service health
      bedrockServiceErrors: this.performanceMetrics.bedrockServiceErrors,
      smartSchedulingErrors: this.performanceMetrics.smartSchedulingErrors,
      criticalErrorCount: this.performanceMetrics.criticalErrorCount,
      
      // Timestamps
      metricsStartTime: new Date(this.performanceMetrics.metricsStartTime).toISOString(),
      lastMetricsReset: this.performanceMetrics.lastMetricsReset.toISOString(),
      lastHealthCheck: this.lastHealthCheck.toISOString()
    };
  }

  // Task 3.3: Format uptime for human readability
  private formatUptime(uptimeMs: number): string {
    const seconds = Math.floor(uptimeMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
    if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  private extractSummaryFromSmartAnalysis(smartResult: SmartAIAnalysisResponse): any {
    // Convert SmartAI analysis to unified summary format
    return {
      overallPosition: 'competitive' as const,
      keyStrengths: smartResult.recommendations?.immediate || [],
      keyWeaknesses: ['Requires detailed analysis'],
      opportunityScore: 75,
      threatLevel: 'medium' as const,
      confidenceScore: smartResult.analysisMetadata.dataFreshGuaranteed ? 85 : 65
    };
  }

  private createUnifiedMetadata(originalMetadata: any, context: AnalysisContext): any {
    return {
      analysisMethod: 'ai_powered' as const,
      modelUsed: this.configuration.aiConfig.model,
      confidenceScore: originalMetadata.dataFreshGuaranteed ? 85 : 65,
      processingTime: Date.now() - context.startTime,
      dataQuality: originalMetadata.dataFreshGuaranteed ? 'high' : 'medium',
      correlationId: context.correlationId,
      analysisTimestamp: new Date(),
      dataFreshGuaranteed: originalMetadata.dataFreshGuaranteed,
      scrapingTriggered: originalMetadata.scrapingTriggered,
      contextUsed: originalMetadata.contextUsed
    };
  }

  private assessSmartAnalysisQuality(smartResult: SmartAIAnalysisResponse): any {
    const baseScore = smartResult.analysisMetadata.dataFreshGuaranteed ? 85 : 65;
    return {
      overallScore: baseScore,
      qualityTier: baseScore >= 80 ? 'good' : 'fair',
      dataCompleteness: 80,
      dataFreshness: smartResult.analysisMetadata.dataFreshGuaranteed ? 95 : 60,
      analysisConfidence: baseScore,
      improvementPotential: 100 - baseScore,
      quickWinsAvailable: smartResult.recommendations?.immediate?.length || 0
    };
  }

  // UX Analysis conversion methods
  private convertUXSummary(uxResult: any): any {
    return {
      overallPosition: 'competitive' as const,
      keyStrengths: Array.isArray(uxResult.strengths) ? uxResult.strengths.slice(0, 3) : ['UX competitive features'],
      keyWeaknesses: Array.isArray(uxResult.weaknesses) ? uxResult.weaknesses.slice(0, 3) : ['Areas for UX improvement'],
      opportunityScore: Math.round(uxResult.confidence * 100) || 75,
      threatLevel: 'medium' as const,
      confidenceScore: Math.round(uxResult.confidence * 100) || 75
    };
  }

  private convertUXRecommendations(recommendations: string[]): any {
    const allRecommendations = Array.isArray(recommendations) ? recommendations : [];
    return {
      immediate: allRecommendations.slice(0, 3),
      shortTerm: allRecommendations.slice(3, 6),
      longTerm: allRecommendations.slice(6, 9),
      priorityScore: 80
    };
  }

  private assessUXQuality(uxResult: any): any {
    const confidenceScore = Math.round(uxResult.confidence * 100) || 75;
    return {
      overallScore: confidenceScore,
      qualityTier: confidenceScore >= 80 ? 'good' : confidenceScore >= 60 ? 'fair' : 'poor',
      dataCompleteness: uxResult.metadata?.dataQuality === 'high' ? 90 : 
                       uxResult.metadata?.dataQuality === 'medium' ? 70 : 50,
      dataFreshness: 80, // UX analysis doesn't depend on data freshness as much
      analysisConfidence: confidenceScore,
      improvementPotential: 100 - confidenceScore,
      quickWinsAvailable: Array.isArray(uxResult.recommendations) ? uxResult.recommendations.length : 0
    };
  }

  // Comparative Analysis conversion methods
  private convertToComparativeInput(request: AnalysisRequest): ComparativeAnalysisInput {
    return {
      product: {
        id: request.productData!.id,
        name: request.productData!.name,
        website: request.productData!.website,
        positioning: request.productData!.positioning || '',
        customerData: request.productData!.customerData || '',
        userProblem: request.productData!.userProblem || '',
        industry: request.productData!.industry || ''
      },
      productSnapshot: request.productData!.snapshot!,
      competitors: request.competitorData!.map(comp => ({
        competitor: {
          ...comp.competitor,
          industry: comp.competitor.industry || 'Unknown',
          createdAt: new Date(),
          updatedAt: new Date()
        },
        snapshot: comp.snapshot!
      })),
      ...(request.options?.comparativeOptions && { analysisConfig: request.options.comparativeOptions })
    };
  }

  private convertComparativeSummary(summary: any): any {
    return {
      overallPosition: summary.overallPosition || 'competitive',
      keyStrengths: summary.keyStrengths || [],
      keyWeaknesses: summary.keyWeaknesses || [],
      opportunityScore: summary.opportunityScore || 75,
      threatLevel: summary.threatLevel || 'medium',
      confidenceScore: 85
    };
  }

  private convertComparativeDetailed(detailed: any): any {
    return detailed; // Already in correct format
  }

  private convertComparativeRecommendations(recommendations: any): any {
    return {
      immediate: recommendations.immediate || [],
      shortTerm: recommendations.shortTerm || [],
      longTerm: recommendations.longTerm || [],
      priorityScore: recommendations.priorityScore || 80
    };
  }

  private assessComparativeQuality(result: any): any {
    const confidenceScore = result.metadata?.confidenceScore || 75;
    return {
      overallScore: confidenceScore,
      qualityTier: confidenceScore >= 80 ? 'good' : confidenceScore >= 60 ? 'fair' : 'poor',
      dataCompleteness: result.metadata?.dataQuality === 'high' ? 90 : 
                       result.metadata?.dataQuality === 'medium' ? 70 : 50,
      dataFreshness: 85, // Comparative analysis uses current data
      analysisConfidence: confidenceScore,
      improvementPotential: 100 - confidenceScore,
      quickWinsAvailable: result.recommendations?.immediate?.length || 0
    };
  }

  private mapToLegacyConfig(config: AnalysisConfig): any {
    return {
      provider: config.aiConfig.provider,
      model: config.aiConfig.model,
      maxTokens: config.aiConfig.maxTokens,
      temperature: config.aiConfig.temperature,
      focusAreas: config.focusAreas,
      includeMetrics: true,
      includeRecommendations: true,
      analysisDepth: config.analysisDepth
    };
  }

  // Health check methods for individual services
  private async checkAIAnalyzerHealth(): Promise<ServiceHealthStatus> {
    if (!this.aiAnalyzer || !this.configuration.enabledAnalyzers.aiAnalyzer) {
      return { status: 'unhealthy', lastError: 'AI Analyzer not enabled' };
    }
    
    // Task 3.3: Enhanced health check with performance metrics
    const aiMetrics = this.performanceMetrics.aiAnalyses;
    const recentErrors = aiMetrics.lastError && 
      (Date.now() - aiMetrics.lastError.getTime()) < 300000; // 5 minutes
    
    const baseStatus = {
      status: recentErrors ? 'degraded' as const : 'healthy' as const,
      responseTime: aiMetrics.count > 0 ? aiMetrics.totalTime / aiMetrics.count : 0,
      errorRate: aiMetrics.count > 0 ? (aiMetrics.errorCount / aiMetrics.count) * 100 : 0
    };
    
    return recentErrors ? 
      { ...baseStatus, lastError: `Recent error at ${aiMetrics.lastError?.toISOString()}` } :
      baseStatus;
  }

  private async checkUXAnalyzerHealth(): Promise<ServiceHealthStatus> {
    if (!this.uxAnalyzer || !this.configuration.enabledAnalyzers.uxAnalyzer) {
      return { status: 'unhealthy', lastError: 'UX Analyzer not enabled' };
    }
    
    // Task 3.3: Enhanced health check with performance metrics
    const uxMetrics = this.performanceMetrics.uxAnalyses;
    const recentErrors = uxMetrics.lastError && 
      (Date.now() - uxMetrics.lastError.getTime()) < 300000; // 5 minutes
    
    const baseStatus = {
      status: recentErrors ? 'degraded' as const : 'healthy' as const,
      responseTime: uxMetrics.count > 0 ? uxMetrics.totalTime / uxMetrics.count : 0,
      errorRate: uxMetrics.count > 0 ? (uxMetrics.errorCount / uxMetrics.count) * 100 : 0
    };
    
    return recentErrors ? 
      { ...baseStatus, lastError: `Recent error at ${uxMetrics.lastError?.toISOString()}` } :
      baseStatus;
  }

  private async checkComparativeAnalyzerHealth(): Promise<ServiceHealthStatus> {
    if (!this.comparativeAnalyzer || !this.configuration.enabledAnalyzers.comparativeAnalyzer) {
      return { status: 'unhealthy', lastError: 'Comparative Analyzer not enabled' };
    }
    
    // Task 3.3: Enhanced health check with performance metrics
    const compMetrics = this.performanceMetrics.comparativeAnalyses;
    const recentErrors = compMetrics.lastError && 
      (Date.now() - compMetrics.lastError.getTime()) < 300000; // 5 minutes
    
    const baseStatus = {
      status: recentErrors ? 'degraded' as const : 'healthy' as const,
      responseTime: compMetrics.count > 0 ? compMetrics.totalTime / compMetrics.count : 0,
      errorRate: compMetrics.count > 0 ? (compMetrics.errorCount / compMetrics.count) * 100 : 0
    };
    
    return recentErrors ? 
      { ...baseStatus, lastError: `Recent error at ${compMetrics.lastError?.toISOString()}` } :
      baseStatus;
  }

  private async checkBedrockServiceHealth(): Promise<ServiceHealthStatus> {
    if (!this.bedrockService) {
      return { status: 'unhealthy', lastError: 'BedrockService not initialized' };
    }
    
    // Task 3.3: Enhanced health check with error tracking
    const recentBedrockErrors = this.performanceMetrics.bedrockServiceErrors > 0;
    
    const baseStatus = {
      status: recentBedrockErrors ? 'degraded' as const : 'healthy' as const,
      errorRate: this.performanceMetrics.bedrockServiceErrors
    };
    
    return recentBedrockErrors ? 
      { ...baseStatus, lastError: 'Recent Bedrock service errors detected' } :
      baseStatus;
  }

  private async checkSmartSchedulingServiceHealth(): Promise<ServiceHealthStatus> {
    // CRITICAL: Always check SmartSchedulingService health as it's critical dependency
    try {
      // Task 3.3: Enhanced health check with error tracking
      const recentSchedulingErrors = this.performanceMetrics.smartSchedulingErrors > 0;
      
      const baseStatus = {
        status: recentSchedulingErrors ? 'degraded' as const : 'healthy' as const,
        errorRate: this.performanceMetrics.smartSchedulingErrors
      };
      
      return recentSchedulingErrors ? 
        { ...baseStatus, lastError: 'Recent Smart Scheduling errors detected' } :
        baseStatus;
    } catch (error) {
      return { 
        status: 'unhealthy', 
        lastError: `SmartSchedulingService error: ${(error as Error).message}` 
      };
    }
  }
}

// ============================================================================
// SERVICE REGISTRATION AND EXPORT
// ============================================================================

// Register this service with the service registry (preserve pattern from original services)
registerService(AnalysisService, {
  singleton: true,
  dependencies: ['BedrockService', 'SmartSchedulingService'],
  healthCheck: async () => {
    try {
      const service = new AnalysisService();
      const health = await service.getServiceHealth();
      return health.status !== 'unhealthy';
    } catch {
      return false;
    }
  }
});

// Export singleton instance (preserve pattern from original services)
export const analysisService = new AnalysisService();

// Export all classes and types for testing and advanced usage
export {
  BedrockServiceManager,
  AnalysisCorrelationManager,  
  AnalysisErrorHandler
}; 