import { createId } from '@paralleldrive/cuid2';
import { logger } from '@/lib/logger';
import { 
  ComparativeReport, 
  ComparativeReportSection, 
  ComparativeReportMetadata,
  ReportGenerationOptions,
  ComparativeReportTemplate
} from '@/types/comparativeReport';
import { ComparativeAnalysis } from '@/types/analysis';
import { Product, ProductSnapshot } from '@/types/product';
import { getReportTemplate } from './comparativeReportTemplates';

export interface PartialDataInfo {
  dataCompletenessScore: number; // 0-100
  dataFreshness: 'new' | 'existing' | 'mixed' | 'basic';
  availableData: {
    hasProductData: boolean;
    hasCompetitorData: boolean;
    hasSnapshots: boolean;
    competitorCount: number;
    freshSnapshotCount: number;
  };
  missingData: string[];
  dataGaps: DataGap[];
  qualityTier: 'basic' | 'enhanced' | 'fresh' | 'complete';
}

export interface DataGap {
  area: string;
  description: string;
  impact: 'low' | 'medium' | 'high';
  recommendation: string;
  canBeImproved: boolean;
}

export interface PartialReportOptions extends ReportGenerationOptions {
  partialDataInfo: PartialDataInfo;
  includeDataGapSection?: boolean;
  includeRecommendations?: boolean;
  acknowledgeDataLimitations?: boolean;
}

export interface PlaceholderAnalysis {
  competitorAnalysis: {
    placeholder: boolean;
    limitedData: boolean;
    analysisQuality: 'basic' | 'limited' | 'partial';
    availableInsights: string[];
    missingInsights: string[];
  };
  industryInsights: {
    generalTrends: string[];
    bestPractices: string[];
    marketOpportunities: string[];
  };
  productOnlyAnalysis: {
    strengthAssessment: string[];
    improvementAreas: string[];
    marketPositioning: string[];
  };
}

export class PartialDataReportGenerator {
  constructor() {
    logger.info('PartialDataReportGenerator initialized');
  }

  /**
   * Generate a meaningful report even with incomplete competitor data
   */
  async generatePartialDataReport(
    analysis: ComparativeAnalysis | null,
    product: Product,
    productSnapshot: ProductSnapshot,
    options: PartialReportOptions
  ): Promise<ComparativeReport> {
    const startTime = Date.now();
    const context = {
      productName: product.name,
      dataCompletenessScore: options.partialDataInfo.dataCompletenessScore,
      qualityTier: options.partialDataInfo.qualityTier
    };

    try {
      logger.info('Starting partial data report generation', context);

      // 1. Assess data availability and create placeholder analysis if needed
      const effectiveAnalysis = analysis || await this.createPlaceholderAnalysis(
        product, 
        productSnapshot, 
        options.partialDataInfo
      );

      // 2. Get appropriate template for partial data scenario
      const template = this.getPartialDataTemplate(options.template || 'comprehensive', options.partialDataInfo);

      // 3. Build enhanced report context that acknowledges data gaps
      const reportContext = this.buildPartialDataReportContext(
        effectiveAnalysis,
        product,
        productSnapshot,
        options.partialDataInfo
      );

      // 4. Generate report sections with gap indicators
      const sections = await this.generatePartialDataSections(
        template.sectionTemplates,
        reportContext,
        options
      );

      // 5. Add data gap section if requested
      if (options.includeDataGapSection !== false) {
        const dataGapSection = this.createDataGapSection(options.partialDataInfo);
        sections.push(dataGapSection);
      }

      // 6. Build complete report with partial data indicators
      const report = this.buildPartialDataReport(
        effectiveAnalysis,
        product,
        template,
        sections,
        reportContext,
        options
      );

      logger.info('Partial data report generated successfully', {
        ...context,
        generationTime: Date.now() - startTime,
        sectionsCount: sections.length,
        hasDataGapSection: options.includeDataGapSection !== false
      });

      return report;

    } catch (error) {
      logger.error('Failed to generate partial data report', error as Error, context);
      throw new Error(`Failed to generate partial data report: ${(error as Error).message}`);
    }
  }

  /**
   * Create placeholder analysis when competitor data is missing
   */
  private async createPlaceholderAnalysis(
    product: Product,
    productSnapshot: ProductSnapshot,
    partialDataInfo: PartialDataInfo
  ): Promise<ComparativeAnalysis> {
    logger.info('Creating placeholder analysis for missing competitor data', {
      productName: product.name,
      dataCompletenessScore: partialDataInfo.dataCompletenessScore
    });

    const placeholderAnalysis: PlaceholderAnalysis = {
      competitorAnalysis: {
        placeholder: true,
        limitedData: true,
        analysisQuality: this.getAnalysisQuality(partialDataInfo.dataCompletenessScore),
        availableInsights: this.generateAvailableInsights(partialDataInfo),
        missingInsights: this.generateMissingInsights(partialDataInfo)
      },
      industryInsights: {
        generalTrends: this.generateIndustryTrends(product),
        bestPractices: this.generateBestPractices(product),
        marketOpportunities: this.generateMarketOpportunities(product)
      },
      productOnlyAnalysis: {
        strengthAssessment: this.generateStrengthAssessment(product, productSnapshot),
        improvementAreas: this.generateImprovementAreas(product, productSnapshot),
        marketPositioning: this.generateMarketPositioning(product, productSnapshot)
      }
    };

    return {
      id: createId(),
      projectId: product.projectId,
      productId: product.id,
      analysisDate: new Date(),
      summary: {
        overallPosition: this.determinePositionFromProduct(product),
        opportunityScore: this.calculateOpportunityScore(partialDataInfo.dataCompletenessScore),
        threatLevel: 'medium',
        keyStrengths: placeholderAnalysis.productOnlyAnalysis.strengthAssessment,
        keyWeaknesses: placeholderAnalysis.productOnlyAnalysis.improvementAreas,
        competitiveAdvantages: [],
        marketOpportunities: placeholderAnalysis.industryInsights.marketOpportunities
      },
      detailed: {
        featureComparison: this.createPlaceholderFeatureComparison(product),
        positioningAnalysis: this.createPlaceholderPositioningAnalysis(product),
        userExperienceComparison: this.createPlaceholderUXComparison(product),
        pricingStrategy: this.createPlaceholderPricingAnalysis(product),
        customerTargeting: this.createPlaceholderCustomerAnalysis(product)
      },
      recommendations: {
        immediate: this.generateImmediateRecommendations(partialDataInfo),
        shortTerm: this.generateShortTermRecommendations(partialDataInfo),
        longTerm: this.generateLongTermRecommendations(partialDataInfo),
        priorityScore: Math.max(30, partialDataInfo.dataCompletenessScore - 20)
      },
      metadata: {
        analysisMethod: 'hybrid',
        confidenceScore: Math.max(20, partialDataInfo.dataCompletenessScore - 10),
        dataQuality: this.mapQualityTierToDataQuality(partialDataInfo.qualityTier) as 'low' | 'medium' | 'high',
        generatedBy: 'partial_data_generator',
        processingTime: 0,
        tokensUsed: 0,
        cost: 0,
        competitorCount: partialDataInfo.availableData.competitorCount,
        hasPlaceholderData: true,
        dataLimitations: partialDataInfo.missingData
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  /**
   * Get appropriate template modified for partial data scenarios
   */
  private getPartialDataTemplate(templateId: string, partialDataInfo: PartialDataInfo): ComparativeReportTemplate {
    const baseTemplate = getReportTemplate(templateId);
    
    // Modify template sections based on data availability
    const modifiedSections = baseTemplate.sectionTemplates.map(section => {
      return {
        ...section,
        template: this.addDataLimitationNotices(section.template, section.type, partialDataInfo)
      };
    });

    return {
      ...baseTemplate,
      name: `${baseTemplate.name} (Partial Data)`,
      description: `${baseTemplate.description} - Generated with ${partialDataInfo.dataCompletenessScore}% data completeness`,
      sectionTemplates: modifiedSections
    };
  }

  /**
   * Add data limitation notices to template sections
   */
  private addDataLimitationNotices(
    template: string, 
    sectionType: string, 
    partialDataInfo: PartialDataInfo
  ): string {
    const dataQualityNotice = this.getDataQualityNotice(sectionType, partialDataInfo);
    
    if (dataQualityNotice) {
      return `${dataQualityNotice}

${template}`;
    }
    
    return template;
  }

  /**
   * Get data quality notice for specific section types
   */
  private getDataQualityNotice(sectionType: string, partialDataInfo: PartialDataInfo): string | null {
    const notices: Record<string, string> = {
      'feature_comparison': partialDataInfo.availableData.hasCompetitorData 
        ? null 
        : '> **Data Limitation Notice:** This analysis is based on product data only. Competitor feature comparison requires fresh competitor snapshots for enhanced accuracy.',
      
      'positioning_analysis': partialDataInfo.availableData.hasSnapshots 
        ? null 
        : '> **Data Limitation Notice:** Positioning analysis is based on available competitor information. Fresh market data would provide more current insights.',
      
      'ux_comparison': partialDataInfo.availableData.freshSnapshotCount > 0 
        ? null 
        : '> **Data Limitation Notice:** UX comparison requires fresh competitor website snapshots. Current analysis uses available baseline information.',
      
      'customer_targeting': partialDataInfo.availableData.hasCompetitorData 
        ? null 
        : '> **Data Limitation Notice:** Customer targeting analysis focuses on product positioning. Competitor targeting data would enhance strategic insights.'
    };

    return notices[sectionType] || null;
  }

  /**
   * Build report context that acknowledges data gaps
   */
  private buildPartialDataReportContext(
    analysis: ComparativeAnalysis,
    product: Product,
    productSnapshot: ProductSnapshot,
    partialDataInfo: PartialDataInfo
  ): any {
    const baseContext = {
      productName: product.name,
      productUrl: product.website,
      competitorCount: partialDataInfo.availableData.competitorCount,
      overallPosition: analysis.summary.overallPosition,
      opportunityScore: analysis.summary.opportunityScore,
      threatLevel: analysis.summary.threatLevel,
      confidenceScore: analysis.metadata.confidenceScore,
      keyStrengths: analysis.summary.keyStrengths,
      keyWeaknesses: analysis.summary.keyWeaknesses,
      marketOpportunities: analysis.summary.marketOpportunities,
      competitiveAdvantage: analysis.summary.competitiveAdvantages,
      immediateActions: analysis.recommendations.immediate,
      shortTermActions: analysis.recommendations.shortTerm,
      longTermActions: analysis.recommendations.longTerm,
      priorityScore: analysis.recommendations.priorityScore
    };

    // Add partial data specific context
    return {
      ...baseContext,
      dataCompletenessScore: partialDataInfo.dataCompletenessScore,
      dataFreshness: partialDataInfo.dataFreshness,
      qualityTier: partialDataInfo.qualityTier,
      hasDataGaps: partialDataInfo.dataGaps.length > 0,
      criticalDataGaps: partialDataInfo.dataGaps.filter(gap => gap.impact === 'high'),
      canImproveData: partialDataInfo.dataGaps.some(gap => gap.canBeImproved),
      freshSnapshotCount: partialDataInfo.availableData.freshSnapshotCount,
      totalSnapshotCount: partialDataInfo.availableData.competitorCount,
      
      // Enhanced descriptions that acknowledge limitations
      threatLevelDescription: this.getThreatLevelDescription(analysis.summary.threatLevel, partialDataInfo),
      opportunityScoreDescription: this.getOpportunityScoreDescription(analysis.summary.opportunityScore, partialDataInfo),
      confidenceScoreDescription: this.getConfidenceScoreDescription(analysis.metadata.confidenceScore, partialDataInfo),
      
      // Data improvement recommendations
      dataImprovementRecommendations: this.generateDataImprovementRecommendations(partialDataInfo)
    };
  }

  /**
   * Generate report sections with partial data handling
   */
  private async generatePartialDataSections(
    sectionTemplates: any[],
    reportContext: any,
    options: PartialReportOptions
  ): Promise<ComparativeReportSection[]> {
    const sections: ComparativeReportSection[] = [];

    for (const sectionTemplate of sectionTemplates) {
      try {
        const sectionContent = await this.generatePartialDataSection(sectionTemplate, reportContext, options);
        sections.push(sectionContent);
      } catch (error) {
        logger.warn('Failed to generate section, creating placeholder', {
          sectionType: sectionTemplate.type,
          error: (error as Error).message
        });
        
        sections.push(this.createPlaceholderSection(sectionTemplate, options.partialDataInfo));
      }
    }

    return sections.sort((a, b) => a.order - b.order);
  }

  /**
   * Generate individual section with partial data handling
   */
  private async generatePartialDataSection(
    sectionTemplate: any,
    reportContext: any,
    options: PartialReportOptions
  ): Promise<ComparativeReportSection> {
    // Use simple template replacement for now
    let content = sectionTemplate.template;
    
    // Replace template variables with context values
    Object.keys(reportContext).forEach(key => {
      const value = reportContext[key];
      if (typeof value === 'string') {
        content = content.replace(new RegExp(`{{${key}}}`, 'g'), value);
      } else if (Array.isArray(value)) {
        // Handle array replacements for lists
        const listContent = value.map(item => `- ${item}`).join('\n');
        content = content.replace(new RegExp(`{{#${key}}}[\\s\\S]*?{{/${key}}}`, 'g'), listContent);
      }
    });

    // Add data quality footer to each section
    const dataQualityFooter = this.createDataQualityFooter(sectionTemplate.type, options.partialDataInfo);
    if (dataQualityFooter) {
      content += `

${dataQualityFooter}`;
    }

    return {
      id: createId(),
      type: sectionTemplate.type,
      title: sectionTemplate.title,
      content,
      order: sectionTemplate.order,
      metadata: {
        generatedAt: new Date(),
        dataCompleteness: this.calculateSectionDataCompleteness(sectionTemplate.type, options.partialDataInfo),
        hasLimitations: this.sectionHasLimitations(sectionTemplate.type, options.partialDataInfo),
        improvementPossible: this.sectionCanBeImproved(sectionTemplate.type, options.partialDataInfo)
      }
    };
  }

  /**
   * Create data gap section to explain missing information
   */
  private createDataGapSection(partialDataInfo: PartialDataInfo): ComparativeReportSection {
    const gapsByImpact = {
      high: partialDataInfo.dataGaps.filter(gap => gap.impact === 'high'),
      medium: partialDataInfo.dataGaps.filter(gap => gap.impact === 'medium'),
      low: partialDataInfo.dataGaps.filter(gap => gap.impact === 'low')
    };

    let content = `# Data Completeness & Limitations

## Report Data Quality
**Overall Completeness Score:** ${partialDataInfo.dataCompletenessScore}%  
**Data Freshness:** ${partialDataInfo.dataFreshness}  
**Quality Tier:** ${partialDataInfo.qualityTier}

## Available Data Sources
- **Product Information:** ${partialDataInfo.availableData.hasProductData ? '✅ Complete' : '❌ Missing'}
- **Competitor Data:** ${partialDataInfo.availableData.hasCompetitorData ? '✅ Available' : '❌ Limited'}
- **Fresh Snapshots:** ${partialDataInfo.availableData.freshSnapshotCount}/${partialDataInfo.availableData.competitorCount} captured
- **Total Competitors:** ${partialDataInfo.availableData.competitorCount}

`;

    if (gapsByImpact.high.length > 0) {
      content += `## Critical Data Gaps (High Impact)
${gapsByImpact.high.map(gap => `
### ${gap.area}
${gap.description}

**Recommendation:** ${gap.recommendation}  
**Can be improved:** ${gap.canBeImproved ? 'Yes' : 'No'}
`).join('\n')}

`;
    }

    if (gapsByImpact.medium.length > 0) {
      content += `## Moderate Data Gaps (Medium Impact)
${gapsByImpact.medium.map(gap => `- **${gap.area}:** ${gap.description}`).join('\n')}

`;
    }

    if (gapsByImpact.low.length > 0) {
      content += `## Minor Data Gaps (Low Impact)
${gapsByImpact.low.map(gap => `- **${gap.area}:** ${gap.description}`).join('\n')}

`;
    }

    content += `## Improving Report Quality

To enhance the accuracy and completeness of future reports:

${partialDataInfo.dataGaps
  .filter(gap => gap.canBeImproved)
  .map(gap => `- ${gap.recommendation}`)
  .join('\n')}

## Data Collection Status
This report was generated with the best available data at the time of creation. For the most current competitive intelligence, consider scheduling regular competitor data collection and snapshot updates.
`;

    return {
      id: createId(),
      type: 'data_gaps',
      title: 'Data Completeness & Limitations',
      content,
      order: 99, // Place at end of report
      metadata: {
        generatedAt: new Date(),
        dataCompleteness: partialDataInfo.dataCompletenessScore,
        hasLimitations: true,
        improvementPossible: partialDataInfo.dataGaps.some(gap => gap.canBeImproved)
      }
    };
  }

  /**
   * Build final report with partial data indicators
   */
  private buildPartialDataReport(
    analysis: ComparativeAnalysis,
    product: Product,
    template: ComparativeReportTemplate,
    sections: ComparativeReportSection[],
    context: any,
    options: PartialReportOptions
  ): ComparativeReport {
    const reportId = createId();
    const now = new Date();

    const metadata: ComparativeReportMetadata = {
      productName: product.name,
      productUrl: product.website,
      competitorCount: options.partialDataInfo.availableData.competitorCount,
      analysisDate: analysis.analysisDate,
      reportGeneratedAt: now,
      analysisId: analysis.id,
      analysisMethod: analysis.metadata.analysisMethod,
      confidenceScore: analysis.metadata.confidenceScore,
      dataQuality: analysis.metadata.dataQuality,
      reportVersion: '1.0',
      focusAreas: template.focusAreas,
      analysisDepth: template.analysisDepth,
      // Partial data specific metadata
      dataCompletenessScore: options.partialDataInfo.dataCompletenessScore,
      dataFreshness: options.partialDataInfo.dataFreshness,
      hasDataLimitations: true,
      partialDataInfo: {
        qualityTier: options.partialDataInfo.qualityTier,
        freshSnapshotCount: options.partialDataInfo.availableData.freshSnapshotCount,
        totalCompetitors: options.partialDataInfo.availableData.competitorCount,
        criticalGapsCount: options.partialDataInfo.dataGaps.filter(gap => gap.impact === 'high').length,
        canBeImproved: options.partialDataInfo.dataGaps.some(gap => gap.canBeImproved)
      }
    } as any;

    return {
      id: reportId,
      title: this.generatePartialDataReportTitle(product.name, template.name, options.partialDataInfo),
      description: this.generatePartialDataReportDescription(product.name, options.partialDataInfo),
      projectId: product.projectId,
      productId: product.id,
      analysisId: analysis.id,
      metadata,
      sections,
      executiveSummary: this.extractExecutiveSummaryWithLimitations(sections, options.partialDataInfo),
      keyFindings: this.extractKeyFindingsWithLimitations(context, options.partialDataInfo),
      strategicRecommendations: {
        immediate: [...context.immediateActions, ...context.dataImprovementRecommendations.immediate],
        shortTerm: [...context.shortTermActions, ...context.dataImprovementRecommendations.shortTerm],
        longTerm: [...context.longTermActions, ...context.dataImprovementRecommendations.longTerm],
        priorityScore: context.priorityScore
      },
      competitiveIntelligence: {
        marketPosition: context.overallPosition,
        keyThreats: this.extractKeyThreatsWithLimitations(context, options.partialDataInfo),
        opportunities: context.marketOpportunities,
        competitiveAdvantages: context.competitiveAdvantage
      },
      createdAt: now,
      updatedAt: now,
      status: 'completed',
      format: options.format || 'markdown',
      // Add rawContent for UI fallback
      rawContent: this.generatePartialDataRawContent(sections, options.partialDataInfo)
    };
  }

  // Helper methods for generating placeholder content and assessments

  /**
   * Generate raw markdown content from partial data sections
   */
  private generatePartialDataRawContent(sections: ComparativeReportSection[], partialDataInfo: PartialDataInfo): string {
    if (!sections || sections.length === 0) {
      return `# Partial Data Report Generated

This report was generated with limited data (${partialDataInfo.dataCompletenessScore}% complete).

Please note that this analysis may be incomplete due to limited competitor data availability.

Contact support to improve data coverage for more comprehensive insights.`;
    }

    const content = sections
      .sort((a, b) => a.order - b.order)
      .map(section => `# ${section.title}\n\n${section.content || 'No content available for this section due to limited data.'}\n\n`)
      .join('---\n\n');

    // Add data completeness footer
    const footer = `
---

## Data Completeness Notice

This report was generated with **${partialDataInfo.dataCompletenessScore}% data completeness**.

**Quality Tier:** ${partialDataInfo.qualityTier}
**Available Competitors:** ${partialDataInfo.availableCompetitors} out of ${partialDataInfo.totalCompetitors}

${partialDataInfo.dataGaps.length > 0 ? `
**Data Gaps Identified:**
${partialDataInfo.dataGaps.map(gap => `- ${gap.type}: ${gap.description}`).join('\n')}
` : ''}

For more comprehensive analysis, consider improving data collection coverage.`;

    return content + footer;
  }

  private getAnalysisQuality(completenessScore: number): 'basic' | 'limited' | 'partial' {
    if (completenessScore >= 60) return 'partial';
    if (completenessScore >= 30) return 'limited';
    return 'basic';
  }

  private generateAvailableInsights(partialDataInfo: PartialDataInfo): string[] {
    const insights: string[] = [];
    
    if (partialDataInfo.availableData.hasProductData) {
      insights.push('Product positioning and value proposition analysis');
      insights.push('Core feature assessment and differentiation opportunities');
    }
    
    if (partialDataInfo.availableData.hasCompetitorData) {
      insights.push('Basic competitive landscape overview');
      insights.push('Market positioning relative to known competitors');
    }
    
    if (partialDataInfo.availableData.freshSnapshotCount > 0) {
      insights.push(`Fresh competitive intelligence from ${partialDataInfo.availableData.freshSnapshotCount} competitor snapshots`);
    }
    
    return insights;
  }

  private generateMissingInsights(partialDataInfo: PartialDataInfo): string[] {
    const missing: string[] = [];
    
    if (!partialDataInfo.availableData.hasSnapshots) {
      missing.push('Current competitor website analysis and UX comparison');
      missing.push('Real-time pricing and feature comparison');
    }
    
    if (partialDataInfo.availableData.competitorCount === 0) {
      missing.push('Competitive positioning and market threats assessment');
      missing.push('Feature gap analysis and competitive advantages');
    }
    
    return missing;
  }

  private generateIndustryTrends(product: Product): string[] {
    return [
      'Digital transformation accelerating across industries',
      'Increased focus on user experience and customer-centric design',
      'Growing importance of data-driven decision making',
      'Shift toward subscription and service-based business models'
    ];
  }

  private generateBestPractices(product: Product): string[] {
    return [
      'Continuous competitor monitoring and analysis',
      'Regular product-market fit assessment',
      'User feedback integration in product development',
      'Agile response to market changes and opportunities'
    ];
  }

  private generateMarketOpportunities(product: Product): string[] {
    return [
      'Underserved customer segments identification',
      'Feature differentiation opportunities',
      'Market expansion possibilities',
      'Strategic partnership potential'
    ];
  }

  private generateStrengthAssessment(product: Product, snapshot: ProductSnapshot): string[] {
    return [
      'Clear value proposition and market positioning',
      'Established product foundation and user base',
      'Opportunity for targeted competitive differentiation',
      'Potential for data-driven competitive advantages'
    ];
  }

  private generateImprovementAreas(product: Product, snapshot: ProductSnapshot): string[] {
    return [
      'Enhanced competitive intelligence and monitoring',
      'Deeper market analysis and customer insights',
      'Competitive feature gap identification',
      'Strategic positioning refinement'
    ];
  }

  private generateMarketPositioning(product: Product, snapshot: ProductSnapshot): string[] {
    return [
      'Position as customer-focused solution',
      'Emphasize unique value proposition',
      'Build on existing product strengths',
      'Develop competitive differentiation strategy'
    ];
  }

  private determinePositionFromProduct(product: Product): 'leading' | 'competitive' | 'trailing' {
    return 'competitive';
  }

  private calculateOpportunityScore(completenessScore: number): number {
    return Math.min(70, Math.max(30, completenessScore - 10));
  }

  private createPlaceholderFeatureComparison(product: Product): any {
    return {
      productFeatures: ['Core product functionality', 'User interface', 'Customer support'],
      competitorFeatures: [],
      uniqueFeatures: ['Placeholder unique feature analysis'],
      featureGaps: ['Requires competitor feature analysis'],
      innovationScore: 50
    };
  }

  private createPlaceholderPositioningAnalysis(product: Product): any {
    return {
      primaryMessage: product.name + ' positioning statement',
      valueProposition: 'Product value proposition to be analyzed',
      targetAudience: 'Target audience analysis pending',
      marketDifferentiators: ['Requires competitive positioning analysis']
    };
  }

  private createPlaceholderUXComparison(product: Product): any {
    return {
      designQuality: 70,
      usabilityScore: 70,
      navigationStructure: 'Standard navigation patterns',
      competitorUXAnalysis: []
    };
  }

  private createPlaceholderPricingAnalysis(product: Product): any {
    return {
      pricingStrategy: 'Product pricing strategy',
      competitorPricing: [],
      pricePositioning: 'Competitive pricing analysis needed'
    };
  }

  private createPlaceholderCustomerAnalysis(product: Product): any {
    return {
      primarySegments: ['Primary customer segment'],
      customerTypes: ['Business customers', 'Individual users'],
      useCases: ['Primary use case', 'Secondary use case']
    };
  }

  private generateImmediateRecommendations(partialDataInfo: PartialDataInfo): string[] {
    const recommendations = [
      'Conduct comprehensive competitor analysis to improve report accuracy',
      'Capture fresh competitor website snapshots for current market intelligence'
    ];

    if (!partialDataInfo.availableData.hasSnapshots) {
      recommendations.push('Schedule regular competitor monitoring and data collection');
    }

    return recommendations;
  }

  private generateShortTermRecommendations(partialDataInfo: PartialDataInfo): string[] {
    return [
      'Establish ongoing competitive intelligence process',
      'Implement automated competitor tracking and analysis',
      'Develop competitive positioning strategy based on enhanced data'
    ];
  }

  private generateLongTermRecommendations(partialDataInfo: PartialDataInfo): string[] {
    return [
      'Build comprehensive competitive intelligence capability',
      'Develop data-driven competitive strategy framework',
      'Create systematic market monitoring and response processes'
    ];
  }

  private mapQualityTierToDataQuality(qualityTier: string): string {
    const mapping: Record<string, string> = {
      'basic': 'low',
      'enhanced': 'medium',
      'fresh': 'high',
      'complete': 'very_high'
    };
    return mapping[qualityTier] || 'low';
  }

  private getThreatLevelDescription(threatLevel: string, partialDataInfo: PartialDataInfo): string {
    if (partialDataInfo.dataCompletenessScore < 50) {
      return `${threatLevel} threat level (limited data - enhanced competitor analysis recommended for accurate threat assessment)`;
    }
    return `${threatLevel} competitive threat level based on available data`;
  }

  private getOpportunityScoreDescription(score: number, partialDataInfo: PartialDataInfo): string {
    const baseDescription = `${score}% opportunity score`;
    if (partialDataInfo.dataCompletenessScore < 70) {
      return `${baseDescription} (conservative estimate - fresh competitor data would provide more precise opportunity assessment)`;
    }
    return baseDescription;
  }

  private getConfidenceScoreDescription(score: number, partialDataInfo: PartialDataInfo): string {
    return `${score}% confidence (${partialDataInfo.qualityTier} data quality - ${partialDataInfo.dataCompletenessScore}% complete)`;
  }

  private generateDataImprovementRecommendations(partialDataInfo: PartialDataInfo): any {
    const immediate = [];
    const shortTerm = [];
    const longTerm = [];

    if (partialDataInfo.availableData.freshSnapshotCount === 0) {
      immediate.push('Capture fresh competitor website snapshots for current analysis');
    }

    if (!partialDataInfo.availableData.hasCompetitorData) {
      immediate.push('Add competitor information to enable comparative analysis');
    }

    shortTerm.push('Establish regular competitor monitoring schedule');
    shortTerm.push('Implement automated data collection processes');

    longTerm.push('Build comprehensive competitive intelligence system');
    longTerm.push('Develop predictive competitive analysis capabilities');

    return { immediate, shortTerm, longTerm };
  }

  private createDataQualityFooter(sectionType: string, partialDataInfo: PartialDataInfo): string | null {
    if (partialDataInfo.dataCompletenessScore >= 80) {
      return null;
    }

    const qualityIndicators = [
      `📊 **Data Quality:** ${partialDataInfo.qualityTier}`,
      `🎯 **Completeness:** ${partialDataInfo.dataCompletenessScore}%`,
      `🔄 **Freshness:** ${partialDataInfo.dataFreshness}`
    ];

    return `---
*${qualityIndicators.join(' | ')}*`;
  }

  private calculateSectionDataCompleteness(sectionType: string, partialDataInfo: PartialDataInfo): number {
    const sectionWeights: Record<string, number> = {
      'executive_summary': 0.8,
      'feature_comparison': 0.3,
      'positioning_analysis': 0.6,
      'ux_comparison': 0.2,
      'customer_targeting': 0.7,
      'recommendations': 0.9
    };

    const weight = sectionWeights[sectionType] || 0.5;
    return Math.round(partialDataInfo.dataCompletenessScore * weight);
  }

  private sectionHasLimitations(sectionType: string, partialDataInfo: PartialDataInfo): boolean {
    const limitedSections = ['feature_comparison', 'ux_comparison'];
    return limitedSections.includes(sectionType) && partialDataInfo.dataCompletenessScore < 70;
  }

  private sectionCanBeImproved(sectionType: string, partialDataInfo: PartialDataInfo): boolean {
    return partialDataInfo.dataGaps.some(gap => gap.canBeImproved);
  }

  private createPlaceholderSection(sectionTemplate: any, partialDataInfo: PartialDataInfo): ComparativeReportSection {
    const content = `# ${sectionTemplate.title}

> **⚠️ Limited Data Notice:** This section requires additional competitor data for comprehensive analysis.

Based on available product information:

## Current Assessment
- Product analysis completed with available data
- Competitive comparison limited by data availability
- Recommendations focus on data collection and analysis improvements

## Next Steps
1. Capture fresh competitor snapshots for enhanced analysis
2. Gather additional competitor information
3. Re-run analysis with complete dataset

**Data Completeness:** ${partialDataInfo.dataCompletenessScore}%  
**Improvement Possible:** ${partialDataInfo.dataGaps.some(gap => gap.canBeImproved) ? 'Yes' : 'No'}
`;

    return {
      id: createId(),
      type: sectionTemplate.type,
      title: sectionTemplate.title,
      content,
      order: sectionTemplate.order,
      metadata: {
        generatedAt: new Date(),
        dataCompleteness: 20,
        hasLimitations: true,
        improvementPossible: true
      }
    };
  }

  private generatePartialDataReportTitle(productName: string, templateName: string, partialDataInfo: PartialDataInfo): string {
    return `${productName} - ${templateName} (${partialDataInfo.dataCompletenessScore}% Complete)`;
  }

  private generatePartialDataReportDescription(productName: string, partialDataInfo: PartialDataInfo): string {
    return `Competitive analysis for ${productName} based on ${partialDataInfo.dataCompletenessScore}% data completeness. ${partialDataInfo.dataFreshness === 'new' ? 'Includes fresh competitor snapshots.' : 'Enhanced data collection recommended for more comprehensive insights.'}`;
  }

  private extractExecutiveSummaryWithLimitations(sections: ComparativeReportSection[], partialDataInfo: PartialDataInfo): string {
    const executiveSection = sections.find(s => s.type === 'executive_summary');
    if (!executiveSection) {
      return `Executive summary based on ${partialDataInfo.dataCompletenessScore}% data completeness. Enhanced competitive intelligence recommended for comprehensive strategic insights.`;
    }

    return executiveSection.content;
  }

  private extractKeyFindingsWithLimitations(context: any, partialDataInfo: PartialDataInfo): string[] {
    const findings = [...(context.keyStrengths || [])];
    
    if (partialDataInfo.dataCompletenessScore < 70) {
      findings.push(`Analysis based on ${partialDataInfo.dataCompletenessScore}% data completeness - enhanced competitor data recommended`);
    }

    if (partialDataInfo.availableData.freshSnapshotCount === 0) {
      findings.push('Fresh competitor snapshots needed for current market intelligence');
    }

    return findings;
  }

  private extractKeyThreatsWithLimitations(context: any, partialDataInfo: PartialDataInfo): string[] {
    if (partialDataInfo.dataCompletenessScore < 50) {
      return ['Competitive threat assessment limited by data availability - comprehensive competitor analysis recommended'];
    }

    return context.keyWeaknesses || ['Limited threat assessment available with current data'];
  }
} 