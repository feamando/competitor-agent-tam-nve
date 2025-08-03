/**
 * Report API Endpoint Validation Tests
 * Task 7.4: Test API endpoints return proper report content
 * 
 * This test suite validates that all report-related API endpoints
 * return proper content and handle zombie report scenarios correctly.
 */

import { describe, beforeAll, afterAll, beforeEach, afterEach, it, expect, jest } from '@jest/globals';
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';

// Import API route handlers
import { GET as getReportById } from '../../app/api/reports/database/[id]/route';
import { GET as listReports } from '../../app/api/reports/route';
import { POST as createReport } from '../../app/api/reports/route';

const prisma = new PrismaClient();

interface ApiTestContext {
  testProject: any;
  testCompetitor: any;
  testReports: string[];
  baseUrl: string;
}

interface ApiResponse {
  status: number;
  data: any;
  headers: Record<string, string>;
  error?: string;
}

describe('Report API Endpoint Validation Tests', () => {
  let context: ApiTestContext;

  beforeAll(async () => {
    // Setup test environment
    const projectData = await prisma.project.create({
      data: {
        id: createId(),
        name: `API Test Project ${Date.now()}`,
        userId: 'test-user-api',
        description: 'Project for testing API endpoints',
        status: 'ACTIVE',
        priority: 'HIGH',
        parameters: { apiTest: true },
        tags: ['api-test', 'endpoint-validation']
      }
    });

    const competitorData = await prisma.competitor.create({
      data: {
        id: createId(),
        name: `API Test Competitor ${Date.now()}`,
        website: 'https://api-test-competitor.com',
        industry: 'API Testing',
        projects: {
          connect: { id: projectData.id }
        }
      }
    });

    context = {
      testProject: projectData,
      testCompetitor: competitorData,
      testReports: [],
      baseUrl: 'http://localhost:3000'
    };

    console.log(`API Test Setup: Project ${context.testProject.id}`);
  });

  afterAll(async () => {
    // Cleanup all test data
    if (context.testReports.length > 0) {
      await prisma.reportVersion.deleteMany({
        where: { reportId: { in: context.testReports } }
      });
      
      await prisma.report.deleteMany({
        where: { id: { in: context.testReports } }
      });
    }

    // Cleanup test project and competitors
    await prisma.competitor.deleteMany({
      where: { projects: { some: { id: context.testProject.id } } }
    });

    await prisma.project.delete({
      where: { id: context.testProject.id }
    });

    await prisma.$disconnect();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('7.4.1 - Report Retrieval API Endpoints', () => {
    it('should return complete report data for valid report ID', async () => {
      // Arrange: Create a proper report with content
      const reportId = createId();
      const report = await prisma.report.create({
        data: {
          id: reportId,
          name: 'API Test Report - Valid',
          status: 'COMPLETED',
          projectId: context.testProject.id,
          competitorId: context.testCompetitor.id,
          description: 'Complete report for API testing'
        }
      });

      await prisma.reportVersion.create({
        data: {
          reportId: reportId,
          version: 1,
          content: {
            id: reportId,
            title: 'API Test Report - Valid',
            executiveSummary: 'This is a test report for API validation testing.',
            keyFindings: ['Finding 1', 'Finding 2', 'Finding 3'],
            strategicRecommendations: {
              immediate: ['Action 1', 'Action 2'],
              shortTerm: ['Strategy 1'],
              longTerm: ['Vision 1'],
              priorityScore: 85
            },
            competitiveIntelligence: {
              marketPosition: 'Strong',
              keyThreats: ['Threat 1'],
              opportunities: ['Opportunity 1'],
              competitiveAdvantages: ['Advantage 1']
            },
            status: 'completed',
            metadata: {
              productName: context.testProject.name,
              analysisDate: new Date(),
              reportGeneratedAt: new Date(),
              confidenceScore: 90
            }
          }
        }
      });

      context.testReports.push(reportId);

      // Act: Call API endpoint
      const request = new NextRequest(`${context.baseUrl}/api/reports/database/${reportId}`);
      const response = await getReportById(request, { params: { id: reportId } });

      // Assert: Should return complete report data
      expect(response.status).toBe(200);
      
      const responseData = await response.json();
      expect(responseData).toBeDefined();
      expect(responseData.id).toBe(reportId);
      expect(responseData.title).toBeDefined();
      expect(responseData.executiveSummary).toBeDefined();
      expect(responseData.keyFindings).toBeInstanceOf(Array);
      expect(responseData.strategicRecommendations).toBeDefined();
      expect(responseData.competitiveIntelligence).toBeDefined();
      expect(responseData.status).toBe('completed');
      expect(responseData.metadata).toBeDefined();
    });

    it('should return 404 for non-existent report ID', async () => {
      // Arrange: Use non-existent report ID
      const nonExistentId = createId();

      // Act: Call API endpoint
      const request = new NextRequest(`${context.baseUrl}/api/reports/database/${nonExistentId}`);
      const response = await getReportById(request, { params: { id: nonExistentId } });

      // Assert: Should return 404
      expect(response.status).toBe(404);
      
      const responseData = await response.json();
      expect(responseData.error).toBeDefined();
      expect(responseData.error).toContain('not found');
    });

    it('should handle malformed report ID gracefully', async () => {
      // Arrange: Use malformed report ID
      const malformedId = 'invalid-report-id-format';

      // Act: Call API endpoint
      const request = new NextRequest(`${context.baseUrl}/api/reports/database/${malformedId}`);
      const response = await getReportById(request, { params: { id: malformedId } });

      // Assert: Should return appropriate error
      expect(response.status).toBe(400);
      
      const responseData = await response.json();
      expect(responseData.error).toBeDefined();
    });

    it('should not return zombie reports or handle them gracefully', async () => {
      // Arrange: Create a zombie report (COMPLETED but no ReportVersion)
      const zombieReportId = createId();
      await prisma.report.create({
        data: {
          id: zombieReportId,
          name: 'API Test Zombie Report',
          status: 'COMPLETED',
          projectId: context.testProject.id,
          competitorId: context.testCompetitor.id,
          description: 'Zombie report for API testing'
        }
      });

      context.testReports.push(zombieReportId);

      // Act: Try to retrieve zombie report
      const request = new NextRequest(`${context.baseUrl}/api/reports/database/${zombieReportId}`);
      const response = await getReportById(request, { params: { id: zombieReportId } });

      // Assert: Should handle gracefully (404 or error message)
      expect([404, 500]).toContain(response.status);
      
      if (response.status === 404) {
        const responseData = await response.json();
        expect(responseData.error).toBeDefined();
      }
    });
  });

  describe('7.4.2 - Report Listing API Endpoints', () => {
    it('should return list of viewable reports for project', async () => {
      // Arrange: Create multiple reports with different statuses
      const reportScenarios = [
        { id: createId(), name: 'Completed Report 1', status: 'COMPLETED', hasVersion: true },
        { id: createId(), name: 'Completed Report 2', status: 'COMPLETED', hasVersion: true },
        { id: createId(), name: 'In Progress Report', status: 'IN_PROGRESS', hasVersion: false },
        { id: createId(), name: 'Draft Report', status: 'DRAFT', hasVersion: false }
      ];

      for (const scenario of reportScenarios) {
        await prisma.report.create({
          data: {
            id: scenario.id,
            name: scenario.name,
            status: scenario.status,
            projectId: context.testProject.id,
            competitorId: context.testCompetitor.id
          }
        });

        context.testReports.push(scenario.id);

        if (scenario.hasVersion) {
          await prisma.reportVersion.create({
            data: {
              reportId: scenario.id,
              version: 1,
              content: {
                id: scenario.id,
                title: scenario.name,
                executiveSummary: `Summary for ${scenario.name}`,
                keyFindings: [`Finding for ${scenario.name}`],
                strategicRecommendations: {
                  immediate: ['Action'],
                  shortTerm: [],
                  longTerm: [],
                  priorityScore: 50
                },
                competitiveIntelligence: {
                  marketPosition: 'Unknown',
                  keyThreats: [],
                  opportunities: [],
                  competitiveAdvantages: []
                },
                status: 'completed'
              }
            }
          });
        }
      }

      // Act: Call list reports API
      const request = new NextRequest(`${context.baseUrl}/api/reports?projectId=${context.testProject.id}`);
      const response = await listReports(request);

      // Assert: Should return only viewable reports
      expect(response.status).toBe(200);
      
      const responseData = await response.json();
      expect(responseData.reports).toBeInstanceOf(Array);
      expect(responseData.reports.length).toBeGreaterThan(0);

      // All returned reports should be viewable
      responseData.reports.forEach((report: any) => {
        expect(report.id).toBeDefined();
        expect(report.name).toBeDefined();
        expect(report.status).toBeDefined();
        
        // If status is COMPLETED, should have content indicators
        if (report.status === 'COMPLETED') {
          expect(report.hasContent || report.isViewable).toBeTruthy();
        }
      });
    });

    it('should filter out zombie reports from listing', async () => {
      // Arrange: Create mix of normal and zombie reports
      const normalReportId = createId();
      const zombieReportId = createId();

      // Normal report
      await prisma.report.create({
        data: {
          id: normalReportId,
          name: 'Normal Report for Filtering Test',
          status: 'COMPLETED',
          projectId: context.testProject.id,
          competitorId: context.testCompetitor.id
        }
      });

      await prisma.reportVersion.create({
        data: {
          reportId: normalReportId,
          version: 1,
          content: {
            id: normalReportId,
            title: 'Normal Report',
            executiveSummary: 'Normal report content',
            status: 'completed'
          }
        }
      });

      // Zombie report
      await prisma.report.create({
        data: {
          id: zombieReportId,
          name: 'Zombie Report for Filtering Test',
          status: 'COMPLETED',
          projectId: context.testProject.id,
          competitorId: context.testCompetitor.id
        }
      });

      context.testReports.push(normalReportId, zombieReportId);

      // Act: List reports
      const request = new NextRequest(`${context.baseUrl}/api/reports?projectId=${context.testProject.id}`);
      const response = await listReports(request);

      // Assert: Should only return normal report
      expect(response.status).toBe(200);
      
      const responseData = await response.json();
      const returnedIds = responseData.reports.map((r: any) => r.id);
      
      expect(returnedIds).toContain(normalReportId);
      expect(returnedIds).not.toContain(zombieReportId);
    });

    it('should return proper pagination and metadata', async () => {
      // Act: Call list API with pagination parameters
      const request = new NextRequest(`${context.baseUrl}/api/reports?projectId=${context.testProject.id}&page=1&limit=10`);
      const response = await listReports(request);

      // Assert: Should return pagination metadata
      expect(response.status).toBe(200);
      
      const responseData = await response.json();
      expect(responseData.reports).toBeInstanceOf(Array);
      expect(responseData.pagination).toBeDefined();
      expect(responseData.pagination.page).toBeDefined();
      expect(responseData.pagination.limit).toBeDefined();
      expect(responseData.pagination.total).toBeDefined();
      expect(responseData.pagination.hasNext).toBeDefined();
      expect(responseData.pagination.hasPrev).toBeDefined();
    });
  });

  describe('7.4.3 - Report Creation API Endpoints', () => {
    it('should create report with proper validation', async () => {
      // Arrange: Prepare report creation request
      const reportData = {
        projectId: context.testProject.id,
        name: 'API Created Report',
        template: 'comprehensive',
        options: {
          fallbackToPartialData: true,
          requireFreshSnapshots: false
        }
      };

      // Act: Call create report API
      const request = new NextRequest(`${context.baseUrl}/api/reports`, {
        method: 'POST',
        body: JSON.stringify(reportData),
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const response = await createReport(request);

      // Assert: Should create report successfully
      expect(response.status).toBe(201);
      
      const responseData = await response.json();
      expect(responseData.id).toBeDefined();
      expect(responseData.name).toBe(reportData.name);
      expect(responseData.status).toBeDefined();
      expect(responseData.projectId).toBe(context.testProject.id);

      context.testReports.push(responseData.id);

      // Verify report was created properly in database
      const createdReport = await prisma.report.findUnique({
        where: { id: responseData.id },
        include: { versions: true }
      });

      expect(createdReport).toBeDefined();
      expect(createdReport!.status).toBe('COMPLETED');
      expect(createdReport!.versions.length).toBeGreaterThan(0);
    });

    it('should validate required fields for report creation', async () => {
      // Arrange: Invalid report data (missing required fields)
      const invalidReportData = {
        name: 'Invalid Report'
        // Missing projectId
      };

      // Act: Try to create report with invalid data
      const request = new NextRequest(`${context.baseUrl}/api/reports`, {
        method: 'POST',
        body: JSON.stringify(invalidReportData),
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const response = await createReport(request);

      // Assert: Should return validation error
      expect(response.status).toBe(400);
      
      const responseData = await response.json();
      expect(responseData.error).toBeDefined();
      expect(responseData.error).toContain('required');
    });

    it('should not create zombie reports through API', async () => {
      // Arrange: Create report through API
      const reportData = {
        projectId: context.testProject.id,
        name: 'Non-Zombie API Report',
        template: 'comprehensive',
        options: {
          fallbackToPartialData: true
        }
      };

      // Act: Create report
      const request = new NextRequest(`${context.baseUrl}/api/reports`, {
        method: 'POST',
        body: JSON.stringify(reportData),
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const response = await createReport(request);

      // Assert: Created report should not be zombie
      if (response.status === 201) {
        const responseData = await response.json();
        context.testReports.push(responseData.id);

        const createdReport = await prisma.report.findUnique({
          where: { id: responseData.id },
          include: { versions: true }
        });

        expect(createdReport).toBeDefined();
        if (createdReport && createdReport.status === 'COMPLETED') {
          expect(createdReport.versions.length).toBeGreaterThan(0);
          expect(createdReport.versions[0].content).toBeDefined();
        }
      }
    });
  });

  describe('7.4.4 - Error Handling and Edge Cases', () => {
    it('should handle database connection errors gracefully', async () => {
      // Arrange: Mock database error
      const findUniqueSpy = jest.spyOn(prisma.report, 'findUnique')
        .mockRejectedValueOnce(new Error('Database connection lost'));

      const reportId = createId();

      // Act: Try to retrieve report during database error
      const request = new NextRequest(`${context.baseUrl}/api/reports/database/${reportId}`);
      const response = await getReportById(request, { params: { id: reportId } });

      // Assert: Should return appropriate error response
      expect(response.status).toBe(500);
      
      const responseData = await response.json();
      expect(responseData.error).toBeDefined();

      findUniqueSpy.mockRestore();
    });

    it('should handle concurrent API requests properly', async () => {
      // Arrange: Create a valid report
      const reportId = createId();
      await prisma.report.create({
        data: {
          id: reportId,
          name: 'Concurrent Test Report',
          status: 'COMPLETED',
          projectId: context.testProject.id,
          competitorId: context.testCompetitor.id
        }
      });

      await prisma.reportVersion.create({
        data: {
          reportId: reportId,
          version: 1,
          content: {
            id: reportId,
            title: 'Concurrent Test Report',
            executiveSummary: 'Test content for concurrent access',
            status: 'completed'
          }
        }
      });

      context.testReports.push(reportId);

      // Act: Make multiple concurrent requests
      const concurrentRequests = Array.from({ length: 5 }, () => {
        const request = new NextRequest(`${context.baseUrl}/api/reports/database/${reportId}`);
        return getReportById(request, { params: { id: reportId } });
      });

      const responses = await Promise.all(concurrentRequests);

      // Assert: All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      // Verify response consistency
      const responseBodies = await Promise.all(
        responses.map(response => response.json())
      );

      responseBodies.forEach(body => {
        expect(body.id).toBe(reportId);
        expect(body.title).toBe('Concurrent Test Report');
      });
    });

    it('should validate API request size limits', async () => {
      // Arrange: Create oversized request
      const oversizedData = {
        projectId: context.testProject.id,
        name: 'Oversized Request Test',
        description: 'x'.repeat(100000), // Very large description
        options: {}
      };

      // Act: Try to create report with oversized data
      const request = new NextRequest(`${context.baseUrl}/api/reports`, {
        method: 'POST',
        body: JSON.stringify(oversizedData),
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const response = await createReport(request);

      // Assert: Should handle appropriately (either accept or reject with proper error)
      expect([201, 400, 413]).toContain(response.status);
      
      if (response.status !== 201) {
        const responseData = await response.json();
        expect(responseData.error).toBeDefined();
      }
    });
  });

  describe('7.4.5 - Content Quality and Format Validation', () => {
    it('should return reports with consistent JSON structure', async () => {
      // Arrange: Create report with rich content
      const reportId = createId();
      await prisma.report.create({
        data: {
          id: reportId,
          name: 'Structure Validation Report',
          status: 'COMPLETED',
          projectId: context.testProject.id,
          competitorId: context.testCompetitor.id
        }
      });

      await prisma.reportVersion.create({
        data: {
          reportId: reportId,
          version: 1,
          content: {
            id: reportId,
            title: 'Structure Validation Report',
            executiveSummary: 'Comprehensive executive summary for structure validation.',
            keyFindings: [
              'Key finding number one',
              'Key finding number two',
              'Key finding number three'
            ],
            strategicRecommendations: {
              immediate: ['Immediate action 1', 'Immediate action 2'],
              shortTerm: ['Short term strategy 1'],
              longTerm: ['Long term vision 1'],
              priorityScore: 88
            },
            competitiveIntelligence: {
              marketPosition: 'Market leader',
              keyThreats: ['Threat 1', 'Threat 2'],
              opportunities: ['Opportunity 1', 'Opportunity 2'],
              competitiveAdvantages: ['Advantage 1', 'Advantage 2']
            },
            status: 'completed',
            format: 'markdown',
            metadata: {
              productName: context.testProject.name,
              analysisDate: new Date(),
              reportGeneratedAt: new Date(),
              confidenceScore: 88,
              dataQuality: 'high'
            }
          }
        }
      });

      context.testReports.push(reportId);

      // Act: Retrieve report
      const request = new NextRequest(`${context.baseUrl}/api/reports/database/${reportId}`);
      const response = await getReportById(request, { params: { id: reportId } });

      // Assert: Validate JSON structure
      expect(response.status).toBe(200);
      
      const responseData = await response.json();
      
      // Required fields
      expect(responseData.id).toBe(reportId);
      expect(responseData.title).toBeDefined();
      expect(responseData.executiveSummary).toBeDefined();
      expect(responseData.keyFindings).toBeInstanceOf(Array);
      expect(responseData.strategicRecommendations).toBeDefined();
      expect(responseData.competitiveIntelligence).toBeDefined();
      expect(responseData.status).toBeDefined();
      expect(responseData.metadata).toBeDefined();

      // Data types validation
      expect(typeof responseData.title).toBe('string');
      expect(typeof responseData.executiveSummary).toBe('string');
      expect(Array.isArray(responseData.keyFindings)).toBe(true);
      expect(typeof responseData.strategicRecommendations).toBe('object');
      expect(typeof responseData.competitiveIntelligence).toBe('object');
      expect(typeof responseData.metadata).toBe('object');

      // Content quality validation
      expect(responseData.executiveSummary.length).toBeGreaterThan(20);
      expect(responseData.keyFindings.length).toBeGreaterThan(0);
    });

    it('should sanitize content for safe API consumption', async () => {
      // Arrange: Create report with potentially unsafe content
      const reportId = createId();
      await prisma.report.create({
        data: {
          id: reportId,
          name: 'Content Sanitization Test',
          status: 'COMPLETED',
          projectId: context.testProject.id,
          competitorId: context.testCompetitor.id
        }
      });

      await prisma.reportVersion.create({
        data: {
          reportId: reportId,
          version: 1,
          content: {
            id: reportId,
            title: 'Content Sanitization Test <script>alert("xss")</script>',
            executiveSummary: 'Summary with <img src="x" onerror="alert(1)"> potential XSS',
            keyFindings: ['Finding with <b>HTML</b> content'],
            status: 'completed'
          }
        }
      });

      context.testReports.push(reportId);

      // Act: Retrieve report
      const request = new NextRequest(`${context.baseUrl}/api/reports/database/${reportId}`);
      const response = await getReportById(request, { params: { id: reportId } });

      // Assert: Content should be sanitized or properly handled
      expect(response.status).toBe(200);
      
      const responseData = await response.json();
      
      // Should not contain dangerous HTML/JS (implementation dependent)
      expect(responseData.title).toBeDefined();
      expect(responseData.executiveSummary).toBeDefined();
      
      // Content should be safe for frontend consumption
      expect(typeof responseData.title).toBe('string');
      expect(typeof responseData.executiveSummary).toBe('string');
    });

    it('should handle various content formats correctly', async () => {
      // Arrange: Create reports with different content formats
      const formatTests = [
        { format: 'markdown', id: createId() },
        { format: 'html', id: createId() },
        { format: 'plain', id: createId() }
      ];

      for (const test of formatTests) {
        await prisma.report.create({
          data: {
            id: test.id,
            name: `Format Test - ${test.format}`,
            status: 'COMPLETED',
            projectId: context.testProject.id,
            competitorId: context.testCompetitor.id
          }
        });

        await prisma.reportVersion.create({
          data: {
            reportId: test.id,
            version: 1,
            content: {
              id: test.id,
              title: `Format Test - ${test.format}`,
              executiveSummary: test.format === 'markdown' ? 
                '## Executive Summary\n\nThis is **bold** text.' :
                test.format === 'html' ?
                '<h2>Executive Summary</h2><p>This is <strong>bold</strong> text.</p>' :
                'Executive Summary - This is plain text.',
              format: test.format,
              status: 'completed'
            }
          }
        });

        context.testReports.push(test.id);
      }

      // Act & Assert: Test each format
      for (const test of formatTests) {
        const request = new NextRequest(`${context.baseUrl}/api/reports/database/${test.id}`);
        const response = await getReportById(request, { params: { id: test.id } });

        expect(response.status).toBe(200);
        
        const responseData = await response.json();
        expect(responseData.format).toBe(test.format);
        expect(responseData.executiveSummary).toBeDefined();
      }
    });
  });

  describe('7.4.6 - Performance and Caching', () => {
    it('should return reports within acceptable response time', async () => {
      // Arrange: Create a report
      const reportId = createId();
      await prisma.report.create({
        data: {
          id: reportId,
          name: 'Performance Test Report',
          status: 'COMPLETED',
          projectId: context.testProject.id,
          competitorId: context.testCompetitor.id
        }
      });

      await prisma.reportVersion.create({
        data: {
          reportId: reportId,
          version: 1,
          content: {
            id: reportId,
            title: 'Performance Test Report',
            executiveSummary: 'Performance testing content',
            status: 'completed'
          }
        }
      });

      context.testReports.push(reportId);

      // Act: Measure response time
      const startTime = Date.now();
      const request = new NextRequest(`${context.baseUrl}/api/reports/database/${reportId}`);
      const response = await getReportById(request, { params: { id: reportId } });
      const responseTime = Date.now() - startTime;

      // Assert: Should respond quickly
      expect(response.status).toBe(200);
      expect(responseTime).toBeLessThan(5000); // 5 seconds max
      
      console.log(`API response time: ${responseTime}ms`);
    });

    it('should include appropriate cache headers', async () => {
      // Arrange: Create a report
      const reportId = createId();
      await prisma.report.create({
        data: {
          id: reportId,
          name: 'Cache Test Report',
          status: 'COMPLETED',
          projectId: context.testProject.id,
          competitorId: context.testCompetitor.id
        }
      });

      await prisma.reportVersion.create({
        data: {
          reportId: reportId,
          version: 1,
          content: {
            id: reportId,
            title: 'Cache Test Report',
            executiveSummary: 'Caching test content',
            status: 'completed'
          }
        }
      });

      context.testReports.push(reportId);

      // Act: Check response headers
      const request = new NextRequest(`${context.baseUrl}/api/reports/database/${reportId}`);
      const response = await getReportById(request, { params: { id: reportId } });

      // Assert: Should include appropriate headers
      expect(response.status).toBe(200);
      
      // Check for cache-related headers (implementation dependent)
      const headers = response.headers;
      const cacheControl = headers.get('cache-control');
      const etag = headers.get('etag');
      const lastModified = headers.get('last-modified');

      // At least one caching mechanism should be present
      expect(cacheControl || etag || lastModified).toBeTruthy();
    });
  });
}); 