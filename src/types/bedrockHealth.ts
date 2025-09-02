/**
 * Bedrock service health and error types
 * Implements TP-029 enhanced error handling and monitoring
 */

export interface BedrockHealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  service: string;
  timestamp: string;
  responseTime: string;
  details: {
    region?: string;
    provider?: string;
    validationPassed: boolean;
    errorType?: string;
  };
  error?: string;
}

export interface BedrockServiceMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  lastHealthCheck: string;
  circuitBreakerState: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
}

export enum BedrockErrorType {
  TIMEOUT = 'timeout',
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  QUOTA_EXCEEDED = 'quota_exceeded',
  SERVICE_ERROR = 'service_error',
  INITIALIZATION_ERROR = 'initialization_error',
  VALIDATION_ERROR = 'validation_error'
}

export class BedrockServiceError extends Error {
  public readonly errorType: BedrockErrorType;
  public readonly timestamp: string;
  public readonly serviceName: string;

  constructor(
    message: string,
    errorType: BedrockErrorType,
    serviceName: string = 'BedrockService'
  ) {
    super(message);
    this.name = 'BedrockServiceError';
    this.errorType = errorType;
    this.timestamp = new Date().toISOString();
    this.serviceName = serviceName;
  }
}

export class BedrockInitializationError extends BedrockServiceError {
  constructor(message: string, cause?: Error) {
    super(
      `Bedrock service initialization failed: ${message}${cause ? ` (Cause: ${cause.message})` : ''}`,
      BedrockErrorType.INITIALIZATION_ERROR
    );
  }
}

export class BedrockValidationError extends BedrockServiceError {
  constructor(message: string, cause?: Error) {
    super(
      `Bedrock service validation failed: ${message}${cause ? ` (Cause: ${cause.message})` : ''}`,
      BedrockErrorType.VALIDATION_ERROR
    );
  }
}

export interface ReportGenerationFallbackInfo {
  reason: 'bedrock_unavailable' | 'initialization_failed' | 'validation_failed' | 'timeout';
  timestamp: string;
  fallbackType: 'basic_template' | 'cached_result' | 'minimal_analysis';
  originalError?: string;
}