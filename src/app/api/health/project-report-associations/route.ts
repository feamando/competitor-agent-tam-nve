/**
 * Project-Report Association Health Check API - Task 7.3
 * 
 * REST API endpoint for comprehensive health monitoring of project-report
 * associations and system integrity. Provides real-time health status,
 * detailed diagnostics, and actionable insights.
 * 
 * Endpoints:
 * - GET /api/health/project-report-associations - Full health check
 * - GET /api/health/project-report-associations/quick - Quick status check
 * - GET /api/health/project-report-associations/summary - Health summary
 * 
 * Part of TP-013-20250801-project-report-association-fix
 */

import { NextRequest, NextResponse } from 'next/server';
import { HealthCheckHelpers, projectReportHealthChecker } from '@/lib/health/projectReportHealthCheck';
import { logger } from '@/lib/logger';

/**
 * GET /api/health/project-report-associations
 * Returns comprehensive health check results
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const checkType = searchParams.get('type') || 'full';
    const format = searchParams.get('format') || 'json';
    const includeRecommendations = searchParams.get('recommendations') !== 'false';
    
    logger.info('Project-report health check requested', {
      checkType,
      format,
      includeRecommendations,
      userAgent: request.headers.get('user-agent'),
      ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip')
    });
    
    const startTime = Date.now();
    
    let healthResult;
    
    switch (checkType) {
      case 'quick':
        healthResult = await HealthCheckHelpers.quickCheck();
        
        const quickResponse = {
          status: 'success',
          timestamp: new Date().toISOString(),
          checkType: 'quick',
          health: healthResult,
          processingTime: Date.now() - startTime
        };
        
        return NextResponse.json(quickResponse, {
          status: 200,
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        });
        
      case 'summary':
        const fullCheck = await HealthCheckHelpers.executeCheck();
        const summaryResponse = {
          status: 'success',
          timestamp: new Date().toISOString(),
          checkType: 'summary',
          health: {
            overallStatus: fullCheck.status,
            overallScore: fullCheck.score,
            checkStatus: {
              dataIntegrity: {
                status: fullCheck.checks.dataIntegrity.status,
                score: fullCheck.checks.dataIntegrity.score,
                issues: fullCheck.checks.dataIntegrity.issues.length
              },
              performance: {
                status: fullCheck.checks.performance.status,
                score: fullCheck.checks.performance.score,
                issues: fullCheck.checks.performance.issues.length
              },
              business: {
                status: fullCheck.checks.business.status,
                score: fullCheck.checks.business.score,
                issues: fullCheck.checks.business.issues.length
              },
              system: {
                status: fullCheck.checks.system.status,
                score: fullCheck.checks.system.score,
                issues: fullCheck.checks.system.issues.length
              },
              predictive: {
                status: fullCheck.checks.predictive.status,
                score: fullCheck.checks.predictive.score,
                warnings: fullCheck.checks.predictive.earlyWarnings.length
              }
            },
            summary: fullCheck.summary,
            nextCheckRecommended: fullCheck.summary.nextCheckRecommended
          },
          processingTime: Date.now() - startTime
        };
        
        return NextResponse.json(summaryResponse, {
          status: 200,
          headers: {
            'Cache-Control': 'public, max-age=60', // Cache summary for 1 minute
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET',
            'Access-Control-Allow-Headers': 'Content-Type'
          }
        });
        
      default: // full check
        healthResult = await HealthCheckHelpers.executeCheck();
        
        // Handle different response formats
        if (format === 'prometheus') {
          const prometheusMetrics = generatePrometheusMetrics(healthResult);
          
          return new NextResponse(prometheusMetrics, {
            status: 200,
            headers: {
              'Content-Type': 'text/plain; charset=utf-8',
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              'Pragma': 'no-cache',
              'Expires': '0'
            }
          });
        }
        
        if (format === 'minimal') {
          const minimalResponse = {
            status: healthResult.status,
            score: healthResult.score,
            timestamp: healthResult.timestamp,
            criticalIssues: healthResult.summary.criticalIssues,
            totalIssues: healthResult.summary.totalIssues,
            processingTime: Date.now() - startTime
          };
          
          return NextResponse.json(minimalResponse, {
            status: 200,
            headers: {
              'Cache-Control': 'public, max-age=30',
              'Access-Control-Allow-Origin': '*'
            }
          });
        }
        
        // Default full JSON response
        const response = {
          status: 'success',
          timestamp: new Date().toISOString(),
          checkType: 'full',
          health: includeRecommendations ? healthResult : {
            ...healthResult,
            summary: {
              ...healthResult.summary,
              recommendations: []
            }
          },
          processingTime: Date.now() - startTime,
          metadata: {
            version: '1.0',
            correlationId: healthResult.correlationId,
            checkDuration: Date.now() - startTime
          }
        };
        
        // Determine HTTP status based on health status
        let httpStatus = 200;
        if (healthResult.status === 'critical') httpStatus = 503; // Service Unavailable
        else if (healthResult.status === 'unhealthy') httpStatus = 503;
        else if (healthResult.status === 'degraded') httpStatus = 200; // OK but with warnings
        
        return NextResponse.json(response, {
          status: httpStatus,
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
          }
        });
    }
    
  } catch (error) {
    logger.error('Failed to execute project-report health check', error as Error, {
      url: request.url,
      method: request.method
    });
    
    return NextResponse.json({
      status: 'error',
      error: 'Health check failed',
      message: (error as Error).message,
      timestamp: new Date().toISOString(),
      health: {
        status: 'critical',
        score: 0,
        issues: [{
          severity: 'critical',
          title: 'Health Check System Failure',
          description: `Health check system encountered an error: ${(error as Error).message}`,
          impact: 'Unable to assess system health',
          recommendation: 'Check health monitoring system and logs'
        }]
      }
    }, {
      status: 503 // Service Unavailable
    });
  }
}

/**
 * Generate Prometheus metrics format
 */
function generatePrometheusMetrics(healthResult: any): string {
  const metrics: string[] = [];
  const timestamp = Math.floor(Date.now() / 1000);
  
  // Overall health metrics
  metrics.push(`# HELP project_report_health_score Overall health score (0-100)`);
  metrics.push(`# TYPE project_report_health_score gauge`);
  metrics.push(`project_report_health_score ${healthResult.score} ${timestamp}`);
  
  metrics.push(`# HELP project_report_health_status Overall health status (0=healthy, 1=degraded, 2=unhealthy, 3=critical)`);
  metrics.push(`# TYPE project_report_health_status gauge`);
  const statusMapping: Record<string, number> = { 'healthy': 0, 'degraded': 1, 'unhealthy': 2, 'critical': 3 };
  const statusValue = statusMapping[healthResult.status] || 3;
  metrics.push(`project_report_health_status ${statusValue} ${timestamp}`);
  
  // Data integrity metrics
  const dataIntegrity = healthResult.checks.dataIntegrity;
  metrics.push(`# HELP project_report_orphaned_reports_total Total number of orphaned reports`);
  metrics.push(`# TYPE project_report_orphaned_reports_total gauge`);
  metrics.push(`project_report_orphaned_reports_total ${dataIntegrity.metrics.orphanedReports} ${timestamp}`);
  
  metrics.push(`# HELP project_report_orphaned_percentage Percentage of reports that are orphaned`);
  metrics.push(`# TYPE project_report_orphaned_percentage gauge`);
  metrics.push(`project_report_orphaned_percentage ${dataIntegrity.metrics.orphanedPercentage} ${timestamp}`);
  
  metrics.push(`# HELP project_report_total_reports Total number of reports in system`);
  metrics.push(`# TYPE project_report_total_reports gauge`);
  metrics.push(`project_report_total_reports ${dataIntegrity.metrics.totalReports} ${timestamp}`);
  
  metrics.push(`# HELP project_report_projects_without_reports Number of projects without reports`);
  metrics.push(`# TYPE project_report_projects_without_reports gauge`);
  metrics.push(`project_report_projects_without_reports ${dataIntegrity.metrics.projectsWithoutReports} ${timestamp}`);
  
  // Performance metrics
  const performance = healthResult.checks.performance;
  metrics.push(`# HELP project_report_avg_query_time_ms Average database query time in milliseconds`);
  metrics.push(`# TYPE project_report_avg_query_time_ms gauge`);
  metrics.push(`project_report_avg_query_time_ms ${performance.metrics.averageQueryTime} ${timestamp}`);
  
  metrics.push(`# HELP project_report_cache_hit_rate Cache hit rate (0.0-1.0)`);
  metrics.push(`# TYPE project_report_cache_hit_rate gauge`);
  metrics.push(`project_report_cache_hit_rate ${performance.metrics.cacheHitRate} ${timestamp}`);
  
  metrics.push(`# HELP project_report_memory_usage_bytes Memory usage in bytes`);
  metrics.push(`# TYPE project_report_memory_usage_bytes gauge`);
  metrics.push(`project_report_memory_usage_bytes ${performance.metrics.memoryUsage} ${timestamp}`);
  
  // Business metrics
  const business = healthResult.checks.business;
  metrics.push(`# HELP project_report_project_completeness Project completeness percentage`);
  metrics.push(`# TYPE project_report_project_completeness gauge`);
  metrics.push(`project_report_project_completeness ${business.metrics.projectCompleteness} ${timestamp}`);
  
  metrics.push(`# HELP project_report_coverage Report coverage percentage`);
  metrics.push(`# TYPE project_report_coverage gauge`);
  metrics.push(`project_report_coverage ${business.metrics.reportCoverage} ${timestamp}`);
  
  // System health scores
  const system = healthResult.checks.system;
  metrics.push(`# HELP project_report_system_component_health System component health scores`);
  metrics.push(`# TYPE project_report_system_component_health gauge`);
  metrics.push(`project_report_system_component_health{component="project_discovery"} ${system.metrics.projectDiscoveryServiceHealth} ${timestamp}`);
  metrics.push(`project_report_system_component_health{component="alert_system"} ${system.metrics.alertSystemHealth} ${timestamp}`);
  metrics.push(`project_report_system_component_health{component="database"} ${system.metrics.databaseHealth} ${timestamp}`);
  metrics.push(`project_report_system_component_health{component="cache"} ${system.metrics.cacheSystemHealth} ${timestamp}`);
  metrics.push(`project_report_system_component_health{component="scheduler"} ${system.metrics.schedulerHealth} ${timestamp}`);
  
  // Issue metrics
  metrics.push(`# HELP project_report_health_issues_total Total number of health issues by severity`);
  metrics.push(`# TYPE project_report_health_issues_total gauge`);
  
  const allIssues = [
    ...dataIntegrity.issues,
    ...performance.issues,
    ...business.issues,
    ...system.issues,
    ...healthResult.checks.predictive.earlyWarnings
  ];
  
  const issuesBySeverity = allIssues.reduce((acc, issue) => {
    acc[issue.severity] = (acc[issue.severity] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  ['info', 'warning', 'critical', 'emergency'].forEach(severity => {
    metrics.push(`project_report_health_issues_total{severity="${severity}"} ${issuesBySeverity[severity] || 0} ${timestamp}`);
  });
  
  // Predictive metrics
  const predictive = healthResult.checks.predictive;
  metrics.push(`# HELP project_report_orphaned_projection Projected orphaned reports`);
  metrics.push(`# TYPE project_report_orphaned_projection gauge`);
  metrics.push(`project_report_orphaned_projection{timeframe="next_hour"} ${predictive.predictions.orphanedReportsProjection.nextHour} ${timestamp}`);
  metrics.push(`project_report_orphaned_projection{timeframe="next_day"} ${predictive.predictions.orphanedReportsProjection.nextDay} ${timestamp}`);
  metrics.push(`project_report_orphaned_projection{timeframe="next_week"} ${predictive.predictions.orphanedReportsProjection.nextWeek} ${timestamp}`);
  
  return metrics.join('\n') + '\n';
}

/**
 * POST /api/health/project-report-associations/trigger
 * Manually trigger health check execution
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const checkType = body.type || 'full';
    const priority = body.priority || 'normal';
    
    logger.info('Manual health check triggered', {
      checkType,
      priority,
      userAgent: request.headers.get('user-agent'),
      ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip')
    });
    
    const startTime = Date.now();
    
    let result;
    
    if (checkType === 'quick') {
      result = await HealthCheckHelpers.quickCheck();
    } else {
      result = await HealthCheckHelpers.executeCheck();
    }
    
    const duration = Date.now() - startTime;
    
    return NextResponse.json({
      status: 'success',
      message: 'Health check completed successfully',
      checkType,
      priority,
      result,
      metadata: {
        triggered: 'manual',
        duration,
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    logger.error('Failed to trigger manual health check', error as Error, {
      url: request.url,
      method: request.method
    });
    
    return NextResponse.json({
      status: 'error',
      error: 'Failed to trigger health check',
      message: (error as Error).message,
      timestamp: new Date().toISOString()
    }, {
      status: 500
    });
  }
}

/**
 * OPTIONS /api/health/project-report-associations
 * Handle CORS preflight requests
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400'
    }
  });
} 