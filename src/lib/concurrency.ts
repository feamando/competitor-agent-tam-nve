/**
 * Concurrency Control Module
 * 
 * This module provides utilities for handling concurrent operations and preventing race conditions.
 * It includes a memory-based locking mechanism with future extensibility for Redis-based distributed locking.
 */

import { logger } from './logger';
import cacheService from './cache';

// Lock acquisition timeout
const DEFAULT_LOCK_TIMEOUT = 30000; // 30 seconds
const DEFAULT_RETRY_COUNT = 5;
const DEFAULT_RETRY_DELAY = 200; // ms
const DEFAULT_RETRY_JITTER = 100; // ms

/**
 * Lock options
 */
export interface LockOptions {
  timeout?: number;       // Lock acquisition timeout in ms
  retryCount?: number;    // Number of retry attempts
  retryDelay?: number;    // Base delay between retries in ms
  retryJitter?: number;   // Random jitter to add to delay
  owner?: string;         // Owner identifier for the lock
}

/**
 * In-memory lock manager
 */
class MemoryLockManager {
  private locks: Map<string, { owner: string; expiresAt: number }>;

  constructor() {
    this.locks = new Map();
  }

  /**
   * Acquire a lock
   * @param key Lock key
   * @param options Lock options
   * @returns Success flag and owner ID
   */
  async acquire(key: string, options: LockOptions = {}): Promise<{ success: boolean; owner: string }> {
    const now = Date.now();
    const timeout = options.timeout || DEFAULT_LOCK_TIMEOUT;
    const owner = options.owner || `lock_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    // Check if lock exists and is valid
    const existingLock = this.locks.get(key);
    
    if (existingLock && existingLock.expiresAt > now) {
      return { success: false, owner: existingLock.owner };
    }
    
    // Set lock with expiration
    this.locks.set(key, {
      owner,
      expiresAt: now + timeout
    });
    
    return { success: true, owner };
  }

  /**
   * Release a lock
   * @param key Lock key
   * @param owner Owner ID to verify lock ownership
   * @returns Success flag
   */
  async release(key: string, owner: string): Promise<boolean> {
    const lock = this.locks.get(key);
    
    // Only allow release by the owner
    if (lock && lock.owner === owner) {
      this.locks.delete(key);
      return true;
    }
    
    return false;
  }

  /**
   * Check if a lock exists
   * @param key Lock key
   * @returns Lock exists flag
   */
  async exists(key: string): Promise<boolean> {
    const lock = this.locks.get(key);
    return !!lock && lock.expiresAt > Date.now();
  }
}

// Create singleton instance
const memoryLockManager = new MemoryLockManager();

/**
 * Acquire a lock with retry
 * @param lockKey Lock key
 * @param options Lock options
 * @returns Lock result with owner
 */
export async function acquireLock(
  lockKey: string,
  options: LockOptions = {}
): Promise<{ success: boolean; owner: string }> {
  const maxRetries = options.retryCount || DEFAULT_RETRY_COUNT;
  const baseDelay = options.retryDelay || DEFAULT_RETRY_DELAY;
  const jitter = options.retryJitter || DEFAULT_RETRY_JITTER;
  
  let attempts = 0;
  
  while (attempts <= maxRetries) {
    const result = await memoryLockManager.acquire(lockKey, options);
    
    if (result.success) {
      return result;
    }
    
    if (attempts === maxRetries) {
      break;
    }
    
    // Wait before retrying with exponential backoff and jitter
    const delay = baseDelay * Math.pow(2, attempts) + Math.floor(Math.random() * jitter);
    await new Promise(resolve => setTimeout(resolve, delay));
    
    attempts++;
  }
  
  return { success: false, owner: '' };
}

/**
 * Release a lock
 * @param lockKey Lock key
 * @param owner Owner ID
 * @returns Success flag
 */
export async function releaseLock(lockKey: string, owner: string): Promise<boolean> {
  return memoryLockManager.release(lockKey, owner);
}

/**
 * Execute a function with locking to prevent concurrent execution
 * @param lockKey Lock key
 * @param fn Function to execute
 * @param options Lock options
 * @returns Function result
 */
export async function withLock<T>(
  lockKey: string,
  fn: () => Promise<T>,
  options: LockOptions = {}
): Promise<T> {
  const lock = await acquireLock(lockKey, options);
  
  if (!lock.success) {
    throw new Error(`Failed to acquire lock: ${lockKey}`);
  }
  
  try {
    return await fn();
  } finally {
    await releaseLock(lockKey, lock.owner);
  }
}

/**
 * Execute a function with retry logic for handling transient failures and race conditions
 * @param fn Function to execute
 * @param options Retry options
 * @returns Function result
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelay?: number;
    maxDelay?: number;
    backoffFactor?: number;
    retryableErrors?: string[];
    onRetry?: (error: Error, attempt: number) => void;
  } = {}
): Promise<T> {
  const maxRetries = options.maxRetries || 3;
  const initialDelay = options.initialDelay || 200;
  const maxDelay = options.maxDelay || 2000;
  const backoffFactor = options.backoffFactor || 2;
  const retryableErrors = options.retryableErrors || [
    'P2034', // Prisma transaction error
    'SQLITE_BUSY', 
    'SQLITE_LOCKED',
    'PrismaClientKnownRequestError',
    'deadlock detected'
  ];
  
  let lastError: Error | null = null;
  let delay = initialDelay;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      // Check if the error is retryable
      const isRetryable = retryableErrors.some(errMsg => 
        lastError!.message.includes(errMsg) || 
        (lastError as any).code === errMsg
      );
      
      if (!isRetryable || attempt === maxRetries) {
        throw lastError;
      }
      
      if (options.onRetry) {
        options.onRetry(lastError, attempt + 1);
      }
      
      logger.warn(`Retrying operation due to error (attempt ${attempt + 1}/${maxRetries})`, {
        error: lastError.message,
        attempt: attempt + 1,
        maxRetries,
        delay
      });
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
      
      // Calculate next delay with exponential backoff (capped at maxDelay)
      delay = Math.min(delay * backoffFactor, maxDelay);
    }
  }
  
  throw lastError || new Error('Retry failed for unknown reason');
} 