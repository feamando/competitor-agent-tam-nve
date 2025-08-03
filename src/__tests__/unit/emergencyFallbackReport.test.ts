import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import { InitialComparativeReportService } from '../../services/reports/initialComparativeReportService';

// Mock Prisma
const mockPrisma = {
  $transaction: jest.fn(),
  project: {
    findUnique: jest.fn()
  },
  report: {
    create: jest.fn()
  },
  reportVersion: {
    create: jest.fn()
  }
} as any;

// Mock other dependencies
jest.mock('@/lib/prisma', () => ({
  prisma: mockPrisma
}));

jest.mock('@/lib/logger', () => ({
  generateCorrelationId: jest.fn(() => 'test-correlation-id'),
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  },
  trackEvent: jest.fn(),
  trackError: jest.fn(),
  trackBusinessEvent: jest.fn()
}));

jest.mock('@paralleldrive/cuid2', () => ({
  createId: jest.fn(() => 'test-id-123')
}));

describe('Emergency Fallback Report Generation', () => {
  let reportService: InitialComparativeReportService;
  let mockTx: any;

    beforeEach(() => {
    reportService = new InitialComparativeReportService();
    
    // Mock transaction object
    mockTx = {
      report: {
        create: jest.fn().mockResolvedValue({
          id: 'test-report-id',
          name: 'Test Emergency Report',
          status: 'COMPLETED'
        })
      },
      reportVersion: {
        create: jest.fn().mockResolvedValue({
          id: 'test-version-id',
          reportId: 'test-report-id',
          version: 1
        })
      }
    };
    
    mockPrisma.$transaction.mockImplementation(async (callback: any) => {
      return await callback(mockTx);
    });
    
    // Reset project.findUnique mock
    mockPrisma.project.findUnique.mockReset();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateEmergencyFallbackReport', () => {
    it('should create both Report and ReportVersion atomically in a transaction', async () => {
      // Arrange
      const mockProject = {
        id: 'project-123',
        name: 'Test Project',
        competitors: [
          {
            id: 'competitor-1',
            name: 'Test Competitor'
          }
        ]
      };

      mockPrisma.project.findUnique.mockResolvedValue(mockProject);

      const originalError = new Error('Smart data collection failed');
      const mockReportLogger = {
        warn: jest.fn(),
        error: jest.fn(),
        info: jest.fn()
      };

      // Access the private method through reflection for testing
      const generateEmergencyFallbackReport = (reportService as any).generateEmergencyFallbackReport.bind(reportService);

      // Act
      const result = await generateEmergencyFallbackReport(
        'project-123',
        { timeout: 30000 },
        originalError,
        mockReportLogger
      );

      // Assert
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockTx.report.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          id: expect.any(String),
          name: expect.stringContaining('Emergency Report'),
          description: 'Emergency fallback report',
          projectId: 'project-123',
          competitorId: 'competitor-1',
          status: 'COMPLETED'
        })
      });

      expect(mockTx.reportVersion.create).toHaveBeenCalledWith({
        data: {
          reportId: expect.any(String),
          version: 1,
          content: expect.objectContaining({
            id: expect.any(String),
            title: expect.stringContaining('Emergency Report'),
            projectId: 'project-123',
            productId: 'project-123',
            keyFindings: expect.arrayContaining([
              expect.stringContaining('Emergency report generated')
            ]),
            strategicRecommendations: expect.objectContaining({
              immediate: expect.any(Array),
              shortTerm: expect.any(Array),
              longTerm: expect.any(Array),
              priorityScore: expect.any(Number)
            }),
            competitiveIntelligence: expect.objectContaining({
              marketPosition: expect.any(String),
              keyThreats: expect.any(Array),
              opportunities: expect.any(Array),
              competitiveAdvantages: expect.any(Array)
            }),
            status: 'completed',
            format: 'markdown'
          })
        }
      });

      // Verify the report structure is complete
      expect(result).toEqual(expect.objectContaining({
        id: expect.any(String),
        title: expect.stringContaining('Emergency Report'),
        projectId: 'project-123',
        productId: 'project-123',
        keyFindings: expect.any(Array),
        strategicRecommendations: expect.any(Object),
        competitiveIntelligence: expect.any(Object),
        status: 'completed',
        format: 'markdown'
      }));
    });

    it('should handle transaction failure gracefully', async () => {
      // Arrange
      const mockProject = {
        id: 'project-123',
        name: 'Test Project',
        competitors: []
      };

      mockPrisma.project.findUnique.mockResolvedValue(mockProject);
      mockPrisma.$transaction.mockRejectedValue(new Error('Database transaction failed'));

      const originalError = new Error('Smart data collection failed');
      const mockReportLogger = {
        warn: jest.fn(),
        error: jest.fn(),
        info: jest.fn()
      };

      const generateEmergencyFallbackReport = (reportService as any).generateEmergencyFallbackReport.bind(reportService);

      // Act & Assert
      await expect(generateEmergencyFallbackReport(
        'project-123',
        {},
        originalError,
        mockReportLogger
      )).rejects.toThrow('All report generation methods failed');

      expect(mockReportLogger.error).toHaveBeenCalledWith(
        'Emergency fallback report generation failed',
        expect.any(Error)
      );
    });

    it('should create report with proper emergency content structure', async () => {
      // Arrange
      const mockProject = {
        id: 'project-123',
        name: 'Good Chop Q3 Analysis',
        competitors: [
          { id: 'comp-1', name: 'Competitor 1' },
          { id: 'comp-2', name: 'Competitor 2' }
        ]
      };

      mockPrisma.project.findUnique.mockResolvedValue(mockProject);

      const originalError = new Error('Data collection timeout');
      const mockReportLogger = {
        warn: jest.fn(),
        error: jest.fn(),
        info: jest.fn()
      };

      const generateEmergencyFallbackReport = (reportService as any).generateEmergencyFallbackReport.bind(reportService);

      // Act
      const result = await generateEmergencyFallbackReport(
        'project-123',
        {},
        originalError,
        mockReportLogger
      );

      // Assert emergency content structure
      expect(result.executiveSummary).toContain('Emergency Comparative Analysis Report');
      expect(result.executiveSummary).toContain(mockProject.name);
      expect(result.executiveSummary).toContain('Data collection timeout');
      expect(result.executiveSummary).toContain('2 competitors found');

      expect(result.keyFindings).toHaveLength(3);
      expect(result.keyFindings[0]).toContain('Emergency report generated');

      expect(result.strategicRecommendations.immediate).toContain('Check system health');
      expect(result.strategicRecommendations.shortTerm).toContain('Re-run report generation');
      expect(result.strategicRecommendations.longTerm).toContain('Implement monitoring');
      expect(result.strategicRecommendations.priorityScore).toBe(50);

      expect(result.competitiveIntelligence.marketPosition).toContain('Unknown');
      expect(result.competitiveIntelligence.keyThreats).toContain('System reliability issues');
    });
  });
}); 