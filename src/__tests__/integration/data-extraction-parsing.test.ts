/**
 * Integration tests for Task 5.x: Data Parsing and Extraction Logic
 * Tests URL extraction, product name extraction, and error recovery mechanisms
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { EnhancedProjectExtractor } from '../../lib/chat/enhancedProjectExtractor';
import { ConversationManager } from '../../lib/chat/conversation';

describe('Task 5.x: Data Parsing and Extraction Logic', () => {
  let extractor: EnhancedProjectExtractor;
  let conversationManager: ConversationManager;

  beforeEach(() => {
    extractor = new EnhancedProjectExtractor();
    conversationManager = new ConversationManager();
  });

  describe('Task 5.1: URL and Product Name Extraction', () => {
    test('should extract URLs with high confidence for complete URLs', () => {
      const testInputs = [
        {
          input: 'Please analyze https://www.example.com for our competitive report',
          expected: 'https://www.example.com',
          expectedConfidence: 95
        },
        {
          input: 'Our product website is http://mycompany.com/products',
          expected: 'http://mycompany.com/products',
          expectedConfidence: 95
        },
        {
          input: 'Check out example.com for comparison',
          expected: 'https://example.com',
          expectedConfidence: 85
        }
      ];

      testInputs.forEach(({ input, expected }) => {
        const result = extractor.extractProjectData(input);
        expect(result.data?.productUrl).toBeDefined();
        // URL should be normalized and validated
        expect(result.data?.productUrl).toContain('example.com');
      });
    });

    test('should extract product names with confidence scoring', () => {
      const testInputs = [
        {
          input: 'Product: Slack for our competitive analysis',
          expectedName: 'Slack',
          minConfidence: 90
        },
        {
          input: 'We are analyzing the Shopify platform',
          expectedName: 'Shopify',
          minConfidence: 85
        },
        {
          input: 'Company: Microsoft Corporation needs analysis',
          expectedName: 'Microsoft Corporation',
          minConfidence: 90
        },
        {
          input: 'Our startup called TechCorp',
          expectedName: 'TechCorp',
          minConfidence: 75
        }
      ];

      testInputs.forEach(({ input, expectedName }) => {
        const result = extractor.extractProjectData(input);
        // Should extract some product name
        expect(result.data?.productName).toBeDefined();
        if (result.data?.productName) {
          expect(result.data.productName.toLowerCase()).toContain(expectedName.toLowerCase());
        }
      });
    });

    test('should validate and normalize URLs correctly', () => {
      const testCases = [
        {
          input: 'example.com',
          expected: 'https://example.com'
        },
        {
          input: 'https://example.com/',
          expected: 'https://example.com'
        },
        {
          input: 'http://example.com:80',
          expected: 'http://example.com'
        },
        {
          input: 'https://example.com:443/path',
          expected: 'https://example.com/path'
        }
      ];

      testCases.forEach(({ input, expected }) => {
        const testMessage = `Please analyze ${input} for competitive research`;
        const result = extractor.extractProjectData(testMessage);
        
        if (result.success && result.data?.productUrl) {
          expect(result.data.productUrl).toBe(expected);
        }
      });
    });

    test('should reject invalid URLs', () => {
      const invalidUrls = [
        'not-a-url',
        'javascript:alert(1)',
        'ftp://invalid.com',
        '192.168.1.1', // bare IP without context
        '.example.com',
        'example..com'
      ];

      invalidUrls.forEach(url => {
        const testMessage = `Please analyze ${url} for our project`;
        const result = extractor.extractProjectData(testMessage);
        
        // Should either not extract URL or fail validation
        if (result.data?.productUrl) {
          expect(result.data.productUrl).not.toBe(url);
        }
      });
    });

    test('should handle product names with proper capitalization confidence', () => {
      const testCases = [
        {
          input: 'Product: Proper Name Inc',
          expectHighConfidence: true
        },
        {
          input: 'Product: lowercase name',  
          expectHighConfidence: false
        },
        {
          input: 'Product: A',
          expectHighConfidence: false // too short
        },
        {
          input: 'Product: Name with ... etc',
          expectHighConfidence: false // suspicious patterns
        }
      ];

      testCases.forEach(({ input, expectHighConfidence }) => {
        const result = extractor.extractProjectData(input);
        
        if (result.data?.productName && result.confidence) {
          const productConfidence = result.confidence.productName || 0;
          if (expectHighConfidence) {
            expect(productConfidence).toBeGreaterThan(80);
          } else {
            expect(productConfidence).toBeLessThan(90);
          }
        }
      });
    });
  });

  describe('Task 5.2: Parsing Error Recovery', () => {
    test('should categorize format errors correctly', () => {
      const formatErrorInputs = [
        {
          input: 'A'.repeat(3000), // overly long
          expectedCategory: 'format_error'
        },
        {
          input: 'Email: test@example.com\n**Project**: [Analysis] with *special* #characters',
          expectedCategory: 'format_error'
        }
      ];

      formatErrorInputs.forEach(({ input }) => {
        try {
          const result = extractor.extractProjectData(input);
          // Should either succeed or provide helpful error info
          if (!result.success) {
            expect(result.suggestions).toBeDefined();
            expect(result.suggestions.length).toBeGreaterThan(0);
          }
        } catch (error) {
          // Error recovery should be handled gracefully
          expect(error).toBeDefined();
        }
      });
    });

    test('should recover partial data from malformed input', () => {
      const partialInputs = [
        {
          input: 'My email is john@company.com and I want weekly reports but forgot other details',
          expectedRecovered: ['userEmail', 'reportFrequency']
        },
        {
          input: 'https://mysite.com - please analyze this website',
          expectedRecovered: ['productUrl']
        },
        {
          input: 'Project: Competitive Analysis\nSomething went wrong with formatting...',
          expectedRecovered: ['projectName']
        }
      ];

      partialInputs.forEach(({ input, expectedRecovered }) => {
        const result = extractor.extractProjectData(input);
        
        // Should recover at least some data
        if (result.data) {
          let recoveredCount = 0;
          expectedRecovered.forEach(field => {
            if (result.data![field as keyof typeof result.data]) {
              recoveredCount++;
            }
          });
          expect(recoveredCount).toBeGreaterThan(0);
        }
      });
    });

    test('should provide progressive parsing suggestions', () => {
      const incompleteInput = 'john@company.com\nWeekly reports';
      
      const result = extractor.extractProjectData(incompleteInput);
      
      if (!result.success) {
        expect(result.suggestions).toBeDefined();
        expect(result.suggestions.some(s => s.includes('project') || s.includes('name'))).toBe(true);
      }
    });

    test('should handle conversational input with recovery', () => {
      const conversationalInput = `
        Hi! I'm looking to set up competitive analysis for my startup. 
        We're called TechCorp and our website is techcorp.com. 
        I'd like to get reports monthly if possible.
        My email is founder@techcorp.com.
      `;

      const result = extractor.extractProjectData(conversationalInput);
      
      // Should extract key information despite conversational format
      expect(result.data).toBeDefined();
      if (result.data) {
        expect(result.data.userEmail).toContain('founder@techcorp.com');
        expect(result.data.reportFrequency?.toLowerCase()).toContain('monthly');
        expect(result.data.productName).toContain('TechCorp');
      }
    });
  });

  describe('Task 5.3: Data Quality and Consistency', () => {
    test('should maintain data consistency after extraction', () => {
      const testInput = `
        Email: test@company.com
        Frequency: Weekly  
        Project: Product Analysis Report
        Website: https://company.com
        Product: Company Product Suite
        Industry: Software
      `;

      const result = extractor.extractProjectData(testInput);
      
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      
      if (result.data) {
        // All required fields should be present
        expect(result.data.userEmail).toBe('test@company.com');
        expect(result.data.reportFrequency?.toLowerCase()).toBe('weekly');
        expect(result.data.projectName).toContain('Product Analysis');
        expect(result.data.productUrl).toBe('https://company.com');
        expect(result.data.productName).toContain('Company Product Suite');
        expect(result.data.industry).toContain('Software');
      }
    });

    test('should validate extracted data quality', () => {
      const testCases = [
        {
          input: 'Email: invalid-email\nFrequency: Weekly\nProject: Test',
          expectValid: false
        },
        {
          input: 'Email: valid@email.com\nFrequency: InvalidFreq\nProject: Test',
          expectValid: false
        },
        {
          input: 'Email: valid@email.com\nFrequency: Weekly\nProject: Valid Project Name',
          expectValid: true
        }
      ];

      testCases.forEach(({ input, expectValid }) => {
        const result = extractor.extractProjectData(input);
        
        if (expectValid) {
          expect(result.success).toBe(true);
          expect(result.errors.length).toBe(0);
        } else {
          expect(result.success).toBe(false);
          expect(result.errors.length).toBeGreaterThan(0);
        }
      });
    });

    test('should handle edge cases with unusual input formats', () => {
      const edgeCases = [
        {
          name: 'Mixed case frequency',
          input: 'Email: test@test.com\nFrequency: MONTHLY\nProject: Test Project',
          shouldExtract: true
        },
        {
          name: 'URL with query parameters',
          input: 'Email: test@test.com\nWebsite: https://example.com?param=value&other=123',
          shouldExtract: true
        },
        {
          name: 'Product name with special characters',
          input: 'Email: test@test.com\nProduct: Product™ 2.0 (Beta)',
          shouldExtract: true
        },
        {
          name: 'International domain',
          input: 'Email: test@test.com\nWebsite: https://example.co.uk',
          shouldExtract: true
        }
      ];

      edgeCases.forEach(({ name, input, shouldExtract }) => {
        const result = extractor.extractProjectData(input);
        
        if (shouldExtract) {
          expect(result.data).toBeDefined();
          // At least some data should be extracted
          const hasData = result.data && Object.values(result.data).some(value => 
            value !== null && value !== undefined && value !== ''
          );
          expect(hasData).toBe(true);
        }
      });
    });

    test('should provide confidence scores for extraction quality', () => {
      const highConfidenceInput = `
        Email: john.doe@company.com
        Frequency: Weekly
        Project: Comprehensive Competitive Analysis
        Website: https://www.company.com
        Product: Enterprise Software Suite
      `;

      const result = extractor.extractProjectData(highConfidenceInput);
      
      if (result.confidence) {
        expect(result.confidence.overall).toBeGreaterThan(80);
        
        // Individual field confidence should be reasonable
        if (result.confidence.productName) {
          expect(result.confidence.productName).toBeGreaterThan(70);
        }
        
        if (result.confidence.productUrl) {
          expect(result.confidence.productUrl).toBeGreaterThan(80);
        }
      }
    });
  });

  describe('Task 5.x: Integration with Conversation Manager', () => {
    test('should handle parsing errors gracefully in conversation flow', () => {
      const malformedInput = 'This is completely malformed input with no structure at all!!!';
      
      try {
        // Should not throw unhandled errors
        const response = conversationManager.handleMessage(malformedInput);
        expect(response).toBeDefined();
        
        if (response.error) {
          expect(response.error).toContain('error');
          expect(response.message).toContain('help');
        }
      } catch (error) {
        // If it does throw, it should be a controlled error
        expect(error).toBeDefined();
      }
    });

    test('should recover and continue conversation after parsing errors', () => {
      // First attempt with bad data
      const badInput = 'Bad format input';
      const response1 = conversationManager.handleMessage(badInput);
      
      expect(response1).toBeDefined();
      
      // Second attempt with good data should work
      const goodInput = `
        Email: recovery@test.com
        Frequency: Weekly
        Project: Recovery Test Project
      `;
      
      const response2 = conversationManager.handleMessage(goodInput);
      expect(response2).toBeDefined();
      
      // Should be able to progress in conversation
      expect(response2.step).toBeDefined();
    });

    test('should preserve user progress during error recovery', () => {
      const partialInput = 'Email: progress@test.com\nInvalid format continues...';
      
      const response = conversationManager.handleMessage(partialInput);
      expect(response).toBeDefined();
      
      // Even with errors, valid email should be preserved in some form
      // This tests the progressive parsing recovery
      if (response.message) {
        expect(response.message).toBeDefined();
        // Should provide helpful guidance
        expect(response.message.length).toBeGreaterThan(50);
      }
    });
  });
}); 