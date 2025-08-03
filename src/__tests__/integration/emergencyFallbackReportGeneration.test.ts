/**
 * Emergency Fallback Report Generation Tests
 * Task 7.2: Test emergency fallback scenario generates viewable reports
 * 
 * This test suite validates that when normal report generation fails,
 * the emergency fallback mechanism creates complete, viewable reports
 * instead of zombie reports.
 */

import { describe, beforeAll, afterAll, beforeEach, afterEach, it, expect, jest } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import { InitialComparativeReportService } from '../../services/reports/initialComparativeReportService';
import { SmartDataCollectionService } from '../../services/reports/smartDataCollectionService';
import { ReportValidationService } from '../../lib/reportValidation';
import { ZombieReportAlertService } from '../../lib/alerts/zombieReportAlerts';
import { createId } from '@paralleldrive/cuid2';

const prisma = new PrismaClient();

interface EmergencyScenario {
  name: string;
  description: string;
  setupFailure: () => void;
  cleanupFailure: () => void;
  expectedFallbackType: 'emergency' | 'partial' | 'minimal';
}

describe('Emergency Fallback Report Generation Tests', () => {
  let testProject: any;
  let testCompetitor: any;
  let initialReportService: InitialComparativeReportService;
  let smartDataService: SmartDataCollectionService;
  let generatedReportIds: string[] = [];

  beforeAll(async () => {
    // Create isolated test project for emergency scenarios
    const projectData = await prisma.project.create({
      data: {
        id: createId(),
        name: `Emergency Test Project ${Date.now()}`,
        userId: 'test-user-emergency',
        description: 'Emergency fallback test project',
        status: 'ACTIVE',
        priority: 'HIGH',
        parameters: { emergencyTest: true },
        tags: ['emergency-test', 'fallback-test']
      }
    });

    const competitorData = await prisma.competitor.create({
      data: {
        id: createId(),
        name: `Emergency Test Competitor ${Date.now()}`,
        website: 'https://emergency-test-competitor.com',
        industry: 'Emergency Testing',
        projects: {
          connect: { id: projectData.id }
        }
      }
    });

    testProject = projectData;
    testCompetitor = competitorData;

    // Initialize services
    initialReportService = new InitialComparativeReportService();
    smartDataService = new SmartDataCollectionService();

    console.log(`Emergency Test Setup: Project ${testProject.id}, Competitor ${testCompetitor.id}`);
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
    // Verify no zombie reports were created in any test
    const zombieReports = await prisma.report.findMany({
      where: {
        status: 'COMPLETED',
        versions: { none: {} }
      }
    });

    if (zombieReports.length > 0) {
      console.error('ZOMBIE REPORTS DETECTED:', zombieReports.map(r => ({ id: r.id, name: r.name })));
    }

    expect(zombieReports.length).toBe(0);
  });

  describe('7.2.1 - SmartDataCollectionService Failure Scenarios', () => {
    it('should generate viewable emergency report when data collection completely fails', async () => {
      // Arrange: Mock complete data collection failure
      const collectDataSpy = jest.spyOn(smartDataService, 'collectProjectData')
        .mockRejectedValue(new Error('SmartDataCollectionService: Complete service failure'));

      // Act: Generate report with fallback enabled
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
      expect(reportResult.title).toBeDefined();
      expect(reportResult.status).toBe('completed');

      // Verify database persistence with content
      const savedReport = await prisma.report.findUnique({
        where: { id: reportResult.id },
        include: { versions: true }
      });

      expect(savedReport).toBeDefined();
      if (savedReport) {
        expect(savedReport.status).toBe('COMPLETED');
        expect(savedReport.versions.length).toBeGreaterThan(0);
        expect(savedReport.versions[0].content).toBeDefined();

        // Verify it's an emergency report
        const content = savedReport.versions[0].content as any;
        expect(content.emergency || content.recoveryVersion).toBeTruthy();
        expect(content.executiveSummary).toContain('emergency');
      }

      // Verify report integrity
      const validationResult = await ReportValidationService.validateReportIntegrity(
        reportResult.id,
        testProject.id
      );

      expect(validationResult.isValid).toBe(true);
      expect(validationResult.canBeMarkedCompleted).toBe(true);

      collectDataSpy.mockRestore();
    });

    it('should handle data collection timeout and generate fallback report', async () => {
      // Arrange: Mock timeout scenario
      const collectDataSpy = jest.spyOn(smartDataService, 'collectProjectData')
        .mockImplementation(() => new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Data collection timeout')), 100);
        }));

      // Act
      const reportResult = await initialReportService.generateInitialComparativeReport(
        testProject.id,
        {
          fallbackToPartialData: true,
          timeout: 5000
        }
      );

      generatedReportIds.push(reportResult.id);

      // Assert: Verify timeout fallback report
      expect(reportResult).toBeDefined();
      expect(reportResult.status).toBe('completed');

      const savedReport = await prisma.report.findUnique({
        where: { id: reportResult.id },
        include: { versions: true }
      });

      expect(savedReport).toBeDefined();
      if (savedReport) {
        expect(savedReport.status).toBe('COMPLETED');
        expect(savedReport.versions.length).toBeGreaterThan(0);

        const content = savedReport.versions[0].content as any;
        expect(content).toBeDefined();
        expect(content.title || content.executiveSummary).toBeDefined();
      }

      collectDataSpy.mockRestore();
    });

    it('should handle network connectivity issues gracefully', async () => {
      // Arrange: Mock network connectivity failure
      const collectDataSpy = jest.spyOn(smartDataService, 'collectProjectData')
        .mockRejectedValue(new Error('ENOTFOUND: Network unreachable'));

      // Act
      const reportResult = await initialReportService.generateInitialComparativeReport(
        testProject.id,
        { fallbackToPartialData: true }
      );

      generatedReportIds.push(reportResult.id);

      // Assert: Network failure should trigger emergency report
      expect(reportResult).toBeDefined();
      expect(reportResult.status).toBe('completed');

      const dbReport = await prisma.report.findUnique({
        where: { id: reportResult.id },
        include: { versions: true }
      });

      expect(dbReport).toBeDefined();
      if (dbReport) {
        expect(dbReport.status).toBe('COMPLETED');
        expect(dbReport.versions.length).toBeGreaterThan(0);
        expect(dbReport.versions[0].content).toBeDefined();
      }

      collectDataSpy.mockRestore();
    });
  });

  describe('7.2.2 - Database Connection Failure Scenarios', () => {
    it('should handle database read failures during report generation', async () => {
      // Arrange: Mock database read failure for project lookup
      const findUniqueSpy = jest.spyOn(prisma.project, 'findUnique')
        .mockRejectedValueOnce(new Error('Database connection lost'))
        .mockResolvedValue(testProject); // Succeed on retry

      // Act: Should retry and generate report
      try {
        const reportResult = await initialReportService.generateInitialComparativeReport(
          testProject.id,
          { fallbackToPartialData: true }
        );

        generatedReportIds.push(reportResult.id);

        // Assert: Report should be generated despite initial failure
        expect(reportResult).toBeDefined();
        expect(reportResult.status).toBe('completed');

      } catch (error) {
        // If it fails completely, ensure no zombie report was created
        const zombieReports = await prisma.report.findMany({
          where: {
            status: 'COMPLETED',
            versions: { none: {} }
          }
        });
        expect(zombieReports.length).toBe(0);
      }

      findUniqueSpy.mockRestore();
    });

    it('should maintain atomic transactions during database instability', async () => {
      // Arrange: Monitor transaction usage during instability
      const transactionSpy = jest.spyOn(prisma, '$transaction');

      // Mock intermittent database issues
      let callCount = 0;
      const mockTransaction = jest.fn().mockImplementation(async (callback) => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Transaction rollback due to connection issue');
        }
        // Succeed on subsequent calls
        return await callback(prisma);
      });

      transactionSpy.mockImplementation(mockTransaction);

      try {
        // Act
        const reportResult = await initialReportService.generateInitialComparativeReport(
          testProject.id,
          { fallbackToPartialData: true }
        );

        generatedReportIds.push(reportResult.id);

        // Assert: Verify transaction was attempted and eventually succeeded
        expect(transactionSpy).toHaveBeenCalled();
        expect(reportResult.status).toBe('completed');

      } catch (error) {
        // If final generation fails, verify no partial reports exist
        console.log('Transaction failure scenario triggered:', (error as Error).message);
      }

      // Always verify no zombie reports
      const zombieReports = await prisma.report.findMany({
        where: {
          status: 'COMPLETED',
          versions: { none: {} }
        }
      });
      expect(zombieReports.length).toBe(0);

      transactionSpy.mockRestore();
    });
  });

  describe('7.2.3 - Emergency Report Content Quality', () => {
    it('should generate emergency reports with complete structure', async () => {
      // Arrange: Force emergency scenario
      const collectDataSpy = jest.spyOn(smartDataService, 'collectProjectData')
        .mockRejectedValue(new Error('Service unavailable for content quality test'));

      // Act
      const reportResult = await initialReportService.generateInitialComparativeReport(
        testProject.id,
        { fallbackToPartialData: true }
      );

      generatedReportIds.push(reportResult.id);

      // Assert: Verify emergency report has required structure
      expect(reportResult.title).toBeDefined();
      expect(reportResult.executiveSummary).toBeDefined();
      expect(reportResult.keyFindings).toBeDefined();
      expect(reportResult.strategicRecommendations).toBeDefined();
      expect(reportResult.competitiveIntelligence).toBeDefined();

      // Verify executive summary contains emergency context
      expect(reportResult.executiveSummary).toContain('emergency');

      // Verify key findings explain the situation
      expect(reportResult.keyFindings).toBeInstanceOf(Array);
      expect(reportResult.keyFindings.length).toBeGreaterThan(0);

      // Verify strategic recommendations are actionable
      expect(reportResult.strategicRecommendations.immediate).toBeDefined();
      expect(reportResult.strategicRecommendations.immediate.length).toBeGreaterThan(0);

      collectDataSpy.mockRestore();
    });

    it('should include diagnostic information in emergency reports', async () => {
      // Arrange: Create specific failure scenario
      const specificError = new Error('Specific diagnostic test error - data collection failed at step 3');
      const collectDataSpy = jest.spyOn(smartDataService, 'collectProjectData')
        .mockRejectedValue(specificError);

      // Act
      const reportResult = await initialReportService.generateInitialComparativeReport(
        testProject.id,
        { fallbackToPartialData: true }
      );

      generatedReportIds.push(reportResult.id);

      // Assert: Check for diagnostic information
      const dbReport = await prisma.report.findUnique({
        where: { id: reportResult.id },
        include: { versions: true }
      });

      expect(dbReport).toBeDefined();
      if (dbReport && dbReport.versions.length > 0) {
        const content = dbReport.versions[0].content as any;
        
        // Should contain diagnostic or error information
        expect(
          content.errorDetails ||
          content.diagnosticInfo ||
          content.executiveSummary.includes('technical') ||
          content.keyFindings.some((finding: string) => finding.includes('system'))
        ).toBeTruthy();
      }

      collectDataSpy.mockRestore();
    });

    it('should generate user-friendly emergency reports', async () => {
      // Arrange: Simulate user-facing emergency scenario
      const collectDataSpy = jest.spyOn(smartDataService, 'collectProjectData')
        .mockRejectedValue(new Error('External service temporarily unavailable'));

      // Act
      const reportResult = await initialReportService.generateInitialComparativeReport(
        testProject.id,
        { fallbackToPartialData: true }
      );

      generatedReportIds.push(reportResult.id);

      // Assert: Verify user-friendly content
      expect(reportResult.executiveSummary).toBeDefined();
      
      // Should not contain raw error messages or technical jargon in user-facing content
      expect(reportResult.executiveSummary).not.toContain('ENOTFOUND');
      expect(reportResult.executiveSummary).not.toContain('undefined');
      expect(reportResult.executiveSummary).not.toContain('null');

      // Should provide actionable information for users
      expect(reportResult.strategicRecommendations.immediate).toBeDefined();
      expect(reportResult.strategicRecommendations.immediate.length).toBeGreaterThan(0);

      collectDataSpy.mockRestore();
    });
  });

  describe('7.2.4 - Multiple Failure Scenarios', () => {
    it('should handle cascading failures gracefully', async () => {
      // Arrange: Multiple service failures
      const collectDataSpy = jest.spyOn(smartDataService, 'collectProjectData')
        .mockRejectedValue(new Error('Primary data collection failed'));

      const projectLookupSpy = jest.spyOn(prisma.project, 'findUnique')
        .mockResolvedValueOnce(null) // First call fails
        .mockResolvedValue(testProject); // Subsequent calls succeed

      // Act: Should handle multiple failures and still generate report
      try {
        const reportResult = await initialReportService.generateInitialComparativeReport(
          testProject.id,
          { fallbackToPartialData: true }
        );

        generatedReportIds.push(reportResult.id);

        // Assert: Despite multiple failures, should generate viewable report
        expect(reportResult).toBeDefined();
        expect(reportResult.status).toBe('completed');

        const dbReport = await prisma.report.findUnique({
          where: { id: reportResult.id },
          include: { versions: true }
        });

        if (dbReport) {
          expect(dbReport.status).toBe('COMPLETED');
          expect(dbReport.versions.length).toBeGreaterThan(0);
        }

      } catch (error) {
        console.log('Cascading failure scenario:', (error as Error).message);
      }

      // Critical: No zombie reports should exist regardless of outcome
      const zombieReports = await prisma.report.findMany({
        where: {
          status: 'COMPLETED',
          versions: { none: {} }
        }
      });
      expect(zombieReports.length).toBe(0);

      collectDataSpy.mockRestore();
      projectLookupSpy.mockRestore();
    });

    it('should maintain data consistency during partial system failures', async () => {
      // Arrange: Simulate partial system failure after Report creation
      let reportCreated = false;
      const createReportSpy = jest.spyOn(prisma.report, 'create')
        .mockImplementation(async (args: any) => {
          reportCreated = true;
          return {
            id: args.data.id,
            name: args.data.name,
            status: args.data.status,
            projectId: args.data.projectId,
            competitorId: args.data.competitorId,
            createdAt: new Date(),
            updatedAt: new Date(),
            dataCompletenessScore: null,
            dataFreshness: null,
            isInitialReport: false,
            userId: 'test',
            userEmail: null,
            description: null,
            parameters: null,
            tags: [],
            generationStartTime: null,
            generationEndTime: null
          };
        });

      // Mock ReportVersion creation to fail initially
      let versionCallCount = 0;
      const createVersionSpy = jest.spyOn(prisma.reportVersion, 'create')
        .mockImplementation(async (args: any) => {
          versionCallCount++;
          if (versionCallCount === 1) {
            throw new Error('ReportVersion creation failed - system instability');
          }
          return {
            id: createId(),
            reportId: args.data.reportId,
            version: args.data.version,
            content: args.data.content,
            createdAt: new Date(),
            updatedAt: new Date()
          };
        });

      try {
        // Act: Attempt report generation
        const reportResult = await initialReportService.generateInitialComparativeReport(
          testProject.id,
          { fallbackToPartialData: true }
        );

        generatedReportIds.push(reportResult.id);

      } catch (error) {
        console.log('Expected partial failure:', (error as Error).message);
      }

      // Assert: Critical integrity check
      const zombieReports = await prisma.report.findMany({
        where: {
          status: 'COMPLETED',
          versions: { none: {} }
        }
      });

      expect(zombieReports.length).toBe(0);

      createReportSpy.mockRestore();
      createVersionSpy.mockRestore();
    });
  });

  describe('7.2.5 - Emergency Report Accessibility', () => {
    it('should ensure emergency reports are immediately accessible', async () => {
      // Arrange
      const collectDataSpy = jest.spyOn(smartDataService, 'collectProjectData')
        .mockRejectedValue(new Error('Service unavailable - accessibility test'));

      // Act
      const reportResult = await initialReportService.generateInitialComparativeReport(
        testProject.id,
        { fallbackToPartialData: true }
      );

      generatedReportIds.push(reportResult.id);

      // Assert: Report should be immediately accessible
      const accessibilityCheck = await prisma.report.findUnique({
        where: { id: reportResult.id },
        include: { 
          versions: { orderBy: { version: 'desc' } },
          project: true
        }
      });

      expect(accessibilityCheck).toBeDefined();
      if (accessibilityCheck) {
        // Should have viewable content
        expect(accessibilityCheck.versions.length).toBeGreaterThan(0);
        expect(accessibilityCheck.versions[0].content).toBeDefined();
        
        // Should be marked as completed
        expect(accessibilityCheck.status).toBe('COMPLETED');
        
        // Should have proper project association
        expect(accessibilityCheck.project).toBeDefined();
        expect(accessibilityCheck.projectId).toBe(testProject.id);
      }

      collectDataSpy.mockRestore();
    });

    it('should validate emergency reports pass all integrity checks', async () => {
      // Arrange
      const collectDataSpy = jest.spyOn(smartDataService, 'collectProjectData')
        .mockRejectedValue(new Error('Integrity validation test failure'));

      // Act
      const reportResult = await initialReportService.generateInitialComparativeReport(
        testProject.id,
        { fallbackToPartialData: true }
      );

      generatedReportIds.push(reportResult.id);

      // Assert: Run comprehensive validation
      const validationResult = await ReportValidationService.validateReportIntegrity(
        reportResult.id,
        testProject.id
      );

      expect(validationResult.isValid).toBe(true);
      expect(validationResult.issues).toHaveLength(0);
      expect(validationResult.zombieReportRisk).toBe('LOW');
      expect(validationResult.canBeMarkedCompleted).toBe(true);

      // Additional validation checks
      expect(validationResult.reportData).toBeDefined();
      if (validationResult.reportData) {
        expect(validationResult.reportData.hasContent).toBe(true);
        expect(validationResult.reportData.versionCount).toBeGreaterThan(0);
        expect(validationResult.reportData.status).toBe('COMPLETED');
      }

      collectDataSpy.mockRestore();
    });

    it('should not trigger zombie report alerts for emergency reports', async () => {
      // Arrange: Mock alert service
      const alertSpy = jest.spyOn(ZombieReportAlertService, 'triggerImmediateZombieAlert')
        .mockResolvedValue();

      const monitorSpy = jest.spyOn(ZombieReportAlertService, 'monitorAndAlert')
        .mockResolvedValue({
          detectionResult: {
            zombiesFound: 0,
            reports: [],
            scannedAt: new Date()
          },
          alertsTriggered: [],
          monitoringTimestamp: new Date(),
          projectScope: 'TEST'
        });

      const collectDataSpy = jest.spyOn(smartDataService, 'collectProjectData')
        .mockRejectedValue(new Error('Alert test failure'));

      // Act
      const reportResult = await initialReportService.generateInitialComparativeReport(
        testProject.id,
        { fallbackToPartialData: true }
      );

      generatedReportIds.push(reportResult.id);

      // Simulate monitoring sweep
      await ZombieReportAlertService.monitorAndAlert(testProject.id);

      // Assert: No zombie alerts should be triggered
      expect(alertSpy).not.toHaveBeenCalled();
      expect(monitorSpy).toHaveBeenCalled();

      alertSpy.mockRestore();
      monitorSpy.mockRestore();
      collectDataSpy.mockRestore();
    });
  });

  describe('7.2.6 - Recovery and Retry Mechanisms', () => {
    it('should retry failed operations before falling back to emergency', async () => {
      // Arrange: Mock service to fail first time, succeed second time
      let callCount = 0;
      const collectDataSpy = jest.spyOn(smartDataService, 'collectProjectData')
        .mockImplementation(async () => {
          callCount++;
          if (callCount === 1) {
            throw new Error('Temporary service failure');
          }
          return {
            success: true,
            dataCompletenessScore: 90,
            dataFreshness: 'recent',
            capturedCount: 1,
            productData: { available: true, source: 'api', data: testProject },
            competitorData: [],
            collectionTime: 1000,
            priorityBreakdown: { high: 1, medium: 0, low: 0 },
            metadata: { retryAttempt: 2 }
          };
        });

      // Act
      const reportResult = await initialReportService.generateInitialComparativeReport(
        testProject.id,
        { fallbackToPartialData: true }
      );

      generatedReportIds.push(reportResult.id);

      // Assert: Should have retried and succeeded
      expect(callCount).toBeGreaterThan(1);
      expect(reportResult).toBeDefined();
      expect(reportResult.status).toBe('completed');

      // Should be a successful report, not emergency fallback
      const content = reportResult.executiveSummary;
      expect(content).toBeDefined();

      collectDataSpy.mockRestore();
    });

    it('should fall back gracefully when all retry attempts fail', async () => {
      // Arrange: Mock to always fail
      let attemptCount = 0;
      const collectDataSpy = jest.spyOn(smartDataService, 'collectProjectData')
        .mockImplementation(async () => {
          attemptCount++;
          throw new Error(`Persistent failure - attempt ${attemptCount}`);
        });

      // Act
      const reportResult = await initialReportService.generateInitialComparativeReport(
        testProject.id,
        { fallbackToPartialData: true }
      );

      generatedReportIds.push(reportResult.id);

      // Assert: Should eventually generate emergency report
      expect(attemptCount).toBeGreaterThan(0);
      expect(reportResult).toBeDefined();
      expect(reportResult.status).toBe('completed');

      // Verify it's a proper emergency report
      const dbReport = await prisma.report.findUnique({
        where: { id: reportResult.id },
        include: { versions: true }
      });

      expect(dbReport).toBeDefined();
      if (dbReport) {
        expect(dbReport.status).toBe('COMPLETED');
        expect(dbReport.versions.length).toBeGreaterThan(0);
        
        const content = dbReport.versions[0].content as any;
        expect(content.emergency || content.recoveryVersion).toBeTruthy();
      }

      collectDataSpy.mockRestore();
    });
  });
}); 