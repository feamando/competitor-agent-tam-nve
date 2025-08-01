#!/usr/bin/env node

/**
 * Create Orphaned Reports Backup Script - Task 4.5
 * 
 * This script creates comprehensive backups of orphaned reports before migration execution.
 * It provides multiple backup formats, validation, and restoration preparation.
 * 
 * Key Functions:
 * - Task 4.5: Create backup before migration execution
 * - Multiple backup formats (JSON, structured)
 * - Comprehensive data collection and validation
 * - Backup integrity verification
 * - Restoration preparation and metadata
 * 
 * Usage: npm run backup:orphaned-reports [options]
 */

import { OrphanedReportsBackupService, BackupConfiguration } from '../src/services/OrphanedReportsBackupService';
import { PrismaClient } from '@prisma/client';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

interface BackupScriptOptions {
  format: 'json' | 'structured' | 'both';
  includeVersions: boolean;
  includeSchedules: boolean;
  includeRelatedData: boolean;
  enableValidation: boolean;
  enableCompression: boolean;
  outputDirectory?: string | undefined;
  dryRun: boolean;
}

async function main() {
  const args = process.argv.slice(2);
  
  // Parse command line arguments
  const options: BackupScriptOptions = {
    format: getArgValue(args, '--format', 'json') as 'json' | 'structured' | 'both',
    includeVersions: !args.includes('--no-versions'),
    includeSchedules: !args.includes('--no-schedules'),
    includeRelatedData: !args.includes('--no-related-data'),
    enableValidation: !args.includes('--no-validation'),
    enableCompression: args.includes('--compress'),
    outputDirectory: getArgValue(args, '--output'),
    dryRun: args.includes('--dry-run')
  };

  console.log('🛡️  Creating Orphaned Reports Backup - Task 4.5');
  console.log(`Format: ${options.format.toUpperCase()}`);
  console.log(`Include Versions: ${options.includeVersions ? 'Yes' : 'No'}`);
  console.log(`Include Schedules: ${options.includeSchedules ? 'Yes' : 'No'}`);
  console.log(`Include Related Data: ${options.includeRelatedData ? 'Yes' : 'No'}`);
  console.log(`Validation: ${options.enableValidation ? 'Enabled' : 'Disabled'}`);
  console.log(`Compression: ${options.enableCompression ? 'Enabled' : 'Disabled'}`);
  console.log(`Mode: ${options.dryRun ? 'DRY RUN' : 'LIVE BACKUP'}\n`);

  const prisma = new PrismaClient();
  const backupService = new OrphanedReportsBackupService(
    prisma,
    options.outputDirectory
  );

  try {
    // Step 1: Pre-backup assessment
    console.log('1️⃣  Assessing backup requirements...');
    const orphanedCount = await prisma.report.count({
      where: { projectId: null }
    });

    if (orphanedCount === 0) {
      console.log('✅ No orphaned reports found - backup not needed!');
      console.log('🎉 All reports are properly associated with projects.\n');
      return;
    }

    console.log(`📊 Found ${orphanedCount} orphaned reports requiring backup\n`);

    if (options.dryRun) {
      console.log('🧪 DRY RUN MODE - Simulating backup process...\n');
      
      // Simulate backup assessment
      const estimatedSize = orphanedCount * 2; // Rough KB estimate per report
      const estimatedTime = Math.max(orphanedCount * 10, 1000); // Minimum 1 second
      
      console.log('📋 Backup Assessment:');
      console.log(`   Reports to backup: ${orphanedCount.toLocaleString()}`);
      console.log(`   Estimated size: ~${estimatedSize}KB`);
      console.log(`   Estimated time: ~${Math.round(estimatedTime / 1000)}s`);
      console.log(`   Format: ${options.format}`);
      console.log(`   Validation: ${options.enableValidation ? 'Enabled' : 'Disabled'}`);
      
      console.log('\n✅ DRY RUN completed - ready for actual backup execution');
      console.log('💡 Run without --dry-run flag to create actual backup\n');
      return;
    }

    // Step 2: Configure backup
    console.log('2️⃣  Configuring backup settings...');
    const backupConfig: BackupConfiguration = {
      includeRelatedData: options.includeRelatedData,
      includeVersions: options.includeVersions,
      includeSchedules: options.includeSchedules,
      includeMetadata: true,
      compressionEnabled: options.enableCompression,
      encryptionEnabled: false, // Could be extended later
      validationEnabled: options.enableValidation,
      backupFormat: options.format,
      maxBackupSize: 1000 // 1GB max
    };

    console.log('✅ Backup configuration ready\n');

    // Step 3: Execute backup
    console.log('3️⃣  Creating pre-migration backup...');
    const backupResult = await backupService.createPreMigrationBackup(backupConfig);

    if (!backupResult.success) {
      console.error('❌ Backup creation failed:');
      console.error(`   Error: ${backupResult.errorMessage}`);
      
      if (backupResult.validation.errors.length > 0) {
        console.error('   Validation errors:');
        backupResult.validation.errors.forEach(error => {
          console.error(`     - ${error}`);
        });
      }
      process.exit(1);
    }

    console.log('✅ Backup created successfully!\n');

    // Step 4: Display backup summary
    console.log('📈 Backup Summary:');
    console.log(`   Backup ID: ${backupResult.backupId}`);
    console.log(`   Reports Backed Up: ${backupResult.statistics.reportsBackedUp.toLocaleString()}`);
    console.log(`   Total Size: ${formatBytes(backupResult.statistics.totalSizeBytes)}`);
    console.log(`   Processing Time: ${backupResult.statistics.processingTimeMs}ms`);
    
    if (backupResult.statistics.compressionRatio) {
      console.log(`   Compression Ratio: ${backupResult.statistics.compressionRatio.toFixed(2)}x`);
    }

    console.log('\n🔍 Validation Results:');
    console.log(`   Checksum Valid: ${backupResult.validation.checksumValid ? '✅' : '❌'}`);
    console.log(`   Integrity Valid: ${backupResult.validation.integrityValid ? '✅' : '❌'}`);
    
    if (backupResult.validation.errors.length > 0) {
      console.log('   Validation Warnings:');
      backupResult.validation.errors.forEach(error => {
        console.log(`     ⚠️  ${error}`);
      });
    }

    console.log('\n📁 Backup Files:');
    console.log(`   Data: ${backupResult.backupPath}`);
    console.log(`   Metadata: ${backupResult.metadataPath}`);

    // Step 5: Generate backup report
    console.log('\n4️⃣  Generating backup report...');
    const reportPath = await generateBackupReport(backupResult, backupConfig, orphanedCount);
    console.log(`📋 Backup report saved to: ${reportPath}`);

    // Step 6: Provide next steps guidance
    console.log('\n💡 Next Steps:');
    console.log('   1. Verify backup integrity before proceeding with migration');
    console.log('   2. Store backup in secure location for disaster recovery');
    console.log('   3. Run migration with confidence knowing data is safely backed up');
    console.log('   4. Keep backup until migration is verified successful');
    
    if (backupResult.validation.errors.length > 0) {
      console.log('\n⚠️  Note: Some validation warnings were detected');
      console.log('   Review the backup report for details before proceeding');
    }

    console.log('\n🎉 Task 4.5 - Orphaned Reports Backup Complete!');

  } catch (error) {
    console.error('❌ Backup creation failed:', error);
    process.exit(1);
  } finally {
    await backupService.cleanup();
    await prisma.$disconnect();
  }
}

/**
 * Generate comprehensive backup report
 */
async function generateBackupReport(
  backupResult: any,
  config: BackupConfiguration,
  totalOrphaned: number
): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportDir = join(process.cwd(), 'reports', 'backups');
  await mkdir(reportDir, { recursive: true });

  const reportPath = join(reportDir, `backup-report-${timestamp}.md`);
  
  const report = `# Orphaned Reports Backup Report

**Created:** ${new Date().toISOString()}  
**Backup ID:** ${backupResult.backupId}  
**Task:** 4.5 - Create backup before migration execution  

## Executive Summary

- **Status:** ${backupResult.success ? '✅ SUCCESS' : '❌ FAILED'}
- **Reports Backed Up:** ${backupResult.statistics.reportsBackedUp.toLocaleString()} of ${totalOrphaned.toLocaleString()}
- **Backup Size:** ${formatBytes(backupResult.statistics.totalSizeBytes)}
- **Processing Time:** ${backupResult.statistics.processingTimeMs}ms
- **Format:** ${config.backupFormat.toUpperCase()}

## Configuration

- **Include Versions:** ${config.includeVersions ? 'Yes' : 'No'}
- **Include Schedules:** ${config.includeSchedules ? 'Yes' : 'No'}
- **Include Related Data:** ${config.includeRelatedData ? 'Yes' : 'No'}
- **Compression:** ${config.compressionEnabled ? 'Enabled' : 'Disabled'}
- **Validation:** ${config.validationEnabled ? 'Enabled' : 'Disabled'}
- **Max Backup Size:** ${config.maxBackupSize}MB

## Validation Results

- **Checksum Valid:** ${backupResult.validation.checksumValid ? '✅' : '❌'}
- **Integrity Valid:** ${backupResult.validation.integrityValid ? '✅' : '❌'}
- **Total Validation Errors:** ${backupResult.validation.errors.length}

${backupResult.validation.errors.length > 0 ? `### Validation Errors
${backupResult.validation.errors.map((error: string) => `- ${error}`).join('\n')}` : ''}

## Backup Files

- **Primary Backup:** ${backupResult.backupPath}
- **Metadata File:** ${backupResult.metadataPath}

## Recovery Information

This backup can be used to restore orphaned reports if migration fails or data corruption occurs.

### Restoration Requirements
- Node.js environment with Prisma
- Database access with appropriate permissions
- Backup integrity verification before restoration

### Restoration Steps
1. Verify backup integrity using checksums
2. Load backup metadata and validate structure
3. Prepare target database (ensure no conflicts)
4. Execute restoration in database transaction
5. Verify restoration success and data consistency

## Security Notes

- Backup contains sensitive report data - store securely
- Consider encryption for long-term storage
- Implement proper access controls for backup files
- Regular backup validation recommended

---
*Generated by Orphaned Reports Backup Service - Task 4.5*
`;

  await writeFile(reportPath, report);
  return reportPath;
}

/**
 * Utility functions
 */
function getArgValue(args: string[], flag: string, defaultValue?: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1 || index === args.length - 1) {
    return defaultValue;
  }
  return args[index + 1];
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Run the backup if this script is executed directly
if (require.main === module) {
  main().catch(console.error);
}

export { main }; 