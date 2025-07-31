/**
 * Task 8.1: Consolidated Services Performance Benchmark Tests
 * 
 * Performance testing to verify consolidated services meet or exceed existing benchmarks:
 * - Analysis service performance benchmarks
 * - Report generation performance benchmarks
 * - Memory usage and resource consumption validation
 * - Concurrent processing capabilities testing
 * - Performance regression detection
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { AnalysisService } from '@/services/domains/AnalysisService';
import { ReportingService } from '@/services/domains/ReportingService';
import { SmartSchedulingService } from '@/services/smartSchedulingService';
import { prisma } from '@/lib/prisma';
import { logger, generateCorrelationId } from '@/lib/logger';
import type { 
  ComparativeAnalysisRequest, 
  ComparativeReportRequest,
  AnalysisResponse 
} from '@/types/consolidated-services';

// Performance Benchmark Configuration
const PERFORMANCE_BENCHMARKS = {
  // Time benchmarks (milliseconds)
  analysis: {
    basic: 15000,        // 15 seconds for basic analysis
    detailed: 30000,     // 30 seconds for detailed analysis
    comprehensive: 45000  // 45 seconds for comprehensive analysis
  },
  report: {
    executive: 20000,    // 20 seconds for executive report
    technical: 30000,    // 30 seconds for technical report
    comprehensive: 45000  // 45 seconds for comprehensive report
  },
  workflow: {
    endToEnd: 90000,     // 1.5 minutes for complete workflow
    concurrent: 120000   // 2 minutes for concurrent workflows
  },
  // Memory benchmarks (MB)
  memory: {
    baseline: 256,       // 256MB baseline
    analysis: 384,       // 384MB during analysis
    report: 512,         // 512MB during report generation
    peak: 768           // 768MB absolute peak
  },
  // Quality benchmarks
  quality: {
    analysisScore: 0.75, // Minimum analysis quality score
    reportCompleteness: 0.80, // Minimum report completeness
    confidenceScore: 0.70     // Minimum confidence score
  },
  // Throughput benchmarks
  throughput: {
    analysisPerHour: 120,    // 120 analyses per hour
    reportsPerHour: 60,      // 60 reports per hour
    concurrentUsers: 10      // 10 concurrent users
  }
};

// Test Data Configuration
const BENCHMARK_TEST_CONFIG = {
  projectId: 'benchmark-test-project',
  productId: 'benchmark-test-product',
  competitorIds: ['bench-comp-1', 'bench-comp-2', 'bench-comp-3'],
  userId: 'benchmark-test-user',
  sampleSizes: {
    small: 5,      // Small sample for quick tests
    medium: 20,    // Medium sample for thorough testing
    large: 50      // Large sample for stress testing
  }
};

// Performance Monitor Utility
class PerformanceBenchmark {
  private measurements: Map<string, number[]> = new Map();
  private memoryBaseline: NodeJS.MemoryUsage;
  private startTime: number = 0;

  constructor() {
    this.memoryBaseline = process.memoryUsage();
  }

  startMeasurement(operationName: string): void {
    this.startTime = Date.now();
  }

  endMeasurement(operationName: string): number {
    const duration = Date.now() - this.startTime;
    
    if (!this.measurements.has(operationName)) {
      this.measurements.set(operationName, []);
    }
    this.measurements.get(operationName)!.push(duration);
    
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

  getStatistics(operationName: string): {
    avg: number;
    min: number;
    max: number;
    median: number;
    p95: number;
    count: number;
  } {
    const measurements = this.measurements.get(operationName) || [];
    if (measurements.length === 0) {
      throw new Error(`No measurements found for operation: ${operationName}`);
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

  validateBenchmark(
    operationName: string, 
    expectedMax: number, 
    description: string
  ): void {
    const stats = this.getStatistics(operationName);
    
    expect(stats.avg).toBeLessThan(expectedMax);
    expect(stats.p95).toBeLessThan(expectedMax * 1.2); // 20% tolerance for p95
    
    logger.info(`Performance benchmark validated: ${description}`, {
      operation: operationName,
      statistics: stats,
      benchmark: `<${expectedMax}ms`,
      passed: stats.avg < expectedMax
    });
  }

  generateReport(): string {
    let report = '\n📊 Performance Benchmark Report\n';
    report += '=====================================\n';
    
    for (const [operation, measurements] of this.measurements) {
      const stats = this.getStatistics(operation);
      report += `\n${operation}:\n`;
      report += `  Count: ${stats.count}\n`;
      report += `  Average: ${stats.avg.toFixed(2)}ms\n`;
      report += `  Min/Max: ${stats.min}ms / ${stats.max}ms\n`;
      report += `  Median: ${stats.median.toFixed(2)}ms\n`;
      report += `  95th Percentile: ${stats.p95.toFixed(2)}ms\n`;
    }
    
    const memory = this.getMemoryUsage();
    report += `\nMemory Usage:\n`;
    report += `  Current: ${memory.current.toFixed(2)}MB\n`;
    report += `  Delta: ${memory.delta.toFixed(2)}MB\n`;
    report += `  Peak: ${memory.peak.toFixed(2)}MB\n`;
    
    return report;
  }
}

// Test Data Factory
class BenchmarkTestDataFactory {
  static createAnalysisRequest(
    analysisDepth: 'basic' | 'detailed' | 'comprehensive' = 'detailed'
  ): ComparativeAnalysisRequest {
    return {
      projectId: BENCHMARK_TEST_CONFIG.projectId,
      productId: BENCHMARK_TEST_CONFIG.productId,
      competitorIds: BENCHMARK_TEST_CONFIG.competitorIds,
      analysisType: 'comparative_analysis',
      options: {
        analysisDepth,
        focusAreas: ['features', 'pricing', 'user_experience'],
        includeRecommendations: true,
        enhanceWithAI: true,
        forceFreshData: false
      },
      correlationId: generateCorrelationId(),
      userId: BENCHMARK_TEST_CONFIG.userId
    };
  }

  static createReportRequest(
    analysisResult: AnalysisResponse,
    template: 'executive' | 'technical' | 'comprehensive' = 'comprehensive'
  ): ComparativeReportRequest {
    return {
      projectId: BENCHMARK_TEST_CONFIG.projectId,
      productId: BENCHMARK_TEST_CONFIG.productId,
      competitorIds: BENCHMARK_TEST_CONFIG.competitorIds,
      template,
      focusArea: 'overall',
      analysisDepth: 'comprehensive',
      priority: 'normal',
      analysisData: analysisResult,
      reportName: `Benchmark Test Report - ${template}`,
      userId: BENCHMARK_TEST_CONFIG.userId,
      correlationId: generateCorrelationId()
    };
  }
}

describe('Task 8.1: Consolidated Services Performance Benchmarks', () => {
  let analysisService: AnalysisService;
  let reportingService: ReportingService;
  let smartSchedulingService: SmartSchedulingService;
  let performanceBenchmark: PerformanceBenchmark;

  beforeAll(async () => {
    logger.info('🚀 Initializing performance benchmark tests');
    
    // Initialize services
    analysisService = new AnalysisService({
      enabledAnalyzers: {
        aiAnalyzer: true,
        uxAnalyzer: true,
        comparativeAnalyzer: true
      },
      performance: {
        maxCompetitors: 10,
        timeoutMs: 60000
      }
    });

    reportingService = new ReportingService(analysisService);
    smartSchedulingService = new SmartSchedulingService();
    performanceBenchmark = new PerformanceBenchmark();

    // Setup test data
    await setupBenchmarkTestData();
    
    logger.info('✅ Performance benchmark environment initialized');
  }, 120000);

  beforeEach(() => {
    performanceBenchmark = new PerformanceBenchmark();
  });

  afterAll(async () => {
    logger.info('📊 Performance benchmark tests completed');
    console.log(performanceBenchmark.generateReport());
    
    await cleanupBenchmarkTestData();
  });

  describe('1. Analysis Service Performance Benchmarks', () => {
    it('should meet basic analysis performance benchmarks', async () => {
      logger.info('⚡ Running basic analysis performance benchmarks');
      
      const sampleSize = BENCHMARK_TEST_CONFIG.sampleSizes.medium;
      
      for (let i = 0; i < sampleSize; i++) {
        const request = BenchmarkTestDataFactory.createAnalysisRequest('basic');
        request.correlationId = generateCorrelationId();
        
        performanceBenchmark.startMeasurement('basic_analysis');
        const result = await analysisService.analyzeProduct(request);
        const duration = performanceBenchmark.endMeasurement('basic_analysis');
        
        // Validate result quality
        expect(result.success).toBe(true);
        expect(result.quality!.overallScore).toBeGreaterThanOrEqual(
          PERFORMANCE_BENCHMARKS.quality.analysisScore
        );
        expect(result.quality!.confidenceScore).toBeGreaterThanOrEqual(
          PERFORMANCE_BENCHMARKS.quality.confidenceScore
        );
        
        // Log progress
        if (i % 5 === 0) {
          logger.info(`Basic analysis progress: ${i + 1}/${sampleSize} (${duration}ms)`);
        }
      }
      
      // Validate performance benchmark
      performanceBenchmark.validateBenchmark(
        'basic_analysis',
        PERFORMANCE_BENCHMARKS.analysis.basic,
        'Basic Analysis Performance'
      );
      
      // Validate memory usage
      const memory = performanceBenchmark.getMemoryUsage();
      expect(memory.current).toBeLessThan(PERFORMANCE_BENCHMARKS.memory.analysis);
      expect(memory.peak).toBeLessThan(PERFORMANCE_BENCHMARKS.memory.peak);
    }, 300000); // 5 minutes

    it('should meet detailed analysis performance benchmarks', async () => {
      logger.info('⚡ Running detailed analysis performance benchmarks');
      
      const sampleSize = BENCHMARK_TEST_CONFIG.sampleSizes.small;
      
      for (let i = 0; i < sampleSize; i++) {
        const request = BenchmarkTestDataFactory.createAnalysisRequest('detailed');
        request.correlationId = generateCorrelationId();
        
        performanceBenchmark.startMeasurement('detailed_analysis');
        const result = await analysisService.analyzeProduct(request);
        const duration = performanceBenchmark.endMeasurement('detailed_analysis');
        
        expect(result.success).toBe(true);
        expect(result.quality!.overallScore).toBeGreaterThanOrEqual(
          PERFORMANCE_BENCHMARKS.quality.analysisScore
        );
        
        logger.info(`Detailed analysis ${i + 1}/${sampleSize}: ${duration}ms, quality: ${result.quality!.overallScore.toFixed(3)}`);
      }
      
      performanceBenchmark.validateBenchmark(
        'detailed_analysis',
        PERFORMANCE_BENCHMARKS.analysis.detailed,
        'Detailed Analysis Performance'
      );
    }, 180000); // 3 minutes

    it('should meet comprehensive analysis performance benchmarks', async () => {
      logger.info('⚡ Running comprehensive analysis performance benchmarks');
      
      const sampleSize = BENCHMARK_TEST_CONFIG.sampleSizes.small;
      
      for (let i = 0; i < sampleSize; i++) {
        const request = BenchmarkTestDataFactory.createAnalysisRequest('comprehensive');
        request.correlationId = generateCorrelationId();
        
        performanceBenchmark.startMeasurement('comprehensive_analysis');
        const result = await analysisService.analyzeProduct(request);
        const duration = performanceBenchmark.endMeasurement('comprehensive_analysis');
        
        expect(result.success).toBe(true);
        expect(result.quality!.overallScore).toBeGreaterThanOrEqual(
          PERFORMANCE_BENCHMARKS.quality.analysisScore
        );
        
        logger.info(`Comprehensive analysis ${i + 1}/${sampleSize}: ${duration}ms, quality: ${result.quality!.overallScore.toFixed(3)}`);
      }
      
      performanceBenchmark.validateBenchmark(
        'comprehensive_analysis',
        PERFORMANCE_BENCHMARKS.analysis.comprehensive,
        'Comprehensive Analysis Performance'
      );
    }, 240000); // 4 minutes
  });

  describe('2. Report Generation Performance Benchmarks', () => {
    let baselineAnalysis: AnalysisResponse;

    beforeAll(async () => {
      // Generate baseline analysis for report benchmarks
      const request = BenchmarkTestDataFactory.createAnalysisRequest('comprehensive');
      baselineAnalysis = await analysisService.analyzeProduct(request);
      expect(baselineAnalysis.success).toBe(true);
    });

    it('should meet executive report generation benchmarks', async () => {
      logger.info('⚡ Running executive report generation benchmarks');
      
      const sampleSize = BENCHMARK_TEST_CONFIG.sampleSizes.small;
      
      for (let i = 0; i < sampleSize; i++) {
        const request = BenchmarkTestDataFactory.createReportRequest(baselineAnalysis, 'executive');
        request.correlationId = generateCorrelationId();
        
        performanceBenchmark.startMeasurement('executive_report');
        const result = await reportingService.generateComparativeReport(request);
        const duration = performanceBenchmark.endMeasurement('executive_report');
        
        expect(result.success).toBe(true);
        expect(result.report!.content.length).toBeGreaterThan(500);
        expect(result.report!.format).toBe('markdown');
        
        logger.info(`Executive report ${i + 1}/${sampleSize}: ${duration}ms, length: ${result.report!.content.length} chars`);
      }
      
      performanceBenchmark.validateBenchmark(
        'executive_report',
        PERFORMANCE_BENCHMARKS.report.executive,
        'Executive Report Generation Performance'
      );
    }, 180000);

    it('should meet comprehensive report generation benchmarks', async () => {
      logger.info('⚡ Running comprehensive report generation benchmarks');
      
      const sampleSize = BENCHMARK_TEST_CONFIG.sampleSizes.small;
      
      for (let i = 0; i < sampleSize; i++) {
        const request = BenchmarkTestDataFactory.createReportRequest(baselineAnalysis, 'comprehensive');
        request.correlationId = generateCorrelationId();
        
        performanceBenchmark.startMeasurement('comprehensive_report');
        const result = await reportingService.generateComparativeReport(request);
        const duration = performanceBenchmark.endMeasurement('comprehensive_report');
        
        expect(result.success).toBe(true);
        expect(result.report!.content.length).toBeGreaterThan(2000);
        expect(result.report!.metadata.completeness).toBeGreaterThanOrEqual(
          PERFORMANCE_BENCHMARKS.quality.reportCompleteness
        );
        
        logger.info(`Comprehensive report ${i + 1}/${sampleSize}: ${duration}ms, completeness: ${result.report!.metadata.completeness.toFixed(3)}`);
      }
      
      performanceBenchmark.validateBenchmark(
        'comprehensive_report',
        PERFORMANCE_BENCHMARKS.report.comprehensive,
        'Comprehensive Report Generation Performance'
      );
    }, 240000);
  });

  describe('3. End-to-End Workflow Performance Benchmarks', () => {
    it('should meet end-to-end workflow performance benchmarks', async () => {
      logger.info('⚡ Running end-to-end workflow performance benchmarks');
      
      const sampleSize = BENCHMARK_TEST_CONFIG.sampleSizes.small;
      
      for (let i = 0; i < sampleSize; i++) {
        performanceBenchmark.startMeasurement('end_to_end_workflow');
        
        // Step 1: Analysis
        const analysisRequest = BenchmarkTestDataFactory.createAnalysisRequest('detailed');
        analysisRequest.correlationId = generateCorrelationId();
        
        const analysisResult = await analysisService.analyzeProduct(analysisRequest);
        expect(analysisResult.success).toBe(true);
        
        // Step 2: Report Generation
        const reportRequest = BenchmarkTestDataFactory.createReportRequest(analysisResult, 'comprehensive');
        reportRequest.correlationId = generateCorrelationId();
        
        const reportResult = await reportingService.generateComparativeReport(reportRequest);
        expect(reportResult.success).toBe(true);
        
        const duration = performanceBenchmark.endMeasurement('end_to_end_workflow');
        
        logger.info(`End-to-end workflow ${i + 1}/${sampleSize}: ${duration}ms`);
      }
      
      performanceBenchmark.validateBenchmark(
        'end_to_end_workflow',
        PERFORMANCE_BENCHMARKS.workflow.endToEnd,
        'End-to-End Workflow Performance'
      );
    }, 300000);

    it('should handle concurrent workflows within benchmarks', async () => {
      logger.info('⚡ Running concurrent workflow performance benchmarks');
      
      const concurrentWorkflows = 5;
      const workflowPromises: Promise<void>[] = [];
      
      performanceBenchmark.startMeasurement('concurrent_workflows');
      
      for (let i = 0; i < concurrentWorkflows; i++) {
        const workflowPromise = (async () => {
          const correlationId = generateCorrelationId();
          
          // Analysis
          const analysisRequest = BenchmarkTestDataFactory.createAnalysisRequest('detailed');
          analysisRequest.correlationId = correlationId;
          
          const analysisResult = await analysisService.analyzeProduct(analysisRequest);
          expect(analysisResult.success).toBe(true);
          
          // Report
          const reportRequest = BenchmarkTestDataFactory.createReportRequest(analysisResult, 'executive');
          reportRequest.correlationId = correlationId;
          
          const reportResult = await reportingService.generateComparativeReport(reportRequest);
          expect(reportResult.success).toBe(true);
          
          logger.info(`Concurrent workflow ${i + 1} completed`, { correlationId });
        })();
        
        workflowPromises.push(workflowPromise);
      }
      
      await Promise.all(workflowPromises);
      
      const duration = performanceBenchmark.endMeasurement('concurrent_workflows');
      
      expect(duration).toBeLessThan(PERFORMANCE_BENCHMARKS.workflow.concurrent);
      
      // Validate memory usage during concurrent operations
      const memory = performanceBenchmark.getMemoryUsage();
      expect(memory.peak).toBeLessThan(PERFORMANCE_BENCHMARKS.memory.peak);
      
      logger.info(`✅ Concurrent workflows completed in ${duration}ms`, {
        workflows: concurrentWorkflows,
        avgTimePerWorkflow: `${(duration / concurrentWorkflows).toFixed(0)}ms`,
        peakMemory: `${memory.peak.toFixed(2)}MB`
      });
    }, 300000);
  });

  describe('4. Memory Usage and Resource Consumption', () => {
    it('should maintain memory usage within benchmarks', async () => {
      logger.info('💾 Running memory usage benchmarks');
      
      const initialMemory = performanceBenchmark.getMemoryUsage();
      logger.info(`Initial memory usage: ${initialMemory.current.toFixed(2)}MB`);
      
      // Run memory-intensive operations
      const operations = 10;
      
      for (let i = 0; i < operations; i++) {
        const analysisRequest = BenchmarkTestDataFactory.createAnalysisRequest('comprehensive');
        const analysisResult = await analysisService.analyzeProduct(analysisRequest);
        
        const reportRequest = BenchmarkTestDataFactory.createReportRequest(analysisResult, 'comprehensive');
        await reportingService.generateComparativeReport(reportRequest);
        
        const currentMemory = performanceBenchmark.getMemoryUsage();
        
        // Validate memory doesn't exceed benchmarks
        expect(currentMemory.current).toBeLessThan(PERFORMANCE_BENCHMARKS.memory.peak);
        
        if (i % 3 === 0) {
          logger.info(`Memory check ${i + 1}/${operations}: ${currentMemory.current.toFixed(2)}MB`);
        }
      }
      
      const finalMemory = performanceBenchmark.getMemoryUsage();
      logger.info(`Final memory usage: ${finalMemory.current.toFixed(2)}MB`);
      
      // Validate memory growth is reasonable
      expect(finalMemory.delta).toBeLessThan(PERFORMANCE_BENCHMARKS.memory.analysis);
    }, 240000);
  });

  describe('5. Performance Regression Detection', () => {
    it('should detect performance regressions in analysis service', async () => {
      logger.info('📈 Running performance regression detection for analysis');
      
      // Baseline measurements
      const baselineRuns = 5;
      const regressionThreshold = 1.5; // 50% performance degradation threshold
      
      for (let i = 0; i < baselineRuns; i++) {
        const request = BenchmarkTestDataFactory.createAnalysisRequest('detailed');
        
        performanceBenchmark.startMeasurement('regression_baseline');
        const result = await analysisService.analyzeProduct(request);
        performanceBenchmark.endMeasurement('regression_baseline');
        
        expect(result.success).toBe(true);
      }
      
      const baselineStats = performanceBenchmark.getStatistics('regression_baseline');
      
      // Validate no significant regression from baseline
      expect(baselineStats.avg).toBeLessThan(PERFORMANCE_BENCHMARKS.analysis.detailed);
      expect(baselineStats.p95).toBeLessThan(PERFORMANCE_BENCHMARKS.analysis.detailed * regressionThreshold);
      
      logger.info('✅ No performance regression detected in analysis service', {
        baselineAvg: `${baselineStats.avg.toFixed(2)}ms`,
        benchmark: `${PERFORMANCE_BENCHMARKS.analysis.detailed}ms`,
        regressionThreshold: `${(PERFORMANCE_BENCHMARKS.analysis.detailed * regressionThreshold).toFixed(0)}ms`
      });
    });

    it('should detect performance regressions in reporting service', async () => {
      logger.info('📈 Running performance regression detection for reporting');
      
      // Get baseline analysis
      const analysisRequest = BenchmarkTestDataFactory.createAnalysisRequest('detailed');
      const analysisResult = await analysisService.analyzeProduct(analysisRequest);
      
      const baselineRuns = 5;
      const regressionThreshold = 1.5;
      
      for (let i = 0; i < baselineRuns; i++) {
        const reportRequest = BenchmarkTestDataFactory.createReportRequest(analysisResult, 'comprehensive');
        
        performanceBenchmark.startMeasurement('report_regression_baseline');
        const result = await reportingService.generateComparativeReport(reportRequest);
        performanceBenchmark.endMeasurement('report_regression_baseline');
        
        expect(result.success).toBe(true);
      }
      
      const baselineStats = performanceBenchmark.getStatistics('report_regression_baseline');
      
      expect(baselineStats.avg).toBeLessThan(PERFORMANCE_BENCHMARKS.report.comprehensive);
      expect(baselineStats.p95).toBeLessThan(PERFORMANCE_BENCHMARKS.report.comprehensive * regressionThreshold);
      
      logger.info('✅ No performance regression detected in reporting service', {
        baselineAvg: `${baselineStats.avg.toFixed(2)}ms`,
        benchmark: `${PERFORMANCE_BENCHMARKS.report.comprehensive}ms`,
        regressionThreshold: `${(PERFORMANCE_BENCHMARKS.report.comprehensive * regressionThreshold).toFixed(0)}ms`
      });
    });
  });

  // Helper Functions
  async function setupBenchmarkTestData(): Promise<void> {
    try {
      // Create test project
      await prisma.project.upsert({
        where: { id: BENCHMARK_TEST_CONFIG.projectId },
        update: {},
        create: {
          id: BENCHMARK_TEST_CONFIG.projectId,
          name: 'Performance Benchmark Test Project',
          description: 'Project for performance benchmark testing',
          userId: BENCHMARK_TEST_CONFIG.userId,
          industry: 'Performance Testing',
          productName: 'Benchmark Test Product',
          productWebsite: 'https://benchmark-test.com',
          positioning: 'Performance testing solution',
          customerData: 'Performance testing teams',
          userProblem: 'Need performance validation',
          createdAt: new Date(),
          updatedAt: new Date()
        }
      });

      // Create test product
      await prisma.product.upsert({
        where: { id: BENCHMARK_TEST_CONFIG.productId },
        update: {},
        create: {
          id: BENCHMARK_TEST_CONFIG.productId,
          projectId: BENCHMARK_TEST_CONFIG.projectId,
          name: 'Benchmark Test Product',
          website: 'https://benchmark-test.com',
          description: 'Product for performance benchmarking',
          createdAt: new Date(),
          updatedAt: new Date()
        }
      });

      // Create test competitors
      for (const competitorId of BENCHMARK_TEST_CONFIG.competitorIds) {
        await prisma.competitor.upsert({
          where: { id: competitorId },
          update: {},
          create: {
            id: competitorId,
            projectId: BENCHMARK_TEST_CONFIG.projectId,
            name: `Benchmark Competitor ${competitorId.split('-').pop()}`,
            website: `https://benchmark-${competitorId}.com`,
            description: `Competitor for performance benchmarking`,
            createdAt: new Date(),
            updatedAt: new Date()
          }
        });
      }

      logger.info('✅ Benchmark test data setup completed');
    } catch (error) {
      logger.error('❌ Failed to setup benchmark test data', error as Error);
      throw error;
    }
  }

  async function cleanupBenchmarkTestData(): Promise<void> {
    try {
      await prisma.report.deleteMany({
        where: { projectId: BENCHMARK_TEST_CONFIG.projectId }
      });
      
      await prisma.analysis.deleteMany({
        where: { projectId: BENCHMARK_TEST_CONFIG.projectId }
      });
      
      await prisma.competitor.deleteMany({
        where: { projectId: BENCHMARK_TEST_CONFIG.projectId }
      });
      
      await prisma.product.deleteMany({
        where: { projectId: BENCHMARK_TEST_CONFIG.projectId }
      });
      
      await prisma.project.deleteMany({
        where: { id: BENCHMARK_TEST_CONFIG.projectId }
      });

      logger.info('✅ Benchmark test data cleanup completed');
    } catch (error) {
      logger.warn('⚠️ Benchmark test data cleanup error', error as Error);
    }
  }
}); 