/**
 * ReportProcessorFactory - Factory for creating ReportProcessor instances
 * Task 5.1: Factory pattern implementation
 */

import Bull from 'bull';
import { logger } from '@/lib/logger';
import { AnalysisService } from '../AnalysisService';
import { ReportProcessor } from './ReportProcessor';
import { IReportGenerator, IReportProcessor } from './types';

export interface ReportProcessorConfig {
  queue: Bull.Queue;
  reportGenerator: IReportGenerator;
  analysisService: AnalysisService;
  config: {
    processingTimeout: number;
    retryConfig: any;
    comparativeOnly: boolean;
  };
}

/**
 * Factory for creating ReportProcessor instances
 */
export class ReportProcessorFactory {
  static create(config: ReportProcessorConfig): IReportProcessor {
    try {
      logger.info('Creating ReportProcessor with factory pattern', {
        processingTimeout: config.config.processingTimeout,
        comparativeOnly: config.config.comparativeOnly
      });

      // Create ReportProcessor instance with dependencies
      const processor = new ReportProcessor(
        config.queue,
        config.reportGenerator,
        config.analysisService
      );
      
      // Apply configuration if needed (for future extensibility)
      // In the current implementation, ReportProcessor doesn't need extra config
      // but this factory allows for future configuration injection
      
      return processor;

    } catch (error) {
      logger.error('Failed to create ReportProcessor', error as Error);
      throw new Error(`ReportProcessor factory failed: ${(error as Error).message}`);
    }
  }
} 