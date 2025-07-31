import { prisma } from '@/lib/prisma';
import { logger, generateCorrelationId } from '@/lib/logger';

/**
 * Snapshot existence verification and validation utilities
 * Task 1.4: Create snapshot existence verification utility function
 * Task 1.3: Implement snapshot metadata validation
 */

export interface SnapshotValidationResult {
  isValid: boolean;
  hasContent: boolean;
  hasMetadata: boolean;
  errors: string[];
  warnings: string[];
  metadata?: {
    contentLength?: number;
    hasTitle?: boolean;
    hasDescription?: boolean;
    statusCode?: number;
    captureSuccess?: boolean;
  };
}

export interface SnapshotExistenceCheck {
  exists: boolean;
  snapshotId?: string;
  capturedAt?: Date;
  isRecent?: boolean;
  ageInDays?: number;
}

/**
 * Verify if a snapshot exists for a specific competitor
 */
export async function verifySnapshotExists(competitorId: string): Promise<SnapshotExistenceCheck> {
  const correlationId = generateCorrelationId();
  const logContext = {
    operation: 'verifySnapshotExists',
    competitorId,
    correlationId
  };

  try {
    logger.debug('Verifying snapshot existence', logContext);

    const latestSnapshot = await prisma.snapshot.findFirst({
      where: {
        competitorId
      },
      select: {
        id: true,
        createdAt: true,
        captureSuccess: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    if (!latestSnapshot) {
      logger.info('No snapshot found for competitor', logContext);
      return {
        exists: false
      };
    }

    const ageInDays = Math.floor((Date.now() - latestSnapshot.createdAt.getTime()) / (1000 * 60 * 60 * 24));
    const isRecent = ageInDays <= 7; // Consider recent if captured within 7 days

    const result = {
      exists: true,
      snapshotId: latestSnapshot.id,
      capturedAt: latestSnapshot.createdAt,
      isRecent,
      ageInDays
    };

    logger.debug('Snapshot existence verified', {
      ...logContext,
      ...result
    });

    return result;

  } catch (error) {
    logger.error('Failed to verify snapshot existence', error as Error, logContext);
    return {
      exists: false
    };
  }
}

/**
 * Validate snapshot metadata for completeness and correctness
 */
export async function validateSnapshotMetadata(snapshotId: string): Promise<SnapshotValidationResult> {
  const correlationId = generateCorrelationId();
  const logContext = {
    operation: 'validateSnapshotMetadata',
    snapshotId,
    correlationId
  };

  try {
    logger.debug('Validating snapshot metadata', logContext);

    const snapshot = await prisma.snapshot.findUnique({
      where: { id: snapshotId },
      select: {
        id: true,
        metadata: true,
        captureSuccess: true,
        errorMessage: true,
        createdAt: true
      }
    });

    if (!snapshot) {
      return {
        isValid: false,
        hasContent: false,
        hasMetadata: false,
        errors: ['Snapshot not found'],
        warnings: []
      };
    }

    const errors: string[] = [];
    const warnings: string[] = [];
    let hasContent = false;
    let hasMetadata = false;

    // Check if metadata exists
    if (!snapshot.metadata) {
      errors.push('Missing metadata');
    } else {
      hasMetadata = true;
      const metadata = snapshot.metadata as any;

      // Validate different metadata structures
      const validationResults = validateMetadataStructures(metadata);
      hasContent = validationResults.hasContent;
      errors.push(...validationResults.errors);
      warnings.push(...validationResults.warnings);

      // Check capture success indicators
      if (snapshot.captureSuccess === false) {
        errors.push('Capture marked as failed');
      }

      if (snapshot.errorMessage) {
        errors.push(`Error during capture: ${snapshot.errorMessage}`);
      }
    }

    const result: SnapshotValidationResult = {
      isValid: errors.length === 0,
      hasContent,
      hasMetadata,
      errors,
      warnings,
      ...(hasMetadata && { metadata: extractSnapshotMetadata(snapshot.metadata as any) })
    };

    logger.info('Snapshot metadata validation completed', {
      ...logContext,
      isValid: result.isValid,
      errorCount: errors.length,
      warningCount: warnings.length
    });

    return result;

  } catch (error) {
    logger.error('Failed to validate snapshot metadata', error as Error, logContext);
    return {
      isValid: false,
      hasContent: false,
      hasMetadata: false,
      errors: [`Validation failed: ${error instanceof Error ? error.message : String(error)}`],
      warnings: []
    };
  }
}

/**
 * Validate different metadata structures that might exist
 */
function validateMetadataStructures(metadata: any): {
  hasContent: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  let hasContent = false;

  // Check WebsiteScraper structure
  if (metadata.html || metadata.text || metadata.title) {
    hasContent = true;
    
    if (!metadata.html) {
      warnings.push('Missing HTML content');
    } else if (typeof metadata.html !== 'string' || metadata.html.length < 100) {
      warnings.push('HTML content seems incomplete or too short');
    }

    if (!metadata.title) {
      warnings.push('Missing page title');
    }

    // Check metadata sub-object
    if (metadata.metadata) {
      const innerMetadata = metadata.metadata;
      if (!innerMetadata.statusCode) {
        warnings.push('Missing HTTP status code');
      } else if (innerMetadata.statusCode < 200 || innerMetadata.statusCode >= 400) {
        errors.push(`HTTP error status: ${innerMetadata.statusCode}`);
      }
    }
  }

  // Check WebScraperService structure
  if (metadata.content || metadata.textContent || metadata.htmlContent) {
    hasContent = true;
    
    if (!metadata.content && !metadata.htmlContent) {
      warnings.push('Missing scraped content');
    }
  }

  // Check for explicit status indicators
  if (metadata.status) {
    if (metadata.status === 'failed' || metadata.status === 'error') {
      errors.push(`Metadata indicates failure: ${metadata.status}`);
    } else if (metadata.status === 'completed' || metadata.status === 'success') {
      hasContent = true;
    }
  }

  // General content validation
  if (!hasContent) {
    errors.push('No valid content found in metadata');
  }

  return { hasContent, errors, warnings };
}

/**
 * Extract metadata summary from snapshot metadata
 */
function extractSnapshotMetadata(metadata: any): {
  contentLength?: number;
  hasTitle?: boolean;
  hasDescription?: boolean;
  statusCode?: number;
  captureSuccess?: boolean;
} {
  return {
    contentLength: metadata.html?.length || metadata.content?.length || metadata.htmlContent?.length,
    hasTitle: !!(metadata.title || metadata.pageTitle),
    hasDescription: !!(metadata.description || metadata.pageDescription),
    statusCode: metadata.metadata?.statusCode || metadata.statusCode,
    captureSuccess: metadata.status === 'completed' || metadata.status === 'success' || metadata.captureSuccess
  };
}

/**
 * Task 4.2: Get competitors without snapshots for a project
 * Utility function to identify competitors that need initial snapshot collection
 */
export async function getCompetitorsWithoutSnapshots(projectId: string): Promise<Array<{
  competitorId: string;
  competitorName: string;
  website: string;
  priority: 'high' | 'medium' | 'low';
  reason: string;
}>> {
  const correlationId = generateCorrelationId();
  const logContext = {
    operation: 'getCompetitorsWithoutSnapshots',
    projectId,
    correlationId
  };

  try {
    logger.info('Getting competitors without snapshots', logContext);

    // Get all competitors for this project that have no successful snapshots
    const competitorsWithoutSnapshots = await prisma.competitor.findMany({
      where: {
        projects: {
          some: {
            id: projectId
          }
        },
        snapshots: {
          none: {
            captureSuccess: true
          }
        }
      },
      select: {
        id: true,
        name: true,
        website: true,
        createdAt: true,
        snapshots: {
          where: {
            captureSuccess: false
          },
          select: {
            id: true,
            createdAt: true,
            errorMessage: true
          },
          orderBy: {
            createdAt: 'desc'
          },
          take: 3 // Get recent failed attempts for analysis
        }
      }
    });

    const results = competitorsWithoutSnapshots.map(competitor => {
      const failedAttempts = competitor.snapshots.length;
      const daysSinceCreation = Math.floor((Date.now() - competitor.createdAt.getTime()) / (1000 * 60 * 60 * 24));
      
      // Determine priority based on various factors
      let priority: 'high' | 'medium' | 'low' = 'medium';
      let reason = 'No successful snapshot exists';

      if (failedAttempts === 0) {
        // Never attempted
        if (daysSinceCreation > 1) {
          priority = 'high';
          reason = `Never captured, created ${daysSinceCreation} days ago`;
        } else {
          priority = 'high';
          reason = 'Newly created, needs initial snapshot';
        }
      } else {
        // Has failed attempts
        if (failedAttempts > 3) {
          priority = 'high';
          reason = `${failedAttempts} failed capture attempts`;
        } else if (daysSinceCreation > 7) {
          priority = 'high';
          reason = `${failedAttempts} failed attempts, created ${daysSinceCreation} days ago`;
        } else {
          priority = 'medium';
          reason = `${failedAttempts} failed capture attempts`;
        }
      }

      return {
        competitorId: competitor.id,
        competitorName: competitor.name,
        website: competitor.website,
        priority,
        reason
      };
    });

    // Sort by priority (high first) and then by creation date (oldest first)
         results.sort((a, b) => {
       const priorityOrder: Record<string, number> = { high: 3, medium: 2, low: 1 };
       const priorityDiff = (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0);
       if (priorityDiff !== 0) return priorityDiff;
       
       // If same priority, sort by name for consistency
       return a.competitorName.localeCompare(b.competitorName);
     });

    logger.info('Competitors without snapshots identified', {
      ...logContext,
      totalFound: results.length,
      highPriority: results.filter(r => r.priority === 'high').length,
      mediumPriority: results.filter(r => r.priority === 'medium').length,
      lowPriority: results.filter(r => r.priority === 'low').length
    });

    return results;

  } catch (error) {
    logger.error('Failed to get competitors without snapshots', error as Error, logContext);
    return [];
  }
}

/**
 * Check if snapshots exist for all competitors in a project
 */
export async function checkProjectCompetitorSnapshots(projectId: string): Promise<{
  totalCompetitors: number;
  competitorsWithSnapshots: number;
  competitorsWithoutSnapshots: string[];
  competitorsWithStaleSnapshots: string[];
  competitorsWithValidSnapshots: string[];
}> {
  const correlationId = generateCorrelationId();
  const logContext = {
    operation: 'checkProjectCompetitorSnapshots',
    projectId,
    correlationId
  };

  try {
    logger.info('Checking project competitor snapshots', logContext);

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
            metadata: true
          },
          orderBy: {
            createdAt: 'desc'
          },
          take: 1
        }
      }
    });

    const competitorsWithoutSnapshots: string[] = [];
    const competitorsWithStaleSnapshots: string[] = [];
    const competitorsWithValidSnapshots: string[] = [];
    let competitorsWithSnapshots = 0;

    for (const competitor of competitors) {
      const latestSnapshot = competitor.snapshots[0];

      if (!latestSnapshot) {
        competitorsWithoutSnapshots.push(competitor.name);
        continue;
      }

      competitorsWithSnapshots++;

      // Check if snapshot is stale (older than 7 days)
      const ageInDays = Math.floor((Date.now() - latestSnapshot.createdAt.getTime()) / (1000 * 60 * 60 * 24));
      
      if (ageInDays > 7) {
        competitorsWithStaleSnapshots.push(competitor.name);
      } else {
        // Validate the snapshot
        const validation = await validateSnapshotMetadata(latestSnapshot.id);
        if (validation.isValid) {
          competitorsWithValidSnapshots.push(competitor.name);
        } else {
          competitorsWithStaleSnapshots.push(competitor.name); // Treat invalid as stale
        }
      }
    }

    const result = {
      totalCompetitors: competitors.length,
      competitorsWithSnapshots,
      competitorsWithoutSnapshots,
      competitorsWithStaleSnapshots,
      competitorsWithValidSnapshots
    };

    logger.info('Project competitor snapshots checked', {
      ...logContext,
      ...result
    });

    return result;

  } catch (error) {
    logger.error('Failed to check project competitor snapshots', error as Error, logContext);
    return {
      totalCompetitors: 0,
      competitorsWithSnapshots: 0,
      competitorsWithoutSnapshots: [],
      competitorsWithStaleSnapshots: [],
      competitorsWithValidSnapshots: []
    };
  }
} 