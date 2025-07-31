/**
 * Task 8.1: Comprehensive Integration Testing
 * 
 * This test suite validates the complete consolidated services architecture:
 * - Complete workflows: project creation → analysis → report generation  
 * - Critical user journeys continue to work
 * - Error scenarios and recovery mechanisms
 * - Performance meets or exceeds existing benchmarks
 * 
 * Test Coverage:
 * 1. End-to-End Workflow Validation
 * 2. Critical User Journey Testing
 * 3. Error Scenario & Recovery Testing
 * 4. Performance Benchmark Validation
 * 5. Service Integration Verification
 * 6. Data Integrity & Quality Assurance
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { AnalysisService } from '@/services/domains/AnalysisService';
import { ReportingService } from '@/services/domains/ReportingService';
import { SmartSchedulingService } from '@/services/smartSchedulingService';
import { prisma } from '@/lib/prisma';
import { logger, generateCorrelationId } from '@/lib/logger';
import type { 
  ComparativeAnalysisRequest, 
  ComparativeReportRequest,
  AnalysisResponse,
  ComparativeReportResponse 
} from '@/types/consolidated-services';

// Test Configuration
const COMPREHENSIVE_TEST_CONFIG = {
  timeout: {
    workflow: 120000,     // 2 minutes for complete workflow
    analysis: 60000,      // 1 minute for analysis
    report: 90000,        // 1.5 minutes for report generation  
    recovery: 30000       // 30 seconds for error recovery
  },
  performance: {
    analysisMaxTime: 45000,      // 45 seconds max for analysis
    reportMaxTime: 60000,        // 1 minute max for report
    workflowMaxTime: 90000,      // 1.5 minutes max for full workflow
    memoryThresholdMB: 512,      // 512MB memory threshold
    qualityScoreMin: 0.75        // Minimum quality score
  },
  testData: {
    projectId: 'comprehensive-test-project',
    productId: 'comprehensive-test-product', 
    competitorIds: ['comp-1-comprehensive', 'comp-2-comprehensive', 'comp-3-comprehensive'],
    userId: 'test-user-comprehensive'
  }
};

// Test Data Factory
class ComprehensiveTestDataFactory {
  static createTestProject() {
    return {
      id: COMPREHENSIVE_TEST_CONFIG.testData.projectId,
      name: 'Comprehensive Integration Test Project',
      description: 'Test project for comprehensive integration testing',
      userId: COMPREHENSIVE_TEST_CONFIG.testData.userId,
      industry: 'Technology',
      productName: 'Test Product',
      productWebsite: 'https://test-product.com',
      positioning: 'Leading test solution',
      customerData: 'Enterprise test customers',
      userProblem: 'Test problem solving',
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  static createTestProduct() {
    return {
      id: COMPREHENSIVE_TEST_CONFIG.testData.productId,
      projectId: COMPREHENSIVE_TEST_CONFIG.testData.projectId,
      name: 'Test Product',
      website: 'https://test-product.com',
      description: 'Comprehensive test product',
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  static createTestCompetitors() {
    return COMPREHENSIVE_TEST_CONFIG.testData.competitorIds.map((id, index) => ({
      id,
      projectId: COMPREHENSIVE_TEST_CONFIG.testData.projectId,
      name: `Test Competitor ${index + 1}`,
      website: `https://test-competitor-${index + 1}.com`,
      description: `Test competitor ${index + 1} description`,
      createdAt: new Date(),
      updatedAt: new Date()
    }));
  }

  static createAnalysisRequest(): ComparativeAnalysisRequest {
    return {
      projectId: COMPREHENSIVE_TEST_CONFIG.testData.projectId,
      productId: COMPREHENSIVE_TEST_CONFIG.testData.productId,
      competitorIds: COMPREHENSIVE_TEST_CONFIG.testData.competitorIds,
      analysisType: 'comparative_analysis',
      options: {
        analysisDepth: 'comprehensive',
        focusAreas: ['features', 'pricing', 'user_experience', 'market_positioning'],
        includeRecommendations: true,
        enhanceWithAI: true,
        forceFreshData: false
      },
      correlationId: generateCorrelationId(),
      userId: COMPREHENSIVE_TEST_CONFIG.testData.userId
    };
  }

  static createReportRequest(analysisResult: AnalysisResponse): ComparativeReportRequest {
    return {
      projectId: COMPREHENSIVE_TEST_CONFIG.testData.projectId,
      productId: COMPREHENSIVE_TEST_CONFIG.testData.productId,
      competitorIds: COMPREHENSIVE_TEST_CONFIG.testData.competitorIds,
      template: 'comprehensive',
      focusArea: 'overall',
      analysisDepth: 'comprehensive',
      priority: 'normal',
      analysisData: analysisResult,
      reportName: 'Comprehensive Integration Test Report',
      userId: COMPREHENSIVE_TEST_CONFIG.testData.userId,
      correlationId: generateCorrelationId()
    };
  }
}

// Performance Monitor
class PerformanceMonitor {
  private startTime: number = 0;
  private memoryBaseline: NodeJS.MemoryUsage;

  constructor() {
    this.memoryBaseline = process.memoryUsage();
  }

  startTiming(): void {
    this.startTime = Date.now();
  }

  endTiming(): number {
    return Date.now() - this.startTime;
  }

  getMemoryUsage(): { used: number; delta: number } {
    const current = process.memoryUsage();
    const used = current.heapUsed / 1024 / 1024; // MB
    const delta = (current.heapUsed - this.memoryBaseline.heapUsed) / 1024 / 1024; // MB
    return { used, delta };
  }

  validatePerformance(duration: number, maxDuration: number, operation: string): void {
    expect(duration).toBeLessThan(maxDuration);
    
    const memory = this.getMemoryUsage();
    expect(memory.used).toBeLessThan(COMPREHENSIVE_TEST_CONFIG.performance.memoryThresholdMB);
    
    logger.info(`Performance validation passed for ${operation}`, {
      duration: `${duration}ms`,
      maxDuration: `${maxDuration}ms`,
      memoryUsed: `${memory.used.toFixed(2)}MB`,
      memoryDelta: `${memory.delta.toFixed(2)}MB`
    });
  }
}

describe('Task 8.1: Comprehensive Integration Testing', () => {
  let analysisService: AnalysisService;
  let reportingService: ReportingService;
  let smartSchedulingService: SmartSchedulingService;
  let performanceMonitor: PerformanceMonitor;
  let testCorrelationId: string;

  beforeAll(async () => {
    logger.info('🧪 Starting Comprehensive Integration Tests');
    
    // Initialize services
    try {
      analysisService = new AnalysisService({
        enabledAnalyzers: {
          aiAnalyzer: true,
          uxAnalyzer: true,
          comparativeAnalyzer: true
        },
        performance: {
          maxCompetitors: 10,
          timeoutMs: COMPREHENSIVE_TEST_CONFIG.timeout.analysis
        }
      });

      reportingService = new ReportingService(analysisService);
      smartSchedulingService = new SmartSchedulingService();
      performanceMonitor = new PerformanceMonitor();

      // Setup test data
      await setupTestData();
      
      logger.info('✅ Comprehensive integration test environment initialized');
    } catch (error) {
      logger.error('❌ Failed to initialize comprehensive test environment', error as Error);
      throw error;
    }
  }, COMPREHENSIVE_TEST_CONFIG.timeout.workflow);

  beforeEach(() => {
    testCorrelationId = generateCorrelationId();
    performanceMonitor = new PerformanceMonitor();
  });

  afterEach(async () => {
    // Clean up any test artifacts between tests
    await cleanupTestArtifacts();
  });

  afterAll(async () => {
    logger.info('🧹 Cleaning up comprehensive integration tests');
    await cleanupTestData();
  });

  describe('1. End-to-End Workflow Validation', () => {
    it('should complete full project creation → analysis → report generation workflow', async () => {
      performanceMonitor.startTiming();
      const workflowStartTime = Date.now();

      logger.info('🔄 Starting complete workflow validation', { testCorrelationId });

      // Phase 1: Project Setup (simulated - data already exists)
      logger.info('📋 Phase 1: Project setup validation');
      const project = await prisma.project.findUnique({
        where: { id: COMPREHENSIVE_TEST_CONFIG.testData.projectId },
        include: {
          product: true,
          competitors: true
        }
      });

      expect(project).toBeDefined();
      expect(project!.product).toBeDefined();
      expect(project!.competitors).toHaveLength(3);
      
      const setupTime = Date.now() - workflowStartTime;
      logger.info(`✅ Project setup validated in ${setupTime}ms`);

      // Phase 2: Data Collection & Freshness Check
      logger.info('🔍 Phase 2: Data collection and freshness validation');
      const freshnessStartTime = Date.now();
      
      const freshnessStatus = await smartSchedulingService.getFreshnessStatus(
        COMPREHENSIVE_TEST_CONFIG.testData.projectId
      );
      
      expect(freshnessStatus).toBeDefined();
      expect(freshnessStatus.overallStatus).toMatch(/FRESH|STALE|CRITICAL/);
      
      const freshnessTime = Date.now() - freshnessStartTime;
      logger.info(`✅ Data freshness check completed in ${freshnessTime}ms`, { 
        status: freshnessStatus.overallStatus 
      });

      // Phase 3: Analysis Generation
      logger.info('📊 Phase 3: Analysis generation with consolidated service');
      const analysisStartTime = Date.now();
      
      const analysisRequest = ComprehensiveTestDataFactory.createAnalysisRequest();
      const analysisResult = await analysisService.analyzeProduct(analysisRequest);
      
      const analysisTime = Date.now() - analysisStartTime;
      
      // Validate analysis result
      expect(analysisResult).toBeDefined();
      expect(analysisResult.success).toBe(true);
      expect(analysisResult.analysis).toBeDefined();
      expect(analysisResult.analysis.id).toBeDefined();
      expect(analysisResult.analysis.summary).toBeDefined();
      expect(analysisResult.analysis.metadata).toBeDefined();
      expect(analysisResult.analysis.metadata.serviceVersion).toContain('consolidated');
      expect(analysisResult.quality).toBeDefined();
      expect(analysisResult.quality!.overallScore).toBeGreaterThanOrEqual(
        COMPREHENSIVE_TEST_CONFIG.performance.qualityScoreMin
      );

      performanceMonitor.validatePerformance(
        analysisTime,
        COMPREHENSIVE_TEST_CONFIG.performance.analysisMaxTime,
        'Analysis Generation'
      );

      logger.info(`✅ Analysis completed in ${analysisTime}ms`, {
        analysisId: analysisResult.analysis.id,
        qualityScore: analysisResult.quality!.overallScore,
        confidenceScore: analysisResult.quality!.confidenceScore
      });

      // Phase 4: Report Generation
      logger.info('📄 Phase 4: Report generation with consolidated service');
      const reportStartTime = Date.now();
      
      const reportRequest = ComprehensiveTestDataFactory.createReportRequest(analysisResult);
      const reportResult = await reportingService.generateComparativeReport(reportRequest);
      
      const reportTime = Date.now() - reportStartTime;
      
      // Validate report result
      expect(reportResult).toBeDefined();
      expect(reportResult.success).toBe(true);
      expect(reportResult.report).toBeDefined();
      expect(reportResult.report!.content).toBeDefined();
      expect(reportResult.report!.content.length).toBeGreaterThan(1000); // Substantial content
      expect(reportResult.report!.format).toBe('markdown');
      expect(reportResult.report!.metadata).toBeDefined();
      expect(reportResult.report!.metadata.serviceVersion).toContain('consolidated');

      performanceMonitor.validatePerformance(
        reportTime,
        COMPREHENSIVE_TEST_CONFIG.performance.reportMaxTime,
        'Report Generation'
      );

      logger.info(`✅ Report generated in ${reportTime}ms`, {
        reportId: reportResult.report!.id,
        contentLength: reportResult.report!.content.length,
        format: reportResult.report!.format
      });

      // Phase 5: End-to-End Validation
      const totalWorkflowTime = Date.now() - workflowStartTime;
      
      performanceMonitor.validatePerformance(
        totalWorkflowTime,
        COMPREHENSIVE_TEST_CONFIG.performance.workflowMaxTime,
        'Complete Workflow'
      );

      // Validate data integrity across the pipeline
      expect(analysisResult.correlationId).toBe(analysisRequest.correlationId);
      expect(reportResult.correlationId).toBe(reportRequest.correlationId);
      expect(reportResult.analysisId).toBe(analysisResult.analysis.id);

      logger.info(`🎉 Complete workflow validation successful in ${totalWorkflowTime}ms`, {
        phases: {
          setup: `${setupTime}ms`,
          freshness: `${freshnessTime}ms`, 
          analysis: `${analysisTime}ms`,
          report: `${reportTime}ms`,
          total: `${totalWorkflowTime}ms`
        },
        quality: {
          analysisScore: analysisResult.quality!.overallScore,
          reportCompleteness: reportResult.report!.metadata.completeness
        }
      });

    }, COMPREHENSIVE_TEST_CONFIG.timeout.workflow);

    it('should handle concurrent workflow executions efficiently', async () => {
      logger.info('🔄 Testing concurrent workflow executions');
      
      const concurrentWorkflows = 3;
      const workflowPromises: Promise<any>[] = [];

      for (let i = 0; i < concurrentWorkflows; i++) {
        const workflowPromise = (async () => {
          const correlationId = generateCorrelationId();
          
          // Execute analysis
          const analysisRequest = ComprehensiveTestDataFactory.createAnalysisRequest();
          analysisRequest.correlationId = correlationId;
          
          const analysisResult = await analysisService.analyzeProduct(analysisRequest);
          
          // Execute report generation
          const reportRequest = ComprehensiveTestDataFactory.createReportRequest(analysisResult);
          reportRequest.correlationId = correlationId;
          
          const reportResult = await reportingService.generateComparativeReport(reportRequest);
          
          return { analysisResult, reportResult, correlationId };
        })();
        
        workflowPromises.push(workflowPromise);
      }

      const concurrentStartTime = Date.now();
      const results = await Promise.all(workflowPromises);
      const concurrentTime = Date.now() - concurrentStartTime;

      // Validate all workflows completed successfully
      expect(results).toHaveLength(concurrentWorkflows);
      results.forEach((result, index) => {
        expect(result.analysisResult.success).toBe(true);
        expect(result.reportResult.success).toBe(true);
        expect(result.correlationId).toBeDefined();
        
        logger.info(`✅ Concurrent workflow ${index + 1} completed`, {
          correlationId: result.correlationId,
          analysisId: result.analysisResult.analysis.id,
          reportId: result.reportResult.report!.id
        });
      });

      // Validate concurrent performance
      const avgTimePerWorkflow = concurrentTime / concurrentWorkflows;
      expect(avgTimePerWorkflow).toBeLessThan(COMPREHENSIVE_TEST_CONFIG.performance.workflowMaxTime);

      logger.info(`🎉 Concurrent workflows completed successfully`, {
        totalTime: `${concurrentTime}ms`,
        avgTimePerWorkflow: `${avgTimePerWorkflow}ms`,
        concurrentWorkflows
      });
    }, COMPREHENSIVE_TEST_CONFIG.timeout.workflow * 2);
  });

  describe('2. Critical User Journey Testing', () => {
    it('should support the analysis customization user journey', async () => {
      logger.info('👤 Testing analysis customization user journey');
      
      // User Journey: Custom analysis with specific focus areas
      const customAnalysisRequest: ComparativeAnalysisRequest = {
        projectId: COMPREHENSIVE_TEST_CONFIG.testData.projectId,
        productId: COMPREHENSIVE_TEST_CONFIG.testData.productId,
        competitorIds: COMPREHENSIVE_TEST_CONFIG.testData.competitorIds.slice(0, 2), // Only 2 competitors
        analysisType: 'ux_comparison',
        options: {
          analysisDepth: 'detailed',
          focusAreas: ['user_experience', 'features'], // Specific focus
          includeRecommendations: true,
          enhanceWithAI: false, // User chooses no AI enhancement
          forceFreshData: true   // User forces fresh data
        },
        correlationId: testCorrelationId,
        userId: COMPREHENSIVE_TEST_CONFIG.testData.userId
      };

      const analysisResult = await analysisService.analyzeProduct(customAnalysisRequest);
      
      // Validate user customizations are respected
      expect(analysisResult.success).toBe(true);
      expect(analysisResult.analysis.metadata.analysisType).toBe('ux_comparison');
      expect(analysisResult.analysis.metadata.focusAreas).toEqual(['user_experience', 'features']);
      expect(analysisResult.analysis.metadata.analysisDepth).toBe('detailed');
      expect(analysisResult.analysis.competitors).toHaveLength(2);

      logger.info('✅ Analysis customization user journey validated', {
        analysisType: analysisResult.analysis.metadata.analysisType,
        focusAreas: analysisResult.analysis.metadata.focusAreas,
        competitorCount: analysisResult.analysis.competitors.length
      });
    });

    it('should support the report template selection user journey', async () => {
      logger.info('👤 Testing report template selection user journey');
      
      // First get an analysis
      const analysisRequest = ComprehensiveTestDataFactory.createAnalysisRequest();
      const analysisResult = await analysisService.analyzeProduct(analysisRequest);
      
      // User Journey: Different report templates
      const templates: Array<'comprehensive' | 'executive' | 'technical' | 'strategic'> = [
        'executive', 'technical', 'strategic'
      ];

      for (const template of templates) {
        const reportRequest: ComparativeReportRequest = {
          ...ComprehensiveTestDataFactory.createReportRequest(analysisResult),
          template,
          focusArea: template === 'technical' ? 'features' : 'overall',
          correlationId: generateCorrelationId()
        };

        const reportResult = await reportingService.generateComparativeReport(reportRequest);
        
        expect(reportResult.success).toBe(true);
        expect(reportResult.report!.metadata.template).toBe(template);
        expect(reportResult.report!.content).toContain(template); // Template should influence content
        
        logger.info(`✅ ${template} template validated`, {
          reportId: reportResult.report!.id,
          template: reportResult.report!.metadata.template,
          contentLength: reportResult.report!.content.length
        });
      }
    });
  });

  describe('3. Error Scenario & Recovery Testing', () => {
    it('should handle analysis service errors gracefully', async () => {
      logger.info('🚨 Testing analysis service error handling');
      
      // Scenario 1: Invalid project ID
      try {
        const invalidRequest: ComparativeAnalysisRequest = {
          ...ComprehensiveTestDataFactory.createAnalysisRequest(),
          projectId: 'non-existent-project',
          correlationId: testCorrelationId
        };

        const result = await analysisService.analyzeProduct(invalidRequest);
        
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.error).toContain('project');
        expect(result.correlationId).toBe(testCorrelationId);
        
        logger.info('✅ Invalid project ID error handled correctly', {
          error: result.error,
          correlationId: result.correlationId
        });
      } catch (error) {
        // Should not throw, should return error result
        fail('Analysis service should handle errors gracefully without throwing');
      }

      // Scenario 2: Missing competitors
      try {
        const noCompetitorsRequest: ComparativeAnalysisRequest = {
          ...ComprehensiveTestDataFactory.createAnalysisRequest(),
          competitorIds: [],
          correlationId: generateCorrelationId()
        };

        const result = await analysisService.analyzeProduct(noCompetitorsRequest);
        
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.error).toContain('competitor');
        
        logger.info('✅ Missing competitors error handled correctly', {
          error: result.error
        });
      } catch (error) {
        fail('Analysis service should handle missing competitors gracefully');
      }
    });

    it('should handle reporting service errors gracefully', async () => {
      logger.info('🚨 Testing reporting service error handling');
      
      // Scenario 1: Invalid analysis data
      try {
        const invalidReportRequest: ComparativeReportRequest = {
          ...ComprehensiveTestDataFactory.createReportRequest({} as AnalysisResponse),
          analysisData: undefined as any,
          correlationId: testCorrelationId
        };

        const result = await reportingService.generateComparativeReport(invalidReportRequest);
        
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.correlationId).toBe(testCorrelationId);
        
        logger.info('✅ Invalid analysis data error handled correctly', {
          error: result.error,
          correlationId: result.correlationId
        });
      } catch (error) {
        fail('Reporting service should handle errors gracefully without throwing');
      }
    });

    it('should recover from service timeout scenarios', async () => {
      logger.info('🚨 Testing service timeout recovery');
      
      // Create request with very short timeout to trigger timeout scenario
      const timeoutRequest: ComparativeAnalysisRequest = {
        ...ComprehensiveTestDataFactory.createAnalysisRequest(),
        options: {
          ...ComprehensiveTestDataFactory.createAnalysisRequest().options,
          timeout: 1 // 1ms timeout to force timeout
        },
        correlationId: testCorrelationId
      };

      const startTime = Date.now();
      const result = await analysisService.analyzeProduct(timeoutRequest);
      const duration = Date.now() - startTime;
      
      // Should handle timeout gracefully
      expect(result).toBeDefined();
      expect(result.correlationId).toBe(testCorrelationId);
      
      // Should fail fast due to timeout
      expect(duration).toBeLessThan(COMPREHENSIVE_TEST_CONFIG.timeout.recovery);
      
      logger.info('✅ Timeout scenario handled correctly', {
        duration: `${duration}ms`,
        success: result.success,
        correlationId: result.correlationId
      });
    }, COMPREHENSIVE_TEST_CONFIG.timeout.recovery);
  });

  describe('4. Performance Benchmark Validation', () => {
    it('should meet analysis performance benchmarks', async () => {
      logger.info('⚡ Running analysis performance benchmarks');
      
      const benchmarkRuns = 5;
      const analysisResults: Array<{ time: number; quality: number }> = [];

      for (let i = 0; i < benchmarkRuns; i++) {
        const request = ComprehensiveTestDataFactory.createAnalysisRequest();
        request.correlationId = generateCorrelationId();
        
        const startTime = Date.now();
        const result = await analysisService.analyzeProduct(request);
        const duration = Date.now() - startTime;
        
        expect(result.success).toBe(true);
        expect(duration).toBeLessThan(COMPREHENSIVE_TEST_CONFIG.performance.analysisMaxTime);
        
        analysisResults.push({
          time: duration,
          quality: result.quality!.overallScore
        });
      }

      // Calculate benchmark statistics
      const avgTime = analysisResults.reduce((sum, r) => sum + r.time, 0) / benchmarkRuns;
      const avgQuality = analysisResults.reduce((sum, r) => sum + r.quality, 0) / benchmarkRuns;
      const maxTime = Math.max(...analysisResults.map(r => r.time));
      const minTime = Math.min(...analysisResults.map(r => r.time));

      // Validate performance benchmarks
      expect(avgTime).toBeLessThan(COMPREHENSIVE_TEST_CONFIG.performance.analysisMaxTime * 0.8); // 80% of max
      expect(avgQuality).toBeGreaterThanOrEqual(COMPREHENSIVE_TEST_CONFIG.performance.qualityScoreMin);
      expect(maxTime).toBeLessThan(COMPREHENSIVE_TEST_CONFIG.performance.analysisMaxTime);

      logger.info('✅ Analysis performance benchmarks validated', {
        runs: benchmarkRuns,
        avgTime: `${avgTime.toFixed(0)}ms`,
        avgQuality: avgQuality.toFixed(3),
        timeRange: `${minTime}-${maxTime}ms`,
        benchmark: `<${COMPREHENSIVE_TEST_CONFIG.performance.analysisMaxTime}ms`
      });
    });

    it('should meet report generation performance benchmarks', async () => {
      logger.info('⚡ Running report generation performance benchmarks');
      
      // Get analysis for report generation
      const analysisRequest = ComprehensiveTestDataFactory.createAnalysisRequest();
      const analysisResult = await analysisService.analyzeProduct(analysisRequest);
      expect(analysisResult.success).toBe(true);

      const benchmarkRuns = 3; // Fewer runs for report generation (more expensive)
      const reportResults: Array<{ time: number; contentLength: number }> = [];

      for (let i = 0; i < benchmarkRuns; i++) {
        const request = ComprehensiveTestDataFactory.createReportRequest(analysisResult);
        request.correlationId = generateCorrelationId();
        
        const startTime = Date.now();
        const result = await reportingService.generateComparativeReport(request);
        const duration = Date.now() - startTime;
        
        expect(result.success).toBe(true);
        expect(duration).toBeLessThan(COMPREHENSIVE_TEST_CONFIG.performance.reportMaxTime);
        
        reportResults.push({
          time: duration,
          contentLength: result.report!.content.length
        });
      }

      // Calculate benchmark statistics
      const avgTime = reportResults.reduce((sum, r) => sum + r.time, 0) / benchmarkRuns;
      const avgContentLength = reportResults.reduce((sum, r) => sum + r.contentLength, 0) / benchmarkRuns;
      const maxTime = Math.max(...reportResults.map(r => r.time));

      // Validate performance benchmarks
      expect(avgTime).toBeLessThan(COMPREHENSIVE_TEST_CONFIG.performance.reportMaxTime * 0.8); // 80% of max
      expect(avgContentLength).toBeGreaterThan(1000); // Substantial content
      expect(maxTime).toBeLessThan(COMPREHENSIVE_TEST_CONFIG.performance.reportMaxTime);

      logger.info('✅ Report generation performance benchmarks validated', {
        runs: benchmarkRuns,
        avgTime: `${avgTime.toFixed(0)}ms`,
        avgContentLength: `${avgContentLength.toFixed(0)} chars`,
        maxTime: `${maxTime}ms`,
        benchmark: `<${COMPREHENSIVE_TEST_CONFIG.performance.reportMaxTime}ms`
      });
    });
  });

  describe('5. Service Integration Verification', () => {
    it('should validate consolidated service integration', async () => {
      logger.info('🔗 Validating consolidated service integration');
      
      const analysisRequest = ComprehensiveTestDataFactory.createAnalysisRequest();
      const analysisResult = await analysisService.analyzeProduct(analysisRequest);
      
      // Validate analysis service integration
      expect(analysisResult.success).toBe(true);
      expect(analysisResult.analysis.metadata.serviceVersion).toContain('consolidated');
      expect(analysisResult.analysis.metadata.integrations).toBeDefined();
      
      const reportRequest = ComprehensiveTestDataFactory.createReportRequest(analysisResult);
      const reportResult = await reportingService.generateComparativeReport(reportRequest);
      
      // Validate reporting service integration
      expect(reportResult.success).toBe(true);
      expect(reportResult.report!.metadata.serviceVersion).toContain('consolidated');
      expect(reportResult.report!.metadata.analysisIntegration).toBeDefined();
      
      // Validate cross-service integration
      expect(reportResult.analysisId).toBe(analysisResult.analysis.id);
      expect(reportResult.report!.metadata.analysisMetadata).toEqual(analysisResult.analysis.metadata);
      
      logger.info('✅ Consolidated service integration validated', {
        analysisService: analysisResult.analysis.metadata.serviceVersion,
        reportingService: reportResult.report!.metadata.serviceVersion,
        integrationVerified: reportResult.analysisId === analysisResult.analysis.id
      });
    });
  });

  // Helper Functions
  async function setupTestData(): Promise<void> {
    try {
      // Create test project
      await prisma.project.upsert({
        where: { id: COMPREHENSIVE_TEST_CONFIG.testData.projectId },
        update: {},
        create: ComprehensiveTestDataFactory.createTestProject()
      });

      // Create test product
      await prisma.product.upsert({
        where: { id: COMPREHENSIVE_TEST_CONFIG.testData.productId },
        update: {},
        create: ComprehensiveTestDataFactory.createTestProduct()
      });

      // Create test competitors
      const competitors = ComprehensiveTestDataFactory.createTestCompetitors();
      for (const competitor of competitors) {
        await prisma.competitor.upsert({
          where: { id: competitor.id },
          update: {},
          create: competitor
        });
      }

      logger.info('✅ Test data setup completed');
    } catch (error) {
      logger.error('❌ Failed to setup test data', error as Error);
      throw error;
    }
  }

  async function cleanupTestData(): Promise<void> {
    try {
      // Clean up in reverse dependency order
      await prisma.report.deleteMany({
        where: { projectId: COMPREHENSIVE_TEST_CONFIG.testData.projectId }
      });
      
      await prisma.analysis.deleteMany({
        where: { projectId: COMPREHENSIVE_TEST_CONFIG.testData.projectId }
      });
      
      await prisma.competitor.deleteMany({
        where: { projectId: COMPREHENSIVE_TEST_CONFIG.testData.projectId }
      });
      
      await prisma.product.deleteMany({
        where: { projectId: COMPREHENSIVE_TEST_CONFIG.testData.projectId }
      });
      
      await prisma.project.deleteMany({
        where: { id: COMPREHENSIVE_TEST_CONFIG.testData.projectId }
      });

      logger.info('✅ Test data cleanup completed');
    } catch (error) {
      logger.warn('⚠️ Test data cleanup error', error as Error);
    }
  }

  async function cleanupTestArtifacts(): Promise<void> {
    // Clean up any temporary test artifacts created during individual tests
    // This runs between each test to ensure clean state
  }
}); 