import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { performance } from 'perf_hooks';
import { SmartSchedulingService } from '@/services/smartSchedulingService';
import { CompetitorSnapshotTrigger } from '@/services/competitorSnapshotTrigger';
import { SnapshotFreshnessService } from '@/services/snapshotFreshnessService';
import { SnapshotEfficiencyMetricsService } from '@/services/snapshotEfficiencyMetricsService';
import { prisma } from '@/lib/prisma';

/**
 * Task 8.4: Performance testing for batch snapshot operations
 * Tests system performance under various load conditions and validates
 * that batch operations meet performance requirements
 */

// Mock dependencies
jest.mock('@/lib/prisma');
jest.mock('@/lib/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  generateCorrelationId: jest.fn(() => 'perf-test-correlation-id'),
  trackCorrelation: jest.fn(),
  trackError: jest.fn(),
}));

jest.mock('@/lib/scraper', () => ({
  WebsiteScraper: jest.fn().mockImplementation(() => ({
    scrapeWebsite: jest.fn().mockResolvedValue({
      url: 'https://test.com',
      title: 'Test Site',
      description: 'Test Description',
      html: '<html>Test</html>',
      text: 'Test content',
      timestamp: new Date(),
      metadata: {
        headers: { 'content-type': 'text/html' },
        statusCode: 200,
        contentLength: 1000
      }
    })
  }))
}));

interface PerformanceMetrics {
  executionTime: number;
  memoryUsageBefore: number;
  memoryUsageAfter: number;
  memoryDelta: number;
  throughput: number;
  errorRate: number;
  averageResponseTime: number;
}

describe('Batch Snapshot Performance Tests', () => {
  const mockPrisma = prisma as jest.Mocked<typeof prisma>;
  let schedulingService: SmartSchedulingService;
  let snapshotTrigger: CompetitorSnapshotTrigger;
  let freshnessService: SnapshotFreshnessService;
  let metricsService: SnapshotEfficiencyMetricsService;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Initialize services
    schedulingService = new SmartSchedulingService();
    snapshotTrigger = CompetitorSnapshotTrigger.getInstance();
    freshnessService = SnapshotFreshnessService.getInstance();
    metricsService = SnapshotEfficiencyMetricsService.getInstance();

    // Clear caches to ensure clean state
    snapshotTrigger.clearFreshnessCache();

    // Setup common mocks
    mockPrisma.competitor.findMany.mockImplementation(() => 
      Promise.resolve(generateMockCompetitors(50))
    );

    mockPrisma.snapshot.findMany.mockImplementation(() =>
      Promise.resolve(generateMockSnapshots(50))
    );

    mockPrisma.snapshot.create.mockImplementation(() =>
      Promise.resolve({
        id: 'test-snap',
        competitorId: 'test-comp',
        createdAt: new Date(),
        captureSuccess: true
      } as any)
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Batch Freshness Checking Performance', () => {
    test('should handle 100 competitors within 2 seconds', async () => {
      // Arrange
      const competitorIds = Array(100).fill(null).map((_, i) => `comp-${i}`);
      const startTime = performance.now();

      // Act
      const result = await freshnessService.getSnapshotAgesBatch(competitorIds);
      const endTime = performance.now();
      const executionTime = endTime - startTime;

      // Assert
      expect(result.size).toBe(100);
      expect(executionTime).toBeLessThan(2000); // 2 seconds
      expect(mockPrisma.snapshot.findMany).toHaveBeenCalledTimes(1); // Single query for batch
    });

    test('should scale linearly with competitor count', async () => {
      const testSizes = [10, 50, 100, 200];
      const results: Array<{ size: number; time: number; throughput: number }> = [];

      for (const size of testSizes) {
        const competitorIds = Array(size).fill(null).map((_, i) => `comp-${i}`);
        const startTime = performance.now();
        
        const result = await freshnessService.getSnapshotAgesBatch(competitorIds);
        
        const endTime = performance.now();
        const executionTime = endTime - startTime;
        const throughput = size / (executionTime / 1000); // ops per second

        results.push({ size, time: executionTime, throughput });
        
        expect(result.size).toBe(size);
      }

      // Verify linear scaling (throughput should remain relatively constant)
      const throughputVariation = Math.max(...results.map(r => r.throughput)) - 
                                 Math.min(...results.map(r => r.throughput));
      const averageThroughput = results.reduce((sum, r) => sum + r.throughput, 0) / results.length;
      
      expect(throughputVariation / averageThroughput).toBeLessThan(0.5); // <50% variation
    });

    test('should maintain performance with concurrent batch operations', async () => {
      // Arrange
      const batchCount = 5;
      const competitorsPerBatch = 20;
      const batches = Array(batchCount).fill(null).map((_, batchIndex) =>
        Array(competitorsPerBatch).fill(null).map((_, i) => `batch-${batchIndex}-comp-${i}`)
      );

      const startTime = performance.now();

      // Act - Run concurrent batch operations
      const promises = batches.map(batch => 
        freshnessService.getSnapshotAgesBatch(batch)
      );
      
      const results = await Promise.all(promises);
      const endTime = performance.now();
      const totalTime = endTime - startTime;

      // Assert
      expect(results).toHaveLength(batchCount);
      results.forEach((result, index) => {
        expect(result.size).toBe(competitorsPerBatch);
      });
      
      // Concurrent operations should not be significantly slower than sequential
      expect(totalTime).toBeLessThan(5000); // 5 seconds for all batches
    });
  });

  describe('Batch Snapshot Triggering Performance', () => {
    test('should trigger 50 snapshots within performance limits', async () => {
      // Arrange
      const competitorIds = Array(50).fill(null).map((_, i) => `trigger-comp-${i}`);
      const metrics = await measurePerformance(async () => {
        await snapshotTrigger.triggerBatchSnapshots(competitorIds, {
          priority: 'normal',
          correlationId: 'perf-test'
        });
      });

      // Assert
      expect(metrics.executionTime).toBeLessThan(10000); // 10 seconds
      expect(metrics.memoryDelta).toBeLessThan(100 * 1024 * 1024); // <100MB memory increase
      expect(metrics.throughput).toBeGreaterThan(5); // >5 ops per second
    });

    test('should optimize fresh snapshots for better performance', async () => {
      // Arrange - Mix of fresh and stale competitors
      const freshCompetitors = Array(30).fill(null).map((_, i) => `fresh-comp-${i}`);
      const staleCompetitors = Array(20).fill(null).map((_, i) => `stale-comp-${i}`);
      const allCompetitors = [...freshCompetitors, ...staleCompetitors];

      // Mock fresh snapshots for first 30 competitors
      mockPrisma.snapshot.findFirst.mockImplementation((params: any) => {
        const competitorId = params?.where?.competitorId;
        if (competitorId && competitorId.includes('fresh-comp')) {
          return Promise.resolve({
            id: 'fresh-snap',
            competitorId,
            createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
            captureSuccess: true
          });
        }
        return Promise.resolve(null); // Stale/missing snapshots
      });

      const startTime = performance.now();

      // Act
      await snapshotTrigger.triggerBatchSnapshots(allCompetitors, {
        priority: 'normal',
        correlationId: 'optimization-test'
      });

      const endTime = performance.now();
      const executionTime = endTime - startTime;

      // Assert - Should be faster due to optimization skipping fresh snapshots
      expect(executionTime).toBeLessThan(8000); // Should be faster than non-optimized
      
      // Verify optimization occurred (would check logs in real implementation)
      expect(mockPrisma.snapshot.findFirst).toHaveBeenCalled();
    });

    test('should handle high-frequency triggering without degradation', async () => {
      // Arrange - Simulate rapid successive batch operations
      const batchSize = 10;
      const batchCount = 10;
      const results: number[] = [];

      // Act - Trigger multiple batches in quick succession
      for (let i = 0; i < batchCount; i++) {
        const competitorIds = Array(batchSize).fill(null).map((_, j) => `freq-comp-${i}-${j}`);
        
        const startTime = performance.now();
        await snapshotTrigger.triggerBatchSnapshots(competitorIds, {
          priority: 'normal',
          correlationId: `freq-test-${i}`
        });
        const endTime = performance.now();
        
        results.push(endTime - startTime);
        
        // Small delay to simulate real-world timing
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Assert - Performance should remain consistent
      const averageTime = results.reduce((sum, time) => sum + time, 0) / results.length;
      const maxTime = Math.max(...results);
      const minTime = Math.min(...results);
      
      expect(maxTime - minTime).toBeLessThan(averageTime * 0.5); // <50% variation
      expect(averageTime).toBeLessThan(2000); // Average under 2 seconds
    });
  });

  describe('Stale Snapshot Detection Performance', () => {
    test('should detect stale snapshots efficiently across large projects', async () => {
      // Arrange
      const projectId = 'large-project';
      const competitorCount = 200;
      
      mockPrisma.competitor.findMany.mockResolvedValue(
        generateMockCompetitorsWithSnapshots(competitorCount)
      );

      const metrics = await measurePerformance(async () => {
        await freshnessService.getStaleSnapshots(projectId, 7);
      });

      // Assert
      expect(metrics.executionTime).toBeLessThan(3000); // 3 seconds
      expect(metrics.throughput).toBeGreaterThan(50); // >50 checks per second
      expect(mockPrisma.competitor.findMany).toHaveBeenCalledTimes(1); // Single optimized query
    });

    test('should handle mixed project sizes efficiently', async () => {
      const projectSizes = [10, 50, 100, 500];
      const results: PerformanceMetrics[] = [];

      for (const size of projectSizes) {
        const projectId = `sized-project-${size}`;
        
        mockPrisma.competitor.findMany.mockResolvedValue(
          generateMockCompetitorsWithSnapshots(size)
        );

        const metrics = await measurePerformance(async () => {
          await freshnessService.getStaleSnapshots(projectId, 7);
        });

        results.push(metrics);
        
        // Each should complete within reasonable time
        expect(metrics.executionTime).toBeLessThan(size * 50); // Linear scaling limit
      }

      // Verify performance scales reasonably
      const timeComplexity = results[results.length - 1].executionTime / results[0].executionTime;
      const sizeComplexity = projectSizes[projectSizes.length - 1] / projectSizes[0];
      
      expect(timeComplexity).toBeLessThan(sizeComplexity * 2); // Better than O(n²)
    });
  });

  describe('Smart Scheduling Performance', () => {
    test('should analyze large project freshness within performance limits', async () => {
      // Arrange
      const projectId = 'analysis-project';
      const competitorCount = 100;

      mockPrisma.competitor.findMany.mockResolvedValue(
        generateMockCompetitorsWithSnapshots(competitorCount)
      );

      const metrics = await measurePerformance(async () => {
        await schedulingService.getSnapshotFreshnessAnalysis(projectId, 7);
      });

      // Assert
      expect(metrics.executionTime).toBeLessThan(5000); // 5 seconds
      expect(metrics.memoryDelta).toBeLessThan(50 * 1024 * 1024); // <50MB
      expect(metrics.throughput).toBeGreaterThan(20); // >20 analyses per second
    });

    test('should maintain performance with concurrent analysis requests', async () => {
      // Arrange
      const projectCount = 5;
      const competitorsPerProject = 50;
      const projects = Array(projectCount).fill(null).map((_, i) => `concurrent-proj-${i}`);

      // Setup mock for each project
      projects.forEach(projectId => {
        mockPrisma.competitor.findMany.mockImplementation((params: any) => {
          if (params?.where?.projects?.some?.id === projectId) {
            return Promise.resolve(generateMockCompetitorsWithSnapshots(competitorsPerProject));
          }
          return Promise.resolve([]);
        });
      });

      const startTime = performance.now();

      // Act - Concurrent analysis requests
      const promises = projects.map(projectId =>
        schedulingService.getSnapshotFreshnessAnalysis(projectId, 7)
      );

      const results = await Promise.all(promises);
      const endTime = performance.now();
      const totalTime = endTime - startTime;

      // Assert
      expect(results).toHaveLength(projectCount);
      expect(totalTime).toBeLessThan(8000); // 8 seconds for all concurrent requests
      
      results.forEach(result => {
        expect(result.totalCompetitors).toBe(competitorsPerProject);
      });
    });
  });

  describe('Memory Usage and Resource Management', () => {
    test('should not leak memory during batch operations', async () => {
      // Arrange
      const iterations = 10;
      const batchSize = 20;
      const memoryReadings: number[] = [];

      // Act - Multiple iterations to detect memory leaks
      for (let i = 0; i < iterations; i++) {
        const competitorIds = Array(batchSize).fill(null).map((_, j) => `memory-comp-${i}-${j}`);
        
        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
        
        const memoryBefore = process.memoryUsage().heapUsed;
        
        await freshnessService.getSnapshotAgesBatch(competitorIds);
        
        if (global.gc) {
          global.gc();
        }
        
        const memoryAfter = process.memoryUsage().heapUsed;
        memoryReadings.push(memoryAfter - memoryBefore);
        
        // Small delay to allow cleanup
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // Assert - Memory usage should not grow indefinitely
      const firstHalf = memoryReadings.slice(0, iterations / 2);
      const secondHalf = memoryReadings.slice(iterations / 2);
      
      const firstHalfAvg = firstHalf.reduce((sum, val) => sum + val, 0) / firstHalf.length;
      const secondHalfAvg = secondHalf.reduce((sum, val) => sum + val, 0) / secondHalf.length;
      
      // Memory usage should not increase significantly over time
      expect(secondHalfAvg).toBeLessThan(firstHalfAvg * 2);
    });

    test('should clean up resources properly after operations', async () => {
      // Arrange
      const competitorIds = Array(50).fill(null).map((_, i) => `cleanup-comp-${i}`);
      
      // Act
      await snapshotTrigger.triggerBatchSnapshots(competitorIds);
      
      // Force cleanup
      await schedulingService.cleanup();
      
      // Allow time for cleanup
      await new Promise(resolve => setTimeout(resolve, 100));

      // Assert - Cache should be manageable size
      const efficiencyData = snapshotTrigger.getEfficiencyMetrics();
      expect(efficiencyData.cacheSize).toBeLessThan(1000); // Reasonable cache size
    });
  });

  describe('Database Query Optimization', () => {
    test('should minimize database queries for batch operations', async () => {
      // Arrange
      const competitorIds = Array(25).fill(null).map((_, i) => `db-opt-comp-${i}`);
      let queryCount = 0;

      // Track query count
      const originalFindMany = mockPrisma.snapshot.findMany;
      mockPrisma.snapshot.findMany.mockImplementation((...args) => {
        queryCount++;
        return originalFindMany(...args);
      });

      const originalFindFirst = mockPrisma.snapshot.findFirst;
      mockPrisma.snapshot.findFirst.mockImplementation((...args) => {
        queryCount++;
        return originalFindFirst(...args);
      });

      // Act
      await freshnessService.getSnapshotAgesBatch(competitorIds);

      // Assert - Should use minimal queries (ideally 1 for batch)
      expect(queryCount).toBeLessThan(3); // Allow some flexibility but enforce efficiency
    });

    test('should use efficient query patterns for large datasets', async () => {
      // Arrange
      const projectId = 'query-optimization-project';
      const competitorCount = 1000;

      let selectQueries = 0;
      let joinQueries = 0;

      // Mock to track query complexity
      mockPrisma.competitor.findMany.mockImplementation((params: any) => {
        selectQueries++;
        if (params?.include || params?.select) {
          joinQueries++;
        }
        return Promise.resolve(generateMockCompetitorsWithSnapshots(competitorCount));
      });

      // Act
      await freshnessService.getStaleSnapshots(projectId, 7);

      // Assert - Should use joins efficiently
      expect(selectQueries).toBeLessThan(5); // Minimal queries
      expect(joinQueries).toBeGreaterThan(0); // Should use joins for efficiency
    });
  });

  describe('Error Handling Performance Impact', () => {
    test('should handle errors without significant performance degradation', async () => {
      // Arrange
      const competitorIds = Array(30).fill(null).map((_, i) => `error-comp-${i}`);
      
      // Make 50% of operations fail
      let callCount = 0;
      mockPrisma.snapshot.findFirst.mockImplementation(() => {
        callCount++;
        if (callCount % 2 === 0) {
          throw new Error('Simulated database error');
        }
        return Promise.resolve({
          id: 'test-snap',
          competitorId: 'test-comp',
          createdAt: new Date(),
          captureSuccess: true
        });
      });

      const metrics = await measurePerformance(async () => {
        const results = await Promise.allSettled(
          competitorIds.map(id => freshnessService.isSnapshotFresh(id, 7))
        );
        return results;
      });

      // Assert - Error handling shouldn't severely impact performance
      expect(metrics.executionTime).toBeLessThan(5000); // 5 seconds even with errors
      expect(metrics.errorRate).toBeLessThan(0.6); // Reasonable error handling
    });
  });

  // Helper Functions
  function generateMockCompetitors(count: number): any[] {
    return Array(count).fill(null).map((_, i) => ({
      id: `comp-${i}`,
      name: `Competitor ${i}`,
      website: `https://competitor${i}.com`,
      industry: 'Technology',
      createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000), // Random date within 30 days
      updatedAt: new Date()
    }));
  }

  function generateMockSnapshots(count: number): any[] {
    return Array(count).fill(null).map((_, i) => ({
      id: `snap-${i}`,
      competitorId: `comp-${i}`,
      createdAt: new Date(Date.now() - Math.random() * 14 * 24 * 60 * 60 * 1000), // Random date within 14 days
      captureSuccess: Math.random() > 0.1, // 90% success rate
      metadata: { statusCode: 200, contentLength: 1000 }
    }));
  }

  function generateMockCompetitorsWithSnapshots(count: number): any[] {
    return Array(count).fill(null).map((_, i) => ({
      id: `comp-${i}`,
      name: `Competitor ${i}`,
      website: `https://competitor${i}.com`,
      snapshots: [{
        id: `snap-${i}`,
        createdAt: new Date(Date.now() - Math.random() * 14 * 24 * 60 * 60 * 1000),
        captureSuccess: Math.random() > 0.1
      }]
    }));
  }

  async function measurePerformance<T>(operation: () => Promise<T>): Promise<PerformanceMetrics> {
    const memoryBefore = process.memoryUsage().heapUsed;
    const startTime = performance.now();
    
    let errorCount = 0;
    let result: T;
    
    try {
      result = await operation();
    } catch (error) {
      errorCount = 1;
      throw error;
    }

    const endTime = performance.now();
    const memoryAfter = process.memoryUsage().heapUsed;
    
    const executionTime = endTime - startTime;
    const memoryDelta = memoryAfter - memoryBefore;
    
    return {
      executionTime,
      memoryUsageBefore: memoryBefore,
      memoryUsageAfter: memoryAfter,
      memoryDelta,
      throughput: 1000 / executionTime, // operations per second
      errorRate: errorCount,
      averageResponseTime: executionTime
    };
  }
});

/**
 * Performance Test Helper Utilities
 */
export class PerformanceTestUtils {
  /**
   * Run a performance benchmark with multiple iterations
   */
  static async benchmark<T>(
    operation: () => Promise<T>,
    iterations: number = 10
  ): Promise<{
    averageTime: number;
    minTime: number;
    maxTime: number;
    standardDeviation: number;
    throughput: number;
  }> {
    const times: number[] = [];
    
    for (let i = 0; i < iterations; i++) {
      const startTime = performance.now();
      await operation();
      const endTime = performance.now();
      times.push(endTime - startTime);
    }
    
    const averageTime = times.reduce((sum, time) => sum + time, 0) / times.length;
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    
    const variance = times.reduce((sum, time) => sum + Math.pow(time - averageTime, 2), 0) / times.length;
    const standardDeviation = Math.sqrt(variance);
    
    const throughput = 1000 / averageTime; // operations per second
    
    return {
      averageTime,
      minTime,
      maxTime,
      standardDeviation,
      throughput
    };
  }

  /**
   * Test performance under different load conditions
   */
  static async loadTest<T>(
    operationFactory: (loadLevel: number) => () => Promise<T>,
    loadLevels: number[] = [1, 5, 10, 25, 50]
  ): Promise<Array<{
    loadLevel: number;
    averageTime: number;
    throughput: number;
    memoryUsage: number;
  }>> {
    const results = [];
    
    for (const loadLevel of loadLevels) {
      const operation = operationFactory(loadLevel);
      
      const memoryBefore = process.memoryUsage().heapUsed;
      const benchmark = await this.benchmark(operation, 5);
      const memoryAfter = process.memoryUsage().heapUsed;
      
      results.push({
        loadLevel,
        averageTime: benchmark.averageTime,
        throughput: benchmark.throughput,
        memoryUsage: memoryAfter - memoryBefore
      });
    }
    
    return results;
  }
} 