import { getBedrockConfig, isDevelopmentMode } from '@/services/bedrock/bedrock.config';
import { CredentialProvider } from '@/services/aws/credentialProvider';

// Mock the CredentialProvider
jest.mock('@/services/aws/credentialProvider');

describe('Bedrock Configuration', () => {
  let mockCredentialProvider: jest.Mocked<CredentialProvider>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock CredentialProvider
    mockCredentialProvider = {
      getCredentials: jest.fn(),
      getRegion: jest.fn(),
      hasCredentials: jest.fn(),
    } as any;

    (CredentialProvider as jest.MockedClass<typeof CredentialProvider>).mockImplementation(() => mockCredentialProvider);
  });

  describe('getBedrockConfig', () => {
    it('should return Claude config with stored credentials', async () => {
      const mockCredentials = {
        accessKeyId: 'stored-key',
        secretAccessKey: 'stored-secret',
        sessionToken: 'stored-token'
      };

      mockCredentialProvider.getCredentials.mockResolvedValue(mockCredentials);
      mockCredentialProvider.getRegion.mockResolvedValue('us-east-1');

      const config = await getBedrockConfig('anthropic');

      expect(config).toEqual({
        modelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
        provider: 'anthropic',
        region: 'us-east-1',
        maxTokens: 4000,
        temperature: 0.3,
        topP: 0.999,
        topK: 250,
        stopSequences: [],
        anthropicVersion: 'bedrock-2023-05-31',
        credentials: mockCredentials
      });

      expect(mockCredentialProvider.getCredentials).toHaveBeenCalledWith({});
      expect(mockCredentialProvider.getRegion).toHaveBeenCalledWith({});
    });

    it('should return Mistral config with stored credentials', async () => {
      const mockCredentials = {
        accessKeyId: 'stored-key',
        secretAccessKey: 'stored-secret'
      };

      mockCredentialProvider.getCredentials.mockResolvedValue(mockCredentials);
      mockCredentialProvider.getRegion.mockResolvedValue('eu-west-1');

      const config = await getBedrockConfig('mistral');

      expect(config).toEqual({
        modelId: 'mistral.mistral-large-2402-v1:0',
        provider: 'mistral',
        region: 'eu-west-1',
        maxTokens: 4000,
        temperature: 0.3,
        topP: 0.999,
        topK: 250,
        stopSequences: [],
        credentials: mockCredentials
      });
    });

    it('should return config without credentials when none available', async () => {
      mockCredentialProvider.getCredentials.mockResolvedValue(null);
      mockCredentialProvider.getRegion.mockResolvedValue('us-east-1');

      const config = await getBedrockConfig('anthropic');

      expect(config).toEqual({
        modelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
        provider: 'anthropic',
        region: 'us-east-1',
        maxTokens: 4000,
        temperature: 0.3,
        topP: 0.999,
        topK: 250,
        stopSequences: [],
        anthropicVersion: 'bedrock-2023-05-31'
      });

      expect(config).not.toHaveProperty('credentials');
    });

    it('should apply config overrides', async () => {
      const mockCredentials = {
        accessKeyId: 'stored-key',
        secretAccessKey: 'stored-secret'
      };

      mockCredentialProvider.getCredentials.mockResolvedValue(mockCredentials);
      mockCredentialProvider.getRegion.mockResolvedValue('us-east-1');

      const configOverrides = {
        maxTokens: 8000,
        temperature: 0.5,
        region: 'us-west-2'
      };

      const config = await getBedrockConfig('anthropic', configOverrides);

      expect(config.maxTokens).toBe(8000);
      expect(config.temperature).toBe(0.5);
      expect(config.region).toBe('us-west-2'); // Override takes precedence
    });

    it('should use credential options for preferred profile', async () => {
      const mockCredentials = {
        accessKeyId: 'profile-key',
        secretAccessKey: 'profile-secret'
      };

      mockCredentialProvider.getCredentials.mockResolvedValue(mockCredentials);
      mockCredentialProvider.getRegion.mockResolvedValue('eu-west-1');

      const credentialOptions = {
        preferredProfile: 'production-profile'
      };

      const config = await getBedrockConfig('anthropic', {}, credentialOptions);

      expect(mockCredentialProvider.getCredentials).toHaveBeenCalledWith(credentialOptions);
      expect(mockCredentialProvider.getRegion).toHaveBeenCalledWith(credentialOptions);
      expect(config.credentials).toEqual(mockCredentials);
    });

    it('should handle credential provider errors gracefully', async () => {
      mockCredentialProvider.getCredentials.mockRejectedValue(new Error('Database error'));
      mockCredentialProvider.getRegion.mockResolvedValue('us-east-1');

      // Should not throw, but handle error gracefully
      await expect(getBedrockConfig('anthropic')).rejects.toThrow('Database error');
    });

    it('should handle region provider errors gracefully', async () => {
      const mockCredentials = {
        accessKeyId: 'stored-key',
        secretAccessKey: 'stored-secret'
      };

      mockCredentialProvider.getCredentials.mockResolvedValue(mockCredentials);
      mockCredentialProvider.getRegion.mockRejectedValue(new Error('Region error'));

      // Should not throw, but handle error gracefully
      await expect(getBedrockConfig('anthropic')).rejects.toThrow('Region error');
    });
  });

  describe('isDevelopmentMode', () => {
    it('should return false when credentials are available', async () => {
      mockCredentialProvider.hasCredentials.mockResolvedValue(true);

      const isDev = await isDevelopmentMode();

      expect(isDev).toBe(false);
      expect(mockCredentialProvider.hasCredentials).toHaveBeenCalled();
    });

    it('should return true when no credentials available', async () => {
      mockCredentialProvider.hasCredentials.mockResolvedValue(false);

      const isDev = await isDevelopmentMode();

      expect(isDev).toBe(true);
    });

    it('should return true when NODE_ENV is development even with credentials', async () => {
      const originalNodeEnv = process.env.NODE_ENV;
      (process.env as any).NODE_ENV = 'development';
      
      mockCredentialProvider.hasCredentials.mockResolvedValue(true);

      const isDev = await isDevelopmentMode();

      expect(isDev).toBe(true);
      
      // Restore original environment
      (process.env as any).NODE_ENV = originalNodeEnv;
    });

    it('should fallback to environment check on credential provider error', async () => {
      mockCredentialProvider.hasCredentials.mockRejectedValue(new Error('Provider error'));
      
      // Save original environment
      const originalAwsKeyId = process.env.AWS_ACCESS_KEY_ID;
      
      // Without environment credentials
      delete process.env.AWS_ACCESS_KEY_ID;
      const isDev1 = await isDevelopmentMode();
      expect(isDev1).toBe(true);

      // With environment credentials
      process.env.AWS_ACCESS_KEY_ID = 'env-key';
      const isDev2 = await isDevelopmentMode();
      expect(isDev2).toBe(false);
      
      // Restore original environment
      if (originalAwsKeyId) {
        process.env.AWS_ACCESS_KEY_ID = originalAwsKeyId;
      } else {
        delete process.env.AWS_ACCESS_KEY_ID;
      }
    });

    it('should return false in production with environment credentials', async () => {
      // Save original environment
      const originalNodeEnv = process.env.NODE_ENV;
      const originalAwsKeyId = process.env.AWS_ACCESS_KEY_ID;
      
      // Set test environment
      (process.env as any).NODE_ENV = 'production';
      process.env.AWS_ACCESS_KEY_ID = 'env-key';
      
      mockCredentialProvider.hasCredentials.mockRejectedValue(new Error('Provider error'));

      const isDev = await isDevelopmentMode();

      expect(isDev).toBe(false);
      
      // Restore original environment
      (process.env as any).NODE_ENV = originalNodeEnv;
      if (originalAwsKeyId) {
        process.env.AWS_ACCESS_KEY_ID = originalAwsKeyId;
      } else {
        delete process.env.AWS_ACCESS_KEY_ID;
      }
    });
  });
}); 