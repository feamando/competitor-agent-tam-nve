/**
 * Task 4.1: Node.js Memory Configuration
 * Environment-specific memory limits and garbage collection optimization
 */

export interface MemoryConfig {
  maxOldSpaceSize: number;
  maxSemiSpaceSize?: number;
  gcOptimizations: string[];
  performanceFlags: string[];
  healthCheckThresholds: {
    warning: number;
    critical: number;
  };
  environment: string;
}

// Environment-specific memory configurations
export const MEMORY_CONFIGS: Record<string, MemoryConfig> = {
  development: {
    maxOldSpaceSize: 4096, // 4GB - As requested in task 4.1
    maxSemiSpaceSize: 128,
    gcOptimizations: [
      '--expose-gc',
      '--gc-interval=100',
      '--optimize-for-size'
    ],
    performanceFlags: [
      '--max-http-header-size=16384',
      '--enable-source-maps'
    ],
    healthCheckThresholds: {
      warning: 0.75, // 75%
      critical: 0.85 // 85%
    },
    environment: 'development'
  },

  production: {
    maxOldSpaceSize: 8192, // 8GB for production
    maxSemiSpaceSize: 256,
    gcOptimizations: [
      '--expose-gc',
      '--gc-interval=100',
      '--optimize-for-size',
      '--no-compilation-cache',
      '--stack-trace-limit=50'
    ],
    performanceFlags: [
      '--max-http-header-size=16384',
      '--max-old-space-size=8192'
    ],
    healthCheckThresholds: {
      warning: 0.80, // 80%
      critical: 0.90 // 90%
    },
    environment: 'production'
  },

  staging: {
    maxOldSpaceSize: 6144, // 6GB for staging
    maxSemiSpaceSize: 192,
    gcOptimizations: [
      '--expose-gc',
      '--gc-interval=100',
      '--optimize-for-size',
      '--stack-trace-limit=100'
    ],
    performanceFlags: [
      '--max-http-header-size=16384',
      '--enable-source-maps'
    ],
    healthCheckThresholds: {
      warning: 0.75, // 75%
      critical: 0.85 // 85%
    },
    environment: 'staging'
  },

  test: {
    maxOldSpaceSize: 2048, // 2GB for testing
    maxSemiSpaceSize: 64,
    gcOptimizations: [
      '--expose-gc',
      '--gc-interval=50'
    ],
    performanceFlags: [
      '--max-http-header-size=8192',
      '--enable-source-maps'
    ],
    healthCheckThresholds: {
      warning: 0.70, // 70%
      critical: 0.80 // 80%
    },
    environment: 'test'
  }
};

/**
 * Get memory configuration for current environment
 */
export function getMemoryConfig(): MemoryConfig {
  const env = process.env.NODE_ENV || 'development';
  const config = MEMORY_CONFIGS[env];
  if (!config) {
    return MEMORY_CONFIGS.development;
  }
  return config;
}

/**
 * Generate Node.js memory flags for the current environment
 */
export function getNodeMemoryFlags(): string[] {
  const config = getMemoryConfig();
  
  const flags = [
    `--max-old-space-size=${config.maxOldSpaceSize}`,
    ...config.gcOptimizations,
    ...config.performanceFlags
  ];

  if (config.maxSemiSpaceSize) {
    flags.push(`--max-semi-space-size=${config.maxSemiSpaceSize}`);
  }

  return flags;
}

/**
 * Generate NODE_OPTIONS string for package.json scripts
 */
export function generateNodeOptions(): string {
  return getNodeMemoryFlags().join(' ');
}

/**
 * Get memory health check thresholds for current environment
 */
export function getMemoryThresholds() {
  const config = getMemoryConfig();
  return config.healthCheckThresholds;
}

/**
 * Validate current memory settings against configuration
 */
export function validateMemorySettings(): {
  valid: boolean;
  issues: string[];
  recommendations: string[];
} {
  const config = getMemoryConfig();
  const issues: string[] = [];
  const recommendations: string[] = [];

  // Check if garbage collection is available
  if (!global.gc) {
    issues.push('Garbage collection not exposed - app not started with --expose-gc');
    recommendations.push('Add --expose-gc to NODE_OPTIONS');
  }

  // Check current heap size against configuration
  const memoryUsage = process.memoryUsage();
  const currentMaxHeap = memoryUsage.heapTotal;
  const configuredMax = config.maxOldSpaceSize * 1024 * 1024; // Convert MB to bytes

  if (currentMaxHeap > configuredMax * 0.9) {
    issues.push(`Heap usage approaching configured limit: ${Math.round(currentMaxHeap / 1024 / 1024)}MB of ${config.maxOldSpaceSize}MB`);
    recommendations.push('Consider increasing --max-old-space-size or optimizing memory usage');
  }

  // Check environment-specific recommendations
  const env = process.env.NODE_ENV || 'development';
  if (env === 'production' && config.maxOldSpaceSize < 4096) {
    recommendations.push('Consider increasing memory limit for production environment');
  }

  return {
    valid: issues.length === 0,
    issues,
    recommendations
  };
}

/**
 * Get memory optimization suggestions based on current usage
 */
export function getMemoryOptimizationSuggestions(): string[] {
  const config = getMemoryConfig();
  const memoryUsage = process.memoryUsage();
  const suggestions: string[] = [];

  const heapUsedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
  const heapTotalMB = Math.round(memoryUsage.heapTotal / 1024 / 1024);
  const heapPercentage = (memoryUsage.heapUsed / memoryUsage.heapTotal);

  if (heapPercentage > config.healthCheckThresholds.critical) {
    suggestions.push('CRITICAL: Memory usage exceeds critical threshold - immediate action required');
    suggestions.push('Consider running garbage collection: global.gc()');
    suggestions.push('Review memory leaks in recent code changes');
  } else if (heapPercentage > config.healthCheckThresholds.warning) {
    suggestions.push('WARNING: Memory usage above warning threshold');
    suggestions.push('Consider proactive garbage collection');
    suggestions.push('Monitor memory growth patterns');
  }

  // Environment-specific suggestions
  if (config.environment === 'production') {
    suggestions.push('Enable memory profiling: NODE_OPTIONS="--prof"');
    suggestions.push('Monitor with external APM tools');
  }

  if (config.environment === 'development') {
    suggestions.push('Use heap snapshots for memory leak analysis');
    suggestions.push('Enable memory profiler: ENABLE_MEMORY_PROFILER=true');
  }

  return suggestions;
}

// Export current environment configuration for easy access
export const currentMemoryConfig = getMemoryConfig(); 