/**
 * Phase 1.3: Service Registry for Critical Data Integrity
 * Provides centralized service instantiation and dependency management
 */

import { logger } from '@/lib/logger';
import { dataIntegrityValidator } from '@/lib/validation/dataIntegrity';

// Service configuration interface
export interface ServiceConfig {
  singleton?: boolean;
  dependencies?: string[];
  initializationTimeout?: number;
  retryCount?: number;
  healthCheck?: () => Promise<boolean>;
}

// Service metadata interface
export interface ServiceMetadata {
  instanceCount: number;
  lastAccessed: Date;
  isHealthy: boolean;
  initializationTime: number;
  errors: string[];
}

// Service health status enum
export enum ServiceHealthStatus {
  HEALTHY = 'healthy',
  UNHEALTHY = 'unhealthy',
  UNKNOWN = 'unknown'
}

// Service constructor type
export type ServiceConstructor<T = any> = new (...args: any[]) => T;

/**
 * Service Registry Class
 * Manages service instantiation, dependencies, and lifecycle
 */
export class ServiceRegistry {
  private static instance: ServiceRegistry;
  private services = new Map<string, any>();
  private serviceConfigs = new Map<string, ServiceConfig>();
  private serviceMetadata = new Map<string, ServiceMetadata>();
  private initializationPromises = new Map<string, Promise<any>>();
  private dependencyGraph = new Map<string, Set<string>>();
  private serviceClasses = new Map<string, ServiceConstructor<any>>();

  private constructor() {
    logger.info('Service Registry initialized');
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): ServiceRegistry {
    if (!ServiceRegistry.instance) {
      ServiceRegistry.instance = new ServiceRegistry();
    }
    return ServiceRegistry.instance;
  }

  /**
   * Register a service with configuration
   */
  registerService<T>(
    serviceClass: ServiceConstructor<T>,
    config?: ServiceConfig
  ): boolean;
  registerService<T>(
    serviceName: string,
    serviceClass: ServiceConstructor<T>,
    config?: ServiceConfig
  ): boolean;
  registerService<T>(
    serviceNameOrClass: string | ServiceConstructor<T>,
    serviceClassOrConfig?: ServiceConstructor<T> | ServiceConfig,
    configOrUndefined?: ServiceConfig
  ): boolean {
    let serviceName: string;
    let serviceClass: ServiceConstructor<T>;
    let config: ServiceConfig;

    if (typeof serviceNameOrClass === 'string') {
      serviceName = serviceNameOrClass;
      serviceClass = serviceClassOrConfig as ServiceConstructor<T>;
      config = configOrUndefined || {};
    } else {
      serviceName = serviceNameOrClass.name;
      serviceClass = serviceNameOrClass;
      config = (serviceClassOrConfig as ServiceConfig) || {};
    }

    // Check if service is already registered
    if (this.serviceConfigs.has(serviceName)) {
      logger.warn(`Service ${serviceName} is already registered`, { serviceName });
      return false;
    }
    
    // Validate service configuration
    const validationResult = this.validateServiceConfig(serviceName, config);
    if (!validationResult.valid) {
      throw new Error(`Invalid service configuration for ${serviceName}: ${validationResult.errors.join(', ')}`);
    }

    // Store service class
    this.serviceClasses.set(serviceName, serviceClass);

    this.serviceConfigs.set(serviceName, {
      singleton: true,
      initializationTimeout: 30000,
      retryCount: 3,
      ...config
    });

    // Build dependency graph
    if (config.dependencies) {
      this.dependencyGraph.set(serviceName, new Set(config.dependencies));
    }

    // Initialize metadata
    this.serviceMetadata.set(serviceName, {
      instanceCount: 0,
      lastAccessed: new Date(),
      isHealthy: true,
      initializationTime: 0,
      errors: []
    });

    logger.info(`Service ${serviceName} registered`, { config });
    return true;
  }

  /**
   * Check if a service is registered
   */
  isServiceRegistered(serviceName: string): boolean {
    if (!serviceName || typeof serviceName !== 'string') {
      return false;
    }
    return this.serviceConfigs.has(serviceName);
  }

  /**
   * Get service dependencies
   */
  getServiceDependencies(serviceName: string): string[] {
    const dependencies = this.dependencyGraph.get(serviceName);
    return dependencies ? Array.from(dependencies) : [];
  }

  /**
   * Get service configuration
   */
  getServiceConfig(serviceName: string): ServiceConfig | undefined {
    return this.serviceConfigs.get(serviceName);
  }

  /**
   * Get service metadata
   */
  getServiceMetadata(serviceName: string): ServiceMetadata | undefined {
    return this.serviceMetadata.get(serviceName);
  }

  /**
   * Get all registered service names
   */
  getRegisteredServices(): string[] {
    return Array.from(this.serviceConfigs.keys());
  }

  /**
   * Detect circular dependencies
   */
  detectCircularDependencies(): boolean {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    for (const serviceName of this.dependencyGraph.keys()) {
      if (this.hasCircularDependency(serviceName, visited, recursionStack)) {
        return true;
      }
    }
    return false;
  }

  private hasCircularDependency(
    serviceName: string,
    visited: Set<string>,
    recursionStack: Set<string>
  ): boolean {
    if (recursionStack.has(serviceName)) {
      return true;
    }
    if (visited.has(serviceName)) {
      return false;
    }

    visited.add(serviceName);
    recursionStack.add(serviceName);

    const dependencies = this.dependencyGraph.get(serviceName);
    if (dependencies) {
      for (const dep of dependencies) {
        if (this.hasCircularDependency(dep, visited, recursionStack)) {
          return true;
        }
      }
    }

    recursionStack.delete(serviceName);
    return false;
  }

  /**
   * Check service health
   */
  async checkServiceHealth(serviceName: string): Promise<ServiceHealthStatus> {
    const config = this.serviceConfigs.get(serviceName);
    const metadata = this.serviceMetadata.get(serviceName);

    if (!config || !metadata) {
      return ServiceHealthStatus.UNKNOWN;
    }

    if (config.healthCheck) {
      try {
        const isHealthy = await config.healthCheck();
        metadata.isHealthy = isHealthy;
        return isHealthy ? ServiceHealthStatus.HEALTHY : ServiceHealthStatus.UNHEALTHY;
      } catch (error) {
        metadata.isHealthy = false;
        this.recordServiceError(serviceName, error as Error);
        return ServiceHealthStatus.UNHEALTHY;
      }
    }

    return metadata.isHealthy ? ServiceHealthStatus.HEALTHY : ServiceHealthStatus.UNHEALTHY;
  }

  /**
   * Perform system-wide health check
   */
  async performSystemHealthCheck(): Promise<{
    overall: ServiceHealthStatus;
    services: Record<string, ServiceHealthStatus>;
  }> {
    const results: Record<string, ServiceHealthStatus> = {};
    let healthyCount = 0;
    let totalCount = 0;

    for (const serviceName of this.serviceConfigs.keys()) {
      const status = await this.checkServiceHealth(serviceName);
      results[serviceName] = status;
      totalCount++;
      if (status === ServiceHealthStatus.HEALTHY) {
        healthyCount++;
      }
    }

    const overall = totalCount === 0 
      ? ServiceHealthStatus.UNKNOWN
      : healthyCount === totalCount 
        ? ServiceHealthStatus.HEALTHY 
        : ServiceHealthStatus.UNHEALTHY;

    return { overall, services: results };
  }

  /**
   * Get service instance with dependency resolution
   */
  async getService<T>(serviceClass: ServiceConstructor<T>): Promise<T>;
  async getService<T>(serviceName: string): Promise<T>;
  async getService<T>(serviceNameOrClass: string | ServiceConstructor<T>): Promise<T> {
    let serviceName: string;
    let serviceClass: ServiceConstructor<T>;

    if (typeof serviceNameOrClass === 'string') {
      serviceName = serviceNameOrClass;
      // Find the service class from stored registrations
      if (!this.serviceClasses.has(serviceName)) {
        throw new Error(`Service ${serviceName} is not registered`);
      }
      serviceClass = this.serviceClasses.get(serviceName)!;
    } else {
      serviceName = serviceNameOrClass.name;
      serviceClass = serviceNameOrClass;
    }

    const config = this.serviceConfigs.get(serviceName) || { singleton: true };

    // Handle singleton services
    if (config.singleton && this.services.has(serviceName)) {
      this.updateLastAccessed(serviceName);
      return this.services.get(serviceName);
    }

    // Handle concurrent initialization
    if (this.initializationPromises.has(serviceName)) {
      return await this.initializationPromises.get(serviceName)!;
    }

    // Initialize service with dependencies
    const initPromise = this.initializeService(serviceClass, serviceName, config);
    this.initializationPromises.set(serviceName, initPromise);

    try {
      const service = await initPromise;
      this.initializationPromises.delete(serviceName);
      return service;
    } catch (error) {
      this.initializationPromises.delete(serviceName);
      this.recordServiceError(serviceName, error as Error);
      throw error;
    }
  }

  /**
   * Get service synchronously (for already initialized services)
   */
  getServiceSync<T>(serviceClass: ServiceConstructor<T>): T | null {
    const serviceName = serviceClass.name;
    
    if (this.services.has(serviceName)) {
      this.updateLastAccessed(serviceName);
      return this.services.get(serviceName);
    }
    
    return null;
  }

  /**
   * Initialize service with dependency resolution
   */
  private async initializeService<T>(
    serviceClass: ServiceConstructor<T>,
    serviceName: string,
    config: ServiceConfig
  ): Promise<T> {
    const startTime = Date.now();

    try {
      logger.info(`Initializing service ${serviceName}`);

      // Resolve dependencies first
      await this.resolveDependencies(serviceName);

      // Create service instance
      const service = new serviceClass();
      
      // Store singleton instance
      if (config.singleton) {
        this.services.set(serviceName, service);
      }

      // Update metadata
      const metadata = this.serviceMetadata.get(serviceName)!;
      metadata.instanceCount++;
      metadata.initializationTime = Date.now() - startTime;
      metadata.lastAccessed = new Date();
      metadata.isHealthy = true;

      // Perform health check if configured
      if (config.healthCheck) {
        const isHealthy = await this.performHealthCheck(serviceName, config.healthCheck);
        metadata.isHealthy = isHealthy;
      }

      logger.info(`Service ${serviceName} initialized successfully`, {
        initializationTime: metadata.initializationTime,
        instanceCount: metadata.instanceCount
      });

      return service;

    } catch (error) {
      logger.error(`Failed to initialize service ${serviceName}`, error instanceof Error ? error : new Error(String(error)), { serviceName });
      throw error;
    }
  }

  /**
   * Resolve service dependencies
   */
  private async resolveDependencies(serviceName: string): Promise<void> {
    const dependencies = this.dependencyGraph.get(serviceName);
    if (!dependencies || dependencies.size === 0) {
      return;
    }

    logger.debug(`Resolving dependencies for ${serviceName}`, {
      dependencies: Array.from(dependencies)
    });

    // Check for circular dependencies
    this.checkCircularDependencies(serviceName, new Set());

    // Initialize dependencies
    for (const depName of dependencies) {
      if (!this.services.has(depName)) {
        const depConfig = this.serviceConfigs.get(depName);
        if (!depConfig) {
          throw new Error(`Dependency ${depName} not registered for service ${serviceName}`);
        }
        
        // Find and initialize dependency service
        // Note: In a real implementation, you'd need a way to map service names to classes
        logger.warn(`Dependency ${depName} not found for ${serviceName}. Manual initialization required.`);
      }
    }
  }

  /**
   * Check for circular dependencies
   */
  private checkCircularDependencies(serviceName: string, visited: Set<string>): void {
    if (visited.has(serviceName)) {
      throw new Error(`Circular dependency detected involving ${serviceName}`);
    }

    visited.add(serviceName);
    const dependencies = this.dependencyGraph.get(serviceName);
    
    if (dependencies) {
      for (const dep of dependencies) {
        this.checkCircularDependencies(dep, new Set(visited));
      }
    }
  }

  /**
   * Perform health check for a service
   */
  private async performHealthCheck(
    serviceName: string,
    healthCheck: () => Promise<boolean>
  ): Promise<boolean> {
    try {
      const isHealthy = await healthCheck();
      logger.debug(`Health check for ${serviceName}: ${isHealthy ? 'HEALTHY' : 'UNHEALTHY'}`);
      return isHealthy;
    } catch (error) {
              logger.warn(`Health check failed for ${serviceName}`, { error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }

  /**
   * Validate service configuration
   */
  private validateServiceConfig(serviceName: string, config: ServiceConfig): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // Validate timeout
    if (config.initializationTimeout && config.initializationTimeout < 1000) {
      errors.push('Initialization timeout must be at least 1000ms');
    }

    // Validate retry count
    if (config.retryCount && config.retryCount < 0) {
      errors.push('Retry count cannot be negative');
    }

    // Validate dependencies
    if (config.dependencies) {
      const duplicates = config.dependencies.filter((dep, index) => 
        config.dependencies!.indexOf(dep) !== index
      );
      if (duplicates.length > 0) {
        errors.push(`Duplicate dependencies found: ${duplicates.join(', ')}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Update last accessed time for a service
   */
  private updateLastAccessed(serviceName: string): void {
    const metadata = this.serviceMetadata.get(serviceName);
    if (metadata) {
      metadata.lastAccessed = new Date();
    }
  }

  /**
   * Record service error
   */
  private recordServiceError(serviceName: string, error: Error): void {
    const metadata = this.serviceMetadata.get(serviceName);
    if (metadata) {
      metadata.errors.push(error.message);
      metadata.isHealthy = false;
      
      // Keep only last 10 errors
      if (metadata.errors.length > 10) {
        metadata.errors = metadata.errors.slice(-10);
      }
    }
  }

  /**
   * Get service health status
   */
  getServiceHealth(serviceName: string): ServiceMetadata | null {
    return this.serviceMetadata.get(serviceName) || null;
  }

  /**
   * Get all service health statuses
   */
  getAllServiceHealth(): Map<string, ServiceMetadata> {
    return new Map(this.serviceMetadata);
  }

  /**
   * Clear service instance (useful for testing or forced reinitialization)
   */
  clearService(serviceName: string): void {
    this.services.delete(serviceName);
    this.initializationPromises.delete(serviceName);
    
    const metadata = this.serviceMetadata.get(serviceName);
    if (metadata) {
      metadata.instanceCount = 0;
      metadata.isHealthy = true;
      metadata.errors = [];
    }
    
    logger.info(`Service ${serviceName} cleared from registry`);
  }

  /**
   * Clear all services
   */
  clearAll(): void {
    this.services.clear();
    this.serviceConfigs.clear();
    this.serviceMetadata.clear();
    this.initializationPromises.clear();
    this.dependencyGraph.clear();
    this.serviceClasses.clear();
    
    logger.info('All services cleared from registry');
  }

  /**
   * Validate data integrity across all managed services
   */
  async validateServiceDataIntegrity(): Promise<{
    valid: boolean;
    issues: string[];
    recommendations: string[];
  }> {
    const issues: string[] = [];
    const recommendations: string[] = [];

    // Check service health
    for (const [serviceName, metadata] of this.serviceMetadata) {
      if (!metadata.isHealthy) {
        issues.push(`Service ${serviceName} is unhealthy`);
        recommendations.push(`Check and resolve issues with ${serviceName}`);
      }

      if (metadata.errors.length > 0) {
        issues.push(`Service ${serviceName} has ${metadata.errors.length} recorded errors`);
        recommendations.push(`Review error logs for ${serviceName}`);
      }
    }

    // Check for missing critical services
    const criticalServices = [
      'ComparativeAnalysisService',
      'AnalysisService', // Unified Analysis Service - Task 3.1
      'ComparativeReportService',
      'ProjectService',
      'ProductRepository'
    ];

    for (const service of criticalServices) {
      if (!this.serviceConfigs.has(service)) {
        issues.push(`Critical service ${service} not registered`);
        recommendations.push(`Register ${service} with the service registry`);
      }
    }

    return {
      valid: issues.length === 0,
      issues,
      recommendations
    };
  }
}

// Export singleton instance
export const serviceRegistry = ServiceRegistry.getInstance();

// Convenience function for getting services
export async function getService<T>(serviceClass: ServiceConstructor<T>): Promise<T>;
export async function getService<T>(serviceName: string): Promise<T>;
export async function getService<T>(serviceNameOrClass: string | ServiceConstructor<T>): Promise<T> {
  return serviceRegistry.getService(serviceNameOrClass as any);
}

// Convenience function for registering services
export function registerService<T>(
  serviceClass: ServiceConstructor<T>,
  config?: ServiceConfig
): boolean;
export function registerService<T>(
  serviceName: string,
  serviceClass: ServiceConstructor<T>,
  config?: ServiceConfig
): boolean;
export function registerService<T>(
  serviceNameOrClass: string | ServiceConstructor<T>,
  serviceClassOrConfig?: ServiceConstructor<T> | ServiceConfig,
  configOrUndefined?: ServiceConfig
): boolean {
  if (typeof serviceNameOrClass === 'string') {
    return serviceRegistry.registerService(
      serviceNameOrClass,
      serviceClassOrConfig as ServiceConstructor<T>,
      configOrUndefined
    );
  } else {
    return serviceRegistry.registerService(
      serviceNameOrClass,
      serviceClassOrConfig as ServiceConfig
    );
  }
}

// Clear service registry function for testing
export function clearServiceRegistry(): void {
  serviceRegistry.clearAll();
} 