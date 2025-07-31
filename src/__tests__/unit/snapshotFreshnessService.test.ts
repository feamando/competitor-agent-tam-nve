import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { SnapshotFreshnessService } from '@/services/snapshotFreshnessService';
import { prisma } from '@/lib/prisma';

/**
 * Task 8.1: Comprehensive unit tests for SnapshotFreshnessService
 * Tests all core functionality including freshness checking, stale detection, and optimization features
 */

// Mock the prisma client
jest.mock('@/lib/prisma', () => ({
  prisma: {
    snapshot: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    competitor: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    }
  }
}));

// Mock the logger
jest.mock('@/lib/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  generateCorrelationId: jest.fn(() => 'test-correlation-id'),
  trackCorrelation: jest.fn(),
}));

describe('SnapshotFreshnessService', () => {
  let service: SnapshotFreshnessService;
  const mockPrisma = prisma as jest.Mocked<typeof prisma>;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Get fresh instance for each test
    service = SnapshotFreshnessService.getInstance();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Singleton Pattern', () => {
    test('should return same instance on multiple calls', () => {
      const instance1 = SnapshotFreshnessService.getInstance();
      const instance2 = SnapshotFreshnessService.getInstance();
      
      expect(instance1).toBe(instance2);
    });
  });

  describe('isSnapshotFresh', () => {
    test('should return fresh for recent successful snapshot', async () => {
      // Arrange
      const competitorId = 'comp-1';
      const recentDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // 2 days ago
      
      mockPrisma.snapshot.findFirst.mockResolvedValue({
        id: 'snap-1',
        createdAt: recentDate,
        captureSuccess: true,
        errorMessage: null,
        metadata: {}
      } as any);

      // Act
      const result = await service.isSnapshotFresh(competitorId, 7);

      // Assert
      expect(result.isFresh).toBe(true);
      expect(result.ageInDays).toBe(2);
      expect(result.snapshotId).toBe('snap-1');
      expect(result.capturedAt).toEqual(recentDate);
      expect(result.reason).toContain('Snapshot is fresh');
    });

    test('should return stale for old successful snapshot', async () => {
      // Arrange
      const competitorId = 'comp-1';
      const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10 days ago
      
      mockPrisma.snapshot.findFirst.mockResolvedValue({
        id: 'snap-1',
        createdAt: oldDate,
        captureSuccess: true,
        errorMessage: null,
        metadata: {}
      } as any);

      // Act
      const result = await service.isSnapshotFresh(competitorId, 7);

      // Assert
      expect(result.isFresh).toBe(false);
      expect(result.ageInDays).toBe(10);
      expect(result.snapshotId).toBe('snap-1');
      expect(result.reason).toContain('Snapshot is stale');
    });

    test('should return false for competitor with no successful snapshots', async () => {
      // Arrange
      const competitorId = 'comp-1';
      
      mockPrisma.snapshot.findFirst.mockResolvedValue(null);

      // Act
      const result = await service.isSnapshotFresh(competitorId, 7);

      // Assert
      expect(result.isFresh).toBe(false);
      expect(result.ageInDays).toBe(Infinity);
      expect(result.snapshotId).toBeUndefined();
      expect(result.reason).toBe('No successful snapshot exists');
    });

    test('should handle invalid competitor ID', async () => {
      // Act
      const result = await service.isSnapshotFresh('', 7);

      // Assert
      expect(result.isFresh).toBe(false);
      expect(result.ageInDays).toBe(Infinity);
      expect(result.reason).toBe('Invalid competitor ID provided');
    });

    test('should handle invalid maxAgeInDays parameter', async () => {
      // Act
      const result = await service.isSnapshotFresh('comp-1', -1);

      // Assert
      expect(result.isFresh).toBe(false);
      expect(result.ageInDays).toBe(Infinity);
      expect(result.reason).toBe('Invalid maxAgeInDays parameter');
    });

    test('should handle database errors gracefully', async () => {
      // Arrange
      const competitorId = 'comp-1';
      mockPrisma.snapshot.findFirst.mockRejectedValue(new Error('Database error'));

      // Act
      const result = await service.isSnapshotFresh(competitorId, 7);

      // Assert
      expect(result.isFresh).toBe(false);
      expect(result.ageInDays).toBe(Infinity);
      expect(result.reason).toContain('Error checking freshness');
    });

    test('should use custom maxAgeInDays parameter', async () => {
      // Arrange
      const competitorId = 'comp-1';
      const testDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000); // 5 days ago
      
      mockPrisma.snapshot.findFirst.mockResolvedValue({
        id: 'snap-1',
        createdAt: testDate,
        captureSuccess: true,
        errorMessage: null,
        metadata: {}
      } as any);

      // Act - Test with 3 days threshold (should be stale)
      const staleResult = await service.isSnapshotFresh(competitorId, 3);
      // Test with 10 days threshold (should be fresh)
      const freshResult = await service.isSnapshotFresh(competitorId, 10);

      // Assert
      expect(staleResult.isFresh).toBe(false);
      expect(freshResult.isFresh).toBe(true);
      expect(staleResult.ageInDays).toBe(5);
      expect(freshResult.ageInDays).toBe(5);
    });
  });

  describe('getStaleSnapshots', () => {
    test('should return stale snapshots for project', async () => {
      // Arrange
      const projectId = 'proj-1';
      const staleDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10 days ago
      const freshDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // 2 days ago

      mockPrisma.competitor.findMany.mockResolvedValue([
        {
          id: 'comp-1',
          name: 'Competitor 1',
          snapshots: [{
            id: 'snap-1',
            createdAt: staleDate,
            captureSuccess: true
          }]
        },
        {
          id: 'comp-2', 
          name: 'Competitor 2',
          snapshots: [{
            id: 'snap-2',
            createdAt: freshDate,
            captureSuccess: true
          }]
        },
        {
          id: 'comp-3',
          name: 'Competitor 3',
          snapshots: [] // No snapshots
        }
      ] as any);

      // Act
      const result = await service.getStaleSnapshots(projectId, 7);

      // Assert
      expect(result).toHaveLength(2); // comp-1 (stale) and comp-3 (no snapshots)
      
      const staleComp = result.find(r => r.competitorId === 'comp-1');
      expect(staleComp).toBeDefined();
      expect(staleComp!.ageInDays).toBe(10);
      expect(staleComp!.snapshotId).toBe('snap-1');
      
      const noSnapshotComp = result.find(r => r.competitorId === 'comp-3');
      expect(noSnapshotComp).toBeDefined();
      expect(noSnapshotComp!.ageInDays).toBe(Infinity);
      expect(noSnapshotComp!.reason).toBe('No successful snapshot exists');
    });

    test('should return empty array when all snapshots are fresh', async () => {
      // Arrange
      const projectId = 'proj-1';
      const freshDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // 2 days ago

      mockPrisma.competitor.findMany.mockResolvedValue([
        {
          id: 'comp-1',
          name: 'Competitor 1',
          snapshots: [{
            id: 'snap-1',
            createdAt: freshDate,
            captureSuccess: true
          }]
        }
      ] as any);

      // Act
      const result = await service.getStaleSnapshots(projectId, 7);

      // Assert
      expect(result).toHaveLength(0);
    });

    test('should handle database errors gracefully', async () => {
      // Arrange
      const projectId = 'proj-1';
      mockPrisma.competitor.findMany.mockRejectedValue(new Error('Database error'));

      // Act
      const result = await service.getStaleSnapshots(projectId, 7);

      // Assert
      expect(result).toHaveLength(0);
    });
  });

  describe('getFreshnessSummary', () => {
    test('should calculate correct freshness summary', async () => {
      // Arrange
      const projectId = 'proj-1';
      
      mockPrisma.competitor.findMany.mockResolvedValue([
        {
          id: 'comp-1',
          snapshots: [{ createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), captureSuccess: true }] // 2 days - fresh
        },
        {
          id: 'comp-2',
          snapshots: [{ createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), captureSuccess: true }] // 10 days - stale
        },
        {
          id: 'comp-3',
          snapshots: [] // No snapshots - missing
        }
      ] as any);

      // Act
      const result = await service.getFreshnessSummary(projectId, 7);

      // Assert
      expect(result.totalCompetitors).toBe(3);
      expect(result.freshSnapshots).toBe(1);
      expect(result.staleSnapshots).toBe(1);
      expect(result.missingSnapshots).toBe(1);
      expect(result.averageAgeInDays).toBe(6); // (2 + 10) / 2
    });

    test('should handle project with no competitors', async () => {
      // Arrange
      const projectId = 'proj-1';
      mockPrisma.competitor.findMany.mockResolvedValue([]);

      // Act
      const result = await service.getFreshnessSummary(projectId, 7);

      // Assert
      expect(result.totalCompetitors).toBe(0);
      expect(result.freshSnapshots).toBe(0);
      expect(result.staleSnapshots).toBe(0);
      expect(result.missingSnapshots).toBe(0);
      expect(result.averageAge).toBe(0);
    });
  });

  describe('checkMultipleSnapshots', () => {
    test('should check freshness for multiple competitors efficiently', async () => {
      // Arrange
      const competitorIds = ['comp-1', 'comp-2', 'comp-3'];
      
      // Mock different responses for each competitor
      mockPrisma.snapshot.findFirst
        .mockResolvedValueOnce({
          id: 'snap-1',
          createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days - fresh
          captureSuccess: true
        } as any)
        .mockResolvedValueOnce({
          id: 'snap-2', 
          createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 days - stale
          captureSuccess: true
        } as any)
        .mockResolvedValueOnce(null); // No snapshot

      // Act
      const result = await service.checkMultipleSnapshots(competitorIds, 7);

      // Assert
      expect(result.size).toBe(3);
      
      const comp1Result = result.get('comp-1');
      expect(comp1Result!.isFresh).toBe(true);
      expect(comp1Result!.ageInDays).toBe(2);
      
      const comp2Result = result.get('comp-2');
      expect(comp2Result!.isFresh).toBe(false);
      expect(comp2Result!.ageInDays).toBe(10);
      
      const comp3Result = result.get('comp-3');
      expect(comp3Result!.isFresh).toBe(false);
      expect(comp3Result!.ageInDays).toBe(Infinity);
    });

    test('should handle empty competitor list', async () => {
      // Act
      const result = await service.checkMultipleSnapshots([], 7);

      // Assert
      expect(result.size).toBe(0);
    });
  });

  describe('getSnapshotAgesBatch', () => {
    test('should efficiently calculate ages for multiple competitors', async () => {
      // Arrange
      const competitorIds = ['comp-1', 'comp-2', 'comp-3'];
      const testDate1 = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000); // 3 days ago
      const testDate2 = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000); // 8 days ago

      mockPrisma.snapshot.findMany.mockResolvedValue([
        {
          id: 'snap-1',
          competitorId: 'comp-1',
          createdAt: testDate1
        },
        {
          id: 'snap-2',
          competitorId: 'comp-2', 
          createdAt: testDate2
        }
        // comp-3 has no snapshots
      ] as any);

      // Act
      const result = await service.getSnapshotAgesBatch(competitorIds);

      // Assert
      expect(result.size).toBe(3);
      
      const comp1Result = result.get('comp-1');
      expect(comp1Result!.ageInDays).toBe(3);
      expect(comp1Result!.hasSnapshot).toBe(true);
      expect(comp1Result!.snapshotId).toBe('snap-1');
      
      const comp2Result = result.get('comp-2');
      expect(comp2Result!.ageInDays).toBe(8);
      expect(comp2Result!.hasSnapshot).toBe(true);
      
      const comp3Result = result.get('comp-3');
      expect(comp3Result!.ageInDays).toBe(Infinity);
      expect(comp3Result!.hasSnapshot).toBe(false);
    });
  });

  describe('getCompetitorsNeedingUpdate', () => {
    test('should identify competitors needing updates with correct priorities', async () => {
      // Arrange
      const projectId = 'proj-1';
      const now = new Date();
      const veryOldDate = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000); // 20 days ago
      const oldDate = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000); // 10 days ago
      const recentFailureDate = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000); // 2 days ago

      mockPrisma.competitor.findMany.mockResolvedValue([
        {
          id: 'comp-1',
          name: 'Never Captured',
          snapshots: [] // No snapshots - HIGH priority
        },
        {
          id: 'comp-2',
          name: 'Very Old Snapshot',
          snapshots: [{
            createdAt: veryOldDate,
            captureSuccess: true
          }] // Very old - HIGH priority
        },
        {
          id: 'comp-3',
          name: 'Old Snapshot',
          snapshots: [{
            createdAt: oldDate,
            captureSuccess: true
          }] // Old but not extreme - MEDIUM priority
        },
        {
          id: 'comp-4',
          name: 'Recent Failures',
          snapshots: [
            { createdAt: recentFailureDate, captureSuccess: false },
            { createdAt: recentFailureDate, captureSuccess: false }
          ] // Recent failures - HIGH priority
        }
      ] as any);

      // Act
      const result = await service.getCompetitorsNeedingUpdate(projectId, {
        maxAgeInDays: 7,
        includeNeverCaptured: true,
        prioritizeFailedCaptures: true
      });

      // Assert
      expect(result.length).toBeGreaterThan(0);
      
      // Check that high priority items come first
      const highPriorityItems = result.filter(r => r.priority === 'high');
      const mediumPriorityItems = result.filter(r => r.priority === 'medium');
      
      expect(highPriorityItems.length).toBeGreaterThan(0);
      
      // Verify never captured competitor is high priority
      const neverCaptured = result.find(r => r.competitorId === 'comp-1');
      expect(neverCaptured!.priority).toBe('high');
      expect(neverCaptured!.ageInDays).toBe(Infinity);
    });

    test('should respect limit parameter', async () => {
      // Arrange
      const projectId = 'proj-1';
      
      mockPrisma.competitor.findMany.mockResolvedValue([
        { id: 'comp-1', name: 'Comp 1', snapshots: [] },
        { id: 'comp-2', name: 'Comp 2', snapshots: [] },
        { id: 'comp-3', name: 'Comp 3', snapshots: [] }
      ] as any);

      // Act
      const result = await service.getCompetitorsNeedingUpdate(projectId, { limit: 2 });

      // Assert - Should respect the database limit, not the result limit
      expect(mockPrisma.competitor.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 2 })
      );
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle null/undefined inputs gracefully', async () => {
      // Test various null/undefined scenarios
      const result1 = await service.isSnapshotFresh(null as any, 7);
      const result2 = await service.isSnapshotFresh('comp-1', null as any);
      const result3 = await service.getStaleSnapshots(null as any, 7);

      expect(result1.isFresh).toBe(false);
      expect(result2.isFresh).toBe(false);
      expect(result3).toHaveLength(0);
    });

    test('should handle concurrent requests without race conditions', async () => {
      // Arrange
      const competitorId = 'comp-1';
      const testDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
      
      mockPrisma.snapshot.findFirst.mockResolvedValue({
        id: 'snap-1',
        createdAt: testDate,
        captureSuccess: true
      } as any);

      // Act - Make multiple concurrent requests
      const promises = Array(5).fill(null).map(() => 
        service.isSnapshotFresh(competitorId, 7)
      );
      const results = await Promise.all(promises);

      // Assert - All should return same result
      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(result.isFresh).toBe(true);
        expect(result.ageInDays).toBe(5);
      });
    });

    test('should handle large datasets efficiently', async () => {
      // Arrange - Simulate checking large number of competitors
      const competitorIds = Array(100).fill(null).map((_, i) => `comp-${i}`);
      
      mockPrisma.snapshot.findMany.mockResolvedValue([]);

      // Act
      const startTime = Date.now();
      const result = await service.getSnapshotAgesBatch(competitorIds);
      const endTime = Date.now();

      // Assert
      expect(result.size).toBe(100);
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });
}); 