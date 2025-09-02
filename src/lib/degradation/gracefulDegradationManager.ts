import { logger, generateCorrelationId, trackBusinessEvent } from '@/lib/logger';
import { dataAvailabilityScorer, DataAvailabilityScore } from '../scoring/dataAvailabilityScorer';

export enum DegradationLevel {
  FULL = 'FULL',              // 90-100% - Complete data, full analysis
  ENHANCED = 'ENHANCED',       // 80-89% - Good data, enhanced features
  STANDARD = 'STANDARD',       // 70-79% - Adequate data, standard analysis
  BASIC = 'BASIC',            // 60-69% - Limited data, basic analysis
  MINIMAL = 'MINIMAL',        // 50-59% - Sparse data, minimal insights
  EMERGENCY = 'EMERGENCY'     // 0-49% - Critical fallback, basic info only
}

export interface DegradationStrategy {
  level: DegradationLevel;
  threshold: {
    min: number;
    max: number;
  };
  name: string;
  description: string;
  features: {
    competitiveAnalysis: boolean;
    marketPositioning: boolean;
    detailedMetrics: boolean;
    trendAnalysis: boolean;
    recommendations: boolean;
    visualizations: boolean;
    executiveSummary: boolean;
    technicalDetails: boolean;
  };
  reportSections: string[];
  estimatedCompletionTime: number; // minutes
  qualityLevel: 'PREMIUM' | 'PROFESSIONAL' | 'STANDARD' | 'BASIC' | 'MINIMAL' | 'EMERGENCY';
  userMessage: string;
  fallbackContent?: any;
}

export interface DegradationDecision {
  projectId: string;
  dataScore: DataAvailabilityScore;
  selectedLevel: DegradationLevel;
  selectedStrategy: DegradationStrategy;
  alternativeStrategies: DegradationStrategy[];
  canUpgrade: boolean;
  upgradeOptions: {
    level: DegradationLevel;
    requirements: string[];
    estimatedTime: number;
  }[];
  degradationReasons: string[];
  enhancementOpportunities: string[];
  decisionTime: Date;
}

export interface GracefulDegradationOptions {
  preferQuality?: boolean; // True = wait for better data, False = generate quickly
  allowEmergencyFallback?: boolean;
  minimumLevel?: DegradationLevel;
  maxWaitTime?: number; // milliseconds
  prioritizeSpeed?: boolean;
  customThresholds?: Partial<Record<DegradationLevel, number>>;
}

export class GracefulDegradationManager {
  private static instance: GracefulDegradationManager;
  private strategies: Map<DegradationLevel, DegradationStrategy> = new Map();

  public static getInstance(): GracefulDegradationManager {
    if (!GracefulDegradationManager.instance) {
      GracefulDegradationManager.instance = new GracefulDegradationManager();
    }
    return GracefulDegradationManager.instance;
  }

  constructor() {
    this.initializeDegradationStrategies();
  }

  /**
   * Initialize degradation strategies
   */
  private initializeDegradationStrategies(): void {
    const strategies: DegradationStrategy[] = [
      {
        level: DegradationLevel.FULL,
        threshold: { min: 90, max: 100 },
        name: 'Full Analysis Report',
        description: 'Complete competitive analysis with all features and insights',
        features: {
          competitiveAnalysis: true,
          marketPositioning: true,
          detailedMetrics: true,
          trendAnalysis: true,
          recommendations: true,
          visualizations: true,
          executiveSummary: true,
          technicalDetails: true
        },
        reportSections: [
          'executive_summary',
          'competitive_landscape',
          'market_positioning',
          'feature_comparison',
          'performance_analysis',
          'trend_analysis',
          'strategic_recommendations',
          'technical_appendix',
          'data_methodology'
        ],
        estimatedCompletionTime: 15,
        qualityLevel: 'PREMIUM',
        userMessage: 'Generating comprehensive competitive analysis with all available data and insights.'
      },
      {
        level: DegradationLevel.ENHANCED,
        threshold: { min: 80, max: 89 },
        name: 'Enhanced Analysis Report',
        description: 'Comprehensive analysis with most features enabled',
        features: {
          competitiveAnalysis: true,
          marketPositioning: true,
          detailedMetrics: true,
          trendAnalysis: true,
          recommendations: true,
          visualizations: true,
          executiveSummary: true,
          technicalDetails: false
        },
        reportSections: [
          'executive_summary',
          'competitive_landscape',
          'market_positioning',
          'feature_comparison',
          'performance_analysis',
          'strategic_recommendations',
          'data_notes'
        ],
        estimatedCompletionTime: 12,
        qualityLevel: 'PROFESSIONAL',
        userMessage: 'Generating enhanced competitive analysis with comprehensive insights.'
      },
      {
        level: DegradationLevel.STANDARD,
        threshold: { min: 70, max: 79 },
        name: 'Standard Analysis Report',
        description: 'Standard competitive analysis with core features',
        features: {
          competitiveAnalysis: true,
          marketPositioning: true,
          detailedMetrics: false,
          trendAnalysis: false,
          recommendations: true,
          visualizations: true,
          executiveSummary: true,
          technicalDetails: false
        },
        reportSections: [
          'executive_summary',
          'competitive_landscape',
          'market_positioning',
          'feature_comparison',
          'key_recommendations',
          'data_limitations'
        ],
        estimatedCompletionTime: 10,
        qualityLevel: 'STANDARD',
        userMessage: 'Generating standard competitive analysis with available data.'
      },
      {
        level: DegradationLevel.BASIC,
        threshold: { min: 60, max: 69 },
        name: 'Basic Analysis Report',
        description: 'Basic competitive insights with limited data',
        features: {
          competitiveAnalysis: true,
          marketPositioning: false,
          detailedMetrics: false,
          trendAnalysis: false,
          recommendations: true,
          visualizations: false,
          executiveSummary: true,
          technicalDetails: false
        },
        reportSections: [
          'executive_summary',
          'basic_competitive_overview',
          'available_insights',
          'recommendations',
          'data_gaps'
        ],
        estimatedCompletionTime: 8,
        qualityLevel: 'BASIC',
        userMessage: 'Generating basic competitive analysis with limited but available data.'
      },
      {
        level: DegradationLevel.MINIMAL,
        threshold: { min: 50, max: 59 },
        name: 'Minimal Insights Report',
        description: 'Minimal competitive insights from sparse data',
        features: {
          competitiveAnalysis: false,
          marketPositioning: false,
          detailedMetrics: false,
          trendAnalysis: false,
          recommendations: false,
          visualizations: false,
          executiveSummary: true,
          technicalDetails: false
        },
        reportSections: [
          'summary',
          'available_data_overview',
          'preliminary_insights',
          'next_steps'
        ],
        estimatedCompletionTime: 5,
        qualityLevel: 'MINIMAL',
        userMessage: 'Generating minimal report with sparse data. Consider gathering more information for better insights.'
      },
      {
        level: DegradationLevel.EMERGENCY,
        threshold: { min: 0, max: 49 },
        name: 'Emergency Fallback Report',
        description: 'Emergency report with basic project information only',
        features: {
          competitiveAnalysis: false,
          marketPositioning: false,
          detailedMetrics: false,
          trendAnalysis: false,
          recommendations: false,
          visualizations: false,
          executiveSummary: false,
          technicalDetails: false
        },
        reportSections: [
          'project_overview',
          'data_collection_status',
          'recommended_actions'
        ],
        estimatedCompletionTime: 3,
        qualityLevel: 'EMERGENCY',
        userMessage: 'Critical data missing. Generated emergency report with available project information.',
        fallbackContent: {
          title: 'Emergency Project Report',
          message: 'Unable to generate comprehensive analysis due to missing critical data',
          status: 'Data collection in progress'
        }
      }
    ];

    // Store strategies in map for quick lookup
    strategies.forEach(strategy => {
      this.strategies.set(strategy.level, strategy);
    });
  }

  /**
   * Determine appropriate degradation level and strategy
   * Task 4.4: Main graceful degradation decision
   */
  public async determineDegradationStrategy(
    projectId: string,
    options: GracefulDegradationOptions = {}
  ): Promise<DegradationDecision> {
    const startTime = Date.now();
    const correlationId = generateCorrelationId();
    const context = { projectId, correlationId, operation: 'determineDegradationStrategy' };

    logger.info('Determining graceful degradation strategy', {
      ...context,
      preferQuality: options.preferQuality,
      allowEmergencyFallback: options.allowEmergencyFallback,
      minimumLevel: options.minimumLevel
    });

    try {
      // Get comprehensive data availability score
      const dataScore = await dataAvailabilityScorer.calculateDataAvailabilityScore(projectId, {
        includeOptionalMetrics: !options.prioritizeSpeed,
        strictMode: options.preferQuality,
        allowPartialData: true,
        maxWaitTime: options.maxWaitTime
      });

      // Apply custom thresholds if provided
      const effectiveScore = this.applyCustomThresholds(dataScore.overallScore, options.customThresholds);

      // Determine appropriate degradation level
      const selectedLevel = this.selectDegradationLevel(effectiveScore, options);
      const selectedStrategy = this.strategies.get(selectedLevel)!;

      // Find alternative strategies
      const alternativeStrategies = this.getAlternativeStrategies(selectedLevel, effectiveScore);

      // Determine upgrade possibilities
      const upgradeOptions = this.determineUpgradeOptions(dataScore, selectedLevel);

      // Analyze degradation reasons
      const degradationReasons = this.analyzeDegradationReasons(dataScore, selectedLevel);

      // Identify enhancement opportunities
      const enhancementOpportunities = this.identifyEnhancementOpportunities(dataScore);

      const decision: DegradationDecision = {
        projectId,
        dataScore,
        selectedLevel,
        selectedStrategy,
        alternativeStrategies,
        canUpgrade: upgradeOptions.length > 0,
        upgradeOptions,
        degradationReasons,
        enhancementOpportunities,
        decisionTime: new Date()
      };

      const decisionTime = Date.now() - startTime;

      logger.info('Graceful degradation strategy determined', {
        ...context,
        selectedLevel,
        dataScore: effectiveScore,
        qualityLevel: selectedStrategy.qualityLevel,
        estimatedTime: selectedStrategy.estimatedCompletionTime,
        canUpgrade: decision.canUpgrade,
        decisionTime
      });

      // Track degradation decision
      trackBusinessEvent('graceful_degradation_decision', {
        correlationId,
        projectId,
        selectedLevel,
        dataScore: effectiveScore,
        qualityLevel: selectedStrategy.qualityLevel,
        degradationReasons: degradationReasons.length,
        upgradeOptions: upgradeOptions.length,
        decisionTime
      });

      return decision;

    } catch (error) {
      logger.error('Error determining degradation strategy', error as Error, context);
      
      // Fall back to emergency level
      const emergencyStrategy = this.strategies.get(DegradationLevel.EMERGENCY)!;
      
      return {
        projectId,
        dataScore: {
          projectId,
          overallScore: 0,
          scoringTime: new Date(),
          canProceed: false,
          recommendedStrategy: 'FALLBACK_REPORT',
          qualityEstimate: 'INADEQUATE',
          categoryScores: { essential: 0, important: 0, optional: 0, enhancement: 0 },
          metricResults: [],
          blockers: [`Degradation strategy error: ${error instanceof Error ? error.message : 'Unknown error'}`],
          warnings: [],
          recommendations: ['Retry degradation strategy determination'],
          dataFreshnessScore: 0,
          dataCompletenessScore: 0,
          dataQualityScore: 0,
          systemReadinessScore: 0
        },
        selectedLevel: DegradationLevel.EMERGENCY,
        selectedStrategy: emergencyStrategy,
        alternativeStrategies: [],
        canUpgrade: false,
        upgradeOptions: [],
        degradationReasons: ['Strategy determination failed'],
        enhancementOpportunities: [],
        decisionTime: new Date()
      };
    }
  }

  /**
   * Select appropriate degradation level based on score
   */
  private selectDegradationLevel(score: number, options: GracefulDegradationOptions): DegradationLevel {
    // Check minimum level constraint
    if (options.minimumLevel) {
      const minThreshold = this.strategies.get(options.minimumLevel)?.threshold.min ?? 0;
      if (score < minThreshold && !options.allowEmergencyFallback) {
        return options.minimumLevel;
      }
    }

    // Find appropriate level based on score
    const levels = [
      DegradationLevel.FULL,
      DegradationLevel.ENHANCED,
      DegradationLevel.STANDARD,
      DegradationLevel.BASIC,
      DegradationLevel.MINIMAL,
      DegradationLevel.EMERGENCY
    ];

    for (const level of levels) {
      const strategy = this.strategies.get(level)!;
      if (score >= strategy.threshold.min && score <= strategy.threshold.max) {
        return level;
      }
    }

    return DegradationLevel.EMERGENCY;
  }

  /**
   * Get alternative strategies based on current selection
   */
  private getAlternativeStrategies(selectedLevel: DegradationLevel, score: number): DegradationStrategy[] {
    const alternatives: DegradationStrategy[] = [];
    
    // Add one level up if close to threshold
    const upperLevels = [
      DegradationLevel.FULL,
      DegradationLevel.ENHANCED,
      DegradationLevel.STANDARD,
      DegradationLevel.BASIC,
      DegradationLevel.MINIMAL
    ];
    
    const currentIndex = upperLevels.indexOf(selectedLevel);
    if (currentIndex > 0 && score >= this.strategies.get(upperLevels[currentIndex - 1])!.threshold.min - 5) {
      alternatives.push(this.strategies.get(upperLevels[currentIndex - 1])!);
    }

    // Add one level down if user prefers speed
    if (currentIndex < upperLevels.length - 1) {
      alternatives.push(this.strategies.get(upperLevels[currentIndex + 1])!);
    }

    return alternatives;
  }

  /**
   * Determine upgrade options based on missing data
   */
  private determineUpgradeOptions(
    dataScore: DataAvailabilityScore,
    currentLevel: DegradationLevel
  ): Array<{
    level: DegradationLevel;
    requirements: string[];
    estimatedTime: number;
  }> {
    const upgradeOptions: Array<{
      level: DegradationLevel;
      requirements: string[];
      estimatedTime: number;
    }> = [];

    // Determine what's needed for next level
    const levelOrder = [
      DegradationLevel.EMERGENCY,
      DegradationLevel.MINIMAL,
      DegradationLevel.BASIC,
      DegradationLevel.STANDARD,
      DegradationLevel.ENHANCED,
      DegradationLevel.FULL
    ];

    const currentIndex = levelOrder.indexOf(currentLevel);
    
    for (let i = currentIndex + 1; i < levelOrder.length; i++) {
      const targetLevel = levelOrder[i];
      const targetThreshold = this.strategies.get(targetLevel)!.threshold.min;
      
      if (dataScore.overallScore < targetThreshold) {
        const requirements = this.calculateRequirementsForLevel(dataScore, targetLevel);
        const estimatedTime = this.estimateTimeForRequirements(requirements);
        
        upgradeOptions.push({
          level: targetLevel,
          requirements,
          estimatedTime
        });
        
        // Only show next 2 levels to avoid overwhelming user
        if (upgradeOptions.length >= 2) break;
      }
    }

    return upgradeOptions;
  }

  /**
   * Calculate requirements for reaching a specific level
   */
  private calculateRequirementsForLevel(dataScore: DataAvailabilityScore, targetLevel: DegradationLevel): string[] {
    const requirements: string[] = [];
    
    // Analyze what's missing based on metric results
    for (const metric of dataScore.metricResults) {
      if (metric.category === 'ESSENTIAL' && metric.score < 70) {
        requirements.push(`Improve ${metric.name}: ${metric.message}`);
      } else if (metric.category === 'IMPORTANT' && metric.score < 60) {
        requirements.push(`Enhance ${metric.name}: ${metric.message}`);
      }
    }

    // Add specific requirements based on target level
    switch (targetLevel) {
      case DegradationLevel.FULL:
        if (dataScore.dataFreshnessScore < 90) {
          requirements.push('Refresh all data snapshots');
        }
        if (dataScore.dataCompletenessScore < 85) {
          requirements.push('Complete missing data fields');
        }
        break;
      case DegradationLevel.ENHANCED:
        if (dataScore.dataQualityScore < 80) {
          requirements.push('Improve data quality');
        }
        break;
      case DegradationLevel.STANDARD:
        if (dataScore.categoryScores.essential < 70) {
          requirements.push('Ensure essential data availability');
        }
        break;
    }

    return requirements.length > 0 ? requirements : ['No specific requirements identified'];
  }

  /**
   * Estimate time needed to fulfill requirements
   */
  private estimateTimeForRequirements(requirements: string[]): number {
    // Simple estimation: 3 minutes per requirement
    return Math.min(requirements.length * 3, 30); // Cap at 30 minutes
  }

  /**
   * Analyze reasons for degradation
   */
  private analyzeDegradationReasons(dataScore: DataAvailabilityScore, selectedLevel: DegradationLevel): string[] {
    const reasons: string[] = [];

    if (selectedLevel === DegradationLevel.EMERGENCY) {
      reasons.push('Critical data missing or inaccessible');
    }

    if (dataScore.blockers.length > 0) {
      reasons.push(`Blocking issues: ${dataScore.blockers.join(', ')}`);
    }

    if (dataScore.categoryScores.essential < 70) {
      reasons.push('Essential data incomplete');
    }

    if (dataScore.dataFreshnessScore < 60) {
      reasons.push('Data is stale or outdated');
    }

    if (dataScore.categoryScores.important < 60) {
      reasons.push('Important data missing for comprehensive analysis');
    }

    return reasons.length > 0 ? reasons : ['Data availability within acceptable range'];
  }

  /**
   * Identify enhancement opportunities
   */
  private identifyEnhancementOpportunities(dataScore: DataAvailabilityScore): string[] {
    const opportunities: string[] = [];

    // Analyze recommendations from data scoring
    if (dataScore.recommendations.length > 0) {
      opportunities.push(...dataScore.recommendations.slice(0, 3)); // Top 3 recommendations
    }

    // Identify specific enhancement areas
    if (dataScore.categoryScores.optional < 60) {
      opportunities.push('Add optional data for richer insights');
    }

    if (dataScore.categoryScores.enhancement < 40) {
      opportunities.push('Include enhancement data for premium analysis');
    }

    return opportunities;
  }

  /**
   * Apply custom thresholds if provided
   */
  private applyCustomThresholds(score: number, customThresholds?: Partial<Record<DegradationLevel, number>>): number {
    if (!customThresholds) return score;
    
    // This is a simplified implementation - in practice would adjust scoring logic
    return score;
  }

  /**
   * Generate report content based on degradation level
   * Task 4.4: Content generation with graceful degradation
   */
  public async generateDegradedContent(
    decision: DegradationDecision,
    baseContent: any
  ): Promise<any> {
    const correlationId = generateCorrelationId();
    const context = { 
      projectId: decision.projectId, 
      correlationId, 
      level: decision.selectedLevel,
      operation: 'generateDegradedContent' 
    };

    logger.info('Generating content with graceful degradation', context);

    try {
      const strategy = decision.selectedStrategy;
      const degradedContent = {
        ...baseContent,
        degradationLevel: decision.selectedLevel,
        qualityLevel: strategy.qualityLevel,
        userMessage: strategy.userMessage,
        estimatedCompletionTime: strategy.estimatedCompletionTime,
        features: strategy.features,
        sections: strategy.reportSections,
        dataScore: decision.dataScore.overallScore,
        enhancementOpportunities: decision.enhancementOpportunities,
        upgradeOptions: decision.upgradeOptions
      };

      // Apply feature-based content filtering
      if (!strategy.features.competitiveAnalysis) {
        delete degradedContent.competitiveAnalysis;
      }

      if (!strategy.features.marketPositioning) {
        delete degradedContent.marketPositioning;
      }

      if (!strategy.features.detailedMetrics) {
        delete degradedContent.detailedMetrics;
        degradedContent.metricsNote = 'Detailed metrics unavailable due to limited data';
      }

      if (!strategy.features.trendAnalysis) {
        delete degradedContent.trendAnalysis;
      }

      if (!strategy.features.recommendations) {
        delete degradedContent.recommendations;
        degradedContent.recommendationsNote = 'Strategic recommendations require more comprehensive data';
      }

      if (!strategy.features.visualizations) {
        delete degradedContent.charts;
        delete degradedContent.graphs;
        degradedContent.visualNote = 'Visualizations unavailable in this report level';
      }

      // Add degradation-specific content
      degradedContent.dataAvailability = {
        overallScore: decision.dataScore.overallScore,
        categoryScores: decision.dataScore.categoryScores,
        qualityEstimate: decision.dataScore.qualityEstimate,
        degradationReasons: decision.degradationReasons
      };

      // Add fallback content for emergency level
      if (decision.selectedLevel === DegradationLevel.EMERGENCY) {
        return {
          ...strategy.fallbackContent,
          projectId: decision.projectId,
          generationTime: new Date(),
          dataStatus: decision.dataScore,
          nextSteps: decision.enhancementOpportunities
        };
      }

      logger.info('Degraded content generated successfully', {
        ...context,
        sectionsIncluded: strategy.reportSections.length,
        featuresEnabled: Object.values(strategy.features).filter(f => f).length
      });

      trackBusinessEvent('degraded_content_generated', {
        correlationId,
        projectId: decision.projectId,
        degradationLevel: decision.selectedLevel,
        qualityLevel: strategy.qualityLevel,
        sectionsCount: strategy.reportSections.length,
        featuresCount: Object.values(strategy.features).filter(f => f).length
      });

      return degradedContent;

    } catch (error) {
      logger.error('Error generating degraded content', error as Error, context);
      
      // Return emergency fallback
      const emergencyStrategy = this.strategies.get(DegradationLevel.EMERGENCY)!;
      return {
        ...emergencyStrategy.fallbackContent,
        error: 'Content generation failed',
        projectId: decision.projectId,
        generationTime: new Date()
      };
    }
  }

  /**
   * Get strategy information for a specific level
   */
  public getStrategy(level: DegradationLevel): DegradationStrategy | undefined {
    return this.strategies.get(level);
  }

  /**
   * Get all available strategies
   */
  public getAllStrategies(): DegradationStrategy[] {
    return Array.from(this.strategies.values());
  }

  /**
   * Suggest optimal strategy based on user preferences
   */
  public suggestOptimalStrategy(
    dataScore: DataAvailabilityScore,
    preferences: {
      prioritizeQuality?: boolean;
      prioritizeSpeed?: boolean;
      acceptPartialData?: boolean;
      minimumFeatures?: string[];
    }
  ): DegradationLevel {
    if (preferences.prioritizeQuality && dataScore.overallScore >= 80) {
      return dataScore.overallScore >= 90 ? DegradationLevel.FULL : DegradationLevel.ENHANCED;
    }

    if (preferences.prioritizeSpeed && dataScore.overallScore >= 50) {
      return dataScore.overallScore >= 70 ? DegradationLevel.STANDARD : DegradationLevel.BASIC;
    }

    if (preferences.acceptPartialData && dataScore.overallScore >= 40) {
      return DegradationLevel.MINIMAL;
    }

    // Default to score-based selection
    return this.selectDegradationLevel(dataScore.overallScore, {});
  }

  /**
   * Check if upgrade is possible and worthwhile
   */
  public async checkUpgradePossibility(
    projectId: string,
    currentLevel: DegradationLevel
  ): Promise<{
    canUpgrade: boolean;
    nextLevel?: DegradationLevel;
    requirements: string[];
    estimatedTime: number;
    worthUpgrading: boolean;
  }> {
    try {
      const decision = await this.determineDegradationStrategy(projectId);
      
      if (decision.upgradeOptions.length > 0) {
        const nextUpgrade = decision.upgradeOptions[0];
        
        return {
          canUpgrade: true,
          nextLevel: nextUpgrade.level,
          requirements: nextUpgrade.requirements,
          estimatedTime: nextUpgrade.estimatedTime,
          worthUpgrading: nextUpgrade.estimatedTime <= 15 // Worth upgrading if under 15 minutes
        };
      }

      return {
        canUpgrade: false,
        requirements: [],
        estimatedTime: 0,
        worthUpgrading: false
      };

    } catch (error) {
      logger.error('Error checking upgrade possibility', error as Error, { projectId });
      
      return {
        canUpgrade: false,
        requirements: ['Error checking upgrade options'],
        estimatedTime: 0,
        worthUpgrading: false
      };
    }
  }
}

// Export singleton instance
export const gracefulDegradationManager = GracefulDegradationManager.getInstance(); 