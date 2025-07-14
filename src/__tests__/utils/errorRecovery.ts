/**
 * Phase 3.1: Test Error Recovery System
 * Advanced error handling, categorization, and recovery mechanisms for test reliability
 */

import { logger } from '@/lib/logger';

export interface ErrorCategory {
  type: 'infrastructure' | 'timeout' | 'assertion' | 'mock' | 'network' | 'data' | 'permission' | 'unknown';
  severity: 'low' | 'medium' | 'high' | 'critical';
  recoverable: boolean;
  description: string;
}

export interface RecoveryStrategy {
  name: string;
  canRecover: (error: Error, context: TestContext) => boolean;
  recover: (error: Error, context: TestContext) => Promise<RecoveryResult>;
  maxAttempts: number;
  backoffMs: number;
}

export interface TestContext {
  testName: string;
  testId: string;
  suite: string;
  attempt: number;
  maxAttempts: number;
  environment: string;
  startTime: number;
  metadata?: Record<string, any>;
}

export interface RecoveryResult {
  success: boolean;
  error?: Error;
  message: string;
  strategy: string;
  duration: number;
  recommendation?: string;
}

export interface ErrorAnalysis {
  category: ErrorCategory;
  rootCause?: string;
  stackTrace: string;
  frequency: number;
  trends: ErrorTrend[];
  recommendations: string[];
}

export interface ErrorTrend {
  pattern: string;
  count: number;
  firstSeen: Date;
  lastSeen: Date;
}

/**
 * Error categories with detailed classification
 */
export const ERROR_CATEGORIES: Record<string, ErrorCategory> = {
  TIMEOUT: {
    type: 'timeout',
    severity: 'medium',
    recoverable: true,
    description: 'Operation exceeded time limit'
  },
  NETWORK_ERROR: {
    type: 'network',
    severity: 'medium',
    recoverable: true,
    description: 'Network connectivity or HTTP request issues'
  },
  DATABASE_ERROR: {
    type: 'infrastructure',
    severity: 'high',
    recoverable: true,
    description: 'Database connection or query issues'
  },
  MOCK_ERROR: {
    type: 'mock',
    severity: 'low',
    recoverable: true,
    description: 'Mock setup or behavior issues'
  },
  ASSERTION_ERROR: {
    type: 'assertion',
    severity: 'low',
    recoverable: false,
    description: 'Test assertion failures - likely code issues'
  },
  PERMISSION_ERROR: {
    type: 'permission',
    severity: 'medium',
    recoverable: true,
    description: 'File system or access permission issues'
  },
  MEMORY_ERROR: {
    type: 'infrastructure',
    severity: 'high',
    recoverable: false,
    description: 'Out of memory or resource exhaustion'
  },
  UNKNOWN_ERROR: {
    type: 'unknown',
    severity: 'medium',
    recoverable: true,
    description: 'Unclassified error requiring investigation'
  }
};

/**
 * Advanced Error Classifier
 * Intelligently categorizes errors based on patterns and context
 */
export class ErrorClassifier {
  private patterns: Map<RegExp, string> = new Map();
  private frequencyTracker: Map<string, number> = new Map();
  private trendTracker: Map<string, ErrorTrend> = new Map();

  constructor() {
    this.initializePatterns();
  }

  private initializePatterns(): void {
    // Timeout patterns
    this.patterns.set(/timeout|timed out|exceeded.*time/i, 'TIMEOUT');
    this.patterns.set(/ECONNREFUSED|ENOTFOUND|ETIMEDOUT/i, 'NETWORK_ERROR');
    
    // Database patterns
    this.patterns.set(/database|prisma|sql|connection.*refused/i, 'DATABASE_ERROR');
    this.patterns.set(/ECONNREFUSED.*5432|ECONNREFUSED.*3306|ECONNREFUSED.*27017/i, 'DATABASE_ERROR');
    
    // Mock patterns
    this.patterns.set(/mock|jest\.fn|mockImplementation|mockReturnValue/i, 'MOCK_ERROR');
    this.patterns.set(/cannot read property.*of undefined.*mock/i, 'MOCK_ERROR');
    
    // Assertion patterns
    this.patterns.set(/expect|assertion|toBe|toEqual|toContain/i, 'ASSERTION_ERROR');
    this.patterns.set(/received.*expected/i, 'ASSERTION_ERROR');
    
    // Permission patterns
    this.patterns.set(/EACCES|EPERM|permission denied/i, 'PERMISSION_ERROR');
    this.patterns.set(/ENOENT.*no such file/i, 'PERMISSION_ERROR');
    
    // Memory patterns
    this.patterns.set(/out of memory|heap out of memory|maximum call stack/i, 'MEMORY_ERROR');
    this.patterns.set(/ENOMEM|allocation failed/i, 'MEMORY_ERROR');
  }

  /**
   * Classify an error into appropriate category
   */
  classify(error: Error, context?: TestContext): ErrorAnalysis {
    const categoryKey = this.findCategory(error);
    const category = ERROR_CATEGORIES[categoryKey] || ERROR_CATEGORIES.UNKNOWN_ERROR;
    
    // Track frequency
    const errorSignature = this.createErrorSignature(error);
    const frequency = this.trackFrequency(errorSignature);
    
    // Track trends
    const trends = this.trackTrend(errorSignature);
    
    // Analyze root cause
    const rootCause = this.analyzeRootCause(error, context);
    
    // Generate recommendations
    const recommendations = this.generateRecommendations(category, error, context);

    const analysis: ErrorAnalysis = {
      category,
      rootCause,
      stackTrace: error.stack || 'No stack trace available',
      frequency,
      trends: [trends],
      recommendations
    };

    logger.debug('Error classified', {
      errorMessage: error.message,
      category: categoryKey,
      frequency,
      testName: context?.testName,
      analysis
    });

    return analysis;
  }

  private findCategory(error: Error): string {
    const message = error.message || '';
    const stack = error.stack || '';
    const fullText = `${message} ${stack}`;

    for (const [pattern, category] of this.patterns) {
      if (pattern.test(fullText)) {
        return category;
      }
    }

    return 'UNKNOWN_ERROR';
  }

  private createErrorSignature(error: Error): string {
    // Create a normalized signature for tracking
    const message = error.message || 'Unknown error';
    const type = error.constructor.name;
    
    // Normalize dynamic parts (IDs, timestamps, etc.)
    const normalizedMessage = message
      .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/g, '[TIMESTAMP]')
      .replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, '[UUID]')
      .replace(/\d+/g, '[NUMBER]')
      .replace(/after \[NUMBER\]ms/, 'after [TIMEOUT]ms');
    
    return `${type}:${normalizedMessage}`;
  }

  private trackFrequency(signature: string): number {
    const current = this.frequencyTracker.get(signature) || 0;
    const newCount = current + 1;
    this.frequencyTracker.set(signature, newCount);
    return newCount;
  }

  private trackTrend(signature: string): ErrorTrend {
    const existing = this.trendTracker.get(signature);
    const now = new Date();
    
    if (existing) {
      existing.count++;
      existing.lastSeen = now;
      return existing;
    } else {
      const trend: ErrorTrend = {
        pattern: signature,
        count: 1,
        firstSeen: now,
        lastSeen: now
      };
      this.trendTracker.set(signature, trend);
      return trend;
    }
  }

  private analyzeRootCause(error: Error, context?: TestContext): string | undefined {
    const message = error.message || '';
    
    // Common root cause patterns
    if (message.includes('Cannot read property') && message.includes('undefined')) {
      return 'Accessing property of undefined object - likely missing mock or null check';
    }
    
    if (message.includes('timeout') && context?.attempt && context.attempt > 1) {
      return 'Repeated timeout failures - potentially slow environment or resource contention';
    }
    
    if (message.includes('ECONNREFUSED')) {
      return 'Service not running or network connectivity issue';
    }
    
    if (message.includes('expect') && message.includes('received')) {
      return 'Assertion failure - actual behavior differs from expected';
    }
    
    return undefined;
  }

  private generateRecommendations(
    category: ErrorCategory, 
    error: Error, 
    context?: TestContext
  ): string[] {
    const recommendations: string[] = [];

    switch (category.type) {
      case 'timeout':
        recommendations.push('Increase timeout duration for this operation');
        recommendations.push('Check for resource contention or slow environment');
        if (context?.attempt && context.attempt > 1) {
          recommendations.push('Consider splitting test into smaller units');
        }
        break;
        
      case 'network':
        recommendations.push('Verify service is running and accessible');
        recommendations.push('Check network connectivity');
        recommendations.push('Consider using mock for external dependencies');
        break;
        
      case 'infrastructure':
        recommendations.push('Verify database/service connectivity');
        recommendations.push('Check resource availability (memory, disk)');
        recommendations.push('Consider using lighter test fixtures');
        break;
        
      case 'mock':
        recommendations.push('Review mock setup and configuration');
        recommendations.push('Ensure mocks are properly reset between tests');
        recommendations.push('Verify mock return values match expected types');
        break;
        
      case 'assertion':
        recommendations.push('Review test logic and expectations');
        recommendations.push('Add debugging output to understand actual vs expected');
        recommendations.push('Check for race conditions or timing issues');
        break;
        
      case 'permission':
        recommendations.push('Check file/directory permissions');
        recommendations.push('Ensure test has necessary access rights');
        recommendations.push('Consider running with appropriate user context');
        break;
    }

    return recommendations;
  }

  /**
   * Get error frequency metrics
   */
  getFrequencyMetrics(): Array<{ signature: string; count: number }> {
    return Array.from(this.frequencyTracker.entries())
      .map(([signature, count]) => ({ signature, count }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Get error trend analysis
   */
  getTrendAnalysis(): ErrorTrend[] {
    return Array.from(this.trendTracker.values())
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Clear tracking data
   */
  clearTracking(): void {
    this.frequencyTracker.clear();
    this.trendTracker.clear();
  }
}

/**
 * Recovery Strategy Manager
 * Manages and executes recovery strategies for different error types
 */
export class RecoveryStrategyManager {
  private strategies: RecoveryStrategy[] = [];
  private classifier: ErrorClassifier;

  constructor() {
    this.classifier = new ErrorClassifier();
    this.initializeStrategies();
  }

  private initializeStrategies(): void {
    // Timeout recovery strategy
    this.strategies.push({
      name: 'timeout-retry',
      canRecover: (error: Error) => /timeout|timed out/i.test(error.message),
      recover: async (error: Error, context: TestContext) => {
        const startTime = Date.now();
        
        // Increase timeout for retry
        const newTimeout = Math.min(context.metadata?.timeout * 1.5 || 30000, 120000);
        
        logger.info(`Attempting timeout recovery for ${context.testName}`, {
          attempt: context.attempt,
          newTimeout,
          originalError: error.message
        });
        
        return {
          success: true,
          message: `Retry with increased timeout: ${newTimeout}ms`,
          strategy: 'timeout-retry',
          duration: Date.now() - startTime,
          recommendation: 'Consider optimizing the operation or increasing base timeout'
        };
      },
      maxAttempts: 3,
      backoffMs: 2000
    });

    // Network recovery strategy
    this.strategies.push({
      name: 'network-retry',
      canRecover: (error: Error) => /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|network/i.test(error.message),
      recover: async (error: Error, context: TestContext) => {
        const startTime = Date.now();
        
        // Wait for potential service recovery
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        logger.info(`Attempting network recovery for ${context.testName}`, {
          attempt: context.attempt,
          originalError: error.message
        });
        
        return {
          success: true,
          message: 'Retry after network delay',
          strategy: 'network-retry',
          duration: Date.now() - startTime,
          recommendation: 'Consider using mocks for external dependencies in tests'
        };
      },
      maxAttempts: 2,
      backoffMs: 5000
    });

    // Mock recovery strategy
    this.strategies.push({
      name: 'mock-reset',
      canRecover: (error: Error) => /mock|jest\.fn/i.test(error.message),
      recover: async (error: Error, context: TestContext) => {
        const startTime = Date.now();
        
        // Clear and reset all mocks
        jest.clearAllMocks();
        jest.resetAllMocks();
        
        logger.info(`Attempting mock recovery for ${context.testName}`, {
          attempt: context.attempt,
          originalError: error.message
        });
        
        return {
          success: true,
          message: 'Mocks cleared and reset',
          strategy: 'mock-reset',
          duration: Date.now() - startTime,
          recommendation: 'Review mock setup in beforeEach/afterEach hooks'
        };
      },
      maxAttempts: 2,
      backoffMs: 1000
    });

    // Resource cleanup recovery strategy
    this.strategies.push({
      name: 'resource-cleanup',
      canRecover: (error: Error) => /heap out of memory|ENOMEM|allocation failed/i.test(error.message),
      recover: async (error: Error, context: TestContext) => {
        const startTime = Date.now();
        
        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
        
        // Clear potential memory leaks
        jest.clearAllMocks();
        jest.clearAllTimers();
        
        logger.warn(`Attempting resource cleanup for ${context.testName}`, {
          attempt: context.attempt,
          originalError: error.message,
          memoryUsage: process.memoryUsage()
        });
        
        return {
          success: true,
          message: 'Resource cleanup performed',
          strategy: 'resource-cleanup',
          duration: Date.now() - startTime,
          recommendation: 'Review test for memory leaks and large object creation'
        };
      },
      maxAttempts: 1,
      backoffMs: 3000
    });
  }

  /**
   * Attempt to recover from an error
   */
  async attemptRecovery(error: Error, context: TestContext): Promise<RecoveryResult | null> {
    const analysis = this.classifier.classify(error, context);
    
    // Find applicable recovery strategies
    const applicableStrategies = this.strategies.filter(strategy => 
      strategy.canRecover(error, context) && context.attempt <= strategy.maxAttempts
    );

    if (applicableStrategies.length === 0) {
      logger.debug('No applicable recovery strategies found', {
        errorMessage: error.message,
        testName: context.testName,
        attempt: context.attempt
      });
      return null;
    }

    // Try the first applicable strategy
    const strategy = applicableStrategies[0];
    
    try {
      // Apply backoff delay
      if (context.attempt > 1) {
        await new Promise(resolve => setTimeout(resolve, strategy.backoffMs));
      }
      
      const result = await strategy.recover(error, context);
      
      logger.info('Recovery attempt completed', {
        testName: context.testName,
        strategyName: strategy.name,
        success: result.success,
        attempt: context.attempt,
        category: analysis.category.type
      });
      
      return result;
    } catch (recoveryError) {
      logger.error('Recovery strategy failed', recoveryError as Error, {
        testName: context.testName,
        strategyName: strategy.name,
        originalError: error.message,
        attempt: context.attempt
      });
      
      return {
        success: false,
        error: recoveryError as Error,
        message: `Recovery strategy ${strategy.name} failed`,
        strategy: strategy.name,
        duration: 0
      };
    }
  }

  /**
   * Add custom recovery strategy
   */
  addStrategy(strategy: RecoveryStrategy): void {
    this.strategies.push(strategy);
  }

  /**
   * Get all available strategies
   */
  getStrategies(): RecoveryStrategy[] {
    return [...this.strategies];
  }
}

/**
 * Test Error Recovery Wrapper
 * High-level wrapper for integrating error recovery into tests
 */
export class TestErrorRecovery {
  private recoveryManager: RecoveryStrategyManager;
  private classifier: ErrorClassifier;

  constructor() {
    this.recoveryManager = new RecoveryStrategyManager();
    this.classifier = new ErrorClassifier();
  }

  /**
   * Execute a test function with automatic error recovery
   */
  async executeWithRecovery<T>(
    testFn: () => Promise<T>,
    context: Partial<TestContext> = {}
  ): Promise<T> {
    const fullContext: TestContext = {
      testName: context.testName || 'unknown',
      testId: context.testId || 'unknown',
      suite: context.suite || 'unknown',
      attempt: 1,
      maxAttempts: context.maxAttempts || 3,
      environment: process.env.NODE_ENV || 'test',
      startTime: Date.now(),
      ...context
    };

    let lastError: Error;

    for (let attempt = 1; attempt <= fullContext.maxAttempts; attempt++) {
      fullContext.attempt = attempt;
      
      try {
        const result = await testFn();
        
        if (attempt > 1) {
          logger.info('Test succeeded after recovery', {
            testName: fullContext.testName,
            attempt,
            duration: Date.now() - fullContext.startTime
          });
        }
        
        return result;
      } catch (error) {
        lastError = error as Error;
        
        // Classify and analyze the error
        const analysis = this.classifier.classify(lastError, fullContext);
        
        // Log the error with analysis
        logger.warn(`Test attempt ${attempt} failed`, {
          testName: fullContext.testName,
          errorMessage: lastError.message,
          category: analysis.category.type,
          recoverable: analysis.category.recoverable,
          attempt
        });

        // If not recoverable or last attempt, throw
        if (!analysis.category.recoverable || attempt >= fullContext.maxAttempts) {
          break;
        }

        // Attempt recovery
        const recoveryResult = await this.recoveryManager.attemptRecovery(lastError, fullContext);
        
        if (!recoveryResult || !recoveryResult.success) {
          break;
        }
      }
    }

    // All attempts failed
    const finalAnalysis = this.classifier.classify(lastError, fullContext);
    
    logger.error('Test failed after all recovery attempts', lastError, {
      testName: fullContext.testName,
      attempts: fullContext.maxAttempts,
      category: finalAnalysis.category.type,
      recommendations: finalAnalysis.recommendations,
      duration: Date.now() - fullContext.startTime
    });

    throw lastError;
  }

  /**
   * Get error statistics and trends
   */
  getErrorMetrics(): {
    frequency: Array<{ signature: string; count: number }>;
    trends: ErrorTrend[];
  } {
    return {
      frequency: this.classifier.getFrequencyMetrics(),
      trends: this.classifier.getTrendAnalysis()
    };
  }

  /**
   * Clear error tracking data
   */
  clearMetrics(): void {
    this.classifier.clearTracking();
  }
}

/**
 * Global error recovery instance
 */
export const testErrorRecovery = new TestErrorRecovery();

/**
 * Utility function to wrap test functions with error recovery
 */
export function withErrorRecovery<T extends (...args: any[]) => Promise<any>>(
  testFn: T,
  testName: string,
  options: Partial<TestContext> = {}
): T {
  return (async (...args: any[]) => {
    return testErrorRecovery.executeWithRecovery(
      () => testFn(...args),
      { testName, ...options }
    );
  }) as T;
}

/**
 * Enhanced expect wrapper with error analysis
 */
export function expectWithAnalysis<T>(actual: T): jest.Matchers<void, T> {
  try {
    return expect(actual);
  } catch (error) {
    const classifier = new ErrorClassifier();
    const analysis = classifier.classify(error as Error);
    
    logger.debug('Assertion analysis', {
      category: analysis.category.type,
      recommendations: analysis.recommendations
    });
    
    throw error;
  }
} 