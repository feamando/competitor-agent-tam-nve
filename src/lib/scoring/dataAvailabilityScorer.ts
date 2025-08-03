import { prisma } from '@/lib/prisma';
import { logger, generateCorrelationId, trackBusinessEvent } from '@/lib/logger';

export interface DataAvailabilityMetric {
  name: string;
  category: 'ESSENTIAL' | 'IMPORTANT' | 'OPTIONAL' | 'ENHANCEMENT';
  description: string;
  weight: number; // 1-10 for importance in scoring
  evaluator: (projectId: string, context?: any) => Promise<MetricResult>;
  thresholds: {
    excellent: number; // 90-100
    good: number; // 70-89
    acceptable: number; // 50-69
    poor: number; // 0-49
  };
}

export interface MetricResult {
  name: string;
  score: number; // 0-100
  category: 'ESSENTIAL' | 'IMPORTANT' | 'OPTIONAL' | 'ENHANCEMENT';
  weight: number;
  status: 'EXCELLENT' | 'GOOD' | 'ACCEPTABLE' | 'POOR' | 'MISSING';
  message: string;
  details: any;
  recommendations: string[];
  canProceed: boolean;
  impactOnQuality: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export interface DataAvailabilityScore {
  projectId: string;
  overallScore: number; // 0-100
  scoringTime: Date;
  canProceed: boolean;
  recommendedStrategy: 'FULL_REPORT' | 'PARTIAL_REPORT' | 'BASIC_REPORT' | 'FALLBACK_REPORT' | 'DELAY_REPORT';
  qualityEstimate: 'EXCELLENT' | 'GOOD' | 'ACCEPTABLE' | 'POOR' | 'INADEQUATE';
  categoryScores: {
    essential: number;
    important: number;
    optional: number;
    enhancement: number;
  };
  metricResults: MetricResult[];
  blockers: string[];
  warnings: string[];
  recommendations: string[];
  estimatedCompletionTime?: number; // minutes to gather missing data
  dataFreshnessScore: number; // 0-100
  dataCompletenessScore: number; // 0-100
  dataQualityScore: number; // 0-100
  systemReadinessScore: number; // 0-100
}

export interface ScoringOptions {
  includeOptionalMetrics?: boolean;
  strictMode?: boolean;
  maxWaitTime?: number; // milliseconds to wait for data
  allowPartialData?: boolean;
  prioritizeSpeed?: boolean; // favor faster data over comprehensive data
}

export class DataAvailabilityScorer {
  private static instance: DataAvailabilityScorer;
  private metrics: DataAvailabilityMetric[] = [];

  public static getInstance(): DataAvailabilityScorer {
    if (!DataAvailabilityScorer.instance) {
      DataAvailabilityScorer.instance = new DataAvailabilityScorer();
    }
    return DataAvailabilityScorer.instance;
  }

  constructor() {
    this.initializeMetrics();
  }

  /**
   * Initialize data availability metrics
   */
  private initializeMetrics(): void {
    this.metrics = [
      // ESSENTIAL metrics - must have for any report
      {
        name: 'project_exists',
        category: 'ESSENTIAL',
        description: 'Project exists and is accessible',
        weight: 10,
        evaluator: this.evaluateProjectExists.bind(this),
        thresholds: { excellent: 100, good: 100, acceptable: 100, poor: 0 }
      },
      {
        name: 'product_basic_data',
        category: 'ESSENTIAL',
        description: 'Basic product information availability',
        weight: 9,
        evaluator: this.evaluateProductBasicData.bind(this),
        thresholds: { excellent: 95, good: 80, acceptable: 60, poor: 30 }
      },
      {
        name: 'product_snapshots_essential',
        category: 'ESSENTIAL',
        description: 'Critical product snapshot availability',
        weight: 9,
        evaluator: this.evaluateProductSnapshotsEssential.bind(this),
        thresholds: { excellent: 100, good: 80, acceptable: 60, poor: 20 }
      },

      // IMPORTANT metrics - significantly impact report quality
      {
        name: 'product_snapshots_quality',
        category: 'IMPORTANT',
        description: 'Product snapshot quality and freshness',
        weight: 8,
        evaluator: this.evaluateProductSnapshotsQuality.bind(this),
        thresholds: { excellent: 90, good: 75, acceptable: 50, poor: 25 }
      },
      {
        name: 'competitor_basic_data',
        category: 'IMPORTANT',
        description: 'Basic competitor information availability',
        weight: 7,
        evaluator: this.evaluateCompetitorBasicData.bind(this),
        thresholds: { excellent: 90, good: 70, acceptable: 40, poor: 15 }
      },
      {
        name: 'competitor_snapshots',
        category: 'IMPORTANT',
        description: 'Competitor snapshot availability',
        weight: 7,
        evaluator: this.evaluateCompetitorSnapshots.bind(this),
        thresholds: { excellent: 85, good: 65, acceptable: 35, poor: 10 }
      },
      {
        name: 'data_freshness',
        category: 'IMPORTANT',
        description: 'Overall data freshness for reliable analysis',
        weight: 6,
        evaluator: this.evaluateDataFreshness.bind(this),
        thresholds: { excellent: 95, good: 80, acceptable: 60, poor: 30 }
      },

      // OPTIONAL metrics - improve report quality but not critical
      {
        name: 'product_detailed_data',
        category: 'OPTIONAL',
        description: 'Detailed product information (positioning, etc.)',
        weight: 5,
        evaluator: this.evaluateProductDetailedData.bind(this),
        thresholds: { excellent: 95, good: 80, acceptable: 60, poor: 30 }
      },
      {
        name: 'competitor_detailed_data',
        category: 'OPTIONAL',
        description: 'Detailed competitor information',
        weight: 4,
        evaluator: this.evaluateCompetitorDetailedData.bind(this),
        thresholds: { excellent: 90, good: 70, acceptable: 50, poor: 25 }
      },
      {
        name: 'historical_data',
        category: 'OPTIONAL',
        description: 'Historical snapshot data for trend analysis',
        weight: 3,
        evaluator: this.evaluateHistoricalData.bind(this),
        thresholds: { excellent: 85, good: 65, acceptable: 40, poor: 15 }
      },

      // ENHANCEMENT metrics - nice-to-have for premium reports
      {
        name: 'market_data',
        category: 'ENHANCEMENT',
        description: 'Market and industry context data',
        weight: 2,
        evaluator: this.evaluateMarketData.bind(this),
        thresholds: { excellent: 80, good: 60, acceptable: 35, poor: 10 }
      },
      {
        name: 'performance_metrics',
        category: 'ENHANCEMENT',
        description: 'Website performance and technical metrics',
        weight: 2,
        evaluator: this.evaluatePerformanceMetrics.bind(this),
        thresholds: { excellent: 75, good: 55, acceptable: 30, poor: 10 }
      }
    ];
  }

  /**
   * Calculate comprehensive data availability score
   * Task 4.3: Main scoring functionality
   */
  public async calculateDataAvailabilityScore(
    projectId: string,
    options: ScoringOptions = {}
  ): Promise<DataAvailabilityScore> {
    const startTime = Date.now();
    const correlationId = generateCorrelationId();
    const context = { projectId, correlationId, operation: 'calculateDataAvailabilityScore' };

    logger.info('Starting data availability scoring', {
      ...context,
      includeOptionalMetrics: options.includeOptionalMetrics,
      strictMode: options.strictMode,
      allowPartialData: options.allowPartialData
    });

    const result: DataAvailabilityScore = {
      projectId,
      overallScore: 0,
      scoringTime: new Date(),
      canProceed: false,
      recommendedStrategy: 'DELAY_REPORT',
      qualityEstimate: 'INADEQUATE',
      categoryScores: {
        essential: 0,
        important: 0,
        optional: 0,
        enhancement: 0
      },
      metricResults: [],
      blockers: [],
      warnings: [],
      recommendations: [],
      dataFreshnessScore: 0,
      dataCompletenessScore: 0,
      dataQualityScore: 0,
      systemReadinessScore: 0
    };

    try {
      // Filter metrics based on options
      const metricsToEvaluate = this.metrics.filter(metric => {
        if (!options.includeOptionalMetrics && (metric.category === 'OPTIONAL' || metric.category === 'ENHANCEMENT')) {
          return false;
        }
        return true;
      });

      logger.info(`Evaluating ${metricsToEvaluate.length} data availability metrics`, context);

      // Evaluate all metrics in parallel for performance
      const evaluationPromises = metricsToEvaluate.map(async (metric) => {
        try {
          const metricResult = await metric.evaluator(projectId, { correlationId, ...options });
          
          // Determine status based on thresholds
          metricResult.status = this.determineMetricStatus(metricResult.score, metric.thresholds);
          metricResult.category = metric.category;
          metricResult.weight = metric.weight;
          
          // Determine if this metric blocks proceeding
          metricResult.canProceed = metric.category === 'ESSENTIAL' ? metricResult.score >= 50 : true;
          
          // Determine impact on quality
          metricResult.impactOnQuality = this.determineQualityImpact(metric.category, metricResult.status);

          return metricResult;
        } catch (error) {
          logger.error(`Error evaluating metric: ${metric.name}`, error as Error, context);
          
          return {
            name: metric.name,
            score: 0,
            category: metric.category,
            weight: metric.weight,
            status: 'MISSING' as const,
            message: `Evaluation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            details: { error: true },
            recommendations: [`Retry evaluation of ${metric.name}`],
            canProceed: metric.category !== 'ESSENTIAL',
            impactOnQuality: metric.category === 'ESSENTIAL' ? 'CRITICAL' as const : 'MEDIUM' as const
          };
        }
      });

      const metricResults = await Promise.all(evaluationPromises);
      result.metricResults = metricResults;

      // Calculate category scores
      this.calculateCategoryScores(result, metricResults);

      // Calculate overall score
      result.overallScore = this.calculateOverallScore(metricResults);

      // Calculate component scores
      result.dataFreshnessScore = this.calculateComponentScore(metricResults, ['data_freshness', 'product_snapshots_quality']);
      result.dataCompletenessScore = this.calculateComponentScore(metricResults, ['product_basic_data', 'competitor_basic_data', 'product_detailed_data']);
      result.dataQualityScore = this.calculateComponentScore(metricResults, ['product_snapshots_quality', 'competitor_snapshots']);
      result.systemReadinessScore = this.calculateComponentScore(metricResults, ['project_exists']);

      // Determine strategy and quality estimate
      result.recommendedStrategy = this.determineRecommendedStrategy(result, options);
      result.qualityEstimate = this.determineQualityEstimate(result.overallScore);

      // Determine if we can proceed
      const essentialBlockers = metricResults.filter(m => m.category === 'ESSENTIAL' && !m.canProceed);
      result.canProceed = essentialBlockers.length === 0 && (options.allowPartialData || result.overallScore >= 50);

      // Collect blockers, warnings, and recommendations
      result.blockers = metricResults
        .filter(m => m.category === 'ESSENTIAL' && !m.canProceed)
        .map(m => `${m.name}: ${m.message}`);

      result.warnings = metricResults
        .filter(m => m.status === 'POOR' || (m.status === 'ACCEPTABLE' && m.category === 'IMPORTANT'))
        .map(m => `${m.name}: ${m.message}`);

      result.recommendations = metricResults
        .flatMap(m => m.recommendations)
        .filter((rec, index, arr) => arr.indexOf(rec) === index); // Remove duplicates

      // Estimate completion time for missing data
      if (!result.canProceed || result.recommendedStrategy === 'DELAY_REPORT') {
        result.estimatedCompletionTime = this.estimateCompletionTime(metricResults);
      }

      const scoringTime = Date.now() - startTime;

      logger.info('Data availability scoring completed', {
        ...context,
        overallScore: result.overallScore,
        canProceed: result.canProceed,
        recommendedStrategy: result.recommendedStrategy,
        qualityEstimate: result.qualityEstimate,
        blockers: result.blockers.length,
        warnings: result.warnings.length,
        scoringTime
      });

      // Track scoring event
      trackBusinessEvent('data_availability_scoring_completed', {
        correlationId,
        projectId,
        overallScore: result.overallScore,
        canProceed: result.canProceed,
        recommendedStrategy: result.recommendedStrategy,
        qualityEstimate: result.qualityEstimate,
        blockersCount: result.blockers.length,
        warningsCount: result.warnings.length,
        scoringTime
      });

      return result;

    } catch (error) {
      const scoringTime = Date.now() - startTime;
      
      result.blockers.push(`Scoring process failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      result.recommendations.push('Retry data availability scoring');
      
      logger.error('Data availability scoring process failed', error as Error, {
        ...context,
        scoringTime
      });

      return result;
    }
  }

  /**
   * Evaluate project existence
   */
  private async evaluateProjectExists(projectId: string, context?: any): Promise<MetricResult> {
    try {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: {
          id: true,
          name: true,
          status: true,
          createdAt: true
        }
      });

      if (!project) {
        return {
          name: 'project_exists',
          score: 0,
          category: 'ESSENTIAL',
          weight: 10,
          status: 'MISSING',
          message: 'Project not found',
          details: { projectId },
          recommendations: ['Verify project ID'],
          canProceed: false,
          impactOnQuality: 'CRITICAL'
        };
      }

      if (project.status !== 'ACTIVE') {
        return {
          name: 'project_exists',
          score: 30,
          category: 'ESSENTIAL',
          weight: 10,
          status: 'POOR',
          message: `Project status is ${project.status}`,
          details: project,
          recommendations: ['Activate project before generating reports'],
          canProceed: false,
          impactOnQuality: 'CRITICAL'
        };
      }

      return {
        name: 'project_exists',
        score: 100,
        category: 'ESSENTIAL',
        weight: 10,
        status: 'EXCELLENT',
        message: 'Project is active and accessible',
        details: project,
        recommendations: [],
        canProceed: true,
        impactOnQuality: 'NONE'
      };

    } catch (error) {
      return {
        name: 'project_exists',
        score: 0,
        category: 'ESSENTIAL',
        weight: 10,
        status: 'MISSING',
        message: `Project validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: { error: true },
        recommendations: ['Check database connectivity'],
        canProceed: false,
        impactOnQuality: 'CRITICAL'
      };
    }
  }

  /**
   * Evaluate basic product data
   */
  private async evaluateProductBasicData(projectId: string, context?: any): Promise<MetricResult> {
    try {
      const products = await prisma.product.findMany({
        where: { projectId },
        select: {
          id: true,
          name: true,
          website: true,
          industry: true,
          createdAt: true
        }
      });

      if (products.length === 0) {
        return {
          name: 'product_basic_data',
          score: 0,
          category: 'ESSENTIAL',
          weight: 9,
          status: 'MISSING',
          message: 'No products found',
          details: { productCount: 0 },
          recommendations: ['Add products to the project'],
          canProceed: false,
          impactOnQuality: 'CRITICAL'
        };
      }

      let score = 60; // Base score for having products
      const recommendations: string[] = [];
      let productsWithWebsite = 0;
      let productsWithIndustry = 0;

      for (const product of products) {
        if (product.website) {
          productsWithWebsite++;
        } else {
          recommendations.push(`Add website URL for product "${product.name}"`);
        }
        
        if (product.industry) {
          productsWithIndustry++;
        }
      }

      // Adjust score based on data completeness
      score += Math.round((productsWithWebsite / products.length) * 30); // +30 max for websites
      score += Math.round((productsWithIndustry / products.length) * 10); // +10 max for industry

      return {
        name: 'product_basic_data',
        score: Math.min(100, score),
        category: 'ESSENTIAL',
        weight: 9,
        status: 'GOOD',
        message: `${products.length} products, ${productsWithWebsite} with websites`,
        details: {
          productCount: products.length,
          productsWithWebsite,
          productsWithIndustry
        },
        recommendations,
        canProceed: score >= 60,
        impactOnQuality: score >= 80 ? 'LOW' : score >= 60 ? 'MEDIUM' : 'HIGH'
      };

    } catch (error) {
      return {
        name: 'product_basic_data',
        score: 0,
        category: 'ESSENTIAL',
        weight: 9,
        status: 'MISSING',
        message: `Product data evaluation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: { error: true },
        recommendations: ['Retry product data evaluation'],
        canProceed: false,
        impactOnQuality: 'CRITICAL'
      };
    }
  }

  /**
   * Evaluate essential product snapshots
   */
  private async evaluateProductSnapshotsEssential(projectId: string, context?: any): Promise<MetricResult> {
    try {
      const products = await prisma.product.findMany({
        where: { projectId },
        include: {
          snapshots: {
            orderBy: { createdAt: 'desc' },
            take: 1
          }
        }
      });

      if (products.length === 0) {
        return {
          name: 'product_snapshots_essential',
          score: 0,
          category: 'ESSENTIAL',
          weight: 9,
          status: 'MISSING',
          message: 'No products to evaluate snapshots',
          details: {},
          recommendations: ['Add products to the project'],
          canProceed: false,
          impactOnQuality: 'CRITICAL'
        };
      }

      let score = 0;
      let productsWithSnapshots = 0;
      let successfulSnapshots = 0;
      const recommendations: string[] = [];

      for (const product of products) {
        if (product.snapshots.length > 0) {
          productsWithSnapshots++;
          const latestSnapshot = product.snapshots[0];
          
          if (latestSnapshot.captureSuccess) {
            successfulSnapshots++;
            score += 100;
          } else {
            score += 20; // Some credit for attempting
            recommendations.push(`Fix failed snapshot for product "${product.name}"`);
          }
        } else {
          recommendations.push(`Capture snapshot for product "${product.name}"`);
        }
      }

      const averageScore = Math.round(score / products.length);
      const canProceed = successfulSnapshots > 0; // At least one successful snapshot

      return {
        name: 'product_snapshots_essential',
        score: averageScore,
        category: 'ESSENTIAL',
        weight: 9,
        status: 'GOOD',
        message: `${successfulSnapshots}/${products.length} products have successful snapshots`,
        details: {
          productCount: products.length,
          productsWithSnapshots,
          successfulSnapshots
        },
        recommendations,
        canProceed,
        impactOnQuality: canProceed ? (averageScore >= 80 ? 'LOW' : 'MEDIUM') : 'CRITICAL'
      };

    } catch (error) {
      return {
        name: 'product_snapshots_essential',
        score: 0,
        category: 'ESSENTIAL',
        weight: 9,
        status: 'MISSING',
        message: `Product snapshot evaluation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: { error: true },
        recommendations: ['Retry product snapshot evaluation'],
        canProceed: false,
        impactOnQuality: 'CRITICAL'
      };
    }
  }

  /**
   * Evaluate product snapshot quality
   */
  private async evaluateProductSnapshotsQuality(projectId: string, context?: any): Promise<MetricResult> {
    try {
      const snapshots = await prisma.productSnapshot.findMany({
        where: {
          product: { projectId }
        },
        orderBy: { createdAt: 'desc' },
        take: 20 // Recent snapshots
      });

      if (snapshots.length === 0) {
        return {
          name: 'product_snapshots_quality',
          score: 0,
          category: 'IMPORTANT',
          weight: 8,
          status: 'MISSING',
          message: 'No product snapshots available',
          details: {},
          recommendations: ['Capture product snapshots'],
          canProceed: true,
          impactOnQuality: 'HIGH'
        };
      }

      let totalScore = 0;
      let freshSnapshots = 0;
      let successfulSnapshots = 0;
      const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);

      for (const snapshot of snapshots) {
        let snapshotScore = 0;
        
        // Success rate
        if (snapshot.captureSuccess) {
          successfulSnapshots++;
          snapshotScore += 60;
        }
        
        // Freshness
        if (new Date(snapshot.createdAt).getTime() > oneDayAgo) {
          freshSnapshots++;
          snapshotScore += 40;
        } else {
          snapshotScore += 10; // Some credit for older snapshots
        }

        totalScore += snapshotScore;
      }

      const averageScore = Math.round(totalScore / snapshots.length);

      return {
        name: 'product_snapshots_quality',
        score: averageScore,
        category: 'IMPORTANT',
        weight: 8,
        status: 'GOOD',
        message: `${successfulSnapshots} successful snapshots, ${freshSnapshots} fresh`,
        details: {
          snapshotCount: snapshots.length,
          successfulSnapshots,
          freshSnapshots
        },
        recommendations: averageScore < 70 ? ['Improve snapshot capture quality'] : [],
        canProceed: true,
        impactOnQuality: averageScore >= 80 ? 'LOW' : averageScore >= 60 ? 'MEDIUM' : 'HIGH'
      };

    } catch (error) {
      return {
        name: 'product_snapshots_quality',
        score: 0,
        category: 'IMPORTANT',
        weight: 8,
        status: 'MISSING',
        message: `Quality evaluation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: { error: true },
        recommendations: ['Retry quality evaluation'],
        canProceed: true,
        impactOnQuality: 'MEDIUM'
      };
    }
  }

  /**
   * Evaluate basic competitor data
   */
  private async evaluateCompetitorBasicData(projectId: string, context?: any): Promise<MetricResult> {
    try {
      const competitors = await prisma.competitor.findMany({
        where: { projectId },
        select: {
          id: true,
          name: true,
          website: true,
          industry: true,
          description: true
        }
      });

      if (competitors.length === 0) {
        return {
          name: 'competitor_basic_data',
          score: 20,
          category: 'IMPORTANT',
          weight: 7,
          status: 'POOR',
          message: 'No competitors found - limited comparative analysis',
          details: { competitorCount: 0 },
          recommendations: ['Add competitors for comparative analysis'],
          canProceed: true,
          impactOnQuality: 'HIGH'
        };
      }

      let score = 50; // Base score for having competitors
      let competitorsWithWebsite = 0;
      let competitorsWithDescription = 0;

      for (const competitor of competitors) {
        if (competitor.website) competitorsWithWebsite++;
        if (competitor.description) competitorsWithDescription++;
      }

      score += Math.round((competitorsWithWebsite / competitors.length) * 30);
      score += Math.round((competitorsWithDescription / competitors.length) * 20);

      return {
        name: 'competitor_basic_data',
        score: Math.min(100, score),
        category: 'IMPORTANT',
        weight: 7,
        status: 'GOOD',
        message: `${competitors.length} competitors, ${competitorsWithWebsite} with websites`,
        details: {
          competitorCount: competitors.length,
          competitorsWithWebsite,
          competitorsWithDescription
        },
        recommendations: competitorsWithWebsite < competitors.length ? 
          ['Add website URLs for all competitors'] : [],
        canProceed: true,
        impactOnQuality: score >= 70 ? 'LOW' : score >= 40 ? 'MEDIUM' : 'HIGH'
      };

    } catch (error) {
      return {
        name: 'competitor_basic_data',
        score: 0,
        category: 'IMPORTANT',
        weight: 7,
        status: 'MISSING',
        message: `Competitor evaluation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: { error: true },
        recommendations: ['Retry competitor evaluation'],
        canProceed: true,
        impactOnQuality: 'MEDIUM'
      };
    }
  }

  /**
   * Evaluate competitor snapshots
   */
  private async evaluateCompetitorSnapshots(projectId: string, context?: any): Promise<MetricResult> {
    try {
      const competitors = await prisma.competitor.findMany({
        where: { projectId },
        include: {
          snapshots: {
            orderBy: { createdAt: 'desc' },
            take: 1
          }
        }
      });

      if (competitors.length === 0) {
        return {
          name: 'competitor_snapshots',
          score: 20,
          category: 'IMPORTANT',
          weight: 7,
          status: 'POOR',
          message: 'No competitors to evaluate snapshots',
          details: {},
          recommendations: ['Add competitors to the project'],
          canProceed: true,
          impactOnQuality: 'MEDIUM'
        };
      }

      let score = 0;
      let competitorsWithSnapshots = 0;
      let successfulSnapshots = 0;

      for (const competitor of competitors) {
        if (competitor.snapshots.length > 0) {
          competitorsWithSnapshots++;
          const latestSnapshot = competitor.snapshots[0];
          
          if (latestSnapshot.captureSuccess) {
            successfulSnapshots++;
            score += 100;
          } else {
            score += 30;
          }
        } else {
          score += 10; // Some credit for having competitor defined
        }
      }

      const averageScore = Math.round(score / competitors.length);

      return {
        name: 'competitor_snapshots',
        score: averageScore,
        category: 'IMPORTANT',
        weight: 7,
        status: 'GOOD',
        message: `${successfulSnapshots}/${competitors.length} competitors have successful snapshots`,
        details: {
          competitorCount: competitors.length,
          competitorsWithSnapshots,
          successfulSnapshots
        },
        recommendations: successfulSnapshots < competitors.length ? 
          ['Capture snapshots for all competitors'] : [],
        canProceed: true,
        impactOnQuality: averageScore >= 70 ? 'LOW' : averageScore >= 35 ? 'MEDIUM' : 'HIGH'
      };

    } catch (error) {
      return {
        name: 'competitor_snapshots',
        score: 0,
        category: 'IMPORTANT',
        weight: 7,
        status: 'MISSING',
        message: `Snapshot evaluation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: { error: true },
        recommendations: ['Retry snapshot evaluation'],
        canProceed: true,
        impactOnQuality: 'MEDIUM'
      };
    }
  }

  /**
   * Evaluate data freshness
   */
  private async evaluateDataFreshness(projectId: string, context?: any): Promise<MetricResult> {
    try {
      const [productSnapshots, competitorSnapshots] = await Promise.all([
        prisma.productSnapshot.findMany({
          where: { product: { projectId } },
          orderBy: { createdAt: 'desc' },
          take: 10
        }),
        prisma.competitorSnapshot.findMany({
          where: { competitor: { projectId } },
          orderBy: { createdAt: 'desc' },
          take: 20
        })
      ]);

      const allSnapshots = [...productSnapshots, ...competitorSnapshots];
      
      if (allSnapshots.length === 0) {
        return {
          name: 'data_freshness',
          score: 0,
          category: 'IMPORTANT',
          weight: 6,
          status: 'MISSING',
          message: 'No snapshots available for freshness assessment',
          details: {},
          recommendations: ['Capture data snapshots'],
          canProceed: true,
          impactOnQuality: 'MEDIUM'
        };
      }

      const now = Date.now();
      const oneHour = 60 * 60 * 1000;
      const oneDay = 24 * oneHour;
      const oneWeek = 7 * oneDay;

      let freshCount = 0;
      let recentCount = 0;
      let staleCount = 0;

      allSnapshots.forEach(snapshot => {
        const age = now - new Date(snapshot.createdAt).getTime();
        if (age < oneHour) {
          freshCount++;
        } else if (age < oneDay) {
          recentCount++;
        } else if (age < oneWeek) {
          staleCount++;
        }
      });

      let score = 0;
      score += (freshCount / allSnapshots.length) * 100; // Fresh data gets full score
      score += (recentCount / allSnapshots.length) * 80; // Recent data gets 80%
      score += (staleCount / allSnapshots.length) * 40; // Stale data gets 40%

      score = Math.round(score);

      return {
        name: 'data_freshness',
        score,
        category: 'IMPORTANT',
        weight: 6,
        status: 'GOOD',
        message: `${freshCount} fresh, ${recentCount} recent, ${staleCount} stale snapshots`,
        details: {
          totalSnapshots: allSnapshots.length,
          freshCount,
          recentCount,
          staleCount
        },
        recommendations: score < 60 ? ['Refresh stale data snapshots'] : [],
        canProceed: true,
        impactOnQuality: score >= 80 ? 'LOW' : score >= 60 ? 'MEDIUM' : 'HIGH'
      };

    } catch (error) {
      return {
        name: 'data_freshness',
        score: 0,
        category: 'IMPORTANT',
        weight: 6,
        status: 'MISSING',
        message: `Freshness evaluation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: { error: true },
        recommendations: ['Retry freshness evaluation'],
        canProceed: true,
        impactOnQuality: 'MEDIUM'
      };
    }
  }

  /**
   * Placeholder evaluators for remaining metrics
   */
  private async evaluateProductDetailedData(projectId: string, context?: any): Promise<MetricResult> {
    // Implementation would check positioning, customer data, etc.
    return {
      name: 'product_detailed_data',
      score: 70,
      category: 'OPTIONAL',
      weight: 5,
      status: 'GOOD',
      message: 'Product detailed data evaluation placeholder',
      details: {},
      recommendations: [],
      canProceed: true,
      impactOnQuality: 'LOW'
    };
  }

  private async evaluateCompetitorDetailedData(projectId: string, context?: any): Promise<MetricResult> {
    return {
      name: 'competitor_detailed_data',
      score: 60,
      category: 'OPTIONAL',
      weight: 4,
      status: 'ACCEPTABLE',
      message: 'Competitor detailed data evaluation placeholder',
      details: {},
      recommendations: [],
      canProceed: true,
      impactOnQuality: 'LOW'
    };
  }

  private async evaluateHistoricalData(projectId: string, context?: any): Promise<MetricResult> {
    return {
      name: 'historical_data',
      score: 40,
      category: 'OPTIONAL',
      weight: 3,
      status: 'POOR',
      message: 'Historical data evaluation placeholder',
      details: {},
      recommendations: [],
      canProceed: true,
      impactOnQuality: 'LOW'
    };
  }

  private async evaluateMarketData(projectId: string, context?: any): Promise<MetricResult> {
    return {
      name: 'market_data',
      score: 30,
      category: 'ENHANCEMENT',
      weight: 2,
      status: 'POOR',
      message: 'Market data evaluation placeholder',
      details: {},
      recommendations: [],
      canProceed: true,
      impactOnQuality: 'NONE'
    };
  }

  private async evaluatePerformanceMetrics(projectId: string, context?: any): Promise<MetricResult> {
    return {
      name: 'performance_metrics',
      score: 25,
      category: 'ENHANCEMENT',
      weight: 2,
      status: 'POOR',
      message: 'Performance metrics evaluation placeholder',
      details: {},
      recommendations: [],
      canProceed: true,
      impactOnQuality: 'NONE'
    };
  }

  /**
   * Helper methods for scoring calculations
   */
  private determineMetricStatus(score: number, thresholds: any): 'EXCELLENT' | 'GOOD' | 'ACCEPTABLE' | 'POOR' | 'MISSING' {
    if (score >= thresholds.excellent) return 'EXCELLENT';
    if (score >= thresholds.good) return 'GOOD';
    if (score >= thresholds.acceptable) return 'ACCEPTABLE';
    if (score > 0) return 'POOR';
    return 'MISSING';
  }

  private determineQualityImpact(category: string, status: string): 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    if (category === 'ESSENTIAL') {
      return status === 'MISSING' || status === 'POOR' ? 'CRITICAL' : 'MEDIUM';
    } else if (category === 'IMPORTANT') {
      return status === 'MISSING' ? 'HIGH' : status === 'POOR' ? 'MEDIUM' : 'LOW';
    } else {
      return 'LOW';
    }
  }

  private calculateCategoryScores(result: DataAvailabilityScore, metricResults: MetricResult[]): void {
    const categories = ['ESSENTIAL', 'IMPORTANT', 'OPTIONAL', 'ENHANCEMENT'] as const;
    
    categories.forEach(category => {
      const categoryMetrics = metricResults.filter(m => m.category === category);
      if (categoryMetrics.length > 0) {
        const totalWeightedScore = categoryMetrics.reduce((sum, m) => sum + (m.score * m.weight), 0);
        const totalWeight = categoryMetrics.reduce((sum, m) => sum + m.weight, 0);
        const categoryScore = Math.round(totalWeightedScore / totalWeight);
        
        result.categoryScores[category.toLowerCase() as keyof typeof result.categoryScores] = categoryScore;
      }
    });
  }

  private calculateOverallScore(metricResults: MetricResult[]): number {
    if (metricResults.length === 0) return 0;
    
    const totalWeightedScore = metricResults.reduce((sum, m) => sum + (m.score * m.weight), 0);
    const totalWeight = metricResults.reduce((sum, m) => sum + m.weight, 0);
    
    return Math.round(totalWeightedScore / totalWeight);
  }

  private calculateComponentScore(metricResults: MetricResult[], metricNames: string[]): number {
    const relevantMetrics = metricResults.filter(m => metricNames.includes(m.name));
    if (relevantMetrics.length === 0) return 0;
    
    const totalScore = relevantMetrics.reduce((sum, m) => sum + m.score, 0);
    return Math.round(totalScore / relevantMetrics.length);
  }

  private determineRecommendedStrategy(result: DataAvailabilityScore, options: ScoringOptions): DataAvailabilityScore['recommendedStrategy'] {
    if (result.blockers.length > 0) {
      return 'DELAY_REPORT';
    }
    
    if (result.overallScore >= 85 && result.categoryScores.essential >= 90) {
      return 'FULL_REPORT';
    } else if (result.overallScore >= 70 && result.categoryScores.essential >= 70) {
      return 'PARTIAL_REPORT';
    } else if (result.overallScore >= 50 && result.categoryScores.essential >= 50) {
      return 'BASIC_REPORT';
    } else if (options.allowPartialData) {
      return 'FALLBACK_REPORT';
    } else {
      return 'DELAY_REPORT';
    }
  }

  private determineQualityEstimate(overallScore: number): DataAvailabilityScore['qualityEstimate'] {
    if (overallScore >= 90) return 'EXCELLENT';
    if (overallScore >= 75) return 'GOOD';
    if (overallScore >= 60) return 'ACCEPTABLE';
    if (overallScore >= 40) return 'POOR';
    return 'INADEQUATE';
  }

  private estimateCompletionTime(metricResults: MetricResult[]): number {
    // Estimate based on missing essential data
    const essentialMissing = metricResults.filter(m => 
      m.category === 'ESSENTIAL' && (m.status === 'MISSING' || m.status === 'POOR')
    ).length;
    
    const importantMissing = metricResults.filter(m => 
      m.category === 'IMPORTANT' && (m.status === 'MISSING' || m.status === 'POOR')
    ).length;
    
    // Rough estimate: 5 minutes per essential item, 3 minutes per important item
    return (essentialMissing * 5) + (importantMissing * 3);
  }

  /**
   * Quick score for fast decisions
   */
  public async quickScore(projectId: string): Promise<{
    score: number;
    canProceed: boolean;
    strategy: string;
  }> {
    try {
      const result = await this.calculateDataAvailabilityScore(projectId, {
        includeOptionalMetrics: false,
        allowPartialData: true,
        prioritizeSpeed: true
      });

      return {
        score: result.overallScore,
        canProceed: result.canProceed,
        strategy: result.recommendedStrategy
      };
    } catch (error) {
      return {
        score: 0,
        canProceed: false,
        strategy: 'DELAY_REPORT'
      };
    }
  }
}

// Export singleton instance
export const dataAvailabilityScorer = DataAvailabilityScorer.getInstance(); 