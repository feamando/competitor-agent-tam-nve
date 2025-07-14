import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { BedrockService } from '@/services/bedrock/bedrockService';

export interface AWSCredentialInput {
  profileName: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  awsRegion: string;
}

export interface AWSCredentialRecord {
  id: string;
  profileName: string;
  awsRegion: string;
  isValid: boolean;
  validationError?: string;
  lastValidatedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface DecryptedAWSCredentials {
  profileName: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string | undefined;
  awsRegion: string;
}

export interface ValidationResult {
  isValid: boolean;
  error?: string;
  latency?: number;
}

export class AWSCredentialService {
  /**
   * Save AWS credentials to database with encryption
   */
  async saveCredentials(credentials: AWSCredentialInput): Promise<AWSCredentialRecord> {
    try {
      // Save to database (no encryption)
      const savedCredentials = await prisma.aWSCredentials.upsert({
        where: { profileName: credentials.profileName },
        update: {
          accessKeyId: credentials.accessKeyId,
          secretAccessKey: credentials.secretAccessKey,
          sessionToken: credentials.sessionToken,
          awsRegion: credentials.awsRegion,
          updatedAt: new Date(),
          isValid: false, // Mark as invalid until validated
          validationError: null,
          lastValidatedAt: null
        },
        create: {
          profileName: credentials.profileName,
          accessKeyId: credentials.accessKeyId,
          secretAccessKey: credentials.secretAccessKey,
          sessionToken: credentials.sessionToken,
          awsRegion: credentials.awsRegion,
          isValid: false,
          validationError: null,
          lastValidatedAt: null
        }
      });

      // Add null guard for saved credentials
      if (!savedCredentials) {
        throw new Error('Failed to save credentials to database');
      }

      logger.info('AWS credentials saved successfully', { 
        profileName: credentials.profileName,
        region: credentials.awsRegion 
      });

      return {
        id: savedCredentials.id,
        profileName: savedCredentials.profileName,
        awsRegion: savedCredentials.awsRegion,
        isValid: savedCredentials.isValid,
        validationError: savedCredentials.validationError || undefined,
        lastValidatedAt: savedCredentials.lastValidatedAt || undefined,
        createdAt: savedCredentials.createdAt,
        updatedAt: savedCredentials.updatedAt
      };
    } catch (error) {
      logger.error('Failed to save AWS credentials', error as Error);
      throw new Error('Failed to save AWS credentials');
    }
  }

  /**
   * Get credentials by profile name (encrypted)
   */
  async getCredentialsByProfile(profileName: string): Promise<AWSCredentialRecord | null> {
    try {
      const credentials = await prisma.aWSCredentials.findUnique({
        where: { profileName }
      });

      if (!credentials) {
        return null;
      }

      return {
        id: credentials.id,
        profileName: credentials.profileName,
        awsRegion: credentials.awsRegion,
        isValid: credentials.isValid,
        validationError: credentials.validationError || undefined,
        lastValidatedAt: credentials.lastValidatedAt || undefined,
        createdAt: credentials.createdAt,
        updatedAt: credentials.updatedAt
      };
    } catch (error) {
      logger.error('Failed to get AWS credentials', error as Error);
      throw new Error('Failed to retrieve AWS credentials');
    }
  }

  /**
   * Get decrypted credentials for use in services
   */
  async getDecryptedCredentials(profileName: string): Promise<DecryptedAWSCredentials | null> {
    try {
      const credentials = await prisma.aWSCredentials.findUnique({
        where: { profileName }
      });

      if (!credentials) {
        return null;
      }

      // Return plain text credentials (no decryption needed)
      return {
        profileName: credentials.profileName,
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        sessionToken: credentials.sessionToken || undefined,
        awsRegion: credentials.awsRegion
      };
    } catch (error) {
      logger.error('Failed to get AWS credentials', error as Error);
      throw new Error('Failed to retrieve AWS credentials');
    }
  }

  /**
   * Validate AWS credentials by testing Bedrock connection
   */
  async validateCredentials(profileName: string): Promise<ValidationResult> {
    try {
      const credentials = await this.getDecryptedCredentials(profileName);
      
      if (!credentials) {
        return { isValid: false, error: 'Credentials not found' };
      }

      // Test Bedrock connection
      const startTime = Date.now();
      const bedrockService = new BedrockService({
        region: credentials.awsRegion,
        credentials: {
          accessKeyId: credentials.accessKeyId,
          secretAccessKey: credentials.secretAccessKey,
          sessionToken: credentials.sessionToken
        }
      });

      const testMessages = [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Hi' }]
        }
      ];

      await bedrockService.generateCompletion(testMessages);
      const latency = Date.now() - startTime;

      // Update validation status in database
      await prisma.aWSCredentials.update({
        where: { profileName },
        data: {
          isValid: true,
          validationError: null,
          lastValidatedAt: new Date()
        }
      });

      logger.info('AWS credentials validated successfully', { 
        profileName, 
        latency 
      });

      return { isValid: true, latency };
    } catch (error) {
      const errorMessage = (error as Error).message;
      
      // Update validation status in database
      await prisma.aWSCredentials.update({
        where: { profileName },
        data: {
          isValid: false,
          validationError: errorMessage,
          lastValidatedAt: new Date()
        }
      });

      logger.error('AWS credentials validation failed', error as Error, { profileName });
      return { isValid: false, error: errorMessage };
    }
  }

  /**
   * List all credential profiles
   */
  async listCredentialProfiles(): Promise<AWSCredentialRecord[]> {
    try {
      const credentials = await prisma.aWSCredentials.findMany({
        orderBy: { updatedAt: 'desc' }
      });

      return credentials.map(cred => ({
        id: cred.id,
        profileName: cred.profileName,
        awsRegion: cred.awsRegion,
        isValid: cred.isValid,
        validationError: cred.validationError || undefined,
        lastValidatedAt: cred.lastValidatedAt || undefined,
        createdAt: cred.createdAt,
        updatedAt: cred.updatedAt
      }));
    } catch (error) {
      logger.error('Failed to list AWS credential profiles', error as Error);
      throw new Error('Failed to list AWS credential profiles');
    }
  }

  /**
   * Delete credentials by profile name
   */
  async deleteCredentials(profileName: string): Promise<boolean> {
    try {
      await prisma.aWSCredentials.delete({
        where: { profileName }
      });

      logger.info('AWS credentials deleted successfully', { profileName });
      return true;
    } catch (error) {
      logger.error('Failed to delete AWS credentials', error as Error, { profileName });
      return false;
    }
  }

  /**
   * Get the primary/default credentials (first valid profile)
   */
  async getPrimaryCredentials(): Promise<DecryptedAWSCredentials | null> {
    try {
      const credentials = await prisma.aWSCredentials.findFirst({
        where: { isValid: true },
        orderBy: { lastValidatedAt: 'desc' }
      });

      if (!credentials) {
        return null;
      }

      return await this.getDecryptedCredentials(credentials.profileName);
    } catch (error) {
      logger.error('Failed to get primary AWS credentials', error as Error);
      return null;
    }
  }
} 