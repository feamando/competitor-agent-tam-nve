import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { BedrockConfig, BedrockMessage, BedrockRequest, BedrockResponse, ModelProvider, MistralMessage } from './types';
import { claudeConfig, mistralConfig, getBedrockConfig } from './bedrock.config';
import { CredentialProviderOptions } from '../aws/credentialProvider';

export class BedrockService {
  private client: BedrockRuntimeClient;
  private config: BedrockConfig;

  constructor(config: Partial<BedrockConfig> = {}, provider: ModelProvider = 'anthropic') {
    this.config = {
      ...(provider === 'anthropic' ? claudeConfig : mistralConfig),
      ...config
    };

    this.client = this.createClient(this.config);
  }

  /**
   * Factory method to create BedrockService with stored credentials
   */
  static async createWithStoredCredentials(
    provider: ModelProvider = 'anthropic',
    configOverrides: Partial<BedrockConfig> = {},
    credentialOptions: CredentialProviderOptions = {}
  ): Promise<BedrockService> {
    const config = await getBedrockConfig(provider, configOverrides, credentialOptions);
    const service = new BedrockService(config, provider);
    return service;
  }

  /**
   * Create BedrockRuntime client with proper credential handling
   * Supports AWS SDK default credential chain while providing explicit validation
   */
  private createClient(config: BedrockConfig): BedrockRuntimeClient {
    const clientConfig: {
      region: string;
      credentials?: {
        accessKeyId: string;
        secretAccessKey: string;
        sessionToken?: string;
      };
    } = {
      region: config.region
    };

    // Add explicit credentials if provided, otherwise let AWS SDK use default credential chain
    if (config.credentials?.accessKeyId && config.credentials?.secretAccessKey) {
      clientConfig.credentials = {
        accessKeyId: config.credentials.accessKeyId,
        secretAccessKey: config.credentials.secretAccessKey,
        ...(config.credentials.sessionToken && { sessionToken: config.credentials.sessionToken })
      };
      
      console.log('[BedrockService] Using explicit credentials for Bedrock client initialization');
    } else {
      console.log('[BedrockService] Using AWS SDK default credential chain for Bedrock client initialization');
    }

    try {
      const client = new BedrockRuntimeClient(clientConfig);
      console.log('[BedrockService] Successfully created BedrockRuntimeClient', { 
        region: config.region, 
        hasExplicitCredentials: !!config.credentials?.accessKeyId 
      });
      return client;
    } catch (error) {
      console.error('[BedrockService] Failed to create BedrockRuntimeClient', { 
        error: error.message, 
        region: config.region,
        hasExplicitCredentials: !!config.credentials?.accessKeyId 
      });
      throw new Error(
        `Failed to initialize Bedrock service: ${error.message}. ` +
        'Please ensure AWS credentials are properly configured via environment variables, ' +
        'AWS config files, or IAM roles.'
      );
    }
  }

  private async invokeModel(request: BedrockRequest): Promise<BedrockResponse> {
    const formattedRequest = this.formatRequest(request);
    const command = new InvokeModelCommand({
      modelId: this.config.modelId,
      body: JSON.stringify(formattedRequest),
      contentType: 'application/json',
      accept: 'application/json',
    });

    try {
      console.log('[BedrockService] Invoking model with request:', {
        modelId: this.config.modelId,
        provider: this.config.provider,
        hasAnthropicVersion: !!formattedRequest.anthropic_version,
        anthropicVersion: formattedRequest.anthropic_version,
        messageCount: formattedRequest.messages?.length || 0
      });

      const response = await this.client.send(command);
      const responseBody = new TextDecoder().decode(response.body);
      return JSON.parse(responseBody);
    } catch (error) {
      console.error('[BedrockService] Error invoking Bedrock model:', {
        error: (error as Error).message,
        modelId: this.config.modelId,
        provider: this.config.provider,
        requestBody: JSON.stringify(formattedRequest, null, 2)
      });
      throw error;
    }
  }

  private formatRequest(request: BedrockRequest): BedrockRequest {
    if (this.config.provider === 'anthropic') {
      const formattedRequest: BedrockRequest = {
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
        top_k: this.config.topK,
        top_p: this.config.topP,
        stop_sequences: this.config.stopSequences,
        messages: request.messages as BedrockMessage[],
        // Always include anthropic_version for Anthropic models - required by Bedrock
        anthropic_version: this.config.anthropicVersion || "bedrock-2023-05-31"
      };
      
      return formattedRequest;
    } else {
      return {
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
        top_k: this.config.topK,
        top_p: this.config.topP,
        stop_sequences: this.config.stopSequences,
        messages: (request.messages as BedrockMessage[]).map(msg => ({
          role: msg.role,
          content: msg.content.map(c => {
            if (c.type === 'image_url') {
              return {
                type: 'image',
                source: {
                  type: 'url',
                  url: c.image_url.url
                }
              };
            }
            return c;
          })
        })) as MistralMessage[]
      };
    }
  }

  /**
   * Validate service availability by performing a lightweight test
   * Implements Task 2.1: Create startup health check method
   */ 
  async validateServiceAvailability(): Promise<boolean> {
    try {
      console.log('[BedrockService] Starting service availability validation');
      
      // Perform a minimal test to verify service connectivity
      const testMessages: BedrockMessage[] = [{
        role: 'user',
        content: [{ type: 'text', text: 'Test' }]
      }];

      const testRequest: BedrockRequest = {
        messages: testMessages,
        max_tokens: 1, // Minimal token count for test
        temperature: 0.1
      };

      // Create test command with minimal parameters
      const command = new InvokeModelCommand({
        modelId: this.config.modelId,
        body: JSON.stringify(this.formatRequest(testRequest)),
        contentType: 'application/json',
        accept: 'application/json',
      });

      // Attempt to send test request with timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Service validation timeout')), 5000);
      });

      const response = await Promise.race([
        this.client.send(command),
        timeoutPromise
      ]);

      console.log('[BedrockService] Service availability validation successful');
      return true;
    } catch (error) {
      console.error('[BedrockService] Service availability validation failed', {
        error: error.message,
        modelId: this.config.modelId,
        region: this.config.region
      });
      
      // Throw specific error for different failure types
      if (error.message.includes('timeout')) {
        throw new Error('Bedrock service validation timeout - service may be unavailable');
      } else if (error.message.includes('credentials')) {
        throw new Error('Bedrock service validation failed - invalid or missing credentials');
      } else if (error.message.includes('UnauthorizedOperation') || error.message.includes('AccessDenied')) {
        throw new Error('Bedrock service validation failed - insufficient permissions');
      } else {
        throw new Error(`Bedrock service validation failed: ${error.message}`);
      }
    }
  }

  async generateCompletion(messages: BedrockMessage[]): Promise<string> {
    const request: BedrockRequest = {
      messages
    };

    try {
      const response = await this.invokeModel(request);
      
      // Handle different response formats based on provider
      if (this.config.provider === 'anthropic') {
        // Claude response format: { content: [{ text: "...", type: "text" }], ... }
        if (response.content && Array.isArray(response.content) && response.content.length > 0) {
          return response.content[0]?.text || '';
        }
        // Fallback for old format
        if (response.completion) {
          return response.completion;
        }
        throw new Error('Invalid response format from Claude model');
      } else {
        // Mistral format
        return response.completion || '';
      }
    } catch (error) {
      console.error('Error generating completion:', error);
      throw error;
    }
  }
} 