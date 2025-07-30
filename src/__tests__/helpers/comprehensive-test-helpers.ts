/**
 * Task 8.1: Comprehensive Test Helpers
 * 
 * Shared utilities and helpers for comprehensive integration testing
 * of consolidated services architecture
 */

import { prisma } from '@/lib/prisma';
import { logger, generateCorrelationId } from '@/lib/logger';
// Type definitions for consolidated services
interface ComparativeAnalysisRequest {
  projectId: string;
  productId: string;
  competitorIds: string[];
  analysisType: string;
  options: any;
  correlationId: string;
  userId: string;
}

interface ComparativeReportRequest {
  projectId: string;
  productId: string;
  competitorIds: string[];
  template: string;
  focusArea: string;
  analysisDepth: string;
  priority: string;
  analysisData: any;
  reportName: string;
  userId: string;
  correlationId: string;
}

interface AnalysisResponse {
  success: boolean;
  analysis: any;
  quality?: any;
}

// Test Data Configuration
export const COMPREHENSIVE_TEST_CONFIG = {
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
  testDataPrefix: 'comprehensive-test',
  cleanupAfterTests: true
};

// Test Data Factory
export class ComprehensiveTestDataFactory {
  private static instanceCounter = 0;

  static getUniqueId(prefix: string = 'test'): string {
    this.instanceCounter++;
    const timestamp = Date.now();
    return `${COMPREHENSIVE_TEST_CONFIG.testDataPrefix}-${prefix}-${this.instanceCounter}-${timestamp}`;
  }

  static createTestProject(overrides: Partial<any> = {}) {
    const id = this.getUniqueId('project');
    return {
      id,
      name: `Comprehensive Test Project ${this.instanceCounter}`,
      description: 'Project for comprehensive integration testing',
      userId: 'test-user-comprehensive',
      industry: 'Technology Testing',
      productName: `Test Product ${this.instanceCounter}`,
      productWebsite: `https://test-product-${this.instanceCounter}.com`,
      positioning: 'Leading comprehensive testing solution',
      customerData: 'Enterprise test customers and QA teams',
      userProblem: 'Need comprehensive testing coverage and validation',
      parameters: '{}',
      tags: '[]',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides
    };
  }

  static createTestProduct(projectId: string, overrides: Partial<any> = {}) {
    const id = this.getUniqueId('product');
    return {
      id,
      projectId,
      name: `Test Product ${this.instanceCounter}`,
      website: `https://test-product-${this.instanceCounter}.com`,
      description: 'Comprehensive test product for integration testing',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides
    };
  }

  static createTestCompetitors(projectId: string, count: number = 3) {
    return Array.from({ length: count }, (_, index) => {
      const id = this.getUniqueId(`competitor-${index + 1}`);
      return {
        id,
        projectId,
        name: `Test Competitor ${index + 1}`,
        website: `https://test-competitor-${index + 1}-${this.instanceCounter}.com`,
        description: `Test competitor ${index + 1} for comprehensive testing`,
        createdAt: new Date(),
        updatedAt: new Date()
      };
    });
  }

  static createAnalysisRequest(
    projectId: string,
    productId: string,
    competitorIds: string[],
    options: Partial<any> = {}
  ): ComparativeAnalysisRequest {
    return {
      projectId,
      productId,
      competitorIds,
      analysisType: 'comparative_analysis',
      options: {
        analysisDepth: 'comprehensive',
        focusAreas: ['features', 'pricing', 'user_experience', 'market_positioning'],
        includeRecommendations: true,
        enhanceWithAI: true,
        forceFreshData: false,
        ...options
      },
      correlationId: generateCorrelationId(),
      userId: 'test-user-comprehensive'
    };
  }

  static createReportRequest(
    analysisResult: AnalysisResponse,
    projectId: string,
    productId: string,
    competitorIds: string[],
    options: Partial<any> = {}
  ): ComparativeReportRequest {
    return {
      projectId,
      productId,
      competitorIds,
      template: 'comprehensive',
      focusArea: 'overall',
      analysisDepth: 'comprehensive',
      priority: 'normal',
      analysisData: analysisResult,
      reportName: 'Comprehensive Integration Test Report',
      userId: 'test-user-comprehensive',
      correlationId: generateCorrelationId(),
      ...options
    };
  }
}

// Performance Monitor
export class PerformanceTracker {
  private measurements: Map<string, number[]> = new Map();
  private memoryBaseline: NodeJS.MemoryUsage;
  private startTimes: Map<string, number> = new Map();

  constructor() {
    this.memoryBaseline = process.memoryUsage();
  }

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

  getMemoryUsage(): { current: number; delta: number; peak: number } {
    const current = process.memoryUsage();
    const currentMB = current.heapUsed / 1024 / 1024;
    const deltaMB = (current.heapUsed - this.memoryBaseline.heapUsed) / 1024 / 1024;
    const peakMB = Math.max(current.heapUsed, current.heapTotal) / 1024 / 1024;
    
    return {
      current: currentMB,
      delta: deltaMB,
      peak: peakMB
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
      throw new Error(`No measurements found for operation: ${operationName}`);
    }

    const passed = stats.avg < maxDuration && (stats.p95 || 0) < maxDuration * 1.2;
    
    logger.info(`Performance validation: ${description}`, {
      operation: operationName,
      passed,
      avgDuration: `${stats.avg.toFixed(2)}ms`,
      p95Duration: `${(stats.p95 || 0).toFixed(2)}ms`,
      maxAllowed: `${maxDuration}ms`,
      measurements: stats.count
    });

    return passed;
  }

  reset(): void {
    this.measurements.clear();
    this.startTimes.clear();
    this.memoryBaseline = process.memoryUsage();
  }
}

// Test Environment Manager
export class TestEnvironmentManager {
  private createdResources: {
    projects: string[];
    products: string[];
    competitors: string[];
    analyses: string[];
    reports: string[];
  } = {
    projects: [],
    products: [],
    competitors: [],
    analyses: [],
    reports: []
  };

  async setupTestProject(options: {
    competitorCount?: number;
    includeSnapshots?: boolean;
  } = {}): Promise<{
    project: any;
    product: any;
    competitors: any[];
    projectId: string;
    productId: string;
    competitorIds: string[];
  }> {
    const { competitorCount = 3, includeSnapshots = false } = options;

    try {
      // Create project
      const projectData = ComprehensiveTestDataFactory.createTestProject();
      const project = await prisma.project.create({ data: projectData });
      this.createdResources.projects.push(project.id);

      // Create product
      const productData = ComprehensiveTestDataFactory.createTestProduct(project.id);
      const product = await prisma.product.create({ data: productData });
      this.createdResources.products.push(product.id);

      // Create competitors
      const competitorsData = ComprehensiveTestDataFactory.createTestCompetitors(
        project.id, 
        competitorCount
      );
      
      const competitors = [];
      for (const competitorData of competitorsData) {
        const competitor = await prisma.competitor.create({ data: competitorData });
        competitors.push(competitor);
        this.createdResources.competitors.push(competitor.id);
      }

      // Create snapshots if requested
      if (includeSnapshots) {
        // Create product snapshots
        await prisma.productSnapshot.create({
          data: {
            productId: product.id,
            projectId: project.id,
            capturedAt: new Date(),
            content: JSON.stringify({
              name: product.name,
              description: product.description,
              features: ['Feature 1', 'Feature 2', 'Feature 3'],
              pricing: { plan: 'Basic', price: 99 }
            }),
            metadata: JSON.stringify({ source: 'test', type: 'comprehensive' })
          }
        });

        // Create competitor snapshots
        for (const competitor of competitors) {
          await prisma.competitorSnapshot.create({
            data: {
              competitorId: competitor.id,
              capturedAt: new Date(),
              content: JSON.stringify({
                name: competitor.name,
                description: competitor.description,
                features: ['Competitor Feature 1', 'Competitor Feature 2'],
                pricing: { plan: 'Pro', price: 149 }
              }),
              metadata: JSON.stringify({ source: 'test', type: 'comprehensive' })
            }
          });
        }
      }

      logger.info('Test project setup completed', {
        projectId: project.id,
        productId: product.id,
        competitorCount: competitors.length,
        includeSnapshots
      });

      return {
        project,
        product,
        competitors,
        projectId: project.id,
        productId: product.id,
        competitorIds: competitors.map(c => c.id)
      };

    } catch (error) {
      logger.error('Failed to setup test project', error as Error);
      throw error;
    }
  }

  async trackAnalysis(analysisId: string): void {
    this.createdResources.analyses.push(analysisId);
  }

  async trackReport(reportId: string): void {
    this.createdResources.reports.push(reportId);
  }

  async cleanup(): Promise<void> {
    if (!COMPREHENSIVE_TEST_CONFIG.cleanupAfterTests) {
      logger.info('Test cleanup skipped (disabled in config)');
      return;
    }

    try {
      logger.info('Starting comprehensive test cleanup', {
        resourcesToClean: this.createdResources
      });

      // Clean up in reverse dependency order
      
      // Reports
      if (this.createdResources.reports.length > 0) {
        await prisma.report.deleteMany({
          where: { id: { in: this.createdResources.reports } }
        });
      }

      // Analyses
      if (this.createdResources.analyses.length > 0) {
        await prisma.analysis.deleteMany({
          where: { id: { in: this.createdResources.analyses } }
        });
      }

      // Snapshots (cascade from competitors and products)
      await prisma.competitorSnapshot.deleteMany({
        where: { 
          competitor: { 
            id: { in: this.createdResources.competitors } 
          } 
        }
      });

      await prisma.productSnapshot.deleteMany({
        where: { 
          product: { 
            id: { in: this.createdResources.products } 
          } 
        }
      });

      // Competitors
      if (this.createdResources.competitors.length > 0) {
        await prisma.competitor.deleteMany({
          where: { id: { in: this.createdResources.competitors } }
        });
      }

      // Products
      if (this.createdResources.products.length > 0) {
        await prisma.product.deleteMany({
          where: { id: { in: this.createdResources.products } }
        });
      }

      // Projects
      if (this.createdResources.projects.length > 0) {
        await prisma.project.deleteMany({
          where: { id: { in: this.createdResources.projects } }
        });
      }

      logger.info('Comprehensive test cleanup completed successfully');

      // Reset tracking
      this.createdResources = {
        projects: [],
        products: [],
        competitors: [],
        analyses: [],
        reports: []
      };

    } catch (error) {
      logger.error('Test cleanup failed', error as Error);
      // Don't throw - cleanup failures shouldn't break tests
    }
  }

  getCreatedResources() {
    return { ...this.createdResources };
  }
}

// Quality Validator
export class QualityValidator {
  static validateAnalysisResult(result: AnalysisResponse): {
    isValid: boolean;
    errors: string[];
    qualityScore: number;
  } {
    const errors: string[] = [];
    let qualityScore = 0;

    // Basic structure validation
    if (!result.success) {
      errors.push('Analysis result indicates failure');
    } else {
      qualityScore += 0.2;
    }

    if (!result.analysis) {
      errors.push('Missing analysis data');
    } else {
      qualityScore += 0.2;

      // Validate analysis content
      if (!result.analysis.id) {
        errors.push('Missing analysis ID');
      } else {
        qualityScore += 0.1;
      }

      if (!result.analysis.summary || result.analysis.summary.length < 100) {
        errors.push('Analysis summary is missing or too short');
      } else {
        qualityScore += 0.2;
      }

      if (!result.analysis.metadata) {
        errors.push('Missing analysis metadata');
      } else {
        qualityScore += 0.1;
        
        if (result.analysis.metadata.serviceVersion?.includes('consolidated')) {
          qualityScore += 0.1;
        }
      }
    }

    // Quality metrics validation
    if (!result.quality) {
      errors.push('Missing quality metrics');
    } else {
      if (result.quality.overallScore < COMPREHENSIVE_TEST_CONFIG.performance.qualityScoreMin) {
        errors.push(`Quality score ${result.quality.overallScore} below minimum ${COMPREHENSIVE_TEST_CONFIG.performance.qualityScoreMin}`);
      } else {
        qualityScore += 0.1;
      }
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
    } else {
      completenessScore += 0.2;
    }

    if (!result.report) {
      errors.push('Missing report data');
    } else {
      completenessScore += 0.2;

      // Validate report content
      if (!result.report.id) {
        errors.push('Missing report ID');
      } else {
        completenessScore += 0.1;
      }

      if (!result.report.content || result.report.content.length < 1000) {
        errors.push('Report content is missing or too short');
      } else {
        completenessScore += 0.3;
      }

      if (result.report.format !== 'markdown') {
        errors.push('Report format should be markdown');
      } else {
        completenessScore += 0.1;
      }

      if (!result.report.metadata) {
        errors.push('Missing report metadata');
      } else {
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

// API Test Utilities
export class APITestUtils {
  static async makeAnalysisRequest(
    projectId: string,
    options: any = {},
    correlationId?: string
  ): Promise<Response> {
    const testCorrelationId = correlationId || generateCorrelationId();
    
    return fetch(`http://localhost:3000/api/projects/${projectId}/analysis`, {
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
    
    return fetch('http://localhost:3000/api/reports/auto-generate', {
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

  static async waitForAsyncOperation(
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
}

// Test Reporting
export class TestReporter {
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

// Export singleton instances for easy use
export const testEnvironment = new TestEnvironmentManager();
export const performanceTracker = new PerformanceTracker();
export const testReporter = new TestReporter();

// Helper function to run a test with comprehensive tracking
export async function runComprehensiveTest<T>(
  testName: string,
  testFunction: () => Promise<T>,
  options: {
    timeout?: number;
    trackPerformance?: boolean;
    validateQuality?: boolean;
  } = {}
): Promise<T> {
  const { timeout = 60000, trackPerformance = true, validateQuality = false } = options;
  
  const startTime = Date.now();
  let result: T;
  let success = false;
  let error: Error | null = null;

  try {
    if (trackPerformance) {
      performanceTracker.start(testName);
    }

    // Run test with timeout
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Test timeout: ${testName}`)), timeout)
    );

    result = await Promise.race([testFunction(), timeoutPromise]);
    success = true;

    if (trackPerformance) {
      performanceTracker.end(testName);
    }

  } catch (err) {
    error = err as Error;
    success = false;
    throw err;
  } finally {
    const duration = Date.now() - startTime;
    
    testReporter.recordTest(testName, success, duration, {
      error: error?.message,
      memoryUsage: performanceTracker.getMemoryUsage(),
      timeout,
      trackPerformance,
      validateQuality
    });
  }

  return result!;
} 