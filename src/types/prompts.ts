// CompAI Prompt Type Definitions

export interface CompAIPromptData {
  productName: string;
  productInfo: string;
  productWebsiteHTML: string;
  competitorHTMLFiles: string;
  lastAnalysisDate: string;
}

export interface CompAIPromptOptions {
  maxHTMLLength?: number;      // Maximum HTML content length per section
  maxCompetitors?: number;     // Maximum number of competitors to include
  includeMetadata?: boolean;   // Include technical metadata in output
  truncationStrategy?: 'intelligent' | 'simple'; // HTML truncation approach
}

export interface CompAIAnalysisResult {
  executiveSummary: string;
  competitorProfiles: CompetitorProfile[];
  comparativeAnalysis: ComparativeAnalysisSection;
  swotAnalysis: SWOTAnalysis;
  changesSinceLastAnalysis: string;
  strategicRecommendations: Recommendation[];
  conclusion: string;
  worksCited: string[];
}

export interface CompetitorProfile {
  name: string;
  productOfferings: string;
  businessModel: string;
  keyClaimsAndPositioning: string;
}

export interface ComparativeAnalysisSection {
  websiteCustomerExperience: string;
  keyClaimsAndCommunication: string;
  offersAndPromotions: string;
  pricingAndValueProposition: string;
  featureDifferencesAndGaps: string;
  addressingCustomerPainPoints: string;
}

export interface SWOTAnalysis {
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  threats: string[];
}

export interface Recommendation {
  title: string;
  justification: string;
  priority: 'high' | 'medium' | 'low';
  effort: 'low' | 'medium' | 'high';
  impact: 'low' | 'medium' | 'high';
}

// Legacy prompt compatibility types
export interface LegacyPromptOptions {
  analysisType: 'competitive' | 'trend' | 'comprehensive';
  focusArea?: string;
  template?: string;
  additionalContext?: Record<string, any>;
}

export interface PromptBuilderConfig {
  useCompAIFormat: boolean;
  fallbackToLegacy: boolean;
  contentLimits: {
    maxHTMLLength: number;
    maxCompetitors: number;
    maxPromptLength: number;
  };
  qualityThresholds: {
    minContentLength: number;
    minCompetitorCount: number;
  };
}

// Prompt builder result types
export interface PromptBuildResult {
  prompt: string;
  metadata: PromptMetadata;
  warnings: string[];
  truncated: boolean;
}

export interface PromptMetadata {
  buildTime: number;
  promptLength: number;
  productSnapshotAge: number | null;
  competitorsIncluded: number;
  contentTruncated: boolean;
  format: 'compai' | 'legacy';
  version: string;
}
