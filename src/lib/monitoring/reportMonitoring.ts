/**
 * TP-024 Task 3.2: Report Monitoring System
 * 
 * Monitoring system for projects missing initial reports after creation
 * Addresses root causes identified in A-002 analysis
 */

import { prisma } from '@/lib/prisma';
import { logger, generateCorrelationId } from '@/lib/logger';
import { validateProjectReports, getCriticalProjectIssues } from '@/lib/validation/reportGenerationValidator';

export interface MonitoringAlert {
  id: string;
  alertType: 'missing_initial_report' | 'overdue_scheduled_report' | 'service_initialization_failure';
  severity: 'low' | 'medium' | 'high' | 'critical';
  projectId: string;
  projectName: string;
  message: string;
  details: Record<string, any>;
  createdAt: Date;
  resolved?: boolean;
  resolvedAt?: Date;
}

export interface MonitoringStats {
  totalProjects: number;
  projectsWithIssues: number;
  activeAlerts: number;
  criticalAlerts: number;
  lastMonitoringRun: Date;
  serviceHealthStatus: 'healthy' | 'degraded' | 'critical';
}

/**
 * TP-024 Task 3.2: Monitor projects for missing initial reports
 */
export class ReportMonitoringService {
  private alerts: MonitoringAlert[] = [];
  private lastMonitoringRun?: Date;

  /**
   * TP-024: Monitor all projects for missing initial reports
   */
  async monitorMissingInitialReports(): Promise<MonitoringAlert[]> {
    const correlationId = generateCorrelationId();
    const context = { correlationId, operation: 'monitorMissingInitialReports' };

    try {
      logger.info('TP-024: Starting missing initial reports monitoring', context);

      // Get projects created in the last 7 days without reports
      const suspiciousProjects = await prisma.project.findMany({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
          },
          status: { in: ['ACTIVE', 'DRAFT'] }
        },
        include: {
          reports: {
            take: 1
          }
        }
      });

      const newAlerts: MonitoringAlert[] = [];

      for (const project of suspiciousProjects) {
        const projectAge = Date.now() - project.createdAt.getTime();
        const hasReports = project.reports.length > 0;
        const params = project.parameters as any;
        
        // Check if project should have initial reports by now
        if (!hasReports && projectAge > 30 * 60 * 1000) { // 30 minutes old
          const severity = projectAge > 4 * 60 * 60 * 1000 ? 'critical' : 'high'; // 4 hours
          
          const alert: MonitoringAlert = {
            id: `${project.id}-missing-initial-${Date.now()}`,
            alertType: 'missing_initial_report',
            severity,
            projectId: project.id,
            projectName: project.name,
            message: `Project created ${Math.floor(projectAge / (60 * 1000))} minutes ago but no initial reports generated`,
            details: {
              projectAge: projectAge,
              hasAutoGenerateFlag: params?.autoGenerateInitialReport === true,
              createdViaChat: params?.createdViaChat === true,
              projectStatus: project.status
            },
            createdAt: new Date(),
            resolved: false
          };

          newAlerts.push(alert);
          this.alerts.push(alert);
        }
      }

      logger.info('TP-024: Missing initial reports monitoring completed', {
        ...context,
        projectsChecked: suspiciousProjects.length,
        newAlerts: newAlerts.length
      });

      this.lastMonitoringRun = new Date();
      return newAlerts;

    } catch (error) {
      logger.error('TP-024: Missing initial reports monitoring failed', error as Error, context);
      throw error;
    }
  }

  /**
   * TP-024: Monitor for overdue scheduled reports
   */
  async monitorOverdueScheduledReports(): Promise<MonitoringAlert[]> {
    const correlationId = generateCorrelationId();
    const context = { correlationId, operation: 'monitorOverdueScheduledReports' };

    try {
      logger.info('TP-024: Starting overdue scheduled reports monitoring', context);

             // Get projects with active schedules
       const projectsWithSchedules = await prisma.project.findMany({
         where: {
           status: { in: ['ACTIVE'] }
         },
         include: {
           reports: {
             orderBy: { createdAt: 'desc' },
             take: 1
           }
         }
       });

      const newAlerts: MonitoringAlert[] = [];
      const now = new Date();

      for (const project of projectsWithSchedules) {
        const params = project.parameters as any;
        const schedule = params?.autoReportSchedule;
        
        if (schedule?.isActive && schedule.nextRunTime) {
          const nextRunTime = new Date(schedule.nextRunTime);
          const overdueTime = now.getTime() - nextRunTime.getTime();
          
          // Check if more than 25 hours overdue (allowing buffer for daily reports)
          if (overdueTime > 25 * 60 * 60 * 1000) {
            const overdueHours = Math.floor(overdueTime / (60 * 60 * 1000));
            
            const alert: MonitoringAlert = {
              id: `${project.id}-overdue-scheduled-${Date.now()}`,
              alertType: 'overdue_scheduled_report',
              severity: overdueHours > 48 ? 'critical' : 'high',
              projectId: project.id,
              projectName: project.name,
              message: `Scheduled ${schedule.frequency} reports overdue by ${overdueHours} hours`,
              details: {
                scheduleFrequency: schedule.frequency,
                nextRunTime: schedule.nextRunTime,
                overdueHours,
                lastReportDate: project.reports[0]?.createdAt
              },
              createdAt: new Date(),
              resolved: false
            };

            newAlerts.push(alert);
            this.alerts.push(alert);
          }
        }
      }

      logger.info('TP-024: Overdue scheduled reports monitoring completed', {
        ...context,
        projectsChecked: projectsWithSchedules.length,
        newAlerts: newAlerts.length
      });

      return newAlerts;

    } catch (error) {
      logger.error('TP-024: Overdue scheduled reports monitoring failed', error as Error, context);
      throw error;
    }
  }

  /**
   * TP-024: Run comprehensive monitoring check
   */
  async runMonitoringCheck(): Promise<{
    newAlerts: MonitoringAlert[];
    stats: MonitoringStats;
  }> {
    const correlationId = generateCorrelationId();
    const context = { correlationId, operation: 'runMonitoringCheck' };

    try {
      logger.info('TP-024: Starting comprehensive monitoring check', context);

      // Run all monitoring checks in parallel
      const [missingInitialAlerts, overdueScheduledAlerts] = await Promise.all([
        this.monitorMissingInitialReports(),
        this.monitorOverdueScheduledReports()
      ]);

      const newAlerts = [...missingInitialAlerts, ...overdueScheduledAlerts];
      const activeAlerts = this.alerts.filter(a => !a.resolved);
      const criticalAlerts = activeAlerts.filter(a => a.severity === 'critical');

      // Get overall stats
      const totalProjects = await prisma.project.count({
        where: { status: { in: ['ACTIVE', 'DRAFT'] } }
      });

      const projectsWithIssues = await this.getProjectsWithIssuesCount();

      const stats: MonitoringStats = {
        totalProjects,
        projectsWithIssues,
        activeAlerts: activeAlerts.length,
        criticalAlerts: criticalAlerts.length,
        lastMonitoringRun: new Date(),
        serviceHealthStatus: this.determineServiceHealthStatus(activeAlerts)
      };

      logger.info('TP-024: Comprehensive monitoring check completed', {
        ...context,
        newAlerts: newAlerts.length,
        activeAlerts: activeAlerts.length,
        criticalAlerts: criticalAlerts.length,
        serviceHealth: stats.serviceHealthStatus
      });

      this.lastMonitoringRun = new Date();

      return { newAlerts, stats };

    } catch (error) {
      logger.error('TP-024: Comprehensive monitoring check failed', error as Error, context);
      throw error;
    }
  }

  /**
   * TP-024: Get current monitoring statistics
   */
  async getMonitoringStats(): Promise<MonitoringStats> {
    const activeAlerts = this.alerts.filter(a => !a.resolved);
    const criticalAlerts = activeAlerts.filter(a => a.severity === 'critical');
    
    const totalProjects = await prisma.project.count({
      where: { status: { in: ['ACTIVE', 'DRAFT'] } }
    });

    const projectsWithIssues = await this.getProjectsWithIssuesCount();

    return {
      totalProjects,
      projectsWithIssues,
      activeAlerts: activeAlerts.length,
      criticalAlerts: criticalAlerts.length,
      lastMonitoringRun: this.lastMonitoringRun || new Date(),
      serviceHealthStatus: this.determineServiceHealthStatus(activeAlerts)
    };
  }

  /**
   * TP-024: Get all active alerts
   */
  getActiveAlerts(): MonitoringAlert[] {
    return this.alerts.filter(a => !a.resolved);
  }

  /**
   * TP-024: Get critical alerts only
   */
  getCriticalAlerts(): MonitoringAlert[] {
    return this.alerts.filter(a => !a.resolved && a.severity === 'critical');
  }

  /**
   * TP-024: Mark alert as resolved
   */
  resolveAlert(alertId: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.resolved = true;
      alert.resolvedAt = new Date();
      return true;
    }
    return false;
  }

  /**
   * TP-024: Clear all resolved alerts older than 24 hours
   */
  cleanupResolvedAlerts(): number {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const initialCount = this.alerts.length;
    
    this.alerts = this.alerts.filter(a => 
      !a.resolved || 
      !a.resolvedAt || 
      a.resolvedAt > cutoff
    );

    return initialCount - this.alerts.length;
  }

  /**
   * Private helper methods
   */
  private async getProjectsWithIssuesCount(): Promise<number> {
    try {
      const criticalProjects = await getCriticalProjectIssues();
      return criticalProjects.length;
    } catch (error) {
      logger.error('Failed to get projects with issues count', error as Error);
      return 0;
    }
  }

  private determineServiceHealthStatus(activeAlerts: MonitoringAlert[]): 'healthy' | 'degraded' | 'critical' {
    const criticalCount = activeAlerts.filter(a => a.severity === 'critical').length;
    const highCount = activeAlerts.filter(a => a.severity === 'high').length;
    
    if (criticalCount > 0) return 'critical';
    if (highCount > 2) return 'degraded';
    return 'healthy';
  }
}

// Singleton instance for monitoring
export const reportMonitoringService = new ReportMonitoringService(); 