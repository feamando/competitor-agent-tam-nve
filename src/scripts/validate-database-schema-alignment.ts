#!/usr/bin/env node

/**
 * Database Schema Alignment Validation Script - Task 7.4
 * 
 * Validates that consolidated Analysis and Reporting services work correctly
 * with the existing database schema, foreign key relationships, and data integrity.
 * 
 * Usage: npm run validate:db-schema
 */

import { prisma } from '@/lib/prisma';
import { 
  DatabaseSchemaAlignment, 
  quickSchemaCheck, 
  generateSchemaAlignmentReport,
  type DatabaseIntegrityReport 
} from '@/lib/database/schemaAlignment';
import { logger } from '@/lib/logger';

async function main() {
  console.log('🔍 Starting Database Schema Alignment Validation...\n');
  
  try {
    // 1. Quick schema check
    console.log('1️⃣  Running quick schema compatibility check...');
    const quickCheck = await quickSchemaCheck();
    
    if (quickCheck) {
      console.log('✅ Quick schema check: PASSED');
    } else {
      console.log('❌ Quick schema check: FAILED');
      console.log('⚠️  Proceeding with detailed analysis...\n');
    }
    
    // 2. Comprehensive schema alignment report
    console.log('2️⃣  Generating comprehensive schema alignment report...');
    const report = await generateSchemaAlignmentReport();
    
    // 3. Display results
    displayReport(report);
    
    // 4. Test actual service operations
    console.log('3️⃣  Testing consolidated service database operations...');
    await testConsolidatedServiceOperations();
    
    // 5. Final summary
    console.log('\n🎉 Database Schema Alignment Validation Complete!');
    
    if (report.consolidatedServicesCompatible && report.schemaValidation.isValid) {
      console.log('✅ All validations PASSED - Database is ready for consolidated services');
      process.exit(0);
    } else {
      console.log('❌ Some validations FAILED - Please review the issues above');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('💥 Validation script failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

function displayReport(report: DatabaseIntegrityReport) {
  console.log('\n📊 Database Schema Alignment Report');
  console.log('='.repeat(50));
  console.log(`⏰ Timestamp: ${report.timestamp.toISOString()}`);
  console.log(`⚡ Total Validation Time: ${report.performanceMetrics.totalValidationTime}ms`);
  console.log(`🔗 Consolidated Services Compatible: ${report.consolidatedServicesCompatible ? '✅ YES' : '❌ NO'}`);
  console.log(`📋 Schema Valid: ${report.schemaValidation.isValid ? '✅ YES' : '❌ NO'}`);
  
  // Schema validation details
  console.log('\n📋 Schema Validation Details:');
  console.log(`📊 Tables Validated: ${report.schemaValidation.validatedTables.length}`);
  report.schemaValidation.validatedTables.forEach(table => {
    console.log(`  ✅ ${table}`);
  });
  
  if (report.schemaValidation.errors.length > 0) {
    console.log('\n❌ Schema Errors:');
    report.schemaValidation.errors.forEach(error => {
      console.log(`  🚨 ${error}`);
    });
  }
  
  if (report.schemaValidation.warnings.length > 0) {
    console.log('\n⚠️  Schema Warnings:');
    report.schemaValidation.warnings.forEach(warning => {
      console.log(`  ⚠️  ${warning}`);
    });
  }
  
  // Foreign key integrity
  console.log('\n🔗 Foreign Key Relationships:');
  const validFKs = report.schemaValidation.foreignKeyIntegrity.filter(fk => fk.isValid);
  const invalidFKs = report.schemaValidation.foreignKeyIntegrity.filter(fk => !fk.isValid);
  
  console.log(`✅ Valid: ${validFKs.length}`);
  validFKs.forEach(fk => {
    console.log(`  ✅ ${fk.table}.${fk.field} → ${fk.referencedTable}.${fk.referencedField}`);
  });
  
  if (invalidFKs.length > 0) {
    console.log(`❌ Invalid: ${invalidFKs.length}`);
    invalidFKs.forEach(fk => {
      console.log(`  ❌ ${fk.table}.${fk.field} → ${fk.referencedTable}.${fk.referencedField}`);
      if (fk.errorMessage) {
        console.log(`     Error: ${fk.errorMessage}`);
      }
    });
  }
  
  // Data integrity checks
  console.log('\n🔍 Data Integrity Checks:');
  const passedChecks = report.dataIntegrityChecks.filter(check => check.passed);
  const failedChecks = report.dataIntegrityChecks.filter(check => !check.passed);
  
  console.log(`✅ Passed: ${passedChecks.length}`);
  passedChecks.forEach(check => {
    console.log(`  ✅ ${check.checkName} (${check.recordsChecked} records checked)`);
  });
  
  if (failedChecks.length > 0) {
    console.log(`❌ Failed: ${failedChecks.length}`);
    failedChecks.forEach(check => {
      console.log(`  ❌ ${check.checkName} (${check.issuesFound} issues in ${check.recordsChecked} records)`);
      if (check.details) {
        console.log(`     Details: ${check.details}`);
      }
    });
  }
  
  // Performance metrics
  console.log('\n⚡ Performance Metrics:');
  console.log(`🔗 Connection Pool: ${report.performanceMetrics.connectionPoolStatus.isHealthy ? '✅ Healthy' : '❌ Unhealthy'}`);
  console.log(`📊 Active Connections: ${report.performanceMetrics.connectionPoolStatus.activeConnections}`);
  console.log(`🔍 Total Checks Completed: ${report.performanceMetrics.totalChecksCompleted}`);
  
  console.log('\n📈 Query Response Times:');
  Object.entries(report.performanceMetrics.queryResponseTimes).forEach(([query, time]) => {
    const status = time >= 0 ? (time < 100 ? '🟢' : time < 500 ? '🟡' : '🔴') : '❌';
    console.log(`  ${status} ${query}: ${time >= 0 ? `${time}ms` : 'FAILED'}`);
  });
}

async function testConsolidatedServiceOperations() {
  console.log('\n🧪 Testing Consolidated Service Database Operations...');
  
  try {
    // Test critical database patterns used by consolidated services
    
    // Test 1: Project-based queries (used by both services)
    console.log('  🔍 Testing project-based queries...');
    const projectTest = await prisma.project.findMany({
      take: 1,
      include: {
        products: {
          include: {
            snapshots: { take: 1 }
          }
        },
        competitors: {
          include: {
            snapshots: { take: 1 }
          }
        },
        reports: { take: 1 }
      }
    });
    console.log('    ✅ Project queries work correctly');
    
    // Test 2: Analysis-specific queries
    console.log('  🔍 Testing analysis-specific queries...');
    await prisma.product.findMany({
      where: { projectId: 'test-id' },
      include: {
        snapshots: {
          orderBy: { createdAt: 'desc' },
          take: 5
        }
      }
    });
    
    await prisma.competitor.findMany({
      where: {
        projects: {
          some: { id: 'test-id' }
        }
      },
      include: {
        snapshots: {
          orderBy: { createdAt: 'desc' },
          take: 5
        }
      }
    });
    console.log('    ✅ Analysis service queries work correctly');
    
    // Test 3: Reporting-specific queries
    console.log('  🔍 Testing reporting-specific queries...');
    await prisma.report.findMany({
      where: { projectId: 'test-id' },
      include: {
        competitor: true,
        project: true,
        versions: { take: 1 }
      }
    });
    console.log('    ✅ Reporting service queries work correctly');
    
    // Test 4: Complex relationship queries
    console.log('  🔍 Testing complex relationship queries...');
    await prisma.project.findMany({
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
        }
      }
    });
    console.log('    ✅ Complex relationship queries work correctly');
    
    // Test 5: Transaction support
    console.log('  🔍 Testing transaction support...');
    await prisma.$transaction(async (tx) => {
      await tx.project.findMany({ take: 1 });
      await tx.product.findMany({ take: 1 });
      await tx.competitor.findMany({ take: 1 });
    });
    console.log('    ✅ Transaction support works correctly');
    
    console.log('✅ All consolidated service database operations PASSED');
    
  } catch (error) {
    console.error('❌ Consolidated service database operations FAILED:', error);
    throw error;
  }
}

// Export for use in other scripts
export { main as validateDatabaseSchemaAlignment };

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
} 