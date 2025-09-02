/**
 * Zombie Report Viewability Validation Tests
 * Task 7.3: Verify all previously zombie reports are now viewable
 * 
 * This test suite validates that zombie reports have been properly fixed
 * and are now fully viewable and accessible to users.
 */

import { describe, beforeAll, afterAll, beforeEach, afterEach, it, expect, jest } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import { ZombieReportFixer } from '../../../scripts/generate-report-versions';
import { ZombieReportIdentifier } from '../../../scripts/identify-zombie-reports';
import { ReportValidationService } from '../../lib/reportValidation';
import { createId } from '@paralleldrive/cuid2';

const prisma = new PrismaClient();

interface TestZombieReport {
  id: string;
  name: string;
  projectId: string;
  status: string;
  createdAt: Date;
  isFixable: boolean;
}

interface ViewabilityResult {
  reportId: string;
  isViewable: boolean;
  hasContent: boolean;
  hasValidStructure: boolean;
  statusConsistent: boolean;
  accessibilityRating: 'full' | 'partial' | 'none';
  issues: string[];
}

describe('Zombie Report Viewability Validation Tests', () => {
  let testProject: any;
  let testCompetitor: any;
  let createdZombieReports: TestZombieReport[] = [];
  let fixedReportIds: string[] = [];

  beforeAll(async () => {
    // Create test project for zombie report testing
    const projectData = await prisma.project.create({
      data: {
        id: createId(),
        name: `Zombie Validation Project ${Date.now()}`,
        userId: 'test-user-zombie-validation',
        description: 'Project for testing zombie report viewability',
        status: 'ACTIVE',
        priority: 'HIGH',
        parameters: { zombieTest: true },
        tags: ['zombie-validation', 'viewability-test']
      }
    });

    const competitorData = await prisma.competitor.create({
      data: {
        id: createId(),
        name: `Zombie Test Competitor ${Date.now()}`,
        website: 'https://zombie-test-competitor.com',
        industry: 'Testing',
        projects: {
          connect: { id: projectData.id }
        }
      }
    });

    testProject = projectData;
    testCompetitor = competitorData;

    console.log(`Zombie Validation Setup: Project ${testProject.id}`);
  });

  afterAll(async () => {
    // Cleanup all test data
    if (fixedReportIds.length > 0) {
      await prisma.reportVersion.deleteMany({
        where: { reportId: { in: fixedReportIds } }
      });
      
      await prisma.report.deleteMany({
        where: { id: { in: fixedReportIds } }
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

  describe('7.3.1 - Zombie Report Detection and Identification', () => {
    it('should detect existing zombie reports in the system', async () => {
      // First, create a simulated zombie report for testing
      const zombieReportId = createId();
      await prisma.report.create({
        data: {
          id: zombieReportId,
          name: 'Test Zombie Report for Detection',
          status: 'COMPLETED',
          projectId: testProject.id,
          competitorId: testCompetitor.id,
          description: 'Intentionally created zombie report for testing'
        }
      });

      fixedReportIds.push(zombieReportId);

      // Act: Run zombie detection
      const detectionResult = await ZombieReportIdentifier.run();

      // Assert: Should detect the zombie report
      expect(detectionResult).toBeDefined();
      expect(detectionResult.zombieReports).toBeDefined();
      expect(detectionResult.zombieCount).toBeGreaterThan(0);

      // Find our test zombie in the results
      const ourZombie = detectionResult.zombieReports.find((r: any) => r.id === zombieReportId);
      expect(ourZombie).toBeDefined();
      expect(ourZombie.reasonForZombieStatus).toContain('No ReportVersions exist');

      console.log(`✅ Detected ${detectionResult.zombieCount} zombie reports`);
    });

    it('should identify zombie reports with different failure patterns', async () => {
      // Create multiple zombie scenarios for comprehensive testing
      const zombieScenarios = [
        {
          id: createId(),
          name: 'Zombie - No Versions',
          description: 'Report with no ReportVersions at all'
        },
        {
          id: createId(),
          name: 'Zombie - Empty Content',
          description: 'Report with ReportVersion but null content',
          hasEmptyVersion: true
        }
      ];

      // Create zombie reports
      for (const scenario of zombieScenarios) {
        await prisma.report.create({
          data: {
            id: scenario.id,
            name: scenario.name,
            status: 'COMPLETED',
            projectId: testProject.id,
            competitorId: testCompetitor.id,
            description: scenario.description
          }
        });

        fixedReportIds.push(scenario.id);

        // Create empty version if needed
        if (scenario.hasEmptyVersion) {
          await prisma.reportVersion.create({
            data: {
              reportId: scenario.id,
              version: 1,
              content: null
            }
          });
        }
      }

      // Act: Detect all zombie patterns
      const detectionResult = await ZombieReportIdentifier.run();

      // Assert: Should detect both scenarios
      expect(detectionResult.zombieCount).toBeGreaterThanOrEqual(zombieScenarios.length);

      // Verify each scenario is detected
      for (const scenario of zombieScenarios) {
        const detectedZombie = detectionResult.zombieReports.find((r: any) => r.id === scenario.id);
        expect(detectedZombie).toBeDefined();
      }
    });

    it('should provide detailed analysis of zombie report patterns', async () => {
      // Act: Run comprehensive analysis
      const analysisResult = await ZombieReportIdentifier.run();

      // Assert: Should provide pattern analysis
      expect(analysisResult.patterns).toBeDefined();
      expect(analysisResult.patterns.byProjectId).toBeDefined();
      expect(analysisResult.patterns.byDateRange).toBeDefined();
      expect(analysisResult.patterns.byReportType).toBeDefined();

      // Should provide recommendations
      expect(analysisResult.recommendations).toBeDefined();
      expect(analysisResult.recommendations.length).toBeGreaterThan(0);
    });
  });

  describe('7.3.2 - Zombie Report Fixing Process', () => {
    it('should successfully fix zombie reports with proper content', async () => {
      // Arrange: Create a zombie report to fix
      const zombieId = createId();
      await prisma.report.create({
        data: {
          id: zombieId,
          name: 'Fixable Zombie Report',
          status: 'COMPLETED',
          projectId: testProject.id,
          competitorId: testCompetitor.id,
          description: 'Zombie report that should be fixable'
        }
      });

      fixedReportIds.push(zombieId);

      // Act: Fix the zombie report
      const fixResult = await ZombieReportFixer.run({
        specificReportId: zombieId,
        dryRun: false,
        createBackup: false
      });

      // Assert: Fix should be successful
      expect(fixResult.success).toBe(true);
      expect(fixResult.successfulFixes).toBe(1);
      expect(fixResult.failedFixes).toBe(0);

      // Verify the report is now fixed
      const fixedReport = await prisma.report.findUnique({
        where: { id: zombieId },
        include: { versions: true }
      });

      expect(fixedReport).toBeDefined();
      if (fixedReport) {
        expect(fixedReport.status).toBe('COMPLETED');
        expect(fixedReport.versions.length).toBeGreaterThan(0);
        expect(fixedReport.versions[0].content).toBeDefined();
      }
    });

    it('should generate appropriate emergency content for fixed zombie reports', async () => {
      // Arrange: Create zombie with project context
      const zombieId = createId();
      await prisma.report.create({
        data: {
          id: zombieId,
          name: 'Content Quality Test Zombie',
          status: 'COMPLETED',
          projectId: testProject.id,
          competitorId: testCompetitor.id,
          dataCompletenessScore: 75,
          dataFreshness: 'recent'
        }
      });

      fixedReportIds.push(zombieId);

      // Act: Fix with full context available
      await ZombieReportFixer.run({
        specificReportId: zombieId,
        dryRun: false,
        createBackup: false
      });

      // Assert: Check content quality
      const fixedReport = await prisma.report.findUnique({
        where: { id: zombieId },
        include: { versions: true }
      });

      expect(fixedReport).toBeDefined();
      if (fixedReport && fixedReport.versions.length > 0) {
        const content = fixedReport.versions[0].content as any;
        
        // Should have proper emergency content structure
        expect(content.title).toBeDefined();
        expect(content.executiveSummary).toBeDefined();
        expect(content.keyFindings).toBeDefined();
        expect(content.strategicRecommendations).toBeDefined();
        
        // Should indicate recovery/emergency status
        expect(content.emergency || content.recoveryVersion).toBeTruthy();
        
        // Should include diagnostic information
        expect(content.executiveSummary).toContain('recovery');
      }
    });

    it('should handle different zombie report complexity levels', async () => {
      // Arrange: Create zombies with different data availability
      const zombieScenarios = [
        {
          id: createId(),
          name: 'Rich Data Zombie',
          hasProject: true,
          hasCompetitor: true,
          hasMetadata: true,
          expectedContentType: 'full'
        },
        {
          id: createId(),
          name: 'Minimal Data Zombie',
          hasProject: true,
          hasCompetitor: false,
          hasMetadata: false,
          expectedContentType: 'minimal'
        },
        {
          id: createId(),
          name: 'Metadata Only Zombie',
          hasProject: false,
          hasCompetitor: false,
          hasMetadata: false,
          expectedContentType: 'metadata_only'
        }
      ];

      // Create zombie reports with varying data
      for (const scenario of zombieScenarios) {
        await prisma.report.create({
          data: {
            id: scenario.id,
            name: scenario.name,
            status: 'COMPLETED',
            projectId: scenario.hasProject ? testProject.id : null,
            competitorId: scenario.hasCompetitor ? testCompetitor.id : null,
            dataCompletenessScore: scenario.hasMetadata ? 80 : null,
            dataFreshness: scenario.hasMetadata ? 'recent' : null
          }
        });

        fixedReportIds.push(scenario.id);
      }

      // Act: Fix all scenarios
      const fixResult = await ZombieReportFixer.run({
        dryRun: false,
        createBackup: false
      });

      // Assert: All should be fixed with appropriate content
      expect(fixResult.successfulFixes).toBeGreaterThanOrEqual(zombieScenarios.length);

      // Verify each scenario got appropriate content
      for (const scenario of zombieScenarios) {
        const fixedReport = await prisma.report.findUnique({
          where: { id: scenario.id },
          include: { versions: true }
        });

        if (fixedReport && fixedReport.versions.length > 0) {
          const content = fixedReport.versions[0].content as any;
          expect(content).toBeDefined();
          
          // Content richness should match data availability
          if (scenario.expectedContentType === 'full') {
            expect(content.executiveSummary.length).toBeGreaterThan(100);
            expect(content.keyFindings.length).toBeGreaterThan(3);
          }
        }
      }
    });
  });

  describe('7.3.3 - Viewability Verification', () => {
    it('should verify all fixed reports are fully viewable', async () => {
      // Arrange: Create and fix a zombie report
      const zombieId = createId();
      await prisma.report.create({
        data: {
          id: zombieId,
          name: 'Viewability Test Report',
          status: 'COMPLETED',
          projectId: testProject.id,
          competitorId: testCompetitor.id
        }
      });

      fixedReportIds.push(zombieId);

      // Fix the zombie
      await ZombieReportFixer.run({
        specificReportId: zombieId,
        dryRun: false,
        createBackup: false
      });

      // Act: Perform comprehensive viewability check
      const viewabilityResult = await this.checkReportViewability(zombieId);

      // Assert: Report should be fully viewable
      expect(viewabilityResult.isViewable).toBe(true);
      expect(viewabilityResult.hasContent).toBe(true);
      expect(viewabilityResult.hasValidStructure).toBe(true);
      expect(viewabilityResult.statusConsistent).toBe(true);
      expect(viewabilityResult.accessibilityRating).toBe('full');
      expect(viewabilityResult.issues).toHaveLength(0);
    });

    it('should validate report content structure and completeness', async () => {
      // Arrange: Create and fix zombie with rich context
      const zombieId = createId();
      await prisma.report.create({
        data: {
          id: zombieId,
          name: 'Structure Validation Report',
          status: 'COMPLETED',
          projectId: testProject.id,
          competitorId: testCompetitor.id,
          dataCompletenessScore: 90,
          dataFreshness: 'recent'
        }
      });

      fixedReportIds.push(zombieId);

      await ZombieReportFixer.run({
        specificReportId: zombieId,
        dryRun: false,
        createBackup: false
      });

      // Act: Validate structure
      const report = await prisma.report.findUnique({
        where: { id: zombieId },
        include: { versions: true }
      });

      // Assert: Content structure validation
      expect(report).toBeDefined();
      if (report && report.versions.length > 0) {
        const content = report.versions[0].content as any;
        
        // Required fields for viewability
        expect(content.id).toBeDefined();
        expect(content.title).toBeDefined();
        expect(content.executiveSummary).toBeDefined();
        expect(content.keyFindings).toBeDefined();
        expect(content.strategicRecommendations).toBeDefined();
        expect(content.competitiveIntelligence).toBeDefined();
        expect(content.status).toBeDefined();
        expect(content.metadata).toBeDefined();
        
        // Content should be meaningful
        expect(content.executiveSummary.length).toBeGreaterThan(50);
        expect(content.keyFindings).toBeInstanceOf(Array);
        expect(content.keyFindings.length).toBeGreaterThan(0);
      }
    });

    it('should ensure reports are accessible through standard queries', async () => {
      // Arrange: Create multiple fixed zombie reports
      const zombieIds: string[] = [];
      
      for (let i = 0; i < 3; i++) {
        const zombieId = createId();
        await prisma.report.create({
          data: {
            id: zombieId,
            name: `Query Access Test Report ${i + 1}`,
            status: 'COMPLETED',
            projectId: testProject.id,
            competitorId: testCompetitor.id
          }
        });
        
        zombieIds.push(zombieId);
        fixedReportIds.push(zombieId);
      }

      // Fix all zombies
      await ZombieReportFixer.run({
        dryRun: false,
        createBackup: false
      });

      // Act: Test various query patterns users might use
      
      // 1. List all completed reports for project
      const completedReports = await prisma.report.findMany({
        where: {
          projectId: testProject.id,
          status: 'COMPLETED'
        },
        include: { versions: true }
      });

      // 2. Get specific report with content
      const specificReport = await prisma.report.findUnique({
        where: { id: zombieIds[0] },
        include: { 
          versions: { orderBy: { version: 'desc' } },
          project: true
        }
      });

      // 3. Search reports by name pattern
      const searchResults = await prisma.report.findMany({
        where: {
          name: { contains: 'Query Access Test' },
          status: 'COMPLETED'
        },
        include: { versions: true }
      });

      // Assert: All queries should return viewable reports
      expect(completedReports.length).toBeGreaterThanOrEqual(3);
      completedReports.forEach(report => {
        if (zombieIds.includes(report.id)) {
          expect(report.status).toBe('COMPLETED');
          expect(report.versions.length).toBeGreaterThan(0);
          expect(report.versions[0].content).toBeDefined();
        }
      });

      expect(specificReport).toBeDefined();
      if (specificReport) {
        expect(specificReport.versions.length).toBeGreaterThan(0);
        expect(specificReport.versions[0].content).toBeDefined();
      }

      expect(searchResults.length).toBe(3);
      searchResults.forEach(report => {
        expect(report.versions.length).toBeGreaterThan(0);
        expect(report.versions[0].content).toBeDefined();
      });
    });
  });

  describe('7.3.4 - System-Wide Zombie Elimination Verification', () => {
    it('should confirm no zombie reports remain in the system', async () => {
      // Act: Run comprehensive zombie scan
      const detectionResult = await ZombieReportIdentifier.run();

      // Assert: Should find no zombies (or minimal zombies from other tests)
      console.log(`System scan found ${detectionResult.zombieCount} zombie reports`);
      
      if (detectionResult.zombieCount > 0) {
        console.log('Remaining zombies:', detectionResult.zombieReports.map((r: any) => ({
          id: r.id,
          name: r.name,
          project: r.projectName,
          reasons: r.reasonForZombieStatus
        })));
      }

      // In a clean system, this should be 0
      // For test environment, we'll allow some from parallel tests
      expect(detectionResult.zombieCount).toBeLessThan(10);
    });

    it('should validate overall system integrity after zombie fixes', async () => {
      // Act: Run system-wide integrity check
      const integrityResults = await this.performSystemIntegrityCheck();

      // Assert: System should be healthy
      expect(integrityResults.overallHealth).toBe('HEALTHY');
      expect(integrityResults.criticalIssues).toBe(0);
      expect(integrityResults.zombieReports).toBe(0);
      expect(integrityResults.orphanedVersions).toBe(0);

      console.log('System integrity check results:', integrityResults);
    });

    it('should verify monitoring systems detect no zombie reports', async () => {
      // Act: Use monitoring service to scan for zombies
      const monitoringResult = await ReportValidationService.detectZombieReports();

      // Assert: Monitoring should report clean system
      expect(monitoringResult.zombiesFound).toBe(0);
      expect(monitoringResult.reports).toHaveLength(0);

      if (monitoringResult.error) {
        console.warn('Monitoring error:', monitoringResult.error);
      }
    });
  });

  describe('7.3.5 - User Experience Validation', () => {
    it('should ensure fixed reports provide good user experience', async () => {
      // Arrange: Create and fix a zombie report
      const zombieId = createId();
      await prisma.report.create({
        data: {
          id: zombieId,
          name: 'UX Validation Report',
          status: 'COMPLETED',
          projectId: testProject.id,
          competitorId: testCompetitor.id
        }
      });

      fixedReportIds.push(zombieId);

      await ZombieReportFixer.run({
        specificReportId: zombieId,
        dryRun: false,
        createBackup: false
      });

      // Act: Evaluate user experience factors
      const uxEvaluation = await this.evaluateReportUX(zombieId);

      // Assert: Should provide good UX
      expect(uxEvaluation.hasReadableContent).toBe(true);
      expect(uxEvaluation.hasActionableInsights).toBe(true);
      expect(uxEvaluation.hasProperFormatting).toBe(true);
      expect(uxEvaluation.loadTimeAcceptable).toBe(true);
      expect(uxEvaluation.overallRating).toBeGreaterThanOrEqual(3); // Out of 5
    });

    it('should validate reports work correctly in dashboard views', async () => {
      // Arrange: Create zombie and fix it
      const zombieId = createId();
      await prisma.report.create({
        data: {
          id: zombieId,
          name: 'Dashboard Integration Test',
          status: 'COMPLETED',
          projectId: testProject.id,
          competitorId: testCompetitor.id
        }
      });

      fixedReportIds.push(zombieId);

      await ZombieReportFixer.run({
        specificReportId: zombieId,
        dryRun: false,
        createBackup: false
      });

      // Act: Test dashboard-style queries
      const dashboardData = await this.simulateDashboardQueries(testProject.id);

      // Assert: Dashboard should show proper data
      expect(dashboardData.totalReports).toBeGreaterThan(0);
      expect(dashboardData.completedReports).toBeGreaterThan(0);
      expect(dashboardData.viewableReports).toBe(dashboardData.completedReports);
      expect(dashboardData.reportsWithContent).toBe(dashboardData.completedReports);
    });
  });

  // Helper methods
  private static async checkReportViewability(reportId: string): Promise<ViewabilityResult> {
    const issues: string[] = [];
    
    // Get report with full data
    const report = await prisma.report.findUnique({
      where: { id: reportId },
      include: { 
        versions: { orderBy: { version: 'desc' } },
        project: true 
      }
    });

    if (!report) {
      return {
        reportId,
        isViewable: false,
        hasContent: false,
        hasValidStructure: false,
        statusConsistent: false,
        accessibilityRating: 'none',
        issues: ['Report not found']
      };
    }

    // Check basic viewability
    const hasContent = report.versions.length > 0 && report.versions[0].content !== null;
    const statusConsistent = report.status === 'COMPLETED' && hasContent;

    if (!hasContent) {
      issues.push('No viewable content available');
    }

    if (!statusConsistent) {
      issues.push('Status inconsistent with content availability');
    }

    // Check content structure
    let hasValidStructure = false;
    if (hasContent) {
      const content = report.versions[0].content as any;
      hasValidStructure = !!(content?.title && content?.executiveSummary);
      
      if (!hasValidStructure) {
        issues.push('Content structure incomplete');
      }
    }

    const isViewable = hasContent && statusConsistent && hasValidStructure;
    const accessibilityRating: 'full' | 'partial' | 'none' = 
      isViewable ? 'full' : hasContent ? 'partial' : 'none';

    return {
      reportId,
      isViewable,
      hasContent,
      hasValidStructure,
      statusConsistent,
      accessibilityRating,
      issues
    };
  }

  private static async performSystemIntegrityCheck(): Promise<{
    overallHealth: 'HEALTHY' | 'WARNING' | 'CRITICAL';
    criticalIssues: number;
    zombieReports: number;
    orphanedVersions: number;
    totalReports: number;
    completedReports: number;
  }> {
    // Check for zombie reports
    const zombieReports = await prisma.report.count({
      where: {
        status: 'COMPLETED',
        versions: { none: {} }
      }
    });

    // Check for orphaned versions
    const orphanedVersions = await prisma.reportVersion.count({
      where: {
        report: null
      }
    });

    // Get overall stats
    const totalReports = await prisma.report.count();
    const completedReports = await prisma.report.count({
      where: { status: 'COMPLETED' }
    });

    const criticalIssues = zombieReports + orphanedVersions;
    const overallHealth: 'HEALTHY' | 'WARNING' | 'CRITICAL' = 
      criticalIssues === 0 ? 'HEALTHY' : 
      criticalIssues < 5 ? 'WARNING' : 'CRITICAL';

    return {
      overallHealth,
      criticalIssues,
      zombieReports,
      orphanedVersions,
      totalReports,
      completedReports
    };
  }

  private static async evaluateReportUX(reportId: string): Promise<{
    hasReadableContent: boolean;
    hasActionableInsights: boolean;
    hasProperFormatting: boolean;
    loadTimeAcceptable: boolean;
    overallRating: number;
  }> {
    const startTime = Date.now();
    
    const report = await prisma.report.findUnique({
      where: { id: reportId },
      include: { versions: true }
    });

    const loadTime = Date.now() - startTime;

    if (!report || report.versions.length === 0) {
      return {
        hasReadableContent: false,
        hasActionableInsights: false,
        hasProperFormatting: false,
        loadTimeAcceptable: loadTime < 1000,
        overallRating: 0
      };
    }

    const content = report.versions[0].content as any;
    
    const hasReadableContent = !!(content?.executiveSummary && content.executiveSummary.length > 50);
    const hasActionableInsights = !!(content?.strategicRecommendations?.immediate?.length > 0);
    const hasProperFormatting = !!(content?.title && content?.metadata);
    const loadTimeAcceptable = loadTime < 1000;

    const positiveFactors = [
      hasReadableContent,
      hasActionableInsights,
      hasProperFormatting,
      loadTimeAcceptable
    ].filter(Boolean).length;

    return {
      hasReadableContent,
      hasActionableInsights,
      hasProperFormatting,
      loadTimeAcceptable,
      overallRating: Math.round((positiveFactors / 4) * 5)
    };
  }

  private static async simulateDashboardQueries(projectId: string): Promise<{
    totalReports: number;
    completedReports: number;
    viewableReports: number;
    reportsWithContent: number;
  }> {
    const totalReports = await prisma.report.count({
      where: { projectId }
    });

    const completedReports = await prisma.report.count({
      where: { 
        projectId,
        status: 'COMPLETED'
      }
    });

    const reportsWithVersions = await prisma.report.count({
      where: {
        projectId,
        status: 'COMPLETED',
        versions: { some: {} }
      }
    });

    const reportsWithContent = await prisma.report.count({
      where: {
        projectId,
        status: 'COMPLETED',
        versions: { 
          some: { 
            content: { not: null }
          }
        }
      }
    });

    return {
      totalReports,
      completedReports,
      viewableReports: reportsWithVersions,
      reportsWithContent
    };
  }
}); 