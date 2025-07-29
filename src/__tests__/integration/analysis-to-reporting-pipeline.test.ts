/**
 * Analysis-to-Reporting Pipeline Integration Tests
 * Task 6.2: Preserve Analysis-to-Reporting Pipeline
 * 
 * Tests the complete data flow from consolidated AnalysisService to ReportingService
 * Validates that analysis results are properly consumed by report generation
 * Tests integrated workflow: data collection → analysis → report generation
 * Maintains existing quality thresholds and validation checkpoints
 */

import { AnalysisService } from '../../services/domains/AnalysisService';
import { ReportingService } from '../../services/domains/ReportingService';
import { SmartSchedulingService } from '../../services/smartSchedulingService';
import { SmartDataCollectionService } from '../../services/reports/smartDataCollectionService';
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { AnalysisRequest, AnalysisResponse } from '../../services/domains/types/analysisTypes';
import { ComparativeReportRequest, ComparativeReportResponse } from '../../services/domains/reporting/types';

// Test configuration
const TEST_PROJECT_ID = 'test-project-pipeline';
const TEST_PRODUCT_ID = 'test-product-pipeline';
const TEST_COMPETITOR_IDS = ['comp-1-pipeline', 'comp-2-pipeline'];
const TEST_TIMEOUT = 120000; // 2 minutes

// Quality thresholds for validation
const QUALITY_THRESHOLDS = {
  ANALYSIS_CONFIDENCE_MIN: 0.7,
  ANALYSIS_QUALITY_SCORE_MIN: 0.75,
  REPORT_COMPLETENESS_MIN: 0.8,
  DATA_FRESHNESS_MAX_AGE_HOURS: 24,
  PROCESSING_TIME_MAX_MS: 60000, // 1 minute
  PIPELINE_SUCCESS_RATE_MIN: 0.95
};

describe('Analysis-to-Reporting Pipeline Integration', () => {
  let analysisService: AnalysisService;
  let reportingService: ReportingService;
  let smartSchedulingService: SmartSchedulingService;
  let smartDataCollectionService: SmartDataCollectionService;

  beforeAll(async () => {
    // Initialize services for pipeline testing
    try {
      analysisService = new AnalysisService({
        enabledAnalyzers: {
          aiAnalyzer: true,
          uxAnalyzer: true,
          comparativeAnalyzer: true
        },
        performance: {
          maxCompetitors: 5,
          timeoutMs: 60000
        }
      });

      reportingService = new ReportingService(analysisService);
      smartSchedulingService = new SmartSchedulingService();
      smartDataCollectionService = new SmartDataCollectionService();

      logger.info('Pipeline integration test services initialized');

    } catch (error) {
      logger.error('Failed to initialize pipeline test services', error as Error);
      throw error;
    }
  }, TEST_TIMEOUT);

  afterAll(async () => {
    // Cleanup test data
    try {
      await prisma.report.deleteMany({
        where: { projectId: TEST_PROJECT_ID }
      });
      await prisma.analysis.deleteMany({
        where: { projectId: TEST_PROJECT_ID }
      });
      await prisma.productSnapshot.deleteMany({
        where: { projectId: TEST_PROJECT_ID }
      });
      await prisma.competitorSnapshot.deleteMany({
        where: { competitor: { projectId: TEST_PROJECT_ID } }
      });
    } catch (error) {
      logger.warn('Cleanup error in pipeline tests', error as Error);
    }
  });

  describe('Data Flow Preservation', () => {
    test('should preserve seamless data flow from AnalysisService to ReportingService', async () => {
      // Step 1: Setup test project with realistic data
      const projectSetup = await setupTestProject();
      expect(projectSetup.success).toBe(true);

      // Step 2: Execute analysis using consolidated AnalysisService
      const analysisRequest: AnalysisRequest = {
        projectId: TEST_PROJECT_ID,
        analysisType: 'comparative_analysis',
        forceFreshData: false,
        productData: projectSetup.productData,
        competitorData: projectSetup.competitorData,
        options: {
          includeMetrics: true,
          analysisDepth: 'comprehensive',
          focusAreas: ['features', 'pricing', 'user_experience']
        }
      };

      const analysisStartTime = Date.now();
      const analysisResult = await analysisService.analyzeProduct(analysisRequest);
      const analysisTime = Date.now() - analysisStartTime;

      // Validate analysis result structure and quality
      expect(analysisResult).toBeDefined();
      expect(analysisResult.analysisId).toBeDefined();
      expect(analysisResult.correlationId).toBeDefined();
      expect(analysisResult.analysisType).toBe('comparative_analysis');
      expect(analysisResult.summary).toBeDefined();
      expect(analysisResult.metadata).toBeDefined();
      expect(analysisResult.quality).toBeDefined();

      // Validate analysis quality meets thresholds
      expect(analysisResult.quality!.overallScore).toBeGreaterThanOrEqual(QUALITY_THRESHOLDS.ANALYSIS_QUALITY_SCORE_MIN);
      expect(analysisResult.quality!.confidenceScore).toBeGreaterThanOrEqual(QUALITY_THRESHOLDS.ANALYSIS_CONFIDENCE_MIN);
      expect(analysisTime).toBeLessThan(QUALITY_THRESHOLDS.PROCESSING_TIME_MAX_MS);

      logger.info('Analysis phase completed with quality validation', {
        analysisId: analysisResult.analysisId,
        qualityScore: analysisResult.quality!.overallScore,
        confidenceScore: analysisResult.quality!.confidenceScore,
        processingTime: analysisTime
      });

      // Step 3: Execute report generation using consolidated ReportingService
      const reportRequest: ComparativeReportRequest = {
        projectId: TEST_PROJECT_ID,
        reportType: 'comparative',
        analysis: analysisResult,
        product: projectSetup.productData,
        productSnapshot: projectSetup.productSnapshot,
        options: {
          template: 'comprehensive',
          format: 'markdown',
          includeCharts: true,
          includeTables: true,
          analysisDepth: 'comprehensive'
        }
      };

      const reportStartTime = Date.now();
      const reportResult = await reportingService.generateComparativeReport(reportRequest);
      const reportTime = Date.now() - reportStartTime;

      // Validate report result structure and quality
      expect(reportResult).toBeDefined();
      expect(reportResult.success).toBe(true);
      expect(reportResult.report).toBeDefined();
      expect(reportResult.taskId).toBeDefined();
      expect(reportResult.correlationId).toBeDefined();
      expect(reportResult.processingTime).toBeGreaterThan(0);
      expect(reportTime).toBeLessThan(QUALITY_THRESHOLDS.PROCESSING_TIME_MAX_MS);

      // Validate report content quality
      const report = reportResult.report!;
      expect(report.title).toBeDefined();
      expect(report.sections).toBeDefined();
      expect(report.sections.length).toBeGreaterThan(0);
      expect(report.executiveSummary).toBeDefined();
      expect(report.keyFindings).toBeDefined();
      expect(report.strategicRecommendations).toBeDefined();

      // Validate data consistency between analysis and report
      expect(report.analysisId).toBe(analysisResult.analysisId);
      expect(report.projectId).toBe(TEST_PROJECT_ID);
      expect(report.format).toBe('markdown');

      logger.info('Report generation phase completed with quality validation', {
        reportId: report.id,
        sectionsCount: report.sections.length,
        processingTime: reportTime,
        reportSize: report.sections.reduce((total, section) => total + section.content.length, 0)
      });

      // Step 4: Validate end-to-end data consistency
      const totalPipelineTime = analysisTime + reportTime;
      expect(totalPipelineTime).toBeLessThan(QUALITY_THRESHOLDS.PROCESSING_TIME_MAX_MS * 2);

      // Validate that critical analysis data flows into report
      expect(report.sections.some(section => 
        section.content.includes(analysisResult.summary.substring(0, 50))
      )).toBe(true);

      logger.info('Pipeline data flow validation completed successfully', {
        totalPipelineTime,
        analysisToReportConsistency: true,
        qualityThresholdsMet: true
      });

    }, TEST_TIMEOUT);

    test('should maintain quality thresholds throughout the pipeline', async () => {
      // Test multiple pipeline executions to validate consistency
      const executionResults = [];
      const iterations = 3;

      for (let i = 0; i < iterations; i++) {
        const executionStart = Date.now();
        
        try {
          // Generate unique test data for each iteration
          const projectData = await setupTestProject(`${TEST_PROJECT_ID}-${i}`);
          
          // Execute analysis
          const analysisResult = await analysisService.analyzeProduct({
            projectId: `${TEST_PROJECT_ID}-${i}`,
            analysisType: 'comparative_analysis',
            productData: projectData.productData,
            competitorData: projectData.competitorData
          });

          // Execute reporting
          const reportResult = await reportingService.generateComparativeReport({
            projectId: `${TEST_PROJECT_ID}-${i}`,
            reportType: 'comparative',
            analysis: analysisResult,
            product: projectData.productData,
            productSnapshot: projectData.productSnapshot
          });

          const executionTime = Date.now() - executionStart;

          executionResults.push({
            iteration: i,
            success: reportResult.success,
            analysisQuality: analysisResult.quality!.overallScore,
            analysisConfidence: analysisResult.quality!.confidenceScore,
            reportSections: reportResult.report!.sections.length,
            executionTime
          });

        } catch (error) {
          executionResults.push({
            iteration: i,
            success: false,
            error: (error as Error).message,
            executionTime: Date.now() - executionStart
          });
        }
      }

      // Validate quality thresholds across all executions
      const successfulExecutions = executionResults.filter(result => result.success);
      const successRate = successfulExecutions.length / iterations;

      expect(successRate).toBeGreaterThanOrEqual(QUALITY_THRESHOLDS.PIPELINE_SUCCESS_RATE_MIN);

      // Validate quality metrics for successful executions
      successfulExecutions.forEach(result => {
        expect(result.analysisQuality).toBeGreaterThanOrEqual(QUALITY_THRESHOLDS.ANALYSIS_QUALITY_SCORE_MIN);
        expect(result.analysisConfidence).toBeGreaterThanOrEqual(QUALITY_THRESHOLDS.ANALYSIS_CONFIDENCE_MIN);
        expect(result.reportSections).toBeGreaterThan(0);
        expect(result.executionTime).toBeLessThan(QUALITY_THRESHOLDS.PROCESSING_TIME_MAX_MS * 2);
      });

      logger.info('Quality threshold validation completed across multiple executions', {
        successRate,
        averageAnalysisQuality: successfulExecutions.reduce((sum, r) => sum + r.analysisQuality!, 0) / successfulExecutions.length,
        averageExecutionTime: successfulExecutions.reduce((sum, r) => sum + r.executionTime, 0) / successfulExecutions.length
      });
    }, TEST_TIMEOUT * 3);

    test('should handle data collection → analysis → report generation workflow', async () => {
      // Step 1: Smart data collection
      const collectionResult = await smartDataCollectionService.collectProjectData(TEST_PROJECT_ID, {
        priority: ['form_data', 'fresh_snapshots', 'fast_collection'],
        timeout: 30000,
        fallbackEnabled: true
      });

      expect(collectionResult.success).toBe(true);
      expect(collectionResult.dataCompletenessScore).toBeGreaterThanOrEqual(QUALITY_THRESHOLDS.REPORT_COMPLETENESS_MIN);

      // Validate data freshness
      const dataAge = Date.now() - new Date(collectionResult.dataFreshness.oldestProductData).getTime();
      const dataAgeHours = dataAge / (1000 * 60 * 60);
      expect(dataAgeHours).toBeLessThan(QUALITY_THRESHOLDS.DATA_FRESHNESS_MAX_AGE_HOURS);

      // Step 2: Analysis using collected data
      const analysisResult = await analysisService.analyzeProduct({
        projectId: TEST_PROJECT_ID,
        analysisType: 'comparative_analysis',
        productData: collectionResult.productData,
        competitorData: collectionResult.competitorData,
        forceFreshData: false // Use collected data
      });

      expect(analysisResult.quality!.dataFreshness.overallStatus).toBe('FRESH');

      // Step 3: Report generation using analysis
      const reportResult = await reportingService.generateComparativeReport({
        projectId: TEST_PROJECT_ID,
        reportType: 'comparative',
        analysis: analysisResult,
        product: collectionResult.productData,
        productSnapshot: collectionResult.productData.snapshot
      });

      expect(reportResult.success).toBe(true);
      expect(reportResult.dataFreshness.status).toBe('FRESH');

      // Validate complete workflow data consistency
      expect(reportResult.report!.metadata.analysisMetadata.dataFreshness.overallStatus).toBe('FRESH');
      expect(reportResult.report!.sections.length).toBeGreaterThan(3); // Minimum expected sections

      logger.info('Complete workflow test successful', {
        dataCollectionScore: collectionResult.dataCompletenessScore,
        analysisQuality: analysisResult.quality!.overallScore,
        reportSections: reportResult.report!.sections.length,
        workflowConsistency: true
      });
    }, TEST_TIMEOUT * 2);
  });

  describe('Error Handling and Resilience', () => {
    test('should handle analysis failures gracefully in the pipeline', async () => {
      // Test pipeline resilience with invalid analysis request
      const invalidRequest: AnalysisRequest = {
        projectId: 'non-existent-project',
        analysisType: 'comparative_analysis',
        productData: undefined,
        competitorData: []
      };

      await expect(analysisService.analyzeProduct(invalidRequest))
        .rejects.toThrow();

      // Validate that reporting service handles analysis errors
      const reportRequest: ComparativeReportRequest = {
        projectId: 'non-existent-project',
        reportType: 'comparative',
        analysis: null as any
      };

      await expect(reportingService.generateComparativeReport(reportRequest))
        .rejects.toThrow();

      logger.info('Error handling validation completed - pipeline properly rejects invalid inputs');
    });

    test('should maintain data consistency during partial failures', async () => {
      // Test pipeline behavior with partial data
      const projectSetup = await setupTestProject();
      
      // Remove some competitor data to simulate partial collection
      const partialCompetitorData = projectSetup.competitorData.slice(0, 1);

      const analysisResult = await analysisService.analyzeProduct({
        projectId: TEST_PROJECT_ID,
        analysisType: 'comparative_analysis',
        productData: projectSetup.productData,
        competitorData: partialCompetitorData
      });

      // Should still produce valid analysis with lower quality score
      expect(analysisResult.quality!.overallScore).toBeGreaterThan(0.5);
      expect(analysisResult.quality!.dataCompleteness).toBeLessThan(1.0);

      const reportResult = await reportingService.generateComparativeReport({
        projectId: TEST_PROJECT_ID,
        reportType: 'comparative',
        analysis: analysisResult,
        product: projectSetup.productData,
        productSnapshot: projectSetup.productSnapshot
      });

      // Report should be generated with data gap warnings
      expect(reportResult.success).toBe(true);
      expect(reportResult.warnings).toBeDefined();
      expect(reportResult.warnings!.length).toBeGreaterThan(0);

      logger.info('Partial failure handling validated - pipeline maintains consistency with reduced quality');
    });
  });
});

// Helper functions for test setup
async function setupTestProject(projectId: string = TEST_PROJECT_ID) {
  // Create test project with product and competitors
  const productData = {
    id: TEST_PRODUCT_ID,
    name: 'Test Product Pipeline',
    website: 'https://testproduct.example.com',
    description: 'Test product for pipeline validation',
    snapshot: {
      id: 'test-product-snapshot',
      pricing: { plans: [{ name: 'Basic', price: 29 }] },
      features: ['Feature 1', 'Feature 2', 'Feature 3'],
      userExperience: { navigation: 'good', design: 'modern' },
      capturedAt: new Date(),
      captureSuccess: true
    }
  };

  const competitorData = TEST_COMPETITOR_IDS.map((id, index) => ({
    competitor: {
      id,
      name: `Test Competitor ${index + 1}`,
      website: `https://competitor${index + 1}.example.com`,
      projectId: projectId
    },
    snapshot: {
      id: `test-competitor-snapshot-${index}`,
      pricing: { plans: [{ name: 'Pro', price: 39 + (index * 10) }] },
      features: [`Comp Feature ${index + 1}A`, `Comp Feature ${index + 1}B`],
      userExperience: { navigation: 'average', design: 'standard' },
      capturedAt: new Date(),
      captureSuccess: true
    }
  }));

  return {
    success: true,
    productData,
    competitorData,
    productSnapshot: productData.snapshot
  };
} 