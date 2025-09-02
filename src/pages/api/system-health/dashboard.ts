import { NextApiRequest, NextApiResponse } from 'next';
import { bedrockServiceMonitor } from '../../../lib/monitoring/bedrockServiceMetrics';
import { bedrockCircuitBreaker } from '../../../lib/health/bedrockHealthChecker';

/**
 * Service health dashboard endpoint
 * Implements TP-029 Task 5.3: Dashboard indicators for AI service health status
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const metrics = bedrockServiceMonitor.getMetrics();
    const circuitBreakerMetrics = bedrockCircuitBreaker.getMetrics();
    
    const dashboardData = {
      timestamp: new Date().toISOString(),
      services: {
        bedrock: {
          status: determineServiceStatus(metrics, circuitBreakerMetrics),
          metrics: {
            ...metrics,
            successRate: bedrockServiceMonitor.getSuccessRate(),
            failureRate: bedrockServiceMonitor.getFailureRate()
          },
          circuitBreaker: circuitBreakerMetrics,
          healthIndicators: {
            connectivity: circuitBreakerMetrics.state === 'CLOSED' ? 'healthy' : 'degraded',
            performance: metrics.averageResponseTime < 5000 ? 'healthy' : 'degraded',
            availability: bedrockServiceMonitor.getSuccessRate() > 0.95 ? 'healthy' : 'degraded'
          }
        }
      },
      systemStatus: {
        overall: determineOverallStatus(metrics, circuitBreakerMetrics),
        aiEnhancedReports: circuitBreakerMetrics.state === 'CLOSED' ? 'available' : 'degraded',
        lastUpdate: new Date().toISOString()
      },
      alerts: generateAlerts(metrics, circuitBreakerMetrics)
    };

    res.status(200).json(dashboardData);
  } catch (error) {
    console.error('[API/system-health/dashboard] Error generating dashboard data:', error);
    res.status(500).json({ 
      error: 'Failed to generate dashboard data',
      timestamp: new Date().toISOString()
    });
  }
}

function determineServiceStatus(metrics: any, circuitMetrics: any): 'healthy' | 'degraded' | 'unhealthy' {
  if (circuitMetrics.state === 'OPEN') {
    return 'unhealthy';
  }
  
  if (circuitMetrics.state === 'HALF_OPEN' || bedrockServiceMonitor.getSuccessRate() < 0.95) {
    return 'degraded';
  }
  
  return 'healthy';
}

function determineOverallStatus(metrics: any, circuitMetrics: any): 'operational' | 'degraded' | 'outage' {
  const serviceStatus = determineServiceStatus(metrics, circuitMetrics);
  
  switch (serviceStatus) {
    case 'unhealthy':
      return 'outage';
    case 'degraded':
      return 'degraded';
    default:
      return 'operational';
  }
}

function generateAlerts(metrics: any, circuitMetrics: any): Array<{
  type: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  timestamp: string;
}> {
  const alerts = [];
  const now = new Date().toISOString();

  // Circuit breaker alerts
  if (circuitMetrics.state === 'OPEN') {
    alerts.push({
      type: 'circuit_breaker_open',
      severity: 'critical' as const,
      message: 'Bedrock service circuit breaker is OPEN - AI-enhanced reports unavailable',
      timestamp: now
    });
  } else if (circuitMetrics.state === 'HALF_OPEN') {
    alerts.push({
      type: 'circuit_breaker_recovering',
      severity: 'warning' as const,
      message: 'Bedrock service is recovering from failures - monitoring closely',
      timestamp: now
    });
  }

  // High failure rate alerts
  const failureRate = bedrockServiceMonitor.getFailureRate();
  if (failureRate > 0.5 && metrics.totalRequests > 10) {
    alerts.push({
      type: 'high_failure_rate',
      severity: 'critical' as const,
      message: `High failure rate detected: ${(failureRate * 100).toFixed(1)}%`,
      timestamp: now
    });
  } else if (failureRate > 0.2 && metrics.totalRequests > 5) {
    alerts.push({
      type: 'elevated_failure_rate',
      severity: 'warning' as const,
      message: `Elevated failure rate: ${(failureRate * 100).toFixed(1)}%`,
      timestamp: now
    });
  }

  // Performance alerts
  if (metrics.averageResponseTime > 10000) {
    alerts.push({
      type: 'slow_response',
      severity: 'warning' as const,
      message: `Slow response times detected: ${metrics.averageResponseTime.toFixed(0)}ms average`,
      timestamp: now
    });
  }

  return alerts;
}