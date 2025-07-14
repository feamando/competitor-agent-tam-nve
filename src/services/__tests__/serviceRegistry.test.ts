/**
 * Phase 3.1: Comprehensive Tests for Service Registry
 */

import {
  serviceRegistry,
  ServiceRegistry,
  ServiceConfig,
  ServiceMetadata,
  ServiceHealthStatus,
  registerService,
  getService,
  clearServiceRegistry
} from '../serviceRegistry';
import { logger } from '@/lib/logger';

// Mock logger
jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

// Mock test services
class MockService {
  constructor(public name: string = 'MockService') {}
  
  async performOperation(): Promise<string> {
    return `Operation performed by ${this.name}`;
  }
}

class MockDependentService {
  constructor(private dependency: MockService) {}
  
  async performOperationWithDependency(): Promise<string> {
    const result = await this.dependency.performOperation();
    return `Dependent operation: ${result}`;
  }
}

class MockFailingService {
  constructor() {
    throw new Error('Failed to initialize service');
  }
}

describe('ServiceRegistry', () => {
  beforeEach(() => {
    // Clear registry before each test
    clearServiceRegistry();
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Clean up after each test
    clearServiceRegistry();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance when accessed multiple times', () => {
      const instance1 = serviceRegistry;
      const instance2 = serviceRegistry;
      expect(instance1).toBe(instance2);
    });

    it('should be an instance of ServiceRegistry', () => {
      expect(serviceRegistry).toBeInstanceOf(ServiceRegistry);
    });
  });

  describe('Service Registration', () => {
    it('should register a service successfully', () => {
      const config: ServiceConfig = {
        singleton: true,
        dependencies: []
      };

      const result = registerService('MockService', MockService, config);
      
      expect(result).toBe(true);
      expect(serviceRegistry.isServiceRegistered('MockService')).toBe(true);
    });

    it('should register multiple services', () => {
      registerService('Service1', MockService, { singleton: true });
      registerService('Service2', MockService, { singleton: false });

      expect(serviceRegistry.isServiceRegistered('Service1')).toBe(true);
      expect(serviceRegistry.isServiceRegistered('Service2')).toBe(true);
    });

    it('should handle duplicate service registration', () => {
      registerService('MockService', MockService, { singleton: true });
      const result = registerService('MockService', MockService, { singleton: true });

      expect(result).toBe(false);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('already registered'),
        expect.objectContaining({ serviceName: 'MockService' })
      );
    });

    it('should register service with dependencies', () => {
      registerService('MockService', MockService, { singleton: true });
      registerService('DependentService', MockDependentService, {
        singleton: true,
        dependencies: ['MockService']
      });

      expect(serviceRegistry.isServiceRegistered('DependentService')).toBe(true);
      expect(serviceRegistry.getServiceDependencies('DependentService')).toContain('MockService');
    });

    it('should validate service configuration', () => {
      const invalidConfig: ServiceConfig = {
        singleton: true,
        dependencies: ['NonExistentService']
      };

      const result = registerService('TestService', MockService, invalidConfig);
      
      // Should still register but warn about missing dependencies
      expect(result).toBe(true);
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe('Service Instantiation', () => {
    beforeEach(() => {
      registerService('MockService', MockService, { singleton: true });
    });

    it('should create service instance successfully', async () => {
      const instance = await getService<MockService>('MockService');
      
      expect(instance).toBeInstanceOf(MockService);
      expect(instance.name).toBe('MockService');
    });

    it('should return same instance for singleton services', async () => {
      const instance1 = await getService<MockService>('MockService');
      const instance2 = await getService<MockService>('MockService');
      
      expect(instance1).toBe(instance2);
    });

    it('should return different instances for non-singleton services', async () => {
      registerService('NonSingletonService', MockService, { singleton: false });
      
      const instance1 = await getService<MockService>('NonSingletonService');
      const instance2 = await getService<MockService>('NonSingletonService');
      
      expect(instance1).not.toBe(instance2);
      expect(instance1).toBeInstanceOf(MockService);
      expect(instance2).toBeInstanceOf(MockService);
    });

    it('should handle service instantiation failure', async () => {
      registerService('FailingService', MockFailingService, { singleton: true });
      
      await expect(getService('FailingService')).rejects.toThrow('Failed to initialize service');
      expect(logger.error).toHaveBeenCalled();
    });

    it('should throw error for unregistered service', async () => {
      await expect(getService('UnregisteredService')).rejects.toThrow('Service UnregisteredService is not registered');
    });

    it('should handle concurrent access to singleton services', async () => {
      const promises = Array.from({ length: 10 }, () => getService<MockService>('MockService'));
      const instances = await Promise.all(promises);
      
      // All instances should be the same for singleton
      const firstInstance = instances[0];
      instances.forEach(instance => {
        expect(instance).toBe(firstInstance);
      });
    });
  });

  describe('Dependency Management', () => {
    it('should resolve service dependencies correctly', async () => {
      registerService('MockService', MockService, { singleton: true });
      registerService('DependentService', MockDependentService, {
        singleton: true,
        dependencies: ['MockService']
      });

      const dependentService = await getService<MockDependentService>('DependentService');
      const result = await dependentService.performOperationWithDependency();
      
      expect(result).toContain('Dependent operation:');
      expect(result).toContain('Operation performed by MockService');
    });

    it('should detect circular dependencies', () => {
      class ServiceA {
        constructor(serviceB: ServiceB) {}
      }
      class ServiceB {
        constructor(serviceA: ServiceA) {}
      }

      registerService('ServiceA', ServiceA, { dependencies: ['ServiceB'] });
      registerService('ServiceB', ServiceB, { dependencies: ['ServiceA'] });

      const hasCircularDeps = serviceRegistry.detectCircularDependencies();
      expect(hasCircularDeps).toBe(true);
    });

    it('should handle missing dependencies gracefully', async () => {
      registerService('DependentService', MockDependentService, {
        dependencies: ['NonExistentService']
      });

      await expect(getService('DependentService')).rejects.toThrow();
    });

    it('should resolve deep dependency chains', async () => {
      class ServiceA {
        constructor() {}
        getValue() { return 'A'; }
      }
      class ServiceB {
        constructor(private serviceA: ServiceA) {}
        getValue() { return `B-${this.serviceA.getValue()}`; }
      }
      class ServiceC {
        constructor(private serviceB: ServiceB) {}
        getValue() { return `C-${this.serviceB.getValue()}`; }
      }

      registerService('ServiceA', ServiceA, { singleton: true });
      registerService('ServiceB', ServiceB, { singleton: true, dependencies: ['ServiceA'] });
      registerService('ServiceC', ServiceC, { singleton: true, dependencies: ['ServiceB'] });

      const serviceC = await getService<ServiceC>('ServiceC');
      expect(serviceC.getValue()).toBe('C-B-A');
    });
  });

  describe('Health Monitoring', () => {
    beforeEach(() => {
      registerService('MockService', MockService, {
        singleton: true,
        healthCheck: async () => true
      });
    });

    it('should perform health checks on services', async () => {
      const healthStatus = await serviceRegistry.checkServiceHealth('MockService');
      
      expect(healthStatus.serviceName).toBe('MockService');
      expect(healthStatus.healthy).toBe(true);
      expect(healthStatus.lastCheck).toBeInstanceOf(Date);
    });

    it('should handle health check failures', async () => {
      registerService('UnhealthyService', MockService, {
        singleton: true,
        healthCheck: async () => {
          throw new Error('Health check failed');
        }
      });

      const healthStatus = await serviceRegistry.checkServiceHealth('UnhealthyService');
      
      expect(healthStatus.healthy).toBe(false);
      expect(healthStatus.error).toContain('Health check failed');
    });

    it('should perform system-wide health checks', async () => {
      registerService('Service1', MockService, {
        singleton: true,
        healthCheck: async () => true
      });
      registerService('Service2', MockService, {
        singleton: true,
        healthCheck: async () => false
      });

      const systemHealth = await serviceRegistry.performSystemHealthCheck();
      
      expect(systemHealth.overall).toBe('degraded');
      expect(systemHealth.services).toHaveLength(3); // Including MockService from beforeEach
      expect(systemHealth.healthyCount).toBe(2);
      expect(systemHealth.unhealthyCount).toBe(1);
    });

    it('should track service metadata', async () => {
      await getService('MockService'); // Initialize service
      
      const metadata = serviceRegistry.getServiceMetadata('MockService');
      
      expect(metadata).toBeDefined();
      expect(metadata.instanceCount).toBe(1);
      expect(metadata.lastAccessed).toBeInstanceOf(Date);
      expect(metadata.isHealthy).toBe(true);
    });
  });

  describe('Service Lifecycle Management', () => {
    it('should handle service initialization timeout', async () => {
      class SlowService {
        constructor() {
          // Simulate slow initialization
          return new Promise(resolve => setTimeout(() => resolve(this), 100));
        }
      }

      registerService('SlowService', SlowService, {
        singleton: true,
        initializationTimeout: 50 // Shorter than initialization time
      });

      await expect(getService('SlowService')).rejects.toThrow();
    });

    it('should retry failed service initialization', async () => {
      let attemptCount = 0;
      class RetryService {
        constructor() {
          attemptCount++;
          if (attemptCount < 3) {
            throw new Error('Initialization failed');
          }
        }
      }

      registerService('RetryService', RetryService, {
        singleton: true,
        retryCount: 3
      });

      const instance = await getService('RetryService');
      expect(instance).toBeInstanceOf(RetryService);
      expect(attemptCount).toBe(3);
    });

    it('should respect initialization timeout with retries', async () => {
      class TimeoutRetryService {
        constructor() {
          return new Promise((resolve, reject) => {
            setTimeout(() => reject(new Error('Timeout')), 200);
          });
        }
      }

      registerService('TimeoutRetryService', TimeoutRetryService, {
        singleton: true,
        retryCount: 2,
        initializationTimeout: 100
      });

      const startTime = Date.now();
      await expect(getService('TimeoutRetryService')).rejects.toThrow();
      const duration = Date.now() - startTime;
      
      // Should have tried twice with timeout
      expect(duration).toBeGreaterThan(200); // At least 2 attempts
      expect(duration).toBeLessThan(400); // But not too long
    });
  });

  describe('Data Integrity Validation', () => {
    it('should validate service data integrity', async () => {
      registerService('TestService1', MockService, { singleton: true });
      registerService('TestService2', MockService, { singleton: true });
      
      const validation = await serviceRegistry.validateServiceDataIntegrity();
      
      expect(validation.valid).toBe(true);
      expect(validation.issues).toHaveLength(0);
      expect(validation.recommendations).toHaveLength(0);
    });

    it('should detect missing critical services', async () => {
      // Only register some services, leaving critical ones missing
      registerService('NonCriticalService', MockService, { singleton: true });
      
      const validation = await serviceRegistry.validateServiceDataIntegrity();
      
      expect(validation.valid).toBe(false);
      expect(validation.issues.length).toBeGreaterThan(0);
      expect(validation.recommendations.length).toBeGreaterThan(0);
    });

    it('should detect unhealthy services', async () => {
      registerService('UnhealthyService', MockService, {
        singleton: true,
        healthCheck: async () => false
      });
      
      // Trigger health check
      await serviceRegistry.checkServiceHealth('UnhealthyService');
      
      const validation = await serviceRegistry.validateServiceDataIntegrity();
      
      expect(validation.valid).toBe(false);
      expect(validation.issues).toContain(expect.stringContaining('UnhealthyService is unhealthy'));
    });
  });

  describe('Utility Functions', () => {
    it('should clear service registry', () => {
      registerService('TestService', MockService, { singleton: true });
      expect(serviceRegistry.isServiceRegistered('TestService')).toBe(true);
      
      clearServiceRegistry();
      expect(serviceRegistry.isServiceRegistered('TestService')).toBe(false);
    });

    it('should list all registered services', () => {
      registerService('Service1', MockService, { singleton: true });
      registerService('Service2', MockService, { singleton: false });
      
      const services = serviceRegistry.getRegisteredServices();
      
      expect(services).toContain('Service1');
      expect(services).toContain('Service2');
      expect(services).toHaveLength(2);
    });

    it('should get service configuration', () => {
      const config: ServiceConfig = {
        singleton: true,
        dependencies: ['Dependency1'],
        initializationTimeout: 5000
      };
      
      registerService('ConfiguredService', MockService, config);
      
      const retrievedConfig = serviceRegistry.getServiceConfig('ConfiguredService');
      
      expect(retrievedConfig).toEqual(config);
    });

    it('should handle edge cases gracefully', async () => {
      // Test with null/undefined service names
      expect(serviceRegistry.isServiceRegistered('')).toBe(false);
      expect(serviceRegistry.isServiceRegistered(null as any)).toBe(false);
      expect(serviceRegistry.isServiceRegistered(undefined as any)).toBe(false);
      
      // Test getting metadata for non-existent service
      expect(serviceRegistry.getServiceMetadata('NonExistent')).toBeUndefined();
    });
  });

  describe('Performance and Concurrency', () => {
    it('should handle concurrent service registrations', () => {
      const registrationPromises = Array.from({ length: 10 }, (_, i) => 
        registerService(`Service${i}`, MockService, { singleton: true })
      );
      
      const results = registrationPromises;
      
      // All registrations should succeed
      results.forEach(result => {
        expect(result).toBe(true);
      });
      
      // All services should be registered
      for (let i = 0; i < 10; i++) {
        expect(serviceRegistry.isServiceRegistered(`Service${i}`)).toBe(true);
      }
    });

    it('should handle concurrent service instantiations', async () => {
      registerService('ConcurrentService', MockService, { singleton: true });
      
      const instantiationPromises = Array.from({ length: 20 }, () => 
        getService<MockService>('ConcurrentService')
      );
      
      const instances = await Promise.all(instantiationPromises);
      
      // All instances should be the same (singleton)
      const firstInstance = instances[0];
      instances.forEach(instance => {
        expect(instance).toBe(firstInstance);
      });
    });

    it('should maintain performance under load', async () => {
      // Register many services
      for (let i = 0; i < 100; i++) {
        registerService(`LoadTestService${i}`, MockService, { singleton: true });
      }
      
      const startTime = Date.now();
      
      // Get all services
      const promises = Array.from({ length: 100 }, (_, i) => 
        getService(`LoadTestService${i}`)
      );
      
      await Promise.all(promises);
      const duration = Date.now() - startTime;
      
      // Should complete within reasonable time (adjust as needed)
      expect(duration).toBeLessThan(5000); // 5 seconds
    });
  });
}); 