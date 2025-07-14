/**
 * Test Stability Demonstration - Phase 4.1 Implementation
 * 
 * This test file demonstrates the use of the enhanced test stability utilities
 * including retry mechanisms and improved waiting strategies.
 */

import { waitForApiResponse, waitForCondition } from '../utils/waitingStrategies';
import { TimeoutTracker, runTestWithTimeout } from '../utils/testCleanup';
import { executeWithRetry, retryTest } from '../utils/testRetry';

// Create a simple retry function since global.retryIfFlaky is not available in the test context
async function localRetryIfFlaky<T>(testFn: () => Promise<T>, retries = 2): Promise<T> {
  let attempts = 0;
  const maxAttempts = retries + 1;
  
  const attemptTest = async (): Promise<T> => {
    try {
      attempts++;
      return await testFn();
    } catch (error) {
      if (attempts < maxAttempts) {
        console.warn(`Test failed (attempt ${attempts}/${maxAttempts}), retrying...`);
        return attemptTest();
      }
      throw error;
    }
  };
  
  return attemptTest();
}

// Demo service that simulates flaky behavior
class FlakyDemoService {
  private successRate = 0.7; // 70% success rate
  private callCount = 0;

  // Simulates a flaky API call
  async callFlakyApi(forceSuccess = false): Promise<{ status: string; data?: any }> {
    this.callCount++;
    
    // Force success after a certain number of attempts
    const shouldSucceed = forceSuccess || Math.random() < this.successRate || this.callCount > 3;
    
    await new Promise(resolve => setTimeout(resolve, 100)); // Simulate network delay
    
    if (shouldSucceed) {
      return {
        status: 'success',
        data: { result: 'API call succeeded', attempt: this.callCount }
      };
    } else {
      throw new Error(`API call failed on attempt ${this.callCount}`);
    }
  }
  
  // Simulates an operation that sometimes times out
  async operationWithPotentialTimeout(forceTimeout = false): Promise<string> {
    // Always timeout if forceTimeout is true, but use a reasonable timeout value
    // that won't exceed our test timeout but is still longer than waitForApiResponse's timeout
    const delay = forceTimeout ? 2000 : 100;
    
    await new Promise(resolve => setTimeout(resolve, delay));
    return 'Operation completed successfully';
  }
  
  // Reset call counter for test isolation
  reset(): void {
    this.callCount = 0;
  }
}

describe('Phase 4.1: Test Stability Improvements Demo', () => {
  const flakyService = new FlakyDemoService();
  let timeoutTracker: TimeoutTracker;
  
  beforeEach(() => {
    flakyService.reset();
    timeoutTracker = new TimeoutTracker();
  });
  
  afterEach(() => {
    timeoutTracker.clearAll();
  });

  describe('Retry Mechanism', () => {
    it('should handle flaky tests with executeWithRetry helper', async () => {
      const result = await executeWithRetry(
        async () => flakyService.callFlakyApi(),
        { maxRetries: 3 },
        'flaky API call'
      );
      
      expect(result).toHaveProperty('status', 'success');
    });
    
    it('should handle flaky tests with local retry helper', async () => {
      const result = await localRetryIfFlaky(async () => {
        const response = await flakyService.callFlakyApi();
        expect(response.status).toBe('success');
        return response;
      });
      
      expect(result).toHaveProperty('status', 'success');
    });
  });

  describe('Waiting Strategies', () => {
    it('should wait for conditions to be true', async () => {
      let flag = false;
      
      // Set flag to true after a delay
      setTimeout(() => { flag = true; }, 500);
      
      await waitForCondition(
        () => flag,
        { timeout: 1000, tracker: timeoutTracker }
      );
      
      expect(flag).toBe(true);
    });
    
    it('should wait for API responses with validation', async () => {
      const response = await waitForApiResponse(
        () => flakyService.callFlakyApi(true),  // Force success
        (res) => res.status === 'success',
        { timeout: 1000, tracker: timeoutTracker }
      );
      
      expect(response).toHaveProperty('status', 'success');
    });
    
    it('should handle timeouts gracefully', async () => {
      // Use try-catch to test for timeout error
      let errorThrown = false;
      try {
        await waitForApiResponse(
          () => flakyService.operationWithPotentialTimeout(true), // Force timeout
          () => true,
          { timeout: 500, tracker: timeoutTracker } // Shorter timeout to ensure it times out
        );
      } catch (error) {
        errorThrown = true;
        expect((error as Error).message).toMatch(/timed out/);
      }

      // Verify the error was thrown
      expect(errorThrown).toBe(true);
    });
  });

  describe('Combined Approaches', () => {
    it('should combine retry with waiting strategies', async () => {
      let apiCallCount = 0;
      
      const result = await executeWithRetry(
        async () => {
          apiCallCount++;
          return await waitForApiResponse(
            () => flakyService.callFlakyApi(),
            (res) => res.status === 'success',
            { timeout: 1000, tracker: timeoutTracker }
          );
        },
        { maxRetries: 2 },
        'combined waiting and retry'
      );
      
      expect(result).toHaveProperty('status', 'success');
    });
    
    it('should wrap tests in runTestWithTimeout', async () => {
      const result = await runTestWithTimeout(
        async () => {
          // This test might be flaky, so we use retry mechanism
          return await executeWithRetry(
            () => flakyService.callFlakyApi(true), // Force success
            { maxRetries: 2 }
          );
        },
        2000,  // 2 second timeout
        'Demo test with timeout'
      );
      
      expect(result).toHaveProperty('status', 'success');
    });
  });
  
  // Example using the retryTest wrapper
  retryTest(
    'should demonstrate retryTest function',
    async () => {
      const result = await flakyService.callFlakyApi();
      expect(result.status).toBe('success');
    },
    { maxRetries: 2 }
  );
}); 