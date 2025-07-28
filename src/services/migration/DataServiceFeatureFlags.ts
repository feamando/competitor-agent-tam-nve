/**
 * Data Service Feature Flags - Task 1.3.5 Implementation
 * Feature flag system for gradual rollout of consolidated DataService
 * 
 * Follows the same pattern as AnalysisService FeatureFlags for consistency
 */

/**
 * Feature flag configuration for DataService rollout
 */
interface DataServiceFeatureConfig {
  enabledForSmartScheduling: boolean;
  enabledForReporting: boolean;
  enabledForAPIRoutes: boolean;
  enabledGlobally: boolean;
  rolloutPercentage: number;
}

/**
 * Default feature flag configuration - conservative rollout
 */
const DEFAULT_DATA_SERVICE_CONFIG: DataServiceFeatureConfig = {
  enabledForSmartScheduling: true,  // Start with critical path
  enabledForReporting: false,       // Gradual rollout
  enabledForAPIRoutes: false,       // Last to migrate
  enabledGlobally: false,           // Not enabled globally yet
  rolloutPercentage: 0              // Start with 0% rollout
};

/**
 * Data Service Feature Flags Manager
 */
class DataServiceFeatureFlags {
  private config: DataServiceFeatureConfig;

  constructor() {
    this.config = this.loadConfig();
  }

  /**
   * Check if DataService should be used for SmartSchedulingService
   */
  isEnabledForSmartScheduling(): boolean {
    return this.config.enabledForSmartScheduling && this.checkRolloutPercentage();
  }

  /**
   * Check if DataService should be used for reporting services
   */
  isEnabledForReporting(): boolean {
    return this.config.enabledForReporting && this.checkRolloutPercentage();
  }

  /**
   * Check if DataService should be used for API routes
   */
  isEnabledForAPIRoutes(): boolean {
    return this.config.enabledForAPIRoutes && this.checkRolloutPercentage();
  }

  /**
   * Check if DataService is enabled globally
   */
  isEnabledGlobally(): boolean {
    return this.config.enabledGlobally;
  }

  /**
   * Get current rollout percentage
   */
  getRolloutPercentage(): number {
    return this.config.rolloutPercentage;
  }

  /**
   * Should use legacy service (inverse of unified service)
   */
  shouldUseLegacyDataServices(): boolean {
    return !this.checkRolloutPercentage();
  }

  /**
   * Enable DataService for specific component
   */
  enableForComponent(component: keyof Omit<DataServiceFeatureConfig, 'enabledGlobally' | 'rolloutPercentage'>): void {
    this.config[component] = true;
    this.saveConfig();
  }

  /**
   * Disable DataService for specific component
   */
  disableForComponent(component: keyof Omit<DataServiceFeatureConfig, 'enabledGlobally' | 'rolloutPercentage'>): void {
    this.config[component] = false;
    this.saveConfig();
  }

  /**
   * Set rollout percentage (0-100)
   */
  setRolloutPercentage(percentage: number): void {
    this.config.rolloutPercentage = Math.max(0, Math.min(100, percentage));
    this.saveConfig();
  }

  /**
   * Enable globally (100% rollout)
   */
  enableGlobally(): void {
    this.config.enabledGlobally = true;
    this.config.rolloutPercentage = 100;
    this.config.enabledForSmartScheduling = true;
    this.config.enabledForReporting = true;
    this.config.enabledForAPIRoutes = true;
    this.saveConfig();
  }

  /**
   * Disable globally (rollback to legacy services)
   */
  disableGlobally(): void {
    this.config.enabledGlobally = false;
    this.config.rolloutPercentage = 0;
    this.config.enabledForSmartScheduling = false;
    this.config.enabledForReporting = false;
    this.config.enabledForAPIRoutes = false;
    this.saveConfig();
  }

  /**
   * Get current configuration for monitoring
   */
  getConfig(): DataServiceFeatureConfig {
    return { ...this.config };
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Load configuration from environment or use defaults
   */
  private loadConfig(): DataServiceFeatureConfig {
    try {
      // Try to load from environment variables
      const envConfig: Partial<DataServiceFeatureConfig> = {
        enabledForSmartScheduling: process.env.DATA_SERVICE_SMART_SCHEDULING === 'true',
        enabledForReporting: process.env.DATA_SERVICE_REPORTING === 'true', 
        enabledForAPIRoutes: process.env.DATA_SERVICE_API_ROUTES === 'true',
        enabledGlobally: process.env.DATA_SERVICE_GLOBAL === 'true',
        rolloutPercentage: parseInt(process.env.DATA_SERVICE_ROLLOUT_PERCENTAGE || '0', 10)
      };

      return { ...DEFAULT_DATA_SERVICE_CONFIG, ...envConfig };
    } catch {
      console.warn('Failed to load DataService feature flags from environment, using defaults');
      return DEFAULT_DATA_SERVICE_CONFIG;
    }
  }

  /**
   * Save configuration (in production, this might write to a config service)
   */
  private saveConfig(): void {
    // In a real implementation, this would persist to a configuration service
    // For now, just log the change
    console.log('DataService feature flags updated:', this.config);
  }

  /**
   * Check if current request should use DataService based on rollout percentage
   */
  private checkRolloutPercentage(): boolean {
    if (this.config.enabledGlobally) {
      return true;
    }

    if (this.config.rolloutPercentage === 0) {
      return false;
    }

    if (this.config.rolloutPercentage === 100) {
      return true;
    }

    // Simple deterministic rollout based on timestamp
    // In production, this might use user ID or request ID for consistency
    const hash = Date.now() % 100;
    return hash < this.config.rolloutPercentage;
  }
}

// Export singleton instance
export const dataServiceFeatureFlags = new DataServiceFeatureFlags();

// Named exports for convenience
export const shouldUseUnifiedDataService = () => dataServiceFeatureFlags.isEnabledGlobally();
export const shouldUseLegacyDataServices = () => dataServiceFeatureFlags.shouldUseLegacyDataServices();

// Export class for testing
export { DataServiceFeatureFlags }; 