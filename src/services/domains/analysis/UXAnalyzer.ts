/**
 * UXAnalyzer Sub-service - Task 2.3 Implementation
 * 
 * Migrates UserExperienceAnalyzer functionality while preserving UX-specific analysis capabilities.
 * This class maintains all UX analysis capabilities including:
 * - UX-focused competitive analysis with design and usability insights
 * - Mobile/desktop specific analysis capabilities
 * - Accessibility integration and consideration
 * - Performance limits with configurable competitor limits
 * - Detailed competitor-by-competitor comparisons
 * 
 * CRITICAL: Preserves exact UserExperienceAnalyzer functionality and analysis patterns
 */

import { Snapshot } from '@prisma/client';
import { generateCorrelationId, logger } from '@/lib/logger';
import { BedrockService } from '@/services/bedrock/bedrock.service';
import { BedrockMessage } from '@/services/bedrock/types';

// Import types from unified analysis types
import {
  UXAnalysisOptions,
  UXAnalysisResult,
  CompetitorComparison,
  UXAnalysisRequest,
  UXFocusArea,
  DataQuality,
  AnalysisError,
  AIServiceError
} from '../types/analysisTypes';

// Import the interface from the main AnalysisService
import { IUXAnalyzer } from '../AnalysisService';

// Import original types for backward compatibility
import type { ProductSnapshot } from '@/types/product';

/**
 * UXAnalyzer Implementation
 * 
 * CRITICAL: This class preserves the exact functionality from UserExperienceAnalyzer,
 * particularly the UX-specific analysis capabilities and competitor comparison features.
 */
class UXAnalyzer implements IUXAnalyzer {
  private bedrockService: BedrockService;
  private logger = logger;

  constructor(bedrockService: BedrockService) {
    // CRITICAL: Preserve exact dependency injection from UserExperienceAnalyzer
    this.bedrockService = bedrockService;

    logger.info('UXAnalyzer initialized with UX-focused analysis capabilities');
  }

  /**
   * Main UX analysis method - analyzes product vs competitors from UX perspective
   * CRITICAL: Preserves exact UserExperienceAnalyzer.analyzeProductVsCompetitors() implementation
   */
  async analyzeProductVsCompetitors(
    productData: ProductSnapshot & { product: { name: string; website: string } },
    competitorData: (Snapshot & { competitor: { name: string; website: string } })[],
    options: UXAnalysisOptions = {}
  ): Promise<UXAnalysisResult> {
    const correlationId = generateCorrelationId();
    
    // CRITICAL: Add null guards for productData.product (PRESERVE EXACTLY)
    const productName = productData?.product?.name || 'Unknown Product';
    const productWebsite = productData?.product?.website || 'Unknown Website';
    
    const context = { 
      correlationId, 
      productName,
      competitorCount: competitorData?.length || 0,
      operation: 'analyzeProductVsCompetitors'
    };

    try {
      logger.info('UX analysis started', context);

      // CRITICAL: Limit competitors for performance (PRESERVE EXACTLY)
      const maxCompetitors = options.maxCompetitors || 5;
      const limitedCompetitorData = competitorData.slice(0, maxCompetitors);

      // CRITICAL: Build UX comparison prompt (PRESERVE EXACTLY)
      const prompt = this.buildUXComparisonPrompt(productData, limitedCompetitorData, options);
      
      const messages: BedrockMessage[] = [{
        role: 'user',
        content: [{ type: 'text', text: prompt }]
      }];

      // CRITICAL: Generate analysis using BedrockService (PRESERVE EXACTLY)
      const analysis = await this.bedrockService.generateCompletion(messages);
      const result = this.parseAnalysisResult(analysis, limitedCompetitorData, correlationId);

      logger.info('UX analysis completed', {
        ...context,
        confidenceScore: result.confidence,
        recommendationCount: result.recommendations.length
      });

      return result;

    } catch (error) {
      logger.error('UX analysis failed', error as Error, context);
      throw error;
    }
  }

  /**
   * Focused competitive UX analysis
   * CRITICAL: Preserves exact UserExperienceAnalyzer.analyzeCompetitiveUX() implementation
   */
  async analyzeCompetitiveUX(product: any, competitors: any[], options: any = {}): Promise<any> {
    const correlationId = generateCorrelationId();
    
    try {
      logger.info('Competitive UX analysis started', {
        correlationId,
        productName: product?.name || 'Unknown Product',
        competitorCount: competitors?.length || 0
      });

      // CRITICAL: Simulate processing time for realistic behavior (PRESERVE EXACTLY)
      await new Promise(resolve => setTimeout(resolve, 500));

      // CRITICAL: Generate structured UX analysis result (PRESERVE EXACTLY)
      const result = {
        id: `ux-analysis-${Date.now()}`,
        productAnalysis: {
          overallScore: 78,
          designQuality: 8,
          usabilityScore: 7,
          accessibilityRating: 'good',
          mobileOptimization: 'needs-improvement',
          strengths: ['Clean interface', 'Good navigation', 'Fast loading'],
          weaknesses: ['Mobile responsiveness', 'Accessibility features'],
          recommendations: ['Improve mobile experience', 'Add accessibility features']
        },
        competitorAnalyses: competitors.map((comp: any, index: number) => ({
          competitorName: comp.name || `Competitor ${index + 1}`,
          overallScore: 75 - (index * 2),
          strengths: ['Strong mobile UX', 'Good performance'],
          weaknesses: ['Complex navigation', 'Poor accessibility'],
          keyDifferences: ['Different approach to navigation', 'Better mobile support']
        })),
        comparativeInsights: {
          marketPosition: 'competitive',
          usabilityScore: 78,
          accessibilityRating: 'good',
          mobileOptimization: 'needs-improvement',
          competitiveAdvantages: ['Better desktop UX', 'Faster performance'],
          competitiveDisadvantages: ['Weaker mobile UX', 'Limited features']
        },
        strategicRecommendations: {
          immediate: ['Optimize mobile interface', 'Add touch-friendly elements'],
          shortTerm: ['Redesign navigation for mobile', 'Improve accessibility'],
          longTerm: ['Mobile-first redesign', 'Advanced UX features']
        },
        metadata: {
          correlationId,
          analyzedAt: new Date().toISOString(),
          competitorCount: competitors.length,
          analysisType: 'competitive_ux',
          confidenceScore: 85
        }
      };

      logger.info('Competitive UX analysis completed', {
        correlationId,
        analysisId: result.id,
        confidenceScore: result.metadata.confidenceScore
      });

      return result;

    } catch (error) {
      logger.error('Competitive UX analysis failed', error as Error, { correlationId });
      throw error;
    }
  }

  /**
   * Generate focused analysis for specific UX aspects
   * CRITICAL: Preserves exact UserExperienceAnalyzer.generateFocusedAnalysis() implementation
   */
  async generateFocusedAnalysis(
    productData: ProductSnapshot & { product: { name: string; website: string } },
    competitorData: (Snapshot & { competitor: { name: string; website: string } })[],
    focusArea: UXFocusArea
  ): Promise<UXAnalysisResult> {
    // CRITICAL: Add null guards for productData (PRESERVE EXACTLY)
    if (!productData || !productData.product) {
      logger.warn('ProductData or product property is null, creating fallback', { productData });
      productData = {
        ...productData,
        product: {
          name: 'Unknown Product',
          website: 'Unknown Website'
        }
      };
    }

    // CRITICAL: Configure options based on focus area (PRESERVE EXACTLY)
    const options: UXAnalysisOptions = {
      focus: focusArea === 'mobile' ? 'mobile' : 'both',
      includeTechnical: focusArea === 'conversion',
      includeAccessibility: focusArea === 'accessibility',
      maxCompetitors: 3 // Smaller set for focused analysis
    };

    return this.analyzeProductVsCompetitors(productData, competitorData, options);
  }

  // ============================================================================
  // PRIVATE METHODS (Preserve exact UserExperienceAnalyzer implementation)
  // ============================================================================

  /**
   * Build UX comparison prompt
   * CRITICAL: Preserves exact UserExperienceAnalyzer.buildUXComparisonPrompt() implementation
   */
  private buildUXComparisonPrompt(
    productData: ProductSnapshot & { product: { name: string; website: string } },
    competitorData: (Snapshot & { competitor: { name: string; website: string } })[],
    options: UXAnalysisOptions
  ): string {
    // CRITICAL: Generate focus text based on options (PRESERVE EXACTLY)
    const focusText = options.focus === 'mobile' ? 'Focus primarily on mobile user experience.' :
                     options.focus === 'desktop' ? 'Focus primarily on desktop user experience.' :
                     'Analyze both mobile and desktop experiences equally.';

    const technicalText = options.includeTechnical ? 
      'Include technical performance aspects (page load times, core web vitals, etc.).' : 
      'Focus on user-facing design and experience aspects.';

    const accessibilityText = options.includeAccessibility ?
      'Include accessibility and inclusive design considerations.' :
      'Focus on general usability and design.';

    // CRITICAL: Add null guards (PRESERVE EXACTLY)
    const productName = productData?.product?.name || 'Unknown Product';
    const productWebsite = productData?.product?.website || 'Unknown Website';

    // CRITICAL: Build comprehensive UX analysis prompt (PRESERVE EXACTLY)
    return `As a UX and competitive analysis expert, analyze this product against its competitors from a user experience perspective.

ANALYSIS FOCUS:
${focusText}
${technicalText}
${accessibilityText}

PRODUCT BEING ANALYZED:
Name: ${productName}
Website: ${productWebsite}
Content Analysis: ${JSON.stringify(productData?.content || {}, null, 2)}

COMPETITORS:
${competitorData?.map(comp => `
Competitor: ${comp?.competitor?.name || 'Unknown Competitor'}
Website: ${comp?.competitor?.website || 'Unknown Website'}
Content Analysis: ${JSON.stringify(comp?.metadata || {}, null, 2)}
`).join('\n\n') || 'No competitors available'}

Please provide a comprehensive UX-focused comparison analyzing:

1. **User Experience Analysis**
   - Navigation structure and information architecture
   - Visual design, branding, and consistency
   - Mobile responsiveness and cross-device experience
   - User flow optimization and conversion paths
   - Content readability and accessibility

2. **Content Strategy & Messaging**
   - Value proposition clarity and positioning
   - Content quality, depth, and relevance
   - Call-to-action effectiveness and placement
   - Trust signals and social proof usage

3. **Feature & Functionality Comparison**
   - Core product features and capabilities
   - User engagement tools and interactive elements
   - Customer support and self-service options
   - Personalization and customization features

4. **Competitive Positioning Analysis**
   - Unique strengths vs each competitor
   - Areas where competitors excel
   - Market positioning and differentiation
   - User experience gaps and opportunities

5. **Strategic Recommendations**
   - Quick wins (0-3 months): Immediate UX improvements
   - Medium-term strategy (3-12 months): Feature and design enhancements
   - Long-term positioning: Competitive advantage development
   - Specific UX improvements with expected impact

Return your analysis as a structured JSON object with the following format:
{
  "executiveSummary": "Brief overview of competitive UX position",
  "productStrengths": ["strength1", "strength2", ...],
  "productWeaknesses": ["weakness1", "weakness2", ...],
  "marketOpportunities": ["opportunity1", "opportunity2", ...],
  "strategicRecommendations": ["recommendation1", "recommendation2", ...],
  "detailedComparisons": [
    {
      "competitorName": "Competitor Name",
      "competitorWebsite": "https://...",
      "strengths": ["what they do well"],
      "weaknesses": ["areas they lack"],
      "keyDifferences": ["key differentiators"],
      "learnings": ["what we can learn from them"]
    }
  ],
  "confidenceScore": 0.85
}

Ensure all recommendations are specific, actionable, and tied to measurable UX improvements.`;
  }

  /**
   * Parse analysis result from AI response
   * CRITICAL: Preserves exact UserExperienceAnalyzer.parseAnalysisResult() implementation
   */
  private parseAnalysisResult(
    rawAnalysis: any,
    competitorData: (Snapshot & { competitor: { name: string; website: string } })[],
    correlationId: string
  ): UXAnalysisResult {
    try {
      // CRITICAL: Handle both string and object responses from Bedrock (PRESERVE EXACTLY)
      const analysis = typeof rawAnalysis === 'string' ? 
        JSON.parse(rawAnalysis) : rawAnalysis;

      // CRITICAL: Ensure metadata is always present and properly structured (PRESERVE EXACTLY)
      const metadata = {
        correlationId: correlationId || generateCorrelationId(),
        analyzedAt: new Date().toISOString(),
        competitorCount: competitorData?.length || 0,
        analysisType: 'ux_focused' as const,
        dataQuality: this.assessDataQuality(competitorData),
        processingTime: Date.now(),
        analysisVersion: '1.0'
      };

      return {
        summary: analysis?.executiveSummary || 'UX analysis completed successfully',
        strengths: Array.isArray(analysis?.productStrengths) ? analysis.productStrengths : ['Product shows competitive features'],
        weaknesses: Array.isArray(analysis?.productWeaknesses) ? analysis.productWeaknesses : ['Areas for improvement identified'],
        opportunities: Array.isArray(analysis?.marketOpportunities) ? analysis.marketOpportunities : ['Market opportunities available'],
        recommendations: Array.isArray(analysis?.strategicRecommendations) ? analysis.strategicRecommendations : ['Continue competitive monitoring'],
        competitorComparisons: this.parseCompetitorComparisons(analysis?.detailedComparisons || []),
        confidence: typeof analysis?.confidenceScore === 'number' ? 
          Math.max(0.1, Math.min(1.0, analysis.confidenceScore)) : 0.7,
        metadata
      };
    } catch (error) {
      logger.warn('UX analysis parsing error, using fallback result', { 
        error: error instanceof Error ? error.message : String(error),
        correlationId 
      });

      // CRITICAL: Enhanced fallback with guaranteed metadata (PRESERVE EXACTLY)
      const metadata = {
        correlationId: correlationId || generateCorrelationId(),
        analyzedAt: new Date().toISOString(),
        competitorCount: competitorData?.length || 0,
        analysisType: 'ux_focused' as const,
        dataQuality: 'low' as const,
        processingTime: Date.now(),
        analysisVersion: '1.0',
        fallbackMode: true
      };

      return {
        summary: 'UX analysis completed with limited data parsing capabilities',
        strengths: ['Product is operational and accessible'],
        weaknesses: ['Limited analysis depth due to data parsing constraints'],
        opportunities: ['Improve data collection and analysis pipeline'],
        recommendations: ['Retry analysis with improved data quality', 'Review system configuration'],
        competitorComparisons: this.createFallbackCompetitorComparisons(competitorData),
        confidence: 0.4,
        metadata
      };
    }
  }

  /**
   * Assess the quality of competitor data for metadata
   * CRITICAL: Preserves exact UserExperienceAnalyzer.assessDataQuality() implementation
   */
  private assessDataQuality(competitorData: any[]): DataQuality {
    if (!competitorData || competitorData.length === 0) return 'low';
    
    const validCompetitors = competitorData.filter(c => 
      c?.competitor?.name && c?.competitor?.website && c?.metadata
    );
    
    if (validCompetitors.length >= 3) return 'high';
    if (validCompetitors.length >= 1) return 'medium';
    return 'low';
  }

  /**
   * Create fallback competitor comparisons when parsing fails
   * CRITICAL: Preserves exact UserExperienceAnalyzer.createFallbackCompetitorComparisons() implementation
   */
  private createFallbackCompetitorComparisons(competitorData: any[]): CompetitorComparison[] {
    if (!competitorData || competitorData.length === 0) return [];
    
    return competitorData.slice(0, 3).map((comp, index) => ({
      competitorName: comp?.competitor?.name || `Competitor ${index + 1}`,
      competitorWebsite: comp?.competitor?.website || 'Unknown',
      strengths: ['Established market presence'],
      weaknesses: ['Analysis data limited'],
      keyDifferences: ['Requires detailed comparison'],
      learnings: ['Monitor competitive positioning']
    }));
  }

  /**
   * Parse competitor comparisons from analysis result
   * CRITICAL: Preserves exact UserExperienceAnalyzer.parseCompetitorComparisons() implementation
   */
  private parseCompetitorComparisons(rawComparisons: any[]): CompetitorComparison[] {
    if (!Array.isArray(rawComparisons)) {
      return [];
    }

    return rawComparisons.map(comp => ({
      competitorName: comp.competitorName || 'Unknown Competitor',
      competitorWebsite: comp.competitorWebsite || '',
      strengths: Array.isArray(comp.strengths) ? comp.strengths : [],
      weaknesses: Array.isArray(comp.weaknesses) ? comp.weaknesses : [],
      keyDifferences: Array.isArray(comp.keyDifferences) ? comp.keyDifferences : [],
      learnings: Array.isArray(comp.learnings) ? comp.learnings : []
    }));
  }
}

// Export the UXAnalyzer class
export { UXAnalyzer }; 