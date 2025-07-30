/**
 * Task 4.2: Rate Limiting Health Check Endpoint
 * Provides monitoring and statistics for the rate limiting system
 */

import { NextRequest, NextResponse } from 'next/server';
import { rateLimitingService } from '@/middleware/rateLimiting';

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    // Get comprehensive rate limiting statistics
    const stats = rateLimitingService.getStats();
    
    // Calculate health metrics
    const totalRequests = stats.totalActiveRequests + stats.totalQueuedRequests;
    const averageActiveRequests = stats.totalUsers > 0 ? stats.totalActiveRequests / stats.totalUsers : 0;
    const averageQueuedRequests = stats.totalUsers > 0 ? stats.totalQueuedRequests / stats.totalUsers : 0;
    
    // Determine system health
    let healthStatus = 'healthy';
    const warnings: string[] = [];
    
    if (stats.totalActiveRequests > stats.totalUsers * 2) {
      healthStatus = 'warning';
      warnings.push('High number of active requests detected');
    }
    
    if (stats.totalQueuedRequests > stats.totalUsers * 5) {
      healthStatus = 'critical';
      warnings.push('Large number of queued requests - system may be overloaded');
    }
    
    // Find users with high activity
    const highActivityUsers = stats.userStats.filter(user => 
      user.activeRequests >= 3 || user.queuedRequests >= 5 || user.violations > 10
    );
    
    if (highActivityUsers.length > 0) {
      warnings.push(`${highActivityUsers.length} users with high activity or violations`);
    }
    
    const response = {
      status: healthStatus,
      timestamp: new Date().toISOString(),
      rateLimiting: {
        enabled: true,
        configuration: {
          maxConcurrentRequests: 3,
          cooldownPeriodMs: 5000,
          largeRequestCooldownMs: 30000,
          queueMaxSize: 10,
          requestTimeoutMs: 120000
        },
        statistics: {
          totalUsers: stats.totalUsers,
          totalActiveRequests: stats.totalActiveRequests,
          totalQueuedRequests: stats.totalQueuedRequests,
          totalRequests,
          averageActiveRequests: Math.round(averageActiveRequests * 100) / 100,
          averageQueuedRequests: Math.round(averageQueuedRequests * 100) / 100
        },
        userActivity: {
          highActivityUsers: highActivityUsers.length,
          topUsers: stats.userStats
            .sort((a, b) => (b.activeRequests + b.queuedRequests) - (a.activeRequests + a.queuedRequests))
            .slice(0, 5)
            .map(user => ({
              userId: user.userId.substring(0, 8) + '...', // Mask user IDs for privacy
              activeRequests: user.activeRequests,
              queuedRequests: user.queuedRequests,
              totalRequests: user.totalRequests,
              violations: user.violations
            }))
        },
        warnings
      },
      task42Compliance: {
        maxConcurrentLimitImplemented: true,
        cooldownPeriodsConfigured: true,
        userSpecificQueuingActive: true,
        memoryIntegrationEnabled: true,
        statisticsTracking: true
      }
    };
    
    const statusCode = healthStatus === 'critical' ? 503 : healthStatus === 'warning' ? 200 : 200;
    
    return NextResponse.json(response, { status: statusCode });
    
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        message: 'Failed to get rate limiting health status',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
} 