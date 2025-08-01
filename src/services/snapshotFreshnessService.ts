import { prisma } from '@/lib/prisma';
import { logger, generateCorrelationId, trackCorrelation } from '@/lib/logger';
import { verifySnapshotExists } from '@/utils/snapshotHelpers';

/**
 * SnapshotFreshnessService - Manages snapshot freshness detection and validation
 * Task 2.1: Create SnapshotFreshnessService class
 * Task 2.2: Implement isSnapshotFresh method
 */

export interface SnapshotFreshnessResult {
  isFresh: boolean;
  snapshotId?: string;
  ageInDays: number;
  capturedAt?: Date;
  reason?: string;
}

export interface StaleSnapshotInfo {
  competitorId: string;
  competitorName: string;
  snapshotId?: string;
  ageInDays: number;
  lastCapturedAt?: Date;
  reason: string;
}

export class SnapshotFreshnessService {
  private static instance: SnapshotFreshnessService;
  private correlationId: string;

  constructor() {
    this.correlationId = generateCorrelationId();
  }

  /**
   * Get singleton instance of SnapshotFreshnessService
   */
  public static getInstance(): SnapshotFreshnessService {
    if (!SnapshotFreshnessService.instance) {
      SnapshotFreshnessService.instance = new SnapshotFreshnessService();
    }
    return SnapshotFreshnessService.instance;
  }

  /**
   * Task 2.2: Check if a snapshot is fresh for a given competitor
   * @param competitorId - The ID of the competitor to check
   * @param maxAgeInDays - Maximum age in days to consider fresh (default: 7)
   * @returns SnapshotFreshnessResult with freshness status and details
   */
  public async isSnapshotFresh(
    competitorId: string, 
    maxAgeInDays: number = 7
  ): Promise<SnapshotFreshnessResult> {
    const logContext = {
      operation: 'isSnapshotFresh',
      competitorId,
      maxAgeInDays,
      correlationId: this.correlationId
    };

    try {
      logger.debug('Checking snapshot freshness', logContext);

      // Validate inputs
      if (!competitorId) {
        return {
          isFresh: false,
          ageInDays: Infinity,
          reason: 'Invalid competitor ID provided'
        };
      }

      if (maxAgeInDays < 0) {
        return {
          isFresh: false,
          ageInDays: Infinity,
          reason: 'Invalid maxAgeInDays parameter'
        };
      }

      // Get the latest snapshot for this competitor
      const latestSnapshot = await prisma.snapshot.findFirst({
        where: {
          competitorId,
          captureSuccess: true // Only consider successful captures
        },
        select: {
          id: true,
          createdAt: true,
          captureSuccess: true,
          errorMessage: true,
          metadata: true
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      if (!latestSnapshot) {
        logger.info('No successful snapshot found for competitor', logContext);
        return {
          isFresh: false,
          ageInDays: Infinity,
          reason: 'No successful snapshot exists'
        };
      }

      // Calculate age in days
      const now = new Date();
      const capturedAt = latestSnapshot.createdAt;
      const ageInMs = now.getTime() - capturedAt.getTime();
      const ageInDays = Math.floor(ageInMs / (1000 * 60 * 60 * 24));

      // Determine if snapshot is fresh
      const isFresh = ageInDays <= maxAgeInDays;

      const result: SnapshotFreshnessResult = {
        isFresh,
        snapshotId: latestSnapshot.id,
        ageInDays,
        capturedAt,
        reason: isFresh 
          ? `Snapshot is fresh (${ageInDays} days old, limit: ${maxAgeInDays} days)`
          : `Snapshot is stale (${ageInDays} days old, limit: ${maxAgeInDays} days)`
      };

      trackCorrelation(this.correlationId, 'snapshot_freshness_checked', {
        ...logContext,
        ...result,
        isFresh
      });

      logger.info('Snapshot freshness checked', {
        ...logContext,
        isFresh,
        ageInDays,
        snapshotId: latestSnapshot.id
      });

      return result;

    } catch (error) {
      logger.error('Failed to check snapshot freshness', error as Error, logContext);
      
      return {
        isFresh: false,
        ageInDays: Infinity,
        reason: `Error checking freshness: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

    /**
   * Task 2.3: Get all stale snapshots for a project (optimized version)
   * @param projectId - The project ID to check
   * @param maxAgeInDays - Maximum age in days to consider fresh (default: 7)
   * @returns Array of competitors with stale snapshots
   */
  public async getStaleSnapshots(
    projectId: string, 
    maxAgeInDays: number = 7
  ): Promise<StaleSnapshotInfo[]> {
    const logContext = {
      operation: 'getStaleSnapshots',
      projectId,
      maxAgeInDays,
      correlationId: this.correlationId
    };

    try {
      logger.info('Getting stale snapshots for project (optimized)', logContext);

      // Task 2.4: Use efficient database query to get all competitors with their latest snapshots
      const result = await this.getCompetitorsWithSnapshotAge(projectId, maxAgeInDays);
      
      const staleSnapshots: StaleSnapshotInfo[] = result
        .filter(item => !item.isFresh)
        .map(item => ({
          competitorId: item.competitorId,
          competitorName: item.competitorName,
          ...(item.snapshotId && { snapshotId: item.snapshotId }),
          ageInDays: item.ageInDays,
          ...(item.lastCapturedAt && { lastCapturedAt: item.lastCapturedAt }),
          reason: item.reason
        }));

      logger.info('Stale snapshots identified (optimized)', {
        ...logContext,
        totalCompetitors: result.length,
        staleCount: staleSnapshots.length,
        freshCount: result.length - staleSnapshots.length
      });

      trackCorrelation(this.correlationId, 'stale_snapshots_identified_optimized', {
        ...logContext,
        totalCompetitors: result.length,
        staleCount: staleSnapshots.length
      });

      return staleSnapshots;

    } catch (error) {
      logger.error('Failed to get stale snapshots', error as Error, logContext);
      return [];
    }
  }

  /**
   * Task 2.4: Efficient database query to get competitors with snapshot age calculation
   * This method uses a single optimized query instead of multiple individual queries
   */
  private async getCompetitorsWithSnapshotAge(
    projectId: string, 
    maxAgeInDays: number = 7
  ): Promise<Array<{
    competitorId: string;
    competitorName: string;
    snapshotId?: string;
    ageInDays: number;
    lastCapturedAt?: Date;
    isFresh: boolean;
    reason: string;
  }>> {
    const logContext = {
      operation: 'getCompetitorsWithSnapshotAge',
      projectId,
      maxAgeInDays,
      correlationId: this.correlationId
    };

    try {
      logger.debug('Executing efficient snapshot age calculation query', logContext);

      // Task 2.4: Single optimized query to get all competitors with their latest successful snapshots
      const competitorsWithSnapshots = await prisma.competitor.findMany({
        where: {
          projects: {
            some: {
              id: projectId
            }
          }
        },
        select: {
          id: true,
          name: true,
          snapshots: {
            where: {
              captureSuccess: true
            },
            select: {
              id: true,
              createdAt: true,
              captureSuccess: true
            },
            orderBy: {
              createdAt: 'desc'
            },
            take: 1 // Only get the latest successful snapshot
          }
        }
      });

      const now = new Date();
      const results = competitorsWithSnapshots.map(competitor => {
        const latestSnapshot = competitor.snapshots[0];
        
        if (!latestSnapshot) {
          return {
            competitorId: competitor.id,
            competitorName: competitor.name,
            ageInDays: Infinity,
            isFresh: false,
            reason: 'No successful snapshot exists'
          };
        }

        // Calculate age in days efficiently
        const ageInMs = now.getTime() - latestSnapshot.createdAt.getTime();
        const ageInDays = Math.floor(ageInMs / (1000 * 60 * 60 * 24));
        const isFresh = ageInDays <= maxAgeInDays;

        return {
          competitorId: competitor.id,
          competitorName: competitor.name,
          snapshotId: latestSnapshot.id,
          ageInDays,
          lastCapturedAt: latestSnapshot.createdAt,
          isFresh,
          reason: isFresh 
            ? `Snapshot is fresh (${ageInDays} days old, limit: ${maxAgeInDays} days)`
            : `Snapshot is stale (${ageInDays} days old, limit: ${maxAgeInDays} days)`
        };
      });

      logger.debug('Efficient snapshot age calculation completed', {
        ...logContext,
        totalCompetitors: results.length,
        queriedSnapshots: competitorsWithSnapshots.reduce((acc, c) => acc + c.snapshots.length, 0)
      });

      return results;

    } catch (error) {
      logger.error('Failed to execute efficient snapshot age calculation', error as Error, logContext);
      return [];
    }
  }

  /**
   * Check if multiple competitors have fresh snapshots
   * @param competitorIds - Array of competitor IDs to check
   * @param maxAgeInDays - Maximum age in days to consider fresh (default: 7)
   * @returns Map of competitor ID to freshness result
   */
  public async checkMultipleSnapshots(
    competitorIds: string[], 
    maxAgeInDays: number = 7
  ): Promise<Map<string, SnapshotFreshnessResult>> {
    const logContext = {
      operation: 'checkMultipleSnapshots',
      competitorCount: competitorIds.length,
      maxAgeInDays,
      correlationId: this.correlationId
    };

    try {
      logger.info('Checking freshness for multiple snapshots', logContext);

      const results = new Map<string, SnapshotFreshnessResult>();

      // Check freshness for each competitor in parallel
      const promises = competitorIds.map(async (competitorId) => {
        const result = await this.isSnapshotFresh(competitorId, maxAgeInDays);
        return { competitorId, result };
      });

      const freshnessResults = await Promise.all(promises);

      // Build results map
      for (const { competitorId, result } of freshnessResults) {
        results.set(competitorId, result);
      }

      const freshCount = Array.from(results.values()).filter(r => r.isFresh).length;

      logger.info('Multiple snapshot freshness check completed', {
        ...logContext,
        freshCount,
        staleCount: competitorIds.length - freshCount
      });

      return results;

    } catch (error) {
      logger.error('Failed to check multiple snapshots', error as Error, logContext);
      return new Map();
    }
  }

  /**
   * Get summary statistics about snapshot freshness for a project
   * @param projectId - The project ID to analyze
   * @param maxAgeInDays - Maximum age in days to consider fresh (default: 7)
   * @returns Summary statistics
   */
  public async getFreshnessSummary(
    projectId: string, 
    maxAgeInDays: number = 7
  ): Promise<{
    totalCompetitors: number;
    freshSnapshots: number;
    staleSnapshots: number;
    missingSnapshots: number;
    averageAgeInDays: number;
    oldestSnapshotAgeInDays: number;
  }> {
    const logContext = {
      operation: 'getFreshnessSummary',
      projectId,
      maxAgeInDays,
      correlationId: this.correlationId
    };

    try {
      logger.info('Getting freshness summary for project', logContext);

      const competitors = await prisma.competitor.findMany({
        where: {
          projects: {
            some: {
              id: projectId
            }
          }
        },
        select: {
          id: true
        }
      });

      const competitorIds = competitors.map(c => c.id);
      const freshnessResults = await this.checkMultipleSnapshots(competitorIds, maxAgeInDays);

      let freshCount = 0;
      let staleCount = 0;
      let missingCount = 0;
      let totalAge = 0;
      let oldestAge = 0;
      let validAgeCount = 0;

      for (const result of freshnessResults.values()) {
        if (result.ageInDays === Infinity) {
          missingCount++;
        } else {
          validAgeCount++;
          totalAge += result.ageInDays;
          oldestAge = Math.max(oldestAge, result.ageInDays);
          
          if (result.isFresh) {
            freshCount++;
          } else {
            staleCount++;
          }
        }
      }

      const summary = {
        totalCompetitors: competitors.length,
        freshSnapshots: freshCount,
        staleSnapshots: staleCount,
        missingSnapshots: missingCount,
        averageAgeInDays: validAgeCount > 0 ? Math.round(totalAge / validAgeCount) : 0,
        oldestSnapshotAgeInDays: oldestAge
      };

      logger.info('Freshness summary calculated', {
        ...logContext,
        ...summary
      });

      return summary;

    } catch (error) {
      logger.error('Failed to get freshness summary', error as Error, logContext);
      return {
        totalCompetitors: 0,
        freshSnapshots: 0,
        staleSnapshots: 0,
        missingSnapshots: 0,
        averageAgeInDays: 0,
        oldestSnapshotAgeInDays: 0
      };
    }
  }

  /**
   * Task 2.4: Efficient batch query to get snapshot ages for multiple competitors
   * Optimized for performance with minimal database queries
   */
  public async getSnapshotAgesBatch(competitorIds: string[]): Promise<Map<string, {
    ageInDays: number;
    snapshotId?: string;
    capturedAt?: Date;
    hasSnapshot: boolean;
  }>> {
    const logContext = {
      operation: 'getSnapshotAgesBatch',
      competitorCount: competitorIds.length,
      correlationId: this.correlationId
    };

    try {
      logger.debug('Executing batch snapshot age calculation', logContext);

      // Single query to get all latest snapshots for the given competitors
      const snapshots = await prisma.snapshot.findMany({
        where: {
          competitorId: {
            in: competitorIds
          },
          captureSuccess: true
        },
        select: {
          id: true,
          competitorId: true,
          createdAt: true
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      // Group snapshots by competitor ID and get the latest one for each
      const latestSnapshots = new Map<string, typeof snapshots[0]>();
      
      for (const snapshot of snapshots) {
        if (snapshot && !latestSnapshots.has(snapshot.competitorId)) {
          latestSnapshots.set(snapshot.competitorId, snapshot);
        }
      }

      // Calculate ages for all competitors
      const now = new Date();
      const results = new Map<string, {
        ageInDays: number;
        snapshotId?: string;
        capturedAt?: Date;
        hasSnapshot: boolean;
      }>();

      for (const competitorId of competitorIds) {
        const snapshot = latestSnapshots.get(competitorId);
        
        if (!snapshot) {
          results.set(competitorId, {
            ageInDays: Infinity,
            hasSnapshot: false
          });
        } else {
          const ageInMs = now.getTime() - snapshot.createdAt.getTime();
          const ageInDays = Math.floor(ageInMs / (1000 * 60 * 60 * 24));
          
          results.set(competitorId, {
            ageInDays,
            snapshotId: snapshot.id,
            capturedAt: snapshot.createdAt,
            hasSnapshot: true
          });
        }
      }

      logger.debug('Batch snapshot age calculation completed', {
        ...logContext,
        snapshotsFound: latestSnapshots.size,
        missingSnapshots: competitorIds.length - latestSnapshots.size
      });

      return results;

    } catch (error) {
      logger.error('Failed to execute batch snapshot age calculation', error as Error, logContext);
      return new Map();
    }
  }

  /**
   * Task 2.4: Get competitors that need snapshot updates based on various criteria
   * Efficient query that considers multiple factors for prioritization
   */
  public async getCompetitorsNeedingUpdate(
    projectId: string,
    criteria: {
      maxAgeInDays?: number;
      prioritizeFailedCaptures?: boolean;
      includeNeverCaptured?: boolean;
      limit?: number;
    } = {}
  ): Promise<Array<{
    competitorId: string;
    competitorName: string;
    priority: 'high' | 'medium' | 'low';
    reason: string;
    ageInDays: number;
    lastAttemptAt?: Date;
    failureCount?: number;
  }>> {
    const {
      maxAgeInDays = 7,
      prioritizeFailedCaptures = true,
      includeNeverCaptured = true,
      limit
    } = criteria;

    const logContext = {
      operation: 'getCompetitorsNeedingUpdate',
      projectId,
      criteria,
      correlationId: this.correlationId
    };

    try {
      logger.info('Getting competitors needing snapshot updates', logContext);

      // Task 2.4: Optimized query to get competitors with their snapshot history
      const competitors = await prisma.competitor.findMany({
        where: {
          projects: {
            some: {
              id: projectId
            }
          }
        },
        select: {
          id: true,
          name: true,
          snapshots: {
            select: {
              id: true,
              createdAt: true,
              captureSuccess: true,
              errorMessage: true
            },
            orderBy: {
              createdAt: 'desc'
            },
            take: 5 // Get recent history for analysis
          }
        },
        ...(limit && { take: limit })
      });

      const now = new Date();
      const results = competitors.map(competitor => {
        const snapshots = competitor.snapshots;
        const successfulSnapshots = snapshots.filter(s => s.captureSuccess);
        const failedSnapshots = snapshots.filter(s => !s.captureSuccess);
        
        let priority: 'high' | 'medium' | 'low' = 'medium';
        let reason = '';
        let ageInDays = Infinity;
        let lastAttemptAt: Date | undefined;

        if (snapshots.length === 0) {
          // Never captured
          if (includeNeverCaptured) {
            priority = 'high';
            reason = 'No snapshot ever captured';
            ageInDays = Infinity;
          } else {
            return null; // Skip if not including never captured
          }
        } else {
          const latestSnapshot = snapshots[0];
          const latestSuccessful = successfulSnapshots[0];
          
          lastAttemptAt = latestSnapshot.createdAt;

          if (!latestSuccessful) {
            // Has attempts but no successful captures
            priority = 'high';
            reason = `All ${snapshots.length} capture attempts failed`;
            ageInDays = Math.floor((now.getTime() - latestSnapshot.createdAt.getTime()) / (1000 * 60 * 60 * 24));
          } else {
            // Has successful captures, check age
            const ageMs = now.getTime() - latestSuccessful.createdAt.getTime();
            ageInDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));

            if (ageInDays > maxAgeInDays) {
              // Determine priority based on age and failure rate
              const recentFailures = failedSnapshots.filter(s => 
                (now.getTime() - s.createdAt.getTime()) < (7 * 24 * 60 * 60 * 1000) // Last 7 days
              ).length;

              if (ageInDays > maxAgeInDays * 2 || recentFailures > 2) {
                priority = 'high';
              } else if (ageInDays > maxAgeInDays * 1.5 || recentFailures > 0) {
                priority = 'medium';
              } else {
                priority = 'low';
              }

              reason = `Snapshot is ${ageInDays} days old (limit: ${maxAgeInDays} days)`;
              if (recentFailures > 0) {
                reason += `, ${recentFailures} recent failures`;
              }
            } else {
              return null; // Fresh snapshot, no update needed
            }
          }
        }

        return {
          competitorId: competitor.id,
          competitorName: competitor.name,
          priority,
          reason,
          ageInDays,
          lastAttemptAt,
          failureCount: failedSnapshots.length
        };
      }).filter(Boolean) as Array<{
        competitorId: string;
        competitorName: string;
        priority: 'high' | 'medium' | 'low';
        reason: string;
        ageInDays: number;
        lastAttemptAt?: Date;
        failureCount?: number;
      }>;

      // Sort by priority (high first) and then by age (oldest first)
      results.sort((a, b) => {
        const priorityOrder = { high: 3, medium: 2, low: 1 };
        const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
        if (priorityDiff !== 0) return priorityDiff;
        
        // If same priority, sort by age (oldest first)
        if (a.ageInDays === Infinity && b.ageInDays === Infinity) return 0;
        if (a.ageInDays === Infinity) return 1;
        if (b.ageInDays === Infinity) return -1;
        return b.ageInDays - a.ageInDays;
      });

      logger.info('Competitors needing updates identified', {
        ...logContext,
        totalCompetitors: competitors.length,
        needingUpdates: results.length,
        highPriority: results.filter(r => r.priority === 'high').length,
        mediumPriority: results.filter(r => r.priority === 'medium').length,
        lowPriority: results.filter(r => r.priority === 'low').length
      });

      return results;

    } catch (error) {
      logger.error('Failed to get competitors needing updates', error as Error, logContext);
      return [];
    }
  }
} 