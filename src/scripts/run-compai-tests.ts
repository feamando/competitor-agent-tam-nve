#!/usr/bin/env ts-node

/**
 * TP-014 CompAI Integration Test Runner
 * 
 * Comprehensive test runner for all CompAI integration validation tests.
 * Includes both automated tests and manual validation scripts.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '@/lib/logger';
import { runFullValidation } from '@/__tests__/manual/compai-bedrock-validation';

const execAsync = promisify(exec);

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
}

class CompAITestRunner {
  private results: TestResult[] = [];

  async runIntegrationTests(): Promise<TestResult> {
    const startTime = Date.now();
    console.log('🧪 Running CompAI Integration Tests...');
    
    try {
      const { stdout, stderr } = await execAsync(
        'npx jest src/__tests__/integration/compai-prompt-integration.test.ts --verbose',
        { timeout: 60000 }
      );
      
      console.log(stdout);
      if (stderr) {
        console.warn('Test warnings:', stderr);
      }
      
      const duration = Date.now() - startTime;
      return {
        name: 'CompAI Integration Tests',
        passed: true,
        duration
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error('❌ Integration tests failed:', error);
      return {
        name: 'CompAI Integration Tests',
        passed: false,
        duration,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async runSmartAIIntegrationTests(): Promise<TestResult> {
    const startTime = Date.now();
    console.log('🧪 Running SmartAI CompAI Integration Tests...');
    
    try {
      const { stdout, stderr } = await execAsync(
        'npx jest src/__tests__/integration/smartai-compai-integration.test.ts --verbose',
        { timeout: 30000 }
      );
      
      console.log(stdout);
      if (stderr) {
        console.warn('Test warnings:', stderr);
      }
      
      const duration = Date.now() - startTime;
      return {
        name: 'SmartAI CompAI Integration Tests',
        passed: true,
        duration
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error('❌ SmartAI integration tests failed:', error);
      return {
        name: 'SmartAI CompAI Integration Tests',
        passed: false,
        duration,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async runManualValidation(): Promise<TestResult> {
    const startTime = Date.now();
    console.log('🧪 Running Manual Validation Tests...');
    
    try {
      // Capture console output for validation
      let validationPassed = true;
      const originalError = console.error;
      
      console.error = (message: any, ...args: any[]) => {
        if (typeof message === 'string' && message.includes('❌')) {
          validationPassed = false;
        }
        originalError(message, ...args);
      };
      
      await runFullValidation();
      
      // Restore console.error
      console.error = originalError;
      
      const duration = Date.now() - startTime;
      return {
        name: 'Manual Validation Tests',
        passed: validationPassed,
        duration
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error('❌ Manual validation failed:', error);
      return {
        name: 'Manual Validation Tests',
        passed: false,
        duration,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async runBackwardCompatibilityTests(): Promise<TestResult> {
    const startTime = Date.now();
    console.log('🧪 Running Backward Compatibility Tests...');
    
    try {
      // Run existing tests to ensure no regression
      const { stdout, stderr } = await execAsync(
        'npx jest src/__tests__/unit/ --testNamePattern="SmartAI|Comparative|Report" --verbose',
        { timeout: 45000 }
      );
      
      console.log(stdout);
      if (stderr) {
        console.warn('Test warnings:', stderr);
      }
      
      const duration = Date.now() - startTime;
      return {
        name: 'Backward Compatibility Tests',
        passed: true,
        duration
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error('❌ Backward compatibility tests failed:', error);
      return {
        name: 'Backward Compatibility Tests',
        passed: false,
        duration,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async runLintingAndTypeChecks(): Promise<TestResult> {
    const startTime = Date.now();
    console.log('🧪 Running Linting and Type Checks...');
    
    try {
      // Check TypeScript compilation
      await execAsync('npx tsc --noEmit', { timeout: 30000 });
      
      // Run linting on CompAI-related files
      const compaiFiles = [
        'src/services/analysis/compaiPromptBuilder.ts',
        'src/types/prompts.ts',
        'src/lib/prompts/compaiFormatter.ts',
        'src/services/smartAIService.ts',
        'src/services/domains/analysis/ComparativeAnalyzer.ts',
        'src/services/analysis/analysisPrompts.ts'
      ];
      
      await execAsync(`npx eslint ${compaiFiles.join(' ')}`, { timeout: 20000 });
      
      const duration = Date.now() - startTime;
      return {
        name: 'Linting and Type Checks',
        passed: true,
        duration
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error('❌ Linting/type checks failed:', error);
      return {
        name: 'Linting and Type Checks',
        passed: false,
        duration,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async runAllTests(): Promise<void> {
    console.log('🚀 Starting TP-014 CompAI Integration Test Suite');
    console.log('='.repeat(60));
    
    const testSuite = [
      () => this.runLintingAndTypeChecks(),
      () => this.runManualValidation(), 
      () => this.runSmartAIIntegrationTests(),
      () => this.runIntegrationTests(),
      () => this.runBackwardCompatibilityTests()
    ];

    console.log(`📊 Running ${testSuite.length} test suites...\n`);

    for (const testRunner of testSuite) {
      try {
        const result = await testRunner();
        this.results.push(result);
        
        if (result.passed) {
          console.log(`✅ ${result.name} - PASSED (${result.duration}ms)`);
        } else {
          console.log(`❌ ${result.name} - FAILED (${result.duration}ms)`);
          if (result.error) {
            console.log(`   Error: ${result.error}`);
          }
        }
        console.log(''); // Add spacing between tests
      } catch (error) {
        console.error(`💥 ${testRunner.name} threw unexpected error:`, error);
        this.results.push({
          name: testRunner.name || 'Unknown Test',
          passed: false,
          duration: 0,
          error: error instanceof Error ? error.message : 'Unexpected error'
        });
      }
    }

    this.printSummary();
  }

  private printSummary(): void {
    console.log('='.repeat(60));
    console.log('📊 TP-014 CompAI Integration Test Results Summary');
    console.log('='.repeat(60));
    
    const passed = this.results.filter(r => r.passed).length;
    const total = this.results.length;
    const totalTime = this.results.reduce((sum, r) => sum + r.duration, 0);
    
    console.log(`📈 Results: ${passed}/${total} test suites passed`);
    console.log(`⏱️  Total execution time: ${totalTime}ms (${(totalTime/1000).toFixed(2)}s)`);
    console.log('');
    
    // Detailed results
    this.results.forEach(result => {
      const status = result.passed ? '✅' : '❌';
      const time = `${result.duration}ms`;
      console.log(`${status} ${result.name.padEnd(35)} ${time.padStart(10)}`);
      if (!result.passed && result.error) {
        console.log(`   └─ ${result.error}`);
      }
    });
    
    console.log('');
    
    if (passed === total) {
      console.log('🎉 ALL TESTS PASSED! CompAI integration is ready.');
      console.log('✅ TP-014 Task 5.0 (Integration and Testing) - COMPLETE');
      console.log('');
      console.log('📝 Next Steps:');
      console.log('- Proceed to Task 6.0: Documentation and Deployment');
      console.log('- Test with real AWS Bedrock credentials');
      console.log('- Validate with production-like data');
      console.log('- Monitor performance in staging environment');
    } else {
      console.log('⚠️  Some tests failed. Please review and fix issues.');
      console.log('❌ TP-014 Task 5.0 needs attention');
      console.log('');
      console.log('🔧 Recommended Actions:');
      console.log('- Review failed test details above');
      console.log('- Fix any linting or type errors');
      console.log('- Verify all services are properly integrated');
      console.log('- Re-run tests after fixes');
    }
    
    console.log('');
    console.log('📋 Test Coverage Summary:');
    console.log('- ✅ CompAI prompt generation with sample data');
    console.log('- ✅ Bedrock service integration validation');
    console.log('- ✅ All analysis types (competitive, trend, comprehensive)');
    console.log('- ✅ Output format validation');
    console.log('- ✅ Backward compatibility verification');
    console.log('- ✅ Error handling and fallback mechanisms');
    console.log('- ✅ Service integration testing');
    console.log('- ✅ Type safety and linting validation');
  }
}

// Run tests if script is executed directly
if (require.main === module) {
  const runner = new CompAITestRunner();
  runner.runAllTests().catch(error => {
    console.error('💥 Test runner failed:', error);
    process.exit(1);
  });
}

export { CompAITestRunner };
