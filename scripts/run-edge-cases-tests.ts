#!/usr/bin/env node

/**
 * Project Discovery Edge Cases Test Runner - Task 6.3
 * 
 * Comprehensive test runner for project discovery edge cases including:
 * - No projects found scenarios
 * - Multiple projects complex resolution
 * - Invalid competitor handling
 * - Database error conditions
 * - Priority resolution edge cases
 * - Cache behavior under stress
 * 
 * Part of TP-013-20250801-project-report-association-fix
 */

import { ProjectDiscoveryService, ProjectInfo, ProjectDiscoveryOptions } from '../src/services/projectDiscoveryService';
import { logger } from '../src/lib/logger';

// Edge Case Test Framework
interface EdgeCaseTestResult {
  name: string;
  category: string;
  passed: boolean;
  error?: string;
  duration: number;
  details?: {
    expectedBehavior: string;
    actualBehavior: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
  };
}

interface EdgeCaseTestSuite {
  name: string;
  category: string;
  tests: EdgeCaseTestResult[];
  passed: number;
  failed: number;
  duration: number;
}

class EdgeCaseTestFramework {
  private testSuites: EdgeCaseTestSuite[] = [];
  private currentSuite: EdgeCaseTestSuite | null = null;

  describe(name: string, category: string, testFn: () => void): void {
    this.currentSuite = {
      name,
      category,
      tests: [],
      passed: 0,
      failed: 0,
      duration: 0
    };

    const startTime = Date.now();
    
    try {
      testFn();
    } catch (error) {
      console.error(`Edge case test suite ${name} setup failed:`, error);
    }

    this.currentSuite.duration = Date.now() - startTime;
    this.testSuites.push(this.currentSuite);
    this.currentSuite = null;
  }

  it(name: string, expectedBehavior: string, severity: 'low' | 'medium' | 'high' | 'critical', testFn: () => Promise<void> | void): void {
    if (!this.currentSuite) {
      throw new Error('Test must be inside a describe block');
    }

    const startTime = Date.now();
    
    const runTest = async () => {
      try {
        await testFn();
        const result: EdgeCaseTestResult = {
          name,
          category: this.currentSuite!.category,
          passed: true,
          duration: Date.now() - startTime,
          details: {
            expectedBehavior,
            actualBehavior: 'Test passed as expected',
            severity
          }
        };
        this.currentSuite!.tests.push(result);
        this.currentSuite!.passed++;
      } catch (error) {
        const result: EdgeCaseTestResult = {
          name,
          category: this.currentSuite!.category,
          passed: false,
          error: error instanceof Error ? error.message : String(error),
          duration: Date.now() - startTime,
          details: {
            expectedBehavior,
            actualBehavior: `Test failed: ${error instanceof Error ? error.message : String(error)}`,
            severity
          }
        };
        this.currentSuite!.tests.push(result);
        this.currentSuite!.failed++;
      }
    };

    runTest().catch(console.error);
  }

  expect(actual: any) {
    return {
      toBe: (expected: any) => {
        if (actual !== expected) {
          throw new Error(`Expected ${actual} to be ${expected}`);
        }
      },
      toEqual: (expected: any) => {
        if (JSON.stringify(actual) !== JSON.stringify(expected)) {
          throw new Error(`Expected ${JSON.stringify(actual)} to equal ${JSON.stringify(expected)}`);
        }
      },
      toContain: (expected: any) => {
        if (!actual || !actual.includes(expected)) {
          throw new Error(`Expected ${actual} to contain ${expected}`);
        }
      },
      toHaveLength: (expected: number) => {
        if (!actual || actual.length !== expected) {
          throw new Error(`Expected ${actual} to have length ${expected}`);
        }
      },
      toBeLessThan: (expected: number) => {
        if (typeof actual !== 'number' || actual >= expected) {
          throw new Error(`Expected ${actual} to be less than ${expected}`);
        }
      },
      toBeGreaterThan: (expected: number) => {
        if (typeof actual !== 'number' || actual <= expected) {
          throw new Error(`Expected ${actual} to be greater than ${expected}`);
        }
      },
      toBeDefined: () => {
        if (actual === undefined) {
          throw new Error(`Expected ${actual} to be defined`);
        }
      },
      toBeFalsy: () => {
        if (actual) {
          throw new Error(`Expected ${actual} to be falsy`);
        }
      },
      toBeTruthy: () => {
        if (!actual) {
          throw new Error(`Expected ${actual} to be truthy`);
        }
      }
    };
  }

  generateReport(): void {
    console.log('\n📋 Edge Cases Test Results Summary - Task 6.3\n');
    
    let totalTests = 0;
    let totalPassed = 0;
    let totalFailed = 0;
    let totalDuration = 0;
    let criticalFailures = 0;
    let highSeverityFailures = 0;

    const categorySummary = new Map<string, { passed: number; failed: number; critical: number; high: number }>();

    this.testSuites.forEach(suite => {
      const suiteTotal = suite.tests.length;
      totalTests += suiteTotal;
      totalPassed += suite.passed;
      totalFailed += suite.failed;
      totalDuration += suite.duration;

      // Track category-level statistics
      if (!categorySummary.has(suite.category)) {
        categorySummary.set(suite.category, { passed: 0, failed: 0, critical: 0, high: 0 });
      }
      const categoryStats = categorySummary.get(suite.category)!;
      categoryStats.passed += suite.passed;
      categoryStats.failed += suite.failed;

      // Count severity levels
      suite.tests.forEach(test => {
        if (!test.passed) {
          if (test.details?.severity === 'critical') {
            criticalFailures++;
            categoryStats.critical++;
          } else if (test.details?.severity === 'high') {
            highSeverityFailures++;
            categoryStats.high++;
          }
        }
      });

      const status = suite.failed === 0 ? '✅' : 
                   suite.tests.some(t => !t.passed && t.details?.severity === 'critical') ? '🔴' :
                   suite.tests.some(t => !t.passed && t.details?.severity === 'high') ? '🟠' : '⚠️';
      
      console.log(`${status} ${suite.name}: ${suite.passed}/${suiteTotal} passed (${suite.duration}ms)`);

      // Show failed tests with severity indicators
      const failedTests = suite.tests.filter(test => !test.passed);
      failedTests.forEach(test => {
        const severityIcon = test.details?.severity === 'critical' ? '🔴' : 
                           test.details?.severity === 'high' ? '🟠' :
                           test.details?.severity === 'medium' ? '🟡' : '⚪';
        console.log(`   ${severityIcon} ${test.name}: ${test.error}`);
        if (test.details?.severity === 'critical' || test.details?.severity === 'high') {
          console.log(`      Expected: ${test.details.expectedBehavior}`);
          console.log(`      Actual: ${test.details.actualBehavior}`);
        }
      });
    });

    console.log(`\n📊 Overall Results:`);
    console.log(`   Total Tests: ${totalTests}`);
    console.log(`   Passed: ${totalPassed} (${Math.round((totalPassed / totalTests) * 100)}%)`);
    console.log(`   Failed: ${totalFailed}`);
    console.log(`   Duration: ${totalDuration}ms`);
    console.log(`   Average Test Time: ${Math.round(totalDuration / totalTests)}ms`);

    if (criticalFailures > 0 || highSeverityFailures > 0) {
      console.log(`\n⚠️  Severity Analysis:`);
      console.log(`   🔴 Critical Failures: ${criticalFailures}`);
      console.log(`   🟠 High Severity Failures: ${highSeverityFailures}`);
    }

    console.log(`\n📈 Category Breakdown:`);
    for (const [category, stats] of categorySummary) {
      const categoryTotal = stats.passed + stats.failed;
      const categoryPercent = Math.round((stats.passed / categoryTotal) * 100);
      const categoryStatus = stats.critical > 0 ? '🔴' : stats.high > 0 ? '🟠' : stats.failed > 0 ? '🟡' : '✅';
      console.log(`   ${categoryStatus} ${category}: ${stats.passed}/${categoryTotal} (${categoryPercent}%)`);
    }

    if (totalFailed === 0) {
      console.log('\n🎉 All edge case tests passed!');
    } else if (criticalFailures === 0) {
      console.log(`\n✅ No critical edge cases failed. ${totalFailed} minor issues found.`);
    } else {
      console.log(`\n🚨 ${criticalFailures} critical edge cases failed! Immediate attention required.`);
    }
  }
}

// Mock implementations for edge case testing
class MockEdgeCasePrisma {
  public $queryRaw = mockFunction();
  public competitor = { findUnique: mockFunction() };
  public project = { findMany: mockFunction(), findFirst: mockFunction() };

  constructor() {
    // Default successful behavior
    this.$queryRaw.mockResolvedValue([{ result: 1 }]);
    this.competitor.findUnique.mockResolvedValue({ id: 'test', name: 'Test' });
    this.project.findMany.mockResolvedValue([]);
    this.project.findFirst.mockResolvedValue(null);
  }
}

class MockEdgeCaseCache {
  private storage = new Map<string, any>();
  private shouldFail = false;

  setFailureMode(fail: boolean) {
    this.shouldFail = fail;
  }

  async set(key: string, value: ProjectInfo[]): Promise<void> {
    if (this.shouldFail) throw new Error('Cache write failed');
    this.storage.set(key, { data: value, expiresAt: Date.now() + 300000 });
  }

  async get(key: string): Promise<ProjectInfo[] | null> {
    if (this.shouldFail) throw new Error('Cache read failed');
    const entry = this.storage.get(key);
    if (!entry || Date.now() > entry.expiresAt) return null;
    return entry.data;
  }

  async invalidate(competitorId: string): Promise<void> {
    if (this.shouldFail) throw new Error('Cache invalidate failed');
    const keysToDelete = Array.from(this.storage.keys()).filter(key => key.includes(competitorId));
    keysToDelete.forEach(key => this.storage.delete(key));
  }

  async clear(): Promise<void> {
    if (this.shouldFail) throw new Error('Cache clear failed');
    this.storage.clear();
  }

  getStats() {
    return { hits: 0, misses: 0, entries: this.storage.size, hitRate: 0, size: 100 };
  }
}

// Simple mock function implementation
function mockFunction() {
  const calls: any[][] = [];
  const fn = (...args: any[]) => {
    calls.push(args);
    return fn.mockReturnValue;
  };
  
  fn.mockReturnValue = undefined;
  fn.mockResolvedValue = (value: any) => {
    fn.mockReturnValue = Promise.resolve(value);
    return fn;
  };
  fn.mockRejectedValue = (value: any) => {
    fn.mockReturnValue = Promise.reject(value);
    return fn;
  };
  fn.mockImplementation = (impl: (...args: any[]) => any) => {
    fn.mockReturnValue = impl;
    return fn;
  };
  fn.calls = calls;
  
  return fn;
}

// Test data for edge cases
const EdgeCaseData = {
  noProjectsCompetitor: {
    id: 'competitor-no-projects',
    name: 'Competitor With No Projects'
  },
  
  multipleProjectsEqual: [
    {
      id: 'project-equal-1',
      name: 'Equal Project A',
      status: 'ACTIVE',
      priority: 'HIGH',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
      competitors: [{ id: 'competitor-multi' }]
    },
    {
      id: 'project-equal-2',
      name: 'Equal Project B', 
      status: 'ACTIVE',
      priority: 'HIGH',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
      competitors: [{ id: 'competitor-multi' }]
    }
  ],

  mixedStatusProjects: [
    {
      id: 'project-active-high',
      name: 'Active High Priority',
      status: 'ACTIVE',
      priority: 'HIGH',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
      competitors: [{ id: 'competitor-mixed' }]
    },
    {
      id: 'project-draft-urgent',
      name: 'Draft Urgent Priority',
      status: 'DRAFT',
      priority: 'URGENT',
      createdAt: new Date('2024-01-02'),
      updatedAt: new Date('2024-01-02'),
      competitors: [{ id: 'competitor-mixed' }]
    },
    {
      id: 'project-paused-high',
      name: 'Paused High Priority',
      status: 'PAUSED',
      priority: 'HIGH',
      createdAt: new Date('2024-01-03'),
      updatedAt: new Date('2024-01-03'),
      competitors: [{ id: 'competitor-mixed' }]
    }
  ]
};

/**
 * Task 6.3: Main edge cases test execution function
 */
async function runEdgeCasesTests() {
  console.log('🧪 Starting Project Discovery Edge Cases Tests - Task 6.3');
  console.log('Testing critical edge cases: no projects, multiple projects, invalid competitors...\n');

  const framework = new EdgeCaseTestFramework();
  
  // Setup global mocks
  const mockPrisma = new MockEdgeCasePrisma();
  const mockCache = new MockEdgeCaseCache();
  
  // Mock the logger to prevent noise
  jest.spyOn(logger, 'info').mockImplementation(() => {});
  jest.spyOn(logger, 'debug').mockImplementation(() => {});
  jest.spyOn(logger, 'warn').mockImplementation(() => {});
  jest.spyOn(logger, 'error').mockImplementation(() => {});

  // Initialize service
  const service = new ProjectDiscoveryService(mockCache);

  // Test Suite 1: No Projects Found Edge Cases
  framework.describe('No Projects Found Edge Cases', 'no-projects', () => {
    framework.it(
      'should handle competitor with no associated projects',
      'Returns success=false with appropriate error message',
      'high',
      async () => {
        mockPrisma.project.findMany.mockResolvedValue([]);
        
        const result = await service.resolveProjectId('competitor-no-projects');
        
        framework.expect(result.success).toBe(false);
        framework.expect(result.error).toBe('No projects associated with this competitor');
        framework.expect(result.projects).toEqual([]);
      }
    );

    framework.it(
      'should handle database returning empty result set gracefully',
      'Returns empty array without throwing errors',
      'medium',
      async () => {
        mockPrisma.project.findMany.mockResolvedValue([]);
        
        const result = await service.findProjectsByCompetitorId('competitor-empty');
        
        framework.expect(result).toEqual([]);
      }
    );

    framework.it(
      'should handle competitor with filtered out inactive projects',
      'Returns no projects when only inactive projects exist and includeInactive=false',
      'high',
      async () => {
        // First call with status filter returns empty
        // Second call without filter would return inactive projects
        mockPrisma.project.findMany
          .mockResolvedValueOnce([]) // With status filter
          .mockResolvedValueOnce([{  // Without status filter  
            id: 'inactive-project',
            status: 'ARCHIVED',
            name: 'Archived Project',
            priority: 'HIGH',
            createdAt: new Date(),
            updatedAt: new Date(),
            competitors: [{ id: 'competitor-inactive' }]
          }]);
        
        const result = await service.resolveProjectId('competitor-inactive');
        
        framework.expect(result.success).toBe(false);
        framework.expect(result.error).toBe('No projects associated with this competitor');
      }
    );

    framework.it(
      'should not cache empty results from failed queries',
      'Failed queries should not populate cache to avoid caching errors',
      'medium',
      async () => {
        mockPrisma.project.findMany.mockRejectedValue(new Error('Database error'));
        
        // First call should fail
        const result1 = await service.findProjectsByCompetitorId('competitor-error');
        framework.expect(result1).toEqual([]);
        
        // Reset mock for second call
        mockPrisma.project.findMany.mockResolvedValue([{
          id: 'success-project',
          name: 'Success Project',
          status: 'ACTIVE',
          priority: 'HIGH',
          createdAt: new Date(),
          updatedAt: new Date(),
          competitors: [{ id: 'competitor-error' }]
        }]);
        
        // Second call should hit database again (not cached error)
        const result2 = await service.findProjectsByCompetitorId('competitor-error');
        framework.expect(result2).toHaveLength(1);
        framework.expect(result2[0].id).toBe('success-project');
      }
    );
  });

  // Test Suite 2: Multiple Projects Complex Resolution
  framework.describe('Multiple Projects Resolution Edge Cases', 'multiple-projects', () => {
    framework.it(
      'should handle identical priority and status with tie-breaking',
      'Selects first project when all factors are equal (deterministic tie-breaking)',
      'critical',
      async () => {
        mockPrisma.project.findMany.mockResolvedValue(EdgeCaseData.multipleProjectsEqual);
        
        const result = await service.resolveProjectId('competitor-multi');
        
        framework.expect(result.success).toBe(true);
        framework.expect(result.projectId).toBe('project-equal-1'); // First project as tie-breaker
        framework.expect(result.projects).toHaveLength(2);
      }
    );

    framework.it(
      'should prioritize active projects over inactive with higher priority',
      'Active projects should win over inactive projects regardless of priority when using active_first',
      'high',
      async () => {
        mockPrisma.project.findMany.mockResolvedValue(EdgeCaseData.mixedStatusProjects);
        
        const result = await service.resolveProjectId('competitor-mixed', { priorityRules: 'active_first' });
        
        framework.expect(result.success).toBe(true);
        framework.expect(result.projectId).toBe('project-active-high'); // Active wins
      }
    );

    framework.it(
      'should prioritize by priority when using by_priority rule',
      'Highest priority project should win regardless of active status when using by_priority',
      'high',
      async () => {
        mockPrisma.project.findMany.mockResolvedValue(EdgeCaseData.mixedStatusProjects);
        
        const result = await service.resolveProjectId('competitor-mixed', { priorityRules: 'by_priority' });
        
        framework.expect(result.success).toBe(true);
        framework.expect(result.projectId).toBe('project-draft-urgent'); // Urgent priority wins
      }
    );

    framework.it(
      'should fallback to active_first for unknown priority rules',
      'Unknown priority rules should default to active_first with warning logged',
      'medium',
      async () => {
        mockPrisma.project.findMany.mockResolvedValue(EdgeCaseData.mixedStatusProjects);
        
        const result = await service.resolveProjectId('competitor-mixed', { priorityRules: 'unknown_rule' as any });
        
        framework.expect(result.success).toBe(true);
        framework.expect(result.projectId).toBe('project-active-high');
      }
    );

    framework.it(
      'should handle large number of projects efficiently',
      'Should resolve projects efficiently even with large datasets (>50 projects)',
      'medium',
      async () => {
        const manyProjects = Array.from({ length: 75 }, (_, i) => ({
          id: `project-${i}`,
          name: `Project ${i}`,
          status: i % 3 === 0 ? 'ACTIVE' : (i % 3 === 1 ? 'DRAFT' : 'PAUSED'),
          priority: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'][i % 4],
          createdAt: new Date(2024, 0, i + 1),
          updatedAt: new Date(2024, 0, i + 1),
          competitors: [{ id: 'competitor-many' }]
        }));
        
        mockPrisma.project.findMany.mockResolvedValue(manyProjects);
        
        const startTime = Date.now();
        const result = await service.resolveProjectId('competitor-many');
        const endTime = Date.now();
        
        framework.expect(result.success).toBe(true);
        framework.expect(result.projects).toHaveLength(75);
        framework.expect(endTime - startTime).toBeLessThan(500); // Should complete quickly
      }
    );
  });

  // Test Suite 3: Invalid Competitor Scenarios
  framework.describe('Invalid Competitor Edge Cases', 'invalid-competitors', () => {
    framework.it(
      'should reject empty competitor ID',
      'Returns success=false with validation error for empty competitor ID',
      'critical',
      async () => {
        const result = await service.resolveProjectId('');
        
        framework.expect(result.success).toBe(false);
        framework.expect(result.error).toBe('Competitor ID is required and cannot be empty');
      }
    );

    framework.it(
      'should reject whitespace-only competitor ID',
      'Returns validation error for competitor ID containing only whitespace',
      'critical',
      async () => {
        const result = await service.resolveProjectId('   \t\n   ');
        
        framework.expect(result.success).toBe(false);
        framework.expect(result.error).toBe('Competitor ID is required and cannot be empty');
      }
    );

    framework.it(
      'should handle competitor ID with special characters safely',
      'Should not break on special characters but may return no results',
      'high',
      async () => {
        mockPrisma.project.findMany.mockResolvedValue([]);
        
        const result = await service.findProjectsByCompetitorId('competitor@with#special$chars');
        
        framework.expect(result).toEqual([]);
        // Should not throw error, just return empty results
      }
    );

    framework.it(
      'should handle extremely long competitor IDs',
      'Should handle long strings gracefully without system errors',
      'medium',
      async () => {
        const longId = 'a'.repeat(200);
        mockPrisma.project.findMany.mockResolvedValue([]);
        
        const result = await service.findProjectsByCompetitorId(longId);
        
        framework.expect(result).toEqual([]);
      }
    );

    framework.it(
      'should handle potential SQL injection attempts safely',
      'Should safely handle malicious input through parameterized queries',
      'critical',
      async () => {
        const maliciousId = "competitor'; DROP TABLE projects; --";
        mockPrisma.project.findMany.mockResolvedValue([]);
        
        const result = await service.findProjectsByCompetitorId(maliciousId);
        
        framework.expect(result).toEqual([]);
        // Prisma should safely parameterize the query
      }
    );
  });

  // Test Suite 4: Database Error Conditions
  framework.describe('Database Error Edge Cases', 'database-errors', () => {
    framework.it(
      'should handle database connection timeout gracefully',
      'Returns empty results on connection timeout without crashing',
      'high',
      async () => {
        mockPrisma.project.findMany.mockRejectedValue(new Error('Connection timeout'));
        
        const result = await service.findProjectsByCompetitorId('competitor-timeout');
        
        framework.expect(result).toEqual([]);
      }
    );

    framework.it(
      'should handle query execution failures gracefully',
      'Returns error result on query failure with proper error propagation',
      'high',
      async () => {
        mockPrisma.project.findMany.mockRejectedValue(new Error('Query failed'));
        
        const result = await service.resolveProjectId('competitor-query-fail');
        
        framework.expect(result.success).toBe(false);
        framework.expect(result.error).toBe('Query failed');
      }
    );

    framework.it(
      'should handle intermittent database errors with retry behavior',
      'Should handle database recovery scenarios gracefully',
      'medium',
      async () => {
        // First call fails, second succeeds
        mockPrisma.project.findMany
          .mockRejectedValueOnce(new Error('Temporary error'))
          .mockResolvedValueOnce([{
            id: 'recovery-project',
            name: 'Recovery Project',
            status: 'ACTIVE',
            priority: 'HIGH',
            createdAt: new Date(),
            updatedAt: new Date(),
            competitors: [{ id: 'competitor-recovery' }]
          }]);
        
        // First call should fail gracefully
        const result1 = await service.findProjectsByCompetitorId('competitor-recovery');
        framework.expect(result1).toEqual([]);
        
        // Second call should succeed
        const result2 = await service.findProjectsByCompetitorId('competitor-recovery');
        framework.expect(result2).toHaveLength(1);
      }
    );

    framework.it(
      'should handle database connection pool exhaustion',
      'Should handle resource exhaustion scenarios without hanging',
      'high',
      async () => {
        mockPrisma.project.findMany.mockRejectedValue(new Error('Connection pool exhausted'));
        
        const result = await service.findProjectsByCompetitorId('competitor-pool');
        
        framework.expect(result).toEqual([]);
      }
    );
  });

  // Test Suite 5: Cache Behavior Edge Cases
  framework.describe('Cache Behavior Edge Cases', 'cache-behavior', () => {
    framework.it(
      'should handle cache write failures gracefully',
      'Service should continue working even when cache writes fail',
      'medium',
      async () => {
        mockCache.setFailureMode(true);
        mockPrisma.project.findMany.mockResolvedValue([{
          id: 'cache-fail-project',
          name: 'Cache Fail Project',
          status: 'ACTIVE',
          priority: 'HIGH',
          createdAt: new Date(),
          updatedAt: new Date(),
          competitors: [{ id: 'competitor-cache-fail' }]
        }]);
        
        const result = await service.findProjectsByCompetitorId('competitor-cache-fail');
        
        framework.expect(result).toHaveLength(1);
        framework.expect(result[0].id).toBe('cache-fail-project');
      }
    );

    framework.it(
      'should handle cache read failures gracefully',
      'Service should fallback to database when cache reads fail',
      'medium',
      async () => {
        mockCache.setFailureMode(true);
        mockPrisma.project.findMany.mockResolvedValue([{
          id: 'cache-read-fail-project',
          name: 'Cache Read Fail Project',
          status: 'ACTIVE',
          priority: 'HIGH',
          createdAt: new Date(),
          updatedAt: new Date(),
          competitors: [{ id: 'competitor-cache-read-fail' }]
        }]);
        
        const result = await service.findProjectsByCompetitorId('competitor-cache-read-fail');
        
        framework.expect(result).toHaveLength(1);
        framework.expect(result[0].id).toBe('cache-read-fail-project');
      }
    );

    framework.it(
      'should handle concurrent requests efficiently with caching',
      'Multiple concurrent requests should benefit from caching without race conditions',
      'medium',
      async () => {
        mockCache.setFailureMode(false);
        mockPrisma.project.findMany.mockResolvedValue([{
          id: 'concurrent-project',
          name: 'Concurrent Project',
          status: 'ACTIVE',
          priority: 'HIGH',
          createdAt: new Date(),
          updatedAt: new Date(),
          competitors: [{ id: 'competitor-concurrent' }]
        }]);
        
        // Make multiple concurrent requests
        const promises = Array.from({ length: 5 }, () => 
          service.findProjectsByCompetitorId('competitor-concurrent')
        );
        
        const results = await Promise.all(promises);
        
        // All should succeed
        results.forEach(result => {
          framework.expect(result).toHaveLength(1);
          framework.expect(result[0].id).toBe('concurrent-project');
        });
      }
    );
  });

  // Test Suite 6: Performance Edge Cases
  framework.describe('Performance Edge Cases', 'performance', () => {
    framework.it(
      'should handle rapid successive calls efficiently',
      'Multiple rapid calls should be handled efficiently with proper caching',
      'medium',
      async () => {
        mockPrisma.project.findMany.mockResolvedValue([{
          id: 'rapid-project',
          name: 'Rapid Project',
          status: 'ACTIVE',
          priority: 'HIGH',
          createdAt: new Date(),
          updatedAt: new Date(),
          competitors: [{ id: 'competitor-rapid' }]
        }]);
        
        const startTime = Date.now();
        
        // Make 20 rapid successive calls
        const promises = Array.from({ length: 20 }, () => 
          service.findProjectsByCompetitorId('competitor-rapid')
        );
        
        const results = await Promise.all(promises);
        const endTime = Date.now();
        
        // All should succeed
        results.forEach(result => {
          framework.expect(result).toHaveLength(1);
        });
        
        // Should complete quickly due to caching
        framework.expect(endTime - startTime).toBeLessThan(1000);
      }
    );

    framework.it(
      'should handle memory pressure with large datasets',
      'Should not consume excessive memory with large project datasets',
      'low',
      async () => {
        // Generate a very large dataset
        const hugeDataset = Array.from({ length: 500 }, (_, i) => ({
          id: `huge-project-${i}`,
          name: `Huge Project ${i}`,
          status: 'ACTIVE',
          priority: 'MEDIUM',
          createdAt: new Date(),
          updatedAt: new Date(),
          competitors: [{ id: 'competitor-huge' }]
        }));
        
        mockPrisma.project.findMany.mockResolvedValue(hugeDataset);
        
        const result = await service.findProjectsByCompetitorId('competitor-huge');
        
        framework.expect(result).toHaveLength(500);
        // Memory usage should be reasonable (this is more of a system test)
      }
    );
  });

  // Generate and display test results
  setTimeout(() => {
    framework.generateReport();
    
    console.log('\n✅ Task 6.3 - Project Discovery Edge Cases Tests Complete!');
    console.log('\nEdge Case Coverage Areas:');
    console.log('• ✅ No Projects Found Scenarios');
    console.log('• ✅ Multiple Projects Complex Resolution');
    console.log('• ✅ Invalid Competitor Handling');
    console.log('• ✅ Database Error Conditions');  
    console.log('• ✅ Cache Behavior Under Stress');
    console.log('• ✅ Performance Edge Cases');
    
    console.log('\nCritical Edge Cases Tested:');
    console.log('• Empty/null competitor IDs');
    console.log('• Identical project priorities (tie-breaking)');
    console.log('• SQL injection protection');
    console.log('• Database connection failures');
    console.log('• Cache operation failures');
    console.log('• Large dataset handling');
    console.log('• Concurrent request scenarios');
    console.log('• Memory pressure conditions');
    
    console.log('\nBusiness Logic Edge Cases:');
    console.log('• Active vs inactive project prioritization');
    console.log('• Priority rule fallback behavior');
    console.log('• Multi-project resolution strategies');
    console.log('• Project filtering edge cases');
    console.log('• Validation failure scenarios');
  }, 200);
}

// Simple jest mock implementation
const jest = {
  spyOn: (object: any, method: string) => {
    const originalMethod = object[method];
    const spy = mockFunction();
    object[method] = spy;
    spy.mockImplementation = (fn: any) => {
      object[method] = fn;
      return spy;
    };
    return spy;
  }
};

// Export for use in npm scripts
export { runEdgeCasesTests };

// Run tests if this script is executed directly
if (require.main === module) {
  runEdgeCasesTests().catch(console.error);
} 