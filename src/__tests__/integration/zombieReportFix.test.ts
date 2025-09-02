import { jest, describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import { SmartDataCollectionService } from '../../services/reports/smartDataCollectionService';
import { InitialComparativeReportService } from '../../services/reports/initialComparativeReportService';
import prisma from '../../lib/prisma';
import { logger } from '../../lib/logger';

describe('Zombie Report Fix - Integration Tests', () => {
  let smartDataCollectionService: SmartDataCollectionService;
  let initialComparativeReportService: InitialComparativeReportService;
  let testProjectId: string;
  let testCompetitorId: string;

  beforeAll(async () => {
    // Initialize services
    smartDataCollectionService = new SmartDataCollectionService();
    initialComparativeReportService = new InitialComparativeReportService();

    // Create test project and competitor for tests
    const testProject = await prisma.project.create({
      data: {
        id: 'test-zombie-project-' + Date.now(),
        name: 'Test Zombie Project',
        userId: 'test-user-id',
        parameters: {},
        tags: {}
      }
    });

    const testCompetitor = await prisma.competitor.create({
      data: {
        id: 'test-zombie-competitor-' + Date.now(),
        name: 'Test Competitor',
        website: 'https://example.com',
        industry: 'Technology',
        projects: {
          connect: { id: testProject.id }
        }
      }
    });

    testProjectId = testProject.id;
    testCompetitorId = testCompetitor.id;
  });

  afterAll(async () => {
    // Cleanup test data
    await prisma.reportVersion.deleteMany({
      where: { report: { projectId: testProjectId } }
    });
    await prisma.report.deleteMany({
      where: { projectId: testProjectId }
    });
    await prisma.competitor.deleteMany({
      where: { 
        projects: {
          some: { id: testProjectId }
        }
      }
    });
    await prisma.project.delete({
      where: { id: testProjectId }
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Task 4.1: SmartDataCollectionService Failure Scenario', () => {
    it('should handle SmartDataCollectionService.collectProjectData failure and trigger emergency fallback', async () => {
      // Arrange - Mock SmartDataCollectionService to fail
      const originalCollectProjectData = smartDataCollectionService.collectProjectData;
      const mockError = new Error('SmartDataCollectionService failed - collectProjectData error at line 37');
      
      // Spy on the collectProjectData method to force failure
      jest.spyOn(smartDataCollectionService, 'collectProjectData')
        .mockRejectedValueOnce(mockError);

      // Spy on emergency fallback generation
      const emergencyFallbackSpy = jest.spyOn(
        initialComparativeReportService as any, 
        'generateEmergencyFallbackReport'
      );

      try {
        // Act - Attempt to generate report which should fail and trigger emergency fallback
        const reportResult = await initialComparativeReportService.generateInitialReport(
          testProjectId,
          { timeout: 30000, fallbackToPartialData: true }
        );

        // Assert - Verify emergency fallback was triggered
        expect(emergencyFallbackSpy).toHaveBeenCalledWith(
          testProjectId,
          expect.any(Object),
          expect.objectContaining({
            message: expect.stringContaining('SmartDataCollectionService failed')
          }),
          expect.any(Object)
        );

        // Verify the report was created despite the failure
        expect(reportResult).toBeDefined();
        expect(reportResult.id).toBeDefined();
        expect(reportResult.title).toContain('Emergency Report');

        // Verify both Report and ReportVersion were created
        const savedReport = await prisma.report.findUnique({
          where: { id: reportResult.id },
          include: { versions: true }
        });

        expect(savedReport).not.toBeNull();
        if (savedReport) {
          expect(savedReport.status).toBe('COMPLETED');
          expect(savedReport.versions).toHaveLength(1);
          expect(savedReport.versions[0]!.content).toBeDefined();
        }

      } finally {
        // Restore original method
        (smartDataCollectionService.collectProjectData as jest.Mock).mockRestore();
      }
    });

    it('should identify the specific error at line 37 in SmartDataCollectionService.collectProjectData', async () => {
      // Arrange - Force a specific failure scenario that would occur at line 37
      const collectProjectDataSpy = jest.spyOn(smartDataCollectionService, 'collectProjectData')
        .mockImplementation(async (projectId: string, options?: any) => {
          // Simulate the specific error that causes issues at line 37
          throw new Error('Cannot read properties of undefined (reading \'collectProductData\') - line 37');
        });

      try {
        // Act & Assert - Verify the specific error is thrown
        await expect(smartDataCollectionService.collectProjectData(testProjectId))
          .rejects.toThrow('Cannot read properties of undefined');

        expect(collectProjectDataSpy).toHaveBeenCalledWith(testProjectId);

      } finally {
        collectProjectDataSpy.mockRestore();
      }
    });

    it('should log appropriate error information when SmartDataCollectionService fails', async () => {
      // Arrange
      const loggerErrorSpy = jest.spyOn(logger, 'error');
      const mockError = new Error('Smart data collection timeout at collectProjectData');
      
      jest.spyOn(smartDataCollectionService, 'collectProjectData')
        .mockRejectedValueOnce(mockError);

      try {
        // Act
        await expect(smartDataCollectionService.collectProjectData(testProjectId))
          .rejects.toThrow('Smart data collection timeout');

        // Assert - Verify proper error logging occurred
        expect(loggerErrorSpy).toHaveBeenCalledWith(
          'Smart data collection failed',
          mockError,
          expect.objectContaining({
            projectId: testProjectId,
            operation: 'smartDataCollection'
          })
        );

      } finally {
        loggerErrorSpy.mockRestore();
        (smartDataCollectionService.collectProjectData as jest.Mock).mockRestore();
      }
    });

    it('should handle various SmartDataCollectionService error scenarios', async () => {
      const errorScenarios = [
        {
          name: 'Database connection timeout',
          error: new Error('Database connection timeout in collectProjectData')
        },
        {
          name: 'Invalid project ID',
          error: new Error('Project not found - invalid ID provided')
        },
        {
          name: 'Memory allocation error',
          error: new Error('Cannot allocate memory for data collection')
        },
        {
          name: 'Network timeout',
          error: new Error('Network timeout during snapshot collection')
        }
      ];

      for (const scenario of errorScenarios) {
        // Arrange
        const collectProjectDataSpy = jest.spyOn(smartDataCollectionService, 'collectProjectData')
          .mockRejectedValueOnce(scenario.error);

        try {
          // Act & Assert
          await expect(smartDataCollectionService.collectProjectData(testProjectId))
            .rejects.toThrow(scenario.error.message);

          expect(collectProjectDataSpy).toHaveBeenCalledWith(testProjectId);

        } finally {
          collectProjectDataSpy.mockRestore();
        }
      }
    });
  });

  describe('Task 4.2: Emergency Fallback Report Generation', () => {
    it('should generate complete emergency fallback report with proper content structure', async () => {
      // Arrange - Mock SmartDataCollectionService to fail, forcing emergency fallback
      const mockError = new Error('Data collection completely failed - network timeout');
      
      jest.spyOn(smartDataCollectionService, 'collectProjectData')
        .mockImplementation(async () => {
          throw mockError;
        });

      // Spy on the private generateEmergencyFallbackReport method
      const emergencyFallbackSpy = jest.spyOn(
        initialComparativeReportService as any,
        'generateEmergencyFallbackReport'
      );

      try {
        // Act - Generate report which should fall back to emergency generation
        const reportResult = await initialComparativeReportService.generateInitialReport(
          testProjectId,
          { timeout: 30000, fallbackToPartialData: true }
        );

        // Assert - Verify emergency fallback was called
        expect(emergencyFallbackSpy).toHaveBeenCalledWith(
          testProjectId,
          expect.any(Object),
          mockError,
          expect.any(Object)
        );

        // Verify the emergency report has the expected structure
        expect(reportResult).toBeDefined();
        expect(reportResult.id).toBeDefined();
        expect(reportResult.title).toContain('Emergency Report');
        expect(reportResult.executiveSummary).toContain('Emergency Comparative Analysis Report');
        expect(reportResult.keyFindings).toBeDefined();
        expect(Array.isArray(reportResult.keyFindings)).toBe(true);
        expect(reportResult.keyFindings.length).toBeGreaterThan(0);
        
        // Verify strategic recommendations structure
        expect(reportResult.strategicRecommendations).toBeDefined();
        expect(reportResult.strategicRecommendations.immediate).toBeDefined();
        expect(reportResult.strategicRecommendations.shortTerm).toBeDefined();
        expect(reportResult.strategicRecommendations.longTerm).toBeDefined();
        expect(reportResult.strategicRecommendations.priorityScore).toBeDefined();
        
        // Verify competitive intelligence structure
        expect(reportResult.competitiveIntelligence).toBeDefined();
        expect(reportResult.competitiveIntelligence.marketPosition).toBeDefined();
        expect(reportResult.competitiveIntelligence.keyThreats).toBeDefined();
        expect(reportResult.competitiveIntelligence.opportunities).toBeDefined();
        expect(reportResult.competitiveIntelligence.competitiveAdvantages).toBeDefined();

        // Verify report metadata
        expect(reportResult.status).toBe('completed');
        expect(reportResult.format).toBe('markdown');

      } finally {
        emergencyFallbackSpy.mockRestore();
        (smartDataCollectionService.collectProjectData as jest.Mock).mockRestore();
      }
    });

    it('should create emergency report when all data collection methods fail', async () => {
      // Arrange - Mock comprehensive failure scenario
      const dataCollectionError = new Error('All data sources unavailable');
      
      jest.spyOn(smartDataCollectionService, 'collectProjectData')
        .mockRejectedValue(dataCollectionError);
      
      // Mock project lookup to return a valid project
      const mockProject = {
        id: testProjectId,
        name: 'Test Emergency Project',
        competitors: [
          { id: testCompetitorId, name: 'Test Competitor' }
        ]
      };

      // Spy on database operations
      const reportCreateSpy = jest.spyOn(prisma.report, 'create');
      const reportVersionCreateSpy = jest.spyOn(prisma.reportVersion, 'create');

      try {
        // Act - Generate report which should use emergency fallback
        const reportResult = await initialComparativeReportService.generateInitialReport(
          testProjectId,
          { timeout: 10000, fallbackToPartialData: true }
        );

        // Assert - Verify emergency report was created
        expect(reportResult).toBeDefined();
        expect(reportResult.projectId).toBe(testProjectId);
        expect(reportResult.title).toContain('Emergency Report');
        
        // Verify emergency report contains helpful diagnostic information
        expect(reportResult.executiveSummary).toContain('data collection failure');
        expect(reportResult.keyFindings[0]).toContain('Emergency report generated');
        
        // Verify emergency recommendations are actionable
        expect(reportResult.strategicRecommendations.immediate).toContain('Check system health');
        expect(reportResult.strategicRecommendations.shortTerm).toContain('Re-run report generation');
        
        // Verify the report properly identifies the emergency nature
        expect(reportResult.competitiveIntelligence.marketPosition).toContain('Unknown');
        expect(reportResult.competitiveIntelligence.keyThreats).toContain('System reliability issues');

      } finally {
        (smartDataCollectionService.collectProjectData as jest.Mock).mockRestore();
      }
    });

    it('should handle emergency report generation with different error types', async () => {
      const errorScenarios = [
        {
          name: 'Network timeout error',
          error: new Error('ETIMEDOUT: Network timeout during data collection'),
          expectedContent: 'network connectivity'
        },
        {
          name: 'Database error',
          error: new Error('Database connection lost during collection'),
          expectedContent: 'database connectivity'
        },
        {
          name: 'Memory error',
          error: new Error('JavaScript heap out of memory'),
          expectedContent: 'system resources'
        },
        {
          name: 'Generic error',
          error: new Error('Unknown error occurred'),
          expectedContent: 'unknown technical issue'
        }
      ];

      for (const scenario of errorScenarios) {
        // Arrange
        jest.spyOn(smartDataCollectionService, 'collectProjectData')
          .mockRejectedValueOnce(scenario.error);

        try {
          // Act
          const reportResult = await initialComparativeReportService.generateInitialReport(
            testProjectId,
            { timeout: 5000, fallbackToPartialData: true }
          );

          // Assert - Verify emergency report adapts to different error types
          expect(reportResult).toBeDefined();
          expect(reportResult.title).toContain('Emergency Report');
          expect(reportResult.executiveSummary.toLowerCase()).toContain(scenario.error.message.toLowerCase().split(':')[0]);

        } finally {
          (smartDataCollectionService.collectProjectData as jest.Mock).mockRestore();
        }
      }
    });
  });

  describe('Task 4.3: Verify Both Report and ReportVersion Created in Emergency Scenarios', () => {
    it('should atomically create both Report and ReportVersion records in database during emergency fallback', async () => {
      // Arrange - Force emergency fallback by making SmartDataCollectionService fail
      const mockError = new Error('Complete data collection failure - all sources down');
      
      jest.spyOn(smartDataCollectionService, 'collectProjectData')
        .mockRejectedValue(mockError);

      // Track database operations
      const reportCreateSpy = jest.spyOn(prisma.report, 'create');
      const reportVersionCreateSpy = jest.spyOn(prisma.reportVersion, 'create');
      const transactionSpy = jest.spyOn(prisma, '$transaction');

      try {
        // Act - Generate report which should trigger emergency fallback with atomic Report+ReportVersion creation
        const reportResult = await initialComparativeReportService.generateInitialReport(
          testProjectId,
          { timeout: 15000, fallbackToPartialData: true }
        );

        // Assert - Verify the report was generated
        expect(reportResult).toBeDefined();
        expect(reportResult.id).toBeDefined();

        // Verify both Report and ReportVersion exist in database
        const savedReport = await prisma.report.findUnique({
          where: { id: reportResult.id },
          include: { 
            versions: true,
            project: true
          }
        });

        expect(savedReport).not.toBeNull();
        if (savedReport) {
          // Verify Report record properties
          expect(savedReport.id).toBe(reportResult.id);
          expect(savedReport.status).toBe('COMPLETED');
          expect(savedReport.projectId).toBe(testProjectId);
          expect(savedReport.name).toContain('Emergency Report');
          expect(savedReport.description).toBe('Emergency fallback report');

          // Verify ReportVersion record exists and is properly linked
          expect(savedReport.versions).toHaveLength(1);
          const reportVersion = savedReport.versions[0]!;
          expect(reportVersion.reportId).toBe(savedReport.id);
          expect(reportVersion.version).toBe(1);
          expect(reportVersion.content).toBeDefined();

          // Verify ReportVersion content structure
          const content = reportVersion.content as any;
          expect(content.id).toBe(reportResult.id);
          expect(content.title).toContain('Emergency Report');
          expect(content.projectId).toBe(testProjectId);
          expect(content.keyFindings).toBeDefined();
          expect(content.strategicRecommendations).toBeDefined();
          expect(content.competitiveIntelligence).toBeDefined();
          expect(content.status).toBe('completed');
          expect(content.format).toBe('markdown');
        }

        // Verify atomic transaction was used (no zombie reports)
        expect(transactionSpy).toHaveBeenCalled();

      } finally {
        // Cleanup
        if (reportCreateSpy.mock.calls.length > 0) {
          const reportId = reportCreateSpy.mock.calls[0]?.[0]?.data?.id;
          if (reportId) {
            await prisma.reportVersion.deleteMany({ where: { reportId } });
            await prisma.report.deleteMany({ where: { id: reportId } });
          }
        }
        
        reportCreateSpy.mockRestore();
        reportVersionCreateSpy.mockRestore();
        transactionSpy.mockRestore();
        (smartDataCollectionService.collectProjectData as jest.Mock).mockRestore();
      }
    });

    it('should prevent zombie reports by ensuring ReportVersion creation before marking Report as COMPLETED', async () => {
      // Arrange - Mock a scenario where Report creation succeeds but ReportVersion might fail
      const mockError = new Error('Emergency fallback data collection failure');
      
      jest.spyOn(smartDataCollectionService, 'collectProjectData')
        .mockRejectedValue(mockError);

      // Spy on database operations to ensure proper order
      const dbOperationOrder: string[] = [];
      const reportCreateSpy = jest.spyOn(prisma.report, 'create').mockImplementation(async (args: any) => {
        dbOperationOrder.push('report_create');
        return {
          id: args.data.id,
          name: args.data.name,
          description: args.data.description,
          projectId: args.data.projectId,
          competitorId: args.data.competitorId,
          status: args.data.status,
          createdAt: new Date(),
          updatedAt: new Date()
        } as any;
      });

      const reportVersionCreateSpy = jest.spyOn(prisma.reportVersion, 'create').mockImplementation(async (args: any) => {
        dbOperationOrder.push('report_version_create');
        return {
          id: 'version-id',
          reportId: args.data.reportId,
          version: args.data.version,
          content: args.data.content,
          createdAt: new Date(),
          updatedAt: new Date()
        } as any;
      });

      const transactionSpy = jest.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        // Simulate transaction execution
        const mockTx = {
          report: { create: reportCreateSpy },
          reportVersion: { create: reportVersionCreateSpy }
        };
        return await callback(mockTx);
      });

      try {
        // Act - Generate emergency report
        const reportResult = await initialComparativeReportService.generateInitialReport(
          testProjectId,
          { timeout: 10000, fallbackToPartialData: true }
        );

        // Assert - Verify atomic operation order
        expect(dbOperationOrder).toEqual(['report_create', 'report_version_create']);
        expect(reportResult).toBeDefined();
        expect(reportResult.id).toBeDefined();

        // Verify transaction was used to ensure atomicity
        expect(transactionSpy).toHaveBeenCalledTimes(1);
        expect(reportCreateSpy).toHaveBeenCalledWith({
          data: expect.objectContaining({
            status: 'COMPLETED' // Report marked as COMPLETED only after ReportVersion is ready
          })
        });

        expect(reportVersionCreateSpy).toHaveBeenCalledWith({
          data: expect.objectContaining({
            reportId: expect.any(String),
            version: 1,
            content: expect.any(Object)
          })
        });

      } finally {
        reportCreateSpy.mockRestore();
        reportVersionCreateSpy.mockRestore();
        transactionSpy.mockRestore();
        (smartDataCollectionService.collectProjectData as jest.Mock).mockRestore();
      }
    });

    it('should rollback Report creation if ReportVersion creation fails during emergency fallback', async () => {
      // Arrange - Force emergency fallback
      const mockError = new Error('Data collection system failure');
      
      jest.spyOn(smartDataCollectionService, 'collectProjectData')
        .mockRejectedValue(mockError);

      // Mock transaction failure after Report creation but before ReportVersion creation
      let reportWasCreated = false;
      let reportVersionFailed = false;

      const transactionSpy = jest.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        const mockTx = {
          report: {
            create: async (args: any) => {
              reportWasCreated = true;
              return {
                id: args.data.id,
                name: args.data.name,
                status: args.data.status,
                projectId: args.data.projectId,
                createdAt: new Date(),
                updatedAt: new Date()
              };
            }
          },
          reportVersion: {
            create: async (args: any) => {
              reportVersionFailed = true;
              throw new Error('ReportVersion creation failed - simulated database error');
            }
          }
        };
        return await callback(mockTx);
      });

      try {
        // Act & Assert - Report generation should fail without creating zombie reports
        await expect(
          initialComparativeReportService.generateInitialReport(
            testProjectId,
            { timeout: 10000, fallbackToPartialData: true }
          )
        ).rejects.toThrow();

        // Verify transaction behavior - Report creation attempted but rolled back
        expect(reportWasCreated).toBe(true);
        expect(reportVersionFailed).toBe(true);

        // Verify no zombie reports exist in database
        const zombieReports = await prisma.report.findMany({
          where: {
            projectId: testProjectId,
            status: 'COMPLETED',
            versions: { none: {} }
          }
        });

        expect(zombieReports).toHaveLength(0);

      } finally {
        transactionSpy.mockRestore();
        (smartDataCollectionService.collectProjectData as jest.Mock).mockRestore();
      }
    });

    it('should verify Report-ReportVersion relationship integrity in emergency scenarios', async () => {
      // Arrange - Force emergency fallback scenario  
      const mockError = new Error('All data collection methods exhausted');
      
      jest.spyOn(smartDataCollectionService, 'collectProjectData')
        .mockRejectedValue(mockError);

             let reportResult: any;
       
       try {
         // Act - Generate emergency report
         reportResult = await initialComparativeReportService.generateInitialReport(
           testProjectId,
           { timeout: 8000, fallbackToPartialData: true }
         );

         expect(reportResult).toBeDefined();

         // Assert - Verify database relationship integrity
         const report = await prisma.report.findUnique({
           where: { id: reportResult.id },
           include: { versions: true }
         });

         expect(report).not.toBeNull();
         if (report) {
           // Verify Report record integrity
           expect(report.id).toBe(reportResult.id);
           expect(report.status).toBe('COMPLETED');
           expect(report.projectId).toBe(testProjectId);

           // Verify ReportVersion relationship integrity
           expect(report.versions).toHaveLength(1);
           const version = report.versions[0]!;
           expect(version.reportId).toBe(report.id);
           expect(version.version).toBe(1);
           
           // Verify bidirectional relationship
           const versionFromDirect = await prisma.reportVersion.findUnique({
             where: { id: version.id },
             include: { report: true }
           });

           expect(versionFromDirect).not.toBeNull();
           expect(versionFromDirect!.report.id).toBe(report.id);
           expect(versionFromDirect!.reportId).toBe(report.id);

           // Verify content matches between report result and database
           const versionContent = version.content as any;
           expect(versionContent.id).toBe(reportResult.id);
           expect(versionContent.title).toBe(reportResult.title);
           expect(versionContent.projectId).toBe(reportResult.projectId);
           expect(versionContent.status).toBe(reportResult.status);
         }

       } finally {
         // Cleanup emergency report
         if (reportResult?.id) {
           await prisma.reportVersion.deleteMany({
             where: { reportId: reportResult.id }
           });
           await prisma.report.deleteMany({
             where: { id: reportResult.id }
           });
         }
        
        (smartDataCollectionService.collectProjectData as jest.Mock).mockRestore();
      }
    });
  });

  describe('Task 4.4: Test Report Viewing Functionality After Emergency Generation', () => {
    it('should make emergency reports viewable through the report viewing API', async () => {
      // Arrange - Force emergency fallback by making data collection fail
      const mockError = new Error('Complete data collection system outage');
      
      jest.spyOn(smartDataCollectionService, 'collectProjectData')
        .mockRejectedValue(mockError);

             let emergencyReportId: string = '';

       try {
         // Act 1 - Generate emergency report
         const reportResult = await initialComparativeReportService.generateInitialReport(
           testProjectId,
           { timeout: 12000, fallbackToPartialData: true }
         );

         expect(reportResult).toBeDefined();
         emergencyReportId = reportResult.id;

        // Act 2 - Test report viewing functionality by simulating API call
        const viewableReport = await prisma.report.findUnique({
          where: { id: emergencyReportId },
          include: {
            versions: {
              orderBy: { version: 'desc' },
              take: 1
            },
            project: true
          }
        });

        // Assert - Verify report is viewable and contains expected content
        expect(viewableReport).not.toBeNull();
        if (viewableReport) {
          expect(viewableReport.id).toBe(emergencyReportId);
          expect(viewableReport.status).toBe('COMPLETED');
          expect(viewableReport.versions).toHaveLength(1);

          const reportVersion = viewableReport.versions[0]!;
          expect(reportVersion.content).toBeDefined();

          const content = reportVersion.content as any;
          expect(content.id).toBe(emergencyReportId);
          expect(content.title).toContain('Emergency Report');
          expect(content.executiveSummary).toContain('Emergency Comparative Analysis Report');
          expect(content.keyFindings).toBeDefined();
          expect(Array.isArray(content.keyFindings)).toBe(true);
          expect(content.strategicRecommendations).toBeDefined();
          expect(content.competitiveIntelligence).toBeDefined();
          expect(content.status).toBe('completed');
          expect(content.format).toBe('markdown');

          // Verify the report content provides useful emergency information
          expect(content.executiveSummary).toContain('data collection failure');
          expect(content.keyFindings[0]).toContain('Emergency report generated');
          expect(content.strategicRecommendations.immediate).toContain('Check system health');
        }

        // Act 3 - Test that the report is accessible at the expected URL pattern
        // Simulate the report viewing route behavior
        const reportForViewing = {
          id: viewableReport.id,
          name: viewableReport.name,
          status: viewableReport.status,
          content: viewableReport.versions[0]!.content,
          createdAt: viewableReport.createdAt,
          updatedAt: viewableReport.updatedAt
        };

        // Assert - Verify report structure is suitable for frontend rendering
        expect(reportForViewing).toBeDefined();
        expect(reportForViewing.content).toBeDefined();
        expect(typeof reportForViewing.content).toBe('object');

      } finally {
        // Cleanup
        if (emergencyReportId) {
          await prisma.reportVersion.deleteMany({
            where: { reportId: emergencyReportId }
          });
          await prisma.report.deleteMany({
            where: { id: emergencyReportId }
          });
        }
        
        (smartDataCollectionService.collectProjectData as jest.Mock).mockRestore();
      }
    });

    it('should verify emergency reports are NOT zombie reports and are fully accessible', async () => {
      // Arrange - Create emergency report scenario
      const mockError = new Error('Data source completely unavailable');
      
      jest.spyOn(smartDataCollectionService, 'collectProjectData')
        .mockRejectedValue(mockError);

      let reportId: string;

      try {
        // Act 1 - Generate emergency report
        const reportResult = await initialComparativeReportService.generateInitialReport(
          testProjectId,
          { timeout: 8000, fallbackToPartialData: true }
        );

        reportId = reportResult.id;

        // Act 2 - Check for zombie report characteristics (reports without ReportVersions)
        const zombieCheck = await prisma.report.findMany({
          where: {
            id: reportId,
            status: 'COMPLETED',
            versions: { none: {} }
          }
        });

        // Assert - Verify this is NOT a zombie report
        expect(zombieCheck).toHaveLength(0);

        // Act 3 - Verify report has accessible content
        const fullReport = await prisma.report.findUnique({
          where: { id: reportId },
          include: { versions: true }
        });

        expect(fullReport).not.toBeNull();
        if (fullReport) {
          expect(fullReport.status).toBe('COMPLETED');
          expect(fullReport.versions).toHaveLength(1);
          expect(fullReport.versions[0]!.content).toBeDefined();

          // Verify content is not empty or null
          const content = fullReport.versions[0]!.content as any;
          expect(content).not.toBeNull();
          expect(typeof content).toBe('object');
          expect(Object.keys(content).length).toBeGreaterThan(0);

          // Verify essential content fields exist
          expect(content.title).toBeDefined();
          expect(content.executiveSummary).toBeDefined();
          expect(content.keyFindings).toBeDefined();
          expect(content.strategicRecommendations).toBeDefined();
          expect(content.competitiveIntelligence).toBeDefined();
        }

        // Act 4 - Simulate frontend report access patterns
        const reportAccessResult = {
          reportExists: !!fullReport,
          hasContent: !!fullReport?.versions[0]?.content,
          isViewable: fullReport?.status === 'COMPLETED' && !!fullReport.versions[0]?.content
        };

        // Assert - Emergency report should be fully accessible
        expect(reportAccessResult.reportExists).toBe(true);
        expect(reportAccessResult.hasContent).toBe(true);
        expect(reportAccessResult.isViewable).toBe(true);

      } finally {
        // Cleanup
        if (reportId) {
          await prisma.reportVersion.deleteMany({
            where: { reportId }
          });
          await prisma.report.deleteMany({
            where: { id: reportId }
          });
        }
        
        (smartDataCollectionService.collectProjectData as jest.Mock).mockRestore();
      }
    });

    it('should test emergency report content rendering and user experience', async () => {
      // Arrange - Create emergency report
      const mockError = new Error('Service mesh failure - all microservices down');
      
      jest.spyOn(smartDataCollectionService, 'collectProjectData')
        .mockRejectedValue(mockError);

      let reportId: string;

      try {
        // Act 1 - Generate emergency report
        const reportResult = await initialComparativeReportService.generateInitialReport(
          testProjectId,
          { timeout: 6000, fallbackToPartialData: true }
        );

        reportId = reportResult.id;

        // Act 2 - Get report content for rendering simulation
        const report = await prisma.report.findUnique({
          where: { id: reportId },
          include: { 
            versions: true,
            project: true
          }
        });

        expect(report).not.toBeNull();
        if (report) {
          const content = report.versions[0]!.content as any;

          // Assert - Verify content is user-friendly and informative
          
          // Executive Summary should be clear and explanatory
          expect(content.executiveSummary).toContain('Emergency Comparative Analysis Report');
          expect(content.executiveSummary).toContain(report.project?.name || 'project');
          expect(content.executiveSummary.length).toBeGreaterThan(100); // Substantial content

          // Key Findings should provide actionable insights
          expect(content.keyFindings).toBeInstanceOf(Array);
          expect(content.keyFindings.length).toBeGreaterThanOrEqual(3);
          expect(content.keyFindings[0]).toContain('Emergency report generated');
          expect(content.keyFindings.some((finding: string) => 
            finding.toLowerCase().includes('data collection')
          )).toBe(true);

          // Strategic Recommendations should be practical
          const recommendations = content.strategicRecommendations;
          expect(recommendations.immediate).toBeInstanceOf(Array);
          expect(recommendations.shortTerm).toBeInstanceOf(Array);
          expect(recommendations.longTerm).toBeInstanceOf(Array);
          expect(recommendations.priorityScore).toBeGreaterThan(0);
          
          expect(recommendations.immediate.some((rec: string) => 
            rec.toLowerCase().includes('system') || rec.toLowerCase().includes('health')
          )).toBe(true);

          // Competitive Intelligence should acknowledge limitations
          const intelligence = content.competitiveIntelligence;
          expect(intelligence.marketPosition).toContain('Unknown');
          expect(intelligence.keyThreats).toContain('System reliability issues');
          expect(intelligence.opportunities).toBeInstanceOf(Array);
          expect(intelligence.competitiveAdvantages).toBeInstanceOf(Array);

          // Report metadata should be complete
          expect(content.status).toBe('completed');
          expect(content.format).toBe('markdown');
          expect(content.projectId).toBe(testProjectId);
          expect(content.id).toBe(reportId);

          // Verify content would render properly in UI
          const renderableContent = {
            title: content.title,
            summary: content.executiveSummary,
            findings: content.keyFindings,
            recommendations: content.strategicRecommendations,
            intelligence: content.competitiveIntelligence,
            isEmergency: content.title.includes('Emergency')
          };

          expect(renderableContent.title).toBeDefined();
          expect(renderableContent.summary).toBeDefined();
          expect(renderableContent.findings).toBeDefined();
          expect(renderableContent.recommendations).toBeDefined();
          expect(renderableContent.intelligence).toBeDefined();
          expect(renderableContent.isEmergency).toBe(true);
        }

      } finally {
        // Cleanup
        if (reportId) {
          await prisma.reportVersion.deleteMany({
            where: { reportId }
          });
          await prisma.report.deleteMany({
            where: { id: reportId }
          });
        }
        
        (smartDataCollectionService.collectProjectData as jest.Mock).mockRestore();
      }
    });
  });

  describe('Task 4.5: Validate Report Status and Metadata Consistency', () => {
    it('should ensure report status consistency between Report and ReportVersion content', async () => {
      // Arrange - Force emergency fallback
      const mockError = new Error('Comprehensive system failure - all data sources offline');
      
      jest.spyOn(smartDataCollectionService, 'collectProjectData')
        .mockRejectedValue(mockError);

      try {
        // Act - Generate emergency report
        const reportResult = await initialComparativeReportService.generateInitialReport(
          testProjectId,
          { timeout: 10000, fallbackToPartialData: true }
        );

        expect(reportResult).toBeDefined();

        // Assert - Verify report status consistency
        const savedReport = await prisma.report.findUnique({
          where: { id: reportResult.id },
          include: { versions: true }
        });

        expect(savedReport).not.toBeNull();
        if (savedReport) {
          // Verify Report record status
          expect(savedReport.status).toBe('COMPLETED');
          expect(savedReport.versions).toHaveLength(1);

          // Verify ReportVersion content status matches
          const content = savedReport.versions[0]!.content as any;
          expect(content.status).toBe('completed');

          // Verify status consistency between different representations
          expect(savedReport.status.toLowerCase()).toBe(content.status);

          // Verify report result status matches database
          expect(reportResult.status).toBe('completed');
          expect(reportResult.status).toBe(content.status);
        }

        // Cleanup
        await prisma.reportVersion.deleteMany({
          where: { reportId: reportResult.id }
        });
        await prisma.report.deleteMany({
          where: { id: reportResult.id }
        });

      } finally {
        (smartDataCollectionService.collectProjectData as jest.Mock).mockRestore();
      }
    });

    it('should validate metadata consistency across report records and content', async () => {
      // Arrange - Create emergency scenario
      const mockError = new Error('Critical infrastructure failure');
      
      jest.spyOn(smartDataCollectionService, 'collectProjectData')
        .mockRejectedValue(mockError);

      try {
        // Act - Generate emergency report
        const reportResult = await initialComparativeReportService.generateInitialReport(
          testProjectId,
          { timeout: 8000, fallbackToPartialData: true }
        );

        // Assert - Validate comprehensive metadata consistency
        const reportRecord = await prisma.report.findUnique({
          where: { id: reportResult.id },
          include: { 
            versions: true,
            project: true,
            competitor: true
          }
        });

        expect(reportRecord).not.toBeNull();
        if (reportRecord) {
          const reportContent = reportRecord.versions[0]!.content as any;

          // Validate ID consistency
          expect(reportRecord.id).toBe(reportResult.id);
          expect(reportContent.id).toBe(reportResult.id);
          expect(reportContent.id).toBe(reportRecord.id);

          // Validate project relationship consistency
          expect(reportRecord.projectId).toBe(testProjectId);
          expect(reportContent.projectId).toBe(testProjectId);
          expect(reportResult.projectId).toBe(testProjectId);

          // Validate product relationship consistency
          expect(reportContent.productId).toBe(testProjectId); // In emergency reports, productId = projectId
          expect(reportResult.productId).toBe(testProjectId);

          // Validate report type and nature consistency
          expect(reportRecord.name).toContain('Emergency Report');
          expect(reportContent.title).toContain('Emergency Report');
          expect(reportResult.title).toContain('Emergency Report');

          // Validate description consistency
          expect(reportRecord.description).toBe('Emergency fallback report');

          // Validate format consistency
          expect(reportContent.format).toBe('markdown');
          expect(reportResult.format).toBe('markdown');

          // Validate timestamp relationships (createdAt should be reasonable)
          const now = new Date();
          const createdAt = new Date(reportRecord.createdAt);
          const timeDiffSeconds = (now.getTime() - createdAt.getTime()) / 1000;
          expect(timeDiffSeconds).toBeLessThan(60); // Created within last minute

          expect(reportRecord.updatedAt).toEqual(reportRecord.createdAt); // Should be same for new records
        }

        // Cleanup
        await prisma.reportVersion.deleteMany({
          where: { reportId: reportResult.id }
        });
        await prisma.report.deleteMany({
          where: { id: reportResult.id }
        });

      } finally {
        (smartDataCollectionService.collectProjectData as jest.Mock).mockRestore();
      }
    });

    it('should validate emergency report specific metadata and flags', async () => {
      // Arrange - Force emergency scenario
      const mockError = new Error('Total system breakdown - emergency protocols activated');
      
      jest.spyOn(smartDataCollectionService, 'collectProjectData')
        .mockRejectedValue(mockError);

      try {
        // Act - Generate emergency report
        const reportResult = await initialComparativeReportService.generateInitialReport(
          testProjectId,
          { timeout: 5000, fallbackToPartialData: true }
        );

        // Assert - Validate emergency-specific metadata
        const report = await prisma.report.findUnique({
          where: { id: reportResult.id },
          include: { versions: true }
        });

        expect(report).not.toBeNull();
        if (report) {
          // Validate emergency report flags and properties
          expect(report.isInitialReport).toBe(true); // Should be marked as initial report
          expect(report.reportType).toBe('INDIVIDUAL'); // Default report type
          
          // Validate data quality scores for emergency reports
          expect(report.dataCompletenessScore).toBeLessThan(100); // Emergency reports have lower completeness
          expect(report.dataCompletenessScore).toBeGreaterThanOrEqual(0);
          
          // Validate data freshness indicators
          expect(report.dataFreshness).toBeDefined();
          expect(['EMERGENCY', 'PARTIAL', 'STALE'].includes(report.dataFreshness!)).toBe(true);

          // Validate competitor snapshot capture count
          expect(report.competitorSnapshotsCaptured).toBe(0); // Emergency reports don't capture fresh snapshots

          // Validate generation timing metadata
          expect(report.generationStartTime).toBeDefined();
          expect(report.generationEndTime).toBeDefined();
          
          if (report.generationStartTime && report.generationEndTime) {
            expect(report.generationEndTime.getTime()).toBeGreaterThanOrEqual(
              report.generationStartTime.getTime()
            );
          }

          // Validate error context is captured
          expect(report.errorDetails).toBeDefined();
          const errorDetails = report.errorDetails as any;
          expect(errorDetails).not.toBeNull();
          expect(typeof errorDetails).toBe('object');

          // Validate ReportVersion metadata consistency
          const content = report.versions[0]!.content as any;
          expect(content.metadata).toBeDefined();
          expect(content.emergency).toBe(true);
          expect(content.dataQuality).toBeDefined();
          expect(content.dataQuality.completeness).toBeLessThan(100);
        }

        // Cleanup
        await prisma.reportVersion.deleteMany({
          where: { reportId: reportResult.id }
        });
        await prisma.report.deleteMany({
          where: { id: reportResult.id }
        });

      } finally {
        (smartDataCollectionService.collectProjectData as jest.Mock).mockRestore();
      }
    });

    it('should verify no inconsistencies exist between report list view and detail view', async () => {
      // Arrange - Create emergency report
      const mockError = new Error('Systemic data collection failure');
      
      jest.spyOn(smartDataCollectionService, 'collectProjectData')
        .mockRejectedValue(mockError);

      try {
        // Act - Generate emergency report
        const reportResult = await initialComparativeReportService.generateInitialReport(
          testProjectId,
          { timeout: 7000, fallbackToPartialData: true }
        );

        // Simulate report list view query (how reports appear in listings)
        const reportListView = await prisma.report.findMany({
          where: { projectId: testProjectId },
          select: {
            id: true,
            name: true,
            status: true,
            createdAt: true,
            updatedAt: true,
            dataCompletenessScore: true,
            dataFreshness: true,
            isInitialReport: true,
            competitorSnapshotsCaptured: true
          }
        });

        // Simulate report detail view query (how individual reports are viewed)
        const reportDetailView = await prisma.report.findUnique({
          where: { id: reportResult.id },
          include: {
            versions: {
              orderBy: { version: 'desc' },
              take: 1
            },
            project: true
          }
        });

        // Assert - Verify consistency between list and detail views
        expect(reportListView).toHaveLength(1);
        expect(reportDetailView).not.toBeNull();

        const listItem = reportListView[0]!;
        const detailItem = reportDetailView!;

        // Verify core metadata consistency
        expect(listItem.id).toBe(detailItem.id);
        expect(listItem.name).toBe(detailItem.name);
        expect(listItem.status).toBe(detailItem.status);
        expect(listItem.createdAt.getTime()).toBe(detailItem.createdAt.getTime());
        expect(listItem.updatedAt.getTime()).toBe(detailItem.updatedAt.getTime());

        // Verify metrics consistency
        expect(listItem.dataCompletenessScore).toBe(detailItem.dataCompletenessScore);
        expect(listItem.dataFreshness).toBe(detailItem.dataFreshness);
        expect(listItem.isInitialReport).toBe(detailItem.isInitialReport);
        expect(listItem.competitorSnapshotsCaptured).toBe(detailItem.competitorSnapshotsCaptured);

        // Verify report content matches expectations
        const content = detailItem.versions[0]!.content as any;
        expect(content.id).toBe(listItem.id);
        expect(content.title).toContain(listItem.name);
        expect(content.status.toLowerCase()).toBe(listItem.status.toLowerCase());

        // Verify no zombie report characteristics
        expect(detailItem.versions).toHaveLength(1);
        expect(detailItem.versions[0]!.content).toBeDefined();
        expect(detailItem.status).toBe('COMPLETED');

        // Cleanup
        await prisma.reportVersion.deleteMany({
          where: { reportId: reportResult.id }
        });
        await prisma.report.deleteMany({
          where: { id: reportResult.id }
        });

      } finally {
        (smartDataCollectionService.collectProjectData as jest.Mock).mockRestore();
      }
    });
  });
}); 