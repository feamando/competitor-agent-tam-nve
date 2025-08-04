import { NextRequest, NextResponse } from 'next/server';
import { AWSCredentialsService } from '@/services/aws/awsCredentialsService';
import { healthEndpointRateLimiter } from '@/lib/rateLimiter';

// Task 3.1.1: Add ErrorCategory enum with values
enum ErrorCategory {
  CONFIGURATION = 'CONFIGURATION',
  AUTHENTICATION = 'AUTHENTICATION', 
  NETWORK = 'NETWORK',
  SERVICE = 'SERVICE',
  UNKNOWN = 'UNKNOWN'
}

const awsCredentialsService = new AWSCredentialsService();

// Task 3.4.1, 3.4.2, 3.4.3: Helper functions for response caching
function getCacheHeaders(isError: boolean = false): Record<string, string> {
  const now = new Date();
  const lastModified = now.toUTCString();
  
  if (isError) {
    // Task 3.4.2: Set cache duration to 5 minutes for failures
    const maxAge = 5 * 60; // 5 minutes in seconds
    return {
      'Cache-Control': `public, max-age=${maxAge}, stale-while-revalidate=30`,
      'Last-Modified': lastModified,
      'Expires': new Date(now.getTime() + maxAge * 1000).toUTCString()
    };
  } else {
    // For successful responses, use shorter cache
    return {
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=15',
      'Last-Modified': lastModified
    };
  }
}

// Task 3.4.4: Check if request has If-Modified-Since header for conditional requests
function checkIfModifiedSince(request: NextRequest, lastModified: Date): boolean {
  const ifModifiedSince = request.headers.get('if-modified-since');
  if (!ifModifiedSince) {
    return true; // No conditional header, proceed with request
  }
  
  try {
    const clientLastModified = new Date(ifModifiedSince);
    const serverLastModified = new Date(lastModified);
    
    // Round down to seconds for comparison (HTTP dates don't include milliseconds)
    const clientTime = Math.floor(clientLastModified.getTime() / 1000);
    const serverTime = Math.floor(serverLastModified.getTime() / 1000);
    
    return serverTime > clientTime;
  } catch (error) {
    // If parsing fails, proceed with request
    return true;
  }
}

// Task 3.1.2: Create categorizeError(error) helper function
function categorizeError(error: any, status?: any): ErrorCategory {
  const errorMessage = error?.message?.toLowerCase() || '';
  const errorName = error?.name?.toLowerCase() || '';
  
  // Configuration errors
  if (!status?.isConfigured || 
      errorMessage.includes('not configured') ||
      errorMessage.includes('missing credentials') ||
      errorMessage.includes('aws_access_key_id') ||
      errorMessage.includes('aws_secret_access_key')) {
    return ErrorCategory.CONFIGURATION;
  }
  
  // Authentication errors
  if (errorMessage.includes('unauthorized') ||
      errorMessage.includes('access denied') ||
      errorMessage.includes('invalid credentials') ||
      errorMessage.includes('signature') ||
      errorMessage.includes('token') ||
      errorName.includes('unauthorizedoperation')) {
    return ErrorCategory.AUTHENTICATION;
  }
  
  // Network errors
  if (errorMessage.includes('network') ||
      errorMessage.includes('timeout') ||
      errorMessage.includes('connect') ||
      errorMessage.includes('dns') ||
      errorMessage.includes('enotfound') ||
      errorMessage.includes('econnrefused') ||
      errorName.includes('networkingerror')) {
    return ErrorCategory.NETWORK;
  }
  
  // Service errors
  if (errorMessage.includes('service') ||
      errorMessage.includes('throttl') ||
      errorMessage.includes('rate limit') ||
      errorMessage.includes('internal server') ||
      errorMessage.includes('bedrock') ||
      errorName.includes('serviceerror')) {
    return ErrorCategory.SERVICE;
  }
  
  return ErrorCategory.UNKNOWN;
}

// Task 3.1.4: Add specific error codes for each category
function getCategoryErrorCode(category: ErrorCategory, error: any, status?: any): string {
  switch (category) {
    case ErrorCategory.CONFIGURATION:
      if (!status?.isConfigured) return 'NOT_CONFIGURED';
      return 'CONFIG_ERROR';
      
    case ErrorCategory.AUTHENTICATION:
      if (error?.message?.toLowerCase().includes('expired')) return 'CREDENTIALS_EXPIRED';
      if (error?.message?.toLowerCase().includes('invalid')) return 'INVALID_CREDENTIALS';
      return 'AUTH_ERROR';
      
    case ErrorCategory.NETWORK:
      if (error?.message?.toLowerCase().includes('timeout')) return 'NETWORK_TIMEOUT';
      if (error?.message?.toLowerCase().includes('dns')) return 'DNS_ERROR';
      return 'NETWORK_ERROR';
      
    case ErrorCategory.SERVICE:
      if (error?.message?.toLowerCase().includes('throttl')) return 'SERVICE_THROTTLED';
      if (error?.message?.toLowerCase().includes('rate limit')) return 'RATE_LIMITED';
      return 'SERVICE_ERROR';
      
    case ErrorCategory.UNKNOWN:
    default:
      return 'UNKNOWN_ERROR';
  }
}

export async function GET(request: NextRequest) {
  // Task 3.4.4: Implement conditional requests with If-Modified-Since
  const lastModifiedTime = new Date();
  if (!checkIfModifiedSince(request, lastModifiedTime)) {
    // Return 304 Not Modified if content hasn't changed
    return new NextResponse(null, {
      status: 304,
      headers: {
        'Last-Modified': lastModifiedTime.toUTCString(),
        'Cache-Control': 'public, max-age=60'
      }
    });
  }

  // Task 3.3.2 & 3.3.4: Add rate limiter middleware to health endpoint
  const rateLimitResult = healthEndpointRateLimiter.check(request);
  const rateLimitHeaders = healthEndpointRateLimiter.getRateLimitHeaders(rateLimitResult);

  if (!rateLimitResult.allowed) {
    // Task 3.3.4: Return 429 status code when rate limit exceeded
    const cacheHeaders = getCacheHeaders(true); // This is an error response
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      status: 'error',
      message: 'Rate limit exceeded',
      details: 'Too many requests to AWS health endpoint',
      errorMessage: 'Rate limit: 10 requests per minute per IP',
      errorCode: 'RATE_LIMITED',
      errorCategory: 'SERVICE',
      retryAfter: Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000)
    }, { 
      status: 429,
      headers: {
        'Retry-After': Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000).toString(),
        ...rateLimitHeaders,
        ...cacheHeaders
      }
    });
  }

  try {
    // Get force refresh parameter
    const { searchParams } = new URL(request.url);
    const forceRefresh = searchParams.get('refresh') === 'true';

    // Get AWS credentials status
    const status = await awsCredentialsService.getCredentialsStatus(forceRefresh);
    const summary = awsCredentialsService.getStatusSummary(status);
    const errorMessage = awsCredentialsService.getErrorMessage(status);

    // Task 2.1.2: Return specific error codes for "not configured" vs "invalid credentials"
    let httpStatus = 200;
    if (!status.isConfigured) {
      httpStatus = 424; // Failed Dependency - credentials not configured
    } else if (!status.isValid) {
      httpStatus = 401; // Unauthorized - invalid credentials  
    }

    const isError = httpStatus !== 200;
    const cacheHeaders = getCacheHeaders(isError);
    
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      status: summary.status,
      configured: status.isConfigured,
      valid: status.isValid,
      region: status.region,
      message: summary.message,
      details: summary.details,
      errorMessage: status.isValid ? null : errorMessage,
      lastChecked: status.lastChecked.toISOString(),
      connectionTest: status.connectionTest ? {
        success: status.connectionTest.success,
        latency: status.connectionTest.latency,
        error: status.connectionTest.error
      } : null,
      // Task 2.1.2: Add specific error code for configuration status
      errorCode: !status.isConfigured ? 'NOT_CONFIGURED' : (!status.isValid ? 'INVALID_CREDENTIALS' : null)
    }, { 
      status: httpStatus,
      headers: {
        ...rateLimitHeaders,
        ...cacheHeaders
      }
    });

  } catch (error: any) {
    console.error('AWS health check failed:', error);
    
    // Task 3.1.3: Update error response to include category
    const errorCategory = categorizeError(error);
    const categoryErrorCode = getCategoryErrorCode(errorCategory, error);
    
    // Determine appropriate HTTP status based on error category
    let httpStatus = 500;
    if (errorCategory === ErrorCategory.CONFIGURATION) {
      httpStatus = 424; // Failed Dependency
    } else if (errorCategory === ErrorCategory.AUTHENTICATION) {
      httpStatus = 401; // Unauthorized
    } else if (errorCategory === ErrorCategory.NETWORK) {
      httpStatus = 503; // Service Unavailable
    }
    
    const cacheHeaders = getCacheHeaders(true); // This is an error response
    
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      status: 'error',
      configured: false,
      valid: false,
      region: 'unknown',
      message: 'Health Check Failed',
      details: 'Unable to check AWS status',
      errorMessage: `Health check error: ${error.message}`,
      lastChecked: new Date().toISOString(),
      connectionTest: null,
      // Task 3.1.3 & 3.1.4: Add category and specific error code
      errorCategory: errorCategory,
      errorCode: categoryErrorCode
    }, { 
      status: httpStatus,
      headers: {
        ...rateLimitHeaders,
        ...cacheHeaders
      }
    });
  }
}

export async function POST(request: NextRequest) {
  // Task 3.4.4: Implement conditional requests with If-Modified-Since
  const lastModifiedTime = new Date();
  if (!checkIfModifiedSince(request, lastModifiedTime)) {
    // Return 304 Not Modified if content hasn't changed
    return new NextResponse(null, {
      status: 304,
      headers: {
        'Last-Modified': lastModifiedTime.toUTCString(),
        'Cache-Control': 'public, max-age=60'
      }
    });
  }

  // Task 3.3.2 & 3.3.4: Add rate limiter middleware to health endpoint
  const rateLimitResult = healthEndpointRateLimiter.check(request);
  const rateLimitHeaders = healthEndpointRateLimiter.getRateLimitHeaders(rateLimitResult);

  if (!rateLimitResult.allowed) {
    // Task 3.3.4: Return 429 status code when rate limit exceeded
    const cacheHeaders = getCacheHeaders(true); // This is an error response
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      status: 'error',
      message: 'Rate limit exceeded',
      details: 'Too many requests to AWS health endpoint',
      errorMessage: 'Rate limit: 10 requests per minute per IP',
      errorCode: 'RATE_LIMITED',
      errorCategory: 'SERVICE',
      retryAfter: Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000),
      refreshed: false
    }, { 
      status: 429,
      headers: {
        'Retry-After': Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000).toString(),
        ...rateLimitHeaders,
        ...cacheHeaders
      }
    });
  }

  try {
    // Force refresh the status
    const status = await awsCredentialsService.getCredentialsStatus(true);
    const summary = awsCredentialsService.getStatusSummary(status);
    const errorMessage = awsCredentialsService.getErrorMessage(status);

    // Task 2.1.2: Return specific error codes for "not configured" vs "invalid credentials"
    let httpStatus = 200;
    if (!status.isConfigured) {
      httpStatus = 424; // Failed Dependency - credentials not configured
    } else if (!status.isValid) {
      httpStatus = 401; // Unauthorized - invalid credentials  
    }

    const isError = httpStatus !== 200;
    const cacheHeaders = getCacheHeaders(isError);
    
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      status: summary.status,
      configured: status.isConfigured,
      valid: status.isValid,
      region: status.region,
      message: summary.message,
      details: summary.details,
      errorMessage: status.isValid ? null : errorMessage,
      lastChecked: status.lastChecked.toISOString(),
      connectionTest: status.connectionTest ? {
        success: status.connectionTest.success,
        latency: status.connectionTest.latency,
        error: status.connectionTest.error
      } : null,
      refreshed: true,
      // Task 2.1.2: Add specific error code for configuration status
      errorCode: !status.isConfigured ? 'NOT_CONFIGURED' : (!status.isValid ? 'INVALID_CREDENTIALS' : null)
    }, { 
      status: httpStatus,
      headers: {
        ...rateLimitHeaders,
        ...cacheHeaders
      }
    });

  } catch (error: any) {
    console.error('AWS health refresh failed:', error);
    
    // Task 3.1.3: Update error response to include category
    const errorCategory = categorizeError(error);
    const categoryErrorCode = getCategoryErrorCode(errorCategory, error);
    
    // Determine appropriate HTTP status based on error category
    let httpStatus = 500;
    if (errorCategory === ErrorCategory.CONFIGURATION) {
      httpStatus = 424; // Failed Dependency
    } else if (errorCategory === ErrorCategory.AUTHENTICATION) {
      httpStatus = 401; // Unauthorized
    } else if (errorCategory === ErrorCategory.NETWORK) {
      httpStatus = 503; // Service Unavailable
    }
    
    const cacheHeaders = getCacheHeaders(true); // This is an error response
    
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      status: 'error',
      configured: false,
      valid: false,
      region: 'unknown',
      message: 'Health Refresh Failed',
      details: 'Unable to refresh AWS status',
      errorMessage: `Health refresh error: ${error.message}`,
      lastChecked: new Date().toISOString(),
      connectionTest: null,
      refreshed: false,
      // Task 3.1.3 & 3.1.4: Add category and specific error code
      errorCategory: errorCategory,
      errorCode: categoryErrorCode
    }, { 
      status: httpStatus,
      headers: {
        ...rateLimitHeaders,
        ...cacheHeaders
      }
    });
  }
} 