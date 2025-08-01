/**
 * Integration Tests for Report Generation API - Task 6.2
 * 
 * Comprehensive integration test suite for the updated report generation API
 * that includes project discovery functionality and enhanced error handling.
 * 
 * Test Coverage:
 * - End-to-end API request/response flow
 * - Project discovery integration and automatic resolution
 * - Multiple project scenarios and fallback handling
 * - Input validation and edge cases
 * - Database interactions and error handling
 * - Correlation ID tracking and logging
 * - Performance and timeout scenarios
 * 
 * Part of TP-013-20250801-project-report-association-fix
 */

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/reports/generate/route';
import { prisma } from '@/lib/prisma';
import { ProjectDiscoveryService } from '@/services/projectDiscoveryService';
import { ReportGenerator } from '@/lib/reports';
import { logger } from '@/lib/logger';

// Mock dependencies
jest.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: jest.fn(),
    competitor: {
      findUnique: jest.fn()
    },
    project: {
      findMany: jest.fn(),
      findFirst: jest.fn()
    },
    report: {
      create: jest.fn(),
      findFirst: jest.fn()
    }
  }
}));

jest.mock('@/services/projectDiscoveryService');
jest.mock('@/lib/reports');
jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  },
  generateCorrelationId: jest.fn(() => 'test-correlation-id-123'),
  createCorrelationLogger: jest.fn(() => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  })),
  trackReportFlow: jest.fn(),
  trackCorrelation: jest.fn()
}));

// Test data fixtures
const mockCompetitor = {
  id: 'competitor-123',
  name: 'Test Competitor',
  website: 'https://test-competitor.com',
  industry: 'Technology'
};

const mockProjects = {
  single: [
    {
      id: 'project-single',
      name: 'Single Project',
      status: 'ACTIVE',
      priority: 3,
      isActive: true
    }
  ],
  multiple: [
    {
      id: 'project-active-high',
      name: 'Active High Priority',
      status: 'ACTIVE',
      priority: 4,
      isActive: true
    },
    {
      id: 'project-active-low',
      name: 'Active Low Priority',
      status: 'ACTIVE',
      priority: 2,
      isActive: true
    }
  ],
  inactiveOnly: [
    {
      id: 'project-inactive',
      name: 'Inactive Project',
      status: 'PAUSED',
      priority: 3,
      isActive: false
    }
  ]
};

const mockReport = {
  id: 'report-123',
  name: 'Generated Report',
  title: 'Test Report Title',
  status: 'COMPLETED',
  competitorId: 'competitor-123',
  projectId: 'project-single'
};

// Helper function to create mock request
const createMockRequest = (url: string, body?: any, method: string = 'POST'): NextRequest => {
  const mockRequest = {
    url,
    method,
    json: jest.fn().mockResolvedValue(body || {}),
    headers: new Headers(),
    nextUrl: new URL(url)
  } as unknown as NextRequest;

  return mockRequest;
};

// Helper function to setup mocks for successful scenario
const setupSuccessfulMocks = () => {
  // Database connectivity check
  (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ result: 1 }]);
  
  // Competitor exists
  (prisma.competitor.findUnique as jest.Mock).mockResolvedValue(mockCompetitor);
  
  // Project discovery success
  const mockProjectDiscoveryService = {
    validateProjectCompetitorRelationship: jest.fn().mockResolvedValue(true),
    resolveProjectId: jest.fn().mockResolvedValue({
      success: true,
      projectId: 'project-single',
      projects: mockProjects.single
    })
  };
  
  (ProjectDiscoveryService as jest.Mock).mockImplementation(() => mockProjectDiscoveryService);
  
  // Report generation success
  const mockReportGenerator = {
    generateReport: jest.fn().mockResolvedValue(mockReport)
  };
  
  (ReportGenerator as jest.Mock).mockImplementation(() => mockReportGenerator);
  
  return { mockProjectDiscoveryService, mockReportGenerator };
};

describe('Report Generation API Integration Tests - Task 6.2', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Input Validation and Edge Cases', () => {
    it('should reject request with missing competitor ID', async () => {
      const request = createMockRequest('http://localhost:3000/api/reports/generate');
      
      const response = await POST(request);
      const data = await response.json();
      
      expect(response.status).toBe(400);
      expect(data.code).toBe('EDGE_CASE_MISSING_COMPETITOR_ID');
      expect(data.message).toContain('Competitor ID is required');
      expect(data.correlationId).toBe('test-correlation-id-123');
      expect(data.retryable).toBe(false);
    });

    it('should reject request with invalid competitor ID format', async () => {
      const request = createMockRequest('http://localhost:3000/api/reports/generate?competitorId=invalid@competitor!');
      
      const response = await POST(request);
      const data = await response.json();
      
      expect(response.status).toBe(400);
      expect(data.code).toBe('EDGE_CASE_INVALID_COMPETITOR_FORMAT');
      expect(data.message).toContain('Invalid competitor ID format');
      expect(data.error.details).toContain('invalid characters');
    });

    it('should reject request with competitor ID too long', async () => {
      const longCompetitorId = 'a'.repeat(101);
      const request = createMockRequest(`http://localhost:3000/api/reports/generate?competitorId=${longCompetitorId}`);
      
      const response = await POST(request);
      const data = await response.json();
      
      expect(response.status).toBe(400);
      expect(data.code).toBe('EDGE_CASE_COMPETITOR_ID_TOO_LONG');
      expect(data.message).toContain('too long');
      expect(data.error.guidance.maxLength).toBe(100);
    });

    it('should reject request with invalid timeframe', async () => {
      const request = createMockRequest('http://localhost:3000/api/reports/generate?competitorId=valid-competitor&timeframe=500');
      
      const response = await POST(request);
      const data = await response.json();
      
      expect(response.status).toBe(400);
      expect(data.code).toBe('EDGE_CASE_INVALID_TIMEFRAME');
      expect(data.message).toContain('Invalid timeframe');
      expect(data.error.guidance.validRange).toEqual({ min: 1, max: 365 });
    });

    it('should handle database connectivity failure', async () => {
      (prisma.$queryRaw as jest.Mock).mockRejectedValue(new Error('Database connection failed'));
      
      const request = createMockRequest('http://localhost:3000/api/reports/generate?competitorId=valid-competitor');
      
      const response = await POST(request);
      const data = await response.json();
      
      expect(response.status).toBe(503);
      expect(data.code).toBe('EDGE_CASE_DATABASE_UNAVAILABLE');
      expect(data.retryable).toBe(true);
      expect(data.error.guidance.retryRecommendation).toBe('exponential backoff');
    });

    it('should handle non-existent competitor', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ result: 1 }]);
      (prisma.competitor.findUnique as jest.Mock).mockResolvedValue(null);
      
      const request = createMockRequest('http://localhost:3000/api/reports/generate?competitorId=nonexistent-competitor');
      
      const response = await POST(request);
      const data = await response.json();
      
      expect(response.status).toBe(404);
      expect(data.code).toBe('EDGE_CASE_COMPETITOR_NOT_FOUND');
      expect(data.message).toContain('not found');
    });
  });

  describe('Project Discovery Integration', () => {
    it('should successfully resolve single project automatically', async () => {
      const { mockProjectDiscoveryService, mockReportGenerator } = setupSuccessfulMocks();
      
      const request = createMockRequest('http://localhost:3000/api/reports/generate?competitorId=competitor-123');
      
      const response = await POST(request);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(mockProjectDiscoveryService.resolveProjectId).toHaveBeenCalledWith(
        'competitor-123',
        expect.objectContaining({
          correlationId: 'test-correlation-id-123',
          priorityRules: 'active_first',
          includeInactive: false
        })
      );
      expect(mockReportGenerator.generateReport).toHaveBeenCalledWith(
        'competitor-123',
        expect.objectContaining({
          projectId: 'project-single'
        })
      );
    });

    it('should handle multiple projects with graceful fallback', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ result: 1 }]);
      (prisma.competitor.findUnique as jest.Mock).mockResolvedValue(mockCompetitor);
      
      const mockProjectDiscoveryService = {
        validateProjectCompetitorRelationship: jest.fn().mockResolvedValue(true),
        resolveProjectId: jest.fn().mockResolvedValue({
          success: false,
          requiresExplicitSelection: true,
          projects: mockProjects.multiple,
          error: 'Competitor belongs to 2 projects. Please specify projectId explicitly.'
        })
      };
      
      (ProjectDiscoveryService as jest.Mock).mockImplementation(() => mockProjectDiscoveryService);
      
      const request = createMockRequest('http://localhost:3000/api/reports/generate?competitorId=competitor-123');
      
      const response = await POST(request);
      const data = await response.json();
      
      expect(response.status).toBe(422);
      expect(data.code).toBe('GRACEFUL_FALLBACK_MANUAL_SELECTION');
      expect(data.message).toContain('multiple options');
      expect(data.fallback.availableProjects).toHaveLength(2);
      expect(data.fallback.guidance.example.body.projectId).toBe('YOUR_CHOSEN_PROJECT_ID');
      expect(data.retryable).toBe(true);
    });

    it('should handle explicit project ID specification', async () => {
      const { mockProjectDiscoveryService, mockReportGenerator } = setupSuccessfulMocks();
      
      const requestBody = {
        projectId: 'explicit-project-id',
        reportName: 'Custom Report Name'
      };
      
      const request = createMockRequest(
        'http://localhost:3000/api/reports/generate?competitorId=competitor-123',
        requestBody
      );
      
      const response = await POST(request);
      
      // Should not call project discovery when explicit project ID is provided
      expect(mockProjectDiscoveryService.resolveProjectId).not.toHaveBeenCalled();
      expect(mockReportGenerator.generateReport).toHaveBeenCalledWith(
        'competitor-123',
        expect.objectContaining({
          projectId: 'explicit-project-id',
          reportName: 'Custom Report Name'
        })
      );
    });

    it('should handle competitor with only inactive projects', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ result: 1 }]);
      (prisma.competitor.findUnique as jest.Mock).mockResolvedValue(mockCompetitor);
      
      const mockProjectDiscoveryService = {
        validateProjectCompetitorRelationship: jest.fn().mockResolvedValue(true),
        resolveProjectId: jest.fn().mockResolvedValue({
          success: false,
          projects: [],
          error: 'No projects associated with this competitor'
        }),
        findProjectsByCompetitorId: jest.fn().mockResolvedValue(mockProjects.inactiveOnly)
      };
      
      (ProjectDiscoveryService as jest.Mock).mockImplementation(() => mockProjectDiscoveryService);
      
      const request = createMockRequest('http://localhost:3000/api/reports/generate?competitorId=competitor-123');
      
      const response = await POST(request);
      const data = await response.json();
      
      expect(response.status).toBe(422);
      expect(data.code).toBe('EDGE_CASE_INACTIVE_PROJECTS_ONLY');
      expect(data.message).toContain('inactive projects');
      expect(data.fallback.availableProjects).toHaveLength(1);
      expect(data.fallback.availableProjects[0].status).toBe('PAUSED');
    });

    it('should handle project discovery service errors', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ result: 1 }]);
      (prisma.competitor.findUnique as jest.Mock).mockResolvedValue(mockCompetitor);
      
      const mockProjectDiscoveryService = {
        validateProjectCompetitorRelationship: jest.fn().mockResolvedValue(true),
        resolveProjectId: jest.fn().mockRejectedValue(new Error('Project discovery service failed'))
      };
      
      (ProjectDiscoveryService as jest.Mock).mockImplementation(() => mockProjectDiscoveryService);
      
      const request = createMockRequest('http://localhost:3000/api/reports/generate?competitorId=competitor-123');
      
      const response = await POST(request);
      const data = await response.json();
      
      expect(response.status).toBe(503);
      expect(data.code).toBe('EDGE_CASE_PROJECT_DISCOVERY_FAILED');
      expect(data.retryable).toBe(true);
    });
  });

  describe('Report Generation Integration', () => {
    it('should generate report successfully with automatic project resolution', async () => {
      const { mockReportGenerator } = setupSuccessfulMocks();
      
      const request = createMockRequest('http://localhost:3000/api/reports/generate?competitorId=competitor-123&timeframe=30');
      
      const response = await POST(request);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.report).toEqual(mockReport);
      expect(data.projectResolution.source).toBe('automatic');
      expect(data.projectResolution.projectId).toBe('project-single');
      expect(data.correlationId).toBe('test-correlation-id-123');
      
      expect(mockReportGenerator.generateReport).toHaveBeenCalledWith(
        'competitor-123',
        expect.objectContaining({
          projectId: 'project-single',
          timeframe: 30,
          correlationId: 'test-correlation-id-123'
        })
      );
    });

    it('should generate report with custom options', async () => {
      const { mockReportGenerator } = setupSuccessfulMocks();
      
      const requestBody = {
        reportName: 'Custom Analysis Report',
        reportOptions: 'detailed',
        changeLog: 'Added custom analysis parameters'
      };
      
      const request = createMockRequest(
        'http://localhost:3000/api/reports/generate?competitorId=competitor-123&timeframe=90',
        requestBody
      );
      
      const response = await POST(request);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(mockReportGenerator.generateReport).toHaveBeenCalledWith(
        'competitor-123',
        expect.objectContaining({
          reportName: 'Custom Analysis Report',
          reportOptions: 'detailed',
          changeLog: 'Added custom analysis parameters',
          timeframe: 90
        })
      );
    });

    it('should handle report generation failures', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ result: 1 }]);
      (prisma.competitor.findUnique as jest.Mock).mockResolvedValue(mockCompetitor);
      
      const mockProjectDiscoveryService = {
        validateProjectCompetitorRelationship: jest.fn().mockResolvedValue(true),
        resolveProjectId: jest.fn().mockResolvedValue({
          success: true,
          projectId: 'project-single',
          projects: mockProjects.single
        })
      };
      
      const mockReportGenerator = {
        generateReport: jest.fn().mockRejectedValue(new Error('Report generation failed'))
      };
      
      (ProjectDiscoveryService as jest.Mock).mockImplementation(() => mockProjectDiscoveryService);
      (ReportGenerator as jest.Mock).mockImplementation(() => mockReportGenerator);
      
      const request = createMockRequest('http://localhost:3000/api/reports/generate?competitorId=competitor-123');
      
      const response = await POST(request);
      const data = await response.json();
      
      expect(response.status).toBe(500);
      expect(data.error).toContain('Report generation failed');
      expect(data.correlationId).toBe('test-correlation-id-123');
    });

    it('should validate project-competitor relationship before generation', async () => {
      const { mockProjectDiscoveryService, mockReportGenerator } = setupSuccessfulMocks();
      
      const requestBody = { projectId: 'explicit-project-id' };
      const request = createMockRequest(
        'http://localhost:3000/api/reports/generate?competitorId=competitor-123',
        requestBody
      );
      
      await POST(request);
      
      // Should validate the relationship when using explicit project ID
      expect(mockProjectDiscoveryService.validateProjectCompetitorRelationship).toHaveBeenCalled();
    });
  });

  describe('Performance and Timeout Scenarios', () => {
    it('should handle slow database queries', async () => {
      // Simulate slow database response
      (prisma.$queryRaw as jest.Mock).mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve([{ result: 1 }]), 100))
      );
      (prisma.competitor.findUnique as jest.Mock).mockResolvedValue(mockCompetitor);
      
      const { mockReportGenerator } = setupSuccessfulMocks();
      
      const request = createMockRequest('http://localhost:3000/api/reports/generate?competitorId=competitor-123');
      
      const startTime = Date.now();
      const response = await POST(request);
      const endTime = Date.now();
      
      expect(response.status).toBe(200);
      expect(endTime - startTime).toBeGreaterThan(100); // Should take at least 100ms due to slow DB
    });

    it('should handle concurrent requests with same competitor', async () => {
      const { mockReportGenerator } = setupSuccessfulMocks();
      
      const request1 = createMockRequest('http://localhost:3000/api/reports/generate?competitorId=competitor-123');
      const request2 = createMockRequest('http://localhost:3000/api/reports/generate?competitorId=competitor-123');
      
      // Execute concurrent requests
      const [response1, response2] = await Promise.all([
        POST(request1),
        POST(request2)
      ]);
      
      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);
      
      // Both should succeed with proper correlation IDs
      const data1 = await response1.json();
      const data2 = await response2.json();
      
      expect(data1.correlationId).toBeDefined();
      expect(data2.correlationId).toBeDefined();
      expect(data1.correlationId).not.toBe(data2.correlationId); // Different correlation IDs
    });
  });

  describe('Logging and Correlation Tracking', () => {
    it('should track correlation ID throughout the request flow', async () => {
      const { mockProjectDiscoveryService } = setupSuccessfulMocks();
      
      const request = createMockRequest('http://localhost:3000/api/reports/generate?competitorId=competitor-123');
      
      await POST(request);
      
      // Verify correlation tracking calls
      expect(logger.info).toHaveBeenCalledWith(
        'Report generation request received',
        expect.objectContaining({
          correlationId: 'test-correlation-id-123'
        })
      );
      
      expect(mockProjectDiscoveryService.resolveProjectId).toHaveBeenCalledWith(
        'competitor-123',
        expect.objectContaining({
          correlationId: 'test-correlation-id-123'
        })
      );
    });

    it('should log different stages of request processing', async () => {
      setupSuccessfulMocks();
      
      const request = createMockRequest('http://localhost:3000/api/reports/generate?competitorId=competitor-123');
      
      await POST(request);
      
      // Verify various logging calls were made
      expect(logger.info).toHaveBeenCalledWith(
        'Report generation request received',
        expect.any(Object)
      );
      
      expect(logger.info).toHaveBeenCalledWith(
        'Initiating automatic projectId resolution before report generation',
        expect.any(Object)
      );
      
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Competitor existence verified'),
        expect.any(Object)
      );
    });
  });

  describe('API Response Format Validation', () => {
    it('should return properly formatted success response', async () => {
      setupSuccessfulMocks();
      
      const request = createMockRequest('http://localhost:3000/api/reports/generate?competitorId=competitor-123&timeframe=30');
      
      const response = await POST(request);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data).toHaveProperty('success', true);
      expect(data).toHaveProperty('report');
      expect(data).toHaveProperty('projectResolution');
      expect(data).toHaveProperty('correlationId');
      expect(data).toHaveProperty('competitorId');
      expect(data).toHaveProperty('timeframe');
      
      expect(data.projectResolution).toHaveProperty('source');
      expect(data.projectResolution).toHaveProperty('projectId');
      expect(data.projectResolution).toHaveProperty('projectsFound');
    });

    it('should return properly formatted error response', async () => {
      const request = createMockRequest('http://localhost:3000/api/reports/generate?competitorId=');
      
      const response = await POST(request);
      const data = await response.json();
      
      expect(response.status).toBe(400);
      expect(data).toHaveProperty('message');
      expect(data).toHaveProperty('error');
      expect(data).toHaveProperty('code');
      expect(data).toHaveProperty('retryable');
      expect(data).toHaveProperty('correlationId');
      
      expect(data.error).toHaveProperty('type');
      expect(data.error).toHaveProperty('details');
      expect(data.error).toHaveProperty('guidance');
    });

    it('should return properly formatted fallback response', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ result: 1 }]);
      (prisma.competitor.findUnique as jest.Mock).mockResolvedValue(mockCompetitor);
      
      const mockProjectDiscoveryService = {
        validateProjectCompetitorRelationship: jest.fn().mockResolvedValue(true),
        resolveProjectId: jest.fn().mockResolvedValue({
          success: false,
          requiresExplicitSelection: true,
          projects: mockProjects.multiple
        })
      };
      
      (ProjectDiscoveryService as jest.Mock).mockImplementation(() => mockProjectDiscoveryService);
      
      const request = createMockRequest('http://localhost:3000/api/reports/generate?competitorId=competitor-123');
      
      const response = await POST(request);
      const data = await response.json();
      
      expect(response.status).toBe(422);
      expect(data).toHaveProperty('message');
      expect(data).toHaveProperty('fallback');
      expect(data).toHaveProperty('code');
      expect(data).toHaveProperty('retryable', true);
      expect(data).toHaveProperty('correlationId');
      expect(data).toHaveProperty('competitorId');
      
      expect(data.fallback).toHaveProperty('reason');
      expect(data.fallback).toHaveProperty('guidance');
      expect(data.fallback).toHaveProperty('availableProjects');
      expect(data.fallback.guidance).toHaveProperty('instruction');
      expect(data.fallback.guidance).toHaveProperty('example');
    });
  });

  describe('End-to-End Workflow Validation', () => {
    it('should complete full request lifecycle with automatic project resolution', async () => {
      const { mockProjectDiscoveryService, mockReportGenerator } = setupSuccessfulMocks();
      
      const request = createMockRequest('http://localhost:3000/api/reports/generate?competitorId=competitor-123&timeframe=30');
      
      const response = await POST(request);
      const data = await response.json();
      
      // Verify the complete workflow was executed in correct order
      expect(prisma.$queryRaw).toHaveBeenCalledWith(
        expect.stringContaining('SELECT 1')
      );
      
      expect(prisma.competitor.findUnique).toHaveBeenCalledWith({
        where: { id: 'competitor-123' },
        select: { id: true, name: true }
      });
      
      expect(mockProjectDiscoveryService.resolveProjectId).toHaveBeenCalledWith(
        'competitor-123',
        expect.objectContaining({
          correlationId: 'test-correlation-id-123',
          priorityRules: 'active_first',
          includeInactive: false
        })
      );
      
      expect(mockReportGenerator.generateReport).toHaveBeenCalledWith(
        'competitor-123',
        expect.objectContaining({
          projectId: 'project-single',
          timeframe: 30,
          correlationId: 'test-correlation-id-123'
        })
      );
      
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.projectResolution.source).toBe('automatic');
    });

    it('should handle complete request lifecycle with explicit project specification', async () => {
      const { mockProjectDiscoveryService, mockReportGenerator } = setupSuccessfulMocks();
      
      const requestBody = {
        projectId: 'explicit-project-id',
        reportName: 'Custom Report',
        reportOptions: 'detailed'
      };
      
      const request = createMockRequest(
        'http://localhost:3000/api/reports/generate?competitorId=competitor-123&timeframe=60',
        requestBody
      );
      
      const response = await POST(request);
      const data = await response.json();
      
      // Should validate relationship but skip automatic resolution
      expect(mockProjectDiscoveryService.validateProjectCompetitorRelationship).toHaveBeenCalled();
      expect(mockProjectDiscoveryService.resolveProjectId).not.toHaveBeenCalled();
      
      expect(mockReportGenerator.generateReport).toHaveBeenCalledWith(
        'competitor-123',
        expect.objectContaining({
          projectId: 'explicit-project-id',
          reportName: 'Custom Report',
          reportOptions: 'detailed',
          timeframe: 60
        })
      );
      
      expect(response.status).toBe(200);
      expect(data.projectResolution.source).toBe('explicit');
    });
  });
}); 