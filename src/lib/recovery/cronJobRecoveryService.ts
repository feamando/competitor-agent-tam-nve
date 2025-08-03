import { prisma } from '@/lib/prisma';
import { logger, generateCorrelationId, trackBusinessEvent } from '@/lib/logger';
import * as cron from 'node-cron';

export interface CronJobHealth {
  jobId: string;
  isActive: boolean;
  isScheduled: boolean;
  hasDbRecord: boolean;
  lastExecution?: Date;
  nextExecution?: Date;
  consecutiveFailures: number;
  healthStatus: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' | 'DISCONNECTED' | 'ZOMBIE';
  issues: string[];
  cronPattern?: string;
  projectId?: string | undefined;
}

export interface CronJobRecoveryOptions {
  forceRestart?: boolean;
  cleanupZombieJobs?: boolean;
  recreateDbRecords?: boolean;
  validateCronPatterns?: boolean;
}

export interface CronJobRecoveryResult {
  success: boolean;
  jobsProcessed: number;
  jobsFixed: number;
  jobsRemoved: number;
  jobsCreated: number;
  recoveryTime: number;
  errors: string[];
  warnings: string[];
  healthReport: CronJobHealth[];
}

export class CronJobRecoveryService {
  private static instance: CronJobRecoveryService;
  private activeCronJobs: Map<string, cron.ScheduledTask> = new Map();
  private jobHealthMap: Map<string, CronJobHealth> = new Map();

  public static getInstance(): CronJobRecoveryService {
    if (!CronJobRecoveryService.instance) {
      CronJobRecoveryService.instance = new CronJobRecoveryService();
    }
    return CronJobRecoveryService.instance;
  }

  /**
   * Fix degraded cron job execution system
   * Task 3.1: Main recovery method
   */
  public async fixDegradedCronJobs(
    options: CronJobRecoveryOptions = {}
  ): Promise<CronJobRecoveryResult> {
    const startTime = Date.now();
    const correlationId = generateCorrelationId();
    const context = { correlationId, operation: 'fixDegradedCronJobs' };

    logger.info('Starting cron job recovery process', context);

    const result: CronJobRecoveryResult = {
      success: false,
      jobsProcessed: 0,
      jobsFixed: 0,
      jobsRemoved: 0,
      jobsCreated: 0,
      recoveryTime: 0,
      errors: [],
      warnings: [],
      healthReport: []
    };

    try {
      // Step 1: Audit current cron job state
      logger.info('Step 1: Auditing current cron job state', context);
      const auditResult = await this.auditCronJobHealth();
      result.healthReport = auditResult.healthReport;
      result.jobsProcessed = auditResult.totalJobs;

      // Step 2: Identify and fix disconnected jobs (Task 3.1 core issue)
      logger.info('Step 2: Fixing disconnected cron jobs', context);
      const disconnectedJobs = auditResult.healthReport.filter(job => 
        job.healthStatus === 'DISCONNECTED' || job.healthStatus === 'ZOMBIE'
      );

      for (const job of disconnectedJobs) {
        try {
          const fixResult = await this.fixDisconnectedJob(job, options);
          if (fixResult.success) {
            if (fixResult.action === 'fixed') result.jobsFixed++;
            if (fixResult.action === 'removed') result.jobsRemoved++;
            if (fixResult.action === 'created') result.jobsCreated++;
          } else {
            result.errors.push(`Failed to fix job ${job.jobId}: ${fixResult.error}`);
          }
        } catch (error) {
          result.errors.push(`Error fixing job ${job.jobId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      // Step 3: Restart degraded jobs
      logger.info('Step 3: Restarting degraded jobs', context);
      const degradedJobs = auditResult.healthReport.filter(job => 
        job.healthStatus === 'DEGRADED' || job.healthStatus === 'UNHEALTHY'
      );

      for (const job of degradedJobs) {
        try {
          const restartResult = await this.restartDegradedJob(job, options);
          if (restartResult.success) {
            result.jobsFixed++;
          } else {
            result.warnings.push(`Failed to restart job ${job.jobId}: ${restartResult.error}`);
          }
        } catch (error) {
          result.warnings.push(`Error restarting job ${job.jobId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      // Step 4: Cleanup zombie jobs if requested
      if (options.cleanupZombieJobs) {
        logger.info('Step 4: Cleaning up zombie jobs', context);
        const cleanupResult = await this.cleanupZombieJobs();
        result.jobsRemoved += cleanupResult.removedCount;
        result.warnings.push(...cleanupResult.warnings);
      }

      result.recoveryTime = Date.now() - startTime;
      result.success = result.errors.length === 0 && (result.jobsFixed > 0 || result.jobsCreated > 0 || disconnectedJobs.length === 0);

      // Track recovery event
      trackBusinessEvent('cron_job_recovery_completed', {
        jobsProcessed: result.jobsProcessed,
        jobsFixed: result.jobsFixed,
        jobsRemoved: result.jobsRemoved,
        jobsCreated: result.jobsCreated,
        recoveryTime: result.recoveryTime,
        success: result.success,
        correlationId
      });

      logger.info('Cron job recovery completed', {
        ...context,
        ...result
      });

      return result;

    } catch (error) {
      result.errors.push(`Recovery process failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      result.recoveryTime = Date.now() - startTime;
      
      logger.error('Cron job recovery process failed', error as Error, context);
      return result;
    }
  }

  /**
   * Audit current cron job health status
   */
  private async auditCronJobHealth(): Promise<{
    healthReport: CronJobHealth[];
    totalJobs: number;
    healthyJobs: number;
    degradedJobs: number;
    disconnectedJobs: number;
  }> {
    const healthReport: CronJobHealth[] = [];

    try {
      // Get all report schedules from database
      const reportSchedules = await prisma.reportSchedule.findMany({
        include: {
          report: {
            include: {
              project: {
                select: {
                  id: true,
                  name: true,
                  status: true
                }
              }
            }
          }
        }
      });

      logger.info('Database report schedules found', { count: reportSchedules.length });

      // Analyze each report schedule
      for (const schedule of reportSchedules) {
        const jobId = `scheduled-report-${schedule.reportId || schedule.id}`;
        
        const health: CronJobHealth = {
          jobId,
          isActive: schedule.status === 'ACTIVE',
          isScheduled: this.activeCronJobs.has(jobId),
          hasDbRecord: true,
          lastExecution: schedule.lastRun ? schedule.lastRun : undefined,
          nextExecution: schedule.nextRun,
          consecutiveFailures: 0,
          healthStatus: 'HEALTHY',
          issues: [],
          cronPattern: this.convertFrequencyToCron(schedule.frequency, schedule.customCron),
          projectId: schedule.report?.project?.id
        };

        // Determine health status
        if (!health.isScheduled && health.isActive) {
          health.healthStatus = 'DISCONNECTED';
          health.issues.push('Active in DB but no running cron job');
        } else if (health.isScheduled && !health.isActive) {
          health.healthStatus = 'DEGRADED';
          health.issues.push('Cron job running but marked inactive in DB');
        } else if (!health.lastExecution && health.isActive) {
          health.healthStatus = 'DEGRADED';
          health.issues.push('Never executed despite being active');
        } else if (health.lastExecution && health.nextExecution) {
          const now = new Date();
          if (health.nextExecution < now) {
            const overdue = Math.round((now.getTime() - health.nextExecution.getTime()) / (60 * 1000));
            if (overdue > 60) { // More than 1 hour overdue
              health.healthStatus = 'UNHEALTHY';
              health.issues.push(`Overdue by ${overdue} minutes`);
            } else if (overdue > 15) { // More than 15 minutes overdue
              health.healthStatus = 'DEGRADED';
              health.issues.push(`Overdue by ${overdue} minutes`);
            }
          }
        }

        healthReport.push(health);
        this.jobHealthMap.set(jobId, health);
      }

      // Check for zombie cron jobs (running but no DB record)
      for (const [jobId, cronTask] of this.activeCronJobs) {
        if (!healthReport.find(h => h.jobId === jobId)) {
          const zombieHealth: CronJobHealth = {
            jobId,
            isActive: false,
            isScheduled: true,
            hasDbRecord: false,
            consecutiveFailures: 0,
            healthStatus: 'ZOMBIE',
            issues: ['Cron job running but no database record found'],
            projectId: this.extractProjectIdFromJobId(jobId)
          };
          
          healthReport.push(zombieHealth);
          this.jobHealthMap.set(jobId, zombieHealth);
        }
      }

      const summary = {
        healthReport,
        totalJobs: healthReport.length,
        healthyJobs: healthReport.filter(h => h.healthStatus === 'HEALTHY').length,
        degradedJobs: healthReport.filter(h => h.healthStatus === 'DEGRADED' || h.healthStatus === 'UNHEALTHY').length,
        disconnectedJobs: healthReport.filter(h => h.healthStatus === 'DISCONNECTED' || h.healthStatus === 'ZOMBIE').length
      };

      logger.info('Cron job health audit completed', summary);
      return summary;

    } catch (error) {
      logger.error('Cron job health audit failed', error as Error);
      return {
        healthReport,
        totalJobs: 0,
        healthyJobs: 0,
        degradedJobs: 0,
        disconnectedJobs: 0
      };
    }
  }

  /**
   * Fix a disconnected cron job (Task 3.1 core fix)
   */
  private async fixDisconnectedJob(
    job: CronJobHealth,
    options: CronJobRecoveryOptions
  ): Promise<{ success: boolean; action: 'fixed' | 'removed' | 'created'; error?: string }> {
    const context = { jobId: job.jobId, projectId: job.projectId };
    
    logger.info('Fixing disconnected cron job', context);

    try {
      if (job.healthStatus === 'DISCONNECTED') {
        // Active in DB but no cron job - create the cron job
        if (job.cronPattern && job.projectId) {
          const cronTask = cron.schedule(job.cronPattern, async () => {
            await this.executeCronJob(job.jobId, job.projectId!);
          }, {
            scheduled: false
          });

          this.activeCronJobs.set(job.jobId, cronTask);
          cronTask.start();

          logger.info('Created missing cron job', context);
          return { success: true, action: 'created' };
        } else {
          logger.warn('Cannot create cron job - missing pattern or project ID', context);
          return { success: false, error: 'Missing cron pattern or project ID' };
        }

      } else if (job.healthStatus === 'ZOMBIE') {
        // Cron job running but no DB record
        if (options.recreateDbRecords) {
          // Try to recreate DB record if we can identify the project
          const success = await this.recreateDbRecord(job);
          if (success) {
            return { success: true, action: 'created' };
          }
        }
        
        // Remove zombie cron job
        const cronTask = this.activeCronJobs.get(job.jobId);
        if (cronTask) {
          cronTask.stop();
          cronTask.destroy();
          this.activeCronJobs.delete(job.jobId);
          
          logger.info('Removed zombie cron job', context);
          return { success: true, action: 'removed' };
        }
      }

      return { success: false, error: 'Unknown disconnection type' };

    } catch (error) {
      logger.error('Failed to fix disconnected job', error as Error, context);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        action: 'fixed'
      };
    }
  }

  /**
   * Restart a degraded cron job
   */
  private async restartDegradedJob(
    job: CronJobHealth,
    options: CronJobRecoveryOptions
  ): Promise<{ success: boolean; error?: string }> {
    const context = { jobId: job.jobId, projectId: job.projectId };
    
    logger.info('Restarting degraded cron job', context);

    try {
      // Stop existing cron job if it exists
      const existingCronTask = this.activeCronJobs.get(job.jobId);
      if (existingCronTask) {
        existingCronTask.stop();
        existingCronTask.destroy();
      }

      // Create new cron job
      if (job.cronPattern && job.projectId) {
        const cronTask = cron.schedule(job.cronPattern, async () => {
          await this.executeCronJob(job.jobId, job.projectId!);
        }, {
          scheduled: false
        });

        this.activeCronJobs.set(job.jobId, cronTask);
        cronTask.start();

        // Update next run time in database
        await this.updateNextRunTime(job.jobId, job.cronPattern);

        logger.info('Restarted degraded cron job', context);
        return { success: true };
      } else {
        return { success: false, error: 'Missing cron pattern or project ID' };
      }

    } catch (error) {
      logger.error('Failed to restart degraded job', error as Error, context);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Execute a cron job
   */
  private async executeCronJob(jobId: string, projectId: string): Promise<void> {
    const context = { jobId, projectId, operation: 'executeCronJob' };
    
    try {
      logger.info('Executing cron job', context);

      // Update last run time
      await this.updateLastRunTime(jobId);

      // Import and execute report generation
      const { InitialComparativeReportService } = await import('../reports/initialComparativeReportService');
      const reportService = new InitialComparativeReportService();
      
      await reportService.generateInitialComparativeReport(projectId, {
        enableEmergencyMode: false,
        fallbackToPartialData: true,
        correlationId: generateCorrelationId()
      });

      logger.info('Cron job executed successfully', context);

    } catch (error) {
      logger.error('Cron job execution failed', error as Error, context);
      
      // Update health status
      const health = this.jobHealthMap.get(jobId);
      if (health) {
        health.consecutiveFailures++;
        health.issues.push(`Execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        if (health.consecutiveFailures >= 3) {
          health.healthStatus = 'UNHEALTHY';
        }
      }
    }
  }

  /**
   * Clean up zombie cron jobs
   */
  private async cleanupZombieJobs(): Promise<{ removedCount: number; warnings: string[] }> {
    let removedCount = 0;
    const warnings: string[] = [];

    try {
      for (const [jobId, cronTask] of this.activeCronJobs) {
        const health = this.jobHealthMap.get(jobId);
        if (health && health.healthStatus === 'ZOMBIE') {
          cronTask.stop();
          cronTask.destroy();
          this.activeCronJobs.delete(jobId);
          removedCount++;
          
          logger.info('Cleaned up zombie cron job', { jobId });
        }
      }

    } catch (error) {
      warnings.push(`Zombie cleanup error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return { removedCount, warnings };
  }

  /**
   * Convert frequency enum to cron pattern
   */
  private convertFrequencyToCron(frequency: string, customCron?: string | null): string {
    if (customCron) return customCron;
    
    switch (frequency) {
      case 'DAILY': return '0 0 * * *';
      case 'WEEKLY': return '0 0 * * 0';
      case 'BIWEEKLY': return '0 0 * * 0/2';
      case 'MONTHLY': return '0 0 1 * *';
      default: return '0 0 * * *'; // Default to daily
    }
  }

  /**
   * Extract project ID from job ID
   */
  private extractProjectIdFromJobId(jobId: string): string | undefined {
    // Extract from format: scheduled-report-{reportId}
    const match = jobId.match(/scheduled-report-(.+)/);
    return match ? match[1] : undefined;
  }

  /**
   * Recreate database record for zombie job
   */
  private async recreateDbRecord(job: CronJobHealth): Promise<boolean> {
    try {
      // This is a simplified recreation - in practice you'd need more project context
      logger.info('Attempting to recreate DB record for zombie job', { jobId: job.jobId });
      
      // For now, we'll just log this as it requires specific project context
      logger.warn('Cannot recreate DB record without project context', { jobId: job.jobId });
      return false;

    } catch (error) {
      logger.error('Failed to recreate DB record', error as Error, { jobId: job.jobId });
      return false;
    }
  }

  /**
   * Update last run time in database
   */
  private async updateLastRunTime(jobId: string): Promise<void> {
    try {
      const reportId = jobId.replace('scheduled-report-', '');
      await prisma.reportSchedule.updateMany({
        where: { reportId },
        data: { lastRun: new Date() }
      });
    } catch (error) {
      logger.error('Failed to update last run time', error as Error, { jobId });
    }
  }

  /**
   * Update next run time in database
   */
  private async updateNextRunTime(jobId: string, cronPattern: string): Promise<void> {
    try {
      const reportId = jobId.replace('scheduled-report-', '');
      const nextRun = this.calculateNextRun(cronPattern);
      
      await prisma.reportSchedule.updateMany({
        where: { reportId },
        data: { nextRun }
      });
    } catch (error) {
      logger.error('Failed to update next run time', error as Error, { jobId });
    }
  }

  /**
   * Calculate next run time from cron pattern
   */
  private calculateNextRun(cronPattern: string): Date {
    // Simple calculation - in practice you'd use a proper cron parser
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return tomorrow;
  }

  /**
   * Get current health status of all cron jobs
   */
  public async getHealthStatus(): Promise<CronJobHealth[]> {
    const audit = await this.auditCronJobHealth();
    return audit.healthReport;
  }
}

// Export singleton instance
export const cronJobRecoveryService = CronJobRecoveryService.getInstance(); 