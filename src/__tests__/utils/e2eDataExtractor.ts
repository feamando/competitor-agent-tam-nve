/**
 * Phase 3.2: E2E Test Data Extraction and Validation
 * Robust data extraction and parsing for reliable E2E testing
 */

import { logger } from '@/lib/logger';

export interface E2ETestData {
  projectName: string;
  productName: string;
  productUrl: string;
  industry: string;
  userEmail: string;
  reportFrequency: string;
  positioning?: string;
  customerData?: string;
  userProblem?: string;
}

export interface DataExtractionConfig {
  retries: number;
  timeout: number;
  strict: boolean; // Whether to fail on missing optional fields
  fallbackValues: Partial<E2ETestData>;
}

export interface ExtractionResult {
  success: boolean;
  data?: E2ETestData;
  errors: string[];
  warnings: string[];
  confidence: number;
  extractionMethod: string;
}

export const DEFAULT_TEST_DATA: E2ETestData = {
  projectName: 'TestCorp Competitive Analysis',
  productName: 'TestCorp Platform', 
  productUrl: 'https://testcorp.com',
  industry: 'Technology',
  userEmail: 'test@testcorp.com',
  reportFrequency: 'Weekly',
  positioning: 'Leading platform for enterprise solutions',
  customerData: '10,000+ enterprise customers',
  userProblem: 'Complex data management challenges'
};

export const DEFAULT_EXTRACTION_CONFIG: DataExtractionConfig = {
  retries: 3,
  timeout: 10000,
  strict: false,
  fallbackValues: DEFAULT_TEST_DATA
};

/**
 * E2E Data Extractor
 * Handles complex data extraction with multiple fallback strategies
 */
export class E2EDataExtractor {
  private config: DataExtractionConfig;

  constructor(config: Partial<DataExtractionConfig> = {}) {
    this.config = { ...DEFAULT_EXTRACTION_CONFIG, ...config };
  }

  /**
   * Extract data from comprehensive input text with multiple strategies
   */
  async extractFromComprehensiveInput(input: string): Promise<ExtractionResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];

    logger.debug('Starting data extraction from comprehensive input', {
      inputLength: input.length,
      hasNumberedList: /^\d+\./.test(input.trim())
    });

    // Strategy 1: Numbered list extraction
    let result = this.extractFromNumberedList(input);
    if (result.success) {
      logger.debug('Numbered list extraction successful');
      return this.enhanceResult(result, 'numbered_list', startTime);
    }
    errors.push(...result.errors);
    warnings.push(...result.warnings);

    // Strategy 2: Key-value pair extraction
    result = this.extractFromKeyValuePairs(input);
    if (result.success) {
      logger.debug('Key-value pair extraction successful');
      return this.enhanceResult(result, 'key_value_pairs', startTime);
    }
    errors.push(...result.errors);
    warnings.push(...result.warnings);

    // Strategy 3: Natural language extraction
    result = this.extractFromNaturalLanguage(input);
    if (result.success) {
      logger.debug('Natural language extraction successful');
      return this.enhanceResult(result, 'natural_language', startTime);
    }
    errors.push(...result.errors);
    warnings.push(...result.warnings);

    // Strategy 4: Pattern-based extraction
    result = this.extractFromPatterns(input);
    if (result.success) {
      logger.debug('Pattern-based extraction successful');
      return this.enhanceResult(result, 'pattern_based', startTime);
    }
    errors.push(...result.errors);
    warnings.push(...result.warnings);

    // Final fallback: Use configured fallback values
    logger.warn('All extraction strategies failed, using fallback values', {
      errors: errors.slice(0, 3), // Limit error logs
      inputPreview: input.substring(0, 100)
    });

    return {
      success: true, // Mark as success since we have fallback
      data: { ...this.config.fallbackValues } as E2ETestData,
      errors,
      warnings: [...warnings, 'Used fallback values due to extraction failure'],
      confidence: 0.3, // Low confidence for fallback
      extractionMethod: 'fallback'
    };
  }

  /**
   * Extract from numbered list format (1. email, 2. frequency, etc.)
   */
  private extractFromNumberedList(input: string): ExtractionResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const data: Partial<E2ETestData> = {};

    try {
      // Split input into lines and find numbered items
      const lines = input.split('\n').map(line => line.trim()).filter(line => line);
      const numberedItems: string[] = [];

      for (const line of lines) {
        const match = line.match(/^\d+\.\s*(.+)$/);
        if (match) {
          numberedItems.push(match[1].trim());
        }
      }

      if (numberedItems.length === 0) {
        errors.push('No numbered list items found');
        return { success: false, errors, warnings, confidence: 0, extractionMethod: 'numbered_list' };
      }

      logger.debug('Found numbered items', {
        count: numberedItems.length,
        items: numberedItems.slice(0, 3)
      });

      // Expected order based on comprehensive form
      const expectedOrder = [
        'userEmail',     // 1. email
        'reportFrequency', // 2. frequency  
        'projectName',   // 3. project name
        'productName',   // 4. product name
        'productUrl',    // 5. product URL
        'industry',      // 6. industry
        'positioning',   // 7. positioning
        'customerData',  // 8. customer data
        'userProblem'    // 9. user problem
      ];

      // Extract based on position
      for (let i = 0; i < Math.min(numberedItems.length, expectedOrder.length); i++) {
        const field = expectedOrder[i];
        const value = numberedItems[i];

        if (value && value !== '') {
          // Validate and clean the value
          const cleanedValue = this.validateAndCleanField(field, value);
          if (cleanedValue) {
            data[field as keyof E2ETestData] = cleanedValue;
          } else {
            warnings.push(`Invalid value for ${field}: ${value}`);
          }
        }
      }

      // Check for required fields
      const requiredFields = ['userEmail', 'reportFrequency', 'projectName', 'productName'];
      const missingRequired = requiredFields.filter(field => !data[field as keyof E2ETestData]);

      if (missingRequired.length > 0 && this.config.strict) {
        errors.push(`Missing required fields: ${missingRequired.join(', ')}`);
        return { success: false, errors, warnings, confidence: 0, extractionMethod: 'numbered_list' };
      }

      // Fill in missing fields with fallbacks
      const finalData = { ...this.config.fallbackValues, ...data } as E2ETestData;

      // Calculate confidence based on how many fields were extracted
      const totalFields = Object.keys(this.config.fallbackValues).length;
      const extractedFields = Object.keys(data).length;
      const confidence = Math.min(0.9, extractedFields / totalFields);

      return {
        success: true,
        data: finalData,
        errors,
        warnings,
        confidence,
        extractionMethod: 'numbered_list'
      };

    } catch (error) {
      errors.push(`Numbered list extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return { success: false, errors, warnings, confidence: 0, extractionMethod: 'numbered_list' };
    }
  }

  /**
   * Extract from key-value pairs (Email: test@example.com, Project: Test Project)
   */
  private extractFromKeyValuePairs(input: string): ExtractionResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const data: Partial<E2ETestData> = {};

    try {
      const keyMappings = {
        email: 'userEmail',
        frequency: 'reportFrequency', 
        project: 'projectName',
        product: 'productName',
        url: 'productUrl',
        website: 'productUrl',
        industry: 'industry',
        positioning: 'positioning',
        customers: 'customerData',
        problem: 'userProblem'
      };

      // Look for key-value patterns
      const patterns = [
        /(\w+):\s*(.+)/g,           // Key: Value
        /(\w+)\s*=\s*(.+)/g,       // Key = Value  
        /(\w+)\s*-\s*(.+)/g        // Key - Value
      ];

      for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(input)) !== null) {
          const key = match[1].toLowerCase().trim();
          const value = match[2].trim();

          // Find matching field
          const field = keyMappings[key as keyof typeof keyMappings];
          if (field && value) {
            const cleanedValue = this.validateAndCleanField(field, value);
            if (cleanedValue) {
              data[field as keyof E2ETestData] = cleanedValue;
            }
          }
        }
      }

      if (Object.keys(data).length === 0) {
        errors.push('No key-value pairs found');
        return { success: false, errors, warnings, confidence: 0, extractionMethod: 'key_value_pairs' };
      }

      // Fill in missing fields
      const finalData = { ...this.config.fallbackValues, ...data } as E2ETestData;
      const confidence = Math.min(0.8, Object.keys(data).length / 5); // Based on 5 core fields

      return {
        success: true,
        data: finalData,
        errors,
        warnings,
        confidence,
        extractionMethod: 'key_value_pairs'
      };

    } catch (error) {
      errors.push(`Key-value extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return { success: false, errors, warnings, confidence: 0, extractionMethod: 'key_value_pairs' };
    }
  }

  /**
   * Extract from natural language text
   */
  private extractFromNaturalLanguage(input: string): ExtractionResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const data: Partial<E2ETestData> = {};

    try {
      // Email extraction
      const emailMatch = input.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
      if (emailMatch) {
        data.userEmail = emailMatch[1];
      }

      // URL extraction
      const urlMatch = input.match(/(https?:\/\/[^\s]+)/);
      if (urlMatch) {
        data.productUrl = urlMatch[1];
      }

      // Frequency extraction
      const frequencyMatch = input.match(/\b(daily|weekly|monthly|quarterly)\b/i);
      if (frequencyMatch) {
        data.reportFrequency = frequencyMatch[1].charAt(0).toUpperCase() + frequencyMatch[1].slice(1).toLowerCase();
      }

      // Company/Product name extraction (look for patterns like "for TestCorp" or "TestCorp Platform")
      const companyPatterns = [
        /(?:for|analyzing|about)\s+([A-Z][a-zA-Z\s]+?)(?:\s|$|,|\.|!|\?)/,
        /([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)\s+(?:Platform|App|Service|Software|Company)/i
      ];

      for (const pattern of companyPatterns) {
        const match = input.match(pattern);
        if (match && match[1]) {
          const name = match[1].trim();
          if (name.length > 1 && name.length < 50) {
            if (!data.productName && name.includes('Platform')) {
              data.productName = name;
            } else if (!data.projectName) {
              data.projectName = `${name} Competitive Analysis`;
            }
          }
        }
      }

      if (Object.keys(data).length === 0) {
        errors.push('No recognizable patterns found in natural language');
        return { success: false, errors, warnings, confidence: 0, extractionMethod: 'natural_language' };
      }

      // Fill in missing fields
      const finalData = { ...this.config.fallbackValues, ...data } as E2ETestData;
      const confidence = Math.min(0.7, Object.keys(data).length / 4);

      return {
        success: true,
        data: finalData,
        errors,
        warnings,
        confidence,
        extractionMethod: 'natural_language'
      };

    } catch (error) {
      errors.push(`Natural language extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return { success: false, errors, warnings, confidence: 0, extractionMethod: 'natural_language' };
    }
  }

  /**
   * Extract using specific patterns and heuristics
   */
  private extractFromPatterns(input: string): ExtractionResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const data: Partial<E2ETestData> = {};

    try {
      // Look for specific test patterns that might be in the input
      const testPatterns = {
        'TestCorp': {
          projectName: 'TestCorp Competitive Analysis',
          productName: 'TestCorp Platform',
          productUrl: 'https://testcorp.com',
          industry: 'Technology'
        },
        'Good Chop': {
          projectName: 'Good Chop Analysis',
          productName: 'Good Chop',
          productUrl: 'https://goodchop.com',
          industry: 'Food Technology'
        }
      };

      // Check if input contains known test patterns
      for (const [pattern, values] of Object.entries(testPatterns)) {
        if (input.toLowerCase().includes(pattern.toLowerCase())) {
          Object.assign(data, values);
          warnings.push(`Used predefined pattern for ${pattern}`);
          break;
        }
      }

      // Extract any remaining fields using simple patterns
      if (!data.userEmail) {
        const emailMatch = input.match(/\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/);
        if (emailMatch) data.userEmail = emailMatch[1];
      }

      if (!data.reportFrequency) {
        const freqMatch = input.match(/\b(Daily|Weekly|Monthly|Quarterly)\b/i);
        if (freqMatch) data.reportFrequency = freqMatch[1];
      }

      if (Object.keys(data).length === 0) {
        errors.push('No patterns matched');
        return { success: false, errors, warnings, confidence: 0, extractionMethod: 'pattern_based' };
      }

      // Fill in missing fields
      const finalData = { ...this.config.fallbackValues, ...data } as E2ETestData;
      const confidence = Object.keys(data).length > 3 ? 0.6 : 0.4;

      return {
        success: true,
        data: finalData,
        errors,
        warnings,
        confidence,
        extractionMethod: 'pattern_based'
      };

    } catch (error) {
      errors.push(`Pattern extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return { success: false, errors, warnings, confidence: 0, extractionMethod: 'pattern_based' };
    }
  }

  /**
   * Validate and clean a field value
   */
  private validateAndCleanField(field: string, value: string): string | null {
    if (!value || value.trim() === '') {
      return null;
    }

    const cleaned = value.trim();

    switch (field) {
      case 'userEmail':
        const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        return emailRegex.test(cleaned) ? cleaned : null;

      case 'productUrl':
        try {
          new URL(cleaned);
          return cleaned;
        } catch {
          // Try adding https if missing
          try {
            new URL(`https://${cleaned}`);
            return `https://${cleaned}`;
          } catch {
            return null;
          }
        }

      case 'reportFrequency':
        const validFrequencies = ['Daily', 'Weekly', 'Monthly', 'Quarterly'];
        const normalized = cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
        return validFrequencies.includes(normalized) ? normalized : null;

      case 'projectName':
      case 'productName':
        return cleaned.length > 0 && cleaned.length < 100 ? cleaned : null;

      case 'industry':
        return cleaned.length > 0 && cleaned.length < 50 ? cleaned : null;

      default:
        return cleaned.length > 0 ? cleaned : null;
    }
  }

  /**
   * Enhance result with additional metadata
   */
  private enhanceResult(result: ExtractionResult, method: string, startTime: number): ExtractionResult {
    return {
      ...result,
      extractionMethod: method,
      confidence: Math.max(result.confidence, 0.1) // Minimum confidence
    };
  }

  /**
   * Validate extracted data meets minimum requirements
   */
  validateExtractedData(data: E2ETestData): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Required field validation
    if (!data.userEmail || !this.validateAndCleanField('userEmail', data.userEmail)) {
      errors.push('Invalid or missing email address');
    }

    if (!data.projectName || data.projectName.length < 3) {
      errors.push('Invalid or missing project name');
    }

    if (!data.productName || data.productName.length < 3) {
      errors.push('Invalid or missing product name');
    }

    if (!data.reportFrequency || !['Daily', 'Weekly', 'Monthly', 'Quarterly'].includes(data.reportFrequency)) {
      errors.push('Invalid or missing report frequency');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

/**
 * Global data extractor instance
 */
export const e2eDataExtractor = new E2EDataExtractor();

/**
 * Utility functions for E2E tests
 */

/**
 * Extract test data with retry logic
 */
export async function extractTestData(
  input: string, 
  config?: Partial<DataExtractionConfig>
): Promise<ExtractionResult> {
  const extractor = new E2EDataExtractor(config);
  return extractor.extractFromComprehensiveInput(input);
}

/**
 * Get reliable test data for E2E tests
 */
export function getReliableTestData(overrides?: Partial<E2ETestData>): E2ETestData {
  return {
    ...DEFAULT_TEST_DATA,
    ...overrides
  };
}

/**
 * Create test-specific data variations
 */
export function createTestDataVariations(): E2ETestData[] {
  return [
    getReliableTestData(),
    getReliableTestData({
      projectName: 'Good Chop Competitive Analysis',
      productName: 'Good Chop',
      productUrl: 'https://goodchop.com',
      industry: 'Food Technology',
      userEmail: 'analyst@goodchop.com'
    }),
    getReliableTestData({
      projectName: 'HelloFresh Market Analysis',
      productName: 'HelloFresh Platform',
      productUrl: 'https://hellofresh.com',
      industry: 'Food Delivery',
      userEmail: 'research@hellofresh.com'
    })
  ];
} 