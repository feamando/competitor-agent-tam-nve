#!/usr/bin/env node

/**
 * Zombie Report Identification Script
 * Task 6.1: Create migration script to identify all zombie reports system-wide
 * 
 * This script systematically identifies all zombie reports (reports marked as COMPLETED
 * but lacking ReportVersions with viewable content) across the entire system.
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

interface ZombieReport {
  id: string;
  name: string;
  status: string;
  projectId: string | null;
  projectName: string | null;
  competitorId: string | null;
  createdAt: Date;
  updatedAt: Date;
  isInitialReport: boolean;
  dataCompletenessScore: number | null;
  dataFreshness: string | null;
  versionCount: number;
  hasContent: boolean;
  reasonForZombieStatus: string[];
}

interface ZombieReportAnalysis {
  totalReports: number;
  completedReports: number;
  zombieReports: ZombieReport[];
  zombieCount: number;
  zombiePercentage: number;
  affectedProjects: string[];
  analysisTimestamp: Date;
  patterns: {
    byProjectId: Record<string, number>;
    byDateRange: Record<string, number>;
    byReportType: Record<string, number>;
    byDataFreshness: Record<string, number>;
  };
  recommendations: string[];
}

class ZombieReportIdentifier {
  
  /**
   * Main execution function
   */
  static async run(): Promise<void> {
    console.log('🧟 Starting Zombie Report Identification Script');
    console.log('================================================');
    console.log(`Timestamp: ${new Date().toISOString()}`);
    console.log();

    try {
      // Perform system-wide analysis
      const analysis = await this.performSystemWideAnalysis();
      
      // Generate detailed report
      await this.generateAnalysisReport(analysis);
      
      // Output summary to console
      this.outputConsoleSummary(analysis);
      
      console.log('\n✅ Zombie report identification completed successfully');
      console.log('📊 Check ./reports/zombie-report-analysis.json for detailed results');
      
    } catch (error) {
      console.error('❌ Failed to identify zombie reports:', error);
      process.exit(1);
    } finally {
      await prisma.$disconnect();
    }
  }

  /**
   * Perform comprehensive system-wide analysis
   */
  private static async performSystemWideAnalysis(): Promise<ZombieReportAnalysis> {
    console.log('🔍 Analyzing all reports in the system...');
    
    // Get all reports with their relationships
    const allReports = await prisma.report.findMany({
      include: {
        versions: {
          select: {
            id: true,
            version: true,
            content: true,
            createdAt: true
          }
        },
        project: {
          select: {
            id: true,
            name: true
          }
        },
        competitor: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    console.log(`📈 Found ${allReports.length} total reports`);

    // Filter for COMPLETED reports
    const completedReports = allReports.filter(report => report.status === 'COMPLETED');
    console.log(`✅ Found ${completedReports.length} COMPLETED reports`);

    // Identify zombie reports
    const zombieReports: ZombieReport[] = [];
    
    for (const report of completedReports) {
      const reasonsForZombieStatus: string[] = [];
      let isZombie = false;

      // Check if report has no versions
      if (report.versions.length === 0) {
        reasonsForZombieStatus.push('No ReportVersions exist');
        isZombie = true;
      } else {
        // Check if versions have no content
        const versionsWithContent = report.versions.filter(v => 
          v.content && v.content !== null && typeof v.content === 'object'
        );
        
        if (versionsWithContent.length === 0) {
          reasonsForZombieStatus.push('ReportVersions exist but have no valid content');
          isZombie = true;
        } else {
          // Check content quality
          const hasValidContent = versionsWithContent.some(v => {
            const content = v.content as any;
            return content && 
                   typeof content === 'object' && 
                   content.title && 
                   content.executiveSummary;
          });
          
          if (!hasValidContent) {
            reasonsForZombieStatus.push('ReportVersions exist but content is incomplete or malformed');
            isZombie = true;
          }
        }
      }

      // Additional checks for data integrity
      if (report.status === 'COMPLETED' && !report.dataCompletenessScore) {
        reasonsForZombieStatus.push('Missing data completeness score');
      }

      if (report.isInitialReport && !report.dataFreshness) {
        reasonsForZombieStatus.push('Initial report missing data freshness indicator');
      }

      if (isZombie) {
        zombieReports.push({
          id: report.id,
          name: report.name,
          status: report.status,
          projectId: report.projectId,
          projectName: report.project?.name || null,
          competitorId: report.competitorId,
          createdAt: report.createdAt,
          updatedAt: report.updatedAt,
          isInitialReport: report.isInitialReport,
          dataCompletenessScore: report.dataCompletenessScore,
          dataFreshness: report.dataFreshness,
          versionCount: report.versions.length,
          hasContent: report.versions.some(v => v.content && v.content !== null),
          reasonForZombieStatus: reasonsForZombieStatus
        });
      }
    }

    console.log(`🧟 Identified ${zombieReports.length} zombie reports`);

    // Analyze patterns
    const patterns = this.analyzeZombiePatterns(zombieReports);
    
    // Get affected projects
    const affectedProjects = [...new Set(
      zombieReports
        .map(r => r.projectId)
        .filter(Boolean) as string[]
    )];

    // Generate recommendations
    const recommendations = this.generateRecommendations(zombieReports);

    return {
      totalReports: allReports.length,
      completedReports: completedReports.length,
      zombieReports,
      zombieCount: zombieReports.length,
      zombiePercentage: completedReports.length > 0 ? 
        (zombieReports.length / completedReports.length) * 100 : 0,
      affectedProjects,
      analysisTimestamp: new Date(),
      patterns,
      recommendations
    };
  }

  /**
   * Analyze patterns in zombie reports
   */
  private static analyzeZombiePatterns(zombieReports: ZombieReport[]): ZombieReportAnalysis['patterns'] {
    const patterns: ZombieReportAnalysis['patterns'] = {
      byProjectId: {},
      byDateRange: {},
      byReportType: {},
      byDataFreshness: {}
    };

    zombieReports.forEach(report => {
      // By project
      const projectKey = report.projectId || 'NO_PROJECT';
      patterns.byProjectId[projectKey] = (patterns.byProjectId[projectKey] || 0) + 1;

      // By date range (last 7 days, 30 days, older)
      const daysSinceCreation = Math.floor(
        (Date.now() - report.createdAt.getTime()) / (1000 * 60 * 60 * 24)
      );
      
      let dateRange: string;
      if (daysSinceCreation <= 7) {
        dateRange = 'Last 7 days';
      } else if (daysSinceCreation <= 30) {
        dateRange = 'Last 30 days';
      } else if (daysSinceCreation <= 90) {
        dateRange = 'Last 90 days';
      } else {
        dateRange = 'Older than 90 days';
      }
      patterns.byDateRange[dateRange] = (patterns.byDateRange[dateRange] || 0) + 1;

      // By report type
      const reportType = report.isInitialReport ? 'Initial Report' : 'Regular Report';
      patterns.byReportType[reportType] = (patterns.byReportType[reportType] || 0) + 1;

      // By data freshness
      const freshness = report.dataFreshness || 'UNKNOWN';
      patterns.byDataFreshness[freshness] = (patterns.byDataFreshness[freshness] || 0) + 1;
    });

    return patterns;
  }

  /**
   * Generate recommendations based on analysis
   */
  private static generateRecommendations(zombieReports: ZombieReport[]): string[] {
    const recommendations: string[] = [];

    if (zombieReports.length === 0) {
      recommendations.push('✅ No zombie reports detected - system integrity maintained');
      return recommendations;
    }

    recommendations.push('🚨 IMMEDIATE ACTIONS REQUIRED:');
    recommendations.push(`• Fix ${zombieReports.length} zombie reports using the generate-report-versions script`);
    recommendations.push('• Implement database constraints to prevent future zombie reports');
    recommendations.push('• Add ReportVersion validation to report creation workflow');

    // Pattern-based recommendations
    const recentZombies = zombieReports.filter(r => {
      const daysSince = (Date.now() - r.createdAt.getTime()) / (1000 * 60 * 60 * 24);
      return daysSince <= 7;
    });

    if (recentZombies.length > 0) {
      recommendations.push(`⚠️ ${recentZombies.length} zombie reports created in last 7 days - investigate recent system changes`);
    }

    const initialReportZombies = zombieReports.filter(r => r.isInitialReport);
    if (initialReportZombies.length > 0) {
      recommendations.push(`📊 ${initialReportZombies.length} zombie reports are initial reports - check InitialComparativeReportService`);
    }

    const noVersionZombies = zombieReports.filter(r => r.versionCount === 0);
    if (noVersionZombies.length > 0) {
      recommendations.push(`🔧 ${noVersionZombies.length} reports have no versions at all - critical database integrity issue`);
    }

    recommendations.push('');
    recommendations.push('📋 NEXT STEPS:');
    recommendations.push('1. Run scripts/generate-report-versions.ts to fix existing zombie reports');
    recommendations.push('2. Run scripts/add-database-constraints.ts to prevent future issues');
    recommendations.push('3. Deploy enhanced error monitoring and validation');
    recommendations.push('4. Monitor the system for 48 hours to ensure no new zombie reports appear');

    return recommendations;
  }

  /**
   * Generate detailed analysis report file
   */
  private static async generateAnalysisReport(analysis: ZombieReportAnalysis): Promise<void> {
    // Ensure reports directory exists
    const reportsDir = path.join(process.cwd(), 'reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    // Generate JSON report
    const jsonReportPath = path.join(reportsDir, 'zombie-report-analysis.json');
    fs.writeFileSync(jsonReportPath, JSON.stringify(analysis, null, 2));

    // Generate human-readable report
    const humanReportPath = path.join(reportsDir, 'zombie-report-analysis.md');
    const markdownReport = this.generateMarkdownReport(analysis);
    fs.writeFileSync(humanReportPath, markdownReport);

    // Generate CSV for zombie reports
    if (analysis.zombieReports.length > 0) {
      const csvReportPath = path.join(reportsDir, 'zombie-reports.csv');
      const csvReport = this.generateCSVReport(analysis.zombieReports);
      fs.writeFileSync(csvReportPath, csvReport);
    }

    console.log('📄 Generated analysis reports:');
    console.log(`   • JSON: ${jsonReportPath}`);
    console.log(`   • Markdown: ${humanReportPath}`);
    if (analysis.zombieReports.length > 0) {
      console.log(`   • CSV: ${path.join(reportsDir, 'zombie-reports.csv')}`);
    }
  }

  /**
   * Generate markdown report
   */
  private static generateMarkdownReport(analysis: ZombieReportAnalysis): string {
    const report = `# Zombie Report Analysis Report

**Analysis Timestamp:** ${analysis.analysisTimestamp.toISOString()}

## Executive Summary

- **Total Reports:** ${analysis.totalReports.toLocaleString()}
- **Completed Reports:** ${analysis.completedReports.toLocaleString()}
- **Zombie Reports Found:** ${analysis.zombieCount.toLocaleString()}
- **Zombie Rate:** ${analysis.zombiePercentage.toFixed(2)}%
- **Affected Projects:** ${analysis.affectedProjects.length}

${analysis.zombieCount === 0 ? '✅ **STATUS: HEALTHY** - No zombie reports detected' : '🚨 **STATUS: CRITICAL** - Zombie reports require immediate attention'}

## Zombie Reports Breakdown

${analysis.zombieReports.length === 0 ? 'No zombie reports found.' : `
### By Project
${Object.entries(analysis.patterns.byProjectId)
  .map(([project, count]) => `- **${project}:** ${count} zombie reports`)
  .join('\n')}

### By Time Period
${Object.entries(analysis.patterns.byDateRange)
  .map(([period, count]) => `- **${period}:** ${count} zombie reports`)
  .join('\n')}

### By Report Type
${Object.entries(analysis.patterns.byReportType)
  .map(([type, count]) => `- **${type}:** ${count} zombie reports`)
  .join('\n')}

### By Data Freshness
${Object.entries(analysis.patterns.byDataFreshness)
  .map(([freshness, count]) => `- **${freshness}:** ${count} zombie reports`)
  .join('\n')}
`}

## Detailed Zombie Reports

${analysis.zombieReports.length === 0 ? 'None found.' : analysis.zombieReports.map(report => `
### ${report.name} (ID: ${report.id})
- **Project:** ${report.projectName || 'Unknown'} (${report.projectId})
- **Created:** ${report.createdAt.toISOString()}
- **Version Count:** ${report.versionCount}
- **Has Content:** ${report.hasContent ? 'Yes' : 'No'}
- **Initial Report:** ${report.isInitialReport ? 'Yes' : 'No'}
- **Data Completeness:** ${report.dataCompletenessScore || 'N/A'}%
- **Data Freshness:** ${report.dataFreshness || 'N/A'}
- **Reasons for Zombie Status:**
${report.reasonForZombieStatus.map(reason => `  - ${reason}`).join('\n')}
`).join('\n')}

## Recommendations

${analysis.recommendations.join('\n')}

---
*Report generated by Zombie Report Identification Script v1.0*
`;

    return report;
  }

  /**
   * Generate CSV report for zombie reports
   */
  private static generateCSVReport(zombieReports: ZombieReport[]): string {
    const headers = [
      'Report ID', 'Report Name', 'Project ID', 'Project Name', 'Created Date',
      'Version Count', 'Has Content', 'Initial Report', 'Data Completeness Score',
      'Data Freshness', 'Zombie Reasons'
    ];

    const rows = zombieReports.map(report => [
      report.id,
      `"${report.name.replace(/"/g, '""')}"`, // Escape quotes in CSV
      report.projectId || '',
      `"${(report.projectName || '').replace(/"/g, '""')}"`,
      report.createdAt.toISOString(),
      report.versionCount.toString(),
      report.hasContent.toString(),
      report.isInitialReport.toString(),
      (report.dataCompletenessScore || '').toString(),
      report.dataFreshness || '',
      `"${report.reasonForZombieStatus.join('; ').replace(/"/g, '""')}"`
    ]);

    return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
  }

  /**
   * Output summary to console
   */
  private static outputConsoleSummary(analysis: ZombieReportAnalysis): void {
    console.log('\n📊 ZOMBIE REPORT ANALYSIS SUMMARY');
    console.log('=====================================');
    console.log(`Total Reports: ${analysis.totalReports.toLocaleString()}`);
    console.log(`Completed Reports: ${analysis.completedReports.toLocaleString()}`);
    console.log(`Zombie Reports: ${analysis.zombieCount.toLocaleString()}`);
    console.log(`Zombie Rate: ${analysis.zombiePercentage.toFixed(2)}%`);
    console.log(`Affected Projects: ${analysis.affectedProjects.length}`);

    if (analysis.zombieCount > 0) {
      console.log('\n🚨 CRITICAL ISSUES FOUND:');
      analysis.zombieReports.slice(0, 5).forEach((report, index) => {
        console.log(`${index + 1}. ${report.name} (${report.id})`);
        console.log(`   Project: ${report.projectName || 'Unknown'}`);
        console.log(`   Issues: ${report.reasonForZombieStatus.join(', ')}`);
        console.log();
      });

      if (analysis.zombieReports.length > 5) {
        console.log(`... and ${analysis.zombieReports.length - 5} more zombie reports`);
      }
    } else {
      console.log('\n✅ No zombie reports found - system is healthy!');
    }
  }
}

// Execute if run directly
if (require.main === module) {
  ZombieReportIdentifier.run().catch(console.error);
}

export { ZombieReportIdentifier }; 