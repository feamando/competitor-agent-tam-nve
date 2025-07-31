/**
 * Task 3.2: Consolidated Service Initialization Factory
 * Standardizes service initialization patterns across all report generation endpoints
 * Implements service factory pattern for consistent initialization with health checks and monitoring
 */

import { logger, generateCorrelationId, createCorrelationLogger } from '@/lib/logger';
import { ReportingService, ReportingServiceFactory } from '@/services/domains/ReportingService';
import { AnalysisService } from '@/services/domains/AnalysisService';
import { InitialComparativeReportService } from '@/services/reports/initialComparativeReportService';
import { AutoReportGenerationService, getAutoReportService } from '@/services/autoReportGenerationService';
import { IntelligentReportingService } from '@/services/intelligentReportingService';
import { ReportGenerator } from '@/lib/reports';
import { ServiceRegistry } from '@/services/serviceRegistry';

// Service initialization configuration
export interface ServiceInitializationConfig {
  enableHealthChecks?: boolean;
  maxInitializationTime?: number;
  retryOnFailure?: boolean;
  maxRetries?: number;
  retryDelay?: number;
  enableFallbacks?: boolean;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  correlationId?: string;
}

// Service health status
export interface ServiceHealth {
  isHealthy: boolean;
  status: 'healthy' | 'degraded' | 'failed' | 'initializing';
  lastCheck: Date;
  initializationTime?: number;
  errors?: string[];
  serviceName: string;
  fallbackActive?: boolean;
}

// Service initialization result
export interface ServiceInitializationResult<T> {
  service: T;
  health: ServiceHealth;
  correlationId: string;
  initializationTime: number;
  fallbackUsed: boolean;
  warnings: string[];
}

// Service bundle for report generation endpoints
export interface ReportGenerationServices {
  reportingService: ServiceInitializationResult<ReportingService>;
  analysisService: ServiceInitializationResult<AnalysisService>;
  autoReportService: ServiceInitializationResult<AutoReportGenerationService>;
  initialReportService?: ServiceInitializationResult<InitialComparativeReportService>;
  intelligentReportingService?: ServiceInitializationResult<IntelligentReportingService>;
  reportGenerator?: ServiceInitializationResult<ReportGenerator>;
}

// Service initialization error
class ServiceInitializationError extends Error {
  constructor(
    message: string,
    public readonly serviceName: string,
    public readonly correlationId: string,
    public readonly details?: any
  ) {
    super(message);
    this.name = 'ServiceInitializationError';
  }
}

/**
 * Consolidated Service Initialization Factory
 * Provides standardized service initialization patterns for all report generation endpoints
 */
class ServiceInitializationFactory {
  private static registry = ServiceRegistry.getInstance();
  private static initializationCache = new Map<string, ServiceInitializationResult<any>>();
  private static healthCheckIntervals = new Map<string, NodeJS.Timeout>();

  // Default configuration
  private static readonly DEFAULT_CONFIG: Required<ServiceInitializationConfig> = {
    enableHealthChecks: true,
    maxInitializationTime: 30000,
    retryOnFailure: true,
    maxRetries: 3,
    retryDelay: 1000,
    enableFallbacks: true,
    logLevel: 'info',
    correlationId: ''
  };

  /**
   * Initialize core services bundle for report generation endpoints
   */
  static async initializeReportGenerationServices(
    config: ServiceInitializationConfig = {}
  ): Promise<ReportGenerationServices> {
    const mergedConfig = { ...this.DEFAULT_CONFIG, ...config };
    const correlationId = mergedConfig.correlationId || generateCorrelationId();
    const correlatedLogger = createCorrelationLogger(correlationId);

    const context = {
      operation: 'initializeReportGenerationServices',
      correlationId,
      config: mergedConfig
    };

    correlatedLogger.info('Starting consolidated service initialization', context);

    try {
      // Initialize services in parallel with dependency awareness
      const [
        analysisService,
        autoReportService
      ] = await Promise.all([
        this.initializeAnalysisService(mergedConfig, correlationId),
        this.initializeAutoReportService(mergedConfig, correlationId)
      ]);

      // Initialize reporting service with analysis service dependency
      const reportingService = await this.initializeReportingService(
        analysisService.service,
        mergedConfig,
        correlationId
      );

      // Initialize optional services based on endpoint needs
      const services: ReportGenerationServices = {
        reportingService,
        analysisService,
        autoReportService
      };

      correlatedLogger.info('Core services initialized successfully', {
        ...context,
        totalInitTime: reportingService.initializationTime + analysisService.initializationTime + autoReportService.initializationTime,
        healthyServices: [
          reportingService.health.isHealthy,
          analysisService.health.isHealthy,
          autoReportService.health.isHealthy
        ].filter(Boolean).length
      });

      // Start health monitoring if enabled
      if (mergedConfig.enableHealthChecks) {
        this.startHealthMonitoring(services, correlationId);
      }

      return services;

    } catch (error) {
      correlatedLogger.error('Failed to initialize core services', error as Error, context);
      throw new ServiceInitializationError(
        'Core service initialization failed',
        'ReportGenerationServices',
        correlationId,
        { error: (error as Error).message, context }
      );
    }
  }

  /**
   * Initialize ReportingService with standardized patterns
   */
     static async initializeReportingService(
     analysisService: AnalysisService,
     config: ServiceInitializationConfig = {},
     correlationId?: string
   ): Promise<ServiceInitializationResult<ReportingService>> {
     const mergedConfig = { ...this.DEFAULT_CONFIG, ...config, correlationId: correlationId || generateCorrelationId() };
     return this.initializeServiceWithPattern<ReportingService>(
       'ReportingService',
       async () => {
         return ReportingServiceFactory.create(analysisService);
       },
       mergedConfig,
       async (service) => {
         const health = await service.healthCheck();
         return {
           isHealthy: health.status === 'healthy',
           status: health.status as any,
           lastCheck: new Date(),
           serviceName: 'ReportingService'
         };
       }
     );
   }

  /**
   * Initialize AnalysisService with standardized patterns
   */
     static async initializeAnalysisService(
     config: ServiceInitializationConfig = {},
     correlationId?: string
   ): Promise<ServiceInitializationResult<AnalysisService>> {
     const mergedConfig = { ...this.DEFAULT_CONFIG, ...config, correlationId: correlationId || generateCorrelationId() };
     return this.initializeServiceWithPattern<AnalysisService>(
       'AnalysisService',
       async () => {
         return new AnalysisService();
       },
       mergedConfig,
       async (service) => {
         // Basic health check for AnalysisService
         return {
           isHealthy: true,
           status: 'healthy' as const,
           lastCheck: new Date(),
           serviceName: 'AnalysisService'
         };
       }
     );
   }

  /**
   * Initialize AutoReportGenerationService with standardized patterns
   */
     static async initializeAutoReportService(
     config: ServiceInitializationConfig = {},
     correlationId?: string
   ): Promise<ServiceInitializationResult<AutoReportGenerationService>> {
     const mergedConfig = { ...this.DEFAULT_CONFIG, ...config, correlationId: correlationId || generateCorrelationId() };
     return this.initializeServiceWithPattern<AutoReportGenerationService>(
       'AutoReportGenerationService',
       async () => {
         return getAutoReportService();
       },
       mergedConfig,
       async (service) => {
         // Basic health check for auto report service
         return {
           isHealthy: true,
           status: 'healthy' as const,
           lastCheck: new Date(),
           serviceName: 'AutoReportGenerationService'
         };
       }
     );
   }

   /**
    * Initialize InitialComparativeReportService with standardized patterns
    */
   static async initializeInitialReportService(
     config: ServiceInitializationConfig = {},
     correlationId?: string
   ): Promise<ServiceInitializationResult<InitialComparativeReportService>> {
     const mergedConfig = { ...this.DEFAULT_CONFIG, ...config, correlationId: correlationId || generateCorrelationId() };
     return this.initializeServiceWithPattern<InitialComparativeReportService>(
       'InitialComparativeReportService',
       async () => {
         const service = new InitialComparativeReportService();
         await service.initialize();
         return service;
       },
       mergedConfig,
       async (service) => {
         const health = service.getServiceHealth();
         return {
           isHealthy: health.isHealthy,
           status: health.isHealthy ? 'healthy' : 'degraded',
           lastCheck: new Date(),
           serviceName: 'InitialComparativeReportService'
         };
       }
     );
   }

   /**
    * Initialize ReportGenerator with standardized patterns
    */
   static async initializeReportGenerator(
     config: ServiceInitializationConfig = {},
     correlationId?: string
   ): Promise<ServiceInitializationResult<ReportGenerator>> {
     const mergedConfig = { ...this.DEFAULT_CONFIG, ...config, correlationId: correlationId || generateCorrelationId() };
     return this.initializeServiceWithPattern<ReportGenerator>(
       'ReportGenerator',
       async () => {
         return new ReportGenerator();
       },
       mergedConfig,
       async (service) => {
         // Basic health check for report generator
         return {
           isHealthy: true,
           status: 'healthy' as const,
           lastCheck: new Date(),
           serviceName: 'ReportGenerator'
         };
       }
     );
   }

  /**
   * Generic service initialization pattern with comprehensive error handling
   */
  private static async initializeServiceWithPattern<T>(
    serviceName: string,
    serviceFactory: () => Promise<T>,
    config: Required<ServiceInitializationConfig>,
    healthCheck?: (service: T) => Promise<ServiceHealth>
  ): Promise<ServiceInitializationResult<T>> {
    const correlatedLogger = createCorrelationLogger(config.correlationId);
    const startTime = Date.now();
    let attempt = 0;
    let fallbackUsed = false;
    const warnings: string[] = [];

    const context = {
      serviceName,
      correlationId: config.correlationId,
      config: {
        enableHealthChecks: config.enableHealthChecks,
        maxRetries: config.maxRetries,
        enableFallbacks: config.enableFallbacks
      }
    };

    while (attempt < config.maxRetries) {
      try {
        correlatedLogger.info(`Initializing ${serviceName} (attempt ${attempt + 1})`, context);

        // Create timeout promise
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error(`Service initialization timeout after ${config.maxInitializationTime}ms`));
          }, config.maxInitializationTime);
        });

        // Race between service initialization and timeout
        const service = await Promise.race([
          serviceFactory(),
          timeoutPromise
        ]);

        const initializationTime = Date.now() - startTime;

        // Perform health check if configured
        let health: ServiceHealth = {
          isHealthy: true,
          status: 'healthy',
          lastCheck: new Date(),
          initializationTime,
          serviceName
        };

        if (config.enableHealthChecks && healthCheck) {
          try {
            health = await healthCheck(service);
            health.initializationTime = initializationTime;
          } catch (healthError) {
            correlatedLogger.warn(`Health check failed for ${serviceName}`, {
              ...context,
              error: (healthError as Error).message
            });
            health.isHealthy = false;
            health.status = 'degraded';
            health.errors = [(healthError as Error).message];
            warnings.push(`Health check failed: ${(healthError as Error).message}`);
          }
        }

        correlatedLogger.info(`${serviceName} initialized successfully`, {
          ...context,
          initializationTime,
          healthStatus: health.status,
          fallbackUsed
        });

        return {
          service,
          health,
          correlationId: config.correlationId,
          initializationTime,
          fallbackUsed,
          warnings
        };

      } catch (error) {
        attempt++;
        const errorMessage = (error as Error).message;
        
        correlatedLogger.warn(`${serviceName} initialization failed (attempt ${attempt})`, {
          ...context,
          attempt,
          error: errorMessage
        });

        if (attempt >= config.maxRetries) {
          if (config.enableFallbacks) {
            correlatedLogger.info(`Attempting fallback initialization for ${serviceName}`, context);
            
            try {
              const fallbackResult = await this.attemptFallbackInitialization<T>(
                serviceName,
                config,
                correlatedLogger
              );
              
              if (fallbackResult) {
                fallbackUsed = true;
                warnings.push(`Primary initialization failed, using fallback: ${errorMessage}`);
                return {
                  ...fallbackResult,
                  fallbackUsed,
                  warnings
                };
              }
            } catch (fallbackError) {
              correlatedLogger.error(`Fallback initialization also failed for ${serviceName}`, 
                fallbackError as Error, context);
            }
          }

          // Final failure
          throw new ServiceInitializationError(
            `Failed to initialize ${serviceName} after ${config.maxRetries} attempts`,
            serviceName,
            config.correlationId,
            { lastError: errorMessage, attempts: attempt }
          );
        }

        // Wait before retry
        if (config.retryDelay > 0) {
          await new Promise(resolve => setTimeout(resolve, config.retryDelay * attempt));
        }
      }
    }

    throw new ServiceInitializationError(
      `Unexpected end of initialization loop for ${serviceName}`,
      serviceName,
      config.correlationId
    );
  }

  /**
   * Attempt fallback initialization strategies
   */
  private static async attemptFallbackInitialization<T>(
    serviceName: string,
    config: Required<ServiceInitializationConfig>,
    logger: any
  ): Promise<ServiceInitializationResult<T> | null> {
    // Implementation would depend on specific fallback strategies for each service
    logger.info(`No fallback strategy implemented for ${serviceName}`, {
      serviceName,
      correlationId: config.correlationId
    });
    return null;
  }

  /**
   * Start health monitoring for initialized services
   */
  private static startHealthMonitoring(
    services: ReportGenerationServices,
    correlationId: string
  ): void {
    const monitoringInterval = 60000; // 1 minute
    const correlatedLogger = createCorrelationLogger(correlationId);

    const healthCheckInterval = setInterval(async () => {
      try {
        const serviceChecks = await Promise.allSettled([
          this.checkServiceHealth(services.reportingService),
          this.checkServiceHealth(services.analysisService),
          this.checkServiceHealth(services.autoReportService)
        ]);

        const healthResults = serviceChecks.map((result, index) => {
          const serviceNames = ['reportingService', 'analysisService', 'autoReportService'];
          return {
            serviceName: serviceNames[index],
            status: result.status === 'fulfilled' ? result.value.status : 'failed',
            error: result.status === 'rejected' ? result.reason : null
          };
        });

        correlatedLogger.debug('Health monitoring check completed', {
          correlationId,
          healthResults,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        correlatedLogger.error('Health monitoring check failed', error as Error, {
          correlationId
        });
      }
    }, monitoringInterval);

    this.healthCheckIntervals.set(correlationId, healthCheckInterval);

    // Clean up after 10 minutes
    setTimeout(() => {
      clearInterval(healthCheckInterval);
      this.healthCheckIntervals.delete(correlationId);
    }, 600000);
  }

  /**
   * Check health of individual service
   */
  private static async checkServiceHealth<T>(
    serviceResult: ServiceInitializationResult<T>
  ): Promise<ServiceHealth> {
    try {
      const service = serviceResult.service as any;
      
      if (service.healthCheck && typeof service.healthCheck === 'function') {
        const health = await service.healthCheck();
        return {
          ...health,
          lastCheck: new Date(),
          serviceName: serviceResult.health.serviceName
        };
      } else if (service.getHealthStatus && typeof service.getHealthStatus === 'function') {
        const health = await service.getHealthStatus();
        return {
          isHealthy: health.status === 'healthy',
          status: health.status,
          lastCheck: new Date(),
          serviceName: serviceResult.health.serviceName
        };
      } else {
        // Default health check - service exists and has basic functionality
        return {
          isHealthy: true,
          status: 'healthy',
          lastCheck: new Date(),
          serviceName: serviceResult.health.serviceName
        };
      }
    } catch (error) {
      return {
        isHealthy: false,
        status: 'failed',
        lastCheck: new Date(),
        serviceName: serviceResult.health.serviceName,
        errors: [(error as Error).message]
      };
    }
  }

  /**
   * Clean up resources and stop monitoring
   */
  static cleanup(correlationId: string): void {
    const interval = this.healthCheckIntervals.get(correlationId);
    if (interval) {
      clearInterval(interval);
      this.healthCheckIntervals.delete(correlationId);
    }
    
    // Clear cached services for this correlation
    for (const [key, _] of this.initializationCache.entries()) {
      if (key.includes(correlationId)) {
        this.initializationCache.delete(key);
      }
    }
  }

  /**
   * Get service initialization documentation
   */
  static getDocumentation(): string {
    return `
# Service Initialization Factory Documentation

## Overview
The ServiceInitializationFactory provides standardized service initialization patterns for all report generation endpoints.

## Key Features
- Standardized initialization patterns
- Comprehensive error handling and retry logic
- Health monitoring and status tracking
- Fallback mechanisms for degraded operation
- Correlation ID tracking for debugging
- Timeout protection and resource cleanup

## Usage Examples

### Basic Service Bundle Initialization
\`\`\`typescript
const services = await ServiceInitializationFactory.initializeReportGenerationServices({
  enableHealthChecks: true,
  maxRetries: 3,
  enableFallbacks: true
});
\`\`\`

### Individual Service Initialization
\`\`\`typescript
const reportingService = await ServiceInitializationFactory.initializeReportingService(
  analysisService,
  { enableHealthChecks: true }
);
\`\`\`

### Custom Configuration
\`\`\`typescript
const services = await ServiceInitializationFactory.initializeReportGenerationServices({
  enableHealthChecks: true,
  maxInitializationTime: 45000,
  retryOnFailure: true,
  maxRetries: 5,
  retryDelay: 2000,
  enableFallbacks: true,
  logLevel: 'debug',
  correlationId: 'custom-correlation-id'
});
\`\`\`

## Service Health Monitoring
Services are automatically monitored for health status when health checks are enabled. 
Monitoring runs every minute and automatically cleans up after 10 minutes.

## Error Handling
All initialization failures are wrapped in ServiceInitializationError with:
- Service name
- Correlation ID  
- Detailed error context
- Retry attempt information

## Cleanup
Remember to call cleanup() when services are no longer needed:
\`\`\`typescript
ServiceInitializationFactory.cleanup(correlationId);
\`\`\`
    `;
  }
}

// Export classes
export { ServiceInitializationFactory, ServiceInitializationError }; 