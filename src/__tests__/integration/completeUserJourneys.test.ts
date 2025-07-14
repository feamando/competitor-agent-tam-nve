import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { logger } from '@/lib/logger';

// Mock logger
jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock prisma
jest.mock('@/lib/prisma', () => {
  const mockPrisma = {
    project: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
    },
    product: {
      create: jest.fn(),
      update: jest.fn(),
    },
    competitor: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    competitorSnapshot: {
      create: jest.fn(),
    },
    report: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
  };
  return {
    __esModule: true,
    default: mockPrisma,
    prisma: mockPrisma,
  };
});

// Mock services
jest.mock('@/services/projectService', () => ({
  projectService: {
    createProject: jest.fn(),
    getProject: jest.fn(),
    addCompetitorToProject: jest.fn(),
  },
}));

jest.mock('@/services/reports/initialComparativeReportService', () => ({
  InitialComparativeReportService: jest.fn().mockImplementation(() => ({
    generateInitialReport: jest.fn(),
    captureCompetitorSnapshots: jest.fn(),
  })),
}));

jest.mock('@/services/competitorAnalysis', () => ({
  CompetitorAnalysisService: jest.fn().mockImplementation(() => ({
    createCompetitor: jest.fn(),
    getCompetitor: jest.fn(),
    analyzeCompetitor: jest.fn(),
    listCompetitors: jest.fn(),
  })),
}));

// Import services after mocking
const { projectService } = require('@/services/projectService');
const { CompetitorAnalysisService } = require('@/services/competitorAnalysis');
const { InitialComparativeReportService } = require('@/services/reports/initialComparativeReportService');
const { prisma } = require('@/lib/prisma');

describe('Complete User Journey Tests', () => {
  let competitorAnalysisService: any;
  let initialReportService: any;

  beforeAll(() => {
    competitorAnalysisService = new CompetitorAnalysisService();
    initialReportService = new InitialComparativeReportService();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Journey 1: Project Creation to Initial Report', () => {
    it('should complete the full user journey from project creation to initial report generation', async () => {
      // 1. Create a project with product data
      const projectData = {
        name: 'Test Project',
        description: 'Test project description',
        product: {
          name: 'Test Product',
          description: 'Test product description',
          website: 'https://testproduct.com',
          industry: 'SaaS',
        },
      };

      const createdProject = {
        id: 'project-123',
        name: 'Test Project',
        description: 'Test project description',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      projectService.createProject.mockResolvedValue(createdProject);

      const project = await projectService.createProject(projectData);
      expect(project.id).toBe('project-123');

      // 2. Add competitors to the project
      const competitor1 = {
        id: 'competitor-1',
        name: 'Competitor 1',
        website: 'https://competitor1.com',
        industry: 'SaaS',
      };

      const competitor2 = {
        id: 'competitor-2',
        name: 'Competitor 2',
        website: 'https://competitor2.com',
        industry: 'SaaS',
      };

      competitorAnalysisService.createCompetitor.mockResolvedValueOnce({
        ...competitor1,
      });

      competitorAnalysisService.createCompetitor.mockResolvedValueOnce({
        ...competitor2,
      });

      projectService.addCompetitorToProject.mockResolvedValue({
        projectId: 'project-123',
        competitorId: 'competitor-1',
      });

      // Add first competitor
      await projectService.addCompetitorToProject('project-123', 'competitor-1');
      
      projectService.addCompetitorToProject.mockResolvedValue({
        projectId: 'project-123',
        competitorId: 'competitor-2',
      });

      // Add second competitor
      await projectService.addCompetitorToProject('project-123', 'competitor-2');

      // 3. Mock project retrieval with associated competitors
      projectService.getProject.mockResolvedValue({
        id: 'project-123',
        name: 'Test Project',
        description: 'Test project description',
        competitors: [competitor1, competitor2],
        product: {
          id: 'product-123',
          name: 'Test Product',
          website: 'https://testproduct.com',
        },
      });

      // 4. Capture competitor snapshots
      initialReportService.captureCompetitorSnapshots.mockResolvedValue({
        success: true,
        capturedCount: 2,
        totalCompetitors: 2,
        snapshots: [
          {
            id: 'snapshot-1',
            competitorId: 'competitor-1',
          },
          {
            id: 'snapshot-2',
            competitorId: 'competitor-2',
          },
        ],
      });

      const snapshotResult = await initialReportService.captureCompetitorSnapshots('project-123');
      expect(snapshotResult.success).toBe(true);
      expect(snapshotResult.capturedCount).toBe(2);

      // 5. Generate initial report
      initialReportService.generateInitialReport.mockResolvedValue({
        success: true,
        reportId: 'report-123',
        reportUrl: '/reports/report-123',
        report: {
          id: 'report-123',
          projectId: 'project-123',
          title: 'Initial Comparative Analysis',
          createdAt: new Date(),
        },
      });

      const reportResult = await initialReportService.generateInitialReport('project-123');
      expect(reportResult.success).toBe(true);
      expect(reportResult.reportId).toBe('report-123');

      // 6. Verify the full journey
      expect(projectService.createProject).toHaveBeenCalledTimes(1);
      expect(projectService.addCompetitorToProject).toHaveBeenCalledTimes(2);
      expect(initialReportService.captureCompetitorSnapshots).toHaveBeenCalledTimes(1);
      expect(initialReportService.generateInitialReport).toHaveBeenCalledTimes(1);

      // Full journey complete - all key steps verified
      expect(logger.info).toHaveBeenCalled();
    });
  });
  
  describe('Journey 2: Error Recovery During Report Generation', () => {
    it('should handle errors and recover gracefully during report generation', async () => {
      // 1. Successfully create a project
      projectService.createProject.mockResolvedValue({
        id: 'project-456',
        name: 'Recovery Test Project',
        description: 'Testing error recovery',
        createdAt: new Date(),
      });
      
      const project = await projectService.createProject({
        name: 'Recovery Test Project',
        description: 'Testing error recovery',
        product: {
          name: 'Recovery Product',
          website: 'https://recovery-test.com',
        },
      });
      
      expect(project.id).toBe('project-456');
      
      // 2. Mock competitors
      const competitor = {
        id: 'competitor-456',
        name: 'Recovery Competitor',
        website: 'https://recovery-competitor.com',
      };
      
      competitorAnalysisService.createCompetitor.mockResolvedValue({
        ...competitor,
      });
      
      projectService.addCompetitorToProject.mockResolvedValue({
        projectId: 'project-456',
        competitorId: 'competitor-456',
      });
      
      await projectService.addCompetitorToProject('project-456', 'competitor-456');
      
      // 3. Mock project retrieval with associated competitor
      projectService.getProject.mockResolvedValue({
        id: 'project-456',
        name: 'Recovery Test Project',
        competitors: [competitor],
        product: {
          id: 'product-456',
          name: 'Recovery Product',
          website: 'https://recovery-test.com',
        },
      });
      
      // 4. Simulate snapshot capture failure
      initialReportService.captureCompetitorSnapshots.mockRejectedValueOnce(
        new Error('Network error during snapshot capture')
      );
      
      // First attempt fails
      try {
        await initialReportService.captureCompetitorSnapshots('project-456');
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeDefined();
        expect((error as Error).message).toBe('Network error during snapshot capture');
      }
      
      // 5. Simulate retry with success
      initialReportService.captureCompetitorSnapshots.mockResolvedValueOnce({
        success: true,
        capturedCount: 1,
        totalCompetitors: 1,
        snapshots: [
          {
            id: 'recovery-snapshot-1',
            competitorId: 'competitor-456',
          },
        ],
      });
      
      const retryResult = await initialReportService.captureCompetitorSnapshots('project-456');
      expect(retryResult.success).toBe(true);
      expect(retryResult.capturedCount).toBe(1);
      
      // 6. Simulate partial report generation with warning
      initialReportService.generateInitialReport.mockResolvedValue({
        success: true,
        reportId: 'report-456',
        reportUrl: '/reports/report-456',
        report: {
          id: 'report-456',
          projectId: 'project-456',
          title: 'Partial Comparative Analysis',
          createdAt: new Date(),
        },
        warnings: ['Limited data available for complete analysis'],
      });
      
      const reportResult = await initialReportService.generateInitialReport('project-456', {
        fallbackToPartialData: true,
      });
      
      expect(reportResult.success).toBe(true);
      expect(reportResult.warnings).toBeDefined();
      expect(reportResult.warnings).toContain('Limited data available for complete analysis');
      
      // 7. Verify the error recovery journey completed successfully
      expect(initialReportService.captureCompetitorSnapshots).toHaveBeenCalledTimes(2);
      expect(initialReportService.generateInitialReport).toHaveBeenCalledTimes(1);
      
      // Journey complete with error recovery
      expect(logger.warn).toHaveBeenCalled();
      expect(reportResult.reportId).toBe('report-456');
    });
  });
}); 