/**
 * Task 3.2: Endpoint-Specific Service Initialization Helpers
 * Provides pre-configured service initialization patterns for different endpoint types
 */

import { 
  ServiceInitializationFactory, 
  ServiceInitializationConfig,
  ReportGenerationServices 
} from './ServiceInitializationFactory';
import { logger, generateCorrelationId, createCorrelationLogger } from '@/lib/logger';

// Endpoint-specific configurations
export const ENDPOINT_CONFIGS = {
  REPORT_GENERATION: {
    enableHealthChecks: true,
    maxInitializationTime: 45000,
    maxRetries: 3,
    retryDelay: 1500,
    enableFallbacks: true,
    logLevel: 'info' as const
  },
  AUTO_REPORT: {
    enableHealthChecks: true,
    maxInitializationTime: 30000,
    maxRetries: 2,
    retryDelay: 1000,
    enableFallbacks: true,
    logLevel: 'info' as const
  },
  PROJECT_CREATION: {
    enableHealthChecks: true,
    maxInitializationTime: 60000,
    maxRetries: 5,
    retryDelay: 2000,
    enableFallbacks: true,
    logLevel: 'info' as const
  },
  BACKGROUND_PROCESSING: {
    enableHealthChecks: false,
    maxInitializationTime: 120000,
    maxRetries: 3,
    retryDelay: 5000,
    enableFallbacks: true,
    logLevel: 'warn' as const
  }
} as const;

/**
 * Initialize services for report generation endpoints (API routes like /api/reports/generate)
 */
export async function initializeReportGenerationEndpoint(
  correlationId?: string,
  customConfig?: Partial<ServiceInitializationConfig>
): Promise<ReportGenerationServices> {
  const config = {
    ...ENDPOINT_CONFIGS.REPORT_GENERATION,
    ...customConfig,
    correlationId: correlationId || generateCorrelationId()
  };

  const correlatedLogger = createCorrelationLogger(config.correlationId);
  
  correlatedLogger.info('Initializing services for report generation endpoint', {
    endpoint: 'report-generation',
    correlationId: config.correlationId,
    config: {
      enableHealthChecks: config.enableHealthChecks,
      maxRetries: config.maxRetries,
      enableFallbacks: config.enableFallbacks
    }
  });

  try {
    const services = await ServiceInitializationFactory.initializeReportGenerationServices(config);
    
    correlatedLogger.info('Report generation endpoint services initialized successfully', {
      correlationId: config.correlationId,
      services: {
        reportingService: services.reportingService.health.status,
        analysisService: services.analysisService.health.status,
        autoReportService: services.autoReportService.health.status
      }
    });

    return services;
  } catch (error) {
    correlatedLogger.error('Failed to initialize report generation endpoint services', error as Error, {
      correlationId: config.correlationId
    });
    throw error;
  }
}

/**
 * Initialize services for auto-report endpoints (API routes like /api/reports/auto-generate)
 */
export async function initializeAutoReportEndpoint(
  correlationId?: string,
  customConfig?: Partial<ServiceInitializationConfig>
): Promise<ReportGenerationServices> {
  const config = {
    ...ENDPOINT_CONFIGS.AUTO_REPORT,
    ...customConfig,
    correlationId: correlationId || generateCorrelationId()
  };

  const correlatedLogger = createCorrelationLogger(config.correlationId);
  
  correlatedLogger.info('Initializing services for auto-report endpoint', {
    endpoint: 'auto-report',
    correlationId: config.correlationId
  });

  try {
    const services = await ServiceInitializationFactory.initializeReportGenerationServices(config);
    
    // Add initial report service for auto-report functionality
    const initialReportService = await ServiceInitializationFactory.initializeInitialReportService(
      config,
      config.correlationId
    );
    
    const enhancedServices = {
      ...services,
      initialReportService
    };

    correlatedLogger.info('Auto-report endpoint services initialized successfully', {
      correlationId: config.correlationId,
      servicesCount: Object.keys(enhancedServices).length
    });

    return enhancedServices;
  } catch (error) {
    correlatedLogger.error('Failed to initialize auto-report endpoint services', error as Error, {
      correlationId: config.correlationId
    });
    throw error;
  }
}

/**
 * Initialize services for project creation endpoints (API routes like /api/projects)
 */
export async function initializeProjectCreationEndpoint(
  correlationId?: string,
  customConfig?: Partial<ServiceInitializationConfig>
): Promise<ReportGenerationServices> {
  const config = {
    ...ENDPOINT_CONFIGS.PROJECT_CREATION,
    ...customConfig,
    correlationId: correlationId || generateCorrelationId()
  };

  const correlatedLogger = createCorrelationLogger(config.correlationId);
  
  correlatedLogger.info('Initializing services for project creation endpoint', {
    endpoint: 'project-creation',
    correlationId: config.correlationId
  });

  try {
    const services = await ServiceInitializationFactory.initializeReportGenerationServices(config);
    
    // Add both initial report service and report generator for project creation
    const [initialReportService, reportGenerator] = await Promise.all([
      ServiceInitializationFactory.initializeInitialReportService(config, config.correlationId),
      ServiceInitializationFactory.initializeReportGenerator(config, config.correlationId)
    ]);
    
    const enhancedServices = {
      ...services,
      initialReportService,
      reportGenerator
    };

    correlatedLogger.info('Project creation endpoint services initialized successfully', {
      correlationId: config.correlationId,
      servicesCount: Object.keys(enhancedServices).length
    });

    return enhancedServices;
  } catch (error) {
    correlatedLogger.error('Failed to initialize project creation endpoint services', error as Error, {
      correlationId: config.correlationId
    });
    throw error;
  }
}

/**
 * Initialize services for background processing (scheduled tasks, cron jobs)
 */
export async function initializeBackgroundProcessingServices(
  correlationId?: string,
  customConfig?: Partial<ServiceInitializationConfig>
): Promise<ReportGenerationServices> {
  const config = {
    ...ENDPOINT_CONFIGS.BACKGROUND_PROCESSING,
    ...customConfig,
    correlationId: correlationId || generateCorrelationId()
  };

  const correlatedLogger = createCorrelationLogger(config.correlationId);
  
  correlatedLogger.info('Initializing services for background processing', {
    endpoint: 'background-processing',
    correlationId: config.correlationId
  });

  try {
    const services = await ServiceInitializationFactory.initializeReportGenerationServices(config);
    
    correlatedLogger.info('Background processing services initialized successfully', {
      correlationId: config.correlationId,
      healthChecksDisabled: !config.enableHealthChecks
    });

    return services;
  } catch (error) {
    correlatedLogger.error('Failed to initialize background processing services', error as Error, {
      correlationId: config.correlationId
    });
    throw error;
  }
}

/**
 * Generic service cleanup helper for all endpoints
 */
export function cleanupEndpointServices(correlationId: string): void {
  logger.info('Cleaning up endpoint services', { correlationId });
  ServiceInitializationFactory.cleanup(correlationId);
}

/**
 * Validate service health for endpoints
 */
export function validateServiceHealth(services: ReportGenerationServices): {
  isHealthy: boolean;
  healthyCount: number;
  totalCount: number;
  unhealthyServices: string[];
} {
  const serviceEntries = Object.entries(services);
  const healthyServices = serviceEntries.filter(([_, service]) => service?.health.isHealthy);
  const unhealthyServices = serviceEntries
    .filter(([_, service]) => service && !service.health.isHealthy)
    .map(([name, _]) => name);

  return {
    isHealthy: healthyServices.length === serviceEntries.length,
    healthyCount: healthyServices.length,
    totalCount: serviceEntries.length,
    unhealthyServices
  };
}

/**
 * Get service initialization documentation for endpoints
 */
export function getEndpointServiceDocumentation(): string {
  return `
# Endpoint Service Initialization Documentation

## Overview
This module provides standardized service initialization patterns for different types of endpoints in the report generation system.

## Available Endpoint Helpers

### 1. Report Generation Endpoints
\`\`\`typescript
import { initializeReportGenerationEndpoint } from '@/lib/service-initialization/endpoint-helpers';

const services = await initializeReportGenerationEndpoint(correlationId);
// Use services.reportingService, services.analysisService, etc.
\`\`\`

### 2. Auto-Report Endpoints
\`\`\`typescript
import { initializeAutoReportEndpoint } from '@/lib/service-initialization/endpoint-helpers';

const services = await initializeAutoReportEndpoint(correlationId);
// Includes additional initialReportService for immediate report generation
\`\`\`

### 3. Project Creation Endpoints
\`\`\`typescript
import { initializeProjectCreationEndpoint } from '@/lib/service-initialization/endpoint-helpers';

const services = await initializeProjectCreationEndpoint(correlationId);
// Includes full service suite for project creation workflows
\`\`\`

### 4. Background Processing
\`\`\`typescript
import { initializeBackgroundProcessingServices } from '@/lib/service-initialization/endpoint-helpers';

const services = await initializeBackgroundProcessingServices(correlationId);
// Optimized for long-running background tasks
\`\`\`

## Configuration Presets

Each endpoint type has optimized configuration presets:

- **Report Generation**: Fast initialization (45s timeout, 3 retries)
- **Auto-Report**: Balanced (30s timeout, 2 retries)  
- **Project Creation**: Robust (60s timeout, 5 retries)
- **Background Processing**: Patient (120s timeout, health checks disabled)

## Cleanup

Always cleanup services when done:
\`\`\`typescript
import { cleanupEndpointServices } from '@/lib/service-initialization/endpoint-helpers';

cleanupEndpointServices(correlationId);
\`\`\`

## Health Validation

Check service health before using:
\`\`\`typescript
import { validateServiceHealth } from '@/lib/service-initialization/endpoint-helpers';

const healthStatus = validateServiceHealth(services);
if (!healthStatus.isHealthy) {
  console.warn('Unhealthy services:', healthStatus.unhealthyServices);
}
\`\`\`
  `;
} 