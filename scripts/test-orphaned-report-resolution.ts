#!/usr/bin/env node

/**
 * Test Orphaned Report Resolution Script - Task 4.3 Demo
 * 
 * This script demonstrates and validates the Task 4.3 orphaned report resolution functionality.
 * It tests the resolution strategies and provides comprehensive reporting.
 * 
 * Usage: npm run test:orphaned-report-resolution
 */

import { OrphanedReportResolver, OrphanedReportInput } from '../src/services/OrphanedReportResolver';
import { PrismaClient } from '@prisma/client';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

async function main() {
  console.log('🧪 Testing Orphaned Report Resolution - Task 4.3');
  console.log('Demonstrating resolution strategies and validation...\n');

  const prisma = new PrismaClient();
  const resolver = new OrphanedReportResolver(prisma);

  try {
    // Step 1: Get sample orphaned reports from database
    console.log('1️⃣  Fetching orphaned reports for testing...');
    const orphanedReports = await prisma.report.findMany({
      where: {
        projectId: null
      },
      select: {
        id: true,
        name: true,
        competitorId: true,
        createdAt: true,
        updatedAt: true,
        status: true,
        reportType: true,
        title: true
      },
      take: 10 // Test with first 10 orphaned reports
    });

    if (orphanedReports.length === 0) {
      console.log('✅ No orphaned reports found - resolution testing not needed!');
      return;
    }

    console.log(`📊 Found ${orphanedReports.length} orphaned reports for testing\n`);

    // Step 2: Test resolution strategies
    console.log('2️⃣  Testing resolution strategies...');
    
    // Display available strategies
    const strategies = resolver.getAvailableStrategies();
    console.log('Available resolution strategies:');
    strategies.forEach((strategy, idx) => {
      console.log(`   ${idx + 1}. ${strategy.name}: ${strategy.description} (Priority: ${strategy.priority})`);
    });
    console.log('');

    // Step 3: Execute resolution
    console.log('3️⃣  Executing resolution process...');
    const testReports: OrphanedReportInput[] = orphanedReports.map(report => ({
      id: report.id,
      name: report.name,
      competitorId: report.competitorId,
      createdAt: report.createdAt,
      updatedAt: report.updatedAt,
      status: report.status,
      reportType: report.reportType,
      title: report.title || undefined
    }));

    const resolutionResults = await resolver.resolveOrphanedReports(testReports);

    // Step 4: Generate and display summary
    console.log('4️⃣  Analyzing resolution results...');
    const summary = resolver.generateResolutionSummary(resolutionResults);

    console.log('\n📈 Resolution Summary:');
    console.log(`   Total Reports Processed: ${summary.totalReports}`);
    console.log(`   Successfully Resolved: ${summary.resolved} (${Math.round((summary.resolved / summary.totalReports) * 100)}%)`);
    console.log(`   High Confidence: ${summary.highConfidence}`);
    console.log(`   Medium Confidence: ${summary.mediumConfidence}`);
    console.log(`   Low Confidence: ${summary.lowConfidence}`);
    console.log(`   Failed: ${summary.failed}`);
    console.log(`   Average Processing Time: ${summary.averageProcessingTime}ms`);

    console.log('\n🎯 Strategies Used:');
    Object.entries(summary.strategiesUsed).forEach(([strategy, count]) => {
      const percentage = Math.round((count / summary.totalReports) * 100);
      console.log(`   ${strategy}: ${count} reports (${percentage}%)`);
    });

    // Step 5: Show detailed results for first few reports
    console.log('\n🔍 Sample Resolution Details:');
    resolutionResults.slice(0, 5).forEach((result, idx) => {
      const status = result.resolvedProjectId ? '✅' : '❌';
      const confidence = result.confidence.toUpperCase();
      console.log(`   ${idx + 1}. ${status} Report ${result.reportId.substring(0, 8)}...`);
      console.log(`      Strategy: ${result.strategy}`);
      console.log(`      Confidence: ${confidence}`);
      console.log(`      Reasoning: ${result.reasoning}`);
      if (result.metadata.projectName) {
        console.log(`      Project: ${result.metadata.projectName}`);
      }
      if (result.metadata.competitorName) {
        console.log(`      Competitor: ${result.metadata.competitorName}`);
      }
      console.log(`      Validation: ${result.metadata.validationPassed ? 'PASSED' : 'FAILED'}`);
      console.log('');
    });

    // Step 6: Save detailed results
    console.log('5️⃣  Saving test results...');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const resultsDir = join(process.cwd(), 'reports', 'resolution-tests');
    await mkdir(resultsDir, { recursive: true });

    const resultsPath = join(resultsDir, `resolution-test-${timestamp}.json`);
    const testReport = {
      timestamp: new Date().toISOString(),
      summary,
      strategies,
      resolutionResults,
      testConfiguration: {
        reportsProcessed: testReports.length,
        timeWindow: '24 hours',
        validationEnabled: true
      }
    };

    await writeFile(resultsPath, JSON.stringify(testReport, null, 2));

    // Step 7: Validation testing
    console.log('6️⃣  Testing validation logic...');
    const validationTests = resolutionResults.filter(r => r.resolvedProjectId !== null);
    let validationPassed = 0;
    let validationFailed = 0;

    for (const result of validationTests) {
      if (result.metadata.validationPassed) {
        validationPassed++;
      } else {
        validationFailed++;
        console.log(`   ⚠️  Validation failed for report ${result.reportId}: ${result.reasoning}`);
      }
    }

    console.log(`\n🔒 Validation Results:`);
    console.log(`   Passed: ${validationPassed}`);
    console.log(`   Failed: ${validationFailed}`);
    console.log(`   Success Rate: ${validationTests.length > 0 ? Math.round((validationPassed / validationTests.length) * 100) : 0}%`);

    // Step 8: Performance analysis
    console.log('\n⚡ Performance Analysis:');
    const processingTimes = resolutionResults
      .map(r => r.metadata.processingTimeMs)
      .filter(t => t > 0);
    
    if (processingTimes.length > 0) {
      const minTime = Math.min(...processingTimes);
      const maxTime = Math.max(...processingTimes);
      const avgTime = Math.round(processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length);
      
      console.log(`   Fastest Resolution: ${minTime}ms`);
      console.log(`   Slowest Resolution: ${maxTime}ms`);
      console.log(`   Average Resolution: ${avgTime}ms`);
    }

    console.log(`\n📋 Detailed test results saved to: ${resultsPath}`);
    console.log('🎉 Task 4.3 Resolution Testing Complete!');

    // Generate recommendations
    console.log('\n💡 Recommendations:');
    if (summary.resolved / summary.totalReports > 0.8) {
      console.log('   🟢 High resolution success rate - proceed with migration');
    } else if (summary.resolved / summary.totalReports > 0.6) {
      console.log('   🟡 Medium resolution success rate - review failed cases before migration');
    } else {
      console.log('   🔴 Low resolution success rate - manual intervention required');
    }

    if (summary.failed > 0) {
      console.log(`   ⚠️  ${summary.failed} reports failed resolution - investigate competitor associations`);
    }

    if (validationFailed > 0) {
      console.log(`   🔧 ${validationFailed} resolutions failed validation - check project-competitor relationships`);
    }

  } catch (error) {
    console.error('❌ Resolution testing failed:', error);
    process.exit(1);
  } finally {
    await resolver.cleanup();
    await prisma.$disconnect();
  }
}

// Run the test if this script is executed directly
if (require.main === module) {
  main().catch(console.error);
}

export { main }; 