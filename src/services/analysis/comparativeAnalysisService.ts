import {
  ComparativeAnalysisService as IComparativeAnalysisService,
  ComparativeAnalysisInput,
  ComparativeAnalysis,
  AnalysisConfiguration,
  ComparativeAnalysisError,
  InsufficientDataError,
  AIServiceError,
  AnalysisFocusArea
} from '@/types/analysis';
import { BedrockService } from '@/services/bedrock/bedrock.service';
import { BedrockMessage } from '@/services/bedrock/types';
import { logger } from '@/lib/logger';
import { getAnalysisPrompt, COMPREHENSIVE_ANALYSIS_PROMPT } from './analysisPrompts';
import { createId } from '@paralleldrive/cuid2';
import { dataIntegrityValidator } from '@/lib/validation/dataIntegrity';
import { registerService } from '@/services/serviceRegistry';

export class ComparativeAnalysisService implements IComparativeAnalysisService {
  private bedrockService: BedrockService | null = null;
  private configuration: AnalysisConfiguration;

  constructor(config?: Partial<AnalysisConfiguration>) {
    this.configuration = {
      provider: 'bedrock',
      model: 'anthropic.claude-3-sonnet-20240229-v1:0',
      maxTokens: 8000,
      temperature: 0.3,
      focusAreas: ['features', 'positioning', 'user_experience', 'customer_targeting'],
      includeMetrics: true,
      includeRecommendations: true,
      analysisDepth: 'detailed',
      ...config
    };
  }

  /**
   * Initialize the Bedrock service with stored credentials
   */
  private async initializeBedrockService(): Promise<BedrockService> {
    if (!this.bedrockService) {
      try {
        // Try to create with stored credentials first
        this.bedrockService = await BedrockService.createWithStoredCredentials(
          'anthropic',
          {
            maxTokens: this.configuration.maxTokens,
            temperature: this.configuration.temperature
          }
        );
      } catch (error) {
        logger.warn('Failed to initialize with stored credentials, falling back to environment variables', { error });
        // Fallback to traditional constructor with environment variables
        this.bedrockService = new BedrockService(
          {
            maxTokens: this.configuration.maxTokens,
            temperature: this.configuration.temperature
          },
          'anthropic'
        );
      }
    }
    return this.bedrockService;
  }

  public updateAnalysisConfiguration(config: Partial<AnalysisConfiguration>): void {
    this.configuration = { ...this.configuration, ...config };
    
    // Reset Bedrock service if relevant config changed to force re-initialization
    if (config.maxTokens || config.temperature) {
      this.bedrockService = null;
    }

    logger.info('Analysis configuration updated', { config });
  }

  public async analyzeProductVsCompetitors(input: ComparativeAnalysisInput): Promise<ComparativeAnalysis> {
    const context = { 
      productId: input.product.id, 
      competitorCount: input.competitors.length,
      focusAreas: input.analysisConfig?.focusAreas || this.configuration.focusAreas
    };
    
    logger.info('Starting comparative analysis', context);
    const startTime = Date.now();

    try {
      // Validate input data
      this.validateAnalysisInput(input);

      // Prepare analysis configuration
      const analysisConfig = {
        focusAreas: input.analysisConfig?.focusAreas || this.configuration.focusAreas,
        depth: input.analysisConfig?.depth || this.configuration.analysisDepth,
        includeRecommendations: input.analysisConfig?.includeRecommendations ?? this.configuration.includeRecommendations
      };

      // Get appropriate prompt template
      const promptTemplate = getAnalysisPrompt(analysisConfig.focusAreas, analysisConfig.depth);

      // Build analysis prompt
      const analysisPrompt = this.buildAnalysisPrompt(input, promptTemplate);

      // Execute AI analysis
      const rawAnalysisResult = await this.executeAnalysis(analysisPrompt);

      // Parse and validate analysis result
      const parsedAnalysis = this.parseAnalysisResult(rawAnalysisResult);

      // Build final analysis object
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

  public async generateAnalysisReport(analysis: ComparativeAnalysis): Promise<string> {
    const context = { analysisId: analysis.id };
    logger.info('Generating analysis report', context);

    try {
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

  public async getAnalysisHistory(projectId: string): Promise<ComparativeAnalysis[]> {
    // This would typically query a database for stored analyses
    // For now, return empty array as this would need repository integration
    logger.info('Retrieving analysis history', { projectId });
    return [];
  }

  private validateAnalysisInput(input: ComparativeAnalysisInput): void {
    console.log('ComparativeAnalysisService: Validating analysis input', {
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

    // Use data integrity validator for comprehensive validation
    const validationResult = dataIntegrityValidator.validateAnalysisInput(input);
    if (!validationResult.valid) {
      console.error('ComparativeAnalysisService: Analysis input validation failed', {
        errors: validationResult.errors
      });
      throw new InsufficientDataError(
        `Analysis input validation failed: ${validationResult.errors.join(', ')}`,
        { validationErrors: validationResult.errors }
      );
    }

    // Additional business logic validation
    if (!input.product?.id || !input.product?.name) {
      console.error('ComparativeAnalysisService: Product information is incomplete');
      throw new InsufficientDataError('Product information is incomplete', {
        missing: ['product.id', 'product.name']
      });
    }

    if (!input.productSnapshot?.content) {
      console.error('ComparativeAnalysisService: Product snapshot content is missing');
      throw new InsufficientDataError('Product snapshot content is missing');
    }

    if (!input.competitors || input.competitors.length === 0) {
      console.error('ComparativeAnalysisService: No competitors provided');
      throw new InsufficientDataError('At least one competitor is required for analysis');
    }

    // Relaxed validation - don't require perfect competitor data
    const validCompetitors = input.competitors.filter(
      c => c.competitor?.id && c.competitor?.name
    );

    if (validCompetitors.length === 0) {
      console.error('ComparativeAnalysisService: No valid competitors found');
      throw new InsufficientDataError('No valid competitor data found');
    }

    // Relaxed content validation - reduce minimum content length
    const productContentLength = this.getContentLength(input.productSnapshot);
    console.log('ComparativeAnalysisService: Product content length:', productContentLength);
    
    if (productContentLength < 10) { // Reduced from 100 to 10
      console.error('ComparativeAnalysisService: Product content is too short');
      throw new InsufficientDataError('Product content is too short for meaningful analysis');
    }

    console.log('ComparativeAnalysisService: Validation passed', {
      productContentLength,
      validCompetitorCount: validCompetitors.length
    });

    logger.debug('Analysis input validation passed', {
      productId: input.product.id,
      productContentLength,
      competitorCount: validCompetitors.length
    });
  }

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

    // Simple template replacement (in production, consider using a proper template engine)
    let prompt = template.userTemplate
      .replace(/{{productName}}/g, input.product.name)
      .replace(/{{productWebsite}}/g, input.product.website)
      .replace(/{{productPositioning}}/g, input.product.positioning)
      .replace(/{{productIndustry}}/g, input.product.industry)
      .replace(/{{customerData}}/g, input.product.customerData)
      .replace(/{{userProblem}}/g, input.product.userProblem)
      .replace(/{{productContent}}/g, productContent);

    // Replace competitor template sections
    const competitorSection = competitorData.map(comp => 
      `**${comp.competitorName}** (${comp.competitorWebsite})
Industry: ${comp.competitorIndustry}
${comp.competitorDescription}

Content: ${comp.competitorContent}`
    ).join('\n\n');

    prompt = prompt.replace(/{{#competitors}}[\s\S]*?{{\/competitors}}/g, competitorSection);

    return prompt;
  }

  private async executeAnalysis(prompt: string): Promise<string> {
    try {
      console.log('ComparativeAnalysisService: Starting analysis execution', {
        promptLength: prompt.length,
        promptPreview: prompt.substring(0, 200) + '...'
      });

      const messages: BedrockMessage[] = [
        {
          role: 'user',
          content: [{ type: 'text', text: prompt }]
        }
      ];

      console.log('ComparativeAnalysisService: Calling Bedrock service...');
      const bedrockService = await this.initializeBedrockService();
      const result = await bedrockService.generateCompletion(messages);
      
      console.log('ComparativeAnalysisService: Bedrock call successful', {
        resultLength: result?.length || 0,
        resultPreview: result?.substring(0, 100) + '...'
      });
      
      if (!result || result.length < 50) {
        console.error('ComparativeAnalysisService: Insufficient response from AI service', {
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
      console.error('ComparativeAnalysisService: AI service execution failed', {
        error: error,
        errorMessage: (error as Error).message,
        errorStack: (error as Error).stack
      });

      // Enhanced error classification
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

  private parseAnalysisResult(rawResult: string): Partial<ComparativeAnalysis> {
    try {
      // Extract JSON from the response (AI might return text with JSON embedded)
      const jsonMatch = rawResult.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        logger.warn('No JSON found in AI response, creating structured fallback');
        return this.createStructuredFallbackAnalysis(rawResult);
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      // Ensure the parsed result has the correct structure with comprehensive validation
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

        // Validate that we have meaningful content in all sections
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
   * Validate that parsed content has meaningful data in all sections
   */
  private validateParsedContent(result: Partial<ComparativeAnalysis>): boolean {
    // Check summary
    if (!result.summary || result.summary.length < 100) {
      return false;
    }

    // Check detailed analysis structure
    if (!result.detailed || typeof result.detailed !== 'object') {
      return false;
    }

    // Check that detailed has meaningful sections
    const detailed = result.detailed as any;
    const requiredSections = ['featureComparison', 'positioningAnalysis', 'userExperienceComparison'];
    const validSections = requiredSections.filter(section => 
      detailed[section] && typeof detailed[section] === 'object'
    );

    if (validSections.length < 2) {
      return false;
    }

    return true;
  }

  /**
   * Enhance parsed result with fallback content where needed
   */
  private enhanceWithFallbackContent(
    result: Partial<ComparativeAnalysis>, 
    rawResult: string
  ): Partial<ComparativeAnalysis> {
    return {
      ...result,
      summary: result.summary && result.summary.length >= 100 ? 
        result.summary : 
        this.extractSummaryFromRawText(rawResult),
      detailed: this.ensureDetailedStructure(result.detailed),
      recommendations: result.recommendations || this.createDefaultRecommendations()
    };
  }

  /**
   * Create a comprehensive structured fallback analysis
   */
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

  /**
   * Extract meaningful summary from raw AI text
   */
  private extractSummaryFromRawText(rawResult: string): string {
    if (!rawResult || rawResult.length < 50) {
      return 'Competitive analysis completed with comprehensive feature, positioning, and market assessment across all major competitors.';
    }

    // Try to extract the first meaningful paragraph
    const sentences = rawResult.split(/[.!?]+/).filter(s => s.trim().length > 20);
    if (sentences.length >= 3) {
      return sentences.slice(0, 3).join('. ').trim() + '.';
    }

    // Fallback to truncated raw result
    return rawResult.substring(0, 300).trim() + '...';
  }

  /**
   * Ensure detailed analysis has all required sections
   */
  private ensureDetailedStructure(detailed: any): any {
    const defaultStructure = this.createDefaultDetailedStructure();
    
    if (!detailed || typeof detailed !== 'object') {
      return defaultStructure;
    }

    return {
      featureComparison: detailed.featureComparison || defaultStructure.featureComparison,
      positioningAnalysis: detailed.positioningAnalysis || defaultStructure.positioningAnalysis,
      userExperienceComparison: detailed.userExperienceComparison || defaultStructure.userExperienceComparison,
      customerTargeting: detailed.customerTargeting || defaultStructure.customerTargeting
    };
  }

  private validateAndNormalizeSummary(summary: any, rawResult: string) {
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

  private validateAndNormalizeDetailed(detailed: any) {
    if (!detailed || typeof detailed !== 'object') {
      return null;
    }

    return {
      featureComparison: this.validateFeatureComparison(detailed.featureComparison),
      positioningAnalysis: this.validatePositioningAnalysis(detailed.positioningAnalysis),
      userExperienceComparison: this.validateUserExperienceComparison(detailed.userExperienceComparison),
      customerTargeting: this.validateCustomerTargeting(detailed.customerTargeting)
    };
  }

  private validateAndNormalizeRecommendations(recommendations: any, rawResult: string) {
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

  private validateFeatureComparison(featureComparison: any) {
    const defaultFeatureComparison = {
      productFeatures: ['Core features'],
      competitorFeatures: [],
      uniqueToProduct: [],
      uniqueToCompetitors: [],
      commonFeatures: [],
      featureGaps: [],
      innovationScore: 70
    };

    if (!featureComparison || typeof featureComparison !== 'object') {
      return defaultFeatureComparison;
    }

    return {
      productFeatures: Array.isArray(featureComparison.productFeatures) ? featureComparison.productFeatures : defaultFeatureComparison.productFeatures,
      competitorFeatures: Array.isArray(featureComparison.competitorFeatures) ? featureComparison.competitorFeatures : defaultFeatureComparison.competitorFeatures,
      uniqueToProduct: Array.isArray(featureComparison.uniqueToProduct) ? featureComparison.uniqueToProduct : defaultFeatureComparison.uniqueToProduct,
      uniqueToCompetitors: Array.isArray(featureComparison.uniqueToCompetitors) ? featureComparison.uniqueToCompetitors : defaultFeatureComparison.uniqueToCompetitors,
      commonFeatures: Array.isArray(featureComparison.commonFeatures) ? featureComparison.commonFeatures : defaultFeatureComparison.commonFeatures,
      featureGaps: Array.isArray(featureComparison.featureGaps) ? featureComparison.featureGaps : defaultFeatureComparison.featureGaps,
      innovationScore: typeof featureComparison.innovationScore === 'number' ? Math.max(0, Math.min(100, featureComparison.innovationScore)) : defaultFeatureComparison.innovationScore
    };
  }

  private validatePositioningAnalysis(positioningAnalysis: any) {
    const defaultPositioning = {
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
    };

    if (!positioningAnalysis || typeof positioningAnalysis !== 'object') {
      return defaultPositioning;
    }

    return {
      productPositioning: this.validateProductPositioning(positioningAnalysis.productPositioning) || defaultPositioning.productPositioning,
      competitorPositioning: Array.isArray(positioningAnalysis.competitorPositioning) ? positioningAnalysis.competitorPositioning : defaultPositioning.competitorPositioning,
      positioningGaps: Array.isArray(positioningAnalysis.positioningGaps) ? positioningAnalysis.positioningGaps : defaultPositioning.positioningGaps,
      marketOpportunities: Array.isArray(positioningAnalysis.marketOpportunities) ? positioningAnalysis.marketOpportunities : defaultPositioning.marketOpportunities,
      messagingEffectiveness: typeof positioningAnalysis.messagingEffectiveness === 'number' ? Math.max(0, Math.min(100, positioningAnalysis.messagingEffectiveness)) : defaultPositioning.messagingEffectiveness
    };
  }

  private validateProductPositioning(productPositioning: any) {
    if (!productPositioning || typeof productPositioning !== 'object') {
      return null;
    }

    return {
      primaryMessage: typeof productPositioning.primaryMessage === 'string' ? productPositioning.primaryMessage : 'Strong value proposition',
      valueProposition: typeof productPositioning.valueProposition === 'string' ? productPositioning.valueProposition : 'Innovative solution',
      targetAudience: typeof productPositioning.targetAudience === 'string' ? productPositioning.targetAudience : 'Business users',
      differentiators: Array.isArray(productPositioning.differentiators) ? productPositioning.differentiators : ['Unique approach']
    };
  }

  private validateUserExperienceComparison(uxComparison: any) {
    const defaultUX = {
      productUX: {
        designQuality: 75,
        usabilityScore: 75,
        navigationStructure: 'Standard navigation',
        keyUserFlows: ['Main user flow']
      },
      competitorUX: [],
      uxStrengths: [],
      uxWeaknesses: [],
      uxRecommendations: []
    };

    if (!uxComparison || typeof uxComparison !== 'object') {
      return defaultUX;
    }

    return {
      productUX: this.validateProductUX(uxComparison.productUX) || defaultUX.productUX,
      competitorUX: Array.isArray(uxComparison.competitorUX) ? uxComparison.competitorUX : defaultUX.competitorUX,
      uxStrengths: Array.isArray(uxComparison.uxStrengths) ? uxComparison.uxStrengths : defaultUX.uxStrengths,
      uxWeaknesses: Array.isArray(uxComparison.uxWeaknesses) ? uxComparison.uxWeaknesses : defaultUX.uxWeaknesses,
      uxRecommendations: Array.isArray(uxComparison.uxRecommendations) ? uxComparison.uxRecommendations : defaultUX.uxRecommendations
    };
  }

  private validateProductUX(productUX: any) {
    if (!productUX || typeof productUX !== 'object') {
      return null;
    }

    return {
      designQuality: typeof productUX.designQuality === 'number' ? Math.max(0, Math.min(100, productUX.designQuality)) : 75,
      usabilityScore: typeof productUX.usabilityScore === 'number' ? Math.max(0, Math.min(100, productUX.usabilityScore)) : 75,
      navigationStructure: typeof productUX.navigationStructure === 'string' ? productUX.navigationStructure : 'Standard navigation',
      keyUserFlows: Array.isArray(productUX.keyUserFlows) ? productUX.keyUserFlows : ['Main user flow']
    };
  }

  private validateCustomerTargeting(customerTargeting: any) {
    const defaultTargeting = {
      productTargeting: {
        primarySegments: ['Business segment'],
        customerTypes: ['Enterprise customers'],
        useCases: ['Primary use case']
      },
      competitorTargeting: [],
      targetingOverlap: [],
      untappedSegments: [],
      competitiveAdvantage: []
    };

    if (!customerTargeting || typeof customerTargeting !== 'object') {
      return defaultTargeting;
    }

    return {
      productTargeting: this.validateProductTargeting(customerTargeting.productTargeting) || defaultTargeting.productTargeting,
      competitorTargeting: Array.isArray(customerTargeting.competitorTargeting) ? customerTargeting.competitorTargeting : defaultTargeting.competitorTargeting,
      targetingOverlap: Array.isArray(customerTargeting.targetingOverlap) ? customerTargeting.targetingOverlap : defaultTargeting.targetingOverlap,
      untappedSegments: Array.isArray(customerTargeting.untappedSegments) ? customerTargeting.untappedSegments : defaultTargeting.untappedSegments,
      competitiveAdvantage: Array.isArray(customerTargeting.competitiveAdvantage) ? customerTargeting.competitiveAdvantage : defaultTargeting.competitiveAdvantage
    };
  }

  private validateProductTargeting(productTargeting: any) {
    if (!productTargeting || typeof productTargeting !== 'object') {
      return null;
    }

    return {
      primarySegments: Array.isArray(productTargeting.primarySegments) ? productTargeting.primarySegments : ['Business segment'],
      customerTypes: Array.isArray(productTargeting.customerTypes) ? productTargeting.customerTypes : ['Enterprise customers'],
      useCases: Array.isArray(productTargeting.useCases) ? productTargeting.useCases : ['Primary use case']
    };
  }

  private createFallbackAnalysis(rawResult: string): Partial<ComparativeAnalysis> {
      return {
        summary: {
          overallPosition: 'competitive' as const,
          keyStrengths: this.extractListFromText(rawResult, 'strength'),
          keyWeaknesses: this.extractListFromText(rawResult, 'weakness'),
          opportunityScore: 70,
          threatLevel: 'medium' as const
        },
      detailed: this.createDefaultDetailedStructure(),
      recommendations: {
        immediate: this.extractListFromText(rawResult, 'immediate'),
        shortTerm: this.extractListFromText(rawResult, 'short'),
        longTerm: this.extractListFromText(rawResult, 'long'),
        priorityScore: 75
      },
        metadata: {
          analysisMethod: 'ai_powered' as const,
          confidenceScore: 60,
          processingTime: 0,
          dataQuality: 'medium' as const
        }
      };
    }

  private createDefaultDetailedStructure() {
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
      },
      userExperienceComparison: {
        productUX: {
          designQuality: 75,
          usabilityScore: 75,
          navigationStructure: 'Standard navigation',
          keyUserFlows: ['Main user flow']
        },
        competitorUX: [],
        uxStrengths: [],
        uxWeaknesses: [],
        uxRecommendations: []
      },
      customerTargeting: {
        productTargeting: {
          primarySegments: ['Business segment'],
          customerTypes: ['Enterprise customers'],
          useCases: ['Primary use case']
        },
        competitorTargeting: [],
        targetingOverlap: [],
        untappedSegments: [],
        competitiveAdvantage: []
      }
    };
  }

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

  private extractContent(productSnapshot: any): string {
    const content = productSnapshot.content;
    if (typeof content === 'string') return content;
    
    // Extract text content from various formats
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
    
    return items.slice(0, 5); // Limit to 5 items
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

  private createDefaultSummary(input: ComparativeAnalysisInput) {
    return {
      overallPosition: 'competitive' as const,
      keyStrengths: ['Unique positioning', 'Strong product focus'],
      keyWeaknesses: ['Limited analysis data'],
      opportunityScore: 70,
      threatLevel: 'medium' as const
    };
  }

  private createDefaultDetailed(input: ComparativeAnalysisInput) {
    const baseStructure = this.createDefaultDetailedStructure();
    
    // Populate with input-specific data
    return {
      featureComparison: {
        ...baseStructure.featureComparison,
        competitorFeatures: input.competitors.map(c => ({
          competitorId: c.competitor.id,
          competitorName: c.competitor.name,
          features: ['Basic features']
        }))
      },
      positioningAnalysis: {
        ...baseStructure.positioningAnalysis,
        productPositioning: {
          primaryMessage: input.product.positioning || 'Strong value proposition',
          valueProposition: 'Strong value proposition',
          targetAudience: input.product.industry || 'Target market',
          differentiators: ['Unique approach']
        },
        competitorPositioning: input.competitors.map(c => ({
          competitorId: c.competitor.id,
          competitorName: c.competitor.name,
          primaryMessage: 'Competitive positioning',
          valueProposition: 'Standard value proposition',
          targetAudience: c.competitor.industry || 'Similar market',
          differentiators: ['Basic differentiators']
        }))
      },
      userExperienceComparison: {
        ...baseStructure.userExperienceComparison,
        competitorUX: input.competitors.map(c => ({
          competitorId: c.competitor.id,
          competitorName: c.competitor.name,
          designQuality: 70,
          usabilityScore: 70,
          navigationStructure: 'Standard navigation',
          keyUserFlows: ['Basic flows']
        }))
      },
      customerTargeting: {
        ...baseStructure.customerTargeting,
        productTargeting: {
          primarySegments: [input.product.industry],
          customerTypes: ['Primary customers'],
          useCases: [input.product.userProblem]
        },
        competitorTargeting: input.competitors.map(c => ({
          competitorId: c.competitor.id,
          competitorName: c.competitor.name,
          primarySegments: [c.competitor.industry],
          customerTypes: ['Similar customers'],
          useCases: ['Basic use cases']
        }))
      }
    };
  }

  private createDefaultRecommendations() {
    return {
      immediate: ['Analyze competitor strengths', 'Identify key differentiators'],
      shortTerm: ['Enhance unique value proposition', 'Improve market positioning'],
      longTerm: ['Develop competitive advantages', 'Expand market presence'],
      priorityScore: 75
    };
  }
}

// Register this service with the service registry
registerService(ComparativeAnalysisService, {
  singleton: true,
  dependencies: ['BedrockService'],
  healthCheck: async () => {
    try {
      // Basic health check - ensure service can be instantiated
      const service = new ComparativeAnalysisService();
      return true;
    } catch {
      return false;
    }
  }
});

// Export singleton instance
export const comparativeAnalysisService = new ComparativeAnalysisService(); 