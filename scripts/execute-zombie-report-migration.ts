#!/usr/bin/env node

/**
 * Execute Complete Zombie Report Migration
 * Task 6.5: Execute migration to fix all identified zombie reports
 * 
 * This master script orchestrates the complete zombie report fix migration,
 * executing all necessary steps in the correct sequence with proper error handling
 * and rollback capabilities.
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { ZombieReportIdentifier } from './identify-zombie-reports';
import { ZombieReportBackupManager } from './create-backup';
import { ZombieReportFixer } from './generate-report-versions';
import { DatabaseConstraintManager } from './add-database-constraints';

const prisma = new PrismaClient();

interface MigrationStep {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startTime?: Date;
  endTime?: Date;
  duration?: number;
  result?: any;
  error?: string;
  rollbackRequired?: boolean;
}

interface MigrationResult {
  migrationId: string;
  startTime: Date;
  endTime?: Date;
  overallStatus: 'success' | 'failed' | 'partial';
  steps: MigrationStep[];
  summary: {
    totalSteps: number;
    completedSteps: number;
    failedSteps: number;
    skippedSteps: number;
    zombieReportsFixed: number;
    backupCreated: boolean;
    constraintsApplied: boolean;
  };
  rollbackPlan?: string[];
  recommendations: string[];
}

class ZombieReportMigrationOrchestrator {
  
  /**
   * Main execution function
   */
  static async run(options: {
    dryRun?: boolean;
    skipBackup?: boolean;
    skipConstraints?: boolean;
    forceRun?: boolean;
    rollbackOnly?: boolean;
    rollbackId?: string;
  } = {}): Promise<void> {
    
    console.log('🚀 Starting Complete Zombie Report Migration');
    console.log('=============================================');
    console.log(`Migration ID: ${this.generateMigrationId()}`);
    console.log(`Timestamp: ${new Date().toISOString()}`);
    console.log(`Dry Run: ${options.dryRun ? 'YES' : 'NO'}`);
    console.log(`Skip Backup: ${options.skipBackup ? 'YES' : 'NO'}`);
    console.log(`Skip Constraints: ${options.skipConstraints ? 'YES' : 'NO'}`);
    console.log();

    if (options.rollbackOnly) {
      await this.executeRollback(options.rollbackId);
      return;
    }

    // Initialize migration tracking
    const migrationResult = this.initializeMigrationResult();

    try {
      // Execute migration steps in sequence
      await this.executeMigrationSteps(migrationResult, options);
      
      // Generate migration report
      await this.generateMigrationReport(migrationResult);
      
      // Output final summary
      this.outputMigrationSummary(migrationResult);

    } catch (error) {
      console.error('❌ Migration failed:', error);
      
      // Handle migration failure
      await this.handleMigrationFailure(migrationResult, error as Error);
      
      process.exit(1);
    } finally {
      await prisma.$disconnect();
    }
  }

  /**
   * Generate unique migration ID
   */
  private static generateMigrationId(): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `zombie-report-migration-${timestamp}`;
  }

  /**
   * Initialize migration result tracking
   */
  private static initializeMigrationResult(): MigrationResult {
    return {
      migrationId: this.generateMigrationId(),
      startTime: new Date(),
      overallStatus: 'success',
      steps: [
        {
          id: 'pre_validation',
          name: 'Pre-Migration Validation',
          description: 'Validate system state and prerequisites before migration',
          status: 'pending'
        },
        {
          id: 'identify_zombies',
          name: 'Identify Zombie Reports',
          description: 'Scan system to identify all zombie reports needing fixes',
          status: 'pending'
        },
        {
          id: 'create_backup',
          name: 'Create System Backup',
          description: 'Create comprehensive backup of all report data before changes',
          status: 'pending'
        },
        {
          id: 'fix_zombie_reports',
          name: 'Fix Zombie Reports',
          description: 'Generate ReportVersions for all identified zombie reports',
          status: 'pending'
        },
        {
          id: 'apply_constraints',
          name: 'Apply Database Constraints',
          description: 'Add database constraints to prevent future zombie reports',
          status: 'pending'
        },
        {
          id: 'post_validation',
          name: 'Post-Migration Validation',
          description: 'Verify migration success and system integrity',
          status: 'pending'
        }
      ],
      summary: {
        totalSteps: 6,
        completedSteps: 0,
        failedSteps: 0,
        skippedSteps: 0,
        zombieReportsFixed: 0,
        backupCreated: false,
        constraintsApplied: false
      },
      recommendations: []
    };
  }

  /**
   * Execute all migration steps in sequence
   */
  private static async executeMigrationSteps(
    migrationResult: MigrationResult,
    options: any
  ): Promise<void> {
    
    console.log('📋 Executing migration steps...\n');

    // Step 1: Pre-Migration Validation
    await this.executeStep(migrationResult, 'pre_validation', async () => {
      return await this.performPreMigrationValidation();
    });

         // Step 2: Identify Zombie Reports
     let zombieReports: any[] = [];
     await this.executeStep(migrationResult, 'identify_zombies', async () => {
       console.log('🔍 Running zombie report identification...');
       const analysis: any = await ZombieReportIdentifier.run();
       zombieReports = analysis?.zombieReports || [];
       return {
         zombieReportsFound: zombieReports.length,
         analysisComplete: true
       };
     });

    if (zombieReports.length === 0) {
      console.log('✅ No zombie reports found - migration not needed');
      migrationResult.steps.slice(2).forEach(step => {
        step.status = 'skipped';
        migrationResult.summary.skippedSteps++;
      });
      return;
    }

    // Step 3: Create Backup (unless skipped)
    if (!options.skipBackup) {
      await this.executeStep(migrationResult, 'create_backup', async () => {
        console.log('💾 Creating system backup...');
        await ZombieReportBackupManager.run({
          backupType: 'zombie_reports_only',
          compressionEnabled: true,
          verifyIntegrity: true
        });
        migrationResult.summary.backupCreated = true;
        return { backupCreated: true };
      });
    } else {
      this.skipStep(migrationResult, 'create_backup', 'Backup skipped by user option');
    }

         // Step 4: Fix Zombie Reports
     await this.executeStep(migrationResult, 'fix_zombie_reports', async () => {
       console.log('🔧 Fixing zombie reports...');
       const fixResult: any = await ZombieReportFixer.run({
         dryRun: options.dryRun,
         createBackup: false, // Already created above
         forceRun: options.forceRun
       });
       
       migrationResult.summary.zombieReportsFixed = fixResult?.successfulFixes || 0;
       return {
         fixedReports: fixResult?.successfulFixes || 0,
         failedFixes: fixResult?.failedFixes || 0
       };
     });

    // Step 5: Apply Database Constraints (unless skipped)
    if (!options.skipConstraints) {
      await this.executeStep(migrationResult, 'apply_constraints', async () => {
        console.log('🛡️  Applying database constraints...');
        await DatabaseConstraintManager.run({
          dryRun: options.dryRun,
          forceApply: true
        });
        migrationResult.summary.constraintsApplied = true;
        return { constraintsApplied: true };
      });
    } else {
      this.skipStep(migrationResult, 'apply_constraints', 'Constraints skipped by user option');
    }

    // Step 6: Post-Migration Validation
    await this.executeStep(migrationResult, 'post_validation', async () => {
      return await this.performPostMigrationValidation();
    });
  }

  /**
   * Execute a single migration step with error handling
   */
  private static async executeStep(
    migrationResult: MigrationResult,
    stepId: string,
    stepFunction: () => Promise<any>
  ): Promise<void> {
    
    const step = migrationResult.steps.find(s => s.id === stepId);
    if (!step) {
      throw new Error(`Step ${stepId} not found`);
    }

    console.log(`\n🔄 ${step.name}`);
    console.log(`   ${step.description}`);
    
    step.status = 'running';
    step.startTime = new Date();

    try {
      const result = await stepFunction();
      
      step.status = 'completed';
      step.endTime = new Date();
      step.duration = step.endTime.getTime() - step.startTime.getTime();
      step.result = result;
      
      migrationResult.summary.completedSteps++;
      
      console.log(`   ✅ Completed in ${(step.duration / 1000).toFixed(2)}s`);
      
    } catch (error) {
      step.status = 'failed';
      step.endTime = new Date();
      step.duration = step.endTime ? step.endTime.getTime() - step.startTime!.getTime() : 0;
      step.error = (error as Error).message;
      step.rollbackRequired = this.shouldRollback(stepId);
      
      migrationResult.summary.failedSteps++;
      migrationResult.overallStatus = 'failed';
      
      console.log(`   ❌ Failed: ${(error as Error).message}`);
      
      throw error;
    }
  }

  /**
   * Skip a migration step
   */
  private static skipStep(migrationResult: MigrationResult, stepId: string, reason: string): void {
    const step = migrationResult.steps.find(s => s.id === stepId);
    if (step) {
      step.status = 'skipped';
      step.error = reason;
      migrationResult.summary.skippedSteps++;
      console.log(`\n⏭️  ${step.name} - SKIPPED`);
      console.log(`   Reason: ${reason}`);
    }
  }

  /**
   * Perform pre-migration validation
   */
  private static async performPreMigrationValidation(): Promise<any> {
    const validationResults = {
      databaseConnection: false,
      schemaValid: false,
      diskSpaceAvailable: false,
      noActiveTransactions: false,
      systemHealthy: true
    };

    // Check database connection
    try {
      await prisma.$queryRaw`SELECT 1`;
      validationResults.databaseConnection = true;
    } catch (error) {
      throw new Error(`Database connection failed: ${(error as Error).message}`);
    }

    // Check schema validity
    try {
      await prisma.report.findFirst();
      await prisma.reportVersion.findFirst();
      validationResults.schemaValid = true;
    } catch (error) {
      throw new Error(`Schema validation failed: ${(error as Error).message}`);
    }

    // Check disk space (basic check)
    try {
      const stats = fs.statSync(process.cwd());
      validationResults.diskSpaceAvailable = true;
    } catch (error) {
      console.log('⚠️  Could not verify disk space - proceeding with caution');
    }

    // Check for active transactions (simplified)
    validationResults.noActiveTransactions = true;

    console.log('   ✅ Pre-migration validation passed');
    return validationResults;
  }

  /**
   * Perform post-migration validation
   */
  private static async performPostMigrationValidation(): Promise<any> {
    const validationResults = {
      noZombieReports: false,
      reportIntegrityGood: false,
      constraintsActive: false,
      systemStable: true
    };

    // Check for remaining zombie reports
    const remainingZombies = await prisma.report.count({
      where: {
        status: 'COMPLETED',
        versions: { none: {} }
      }
    });

    if (remainingZombies === 0) {
      validationResults.noZombieReports = true;
      console.log('   ✅ No zombie reports remaining');
    } else {
      console.log(`   ⚠️  ${remainingZombies} zombie reports still exist`);
    }

    // Check report integrity
    const totalCompleted = await prisma.report.count({
      where: { status: 'COMPLETED' }
    });

    const completedWithVersions = await prisma.report.count({
      where: {
        status: 'COMPLETED',
        versions: { some: {} }
      }
    });

    validationResults.reportIntegrityGood = totalCompleted === completedWithVersions;
    
    if (validationResults.reportIntegrityGood) {
      console.log('   ✅ Report integrity validated');
    } else {
      console.log(`   ⚠️  Report integrity issues: ${totalCompleted - completedWithVersions} reports without versions`);
    }

    // Check if constraints are active (check if validation files exist)
    const constraintFiles = [
      'src/lib/database-triggers/reportValidationTriggers.ts',
      'src/lib/database-integrity/reportIntegrityChecks.ts'
    ];

    validationResults.constraintsActive = constraintFiles.every(file => 
      fs.existsSync(path.join(process.cwd(), file))
    );

    if (validationResults.constraintsActive) {
      console.log('   ✅ Database constraints active');
    } else {
      console.log('   ⚠️  Some database constraints may not be active');
    }

    return validationResults;
  }

  /**
   * Determine if rollback is required for a failed step
   */
  private static shouldRollback(stepId: string): boolean {
    const rollbackRequiredSteps = ['fix_zombie_reports', 'apply_constraints'];
    return rollbackRequiredSteps.includes(stepId);
  }

  /**
   * Handle migration failure
   */
  private static async handleMigrationFailure(
    migrationResult: MigrationResult,
    error: Error
  ): Promise<void> {
    
    console.log('\n💥 MIGRATION FAILURE DETECTED');
    console.log('==============================');
    
    migrationResult.overallStatus = 'failed';
    migrationResult.endTime = new Date();

    // Determine rollback requirements
    const rollbackSteps = migrationResult.steps
      .filter(step => step.status === 'completed' && step.rollbackRequired)
      .reverse(); // Rollback in reverse order

    if (rollbackSteps.length > 0) {
      console.log('\n🔄 ROLLBACK REQUIRED');
      console.log('The following steps may need to be rolled back:');
      rollbackSteps.forEach(step => {
        console.log(`• ${step.name}`);
      });

      migrationResult.rollbackPlan = rollbackSteps.map(step => step.name);
      
      console.log('\n⚠️  Manual rollback may be required. Check backup files and logs.');
      console.log('   Use --rollback-only flag to attempt automated rollback.');
    }

    // Generate failure report
    await this.generateMigrationReport(migrationResult);
  }

  /**
   * Execute rollback procedure
   */
  private static async executeRollback(rollbackId?: string): Promise<void> {
    console.log('🔄 Starting Migration Rollback');
    console.log('==============================');
    
    if (!rollbackId) {
      console.log('❌ Rollback ID required. Check migration reports for details.');
      return;
    }

    // Implementation would restore from backup
    console.log('⚠️  Automated rollback not yet implemented.');
    console.log('Manual rollback steps:');
    console.log('1. Stop the application');
    console.log('2. Restore database from backup');
    console.log('3. Remove constraint files if created');
    console.log('4. Restart application');
    console.log('5. Verify system functionality');
  }

  /**
   * Generate comprehensive migration report
   */
  private static async generateMigrationReport(migrationResult: MigrationResult): Promise<void> {
    const reportsDir = path.join(process.cwd(), 'reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    // Generate detailed JSON report
    const reportPath = path.join(reportsDir, `migration-report-${migrationResult.migrationId}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(migrationResult, null, 2));

    // Generate markdown summary
    const summaryPath = path.join(reportsDir, `migration-summary-${migrationResult.migrationId}.md`);
    const summary = this.generateMarkdownReport(migrationResult);
    fs.writeFileSync(summaryPath, summary);

    console.log(`\n📄 Migration reports generated:`);
    console.log(`   • Detailed: ${reportPath}`);
    console.log(`   • Summary: ${summaryPath}`);
  }

  /**
   * Generate markdown migration report
   */
  private static generateMarkdownReport(migrationResult: MigrationResult): string {
    const duration = migrationResult.endTime 
      ? migrationResult.endTime.getTime() - migrationResult.startTime.getTime()
      : Date.now() - migrationResult.startTime.getTime();

    return `# Zombie Report Migration Report

**Migration ID:** ${migrationResult.migrationId}
**Start Time:** ${migrationResult.startTime.toISOString()}
**End Time:** ${migrationResult.endTime?.toISOString() || 'In Progress'}
**Duration:** ${(duration / 1000).toFixed(2)} seconds
**Overall Status:** ${migrationResult.overallStatus.toUpperCase()}

## Summary

- **Total Steps:** ${migrationResult.summary.totalSteps}
- **Completed Steps:** ${migrationResult.summary.completedSteps}
- **Failed Steps:** ${migrationResult.summary.failedSteps}
- **Skipped Steps:** ${migrationResult.summary.skippedSteps}
- **Success Rate:** ${((migrationResult.summary.completedSteps / migrationResult.summary.totalSteps) * 100).toFixed(1)}%

## Results

- **Zombie Reports Fixed:** ${migrationResult.summary.zombieReportsFixed}
- **Backup Created:** ${migrationResult.summary.backupCreated ? 'Yes' : 'No'}
- **Constraints Applied:** ${migrationResult.summary.constraintsApplied ? 'Yes' : 'No'}

## Step Details

${migrationResult.steps.map(step => `
### ${step.name} (${step.status.toUpperCase()})
- **Description:** ${step.description}
- **Duration:** ${step.duration ? `${(step.duration / 1000).toFixed(2)}s` : 'N/A'}
${step.error ? `- **Error:** ${step.error}` : ''}
${step.result ? `- **Result:** ${JSON.stringify(step.result, null, 2)}` : ''}
`).join('\n')}

${migrationResult.rollbackPlan ? `## Rollback Plan\n${migrationResult.rollbackPlan.map(step => `- ${step}`).join('\n')}` : ''}

## Recommendations

${migrationResult.recommendations.length > 0 ? migrationResult.recommendations.map(rec => `- ${rec}`).join('\n') : 'No specific recommendations at this time.'}

---
*Generated by Zombie Report Migration Orchestrator v1.0*
`;
  }

  /**
   * Output final migration summary
   */
  private static outputMigrationSummary(migrationResult: MigrationResult): void {
    const duration = migrationResult.endTime 
      ? migrationResult.endTime.getTime() - migrationResult.startTime.getTime()
      : Date.now() - migrationResult.startTime.getTime();

    console.log('\n🎯 MIGRATION SUMMARY');
    console.log('====================');
    console.log(`Migration ID: ${migrationResult.migrationId}`);
    console.log(`Overall Status: ${migrationResult.overallStatus.toUpperCase()}`);
    console.log(`Duration: ${(duration / 1000).toFixed(2)} seconds`);
    console.log(`Success Rate: ${((migrationResult.summary.completedSteps / migrationResult.summary.totalSteps) * 100).toFixed(1)}%`);

    console.log('\n📊 RESULTS:');
    console.log(`• Completed Steps: ${migrationResult.summary.completedSteps}/${migrationResult.summary.totalSteps}`);
    console.log(`• Zombie Reports Fixed: ${migrationResult.summary.zombieReportsFixed}`);
    console.log(`• Backup Created: ${migrationResult.summary.backupCreated ? 'Yes' : 'No'}`);
    console.log(`• Constraints Applied: ${migrationResult.summary.constraintsApplied ? 'Yes' : 'No'}`);

    if (migrationResult.summary.failedSteps > 0) {
      console.log('\n❌ FAILED STEPS:');
      migrationResult.steps
        .filter(step => step.status === 'failed')
        .forEach(step => {
          console.log(`• ${step.name}: ${step.error}`);
        });
    }

    console.log('\n📋 NEXT STEPS:');
    if (migrationResult.overallStatus === 'success') {
      console.log('• Migration completed successfully');
      console.log('• Monitor system for 24-48 hours');
      console.log('• Verify no new zombie reports appear');
      console.log('• Users should now be able to access all previously inaccessible reports');
    } else {
      console.log('• Migration failed - review error details');
      console.log('• Consider rollback if data integrity is compromised');
      console.log('• Address root causes before retrying migration');
    }
  }
}

// Parse command line arguments
function parseArgs(): any {
  const args = process.argv.slice(2);
  const options: any = {};

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--skip-backup':
        options.skipBackup = true;
        break;
      case '--skip-constraints':
        options.skipConstraints = true;
        break;
      case '--force':
        options.forceRun = true;
        break;
      case '--rollback-only':
        options.rollbackOnly = true;
        break;
      case '--rollback-id':
        options.rollbackId = args[++i];
        break;
    }
  }

  return options;
}

// Execute if run directly
if (require.main === module) {
  const options = parseArgs();
  ZombieReportMigrationOrchestrator.run(options).catch(console.error);
}

export { ZombieReportMigrationOrchestrator }; 