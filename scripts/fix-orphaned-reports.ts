#!/usr/bin/env node

/**
 * Fix Orphaned Reports Migration Script - Task 4.1
 * 
 * This script addresses the critical report generation issue where reports are not
 * properly associated with projects, causing orphaned reports and broken project dashboards.
 * 
 * Key Functions:
 * - Task 4.2: Identify all reports with null projectId in database
 * - Task 4.3: Resolve correct projectId for each orphaned report  
 * - Task 4.4: Update database records with proper associations
 * - Task 4.5: Create backup before migration execution
 * 
 * Usage: npm run migrate:fix-orphaned-reports
 */

import { PrismaClient } from '@prisma/client';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { logger, generateCorrelationId } from '../src/lib/logger';

interface OrphanedReport {
  id: string;
  name: string;
  competitorId: string | null;
  createdAt: Date;
  updatedAt: Date;
  status: string;
  reportType: string;
}

interface ProjectResolution {
  reportId: string;
  resolvedProjectId: string | null;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
  competitorId: string | null;
  competitorName?: string | undefined;
  projectName?: string | undefined;
}

interface MigrationReport {
  totalOrphanedReports: number;
  successfullyResolved: number;
  partiallyResolved: number;
  unresolved: number;
  skipped: number;
  backupCreated: boolean;
  backupPath?: string;
  executionTime: number;
  correlationId: string;
  resolutions: ProjectResolution[];
  errors: Array<{
    reportId: string;
    error: string;
    timestamp: Date;
  }>;
}

class OrphanedReportsMigration {
  private prisma: PrismaClient;
  private correlationId: string;
  private dryRun: boolean;

  constructor(dryRun: boolean = false) {
    this.prisma = new PrismaClient();
    this.correlationId = generateCorrelationId();
    this.dryRun = dryRun;
  }

  /**
   * Task 4.2: Identify all reports with null projectId in database
   */
  async identifyOrphanedReports(): Promise<OrphanedReport[]> {
    logger.info('Task 4.2: Starting identification of orphaned reports', {
      correlationId: this.correlationId,
      operation: 'identify_orphaned_reports'
    });

    try {
      const orphanedReports = await this.prisma.report.findMany({
        where: {
          projectId: null
        },
        select: {
          id: true,
          name: true,
          competitorId: true,
          createdAt: true,
          updatedAt: true,
          status: true,
          reportType: true
        },
        orderBy: {
          createdAt: 'asc'
        }
      });

      logger.info('Task 4.2: Orphaned reports identified', {
        correlationId: this.correlationId,
        totalOrphanedReports: orphanedReports.length,
        operation: 'identify_orphaned_reports'
      });

      return orphanedReports;
    } catch (error) {
      logger.error('Task 4.2: Failed to identify orphaned reports', error as Error, {
        correlationId: this.correlationId,
        operation: 'identify_orphaned_reports'
      });
      throw error;
    }
  }

  /**
   * Task 4.3: Resolve correct projectId for each orphaned report
   */
  async resolveProjectAssociations(orphanedReports: OrphanedReport[]): Promise<ProjectResolution[]> {
    logger.info('Task 4.3: Starting project resolution for orphaned reports', {
      correlationId: this.correlationId,
      reportsToResolve: orphanedReports.length,
      operation: 'resolve_project_associations'
    });

    const resolutions: ProjectResolution[] = [];

    for (const report of orphanedReports) {
      try {
        const resolution = await this.resolveProjectForReport(report);
        resolutions.push(resolution);

        logger.info('Task 4.3: Project resolution completed for report', {
          correlationId: this.correlationId,
          reportId: report.id,
          resolvedProjectId: resolution.resolvedProjectId,
          confidence: resolution.confidence,
          reason: resolution.reason
        });
      } catch (error) {
        logger.error('Task 4.3: Failed to resolve project for report', error as Error, {
          correlationId: this.correlationId,
          reportId: report.id,
          competitorId: report.competitorId
        });

                 resolutions.push({
           reportId: report.id,
           resolvedProjectId: null,
           confidence: 'low',
           reason: `Resolution failed: ${(error as Error).message}`,
           competitorId: report.competitorId,
           competitorName: undefined,
           projectName: undefined
         });
      }
    }

    logger.info('Task 4.3: Project resolution completed for all reports', {
      correlationId: this.correlationId,
      totalResolutions: resolutions.length,
      successful: resolutions.filter(r => r.resolvedProjectId !== null).length,
      failed: resolutions.filter(r => r.resolvedProjectId === null).length
    });

    return resolutions;
  }

  /**
   * Resolve project association for a single report
   */
  private async resolveProjectForReport(report: OrphanedReport): Promise<ProjectResolution> {
    // Strategy 1: Direct competitor-to-project relationship
    if (report.competitorId) {
      const projects = await this.prisma.project.findMany({
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
          { status: 'asc' }, // ACTIVE before DRAFT
          { updatedAt: 'desc' } // Most recently updated first
        ]
      });

      if (projects.length === 1) {
        // Perfect match - single active project
                 const competitorName = projects[0].competitors.find(c => c.id === report.competitorId)?.name;
         return {
           reportId: report.id,
           resolvedProjectId: projects[0].id,
           confidence: 'high',
           reason: 'Single active project found for competitor',
           competitorId: report.competitorId,
           competitorName: competitorName || undefined,
           projectName: projects[0].name
         };
      } else if (projects.length > 1) {
                 // Multiple projects - pick the most recently updated active one
         const activeProject = projects.find(p => p.status === 'ACTIVE') || projects[0];
         if (activeProject) {
           const competitorName = activeProject.competitors.find(c => c.id === report.competitorId)?.name;
           return {
             reportId: report.id,
             resolvedProjectId: activeProject.id,
             confidence: 'medium',
             reason: `Multiple projects found (${projects.length}), selected most recent active project`,
             competitorId: report.competitorId,
             competitorName: competitorName || undefined,
             projectName: activeProject.name
           };
         }
      }
    }

    // Strategy 2: Time-based heuristic - find projects created around the same time
    if (report.competitorId) {
      const timeWindow = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
      const reportTime = new Date(report.createdAt);
      const startTime = new Date(reportTime.getTime() - timeWindow);
      const endTime = new Date(reportTime.getTime() + timeWindow);

      const temporalProjects = await this.prisma.project.findMany({
        where: {
          competitors: {
            some: {
              id: report.competitorId
            }
          },
          createdAt: {
            gte: startTime,
            lte: endTime
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
        orderBy: {
          createdAt: 'desc'
        },
        take: 1
      });

      if (temporalProjects.length > 0) {
        return {
          reportId: report.id,
          resolvedProjectId: temporalProjects[0].id,
          confidence: 'medium',
          reason: 'Project found within 24-hour time window of report creation',
          competitorId: report.competitorId,
          competitorName: temporalProjects[0].competitors.find(c => c.id === report.competitorId)?.name,
          projectName: temporalProjects[0].name
        };
      }
    }

    // Strategy 3: Last resort - any project with this competitor
    if (report.competitorId) {
      const anyProject = await this.prisma.project.findFirst({
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
        orderBy: {
          updatedAt: 'desc'
        }
      });

      if (anyProject) {
        return {
          reportId: report.id,
          resolvedProjectId: anyProject.id,
          confidence: 'low',
          reason: 'Fallback to any project containing this competitor',
          competitorId: report.competitorId,
          competitorName: anyProject.competitors.find(c => c.id === report.competitorId)?.name,
          projectName: anyProject.name
        };
      }
    }

    // No resolution found
    return {
      reportId: report.id,
      resolvedProjectId: null,
      confidence: 'low',
      reason: report.competitorId ? 'No projects found for competitor' : 'No competitor associated with report',
      competitorId: report.competitorId
    };
  }

  /**
   * Task 4.5: Create backup before migration execution
   */
  async createBackup(): Promise<string> {
    logger.info('Task 4.5: Creating backup before migration execution', {
      correlationId: this.correlationId,
      operation: 'create_backup'
    });

    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupDir = join(process.cwd(), 'backups', `orphaned-reports-migration-${timestamp}`);
      
      await mkdir(backupDir, { recursive: true });

      // Backup all reports with null projectId
      const orphanedReports = await this.prisma.report.findMany({
        where: {
          projectId: null
        },
        include: {
          competitor: true,
          versions: true,
          schedules: true
        }
      });

      const backupPath = join(backupDir, 'orphaned-reports-backup.json');
      await writeFile(backupPath, JSON.stringify({
        timestamp: new Date().toISOString(),
        correlationId: this.correlationId,
        totalRecords: orphanedReports.length,
        reports: orphanedReports
      }, null, 2));

      logger.info('Task 4.5: Backup created successfully', {
        correlationId: this.correlationId,
        backupPath,
        recordsBackedUp: orphanedReports.length,
        operation: 'create_backup'
      });

      return backupPath;
    } catch (error) {
      logger.error('Task 4.5: Failed to create backup', error as Error, {
        correlationId: this.correlationId,
        operation: 'create_backup'
      });
      throw error;
    }
  }

  /**
   * Task 4.4: Update database records with proper associations
   */
  async updateDatabaseRecords(resolutions: ProjectResolution[]): Promise<MigrationReport> {
    logger.info('Task 4.4: Starting database record updates', {
      correlationId: this.correlationId,
      resolutionsToProcess: resolutions.length,
      dryRun: this.dryRun,
      operation: 'update_database_records'
    });

    const report: MigrationReport = {
      totalOrphanedReports: resolutions.length,
      successfullyResolved: 0,
      partiallyResolved: 0,
      unresolved: 0,
      skipped: 0,
      backupCreated: true,
      executionTime: 0,
      correlationId: this.correlationId,
      resolutions: resolutions,
      errors: []
    };

    const startTime = Date.now();

    for (const resolution of resolutions) {
      try {
        if (!resolution.resolvedProjectId) {
          report.unresolved++;
          logger.warn('Task 4.4: Skipping report with no resolved project', {
            correlationId: this.correlationId,
            reportId: resolution.reportId,
            reason: resolution.reason
          });
          continue;
        }

        if (this.dryRun) {
          report.skipped++;
          logger.info('Task 4.4: DRY RUN - Would update report', {
            correlationId: this.correlationId,
            reportId: resolution.reportId,
            resolvedProjectId: resolution.resolvedProjectId,
            confidence: resolution.confidence
          });
          continue;
        }

        // Validate project-competitor relationship before updating
        const relationshipExists = await this.validateProjectCompetitorRelationship(
          resolution.resolvedProjectId,
          resolution.competitorId
        );

        if (!relationshipExists && resolution.competitorId) {
          logger.warn('Task 4.4: Project-competitor relationship validation failed', {
            correlationId: this.correlationId,
            reportId: resolution.reportId,
            projectId: resolution.resolvedProjectId,
            competitorId: resolution.competitorId
          });
          
          report.errors.push({
            reportId: resolution.reportId,
            error: 'Project-competitor relationship validation failed',
            timestamp: new Date()
          });
          report.unresolved++;
          continue;
        }

        // Update the report with resolved projectId
        await this.prisma.report.update({
          where: {
            id: resolution.reportId
          },
          data: {
            projectId: resolution.resolvedProjectId,
            updatedAt: new Date()
          }
        });

        if (resolution.confidence === 'high') {
          report.successfullyResolved++;
        } else {
          report.partiallyResolved++;
        }

        logger.info('Task 4.4: Successfully updated report', {
          correlationId: this.correlationId,
          reportId: resolution.reportId,
          projectId: resolution.resolvedProjectId,
          confidence: resolution.confidence
        });

      } catch (error) {
        logger.error('Task 4.4: Failed to update report', error as Error, {
          correlationId: this.correlationId,
          reportId: resolution.reportId,
          resolvedProjectId: resolution.resolvedProjectId
        });

        report.errors.push({
          reportId: resolution.reportId,
          error: (error as Error).message,
          timestamp: new Date()
        });
        report.unresolved++;
      }
    }

    report.executionTime = Date.now() - startTime;

    logger.info('Task 4.4: Database record updates completed', {
      correlationId: this.correlationId,
      summary: {
        total: report.totalOrphanedReports,
        successful: report.successfullyResolved,
        partial: report.partiallyResolved,
        unresolved: report.unresolved,
        skipped: report.skipped,
        errors: report.errors.length
      },
      executionTimeMs: report.executionTime
    });

    return report;
  }

  /**
   * Validate project-competitor relationship
   */
  private async validateProjectCompetitorRelationship(
    projectId: string,
    competitorId: string | null
  ): Promise<boolean> {
    if (!competitorId) {
      return true; // No competitor to validate
    }

    try {
      const relationship = await this.prisma.project.findFirst({
        where: {
          id: projectId,
          competitors: {
            some: {
              id: competitorId
            }
          }
        }
      });

      return !!relationship;
    } catch (error) {
      logger.error('Failed to validate project-competitor relationship', error as Error, {
        correlationId: this.correlationId,
        projectId,
        competitorId
      });
      return false;
    }
  }

  /**
   * Generate migration report
   */
  async generateMigrationReport(report: MigrationReport): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportDir = join(process.cwd(), 'reports', 'migrations');
    await mkdir(reportDir, { recursive: true });

    const reportPath = join(reportDir, `orphaned-reports-migration-${timestamp}.json`);
    await writeFile(reportPath, JSON.stringify(report, null, 2));

    logger.info('Migration report generated', {
      correlationId: this.correlationId,
      reportPath,
      summary: {
        total: report.totalOrphanedReports,
        successful: report.successfullyResolved,
        partial: report.partiallyResolved,
        unresolved: report.unresolved
      }
    });

    return reportPath;
  }

  /**
   * Close database connection
   */
  async cleanup(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

/**
 * Main execution function
 */
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const skipBackup = args.includes('--skip-backup');

  console.log('🔧 Starting Orphaned Reports Migration Script');
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE EXECUTION'}`);
  console.log(`Backup: ${skipBackup ? 'SKIPPED' : 'ENABLED'}\n`);

  const migration = new OrphanedReportsMigration(dryRun);

  try {
    // Task 4.2: Identify orphaned reports
    console.log('1️⃣  Identifying orphaned reports...');
    const orphanedReports = await migration.identifyOrphanedReports();
    
    if (orphanedReports.length === 0) {
      console.log('✅ No orphaned reports found! Migration not needed.');
      return;
    }

    console.log(`📊 Found ${orphanedReports.length} orphaned reports\n`);

    // Task 4.5: Create backup (unless skipped)
    let backupPath = '';
    if (!skipBackup && !dryRun) {
      console.log('2️⃣  Creating backup...');
      backupPath = await migration.createBackup();
      console.log(`✅ Backup created: ${backupPath}\n`);
    } else {
      console.log('2️⃣  Backup skipped (dry-run or --skip-backup flag)\n');
    }

    // Task 4.3: Resolve project associations
    console.log('3️⃣  Resolving project associations...');
    const resolutions = await migration.resolveProjectAssociations(orphanedReports);
    console.log(`✅ Project resolution completed for ${resolutions.length} reports\n`);

    // Task 4.4: Update database records
    console.log('4️⃣  Updating database records...');
    const migrationReport = await migration.updateDatabaseRecords(resolutions);
    migrationReport.backupPath = backupPath;

    // Generate migration report
    console.log('5️⃣  Generating migration report...');
    const reportPath = await migration.generateMigrationReport(migrationReport);

    // Display summary
    console.log('\n📈 Migration Summary:');
    console.log(`   Total Orphaned Reports: ${migrationReport.totalOrphanedReports}`);
    console.log(`   Successfully Resolved: ${migrationReport.successfullyResolved}`);
    console.log(`   Partially Resolved: ${migrationReport.partiallyResolved}`);
    console.log(`   Unresolved: ${migrationReport.unresolved}`);
    console.log(`   Skipped (Dry Run): ${migrationReport.skipped}`);
    console.log(`   Errors: ${migrationReport.errors.length}`);
    console.log(`   Execution Time: ${migrationReport.executionTime}ms`);
    console.log(`   Report Generated: ${reportPath}`);

    if (migrationReport.backupPath) {
      console.log(`   Backup Created: ${migrationReport.backupPath}`);
    }

    console.log('\n🎉 Orphaned Reports Migration Complete!');

    if (migrationReport.errors.length > 0) {
      console.log('\n⚠️  Some errors occurred during migration:');
      migrationReport.errors.forEach(error => {
        console.log(`   - Report ${error.reportId}: ${error.error}`);
      });
    }

  } catch (error) {
    console.error('❌ Migration failed:', error);
    logger.error('Migration script failed', error as Error);
    process.exit(1);
  } finally {
    await migration.cleanup();
  }
}

// Run the migration if this script is executed directly
if (require.main === module) {
  main().catch(console.error);
}

export { OrphanedReportsMigration, main }; 