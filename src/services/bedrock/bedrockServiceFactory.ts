/**
 * Bedrock Service Factory
 * Centralizes BedrockService initialization with consistent error handling and fallback logic
 */

import { BedrockService } from './bedrock.service';
import { logger } from '@/lib/logger';
import { BedrockConfig, ModelProvider } from './types';
import { BedrockInitializationError, BedrockErrorType } from '@/types/bedrockHealth';

export interface BedrockServiceOptions {
  provider?: ModelProvider;
  config?: Partial<BedrockConfig>;
  useStoredCredentials?: boolean;
  retryOnFailure?: boolean;
  fallbackToEnvironment?: boolean;
}

interface StrategyError {
  strategy: string;
  error: Error;
  errorType: BedrockErrorType;
  timestamp: string;
}

interface CachedInstance {
  service: BedrockService;
  createdAt: Date;
  lastAccessedAt: Date;
  accessCount: number;
}

export class BedrockServiceFactory {
  private static instances: Map<string, CachedInstance> = new Map();
  private static initializationPromises: Map<string, Promise<BedrockService>> = new Map();
  private static cleanupInterval: NodeJS.Timeout | null = null;
  private static readonly INSTANCE_TTL_MS = 30 * 60 * 1000; // 30 minutes
  private static readonly CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
  private static isCleanupRunning = false;

  /**
   * Create or get cached BedrockService instance
   */
  static async createService(options: BedrockServiceOptions = {}): Promise<BedrockService> {
    const {
      provider = 'anthropic',
      config = {},
      useStoredCredentials = true,
      retryOnFailure = true,
      fallbackToEnvironment = true
    } = options;

    const instanceKey = this.getInstanceKey(provider, config);

    // Return cached instance if available and not expired
    if (this.instances.has(instanceKey)) {
      const cachedInstance = this.instances.get(instanceKey)!;
      const now = new Date();
      
      // Check if instance has expired
      if (now.getTime() - cachedInstance.lastAccessedAt.getTime() > this.INSTANCE_TTL_MS) {
        logger.info('BedrockService instance expired, disposing and recreating', {
          instanceKey,
          age: now.getTime() - cachedInstance.createdAt.getTime(),
          lastAccessed: now.getTime() - cachedInstance.lastAccessedAt.getTime()
        });
        
        // Dispose expired instance
        await this.disposeInstance(instanceKey, cachedInstance);
      } else {
        // Update access time and return cached instance
        cachedInstance.lastAccessedAt = now;
        cachedInstance.accessCount++;
        
        logger.debug('Returning cached BedrockService instance', {
          instanceKey,
          accessCount: cachedInstance.accessCount,
          age: now.getTime() - cachedInstance.createdAt.getTime()
        });
        
        return cachedInstance.service;
      }
    }

    // Return ongoing initialization promise if available
    if (this.initializationPromises.has(instanceKey)) {
      return await this.initializationPromises.get(instanceKey)!;
    }

    // Create new initialization promise
    const initializationPromise = this.initializeService(
      provider,
      config,
      useStoredCredentials,
      fallbackToEnvironment,
      retryOnFailure
    );

    this.initializationPromises.set(instanceKey, initializationPromise);

    try {
      const service = await initializationPromise;
      
      // Create cached instance with TTL tracking
      const now = new Date();
      const cachedInstance: CachedInstance = {
        service,
        createdAt: now,
        lastAccessedAt: now,
        accessCount: 1
      };
      
      this.instances.set(instanceKey, cachedInstance);
      this.initializationPromises.delete(instanceKey);
      
      // Start cleanup scheduler if not already running
      this.startCleanupScheduler();
      
      logger.info('BedrockService instance cached successfully', {
        instanceKey,
        totalCachedInstances: this.instances.size
      });
      
      return service;
    } catch (error) {
      this.initializationPromises.delete(instanceKey);
      throw error;
    }
  }

  /**
   * Initialize BedrockService with comprehensive error handling
   * Implements TP-029 Task 4.1-4.3: Better error aggregation and classification
   */
  private static async initializeService(
    provider: ModelProvider,
    config: Partial<BedrockConfig>,
    useStoredCredentials: boolean,
    fallbackToEnvironment: boolean,
    retryOnFailure: boolean
  ): Promise<BedrockService> {
    const context = {
      provider,
      useStoredCredentials,
      fallbackToEnvironment,
      configProvided: Object.keys(config).length > 0
    };

    logger.info('[BedrockServiceFactory] Starting BedrockService initialization with 3-strategy approach', context);

    const strategyErrors: StrategyError[] = [];

    // Strategy 1: Try with stored credentials (if enabled)
    if (useStoredCredentials) {
      try {
        logger.debug('[BedrockServiceFactory] Strategy 1: Attempting initialization with stored credentials', context);
        const service = await BedrockService.createWithStoredCredentials(provider, config);
        
        // Validate service before returning
        await this.validateService(service);
        
        logger.info('[BedrockServiceFactory] Strategy 1: SUCCESS - Service initialized and validated with stored credentials', context);
        return service;
      } catch (error) {
        const strategyError: StrategyError = {
          strategy: 'stored_credentials',
          error: error as Error,
          errorType: this.classifyError(error as Error),
          timestamp: new Date().toISOString()
        };
        strategyErrors.push(strategyError);
        
        logger.warn('[BedrockServiceFactory] Strategy 1: FAILED - Stored credentials initialization failed', {
          ...context,
          error: error.message,
          errorType: strategyError.errorType
        });
      }
    }

    // Strategy 2: Try with environment variables (if fallback enabled)
    if (fallbackToEnvironment) {
      try {
        logger.debug('[BedrockServiceFactory] Strategy 2: Attempting initialization with environment variables', context);
        const service = new BedrockService(config, provider);
        
        // Validate service before returning
        await this.validateService(service);
        
        logger.info('[BedrockServiceFactory] Strategy 2: SUCCESS - Service initialized and validated with environment variables', context);
        return service;
      } catch (error) {
        const strategyError: StrategyError = {
          strategy: 'environment_variables',
          error: error as Error,
          errorType: this.classifyError(error as Error),
          timestamp: new Date().toISOString()
        };
        strategyErrors.push(strategyError);
        
        logger.warn('[BedrockServiceFactory] Strategy 2: FAILED - Environment variables initialization failed', {
          ...context,
          error: error.message,
          errorType: strategyError.errorType
        });
      }
    }

    // Strategy 3: Create service with default AWS credential chain
    try {
      logger.debug('[BedrockServiceFactory] Strategy 3: Attempting initialization with AWS default credential chain', context);
      
      // Create config without explicit credentials to use AWS default chain
      const configWithoutCredentials = { ...config };
      delete configWithoutCredentials.credentials;
      
      const service = new BedrockService(configWithoutCredentials, provider);
      
      // Validate service before returning
      await this.validateService(service);
      
      logger.info('[BedrockServiceFactory] Strategy 3: SUCCESS - Service initialized and validated with default credential chain', context);
      return service;
    } catch (error) {
      const strategyError: StrategyError = {
        strategy: 'default_credential_chain',
        error: error as Error,
        errorType: this.classifyError(error as Error),
        timestamp: new Date().toISOString()
      };
      strategyErrors.push(strategyError);
      
      logger.error('[BedrockServiceFactory] Strategy 3: FAILED - Default credential chain initialization failed', {
        ...context,
        error: error.message,
        errorType: strategyError.errorType
      });
    }

    // All strategies failed - create comprehensive error report
    logger.error('[BedrockServiceFactory] ALL STRATEGIES FAILED - BedrockService initialization unsuccessful', {
      provider,
      totalStrategiesAttempted: strategyErrors.length,
      strategyErrors: strategyErrors.map(se => ({
        strategy: se.strategy,
        errorType: se.errorType,
        error: se.error.message,
        timestamp: se.timestamp
      }))
    });

    // Throw comprehensive error with all strategy failures
    const errorMessage = this.buildComprehensiveErrorMessage(provider, strategyErrors);
    throw new BedrockInitializationError(errorMessage);
  }

  /**
   * Validate service functionality with actual connectivity test
   * Implements TP-029 Task 4.4: Configuration validation before service creation
   */
  private static async validateService(service: BedrockService): Promise<void> {
    if (!service) {
      throw new Error('Service is null or undefined');
    }
    
    try {
      logger.debug('[BedrockServiceFactory] Validating service functionality with connectivity test');
      
      // Use the service's built-in validation method
      await service.validateServiceAvailability();
      
      logger.debug('[BedrockServiceFactory] Service validation successful');
    } catch (error) {
      logger.error('[BedrockServiceFactory] Service validation failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Classify error types for better monitoring and debugging
   * Implements TP-029 Task 4.3: Strategy-specific error classification
   */
  private static classifyError(error: Error): BedrockErrorType {
    const errorMessage = error.message.toLowerCase();
    
    if (errorMessage.includes('timeout')) {
      return BedrockErrorType.TIMEOUT;
    } else if (errorMessage.includes('credentials') || errorMessage.includes('unauthorized')) {
      return BedrockErrorType.AUTHENTICATION;
    } else if (errorMessage.includes('access') || errorMessage.includes('permission')) {
      return BedrockErrorType.AUTHORIZATION;
    } else if (errorMessage.includes('quota') || errorMessage.includes('limit') || errorMessage.includes('throttl')) {
      return BedrockErrorType.QUOTA_EXCEEDED;
    } else if (errorMessage.includes('validation')) {
      return BedrockErrorType.VALIDATION_ERROR;
    } else {
      return BedrockErrorType.SERVICE_ERROR;
    }
  }

  /**
   * Build comprehensive error message with all strategy failure details
   * Implements TP-029 Task 4.2: Detailed logging and error aggregation
   */
  private static buildComprehensiveErrorMessage(provider: ModelProvider, strategyErrors: StrategyError[]): string {
    const baseMessage = `Failed to initialize BedrockService for provider '${provider}' using all available strategies.`;
    
    if (strategyErrors.length === 0) {
      return `${baseMessage} No strategies were attempted.`;
    }

    const strategyDetails = strategyErrors.map((strategyError, index) => {
      return `Strategy ${index + 1} (${strategyError.strategy}): ${strategyError.errorType} - ${strategyError.error.message}`;
    }).join('\n  ');

    const errorTypeSummary = this.summarizeErrorTypes(strategyErrors);

    return `${baseMessage}

Strategy Failures:
  ${strategyDetails}

Error Type Summary: ${errorTypeSummary}

Troubleshooting:
- Check AWS credentials configuration
- Verify Bedrock service availability in your region
- Ensure proper IAM permissions for Bedrock access
- Check network connectivity to AWS services`;
  }

  /**
   * Summarize error types for quick diagnosis
   */
  private static summarizeErrorTypes(strategyErrors: StrategyError[]): string {
    const errorCounts = strategyErrors.reduce((acc, error) => {
      acc[error.errorType] = (acc[error.errorType] || 0) + 1;
      return acc;
    }, {} as Record<BedrockErrorType, number>);

    return Object.entries(errorCounts)
      .map(([type, count]) => `${type}(${count})`)
      .join(', ');
  }

  /**
   * Get instance key for caching
   */
  private static getInstanceKey(provider: ModelProvider, config: Partial<BedrockConfig>): string {
    const configHash = JSON.stringify(Object.keys(config).sort().reduce((obj, key) => {
      obj[key] = config[key as keyof BedrockConfig];
      return obj;
    }, {} as any));
    
    return `${provider}-${Buffer.from(configHash).toString('base64')}`;
  }

  /**
   * Clear cached instances (useful for testing or credential updates)
   */
  static async clearCache(provider?: ModelProvider): Promise<void> {
    logger.info('Clearing BedrockService cache', { 
      provider, 
      currentInstanceCount: this.instances.size 
    });

    if (provider) {
      // Clear instances for specific provider
      const keysToDispose: string[] = [];
      for (const [key, _] of this.instances) {
        if (key.startsWith(`${provider}-`)) {
          keysToDispose.push(key);
        }
      }
      
      // Dispose instances properly
      const disposePromises = keysToDispose.map(async (key) => {
        const instance = this.instances.get(key);
        if (instance) {
          await this.disposeInstance(key, instance);
        }
      });
      
      await Promise.allSettled(disposePromises);
      
      logger.info('Provider-specific BedrockService cache cleared', { 
        provider, 
        clearedCount: keysToDispose.length,
        remainingInstances: this.instances.size 
      });
    } else {
      // Clear all instances
      await this.disposeAllInstances();
    }
  }

  /**
   * Get current cache statistics
   */
  static getCacheStats(): {
    cachedInstances: number;
    activeInitializations: number;
    providers: string[];
    oldestInstance?: Date;
    totalAccessCount: number;
  } {
    const providers = Array.from(new Set(
      Array.from(this.instances.keys())
        .map(key => key.split('-')[0])
        .filter((provider): provider is string => provider !== undefined)
    ));

    let oldestInstance: Date | undefined;
    let totalAccessCount = 0;

    for (const [_, instance] of this.instances) {
      totalAccessCount += instance.accessCount;
      if (!oldestInstance || instance.createdAt < oldestInstance) {
        oldestInstance = instance.createdAt;
      }
    }

    return {
      cachedInstances: this.instances.size,
      activeInitializations: this.initializationPromises.size,
      providers,
      ...(oldestInstance && { oldestInstance }),
      totalAccessCount
    };
  }

  /**
   * Start periodic cleanup scheduler
   */
  private static startCleanupScheduler(): void {
    if (this.cleanupInterval) {
      return; // Already running
    }

    this.cleanupInterval = setInterval(() => {
      this.performPeriodicCleanup();
    }, this.CLEANUP_INTERVAL_MS);

    logger.info('BedrockService cleanup scheduler started', {
      cleanupInterval: this.CLEANUP_INTERVAL_MS,
      instanceTTL: this.INSTANCE_TTL_MS
    });
  }

  /**
   * Stop periodic cleanup scheduler
   */
  private static stopCleanupScheduler(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      logger.info('BedrockService cleanup scheduler stopped');
    }
  }

  /**
   * Perform periodic cleanup of expired instances
   */
  private static async performPeriodicCleanup(): Promise<void> {
    if (this.isCleanupRunning) {
      logger.debug('BedrockService cleanup already in progress, skipping');
      return;
    }

    this.isCleanupRunning = true;
    const now = new Date();
    const expiredKeys: string[] = [];

    try {
      logger.debug('Starting BedrockService periodic cleanup', {
        totalInstances: this.instances.size,
        ttlMs: this.INSTANCE_TTL_MS
      });

      // Find expired instances
      for (const [key, instance] of this.instances) {
        const timeSinceLastAccess = now.getTime() - instance.lastAccessedAt.getTime();
        
        if (timeSinceLastAccess > this.INSTANCE_TTL_MS) {
          expiredKeys.push(key);
          logger.debug('BedrockService instance marked for cleanup', {
            instanceKey: key,
            age: now.getTime() - instance.createdAt.getTime(),
            lastAccessed: timeSinceLastAccess,
            accessCount: instance.accessCount
          });
        }
      }

      // Dispose expired instances
      for (const key of expiredKeys) {
        const instance = this.instances.get(key);
        if (instance) {
          await this.disposeInstance(key, instance);
        }
      }

      if (expiredKeys.length > 0) {
        logger.info('BedrockService periodic cleanup completed', {
          expiredInstances: expiredKeys.length,
          remainingInstances: this.instances.size
        });
      }

      // Stop scheduler if no instances remain
      if (this.instances.size === 0) {
        this.stopCleanupScheduler();
      }

    } catch (error) {
      logger.error('BedrockService periodic cleanup failed', error as Error, {
        expiredKeysCount: expiredKeys.length,
        totalInstances: this.instances.size
      });
    } finally {
      this.isCleanupRunning = false;
    }
  }

  /**
   * Dispose a single instance with proper cleanup
   */
  private static async disposeInstance(instanceKey: string, cachedInstance: CachedInstance): Promise<void> {
    try {
      logger.debug('Disposing BedrockService instance', {
        instanceKey,
        age: Date.now() - cachedInstance.createdAt.getTime(),
        accessCount: cachedInstance.accessCount
      });

      // Remove from cache first
      this.instances.delete(instanceKey);

      // Perform cleanup if the service has disposal methods
      // Note: BedrockService doesn't currently have explicit disposal methods,
      // but we log the disposal for monitoring
      const service = cachedInstance.service;
      
      // If the service had connections or resources, we would dispose them here
      // For now, we just nullify references to help garbage collection
      (cachedInstance as any).service = null;

      logger.info('BedrockService instance disposed successfully', {
        instanceKey,
        totalRemainingInstances: this.instances.size
      });

    } catch (error) {
      logger.error('Failed to dispose BedrockService instance', error as Error, {
        instanceKey
      });
      
      // Still remove from cache even if disposal failed
      this.instances.delete(instanceKey);
    }
  }

  /**
   * Force cleanup of all instances (for testing or emergency use)
   */
  static async disposeAllInstances(): Promise<void> {
    logger.info('Disposing all BedrockService instances', {
      totalInstances: this.instances.size
    });

    const disposePromises: Promise<void>[] = [];
    
    for (const [key, instance] of this.instances) {
      disposePromises.push(this.disposeInstance(key, instance));
    }

    await Promise.allSettled(disposePromises);
    
    this.stopCleanupScheduler();
    
    logger.info('All BedrockService instances disposed', {
      remainingInstances: this.instances.size
    });
  }

  /**
   * Force cleanup of instances for a specific provider
   */
  static async disposeProviderInstances(provider: ModelProvider): Promise<void> {
    logger.info('Disposing BedrockService instances for provider', { provider });

    const keysToDispose: string[] = [];
    
    for (const [key, _] of this.instances) {
      if (key.startsWith(`${provider}-`)) {
        keysToDispose.push(key);
      }
    }

    const disposePromises = keysToDispose.map(async (key) => {
      const instance = this.instances.get(key);
      if (instance) {
        await this.disposeInstance(key, instance);
      }
    });

    await Promise.allSettled(disposePromises);
    
    logger.info('Provider instances disposed', {
      provider,
      disposedCount: keysToDispose.length,
      remainingInstances: this.instances.size
    });
  }
}

// Export convenience function
export const createBedrockService = BedrockServiceFactory.createService; 