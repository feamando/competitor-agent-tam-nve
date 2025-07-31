/**
 * Enhanced ReportScheduler Sub-service - Task 5.3
 * Migrates scheduling logic from AutoReportGenerationService
 * Focuses exclusively on comparative report scheduling
 */

import Bull from 'bull';
import * as cron from 'node-cron';
import { logger, generateCorrelationId, trackBusinessEvent, trackErrorWithCorrelation } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import {
  IReportScheduler,
  ReportSchedule,
  ScheduleResult,
  ReportTaskResult,
  ScheduleStatus,
  ScheduleInfo,
  ReportTask,
  QueueOptions,
  ReportSchedulerConfig,
  ScheduleFrequency,
  Priority
} from './types';

/**
 * Enhanced ReportScheduler Implementation - Task 5.3
 * Migrated from AutoReportGenerationService.schedulePeriodicReports()
 */
export class ReportScheduler implements IReportScheduler {
  private queue: Bull.Queue;
  private config: ReportSchedulerConfig;
  private scheduledJobs: Map<string, cron.ScheduledTask> = new Map();
  private activeSchedules: Map<string, ReportSchedule> = new Map();

  constructor(config: ReportSchedulerConfig) {
    this.config = config;
    this.queue = config.queue;
    
    logger.info('ReportScheduler initialized', {
      service: 'ReportScheduler',
      comparativeOnly: config.comparativeOnly,
      maxSchedules: config.maxSchedules,
      defaultFrequency: config.defaultFrequency
    });
  }

  /**
   * Create schedule for comparative reports - migrated from AutoReportGenerationService.schedulePeriodicReports()
   */
  async createSchedule(projectId: string, schedule: ReportSchedule): Promise<ScheduleResult> {
    const correlationId = generateCorrelationId();
    const context = { projectId, scheduleId: schedule.id, frequency: schedule.frequency, correlationId };

    try {
      logger.info('Creating report schedule', context);

      // Validate schedule for comparative reports only (Task 5.3)
      if (schedule.reportType !== 'comparative') {
        throw new Error('Only comparative report scheduling is supported in unified ReportingService');
      }

      // Validate project exists and has competitors
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
          competitors: { select: { id: true } }
        }
      });

      if (!project || !project.competitors || project.competitors.length === 0) {
        throw new Error(`Project ${projectId} not found or has no competitors for scheduling`);
      }

      // Calculate next run time based on frequency
      const nextRunTime = this.calculateNextRunTime(schedule.frequency, schedule.startDate);

      // Create enhanced schedule record
      const enhancedSchedule: ReportSchedule = {
        ...schedule,
        nextRunTime,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastExecuted: undefined,
        executionCount: 0,
        failureCount: 0
      };

      // Store schedule in database (extend Prisma schema as needed)
      await prisma.project.update({
        where: { id: projectId },
        data: {
          parameters: {
            autoReportSchedule: enhancedSchedule
          }
        }
      });

      // Set up cron job for scheduling
      const cronPattern = this.getCronPattern(schedule.frequency);
      const cronJob = cron.schedule(cronPattern, async () => {
        await this.executeScheduledReport(schedule.id);
      }, {
        scheduled: true,
        timezone: 'UTC'
      });

      // Store cron job and schedule
      this.scheduledJobs.set(schedule.id, cronJob);
      this.activeSchedules.set(schedule.id, enhancedSchedule);

      trackBusinessEvent('report_schedule_created', {
        ...context,
        reportTemplate: schedule.template,
        nextRunTime: nextRunTime.toISOString()
      });

      logger.info('Report schedule created successfully', {
        ...context,
        nextRunTime: nextRunTime.toISOString(),
        cronPattern
      });

      return {
        success: true,
        scheduleId: schedule.id,
        nextRun: nextRunTime,
        cronPattern,
        message: 'Schedule created successfully'
      };

    } catch (error) {
      logger.error('Failed to create report schedule', error as Error, context);
      
      trackErrorWithCorrelation(
        error as Error,
        correlationId,
        'report_schedule_creation_failed',
        context
      );

      return {
        success: false,
        scheduleId: schedule.id,
        error: (error as Error).message,
        message: 'Failed to create schedule'
      };
    }
  }

  /**
   * Update existing schedule
   */
  async updateSchedule(scheduleId: string, schedule: Partial<ReportSchedule>): Promise<ScheduleResult> {
    const correlationId = generateCorrelationId();
    const context = { scheduleId, correlationId };

    try {
      logger.info('Updating report schedule', context);

      const existingSchedule = this.activeSchedules.get(scheduleId);
      if (!existingSchedule) {
        throw new Error(`Schedule ${scheduleId} not found`);
      }

      // Update schedule
      const updatedSchedule: ReportSchedule = {
        ...existingSchedule,
        ...schedule,
        updatedAt: new Date()
      };

      // Update database
      await prisma.project.update({
        where: { id: existingSchedule.projectId },
        data: {
          parameters: {
            autoReportSchedule: updatedSchedule
          }
        }
      });

      // Update cron job if frequency changed
      if (schedule.frequency && schedule.frequency !== existingSchedule.frequency) {
        const oldCronJob = this.scheduledJobs.get(scheduleId);
        if (oldCronJob) {
          oldCronJob.stop();
        }

        const newCronPattern = this.getCronPattern(schedule.frequency);
        const newCronJob = cron.schedule(newCronPattern, async () => {
          await this.executeScheduledReport(scheduleId);
        }, {
          scheduled: true,
          timezone: 'UTC'
        });

        this.scheduledJobs.set(scheduleId, newCronJob);
      }

      this.activeSchedules.set(scheduleId, updatedSchedule);

      logger.info('Report schedule updated successfully', context);

      return {
        success: true,
        scheduleId,
        message: 'Schedule updated successfully'
      };

    } catch (error) {
      logger.error('Failed to update report schedule', error as Error, context);
      
      return {
        success: false,
        scheduleId,
        error: (error as Error).message,
        message: 'Failed to update schedule'
      };
    }
  }

  /**
   * Delete schedule
   */
  async deleteSchedule(scheduleId: string): Promise<void> {
    const correlationId = generateCorrelationId();
    const context = { scheduleId, correlationId };

    try {
      logger.info('Deleting report schedule', context);

      // Stop and remove cron job
      const cronJob = this.scheduledJobs.get(scheduleId);
      if (cronJob) {
        cronJob.stop();
        this.scheduledJobs.delete(scheduleId);
      }

      // Remove from active schedules
      const schedule = this.activeSchedules.get(scheduleId);
      if (schedule) {
        // Update database to mark as inactive
        await prisma.project.update({
          where: { id: schedule.projectId },
          data: {
            parameters: {
              autoReportSchedule: {
                ...schedule,
                isActive: false,
                updatedAt: new Date()
              }
            }
          }
        });

        this.activeSchedules.delete(scheduleId);
      }

      logger.info('Report schedule deleted successfully', context);

    } catch (error) {
      logger.error('Failed to delete report schedule', error as Error, context);
      throw error;
    }
  }

  /**
   * Execute scheduled report - migrated from AutoReportGenerationService.executeScheduledReport()
   */
  async executeScheduledReport(scheduleId: string): Promise<ReportTaskResult> {
    const correlationId = generateCorrelationId();
    const context = { scheduleId, correlationId };

    try {
      logger.info('Executing scheduled report', context);

      const schedule = this.activeSchedules.get(scheduleId);
      if (!schedule) {
        throw new Error(`Schedule ${scheduleId} not found`);
      }

      // Get project and competitors
      const project = await prisma.project.findUnique({
        where: { id: schedule.projectId },
        include: {
          competitors: { select: { id: true } }
        }
      });

      if (!project || !project.competitors || project.competitors.length === 0) {
        logger.warn('Project not found or has no competitors for scheduled report', {
          ...context,
          projectId: schedule.projectId
        });
        throw new Error('Project not ready for scheduled report generation');
      }

      // Create report task for queue processing
      const task: ReportTask = {
        id: generateCorrelationId(),
        projectId: schedule.projectId,
        type: 'comparative',
        priority: schedule.priority || 'normal',
        template: schedule.template,
        reportName: `Scheduled ${schedule.frequency} Report - ${project.name}`,
        triggeredBy: 'schedule',
        scheduleId: scheduleId,
        correlationId,
        createdAt: new Date(),
        options: {
          template: schedule.template,
          format: 'markdown',
          enhanceWithAI: schedule.enhanceWithAI || false,
          includeDataFreshness: true
        }
      };

      // Add to queue with appropriate priority
      const queueOptions: QueueOptions = {
        priority: this.getPriorityScore(schedule.priority || 'normal'),
        delay: 0,
        attempts: 3,
        backoff: 'exponential'
      };

      await this.queue.add('comparative', task, queueOptions);

      // Update schedule execution tracking
      const updatedSchedule = {
        ...schedule,
        lastExecuted: new Date(),
        nextRunTime: this.calculateNextRunTime(schedule.frequency),
        executionCount: (schedule.executionCount || 0) + 1,
        updatedAt: new Date()
      };

      // Update database
      await prisma.project.update({
        where: { id: schedule.projectId },
        data: {
          parameters: {
            autoReportSchedule: updatedSchedule
          }
        }
      });

      this.activeSchedules.set(scheduleId, updatedSchedule);

      trackBusinessEvent('scheduled_report_executed', {
        ...context,
        projectId: schedule.projectId,
        taskId: task.id,
        frequency: schedule.frequency
      });

      logger.info('Scheduled report task queued successfully', {
        ...context,
        taskId: task.id,
        projectId: schedule.projectId,
        nextRunTime: updatedSchedule.nextRunTime.toISOString()
      });

      return {
        taskId: task.id,
        status: 'queued',
        queuePosition: await this.queue.waiting() + 1,
        estimatedCompletion: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes estimate
        projectId: schedule.projectId
      };

    } catch (error) {
      logger.error('Failed to execute scheduled report', error as Error, context);
      
      // Update failure count
      const schedule = this.activeSchedules.get(scheduleId);
      if (schedule) {
        const updatedSchedule = {
          ...schedule,
          failureCount: (schedule.failureCount || 0) + 1,
          lastError: (error as Error).message,
          updatedAt: new Date()
        };

        this.activeSchedules.set(scheduleId, updatedSchedule);
      }

      throw error;
    }
  }

  /**
   * Get next scheduled run time
   */
  async getNextScheduledRun(scheduleId: string): Promise<Date> {
    const schedule = this.activeSchedules.get(scheduleId);
    if (!schedule) {
      throw new Error(`Schedule ${scheduleId} not found`);
    }
    return schedule.nextRunTime;
  }

  /**
   * Adjust frequency based on market changes (intelligent scheduling)
   */
  async adjustFrequencyBasedOnMarketChanges(projectId: string): Promise<void> {
    const correlationId = generateCorrelationId();
    const context = { projectId, correlationId };

    try {
      logger.info('Adjusting schedule frequency based on market changes', context);

      // TODO: Implement intelligent frequency adjustment
      // This would analyze market change velocity and adjust frequency accordingly
      // For now, this is a placeholder

      logger.info('Frequency adjustment completed', context);

    } catch (error) {
      logger.error('Failed to adjust schedule frequency', error as Error, context);
      throw error;
    }
  }

  /**
   * Predict optimal schedule (intelligent scheduling)
   */
  async predictOptimalSchedule(projectId: string): Promise<ReportSchedule> {
    const correlationId = generateCorrelationId();
    
    try {
      logger.info('Predicting optimal schedule', { projectId, correlationId });

      // TODO: Implement ML-based schedule prediction
      // For now, return a default optimal schedule
      
      return {
        id: generateCorrelationId(),
        projectId,
        frequency: 'weekly',
        reportType: 'comparative',
        template: 'comprehensive',
        priority: 'normal',
        isActive: true,
        enhanceWithAI: true,
        startDate: new Date(),
        nextRunTime: this.calculateNextRunTime('weekly'),
        createdAt: new Date(),
        updatedAt: new Date(),
        executionCount: 0,
        failureCount: 0
      };

    } catch (error) {
      logger.error('Failed to predict optimal schedule', error as Error, { projectId });
      throw error;
    }
  }

  /**
   * Get schedule status
   */
  async getScheduleStatus(scheduleId: string): Promise<ScheduleStatus> {
    const schedule = this.activeSchedules.get(scheduleId);
    
    if (!schedule) {
      return {
        scheduleId,
        status: 'not_found',
        isActive: false,
        message: 'Schedule not found'
      };
    }

    const cronJob = this.scheduledJobs.get(scheduleId);
    const isRunning = cronJob ? cronJob.getStatus() === 'scheduled' : false;

    return {
      scheduleId,
      status: schedule.isActive ? (isRunning ? 'active' : 'paused') : 'inactive',
      isActive: schedule.isActive,
      nextRun: schedule.nextRunTime,
      lastExecuted: schedule.lastExecuted,
      executionCount: schedule.executionCount || 0,
      failureCount: schedule.failureCount || 0,
      lastError: schedule.lastError,
      message: 'Schedule status retrieved successfully'
    };
  }

  /**
   * List project schedules
   */
  async listProjectSchedules(projectId: string): Promise<ScheduleInfo[]> {
    const projectSchedules = Array.from(this.activeSchedules.values())
      .filter(schedule => schedule.projectId === projectId);

    return projectSchedules.map(schedule => ({
      scheduleId: schedule.id,
      projectId: schedule.projectId,
      frequency: schedule.frequency,
      template: schedule.template,
      isActive: schedule.isActive,
      nextRun: schedule.nextRunTime,
      lastExecuted: schedule.lastExecuted,
      executionCount: schedule.executionCount || 0,
      failureCount: schedule.failureCount || 0
    }));
  }

  // Helper methods - migrated from AutoReportGenerationService

  /**
   * Calculate next run time based on frequency
   */
  private calculateNextRunTime(frequency: ScheduleFrequency, startDate?: Date): Date {
    const now = startDate || new Date();
    const nextRun = new Date(now);

    switch (frequency) {
      case 'daily':
        nextRun.setDate(nextRun.getDate() + 1);
        nextRun.setHours(9, 0, 0, 0); // 9 AM
        break;
      case 'weekly':
        nextRun.setDate(nextRun.getDate() + (8 - nextRun.getDay())); // Next Monday
        nextRun.setHours(9, 0, 0, 0);
        break;
      case 'monthly':
        nextRun.setMonth(nextRun.getMonth() + 1);
        nextRun.setDate(1); // First day of next month
        nextRun.setHours(9, 0, 0, 0);
        break;
      default:
        nextRun.setDate(nextRun.getDate() + 7); // Default to weekly
        nextRun.setHours(9, 0, 0, 0);
    }

    return nextRun;
  }

  /**
   * Get cron pattern for frequency - migrated from AutoReportGenerationService.getCronPattern()
   */
  private getCronPattern(frequency: ScheduleFrequency): string {
    switch (frequency) {
      case 'daily':
        return '0 9 * * *'; // 9 AM daily
      case 'weekly':
        return '0 9 * * 1'; // 9 AM every Monday
      case 'monthly':
        return '0 9 1 * *'; // 9 AM on the 1st of each month
      default:
        return '0 9 * * 1'; // Default to weekly
    }
  }

  /**
   * Get priority score for queue ordering
   */
  private getPriorityScore(priority: Priority): number {
    switch (priority) {
      case 'high':
        return 1;
      case 'normal':
        return 2;
      case 'low':
        return 3;
      default:
        return 2;
    }
  }
} 