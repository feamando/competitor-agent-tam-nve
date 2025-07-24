/**
 * Critical Flow Integration Tests for Unified AnalysisService - Task 3.2 Implementation
 * 
 * Focused integration tests covering the most critical data flows:
 * - Smart Scheduling → Analysis → Reporting pipeline
 * - Feature flag behavior and rollout scenarios
 * - Backward compatibility with legacy services
 * - Error handling and fallback mechanisms
 */

import { AnalysisService } from '@/services/domains/AnalysisService';
import { FeatureFlagService, featureFlags } from '@/services/migration/FeatureFlags';
import { SmartSchedulingService } from '@/services/smartSchedulingService';
import { SmartAIService } from '@/services/smartAIService';
import { ComparativeAnalysisService } from '@/services/analysis/comparativeAnalysisService';
import { logger } from '@/lib/logger';

// Mock external dependencies to focus on integration logic
jest.mock('@/services/bedrock/bedrock.service', () => ({
  BedrockService: {
    createWithStoredCredentials: jest.fn().mockResolvedValue({
      generateCompletion: jest.fn().mockResolvedValue('Mock AI analysis response with comprehensive insights and recommendations')
    })
  }
}));

jest.mock('@/lib/prisma', () => ({
  project: {
    findUnique: jest.fn().mockResolvedValue({
      id: 'test-project-1',
      name: 'Test Project',
      description: 'Test project for integration testing'
    })
  },
  product: {
    findMany: jest.fn().mockResolvedValue([{
      id: 'test-product-1',
      name: 'Test Product',
      website: 'https://testproduct.com',
      snapshots: [{
        id: 'test-snapshot-1',
        content: { title: 'Test Product', features: ['Feature 1', 'Feature 2'] },
        metadata: { scrapedAt: new Date().toISOString() }
      }]
    }])
  },
  competitor: {
    findMany: jest.fn().mockResolvedValue([{
      id: 'test-competitor-1',
      name: 'Test Competitor',
      website: 'https://competitor.com',
      snapshots: [{
        id: 'test-comp-snapshot-1',
        metadata: { title: 'Test Competitor', features: ['Comp Feature 1'] }
      }]
    }])
  }
}));

describe('Critical Flow Integration Tests - Unified AnalysisService', () => {
  let analysisService: AnalysisService;
  let smartSchedulingService: SmartSchedulingService;
  let legacySmartAIService: SmartAIService;
  let legacyComparativeService: ComparativeAnalysisService;

  const TEST_PROJECT_ID = 'test-project-1';

  beforeAll(async () => {
    // Initialize services
    analysisService = new AnalysisService();
    smartSchedulingService = new SmartSchedulingService();
    legacySmartAIService = new SmartAIService();
    legacyComparativeService = new ComparativeAnalysisService();

    // Configure feature flags for testing
    featureFlags.updateConfiguration({
      useUnifiedAnalysisService: true,
      rolloutPercentage: 100,
      enableForReporting: true,
      enableForAPI: true,
      enableForScheduledJobs: true,
      enableFallback: true,
      performanceMonitoring: true
    });

    logger.info('Critical flow integration tests initialized');
  });

  describe('Critical Data Flow: Smart Scheduling → Analysis → Reporting', () => {

    it('should preserve Smart Scheduling integration in AI analysis flow', async () => {
      const startTime = Date.now();
      
      // Mock Smart Scheduling service responses
      jest.spyOn(smartSchedulingService, 'getFreshnessStatus').mockResolvedValueOnce({
        projectId: TEST_PROJECT_ID,
        overallStatus: 'STALE',
        productSnapshots: { status: 'STALE', count: 1, lastUpdated: new Date() },
        competitorSnapshots: { status: 'FRESH', count: 2, lastUpdated: new Date() },
        recommendedActions: ['Update product snapshots'],
        lastScrapingAttempt: new Date(),
        nextRecommendedScraping: new Date()
      });

      jest.spyOn(smartSchedulingService, 'checkAndTriggerScraping').mockResolvedValueOnce({
        triggered: true,
        tasksExecuted: 2,
        results: {
          successful: 2,
          failed: 0,
          skipped: 0
        },
        processingTime: 1500,
        nextScheduledRun: new Date()
      });

      // Execute the critical flow
      const analysisRequest = {
        projectId: TEST_PROJECT_ID,
        analysisType: 'comprehensive' as const,
        forceFreshData: true,
        context: {
          criticalFlowTest: true,
          smartSchedulingIntegration: true
        }
      };

      const result = await analysisService.analyzeWithSmartScheduling(analysisRequest);
      const processingTime = Date.now() - startTime;

      // Validate Smart Scheduling integration is preserved
      expect(result).toBeDefined();
      expect(result.dataFreshness).toBeDefined();
      expect(result.analysisMetadata).toBeDefined();
      expect(result.analysisMetadata.scrapingTriggered).toBe(true);
      expect(result.analysisMetadata.dataFreshGuaranteed).toBeDefined();

      // Validate analysis output quality
      expect(result.analysis).toBeDefined();
      expect(result.analysis.length).toBeGreaterThan(50);
      expect(result.recommendations).toBeDefined();

      // Validate performance within acceptable limits
      expect(processingTime).toBeLessThan(10000); // 10 seconds for mock services

      logger.info('Smart Scheduling integration test completed', {
        processingTime,
        scrapingTriggered: result.analysisMetadata.scrapingTriggered,
        dataFreshGuaranteed: result.analysisMetadata.dataFreshGuaranteed
      });
    });

    it('should handle data collection to analysis to reporting workflow', async () => {
      // This test validates the complete workflow without external dependencies
      const workflowContext = {
        workflowTest: true,
        projectId: TEST_PROJECT_ID,
        timestamp: Date.now()
      };

      // Step 1: Simulate data collection validation
      const projectData = await require('@/lib/prisma').project.findUnique({
        where: { id: TEST_PROJECT_ID }
      });
      expect(projectData).toBeDefined();

      // Step 2: Execute analysis with unified service
      const analysisStart = Date.now();
      const analysisRequest = {
        analysisType: 'comparative_analysis' as const,
        projectId: TEST_PROJECT_ID,
        forceFreshData: false,
        priority: 'normal' as const,
        context: workflowContext
      };

      const analysisResult = await analysisService.analyzeProduct(analysisRequest);
      const analysisTime = Date.now() - analysisStart;

      // Validate analysis structure for reporting compatibility
      expect(analysisResult).toBeDefined();
      expect(analysisResult.analysisId).toBeDefined();
      expect(analysisResult.correlationId).toBeDefined();
      expect(analysisResult.summary).toBeDefined();
      expect(analysisResult.metadata).toBeDefined();
      expect(analysisResult.quality).toBeDefined();

      // Validate analysis quality metrics
      expect(analysisResult.quality.overallScore).toBeGreaterThan(70);
      expect(analysisResult.quality.confidence).toBeGreaterThan(0.7);

      // Step 3: Validate structure is suitable for report generation
      expect(analysisResult.summary.length).toBeGreaterThan(30);
      if (analysisResult.comparativeAnalysis) {
        expect(analysisResult.comparativeAnalysis.summary).toBeDefined();
        expect(analysisResult.comparativeAnalysis.recommendations).toBeDefined();
      }

      logger.info('Complete workflow test results', {
        analysisTime,
        qualityScore: analysisResult.quality.overallScore,
        confidence: analysisResult.quality.confidence,
        analysisType: analysisResult.analysisType
      });
    });
  });

  describe('Feature Flag Integration and Rollout', () => {

    it('should respect feature flag rollout percentage', async () => {
      // Test 50% rollout scenario  
      featureFlags.updateConfiguration({ rolloutPercentage: 50 });

      const testContexts = ['test-ctx-1', 'test-ctx-2', 'test-ctx-3', 'test-ctx-4'];
      const results = new Map<string, boolean>();

      for (const context of testContexts) {
        const shouldUse = featureFlags.shouldUseUnifiedAnalysisService(context);
        results.set(context, shouldUse);

        // Consistency check - same context should always return same result
        const secondCall = featureFlags.shouldUseUnifiedAnalysisService(context);
        expect(secondCall).toBe(shouldUse);
      }

      // With 50% rollout, should have mixed results
      const enabledCount = Array.from(results.values()).filter(Boolean).length;
      expect(enabledCount).toBeGreaterThan(0);
      expect(enabledCount).toBeLessThan(testContexts.length);
    });

    it('should handle feature flag disabled scenario with fallback', async () => {
      // Disable unified service
      featureFlags.updateConfiguration({
        useUnifiedAnalysisService: false,
        enableFallback: true
      });

      const shouldUse = featureFlags.shouldUseUnifiedAnalysisService('test-disabled');
      expect(shouldUse).toBe(false);
      expect(featureFlags.isFallbackEnabled()).toBe(true);

      // Reset for other tests
      featureFlags.updateConfiguration({
        useUnifiedAnalysisService: true,
        rolloutPercentage: 100
      });
    });

    it('should handle service-specific enablement flags', async () => {
      featureFlags.updateConfiguration({
        useUnifiedAnalysisService: true,
        enableForReporting: true,
        enableForAPI: false,
        enableForScheduledJobs: true
      });

      expect(featureFlags.isEnabledForReporting()).toBe(true);
      expect(featureFlags.isEnabledForAPI()).toBe(false);
      expect(featureFlags.isEnabledForScheduledJobs()).toBe(true);
    });
  });

  describe('Backward Compatibility with Legacy Services', () => {

    it('should maintain SmartAIService interface compatibility', async () => {
      const compatibilityRequest = {
        projectId: TEST_PROJECT_ID,
        analysisType: 'comprehensive' as const,
        forceFreshData: false,
        context: { backwardCompatibilityTest: true }
      };

      // Test unified service with legacy interface
      const unifiedResult = await analysisService.analyzeWithSmartScheduling(compatibilityRequest);

      // Validate response structure matches expected legacy format
      expect(unifiedResult).toBeDefined();
      expect(unifiedResult.analysis).toBeDefined();
      expect(unifiedResult.dataFreshness).toBeDefined();
      expect(unifiedResult.analysisMetadata).toBeDefined();
      expect(unifiedResult.recommendations).toBeDefined();

      // Validate metadata structure
      expect(unifiedResult.analysisMetadata.analysisType).toBeDefined();
      expect(unifiedResult.analysisMetadata.correlationId).toBeDefined();
      expect(unifiedResult.analysisMetadata.analysisTimestamp).toBeDefined();
      expect(typeof unifiedResult.analysisMetadata.dataFreshGuaranteed).toBe('boolean');
    });

    it('should maintain ComparativeAnalysisService interface compatibility', async () => {
      // Create mock analysis input compatible with legacy service
      const analysisInput = {
        product: {
          id: 'test-product-1',
          name: 'Test Product',
          website: 'https://testproduct.com',
          positioning: 'Innovative solution',
          customerData: 'Business customers',
          userProblem: 'Workflow efficiency',
          industry: 'Technology'
        },
        productSnapshot: {
          id: 'test-snapshot-1',
          productId: 'test-product-1',
          content: {
            title: 'Test Product',
            description: 'Test product for compatibility testing',
            features: ['Feature 1', 'Feature 2', 'Feature 3']
          },
          metadata: { scrapedAt: new Date().toISOString() },
          createdAt: new Date()
        },
        competitors: [{
          competitor: {
            id: 'test-competitor-1',
            name: 'Test Competitor',
            website: 'https://competitor.com',
            industry: 'Technology'
          },
          snapshot: {
            id: 'test-comp-snapshot-1',
            competitorId: 'test-competitor-1',
            metadata: {
              title: 'Test Competitor',
              features: ['Comp Feature 1', 'Comp Feature 2']
            },
            createdAt: new Date(),
            updatedAt: new Date()
          }
        }],
        analysisConfig: {
          focusAreas: ['features', 'positioning'] as const,
          depth: 'detailed' as const,
          includeRecommendations: true
        }
      };

      // Test unified service with legacy interface
      const result = await analysisService.analyzeProductVsCompetitors(analysisInput);

      // Validate response structure matches legacy format
      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.projectId).toBeDefined();
      expect(result.productId).toBe('test-product-1');
      expect(result.summary).toBeDefined();
      expect(result.detailed).toBeDefined();
      expect(result.recommendations).toBeDefined();
      expect(result.metadata).toBeDefined();
      expect(result.metadata.confidenceScore).toBeGreaterThan(70);
    });
  });

  describe('Error Handling and Resilience', () => {

    it('should handle analysis errors gracefully', async () => {
      const invalidRequest = {
        analysisType: 'ai_comprehensive' as const,
        projectId: 'non-existent-project',
        forceFreshData: false,
        priority: 'normal' as const,
        context: { errorTest: true }
      };

      await expect(analysisService.analyzeProduct(invalidRequest))
        .rejects.toThrow();
    });

    it('should provide meaningful service health information', async () => {
      const health = await analysisService.getServiceHealth();

      expect(health).toBeDefined();
      expect(health.status).toMatch(/^(healthy|warning|critical)$/);
      expect(health.timestamp).toBeInstanceOf(Date);
      expect(health.services).toBeDefined();
      expect(health.performance).toBeDefined();

      // Validate core service health checks
      expect(health.services.smartSchedulingService).toBeDefined();
      expect(health.performance.successRate).toBeGreaterThanOrEqual(0);
    });

    it('should handle timeout scenarios appropriately', async () => {
      const timeoutRequest = {
        analysisType: 'ai_comprehensive' as const,
        projectId: TEST_PROJECT_ID,
        forceFreshData: false,
        priority: 'low' as const,
        timeout: 100, // Very short timeout for testing
        context: { timeoutTest: true }
      };

      const startTime = Date.now();
      
      try {
        await analysisService.analyzeProduct(timeoutRequest);
      } catch (error: any) {
        const elapsedTime = Date.now() - startTime;
        // If timeout error, should complete relatively quickly
        if (error.code === 'TIMEOUT_ERROR') {
          expect(elapsedTime).toBeLessThan(2000); // 2 seconds max
        }
      }
    });
  });

  describe('Performance and Quality Standards', () => {

    it('should meet performance benchmarks for different analysis types', async () => {
      const performanceTests = [
        {
          name: 'AI Analysis',
          analysisType: 'ai_comprehensive' as const,
          maxTime: 5000 // 5 seconds with mocked services
        },
        {
          name: 'UX Analysis',
          analysisType: 'ux_comparison' as const,
          maxTime: 4000 // 4 seconds with mocked services
        },
        {
          name: 'Comparative Analysis',
          analysisType: 'comparative_analysis' as const,
          maxTime: 4500 // 4.5 seconds with mocked services
        }
      ];

      for (const test of performanceTests) {
        const startTime = Date.now();
        
        const result = await analysisService.analyzeProduct({
          analysisType: test.analysisType,
          projectId: TEST_PROJECT_ID,
          forceFreshData: false,
          priority: 'normal' as const,
          context: { performanceTest: test.name }
        });

        const processingTime = Date.now() - startTime;

        expect(processingTime).toBeLessThan(test.maxTime);
        expect(result.quality.overallScore).toBeGreaterThan(70);

        logger.info(`Performance benchmark: ${test.name}`, {
          processingTime,
          maxTime: test.maxTime,
          qualityScore: result.quality.overallScore,
          passed: processingTime < test.maxTime
        });
      }
    });

    it('should maintain quality standards across analysis types', async () => {
      const qualityRequest = {
        analysisType: 'comparative_analysis' as const,
        projectId: TEST_PROJECT_ID,
        forceFreshData: false,
        priority: 'normal' as const,
        context: { qualityStandardsTest: true }
      };

      const result = await analysisService.analyzeProduct(qualityRequest);

      // Validate quality metrics meet standards
      expect(result.quality.overallScore).toBeGreaterThan(70);
      expect(result.quality.confidence).toBeGreaterThan(0.7);
      expect(result.quality.dataCompleteness).toBeGreaterThan(0.6);

      // Validate content quality
      expect(result.summary.length).toBeGreaterThan(50);
      
      if (result.comparativeAnalysis) {
        expect(result.comparativeAnalysis.summary.keyStrengths).toBeDefined();
        expect(result.comparativeAnalysis.summary.keyWeaknesses).toBeDefined();
        expect(result.comparativeAnalysis.recommendations.immediate).toBeDefined();
      }
    });

    it('should handle concurrent requests efficiently', async () => {
      const concurrentRequests = Array.from({ length: 3 }, (_, i) => ({
        analysisType: 'ux_comparison' as const,
        projectId: TEST_PROJECT_ID,
        forceFreshData: false,
        priority: 'normal' as const,
        context: { concurrentTest: true, requestId: i }
      }));

      const startTime = Date.now();
      const results = await Promise.all(
        concurrentRequests.map(req => analysisService.analyzeProduct(req))
      );
      const totalTime = Date.now() - startTime;

      // Validate all requests completed successfully
      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(result.analysisId).toBeDefined();
      });

      // Should handle concurrent requests efficiently with mocked services
      expect(totalTime).toBeLessThan(15000); // 15 seconds for 3 concurrent requests

      logger.info('Concurrent processing test completed', {
        requestCount: concurrentRequests.length,
        totalTime,
        averageTime: totalTime / concurrentRequests.length
      });
    });
  });
}); 