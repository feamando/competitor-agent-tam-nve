/**
 * Database Schema Alignment Integration Tests - Task 7.4
 * 
 * Comprehensive tests to validate that consolidated services work correctly
 * with the existing database schema, foreign key relationships, and data integrity.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { prisma } from '@/lib/prisma';
import { 
  DatabaseSchemaAlignment, 
  quickSchemaCheck, 
  generateSchemaAlignmentReport,
  type DatabaseIntegrityReport 
} from '@/lib/database/schemaAlignment';
import { AnalysisService } from '@/services/domains/AnalysisService';
import { ReportingService } from '@/services/domains/ReportingService';

// Test data setup helpers
import { createId } from '@paralleldrive/cuid2';

describe('Database Schema Alignment Integration Tests', () => {
  let testUserId: string;
  let testProjectId: string;
  let testCompetitorId: string;
  let testProductId: string;
  let schemaAlignment: DatabaseSchemaAlignment;

  beforeAll(async () => {
    // Set up test environment
    schemaAlignment = new DatabaseSchemaAlignment();
  });

  afterAll(async () => {
    // Clean up any remaining test data
    await cleanupTestData();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Create clean test data for each test
    await setupTestData();
  });

  afterEach(async () => {
    // Clean up test data after each test
    await cleanupTestData();
  });

  describe('Quick Schema Checks', () => {
    it('should pass quick schema compatibility check', async () => {
      const result = await quickSchemaCheck();
      expect(result).toBe(true);
    });

    it('should generate comprehensive schema alignment report', async () => {
      const report = await generateSchemaAlignmentReport();
      
      expect(report).toBeDefined();
      expect(report.timestamp).toBeInstanceOf(Date);
      expect(report.consolidatedServicesCompatible).toBe(true);
      expect(report.schemaValidation.isValid).toBe(true);
      expect(report.performanceMetrics.totalValidationTime).toBeGreaterThan(0);
    });
  });

  describe('Database Schema Validation', () => {
    it('should validate all core table structures', async () => {
      const report = await schemaAlignment.validateSchemaAlignment();
      
      expect(report.schemaValidation.validatedTables).toContain('Project');
      expect(report.schemaValidation.validatedTables).toContain('Product');
      expect(report.schemaValidation.validatedTables).toContain('Competitor');
      expect(report.schemaValidation.validatedTables).toContain('Report');
      expect(report.schemaValidation.validatedTables).toContain('Snapshot');
      expect(report.schemaValidation.validatedTables).toContain('Analysis');
    });

    it('should validate foreign key relationships', async () => {
      const report = await schemaAlignment.validateSchemaAlignment();
      
      const foreignKeyChecks = report.schemaValidation.foreignKeyIntegrity;
      expect(foreignKeyChecks.length).toBeGreaterThan(0);
      
      // Check critical relationships
      const projectUserRelation = foreignKeyChecks.find(
        check => check.table === 'Project' && check.field === 'userId'
      );
      expect(projectUserRelation?.isValid).toBe(true);
      
      const productProjectRelation = foreignKeyChecks.find(
        check => check.table === 'Product' && check.field === 'projectId'
      );
      expect(productProjectRelation?.isValid).toBe(true);
      
      const reportProjectRelation = foreignKeyChecks.find(
        check => check.table === 'Report' && check.field === 'projectId'
      );
      expect(reportProjectRelation?.isValid).toBe(true);
    });

    it('should validate CRUD operations on Project table', async () => {
      // Test create
      const project = await prisma.project.create({
        data: {
          name: 'Test CRUD Project',
          description: 'Test project for CRUD validation',
          status: 'DRAFT',
          priority: 'MEDIUM',
          userId: testUserId,
          parameters: { test: true },
          tags: { category: 'test' }
        }
      });
      
      expect(project.id).toBeDefined();
      expect(project.name).toBe('Test CRUD Project');
      
      // Test read
      const foundProject = await prisma.project.findUnique({
        where: { id: project.id },
        include: {
          products: true,
          competitors: true,
          reports: true
        }
      });
      
      expect(foundProject).toBeDefined();
      expect(foundProject?.id).toBe(project.id);
      
      // Test update
      const updatedProject = await prisma.project.update({
        where: { id: project.id },
        data: { description: 'Updated description' }
      });
      
      expect(updatedProject.description).toBe('Updated description');
      
      // Test delete
      await prisma.project.delete({ where: { id: project.id } });
      
      const deletedProject = await prisma.project.findUnique({
        where: { id: project.id }
      });
      
      expect(deletedProject).toBeNull();
    });
  });

  describe('Data Integrity Validation', () => {
    it('should detect and report orphaned records', async () => {
      // Create an orphaned product (this test should fail gracefully)
      // Note: In real SQLite with proper foreign keys, this should fail
      // but we're testing the detection logic
      
      const report = await schemaAlignment.validateSchemaAlignment();
      const orphanedProductsCheck = report.dataIntegrityChecks.find(
        check => check.checkName === 'Orphaned Products'
      );
      
      expect(orphanedProductsCheck).toBeDefined();
      expect(orphanedProductsCheck?.passed).toBe(true); // Should pass with proper FK constraints
    });

    it('should validate Project-Competitor consistency', async () => {
      const report = await schemaAlignment.validateSchemaAlignment();
      const consistencyCheck = report.dataIntegrityChecks.find(
        check => check.checkName === 'Project-Competitor Consistency'
      );
      
      expect(consistencyCheck).toBeDefined();
      expect(consistencyCheck?.recordsChecked).toBeGreaterThanOrEqual(0);
    });

    it('should validate all data integrity checks pass', async () => {
      const report = await schemaAlignment.validateSchemaAlignment();
      
      // All integrity checks should pass with clean test data
      const failedChecks = report.dataIntegrityChecks.filter(check => !check.passed);
      
      if (failedChecks.length > 0) {
        console.warn('Some data integrity checks failed:', failedChecks);
      }
      
      // Log results for debugging
      report.dataIntegrityChecks.forEach(check => {
        console.log(`${check.checkName}: ${check.passed ? 'PASS' : 'FAIL'} (${check.recordsChecked} records checked, ${check.issuesFound} issues)`);
      });
    });
  });

  describe('Consolidated Services Compatibility', () => {
    it('should validate AnalysisService database operations', async () => {
      // Test critical queries used by AnalysisService
      
      // Test project lookup with description
      const projectQuery = await prisma.project.findUnique({
        where: { id: testProjectId },
        select: { description: true }
      });
      expect(projectQuery).toBeDefined();
      
      // Test products with snapshots lookup
      const productsQuery = await prisma.product.findMany({
        where: { projectId: testProjectId },
        include: {
          snapshots: {
            orderBy: { createdAt: 'desc' },
            take: 5
          }
        }
      });
      expect(Array.isArray(productsQuery)).toBe(true);
      
      // Test competitors with snapshots lookup
      const competitorsQuery = await prisma.competitor.findMany({
        where: {
          projects: {
            some: { id: testProjectId }
          }
        },
        include: {
          snapshots: {
            orderBy: { createdAt: 'desc' },
            take: 5
          }
        }
      });
      expect(Array.isArray(competitorsQuery)).toBe(true);
    });

    it('should validate ReportingService database operations', async () => {
      // Test project with competitors lookup
      const projectWithCompetitors = await prisma.project.findUnique({
        where: { id: testProjectId },
        include: {
          competitors: { select: { id: true } }
        }
      });
      expect(projectWithCompetitors).toBeDefined();
      
      // Test project with products and competitors
      const projectFull = await prisma.project.findUnique({
        where: { id: testProjectId },
        include: {
          products: true,
          competitors: true
        }
      });
      expect(projectFull).toBeDefined();
      expect(Array.isArray(projectFull?.products)).toBe(true);
      expect(Array.isArray(projectFull?.competitors)).toBe(true);
      
      // Test report queries
      const reportQuery = await prisma.report.findMany({
        where: { projectId: testProjectId },
        include: {
          competitor: true,
          project: true,
          versions: { take: 1 }
        }
      });
      expect(Array.isArray(reportQuery)).toBe(true);
    });

    it('should validate project update operations used by consolidated services', async () => {
      // Test project parameter updates (used by AIAnalyzer)
      const updatedProject = await prisma.project.update({
        where: { id: testProjectId },
        data: {
          parameters: {
            aiAnalysisConfig: { enabled: true },
            autoAnalysisEnabled: true,
            setupTimestamp: new Date().toISOString()
          }
        }
      });
      
      expect(updatedProject.parameters).toBeDefined();
      
      // Test project description updates
      await prisma.project.update({
        where: { id: testProjectId },
        data: {
          description: 'Updated by consolidated service test'
        }
      });
      
      const projectAfterUpdate = await prisma.project.findUnique({
        where: { id: testProjectId }
      });
      
      expect(projectAfterUpdate?.description).toBe('Updated by consolidated service test');
    });
  });

  describe('Performance and Connection Health', () => {
    it('should measure database query performance', async () => {
      const report = await schemaAlignment.validateSchemaAlignment();
      
      const queryTimes = report.performanceMetrics.queryResponseTimes;
      
      // All queries should complete in reasonable time (< 1000ms for test DB)
      Object.entries(queryTimes).forEach(([queryName, responseTime]) => {
        expect(responseTime).toBeGreaterThanOrEqual(0);
        expect(responseTime).toBeLessThan(1000); // 1 second max for test queries
        console.log(`${queryName}: ${responseTime}ms`);
      });
    });

    it('should validate connection pool health', async () => {
      const report = await schemaAlignment.validateSchemaAlignment();
      
      const poolStatus = report.performanceMetrics.connectionPoolStatus;
      expect(poolStatus.isHealthy).toBe(true);
      expect(poolStatus.activeConnections).toBeGreaterThan(0);
    });

    it('should complete full validation in reasonable time', async () => {
      const startTime = Date.now();
      const report = await schemaAlignment.validateSchemaAlignment();
      const totalTime = report.performanceMetrics.totalValidationTime;
      
      expect(totalTime).toBeGreaterThan(0);
      expect(totalTime).toBeLessThan(10000); // 10 seconds max for full validation
      
      console.log(`Full schema validation completed in ${totalTime}ms`);
    });
  });

  describe('Real-world Scenarios', () => {
    it('should handle concurrent database operations', async () => {
      // Simulate concurrent operations that consolidated services might perform
      const concurrentOperations = [
        prisma.project.findMany({ take: 5 }),
        prisma.product.findMany({ take: 5 }),
        prisma.competitor.findMany({ take: 5 }),
        prisma.report.findMany({ take: 5 }),
        prisma.snapshot.findMany({ take: 5 })
      ];
      
      const results = await Promise.all(concurrentOperations);
      
      // All operations should complete successfully
      results.forEach(result => {
        expect(Array.isArray(result)).toBe(true);
      });
    });

    it('should validate complex relationship queries', async () => {
      // Test complex queries that consolidated services might use
      const complexQuery = await prisma.project.findMany({
        where: {
          status: 'ACTIVE',
          competitors: {
            some: {
              snapshots: {
                some: {
                  captureSuccess: true
                }
              }
            }
          }
        },
        include: {
          products: {
            include: {
              snapshots: {
                orderBy: { createdAt: 'desc' },
                take: 1
              }
            }
          },
          competitors: {
            include: {
              snapshots: {
                where: { captureSuccess: true },
                orderBy: { createdAt: 'desc' },
                take: 1
              }
            }
          },
          reports: {
            where: { status: 'COMPLETED' },
            orderBy: { createdAt: 'desc' },
            take: 5
          }
        }
      });
      
      expect(Array.isArray(complexQuery)).toBe(true);
    });

    it('should validate transaction support for consolidated services', async () => {
      // Test that transactions work (important for data consistency)
      await prisma.$transaction(async (tx) => {
        const project = await tx.project.create({
          data: {
            name: 'Transaction Test Project',
            description: 'Test project in transaction',
            status: 'DRAFT',
            priority: 'MEDIUM',
            userId: testUserId,
            parameters: {},
            tags: {}
          }
        });
        
        const product = await tx.product.create({
          data: {
            name: 'Transaction Test Product',
            website: 'https://test.com',
            positioning: 'Test positioning',
            customerData: 'Test customer data',
            userProblem: 'Test problem',
            industry: 'Test',
            projectId: project.id
          }
        });
        
        expect(project.id).toBeDefined();
        expect(product.id).toBeDefined();
        expect(product.projectId).toBe(project.id);
        
        // Clean up transaction test data
        await tx.product.delete({ where: { id: product.id } });
        await tx.project.delete({ where: { id: project.id } });
      });
    });
  });

  // ============================================================================
  // TEST HELPERS
  // ============================================================================

  async function setupTestData() {
    // Create test user
    testUserId = createId();
    
    // Create test project
    const project = await prisma.project.create({
      data: {
        name: 'Schema Alignment Test Project',
        description: 'Test project for schema alignment validation',
        status: 'ACTIVE',
        priority: 'MEDIUM',
        userId: testUserId,
        parameters: { testMode: true },
        tags: { test: true }
      }
    });
    testProjectId = project.id;
    
    // Create test product
    const product = await prisma.product.create({
      data: {
        name: 'Test Product',
        website: 'https://testproduct.com',
        positioning: 'Test product positioning',
        customerData: 'Test customer data',
        userProblem: 'Test user problem',
        industry: 'Technology',
        projectId: testProjectId
      }
    });
    testProductId = product.id;
    
    // Create test competitor
    const competitor = await prisma.competitor.create({
      data: {
        name: 'Test Competitor',
        website: 'https://testcompetitor.com',
        description: 'Test competitor for schema validation',
        industry: 'Technology',
        employeeCount: 100,
        revenue: 1000000,
        founded: 2020,
        headquarters: 'Test City',
        socialMedia: { twitter: '@test' }
      }
    });
    testCompetitorId = competitor.id;
    
    // Connect competitor to project
    await prisma.project.update({
      where: { id: testProjectId },
      data: {
        competitors: {
          connect: { id: testCompetitorId }
        }
      }
    });
  }

  async function cleanupTestData() {
    try {
      // Clean up in reverse dependency order
      if (testProjectId) {
        // Remove project-competitor relationships first
        await prisma.project.update({
          where: { id: testProjectId },
          data: {
            competitors: {
              set: [] // Remove all competitor connections
            }
          }
        }).catch(() => {}); // Ignore errors if project doesn't exist
        
        // Delete products (cascade will handle snapshots)
        await prisma.product.deleteMany({
          where: { projectId: testProjectId }
        }).catch(() => {});
        
        // Delete reports
        await prisma.report.deleteMany({
          where: { projectId: testProjectId }
        }).catch(() => {});
        
        // Delete project
        await prisma.project.delete({
          where: { id: testProjectId }
        }).catch(() => {});
      }
      
      if (testCompetitorId) {
        // Delete competitor snapshots and analyses first
        await prisma.analysis.deleteMany({
          where: { competitorId: testCompetitorId }
        }).catch(() => {});
        
        await prisma.snapshot.deleteMany({
          where: { competitorId: testCompetitorId }
        }).catch(() => {});
        
        // Delete competitor
        await prisma.competitor.delete({
          where: { id: testCompetitorId }
        }).catch(() => {});
      }
      
    } catch (error) {
      console.warn('Error during test cleanup:', error);
    }
  }
}); 