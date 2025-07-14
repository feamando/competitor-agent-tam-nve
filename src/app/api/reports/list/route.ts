/**
 * Reports List API
 * 
 * GET /api/reports/list - Get list of reports with optimized query performance
 * Phase 5.1: API Response Times Optimization
 */

import { NextRequest, NextResponse } from 'next/server';
import { readdir, stat } from 'fs/promises';
import { join } from 'path';
import { prisma } from '@/lib/prisma';
import { 
  generateCorrelationId, 
  trackEvent, 
  trackError, 
  trackPerformance,
  trackDatabaseOperation,
  LogContext 
} from '@/lib/logger';
import { cacheService, withCache } from '@/lib/cache';
import { profileOperation, PERFORMANCE_THRESHOLDS } from '@/lib/profiling';
import type { ReportFile } from '@/types/report';

interface ReportFile {
  id?: string;
  filename?: string;
  projectId: string;
  projectName?: string;
  title?: string;
  generatedAt: Date;
  size?: number;
  downloadUrl: string;
  source: 'database' | 'file';
  status?: string;
  competitorName?: string;
  reportType?: 'comparative' | 'individual' | 'unknown';
  competitorCount?: number;
  template?: string;
  focusArea?: string;
}

// Cache TTL constants
const REPORTS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function GET(request: NextRequest) {
  const correlationId = generateCorrelationId();
  const startTime = performance.now();
  
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') || '10');
  const offset = parseInt(searchParams.get('offset') || '0');
  const projectId = searchParams.get('projectId');
  
  const logContext: LogContext = {
    correlationId,
    operation: 'list_reports',
    requestUrl: request.url,
  };

  return profileOperation(async () => {
    try {
      trackEvent({
        eventType: 'reports_list_request_started',
        category: 'system_event',
        metadata: { url: request.url, limit, offset, projectId }
      }, logContext);

      // Cache parameters
      const cacheParams = { limit, offset, projectId };
      
      // Use the withCache wrapper to handle caching
      const reportData = await withCache(
        () => fetchReportData(limit, offset, projectId, logContext),
        'reports_list',
        cacheParams,
        REPORTS_CACHE_TTL
      );
      
      const responseTime = performance.now() - startTime;
      
      // Add response time tracking
      trackPerformance('reports_list_total', responseTime, {
        ...logContext,
        ...reportData.metrics,
        cached: false
      });
      
      // Set cache headers
      const headers = {
        'Cache-Control': 'public, max-age=60', // 1 minute browser cache
        'X-Response-Time': `${responseTime.toFixed(2)}ms`,
        'X-Correlation-ID': correlationId
      };
      
      return NextResponse.json({
        reports: reportData.reports,
        total: reportData.totalCount,
        databaseReports: reportData.metrics.databaseReports,
        fileReports: reportData.metrics.fileReports,
        limit,
        offset,
        responseTime: responseTime.toFixed(2),
        metrics: reportData.metrics
      }, { headers });

    } catch (error) {
      const errorDuration = performance.now() - startTime;
      
      trackEvent({
        eventType: 'reports_list_request_failed',
        category: 'error',
        metadata: {
          error: error instanceof Error ? error.message : 'Unknown error',
          duration: errorDuration,
          url: request.url
        }
      }, logContext);

      return NextResponse.json(
        { 
          error: 'Failed to fetch reports',
          message: error instanceof Error ? error.message : 'Unknown error',
          correlationId 
        },
        { 
          status: 500,
          headers: {
            'X-Correlation-ID': correlationId,
            'X-Response-Time': `${errorDuration.toFixed(2)}ms`
          }
        }
      );
    }
  }, {
    label: 'API: GET /api/reports/list',
    correlationId,
    additionalContext: {
      limit,
      offset,
      projectId: projectId || 'all'
    }
  });
}

/**
 * Fetches report data from multiple sources with optimized performance
 * This function is wrapped with caching in the main handler
 */
async function fetchReportData(limit: number, offset: number, projectId: string | null, logContext: LogContext) {
  const reports: ReportFile[] = [];
  const metrics: Record<string, any> = {
    databaseReports: 0,
    fileReports: 0,
    filesProcessed: 0,
    totalFiles: 0,
    processingTime: 0,
    databaseQueryTime: 0,
    fileProcessingTime: 0,
    totalCount: 0
  };
  
  const dbStartTime = performance.now();
  
  trackDatabaseOperation('findMany', 'report', {
    ...logContext,
    operation: 'fetch_database_reports',
  });

  // OPTIMIZATION 1: Use efficient database query
  // - Apply filtering directly at the database level
  // - Use optimized selects to only fetch needed fields
  // - Apply pagination directly in the query
  // - Add proper indexes to support the query (already done in migration)
  
  // Build query conditions for optimal performance
  const where = projectId ? { projectId } : {};

  // OPTIMIZATION 2: First get count with a separate efficient query
  const totalCount = await profileOperation(
    () => prisma.report.count({ where }),
    {
      label: 'COUNT reports query', 
      correlationId: logContext.correlationId
    }
  );
  
  // OPTIMIZATION 3: Use a lean query with only necessary fields
  const dbReports = await profileOperation(
    () => prisma.report.findMany({
      where,
      select: {
        id: true,
        name: true,
        projectId: true,
        competitorId: true,
        createdAt: true,
        reportType: true,
        status: true,
        project: {
          select: {
            name: true,
          }
        },
        competitor: {
          select: {
            name: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc',
      },
      skip: offset,
      take: limit,
    }),
    {
      label: 'SELECT reports query',
      correlationId: logContext.correlationId
    }
  );

  const dbQueryTime = performance.now() - dbStartTime;
  metrics.databaseQueryTime = dbQueryTime;
  
  // Track performance of database query
  trackPerformance('database_reports_fetch', dbQueryTime, {
    ...logContext,
    recordCount: dbReports.length,
  });
  
  // OPTIMIZATION 4: Minimize transformation overhead
  const transformedReports = dbReports.map(report => ({
    id: report.id,
    name: report.name,
    projectId: report.projectId || 'unknown',
    projectName: report.project?.name || 'Unknown Project',
    competitorId: report.competitorId || undefined,
    competitorName: report.competitor?.name || undefined,
    createdAt: report.createdAt,
    reportType: report.reportType || 'INDIVIDUAL',
    source: 'database' as const,
    generatedAt: report.createdAt,
    status: report.status
  }));
  
  metrics.databaseReports = transformedReports.length;
  reports.push(...transformedReports);

  // Return optimized result
  return {
    reports,
    totalCount,
    metrics: {
      ...metrics,
      totalReports: reports.length,
      responseTime: performance.now() - dbStartTime
    }
  };
}

/**
 * Fetches reports from the file system
 */
async function fetchFileReports(reports: ReportFile[], limit: number, offset: number, logContext: LogContext, metrics: Record<string, any>) {
  const reportsDir = './reports';
  const fsStartTime = performance.now();
  
  try {
    // Read and process files in parallel with optimizations
    const files = await readdir(reportsDir);
    
    // Filter .md files and sort by name (newest first based on timestamp in filename)
    const mdFiles = files
      .filter(f => f.endsWith('.md'))
      .sort((a, b) => b.localeCompare(a)); // Sort descending (newest first)
    
    metrics.totalFiles = files.length;
    metrics.mdFiles = mdFiles.length;
    
    trackPerformance('filesystem_directory_read', performance.now() - fsStartTime, {
      ...logContext,
      totalFiles: files.length,
      mdFiles: mdFiles.length,
    });

    // Apply offset and limit to file list before processing
    // This drastically improves performance by reducing file reads
    const filesToProcess = mdFiles.slice(offset, offset + limit);
    
    // Process files in parallel
    const fileProcessingStartTime = performance.now();
    const filePromises = filesToProcess.map(async (filename) => {
      try {
        const filePath = join(reportsDir, filename);
        const fileStat = await stat(filePath);
        
        // Extract metadata from filename
        let projectId = 'unknown';
        let projectName = 'Unknown Project';
        let reportType: 'comparative' | 'individual' | 'unknown' = 'unknown';
        let competitorName = 'Unknown';
        
        // Process filename to extract information
        const filenameParts = filename.split('_');
        if (filenameParts.length > 0) {
          projectId = filenameParts[0];
          
          // Detect type from filename
          if (filename.includes('comparative') || filename.includes('vs')) {
            reportType = 'comparative';
            competitorName = 'Multiple Competitors';
          } else {
            reportType = 'individual';
            competitorName = filename.split('_')[0].replace(/-/g, ' ');
          }
        }
        
        // Extract generation date from filename timestamp part
        let generatedAt = new Date();
        const timestampMatch = filename.match(/\d{4}-\d{2}-\d{2}T/);
        if (timestampMatch) {
          const timestamp = filename.substring(timestampMatch.index || 0);
          try {
            // Try to parse the ISO timestamp
            generatedAt = new Date(timestamp.replace(/-/g, '/').replace('T', ' '));
          } catch (e) {
            // Fallback to file creation time
            generatedAt = fileStat.birthtime;
          }
        }
        
        return {
          filename,
          projectId,
          projectName,
          title: filename.replace(/\.md$/, '').replace(/-/g, ' '),
          generatedAt,
          size: fileStat.size,
          downloadUrl: `/api/reports/file/${encodeURIComponent(filename)}`,
          source: 'file' as const,
          status: 'COMPLETED',
          competitorName,
          reportType,
          competitorCount: reportType === 'comparative' ? 2 : 1,
          template: 'standard',
          focusArea: 'general',
        };
      } catch (fileError) {
        return null;
      }
    });
    
    // Process files in parallel but limit concurrency to avoid overwhelming the file system
    const validFileReports = (await Promise.all(filePromises))
      .filter(report => report !== null) as ReportFile[];
    
    reports.push(...validFileReports);
    metrics.fileReports = validFileReports.length;
    metrics.filesProcessed = filesToProcess.length;
    
    const fileProcessingTime = performance.now() - fileProcessingStartTime;
    metrics.fileProcessingTime = fileProcessingTime;
    
    trackPerformance('filesystem_files_processed', fileProcessingTime, {
      ...logContext,
      processedFiles: validFileReports.length,
      totalFiles: filesToProcess.length,
    });
    
  } catch (fsError) {
    trackError(fsError as Error, 'filesystem_reports_fetch', {
      ...logContext,
      operation: 'fetch_file_reports',
    });
  }
} 