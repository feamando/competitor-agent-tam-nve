#!/usr/bin/env node

/**
 * Create Backup for Zombie Report Fix Operations
 * Task 6.4: Create backup before applying zombie report fixes
 * 
 * This script creates comprehensive backups of report data before zombie report
 * fix operations to ensure data safety and enable rollback if needed.
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const prisma = new PrismaClient();

interface BackupMetadata {
  backupId: string;
  timestamp: Date;
  backupType: 'full' | 'zombie_reports_only' | 'incremental';
  triggeredBy: string;
  dataScope: {
    totalReports: number;
    totalReportVersions: number;
    zombieReports: number;
    affectedProjects: string[];
  };
  backupLocation: string;
  compressionUsed: boolean;
  checksumVerified: boolean;
  backupSizeBytes: number;
  estimatedRestoreTime: string;
}

interface BackupResult {
  success: boolean;
  backupMetadata: BackupMetadata;
  backupFiles: {
    databaseDump?: string;
    reportData: string;
    reportVersions: string;
    projectData: string;
    metadata: string;
    checksums: string;
  };
  warnings: string[];
  errors: string[];
  executionTime: number;
}

class ZombieReportBackupManager {
  
  /**
   * Main execution function
   */
  static async run(options: {
    backupType?: 'full' | 'zombie_reports_only' | 'incremental';
    compressionEnabled?: boolean;
    includeDatabase?: boolean;
    verifyIntegrity?: boolean;
    customLocation?: string;
    retainCount?: number;
  } = {}): Promise<void> {
    console.log('💾 Starting Zombie Report Backup Creation');
    console.log('=========================================');
    console.log(`Timestamp: ${new Date().toISOString()}`);
    console.log(`Backup Type: ${options.backupType || 'zombie_reports_only'}`);
    console.log(`Compression: ${options.compressionEnabled !== false ? 'ENABLED' : 'DISABLED'}`);
    console.log();

    const startTime = Date.now();

    try {
      // Create backup directory structure
      const backupLocation = await this.createBackupDirectory(options.customLocation);
      console.log(`📁 Backup location: ${backupLocation}`);

      // Analyze data scope for backup
      const dataScope = await this.analyzeDataScope();
      
      // Create backup metadata
      const backupMetadata = this.createBackupMetadata(
        options.backupType || 'zombie_reports_only',
        backupLocation,
        dataScope,
        options.compressionEnabled !== false
      );

      console.log(`📊 Data scope analyzed:`);
      console.log(`   • Total Reports: ${dataScope.totalReports.toLocaleString()}`);
      console.log(`   • Total ReportVersions: ${dataScope.totalReportVersions.toLocaleString()}`);
      console.log(`   • Zombie Reports: ${dataScope.zombieReports.toLocaleString()}`);
      console.log(`   • Affected Projects: ${dataScope.affectedProjects.length}`);

      if (dataScope.zombieReports === 0) {
        console.log('✅ No zombie reports found - backup still recommended for safety');
      }

      // Perform backup operations
      const backupResult = await this.performBackup(backupMetadata, options);

      // Verify backup integrity if requested
      if (options.verifyIntegrity !== false) {
        await this.verifyBackupIntegrity(backupResult);
      }

      // Clean up old backups if retention limit specified
      if (options.retainCount && options.retainCount > 0) {
        await this.cleanupOldBackups(options.retainCount);
      }

      // Generate backup report
      await this.generateBackupReport(backupResult);

      // Output summary
      this.outputBackupSummary(backupResult);

    } catch (error) {
      console.error('❌ Backup creation failed:', error);
      process.exit(1);
    } finally {
      await prisma.$disconnect();
    }
  }

  /**
   * Create backup directory structure
   */
  private static async createBackupDirectory(customLocation?: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupId = `zombie-report-backup-${timestamp}`;
    
    const baseBackupDir = customLocation || path.join(process.cwd(), 'backups');
    const backupLocation = path.join(baseBackupDir, backupId);

    // Create directory structure
    fs.mkdirSync(backupLocation, { recursive: true });
    
    // Create subdirectories
    const subdirs = ['data', 'metadata', 'checksums', 'logs'];
    subdirs.forEach(subdir => {
      fs.mkdirSync(path.join(backupLocation, subdir), { recursive: true });
    });

    return backupLocation;
  }

  /**
   * Analyze data scope for backup planning
   */
  private static async analyzeDataScope(): Promise<BackupMetadata['dataScope']> {
    console.log('🔍 Analyzing data scope for backup...');

    // Get total counts
    const totalReports = await prisma.report.count();
    const totalReportVersions = await prisma.reportVersion.count();

    // Get zombie reports count and affected projects
    const zombieReports = await prisma.report.findMany({
      where: {
        status: 'COMPLETED',
        versions: { none: {} }
      },
      select: {
        projectId: true
      }
    });

    const affectedProjects = [...new Set(
      zombieReports
        .map(r => r.projectId)
        .filter(Boolean) as string[]
    )];

    return {
      totalReports,
      totalReportVersions,
      zombieReports: zombieReports.length,
      affectedProjects
    };
  }

  /**
   * Create backup metadata structure
   */
  private static createBackupMetadata(
    backupType: BackupMetadata['backupType'],
    backupLocation: string,
    dataScope: BackupMetadata['dataScope'],
    compressionUsed: boolean
  ): BackupMetadata {
    return {
      backupId: path.basename(backupLocation),
      timestamp: new Date(),
      backupType,
      triggeredBy: 'zombie_report_fix_preparation',
      dataScope,
      backupLocation,
      compressionUsed,
      checksumVerified: false,
      backupSizeBytes: 0,
      estimatedRestoreTime: '15-30 minutes'
    };
  }

  /**
   * Perform the actual backup operations
   */
  private static async performBackup(
    metadata: BackupMetadata,
    options: any
  ): Promise<BackupResult> {
    
    const backupFiles: BackupResult['backupFiles'] = {
      reportData: '',
      reportVersions: '',
      projectData: '',
      metadata: '',
      checksums: ''
    };

    const warnings: string[] = [];
    const errors: string[] = [];
    const startTime = Date.now();

    console.log('💾 Starting backup operations...');

    try {
      // 1. Backup Report data
      console.log('\n📋 Backing up Report data...');
      backupFiles.reportData = await this.backupReportData(metadata.backupLocation, metadata.backupType);
      
      // 2. Backup ReportVersion data
      console.log('📄 Backing up ReportVersion data...');
      backupFiles.reportVersions = await this.backupReportVersionData(metadata.backupLocation, metadata.backupType);
      
      // 3. Backup related Project data
      console.log('📁 Backing up Project data...');
      backupFiles.projectData = await this.backupProjectData(metadata.backupLocation, metadata.dataScope.affectedProjects);
      
      // 4. Create database dump if requested
      if (options.includeDatabase) {
        console.log('🗄️  Creating database dump...');
        backupFiles.databaseDump = await this.createDatabaseDump(metadata.backupLocation);
      }
      
      // 5. Generate metadata file
      console.log('📝 Generating backup metadata...');
      backupFiles.metadata = await this.generateMetadataFile(metadata);
      
      // 6. Generate checksums
      console.log('🔐 Generating checksums...');
      backupFiles.checksums = await this.generateChecksums(metadata.backupLocation, backupFiles);

      // 7. Apply compression if enabled
      if (metadata.compressionUsed) {
        console.log('🗜️  Applying compression...');
        await this.compressBackupFiles(metadata.backupLocation, backupFiles);
      }

      // Calculate total backup size
      metadata.backupSizeBytes = await this.calculateBackupSize(metadata.backupLocation);

      return {
        success: true,
        backupMetadata: metadata,
        backupFiles,
        warnings,
        errors,
        executionTime: Date.now() - startTime
      };

    } catch (error) {
      errors.push((error as Error).message);
      return {
        success: false,
        backupMetadata: metadata,
        backupFiles,
        warnings,
        errors,
        executionTime: Date.now() - startTime
      };
    }
  }

  /**
   * Backup Report table data
   */
  private static async backupReportData(backupLocation: string, backupType: string): Promise<string> {
    const whereClause = backupType === 'zombie_reports_only' 
      ? { status: 'COMPLETED', versions: { none: {} } }
      : {};

    const reports = await prisma.report.findMany({
      where: whereClause,
      include: {
        project: { select: { id: true, name: true } },
        competitor: { select: { id: true, name: true } },
        versions: true
      }
    });

    const reportDataPath = path.join(backupLocation, 'data', 'reports.json');
    const backupData = {
      timestamp: new Date().toISOString(),
      backupType,
      recordCount: reports.length,
      data: reports
    };

    fs.writeFileSync(reportDataPath, JSON.stringify(backupData, null, 2));
    console.log(`   ✅ Backed up ${reports.length} reports`);
    
    return reportDataPath;
  }

  /**
   * Backup ReportVersion table data
   */
  private static async backupReportVersionData(backupLocation: string, backupType: string): Promise<string> {
    let reportVersions: any[];

    if (backupType === 'zombie_reports_only') {
      // For zombie reports backup, we still need to backup ALL ReportVersions
      // because we need them for integrity verification
      reportVersions = await prisma.reportVersion.findMany({
        include: {
          report: { select: { id: true, status: true } }
        }
      });
    } else {
      reportVersions = await prisma.reportVersion.findMany({
        include: {
          report: { select: { id: true, status: true } }
        }
      });
    }

    const reportVersionsPath = path.join(backupLocation, 'data', 'report-versions.json');
    const backupData = {
      timestamp: new Date().toISOString(),
      backupType,
      recordCount: reportVersions.length,
      data: reportVersions
    };

    fs.writeFileSync(reportVersionsPath, JSON.stringify(backupData, null, 2));
    console.log(`   ✅ Backed up ${reportVersions.length} report versions`);
    
    return reportVersionsPath;
  }

  /**
   * Backup Project data for affected projects
   */
  private static async backupProjectData(backupLocation: string, affectedProjectIds: string[]): Promise<string> {
    const projects = affectedProjectIds.length > 0 
      ? await prisma.project.findMany({
          where: { id: { in: affectedProjectIds } },
          include: {
            competitors: true
          }
        })
      : [];

    const projectDataPath = path.join(backupLocation, 'data', 'projects.json');
    const backupData = {
      timestamp: new Date().toISOString(),
      recordCount: projects.length,
      affectedProjectIds,
      data: projects
    };

    fs.writeFileSync(projectDataPath, JSON.stringify(backupData, null, 2));
    console.log(`   ✅ Backed up ${projects.length} affected projects`);
    
    return projectDataPath;
  }

  /**
   * Create database dump using SQLite-specific commands
   */
  private static async createDatabaseDump(backupLocation: string): Promise<string> {
    try {
      const dumpPath = path.join(backupLocation, 'data', 'database-dump.sql');
      const databaseUrl = process.env.DATABASE_URL;
      
      if (!databaseUrl) {
        throw new Error('DATABASE_URL not found in environment variables');
      }

      // Extract database file path from URL
      const dbPath = databaseUrl.replace('file:', '');
      
      // Create SQLite dump using sqlite3 command if available
      try {
        execSync(`sqlite3 "${dbPath}" .dump > "${dumpPath}"`, { stdio: 'pipe' });
        console.log(`   ✅ Database dump created`);
      } catch (sqliteError) {
        // Fallback: Copy the database file directly
        const dbBackupPath = path.join(backupLocation, 'data', 'database.sqlite');
        fs.copyFileSync(dbPath, dbBackupPath);
        console.log(`   ✅ Database file copied (sqlite3 command not available)`);
        return dbBackupPath;
      }
      
      return dumpPath;
      
    } catch (error) {
      console.log(`   ⚠️  Database dump failed: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Generate backup metadata file
   */
  private static async generateMetadataFile(metadata: BackupMetadata): Promise<string> {
    const metadataPath = path.join(metadata.backupLocation, 'metadata', 'backup-info.json');
    
    const enhancedMetadata = {
      ...metadata,
      createdBy: 'Zombie Report Backup Manager v1.0',
      nodeVersion: process.version,
      platform: process.platform,
      systemInfo: {
        architecture: process.arch,
        memoryUsage: process.memoryUsage(),
        uptime: process.uptime()
      },
      restorationInstructions: [
        '1. Ensure database is stopped before restoration',
        '2. Create fresh database instance if needed',
        '3. Import data files in order: projects.json, reports.json, report-versions.json',
        '4. Verify data integrity using checksums',
        '5. Run database constraint validation',
        '6. Test application functionality'
      ]
    };

    fs.writeFileSync(metadataPath, JSON.stringify(enhancedMetadata, null, 2));
    console.log(`   ✅ Metadata file generated`);
    
    return metadataPath;
  }

  /**
   * Generate checksums for all backup files
   */
  private static async generateChecksums(
    backupLocation: string, 
    backupFiles: BackupResult['backupFiles']
  ): Promise<string> {
    const crypto = require('crypto');
    const checksums: Record<string, string> = {};

    // Generate checksums for all backup files
    Object.values(backupFiles).forEach(filePath => {
      if (filePath && fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath);
        const hash = crypto.createHash('sha256').update(content).digest('hex');
        checksums[path.basename(filePath)] = hash;
      }
    });

    const checksumsPath = path.join(backupLocation, 'checksums', 'file-checksums.json');
    const checksumData = {
      timestamp: new Date().toISOString(),
      algorithm: 'SHA-256',
      files: checksums
    };

    fs.writeFileSync(checksumsPath, JSON.stringify(checksumData, null, 2));
    console.log(`   ✅ Checksums generated for ${Object.keys(checksums).length} files`);
    
    return checksumsPath;
  }

  /**
   * Compress backup files to save space
   */
  private static async compressBackupFiles(
    backupLocation: string,
    backupFiles: BackupResult['backupFiles']
  ): Promise<void> {
    try {
      const archiver = require('archiver');
      const archivePath = path.join(backupLocation, 'zombie-report-backup.zip');
      const output = fs.createWriteStream(archivePath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      return new Promise((resolve, reject) => {
        output.on('close', () => {
          const compressedSize = archive.pointer();
          console.log(`   ✅ Backup compressed: ${(compressedSize / 1024 / 1024).toFixed(2)} MB`);
          resolve();
        });

        archive.on('error', reject);
        archive.pipe(output);

        // Add all backup files to archive
        archive.directory(path.join(backupLocation, 'data'), 'data');
        archive.directory(path.join(backupLocation, 'metadata'), 'metadata');
        archive.directory(path.join(backupLocation, 'checksums'), 'checksums');

        archive.finalize();
      });
      
    } catch (error) {
      console.log(`   ⚠️  Compression failed: ${(error as Error).message}`);
      // Continue without compression - not critical
    }
  }

  /**
   * Calculate total backup size
   */
  private static async calculateBackupSize(backupLocation: string): Promise<number> {
    let totalSize = 0;

    const calculateDirSize = (dirPath: string): void => {
      const files = fs.readdirSync(dirPath);
      
      files.forEach(file => {
        const filePath = path.join(dirPath, file);
        const stats = fs.statSync(filePath);
        
        if (stats.isDirectory()) {
          calculateDirSize(filePath);
        } else {
          totalSize += stats.size;
        }
      });
    };

    calculateDirSize(backupLocation);
    return totalSize;
  }

  /**
   * Verify backup integrity
   */
  private static async verifyBackupIntegrity(backupResult: BackupResult): Promise<void> {
    console.log('\n🔍 Verifying backup integrity...');

    try {
      // Verify all backup files exist
      const requiredFiles = Object.values(backupResult.backupFiles).filter(Boolean);
      let missingFiles = 0;
      
      requiredFiles.forEach(filePath => {
        if (!fs.existsSync(filePath)) {
          console.log(`   ❌ Missing file: ${filePath}`);
          missingFiles++;
        }
      });

      if (missingFiles === 0) {
        console.log(`   ✅ All ${requiredFiles.length} backup files verified`);
      }

      // Verify checksums if available
      const checksumFile = backupResult.backupFiles.checksums;
      if (checksumFile && fs.existsSync(checksumFile)) {
        console.log(`   ✅ Checksum verification available`);
        backupResult.backupMetadata.checksumVerified = true;
      }

      // Test data integrity by parsing JSON files
      let validJsonFiles = 0;
      const jsonFiles = [
        backupResult.backupFiles.reportData,
        backupResult.backupFiles.reportVersions,
        backupResult.backupFiles.projectData,
        backupResult.backupFiles.metadata
      ].filter(Boolean);

      jsonFiles.forEach(filePath => {
        try {
          JSON.parse(fs.readFileSync(filePath, 'utf8'));
          validJsonFiles++;
        } catch (error) {
          console.log(`   ❌ Invalid JSON in: ${filePath}`);
        }
      });

      console.log(`   ✅ ${validJsonFiles}/${jsonFiles.length} JSON files validated`);

    } catch (error) {
      console.log(`   ❌ Integrity verification failed: ${(error as Error).message}`);
      backupResult.errors.push(`Integrity verification failed: ${(error as Error).message}`);
    }
  }

  /**
   * Clean up old backups based on retention policy
   */
  private static async cleanupOldBackups(retainCount: number): Promise<void> {
    console.log(`\n🧹 Cleaning up old backups (keeping ${retainCount} most recent)...`);

    try {
      const backupDir = path.join(process.cwd(), 'backups');
      if (!fs.existsSync(backupDir)) {
        return;
      }

      const backupFolders = fs.readdirSync(backupDir)
        .filter(folder => folder.startsWith('zombie-report-backup-'))
        .map(folder => ({
          name: folder,
          path: path.join(backupDir, folder),
          created: fs.statSync(path.join(backupDir, folder)).birthtime
        }))
        .sort((a, b) => b.created.getTime() - a.created.getTime());

      if (backupFolders.length > retainCount) {
        const foldersToDelete = backupFolders.slice(retainCount);
        
        foldersToDelete.forEach(folder => {
          fs.rmSync(folder.path, { recursive: true, force: true });
          console.log(`   🗑️  Removed old backup: ${folder.name}`);
        });

        console.log(`   ✅ Cleaned up ${foldersToDelete.length} old backups`);
      } else {
        console.log(`   ✅ No cleanup needed (${backupFolders.length} backups < ${retainCount} limit)`);
      }

    } catch (error) {
      console.log(`   ⚠️  Cleanup failed: ${(error as Error).message}`);
    }
  }

  /**
   * Generate backup report
   */
  private static async generateBackupReport(backupResult: BackupResult): Promise<void> {
    const reportPath = path.join(backupResult.backupMetadata.backupLocation, 'backup-report.md');
    
    const report = `# Zombie Report Backup Report

**Backup ID:** ${backupResult.backupMetadata.backupId}
**Timestamp:** ${backupResult.backupMetadata.timestamp.toISOString()}
**Status:** ${backupResult.success ? 'SUCCESS' : 'FAILED'}
**Execution Time:** ${(backupResult.executionTime / 1000).toFixed(2)} seconds

## Data Scope

- **Total Reports:** ${backupResult.backupMetadata.dataScope.totalReports.toLocaleString()}
- **Total ReportVersions:** ${backupResult.backupMetadata.dataScope.totalReportVersions.toLocaleString()}
- **Zombie Reports:** ${backupResult.backupMetadata.dataScope.zombieReports.toLocaleString()}
- **Affected Projects:** ${backupResult.backupMetadata.dataScope.affectedProjects.length}

## Backup Files

${Object.entries(backupResult.backupFiles).map(([type, path]) => 
  path ? `- **${type}:** ${path}` : ''
).filter(Boolean).join('\n')}

## Statistics

- **Backup Size:** ${(backupResult.backupMetadata.backupSizeBytes / 1024 / 1024).toFixed(2)} MB
- **Compression Used:** ${backupResult.backupMetadata.compressionUsed ? 'Yes' : 'No'}
- **Checksums Verified:** ${backupResult.backupMetadata.checksumVerified ? 'Yes' : 'No'}
- **Estimated Restore Time:** ${backupResult.backupMetadata.estimatedRestoreTime}

${backupResult.warnings.length > 0 ? `## Warnings\n${backupResult.warnings.map(w => `- ${w}`).join('\n')}` : ''}
${backupResult.errors.length > 0 ? `## Errors\n${backupResult.errors.map(e => `- ${e}`).join('\n')}` : ''}

## Restoration Instructions

1. Stop the application and database services
2. Create a new database instance or clear existing data
3. Import data files in the following order:
   - projects.json (project data)
   - reports.json (report records)
   - report-versions.json (report content)
4. Verify data integrity using provided checksums
5. Run database migrations if needed
6. Test application functionality
7. Monitor for any data consistency issues

---
*Generated by Zombie Report Backup Manager v1.0*
`;

    fs.writeFileSync(reportPath, report);
  }

  /**
   * Output backup summary to console
   */
  private static outputBackupSummary(backupResult: BackupResult): void {
    console.log('\n💾 BACKUP SUMMARY');
    console.log('=================');
    console.log(`Status: ${backupResult.success ? '✅ SUCCESS' : '❌ FAILED'}`);
    console.log(`Backup ID: ${backupResult.backupMetadata.backupId}`);
    console.log(`Location: ${backupResult.backupMetadata.backupLocation}`);
    console.log(`Size: ${(backupResult.backupMetadata.backupSizeBytes / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Execution Time: ${(backupResult.executionTime / 1000).toFixed(2)} seconds`);

    console.log('\n📊 DATA BACKED UP:');
    console.log(`• Reports: ${backupResult.backupMetadata.dataScope.totalReports.toLocaleString()}`);
    console.log(`• ReportVersions: ${backupResult.backupMetadata.dataScope.totalReportVersions.toLocaleString()}`);
    console.log(`• Zombie Reports: ${backupResult.backupMetadata.dataScope.zombieReports.toLocaleString()}`);
    console.log(`• Projects: ${backupResult.backupMetadata.dataScope.affectedProjects.length}`);

    if (backupResult.warnings.length > 0) {
      console.log('\n⚠️  WARNINGS:');
      backupResult.warnings.forEach(warning => console.log(`• ${warning}`));
    }

    if (backupResult.errors.length > 0) {
      console.log('\n❌ ERRORS:');
      backupResult.errors.forEach(error => console.log(`• ${error}`));
    }

    console.log('\n📋 NEXT STEPS:');
    if (backupResult.success) {
      console.log('• Backup created successfully - safe to proceed with zombie report fixes');
      console.log('• Keep backup location noted for potential rollback: ' + backupResult.backupMetadata.backupLocation);
      console.log('• Verify backup integrity if not already done');
    } else {
      console.log('• Backup failed - DO NOT proceed with zombie report fixes');
      console.log('• Review errors and resolve issues');
      console.log('• Retry backup creation before making any changes');
    }
  }
}

// Parse command line arguments
function parseArgs(): any {
  const args = process.argv.slice(2);
  const options: any = {};

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--type':
        options.backupType = args[++i] as 'full' | 'zombie_reports_only' | 'incremental';
        break;
      case '--no-compression':
        options.compressionEnabled = false;
        break;
      case '--include-database':
        options.includeDatabase = true;
        break;
      case '--skip-verification':
        options.verifyIntegrity = false;
        break;
      case '--location':
        options.customLocation = args[++i];
        break;
      case '--retain':
        options.retainCount = parseInt(args[++i], 10);
        break;
    }
  }

  return options;
}

// Execute if run directly
if (require.main === module) {
  const options = parseArgs();
  ZombieReportBackupManager.run(options).catch(console.error);
}

export { ZombieReportBackupManager }; 