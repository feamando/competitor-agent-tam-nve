/**
 * Enhanced Waiting Strategies for E2E and Integration Tests
 * 
 * This module provides improved waiting strategies to make tests more stable by
 * properly handling asynchronous operations, UI rendering, and state changes.
 */

import { TimeoutTracker } from './testCleanup';

/**
 * Configuration for waiting strategy
 */
export interface WaitOptions {
  timeout?: number;        // Maximum time to wait in milliseconds
  interval?: number;       // Polling interval in milliseconds  
  timeoutMessage?: string; // Custom message for timeout errors
  tracker?: TimeoutTracker; // Optional timeout tracker for cleanup
}

/**
 * Default wait options
 */
export const DEFAULT_WAIT_OPTIONS: WaitOptions = {
  timeout: 5000,
  interval: 100,
  timeoutMessage: 'Waiting condition timed out'
};

/**
 * Wait for a condition to be true
 * 
 * @param condition - Function that returns true when condition is met
 * @param options - Wait configuration options
 * @returns Promise that resolves when condition is met or rejects on timeout
 */
export async function waitForCondition(
  condition: () => boolean | Promise<boolean>,
  options: WaitOptions = {}
): Promise<void> {
  const { timeout, interval, timeoutMessage, tracker } = {
    ...DEFAULT_WAIT_OPTIONS,
    ...options
  };

  const startTime = Date.now();
  const endTime = startTime + (timeout || 0);

  // Create timeout tracking function
  const createTimeout = tracker 
    ? (cb: () => void, time: number) => tracker.setTimeout(cb, time)
    : setTimeout;

  while (Date.now() < endTime) {
    try {
      const result = await Promise.resolve(condition());
      
      if (result) {
        return;
      }
      
      // Wait before checking condition again
      await new Promise<void>(resolve => createTimeout(() => resolve(), interval || DEFAULT_WAIT_OPTIONS.interval || 100));
    } catch (error) {
      // If condition check throws, wait and retry
      await new Promise<void>(resolve => createTimeout(() => resolve(), interval || DEFAULT_WAIT_OPTIONS.interval || 100));
    }
  }

  throw new Error(
    timeoutMessage || 
    `Condition not met within ${timeout}ms timeout`
  );
}

/**
 * Wait for an element to meet a specific state condition
 * 
 * @param elementFn - Function that returns the element to check
 * @param stateFn - Function that checks if element meets desired state
 * @param options - Wait configuration options
 * @returns Promise that resolves when element meets condition or rejects on timeout
 */
export async function waitForElementState<T>(
  elementFn: () => T | null | undefined,
  stateFn: (element: T) => boolean | Promise<boolean>,
  options: WaitOptions = {}
): Promise<T> {
  await waitForCondition(async () => {
    const element = elementFn();
    if (!element) return false;
    return await Promise.resolve(stateFn(element));
  }, options);
  
  const element = elementFn();
  if (!element) {
    throw new Error(
      options.timeoutMessage || 
      'Element became unavailable after meeting condition'
    );
  }
  
  return element;
}

/**
 * Wait for a specific amount of time (use sparingly)
 * 
 * @param ms - Time to wait in milliseconds
 * @param tracker - Optional timeout tracker for cleanup
 * @returns Promise that resolves after specified time
 */
export async function waitForTime(
  ms: number, 
  tracker?: TimeoutTracker
): Promise<void> {
  const createTimeout = tracker 
    ? (cb: () => void, time: number) => tracker.setTimeout(cb, time)
    : setTimeout;
    
  await new Promise<void>(resolve => createTimeout(() => resolve(), ms));
}

/**
 * Wait for an API response
 * 
 * @param apiCall - Function that makes the API call
 * @param validationFn - Function that validates the response
 * @param options - Wait configuration options
 * @returns Promise that resolves with the API response
 */
export async function waitForApiResponse<T>(
  apiCall: () => Promise<T>,
  validationFn: (response: T) => boolean | Promise<boolean>,
  options: WaitOptions = {}
): Promise<T> {
  const { timeout, timeoutMessage } = {
    ...DEFAULT_WAIT_OPTIONS,
    timeout: 10000, // Default to longer timeout for API calls
    ...options
  };

  const startTime = Date.now();
  let lastResponse: T | null = null;

  // Create a timeout promise that will reject if the time limit is exceeded
  const timeoutPromise = new Promise<never>((_, reject) => {
    const timer = options.tracker
      ? options.tracker.setTimeout(
          () => reject(new Error(`API response validation timed out after ${timeout}ms`)),
          timeout || DEFAULT_WAIT_OPTIONS.timeout || 5000
        )
      : setTimeout(
          () => reject(new Error(`API response validation timed out after ${timeout}ms`)),
          timeout || DEFAULT_WAIT_OPTIONS.timeout || 5000
        );
  });

  // Create the polling promise
  const pollingPromise = (async () => {
    while (Date.now() - startTime < (timeout || DEFAULT_WAIT_OPTIONS.timeout || 5000)) {
      try {
        const response = await apiCall();
        lastResponse = response;
        
        if (await Promise.resolve(validationFn(response))) {
          return response;
        }
        
        // Wait before retrying
        await waitForTime(options.interval || DEFAULT_WAIT_OPTIONS.interval || 100, options.tracker);
      } catch (error) {
        // If API call throws, wait and retry
        await waitForTime(options.interval || DEFAULT_WAIT_OPTIONS.interval || 100, options.tracker);
      }
    }
    
    throw new Error(
      timeoutMessage || 
      `API response validation timed out after ${timeout}ms` + 
      (lastResponse ? ` with response: ${JSON.stringify(lastResponse)}` : '')
    );
  })();

  // Race between the polling and the timeout
  return Promise.race([pollingPromise, timeoutPromise]);
} 