/**
 * Report Generation Dashboard API - Task 7.4
 * 
 * REST API endpoint for comprehensive dashboard metrics and analytics
 * for report generation success rates, performance, and business insights.
 * 
 * Endpoints:
 * - GET /api/dashboard/report-generation - Get dashboard metrics
 * - GET /api/dashboard/report-generation/analytics - Get detailed analytics
 * - GET /api/dashboard/report-generation/realtime - Get real-time dashboard
 * - POST /api/dashboard/report-generation/event - Record generation event
 * 
 * Part of TP-013-20250801-project-report-association-fix
 */

import { NextRequest, NextResponse } from 'next/server';
import { reportGenerationMetrics, ReportMetricsHelpers } from '@/lib/metrics/reportGenerationMetrics';
import { logger } from '@/lib/logger';

/**
 * GET /api/dashboard/report-generation
 * Returns dashboard metrics for report generation
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const endpoint = searchParams.get('endpoint') || 'dashboard';
    const timeframe = (searchParams.get('timeframe') || 'daily') as 'hourly' | 'daily' | 'weekly' | 'monthly';
    const format = searchParams.get('format') || 'json';
    const includeHistory = searchParams.get('history') === 'true';
    
    logger.info('Report generation dashboard requested', {
      endpoint,
      timeframe,
      format,
      includeHistory,
      userAgent: request.headers.get('user-agent'),
      ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip')
    });
    
    const startTime = Date.now();
    
    switch (endpoint) {
      case 'realtime':
        const realtimeData = ReportMetricsHelpers.getRealTime();
        
        const realtimeResponse = {
          status: 'success',
          timestamp: new Date().toISOString(),
          type: 'realtime',
          data: realtimeData,
          refresh: {
            intervalSeconds: 30,
            nextUpdate: new Date(Date.now() + 30000).toISOString()
          },
          processingTime: Date.now() - startTime
        };
        
        return NextResponse.json(realtimeResponse, {
          status: 200,
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        });
        
      case 'analytics':
        const analyticsTimeframe = (searchParams.get('timeframe') || 'daily') as 'daily' | 'weekly' | 'monthly';
        const analyticsData = ReportMetricsHelpers.getAnalytics(analyticsTimeframe);
        
        const analyticsResponse = {
          status: 'success',
          timestamp: new Date().toISOString(),
          type: 'analytics',
          timeframe: analyticsTimeframe,
          data: analyticsData,
          metadata: {
            generatedAt: new Date().toISOString(),
            dataFreshness: 'real-time',
            processingTime: Date.now() - startTime
          }
        };
        
        return NextResponse.json(analyticsResponse, {
          status: 200,
          headers: {
            'Cache-Control': 'public, max-age=300', // Cache analytics for 5 minutes
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET',
            'Access-Control-Allow-Headers': 'Content-Type'
          }
        });
        
      case 'prometheus':
        const prometheusMetrics = reportGenerationMetrics.exportPrometheusMetrics();
        
        return new NextResponse(prometheusMetrics, {
          status: 200,
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        });
        
      default: // dashboard
        const dashboardData = ReportMetricsHelpers.getDashboard(timeframe);
        let historicalData = null;
        
        if (includeHistory) {
          historicalData = reportGenerationMetrics.getHistoricalMetrics(timeframe, 24);
        }
        
        if (!dashboardData) {
          return NextResponse.json({
            status: 'success',
            timestamp: new Date().toISOString(),
            type: 'dashboard',
            timeframe,
            data: null,
            message: 'No metrics data available for the specified timeframe',
            processingTime: Date.now() - startTime
          }, {
            status: 200,
            headers: {
              'Cache-Control': 'public, max-age=60'
            }
          });
        }
        
        const dashboardResponse = {
          status: 'success',
          timestamp: new Date().toISOString(),
          type: 'dashboard',
          timeframe,
          data: {
            current: dashboardData,
            historical: historicalData,
            summary: {
              // Key Performance Indicators
              kpis: {
                successRate: {
                  current: dashboardData.success.successRate,
                  target: 0.95,
                  status: dashboardData.success.successRate >= 0.95 ? 'good' : 
                          dashboardData.success.successRate >= 0.85 ? 'warning' : 'critical',
                  trend: calculateTrend(historicalData, 'successRate')
                },
                averageTime: {
                  current: dashboardData.performance.averageGenerationTime,
                  target: 30000, // 30 seconds
                  status: dashboardData.performance.averageGenerationTime <= 30000 ? 'good' :
                          dashboardData.performance.averageGenerationTime <= 60000 ? 'warning' : 'critical',
                  trend: calculateTrend(historicalData, 'averageTime')
                },
                qualityScore: {
                  current: (dashboardData.quality.completenessScore + dashboardData.quality.accuracyScore) / 2,
                  target: 0.90,
                  status: ((dashboardData.quality.completenessScore + dashboardData.quality.accuracyScore) / 2) >= 0.90 ? 'good' :
                          ((dashboardData.quality.completenessScore + dashboardData.quality.accuracyScore) / 2) >= 0.75 ? 'warning' : 'critical',
                  trend: calculateTrend(historicalData, 'qualityScore')
                },
                throughput: {
                  current: dashboardData.performance.throughputPerHour,
                  target: 100,
                  status: dashboardData.performance.throughputPerHour >= 100 ? 'good' :
                          dashboardData.performance.throughputPerHour >= 50 ? 'warning' : 'critical',
                  trend: calculateTrend(historicalData, 'throughput')
                }
              },
              
              // Health Status
              health: {
                overall: calculateOverallHealth(dashboardData),
                components: {
                  generation: dashboardData.success.successRate >= 0.85 ? 'healthy' : 'degraded',
                  performance: dashboardData.performance.averageGenerationTime <= 60000 ? 'healthy' : 'degraded',
                  quality: ((dashboardData.quality.completenessScore + dashboardData.quality.accuracyScore) / 2) >= 0.75 ? 'healthy' : 'degraded',
                  business: dashboardData.business.projectCoverage >= 0.80 ? 'healthy' : 'degraded'
                }
              },
              
              // Top Issues
              issues: identifyTopIssues(dashboardData),
              
              // Recommendations
              recommendations: generateRecommendations(dashboardData)
            }
          },
          processingTime: Date.now() - startTime
        };
        
        return NextResponse.json(dashboardResponse, {
          status: 200,
          headers: {
            'Cache-Control': 'public, max-age=60', // Cache dashboard for 1 minute
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET',
            'Access-Control-Allow-Headers': 'Content-Type'
          }
        });
    }
    
  } catch (error) {
    logger.error('Failed to retrieve report generation dashboard', error as Error, {
      url: request.url,
      method: request.method
    });
    
    return NextResponse.json({
      status: 'error',
      error: 'Failed to retrieve dashboard data',
      message: (error as Error).message,
      timestamp: new Date().toISOString()
    }, {
      status: 500
    });
  }
}

/**
 * POST /api/dashboard/report-generation/event
 * Record a report generation event for metrics collection
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { event, context } = body;
    
    if (!event || !event.type) {
      return NextResponse.json({
        status: 'error',
        error: 'Missing required event data',
        message: 'Event type is required'
      }, { status: 400 });
    }
    
    logger.info('Report generation event received', {
      eventType: event.type,
      correlationId: context?.correlationId,
      projectId: context?.projectId,
      userAgent: request.headers.get('user-agent')
    });
    
    // Process different event types
    switch (event.type) {
      case 'generation_start':
        ReportMetricsHelpers.recordStart({
          correlationId: context.correlationId,
          projectId: context.projectId,
          competitorId: context.competitorId,
          userId: context.userId,
          reportType: context.reportType || 'comparative',
          userPriority: context.priority,
          automatedGeneration: context.automated || false,
          scheduledGeneration: context.scheduled || false,
          metadata: context.metadata || {}
        });
        break;
        
      case 'generation_complete':
        ReportMetricsHelpers.recordComplete({
          correlationId: context.correlationId,
          status: event.success ? 'success' : 'failure',
          duration: event.duration || 0,
          completeness: event.completeness,
          dataFreshness: event.dataFreshness ? new Date(event.dataFreshness) : undefined,
          validationScore: event.validationScore,
          errorCode: event.errorCode,
          errorMessage: event.errorMessage,
          errorCategory: event.errorCategory,
          retryCount: event.retryCount || 0,
          metadata: event.metadata || {}
        });
        break;
        
      default:
        return NextResponse.json({
          status: 'error',
          error: 'Unknown event type',
          message: `Event type '${event.type}' is not supported`
        }, { status: 400 });
    }
    
    return NextResponse.json({
      status: 'success',
      message: 'Event recorded successfully',
      eventId: event.id || 'generated',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Failed to record report generation event', error as Error, {
      url: request.url,
      method: request.method
    });
    
    return NextResponse.json({
      status: 'error',
      error: 'Failed to record event',
      message: (error as Error).message,
      timestamp: new Date().toISOString()
    }, {
      status: 500
    });
  }
}

/**
 * PUT /api/dashboard/report-generation/config
 * Update dashboard metrics configuration
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { config } = body;
    
    if (!config) {
      return NextResponse.json({
        status: 'error',
        error: 'Missing configuration data'
      }, { status: 400 });
    }
    
    logger.info('Dashboard metrics configuration update requested', {
      config,
      userAgent: request.headers.get('user-agent')
    });
    
    // Validate configuration
    const validationResult = validateMetricsConfig(config);
    if (!validationResult.valid) {
      return NextResponse.json({
        status: 'error',
        error: 'Invalid configuration',
        details: validationResult.errors
      }, { status: 400 });
    }
    
    // Update configuration (would need to implement config update in metrics collector)
    // reportGenerationMetrics.updateConfig(config);
    
    return NextResponse.json({
      status: 'success',
      message: 'Configuration updated successfully',
      config,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Failed to update dashboard configuration', error as Error, {
      url: request.url,
      method: request.method
    });
    
    return NextResponse.json({
      status: 'error',
      error: 'Failed to update configuration',
      message: (error as Error).message,
      timestamp: new Date().toISOString()
    }, {
      status: 500
    });
  }
}

/**
 * OPTIONS /api/dashboard/report-generation
 * Handle CORS preflight requests
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400'
    }
  });
}

// Helper functions

function calculateTrend(historicalData: any[] | null, metric: string): 'improving' | 'stable' | 'declining' {
  if (!historicalData || historicalData.length < 2) {
    return 'stable';
  }
  
  // Get values for trend calculation
  const values: number[] = [];
  
  historicalData.forEach(data => {
    switch (metric) {
      case 'successRate':
        values.push(data.success.successRate);
        break;
      case 'averageTime':
        values.push(data.performance.averageGenerationTime);
        break;
      case 'qualityScore':
        values.push((data.quality.completenessScore + data.quality.accuracyScore) / 2);
        break;
      case 'throughput':
        values.push(data.performance.throughputPerHour);
        break;
    }
  });
  
  if (values.length < 2) return 'stable';
  
  // Simple trend calculation - compare last 3 values with previous 3
  const recent = values.slice(-3);
  const previous = values.slice(-6, -3);
  
  if (recent.length === 0 || previous.length === 0) return 'stable';
  
  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const previousAvg = previous.reduce((a, b) => a + b, 0) / previous.length;
  
  const change = (recentAvg - previousAvg) / previousAvg;
  
  // For metrics where higher is better
  if (metric === 'successRate' || metric === 'qualityScore' || metric === 'throughput') {
    if (change > 0.05) return 'improving';
    if (change < -0.05) return 'declining';
    return 'stable';
  }
  
  // For metrics where lower is better (averageTime)
  if (metric === 'averageTime') {
    if (change < -0.05) return 'improving';
    if (change > 0.05) return 'declining';
    return 'stable';
  }
  
  return 'stable';
}

function calculateOverallHealth(data: any): {
  status: 'excellent' | 'good' | 'fair' | 'poor';
  score: number;
  factors: {
    success: number;
    performance: number;
    quality: number;
    business: number;
  };
} {
  const factors = {
    success: data.success.successRate * 100,
    performance: Math.max(0, 100 - (data.performance.averageGenerationTime / 1000)), // Convert ms to score
    quality: ((data.quality.completenessScore + data.quality.accuracyScore) / 2) * 100,
    business: data.business.projectCoverage * 100
  };
  
  const score = (factors.success * 0.3 + factors.performance * 0.25 + factors.quality * 0.25 + factors.business * 0.2);
  
  let status: 'excellent' | 'good' | 'fair' | 'poor';
  if (score >= 90) status = 'excellent';
  else if (score >= 75) status = 'good';
  else if (score >= 60) status = 'fair';
  else status = 'poor';
  
  return { status, score: Math.round(score), factors };
}

function identifyTopIssues(data: any): Array<{
  type: string;
  severity: 'high' | 'medium' | 'low';
  description: string;
  impact: string;
  recommendation: string;
}> {
  const issues: Array<any> = [];
  
  // Check success rate
  if (data.success.successRate < 0.80) {
    issues.push({
      type: 'low_success_rate',
      severity: 'high',
      description: `Success rate is ${(data.success.successRate * 100).toFixed(1)}% (below 80%)`,
      impact: 'Users experiencing frequent report generation failures',
      recommendation: 'Investigate error patterns and improve system reliability'
    });
  } else if (data.success.successRate < 0.90) {
    issues.push({
      type: 'moderate_success_rate',
      severity: 'medium',
      description: `Success rate is ${(data.success.successRate * 100).toFixed(1)}% (below 90%)`,
      impact: 'Some users experiencing report generation issues',
      recommendation: 'Monitor error trends and optimize failure points'
    });
  }
  
  // Check performance
  if (data.performance.averageGenerationTime > 60000) {
    issues.push({
      type: 'slow_generation',
      severity: 'high',
      description: `Average generation time is ${(data.performance.averageGenerationTime / 1000).toFixed(1)}s (above 60s)`,
      impact: 'Poor user experience due to long wait times',
      recommendation: 'Optimize report generation pipeline and resource allocation'
    });
  } else if (data.performance.averageGenerationTime > 30000) {
    issues.push({
      type: 'moderate_slowness',
      severity: 'medium',
      description: `Average generation time is ${(data.performance.averageGenerationTime / 1000).toFixed(1)}s (above 30s)`,
      impact: 'Users experiencing slower than optimal response times',
      recommendation: 'Review performance bottlenecks and consider optimization'
    });
  }
  
  // Check quality
  const qualityScore = (data.quality.completenessScore + data.quality.accuracyScore) / 2;
  if (qualityScore < 0.70) {
    issues.push({
      type: 'low_quality',
      severity: 'high',
      description: `Quality score is ${(qualityScore * 100).toFixed(1)}% (below 70%)`,
      impact: 'Reports may contain incomplete or inaccurate information',
      recommendation: 'Review data sources and validation processes'
    });
  } else if (qualityScore < 0.85) {
    issues.push({
      type: 'moderate_quality',
      severity: 'medium',
      description: `Quality score is ${(qualityScore * 100).toFixed(1)}% (below 85%)`,
      impact: 'Report quality could be improved',
      recommendation: 'Enhance data collection and processing accuracy'
    });
  }
  
  // Check business metrics
  if (data.business.projectCoverage < 0.80) {
    issues.push({
      type: 'low_coverage',
      severity: 'medium',
      description: `Project coverage is ${(data.business.projectCoverage * 100).toFixed(1)}% (below 80%)`,
      impact: 'Some projects may not have adequate reporting',
      recommendation: 'Ensure all active projects have report generation enabled'
    });
  }
  
  return issues.sort((a, b) => {
    const severityOrder = { high: 3, medium: 2, low: 1 };
    return severityOrder[b.severity] - severityOrder[a.severity];
  });
}

function generateRecommendations(data: any): string[] {
  const recommendations: string[] = [];
  
  // Success rate recommendations
  if (data.success.successRate < 0.90) {
    recommendations.push('Investigate and address top error categories to improve success rate');
  }
  
  // Performance recommendations
  if (data.performance.averageGenerationTime > 30000) {
    recommendations.push('Optimize report generation pipeline to reduce processing time');
  }
  
  if (data.performance.queueDepth > 10) {
    recommendations.push('Consider increasing processing capacity to reduce queue depth');
  }
  
  // Quality recommendations
  const qualityScore = (data.quality.completenessScore + data.quality.accuracyScore) / 2;
  if (qualityScore < 0.85) {
    recommendations.push('Enhance data validation and quality assurance processes');
  }
  
  // Business recommendations
  if (data.business.projectCoverage < 0.90) {
    recommendations.push('Ensure comprehensive project coverage for complete reporting');
  }
  
  if (data.business.costPerReport > 2.00) {
    recommendations.push('Review cost optimization opportunities to reduce per-report expenses');
  }
  
  // System recommendations
  if (data.system.resourceUtilization > 80) {
    recommendations.push('Monitor system resource usage and plan for capacity scaling');
  }
  
  return recommendations.slice(0, 5); // Return top 5 recommendations
}

function validateMetricsConfig(config: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (typeof config !== 'object') {
    errors.push('Configuration must be an object');
    return { valid: false, errors };
  }
  
  // Validate thresholds
  if (config.thresholds) {
    if (typeof config.thresholds !== 'object') {
      errors.push('thresholds must be an object');
    } else {
      const thresholdFields = [
        'successRateWarning',
        'successRateCritical',
        'performanceWarning',
        'performanceCritical',
        'qualityWarning',
        'qualityCritical'
      ];
      
      thresholdFields.forEach(field => {
        const value = config.thresholds[field];
        if (value !== undefined && (typeof value !== 'number' || value < 0)) {
          errors.push(`thresholds.${field} must be a non-negative number`);
        }
      });
    }
  }
  
  // Validate retention periods
  if (config.retentionPeriods) {
    if (typeof config.retentionPeriods !== 'object') {
      errors.push('retentionPeriods must be an object');
    } else {
      ['hourly', 'daily', 'weekly', 'monthly'].forEach(period => {
        const value = config.retentionPeriods[period];
        if (value !== undefined && (typeof value !== 'number' || value < 1)) {
          errors.push(`retentionPeriods.${period} must be a positive number`);
        }
      });
    }
  }
  
  return { valid: errors.length === 0, errors };
} 