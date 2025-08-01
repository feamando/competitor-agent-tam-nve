/**
 * Orphaned Report Resolver Service - Task 4.3
 * 
 * This service implements sophisticated logic to resolve the correct projectId 
 * for each orphaned report using multiple resolution strategies with confidence scoring.
 * 
 * Key Functions:
 * - Task 4.3: Resolve correct projectId for each orphaned report
 * - Multi-strategy resolution with confidence scoring
 * - Comprehensive validation and relationship verification
 * - Detailed resolution reporting and analytics
 */

import { PrismaClient, Project, Competitor, Report } from '@prisma/client';
import { logger, generateCorrelationId } from '@/lib/logger';

export interface OrphanedReportInput {
  id: string;
  name: string;
  competitorId: string | null;
  createdAt: Date;
  updatedAt: Date;
  status: string;
  reportType: string;
  title?: string;
}

export interface ProjectResolutionResult {
  reportId: string;
  originalCompetitorId: string | null;
  resolvedProjectId: string | null;
  confidence: 'high' | 'medium' | 'low' | 'failed';
  strategy: string;
  reasoning: string;
  metadata: {
    competitorName?: string;
    projectName?: string;
    projectStatus?: string;
    alternativeProjects?: Array<{
      id: string;
      name: string;
      status: string;
      confidence: string;
    }>;
    validationPassed: boolean;
    processingTimeMs: number;
  };
}

export interface ResolutionStrategy {
  name: string;
  description: string;
  priority: number;
  execute(report: OrphanedReportInput, context: ResolutionContext): Promise<ProjectResolutionResult | null>;
}

export interface ResolutionContext {
  prisma: PrismaClient;
  correlationId: string;
  timeWindow?: number; // milliseconds for temporal strategies
}

export interface ResolutionSummary {
  totalReports: number;
  resolved: number;
  highConfidence: number;
  mediumConfidence: number;
  lowConfidence: number;
  failed: number;
  strategiesUsed: Record<string, number>;
  averageProcessingTime: number;
  correlationId: string;
}

/**
 * Strategy 1: Direct Single Project Association
 * Highest confidence when competitor belongs to exactly one active project
 */
class DirectSingleProjectStrategy implements ResolutionStrategy {
  name = 'direct_single_project';
  description = 'Competitor belongs to exactly one active project';
  priority = 1;

  async execute(report: OrphanedReportInput, context: ResolutionContext): Promise<ProjectResolutionResult | null> {
    const startTime = Date.now();
    
    if (!report.competitorId) {
      return null; // Cannot resolve without competitor
    }

    try {
      const projects = await context.prisma.project.findMany({
        where: {
          competitors: {
            some: {
              id: report.competitorId
            }
          },
          status: {
            in: ['ACTIVE', 'DRAFT'] // Prioritize active projects
          }
        },
        include: {
          competitors: {
            select: {
              id: true,
              name: true
            }
          }
        },
        orderBy: [
          { status: 'asc' }, // ACTIVE comes before DRAFT
          { updatedAt: 'desc' }
        ]
      });

      if (projects.length === 1) {
        const project = projects[0];
        const competitor = project.competitors.find(c => c.id === report.competitorId);
        
        return {
          reportId: report.id,
          originalCompetitorId: report.competitorId,
          resolvedProjectId: project.id,
          confidence: 'high',
          strategy: this.name,
          reasoning: 'Competitor belongs to exactly one active project - perfect match',
          metadata: {
            competitorName: competitor?.name,
            projectName: project.name,
            projectStatus: project.status,
            validationPassed: true,
            processingTimeMs: Date.now() - startTime
          }
        };
      }

      return null; // More or fewer than 1 project, try other strategies
    } catch (error) {
      logger.error('DirectSingleProjectStrategy failed', error as Error, {
        correlationId: context.correlationId,
        reportId: report.id,
        competitorId: report.competitorId
      });
      return null;
    }
  }
}

/**
 * Strategy 2: Multiple Projects with Active Priority
 * Medium confidence when competitor belongs to multiple projects
 */
class MultipleProjectsPriorityStrategy implements ResolutionStrategy {
  name = 'multiple_projects_priority';
  description = 'Select most suitable project from multiple options';
  priority = 2;

  async execute(report: OrphanedReportInput, context: ResolutionContext): Promise<ProjectResolutionResult | null> {
    const startTime = Date.now();
    
    if (!report.competitorId) {
      return null;
    }

    try {
      const projects = await context.prisma.project.findMany({
        where: {
          competitors: {
            some: {
              id: report.competitorId
            }
          }
        },
        include: {
          competitors: {
            select: {
              id: true,
              name: true
            }
          },
          reports: {
            select: {
              id: true,
              createdAt: true
            },
            take: 1,
            orderBy: {
              createdAt: 'desc'
            }
          }
        },
        orderBy: [
          { status: 'asc' }, // ACTIVE first
          { updatedAt: 'desc' }
        ]
      });

      if (projects.length > 1) {
        // Priority logic:
        // 1. Active projects over others
        // 2. Most recently updated
        // 3. Projects with recent reports
        const activeProjects = projects.filter(p => p.status === 'ACTIVE');
        const targetProject = activeProjects.length > 0 ? activeProjects[0] : projects[0];
        
        const competitor = targetProject.competitors.find(c => c.id === report.competitorId);
        const alternativeProjects = projects
          .filter(p => p.id !== targetProject.id)
          .slice(0, 3) // Top 3 alternatives
          .map(p => ({
            id: p.id,
            name: p.name,
            status: p.status,
            confidence: p.status === 'ACTIVE' ? 'medium' : 'low'
          }));

        return {
          reportId: report.id,
          originalCompetitorId: report.competitorId,
          resolvedProjectId: targetProject.id,
          confidence: 'medium',
          strategy: this.name,
          reasoning: `Selected best project from ${projects.length} options based on status and activity`,
          metadata: {
            competitorName: competitor?.name,
            projectName: targetProject.name,
            projectStatus: targetProject.status,
            alternativeProjects,
            validationPassed: true,
            processingTimeMs: Date.now() - startTime
          }
        };
      }

      return null;
    } catch (error) {
      logger.error('MultipleProjectsPriorityStrategy failed', error as Error, {
        correlationId: context.correlationId,
        reportId: report.id
      });
      return null;
    }
  }
}

/**
 * Strategy 3: Temporal Proximity Resolution
 * Medium confidence based on project creation time proximity
 */
class TemporalProximityStrategy implements ResolutionStrategy {
  name = 'temporal_proximity';
  description = 'Match based on project creation time proximity';
  priority = 3;

  async execute(report: OrphanedReportInput, context: ResolutionContext): Promise<ProjectResolutionResult | null> {
    const startTime = Date.now();
    const timeWindow = context.timeWindow || (24 * 60 * 60 * 1000); // 24 hours default
    
    if (!report.competitorId) {
      return null;
    }

    try {
      const reportTime = new Date(report.createdAt);
      const startTime = new Date(reportTime.getTime() - timeWindow);
      const endTime = new Date(reportTime.getTime() + timeWindow);

      const temporalProjects = await context.prisma.project.findMany({
        where: {
          competitors: {
            some: {
              id: report.competitorId
            }
          },
          OR: [
            {
              createdAt: {
                gte: startTime,
                lte: endTime
              }
            },
            {
              updatedAt: {
                gte: startTime,
                lte: endTime
              }
            }
          ]
        },
        include: {
          competitors: {
            select: {
              id: true,
              name: true
            }
          }
        },
        orderBy: [
          { status: 'asc' },
          { createdAt: 'desc' }
        ],
        take: 1
      });

      if (temporalProjects.length > 0) {
        const project = temporalProjects[0];
        const competitor = project.competitors.find(c => c.id === report.competitorId);
        const timeDiff = Math.abs(new Date(project.createdAt).getTime() - reportTime.getTime());
        const hoursApart = Math.round(timeDiff / (1000 * 60 * 60));

        return {
          reportId: report.id,
          originalCompetitorId: report.competitorId,
          resolvedProjectId: project.id,
          confidence: hoursApart <= 2 ? 'medium' : 'low',
          strategy: this.name,
          reasoning: `Project found within ${hoursApart} hours of report creation`,
          metadata: {
            competitorName: competitor?.name,
            projectName: project.name,
            projectStatus: project.status,
            validationPassed: true,
            processingTimeMs: Date.now() - startTime
          }
        };
      }

      return null;
    } catch (error) {
      logger.error('TemporalProximityStrategy failed', error as Error, {
        correlationId: context.correlationId,
        reportId: report.id
      });
      return null;
    }
  }
}

/**
 * Strategy 4: Fallback Any Project Association
 * Low confidence fallback to any project containing the competitor
 */
class FallbackAnyProjectStrategy implements ResolutionStrategy {
  name = 'fallback_any_project';
  description = 'Fallback to any project containing the competitor';
  priority = 4;

  async execute(report: OrphanedReportInput, context: ResolutionContext): Promise<ProjectResolutionResult | null> {
    const startTime = Date.now();
    
    if (!report.competitorId) {
      return null;
    }

    try {
      const anyProject = await context.prisma.project.findFirst({
        where: {
          competitors: {
            some: {
              id: report.competitorId
            }
          }
        },
        include: {
          competitors: {
            select: {
              id: true,
              name: true
            }
          }
        },
        orderBy: [
          { status: 'asc' },
          { updatedAt: 'desc' }
        ]
      });

      if (anyProject) {
        const competitor = anyProject.competitors.find(c => c.id === report.competitorId);
        
        return {
          reportId: report.id,
          originalCompetitorId: report.competitorId,
          resolvedProjectId: anyProject.id,
          confidence: 'low',
          strategy: this.name,
          reasoning: 'Fallback resolution to any available project with this competitor',
          metadata: {
            competitorName: competitor?.name,
            projectName: anyProject.name,
            projectStatus: anyProject.status,
            validationPassed: true,
            processingTimeMs: Date.now() - startTime
          }
        };
      }

      return null;
    } catch (error) {
      logger.error('FallbackAnyProjectStrategy failed', error as Error, {
        correlationId: context.correlationId,
        reportId: report.id
      });
      return null;
    }
  }
}

/**
 * Main Orphaned Report Resolver Service
 */
export class OrphanedReportResolver {
  private prisma: PrismaClient;
  private strategies: ResolutionStrategy[];
  private correlationId: string;

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma || new PrismaClient();
    this.correlationId = generateCorrelationId();
    
    // Initialize resolution strategies in priority order
    this.strategies = [
      new DirectSingleProjectStrategy(),
      new MultipleProjectsPriorityStrategy(),
      new TemporalProximityStrategy(),
      new FallbackAnyProjectStrategy()
    ].sort((a, b) => a.priority - b.priority);
  }

  /**
   * Task 4.3: Main resolution function - resolves correct projectId for each orphaned report
   */
  async resolveOrphanedReports(reports: OrphanedReportInput[]): Promise<ProjectResolutionResult[]> {
    logger.info('Task 4.3: Starting resolution of orphaned reports', {
      correlationId: this.correlationId,
      totalReports: reports.length,
      strategies: this.strategies.map(s => s.name)
    });

    const results: ProjectResolutionResult[] = [];
    const context: ResolutionContext = {
      prisma: this.prisma,
      correlationId: this.correlationId,
      timeWindow: 24 * 60 * 60 * 1000 // 24 hours
    };

    for (const report of reports) {
      try {
        const result = await this.resolveReport(report, context);
        results.push(result);
        
        logger.info('Task 4.3: Report resolution completed', {
          correlationId: this.correlationId,
          reportId: report.id,
          resolvedProjectId: result.resolvedProjectId,
          confidence: result.confidence,
          strategy: result.strategy
        });
      } catch (error) {
        logger.error('Task 4.3: Failed to resolve report', error as Error, {
          correlationId: this.correlationId,
          reportId: report.id,
          competitorId: report.competitorId
        });

        // Create failed resolution result
        results.push({
          reportId: report.id,
          originalCompetitorId: report.competitorId,
          resolvedProjectId: null,
          confidence: 'failed',
          strategy: 'error',
          reasoning: `Resolution failed: ${(error as Error).message}`,
          metadata: {
            validationPassed: false,
            processingTimeMs: 0
          }
        });
      }
    }

    logger.info('Task 4.3: All reports resolution completed', {
      correlationId: this.correlationId,
      totalProcessed: results.length,
      successful: results.filter(r => r.resolvedProjectId !== null).length,
      failed: results.filter(r => r.confidence === 'failed').length
    });

    return results;
  }

  /**
   * Resolve a single orphaned report using the strategy chain
   */
  private async resolveReport(report: OrphanedReportInput, context: ResolutionContext): Promise<ProjectResolutionResult> {
    // Try each strategy in priority order
    for (const strategy of this.strategies) {
      try {
        logger.debug(`Attempting strategy: ${strategy.name}`, {
          correlationId: context.correlationId,
          reportId: report.id,
          strategy: strategy.name
        });

        const result = await strategy.execute(report, context);
        
        if (result && result.resolvedProjectId) {
          // Validate the resolution before returning
          const isValid = await this.validateResolution(result, context);
          
          if (isValid) {
            logger.info(`Strategy ${strategy.name} succeeded`, {
              correlationId: context.correlationId,
              reportId: report.id,
              projectId: result.resolvedProjectId,
              confidence: result.confidence
            });
            return result;
          } else {
            logger.warn(`Strategy ${strategy.name} validation failed`, {
              correlationId: context.correlationId,
              reportId: report.id,
              projectId: result.resolvedProjectId
            });
          }
        }
      } catch (error) {
        logger.warn(`Strategy ${strategy.name} failed`, {
          correlationId: context.correlationId,
          reportId: report.id,
          error: (error as Error).message
        });
      }
    }

    // All strategies failed
    return {
      reportId: report.id,
      originalCompetitorId: report.competitorId,
      resolvedProjectId: null,
      confidence: 'failed',
      strategy: 'none',
      reasoning: report.competitorId 
        ? 'No suitable project found for competitor after trying all strategies' 
        : 'No competitor associated with report - cannot resolve project',
      metadata: {
        validationPassed: false,
        processingTimeMs: 0
      }
    };
  }

  /**
   * Validate that the resolved project-competitor relationship exists
   */
  private async validateResolution(result: ProjectResolutionResult, context: ResolutionContext): Promise<boolean> {
    if (!result.resolvedProjectId || !result.originalCompetitorId) {
      return false;
    }

    try {
      const relationship = await context.prisma.project.findFirst({
        where: {
          id: result.resolvedProjectId,
          competitors: {
            some: {
              id: result.originalCompetitorId
            }
          }
        }
      });

      const isValid = !!relationship;
      result.metadata.validationPassed = isValid;
      
      return isValid;
    } catch (error) {
      logger.error('Resolution validation failed', error as Error, {
        correlationId: context.correlationId,
        reportId: result.reportId,
        projectId: result.resolvedProjectId,
        competitorId: result.originalCompetitorId
      });
      return false;
    }
  }

  /**
   * Generate resolution summary statistics
   */
  generateResolutionSummary(results: ProjectResolutionResult[]): ResolutionSummary {
    const strategiesUsed: Record<string, number> = {};
    let totalProcessingTime = 0;

    results.forEach(result => {
      strategiesUsed[result.strategy] = (strategiesUsed[result.strategy] || 0) + 1;
      totalProcessingTime += result.metadata.processingTimeMs || 0;
    });

    return {
      totalReports: results.length,
      resolved: results.filter(r => r.resolvedProjectId !== null).length,
      highConfidence: results.filter(r => r.confidence === 'high').length,
      mediumConfidence: results.filter(r => r.confidence === 'medium').length,
      lowConfidence: results.filter(r => r.confidence === 'low').length,
      failed: results.filter(r => r.confidence === 'failed').length,
      strategiesUsed,
      averageProcessingTime: results.length > 0 ? Math.round(totalProcessingTime / results.length) : 0,
      correlationId: this.correlationId
    };
  }

  /**
   * Get available resolution strategies
   */
  getAvailableStrategies(): Array<{name: string; description: string; priority: number}> {
    return this.strategies.map(s => ({
      name: s.name,
      description: s.description,
      priority: s.priority
    }));
  }

  /**
   * Close database connection
   */
  async cleanup(): Promise<void> {
    await this.prisma.$disconnect();
  }
} 