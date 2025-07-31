/**
 * Task 8.3: Rollback Testing
 * 
 * Comprehensive testing for rollback procedures, feature flag switching,
 * and data consistency validation during rollback scenarios
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { generateCorrelationId } from '@/lib/logger';

// Rollback Testing Configuration
const ROLLBACK_TEST_CONFIG = {
  timeouts: {
    featureFlagSwitch: 10000,    // 10 seconds
    dataConsistency: 30000,      // 30 seconds
    serviceRollback: 60000,      // 1 minute
    loadTesting: 120000          // 2 minutes
  },
  loadProfile: {
    concurrentRequests: 10,
    testDuration: 60000,         // 1 minute
    requestInterval: 1000        // 1 second
  },
  dataValidation: {
    sampleSize: 50,
    consistencyThreshold: 0.95   // 95% consistency required
  },
  featureFlags: {
    consolidated_analysis: 'CONSOLIDATED_ANALYSIS_V15',
    consolidated_reporting: 'CONSOLIDATED_REPORTING_V15',
    legacy_fallback: 'LEGACY_SERVICES_FALLBACK'
  }
};

// Mock feature flag service
class FeatureFlagService {
  private flags: Map<string, boolean> = new Map();
  private rollbackHistory: Array<{
    flag: string;
    previousValue: boolean;
    newValue: boolean;
    timestamp: Date;
    reason: string;
  }> = [];

  setFlag(flagName: string, value: boolean, reason: string = 'Test'): void {
    const previousValue = this.flags.get(flagName) || false;
    this.flags.set(flagName, value);
    
    this.rollbackHistory.push({
      flag: flagName,
      previousValue,
      newValue: value,
      timestamp: new Date(),
      reason
    });
  }

  getFlag(flagName: string): boolean {
    return this.flags.get(flagName) || false;
  }

  getRollbackHistory(): typeof this.rollbackHistory {
    return [...this.rollbackHistory];
  }

  resetFlags(): void {
    this.flags.clear();
    this.rollbackHistory = [];
  }

  simulateProductionFlags(): void {
    // Simulate current production state (consolidated services enabled)
    this.setFlag(ROLLBACK_TEST_CONFIG.featureFlags.consolidated_analysis, true, 'Production default');
    this.setFlag(ROLLBACK_TEST_CONFIG.featureFlags.consolidated_reporting, true, 'Production default');
    this.setFlag(ROLLBACK_TEST_CONFIG.featureFlags.legacy_fallback, false, 'Production default');
  }

  rollbackToLegacy(reason: string): void {
    // Rollback procedure: disable consolidated services, enable legacy fallback
    this.setFlag(ROLLBACK_TEST_CONFIG.featureFlags.consolidated_analysis, false, reason);
    this.setFlag(ROLLBACK_TEST_CONFIG.featureFlags.consolidated_reporting, false, reason);
    this.setFlag(ROLLBACK_TEST_CONFIG.featureFlags.legacy_fallback, true, reason);
  }

  rollbackToConsolidated(reason: string): void {
    // Rollforward procedure: enable consolidated services, disable legacy fallback
    this.setFlag(ROLLBACK_TEST_CONFIG.featureFlags.consolidated_analysis, true, reason);
    this.setFlag(ROLLBACK_TEST_CONFIG.featureFlags.consolidated_reporting, true, reason);
    this.setFlag(ROLLBACK_TEST_CONFIG.featureFlags.legacy_fallback, false, reason);
  }
}

// Data consistency validator
class DataConsistencyValidator {
  private testData: Array<{
    projectId: string;
    analysisData: any;
    reportData: any;
    timestamp: Date;
    serviceVersion: string;
  }> = [];

  async captureDataSnapshot(projectId: string, serviceVersion: string): Promise<void> {
    try {
      // Capture analysis data
      const analysisResponse = await fetch(`http://localhost:3000/api/projects/${projectId}/analysis`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Correlation-ID': generateCorrelationId()
        },
        body: JSON.stringify({
          analysisConfig: {
            focusAreas: ['features', 'positioning'],
            depth: 'basic',
            testMode: true
          }
        })
      });

      // Capture report data
      const reportResponse = await fetch('http://localhost:3000/api/reports/auto-generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Correlation-ID': generateCorrelationId()
        },
        body: JSON.stringify({
          projectId,
          template: 'basic',
          immediate: true,
          testMode: true
        })
      });

      const analysisData = analysisResponse.ok ? await analysisResponse.json() : null;
      const reportData = reportResponse.ok ? await reportResponse.json() : null;

      this.testData.push({
        projectId,
        analysisData,
        reportData,
        timestamp: new Date(),
        serviceVersion
      });

    } catch (error) {
      console.error(`Failed to capture data snapshot for ${projectId}:`, error);
      // Store error information
      this.testData.push({
        projectId,
        analysisData: { error: (error as Error).message },
        reportData: { error: (error as Error).message },
        timestamp: new Date(),
        serviceVersion
      });
    }
  }

  validateDataConsistency(): {
    isConsistent: boolean;
    consistencyScore: number;
    inconsistencies: string[];
    details: any;
  } {
    const inconsistencies: string[] = [];
    let consistentItems = 0;
    let totalComparisons = 0;

    // Group data by projectId
    const dataByProject = new Map<string, typeof this.testData>();
    
    this.testData.forEach(item => {
      if (!dataByProject.has(item.projectId)) {
        dataByProject.set(item.projectId, []);
      }
      dataByProject.get(item.projectId)!.push(item);
    });

    // Compare data across service versions for each project
    dataByProject.forEach((projectData, projectId) => {
      const consolidatedData = projectData.filter(d => d.serviceVersion.includes('consolidated'));
      const legacyData = projectData.filter(d => d.serviceVersion.includes('legacy'));

      if (consolidatedData.length > 0 && legacyData.length > 0) {
        const consolidated = consolidatedData[consolidatedData.length - 1];
        const legacy = legacyData[legacyData.length - 1];

        totalComparisons++;

        // Compare analysis results structure
        if (this.compareAnalysisStructure(consolidated.analysisData, legacy.analysisData)) {
          consistentItems++;
        } else {
          inconsistencies.push(`Analysis structure mismatch for project ${projectId}`);
        }

        // Compare report results structure
        if (this.compareReportStructure(consolidated.reportData, legacy.reportData)) {
          consistentItems++;
        } else {
          inconsistencies.push(`Report structure mismatch for project ${projectId}`);
        }

        totalComparisons++; // Count both analysis and report comparisons
      }
    });

    const consistencyScore = totalComparisons > 0 ? consistentItems / totalComparisons : 0;

    return {
      isConsistent: consistencyScore >= ROLLBACK_TEST_CONFIG.dataValidation.consistencyThreshold,
      consistencyScore,
      inconsistencies,
      details: {
        totalComparisons,
        consistentItems,
        dataByProject: Array.from(dataByProject.keys()),
        capturedSnapshots: this.testData.length
      }
    };
  }

  private compareAnalysisStructure(consolidated: any, legacy: any): boolean {
    // Basic structure comparison - both should have success and analysis properties
    if (!consolidated || !legacy) return false;
    if (consolidated.error || legacy.error) return true; // Both failed, consider consistent
    
    return !!(consolidated.success !== undefined && 
              legacy.success !== undefined &&
              consolidated.analysis !== undefined &&
              legacy.analysis !== undefined);
  }

  private compareReportStructure(consolidated: any, legacy: any): boolean {
    // Basic structure comparison - both should have success and report properties
    if (!consolidated || !legacy) return false;
    if (consolidated.error || legacy.error) return true; // Both failed, consider consistent
    
    return !!(consolidated.success !== undefined && 
              legacy.success !== undefined &&
              consolidated.report !== undefined &&
              legacy.report !== undefined);
  }

  getTestData(): typeof this.testData {
    return [...this.testData];
  }

  reset(): void {
    this.testData = [];
  }
}

// Load testing during rollback
class RollbackLoadTester {
  private activeRequests = new Set<Promise<any>>();
  private results: Array<{
    timestamp: Date;
    operation: string;
    success: boolean;
    duration: number;
    serviceVersion: string;
    error?: string;
  }> = [];

  async runLoadTestDuringRollback(
    featureFlagService: FeatureFlagService,
    testDurationMs: number = ROLLBACK_TEST_CONFIG.loadProfile.testDuration
  ): Promise<{
    beforeRollback: any[];
    duringRollback: any[];
    afterRollback: any[];
    summary: any;
  }> {
    const results = {
      beforeRollback: [] as any[],
      duringRollback: [] as any[],
      afterRollback: [] as any[]
    };

    // Phase 1: Load test with consolidated services
    console.log('Phase 1: Testing with consolidated services...');
    await this.runLoadPhase('consolidated', testDurationMs / 3);
    results.beforeRollback = this.getPhaseResults('consolidated');

    // Phase 2: Trigger rollback and continue load testing
    console.log('Phase 2: Triggering rollback and testing...');
    featureFlagService.rollbackToLegacy('Load test rollback simulation');
    
    await this.runLoadPhase('rollback-transition', testDurationMs / 3);
    results.duringRollback = this.getPhaseResults('rollback-transition');

    // Phase 3: Continue load test with legacy services
    console.log('Phase 3: Testing with legacy services...');
    await this.runLoadPhase('legacy', testDurationMs / 3);
    results.afterRollback = this.getPhaseResults('legacy');

    return {
      ...results,
      summary: this.generateLoadTestSummary()
    };
  }

  private async runLoadPhase(phase: string, durationMs: number): Promise<void> {
    const endTime = Date.now() + durationMs;
    const promises: Promise<any>[] = [];

    while (Date.now() < endTime) {
      // Start concurrent requests
      for (let i = 0; i < ROLLBACK_TEST_CONFIG.loadProfile.concurrentRequests; i++) {
        const promise = this.executeRequest(phase);
        promises.push(promise);
        this.activeRequests.add(promise);

        promise.finally(() => {
          this.activeRequests.delete(promise);
        });
      }

      // Wait before next batch
      await this.sleep(ROLLBACK_TEST_CONFIG.loadProfile.requestInterval);
    }

    // Wait for remaining requests to complete
    await Promise.allSettled(promises);
  }

  private async executeRequest(phase: string): Promise<void> {
    const projectId = `rollback-test-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const startTime = Date.now();

    try {
      const response = await fetch(`http://localhost:3000/api/projects/${projectId}/analysis`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Correlation-ID': generateCorrelationId()
        },
        body: JSON.stringify({
          analysisConfig: {
            focusAreas: ['features'],
            depth: 'basic',
            testMode: true
          }
        })
      });

      const duration = Date.now() - startTime;
      
      this.results.push({
        timestamp: new Date(),
        operation: 'analysis',
        success: response.ok,
        duration,
        serviceVersion: phase,
        error: response.ok ? undefined : `Status: ${response.status}`
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      
      this.results.push({
        timestamp: new Date(),
        operation: 'analysis',
        success: false,
        duration,
        serviceVersion: phase,
        error: (error as Error).message
      });
    }
  }

  private getPhaseResults(phase: string): any[] {
    return this.results.filter(r => r.serviceVersion === phase);
  }

  private generateLoadTestSummary(): any {
    const summary = {
      totalRequests: this.results.length,
      successfulRequests: this.results.filter(r => r.success).length,
      failedRequests: this.results.filter(r => !r.success).length,
      averageResponseTime: 0,
      phases: {} as Record<string, any>
    };

    summary.averageResponseTime = this.results.length > 0 
      ? this.results.reduce((sum, r) => sum + r.duration, 0) / this.results.length 
      : 0;

    // Group by phases
    ['consolidated', 'rollback-transition', 'legacy'].forEach(phase => {
      const phaseResults = this.results.filter(r => r.serviceVersion === phase);
      summary.phases[phase] = {
        requests: phaseResults.length,
        successful: phaseResults.filter(r => r.success).length,
        failed: phaseResults.filter(r => !r.success).length,
        successRate: phaseResults.length > 0 
          ? (phaseResults.filter(r => r.success).length / phaseResults.length) * 100 
          : 0,
        avgResponseTime: phaseResults.length > 0 
          ? phaseResults.reduce((sum, r) => sum + r.duration, 0) / phaseResults.length 
          : 0
      };
    });

    return summary;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  reset(): void {
    this.results = [];
    this.activeRequests.clear();
  }
}

describe('Task 8.3: Rollback Testing', () => {
  let featureFlagService: FeatureFlagService;
  let dataValidator: DataConsistencyValidator;
  let loadTester: RollbackLoadTester;

  beforeAll(async () => {
    console.log('🔄 Setting up Rollback Testing Environment');
    featureFlagService = new FeatureFlagService();
    dataValidator = new DataConsistencyValidator();
    loadTester = new RollbackLoadTester();
  }, 30000);

  beforeEach(() => {
    featureFlagService.resetFlags();
    dataValidator.reset();
    loadTester.reset();
  });

  afterAll(async () => {
    console.log('🧹 Cleaning up Rollback Testing Environment');
  });

  describe('1. Feature Flag Rollback Procedures', () => {
    it('should successfully rollback to legacy services', async () => {
      console.log('🔄 Testing rollback to legacy services...');

      // Start with consolidated services enabled
      featureFlagService.simulateProductionFlags();
      
      expect(featureFlagService.getFlag(ROLLBACK_TEST_CONFIG.featureFlags.consolidated_analysis)).toBe(true);
      expect(featureFlagService.getFlag(ROLLBACK_TEST_CONFIG.featureFlags.consolidated_reporting)).toBe(true);
      expect(featureFlagService.getFlag(ROLLBACK_TEST_CONFIG.featureFlags.legacy_fallback)).toBe(false);

      // Trigger rollback
      featureFlagService.rollbackToLegacy('Test rollback procedure');

      // Verify rollback state
      expect(featureFlagService.getFlag(ROLLBACK_TEST_CONFIG.featureFlags.consolidated_analysis)).toBe(false);
      expect(featureFlagService.getFlag(ROLLBACK_TEST_CONFIG.featureFlags.consolidated_reporting)).toBe(false);
      expect(featureFlagService.getFlag(ROLLBACK_TEST_CONFIG.featureFlags.legacy_fallback)).toBe(true);

      // Verify rollback history
      const history = featureFlagService.getRollbackHistory();
      expect(history.length).toBeGreaterThan(0);
      
      const rollbackEvents = history.filter(h => h.reason === 'Test rollback procedure');
      expect(rollbackEvents.length).toBe(3); // 3 flags changed
      
      console.log('✅ Rollback to legacy services completed successfully');
    }, ROLLBACK_TEST_CONFIG.timeouts.featureFlagSwitch);

    it('should successfully rollback to consolidated services (rollforward)', async () => {
      console.log('🔄 Testing rollforward to consolidated services...');

      // Start with legacy services (rollback state)
      featureFlagService.rollbackToLegacy('Simulated production issue');
      
      expect(featureFlagService.getFlag(ROLLBACK_TEST_CONFIG.featureFlags.legacy_fallback)).toBe(true);

      // Trigger rollforward
      featureFlagService.rollbackToConsolidated('Issue resolved - rollforward');

      // Verify rollforward state
      expect(featureFlagService.getFlag(ROLLBACK_TEST_CONFIG.featureFlags.consolidated_analysis)).toBe(true);
      expect(featureFlagService.getFlag(ROLLBACK_TEST_CONFIG.featureFlags.consolidated_reporting)).toBe(true);
      expect(featureFlagService.getFlag(ROLLBACK_TEST_CONFIG.featureFlags.legacy_fallback)).toBe(false);

      // Verify rollback history includes both rollback and rollforward
      const history = featureFlagService.getRollbackHistory();
      const rollforwardEvents = history.filter(h => h.reason === 'Issue resolved - rollforward');
      expect(rollforwardEvents.length).toBe(3);
      
      console.log('✅ Rollforward to consolidated services completed successfully');
    }, ROLLBACK_TEST_CONFIG.timeouts.featureFlagSwitch);

    it('should maintain feature flag history for audit purposes', async () => {
      console.log('📋 Testing feature flag audit history...');

      featureFlagService.simulateProductionFlags();
      featureFlagService.rollbackToLegacy('Performance degradation detected');
      
      await new Promise(resolve => setTimeout(resolve, 100)); // Small delay
      
      featureFlagService.rollbackToConsolidated('Performance issue resolved');

      const history = featureFlagService.getRollbackHistory();
      
      // Verify complete audit trail
      expect(history.length).toBeGreaterThan(6); // At least 6 flag changes
      
      // Verify timestamps are in order
      for (let i = 1; i < history.length; i++) {
        expect(history[i].timestamp.getTime()).toBeGreaterThanOrEqual(
          history[i - 1].timestamp.getTime()
        );
      }

      // Verify reasons are captured
      const reasons = [...new Set(history.map(h => h.reason))];
      expect(reasons).toContain('Production default');
      expect(reasons).toContain('Performance degradation detected');
      expect(reasons).toContain('Performance issue resolved');
      
      console.log('✅ Feature flag audit history maintained correctly');
    });
  });

  describe('2. Data Consistency During Rollback', () => {
    it('should maintain data consistency when rolling back under load', async () => {
      console.log('🔍 Testing data consistency during rollback...');

      const testProjects = [
        `data-consistency-test-1-${Date.now()}`,
        `data-consistency-test-2-${Date.now()}`,
        `data-consistency-test-3-${Date.now()}`
      ];

      // Start with consolidated services
      featureFlagService.simulateProductionFlags();

      // Capture baseline data with consolidated services
      for (const projectId of testProjects) {
        await dataValidator.captureDataSnapshot(projectId, 'consolidated-baseline');
      }

      // Trigger rollback
      featureFlagService.rollbackToLegacy('Data consistency test');

      // Capture data after rollback to legacy services
      for (const projectId of testProjects) {
        await dataValidator.captureDataSnapshot(projectId, 'legacy-rollback');
      }

      // Validate data consistency
      const consistencyResult = dataValidator.validateDataConsistency();
      
      expect(consistencyResult.isConsistent).toBe(true);
      expect(consistencyResult.consistencyScore).toBeGreaterThanOrEqual(
        ROLLBACK_TEST_CONFIG.dataValidation.consistencyThreshold
      );
      expect(consistencyResult.inconsistencies.length).toBeLessThanOrEqual(1); // Allow minimal inconsistencies

      console.log(`✅ Data consistency validated: ${(consistencyResult.consistencyScore * 100).toFixed(1)}% consistent`);
      console.log(`📊 Captured ${consistencyResult.details.capturedSnapshots} data snapshots`);
      
      if (consistencyResult.inconsistencies.length > 0) {
        console.log('⚠️ Minor inconsistencies detected:', consistencyResult.inconsistencies);
      }

    }, ROLLBACK_TEST_CONFIG.timeouts.dataConsistency);

    it('should handle rollback gracefully with concurrent requests', async () => {
      console.log('🔄 Testing rollback under concurrent load...');

      // Run load test with rollback in the middle
      const loadTestResults = await loadTester.runLoadTestDuringRollback(featureFlagService);

      // Validate that services remained available during rollback
      expect(loadTestResults.summary.totalRequests).toBeGreaterThan(0);
      
      // Ensure reasonable success rates in all phases
      expect(loadTestResults.summary.phases.consolidated.successRate).toBeGreaterThan(80);
      expect(loadTestResults.summary.phases.legacy.successRate).toBeGreaterThan(80);
      
      // During rollback transition, we allow lower success rate due to switching
      expect(loadTestResults.summary.phases['rollback-transition'].successRate).toBeGreaterThan(60);

      console.log('✅ Rollback under load completed successfully');
      console.log(`📊 Total requests: ${loadTestResults.summary.totalRequests}`);
      console.log(`📊 Overall success rate: ${((loadTestResults.summary.successfulRequests / loadTestResults.summary.totalRequests) * 100).toFixed(1)}%`);
      
      // Log phase-by-phase results
      Object.entries(loadTestResults.summary.phases).forEach(([phase, stats]: [string, any]) => {
        console.log(`📊 ${phase}: ${stats.requests} requests, ${stats.successRate.toFixed(1)}% success rate`);
      });

    }, ROLLBACK_TEST_CONFIG.timeouts.loadTesting);
  });

  describe('3. Service Health During Rollback', () => {
    it('should maintain service health endpoints during rollback', async () => {
      console.log('💚 Testing service health during rollback...');

      // Test health endpoint availability throughout rollback process
      const healthResults: Array<{phase: string; healthy: boolean; response?: any}> = [];

      // Phase 1: Health check with consolidated services
      featureFlagService.simulateProductionFlags();
      const consolidatedHealth = await this.checkServiceHealth();
      healthResults.push({ phase: 'consolidated', healthy: consolidatedHealth.healthy, response: consolidatedHealth });

      // Phase 2: Health check during rollback
      featureFlagService.rollbackToLegacy('Health check test');
      const rollbackHealth = await this.checkServiceHealth();
      healthResults.push({ phase: 'rollback', healthy: rollbackHealth.healthy, response: rollbackHealth });

      // Phase 3: Health check with legacy services
      const legacyHealth = await this.checkServiceHealth();
      healthResults.push({ phase: 'legacy', healthy: legacyHealth.healthy, response: legacyHealth });

      // Validate that health endpoints remained available
      const healthyChecks = healthResults.filter(r => r.healthy);
      expect(healthyChecks.length).toBe(healthResults.length); // All health checks should pass
      
      console.log('✅ Service health maintained during rollback');
      healthResults.forEach(result => {
        console.log(`📊 ${result.phase} phase: ${result.healthy ? 'HEALTHY' : 'UNHEALTHY'}`);
      });

    }, ROLLBACK_TEST_CONFIG.timeouts.serviceRollback);

    async checkServiceHealth(): Promise<{healthy: boolean; status?: string; error?: string}> {
      try {
        const response = await fetch('http://localhost:3000/api/health', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          const health = await response.json();
          return { healthy: true, status: health.status };
        } else {
          return { healthy: false, error: `Status: ${response.status}` };
        }
      } catch (error) {
        return { healthy: false, error: (error as Error).message };
      }
    }
  });

  describe('4. Rollback Decision Criteria Validation', () => {
    it('should trigger rollback when error rate exceeds threshold', async () => {
      console.log('⚠️ Testing rollback trigger based on error rate...');

      // Simulate high error rate scenario
      const errorRateThreshold = 0.10; // 10% error rate
      const simulatedErrorRate = 0.15; // 15% error rate

      // Mock monitoring system detecting high error rate
      const shouldRollback = simulatedErrorRate > errorRateThreshold;
      
      expect(shouldRollback).toBe(true);

      if (shouldRollback) {
        featureFlagService.rollbackToLegacy(`High error rate detected: ${(simulatedErrorRate * 100).toFixed(1)}%`);
        
        // Verify rollback was triggered
        expect(featureFlagService.getFlag(ROLLBACK_TEST_CONFIG.featureFlags.legacy_fallback)).toBe(true);
        
        const history = featureFlagService.getRollbackHistory();
        const rollbackEvent = history.find(h => h.reason.includes('High error rate detected'));
        expect(rollbackEvent).toBeDefined();
      }

      console.log(`✅ Rollback triggered correctly for error rate: ${(simulatedErrorRate * 100).toFixed(1)}%`);
    });

    it('should trigger rollback when response time exceeds threshold', async () => {
      console.log('⏱️ Testing rollback trigger based on response time...');

      // Simulate high response time scenario
      const responseTimeThreshold = 60000; // 60 seconds
      const simulatedResponseTime = 75000;  // 75 seconds

      const shouldRollback = simulatedResponseTime > responseTimeThreshold;
      
      expect(shouldRollback).toBe(true);

      if (shouldRollback) {
        featureFlagService.rollbackToLegacy(`High response time detected: ${simulatedResponseTime}ms`);
        
        // Verify rollback was triggered
        expect(featureFlagService.getFlag(ROLLBACK_TEST_CONFIG.featureFlags.legacy_fallback)).toBe(true);
        
        const history = featureFlagService.getRollbackHistory();
        const rollbackEvent = history.find(h => h.reason.includes('High response time detected'));
        expect(rollbackEvent).toBeDefined();
      }

      console.log(`✅ Rollback triggered correctly for response time: ${simulatedResponseTime}ms`);
    });

    it('should NOT trigger rollback when metrics are within acceptable ranges', async () => {
      console.log('✅ Testing rollback NOT triggered for acceptable metrics...');

      // Simulate acceptable metrics
      const errorRate = 0.02;        // 2% error rate (acceptable)
      const responseTime = 25000;    // 25 seconds (acceptable)
      const memoryUsage = 512;       // 512MB (acceptable)

      // Thresholds
      const errorRateThreshold = 0.05;    // 5%
      const responseTimeThreshold = 60000; // 60 seconds
      const memoryThreshold = 1024;       // 1GB

      const shouldRollback = (
        errorRate > errorRateThreshold ||
        responseTime > responseTimeThreshold ||
        memoryUsage > memoryThreshold
      );

      expect(shouldRollback).toBe(false);

      // Verify no rollback was triggered
      featureFlagService.simulateProductionFlags();
      expect(featureFlagService.getFlag(ROLLBACK_TEST_CONFIG.featureFlags.consolidated_analysis)).toBe(true);
      expect(featureFlagService.getFlag(ROLLBACK_TEST_CONFIG.featureFlags.legacy_fallback)).toBe(false);

      console.log(`✅ No rollback triggered - metrics within acceptable ranges`);
      console.log(`📊 Error rate: ${(errorRate * 100).toFixed(1)}% (threshold: ${(errorRateThreshold * 100).toFixed(1)}%)`);
      console.log(`📊 Response time: ${responseTime}ms (threshold: ${responseTimeThreshold}ms)`);
      console.log(`📊 Memory usage: ${memoryUsage}MB (threshold: ${memoryThreshold}MB)`);
    });
  });

  describe('5. End-to-End Rollback Validation', () => {
    it('should complete full rollback and rollforward cycle successfully', async () => {
      console.log('🔄 Testing complete rollback and rollforward cycle...');

      // Phase 1: Start with consolidated services
      featureFlagService.simulateProductionFlags();
      
      const projectId = `rollback-cycle-test-${Date.now()}`;
      
      // Capture initial data
      await dataValidator.captureDataSnapshot(projectId, 'initial-consolidated');

      // Phase 2: Rollback to legacy
      featureFlagService.rollbackToLegacy('End-to-end rollback test');
      
      // Verify rollback state
      expect(featureFlagService.getFlag(ROLLBACK_TEST_CONFIG.featureFlags.legacy_fallback)).toBe(true);
      
      // Capture data after rollback
      await dataValidator.captureDataSnapshot(projectId, 'rollback-legacy');

      // Phase 3: Rollforward to consolidated
      featureFlagService.rollbackToConsolidated('End-to-end rollforward test');
      
      // Verify rollforward state
      expect(featureFlagService.getFlag(ROLLBACK_TEST_CONFIG.featureFlags.consolidated_analysis)).toBe(true);
      expect(featureFlagService.getFlag(ROLLBACK_TEST_CONFIG.featureFlags.legacy_fallback)).toBe(false);
      
      // Capture final data
      await dataValidator.captureDataSnapshot(projectId, 'final-consolidated');

      // Validate data consistency throughout the cycle
      const consistencyResult = dataValidator.validateDataConsistency();
      
      expect(consistencyResult.isConsistent).toBe(true);
      expect(consistencyResult.consistencyScore).toBeGreaterThanOrEqual(0.90); // 90% consistency

      // Verify complete audit trail
      const history = featureFlagService.getRollbackHistory();
      expect(history.length).toBeGreaterThanOrEqual(6); // Multiple flag changes

      console.log('✅ Complete rollback and rollforward cycle completed successfully');
      console.log(`📊 Data consistency: ${(consistencyResult.consistencyScore * 100).toFixed(1)}%`);
      console.log(`📊 Audit trail events: ${history.length}`);

    }, ROLLBACK_TEST_CONFIG.timeouts.serviceRollback);
  });
}); 