/**
 * Test Retry Utilities
 * 
 * This module provides utilities for improving test stability by adding retry mechanisms
 * for flaky tests. It helps prevent CI failures caused by intermittent issues.
 */

import { logger } from '@/lib/logger';

/**
 * Configuration for test retry behavior
 */
export interface RetryConfig {
  maxRetries: number;        // Maximum number of retry attempts
  initialDelay: number;      // Initial delay before first retry (ms)
  maxDelay: number;          // Maximum delay between retries (ms)
  backoffFactor: number;     // Exponential backoff factor (default: 2)
  failOnFirstError?: boolean; // Whether to capture and log all errors (default: false)
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelay: 100,
  maxDelay: 2000,
  backoffFactor: 2
};

/**
 * Executes a test function with retry capability
 * 
 * @param testFn - The async test function to execute
 * @param config - Retry configuration
 * @param testName - Name of the test (for logging)
 * @returns Result of the test function
 * @throws The last error encountered if all retries fail
 */
export async function executeWithRetry<T>(
  testFn: () => Promise<T>, 
  config: Partial<RetryConfig> = {}, 
  testName = 'unnamed test'
): Promise<T> {
  const retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: Error | null = null;
  let delay = retryConfig.initialDelay;

  for (let attempt = 1; attempt <= retryConfig.maxRetries + 1; attempt++) {
    try {
      if (attempt > 1) {
        logger.info(`Retry attempt ${attempt - 1} of ${retryConfig.maxRetries} for "${testName}"`);
      }
      return await testFn();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt <= retryConfig.maxRetries) {
        if (!retryConfig.failOnFirstError) {
          logger.warn(
            `Test "${testName}" failed (attempt ${attempt}/${retryConfig.maxRetries + 1}): ${lastError.message}. Retrying in ${delay}ms...`
          );
        }
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, delay));
        
        // Calculate next delay with exponential backoff
        delay = Math.min(
          delay * retryConfig.backoffFactor,
          retryConfig.maxDelay
        );
      } else {
        logger.error(`Test "${testName}" failed after ${retryConfig.maxRetries} retries: ${lastError.message}`);
        throw lastError;
      }
    }
  }

  // This should never happen due to the throw in the last iteration
  throw new Error(`Unexpected retry logic failure in "${testName}"`);
}

/**
 * A Jest test wrapper that adds retry capability to test cases
 * 
 * @param testName - Name of the test
 * @param testFn - The test function to execute
 * @param config - Retry configuration
 * @returns A function that can be used with Jest's it/test
 * 
 * Example:
 * ```
 * retryTest('should handle flaky behavior', async () => {
 *   // your test logic here
 * }, { maxRetries: 2 });
 * ```
 */
export function retryTest(
  testName: string,
  testFn: () => Promise<void>,
  config: Partial<RetryConfig> = {}
): jest.ProvidesCallback {
  return async () => {
    await executeWithRetry(testFn, config, testName);
  };
}

/**
 * Creates a retry-enabled version of Jest's 'it' or 'test' function
 * 
 * @param jestTestFn - The original Jest test function (it or test)
 * @param config - Default retry configuration for all tests
 * @returns A function with the same signature as Jest's it/test but with retry capability
 * 
 * Example:
 * ```
 * const itWithRetry = createRetryTest(it, { maxRetries: 2 });
 * 
 * itWithRetry('should handle flaky API calls', async () => {
 *   // test that might be flaky
 * });
 * ```
 */
export function createRetryTest(
  jestTestFn: (name: string, fn: jest.ProvidesCallback, timeout?: number) => void,
  config: Partial<RetryConfig> = {}
): (name: string, fn: () => Promise<void>, timeout?: number, retryConfig?: Partial<RetryConfig>) => void {
  return (name, fn, timeout, retryConfig) => {
    const mergedConfig = { ...config, ...retryConfig };
    jestTestFn(
      name,
      retryTest(name, fn, mergedConfig),
      timeout
    );
  };
}

/**
 * Pre-configured retry-enabled versions of Jest's test functions
 */
export const itWithRetry = createRetryTest(it);
export const testWithRetry = createRetryTest(test); 