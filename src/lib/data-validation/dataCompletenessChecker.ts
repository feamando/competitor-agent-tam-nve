import { prisma } from '@/lib/prisma';
import { logger, generateCorrelationId } from '@/lib/logger';

export interface DataCompletenessCheck {
  component: string;
  required: boolean;
  present: boolean;
  quality: 'excellent' | 'good' | 'fair' | 'poor' | 'missing';
  score: number; // 0-100
  details: string;
  recommendations: string[];
}

export interface DataCompletenessResult {
  projectId: string;
  overallScore: number; // 0-100
  overallGrade: 'A' | 'B' | 'C' | 'D' | 'F';
  isComplete: boolean;
  checks: DataCompletenessCheck[];
  criticalIssues: string[];
  warnings: string[];
  recommendations: string[];
  checkTime: Date;
  dataFreshness: 'fresh' | 'recent' | 'stale' | 'very_stale';
  estimatedReportQuality: 'high' | 'medium' | 'low';
}

export interface CompletenessCheckOptions {
  requireFreshData?: boolean;
  maxDataAge?: number; // hours
  minimumScore?: number; // 0-100
  strictMode?: boolean;
  includeOptionalChecks?: boolean;
}

export class DataCompletenessChecker {
  private static instance: DataCompletenessChecker;

  public static getInstance(): DataCompletenessChecker {
    if (!DataCompletenessChecker.instance) {
      DataCompletenessChecker.instance = new DataCompletenessChecker();
    }
    return DataCompletenessChecker.instance;
  }

  /**
   * Check data completeness for report generation
   * Task 2.4: Main completeness validation
   */
  public async checkDataCompleteness(
    projectId: string,
    options: CompletenessCheckOptions = {}
  ): Promise<DataCompletenessResult> {
    const correlationId = generateCorrelationId();
    const context = { projectId, correlationId, operation: 'checkDataCompleteness' };

    logger.info('Starting data completeness check', context);

    const result: DataCompletenessResult = {
      projectId,
      overallScore: 0,
      overallGrade: 'F',
      isComplete: false,
      checks: [],
      criticalIssues: [],
      warnings: [],
      recommendations: [],
      checkTime: new Date(),
      dataFreshness: 'very_stale',
      estimatedReportQuality: 'low'
    };

    try {
      // Get project with all related data
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
          products: {
            include: {
              snapshots: {
                orderBy: { createdAt: 'desc' },
                take: 3
              }
            }
          },
          competitors: {
            include: {
              snapshots: {
                orderBy: { createdAt: 'desc' },
                take: 3
              }
            }
          }
        }
      });

      if (!project) {
        result.criticalIssues.push(`Project ${projectId} not found`);
        return result;
      }

      // Perform individual checks
      const checks = await Promise.all([
        this.checkProjectBasicData(project),
        this.checkProductData(project.products),
        this.checkCompetitorData(project.competitors),
        this.checkDataFreshness(project, options),
        this.checkSnapshotQuality(project),
        ...(options.includeOptionalChecks ? [
          this.checkDataConsistency(project),
          this.checkMetadataCompleteness(project)
        ] : [])
      ]);

      result.checks = checks;

      // Calculate overall score
      const totalPossibleScore = checks.reduce((sum, check) => sum + (check.required ? 100 : 50), 0);
      const actualScore = checks.reduce((sum, check) => {
        const weight = check.required ? 100 : 50;
        return sum + (check.score * weight / 100);
      }, 0);

      result.overallScore = totalPossibleScore > 0 ? Math.round((actualScore / totalPossibleScore) * 100) : 0;

      // Determine grade
      result.overallGrade = this.calculateGrade(result.overallScore);

      // Determine data freshness
      result.dataFreshness = this.determineDataFreshness(project);

      // Estimate report quality
      result.estimatedReportQuality = this.estimateReportQuality(result.overallScore, result.dataFreshness);

      // Collect critical issues
      result.criticalIssues = checks
        .filter(check => check.required && !check.present)
        .map(check => `Critical: ${check.component} is missing`);

      // Collect warnings
      result.warnings = checks
        .filter(check => check.present && check.quality === 'poor')
        .map(check => `Warning: ${check.component} has poor quality - ${check.details}`);

      // Collect recommendations
      result.recommendations = checks
        .flatMap(check => check.recommendations)
        .filter((rec, index, arr) => arr.indexOf(rec) === index); // Remove duplicates

      // Determine if data is complete enough for report generation
      result.isComplete = result.overallScore >= (options.minimumScore || 70) && 
                        result.criticalIssues.length === 0;

      logger.info('Data completeness check completed', {
        ...context,
        overallScore: result.overallScore,
        grade: result.overallGrade,
        isComplete: result.isComplete,
        criticalIssues: result.criticalIssues.length,
        warnings: result.warnings.length
      });

      return result;

    } catch (error) {
      logger.error('Data completeness check failed', error as Error, context);
      result.criticalIssues.push(`Completeness check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return result;
    }
  }

  /**
   * Check project basic data completeness
   */
  private async checkProjectBasicData(project: any): Promise<DataCompletenessCheck> {
    const hasName = project.name && project.name.trim().length > 0;
    const hasDescription = project.description && project.description.trim().length > 0;
    const hasProducts = project.products && project.products.length > 0;
    const hasCompetitors = project.competitors && project.competitors.length > 0;

    let score = 0;
    const details: string[] = [];
    const recommendations: string[] = [];

    if (hasName) score += 25;
    else details.push('Missing project name');

    if (hasDescription) score += 15;
    else recommendations.push('Add project description for better context');

    if (hasProducts) score += 40;
    else {
      details.push('No products defined');
      recommendations.push('Add at least one product to analyze');
    }

    if (hasCompetitors) score += 20;
    else {
      details.push('No competitors defined');
      recommendations.push('Add competitors for comparative analysis');
    }

    return {
      component: 'Project Basic Data',
      required: true,
      present: hasName && hasProducts,
      quality: this.scoreToQuality(score),
      score,
      details: details.length > 0 ? details.join('; ') : 'Project basic data is complete',
      recommendations
    };
  }

  /**
   * Check product data completeness
   */
  private async checkProductData(products: any[]): Promise<DataCompletenessCheck> {
    if (!products || products.length === 0) {
      return {
        component: 'Product Data',
        required: true,
        present: false,
        quality: 'missing',
        score: 0,
        details: 'No products found',
        recommendations: ['Add products to the project']
      };
    }

    let totalScore = 0;
    const details: string[] = [];
    const recommendations: string[] = [];

    for (const product of products) {
      let productScore = 0;
      
      // Basic product info
      if (product.name) productScore += 20;
      else details.push(`Product ${product.id} missing name`);

      if (product.website) productScore += 20;
      else details.push(`Product ${product.name || product.id} missing website`);

      if (product.positioning) productScore += 15;
      else recommendations.push(`Add positioning for ${product.name || 'product'}`);

      if (product.industry) productScore += 10;
      else recommendations.push(`Add industry for ${product.name || 'product'}`);

      // Snapshot data
      if (product.snapshots && product.snapshots.length > 0) {
        productScore += 35;
        const latestSnapshot = product.snapshots[0];
        if (!latestSnapshot.captureSuccess) {
          productScore -= 15;
          details.push(`Latest snapshot for ${product.name} failed`);
          recommendations.push(`Retry snapshot capture for ${product.name}`);
        }
      } else {
        details.push(`No snapshots for product ${product.name}`);
        recommendations.push(`Capture website snapshot for ${product.name}`);
      }

      totalScore += productScore;
    }

    const averageScore = Math.round(totalScore / products.length);

    return {
      component: 'Product Data',
      required: true,
      present: products.length > 0,
      quality: this.scoreToQuality(averageScore),
      score: averageScore,
      details: details.length > 0 ? details.join('; ') : `${products.length} products with good data`,
      recommendations
    };
  }

  /**
   * Check competitor data completeness
   */
  private async checkCompetitorData(competitors: any[]): Promise<DataCompletenessCheck> {
    if (!competitors || competitors.length === 0) {
      return {
        component: 'Competitor Data',
        required: false,
        present: false,
        quality: 'missing',
        score: 0,
        details: 'No competitors found - comparative analysis not possible',
        recommendations: ['Add competitors for better comparative insights']
      };
    }

    let totalScore = 0;
    const details: string[] = [];
    const recommendations: string[] = [];

    for (const competitor of competitors) {
      let competitorScore = 0;
      
      // Basic competitor info
      if (competitor.name) competitorScore += 25;
      else details.push(`Competitor ${competitor.id} missing name`);

      if (competitor.website) competitorScore += 25;
      else details.push(`Competitor ${competitor.name || competitor.id} missing website`);

      if (competitor.industry) competitorScore += 15;
      if (competitor.description) competitorScore += 10;

      // Snapshot data
      if (competitor.snapshots && competitor.snapshots.length > 0) {
        competitorScore += 25;
        const latestSnapshot = competitor.snapshots[0];
        if (!latestSnapshot.captureSuccess) {
          competitorScore -= 10;
          details.push(`Latest snapshot for ${competitor.name} failed`);
          recommendations.push(`Retry snapshot capture for ${competitor.name}`);
        }
      } else {
        details.push(`No snapshots for competitor ${competitor.name}`);
        recommendations.push(`Capture website snapshot for ${competitor.name}`);
      }

      totalScore += competitorScore;
    }

    const averageScore = Math.round(totalScore / competitors.length);

    return {
      component: 'Competitor Data',
      required: false,
      present: competitors.length > 0,
      quality: this.scoreToQuality(averageScore),
      score: averageScore,
      details: details.length > 0 ? details.join('; ') : `${competitors.length} competitors with good data`,
      recommendations
    };
  }

  /**
   * Check data freshness
   */
  private async checkDataFreshness(project: any, options: CompletenessCheckOptions): Promise<DataCompletenessCheck> {
    const maxAge = options.maxDataAge || 24; // 24 hours default
    const maxAgeMs = maxAge * 60 * 60 * 1000;
    const now = Date.now();

    let totalScore = 0;
    let itemCount = 0;
    const details: string[] = [];
    const recommendations: string[] = [];

    // Check product snapshot freshness
    for (const product of project.products || []) {
      if (product.snapshots && product.snapshots.length > 0) {
        const latestSnapshot = product.snapshots[0];
        const age = now - new Date(latestSnapshot.createdAt).getTime();
        const ageHours = Math.round(age / (60 * 60 * 1000));
        
        let freshScore = 100;
        if (age > maxAgeMs) {
          freshScore = Math.max(0, 100 - (ageHours - maxAge) * 5);
          details.push(`Product ${product.name} snapshot is ${ageHours}h old`);
          if (ageHours > 48) {
            recommendations.push(`Refresh snapshot for ${product.name} (${ageHours}h old)`);
          }
        }
        
        totalScore += freshScore;
        itemCount++;
      }
    }

    // Check competitor snapshot freshness
    for (const competitor of project.competitors || []) {
      if (competitor.snapshots && competitor.snapshots.length > 0) {
        const latestSnapshot = competitor.snapshots[0];
        const age = now - new Date(latestSnapshot.createdAt).getTime();
        const ageHours = Math.round(age / (60 * 60 * 1000));
        
        let freshScore = 100;
        if (age > maxAgeMs) {
          freshScore = Math.max(0, 100 - (ageHours - maxAge) * 3); // More lenient for competitors
          if (ageHours > 72) {
            details.push(`Competitor ${competitor.name} snapshot is ${ageHours}h old`);
            recommendations.push(`Consider refreshing ${competitor.name} snapshot`);
          }
        }
        
        totalScore += freshScore;
        itemCount++;
      }
    }

    const averageScore = itemCount > 0 ? Math.round(totalScore / itemCount) : 0;

    return {
      component: 'Data Freshness',
      required: options.requireFreshData || false,
      present: itemCount > 0,
      quality: this.scoreToQuality(averageScore),
      score: averageScore,
      details: details.length > 0 ? details.join('; ') : 'Data is fresh',
      recommendations
    };
  }

  /**
   * Check snapshot quality
   */
  private async checkSnapshotQuality(project: any): Promise<DataCompletenessCheck> {
    let totalScore = 0;
    let snapshotCount = 0;
    const details: string[] = [];
    const recommendations: string[] = [];

    // Analyze all snapshots
    const allSnapshots = [
      ...(project.products || []).flatMap((p: any) => p.snapshots || []),
      ...(project.competitors || []).flatMap((c: any) => c.snapshots || [])
    ];

    for (const snapshot of allSnapshots) {
      let qualityScore = 0;
      
      // Success rate
      if (snapshot.captureSuccess) qualityScore += 40;
      else details.push('Failed snapshot detected');

      // Content size
      if (snapshot.content && snapshot.content.html) {
        const contentLength = snapshot.content.html.length;
        if (contentLength > 10000) qualityScore += 30;
        else if (contentLength > 5000) qualityScore += 20;
        else if (contentLength > 1000) qualityScore += 10;
        else details.push('Snapshot has minimal content');
      }

      // Metadata completeness
      if (snapshot.metadata) {
        qualityScore += 20;
        if (snapshot.metadata.contentLength) qualityScore += 10;
      }

      totalScore += qualityScore;
      snapshotCount++;
    }

    if (snapshotCount === 0) {
      return {
        component: 'Snapshot Quality',
        required: true,
        present: false,
        quality: 'missing',
        score: 0,
        details: 'No snapshots available for quality assessment',
        recommendations: ['Capture website snapshots for analysis']
      };
    }

    const averageScore = Math.round(totalScore / snapshotCount);

    if (averageScore < 50) {
      recommendations.push('Improve snapshot capture process');
    }
    if (averageScore < 30) {
      recommendations.push('Check website accessibility and scraping configuration');
    }

    return {
      component: 'Snapshot Quality',
      required: true,
      present: snapshotCount > 0,
      quality: this.scoreToQuality(averageScore),
      score: averageScore,
      details: details.length > 0 ? details.join('; ') : `${snapshotCount} snapshots with good quality`,
      recommendations
    };
  }

  /**
   * Check data consistency
   */
  private async checkDataConsistency(project: any): Promise<DataCompletenessCheck> {
    const details: string[] = [];
    const recommendations: string[] = [];
    let score = 100;

    // Check for duplicate websites
    const websites = new Set();
    const duplicates: string[] = [];

    [...(project.products || []), ...(project.competitors || [])].forEach((item: any) => {
      if (item.website) {
        if (websites.has(item.website)) {
          duplicates.push(item.website);
          score -= 20;
        } else {
          websites.add(item.website);
        }
      }
    });

    if (duplicates.length > 0) {
      details.push(`Duplicate websites found: ${duplicates.join(', ')}`);
      recommendations.push('Remove duplicate website entries');
    }

    // Check for empty names
    const emptyNames = [...(project.products || []), ...(project.competitors || [])]
      .filter((item: any) => !item.name || item.name.trim().length === 0).length;

    if (emptyNames > 0) {
      details.push(`${emptyNames} items missing names`);
      recommendations.push('Add names to all products and competitors');
      score -= emptyNames * 15;
    }

    return {
      component: 'Data Consistency',
      required: false,
      present: true,
      quality: this.scoreToQuality(Math.max(0, score)),
      score: Math.max(0, score),
      details: details.length > 0 ? details.join('; ') : 'Data is consistent',
      recommendations
    };
  }

  /**
   * Check metadata completeness
   */
  private async checkMetadataCompleteness(project: any): Promise<DataCompletenessCheck> {
    let score = 0;
    const details: string[] = [];
    const recommendations: string[] = [];

    // Check project metadata
    if (project.parameters && Object.keys(project.parameters).length > 0) score += 25;
    else recommendations.push('Add project parameters for better context');

    if (project.tags && Object.keys(project.tags).length > 0) score += 15;
    else recommendations.push('Add project tags for categorization');

    // Check product metadata
    const productsWithMetadata = (project.products || []).filter((p: any) => 
      p.positioning && p.customerData && p.userProblem).length;
    
    if (productsWithMetadata > 0) {
      score += Math.min(40, (productsWithMetadata / (project.products?.length || 1)) * 40);
    } else {
      recommendations.push('Add detailed product information (positioning, customer data, user problems)');
    }

    // Check competitor metadata
    const competitorsWithMetadata = (project.competitors || []).filter((c: any) => 
      c.industry && c.description).length;
    
    if (competitorsWithMetadata > 0) {
      score += Math.min(20, (competitorsWithMetadata / (project.competitors?.length || 1)) * 20);
    } else {
      recommendations.push('Add competitor industry and description information');
    }

    return {
      component: 'Metadata Completeness',
      required: false,
      present: score > 0,
      quality: this.scoreToQuality(score),
      score,
      details: score > 75 ? 'Comprehensive metadata available' : 'Some metadata missing',
      recommendations
    };
  }

  /**
   * Convert score to quality rating
   */
  private scoreToQuality(score: number): 'excellent' | 'good' | 'fair' | 'poor' | 'missing' {
    if (score >= 90) return 'excellent';
    if (score >= 75) return 'good';
    if (score >= 60) return 'fair';
    if (score > 0) return 'poor';
    return 'missing';
  }

  /**
   * Calculate letter grade from score
   */
  private calculateGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  }

  /**
   * Determine data freshness level
   */
  private determineDataFreshness(project: any): 'fresh' | 'recent' | 'stale' | 'very_stale' {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    const oneDay = 24 * oneHour;
    const oneWeek = 7 * oneDay;

    const allSnapshots = [
      ...(project.products || []).flatMap((p: any) => p.snapshots || []),
      ...(project.competitors || []).flatMap((c: any) => c.snapshots || [])
    ];

    if (allSnapshots.length === 0) return 'very_stale';

    const newestSnapshot = Math.max(...allSnapshots.map((s: any) => new Date(s.createdAt).getTime()));
    const age = now - newestSnapshot;

    if (age < oneHour) return 'fresh';
    if (age < oneDay) return 'recent';
    if (age < oneWeek) return 'stale';
    return 'very_stale';
  }

  /**
   * Estimate report quality based on data completeness
   */
  private estimateReportQuality(score: number, freshness: string): 'high' | 'medium' | 'low' {
    if (score >= 85 && (freshness === 'fresh' || freshness === 'recent')) return 'high';
    if (score >= 70 && freshness !== 'very_stale') return 'medium';
    return 'low';
  }
}

// Export singleton instance
export const dataCompletenessChecker = DataCompletenessChecker.getInstance(); 