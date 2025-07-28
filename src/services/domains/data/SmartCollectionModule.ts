/**
 * SmartCollectionModule - Intelligent data collection and prioritization
 * Migrated from SmartDataCollectionService with enhanced functionality
 * 
 * Key Features:
 * - Intelligent data source prioritization
 * - Smart fallback mechanisms  
 * - Data quality scoring and completeness metrics
 * - Priority-based collection strategies
 * - Preserved critical integration with report generation
 */

import { logger, generateCorrelationId, trackErrorWithCorrelation, trackBusinessEvent } from '@/lib/logger';
import { createId } from '@paralleldrive/cuid2';
import { prisma } from '@/lib/prisma';

// Import types
import {
  SmartCollectionInterface,
  SmartCollectionOptions,
  SmartCollectionResult,
  DataCollectionPriority,
  DataCollectionStrategy,
  DataFreshness,
  PriorityBreakdown,
  ProductCollectionResult,
  CompetitorCollectionResult,
  FreshnessStatus,
  ContentQuality
} from '../types/dataTypes';

import type { WebScrapingInterface } from '../types/dataTypes';
import type { Competitor, CompetitorSnapshot } from '@/types/analysis';

/**
 * SmartCollectionModule Implementation
 * Consolidates intelligent data collection functionality
 */
export class SmartCollectionModule implements SmartCollectionInterface {
  private webScrapingModule: WebScrapingInterface;

  constructor(webScrapingModule: WebScrapingInterface) {
    this.webScrapingModule = webScrapingModule;
  }

  /**
   * Execute smart data collection with priority system
   * Priority order: Product Form Data → Fresh Snapshots → Fast Collection → Existing → Basic
   * Migrated from SmartDataCollectionService.collectProjectData()
   */
  async collectProjectData(
    projectId: string, 
    options: SmartCollectionOptions = {}
  ): Promise<SmartCollectionResult> {
    const startTime = Date.now();
    const correlationId = generateCorrelationId();
    const context = { projectId, correlationId, operation: 'smartDataCollection' };

    try {
      logger.info('Starting smart data collection with priority system', {
        ...context,
        options
      });

      // Phase 1: Collect Product Data (Priority 1 - Immediate from form input)
      const productDataResult = await this.collectProductData(projectId, correlationId);
      
      // Phase 2: Collect Competitor Data (Priorities 2-5 with smart fallbacks)
      const competitorDataResult = await this.collectCompetitorDataWithPriorities(
        projectId, 
        options
      );

      // Calculate overall data quality metrics
      const dataCompletenessScore = this.calculateDataCompletenessScore(
        productDataResult, 
        competitorDataResult
      );

      const dataFreshness = this.determineDataFreshness(
        productDataResult,
        competitorDataResult
      );

      const priorityBreakdown = this.buildPriorityBreakdown(
        productDataResult,
        competitorDataResult
      );

      const collectionStrategy = await this.optimizeCollectionStrategy(projectId);

      const result: SmartCollectionResult = {
        projectId,
        collectionStrategy,
        dataCompletenessScore,
        dataFreshness,
        collectionTime: Date.now() - startTime,
        priorityBreakdown,
        productData: productDataResult,
        competitorData: competitorDataResult
      };

      logger.info('Smart data collection completed successfully', {
        ...context,
        result: {
          dataCompletenessScore: result.dataCompletenessScore,
          dataFreshness: result.dataFreshness,
          collectionTime: result.collectionTime,
          productDataSuccess: !!result.productData?.success,
          competitorDataCount: result.competitorData?.length || 0
        }
      });

      trackBusinessEvent('smart_collection_completed', {
        projectId,
        correlationId,
        dataCompletenessScore: result.dataCompletenessScore,
        collectionTime: result.collectionTime
      });

      return result;

    } catch (error) {
      logger.error('Smart data collection failed', error as Error, context);
      trackErrorWithCorrelation(error as Error, correlationId, {
        operation: 'smartDataCollection',
        projectId
      });
      throw error;
    }
  }

  /**
   * Collect competitor data with intelligent prioritization and fallbacks
   * Implements the 5-tier priority system from original SmartDataCollectionService
   */
  async collectCompetitorDataWithPriorities(
    projectId: string, 
    options: SmartCollectionOptions = {}
  ): Promise<CompetitorCollectionResult[]> {
    const correlationId = generateCorrelationId();
    const context = { projectId, correlationId, operation: 'collectCompetitorDataWithPriorities' };

    try {
      logger.info('Starting competitor data collection with priorities', context);

      // Get project competitors
      const competitors = await this.getProjectCompetitors(projectId);
      if (!competitors.length) {
        logger.warn('No competitors found for project', context);
        return [];
      }

      const results: CompetitorCollectionResult[] = [];
      const priorityOrder = options.priorityOverride ? 
        [options.priorityOverride] : 
        [
          DataCollectionPriority.FRESH_COMPETITOR_SNAPSHOTS,
          DataCollectionPriority.FAST_COMPETITOR_COLLECTION,
          DataCollectionPriority.EXISTING_SNAPSHOTS,
          DataCollectionPriority.BASIC_COMPETITOR_METADATA
        ];

      for (const competitor of competitors) {
        let collectionResult: CompetitorCollectionResult | null = null;

        // Try each priority level until successful
        for (const priority of priorityOrder) {
          try {
            collectionResult = await this.collectCompetitorDataByPriority(
              competitor, 
              priority, 
              options
            );
            
            if (collectionResult.success) {
              break; // Success, move to next competitor
            }
          } catch (error) {
            logger.warn(`Priority ${priority} failed for competitor ${competitor.id}`, {
              ...context,
              competitorId: competitor.id,
              priority,
              error: (error as Error).message
            });
          }
        }

        // Add result (successful or failed)
        if (collectionResult) {
          results.push(collectionResult);
        } else {
          results.push({
            competitorId: competitor.id,
            success: false,
            error: 'All priority levels failed',
            quality: this.getDefaultContentQuality(),
            priority: DataCollectionPriority.BASIC_COMPETITOR_METADATA
          });
        }
      }

      logger.info('Competitor data collection with priorities completed', {
        ...context,
        totalCompetitors: competitors.length,
        successfulCollections: results.filter(r => r.success).length
      });

      return results;

    } catch (error) {
      logger.error('Competitor data collection with priorities failed', error as Error, context);
      throw error;
    }
  }

  /**
   * Calculate data completeness score based on collected data
   * Preserves original scoring algorithm from SmartDataCollectionService
   */
  calculateDataCompletenessScore(
    productData: ProductCollectionResult | undefined, 
    competitorData: CompetitorCollectionResult[]
  ): number {
    let score = 0;
    const maxScore = 100;

    // Product data scoring (40% of total)
    if (productData?.success && productData.data) {
      score += 40;
      
      // Bonus points for quality
      if (productData.quality.overallScore > 80) score += 5;
      if (productData.quality.completeness > 90) score += 5;
    }

    // Competitor data scoring (60% of total)
    if (competitorData.length > 0) {
      const successfulCompetitors = competitorData.filter(c => c.success);
      const successRate = successfulCompetitors.length / competitorData.length;
      
      score += Math.round(60 * successRate);
      
      // Bonus for high-quality competitor data
      const avgQuality = successfulCompetitors.reduce((sum, c) => sum + c.quality.overallScore, 0) / 
                         Math.max(successfulCompetitors.length, 1);
      
      if (avgQuality > 80) score += 5;
    }

    return Math.min(score, maxScore);
  }

  /**
   * Determine overall data freshness status
   * Preserves original freshness logic from SmartDataCollectionService
   */
  determineDataFreshness(
    productData: ProductCollectionResult | undefined,
    competitorData: CompetitorCollectionResult[]
  ): DataFreshness {
    const now = new Date();
    const freshnessThreshold = 24 * 60 * 60 * 1000; // 24 hours
    
    let productFreshness = 0;
    let competitorFreshness = 0;
    let lastUpdate = now;

    // Calculate product freshness
    if (productData?.data) {
      const productAge = now.getTime() - new Date(productData.data.createdAt).getTime();
      productFreshness = Math.max(0, 100 - (productAge / freshnessThreshold * 100));
      lastUpdate = new Date(productData.data.createdAt);
    }

    // Calculate competitor freshness
    const freshCompetitors = competitorData.filter(c => {
      if (!c.success || !c.data) return false;
      const age = now.getTime() - new Date(c.data.createdAt).getTime();
      return age < freshnessThreshold;
    });

    if (competitorData.length > 0) {
      competitorFreshness = (freshCompetitors.length / competitorData.length) * 100;
    }

    const overallFreshness = (productFreshness + competitorFreshness) / 2;
    
    let overallStatus: 'FRESH' | 'STALE' | 'EXPIRED';
    if (overallFreshness > 80) {
      overallStatus = 'FRESH';
    } else if (overallFreshness > 40) {
      overallStatus = 'STALE';
    } else {
      overallStatus = 'EXPIRED';
    }

    return {
      overallStatus,
      productFreshness,
      competitorFreshness,
      lastUpdate,
      refreshRecommended: overallStatus !== 'FRESH'
    };
  }

  /**
   * Optimize collection strategy based on project characteristics
   */
  async optimizeCollectionStrategy(projectId: string): Promise<DataCollectionStrategy> {
    try {
      const project = await this.getProjectFromDatabase(projectId);
      const competitors = await this.getProjectCompetitors(projectId);
      
      // Determine strategy based on project size and complexity
      let strategyName = 'balanced';
      let priorities = [
        DataCollectionPriority.FRESH_COMPETITOR_SNAPSHOTS,
        DataCollectionPriority.EXISTING_SNAPSHOTS,
        DataCollectionPriority.BASIC_COMPETITOR_METADATA
      ];

      if (competitors.length > 10) {
        // Large project - prioritize existing data
        strategyName = 'efficiency_focused';
        priorities = [
          DataCollectionPriority.EXISTING_SNAPSHOTS,
          DataCollectionPriority.FAST_COMPETITOR_COLLECTION,
          DataCollectionPriority.BASIC_COMPETITOR_METADATA
        ];
      } else if (competitors.length < 3) {
        // Small project - prioritize fresh data
        strategyName = 'quality_focused';
        priorities = [
          DataCollectionPriority.FRESH_COMPETITOR_SNAPSHOTS,
          DataCollectionPriority.FAST_COMPETITOR_COLLECTION
        ];
      }

      return {
        name: strategyName,
        priorities,
        fallbackStrategy: 'use_existing',
        qualityThreshold: 70,
        timeoutThreshold: 30000
      };

    } catch (error) {
      logger.error('Failed to optimize collection strategy', error as Error, { projectId });
      
      // Return default strategy
      return {
        name: 'default',
        priorities: [
          DataCollectionPriority.EXISTING_SNAPSHOTS,
          DataCollectionPriority.BASIC_COMPETITOR_METADATA
        ],
        fallbackStrategy: 'use_existing',
        qualityThreshold: 50,
        timeoutThreshold: 15000
      };
    }
  }

  /**
   * Check data freshness for a project
   */
  async checkDataFreshness(projectId: string): Promise<FreshnessStatus> {
    const correlationId = generateCorrelationId();
    
    try {
      const [productSnapshots, competitorSnapshots] = await Promise.all([
        this.getRecentProductSnapshots(projectId),
        this.getRecentCompetitorSnapshots(projectId)
      ]);

      const now = new Date();
      const freshnessThreshold = 24 * 60 * 60 * 1000; // 24 hours
      
      const staleProductSnapshots = productSnapshots.filter(s => 
        (now.getTime() - s.createdAt.getTime()) > freshnessThreshold
      );
      
      const staleCompetitorSnapshots = competitorSnapshots.filter(s =>
        (now.getTime() - s.createdAt.getTime()) > freshnessThreshold
      );

      const requiresUpdate = staleProductSnapshots.length > 0 || staleCompetitorSnapshots.length > 0;
      const overallStatus = requiresUpdate ? 'STALE' : 'FRESH';

      return {
        requiresUpdate,
        lastCheck: now,
        nextCheck: new Date(now.getTime() + freshnessThreshold),
        overallStatus,
        details: {
          productSnapshots: productSnapshots.length,
          competitorSnapshots: competitorSnapshots.length,
          staleProducts: staleProductSnapshots.length,
          staleCompetitors: staleCompetitorSnapshots.length
        }
      };

    } catch (error) {
      logger.error('Failed to check data freshness', error as Error, { projectId, correlationId });
      throw error;
    }
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  private async collectProductData(projectId: string, correlationId: string): Promise<ProductCollectionResult | undefined> {
    try {
      const project = await this.getProjectFromDatabase(projectId);
      if (!project?.productId) {
        return undefined;
      }

      const recentSnapshot = await this.getRecentProductSnapshot(project.productId);
      
      return {
        productId: project.productId,
        success: !!recentSnapshot,
        data: recentSnapshot || undefined,
        quality: recentSnapshot ? this.calculateSnapshotQuality(recentSnapshot) : this.getDefaultContentQuality()
      };

    } catch (error) {
      logger.error('Failed to collect product data', error as Error, { projectId, correlationId });
      return {
        productId: 'unknown',
        success: false,
        error: (error as Error).message,
        quality: this.getDefaultContentQuality()
      };
    }
  }

  private async collectCompetitorDataByPriority(
    competitor: Competitor,
    priority: DataCollectionPriority,
    options: SmartCollectionOptions
  ): Promise<CompetitorCollectionResult> {
    const correlationId = generateCorrelationId();
    
    try {
      let competitorSnapshot: CompetitorSnapshot | null = null;

      switch (priority) {
        case DataCollectionPriority.FRESH_COMPETITOR_SNAPSHOTS:
          // Scrape fresh data
          if (competitor.website) {
            const snapshotId = await this.webScrapingModule.scrapeCompetitor(competitor.id);
            competitorSnapshot = await this.getCompetitorSnapshot(snapshotId);
          }
          break;

        case DataCollectionPriority.FAST_COMPETITOR_COLLECTION:
          // Quick scrape with minimal content
          if (competitor.website) {
            const result = await this.webScrapingModule.scrapeUrl(competitor.website, {
              timeout: 10000,
              enableJavaScript: false,
              takeScreenshot: false
            });
            competitorSnapshot = await this.createQuickCompetitorSnapshot(competitor.id, result);
          }
          break;

        case DataCollectionPriority.EXISTING_SNAPSHOTS:
          // Use existing snapshot
          competitorSnapshot = await this.getRecentCompetitorSnapshot(competitor.id);
          break;

        case DataCollectionPriority.BASIC_COMPETITOR_METADATA:
          // Use basic competitor info
          competitorSnapshot = await this.createBasicCompetitorSnapshot(competitor);
          break;
      }

      if (competitorSnapshot) {
        return {
          competitorId: competitor.id,
          success: true,
          data: competitorSnapshot,
          quality: this.calculateSnapshotQuality(competitorSnapshot),
          priority
        };
      } else {
        throw new Error(`No data collected for priority ${priority}`);
      }

    } catch (error) {
      return {
        competitorId: competitor.id,
        success: false,
        error: (error as Error).message,
        quality: this.getDefaultContentQuality(),
        priority
      };
    }
  }

  private buildPriorityBreakdown(
    productData: ProductCollectionResult | undefined,
    competitorData: CompetitorCollectionResult[]
  ): PriorityBreakdown {
    const breakdown: PriorityBreakdown = {
      [DataCollectionPriority.PRODUCT_FORM_DATA]: {
        attempted: productData ? 1 : 0,
        successful: productData?.success ? 1 : 0,
        failed: productData && !productData.success ? 1 : 0,
        averageTime: 0
      },
      [DataCollectionPriority.FRESH_COMPETITOR_SNAPSHOTS]: {
        attempted: 0,
        successful: 0,
        failed: 0,
        averageTime: 0
      },
      [DataCollectionPriority.FAST_COMPETITOR_COLLECTION]: {
        attempted: 0,
        successful: 0,
        failed: 0,
        averageTime: 0
      },
      [DataCollectionPriority.EXISTING_SNAPSHOTS]: {
        attempted: 0,
        successful: 0,
        failed: 0,
        averageTime: 0
      },
      [DataCollectionPriority.BASIC_COMPETITOR_METADATA]: {
        attempted: 0,
        successful: 0,
        failed: 0,
        averageTime: 0
      }
    };

    // Count competitor data by priority
    competitorData.forEach(result => {
      const priority = result.priority;
      breakdown[priority].attempted += 1;
      
      if (result.success) {
        breakdown[priority].successful += 1;
      } else {
        breakdown[priority].failed += 1;
      }
    });

    return breakdown;
  }

  private calculateSnapshotQuality(snapshot: Record<string, unknown>): ContentQuality {
    const content = snapshot.content || {};
    const html = content.html || '';
    const text = content.text || '';
    const title = content.title || '';

    let completeness = 0;
    let accuracy = 85;
    let freshness = 90;
    let consistency = 80;

    // Completeness scoring
    if (html.length > 1000) completeness += 40;
    if (text.length > 500) completeness += 30;
    if (title.length > 0) completeness += 20;
    if (content.description) completeness += 10;

    const issues: string[] = [];
    if (html.length < 1000) issues.push('Low HTML content');
    if (text.length < 500) issues.push('Low text content');
    if (!title) issues.push('Missing title');

    return {
      completeness,
      accuracy,
      freshness,
      consistency,
      overallScore: (completeness + accuracy + freshness + consistency) / 4,
      issues
    };
  }

  private getDefaultContentQuality(): ContentQuality {
    return {
      completeness: 0,
      accuracy: 0,
      freshness: 0,
      consistency: 0,
      overallScore: 0,
      issues: ['No data available']
    };
  }

  // Database helper methods
  private async getProjectFromDatabase(projectId: string) {
    return await prisma.project.findUnique({
      where: { id: projectId }
    });
  }

  private async getProjectCompetitors(projectId: string): Promise<Competitor[]> {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { competitors: true }
    });
    
    return project?.competitors || [];
  }

  private async getRecentProductSnapshot(productId: string) {
    return await prisma.productSnapshot.findFirst({
      where: { productId },
      orderBy: { createdAt: 'desc' }
    });
  }

  private async getRecentCompetitorSnapshot(competitorId: string) {
    return await prisma.competitorSnapshot.findFirst({
      where: { competitorId },
      orderBy: { createdAt: 'desc' }
    });
  }

  private async getCompetitorSnapshot(snapshotId: string) {
    return await prisma.competitorSnapshot.findUnique({
      where: { id: snapshotId }
    });
  }

  private async getRecentProductSnapshots(projectId: string) {
    const project = await this.getProjectFromDatabase(projectId);
    if (!project?.productId) return [];

    return await prisma.productSnapshot.findMany({
      where: { productId: project.productId },
      orderBy: { createdAt: 'desc' },
      take: 10
    });
  }

  private async getRecentCompetitorSnapshots(projectId: string) {
    const competitors = await this.getProjectCompetitors(projectId);
    const competitorIds = competitors.map(c => c.id);

    return await prisma.competitorSnapshot.findMany({
      where: { competitorId: { in: competitorIds } },
      orderBy: { createdAt: 'desc' },
      take: 50
    });
  }

  private async createQuickCompetitorSnapshot(competitorId: string, scrapedData: any) {
    const snapshot = await prisma.competitorSnapshot.create({
      data: {
        id: createId(),
        competitorId,
        content: {
          html: scrapedData.html || '',
          text: scrapedData.text || '',
          title: scrapedData.title || '',
          url: scrapedData.url || ''
        },
        metadata: {
          scrapedAt: new Date(),
          scrapingMethod: 'fast_collection',
          contentLength: scrapedData.html?.length || 0
        }
      }
    });

    return snapshot;
  }

  private async createBasicCompetitorSnapshot(competitor: Competitor) {
    const snapshot = await prisma.competitorSnapshot.create({
      data: {
        id: createId(),
        competitorId: competitor.id,
        content: {
          html: '',
          text: competitor.description || '',
          title: competitor.name,
          url: competitor.website || ''
        },
        metadata: {
          scrapedAt: new Date(),
          scrapingMethod: 'basic_metadata',
          contentLength: 0
        }
      }
    });

    return snapshot;
  }
} 