// Memory Management Configuration
// Implementation for Task 1.1 - Address Memory Pressure Issues
// Date: July 29, 2025

export interface MemoryConfig {
  // Memory thresholds (percentages)
  warningThreshold: number;
  criticalThreshold: number;
  
  // Garbage collection settings
  gcEnabled: boolean;
  gcCooldownMs: number;
  proactiveGcThreshold: number;
  proactiveGcIntervalMs: number;
  
  // Monitoring settings
  monitorIntervalMs: number;
  alertHistoryLimit: number;
  
  // Node.js memory settings
  maxOldSpaceSize: number;
  exposeGc: boolean;
  
  // Emergency actions
  emergencyRestartThreshold: number;
  enableEmergencyActions: boolean;
}

export const defaultMemoryConfig: MemoryConfig = {
  // Task 1.1 requirement: 85% warning threshold
  warningThreshold: 0.85,
  criticalThreshold: 0.95,
  
  // Garbage collection configuration
  gcEnabled: true,
  gcCooldownMs: 30000, // 30 seconds between forced GC
  proactiveGcThreshold: 0.70, // Start proactive GC at 70%
  proactiveGcIntervalMs: 300000, // 5 minutes
  
  // Monitoring configuration
  monitorIntervalMs: 30000, // 30 seconds
  alertHistoryLimit: 100,
  
  // Node.js memory settings per task 1.1
  maxOldSpaceSize: 8192, // 8GB
  exposeGc: true,
  
  // Emergency settings
  emergencyRestartThreshold: 0.98, // 98%
  enableEmergencyActions: false // Disabled by default for safety
};

export const productionMemoryConfig: MemoryConfig = {
  ...defaultMemoryConfig,
  // Production-specific overrides
  enableEmergencyActions: true,
  proactiveGcThreshold: 0.75, // More conservative in production
};

export const developmentMemoryConfig: MemoryConfig = {
  ...defaultMemoryConfig,
  // Development-specific overrides
  warningThreshold: 0.80, // Earlier warnings in dev
  monitorIntervalMs: 15000, // More frequent monitoring
};

/**
 * Get memory configuration based on environment
 */
export function getMemoryConfig(): MemoryConfig {
  const env = process.env.NODE_ENV || 'development';
  
  switch (env) {
    case 'production':
      return productionMemoryConfig;
    case 'development':
      return developmentMemoryConfig;
    default:
      return defaultMemoryConfig;
  }
}

/**
 * Generate Node.js options string from config
 */
export function generateNodeOptions(config: MemoryConfig = getMemoryConfig()): string {
  const options: string[] = [];
  
  if (config.exposeGc) {
    options.push('--expose-gc');
  }
  
  if (config.maxOldSpaceSize > 0) {
    options.push(`--max-old-space-size=${config.maxOldSpaceSize}`);
  }
  
  return options.join(' ');
}

/**
 * Memory configuration validation
 */
export function validateMemoryConfig(config: MemoryConfig): string[] {
  const errors: string[] = [];
  
  if (config.warningThreshold >= config.criticalThreshold) {
    errors.push('Warning threshold must be less than critical threshold');
  }
  
  if (config.warningThreshold <= 0 || config.warningThreshold >= 1) {
    errors.push('Warning threshold must be between 0 and 1');
  }
  
  if (config.criticalThreshold <= 0 || config.criticalThreshold >= 1) {
    errors.push('Critical threshold must be between 0 and 1');
  }
  
  if (config.maxOldSpaceSize < 512) {
    errors.push('Max old space size should be at least 512MB');
  }
  
  if (config.gcCooldownMs < 5000) {
    errors.push('GC cooldown should be at least 5 seconds');
  }
  
  return errors;
}

/**
 * Memory recommendations based on system specs
 */
export function getMemoryRecommendations(): {
  recommendedMaxOldSpace: number;
  recommendedWarningThreshold: number;
  notes: string[];
} {
  const totalMemoryGB = require('os').totalmem() / (1024 * 1024 * 1024);
  const notes: string[] = [];
  
  let recommendedMaxOldSpace = 4096; // Default 4GB
  let recommendedWarningThreshold = 0.85;
  
  if (totalMemoryGB < 8) {
    recommendedMaxOldSpace = Math.floor(totalMemoryGB * 0.5 * 1024); // 50% of system memory
    recommendedWarningThreshold = 0.75; // More conservative
    notes.push('Low system memory detected - using conservative settings');
  } else if (totalMemoryGB >= 16) {
    recommendedMaxOldSpace = 8192; // Task 1.1 requirement
    notes.push('High system memory available - using task 1.1 optimized settings');
  } else {
    recommendedMaxOldSpace = Math.floor(totalMemoryGB * 0.4 * 1024); // 40% of system memory
    notes.push('Medium system memory - using balanced settings');
  }
  
  return {
    recommendedMaxOldSpace,
    recommendedWarningThreshold,
    notes
  };
} 