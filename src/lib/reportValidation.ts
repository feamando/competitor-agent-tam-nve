import prisma from './prisma';
import { logger } from './logger';

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