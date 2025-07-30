# Unified AnalysisService Interface Design - Task 1.2 Implementation

**Date:** July 22, 2025  
**Task:** 1.2 - Design Unified AnalysisService Interface  
**Project:** Competitor Research Agent v1.5 - Domain Consolidation  
**Request ID:** REQ001-TASK-1.4-1.5  
**Status:** COMPLETE ✅

## Executive Summary

This document presents the comprehensive design for the unified `AnalysisService` that consolidates three existing analysis services (`ComparativeAnalysisService`, `UserExperienceAnalyzer`, `SmartAIService`) into a cohesive, modular architecture. The design preserves all critical functionality while eliminating architectural redundancy and improving maintainability.

**Key Design Principles:**
- **Preserve Critical Data Flows**: Maintain Smart Scheduling integration exactly as is
- **Backward Compatibility**: Support existing method signatures during transition
- **Modular Architecture**: Clear separation between AIAnalyzer, UXAnalyzer, and ComparativeAnalyzer
- **Unified Error Handling**: Consistent correlation ID tracking and AWS error management
- **Shared Infrastructure**: Single BedrockService instance with optimized resource usage

## 1. Unified AnalysisService Interface

### 1.1 Primary Interface Definition

```typescript
export interface IAnalysisService {
  // Primary unified analysis method
  analyzeProduct(request: UnifiedAnalysisRequest): Promise<UnifiedAnalysisResponse>;
  
  // Specialized analysis methods (preserved for backward compatibility)
  analyzeProductVsCompetitors(input: ComparativeAnalysisInput): Promise<ComparativeAnalysis>;
  analyzeWithSmartScheduling(request: SmartAIAnalysisRequest): Promise<SmartAIAnalysisResponse>;
  analyzeProductUX(request: UXAnalysisRequest): Promise<UXAnalysisResult>;
  
  // Configuration and management
  updateAnalysisConfiguration(config: Partial<UnifiedAnalysisConfiguration>): Promise<void>;
  getAnalysisHistory(projectId: string, analysisType?: AnalysisType): Promise<AnalysisHistoryEntry[]>;
  
  // Health and monitoring
  getServiceHealth(): Promise<AnalysisServiceHealth>;
  cleanup(): Promise<void>;
}
```

### 1.2 Core Request/Response Types

```typescript
// Unified analysis request interface
export interface UnifiedAnalysisRequest {
  // Analysis identification
  analysisId?: string;
  correlationId?: string;
  
  // Analysis type routing
  analysisType: 'ai_comprehensive' | 'ux_comparison' | 'comparative_analysis' | 'smart_scheduling';
  
  // Data sources
  projectId: string;
  productData?: ProductAnalysisData;
  competitorData?: CompetitorAnalysisData[];
  
  // Analysis configuration
  options?: AnalysisOptions;
  
  // Smart scheduling options (for ai_comprehensive type)
  forceFreshData?: boolean;
  dataCutoff?: Date;
  
  // Context and metadata
  context?: Record<string, any>;
  priority?: 'high' | 'normal' | 'low';
}

// Unified analysis response interface
export interface UnifiedAnalysisResponse {
  // Analysis identification
  analysisId: string;
  correlationId: string;
  analysisType: string;
  
  // Analysis results
  summary: AnalysisSummary;
  detailed?: DetailedAnalysisResult;
  recommendations?: RecommendationSet;
  
  // Metadata and quality
  metadata: AnalysisMetadata;
  quality: AnalysisQuality;
  
  // Specialized results (based on analysis type)
  comparativeAnalysis?: ComparativeAnalysis;
  uxAnalysis?: UXAnalysisResult;
  smartAnalysis?: SmartAIAnalysisResponse;
}
```

### 1.3 Analysis Configuration Types

```typescript
export interface UnifiedAnalysisConfiguration {
  // AI Configuration
  aiConfig: {
    provider: 'bedrock' | 'openai' | 'anthropic';
    model: string;
    maxTokens: number;
    temperature: number;
  };
  
  // Analysis focus areas
  focusAreas: AnalysisFocusArea[];
  analysisDepth: 'basic' | 'detailed' | 'comprehensive';
  
  // Feature flags for different analyzers
  enabledAnalyzers: {
    aiAnalyzer: boolean;
    uxAnalyzer: boolean;
    comparativeAnalyzer: boolean;
  };
  
  // Performance and quality settings
  maxCompetitors: number;
  qualityThreshold: number;
  timeoutMs: number;
  
  // Error handling and retry configuration
  retryConfig: {
    maxRetries: number;
    backoffMs: number;
    enableFallback: boolean;
  };
}
```

## 2. Modular Sub-Service Architecture

### 2.1 AIAnalyzer Sub-Service

**Purpose:** Smart AI analysis with data freshness guarantees (preserves SmartAIService functionality)

```typescript
export interface IAIAnalyzer {
  // Primary analysis method with smart scheduling integration
  analyzeWithSmartScheduling(request: SmartAIAnalysisRequest): Promise<SmartAIAnalysisResponse>;
  
  // Enhanced analysis with context
  generateEnhancedAnalysis(
    request: EnhancedAnalysisRequest, 
    freshnessStatus: ProjectFreshnessStatus,
    correlationId: string
  ): Promise<string>;
  
  // Auto analysis setup
  setupAutoAnalysis(projectId: string, config: SmartAISetupConfig): Promise<void>;
  
  // Health check
  validateDataFreshness(projectId: string): Promise<DataFreshnessStatus>;
}

export class AIAnalyzer implements IAIAnalyzer {
  constructor(
    private smartSchedulingService: SmartSchedulingService, // CRITICAL DEPENDENCY
    private bedrockService: BedrockService,
    private conversationManager: ConversationManager,
    private logger: Logger
  ) {}
  
  // Implementation preserves exact SmartAIService behavior
  async analyzeWithSmartScheduling(request: SmartAIAnalysisRequest): Promise<SmartAIAnalysisResponse> {
    // CRITICAL: Preserve exact integration with SmartSchedulingService
    // Step 1: Check data freshness
    const freshnessCheck = await this.smartSchedulingService.getFreshnessStatus(request.projectId);
    
    // Step 2: Trigger scraping if needed
    if (request.forceFreshData || freshnessCheck.overallStatus !== 'FRESH') {
      const scrapingResult = await this.smartSchedulingService.checkAndTriggerScraping(request.projectId);
      // ... preserve exact logic
    }
    
    // Step 3: Generate enhanced analysis
    // ... preserve all SmartAIService functionality
  }
}
```

### 2.2 UXAnalyzer Sub-Service

**Purpose:** UX-focused competitive analysis (preserves UserExperienceAnalyzer functionality)

```typescript
export interface IUXAnalyzer {
  // Primary UX analysis method
  analyzeProductVsCompetitors(
    productData: ProductSnapshot & { product: { name: string; website: string } },
    competitorData: (Snapshot & { competitor: { name: string; website: string } })[],
    options?: UXAnalysisOptions
  ): Promise<UXAnalysisResult>;
  
  // Competitive UX analysis
  analyzeCompetitiveUX(product: any, competitors: any[], options?: any): Promise<any>;
  
  // Focused analysis by area
  generateFocusedAnalysis(
    productData: ProductSnapshot,
    competitorData: Snapshot[],
    focusArea: UXFocusArea
  ): Promise<UXAnalysisResult>;
  
  // Assessment methods
  assessDataQuality(competitorData: any[]): 'high' | 'medium' | 'low';
}

export class UXAnalyzer implements IUXAnalyzer {
  constructor(
    private bedrockService: BedrockService,
    private logger: Logger
  ) {}
  
  // Implementation preserves exact UserExperienceAnalyzer behavior
  async analyzeProductVsCompetitors(
    productData: ProductSnapshot & { product: { name: string; website: string } },
    competitorData: (Snapshot & { competitor: { name: string; website: string } })[],
    options: UXAnalysisOptions = {}
  ): Promise<UXAnalysisResult> {
    // Preserve null guards and validation logic
    // Preserve UX-specific prompt building
    // Preserve competitor limiting and performance optimization
    // ... exact UserExperienceAnalyzer implementation
  }
}
```

### 2.3 ComparativeAnalyzer Sub-Service

**Purpose:** Comprehensive comparative analysis (preserves ComparativeAnalysisService functionality)

```typescript
export interface IComparativeAnalyzer {
  // Primary comparative analysis
  analyzeProductVsCompetitors(input: ComparativeAnalysisInput): Promise<ComparativeAnalysis>;
  
  // Report generation
  generateAnalysisReport(analysis: ComparativeAnalysis): Promise<string>;
  
  // Configuration management
  updateAnalysisConfiguration(config: Partial<AnalysisConfiguration>): void;
  
  // Validation and quality assessment
  validateAnalysisInput(input: ComparativeAnalysisInput): void;
  assessDataQuality(input: ComparativeAnalysisInput): 'high' | 'medium' | 'low';
}

export class ComparativeAnalyzer implements IComparativeAnalyzer {
  constructor(
    private bedrockService: BedrockService,
    private dataIntegrityValidator: DataIntegrityValidator, // PRESERVE CRITICAL DEPENDENCY
    private logger: Logger,
    private configuration: AnalysisConfiguration
  ) {}
  
  // Implementation preserves exact ComparativeAnalysisService behavior
  async analyzeProductVsCompetitors(input: ComparativeAnalysisInput): Promise<ComparativeAnalysis> {
    // CRITICAL: Preserve exact validation logic with dataIntegrityValidator
    this.validateAnalysisInput(input);
    
    // Preserve exact analysis workflow:
    // Validate → Build Prompt → Execute AI → Parse Results → Structure Output
    // ... exact ComparativeAnalysisService implementation
  }
}
```

## 3. Shared Infrastructure Design

### 3.1 BedrockService Management

```typescript
export class BedrockServiceManager {
  private static instance: BedrockService | null = null;
  private static initializationPromise: Promise<BedrockService> | null = null;
  
  // Unified BedrockService initialization for all analyzers
  static async getSharedInstance(config?: Partial<BedrockConfig>): Promise<BedrockService> {
    if (this.instance) {
      return this.instance;
    }
    
    if (this.initializationPromise) {
      return await this.initializationPromise;
    }
    
    this.initializationPromise = this.initializeService(config);
    this.instance = await this.initializationPromise;
    this.initializationPromise = null;
    
    return this.instance;
  }
  
  private static async initializeService(config?: Partial<BedrockConfig>): Promise<BedrockService> {
    try {
      // Try stored credentials first (pattern from all three services)
      return await BedrockService.createWithStoredCredentials('anthropic', config);
    } catch (error) {
      logger.warn('Failed to initialize with stored credentials, falling back to environment variables');
      return new BedrockService(config || {}, 'anthropic');
    }
  }
}
```

### 3.2 Correlation Context Manager

```typescript
export class AnalysisCorrelationManager {
  private static correlationContext: Map<string, AnalysisContext> = new Map();
  
  static createContext(analysisType: string, projectId?: string): AnalysisContext {
    const correlationId = generateCorrelationId();
    const context: AnalysisContext = {
      correlationId,
      analysisType,
      projectId,
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
  
  static logWithCorrelation(level: string, message: string, correlationId: string, data?: any): void {
    const context = this.correlationContext.get(correlationId);
    logger[level](message, {
      correlationId,
      analysisType: context?.analysisType,
      projectId: context?.projectId,
      operationCount: context?.operations.length || 0,
      ...data
    });
  }
}
```

### 3.3 Error Handling Patterns

```typescript
export class AnalysisErrorHandler {
  // Unified error handling preserving patterns from all three services
  static handleAnalysisError(
    error: Error, 
    context: AnalysisContext, 
    operation: string
  ): AnalysisError {
    const correlationId = context.correlationId;
    
    // AWS-specific error classification (from ComparativeAnalysisService)
    if (this.isAWSCredentialError(error)) {
      const analysisError = new AnalysisError(
        'AWS credentials are invalid or expired. Please refresh your credentials.',
        'AWS_CREDENTIALS_ERROR',
        { originalError: error, correlationId, userFriendly: true }
      );
      AnalysisCorrelationManager.logWithCorrelation('error', 'AWS credentials error', correlationId, { operation });
      return analysisError;
    }
    
    if (this.isAWSRateLimitError(error)) {
      const analysisError = new AnalysisError(
        'AWS rate limit exceeded. Please wait before trying again.',
        'AWS_RATE_LIMIT_ERROR',
        { originalError: error, correlationId, userFriendly: true }
      );
      AnalysisCorrelationManager.logWithCorrelation('error', 'AWS rate limit exceeded', correlationId, { operation });
      return analysisError;
    }
    
    // Data validation errors (from ComparativeAnalysisService)
    if (error instanceof InsufficientDataError) {
      AnalysisCorrelationManager.logWithCorrelation('error', 'Insufficient data for analysis', correlationId, { operation });
      return new AnalysisError(error.message, 'INSUFFICIENT_DATA', { originalError: error, correlationId });
    }
    
    // Generic analysis error
    AnalysisCorrelationManager.logWithCorrelation('error', 'Analysis operation failed', correlationId, { 
      operation, 
      errorMessage: error.message 
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
}

export class AnalysisError extends Error {
  constructor(
    message: string,
    public code: AnalysisErrorCode,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = 'AnalysisError';
  }
}

export type AnalysisErrorCode = 
  | 'AWS_CREDENTIALS_ERROR'
  | 'AWS_RATE_LIMIT_ERROR' 
  | 'AWS_QUOTA_ERROR'
  | 'AWS_CONNECTION_ERROR'
  | 'INSUFFICIENT_DATA'
  | 'ANALYSIS_ERROR'
  | 'VALIDATION_ERROR';
```

## 4. Main AnalysisService Implementation

### 4.1 Core Service Class

```typescript
export class AnalysisService implements IAnalysisService {
  // Sub-analyzers
  private aiAnalyzer: AIAnalyzer;
  private uxAnalyzer: UXAnalyzer;
  private comparativeAnalyzer: ComparativeAnalyzer;
  
  // Shared infrastructure
  private bedrockService: BedrockService;
  private smartSchedulingService: SmartSchedulingService; // CRITICAL DEPENDENCY
  private logger: Logger;
  private configuration: UnifiedAnalysisConfiguration;
  
  constructor() {
    // Initialize shared infrastructure
    this.logger = logger;
    this.smartSchedulingService = new SmartSchedulingService(); // PRESERVE CRITICAL DEPENDENCY
    
    // Configuration with defaults
    this.configuration = this.getDefaultConfiguration();
  }
  
  // Lazy initialization of BedrockService and sub-analyzers
  private async ensureInitialized(): Promise<void> {
    if (!this.bedrockService) {
      this.bedrockService = await BedrockServiceManager.getSharedInstance(this.configuration.aiConfig);
      
      // Initialize sub-analyzers with shared dependencies
      this.aiAnalyzer = new AIAnalyzer(
        this.smartSchedulingService, // CRITICAL
        this.bedrockService,
        new ConversationManager(),
        this.logger
      );
      
      this.uxAnalyzer = new UXAnalyzer(
        this.bedrockService,
        this.logger
      );
      
      this.comparativeAnalyzer = new ComparativeAnalyzer(
        this.bedrockService,
        dataIntegrityValidator, // PRESERVE CRITICAL DEPENDENCY
        this.logger,
        this.mapToLegacyConfig(this.configuration)
      );
    }
  }
  
  // Primary unified analysis method
  async analyzeProduct(request: UnifiedAnalysisRequest): Promise<UnifiedAnalysisResponse> {
    await this.ensureInitialized();
    
    const context = AnalysisCorrelationManager.createContext(request.analysisType, request.projectId);
    
    try {
      AnalysisCorrelationManager.logWithCorrelation('info', 'Unified analysis started', context.correlationId, {
        analysisType: request.analysisType,
        projectId: request.projectId
      });
      
      // Route to appropriate sub-analyzer based on analysis type
      switch (request.analysisType) {
        case 'ai_comprehensive':
          return await this.handleAIComprehensiveAnalysis(request, context);
        case 'ux_comparison':
          return await this.handleUXComparisonAnalysis(request, context);
        case 'comparative_analysis':
          return await this.handleComparativeAnalysis(request, context);
        case 'smart_scheduling':
          return await this.handleSmartSchedulingAnalysis(request, context);
        default:
          throw new AnalysisError(`Unsupported analysis type: ${request.analysisType}`, 'VALIDATION_ERROR');
      }
      
    } catch (error) {
      const analysisError = AnalysisErrorHandler.handleAnalysisError(error as Error, context, 'analyzeProduct');
      throw analysisError;
    }
  }
  
  // Backward compatibility methods (preserve exact signatures)
  async analyzeProductVsCompetitors(input: ComparativeAnalysisInput): Promise<ComparativeAnalysis> {
    await this.ensureInitialized();
    // Delegate to ComparativeAnalyzer with exact preserved behavior
    return await this.comparativeAnalyzer.analyzeProductVsCompetitors(input);
  }
  
  async analyzeWithSmartScheduling(request: SmartAIAnalysisRequest): Promise<SmartAIAnalysisResponse> {
    await this.ensureInitialized();
    // Delegate to AIAnalyzer with exact preserved behavior
    return await this.aiAnalyzer.analyzeWithSmartScheduling(request);
  }
  
  async analyzeProductUX(request: UXAnalysisRequest): Promise<UXAnalysisResult> {
    await this.ensureInitialized();
    // Delegate to UXAnalyzer
    return await this.uxAnalyzer.analyzeProductVsCompetitors(
      request.productData,
      request.competitorData,
      request.options
    );
  }
}
```

### 4.2 Analysis Type Handlers

```typescript
// Private methods for handling different analysis types
private async handleAIComprehensiveAnalysis(
  request: UnifiedAnalysisRequest, 
  context: AnalysisContext
): Promise<UnifiedAnalysisResponse> {
  const smartRequest: SmartAIAnalysisRequest = {
    projectId: request.projectId,
    forceFreshData: request.forceFreshData,
    analysisType: 'comprehensive',
    dataCutoff: request.dataCutoff,
    context: request.context
  };
  
  const smartResult = await this.aiAnalyzer.analyzeWithSmartScheduling(smartRequest);
  
  return {
    analysisId: createId(),
    correlationId: context.correlationId,
    analysisType: request.analysisType,
    summary: this.extractSummaryFromSmartAnalysis(smartResult),
    metadata: this.createUnifiedMetadata(smartResult.analysisMetadata, context),
    quality: this.assessAnalysisQuality(smartResult),
    smartAnalysis: smartResult
  };
}

private async handleComparativeAnalysis(
  request: UnifiedAnalysisRequest,
  context: AnalysisContext
): Promise<UnifiedAnalysisResponse> {
  // Convert unified request to ComparativeAnalysisInput
  const comparativeInput = this.convertToComparativeInput(request);
  const comparativeResult = await this.comparativeAnalyzer.analyzeProductVsCompetitors(comparativeInput);
  
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

private async handleUXComparisonAnalysis(
  request: UnifiedAnalysisRequest,
  context: AnalysisContext
): Promise<UnifiedAnalysisResponse> {
  const uxRequest = this.convertToUXRequest(request);
  const uxResult = await this.uxAnalyzer.analyzeProductVsCompetitors(
    uxRequest.productData,
    uxRequest.competitorData,
    uxRequest.options
  );
  
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
```

## 5. Critical Functionality Preservation

### 5.1 Smart Scheduling Integration (CRITICAL)

```typescript
// CRITICAL: Preserve exact SmartSchedulingService integration
export class AIAnalyzer implements IAIAnalyzer {
  // This method MUST preserve the exact logic from SmartAIService
  async analyzeWithSmartScheduling(request: SmartAIAnalysisRequest): Promise<SmartAIAnalysisResponse> {
    const correlationId = generateCorrelationId();
    const context = { projectId: request.projectId, correlationId, operation: 'smartAIAnalysis' };

    try {
      // Step 1: Check data freshness using smart scheduling - PRESERVE EXACTLY
      const freshnessCheck = await this.smartSchedulingService.getFreshnessStatus(request.projectId);
      let scrapingTriggered = false;

      // Step 2: Trigger scraping if needed for fresh data guarantee - PRESERVE EXACTLY
      if (request.forceFreshData || freshnessCheck.overallStatus !== 'FRESH') {
        const scrapingResult = await this.smartSchedulingService.checkAndTriggerScraping(request.projectId);
        scrapingTriggered = scrapingResult.triggered;

        if (scrapingResult.triggered) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          const updatedFreshness = await this.smartSchedulingService.getFreshnessStatus(request.projectId);
          // ... preserve exact logic
        }
      }

      // Step 3: Get final freshness status for analysis - PRESERVE EXACTLY
      const finalFreshness = await this.smartSchedulingService.getFreshnessStatus(request.projectId);

      // Step 4: Generate enhanced AI analysis - PRESERVE EXACTLY
      const analysis = await this.generateEnhancedAnalysis(request, finalFreshness, correlationId);

      // Return response with preserved structure
      return {
        analysis,
        dataFreshness: finalFreshness,
        analysisMetadata: {
          correlationId,
          analysisType: request.analysisType,
          dataFreshGuaranteed: finalFreshness.overallStatus === 'FRESH',
          scrapingTriggered,
          analysisTimestamp: new Date(),
          contextUsed: request.context || {}
        },
        recommendations: this.extractRecommendations(analysis)
      };

    } catch (error) {
      // Preserve exact error handling from SmartAIService
      throw error;
    }
  }
}
```

### 5.2 Data Validation Preservation (CRITICAL)

```typescript
// CRITICAL: Preserve exact validation logic from ComparativeAnalysisService
export class ComparativeAnalyzer implements IComparativeAnalyzer {
  validateAnalysisInput(input: ComparativeAnalysisInput): void {
    // PRESERVE: Use data integrity validator for comprehensive validation
    const validationResult = this.dataIntegrityValidator.validateAnalysisInput(input);
    if (!validationResult.valid) {
      throw new InsufficientDataError(
        `Analysis input validation failed: ${validationResult.errors.join(', ')}`,
        { validationErrors: validationResult.errors }
      );
    }

    // PRESERVE: Additional business logic validation
    if (!input.product?.id || !input.product?.name) {
      throw new InsufficientDataError('Product information is incomplete', {
        missing: ['product.id', 'product.name']
      });
    }

    if (!input.productSnapshot?.content) {
      throw new InsufficientDataError('Product snapshot content is missing');
    }

    // PRESERVE: Relaxed validation logic
    const validCompetitors = input.competitors.filter(
      c => c.competitor?.id && c.competitor?.name
    );

    if (validCompetitors.length === 0) {
      throw new InsufficientDataError('No valid competitor data found');
    }

    // PRESERVE: Content length validation with relaxed thresholds
    const productContentLength = this.getContentLength(input.productSnapshot);
    if (productContentLength < 10) { // Preserved relaxed threshold
      throw new InsufficientDataError('Product content is too short for meaningful analysis');
    }
  }
}
```

### 5.3 Error Handling Preservation

```typescript
// Preserve exact error classification from ComparativeAnalysisService
export class AnalysisErrorHandler {
  static classifyAndHandleError(error: Error, correlationId: string): AnalysisError {
    const errorMessage = error.message.toLowerCase();
    
    // PRESERVE: AWS-specific error detection from ComparativeAnalysisService
    if (errorMessage.includes('credential') || errorMessage.includes('unauthorized')) {
      return new AnalysisError(
        'AWS credentials are invalid or expired. Please refresh your credentials.',
        'AWS_CREDENTIALS_ERROR',
        { originalError: error, correlationId, userFriendly: true }
      );
    }
    
    if (errorMessage.includes('rate limit') || errorMessage.includes('throttle')) {
      return new AnalysisError(
        'AWS rate limit exceeded. Please wait a few minutes before trying again.',
        'AWS_RATE_LIMIT_ERROR',
        { originalError: error, correlationId, userFriendly: true }
      );
    }
    
    // ... preserve all error classification patterns
  }
}
```

## 6. Implementation Guidelines

### 6.1 Migration Strategy

1. **Phase 1: Create Infrastructure**
   - Implement BedrockServiceManager
   - Implement AnalysisCorrelationManager  
   - Implement AnalysisErrorHandler
   - Create unified type definitions

2. **Phase 2: Implement Sub-Analyzers**
   - Implement AIAnalyzer (preserve SmartAIService exactly)
   - Implement UXAnalyzer (preserve UserExperienceAnalyzer exactly)
   - Implement ComparativeAnalyzer (preserve ComparativeAnalysisService exactly)

3. **Phase 3: Implement Unified Service**
   - Create main AnalysisService class
   - Implement unified interface methods
   - Add backward compatibility methods

4. **Phase 4: Integration and Testing**
   - Comprehensive integration testing
   - Validate all critical data flows
   - Performance testing with shared BedrockService

### 6.2 Quality Assurance Requirements

1. **Critical Flow Testing**
   - Smart Scheduling integration must work identically
   - Data validation must preserve exact behavior
   - Error handling must maintain user experience
   - All existing method signatures must work

2. **Performance Validation**
   - Shared BedrockService should not degrade performance
   - Memory usage should be optimized
   - Response times should meet current benchmarks

3. **Backward Compatibility**
   - All existing consumers must work without changes
   - Feature flags for gradual rollout
   - Rollback capability to original services

### 6.3 Success Criteria

- ✅ All three analysis types work identically to original services
- ✅ Smart Scheduling integration preserves exact data flow
- ✅ Error handling maintains user-friendly messages
- ✅ Performance meets or exceeds current benchmarks
- ✅ Memory usage optimized through shared infrastructure
- ✅ Backward compatibility for all existing consumers

## 7. Conclusion

The unified AnalysisService design successfully consolidates three complex analysis services while preserving all critical functionality. The modular sub-service architecture ensures clear separation of concerns while shared infrastructure eliminates redundancy.

**Key Design Achievements:**
- **Preserved Critical Dependencies**: Smart Scheduling and data validation exactly as is
- **Unified Interface**: Clean API for new consumers while maintaining backward compatibility
- **Optimized Infrastructure**: Shared BedrockService and correlation management
- **Error Handling**: Consistent patterns with user-friendly messages
- **Modular Architecture**: Clear separation between AI, UX, and Comparative analysis

**Next Steps:** Proceed to Task 2.1 - Implement Core AnalysisService Class based on this design. 