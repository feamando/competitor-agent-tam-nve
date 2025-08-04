import prisma from './prisma';
import { logger } from './logger';
import { createId } from '@paralleldrive/cuid2';

/**
 * Validates that a Report has corresponding ReportVersions before it can be marked as COMPLETED
 * Task 5.2: Add validation check ensuring ReportVersions exist before marking reports COMPLETED
 */
export class ReportValidationService {
  
  /**
   * Validates that ReportVersions exist for a report before marking it COMPLETED
   * @param reportId - The ID of the report to validate
   * @param projectId - Project ID for logging context
   * @returns Promise<boolean> - true if validation passes, false otherwise
   */
  static async validateReportVersionsExist(
    reportId: string, 
    projectId: string
  ): Promise<boolean> {
    const context = { reportId, projectId, operation: 'validateReportVersions' };
    
    try {
      logger.info('Validating ReportVersions exist before marking report COMPLETED', context);
      
      // Check if ReportVersions exist for this report
      const reportVersions = await prisma.reportVersion.findMany({
        where: { reportId },
        select: { id: true, version: true, content: true }
      });
      
      if (reportVersions.length === 0) {
        logger.error('VALIDATION FAILED: Report has no ReportVersions - preventing COMPLETED status', undefined, {
          ...context,
          zombieReportRisk: 'HIGH',
          validationResult: 'FAILED'
        });
        return false;
      }
      
      // Validate that ReportVersions have content
      const versionsWithContent = reportVersions.filter(v => v.content && v.content !== null);
      
      if (versionsWithContent.length === 0) {
        logger.error('VALIDATION FAILED: ReportVersions exist but have no content - preventing COMPLETED status', undefined, {
          ...context,
          reportVersionsFound: reportVersions.length,
          versionsWithContent: 0,
          zombieReportRisk: 'HIGH',
          validationResult: 'FAILED'
        });
        return false;
      }
      
      logger.info('ReportVersion validation passed - safe to mark report COMPLETED', {
        ...context,
        reportVersionsFound: reportVersions.length,
        versionsWithContent: versionsWithContent.length,
        validationResult: 'PASSED'
      });
      
      return true;
      
    } catch (error) {
      logger.error('ReportVersion validation failed due to error - preventing COMPLETED status', error as Error, {
        ...context,
        zombieReportRisk: 'HIGH',
        validationResult: 'ERROR'
      });
      return false;
    }
  }
  
  /**
   * Validates report integrity and prevents zombie report creation
   * @param reportId - The ID of the report to validate
   * @param projectId - Project ID for logging context
   * @returns Promise<ReportIntegrityResult>
   */
  static async validateReportIntegrity(
    reportId: string, 
    projectId: string
  ): Promise<ReportIntegrityResult> {
    const context = { reportId, projectId, operation: 'validateReportIntegrity' };
    
    try {
      logger.info('Starting comprehensive report integrity validation', context);
      
      // Check if Report exists
      const report = await prisma.report.findUnique({
        where: { id: reportId },
        include: { versions: true }
      });
      
      if (!report) {
        return {
          isValid: false,
          issues: ['Report not found in database'],
          zombieReportRisk: 'LOW',
          canBeMarkedCompleted: false
        };
      }
      
      // Check ReportVersions
      const issues: string[] = [];
      let zombieReportRisk: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
      
      if (report.versions.length === 0) {
        issues.push('Report has no ReportVersions');
        zombieReportRisk = 'HIGH';
      } else {
        const versionsWithContent = report.versions.filter(v => v.content && v.content !== null);
        
        if (versionsWithContent.length === 0) {
          issues.push('ReportVersions exist but have no content');
          zombieReportRisk = 'HIGH';
        }
        
        if (report.status === 'COMPLETED' && versionsWithContent.length === 0) {
          issues.push('Report marked COMPLETED but lacks viewable content - ZOMBIE REPORT DETECTED');
          zombieReportRisk = 'HIGH';
        }
      }
      
      // Check consistency between Report status and content availability
      if (report.status === 'COMPLETED' && issues.length > 0) {
        zombieReportRisk = 'HIGH';
      }
      
      const isValid = issues.length === 0;
      const canBeMarkedCompleted = isValid && report.versions.length > 0;
      
      logger.info('Report integrity validation completed', {
        ...context,
        isValid,
        issues: issues.length,
        zombieReportRisk,
        canBeMarkedCompleted,
        reportStatus: report.status,
        versionCount: report.versions.length
      });
      
      return {
        isValid,
        issues,
        zombieReportRisk,
        canBeMarkedCompleted,
        reportData: {
          id: report.id,
          status: report.status,
          versionCount: report.versions.length,
          hasContent: report.versions.some(v => v.content && v.content !== null)
        }
      };
      
    } catch (error) {
      logger.error('Report integrity validation failed due to error', error as Error, context);
      return {
        isValid: false,
        issues: [`Validation error: ${(error as Error).message}`],
        zombieReportRisk: 'HIGH',
        canBeMarkedCompleted: false
      };
    }
  }
  
  /**
   * Detects existing zombie reports in the database
   * @param projectId - Optional project ID to scope the search
   * @returns Promise<ZombieReportDetectionResult>
   */
  static async detectZombieReports(projectId?: string): Promise<ZombieReportDetectionResult> {
    const context = { projectId, operation: 'detectZombieReports' };
    
    try {
      logger.info('Scanning database for zombie reports', context);
      
      const whereClause: any = {
        status: 'COMPLETED',
        versions: { none: {} }
      };
      
      if (projectId) {
        whereClause.projectId = projectId;
      }
      
      const zombieReports = await prisma.report.findMany({
        where: whereClause,
        include: {
          project: {
            select: { id: true, name: true }
          }
        }
      });
      
      const detectionResult: ZombieReportDetectionResult = {
        zombiesFound: zombieReports.length,
        reports: zombieReports.map(report => ({
          reportId: report.id,
          projectId: report.projectId || 'unknown',
          projectName: report.project?.name || 'unknown',
          reportName: report.name,
          createdAt: report.createdAt,
          status: report.status
        })),
        scannedAt: new Date()
      };
      
      if (zombieReports.length > 0) {
        logger.error('ZOMBIE REPORTS DETECTED - immediate attention required', null, {
          ...context,
          zombiesFound: zombieReports.length,
          zombieReportIds: zombieReports.map(r => r.id),
          affectedProjects: zombieReports.map(r => r.projectId)
        });
      } else {
        logger.info('No zombie reports detected - database integrity maintained', context);
      }
      
      return detectionResult;
      
    } catch (error) {
      logger.error('Zombie report detection failed', error as Error, context);
      return {
        zombiesFound: 0,
        reports: [],
        scannedAt: new Date(),
        error: (error as Error).message
      };
    }
  }

  /**
   * Task 3.2: Automatic recovery for zombie reports - creates missing ReportVersions
   * @param reportId - The zombie report ID to recover
   * @param projectId - Project ID for logging context
   * @returns Promise<boolean> - true if recovery was successful
   */
  static async recoverZombieReport(reportId: string, projectId: string): Promise<boolean> {
    const context = { reportId, projectId, operation: 'recoverZombieReport' };
    
    try {
      logger.info('Starting zombie report recovery', context);
      
      // Get the zombie report
      const zombieReport = await prisma.report.findUnique({
        where: { id: reportId },
        include: { versions: true }
      });
      
      if (!zombieReport) {
        logger.error('Zombie report not found for recovery', undefined, context);
        return false;
      }
      
      if (zombieReport.versions.length > 0) {
        logger.info('Report is not a zombie - already has versions', {
          ...context,
          versionCount: zombieReport.versions.length
        });
        return true;
      }
      
      // Create emergency ReportVersion for zombie report
      const emergencyContent = this.generateEmergencyContent(zombieReport);
      
      await prisma.reportVersion.create({
        data: {
          id: createId(),
          reportId: reportId,
          version: 1,
          content: {
            html: emergencyContent.html,
            metadata: emergencyContent.metadata,
            type: 'zombie_recovery',
            recoveredAt: new Date().toISOString(),
            originalReportData: {
              name: zombieReport.name,
              description: zombieReport.description,
              createdAt: zombieReport.createdAt.toISOString()
            }
          },
          createdAt: new Date(),
          updatedAt: new Date()
        }
      });
      
      logger.info('Zombie report recovery completed successfully', {
        ...context,
        recoveryType: 'emergency_version_created',
        zombieReportFixed: true
      });
      
      return true;
      
    } catch (error) {
      logger.error('Zombie report recovery failed', error as Error, context);
      return false;
    }
  }
  
  /**
   * Task 3.2: Bulk recovery of all zombie reports in the system
   * @param projectId - Optional project ID to scope recovery
   * @returns Promise<ZombieRecoveryResult>
   */
  static async recoverAllZombieReports(projectId?: string): Promise<ZombieRecoveryResult> {
    const context = { projectId, operation: 'recoverAllZombieReports' };
    
    try {
      logger.info('Starting bulk zombie report recovery', context);
      
      // Detect all zombie reports
      const detection = await this.detectZombieReports(projectId);
      
      if (detection.zombiesFound === 0) {
        return {
          totalFound: 0,
          recovered: 0,
          failed: 0,
          recoveryRate: 100,
          completedAt: new Date()
        };
      }
      
      let recovered = 0;
      let failed = 0;
      
      // Attempt recovery for each zombie report
      for (const zombie of detection.reports) {
        const success = await this.recoverZombieReport(zombie.reportId, zombie.projectId);
        if (success) {
          recovered++;
        } else {
          failed++;
        }
      }
      
      const recoveryRate = Math.round((recovered / detection.zombiesFound) * 100);
      
      logger.info('Bulk zombie report recovery completed', {
        ...context,
        totalFound: detection.zombiesFound,
        recovered,
        failed,
        recoveryRate
      });
      
      return {
        totalFound: detection.zombiesFound,
        recovered,
        failed,
        recoveryRate,
        completedAt: new Date()
      };
      
    } catch (error) {
      logger.error('Bulk zombie report recovery failed', error as Error, context);
      return {
        totalFound: 0,
        recovered: 0,
        failed: 0,
        recoveryRate: 0,
        completedAt: new Date(),
        error: (error as Error).message
      };
    }
  }
  
  /**
   * Generate emergency content for zombie report recovery
   */
  private static generateEmergencyContent(report: any): { html: string; metadata: any } {
    const html = `
      <div class="emergency-report">
        <h1>Report Recovery Notice</h1>
        <p><strong>Report:</strong> ${report.name}</p>
        <p><strong>Description:</strong> ${report.description || 'No description available'}</p>
        <p><strong>Created:</strong> ${report.createdAt}</p>
        
        <div class="recovery-notice">
          <h2>Recovery Information</h2>
          <p>This report was automatically recovered from a zombie state (report without content).</p>
          <p>The original report content was not available, but the report metadata has been preserved.</p>
          <p>For a complete analysis, please regenerate this report.</p>
        </div>
        
        <div class="report-actions">
          <p><strong>Recommended Action:</strong> Regenerate this report to get complete analysis.</p>
        </div>
      </div>
    `;
    
    const metadata = {
      recoveryType: 'zombie_report_recovery',
      originalReport: {
        id: report.id,
        name: report.name,
        status: report.status,
        projectId: report.projectId
      },
      recoveredAt: new Date().toISOString(),
      contentAvailable: false,
      requiresRegeneration: true
    };
    
    return { html, metadata };
  }
}

// Type definitions for validation results
export interface ReportIntegrityResult {
  isValid: boolean;
  issues: string[];
  zombieReportRisk: 'LOW' | 'MEDIUM' | 'HIGH';
  canBeMarkedCompleted: boolean;
  reportData?: {
    id: string;
    status: string;
    versionCount: number;
    hasContent: boolean;
  };
}

export interface ZombieReportDetectionResult {
  zombiesFound: number;
  reports: {
    reportId: string;
    projectId: string;
    projectName: string;
    reportName: string;
    createdAt: Date;
    status: string;
  }[];
  scannedAt: Date;
  error?: string;
}

export interface ZombieRecoveryResult {
  totalFound: number;
  recovered: number;
  failed: number;
  recoveryRate: number;
  completedAt: Date;
  error?: string;
} 