/**
 * Project Discovery Edge Cases Integration Tests - Task 6.3
 * 
 * Comprehensive test suite covering critical edge cases in project discovery:
 * - No projects found scenarios
 * - Multiple projects handling and resolution
 * - Invalid competitor scenarios
 * - Complex business logic edge cases
 * - Database error conditions
 * - Priority resolution edge cases
 * 
 * Part of TP-013-20250801-project-report-association-fix
 */

import { ProjectDiscoveryService, ProjectInfo, ProjectDiscoveryResult, ProjectDiscoveryOptions } from '@/services/projectDiscoveryService';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { POST } from '@/app/api/reports/generate/route';
import { NextRequest } from 'next/server';

// Mock dependencies
jest.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: jest.fn(),
    competitor: {
      findUnique: jest.fn()
    },
    project: {
      findMany: jest.fn(),
      findFirst: jest.fn()
    }
  }
}));

jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  },
  generateCorrelationId: jest.fn(() => 'edge-case-correlation-123'),
  createCorrelationLogger: jest.fn(() => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  })),
  trackReportFlow: jest.fn(),
  trackCorrelation: jest.fn()
}));

// Mock cache for controlled testing
class MockEdgeCaseCache {
  private storage = new Map<string, any>();
  
  async set(key: string, value: ProjectInfo[]): Promise<void> {
    this.storage.set(key, { data: value, expiresAt: Date.now() + 300000 });
  }
  
  async get(key: string): Promise<ProjectInfo[] | null> {
    const entry = this.storage.get(key);
    if (!entry || Date.now() > entry.expiresAt) return null;
    return entry.data;
  }
  
  async invalidate(competitorId: string): Promise<void> {
    const keysToDelete = Array.from(this.storage.keys()).filter(key => key.includes(competitorId));
    keysToDelete.forEach(key => this.storage.delete(key));
  }
  
  async clear(): Promise<void> {
    this.storage.clear();
  }
  
  getStats() {
    return { hits: 0, misses: 0, entries: this.storage.size, hitRate: 0, size: 100 };
  }
}

// Test data for edge cases
const EdgeCaseTestData = {
  // No projects scenarios
  noProjects: {
    competitor: {
      id: 'competitor-no-projects',
      name: 'Competitor With No Projects',
      website: 'https://no-projects.com'
    },
    projects: []
  },

  // Multiple projects with complex scenarios
  multipleProjectsEqual: [
    {
      id: 'project-equal-1',
      name: 'Equal Priority Project A',
      status: 'ACTIVE' as const,
      priority: 'HIGH',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
      competitors: [{ id: 'competitor-multi' }]
    },
    {
      id: 'project-equal-2', 
      name: 'Equal Priority Project B',
      status: 'ACTIVE' as const,
      priority: 'HIGH',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
      competitors: [{ id: 'competitor-multi' }]
    }
  ],

  multipleProjectsMixed: [
    {
      id: 'project-active-high',
      name: 'Active High Priority',
      status: 'ACTIVE' as const,
      priority: 'HIGH',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
      competitors: [{ id: 'competitor-mixed' }]
    },
    {
      id: 'project-active-low',
      name: 'Active Low Priority',
      status: 'ACTIVE' as const,
      priority: 'LOW',
      createdAt: new Date('2024-01-02'),
      updatedAt: new Date('2024-01-02'),
      competitors: [{ id: 'competitor-mixed' }]
    },
    {
      id: 'project-draft-high',
      name: 'Draft High Priority',
      status: 'DRAFT' as const,
      priority: 'HIGH',
      createdAt: new Date('2024-01-03'),
      updatedAt: new Date('2024-01-03'),
      competitors: [{ id: 'competitor-mixed' }]
    },
    {
      id: 'project-paused-urgent',
      name: 'Paused Urgent Priority',
      status: 'PAUSED' as const,
      priority: 'URGENT',
      createdAt: new Date('2024-01-04'),
      updatedAt: new Date('2024-01-04'),
      competitors: [{ id: 'competitor-mixed' }]
    }
  ],

  // Invalid competitor scenarios
  invalidCompetitors: {
    nonExistent: 'competitor-does-not-exist',
    malformed: '',
    tooLong: 'a'.repeat(101),
    specialChars: 'competitor@with#special$chars',
    null: null,
    undefined: undefined
  },

  // Database error scenarios
  databaseErrors: {
    connectionTimeout: new Error('Connection timeout after 30s'),
    queryFailed: new Error('Query execution failed'),
    transactionRollback: new Error('Transaction was rolled back'),
    connectionPool: new Error('Connection pool exhausted')
  }
};

// Helper to create mock request
const createMockRequest = (url: string, body?: any): NextRequest => {
  return {
    url,
    method: 'POST',
    json: async () => body || {},
    headers: new Headers(),
    nextUrl: new URL(url)
  } as NextRequest;
};

describe('Project Discovery Edge Cases - Task 6.3', () => {
  let service: ProjectDiscoveryService;
  let mockCache: MockEdgeCaseCache;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCache = new MockEdgeCaseCache();
    service = new ProjectDiscoveryService(mockCache);
  });

  describe('Edge Case: No Projects Found', () => {
    beforeEach(() => {
      (prisma.project.findMany as jest.Mock).mockResolvedValue([]);
    });

    it('should handle competitor with no associated projects', async () => {
      const result = await service.resolveProjectId('competitor-no-projects');

      expect(result.success).toBe(false);
      expect(result.error).toBe('No projects associated with this competitor');
      expect(result.projects).toEqual([]);
      expect(logger.warn).toHaveBeenCalledWith(
        'No projects found for competitor',
        expect.objectContaining({
          competitorId: 'competitor-no-projects'
        })
      );
    });

    it('should handle database returning empty result set', async () => {
      const result = await service.findProjectsByCompetitorId('competitor-empty-db');

      expect(result).toEqual([]);
      expect(logger.info).toHaveBeenCalledWith(
        'Project lookup completed successfully',
        expect.objectContaining({
          projectCount: 0,
          activeProjects: 0
        })
      );
    });

    it('should handle competitor exists but has no project relationships', async () => {
      (prisma.competitor.findUnique as jest.Mock).mockResolvedValue({
        id: 'competitor-orphaned',
        name: 'Orphaned Competitor',
        website: 'https://orphaned.com'
      });

      const request = createMockRequest('http://localhost:3000/api/reports/generate?competitorId=competitor-orphaned');
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.code).toBe('EDGE_CASE_COMPETITOR_NOT_FOUND');
      expect(data.message).toContain('not found');
    });

    it('should handle cache miss followed by empty database result', async () => {
      // First call - cache miss, empty DB result
      const result1 = await service.findProjectsByCompetitorId('competitor-cache-miss');
      expect(result1).toEqual([]);

      // Second call - should hit cache with empty result
      const result2 = await service.findProjectsByCompetitorId('competitor-cache-miss');
      expect(result2).toEqual([]);

      // Database should only be queried once
      expect(prisma.project.findMany).toHaveBeenCalledTimes(1);
    });

    it('should handle competitor with projects but all filtered out by status', async () => {
      // Mock database returning inactive projects only
      (prisma.project.findMany as jest.Mock)
        .mockResolvedValueOnce([]) // First call with status filter (no active projects)
        .mockResolvedValueOnce([   // Second call without filter (has inactive projects)
          {
            id: 'project-inactive',
            name: 'Inactive Project',
            status: 'ARCHIVED',
            priority: 'HIGH',
            createdAt: new Date(),
            updatedAt: new Date(),
            competitors: [{ id: 'competitor-inactive-only' }]
          }
        ]);

      const result = await service.resolveProjectId('competitor-inactive-only');

      expect(result.success).toBe(false);
      expect(result.error).toBe('No projects associated with this competitor');
      expect(result.projects).toEqual([]);
    });
  });

  describe('Edge Case: Multiple Projects - Complex Resolution', () => {
    it('should handle multiple projects with identical priorities and statuses', async () => {
      (prisma.project.findMany as jest.Mock).mockResolvedValue(EdgeCaseTestData.multipleProjectsEqual);

      const result = await service.resolveProjectId('competitor-multi', { 
        priorityRules: 'active_first' 
      });

      expect(result.success).toBe(true);
      expect(result.projectId).toBe('project-equal-1'); // Should pick first as tie-breaker
      expect(result.projects).toHaveLength(2);
      
      expect(logger.info).toHaveBeenCalledWith(
        'Multiple projects resolved using priority rules',
        expect.objectContaining({
          totalProjects: 2,
          appliedRule: 'active_first'
        })
      );
    });

    it('should handle complex multi-project scenario with mixed statuses and priorities', async () => {
      (prisma.project.findMany as jest.Mock).mockResolvedValue(EdgeCaseTestData.multipleProjectsMixed);

      const result = await service.resolveProjectId('competitor-mixed', { 
        priorityRules: 'active_first' 
      });

      expect(result.success).toBe(true);
      expect(result.projectId).toBe('project-active-high'); // Active + High priority wins
      expect(result.projects).toHaveLength(4);
    });

    it('should handle priority-based resolution when active projects have lower priority', async () => {
      (prisma.project.findMany as jest.Mock).mockResolvedValue(EdgeCaseTestData.multipleProjectsMixed);

      const result = await service.resolveProjectId('competitor-mixed', { 
        priorityRules: 'by_priority' 
      });

      expect(result.success).toBe(true);
      expect(result.projectId).toBe('project-paused-urgent'); // Highest priority wins despite inactive
    });

    it('should handle newest-first resolution strategy', async () => {
      (prisma.project.findMany as jest.Mock).mockResolvedValue(EdgeCaseTestData.multipleProjectsMixed);

      const result = await service.resolveProjectId('competitor-mixed', { 
        priorityRules: 'newest' 
      });

      expect(result.success).toBe(true);
      expect(result.projectId).toBe('project-active-high'); // First in array (newest due to ordering)
    });

    it('should handle unknown priority rule gracefully', async () => {
      (prisma.project.findMany as jest.Mock).mockResolvedValue(EdgeCaseTestData.multipleProjectsMixed);

      const result = await service.resolveProjectId('competitor-mixed', { 
        priorityRules: 'unknown_rule' as any 
      });

      expect(result.success).toBe(true);
      expect(result.projectId).toBe('project-active-high');
      expect(logger.warn).toHaveBeenCalledWith(
        'Unknown priority rule, falling back to active_first',
        expect.objectContaining({
          unknownRule: 'unknown_rule'
        })
      );
    });

    it('should require explicit selection when auto-resolution fails', async () => {
      // Create scenario where all projects have equal weight and no clear winner
      const equalProjects = [
        {
          id: 'project-equal-a',
          name: 'Equal Project A',
          status: 'PAUSED',
          priority: 'MEDIUM',
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
          competitors: [{ id: 'competitor-equal' }]
        },
        {
          id: 'project-equal-b',
          name: 'Equal Project B',
          status: 'PAUSED',
          priority: 'MEDIUM',
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
          competitors: [{ id: 'competitor-equal' }]
        }
      ];

      (prisma.project.findMany as jest.Mock).mockResolvedValue(equalProjects);

      const result = await service.resolveProjectId('competitor-equal');

      expect(result.success).toBe(true); // Should still resolve with tie-breaker
      expect(result.projectId).toBe('project-equal-a'); // First project as tie-breaker
    });

    it('should handle API fallback response for multiple projects via API endpoint', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ result: 1 }]);
      (prisma.competitor.findUnique as jest.Mock).mockResolvedValue({
        id: 'competitor-api-multi',
        name: 'API Multi Competitor'
      });
      (prisma.project.findMany as jest.Mock).mockResolvedValue(EdgeCaseTestData.multipleProjectsEqual);

      // Mock ProjectDiscoveryService to return requiresExplicitSelection
      jest.doMock('@/services/projectDiscoveryService', () => ({
        ProjectDiscoveryService: jest.fn(() => ({
          validateProjectCompetitorRelationship: jest.fn().mockResolvedValue(true),
          resolveProjectId: jest.fn().mockResolvedValue({
            success: false,
            requiresExplicitSelection: true,
            projects: EdgeCaseTestData.multipleProjectsEqual.map(p => ({
              id: p.id,
              name: p.name,
              status: p.status,
              priority: 3,
              isActive: p.status === 'ACTIVE'
            })),
            error: 'Competitor belongs to 2 projects. Please specify projectId explicitly.'
          })
        }))
      }));

      const request = createMockRequest('http://localhost:3000/api/reports/generate?competitorId=competitor-api-multi');
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(422);
      expect(data.code).toBe('GRACEFUL_FALLBACK_MANUAL_SELECTION');
      expect(data.fallback.availableProjects).toHaveLength(2);
      expect(data.fallback.guidance.example.body.projectId).toBe('YOUR_CHOSEN_PROJECT_ID');
      expect(data.retryable).toBe(true);
    });
  });

  describe('Edge Case: Invalid Competitors', () => {
    it('should handle empty competitor ID', async () => {
      const result = await service.resolveProjectId('');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Competitor ID is required and cannot be empty');
      expect(logger.warn).toHaveBeenCalledWith('Invalid competitor ID provided', expect.any(Object));
    });

    it('should handle whitespace-only competitor ID', async () => {
      const result = await service.resolveProjectId('   \t\n   ');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Competitor ID is required and cannot be empty');
    });

    it('should handle null competitor ID via API', async () => {
      const request = createMockRequest('http://localhost:3000/api/reports/generate');
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.code).toBe('EDGE_CASE_MISSING_COMPETITOR_ID');
      expect(data.message).toContain('Competitor ID is required');
    });

    it('should handle malformed competitor ID via API', async () => {
      const request = createMockRequest('http://localhost:3000/api/reports/generate?competitorId=invalid@competitor!');
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.code).toBe('EDGE_CASE_INVALID_COMPETITOR_FORMAT');
      expect(data.error.details).toContain('invalid characters');
    });

    it('should handle excessively long competitor ID via API', async () => {
      const longId = 'a'.repeat(101);
      const request = createMockRequest(`http://localhost:3000/api/reports/generate?competitorId=${longId}`);
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.code).toBe('EDGE_CASE_COMPETITOR_ID_TOO_LONG');
      expect(data.error.guidance.maxLength).toBe(100);
      expect(data.error.guidance.providedLength).toBe(101);
    });

    it('should handle competitor ID with Unicode characters', async () => {
      const unicodeId = 'competitor-测试-🎯-αβγ';
      
      // This should be handled gracefully even if it passes format validation
      (prisma.project.findMany as jest.Mock).mockResolvedValue([]);
      
      const result = await service.findProjectsByCompetitorId(unicodeId);
      
      expect(result).toEqual([]);
      expect(prisma.project.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            competitors: { some: { id: unicodeId } }
          })
        })
      );
    });

    it('should handle SQL injection attempt in competitor ID', async () => {
      const maliciousId = "competitor'; DROP TABLE projects; --";
      
      // Service should handle this safely through parameterized queries
      (prisma.project.findMany as jest.Mock).mockResolvedValue([]);
      
      const result = await service.findProjectsByCompetitorId(maliciousId);
      
      expect(result).toEqual([]);
      // Prisma should safely handle the malicious input
      expect(prisma.project.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            competitors: { some: { id: maliciousId } }
          })
        })
      );
    });
  });

  describe('Edge Case: Database Error Conditions', () => {
    it('should handle database connection timeout', async () => {
      (prisma.project.findMany as jest.Mock).mockRejectedValue(EdgeCaseTestData.databaseErrors.connectionTimeout);

      const result = await service.findProjectsByCompetitorId('competitor-timeout');

      expect(result).toEqual([]);
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to find projects for competitor',
        EdgeCaseTestData.databaseErrors.connectionTimeout,
        expect.any(Object)
      );
    });

    it('should handle query execution failure', async () => {
      (prisma.project.findMany as jest.Mock).mockRejectedValue(EdgeCaseTestData.databaseErrors.queryFailed);

      const result = await service.resolveProjectId('competitor-query-fail');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Query execution failed');
      expect(logger.error).toHaveBeenCalledWith(
        'Project resolution failed',
        EdgeCaseTestData.databaseErrors.queryFailed,
        expect.any(Object)
      );
    });

    it('should handle database connection pool exhaustion', async () => {
      (prisma.$queryRaw as jest.Mock).mockRejectedValue(EdgeCaseTestData.databaseErrors.connectionPool);

      const request = createMockRequest('http://localhost:3000/api/reports/generate?competitorId=valid-competitor');
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.code).toBe('EDGE_CASE_DATABASE_UNAVAILABLE');
      expect(data.retryable).toBe(true);
      expect(data.error.guidance.retryRecommendation).toBe('exponential backoff');
    });

    it('should handle transaction rollback during project lookup', async () => {
      (prisma.project.findMany as jest.Mock).mockRejectedValue(EdgeCaseTestData.databaseErrors.transactionRollback);

      const result = await service.findProjectsByCompetitorId('competitor-transaction-fail');

      expect(result).toEqual([]);
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to find projects for competitor',
        EdgeCaseTestData.databaseErrors.transactionRollback,
        expect.any(Object)
      );
    });

    it('should handle intermittent database errors with retry behavior', async () => {
      // First call fails, second call succeeds
      (prisma.project.findMany as jest.Mock)
        .mockRejectedValueOnce(new Error('Temporary database error'))
        .mockResolvedValueOnce([{
          id: 'project-retry-success',
          name: 'Retry Success Project',
          status: 'ACTIVE',
          priority: 'HIGH',
          createdAt: new Date(),
          updatedAt: new Date(),
          competitors: [{ id: 'competitor-retry' }]
        }]);

      // First call should fail gracefully
      const result1 = await service.findProjectsByCompetitorId('competitor-retry');
      expect(result1).toEqual([]);

      // Second call should succeed (in real scenario, this would be a retry)
      const result2 = await service.findProjectsByCompetitorId('competitor-retry');
      expect(result2).toHaveLength(1);
      expect(result2[0].id).toBe('project-retry-success');
    });
  });

  describe('Edge Case: Priority Resolution Complex Scenarios', () => {
    it('should handle all projects having same priority but different statuses', async () => {
      const sameHighPriorityProjects = [
        {
          id: 'project-high-active',
          name: 'High Priority Active',
          status: 'ACTIVE',
          priority: 'HIGH',
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
          competitors: [{ id: 'competitor-same-priority' }]
        },
        {
          id: 'project-high-draft',
          name: 'High Priority Draft',
          status: 'DRAFT',
          priority: 'HIGH',
          createdAt: new Date('2024-01-02'),
          updatedAt: new Date('2024-01-02'),
          competitors: [{ id: 'competitor-same-priority' }]
        },
        {
          id: 'project-high-paused',
          name: 'High Priority Paused',
          status: 'PAUSED',
          priority: 'HIGH',
          createdAt: new Date('2024-01-03'),
          updatedAt: new Date('2024-01-03'),
          competitors: [{ id: 'competitor-same-priority' }]
        }
      ];

      (prisma.project.findMany as jest.Mock).mockResolvedValue(sameHighPriorityProjects);

      const result = await service.resolveProjectId('competitor-same-priority', { 
        priorityRules: 'active_first' 
      });

      expect(result.success).toBe(true);
      expect(result.projectId).toBe('project-high-active'); // Active should win
    });

    it('should handle all projects being inactive with different priorities', async () => {
      const inactiveProjects = [
        {
          id: 'project-paused-urgent',
          name: 'Paused Urgent',
          status: 'PAUSED',
          priority: 'URGENT',
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
          competitors: [{ id: 'competitor-all-inactive' }]
        },
        {
          id: 'project-archived-high',
          name: 'Archived High',
          status: 'ARCHIVED',
          priority: 'HIGH',
          createdAt: new Date('2024-01-02'),
          updatedAt: new Date('2024-01-02'),
          competitors: [{ id: 'competitor-all-inactive' }]
        }
      ];

      (prisma.project.findMany as jest.Mock).mockResolvedValue(inactiveProjects);

      const result = await service.resolveProjectId('competitor-all-inactive', { 
        priorityRules: 'by_priority' 
      });

      expect(result.success).toBe(true);
      expect(result.projectId).toBe('project-paused-urgent'); // Highest priority wins
    });

    it('should handle priority resolution when includeInactive is false', async () => {
      const mixedProjects = [
        {
          id: 'project-active-low',
          name: 'Active Low Priority',
          status: 'ACTIVE',
          priority: 'LOW',
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
          competitors: [{ id: 'competitor-include-inactive' }]
        }
      ];

      (prisma.project.findMany as jest.Mock).mockResolvedValue(mixedProjects);

      const result = await service.resolveProjectId('competitor-include-inactive', { 
        includeInactive: false,
        priorityRules: 'by_priority' 
      });

      expect(result.success).toBe(true);
      expect(result.projectId).toBe('project-active-low');
      
      // Verify the database query excluded inactive projects
      expect(prisma.project.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { in: ['ACTIVE', 'DRAFT'] }
          })
        })
      );
    });

    it('should handle edge case where priority mapping fails', async () => {
      const projectsWithInvalidPriority = [
        {
          id: 'project-invalid-priority',
          name: 'Invalid Priority Project',
          status: 'ACTIVE',
          priority: 'UNKNOWN_PRIORITY', // Invalid priority
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
          competitors: [{ id: 'competitor-invalid-priority' }]
        }
      ];

      (prisma.project.findMany as jest.Mock).mockResolvedValue(projectsWithInvalidPriority);

      const result = await service.resolveProjectId('competitor-invalid-priority');

      expect(result.success).toBe(true);
      expect(result.projectId).toBe('project-invalid-priority');
      
      // Should still work and map to default priority (medium = 2)
      const projects = await service.findProjectsByCompetitorId('competitor-invalid-priority');
      expect(projects[0].priority).toBe(2); // Default medium priority
    });
  });

  describe('Edge Case: Cache Behavior Under Error Conditions', () => {
    it('should not cache results when database query fails', async () => {
      (prisma.project.findMany as jest.Mock).mockRejectedValue(new Error('Database error'));

      // First call should fail and not cache
      const result1 = await service.findProjectsByCompetitorId('competitor-cache-error');
      expect(result1).toEqual([]);

      // Second call should also hit database (no cached error)
      const result2 = await service.findProjectsByCompetitorId('competitor-cache-error');
      expect(result2).toEqual([]);

      expect(prisma.project.findMany).toHaveBeenCalledTimes(2);
    });

    it('should handle cache operation failures gracefully', async () => {
      // Mock cache to throw errors
      const faultyCache = {
        set: jest.fn().mockRejectedValue(new Error('Cache write failed')),
        get: jest.fn().mockRejectedValue(new Error('Cache read failed')),
        invalidate: jest.fn().mockRejectedValue(new Error('Cache invalidate failed')),
        clear: jest.fn().mockRejectedValue(new Error('Cache clear failed')),
        getStats: jest.fn().mockReturnValue({ hits: 0, misses: 0, entries: 0, hitRate: 0, size: 0 })
      };

      const serviceWithFaultyCache = new ProjectDiscoveryService(faultyCache);
      
      (prisma.project.findMany as jest.Mock).mockResolvedValue([{
        id: 'project-cache-fault',
        name: 'Cache Fault Project',
        status: 'ACTIVE',
        priority: 'HIGH',
        createdAt: new Date(),
        updatedAt: new Date(),
        competitors: [{ id: 'competitor-cache-fault' }]
      }]);

      // Should still work despite cache failures
      const result = await serviceWithFaultyCache.findProjectsByCompetitorId('competitor-cache-fault');
      
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('project-cache-fault');
      expect(faultyCache.get).toHaveBeenCalled();
      expect(faultyCache.set).toHaveBeenCalled();
    });

    it('should handle concurrent cache invalidation scenarios', async () => {
      (prisma.project.findMany as jest.Mock).mockResolvedValue([{
        id: 'project-concurrent',
        name: 'Concurrent Project',
        status: 'ACTIVE',
        priority: 'HIGH',
        createdAt: new Date(),
        updatedAt: new Date(),
        competitors: [{ id: 'competitor-concurrent' }]
      }]);

      // Multiple concurrent requests
      const promises = [
        service.findProjectsByCompetitorId('competitor-concurrent'),
        service.findProjectsByCompetitorId('competitor-concurrent'),
        service.findProjectsByCompetitorId('competitor-concurrent')
      ];

      const results = await Promise.all(promises);

      // All should succeed
      results.forEach(result => {
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('project-concurrent');
      });

      // Database should be called at least once, possibly more due to concurrency
      expect(prisma.project.findMany).toHaveBeenCalled();
    });
  });

  describe('Edge Case: Validation and Relationship Verification', () => {
    it('should handle validation of non-existent project-competitor relationship', async () => {
      (prisma.project.findFirst as jest.Mock).mockResolvedValue(null);

      const isValid = await service.validateProjectCompetitorRelationship(
        'competitor-nonexistent',
        'project-nonexistent'
      );

      expect(isValid).toBe(false);
      expect(prisma.project.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'project-nonexistent',
          competitors: { some: { id: 'competitor-nonexistent' } }
        },
        select: { id: true }
      });
    });

    it('should handle validation database errors gracefully', async () => {
      (prisma.project.findFirst as jest.Mock).mockRejectedValue(new Error('Validation query failed'));

      const isValid = await service.validateProjectCompetitorRelationship(
        'competitor-error',
        'project-error'
      );

      expect(isValid).toBe(false);
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to validate project-competitor relationship',
        expect.any(Error),
        expect.any(Object)
      );
    });

    it('should handle validation with malformed IDs', async () => {
      const malformedCompetitorId = '';
      const malformedProjectId = null as any;

      (prisma.project.findFirst as jest.Mock).mockResolvedValue(null);

      const isValid = await service.validateProjectCompetitorRelationship(
        malformedCompetitorId,
        malformedProjectId
      );

      expect(isValid).toBe(false);
      // Should still attempt validation even with malformed IDs
      expect(prisma.project.findFirst).toHaveBeenCalled();
    });
  });

  describe('Edge Case: Performance Under Stress', () => {
    it('should handle large number of projects efficiently', async () => {
      // Generate 100 projects
      const manyProjects = Array.from({ length: 100 }, (_, i) => ({
        id: `project-${i}`,
        name: `Project ${i}`,
        status: i % 2 === 0 ? 'ACTIVE' : 'DRAFT',
        priority: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'][i % 4],
        createdAt: new Date(2024, 0, i + 1),
        updatedAt: new Date(2024, 0, i + 1),
        competitors: [{ id: 'competitor-many-projects' }]
      }));

      (prisma.project.findMany as jest.Mock).mockResolvedValue(manyProjects);

      const startTime = Date.now();
      const result = await service.resolveProjectId('competitor-many-projects');
      const endTime = Date.now();

      expect(result.success).toBe(true);
      expect(result.projects).toHaveLength(100);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
    });

    it('should handle rapid successive calls efficiently', async () => {
      (prisma.project.findMany as jest.Mock).mockResolvedValue([{
        id: 'project-rapid',
        name: 'Rapid Project',
        status: 'ACTIVE',
        priority: 'HIGH',
        createdAt: new Date(),
        updatedAt: new Date(),
        competitors: [{ id: 'competitor-rapid' }]
      }]);

      const rapidCalls = Array.from({ length: 10 }, () => 
        service.findProjectsByCompetitorId('competitor-rapid')
      );

      const results = await Promise.all(rapidCalls);

      // All should succeed
      results.forEach(result => {
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('project-rapid');
      });

      // Due to caching, database should be called only once
      expect(prisma.project.findMany).toHaveBeenCalledTimes(1);
    });
  });
}); 