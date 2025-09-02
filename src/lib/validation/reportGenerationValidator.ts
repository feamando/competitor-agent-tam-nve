/**
 * TP-024 Task 3.1: Report Generation Validation
 * 
 * Validation functions to check projects have initial reports generated
 * Addresses root causes identified in A-002 analysis
 */

import { prisma } from '@/lib/prisma';
import { logger, generateCorrelationId } from '@/lib/logger';

export interface ProjectReportValidationResult {
  projectId: string;
  projectName: string;
  hasInitialReports: boolean;
  totalReports: number;
  scheduledReportsConfigured: boolean;
  lastReportDate?: Date | undefined;
  issues: string[];
  recommendations: string[];
  status: 'healthy' | 'warning' | 'critical';
}

export interface ValidationSummary {
  totalProjects: number;
  healthyProjects: number;
  projectsWithWarnings: number;
  criticalProjects: number;
  validationDate: Date;
  results: ProjectReportValidationResult[];
}

/**
 * TP-024 Task 3.1: Validate a single project has initial reports generated
 */
export async function validateProjectReports(projectId: string): Promise<ProjectReportValidationResult> {
  const correlationId = generateCorrelationId();
  const context = { projectId, correlationId, operation: 'validateProjectReports' };

  try {
    logger.info('TP-024: Validating project report generation', context);

    // Get project with reports and schedule data
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        reports: {
          orderBy: { createdAt: 'desc' },
          take: 10
        }
      }
    });

    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    const issues: string[] = [];
    const recommendations: string[] = [];
    let status: 'healthy' | 'warning' | 'critical' = 'healthy';

    // Check 1: Project has autoGenerateInitialReport flag (Task 1.x fix)
    const params = project.parameters as any;
    const hasAutoGenerateFlag = params?.autoGenerateInitialReport === true;
    if (!hasAutoGenerateFlag) {
      issues.push('Missing autoGenerateInitialReport flag in project parameters');
      recommendations.push('Update project to include autoGenerateInitialReport: true');
      status = 'critical';
    }

    // Check 2: Project has initial reports
    const hasInitialReports = project.reports.length > 0;
    if (!hasInitialReports) {
      // For projects older than 30 minutes, this is concerning
      const projectAge = Date.now() - project.createdAt.getTime();
      if (projectAge > 30 * 60 * 1000) { // 30 minutes
        issues.push('No initial reports generated despite project age > 30 minutes');
        recommendations.push('Manually trigger initial report generation');
        status = status === 'critical' ? 'critical' : 'warning';
      }
    }

    // Check 3: Scheduled reports configuration (Task 2.x context)
    const schedule = params?.autoReportSchedule;
    const scheduledReportsConfigured = !!schedule?.isActive;
    
    if (!scheduledReportsConfigured) {
      issues.push('No active scheduled reports configured');
      recommendations.push('Configure automatic report scheduling');
      status = status === 'critical' ? 'critical' : 'warning';
    } else if (schedule) {
      // Check if scheduled reports are overdue
      const nextRunTime = new Date(schedule.nextRunTime);
      const now = new Date();
      if (nextRunTime < now) {
        const overdueHours = Math.floor((now.getTime() - nextRunTime.getTime()) / (1000 * 60 * 60));
        if (overdueHours > 25) { // Allow 1 hour buffer for daily reports
          issues.push(`Scheduled reports overdue by ${overdueHours} hours`);
          recommendations.push('Check cron job manager and service initialization');
          status = 'critical';
        }
      }
    }

    // Check 4: Report generation patterns
    if (hasInitialReports) {
      const recentReports = project.reports.filter(r => {
        const reportAge = Date.now() - r.createdAt.getTime();
        return reportAge < 7 * 24 * 60 * 60 * 1000; // Last 7 days
      });

      if (recentReports.length === 0 && project.reports.length > 0) {
        issues.push('No reports generated in the last 7 days');
        recommendations.push('Check scheduled report execution');
        status = status === 'critical' ? 'critical' : 'warning';
      }
    }

    const result: ProjectReportValidationResult = {
      projectId: project.id,
      projectName: project.name,
      hasInitialReports,
      totalReports: project.reports.length,
      scheduledReportsConfigured,
      lastReportDate: project.reports[0]?.createdAt,
      issues,
      recommendations,
      status
    };

    logger.info('TP-024: Project validation completed', {
      ...context,
      status,
      issueCount: issues.length,
      hasReports: hasInitialReports
    });

    return result;

  } catch (error) {
    logger.error('TP-024: Project validation failed', error as Error, context);
    
    return {
      projectId,
      projectName: 'Unknown',
      hasInitialReports: false,
      totalReports: 0,
      scheduledReportsConfigured: false,
      issues: [`Validation failed: ${(error as Error).message}`],
      recommendations: ['Check project exists and database connectivity'],
      status: 'critical'
    };
  }
}

/**
 * TP-024 Task 3.1: Validate multiple projects for report generation issues
 */
export async function validateAllProjectReports(options: {
  includeArchived?: boolean;
  maxAge?: number; // Maximum project age in days to include
} = {}): Promise<ValidationSummary> {
  const correlationId = generateCorrelationId();
  const context = { correlationId, operation: 'validateAllProjectReports', options };

  try {
    logger.info('TP-024: Starting bulk project validation', context);

    // Build filter conditions
    const whereClause: any = {};
    
    if (!options.includeArchived) {
      whereClause.status = { in: ['ACTIVE', 'DRAFT', 'PAUSED'] };
    }

    if (options.maxAge) {
      const maxDate = new Date();
      maxDate.setDate(maxDate.getDate() - options.maxAge);
      whereClause.createdAt = { gte: maxDate };
    }

    // Get projects to validate
    const projects = await prisma.project.findMany({
      where: whereClause,
      select: { id: true },
      orderBy: { createdAt: 'desc' }
    });

    logger.info('TP-024: Found projects to validate', {
      ...context,
      projectCount: projects.length
    });

    // Validate each project
    const results: ProjectReportValidationResult[] = [];
    let healthyCount = 0;
    let warningCount = 0;
    let criticalCount = 0;

    for (const project of projects) {
      try {
        const result = await validateProjectReports(project.id);
        results.push(result);

        switch (result.status) {
          case 'healthy':
            healthyCount++;
            break;
          case 'warning':
            warningCount++;
            break;
          case 'critical':
            criticalCount++;
            break;
        }
      } catch (error) {
        logger.error('TP-024: Individual project validation failed', error as Error, {
          ...context,
          projectId: project.id
        });
      }
    }

    const summary: ValidationSummary = {
      totalProjects: results.length,
      healthyProjects: healthyCount,
      projectsWithWarnings: warningCount,
      criticalProjects: criticalCount,
      validationDate: new Date(),
      results
    };

    logger.info('TP-024: Bulk validation completed', {
      ...context,
      summary: {
        total: summary.totalProjects,
        healthy: summary.healthyProjects,
        warnings: summary.projectsWithWarnings,
        critical: summary.criticalProjects
      }
    });

    return summary;

  } catch (error) {
    logger.error('TP-024: Bulk validation failed', error as Error, context);
    throw error;
  }
}

/**
 * TP-024 Task 3.1: Get projects that need immediate attention
 */
export async function getCriticalProjectIssues(): Promise<ProjectReportValidationResult[]> {
  const summary = await validateAllProjectReports({ maxAge: 30 }); // Last 30 days
  return summary.results.filter(r => r.status === 'critical');
}

/**
 * TP-024 Task 3.1: Get validation summary for monitoring dashboard
 */
export async function getValidationSummaryForDashboard(): Promise<{
  totalProjects: number;
  healthyProjects: number;
  issuesDetected: number;
  lastValidation: Date;
  criticalIssues: string[];
}> {
  const summary = await validateAllProjectReports({ maxAge: 7 }); // Last 7 days
  
  const criticalIssues = summary.results
    .filter(r => r.status === 'critical')
    .flatMap(r => r.issues)
    .slice(0, 5); // Top 5 critical issues

  return {
    totalProjects: summary.totalProjects,
    healthyProjects: summary.healthyProjects,
    issuesDetected: summary.projectsWithWarnings + summary.criticalProjects,
    lastValidation: summary.validationDate,
    criticalIssues
  };
} 