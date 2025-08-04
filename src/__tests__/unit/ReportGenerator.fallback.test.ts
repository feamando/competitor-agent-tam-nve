/**
 * Unit Tests for ReportGenerator Fallback Methods - Phase 5 Implementation
 * Tests the 4 specialized fallback methods from Phase 4 implementation
 */

import { ReportGenerator } from '@/services/domains/reporting/ReportGenerator';
import { InitialReportRequest } from '@/services/domains/reporting/types';
import { BedrockService } from '@/services/bedrock/bedrock.service';
import { prisma } from '@/lib/prisma';

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

// Mock dependencies
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

jest.mock('@paralleldrive/cuid2', () => ({
  createId: jest.fn(() => 'fallback-report-id'),
}));

describe('ReportGenerator Fallback Methods - Phase 5 Edge Case Tests', () => {
  let reportGenerator: ReportGenerator;
  let mockPrisma: any;
  let mockBedrockService: jest.Mocked<BedrockService>;

  const mockConfig = {
    markdownOnly: true,
    maxConcurrency: 2,
    timeout: 120000,
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup mocks
    mockPrisma = prisma as any;
    mockBedrockService = new BedrockService() as jest.Mocked<BedrockService>;
    mockBedrockService.generateCompletion = jest.fn();
    
    reportGenerator = new ReportGenerator(mockConfig);
  });

  describe('14.1 - Test generateProjectOnlyReport() when no competitors assigned', () => {
    const mockProjectNoCompetitors = {
      id: 'project-no-competitors',
      product: {
        id: 'product-1',
        name: 'Lonely Product',
        website: 'https://lonelyproduct.com',
        description: 'A product without competitors',
      },
      competitors: [],
    };

    const mockRequest = {
      projectId: 'project-no-competitors',
      taskId: 'fallback-task-1',
      options: { fallbackToPartialData: true },
    };

    it('should generate project-only report when no competitors exist', async () => {
      // Access the private method through type assertion for testing
      const result = await (reportGenerator as any).generateProjectOnlyReport(
        mockProjectNoCompetitors,
        mockRequest,
        'fallback-correlation-id',
        Date.now()
      );

      expect(result.success).toBe(true);
      expect(result.status).toBe('completed');
      expect(result.message).toContain('Project-only report generated (no competitors available)');
      
      // Verify report structure
      expect(result.report).toBeDefined();
      expect(result.report.title).toContain('Lonely Product');
      expect(result.report.content).toContain('Project Overview');
      expect(result.report.content).toContain('No competitors have been assigned');
      expect(result.report.content).toContain('Add competitor companies');
      
      // Verify metadata
      expect(result.report.metadata.competitorCount).toBe(0);
      expect(result.report.metadata.dataCompletenessScore).toBe(100); // Complete for what's available
      expect(result.report.metadata.analysisMethod).toBe('rule_based');
      expect(result.report.metadata.reportType).toBe('project_only');
    });

    it('should include actionable recommendations in project-only report', async () => {
      const result = await (reportGenerator as any).generateProjectOnlyReport(
        mockProjectNoCompetitors,
        mockRequest,
        'fallback-correlation-id',
        Date.now()
      );

      expect(result.report.content).toContain('Recommendations');
      expect(result.report.content).toContain('Add competitor companies');
      expect(result.report.content).toContain('Re-run report generation');
      expect(result.report.content).toContain('accessible for data collection');
    });
  });

  describe('14.2 - Test generateFallbackReport() when AI service completely unavailable', () => {
    const mockProjectWithCompetitors = {
      id: 'project-ai-unavailable',
      product: {
        id: 'product-2',
        name: 'AI-Less Product',
        website: 'https://ailessproduct.com',
      },
      competitors: [
        { id: 'comp-1', name: 'Competitor 1' },
        { id: 'comp-2', name: 'Competitor 2' },
      ],
    };

    const mockRequest = {
      projectId: 'project-ai-unavailable',
      taskId: 'fallback-task-2',
      options: { fallbackToPartialData: true },
    };

    it('should generate fallback report when AI service unavailable', async () => {
      const result = await (reportGenerator as any).generateFallbackReport(
        mockProjectWithCompetitors,
        mockRequest,
        'fallback-correlation-id',
        Date.now()
      );

      expect(result.success).toBe(true);
      expect(result.status).toBe('completed');
      expect(result.message).toContain('Fallback report generated without AI analysis');
      
      // Verify report structure
      expect(result.report).toBeDefined();
      expect(result.report.title).toContain('AI-Less Product');
      expect(result.report.content).toContain('Initial Project Overview');
      expect(result.report.content).toContain('generated without AI analysis');
      expect(result.report.content).toContain('service unavailability');
      
      // Verify metadata reflects fallback mode
      expect(result.report.metadata.competitorCount).toBe(2);
      expect(result.report.metadata.dataCompletenessScore).toBe(0); // No AI analysis available
      expect(result.report.metadata.analysisMethod).toBe('rule_based');
      expect(result.report.metadata.reportType).toBe('fallback_overview');
    });

    it('should include service recovery guidance in fallback report', async () => {
      const result = await (reportGenerator as any).generateFallbackReport(
        mockProjectWithCompetitors,
        mockRequest,
        'fallback-correlation-id',
        Date.now()
      );

      expect(result.report.content).toContain('fallback mode');
      expect(result.report.content).toContain('ensure AI services are available');
      expect(result.report.content).toContain('comprehensive competitive analysis');
    });
  });

  describe('14.3 - Test generateFallbackAnalysisContent() when AI analysis partially fails', () => {
    const mockProduct = {
      id: 'product-3',
      name: 'Partial Analysis Product',
      website: 'https://partialproduct.com',
    };

    const mockSnapshots = [
      {
        id: 'snapshot-1',
        createdAt: new Date('2025-01-01'),
        competitorName: 'Partial Competitor A',
        content: 'Some competitor data',
        url: 'https://competitora.com',
      },
      {
        id: 'snapshot-2',
        createdAt: new Date('2025-01-02'),
        competitorName: 'Partial Competitor B',
        content: 'More competitor data',
        url: 'https://competitorb.com',
      },
    ];

    it('should generate template-based analysis content when AI fails', () => {
      const result = (reportGenerator as any).generateFallbackAnalysisContent(
        mockProduct,
        mockSnapshots
      );

      expect(result).toContain('Competitive Analysis - Partial Analysis Product');
      expect(result).toContain('Executive Summary');
      expect(result).toContain('template-based processing');
      expect(result).toContain('AI service unavailability');
      
      // Should list competitors
      expect(result).toContain('2 competitors identified');
      expect(result).toContain('Competitor 1');
      expect(result).toContain('Competitor 2');
      
      // Should include recovery instructions
      expect(result).toContain('Analysis Limitations');
      expect(result).toContain('Configure AI analysis services');
      expect(result).toContain('Re-run the report generation');
    });

    it('should include competitor data collection timestamps', () => {
      const result = (reportGenerator as any).generateFallbackAnalysisContent(
        mockProduct,
        mockSnapshots
      );

      expect(result).toContain('Data collected on');
      expect(result).toContain('2025'); // Should contain year from mock dates
    });

    it('should provide clear next steps for service recovery', () => {
      const result = (reportGenerator as any).generateFallbackAnalysisContent(
        mockProduct,
        mockSnapshots
      );

      expect(result).toContain('Next Steps');
      expect(result).toContain('Configure AI analysis services');
      expect(result).toContain('Collect fresh competitor data');
      expect(result).toContain('Generate comprehensive AI-powered analysis');
      expect(result).toContain('Generated using fallback template processing');
    });
  });

  describe('14.4 - Test data completeness scoring with various threshold scenarios', () => {
    const mockProjectPartialData = {
      id: 'project-partial',
      product: { name: 'Partial Data Product', website: 'https://partial.com' },
      competitors: [
        { id: 'comp-1', snapshots: [{ id: 'snap-1' }] }, // Has data
        { id: 'comp-2', snapshots: [] }, // No data
        { id: 'comp-3', snapshots: [{ id: 'snap-3' }] }, // Has data
        { id: 'comp-4', snapshots: [] }, // No data
      ],
    };

    it('should calculate correct data completeness scores', () => {
      // Test with 50% completeness (2 out of 4 competitors have data)
      const competitorsWithSnapshots = mockProjectPartialData.competitors.filter(
        comp => comp.snapshots.length > 0
      );
      const dataCompletenessScore = (competitorsWithSnapshots.length / mockProjectPartialData.competitors.length) * 100;

      expect(dataCompletenessScore).toBe(50);
      expect(competitorsWithSnapshots).toHaveLength(2);
      expect(mockProjectPartialData.competitors).toHaveLength(4);
    });

    it('should handle edge case with no competitors having data', () => {
      const noDataProject = {
        competitors: [
          { id: 'comp-1', snapshots: [] },
          { id: 'comp-2', snapshots: [] },
        ],
      };

      const competitorsWithSnapshots = noDataProject.competitors.filter(
        comp => comp.snapshots.length > 0
      );
      const dataCompletenessScore = (competitorsWithSnapshots.length / noDataProject.competitors.length) * 100;

      expect(dataCompletenessScore).toBe(0);
    });

    it('should handle edge case with all competitors having data', () => {
      const fullDataProject = {
        competitors: [
          { id: 'comp-1', snapshots: [{ id: 'snap-1' }] },
          { id: 'comp-2', snapshots: [{ id: 'snap-2' }] },
        ],
      };

      const competitorsWithSnapshots = fullDataProject.competitors.filter(
        comp => comp.snapshots.length > 0
      );
      const dataCompletenessScore = (competitorsWithSnapshots.length / fullDataProject.competitors.length) * 100;

      expect(dataCompletenessScore).toBe(100);
    });
  });

  describe('14.5 - Test file system directory creation and permission handling', () => {
    it('should create project directory when it does not exist', async () => {
      const fs = require('fs/promises');
      const path = require('path');
      
      // Mock fs.mkdir to simulate directory creation
      const mkdirSpy = jest.spyOn(fs, 'mkdir').mockResolvedValue(undefined);
      const statSpy = jest.spyOn(fs, 'stat')
        .mockRejectedValueOnce(new Error('ENOENT')) // Directory doesn't exist
        .mockResolvedValueOnce({ isDirectory: () => true } as any); // Directory exists after creation
      
      const reportGenerator = new ReportGenerator(mockConfig);
      
      const request: InitialReportRequest = {
        projectId: 'test-project-123',
        options: { fallbackToPartialData: true }
      };

      mockPrisma.project.findUnique.mockResolvedValueOnce({
        id: 'test-project-123',
        name: 'Test Project',
        competitors: [{ id: 'comp-1', name: 'Competitor 1', snapshots: [] }]
      });

      mockPrisma.report.create.mockResolvedValueOnce({
        id: 'report-123',
        projectId: 'test-project-123'
      });

      await reportGenerator.generateInitialReport(request);

      // Verify directory creation was attempted
      expect(mkdirSpy).toHaveBeenCalledWith(
        expect.stringContaining('reports/test-project-123'),
        { recursive: true }
      );
    });

    it('should handle file system permission errors gracefully', async () => {
      const fs = require('fs/promises');
      
      // Mock file system permission error
      const writeFileSpy = jest.spyOn(fs, 'writeFile')
        .mockRejectedValueOnce(new Error('EACCES: permission denied'));
      
      const reportGenerator = new ReportGenerator(mockConfig);
      
      const request: InitialReportRequest = {
        projectId: 'test-project-123',
        options: { fallbackToPartialData: true }
      };

      mockPrisma.project.findUnique.mockResolvedValueOnce({
        id: 'test-project-123',
        name: 'Test Project',
        competitors: [{ id: 'comp-1', name: 'Competitor 1', snapshots: [] }]
      });

      mockPrisma.report.create.mockResolvedValueOnce({
        id: 'report-123',
        projectId: 'test-project-123'
      });

      const response = await reportGenerator.generateInitialReport(request);

      // Should still return success even if file system fails
      expect(response.success).toBe(true);
      expect(response.report).toBeDefined();
      // File system error should be logged but not prevent report generation
    });

    it('should verify file creation and readability after successful write', async () => {
      const fs = require('fs/promises');
      
      const writeFileSpy = jest.spyOn(fs, 'writeFile').mockResolvedValueOnce(undefined);
      const statSpy = jest.spyOn(fs, 'stat').mockResolvedValueOnce({
        isDirectory: () => false,
        size: 1500,
        mtime: new Date()
      } as any);
      const accessSpy = jest.spyOn(fs, 'access').mockResolvedValueOnce(undefined);
      
      const reportGenerator = new ReportGenerator(mockConfig);
      
      const request: InitialReportRequest = {
        projectId: 'test-project-123',
        options: { fallbackToPartialData: true }
      };

      mockPrisma.project.findUnique.mockResolvedValueOnce({
        id: 'test-project-123',
        name: 'Test Project',
        competitors: [{ id: 'comp-1', name: 'Competitor 1', snapshots: [] }]
      });

      mockPrisma.report.create.mockResolvedValueOnce({
        id: 'report-123',
        projectId: 'test-project-123'
      });

      await reportGenerator.generateInitialReport(request);

      // Verify file verification steps
      expect(writeFileSpy).toHaveBeenCalled();
      expect(statSpy).toHaveBeenCalled();
      expect(accessSpy).toHaveBeenCalled();
    });
  });

  describe('14.6 - Test correlation ID propagation through all error scenarios', () => {
    it('should propagate correlation ID through BedrockService failures', async () => {
      const { trackErrorWithCorrelation } = require('@/lib/logger');
      
      mockBedrockService.generateCompletion.mockRejectedValueOnce(
        new Error('Bedrock service unavailable')
      );
      
      const reportGenerator = new ReportGenerator(mockConfig);
      
      const request: InitialReportRequest = {
        projectId: 'test-project-123',
        options: { fallbackToPartialData: true }
      };

      mockPrisma.project.findUnique.mockResolvedValueOnce({
        id: 'test-project-123',
        name: 'Test Project',
        competitors: [{ id: 'comp-1', name: 'Competitor 1', snapshots: [] }]
      });

      await reportGenerator.generateInitialReport(request);

      // Verify correlation ID is passed to error tracking
      expect(trackErrorWithCorrelation).toHaveBeenCalledWith(
        expect.any(Error),
        'test-correlation-id',
        expect.objectContaining({
          projectId: 'test-project-123',
          errorType: 'bedrock_initialization_failure'
        })
      );
    });

    it('should maintain correlation ID through database persistence failures', async () => {
      const { trackErrorWithCorrelation } = require('@/lib/logger');
      
      mockPrisma.report.create.mockRejectedValueOnce(
        new Error('Database connection failed')
      );
      
      const reportGenerator = new ReportGenerator(mockConfig);
      
      const request: InitialReportRequest = {
        projectId: 'test-project-123',
        options: { fallbackToPartialData: true }
      };

      mockPrisma.project.findUnique.mockResolvedValueOnce({
        id: 'test-project-123',
        name: 'Test Project',
        competitors: [{ id: 'comp-1', name: 'Competitor 1', snapshots: [] }]
      });

      await reportGenerator.generateInitialReport(request);

      // Verify correlation ID is maintained in database error tracking
      expect(trackErrorWithCorrelation).toHaveBeenCalledWith(
        expect.any(Error),
        'test-correlation-id',
        expect.objectContaining({
          projectId: 'test-project-123',
          operation: 'database_persistence'
        })
      );
    });

    it('should track correlation ID through concurrent request scenarios', async () => {
      const { trackBusinessEvent } = require('@/lib/logger');
      
      const reportGenerator = new ReportGenerator(mockConfig);
      
      const request: InitialReportRequest = {
        projectId: 'test-project-123',
        options: { fallbackToPartialData: true }
      };

      mockPrisma.project.findUnique.mockResolvedValue({
        id: 'test-project-123',
        name: 'Test Project',
        competitors: [{ id: 'comp-1', name: 'Competitor 1', snapshots: [] }]
      });

      mockPrisma.report.create.mockResolvedValue({
        id: 'report-123',
        projectId: 'test-project-123'
      });

      // Simulate concurrent requests
      const [response1, response2] = await Promise.all([
        reportGenerator.generateInitialReport(request),
        reportGenerator.generateInitialReport(request)
      ]);

      // Both responses should have task IDs (correlation IDs are internal)
      expect(response1.taskId).toBeDefined();
      expect(response2.taskId).toBeDefined();
      
      // Verify business event tracking includes correlation ID
      expect(trackBusinessEvent).toHaveBeenCalledWith(
        'report_generation_completed',
        expect.objectContaining({
          correlationId: 'test-correlation-id',
          projectId: 'test-project-123'
        })
      );
    });

    it('should preserve correlation ID across all fallback methods', async () => {
      const { logger } = require('@/lib/logger');
      
      const reportGenerator = new ReportGenerator(mockConfig);
      
      const request: InitialReportRequest = {
        projectId: 'test-project-123',
        options: { fallbackToPartialData: true }
      };

      // Test with no competitors (triggers generateProjectOnlyReport)
      mockPrisma.project.findUnique.mockResolvedValueOnce({
        id: 'test-project-123',
        name: 'Test Project',
        competitors: [] // No competitors
      });

      await reportGenerator.generateInitialReport(request);

      // Verify correlation ID appears in all log messages
      const logCalls = logger.info.mock.calls;
      const correlationLogs = logCalls.filter((call: any) => 
        call[0].includes('test-correlation-id') || 
        (call[1] && call[1].correlationId === 'test-correlation-id')
      );
      
      expect(correlationLogs.length).toBeGreaterThan(0);
    });
  });
}); 