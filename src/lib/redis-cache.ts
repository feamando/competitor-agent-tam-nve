/**
 * Redis Cache Service
 * 
 * A robust Redis-based caching implementation for API response optimization.
 * Works in conjunction with the in-memory cache but provides persistent storage
 * and distributed caching capabilities.
 */

import { createClient, RedisClientType } from 'redis';
import { cacheService } from './cache';
import { logger } from './logger';

// Redis client configuration
let redisClient: RedisClientType | null = null;
let isConnected = false;

// Constants for cache control
const DEFAULT_TTL = 300; // 5 minutes in seconds
const DEFAULT_NAMESPACE = 'competitor-research';

// Configuration interface for Redis client
interface RedisConfig {
  url?: string;
  password?: string;
  username?: string;
}

// Options for withRedisCache function
interface RedisCacheOptions {
  useMemoryFallback?: boolean;
  skipCache?: boolean;
  namespace?: string;
}

/**
 * Initialize Redis client with configuration
 */
export async function initializeRedisClient(config: RedisConfig = {}): Promise<void> {
  try {
    if (redisClient) {
      return; // Client already initialized
    }

    const url = config.url || process.env.REDIS_URL || 'redis://localhost:6379';
    
    redisClient = createClient({
      url,
      password: config.password || process.env.REDIS_PASSWORD,
      username: config.username || process.env.REDIS_USERNAME,
    });
    
    // Set up event handlers
    redisClient.on('error', (err) => {
      console.error('Redis Client Error:', err);
      isConnected = false;
    });
    
    redisClient.on('connect', () => {
      isConnected = true;
      console.log('Redis client connected');
    });
    
    redisClient.on('reconnecting', () => {
      console.log('Redis client reconnecting');
    });
    
    redisClient.on('end', () => {
      isConnected = false;
      console.log('Redis client disconnected');
    });
    
    await redisClient.connect();
  } catch (error) {
    console.error('Failed to initialize Redis client:', error);
    isConnected = false;
  }
}

/**
 * Close Redis client connection
 */
export async function closeRedisClient(): Promise<void> {
  if (redisClient && isConnected) {
    await redisClient.quit();
    redisClient = null;
    isConnected = false;
  }
}

/**
 * Get a value from Redis cache
 */
export async function getFromRedis<T>(key: string): Promise<T | null> {
  try {
    if (!redisClient || !isConnected) {
      return null;
    }
    
    const value = await redisClient.get(key);
    if (!value) {
      return null;
    }
    
    return JSON.parse(value) as T;
  } catch (error) {
    console.error(`Error getting key ${key} from Redis:`, error);
    return null;
  }
}

/**
 * Set a value in Redis cache
 */
export async function setInRedis<T>(key: string, value: T, ttl: number): Promise<boolean> {
  try {
    if (!redisClient || !isConnected) {
      return false;
    }
    
    // Handle non-serializable data
    let serializedValue: string;
    try {
      serializedValue = JSON.stringify(value);
    } catch (error) {
      console.error(`Failed to serialize value for key ${key}:`, error);
      return false;
    }
    
    await redisClient.set(key, serializedValue, { EX: ttl });
    return true;
  } catch (error) {
    console.error(`Error setting key ${key} in Redis:`, error);
    return false;
  }
}

/**
 * Create a cache key from a prefix and parameters
 */
export function createCacheKey(prefix: string, params: Record<string, any>, namespace?: string): string {
  // Create a consistent key regardless of object property order
  const ns = namespace || DEFAULT_NAMESPACE;
  const paramString = Object.keys(params).length > 0 ? JSON.stringify(params) : '';
  return `${prefix}:${paramString}`;
}

/**
 * Execute a function with Redis caching
 * 
 * @param fn The async function to execute and cache
 * @param keyPrefix The prefix for the cache key
 * @param params Parameters to pass to the function
 * @param ttl Time-to-live in seconds
 * @param options Additional caching options
 */
export async function withRedisCache<T, P extends Record<string, any>>(
  fn: (params: P) => Promise<T>,
  keyPrefix: string,
  params: P,
  ttl: number = DEFAULT_TTL,
  options: RedisCacheOptions = {}
): Promise<T> {
  const { useMemoryFallback = true, skipCache = false, namespace } = options;
  
  // Generate cache key
  const cacheKey = createCacheKey(keyPrefix, params, namespace);
  
  // Skip cache if requested
  if (skipCache) {
    return await fn(params);
  }
  
  try {
    // Initialize Redis client if needed
    if (!redisClient) {
      await initializeRedisClient();
    }
    
    // Try to get from Redis cache
    const cachedResult = await getFromRedis<T>(cacheKey);
    if (cachedResult !== null) {
      return cachedResult;
    }
    
    // If Redis failed but memory fallback is enabled, try memory cache
    if (!isConnected && useMemoryFallback) {
      const memoryCachedResult = cacheService.get<T>(cacheKey);
      if (memoryCachedResult !== null) {
        return memoryCachedResult;
      }
    }
    
    // Execute the original function
    const result = await fn(params);
    
    // Store in Redis cache
    if (isConnected) {
      await setInRedis(cacheKey, result, ttl);
    }
    
    // Store in memory cache as backup
    if (useMemoryFallback) {
      cacheService.set(cacheKey, result, ttl);
    }
    
    return result;
  } catch (error) {
    console.error('Error in withRedisCache:', error);
    // On any error, fall back to calling the original function
    return await fn(params);
  }
}

// Create singleton instance
const redisCacheService = {
  initializeRedisClient,
  closeRedisClient,
  getFromRedis,
  setInRedis,
  createCacheKey,
  withRedisCache
};

export default redisCacheService; 