import { NextRequest, NextResponse } from 'next/server';
import { BedrockServiceMonitor } from '@/lib/monitoring/bedrockServiceMetrics';
import { bedrockCircuitBreaker } from '@/lib/health/bedrockHealthChecker';

/**
 * Bedrock service dashboard data endpoint
 * Implements TP-030 Task 2.1: Dashboard data API
 */
export async function GET(request: NextRequest) {
  try {
    console.log('[API/services/bedrock/dashboard] Fetching dashboard data');

    // Get service monitor instance
    const monitor = BedrockServiceMonitor.getInstance();
    const metrics = monitor.getMetrics();

    // Get current health status
    const healthResponse = await fetch(`${request.nextUrl.origin}/api/system-health/bedrock`);
    const health = await healthResponse.json();

    // Generate mock history data (in a real implementation, this would come from a database)
    const history = generateMockHistory();

    // Generate mock alerts (in a real implementation, this would come from an alerting system)
    const alerts = await generateMockAlerts(metrics);

    const dashboardData = {
      health,
      metrics,
      history,
      alerts,
      timestamp: new Date().toISOString()
    };

    console.log('[API/services/bedrock/dashboard] Dashboard data fetched successfully', {
      metricsCount: Object.keys(metrics).length,
      historyPoints: history.length,
      alertsCount: alerts.length
    });

    return NextResponse.json(dashboardData);

  } catch (error) {
    console.error('[API/services/bedrock/dashboard] Dashboard data fetch failed', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to fetch dashboard data',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * Generate mock historical data points
 * In a real implementation, this would query a time-series database
 */
function generateMockHistory() {
  const history = [];
  const now = new Date();
  
  // Generate 24 hours of data points (every hour)
  for (let i = 23; i >= 0; i--) {
    const timestamp = new Date(now.getTime() - (i * 60 * 60 * 1000));
    
    // Simulate some realistic patterns
    const baseSuccessRate = 95;
    const baseResponseTime = 1500;
    const baseErrorCount = Math.floor(Math.random() * 3);
    
    // Add some variance and occasional issues
    let status: 'healthy' | 'unhealthy' | 'degraded' = 'healthy';
    let successRate = baseSuccessRate + (Math.random() * 10 - 5);
    let responseTime = baseResponseTime + (Math.random() * 1000 - 500);
    
    // Simulate occasional degraded periods
    if (Math.random() < 0.1) { // 10% chance of issues
      status = Math.random() < 0.5 ? 'degraded' : 'unhealthy';
      successRate = Math.max(60, successRate - (Math.random() * 30));
      responseTime = responseTime * (1 + Math.random());
    }
    
    history.push({
      timestamp: timestamp.toISOString(),
      status,
      responseTime: Math.round(responseTime),
      successRate: Math.round(successRate * 10) / 10,
      errorCount: baseErrorCount + (status !== 'healthy' ? Math.floor(Math.random() * 5) : 0)
    });
  }
  
  return history;
}

/**
 * Generate mock alerts based on current metrics
 * In a real implementation, this would come from an alerting system
 */
async function generateMockAlerts(metrics: any) {
  const alerts = [];
  const now = new Date();
  
  // Check for circuit breaker issues
  if (metrics.circuitBreakerState === 'OPEN') {
    alerts.push({
      id: 'circuit-breaker-open',
      level: 'critical',
      message: 'Circuit breaker is OPEN - Service requests are being blocked',
      timestamp: new Date(now.getTime() - 5 * 60 * 1000).toISOString(), // 5 minutes ago
      resolved: false,
      details: {
        circuitBreakerState: metrics.circuitBreakerState,
        failedRequests: metrics.failedRequests
      }
    });
  } else if (metrics.circuitBreakerState === 'HALF_OPEN') {
    alerts.push({
      id: 'circuit-breaker-half-open',
      level: 'warning',
      message: 'Circuit breaker is HALF_OPEN - Service is being tested for recovery',
      timestamp: new Date(now.getTime() - 2 * 60 * 1000).toISOString(), // 2 minutes ago
      resolved: false,
      details: {
        circuitBreakerState: metrics.circuitBreakerState
      }
    });
  }
  
  // Check for high error rate
  const errorRate = metrics.totalRequests > 0 
    ? (metrics.failedRequests / metrics.totalRequests) * 100 
    : 0;
    
  if (errorRate > 10) {
    alerts.push({
      id: 'high-error-rate',
      level: 'error',
      message: `High error rate detected: ${errorRate.toFixed(1)}%`,
      timestamp: new Date(now.getTime() - 10 * 60 * 1000).toISOString(), // 10 minutes ago
      resolved: false,
      details: {
        errorRate,
        failedRequests: metrics.failedRequests,
        totalRequests: metrics.totalRequests
      }
    });
  }
  
  // Check for slow response times
  if (metrics.averageResponseTime > 5000) {
    alerts.push({
      id: 'slow-response-time',
      level: 'warning',
      message: `Slow response times detected: ${metrics.averageResponseTime}ms average`,
      timestamp: new Date(now.getTime() - 15 * 60 * 1000).toISOString(), // 15 minutes ago
      resolved: false,
      details: {
        averageResponseTime: metrics.averageResponseTime
      }
    });
  }
  
  // Add some resolved alerts for history
  if (Math.random() < 0.3) { // 30% chance of having resolved alerts
    alerts.push({
      id: 'resolved-connection-issue',
      level: 'info',
      message: 'Connection issue resolved - Service is operating normally',
      timestamp: new Date(now.getTime() - 60 * 60 * 1000).toISOString(), // 1 hour ago
      resolved: true,
      details: {
        resolutionTime: '5m 32s',
        resolvedBy: 'automatic-recovery'
      }
    });
  }
  
  return alerts;
}