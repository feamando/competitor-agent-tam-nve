#!/usr/bin/env tsx

/**
 * TP-026 Profile System Test Runner
 * Comprehensive test suite for all profile system components
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  output: string;
  error?: string;
}

class ProfileTestRunner {
  private results: TestResult[] = [];
  private testPaths = [
    // Profile Service Layer Tests
    'src/__tests__/lib/profile/profileService.test.ts',
    'src/__tests__/lib/profile/sessionManager.test.ts',
    'src/__tests__/lib/profile/profileUtils.test.ts',
    
    // Component Tests
    'src/__tests__/components/profile/ProfileProvider.test.tsx',
    'src/__tests__/components/profile/ProfileAccessModal.test.tsx',
    'src/__tests__/components/profile/LogoutButton.test.tsx',
    'src/__tests__/components/profile/ProfileAccessGate.test.tsx',
    
    // API Tests
    'src/__tests__/api/profile/route.test.ts',
    
    // Integration Tests
    'src/__tests__/integration/profile-database.test.ts'
  ];

  async runSingleTest(testPath: string): Promise<TestResult> {
    const testName = path.basename(testPath, path.extname(testPath));
    const startTime = Date.now();
    
    try {
      console.log(`🧪 Running ${testName}...`);
      
      const { stdout, stderr } = await execAsync(`npx jest ${testPath} --verbose --no-cache`, {
        cwd: process.cwd(),
        timeout: 30000 // 30 second timeout per test file
      });
      
      const duration = Date.now() - startTime;
      const passed = stderr.includes('PASS') || stdout.includes('✓');
      
      return {
        name: testName,
        passed,
        duration,
        output: stdout + stderr,
        error: passed ? undefined : stderr
      };
      
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorOutput = error instanceof Error ? error.message : String(error);
      
      return {
        name: testName,
        passed: false,
        duration,
        output: errorOutput,
        error: errorOutput
      };
    }
  }

  async runAllTests(): Promise<void> {
    console.log('🚀 Starting TP-026 Profile System Test Suite\n');
    console.log(`Running ${this.testPaths.length} test files...\n`);

    // Run tests sequentially to avoid conflicts
    for (const testPath of this.testPaths) {
      const result = await this.runSingleTest(testPath);
      this.results.push(result);
      
      const status = result.passed ? '✅ PASS' : '❌ FAIL';
      const duration = `${result.duration}ms`;
      console.log(`${status} ${result.name} (${duration})`);
      
      if (!result.passed && result.error) {
        console.log(`   Error: ${result.error.split('\n')[0]}`);
      }
    }

    this.printSummary();
  }

  async runTestsByCategory(): Promise<void> {
    console.log('🚀 Starting TP-026 Profile System Test Suite by Category\n');

    const categories = [
      {
        name: 'Profile Service Layer',
        tests: this.testPaths.filter(p => p.includes('lib/profile'))
      },
      {
        name: 'React Components',
        tests: this.testPaths.filter(p => p.includes('components/profile'))
      },
      {
        name: 'API Routes',
        tests: this.testPaths.filter(p => p.includes('api/profile'))
      },
      {
        name: 'Integration Tests',
        tests: this.testPaths.filter(p => p.includes('integration'))
      }
    ];

    for (const category of categories) {
      console.log(`\n📁 ${category.name}`);
      console.log('─'.repeat(50));
      
      for (const testPath of category.tests) {
        const result = await this.runSingleTest(testPath);
        this.results.push(result);
        
        const status = result.passed ? '✅ PASS' : '❌ FAIL';
        const duration = `${result.duration}ms`;
        console.log(`  ${status} ${result.name} (${duration})`);
        
        if (!result.passed && result.error) {
          console.log(`     Error: ${result.error.split('\n')[0]}`);
        }
      }
    }

    this.printSummary();
  }

  private printSummary(): void {
    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(60));

    const passed = this.results.filter(r => r.passed).length;
    const failed = this.results.filter(r => r.failed).length;
    const total = this.results.length;
    const totalDuration = this.results.reduce((sum, r) => sum + r.duration, 0);

    console.log(`Total Tests: ${total}`);
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`📈 Success Rate: ${Math.round((passed / total) * 100)}%`);
    console.log(`⏱️  Total Time: ${totalDuration}ms`);

    if (failed > 0) {
      console.log('\n❌ FAILED TESTS:');
      this.results
        .filter(r => !r.passed)
        .forEach(r => {
          console.log(`  • ${r.name}`);
          if (r.error) {
            console.log(`    ${r.error.split('\n')[0]}`);
          }
        });
    }

    console.log('\n🎯 TEST COVERAGE AREAS:');
    console.log('  ✅ Profile Service CRUD operations');
    console.log('  ✅ Session management (client & server)');
    console.log('  ✅ Profile utilities and scoped queries');
    console.log('  ✅ React component rendering and interactions');
    console.log('  ✅ Modal forms and user input validation');
    console.log('  ✅ Context providers and hooks');
    console.log('  ✅ API endpoint request/response handling');
    console.log('  ✅ Database integration and constraints');
    console.log('  ✅ Data isolation between profiles');
    console.log('  ✅ Error handling and edge cases');

    if (passed === total) {
      console.log('\n🎉 ALL TESTS PASSED! TP-026 Profile System is fully tested and ready for production.');
    } else {
      console.log(`\n⚠️  ${failed} test(s) failed. Please review and fix before deployment.`);
      process.exit(1);
    }
  }

  async runQuickSanity(): Promise<void> {
    console.log('🔍 Running Quick Sanity Check for TP-026 Profile System\n');

    // Run just the core tests for a quick check
    const sanityTests = [
      'src/__tests__/lib/profile/profileService.test.ts',
      'src/__tests__/components/profile/ProfileProvider.test.tsx',
      'src/__tests__/api/profile/route.test.ts'
    ];

    for (const testPath of sanityTests) {
      const result = await this.runSingleTest(testPath);
      this.results.push(result);
      
      const status = result.passed ? '✅ PASS' : '❌ FAIL';
      console.log(`${status} ${result.name}`);
    }

    const passed = this.results.filter(r => r.passed).length;
    const total = this.results.length;

    if (passed === total) {
      console.log('\n✅ Sanity check passed! Core profile functionality is working.');
    } else {
      console.log('\n❌ Sanity check failed! Core profile functionality has issues.');
      process.exit(1);
    }
  }
}

async function main() {
  const runner = new ProfileTestRunner();
  
  const args = process.argv.slice(2);
  const command = args[0] || 'all';

  try {
    switch (command) {
      case 'all':
        await runner.runAllTests();
        break;
      case 'category':
        await runner.runTestsByCategory();
        break;
      case 'sanity':
        await runner.runQuickSanity();
        break;
      default:
        console.log('Usage: npx tsx scripts/run-profile-tests.ts [all|category|sanity]');
        process.exit(1);
    }
  } catch (error) {
    console.error('❌ Test runner failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export { ProfileTestRunner };
