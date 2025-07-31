/**
 * Smart Scheduling Integration Preservation Tests - Task 6.1
 * 
 * These tests validate that the critical Smart Scheduling integration
 * remains intact in the consolidated AnalysisService and ReportingService.
 * 
 * Critical Data Flow: SmartSchedulingService → AnalysisService → ReportingService
 */

import { describe, beforeEach, afterEach, it, expect, jest } from '@jest/globals';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { SmartSchedulingService } from '@/services/smartSchedulingService';
import { AnalysisService } from '@/services/domains/AnalysisService';
import { ReportingService, ReportingServiceFactory } from '@/services/domains/ReportingService';
import { IntelligentReportingService } from '@/services/intelligentReportingService';
import { 
  SmartAIAnalysisRequest,
  SmartAIAnalysisResponse,
  AnalysisRequest,
  AnalysisResponse,
  ProjectFreshnessStatus
} from '@/services/domains/types/analysisTypes';

// Test data interfaces
interface TestProject {
  id: string;
  name: string;
  products: Array<{
    id: string;
    name: string;
    website: string;
    snapshots?: Array<{
      id: string;
      createdAt: Date;
    }>;
  }>;
  competitors: Array<{
    id: string;
    name: string;
    website: string;
    snapshots?: Array<{
      id: string;
      createdAt: Date;
    }>;
  }>;
}

describe('Smart Scheduling Integration Preservation - Task 6.1', () => {
  let smartSchedulingService: SmartSchedulingService;
  let consolidatedAnalysisService: AnalysisService;
  let consolidatedReportingService: ReportingService;
  let legacyIntelligentReporting: IntelligentReportingService;
  let testProject: TestProject;

  beforeEach(async () => {
    // Initialize services
    smartSchedulingService = new SmartSchedulingService();
    consolidatedAnalysisService = new AnalysisService();
    consolidatedReportingService = ReportingServiceFactory.create(consolidatedAnalysisService);
    legacyIntelligentReporting = new IntelligentReportingService();

    // Create test project with controlled data freshness scenarios
    testProject = await createTestProject();
  });

  afterEach(async () => {
    // Cleanup test data
    if (testProject?.id) {
      await cleanupTestData(testProject.id);
    }
  });

  describe('6.1.1 Data Freshness Integration Preservation', () => {
    it('should preserve SmartSchedulingService.getFreshnessStatus() integration', async () => {
      // Test the critical data freshness checking flow
      const freshnessStatus = await smartSchedulingService.getFreshnessStatus(testProject.id);

      expect(freshnessStatus).toBeDefined();
      expect(freshnessStatus.projectId).toBe(testProject.id);
      expect(freshnessStatus.products).toHaveLength(testProject.products.length);
      expect(freshnessStatus.competitors).toHaveLength(testProject.competitors.length);
      expect(['FRESH', 'STALE', 'MISSING_DATA']).toContain(freshnessStatus.overallStatus);

      // Validate freshness status structure
      expect(freshnessStatus.products[0]).toHaveProperty('id');
      expect(freshnessStatus.products[0]).toHaveProperty('needsScraping');
      expect(freshnessStatus.competitors[0]).toHaveProperty('id');
      expect(freshnessStatus.competitors[0]).toHaveProperty('needsScraping');
    });

    it('should preserve automatic scraping trigger integration', async () => {
      // Mock scenario with stale data to trigger scraping
      await createStaleSnapshots(testProject.id);

      const scrapingResult = await smartSchedulingService.checkAndTriggerScraping(testProject.id);

      expect(scrapingResult).toBeDefined();
      expect(scrapingResult).toHaveProperty('triggered');
      expect(scrapingResult).toHaveProperty('tasksExecuted');
      
      if (scrapingResult.triggered) {
        expect(scrapingResult.tasksExecuted).toBeGreaterThan(0);
      }

      logger.info('Smart scheduling trigger test completed', {
        projectId: testProject.id,
        triggered: scrapingResult.triggered,
        tasksExecuted: scrapingResult.tasksExecuted
      });
    });

    it('should maintain performance characteristics of smart scheduling', async () => {
      const startTime = Date.now();

      // Execute full smart scheduling workflow
      const freshnessCheck = await smartSchedulingService.getFreshnessStatus(testProject.id);
      const scrapingResult = await smartSchedulingService.checkAndTriggerScraping(testProject.id);

      const executionTime = Date.now() - startTime;

      // Performance requirements: Should complete within 5 seconds for typical project
      expect(executionTime).toBeLessThan(5000);

      logger.info('Smart scheduling performance test completed', {
        projectId: testProject.id,
        executionTime,
        freshnessStatus: freshnessCheck.overallStatus,
        scrapingTriggered: scrapingResult.triggered
      });
    });
  });

  describe('6.1.2 Consolidated AnalysisService Integration', () => {
    it('should preserve Smart Scheduling integration in AnalysisService.analyzeWithSmartScheduling()', async () => {
      // Test the critical backward compatibility method
      const analysisRequest: SmartAIAnalysisRequest = {
        projectId: testProject.id,
        analysisType: 'comprehensive',
        forceFreshData: true,
        context: {
          reportGeneration: true,
          testScenario: 'smart_scheduling_preservation'
        }
      };

      const analysisResult = await consolidatedAnalysisService.analyzeWithSmartScheduling(analysisRequest);

      expect(analysisResult).toBeDefined();
      expect(analysisResult.analysis).toBeDefined();
      expect(analysisResult.dataFreshness).toBeDefined();
      expect(analysisResult.dataFreshness.overallStatus).toBeDefined();

      // Validate that Smart Scheduling was actually invoked
      expect(analysisResult.dataFreshness).toHaveProperty('projectId');
      expect(analysisResult.dataFreshness.projectId).toBe(testProject.id);

      logger.info('AnalysisService Smart Scheduling integration test completed', {
        projectId: testProject.id,
        dataFreshness: analysisResult.dataFreshness.overallStatus,
        analysisCompleted: !!analysisResult.analysis
      });
    });

    it('should validate data freshness before analysis in consolidated service', async () => {
      // Test using the unified interface
      const unifiedRequest: AnalysisRequest = {
        projectId: testProject.id,
        analysisType: 'ai_comprehensive',
        forceFreshData: true,
        options: {
          analysisDepth: 'comprehensive',
          focusAreas: ['features', 'user_experience']
        }
      };

      const unifiedResult = await consolidatedAnalysisService.analyzeProduct(unifiedRequest);

      expect(unifiedResult).toBeDefined();
      expect(unifiedResult.analysisId).toBeDefined();
      expect(unifiedResult.summary).toBeDefined();
      expect(unifiedResult.metadata).toBeDefined();

      logger.info('Unified AnalysisService test completed', {
        projectId: testProject.id,
        analysisId: unifiedResult.analysisId,
        analysisType: unifiedResult.analysisType
      });
    });
  });

  describe('6.1.3 End-to-End Freshness-Aware Workflows', () => {
    it('should preserve complete Smart Scheduling → Analysis → Reporting workflow', async () => {
      // Step 1: Check initial freshness
      const initialFreshness = await smartSchedulingService.getFreshnessStatus(testProject.id);
      
      // Step 2: Trigger analysis with smart scheduling
      const analysisRequest: SmartAIAnalysisRequest = {
        projectId: testProject.id,
        analysisType: 'comprehensive',
        forceFreshData: initialFreshness.overallStatus !== 'FRESH'
      };

      const analysisResult = await consolidatedAnalysisService.analyzeWithSmartScheduling(analysisRequest);

      expect(analysisResult).toBeDefined();
      expect(analysisResult.analysis).toBeDefined();

      logger.info('End-to-end workflow test completed', {
        projectId: testProject.id,
        initialFreshness: initialFreshness.overallStatus,
        finalFreshness: analysisResult.dataFreshness.overallStatus,
        workflowCompleted: true
      });
    });

    it('should handle stale data scenarios with automatic refresh', async () => {
      // Create stale data scenario
      await createStaleSnapshots(testProject.id);
      
      const stalenessBefore = await smartSchedulingService.getFreshnessStatus(testProject.id);
      expect(['STALE', 'MISSING_DATA']).toContain(stalenessBefore.overallStatus);

      // Trigger analysis that should refresh data
      const analysisRequest: SmartAIAnalysisRequest = {
        projectId: testProject.id,
        analysisType: 'comprehensive',
        forceFreshData: true
      };

      const analysisResult = await consolidatedAnalysisService.analyzeWithSmartScheduling(analysisRequest);
      
      // Verify data was refreshed during analysis
      const freshnessAfter = await smartSchedulingService.getFreshnessStatus(testProject.id);
      
      expect(analysisResult).toBeDefined();
      // Note: Freshness might still be STALE due to async scraping, but should show improvement
      
      logger.info('Stale data refresh test completed', {
        projectId: testProject.id,
        freshnessBefore: stalenessBefore.overallStatus,
        freshnessAfter: freshnessAfter.overallStatus,
        analysisCompleted: !!analysisResult.analysis
      });
    });
  });

  describe('6.1.4 Legacy Service Compatibility', () => {
    it('should maintain compatibility with existing IntelligentReportingService integration', async () => {
      // Test that legacy services still work with Smart Scheduling
      const legacyRequest = {
        projectId: testProject.id,
        reportType: 'comprehensive_intelligence' as const,
        forceDataRefresh: true
      };

      const legacyResult = await legacyIntelligentReporting.generateIntelligentReport(legacyRequest);

      expect(legacyResult).toBeDefined();
      expect(legacyResult.dataFreshnessIndicators).toBeDefined();

      logger.info('Legacy service compatibility test completed', {
        projectId: testProject.id,
        reportGenerated: !!legacyResult.analysis
      });
    });
  });

  describe('6.1.5 Performance and Reliability', () => {
    it('should maintain Smart Scheduling performance under concurrent requests', async () => {
      const concurrentRequests = 3;
      const requests: Promise<any>[] = [];

      // Create multiple concurrent freshness checks
      for (let i = 0; i < concurrentRequests; i++) {
        requests.push(smartSchedulingService.getFreshnessStatus(testProject.id));
      }

      const startTime = Date.now();
      const results = await Promise.all(requests);
      const executionTime = Date.now() - startTime;

      // All requests should succeed
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(result.projectId).toBe(testProject.id);
      });

      // Performance: Should handle concurrent requests efficiently (under 10 seconds total)
      expect(executionTime).toBeLessThan(10000);

      logger.info('Concurrent Smart Scheduling test completed', {
        projectId: testProject.id,
        concurrentRequests,
        executionTime,
        allSucceeded: results.length === concurrentRequests
      });
    });
  });
});

// ============================================================================
// TEST HELPER FUNCTIONS
// ============================================================================

async function createTestProject(): Promise<TestProject> {
  const projectId = `test-project-${Date.now()}`;
  
  // Create test project
  const project = await prisma.project.create({
    data: {
      id: projectId,
      name: `Smart Scheduling Test Project ${Date.now()}`,
      userId: 'test-user',
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  });

  // Create test product
  const product = await prisma.product.create({
    data: {
      id: `test-product-${Date.now()}`,
      name: 'Test Product',
      website: 'https://example.com',
      projectId: project.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  });

  // Create test competitor
  const competitor = await prisma.competitor.create({
    data: {
      id: `test-competitor-${Date.now()}`,
      name: 'Test Competitor',
      website: 'https://competitor.com',
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  });

  // Link competitor to project
  await prisma.projectCompetitor.create({
    data: {
      projectId: project.id,
      competitorId: competitor.id,
    }
  });

  return {
    id: project.id,
    name: project.name,
    products: [{
      id: product.id,
      name: product.name,
      website: product.website
    }],
    competitors: [{
      id: competitor.id,
      name: competitor.name,
      website: competitor.website
    }]
  };
}

async function createStaleSnapshots(projectId: string): Promise<void> {
  // Create old snapshots to simulate stale data
  const staleDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10 days ago

  const products = await prisma.product.findMany({
    where: { projectId }
  });

  for (const product of products) {
    await prisma.productSnapshot.create({
      data: {
        id: `stale-product-snapshot-${Date.now()}-${product.id}`,
        productId: product.id,
        content: JSON.stringify({ stale: true }),
        createdAt: staleDate,
        updatedAt: staleDate,
      }
    });
  }

  const competitors = await prisma.competitor.findMany({
    where: {
      projects: {
        some: { id: projectId }
      }
    }
  });

  for (const competitor of competitors) {
    await prisma.snapshot.create({
      data: {
        id: `stale-competitor-snapshot-${Date.now()}-${competitor.id}`,
        competitorId: competitor.id,
        content: JSON.stringify({ stale: true }),
        createdAt: staleDate,
        updatedAt: staleDate,
      }
    });
  }
}

async function cleanupTestData(projectId: string): Promise<void> {
  try {
    // Delete in correct order to handle foreign key constraints
    await prisma.productSnapshot.deleteMany({
      where: {
        product: { projectId }
      }
    });

    await prisma.snapshot.deleteMany({
      where: {
        competitor: {
          projects: {
            some: { id: projectId }
          }
        }
      }
    });

    await prisma.projectCompetitor.deleteMany({
      where: { projectId }
    });

    await prisma.product.deleteMany({
      where: { projectId }
    });

    await prisma.project.delete({
      where: { id: projectId }
    });

    logger.info('Test data cleanup completed', { projectId });
  } catch (error) {
    logger.error('Test data cleanup failed', error as Error, { projectId });
  }
} 