import { CredentialProvider } from '@/services/aws/credentialProvider';
import { AWSCredentialService } from '@/services/aws/awsCredentialService';
import { logger } from '@/lib/logger';

// Mock the dependencies
jest.mock('@/services/aws/awsCredentialService');
jest.mock('@/lib/logger');

describe('CredentialProvider', () => {
  let credentialProvider: CredentialProvider;
  let mockAwsCredentialService: jest.Mocked<AWSCredentialService>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock AWSCredentialService
    mockAwsCredentialService = {
      listCredentialProfiles: jest.fn(),
      getDecryptedCredentials: jest.fn(),
    } as any;

    // Mock the constructor
    (AWSCredentialService as jest.MockedClass<typeof AWSCredentialService>).mockImplementation(() => mockAwsCredentialService);
    
    credentialProvider = new CredentialProvider();

    // Mock environment variables
    process.env.AWS_ACCESS_KEY_ID = '';
    process.env.AWS_SECRET_ACCESS_KEY = '';
    process.env.AWS_SESSION_TOKEN = '';
    process.env.AWS_REGION = '';
  });

  afterEach(() => {
    // Clear environment variables
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
    delete process.env.AWS_SESSION_TOKEN;
    delete process.env.AWS_REGION;
  });

  describe('getCredentials', () => {
    it('should return cached credentials when cache is valid', async () => {
      // Setup cached credentials
      const mockCredentials = {
        accessKeyId: 'cached-key',
        secretAccessKey: 'cached-secret',
        sessionToken: 'cached-token'
      };

      // First call to populate cache
      mockAwsCredentialService.listCredentialProfiles.mockResolvedValue([
        {
          id: '1',
          profileName: 'test-profile',
          awsRegion: 'us-east-1',
          isValid: true,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ]);

      mockAwsCredentialService.getDecryptedCredentials.mockResolvedValue({
        profileName: 'test-profile',
        accessKeyId: 'cached-key',
        secretAccessKey: 'cached-secret',
        sessionToken: 'cached-token',
        awsRegion: 'us-east-1'
      });

      // First call
      const credentials1 = await credentialProvider.getCredentials();
      
      // Second call (should use cache)
      const credentials2 = await credentialProvider.getCredentials();

      expect(credentials1).toEqual(mockCredentials);
      expect(credentials2).toEqual(mockCredentials);
      expect(mockAwsCredentialService.listCredentialProfiles).toHaveBeenCalledTimes(1);
      expect(logger.debug).toHaveBeenCalledWith('Using cached credentials');
    });

    it('should return stored credentials when available and valid', async () => {
      mockAwsCredentialService.listCredentialProfiles.mockResolvedValue([
        {
          id: '1',
          profileName: 'test-profile',
          awsRegion: 'us-east-1',
          isValid: true,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ]);

      mockAwsCredentialService.getDecryptedCredentials.mockResolvedValue({
        profileName: 'test-profile',
        accessKeyId: 'stored-key',
        secretAccessKey: 'stored-secret',
        sessionToken: 'stored-token',
        awsRegion: 'us-east-1'
      });

      const credentials = await credentialProvider.getCredentials();

      expect(credentials).toEqual({
        accessKeyId: 'stored-key',
        secretAccessKey: 'stored-secret',
        sessionToken: 'stored-token'
      });
      expect(logger.info).toHaveBeenCalledWith('Using stored AWS credentials');
    });

    it('should return environment credentials when no stored credentials', async () => {
      // Setup environment variables
      process.env.AWS_ACCESS_KEY_ID = 'env-key';
      process.env.AWS_SECRET_ACCESS_KEY = 'env-secret';
      process.env.AWS_SESSION_TOKEN = 'env-token';

      mockAwsCredentialService.listCredentialProfiles.mockResolvedValue([]);

      const credentials = await credentialProvider.getCredentials();

      expect(credentials).toEqual({
        accessKeyId: 'env-key',
        secretAccessKey: 'env-secret',
        sessionToken: 'env-token'
      });
      expect(logger.info).toHaveBeenCalledWith('Using environment AWS credentials');
    });

    it('should return environment credentials without session token when not provided', async () => {
      // Setup environment variables without session token
      process.env.AWS_ACCESS_KEY_ID = 'env-key';
      process.env.AWS_SECRET_ACCESS_KEY = 'env-secret';

      mockAwsCredentialService.listCredentialProfiles.mockResolvedValue([]);

      const credentials = await credentialProvider.getCredentials();

      expect(credentials).toEqual({
        accessKeyId: 'env-key',
        secretAccessKey: 'env-secret'
      });
      expect(logger.info).toHaveBeenCalledWith('Using environment AWS credentials');
    });

    it('should return null when no credentials available', async () => {
      mockAwsCredentialService.listCredentialProfiles.mockResolvedValue([]);

      const credentials = await credentialProvider.getCredentials();

      expect(credentials).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith('No AWS credentials available');
    });

    it('should use preferred profile when specified', async () => {
      mockAwsCredentialService.listCredentialProfiles.mockResolvedValue([
        {
          id: '1',
          profileName: 'profile1',
          awsRegion: 'us-east-1',
          isValid: true,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: '2',
          profileName: 'profile2',
          awsRegion: 'us-west-2',
          isValid: true,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ]);

      mockAwsCredentialService.getDecryptedCredentials.mockResolvedValue({
        profileName: 'profile2',
        accessKeyId: 'profile2-key',
        secretAccessKey: 'profile2-secret',
        awsRegion: 'us-west-2'
      });

      const credentials = await credentialProvider.getCredentials({
        preferredProfile: 'profile2'
      });

      expect(mockAwsCredentialService.getDecryptedCredentials).toHaveBeenCalledWith('profile2');
      expect(credentials).toEqual({
        accessKeyId: 'profile2-key',
        secretAccessKey: 'profile2-secret'
      });
    });

    it('should use first valid profile when no preferred profile specified', async () => {
      mockAwsCredentialService.listCredentialProfiles.mockResolvedValue([
        {
          id: '1',
          profileName: 'invalid-profile',
          awsRegion: 'us-east-1',
          isValid: false,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: '2',
          profileName: 'valid-profile',
          awsRegion: 'us-west-2',
          isValid: true,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ]);

      mockAwsCredentialService.getDecryptedCredentials.mockResolvedValue({
        profileName: 'valid-profile',
        accessKeyId: 'valid-key',
        secretAccessKey: 'valid-secret',
        awsRegion: 'us-west-2'
      });

      const credentials = await credentialProvider.getCredentials();

      expect(mockAwsCredentialService.getDecryptedCredentials).toHaveBeenCalledWith('valid-profile');
      expect(credentials).toEqual({
        accessKeyId: 'valid-key',
        secretAccessKey: 'valid-secret'
      });
    });

    it('should fallback to environment variables on error', async () => {
      // Setup environment variables
      process.env.AWS_ACCESS_KEY_ID = 'fallback-key';
      process.env.AWS_SECRET_ACCESS_KEY = 'fallback-secret';

      mockAwsCredentialService.listCredentialProfiles.mockRejectedValue(new Error('Database error'));

      const credentials = await credentialProvider.getCredentials();

      expect(credentials).toEqual({
        accessKeyId: 'fallback-key',
        secretAccessKey: 'fallback-secret'
      });
      expect(logger.error).toHaveBeenCalledWith('Error fetching stored credentials', expect.any(Error));
    });
  });

  describe('getRegion', () => {
    it('should return stored region when available', async () => {
      mockAwsCredentialService.listCredentialProfiles.mockResolvedValue([
        {
          id: '1',
          profileName: 'test-profile',
          awsRegion: 'us-east-1',
          isValid: true,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ]);

      mockAwsCredentialService.getDecryptedCredentials.mockResolvedValue({
        profileName: 'test-profile',
        accessKeyId: 'key',
        secretAccessKey: 'secret',
        awsRegion: 'us-east-1'
      });

      const region = await credentialProvider.getRegion();

      expect(region).toBe('us-east-1');
    });

    it('should return environment region when no stored credentials', async () => {
      process.env.AWS_REGION = 'us-west-2';
      mockAwsCredentialService.listCredentialProfiles.mockResolvedValue([]);

      const region = await credentialProvider.getRegion();

      expect(region).toBe('us-west-2');
    });

    it('should return default region when no region available', async () => {
      mockAwsCredentialService.listCredentialProfiles.mockResolvedValue([]);

      const region = await credentialProvider.getRegion();

      expect(region).toBe('us-east-1');
    });

    it('should use preferred profile for region', async () => {
      mockAwsCredentialService.listCredentialProfiles.mockResolvedValue([
        {
          id: '1',
          profileName: 'profile1',
          awsRegion: 'us-east-1',
          isValid: true,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: '2',
          profileName: 'profile2',
          awsRegion: 'eu-west-1',
          isValid: true,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ]);

      mockAwsCredentialService.getDecryptedCredentials.mockResolvedValue({
        profileName: 'profile2',
        accessKeyId: 'key',
        secretAccessKey: 'secret',
        awsRegion: 'eu-west-1'
      });

      const region = await credentialProvider.getRegion({
        preferredProfile: 'profile2'
      });

      expect(region).toBe('eu-west-1');
    });
  });

  describe('hasCredentials', () => {
    it('should return true when credentials available', async () => {
      mockAwsCredentialService.listCredentialProfiles.mockResolvedValue([
        {
          id: '1',
          profileName: 'test-profile',
          awsRegion: 'us-east-1',
          isValid: true,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ]);

      mockAwsCredentialService.getDecryptedCredentials.mockResolvedValue({
        profileName: 'test-profile',
        accessKeyId: 'key',
        secretAccessKey: 'secret',
        awsRegion: 'us-east-1'
      });

      const hasCredentials = await credentialProvider.hasCredentials();

      expect(hasCredentials).toBe(true);
    });

    it('should return false when no credentials available', async () => {
      mockAwsCredentialService.listCredentialProfiles.mockResolvedValue([]);

      const hasCredentials = await credentialProvider.hasCredentials();

      expect(hasCredentials).toBe(false);
    });
  });

  describe('clearCache', () => {
    it('should clear cached credentials', async () => {
      // Setup cached credentials
      mockAwsCredentialService.listCredentialProfiles.mockResolvedValue([
        {
          id: '1',
          profileName: 'test-profile',
          awsRegion: 'us-east-1',
          isValid: true,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ]);

      mockAwsCredentialService.getDecryptedCredentials.mockResolvedValue({
        profileName: 'test-profile',
        accessKeyId: 'key',
        secretAccessKey: 'secret',
        awsRegion: 'us-east-1'
      });

      // First call to populate cache
      await credentialProvider.getCredentials();
      
      // Clear cache
      credentialProvider.clearCache();

      // Second call should hit database again
      await credentialProvider.getCredentials();

      expect(mockAwsCredentialService.listCredentialProfiles).toHaveBeenCalledTimes(2);
    });
  });

  describe('refreshCredentials', () => {
    it('should clear cache and fetch new credentials', async () => {
      // Setup initial credentials
      mockAwsCredentialService.listCredentialProfiles.mockResolvedValue([
        {
          id: '1',
          profileName: 'test-profile',
          awsRegion: 'us-east-1',
          isValid: true,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ]);

      mockAwsCredentialService.getDecryptedCredentials.mockResolvedValue({
        profileName: 'test-profile',
        accessKeyId: 'new-key',
        secretAccessKey: 'new-secret',
        awsRegion: 'us-east-1'
      });

      const credentials = await credentialProvider.refreshCredentials();

      expect(credentials).toEqual({
        accessKeyId: 'new-key',
        secretAccessKey: 'new-secret'
      });
      expect(mockAwsCredentialService.listCredentialProfiles).toHaveBeenCalledTimes(1);
    });
  });
}); 