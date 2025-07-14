import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';

// Mock dependencies
jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Fix P0.4: Complete Mock Configurations - Add all required Prisma methods
jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    competitor: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      upsert: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
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
    project: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
    $transaction: jest.fn(),
  },
  prisma: {
    competitor: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      upsert: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
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
    project: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
             delete: jest.fn(),
     },
     $connect: jest.fn().mockResolvedValue(undefined),
     $disconnect: jest.fn().mockResolvedValue(undefined),
    $transaction: jest.fn(),
  },
}));

// Service to test
let intelligentCachingService: any;

describe('IntelligentCachingService Error Scenarios', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.resetModules();
  });
  
  it('should handle Redis connection failures gracefully', async () => {
    // Mock Redis connection error
    jest.mock('@/lib/redis', () => ({
      redisClient: {
        set: jest.fn().mockRejectedValue(new Error('Redis connection failed')),
        get: jest.fn().mockRejectedValue(new Error('Redis connection failed')),
        del: jest.fn().mockRejectedValue(new Error('Redis connection failed')),
      },
    }));
    
    const { intelligentCachingService } = await import('@/services/intelligentCachingService');
    
    // Act - Try to cache data
    const competitorBasicData = {
      id: 'comp-1',
      name: 'Competitor 1',
      website: 'https://competitor1.com',
      industry: 'SaaS',
      lastUpdated: new Date(),
      dataFreshness: 'fresh',
      priority: 'normal'
    };
    
    await intelligentCachingService.cacheCompetitorBasicData('comp-1', competitorBasicData);
    
    // Should log warning but not crash
    expect(logger.warn).toHaveBeenCalled();
    
    // Try to retrieve data (should fallback to database)
    (prisma.competitor.findUnique as jest.Mock).mockResolvedValue({
      id: 'comp-1',
      name: 'Competitor 1',
      website: 'https://competitor1.com',
      industry: 'SaaS',
      updatedAt: new Date()
    });
    
    const result = await intelligentCachingService.getCompetitorBasicData('comp-1');
    
    // Assert - Should still work by fetching from database
    expect(result).toBeDefined();
    expect(result?.id).toBe('comp-1');
    expect(logger.error).toHaveBeenCalled();
  });
  
  it('should handle database failures with graceful degradation', async () => {
    const { intelligentCachingService } = await import('@/services/intelligentCachingService');
    
    // Simulate cache miss and database failure
    (prisma.competitor.findUnique as jest.Mock).mockRejectedValue(
      new Error('Database connection error')
    );
    
    // Try to get competitor data
    const result = await intelligentCachingService.getCompetitorBasicData('comp-1');
    
    // Should return null instead of crashing
    expect(result).toBeNull();
    expect(logger.error).toHaveBeenCalled();
  });
  
  it('should handle corrupted cache data gracefully', async () => {
    // Mock Redis with corrupted data
    jest.mock('@/lib/redis', () => ({
      redisClient: {
        get: jest.fn().mockResolvedValue('{"corrupted:json:data'),
        set: jest.fn(),
      },
    }));
    
    const { intelligentCachingService } = await import('@/services/intelligentCachingService');
    
    // Override internal getCache method to simulate corrupted JSON
    intelligentCachingService.getCache = jest.fn().mockImplementation(() => {
      throw new SyntaxError('Unexpected token : in JSON at position 12');
    });
    
    // Set up database fallback to succeed
    (prisma.competitor.findUnique as jest.Mock).mockResolvedValue({
      id: 'comp-1',
      name: 'Competitor 1',
      website: 'https://competitor1.com',
      industry: 'SaaS',
      updatedAt: new Date()
    });
    
    // Act - Try to get data
    const result = await intelligentCachingService.getCompetitorBasicData('comp-1');
    
    // Assert - Should get data from database fallback
    expect(result).toBeDefined();
    expect(result?.id).toBe('comp-1');
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('corrupted'),
      expect.any(Error),
      expect.any(Object)
    );
  });
  
  it('should handle consecutive cache failures with circuit breaker', async () => {
    const { intelligentCachingService } = await import('@/services/intelligentCachingService');
    
    // Simulate internal circuit breaker logic
    intelligentCachingService.isCircuitBroken = jest.fn().mockReturnValue(true);
    intelligentCachingService.recordCacheFailure = jest.fn();
    
    // Set up database fallback
    (prisma.competitor.findUnique as jest.Mock).mockResolvedValue({
      id: 'comp-1',
      name: 'Competitor 1',
      website: 'https://competitor1.com',
      updatedAt: new Date()
    });
    
    // Act - Try to cache data
    const snapshotMetadata = {
      competitorId: 'comp-1',
      snapshotId: 'snap-1',
      capturedAt: new Date(),
      isSuccessful: true,
      dataSize: 1000,
      contentHash: 'hash123',
      captureMethod: 'full',
      websiteComplexity: 'medium',
      captureTime: 1500
    };
    
    await intelligentCachingService.cacheSnapshotMetadata('comp-1', snapshotMetadata);
    
    // Assert - Should skip caching due to circuit breaker
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('circuit breaker'),
      expect.any(Object)
    );
    
    // When getting data should bypass cache
    const result = await intelligentCachingService.getCompetitorBasicData('comp-1');
    expect(result).toBeDefined();
    expect(result?.id).toBe('comp-1');
  });
  
  it('should handle cache eviction errors gracefully', async () => {
    const { intelligentCachingService } = await import('@/services/intelligentCachingService');
    
    // Mock internal clearCache to simulate eviction errors
    intelligentCachingService.clearCache = jest.fn().mockRejectedValue(
      new Error('Failed to evict cache')
    );
    
    // Act - Try to clear cache for specific competitor
    await intelligentCachingService.invalidateCompetitorCache('comp-1');
    
    // Assert - Should log error but not crash
    expect(logger.error).toHaveBeenCalled();
  });
}); 