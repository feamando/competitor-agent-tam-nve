/**
 * Phase 3.2: E2E Test Data Management
 * Comprehensive test data management and validation for reliable E2E testing
 */

import { logger } from '@/lib/logger';
import { E2ETestData, getReliableTestData } from './e2eDataExtractor';

export interface TestScenario {
  id: string;
  name: string;
  description: string;
  data: E2ETestData;
  expectedOutcomes: {
    projectCreated: boolean;
    reportGenerated: boolean;
    analysisCompleted: boolean;
    minimumDuration?: number; // in seconds
  };
  validationRules: ValidationRule[];
  tags: string[];
}

export interface ValidationRule {
  field: keyof E2ETestData;
  validator: (value: any) => boolean;
  errorMessage: string;
  severity: 'error' | 'warning';
}

export interface TestDataSnapshot {
  timestamp: Date;
  scenarioId: string;
  data: E2ETestData;
  checksum: string;
  metadata: {
    environment: string;
    browser?: string;
    testSuite: string;
  };
}

export interface DataValidationResult {
  isValid: boolean;
  errors: Array<{ field: string; message: string; severity: 'error' | 'warning' }>;
  warnings: Array<{ field: string; message: string }>;
  score: number; // 0-100 validation score
}

/**
 * E2E Test Data Manager
 * Handles test scenario management, data validation, and state tracking
 */
export class E2ETestDataManager {
  private scenarios: Map<string, TestScenario> = new Map();
  private snapshots: TestDataSnapshot[] = [];
  private activeScenario: string | null = null;

  constructor() {
    this.initializeStandardScenarios();
  }

  /**
   * Initialize standard test scenarios
   */
  private initializeStandardScenarios(): void {
    // Scenario 1: Basic TestCorp scenario (most reliable)
    this.addScenario({
      id: 'testcorp-basic',
      name: 'TestCorp Basic Analysis',
      description: 'Standard TestCorp competitive analysis scenario',
      data: getReliableTestData(),
      expectedOutcomes: {
        projectCreated: true,
        reportGenerated: true,
        analysisCompleted: true,
        minimumDuration: 30
      },
      validationRules: [
        {
          field: 'projectName',
          validator: (value) => value === 'TestCorp Competitive Analysis',
          errorMessage: 'Project name must be exactly "TestCorp Competitive Analysis"',
          severity: 'error'
        },
        {
          field: 'productName',
          validator: (value) => value === 'TestCorp Platform',
          errorMessage: 'Product name must be exactly "TestCorp Platform"',
          severity: 'error'
        },
        {
          field: 'userEmail',
          validator: (value) => value === 'test@testcorp.com',
          errorMessage: 'Email must be test@testcorp.com for TestCorp scenario',
          severity: 'error'
        }
      ],
      tags: ['reliable', 'standard', 'testcorp']
    });

    // Scenario 2: Good Chop scenario
    this.addScenario({
      id: 'goodchop-analysis',
      name: 'Good Chop Market Analysis',
      description: 'Good Chop competitive analysis in food technology sector',
      data: getReliableTestData({
        projectName: 'Good Chop Competitive Analysis',
        productName: 'Good Chop',
        productUrl: 'https://goodchop.com',
        industry: 'Food Technology',
        userEmail: 'analyst@goodchop.com',
        positioning: 'Premium meat delivery service',
        customerData: '50,000+ subscribers nationwide',
        userProblem: 'Finding high-quality meat products consistently'
      }),
      expectedOutcomes: {
        projectCreated: true,
        reportGenerated: true,
        analysisCompleted: true,
        minimumDuration: 45
      },
      validationRules: [
        {
          field: 'industry',
          validator: (value) => value === 'Food Technology',
          errorMessage: 'Industry must be Food Technology for Good Chop',
          severity: 'error'
        },
        {
          field: 'productUrl',
          validator: (value) => value.includes('goodchop.com'),
          errorMessage: 'Product URL must contain goodchop.com',
          severity: 'error'
        }
      ],
      tags: ['goodchop', 'food-tech', 'premium']
    });

    // Scenario 3: Edge case scenario (minimal data)
    this.addScenario({
      id: 'minimal-data',
      name: 'Minimal Data Test',
      description: 'Test with minimal required data to verify fallback handling',
      data: {
        projectName: 'Minimal Test Analysis',
        productName: 'Test Product',
        productUrl: 'https://example.com',
        industry: 'Technology',
        userEmail: 'test@example.com',
        reportFrequency: 'Weekly',
        positioning: 'Basic test product',
        customerData: 'Limited data available',
        userProblem: 'Testing data extraction'
      },
      expectedOutcomes: {
        projectCreated: true,
        reportGenerated: true,
        analysisCompleted: false, // May fail due to limited data
        minimumDuration: 20
      },
      validationRules: [
        {
          field: 'projectName',
          validator: (value) => value.length > 5,
          errorMessage: 'Project name too short',
          severity: 'warning'
        }
      ],
      tags: ['edge-case', 'minimal', 'fallback-test']
    });

    // Scenario 4: Comprehensive data scenario
    this.addScenario({
      id: 'comprehensive-data',
      name: 'Comprehensive Analysis Test',
      description: 'Full comprehensive flow with rich data',
      data: getReliableTestData({
        projectName: 'Comprehensive Market Analysis Project',
        productName: 'Enterprise Platform Suite',
        productUrl: 'https://enterprise-platform.com',
        industry: 'Enterprise Software',
        userEmail: 'analyst@enterprise.com',
        reportFrequency: 'Monthly',
        positioning: 'Leading enterprise software platform with AI capabilities and advanced analytics',
        customerData: 'Fortune 500 companies, 1M+ users globally, $100M+ ARR',
        userProblem: 'Complex enterprise data management, integration challenges, scalability issues'
      }),
      expectedOutcomes: {
        projectCreated: true,
        reportGenerated: true,
        analysisCompleted: true,
        minimumDuration: 60
      },
      validationRules: [
        {
          field: 'positioning',
          validator: (value) => value.length > 50,
          errorMessage: 'Positioning should be detailed for comprehensive scenario',
          severity: 'warning'
        }
      ],
      tags: ['comprehensive', 'enterprise', 'detailed']
    });

    logger.info('Initialized standard E2E test scenarios', {
      scenarioCount: this.scenarios.size,
      scenarios: Array.from(this.scenarios.keys())
    });
  }

  /**
   * Add a new test scenario
   */
  addScenario(scenario: TestScenario): void {
    this.scenarios.set(scenario.id, scenario);
    
    logger.debug('Added test scenario', {
      id: scenario.id,
      name: scenario.name,
      tags: scenario.tags
    });
  }

  /**
   * Get test scenario by ID
   */
  getScenario(scenarioId: string): TestScenario | null {
    return this.scenarios.get(scenarioId) || null;
  }

  /**
   * Get scenarios by tags
   */
  getScenariosByTags(tags: string[]): TestScenario[] {
    return Array.from(this.scenarios.values()).filter(scenario =>
      tags.some(tag => scenario.tags.includes(tag))
    );
  }

  /**
   * Get most reliable scenario for testing
   */
  getMostReliableScenario(): TestScenario {
    // Return TestCorp basic scenario as most reliable
    const reliable = this.scenarios.get('testcorp-basic');
    if (!reliable) {
      throw new Error('Most reliable scenario not found');
    }
    return reliable;
  }

  /**
   * Validate test data against scenario rules
   */
  validateTestData(data: E2ETestData, scenarioId?: string): DataValidationResult {
    const errors: Array<{ field: string; message: string; severity: 'error' | 'warning' }> = [];
    const warnings: Array<{ field: string; message: string }> = [];
    let score = 100;

    // Get scenario-specific validation rules
    let validationRules: ValidationRule[] = [];
    if (scenarioId) {
      const scenario = this.scenarios.get(scenarioId);
      if (scenario) {
        validationRules = scenario.validationRules;
      }
    }

    // Basic field validation
    const basicValidations = [
      {
        field: 'userEmail' as keyof E2ETestData,
        validator: (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
        errorMessage: 'Invalid email format',
        severity: 'error' as const
      },
      {
        field: 'productUrl' as keyof E2ETestData,
        validator: (value: string) => {
          try { new URL(value); return true; } catch { return false; }
        },
        errorMessage: 'Invalid URL format',
        severity: 'error' as const
      },
      {
        field: 'reportFrequency' as keyof E2ETestData,
        validator: (value: string) => ['Daily', 'Weekly', 'Monthly', 'Quarterly'].includes(value),
        errorMessage: 'Invalid report frequency',
        severity: 'error' as const
      },
      {
        field: 'projectName' as keyof E2ETestData,
        validator: (value: string) => value.length >= 3 && value.length <= 100,
        errorMessage: 'Project name must be 3-100 characters',
        severity: 'error' as const
      },
      {
        field: 'productName' as keyof E2ETestData,
        validator: (value: string) => value.length >= 2 && value.length <= 100,
        errorMessage: 'Product name must be 2-100 characters',
        severity: 'error' as const
      }
    ];

    // Run basic validations
    for (const rule of basicValidations) {
      const value = data[rule.field];
      if (value && !rule.validator(value)) {
        errors.push({
          field: rule.field,
          message: rule.errorMessage,
          severity: rule.severity
        });
        score -= rule.severity === 'error' ? 20 : 10;
      }
    }

    // Run scenario-specific validations
    for (const rule of validationRules) {
      const value = data[rule.field];
      if (value && !rule.validator(value)) {
        if (rule.severity === 'error') {
          errors.push({
            field: rule.field,
            message: rule.errorMessage,
            severity: rule.severity
          });
          score -= 15;
        } else {
          warnings.push({
            field: rule.field,
            message: rule.errorMessage
          });
          score -= 5;
        }
      }
    }

    // Check for required fields
    const requiredFields: (keyof E2ETestData)[] = [
      'userEmail', 'projectName', 'productName', 'reportFrequency'
    ];

    for (const field of requiredFields) {
      if (!data[field] || data[field].toString().trim() === '') {
        errors.push({
          field,
          message: `${field} is required`,
          severity: 'error'
        });
        score -= 25;
      }
    }

    score = Math.max(0, score); // Ensure score doesn't go below 0

    const result: DataValidationResult = {
      isValid: errors.filter(e => e.severity === 'error').length === 0,
      errors,
      warnings,
      score
    };

    logger.debug('Test data validation completed', {
      scenarioId,
      isValid: result.isValid,
      score: result.score,
      errorCount: errors.length,
      warningCount: warnings.length
    });

    return result;
  }

  /**
   * Create data snapshot for tracking
   */
  createSnapshot(scenarioId: string, data: E2ETestData, metadata: TestDataSnapshot['metadata']): TestDataSnapshot {
    const checksum = this.calculateChecksum(data);
    
    const snapshot: TestDataSnapshot = {
      timestamp: new Date(),
      scenarioId,
      data: JSON.parse(JSON.stringify(data)), // Deep copy
      checksum,
      metadata
    };

    this.snapshots.push(snapshot);

    // Keep only last 50 snapshots to prevent memory issues
    if (this.snapshots.length > 50) {
      this.snapshots = this.snapshots.slice(-50);
    }

    logger.debug('Created data snapshot', {
      scenarioId,
      checksum,
      environment: metadata.environment
    });

    return snapshot;
  }

  /**
   * Calculate data checksum for change detection
   */
  private calculateChecksum(data: E2ETestData): string {
    const dataString = JSON.stringify(data, Object.keys(data).sort());
    let hash = 0;
    for (let i = 0; i < dataString.length; i++) {
      const char = dataString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(16);
  }

  /**
   * Get data variations for a scenario
   */
  getDataVariations(scenarioId: string, count: number = 3): E2ETestData[] {
    const scenario = this.scenarios.get(scenarioId);
    if (!scenario) {
      throw new Error(`Scenario ${scenarioId} not found`);
    }

    const variations: E2ETestData[] = [scenario.data]; // Original data

    // Create variations with slight modifications
    if (count > 1) {
      variations.push({
        ...scenario.data,
        userEmail: scenario.data.userEmail.replace('@', '+test@'),
        reportFrequency: scenario.data.reportFrequency === 'Weekly' ? 'Monthly' : 'Weekly'
      });
    }

    if (count > 2) {
      variations.push({
        ...scenario.data,
        projectName: `${scenario.data.projectName} - Variation`,
        positioning: `${scenario.data.positioning} (Enhanced version)`
      });
    }

    return variations.slice(0, count);
  }

  /**
   * Set active scenario for current test session
   */
  setActiveScenario(scenarioId: string): void {
    const scenario = this.scenarios.get(scenarioId);
    if (!scenario) {
      throw new Error(`Scenario ${scenarioId} not found`);
    }

    this.activeScenario = scenarioId;
    
    logger.info('Set active test scenario', {
      scenarioId,
      name: scenario.name,
      tags: scenario.tags
    });
  }

  /**
   * Get active scenario
   */
  getActiveScenario(): TestScenario | null {
    if (!this.activeScenario) {
      return null;
    }
    return this.scenarios.get(this.activeScenario) || null;
  }

  /**
   * Generate test report data
   */
  generateTestReport(): {
    scenarios: number;
    snapshots: number;
    validationSummary: {
      totalValidations: number;
      passedValidations: number;
      averageScore: number;
    };
    recentActivity: Array<{
      scenarioId: string;
      timestamp: Date;
      score: number;
    }>;
  } {
    // Calculate validation summary from recent snapshots
    const recentSnapshots = this.snapshots.slice(-10);
    const validationResults = recentSnapshots.map(snapshot => 
      this.validateTestData(snapshot.data, snapshot.scenarioId)
    );

    const totalValidations = validationResults.length;
    const passedValidations = validationResults.filter(r => r.isValid).length;
    const averageScore = totalValidations > 0 
      ? validationResults.reduce((sum, r) => sum + r.score, 0) / totalValidations 
      : 0;

    const recentActivity = recentSnapshots.map((snapshot, index) => ({
      scenarioId: snapshot.scenarioId,
      timestamp: snapshot.timestamp,
      score: validationResults[index]?.score || 0
    }));

    return {
      scenarios: this.scenarios.size,
      snapshots: this.snapshots.length,
      validationSummary: {
        totalValidations,
        passedValidations,
        averageScore: Math.round(averageScore)
      },
      recentActivity
    };
  }

  /**
   * Reset all test data and scenarios
   */
  reset(): void {
    this.snapshots = [];
    this.activeScenario = null;
    logger.info('Reset test data manager');
  }

  /**
   * Get all available scenarios
   */
  getAllScenarios(): TestScenario[] {
    return Array.from(this.scenarios.values());
  }
}

/**
 * Global test data manager instance
 */
export const e2eTestDataManager = new E2ETestDataManager();

/**
 * Utility functions for test data management
 */

/**
 * Get reliable test data for E2E testing
 */
export function getValidatedTestData(scenarioId?: string): E2ETestData {
  if (scenarioId) {
    const scenario = e2eTestDataManager.getScenario(scenarioId);
    if (scenario) {
      return scenario.data;
    }
  }
  
  // Return most reliable scenario
  return e2eTestDataManager.getMostReliableScenario().data;
}

/**
 * Validate test data before use
 */
export function validateBeforeTest(data: E2ETestData, scenarioId?: string): void {
  const validation = e2eTestDataManager.validateTestData(data, scenarioId);
  
  if (!validation.isValid) {
    const errorMessages = validation.errors
      .filter(e => e.severity === 'error')
      .map(e => `${e.field}: ${e.message}`)
      .join(', ');
    
    throw new Error(`Test data validation failed: ${errorMessages}`);
  }

  if (validation.warnings.length > 0) {
    logger.warn('Test data validation warnings', {
      warnings: validation.warnings.map(w => `${w.field}: ${w.message}`)
    });
  }
}

/**
 * Create test session with scenario
 */
export function createTestSession(scenarioId: string, metadata: Partial<TestDataSnapshot['metadata']> = {}): {
  scenario: TestScenario;
  data: E2ETestData;
  snapshot: TestDataSnapshot;
} {
  const scenario = e2eTestDataManager.getScenario(scenarioId);
  if (!scenario) {
    throw new Error(`Test scenario ${scenarioId} not found`);
  }

  e2eTestDataManager.setActiveScenario(scenarioId);
  
  const fullMetadata: TestDataSnapshot['metadata'] = {
    environment: process.env.NODE_ENV || 'test',
    testSuite: 'e2e',
    ...metadata
  };

  const snapshot = e2eTestDataManager.createSnapshot(
    scenarioId,
    scenario.data,
    fullMetadata
  );

  return {
    scenario,
    data: scenario.data,
    snapshot
  };
} 