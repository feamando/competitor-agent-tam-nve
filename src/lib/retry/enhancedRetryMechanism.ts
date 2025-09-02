import { logger, generateCorrelationId } from '@/lib/logger';

export interface RetryOptions {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  jitter: boolean;
  retryCondition?: (error: Error, attempt: number) => boolean;
  onRetry?: (error: Error, attempt: number) => void;
  timeoutMs?: number;
}

export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  attemptsUsed: number;
  totalDuration: number;
  retryReasons: string[];
}

export enum RetryErrorType {
  NETWORK_ERROR = 'network_error',
  TIMEOUT_ERROR = 'timeout_error',
  RATE_LIMIT_ERROR = 'rate_limit_error',
  SERVER_ERROR = 'server_error',
  CLIENT_ERROR = 'client_error',
  CONTENT_ERROR = 'content_error',
  UNKNOWN_ERROR = 'unknown_error'
}

export interface RetryableError {
  type: RetryErrorType;
  retryable: boolean;
  delay?: number;
  message: string;
}

export class EnhancedRetryMechanism {
  private static instance: EnhancedRetryMechanism;
  
  public static getInstance(): EnhancedRetryMechanism {
    if (!EnhancedRetryMechanism.instance) {
      EnhancedRetryMechanism.instance = new EnhancedRetryMechanism();
    }
    return EnhancedRetryMechanism.instance;
  }

  /**
   * Execute function with enhanced retry logic
   * Task 2.2: Enhanced retry mechanism for product scraping
   */
  public async executeWithRetry<T>(
    operation: () => Promise<T>,
    options: RetryOptions,
    context: { operationType: string; correlationId?: string; [key: string]: any } = { operationType: 'unknown' }
  ): Promise<RetryResult<T>> {
    const startTime = Date.now();
    const correlationId = context.correlationId || generateCorrelationId();
    const retryReasons: string[] = [];
    
    logger.info('Starting operation with enhanced retry mechanism', {
      ...context,
      correlationId,
      maxRetries: options.maxRetries,
      baseDelay: options.baseDelay
    });

    for (let attempt = 1; attempt <= options.maxRetries + 1; attempt++) {
      const attemptContext = {
        ...context,
        attempt,
        maxRetries: options.maxRetries,
        correlationId
      };

      try {
        logger.info(`Retry attempt ${attempt}/${options.maxRetries + 1}`, attemptContext);
        
        const attemptStartTime = Date.now();
        
        // Execute operation with timeout if specified
        let result: T;
        if (options.timeoutMs) {
          result = await this.executeWithTimeout(operation, options.timeoutMs);
        } else {
          result = await operation();
        }
        
        const attemptDuration = Date.now() - attemptStartTime;
        
        logger.info('Operation succeeded', {
          ...attemptContext,
          attemptDuration,
          totalDuration: Date.now() - startTime
        });

        return {
          success: true,
          result,
          attemptsUsed: attempt,
          totalDuration: Date.now() - startTime,
          retryReasons
        };

      } catch (error) {
        const retryableError = this.classifyError(error as Error);
        const isLastAttempt = attempt > options.maxRetries;
        
        logger.warn(`Attempt ${attempt} failed`, {
          ...attemptContext,
          error: (error as Error).message,
          errorType: retryableError.type,
          retryable: retryableError.retryable,
          isLastAttempt
        });

        retryReasons.push(`Attempt ${attempt}: ${retryableError.message}`);

        // Call onRetry callback if provided
        if (options.onRetry) {
          options.onRetry(error as Error, attempt);
        }

        // Check if we should retry
        const shouldRetry = !isLastAttempt && 
                           retryableError.retryable && 
                           (!options.retryCondition || options.retryCondition(error as Error, attempt));

        if (!shouldRetry) {
          logger.error('Operation failed after retries', error as Error, {
            ...attemptContext,
            totalAttempts: attempt,
            totalDuration: Date.now() - startTime,
            retryReasons
          });

          return {
            success: false,
            error: error as Error,
            attemptsUsed: attempt,
            totalDuration: Date.now() - startTime,
            retryReasons
          };
        }

        // Calculate delay for next attempt
        const delay = this.calculateRetryDelay(attempt, options, retryableError);
        
        logger.info(`Waiting ${delay}ms before next attempt`, {
          ...attemptContext,
          delay,
          nextAttempt: attempt + 1
        });

        await this.sleep(delay);
      }
    }

    // This should never be reached, but just in case
    return {
      success: false,
      error: new Error('Unexpected retry loop exit'),
      attemptsUsed: options.maxRetries + 1,
      totalDuration: Date.now() - startTime,
      retryReasons
    };
  }

  /**
   * Classify errors to determine retry strategy
   */
  private classifyError(error: Error): RetryableError {
    const message = error.message.toLowerCase();
    
    // Network errors - usually retryable
    if (message.includes('network') || 
        message.includes('connection') || 
        message.includes('econnreset') ||
        message.includes('enotfound') ||
        message.includes('timeout')) {
      return {
        type: RetryErrorType.NETWORK_ERROR,
        retryable: true,
        delay: 2000, // 2 second base delay for network errors
        message: `Network error: ${error.message}`
      };
    }

    // Rate limiting - retryable with longer delay
    if (message.includes('rate limit') || 
        message.includes('too many requests') ||
        message.includes('429')) {
      return {
        type: RetryErrorType.RATE_LIMIT_ERROR,
        retryable: true,
        delay: 5000, // 5 second base delay for rate limits
        message: `Rate limited: ${error.message}`
      };
    }

    // Server errors (5xx) - retryable
    if (message.includes('server error') || 
        message.includes('internal server error') ||
        message.includes('bad gateway') ||
        message.includes('service unavailable') ||
        message.includes('gateway timeout')) {
      return {
        type: RetryErrorType.SERVER_ERROR,
        retryable: true,
        delay: 3000, // 3 second base delay for server errors
        message: `Server error: ${error.message}`
      };
    }

    // Timeout errors - retryable
    if (message.includes('timeout') || message.includes('timed out')) {
      return {
        type: RetryErrorType.TIMEOUT_ERROR,
        retryable: true,
        delay: 1000, // 1 second base delay for timeouts
        message: `Timeout error: ${error.message}`
      };
    }

    // Content errors - usually retryable (might be temporary)
    if (message.includes('insufficient content') || 
        message.includes('content validation') ||
        message.includes('empty response')) {
      return {
        type: RetryErrorType.CONTENT_ERROR,
        retryable: true,
        delay: 1500, // 1.5 second base delay for content errors
        message: `Content error: ${error.message}`
      };
    }

    // Client errors (4xx) - usually not retryable
    if (message.includes('not found') || 
        message.includes('unauthorized') ||
        message.includes('forbidden') ||
        message.includes('bad request')) {
      return {
        type: RetryErrorType.CLIENT_ERROR,
        retryable: false,
        message: `Client error (not retryable): ${error.message}`
      };
    }

    // Unknown errors - retryable with caution
    return {
      type: RetryErrorType.UNKNOWN_ERROR,
      retryable: true,
      delay: 2000, // 2 second base delay for unknown errors
      message: `Unknown error: ${error.message}`
    };
  }

  /**
   * Calculate retry delay with exponential backoff and jitter
   */
  private calculateRetryDelay(attempt: number, options: RetryOptions, retryableError: RetryableError): number {
    // Use error-specific delay if available, otherwise use base delay
    const baseDelay = retryableError.delay || options.baseDelay;
    
    // Exponential backoff
    let delay = baseDelay * Math.pow(options.backoffMultiplier, attempt - 1);
    
    // Cap at max delay
    delay = Math.min(delay, options.maxDelay);
    
    // Add jitter if enabled (randomize ±25%)
    if (options.jitter) {
      const jitterRange = delay * 0.25;
      const jitter = (Math.random() - 0.5) * 2 * jitterRange;
      delay = Math.max(0, delay + jitter);
    }
    
    return Math.round(delay);
  }

  /**
   * Execute operation with timeout
   */
  private async executeWithTimeout<T>(operation: () => Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      operation()
        .then(result => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Create retry options for product scraping
   */
  public createProductScrapingRetryOptions(): RetryOptions {
    return {
      maxRetries: 3,
      baseDelay: 1000, // 1 second
      maxDelay: 10000, // 10 seconds
      backoffMultiplier: 2,
      jitter: true,
      timeoutMs: 30000, // 30 seconds per attempt
      retryCondition: (error: Error, attempt: number) => {
        // Don't retry client errors or if we've exceeded reasonable attempts
        const retryableError = this.classifyError(error);
        return retryableError.retryable && attempt <= 3;
      },
      onRetry: (error: Error, attempt: number) => {
        logger.warn(`Product scraping retry ${attempt}`, {
          error: error.message,
          attempt
        });
      }
    };
  }

  /**
   * Create retry options for competitor scraping
   */
  public createCompetitorScrapingRetryOptions(): RetryOptions {
    return {
      maxRetries: 2,
      baseDelay: 800, // 0.8 seconds
      maxDelay: 8000, // 8 seconds
      backoffMultiplier: 2.5,
      jitter: true,
      timeoutMs: 25000, // 25 seconds per attempt
      retryCondition: (error: Error, attempt: number) => {
        const retryableError = this.classifyError(error);
        return retryableError.retryable && attempt <= 2;
      }
    };
  }

  /**
   * Create retry options for data collection
   */
  public createDataCollectionRetryOptions(): RetryOptions {
    return {
      maxRetries: 4,
      baseDelay: 1500, // 1.5 seconds
      maxDelay: 15000, // 15 seconds
      backoffMultiplier: 1.8,
      jitter: true,
      timeoutMs: 45000, // 45 seconds per attempt
      retryCondition: (error: Error, attempt: number) => {
        const retryableError = this.classifyError(error);
        // More lenient retry for data collection
        return retryableError.retryable && attempt <= 4;
      }
    };
  }
}

// Export singleton instance
export const enhancedRetryMechanism = EnhancedRetryMechanism.getInstance(); 