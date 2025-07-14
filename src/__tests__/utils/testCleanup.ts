/**
 * Phase 5.3: Test Cleanup Utilities
 * Handles proper resource cleanup to prevent worker process issues
 */

import { logger } from '@/lib/logger';

class TestCleanupManager {
  private static instance: TestCleanupManager;
  private activeTimeouts: Set<NodeJS.Timeout> = new Set();
  private activeIntervals: Set<NodeJS.Timeout> = new Set();
  private activePromises: Set<Promise<any>> = new Set();
  private cleanupCallbacks: Set<() => Promise<void> | void> = new Set();

  static getInstance(): TestCleanupManager {
    if (!TestCleanupManager.instance) {
      TestCleanupManager.instance = new TestCleanupManager();
    }
    return TestCleanupManager.instance;
  }

  /**
   * Register a timeout for cleanup
   */
  registerTimeout(timeout: NodeJS.Timeout): NodeJS.Timeout {
    this.activeTimeouts.add(timeout);
    return timeout;
  }

  /**
   * Register an interval for cleanup
   */
  registerInterval(interval: NodeJS.Timeout): NodeJS.Timeout {
    this.activeIntervals.add(interval);
    return interval;
  }

  /**
   * Register a promise to wait for completion
   */
  registerPromise<T>(promise: Promise<T>): Promise<T> {
    this.activePromises.add(promise);
    promise.finally(() => {
      this.activePromises.delete(promise);
    });
    return promise;
  }

  /**
   * Register a cleanup callback
   */
  registerCleanup(callback: () => Promise<void> | void): void {
    this.cleanupCallbacks.add(callback);
  }

  /**
   * Clean up all active resources
   */
  async cleanup(): Promise<void> {
    try {
      // Clear all active timeouts
      for (const timeout of this.activeTimeouts) {
        clearTimeout(timeout);
      }
      this.activeTimeouts.clear();

      // Clear all active intervals
      for (const interval of this.activeIntervals) {
        clearInterval(interval);
      }
      this.activeIntervals.clear();

      // Wait for active promises to complete (with timeout)
      if (this.activePromises.size > 0) {
        await Promise.race([
          Promise.allSettled(Array.from(this.activePromises)),
          new Promise(resolve => setTimeout(resolve, 5000)) // 5 second timeout
        ]);
        this.activePromises.clear();
      }

      // Execute cleanup callbacks
      for (const callback of this.cleanupCallbacks) {
        try {
          await callback();
        } catch (error) {
          logger.error('Error in cleanup callback', error as Error);
        }
      }
      this.cleanupCallbacks.clear();

    } catch (error) {
      logger.error('Error during test cleanup', error as Error);
    }
  }

  /**
   * Reset the cleanup manager state
   */
  reset(): void {
    this.activeTimeouts.clear();
    this.activeIntervals.clear();
    this.activePromises.clear();
    this.cleanupCallbacks.clear();
  }
}

export const testCleanup = TestCleanupManager.getInstance();

/**
 * Enhanced setTimeout that automatically registers for cleanup
 */
export const managedSetTimeout = (callback: () => void, delay: number): NodeJS.Timeout => {
  const timeout = setTimeout(callback, delay);
  return testCleanup.registerTimeout(timeout);
};

/**
 * Enhanced setInterval that automatically registers for cleanup
 */
export const managedSetInterval = (callback: () => void, delay: number): NodeJS.Timeout => {
  const interval = setInterval(callback, delay);
  return testCleanup.registerInterval(interval);
};

/**
 * Enhanced Promise wrapper that automatically registers for cleanup
 */
export const managedPromise = <T>(promise: Promise<T>): Promise<T> => {
  return testCleanup.registerPromise(promise);
};

/**
 * Setup function to be called in beforeEach
 */
export const setupTestCleanup = (): void => {
  testCleanup.reset();
};

/**
 * Teardown function to be called in afterEach
 */
export const teardownTestCleanup = async (): Promise<void> => {
  await testCleanup.cleanup();
};

/**
 * Jest setup hook - DISABLED: This was causing "Cannot add a hook after tests have started running" errors
 * Individual test files should call setupTestCleanup() and teardownTestCleanup() directly in their hooks
 */
// export const setupTestEnvironment = (): void => {
//   beforeEach(() => {
//     setupTestCleanup();
//   });

//   afterEach(async () => {
//     await teardownTestCleanup();
//   });

//   afterAll(async () => {
//     await teardownTestCleanup();
//   });
// };

/**
 * Test Cleanup Utilities
 * Helper functions for ensuring test stability and handling timeouts
 */

/**
 * Tracks timeouts for cleanup in tests
 */
export class TimeoutTracker {
  private timeouts: NodeJS.Timeout[] = [];

  /**
   * Creates a timeout and tracks it for cleanup
   * @param callback Function to execute when timeout completes
   * @param ms Milliseconds to wait
   * @returns Timeout object
   */
  setTimeout(callback: () => void, ms: number): NodeJS.Timeout {
    const timeout = setTimeout(callback, ms);
    this.timeouts.push(timeout);
    return timeout;
  }

  /**
   * Clears all tracked timeouts
   */
  clearAll(): void {
    if (this.timeouts.length > 0) {
      logger.debug(`Cleaning up ${this.timeouts.length} timeouts`);
      
      this.timeouts.forEach((timeout) => {
        clearTimeout(timeout);
      });
      
      this.timeouts = [];
    }
  }
}

/**
 * Creates a promise that rejects after a specified timeout
 * @param ms Milliseconds until timeout
 * @param tracker Optional TimeoutTracker to use
 * @returns Promise that rejects after timeout
 */
export function createTimeoutPromise(ms: number, message: string, tracker?: TimeoutTracker): Promise<never> {
  return new Promise<never>((_, reject) => {
    const createTimeout = tracker 
      ? (cb: () => void, time: number) => tracker.setTimeout(cb, time)
      : setTimeout;
      
    createTimeout(() => {
      reject(new Error(`Test timed out after ${ms}ms: ${message}`));
    }, ms);
  });
}

/**
 * Runs a test function with a timeout
 * @param testFn The test function to run
 * @param timeoutMs Milliseconds before timeout
 * @param timeoutMessage Message for timeout error
 * @returns Promise resolving to the test function result
 */
export async function runTestWithTimeout<T>(
  testFn: () => Promise<T>, 
  timeoutMs: number,
  timeoutMessage: string
): Promise<T> {
  const tracker = new TimeoutTracker();
  
  try {
    const timeoutPromise = createTimeoutPromise(timeoutMs, timeoutMessage, tracker);
    return await Promise.race([testFn(), timeoutPromise]);
  } finally {
    tracker.clearAll();
  }
}

/**
 * Runs multiple async tasks in parallel with a timeout
 * @param tasks Array of async functions to execute
 * @param timeoutMs Milliseconds before timeout 
 * @param timeoutMessage Message for timeout error
 * @returns Promise resolving to an array of task results
 */
export async function runTasksWithTimeout<T>(
  tasks: Array<() => Promise<T>>,
  timeoutMs: number,
  timeoutMessage: string
): Promise<T[]> {
  const tracker = new TimeoutTracker();
  
  try {
    const timeoutPromise = createTimeoutPromise(timeoutMs, timeoutMessage, tracker);
    const taskPromises = tasks.map(task => task());
    
    // Add the timeout promise to fail if any task takes too long
    const allPromises = [...taskPromises, timeoutPromise.then(() => {
      throw new Error(`Tasks timed out after ${timeoutMs}ms: ${timeoutMessage}`);
    })];
    
    return await Promise.all(allPromises.slice(0, -1));
  } finally {
    tracker.clearAll();
  }
} 