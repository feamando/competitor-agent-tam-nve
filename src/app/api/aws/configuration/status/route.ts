// Task 6.2.1: Create /api/aws/configuration/status endpoint
// Task 6.2.2: Return configuration status without credential validation
// Task 6.2.3: Add caching for configuration status
// Task 6.2.4: Add rate limiting to configuration endpoint

import { NextRequest, NextResponse } from 'next/server';
import { checkAWSConfiguration, getStartupConfigurationStatus, AWSConfigurationStatus } from '@/lib/aws/awsConfigurationChecker';
import { healthEndpointRateLimiter } from '@/lib/rateLimiter';

// Task 6.2.3: Add caching for configuration status
let cachedConfigurationStatus: AWSConfigurationStatus | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds

/**
 * Task 6.2.3: Check if cache is still valid
 */
function isCacheValid(): boolean {
  return cachedConfigurationStatus !== null && 
         (Date.now() - cacheTimestamp) < CACHE_DURATION;
}

/**
 * Task 6.2.3: Update cache with new configuration status
 */
function updateCache(status: AWSConfigurationStatus): void {
  cachedConfigurationStatus = status;
  cacheTimestamp = Date.now();
}

/**
 * Task 6.2.2: Get configuration status without credential validation
 */
function getConfigurationStatus(): AWSConfigurationStatus {
  // Task 6.2.3: Return cached status if valid
  if (isCacheValid()) {
    return cachedConfigurationStatus!;
  }
  
  // Try to get startup status first (most efficient)
  const startupStatus = getStartupConfigurationStatus();
  if (startupStatus && (Date.now() - new Date(startupStatus.timestamp).getTime()) < CACHE_DURATION) {
    updateCache(startupStatus);
    return startupStatus;
  }
  
  // If no valid startup status, check configuration fresh
  const freshStatus = checkAWSConfiguration();
  updateCache(freshStatus);
  return freshStatus;
}

/**
 * Task 6.2.4: Get cache headers for response
 */
function getCacheHeaders(): HeadersInit {
  const remainingCacheTime = isCacheValid() 
    ? Math.max(0, CACHE_DURATION - (Date.now() - cacheTimestamp))
    : 0;
    
  return {
    'Cache-Control': `public, max-age=${Math.floor(remainingCacheTime / 1000)}, stale-while-revalidate=60`,
    'Last-Modified': cachedConfigurationStatus 
      ? new Date(cachedConfigurationStatus.timestamp).toUTCString()
      : new Date().toUTCString(),
    'X-Cache-Status': isCacheValid() ? 'HIT' : 'MISS'
  };
}

export async function GET(request: NextRequest) {
  try {
    // Task 6.2.4: Add rate limiting to configuration endpoint
    const rateLimitResult = healthEndpointRateLimiter.check(request);
    const rateLimitHeaders = healthEndpointRateLimiter.getRateLimitHeaders(rateLimitResult);
    
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { 
          error: 'Rate limit exceeded for configuration endpoint',
          retryAfter: Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000)
        },
        { 
          status: 429,
          headers: {
            ...rateLimitHeaders,
            'Retry-After': Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000).toString()
          }
        }
      );
    }
    
    // Task 6.2.2: Return configuration status without credential validation
    const configStatus = getConfigurationStatus();
    
    const response = {
      success: true,
      data: {
        isConfigured: configStatus.isConfigured,
        configurationLevel: configStatus.configurationLevel,
        hasAccessKeyId: configStatus.hasAccessKeyId,
        hasSecretAccessKey: configStatus.hasSecretAccessKey,
        hasRegion: configStatus.hasRegion,
        missingVariables: configStatus.missingVariables,
        timestamp: configStatus.timestamp,
        // Note: We don't return actual credential values for security
        message: configStatus.isConfigured 
          ? 'AWS configuration complete'
          : `AWS configuration ${configStatus.configurationLevel} - missing: ${configStatus.missingVariables.join(', ')}`
      },
      cache: {
        cached: isCacheValid(),
        cacheAge: isCacheValid() ? Date.now() - cacheTimestamp : 0,
        cacheExpiry: cacheTimestamp + CACHE_DURATION
      },
      timestamp: new Date().toISOString()
    };
    
    return NextResponse.json(response, {
      status: 200,
      headers: {
        ...getCacheHeaders(),
        ...rateLimitHeaders
      }
    });
    
  } catch (error) {
    console.error('Error in AWS configuration status endpoint:', error);
    
    const rateLimitResult = healthEndpointRateLimiter.check(request);
    const rateLimitHeaders = healthEndpointRateLimiter.getRateLimitHeaders(rateLimitResult);
    
    return NextResponse.json(
      {
        error: 'Failed to check AWS configuration status',
        success: false,
        timestamp: new Date().toISOString()
      },
      { 
        status: 500,
        headers: rateLimitHeaders
      }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Task 6.2.4: Add rate limiting to configuration endpoint
    const rateLimitResult = healthEndpointRateLimiter.check(request);
    const rateLimitHeaders = healthEndpointRateLimiter.getRateLimitHeaders(rateLimitResult);
    
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { 
          error: 'Rate limit exceeded for configuration endpoint',
          retryAfter: Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000)
        },
        { 
          status: 429,
          headers: {
            ...rateLimitHeaders,
            'Retry-After': Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000).toString()
          }
        }
      );
    }
    
    // For POST, force refresh the configuration status (bypass cache)
    const freshStatus = checkAWSConfiguration();
    updateCache(freshStatus);
    
    const response = {
      success: true,
      data: {
        isConfigured: freshStatus.isConfigured,
        configurationLevel: freshStatus.configurationLevel,
        hasAccessKeyId: freshStatus.hasAccessKeyId,
        hasSecretAccessKey: freshStatus.hasSecretAccessKey,
        hasRegion: freshStatus.hasRegion,
        missingVariables: freshStatus.missingVariables,
        timestamp: freshStatus.timestamp,
        message: freshStatus.isConfigured 
          ? 'AWS configuration complete'
          : `AWS configuration ${freshStatus.configurationLevel} - missing: ${freshStatus.missingVariables.join(', ')}`
      },
      cache: {
        refreshed: true,
        cacheAge: 0,
        cacheExpiry: cacheTimestamp + CACHE_DURATION
      },
      timestamp: new Date().toISOString()
    };
    
    return NextResponse.json(response, {
      status: 200,
      headers: {
        ...getCacheHeaders(),
        ...rateLimitHeaders
      }
    });
    
  } catch (error) {
    console.error('Error in AWS configuration status refresh:', error);
    
    const rateLimitResult = healthEndpointRateLimiter.check(request);
    const rateLimitHeaders = healthEndpointRateLimiter.getRateLimitHeaders(rateLimitResult);
    
    return NextResponse.json(
      {
        error: 'Failed to refresh AWS configuration status',
        success: false,
        timestamp: new Date().toISOString()
      },
      { 
        status: 500,
        headers: rateLimitHeaders
      }
    );
  }
} 