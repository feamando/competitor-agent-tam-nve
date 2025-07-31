/**
 * Legacy Analysis Adapter
 * Bridges between legacy ComparativeAnalysisService interface and consolidated AnalysisService
 * 
 * Task 7.2: Complete Analysis Endpoint Migration
 * - Handles interface compatibility between legacy and unified services
 * - Preserves backward compatibility for existing API consumers
 * - Transforms legacy input/output formats to unified formats
 */

import { AnalysisService } from '@/services/domains/AnalysisService';
import { 
  ComparativeAnalysisInput, 
  ComparativeAnalysis,
  AnalysisFocusArea 
} from '@/types/analysis';
import { 
  AnalysisRequest, 
  AnalysisResponse,
  AnalysisType,
  AnalysisPriority 
} from '@/services/domains/types/analysisTypes';
import { logger, generateCorrelationId } from '@/lib/logger';

export class LegacyAnalysisAdapter {
  private analysisService: AnalysisService;
  
  constructor() {
    this.analysisService = new AnalysisService();
  }

  /**
   * Legacy-compatible method that mimics ComparativeAnalysisService.analyzeProductVsCompetitors
   */
  async analyzeProductVsCompetitors(
    input: ComparativeAnalysisInput, 
    correlationId?: string
  ): Promise<ComparativeAnalysis> {
    const requestCorrelationId = correlationId || generateCorrelationId();
    
    logger.info('LegacyAnalysisAdapter: Converting legacy analysis input to unified format', {
      correlationId: requestCorrelationId,
      productId: input.product.id,
      competitorCount: input.competitors.length
    });

    try {
      // Transform legacy input to unified format
      const unifiedRequest = this.transformLegacyInput(input, requestCorrelationId);
      
      // Execute analysis using consolidated service
      const unifiedResponse = await this.analysisService.analyzeProduct(unifiedRequest);
      
      // Transform unified response back to legacy format
      const legacyResponse = this.transformToLegacyResponse(unifiedResponse);
      
      logger.info('LegacyAnalysisAdapter: Successfully converted unified response to legacy format', {
        correlationId: requestCorrelationId,
        analysisId: legacyResponse.id
      });
      
      return legacyResponse;
      
    } catch (error) {
      logger.error('LegacyAnalysisAdapter: Failed to execute analysis', error as Error, {
        correlationId: requestCorrelationId,
        productId: input.product.id
      });
      throw error;
    }
  }

  /**
   * Legacy-compatible method for generating analysis reports
   */
  async generateAnalysisReport(analysis: ComparativeAnalysis): Promise<string> {
    // Use the summary as the report content for backward compatibility
    const reportSections = [
      `# Comparative Analysis Report`,
      `## Executive Summary`,
      `**Overall Position**: ${analysis.summary.overallPosition}`,
      `**Opportunity Score**: ${analysis.summary.opportunityScore}/100`,
      `**Threat Level**: ${analysis.summary.threatLevel}`,
      ``,
      `### Key Strengths:`,
      ...analysis.summary.keyStrengths.map(strength => `- ${strength}`),
      ``,
      `### Key Weaknesses:`,
      ...analysis.summary.keyWeaknesses.map(weakness => `- ${weakness}`),
      ``,
      `## Recommendations`,
      `### Immediate Actions:`,
      ...analysis.recommendations.immediate.map(rec => `- ${rec}`),
      ``,
      `### Short-term Goals:`,
      ...analysis.recommendations.shortTerm.map(rec => `- ${rec}`),
      ``,
      `### Long-term Strategy:`,
      ...analysis.recommendations.longTerm.map(rec => `- ${rec}`)
    ];

    return reportSections.join('\n');
  }

  /**
   * Transform legacy input format to unified AnalysisRequest
   */
  private transformLegacyInput(
    input: ComparativeAnalysisInput, 
    correlationId: string
  ): AnalysisRequest {
    return {
      analysisType: 'comparative_analysis' as AnalysisType,
      projectId: input.product.id, // Use product ID as project identifier
      correlationId,
      productData: {
        id: input.product.id,
        name: input.product.name,
        website: input.product.website,
        positioning: input.product.positioning,
        customerData: input.product.customerData,
        userProblem: input.product.userProblem,
        industry: input.product.industry,
        snapshot: input.productSnapshot
      },
      competitorData: input.competitors.map(comp => ({
        competitor: {
          id: comp.competitor.id,
          name: comp.competitor.name,
          website: comp.competitor.website,
          description: comp.competitor.description || '',
          industry: comp.competitor.industry,
          employeeCount: comp.competitor.employeeCount,
          revenue: comp.competitor.revenue,
          founded: comp.competitor.founded,
          headquarters: comp.competitor.headquarters
        },
        snapshot: comp.snapshot
      })),
      options: {
        includeRecommendations: input.analysisConfig?.includeRecommendations ?? true,
        comparativeOptions: {
          focusAreas: input.analysisConfig?.focusAreas || ['features', 'positioning', 'user_experience', 'customer_targeting'],
          depth: input.analysisConfig?.depth || 'detailed'
        }
      },
      priority: 'normal' as AnalysisPriority
    };
  }

  /**
   * Transform unified AnalysisResponse back to legacy ComparativeAnalysis format
   */
  private transformToLegacyResponse(response: AnalysisResponse): ComparativeAnalysis {
    // If we have a comparative analysis result, use it directly
    if (response.comparativeAnalysis) {
      return response.comparativeAnalysis;
    }

    // Otherwise, construct from unified response
    return {
      id: response.analysisId,
      projectId: response.metadata.projectId || '',
      productId: response.metadata.productId || '',
      competitorIds: response.metadata.competitorIds || [],
      analysisDate: new Date(),
      summary: {
        overallPosition: this.mapOverallPosition(response.summary.qualityScore || 0),
        keyStrengths: response.summary.keyInsights?.filter(insight => insight.type === 'strength').map(i => i.description) || [],
        keyWeaknesses: response.summary.keyInsights?.filter(insight => insight.type === 'weakness').map(i => i.description) || [],
        opportunityScore: Math.round((response.summary.qualityScore || 0) * 100),
        threatLevel: this.mapThreatLevel(response.summary.riskLevel || 0.5)
      },
      detailed: {
        featureComparison: {
          coreFeatures: response.detailed?.featureAnalysis || {},
          uniqueFeatures: {},
          missingFeatures: [],
          overallScore: response.summary.qualityScore || 0
        },
        positioningAnalysis: {
          marketPosition: response.summary.summary || 'Analysis completed',
          targetAudience: response.detailed?.targetAudience || {},
          valueProposition: response.detailed?.valueProposition || {},
          competitiveAdvantage: response.summary.keyInsights?.map(i => i.description) || []
        },
        userExperienceComparison: response.uxAnalysis || {
          overallUXScore: response.summary.qualityScore || 0,
          usabilityMetrics: {},
          designQuality: {},
          userJourneyAnalysis: {},
          recommendations: response.recommendations?.immediate || []
        },
        customerTargeting: {
          targetSegments: {},
          customerPersonas: {},
          marketingChannels: {},
          messagingStrategy: {}
        }
      },
      recommendations: {
        immediate: response.recommendations?.immediate || [],
        shortTerm: response.recommendations?.shortTerm || [],
        longTerm: response.recommendations?.longTerm || [],
        priorityScore: Math.round((response.quality.confidenceLevel || 0) * 100)
      },
      metadata: {
        analysisVersion: '1.0',
        processingTime: response.metadata.processingTime || 0,
        confidenceScore: response.quality.confidenceLevel || 0,
        dataQuality: response.quality.dataQuality || 'medium',
        generatedBy: 'consolidated-analysis-service',
        timestamp: new Date()
      }
    };
  }

  /**
   * Map quality score to overall position
   */
  private mapOverallPosition(qualityScore: number): 'leading' | 'competitive' | 'trailing' {
    if (qualityScore >= 0.7) return 'leading';
    if (qualityScore >= 0.4) return 'competitive';
    return 'trailing';
  }

  /**
   * Map risk level to threat level
   */
  private mapThreatLevel(riskLevel: number): 'low' | 'medium' | 'high' {
    if (riskLevel <= 0.3) return 'low';
    if (riskLevel <= 0.7) return 'medium';
    return 'high';
  }
}

// Export a singleton instance for easy use
export const legacyAnalysisAdapter = new LegacyAnalysisAdapter(); 