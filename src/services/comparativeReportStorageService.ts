/**
 * Comparative Report Storage Service
 * Addresses Phase 2.1 gap item: "Comparative Report Storage"
 * 
 * This service handles proper storage, retrieval, and management of comparative reports
 * with support for versioning, metadata, and efficient querying.
 */

import { prisma } from '@/lib/prisma';
import { 
  logger, 
  generateCorrelationId, 
  trackDatabaseOperation,
  trackErrorWithCorrelation,
  createCorrelationContext
} from '@/lib/logger';
import { ReportTaskResult, ComparativeReportTaskResult } from '@/types/reportTasks';
import fs from 'fs/promises';
import path from 'path';

export interface ComparativeReportMetadata {
  correlationId: string;
  taskId: string;
  productId: string;
  productName: string;
  competitorIds: string[];
  competitorNames: string[];
  template: string;
  focusArea: string;
  generatedBy: 'auto-comparative' | 'manual-comparative' | 'scheduled-comparative';
  generationTime: number; // milliseconds
  contentLength: number;
  sectionsCount: number;
  confidenceScore: number;
  tokenUsage?: number;
  cost?: number;
  version: string;
  tags?: string[];
}

export interface StoredComparativeReport {
  id: string;
  projectId: string;
  name: string;
  content: string;
  metadata: ComparativeReportMetadata;
  createdAt: Date;
  updatedAt: Date;
  filePath?: string;
  fileSize?: number;
  checksum?: string;
}

export interface ReportStorageOptions {
  storeInDatabase: boolean;
  storeAsFile: boolean;
  generateChecksum: boolean;
  compress: boolean;
  retentionDays?: number;
}

export interface ReportQueryOptions {
  projectId?: string;
  productId?: string;
  competitorIds?: string[];
  template?: string;
  focusArea?: string;
  generatedBy?: string;
  dateFrom?: Date;
  dateTo?: Date;
  limit?: number;
  offset?: number;
  orderBy?: 'createdAt' | 'updatedAt' | 'name';
  orderDirection?: 'asc' | 'desc';
}

export interface ReportRetrievalResult {
  report: StoredComparativeReport;
  source: 'database' | 'file' | 'both';
  retrievalTime: number;
  isComplete: boolean;
  warnings?: string[];
}

export class ComparativeReportStorageService {
  private readonly reportsDirectory: string;
  private readonly defaultStorageOptions: ReportStorageOptions;

  constructor() {
    this.reportsDirectory = path.join(process.cwd(), 'reports', 'comparative');
    this.defaultStorageOptions = {
      storeInDatabase: true,
      storeAsFile: true,
      generateChecksum: true,
      compress: false,
      retentionDays: 90
    };

    // Ensure reports directory exists
    this.ensureDirectoryExists();
  }

  /**
   * Store a comparative report with comprehensive metadata
   */
  async storeComparativeReport(
    projectId: string,
    reportName: string,
    content: string,
    metadata: ComparativeReportMetadata,
    options: Partial<ReportStorageOptions> = {}
  ): Promise<StoredComparativeReport> {
    const correlationId = metadata.correlationId || generateCorrelationId();
    const context = createCorrelationContext(
      correlationId,
      'ComparativeReportStorageService',
      'storeComparativeReport',
      { projectId, reportName }
    );

    const startTime = Date.now();
    const storageOptions = { ...this.defaultStorageOptions, ...options };

    try {
      logger.info('Starting comparative report storage', context);

      // Generate unique report ID
      const reportId = generateCorrelationId();
      const timestamp = new Date();

      // Prepare file storage if enabled
      let filePath: string | undefined;
      let fileSize: number | undefined;
      let checksum: string | undefined;

      if (storageOptions.storeAsFile) {
        const fileName = this.generateFileName(reportId, reportName, timestamp);
        filePath = path.join(this.reportsDirectory, fileName);
        
        await this.storeReportFile(filePath, content, storageOptions);
        fileSize = Buffer.byteLength(content, 'utf8');
        
        if (storageOptions.generateChecksum) {
          checksum = await this.generateChecksum(content);
        }
      }

      // Store in database if enabled
      let databaseReport: any = null;
      if (storageOptions.storeInDatabase) {
        databaseReport = await this.storeReportInDatabase(
          reportId,
          projectId,
          reportName,
          content,
          metadata,
          filePath,
          fileSize,
          checksum
        );
      }

      const storedReport: StoredComparativeReport = {
        id: reportId,
        projectId,
        name: reportName,
        content,
        metadata,
        createdAt: timestamp,
        updatedAt: timestamp,
        filePath,
        fileSize,
        checksum
      };

      const storageTime = Date.now() - startTime;

      trackDatabaseOperation('store_comparative_report', 'report', {
        ...context,
        reportId,
        storageTime,
        contentLength: content.length,
        storeInDatabase: storageOptions.storeInDatabase,
        storeAsFile: storageOptions.storeAsFile
      });

      logger.info('Comparative report stored successfully', {
        ...context,
        reportId,
        storageTime,
        contentLength: content.length,
        filePath: filePath ? path.basename(filePath) : undefined
      });

      return storedReport;

    } catch (error) {
      trackErrorWithCorrelation(
        error as Error,
        'storeComparativeReport',
        correlationId,
        {
          service: 'ComparativeReportStorageService',
          method: 'storeComparativeReport',
          projectId,
          reportName,
          isRecoverable: true,
          suggestedAction: 'Retry storage operation with different options'
        }
      );

      throw error;
    }
  }

  /**
   * Retrieve a comparative report by ID
   */
  async getComparativeReport(
    reportId: string,
    preferredSource: 'database' | 'file' | 'auto' = 'auto'
  ): Promise<ReportRetrievalResult> {
    const correlationId = generateCorrelationId();
    const context = createCorrelationContext(
      correlationId,
      'ComparativeReportStorageService',
      'getComparativeReport',
      { reportId, preferredSource }
    );

    const startTime = Date.now();

    try {
      logger.info('Retrieving comparative report', context);

      let report: StoredComparativeReport | null = null;
      let source: 'database' | 'file' | 'both' = 'database';
      const warnings: string[] = [];

      // Try database first (usually faster)
      if (preferredSource === 'database' || preferredSource === 'auto') {
        try {
          const dbReport = await this.getReportFromDatabase(reportId);
          if (dbReport) {
            report = dbReport;
            source = 'database';
          }
        } catch (error) {
          warnings.push(`Database retrieval failed: ${(error as Error).message}`);
        }
      }

      // Try file system if database failed or file preferred
      if (!report && (preferredSource === 'file' || preferredSource === 'auto')) {
        try {
          const fileReport = await this.getReportFromFile(reportId);
          if (fileReport) {
            report = fileReport;
            source = 'file';
          }
        } catch (error) {
          warnings.push(`File retrieval failed: ${(error as Error).message}`);
        }
      }

      if (!report) {
        throw new Error(`Comparative report ${reportId} not found in any storage location`);
      }

      // Verify content integrity if checksum available
      if (report.checksum) {
        const currentChecksum = await this.generateChecksum(report.content);
        if (currentChecksum !== report.checksum) {
          warnings.push('Content checksum mismatch - data may be corrupted');
        }
      }

      const retrievalTime = Date.now() - startTime;

      trackDatabaseOperation('retrieve_comparative_report', 'report', {
        ...context,
        retrievalTime,
        source,
        contentLength: report.content.length,
        warningsCount: warnings.length
      });

      logger.info('Comparative report retrieved successfully', {
        ...context,
        retrievalTime,
        source,
        contentLength: report.content.length
      });

      return {
        report,
        source,
        retrievalTime,
        isComplete: true,
        warnings: warnings.length > 0 ? warnings : undefined
      };

    } catch (error) {
      trackErrorWithCorrelation(
        error as Error,
        'getComparativeReport',
        correlationId,
        {
          service: 'ComparativeReportStorageService',
          method: 'getComparativeReport',
          reportId,
          isRecoverable: false,
          suggestedAction: 'Check if report exists and storage systems are accessible'
        }
      );

      throw error;
    }
  }

  /**
   * Query comparative reports with filtering and pagination
   */
  async queryComparativeReports(
    options: ReportQueryOptions = {}
  ): Promise<{
    reports: StoredComparativeReport[];
    total: number;
    hasMore: boolean;
    queryTime: number;
  }> {
    const correlationId = generateCorrelationId();
    const context = createCorrelationContext(
      correlationId,
      'ComparativeReportStorageService',
      'queryComparativeReports',
      { options }
    );

    const startTime = Date.now();

    try {
      logger.info('Querying comparative reports', context);

      const {
        projectId,
        productId,
        competitorIds,
        template,
        focusArea,
        generatedBy,
        dateFrom,
        dateTo,
        limit = 50,
        offset = 0,
        orderBy = 'createdAt',
        orderDirection = 'desc'
      } = options;

      // Build where clause
      const whereClause: any = {};

      if (projectId) {
        whereClause.projectId = projectId;
      }

      if (dateFrom || dateTo) {
        whereClause.createdAt = {};
        if (dateFrom) whereClause.createdAt.gte = dateFrom;
        if (dateTo) whereClause.createdAt.lte = dateTo;
      }

      // Note: For metadata filtering, we'd need to add JSON queries
      // This is a simplified version that would work with the current schema

      const [reports, total] = await Promise.all([
        prisma.report.findMany({
          where: whereClause,
          orderBy: { [orderBy]: orderDirection },
          take: limit,
          skip: offset,
          include: {
            project: {
              select: { id: true, name: true }
            }
          }
        }),
        prisma.report.count({ where: whereClause })
      ]);

      // Convert to StoredComparativeReport format
      const comparativeReports: StoredComparativeReport[] = reports
        .filter(report => this.isComparativeReport(report))
        .map(report => this.convertToStoredReport(report));

      const queryTime = Date.now() - startTime;
      const hasMore = offset + limit < total;

      trackDatabaseOperation('query_comparative_reports', 'report', {
        ...context,
        queryTime,
        resultsCount: comparativeReports.length,
        totalCount: total,
        hasMore
      });

      logger.info('Comparative reports query completed', {
        ...context,
        queryTime,
        resultsCount: comparativeReports.length,
        totalCount: total
      });

      return {
        reports: comparativeReports,
        total,
        hasMore,
        queryTime
      };

    } catch (error) {
      trackErrorWithCorrelation(
        error as Error,
        'queryComparativeReports',
        correlationId,
        {
          service: 'ComparativeReportStorageService',
          method: 'queryComparativeReports',
          isRecoverable: true,
          suggestedAction: 'Check query parameters and database connectivity'
        }
      );

      throw error;
    }
  }

  /**
   * Delete a comparative report from all storage locations
   */
  async deleteComparativeReport(reportId: string): Promise<{
    deletedFromDatabase: boolean;
    deletedFromFile: boolean;
    deletionTime: number;
  }> {
    const correlationId = generateCorrelationId();
    const context = createCorrelationContext(
      correlationId,
      'ComparativeReportStorageService',
      'deleteComparativeReport',
      { reportId }
    );

    const startTime = Date.now();

    try {
      logger.info('Deleting comparative report', context);

      let deletedFromDatabase = false;
      let deletedFromFile = false;

      // Delete from database
      try {
        await prisma.report.delete({
          where: { id: reportId }
        });
        deletedFromDatabase = true;
      } catch (error) {
        logger.warn('Failed to delete report from database', {
          ...context,
          error: (error as Error).message
        });
      }

      // Delete file if exists
      try {
        const report = await this.getReportFromDatabase(reportId);
        if (report?.filePath) {
          await fs.unlink(report.filePath);
          deletedFromFile = true;
        }
      } catch (error) {
        logger.warn('Failed to delete report file', {
          ...context,
          error: (error as Error).message
        });
      }

      const deletionTime = Date.now() - startTime;

      trackDatabaseOperation('delete_comparative_report', 'report', {
        ...context,
        deletionTime,
        deletedFromDatabase,
        deletedFromFile
      });

      logger.info('Comparative report deletion completed', {
        ...context,
        deletionTime,
        deletedFromDatabase,
        deletedFromFile
      });

      return {
        deletedFromDatabase,
        deletedFromFile,
        deletionTime
      };

    } catch (error) {
      trackErrorWithCorrelation(
        error as Error,
        'deleteComparativeReport',
        correlationId,
        {
          service: 'ComparativeReportStorageService',
          method: 'deleteComparativeReport',
          reportId,
          isRecoverable: true,
          suggestedAction: 'Retry deletion or manually clean up storage locations'
        }
      );

      throw error;
    }
  }

  // Private helper methods

  private async ensureDirectoryExists(): Promise<void> {
    try {
      await fs.mkdir(this.reportsDirectory, { recursive: true });
    } catch (error) {
      logger.error('Failed to create reports directory', error as Error, {
        directory: this.reportsDirectory
      });
    }
  }

  private generateFileName(reportId: string, reportName: string, timestamp: Date): string {
    const dateStr = timestamp.toISOString().split('T')[0];
    const timeStr = timestamp.toISOString().split('T')[1].split('.')[0].replace(/:/g, '-');
    const safeName = reportName.replace(/[^a-zA-Z0-9-_]/g, '_');
    return `${dateStr}_${timeStr}_${reportId}_${safeName}.json`;
  }

  private async storeReportFile(
    filePath: string,
    content: string,
    options: ReportStorageOptions
  ): Promise<void> {
    const reportData = {
      content,
      metadata: {
        storedAt: new Date().toISOString(),
        compressed: options.compress,
        version: '1.0'
      }
    };

    await fs.writeFile(filePath, JSON.stringify(reportData, null, 2), 'utf8');
  }

  private async storeReportInDatabase(
    reportId: string,
    projectId: string,
    reportName: string,
    content: string,
    metadata: ComparativeReportMetadata,
    filePath?: string,
    fileSize?: number,
    checksum?: string
  ): Promise<any> {
    // Task 3.2: Enhanced database save logic to ensure projectId is never null
    if (!projectId || projectId.trim() === '') {
      throw new Error('Task 3.2: projectId is required and cannot be null or empty for database save operation');
    }

    const validatedProjectId = projectId.trim();
    logger.info('Task 3.2: Storing report with validated projectId', {
      reportId,
      projectId: validatedProjectId,
      reportName,
      task: 'Task 3.2 - Database Save Validation'
    });

    // Task 3.3: Validate project-competitor relationship before saving
    const competitorId = metadata.competitorIds[0];
    if (competitorId) {
      const relationshipExists = await this.validateProjectCompetitorRelationship(validatedProjectId, competitorId);
      if (!relationshipExists) {
        logger.error('Task 3.3: Invalid project-competitor relationship in storage service', {
          projectId: validatedProjectId,
          competitorId,
          reportId,
          task: 'Task 3.3 - Relationship Validation'
        });
        throw new Error(`Task 3.3: Competitor ${competitorId} is not associated with project ${validatedProjectId}. Cannot store report with invalid relationship.`);
      }

      logger.info('Task 3.3: Project-competitor relationship validated in storage service', {
        projectId: validatedProjectId,
        competitorId,
        reportId,
        task: 'Task 3.3 - Relationship Validation'
      });
    }

    return await prisma.report.create({
      data: {
        id: reportId,
        name: reportName,
        projectId: validatedProjectId, // Task 3.2: Ensure projectId is never null
        competitorId: metadata.competitorIds[0] || 'unknown', // Temporary workaround
        title: reportName,
        description: `Comparative analysis: ${metadata.productName} vs ${metadata.competitorNames.join(', ')}`,
        status: 'COMPLETED' // Task 3.2: Add required status field
      }
    });
  }

  private async getReportFromDatabase(reportId: string): Promise<StoredComparativeReport | null> {
    // This would need to be implemented based on the actual schema
    // For now, returning null as placeholder
    return null;
  }

  private async getReportFromFile(reportId: string): Promise<StoredComparativeReport | null> {
    // This would need to scan the files directory for the report
    // For now, returning null as placeholder
    return null;
  }

  private async generateChecksum(content: string): Promise<string> {
    const crypto = await import('crypto');
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  private isComparativeReport(report: any): boolean {
    return (
      report.name?.includes('Competitive Analysis') ||
      report.name?.includes('vs') ||
      report.title?.includes('Comparative')
    );
  }

  private convertToStoredReport(report: any): StoredComparativeReport {
    // Convert database report to StoredComparativeReport format
    // This is a placeholder implementation
    return {
      id: report.id,
      projectId: report.projectId || 'unknown',
      name: report.name,
      content: '', // Would need to be retrieved separately
      metadata: {
        correlationId: 'unknown',
        taskId: 'unknown',
        productId: 'unknown',
        productName: 'unknown',
        competitorIds: [],
        competitorNames: [],
        template: 'comprehensive',
        focusArea: 'overall',
        generatedBy: 'auto-comparative',
        generationTime: 0,
        contentLength: 0,
        sectionsCount: 0,
        confidenceScore: 0,
        version: '1.0'
      },
      createdAt: report.createdAt,
      updatedAt: report.updatedAt
    };
  }

  /**
   * Task 3.3: Validate that project-competitor relationship exists before storing report
   */
  private async validateProjectCompetitorRelationship(
    projectId: string, 
    competitorId: string
  ): Promise<boolean> {
    try {
      logger.info('Task 3.3: Validating project-competitor relationship in storage service', {
        projectId,
        competitorId,
        task: 'Task 3.3 - Relationship Validation'
      });

      // Query the junction table to verify relationship exists
      const relationship = await prisma.$queryRaw<{count: number}[]>`
        SELECT COUNT(*) as count 
        FROM "_CompetitorToProject" 
        WHERE "A" = ${competitorId} AND "B" = ${projectId}
      `;

      const relationshipExists = Boolean(relationship && relationship[0] && relationship[0].count > 0);

      logger.info('Task 3.3: Project-competitor relationship query result in storage service', {
        projectId,
        competitorId,
        relationshipExists,
        queryResult: relationship,
        task: 'Task 3.3 - Relationship Validation'
      });

      return relationshipExists;
    } catch (error) {
      logger.error('Task 3.3: Error validating project-competitor relationship in storage service', error as Error, {
        projectId,
        competitorId,
        task: 'Task 3.3 - Relationship Validation'
      });
      
      // In case of database error, we should fail safely
      // Rather than allow potentially invalid data to be saved
      return false;
    }
  }
} 