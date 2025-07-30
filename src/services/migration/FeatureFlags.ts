/**
 * Feature Flags Service - Task 3.1 Implementation
 * 
 * Manages feature flags for gradual rollout from legacy analysis services 
 * to the new unified AnalysisService. Enables safe migration with fallback
 * capabilities and performance monitoring.
 */

import { logger } from '@/lib/logger';

// Feature flag configuration
export interface FeatureFlagConfig {
  // Analysis service migration flags
  useUnifiedAnalysisService: boolean;
  useAIAnalyzer: boolean;
  useUXAnalyzer: boolean;
  useComparativeAnalyzer: boolean;
  
  // Rollout percentage (0-100)
  rolloutPercentage: number;
  
  // Specific service rollouts
  enableForReporting: boolean;
  enableForAPI: boolean;
  enableForScheduledJobs: boolean;
  
  // Safety mechanisms
  enableFallback: boolean;
  performanceMonitoring: boolean;
  
  // Environment-specific overrides
  environment: 'development' | 'staging' | 'production';
}

// Default configuration - conservative rollout
const DEFAULT_CONFIG: FeatureFlagConfig = {
  useUnifiedAnalysisService: false,
  useAIAnalyzer: false,
  useUXAnalyzer: false,
  useComparativeAnalyzer: false,
  rolloutPercentage: 0,
  enableForReporting: false,
  enableForAPI: false,
  enableForScheduledJobs: false,
  enableFallback: true,
  performanceMonitoring: true,
  environment: (process.env.NODE_ENV as any) || 'development'
};

// Override configuration based on environment
const ENVIRONMENT_OVERRIDES: Record<string, Partial<FeatureFlagConfig>> = {
  development: {
    useUnifiedAnalysisService: true,
    useAIAnalyzer: true,
    useUXAnalyzer: true,
    useComparativeAnalyzer: true,
    rolloutPercentage: 100,
    enableForReporting: true,
    enableForAPI: true,
    enableForScheduledJobs: true
  },
  staging: {
    useUnifiedAnalysisService: true,
    useAIAnalyzer: true,
    useUXAnalyzer: false, // Gradual rollout in staging
    useComparativeAnalyzer: true,
    rolloutPercentage: 50,
    enableForReporting: true,
    enableForAPI: false,
    enableForScheduledJobs: false
  },
  production: {
    useUnifiedAnalysisService: false, // Start conservative in production
    useAIAnalyzer: false,
    useUXAnalyzer: false,
    useComparativeAnalyzer: false,
    rolloutPercentage: 0,
    enableForReporting: false,
    enableForAPI: false,
    enableForScheduledJobs: false
  }
};

export class FeatureFlagService {
  private static instance: FeatureFlagService;
  private config: FeatureFlagConfig;
  private rolloutSeeds: Map<string, number> = new Map();

  private constructor() {
    this.config = this.loadConfiguration();
    logger.info('FeatureFlagService initialized', {
      environment: this.config.environment,
      rolloutPercentage: this.config.rolloutPercentage,
      unifiedServiceEnabled: this.config.useUnifiedAnalysisService
    });
  }

  public static getInstance(): FeatureFlagService {
    if (!FeatureFlagService.instance) {
      FeatureFlagService.instance = new FeatureFlagService();
    }
    return FeatureFlagService.instance;
  }

  /**
   * Load configuration with environment overrides
   */
  private loadConfiguration(): FeatureFlagConfig {
    const baseConfig = { ...DEFAULT_CONFIG };
    const envOverrides = ENVIRONMENT_OVERRIDES[baseConfig.environment] || {};
    
    // Apply environment-specific overrides
    const config = { ...baseConfig, ...envOverrides };
    
    // Apply any runtime configuration from environment variables
    if (process.env.ANALYSIS_SERVICE_ROLLOUT_PERCENTAGE) {
      config.rolloutPercentage = parseInt(process.env.ANALYSIS_SERVICE_ROLLOUT_PERCENTAGE, 10);
    }
    
    if (process.env.FORCE_UNIFIED_ANALYSIS_SERVICE === 'true') {
      config.useUnifiedAnalysisService = true;
      config.rolloutPercentage = 100;
    }
    
    return config;
  }

  /**
   * Check if unified AnalysisService should be used
   */
  public shouldUseUnifiedAnalysisService(context?: string): boolean {
    if (!this.config.useUnifiedAnalysisService) {
      return false;
    }

    // Check rollout percentage with consistent seeding per context
    if (context && this.config.rolloutPercentage < 100) {
      const seed = this.getRolloutSeed(context);
      const shouldRollout = seed < this.config.rolloutPercentage;
      
      logger.debug('Rollout decision for unified AnalysisService', {
        context,
        seed,
        rolloutPercentage: this.config.rolloutPercentage,
        shouldRollout
      });
      
      return shouldRollout;
    }

    return true;
  }

  /**
   * Check if AI Analyzer should be used
   */
  public shouldUseAIAnalyzer(context?: string): boolean {
    return this.config.useAIAnalyzer && this.shouldUseUnifiedAnalysisService(context);
  }

  /**
   * Check if UX Analyzer should be used
   */
  public shouldUseUXAnalyzer(context?: string): boolean {
    return this.config.useUXAnalyzer && this.shouldUseUnifiedAnalysisService(context);
  }

  /**
   * Check if Comparative Analyzer should be used
   */
  public shouldUseComparativeAnalyzer(context?: string): boolean {
    return this.config.useComparativeAnalyzer && this.shouldUseUnifiedAnalysisService(context);
  }

  /**
   * Check service-specific enablement
   */
  public isEnabledForReporting(): boolean {
    return this.config.enableForReporting && this.config.useUnifiedAnalysisService;
  }

  public isEnabledForAPI(): boolean {
    return this.config.enableForAPI && this.config.useUnifiedAnalysisService;
  }

  public isEnabledForScheduledJobs(): boolean {
    return this.config.enableForScheduledJobs && this.config.useUnifiedAnalysisService;
  }

  /**
   * Check if fallback to legacy services is enabled
   */
  public isFallbackEnabled(): boolean {
    return this.config.enableFallback;
  }

  /**
   * Check if performance monitoring is enabled
   */
  public isPerformanceMonitoringEnabled(): boolean {
    return this.config.performanceMonitoring;
  }

  /**
   * Update configuration (for runtime changes)
   */
  public updateConfiguration(updates: Partial<FeatureFlagConfig>): void {
    const previousConfig = { ...this.config };
    this.config = { ...this.config, ...updates };
    
    logger.info('Feature flag configuration updated', {
      previousConfig,
      newConfig: this.config,
      changes: updates
    });
  }

  /**
   * Get current configuration
   */
  public getConfiguration(): FeatureFlagConfig {
    return { ...this.config };
  }

  /**
   * Get consistent rollout seed for a context
   */
  private getRolloutSeed(context: string): number {
    if (!this.rolloutSeeds.has(context)) {
      // Create deterministic seed based on context
      let hash = 0;
      for (let i = 0; i < context.length; i++) {
        const char = context.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
      }
      const seed = Math.abs(hash) % 100;
      this.rolloutSeeds.set(context, seed);
    }
    return this.rolloutSeeds.get(context)!;
  }

  /**
   * Log feature flag usage for monitoring
   */
  public logUsage(service: string, flag: string, enabled: boolean, context?: string): void {
    if (this.config.performanceMonitoring) {
      logger.info('Feature flag usage', {
        service,
        flag,
        enabled,
        context,
        environment: this.config.environment,
        rolloutPercentage: this.config.rolloutPercentage
      });
    }
  }
}

// Export singleton instance
export const featureFlags = FeatureFlagService.getInstance();

// Export convenience functions
export function shouldUseUnifiedAnalysisService(context?: string): boolean {
  const result = featureFlags.shouldUseUnifiedAnalysisService(context);
  featureFlags.logUsage('analysis', 'unifiedAnalysisService', result, context);
  return result;
}

export function shouldUseAIAnalyzer(context?: string): boolean {
  const result = featureFlags.shouldUseAIAnalyzer(context);
  featureFlags.logUsage('analysis', 'aiAnalyzer', result, context);
  return result;
}

export function shouldUseUXAnalyzer(context?: string): boolean {
  const result = featureFlags.shouldUseUXAnalyzer(context);
  featureFlags.logUsage('analysis', 'uxAnalyzer', result, context);
  return result;
}

export function shouldUseComparativeAnalyzer(context?: string): boolean {
  const result = featureFlags.shouldUseComparativeAnalyzer(context);
  featureFlags.logUsage('analysis', 'comparativeAnalyzer', result, context);
  return result;
} 