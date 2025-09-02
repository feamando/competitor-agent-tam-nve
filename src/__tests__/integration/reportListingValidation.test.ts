/**
 * Report Listing Validation Tests
 * Task 7.5: Validate report listing shows correct status and metadata
 * 
 * This test suite validates that report listings display accurate status,
 * metadata, and accessibility information, ensuring no zombie reports
 * appear in user interfaces.
 */

import { describe, beforeAll, afterAll, beforeEach, afterEach, it, expect, jest } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';
import { NextRequest, NextResponse } from 'next/server';

// Import components and services for testing
import { GET as listReportsAPI } from '../../app/api/reports/route';
import { ReportValidationService } from '../../lib/reportValidation';

const prisma = new PrismaClient();

interface TestReport {
  id: string;
  name: string;
  status: string;
  projectId: string;
  hasVersions: boolean;
  isViewable: boolean;
  metadata: any;
  createdAt: Date;
}

interface ListingValidationResult {
  totalReports: number;
  visibleReports: number;
  hiddenZombies: number;
  statusAccuracy: number;
  metadataCompleteness: number;
  issues: string[];
}

describe('Report Listing Validation Tests', () => {
  let testProject: any;
  let testCompetitor: any;
  let testReports: TestReport[] = [];
  let createdReportIds: string[] = [];

  beforeAll(async () => {
    // Create test project and competitor
    const projectData = await prisma.project.create({
      data: {
        id: createId(),
        name: `Listing Test Project ${Date.now()}`,
        userId: 'test-user-listing',
        description: 'Project for testing report listing validation',
        status: 'ACTIVE',
        priority: 'HIGH',
        parameters: { listingTest: true },
        tags: ['listing-test', 'validation-test']
      }
    });

    const competitorData = await prisma.competitor.create({
      data: {
        id: createId(),
        name: `Listing Test Competitor ${Date.now()}`,
        website: 'https://listing-test-competitor.com',
        industry: 'Listing Testing',
        projects: {
          connect: { id: projectData.id }
        }
      }
    });

    testProject = projectData;
    testCompetitor = competitorData;

    console.log(`Listing Test Setup: Project ${testProject.id}`);
  });

  afterAll(async () => {
    // Cleanup all test data
    if (createdReportIds.length > 0) {
      await prisma.reportVersion.deleteMany({
        where: { reportId: { in: createdReportIds } }
      });
      
      await prisma.report.deleteMany({
        where: { id: { in: createdReportIds } }
      });
    }

    // Cleanup test project and competitors
    await prisma.competitor.deleteMany({
      where: { projects: { some: { id: testProject.id } } }
    });

    await prisma.project.delete({
      where: { id: testProject.id }
    });

    await prisma.$disconnect();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('7.5.1 - Report Status Accuracy in Listings', () => {
    it('should display correct status for all report types', async () => {
      // Arrange: Create reports with different statuses
      const reportScenarios = [
        {
          name: 'Completed Report with Content',
          status: 'COMPLETED',
          hasVersion: true,
          hasContent: true,
          shouldBeVisible: true,
          expectedStatusDisplay: 'COMPLETED'
        },
        {
          name: 'In Progress Report',
          status: 'IN_PROGRESS',
          hasVersion: false,
          hasContent: false,
          shouldBeVisible: true,
          expectedStatusDisplay: 'IN_PROGRESS'
        },
        {
          name: 'Draft Report',
          status: 'DRAFT',
          hasVersion: false,
          hasContent: false,
          shouldBeVisible: true,
          expectedStatusDisplay: 'DRAFT'
        },
        {
          name: 'Failed Report',
          status: 'FAILED',
          hasVersion: false,
          hasContent: false,
          shouldBeVisible: true,
          expectedStatusDisplay: 'FAILED'
        },
        {
          name: 'Zombie Report (should be hidden)',
          status: 'COMPLETED',
          hasVersion: false,
          hasContent: false,
          shouldBeVisible: false,
          expectedStatusDisplay: null
        }
      ];

      const createdReports: any[] = [];

      for (const scenario of reportScenarios) {
        const reportId = createId();
        
        // Create report
        const report = await prisma.report.create({
          data: {
            id: reportId,
            name: scenario.name,
            status: scenario.status,
            projectId: testProject.id,
            competitorId: testCompetitor.id,
            description: `Test report for status validation: ${scenario.name}`,
            dataCompletenessScore: scenario.hasContent ? 85 : null,
            dataFreshness: scenario.hasContent ? 'recent' : null
          }
        });

        createdReportIds.push(reportId);
        createdReports.push({ ...scenario, id: reportId, actualReport: report });

        // Create version if needed
        if (scenario.hasVersion && scenario.hasContent) {
          await prisma.reportVersion.create({
            data: {
              reportId: reportId,
              version: 1,
              content: {
                id: reportId,
                title: scenario.name,
                executiveSummary: `Executive summary for ${scenario.name}`,
                keyFindings: [`Key finding for ${scenario.name}`],
                strategicRecommendations: {
                  immediate: ['Action item'],
                  shortTerm: [],
                  longTerm: [],
                  priorityScore: 75
                },
                competitiveIntelligence: {
                  marketPosition: 'Test position',
                  keyThreats: [],
                  opportunities: [],
                  competitiveAdvantages: []
                },
                status: 'completed',
                metadata: {
                  productName: testProject.name,
                  analysisDate: new Date(),
                  reportGeneratedAt: new Date(),
                  confidenceScore: 85
                }
              }
            }
          });
        }
      }

      // Act: Get report listing
      const request = new NextRequest(`http://localhost:3000/api/reports?projectId=${testProject.id}`);
      const response = await listReportsAPI(request);

      // Assert: Validate status accuracy
      expect(response.status).toBe(200);
      
      const responseData = await response.json();
      expect(responseData.reports).toBeInstanceOf(Array);

      // Check each expected visible report
      const visibleScenarios = reportScenarios.filter(s => s.shouldBeVisible);
      const hiddenScenarios = reportScenarios.filter(s => !s.shouldBeVisible);

      // Verify visible reports appear with correct status
      for (const scenario of visibleScenarios) {
        const reportInListing = responseData.reports.find((r: any) => r.name === scenario.name);
        expect(reportInListing).toBeDefined();
        
        if (reportInListing) {
          expect(reportInListing.status).toBe(scenario.expectedStatusDisplay);
          expect(reportInListing.id).toBeDefined();
          expect(reportInListing.name).toBe(scenario.name);
        }
      }

      // Verify hidden reports (zombies) don't appear
      for (const scenario of hiddenScenarios) {
        const reportInListing = responseData.reports.find((r: any) => r.name === scenario.name);
        expect(reportInListing).toBeUndefined();
      }

      console.log(`✅ Validated ${visibleScenarios.length} visible reports, ${hiddenScenarios.length} hidden zombies`);
    });

    it('should show consistent status between listing and detail views', async () => {
      // Arrange: Create a report
      const reportId = createId();
      await prisma.report.create({
        data: {
          id: reportId,
          name: 'Status Consistency Test Report',
          status: 'COMPLETED',
          projectId: testProject.id,
          competitorId: testCompetitor.id,
          dataCompletenessScore: 90,
          dataFreshness: 'recent'
        }
      });

      await prisma.reportVersion.create({
        data: {
          reportId: reportId,
          version: 1,
          content: {
            id: reportId,
            title: 'Status Consistency Test Report',
            executiveSummary: 'Test content for status consistency',
            status: 'completed'
          }
        }
      });

      createdReportIds.push(reportId);

      // Act: Get both listing and detail views
      const listingRequest = new NextRequest(`http://localhost:3000/api/reports?projectId=${testProject.id}`);
      const listingResponse = await listReportsAPI(listingRequest);

      const detailReport = await prisma.report.findUnique({
        where: { id: reportId },
        include: { versions: true }
      });

      // Assert: Status should be consistent
      expect(listingResponse.status).toBe(200);
      
      const listingData = await listingResponse.json();
      const reportInListing = listingData.reports.find((r: any) => r.id === reportId);

      expect(reportInListing).toBeDefined();
      expect(detailReport).toBeDefined();

      if (reportInListing && detailReport) {
        expect(reportInListing.status).toBe(detailReport.status);
        
        // Version content status should also be consistent
        if (detailReport.versions.length > 0) {
          const versionContent = detailReport.versions[0].content as any;
          expect(versionContent.status).toBe('completed');
        }
      }
    });

    it('should handle status transitions correctly in listings', async () => {
      // Arrange: Create report in draft status
      const reportId = createId();
      let report = await prisma.report.create({
        data: {
          id: reportId,
          name: 'Status Transition Test Report',
          status: 'DRAFT',
          projectId: testProject.id,
          competitorId: testCompetitor.id
        }
      });

      createdReportIds.push(reportId);

      // Act 1: Check initial status in listing
      let request = new NextRequest(`http://localhost:3000/api/reports?projectId=${testProject.id}`);
      let response = await listReportsAPI(request);
      let responseData = await response.json();
      let reportInListing = responseData.reports.find((r: any) => r.id === reportId);

      // Assert 1: Should show as DRAFT
      expect(reportInListing).toBeDefined();
      expect(reportInListing?.status).toBe('DRAFT');

      // Act 2: Update to IN_PROGRESS
      await prisma.report.update({
        where: { id: reportId },
        data: { status: 'IN_PROGRESS' }
      });

      request = new NextRequest(`http://localhost:3000/api/reports?projectId=${testProject.id}`);
      response = await listReportsAPI(request);
      responseData = await response.json();
      reportInListing = responseData.reports.find((r: any) => r.id === reportId);

      // Assert 2: Should show as IN_PROGRESS
      expect(reportInListing?.status).toBe('IN_PROGRESS');

      // Act 3: Complete with content
      await prisma.report.update({
        where: { id: reportId },
        data: { status: 'COMPLETED' }
      });

      await prisma.reportVersion.create({
        data: {
          reportId: reportId,
          version: 1,
          content: {
            id: reportId,
            title: 'Status Transition Test Report',
            executiveSummary: 'Now completed with content',
            status: 'completed'
          }
        }
      });

      request = new NextRequest(`http://localhost:3000/api/reports?projectId=${testProject.id}`);
      response = await listReportsAPI(request);
      responseData = await response.json();
      reportInListing = responseData.reports.find((r: any) => r.id === reportId);

      // Assert 3: Should show as COMPLETED
      expect(reportInListing?.status).toBe('COMPLETED');
    });
  });

  describe('7.5.2 - Metadata Accuracy and Completeness', () => {
    it('should display complete and accurate metadata for all reports', async () => {
      // Arrange: Create reports with rich metadata
      const reportWithMetadata = createId();
      await prisma.report.create({
        data: {
          id: reportWithMetadata,
          name: 'Rich Metadata Report',
          status: 'COMPLETED',
          projectId: testProject.id,
          competitorId: testCompetitor.id,
          description: 'Report with comprehensive metadata',
          dataCompletenessScore: 95,
          dataFreshness: 'recent',
          isInitialReport: true,
          generationStartTime: new Date(Date.now() - 300000), // 5 minutes ago
          generationEndTime: new Date(Date.now() - 60000), // 1 minute ago
          tags: ['comprehensive', 'high-priority']
        }
      });

      await prisma.reportVersion.create({
        data: {
          reportId: reportWithMetadata,
          version: 1,
          content: {
            id: reportWithMetadata,
            title: 'Rich Metadata Report',
            executiveSummary: 'Comprehensive report with full metadata',
            keyFindings: ['Finding 1', 'Finding 2'],
            status: 'completed',
            metadata: {
              productName: testProject.name,
              analysisDate: new Date(),
              reportGeneratedAt: new Date(),
              confidenceScore: 95,
              dataQuality: 'excellent',
              analysisMethod: 'comprehensive',
              reportVersion: '1.0',
              focusAreas: ['market-analysis', 'competitive-intelligence'],
              analysisDepth: 'deep'
            }
          }
        }
      });

      createdReportIds.push(reportWithMetadata);

      // Act: Get report listing
      const request = new NextRequest(`http://localhost:3000/api/reports?projectId=${testProject.id}`);
      const response = await listReportsAPI(request);

      // Assert: Validate metadata display
      expect(response.status).toBe(200);
      
      const responseData = await response.json();
      const reportInListing = responseData.reports.find((r: any) => r.id === reportWithMetadata);

      expect(reportInListing).toBeDefined();
      if (reportInListing) {
        // Core metadata
        expect(reportInListing.id).toBe(reportWithMetadata);
        expect(reportInListing.name).toBe('Rich Metadata Report');
        expect(reportInListing.status).toBe('COMPLETED');
        expect(reportInListing.projectId).toBe(testProject.id);

        // Quality indicators
        expect(reportInListing.dataCompletenessScore).toBe(95);
        expect(reportInListing.dataFreshness).toBe('recent');
        expect(reportInListing.isInitialReport).toBe(true);

        // Timestamps
        expect(reportInListing.createdAt).toBeDefined();
        expect(reportInListing.updatedAt).toBeDefined();
        expect(reportInListing.generationStartTime).toBeDefined();
        expect(reportInListing.generationEndTime).toBeDefined();

        // Additional metadata
        expect(reportInListing.description).toBeDefined();
        expect(reportInListing.tags).toBeInstanceOf(Array);
        expect(reportInListing.tags).toContain('comprehensive');
      }
    });

    it('should show viewability indicators accurately', async () => {
      // Arrange: Create reports with different viewability states
      const testScenarios = [
        {
          id: createId(),
          name: 'Fully Viewable Report',
          hasVersion: true,
          hasContent: true,
          expectedViewable: true
        },
        {
          id: createId(),
          name: 'No Content Report',
          hasVersion: true,
          hasContent: false,
          expectedViewable: false
        },
        {
          id: createId(),
          name: 'No Version Report',
          hasVersion: false,
          hasContent: false,
          expectedViewable: false
        }
      ];

      for (const scenario of testScenarios) {
        await prisma.report.create({
          data: {
            id: scenario.id,
            name: scenario.name,
            status: 'COMPLETED',
            projectId: testProject.id,
            competitorId: testCompetitor.id
          }
        });

        createdReportIds.push(scenario.id);

        if (scenario.hasVersion) {
          await prisma.reportVersion.create({
            data: {
              reportId: scenario.id,
              version: 1,
              content: scenario.hasContent ? {
                id: scenario.id,
                title: scenario.name,
                executiveSummary: 'Test content',
                status: 'completed'
              } : null
            }
          });
        }
      }

      // Act: Get listings and check viewability
      const request = new NextRequest(`http://localhost:3000/api/reports?projectId=${testProject.id}`);
      const response = await listReportsAPI(request);

      // Assert: Validate viewability indicators
      expect(response.status).toBe(200);
      
      const responseData = await response.json();

      for (const scenario of testScenarios) {
        const reportInListing = responseData.reports.find((r: any) => r.id === scenario.id);
        
        if (scenario.expectedViewable) {
          expect(reportInListing).toBeDefined();
          if (reportInListing) {
            expect(reportInListing.isViewable || reportInListing.hasContent).toBeTruthy();
          }
        } else {
          // Non-viewable reports should either be hidden or marked as non-viewable
          if (reportInListing) {
            expect(reportInListing.isViewable || reportInListing.hasContent).toBeFalsy();
          }
        }
      }
    });

    it('should display generation performance metrics', async () => {
      // Arrange: Create report with performance data
      const performanceReportId = createId();
      const startTime = new Date(Date.now() - 180000); // 3 minutes ago
      const endTime = new Date(Date.now() - 60000); // 1 minute ago

      await prisma.report.create({
        data: {
          id: performanceReportId,
          name: 'Performance Metrics Report',
          status: 'COMPLETED',
          projectId: testProject.id,
          competitorId: testCompetitor.id,
          generationStartTime: startTime,
          generationEndTime: endTime,
          dataCompletenessScore: 88
        }
      });

      await prisma.reportVersion.create({
        data: {
          reportId: performanceReportId,
          version: 1,
          content: {
            id: performanceReportId,
            title: 'Performance Metrics Report',
            executiveSummary: 'Report with performance tracking',
            status: 'completed',
            metadata: {
              generationDuration: 120000, // 2 minutes
              dataCollectionTime: 45000,
              analysisTime: 30000,
              reportGeneratedAt: endTime
            }
          }
        }
      });

      createdReportIds.push(performanceReportId);

      // Act: Get listing
      const request = new NextRequest(`http://localhost:3000/api/reports?projectId=${testProject.id}`);
      const response = await listReportsAPI(request);

      // Assert: Performance data should be available
      expect(response.status).toBe(200);
      
      const responseData = await response.json();
      const reportInListing = responseData.reports.find((r: any) => r.id === performanceReportId);

      expect(reportInListing).toBeDefined();
      if (reportInListing) {
        expect(reportInListing.generationStartTime).toBeDefined();
        expect(reportInListing.generationEndTime).toBeDefined();
        
        // Calculate duration from timestamps
        const listedStartTime = new Date(reportInListing.generationStartTime);
        const listedEndTime = new Date(reportInListing.generationEndTime);
        const duration = listedEndTime.getTime() - listedStartTime.getTime();
        
        expect(duration).toBeGreaterThan(0);
        expect(duration).toBeLessThan(300000); // Less than 5 minutes
      }
    });
  });

  describe('7.5.3 - Zombie Report Filtering and Hiding', () => {
    it('should completely hide zombie reports from listings', async () => {
      // Arrange: Create mixed normal and zombie reports
      const normalReportId = createId();
      const zombieReportId1 = createId();
      const zombieReportId2 = createId();

      // Create normal report
      await prisma.report.create({
        data: {
          id: normalReportId,
          name: 'Normal Report for Filtering Test',
          status: 'COMPLETED',
          projectId: testProject.id,
          competitorId: testCompetitor.id
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

      // Create zombie reports (COMPLETED but no ReportVersions)
      await prisma.report.create({
        data: {
          id: zombieReportId1,
          name: 'Zombie Report 1',
          status: 'COMPLETED',
          projectId: testProject.id,
          competitorId: testCompetitor.id
        }
      });

      await prisma.report.create({
        data: {
          id: zombieReportId2,
          name: 'Zombie Report 2',
          status: 'COMPLETED',
          projectId: testProject.id,
          competitorId: testCompetitor.id
        }
      });

      createdReportIds.push(normalReportId, zombieReportId1, zombieReportId2);

      // Act: Get report listing
      const request = new NextRequest(`http://localhost:3000/api/reports?projectId=${testProject.id}`);
      const response = await listReportsAPI(request);

      // Assert: Only normal report should appear
      expect(response.status).toBe(200);
      
      const responseData = await response.json();
      const reportIds = responseData.reports.map((r: any) => r.id);

      expect(reportIds).toContain(normalReportId);
      expect(reportIds).not.toContain(zombieReportId1);
      expect(reportIds).not.toContain(zombieReportId2);

      // Verify count accuracy
      const normalReportsInListing = responseData.reports.filter((r: any) => 
        r.status === 'COMPLETED' && r.id === normalReportId
      );
      expect(normalReportsInListing.length).toBe(1);

      console.log(`✅ Successfully filtered out zombie reports from listing`);
    });

    it('should maintain accurate counts despite hidden zombie reports', async () => {
      // Arrange: Create known set of reports
      const visibleReports = [];
      const hiddenZombies = [];

      // Create 3 visible reports
      for (let i = 1; i <= 3; i++) {
        const reportId = createId();
        await prisma.report.create({
          data: {
            id: reportId,
            name: `Visible Report ${i}`,
            status: 'COMPLETED',
            projectId: testProject.id,
            competitorId: testCompetitor.id
          }
        });

        await prisma.reportVersion.create({
          data: {
            reportId: reportId,
            version: 1,
            content: {
              id: reportId,
              title: `Visible Report ${i}`,
              executiveSummary: `Content for visible report ${i}`,
              status: 'completed'
            }
          }
        });

        visibleReports.push(reportId);
        createdReportIds.push(reportId);
      }

      // Create 2 zombie reports
      for (let i = 1; i <= 2; i++) {
        const zombieId = createId();
        await prisma.report.create({
          data: {
            id: zombieId,
            name: `Hidden Zombie ${i}`,
            status: 'COMPLETED',
            projectId: testProject.id,
            competitorId: testCompetitor.id
          }
        });

        hiddenZombies.push(zombieId);
        createdReportIds.push(zombieId);
      }

      // Act: Get listing with count information
      const request = new NextRequest(`http://localhost:3000/api/reports?projectId=${testProject.id}`);
      const response = await listReportsAPI(request);

      // Assert: Counts should reflect only visible reports
      expect(response.status).toBe(200);
      
      const responseData = await response.json();
      
      expect(responseData.reports.length).toBe(visibleReports.length);
      expect(responseData.pagination?.total).toBe(visibleReports.length);

      // Verify no zombies in results
      const returnedIds = responseData.reports.map((r: any) => r.id);
      hiddenZombies.forEach(zombieId => {
        expect(returnedIds).not.toContain(zombieId);
      });

      visibleReports.forEach(visibleId => {
        expect(returnedIds).toContain(visibleId);
      });
    });

    it('should handle edge cases in zombie detection', async () => {
      // Arrange: Create edge case scenarios
      const edgeCases = [
        {
          id: createId(),
          name: 'Empty Content Version',
          hasVersion: true,
          contentIsNull: true,
          shouldBeHidden: true
        },
        {
          id: createId(),
          name: 'Malformed Content Version',
          hasVersion: true,
          contentIsMalformed: true,
          shouldBeHidden: false // Malformed but present content should still show
        },
        {
          id: createId(),
          name: 'Valid Content Version',
          hasVersion: true,
          contentIsValid: true,
          shouldBeHidden: false
        }
      ];

      for (const edgeCase of edgeCases) {
        await prisma.report.create({
          data: {
            id: edgeCase.id,
            name: edgeCase.name,
            status: 'COMPLETED',
            projectId: testProject.id,
            competitorId: testCompetitor.id
          }
        });

        createdReportIds.push(edgeCase.id);

        if (edgeCase.hasVersion) {
          let content = null;
          
          if (edgeCase.contentIsNull) {
            content = null;
          } else if (edgeCase.contentIsMalformed) {
            content = { incomplete: 'data' }; // Missing required fields
          } else if (edgeCase.contentIsValid) {
            content = {
              id: edgeCase.id,
              title: edgeCase.name,
              executiveSummary: 'Valid content',
              status: 'completed'
            };
          }

          await prisma.reportVersion.create({
            data: {
              reportId: edgeCase.id,
              version: 1,
              content: content
            }
          });
        }
      }

      // Act: Get listing
      const request = new NextRequest(`http://localhost:3000/api/reports?projectId=${testProject.id}`);
      const response = await listReportsAPI(request);

      // Assert: Validate edge case handling
      expect(response.status).toBe(200);
      
      const responseData = await response.json();
      const returnedIds = responseData.reports.map((r: any) => r.id);

      for (const edgeCase of edgeCases) {
        if (edgeCase.shouldBeHidden) {
          expect(returnedIds).not.toContain(edgeCase.id);
        } else {
          expect(returnedIds).toContain(edgeCase.id);
        }
      }
    });
  });

  describe('7.5.4 - Pagination and Sorting Accuracy', () => {
    it('should handle pagination correctly with zombie filtering', async () => {
      // Arrange: Create more reports than page size
      const pageSize = 5;
      const totalVisibleReports = 8;
      const totalZombieReports = 3;

      const visibleIds: string[] = [];
      const zombieIds: string[] = [];

      // Create visible reports
      for (let i = 1; i <= totalVisibleReports; i++) {
        const reportId = createId();
        await prisma.report.create({
          data: {
            id: reportId,
            name: `Pagination Test Report ${i.toString().padStart(2, '0')}`,
            status: 'COMPLETED',
            projectId: testProject.id,
            competitorId: testCompetitor.id,
            createdAt: new Date(Date.now() - (i * 60000)) // Stagger creation times
          }
        });

        await prisma.reportVersion.create({
          data: {
            reportId: reportId,
            version: 1,
            content: {
              id: reportId,
              title: `Pagination Test Report ${i.toString().padStart(2, '0')}`,
              executiveSummary: `Content for pagination test ${i}`,
              status: 'completed'
            }
          }
        });

        visibleIds.push(reportId);
        createdReportIds.push(reportId);
      }

      // Create zombie reports (should not affect pagination)
      for (let i = 1; i <= totalZombieReports; i++) {
        const zombieId = createId();
        await prisma.report.create({
          data: {
            id: zombieId,
            name: `Pagination Zombie ${i}`,
            status: 'COMPLETED',
            projectId: testProject.id,
            competitorId: testCompetitor.id
          }
        });

        zombieIds.push(zombieId);
        createdReportIds.push(zombieId);
      }

      // Act: Test pagination
      const page1Request = new NextRequest(`http://localhost:3000/api/reports?projectId=${testProject.id}&page=1&limit=${pageSize}`);
      const page1Response = await listReportsAPI(page1Request);

      const page2Request = new NextRequest(`http://localhost:3000/api/reports?projectId=${testProject.id}&page=2&limit=${pageSize}`);
      const page2Response = await listReportsAPI(page2Request);

      // Assert: Pagination should work correctly
      expect(page1Response.status).toBe(200);
      expect(page2Response.status).toBe(200);

      const page1Data = await page1Response.json();
      const page2Data = await page2Response.json();

      // Page 1 should have full page
      expect(page1Data.reports.length).toBe(pageSize);
      expect(page1Data.pagination.page).toBe(1);
      expect(page1Data.pagination.total).toBe(totalVisibleReports);
      expect(page1Data.pagination.hasNext).toBe(true);

      // Page 2 should have remaining reports
      expect(page2Data.reports.length).toBe(totalVisibleReports - pageSize);
      expect(page2Data.pagination.page).toBe(2);
      expect(page2Data.pagination.total).toBe(totalVisibleReports);
      expect(page2Data.pagination.hasNext).toBe(false);

      // No zombies should appear in either page
      const allReturnedIds = [
        ...page1Data.reports.map((r: any) => r.id),
        ...page2Data.reports.map((r: any) => r.id)
      ];

      zombieIds.forEach(zombieId => {
        expect(allReturnedIds).not.toContain(zombieId);
      });
    });

    it('should sort reports correctly by various criteria', async () => {
      // Arrange: Create reports with different sortable attributes
      const sortTestReports = [
        {
          id: createId(),
          name: 'Alpha Report',
          createdAt: new Date(Date.now() - 300000),
          dataCompletenessScore: 70
        },
        {
          id: createId(),
          name: 'Beta Report',
          createdAt: new Date(Date.now() - 200000),
          dataCompletenessScore: 90
        },
        {
          id: createId(),
          name: 'Gamma Report',
          createdAt: new Date(Date.now() - 100000),
          dataCompletenessScore: 80
        }
      ];

      for (const testReport of sortTestReports) {
        await prisma.report.create({
          data: {
            id: testReport.id,
            name: testReport.name,
            status: 'COMPLETED',
            projectId: testProject.id,
            competitorId: testCompetitor.id,
            createdAt: testReport.createdAt,
            dataCompletenessScore: testReport.dataCompletenessScore
          }
        });

        await prisma.reportVersion.create({
          data: {
            reportId: testReport.id,
            version: 1,
            content: {
              id: testReport.id,
              title: testReport.name,
              executiveSummary: `Content for ${testReport.name}`,
              status: 'completed'
            }
          }
        });

        createdReportIds.push(testReport.id);
      }

      // Act & Assert: Test different sort orders
      
      // Sort by creation date (newest first)
      const dateRequest = new NextRequest(`http://localhost:3000/api/reports?projectId=${testProject.id}&sortBy=createdAt&sortOrder=desc`);
      const dateResponse = await listReportsAPI(dateRequest);
      const dateData = await dateResponse.json();

      expect(dateData.reports[0].name).toBe('Gamma Report'); // Most recent
      expect(dateData.reports[2].name).toBe('Alpha Report'); // Oldest

      // Sort by name (alphabetical)
      const nameRequest = new NextRequest(`http://localhost:3000/api/reports?projectId=${testProject.id}&sortBy=name&sortOrder=asc`);
      const nameResponse = await listReportsAPI(nameRequest);
      const nameData = await nameResponse.json();

      expect(nameData.reports[0].name).toBe('Alpha Report');
      expect(nameData.reports[1].name).toBe('Beta Report');
      expect(nameData.reports[2].name).toBe('Gamma Report');

      // Sort by data completeness (highest first)
      const scoreRequest = new NextRequest(`http://localhost:3000/api/reports?projectId=${testProject.id}&sortBy=dataCompletenessScore&sortOrder=desc`);
      const scoreResponse = await listReportsAPI(scoreRequest);
      const scoreData = await scoreResponse.json();

      expect(scoreData.reports[0].dataCompletenessScore).toBe(90); // Beta Report
      expect(scoreData.reports[1].dataCompletenessScore).toBe(80); // Gamma Report
      expect(scoreData.reports[2].dataCompletenessScore).toBe(70); // Alpha Report
    });
  });

  describe('7.5.5 - Real-time Updates and Consistency', () => {
    it('should reflect report status changes immediately in listings', async () => {
      // Arrange: Create report in progress
      const reportId = createId();
      await prisma.report.create({
        data: {
          id: reportId,
          name: 'Real-time Update Test',
          status: 'IN_PROGRESS',
          projectId: testProject.id,
          competitorId: testCompetitor.id
        }
      });

      createdReportIds.push(reportId);

      // Act 1: Check initial status
      let request = new NextRequest(`http://localhost:3000/api/reports?projectId=${testProject.id}`);
      let response = await listReportsAPI(request);
      let responseData = await response.json();
      let reportInListing = responseData.reports.find((r: any) => r.id === reportId);

      // Assert 1: Should show as IN_PROGRESS
      expect(reportInListing).toBeDefined();
      expect(reportInListing?.status).toBe('IN_PROGRESS');

      // Act 2: Complete the report
      await prisma.report.update({
        where: { id: reportId },
        data: { status: 'COMPLETED' }
      });

      await prisma.reportVersion.create({
        data: {
          reportId: reportId,
          version: 1,
          content: {
            id: reportId,
            title: 'Real-time Update Test',
            executiveSummary: 'Now completed and viewable',
            status: 'completed'
          }
        }
      });

      // Act 3: Recheck listing
      request = new NextRequest(`http://localhost:3000/api/reports?projectId=${testProject.id}`);
      response = await listReportsAPI(request);
      responseData = await response.json();
      reportInListing = responseData.reports.find((r: any) => r.id === reportId);

      // Assert 3: Should now show as COMPLETED
      expect(reportInListing?.status).toBe('COMPLETED');
      expect(reportInListing?.isViewable || reportInListing?.hasContent).toBeTruthy();
    });

    it('should maintain data consistency across multiple concurrent requests', async () => {
      // Arrange: Create multiple reports
      const concurrentReportIds: string[] = [];
      
      for (let i = 1; i <= 5; i++) {
        const reportId = createId();
        await prisma.report.create({
          data: {
            id: reportId,
            name: `Concurrent Test Report ${i}`,
            status: 'COMPLETED',
            projectId: testProject.id,
            competitorId: testCompetitor.id
          }
        });

        await prisma.reportVersion.create({
          data: {
            reportId: reportId,
            version: 1,
            content: {
              id: reportId,
              title: `Concurrent Test Report ${i}`,
              executiveSummary: `Content for concurrent test ${i}`,
              status: 'completed'
            }
          }
        });

        concurrentReportIds.push(reportId);
        createdReportIds.push(reportId);
      }

      // Act: Make multiple concurrent requests
      const concurrentRequests = Array.from({ length: 10 }, () => {
        const request = new NextRequest(`http://localhost:3000/api/reports?projectId=${testProject.id}`);
        return listReportsAPI(request);
      });

      const responses = await Promise.all(concurrentRequests);

      // Assert: All responses should be consistent
      const responseBodies = await Promise.all(
        responses.map(response => response.json())
      );

      // All responses should have same structure
      responseBodies.forEach(body => {
        expect(body.reports).toBeInstanceOf(Array);
        expect(body.pagination).toBeDefined();
      });

      // All responses should contain the same reports
      const firstResponseIds = responseBodies[0].reports.map((r: any) => r.id).sort();
      responseBodies.forEach(body => {
        const responseIds = body.reports.map((r: any) => r.id).sort();
        expect(responseIds).toEqual(firstResponseIds);
      });

      // All concurrent test reports should be present
      concurrentReportIds.forEach(reportId => {
        expect(firstResponseIds).toContain(reportId);
      });
    });
  });

  describe('7.5.6 - System Integration Validation', () => {
    it('should integrate properly with zombie report monitoring', async () => {
      // Act: Run zombie detection
      const zombieDetectionResult = await ReportValidationService.detectZombieReports(testProject.id);

      // Get current listing
      const request = new NextRequest(`http://localhost:3000/api/reports?projectId=${testProject.id}`);
      const response = await listReportsAPI(request);
      const listingData = await response.json();

      // Assert: No zombies should appear in listing if detected by monitoring
      if (zombieDetectionResult.zombiesFound > 0) {
        const zombieIds = zombieDetectionResult.reports.map(r => r.reportId);
        const listingIds = listingData.reports.map((r: any) => r.id);

        zombieIds.forEach(zombieId => {
          expect(listingIds).not.toContain(zombieId);
        });
      }

      // All reports in listing should pass validation
      for (const listedReport of listingData.reports) {
        if (listedReport.status === 'COMPLETED') {
          const validationResult = await ReportValidationService.validateReportIntegrity(
            listedReport.id,
            testProject.id
          );
          expect(validationResult.isValid).toBe(true);
        }
      }
    });

    it('should provide complete system health overview', async () => {
      // Act: Get comprehensive listing data
      const request = new NextRequest(`http://localhost:3000/api/reports?projectId=${testProject.id}&includeHealthMetrics=true`);
      const response = await listReportsAPI(request);

      // Assert: Should provide health overview
      expect(response.status).toBe(200);
      
      const responseData = await response.json();
      
      // Basic structure validation
      expect(responseData.reports).toBeInstanceOf(Array);
      expect(responseData.pagination).toBeDefined();

      // Health metrics (if implemented)
      if (responseData.healthMetrics) {
        expect(responseData.healthMetrics.totalReports).toBeGreaterThanOrEqual(0);
        expect(responseData.healthMetrics.viewableReports).toBeGreaterThanOrEqual(0);
        expect(responseData.healthMetrics.zombieReports).toBe(0); // Should be 0 after fixes
      }

      // All returned reports should be in valid state
      responseData.reports.forEach((report: any) => {
        expect(report.id).toBeDefined();
        expect(report.name).toBeDefined();
        expect(report.status).toBeDefined();
        expect(['DRAFT', 'IN_PROGRESS', 'COMPLETED', 'FAILED']).toContain(report.status);
      });

      console.log(`✅ System health validation complete: ${responseData.reports.length} reports listed`);
    });
  });
}); 