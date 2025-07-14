// Service Integration Mocks for Cross-Service Validation

import { jest } from '@jest/globals';
import { ComparativeAnalysisService } from '@/services/analysis/comparativeAnalysisService';
import { ComparativeReportService } from '@/services/reports/comparativeReportService';
import { UserExperienceAnalyzer } from '@/services/analysis/userExperienceAnalyzer';
import type { ComparativeAnalysis, UXAnalysisResult, ReportGenerationResult } from '@/types/analysis';
import type { AnalysisConfiguration, UXAnalysisOptions } from '@/types/analysis';

export const createMockAnalysisService = () => ({
  analyzeProductVsCompetitors: jest.fn().mockResolvedValue({
    id: 'mock-analysis-id',
    summary: { key: 'value' },
    detailed: {
      featureComparison: {},
      positioningAnalysis: {},
      userExperienceComparison: {},
      customerTargeting: {}
    },
    recommendations: {
      immediate: [],
      shortTerm: [],
      longTerm: []
    },
    metadata: {
      correlationId: 'mock-correlation-id',
      timestamp: new Date().toISOString()
    }
  }),
  generateAnalysisReport: jest.fn().mockResolvedValue({
    id: 'mock-report-id',
    content: 'Mock report content'
  }),
  getAnalysisHistory: jest.fn().mockResolvedValue([]),
  updateAnalysisConfiguration: jest.fn().mockImplementation(async (config: Partial<AnalysisConfiguration>) => {
    // Implementation
  })
}) as unknown as jest.Mocked<ComparativeAnalysisService>;

export const createMockReportService = () => ({
  generateUXEnhancedReport: jest.fn().mockResolvedValue({
    report: {
      id: 'mock-report-id',
      sections: [],
      metadata: {}
    },
    generationTime: 1000
  }),
  generateComparativeReport: jest.fn().mockResolvedValue({
    report: {
      id: 'mock-report-id',
      sections: [],
      metadata: {}
    },
    generationTime: 1000
  }),
  generateEnhancedReportContent: jest.fn().mockResolvedValue({
    content: 'Enhanced mock content',
    metadata: {}
  }),
  getAvailableTemplates: jest.fn().mockResolvedValue(['default', 'enhanced']),
  validateAnalysisForReporting: jest.fn().mockReturnValue(true)
}) as unknown as jest.Mocked<ComparativeReportService>;

export const createMockUXAnalyzer = () => ({
  analyzeProductVsCompetitors: jest.fn().mockResolvedValue({
    summary: 'Mock UX analysis summary',
    recommendations: [],
    confidence: 0.85,
    detailed: {
      usability: {},
      accessibility: {},
      performance: {}
    }
  }),
  analyzeCompetitiveUX: jest.fn().mockResolvedValue({
    competitorScores: [],
    insights: []
  }),
  generateFocusedAnalysis: jest.fn().mockResolvedValue({
    focus: 'usability',
    findings: []
  })
}) as unknown as jest.Mocked<UserExperienceAnalyzer>;
