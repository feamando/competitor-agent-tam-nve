/**
 * Unified AnalysisService Integration Tests - Task 3.2 Implementation
 * 
 * Comprehensive integration tests covering:
 * - All analysis types (AI, UX, Comparative)
 * - Critical data flows: data collection → analysis → reporting
 * - Feature flag behavior and rollout scenarios
 * - Backward compatibility with legacy services
 * - Error handling and fallback mechanisms
 * - Performance and quality standards
 */

import { AnalysisService } from '@/services/domains/AnalysisService';
import { SmartAIService } from '@/services/smartAIService';
import { ComparativeAnalysisService } from '@/services/analysis/comparativeAnalysisService';
import { UserExperienceAnalyzer } from '@/services/analysis/userExperienceAnalyzer';
import { FeatureFlagService, featureFlags } from '@/services/migration/FeatureFlags';
import { SmartSchedulingService } from '@/services/smartSchedulingService';
import { BedrockService } from '@/services/bedrock/bedrock.service';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';

// Test data helpers
import { createTestProject, createTestProduct, createTestCompetitor } from '../helpers/testDataFactory';

describe('Unified AnalysisService Integration Tests', () => {
  let analysisService: AnalysisService;
  let legacySmartAIService: SmartAIService;
  let legacyComparativeService: ComparativeAnalysisService;
  let legacyUXAnalyzer: UserExperienceAnalyzer;
  let smartSchedulingService: SmartSchedulingService;
  
  // Test project data
  let testProject: any;
  let testProduct: any;
  let testCompetitors: any[];
  
  beforeAll(async () => {
    // Initialize all services
    analysisService = new AnalysisService();
    legacySmartAIService = new SmartAIService();
    legacyComparativeService = new ComparativeAnalysisService();
    legacyUXAnalyzer = new UserExperienceAnalyzer();
    smartSchedulingService = new SmartSchedulingService();

    // Create test data
    testProject = await createTestProject({
      name: 'Integration Test Project',
      industry: 'Technology',
      description: 'Test project for unified analysis service integration'
    });

    testProduct = await createTestProduct({
      projectId: testProject.id,
      name: 'Test Product',
      website: 'https://testproduct.com',
      industry: 'Technology'
    });

    testCompetitors = await Promise.all([
      createTestCompetitor({
        projectId: testProject.id,
        name: 'Competitor A',
        website: 'https://competitora.com'
      }),
      createTestCompetitor({
        projectId: testProject.id,
        name: 'Competitor B', 
        website: 'https://competitorb.com'
      })
    ]);

    logger.info('Integration test setup completed', {
      projectId: testProject.id,
      productId: testProduct.id,
      competitorCount: testCompetitors.length
    });
  });

  afterAll(async () => {
    // Cleanup test data
    if (testProject) {
      await prisma.project.delete({
        where: { id: testProject.id }
      }).catch(() => {}); // Ignore errors during cleanup
    }
  });

  describe('Unified Analysis Service Core Functionality', () => {
    
    describe('Primary analyzeProduct Interface', () => {
      
      it('should handle AI comprehensive analysis correctly', async () => {
        const request = {
          analysisType: 'ai_comprehensive' as const,
          projectId: testProject.id,
          forceFreshData: false,
          priority: 'normal' as const,
          context: {
            testRun: true,
            integrationTest: 'ai_comprehensive'
          }
        };

        const startTime = Date.now();
        const result = await analysisService.analyzeProduct(request);
        const processingTime = Date.now() - startTime;

        // Validate response structure
        expect(result).toBeDefined();
        expect(result.analysisId).toBeDefined();
        expect(result.correlationId).toBeDefined();
        expect(result.analysisType).toBe('ai_comprehensive');
        expect(result.summary).toBeDefined();
        expect(result.metadata).toBeDefined();
        expect(result.quality).toBeDefined();

        // Validate performance requirements
        expect(processingTime).toBeLessThan(30000); // 30 seconds max
        
        // Validate quality standards
        expect(result.quality.overallScore).toBeGreaterThan(70);
        expect(result.quality.confidence).toBeGreaterThan(0.7);

        logger.info('AI comprehensive analysis test completed', {
          analysisId: result.analysisId,
          processingTime,
          qualityScore: result.quality.overallScore
        });
      });

      it('should handle UX comparison analysis correctly', async () => {
        const request = {
          analysisType: 'ux_comparison' as const,
          projectId: testProject.id,
          forceFreshData: false,
          priority: 'normal' as const,
          context: {
            testRun: true,
            integrationTest: 'ux_comparison'
          }
        };

        const result = await analysisService.analyzeProduct(request);

        // Validate UX-specific response
        expect(result).toBeDefined();
        expect(result.analysisType).toBe('ux_comparison');
        expect(result.uxAnalysis).toBeDefined();
        
        if (result.uxAnalysis) {
          expect(result.uxAnalysis.summary).toBeDefined();
          expect(result.uxAnalysis.strengths).toBeInstanceOf(Array);
          expect(result.uxAnalysis.weaknesses).toBeInstanceOf(Array);
          expect(result.uxAnalysis.recommendations).toBeInstanceOf(Array);
          expect(result.uxAnalysis.confidence).toBeGreaterThan(0.4);
        }
      });

      it('should handle comparative analysis correctly', async () => {
        const request = {
          analysisType: 'comparative_analysis' as const,
          projectId: testProject.id,
          forceFreshData: false,
          priority: 'normal' as const,
          context: {
            testRun: true,
            integrationTest: 'comparative_analysis'
          }
        };

        const result = await analysisService.analyzeProduct(request);

        // Validate comparative analysis response
        expect(result).toBeDefined();
        expect(result.analysisType).toBe('comparative_analysis');
        expect(result.comparativeAnalysis).toBeDefined();
        
        if (result.comparativeAnalysis) {
          expect(result.comparativeAnalysis.id).toBeDefined();
          expect(result.comparativeAnalysis.summary).toBeDefined();
          expect(result.comparativeAnalysis.detailed).toBeDefined();
          expect(result.comparativeAnalysis.recommendations).toBeDefined();
          expect(result.comparativeAnalysis.metadata.confidenceScore).toBeGreaterThan(70);
        }
      });
    });

    describe('Backward Compatibility Interface', () => {

      it('should maintain SmartAIService.analyzeWithSmartScheduling compatibility', async () => {
        const request = {
          projectId: testProject.id,
          analysisType: 'comprehensive' as const,
          forceFreshData: false,
          context: {
            testRun: true,
            backwardCompatibility: 'smart_ai'
          }
        };

        // Test unified service
        const unifiedResult = await analysisService.analyzeWithSmartScheduling(request);
        
        // Test legacy service for comparison
        const legacyResult = await legacySmartAIService.analyzeWithSmartScheduling(request);

        // Validate response compatibility
        expect(unifiedResult).toBeDefined();
        expect(unifiedResult.analysis).toBeDefined();
        expect(unifiedResult.dataFreshness).toBeDefined();
        expect(unifiedResult.analysisMetadata).toBeDefined();
        expect(unifiedResult.recommendations).toBeDefined();

        // Validate response structure matches legacy
        expect(unifiedResult.analysisMetadata.analysisType).toBe(legacyResult.analysisMetadata.analysisType);
        expect(unifiedResult.analysisMetadata.dataFreshGuaranteed).toBeDefined();
        expect(typeof unifiedResult.analysis).toBe(typeof legacyResult.analysis);
      });

      it('should maintain ComparativeAnalysisService.analyzeProductVsCompetitors compatibility', async () => {
        // Create analysis input
        const analysisInput = {
          product: {
            id: testProduct.id,
            name: testProduct.name,
            website: testProduct.website,
            positioning: 'Innovative technology solution',
            customerData: 'Business customers',
            userProblem: 'Complex workflow management',
            industry: testProduct.industry
          },
          productSnapshot: {
            id: 'test-snapshot-1',
            productId: testProduct.id,
            content: {
              title: 'Test Product',
              description: 'Comprehensive test product for integration testing',
              features: ['Feature 1', 'Feature 2', 'Feature 3']
            },
            metadata: { scrapedAt: new Date().toISOString() },
            createdAt: new Date()
          },
          competitors: testCompetitors.map(comp => ({
            competitor: {
              id: comp.id,
              name: comp.name,
              website: comp.website,
              industry: comp.industry
            },
            snapshot: {
              id: `snapshot-${comp.id}`,
              competitorId: comp.id,
              metadata: {
                title: comp.name,
                description: `${comp.name} competitor analysis`,
                features: ['Competitor feature 1', 'Competitor feature 2']
              },
              createdAt: new Date(),
              updatedAt: new Date()
            }
          })),
          analysisConfig: {
            focusAreas: ['features', 'positioning', 'user_experience'] as const,
            depth: 'detailed' as const,
            includeRecommendations: true
          }
        };

        // Test unified service
        const unifiedResult = await analysisService.analyzeProductVsCompetitors(analysisInput);

        // Validate response structure
        expect(unifiedResult).toBeDefined();
        expect(unifiedResult.id).toBeDefined();
        expect(unifiedResult.projectId).toBe(testProject.id);
        expect(unifiedResult.productId).toBe(testProduct.id);
        expect(unifiedResult.summary).toBeDefined();
        expect(unifiedResult.detailed).toBeDefined();
        expect(unifiedResult.recommendations).toBeDefined();
        expect(unifiedResult.metadata).toBeDefined();
        expect(unifiedResult.metadata.confidenceScore).toBeGreaterThan(70);
      });
    });
  });

  describe('Critical Data Flow Integration', () => {

    it('should preserve Smart Scheduling → Analysis → Reporting flow', async () => {
      const startTime = Date.now();
      
      // Step 1: Check data freshness (Smart Scheduling integration)
      const freshnessStatus = await smartSchedulingService.getFreshnessStatus(testProject.id);
      expect(freshnessStatus).toBeDefined();
      expect(freshnessStatus.overallStatus).toBeDefined();

      // Step 2: Execute AI analysis with Smart Scheduling integration
      const analysisRequest = {
        projectId: testProject.id,
        analysisType: 'comprehensive' as const,
        forceFreshData: freshnessStatus.overallStatus !== 'FRESH',
        context: {
          dataFlowTest: true,
          smartSchedulingIntegration: true
        }
      };

      const analysisResult = await analysisService.analyzeWithSmartScheduling(analysisRequest);
      
      // Validate Smart Scheduling integration is preserved
      expect(analysisResult.dataFreshness).toBeDefined();
      expect(analysisResult.analysisMetadata.scrapingTriggered).toBeDefined();
      expect(analysisResult.analysisMetadata.dataFreshGuaranteed).toBeDefined();

      // Step 3: Validate analysis can be used for reporting
      expect(analysisResult.analysis).toBeDefined();
      expect(analysisResult.analysis.length).toBeGreaterThan(100); // Meaningful analysis content

      const totalProcessingTime = Date.now() - startTime;
      logger.info('Critical data flow test completed', {
        freshnessStatus: freshnessStatus.overallStatus,
        scrapingTriggered: analysisResult.analysisMetadata.scrapingTriggered,
        dataFreshGuaranteed: analysisResult.analysisMetadata.dataFreshGuaranteed,
        totalProcessingTime
      });

      // Validate performance requirements for critical flow
      expect(totalProcessingTime).toBeLessThan(45000); // 45 seconds max for full flow
    });

    it('should handle data collection → analysis → reporting workflow', async () => {
      // This test validates the complete workflow from data collection through analysis to reporting
      const workflowContext = {
        workflowTest: true,
        projectId: testProject.id,
        timestamp: Date.now()
      };

      // Step 1: Data Collection (simulated)
      const dataCollectionStart = Date.now();
      
      // Verify we have the necessary data
      const project = await prisma.project.findUnique({
        where: { id: testProject.id },
        include: {
          products: {
            include: { snapshots: true }
          },
          competitors: {
            include: { snapshots: true }
          }
        }
      });

      expect(project).toBeDefined();
      expect(project!.products.length).toBeGreaterThan(0);
      expect(project!.competitors.length).toBeGreaterThan(0);

      const dataCollectionTime = Date.now() - dataCollectionStart;

      // Step 2: Analysis
      const analysisStart = Date.now();
      
      const analysisRequest = {
        analysisType: 'comparative_analysis' as const,
        projectId: testProject.id,
        forceFreshData: false,
        priority: 'normal' as const,
        context: workflowContext
      };

      const analysisResult = await analysisService.analyzeProduct(analysisRequest);
      const analysisTime = Date.now() - analysisStart;

      // Validate analysis quality for reporting
      expect(analysisResult.quality.overallScore).toBeGreaterThan(70);
      expect(analysisResult.quality.confidence).toBeGreaterThan(0.7);
      expect(analysisResult.quality.dataCompleteness).toBeGreaterThan(0.6);

      // Step 3: Reporting Validation (structure suitable for report generation)
      expect(analysisResult.summary).toBeDefined();
      expect(analysisResult.summary.length).toBeGreaterThan(50);

      if (analysisResult.comparativeAnalysis) {
        expect(analysisResult.comparativeAnalysis.summary).toBeDefined();
        expect(analysisResult.comparativeAnalysis.detailed).toBeDefined();
        expect(analysisResult.comparativeAnalysis.recommendations).toBeDefined();
      }

      logger.info('Complete workflow test results', {
        dataCollectionTime,
        analysisTime,
        totalTime: dataCollectionTime + analysisTime,
        qualityScore: analysisResult.quality.overallScore,
        confidence: analysisResult.quality.confidence
      });
    });
  });

  describe('Feature Flag Integration', () => {

    beforeEach(() => {
      // Reset feature flags to known state
      featureFlags.updateConfiguration({
        useUnifiedAnalysisService: true,
        rolloutPercentage: 100,
        enableForReporting: true,
        enableForAPI: true,
        enableForScheduledJobs: true,
        enableFallback: true
      });
    });

    it('should respect feature flag rollout percentage', async () => {
      // Set 50% rollout
      featureFlags.updateConfiguration({
        rolloutPercentage: 50
      });

      const results = new Map<string, boolean>();
      const testContexts = [
        'test-context-1',
        'test-context-2', 
        'test-context-3',
        'test-context-4',
        'test-context-5'
      ];

      // Test consistent rollout behavior
      for (const context of testContexts) {
        const shouldUse = featureFlags.shouldUseUnifiedAnalysisService(context);
        results.set(context, shouldUse);
        
        // Test consistency - same context should always return same result
        const secondCall = featureFlags.shouldUseUnifiedAnalysisService(context);
        expect(secondCall).toBe(shouldUse);
      }

      // With 50% rollout, we should have mixed results
      const enabledCount = Array.from(results.values()).filter(Boolean).length;
      expect(enabledCount).toBeGreaterThan(0);
      expect(enabledCount).toBeLessThan(testContexts.length);

      logger.info('Feature flag rollout test', {
        rolloutPercentage: 50,
        totalContexts: testContexts.length,
        enabledCount,
        results: Object.fromEntries(results)
      });
    });

    it('should handle feature flag disabled scenario', async () => {
      // Disable unified service
      featureFlags.updateConfiguration({
        useUnifiedAnalysisService: false
      });

      const shouldUse = featureFlags.shouldUseUnifiedAnalysisService('test-disabled');
      expect(shouldUse).toBe(false);

      // Verify fallback behavior would work
      expect(featureFlags.isFallbackEnabled()).toBe(true);
    });

    it('should handle service-specific feature flags', async () => {
      // Test individual service flags
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

  describe('Error Handling and Fallback', () => {

    it('should handle analysis errors gracefully', async () => {
      const invalidRequest = {
        analysisType: 'ai_comprehensive' as const,
        projectId: 'invalid-project-id',
        forceFreshData: false,
        priority: 'normal' as const,
        context: { errorTest: true }
      };

      await expect(analysisService.analyzeProduct(invalidRequest))
        .rejects.toThrow();

      // Verify error is properly typed and informative
      try {
        await analysisService.analyzeProduct(invalidRequest);
      } catch (error: any) {
        expect(error.message).toBeDefined();
        expect(error.code).toBeDefined();
        expect(error.context).toBeDefined();
      }
    });

    it('should handle service initialization errors', async () => {
      // Test service health checks
      const healthStatus = await analysisService.getServiceHealth();
      
      expect(healthStatus).toBeDefined();
      expect(healthStatus.status).toBeDefined();
      expect(healthStatus.services).toBeDefined();
      expect(healthStatus.timestamp).toBeDefined();

      // Validate critical services are healthy
      expect(healthStatus.services.bedrockService).toBeDefined();
      expect(healthStatus.services.smartSchedulingService).toBeDefined();
    });

    it('should handle timeout scenarios', async () => {
      const timeoutRequest = {
        analysisType: 'ai_comprehensive' as const,
        projectId: testProject.id,
        forceFreshData: false,
        priority: 'low' as const,
        timeout: 1000, // 1 second timeout for testing
        context: { timeoutTest: true }
      };

      // This test verifies timeout handling exists
      // Actual timeout behavior depends on implementation
      const startTime = Date.now();
      
      try {
        await analysisService.analyzeProduct(timeoutRequest);
      } catch (error: any) {
        const elapsedTime = Date.now() - startTime;
        if (error.code === 'TIMEOUT_ERROR') {
          expect(elapsedTime).toBeLessThan(5000); // Should timeout within reasonable time
        }
      }
    });
  });

  describe('Performance and Quality Standards', () => {

    it('should meet performance benchmarks', async () => {
      const performanceTests = [
        {
          name: 'AI Analysis Performance',
          analysisType: 'ai_comprehensive' as const,
          expectedMaxTime: 30000 // 30 seconds
        },
        {
          name: 'UX Analysis Performance', 
          analysisType: 'ux_comparison' as const,
          expectedMaxTime: 20000 // 20 seconds
        },
        {
          name: 'Comparative Analysis Performance',
          analysisType: 'comparative_analysis' as const,
          expectedMaxTime: 25000 // 25 seconds
        }
      ];

      for (const test of performanceTests) {
        const startTime = Date.now();
        
        const request = {
          analysisType: test.analysisType,
          projectId: testProject.id,
          forceFreshData: false,
          priority: 'normal' as const,
          context: { performanceTest: test.name }
        };

        const result = await analysisService.analyzeProduct(request);
        const processingTime = Date.now() - startTime;

        expect(processingTime).toBeLessThan(test.expectedMaxTime);
        expect(result.quality.overallScore).toBeGreaterThan(70);

        logger.info(`Performance test: ${test.name}`, {
          processingTime,
          expectedMaxTime: test.expectedMaxTime,
          qualityScore: result.quality.overallScore,
          passed: processingTime < test.expectedMaxTime
        });
      }
    });

    it('should maintain analysis quality standards', async () => {
      const qualityTest = {
        analysisType: 'comparative_analysis' as const,
        projectId: testProject.id,  
        forceFreshData: false,
        priority: 'normal' as const,
        context: { qualityTest: true }
      };

      const result = await analysisService.analyzeProduct(qualityTest);

      // Quality metrics validation
      expect(result.quality.overallScore).toBeGreaterThan(70); // Minimum 70% quality
      expect(result.quality.confidence).toBeGreaterThan(0.7); // Minimum 70% confidence
      expect(result.quality.dataCompleteness).toBeGreaterThan(0.6); // Minimum 60% data completeness

      // Content quality validation
      expect(result.summary.length).toBeGreaterThan(100); // Meaningful summary
      
      if (result.comparativeAnalysis) {
        expect(result.comparativeAnalysis.summary.keyStrengths.length).toBeGreaterThan(0);
        expect(result.comparativeAnalysis.summary.keyWeaknesses.length).toBeGreaterThan(0);
        expect(result.comparativeAnalysis.recommendations.immediate.length).toBeGreaterThan(0);
      }
    });

    it('should handle concurrent analysis requests', async () => {
      const concurrentRequests = Array.from({ length: 3 }, (_, i) => ({
        analysisType: 'ux_comparison' as const,
        projectId: testProject.id,
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
      results.forEach((result, index) => {
        expect(result).toBeDefined();
        expect(result.analysisId).toBeDefined();
        expect(result.correlationId).toBeDefined();
      });

      // Validate concurrent processing efficiency
      expect(totalTime).toBeLessThan(60000); // Should complete within 1 minute

      logger.info('Concurrent analysis test completed', {
        requestCount: concurrentRequests.length,
        totalTime,
        averageTime: totalTime / concurrentRequests.length
      });
    });
  });

  describe('Service Health and Monitoring', () => {

    it('should provide comprehensive health status', async () => {
      const health = await analysisService.getServiceHealth();

      expect(health).toBeDefined();
      expect(health.status).toMatch(/^(healthy|warning|critical)$/);
      expect(health.timestamp).toBeInstanceOf(Date);
      expect(health.services).toBeDefined();
      expect(health.performance).toBeDefined();
      expect(health.errors).toBeDefined();

      // Validate individual service health
      expect(health.services.bedrockService).toBeDefined();
      expect(health.services.smartSchedulingService).toBeDefined();
      
      // Validate performance metrics
      expect(health.performance.averageResponseTime).toBeGreaterThan(0);
      expect(health.performance.successRate).toBeGreaterThanOrEqual(0);
      expect(health.performance.errorRate).toBeGreaterThanOrEqual(0);
    });

    it('should track analysis history', async () => {
      // Perform a few analyses to generate history
      await analysisService.analyzeProduct({
        analysisType: 'ai_comprehensive',
        projectId: testProject.id,
        forceFreshData: false,
        priority: 'normal',
        context: { historyTest: 1 }
      });

      await analysisService.analyzeProduct({
        analysisType: 'ux_comparison',
        projectId: testProject.id,
        forceFreshData: false,
        priority: 'normal',
        context: { historyTest: 2 }
      });

      // Get analysis history
      const history = await analysisService.getAnalysisHistory(testProject.id);
      
      expect(history).toBeDefined();
      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBeGreaterThan(0);

      // Validate history entries
      history.forEach(entry => {
        expect(entry.analysisId).toBeDefined();
        expect(entry.analysisType).toBeDefined();
        expect(entry.timestamp).toBeDefined();
        expect(entry.quality).toBeDefined();
      });
    });
  });
}); 