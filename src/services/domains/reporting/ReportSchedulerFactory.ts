/**
 * ReportSchedulerFactory - Factory for creating ReportScheduler instances  
 * Task 5.1: Factory pattern implementation
 */

import Bull from 'bull';
import { logger } from '@/lib/logger';
import { ReportScheduler } from './ReportScheduler';
import { IReportScheduler } from './types';

export interface ReportSchedulerConfig {
  queue: Bull.Queue;
  config: {
    comparativeOnly: boolean;
    maxSchedules: number;
    defaultFrequency: string;
  };
}

/**
 * Factory for creating ReportScheduler instances
 */
export class ReportSchedulerFactory {
  static create(config: ReportSchedulerConfig): IReportScheduler {
    try {
      logger.info('Creating ReportScheduler with factory pattern', {
        comparativeOnly: config.config.comparativeOnly,
        maxSchedules: config.config.maxSchedules,
        defaultFrequency: config.config.defaultFrequency
      });

      // Create ReportScheduler instance with queue
      const scheduler = new ReportScheduler(config.queue);
      
      // Apply configuration if needed (for future extensibility)
      // In the current implementation, ReportScheduler doesn't need extra config
      // but this factory allows for future configuration injection
      
      return scheduler;

    } catch (error) {
      logger.error('Failed to create ReportScheduler', error as Error);
      throw new Error(`ReportScheduler factory failed: ${(error as Error).message}`);
    }
  }
} 