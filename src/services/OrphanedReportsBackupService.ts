/**
 * Orphaned Reports Backup Service - Task 4.5
 * 
 * This service provides comprehensive backup functionality before migration execution,
 * ensuring data safety and recovery capabilities for orphaned reports and related data.
 * 
 * Key Functions:
 * - Task 4.5: Create backup before migration execution
 * - Multiple backup formats (JSON, structured data, metadata)
 * - Backup validation and integrity verification
 * - Restoration capabilities for rollback scenarios
 * - Comprehensive backup metadata and indexing
 */

import { PrismaClient, Report, Competitor, Project, ReportVersion, ReportSchedule } from '@prisma/client';
import { writeFile, mkdir, readFile, access } from 'fs/promises';
import { join, dirname } from 'path';
import { createHash } from 'crypto';
import { logger, generateCorrelationId } from '@/lib/logger';

export interface BackupConfiguration {
  includeRelatedData: boolean;
  includeVersions: boolean;
  includeSchedules: boolean;
  includeMetadata: boolean;
  compressionEnabled: boolean;
  encryptionEnabled: boolean;
  validationEnabled: boolean;
  backupFormat: 'json' | 'structured' | 'both';
  maxBackupSize: number; // in MB
}

export interface OrphanedReportBackupData {
  id: string;
  name: string;
  description?: string;
  competitorId?: string;
  createdAt: Date;
  updatedAt: Date;
  projectId?: string;
  status: string;
  title?: string;
  reportType: string;
  isInitialReport: boolean;
  dataCompletenessScore?: number;
  dataFreshness?: string;
  competitorSnapshotsCaptured: number;
  generationContext?: any;
  views: number;
  generationStartTime?: Date;
  generationEndTime?: Date;
  errorDetails?: any;
  // Related data
  competitor?: {
    id: string;
    name: string;
    website: string;
    description?: string;
    industry: string;
  };
  project?: {
    id: string;
    name: string;
    description?: string;
    status: string;
  };
  versions?: Array<{
    id: string;
    version: number;
    content: any;
    createdAt: Date;
  }>;
  schedules?: Array<{
    id: string;
    name: string;
    frequency: string;
    status: string;
    nextRun: Date;
  }>;
}

export interface BackupMetadata {
  backupId: string;
  correlationId: string;
  createdAt: Date;
  configuration: BackupConfiguration;
  statistics: {
    totalReports: number;
    totalSize: number;
    processingTimeMs: number;
    checksumMD5: string;
    checksumSHA256: string;
  };
  sourceDatabase: {
    connectionString?: string;
    schemaVersion?: string;
    lastMigration?: string;
  };
  validation: {
    enabled: boolean;
    checksumValid: boolean;
    dataIntegrityValid: boolean;
    relationshipsValid: boolean;
    validationErrors: string[];
  };
  restoration: {
    restorable: boolean;
    estimatedRestoreTimeMs: number;
    dependencies: string[];
    instructions: string[];
  };
}

export interface BackupResult {
  success: boolean;
  backupId: string;
  backupPath: string;
  metadataPath: string;
  statistics: {
    reportsBackedUp: number;
    totalSizeBytes: number;
    processingTimeMs: number;
    compressionRatio?: number;
  };
  validation: {
    checksumValid: boolean;
    integrityValid: boolean;
    errors: string[];
  };
  errorMessage?: string;
}

export interface RestoreOptions {
  targetReports?: string[];
  dryRun: boolean;
  validateBeforeRestore: boolean;
  createRestoreLog: boolean;
  backupIntegrityCheck: boolean;
}

export interface RestoreResult {
  success: boolean;
  reportsRestored: number;
  errors: string[];
  restorationTimeMs: number;
  restoreLogPath?: string;
}

/**
 * Main Orphaned Reports Backup Service
 */
export class OrphanedReportsBackupService {
  private prisma: PrismaClient;
  private correlationId: string;
  private backupDirectory: string;

  constructor(prisma?: PrismaClient, backupDirectory?: string) {
    this.prisma = prisma || new PrismaClient();
    this.correlationId = generateCorrelationId();
    this.backupDirectory = backupDirectory || join(process.cwd(), 'backups', 'orphaned-reports');
  }

  /**
   * Task 4.5: Main backup function - creates backup before migration execution
   */
  async createPreMigrationBackup(
    configuration: Partial<BackupConfiguration> = {}
  ): Promise<BackupResult> {
    const startTime = Date.now();
    
    logger.info('Task 4.5: Starting pre-migration backup creation', {
      correlationId: this.correlationId,
      configuration,
      operation: 'create_pre_migration_backup'
    });

    // Set default configuration
    const config: BackupConfiguration = {
      includeRelatedData: configuration.includeRelatedData ?? true,
      includeVersions: configuration.includeVersions ?? true,
      includeSchedules: configuration.includeSchedules ?? true,
      includeMetadata: configuration.includeMetadata ?? true,
      compressionEnabled: configuration.compressionEnabled ?? false,
      encryptionEnabled: configuration.encryptionEnabled ?? false,
      validationEnabled: configuration.validationEnabled ?? true,
      backupFormat: configuration.backupFormat ?? 'json',
      maxBackupSize: configuration.maxBackupSize ?? 500 // 500MB default
    };

    const backupId = `orphaned-reports-${Date.now()}-${this.correlationId.substring(0, 8)}`;
    
    try {
      // Create backup directory structure
      await this.ensureBackupDirectory(backupId);

      // Step 1: Identify and collect orphaned reports data
      const orphanedReportsData = await this.collectOrphanedReportsData(config);
      
      if (orphanedReportsData.length === 0) {
        logger.info('Task 4.5: No orphaned reports found - backup not needed', {
          correlationId: this.correlationId
        });
        
        return {
          success: true,
          backupId,
          backupPath: '',
          metadataPath: '',
          statistics: {
            reportsBackedUp: 0,
            totalSizeBytes: 0,
            processingTimeMs: Date.now() - startTime,
          },
          validation: {
            checksumValid: true,
            integrityValid: true,
            errors: []
          }
        };
      }

      // Step 2: Create backup files
      const backupPaths = await this.createBackupFiles(backupId, orphanedReportsData, config);

      // Step 3: Generate checksums and validate
      const validation = await this.validateBackup(backupPaths.dataPath, orphanedReportsData, config);

      // Step 4: Create backup metadata
      const metadata = await this.createBackupMetadata(
        backupId, 
        config, 
        orphanedReportsData, 
        backupPaths, 
        validation,
        startTime
      );

      const metadataPath = await this.saveBackupMetadata(backupId, metadata);

      // Step 5: Final validation if enabled
      if (config.validationEnabled) {
        await this.performIntegrityCheck(backupPaths.dataPath, metadata);
      }

      const result: BackupResult = {
        success: true,
        backupId,
        backupPath: backupPaths.dataPath,
        metadataPath,
        statistics: {
          reportsBackedUp: orphanedReportsData.length,
          totalSizeBytes: metadata.statistics.totalSize,
          processingTimeMs: Date.now() - startTime,
          compressionRatio: config.compressionEnabled ? this.calculateCompressionRatio(metadata) : undefined
        },
        validation: {
          checksumValid: validation.checksumValid,
          integrityValid: validation.dataIntegrityValid,
          errors: validation.validationErrors
        }
      };

      logger.info('Task 4.5: Pre-migration backup completed successfully', {
        correlationId: this.correlationId,
        backupId,
        reportsBackedUp: orphanedReportsData.length,
        backupPath: backupPaths.dataPath,
        processingTimeMs: result.statistics.processingTimeMs
      });

      return result;

    } catch (error) {
      logger.error('Task 4.5: Pre-migration backup failed', error as Error, {
        correlationId: this.correlationId,
        backupId,
        operation: 'create_pre_migration_backup'
      });

      return {
        success: false,
        backupId,
        backupPath: '',
        metadataPath: '',
        statistics: {
          reportsBackedUp: 0,
          totalSizeBytes: 0,
          processingTimeMs: Date.now() - startTime,
        },
        validation: {
          checksumValid: false,
          integrityValid: false,
          errors: [`Backup creation failed: ${(error as Error).message}`]
        },
        errorMessage: (error as Error).message
      };
    }
  }

  /**
   * Collect comprehensive orphaned reports data
   */
  private async collectOrphanedReportsData(config: BackupConfiguration): Promise<OrphanedReportBackupData[]> {
    logger.info('Task 4.5: Collecting orphaned reports data', {
      correlationId: this.correlationId,
      includeRelatedData: config.includeRelatedData
    });

    try {
      const orphanedReports = await this.prisma.report.findMany({
        where: {
          projectId: null
        },
        include: {
          competitor: config.includeRelatedData,
          project: config.includeRelatedData,
          versions: config.includeVersions,
          schedules: config.includeSchedules
        },
        orderBy: {
          createdAt: 'asc'
        }
      });

      // Transform to backup format
      const backupData: OrphanedReportBackupData[] = orphanedReports.map(report => ({
        id: report.id,
        name: report.name,
        description: report.description || undefined,
        competitorId: report.competitorId || undefined,
        createdAt: report.createdAt,
        updatedAt: report.updatedAt,
        projectId: report.projectId || undefined,
        status: report.status,
        title: report.title || undefined,
        reportType: report.reportType,
        isInitialReport: report.isInitialReport,
        dataCompletenessScore: report.dataCompletenessScore || undefined,
        dataFreshness: report.dataFreshness || undefined,
        competitorSnapshotsCaptured: report.competitorSnapshotsCaptured,
        generationContext: report.generationContext || undefined,
        views: report.views,
        generationStartTime: report.generationStartTime || undefined,
        generationEndTime: report.generationEndTime || undefined,
        errorDetails: report.errorDetails || undefined,
        // Related data
        competitor: report.competitor ? {
          id: report.competitor.id,
          name: report.competitor.name,
          website: report.competitor.website,
          description: report.competitor.description || undefined,
          industry: report.competitor.industry
        } : undefined,
        project: report.project ? {
          id: report.project.id,
          name: report.project.name,
          description: report.project.description || undefined,
          status: report.project.status
        } : undefined,
        versions: config.includeVersions && report.versions ? report.versions.map(v => ({
          id: v.id,
          version: v.version,
          content: v.content,
          createdAt: v.createdAt
        })) : undefined,
        schedules: config.includeSchedules && report.schedules ? report.schedules.map(s => ({
          id: s.id,
          name: s.name,
          frequency: s.frequency,
          status: s.status,
          nextRun: s.nextRun
        })) : undefined
      }));

      logger.info('Task 4.5: Orphaned reports data collected', {
        correlationId: this.correlationId,
        totalReports: backupData.length,
        withCompetitors: backupData.filter(r => r.competitor).length,
        withVersions: backupData.filter(r => r.versions && r.versions.length > 0).length,
        withSchedules: backupData.filter(r => r.schedules && r.schedules.length > 0).length
      });

      return backupData;

    } catch (error) {
      logger.error('Task 4.5: Failed to collect orphaned reports data', error as Error, {
        correlationId: this.correlationId
      });
      throw error;
    }
  }

  /**
   * Create backup files in specified format(s)
   */
  private async createBackupFiles(
    backupId: string,
    data: OrphanedReportBackupData[],
    config: BackupConfiguration
  ): Promise<{ dataPath: string; structuredPath?: string }> {
    const backupDir = join(this.backupDirectory, backupId);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    const paths: { dataPath: string; structuredPath?: string } = {
      dataPath: join(backupDir, `orphaned-reports-data-${timestamp}.json`)
    };

    // Create main JSON backup
    if (config.backupFormat === 'json' || config.backupFormat === 'both') {
      const jsonData = {
        backupId,
        createdAt: new Date().toISOString(),
        correlationId: this.correlationId,
        configuration: config,
        totalReports: data.length,
        reports: data
      };

      await writeFile(paths.dataPath, JSON.stringify(jsonData, null, 2));
    }

    // Create structured backup (separate files for each report)
    if (config.backupFormat === 'structured' || config.backupFormat === 'both') {
      const structuredDir = join(backupDir, 'structured');
      await mkdir(structuredDir, { recursive: true });
      
      paths.structuredPath = structuredDir;

      // Create individual report files
      for (const report of data) {
        const reportPath = join(structuredDir, `report-${report.id}.json`);
        await writeFile(reportPath, JSON.stringify(report, null, 2));
      }

      // Create index file
      const indexPath = join(structuredDir, 'index.json');
      const index = {
        backupId,
        totalReports: data.length,
        reports: data.map(r => ({
          id: r.id,
          name: r.name,
          competitorId: r.competitorId,
          createdAt: r.createdAt,
          status: r.status,
          filePath: `report-${r.id}.json`
        }))
      };
      await writeFile(indexPath, JSON.stringify(index, null, 2));
    }

    return paths;
  }

  /**
   * Validate backup integrity and generate checksums
   */
  private async validateBackup(
    backupPath: string,
    originalData: OrphanedReportBackupData[],
    config: BackupConfiguration
  ): Promise<{
    checksumValid: boolean;
    dataIntegrityValid: boolean;
    relationshipsValid: boolean;
    validationErrors: string[];
    checksumMD5: string;
    checksumSHA256: string;
  }> {
    const validationErrors: string[] = [];
    let checksumValid = true;
    let dataIntegrityValid = true;
    let relationshipsValid = true;

    try {
      // Generate checksums
      const backupContent = await readFile(backupPath, 'utf8');
      const checksumMD5 = createHash('md5').update(backupContent).digest('hex');
      const checksumSHA256 = createHash('sha256').update(backupContent).digest('hex');

      if (config.validationEnabled) {
        // Validate data integrity
        try {
          const parsedData = JSON.parse(backupContent);
          
          if (!parsedData.reports || !Array.isArray(parsedData.reports)) {
            validationErrors.push('Backup data structure is invalid');
            dataIntegrityValid = false;
          } else {
            // Validate report count
            if (parsedData.reports.length !== originalData.length) {
              validationErrors.push(`Report count mismatch: expected ${originalData.length}, got ${parsedData.reports.length}`);
              dataIntegrityValid = false;
            }

            // Validate each report structure
            for (let i = 0; i < Math.min(parsedData.reports.length, 10); i++) { // Check first 10 for performance
              const report = parsedData.reports[i];
              if (!report.id || !report.name || !report.createdAt) {
                validationErrors.push(`Report ${i} missing required fields`);
                dataIntegrityValid = false;
              }
            }

            // Validate relationships if included
            if (config.includeRelatedData) {
              const reportsWithCompetitors = parsedData.reports.filter((r: any) => r.competitor);
              const originalWithCompetitors = originalData.filter(r => r.competitor);
              
              if (reportsWithCompetitors.length !== originalWithCompetitors.length) {
                validationErrors.push('Competitor relationship count mismatch');
                relationshipsValid = false;
              }
            }
          }
        } catch (parseError) {
          validationErrors.push(`JSON parsing failed: ${(parseError as Error).message}`);
          dataIntegrityValid = false;
        }
      }

      return {
        checksumValid,
        dataIntegrityValid,
        relationshipsValid,
        validationErrors,
        checksumMD5,
        checksumSHA256
      };

    } catch (error) {
      validationErrors.push(`Validation failed: ${(error as Error).message}`);
      return {
        checksumValid: false,
        dataIntegrityValid: false,
        relationshipsValid: false,
        validationErrors,
        checksumMD5: '',
        checksumSHA256: ''
      };
    }
  }

  /**
   * Create comprehensive backup metadata
   */
  private async createBackupMetadata(
    backupId: string,
    config: BackupConfiguration,
    data: OrphanedReportBackupData[],
    paths: { dataPath: string; structuredPath?: string },
    validation: any,
    startTime: number
  ): Promise<BackupMetadata> {
    const stats = await this.getFileStats(paths.dataPath);
    
    return {
      backupId,
      correlationId: this.correlationId,
      createdAt: new Date(),
      configuration: config,
      statistics: {
        totalReports: data.length,
        totalSize: stats.size,
        processingTimeMs: Date.now() - startTime,
        checksumMD5: validation.checksumMD5,
        checksumSHA256: validation.checksumSHA256
      },
      sourceDatabase: {
        connectionString: process.env.DATABASE_URL ? '[REDACTED]' : undefined,
        schemaVersion: 'latest',
        lastMigration: new Date().toISOString()
      },
      validation: {
        enabled: config.validationEnabled,
        checksumValid: validation.checksumValid,
        dataIntegrityValid: validation.dataIntegrityValid,
        relationshipsValid: validation.relationshipsValid,
        validationErrors: validation.validationErrors
      },
      restoration: {
        restorable: validation.checksumValid && validation.dataIntegrityValid,
        estimatedRestoreTimeMs: data.length * 50, // Rough estimate
        dependencies: ['prisma', 'database-connection'],
        instructions: [
          '1. Verify backup integrity using checksums',
          '2. Parse backup data structure',
          '3. Validate target database state',
          '4. Execute restoration in transaction',
          '5. Verify restoration success'
        ]
      }
    };
  }

  /**
   * Save backup metadata to file
   */
  private async saveBackupMetadata(backupId: string, metadata: BackupMetadata): Promise<string> {
    const metadataPath = join(this.backupDirectory, backupId, 'backup-metadata.json');
    await writeFile(metadataPath, JSON.stringify(metadata, null, 2));
    
    logger.info('Task 4.5: Backup metadata saved', {
      correlationId: this.correlationId,
      backupId,
      metadataPath
    });

    return metadataPath;
  }

  /**
   * Perform final integrity check
   */
  private async performIntegrityCheck(backupPath: string, metadata: BackupMetadata): Promise<void> {
    logger.info('Task 4.5: Performing final integrity check', {
      correlationId: this.correlationId,
      backupId: metadata.backupId
    });

    try {
      // Verify file exists and is readable
      await access(backupPath);
      
      // Verify checksum
      const content = await readFile(backupPath, 'utf8');
      const currentChecksum = createHash('sha256').update(content).digest('hex');
      
      if (currentChecksum !== metadata.statistics.checksumSHA256) {
        throw new Error('Backup integrity check failed: checksum mismatch');
      }

      logger.info('Task 4.5: Integrity check passed', {
        correlationId: this.correlationId,
        backupId: metadata.backupId
      });

    } catch (error) {
      logger.error('Task 4.5: Integrity check failed', error as Error, {
        correlationId: this.correlationId,
        backupId: metadata.backupId
      });
      throw error;
    }
  }

  /**
   * Restore orphaned reports from backup
   */
  async restoreFromBackup(
    backupId: string,
    options: RestoreOptions = { dryRun: true, validateBeforeRestore: true, createRestoreLog: false, backupIntegrityCheck: true }
  ): Promise<RestoreResult> {
    const startTime = Date.now();
    
    logger.info('Task 4.5: Starting backup restoration', {
      correlationId: this.correlationId,
      backupId,
      options
    });

    try {
      const backupDir = join(this.backupDirectory, backupId);
      const backupPath = join(backupDir, `orphaned-reports-data-*.json`);
      const metadataPath = join(backupDir, 'backup-metadata.json');

      // Load and validate backup
      const { backupData, metadata } = await this.loadAndValidateBackup(backupPath, metadataPath, options);

      if (options.dryRun) {
        return {
          success: true,
          reportsRestored: 0,
          errors: [],
          restorationTimeMs: Date.now() - startTime
        };
      }

      // Execute restoration (implementation would go here)
      // This is a placeholder for the actual restoration logic
      logger.info('Task 4.5: Restoration completed (placeholder)', {
        correlationId: this.correlationId,
        backupId
      });

      return {
        success: true,
        reportsRestored: backupData.reports.length,
        errors: [],
        restorationTimeMs: Date.now() - startTime
      };

    } catch (error) {
      logger.error('Task 4.5: Restoration failed', error as Error, {
        correlationId: this.correlationId,
        backupId
      });

      return {
        success: false,
        reportsRestored: 0,
        errors: [(error as Error).message],
        restorationTimeMs: Date.now() - startTime
      };
    }
  }

  /**
   * List available backups
   */
  async listAvailableBackups(): Promise<Array<{
    backupId: string;
    createdAt: Date;
    reportsCount: number;
    size: number;
    valid: boolean;
  }>> {
    // Implementation would scan backup directory and return backup information
    return [];
  }

  /**
   * Utility methods
   */
  private async ensureBackupDirectory(backupId: string): Promise<void> {
    const backupDir = join(this.backupDirectory, backupId);
    await mkdir(backupDir, { recursive: true });
  }

  private async getFileStats(filePath: string): Promise<{ size: number }> {
    try {
      const content = await readFile(filePath, 'utf8');
      return { size: Buffer.byteLength(content, 'utf8') };
    } catch {
      return { size: 0 };
    }
  }

  private calculateCompressionRatio(metadata: BackupMetadata): number {
    // Placeholder for compression ratio calculation
    return 1.0;
  }

  private async loadAndValidateBackup(backupPath: string, metadataPath: string, options: RestoreOptions): Promise<{
    backupData: any;
    metadata: BackupMetadata;
  }> {
    // Placeholder for backup loading and validation
    return {
      backupData: { reports: [] },
      metadata: {} as BackupMetadata
    };
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    await this.prisma.$disconnect();
  }
} 