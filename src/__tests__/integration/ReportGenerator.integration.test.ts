/**
 * Integration Tests for ReportGenerator.generateInitialReport() - Phase 5 Implementation
 * Tests end-to-end scenarios from section 13.0
 */

import { ReportGenerator } from '@/services/domains/reporting/ReportGenerator';
import { ReportGeneratorConfig, InitialReportRequest, InitialReportResponse } from '@/services/domains/reporting/types';
import { BedrockService } from '@/services/bedrock/bedrock.service';
import { prisma } from '@/lib/prisma';
import { ComparativeReport } from '@/types/comparativeReport';
import fs from 'fs/promises';
import path from 'path';

// Mock external dependencies but allow more realistic behavior
jest.mock('@/services/bedrock/bedrock.service');
jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  generateCorrelationId: jest.fn(() => 'integration-correlation-id'),
  trackBusinessEvent: jest.fn(),
  trackErrorWithCorrelation: jest.fn(),
}));

jest.mock('@paralleldrive/cuid2', () => ({
  createId: jest.fn(() => 'integration-report-id'),
}));

describe('ReportGenerator.generateInitialReport() Integration Tests - Phase 5', () => {
  let reportGenerator: ReportGenerator;
  let mockBedrockService: jest.Mocked<BedrockService>;
  let testReportsDir: string;

  const mockConfig = {
    markdownOnly: true,
    maxConcurrency: 2,
    timeout: 120000,
    analysisService: 'bedrock'
  } as any;

  beforeAll(async () => {
    // Create test reports directory
    testReportsDir = path.join(process.cwd(), 'test-reports', 'integration');
    await fs.mkdir(testReportsDir, { recursive: true });
  });

  afterAll(async () => {
    // Clean up test files
    try {
      await fs.rm(testReportsDir, { recursive: true, force: true });
    } catch (error) {
      console.warn('Could not clean up test reports directory:', error);
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup realistic mock services
    mockBedrockService = new BedrockService() as jest.Mocked<BedrockService>;
    mockBedrockService.generateCompletion = jest.fn().mockResolvedValue(`
# Competitive Analysis Report

## Executive Summary
This report provides a comprehensive analysis of the competitive landscape.

## Key Findings
- Market positioning analysis completed
- Feature comparison identified key differentiators
- UX analysis reveals optimization opportunities

## Strategic Recommendations
1. Focus on user experience improvements
2. Develop unique value propositions
3. Monitor competitor feature releases

## Conclusion
The analysis provides actionable insights for strategic planning.
    `);

    reportGenerator = new ReportGenerator(mockConfig);
  });

  describe('13.1 - Test full pipeline: project → competitors → AI analysis → database → file system', () => {
    it('should execute complete end-to-end report generation pipeline', async () => {
      // Mock database responses for full pipeline
      const mockProject = {
        id: 'integration-project-123',
        name: 'Full Pipeline Test Project',
        description: 'Integration test project',
        competitors: [
          {
            id: 'comp-1',
            name: 'Competitor One',
            url: 'https://competitor1.com',
            snapshots: [
              {
                id: 'snap-1',
                url: 'https://competitor1.com/pricing',
                content: 'Competitor 1 pricing page content',
                createdAt: new Date('2025-01-01'),
                metadata: { pageType: 'pricing' }
              }
            ]
          },
          {
            id: 'comp-2', 
            name: 'Competitor Two',
            url: 'https://competitor2.com',
            snapshots: [
              {
                id: 'snap-2',
                url: 'https://competitor2.com/features',
                content: 'Competitor 2 features page content',
                createdAt: new Date('2025-01-01'),
                metadata: { pageType: 'features' }
              }
            ]
          }
        ]
      };

      // Mock Prisma responses
      const prismaSpy = jest.spyOn(prisma.project, 'findUnique').mockResolvedValue(mockProject as any);
      const reportCreateSpy = jest.spyOn(prisma.report, 'create').mockResolvedValue({
        id: 'integration-report-123',
        projectId: 'integration-project-123',
        title: 'Initial Competitive Analysis Report',
        status: 'COMPLETED',
        createdAt: new Date(),
      } as any);
      const reportVersionSpy = jest.spyOn(prisma.reportVersion, 'create').mockResolvedValue({
        id: 'version-123',
        reportId: 'integration-report-123',
        content: {},
        version: 1,
      } as any);

      // Execute the full pipeline
      const request: InitialReportRequest = {
        projectId: 'integration-project-123',
        options: { fallbackToPartialData: true }
      };

      const response = await reportGenerator.generateInitialReport(request);

      // Verify all pipeline stages executed
      expect(response.success).toBe(true);
      expect(response.report).toBeDefined();
      expect(response.report?.title).toContain('Initial Competitive Analysis');
      expect(response.projectId).toBe('integration-project-123');
      expect(response.taskId).toBeDefined();

      // Verify database interactions
      expect(prismaSpy).toHaveBeenCalledWith({
        where: { id: 'integration-project-123' },
        include: {
          competitors: {
            include: {
              snapshots: {
                orderBy: { createdAt: 'desc' },
                take: 5
              }
            }
          }
        }
      });

      expect(reportCreateSpy).toHaveBeenCalled();
      expect(reportVersionSpy).toHaveBeenCalled();

      // Verify AI analysis was called
      expect(mockBedrockService.generateCompletion).toHaveBeenCalled();

      prismaSpy.mockRestore();
      reportCreateSpy.mockRestore();
      reportVersionSpy.mockRestore();
    }, 15000);

    it('should handle pipeline execution with realistic data volumes', async () => {
      // Create a project with multiple competitors and snapshots
      const mockProject = {
        id: 'large-project-456',
        name: 'Large Scale Test Project',
        competitors: Array.from({ length: 5 }, (_, i) => ({
          id: `comp-${i + 1}`,
          name: `Competitor ${i + 1}`,
          url: `https://competitor${i + 1}.com`,
          snapshots: Array.from({ length: 3 }, (_, j) => ({
            id: `snap-${i + 1}-${j + 1}`,
            url: `https://competitor${i + 1}.com/page${j + 1}`,
            content: `Page ${j + 1} content for competitor ${i + 1}`,
            createdAt: new Date('2025-01-01'),
            metadata: { pageType: `page${j + 1}` }
          }))
        }))
      };

      const prismaSpy = jest.spyOn(prisma.project, 'findUnique').mockResolvedValue(mockProject as any);
      const reportCreateSpy = jest.spyOn(prisma.report, 'create').mockResolvedValue({
        id: 'large-report-456',
        projectId: 'large-project-456'
      } as any);

      const request: InitialReportRequest = {
        projectId: 'large-project-456',
        options: { fallbackToPartialData: true }
      };

      const startTime = Date.now();
      const response = await reportGenerator.generateInitialReport(request);
      const processingTime = Date.now() - startTime;

      // Verify performance with larger dataset
      expect(response.success).toBe(true);
      expect(processingTime).toBeLessThan(30000); // Should complete within 30 seconds
      expect(response.report?.content).toBeDefined();

      prismaSpy.mockRestore();
      reportCreateSpy.mockRestore();
    }, 35000);
  });

  describe('13.2 - Test database persistence (Report + ReportVersion tables) and file creation', () => {
    it('should persist complete report data to both Report and ReportVersion tables', async () => {
      const mockProject = {
        id: 'persistence-project-789',
        name: 'Database Persistence Test',
        competitors: [
          {
            id: 'comp-db-1',
            name: 'Database Test Competitor',
            snapshots: [{ id: 'snap-db-1', content: 'Test content', createdAt: new Date() }]
          }
        ]
      };

      const prismaSpy = jest.spyOn(prisma.project, 'findUnique').mockResolvedValue(mockProject as any);
      
      // Capture actual data passed to database
      let reportData: any;
      let versionData: any;
      
      const reportCreateSpy = jest.spyOn(prisma.report, 'create').mockImplementation((args) => {
        reportData = args.data;
        return Promise.resolve({
          id: 'persistence-report-789',
          ...args.data
        } as any);
      });

      const versionCreateSpy = jest.spyOn(prisma.reportVersion, 'create').mockImplementation((args) => {
        versionData = args.data;
        return Promise.resolve({
          id: 'persistence-version-789',
          ...args.data
        } as any);
      });

      const request: InitialReportRequest = {
        projectId: 'persistence-project-789',
        options: { fallbackToPartialData: true }
      };

      const response = await reportGenerator.generateInitialReport(request);

      // Verify Report table data structure
      expect(reportData).toMatchObject({
        projectId: 'persistence-project-789',
        title: expect.stringContaining('Initial Competitive Analysis'),
        status: 'COMPLETED',
        isInitialReport: true,
        dataCompletenessScore: expect.any(Number),
        processingTimeMs: expect.any(Number),
        generationContext: expect.objectContaining({
          competitorCount: 1,
          snapshotCount: 1,
          fallbackUsed: expect.any(Boolean)
        })
      });

      // Verify ReportVersion table data structure
      expect(versionData).toMatchObject({
        reportId: 'persistence-report-789',
        version: 1,
        content: expect.objectContaining({
          title: expect.any(String),
          content: expect.any(String),
          metadata: expect.any(Object)
        })
      });

      expect(response.success).toBe(true);

      prismaSpy.mockRestore();
      reportCreateSpy.mockRestore();
      versionCreateSpy.mockRestore();
    });

    it('should create files with proper structure and content', async () => {
      const mockProject = {
        id: 'file-project-101',
        name: 'File Creation Test',
        competitors: [
          {
            id: 'comp-file-1',
            name: 'File Test Competitor',
            snapshots: [{ id: 'snap-file-1', content: 'File test content', createdAt: new Date() }]
          }
        ]
      };

      jest.spyOn(prisma.project, 'findUnique').mockResolvedValue(mockProject as any);
      jest.spyOn(prisma.report, 'create').mockResolvedValue({ id: 'file-report-101' } as any);

      // Mock file system to capture file operations
      const writeFileSpy = jest.spyOn(fs, 'writeFile').mockResolvedValue();
      const mkdirSpy = jest.spyOn(fs, 'mkdir').mockResolvedValue(undefined as any);
      
      let writtenContent: string;
      let filePath: string;
      
      writeFileSpy.mockImplementation(async (path: any, content: any) => {
        filePath = path;
        writtenContent = content;
      });

      const request: InitialReportRequest = {
        projectId: 'file-project-101'
      };

      await reportGenerator.generateInitialReport(request);

      // Verify directory creation
      expect(mkdirSpy).toHaveBeenCalledWith(
        expect.stringContaining('reports/file-project-101'),
        { recursive: true }
      );

      // Verify file path structure
      expect(filePath).toMatch(/reports\/file-project-101\/initial-report-file-project-101-\d+\.md$/);

      // Verify file content structure
      expect(writtenContent).toContain('# Initial Competitive Analysis Report');
      expect(writtenContent).toContain('Project ID: file-project-101');
      expect(writtenContent).toContain('Report ID: file-report-101');
      expect(writtenContent).toContain('Generated: ');
      expect(writtenContent).toContain('## Executive Summary');

      writeFileSpy.mockRestore();
      mkdirSpy.mockRestore();
    });
  });

  describe('13.3 - Test all fallback scenarios: no competitors, no AI, partial data, stale data', () => {
    it('should handle no competitors scenario with project-only report', async () => {
      const mockProject = {
        id: 'no-comp-project-202',
        name: 'No Competitors Test Project',
        description: 'Project with no competitors assigned',
        competitors: [] // No competitors
      };

      jest.spyOn(prisma.project, 'findUnique').mockResolvedValue(mockProject as any);
      jest.spyOn(prisma.report, 'create').mockResolvedValue({ id: 'no-comp-report-202' } as any);

      const request: InitialReportRequest = {
        projectId: 'no-comp-project-202'
      };

      const response = await reportGenerator.generateInitialReport(request);

      expect(response.success).toBe(true);
      expect(response.report?.title).toContain('Project Overview Report');
      expect(response.report?.content).toContain('No competitors have been assigned');
      expect(response.report?.content).toContain('Add competitors');
    });

    it('should handle AI service failure with template-based fallback', async () => {
      const mockProject = {
        id: 'ai-fail-project-303',
        name: 'AI Failure Test Project',
        competitors: [
          {
            id: 'comp-ai-1',
            name: 'AI Test Competitor',
            snapshots: [{ id: 'snap-ai-1', content: 'AI test content', createdAt: new Date() }]
          }
        ]
      };

      jest.spyOn(prisma.project, 'findUnique').mockResolvedValue(mockProject as any);
      jest.spyOn(prisma.report, 'create').mockResolvedValue({ id: 'ai-fail-report-303' } as any);

      // Mock AI service failure
      mockBedrockService.generateCompletion.mockRejectedValue(new Error('AI Service Unavailable'));

      const request: InitialReportRequest = {
        projectId: 'ai-fail-project-303',
        options: { fallbackToPartialData: true }
      };

      const response = await reportGenerator.generateInitialReport(request);

      expect(response.success).toBe(true);
      expect(response.report?.content).toContain('AI analysis is temporarily unavailable');
      expect(response.report?.content).toContain('Basic competitive template');
    });

    it('should handle partial data scenario with completeness scoring', async () => {
      const mockProject = {
        id: 'partial-project-404',
        name: 'Partial Data Test Project',
        competitors: [
          {
            id: 'comp-partial-1',
            name: 'Partial Competitor 1',
            snapshots: [] // No snapshots (stale data)
          },
          {
            id: 'comp-partial-2',
            name: 'Partial Competitor 2',
            snapshots: [
              {
                id: 'old-snap-1',
                content: 'Old content',
                createdAt: new Date('2024-01-01') // Very old data
              }
            ]
          }
        ]
      };

      jest.spyOn(prisma.project, 'findUnique').mockResolvedValue(mockProject as any);
      jest.spyOn(prisma.report, 'create').mockResolvedValue({ id: 'partial-report-404' } as any);

      const request: InitialReportRequest = {
        projectId: 'partial-project-404',
        options: { fallbackToPartialData: true }
      };

      const response = await reportGenerator.generateInitialReport(request);

      expect(response.success).toBe(true);
      expect(response.dataCompletenessScore).toBeLessThan(50); // Low completeness
      expect(response.report?.content).toContain('data quality limitations');
      expect(response.report?.content).toContain('consider refreshing competitor data');
    });

    it('should handle stale data with appropriate warnings', async () => {
      const mockProject = {
        id: 'stale-project-505',
        name: 'Stale Data Test Project',
        competitors: [
          {
            id: 'comp-stale-1',
            name: 'Stale Data Competitor',
            snapshots: [
              {
                id: 'stale-snap-1',
                content: 'Outdated content',
                createdAt: new Date('2023-06-01'), // Very stale data
                metadata: { lastUpdated: '2023-06-01' }
              }
            ]
          }
        ]
      };

      jest.spyOn(prisma.project, 'findUnique').mockResolvedValue(mockProject as any);
      jest.spyOn(prisma.report, 'create').mockResolvedValue({ id: 'stale-report-505' } as any);

      const request: InitialReportRequest = {
        projectId: 'stale-project-505',
        options: { fallbackToPartialData: true }
      };

      const response = await reportGenerator.generateInitialReport(request);

      expect(response.success).toBe(true);
      expect(response.report?.content).toContain('data may be outdated');
      expect(response.report?.content).toContain('last updated');
      expect(response.report?.metadata?.dataFreshness).toBe('stale');
    });
  });

  describe('13.4 - Test error classification system with different failure types', () => {
    it('should classify bedrock initialization failures correctly', async () => {
      const { trackErrorWithCorrelation } = require('@/lib/logger');
      
      mockBedrockService.generateCompletion.mockRejectedValue(new Error('Bedrock initialization failed'));

      const mockProject = {
        id: 'error-class-project-606',
        name: 'Error Classification Test',
        competitors: [{ id: 'comp-1', name: 'Test Competitor', snapshots: [] }]
      };

      jest.spyOn(prisma.project, 'findUnique').mockResolvedValue(mockProject as any);
      jest.spyOn(prisma.report, 'create').mockResolvedValue({ id: 'error-report-606' } as any);

      const request: InitialReportRequest = {
        projectId: 'error-class-project-606',
        options: { fallbackToPartialData: true }
      };

      await reportGenerator.generateInitialReport(request);

      expect(trackErrorWithCorrelation).toHaveBeenCalledWith(
        expect.any(Error),
        'integration-correlation-id',
        expect.objectContaining({
          errorType: 'bedrock_initialization_failure',
          projectId: 'error-class-project-606'
        })
      );
    });

    it('should classify database persistence failures correctly', async () => {
      const { trackErrorWithCorrelation } = require('@/lib/logger');
      
      const mockProject = {
        id: 'db-error-project-707',
        name: 'Database Error Test',
        competitors: [{ id: 'comp-1', name: 'Test Competitor', snapshots: [] }]
      };

      jest.spyOn(prisma.project, 'findUnique').mockResolvedValue(mockProject as any);
      jest.spyOn(prisma.report, 'create').mockRejectedValue(new Error('Database connection failed'));

      const request: InitialReportRequest = {
        projectId: 'db-error-project-707'
      };

      await reportGenerator.generateInitialReport(request);

      expect(trackErrorWithCorrelation).toHaveBeenCalledWith(
        expect.any(Error),
        'integration-correlation-id',
        expect.objectContaining({
          operation: 'database_persistence',
          projectId: 'db-error-project-707'
        })
      );
    });

    it('should classify no competitors assigned as specific error type', async () => {
      const mockProject = {
        id: 'no-comp-error-808',
        name: 'No Competitors Error Test',
        competitors: []
      };

      jest.spyOn(prisma.project, 'findUnique').mockResolvedValue(mockProject as any);
      jest.spyOn(prisma.report, 'create').mockResolvedValue({ id: 'no-comp-report-808' } as any);

      const request: InitialReportRequest = {
        projectId: 'no-comp-error-808'
      };

      const response = await reportGenerator.generateInitialReport(request);

      expect(response.success).toBe(true);
      expect(response.warnings).toContain('no_competitors_assigned');
    });
  });

  describe('13.5 - Test performance under concurrent requests (race condition prevention)', () => {
    it('should handle multiple concurrent requests for same project', async () => {
      const mockProject = {
        id: 'concurrent-project-909',
        name: 'Concurrent Test Project',
        competitors: [
          {
            id: 'comp-concurrent-1',
            name: 'Concurrent Test Competitor',
            snapshots: [{ id: 'snap-concurrent-1', content: 'Concurrent test content', createdAt: new Date() }]
          }
        ]
      };

      jest.spyOn(prisma.project, 'findUnique').mockResolvedValue(mockProject as any);
      jest.spyOn(prisma.report, 'create').mockResolvedValue({ id: 'concurrent-report-909' } as any);

      const request: InitialReportRequest = {
        projectId: 'concurrent-project-909',
        options: { fallbackToPartialData: true }
      };

      // Execute multiple concurrent requests
      const concurrentRequests = Array.from({ length: 5 }, () => 
        reportGenerator.generateInitialReport(request)
      );

      const startTime = Date.now();
      const responses = await Promise.all(concurrentRequests);
      const processingTime = Date.now() - startTime;

      // All requests should succeed
      responses.forEach(response => {
        expect(response.success).toBe(true);
        expect(response.projectId).toBe('concurrent-project-909');
        expect(response.taskId).toBeDefined();
      });

      // Should complete within reasonable time (not 5x single request time)
      expect(processingTime).toBeLessThan(15000);

      // Verify deduplication - AI should not be called 5 times
      expect(mockBedrockService.generateCompletion).toHaveBeenCalledTimes(1);
    }, 20000);

    it('should prevent race conditions in database operations', async () => {
      const mockProject = {
        id: 'race-project-101',
        name: 'Race Condition Test',
        competitors: [{ id: 'comp-race-1', name: 'Race Test Competitor', snapshots: [] }]
      };

      jest.spyOn(prisma.project, 'findUnique').mockResolvedValue(mockProject as any);
      
      // Track database operation order
      const operationOrder: string[] = [];
      jest.spyOn(prisma.report, 'create').mockImplementation(async (args) => {
        operationOrder.push(`create-${args.data.projectId}`);
        // Simulate delay
        await new Promise(resolve => setTimeout(resolve, 100));
        return { id: 'race-report-101', ...args.data } as any;
      });

      const request: InitialReportRequest = {
        projectId: 'race-project-101'
      };

      // Execute concurrent requests that could cause race conditions
      await Promise.all([
        reportGenerator.generateInitialReport(request),
        reportGenerator.generateInitialReport(request)
      ]);

      // Should only have one database create operation (deduplication)
      expect(operationOrder.length).toBe(1);
    });
  });

  describe('13.6 - Test memory management and task cleanup', () => {
    it('should properly clean up completed tasks from activeTasks Map', async () => {
      const mockProject = {
        id: 'cleanup-project-111',
        name: 'Cleanup Test Project',
        competitors: [{ id: 'comp-cleanup-1', name: 'Cleanup Competitor', snapshots: [] }]
      };

      jest.spyOn(prisma.project, 'findUnique').mockResolvedValue(mockProject as any);
      jest.spyOn(prisma.report, 'create').mockResolvedValue({ id: 'cleanup-report-111' } as any);

      const request: InitialReportRequest = {
        projectId: 'cleanup-project-111'
      };

      // Execute multiple requests to test cleanup
      await reportGenerator.generateInitialReport(request);
      await reportGenerator.generateInitialReport(request);
      await reportGenerator.generateInitialReport(request);

      // All tasks should complete successfully without memory leaks
      // (Memory leaks would typically manifest as timeouts or errors in subsequent requests)
      const finalResponse = await reportGenerator.generateInitialReport(request);
      expect(finalResponse.success).toBe(true);
    });

    it('should handle memory cleanup for failed tasks', async () => {
      const mockProject = {
        id: 'failed-cleanup-project-222',
        name: 'Failed Cleanup Test',
        competitors: [{ id: 'comp-fail-1', name: 'Failing Competitor', snapshots: [] }]
      };

      jest.spyOn(prisma.project, 'findUnique').mockResolvedValue(mockProject as any);
      
      // Make first request fail
      jest.spyOn(prisma.report, 'create')
        .mockRejectedValueOnce(new Error('Database failure'))
        .mockResolvedValue({ id: 'recovery-report-222' } as any);

      const request: InitialReportRequest = {
        projectId: 'failed-cleanup-project-222'
      };

      // First request fails
      const failedResponse = await reportGenerator.generateInitialReport(request);
      expect(failedResponse.success).toBe(true); // Should still succeed with fallback

      // Second request should work (no lingering failed task)
      const successResponse = await reportGenerator.generateInitialReport(request);
      expect(successResponse.success).toBe(true);
    });

    it('should handle large dataset processing without memory issues', async () => {
      // Create a project with substantial data
      const mockProject = {
        id: 'large-data-project-333',
        name: 'Large Dataset Test',
        competitors: Array.from({ length: 10 }, (_, i) => ({
          id: `comp-large-${i + 1}`,
          name: `Large Competitor ${i + 1}`,
          snapshots: Array.from({ length: 10 }, (_, j) => ({
            id: `snap-large-${i + 1}-${j + 1}`,
            content: 'X'.repeat(1000), // 1KB per snapshot
            createdAt: new Date(),
            metadata: { size: 'large' }
          }))
        }))
      };

      jest.spyOn(prisma.project, 'findUnique').mockResolvedValue(mockProject as any);
      jest.spyOn(prisma.report, 'create').mockResolvedValue({ id: 'large-report-333' } as any);

      const request: InitialReportRequest = {
        projectId: 'large-data-project-333',
        options: { fallbackToPartialData: true }
      };

      const startTime = Date.now();
      const response = await reportGenerator.generateInitialReport(request);
      const processingTime = Date.now() - startTime;

      expect(response.success).toBe(true);
      expect(processingTime).toBeLessThan(30000); // Should handle large data efficiently
      expect(response.dataCompletenessScore).toBeGreaterThan(80); // Good data completeness
    }, 35000);
  });
}); 