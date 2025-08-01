#!/usr/bin/env node

/**
 * Process Missing Initial Reports Script - Task 5.4
 * 
 * This script identifies existing projects that are missing initial reports
 * and triggers their generation in a controlled, prioritized manner.
 * 
 * Key Functions:
 * - Task 5.4: Command-line interface for processing missing initial reports
 * - Flexible filtering and processing options
 * - Progress monitoring and detailed reporting
 * - Safe batch processing with error handling
 * - Dry run mode for testing
 * 
 * Usage Examples:
 * - npm run process:missing-reports
 * - node scripts/process-missing-initial-reports.ts --priority=high --dry-run
 * - node scripts/process-missing-initial-reports.ts --batch-size=5 --max-concurrent=2
 */

import { program } from 'commander';
import { 
  MissingInitialReportsProcessorService, 
  getMissingInitialReportsProcessorService,
  processMissingInitialReports 
} from '../src/services/MissingInitialReportsProcessorService';
import { logger } from '../src/lib/logger';

interface ScriptOptions {
  priority?: 'high' | 'medium' | 'low' | 'all';
  batchSize?: number;
  maxConcurrent?: number;
  minAge?: number;
  maxAge?: number;
  dryRun?: boolean;
  includeArchived?: boolean;
  status?: string[];
  continueOnError?: boolean;
  interactive?: boolean;
}

/**
 * Task 5.4: Main execution function
 */
async function main() {
  console.log('🔄 Missing Initial Reports Processor - Task 5.4');
  console.log('Processing existing projects without initial reports...\n');

  // Parse command line arguments
  program
    .name('process-missing-initial-reports')
    .description('Process missing initial reports for existing projects - Task 5.4')
    .version('1.0.0')
    .option('-p, --priority <priority>', 'Filter by priority: high, medium, low, or all', 'all')
    .option('-b, --batch-size <number>', 'Number of projects per batch', '10')
    .option('-c, --max-concurrent <number>', 'Maximum concurrent projects per batch', '3')
    .option('--min-age <days>', 'Minimum project age in days')
    .option('--max-age <days>', 'Maximum project age in days')
    .option('-d, --dry-run', 'Show what would be processed without actually processing')
    .option('--include-archived', 'Include archived projects in processing')
    .option('-s, --status <statuses...>', 'Filter by project status (ACTIVE, DRAFT, PAUSED, etc.)')
    .option('--continue-on-error', 'Continue processing even if some projects fail')
    .option('-i, --interactive', 'Interactive mode with confirmations')
    .parse();

  const options = program.opts() as ScriptOptions;

  try {
    // Validate and prepare processing options
    const processingOptions = await prepareProcessingOptions(options);

    // Show processing configuration
    displayProcessingConfiguration(processingOptions, options);

    // Interactive confirmation
    if (options.interactive && !options.dryRun) {
      const confirmed = await confirmProcessing();
      if (!confirmed) {
        console.log('❌ Processing cancelled by user.');
        process.exit(0);
      }
    }

    // Execute processing
    console.log('🚀 Starting missing initial reports processing...\n');
    const startTime = Date.now();

    const summary = await processMissingInitialReports(processingOptions);

    // Display results
    displayProcessingResults(summary, Date.now() - startTime);

    console.log('\n✅ Task 5.4 - Missing Initial Reports Processing Complete!');

    if (summary.projectsFailed > 0) {
      console.log(`⚠️  ${summary.projectsFailed} projects failed processing. Check logs for details.`);
    }

    if (summary.projectsSkipped > 0) {
      console.log(`ℹ️  ${summary.projectsSkipped} projects were skipped. See processing report for reasons.`);
    }

  } catch (error) {
    console.error('❌ Processing failed:', error);
    logger.error('Task 5.4 script execution failed', error as Error);
    process.exit(1);
  }
}

/**
 * Task 5.4: Prepare processing options from command line arguments
 */
async function prepareProcessingOptions(options: ScriptOptions): Promise<any> {
  const processingOptions: any = {
    batchSize: parseInt(options.batchSize?.toString() || '10'),
    maxConcurrentProjects: parseInt(options.maxConcurrent?.toString() || '3'),
    dryRun: options.dryRun || false,
    continueOnError: options.continueOnError || true,
    includeArchivedProjects: options.includeArchived || false
  };

  // Priority filter
  if (options.priority && options.priority !== 'all') {
    processingOptions.priorityFilter = options.priority;
  }

  // Age filter
  if (options.minAge || options.maxAge) {
    processingOptions.ageFilter = {};
    if (options.minAge) processingOptions.ageFilter.minDays = parseInt(options.minAge.toString());
    if (options.maxAge) processingOptions.ageFilter.maxDays = parseInt(options.maxAge.toString());
  }

  // Status filter
  if (options.status && options.status.length > 0) {
    processingOptions.statusFilter = options.status.map(s => s.toUpperCase());
  }

  return processingOptions;
}

/**
 * Task 5.4: Display processing configuration
 */
function displayProcessingConfiguration(processingOptions: any, scriptOptions: ScriptOptions): void {
  console.log('⚙️  Processing Configuration:');
  console.log(`   Priority Filter: ${scriptOptions.priority || 'all'}`);
  console.log(`   Batch Size: ${processingOptions.batchSize} projects`);
  console.log(`   Max Concurrent: ${processingOptions.maxConcurrentProjects} projects`);
  console.log(`   Dry Run: ${processingOptions.dryRun ? 'Yes' : 'No'}`);
  console.log(`   Include Archived: ${processingOptions.includeArchivedProjects ? 'Yes' : 'No'}`);
  console.log(`   Continue on Error: ${processingOptions.continueOnError ? 'Yes' : 'No'}`);
  
  if (processingOptions.ageFilter) {
    console.log(`   Age Filter: ${processingOptions.ageFilter.minDays || 0} - ${processingOptions.ageFilter.maxDays || '∞'} days`);
  }
  
  if (processingOptions.statusFilter) {
    console.log(`   Status Filter: ${processingOptions.statusFilter.join(', ')}`);
  }
  
  console.log('');
}

/**
 * Task 5.4: Interactive confirmation
 */
async function confirmProcessing(): Promise<boolean> {
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question('❓ Do you want to proceed with processing? (y/N): ', (answer: string) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

/**
 * Task 5.4: Display processing results
 */
function displayProcessingResults(summary: any, totalTime: number): void {
  console.log('\n📊 Processing Results Summary:');
  console.log(`   Total Projects Analyzed: ${summary.totalProjectsAnalyzed.toLocaleString()}`);
  console.log(`   Projects Missing Reports: ${summary.projectsMissingReports.toLocaleString()}`);
  console.log(`   Projects Processed: ${summary.projectsProcessed.toLocaleString()}`);
  console.log(`   ✅ Successful: ${summary.projectsSuccessful} (${summary.successRate}%)`);
  console.log(`   ❌ Failed: ${summary.projectsFailed}`);
  console.log(`   ⏭️  Skipped: ${summary.projectsSkipped}`);
  console.log(`   ⏱️  Total Time: ${Math.round(totalTime / 1000)} seconds`);
  console.log(`   📦 Batches Processed: ${summary.batchesProcessed}`);
  console.log(`   🔗 Correlation ID: ${summary.correlationId}`);

  // Performance metrics
  if (summary.projectsProcessed > 0) {
    const avgTimePerProject = Math.round(summary.totalProcessingTime / summary.projectsProcessed);
    console.log(`   📈 Avg Time per Project: ${avgTimePerProject}ms`);
  }

  // Success rate assessment
  if (summary.successRate >= 90) {
    console.log('   🎉 Excellent success rate!');
  } else if (summary.successRate >= 70) {
    console.log('   👍 Good success rate.');
  } else if (summary.successRate >= 50) {
    console.log('   ⚠️  Moderate success rate - consider investigating failures.');
  } else {
    console.log('   🚨 Low success rate - investigate failures immediately.');
  }
}

/**
 * Task 5.4: Show help for common usage patterns
 */
function showUsageExamples(): void {
  console.log('\n📖 Usage Examples:');
  console.log('');
  console.log('1. Process all high-priority projects:');
  console.log('   node scripts/process-missing-initial-reports.ts --priority=high');
  console.log('');
  console.log('2. Dry run to see what would be processed:');
  console.log('   node scripts/process-missing-initial-reports.ts --dry-run');
  console.log('');
  console.log('3. Process recent projects (last 30 days):');
  console.log('   node scripts/process-missing-initial-reports.ts --max-age=30');
  console.log('');
  console.log('4. Small batches with low concurrency (safe mode):');
  console.log('   node scripts/process-missing-initial-reports.ts --batch-size=3 --max-concurrent=1');
  console.log('');
  console.log('5. Process only active projects:');
  console.log('   node scripts/process-missing-initial-reports.ts --status ACTIVE');
  console.log('');
  console.log('6. Interactive mode with confirmation:');
  console.log('   node scripts/process-missing-initial-reports.ts --interactive');
  console.log('');
}

/**
 * Task 5.4: Handle process monitoring
 */
async function monitorProcessing(): Promise<void> {
  const service = getMissingInitialReportsProcessorService();
  
  const checkStatus = async () => {
    const status = await service.getProcessingStatus();
    if (status.isProcessing) {
      console.log(`⏳ Processing... Batches completed: ${status.batchesProcessed}`);
      setTimeout(checkStatus, 10000); // Check every 10 seconds
    }
  };

  await checkStatus();
}

// Show usage examples if help requested
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  showUsageExamples();
  process.exit(0);
}

// Run the main function if this script is executed directly
if (require.main === module) {
  main().catch(console.error);
}

export { main }; 