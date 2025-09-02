import { NextApiRequest, NextApiResponse } from 'next';
import { BedrockServiceFactory } from '../../../services/bedrock/bedrockServiceFactory';

/**
 * Health check endpoint for Bedrock service
 * Implements TP-029 Task 2.4: Add health check endpoint for monitoring
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const startTime = Date.now();

  try {
    console.log('[API/system-health/bedrock] Starting Bedrock service health check');

    // Create BedrockService instance
    const bedrockService = await BedrockServiceFactory.createService({
      provider: 'anthropic',
      useStoredCredentials: true,
      fallbackToEnvironment: true,
      retryOnFailure: false // Don't retry for health checks
    });

    // Validate service availability
    await bedrockService.validateServiceAvailability();

    const responseTime = Date.now() - startTime;

    const healthResponse = {
      status: 'healthy',
      service: 'bedrock',
      timestamp: new Date().toISOString(),
      responseTime: `${responseTime}ms`,
      details: {
        region: 'us-east-1', // Default region, could be made configurable
        provider: 'anthropic',
        validationPassed: true
      }
    };

    console.log('[API/system-health/bedrock] Health check successful', healthResponse);
    
    return res.status(200).json(healthResponse);
  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    const errorResponse = {
      status: 'unhealthy',
      service: 'bedrock',
      timestamp: new Date().toISOString(),
      responseTime: `${responseTime}ms`,
      error: error.message,
      details: {
        validationPassed: false,
        errorType: getErrorType(error.message)
      }
    };

    console.error('[API/system-health/bedrock] Health check failed', errorResponse);
    
    return res.status(503).json(errorResponse);
  }
}

/**
 * Categorize error types for better monitoring
 */
function getErrorType(errorMessage: string): string {
  if (errorMessage.includes('timeout')) {
    return 'timeout';
  } else if (errorMessage.includes('credentials')) {
    return 'authentication';
  } else if (errorMessage.includes('permissions') || errorMessage.includes('AccessDenied')) {
    return 'authorization';
  } else if (errorMessage.includes('quota') || errorMessage.includes('limit')) {
    return 'quota_exceeded';
  } else {
    return 'service_error';
  }
}