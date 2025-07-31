/**
 * Task 4.1: Demonstration API endpoint with Enhanced Emergency Fallback System
 * Shows integration of circuit breaker patterns, retry mechanisms, and error classification
 */

import { NextRequest, NextResponse } from 'next/server';
import { EmergencyFallbackMiddleware, FallbackMiddlewareConfig } from '@/lib/emergency-fallback/EmergencyFallbackMiddleware';
import { emergencyFallbackSystem } from '@/lib/emergency-fallback/EmergencyFallbackSystem';
import { initializeReportGenerationEndpoint, cleanupEndpointServices } from '@/lib/service-initialization/endpoint-helpers';
import { 
  logger, 
  generateCorrelationId, 
  createCorrelationLogger,
  trackBusinessEvent,
  trackCorrelation 
} from '@/lib/logger';

// Configuration for this endpoint's fallback behavior
const FALLBACK_CONFIG: FallbackMiddlewareConfig = {
  enableCircuitBreaker: true,
  enableRetry: true,
  enableEmergencyMode: true,
  maxRetries: 3,
  timeoutMs: 45000,
  operationType: 'report_generation'
};

/**
 * Enhanced report generation with comprehensive fallback protection
 */
async function generateReportWithFallback(request: NextRequest, context: any): Promise<any> {
  const { correlationId, projectId } = context;
  const correlatedLogger = createCorrelationLogger(correlationId);
  
  const apiContext = {
    endpoint: '/api/reports/generate-with-fallback',
    projectId,
    correlationId
  };

  correlatedLogger.info('Starting enhanced report generation with fallback protection', apiContext);

  try {
    // Get request parameters
    const { searchParams } = new URL(request.url);
    const competitorId = searchParams.get('competitorId');
    const timeframe = parseInt(searchParams.get('timeframe') || '30', 10);

    if (!competitorId) {
      throw new Error('Competitor ID is required');
    }

    // Initialize services with consolidated pattern from Task 3.2
    const services = await initializeReportGenerationEndpoint(correlationId);
    
    trackCorrelation(correlationId, 'services_initialized', {
      ...apiContext,
      servicesHealthy: services.reportingService.health.isHealthy && 
                      services.analysisService.health.isHealthy
    });

              // Execute report generation (simplified for demonstration)
     const reportResult = {
       success: true,
       taskId: generateCorrelationId(),
       processingTime: 5000,
       message: 'Report generated successfully'
     };

     // Simulate potential failure for testing fallback
     if (Math.random() < 0.1) { // 10% chance of failure
       throw new Error('Simulated service failure for fallback testing');
     }

    trackBusinessEvent('enhanced_report_generated_successfully', {
      ...apiContext,
      competitorId,
      timeframe,
      reportId: reportResult.taskId
    });

    correlatedLogger.info('Enhanced report generation completed successfully', {
      ...apiContext,
      reportId: reportResult.taskId,
      processingTime: reportResult.processingTime
    });

    return {
      success: true,
      projectId,
      competitorId,
      timeframe,
      reportId: reportResult.taskId,
      processingTime: reportResult.processingTime,
      message: 'Report generated successfully with enhanced fallback protection',
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    correlatedLogger.error('Report generation failed, fallback system will handle', error as Error, apiContext);
    
    // Re-throw to let the fallback system handle it
    throw error;
  } finally {
    // Clean up services from Task 3.2
    try {
      cleanupEndpointServices(correlationId);
    } catch (cleanupError) {
      correlatedLogger.warn('Service cleanup failed', { 
        error: (cleanupError as Error).message, 
        correlationId 
      });
    }
  }
}

/**
 * POST endpoint with emergency fallback protection
 */
export const POST = EmergencyFallbackMiddleware.withFallback(
  generateReportWithFallback,
  FALLBACK_CONFIG
);

/**
 * GET endpoint to check system status and circuit breaker states  
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const correlationId = generateCorrelationId();
  const correlatedLogger = createCorrelationLogger(correlationId);

  try {
    correlatedLogger.info('Emergency fallback system status check requested');

    // Get system status from the emergency fallback system
    const systemStatus = emergencyFallbackSystem.getSystemStatus();
    
    // Enhanced status with additional information
    const enhancedStatus = {
      ...systemStatus,
      timestamp: new Date().toISOString(),
      correlationId,
      systemHealth: {
        circuitBreakersOpen: systemStatus.circuitBreakers.filter(cb => cb.state === 'open').length,
        circuitBreakersHalfOpen: systemStatus.circuitBreakers.filter(cb => cb.state === 'half_open').length,
        circuitBreakersClosed: systemStatus.circuitBreakers.filter(cb => cb.state === 'closed').length,
        projectsInEmergencyMode: systemStatus.emergencyModeProjects.length,
        overallHealthy: systemStatus.circuitBreakers.every(cb => cb.state === 'closed') && 
                       systemStatus.emergencyModeProjects.length === 0
      },
             recommendations: [] as string[]
    };

    // Add recommendations based on system state
    if (enhancedStatus.systemHealth.circuitBreakersOpen > 0) {
      enhancedStatus.recommendations.push('Some services have circuit breakers in OPEN state. Check service health.');
    }
    
    if (enhancedStatus.systemHealth.projectsInEmergencyMode > 0) {
      enhancedStatus.recommendations.push('Some projects are in emergency mode. Check system capacity and dependencies.');
    }

    if (enhancedStatus.systemHealth.overallHealthy) {
      enhancedStatus.recommendations.push('System is operating normally. All fallback mechanisms are ready.');
    }

    trackBusinessEvent('emergency_fallback_status_checked', {
      correlationId,
      circuitBreakersOpen: enhancedStatus.systemHealth.circuitBreakersOpen,
      emergencyModeProjects: enhancedStatus.systemHealth.projectsInEmergencyMode,
      overallHealthy: enhancedStatus.systemHealth.overallHealthy
    });

    return NextResponse.json({
      success: true,
      data: enhancedStatus,
      message: 'Emergency fallback system status retrieved successfully',
      timestamp: new Date().toISOString(),
      correlationId
    });

  } catch (error) {
    correlatedLogger.error('Failed to get emergency fallback system status', error as Error);
    
    return NextResponse.json({
      success: false,
      error: 'Failed to retrieve system status',
      correlationId,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
} 