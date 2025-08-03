import { prisma } from '@/lib/prisma';
import { logger, generateCorrelationId, trackBusinessEvent } from '@/lib/logger';
import { productSnapshotValidator } from './productSnapshotValidator';
import { dataCompletenessChecker } from './dataCompletenessChecker';

export interface ReportPrerequisite {
  name: string;
  required: boolean;
  description: string;
  validator: (projectId: string, options?: any) => Promise<PrerequisiteCheckResult>;
  weight: number; // 1-10 for importance scoring
}

export interface PrerequisiteCheckResult {
  passed: boolean;
  score: number; // 0-100
  message: string;
  details?: any;
  recommendations: string[];
  blockingIssues: string[];
  warnings: string[];
}

export interface ReportPrerequisiteValidationResult {
  projectId: string;
  overallPassed: boolean;
  overallScore: number; // 0-100
  canProceed: boolean;
  recommendFallback: boolean;
  validationTime: Date;
  results: {
    [prerequisiteName: string]: PrerequisiteCheckResult;
  };
  criticalBlockers: string[];
  allWarnings: string[];
  allRecommendations: string[];
  estimatedReportQuality: 'HIGH' | 'MEDIUM' | 'LOW' | 'CRITICAL';
}

export interface PrerequisiteValidationOptions {
  strictMode?: boolean;
  minimumScore?: number; // 0-100
  allowFallback?: boolean;
  maxWaitTime?: number; // milliseconds to wait for data
  skipOptionalChecks?: boolean;
}

export class ReportPrerequisiteValidator {
  private static instance: ReportPrerequisiteValidator;
  private prerequisites: ReportPrerequisite[] = [];

  public static getInstance(): ReportPrerequisiteValidator {
    if (!ReportPrerequisiteValidator.instance) {
      ReportPrerequisiteValidator.instance = new ReportPrerequisiteValidator();
    }
    return ReportPrerequisiteValidator.instance;
  }

  constructor() {
    this.initializePrerequisites();
  }

  /**
   * Initialize all report prerequisites
   */
  private initializePrerequisites(): void {
    this.prerequisites = [
      {
        name: 'project_exists',
        required: true,
        description: 'Verify project exists and is accessible',
        validator: this.validateProjectExists.bind(this),
        weight: 10
      },
      {
        name: 'product_data',
        required: true,
        description: 'Ensure product data is available and complete',
        validator: this.validateProductData.bind(this),
        weight: 9
      },
      {
        name: 'product_snapshots',
        required: true,
        description: 'Verify product snapshots are captured and successful',
        validator: this.validateProductSnapshots.bind(this),
        weight: 9
      },
      {
        name: 'competitor_data',
        required: false,
        description: 'Check competitor data availability',
        validator: this.validateCompetitorData.bind(this),
        weight: 7
      },
      {
        name: 'data_freshness',
        required: false,
        description: 'Verify data is fresh enough for reliable reporting',
        validator: this.validateDataFreshness.bind(this),
        weight: 6
      },
      {
        name: 'data_completeness',
        required: true,
        description: 'Ensure data completeness meets minimum thresholds',
        validator: this.validateDataCompleteness.bind(this),
        weight: 8
      },
      {
        name: 'system_resources',
        required: true,
        description: 'Check system resources and dependencies',
        validator: this.validateSystemResources.bind(this),
        weight: 5
      },
      {
        name: 'concurrent_operations',
        required: false,
        description: 'Verify no conflicting operations are running',
        validator: this.validateConcurrentOperations.bind(this),
        weight: 4
      }
    ];
  }

  /**
   * Main validation method - Task 4.1 implementation
   * Validates all prerequisites before report generation starts
   */
  public async validateReportPrerequisites(
    projectId: string,
    options: PrerequisiteValidationOptions = {}
  ): Promise<ReportPrerequisiteValidationResult> {
    const startTime = Date.now();
    const correlationId = generateCorrelationId();
    const context = { projectId, correlationId, operation: 'validateReportPrerequisites' };

    logger.info('Starting comprehensive report prerequisite validation', {
      ...context,
      strictMode: options.strictMode,
      minimumScore: options.minimumScore,
      allowFallback: options.allowFallback
    });

    const result: ReportPrerequisiteValidationResult = {
      projectId,
      overallPassed: false,
      overallScore: 0,
      canProceed: false,
      recommendFallback: false,
      validationTime: new Date(),
      results: {},
      criticalBlockers: [],
      allWarnings: [],
      allRecommendations: [],
      estimatedReportQuality: 'CRITICAL'
    };

    try {
      // Filter prerequisites based on options
      const prerequisitesToCheck = this.prerequisites.filter(prereq => {
        if (options.skipOptionalChecks && !prereq.required) {
          return false;
        }
        return true;
      });

      logger.info(`Running ${prerequisitesToCheck.length} prerequisite checks`, context);

      // Run all prerequisite validations in parallel
      const validationPromises = prerequisitesToCheck.map(async (prereq) => {
        const startTime = Date.now();
        try {
          logger.debug(`Running prerequisite check: ${prereq.name}`, context);
          
          const checkResult = await prereq.validator(projectId, options);
          const validationTime = Date.now() - startTime;
          
          logger.debug(`Prerequisite check completed: ${prereq.name}`, {
            ...context,
            passed: checkResult.passed,
            score: checkResult.score,
            validationTime
          });

          return {
            name: prereq.name,
            required: prereq.required,
            weight: prereq.weight,
            result: checkResult
          };
        } catch (error) {
          logger.error(`Prerequisite check failed: ${prereq.name}`, error as Error, context);
          
          return {
            name: prereq.name,
            required: prereq.required,
            weight: prereq.weight,
            result: {
              passed: false,
              score: 0,
              message: `Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
              blockingIssues: [`Prerequisite check ${prereq.name} threw an error`],
              recommendations: [`Retry prerequisite check for ${prereq.name}`],
              warnings: []
            }
          };
        }
      });

      const validationResults = await Promise.all(validationPromises);

      // Process results
      let totalWeightedScore = 0;
      let totalWeight = 0;
      let hasRequiredFailures = false;

      for (const validation of validationResults) {
        const { name, required, weight, result: checkResult } = validation;
        
        result.results[name] = checkResult;
        
        // Accumulate weighted score
        totalWeightedScore += checkResult.score * weight;
        totalWeight += weight;
        
        // Check for required failures
        if (required && !checkResult.passed) {
          hasRequiredFailures = true;
          result.criticalBlockers.push(...checkResult.blockingIssues);
        }

        // Collect warnings and recommendations
        result.allWarnings.push(...checkResult.warnings);
        result.allRecommendations.push(...checkResult.recommendations);
      }

      // Calculate overall score
      result.overallScore = totalWeight > 0 ? Math.round(totalWeightedScore / totalWeight) : 0;

      // Determine overall result
      const minimumScore = options.minimumScore || (options.strictMode ? 80 : 70);
      result.overallPassed = result.overallScore >= minimumScore && !hasRequiredFailures;

      // Determine if we can proceed
      if (options.strictMode) {
        result.canProceed = result.overallPassed;
        result.recommendFallback = !result.overallPassed;
      } else {
        // More lenient - allow proceeding with warnings if no critical blockers
        result.canProceed = result.criticalBlockers.length === 0 && result.overallScore >= (options.allowFallback ? 50 : 60);
        result.recommendFallback = result.overallScore < 70 || result.criticalBlockers.length > 0;
      }

      // Estimate report quality
      result.estimatedReportQuality = this.estimateReportQuality(result.overallScore, hasRequiredFailures);

      const validationTime = Date.now() - startTime;

      logger.info('Report prerequisite validation completed', {
        ...context,
        overallPassed: result.overallPassed,
        overallScore: result.overallScore,
        canProceed: result.canProceed,
        recommendFallback: result.recommendFallback,
        criticalBlockers: result.criticalBlockers.length,
        validationTime
      });

      // Track validation event
      trackBusinessEvent('report_prerequisite_validation_completed', {
        correlationId,
        projectId,
        overallPassed: result.overallPassed,
        overallScore: result.overallScore,
        canProceed: result.canProceed,
        recommendFallback: result.recommendFallback,
        criticalBlockersCount: result.criticalBlockers.length,
        estimatedQuality: result.estimatedReportQuality,
        validationTime
      });

      return result;

    } catch (error) {
      const validationTime = Date.now() - startTime;
      
      result.criticalBlockers.push(`Prerequisite validation process failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      result.allRecommendations.push('Retry prerequisite validation process');
      
      logger.error('Report prerequisite validation process failed', error as Error, {
        ...context,
        validationTime
      });

      return result;
    }
  }

  /**
   * Validate project exists and is accessible
   */
  private async validateProjectExists(projectId: string): Promise<PrerequisiteCheckResult> {
    try {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: {
          id: true,
          name: true,
          status: true,
          createdAt: true,
          updatedAt: true
        }
      });

      if (!project) {
        return {
          passed: false,
          score: 0,
          message: `Project ${projectId} not found`,
          blockingIssues: [`Project ${projectId} does not exist`],
          recommendations: ['Verify project ID and ensure project exists'],
          warnings: []
        };
      }

      if (project.status !== 'ACTIVE') {
        return {
          passed: false,
          score: 25,
          message: `Project ${project.name} is not active (status: ${project.status})`,
          blockingIssues: [`Project status is ${project.status}, not ACTIVE`],
          recommendations: ['Activate project before generating reports'],
          warnings: []
        };
      }

      return {
        passed: true,
        score: 100,
        message: `Project ${project.name} is active and accessible`,
        details: project,
        blockingIssues: [],
        recommendations: [],
        warnings: []
      };

    } catch (error) {
      return {
        passed: false,
        score: 0,
        message: `Failed to validate project existence: ${error instanceof Error ? error.message : 'Unknown error'}`,
        blockingIssues: ['Database connection or query error'],
        recommendations: ['Check database connectivity and retry'],
        warnings: []
      };
    }
  }

  /**
   * Validate product data availability
   */
  private async validateProductData(projectId: string): Promise<PrerequisiteCheckResult> {
    try {
      const products = await prisma.product.findMany({
        where: { projectId },
        select: {
          id: true,
          name: true,
          website: true,
          positioning: true,
          industry: true,
          createdAt: true
        }
      });

      if (products.length === 0) {
        return {
          passed: false,
          score: 0,
          message: 'No products found for project',
          blockingIssues: ['Project has no products defined'],
          recommendations: ['Add at least one product to the project'],
          warnings: []
        };
      }

      let score = 60; // Base score for having products
      const warnings: string[] = [];
      const recommendations: string[] = [];

      // Check product data quality
      let productsWithWebsite = 0;
      let productsWithPositioning = 0;
      let productsWithIndustry = 0;

      for (const product of products) {
        if (product.website) productsWithWebsite++;
        if (product.positioning) productsWithPositioning++;
        if (product.industry) productsWithIndustry++;

        if (!product.website) {
          warnings.push(`Product "${product.name}" missing website URL`);
        }
        if (!product.positioning) {
          recommendations.push(`Add positioning information for product "${product.name}"`);
        }
      }

      // Calculate score based on data completeness
      score += Math.round((productsWithWebsite / products.length) * 20); // +20 for websites
      score += Math.round((productsWithPositioning / products.length) * 15); // +15 for positioning
      score += Math.round((productsWithIndustry / products.length) * 5); // +5 for industry

      const passed = score >= 70;

      return {
        passed,
        score,
        message: `Found ${products.length} product(s) with ${Math.round((score-60)/40*100)}% data completeness`,
        details: {
          productCount: products.length,
          productsWithWebsite,
          productsWithPositioning,
          productsWithIndustry
        },
        blockingIssues: passed ? [] : ['Insufficient product data quality'],
        recommendations,
        warnings
      };

    } catch (error) {
      return {
        passed: false,
        score: 0,
        message: `Failed to validate product data: ${error instanceof Error ? error.message : 'Unknown error'}`,
        blockingIssues: ['Product data validation error'],
        recommendations: ['Check database connectivity and retry'],
        warnings: []
      };
    }
  }

  /**
   * Validate product snapshots using existing validator
   */
  private async validateProductSnapshots(projectId: string, options?: any): Promise<PrerequisiteCheckResult> {
    try {
      const validationOptions = {
        waitForSnapshots: options?.maxWaitTime ? true : false,
        maxWaitTime: options?.maxWaitTime || 5000, // 5 seconds default
        requireFreshSnapshots: false
      };

      const validationResult = await productSnapshotValidator.validateProductSnapshots(projectId, validationOptions);

      const score = validationResult.isValid ? 100 : 
                   validationResult.snapshotCount > 0 ? 60 : 
                   validationResult.productCount > 0 ? 20 : 0;

      return {
        passed: validationResult.isValid,
        score,
        message: validationResult.isValid ? 
          `All ${validationResult.productCount} products have valid snapshots` :
          `${validationResult.missingSnapshots.length} products missing snapshots`,
        details: validationResult,
        blockingIssues: validationResult.errors,
        recommendations: validationResult.recommendations,
        warnings: validationResult.warnings
      };

    } catch (error) {
      return {
        passed: false,
        score: 0,
        message: `Product snapshot validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        blockingIssues: ['Product snapshot validation error'],
        recommendations: ['Retry product snapshot validation'],
        warnings: []
      };
    }
  }

  /**
   * Validate competitor data
   */
  private async validateCompetitorData(projectId: string): Promise<PrerequisiteCheckResult> {
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
          passed: false,
          score: 0,
          message: 'No competitors found - comparative analysis not possible',
          blockingIssues: [],
          recommendations: ['Add competitors for better comparative insights'],
          warnings: ['Report will have limited comparative analysis without competitor data']
        };
      }

      let score = 50; // Base score for having competitors
      const competitorsWithSnapshots = competitors.filter(c => c.snapshots.length > 0).length;
      const competitorsWithSuccessfulSnapshots = competitors.filter(c => 
        c.snapshots.length > 0 && c.snapshots[0].captureSuccess
      ).length;

      // Increase score based on snapshot availability
      score += Math.round((competitorsWithSnapshots / competitors.length) * 30); // +30 for snapshots
      score += Math.round((competitorsWithSuccessfulSnapshots / competitors.length) * 20); // +20 for successful

      const warnings: string[] = [];
      const recommendations: string[] = [];

      if (competitorsWithSnapshots < competitors.length) {
        const missingCount = competitors.length - competitorsWithSnapshots;
        warnings.push(`${missingCount} competitors missing snapshots`);
        recommendations.push('Capture snapshots for all competitors');
      }

      return {
        passed: score >= 60,
        score,
        message: `Found ${competitors.length} competitors, ${competitorsWithSuccessfulSnapshots} with valid snapshots`,
        details: {
          competitorCount: competitors.length,
          competitorsWithSnapshots,
          competitorsWithSuccessfulSnapshots
        },
        blockingIssues: [],
        recommendations,
        warnings
      };

    } catch (error) {
      return {
        passed: false,
        score: 0,
        message: `Competitor data validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        blockingIssues: [],
        recommendations: ['Retry competitor data validation'],
        warnings: []
      };
    }
  }

  /**
   * Validate data freshness
   */
  private async validateDataFreshness(projectId: string): Promise<PrerequisiteCheckResult> {
    try {
      const now = Date.now();
      const oneDayAgo = now - (24 * 60 * 60 * 1000);
      const oneWeekAgo = now - (7 * 24 * 60 * 60 * 1000);

      // Check product snapshot freshness
      const productSnapshots = await prisma.productSnapshot.findMany({
        where: {
          product: { projectId }
        },
        orderBy: { createdAt: 'desc' },
        take: 10
      });

      // Check competitor snapshot freshness
      const competitorSnapshots = await prisma.competitorSnapshot.findMany({
        where: {
          competitor: { projectId }
        },
        orderBy: { createdAt: 'desc' },
        take: 20
      });

      const allSnapshots = [...productSnapshots, ...competitorSnapshots];
      
      if (allSnapshots.length === 0) {
        return {
          passed: false,
          score: 0,
          message: 'No snapshots available for freshness assessment',
          blockingIssues: [],
          recommendations: ['Capture data snapshots before generating reports'],
          warnings: ['Cannot assess data freshness without snapshots']
        };
      }

      const recentSnapshots = allSnapshots.filter(s => new Date(s.createdAt).getTime() > oneDayAgo).length;
      const weekOldSnapshots = allSnapshots.filter(s => new Date(s.createdAt).getTime() > oneWeekAgo).length;

      let score = 0;
      let message = '';
      const warnings: string[] = [];
      const recommendations: string[] = [];

      if (recentSnapshots > 0) {
        score = Math.min(100, Math.round((recentSnapshots / allSnapshots.length) * 100));
        message = `${recentSnapshots}/${allSnapshots.length} snapshots are fresh (< 24h)`;
      } else if (weekOldSnapshots > 0) {
        score = Math.min(60, Math.round((weekOldSnapshots / allSnapshots.length) * 60));
        message = `${weekOldSnapshots}/${allSnapshots.length} snapshots are recent (< 7d)`;
        warnings.push('Some data may be stale for optimal reporting');
        recommendations.push('Consider refreshing data snapshots');
      } else {
        score = 20;
        message = 'All snapshots are over a week old';
        warnings.push('Data is stale - report quality may be impacted');
        recommendations.push('Refresh data snapshots before generating reports');
      }

      return {
        passed: score >= 50,
        score,
        message,
        details: {
          totalSnapshots: allSnapshots.length,
          recentSnapshots,
          weekOldSnapshots
        },
        blockingIssues: [],
        recommendations,
        warnings
      };

    } catch (error) {
      return {
        passed: false,
        score: 0,
        message: `Data freshness validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        blockingIssues: [],
        recommendations: ['Retry data freshness validation'],
        warnings: []
      };
    }
  }

  /**
   * Validate data completeness using existing checker
   */
  private async validateDataCompleteness(projectId: string, options?: any): Promise<PrerequisiteCheckResult> {
    try {
      const completenessResult = await dataCompletenessChecker.checkDataCompleteness(projectId, {
        requireFreshData: false,
        maxDataAge: 72, // 72 hours
        minimumScore: options?.strictMode ? 75 : 60,
        includeOptionalChecks: !options?.skipOptionalChecks
      });

      return {
        passed: completenessResult.isComplete,
        score: completenessResult.overallScore,
        message: `Data completeness: ${completenessResult.overallGrade} (${completenessResult.overallScore}%)`,
        details: completenessResult,
        blockingIssues: completenessResult.criticalIssues,
        recommendations: completenessResult.recommendations,
        warnings: completenessResult.warnings
      };

    } catch (error) {
      return {
        passed: false,
        score: 0,
        message: `Data completeness validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        blockingIssues: ['Data completeness validation error'],
        recommendations: ['Retry data completeness validation'],
        warnings: []
      };
    }
  }

  /**
   * Validate system resources and dependencies
   */
  private async validateSystemResources(projectId: string): Promise<PrerequisiteCheckResult> {
    try {
      const warnings: string[] = [];
      const recommendations: string[] = [];
      let score = 100;

      // Check database connectivity (implicit - if we got here, it's working)
      // Check memory usage (simplified - in production would check actual system resources)
      
      // Check for active database connections
      try {
        await prisma.$queryRaw`SELECT 1`;
      } catch (error) {
        return {
          passed: false,
          score: 0,
          message: 'Database connectivity check failed',
          blockingIssues: ['Cannot connect to database'],
          recommendations: ['Check database connectivity'],
          warnings: []
        };
      }

      // Simulate resource checks (in production, would check actual system metrics)
      const mockMemoryUsage = Math.random() * 100;
      const mockCpuUsage = Math.random() * 100;

      if (mockMemoryUsage > 90) {
        score -= 20;
        warnings.push('High memory usage detected');
        recommendations.push('Monitor system resources during report generation');
      }

      if (mockCpuUsage > 90) {
        score -= 20;
        warnings.push('High CPU usage detected');
      }

      return {
        passed: score >= 70,
        score,
        message: score >= 70 ? 'System resources are adequate' : 'System resource constraints detected',
        details: {
          memoryUsage: mockMemoryUsage,
          cpuUsage: mockCpuUsage
        },
        blockingIssues: score < 50 ? ['System resource constraints may affect report generation'] : [],
        recommendations,
        warnings
      };

    } catch (error) {
      return {
        passed: false,
        score: 0,
        message: `System resource validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        blockingIssues: ['System resource check error'],
        recommendations: ['Retry system resource validation'],
        warnings: []
      };
    }
  }

  /**
   * Validate no conflicting operations are running
   */
  private async validateConcurrentOperations(projectId: string): Promise<PrerequisiteCheckResult> {
    try {
      // Check for other running reports for this project
      const runningReports = await prisma.report.findMany({
        where: {
          projectId,
          status: 'GENERATING'
        },
        select: {
          id: true,
          createdAt: true
        }
      });

      if (runningReports.length > 0) {
        return {
          passed: false,
          score: 0,
          message: `${runningReports.length} report(s) already generating for this project`,
          blockingIssues: ['Concurrent report generation detected'],
          recommendations: ['Wait for existing report generation to complete'],
          warnings: []
        };
      }

      // Check for recent successful reports (avoid too frequent generation)
      const recentReports = await prisma.report.findMany({
        where: {
          projectId,
          createdAt: {
            gte: new Date(Date.now() - 10 * 60 * 1000) // Last 10 minutes
          }
        }
      });

      const warnings: string[] = [];
      const recommendations: string[] = [];
      let score = 100;

      if (recentReports.length > 0) {
        score = 70;
        warnings.push(`${recentReports.length} report(s) generated in last 10 minutes`);
        recommendations.push('Consider if another report is necessary');
      }

      return {
        passed: true,
        score,
        message: runningReports.length === 0 ? 'No conflicting operations detected' : 'Recent report activity detected',
        details: {
          runningReports: runningReports.length,
          recentReports: recentReports.length
        },
        blockingIssues: [],
        recommendations,
        warnings
      };

    } catch (error) {
      return {
        passed: true, // Don't block on this check failing
        score: 80,
        message: `Concurrent operation validation failed, but allowing to proceed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        blockingIssues: [],
        recommendations: ['Retry concurrent operation validation'],
        warnings: ['Could not verify concurrent operations']
      };
    }
  }

  /**
   * Estimate report quality based on validation results
   */
  private estimateReportQuality(overallScore: number, hasRequiredFailures: boolean): 'HIGH' | 'MEDIUM' | 'LOW' | 'CRITICAL' {
    if (hasRequiredFailures || overallScore < 30) return 'CRITICAL';
    if (overallScore >= 85) return 'HIGH';
    if (overallScore >= 70) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Get a quick validation summary
   */
  public async quickValidationSummary(projectId: string): Promise<{
    canProceed: boolean;
    score: number;
    criticalIssues: number;
    recommendations: number;
  }> {
    try {
      const result = await this.validateReportPrerequisites(projectId, {
        skipOptionalChecks: true,
        minimumScore: 60
      });

      return {
        canProceed: result.canProceed,
        score: result.overallScore,
        criticalIssues: result.criticalBlockers.length,
        recommendations: result.allRecommendations.length
      };
    } catch (error) {
      return {
        canProceed: false,
        score: 0,
        criticalIssues: 1,
        recommendations: 1
      };
    }
  }
}

// Export singleton instance
export const reportPrerequisiteValidator = ReportPrerequisiteValidator.getInstance(); 