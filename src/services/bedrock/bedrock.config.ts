import { BedrockConfig } from "./types";
import { CredentialProvider, CredentialProviderOptions } from "../aws/credentialProvider";

/**
 * Get dynamic Bedrock configuration with stored credentials support
 */
export async function getBedrockConfig(
  provider: 'anthropic' | 'mistral' = 'anthropic',
  configOverrides: Partial<BedrockConfig> = {},
  credentialOptions: CredentialProviderOptions = {}
): Promise<BedrockConfig> {
  const credentialProvider = new CredentialProvider();
  
  // Get credentials and region from provider (with fallback to env vars)
  const [credentials, region] = await Promise.all([
    credentialProvider.getCredentials(credentialOptions),
    credentialProvider.getRegion(credentialOptions)
  ]);

  const baseConfig = provider === 'anthropic' ? {
    modelId: "anthropic.claude-3-sonnet-20240229-v1:0",
    provider: "anthropic" as const,
    anthropicVersion: "bedrock-2023-05-31",
  } : {
    modelId: "mistral.mistral-large-2402-v1:0",
    provider: "mistral" as const,
  };

  const config = {
    ...baseConfig,
    region,
    maxTokens: 4000,
    temperature: 0.3,
    topP: 0.999,
    topK: 250,
    stopSequences: [],
    ...configOverrides
  };

  // Only add credentials if they exist
  if (credentials) {
    (config as any).credentials = credentials;
  }

  return config;
}

/**
 * Legacy static configs for backwards compatibility
 * These now use environment variables only
 */
export const claudeConfig: BedrockConfig = {
  modelId: "anthropic.claude-3-sonnet-20240229-v1:0",
  provider: "anthropic",
  region: process.env.AWS_REGION || "eu-west-1",
  maxTokens: 4000,
  temperature: 0.3,
  topP: 0.999,
  topK: 250,
  stopSequences: [],
  anthropicVersion: "bedrock-2023-05-31",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
    sessionToken: process.env.AWS_SESSION_TOKEN || ""
  }
};

export const mistralConfig: BedrockConfig = {
  modelId: "mistral.mistral-large-2402-v1:0",
  provider: "mistral",
  region: process.env.AWS_REGION || "eu-west-1",
  maxTokens: 4000,
  temperature: 0.3,
  topP: 0.999,
  topK: 250,
  stopSequences: [],
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
    sessionToken: process.env.AWS_SESSION_TOKEN || ""
  }
};

// Development mode check - now checks for any available credentials
export async function isDevelopmentMode(): Promise<boolean> {
  try {
    const credentialProvider = new CredentialProvider();
    const hasCredentials = await credentialProvider.hasCredentials();
    return !hasCredentials || process.env.NODE_ENV === 'development';
  } catch {
    return !process.env.AWS_ACCESS_KEY_ID || process.env.NODE_ENV === 'development';
  }
}
