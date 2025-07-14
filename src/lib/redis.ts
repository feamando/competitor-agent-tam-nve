/**
 * Redis Configuration and Client Setup
 * Provides centralized Redis client management with connection pooling and error handling
 */

import { createClient, RedisClientType } from 'redis';
import { logger } from './logger';

export interface RedisConfig {
  host?: string;
  port?: number;
  password?: string;
  database?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  connectionTimeout?: number;
}

class RedisManager {
  private client: RedisClientType | null = null;
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private config: RedisConfig;

  constructor() {
    this.config = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      database: parseInt(process.env.REDIS_DATABASE || '0'),
      maxRetries: 3,
      retryDelayMs: 1000,
      connectionTimeout: 5000
    };
  }

  /**
   * Initialize Redis client with configuration
   */
  private async initializeClient(): Promise<RedisClientType> {
    if (this.client) {
      return this.client;
    }

    try {
      logger.info('Initializing Redis client', {
        host: this.config.host,
        port: this.config.port,
        database: this.config.database
      });

      const client = createClient({
        socket: {
          host: this.config.host,
          port: this.config.port,
          connectTimeout: this.config.connectionTimeout,
          reconnectDelay: this.config.retryDelayMs
        },
        password: this.config.password,
        database: this.config.database
      });

      // Set up event listeners
      client.on('error', (error) => {
        logger.error('Redis client error', error);
        this.isConnected = false;
      });

      client.on('connect', () => {
        logger.info('Redis client connected');
        this.isConnected = true;
        this.reconnectAttempts = 0;
      });

      client.on('disconnect', () => {
        logger.warn('Redis client disconnected');
        this.isConnected = false;
      });

      client.on('reconnecting', () => {
        this.reconnectAttempts++;
        logger.info('Redis client reconnecting', {
          attempt: this.reconnectAttempts,
          maxAttempts: this.maxReconnectAttempts
        });
      });

      this.client = client;
      return client;

    } catch (error) {
      logger.error('Failed to initialize Redis client', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Get Redis client (initialize if needed)
   */
  async getClient(): Promise<RedisClientType> {
    if (!this.client) {
      this.client = await this.initializeClient();
    }

    if (!this.isConnected) {
      try {
        await this.client.connect();
      } catch (error) {
        logger.error('Failed to connect to Redis', error instanceof Error ? error : new Error(String(error)));
        throw error;
      }
    }

    return this.client;
  }

  /**
   * Check if Redis is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const client = await this.getClient();
      await client.ping();
      return true;
    } catch (error) {
      logger.warn('Redis not available', { error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }

  /**
   * Set a key-value pair with optional expiration
   */
  async set(key: string, value: string, expirationSeconds?: number): Promise<void> {
    try {
      const client = await this.getClient();
      if (expirationSeconds) {
        await client.setEx(key, expirationSeconds, value);
      } else {
        await client.set(key, value);
      }
      logger.debug('Redis SET operation completed', { key, hasExpiration: !!expirationSeconds });
    } catch (error) {
      logger.error('Redis SET operation failed', error instanceof Error ? error : new Error(String(error)), { key });
      throw error;
    }
  }

  /**
   * Get a value by key
   */
  async get(key: string): Promise<string | null> {
    try {
      const client = await this.getClient();
      const value = await client.get(key);
      logger.debug('Redis GET operation completed', { key, found: value !== null });
      return value;
    } catch (error) {
      logger.error('Redis GET operation failed', error instanceof Error ? error : new Error(String(error)), { key });
      throw error;
    }
  }

  /**
   * Delete a key
   */
  async del(key: string): Promise<number> {
    try {
      const client = await this.getClient();
      const result = await client.del(key);
      logger.debug('Redis DEL operation completed', { key, deleted: result });
      return result;
    } catch (error) {
      logger.error('Redis DEL operation failed', error instanceof Error ? error : new Error(String(error)), { key });
      throw error;
    }
  }

  /**
   * Check if a key exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      const client = await this.getClient();
      const result = await client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error('Redis EXISTS operation failed', error instanceof Error ? error : new Error(String(error)), { key });
      throw error;
    }
  }

  /**
   * Set hash field
   */
  async hSet(key: string, field: string, value: string): Promise<void> {
    try {
      const client = await this.getClient();
      await client.hSet(key, field, value);
      logger.debug('Redis HSET operation completed', { key, field });
    } catch (error) {
      logger.error('Redis HSET operation failed', error instanceof Error ? error : new Error(String(error)), { key, field });
      throw error;
    }
  }

  /**
   * Get hash field
   */
  async hGet(key: string, field: string): Promise<string | undefined> {
    try {
      const client = await this.getClient();
      const value = await client.hGet(key, field);
      logger.debug('Redis HGET operation completed', { key, field, found: value !== undefined });
      return value;
    } catch (error) {
      logger.error('Redis HGET operation failed', error instanceof Error ? error : new Error(String(error)), { key, field });
      throw error;
    }
  }

  /**
   * Graceful shutdown
   */
  async disconnect(): Promise<void> {
    if (this.client && this.isConnected) {
      try {
        await this.client.disconnect();
        logger.info('Redis client disconnected gracefully');
      } catch (error) {
        logger.error('Error during Redis disconnect', error instanceof Error ? error : new Error(String(error)));
      }
    }
    this.client = null;
    this.isConnected = false;
  }
}

// Export singleton instance
export const redisManager = new RedisManager();

// Export convenience functions
export const redis = {
  set: (key: string, value: string, expirationSeconds?: number) => redisManager.set(key, value, expirationSeconds),
  get: (key: string) => redisManager.get(key),
  del: (key: string) => redisManager.del(key),
  exists: (key: string) => redisManager.exists(key),
  hSet: (key: string, field: string, value: string) => redisManager.hSet(key, field, value),
  hGet: (key: string, field: string) => redisManager.hGet(key, field),
  isAvailable: () => redisManager.isAvailable(),
  disconnect: () => redisManager.disconnect()
};

// Default export
export default redis; 