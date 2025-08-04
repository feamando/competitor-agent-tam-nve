/**
 * Unit Tests for ReportGenerator.generateInitialReport() - Phase 5 Implementation
 * Tests the comprehensive implementation from Phases 1-4
 */

import { ReportGenerator } from '@/services/domains/reporting/ReportGenerator';
import { ReportGeneratorConfig, InitialReportRequest, InitialReportResponse } from '@/services/domains/reporting/types';
import { BedrockService } from '@/services/bedrock/bedrock.service';
import { prisma } from '@/lib/prisma';
import { ComparativeReport } from '@/types/comparativeReport';

// Mock external dependencies
jest.mock('@/lib/prisma', () => ({
  prisma: {
    project: {
      findUnique: jest.fn(),
    },
    report: {
      create: jest.fn(),
    },
    reportVersion: {
      create: jest.fn(),
    },
  },
}));

jest.mock('@/services/bedrock/bedrock.service');
jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  generateCorrelationId: jest.fn(() => 'test-correlation-id'),
  trackBusinessEvent: jest.fn(),
  trackErrorWithCorrelation: jest.fn(),
}));

jest.mock('fs/promises');
jest.mock('path');

// Mock the createId function
jest.mock('@paralleldrive/cuid2', () => ({
  createId: jest.fn(() => 'test-report-id'),
}));

describe('ReportGenerator.generateInitialReport() - Phase 5 Unit Tests', () => {
  let reportGenerator: ReportGenerator;
  let mockPrisma: any;
  let mockBedrockService: jest.Mocked<BedrockService>;

  const mockConfig: ReportGeneratorConfig = {
    markdownOnly: true,
    maxConcurrency: 2,
    timeout: 120000,
  };

  const mockRequest: InitialReportRequest = {
    projectId: 'test-project-id',
    taskId: 'test-task-id',
    options: {
      fallbackToPartialData: false,
    },
  };

  const mockProject = {
    id: 'test-project-id',
    product: {
      id: 'product-1',
      name: 'Test Product',
      website: 'https://testproduct.com',
    },
    competitors: [
      {
        id: 'competitor-1',
        name: 'Competitor A',
        website: 'https://competitora.com',
        snapshots: [
          {
            id: 'snapshot-1',
            createdAt: new Date(),
            competitorName: 'Competitor A',
            content: 'Sample competitor data for analysis',
            url: 'https://competitora.com',
          },
        ],
      },
      {
        id: 'competitor-2',
        name: 'Competitor B',
        website: 'https://competitorb.com',
        snapshots: [
          {
            id: 'snapshot-2',
            createdAt: new Date(),
            competitorName: 'Competitor B',
            content: 'Sample competitor data for analysis',
            url: 'https://competitorb.com',
          },
        ],
      },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup Prisma mocks
    mockPrisma = prisma as any;
    
    // Setup BedrockService mock
    mockBedrockService = {
      generateCompletion: jest.fn(),
    } as any;
    
    (BedrockService as jest.MockedClass<typeof BedrockService>).mockImplementation(() => mockBedrockService);

    // Initialize ReportGenerator
    reportGenerator = new ReportGenerator(mockConfig);
  });

  describe('12.1 - Test successful report generation with AI analysis (happy path)', () => {
    beforeEach(() => {
      // Setup successful scenario mocks
      mockPrisma.project.findUnique.mockResolvedValue(mockProject);
      mockBedrockService.generateCompletion.mockResolvedValue(
        `# Competitive Analysis - Test Product\n\n## Executive Summary\nComprehensive analysis of Test Product vs competitors.\n\n## Key Findings\n- Strong market position\n- Competitive advantages identified`
      );
      mockPrisma.report.create.mockResolvedValue({ id: 'db-report-id' });
      mockPrisma.reportVersion.create.mockResolvedValue({ id: 'version-id' });
      
      // Mock file system operations
      const fs = require('fs/promises');
      const path = require('path');
      fs.mkdir = jest.fn().mockResolvedValue(undefined);
      fs.writeFile = jest.fn().mockResolvedValue(undefined);
      fs.stat = jest.fn().mockResolvedValue({ size: 1500 });
      fs.readFile = jest.fn().mockResolvedValue('test content');
      path.join = jest.fn().mockReturnValue('/test/path/report.md');
    });

    it('should successfully generate initial report with AI analysis', async () => {
      const result = await reportGenerator.generateInitialReport(mockRequest);

      // Verify success response
      expect(result.success).toBe(true);
      expect(result.status).toBe('completed');
      expect(result.projectId).toBe('test-project-id');
      expect(result.taskId).toBe('test-task-id');
      
      // Verify report object exists and has correct structure
      expect(result.report).toBeDefined();
      expect(result.report?.id).toBe('test-report-id');
      expect(result.report?.title).toContain('Test Product');
      expect(result.report?.content).toContain('Competitive Analysis');
      expect(result.report?.format).toBe('markdown');
      
      // Verify metadata
      expect(result.report?.metadata.projectId).toBe('test-project-id');
      expect(result.report?.metadata.competitorCount).toBe(2);
      expect(result.report?.metadata.analysisMethod).toBe('ai_powered');
      expect(result.report?.metadata.correlationId).toBe('test-correlation-id');
      
      // Verify processing metrics
      expect(result.processingTime).toBeGreaterThan(0);
      expect(result.generatedAt).toBeInstanceOf(Date);
    });

    it('should fetch project data with proper relationships', async () => {
      await reportGenerator.generateInitialReport(mockRequest);

      expect(mockPrisma.project.findUnique).toHaveBeenCalledWith({
        where: { id: 'test-project-id' },
        include: {
          product: true,
          competitors: {
            include: {
              snapshots: {
                orderBy: { createdAt: 'desc' },
                take: 1,
              },
            },
          },
        },
      });
    });

    it('should call BedrockService for AI analysis', async () => {
      await reportGenerator.generateInitialReport(mockRequest);

      expect(mockBedrockService.generateCompletion).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: expect.arrayContaining([
              expect.objectContaining({
                type: 'text',
                text: expect.stringContaining('Test Product'),
              }),
            ]),
          }),
        ])
      );
    });

    it('should persist report to database', async () => {
      await reportGenerator.generateInitialReport(mockRequest);

      expect(mockPrisma.report.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          id: 'test-report-id',
          name: expect.stringContaining('Test Product'),
          projectId: 'test-project-id',
          status: 'COMPLETED',
          reportType: 'INITIAL_COMPARATIVE',
          isInitialReport: true,
          dataCompletenessScore: 100,
          dataFreshness: 'CURRENT',
          competitorSnapshotsCaptured: 2,
        }),
      });

      expect(mockPrisma.reportVersion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          reportId: 'test-report-id',
          version: 1,
          content: expect.objectContaining({
            title: expect.stringContaining('Test Product'),
            content: expect.stringContaining('Competitive Analysis'),
          }),
        }),
      });
    });

    it('should save report to file system', async () => {
      const fs = require('fs/promises');
      await reportGenerator.generateInitialReport(mockRequest);

      expect(fs.mkdir).toHaveBeenCalled();
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('.md'),
        expect.stringContaining('Test Product'),
        'utf8'
      );
      expect(fs.stat).toHaveBeenCalled();
      expect(fs.readFile).toHaveBeenCalled();
    });
  });

  describe('12.2 - Test BedrockService initialization failure with fallback report generation', () => {
    beforeEach(() => {
      mockPrisma.project.findUnique.mockResolvedValue(mockProject);
    });

    it('should generate fallback report when BedrockService initialization fails', async () => {
      // Make BedrockService constructor throw an error
      (BedrockService as jest.MockedClass<typeof BedrockService>).mockImplementation(() => {
        throw new Error('AWS credentials not configured');
      });

      const requestWithFallback = {
        ...mockRequest,
        options: { fallbackToPartialData: true },
      };

      const result = await reportGenerator.generateInitialReport(requestWithFallback);

      expect(result.success).toBe(true);
      expect(result.status).toBe('completed');
      expect(result.message).toContain('Fallback report generated without AI analysis');
      expect(result.report?.metadata.analysisMethod).toBe('rule_based');
    });

    it('should return error when BedrockService fails and fallback disabled', async () => {
      (BedrockService as jest.MockedClass<typeof BedrockService>).mockImplementation(() => {
        throw new Error('AWS credentials not configured');
      });

      const result = await reportGenerator.generateInitialReport(mockRequest);

      expect(result.success).toBe(false);
      expect(result.status).toBe('failed');
      expect(result.error).toContain('AI analysis service unavailable');
    });
  });

  describe('12.4 - Test concurrent request deduplication using activeTasks Map', () => {
    beforeEach(() => {
      mockPrisma.project.findUnique.mockResolvedValue(mockProject);
      mockBedrockService.generateCompletion.mockResolvedValue('Analysis content');
      mockPrisma.report.create.mockResolvedValue({ id: 'concurrent-report-id' });
      mockPrisma.reportVersion.create.mockResolvedValue({ id: 'concurrent-version-id' });
    });

    it('should handle concurrent requests for same project', async () => {
      // Start two concurrent requests for the same project
      const promise1 = reportGenerator.generateInitialReport(mockRequest);
      const promise2 = reportGenerator.generateInitialReport(mockRequest);

      const [result1, result2] = await Promise.all([promise1, promise2]);

      // Both should succeed and return the same report
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      
      // Database should only be called once due to deduplication
      expect(mockPrisma.project.findUnique).toHaveBeenCalledTimes(1);
    });
  });

  describe('12.5 - Test input validation and correlation ID tracking', () => {
    it('should reject requests without project ID', async () => {
      const invalidRequest = { ...mockRequest, projectId: '' };
      
      const result = await reportGenerator.generateInitialReport(invalidRequest);
      
      expect(result.success).toBe(false);
      expect(result.status).toBe('failed');
      expect(result.error).toContain('Project ID is required');
    });

    it('should handle missing project gracefully', async () => {
      mockPrisma.project.findUnique.mockResolvedValue(null);
      
      const result = await reportGenerator.generateInitialReport(mockRequest);
      
      expect(result.success).toBe(false);
      expect(result.status).toBe('failed');
      expect(result.error).toContain('not found');
    });

    it('should track correlation ID throughout process', async () => {
      mockPrisma.project.findUnique.mockResolvedValue(mockProject);
      
      const result = await reportGenerator.generateInitialReport(mockRequest);
      
      // Correlation ID should be present in response metadata
      expect(result.report?.metadata).toEqual(expect.objectContaining({
        correlationId: 'test-correlation-id',
      }));
    });
  });

  describe('12.3 - Test timeout handling (90-second limit) with Promise.race pattern', () => {
    it('should enforce 90-second timeout on analysis generation', async () => {
      const slowProject = {
        id: 'timeout-test-project',
        name: 'Timeout Test Project',
        competitors: [
          {
            id: 'comp-timeout-1',
            name: 'Timeout Competitor',
            snapshots: [{ id: 'snap-1', content: 'Test content', createdAt: new Date() }]
          }
        ]
      };

      mockPrisma.project.findUnique.mockResolvedValue(slowProject);
      mockPrisma.report.create.mockResolvedValue({
        id: 'timeout-report-123',
        projectId: 'timeout-test-project'
      });

      // Mock AI service to take longer than timeout (95 seconds)
      mockBedrockService.generateCompletion.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve('Delayed response'), 95000))
      );

      const request = {
        projectId: 'timeout-test-project',
        options: { fallbackToPartialData: true }
      };

      const startTime = Date.now();
      const response = await reportGenerator.generateInitialReport(request);
      const processingTime = Date.now() - startTime;

      // Should not wait for the full 95 seconds - should timeout and use fallback
      expect(processingTime).toBeLessThan(92000); // Should complete before 92 seconds
      expect(response.success).toBe(true); // Should still succeed with fallback
      expect(response.report?.content).toContain('AI analysis is temporarily unavailable');
    }, 95000);

    it('should handle timeout gracefully without throwing errors', async () => {
      const gracefulProject = {
        id: 'graceful-timeout-project',
        name: 'Graceful Timeout Test',
        competitors: [
          {
            id: 'comp-graceful-1',
            name: 'Graceful Competitor',
            snapshots: []
          }
        ]
      };

      mockPrisma.project.findUnique.mockResolvedValue(gracefulProject);
      mockPrisma.report.create.mockResolvedValue({
        id: 'graceful-timeout-report',
        projectId: 'graceful-timeout-project'
      });

      // Mock extremely slow AI service (100 seconds)
      mockBedrockService.generateCompletion.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve('Very delayed response'), 100000))
      );

      const request = {
        projectId: 'graceful-timeout-project'
      };

      // Should not throw error, should handle timeout gracefully
      await expect(reportGenerator.generateInitialReport(request)).resolves.toMatchObject({
        success: true,
        projectId: 'graceful-timeout-project'
      });
    }, 95000);

    it('should use Promise.race pattern for timeout implementation', async () => {
      const raceProject = {
        id: 'promise-race-project',
        name: 'Promise Race Test',
        competitors: [
          {
            id: 'comp-race-1',
            name: 'Race Competitor',
            snapshots: []
          }
        ]
      };

      mockPrisma.project.findUnique.mockResolvedValue(raceProject);
      mockPrisma.report.create.mockResolvedValue({
        id: 'promise-race-report',
        projectId: 'promise-race-project'
      });

      // Mock AI service with variable delay
      let aiCallCount = 0;
      mockBedrockService.generateCompletion.mockImplementation(() => {
        aiCallCount++;
        if (aiCallCount === 1) {
          // First call times out
          return new Promise(resolve => setTimeout(() => resolve('First call'), 95000));
        } else {
          // Subsequent calls are fast (shouldn't happen with proper timeout)
          return Promise.resolve('Fast response');
        }
      });

      const request = {
        projectId: 'promise-race-project',
        options: { fallbackToPartialData: true }
      };

      const response = await reportGenerator.generateInitialReport(request);

      // Should succeed with fallback content (timeout handling)
      expect(response.success).toBe(true);
      expect(aiCallCount).toBe(1); // Should only call AI once (timeout prevents retries)
    }, 100000);
  });
}); 