#!/usr/bin/env node

/**
 * Generate ReportVersions for Zombie Reports Script
 * Task 6.2: Create script to generate ReportVersions for existing zombie reports
 * 
 * This script identifies zombie reports and creates proper ReportVersions with
 * emergency content to make them viewable and accessible to users.
 */

import { PrismaClient } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

interface ZombieReportFix {
  reportId: string;
  reportName: string;
  projectId: string | null;
  projectName: string | null;
  originalStatus: string;
  fixApplied: boolean;
  versionCreated: string | null;
  errorMessage: string | null;
  emergencyContentType: 'full' | 'minimal' | 'metadata_only';
}

interface FixResult {
  totalZombieReports: number;
  successfulFixes: number;
  failedFixes: number;
  skippedReports: number;
  fixes: ZombieReportFix[];
  executionTimestamp: Date;
  backupCreated: boolean;
  backupLocation?: string;
}

class ZombieReportFixer {
  
  /**
   * Main execution function
   */
  static async run(options: {
    dryRun?: boolean;
    createBackup?: boolean;
    forceRun?: boolean;
    specificReportId?: string;
  } = {}): Promise<void> {
    console.log('🔧 Starting Zombie Report Fix Script');
    console.log('=====================================');
    console.log(`Timestamp: ${new Date().toISOString()}`);
    console.log(`Dry Run: ${options.dryRun ? 'YES' : 'NO'}`);
    console.log(`Create Backup: ${options.createBackup !== false ? 'YES' : 'NO'}`);
    console.log();

    try {
      // Create backup if requested
      let backupLocation: string | undefined;
      if (options.createBackup !== false && !options.dryRun) {
        backupLocation = await this.createBackup();
        console.log(`✅ Backup created: ${backupLocation}`);
      }

      // Identify zombie reports
      const zombieReports = await this.identifyZombieReports(options.specificReportId);
      
      if (zombieReports.length === 0) {
        console.log('✅ No zombie reports found - system is healthy!');
        return;
      }

      console.log(`🧟 Found ${zombieReports.length} zombie reports to fix`);

      // Confirm before proceeding (unless forced)
      if (!options.forceRun && !options.dryRun) {
        const confirmed = await this.confirmExecution(zombieReports.length);
        if (!confirmed) {
          console.log('❌ Operation cancelled by user');
          return;
        }
      }

      // Fix zombie reports
      const fixResult = await this.fixZombieReports(zombieReports, options.dryRun || false);
      fixResult.backupCreated = !!backupLocation;
      if (backupLocation) {
        fixResult.backupLocation = backupLocation;
      }

      // Generate fix report
      await this.generateFixReport(fixResult);

      // Output summary
      this.outputFixSummary(fixResult);

    } catch (error) {
      console.error('❌ Failed to fix zombie reports:', error);
      process.exit(1);
    } finally {
      await prisma.$disconnect();
    }
  }

  /**
   * Identify zombie reports in the system
   */
  private static async identifyZombieReports(specificReportId?: string): Promise<any[]> {
    console.log('🔍 Identifying zombie reports...');

    const whereClause: any = {
      status: 'COMPLETED',
      versions: { none: {} }
    };

    if (specificReportId) {
      whereClause.id = specificReportId;
    }

    const zombieReports = await prisma.report.findMany({
      where: whereClause,
      include: {
        project: {
          select: { id: true, name: true }
        },
        competitor: {
          select: { id: true, name: true }
        },
        versions: true
      },
      orderBy: { createdAt: 'desc' }
    });

    return zombieReports;
  }

  /**
   * Fix zombie reports by creating ReportVersions
   */
  private static async fixZombieReports(zombieReports: any[], dryRun: boolean): Promise<FixResult> {
    const fixes: ZombieReportFix[] = [];
    let successfulFixes = 0;
    let failedFixes = 0;
    let skippedReports = 0;

    console.log(`${dryRun ? '🔍 [DRY RUN]' : '🔧'} Processing ${zombieReports.length} zombie reports...`);

    for (const [index, report] of zombieReports.entries()) {
      console.log(`\n[${index + 1}/${zombieReports.length}] Processing: ${report.name} (${report.id})`);

      const fix: ZombieReportFix = {
        reportId: report.id,
        reportName: report.name,
        projectId: report.projectId,
        projectName: report.project?.name || null,
        originalStatus: report.status,
        fixApplied: false,
        versionCreated: null,
        errorMessage: null,
        emergencyContentType: 'minimal'
      };

      try {
        // Verify it's actually a zombie report
        if (report.versions.length > 0) {
          console.log('  ⚠️ Skipping - Report already has versions');
          fix.errorMessage = 'Report already has versions';
          skippedReports++;
        } else {
          // Generate emergency content
          const emergencyContent = await this.generateEmergencyContent(report);
          fix.emergencyContentType = emergencyContent.type;

          if (!dryRun) {
            // Create ReportVersion using transaction
            const versionId = await prisma.$transaction(async (tx) => {
              // Double-check the report still exists and has no versions
              const currentReport = await tx.report.findUnique({
                where: { id: report.id },
                include: { versions: true }
              });

              if (!currentReport) {
                throw new Error('Report no longer exists');
              }

              if (currentReport.versions.length > 0) {
                throw new Error('Report now has versions - skipping to avoid duplication');
              }

              // Create the ReportVersion
              const version = await tx.reportVersion.create({
                data: {
                  reportId: report.id,
                  version: 1,
                  content: emergencyContent.content
                }
              });

              return version.id;
            });

            fix.versionCreated = versionId;
            fix.fixApplied = true;
            successfulFixes++;
            console.log(`  ✅ Created ReportVersion: ${versionId}`);
          } else {
            fix.fixApplied = true; // Would be applied in real run
            successfulFixes++;
            console.log(`  ✅ [DRY RUN] Would create ReportVersion with ${emergencyContent.type} content`);
          }
        }
      } catch (error) {
        fix.errorMessage = (error as Error).message;
        failedFixes++;
        console.log(`  ❌ Failed: ${(error as Error).message}`);
      }

      fixes.push(fix);
    }

    return {
      totalZombieReports: zombieReports.length,
      successfulFixes,
      failedFixes,
      skippedReports,
      fixes,
      executionTimestamp: new Date(),
      backupCreated: false
    };
  }

  /**
   * Generate emergency content for zombie report
   */
  private static async generateEmergencyContent(report: any): Promise<{
    content: any;
    type: 'full' | 'minimal' | 'metadata_only';
  }> {
    // Determine content complexity based on available data
    const hasProject = report.project;
    const hasCompetitor = report.competitor;
    const hasMetadata = report.dataCompletenessScore || report.dataFreshness;

    let contentType: 'full' | 'minimal' | 'metadata_only';
    let content: any;

    if (hasProject && hasMetadata) {
      // Generate full emergency content
      contentType = 'full';
      content = this.generateFullEmergencyContent(report);
    } else if (hasProject) {
      // Generate minimal content
      contentType = 'minimal';
      content = this.generateMinimalEmergencyContent(report);
    } else {
      // Generate metadata-only content
      contentType = 'metadata_only';
      content = this.generateMetadataOnlyContent(report);
    }

    return { content, type: contentType };
  }

  /**
   * Generate full emergency content with comprehensive structure
   */
  private static generateFullEmergencyContent(report: any): any {
    const projectName = report.project?.name || 'Unknown Project';
    const competitorName = report.competitor?.name || 'Unknown Competitor';
    const createdDate = new Date(report.createdAt).toLocaleDateString();

    return {
      id: report.id,
      title: `${report.name} - Recovery Version`,
      projectId: report.projectId,
      productId: report.projectId, // Emergency reports use projectId as productId
      executiveSummary: `
# Emergency Recovery Report: ${projectName}

**Report Status:** This report was automatically recovered from a zombie state where the report was marked as completed but lacked viewable content.

**Original Creation Date:** ${createdDate}
**Recovery Date:** ${new Date().toLocaleDateString()}
**Project:** ${projectName}
**Competitor Analysis:** ${competitorName}

## Recovery Summary

This report has been automatically restored with emergency content to ensure accessibility. While this recovery version provides basic structure and metadata, it may not contain the full analysis that was originally intended.

**Data Quality Indicators:**
- Data Completeness Score: ${report.dataCompletenessScore || 'Not Available'}%
- Data Freshness: ${report.dataFreshness || 'Unknown'}
- Report Type: ${report.isInitialReport ? 'Initial Report' : 'Standard Report'}

## What This Means

The original report generation process encountered an issue that prevented proper content creation. This recovery version ensures the report remains accessible in your dashboard while maintaining data integrity.
      `.trim(),
      
      keyFindings: [
        'Report was recovered from zombie state (completed but inaccessible)',
        'Original report generation encountered technical difficulties',
        'Emergency content generated to restore accessibility',
        'Full analysis data may need to be regenerated',
        `Report originally created on ${createdDate}`,
        'System integrity maintained through automated recovery'
      ],
      
      strategicRecommendations: {
        immediate: [
          'Review system logs for original report generation issues',
          'Consider regenerating this report for complete analysis',
          'Verify other reports from the same time period'
        ],
        shortTerm: [
          'Implement enhanced monitoring to prevent future zombie reports',
          'Review report generation pipeline for failure points',
          'Update error handling in report creation process'
        ],
        longTerm: [
          'Establish automated zombie report detection and recovery',
          'Implement comprehensive report integrity validation',
          'Enhance system reliability and error recovery mechanisms'
        ],
        priorityScore: 75
      },
      
      competitiveIntelligence: {
        marketPosition: 'Analysis unavailable due to recovery process',
        keyThreats: [
          'Incomplete competitive analysis due to technical issues',
          'Data gaps affecting market positioning insights'
        ],
        opportunities: [
          'Opportunity to improve system reliability',
          'Enhanced monitoring can prevent future issues',
          'Automated recovery ensures business continuity'
        ],
        competitiveAdvantages: [
          'Automated zombie report recovery system',
          'Data integrity maintenance during technical issues',
          'Transparent reporting of system limitations'
        ]
      },
      
      status: 'completed',
      format: 'markdown',
      emergency: true,
      recoveryVersion: true,
      originalCreatedAt: report.createdAt,
      recoveredAt: new Date(),
      
      metadata: {
        productName: projectName,
        productUrl: '',
        competitorCount: 1,
        analysisDate: new Date(),
        reportGeneratedAt: new Date(),
        analysisId: createId(),
        analysisMethod: 'emergency_recovery',
        confidenceScore: 25, // Low confidence for recovery content
        dataQuality: {
          completeness: report.dataCompletenessScore || 0,
          freshness: report.dataFreshness || 'unknown',
          reliability: 'low'
        },
        reportVersion: '1.0-recovery',
        focusAreas: ['system_recovery', 'data_integrity'],
        analysisDepth: 'emergency'
      }
    };
  }

  /**
   * Generate minimal emergency content
   */
  private static generateMinimalEmergencyContent(report: any): any {
    const projectName = report.project?.name || 'Unknown Project';

    return {
      id: report.id,
      title: `${report.name} - Emergency Recovery`,
      projectId: report.projectId,
      productId: report.projectId,
      executiveSummary: `Emergency recovery content for ${projectName}. Original report data unavailable.`,
      keyFindings: [
        'Report recovered from inaccessible state',
        'Original analysis data not available',
        'Emergency content provided for accessibility'
      ],
      strategicRecommendations: {
        immediate: ['Regenerate this report for complete analysis'],
        shortTerm: ['Review system stability'],
        longTerm: ['Implement better error handling'],
        priorityScore: 50
      },
      competitiveIntelligence: {
        marketPosition: 'Data unavailable - emergency recovery',
        keyThreats: ['Incomplete analysis'],
        opportunities: ['System improvement opportunity'],
        competitiveAdvantages: ['Automated recovery capability']
      },
      status: 'completed',
      format: 'markdown',
      emergency: true,
      recoveryVersion: true,
      metadata: {
        productName: projectName,
        analysisMethod: 'emergency_recovery',
        confidenceScore: 10,
        dataQuality: 'emergency',
        reportVersion: '1.0-minimal-recovery'
      }
    };
  }

  /**
   * Generate metadata-only content
   */
  private static generateMetadataOnlyContent(report: any): any {
    return {
      id: report.id,
      title: `${report.name} - Data Recovery`,
      projectId: report.projectId,
      productId: report.projectId,
      executiveSummary: 'Report recovered with minimal data availability.',
      keyFindings: ['Report data recovered from zombie state'],
      strategicRecommendations: {
        immediate: ['Regenerate report with current data'],
        shortTerm: ['Investigate original failure'],
        longTerm: ['Improve system resilience'],
        priorityScore: 25
      },
      competitiveIntelligence: {
        marketPosition: 'Data not available',
        keyThreats: [],
        opportunities: [],
        competitiveAdvantages: []
      },
      status: 'completed',
      format: 'markdown',
      emergency: true,
      recoveryVersion: true,
      metadata: {
        analysisMethod: 'metadata_recovery',
        confidenceScore: 5,
        reportVersion: '1.0-metadata-recovery'
      }
    };
  }

  /**
   * Create backup before making changes
   */
  private static async createBackup(): Promise<string> {
    console.log('💾 Creating backup...');
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(process.cwd(), 'backups', `zombie-report-fix-${timestamp}`);
    
    // Create backup directory
    fs.mkdirSync(backupDir, { recursive: true });

    // Export zombie reports data
    const zombieReports = await prisma.report.findMany({
      where: {
        status: 'COMPLETED',
        versions: { none: {} }
      },
      include: {
        project: true,
        competitor: true,
        versions: true
      }
    });

    // Save backup data
    const backupData = {
      timestamp: new Date().toISOString(),
      zombieReportsCount: zombieReports.length,
      reports: zombieReports
    };

    const backupFile = path.join(backupDir, 'zombie-reports-backup.json');
    fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2));

    return backupDir;
  }

  /**
   * Confirm execution with user
   */
  private static async confirmExecution(reportCount: number): Promise<boolean> {
    // In a real implementation, you might use readline for interactive confirmation
    // For now, we'll assume confirmation in non-interactive environments
    console.log(`⚠️  About to fix ${reportCount} zombie reports.`);
    console.log('This will create ReportVersions to make these reports viewable.');
    console.log('Proceeding automatically...');
    return true;
  }

  /**
   * Generate fix report
   */
  private static async generateFixReport(fixResult: FixResult): Promise<void> {
    const reportsDir = path.join(process.cwd(), 'reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    // Generate detailed JSON report
    const reportPath = path.join(reportsDir, 'zombie-report-fix-results.json');
    fs.writeFileSync(reportPath, JSON.stringify(fixResult, null, 2));

    // Generate summary markdown
    const summaryPath = path.join(reportsDir, 'zombie-report-fix-summary.md');
    const summary = this.generateMarkdownSummary(fixResult);
    fs.writeFileSync(summaryPath, summary);

    console.log(`\n📄 Fix reports generated:`);
    console.log(`   • Detailed: ${reportPath}`);
    console.log(`   • Summary: ${summaryPath}`);
  }

  /**
   * Generate markdown summary
   */
  private static generateMarkdownSummary(fixResult: FixResult): string {
    return `# Zombie Report Fix Summary

**Execution Timestamp:** ${fixResult.executionTimestamp.toISOString()}
**Backup Created:** ${fixResult.backupCreated ? 'Yes' : 'No'}
${fixResult.backupLocation ? `**Backup Location:** ${fixResult.backupLocation}` : ''}

## Results Overview

- **Total Zombie Reports:** ${fixResult.totalZombieReports}
- **Successfully Fixed:** ${fixResult.successfulFixes}
- **Failed Fixes:** ${fixResult.failedFixes}
- **Skipped Reports:** ${fixResult.skippedReports}
- **Success Rate:** ${fixResult.totalZombieReports > 0 ? ((fixResult.successfulFixes / fixResult.totalZombieReports) * 100).toFixed(1) : '0'}%

## Fix Details

${fixResult.fixes.map(fix => `
### ${fix.reportName} (${fix.reportId})
- **Project:** ${fix.projectName || 'Unknown'}
- **Original Status:** ${fix.originalStatus}
- **Fix Applied:** ${fix.fixApplied ? 'Yes' : 'No'}
- **Version Created:** ${fix.versionCreated || 'N/A'}
- **Content Type:** ${fix.emergencyContentType}
${fix.errorMessage ? `- **Error:** ${fix.errorMessage}` : ''}
`).join('\n')}

## Recommendations

${fixResult.successfulFixes > 0 ? '✅ Successfully fixed zombie reports are now viewable by users.' : ''}
${fixResult.failedFixes > 0 ? '⚠️ Review failed fixes and address underlying issues.' : ''}
${fixResult.skippedReports > 0 ? '📝 Skipped reports may need manual review.' : ''}

---
*Generated by Zombie Report Fix Script v1.0*
`;
  }

  /**
   * Output fix summary to console
   */
  private static outputFixSummary(fixResult: FixResult): void {
    console.log('\n🎯 ZOMBIE REPORT FIX SUMMARY');
    console.log('================================');
    console.log(`Total Zombie Reports: ${fixResult.totalZombieReports}`);
    console.log(`Successfully Fixed: ${fixResult.successfulFixes}`);
    console.log(`Failed Fixes: ${fixResult.failedFixes}`);
    console.log(`Skipped Reports: ${fixResult.skippedReports}`);
    console.log(`Success Rate: ${fixResult.totalZombieReports > 0 ? ((fixResult.successfulFixes / fixResult.totalZombieReports) * 100).toFixed(1) : '0'}%`);

    if (fixResult.successfulFixes > 0) {
      console.log('\n✅ SUCCESSFUL FIXES:');
      fixResult.fixes
        .filter(f => f.fixApplied && !f.errorMessage)
        .slice(0, 5)
        .forEach(fix => {
          console.log(`   • ${fix.reportName} (${fix.emergencyContentType} content)`);
        });
    }

    if (fixResult.failedFixes > 0) {
      console.log('\n❌ FAILED FIXES:');
      fixResult.fixes
        .filter(f => f.errorMessage)
        .slice(0, 3)
        .forEach(fix => {
          console.log(`   • ${fix.reportName}: ${fix.errorMessage}`);
        });
    }

    console.log('\n📋 NEXT STEPS:');
    if (fixResult.successfulFixes > 0) {
      console.log('• Fixed reports are now viewable in the dashboard');
      console.log('• Users can access previously inaccessible reports');
    }
    if (fixResult.failedFixes > 0) {
      console.log('• Investigate and manually fix failed reports');
      console.log('• Check system logs for underlying issues');
    }
    console.log('• Run zombie report detection to verify system health');
    console.log('• Monitor for new zombie reports over next 48 hours');
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
      case '--no-backup':
        options.createBackup = false;
        break;
      case '--force':
        options.forceRun = true;
        break;
      case '--report-id':
        options.specificReportId = args[++i];
        break;
    }
  }

  return options;
}

// Execute if run directly
if (require.main === module) {
  const options = parseArgs();
  ZombieReportFixer.run(options).catch(console.error);
}

export { ZombieReportFixer }; 