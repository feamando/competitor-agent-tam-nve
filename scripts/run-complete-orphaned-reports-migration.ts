#!/usr/bin/env node

/**
 * Complete Orphaned Reports Migration Script - Task 4.4 Integration
 * 
 * This script orchestrates the complete migration workflow by integrating:
 * - Task 4.1: Migration script framework
 * - Task 4.2: Identification of orphaned reports
 * - Task 4.3: Resolution of correct project associations
 * - Task 4.4: Database updates with proper associations
 * - Task 4.5: Backup creation
 * 
 * Usage: npm run migrate:complete-orphaned-reports
 */

import { PrismaClient } from '@prisma/client';
import { OrphanedReportsIdentifier } from './identify-orphaned-reports';
import { OrphanedReportResolver, OrphanedReportInput } from '../src/services/OrphanedReportResolver';
import { OrphanedReportUpdater, UpdateOptions } from '../src/services/OrphanedReportUpdater';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { logger, generateCorrelationId } from '../src/lib/logger';

interface MigrationConfiguration {
  dryRun: boolean;
  skipBackup: boolean;
  minConfidenceLevel: 'high' | 'medium' | 'low';
  batchSize: number;
  continueOnError: boolean;
  validateRelationships: boolean;
}

interface CompleteMigrationSummary {
  correlationId: string;
  startTime: Date;
  endTime: Date;
  totalDurationMs: number;
  configuration: MigrationConfiguration;
  phases: {
    identification: {
      orphanedReportsFound: number;
      processingTimeMs: number;
      completed: boolean;
    };
    resolution: {
      totalProcessed: number;
      resolved: number;
      highConfidence: number;
      mediumConfidence: number;
      lowConfidence: number;
      failed: number;
      processingTimeMs: number;
      completed: boolean;
    };
    update: {
      eligible: number;
      successful: number;
      skipped: number;
      failed: number;
      validationFailures: number;
      processingTimeMs: number;
      completed: boolean;
    };
  };
  overall: {
    success: boolean;
    successRate: number;
    totalReportsProcessed: number;
    finalOrphanedCount: number;
    errors: string[];
  };
}

class CompleteMigrationOrchestrator {
  private prisma: PrismaClient;
  private correlationId: string;
  private config: MigrationConfiguration;

  constructor(config: Partial<MigrationConfiguration> = {}) {
    this.prisma = new PrismaClient();
    this.correlationId = generateCorrelationId();
    
    // Set default configuration
    this.config = {
      dryRun: config.dryRun ?? false,
      skipBackup: config.skipBackup ?? false,
      minConfidenceLevel: config.minConfidenceLevel ?? 'medium',
      batchSize: config.batchSize ?? 10,
      continueOnError: config.continueOnError ?? true,
      validateRelationships: config.validateRelationships ?? true
    };
  }

  /**
   * Execute the complete migration workflow
   */
  async executeCompleteMigration(): Promise<CompleteMigrationSummary> {
    const startTime = new Date();
    
    logger.info('Starting complete orphaned reports migration', {
      correlationId: this.correlationId,
      configuration: this.config,
      startTime: startTime.toISOString()
    });

    const summary: CompleteMigrationSummary = {
      correlationId: this.correlationId,
      startTime,
      endTime: new Date(),
      totalDurationMs: 0,
      configuration: this.config,
      phases: {
        identification: {
          orphanedReportsFound: 0,
          processingTimeMs: 0,
          completed: false
        },
        resolution: {
          totalProcessed: 0,
          resolved: 0,
          highConfidence: 0,
          mediumConfidence: 0,
          lowConfidence: 0,
          failed: 0,
          processingTimeMs: 0,
          completed: false
        },
        update: {
          eligible: 0,
          successful: 0,
          skipped: 0,
          failed: 0,
          validationFailures: 0,
          processingTimeMs: 0,
          completed: false
        }
      },
      overall: {
        success: false,
        successRate: 0,
        totalReportsProcessed: 0,
        finalOrphanedCount: 0,
        errors: []
      }
    };

    try {
      // Phase 1: Task 4.2 - Identify orphaned reports
      await this.executePhase1Identification(summary);
      
      if (summary.phases.identification.orphanedReportsFound === 0) {
        logger.info('No orphaned reports found - migration not needed', {
          correlationId: this.correlationId
        });
        
        summary.overall.success = true;
        summary.overall.successRate = 100;
        return this.finalizeSummary(summary);
      }

      // Phase 2: Task 4.3 - Resolve project associations
      const resolutionResults = await this.executePhase2Resolution(summary);

      // Phase 3: Task 4.4 - Update database records
      await this.executePhase3Update(summary, resolutionResults);

      // Calculate overall success
      summary.overall.success = summary.phases.identification.completed && 
                               summary.phases.resolution.completed && 
                               summary.phases.update.completed;
      
      summary.overall.successRate = summary.overall.totalReportsProcessed > 0
        ? Math.round((summary.phases.update.successful / summary.overall.totalReportsProcessed) * 100)
        : 100;

    } catch (error) {
      logger.error('Complete migration failed', error as Error, {
        correlationId: this.correlationId
      });
      
      summary.overall.errors.push(`Migration failed: ${(error as Error).message}`);
      summary.overall.success = false;
    }

    return this.finalizeSummary(summary);
  }

  /**
   * Phase 1: Identify orphaned reports (Task 4.2)
   */
  private async executePhase1Identification(summary: CompleteMigrationSummary): Promise<void> {
    logger.info('Phase 1: Identifying orphaned reports', {
      correlationId: this.correlationId,
      phase: 'identification'
    });

    const phaseStartTime = Date.now();
    const identifier = new OrphanedReportsIdentifier();

    try {
      const orphanedReports = await identifier.identifyOrphanedReports();
      
      summary.phases.identification = {
        orphanedReportsFound: orphanedReports.length,
        processingTimeMs: Date.now() - phaseStartTime,
        completed: true
      };

      logger.info('Phase 1 completed', {
        correlationId: this.correlationId,
        orphanedReportsFound: orphanedReports.length,
        processingTimeMs: summary.phases.identification.processingTimeMs
      });

    } catch (error) {
      summary.overall.errors.push(`Identification phase failed: ${(error as Error).message}`);
      throw error;
    } finally {
      await identifier.cleanup();
    }
  }

  /**
   * Phase 2: Resolve project associations (Task 4.3)
   */
  private async executePhase2Resolution(summary: CompleteMigrationSummary): Promise<any[]> {
    logger.info('Phase 2: Resolving project associations', {
      correlationId: this.correlationId,
      phase: 'resolution'
    });

    const phaseStartTime = Date.now();
    const resolver = new OrphanedReportResolver(this.prisma);

    try {
      // Get orphaned reports for resolution
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
          reportType: true,
          title: true
        }
      });

      // Convert to input format
      const reportsForResolution: OrphanedReportInput[] = orphanedReports.map(report => ({
        id: report.id,
        name: report.name,
        competitorId: report.competitorId,
        createdAt: report.createdAt,
        updatedAt: report.updatedAt,
        status: report.status,
        reportType: report.reportType,
        title: report.title || undefined
      }));

      // Execute resolution
      const resolutionResults = await resolver.resolveOrphanedReports(reportsForResolution);
      const resolutionSummary = resolver.generateResolutionSummary(resolutionResults);

      summary.phases.resolution = {
        totalProcessed: resolutionSummary.totalReports,
        resolved: resolutionSummary.resolved,
        highConfidence: resolutionSummary.highConfidence,
        mediumConfidence: resolutionSummary.mediumConfidence,
        lowConfidence: resolutionSummary.lowConfidence,
        failed: resolutionSummary.failed,
        processingTimeMs: Date.now() - phaseStartTime,
        completed: true
      };

      summary.overall.totalReportsProcessed = resolutionSummary.totalReports;

      logger.info('Phase 2 completed', {
        correlationId: this.correlationId,
        resolutionSummary: {
          total: resolutionSummary.totalReports,
          resolved: resolutionSummary.resolved,
          failed: resolutionSummary.failed
        },
        processingTimeMs: summary.phases.resolution.processingTimeMs
      });

      return resolutionResults;

    } catch (error) {
      summary.overall.errors.push(`Resolution phase failed: ${(error as Error).message}`);
      throw error;
    } finally {
      await resolver.cleanup();
    }
  }

  /**
   * Phase 3: Update database records (Task 4.4)
   */
  private async executePhase3Update(summary: CompleteMigrationSummary, resolutionResults: any[]): Promise<void> {
    logger.info('Phase 3: Updating database records', {
      correlationId: this.correlationId,
      phase: 'update',
      resolutionsToProcess: resolutionResults.length
    });

    const phaseStartTime = Date.now();
    const updater = new OrphanedReportUpdater(this.prisma);

    try {
      const updateOptions: UpdateOptions = {
        dryRun: this.config.dryRun,
        validateRelationships: this.config.validateRelationships,
        batchSize: this.config.batchSize,
        continueOnError: this.config.continueOnError,
        minConfidenceLevel: this.config.minConfidenceLevel,
        backupBeforeUpdate: !this.config.skipBackup
      };

      const updateSummary = await updater.updateOrphanedReports(resolutionResults, updateOptions);

      summary.phases.update = {
        eligible: updateSummary.totalOperations,
        successful: updateSummary.successful,
        skipped: updateSummary.skipped,
        failed: updateSummary.failed,
        validationFailures: updateSummary.validationFailures,
        processingTimeMs: Date.now() - phaseStartTime,
        completed: true
      };

      // Add update errors to overall errors
      updateSummary.errors.forEach(error => {
        summary.overall.errors.push(`Update error for report ${error.reportId}: ${error.error}`);
      });

      logger.info('Phase 3 completed', {
        correlationId: this.correlationId,
        updateSummary: {
          eligible: updateSummary.totalOperations,
          successful: updateSummary.successful,
          failed: updateSummary.failed
        },
        processingTimeMs: summary.phases.update.processingTimeMs,
        dryRun: this.config.dryRun
      });

    } catch (error) {
      summary.overall.errors.push(`Update phase failed: ${(error as Error).message}`);
      throw error;
    } finally {
      await updater.cleanup();
    }
  }

  /**
   * Finalize migration summary
   */
  private finalizeSummary(summary: CompleteMigrationSummary): CompleteMigrationSummary {
    summary.endTime = new Date();
    summary.totalDurationMs = summary.endTime.getTime() - summary.startTime.getTime();

    // Get final count of orphaned reports (for live runs)
    if (!this.config.dryRun && summary.overall.success) {
      this.prisma.report.count({
        where: { projectId: null }
      }).then(count => {
        summary.overall.finalOrphanedCount = count;
      }).catch(() => {
        // Ignore error in final count
      });
    }

    return summary;
  }

  /**
   * Generate detailed migration report
   */
  async generateMigrationReport(summary: CompleteMigrationSummary): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportDir = join(process.cwd(), 'reports', 'complete-migrations');
    await mkdir(reportDir, { recursive: true });

    const reportPath = join(reportDir, `complete-migration-${timestamp}.json`);
    await writeFile(reportPath, JSON.stringify(summary, null, 2));

    // Also generate human-readable summary
    const summaryPath = join(reportDir, `migration-summary-${timestamp}.md`);
    const markdownSummary = this.generateMarkdownSummary(summary);
    await writeFile(summaryPath, markdownSummary);

    logger.info('Complete migration report generated', {
      correlationId: this.correlationId,
      reportPath,
      summaryPath
    });

    return reportPath;
  }

  /**
   * Generate markdown summary
   */
  private generateMarkdownSummary(summary: CompleteMigrationSummary): string {
    const duration = Math.round(summary.totalDurationMs / 1000);
    const status = summary.overall.success ? '✅ SUCCESS' : '❌ FAILED';

    return `# Complete Orphaned Reports Migration Report

**Status:** ${status}  
**Started:** ${summary.startTime.toISOString()}  
**Completed:** ${summary.endTime.toISOString()}  
**Duration:** ${duration} seconds  
**Correlation ID:** ${summary.correlationId}  

## Configuration
- **Mode:** ${summary.configuration.dryRun ? 'DRY RUN' : 'LIVE EXECUTION'}
- **Minimum Confidence:** ${summary.configuration.minConfidenceLevel.toUpperCase()}
- **Batch Size:** ${summary.configuration.batchSize}
- **Continue on Error:** ${summary.configuration.continueOnError ? 'Yes' : 'No'}
- **Validate Relationships:** ${summary.configuration.validateRelationships ? 'Yes' : 'No'}
- **Backup:** ${summary.configuration.skipBackup ? 'Skipped' : 'Enabled'}

## Phase Results

### Phase 1: Identification (Task 4.2)
- **Status:** ${summary.phases.identification.completed ? '✅ Completed' : '❌ Failed'}
- **Orphaned Reports Found:** ${summary.phases.identification.orphanedReportsFound.toLocaleString()}
- **Processing Time:** ${summary.phases.identification.processingTimeMs}ms

### Phase 2: Resolution (Task 4.3)
- **Status:** ${summary.phases.resolution.completed ? '✅ Completed' : '❌ Failed'}
- **Total Processed:** ${summary.phases.resolution.totalProcessed.toLocaleString()}
- **Successfully Resolved:** ${summary.phases.resolution.resolved.toLocaleString()}
- **High Confidence:** ${summary.phases.resolution.highConfidence}
- **Medium Confidence:** ${summary.phases.resolution.mediumConfidence}
- **Low Confidence:** ${summary.phases.resolution.lowConfidence}
- **Failed:** ${summary.phases.resolution.failed}
- **Processing Time:** ${summary.phases.resolution.processingTimeMs}ms

### Phase 3: Update (Task 4.4)
- **Status:** ${summary.phases.update.completed ? '✅ Completed' : '❌ Failed'}
- **Eligible for Update:** ${summary.phases.update.eligible.toLocaleString()}
- **Successfully Updated:** ${summary.phases.update.successful.toLocaleString()}
- **Skipped:** ${summary.phases.update.skipped}
- **Failed:** ${summary.phases.update.failed}
- **Validation Failures:** ${summary.phases.update.validationFailures}
- **Processing Time:** ${summary.phases.update.processingTimeMs}ms

## Overall Results

- **Total Reports Processed:** ${summary.overall.totalReportsProcessed.toLocaleString()}
- **Success Rate:** ${summary.overall.successRate}%
- **Final Orphaned Count:** ${summary.overall.finalOrphanedCount} (estimated)
- **Total Errors:** ${summary.overall.errors.length}

${summary.overall.errors.length > 0 ? `## Errors\n\n${summary.overall.errors.map(error => `- ${error}`).join('\n')}` : ''}

---
*Generated by Complete Migration Orchestrator - Task 4.4 Integration*
`;
  }

  /**
   * Cleanup resources
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
  const config: Partial<MigrationConfiguration> = {
    dryRun: args.includes('--dry-run'),
    skipBackup: args.includes('--skip-backup'),
    minConfidenceLevel: args.includes('--high-confidence') ? 'high' 
                      : args.includes('--medium-confidence') ? 'medium' 
                      : 'low',
    continueOnError: !args.includes('--stop-on-error'),
    validateRelationships: !args.includes('--skip-validation')
  };

  console.log('🚀 Starting Complete Orphaned Reports Migration');
  console.log(`Mode: ${config.dryRun ? 'DRY RUN' : 'LIVE EXECUTION'}`);
  console.log(`Confidence Level: ${(config.minConfidenceLevel || 'low').toUpperCase()}`);
  console.log(`Backup: ${config.skipBackup ? 'DISABLED' : 'ENABLED'}\n`);

  const orchestrator = new CompleteMigrationOrchestrator(config);

  try {
    console.log('⏳ Executing migration phases...\n');

    const migrationSummary = await orchestrator.executeCompleteMigration();

    // Display results
    console.log('📊 Migration Results Summary:');
    console.log(`   Overall Status: ${migrationSummary.overall.success ? '✅ SUCCESS' : '❌ FAILED'}`);
    console.log(`   Duration: ${Math.round(migrationSummary.totalDurationMs / 1000)}s`);
    console.log(`   Success Rate: ${migrationSummary.overall.successRate}%`);
    console.log('');

    console.log('🔍 Phase Breakdown:');
    console.log(`   Phase 1 (Identification): ${migrationSummary.phases.identification.orphanedReportsFound} reports found`);
    console.log(`   Phase 2 (Resolution): ${migrationSummary.phases.resolution.resolved}/${migrationSummary.phases.resolution.totalProcessed} resolved`);
    console.log(`   Phase 3 (Update): ${migrationSummary.phases.update.successful}/${migrationSummary.phases.update.eligible} updated`);

    if (migrationSummary.overall.errors.length > 0) {
      console.log(`\n⚠️  ${migrationSummary.overall.errors.length} errors occurred during migration`);
    }

    // Generate detailed report
    const reportPath = await orchestrator.generateMigrationReport(migrationSummary);
    console.log(`\n📋 Detailed migration report saved to: ${reportPath}`);

    console.log('\n🎉 Complete orphaned reports migration finished!');

    if (!migrationSummary.overall.success) {
      process.exit(1);
    }

  } catch (error) {
    console.error('❌ Migration orchestration failed:', error);
    process.exit(1);
  } finally {
    await orchestrator.cleanup();
  }
}

// Run the migration if this script is executed directly
if (require.main === module) {
  main().catch(console.error);
}

export { CompleteMigrationOrchestrator, main }; 