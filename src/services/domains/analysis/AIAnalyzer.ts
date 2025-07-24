/**
 * AIAnalyzer Sub-service - Task 2.2 Implementation
 * 
 * Migrates SmartAIService functionality while preserving critical Smart Scheduling integration.
 * This class maintains all AI analysis capabilities including:
 * - Data freshness-aware AI analysis
 * - Smart scheduling integration for fresh data guarantee
 * - Enhanced context with scheduling metadata
 * - Intelligent analysis workflows
 * - Auto analysis setup and configuration
 * 
 * CRITICAL: Preserves exact Smart Scheduling integration as identified in critical data flows
 */

import { logger, generateCorrelationId, trackErrorWithCorrelation, trackPerformance } from '@/lib/logger';
import { SmartSchedulingService, ProjectFreshnessStatus as OriginalProjectFreshnessStatus } from '@/services/smartSchedulingService';
import { BedrockService } from '@/services/bedrock/bedrock.service';
import { ConversationManager } from '@/lib/chat/conversation';
import prisma from '@/lib/prisma';

// Import types from unified analysis types
import {
  SmartAIAnalysisRequest,
  SmartAIAnalysisResponse,
  SmartAISetupConfig,
  ProjectFreshnessStatus,
  AnalysisError,
  AIServiceError
} from '../types/analysisTypes';

// Import the interface from the main AnalysisService
import { IAIAnalyzer } from '../AnalysisService';

/**
 * AIAnalyzer Implementation
 * 
 * CRITICAL: This class preserves the exact functionality and integration patterns
 * from SmartAIService, particularly the Smart Scheduling integration which is
 * identified as a critical data flow in the system health audit.
 */
class AIAnalyzer implements IAIAnalyzer {
  private smartSchedulingService: SmartSchedulingService; // CRITICAL DEPENDENCY
  private bedrockService: BedrockService;
  private conversationManager: ConversationManager;
  private logger = logger;

  constructor(
    smartSchedulingService: SmartSchedulingService,
    bedrockService: BedrockService,
    conversationManager: ConversationManager
  ) {
    // CRITICAL: Preserve exact dependency injection from SmartAIService
    this.smartSchedulingService = smartSchedulingService;
    this.bedrockService = bedrockService;
    this.conversationManager = conversationManager;

    logger.info('AIAnalyzer initialized with Smart Scheduling integration');
  }

  /**
   * Main smart AI analysis method with fresh data guarantee
   * CRITICAL: Preserves exact SmartAIService.analyzeWithSmartScheduling() implementation
   * 
   * This method MUST maintain the exact integration with SmartSchedulingService
   * as it represents a critical data flow identified in the system health audit.
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

      // CRITICAL: Step 1 - Check data freshness using smart scheduling (PRESERVE EXACTLY)
      const freshnessCheck = await this.smartSchedulingService.getFreshnessStatus(request.projectId);
      let scrapingTriggered = false;

      // CRITICAL: Step 2 - Trigger scraping if needed for fresh data guarantee (PRESERVE EXACTLY)
      if (request.forceFreshData || freshnessCheck.overallStatus !== 'FRESH') {
        logger.info('Triggering smart scheduling for fresh data', {
          ...context,
          freshnessStatus: freshnessCheck.overallStatus,
          forceFreshData: request.forceFreshData
        });

        const scrapingResult = await this.smartSchedulingService.checkAndTriggerScraping(request.projectId);
        scrapingTriggered = scrapingResult.triggered;

        if (scrapingResult.triggered) {
          // Wait a moment for scraping to complete (PRESERVE EXACT TIMING)
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Get updated freshness status (PRESERVE EXACTLY)
          const updatedFreshness = await this.smartSchedulingService.getFreshnessStatus(request.projectId);
          
          logger.info('Smart scheduling completed for AI analysis', {
            ...context,
            tasksExecuted: scrapingResult.tasksExecuted,
            updatedFreshness: updatedFreshness.overallStatus
          });
        }
      }

      // CRITICAL: Step 3 - Get final freshness status for analysis (PRESERVE EXACTLY)
      const finalFreshness = await this.smartSchedulingService.getFreshnessStatus(request.projectId);

      // CRITICAL: Step 4 - Generate enhanced AI analysis with fresh data context (PRESERVE EXACTLY)
      const analysis = await this.generateEnhancedAnalysis(request, this.convertProjectFreshnessStatus(finalFreshness), correlationId);

      const response: SmartAIAnalysisResponse = {
        analysis,
        dataFreshness: this.convertProjectFreshnessStatus(finalFreshness),
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
          service: 'AIAnalyzer',
          method: 'analyzeWithSmartScheduling',
          analysisType: request.analysisType
        }
      );
      throw error;
    }
  }

  /**
   * Setup auto AI analysis for newly created projects
   * CRITICAL: Preserves exact SmartAIService.setupAutoAnalysis() implementation
   */
  public async setupAutoAnalysis(projectId: string, config: SmartAISetupConfig): Promise<void> {
    const correlationId = generateCorrelationId();
    const context = { projectId, correlationId, operation: 'setupAutoAnalysis' };

    try {
      logger.info('Setting up auto AI analysis', {
        ...context,
        config
      });

      // CRITICAL: Store configuration in project metadata (PRESERVE EXACT PATTERN)
      // Use description field for metadata as done in original SmartAIService
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

      // CRITICAL: If auto-trigger is enabled, perform initial analysis (PRESERVE EXACTLY)
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
          service: 'AIAnalyzer',
          config
        }
      );
      throw error;
    }
  }

  /**
   * Validate data freshness for a project
   * Additional method to support the unified interface
   */
  public async validateDataFreshness(projectId: string): Promise<ProjectFreshnessStatus> {
    const correlationId = generateCorrelationId();
    
    try {
      logger.info('Validating data freshness', { projectId, correlationId });
      
      // Use SmartSchedulingService to get freshness status
      const freshnessStatus = await this.smartSchedulingService.getFreshnessStatus(projectId);
      
      logger.info('Data freshness validation completed', {
        projectId,
        correlationId,
        overallStatus: freshnessStatus.overallStatus,
        productCount: freshnessStatus.products.length,
        competitorCount: freshnessStatus.competitors.length
      });

      return this.convertProjectFreshnessStatus(freshnessStatus);
    } catch (error) {
      logger.error('Data freshness validation failed', error as Error, { projectId });
      throw new AnalysisError(
        'Failed to validate data freshness',
        'ANALYSIS_ERROR',
        { projectId, correlationId, originalError: error }
      );
    }
  }

  /**
   * Cleanup resources
   * CRITICAL: Preserves exact SmartAIService.cleanup() implementation
   */
  public async cleanup(): Promise<void> {
    logger.info('Cleaning up AIAnalyzer resources');
    
    try {
      // Cleanup SmartSchedulingService
      await this.smartSchedulingService.cleanup();
      
      logger.info('AIAnalyzer cleanup completed');
    } catch (error) {
      logger.error('AIAnalyzer cleanup failed', error as Error);
      throw error;
    }
  }

  // ============================================================================
  // PRIVATE METHODS (Preserve exact SmartAIService implementation)
  // ============================================================================

  /**
   * Convert original ProjectFreshnessStatus to unified type
   * Handles type compatibility between SmartSchedulingService and unified types
   */
  private convertProjectFreshnessStatus(original: OriginalProjectFreshnessStatus): ProjectFreshnessStatus {
    return {
      overallStatus: original.overallStatus === 'MISSING_DATA' ? 'MISSING' : original.overallStatus,
      products: original.products,
      competitors: original.competitors,
      recommendedActions: original.recommendedActions
    };
  }

  /**
   * Generate enhanced AI analysis with freshness context
   * CRITICAL: Preserves exact SmartAIService.generateEnhancedAnalysis() implementation
   */
  private async generateEnhancedAnalysis(
    request: SmartAIAnalysisRequest, 
    freshnessStatus: ProjectFreshnessStatus,
    correlationId: string
  ): Promise<string> {
    try {
      // CRITICAL: Get project data (PRESERVE EXACT PATTERN)
      const project = await prisma.project.findUnique({
        where: { id: request.projectId }
      });

      if (!project) {
        throw new Error(`Project ${request.projectId} not found`);
      }

      // CRITICAL: Get products with snapshots separately (PRESERVE EXACT PATTERN)
      const products = await prisma.product.findMany({
        where: { projectId: request.projectId },
        include: {
          snapshots: {
            orderBy: { createdAt: 'desc' },
            take: 5
          }
        }
      });

      // CRITICAL: Get competitors with snapshots separately (PRESERVE EXACT PATTERN)
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

      // CRITICAL: Build enhanced prompt with freshness context (PRESERVE EXACTLY)
      const enhancedPrompt = this.buildEnhancedPrompt(
        { ...project, products, competitors },
        request.analysisType,
        freshnessStatus,
        request.context
      );

      // CRITICAL: Generate analysis using Claude via Bedrock (PRESERVE EXACTLY)
      const analysis = await this.bedrockService.generateCompletion([
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
   * CRITICAL: Preserves exact SmartAIService.buildEnhancedPrompt() implementation
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

    // CRITICAL: Preserve exact prompt generation logic by analysis type
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

    // CRITICAL: Preserve exact prompt template structure
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
   * CRITICAL: Preserves exact SmartAIService.buildDataFreshnessContext() implementation
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
   * CRITICAL: Preserves exact SmartAIService.buildProductContext() implementation
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
   * CRITICAL: Preserves exact SmartAIService.buildCompetitorContext() implementation
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
   * CRITICAL: Preserves exact SmartAIService.extractRecommendations() implementation
   */
  private extractRecommendations(analysis: string): { immediate: string[]; longTerm: string[] } {
    // CRITICAL: Simple regex-based extraction - can be enhanced with more sophisticated parsing
    const immediateRegex = /immediate\s+recommendations?[\:\s]*([\s\S]*?)(?=long[\-\s]?term|$)/i;
    const longTermRegex = /long[\-\s]?term\s+recommendations?[\:\s]*([\s\S]*?)(?=\n\n|$)/i;

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
}

// Export the AIAnalyzer class
export { AIAnalyzer }; 