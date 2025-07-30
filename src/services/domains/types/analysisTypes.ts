/**
 * Analysis Domain Types - Unified Type System
 * Consolidates types from ComparativeAnalysisService, UserExperienceAnalyzer, and SmartAIService
 * 
 * Task 1.3: Create Analysis Domain Types
 * - Consolidate all analysis-related TypeScript interfaces from existing services
 * - Create unified AnalysisRequest, AnalysisResponse, AnalysisConfig types
 * - Ensure type compatibility with existing consumers
 */

import { ProductSnapshot } from '@/types/product';
import { Competitor, CompetitorSnapshot } from '@/types/analysis';

// ============================================================================
// CORE UNIFIED TYPES
// ============================================================================

/**
 * Unified Analysis Request - Primary interface for all analysis operations
 */
export interface AnalysisRequest {
  // Analysis identification
  analysisId?: string;
  correlationId?: string;
  
  // Analysis type routing
  analysisType: AnalysisType;
  
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
  priority?: AnalysisPriority;
  timeout?: number;
}

/**
 * Unified Analysis Response - Primary interface for all analysis results
 */
export interface AnalysisResponse {
  // Analysis identification
  analysisId: string;
  correlationId: string;
  analysisType: AnalysisType;
  
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

/**
 * Unified Analysis Configuration - Consolidated configuration for all analyzers
 */
export interface AnalysisConfig {
  // AI Configuration
  aiConfig: AIConfiguration;
  
  // Analysis focus areas and depth
  focusAreas: AnalysisFocusArea[];
  analysisDepth: AnalysisDepth;
  
  // Feature flags for different analyzers
  enabledAnalyzers: EnabledAnalyzers;
  
  // Performance and quality settings
  performance: PerformanceConfig;
  
  // Error handling and retry configuration
  errorHandling: ErrorHandlingConfig;
  
  // UX-specific configuration
  uxConfig?: UXAnalysisConfiguration;
  
  // Smart AI configuration
  smartConfig?: SmartAIConfiguration;
}

// ============================================================================
// ANALYSIS TYPES AND ENUMS
// ============================================================================

export type AnalysisType = 
  | 'ai_comprehensive'
  | 'ux_comparison'
  | 'comparative_analysis'
  | 'smart_scheduling';

export type AnalysisPriority = 'high' | 'normal' | 'low';

export type AnalysisDepth = 'basic' | 'detailed' | 'comprehensive';

export type AnalysisFocusArea = 
  | 'features'
  | 'positioning'
  | 'pricing'
  | 'user_experience'
  | 'customer_targeting'
  | 'content_strategy'
  | 'technical_stack'
  | 'performance'
  | 'accessibility'
  | 'mobile'
  | 'navigation';

export type DataQuality = 'high' | 'medium' | 'low';

export type AnalysisQualityTier = 'excellent' | 'good' | 'fair' | 'poor';

// ============================================================================
// CONFIGURATION TYPES
// ============================================================================

export interface AIConfiguration {
  provider: 'bedrock' | 'openai' | 'anthropic';
  model: string;
  maxTokens: number;
  temperature: number;
  retryAttempts?: number;
}

export interface EnabledAnalyzers {
  aiAnalyzer: boolean;
  uxAnalyzer: boolean;
  comparativeAnalyzer: boolean;
}

export interface PerformanceConfig {
  maxCompetitors: number;
  qualityThreshold: number;
  timeoutMs: number;
  enableCaching?: boolean;
}

export interface ErrorHandlingConfig {
  maxRetries: number;
  backoffMs: number;
  enableFallback: boolean;
  logErrors: boolean;
}

export interface UXAnalysisConfiguration {
  focus?: 'mobile' | 'desktop' | 'both';
  includeTechnical?: boolean;
  includeAccessibility?: boolean;
  maxCompetitors?: number;
  confidenceThreshold?: number;
}

export interface SmartAIConfiguration {
  enableAutoAnalysis?: boolean;
  dataCutoffDays?: number;
  freshnessThresholdHours?: number;
  autoTriggerScraping?: boolean;
}

// ============================================================================
// DATA INPUT TYPES
// ============================================================================

export interface ProductAnalysisData {
  id: string;
  name: string;
  website: string;
  positioning?: string;
  customerData?: string;
  userProblem?: string;
  industry?: string;
  snapshot?: ProductSnapshot;
}

export interface CompetitorAnalysisData {
  competitor: {
    id: string;
    name: string;
    website: string;
    description?: string;
    industry?: string;
    employeeCount?: number;
    revenue?: number;
    founded?: number;
    headquarters?: string;
  };
  snapshot?: CompetitorSnapshot;
}

export interface AnalysisOptions {
  // General options
  includeRecommendations?: boolean;
  includeMetrics?: boolean;
  generateReport?: boolean;
  
  // UX-specific options
  uxOptions?: UXAnalysisOptions;
  
  // Comparative analysis options
  comparativeOptions?: ComparativeAnalysisOptions;
  
  // Smart AI options
  smartOptions?: SmartAnalysisOptions;
}

// ============================================================================
// ANALYSIS RESULT TYPES
// ============================================================================

export interface AnalysisSummary {
  overallPosition: 'leading' | 'competitive' | 'trailing';
  keyStrengths: string[];
  keyWeaknesses: string[];
  opportunityScore: number; // 0-100
  threatLevel: 'low' | 'medium' | 'high';
  confidenceScore: number; // 0-100
}

export interface DetailedAnalysisResult {
  featureComparison?: FeatureComparison;
  positioningAnalysis?: PositioningAnalysis;
  userExperienceComparison?: UserExperienceComparison;
  customerTargeting?: CustomerTargetingAnalysis;
  technicalAnalysis?: TechnicalAnalysis;
  marketAnalysis?: MarketAnalysis;
}

export interface RecommendationSet {
  immediate: string[];
  shortTerm: string[];
  longTerm: string[];
  priorityScore: number; // 0-100
}

export interface AnalysisMetadata {
  analysisMethod: 'ai_powered' | 'rule_based' | 'hybrid';
  modelUsed?: string;
  confidenceScore: number; // 0-100
  processingTime: number; // milliseconds
  dataQuality: DataQuality;
  correlationId: string;
  analysisTimestamp: Date;
  dataFreshGuaranteed?: boolean;
  scrapingTriggered?: boolean;
  contextUsed?: Record<string, any>;
}

export interface AnalysisQuality {
  overallScore: number; // 0-100
  qualityTier: AnalysisQualityTier;
  dataCompleteness: number; // 0-100
  dataFreshness: number; // 0-100
  analysisConfidence: number; // 0-100
  improvementPotential: number; // 0-100
  quickWinsAvailable: number; // Count of actionable recommendations
}

// ============================================================================
// COMPARATIVE ANALYSIS TYPES (From ComparativeAnalysisService)
// ============================================================================

export interface ComparativeAnalysisInput {
  product: {
    id: string;
    name: string;
    website: string;
    positioning: string;
    customerData: string;
    userProblem: string;
    industry: string;
  };
  productSnapshot: ProductSnapshot;
  competitors: Array<{
    competitor: Competitor;
    snapshot: CompetitorSnapshot;
  }>;
  analysisConfig?: {
    focusAreas?: AnalysisFocusArea[];
    depth?: AnalysisDepth;
    includeRecommendations?: boolean;
  };
}

export interface ComparativeAnalysis {
  id: string;
  projectId: string;
  productId: string;
  competitorIds: string[];
  analysisDate: Date;
  summary: {
    overallPosition: 'leading' | 'competitive' | 'trailing';
    keyStrengths: string[];
    keyWeaknesses: string[];
    opportunityScore: number; // 0-100
    threatLevel: 'low' | 'medium' | 'high';
  };
  detailed: {
    featureComparison: FeatureComparison;
    positioningAnalysis: PositioningAnalysis;
    userExperienceComparison: UserExperienceComparison;
    customerTargeting: CustomerTargetingAnalysis;
  };
  recommendations: {
    immediate: string[];
    shortTerm: string[];
    longTerm: string[];
    priorityScore: number; // 0-100
  };
  metadata: {
    analysisMethod: 'ai_powered' | 'rule_based' | 'hybrid';
    modelUsed?: string;
    confidenceScore: number; // 0-100
    processingTime: number; // milliseconds
    dataQuality: DataQuality;
  };
}

export interface ComparativeAnalysisOptions {
  focusAreas?: AnalysisFocusArea[];
  depth?: AnalysisDepth;
  includeRecommendations?: boolean;
  includeMetrics?: boolean;
}

// ============================================================================
// UX ANALYSIS TYPES (From UserExperienceAnalyzer)
// ============================================================================

export interface UXAnalysisOptions {
  focus?: 'mobile' | 'desktop' | 'both';
  includeTechnical?: boolean;
  includeAccessibility?: boolean;
  maxCompetitors?: number;
}

export interface UXAnalysisResult {
  summary: string;
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  recommendations: string[];
  competitorComparisons: CompetitorComparison[];
  confidence: number;
  metadata: {
    correlationId: string;
    analyzedAt: string;
    competitorCount: number;
    analysisType: 'ux_focused';
    dataQuality?: DataQuality;
    processingTime?: number;
    analysisVersion?: string;
    fallbackMode?: boolean;
  };
}

export interface CompetitorComparison {
  competitorName: string;
  competitorWebsite: string;
  strengths: string[];
  weaknesses: string[];
  keyDifferences: string[];
  learnings: string[];
}

export interface UXAnalysisRequest {
  productData: ProductSnapshot & { product: { name: string; website: string } };
  competitorData: (CompetitorSnapshot & { competitor: { name: string; website: string } })[];
  options?: UXAnalysisOptions;
}

export type UXFocusArea = 'navigation' | 'mobile' | 'conversion' | 'content' | 'accessibility';

// ============================================================================
// SMART AI ANALYSIS TYPES (From SmartAIService)
// ============================================================================

export interface SmartAIAnalysisRequest {
  projectId: string;
  forceFreshData?: boolean;
  analysisType: 'competitive' | 'trend' | 'comprehensive';
  dataCutoff?: Date;
  context?: Record<string, any>;
}

export interface SmartAIAnalysisResponse {
  analysis: string;
  dataFreshness: ProjectFreshnessStatus;
  analysisMetadata: {
    correlationId: string;
    analysisType: string;
    dataFreshGuaranteed: boolean;
    scrapingTriggered: boolean;
    analysisTimestamp: Date;
    contextUsed: Record<string, any>;
  };
  recommendations?: {
    immediate: string[];
    longTerm: string[];
  };
}

export interface SmartAISetupConfig {
  frequency: 'daily' | 'weekly' | 'monthly';
  analysisTypes: ('competitive' | 'trend' | 'comprehensive')[];
  autoTrigger: boolean;
  dataCutoffDays?: number;
}

export interface SmartAnalysisOptions {
  forceFreshData?: boolean;
  dataCutoff?: Date;
  enableAutoTrigger?: boolean;
  freshnessThreshold?: number;
}

export interface ProjectFreshnessStatus {
  overallStatus: 'FRESH' | 'STALE' | 'MISSING';
  products: Array<{
    id: string;
    name: string;
    needsScraping: boolean;
    lastSnapshot?: Date;
    daysSinceLastSnapshot?: number;
  }>;
  competitors: Array<{
    id: string;
    name: string;
    needsScraping: boolean;
    lastSnapshot?: Date;
    daysSinceLastSnapshot?: number;
  }>;
  recommendedActions: string[];
}

export interface DataFreshnessStatus {
  status: 'FRESH' | 'STALE' | 'MISSING';
  lastUpdated?: Date;
  daysSinceUpdate?: number;
  recommendRefresh: boolean;
}

// ============================================================================
// DETAILED ANALYSIS COMPONENT TYPES
// ============================================================================

export interface FeatureComparison {
  productFeatures: string[];
  competitorFeatures: Array<{
    competitorId: string;
    competitorName: string;
    features: string[];
  }>;
  uniqueToProduct: string[];
  uniqueToCompetitors: string[];
  commonFeatures: string[];
  featureGaps: string[];
  innovationScore: number; // 0-100
}

export interface PositioningAnalysis {
  productPositioning: {
    primaryMessage: string;
    valueProposition: string;
    targetAudience: string;
    differentiators: string[];
  };
  competitorPositioning: Array<{
    competitorId: string;
    competitorName: string;
    primaryMessage: string;
    valueProposition: string;
    targetAudience: string;
    differentiators: string[];
  }>;
  positioningGaps: string[];
  marketOpportunities: string[];
  messagingEffectiveness: number; // 0-100
}

export interface UserExperienceComparison {
  productUX: {
    designQuality: number; // 0-100
    usabilityScore: number; // 0-100
    navigationStructure: string;
    keyUserFlows: string[];
    loadTime?: number;
  };
  competitorUX: Array<{
    competitorId: string;
    competitorName: string;
    designQuality: number;
    usabilityScore: number;
    navigationStructure: string;
    keyUserFlows: string[];
    loadTime?: number;
  }>;
  uxStrengths: string[];
  uxWeaknesses: string[];
  uxRecommendations: string[];
}

export interface CustomerTargetingAnalysis {
  productTargeting: {
    primarySegments: string[];
    customerTypes: string[];
    useCases: string[];
  };
  competitorTargeting: Array<{
    competitorId: string;
    competitorName: string;
    primarySegments: string[];
    customerTypes: string[];
    useCases: string[];
  }>;
  targetingOverlap: string[];
  untappedSegments: string[];
  competitiveAdvantage: string[];
}

export interface TechnicalAnalysis {
  productTech: {
    techStack: string[];
    performance: {
      loadTime: number;
      mobileOptimization: number; // 0-100
      accessibility: number; // 0-100
    };
    features: string[];
  };
  competitorTech: Array<{
    competitorId: string;
    competitorName: string;
    techStack: string[];
    performance: {
      loadTime: number;
      mobileOptimization: number;
      accessibility: number;
    };
    features: string[];
  }>;
  technicalAdvantages: string[];
  technicalGaps: string[];
}

export interface MarketAnalysis {
  marketSize: string;
  marketTrends: string[];
  competitiveIntensity: 'low' | 'medium' | 'high';
  marketOpportunities: string[];
  threatAssessment: string[];
  marketPosition: 'leader' | 'challenger' | 'follower' | 'niche';
}

// ============================================================================
// ERROR TYPES
// ============================================================================

export type AnalysisErrorCode = 
  | 'AWS_CREDENTIALS_ERROR'
  | 'AWS_RATE_LIMIT_ERROR' 
  | 'AWS_QUOTA_ERROR'
  | 'AWS_CONNECTION_ERROR'
  | 'AWS_REGION_ERROR'
  | 'INSUFFICIENT_DATA'
  | 'ANALYSIS_ERROR'
  | 'VALIDATION_ERROR'
  | 'TIMEOUT_ERROR'
  | 'AI_SERVICE_ERROR';

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

export class InsufficientDataError extends AnalysisError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'INSUFFICIENT_DATA', details);
    this.name = 'InsufficientDataError';
  }
}

export class AIServiceError extends AnalysisError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'AI_SERVICE_ERROR', details);
    this.name = 'AIServiceError';
  }
}

// ============================================================================
// ANALYSIS CONTEXT AND CORRELATION TYPES
// ============================================================================

export interface AnalysisContext {
  correlationId: string;
  analysisType: string;
  projectId?: string;
  startTime: number;
  operations: AnalysisOperation[];
}

export interface AnalysisOperation {
  operation: string;
  timestamp: number;
  metadata?: any;
}

// ============================================================================
// SERVICE HEALTH AND MONITORING TYPES
// ============================================================================

export interface AnalysisServiceHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  services: {
    aiAnalyzer: ServiceHealthStatus;
    uxAnalyzer: ServiceHealthStatus;
    comparativeAnalyzer: ServiceHealthStatus;
    bedrockService: ServiceHealthStatus;
    smartSchedulingService: ServiceHealthStatus;
  };
  metrics: {
    totalAnalyses: number;
    successRate: number; // 0-100
    averageResponseTime: number; // milliseconds
    memoryUsage: number; // MB
  };
  lastHealthCheck: Date;
}

export interface ServiceHealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTime?: number;
  errorRate?: number;
  lastError?: string;
}

// ============================================================================
// ANALYSIS HISTORY TYPES
// ============================================================================

export interface AnalysisHistoryEntry {
  analysisId: string;
  projectId: string;
  analysisType: AnalysisType;
  createdAt: Date;
  status: 'completed' | 'failed' | 'in_progress';
  summary?: string;
  confidenceScore?: number;
  processingTime?: number;
  dataQuality?: DataQuality;
}

// ============================================================================
// LEGACY COMPATIBILITY TYPES
// ============================================================================

/**
 * Legacy type aliases for backward compatibility
 */
export type ComparativeAnalysisService = any; // Interface from original service
export type AnalysisConfiguration = AnalysisConfig; // Alias for unified config

// ============================================================================
// TYPE GUARDS AND VALIDATION UTILITIES
// ============================================================================

export function isAnalysisType(value: string): value is AnalysisType {
  return ['ai_comprehensive', 'ux_comparison', 'comparative_analysis', 'smart_scheduling'].includes(value);
}

export function isAnalysisPriority(value: string): value is AnalysisPriority {
  return ['high', 'normal', 'low'].includes(value);
}

export function isDataQuality(value: string): value is DataQuality {
  return ['high', 'medium', 'low'].includes(value);
}

export function validateAnalysisRequest(request: AnalysisRequest): boolean {
  return !!(
    request.analysisType &&
    isAnalysisType(request.analysisType) &&
    request.projectId &&
    request.projectId.length > 0
  );
}

// ============================================================================
// DEFAULT CONFIGURATIONS
// ============================================================================

export const DEFAULT_ANALYSIS_CONFIG: AnalysisConfig = {
  aiConfig: {
    provider: 'bedrock',
    model: 'anthropic.claude-3-sonnet-20240229-v1:0',
    maxTokens: 8000,
    temperature: 0.3,
    retryAttempts: 3
  },
  focusAreas: ['features', 'positioning', 'user_experience', 'customer_targeting'],
  analysisDepth: 'detailed',
  enabledAnalyzers: {
    aiAnalyzer: true,
    uxAnalyzer: true,
    comparativeAnalyzer: true
  },
  performance: {
    maxCompetitors: 5,
    qualityThreshold: 70,
    timeoutMs: 300000, // 5 minutes
    enableCaching: true
  },
  errorHandling: {
    maxRetries: 3,
    backoffMs: 5000,
    enableFallback: true,
    logErrors: true
  },
  uxConfig: {
    focus: 'both',
    includeTechnical: true,
    includeAccessibility: true,
    maxCompetitors: 5,
    confidenceThreshold: 70
  },
  smartConfig: {
    enableAutoAnalysis: false,
    dataCutoffDays: 7,
    freshnessThresholdHours: 24,
    autoTriggerScraping: true
  }
};

export const DEFAULT_UX_ANALYSIS_OPTIONS: UXAnalysisOptions = {
  focus: 'both',
  includeTechnical: false,
  includeAccessibility: false,
  maxCompetitors: 5
};

export const DEFAULT_COMPARATIVE_ANALYSIS_OPTIONS: ComparativeAnalysisOptions = {
  focusAreas: ['features', 'positioning', 'user_experience', 'customer_targeting'],
  depth: 'detailed',
  includeRecommendations: true,
  includeMetrics: true
}; 