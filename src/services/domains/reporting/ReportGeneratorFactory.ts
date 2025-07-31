/**
 * ReportGeneratorFactory - Factory for creating ReportGenerator instances
 * Task 5.1: Factory pattern implementation
 */

import { logger } from '@/lib/logger';
import { AnalysisService } from '../AnalysisService';
import { ReportGenerator } from './ReportGenerator';
import { IReportGenerator } from './types';

export interface ReportGeneratorConfig {
  analysisService: AnalysisService;
  config: {
    markdownOnly: boolean;
    maxConcurrency: number;
    timeout: number;
  };
}

/**
 * Factory for creating ReportGenerator instances
 */
export class ReportGeneratorFactory {
  static create(config: ReportGeneratorConfig): IReportGenerator {
    try {
      logger.info('Creating ReportGenerator with factory pattern', {
        markdownOnly: config.config.markdownOnly,
        maxConcurrency: config.config.maxConcurrency,
        timeout: config.config.timeout
      });

      // Create ReportGenerator instance with configuration
      const generator = new ReportGenerator();
      
      // Apply configuration if needed (for future extensibility)
      // In the current implementation, ReportGenerator doesn't need config
      // but this factory allows for future configuration injection
      
      return generator;

    } catch (error) {
      logger.error('Failed to create ReportGenerator', error as Error);
      throw new Error(`ReportGenerator factory failed: ${(error as Error).message}`);
    }
  }
} 