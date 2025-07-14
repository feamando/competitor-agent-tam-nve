import { AWSCredentialService, AWSCredentialRecord } from './awsCredentialService';
import { BedrockCredentials } from '@/services/bedrock/types';
import { logger } from '@/lib/logger';

export interface CredentialProviderOptions {
  forceStoredCredentials?: boolean;
  preferredProfile?: string;
}

export class CredentialProvider {
  private awsCredentialService: AWSCredentialService;
  private cachedCredentials: BedrockCredentials | null = null;
  private lastCacheTime: number = 0;
  private cacheTTL: number = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.awsCredentialService = new AWSCredentialService();
  }

  /**
   * Get AWS credentials with fallback priority:
   * 1. Stored credentials (if valid)
   * 2. Environment variables
   * 3. Return null if none available
   */
  async getCredentials(options: CredentialProviderOptions = {}): Promise<BedrockCredentials | null> {
    try {
      // Check cache first
      if (this.cachedCredentials && this.isCacheValid()) {
        logger.debug('Using cached credentials');
        return this.cachedCredentials;
      }

      let credentials: BedrockCredentials | null = null;

      // Try stored credentials first
      if (!options.forceStoredCredentials || options.preferredProfile) {
        credentials = await this.getStoredCredentials(options.preferredProfile);
        if (credentials) {
          logger.info('Using stored AWS credentials');
          this.updateCache(credentials);
          return credentials;
        }
      }

      // Fallback to environment variables
      credentials = this.getEnvironmentCredentials();
      if (credentials) {
        logger.info('Using environment AWS credentials');
        this.updateCache(credentials);
        return credentials;
      }

      logger.warn('No AWS credentials available');
      return null;
    } catch (error) {
      logger.error('Error getting AWS credentials', error as Error);
      return this.getEnvironmentCredentials(); // Fallback to env vars on error
    }
  }

  /**
   * Get stored credentials from database
   */
  private async getStoredCredentials(preferredProfile?: string): Promise<BedrockCredentials | null> {
    try {
      const profiles = await this.awsCredentialService.listCredentialProfiles();
      
      if (profiles.length === 0) {
        return null;
      }

      // Use preferred profile if specified
      const targetProfile = preferredProfile 
        ? profiles.find((p: AWSCredentialRecord) => p.profileName === preferredProfile)
        : profiles.find((p: AWSCredentialRecord) => p.isValid) || profiles[0]; // Use first valid profile or first profile

      if (!targetProfile) {
        return null;
      }

      const credentials = await this.awsCredentialService.getDecryptedCredentials(targetProfile.profileName);
      
      if (!credentials) {
        return null;
      }

      // Properly handle optional sessionToken
      const result: BedrockCredentials = {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
      };

      if (credentials.sessionToken) {
        result.sessionToken = credentials.sessionToken;
      }

      return result;
    } catch (error) {
      logger.error('Error fetching stored credentials', error as Error);
      return null;
    }
  }

  /**
   * Get credentials from environment variables
   */
  private getEnvironmentCredentials(): BedrockCredentials | null {
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

    if (!accessKeyId || !secretAccessKey) {
      return null;
    }

    // Properly handle optional sessionToken
    const result: BedrockCredentials = {
      accessKeyId,
      secretAccessKey,
    };

    const sessionToken = process.env.AWS_SESSION_TOKEN;
    if (sessionToken) {
      result.sessionToken = sessionToken;
    }

    return result;
  }

  /**
   * Get AWS region with similar fallback priority
   */
  async getRegion(options: CredentialProviderOptions = {}): Promise<string> {
    try {
      // Try stored region first
      const profiles = await this.awsCredentialService.listCredentialProfiles();
      
      if (profiles.length > 0) {
        const targetProfile = options.preferredProfile 
          ? profiles.find((p: AWSCredentialRecord) => p.profileName === options.preferredProfile)
          : profiles.find((p: AWSCredentialRecord) => p.isValid) || profiles[0];

        if (targetProfile) {
          const credentials = await this.awsCredentialService.getDecryptedCredentials(targetProfile.profileName);
          if (credentials?.awsRegion) {
            return credentials.awsRegion;
          }
        }
      }
    } catch (error) {
      logger.error('Error getting stored region', error as Error);
    }

    // Fallback to environment variable
    return process.env.AWS_REGION || 'us-east-1';
  }

  /**
   * Check if any credentials are available
   */
  async hasCredentials(options: CredentialProviderOptions = {}): Promise<boolean> {
    const credentials = await this.getCredentials(options);
    return credentials !== null;
  }

  /**
   * Clear cached credentials
   */
  clearCache(): void {
    this.cachedCredentials = null;
    this.lastCacheTime = 0;
  }

  /**
   * Update cache with new credentials
   */
  private updateCache(credentials: BedrockCredentials): void {
    this.cachedCredentials = credentials;
    this.lastCacheTime = Date.now();
  }

  /**
   * Check if cache is still valid
   */
  private isCacheValid(): boolean {
    return Date.now() - this.lastCacheTime < this.cacheTTL;
  }

  /**
   * Force refresh credentials (clears cache and fetches new)
   */
  async refreshCredentials(options: CredentialProviderOptions = {}): Promise<BedrockCredentials | null> {
    this.clearCache();
    return this.getCredentials(options);
  }
} 