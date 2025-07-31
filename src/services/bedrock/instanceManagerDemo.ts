import { BedrockServiceFactory } from './bedrockServiceFactory';
import { bedrockInstanceManager } from './instanceManager';
import { logger } from '@/lib/logger';

/**
 * Demo script to test BedrockService instance management
 * This demonstrates the TTL-based cleanup and monitoring functionality
 */
export async function demonstrateInstanceManagement() {
  logger.info('Starting BedrockService instance management demonstration');

  try {
    // Start monitoring
    bedrockInstanceManager.startMonitoring();
    
    // Get initial stats
    const initialStats = bedrockInstanceManager.getInstanceStats();
    logger.info('Initial instance statistics', initialStats);

    // Create multiple service instances to test caching
    logger.info('Creating multiple BedrockService instances...');
    
    const services = await Promise.all([
      BedrockServiceFactory.createService({ provider: 'anthropic' }),
      BedrockServiceFactory.createService({ provider: 'anthropic', config: { region: 'us-east-1' } }),
      BedrockServiceFactory.createService({ provider: 'anthropic', config: { region: 'us-west-2' } })
    ]);

    logger.info('Created BedrockService instances', { count: services.length });

    // Check stats after creation
    const afterCreationStats = bedrockInstanceManager.getInstanceStats();
    logger.info('Statistics after instance creation', afterCreationStats);

    // Get memory estimation
    const memoryEstimate = bedrockInstanceManager.getMemoryEstimate();
    logger.info('Memory usage estimation', memoryEstimate);

    // Perform health check
    const healthCheck = bedrockInstanceManager.performHealthCheck();
    logger.info('Health check results', {
      isHealthy: healthCheck.isHealthy,
      issues: healthCheck.issues,
      recommendations: healthCheck.recommendations
    });

    // Simulate some usage by accessing the services again
    logger.info('Simulating service usage...');
    await Promise.all([
      BedrockServiceFactory.createService({ provider: 'anthropic' }),
      BedrockServiceFactory.createService({ provider: 'anthropic', config: { region: 'us-east-1' } })
    ]);

    // Check updated stats
    const afterUsageStats = bedrockInstanceManager.getInstanceStats();
    logger.info('Statistics after simulated usage', afterUsageStats);

    // Test manual cleanup
    logger.info('Testing manual cleanup...');
    const cleanupResult = await bedrockInstanceManager.forceCleanup({
      provider: 'anthropic'
    });
    
    logger.info('Manual cleanup completed', cleanupResult);

    // Final stats
    const finalStats = bedrockInstanceManager.getInstanceStats();
    logger.info('Final instance statistics', finalStats);

    // Stop monitoring
    bedrockInstanceManager.stopMonitoring();

    logger.info('BedrockService instance management demonstration completed successfully');

  } catch (error) {
    logger.error('BedrockService instance management demonstration failed', error as Error);
    throw error;
  }
}

/**
 * Test TTL-based cleanup functionality
 */
export async function testTTLCleanup() {
  logger.info('Testing TTL-based cleanup functionality');

  try {
    // Create some instances
    await BedrockServiceFactory.createService({ provider: 'anthropic' });
    await BedrockServiceFactory.createService({ provider: 'anthropic', config: { region: 'us-east-1' } });

    const initialStats = BedrockServiceFactory.getCacheStats();
    logger.info('Created instances for TTL test', {
      cachedInstances: initialStats.cachedInstances
    });

    // Wait briefly and check if cleanup scheduling is working
    // (In a real scenario, you'd wait 30+ minutes for TTL expiration)
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Manually trigger a health check which includes cleanup logic
    const healthCheck = bedrockInstanceManager.performHealthCheck();
    logger.info('Health check after waiting', {
      isHealthy: healthCheck.isHealthy,
      cachedInstances: healthCheck.stats.cachedInstances
    });

    // Test immediate disposal
    logger.info('Testing immediate disposal...');
    await BedrockServiceFactory.disposeAllInstances();
    
    const finalStats = BedrockServiceFactory.getCacheStats();
    logger.info('Stats after disposal', {
      cachedInstances: finalStats.cachedInstances,
      activeInitializations: finalStats.activeInitializations
    });

    logger.info('TTL cleanup test completed successfully');

  } catch (error) {
    logger.error('TTL cleanup test failed', error as Error);
    throw error;
  }
} 