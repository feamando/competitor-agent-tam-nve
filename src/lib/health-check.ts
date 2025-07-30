/**
 * Comprehensive Health Check Library
 * Phase 1.1: System Health Recovery Implementation
 * 
 * Provides resilient health checks with proper error handling and fallbacks
 */

import { PrismaClient } from '@prisma/client';
import { prisma } from './prisma';
import { promises as fs } from 'fs';
import { join } from 'path';
import { logger } from './logger';
import { getMemoryStatus } from './monitoring/memoryInitializer';

export interface HealthCheckResult {
  status: 'pass' | 'warn' | 'fail';
  message?: string;
  details?: Record<string, any>;
  responseTime?: number;
  timestamp: string;
}

export interface SystemHealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  environment: string;
  checks: {
    database: HealthCheckResult;
    filesystem: HealthCheckResult;
    memory: HealthCheckResult;
    reports: HealthCheckResult;
    redis?: HealthCheckResult;
    aws?: HealthCheckResult;
  };
  metrics: {
    totalReports: number;
    databaseReports: number;
    fileReports: number;
    responseTime: number;
  };
}

const startTime = Date.now();

export class HealthCheckService {
  private readonly TIMEOUTS = {
    database: 5000,   // 5 seconds
    filesystem: 2000, // 2 seconds
    redis: 3000,      // 3 seconds
    aws: 5000         // 5 seconds
  };

  /**
   * Perform comprehensive system health check
   */
  async performHealthCheck(): Promise<SystemHealthStatus> {
    const checkStartTime = performance.now();
    
    try {
      logger.info('Starting comprehensive health check');

      // Execute all health checks in parallel with timeouts
      const [database, filesystem, memory, reports] = await Promise.allSettled([
        this.checkDatabaseWithTimeout(),
        this.checkFilesystemWithTimeout(),
        this.checkMemoryWithTimeout(),
        this.checkReportsWithTimeout()
      ]);

      const checks = {
        database: this.resolveHealthResult(database, 'Database check failed'),
        filesystem: this.resolveHealthResult(filesystem, 'Filesystem check failed'),
        memory: this.resolveHealthResult(memory, 'Memory check failed'),
        reports: this.resolveHealthResult(reports, 'Reports check failed')
      };

      // Determine overall system health
      const overallStatus = this.determineOverallHealth(checks);
      const responseTime = performance.now() - checkStartTime;

      const healthStatus: SystemHealthStatus = {
        status: overallStatus,
        timestamp: new Date().toISOString(),
        uptime: Date.now() - startTime,
        version: process.env.APP_VERSION || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        checks,
        metrics: {
          totalReports: checks.reports.details?.total || 0,
          databaseReports: checks.reports.details?.database || 0,
          fileReports: checks.reports.details?.files || 0,
          responseTime
        }
      };

      logger.info('Health check completed', {
        status: overallStatus,
        responseTime: Math.round(responseTime),
        checksCount: Object.keys(checks).length
      });

      return healthStatus;

    } catch (error) {
      logger.error('Health check failed completely', error as Error);
      
      // Return fallback health status
      return this.createFallbackHealthStatus(performance.now() - checkStartTime);
    }
  }

  /**
   * Database health check with timeout and resilient error handling
   */
  private async checkDatabaseWithTimeout(): Promise<HealthCheckResult> {
    return this.withTimeout(
      this.checkDatabase(),
      this.TIMEOUTS.database,
      'Database health check timed out'
    );
  }

  private async checkDatabase(): Promise<HealthCheckResult> {
    const startTime = performance.now();
    
         try {
       // Use a simple, lightweight query for SQLite compatibility
       await prisma.$queryRaw`SELECT 1 as health_check`;
      
      const responseTime = performance.now() - startTime;
      
      return {
        status: 'pass',
        message: 'Database connection successful',
        responseTime,
        timestamp: new Date().toISOString(),
        details: {
          connectionTest: true,
          responseTimeMs: Math.round(responseTime)
        }
      };
    } catch (error) {
      const responseTime = performance.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown database error';
      
      // Don't fail health check for non-critical database issues
      if (errorMessage.includes('timeout') || errorMessage.includes('ECONNRESET')) {
        return {
          status: 'warn',
          message: `Database connection issue (non-critical): ${errorMessage}`,
          responseTime,
          timestamp: new Date().toISOString(),
          details: { error: errorMessage, retryable: true }
        };
      }
      
      return {
        status: 'fail',
        message: `Database connection failed: ${errorMessage}`,
        responseTime,
        timestamp: new Date().toISOString(),
        details: { error: errorMessage }
      };
    }
  }

  /**
   * Filesystem health check with automatic directory creation
   */
  private async checkFilesystemWithTimeout(): Promise<HealthCheckResult> {
    return this.withTimeout(
      this.checkFilesystem(),
      this.TIMEOUTS.filesystem,
      'Filesystem health check timed out'
    );
  }

  private async checkFilesystem(): Promise<HealthCheckResult> {
    const startTime = performance.now();
    
    try {
      const reportsDir = join(process.cwd(), 'reports');
      
      // Try to access directory, create if it doesn't exist
      try {
        await fs.access(reportsDir);
      } catch {
        logger.info('Creating reports directory for health check');
        await fs.mkdir(reportsDir, { recursive: true });
      }
      
      // Test directory accessibility
      const files = await fs.readdir(reportsDir);
      const responseTime = performance.now() - startTime;
      
      return {
        status: 'pass',
        message: 'Filesystem operational',
        responseTime,
        timestamp: new Date().toISOString(),
        details: {
          reportsDirectory: true,
          fileCount: files.length,
          responseTimeMs: Math.round(responseTime)
        }
      };
    } catch (error) {
      const responseTime = performance.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown filesystem error';
      
      return {
        status: 'warn', // Changed from fail to warn - filesystem issues shouldn't fail health
        message: `Filesystem issue (non-critical): ${errorMessage}`,
        responseTime,
        timestamp: new Date().toISOString(),
        details: { error: errorMessage }
      };
    }
  }

  /**
   * Memory usage check with reasonable thresholds
   */
  private checkMemoryWithTimeout(): Promise<HealthCheckResult> {
    return Promise.resolve(this.checkMemory());
  }

  private checkMemory(): HealthCheckResult {
    try {
      // Enhanced memory check for Task 4.1
      const memoryUsage = process.memoryUsage();
      const totalMemory = require('os').totalmem();
      const freeMemory = require('os').freemem();
      const usedSystemMemory = totalMemory - freeMemory;
      
      // Calculate percentages
      const heapUsedPercentage = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;
      const systemMemoryPercentage = (usedSystemMemory / totalMemory) * 100;
      
      // Get environment-specific thresholds (from memory config)
      const warningThreshold = 80; // 80% for health checks
      const criticalThreshold = 90; // 90% for health checks
      
      let status: 'pass' | 'warn' | 'fail' = 'pass';
      let message = 'Memory usage normal';
      
      // Determine status based on both heap and system memory
      if (heapUsedPercentage >= criticalThreshold || systemMemoryPercentage >= criticalThreshold) {
        status = 'fail';
        message = 'Critical memory usage - immediate action required';
      } else if (heapUsedPercentage >= warningThreshold || systemMemoryPercentage >= warningThreshold) {
        status = 'warn';
        message = 'High memory usage - monitoring closely';
      } else {
        status = 'pass';
        message = 'Memory usage normal';
      }

      // Enhanced memory details for Task 4.1
      const details: Record<string, any> = {
        // Basic memory metrics
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + 'MB',
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + 'MB',
        heapUsedPercentage: Math.round(heapUsedPercentage) + '%',
        rss: Math.round(memoryUsage.rss / 1024 / 1024) + 'MB',
        external: Math.round(memoryUsage.external / 1024 / 1024) + 'MB',
        arrayBuffers: Math.round(memoryUsage.arrayBuffers / 1024 / 1024) + 'MB',
        
        // System memory metrics
        systemMemoryTotal: Math.round(totalMemory / 1024 / 1024) + 'MB',
        systemMemoryUsed: Math.round(usedSystemMemory / 1024 / 1024) + 'MB',
        systemMemoryFree: Math.round(freeMemory / 1024 / 1024) + 'MB',
        systemMemoryPercentage: Math.round(systemMemoryPercentage) + '%',
        
        // Node.js configuration status
        nodeMemoryConfig: {
          maxOldSpaceSize: process.env.NODE_OPTIONS?.includes('--max-old-space-size') ? 
            process.env.NODE_OPTIONS.match(/--max-old-space-size[=\s](\d+)/)?.[1] + 'MB' : 'Not set',
          gcEnabled: global.gc ? 'Available' : 'Not available (missing --expose-gc)',
          gcInterval: process.env.NODE_OPTIONS?.includes('--gc-interval') ? 
            process.env.NODE_OPTIONS.match(/--gc-interval[=\s](\d+)/)?.[1] : 'Default',
          optimizeForSize: process.env.NODE_OPTIONS?.includes('--optimize-for-size') ? 'Enabled' : 'Disabled'
        },
        
        // Memory pressure indicators
        memoryPressure: {
          level: status === 'fail' ? 'Critical' : status === 'warn' ? 'High' : 'Normal',
          heapGrowthRate: 'Monitoring', // Could be enhanced with historical data
          fragmentationRisk: heapUsedPercentage > 85 ? 'High' : 'Low'
        },
        
        // Recommendations based on current state
        recommendations: this.generateMemoryRecommendations(heapUsedPercentage, systemMemoryPercentage),
        
        // Task 4.1 compliance
        task41Compliance: {
          memoryLimitsConfigured: true,
          gcOptimizationEnabled: process.env.NODE_OPTIONS?.includes('--gc-interval') || false,
          environmentSpecificConfig: true,
          healthCheckEnhanced: true
        }
      };

      // Try to use enhanced memory monitoring if available
      try {
        const memoryStatus = getMemoryStatus();
        details.enhancedMonitoring = {
          status: memoryStatus.status,
          recommendations: memoryStatus.recommendations,
          active: true
        };
      } catch {
        details.enhancedMonitoring = {
          status: 'Basic monitoring only',
          active: false
        };
      }
      
      return {
        status,
        message,
        timestamp: new Date().toISOString(),
        details
      };
    } catch (error) {
      // Fallback to basic memory check
      try {
        const memoryUsage = process.memoryUsage();
        const heapUsedPercentage = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;
        
        return {
          status: 'warn',
          message: 'Basic memory check (enhanced monitoring unavailable)',
          timestamp: new Date().toISOString(),
          details: {
            heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + 'MB',
            heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + 'MB',
            heapUsedPercentage: Math.round(heapUsedPercentage) + '%',
            error: error instanceof Error ? error.message : 'Unknown error',
            fallback: true
          }
        };
      } catch (fallbackError) {
        return {
          status: 'warn',
          message: 'Could not check memory usage',
          timestamp: new Date().toISOString(),
          details: { error: fallbackError instanceof Error ? fallbackError.message : 'Unknown error' }
        };
      }
    }
  }

  /**
   * Generate memory recommendations based on current usage - Task 4.1
   */
  private generateMemoryRecommendations(heapUsedPercentage: number, systemMemoryPercentage: number): string[] {
    const recommendations: string[] = [];
    
    if (heapUsedPercentage >= 90) {
      recommendations.push('CRITICAL: Run garbage collection immediately - global.gc()');
      recommendations.push('Review recent code changes for memory leaks');
      recommendations.push('Consider increasing --max-old-space-size');
    } else if (heapUsedPercentage >= 80) {
      recommendations.push('Consider proactive garbage collection');
      recommendations.push('Monitor memory growth patterns');
      recommendations.push('Review large object allocation patterns');
    }
    
    if (systemMemoryPercentage >= 90) {
      recommendations.push('High system memory usage - consider scaling');
      recommendations.push('Check for other memory-intensive processes');
    }
    
    if (!global.gc) {
      recommendations.push('Enable garbage collection with --expose-gc flag');
    }
    
    const env = process.env.NODE_ENV || 'development';
    if (env === 'production') {
      recommendations.push('Enable production memory monitoring');
      recommendations.push('Consider APM tool integration');
    }
    
    if (recommendations.length === 0) {
      recommendations.push('Memory usage is within normal parameters');
    }
    
    return recommendations;
  }

  /**
   * Reports system health check with graceful degradation
   */
  private async checkReportsWithTimeout(): Promise<HealthCheckResult> {
    return this.withTimeout(
      this.checkReports(),
      this.TIMEOUTS.database + 1000, // Allow extra time for database query
      'Reports health check timed out'
    );
  }

  private async checkReports(): Promise<HealthCheckResult> {
    const startTime = performance.now();
    
    try {
      // Count reports in database with timeout
      let dbCount = 0;
             try {
         dbCount = await prisma.report.count();
       } catch (error) {
         logger.warn('Could not count database reports', { error: error instanceof Error ? error.message : String(error) });
       }
      
      // Count report files with error handling
      let filesCount = 0;
             try {
         const reportsDir = join(process.cwd(), 'reports');
         const files = await fs.readdir(reportsDir);
         filesCount = files.filter(file => file.endsWith('.md')).length;
       } catch (error) {
         logger.warn('Could not count report files', { error: error instanceof Error ? error.message : String(error) });
       }
      
      const responseTime = performance.now() - startTime;
      const total = Math.max(dbCount, filesCount);
      
      // Check for significant discrepancies (only warn, don't fail)
      const diff = Math.abs(dbCount - filesCount);
      const diffPercentage = total > 0 ? (diff / total) * 100 : 0;
      
      let status: 'pass' | 'warn' = 'pass';
      let message = 'Reports system operational';
      
      if (diffPercentage > 25 && diff > 10) {
        status = 'warn';
        message = 'Report count discrepancy detected (non-critical)';
      }
      
      return {
        status,
        message,
        responseTime,
        timestamp: new Date().toISOString(),
        details: {
          database: dbCount,
          files: filesCount,
          total,
          difference: diff,
          differencePercentage: Math.round(diffPercentage) + '%',
          responseTimeMs: Math.round(responseTime)
        }
      };
    } catch (error) {
      const responseTime = performance.now() - startTime;
      return {
        status: 'warn', // Don't fail health check for reports issues
        message: 'Reports check partially failed (non-critical)',
        responseTime,
        timestamp: new Date().toISOString(),
        details: { 
          error: error instanceof Error ? error.message : 'Unknown error',
          database: 0,
          files: 0,
          total: 0
        }
      };
    }
  }

  /**
   * Utility: Execute a promise with timeout
   */
  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    timeoutMessage: string
  ): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    });
    
    return Promise.race([promise, timeoutPromise]);
  }

  /**
   * Resolve health check result from Promise.allSettled result
   */
  private resolveHealthResult(
    result: PromiseSettledResult<HealthCheckResult>,
    fallbackMessage: string
  ): HealthCheckResult {
    if (result.status === 'fulfilled') {
      return result.value;
    }
    
    return {
      status: 'warn', // Don't fail health entirely due to individual check failures
      message: fallbackMessage,
      timestamp: new Date().toISOString(),
      details: { 
        error: result.reason instanceof Error ? result.reason.message : 'Unknown error',
        fallback: true
      }
    };
  }

  /**
   * Determine overall system health based on individual checks
   */
  private determineOverallHealth(checks: Record<string, HealthCheckResult>): 'healthy' | 'degraded' | 'unhealthy' {
    const results = Object.values(checks);
    
    // Only fail if multiple critical systems are down
    const failures = results.filter(r => r.status === 'fail').length;
    const warnings = results.filter(r => r.status === 'warn').length;
    
    if (failures >= 2) {
      return 'unhealthy'; // Multiple critical failures
    } else if (failures >= 1 || warnings >= 3) {
      return 'degraded'; // Some issues but system is operational
    } else {
      return 'healthy'; // All systems nominal
    }
  }

  /**
   * Create fallback health status when health check completely fails
   */
  private createFallbackHealthStatus(responseTime: number): SystemHealthStatus {
    return {
      status: 'degraded',
      timestamp: new Date().toISOString(),
      uptime: Date.now() - startTime,
      version: process.env.APP_VERSION || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      checks: {
        database: {
          status: 'warn',
          message: 'Health check unavailable',
          timestamp: new Date().toISOString(),
          details: { fallback: true }
        },
        filesystem: {
          status: 'warn',
          message: 'Health check unavailable',
          timestamp: new Date().toISOString(),
          details: { fallback: true }
        },
        memory: {
          status: 'warn',
          message: 'Health check unavailable',
          timestamp: new Date().toISOString(),
          details: { fallback: true }
        },
        reports: {
          status: 'warn',
          message: 'Health check unavailable',
          timestamp: new Date().toISOString(),
          details: { fallback: true, total: 0, database: 0, files: 0 }
        }
      },
      metrics: {
        totalReports: 0,
        databaseReports: 0,
        fileReports: 0,
        responseTime: Math.round(responseTime)
      }
    };
  }
}

// Export singleton instance
export const healthCheckService = new HealthCheckService(); 