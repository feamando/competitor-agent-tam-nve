import { BedrockService } from '@/services/bedrock/bedrock.service';
import { BedrockMessage } from '@/services/bedrock/types';
import { logger } from '@/lib/logger';
import { AWSCredentialService } from './awsCredentialService';

export interface AWSCredentialsStatus {
  isConfigured: boolean;
  isValid: boolean;
  region: string;
  error?: string;
  lastChecked: Date;
  connectionTest?: {
    success: boolean;
    latency?: number;
    error?: string;
  };
}

export class AWSCredentialsService {
  private bedrockService: BedrockService;
  private lastStatus: AWSCredentialsStatus | null = null;
  private statusCacheTime = 5 * 60 * 1000; // 5 minutes
  private credentialService: AWSCredentialService;

  constructor() {
    this.bedrockService = new BedrockService({}, 'anthropic');
    this.credentialService = new AWSCredentialService();
  }

  /**
   * Check if AWS credentials are configured
   */
  public async checkCredentialsConfigured(): Promise<boolean> {
    try {
      // Check for primary credentials in database first
      const primaryCredentials = await this.credentialService.getPrimaryCredentials();
      if (primaryCredentials) {
        return true;
      }

      // Fallback to environment variables
      return !!(
        process.env.AWS_ACCESS_KEY_ID &&
        process.env.AWS_SECRET_ACCESS_KEY &&
        process.env.AWS_REGION
      );
    } catch (error) {
      logger.error('Failed to check credentials configuration', error as Error);
      // Fallback to environment variables
      return !!(
        process.env.AWS_ACCESS_KEY_ID &&
        process.env.AWS_SECRET_ACCESS_KEY &&
        process.env.AWS_REGION
      );
    }
  }

  /**
   * Test AWS Bedrock connection
   */
  public async testConnection(): Promise<{ success: boolean; latency?: number; error?: string }> {
    const startTime = Date.now();
    
    try {
      // Try to use database credentials first
      const primaryCredentials = await this.credentialService.getPrimaryCredentials();
      let bedrockService: BedrockService;

      if (primaryCredentials) {
        // Use database credentials
        const credentials: any = {
          accessKeyId: primaryCredentials.accessKeyId,
          secretAccessKey: primaryCredentials.secretAccessKey
        };
        
        if (primaryCredentials.sessionToken) {
          credentials.sessionToken = primaryCredentials.sessionToken;
        }

        bedrockService = new BedrockService({
          region: primaryCredentials.awsRegion,
          credentials
        }, 'anthropic');
      } else {
        // Fallback to environment variables
        bedrockService = new BedrockService({}, 'anthropic');
      }

      const testMessages: BedrockMessage[] = [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Hi' }]
        }
      ];

      await bedrockService.generateCompletion(testMessages);
      const latency = Date.now() - startTime;
      
      return { success: true, latency };
    } catch (error) {
      logger.error('AWS Bedrock connection test failed', error as Error);
      return { 
        success: false, 
        error: (error as Error).message,
        latency: Date.now() - startTime 
      };
    }
  }

  /**
   * Get comprehensive AWS credentials status
   */
  public async getCredentialsStatus(forceRefresh: boolean = false): Promise<AWSCredentialsStatus> {
    // Return cached status if available and not expired
    if (!forceRefresh && this.lastStatus && 
        Date.now() - this.lastStatus.lastChecked.getTime() < this.statusCacheTime) {
      return this.lastStatus;
    }

    const isConfigured = await this.checkCredentialsConfigured();
    const region = process.env.AWS_REGION || 'eu-west-1';
    const now = new Date();

    if (!isConfigured) {
      this.lastStatus = {
        isConfigured: false,
        isValid: false,
        region,
        error: 'AWS credentials not configured. Please set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_REGION environment variables.',
        lastChecked: now
      };
      return this.lastStatus;
    }

    // Test connection
    const connectionTest = await this.testConnection();
    
    this.lastStatus = {
      isConfigured: true,
      isValid: connectionTest.success,
      region,
      lastChecked: now,
      connectionTest,
      ...(connectionTest.error && { error: connectionTest.error })
    };

    return this.lastStatus;
  }

  /**
   * Get user-friendly error message
   */
  public getErrorMessage(status: AWSCredentialsStatus): string {
    if (!status.isConfigured) {
      return 'AWS credentials are not configured. Please contact your system administrator.';
    }

    if (!status.isValid) {
      if (status.error?.includes('UnauthorizedOperation') || status.error?.includes('AccessDenied')) {
        return 'AWS credentials are invalid or expired. Please refresh your credentials.';
      }
      
      if (status.error?.includes('NetworkingError') || status.error?.includes('connect')) {
        return 'Unable to connect to AWS services. Please check your internet connection.';
      }
      
      return `AWS connection failed: ${status.error?.substring(0, 100)}...`;
    }

    return 'AWS credentials are valid and working properly.';
  }

  /**
   * Get status summary for UI display
   */
  public getStatusSummary(status: AWSCredentialsStatus): {
    status: 'healthy' | 'warning' | 'error';
    message: string;
    details?: string;
  } {
    if (!status.isConfigured) {
      return {
        status: 'error',
        message: 'AWS Not Configured',
        details: 'Comparative analysis unavailable'
      };
    }

    if (!status.isValid) {
      return {
        status: 'error',
        message: 'AWS Connection Failed',
        details: status.error ? `Error: ${status.error.substring(0, 50)}...` : 'Unable to connect to AWS services'
      };
    }

    const latency = status.connectionTest?.latency;
    if (latency && latency > 5000) {
      return {
        status: 'warning',
        message: 'AWS Connection Slow',
        details: `Response time: ${latency}ms`
      };
    }

    return {
      status: 'healthy',
      message: 'AWS Connected',
      details: latency ? `Response time: ${latency}ms` : 'Connection verified'
    };
  }

  /**
   * Clear cached status
   */
  public clearCache(): void {
    this.lastStatus = null;
  }
} 