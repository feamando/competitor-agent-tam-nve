import { CompetitorSnapshotOptimizer } from '../competitorSnapshotOptimizer';
import { prisma } from '@/lib/prisma';
import { webScraperService } from '../webScraper';
import { realTimeStatusService } from '../realTimeStatusService';

// Mock dependencies with COMPLETE Prisma methods - Fix P0.4: Complete Mock Configurations
jest.mock('@/lib/prisma', () => ({
  prisma: {
    project: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      upsert: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
    },
    competitor: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      upsert: jest.fn(),
      count: jest.fn(),
    },
    competitorSnapshot: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      upsert: jest.fn(),
      count: jest.fn(),
    },
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
    $transaction: jest.fn(),
    $executeRaw: jest.fn(),
    $queryRaw: jest.fn(),
  }
}));

jest.mock('../webScraper', () => ({
  webScraperService: {
    initialize: jest.fn(),
    scrapeCompetitor: jest.fn(),
    close: jest.fn()
  }
}));

jest.mock('../realTimeStatusService', () => ({
  realTimeStatusService: {
    sendSnapshotCaptureUpdate: jest.fn()
  }
}));

// Mock p-limit to control concurrency testing
jest.mock('p-limit', () => {
  return jest.fn(() => {
    const mockLimit = jest.fn((fn) => fn());
    Object.assign(mockLimit, {
      activeCount: 0,
      pendingCount: 0
    });
    return mockLimit;
  });
});

describe('CompetitorSnapshotOptimizer', () => {
  let optimizer: CompetitorSnapshotOptimizer;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create fresh optimizer instance for each test
    optimizer = new CompetitorSnapshotOptimizer({
      maxConcurrentPerProject: 2,
      maxGlobalConcurrent: 5,
      perDomainThrottleMs: 1000, // 1 second for testing
      dailySnapshotLimit: 10,
      circuitBreakerThreshold: 0.5,
      circuitBreakerWindowMs: 5000, // 5 seconds for testing
      maxTotalCaptureTime: 10000 // 10 seconds for testing
    });
  });

  describe('Website Complexity Analysis', () => {
    it('should correctly categorize marketplace sites', () => {
      const profile = (optimizer as any).analyzeWebsiteComplexity('https://uber.com');
      
      expect(profile.type).toBe('marketplace');
      expect(profile.timeout).toBe(30000);
      expect(profile.requiresJavaScript).toBe(true);
      expect(profile.expectedLoadTime).toBe(8000);
    });

    it('should correctly categorize SaaS platforms', () => {
      const profile = (optimizer as any).analyzeWebsiteComplexity('https://app.salesforce.com');
      
      expect(profile.type).toBe('saas');
      expect(profile.timeout).toBe(25000);
      expect(profile.requiresJavaScript).toBe(true);
      expect(profile.expectedLoadTime).toBe(6000);
    });

    it('should correctly categorize e-commerce sites', () => {
      const profile = (optimizer as any).analyzeWebsiteComplexity('https://shop.example.com');
      
      expect(profile.type).toBe('ecommerce');
      expect(profile.timeout).toBe(20000);
      expect(profile.requiresJavaScript).toBe(true);
      expect(profile.expectedLoadTime).toBe(4000);
    });

    it('should correctly categorize basic sites', () => {
      const profile = (optimizer as any).analyzeWebsiteComplexity('https://blog.example.com');
      
      expect(profile.type).toBe('basic');
      expect(profile.timeout).toBe(15000);
      expect(profile.requiresJavaScript).toBe(false);
      expect(profile.expectedLoadTime).toBe(2000);
    });

    it('should use default profile for unknown sites', () => {
      const profile = (optimizer as any).analyzeWebsiteComplexity('https://unknown-site.com');
      
      expect(profile.type).toBe('complex');
      expect(profile.timeout).toBe(20000);
      expect(profile.requiresJavaScript).toBe(true);
      expect(profile.expectedLoadTime).toBe(5000);
    });
  });

  describe('Domain Throttling', () => {
    it('should track domain throttling correctly', () => {
      const domain = 'example.com';
      
      // First request should not be throttled
      expect((optimizer as any).isDomainThrottled(domain)).toBe(false);
      
      // Update throttle state
      (optimizer as any).updateDomainThrottle(domain);
      
      // Second request should be throttled
      expect((optimizer as any).isDomainThrottled(domain)).toBe(true);
    });

    it('should wait for domain throttle to clear', async () => {
      const domain = 'example.com';
      
      // Update throttle state
      (optimizer as any).updateDomainThrottle(domain);
      
      const startTime = Date.now();
      await (optimizer as any).waitForDomainThrottle(domain);
      const endTime = Date.now();
      
      // Should have waited for throttle period
      expect(endTime - startTime).toBeGreaterThanOrEqual(900); // Allow some margin
    });

    it('should extract domain correctly from URLs', () => {
      expect((optimizer as any).extractDomain('https://www.example.com/path')).toBe('www.example.com');
      expect((optimizer as any).extractDomain('http://subdomain.example.com')).toBe('subdomain.example.com');
      expect((optimizer as any).extractDomain('invalid-url')).toBe('invalid-url');
    });
  });

  describe('Circuit Breaker', () => {
    it('should open circuit breaker after high error rate', () => {
      // Record multiple failures to trigger circuit breaker
      for (let i = 0; i < 10; i++) {
        (optimizer as any).recordFailure();
      }
      
      const status = optimizer.getSystemStatus();
      expect(status.circuitBreakerState).toBe('open');
    });

    it('should close circuit breaker after successful attempts in half-open state', () => {
      // First open the circuit breaker
      for (let i = 0; i < 10; i++) {
        (optimizer as any).recordFailure();
      }
      
      // Move to half-open state
      (optimizer as any).circuitBreakerState.state = 'half-open';
      (optimizer as any).circuitBreakerState.successCount = 0;
      
      // Record successes
      for (let i = 0; i < 3; i++) {
        (optimizer as any).recordSuccess();
      }
      
      const status = optimizer.getSystemStatus();
      expect(status.circuitBreakerState).toBe('closed');
    });

    it('should prevent attempts when circuit breaker is open', () => {
      // Open circuit breaker
      (optimizer as any).circuitBreakerState.state = 'open';
      (optimizer as any).circuitBreakerState.nextAttemptTime = new Date(Date.now() + 10000);
      
      expect((optimizer as any).canAttemptAfterCircuitBreaker()).toBe(false);
    });
  });

  describe('Error Categorization', () => {
    it('should categorize timeout errors correctly', () => {
      expect((optimizer as any).categorizeError('Request timeout')).toBe('timeout');
      expect((optimizer as any).categorizeError('Operation timed out')).toBe('timeout');
    });

    it('should categorize rate limit errors correctly', () => {
      expect((optimizer as any).categorizeError('Rate limit exceeded')).toBe('rate_limit');
      expect((optimizer as any).categorizeError('Request throttled')).toBe('rate_limit');
    });

    it('should categorize network errors correctly', () => {
      expect((optimizer as any).categorizeError('Network connection failed')).toBe('network');
      expect((optimizer as any).categorizeError('DNS resolution failed')).toBe('network');
    });

    it('should categorize permission errors correctly', () => {
      expect((optimizer as any).categorizeError('Access forbidden')).toBe('permission');
      expect((optimizer as any).categorizeError('Unauthorized request')).toBe('permission');
    });

    it('should categorize unknown errors correctly', () => {
      expect((optimizer as any).categorizeError('Some random error')).toBe('unknown');
    });
  });

  describe('Daily Limit Management', () => {
    it('should reset daily counter correctly', () => {
      // Set old reset time
      (optimizer as any).dailyResetTime = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
      (optimizer as any).dailySnapshotCount = 5;
      
      (optimizer as any).resetDailyCounterIfNeeded();
      
      expect((optimizer as any).dailySnapshotCount).toBe(0);
    });

    it('should not reset daily counter if within same day', () => {
      (optimizer as any).dailySnapshotCount = 5;
      
      (optimizer as any).resetDailyCounterIfNeeded();
      
      expect((optimizer as any).dailySnapshotCount).toBe(5);
    });
  });

  describe('Optimized Snapshot Capture', () => {
    beforeEach(() => {
      // Mock project with competitors
      (prisma.project.findUnique as jest.Mock).mockResolvedValue({
        id: 'project-1',
        competitors: [
          {
            id: 'comp-1',
            name: 'Competitor 1',
            website: 'https://example1.com'
          },
          {
            id: 'comp-2',
            name: 'Competitor 2',
            website: 'https://shop.example2.com'
          }
        ]
      });

      (webScraperService.initialize as jest.Mock).mockResolvedValue(undefined);
      (webScraperService.close as jest.Mock).mockResolvedValue(undefined);
      (webScraperService.scrapeCompetitor as jest.Mock)
        .mockResolvedValueOnce('snapshot-1')
        .mockResolvedValueOnce('snapshot-2');
    });

    it('should successfully capture competitor snapshots', async () => {
      const result = await optimizer.captureCompetitorSnapshotsOptimized('project-1', {
        priority: 'high',
        projectId: 'project-1',
        isInitialReport: true
      });

      expect(result.success).toBe(true);
      expect(result.capturedCount).toBe(2);
      expect(result.totalCompetitors).toBe(2);
      expect(result.failures).toHaveLength(0);
      expect(result.rateLimitingTriggered).toBe(false);
      expect(result.circuitBreakerActivated).toBe(false);
    });

    it('should handle project not found', async () => {
      (prisma.project.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await optimizer.captureCompetitorSnapshotsOptimized('nonexistent-project');
      
      expect(result.success).toBe(false);
      expect(result.failures[0].error).toContain('Project nonexistent-project not found');
    });

    it('should handle project with no competitors', async () => {
      (prisma.project.findUnique as jest.Mock).mockResolvedValue({
        id: 'project-1',
        competitors: []
      });

      const result = await optimizer.captureCompetitorSnapshotsOptimized('project-1');

      expect(result.success).toBe(false);
      expect(result.capturedCount).toBe(0);
      expect(result.totalCompetitors).toBe(0);
    });

    it('should handle partial capture failures', async () => {
      (webScraperService.scrapeCompetitor as jest.Mock)
        .mockReset()
        .mockResolvedValueOnce('snapshot-1')
        .mockRejectedValueOnce(new Error('Capture failed'));

      const result = await optimizer.captureCompetitorSnapshotsOptimized('project-1');

      expect(result.success).toBe(true); // Still successful if at least one capture succeeds
      expect(result.capturedCount).toBe(1);
      expect(result.totalCompetitors).toBe(2);
      expect(result.failures).toHaveLength(1);
      expect(result.failures[0].error).toBe('Capture failed');
    });

    it('should respect daily snapshot limits', async () => {
      // Set daily count to limit
      (optimizer as any).dailySnapshotCount = 10;

      const result = await optimizer.captureCompetitorSnapshotsOptimized('project-1');
      
      expect(result.success).toBe(false);
      expect(result.failures[0].error).toContain('Daily snapshot limit (10) exceeded');
    });

    it('should handle circuit breaker open state', async () => {
      // Open circuit breaker
      (optimizer as any).circuitBreakerState.state = 'open';
      (optimizer as any).circuitBreakerState.nextAttemptTime = new Date(Date.now() + 10000);

      const result = await optimizer.captureCompetitorSnapshotsOptimized('project-1');
      
      expect(result.success).toBe(false);
      expect(result.circuitBreakerActivated).toBe(true);
      expect(result.failures[0].error).toContain('Circuit breaker is open');
    });

    it('should send real-time status updates', async () => {
      await optimizer.captureCompetitorSnapshotsOptimized('project-1');

      expect(realTimeStatusService.sendSnapshotCaptureUpdate).toHaveBeenCalledTimes(2);
      expect(realTimeStatusService.sendSnapshotCaptureUpdate).toHaveBeenCalledWith(
        'project-1',
        0,
        2,
        'Competitor 1'
      );
      expect(realTimeStatusService.sendSnapshotCaptureUpdate).toHaveBeenCalledWith(
        'project-1',
        1,
        2,
        'Competitor 2'
      );
    });

    it('should use appropriate timeouts based on website complexity', async () => {
      await optimizer.captureCompetitorSnapshotsOptimized('project-1');

      // Verify scraper was called with appropriate settings for each competitor
      const calls = (webScraperService.scrapeCompetitor as jest.Mock).mock.calls;
      
      expect(calls[0][1].timeout).toBe(20000); // Default timeout for first competitor
      expect(calls[1][1].timeout).toBe(20000); // E-commerce timeout for second competitor
    });
  });

  describe('Configuration Management', () => {
    it('should return current system status', () => {
      const status = optimizer.getSystemStatus();

      expect(status).toHaveProperty('circuitBreakerState');
      expect(status).toHaveProperty('dailySnapshotCount');
      expect(status).toHaveProperty('dailyLimit');
      expect(status).toHaveProperty('activeThrottledDomains');
      expect(status).toHaveProperty('globalConcurrencyLimit');
      expect(status).toHaveProperty('config');
    });

    it('should update configuration correctly', () => {
      const newConfig = {
        maxGlobalConcurrent: 10,
        dailySnapshotLimit: 500
      };

      optimizer.updateConfig(newConfig);
      const status = optimizer.getSystemStatus();

      expect(status.config.maxGlobalConcurrent).toBe(10);
      expect(status.config.dailySnapshotLimit).toBe(500);
    });
  });

  describe('Singleton Pattern', () => {
    it('should return same instance', () => {
      const instance1 = CompetitorSnapshotOptimizer.getInstance();
      const instance2 = CompetitorSnapshotOptimizer.getInstance();
      
      expect(instance1).toBe(instance2);
    });
  });

  describe('Performance and Resource Management', () => {
    it('should track resource usage metrics', async () => {
      const result = await optimizer.captureCompetitorSnapshotsOptimized('project-1');

      expect(result.resourceUsage).toHaveProperty('avgTimePerSnapshot');
      expect(result.resourceUsage).toHaveProperty('maxConcurrentReached');
      expect(result.resourceUsage).toHaveProperty('throttledDomains');
      expect(typeof result.resourceUsage.avgTimePerSnapshot).toBe('number');
    });

    it('should handle timeout scenarios gracefully', async () => {
      // Make scraper service hang to trigger timeout
      (webScraperService.scrapeCompetitor as jest.Mock)
        .mockReset()
        .mockImplementation(() => new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Request timeout')), 100);
        }));

      const result = await optimizer.captureCompetitorSnapshotsOptimized('project-1', {
        priority: 'high',
        projectId: 'project-1',
        isInitialReport: true,
        maxWaitTime: 1000 // 1 second timeout
      });

      // Should fail due to timeout
      expect(result.success).toBe(false);
      expect(result.failures.length).toBeGreaterThan(0);
    });
  });
}); 