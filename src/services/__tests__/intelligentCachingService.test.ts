/**
 * Phase 4.3: IntelligentCachingService Tests
 * Comprehensive test suite for intelligent caching functionality
 */

import { IntelligentCachingService } from '../intelligentCachingService';
import { logger } from '@/lib/logger';

// Mock external dependencies
jest.mock('@/lib/logger');
// Fix P0.4: Complete Mock Configurations - Add all required Prisma methods
jest.mock('@/lib/prisma', () => ({
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
      upsert: jest.fn(),
    },
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
    $transaction: jest.fn(),
  }
}));

describe('IntelligentCachingService', () => {
  let cachingService: IntelligentCachingService;

  beforeEach(() => {
    cachingService = IntelligentCachingService.getInstance();
    cachingService.clearCache();
    jest.clearAllMocks();
  });

  describe('Competitor Data Caching', () => {
    it('should cache and retrieve competitor basic data', async () => {
      const mockData = {
        id: 'comp-1',
        name: 'Test Competitor',
        website: 'https://test.com',
        industry: 'Software',
        description: 'Test description',
        lastUpdated: new Date(),
        dataFreshness: 'fresh' as const,
        priority: 'normal' as const
      };

      await cachingService.cacheCompetitorBasicData(mockData.id, mockData);
      const retrieved = await cachingService.getCompetitorBasicData(mockData.id);
      
      expect(retrieved).toEqual(mockData);
    });

    it('should return null for non-existent data', async () => {
      const retrieved = await cachingService.getCompetitorBasicData('non-existent');
      expect(retrieved).toBeNull();
    });
  });

  describe('Cache Statistics', () => {
    it('should provide cache statistics', () => {
      const stats = cachingService.getCacheStatistics();
      
      expect(stats).toHaveProperty('totalEntries');
      expect(stats).toHaveProperty('hitRate');
      expect(stats).toHaveProperty('missRate');
      expect(stats).toHaveProperty('performanceMetrics');
    });
  });

  describe('Cache Management', () => {
    it('should clear cache', async () => {
      const mockData = {
        id: 'comp-1',
        name: 'Test',
        website: 'https://test.com',
        lastUpdated: new Date(),
        dataFreshness: 'fresh' as const,
        priority: 'normal' as const
      };

      await cachingService.cacheCompetitorBasicData(mockData.id, mockData);
      await cachingService.clearCache();
      
      const retrieved = await cachingService.getCompetitorBasicData(mockData.id);
      expect(retrieved).toBeNull();
    });

    it('should invalidate by tags', async () => {
      const invalidatedCount = await cachingService.invalidateByTags(['test']);
      expect(invalidatedCount).toBeGreaterThanOrEqual(0);
    });
  });
});
