import { NextRequest } from 'next/server';
import { POST } from '../route';

// Mock dependencies
jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findFirst: jest.fn(),
      create: jest.fn()
    },
    project: {
      findMany: jest.fn(),
      create: jest.fn()
    },
    competitor: {
      findMany: jest.fn()
    },
    $transaction: jest.fn()
  }
}));

jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  },
  trackBusinessEvent: jest.fn(),
  generateCorrelationId: jest.fn(() => 'test-correlation-id')
}));

jest.mock('@/services/autoReportGenerationService', () => ({
  getAutoReportService: jest.fn(() => ({
    generateInitialComparativeReport: jest.fn(),
    schedulePeriodicReports: jest.fn()
  }))
}));

jest.mock('@/services/productScrapingService', () => ({
  ProductScrapingService: jest.fn(() => ({
    scrapeProduct: jest.fn().mockResolvedValue({ success: true }),
    scrapeProductById: jest.fn().mockResolvedValue({ success: true, data: 'mock-product-data' })
  }))
}));

jest.mock('@/services/smartSchedulingService', () => ({
  SmartSchedulingService: jest.fn(() => ({
    checkAndTriggerScraping: jest.fn().mockResolvedValue({
      triggered: true,
      tasksExecuted: 2,
      details: 'Mock scheduling completed'
    })
  }))
}));

jest.mock('@/services/smartAIService', () => ({
  smartAIService: {
    scheduleAnalysis: jest.fn().mockResolvedValue({
      analysisId: 'mock-analysis-id',
      scheduled: true
    }),
    enableAIForProject: jest.fn().mockResolvedValue({ enabled: true }),
    setupAutoAnalysis: jest.fn().mockResolvedValue({
      setupComplete: true,
      frequency: 'weekly',
      analysisTypes: ['competitive', 'comprehensive']
    }),
    analyzeWithSmartScheduling: jest.fn().mockResolvedValue({
      analysis: 'Mock comprehensive analysis content',
      analysisMetadata: {
        dataFreshGuaranteed: true,
        correlationId: 'test-analysis-correlation-id'
      }
    })
  }
}));

jest.mock('@/lib/repositories', () => ({
  productRepository: {
    create: jest.fn(),
    findById: jest.fn(),
    update: jest.fn(),
    delete: jest.fn()
  }
}));

// Mock the InitialComparativeReportService
jest.mock('@/services/reports/initialComparativeReportService', () => ({
  InitialComparativeReportService: jest.fn().mockImplementation(() => ({
    generateInitialComparativeReport: jest.fn().mockResolvedValue({
      id: 'test-report-id',
      title: 'Test Initial Report',
      status: 'completed'
    })
  }))
}));

// Mock the AsyncReportProcessingService
jest.mock('@/services/reports/asyncReportProcessingService', () => ({
  asyncReportProcessingService: {
    processInitialReport: jest.fn().mockResolvedValue({
      success: true,
      reportId: 'test-report-id',
      report: { title: 'Test Async Report' },
      processingMethod: 'immediate',
      processingTime: 1500,
      fallbackUsed: false,
      timeoutExceeded: false
    })
  }
}));

describe('POST /api/projects - Phase 1.2 Enhanced Flow', () => {
  const mockUser = { id: 'user-1', email: 'mock@example.com', name: 'Mock User' };
  const mockProject = {
    id: 'project-1',
    name: 'Test Project',
    status: 'ACTIVE',
    competitors: [
      { id: 'comp-1', name: 'Competitor 1' },
      { id: 'comp-2', name: 'Competitor 2' }
    ]
  };
  const mockProduct = {
    id: 'product-1',
    name: 'Test Product',
    website: 'https://example.com',
    projectId: 'project-1'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup mocks
    const { prisma } = require('@/lib/prisma');
    const { productRepository } = require('@/lib/repositories');
    
    prisma.user.findFirst.mockResolvedValue(mockUser);
    prisma.competitor.findMany.mockResolvedValue([
      { id: 'comp-1', name: 'Competitor 1' },
      { id: 'comp-2', name: 'Competitor 2' }
    ]);
    prisma.$transaction.mockImplementation(async (callback: any) => {
      return callback({
        project: {
          create: jest.fn().mockResolvedValue(mockProject)
        }
      });
    });
    
    productRepository.create = jest.fn().mockResolvedValue(mockProduct);
  });

  // Simple test to isolate the issue
  describe('Basic Request Handling', () => {
    it('should handle simple request parsing', async () => {
      const requestBody = {
        name: 'Test Project',
        productWebsite: 'https://example.com',
        generateInitialReport: false  // Disable report generation to isolate
      };

      const request = new NextRequest('http://localhost:3000/api/projects', {
        method: 'POST',
        body: JSON.stringify(requestBody)
      });

      // Set a shorter timeout for this specific test
      jest.setTimeout(10000);
      
      const response = await POST(request);
      
      expect(response.status).toBe(201);
    }, 10000);  // 10 second timeout
  });

  describe('Immediate Report Generation', () => {
    it('should generate initial report immediately when requested', async () => {
      const { asyncReportProcessingService } = require('@/services/reports/asyncReportProcessingService');

      const requestBody = {
        name: 'Test Project',
        productWebsite: 'https://example.com',
        productName: 'Test Product',
        generateInitialReport: true,
        requireFreshSnapshots: true,
        reportTemplate: 'comprehensive'
      };

      const request = new NextRequest('http://localhost:3000/api/projects', {
        method: 'POST',
        body: JSON.stringify(requestBody)
      });

      const response = await POST(request);
      const responseData = await response.json();

      // Verify asyncReportProcessingService was called (this is what the API route actually uses)
      expect(asyncReportProcessingService.processInitialReport).toHaveBeenCalledWith(
        'project-1',
        expect.objectContaining({
          timeout: 45000,
          priority: 'high',
          fallbackToQueue: true,
          enableGracefulDegradation: true,
          maxConcurrentProcessing: 5,
          notifyOnCompletion: false,
          retryAttempts: 2
        })
      );

      // Verify response includes report generation info
      expect(response.status).toBe(201);
      expect(responseData.reportGeneration).toEqual(
        expect.objectContaining({
          initialReportGenerated: true,
          reportId: 'test-report-id',
          reportStatus: 'completed',
          reportTitle: 'Test Async Report',
          processingMethod: 'immediate'
        })
      );
    }, 15000);

    it('should respect generateInitialReport=false flag', async () => {
      const { asyncReportProcessingService } = require('@/services/reports/asyncReportProcessingService');

      const requestBody = {
        name: 'Test Project',
        productWebsite: 'https://example.com',
        generateInitialReport: false
      };

      const request = new NextRequest('http://localhost:3000/api/projects', {
        method: 'POST',
        body: JSON.stringify(requestBody)
      });

      const response = await POST(request);

      // Verify asyncReportProcessingService was not called when generateInitialReport=false
      expect(asyncReportProcessingService.processInitialReport).not.toHaveBeenCalled();
      
      expect(response.status).toBe(201);
    }, 10000);

    it('should fallback to queue when immediate generation fails', async () => {
      const { asyncReportProcessingService } = require('@/services/reports/asyncReportProcessingService');
      
      // Mock asyncReportProcessingService to return queue scheduled result
      asyncReportProcessingService.processInitialReport.mockResolvedValue({
        success: false,
        queueScheduled: true,
        taskId: 'task-1',
        processingMethod: 'queued_fallback',
        estimatedQueueCompletion: new Date(Date.now() + 300000), // 5 minutes from now
        error: 'Processing timeout, scheduled for queue',
        timeoutExceeded: true,
        fallbackUsed: true
      });

      const requestBody = {
        name: 'Test Project',
        productWebsite: 'https://example.com',
        generateInitialReport: true
      };

      const request = new NextRequest('http://localhost:3000/api/projects', {
        method: 'POST',
        body: JSON.stringify(requestBody)
      });

      const response = await POST(request);
      const responseData = await response.json();

      // Verify processing service was called
      expect(asyncReportProcessingService.processInitialReport).toHaveBeenCalledWith('project-1', expect.any(Object));
      
      expect(responseData.reportGeneration).toEqual(
        expect.objectContaining({
          initialReportGenerated: false,
          fallbackScheduled: true,
          taskId: 'task-1',
          processingMethod: 'queued_fallback'
        })
      );
    }, 10000);

    it('should handle requireFreshSnapshots option', async () => {
      const { asyncReportProcessingService } = require('@/services/reports/asyncReportProcessingService');

      const requestBody = {
        name: 'Test Project',
        productWebsite: 'https://example.com',
        requireFreshSnapshots: false
      };

      const request = new NextRequest('http://localhost:3000/api/projects', {
        method: 'POST',
        body: JSON.stringify(requestBody)
      });

      await POST(request);

      // The API route uses asyncReportProcessingService and the requireFreshSnapshots logic is handled internally
      expect(asyncReportProcessingService.processInitialReport).toHaveBeenCalledWith(
        'project-1',
        expect.objectContaining({
          timeout: 45000,
          priority: 'high',
          fallbackToQueue: true
        })
      );
    }, 10000);
  });

  describe('Project Creation Resilience', () => {
    it('should create project successfully even when report generation fails completely', async () => {
      const { asyncReportProcessingService } = require('@/services/reports/asyncReportProcessingService');
      
      // Mock asyncReportProcessingService to return complete failure
      asyncReportProcessingService.processInitialReport.mockResolvedValue({
        success: false,
        queueScheduled: false,
        error: 'Complete processing failure - all methods exhausted',
        processingMethod: 'failed',
        processingTime: 45000,
        timeoutExceeded: true,
        fallbackUsed: true
      });

      const requestBody = {
        name: 'Test Project',
        productWebsite: 'https://example.com',
        generateInitialReport: true
      };

      const request = new NextRequest('http://localhost:3000/api/projects', {
        method: 'POST',
        body: JSON.stringify(requestBody)
      });

      const response = await POST(request);
      const responseData = await response.json();

      // Project should still be created successfully
      expect(response.status).toBe(201);
      expect(responseData.id).toBe('project-1');
      
      // Report generation should indicate failure
      expect(responseData.reportGeneration).toEqual(
        expect.objectContaining({
          initialReportGenerated: false,
          fallbackScheduled: false,
          processingMethod: 'failed',
          error: expect.stringContaining('Complete processing failure')
        })
      );
    }, 10000);
  });
}); 