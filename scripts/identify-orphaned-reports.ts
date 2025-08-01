#!/usr/bin/env node

/**
 * Identify Orphaned Reports Script - Task 4.2
 * 
 * This diagnostic script identifies all reports with null projectId in the database
 * and provides detailed analysis of the orphaned reports problem scope.
 * 
 * Key Functions:
 * - Identify all reports with null projectId
 * - Analyze patterns in orphaned reports
 * - Generate comprehensive diagnostic report
 * - Provide insights for migration planning
 * 
 * Usage: npm run identify:orphaned-reports
 */

import { PrismaClient } from '@prisma/client';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { logger, generateCorrelationId } from '../src/lib/logger';

interface OrphanedReportAnalysis {
  id: string;
  name: string;
  competitorId: string | null;
  competitorName?: string | undefined;
  createdAt: Date;
  updatedAt: Date;
  status: string;
  reportType: string;
  title?: string | undefined;
  hasVersions: boolean;
  hasSchedules: boolean;
  daysSinceCreated: number;
}

interface CompetitorAnalysis {
  competitorId: string;
  competitorName: string;
  orphanedReportsCount: number;
  associatedProjectsCount: number;
  hasActiveProjects: boolean;
  potentialResolution: 'high' | 'medium' | 'low' | 'none';
}

interface DiagnosticReport {
  totalReports: number;
  orphanedReports: number;
  orphanedPercentage: number;
  analysisTimestamp: string;
  correlationId: string;
  breakdown: {
    byStatus: Record<string, number>;
    byReportType: Record<string, number>;
    byCompetitor: CompetitorAnalysis[];
    byAge: {
      last7Days: number;
      last30Days: number;
      last90Days: number;
      older: number;
    };
    withVersions: number;
    withSchedules: number;
    withoutCompetitor: number;
  };
  orphanedReportsList: OrphanedReportAnalysis[];
  recommendations: string[];
  migrationComplexity: 'low' | 'medium' | 'high';
  estimatedResolutionRate: number;
}

class OrphanedReportsIdentifier {
  private prisma: PrismaClient;
  private correlationId: string;

  constructor() {
    this.prisma = new PrismaClient();
    this.correlationId = generateCorrelationId();
  }

  /**
   * Task 4.2: Main identification function - identifies all reports with null projectId
   */
  async identifyOrphanedReports(): Promise<OrphanedReportAnalysis[]> {
    logger.info('Task 4.2: Starting identification of orphaned reports', {
      correlationId: this.correlationId,
      operation: 'identify_orphaned_reports'
    });

    try {
      // Get all reports with null projectId along with related data
      const orphanedReports = await this.prisma.report.findMany({
        where: {
          projectId: null
        },
        select: {
          id: true,
          name: true,
          title: true,
          competitorId: true,
          createdAt: true,
          updatedAt: true,
          status: true,
          reportType: true,
          competitor: {
            select: {
              name: true
            }
          },
          versions: {
            select: {
              id: true
            }
          },
          schedules: {
            select: {
              id: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      // Process and enrich the data
      const analysisData: OrphanedReportAnalysis[] = orphanedReports.map(report => {
        const daysSinceCreated = Math.floor(
          (Date.now() - new Date(report.createdAt).getTime()) / (1000 * 60 * 60 * 24)
        );

        return {
          id: report.id,
          name: report.name,
          title: report.title || undefined,
          competitorId: report.competitorId,
          competitorName: report.competitor?.name,
          createdAt: report.createdAt,
          updatedAt: report.updatedAt,
          status: report.status,
          reportType: report.reportType,
          hasVersions: report.versions.length > 0,
          hasSchedules: report.schedules.length > 0,
          daysSinceCreated
        };
      });

      logger.info('Task 4.2: Orphaned reports identification completed', {
        correlationId: this.correlationId,
        totalOrphanedReports: analysisData.length,
        operation: 'identify_orphaned_reports'
      });

      return analysisData;
    } catch (error) {
      logger.error('Task 4.2: Failed to identify orphaned reports', error as Error, {
        correlationId: this.correlationId,
        operation: 'identify_orphaned_reports'
      });
      throw error;
    }
  }

  /**
   * Analyze competitor patterns in orphaned reports
   */
  async analyzeCompetitorPatterns(orphanedReports: OrphanedReportAnalysis[]): Promise<CompetitorAnalysis[]> {
    logger.info('Analyzing competitor patterns in orphaned reports', {
      correlationId: this.correlationId,
      operation: 'analyze_competitor_patterns'
    });

    // Group orphaned reports by competitor
    const competitorGroups = new Map<string, OrphanedReportAnalysis[]>();
    const competitorsWithoutReports = new Set<string>();

    orphanedReports.forEach(report => {
      if (report.competitorId) {
        if (!competitorGroups.has(report.competitorId)) {
          competitorGroups.set(report.competitorId, []);
        }
        competitorGroups.get(report.competitorId)!.push(report);
      }
    });

    // Analyze each competitor
    const competitorAnalyses: CompetitorAnalysis[] = [];

    for (const [competitorId, reports] of competitorGroups) {
      try {
        // Get competitor's project associations
        const competitorProjects = await this.prisma.project.findMany({
          where: {
            competitors: {
              some: {
                id: competitorId
              }
            }
          },
          select: {
            id: true,
            status: true,
            name: true
          }
        });

        const hasActiveProjects = competitorProjects.some(p => p.status === 'ACTIVE');
        const competitorName = reports[0]?.competitorName || 'Unknown Competitor';

        // Determine potential resolution confidence
        let potentialResolution: 'high' | 'medium' | 'low' | 'none' = 'none';
        if (competitorProjects.length === 1) {
          potentialResolution = 'high';
        } else if (competitorProjects.length > 1 && hasActiveProjects) {
          potentialResolution = 'medium';
        } else if (competitorProjects.length > 0) {
          potentialResolution = 'low';
        }

        competitorAnalyses.push({
          competitorId,
          competitorName,
          orphanedReportsCount: reports.length,
          associatedProjectsCount: competitorProjects.length,
          hasActiveProjects,
          potentialResolution
        });

      } catch (error) {
        logger.warn('Failed to analyze competitor', {
          correlationId: this.correlationId,
          competitorId,
          error: (error as Error).message
        });

        competitorAnalyses.push({
          competitorId,
          competitorName: 'Analysis Failed',
          orphanedReportsCount: reports.length,
          associatedProjectsCount: 0,
          hasActiveProjects: false,
          potentialResolution: 'none'
        });
      }
    }

    return competitorAnalyses.sort((a, b) => b.orphanedReportsCount - a.orphanedReportsCount);
  }

  /**
   * Generate comprehensive diagnostic report
   */
  async generateDiagnosticReport(orphanedReports: OrphanedReportAnalysis[]): Promise<DiagnosticReport> {
    logger.info('Generating comprehensive diagnostic report', {
      correlationId: this.correlationId,
      operation: 'generate_diagnostic_report'
    });

    // Get total reports count for percentage calculation
    const totalReportsCount = await this.prisma.report.count();

    // Analyze competitor patterns
    const competitorAnalyses = await this.analyzeCompetitorPatterns(orphanedReports);

    // Calculate breakdown statistics
    const byStatus: Record<string, number> = {};
    const byReportType: Record<string, number> = {};
    let withVersions = 0;
    let withSchedules = 0;
    let withoutCompetitor = 0;

    const now = Date.now();
    const byAge = {
      last7Days: 0,
      last30Days: 0,
      last90Days: 0,
      older: 0
    };

    orphanedReports.forEach(report => {
      // Status breakdown
      byStatus[report.status] = (byStatus[report.status] || 0) + 1;

      // Report type breakdown
      byReportType[report.reportType] = (byReportType[report.reportType] || 0) + 1;

      // Feature analysis
      if (report.hasVersions) withVersions++;
      if (report.hasSchedules) withSchedules++;
      if (!report.competitorId) withoutCompetitor++;

      // Age analysis
      const daysSince = report.daysSinceCreated;
      if (daysSince <= 7) {
        byAge.last7Days++;
      } else if (daysSince <= 30) {
        byAge.last30Days++;
      } else if (daysSince <= 90) {
        byAge.last90Days++;
      } else {
        byAge.older++;
      }
    });

    // Calculate migration complexity and estimated resolution rate
    const highConfidenceReports = competitorAnalyses
      .filter(c => c.potentialResolution === 'high')
      .reduce((sum, c) => sum + c.orphanedReportsCount, 0);

    const mediumConfidenceReports = competitorAnalyses
      .filter(c => c.potentialResolution === 'medium')
      .reduce((sum, c) => sum + c.orphanedReportsCount, 0);

    const estimatedResolutionRate = orphanedReports.length > 0 
      ? Math.round(((highConfidenceReports + mediumConfidenceReports * 0.7) / orphanedReports.length) * 100)
      : 100;

    let migrationComplexity: 'low' | 'medium' | 'high' = 'low';
    if (orphanedReports.length > 100 || withoutCompetitor > orphanedReports.length * 0.2) {
      migrationComplexity = 'high';
    } else if (orphanedReports.length > 20 || estimatedResolutionRate < 70) {
      migrationComplexity = 'medium';
    }

    // Generate recommendations
    const recommendations: string[] = [];

    if (orphanedReports.length === 0) {
      recommendations.push('✅ No orphaned reports found - no action needed');
    } else {
      if (estimatedResolutionRate > 80) {
        recommendations.push('🟢 High resolution success rate expected - proceed with migration');
      } else if (estimatedResolutionRate > 60) {
        recommendations.push('🟡 Medium resolution success rate - review competitor associations before migration');
      } else {
        recommendations.push('🔴 Low resolution success rate - manual intervention likely required');
      }

      if (withoutCompetitor > 0) {
        recommendations.push(`⚠️  ${withoutCompetitor} reports have no competitor association - require manual review`);
      }

      if (byAge.older > orphanedReports.length * 0.3) {
        recommendations.push('📅 Many old orphaned reports found - consider data cleanup policies');
      }

      if (migrationComplexity === 'high') {
        recommendations.push('🔧 Consider running migration in batches due to complexity');
      }

      recommendations.push(`📊 Backup recommended before migration (${orphanedReports.length} reports affected)`);
    }

    return {
      totalReports: totalReportsCount,
      orphanedReports: orphanedReports.length,
      orphanedPercentage: totalReportsCount > 0 ? Math.round((orphanedReports.length / totalReportsCount) * 100) : 0,
      analysisTimestamp: new Date().toISOString(),
      correlationId: this.correlationId,
      breakdown: {
        byStatus,
        byReportType,
        byCompetitor: competitorAnalyses,
        byAge,
        withVersions,
        withSchedules,
        withoutCompetitor
      },
      orphanedReportsList: orphanedReports,
      recommendations,
      migrationComplexity,
      estimatedResolutionRate
    };
  }

  /**
   * Save diagnostic report to file
   */
  async saveDiagnosticReport(report: DiagnosticReport): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportsDir = join(process.cwd(), 'reports', 'diagnostics');
    
    await mkdir(reportsDir, { recursive: true });

    const reportPath = join(reportsDir, `orphaned-reports-analysis-${timestamp}.json`);
    await writeFile(reportPath, JSON.stringify(report, null, 2));

    // Also create a human-readable summary
    const summaryPath = join(reportsDir, `orphaned-reports-summary-${timestamp}.md`);
    const summaryContent = this.generateMarkdownSummary(report);
    await writeFile(summaryPath, summaryContent);

    logger.info('Task 4.2: Diagnostic report saved', {
      correlationId: this.correlationId,
      reportPath,
      summaryPath,
      orphanedCount: report.orphanedReports
    });

    return reportPath;
  }

  /**
   * Generate human-readable markdown summary
   */
  private generateMarkdownSummary(report: DiagnosticReport): string {
    return `# Orphaned Reports Analysis Report

**Generated:** ${report.analysisTimestamp}  
**Correlation ID:** ${report.correlationId}  

## Executive Summary

- **Total Reports:** ${report.totalReports.toLocaleString()}
- **Orphaned Reports:** ${report.orphanedReports.toLocaleString()} (${report.orphanedPercentage}%)
- **Migration Complexity:** ${report.migrationComplexity.toUpperCase()}
- **Estimated Resolution Rate:** ${report.estimatedResolutionRate}%

## Key Findings

### Reports Breakdown
- **By Status:** ${Object.entries(report.breakdown.byStatus).map(([status, count]) => `${status}: ${count}`).join(', ')}
- **By Type:** ${Object.entries(report.breakdown.byReportType).map(([type, count]) => `${type}: ${count}`).join(', ')}
- **With Versions:** ${report.breakdown.withVersions}
- **With Schedules:** ${report.breakdown.withSchedules}
- **Without Competitor:** ${report.breakdown.withoutCompetitor}

### Age Distribution
- **Last 7 days:** ${report.breakdown.byAge.last7Days}
- **Last 30 days:** ${report.breakdown.byAge.last30Days}
- **Last 90 days:** ${report.breakdown.byAge.last90Days}
- **Older than 90 days:** ${report.breakdown.byAge.older}

### Top Competitors with Orphaned Reports
${report.breakdown.byCompetitor.slice(0, 10).map((comp, idx) => 
  `${idx + 1}. **${comp.competitorName}** (${comp.competitorId}): ${comp.orphanedReportsCount} reports | ${comp.associatedProjectsCount} projects | Resolution: ${comp.potentialResolution.toUpperCase()}`
).join('\n')}

## Recommendations

${report.recommendations.map(rec => `- ${rec}`).join('\n')}

## Next Steps

${report.orphanedReports === 0 
  ? '✅ No action required - all reports are properly associated with projects.'
  : `1. Review this analysis and competitor associations
2. Run migration script with --dry-run flag first
3. Create backup before executing live migration
4. Monitor migration progress and resolve any failures
5. Validate project-report associations post-migration`}

---
*Generated by Orphaned Reports Identifier - Task 4.2*
`;
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
  console.log('🔍 Starting Orphaned Reports Identification - Task 4.2');
  console.log('Analyzing database for reports with null projectId...\n');

  const identifier = new OrphanedReportsIdentifier();

  try {
    // Task 4.2: Identify all orphaned reports
    console.log('1️⃣  Identifying orphaned reports...');
    const orphanedReports = await identifier.identifyOrphanedReports();
    
    if (orphanedReports.length === 0) {
      console.log('✅ Excellent! No orphaned reports found in the database.');
      console.log('🎉 All reports are properly associated with projects.\n');
      return;
    }

    console.log(`📊 Found ${orphanedReports.length} orphaned reports`);

    // Generate comprehensive analysis
    console.log('2️⃣  Generating diagnostic analysis...');
    const diagnosticReport = await identifier.generateDiagnosticReport(orphanedReports);

    // Save reports
    console.log('3️⃣  Saving diagnostic report...');
    const reportPath = await identifier.saveDiagnosticReport(diagnosticReport);

    // Display summary
    console.log('\n📈 Analysis Summary:');
    console.log(`   Total Reports in Database: ${diagnosticReport.totalReports.toLocaleString()}`);
    console.log(`   Orphaned Reports: ${diagnosticReport.orphanedReports.toLocaleString()} (${diagnosticReport.orphanedPercentage}%)`);
    console.log(`   Migration Complexity: ${diagnosticReport.migrationComplexity.toUpperCase()}`);
    console.log(`   Estimated Resolution Rate: ${diagnosticReport.estimatedResolutionRate}%`);
    console.log(`   Reports without Competitor: ${diagnosticReport.breakdown.withoutCompetitor}`);
    console.log(`   Reports with Versions: ${diagnosticReport.breakdown.withVersions}`);
    console.log(`   Reports with Schedules: ${diagnosticReport.breakdown.withSchedules}`);

    console.log('\n🏆 Top Competitors with Orphaned Reports:');
    diagnosticReport.breakdown.byCompetitor.slice(0, 5).forEach((comp, idx) => {
      const resolution = comp.potentialResolution.toUpperCase();
      const indicator = resolution === 'HIGH' ? '🟢' : resolution === 'MEDIUM' ? '🟡' : '🔴';
      console.log(`   ${idx + 1}. ${indicator} ${comp.competitorName}: ${comp.orphanedReportsCount} reports (${resolution} resolution confidence)`);
    });

    console.log('\n💡 Key Recommendations:');
    diagnosticReport.recommendations.forEach(rec => {
      console.log(`   ${rec}`);
    });

    console.log(`\n📋 Full diagnostic report saved to: ${reportPath}`);
    console.log('🎯 Task 4.2 - Orphaned Reports Identification Complete!');

  } catch (error) {
    console.error('❌ Identification failed:', error);
    logger.error('Task 4.2 identification script failed', error as Error);
    process.exit(1);
  } finally {
    await identifier.cleanup();
  }
}

// Run the identifier if this script is executed directly
if (require.main === module) {
  main().catch(console.error);
}

export { OrphanedReportsIdentifier, main }; 