import { ComparativeAnalysis } from './analysis';
import { ReportGenerationFallbackInfo } from './bedrockHealth';

// Enhanced types for comparative reporting
export interface ComparativeReportMetadata {
  productName: string;
  productUrl: string;
  competitorCount: number;
  analysisDate: Date;
  reportGeneratedAt: Date;
  analysisId: string;
  analysisMethod: 'ai_powered' | 'rule_based' | 'hybrid';
  confidenceScore: number;
  dataQuality: 'high' | 'medium' | 'low';
  reportVersion: string;
  focusAreas: string[];
  analysisDepth: 'basic' | 'detailed' | 'comprehensive';
}

export interface ComparativeReportSection {
  id: string;
  title: string;
  content: string;
  type: 'executive_summary' | 'feature_comparison' | 'positioning_analysis' | 
        'ux_comparison' | 'customer_targeting' | 'recommendations' | 'appendix' |
        'analysis' | 'findings' | 'competitive_analysis';
  order: number;
  charts?: ReportChart[];
  tables?: ReportTable[];
}

export interface ReportChart {
  id: string;
  title: string;
  type: 'bar' | 'pie' | 'line' | 'scatter' | 'radar';
  data: any[];
  description?: string;
}

export interface ReportTable {
  id: string;
  title: string;
  headers: string[];
  rows: string[][];
  description?: string;
}

export interface ComparativeReport {
  id: string;
  title: string;
  description: string;
  projectId: string;
  productId: string;
  analysisId: string;
  metadata: ComparativeReportMetadata;
  sections: ComparativeReportSection[];
  executiveSummary: string;
  keyFindings: string[];
  strategicRecommendations: {
    immediate: string[];
    shortTerm: string[];
    longTerm: string[];
    priorityScore: number;
  };
  competitiveIntelligence: {
    marketPosition: string;
    keyThreats: string[];
    opportunities: string[];
    competitiveAdvantages: string[];
  };
  createdAt: Date;
  updatedAt: Date;
  status: 'draft' | 'completed' | 'archived';
  format: 'markdown' | 'html' | 'pdf';
  downloadUrl?: string;
}

export interface ComparativeReportTemplate {
  id: string;
  name: string;
  description: string;
  sectionTemplates: ComparativeReportSectionTemplate[];
  defaultFormat: 'markdown' | 'html' | 'pdf';
  focusAreas: string[];
  analysisDepth: 'basic' | 'detailed' | 'comprehensive';
}

export interface ComparativeReportSectionTemplate {
  type: ComparativeReportSection['type'];
  title: string;
  template: string;
  order: number;
  includeCharts: boolean;
  includeTables: boolean;
  requiredFields: string[];
}

export interface ReportGenerationOptions {
  template?: string;
  format?: 'markdown' | 'html' | 'pdf';
  includeCharts?: boolean;
  includeTables?: boolean;
  includeAppendix?: boolean;
  customSections?: string[];
  maxTokens?: number;
  temperature?: number;
}

export interface ReportGenerationResult {
  report: ComparativeReport;
  generationTime: number;
  tokensUsed: number;
  cost: number;
  warnings: string[];
  errors: string[];
  aiEnhancementInfo?: ReportGenerationFallbackInfo;
}

// Report template constants
export const REPORT_TEMPLATES = {
  COMPREHENSIVE: 'comprehensive',
  EXECUTIVE: 'executive',
  TECHNICAL: 'technical',
  STRATEGIC: 'strategic'
} as const;

export const REPORT_SECTIONS = {
  EXECUTIVE_SUMMARY: 'executive_summary',
  FEATURE_COMPARISON: 'feature_comparison',
  POSITIONING_ANALYSIS: 'positioning_analysis',
  UX_COMPARISON: 'ux_comparison',
  CUSTOMER_TARGETING: 'customer_targeting',
  RECOMMENDATIONS: 'recommendations',
  APPENDIX: 'appendix'
} as const;

export type ReportTemplate = typeof REPORT_TEMPLATES[keyof typeof REPORT_TEMPLATES];
export type ReportSectionType = typeof REPORT_SECTIONS[keyof typeof REPORT_SECTIONS];

// Error types for report generation
export class ComparativeReportError extends Error {
  constructor(
    message: string,
    public code: 'ANALYSIS_NOT_FOUND' | 'TEMPLATE_NOT_FOUND' | 'GENERATION_FAILED' | 'INVALID_CONFIG',
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = 'ComparativeReportError';
  }
}

export class ReportGenerationError extends ComparativeReportError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'GENERATION_FAILED', details);
    this.name = 'ReportGenerationError';
  }
}

export class AnalysisNotFoundError extends ComparativeReportError {
  constructor(analysisId: string) {
    super(`Analysis with ID ${analysisId} not found`, 'ANALYSIS_NOT_FOUND', { analysisId });
    this.name = 'AnalysisNotFoundError';
  }
}

export class TemplateNotFoundError extends ComparativeReportError {
  constructor(templateId: string) {
    super(`Template with ID ${templateId} not found`, 'TEMPLATE_NOT_FOUND', { templateId });
    this.name = 'TemplateNotFoundError';
  }
} 