/**
 * Bedrock Service Factory
 * Centralizes BedrockService initialization with consistent error handling and fallback logic
 */

import { BedrockService } from './bedrock.service';
import { logger } from '@/lib/logger';
import { BedrockConfig, ModelProvider } from './types';

export interface BedrockServiceOptions {
  provider?: ModelProvider;
  config?: Partial<BedrockConfig>;
  useStoredCredentials?: boolean;
  retryOnFailure?: boolean;
  fallbackToEnvironment?: boolean;
}

export class BedrockServiceFactory {
  private static instances: Map<string, BedrockService> = new Map();
  private static initializationPromises: Map<string, Promise<BedrockService>> = new Map();

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

    // Return cached instance if available
    if (this.instances.has(instanceKey)) {
      return this.instances.get(instanceKey)!;
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
      this.instances.set(instanceKey, service);
      this.initializationPromises.delete(instanceKey);
      return service;
    } catch (error) {
      this.initializationPromises.delete(instanceKey);
      throw error;
    }
  }

  /**
   * Initialize BedrockService with comprehensive error handling
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

    logger.info('Initializing BedrockService', context);

    let lastError: Error | null = null;

    // Strategy 1: Try with stored credentials (if enabled)
    if (useStoredCredentials) {
      try {
        logger.debug('Attempting BedrockService initialization with stored credentials', context);
        const service = await BedrockService.createWithStoredCredentials(provider, config);
        
        logger.info('BedrockService initialized successfully with stored credentials', context);
        return service;
      } catch (error) {
        lastError = error as Error;
        logger.warn('BedrockService initialization failed with stored credentials', {
          ...context,
          error: lastError.message
        });
      }
    }

    // Strategy 2: Try with environment variables (if fallback enabled)
    if (fallbackToEnvironment) {
      try {
        logger.debug('Attempting BedrockService initialization with environment variables', context);
        const service = new BedrockService(config, provider);
        
        // Test the service with a simple operation
        await this.validateService(service);
        
        logger.info('BedrockService initialized successfully with environment variables', context);
        return service;
      } catch (error) {
        lastError = error as Error;
        logger.warn('BedrockService initialization failed with environment variables', {
          ...context,
          error: lastError.message
        });
      }
    }

    // Strategy 3: Create service without credentials (let AWS SDK handle default chain)
    try {
      logger.debug('Attempting BedrockService initialization with default AWS credential chain', context);
      
      // Create config without explicit credentials to use AWS default chain
      const configWithoutCredentials = { ...config };
      delete configWithoutCredentials.credentials;
      
      const service = new BedrockService(configWithoutCredentials, provider);
      
      logger.info('BedrockService initialized with default credential chain', context);
      return service;
    } catch (error) {
      lastError = error as Error;
      logger.error('BedrockService initialization failed with all strategies', lastError, {
        provider: context.provider,
        useStoredCredentials: context.useStoredCredentials,
        fallbackToEnvironment: context.fallbackToEnvironment,
        configProvided: context.configProvided
      });
    }

    // If all strategies failed, throw the last error
    throw new Error(
      `Failed to initialize BedrockService for provider ${provider}. ` +
      `Last error: ${lastError?.message || 'Unknown error'}`
    );
  }

  /**
   * Validate service functionality with a lightweight test
   */
  private static async validateService(service: BedrockService): Promise<void> {
    // For now, we'll just verify the service was created
    // In production, you might want to make a lightweight API call
    if (!service) {
      throw new Error('Service is null or undefined');
    }
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
  static clearCache(provider?: ModelProvider): void {
    if (provider) {
      // Clear instances for specific provider
      const keysToDelete: string[] = [];
      for (const [key, _] of this.instances) {
        if (key.startsWith(`${provider}-`)) {
          keysToDelete.push(key);
        }
      }
      keysToDelete.forEach(key => this.instances.delete(key));
    } else {
      // Clear all instances
      this.instances.clear();
    }
    
    logger.info('BedrockService cache cleared', { provider });
  }

  /**
   * Get current cache statistics
   */
  static getCacheStats(): {
    cachedInstances: number;
    activeInitializations: number;
    providers: string[];
  } {
    const providers = Array.from(new Set(
      Array.from(this.instances.keys())
        .map(key => key.split('-')[0])
        .filter((provider): provider is string => provider !== undefined)
    ));

    return {
      cachedInstances: this.instances.size,
      activeInitializations: this.initializationPromises.size,
      providers
    };
  }
}

// Export convenience function
export const createBedrockService = BedrockServiceFactory.createService; 