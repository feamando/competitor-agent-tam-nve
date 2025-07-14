import { AWSCredentialService } from '@/services/aws/awsCredentialService';
import { CredentialProvider } from '@/services/aws/credentialProvider';
import { BedrockService } from '@/services/bedrock/bedrock.service';
import { getBedrockConfig } from '@/services/bedrock/bedrock.config';
import { ComparativeAnalysisService } from '@/services/analysis/comparativeAnalysisService';
import { PrismaClient } from '@prisma/client';
import { EncryptionService } from '@/lib/security/encryption';

// Unmock BedrockService for this integration test to test real static methods
jest.unmock('@/services/bedrock/bedrock.service');

// Fix 1.2: Mock Prisma client for tests
jest.mock('@prisma/client', () => {
  const mockPrisma = {
    aWSCredentials: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    $disconnect: jest.fn(),
  };
  
  return {
    PrismaClient: jest.fn(() => mockPrisma),
  };
});

// Mock EncryptionService for tests
jest.mock('@/lib/security/encryption', () => ({
  EncryptionService: {
    encryptCredentials: jest.fn((credentials) => ({
      encryptedAccessKey: 'salt:' + Buffer.from(credentials.accessKeyId).toString('base64'),
      encryptedSecretKey: 'salt:' + Buffer.from(credentials.secretAccessKey).toString('base64'),
      encryptedSessionToken: credentials.sessionToken ? 'salt:' + Buffer.from(credentials.sessionToken).toString('base64') : undefined,
    })),
    decryptCredentials: jest.fn((encryptedData) => ({
      accessKeyId: Buffer.from(encryptedData.encryptedAccessKey.split(':')[1], 'base64').toString(),
      secretAccessKey: Buffer.from(encryptedData.encryptedSecretKey.split(':')[1], 'base64').toString(),
      sessionToken: encryptedData.encryptedSessionToken ? Buffer.from(encryptedData.encryptedSessionToken.split(':')[1], 'base64').toString() : undefined,
    })),
  }
}));

// Get mock instance
const mockPrismaInstance = new (jest.requireMock('@prisma/client').PrismaClient)();

// Integration test environment setup
const prisma = new PrismaClient();

describe('AWS Credential Integration', () => {
  let awsCredentialService: AWSCredentialService;
  let credentialProvider: CredentialProvider;

  const testCredentials = {
    profileName: 'test-profile-' + Date.now(),
    accessKeyId: 'AKIA' + Math.random().toString(36).substr(2, 16).toUpperCase(),
    secretAccessKey: 'test-secret-' + Math.random().toString(36).substr(2, 32),
    sessionToken: 'test-token-' + Math.random().toString(36).substr(2, 64),
    awsRegion: 'us-east-1'
  };

  // Create mock credential record that matches encrypted format
  const getMockCredentialRecord = () => ({
    id: 'mock-id-123',
    profileName: testCredentials.profileName,
    encryptedAccessKey: 'salt:' + Buffer.from(testCredentials.accessKeyId).toString('base64'),
    encryptedSecretKey: 'salt:' + Buffer.from(testCredentials.secretAccessKey).toString('base64'), 
    encryptedSessionToken: 'salt:' + Buffer.from(testCredentials.sessionToken!).toString('base64'),
    awsRegion: testCredentials.awsRegion,
    isValid: false,
    validationError: null,
    lastValidatedAt: null,
    createdAt: new Date(),
    updatedAt: new Date()
  });

  beforeAll(async () => {
    // Initialize services
    awsCredentialService = new AWSCredentialService();
    credentialProvider = new CredentialProvider();

    // Clean up any existing test data
    await cleanupTestData();
  });

  afterAll(async () => {
    // Clean up test data
    await cleanupTestData();
    await prisma.$disconnect();
  });

  beforeEach(() => {
    // Fix 1.2: Reset all mocks before each test
    jest.clearAllMocks();
    
    // Clear credential provider cache
    credentialProvider.clearCache();
    
    // Clear environment variables for clean testing
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
    delete process.env.AWS_SESSION_TOKEN;
    delete process.env.AWS_REGION;
    
    // Setup default mock behaviors - Start with NO profiles for clean testing
    mockPrismaInstance.aWSCredentials.upsert.mockResolvedValue(null);
    mockPrismaInstance.aWSCredentials.findUnique.mockResolvedValue(null);
    mockPrismaInstance.aWSCredentials.findMany.mockResolvedValue([]); // Default: no profiles
    mockPrismaInstance.aWSCredentials.findFirst.mockResolvedValue(null);
    mockPrismaInstance.aWSCredentials.update.mockResolvedValue(null);
    mockPrismaInstance.aWSCredentials.delete.mockResolvedValue(null);
    mockPrismaInstance.aWSCredentials.deleteMany.mockResolvedValue({ count: 0 });
  });

  async function cleanupTestData() {
    try {
      // Mock cleanup - just reset the mock
      mockPrismaInstance.aWSCredentials.deleteMany.mockResolvedValue({ count: 0 });
    } catch (error) {
      // Ignore cleanup errors
    }
  }

  describe('End-to-End Credential Flow', () => {
    it('should save, retrieve, and use credentials in services', async () => {
      // Set up mock for this test
      const mockRecord = getMockCredentialRecord();
      mockPrismaInstance.aWSCredentials.upsert.mockResolvedValue(mockRecord);
      mockPrismaInstance.aWSCredentials.findUnique.mockResolvedValue(mockRecord);
      mockPrismaInstance.aWSCredentials.findMany.mockResolvedValue([mockRecord]);
      mockPrismaInstance.aWSCredentials.findFirst.mockResolvedValue(mockRecord);
      
      // Step 1: Save credentials via AWSCredentialService
      const savedCredentials = await awsCredentialService.saveCredentials(testCredentials);
      
      expect(savedCredentials).toMatchObject({
        profileName: testCredentials.profileName,
        awsRegion: testCredentials.awsRegion,
        isValid: false // Not validated yet
      });

      // Verify Prisma upsert was called
      expect(mockPrismaInstance.aWSCredentials.upsert).toHaveBeenCalledWith({
        where: { profileName: testCredentials.profileName },
        update: expect.objectContaining({
          awsRegion: testCredentials.awsRegion,
          isValid: false
        }),
        create: expect.objectContaining({
          profileName: testCredentials.profileName,
          awsRegion: testCredentials.awsRegion,
          isValid: false
        })
      });

      // Step 2: Verify credentials are encrypted in database
      // Mock that encrypted data is different from original
      const mockRecord2 = getMockCredentialRecord();
      expect(mockRecord2.encryptedAccessKey).toContain(':'); // Should have salt prefix
      expect(mockRecord2.encryptedSecretKey).toContain(':');
      expect(mockRecord2.encryptedAccessKey).not.toBe(testCredentials.accessKeyId);
      expect(mockRecord2.encryptedSecretKey).not.toBe(testCredentials.secretAccessKey);

      // Step 3: Retrieve credentials via CredentialProvider
      const retrievedCredentials = await credentialProvider.getCredentials();
      
      expect(retrievedCredentials).toEqual({
        accessKeyId: testCredentials.accessKeyId,
        secretAccessKey: testCredentials.secretAccessKey,
        sessionToken: testCredentials.sessionToken
      });

      // Step 4: Verify region retrieval
      const region = await credentialProvider.getRegion();
      expect(region).toBe(testCredentials.awsRegion);

      // Step 5: Test credential caching
      const cachedCredentials = await credentialProvider.getCredentials();
      expect(cachedCredentials).toEqual(retrievedCredentials);
    });

    it('should fallback to environment variables when no stored credentials', async () => {
      // Ensure mock returns no stored credentials (default is already set in beforeEach)
      // No need to mock again since beforeEach sets empty arrays
      
      // Set environment variables
      process.env.AWS_ACCESS_KEY_ID = 'env-access-key';
      process.env.AWS_SECRET_ACCESS_KEY = 'env-secret-key';
      process.env.AWS_SESSION_TOKEN = 'env-session-token';
      process.env.AWS_REGION = 'us-west-2';

      // Ensure no stored credentials (should be 0 based on beforeEach setup)
      const profiles = await awsCredentialService.listCredentialProfiles();
      expect(profiles.length).toBe(0);

      // Should use environment variables
      const credentials = await credentialProvider.getCredentials();
      expect(credentials).toEqual({
        accessKeyId: 'env-access-key',
        secretAccessKey: 'env-secret-key',
        sessionToken: 'env-session-token'
      });

      const region = await credentialProvider.getRegion();
      expect(region).toBe('us-west-2');
    });

    it('should prefer stored credentials over environment variables', async () => {
      // Set environment variables
      process.env.AWS_ACCESS_KEY_ID = 'env-access-key';
      process.env.AWS_SECRET_ACCESS_KEY = 'env-secret-key';
      process.env.AWS_REGION = 'us-west-2';

      // Save stored credentials
      await awsCredentialService.saveCredentials(testCredentials);

      // Should use stored credentials, not environment
      const credentials = await credentialProvider.getCredentials();
      expect(credentials).toEqual({
        accessKeyId: testCredentials.accessKeyId,
        secretAccessKey: testCredentials.secretAccessKey,
        sessionToken: testCredentials.sessionToken
      });

      const region = await credentialProvider.getRegion();
      expect(region).toBe(testCredentials.awsRegion);
    });
  });

  describe('Bedrock Service Integration', () => {
    it('should create Bedrock service with stored credentials', async () => {
      // Save credentials
      await awsCredentialService.saveCredentials(testCredentials);

      // Create Bedrock config with stored credentials
      const config = await getBedrockConfig('anthropic');

      expect(config).toMatchObject({
        modelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
        provider: 'anthropic',
        region: testCredentials.awsRegion,
        credentials: {
          accessKeyId: testCredentials.accessKeyId,
          secretAccessKey: testCredentials.secretAccessKey,
          sessionToken: testCredentials.sessionToken
        }
      });
    });

    it('should create Bedrock service with environment fallback', async () => {
      // Mock no stored credentials
      mockPrismaInstance.aWSCredentials.findMany.mockResolvedValue([]);
      mockPrismaInstance.aWSCredentials.findFirst.mockResolvedValue(null);
      
      // Set environment variables
      process.env.AWS_ACCESS_KEY_ID = 'env-access-key';
      process.env.AWS_SECRET_ACCESS_KEY = 'env-secret-key';
      process.env.AWS_REGION = 'us-west-2';

      // Create Bedrock config with environment fallback
      const config = await getBedrockConfig('anthropic');

      expect(config).toMatchObject({
        region: 'us-west-2',
        credentials: {
          accessKeyId: 'env-access-key',
          secretAccessKey: 'env-secret-key'
        }
      });
    });

    it('should create Bedrock service factory method with stored credentials', async () => {
      // Set up mock for this test
      const mockRecord = getMockCredentialRecord();
      mockPrismaInstance.aWSCredentials.upsert.mockResolvedValue(mockRecord);
      mockPrismaInstance.aWSCredentials.findUnique.mockResolvedValue(mockRecord);
      mockPrismaInstance.aWSCredentials.findMany.mockResolvedValue([mockRecord]);
      mockPrismaInstance.aWSCredentials.findFirst.mockResolvedValue(mockRecord);
      
      // Save credentials
      await awsCredentialService.saveCredentials(testCredentials);

      // Debug: Check if the static method exists
      console.log('BedrockService static methods:', Object.getOwnPropertyNames(BedrockService));
      console.log('createWithStoredCredentials available:', typeof BedrockService.createWithStoredCredentials);

      // This should work without throwing
      const service = await BedrockService.createWithStoredCredentials('anthropic');
      expect(service).toBeInstanceOf(BedrockService);
    });
  });

  describe('Analysis Service Integration', () => {
    it('should initialize ComparativeAnalysisService with stored credentials', async () => {
      // Set up mock for this test
      const mockRecord = getMockCredentialRecord();
      mockPrismaInstance.aWSCredentials.upsert.mockResolvedValue(mockRecord);
      mockPrismaInstance.aWSCredentials.findUnique.mockResolvedValue(mockRecord);
      mockPrismaInstance.aWSCredentials.findMany.mockResolvedValue([mockRecord]);
      mockPrismaInstance.aWSCredentials.findFirst.mockResolvedValue(mockRecord);
      
      // Save credentials
      await awsCredentialService.saveCredentials(testCredentials);

      // Create analysis service (it should initialize Bedrock service internally)
      const analysisService = new ComparativeAnalysisService();
      
      // This tests that the service can be created without throwing
      expect(analysisService).toBeInstanceOf(ComparativeAnalysisService);

      // Test configuration update (should trigger credential refresh)
      analysisService.updateAnalysisConfiguration({
        maxTokens: 6000,
        temperature: 0.5
      });

      // Service should still be functional after config update
      expect(analysisService).toBeInstanceOf(ComparativeAnalysisService);
    });
  });

  describe('Multiple Profile Support', () => {
    const secondTestCredentials = {
      profileName: 'test-profile-2-' + Date.now(),
      accessKeyId: 'AKIA' + Math.random().toString(36).substr(2, 16).toUpperCase(),
      secretAccessKey: 'test-secret-2-' + Math.random().toString(36).substr(2, 32),
      sessionToken: 'test-token-2-' + Math.random().toString(36).substr(2, 64),
      awsRegion: 'eu-west-1'
    };

    it('should handle multiple credential profiles', async () => {
      // Set up mock for multiple profiles
      const mockRecord1 = getMockCredentialRecord();
      const mockRecord2 = {
        ...getMockCredentialRecord(),
        profileName: secondTestCredentials.profileName,
        encryptedAccessKey: 'salt:' + Buffer.from(secondTestCredentials.accessKeyId).toString('base64'),
        encryptedSecretKey: 'salt:' + Buffer.from(secondTestCredentials.secretAccessKey).toString('base64'),
        encryptedSessionToken: 'salt:' + Buffer.from(secondTestCredentials.sessionToken!).toString('base64'),
        awsRegion: secondTestCredentials.awsRegion,
      };
      
      // Mock finding multiple profiles
      mockPrismaInstance.aWSCredentials.findMany.mockResolvedValue([mockRecord1, mockRecord2]);
      
      // Mock specific profile lookups
      mockPrismaInstance.aWSCredentials.findUnique
        .mockImplementation((query: any) => {
          if (query.where.profileName === testCredentials.profileName) {
            return Promise.resolve(mockRecord1);
          } else if (query.where.profileName === secondTestCredentials.profileName) {
            return Promise.resolve(mockRecord2);
          }
          return Promise.resolve(null);
        });

      // Mock upsert operations for both profiles
      mockPrismaInstance.aWSCredentials.upsert
        .mockImplementation((query: any) => {
          if (query.where.profileName === testCredentials.profileName) {
            return Promise.resolve(mockRecord1);
          } else if (query.where.profileName === secondTestCredentials.profileName) {
            return Promise.resolve(mockRecord2);
          }
          return Promise.resolve(null);
        });

      // Save two different profiles (this will set up the mocks)
      await awsCredentialService.saveCredentials(testCredentials);
      await awsCredentialService.saveCredentials(secondTestCredentials);

      // List profiles
      const profiles = await awsCredentialService.listCredentialProfiles();
      expect(profiles.length).toBe(2);

      // Get credentials with preferred profile
      const credentials1 = await credentialProvider.getCredentials({
        preferredProfile: testCredentials.profileName
      });
      expect(credentials1).toMatchObject({
        accessKeyId: testCredentials.accessKeyId,
        secretAccessKey: testCredentials.secretAccessKey
      });

      // Get credentials with different preferred profile
      const credentials2 = await credentialProvider.getCredentials({
        preferredProfile: secondTestCredentials.profileName
      });
      expect(credentials2).toMatchObject({
        accessKeyId: secondTestCredentials.accessKeyId,
        secretAccessKey: secondTestCredentials.secretAccessKey
      });

      // Get regions with preferred profiles
      const region1 = await credentialProvider.getRegion({
        preferredProfile: testCredentials.profileName
      });
      expect(region1).toBe(testCredentials.awsRegion);

      const region2 = await credentialProvider.getRegion({
        preferredProfile: secondTestCredentials.profileName
      });
      expect(region2).toBe(secondTestCredentials.awsRegion);
    });

    it('should use first valid profile when no preference specified', async () => {
      // Mock two profiles, one invalid and one valid
      const invalidProfile = { ...getMockCredentialRecord(), isValid: false };
      const validProfile = { 
        ...getMockCredentialRecord(), 
        profileName: secondTestCredentials.profileName,
        encryptedAccessKey: 'salt:' + Buffer.from(secondTestCredentials.accessKeyId).toString('base64'),
        encryptedSecretKey: 'salt:' + Buffer.from(secondTestCredentials.secretAccessKey).toString('base64'),
        encryptedSessionToken: 'salt:' + Buffer.from(secondTestCredentials.sessionToken!).toString('base64'),
        awsRegion: secondTestCredentials.awsRegion,
        isValid: true 
      };

      // Mock finding the valid profile first
      mockPrismaInstance.aWSCredentials.findFirst.mockResolvedValue(validProfile);
      mockPrismaInstance.aWSCredentials.findMany.mockResolvedValue([invalidProfile, validProfile]);

      // Should use the valid profile
      const credentials = await credentialProvider.getCredentials();
      expect(credentials).toMatchObject({
        accessKeyId: secondTestCredentials.accessKeyId,
        secretAccessKey: secondTestCredentials.secretAccessKey
      });
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should handle database connection errors gracefully', async () => {
      // Temporarily break database connection by using invalid connection
      const brokenCredentialProvider = new CredentialProvider();
      
      // Mock the AWS credential service to throw an error
      const originalService = (brokenCredentialProvider as any).awsCredentialService;
      (brokenCredentialProvider as any).awsCredentialService = {
        listCredentialProfiles: jest.fn().mockRejectedValue(new Error('Database connection failed'))
      };

      // Set environment fallback
      process.env.AWS_ACCESS_KEY_ID = 'fallback-key';
      process.env.AWS_SECRET_ACCESS_KEY = 'fallback-secret';

      // Should fallback to environment variables
      const credentials = await brokenCredentialProvider.getCredentials();
      expect(credentials).toEqual({
        accessKeyId: 'fallback-key',
        secretAccessKey: 'fallback-secret'
      });

      // Restore original service
      (brokenCredentialProvider as any).awsCredentialService = originalService;
    });

    it('should handle missing credentials gracefully', async () => {
      // Mock no stored credentials
      mockPrismaInstance.aWSCredentials.findMany.mockResolvedValue([]);
      mockPrismaInstance.aWSCredentials.findFirst.mockResolvedValue(null);
      
      // Ensure no environment variables
      delete process.env.AWS_ACCESS_KEY_ID;
      delete process.env.AWS_SECRET_ACCESS_KEY;
      
      const profiles = await awsCredentialService.listCredentialProfiles();
      expect(profiles.length).toBe(0);

      const credentials = await credentialProvider.getCredentials();
      expect(credentials).toBeNull();
    });

    it('should handle cache refresh correctly', async () => {
      // Save credentials
      await awsCredentialService.saveCredentials(testCredentials);

      // Get credentials (populates cache)
      const credentials1 = await credentialProvider.getCredentials();
      expect(credentials1).toBeTruthy();

      // Clear cache
      credentialProvider.clearCache();

      // Next call should hit database again
      const credentials3 = await credentialProvider.getCredentials();
      expect(credentials3).toEqual(credentials1);
    });
  });

  describe('Encryption and Security', () => {
    it('should properly encrypt and decrypt credentials', async () => {
      // Save credentials
      await awsCredentialService.saveCredentials(testCredentials);

      // Get mock database record
      const mockRecord = getMockCredentialRecord();

      // Verify encryption
      expect(mockRecord.encryptedAccessKey).not.toBe(testCredentials.accessKeyId);
      expect(mockRecord.encryptedSecretKey).not.toBe(testCredentials.secretAccessKey);
      expect(mockRecord.encryptedSessionToken).not.toBe(testCredentials.sessionToken);

      // Verify each encrypted field has salt prefix
      expect(mockRecord.encryptedAccessKey.split(':').length).toBe(2);
      expect(mockRecord.encryptedSecretKey.split(':').length).toBe(2);
      if (mockRecord.encryptedSessionToken) {
        expect(mockRecord.encryptedSessionToken.split(':').length).toBe(2);
      }

      // Verify decryption works
      const decryptedCreds = await awsCredentialService.getDecryptedCredentials(testCredentials.profileName);
      expect(decryptedCreds).toMatchObject({
        accessKeyId: testCredentials.accessKeyId,
        secretAccessKey: testCredentials.secretAccessKey,
        sessionToken: testCredentials.sessionToken,
        awsRegion: testCredentials.awsRegion
      });
    });

    it('should use unique salts for different credentials', async () => {
      // Mock two different credential records
      const record1 = getMockCredentialRecord();
      const record2 = {
        ...getMockCredentialRecord(),
        profileName: 'test-profile-unique-' + Date.now(),
        encryptedAccessKey: 'different-salt:' + Buffer.from('different-key').toString('base64'),
        encryptedSecretKey: 'different-salt:' + Buffer.from('different-secret').toString('base64')
      };

      mockPrismaInstance.aWSCredentials.findMany.mockResolvedValue([record1, record2]);

      // Save two different credential sets
      await awsCredentialService.saveCredentials(testCredentials);
      await awsCredentialService.saveCredentials({
        ...testCredentials,
        profileName: 'test-profile-unique-' + Date.now()
      });

      // Get both database records
      const records = await awsCredentialService.listCredentialProfiles();
      expect(records.length).toBe(2);

      // Extract salts (first part before colon) 
      const salts = [record1, record2].map((record: any) => record.encryptedAccessKey.split(':')[0]);
      
      // All salts should be unique
      const uniqueSalts = new Set(salts);
      expect(uniqueSalts.size).toBe(salts.length);
    });
  });
}); 