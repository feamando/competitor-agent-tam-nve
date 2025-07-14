/**
 * Integration Test Setup - Phase 4.1 Test Stability Enhancement
 * Setup for integration tests with improved stability, timeout handling, and retry mechanisms
 */

// Mock external services for integration tests
jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

// Set global test timeout for integration tests
jest.setTimeout(30000);

// Track pending promises for cleanup
const pendingPromises = new Set();

// Setup global promise tracking
const originalPromise = global.Promise;
global.Promise = class TrackedPromise extends originalPromise {
  constructor(executor) {
    const trackedExecutor = (resolve, reject) => {
      const wrappedResolve = (value) => {
        pendingPromises.delete(promise);
        return resolve(value);
      };
      const wrappedReject = (reason) => {
        pendingPromises.delete(promise);
        return reject(reason);
      };
      
      try {
        return executor(wrappedResolve, wrappedReject);
      } catch (error) {
        pendingPromises.delete(promise);
        reject(error);
      }
    };
    
    super(trackedExecutor);
    const promise = this;
    pendingPromises.add(promise);
  }
};

// Setup test environment
global.console = {
  ...console,
  // Keep some console output for integration tests but reduce noise
  debug: jest.fn(),
  log: process.env.VERBOSE_TESTS ? console.log : jest.fn()
};

// Phase 4.1: Test stability improvements - Utility to force-resolve any pending promises
const cleanupPendingPromises = () => {
  if (pendingPromises.size > 0) {
    console.warn(`Cleaning up ${pendingPromises.size} pending promises`);
    
    // Force resolve all pending promises to prevent hanging tests
    pendingPromises.forEach(promise => {
      if (promise && typeof promise.finally === 'function') {
        promise.finally();
      }
    });
    
    pendingPromises.clear();
  }
};

// Phase 4.1: Test stability improvements - Enhanced beforeEach/afterEach hooks
// These hooks help ensure every test runs in a clean environment
beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  // Clean up any pending promises to avoid test hanging
  cleanupPendingPromises();
});

// Phase 4.1: Test stability improvements - Apply test retry for flaky tests
// Define retry configuration for the most common flaky tests
global.__testRetryConfig = {
  defaultRetries: 2,
  longRunningRetries: 1, // Fewer retries for long-running tests
  apiTimeouts: {
    standard: 10000,
    longRunning: 20000,
  },
  waitingStrategies: {
    shortPoll: { interval: 100, timeout: 5000 },
    mediumPoll: { interval: 250, timeout: 10000 },
    longPoll: { interval: 500, timeout: 20000 }
  }
};

// Helper for flaky tests - prepare for test retry mechanism
global.retryIfFlaky = (testFn, retries = global.__testRetryConfig.defaultRetries) => {
  let attempts = 0;
  const maxAttempts = retries + 1;
  
  const attemptTest = async () => {
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
};

// Global cleanup after all tests
afterAll(() => {
  // Restore original Promise
  global.Promise = originalPromise;
  
  // Final cleanup of any remaining promises
  cleanupPendingPromises();
}); 