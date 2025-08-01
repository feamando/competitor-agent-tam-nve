/**
 * Missing Initial Reports Processor Service - Task 5.4
 * 
 * This service identifies existing projects that are missing initial reports
 * and triggers their generation in a controlled, prioritized manner.
 * 
 * Key Functions:
 * - Task 5.4: Trigger missing initial reports for existing projects
 * - Identify projects missing initial comparative reports
 * - Prioritize projects based on importance and age
 * - Process missing reports in controlled batches
 * - Monitor progress and handle failures gracefully
 * - Provide detailed reporting on processing results
 * 
 * Integration with Task 5.3:
 * - Uses ProjectInitialReportEnsureService for actual report generation
 * - Leverages existing validation and retry mechanisms
 * - Maintains consistency with new project flows
 */

import { PrismaClient, Project, ProjectStatus } from '@prisma/client';
import { logger, generateCorrelationId, createCorrelationLogger } from '../lib/logger';
import { ensureProjectHasInitialReport } from './ProjectInitialReportEnsureService';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

interface ProjectMissingReportInfo {
  id: string;
  name: string;
  status: ProjectStatus;
  createdAt: Date;
  updatedAt: Date;
  competitorCount: number;
  hasProduct: boolean;
  userEmail?: string;
  priority: 'high' | 'medium' | 'low';
  priorityScore: number;
  creationMethod: 'api' | 'chat' | 'manual' | 'unknown';
  ageInDays: number;
  issues: string[];
}

interface ProcessingBatch {
  id: string;
  projects: ProjectMissingReportInfo[];
  startTime: Date;
  endTime?: Date;
  totalProjects: number;
  successCount: number;
  failureCount: number;
  skippedCount: number;
  processingTime?: number;
  results: ProcessingResult[];
}

interface ProcessingResult {
  projectId: string;
  projectName: string;
  success: boolean;
  reportId?: string;
  reportTitle?: string;
  attempts: number;
  processingTime: number;
  error?: string;
  skipped?: boolean;
  skipReason?: string;
}

interface ProcessingOptions {
  maxConcurrentProjects?: number;
  batchSize?: number;
  priorityFilter?: 'high' | 'medium' | 'low' | 'all';
  ageFilter?: {
    minDays?: number;
    maxDays?: number;
  };
  dryRun?: boolean;
  continueOnError?: boolean;
  statusFilter?: ProjectStatus[];
  includeArchivedProjects?: boolean;
}

interface ProcessingSummary {
  totalProjectsAnalyzed: number;
  projectsMissingReports: number;
  projectsProcessed: number;
  projectsSuccessful: number;
  projectsFailed: number;
  projectsSkipped: number;
  successRate: number;
  totalProcessingTime: number;
  batchesProcessed: number;
  correlationId: string;
  processingStartTime: Date;
  processingEndTime?: Date;
}

export class MissingInitialReportsProcessorService {
  private prisma: PrismaClient;
  private processingBatches: Map<string, ProcessingBatch>;
  private isProcessing: boolean;
  private currentCorrelationId?: string;

  constructor() {
    this.prisma = new PrismaClient();
    this.processingBatches = new Map();
    this.isProcessing = false;
  }

  /**
   * Task 5.4: Main method - Process missing initial reports for existing projects
   * This is the primary entry point for triggering missing initial reports
   */
  async processMissingInitialReports(
    options: ProcessingOptions = {}
  ): Promise<ProcessingSummary> {
    const correlationId = generateCorrelationId();
    const processingLogger = createCorrelationLogger(correlationId);
    const startTime = Date.now();
    this.currentCorrelationId = correlationId;

    if (this.isProcessing) {
      throw new Error('Processing already in progress. Please wait for current processing to complete.');
    }

    this.isProcessing = true;

    try {
      processingLogger.info('Task 5.4: Starting missing initial reports processing', {
        correlationId,
        options,
        processingStartTime: new Date().toISOString()
      });

      // Step 1: Identify projects missing initial reports
      const projectsMissingReports = await this.identifyProjectsMissingReports(options, processingLogger);

      // Step 2: Prioritize and filter projects
      const filteredProjects = this.prioritizeAndFilterProjects(projectsMissingReports, options, processingLogger);

      // Step 3: Create processing batches
      const batches = this.createProcessingBatches(filteredProjects, options, processingLogger);

      // Step 4: Process batches sequentially
      const allResults: ProcessingResult[] = [];
      let totalSuccessful = 0;
      let totalFailed = 0;
      let totalSkipped = 0;

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        
        processingLogger.info(`Task 5.4: Processing batch ${i + 1}/${batches.length}`, {
          correlationId,
          batchId: batch.id,
          projectCount: batch.totalProjects
        });

        const batchResults = await this.processBatch(batch, options, processingLogger);
        allResults.push(...batchResults.results);
        
        totalSuccessful += batchResults.successCount;
        totalFailed += batchResults.failureCount;
        totalSkipped += batchResults.skippedCount;

        // Store batch results
        this.processingBatches.set(batch.id, batchResults);

        // Small delay between batches to avoid overwhelming the system
        if (i < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      // Step 5: Generate processing summary
      const summary = this.generateProcessingSummary(
        projectsMissingReports.length,
        filteredProjects.length,
        allResults,
        batches.length,
        correlationId,
        new Date(startTime)
      );

      // Step 6: Save detailed results
      await this.saveProcessingResults(summary, allResults, processingLogger);

      processingLogger.info('Task 5.4: Missing initial reports processing completed', {
        correlationId,
        summary: {
          totalAnalyzed: summary.totalProjectsAnalyzed,
          missing: summary.projectsMissingReports,
          processed: summary.projectsProcessed,
          successful: summary.projectsSuccessful,
          failed: summary.projectsFailed,
          successRate: summary.successRate
        }
      });

      return summary;

    } catch (error) {
      processingLogger.error('Task 5.4: Missing initial reports processing failed', error as Error, {
        correlationId,
        processingTime: Date.now() - startTime
      });
      throw error;
    } finally {
      this.isProcessing = false;
      this.currentCorrelationId = undefined;
    }
  }

  /**
   * Task 5.4: Identify all projects missing initial reports
   */
  private async identifyProjectsMissingReports(
    options: ProcessingOptions,
    processingLogger: any
  ): Promise<ProjectMissingReportInfo[]> {
    processingLogger.info('Task 5.4: Identifying projects missing initial reports', {
      options
    });

    try {
      // Build query filters
      const whereClause: any = {};
      
      // Status filter
      if (options.statusFilter && options.statusFilter.length > 0) {
        whereClause.status = { in: options.statusFilter };
      } else if (!options.includeArchivedProjects) {
        whereClause.status = { in: ['ACTIVE', 'DRAFT', 'PAUSED'] };
      }

      // Age filter
      if (options.ageFilter) {
        const now = new Date();
        if (options.ageFilter.maxDays) {
          const minDate = new Date(now.getTime() - (options.ageFilter.maxDays * 24 * 60 * 60 * 1000));
          whereClause.createdAt = { gte: minDate };
        }
        if (options.ageFilter.minDays) {
          const maxDate = new Date(now.getTime() - (options.ageFilter.minDays * 24 * 60 * 60 * 1000));
          whereClause.createdAt = { ...whereClause.createdAt, lte: maxDate };
        }
      }

      // Fetch projects with related data
      const projects = await this.prisma.project.findMany({
        where: whereClause,
        include: {
          competitors: {
            select: { id: true, name: true }
          },
          products: {
            select: { id: true, name: true }
          },
          reports: {
            where: { isInitialReport: true },
            select: { id: true, name: true, status: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      // Filter projects that are missing initial reports
      const projectsMissingReports: ProjectMissingReportInfo[] = [];
      
      for (const project of projects) {
        const hasInitialReport = project.reports.length > 0;
        
        if (!hasInitialReport) {
          const ageInDays = Math.floor((Date.now() - project.createdAt.getTime()) / (1000 * 60 * 60 * 24));
          const creationMethod = this.determineCreationMethod(project);
          const priority = this.calculateProjectPriority(project, ageInDays);
          const issues = this.identifyProjectIssues(project);

          projectsMissingReports.push({
            id: project.id,
            name: project.name,
            status: project.status,
            createdAt: project.createdAt,
            updatedAt: project.updatedAt,
            competitorCount: project.competitors.length,
            hasProduct: project.products.length > 0,
            userEmail: project.userEmail || undefined,
            priority: priority.level,
            priorityScore: priority.score,
            creationMethod,
            ageInDays,
            issues
          });
        }
      }

      processingLogger.info('Task 5.4: Projects missing initial reports identified', {
        totalProjects: projects.length,
        projectsMissingReports: projectsMissingReports.length,
        missingReportRate: Math.round((projectsMissingReports.length / projects.length) * 100)
      });

      return projectsMissingReports;

    } catch (error) {
      processingLogger.error('Task 5.4: Failed to identify projects missing reports', error as Error);
      throw error;
    }
  }

  /**
   * Task 5.4: Determine how a project was created
   */
  private determineCreationMethod(project: any): 'api' | 'chat' | 'manual' | 'unknown' {
    if (project.parameters) {
      if (project.parameters.autoGenerateInitialReport !== undefined) {
        return 'api';
      }
      if (project.parameters.createdViaChat || project.parameters.chatSessionId) {
        return 'chat';
      }
    }
    return 'unknown';
  }

  /**
   * Task 5.4: Calculate project priority for processing
   */
  private calculateProjectPriority(project: any, ageInDays: number): { level: 'high' | 'medium' | 'low'; score: number } {
    let score = 0;

    // Status priority
    if (project.status === 'ACTIVE') score += 30;
    else if (project.status === 'DRAFT') score += 20;
    else if (project.status === 'PAUSED') score += 10;

    // Competitor count priority
    if (project.competitors.length >= 5) score += 25;
    else if (project.competitors.length >= 3) score += 20;
    else if (project.competitors.length >= 1) score += 15;

    // Product entity priority
    if (project.products.length > 0) score += 15;

    // Age priority (newer projects get higher priority)
    if (ageInDays <= 7) score += 20;
    else if (ageInDays <= 30) score += 15;
    else if (ageInDays <= 90) score += 10;
    else score += 5;

    // User email priority
    if (project.userEmail && project.userEmail !== 'mock@example.com') score += 10;

    // Determine level based on score
    let level: 'high' | 'medium' | 'low';
    if (score >= 70) level = 'high';
    else if (score >= 40) level = 'medium';
    else level = 'low';

    return { level, score };
  }

  /**
   * Task 5.4: Identify issues with a project
   */
  private identifyProjectIssues(project: any): string[] {
    const issues: string[] = [];

    if (project.competitors.length === 0) {
      issues.push('No competitors assigned');
    }
    if (project.products.length === 0) {
      issues.push('No product entity');
    }
    if (project.status !== 'ACTIVE') {
      issues.push(`Project status is ${project.status}`);
    }
    if (!project.userEmail || project.userEmail === 'mock@example.com') {
      issues.push('No real user email');
    }

    return issues;
  }

  /**
   * Task 5.4: Prioritize and filter projects based on options
   */
  private prioritizeAndFilterProjects(
    projects: ProjectMissingReportInfo[],
    options: ProcessingOptions,
    processingLogger: any
  ): ProjectMissingReportInfo[] {
    let filteredProjects = [...projects];

    // Priority filter
    if (options.priorityFilter && options.priorityFilter !== 'all') {
      filteredProjects = filteredProjects.filter(p => p.priority === options.priorityFilter);
    }

    // Sort by priority score (highest first)
    filteredProjects.sort((a, b) => b.priorityScore - a.priorityScore);

    processingLogger.info('Task 5.4: Projects prioritized and filtered', {
      originalCount: projects.length,
      filteredCount: filteredProjects.length,
      priorityDistribution: {
        high: filteredProjects.filter(p => p.priority === 'high').length,
        medium: filteredProjects.filter(p => p.priority === 'medium').length,
        low: filteredProjects.filter(p => p.priority === 'low').length
      }
    });

    return filteredProjects;
  }

  /**
   * Task 5.4: Create processing batches
   */
  private createProcessingBatches(
    projects: ProjectMissingReportInfo[],
    options: ProcessingOptions,
    processingLogger: any
  ): ProcessingBatch[] {
    const batchSize = options.batchSize || 10;
    const batches: ProcessingBatch[] = [];

    for (let i = 0; i < projects.length; i += batchSize) {
      const batchProjects = projects.slice(i, i + batchSize);
      const batchId = `batch_${Math.floor(i / batchSize) + 1}_${generateCorrelationId().slice(-8)}`;

      batches.push({
        id: batchId,
        projects: batchProjects,
        startTime: new Date(),
        totalProjects: batchProjects.length,
        successCount: 0,
        failureCount: 0,
        skippedCount: 0,
        results: []
      });
    }

    processingLogger.info('Task 5.4: Processing batches created', {
      totalProjects: projects.length,
      batchCount: batches.length,
      batchSize,
      batches: batches.map(b => ({
        id: b.id,
        projectCount: b.totalProjects
      }))
    });

    return batches;
  }

  /**
   * Task 5.4: Process a single batch of projects
   */
  private async processBatch(
    batch: ProcessingBatch,
    options: ProcessingOptions,
    processingLogger: any
  ): Promise<ProcessingBatch> {
    const batchStartTime = Date.now();
    const maxConcurrent = options.maxConcurrentProjects || 3;

    processingLogger.info(`Task 5.4: Starting batch processing`, {
      batchId: batch.id,
      projectCount: batch.totalProjects,
      maxConcurrent,
      dryRun: options.dryRun
    });

    const results: ProcessingResult[] = [];
    
    // Process projects in concurrent groups
    for (let i = 0; i < batch.projects.length; i += maxConcurrent) {
      const concurrentProjects = batch.projects.slice(i, i + maxConcurrent);
      
      const concurrentPromises = concurrentProjects.map(async (project) => {
        return await this.processProject(project, options, processingLogger);
      });

      const concurrentResults = await Promise.allSettled(concurrentPromises);
      
      concurrentResults.forEach((result, index) => {
        const project = concurrentProjects[index];
        if (result.status === 'fulfilled') {
          results.push(result.value);
          if (result.value.success) batch.successCount++;
          else if (result.value.skipped) batch.skippedCount++;
          else batch.failureCount++;
        } else {
          results.push({
            projectId: project.id,
            projectName: project.name,
            success: false,
            attempts: 0,
            processingTime: 0,
            error: result.reason?.message || 'Unknown error'
          });
          batch.failureCount++;
        }
      });

      // Small delay between concurrent groups
      if (i + maxConcurrent < batch.projects.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    batch.endTime = new Date();
    batch.processingTime = Date.now() - batchStartTime;
    batch.results = results;

    processingLogger.info(`Task 5.4: Batch processing completed`, {
      batchId: batch.id,
      successCount: batch.successCount,
      failureCount: batch.failureCount,
      skippedCount: batch.skippedCount,
      processingTime: batch.processingTime
    });

    return batch;
  }

  /**
   * Task 5.4: Process a single project
   */
  private async processProject(
    project: ProjectMissingReportInfo,
    options: ProcessingOptions,
    processingLogger: any
  ): Promise<ProcessingResult> {
    const projectStartTime = Date.now();

    try {
      // Check for blocking issues
      if (project.competitorCount === 0) {
        return {
          projectId: project.id,
          projectName: project.name,
          success: false,
          attempts: 0,
          processingTime: Date.now() - projectStartTime,
          skipped: true,
          skipReason: 'No competitors assigned to project'
        };
      }

      // Dry run mode
      if (options.dryRun) {
        return {
          projectId: project.id,
          projectName: project.name,
          success: true,
          attempts: 0,
          processingTime: Date.now() - projectStartTime,
          skipped: true,
          skipReason: 'Dry run mode - would have generated initial report'
        };
      }

      processingLogger.info(`Task 5.4: Processing project for initial report`, {
        projectId: project.id,
        projectName: project.name,
        priority: project.priority,
        ageInDays: project.ageInDays
      });

      // Use Task 5.3 service to ensure initial report
      const context = {
        projectId: project.id,
        creationMethod: project.creationMethod,
        correlationId: `${this.currentCorrelationId}_${project.id}`,
        userEmail: project.userEmail,
        createdAt: project.createdAt,
        metadata: {
          task54Processing: true,
          originalCreationMethod: project.creationMethod,
          priority: project.priority,
          ageInDays: project.ageInDays
        }
      };

      const result = await ensureProjectHasInitialReport(project.id, context);

      return {
        projectId: project.id,
        projectName: project.name,
        success: result.success,
        reportId: result.reportId,
        reportTitle: result.reportTitle,
        attempts: result.attempts,
        processingTime: Date.now() - projectStartTime,
        error: result.error
      };

    } catch (error) {
      processingLogger.error(`Task 5.4: Project processing failed`, error as Error, {
        projectId: project.id,
        projectName: project.name
      });

      return {
        projectId: project.id,
        projectName: project.name,
        success: false,
        attempts: 1,
        processingTime: Date.now() - projectStartTime,
        error: (error as Error).message
      };
    }
  }

  /**
   * Task 5.4: Generate processing summary
   */
  private generateProcessingSummary(
    totalAnalyzed: number,
    totalMissing: number,
    results: ProcessingResult[],
    batchCount: number,
    correlationId: string,
    startTime: Date
  ): ProcessingSummary {
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success && !r.skipped).length;
    const skipped = results.filter(r => r.skipped).length;
    const successRate = results.length > 0 ? Math.round((successful / results.length) * 100) : 0;

    return {
      totalProjectsAnalyzed: totalAnalyzed,
      projectsMissingReports: totalMissing,
      projectsProcessed: results.length,
      projectsSuccessful: successful,
      projectsFailed: failed,
      projectsSkipped: skipped,
      successRate,
      totalProcessingTime: Date.now() - startTime.getTime(),
      batchesProcessed: batchCount,
      correlationId,
      processingStartTime: startTime,
      processingEndTime: new Date()
    };
  }

  /**
   * Task 5.4: Save processing results to files
   */
  private async saveProcessingResults(
    summary: ProcessingSummary,
    results: ProcessingResult[],
    processingLogger: any
  ): Promise<void> {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const resultsDir = join(process.cwd(), 'reports', 'missing-initial-reports');
      await mkdir(resultsDir, { recursive: true });

      // Save detailed results
      const detailedResultsPath = join(resultsDir, `missing-reports-processing-${timestamp}.json`);
      await writeFile(detailedResultsPath, JSON.stringify({
        summary,
        results,
        batches: Array.from(this.processingBatches.values())
      }, null, 2));

      // Save summary report
      const summaryPath = join(resultsDir, `missing-reports-summary-${timestamp}.md`);
      const summaryContent = this.generateMarkdownSummary(summary, results);
      await writeFile(summaryPath, summaryContent);

      processingLogger.info('Task 5.4: Processing results saved', {
        detailedResultsPath,
        summaryPath,
        correlationId: summary.correlationId
      });

    } catch (error) {
      processingLogger.error('Task 5.4: Failed to save processing results', error as Error);
    }
  }

  /**
   * Task 5.4: Generate markdown summary report
   */
  private generateMarkdownSummary(summary: ProcessingSummary, results: ProcessingResult[]): string {
    const successfulReports = results.filter(r => r.success && !r.skipped);
    const failedReports = results.filter(r => !r.success && !r.skipped);
    const skippedReports = results.filter(r => r.skipped);

    return `# Missing Initial Reports Processing Summary - Task 5.4

**Processing Date:** ${summary.processingStartTime.toISOString()}  
**Correlation ID:** ${summary.correlationId}  
**Processing Time:** ${Math.round(summary.totalProcessingTime / 1000)} seconds

## Executive Summary

- **Total Projects Analyzed:** ${summary.totalProjectsAnalyzed.toLocaleString()}
- **Projects Missing Initial Reports:** ${summary.projectsMissingReports.toLocaleString()}
- **Projects Processed:** ${summary.projectsProcessed.toLocaleString()}
- **Successfully Generated Reports:** ${summary.projectsSuccessful} (${summary.successRate}%)
- **Failed Generations:** ${summary.projectsFailed}
- **Skipped Projects:** ${summary.projectsSkipped}
- **Processing Batches:** ${summary.batchesProcessed}

## Processing Results

### Successful Report Generations
${successfulReports.length > 0 ? successfulReports.map((result, idx) => 
  `${idx + 1}. **${result.projectName}** (ID: ${result.projectId})
   - Report ID: ${result.reportId}
   - Report Title: ${result.reportTitle}
   - Processing Time: ${result.processingTime}ms
   - Attempts: ${result.attempts}`
).join('\n\n') : 'No successful report generations.'}

### Failed Report Generations
${failedReports.length > 0 ? failedReports.map((result, idx) => 
  `${idx + 1}. **${result.projectName}** (ID: ${result.projectId})
   - Error: ${result.error}
   - Processing Time: ${result.processingTime}ms
   - Attempts: ${result.attempts}`
).join('\n\n') : 'No failed report generations.'}

### Skipped Projects
${skippedReports.length > 0 ? skippedReports.map((result, idx) => 
  `${idx + 1}. **${result.projectName}** (ID: ${result.projectId})
   - Skip Reason: ${result.skipReason}`
).join('\n\n') : 'No skipped projects.'}

## Recommendations

${summary.projectsFailed > 0 ? '- **Review Failed Projects:** Investigate the failed report generations and address underlying issues.' : ''}
${summary.projectsSkipped > 0 ? '- **Address Skipped Projects:** Fix issues preventing report generation (e.g., assign competitors).' : ''}
${summary.successRate < 80 ? '- **Improve Success Rate:** Current success rate is below optimal. Consider improving project validation.' : ''}
${summary.successRate >= 80 ? '- **Success Rate Good:** Current success rate meets expectations.' : ''}

## Next Steps

1. **Monitor Generated Reports:** Verify that generated reports are of good quality
2. **Fix Failed Projects:** Address issues preventing report generation for failed projects
3. **Regular Processing:** Consider scheduling regular processing for newly missing reports
4. **System Optimization:** Use learnings to improve initial report generation for new projects

---
*Generated by Missing Initial Reports Processor Service - Task 5.4*
`;
  }

  /**
   * Task 5.4: Get current processing status
   */
  async getProcessingStatus(): Promise<{
    isProcessing: boolean;
    correlationId?: string;
    batchesProcessed: number;
    currentBatch?: string;
    estimatedCompletion?: Date;
  }> {
    return {
      isProcessing: this.isProcessing,
      correlationId: this.currentCorrelationId,
      batchesProcessed: this.processingBatches.size,
      currentBatch: this.isProcessing ? Array.from(this.processingBatches.keys()).pop() : undefined,
      estimatedCompletion: this.isProcessing ? new Date(Date.now() + 300000) : undefined // Estimate 5 minutes
    };
  }

  /**
   * Task 5.4: Cleanup resources
   */
  async cleanup(): Promise<void> {
    try {
      this.processingBatches.clear();
      await this.prisma.$disconnect();
    } catch (error) {
      logger.error('Failed to cleanup MissingInitialReportsProcessorService', error as Error);
    }
  }
}

/**
 * Task 5.4: Global instance for service reuse
 */
let globalProcessorService: MissingInitialReportsProcessorService | null = null;

/**
 * Task 5.4: Get or create global processor service instance
 */
export function getMissingInitialReportsProcessorService(): MissingInitialReportsProcessorService {
  if (!globalProcessorService) {
    globalProcessorService = new MissingInitialReportsProcessorService();
  }
  return globalProcessorService;
}

/**
 * Task 5.4: Convenience function for processing missing reports
 */
export async function processMissingInitialReports(
  options?: ProcessingOptions
): Promise<ProcessingSummary> {
  const service = getMissingInitialReportsProcessorService();
  return await service.processMissingInitialReports(options);
} 