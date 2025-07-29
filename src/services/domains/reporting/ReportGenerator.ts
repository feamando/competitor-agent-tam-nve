/**
 * Enhanced ReportGenerator Sub-service - Task 5.2
 * Migrates comparative report generation from ComparativeReportService
 * Focuses exclusively on markdown report generation with memory optimization
 */

import { createId } from '@paralleldrive/cuid2';
import Handlebars from 'handlebars';
import { logger, generateCorrelationId, trackBusinessEvent, trackErrorWithCorrelation } from '@/lib/logger';
import { BedrockService } from '../../bedrock/bedrock.service';
import { BedrockMessage } from '../../bedrock/types';
import { UserExperienceAnalyzer, UXAnalysisResult } from '../../analysis/userExperienceAnalyzer';
import { createStreamProcessor } from '@/lib/dataProcessing/streamProcessor';
import { memoryManager } from '@/lib/monitoring/memoryMonitoring';
import { 
  ComparativeReport, 
  ComparativeReportSection, 
  ComparativeReportMetadata, 
  ReportGenerationOptions, 
  ReportGenerationResult,
  ReportTemplate,
  ComparativeReportError,
  ReportGenerationError,
  TemplateNotFoundError,
  REPORT_TEMPLATES,
  ComparativeReportTemplate,
  ComparativeReportSectionTemplate,
  ReportChart,
  ReportTable
} from '@/types/comparativeReport';
import { ComparativeAnalysis } from '@/types/analysis';
import { Product, ProductSnapshot } from '@/types/product';
import { 
  getReportTemplate, 
  listAvailableTemplates,
  COMPREHENSIVE_TEMPLATE 
} from '../../reports/comparativeReportTemplates';
import {
  IReportGenerator,
  ComparativeReportRequest,
  ComparativeReportResponse,
  IntelligentReportRequest,
  IntelligentReportResponse,
  InitialReportRequest,
  InitialReportResponse,
  ReportGeneratorConfig
} from './types';

/**
 * Enhanced ReportGenerator Sub-service - Task 5.2
 * Migrates comparative report generation from ComparativeReportService
 * Focuses exclusively on markdown report generation with memory optimization
 */
export class ReportGenerator implements IReportGenerator {
  private bedrockService: BedrockService | null = null;
  private uxAnalyzer: UserExperienceAnalyzer;
  private config: ReportGeneratorConfig;
  private performanceMetrics: Map<string, number[]> = new Map();

  constructor(config: ReportGeneratorConfig) {
    this.config = config;
    this.uxAnalyzer = new UserExperienceAnalyzer();
    
    logger.info('ReportGenerator initialized', {
      service: 'ReportGenerator',
      markdownOnly: config.markdownOnly,
      maxConcurrency: config.maxConcurrency,
      timeout: config.timeout
    });
  }

  /**
   * Generate comparative report - migrated from ComparativeReportService.generateComparativeReport()
   */
  async generateComparativeReport(request: ComparativeReportRequest): Promise<ComparativeReportResponse> {
    const startTime = Date.now();
    const correlationId = generateCorrelationId();
    const context = {
      correlationId,
      taskId: request.taskId,
      projectId: request.projectId,
      analysisId: request.analysis?.id,
      productName: request.product?.name,
      reportTemplate: request.options?.template || REPORT_TEMPLATES.COMPREHENSIVE
    };

    try {
      // MEMORY OPTIMIZATION: Take snapshot at start
      const initialMemory = process.memoryUsage();
      
      logger.info('Starting comparative report generation', context);

      // Validate request for comparative reports only (Task 5.2)
      if (request.reportType !== 'comparative') {
               throw new Error('Only comparative reports are supported in unified ReportingService');
      }

      // Get report template
      const template = this.getTemplate(request.options?.template || REPORT_TEMPLATES.COMPREHENSIVE);
      
      // Build report context from analysis
      const reportContext = this.buildReportContext(
        request.analysis!, 
        request.product!, 
        request.productSnapshot!
      );
      
      // MEMORY OPTIMIZATION: Generate report sections using stream processing
      const streamProcessor = createStreamProcessor({
        correlationId,
        operationName: 'report-section-generation',
        batchSize: 1,  // Process one section at a time
        concurrency: 2  // Allow some concurrency, but not too much
      });
      
      // Use stream processing for section generation
      const sections = await streamProcessor.processArray(
        template.sectionTemplates,
        async (sectionTemplate) => {
          const section = await this.generateSection(
            sectionTemplate,
            reportContext,
            request.options || {}
          );
          
          // Clear any large temporary objects after each section is generated
          if (global.gc) global.gc();
          
          return section;
        }
      );
      
      // Build complete report
      const report = this.buildComparativeReport(
        request.analysis!,
        request.product!,
        template,
        sections,
        reportContext,
        request.options || {}
      );

      // Calculate generation metrics
      const generationTime = Date.now() - startTime;
      const tokensUsed = this.estimateTokenUsage(report);
      const cost = this.calculateCost(tokensUsed);
      
      // MEMORY OPTIMIZATION: Take snapshot at end and log memory usage
      const finalMemory = memoryManager.takeSnapshot('report-generation-end');
      const memoryUsed = finalMemory.heapUsed - initialMemory.heapUsed;
      
      logger.info('Comparative report generated successfully', {
        ...context,
        generationTime,
        sectionsCount: sections.length,
        tokensUsed,
        memoryUsedMB: Math.round(memoryUsed / 1024 / 1024)
      });

      trackBusinessEvent('comparative_report_generated', {
        correlationId,
        projectId: request.projectId,
        generationTime,
        sectionsCount: sections.length,
        memoryUsedMB: Math.round(memoryUsed / 1024 / 1024)
      });

      return {
        success: true,
        taskId: request.taskId!,
        projectId: request.projectId,
        report,
        processingTime: generationTime,
        tokensUsed,
        cost,
        warnings: [],
        errors: [],
        dataFreshness: {
          overallStatus: 'FRESH', // TODO: Integrate with data freshness service
          lastUpdated: new Date()
        },
        correlationId
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error('Failed to generate comparative report', error as Error, context);
      
      trackErrorWithCorrelation(
        error as Error,
        correlationId,
        'comparative_report_generation_failed',
        context
      );

      return {
        success: false,
        taskId: request.taskId!,
        projectId: request.projectId,
        processingTime,
        error: (error as Error).message,
        dataFreshness: {
          overallStatus: 'STALE',
          lastUpdated: new Date()
        },
        correlationId
      };
    }
  }

  /**
   * Generate intelligent report - enhanced comparative with AI insights
   */
  async generateIntelligentReport(request: IntelligentReportRequest): Promise<IntelligentReportResponse> {
    const startTime = Date.now();
    const correlationId = generateCorrelationId();

    try {
      logger.info('Generating intelligent report', {
        correlationId,
        projectId: request.projectId,
        enhanceWithAI: request.enhanceWithAI
      });

      // First generate base comparative report
      const baseReportRequest: ComparativeReportRequest = {
        taskId: request.taskId,
        projectId: request.projectId,
        reportType: 'comparative',
        analysis: request.analysis,
        product: request.product,
        productSnapshot: request.productSnapshot,
        options: {
          ...request.options,
          template: request.options?.template || 'comprehensive'
        }
      };

      const baseResult = await this.generateComparativeReport(baseReportRequest);
      
      if (!baseResult.success) {
        throw new Error(`Failed to generate base report: ${baseResult.error}`);
      }

      // Enhance with AI if requested
      let enhancedContent = '';
      if (request.enhanceWithAI && baseResult.report) {
        enhancedContent = await this.generateEnhancedReportContent(
          request.analysis!.id,
          this.getTemplate(request.options?.template || REPORT_TEMPLATES.COMPREHENSIVE),
          request.options || {}
        );
      }

      const processingTime = Date.now() - startTime;

      return {
        success: true,
        report: baseResult.report!,
        taskId: request.taskId!,
        projectId: request.projectId,
        dataFreshnessIndicators: {
          overallStatus: 'FRESH',
          lastDataUpdate: new Date(),
          staleSources: []
        },
        competitiveActivityAlerts: [], // TODO: Implement competitive monitoring
        marketChangeDetection: {
          significantChanges: [],
          trendShifts: [],
          newCompetitors: []
        },
        actionableInsights: this.extractActionableInsights(baseResult.report!),
        enhancedContent,
        processingTime,
        correlationId
      };

    } catch (error) {
      logger.error('Failed to generate intelligent report', error as Error, {
        correlationId,
        projectId: request.projectId
      });

      throw new ReportGenerationError(
        `Failed to generate intelligent report: ${(error as Error).message}`,
        correlationId,
        { projectId: request.projectId }
      );
    }
  }

  /**
   * Generate initial report for new projects
   */
  async generateInitialReport(request: InitialReportRequest): Promise<InitialReportResponse> {
    const startTime = Date.now();
    const correlationId = generateCorrelationId();

    try {
      logger.info('Generating initial report', {
        correlationId,
        projectId: request.projectId,
        fallbackToPartialData: request.options?.fallbackToPartialData
      });

      // TODO: Implement initial report generation logic
      // This would involve project setup, data validation, and basic report generation
      
      const processingTime = Date.now() - startTime;

      return {
        success: true,
        taskId: request.taskId!,
        projectId: request.projectId,
        reportId: createId(),
        initialSetupComplete: true,
        dataCompletenessScore: 85, // Placeholder
        processingTime,
        correlationId
      };

    } catch (error) {
      logger.error('Failed to generate initial report', error as Error, {
        correlationId,
        projectId: request.projectId
      });

      throw new ReportGenerationError(
        `Failed to generate initial report: ${(error as Error).message}`,
        correlationId,
        { projectId: request.projectId }
      );
    }
  }

  /**
   * Initialize Bedrock service for AI operations
   */
  private async initializeBedrockService(): Promise<BedrockService> {
    if (!this.bedrockService) {
      this.bedrockService = new BedrockService();
      await this.bedrockService.initialize();
    }
    return this.bedrockService;
  }

  /**
   * Get report template - migrated from ComparativeReportService
   */
  private getTemplate(templateName: string): ComparativeReportTemplate {
    try {
      return getReportTemplate(templateName);
    } catch (error) {
      logger.error('Failed to get report template', error as Error, { templateName });
      throw new TemplateNotFoundError(`Template not found: ${templateName}`);
    }
  }

  /**
   * Build report context from analysis - migrated from ComparativeReportService
   */
  private buildReportContext(
    analysis: ComparativeAnalysis,
    product: Product,
    productSnapshot: ProductSnapshot
  ): ReportContext {
    // Extract competitive intelligence
    const competitorCount = analysis.competitors?.length || 0;
    const overallPosition = analysis.competitivePosition?.marketPosition || 'Unknown';
    const confidenceScore = analysis.metadata?.confidenceScore || 0;

    // Extract key insights
    const keyStrengths = analysis.keyFindings?.strengths || [];
    const keyWeaknesses = analysis.keyFindings?.weaknesses || [];
    const immediateRecommendations = analysis.strategicRecommendations?.immediate || [];

    // Extract feature analysis
    const productFeatures = productSnapshot.features || [];
    const competitorFeatures = analysis.competitors?.map(comp => ({
      competitorName: comp.name,
      features: comp.features || []
    })) || [];

    // Calculate derived metrics
    const uniqueToProduct = this.calculateUniqueFeatures(productFeatures, competitorFeatures);
    const featureGaps = this.calculateFeatureGaps(productFeatures, competitorFeatures);
    const innovationScore = this.calculateInnovationScore(analysis);

    return {
      productName: product.name,
      competitorCount,
      overallPosition,
      opportunityScore: analysis.opportunityScore || 0,
      threatLevel: analysis.threatLevel || 'Medium',
      confidenceScore,
      keyStrengths,
      keyWeaknesses,
      immediateRecommendations,
      productFeatures,
      competitorFeatures,
      uniqueToProduct,
      featureGaps,
      innovationScore,
      primaryMessage: analysis.messaging?.primaryMessage || '',
      valueProposition: analysis.messaging?.valueProposition || '',
      targetAudience: analysis.messaging?.targetAudience || '',
      differentiators: analysis.messaging?.differentiators || [],
      competitorPositioning: analysis.competitors?.map(comp => ({
        competitorName: comp.name,
        primaryMessage: comp.messaging?.primaryMessage || '',
        valueProposition: comp.messaging?.valueProposition || '',
        targetAudience: comp.messaging?.targetAudience || ''
      })) || [],
      marketOpportunities: analysis.marketOpportunities || [],
      messagingEffectiveness: analysis.messaging?.effectivenessScore || 0,
      designQuality: productSnapshot.uxMetrics?.designQuality || 0,
      usabilityScore: productSnapshot.uxMetrics?.usabilityScore || 0,
      navigationStructure: productSnapshot.uxMetrics?.navigationStructure || '',
      keyUserFlows: productSnapshot.uxMetrics?.keyUserFlows || [],
      competitorUX: analysis.competitors?.map(comp => ({
        competitorName: comp.name,
        designQuality: comp.uxMetrics?.designQuality || 0,
        usabilityScore: comp.uxMetrics?.usabilityScore || 0,
        navigationStructure: comp.uxMetrics?.navigationStructure || ''
      })) || [],
      uxStrengths: analysis.uxAnalysis?.strengths || [],
      uxWeaknesses: analysis.uxAnalysis?.weaknesses || [],
      uxRecommendations: analysis.uxAnalysis?.recommendations || [],
      primarySegments: analysis.targetMarket?.primarySegments || [],
      customerTypes: analysis.targetMarket?.customerTypes || [],
      useCases: analysis.targetMarket?.useCases || [],
      competitorTargeting: analysis.competitors?.map(comp => ({
        competitorName: comp.name,
        primarySegments: comp.targetMarket?.primarySegments || [],
        customerTypes: comp.targetMarket?.customerTypes || []
      })) || [],
      targetingOverlap: analysis.targetMarket?.competitorOverlap || [],
      untappedSegments: analysis.targetMarket?.untappedSegments || [],
      competitiveAdvantage: analysis.competitiveAdvantages || [],
      priorityScore: analysis.strategicRecommendations?.priorityScore || 0,
      immediateActions: analysis.strategicRecommendations?.immediate || [],
      shortTermActions: analysis.strategicRecommendations?.shortTerm || [],
      longTermActions: analysis.strategicRecommendations?.longTerm || []
    };
  }

  /**
   * Generate individual report section - migrated from ComparativeReportService
   */
  private async generateSection(
    sectionTemplate: ComparativeReportSectionTemplate,
    context: ReportContext,
    options: ReportGenerationOptions
  ): Promise<ComparativeReportSection> {
    const sectionId = createId();
    
    // Track memory usage for this section if available
    const memoryBefore = process.memoryUsage();
    
    try {
      // Compile the section template with the context
      const compiledTemplate = Handlebars.compile(sectionTemplate.template);
      const content = compiledTemplate(context);
      
      return {
        id: sectionId,
        title: sectionTemplate.title,
        content,
        type: sectionTemplate.type,
        order: sectionTemplate.order
      };
    } finally {
      // Log memory usage if in debug mode
      if (process.env.NODE_ENV === 'development') {
        const memoryAfter = process.memoryUsage();
        const memoryDiff = memoryAfter.heapUsed - memoryBefore.heapUsed;
        logger.debug('Section memory usage', {
          sectionId,
          memoryDiff: `${Math.round(memoryDiff / 1024 / 1024 * 100) / 100}MB`
        });
      }
    }
  }

  /**
   * Build complete comparative report - migrated from ComparativeReportService
   */
  private buildComparativeReport(
    analysis: ComparativeAnalysis,
    product: Product,
    template: ComparativeReportTemplate,
    sections: ComparativeReportSection[],
    context: ReportContext,
    options: ReportGenerationOptions
  ): ComparativeReport {
    const reportId = createId();
    const now = new Date();

    const metadata: ComparativeReportMetadata = {
      productName: product.name,
      productUrl: product.website,
      competitorCount: context.competitorCount,
      analysisDate: analysis.analysisDate,
      reportGeneratedAt: now,
      analysisId: analysis.id,
      analysisMethod: analysis.metadata.analysisMethod,
      confidenceScore: analysis.metadata.confidenceScore,
      dataQuality: analysis.metadata.dataQuality,
      reportVersion: '1.0',
      focusAreas: template.focusAreas,
      analysisDepth: template.analysisDepth
    };

    return {
      id: reportId,
      title: this.generateReportTitle(product.name, template.name),
      description: this.generateReportDescription(product.name, context.competitorCount, template.description),
      projectId: product.projectId,
      productId: product.id,
      analysisId: analysis.id,
      metadata,
      sections,
      executiveSummary: this.extractExecutiveSummary(sections),
      keyFindings: this.extractKeyFindings(context),
      strategicRecommendations: {
        immediate: context.immediateActions,
        shortTerm: context.shortTermActions,
        longTerm: context.longTermActions,
        priorityScore: context.priorityScore
      },
      competitiveIntelligence: {
        marketPosition: context.overallPosition,
        keyThreats: this.extractKeyThreats(context),
        opportunities: context.marketOpportunities,
        competitiveAdvantages: context.competitiveAdvantage
      },
      createdAt: now,
      updatedAt: now,
      status: 'completed',
      format: 'markdown' // Task 5.2: Focus exclusively on markdown format
    };
  }

  /**
   * Generate enhanced report content using AI
   */
  private async generateEnhancedReportContent(
    analysisId: string,
    template: ReportTemplate,
    options: ReportGenerationOptions = {}
  ): Promise<string> {
    const context = { analysisId, template };

    try {
      logger.info('Generating enhanced report content with AI', context);

      const prompt = this.buildEnhancedReportPrompt(template, options);
      const messages: BedrockMessage[] = [
        {
          role: 'user',
          content: [{ type: 'text', text: prompt }]
        }
      ];
      const bedrockService = await this.initializeBedrockService();
      const enhancedContent = await bedrockService.generateCompletion(messages);

      logger.info('Enhanced report content generated successfully', {
        ...context,
        contentLength: enhancedContent.length
      });

      return enhancedContent;

    } catch (error) {
      logger.error('Failed to generate enhanced report content', error as Error, context);
      throw new ReportGenerationError(
        `Failed to generate enhanced report content: ${(error as Error).message}`,
        undefined,
        { analysisId, template }
      );
    }
  }

  // Helper methods for report building
  private calculateUniqueFeatures(productFeatures: string[], competitorFeatures: Array<{competitorName: string; features: string[]}>): string[] {
    const allCompetitorFeatures = competitorFeatures.flatMap(comp => comp.features);
    return productFeatures.filter(feature => !allCompetitorFeatures.includes(feature));
  }

  private calculateFeatureGaps(productFeatures: string[], competitorFeatures: Array<{competitorName: string; features: string[]}>): string[] {
    const allCompetitorFeatures = competitorFeatures.flatMap(comp => comp.features);
    return allCompetitorFeatures.filter(feature => !productFeatures.includes(feature));
  }

  private calculateInnovationScore(analysis: ComparativeAnalysis): number {
    // Simple innovation score calculation based on unique features and market position
    return Math.min(100, (analysis.innovationIndex || 0) * 100);
  }

  private generateReportTitle(productName: string, templateName: string): string {
    return `Comparative Analysis Report: ${productName} - ${templateName}`;
  }

  private generateReportDescription(productName: string, competitorCount: number, templateDescription: string): string {
    return `${templateDescription} - Analysis of ${productName} against ${competitorCount} competitors`;
  }

  private extractExecutiveSummary(sections: ComparativeReportSection[]): string {
    const summarySection = sections.find(section => section.type === 'executive_summary');
    return summarySection?.content || 'Executive summary not available';
  }

  private extractKeyFindings(context: ReportContext): string[] {
    return [
      ...context.keyStrengths.map(strength => `Strength: ${strength}`),
      ...context.keyWeaknesses.map(weakness => `Weakness: ${weakness}`)
    ];
  }

  private extractKeyThreats(context: ReportContext): string[] {
    // Extract threats from competitor positioning and market analysis
    return context.competitorPositioning
      .filter(comp => comp.primaryMessage.toLowerCase().includes('threat'))
      .map(comp => `${comp.competitorName}: ${comp.primaryMessage}`);
  }

  private extractActionableInsights(report: ComparativeReport): string[] {
    return [
      ...report.strategicRecommendations.immediate,
      ...report.strategicRecommendations.shortTerm.slice(0, 3), // Take first 3 short-term actions
      ...report.competitiveIntelligence.opportunities.slice(0, 2) // Take first 2 opportunities
    ];
  }

  private buildEnhancedReportPrompt(template: ReportTemplate, options: ReportGenerationOptions): string {
    return `Generate enhanced insights for a ${template} comparative analysis report. 
    Focus on actionable recommendations and strategic insights. 
    Include market positioning analysis and competitive advantages.
    ${options.includeCharts ? 'Include suggestions for data visualizations.' : ''}
    Provide content in markdown format only.`;
  }

  private estimateTokenUsage(report: ComparativeReport): number {
    // Simple token estimation based on content length
    const totalContent = report.sections.reduce((acc, section) => acc + section.content.length, 0);
    return Math.ceil(totalContent / 4); // Rough estimate: 4 characters per token
  }

  private calculateCost(tokensUsed: number): number {
    // Simple cost calculation - would need to be updated with actual pricing
    const costPerToken = 0.00002; // Example cost
    return tokensUsed * costPerToken;
  }
} 