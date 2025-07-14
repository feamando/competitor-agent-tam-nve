/**
 * Smart AI Service - Phase AI-1 Implementation
 * Integration of Claude AI with Smart Scheduling for fresh data guarantees
 * 
 * Features:
 * - Data freshness-aware AI analysis
 * - Smart scheduling integration for fresh data guarantee
 * - Enhanced context with scheduling metadata
 * - Intelligent analysis workflows
 */

import { logger, generateCorrelationId, trackErrorWithCorrelation, trackPerformance } from '@/lib/logger';
import { SmartSchedulingService, ProjectFreshnessStatus } from './smartSchedulingService';
import { BedrockService } from './bedrock/bedrock.service';
import { ConversationManager } from '@/lib/chat/conversation';
import prisma from '@/lib/prisma';

// Smart AI interfaces
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

export class SmartAIService {
  private smartScheduler: SmartSchedulingService;
  private bedrockService: BedrockService | null = null;
  private conversationManager: ConversationManager;

  constructor() {
    this.smartScheduler = new SmartSchedulingService();
    this.conversationManager = new ConversationManager();
  }

  /**
   * Initialize the Bedrock service with stored credentials
   */
  private async initializeBedrockService(): Promise<BedrockService> {
    if (!this.bedrockService) {
      try {
        // Try to create with stored credentials first
        this.bedrockService = await BedrockService.createWithStoredCredentials('anthropic');
      } catch (error) {
        logger.warn('Failed to initialize with stored credentials, falling back to environment variables', { error });
        // Fallback to traditional constructor with environment variables
        this.bedrockService = new BedrockService({}, 'anthropic');
      }
    }
    return this.bedrockService;
  }

  /**
   * Main smart AI analysis method with fresh data guarantee
   * Phase AI-1 core implementation
   */
  public async analyzeWithSmartScheduling(request: SmartAIAnalysisRequest): Promise<SmartAIAnalysisResponse> {
    const correlationId = generateCorrelationId();
    const context = { projectId: request.projectId, correlationId, operation: 'smartAIAnalysis' };

    try {
      logger.info('Smart AI analysis started', {
        ...context,
        analysisType: request.analysisType,
        forceFreshData: request.forceFreshData
      });

      // Step 1: Check data freshness using smart scheduling
      const freshnessCheck = await this.smartScheduler.getFreshnessStatus(request.projectId);
      let scrapingTriggered = false;

      // Step 2: Trigger scraping if needed for fresh data guarantee
      if (request.forceFreshData || freshnessCheck.overallStatus !== 'FRESH') {
        logger.info('Triggering smart scheduling for fresh data', {
          ...context,
          freshnessStatus: freshnessCheck.overallStatus,
          forceFreshData: request.forceFreshData
        });

        const scrapingResult = await this.smartScheduler.checkAndTriggerScraping(request.projectId);
        scrapingTriggered = scrapingResult.triggered;

        if (scrapingResult.triggered) {
          // Wait a moment for scraping to complete
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Get updated freshness status
          const updatedFreshness = await this.smartScheduler.getFreshnessStatus(request.projectId);
          
          logger.info('Smart scheduling completed for AI analysis', {
            ...context,
            tasksExecuted: scrapingResult.tasksExecuted,
            updatedFreshness: updatedFreshness.overallStatus
          });
        }
      }

      // Step 3: Get final freshness status for analysis
      const finalFreshness = await this.smartScheduler.getFreshnessStatus(request.projectId);

      // Step 4: Generate enhanced AI analysis with fresh data context
      const analysis = await this.generateEnhancedAnalysis(request, finalFreshness, correlationId);

      const response: SmartAIAnalysisResponse = {
        analysis,
        dataFreshness: finalFreshness,
        analysisMetadata: {
          correlationId,
          analysisType: request.analysisType,
          dataFreshGuaranteed: finalFreshness.overallStatus === 'FRESH',
          scrapingTriggered,
          analysisTimestamp: new Date(),
          contextUsed: request.context || {}
        },
        recommendations: this.extractRecommendations(analysis)
      };

      logger.info('Smart AI analysis completed', {
        ...context,
        dataFreshGuaranteed: response.analysisMetadata.dataFreshGuaranteed,
        analysisLength: analysis.length,
        recommendationsCount: response.recommendations ? 
          response.recommendations.immediate.length + response.recommendations.longTerm.length : 0
      });

      return response;

    } catch (error) {
      trackErrorWithCorrelation(
        error as Error,
        'analyzeWithSmartScheduling',
        correlationId,
        {
          ...context,
          service: 'SmartAIService',
          method: 'analyzeWithSmartScheduling',
          analysisType: request.analysisType
        }
      );
      throw error;
    }
  }

  /**
   * Setup auto AI analysis for newly created projects
   * Phase AI-2 preparation
   */
  public async setupAutoAnalysis(projectId: string, config: SmartAISetupConfig): Promise<void> {
    const correlationId = generateCorrelationId();
    const context = { projectId, correlationId, operation: 'setupAutoAnalysis' };

    try {
      logger.info('Setting up auto AI analysis', {
        ...context,
        config
      });

      // Store configuration in project metadata (use description field for metadata)
      const metadataString = JSON.stringify({
        aiAnalysisConfig: config,
        autoAnalysisEnabled: true,
        setupTimestamp: new Date().toISOString(),
        correlationId,
        existingDescription: (await prisma.project.findUnique({
          where: { id: projectId },
          select: { description: true }
        }))?.description || ''
      });

      await prisma.project.update({
        where: { id: projectId },
        data: {
          description: metadataString
        }
      });

      // If auto-trigger is enabled, perform initial analysis
      if (config.autoTrigger) {
        logger.info('Triggering initial auto analysis', context);
        
        for (const analysisType of config.analysisTypes) {
          await this.analyzeWithSmartScheduling({
            projectId,
            analysisType,
            forceFreshData: true,
            context: { setupReason: 'initial_auto_analysis' }
          });
        }
      }

      logger.info('Auto AI analysis setup completed', {
        ...context,
        analysisTypesCount: config.analysisTypes.length,
        initialAnalysisTriggered: config.autoTrigger
      });

    } catch (error) {
      trackErrorWithCorrelation(
        error as Error,
        'setupAutoAnalysis',
        correlationId,
        {
          ...context,
          service: 'SmartAIService',
          config
        }
      );
      throw error;
    }
  }

  /**
   * Generate enhanced AI analysis with freshness context
   */
  private async generateEnhancedAnalysis(
    request: SmartAIAnalysisRequest, 
    freshnessStatus: ProjectFreshnessStatus,
    correlationId: string
  ): Promise<string> {
    try {
      // Get project data
      const project = await prisma.project.findUnique({
        where: { id: request.projectId }
      });

      if (!project) {
        throw new Error(`Project ${request.projectId} not found`);
      }

      // Get products with snapshots separately
      const products = await prisma.product.findMany({
        where: { projectId: request.projectId },
        include: {
          snapshots: {
            orderBy: { createdAt: 'desc' },
            take: 5
          }
        }
      });

      // Get competitors with snapshots separately  
      const competitors = await prisma.competitor.findMany({
        where: {
          projects: {
            some: { id: request.projectId }
          }
        },
        include: {
          snapshots: {
            orderBy: { createdAt: 'desc' },
            take: 5
          }
        }
      });

      // Build enhanced prompt with freshness context
      const enhancedPrompt = this.buildEnhancedPrompt(
        { ...project, products, competitors },
        request.analysisType,
        freshnessStatus,
        request.context
      );

      // Generate analysis using Claude via Bedrock
      const bedrockService = await this.initializeBedrockService();
      const analysis = await bedrockService.generateCompletion([
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: enhancedPrompt
            }
          ]
        }
      ]);

      logger.info('Enhanced AI analysis generated', {
        projectId: request.projectId,
        correlationId,
        analysisType: request.analysisType,
        promptLength: enhancedPrompt.length,
        analysisLength: analysis.length,
        dataFreshness: freshnessStatus.overallStatus
      });

      return analysis;

    } catch (error) {
      logger.error('Error generating enhanced analysis', {
        correlationId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Build enhanced prompt with freshness and scheduling context
   */
  private buildEnhancedPrompt(
    project: any,
    analysisType: string,
    freshnessStatus: ProjectFreshnessStatus,
    additionalContext?: Record<string, any>
  ): string {
    const freshDataIndicators = this.buildDataFreshnessContext(freshnessStatus);
    const competitorData = this.buildCompetitorContext(project.competitors);
    const productData = this.buildProductContext(project.products);

    let basePrompt = '';

    switch (analysisType) {
      case 'competitive':
        basePrompt = `Perform a comprehensive competitive analysis for ${project.name}.`;
        break;
      case 'trend':
        basePrompt = `Analyze market trends and patterns for ${project.name}.`;
        break;
      case 'comprehensive':
        basePrompt = `Provide a comprehensive business intelligence analysis for ${project.name}.`;
        break;
    }

    return `${basePrompt}

**DATA FRESHNESS CONTEXT:**
${freshDataIndicators}

**PROJECT INFORMATION:**
- Name: ${project.name}
- Description: ${project.description || 'N/A'}
- Industry: ${project.industry || 'Not specified'}

**PRODUCT INFORMATION:**
${productData}

**COMPETITOR INFORMATION:**
${competitorData}

**ANALYSIS REQUIREMENTS:**
- Focus on actionable insights based on the fresh data available
- Highlight any data limitations due to freshness issues
- Provide both immediate and long-term recommendations
- Include competitive positioning analysis
- Identify market opportunities and threats

${additionalContext ? `**ADDITIONAL CONTEXT:**\n${JSON.stringify(additionalContext, null, 2)}` : ''}

Please provide a detailed analysis with clear sections for insights, recommendations, and strategic implications.`;
  }

  /**
   * Build data freshness context for AI prompt
   */
  private buildDataFreshnessContext(freshnessStatus: ProjectFreshnessStatus): string {
    const context = [`Overall Data Status: ${freshnessStatus.overallStatus}`];
    
    if (freshnessStatus.products.length > 0) {
      context.push('\n**Product Data Freshness:**');
      freshnessStatus.products.forEach(product => {
        const status = product.needsScraping ? 'STALE' : 'FRESH';
        const lastUpdate = product.lastSnapshot ? 
          `last updated ${product.daysSinceLastSnapshot} days ago` : 'no data available';
        context.push(`- ${product.name}: ${status} (${lastUpdate})`);
      });
    }

    if (freshnessStatus.competitors.length > 0) {
      context.push('\n**Competitor Data Freshness:**');
      freshnessStatus.competitors.forEach(competitor => {
        const status = competitor.needsScraping ? 'STALE' : 'FRESH';
        const lastUpdate = competitor.lastSnapshot ? 
          `last updated ${competitor.daysSinceLastSnapshot} days ago` : 'no data available';
        context.push(`- ${competitor.name}: ${status} (${lastUpdate})`);
      });
    }

    if (freshnessStatus.recommendedActions.length > 0) {
      context.push('\n**Recommended Actions:**');
      freshnessStatus.recommendedActions.forEach(action => {
        context.push(`- ${action}`);
      });
    }

    return context.join('\n');
  }

  /**
   * Build product context for AI analysis
   */
  private buildProductContext(products: any[]): string {
    if (!products || products.length === 0) {
      return 'No product data available.';
    }

    return products.map(product => {
      const latestSnapshot = product.snapshots && product.snapshots.length > 0 ? 
        product.snapshots[0] : null;
      
      return `- **${product.name}**
  - Website: ${product.website}
  - Positioning: ${product.positioning || 'Not specified'}
  - Industry: ${product.industry || 'Not specified'}
  - Latest Data: ${latestSnapshot ? 
    `${new Date(latestSnapshot.createdAt).toLocaleDateString()} (${latestSnapshot.content?.length || 0} chars)` : 
    'No snapshots available'}`;
    }).join('\n');
  }

  /**
   * Build competitor context for AI analysis
   */
  private buildCompetitorContext(competitors: any[]): string {
    if (!competitors || competitors.length === 0) {
      return 'No competitor data available.';
    }

    return competitors.map(competitor => {
      const latestSnapshot = competitor.snapshots && competitor.snapshots.length > 0 ? 
        competitor.snapshots[0] : null;
      
      return `- **${competitor.name}**
  - Website: ${competitor.website}
  - Industry: ${competitor.industry || 'Not specified'}
  - Latest Data: ${latestSnapshot ? 
    `${new Date(latestSnapshot.createdAt).toLocaleDateString()} (${latestSnapshot.content?.length || 0} chars)` : 
    'No snapshots available'}`;
    }).join('\n');
  }

  /**
   * Extract recommendations from AI analysis
   */
  private extractRecommendations(analysis: string): { immediate: string[]; longTerm: string[] } {
    // Simple regex-based extraction - can be enhanced with more sophisticated parsing
    const immediateRegex = /immediate\s+recommendations?[\:\s]*([\s\S]*?)(?=long[\-\s]?term|$)/;
    const longTermRegex = /long[\-\s]?term\s+recommendations?[\:\s]*([\s\S]*?)(?=\n\n|$)/;

    const immediateMatch = analysis.match(immediateRegex);
    const longTermMatch = analysis.match(longTermRegex);

    const parseRecommendations = (text: string): string[] => {
      if (!text) return [];
      return text
        .split(/\n/)
        .map(line => line.trim())
        .filter(line => line.length > 0 && (line.startsWith('-') || line.startsWith('•') || line.startsWith('*')))
        .map(line => line.replace(/^[-•*]\s*/, '').trim())
        .filter(line => line.length > 0);
    };

    return {
      immediate: parseRecommendations(immediateMatch?.[1] || ''),
      longTerm: parseRecommendations(longTermMatch?.[1] || '')
    };
  }

  /**
   * Cleanup resources
   */
  public async cleanup(): Promise<void> {
    await this.smartScheduler.cleanup();
  }
}

// Export singleton instance
export const smartAIService = new SmartAIService(); 