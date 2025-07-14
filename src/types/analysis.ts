import { ProductSnapshot } from './product';

// Competitor Snapshot type (based on Prisma Snapshot model)
export interface CompetitorSnapshot {
  id: string;
  competitorId: string;
  metadata: {
    url?: string;
    title?: string;
    description?: string;
    html?: string;
    text?: string;
    headers?: Record<string, string>;
    statusCode?: number;
    contentLength?: number;
    lastModified?: string;
    scrapingTimestamp?: Date;
    scrapingMethod?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

// Competitor entity type (based on Prisma Competitor model)
export interface Competitor {
  id: string;
  name: string;
  website: string;
  description?: string;
  industry: string;
  employeeCount?: number;
  revenue?: number;
  founded?: number;
  headquarters?: string;
  socialMedia?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

// Analysis input structure
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
    depth?: 'basic' | 'detailed' | 'comprehensive';
    includeRecommendations?: boolean;
  };
}

// Focus areas for analysis
export type AnalysisFocusArea = 
  | 'features'
  | 'positioning'
  | 'pricing'
  | 'user_experience'
  | 'customer_targeting'
  | 'content_strategy'
  | 'technical_stack'
  | 'performance';

// Comparative analysis result structure
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
    pricingStrategy?: PricingStrategyAnalysis;
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
    dataQuality: 'high' | 'medium' | 'low';
  };
}

// Detailed comparison interfaces
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

export interface PricingStrategyAnalysis {
  productPricing: {
    strategy: 'premium' | 'competitive' | 'value' | 'unknown';
    pricePoints: string[];
    pricingModel: string;
  };
  competitorPricing: Array<{
    competitorId: string;
    competitorName: string;
    strategy: 'premium' | 'competitive' | 'value' | 'unknown';
    pricePoints: string[];
    pricingModel: string;
  }>;
  pricePosition: 'highest' | 'above_average' | 'average' | 'below_average' | 'lowest';
  pricingOpportunities: string[];
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

// Analysis configuration
export interface AnalysisConfiguration {
  provider: 'bedrock' | 'openai' | 'anthropic';
  model: string;
  maxTokens: number;
  temperature: number;
  focusAreas: AnalysisFocusArea[];
  includeMetrics: boolean;
  includeRecommendations: boolean;
  analysisDepth: 'basic' | 'detailed' | 'comprehensive';
}

// Analysis errors
export class ComparativeAnalysisError extends Error {
  constructor(
    message: string,
    public code: 'INSUFFICIENT_DATA' | 'AI_SERVICE_ERROR' | 'INVALID_INPUT' | 'PROCESSING_ERROR',
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = 'ComparativeAnalysisError';
  }
}

export class InsufficientDataError extends ComparativeAnalysisError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'INSUFFICIENT_DATA', details);
    this.name = 'InsufficientDataError';
  }
}

export class AIServiceError extends ComparativeAnalysisError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'AI_SERVICE_ERROR', details);
    this.name = 'AIServiceError';
  }
}

// Analysis prompts
export interface AnalysisPromptTemplate {
  system: string;
  userTemplate: string;
  outputFormat: string;
  maxLength: number;
}

// Analysis service interface
export interface ComparativeAnalysisService {
  analyzeProductVsCompetitors(input: ComparativeAnalysisInput): Promise<ComparativeAnalysis>;
  generateAnalysisReport(analysis: ComparativeAnalysis): Promise<string>;
  getAnalysisHistory(projectId: string): Promise<ComparativeAnalysis[]>;
  updateAnalysisConfiguration(config: Partial<AnalysisConfiguration>): void;
}

export interface UXAnalysisResult {
  summary: string;
  recommendations: string[];
  confidence: number;
  detailed: {
    usability: Record<string, unknown>;
    accessibility: Record<string, unknown>;
    performance: Record<string, unknown>;
  };
}

export interface ReportGenerationResult {
  report: {
    id: string;
    sections: Array<{
      title?: string;
      content?: string;
      order?: number;
    }>;
    metadata: Record<string, unknown>;
  };
  generationTime: number;
}

export interface UXAnalysisOptions {
  focus?: 'usability' | 'accessibility' | 'performance' | 'both';
  includeTechnical?: boolean;
  includeAccessibility?: boolean;
} 