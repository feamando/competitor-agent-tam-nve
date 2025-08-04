import { useState, useEffect, useCallback } from 'react';
import { logger } from '@/lib/logger';
import { healthCheckMonitor, type FailureRateMetrics } from '@/lib/monitoring/healthCheckMonitor';

// Circuit breaker constants
const CIRCUIT_FAILURE_THRESHOLD = 3;
const CIRCUIT_COOLDOWN_TIME = 30 * 60 * 1000; // 30 minutes in milliseconds

// Task 4.1.1: Add MAX_RETRY_DELAY = 60000 constant
const MAX_RETRY_DELAY = 60000; // 60 seconds maximum retry delay

// Task 4.2.1: Add getRetryDelay(errorCode) function
function getRetryDelay(errorCode: string | null, errorCategory: string | null, retryCount: number): { delay: number; shouldRetry: boolean } {
  const baseDelay = 1000 * Math.pow(2, retryCount); // Standard exponential backoff
  
  // Task 4.2.4: Skip retries for permanent configuration errors
  if (errorCode === 'NOT_CONFIGURED' && errorCategory === 'CONFIGURATION') {
    return { delay: 0, shouldRetry: false }; // Don't retry configuration errors
  }
  
  // Task 4.2.2: Use longer delays for "not configured" errors
  if (errorCategory === 'CONFIGURATION' || errorCode?.includes('CONFIG')) {
    const configDelay = Math.min(baseDelay * 3, MAX_RETRY_DELAY); // 3x longer for config issues
    return { delay: configDelay, shouldRetry: true };
  }
  
  // Task 4.2.3: Use shorter delays for network errors
  if (errorCategory === 'NETWORK' || errorCode?.includes('NETWORK') || errorCode?.includes('TIMEOUT')) {
    const networkDelay = Math.min(Math.max(baseDelay * 0.5, 1000), MAX_RETRY_DELAY); // 0.5x shorter, min 1s
    return { delay: networkDelay, shouldRetry: true };
  }
  
  // Authentication errors - handle expired credentials specially
  if (errorCategory === 'AUTHENTICATION' || errorCode?.includes('AUTH') || errorCode?.includes('CREDENTIALS')) {
    // For expired/invalid credentials, use much longer delays to prevent rate limiting
    if (errorCode === 'INVALID_CREDENTIALS' || errorCode?.includes('EXPIRED') || errorCode?.includes('TOKEN')) {
      // Very long delay for expired credentials - essentially pause polling
      const expiredDelay = Math.min(baseDelay * 10, 300000); // 10x longer, max 5 minutes
      return { delay: expiredDelay, shouldRetry: false }; // Don't retry expired credentials
    }
    const authDelay = Math.min(baseDelay * 1.5, MAX_RETRY_DELAY); // 1.5x longer for other auth issues
    return { delay: authDelay, shouldRetry: true };
  }
  
  // Service errors - standard with some variation
  if (errorCategory === 'SERVICE' || errorCode === 'RATE_LIMITED') {
    if (errorCode === 'RATE_LIMITED') {
      // Rate limited errors should use longer delays
      const rateLimitDelay = Math.min(baseDelay * 2, MAX_RETRY_DELAY);
      return { delay: rateLimitDelay, shouldRetry: true };
    }
    const serviceDelay = Math.min(baseDelay * 1.2, MAX_RETRY_DELAY); // Slightly longer for service issues
    return { delay: serviceDelay, shouldRetry: true };
  }
  
  // Default/Unknown errors - standard exponential backoff
  const defaultDelay = Math.min(baseDelay, MAX_RETRY_DELAY);
  return { delay: defaultDelay, shouldRetry: true };
}

export interface AWSStatus {
  // Task 2.2.1: Add CONFIGURATION_REQUIRED status enum
  status: 'healthy' | 'unhealthy' | 'unknown' | 'configuration_required';
  configured: boolean;
  valid: boolean;
  region: string;
  message: string;
  details?: string;
  errorMessage?: string;
  lastChecked: string;
  // Task 2.1.2: Add specific error code field
  errorCode?: 'NOT_CONFIGURED' | 'INVALID_CREDENTIALS' | null;
  // Task 3.1.3: Add error category field
  errorCategory?: 'CONFIGURATION' | 'AUTHENTICATION' | 'NETWORK' | 'SERVICE' | 'UNKNOWN' | null;
  connectionTest?: {
    success: boolean;
    latency?: number;
  };
}

export interface AWSStatusHookReturn {
  status: AWSStatus | null;
  isLoading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refreshStatus: () => Promise<void>;
  isRefreshing: boolean;
  // Task 1.4.4: Add visual indicator for cooldown countdown
  cooldownTimeRemaining?: number | undefined; // in milliseconds, undefined when circuit is closed
  // Task 2.4.1: Add autoRefreshEnabled to support manual check button
  autoRefreshEnabled: boolean;
  // Task 4.3.1 & 4.3.4: Add pausing mechanism support
  isPaused: boolean;
  resumePolling: () => void;
  // Task 8.1.3: Store failure rate in component state
  failureMetrics: FailureRateMetrics | null;
  // Task 8.2.3: Add visual indicator for high failure rate
  isHighFailureRate: boolean;
}

interface UseAWSStatusOptions {
  autoRefresh?: boolean;
  refreshInterval?: number; // in milliseconds
  retryOnError?: boolean;
  maxRetries?: number;
}

export function useAWSStatus(options: UseAWSStatusOptions = {}): AWSStatusHookReturn {
  const {
    autoRefresh = true,
    refreshInterval = 5 * 60 * 1000, // 5 minutes default
    retryOnError = true,
    maxRetries = 3
  } = options;

  const [status, setStatus] = useState<AWSStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // Circuit breaker state variables (Tasks 1.1.1, 1.1.2, 1.1.3)
  const [isCircuitOpen, setIsCircuitOpen] = useState(false);
  const [failureCount, setFailureCount] = useState(0);
  const [lastFailureTime, setLastFailureTime] = useState<Date | null>(null);
  
  // Task 1.4.4: Cooldown countdown state
  const [cooldownTimeRemaining, setCooldownTimeRemaining] = useState<number>(0);
  
  // Task 9.3.1: Measure time to first AWS status check
  const [firstCheckStartTime] = useState<number>(() => performance.now());
  const [firstCheckCompleted, setFirstCheckCompleted] = useState(false);
  
  // Task 2.3.4: Add state variable autoRefreshEnabled
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState<boolean>(true);
  
  // Task 4.2.1: Track last error information for smart retry logic
  const [lastErrorInfo, setLastErrorInfo] = useState<{
    errorCode: string | null;
    errorCategory: string | null;
  }>({ errorCode: null, errorCategory: null });
  
  // Task 4.3.1: Add isPaused state variable
  const [isPaused, setIsPaused] = useState<boolean>(false);
  
  // Task 4.4.1: Track previous status to detect success transitions
  const [previousStatus, setPreviousStatus] = useState<AWSStatus | null>(null);
  
  // Task 8.1.3: Store failure rate in component state
  const [failureMetrics, setFailureMetrics] = useState<FailureRateMetrics | null>(null);

  // Task 2.3.1: Check configuration status before setting up intervals
  const updateAutoRefreshStatus = useCallback(() => {
    const shouldEnableRefresh = !status || status.configured || !isCredentialsNotConfigured(status);
    
    if (shouldEnableRefresh !== autoRefreshEnabled) {
      setAutoRefreshEnabled(shouldEnableRefresh);
      logger.info('Auto-refresh status updated based on configuration', {
        configured: status?.configured,
        isNotConfigured: status ? isCredentialsNotConfigured(status) : false,
        autoRefreshEnabled: shouldEnableRefresh,
        previousAutoRefreshEnabled: autoRefreshEnabled
      });
    }
  }, [status, autoRefreshEnabled]);

  // Task 1.4.2 & 1.4.3: Check cooldown and reset circuit if cooldown period elapsed
  const checkAndResetCircuitCooldown = useCallback(() => {
    if (isCircuitOpen && lastFailureTime) {
      const now = new Date();
      const timeSinceFailure = now.getTime() - lastFailureTime.getTime();
      const remaining = CIRCUIT_COOLDOWN_TIME - timeSinceFailure;
      
      if (remaining <= 0) {
        // Task 1.4.3: Set isCircuitOpen = false after cooldown period
        setIsCircuitOpen(false);
        setFailureCount(0);
        setCooldownTimeRemaining(0);
        logger.info('Circuit breaker: Circuit closed after cooldown period', {
          cooldownTime: CIRCUIT_COOLDOWN_TIME,
          timeSinceFailure,
          wasCircuitOpen: true
        });
        return false; // Circuit is now closed
      } else {
        // Task 1.4.4: Update cooldown countdown
        setCooldownTimeRemaining(remaining);
        return true; // Circuit is still open
      }
    }
    return isCircuitOpen;
  }, [isCircuitOpen, lastFailureTime]);

  const fetchAWSStatus = useCallback(async (forceRefresh = false): Promise<void> => {
    // Task 8.4.1: Measure health check response time
    const startTime = performance.now();
    
    // Task 4.3.3: Skip all polling when isPaused === true
    if (isPaused) {
      logger.info('AWS status polling is paused - skipping fetch', {
        isPaused,
        reason: 'Credentials not configured'
      });
      return;
    }
    
    // Task 1.4.2: Check time elapsed since lastFailureTime before retry
    const circuitStillOpen = checkAndResetCircuitCooldown();
    
    // Task 1.3.1: Check if failureCount >= CIRCUIT_FAILURE_THRESHOLD before fetch
    // Task 1.3.3: Skip fetch request when circuit is open
    if (circuitStillOpen) {
      logger.info('Circuit breaker: Skipping fetch request - circuit is open', {
        failureCount,
        threshold: CIRCUIT_FAILURE_THRESHOLD,
        isCircuitOpen: circuitStillOpen,
        cooldownTimeRemaining
      });
      return;
    }
    
    try {
      if (forceRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      setError(null);

      const url = forceRefresh ? '/api/health/aws?refresh=true' : '/api/health/aws';
      
      logger.debug('Fetching AWS status', { 
        url, 
        forceRefresh,
        retryCount 
      });

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        cache: forceRefresh ? 'no-cache' : 'default'
      });

      if (!response.ok) {
        // Task 8.4.1: Calculate response time for failed HTTP responses
        const endTime = performance.now();
        const responseTime = endTime - startTime;
        
        // Task 3.2.4: Update client error handling for new status codes
        const errorData = await response.json();
        
        if (response.status === 424) {
          // Task 8.1.1: Record monitoring attempt for configuration error
          const correlationId = healthCheckMonitor.recordAttempt(false, responseTime, 'NOT_CONFIGURED');
          
          // Task 9.1.1, 9.1.2, 9.1.3 & 9.1.4: Structured logging for AWS credentials not configured
          logger.warn('AWS health check - credentials not configured', {
            correlationId,
            operation: 'aws_health_check',
            operationType: 'health_monitoring',
            result: 'configuration_required',
            responseTime: Math.round(responseTime),
            httpStatus: response.status,
            awsError: {
              errorCode: errorData.errorCode,
              errorCategory: errorData.errorCategory,
              configured: errorData.configured,
              message: errorData.errorMessage || 'AWS credentials not configured'
            },
            contextualInfo: {
              endpoint: '/api/health/aws',
              method: 'GET',
              retryCount,
              maxRetries,
              circuitBreakerStatus: isCircuitOpen ? 'open' : 'closed'
            },
            nextAction: 'user_configuration_required'
          });
          
          // Task 8.1.3: Update failure metrics in component state
          setFailureMetrics(healthCheckMonitor.getMetrics());
          
          // Task 4.2.1: Store error information for smart retry logic
          setLastErrorInfo({
            errorCode: errorData.errorCode || 'NOT_CONFIGURED',
            errorCategory: errorData.errorCategory || 'CONFIGURATION'
          });
          
          // Task 4.3.2: Set isPaused = true when credentials not configured
          setIsPaused(true);
          logger.info('Pausing AWS status polling - credentials not configured', {
            errorCode: errorData.errorCode,
            isPaused: true
          });
          
          // Task 4.4.1: Store previous status for transition tracking (424 error)
          setPreviousStatus(status);
          setStatus({
            status: 'configuration_required',
            configured: false,
            valid: false,
            region: errorData.region || 'unknown',
            message: 'Setup Required', // Task 5.1.3: Add "Setup Required" text for not configured state
            details: 'AWS credentials need to be configured',
            errorMessage: errorData.errorMessage || 'AWS credentials not configured',
            errorCode: errorData.errorCode || 'NOT_CONFIGURED',
            errorCategory: errorData.errorCategory || 'CONFIGURATION',
            lastChecked: errorData.timestamp || new Date().toISOString()
          });
          
          // Don't increment failure count for configuration issues - this is expected
          logger.info('Configuration issue detected - not counting as failure', {
            configured: false,
            failureCount
          });
          
          setError(null); // Clear error since this is a configuration state, not a failure
          setLastUpdated(new Date());
          return; // Exit early without retry logic
          
        } else if (response.status === 401) {
          // Task 3.2.2: Handle 401 status code for invalid credentials
          logger.warn('AWS credentials are invalid', {
            status: response.status,
            errorCode: errorData.errorCode,
            errorCategory: errorData.errorCategory
          });
          
          // Task 8.1.1: Record monitoring attempt for authentication error
          const correlationId401 = healthCheckMonitor.recordAttempt(false, responseTime, 'INVALID_CREDENTIALS');
          
          // Task 8.1.3: Update failure metrics in component state
          setFailureMetrics(healthCheckMonitor.getMetrics());
          
          // Task 4.2.1: Store error information for smart retry logic
          setLastErrorInfo({
            errorCode: errorData.errorCode || 'INVALID_CREDENTIALS',
            errorCategory: errorData.errorCategory || 'AUTHENTICATION'
          });
          
          // Task 4.4.1: Store previous status for transition tracking (401 error)
          setPreviousStatus(status);
          setStatus({
            status: 'unhealthy',
            configured: true,
            valid: false,
            region: errorData.region || 'unknown',
            message: 'Invalid AWS Credentials',
            details: 'AWS credentials are invalid or expired',
            errorMessage: errorData.errorMessage || 'AWS credentials are invalid',
            errorCode: errorData.errorCode || 'INVALID_CREDENTIALS',
            errorCategory: errorData.errorCategory || 'AUTHENTICATION',
            lastChecked: errorData.timestamp || new Date().toISOString()
          });
          
          setError(errorData.errorMessage || 'Invalid AWS credentials');
          setLastUpdated(new Date());
          
          // For invalid/expired credentials, pause polling to prevent rate limiting
          const isExpiredOrInvalid = errorData?.errorMessage?.includes('security token') || 
                                   errorData?.errorMessage?.includes('expired') ||
                                   errorData?.errorMessage?.includes('invalid') ||
                                   errorData?.errorCode === 'INVALID_CREDENTIALS';
          
          if (isExpiredOrInvalid) {
            setIsPaused(true);
            logger.info('Pausing AWS status polling - credentials expired/invalid', {
              errorCode: errorData.errorCode,
              isPaused: true,
              reason: 'expired_credentials_detected'
            });
            return; // Exit early without retry logic
          }
          // Let normal retry logic handle other authentication errors
          
        } else if (response.status === 503) {
          // Task 3.2.3: Handle 503 status code for service/network errors
          logger.warn('AWS service unavailable', {
            status: response.status,
            errorCode: errorData.errorCode,
            errorCategory: errorData.errorCategory
          });
          
          // Task 8.1.1: Record monitoring attempt for service error
          const correlationId503 = healthCheckMonitor.recordAttempt(false, responseTime, 'SERVICE_ERROR');
          
          // Task 8.1.3: Update failure metrics in component state
          setFailureMetrics(healthCheckMonitor.getMetrics());
          
          // Task 4.2.1: Store error information for smart retry logic
          setLastErrorInfo({
            errorCode: errorData.errorCode || 'SERVICE_ERROR',
            errorCategory: errorData.errorCategory || 'NETWORK'
          });
          
          // Task 4.4.1: Store previous status for transition tracking (503 error)
          setPreviousStatus(status);
          setStatus({
            status: 'unhealthy',
            configured: errorData.configured !== false,
            valid: false,
            region: errorData.region || 'unknown',
            message: 'AWS Service Unavailable',
            details: 'Temporary connectivity issue with AWS services',
            errorMessage: errorData.errorMessage || 'AWS service temporarily unavailable',
            errorCode: errorData.errorCode || 'SERVICE_ERROR',
            errorCategory: errorData.errorCategory || 'NETWORK',
            lastChecked: errorData.timestamp || new Date().toISOString()
          });
          
          setError(errorData.errorMessage || 'AWS service temporarily unavailable');
          setLastUpdated(new Date());
          // Let normal retry logic handle service errors
          
        } else if (response.status === 429) {
          // Task 3.3.4: Handle 429 status code for rate limit exceeded
          logger.warn('Rate limit exceeded for AWS health endpoint', {
            status: response.status,
            errorCode: errorData.errorCode,
            retryAfter: errorData.retryAfter
          });
          
          // Task 8.1.1: Record monitoring attempt for rate limit error
          const correlationId429 = healthCheckMonitor.recordAttempt(false, responseTime, 'RATE_LIMITED');
          
          // Task 8.1.3: Update failure metrics in component state
          setFailureMetrics(healthCheckMonitor.getMetrics());
          
          // Task 4.2.1: Store error information for smart retry logic
          setLastErrorInfo({
            errorCode: errorData.errorCode || 'RATE_LIMITED',
            errorCategory: errorData.errorCategory || 'SERVICE'
          });
          
          // Task 4.4.1: Store previous status for transition tracking (429 error)
          setPreviousStatus(status);
          setStatus({
            status: 'unhealthy',
            configured: errorData.configured !== false,
            valid: false,
            region: errorData.region || 'unknown',
            message: 'Rate Limited',
            details: 'Too many requests to AWS health endpoint',
            errorMessage: errorData.errorMessage || 'Rate limit exceeded',
            errorCode: errorData.errorCode || 'RATE_LIMITED',
            errorCategory: errorData.errorCategory || 'SERVICE',
            lastChecked: errorData.timestamp || new Date().toISOString()
          });
          
          setError(errorData.errorMessage || 'Rate limit exceeded');
          setLastUpdated(new Date());
          
          // For rate limiting, wait much longer before retrying and reduce retry attempts
          if (retryOnError && retryCount < Math.min(maxRetries, 2)) { // Limit to 2 retries for rate limits
            const retryDelay = Math.max((errorData.retryAfter || 120) * 1000, 120000); // Min 2 minutes
            setRetryCount(prev => prev + 1);
            logger.info('Rate limited - retrying after extended delay', { 
              retryAfter: errorData.retryAfter,
              retryDelay,
              retryCount: retryCount + 1,
              maxRetries: Math.min(maxRetries, 2)
            });
            
            setTimeout(() => {
              fetchAWSStatus(forceRefresh);
            }, retryDelay);
          } else {
            // Pause polling after max retries for rate limiting
            setIsPaused(true);
            logger.warn('Pausing AWS status polling due to persistent rate limiting', {
              retryCount,
              maxRetries: Math.min(maxRetries, 2),
              isPaused: true
            });
          }
          return; // Exit early to avoid normal retry logic
          
        } else if (response.status === 404) {
          // Handle 404 Not Found - this indicates a routing/compilation issue
          logger.error('AWS health endpoint not found - possible routing or compilation issue', undefined, {
            httpStatus: response.status,
            url: '/api/health/aws',
            statusText: response.statusText
          });
          
          // Record the 404 error for monitoring
          const correlationId404 = healthCheckMonitor.recordAttempt(false, responseTime, 'ENDPOINT_NOT_FOUND');
          setFailureMetrics(healthCheckMonitor.getMetrics());
          
          // Set error info for 404 - treat as configuration/service issue
          setLastErrorInfo({
            errorCode: 'NETWORK_ERROR', // Use existing valid error code
            errorCategory: 'SERVICE'
          });
          
          setPreviousStatus(status);
          setStatus({
            status: 'unknown',
            configured: false,
            valid: false,
            region: 'unknown',
            message: 'Service Unavailable',
            details: 'AWS health endpoint not available - service may be restarting',
            errorMessage: 'Health endpoint not found (404)',
            errorCode: null,
            errorCategory: 'SERVICE',
            lastChecked: new Date().toISOString()
          });
          
          setError('AWS health endpoint not available');
          setLastUpdated(new Date());
          
          // For 404 errors, pause polling temporarily to avoid spamming
          setIsPaused(true);
          logger.warn('Pausing AWS status polling due to 404 errors - endpoint not found', {
            status: response.status,
            isPaused: true,
            retryCount
          });
          
          // Auto-resume after 2 minutes to check if the endpoint is back
          setTimeout(() => {
            if (isPaused) {
              setIsPaused(false);
              logger.info('Auto-resuming AWS status polling after 404 timeout');
            }
          }, 120000); // 2 minutes
          
          return; // Exit early to avoid normal retry logic
          
        } else {
          // Handle other error status codes
          throw new Error(`AWS status check failed: ${response.status} ${response.statusText}`);
        }
      }

      const data = await response.json();
      
      // Task 8.4.1: Calculate response time and record successful attempt
      const endTime = performance.now();
      const responseTime = endTime - startTime;
      const correlationId = healthCheckMonitor.recordAttempt(true, responseTime);
      
      // Task 8.1.3: Update failure metrics in component state
      setFailureMetrics(healthCheckMonitor.getMetrics());
      
      // Task 9.3.1: Log first check completion timing
      if (!firstCheckCompleted) {
        const timeToFirstCheck = performance.now() - firstCheckStartTime;
        setFirstCheckCompleted(true);
        logger.info('AWS health check - first check completed', {
          correlationId,
          operation: 'aws_first_health_check',
          operationType: 'startup_performance',
          timeToFirstCheckMs: Math.round(timeToFirstCheck),
          timeToFirstCheck: timeToFirstCheck.toFixed(2) + 'ms'
        });
      }
      
      // Task 9.1.1 & 9.1.2: Add correlation ID and structured logging for AWS health checks
      logger.info('AWS health check successful', { 
        correlationId,
        operation: 'aws_health_check',
        operationType: 'health_monitoring',
        result: 'success',
        responseTime: Math.round(responseTime),
        responseTimeMs: responseTime.toFixed(2) + 'ms',
        awsStatus: {
          status: data.status,
          configured: data.configured,
          valid: data.valid,
          region: data.region
        },
        metrics: {
          failureRate: failureMetrics?.failureRate || 0,
          consecutiveFailures: 0
        },
        contextualInfo: {
          endpoint: '/api/health/aws',
          method: 'GET',
          userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : 'unknown'
        }
      });

      // Task 4.4.1: Store previous status for transition tracking
      setPreviousStatus(status);
      setStatus(data);
      setLastUpdated(new Date());
      setRetryCount(0); // Reset retry count on success
      
      // Task 4.4.1: Check if status changed from error to success
      const wasError = previousStatus && (
        previousStatus.status === 'unhealthy' || 
        previousStatus.status === 'unknown' || 
        previousStatus.status === 'configuration_required'
      );
      const isNowHealthy = data.status === 'healthy' && data.configured && data.valid;
      const statusChangedToSuccess = wasError && isNowHealthy;
      
      // Task 4.4.2: Reset failureCount = 0 on success
      const previousFailureCount = failureCount;
      const wasCircuitOpen = isCircuitOpen;
      setFailureCount(0);
      
      // Task 4.4.3: Set isCircuitOpen = false on success
      if (isCircuitOpen) {
        setIsCircuitOpen(false);
      }
      
      // Enhanced logging for status transition detection
      if (statusChangedToSuccess) {
        logger.info('AWS status successfully recovered from error state', {
          previousStatus: previousStatus?.status,
          newStatus: data.status,
          wasConfigured: previousStatus?.configured,
          nowConfigured: data.configured,
          wasValid: previousStatus?.valid,
          nowValid: data.valid,
          recoveryCompleted: true
        });
      }
      
      // Task 4.4.4: Resume auto-refresh on successful configuration
      if (!autoRefreshEnabled && data.configured) {
        setAutoRefreshEnabled(true);
        logger.info('Auto-refresh resumed on successful configuration', {
          configured: data.configured,
          valid: data.valid,
          status: data.status,
          wasAutoRefreshEnabled: autoRefreshEnabled,
          statusTransition: statusChangedToSuccess
        });
      }
      
      // Task 4.3.2: Resume polling if we were paused and now have a successful configured response
      if (isPaused && data.configured) {
        setIsPaused(false);
        logger.info('AWS status polling resumed - credentials now working', {
          wasPaused: true,
          configured: data.configured,
          status: data.status
        });
      }
      
      // Task 1.2.4: Add logging for circuit breaker state changes
      if (previousFailureCount > 0 || wasCircuitOpen) {
        logger.info('Circuit breaker: State reset after successful fetch', {
          previousFailureCount,
          newFailureCount: 0,
          wasCircuitOpen,
          isCircuitOpen: false
        });
      }
      
      setError(null);

    } catch (fetchError) {
      const errorMessage = (fetchError as Error).message;
      
      // Task 8.4.1: Calculate response time and record failed attempt
      const endTime = performance.now();
      const responseTime = endTime - startTime;
      const correlationId = healthCheckMonitor.recordAttempt(false, responseTime, 'NETWORK_ERROR');
      
      // Task 8.1.3: Update failure metrics in component state
      setFailureMetrics(healthCheckMonitor.getMetrics());
      
      // Task 4.2.1: Set default error info for network/general errors
      setLastErrorInfo({
        errorCode: 'NETWORK_ERROR',
        errorCategory: 'NETWORK'
      });
      
      // Task 1.2.1: Increment failureCount on each fetch error
      const newFailureCount = failureCount + 1;
      setFailureCount(newFailureCount);
      
      // Task 1.2.3: Update lastFailureTime when error occurs
      const currentTime = new Date();
      setLastFailureTime(currentTime);
      
      // Task 1.2.4: Add logging for circuit breaker state changes
      logger.error('Failed to fetch AWS status', fetchError as Error, {
        retryCount,
        maxRetries,
        forceRefresh,
        failureCount: newFailureCount,
        lastFailureTime: currentTime.toISOString(),
        isCircuitOpen
      });
      
      logger.info('Circuit breaker: Failure count incremented', {
        previousFailureCount: failureCount,
        newFailureCount,
        threshold: CIRCUIT_FAILURE_THRESHOLD,
        lastFailureTime: currentTime.toISOString(),
        isCircuitOpen
      });

      // Task 1.3.2: Set isCircuitOpen = true when threshold reached
      if (newFailureCount >= CIRCUIT_FAILURE_THRESHOLD && !isCircuitOpen) {
        setIsCircuitOpen(true);
        // Task 1.4.4: Initialize cooldown countdown when circuit opens
        setCooldownTimeRemaining(CIRCUIT_COOLDOWN_TIME);
        logger.warn('Circuit breaker: Circuit opened due to consecutive failures', {
          failureCount: newFailureCount,
          threshold: CIRCUIT_FAILURE_THRESHOLD,
          lastFailureTime: currentTime.toISOString(),
          cooldownTime: CIRCUIT_COOLDOWN_TIME
        });
      }

      setError(errorMessage);

      // Set a fallback status for better UX
      // Task 4.4.1: Store previous status for transition tracking (error scenarios)
      setPreviousStatus(status);
      setStatus({
        status: 'unknown',
        configured: false,
        valid: false,
        region: 'unknown',
        message: 'Unable to check AWS status',
        details: errorMessage,
        errorMessage,
        errorCode: null, // Task 2.1.4: Add errorCode field to fallback status
        errorCategory: null, // Task 3.1.3: Add errorCategory field to fallback status
        lastChecked: new Date().toISOString()
      });

      // Task 4.2.1: Use smart retry logic based on error type
      if (retryOnError && retryCount < maxRetries) {
        const smartRetry = getRetryDelay(lastErrorInfo.errorCode, lastErrorInfo.errorCategory, retryCount);
        
        // Task 4.2.4: Skip retries for permanent configuration errors
        if (!smartRetry.shouldRetry) {
          // Task 8.3.1: Log skipped retry with correlation ID
          const skipCorrelationId = `skip-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
          logger.info('AWS health check retry skipped - permanent error', {
            correlationId: skipCorrelationId,
            operation: 'aws_health_check_retry_skip',
            operationType: 'retry_pattern',
            retryAttempt: retryCount + 1,
            maxRetries,
            errorCode: lastErrorInfo.errorCode,
            errorCategory: lastErrorInfo.errorCategory,
            reason: 'permanent_error_detected',
            skipReason: 'configuration_or_permanent_error'
          });
          return; // Exit without retrying
        }
        
        setRetryCount(prev => prev + 1);
        
        // Task 8.3.1: Log retry attempts with correlation ID
        const retryCorrelationId = `retry-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
        logger.info('AWS health check retry attempt', {
          correlationId: retryCorrelationId,
          operation: 'aws_health_check_retry',
          operationType: 'retry_pattern',
          retryAttempt: retryCount + 1,
          maxRetries,
          retryDelay: smartRetry.delay,
          retryReason: {
            errorCode: lastErrorInfo.errorCode,
            errorCategory: lastErrorInfo.errorCategory
          },
          retryStrategy: 'smart_exponential_backoff',
          retryDelayDetails: {
            smartRetryDelay: smartRetry.delay,
            maxRetryDelay: MAX_RETRY_DELAY,
            baseDelay: 1000 * Math.pow(2, retryCount)
          },
          circuitBreakerStatus: isCircuitOpen ? 'open' : 'closed',
          contextualInfo: {
            failureCount,
            consecutiveFailures: failureCount,
            lastFailureTime: lastFailureTime?.toISOString(),
            isPaused
          }
        });

        setTimeout(() => {
          fetchAWSStatus(forceRefresh);
        }, smartRetry.delay);
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [retryOnError, maxRetries, retryCount, failureCount, isCircuitOpen, checkAndResetCircuitCooldown, cooldownTimeRemaining, autoRefreshEnabled, lastErrorInfo, isPaused, status]);

  const refreshStatus = useCallback(async (): Promise<void> => {
    await fetchAWSStatus(true);
  }, [fetchAWSStatus]);
  
  // Task 4.3.4: Add resumePolling() function for manual resume
  const resumePolling = useCallback((): void => {
    if (isPaused) {
      logger.info('Resuming AWS status polling', {
        wasPaused: isPaused,
        action: 'Manual resume'
      });
      
      setIsPaused(false);
      
      // Trigger an immediate status check when resuming
      fetchAWSStatus(true);
    } else {
      logger.debug('resumePolling called but polling was not paused', {
        isPaused
      });
    }
  }, [isPaused, fetchAWSStatus]);

  // Initial fetch
  useEffect(() => {
    fetchAWSStatus(false);
  }, [fetchAWSStatus]);

  // Task 2.3.1: Update auto-refresh status when AWS status changes
  useEffect(() => {
    updateAutoRefreshStatus();
  }, [status, updateAutoRefreshStatus]);

  // Auto-refresh interval
  useEffect(() => {
    if (!autoRefresh || refreshInterval <= 0) {
      return;
    }

    // Task 1.3.4: Clear existing intervals when circuit opens
    if (isCircuitOpen) {
      logger.info('Circuit breaker: Auto-refresh disabled - circuit is open', {
        isCircuitOpen,
        failureCount
      });
      return;
    }

    // Task 2.3.2: Skip interval creation when credentials not configured
    if (!autoRefreshEnabled) {
      logger.info('Auto-refresh disabled - AWS credentials not configured', {
        autoRefreshEnabled,
        configured: status?.configured,
        isNotConfigured: status ? isCredentialsNotConfigured(status) : false
      });
      return;
    }

    const interval = setInterval(() => {
      // Task 4.3.3: Skip all polling when isPaused === true
      // Only auto-refresh if not paused, not loading/refreshing and no recent errors
      if (!isPaused && !isLoading && !isRefreshing && (!error || retryCount >= maxRetries) && !isCircuitOpen && autoRefreshEnabled) {
        logger.debug('Auto-refreshing AWS status', { refreshInterval, isPaused });
        fetchAWSStatus(false);
      } else if (isPaused) {
        logger.debug('Skipping auto-refresh - polling is paused', { isPaused });
      }
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, isLoading, isRefreshing, error, retryCount, maxRetries, fetchAWSStatus, isCircuitOpen, failureCount, autoRefreshEnabled, status, isPaused]);

  // Task 1.4.4: Cooldown countdown timer for visual indicator
  useEffect(() => {
    if (!isCircuitOpen || !lastFailureTime) {
      return;
    }

    const updateCooldown = () => {
      checkAndResetCircuitCooldown();
    };

    // Update immediately
    updateCooldown();

    // Update every second for countdown display
    const cooldownTimer = setInterval(updateCooldown, 1000);

    return () => clearInterval(cooldownTimer);
  }, [isCircuitOpen, lastFailureTime, checkAndResetCircuitCooldown]);

  // Cleanup retry count when component unmounts or options change
  useEffect(() => {
    setRetryCount(0);
  }, [maxRetries, retryOnError]);

  return {
    status,
    isLoading,
    error,
    lastUpdated,
    refreshStatus,
    isRefreshing,
    // Task 1.4.4: Add visual indicator for cooldown countdown
    cooldownTimeRemaining: isCircuitOpen ? cooldownTimeRemaining : undefined,
    // Task 2.4.1: Add autoRefreshEnabled to support manual check button
    autoRefreshEnabled,
    // Task 4.3.1 & 4.3.4: Add pausing mechanism support
    isPaused,
    resumePolling,
    // Task 8.1.3: Store failure rate in component state
    failureMetrics,
    // Task 8.2.3: Add visual indicator for high failure rate
    isHighFailureRate: failureMetrics ? failureMetrics.failureRate >= 50 : false
  };
}

// Task 2.1.3: Add helper function isCredentialsNotConfigured()
export function isCredentialsNotConfigured(status?: AWSStatus): boolean {
  if (!status) return false;
  
  return (
    !status.configured || 
    status.errorCode === 'NOT_CONFIGURED' ||
    (status.errorMessage?.toLowerCase().includes('not configured') ?? false)
  );
}

// Utility function to get status color
export function getAWSStatusColor(status?: AWSStatus): string {
  if (!status) return 'gray';
  
  // Task 2.2.2: Update status display logic for not configured state
  if (isCredentialsNotConfigured(status)) {
    return 'blue'; // Task 2.2.3: Specific color for configuration required state
  }
  
  switch (status.status) {
    case 'healthy':
      return 'green';
    case 'unhealthy':
      return 'red';
    case 'configuration_required':
      return 'gray'; // Task 5.1.1 & 5.1.4: Gray for not configured state
    case 'unknown':
    default:
      return 'yellow';
  }
}

// Utility function to get status icon
export function getAWSStatusIcon(status?: AWSStatus): string {
  if (!status) return '❓';
  
  // Task 2.2.4: Add icon for configuration required state
  if (isCredentialsNotConfigured(status)) {
    return '⚙️'; // Configuration/setup icon
  }
  
  switch (status.status) {
    case 'healthy':
      return '✅';
    case 'unhealthy':
      return '❌';
    case 'configuration_required':
      return '⚙️'; // Task 2.2.4: Configuration icon for setup required
    case 'unknown':
    default:
      return '⚠️';
  }
}

// Utility function to format last updated time
export function formatLastUpdated(lastUpdated: Date | null): string {
  if (!lastUpdated) return 'Never';
  
  const now = new Date();
  const diffMs = now.getTime() - lastUpdated.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  
  if (diffMinutes < 1) {
    return 'Just now';
  } else if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
  } else {
    const diffHours = Math.floor(diffMinutes / 60);
    return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  }
} 