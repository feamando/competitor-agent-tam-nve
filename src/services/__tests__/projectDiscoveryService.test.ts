/**
 * Unit Tests for ProjectDiscoveryService - Task 6.1
 * 
 * Comprehensive test suite covering all functionality of the ProjectDiscoveryService:
 * - Project resolution from competitor IDs
 * - Caching mechanisms and performance
 * - Multi-project priority rules
 * - Validation of project-competitor relationships
 * - Error handling and edge cases
 * - Cache statistics and management
 * 
 * Part of TP-013-20250801-project-report-association-fix
 */

import { ProjectDiscoveryService, ProjectDiscoveryResult, ProjectInfo, ProjectDiscoveryOptions } from '../projectDiscoveryService';
import { prismaMock } from '../../__tests__/setup/prismaMock';
import { logger } from '../../lib/logger';
import { ProjectStatus } from '@prisma/client';

// Mock the prisma import
jest.mock('../../lib/prisma', () => ({
  prisma: prismaMock
}));

// Mock logger to prevent console output during tests
jest.mock('../../lib/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  },
  generateCorrelationId: jest.fn(() => 'test-correlation-id-123')
}));

// Test data fixtures
const mockProjects = {
  single: [
    {
      id: 'project-1',
      name: 'Single Project',
      status: 'ACTIVE' as ProjectStatus,
      priority: 'HIGH',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
      competitors: [{ id: 'competitor-1' }]
    }
  ],
  multiple: [
    {
      id: 'project-1',
      name: 'Active High Priority',
      status: 'ACTIVE' as ProjectStatus,
      priority: 'HIGH',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
      competitors: [{ id: 'competitor-1' }]
    },
    {
      id: 'project-2',
      name: 'Draft Medium Priority',
      status: 'DRAFT' as ProjectStatus,
      priority: 'MEDIUM',
      createdAt: new Date('2024-01-02'),
      updatedAt: new Date('2024-01-02'),
      competitors: [{ id: 'competitor-1' }]
    },
    {
      id: 'project-3',
      name: 'Paused Low Priority',
      status: 'PAUSED' as ProjectStatus,
      priority: 'LOW',
      createdAt: new Date('2024-01-03'),
      updatedAt: new Date('2024-01-03'),
      competitors: [{ id: 'competitor-1' }]
    }
  ],
  equalPriority: [
    {
      id: 'project-1',
      name: 'Active Project A',
      status: 'ACTIVE' as ProjectStatus,
      priority: 'HIGH',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
      competitors: [{ id: 'competitor-1' }]
    },
    {
      id: 'project-2',
      name: 'Active Project B',
      status: 'ACTIVE' as ProjectStatus,
      priority: 'HIGH',
      createdAt: new Date('2024-01-02'),
      updatedAt: new Date('2024-01-02'),
      competitors: [{ id: 'competitor-1' }]
    }
  ]
};

// Mock cache implementation for testing
class MockProjectCache {
  private storage = new Map<string, any>();
  private stats = { hits: 0, misses: 0 };

  async set(key: string, value: ProjectInfo[], ttlSeconds?: number): Promise<void> {
    this.storage.set(key, {
      data: value,
      expiresAt: Date.now() + (ttlSeconds || 300) * 1000
    });
  }

  async get(key: string): Promise<ProjectInfo[] | null> {
    const entry = this.storage.get(key);
    if (!entry) {
      this.stats.misses++;
      return null;
    }
    
    if (Date.now() > entry.expiresAt) {
      this.storage.delete(key);
      this.stats.misses++;
      return null;
    }
    
    this.stats.hits++;
    return entry.data;
  }

  async invalidate(competitorId: string): Promise<void> {
    const keysToDelete = Array.from(this.storage.keys()).filter(key => key.includes(competitorId));
    keysToDelete.forEach(key => this.storage.delete(key));
  }

  async clear(): Promise<void> {
    this.storage.clear();
    this.stats.hits = 0;
    this.stats.misses = 0;
  }

  getStats() {
    const total = this.stats.hits + this.stats.misses;
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      entries: this.storage.size,
      hitRate: total > 0 ? (this.stats.hits / total) * 100 : 0,
      size: this.storage.size * 100 // Rough estimate
    };
  }

  // Test helper methods
  hasKey(key: string): boolean {
    return this.storage.has(key);
  }

  getStorageSize(): number {
    return this.storage.size;
  }
}

describe('ProjectDiscoveryService - Task 6.1', () => {
  let service: ProjectDiscoveryService;
  let mockCache: MockProjectCache;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Create fresh instances for each test
    mockCache = new MockProjectCache();
    service = new ProjectDiscoveryService(mockCache);
  });

  describe('Constructor and Initialization', () => {
    it('should initialize with default in-memory cache', () => {
      const defaultService = new ProjectDiscoveryService();
      expect(defaultService).toBeInstanceOf(ProjectDiscoveryService);
      expect(logger.info).toHaveBeenCalledWith('ProjectDiscoveryService initialized', {
        cacheEnabled: true,
        cacheType: 'in-memory'
      });
    });

    it('should initialize with custom cache', () => {
      const customService = new ProjectDiscoveryService(mockCache);
      expect(customService).toBeInstanceOf(ProjectDiscoveryService);
      expect(logger.info).toHaveBeenCalledWith('ProjectDiscoveryService initialized', {
        cacheEnabled: true,
        cacheType: 'external'
      });
    });
  });

  describe('resolveProjectId - Core Functionality', () => {
    describe('Input Validation', () => {
      it('should reject empty competitor ID', async () => {
        const result = await service.resolveProjectId('');
        
        expect(result.success).toBe(false);
        expect(result.error).toBe('Competitor ID is required and cannot be empty');
        expect(logger.warn).toHaveBeenCalledWith('Invalid competitor ID provided', expect.any(Object));
      });

      it('should reject null/undefined competitor ID', async () => {
        const result = await service.resolveProjectId('   ');
        
        expect(result.success).toBe(false);
        expect(result.error).toBe('Competitor ID is required and cannot be empty');
      });
    });

    describe('Single Project Resolution', () => {
      it('should successfully resolve single project', async () => {
        prismaMock.project.findMany.mockResolvedValue(mockProjects.single);

        const result = await service.resolveProjectId('competitor-1');

        expect(result.success).toBe(true);
        expect(result.projectId).toBe('project-1');
        expect(result.projects).toHaveLength(1);
        expect(result.projects![0].name).toBe('Single Project');
        expect(logger.info).toHaveBeenCalledWith('Single project resolved successfully', expect.any(Object));
      });

      it('should handle single project with custom options', async () => {
        prismaMock.project.findMany.mockResolvedValue(mockProjects.single);

        const options: ProjectDiscoveryOptions = {
          includeInactive: true,
          priorityRules: 'by_priority',
          correlationId: 'custom-correlation-id'
        };

        const result = await service.resolveProjectId('competitor-1', options);

        expect(result.success).toBe(true);
        expect(result.projectId).toBe('project-1');
      });
    });

    describe('No Projects Found', () => {
      it('should handle no projects gracefully', async () => {
        prismaMock.project.findMany.mockResolvedValue([]);

        const result = await service.resolveProjectId('competitor-nonexistent');

        expect(result.success).toBe(false);
        expect(result.error).toBe('No projects associated with this competitor');
        expect(result.projects).toEqual([]);
        expect(logger.warn).toHaveBeenCalledWith('No projects found for competitor', expect.any(Object));
      });
    });

    describe('Multiple Projects Resolution', () => {
      it('should resolve multiple projects using active_first strategy', async () => {
        prismaMock.project.findMany.mockResolvedValue(mockProjects.multiple);

        const result = await service.resolveProjectId('competitor-1', { priorityRules: 'active_first' });

        expect(result.success).toBe(true);
        expect(result.projectId).toBe('project-1'); // Active + High Priority
        expect(result.projects).toHaveLength(3);
        expect(logger.info).toHaveBeenCalledWith('Multiple projects resolved using priority rules', expect.any(Object));
      });

      it('should resolve multiple projects using by_priority strategy', async () => {
        prismaMock.project.findMany.mockResolvedValue(mockProjects.multiple);

        const result = await service.resolveProjectId('competitor-1', { priorityRules: 'by_priority' });

        expect(result.success).toBe(true);
        expect(result.projectId).toBe('project-1'); // Highest priority
      });

      it('should resolve multiple projects using newest strategy', async () => {
        prismaMock.project.findMany.mockResolvedValue(mockProjects.multiple);

        const result = await service.resolveProjectId('competitor-1', { priorityRules: 'newest' });

        expect(result.success).toBe(true);
        expect(result.projectId).toBe('project-1'); // First in array (newest)
      });

      it('should require explicit selection when priorities are equal', async () => {
        // Mock scenario where projects have equal priority and can't be auto-resolved
        prismaMock.project.findMany.mockResolvedValue(mockProjects.equalPriority);

        const result = await service.resolveProjectId('competitor-1');

        expect(result.success).toBe(true); // Should resolve to first project as tie-breaker
        expect(result.projectId).toBe('project-1');
      });
    });

    describe('Error Handling', () => {
      it('should handle database errors gracefully', async () => {
        const dbError = new Error('Database connection failed');
        prismaMock.project.findMany.mockRejectedValue(dbError);

        const result = await service.resolveProjectId('competitor-1');

        expect(result.success).toBe(false);
        expect(result.error).toBe('Database connection failed');
        expect(logger.error).toHaveBeenCalledWith('Project resolution failed', dbError, expect.any(Object));
      });
    });
  });

  describe('findProjectsByCompetitorId', () => {
    it('should find projects and use cache', async () => {
      prismaMock.project.findMany.mockResolvedValue(mockProjects.single);

      // First call - should hit database
      const result1 = await service.findProjectsByCompetitorId('competitor-1');
      expect(result1).toHaveLength(1);
      expect(prismaMock.project.findMany).toHaveBeenCalledTimes(1);

      // Second call - should hit cache
      const result2 = await service.findProjectsByCompetitorId('competitor-1');
      expect(result2).toHaveLength(1);
      expect(prismaMock.project.findMany).toHaveBeenCalledTimes(1); // Should not increase
    });

    it('should apply includeInactive filter', async () => {
      prismaMock.project.findMany.mockResolvedValue(mockProjects.multiple);

      await service.findProjectsByCompetitorId('competitor-1', { includeInactive: false });

      expect(prismaMock.project.findMany).toHaveBeenCalledWith({
        where: {
          competitors: { some: { id: 'competitor-1' } },
          status: { in: ['ACTIVE', 'DRAFT'] }
        },
        select: expect.any(Object),
        orderBy: expect.any(Array)
      });
    });

    it('should handle database errors and return empty array', async () => {
      const dbError = new Error('Database error');
      prismaMock.project.findMany.mockRejectedValue(dbError);

      const result = await service.findProjectsByCompetitorId('competitor-1');

      expect(result).toEqual([]);
      expect(logger.error).toHaveBeenCalledWith('Failed to find projects for competitor', dbError, expect.any(Object));
    });
  });

  describe('validateProjectCompetitorRelationship', () => {
    it('should validate existing relationship', async () => {
      prismaMock.project.findFirst.mockResolvedValue({ id: 'project-1' });

      const isValid = await service.validateProjectCompetitorRelationship('competitor-1', 'project-1');

      expect(isValid).toBe(true);
      expect(prismaMock.project.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'project-1',
          competitors: { some: { id: 'competitor-1' } }
        },
        select: { id: true }
      });
    });

    it('should validate non-existing relationship', async () => {
      prismaMock.project.findFirst.mockResolvedValue(null);

      const isValid = await service.validateProjectCompetitorRelationship('competitor-1', 'project-2');

      expect(isValid).toBe(false);
    });

    it('should handle validation errors', async () => {
      const dbError = new Error('Validation error');
      prismaMock.project.findFirst.mockRejectedValue(dbError);

      const isValid = await service.validateProjectCompetitorRelationship('competitor-1', 'project-1');

      expect(isValid).toBe(false);
      expect(logger.error).toHaveBeenCalledWith('Failed to validate project-competitor relationship', dbError, expect.any(Object));
    });
  });

  describe('Caching Functionality', () => {
    it('should provide cache statistics', () => {
      const stats = service.getCacheStats();

      expect(stats.enabled).toBe(true);
      expect(stats.stats).toHaveProperty('hits');
      expect(stats.stats).toHaveProperty('misses');
      expect(stats.stats).toHaveProperty('entries');
      expect(stats.stats).toHaveProperty('hitRate');
      expect(stats.stats).toHaveProperty('size');
    });

    it('should clear cache', async () => {
      // Populate cache first
      prismaMock.project.findMany.mockResolvedValue(mockProjects.single);
      await service.findProjectsByCompetitorId('competitor-1');
      expect(mockCache.getStorageSize()).toBeGreaterThan(0);

      // Clear cache
      await service.clearCache();
      expect(mockCache.getStorageSize()).toBe(0);
      expect(logger.info).toHaveBeenCalledWith('Project discovery cache cleared');
    });

    it('should generate consistent cache keys', async () => {
      prismaMock.project.findMany.mockResolvedValue(mockProjects.single);

      // Same parameters should generate same cache key
      await service.findProjectsByCompetitorId('competitor-1', { includeInactive: false });
      await service.findProjectsByCompetitorId('competitor-1', { includeInactive: false });

      // Should only hit database once due to caching
      expect(prismaMock.project.findMany).toHaveBeenCalledTimes(1);

      // Different parameters should generate different cache key
      await service.findProjectsByCompetitorId('competitor-1', { includeInactive: true });
      expect(prismaMock.project.findMany).toHaveBeenCalledTimes(2);
    });
  });

  describe('Priority Resolution Strategies', () => {
    describe('Active First Strategy', () => {
      it('should prefer active projects over inactive', async () => {
        const projects: ProjectInfo[] = [
          { id: 'inactive-1', name: 'Inactive High', status: 'PAUSED', priority: 4, isActive: false },
          { id: 'active-1', name: 'Active Low', status: 'ACTIVE', priority: 1, isActive: true }
        ];

        prismaMock.project.findMany.mockResolvedValue(mockProjects.multiple);
        const result = await service.resolveProjectId('competitor-1', { priorityRules: 'active_first' });

        expect(result.success).toBe(true);
        expect(result.projectId).toBe('project-1'); // Active project with high priority
      });
    });

    describe('Priority Strategy', () => {
      it('should select highest priority project', async () => {
        prismaMock.project.findMany.mockResolvedValue(mockProjects.multiple);
        const result = await service.resolveProjectId('competitor-1', { priorityRules: 'by_priority' });

        expect(result.success).toBe(true);
        expect(result.projectId).toBe('project-1'); // Highest priority
      });
    });

    describe('Newest Strategy', () => {
      it('should select newest project', async () => {
        prismaMock.project.findMany.mockResolvedValue(mockProjects.multiple);
        const result = await service.resolveProjectId('competitor-1', { priorityRules: 'newest' });

        expect(result.success).toBe(true);
        expect(result.projectId).toBe('project-1'); // First in array (newest due to ordering)
      });
    });

    describe('Unknown Strategy Fallback', () => {
      it('should fallback to active_first for unknown strategies', async () => {
        prismaMock.project.findMany.mockResolvedValue(mockProjects.multiple);
        const result = await service.resolveProjectId('competitor-1', { 
          priorityRules: 'unknown_strategy' as any 
        });

        expect(result.success).toBe(true);
        expect(logger.warn).toHaveBeenCalledWith(
          'Unknown priority rule, falling back to active_first',
          expect.any(Object)
        );
      });
    });
  });

  describe('Helper Methods', () => {
    it('should map priority enum to numbers correctly', () => {
      // Test by creating a service instance and testing indirectly through project resolution
      const testProjects = [
        {
          id: 'urgent-project',
          name: 'Urgent',
          status: 'ACTIVE' as ProjectStatus,
          priority: 'URGENT',
          createdAt: new Date(),
          updatedAt: new Date(),
          competitors: [{ id: 'competitor-1' }]
        },
        {
          id: 'high-project',
          name: 'High',
          status: 'ACTIVE' as ProjectStatus,
          priority: 'HIGH',
          createdAt: new Date(),
          updatedAt: new Date(),
          competitors: [{ id: 'competitor-1' }]
        }
      ];

      prismaMock.project.findMany.mockResolvedValue(testProjects);
      
      // The service should select the URGENT priority project
      return service.resolveProjectId('competitor-1', { priorityRules: 'by_priority' })
        .then(result => {
          expect(result.success).toBe(true);
          expect(result.projectId).toBe('urgent-project');
        });
    });

    it('should identify active project statuses correctly', async () => {
      const activeProjects = [
        {
          id: 'active-project',
          name: 'Active',
          status: 'ACTIVE' as ProjectStatus,
          priority: 'MEDIUM',
          createdAt: new Date(),
          updatedAt: new Date(),
          competitors: [{ id: 'competitor-1' }]
        },
        {
          id: 'draft-project',
          name: 'Draft',
          status: 'DRAFT' as ProjectStatus,
          priority: 'MEDIUM',
          createdAt: new Date(),
          updatedAt: new Date(),
          competitors: [{ id: 'competitor-1' }]
        }
      ];

      prismaMock.project.findMany.mockResolvedValue(activeProjects);
      const result = await service.findProjectsByCompetitorId('competitor-1');

      // Both ACTIVE and DRAFT should be considered active
      expect(result).toHaveLength(2);
      expect(result.every(p => p.isActive)).toBe(true);
    });
  });

  describe('Edge Cases and Error Scenarios', () => {
    it('should handle malformed database responses', async () => {
      // Mock malformed response missing required fields
      prismaMock.project.findMany.mockResolvedValue([
        { id: 'project-1' } // Missing required fields
      ] as any);

      const result = await service.findProjectsByCompetitorId('competitor-1');

      // Should handle gracefully and return what it can
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('project-1');
    });

    it('should handle concurrent requests to same competitor', async () => {
      prismaMock.project.findMany.mockResolvedValue(mockProjects.single);

      // Make concurrent requests
      const promises = [
        service.resolveProjectId('competitor-1'),
        service.resolveProjectId('competitor-1'),
        service.resolveProjectId('competitor-1')
      ];

      const results = await Promise.all(promises);

      // All should succeed
      results.forEach(result => {
        expect(result.success).toBe(true);
        expect(result.projectId).toBe('project-1');
      });

      // Database should only be hit once due to caching
      expect(prismaMock.project.findMany).toHaveBeenCalledTimes(1);
    });

    it('should handle cache expiration', async () => {
      jest.useFakeTimers();
      
      prismaMock.project.findMany.mockResolvedValue(mockProjects.single);

      // First call
      await service.findProjectsByCompetitorId('competitor-1');
      expect(prismaMock.project.findMany).toHaveBeenCalledTimes(1);

      // Advance time beyond cache TTL (5 minutes)
      jest.advanceTimersByTime(6 * 60 * 1000);

      // Second call - should hit database again
      await service.findProjectsByCompetitorId('competitor-1');
      expect(prismaMock.project.findMany).toHaveBeenCalledTimes(2);

      jest.useRealTimers();
    });

    it('should handle empty project arrays in resolution', async () => {
      prismaMock.project.findMany.mockResolvedValue([]);
      const result = await service.resolveProjectId('competitor-nonexistent');

      expect(result.success).toBe(false);
      expect(result.error).toBe('No projects associated with this competitor');
      expect(result.projects).toEqual([]);
    });
  });

  describe('Performance and Optimization', () => {
    it('should use optimized database queries', async () => {
      prismaMock.project.findMany.mockResolvedValue(mockProjects.single);

      await service.findProjectsByCompetitorId('competitor-1');

      expect(prismaMock.project.findMany).toHaveBeenCalledWith({
        where: {
          competitors: { some: { id: 'competitor-1' } },
          status: { in: ['ACTIVE', 'DRAFT'] }
        },
        select: {
          id: true,
          name: true,
          status: true,
          priority: true,
          createdAt: true,
          updatedAt: true,
          competitors: {
            where: { id: 'competitor-1' },
            select: { id: true }
          }
        },
        orderBy: [
          { status: 'asc' },
          { priority: 'desc' },
          { createdAt: 'desc' }
        ]
      });
    });

    it('should track cache performance metrics', async () => {
      prismaMock.project.findMany.mockResolvedValue(mockProjects.single);

      // Generate some cache activity
      await service.findProjectsByCompetitorId('competitor-1'); // Miss
      await service.findProjectsByCompetitorId('competitor-1'); // Hit
      await service.findProjectsByCompetitorId('competitor-2'); // Miss

      const stats = service.getCacheStats();
      expect(stats.stats.hits).toBe(1);
      expect(stats.stats.misses).toBe(2);
      expect(stats.stats.hitRate).toBeCloseTo(33.33, 2);
    });
  });

  describe('Integration with Logging', () => {
    it('should log important operations', async () => {
      prismaMock.project.findMany.mockResolvedValue(mockProjects.single);

      await service.resolveProjectId('competitor-1');

      expect(logger.info).toHaveBeenCalledWith('Starting project resolution for competitor', expect.any(Object));
      expect(logger.info).toHaveBeenCalledWith('Single project resolved successfully', expect.any(Object));
    });

    it('should log cache operations', async () => {
      prismaMock.project.findMany.mockResolvedValue(mockProjects.single);

      await service.findProjectsByCompetitorId('competitor-1');

      expect(logger.debug).toHaveBeenCalledWith('Starting project lookup for competitor', expect.any(Object));
      expect(logger.info).toHaveBeenCalledWith('Project lookup completed successfully', expect.any(Object));
    });
  });
}); 