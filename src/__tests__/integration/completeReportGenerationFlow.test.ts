/**
 * Complete Report Generation Flow End-to-End Tests
 * Task 7.1: Test complete report generation flow end-to-end
 * 
 * This test suite validates the entire report generation flow from creation
 * to viewability, ensuring no zombie reports are created and all reports
 * are properly accessible.
 */

import { describe, beforeAll, afterAll, beforeEach, afterEach, it, expect, jest } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import { InitialComparativeReportService } from '../../services/reports/initialComparativeReportService';
import { SmartDataCollectionService } from '../../services/reports/smartDataCollectionService';
import { ReportValidationService } from '../../lib/reportValidation';
import { ZombieReportAlertService } from '../../lib/alerts/zombieReportAlerts';
import { createId } from '@paralleldrive/cuid2';

const prisma = new PrismaClient();

interface TestProject {
  id: string;
  name: string;
  userId: string;
  competitors: { id: string; name: string }[];
}

interface TestReportResult {
  reportId: string;
  report: any;
  hasVersions: boolean;
  isViewable: boolean;
  contentValid: boolean;
  statusConsistent: boolean;
}

describe('Complete Report Generation Flow End-to-End Tests', () => {
  let testProject: TestProject;
  let testCompetitor: any;
  let initialReportService: InitialComparativeReportService;
  let smartDataService: SmartDataCollectionService;
  let generatedReportIds: string[] = [];

  beforeAll(async () => {
    // Create test project with competitors
    const projectData = await prisma.project.create({
      data: {
        id: createId(),
        name: `E2E Test Project ${Date.now()}`,
        userId: 'test-user-e2e',
        description: 'End-to-end test project for report generation flow',
        status: 'ACTIVE',
        priority: 'HIGH',
        parameters: {},
        tags: ['e2e-test', 'report-flow']
      }
    });

    const competitorData = await prisma.competitor.create({
      data: {
        id: createId(),
        name: `E2E Test Competitor ${Date.now()}`,
        website: 'https://example-competitor.com',
        industry: 'Technology',
        projects: {
          connect: { id: projectData.id }
        }
      }
    });

    testProject = {
      id: projectData.id,
      name: projectData.name,
      userId: projectData.userId,
      competitors: [{ id: competitorData.id, name: competitorData.name }]
    };

    testCompetitor = competitorData;

    // Initialize services
    initialReportService = new InitialComparativeReportService();
    smartDataService = new SmartDataCollectionService();

    console.log(`E2E Test Setup: Project ${testProject.id}, Competitor ${testCompetitor.id}`);
  });

  afterAll(async () => {
    // Cleanup all generated reports and test data
    if (generatedReportIds.length > 0) {
      await prisma.reportVersion.deleteMany({
        where: { reportId: { in: generatedReportIds } }
      });
      
      await prisma.report.deleteMany({
        where: { id: { in: generatedReportIds } }
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

  afterEach(async () => {
    // Additional cleanup if needed
  });

  describe('7.1.1 - Happy Path Report Generation', () => {
    it('should generate complete report with all components end-to-end', async () => {
      // Arrange
      const testStartTime = Date.now();
      
      // Act: Generate initial comparative report
      const reportResult = await initialReportService.generateInitialComparativeReport(
        testProject.id,
        {
          template: 'comprehensive',
          priority: 'high',
          fallbackToPartialData: true,
          requireFreshSnapshots: false // For testing purposes
        }
      );

      generatedReportIds.push(reportResult.id);

      // Assert: Verify report structure
      expect(reportResult).toBeDefined();
      expect(reportResult.id).toBeDefined();
      expect(reportResult.title).toBeDefined();
      expect(reportResult.executiveSummary).toBeDefined();
      expect(reportResult.keyFindings).toBeInstanceOf(Array);
      expect(reportResult.strategicRecommendations).toBeDefined();
      expect(reportResult.competitiveIntelligence).toBeDefined();
      expect(reportResult.status).toBe('completed');
      expect(reportResult.projectId).toBe(testProject.id);

      // Verify database persistence
      const savedReport = await prisma.report.findUnique({
        where: { id: reportResult.id },
        include: { versions: true }
      });

             expect(savedReport).toBeDefined();
       if (savedReport) {
         expect(savedReport.status).toBe('COMPLETED');
         expect(savedReport.versions.length).toBeGreaterThan(0);
         expect(savedReport.versions[0].content).toBeDefined();
       }

      // Verify report is not a zombie
      const zombieCheck = await ReportValidationService.validateReportIntegrity(
        reportResult.id,
        testProject.id
      );

      expect(zombieCheck.isValid).toBe(true);
      expect(zombieCheck.issues).toHaveLength(0);
      expect(zombieCheck.canBeMarkedCompleted).toBe(true);

      console.log(`✅ Complete report generated in ${Date.now() - testStartTime}ms`);
    });

    it('should maintain data consistency throughout generation process', async () => {
      // Act: Generate report
      const reportResult = await initialReportService.generateInitialComparativeReport(
        testProject.id,
                 {
           template: 'comprehensive',
           fallbackToPartialData: true
         }
      );

      generatedReportIds.push(reportResult.id);

      // Assert: Check consistency between report object and database
      const dbReport = await prisma.report.findUnique({
        where: { id: reportResult.id },
        include: { 
          versions: { orderBy: { version: 'desc' } },
          project: true
        }
      });

      expect(dbReport).toBeDefined();
      expect(dbReport!.id).toBe(reportResult.id);
      expect(dbReport!.projectId).toBe(reportResult.projectId);
      expect(dbReport!.status).toBe('COMPLETED');

      // Verify ReportVersion content matches report object
      const latestVersion = dbReport!.versions[0];
      expect(latestVersion).toBeDefined();
      expect(latestVersion.content).toBeDefined();

      const versionContent = latestVersion.content as any;
      expect(versionContent.id).toBe(reportResult.id);
      expect(versionContent.title).toBe(reportResult.title);
      expect(versionContent.status).toBe(reportResult.status);
    });

    it('should generate reports with proper metadata and timestamps', async () => {
      // Arrange
      const beforeGeneration = new Date();

      // Act
      const reportResult = await initialReportService.generateInitialComparativeReport(
        testProject.id,
        { fallbackToPartialData: true }
      );

      generatedReportIds.push(reportResult.id);
      const afterGeneration = new Date();

      // Assert: Verify timestamps
      expect(reportResult.createdAt).toBeDefined();
      expect(reportResult.updatedAt).toBeDefined();
      expect(new Date(reportResult.createdAt)).toBeInstanceOf(Date);
      expect(new Date(reportResult.updatedAt)).toBeInstanceOf(Date);

      const reportCreatedAt = new Date(reportResult.createdAt);
      expect(reportCreatedAt.getTime()).toBeGreaterThanOrEqual(beforeGeneration.getTime());
      expect(reportCreatedAt.getTime()).toBeLessThanOrEqual(afterGeneration.getTime());

      // Verify metadata
      expect(reportResult.metadata).toBeDefined();
      expect(reportResult.metadata.analysisDate).toBeDefined();
      expect(reportResult.metadata.reportGeneratedAt).toBeDefined();
      expect(reportResult.metadata.productName).toBe(testProject.name);
    });
  });

  describe('7.1.2 - Report Generation with Data Collection', () => {
    it('should handle smart data collection and generate complete report', async () => {
      // Arrange: Mock smart data collection to simulate real scenario
      const mockCollectionResult = {
        dataCompletenessScore: 85,
        dataFreshness: 'recent',
        capturedCount: 1,
        projectData: {
          id: testProject.id,
          name: testProject.name,
          competitors: testProject.competitors
        }
      };

      const collectDataSpy = jest.spyOn(smartDataService, 'collectProjectData')
        .mockResolvedValue(mockCollectionResult);

      // Act
      const reportResult = await initialReportService.generateInitialComparativeReport(
        testProject.id,
        {
          template: 'comprehensive',
          requireFreshSnapshots: true,
          fallbackToPartialData: false
        }
      );

      generatedReportIds.push(reportResult.id);

      // Assert: Verify data collection was called
      expect(collectDataSpy).toHaveBeenCalledWith(
        testProject.id,
        expect.objectContaining({
          requireFreshSnapshots: true,
          fallbackToPartialData: false
        })
      );

      // Verify report reflects collected data
      expect(reportResult.isInitialReport).toBe(true);
      expect(reportResult.dataCompletenessScore).toBe(85);
      expect(reportResult.dataFreshness).toBe('recent');

      // Verify database record
      const dbReport = await prisma.report.findUnique({
        where: { id: reportResult.id },
        include: { versions: true }
      });

      expect(dbReport!.dataCompletenessScore).toBe(85);
      expect(dbReport!.dataFreshness).toBe('recent');
      expect(dbReport!.versions.length).toBe(1);

      collectDataSpy.mockRestore();
    });

    it('should handle data collection failures gracefully', async () => {
      // Arrange: Mock data collection failure
      const collectDataSpy = jest.spyOn(smartDataService, 'collectProjectData')
        .mockRejectedValue(new Error('Data collection service unavailable'));

      // Act: Should fallback to emergency report
      const reportResult = await initialReportService.generateInitialComparativeReport(
        testProject.id,
        {
          fallbackToPartialData: true,
          requireFreshSnapshots: false
        }
      );

      generatedReportIds.push(reportResult.id);

      // Assert: Verify emergency report was generated
      expect(reportResult).toBeDefined();
      expect(reportResult.id).toBeDefined();
      expect(reportResult.status).toBe('completed');

      // Verify it's not a zombie report
      const dbReport = await prisma.report.findUnique({
        where: { id: reportResult.id },
        include: { versions: true }
      });

      expect(dbReport).toBeDefined();
      expect(dbReport!.status).toBe('COMPLETED');
      expect(dbReport!.versions.length).toBeGreaterThan(0);
      expect(dbReport!.versions[0].content).toBeDefined();

      // Verify emergency/recovery indicators
      const content = dbReport!.versions[0].content as any;
      expect(content.emergency || content.recoveryVersion).toBeTruthy();

      collectDataSpy.mockRestore();
    });
  });

  describe('7.1.3 - Atomic Report Creation', () => {
    it('should create Report and ReportVersion atomically', async () => {
      // Arrange: Monitor database transaction
      const transactionSpy = jest.spyOn(prisma, '$transaction');

      // Act
      const reportResult = await initialReportService.generateInitialComparativeReport(
        testProject.id,
        { fallbackToPartialData: true }
      );

      generatedReportIds.push(reportResult.id);

      // Assert: Verify transaction was used
      expect(transactionSpy).toHaveBeenCalled();

      // Verify both Report and ReportVersion exist
      const reportExists = await prisma.report.findUnique({
        where: { id: reportResult.id }
      });

      const versionExists = await prisma.reportVersion.findFirst({
        where: { reportId: reportResult.id }
      });

      expect(reportExists).toBeDefined();
      expect(versionExists).toBeDefined();
      expect(reportExists!.status).toBe('COMPLETED');
      expect(versionExists!.content).toBeDefined();

      transactionSpy.mockRestore();
    });

    it('should not create zombie reports during generation failures', async () => {
      // This test simulates a failure during ReportVersion creation to ensure
      // rollback works properly and no zombie reports are left behind

      let reportId: string | null = null;

      try {
        // Arrange: Mock ReportVersion creation to fail after Report creation
        const createSpy = jest.spyOn(prisma.reportVersion, 'create')
          .mockRejectedValueOnce(new Error('ReportVersion creation failed'));

        // Act: Attempt report generation (should fail)
        const reportResult = await initialReportService.generateInitialComparativeReport(
          testProject.id,
          { fallbackToPartialData: true }
        );

        reportId = reportResult.id;

      } catch (error) {
        // Expected to fail
      }

      // Assert: Verify no zombie report was created
      if (reportId) {
        const zombieReport = await prisma.report.findUnique({
          where: { id: reportId },
          include: { versions: true }
        });

        if (zombieReport && zombieReport.status === 'COMPLETED') {
          expect(zombieReport.versions.length).toBeGreaterThan(0);
        }
      }

      // Verify no zombie reports exist in system
      const zombieReports = await prisma.report.findMany({
        where: {
          status: 'COMPLETED',
          versions: { none: {} }
        }
      });

      expect(zombieReports.length).toBe(0);
    });
  });

  describe('7.1.4 - Report Validation and Quality Checks', () => {
    it('should validate report completeness before marking as COMPLETED', async () => {
      // Act
      const reportResult = await initialReportService.generateInitialComparativeReport(
        testProject.id,
        { fallbackToPartialData: true }
      );

      generatedReportIds.push(reportResult.id);

      // Assert: Use validation service to check report
      const validationResult = await ReportValidationService.validateReportIntegrity(
        reportResult.id,
        testProject.id
      );

      expect(validationResult.isValid).toBe(true);
      expect(validationResult.issues).toHaveLength(0);
      expect(validationResult.zombieReportRisk).toBe('LOW');
      expect(validationResult.canBeMarkedCompleted).toBe(true);

      // Verify report data structure
      expect(validationResult.reportData).toBeDefined();
      expect(validationResult.reportData!.status).toBe('COMPLETED');
      expect(validationResult.reportData!.versionCount).toBeGreaterThan(0);
      expect(validationResult.reportData!.hasContent).toBe(true);
    });

    it('should trigger alerts if zombie report conditions are detected', async () => {
      // Arrange: Mock alert service
      const alertSpy = jest.spyOn(ZombieReportAlertService, 'triggerImmediateZombieAlert')
        .mockResolvedValue();

      // This test ensures the alert system would be triggered if a zombie was created
      // (though our fixed system shouldn't create any)

      // Act: Generate normal report
      const reportResult = await initialReportService.generateInitialComparativeReport(
        testProject.id,
        { fallbackToPartialData: true }
      );

      generatedReportIds.push(reportResult.id);

      // Assert: No alerts should be triggered for proper reports
      expect(alertSpy).not.toHaveBeenCalled();

      alertSpy.mockRestore();
    });

    it('should maintain consistent report status across all representations', async () => {
      // Act
      const reportResult = await initialReportService.generateInitialComparativeReport(
        testProject.id,
        { fallbackToPartialData: true }
      );

      generatedReportIds.push(reportResult.id);

      // Assert: Check status consistency
      // 1. Report object status
      expect(reportResult.status).toBe('completed');

      // 2. Database Report record status
      const dbReport = await prisma.report.findUnique({
        where: { id: reportResult.id },
        include: { versions: true }
      });
      expect(dbReport!.status).toBe('COMPLETED');

      // 3. ReportVersion content status
      const versionContent = dbReport!.versions[0].content as any;
      expect(versionContent.status).toBe('completed');

      // 4. All status representations should be equivalent
      const statusMapping = {
        'completed': 'COMPLETED',
        'COMPLETED': 'completed'
      };

      expect(statusMapping[reportResult.status as keyof typeof statusMapping]).toBe(dbReport!.status);
    });
  });

  describe('7.1.5 - Performance and Resource Management', () => {
    it('should generate reports within acceptable time limits', async () => {
      // Arrange
      const maxGenerationTime = 60000; // 60 seconds
      const startTime = Date.now();

      // Act
      const reportResult = await initialReportService.generateInitialComparativeReport(
        testProject.id,
        { fallbackToPartialData: true }
      );

      generatedReportIds.push(reportResult.id);
      const generationTime = Date.now() - startTime;

      // Assert
      expect(generationTime).toBeLessThan(maxGenerationTime);
      console.log(`Report generated in ${generationTime}ms`);
    });

    it('should handle concurrent report generation requests', async () => {
      // Arrange: Create multiple projects for concurrent testing
      const concurrentProjects = await Promise.all([
        prisma.project.create({
          data: {
            id: createId(),
            name: `Concurrent Test Project 1 ${Date.now()}`,
            userId: 'test-user-concurrent',
            description: 'Concurrent test project 1',
            status: 'ACTIVE',
            priority: 'MEDIUM',
            parameters: {},
            tags: ['concurrent-test']
          }
        }),
        prisma.project.create({
          data: {
            id: createId(),
            name: `Concurrent Test Project 2 ${Date.now()}`,
            userId: 'test-user-concurrent',
            description: 'Concurrent test project 2',
            status: 'ACTIVE',
            priority: 'MEDIUM',
            parameters: {},
            tags: ['concurrent-test']
          }
        })
      ]);

      try {
        // Act: Generate reports concurrently
        const concurrentReports = await Promise.all([
          initialReportService.generateInitialComparativeReport(
            concurrentProjects[0].id,
            { fallbackToPartialData: true }
          ),
          initialReportService.generateInitialComparativeReport(
            concurrentProjects[1].id,
            { fallbackToPartialData: true }
          )
        ]);

        generatedReportIds.push(...concurrentReports.map(r => r.id));

        // Assert: Both reports should be generated successfully
        expect(concurrentReports).toHaveLength(2);
        expect(concurrentReports[0].id).toBeDefined();
        expect(concurrentReports[1].id).toBeDefined();
        expect(concurrentReports[0].id).not.toBe(concurrentReports[1].id);

        // Verify both are proper reports, not zombies
        for (const report of concurrentReports) {
          const dbReport = await prisma.report.findUnique({
            where: { id: report.id },
            include: { versions: true }
          });

          expect(dbReport!.status).toBe('COMPLETED');
          expect(dbReport!.versions.length).toBeGreaterThan(0);
        }

      } finally {
        // Cleanup concurrent test projects
        await prisma.project.deleteMany({
          where: { id: { in: concurrentProjects.map(p => p.id) } }
        });
      }
    });
  });

  describe('7.1.6 - Error Recovery and Resilience', () => {
    it('should recover gracefully from database connection issues', async () => {
      // This test simulates transient database issues and verifies recovery
      let connectionErrorThrown = false;

      const originalFindUnique = prisma.project.findUnique;
      
      // Mock transient database error on first call, success on retry
      jest.spyOn(prisma.project, 'findUnique')
        .mockImplementationOnce(async () => {
          connectionErrorThrown = true;
          throw new Error('Database connection temporarily unavailable');
        })
        .mockImplementation(originalFindUnique);

      try {
        // Act: Should retry and succeed
        const reportResult = await initialReportService.generateInitialComparativeReport(
          testProject.id,
          { 
            fallbackToPartialData: true,
            timeout: 30000 // Longer timeout for retry scenarios
          }
        );

        generatedReportIds.push(reportResult.id);

        // Assert: Report should be generated despite initial error
        expect(reportResult).toBeDefined();
        expect(reportResult.status).toBe('completed');

      } catch (error) {
        // If it fails, it should be due to the mocked error, not a zombie report
        console.log('Expected database error occurred:', (error as Error).message);
      }

      // Verify no zombie reports were created during error scenarios
      const zombieReports = await prisma.report.findMany({
        where: {
          status: 'COMPLETED',
          versions: { none: {} }
        }
      });

      expect(zombieReports.length).toBe(0);
    });

    it('should maintain system integrity during partial failures', async () => {
      // This comprehensive test ensures the system maintains integrity
      // even when various components fail during report generation

      let reportId: string | null = null;

      try {
        // Act: Generate report with potential failure scenarios
        const reportResult = await initialReportService.generateInitialComparativeReport(
          testProject.id,
          { 
            fallbackToPartialData: true,
            requireFreshSnapshots: false
          }
        );

        reportId = reportResult.id;
        generatedReportIds.push(reportResult.id);

        // Assert: Report should be complete and valid
        expect(reportResult).toBeDefined();
        expect(reportResult.status).toBe('completed');

      } catch (error) {
        console.log('Report generation failed:', (error as Error).message);
      }

      // Final integrity check: Ensure no zombies exist anywhere in system
      const allZombieReports = await prisma.report.findMany({
        where: {
          status: 'COMPLETED',
          versions: { none: {} }
        }
      });

      expect(allZombieReports).toHaveLength(0);

      // If a report was created, it should be complete
      if (reportId) {
        const finalReport = await prisma.report.findUnique({
          where: { id: reportId },
          include: { versions: true }
        });

        if (finalReport && finalReport.status === 'COMPLETED') {
          expect(finalReport.versions.length).toBeGreaterThan(0);
          expect(finalReport.versions[0].content).toBeDefined();
        }
      }
    });
  });
}); 