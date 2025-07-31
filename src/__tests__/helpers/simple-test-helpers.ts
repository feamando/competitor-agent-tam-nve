/**
 * Task 8.1: Simplified Test Helpers
 * 
 * Essential utilities for comprehensive integration testing
 * without complex database schema dependencies
 */

import { logger, generateCorrelationId } from '@/lib/logger';

// Test Configuration
export const TEST_CONFIG = {
  timeouts: {
    analysis: 60000,      // 1 minute
    report: 90000,        // 1.5 minutes  
    workflow: 120000,     // 2 minutes
    api: 15000           // 15 seconds
  },
  performance: {
    analysisMaxTime: 45000,
    reportMaxTime: 60000,
    workflowMaxTime: 90000,
    memoryThresholdMB: 512,
    qualityScoreMin: 0.75
  },
  api: {
    baseUrl: 'http://localhost:3000'
  }
};

// Performance Monitor
export class SimplePerformanceTracker {
  private measurements: Map<string, number[]> = new Map();
  private startTimes: Map<string, number> = new Map();

  start(operationName: string): void {
    this.startTimes.set(operationName, Date.now());
  }

  end(operationName: string): number {
    const startTime = this.startTimes.get(operationName);
    if (!startTime) {
      throw new Error(`No start time found for operation: ${operationName}`);
    }

    const duration = Date.now() - startTime;
    
    if (!this.measurements.has(operationName)) {
      this.measurements.set(operationName, []);
    }
    this.measurements.get(operationName)!.push(duration);
    
    this.startTimes.delete(operationName);
    return duration;
  }

  getMemoryUsage(): { current: number; delta: number } {
    const current = process.memoryUsage();
    const currentMB = current.heapUsed / 1024 / 1024;
    return {
      current: currentMB,
      delta: currentMB // Simplified delta calculation
    };
  }

  getStatistics(operationName: string) {
    const measurements = this.measurements.get(operationName) || [];
    if (measurements.length === 0) {
      return null;
    }

    const sorted = [...measurements].sort((a, b) => a - b);
    const count = sorted.length;
    const sum = sorted.reduce((a, b) => a + b, 0);
    
    return {
      avg: sum / count,
      min: sorted[0],
      max: sorted[count - 1],
      median: sorted[Math.floor(count / 2)],
      p95: sorted[Math.floor(count * 0.95)],
      count
    };
  }

  validatePerformance(
    operationName: string, 
    maxDuration: number, 
    description: string
  ): boolean {
    const stats = this.getStatistics(operationName);
    if (!stats) {
      return false;
    }

    const passed = stats.avg < maxDuration;
    
    logger.info(`Performance validation: ${description}`, {
      operation: operationName,
      passed,
      avgDuration: `${stats.avg.toFixed(2)}ms`,
      maxAllowed: `${maxDuration}ms`,
      measurements: stats.count
    });

    return passed;
  }

  reset(): void {
    this.measurements.clear();
    this.startTimes.clear();
  }
}

// API Test Utilities
export class SimpleAPIUtils {
  static async makeAnalysisRequest(
    projectId: string,
    options: any = {},
    correlationId?: string
  ): Promise<Response> {
    const testCorrelationId = correlationId || generateCorrelationId();
    
    return fetch(`${TEST_CONFIG.api.baseUrl}/api/projects/${projectId}/analysis`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Correlation-ID': testCorrelationId
      },
      body: JSON.stringify({
        analysisConfig: {
          focusAreas: ['features', 'positioning', 'user_experience'],
          depth: 'detailed',
          includeRecommendations: true,
          enhanceWithAI: true,
          consolidatedServiceV15: true,
          ...options
        },
        testMode: true
      })
    });
  }

  static async makeReportRequest(
    projectId: string,
    options: any = {},
    correlationId?: string
  ): Promise<Response> {
    const testCorrelationId = correlationId || generateCorrelationId();
    
    return fetch(`${TEST_CONFIG.api.baseUrl}/api/reports/auto-generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Correlation-ID': testCorrelationId
      },
      body: JSON.stringify({
        projectId,
        template: 'comprehensive',
        immediate: true,
        reportOptions: {
          includeRecommendations: true,
          enhanceWithAI: true,
          includeDataFreshness: true,
          consolidatedServiceV15: true,
          ...options
        },
        testMode: true
      })
    });
  }

  static async waitForOperation(
    checkFunction: () => Promise<boolean>,
    timeoutMs: number = 30000,
    intervalMs: number = 1000
  ): Promise<boolean> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      if (await checkFunction()) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
    
    return false;
  }

  static async checkServiceHealth(endpoint: string): Promise<boolean> {
    try {
      const response = await fetch(`${TEST_CONFIG.api.baseUrl}${endpoint}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      return response.ok;
    } catch (error) {
      logger.warn(`Service health check failed for ${endpoint}`, { error: (error as Error).message });
      return false;
    }
  }
}

// Quality Validator
export class SimpleQualityValidator {
  static validateAnalysisResult(result: any): {
    isValid: boolean;
    errors: string[];
    qualityScore: number;
  } {
    const errors: string[] = [];
    let qualityScore = 0;

    // Basic structure validation
    if (!result.success) {
      errors.push('Analysis result indicates failure');
      return { isValid: false, errors, qualityScore: 0 };
    }

    qualityScore += 0.2;

    if (!result.analysis) {
      errors.push('Missing analysis data');
    } else {
      qualityScore += 0.2;

      if (result.analysis.id) {
        qualityScore += 0.1;
      }

      if (result.analysis.summary && result.analysis.summary.length > 100) {
        qualityScore += 0.2;
      }

      if (result.analysis.metadata) {
        qualityScore += 0.1;
        
        if (result.analysis.metadata.serviceVersion?.includes('consolidated')) {
          qualityScore += 0.1;
        }
      }
    }

    // Quality metrics validation
    if (result.quality && result.quality.overallScore >= TEST_CONFIG.performance.qualityScoreMin) {
      qualityScore += 0.2;
    }

    return {
      isValid: errors.length === 0,
      errors,
      qualityScore: Math.min(qualityScore, 1.0)
    };
  }

  static validateReportResult(result: any): {
    isValid: boolean;
    errors: string[];
    completenessScore: number;
  } {
    const errors: string[] = [];
    let completenessScore = 0;

    // Basic structure validation
    if (!result.success) {
      errors.push('Report result indicates failure');
      return { isValid: false, errors, completenessScore: 0 };
    }

    completenessScore += 0.2;

    if (!result.report) {
      errors.push('Missing report data');
    } else {
      completenessScore += 0.2;

      if (result.report.id) {
        completenessScore += 0.1;
      }

      if (result.report.content && result.report.content.length > 1000) {
        completenessScore += 0.3;
      }

      if (result.report.format === 'markdown') {
        completenessScore += 0.1;
      }

      if (result.report.metadata) {
        completenessScore += 0.1;
        
        if (result.report.metadata.serviceVersion?.includes('consolidated')) {
          completenessScore += 0.1;
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      completenessScore: Math.min(completenessScore, 1.0)
    };
  }
}

// Test Reporter
export class SimpleTestReporter {
  private testResults: Array<{
    testName: string;
    success: boolean;
    duration: number;
    details: any;
    timestamp: Date;
  }> = [];

  recordTest(
    testName: string,
    success: boolean,
    duration: number,
    details: any = {}
  ): void {
    this.testResults.push({
      testName,
      success,
      duration,
      details,
      timestamp: new Date()
    });

    logger.info(`Test recorded: ${testName}`, {
      success,
      duration: `${duration}ms`,
      details
    });
  }

  generateSummary(): {
    totalTests: number;
    passed: number;
    failed: number;
    totalDuration: number;
    successRate: number;
  } {
    const totalTests = this.testResults.length;
    const passed = this.testResults.filter(r => r.success).length;
    const failed = totalTests - passed;
    const totalDuration = this.testResults.reduce((sum, r) => sum + r.duration, 0);
    const successRate = totalTests > 0 ? (passed / totalTests) * 100 : 0;

    return {
      totalTests,
      passed,
      failed,
      totalDuration,
      successRate
    };
  }

  getFailedTests(): Array<{
    testName: string;
    details: any;
    timestamp: Date;
  }> {
    return this.testResults
      .filter(r => !r.success)
      .map(r => ({
        testName: r.testName,
        details: r.details,
        timestamp: r.timestamp
      }));
  }

  reset(): void {
    this.testResults = [];
  }
}

// Test Data Generators
export class SimpleTestDataGenerator {
  private static counter = 0;

  static getUniqueId(prefix: string = 'test'): string {
    this.counter++;
    return `test-${prefix}-${this.counter}-${Date.now()}`;
  }

  static generateTestProject() {
    return {
      id: this.getUniqueId('project'),
      name: `Test Project ${this.counter}`,
      productName: `Test Product ${this.counter}`,
      competitors: [
        `Test Competitor 1-${this.counter}`,
        `Test Competitor 2-${this.counter}`,
        `Test Competitor 3-${this.counter}`
      ]
    };
  }

  static generateAnalysisRequest(projectId: string) {
    return {
      projectId,
      analysisConfig: {
        focusAreas: ['features', 'positioning', 'user_experience'],
        depth: 'detailed',
        includeRecommendations: true,
        enhanceWithAI: true,
        consolidatedServiceV15: true
      },
      testMode: true
    };
  }

  static generateReportRequest(projectId: string) {
    return {
      projectId,
      template: 'comprehensive',
      immediate: true,
      reportOptions: {
        includeRecommendations: true,
        enhanceWithAI: true,
        includeDataFreshness: true,
        consolidatedServiceV15: true
      },
      testMode: true
    };
  }
}

// Helper function to run test with comprehensive tracking
export async function runTrackedTest<T>(
  testName: string,
  testFunction: () => Promise<T>,
  options: {
    timeout?: number;
    trackPerformance?: boolean;
  } = {}
): Promise<T> {
  const { timeout = 60000, trackPerformance = true } = options;
  const tracker = new SimplePerformanceTracker();
  const reporter = new SimpleTestReporter();
  
  const startTime = Date.now();
  let result: T;
  let success = false;
  let error: Error | null = null;

  try {
    if (trackPerformance) {
      tracker.start(testName);
    }

    // Run test with timeout
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Test timeout: ${testName}`)), timeout)
    );

    result = await Promise.race([testFunction(), timeoutPromise]);
    success = true;

    if (trackPerformance) {
      tracker.end(testName);
    }

  } catch (err) {
    error = err as Error;
    success = false;
    throw err;
  } finally {
    const duration = Date.now() - startTime;
    
    reporter.recordTest(testName, success, duration, {
      error: error?.message,
      memoryUsage: tracker.getMemoryUsage(),
      timeout,
      trackPerformance
    });
  }

  return result!;
}

// Export singleton instances
export const performanceTracker = new SimplePerformanceTracker();
export const apiUtils = new SimpleAPIUtils();
export const qualityValidator = new SimpleQualityValidator();
export const testReporter = new SimpleTestReporter();
export const testDataGenerator = new SimpleTestDataGenerator(); 