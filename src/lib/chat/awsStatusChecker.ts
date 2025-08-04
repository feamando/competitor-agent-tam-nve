import { logger } from '@/lib/logger';
import { AWSCredentialsService } from '@/services/aws/awsCredentialsService';

export interface AWSStatusResult {
  available: boolean;
  message: string;
  canProceedWithReports: boolean;
  fallbackToBasicCreation: boolean;
  error?: string;
}

export class ChatAWSStatusChecker {
  private static instance: ChatAWSStatusChecker;
  private credentialsService: AWSCredentialsService;
  private lastCheckTime: number = 0;
  private lastResult: AWSStatusResult | null = null;
  private readonly CACHE_DURATION = 120000; // 2 minutes to reduce rate limiting
  private isChecking: boolean = false;
  private readonly CHECK_TIMEOUT = 1500; // 1.5 seconds max for AWS checks to prevent hanging

  constructor() {
    this.credentialsService = new AWSCredentialsService();
  }

  public static getInstance(): ChatAWSStatusChecker {
    if (!ChatAWSStatusChecker.instance) {
      ChatAWSStatusChecker.instance = new ChatAWSStatusChecker();
    }
    return ChatAWSStatusChecker.instance;
  }

  /**
   * Check AWS status with caching and non-blocking approach
   */
  async checkAWSStatus(forceRefresh: boolean = false): Promise<AWSStatusResult> {
    const now = Date.now();
    
    // Use cached result if available and not expired
    if (!forceRefresh && this.lastResult && (now - this.lastCheckTime) < this.CACHE_DURATION) {
      logger.debug('Using cached AWS status result');
      return this.lastResult;
    }

    // If already checking, return cached result or safe default
    if (this.isChecking) {
      logger.debug('AWS status check already in progress, returning cached result');
      return this.lastResult || {
        available: false,
        message: 'AWS status check in progress',
        canProceedWithReports: false,
        fallbackToBasicCreation: true
      };
    }

    this.isChecking = true;
    
    try {
      logger.info('Checking AWS status for chat project creation');
      
      // Test AWS connection with timeout
      const connectionTestPromise = this.credentialsService.testConnection();
      const timeoutPromise = new Promise<{ success: false; error: string }>((_, reject) => {
        setTimeout(() => reject(new Error('AWS status check timeout')), this.CHECK_TIMEOUT);
      });
      
      const connectionTest = await Promise.race([connectionTestPromise, timeoutPromise]);
      
      if (connectionTest.success) {
        this.lastResult = {
          available: true,
          message: 'AWS services are available',
          canProceedWithReports: true,
          fallbackToBasicCreation: false
        };
        
        logger.info('AWS services are available for chat project creation');
      } else {
        // Check if it's an expired token error
        const isExpiredToken = connectionTest.error?.includes('ExpiredTokenException') || 
                              connectionTest.error?.includes('expired');
        
        this.lastResult = {
          available: false,
          message: isExpiredToken 
            ? 'AWS credentials have expired. Project will be created without AI-generated reports.'
            : 'AWS services are temporarily unavailable. Project will be created without AI-generated reports.',
          canProceedWithReports: false,
          fallbackToBasicCreation: true,
          ...(connectionTest.error && { error: connectionTest.error })
        };
        
        logger.warn('AWS services unavailable for chat project creation', {
          error: connectionTest.error,
          isExpiredToken
        });
      }
      
    } catch (error) {
      logger.error('Failed to check AWS status', error as Error);
      
      this.lastResult = {
        available: false,
        message: 'Failed to verify AWS services. Project will be created without AI-generated reports.',
        canProceedWithReports: false,
        fallbackToBasicCreation: true,
        error: (error as Error).message
      };
    } finally {
      this.isChecking = false;
    }

    this.lastCheckTime = now;
    return this.lastResult!;
  }

  /**
   * Clear cached status to force fresh check
   */
  clearCache(): void {
    this.lastResult = null;
    this.lastCheckTime = 0;
  }

  /**
   * Get current cached status without triggering a check
   */
  getCachedStatus(): AWSStatusResult {
    return this.lastResult || {
      available: false,
      message: 'AWS status not yet checked',
      canProceedWithReports: false,
      fallbackToBasicCreation: true
    };
  }
} 