/**
 * ComparativeAnalyzer Sub-service - Task 2.4 Implementation
 * 
 * Migrates ComparativeAnalysisService functionality while preserving critical dependencies.
 * This class maintains all comparative analysis capabilities including:
 * - Comprehensive data validation using dataIntegrityValidator
 * - Structured analysis output with detailed comparisons
 * - Enhanced error classification for AWS-specific issues
 * - Fallback analysis mechanisms for robust operation
 * - Configurable analysis with focus areas and depth levels
 * 
 * CRITICAL: Preserves exact ComparativeAnalysisService functionality and validation patterns
 */

import {
  ComparativeAnalysisInput,
  ComparativeAnalysis,
  AnalysisConfiguration,
  ComparativeAnalysisError,
  InsufficientDataError,
  AIServiceError,
  AnalysisFocusArea
} from '../types/analysisTypes';
import { BedrockService } from '@/services/bedrock/bedrock.service';
import { BedrockMessage } from '@/services/bedrock/types';
import { logger } from '@/lib/logger';
import { getAnalysisPrompt, COMPREHENSIVE_ANALYSIS_PROMPT } from '@/services/analysis/analysisPrompts';
import { createId } from '@paralleldrive/cuid2';
import { dataIntegrityValidator } from '@/lib/validation/dataIntegrity';

// Import the interface from the main AnalysisService
import { IComparativeAnalyzer } from '../AnalysisService';

/**
 * ComparativeAnalyzer Implementation
 * 
 * CRITICAL: This class preserves the exact functionality from ComparativeAnalysisService,
 * particularly the data validation with dataIntegrityValidator and structured analysis output.
 */
class ComparativeAnalyzer implements IComparativeAnalyzer {
  private bedrockService: BedrockService;
  private dataIntegrityValidator: any; // CRITICAL DEPENDENCY
  private logger = logger;
  private configuration: AnalysisConfiguration;

  constructor(
    bedrockService: BedrockService,
    dataIntegrityValidator: any,
    configuration: AnalysisConfiguration
  ) {
    // CRITICAL: Preserve exact dependency injection from ComparativeAnalysisService
    this.bedrockService = bedrockService;
    this.dataIntegrityValidator = dataIntegrityValidator; // CRITICAL DEPENDENCY
    this.configuration = {
      provider: 'bedrock',
      model: 'anthropic.claude-3-sonnet-20240229-v1:0',
      maxTokens: 8000,
      temperature: 0.3,
      focusAreas: ['features', 'positioning', 'user_experience', 'customer_targeting'],
      includeMetrics: true,
      includeRecommendations: true,
      analysisDepth: 'detailed',
      ...configuration
    };

    logger.info('ComparativeAnalyzer initialized with data validation and structured analysis');
  }

  /**
   * Main comparative analysis method
   * CRITICAL: Preserves exact ComparativeAnalysisService.analyzeProductVsCompetitors() implementation
   */
  public async analyzeProductVsCompetitors(input: ComparativeAnalysisInput): Promise<ComparativeAnalysis> {
    const context = { 
      productId: input.product.id, 
      competitorCount: input.competitors.length,
      focusAreas: input.analysisConfig?.focusAreas || this.configuration.focusAreas
    };
    
    logger.info('Starting comparative analysis', context);
    const startTime = Date.now();

    try {
      // CRITICAL: Validate input data using dataIntegrityValidator (PRESERVE EXACTLY)
      this.validateAnalysisInput(input);

      // CRITICAL: Prepare analysis configuration (PRESERVE EXACTLY)
      const analysisConfig = {
        focusAreas: input.analysisConfig?.focusAreas || this.configuration.focusAreas,
        depth: input.analysisConfig?.depth || this.configuration.analysisDepth,
        includeRecommendations: input.analysisConfig?.includeRecommendations ?? this.configuration.includeRecommendations
      };

      // CRITICAL: Get appropriate prompt template (PRESERVE EXACTLY)
      const promptTemplate = getAnalysisPrompt(analysisConfig.focusAreas, analysisConfig.depth);

      // CRITICAL: Build analysis prompt (PRESERVE EXACTLY)
      const analysisPrompt = this.buildAnalysisPrompt(input, promptTemplate);

      // CRITICAL: Execute AI analysis (PRESERVE EXACTLY)
      const rawAnalysisResult = await this.executeAnalysis(analysisPrompt);

      // CRITICAL: Parse and validate analysis result (PRESERVE EXACTLY)
      const parsedAnalysis = this.parseAnalysisResult(rawAnalysisResult);

      // CRITICAL: Build final analysis object (PRESERVE EXACTLY)
      const analysis: ComparativeAnalysis = {
        id: createId(),
        projectId: input.product.id, // Assuming product.id relates to project
        productId: input.product.id,
        competitorIds: input.competitors.map(c => c.competitor.id),
        analysisDate: new Date(),
        summary: parsedAnalysis.summary || this.createDefaultSummary(input),
        detailed: parsedAnalysis.detailed || this.createDefaultDetailed(input),
        recommendations: parsedAnalysis.recommendations || this.createDefaultRecommendations(),
        metadata: {
          analysisMethod: 'ai_powered',
          modelUsed: this.configuration.model,
          confidenceScore: parsedAnalysis.metadata?.confidenceScore || 75,
          processingTime: Date.now() - startTime,
          dataQuality: this.assessDataQuality(input)
        }
      };

      logger.info('Comparative analysis completed successfully', {
        ...context,
        analysisId: analysis.id,
        processingTime: analysis.metadata.processingTime,
        confidenceScore: analysis.metadata.confidenceScore
      });

      return analysis;

    } catch (error) {
      logger.error('Failed to complete comparative analysis', error as Error, context);
      
      if (error instanceof ComparativeAnalysisError) {
        throw error;
      }
      
      throw new ComparativeAnalysisError(
        'Analysis processing failed',
        'PROCESSING_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Generate analysis report from analysis object
   * CRITICAL: Preserves exact ComparativeAnalysisService.generateAnalysisReport() implementation
   */
  public async generateAnalysisReport(analysis: ComparativeAnalysis): Promise<string> {
    const context = { analysisId: analysis.id };
    logger.info('Generating analysis report', context);

    try {
      // CRITICAL: Build report prompt (PRESERVE EXACTLY)
      const reportPrompt = this.buildReportPrompt(analysis);
      const reportContent = await this.executeAnalysis(reportPrompt);

      logger.info('Analysis report generated successfully', {
        ...context,
        reportLength: reportContent.length
      });

      return reportContent;
    } catch (error) {
      logger.error('Failed to generate analysis report', error as Error, context);
      throw new ComparativeAnalysisError(
        'Report generation failed',
        'PROCESSING_ERROR',
        { analysisId: analysis.id }
      );
    }
  }

  /**
   * Get analysis history for project
   * CRITICAL: Preserves exact ComparativeAnalysisService.getAnalysisHistory() implementation
   */
  public async getAnalysisHistory(projectId: string): Promise<ComparativeAnalysis[]> {
    // This would typically query a database for stored analyses
    // For now, return empty array as this would need repository integration
    logger.info('Retrieving analysis history', { projectId });
    return [];
  }

  /**
   * Update analysis configuration
   * CRITICAL: Preserves exact ComparativeAnalysisService.updateAnalysisConfiguration() implementation
   */
  public updateAnalysisConfiguration(config: Partial<AnalysisConfiguration>): void {
    this.configuration = { ...this.configuration, ...config };
    logger.info('Analysis configuration updated', { config });
  }

  // ============================================================================
  // PRIVATE METHODS (Preserve exact ComparativeAnalysisService implementation)
  // ============================================================================

  /**
   * Validate analysis input using dataIntegrityValidator
   * CRITICAL: Preserves exact ComparativeAnalysisService.validateAnalysisInput() implementation
   */
  private validateAnalysisInput(input: ComparativeAnalysisInput): void {
    console.log('ComparativeAnalyzer: Validating analysis input', {
      hasProduct: !!input.product,
      productId: input.product?.id,
      productName: input.product?.name,
      hasProductSnapshot: !!input.productSnapshot,
      productSnapshotContent: !!input.productSnapshot?.content,
      competitorCount: input.competitors?.length || 0,
      competitors: input.competitors?.map(c => ({
        id: c.competitor?.id,
        name: c.competitor?.name,
        hasSnapshot: !!c.snapshot
      }))
    });

    // CRITICAL: Use data integrity validator for comprehensive validation (PRESERVE EXACTLY)
    const validationResult = this.dataIntegrityValidator.validateAnalysisInput(input);
    if (!validationResult.valid) {
      console.error('ComparativeAnalyzer: Analysis input validation failed', {
        errors: validationResult.errors
      });
      throw new InsufficientDataError(
        `Analysis input validation failed: ${validationResult.errors.join(', ')}`,
        { validationErrors: validationResult.errors }
      );
    }

    // CRITICAL: Additional business logic validation (PRESERVE EXACTLY)
    if (!input.product?.id || !input.product?.name) {
      console.error('ComparativeAnalyzer: Product information is incomplete');
      throw new InsufficientDataError('Product information is incomplete', {
        missing: ['product.id', 'product.name']
      });
    }

    if (!input.productSnapshot?.content) {
      console.error('ComparativeAnalyzer: Product snapshot content is missing');
      throw new InsufficientDataError('Product snapshot content is missing');
    }

    if (!input.competitors || input.competitors.length === 0) {
      console.error('ComparativeAnalyzer: No competitors provided');
      throw new InsufficientDataError('At least one competitor is required for analysis');
    }

    // CRITICAL: Relaxed validation - don't require perfect competitor data (PRESERVE EXACTLY)
    const validCompetitors = input.competitors.filter(
      c => c.competitor?.id && c.competitor?.name
    );

    if (validCompetitors.length === 0) {
      console.error('ComparativeAnalyzer: No valid competitors found');
      throw new InsufficientDataError('No valid competitor data found');
    }

    // CRITICAL: Relaxed content validation - reduce minimum content length (PRESERVE EXACTLY)
    const productContentLength = this.getContentLength(input.productSnapshot);
    console.log('ComparativeAnalyzer: Product content length:', productContentLength);
    
    if (productContentLength < 10) { // Reduced from 100 to 10
      console.error('ComparativeAnalyzer: Product content is too short');
      throw new InsufficientDataError('Product content is too short for meaningful analysis');
    }

    console.log('ComparativeAnalyzer: Validation passed', {
      productContentLength,
      validCompetitorCount: validCompetitors.length
    });

    logger.debug('Analysis input validation passed', {
      productId: input.product.id,
      productContentLength,
      competitorCount: validCompetitors.length
    });
  }

  /**
   * Build analysis prompt from input and template
   * CRITICAL: Preserves exact ComparativeAnalysisService.buildAnalysisPrompt() implementation
   */
  private buildAnalysisPrompt(input: ComparativeAnalysisInput, template: any): string {
    const productContent = this.extractContent(input.productSnapshot);
    const competitorData = input.competitors.map(c => ({
      competitorId: c.competitor.id,
      competitorName: c.competitor.name,
      competitorWebsite: c.competitor.website,
      competitorIndustry: c.competitor.industry,
      competitorDescription: c.competitor.description || '',
      competitorContent: this.extractCompetitorContent(c.snapshot)
    }));

    // CRITICAL: Simple template replacement (PRESERVE EXACTLY)
    let prompt = template.userTemplate
      .replace(/{{productName}}/g, input.product.name)
      .replace(/{{productWebsite}}/g, input.product.website)
      .replace(/{{productPositioning}}/g, input.product.positioning)
      .replace(/{{productIndustry}}/g, input.product.industry)
      .replace(/{{customerData}}/g, input.product.customerData)
      .replace(/{{userProblem}}/g, input.product.userProblem)
      .replace(/{{productContent}}/g, productContent);

    // CRITICAL: Replace competitor template sections (PRESERVE EXACTLY)
    const competitorSection = competitorData.map(comp => 
      `**${comp.competitorName}** (${comp.competitorWebsite})
Industry: ${comp.competitorIndustry}
${comp.competitorDescription}

Content: ${comp.competitorContent}`
    ).join('\n\n');

    prompt = prompt.replace(/{{#competitors}}[\s\S]*?{{\/competitors}}/g, competitorSection);

    return prompt;
  }

  /**
   * Execute AI analysis using BedrockService
   * CRITICAL: Preserves exact ComparativeAnalysisService.executeAnalysis() implementation
   */
  private async executeAnalysis(prompt: string): Promise<string> {
    try {
      console.log('ComparativeAnalyzer: Starting analysis execution', {
        promptLength: prompt.length,
        promptPreview: prompt.substring(0, 200) + '...'
      });

      const messages: BedrockMessage[] = [
        {
          role: 'user',
          content: [{ type: 'text', text: prompt }]
        }
      ];

      console.log('ComparativeAnalyzer: Calling Bedrock service...');
      const result = await this.bedrockService.generateCompletion(messages);
      
      console.log('ComparativeAnalyzer: Bedrock call successful', {
        resultLength: result?.length || 0,
        resultPreview: result?.substring(0, 100) + '...'
      });
      
      if (!result || result.length < 50) {
        console.error('ComparativeAnalyzer: Insufficient response from AI service', {
          resultLength: result?.length || 0,
          result: result
        });
        throw new AIServiceError('AI service returned insufficient response', {
          resultLength: result?.length || 0,
          minLength: 50
        });
      }

      return result;
    } catch (error) {
      console.error('ComparativeAnalyzer: AI service execution failed', {
        error: error,
        errorMessage: (error as Error).message,
        errorStack: (error as Error).stack
      });

      // CRITICAL: Enhanced error classification (PRESERVE EXACTLY)
      const errorMessage = (error as Error).message.toLowerCase();
      
      // Check for AWS-specific errors
      if (errorMessage.includes('credential') || errorMessage.includes('unauthorized') || errorMessage.includes('access denied')) {
        logger.error('AWS credentials error detected', error as Error);
        throw new AIServiceError('AWS credentials are invalid or expired. Please refresh your credentials.', { 
          originalError: error,
          errorType: 'AWS_CREDENTIALS_ERROR',
          userFriendly: true
        });
      }
      
      if (errorMessage.includes('rate limit') || errorMessage.includes('throttle') || errorMessage.includes('too many requests')) {
        logger.error('AWS rate limit exceeded', error as Error);
        throw new AIServiceError('AWS rate limit exceeded. Please wait a few minutes before trying again.', { 
          originalError: error,
          errorType: 'AWS_RATE_LIMIT_ERROR',
          userFriendly: true
        });
      }
      
      if (errorMessage.includes('quota') || errorMessage.includes('limit exceeded')) {
        logger.error('AWS quota exceeded', error as Error);
        throw new AIServiceError('AWS service quota exceeded. Please contact your administrator.', { 
          originalError: error,
          errorType: 'AWS_QUOTA_ERROR',
          userFriendly: true
        });
      }
      
      if (errorMessage.includes('network') || errorMessage.includes('timeout') || errorMessage.includes('connection')) {
        logger.error('AWS connection error detected', error as Error);
        throw new AIServiceError('Unable to connect to AWS services. Please check your connection and try again.', { 
          originalError: error,
          errorType: 'AWS_CONNECTION_ERROR',
          userFriendly: true
        });
      }
      
      if (errorMessage.includes('region') || errorMessage.includes('endpoint')) {
        logger.error('AWS region/endpoint error detected', error as Error);
        throw new AIServiceError('AWS region is not available or configured incorrectly.', { 
          originalError: error,
          errorType: 'AWS_REGION_ERROR',
          userFriendly: true
        });
      }

      // Generic AI service error
      logger.error('AI service execution failed', error as Error);
      throw new AIServiceError('Failed to get analysis from AI service. Please try again.', { 
        originalError: error,
        errorType: 'AI_SERVICE_ERROR',
        userFriendly: true
      });
    }
  }

  /**
   * Parse analysis result from AI response
   * CRITICAL: Preserves exact ComparativeAnalysisService.parseAnalysisResult() implementation
   */
  private parseAnalysisResult(rawResult: string): Partial<ComparativeAnalysis> {
    try {
      // CRITICAL: Extract JSON from the response (PRESERVE EXACTLY)
      const jsonMatch = rawResult.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        logger.warn('No JSON found in AI response, creating structured fallback');
        return this.createStructuredFallbackAnalysis(rawResult);
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      // CRITICAL: Ensure the parsed result has the correct structure (PRESERVE EXACTLY)
      if (parsed && typeof parsed === 'object') {
        const result = {
          summary: this.validateAndNormalizeSummary(parsed.summary, rawResult),
          detailed: this.validateAndNormalizeDetailed(parsed.detailed) || this.createDefaultDetailedStructure(),
          recommendations: this.validateAndNormalizeRecommendations(parsed.recommendations, rawResult),
          metadata: {
            analysisMethod: 'ai_powered' as const,
            confidenceScore: parsed.metadata?.confidenceScore || 85,
            processingTime: 0,
            dataQuality: parsed.metadata?.dataQuality || 'medium' as const
          }
        };

        // CRITICAL: Validate that we have meaningful content in all sections (PRESERVE EXACTLY)
        if (!this.validateParsedContent(result)) {
          logger.warn('Parsed analysis lacks sufficient content, enhancing with fallback data');
          return this.enhanceWithFallbackContent(result, rawResult);
        }

        return result;
      }
      
      return this.createStructuredFallbackAnalysis(rawResult);
    } catch (error) {
      logger.warn('Failed to parse analysis result as JSON, using structured fallback', { 
        error: error instanceof Error ? error.message : String(error)
      });
      return this.createStructuredFallbackAnalysis(rawResult);
    }
  }

  /**
   * Build report prompt from analysis
   * CRITICAL: Preserves exact ComparativeAnalysisService.buildReportPrompt() implementation
   */
  private buildReportPrompt(analysis: ComparativeAnalysis): string {
    return `Generate a comprehensive business report based on the following comparative analysis data:

**Analysis Summary:**
- Overall Position: ${analysis.summary.overallPosition}
- Opportunity Score: ${analysis.summary.opportunityScore}/100
- Threat Level: ${analysis.summary.threatLevel}

**Key Strengths:**
${analysis.summary.keyStrengths.map(s => `- ${s}`).join('\n')}

**Key Weaknesses:**
${analysis.summary.keyWeaknesses.map(w => `- ${w}`).join('\n')}

**Recommendations:**
Immediate Actions:
${analysis.recommendations.immediate.map(r => `- ${r}`).join('\n')}

Short-term Actions:
${analysis.recommendations.shortTerm.map(r => `- ${r}`).join('\n')}

Long-term Actions:
${analysis.recommendations.longTerm.map(r => `- ${r}`).join('\n')}

Please format this as a professional business report with executive summary, detailed findings, and actionable recommendations. Target length: 1500-2000 words.`;
  }

  // Helper methods (preserve all ComparativeAnalysisService helper methods)
  private extractContent(productSnapshot: any): string {
    const content = productSnapshot.content;
    if (typeof content === 'string') return content;
    
    const textContent = content?.text || content?.html || '';
    const title = content?.title || '';
    const description = content?.description || '';
    
    return `Title: ${title}\nDescription: ${description}\nContent: ${textContent}`.slice(0, 4000);
  }

  private extractCompetitorContent(snapshot: any): string {
    const metadata = snapshot.metadata || {};
    const title = metadata.title || '';
    const description = metadata.description || '';
    const text = metadata.text || metadata.html || '';
    
    return `Title: ${title}\nDescription: ${description}\nContent: ${text}`.slice(0, 3000);
  }

  private getContentLength(snapshot: any): number {
    const content = snapshot.content;
    if (typeof content === 'string') return content.length;
    return (content?.text || content?.html || '').length;
  }

  private assessDataQuality(input: ComparativeAnalysisInput): 'high' | 'medium' | 'low' {
    const productLength = this.getContentLength(input.productSnapshot);
    const avgCompetitorLength = input.competitors.reduce((sum, c) => 
      sum + (c.snapshot.metadata?.text?.length || 0), 0) / input.competitors.length;

    if (productLength > 2000 && avgCompetitorLength > 1500) return 'high';
    if (productLength > 1000 && avgCompetitorLength > 800) return 'medium';
    return 'low';
  }

  // All validation and fallback methods (preserve exactly from ComparativeAnalysisService)
  private validateParsedContent(result: Partial<ComparativeAnalysis>): boolean {
    if (!result.summary || (result.summary as any).length < 100) return false;
    if (!result.detailed || typeof result.detailed !== 'object') return false;
    return true;
  }

  private createStructuredFallbackAnalysis(rawResult: string): Partial<ComparativeAnalysis> {
    return {
      summary: this.extractSummaryFromRawText(rawResult),
      detailed: this.createDefaultDetailedStructure(),
      recommendations: this.createDefaultRecommendations(),
      metadata: {
        analysisMethod: 'ai_powered' as const,
        confidenceScore: 65,
        processingTime: 0,
        dataQuality: 'medium' as const,
        fallbackMode: true
      }
    };
  }

  private enhanceWithFallbackContent(result: Partial<ComparativeAnalysis>, rawResult: string): Partial<ComparativeAnalysis> {
    return {
      ...result,
      summary: (result.summary as any)?.length >= 100 ? result.summary : this.extractSummaryFromRawText(rawResult),
      detailed: this.ensureDetailedStructure(result.detailed),
      recommendations: result.recommendations || this.createDefaultRecommendations()
    };
  }

  private extractSummaryFromRawText(rawResult: string): any {
    if (!rawResult || rawResult.length < 50) {
      return 'Competitive analysis completed with comprehensive feature, positioning, and market assessment.';
    }
    const sentences = rawResult.split(/[.!?]+/).filter(s => s.trim().length > 20);
    if (sentences.length >= 3) {
      return sentences.slice(0, 3).join('. ').trim() + '.';
    }
    return rawResult.substring(0, 300).trim() + '...';
  }

  private validateAndNormalizeSummary(summary: any, rawResult: string): any {
    if (summary && typeof summary === 'object') {
      return {
        overallPosition: this.validatePosition(summary.overallPosition) || 'competitive' as const,
        keyStrengths: Array.isArray(summary.keyStrengths) ? summary.keyStrengths : this.extractListFromText(rawResult, 'strength'),
        keyWeaknesses: Array.isArray(summary.keyWeaknesses) ? summary.keyWeaknesses : this.extractListFromText(rawResult, 'weakness'),
        opportunityScore: typeof summary.opportunityScore === 'number' ? Math.max(0, Math.min(100, summary.opportunityScore)) : 70,
        threatLevel: this.validateThreatLevel(summary.threatLevel) || 'medium' as const
      };
    }
    
    return {
      overallPosition: 'competitive' as const,
      keyStrengths: this.extractListFromText(rawResult, 'strength'),
      keyWeaknesses: this.extractListFromText(rawResult, 'weakness'),
      opportunityScore: 70,
      threatLevel: 'medium' as const
    };
  }

  private validateAndNormalizeDetailed(detailed: any): any {
    if (!detailed || typeof detailed !== 'object') return null;
    return detailed; // Simplified for now
  }

  private validateAndNormalizeRecommendations(recommendations: any, rawResult: string): any {
    if (recommendations && typeof recommendations === 'object') {
      return {
        immediate: Array.isArray(recommendations.immediate) ? recommendations.immediate : this.extractListFromText(rawResult, 'immediate'),
        shortTerm: Array.isArray(recommendations.shortTerm) ? recommendations.shortTerm : this.extractListFromText(rawResult, 'short'),
        longTerm: Array.isArray(recommendations.longTerm) ? recommendations.longTerm : this.extractListFromText(rawResult, 'long'),
        priorityScore: typeof recommendations.priorityScore === 'number' ? Math.max(0, Math.min(100, recommendations.priorityScore)) : 75
      };
    }
    
    return {
      immediate: this.extractListFromText(rawResult, 'immediate'),
      shortTerm: this.extractListFromText(rawResult, 'short'),
      longTerm: this.extractListFromText(rawResult, 'long'),
      priorityScore: 75
    };
  }

  private validatePosition(position: string): 'leading' | 'competitive' | 'trailing' | null {
    const validPositions = ['leading', 'competitive', 'trailing'];
    return validPositions.includes(position) ? position as any : null;
  }

  private validateThreatLevel(level: string): 'low' | 'medium' | 'high' | null {
    const validLevels = ['low', 'medium', 'high'];
    return validLevels.includes(level) ? level as any : null;
  }

  private createDefaultDetailedStructure(): any {
    return {
      featureComparison: {
        productFeatures: ['Core features'],
        competitorFeatures: [],
        uniqueToProduct: [],
        uniqueToCompetitors: [],
        commonFeatures: [],
        featureGaps: [],
        innovationScore: 70
      },
      positioningAnalysis: {
        productPositioning: {
          primaryMessage: 'Strong value proposition',
          valueProposition: 'Innovative solution',
          targetAudience: 'Business users',
          differentiators: ['Unique approach']
        },
        competitorPositioning: [],
        positioningGaps: [],
        marketOpportunities: [],
        messagingEffectiveness: 70
      }
    };
  }

  private ensureDetailedStructure(detailed: any): any {
    const defaultStructure = this.createDefaultDetailedStructure();
    if (!detailed || typeof detailed !== 'object') return defaultStructure;
    return { ...defaultStructure, ...detailed };
  }

  private createDefaultSummary(input: ComparativeAnalysisInput): any {
    return {
      overallPosition: 'competitive' as const,
      keyStrengths: ['Unique positioning', 'Strong product focus'],
      keyWeaknesses: ['Limited analysis data'],
      opportunityScore: 70,
      threatLevel: 'medium' as const
    };
  }

  private createDefaultDetailed(input: ComparativeAnalysisInput): any {
    return this.createDefaultDetailedStructure();
  }

  private createDefaultRecommendations(): any {
    return {
      immediate: ['Analyze competitor strengths', 'Identify key differentiators'],
      shortTerm: ['Enhance unique value proposition', 'Improve market positioning'],
      longTerm: ['Develop competitive advantages', 'Expand market presence'],
      priorityScore: 75
    };
  }

  private extractListFromText(text: string, keyword: string): string[] {
    const lines = text.split('\n');
    const items: string[] = [];
    
    for (const line of lines) {
      if (line.toLowerCase().includes(keyword)) {
        const cleaned = line.replace(/^[-*•\s]+/, '').trim();
        if (cleaned.length > 10) {
          items.push(cleaned);
        }
      }
    }
    
    return items.slice(0, 5);
  }
}

// Export the ComparativeAnalyzer class
export { ComparativeAnalyzer }; 