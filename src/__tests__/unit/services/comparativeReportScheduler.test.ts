import { ComparativeReportScheduler, ComparativeReportSchedulerConfig, ScheduledReportExecution } from '@/services/comparativeReportScheduler';
import { ComparativeAnalysisService } from '@/services/analysis/comparativeAnalysisService';
import { ComparativeReportService } from '@/services/reports/comparativeReportService';
import { ProductScrapingService } from '@/services/productScrapingService';
import { ProjectScrapingService } from '@/services/projectScrapingService';
import { ComparativeReportRepository } from '@/lib/repositories/comparativeReportRepository';
import { ProductRepository } from '@/lib/repositories/productRepository';
import { logger } from '@/lib/logger';
import { PrismaClient } from '@prisma/client';
import * as cron from 'node-cron';

// Mock PrismaClient constructor with inline mock definition to avoid hoisting issues
let mockPrismaInstance: any;

jest.mock('@prisma/client', () => {
  const mockInstance = {
    project: {
      findUnique: jest.fn()
    },
    reportSchedule: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn()
    },
    report: {
      create: jest.fn()
    },
    productSnapshot: {
      findFirst: jest.fn()
    }
  };
  
  return {
    PrismaClient: jest.fn(() => mockInstance),
    ReportScheduleFrequency: {
      DAILY: 'DAILY',
      WEEKLY: 'WEEKLY', 
      MONTHLY: 'MONTHLY',
      QUARTERLY: 'QUARTERLY'
    },
    ReportScheduleStatus: {
      ACTIVE: 'ACTIVE',
      INACTIVE: 'INACTIVE',
      PAUSED: 'PAUSED'
    }
  };
});

// Mock all other dependencies
jest.mock('@/services/analysis/comparativeAnalysisService');
jest.mock('@/services/reports/comparativeReportService');
jest.mock('@/services/productScrapingService');
jest.mock('@/services/projectScrapingService');
jest.mock('@/lib/repositories/comparativeReportRepository');
jest.mock('@/lib/repositories/productRepository');
jest.mock('@/lib/logger');
jest.mock('node-cron');
jest.mock('@paralleldrive/cuid2', () => ({
  createId: jest.fn(() => 'test-id-123')
}));

const mockCronTask = {
  start: jest.fn(),
  stop: jest.fn(),
  scheduled: false
};

const mockCronSchedule = jest.mocked(cron.schedule);

describe('ComparativeReportScheduler', () => {
  let scheduler: ComparativeReportScheduler;
  let mockComparativeAnalysisService: jest.Mocked<ComparativeAnalysisService>;
  let mockComparativeReportService: jest.Mocked<ComparativeReportService>;
  let mockProductScrapingService: jest.Mocked<ProductScrapingService>;
  let mockProjectScrapingService: jest.Mocked<ProjectScrapingService>;
  let mockReportRepository: jest.Mocked<ComparativeReportRepository>;
  let mockProductRepository: jest.Mocked<ProductRepository>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock cron.schedule
    mockCronSchedule.mockReturnValue(mockCronTask as any);
    
    // Create the mock prisma instance that will be injected
    if (!mockPrismaInstance) {
      mockPrismaInstance = {
        project: {
          findUnique: jest.fn()
        },
        reportSchedule: {
          create: jest.fn(),
          update: jest.fn(),
          findUnique: jest.fn(),
          findMany: jest.fn()
        },
        report: {
          create: jest.fn()
        },
        productSnapshot: {
          findFirst: jest.fn()
        }
      };
    }
    
    // Create scheduler instance with mocked prisma
    scheduler = new ComparativeReportScheduler(mockPrismaInstance);
    
    // Get mocked service instances
    mockComparativeAnalysisService = scheduler['comparativeAnalysisService'] as jest.Mocked<ComparativeAnalysisService>;
    mockComparativeReportService = scheduler['comparativeReportService'] as jest.Mocked<ComparativeReportService>;
    mockProductScrapingService = scheduler['productScrapingService'] as jest.Mocked<ProductScrapingService>;
    mockProjectScrapingService = scheduler['projectScrapingService'] as jest.Mocked<ProjectScrapingService>;
    mockReportRepository = scheduler['reportRepository'] as jest.Mocked<ComparativeReportRepository>;
    mockProductRepository = scheduler['productRepository'] as jest.Mocked<ProductRepository>;
  });

  describe('scheduleComparativeReports', () => {
    const mockConfig: ComparativeReportSchedulerConfig = {
      enabled: true,
      frequency: 'WEEKLY',
      projectId: 'project-123',
      reportName: 'Test Report',
      notifyOnCompletion: true,
      notifyOnErrors: true,
      maxConcurrentJobs: 1
    };

    const mockProject = {
      id: 'project-123',
      name: 'Test Project',
      products: [{ id: 'product-1', name: 'Test Product' }],
      competitors: [{ id: 'competitor-1', name: 'Test Competitor' }]
    };

    const mockReport = {
      id: 'report-123',
      name: 'Test Report',
      competitorId: 'competitor-1',
      projectId: 'project-123'
    };

    beforeEach(() => {
      mockPrismaInstance.project.findUnique.mockResolvedValue(mockProject);
      mockPrismaInstance.report.create.mockResolvedValue(mockReport);
      mockPrismaInstance.reportSchedule.create.mockResolvedValue({
        id: 'schedule-123',
        reportId: 'report-123'
      });
    });

    it('should create and start a new schedule successfully', async () => {
      const scheduleId = await scheduler.scheduleComparativeReports(mockConfig);

      expect(scheduleId).toBe('test-id-123');
      expect(mockPrismaInstance.project.findUnique).toHaveBeenCalledWith({
        where: { id: 'project-123' },
        include: { products: true, competitors: true }
      });
      expect(mockPrismaInstance.reportSchedule.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          id: 'test-id-123',
          reportId: 'report-123',
          name: 'Test Report',
          frequency: 'WEEKLY',
          status: 'ACTIVE'
        })
      });
      expect(mockCronSchedule).toHaveBeenCalledWith(
        '0 9 * * 1', // Weekly cron expression
        expect.any(Function),
        expect.objectContaining({
          timezone: 'America/New_York'
        })
      );
      expect(mockCronTask.start).toHaveBeenCalled();
    });

    it('should create but not start a disabled schedule', async () => {
      const disabledConfig = { ...mockConfig, enabled: false };
      const scheduleId = await scheduler.scheduleComparativeReports(disabledConfig);

      expect(scheduleId).toBe('test-id-123');
      expect(mockPrismaInstance.reportSchedule.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: 'PAUSED'
        })
      });
      expect(mockCronTask.start).not.toHaveBeenCalled();
    });

    it('should throw error when project has no products', async () => {
      mockPrismaInstance.project.findUnique.mockResolvedValue({
        ...mockProject,
        products: []
      });

      await expect(scheduler.scheduleComparativeReports(mockConfig))
        .rejects.toThrow('Project project-123 has no products. Cannot schedule comparative reports.');
    });

    it('should throw error when project has no competitors', async () => {
      mockPrismaInstance.project.findUnique.mockResolvedValue({
        ...mockProject,
        competitors: []
      });

      await expect(scheduler.scheduleComparativeReports(mockConfig))
        .rejects.toThrow('Project project-123 has no competitors. Cannot schedule comparative reports.');
    });

    it('should throw error when project does not exist', async () => {
      mockPrismaInstance.project.findUnique.mockResolvedValue(null);

      await expect(scheduler.scheduleComparativeReports(mockConfig))
        .rejects.toThrow('Project project-123 not found');
    });

    it('should use custom cron expression when provided', async () => {
      const customConfig = { ...mockConfig, customCron: '0 10 * * 2' };
      await scheduler.scheduleComparativeReports(customConfig);

      expect(mockCronSchedule).toHaveBeenCalledWith(
        '0 10 * * 2',
        expect.any(Function),
        expect.objectContaining({
          timezone: 'America/New_York'
        })
      );
    });
  });

  describe('generateScheduledReport', () => {
    const mockProject = {
      id: 'project-123',
      products: [{
        id: 'product-1',
        name: 'Test Product',
        website: 'https://example.com',
        snapshots: [{
          id: 'snapshot-1',
          content: { title: 'Test Content' },
          metadata: { status: 'success' }
        }]
      }],
      competitors: [{
        id: 'competitor-1',
        name: 'Test Competitor',
        website: 'https://competitor.com',
        snapshots: [{
          id: 'snapshot-2',
          metadata: { status: 'success' }
        }]
      }]
    };

    const mockAnalysis = {
      id: 'analysis-123',
      projectId: 'project-123',
      productId: 'product-1',
      summary: { overallPosition: 'strong' },
      detailed: { features: {} },
      recommendations: []
    };

    const mockReport = {
      id: 'report-123',
      projectId: 'project-123',
      sections: [],
      metadata: { confidenceScore: 85 }
    };

    const mockProductSnapshot = {
      id: 'snapshot-1',
      content: { title: 'Test Content' },
      metadata: { status: 'success' }
    };

    beforeEach(() => {
      mockPrismaInstance.project.findUnique.mockResolvedValue(mockProject);
      mockProductScrapingService.triggerManualProductScraping = jest.fn().mockResolvedValue(undefined);
      mockProjectScrapingService.triggerManualProjectScraping = jest.fn().mockResolvedValue(undefined);
      mockComparativeAnalysisService.analyzeProductVsCompetitors = jest.fn().mockResolvedValue(mockAnalysis);
      mockProductRepository.findByProjectId = jest.fn().mockResolvedValue(mockProject.products[0]);
      mockPrismaInstance.productSnapshot.findFirst.mockResolvedValue(mockProductSnapshot);
      mockComparativeReportService.generateComparativeReport = jest.fn().mockResolvedValue({
        report: mockReport,
        generationTime: 1000,
        tokensUsed: 500,
        cost: 0.01
      });
      mockReportRepository.create = jest.fn().mockResolvedValue(mockReport);
    });

    it('should successfully generate a scheduled report', async () => {
      const report = await scheduler.generateScheduledReport('project-123');

      expect(report).toEqual(mockReport);
      expect(mockProductScrapingService.triggerManualProductScraping).toHaveBeenCalledWith('project-123');
      expect(mockProjectScrapingService.triggerManualProjectScraping).toHaveBeenCalledWith('project-123');
      expect(mockComparativeAnalysisService.analyzeProductVsCompetitors).toHaveBeenCalled();
      expect(mockComparativeReportService.generateComparativeReport).toHaveBeenCalled();
      expect(mockReportRepository.create).toHaveBeenCalled();
    });

    it('should track execution metrics', async () => {
      await scheduler.generateScheduledReport('project-123');

      const executions = scheduler.getActiveExecutions();
      expect(executions).toHaveLength(1);
      expect(executions[0]).toMatchObject({
        projectId: 'project-123',
        status: 'completed',
        metrics: expect.objectContaining({
          scrapingTime: expect.any(Number),
          analysisTime: expect.any(Number),
          reportGenerationTime: expect.any(Number),
          totalTime: expect.any(Number)
        })
      });
    });

    it('should handle execution failure gracefully', async () => {
      const error = new Error('Analysis failed');
      mockComparativeAnalysisService.analyzeProductVsCompetitors = jest.fn().mockRejectedValue(error);

      await expect(scheduler.generateScheduledReport('project-123')).rejects.toThrow('Analysis failed');

      const executions = scheduler.getActiveExecutions();
      expect(executions[0]).toMatchObject({
        status: 'failed',
        error: 'Analysis failed'
      });
    });

    it('should throw error when project has no products', async () => {
      mockPrismaInstance.project.findUnique.mockResolvedValue({
        ...mockProject,
        products: []
      });

      await expect(scheduler.generateScheduledReport('project-123'))
        .rejects.toThrow(/Project.*project-123.*not found.*no products/i);
    });

    it('should throw error when product has no snapshots', async () => {
      mockPrismaInstance.productSnapshot.findFirst.mockResolvedValue(null);

      await expect(scheduler.generateScheduledReport('project-123'))
        .rejects.toThrow(/No product snapshot.*product.*product-1/i);
    });
  });

  describe('frequency conversion', () => {
    it('should convert DAILY frequency to correct cron expression', () => {
      const cron = scheduler['frequencyToCron']('DAILY');
      expect(cron).toBe('0 9 * * *');
    });

    it('should convert WEEKLY frequency to correct cron expression', () => {
      const cron = scheduler['frequencyToCron']('WEEKLY');
      expect(cron).toBe('0 9 * * 1');
    });

    it('should convert MONTHLY frequency to correct cron expression', () => {
      const cron = scheduler['frequencyToCron']('MONTHLY');
      expect(cron).toBe('0 9 1 * *');
    });

    it('should convert QUARTERLY frequency to correct cron expression', () => {
      const cron = scheduler['frequencyToCron']('QUARTERLY' as any);
      expect(cron).toBe('0 0 1 */3 *');
    });

    it('should default to weekly for unknown frequency', () => {
      const cron = scheduler['frequencyToCron']('UNKNOWN' as any);
      expect(cron).toBe('0 9 * * 1');
    });
  });

  describe('schedule management', () => {
    beforeEach(() => {
      // Add a mock job to the scheduler
      scheduler['jobs'].set('schedule-123', mockCronTask as any);
    });

    it('should stop a scheduled job', () => {
      const result = scheduler.stopSchedule('schedule-123');

      expect(result).toBe(true);
      expect(mockCronTask.stop).toHaveBeenCalled();
    });

    it('should start a stopped schedule', () => {
      const result = scheduler.startSchedule('schedule-123');

      expect(result).toBe(true);
      expect(mockCronTask.start).toHaveBeenCalled();
    });

    it('should return false when stopping non-existent schedule', () => {
      const result = scheduler.stopSchedule('non-existent');

      expect(result).toBe(false);
      expect(mockCronTask.stop).not.toHaveBeenCalled();
    });

    it('should return false when starting non-existent schedule', () => {
      const result = scheduler.startSchedule('non-existent');

      expect(result).toBe(false);
      expect(mockCronTask.start).not.toHaveBeenCalled();
    });

    it('should stop all jobs during cleanup', () => {
      scheduler['jobs'].set('schedule-456', mockCronTask as any);
      
      scheduler.stopAllJobs();

      expect(mockCronTask.stop).toHaveBeenCalledTimes(2);
      expect(scheduler['jobs'].size).toBe(0);
      expect(scheduler['activeExecutions'].size).toBe(0);
    });
  });

  describe('getScheduleStatus', () => {
    const mockSchedule = {
      id: 'schedule-123',
      reportId: 'report-123',
      name: 'Test Schedule',
      status: 'ACTIVE',
      report: { id: 'report-123', name: 'Test Report' }
    };

    beforeEach(() => {
      mockPrismaInstance.reportSchedule.findUnique.mockResolvedValue(mockSchedule);
      scheduler['jobs'].set('schedule-123', mockCronTask as any);
    });

    it('should return schedule status with running state', async () => {
      const status = await scheduler.getScheduleStatus('schedule-123');

      expect(status).toEqual({
        schedule: mockSchedule,
        isRunning: true,
        activeExecution: undefined
      });
    });

    it('should include active execution when available', async () => {
      const execution: ScheduledReportExecution = {
        scheduleId: 'schedule-123',
        projectId: 'project-123',
        executionId: 'exec-123',
        startTime: new Date(),
        status: 'running',
        metrics: {}
      };
      scheduler['activeExecutions'].set('exec-123', execution);

      const status = await scheduler.getScheduleStatus('schedule-123');

      expect(status.activeExecution).toEqual(execution);
    });
  });

  describe('listProjectSchedules', () => {
    const mockSchedules = [
      {
        id: 'schedule-123',
        reportId: 'report-123',
        name: 'Schedule 1',
        report: { id: 'report-123', projectId: 'project-123' }
      },
      {
        id: 'schedule-456',
        reportId: 'report-456',
        name: 'Schedule 2',
        report: { id: 'report-456', projectId: 'project-123' }
      }
    ];

    beforeEach(() => {
      mockPrismaInstance.reportSchedule.findMany.mockResolvedValue(mockSchedules);
      scheduler['jobs'].set('schedule-123', mockCronTask as any);
    });

    it('should return project schedules with running status', async () => {
      const schedules = await scheduler.listProjectSchedules('project-123');

      expect(schedules).toEqual([
        { ...mockSchedules[0], isRunning: true },
        { ...mockSchedules[1], isRunning: false }
      ]);
      expect(mockPrismaInstance.reportSchedule.findMany).toHaveBeenCalledWith({
        where: { report: { projectId: 'project-123' } },
        include: { report: true },
        orderBy: { createdAt: 'desc' }
      });
    });
  });

  describe('notification methods', () => {
    const mockReport = {
      id: 'report-123',
      metadata: { projectName: 'Test Project', confidenceScore: 85 },
      sections: [{ type: 'summary', content: 'Test' }]
    };

    it('should send completion notification', async () => {
      await scheduler['sendCompletionNotification']('schedule-123', mockReport as any);

      expect(logger.info).toHaveBeenCalledWith(
        'Completion notification',
        expect.objectContaining({ scheduleId: 'schedule-123' })
      );
    });

    it('should send error notification', async () => {
      const error = new Error('Test error');
      await scheduler['sendErrorNotification']('schedule-123', error);

      expect(logger.error).toHaveBeenCalledWith(
        'Error notification',
        expect.objectContaining({ scheduleId: 'schedule-123' })
      );
    });
  });

  describe('validation methods', () => {
    it('should validate project for scheduling successfully', async () => {
      const mockProject = {
        id: 'project-123',
        products: [{ id: 'product-1' }],
        competitors: [{ id: 'competitor-1' }]
      };
      mockPrismaInstance.project.findUnique.mockResolvedValue(mockProject);

      await expect(scheduler['validateProjectForScheduling']('project-123'))
        .resolves.toBeUndefined();
    });

    it('should throw error for non-existent project', async () => {
      mockPrismaInstance.project.findUnique.mockResolvedValue(null);

      await expect(scheduler['validateProjectForScheduling']('project-123'))
        .rejects.toThrow('Project project-123 not found');
    });
  });
}); 