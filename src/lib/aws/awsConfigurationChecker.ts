// Task 6.1.1: Add checkAWSConfiguration() function to startup
// Task 6.1.2: Check for AWS_ACCESS_KEY_ID environment variable
// Task 6.1.3: Check for AWS_SECRET_ACCESS_KEY environment variable
// Task 6.1.4: Log configuration status on server startup

interface AWSConfigurationStatus {
  hasAccessKeyId: boolean;
  hasSecretAccessKey: boolean;
  hasRegion: boolean;
  isConfigured: boolean;
  configurationLevel: 'none' | 'partial' | 'complete';
  missingVariables: string[];
  timestamp: string;
}

/**
 * Task 6.1.1: Check AWS configuration on server startup
 * Validates presence of required AWS environment variables
 */
export function checkAWSConfiguration(): AWSConfigurationStatus {
  const timestamp = new Date().toISOString();
  
  // Task 6.1.2: Check for AWS_ACCESS_KEY_ID environment variable
  const hasAccessKeyId = !!(process.env.AWS_ACCESS_KEY_ID?.trim());
  
  // Task 6.1.3: Check for AWS_SECRET_ACCESS_KEY environment variable  
  const hasSecretAccessKey = !!(process.env.AWS_SECRET_ACCESS_KEY?.trim());
  
  // Also check for AWS_REGION (common requirement)
  const hasRegion = !!(process.env.AWS_REGION?.trim() || process.env.AWS_DEFAULT_REGION?.trim());
  
  // Determine missing variables
  const missingVariables: string[] = [];
  if (!hasAccessKeyId) missingVariables.push('AWS_ACCESS_KEY_ID');
  if (!hasSecretAccessKey) missingVariables.push('AWS_SECRET_ACCESS_KEY');
  if (!hasRegion) missingVariables.push('AWS_REGION');
  
  // Determine configuration level
  let configurationLevel: 'none' | 'partial' | 'complete';
  if (hasAccessKeyId && hasSecretAccessKey && hasRegion) {
    configurationLevel = 'complete';
  } else if (hasAccessKeyId || hasSecretAccessKey || hasRegion) {
    configurationLevel = 'partial';
  } else {
    configurationLevel = 'none';
  }
  
  const isConfigured = configurationLevel === 'complete';
  
  const status: AWSConfigurationStatus = {
    hasAccessKeyId,
    hasSecretAccessKey,
    hasRegion,
    isConfigured,
    configurationLevel,
    missingVariables,
    timestamp
  };
  
  // Task 6.1.4: Log configuration status on server startup
  logConfigurationStatus(status);
  
  return status;
}

/**
 * Task 6.1.4: Log configuration status on server startup
 */
function logConfigurationStatus(status: AWSConfigurationStatus): void {
  const logLevel = status.isConfigured ? 'info' : 'warn';
  const message = status.isConfigured 
    ? 'AWS configuration complete - all required environment variables found'
    : `AWS configuration ${status.configurationLevel} - missing variables: ${status.missingVariables.join(', ')}`;
  
  if (typeof console !== 'undefined') {
    if (logLevel === 'warn') {
      console.warn(`[AWS Config] ${message}`, {
        configurationLevel: status.configurationLevel,
        hasAccessKeyId: status.hasAccessKeyId,
        hasSecretAccessKey: status.hasSecretAccessKey, 
        hasRegion: status.hasRegion,
        missingVariables: status.missingVariables,
        timestamp: status.timestamp
      });
    } else {
      console.info(`[AWS Config] ${message}`, {
        configurationLevel: status.configurationLevel,
        timestamp: status.timestamp
      });
    }
  }
}

/**
 * Initialize AWS configuration check on module load (for server-side)
 */
let startupConfigurationStatus: AWSConfigurationStatus | null = null;

export function getStartupConfigurationStatus(): AWSConfigurationStatus | null {
  return startupConfigurationStatus;
}

// Run configuration check on server startup (only in Node.js environment)
if (typeof process !== 'undefined' && process.env) {
  startupConfigurationStatus = checkAWSConfiguration();
}

export type { AWSConfigurationStatus }; 