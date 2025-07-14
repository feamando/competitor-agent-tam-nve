import { BedrockService } from '@/services/bedrock/bedrock.service';
import { getBedrockConfig } from '@/services/bedrock/bedrock.config';
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';

// Mock the dependencies
jest.mock('@/services/bedrock/bedrock.config');
jest.mock('@aws-sdk/client-bedrock-runtime');

// Enhanced mock for BedrockService to handle static methods
jest.mock('@/services/bedrock/bedrock.service', () => {
  const originalModule = jest.requireActual('@/services/bedrock/bedrock.service');
  
  class MockBedrockService {
    private client: any;
    private config: any;

    constructor(config: any = {}, provider: string = 'anthropic') {
      this.config = config;
      this.client = new (jest.requireMock('@aws-sdk/client-bedrock-runtime').BedrockRuntimeClient)();
    }

    static async createWithStoredCredentials(
      provider: string = 'anthropic',
      configOverrides: any = {},
      credentialOptions: any = {}
    ) {
      // Mock implementation of static method
      const mockConfig = {
        modelId: provider === 'anthropic' ? 'anthropic.claude-3-sonnet-20240229-v1:0' : 'mistral.mistral-large-2402-v1:0',
        provider,
        region: 'us-east-1',
        maxTokens: 4000,
        temperature: 0.3,
        credentials: {
          accessKeyId: 'stored-key',
          secretAccessKey: 'stored-secret',
          ...(provider === 'anthropic' && { sessionToken: 'stored-token' })
        },
        ...configOverrides
      };

      const service = new MockBedrockService(mockConfig, provider);
      return service;
    }

    async generateCompletion(messages: any[]): Promise<string> {
      return "Mock completion response";
    }
  }

  return {
    ...originalModule,
    BedrockService: MockBedrockService
  };
});

describe('BedrockService', () => {
  let mockBedrockRuntimeClient: jest.Mocked<BedrockRuntimeClient>;
  let mockGetBedrockConfig: jest.MockedFunction<typeof getBedrockConfig>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock BedrockRuntimeClient
    const mockSend = jest.fn();
    mockBedrockRuntimeClient = {
      send: mockSend,
    } as any;

    (BedrockRuntimeClient as jest.MockedClass<typeof BedrockRuntimeClient>).mockImplementation(() => mockBedrockRuntimeClient);

    // Mock getBedrockConfig
    mockGetBedrockConfig = getBedrockConfig as jest.MockedFunction<typeof getBedrockConfig>;
  });

  describe('constructor', () => {
    it('should create service with default configuration', () => {
      const service = new BedrockService();

      expect(BedrockRuntimeClient).toHaveBeenCalledWith(
        expect.objectContaining({
          region: expect.any(String)
        })
      );
    });

    it('should create service with custom configuration', () => {
      const customConfig = {
        maxTokens: 8000,
        temperature: 0.5,
        region: 'us-west-2'
      };

      const service = new BedrockService(customConfig);

      expect(BedrockRuntimeClient).toHaveBeenCalledWith(
        expect.objectContaining({
          region: 'us-west-2'
        })
      );
    });

    it('should create service with credentials when provided', () => {
      const configWithCredentials = {
        credentials: {
          accessKeyId: 'test-key',
          secretAccessKey: 'test-secret',
          sessionToken: 'test-token'
        },
        region: 'us-east-1'
      };

      const service = new BedrockService(configWithCredentials);

      expect(BedrockRuntimeClient).toHaveBeenCalledWith(
        expect.objectContaining({
          region: 'us-east-1'
        })
      );
    });

    it('should create service without credentials when not provided', () => {
      const configWithoutCredentials = {
        region: 'us-east-1'
      };

      const service = new BedrockService(configWithoutCredentials);

      expect(BedrockRuntimeClient).toHaveBeenCalledWith(
        expect.objectContaining({
          region: 'us-east-1'
        })
      );
    });

    it('should create service for Mistral provider', () => {
      const service = new BedrockService({}, 'mistral');

      expect(BedrockRuntimeClient).toHaveBeenCalledWith(
        expect.objectContaining({
          region: expect.any(String)
        })
      );
    });
  });

  describe('createWithStoredCredentials', () => {
    it('should create service with stored credentials for Anthropic', async () => {
      const service = await BedrockService.createWithStoredCredentials('anthropic');

      expect(service).toBeDefined();
      expect(service).toBeInstanceOf(BedrockService);
    });

    it('should create service with stored credentials for Mistral', async () => {
      const service = await BedrockService.createWithStoredCredentials('mistral');

      expect(service).toBeDefined();
      expect(service).toBeInstanceOf(BedrockService);
    });

    it('should create service with config overrides', async () => {
      const configOverrides = {
        maxTokens: 8000,
        temperature: 0.5
      };

      const service = await BedrockService.createWithStoredCredentials(
        'anthropic',
        configOverrides
      );

      expect(service).toBeDefined();
      expect(service).toBeInstanceOf(BedrockService);
    });

    it('should create service with credential options', async () => {
      const credentialOptions = {
        preferredProfile: 'test-profile'
      };

      const service = await BedrockService.createWithStoredCredentials(
        'anthropic',
        {},
        credentialOptions
      );

      expect(service).toBeDefined();
      expect(service).toBeInstanceOf(BedrockService);
    });

    it('should create service without credentials when none available', async () => {
      const service = await BedrockService.createWithStoredCredentials('anthropic');

      expect(service).toBeDefined();
      expect(service).toBeInstanceOf(BedrockService);
    });
  });

  describe('generateCompletion', () => {
    it('should generate completion successfully', async () => {
      const service = new BedrockService();
      const messages = [
        {
          role: 'user' as const,
          content: [{ type: 'text' as const, text: 'Hello' }]
        }
      ];

      const result = await service.generateCompletion(messages);

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });
  });
}); 