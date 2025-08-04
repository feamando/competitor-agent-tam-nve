/**
 * Integration tests for Task 3.x: Report Generation Validation and Recovery
 * Tests emergency fallback systems, zombie report detection, and content quality
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { EmergencyFallbackSystem } from '../../lib/emergency-fallback/EmergencyFallbackSystem';
import { ReportValidationService } from '../../lib/reportValidation';
import prisma from '../../lib/prisma';
import { createId } from '@paralleldrive/cuid2';

describe('Task 3.x: Report Generation Validation and Recovery', () => {
  let testProjectId: string;
  let testReportId: string;
  
  beforeEach(async () => {
    // Create test project
    testProjectId = createId();
    await prisma.project.create({
      data: {
        id: testProjectId,
        name: 'Test Project for Report Validation',
        description: 'Test project for emergency fallback and zombie report tests'
      }
    });
  });

  afterEach(async () => {
    // Cleanup test data
    if (testReportId) {
      await prisma.reportVersion.deleteMany({ where: { reportId: testReportId } });
      await prisma.report.deleteMany({ where: { id: testReportId } });
    }
    await prisma.project.deleteMany({ where: { id: testProjectId } });
  });

  describe('Task 3.1: Emergency Fallback Report Generation Status', () => {
    test('should create proper ReportVersion records for emergency reports', async () => {
      // Test that emergency fallback creates both Report and ReportVersion
      const emergencySystem = EmergencyFallbackSystem.getInstance();
      
      const result = await emergencySystem.executeWithFallback(
        async () => {
          throw new Error('Simulated report generation failure');
        },
        {
          projectId: testProjectId,
          operationType: 'report_generation',
          originalError: new Error('Test error'),
          correlationId: createId(),
          enableEmergencyMode: true
        }
      );
      
      expect(result.success).toBe(true);
      expect(result.fallbackUsed).toBe(true);
      expect(result.fallbackType).toBe('emergency_report');
      
      // Verify the report was created with ReportVersion
      const reports = await prisma.report.findMany({
        where: { projectId: testProjectId },
        include: { versions: true }
      });
      
      expect(reports.length).toBe(1);
      testReportId = reports[0].id;
      
      // Task 3.1: Verify ReportVersion was created (no zombie report)
      expect(reports[0].versions.length).toBeGreaterThan(0);
      expect(reports[0].versions[0].content).toBeDefined();
      expect(reports[0].status).toBe('COMPLETED');
    });

    test('should prevent zombie reports through database transactions', async () => {
      // This test verifies the transaction ensures both Report and ReportVersion are created
      const emergencySystem = EmergencyFallbackSystem.getInstance();
      
      await emergencySystem.executeWithFallback(
        async () => { throw new Error('Test failure'); },
        {
          projectId: testProjectId,
          operationType: 'report_generation',
          originalError: new Error('Test error'),
          correlationId: createId()
        }
      );
      
      // Verify no zombie reports exist
      const zombieDetection = await ReportValidationService.detectZombieReports(testProjectId);
      expect(zombieDetection.zombiesFound).toBe(0);
    });
  });

  describe('Task 3.2: Zombie Report Detection and Recovery', () => {
    test('should detect zombie reports correctly', async () => {
      // Create a zombie report (Report without ReportVersion)
      testReportId = createId();
      await prisma.report.create({
        data: {
          id: testReportId,
          name: 'Zombie Test Report',
          description: 'Test zombie report without versions',
          projectId: testProjectId,
          status: 'COMPLETED' // This makes it a zombie - COMPLETED but no versions
        }
      });
      
      // Test zombie detection
      const detection = await ReportValidationService.detectZombieReports(testProjectId);
      
      expect(detection.zombiesFound).toBe(1);
      expect(detection.reports[0].reportId).toBe(testReportId);
      expect(detection.reports[0].projectId).toBe(testProjectId);
    });

    test('should validate report integrity correctly', async () => {
      // Create a proper report with version
      testReportId = createId();
      await prisma.report.create({
        data: {
          id: testReportId,
          name: 'Valid Test Report',
          projectId: testProjectId,
          status: 'COMPLETED'
        }
      });
      
      await prisma.reportVersion.create({
        data: {
          id: createId(),
          reportId: testReportId,
          version: 1,
          content: { html: '<h1>Test Report</h1>', type: 'test' }
        }
      });
      
      // Test integrity validation
      const integrity = await ReportValidationService.validateReportIntegrity(testReportId, testProjectId);
      
      expect(integrity.isValid).toBe(true);
      expect(integrity.canBeMarkedCompleted).toBe(true);
      expect(integrity.zombieReportRisk).toBe('LOW');
      expect(integrity.issues.length).toBe(0);
    });

    test('should detect high zombie risk for reports without content', async () => {
      // Create report with empty ReportVersion
      testReportId = createId();
      await prisma.report.create({
        data: {
          id: testReportId,
          name: 'Empty Content Report',
          projectId: testProjectId,
          status: 'COMPLETED'
        }
      });
      
      await prisma.reportVersion.create({
        data: {
          id: createId(),
          reportId: testReportId,
          version: 1,
          content: null // No content - high zombie risk
        }
      });
      
      const integrity = await ReportValidationService.validateReportIntegrity(testReportId, testProjectId);
      
      expect(integrity.isValid).toBe(false);
      expect(integrity.zombieReportRisk).toBe('HIGH');
      expect(integrity.issues.length).toBeGreaterThan(0);
    });
  });

  describe('Task 3.3: Emergency Report Content Quality', () => {
    test('should generate reports with all required sections', async () => {
      const emergencySystem = EmergencyFallbackSystem.getInstance();
      
      const result = await emergencySystem.executeWithFallback(
        async () => { throw new Error('Test failure'); },
        {
          projectId: testProjectId,
          operationType: 'report_generation',
          originalError: new Error('Test error'),
          correlationId: createId()
        }
      );
      
      expect(result.success).toBe(true);
      
      // Get the generated report
      const reports = await prisma.report.findMany({
        where: { projectId: testProjectId },
        include: { versions: true }
      });
      
      testReportId = reports[0].id;
      const reportVersion = reports[0].versions[0];
      const content = reportVersion.content as any;
      
      // Task 3.3: Verify content quality and required sections
      expect(content.html).toBeDefined();
      expect(content.metadata).toBeDefined();
      expect(content.type).toBe('emergency_fallback');
      expect(content.generatedAt).toBeDefined();
      
      // Verify metadata contains required information
      expect(content.metadata.emergency).toBe(true);
      expect(content.metadata.reportType).toBe('emergency_fallback');
      expect(content.metadata.emergencyMetrics).toBeDefined();
    });

    test('should maintain database transaction consistency', async () => {
      // Test that if anything fails, no partial data is left behind
      const emergencySystem = EmergencyFallbackSystem.getInstance();
      
      const result = await emergencySystem.executeWithFallback(
        async () => { throw new Error('Test failure'); },
        {
          projectId: testProjectId,
          operationType: 'report_generation',
          originalError: new Error('Test error'),
          correlationId: createId()
        }
      );
      
      expect(result.success).toBe(true);
      
      // Verify both Report and ReportVersion exist
      const report = await prisma.report.findFirst({
        where: { projectId: testProjectId },
        include: { versions: true }
      });
      
      testReportId = report!.id;
      
      // Task 3.3: Verify transaction consistency
      expect(report).toBeDefined();
      expect(report!.versions.length).toBe(1);
      expect(report!.status).toBe('COMPLETED');
      expect(report!.versions[0].content).toBeDefined();
    });

    test('should prevent incomplete reports from being marked COMPLETED', async () => {
      // Test the validation service prevents marking reports COMPLETED without proper versions
      testReportId = createId();
      
      // This should fail validation (no ReportVersions)
      const validationResult = await ReportValidationService.validateReportVersionsExist(
        testReportId,
        testProjectId
      );
      
      expect(validationResult).toBe(false);
    });

    test('should ensure emergency reports are accessible after generation', async () => {
      const emergencySystem = EmergencyFallbackSystem.getInstance();
      
      await emergencySystem.executeWithFallback(
        async () => { throw new Error('Test failure'); },
        {
          projectId: testProjectId,
          operationType: 'report_generation',
          originalError: new Error('Test error'),
          correlationId: createId()
        }
      );
      
      // Verify report accessibility
      const report = await prisma.report.findFirst({
        where: { projectId: testProjectId },
        include: { versions: true }
      });
      
      testReportId = report!.id;
      
      // Task 3.3: Verify accessibility
      expect(report).toBeDefined();
      expect(report!.versions[0].content).toBeDefined();
      expect(report!.status).toBe('COMPLETED');
      
      // Verify content can be parsed and accessed
      const content = report!.versions[0].content as any;
      expect(typeof content.html).toBe('string');
      expect(content.html.length).toBeGreaterThan(0);
    });
  });

  describe('Task 3.x: Integration Tests', () => {
    test('should handle complete report generation workflow with validation', async () => {
      // End-to-end test of the complete workflow
      const emergencySystem = EmergencyFallbackSystem.getInstance();
      
      // 1. Trigger emergency fallback
      const fallbackResult = await emergencySystem.executeWithFallback(
        async () => { throw new Error('Primary system failure'); },
        {
          projectId: testProjectId,
          operationType: 'report_generation',
          originalError: new Error('Test error'),
          correlationId: createId()
        }
      );
      
      expect(fallbackResult.success).toBe(true);
      expect(fallbackResult.fallbackUsed).toBe(true);
      
      // 2. Validate no zombie reports were created
      const zombieDetection = await ReportValidationService.detectZombieReports(testProjectId);
      expect(zombieDetection.zombiesFound).toBe(0);
      
      // 3. Validate report integrity
      const report = await prisma.report.findFirst({
        where: { projectId: testProjectId }
      });
      
      testReportId = report!.id;
      
      const integrity = await ReportValidationService.validateReportIntegrity(
        testReportId,
        testProjectId
      );
      
      expect(integrity.isValid).toBe(true);
      expect(integrity.canBeMarkedCompleted).toBe(true);
      expect(integrity.zombieReportRisk).toBe('LOW');
      
      // 4. Verify ReportVersion validation passes
      const versionValidation = await ReportValidationService.validateReportVersionsExist(
        testReportId,
        testProjectId
      );
      
      expect(versionValidation).toBe(true);
    });
  });
}); 