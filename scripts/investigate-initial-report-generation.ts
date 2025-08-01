#!/usr/bin/env node

/**
 * Initial Report Generation Investigation Script - Task 5.1
 * 
 * This script investigates missing initial report generation in the project creation flow.
 * It analyzes existing projects, identifies patterns where initial reports are missing,
 * and provides detailed insights into the root causes.
 * 
 * Key Functions:
 * - Task 5.1: Investigate missing initial report generation in project creation flow
 * - Analyze existing projects and their report associations
 * - Identify patterns and gaps in initial report generation
 * - Provide detailed root cause analysis
 * - Generate recommendations for fixing the issue
 * 
 * Usage: npm run investigate:initial-reports
 */

import { PrismaClient, Project, Report, ProjectStatus } from '@prisma/client';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { logger, generateCorrelationId } from '../src/lib/logger';

interface ProjectAnalysis {
  id: string;
  name: string;
  status: string;
  createdAt: Date;
  competitorCount: number;
  totalReports: number;
  hasInitialReport: boolean;
  firstReportCreatedAt?: Date;
  timeBetweenProjectAndFirstReport?: number; // in minutes
  reportTypes: string[];
  creationMethod: 'api' | 'chat' | 'unknown';
  hasProduct: boolean;
  autoGenerateInitialReport?: boolean;
  reportTemplate?: string;
  issues: string[];
}

interface InvestigationResult {
  summary: {
    totalProjects: number;
    projectsWithInitialReports: number;
    projectsWithoutInitialReports: number;
    projectsWithNoReports: number;
    averageTimeToFirstReport: number;
    initialReportSuccessRate: number;
  };
  patterns: {
    byCreationMethod: Record<string, { total: number; withInitialReports: number; successRate: number }>;
    byStatus: Record<string, { total: number; withInitialReports: number; successRate: number }>;
    byAge: {
      last24Hours: { total: number; withInitialReports: number };
      last7Days: { total: number; withInitialReports: number };
      last30Days: { total: number; withInitialReports: number };
      older: { total: number; withInitialReports: number };
    };
  };
  issues: {
    commonIssues: Array<{
      issue: string;
      count: number;
      affectedProjects: string[];
    }>;
    rootCauses: string[];
    recommendations: string[];
  };
  detailedAnalysis: ProjectAnalysis[];
  correlationId: string;
  analysisTimestamp: Date;
}

class InitialReportInvestigator {
  private prisma: PrismaClient;
  private correlationId: string;

  constructor() {
    this.prisma = new PrismaClient();
    this.correlationId = generateCorrelationId();
  }

  /**
   * Task 5.1: Main investigation function - investigates missing initial report generation
   */
  async investigateInitialReportGeneration(): Promise<InvestigationResult> {
    logger.info('Task 5.1: Starting investigation of initial report generation', {
      correlationId: this.correlationId,
      operation: 'investigate_initial_report_generation'
    });

    try {
      // Step 1: Analyze all projects
      const projectAnalyses = await this.analyzeAllProjects();
      
      // Step 2: Generate summary statistics
      const summary = this.generateSummaryStatistics(projectAnalyses);
      
      // Step 3: Identify patterns
      const patterns = this.identifyPatterns(projectAnalyses);
      
      // Step 4: Analyze issues and root causes
      const issues = await this.analyzeIssuesAndRootCauses(projectAnalyses);

      const result: InvestigationResult = {
        summary,
        patterns,
        issues,
        detailedAnalysis: projectAnalyses,
        correlationId: this.correlationId,
        analysisTimestamp: new Date()
      };

      logger.info('Task 5.1: Investigation completed', {
        correlationId: this.correlationId,
        totalProjects: summary.totalProjects,
        successRate: summary.initialReportSuccessRate,
        majorIssues: issues.rootCauses.length
      });

      return result;

    } catch (error) {
      logger.error('Task 5.1: Investigation failed', error as Error, {
        correlationId: this.correlationId
      });
      throw error;
    }
  }

  /**
   * Analyze all projects for initial report patterns
   */
  private async analyzeAllProjects(): Promise<ProjectAnalysis[]> {
    logger.info('Analyzing all projects for initial report patterns', {
      correlationId: this.correlationId
    });

    const projects = await this.prisma.project.findMany({
      include: {
        competitors: {
          select: { id: true, name: true }
        },
        products: {
          select: { id: true, name: true }
        },
        reports: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            name: true,
            createdAt: true,
            isInitialReport: true,
            reportType: true,
            status: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const analyses: ProjectAnalysis[] = [];

    for (const project of projects) {
      const analysis = await this.analyzeProject(project);
      analyses.push(analysis);
    }

    logger.info('Project analysis completed', {
      correlationId: this.correlationId,
      totalProjects: analyses.length,
      projectsWithIssues: analyses.filter(a => a.issues.length > 0).length
    });

    return analyses;
  }

  /**
   * Analyze individual project for initial report issues
   */
  private async analyzeProject(project: any): Promise<ProjectAnalysis> {
    const issues: string[] = [];
    const reports = project.reports || [];
    const firstReport = reports.length > 0 ? reports[0] : null;
    const hasInitialReport = reports.some((r: any) => r.isInitialReport);
    
    // Determine creation method from project parameters
    let creationMethod: 'api' | 'chat' | 'unknown' = 'unknown';
    if (project.parameters) {
      if (project.parameters.autoGenerateInitialReport !== undefined) {
        creationMethod = 'api';
      } else if (project.parameters.chatCreated || project.parameters.conversationId) {
        creationMethod = 'chat';
      }
    }

    // Calculate time between project creation and first report
    let timeBetweenProjectAndFirstReport: number | undefined;
    if (firstReport) {
      timeBetweenProjectAndFirstReport = Math.round(
        (new Date(firstReport.createdAt).getTime() - new Date(project.createdAt).getTime()) / (1000 * 60)
      );
    }

    // Identify issues
    if (project.competitors.length > 0 && reports.length === 0) {
      issues.push('Project has competitors but no reports generated');
    }

    if (project.competitors.length > 0 && !hasInitialReport) {
      issues.push('Project missing initial report despite having competitors');
    }

    if (project.status === 'ACTIVE' && reports.length === 0) {
      issues.push('Active project with no reports');
    }

    if (firstReport && timeBetweenProjectAndFirstReport! > 60) {
      issues.push(`First report generated ${timeBetweenProjectAndFirstReport} minutes after project creation (too late)`);
    }

    if (project.competitors.length === 0) {
      issues.push('Project has no competitors assigned');
    }

    if (project.products.length === 0) {
      issues.push('Project has no product entity');
    }

    // Check for API projects with autoGenerateInitialReport=false
    if (creationMethod === 'api' && project.parameters?.autoGenerateInitialReport === false) {
      issues.push('API project explicitly disabled initial report generation');
    }

    // Check for failed report generation attempts
    const failedReports = reports.filter((r: any) => r.status === 'FAILED');
    if (failedReports.length > 0) {
      issues.push(`${failedReports.length} failed report generation attempts`);
    }

    return {
      id: project.id,
      name: project.name,
      status: project.status,
      createdAt: project.createdAt,
      competitorCount: project.competitors.length,
      totalReports: reports.length,
      hasInitialReport,
      firstReportCreatedAt: firstReport?.createdAt,
      timeBetweenProjectAndFirstReport,
      reportTypes: [...new Set(reports.map((r: any) => r.reportType).filter((type: any) => typeof type === 'string'))] as string[],
      creationMethod,
      hasProduct: project.products.length > 0,
      autoGenerateInitialReport: project.parameters?.autoGenerateInitialReport,
      reportTemplate: project.parameters?.reportTemplate,
      issues
    };
  }

  /**
   * Generate summary statistics
   */
  private generateSummaryStatistics(analyses: ProjectAnalysis[]): InvestigationResult['summary'] {
    const totalProjects = analyses.length;
    const projectsWithInitialReports = analyses.filter(a => a.hasInitialReport).length;
    const projectsWithoutInitialReports = analyses.filter(a => !a.hasInitialReport && a.totalReports > 0).length;
    const projectsWithNoReports = analyses.filter(a => a.totalReports === 0).length;

    const timesToFirstReport = analyses
      .filter(a => a.timeBetweenProjectAndFirstReport !== undefined)
      .map(a => a.timeBetweenProjectAndFirstReport!);
    
    const averageTimeToFirstReport = timesToFirstReport.length > 0
      ? Math.round(timesToFirstReport.reduce((sum, time) => sum + time, 0) / timesToFirstReport.length)
      : 0;

    const initialReportSuccessRate = totalProjects > 0
      ? Math.round((projectsWithInitialReports / totalProjects) * 100)
      : 0;

    return {
      totalProjects,
      projectsWithInitialReports,
      projectsWithoutInitialReports,
      projectsWithNoReports,
      averageTimeToFirstReport,
      initialReportSuccessRate
    };
  }

  /**
   * Identify patterns in project creation and report generation
   */
  private identifyPatterns(analyses: ProjectAnalysis[]): InvestigationResult['patterns'] {
    const byCreationMethod: Record<string, { total: number; withInitialReports: number; successRate: number }> = {};
    const byStatus: Record<string, { total: number; withInitialReports: number; successRate: number }> = {};

    // Group by creation method
    ['api', 'chat', 'unknown'].forEach(method => {
      const projects = analyses.filter(a => a.creationMethod === method);
      const withInitialReports = projects.filter(a => a.hasInitialReport).length;
      byCreationMethod[method] = {
        total: projects.length,
        withInitialReports,
        successRate: projects.length > 0 ? Math.round((withInitialReports / projects.length) * 100) : 0
      };
    });

    // Group by status
    ['ACTIVE', 'DRAFT', 'PAUSED', 'COMPLETED', 'ARCHIVED'].forEach(status => {
      const projects = analyses.filter(a => a.status === status);
      const withInitialReports = projects.filter(a => a.hasInitialReport).length;
      byStatus[status] = {
        total: projects.length,
        withInitialReports,
        successRate: projects.length > 0 ? Math.round((withInitialReports / projects.length) * 100) : 0
      };
    });

    // Group by age
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const byAge = {
      last24Hours: { total: 0, withInitialReports: 0 },
      last7Days: { total: 0, withInitialReports: 0 },
      last30Days: { total: 0, withInitialReports: 0 },
      older: { total: 0, withInitialReports: 0 }
    };

    analyses.forEach(analysis => {
      const age = now - new Date(analysis.createdAt).getTime();
      let category: keyof typeof byAge;

      if (age <= day) {
        category = 'last24Hours';
      } else if (age <= 7 * day) {
        category = 'last7Days';
      } else if (age <= 30 * day) {
        category = 'last30Days';
      } else {
        category = 'older';
      }

      byAge[category].total++;
      if (analysis.hasInitialReport) {
        byAge[category].withInitialReports++;
      }
    });

    return { byCreationMethod, byStatus, byAge };
  }

  /**
   * Analyze issues and identify root causes
   */
  private async analyzeIssuesAndRootCauses(analyses: ProjectAnalysis[]): Promise<InvestigationResult['issues']> {
    // Count common issues
    const issueCount: Record<string, { count: number; affectedProjects: string[] }> = {};
    
    analyses.forEach(analysis => {
      analysis.issues.forEach(issue => {
        if (!issueCount[issue]) {
          issueCount[issue] = { count: 0, affectedProjects: [] };
        }
        issueCount[issue].count++;
        issueCount[issue].affectedProjects.push(analysis.id);
      });
    });

    const commonIssues = Object.entries(issueCount)
      .map(([issue, data]) => ({ issue, count: data.count, affectedProjects: data.affectedProjects }))
      .sort((a, b) => b.count - a.count);

    // Identify root causes based on analysis
    const rootCauses: string[] = [];
    const recommendations: string[] = [];

    // Root cause analysis
    if (commonIssues.find(i => i.issue.includes('missing initial report'))) {
      rootCauses.push('Initial report generation not consistently triggered after project creation');
      recommendations.push('Ensure initial report generation is triggered in all project creation flows');
    }

    const noCompetitorsIssue = commonIssues.find(i => i.issue.includes('no competitors assigned'));
    if (noCompetitorsIssue && noCompetitorsIssue.count > 0) {
      rootCauses.push('Projects created without competitor assignment');
      recommendations.push('Implement mandatory competitor assignment in project creation');
    }

    const noProductIssue = commonIssues.find(i => i.issue.includes('no product entity'));
    if (noProductIssue && noProductIssue.count > 0) {
      rootCauses.push('Projects created without product entity');
      recommendations.push('Ensure product entity creation is part of project initialization');
    }

    const failedReportsIssue = commonIssues.find(i => i.issue.includes('failed report generation'));
    if (failedReportsIssue && failedReportsIssue.count > 0) {
      rootCauses.push('Report generation service failures');
      recommendations.push('Investigate and fix report generation service reliability issues');
    }

    // Check for timing issues
    const lateReportsIssue = commonIssues.find(i => i.issue.includes('too late'));
    if (lateReportsIssue && lateReportsIssue.count > 0) {
      rootCauses.push('Initial reports generated with significant delay');
      recommendations.push('Optimize initial report generation to trigger immediately after project creation');
    }

    // Check creation method success rates
    const chatProjects = analyses.filter(a => a.creationMethod === 'chat');
    const apiProjects = analyses.filter(a => a.creationMethod === 'api');
    
    const chatSuccessRate = chatProjects.length > 0 
      ? (chatProjects.filter(a => a.hasInitialReport).length / chatProjects.length) * 100 
      : 0;
    const apiSuccessRate = apiProjects.length > 0 
      ? (apiProjects.filter(a => a.hasInitialReport).length / apiProjects.length) * 100 
      : 0;

    if (Math.abs(chatSuccessRate - apiSuccessRate) > 20) {
      rootCauses.push('Inconsistent initial report generation between chat and API project creation');
      recommendations.push('Standardize initial report generation logic across all creation methods');
    }

    // Additional recommendations based on analysis
    recommendations.push('Implement comprehensive logging for project creation and report generation flow');
    recommendations.push('Add health checks to verify initial report generation success');
    recommendations.push('Consider implementing retry mechanisms for failed initial report generation');

    return { commonIssues, rootCauses, recommendations };
  }

  /**
   * Generate detailed investigation report
   */
  async generateInvestigationReport(result: InvestigationResult): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportDir = join(process.cwd(), 'reports', 'investigations');
    await mkdir(reportDir, { recursive: true });

    const reportPath = join(reportDir, `initial-report-investigation-${timestamp}.json`);
    await writeFile(reportPath, JSON.stringify(result, null, 2));

    // Also create human-readable summary
    const summaryPath = join(reportDir, `initial-report-investigation-summary-${timestamp}.md`);
    const summaryContent = this.generateMarkdownSummary(result);
    await writeFile(summaryPath, summaryContent);

    logger.info('Task 5.1: Investigation report generated', {
      correlationId: this.correlationId,
      reportPath,
      summaryPath
    });

    return reportPath;
  }

  /**
   * Generate human-readable markdown summary
   */
  private generateMarkdownSummary(result: InvestigationResult): string {
    return `# Initial Report Generation Investigation - Task 5.1

**Generated:** ${result.analysisTimestamp.toISOString()}  
**Correlation ID:** ${result.correlationId}  

## Executive Summary

- **Total Projects Analyzed:** ${result.summary.totalProjects.toLocaleString()}
- **Projects with Initial Reports:** ${result.summary.projectsWithInitialReports} (${result.summary.initialReportSuccessRate}%)
- **Projects without Initial Reports:** ${result.summary.projectsWithoutInitialReports}
- **Projects with No Reports:** ${result.summary.projectsWithNoReports}
- **Average Time to First Report:** ${result.summary.averageTimeToFirstReport} minutes

## Key Findings

### Success Rates by Creation Method
${Object.entries(result.patterns.byCreationMethod).map(([method, data]) => 
  `- **${method.toUpperCase()}:** ${data.withInitialReports}/${data.total} (${data.successRate}%)`
).join('\n')}

### Success Rates by Project Status
${Object.entries(result.patterns.byStatus).filter(([, data]) => data.total > 0).map(([status, data]) => 
  `- **${status}:** ${data.withInitialReports}/${data.total} (${data.successRate}%)`
).join('\n')}

### Issues by Recency
- **Last 24 Hours:** ${result.patterns.byAge.last24Hours.withInitialReports}/${result.patterns.byAge.last24Hours.total} projects have initial reports
- **Last 7 Days:** ${result.patterns.byAge.last7Days.withInitialReports}/${result.patterns.byAge.last7Days.total} projects have initial reports
- **Last 30 Days:** ${result.patterns.byAge.last30Days.withInitialReports}/${result.patterns.byAge.last30Days.total} projects have initial reports

## Most Common Issues

${result.issues.commonIssues.slice(0, 10).map((issue, idx) => 
  `${idx + 1}. **${issue.issue}** (${issue.count} projects affected)`
).join('\n')}

## Root Causes Identified

${result.issues.rootCauses.map((cause, idx) => 
  `${idx + 1}. ${cause}`
).join('\n')}

## Recommendations

${result.issues.recommendations.map((rec, idx) => 
  `${idx + 1}. ${rec}`
).join('\n')}

## Next Steps

1. **Immediate Actions:**
   - Fix initial report generation in project creation flows
   - Implement consistent trigger mechanisms across API and chat creation
   - Add proper error handling and retry logic

2. **Short-term Improvements:**
   - Standardize project creation workflow
   - Enhance logging and monitoring
   - Implement health checks for report generation

3. **Long-term Enhancements:**
   - Create unified project initialization service
   - Implement comprehensive testing for project creation flows
   - Add automated monitoring and alerting

---
*Generated by Initial Report Generation Investigator - Task 5.1*
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
  console.log('🔍 Starting Initial Report Generation Investigation - Task 5.1');
  console.log('Analyzing missing initial report generation in project creation flow...\n');

  const investigator = new InitialReportInvestigator();

  try {
    // Execute investigation
    console.log('1️⃣  Analyzing all projects and their report patterns...');
    const investigationResult = await investigator.investigateInitialReportGeneration();

    // Display summary
    console.log('\n📊 Investigation Summary:');
    console.log(`   Total Projects: ${investigationResult.summary.totalProjects.toLocaleString()}`);
    console.log(`   Initial Report Success Rate: ${investigationResult.summary.initialReportSuccessRate}%`);
    console.log(`   Projects Missing Initial Reports: ${investigationResult.summary.projectsWithoutInitialReports}`);
    console.log(`   Projects with No Reports: ${investigationResult.summary.projectsWithNoReports}`);

    console.log('\n🔍 Key Patterns:');
    Object.entries(investigationResult.patterns.byCreationMethod).forEach(([method, data]) => {
      if (data.total > 0) {
        console.log(`   ${method.toUpperCase()}: ${data.successRate}% success rate (${data.withInitialReports}/${data.total})`);
      }
    });

    console.log('\n⚠️  Top Issues Found:');
    investigationResult.issues.commonIssues.slice(0, 5).forEach((issue, idx) => {
      console.log(`   ${idx + 1}. ${issue.issue} (${issue.count} projects)`);
    });

    console.log('\n🎯 Root Causes:');
    investigationResult.issues.rootCauses.forEach((cause, idx) => {
      console.log(`   ${idx + 1}. ${cause}`);
    });

    // Generate detailed report
    console.log('\n2️⃣  Generating detailed investigation report...');
    const reportPath = await investigator.generateInvestigationReport(investigationResult);
    console.log(`📋 Investigation report saved to: ${reportPath}`);

    console.log('\n🎉 Task 5.1 - Initial Report Generation Investigation Complete!');

    // Show critical recommendations
    if (investigationResult.issues.recommendations.length > 0) {
      console.log('\n💡 Critical Recommendations:');
      investigationResult.issues.recommendations.slice(0, 3).forEach((rec, idx) => {
        console.log(`   ${idx + 1}. ${rec}`);
      });
    }

  } catch (error) {
    console.error('❌ Investigation failed:', error);
    process.exit(1);
  } finally {
    await investigator.cleanup();
  }
}

// Run the investigation if this script is executed directly
if (require.main === module) {
  main().catch(console.error);
}

export { InitialReportInvestigator, main }; 