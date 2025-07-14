/**
 * Performance Monitoring Dashboard API
 * Phase 3.1: Real-time performance dashboard endpoints
 * 
 * GET  /api/performance-dashboard - Get real-time dashboard data
 * POST /api/performance-dashboard - Acknowledge alerts and get project-specific performance
 */

import { NextRequest, NextResponse } from 'next/server';
import PerformanceMonitoringService from '../../../services/performanceMonitoringService';
import { generateCorrelationId } from '@/lib/logger';
import { withCache } from '@/lib/cache';

// Cache TTLs in milliseconds
const DASHBOARD_CACHE_TTL = 60 * 1000; // 1 minute
const PROJECT_CACHE_TTL = 2 * 60 * 1000; // 2 minutes

const performanceService = new PerformanceMonitoringService();

/**
 * GET /api/performance-dashboard
 * Get real-time performance dashboard data
 */
export async function GET(request: NextRequest) {
  const correlationId = generateCorrelationId();
  const startTime = performance.now();
  console.log(`[${correlationId}] GET /api/performance-dashboard`);
  
  try {
    const url = new URL(request.url);
    const timeRange = url.searchParams.get('timeRange') as '24h' | '7d' | '30d' | '90d' || '24h';
    const projectId = url.searchParams.get('projectId');
    
    // Set cache control headers for CDN/browser caching
    const headers = {
      'Cache-Control': 'public, max-age=60', // 1 minute browser cache
      'X-Correlation-ID': correlationId
    };
    
    if (projectId) {
      // Get project-specific performance summary with caching
      const projectSummary = await withCache(
        () => performanceService.getProjectPerformanceSummary(projectId as string),
        'project_performance',
        { projectId, timeRange },
        PROJECT_CACHE_TTL
      );
      
      const responseTime = performance.now() - startTime;
      console.log(`[${correlationId}] Project performance data retrieved in ${responseTime.toFixed(2)}ms`);
      
      return NextResponse.json({
        success: true,
        data: projectSummary,
        correlationId,
        responseTime
      }, { headers });
    } else {
      // Get system-wide dashboard data with caching
      const dashboardData = await withCache(
        () => performanceService.getDashboardData(timeRange),
        'dashboard_data',
        { timeRange },
        DASHBOARD_CACHE_TTL
      );
      
      const responseTime = performance.now() - startTime;
      console.log(`[${correlationId}] Dashboard data retrieved in ${responseTime.toFixed(2)}ms`);
      
      return NextResponse.json({
        success: true,
        data: dashboardData,
        correlationId,
        responseTime
      }, { headers });
    }
    
  } catch (error) {
    const responseTime = performance.now() - startTime;
    console.error(`[${correlationId}] Performance dashboard GET failed in ${responseTime.toFixed(2)}ms:`, error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get dashboard data',
      correlationId,
      responseTime
    }, { status: 500 });
  }
}

/**
 * POST /api/performance-dashboard
 * Acknowledge alerts or perform dashboard actions
 */
export async function POST(request: NextRequest) {
  const correlationId = generateCorrelationId();
  const startTime = performance.now();
  console.log(`[${correlationId}] POST /api/performance-dashboard`);
  
  try {
    const body = await request.json();
    const { action, alertId, projectId } = body;
    
    if (action === 'acknowledgeAlert' && alertId) {
      // Acknowledge a specific alert - don't cache this operation
      const result = await performanceService.acknowledgeAlert(alertId);
      
      // Invalidate related caches when acknowledging an alert
      // This ensures the dashboard will fetch fresh data on next request
      // Implementation depends on your caching strategy
      
      const responseTime = performance.now() - startTime;
      
      return NextResponse.json({
        success: true,
        data: { acknowledged: result },
        message: 'Alert acknowledged successfully',
        correlationId,
        responseTime
      });
      
    } else if (action === 'getProjectSummary' && projectId) {
      // Get project-specific performance summary with caching
      const projectSummary = await withCache(
        () => performanceService.getProjectPerformanceSummary(projectId as string),
        'project_performance',
        { projectId },
        PROJECT_CACHE_TTL
      );
      
      const responseTime = performance.now() - startTime;
      
      return NextResponse.json({
        success: true,
        data: projectSummary,
        correlationId,
        responseTime
      });
      
    } else {
      const responseTime = performance.now() - startTime;
      
      return NextResponse.json({
        success: false,
        error: 'Invalid action or missing required parameters',
        correlationId,
        responseTime
      }, { status: 400 });
    }
    
  } catch (error) {
    const responseTime = performance.now() - startTime;
    console.error(`[${correlationId}] Performance dashboard POST failed in ${responseTime.toFixed(2)}ms:`, error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Dashboard action failed',
      correlationId,
      responseTime
    }, { status: 500 });
  }
} 