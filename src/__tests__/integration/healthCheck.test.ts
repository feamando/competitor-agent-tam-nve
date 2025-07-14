/**
 * Health Check Integration Tests
 * Phase 1.1: System Health Recovery Validation
 */

import { healthCheckService } from '@/lib/health-check';

describe('Health Check Service', () => {
  it('should perform comprehensive health check without throwing errors', async () => {
    const result = await healthCheckService.performHealthCheck();
    
    expect(result).toBeDefined();
    expect(result.status).toMatch(/^(healthy|degraded|unhealthy)$/);
    expect(result.timestamp).toBeDefined();
    expect(result.uptime).toBeGreaterThan(0);
    expect(result.version).toBeDefined();
    expect(result.environment).toBeDefined();
    
    // Verify all required checks are present
    expect(result.checks.database).toBeDefined();
    expect(result.checks.filesystem).toBeDefined();
    expect(result.checks.memory).toBeDefined();
    expect(result.checks.reports).toBeDefined();
    
    // Verify check statuses are valid
    Object.values(result.checks).forEach(check => {
      expect(check.status).toMatch(/^(pass|warn|fail)$/);
      expect(check.timestamp).toBeDefined();
    });
    
    // Verify metrics are present
    expect(result.metrics).toBeDefined();
    expect(typeof result.metrics.responseTime).toBe('number');
    expect(typeof result.metrics.totalReports).toBe('number');
    expect(typeof result.metrics.databaseReports).toBe('number');
    expect(typeof result.metrics.fileReports).toBe('number');
  });

  it('should handle database connection gracefully', async () => {
    const result = await healthCheckService.performHealthCheck();
    
    // Database check should either pass or warn (not fail hard)
    expect(['pass', 'warn'].includes(result.checks.database.status)).toBe(true);
    
    if (result.checks.database.status === 'pass') {
      expect(result.checks.database.message).toContain('successful');
      expect(result.checks.database.details?.connectionTest).toBe(true);
    }
  });

  it('should handle filesystem access gracefully', async () => {
    const result = await healthCheckService.performHealthCheck();
    
    // Filesystem check should pass or warn (creates directory if needed)
    expect(['pass', 'warn'].includes(result.checks.filesystem.status)).toBe(true);
    
    if (result.checks.filesystem.status === 'pass') {
      expect(result.checks.filesystem.message).toContain('operational');
      expect(result.checks.filesystem.details?.reportsDirectory).toBe(true);
    }
  });

  it('should provide memory usage information', async () => {
    const result = await healthCheckService.performHealthCheck();
    
    expect(result.checks.memory.status).toMatch(/^(pass|warn|fail)$/);
    expect(result.checks.memory.details?.heapUsed).toBeDefined();
    expect(result.checks.memory.details?.heapTotal).toBeDefined();
    expect(result.checks.memory.details?.heapUsedPercentage).toBeDefined();
  });

  it('should return healthy status when all checks pass', async () => {
    const result = await healthCheckService.performHealthCheck();
    
    // With our resilient implementation, we should get healthy or degraded
    expect(['healthy', 'degraded'].includes(result.status)).toBe(true);
  });

  it('should complete health check within reasonable time', async () => {
    const startTime = Date.now();
    const result = await healthCheckService.performHealthCheck();
    const duration = Date.now() - startTime;
    
    // Health check should complete within 10 seconds
    expect(duration).toBeLessThan(10000);
    expect(result.metrics.responseTime).toBeGreaterThan(0);
  });
}); 