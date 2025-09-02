import { prisma } from '@/lib/prisma';
import { logger, generateCorrelationId, trackBusinessEvent } from '@/lib/logger';
import { dataAvailabilityScorer } from '../scoring/dataAvailabilityScorer';

export interface PartialDataSegment {
  category: 'PROJECT_INFO' | 'PRODUCT_DATA' | 'COMPETITOR_DATA' | 'SNAPSHOT_DATA' | 'MARKET_DATA';
  availability: 'COMPLETE' | 'PARTIAL' | 'LIMITED' | 'MISSING';
  quality: 'HIGH' | 'MEDIUM' | 'LOW' | 'POOR';
  content: any;
  confidence: number; // 0-100
  lastUpdated?: Date;
  limitations: string[];
  suggestions: string[];
}

export interface EmergencyReportContent {
  projectId: string;
  title: string;
  executiveSummary: string;
  availableDataSegments: PartialDataSegment[];
  keyInsights: string[];
  dataLimitations: string[];
  actionableRecommendations: string[];
  nextSteps: string[];
  dataGaps: {
    critical: string[];
    important: string[];
    optional: string[];
  };
  partialAnalysis?: {
    competitiveOverview?: string;
    marketPosition?: string;
    productInsights?: string;
    opportunityAreas?: string[];
  };
  confidence: {
    overall: number;
    byCategory: Record<string, number>;
  };
  regenerationTriggers: string[];
  estimatedCompletionWithFullData: string;
}

export interface EmergencyReportOptions {
  includePartialAnalysis?: boolean;
  prioritizeActionability?: boolean;
  includeDataQualityDetails?: boolean;
  suggestImprovements?: boolean;
  generatePlaceholderSections?: boolean;
}

export class EnhancedEmergencyReportGenerator {
  private static instance: EnhancedEmergencyReportGenerator;

  public static getInstance(): EnhancedEmergencyReportGenerator {
    if (!EnhancedEmergencyReportGenerator.instance) {
      EnhancedEmergencyReportGenerator.instance = new EnhancedEmergencyReportGenerator();
    }
    return EnhancedEmergencyReportGenerator.instance;
  }

  /**
   * Generate enhanced emergency report with available partial data
   * Task 5.1: Main emergency report improvement functionality
   */
  public async generateEnhancedEmergencyReport(
    projectId: string,
    options: EmergencyReportOptions = {}
  ): Promise<EmergencyReportContent> {
    const startTime = Date.now();
    const correlationId = generateCorrelationId();
    const context = { projectId, correlationId, operation: 'generateEnhancedEmergencyReport' };

    logger.info('Generating enhanced emergency report with partial data', {
      ...context,
      includePartialAnalysis: options.includePartialAnalysis,
      prioritizeActionability: options.prioritizeActionability
    });

    try {
      // Assess available data
      const dataScore = await dataAvailabilityScorer.calculateDataAvailabilityScore(projectId, {
        includeOptionalMetrics: true,
        allowPartialData: true
      });

      // Gather all available data segments
      const dataSegments = await this.gatherAvailableDataSegments(projectId, context);

      // Generate content based on available data
      const content = await this.generateContentFromPartialData(
        projectId,
        dataSegments,
        dataScore,
        options,
        context
      );

      const generationTime = Date.now() - startTime;

      logger.info('Enhanced emergency report generated successfully', {
        ...context,
        segmentsFound: dataSegments.length,
        overallConfidence: content.confidence.overall,
        keyInsights: content.keyInsights.length,
        generationTime
      });

      // Track emergency report generation
      trackBusinessEvent('enhanced_emergency_report_generated', {
        correlationId,
        projectId,
        segmentsFound: dataSegments.length,
        overallConfidence: content.confidence.overall,
        dataScore: dataScore.overallScore,
        includePartialAnalysis: options.includePartialAnalysis,
        generationTime
      });

      return content;

    } catch (error) {
      logger.error('Enhanced emergency report generation failed', error as Error, context);
      
      // Return minimal fallback report
      return this.generateMinimalFallbackReport(projectId, error as Error);
    }
  }

  /**
   * Gather all available data segments
   */
  private async gatherAvailableDataSegments(
    projectId: string,
    context: any
  ): Promise<PartialDataSegment[]> {
    const segments: PartialDataSegment[] = [];

    try {
      // Project Information Segment
      const projectSegment = await this.gatherProjectInfoSegment(projectId);
      segments.push(projectSegment);

      // Product Data Segment
      const productSegment = await this.gatherProductDataSegment(projectId);
      segments.push(productSegment);

      // Competitor Data Segment
      const competitorSegment = await this.gatherCompetitorDataSegment(projectId);
      segments.push(competitorSegment);

      // Snapshot Data Segment
      const snapshotSegment = await this.gatherSnapshotDataSegment(projectId);
      segments.push(snapshotSegment);

      // Market Data Segment (if available)
      const marketSegment = await this.gatherMarketDataSegment(projectId);
      if (marketSegment.availability !== 'MISSING') {
        segments.push(marketSegment);
      }

      logger.debug('Data segments gathered', {
        ...context,
        segmentCount: segments.length,
        segmentTypes: segments.map(s => s.category)
      });

      return segments;

    } catch (error) {
      logger.error('Error gathering data segments', error as Error, context);
      return segments; // Return whatever we managed to gather
    }
  }

  /**
   * Gather project information segment
   */
  private async gatherProjectInfoSegment(projectId: string): Promise<PartialDataSegment> {
    try {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: {
          id: true,
          name: true,
          description: true,
          status: true,
          industry: true,
          createdAt: true,
          updatedAt: true
        }
      });

      if (!project) {
        return {
          category: 'PROJECT_INFO',
          availability: 'MISSING',
          quality: 'POOR',
          content: { projectId },
          confidence: 0,
          limitations: ['Project not found or inaccessible'],
          suggestions: ['Verify project exists and permissions are correct']
        };
      }

      let quality: 'HIGH' | 'MEDIUM' | 'LOW' | 'POOR' = 'HIGH';
      let confidence = 90;
      const limitations: string[] = [];
      const suggestions: string[] = [];

      if (!project.description) {
        quality = 'MEDIUM';
        confidence -= 15;
        limitations.push('Missing project description');
        suggestions.push('Add project description for better context');
      }

      if (!project.industry) {
        confidence -= 10;
        limitations.push('Industry information not specified');
        suggestions.push('Specify industry for better market context');
      }

      return {
        category: 'PROJECT_INFO',
        availability: 'COMPLETE',
        quality,
        content: project,
        confidence,
        lastUpdated: project.updatedAt,
        limitations,
        suggestions
      };

    } catch (error) {
      return {
        category: 'PROJECT_INFO',
        availability: 'MISSING',
        quality: 'POOR',
        content: {},
        confidence: 0,
        limitations: [`Project data access failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        suggestions: ['Check database connectivity and retry']
      };
    }
  }

  /**
   * Gather product data segment
   */
  private async gatherProductDataSegment(projectId: string): Promise<PartialDataSegment> {
    try {
      const products = await prisma.product.findMany({
        where: { projectId },
        select: {
          id: true,
          name: true,
          website: true,
          positioning: true,
          targetMarket: true,
          industry: true,
          description: true,
          createdAt: true
        }
      });

      if (products.length === 0) {
        return {
          category: 'PRODUCT_DATA',
          availability: 'MISSING',
          quality: 'POOR',
          content: { products: [] },
          confidence: 0,
          limitations: ['No products defined for this project'],
          suggestions: ['Add at least one product to enable competitive analysis']
        };
      }

      let totalCompleteness = 0;
      let confidence = 80;
      const limitations: string[] = [];
      const suggestions: string[] = [];

      products.forEach(product => {
        let productCompleteness = 50; // Base score for existing product
        
        if (product.website) productCompleteness += 20;
        else limitations.push(`Product "${product.name}" missing website URL`);
        
        if (product.positioning) productCompleteness += 15;
        else suggestions.push(`Add positioning information for "${product.name}"`);
        
        if (product.targetMarket) productCompleteness += 10;
        if (product.description) productCompleteness += 5;
        
        totalCompleteness += productCompleteness;
      });

      const averageCompleteness = totalCompleteness / products.length;
      confidence = Math.round(averageCompleteness);

      let availability: 'COMPLETE' | 'PARTIAL' | 'LIMITED' = 'COMPLETE';
      let quality: 'HIGH' | 'MEDIUM' | 'LOW' = 'HIGH';

      if (averageCompleteness < 70) {
        availability = 'PARTIAL';
        quality = 'MEDIUM';
      }
      
      if (averageCompleteness < 50) {
        availability = 'LIMITED';
        quality = 'LOW';
      }

      return {
        category: 'PRODUCT_DATA',
        availability,
        quality,
        content: { 
          products,
          productCount: products.length,
          averageCompleteness: Math.round(averageCompleteness)
        },
        confidence,
        limitations,
        suggestions
      };

    } catch (error) {
      return {
        category: 'PRODUCT_DATA',
        availability: 'MISSING',
        quality: 'POOR',
        content: {},
        confidence: 0,
        limitations: [`Product data access failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        suggestions: ['Check database connectivity and retry']
      };
    }
  }

  /**
   * Gather competitor data segment
   */
  private async gatherCompetitorDataSegment(projectId: string): Promise<PartialDataSegment> {
    try {
      const competitors = await prisma.competitor.findMany({
        where: { projectId },
        select: {
          id: true,
          name: true,
          website: true,
          description: true,
          industry: true,
          marketPosition: true,
          createdAt: true
        }
      });

      if (competitors.length === 0) {
        return {
          category: 'COMPETITOR_DATA',
          availability: 'MISSING',
          quality: 'POOR',
          content: { competitors: [] },
          confidence: 20,
          limitations: ['No competitors identified - limited comparative analysis possible'],
          suggestions: ['Add key competitors to enable comparative insights']
        };
      }

      let totalCompleteness = 0;
      const limitations: string[] = [];
      const suggestions: string[] = [];

      competitors.forEach(competitor => {
        let competitorCompleteness = 40; // Base score
        
        if (competitor.website) competitorCompleteness += 25;
        else limitations.push(`Competitor "${competitor.name}" missing website`);
        
        if (competitor.description) competitorCompleteness += 20;
        if (competitor.marketPosition) competitorCompleteness += 15;
        
        totalCompleteness += competitorCompleteness;
      });

      const averageCompleteness = totalCompleteness / competitors.length;
      const confidence = Math.round(averageCompleteness);

      let availability: 'COMPLETE' | 'PARTIAL' | 'LIMITED' = 'COMPLETE';
      let quality: 'HIGH' | 'MEDIUM' | 'LOW' = 'HIGH';

      if (averageCompleteness < 70) {
        availability = 'PARTIAL';
        quality = 'MEDIUM';
      }
      
      if (averageCompleteness < 50) {
        availability = 'LIMITED';
        quality = 'LOW';
      }

      return {
        category: 'COMPETITOR_DATA',
        availability,
        quality,
        content: { 
          competitors,
          competitorCount: competitors.length,
          averageCompleteness: Math.round(averageCompleteness)
        },
        confidence,
        limitations,
        suggestions
      };

    } catch (error) {
      return {
        category: 'COMPETITOR_DATA',
        availability: 'MISSING',
        quality: 'POOR',
        content: {},
        confidence: 0,
        limitations: [`Competitor data access failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        suggestions: ['Retry competitor data collection']
      };
    }
  }

  /**
   * Gather snapshot data segment
   */
  private async gatherSnapshotDataSegment(projectId: string): Promise<PartialDataSegment> {
    try {
      const [productSnapshots, competitorSnapshots] = await Promise.all([
        prisma.productSnapshot.findMany({
          where: { product: { projectId } },
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: {
            id: true,
            captureSuccess: true,
            createdAt: true,
            product: {
              select: { name: true }
            }
          }
        }),
        prisma.competitorSnapshot.findMany({
          where: { competitor: { projectId } },
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: {
            id: true,
            captureSuccess: true,
            createdAt: true,
            competitor: {
              select: { name: true }
            }
          }
        })
      ]);

      const allSnapshots = [...productSnapshots, ...competitorSnapshots];
      
      if (allSnapshots.length === 0) {
        return {
          category: 'SNAPSHOT_DATA',
          availability: 'MISSING',
          quality: 'POOR',
          content: { snapshots: [] },
          confidence: 0,
          limitations: ['No website snapshots available'],
          suggestions: ['Capture website snapshots to enable competitive analysis']
        };
      }

      const successfulSnapshots = allSnapshots.filter(s => s.captureSuccess).length;
      const recentSnapshots = allSnapshots.filter(s => 
        new Date(s.createdAt).getTime() > Date.now() - (24 * 60 * 60 * 1000)
      ).length;

      const successRate = Math.round((successfulSnapshots / allSnapshots.length) * 100);
      const freshnessRate = Math.round((recentSnapshots / allSnapshots.length) * 100);
      
      let confidence = (successRate + freshnessRate) / 2;
      let availability: 'COMPLETE' | 'PARTIAL' | 'LIMITED' = 'COMPLETE';
      let quality: 'HIGH' | 'MEDIUM' | 'LOW' = 'HIGH';

      const limitations: string[] = [];
      const suggestions: string[] = [];

      if (successRate < 80) {
        availability = 'PARTIAL';
        quality = 'MEDIUM';
        limitations.push(`${allSnapshots.length - successfulSnapshots} failed snapshot captures`);
        suggestions.push('Review and fix snapshot capture issues');
      }

      if (freshnessRate < 50) {
        if (availability === 'PARTIAL') availability = 'LIMITED';
        if (quality === 'MEDIUM') quality = 'LOW';
        limitations.push('Snapshot data is stale');
        suggestions.push('Refresh website snapshots for current analysis');
      }

      return {
        category: 'SNAPSHOT_DATA',
        availability,
        quality,
        content: {
          totalSnapshots: allSnapshots.length,
          successfulSnapshots,
          recentSnapshots,
          successRate,
          freshnessRate,
          productSnapshots: productSnapshots.length,
          competitorSnapshots: competitorSnapshots.length
        },
        confidence,
        limitations,
        suggestions
      };

    } catch (error) {
      return {
        category: 'SNAPSHOT_DATA',
        availability: 'MISSING',
        quality: 'POOR',
        content: {},
        confidence: 0,
        limitations: [`Snapshot data access failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        suggestions: ['Retry snapshot data collection']
      };
    }
  }

  /**
   * Gather market data segment (placeholder - would integrate with external APIs)
   */
  private async gatherMarketDataSegment(projectId: string): Promise<PartialDataSegment> {
    // This would integrate with market data APIs in a real implementation
    return {
      category: 'MARKET_DATA',
      availability: 'MISSING',
      quality: 'POOR',
      content: {},
      confidence: 0,
      limitations: ['Market data integration not available'],
      suggestions: ['Consider integrating market research APIs for enhanced insights']
    };
  }

  /**
   * Generate content from partial data
   */
  private async generateContentFromPartialData(
    projectId: string,
    dataSegments: PartialDataSegment[],
    dataScore: any,
    options: EmergencyReportOptions,
    context: any
  ): Promise<EmergencyReportContent> {
    
    const availableSegments = dataSegments.filter(s => s.availability !== 'MISSING');
    const overallConfidence = this.calculateOverallConfidence(dataSegments);

    // Generate title
    const projectSegment = dataSegments.find(s => s.category === 'PROJECT_INFO');
    const projectName = projectSegment?.content?.name || 'Project';
    const title = `Emergency Competitive Analysis Report - ${projectName}`;

    // Generate executive summary
    const executiveSummary = this.generateExecutiveSummary(dataSegments, overallConfidence);

    // Extract key insights from available data
    const keyInsights = this.extractKeyInsights(dataSegments);

    // Generate actionable recommendations
    const actionableRecommendations = this.generateActionableRecommendations(dataSegments);

    // Identify data gaps
    const dataGaps = this.identifyDataGaps(dataSegments);

    // Generate partial analysis if requested and data permits
    let partialAnalysis;
    if (options.includePartialAnalysis && overallConfidence >= 30) {
      partialAnalysis = this.generatePartialAnalysis(dataSegments);
    }

    // Determine regeneration triggers
    const regenerationTriggers = this.determineRegenerationTriggers(dataSegments);

    return {
      projectId,
      title,
      executiveSummary,
      availableDataSegments: availableSegments,
      keyInsights,
      dataLimitations: this.extractLimitations(dataSegments),
      actionableRecommendations,
      nextSteps: this.generateNextSteps(dataSegments),
      dataGaps,
      partialAnalysis,
      confidence: {
        overall: overallConfidence,
        byCategory: this.calculateConfidenceByCategory(dataSegments)
      },
      regenerationTriggers,
      estimatedCompletionWithFullData: this.estimateFullReportCompletion(dataGaps)
    };
  }

  /**
   * Calculate overall confidence from data segments
   */
  private calculateOverallConfidence(segments: PartialDataSegment[]): number {
    if (segments.length === 0) return 0;
    
    let totalWeightedConfidence = 0;
    let totalWeight = 0;

    segments.forEach(segment => {
      let weight = 1;
      switch (segment.category) {
        case 'PROJECT_INFO': weight = 2; break;
        case 'PRODUCT_DATA': weight = 3; break;
        case 'COMPETITOR_DATA': weight = 2; break;
        case 'SNAPSHOT_DATA': weight = 3; break;
        case 'MARKET_DATA': weight = 1; break;
      }
      
      totalWeightedConfidence += segment.confidence * weight;
      totalWeight += weight;
    });

    return Math.round(totalWeightedConfidence / totalWeight);
  }

  /**
   * Generate executive summary from available data
   */
  private generateExecutiveSummary(segments: PartialDataSegment[], confidence: number): string {
    const projectSegment = segments.find(s => s.category === 'PROJECT_INFO');
    const productSegment = segments.find(s => s.category === 'PRODUCT_DATA');
    const competitorSegment = segments.find(s => s.category === 'COMPETITOR_DATA');
    const snapshotSegment = segments.find(s => s.category === 'SNAPSHOT_DATA');

    let summary = "This emergency competitive analysis report has been generated with available partial data. ";

    if (projectSegment?.availability === 'COMPLETE') {
      const projectName = projectSegment.content?.name || 'the project';
      summary += `The analysis covers ${projectName}`;
      
      if (projectSegment.content?.industry) {
        summary += ` in the ${projectSegment.content.industry} industry`;
      }
      summary += ". ";
    }

    if (productSegment && productSegment.availability !== 'MISSING') {
      const productCount = productSegment.content?.productCount || 0;
      summary += `${productCount} product${productCount !== 1 ? 's' : ''} ${productCount === 1 ? 'is' : 'are'} included in this analysis`;
      
      if (productSegment.quality === 'HIGH') {
        summary += " with complete product information. ";
      } else if (productSegment.quality === 'MEDIUM') {
        summary += " with good product information, though some details may be missing. ";
      } else {
        summary += " with limited product information available. ";
      }
    }

    if (competitorSegment && competitorSegment.availability !== 'MISSING') {
      const competitorCount = competitorSegment.content?.competitorCount || 0;
      summary += `${competitorCount} competitor${competitorCount !== 1 ? 's have' : ' has'} been identified for comparison. `;
    } else {
      summary += "No competitor information is currently available, limiting comparative insights. ";
    }

    if (snapshotSegment && snapshotSegment.availability !== 'MISSING') {
      const successRate = snapshotSegment.content?.successRate || 0;
      if (successRate >= 80) {
        summary += "Website snapshot data is available and current. ";
      } else if (successRate >= 50) {
        summary += "Website snapshot data is partially available. ";
      } else {
        summary += "Website snapshot data is limited or outdated. ";
      }
    }

    summary += `Overall data confidence: ${confidence}%. `;

    if (confidence >= 70) {
      summary += "This report provides reliable insights based on available data.";
    } else if (confidence >= 50) {
      summary += "This report provides preliminary insights that should be validated with additional data.";
    } else {
      summary += "This report provides basic information only. Additional data collection is recommended for comprehensive analysis.";
    }

    return summary;
  }

  /**
   * Extract key insights from available data
   */
  private extractKeyInsights(segments: PartialDataSegment[]): string[] {
    const insights: string[] = [];

    const productSegment = segments.find(s => s.category === 'PRODUCT_DATA');
    const competitorSegment = segments.find(s => s.category === 'COMPETITOR_DATA');
    const snapshotSegment = segments.find(s => s.category === 'SNAPSHOT_DATA');

    if (productSegment && productSegment.availability !== 'MISSING') {
      const productCount = productSegment.content?.productCount || 0;
      if (productCount > 1) {
        insights.push(`Portfolio includes ${productCount} products, indicating diversified offering`);
      }
      
      const completeness = productSegment.content?.averageCompleteness || 0;
      if (completeness >= 80) {
        insights.push('Product information is comprehensive and well-documented');
      } else if (completeness >= 60) {
        insights.push('Product information is adequate but could benefit from additional details');
      }
    }

    if (competitorSegment && competitorSegment.availability !== 'MISSING') {
      const competitorCount = competitorSegment.content?.competitorCount || 0;
      if (competitorCount >= 5) {
        insights.push('Operating in a highly competitive market with multiple established players');
      } else if (competitorCount >= 2) {
        insights.push('Moderate competitive landscape with several key players identified');
      } else if (competitorCount === 1) {
        insights.push('Limited competitive intelligence available - may indicate niche market or data gap');
      }
    }

    if (snapshotSegment && snapshotSegment.availability !== 'MISSING') {
      const successRate = snapshotSegment.content?.successRate || 0;
      const freshnessRate = snapshotSegment.content?.freshnessRate || 0;
      
      if (successRate >= 90) {
        insights.push('Data collection infrastructure is performing well');
      } else if (successRate < 60) {
        insights.push('Data collection challenges detected - may impact analysis accuracy');
      }
      
      if (freshnessRate >= 80) {
        insights.push('Analysis is based on current website data');
      } else if (freshnessRate < 40) {
        insights.push('Analysis may be based on outdated information');
      }
    }

    if (insights.length === 0) {
      insights.push('Limited data available - key insights cannot be reliably determined');
    }

    return insights;
  }

  /**
   * Generate actionable recommendations
   */
  private generateActionableRecommendations(segments: PartialDataSegment[]): string[] {
    const recommendations: string[] = [];
    
    // Collect suggestions from all segments
    segments.forEach(segment => {
      recommendations.push(...segment.suggestions);
    });

    // Add strategic recommendations based on available data
    const productSegment = segments.find(s => s.category === 'PRODUCT_DATA');
    const competitorSegment = segments.find(s => s.category === 'COMPETITOR_DATA');

    if (productSegment && productSegment.quality !== 'HIGH') {
      recommendations.push('Complete product information to enable more detailed competitive positioning');
    }

    if (!competitorSegment || competitorSegment.availability === 'MISSING') {
      recommendations.push('Identify and add key competitors to enable comparative analysis');
    }

    if (competitorSegment && competitorSegment.content?.competitorCount < 3) {
      recommendations.push('Expand competitor research to include indirect and emerging competitors');
    }

    // Remove duplicates and prioritize
    const uniqueRecommendations = [...new Set(recommendations)];
    return uniqueRecommendations.slice(0, 8); // Limit to top 8 recommendations
  }

  /**
   * Identify data gaps
   */
  private identifyDataGaps(segments: PartialDataSegment[]): {
    critical: string[];
    important: string[];
    optional: string[];
  } {
    const gaps = {
      critical: [] as string[],
      important: [] as string[],
      optional: [] as string[]
    };

    segments.forEach(segment => {
      const limitations = segment.limitations;
      
      switch (segment.category) {
        case 'PROJECT_INFO':
          if (segment.availability === 'MISSING') {
            gaps.critical.push('Project information not accessible');
          }
          break;
          
        case 'PRODUCT_DATA':
          if (segment.availability === 'MISSING') {
            gaps.critical.push('No product information available');
          } else if (segment.quality === 'LOW') {
            gaps.important.push('Product information incomplete');
          }
          break;
          
        case 'COMPETITOR_DATA':
          if (segment.availability === 'MISSING') {
            gaps.important.push('No competitor information available');
          } else if (segment.quality === 'LOW') {
            gaps.optional.push('Competitor information incomplete');
          }
          break;
          
        case 'SNAPSHOT_DATA':
          if (segment.availability === 'MISSING') {
            gaps.critical.push('No website snapshot data available');
          } else if (segment.quality === 'LOW') {
            gaps.important.push('Website snapshot data is outdated or incomplete');
          }
          break;
          
        case 'MARKET_DATA':
          if (segment.availability === 'MISSING') {
            gaps.optional.push('Market and industry data not available');
          }
          break;
      }
    });

    return gaps;
  }

  /**
   * Generate partial analysis if data permits
   */
  private generatePartialAnalysis(segments: PartialDataSegment[]): any {
    const analysis: any = {};

    const productSegment = segments.find(s => s.category === 'PRODUCT_DATA');
    const competitorSegment = segments.find(s => s.category === 'COMPETITOR_DATA');
    const snapshotSegment = segments.find(s => s.category === 'SNAPSHOT_DATA');

    // Competitive overview
    if (competitorSegment && competitorSegment.availability !== 'MISSING') {
      const competitorCount = competitorSegment.content?.competitorCount || 0;
      analysis.competitiveOverview = `Based on available data, ${competitorCount} competitors have been identified. `;
      
      if (competitorSegment.quality === 'HIGH') {
        analysis.competitiveOverview += 'Competitive intelligence is comprehensive and provides good basis for strategic decisions.';
      } else {
        analysis.competitiveOverview += 'Additional competitor research is recommended for comprehensive competitive intelligence.';
      }
    }

    // Product insights
    if (productSegment && productSegment.availability !== 'MISSING') {
      const productCount = productSegment.content?.productCount || 0;
      analysis.productInsights = `Analysis covers ${productCount} product${productCount !== 1 ? 's' : ''}. `;
      
      if (productSegment.quality === 'HIGH') {
        analysis.productInsights += 'Product information is detailed and supports thorough competitive positioning.';
      } else {
        analysis.productInsights += 'Product details could be enhanced to improve competitive analysis accuracy.';
      }
    }

    // Opportunity areas
    analysis.opportunityAreas = [];
    
    if (productSegment && productSegment.quality !== 'HIGH') {
      analysis.opportunityAreas.push('Enhance product information for better positioning insights');
    }
    
    if (!competitorSegment || competitorSegment.availability === 'MISSING') {
      analysis.opportunityAreas.push('Competitive landscape analysis opportunity');
    }
    
    if (snapshotSegment && snapshotSegment.quality !== 'HIGH') {
      analysis.opportunityAreas.push('Website analysis and user experience benchmarking');
    }

    return analysis;
  }

  /**
   * Determine regeneration triggers
   */
  private determineRegenerationTriggers(segments: PartialDataSegment[]): string[] {
    const triggers: string[] = [];

    segments.forEach(segment => {
      switch (segment.category) {
        case 'PRODUCT_DATA':
          if (segment.availability === 'MISSING') {
            triggers.push('Product information added');
          } else if (segment.quality !== 'HIGH') {
            triggers.push('Product information completed');
          }
          break;
          
        case 'COMPETITOR_DATA':
          if (segment.availability === 'MISSING') {
            triggers.push('Competitor information added');
          } else if (segment.quality !== 'HIGH') {
            triggers.push('Additional competitors identified');
          }
          break;
          
        case 'SNAPSHOT_DATA':
          if (segment.availability === 'MISSING') {
            triggers.push('Website snapshots captured');
          } else if (segment.quality !== 'HIGH') {
            triggers.push('Fresh snapshots available');
          }
          break;
      }
    });

    if (triggers.length === 0) {
      triggers.push('Significant data improvements available');
    }

    return triggers;
  }

  /**
   * Helper methods
   */
  private extractLimitations(segments: PartialDataSegment[]): string[] {
    const limitations: string[] = [];
    segments.forEach(segment => {
      limitations.push(...segment.limitations);
    });
    return [...new Set(limitations)]; // Remove duplicates
  }

  private generateNextSteps(segments: PartialDataSegment[]): string[] {
    const nextSteps: string[] = [
      'Complete missing data collection for comprehensive analysis',
      'Review and validate available information accuracy',
      'Monitor for data updates that would trigger report regeneration'
    ];

    const criticalMissing = segments.filter(s => 
      (s.category === 'PRODUCT_DATA' || s.category === 'SNAPSHOT_DATA') && 
      s.availability === 'MISSING'
    );

    if (criticalMissing.length > 0) {
      nextSteps.unshift('Priority: Address critical data gaps immediately');
    }

    return nextSteps;
  }

  private calculateConfidenceByCategory(segments: PartialDataSegment[]): Record<string, number> {
    const confidenceByCategory: Record<string, number> = {};
    
    segments.forEach(segment => {
      confidenceByCategory[segment.category] = segment.confidence;
    });

    return confidenceByCategory;
  }

  private estimateFullReportCompletion(dataGaps: any): string {
    const criticalGaps = dataGaps.critical.length;
    const importantGaps = dataGaps.important.length;
    
    if (criticalGaps === 0 && importantGaps === 0) {
      return 'Full report could be generated within 5-10 minutes';
    } else if (criticalGaps <= 2 && importantGaps <= 3) {
      return 'Full report estimated within 15-30 minutes after data collection';
    } else {
      return 'Full report estimated within 1-2 hours after comprehensive data collection';
    }
  }

  /**
   * Generate minimal fallback report for critical errors
   */
  private generateMinimalFallbackReport(projectId: string, error: Error): EmergencyReportContent {
    return {
      projectId,
      title: 'Emergency Report - System Error',
      executiveSummary: `An error occurred while generating the emergency report: ${error.message}. This minimal report provides basic project information only.`,
      availableDataSegments: [],
      keyInsights: ['System error prevented comprehensive analysis'],
      dataLimitations: ['Report generation error', error.message],
      actionableRecommendations: [
        'Resolve system error and retry report generation',
        'Check data availability and system connectivity',
        'Contact system administrator if error persists'
      ],
      nextSteps: [
        'Diagnose and fix system error',
        'Retry report generation',
        'Verify data accessibility'
      ],
      dataGaps: {
        critical: ['System error preventing data access'],
        important: [],
        optional: []
      },
      confidence: {
        overall: 5,
        byCategory: {}
      },
      regenerationTriggers: ['System error resolved'],
      estimatedCompletionWithFullData: 'Cannot estimate due to system error'
    };
  }
}

// Export singleton instance
export const enhancedEmergencyReportGenerator = EnhancedEmergencyReportGenerator.getInstance(); 