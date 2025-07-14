import { logger } from './logger';

/**
 * LRU Cache implementation for API response optimization
 */
class CacheService {
  private cache: Map<string, { data: any; timestamp: number; ttl: number }>;
  private maxSize: number;
  private defaultTTL: number; // in milliseconds

  constructor(maxSize = 1000, defaultTTL = 5 * 60 * 1000) { // Default 5 minute TTL
    this.cache = new Map();
    this.maxSize = maxSize;
    this.defaultTTL = defaultTTL;
  }

  /**
   * Get item from cache
   * @param key Cache key
   * @returns Cached item or null if expired/not found
   */
  get<T>(key: string): T | null {
    const item = this.cache.get(key);
    
    if (!item) {
      return null;
    }
    
    // Check if item is expired
    if (Date.now() - item.timestamp > item.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    // Update access order (LRU implementation)
    this.cache.delete(key);
    this.cache.set(key, item);
    
    return item.data as T;
  }

  /**
   * Set item in cache
   * @param key Cache key
   * @param data Data to cache
   * @param ttl Optional custom TTL in milliseconds
   */
  set(key: string, data: any, ttl?: number): void {
    // If cache is at capacity, remove least recently used item
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    
    this.cache.set(key, { 
      data, 
      timestamp: Date.now(),
      ttl: ttl || this.defaultTTL
    });
  }

  /**
   * Delete item from cache
   * @param key Cache key
   */
  delete(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cached keys count
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Get keys with matching prefix
   * @param prefix Key prefix to match
   */
  getKeysByPrefix(prefix: string): string[] {
    return Array.from(this.cache.keys()).filter(key => key.startsWith(prefix));
  }

  /**
   * Delete all keys with matching prefix
   * @param prefix Key prefix to match
   */
  deleteByPrefix(prefix: string): void {
    const keysToDelete = this.getKeysByPrefix(prefix);
    keysToDelete.forEach(key => this.cache.delete(key));
  }
}

// Export singleton instance
export const cacheService = new CacheService();

/**
 * Wrapper function to cache API responses
 * @param fn Function to cache
 * @param keyPrefix Cache key prefix 
 * @param ttl TTL in milliseconds
 */
export async function withCache<T>(
  fn: () => Promise<T>,
  keyPrefix: string,
  params: Record<string, any> = {},
  ttl?: number
): Promise<T> {
  // Create cache key from prefix and params
  const paramsStr = Object.entries(params)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
  
  const cacheKey = `${keyPrefix}_${paramsStr}`;
  
  // Check cache first
  const cached = cacheService.get<T>(cacheKey);
  if (cached !== null) {
    return cached;
  }
  
  // Execute function and cache result
  try {
    const result = await fn();
    cacheService.set(cacheKey, result, ttl);
    return result;
  } catch (error) {
    logger.error('Cache function execution error', {
      error: (error instanceof Error) ? error.message : String(error),
      keyPrefix,
      params
    });
    throw error;
  }
}

// Export default instance
export default cacheService; 