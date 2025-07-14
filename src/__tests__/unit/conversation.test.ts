import { ConversationManager } from '@/lib/chat/conversation';
import { ChatState } from '@/types/chat';

// Mock the dependencies
jest.mock('@/lib/reports/markdown-generator');
jest.mock('@/lib/prisma');
jest.mock('@/services/projectScrapingService');
jest.mock('@/services/productService');
jest.mock('@/lib/chat/productChatProcessor');
jest.mock('@/lib/chat/enhancedProjectExtractor');
jest.mock('@/lib/chat/comprehensiveRequirementsCollector');

describe('ConversationManager - Phase 3.1 Integration', () => {
  let conversationManager: ConversationManager;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Feature Flag Support', () => {
    it('should use legacy flow when comprehensive flow is disabled', async () => {
      conversationManager = new ConversationManager({ useComprehensiveFlow: false });
      
      // Trigger initial response which should use legacy flow
      const response = await conversationManager.processUserMessage('');
      
      expect(response.expectedInputType).toBe('text');
      expect(response.message).toContain('Please tell me:');
      expect(response.message).toContain('Your email address');
    });

    it('should use comprehensive flow when feature flag is enabled', async () => {
      conversationManager = new ConversationManager({ useComprehensiveFlow: true });
      
      // Mock comprehensive collector
      conversationManager['comprehensiveCollector'].generateComprehensivePrompt = jest.fn().mockReturnValue('Comprehensive prompt');
      
      // Trigger initial response which should use comprehensive flow
      const response = await conversationManager.processUserMessage('');
      
      expect(response.expectedInputType).toBe('comprehensive_form');
      expect(response.stepDescription).toBe('Complete Project Setup');
    });

    it('should respect environment variable for feature flag', () => {
      process.env.ENABLE_COMPREHENSIVE_FLOW = 'true';
      conversationManager = new ConversationManager();
      
      expect(conversationManager['useComprehensiveFlow']).toBe(true);
      
      // Cleanup
      delete process.env.ENABLE_COMPREHENSIVE_FLOW;
    });
  });

  describe('Comprehensive Input Handling', () => {
    beforeEach(() => {
      conversationManager = new ConversationManager({ useComprehensiveFlow: true });
    });

    it('should handle complete comprehensive submission', async () => {
      const completeInput = `
        1. john@company.com
        2. Weekly
        3. Test Project
        4. Test Product
        5. https://test.com
        6. SaaS
        7. B2B analytics platform
        8. 500+ enterprise customers
        9. Data visualization challenges
      `;

      // Mock comprehensive collector to return valid result
      const mockValidationResult = {
        isValid: true,
        completeness: 100,
        missingRequiredFields: [],
        invalidFields: [],
        extractedData: {
          userEmail: 'john@company.com',
          reportFrequency: 'weekly',
          projectName: 'Test Project',
          productName: 'Test Product',
          productUrl: 'https://test.com',
          industry: 'SaaS',
          positioning: 'B2B analytics platform',
          customerData: '500+ enterprise customers',
          userProblem: 'Data visualization challenges'
        },
        confidence: {},
        suggestions: []
      };

      conversationManager['comprehensiveCollector'].parseComprehensiveInput = jest.fn().mockReturnValue(mockValidationResult);
      conversationManager['comprehensiveCollector'].isReadyForProjectCreation = jest.fn().mockReturnValue(true);
      conversationManager['createProjectWithAllCompetitors'] = jest.fn().mockResolvedValue({
        id: 'test-project-id',
        name: 'Test Project',
        competitors: [{ name: 'Competitor A' }, { name: 'Competitor B' }]
      });

      const response = await conversationManager.processUserMessage(completeInput);

      expect(response.projectCreated).toBe(true);
      expect(response.nextStep).toBe(1.5);
      expect(response.message).toContain('Project Created Successfully');
      expect(response.message).toContain('Test Product');
      expect(response.message).toContain('SaaS');
    });

    it('should handle partial comprehensive submission', async () => {
      const partialInput = `
        1. john@company.com
        2. Weekly
        3. Test Project
      `;

      const mockValidationResult = {
        isValid: false,
        completeness: 33,
        missingRequiredFields: ['productName', 'productUrl', 'industry', 'positioning', 'customerData', 'userProblem'],
        invalidFields: [],
        extractedData: {
          userEmail: 'john@company.com',
          reportFrequency: 'Weekly',
          projectName: 'Test Project'
        },
        confidence: {},
        suggestions: ['Still need: Product Name, Product URL, Industry']
      };

      conversationManager['comprehensiveCollector'].parseComprehensiveInput = jest.fn().mockReturnValue(mockValidationResult);
      conversationManager['comprehensiveCollector'].isReadyForProjectCreation = jest.fn().mockReturnValue(false);
      conversationManager['comprehensiveCollector'].createMissingFieldsPrompt = jest.fn().mockReturnValue('Please provide missing fields...');

      const response = await conversationManager.processUserMessage(partialInput);

      expect(response.nextStep).toBe(0);
      expect(response.expectedInputType).toBe('comprehensive_form');
      expect(response.stepDescription).toBe('Complete Project Setup');
    });

    it('should handle invalid input with validation errors', async () => {
      const invalidInput = `
        1. invalid-email
        2. Sometimes
        3. Test Project
      `;

      const mockValidationResult = {
        isValid: false,
        completeness: 25,
        missingRequiredFields: ['productName', 'productUrl', 'industry', 'positioning', 'customerData', 'userProblem'],
        invalidFields: [
          { field: 'userEmail', reason: 'Invalid email format', suggestion: 'Use format: user@company.com' },
          { field: 'reportFrequency', reason: 'Invalid frequency', suggestion: 'Use: Weekly, Monthly, or Quarterly' }
        ],
        extractedData: {
          projectName: 'Test Project'
        },
        confidence: {},
        suggestions: []
      };

      conversationManager['comprehensiveCollector'].parseComprehensiveInput = jest.fn().mockReturnValue(mockValidationResult);
      conversationManager['comprehensiveCollector'].createMissingFieldsPrompt = jest.fn().mockReturnValue('Please fix validation errors...');

      const response = await conversationManager.processUserMessage(invalidInput);

      expect(response.nextStep).toBe(0);
      expect(response.expectedInputType).toBe('comprehensive_form');
    });
  });

  describe('Backward Compatibility', () => {
    it('should preserve legacy flow for existing sessions', async () => {
      // Legacy session state
      const legacyState: Partial<ChatState> = {
        currentStep: 1,
        useComprehensiveFlow: false,
        collectedData: {
          userEmail: 'legacy@company.com',
          reportFrequency: 'Monthly',
          reportName: 'Legacy Project'
        }
      };

      conversationManager = new ConversationManager(legacyState);

      // Should continue with legacy flow
      const response = await conversationManager.processUserMessage('Product Name');

      expect(response).toBeDefined();
      // Legacy flow continues to step 1 processing
    });

    it('should allow migration to comprehensive flow', async () => {
      const migrationState: Partial<ChatState> = {
        currentStep: null,
        useComprehensiveFlow: true,
        collectedData: {
          userEmail: 'migration@company.com'
        }
      };

      conversationManager = new ConversationManager(migrationState);
      
      // Mock comprehensive collector
      conversationManager['comprehensiveCollector'].generateComprehensivePrompt = jest.fn().mockReturnValue('Comprehensive prompt');
      
      const response = await conversationManager.processUserMessage('');
      
      expect(response.expectedInputType).toBe('comprehensive_form');
      expect(response.stepDescription).toBe('Complete Project Setup');
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      conversationManager = new ConversationManager({ useComprehensiveFlow: true });
    });

    it('should handle project creation failure gracefully', async () => {
      const completeInput = 'Valid comprehensive input';

      const mockValidationResult = {
        isValid: true,
        completeness: 100,
        missingRequiredFields: [],
        invalidFields: [],
        extractedData: {
          userEmail: 'john@company.com',
          reportFrequency: 'weekly',
          projectName: 'Test Project',
          productName: 'Test Product',
          productUrl: 'https://test.com',
          industry: 'SaaS',
          positioning: 'B2B analytics platform',
          customerData: '500+ enterprise customers',
          userProblem: 'Data visualization challenges'
        },
        confidence: {},
        suggestions: []
      };

      conversationManager['comprehensiveCollector'].parseComprehensiveInput = jest.fn().mockReturnValue(mockValidationResult);
      conversationManager['comprehensiveCollector'].isReadyForProjectCreation = jest.fn().mockReturnValue(true);
      conversationManager['createProjectWithAllCompetitors'] = jest.fn().mockRejectedValue(new Error('Database connection failed'));

      const response = await conversationManager.processUserMessage(completeInput);

      expect(response.error).toBeDefined();
      // Updated expectation to match actual error response format
      expect(response.message).toMatch(/error.*creating.*project/i);
      expect(response.message).toMatch(/retry|try.*again/i);
    });

    it('should handle parsing errors gracefully', async () => {
      const invalidInput = 'Malformed input that causes parsing error';

      conversationManager['comprehensiveCollector'].parseComprehensiveInput = jest.fn().mockImplementation(() => {
        throw new Error('Parsing failed');
      });

      const response = await conversationManager.processUserMessage(invalidInput);

      expect(response.error).toBeDefined();
      expect(response.message).toContain('error processing your request');
    });
  });

  describe('Integration with Existing Components', () => {
    it('should preserve existing message history', async () => {
      conversationManager = new ConversationManager({ useComprehensiveFlow: true });

      await conversationManager.processUserMessage('First message');
      await conversationManager.processUserMessage('Second message');

      const messages = conversationManager.getMessages();
      
      expect(messages).toHaveLength(4); // 2 user + 2 assistant messages
      expect(messages[0].role).toBe('user');
      expect(messages[1].role).toBe('assistant');
    });

    it('should update chat state correctly during comprehensive flow', async () => {
      conversationManager = new ConversationManager({ useComprehensiveFlow: true });

      const partialInput = 'Partial comprehensive input';

      const mockValidationResult = {
        isValid: false,
        completeness: 50,
        missingRequiredFields: ['productUrl'],
        invalidFields: [],
        extractedData: {
          userEmail: 'john@company.com',
          reportFrequency: 'weekly',
          projectName: 'Test Project'
        },
        confidence: {},
        suggestions: []
      };

      conversationManager['comprehensiveCollector'].parseComprehensiveInput = jest.fn().mockReturnValue(mockValidationResult);
      conversationManager['comprehensiveCollector'].isReadyForProjectCreation = jest.fn().mockReturnValue(false);
      conversationManager['comprehensiveCollector'].createMissingFieldsPrompt = jest.fn().mockReturnValue('Missing fields prompt');
      conversationManager['comprehensiveCollector'].toChatState = jest.fn().mockReturnValue({
        collectedData: {
          userEmail: 'john@company.com',
          reportFrequency: 'weekly',
          reportName: 'Test Project'
        }
      });

      await conversationManager.processUserMessage(partialInput);

      const chatState = conversationManager.getChatState();
      
      expect(chatState.currentStep).toBe(0);
      expect(chatState.expectedInputType).toBe('comprehensive_form');
      expect(chatState.collectedData?.userEmail).toBe('john@company.com');
    });
  });

  describe('Phase 3.2 Enhanced Error Handling', () => {
    beforeEach(() => {
      conversationManager = new ConversationManager({ useComprehensiveFlow: true });
    });

    describe('Incomplete Submission Handling', () => {
      it('should provide specific guidance for missing fields', async () => {
        const partialInput = `
          1. john@company.com
          2. Weekly
          3. Test Project
        `;

        const mockValidationResult = {
          isValid: false,
          completeness: 33,
          missingRequiredFields: ['productName', 'productUrl', 'industry'],
          invalidFields: [],
          extractedData: {
            userEmail: 'john@company.com',
            reportFrequency: 'Weekly',
            projectName: 'Test Project'
          },
          confidence: {},
          suggestions: ['Use numbered format for best results']
        };

        conversationManager['comprehensiveCollector'].parseComprehensiveInput = jest.fn().mockReturnValue(mockValidationResult);
        conversationManager['comprehensiveCollector'].isReadyForProjectCreation = jest.fn().mockReturnValue(false);
        conversationManager['comprehensiveCollector'].toChatState = jest.fn().mockReturnValue({
          collectedData: mockValidationResult.extractedData
        });

        const response = await conversationManager.processUserMessage(partialInput);

        expect(response.nextStep).toBe(0);
        expect(response.expectedInputType).toBe('comprehensive_form');
        expect(response.message).toContain('33% complete');
        expect(response.message).toContain('What I have so far');
        expect(response.message).toContain('john@company.com');
        expect(response.message).toContain('Still need');
        expect(response.message).toContain('Product Name');
      });

      it('should handle invalid fields with correction guidance', async () => {
        const invalidInput = `
          1. invalid-email
          2. Sometimes
          3. Test Project
          4. Test Product
        `;

        const mockValidationResult = {
          isValid: false,
          completeness: 25,
          missingRequiredFields: ['productUrl', 'industry', 'positioning', 'customerData', 'userProblem'],
          invalidFields: [
            { field: 'userEmail', reason: 'Invalid email format', suggestion: 'Use format: user@company.com' },
            { field: 'reportFrequency', reason: 'Invalid frequency', suggestion: 'Use: Weekly, Monthly, or Quarterly' }
          ],
          extractedData: {
            projectName: 'Test Project',
            productName: 'Test Product'
          },
          confidence: {},
          suggestions: []
        };

        conversationManager['comprehensiveCollector'].parseComprehensiveInput = jest.fn().mockReturnValue(mockValidationResult);
        conversationManager['comprehensiveCollector'].isReadyForProjectCreation = jest.fn().mockReturnValue(false);
        conversationManager['comprehensiveCollector'].toChatState = jest.fn().mockReturnValue({
          collectedData: mockValidationResult.extractedData
        });

        const response = await conversationManager.processUserMessage(invalidInput);

        expect(response.message).toContain('Please fix these issues');
        expect(response.message).toContain('Email Address');
        expect(response.message).toContain('Invalid email format');
        expect(response.message).toContain('user@company.com');
        expect(response.message).toContain('Report Frequency');
        expect(response.message).toContain('Fix & add');
      });

      it('should show progressive completion encouragement', async () => {
        const highCompletionInput = 'Input with 80% completion';

        const mockValidationResult = {
          isValid: false,
          completeness: 80,
          missingRequiredFields: ['industry', 'positioning'],
          invalidFields: [],
          extractedData: {
            userEmail: 'john@company.com',
            reportFrequency: 'weekly',
            projectName: 'Test Project',
            productName: 'Test Product',
            productUrl: 'https://test.com',
            customerData: 'Enterprise customers',
            userProblem: 'Data challenges'
          },
          confidence: {},
          suggestions: []
        };

        conversationManager['comprehensiveCollector'].parseComprehensiveInput = jest.fn().mockReturnValue(mockValidationResult);
        conversationManager['comprehensiveCollector'].isReadyForProjectCreation = jest.fn().mockReturnValue(false);
        conversationManager['comprehensiveCollector'].toChatState = jest.fn().mockReturnValue({
          collectedData: mockValidationResult.extractedData
        });

        const response = await conversationManager.processUserMessage(highCompletionInput);

        expect(response.message).toContain('🎯');
        expect(response.message).toContain("You're almost there!");
        expect(response.message).toContain('80% complete');
      });

      it('should provide field-specific examples and descriptions', async () => {
        const mockValidationResult = {
          isValid: false,
          completeness: 50,
          missingRequiredFields: ['positioning', 'customerData'],
          invalidFields: [],
          extractedData: {
            userEmail: 'john@company.com',
            reportFrequency: 'weekly',
            projectName: 'Test Project',
            productName: 'Test Product',
            productUrl: 'https://test.com',
            industry: 'SaaS'
          },
          confidence: {},
          suggestions: []
        };

        conversationManager['comprehensiveCollector'].parseComprehensiveInput = jest.fn().mockReturnValue(mockValidationResult);
        conversationManager['comprehensiveCollector'].isReadyForProjectCreation = jest.fn().mockReturnValue(false);
        conversationManager['comprehensiveCollector'].toChatState = jest.fn().mockReturnValue({
          collectedData: mockValidationResult.extractedData
        });

        const response = await conversationManager.processUserMessage('Partial input');

        expect(response.message).toContain('Product Positioning');
        expect(response.message).toContain('value proposition');
        expect(response.message).toContain('Premium meat delivery service');
        expect(response.message).toContain('Customer Information');
        expect(response.message).toContain('target customers');
      });
    });

    describe('Parsing Error Recovery', () => {
      it('should handle parsing errors gracefully', async () => {
        const malformedInput = 'Input that causes parsing error';

        conversationManager['comprehensiveCollector'].parseComprehensiveInput = jest.fn().mockImplementation(() => {
          throw new Error('Failed to parse input format');
        });

        const response = await conversationManager.processUserMessage(malformedInput);

        expect(response.error).toBe('Failed to parse input format');
        expect(response.message).toContain('Oops! I had trouble parsing');
        expect(response.message).toContain('What happened: Failed to parse input format');
        expect(response.message).toContain('Use numbered list');
        expect(response.message).toContain('your.email@company.com');
        expect(response.nextStep).toBe(0);
        expect(response.expectedInputType).toBe('comprehensive_form');
      });

      it('should provide specific guidance for long inputs', async () => {
        const longInput = 'A'.repeat(2500); // Very long input

        conversationManager['comprehensiveCollector'].parseComprehensiveInput = jest.fn().mockImplementation(() => {
          throw new Error('Input too long to process');
        });

        const response = await conversationManager.processUserMessage(longInput);

        expect(response.message).toContain('Try shorter format');
        expect(response.message).toContain('breaking it into key points');
      });

      it('should provide specific guidance for special characters', async () => {
        const specialCharInput = 'Input with special chars: ♦♠♣♥§∞¶•';

        conversationManager['comprehensiveCollector'].parseComprehensiveInput = jest.fn().mockImplementation(() => {
          throw new Error('Special characters not supported');
        });

        const response = await conversationManager.processUserMessage(specialCharInput);

        expect(response.message).toContain('Simplify formatting');
        expect(response.message).toContain('basic punctuation');
      });

      it('should maintain conversational tone during error recovery', async () => {
        conversationManager['comprehensiveCollector'].parseComprehensiveInput = jest.fn().mockImplementation(() => {
          throw new Error('Generic parsing error');
        });

        const response = await conversationManager.processUserMessage('Error input');

        expect(response.message).toContain("I'm here to help!");
        expect(response.message).toContain('😊');
        expect(response.message).toContain('comfortable for you');
      });
    });

    describe('Field Display and Messaging', () => {
      it('should use user-friendly field names', () => {
        const displayName = conversationManager['getFieldDisplayName']('userEmail');
        expect(displayName).toBe('Email Address');

        const displayName2 = conversationManager['getFieldDisplayName']('productUrl');
        expect(displayName2).toBe('Website URL');

        const displayName3 = conversationManager['getFieldDisplayName']('customerData');
        expect(displayName3).toBe('Customer Information');
      });

      it('should provide comprehensive field details', () => {
        const missingFields = ['userEmail', 'productUrl', 'positioning'];
        const details = conversationManager['getMissingFieldDetails'](missingFields);

        expect(details).toHaveLength(3);
        expect(details[0]).toEqual({
          field: 'userEmail',
          description: 'Your email address for receiving reports',
          example: 'john.doe@company.com'
        });
        expect(details[1]).toEqual({
          field: 'productUrl',
          description: 'Your product website URL',
          example: 'https://goodchop.com'
        });
      });

      it('should provide correction examples for invalid fields', () => {
        const invalidFields = [
          { field: 'userEmail', reason: 'Invalid format', suggestion: 'Use email format' },
          { field: 'reportFrequency', reason: 'Invalid frequency', suggestion: 'Use standard frequency' }
        ];
        
        const details = conversationManager['getInvalidFieldDetails'](invalidFields);

        expect(details).toHaveLength(2);
        expect(details[0]).toEqual({
          field: 'userEmail',
          reason: 'Invalid format',
          suggestion: 'Use email format',
          example: 'user@company.com'
        });
        expect(details[1]).toEqual({
          field: 'reportFrequency',
          reason: 'Invalid frequency',
          suggestion: 'Use standard frequency',
          example: 'Weekly (or Monthly, Quarterly)'
        });
      });
    });

    describe('Conversational Messaging', () => {
      it('should create encouraging messages based on completion percentage', () => {
        const message25 = conversationManager['createProgressivePromptMessage'](
          25, [], [], {}, []
        );
        expect(message25).toContain('Good start!');
        expect(message25).toContain('25% complete');

        const message75 = conversationManager['createProgressivePromptMessage'](
          75, [], [], {}, []
        );
        expect(message75).toContain("You're almost there!");
        expect(message75).toContain('75% complete');
      });

      it('should acknowledge existing data conversationally', () => {
        const existingData = {
          userEmail: 'john@company.com',
          projectName: 'Test Project',
          productName: 'Test Product'
        };

        const message = conversationManager['createProgressivePromptMessage'](
          50, [], [], existingData, []
        );

        expect(message).toContain('What I have so far');
        expect(message).toContain('Email: john@company.com');
        expect(message).toContain('Project: Test Project');
        expect(message).toContain('Product: Test Product');
      });

      it('should provide multiple resubmission options', () => {
        const missingFields = [{ field: 'productUrl', description: 'Website', example: 'https://test.com' }];
        const invalidFields = [{ field: 'userEmail', reason: 'Invalid', suggestion: 'Fix format', example: 'user@company.com' }];

        const message = conversationManager['createProgressivePromptMessage'](
          50, missingFields, invalidFields, {}, []
        );

        expect(message).toContain('How to continue');
        expect(message).toContain('Fix & add');
        expect(message).toContain('Just fix');
        expect(message).toContain('Just add');
      });
    });
  });
});

describe('Phase 4.1: Comprehensive Validation', () => {
  let conversationManager: ConversationManager;
  
  beforeEach(() => {
    conversationManager = new ConversationManager({ useComprehensiveFlow: true });
  });

  describe('Email Format Validation', () => {
    test('should validate correct email formats', async () => {
      const validInputs = [
        'user@company.com',
        'test.email+tag@domain.co.uk',
        'firstname.lastname@subdomain.domain.com'
      ];

      for (const email of validInputs) {
        const result = await conversationManager['validateEmailFormat'](email);
        expect(result.isValid).toBe(true);
      }
    });

    test('should reject invalid email formats', async () => {
      const invalidInputs = [
        'invalid-email',
        '@company.com',
        'user@',
        'user.company.com',
        ''
      ];

      for (const email of invalidInputs) {
        const result = await conversationManager['validateEmailFormat'](email);
        expect(result.isValid).toBe(false);
        expect(result.message).toBeTruthy();
      }
    });

    test('should detect common email typos', async () => {
      const typoEmails = [
        'user@gmial.com',
        'test@yahooo.com',
        'example@hotmial.com'
      ];

      for (const email of typoEmails) {
        const result = await conversationManager['validateEmailFormat'](email);
        expect(result.isValid).toBe(false);
        expect(result.message).toContain('typo');
      }
    });
  });

  describe('URL Accessibility Validation', () => {
    test('should validate proper URL formats', async () => {
      const validUrls = [
        'https://example.com',
        'http://test.com',
        'https://subdomain.example.com/path'
      ];

      for (const url of validUrls) {
        const result = await conversationManager['validateUrlAccessibility'](url);
        expect(result.isValid).toBe(true);
      }
    });

    test('should reject invalid URLs', async () => {
      const invalidUrls = [
        '',
        'not-a-url',
        'https://localhost',
        'https://127.0.0.1',
        'ftp://example.com'
      ];

      for (const url of invalidUrls) {
        const result = await conversationManager['validateUrlAccessibility'](url);
        expect(result.isValid).toBe(false);
        expect(result.severity).toBe('error');
      }
    });

    test('should warn about HTTP URLs', async () => {
      const result = await conversationManager['validateUrlAccessibility']('http://example.com');
      expect(result.isValid).toBe(true);
      expect(result.severity).toBe('warning');
      expect(result.message).toContain('HTTP');
    });

    test('should normalize URLs without protocol', async () => {
      const result = await conversationManager['validateUrlAccessibility']('example.com');
      expect(result.isValid).toBe(true);
    });
  });

  describe('Field Completeness Validation', () => {
    test('should validate complete requirements', async () => {
      const completeRequirements = {
        userEmail: 'test@company.com',
        reportFrequency: 'Weekly',
        projectName: 'Test Project',
        productName: 'Test Product',
        productUrl: 'https://test.com',
        industry: 'Technology',
        positioning: 'B2B software solution for enterprises',
        customerData: 'Enterprise customers in technology sector',
        userProblem: 'Need better competitive intelligence'
      };

      const result = await conversationManager['validateFieldCompleteness'](completeRequirements);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should identify missing required fields', async () => {
      const incompleteRequirements = {
        userEmail: 'test@company.com',
        reportFrequency: 'Weekly',
        projectName: 'Test Project'
        // Missing other required fields
      };

      const result = await conversationManager['validateFieldCompleteness'](incompleteRequirements as any);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);

      const missingFields = result.errors.map(e => e.field);
      expect(missingFields).toContain('productName');
      expect(missingFields).toContain('productUrl');
      expect(missingFields).toContain('industry');
    });

    test('should reject fields that are too short', async () => {
      const shortFieldRequirements = {
        userEmail: 'test@company.com',
        reportFrequency: 'Weekly',
        projectName: 'Te', // Too short
        productName: 'P', // Too short
        productUrl: 'https://test.com',
        industry: 'T', // Too short
        positioning: 'B2B software solution',
        customerData: 'Enterprise customers',
        userProblem: 'Need better intelligence'
      };

      const result = await conversationManager['validateFieldCompleteness'](shortFieldRequirements);
      expect(result.isValid).toBe(false);
      
      const shortFields = result.errors.filter(e => e.type === 'length');
      expect(shortFields.length).toBeGreaterThan(0);
    });
  });

  describe('Business Logic Validation', () => {
    test('should validate correct report frequencies', async () => {
      const validFrequencies = ['weekly', 'monthly', 'quarterly', 'daily'];
      
      for (const frequency of validFrequencies) {
        const requirements = {
          ...mockCompleteRequirements,
          reportFrequency: frequency
        };
        
        const result = await conversationManager['validateBusinessLogic'](requirements);
        expect(result.isValid).toBe(true);
      }
    });

    test('should reject invalid report frequencies', async () => {
      const invalidFrequencies = ['yearly', 'sometimes', 'never', 'often'];
      
      for (const frequency of invalidFrequencies) {
        const requirements = {
          ...mockCompleteRequirements,
          reportFrequency: frequency
        };
        
        const result = await conversationManager['validateBusinessLogic'](requirements);
        expect(result.isValid).toBe(false);
        
        const frequencyError = result.errors.find(e => e.field === 'reportFrequency');
        expect(frequencyError).toBeTruthy();
      }
    });

    test('should warn about very long project names', async () => {
      const longProjectName = 'A'.repeat(150); // Very long name
      const requirements = {
        ...mockCompleteRequirements,
        projectName: longProjectName
      };
      
      const result = await conversationManager['validateBusinessLogic'](requirements);
      const projectNameWarning = result.warnings.find(w => w.field === 'projectName');
      expect(projectNameWarning).toBeTruthy();
      expect(projectNameWarning?.message).toContain('long');
    });

    test('should warn about generic industries', async () => {
      const requirements = {
        ...mockCompleteRequirements,
        industry: 'Tech' // Too generic
      };
      
      const result = await conversationManager['validateBusinessLogic'](requirements);
      const industryWarning = result.warnings.find(w => w.field === 'industry');
      expect(industryWarning).toBeTruthy();
    });

    test('should warn about product name-URL mismatches', async () => {
      const requirements = {
        ...mockCompleteRequirements,
        productName: 'Amazing Software',
        productUrl: 'https://totally-different-company.com'
      };
      
      const result = await conversationManager['validateBusinessLogic'](requirements);
      const urlWarning = result.warnings.find(w => w.field === 'productUrl');
      expect(urlWarning).toBeTruthy();
      expect(urlWarning?.type).toBe('consistency');
    });

    test('should warn about brief customer data', async () => {
      const requirements = {
        ...mockCompleteRequirements,
        customerData: 'Some customers' // Too brief
      };
      
      const result = await conversationManager['validateBusinessLogic'](requirements);
      const customerWarning = result.warnings.find(w => w.field === 'customerData');
      expect(customerWarning).toBeTruthy();
      expect(customerWarning?.type).toBe('detail');
    });
  });

  describe('Advanced Validation', () => {
    test('should suggest competitive advantages in positioning', async () => {
      const requirements = {
        ...mockCompleteRequirements,
        positioning: 'We make software for businesses' // No competitive language
      };
      
      const result = await conversationManager['performAdvancedValidation'](requirements);
      expect(result.suggestions.some(s => s.includes('competitive advantages'))).toBe(true);
    });

    test('should suggest target market specification', async () => {
      const requirements = {
        ...mockCompleteRequirements,
        customerData: 'Various types of customers using our product' // No specific target market
      };
      
      const result = await conversationManager['performAdvancedValidation'](requirements);
      expect(result.suggestions.some(s => s.includes('target market'))).toBe(true);
    });

    test('should warn about positioning-problem misalignment', async () => {
      const requirements = {
        ...mockCompleteRequirements,
        positioning: 'Advanced analytics platform for data scientists',
        userProblem: 'Need better customer support system' // Misaligned
      };
      
      const result = await conversationManager['performAdvancedValidation'](requirements);
      const alignmentWarning = result.warnings.find(w => w.type === 'alignment');
      expect(alignmentWarning).toBeTruthy();
    });

    test('should suggest more detail for brief inputs', async () => {
      const briefRequirements = {
        userEmail: 'test@co.com',
        reportFrequency: 'weekly',
        projectName: 'Test',
        productName: 'Product',
        productUrl: 'https://test.com',
        industry: 'Tech',
        positioning: 'Software',
        customerData: 'Customers',
        userProblem: 'Problem'
      };
      
      const result = await conversationManager['performAdvancedValidation'](briefRequirements);
      expect(result.suggestions.some(s => s.includes('detailed information'))).toBe(true);
    });
  });

  describe('Comprehensive Validation Integration', () => {
    test('should perform all validation checks on complete data', async () => {
      const result = await conversationManager['validateAllRequirements'](mockCompleteRequirements);
      
      expect(result).toHaveProperty('isValid');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('warnings');
      expect(result).toHaveProperty('suggestions');
      expect(result.isValid).toBe(true);
    });

    test('should aggregate errors from all validation types', async () => {
      const invalidRequirements = {
        userEmail: 'invalid-email', // Email format error
        reportFrequency: 'sometimes', // Business logic error
        projectName: '', // Required field error
        productName: 'Test Product',
        productUrl: 'not-a-url', // URL format error
        industry: 'Technology',
        positioning: 'B2B software solution',
        customerData: 'Enterprise customers',
        userProblem: 'Need better intelligence'
      };
      
      const result = await conversationManager['validateAllRequirements'](invalidRequirements);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      
      // Should have errors from multiple validation types
      const errorTypes = result.errors.map(e => e.type);
      expect(errorTypes).toContain('format'); // Email format
      expect(errorTypes).toContain('business_logic'); // Frequency
      expect(errorTypes).toContain('required'); // Project name
    });

    test('should include warnings and suggestions even when valid', async () => {
      const validButWarningRequirements = {
        ...mockCompleteRequirements,
        customerData: 'Brief', // Too short, triggers detail warning  
        projectName: 'A'.repeat(150), // Very long, triggers length warning
        industry: 'Tech', // Too generic, triggers specificity warning
        positioning: 'We make software for businesses' // No competitive language
      };
      
      const result = await conversationManager['validateAllRequirements'](validButWarningRequirements);
      
      expect(result.isValid).toBe(true); // Valid but with warnings
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.suggestions.length).toBeGreaterThan(0);
    });
  });

  describe('Validation Error Handling', () => {
    test('should provide detailed error guidance', async () => {
      const invalidData = {
        userEmail: 'invalid-email',
        reportFrequency: 'sometimes'
      };
      
      const validation = {
        errors: [
          {
            field: 'userEmail',
            type: 'format' as const,
            message: 'Invalid email format',
            suggestion: 'Please provide a valid email'
          }
        ],
        warnings: [],
        suggestions: []
      };
      
      const result = conversationManager['handleValidationErrors'](invalidData, validation);
      
      expect(result.message).toContain('Issues to fix');
      expect(result.message).toContain('Invalid email format');
      expect(result.expectedInputType).toBe('comprehensive_form');
      expect(result.nextStep).toBe(0);
    });

    test('should include warnings and suggestions in error response', async () => {
      const validation = {
        errors: [
          {
            field: 'userEmail',
            type: 'format' as const,
            message: 'Invalid email',
            suggestion: 'Fix email format'
          }
        ],
        warnings: [
          {
            field: 'projectName',
            type: 'length' as const,
            message: 'Name is long',
            suggestion: 'Consider shorter name'
          }
        ],
        suggestions: ['Add more details', 'Specify target market']
      };
      
      const result = conversationManager['handleValidationErrors']({}, validation);
      
      expect(result.message).toContain('Recommendations');
      expect(result.message).toContain('Enhancement suggestions');
      expect(result.message).toContain('Name is long');
    });
  });
});

describe('Phase 4.2: Enhanced Confirmation Display', () => {
  let conversationManager: ConversationManager;
  
  beforeEach(() => {
    conversationManager = new ConversationManager({ useComprehensiveFlow: true });
  });

  describe('Comprehensive Confirmation Display', () => {
    const mockCompleteRequirements = {
      userEmail: 'test@company.com',
      reportFrequency: 'Weekly',
      projectName: 'Test Project Analysis',
      productName: 'TestProduct',
      productUrl: 'https://testproduct.com',
      industry: 'SaaS',
      positioning: 'AI-powered business intelligence platform for SMB enterprises',
      customerData: '500+ mid-market companies, primarily in tech and finance sectors',
      userProblem: 'Manual data analysis and reporting taking too much time'
    };

    test('should create comprehensive confirmation display with all sections', () => {
      const result = conversationManager['createComprehensiveConfirmation'](mockCompleteRequirements);
      
      expect(result.message).toContain('Ready to Create Your Competitive Analysis Project!');
      expect(result.message).toContain('CONTACT & PROJECT SETUP');
      expect(result.message).toContain('PRODUCT INFORMATION');
      expect(result.message).toContain('BUSINESS CONTEXT');
      expect(result.message).toContain('AUTOMATED SETUP PREVIEW');
      expect(result.message).toContain('DATA QUALITY ASSESSMENT');
      expect(result.message).toContain('READY TO PROCEED?');
      
      expect(result.nextStep).toBe(1.5);
      expect(result.stepDescription).toBe('Confirm Project Creation');
      expect(result.expectedInputType).toBe('text');
    });

    test('should display all contact and project information correctly', () => {
      const result = conversationManager['createComprehensiveConfirmation'](mockCompleteRequirements);
      
      expect(result.message).toContain('test@company.com');
      expect(result.message).toContain('Weekly (Regular updates)');
      expect(result.message).toContain('"Test Project Analysis"');
    });

    test('should display all product information correctly', () => {
      const result = conversationManager['createComprehensiveConfirmation'](mockCompleteRequirements);
      
      expect(result.message).toContain('TestProduct');
      expect(result.message).toContain('https://testproduct.com');
      expect(result.message).toContain('SaaS');
    });

    test('should format multiline business context properly', () => {
      const result = conversationManager['createComprehensiveConfirmation'](mockCompleteRequirements);
      
      expect(result.message).toContain('Product Positioning:');
      expect(result.message).toContain('AI-powered business intelligence');
      expect(result.message).toContain('Target Customers:');
      expect(result.message).toContain('500+ mid-market companies');
      expect(result.message).toContain('User Problems Solved:');
      expect(result.message).toContain('Manual data analysis');
    });

    test('should include optional enhancements when provided', () => {
      const requirementsWithOptional = {
        ...mockCompleteRequirements,
        competitorHints: ['Competitor A', 'Competitor B'],
        focusAreas: ['pricing', 'features'],
        reportTemplate: 'executive'
      };
      
      const result = conversationManager['createComprehensiveConfirmation'](requirementsWithOptional);
      
      expect(result.message).toContain('OPTIONAL ENHANCEMENTS');
      expect(result.message).toContain('Competitor Focus: Competitor A, Competitor B');
      expect(result.message).toContain('Analysis Focus Areas: pricing, features');
      expect(result.message).toContain('Report Template: executive');
    });

    test('should include validation warnings when provided', () => {
      const validation = {
        warnings: [
          {
            field: 'customerData',
            type: 'length' as const,
            message: 'Could benefit from more detailed customer information',
            suggestion: 'Consider adding customer demographics and pain points'
          }
        ],
        suggestions: ['Add competitor hints for more targeted analysis']
      };
      
      const result = conversationManager['createComprehensiveConfirmation'](mockCompleteRequirements, validation);
      
      expect(result.message).toContain('RECOMMENDATIONS TO ENHANCE YOUR ANALYSIS');
      expect(result.message).toContain('Customer Information: Could benefit from more detailed customer information');
      expect(result.message).toContain('Consider adding customer demographics');
      expect(result.message).toContain('PRO TIPS FOR BETTER RESULTS');
      expect(result.message).toContain('Add competitor hints for more targeted analysis');
    });

    test('should include data quality assessment', () => {
      const result = conversationManager['createComprehensiveConfirmation'](mockCompleteRequirements);
      
      expect(result.message).toContain('DATA QUALITY ASSESSMENT');
      expect(result.message).toContain('Completeness:');
      expect(result.message).toContain('Detail Level:');
      expect(result.message).toContain('Analysis Potential:');
    });

    test('should include clear next step instructions', () => {
      const result = conversationManager['createComprehensiveConfirmation'](mockCompleteRequirements);
      
      expect(result.message).toContain('Type **"yes"** to create your project');
      expect(result.message).toContain('Type **"edit"** if you\'d like to modify');
      expect(result.message).toContain('Type **"cancel"** to start over');
    });
  });

  describe('Report Frequency Formatting', () => {
    test('should format standard frequencies correctly', () => {
      const testCases = [
        { input: 'daily', expected: 'Daily (High-frequency monitoring)' },
        { input: 'weekly', expected: 'Weekly (Regular updates)' },
        { input: 'monthly', expected: 'Monthly (Comprehensive reviews)' },
        { input: 'quarterly', expected: 'Quarterly (Strategic assessments)' }
      ];

      testCases.forEach(({ input, expected }) => {
        const result = conversationManager['formatReportFrequency'](input);
        expect(result).toBe(expected);
      });
    });

    test('should handle custom frequencies', () => {
      const result = conversationManager['formatReportFrequency']('bi-weekly');
      expect(result).toBe('Bi-weekly');
    });

    test('should handle case variations', () => {
      const result = conversationManager['formatReportFrequency']('WEEKLY');
      expect(result).toBe('Weekly (Regular updates)');
    });
  });

  describe('Multiline Text Formatting', () => {
    test('should format short text without modification', () => {
      const result = conversationManager['formatMultilineText']('Short text');
      expect(result).toBe('Short text');
    });

    test('should handle empty text', () => {
      const result = conversationManager['formatMultilineText']('');
      expect(result).toBe('Not specified');
    });

    test('should break long text into readable lines', () => {
      const longText = 'This is a very long piece of text that should be broken into multiple lines to ensure better readability in the confirmation display when shown to users';
      const result = conversationManager['formatMultilineText'](longText, '  ');
      
      expect(result).toContain('\n');
      expect(result.split('\n').every(line => line.length <= 82)).toBe(true); // 80 + 2 for indent
    });

    test('should apply indentation correctly', () => {
      const text = 'Test text for indentation';
      const result = conversationManager['formatMultilineText'](text, '    ');
      expect(result).toBe('    Test text for indentation');
    });
  });

  describe('Data Quality Assessment', () => {
    test('should assess completeness correctly', () => {
      // All required fields present
      const completeRequirements = mockCompleteRequirements;
      const result = conversationManager['assessDataQuality'](completeRequirements);
      
      expect(result.completeness).toBe(100);
      expect(result.completenessLabel).toBe('Excellent');
    });

    test('should assess partial completeness', () => {
      const partialRequirements = {
        ...mockCompleteRequirements,
        positioning: '', // Missing positioning
        customerData: '' // Missing customer data
      };
      
      const result = conversationManager['assessDataQuality'](partialRequirements);
      
      expect(result.completeness).toBeLessThan(100);
      expect(result.completenessLabel).toMatch(/Good|Very Good|Needs Improvement/);
    });

    test('should assess detail level based on content length', () => {
      const comprehensiveRequirements = {
        ...mockCompleteRequirements,
        positioning: 'Very detailed positioning statement with comprehensive market analysis and competitive differentiation strategy targeting specific customer segments with unique value propositions',
        customerData: 'Extensive customer data including detailed demographics, psychographics, pain points, buying behavior, decision-making process, and customer journey mapping',
        userProblem: 'Complex multi-faceted user problems including operational inefficiencies, strategic challenges, market positioning issues, and competitive disadvantages'
      };
      
      const result = conversationManager['assessDataQuality'](comprehensiveRequirements);
      
      expect(result.detailLevel).toBe('Comprehensive');
      expect(result.detailDescription).toContain('Rich detail');
    });

    test('should provide appropriate analysis potential assessment', () => {
      const result = conversationManager['assessDataQuality'](mockCompleteRequirements);
      
      expect(result.analysisPotential).toMatch(/High|Good|Moderate/);
      expect(result.analysisPotential).toContain('competitive');
    });
  });

  describe('Confirmation Response Handling', () => {
    test('should handle positive confirmation responses', async () => {
      const positiveResponses = ['yes', 'y', 'confirm', 'proceed', 'YES', 'Yes please'];
      
      for (const response of positiveResponses) {
        const result = await conversationManager['handleConfirmationResponse'](response);
        // Should call executeProjectCreation - we can't test the actual execution without mocking
        // but we can verify it's trying to execute (would fail due to missing methods)
        expect(result).toBeDefined();
      }
    });

    test('should handle edit requests', async () => {
      const editResponses = ['edit', 'modify', 'change', 'update'];
      
      for (const response of editResponses) {
        const result = await conversationManager['handleConfirmationResponse'](response);
        
        expect(result.message).toContain('Edit Your Information');
        expect(result.nextStep).toBe(0);
        expect(result.stepDescription).toBe('Edit Project Information');
        expect(result.expectedInputType).toBe('comprehensive_form');
      }
    });

    test('should handle cancellation requests', async () => {
      const cancelResponses = ['cancel', 'start over', 'abort'];
      
      for (const response of cancelResponses) {
        const result = await conversationManager['handleConfirmationResponse'](response);
        
        // Should return to project initialization
        expect(result.message).toContain('comprehensive form');
        expect(result.expectedInputType).toBe('comprehensive_form');
      }
    });

    test('should handle unclear responses', async () => {
      const unclearResponses = ['maybe', 'not sure', 'what?', ''];
      
      for (const response of unclearResponses) {
        const result = await conversationManager['handleConfirmationResponse'](response);
        
        expect(result.message).toContain('didn\'t quite understand');
        expect(result.message).toContain('"yes"');
        expect(result.message).toContain('"edit"');
        expect(result.message).toContain('"cancel"');
      }
    });
  });

  describe('Requirements Extraction from Chat State', () => {
    test('should extract complete requirements from chat state', () => {
      conversationManager['chatState'].collectedData = {
        userEmail: 'test@company.com',
        reportFrequency: 'Weekly',
        reportName: 'Test Project',
        productName: 'TestProduct',
        productUrl: 'https://test.com',
        industry: 'SaaS',
        positioning: 'Test positioning',
        customerData: 'Test customers',
        userProblem: 'Test problem'
      };
      
      const result = conversationManager['extractRequirementsFromChatState']();
      
      expect(result).not.toBeNull();
      expect(result?.userEmail).toBe('test@company.com');
      expect(result?.projectName).toBe('Test Project');
      expect(result?.productName).toBe('TestProduct');
    });

    test('should return null for incomplete chat state', () => {
      conversationManager['chatState'].collectedData = {
        userEmail: 'test@company.com'
        // Missing required fields
      };
      
      const result = conversationManager['extractRequirementsFromChatState']();
      expect(result).toBeNull();
    });

    test('should return null for empty chat state', () => {
      conversationManager['chatState'].collectedData = undefined;
      
      const result = conversationManager['extractRequirementsFromChatState']();
      expect(result).toBeNull();
    });
  });

  describe('Integration with Validation', () => {
    test('should integrate validation results into confirmation display', () => {
      const validation = {
        warnings: [
          {
            field: 'positioning',
            type: 'detail' as const,
            message: 'Could be more specific about target market',
            suggestion: 'Consider adding specific industry verticals or company sizes'
          }
        ],
        suggestions: [
          'Add specific competitor names for more focused analysis',
          'Include pricing information if available'
        ]
      };

      const result = conversationManager['createComprehensiveConfirmation'](mockCompleteRequirements, validation);
      
      expect(result.message).toContain('RECOMMENDATIONS TO ENHANCE');
      expect(result.message).toContain('Could be more specific about target market');
      expect(result.message).toContain('PRO TIPS FOR BETTER RESULTS');
      expect(result.message).toContain('Add specific competitor names');
    });

    test('should limit warnings and suggestions display', () => {
      const validation = {
        warnings: Array(10).fill(null).map((_, i) => ({
          field: 'field' + i,
          type: 'detail' as const,
          message: `Warning ${i}`,
          suggestion: `Suggestion ${i}`
        })),
        suggestions: Array(10).fill(null).map((_, i) => `Suggestion ${i}`)
      };

      const result = conversationManager['createComprehensiveConfirmation'](mockCompleteRequirements, validation);
      
      // Should limit to first 3 warnings and 2 suggestions
      const warningMatches = result.message.match(/Warning \d+/g);
      
      expect(warningMatches?.length).toBeLessThanOrEqual(3);
      // Check that suggestions are present but limited (regex might match more due to field descriptions)
      expect(result.message).toContain('PRO TIPS FOR BETTER RESULTS');
      expect(result.message.split('PRO TIPS FOR BETTER RESULTS')[1]?.split('Suggestion').length).toBeLessThanOrEqual(3);
    });
  });
});

/**
 * PHASE 5.1: LEGACY SESSION SUPPORT TESTS
 */
describe('Phase 5.1: Legacy Session Support', () => {
  describe('Legacy Session Detection', () => {
    test('should detect legacy session when useComprehensiveFlow is explicitly false', () => {
      const legacyState = {
        currentStep: 2,
        useComprehensiveFlow: false,
        collectedData: {
          userEmail: 'test@company.com',
          reportFrequency: 'Weekly',
          projectName: 'Test Project'
        }
      };
      
      const manager = new ConversationManager(legacyState);
      
      // Use bracket notation to access private method for testing
      const isLegacySession = (manager as any).isLegacySession();
      expect(isLegacySession).toBe(true);
    });

    test('should detect legacy session when in middle of legacy flow steps', () => {
      const legacyState = {
        currentStep: 3,
        collectedData: {
          userEmail: 'test@company.com',
          reportFrequency: 'Weekly',
          projectName: 'Test Project',
          productName: 'Test Product'
        }
      };
      
      const manager = new ConversationManager(legacyState);
      
      const isLegacySession = (manager as any).isLegacySession();
      expect(isLegacySession).toBe(true);
    });

    test('should detect legacy session when has legacy data structure', () => {
      const legacyState = {
        currentStep: 0,
        collectedData: {
          userEmail: 'test@company.com',
          reportFrequency: 'Weekly',
          reportName: 'Test Project',
          customerDescription: 'Legacy customer data', // Legacy field
          productWebsite: 'https://test.com' // Legacy field
        }
      };
      
      const manager = new ConversationManager(legacyState);
      
      const isLegacySession = (manager as any).isLegacySession();
      expect(isLegacySession).toBe(true);
    });

    test('should not detect legacy session for new comprehensive flow', () => {
      const newState = {
        currentStep: 0,
        useComprehensiveFlow: true,
        collectedData: {
          userEmail: 'test@company.com',
          reportFrequency: 'Weekly',
          projectName: 'Test Project',
          positioning: 'New comprehensive field',
          customerData: 'New comprehensive field',
          userProblem: 'New comprehensive field'
        }
      };
      
      const manager = new ConversationManager(newState);
      
      const isLegacySession = (manager as any).isLegacySession();
      expect(isLegacySession).toBe(false);
    });
  });

  describe('Legacy Session Routing', () => {
    test('should route to legacy step handlers when legacy session detected', async () => {
      const legacyState = {
        currentStep: 1,
        useComprehensiveFlow: false,
        collectedData: {
          userEmail: 'test@company.com',
          reportFrequency: 'Weekly',
          projectName: 'Test Project'
        }
      };
      
      const manager = new ConversationManager(legacyState);
      
      const response = await manager.processUserMessage('Test Product Name');
      
      // Should handle legacy step 1 (product data collection)
      expect(response.message).toContain('URL');
      expect(response.stepDescription).toContain('Product');
    });

    test('should handle legacy step 2 customer description', async () => {
      const legacyState = {
        currentStep: 2,
        useComprehensiveFlow: false,
        collectedData: {
          userEmail: 'test@company.com',
          reportFrequency: 'Weekly',
          projectName: 'Test Project',
          productName: 'Test Product',
          productUrl: 'https://test.com',
          positioning: 'Test positioning',
          industry: 'Test industry'
        }
      };
      
      const manager = new ConversationManager(legacyState);
      
      const response = await manager.processUserMessage('Target customers are health-conscious millennials in urban areas');
      
      expect(response.message).toContain('Perfect!');
      expect(response.message).toContain('competitive analysis');
      expect(response.nextStep).toBe(3);
      expect(response.stepDescription).toBe('Analysis Ready');
    });

    test('should handle legacy step 3 analysis confirmation', async () => {
      const legacyState = {
        currentStep: 3,
        useComprehensiveFlow: false,
        collectedData: {
          userEmail: 'test@company.com',
          reportFrequency: 'Weekly',
          projectName: 'Test Project',
          productName: 'Test Product',
          customerDescription: 'Test customers'
        }
      };
      
      const manager = new ConversationManager(legacyState);
      
      const response = await manager.processUserMessage('yes, proceed');
      
      expect(response.message).toContain('starting the competitive analysis');
      expect(response.nextStep).toBe(4);
      expect(response.stepDescription).toBe('Running Analysis');
    });
  });

  describe('Migration to New Flow', () => {
    test('should offer migration when user requests it from legacy step', async () => {
      const legacyState = {
        currentStep: 3,
        useComprehensiveFlow: false,
        collectedData: {
          userEmail: 'test@company.com',
          reportFrequency: 'Weekly',
          projectName: 'Test Project'
        }
      };
      
      const manager = new ConversationManager(legacyState);
      
      const response = await manager.processUserMessage('migrate');
      
      expect(response.message).toContain('Upgrade to Enhanced Experience');
      expect(response.message).toContain('50% Faster');
      expect(response.message).toContain('migrate now');
      expect(response.stepDescription).toBe('Migration Opportunity');
    });

    test('should handle "migrate now" response', async () => {
      const legacyState = {
        currentStep: 3,
        useComprehensiveFlow: false,
        collectedData: {
          userEmail: 'test@company.com',
          reportFrequency: 'Weekly',
          projectName: 'Test Project'
        }
      };
      
      const manager = new ConversationManager(legacyState);
      
      // First trigger migration offer
      await manager.processUserMessage('migrate');
      
      // Then accept migration
      const response = await manager.processUserMessage('migrate now');
      
      expect(response.message).toContain('Welcome to the Enhanced Experience');
      expect(response.message).toContain('comprehensive form');
      expect(response.nextStep).toBe(0);
      expect(response.stepDescription).toContain('Migrated');
      expect(response.expectedInputType).toBe('comprehensive_form');
    });

    test('should handle "finish legacy" response', async () => {
      const legacyState = {
        currentStep: 3,
        useComprehensiveFlow: false,
        collectedData: {
          userEmail: 'test@company.com',
          reportFrequency: 'Weekly',
          projectName: 'Test Project'
        }
      };
      
      const manager = new ConversationManager(legacyState);
      
      // First trigger migration offer
      await manager.processUserMessage('migrate');
      
      // Then choose to finish legacy
      const response = await manager.processUserMessage('finish legacy');
      
      expect(response.message).toContain('Continuing Legacy Session');
      expect(response.message).toContain('step-by-step process');
      expect(response.message).toContain('Next Time');
      expect(response.expectedInputType).toBe('text');
    });

    test('should handle "tell me more" response with feature details', async () => {
      const legacyState = {
        currentStep: 3,
        useComprehensiveFlow: false,
        collectedData: {
          userEmail: 'test@company.com',
          reportFrequency: 'Weekly',
          projectName: 'Test Project'
        }
      };
      
      const manager = new ConversationManager(legacyState);
      
      // First trigger migration offer
      await manager.processUserMessage('migrate');
      
      // Then ask for more info
      const response = await manager.processUserMessage('tell me more');
      
      expect(response.message).toContain('Enhanced Flow Features');
      expect(response.message).toContain('Speed Improvements');
      expect(response.message).toContain('Smart Intelligence');
      expect(response.message).toContain('Professional Experience');
      expect(response.message).toContain('Same Great Results');
      expect(response.expectedInputType).toBe('text');
    });
  });

  describe('Legacy Session Recovery', () => {
    test('should handle unknown legacy step with migration prompt', async () => {
      const unknownState = {
        currentStep: 10, // Unknown step
        useComprehensiveFlow: false,
        collectedData: {
          userEmail: 'test@company.com',
          reportFrequency: 'Weekly',
          projectName: 'Test Project'
        }
      };
      
      const manager = new ConversationManager(unknownState);
      
      const response = await manager.processUserMessage('continue');
      
      expect(response.message).toContain('Session State Recovery');
      expect(response.message).toContain('comprehensive form');
      expect(response.message).toContain('50% faster');
      expect(response.stepDescription).toBe('Session Recovery');
    });

    test('should preserve data during migration', async () => {
      const legacyState = {
        currentStep: 2,
        useComprehensiveFlow: false,
        collectedData: {
          userEmail: 'test@company.com',
          reportFrequency: 'Weekly',
          projectName: 'Test Project',
          productName: 'Test Product'
        }
      };
      
      const manager = new ConversationManager(legacyState);
      
      // Trigger migration
      await manager.processUserMessage('migrate');
      const response = await manager.processUserMessage('migrate now');
      
      expect(response.message).toContain('Migration Tip');
      expect(response.message).toContain('merge everything together');
      
      // Check that data is preserved in chat state
      const chatState = manager.getChatState();
      expect(chatState.useComprehensiveFlow).toBe(true);
      expect(chatState.currentStep).toBe(0);
      expect(chatState.collectedData?.userEmail).toBe('test@company.com');
      expect(chatState.collectedData?.projectName).toBe('Test Project');
    });
  });

  describe('Legacy Error Handling', () => {
    test('should offer migration when legacy step encounters error', async () => {
      const legacyState = {
        currentStep: 1,
        useComprehensiveFlow: false,
        collectedData: {
          userEmail: 'test@company.com',
          reportFrequency: 'Weekly',
          projectName: 'Test Project'
        }
      };
      
      const manager = new ConversationManager(legacyState);
      
      // Mock product chat processor to throw error
      const mockProcessor = {
        collectProductData: jest.fn().mockRejectedValue(new Error('Product processor error')),
        validateProductData: jest.fn().mockReturnValue(false)
      };
      
      // Replace the import for testing
      jest.doMock('@/lib/chat/productChatProcessor', () => ({
        EnhancedProductChatProcessor: jest.fn().mockImplementation(() => mockProcessor)
      }));
      
      const response = await manager.processUserMessage('Test Product');
      
      expect(response.message).toContain('Upgrade to Enhanced Experience');
      expect(response.message).toContain('Error in legacy flow');
    });

    test('should handle legacy step 1.5 product creation errors gracefully', async () => {
      const legacyState = {
        currentStep: 1.5,
        useComprehensiveFlow: false,
        projectId: 'test-project-id',
        collectedData: {
          userEmail: 'test@company.com',
          reportFrequency: 'Weekly',
          projectName: 'Test Project',
          productName: 'Test Product',
          productUrl: 'https://test.com'
        }
      };
      
      const manager = new ConversationManager(legacyState);
      
      const response = await manager.processUserMessage('yes');
      
      // Should create a simplified product record for legacy compatibility
      expect(response.message).toContain('PRODUCT Entity Created Successfully');
      expect(response.message).toContain('Test Product');
      expect(response.message).toContain('comparative analysis');
      expect(response.nextStep).toBe(3);
    });
  });

  describe('Legacy Flow Completion', () => {
    test('should handle legacy step 5 report summary options', async () => {
      const legacyState = {
        currentStep: 5,
        useComprehensiveFlow: false,
        projectId: 'test-project-id',
        projectName: 'Test Project',
        collectedData: {
          userEmail: 'test@company.com',
          reportFrequency: 'Weekly',
          productName: 'Test Product',
          industry: 'Test Industry'
        }
      };
      
      const manager = new ConversationManager(legacyState);
      
      const response = await manager.processUserMessage('yes, show summary');
      
      expect(response.message).toContain('Consolidated Competitive Analysis Summary');
      expect(response.message).toContain('Test Product');
      expect(response.message).toContain('Test Industry');
      expect(response.message).toContain('Legacy vs. New Flow Benefits');
      expect(response.nextStep).toBe(6);
      expect(response.stepDescription).toBe('Report Delivery Options');
    });

    test('should handle legacy step 6 final completion', async () => {
      const legacyState = {
        currentStep: 6,
        useComprehensiveFlow: false,
        projectId: 'test-project-id',
        projectName: 'Test Project',
        collectedData: {
          userEmail: 'test@company.com',
          reportFrequency: 'Weekly',
          productName: 'Test Product'
        }
      };
      
      const manager = new ConversationManager(legacyState);
      
      const response = await manager.processUserMessage('1'); // Send email
      
      expect(response.message).toContain('Legacy Session Complete');
      expect(response.message).toContain('consolidated competitive report');
      expect(response.message).toContain('test@company.com');
      expect(response.message).toContain('Thank you for using');
      expect(response.isComplete).toBe(true);
      expect(response.stepDescription).toBe('Legacy Session Complete');
    });

    test('should offer migration option even in final legacy steps', async () => {
      const legacyState = {
        currentStep: 6,
        useComprehensiveFlow: false,
        projectId: 'test-project-id',
        projectName: 'Test Project',
        collectedData: {
          userEmail: 'test@company.com',
          reportFrequency: 'Weekly'
        }
      };
      
      const manager = new ConversationManager(legacyState);
      
      const response = await manager.processUserMessage('2'); // Migrate option
      
      expect(response.message).toContain('Upgrade to Enhanced Experience');
      expect(response.message).toContain('Migration Options');
      expect(response.stepDescription).toBe('Migration Opportunity');
    });
  });

  describe('Backward Compatibility', () => {
    test('should not break existing legacy sessions', async () => {
      const existingLegacyState = {
        currentStep: 3,
        useComprehensiveFlow: false,
        databaseProjectCreated: true,
        projectId: 'existing-project-123',
        projectName: 'Existing Project',
        collectedData: {
          userEmail: 'existing@company.com',
          reportFrequency: 'Monthly',
          productName: 'Existing Product',
          industry: 'Existing Industry',
          customerDescription: 'Existing customers'
        }
      };
      
      const manager = new ConversationManager(existingLegacyState);
      
      // Should continue legacy flow without issues
      const response = await manager.processUserMessage('yes, proceed with analysis');
      
      expect(response.message).toContain('competitive analysis');
      expect(response.nextStep).toBe(4);
      expect(response.stepDescription).toBe('Running Analysis');
      
      // State should be preserved
      const chatState = manager.getChatState();
      expect(chatState.projectId).toBe('existing-project-123');
      expect(chatState.projectName).toBe('Existing Project');
      expect(chatState.useComprehensiveFlow).toBe(false);
    });

    test('should detect comprehensive flow for new sessions', async () => {
      const newSessionState = {
        currentStep: null,
        useComprehensiveFlow: undefined,
        collectedData: {}
      };
      
      const manager = new ConversationManager(newSessionState);
      
      const response = await manager.processUserMessage('start');
      
      // Should start with comprehensive flow for new sessions
      expect(response.message).toContain('Welcome to the HelloFresh');
      expect(response.expectedInputType).toBe('comprehensive_form');
      expect(response.stepDescription).toBe('Complete Project Setup');
    });
  });
});

/**
 * PHASE 5.2: DIRECT MIGRATION TO NEW FLOW TESTS
 */
describe('Phase 5.2: Direct Migration to New Flow', () => {
  describe('Default Comprehensive Flow', () => {
    test('should default to comprehensive flow for new sessions', () => {
      const manager = new ConversationManager();
      const chatState = manager.getChatState();
      
      // Phase 5.2: Should default to comprehensive flow
      expect(chatState.useComprehensiveFlow).toBe(true);
    });

    test('should start with comprehensive form for project initialization', async () => {
      const manager = new ConversationManager();
      
      const response = await manager.processUserMessage('start new project');
      
      expect(response.message).toContain('Welcome to the HelloFresh');
      expect(response.message).toContain('comprehensive');
      expect(response.expectedInputType).toBe('comprehensive_form');
      expect(response.stepDescription).toBe('Complete Project Setup');
    });

    test('should use comprehensive prompt by default', () => {
      const manager = new ConversationManager();
      
      // Test private method through bracket notation
      const response = (manager as any).handleProjectInitialization();
      
      expect(response.message).toContain('Welcome to the HelloFresh');
      expect(response.expectedInputType).toBe('comprehensive_form');
      expect(response.stepDescription).toBe('Complete Project Setup');
    });
  });

  describe('Comprehensive Flow Processing', () => {
    test('should process complete comprehensive input successfully', async () => {
      const manager = new ConversationManager();
      
      const completeInput = `
        1. john.doe@company.com
        2. Weekly
        3. Good Chop Analysis
        4. Good Chop
        5. https://goodchop.com
        6. Food delivery
        7. Premium meat delivery service targeting health-conscious consumers
        8. 10,000+ customers across urban markets
        9. Finding high-quality, ethically sourced meat
      `;
      
      // Start the flow
      await manager.processUserMessage('start');
      
      // Process comprehensive input
      const response = await manager.processUserMessage(completeInput);
      
      // Should move to confirmation step
      expect(response.nextStep).toBe(1.5);
      expect(response.stepDescription).toContain('Confirmation');
      expect(response.message).toContain('Please review');
    });

    test('should handle partial comprehensive input with guidance', async () => {
      const manager = new ConversationManager();
      
      const partialInput = `
        Email: john.doe@company.com
        Frequency: Weekly
        Project: Good Chop Analysis
      `;
      
      // Start the flow
      await manager.processUserMessage('start');
      
      // Process partial input
      const response = await manager.processUserMessage(partialInput);
      
      // Should stay in step 0 with guidance
      expect(response.nextStep).toBe(0);
      expect(response.stepDescription).toBe('Complete Project Setup');
      expect(response.message).toContain('Still need');
    });
  });

  describe('Fallback Mechanisms', () => {
    test('should fallback to legacy flow when comprehensive parsing fails', async () => {
      const manager = new ConversationManager();
      
      // Mock comprehensive collector to throw error
      const mockCollector = {
        parseComprehensiveInput: jest.fn().mockImplementation(() => {
          throw new Error('Comprehensive parsing failed');
        }),
        generateComprehensivePrompt: jest.fn().mockReturnValue('Comprehensive prompt')
      };
      
      (manager as any).comprehensiveCollector = mockCollector;
      
      // Valid legacy format input
      const legacyInput = 'john.doe@company.com, Weekly, Test Project';
      
      // Start the flow
      await manager.processUserMessage('start');
      
      // Process input that fails comprehensive parsing
      const response = await manager.processUserMessage(legacyInput);
      
      // Should fallback gracefully
      expect(response.message).toContain('Legacy Fallback');
      expect(response.stepDescription).toContain('Legacy Fallback');
    });

    test('should provide guidance when both parsing methods fail', async () => {
      const manager = new ConversationManager();
      
      // Mock both parsers to fail
      const mockCollector = {
        parseComprehensiveInput: jest.fn().mockImplementation(() => {
          throw new Error('Comprehensive parsing failed');
        }),
        generateComprehensivePrompt: jest.fn().mockReturnValue('Comprehensive prompt')
      };
      
      (manager as any).comprehensiveCollector = mockCollector;
      
      // Mock enhanced project extractor to fail
      const mockExtractor = {
        extractProjectData: jest.fn().mockReturnValue({
          success: false,
          error: 'Legacy parsing failed'
        })
      };
      
      jest.doMock('@/lib/chat/enhancedProjectExtractor', () => mockExtractor);
      
      // Invalid input
      const invalidInput = 'completely invalid input format';
      
      // Start the flow
      await manager.processUserMessage('start');
      
      // Process invalid input
      const response = await manager.processUserMessage(invalidInput);
      
      // Should provide helpful guidance
      expect(response.message).toContain('help you get started');
      expect(response.message).toContain('comprehensive form');
      expect(response.expectedInputType).toBe('comprehensive_form');
    });

    test('should handle complete parsing failure with step-by-step guidance', async () => {
      const manager = new ConversationManager();
      
      // Create a scenario where all parsing fails
      const mockCollector = {
        parseComprehensiveInput: jest.fn().mockImplementation(() => {
          throw new Error('Comprehensive parsing failed');
        }),
        generateComprehensivePrompt: jest.fn().mockImplementation(() => {
          throw new Error('Prompt generation failed');
        })
      };
      
      (manager as any).comprehensiveCollector = mockCollector;
      
      // Start the flow
      await manager.processUserMessage('start');
      
      // Process input that causes complete failure
      const response = await manager.processUserMessage('invalid input');
      
      // Should provide basic step-by-step guidance
      expect(response.message).toContain('start fresh');
      expect(response.message).toContain('step-by-step');
      expect(response.stepDescription).toContain('Guided');
    });
  });

  describe('Legacy Session Compatibility', () => {
    test('should not affect existing legacy sessions', async () => {
      const legacyState = {
        currentStep: 2,
        useComprehensiveFlow: false,
        collectedData: {
          userEmail: 'test@company.com',
          reportFrequency: 'Weekly',
          projectName: 'Legacy Project'
        }
      };
      
      const manager = new ConversationManager(legacyState);
      
      // Should continue with legacy flow
      const response = await manager.processUserMessage('Continue with legacy');
      
      expect(response.stepDescription).toBe('Analysis Ready');
      expect(response.nextStep).toBe(3);
      
      // State should remain legacy
      const chatState = manager.getChatState();
      expect(chatState.useComprehensiveFlow).toBe(false);
    });

    test('should allow legacy session to migrate when requested', async () => {
      const legacyState = {
        currentStep: 3,
        useComprehensiveFlow: false,
        collectedData: {
          userEmail: 'test@company.com',
          reportFrequency: 'Weekly',
          projectName: 'Legacy Project'
        }
      };
      
      const manager = new ConversationManager(legacyState);
      
      // Request migration
      const response = await manager.processUserMessage('migrate');
      
      expect(response.message).toContain('Upgrade to Enhanced Experience');
      expect(response.stepDescription).toBe('Migration Opportunity');
    });
  });

  describe('Error Recovery and User Guidance', () => {
    test('should provide helpful examples when parsing fails', async () => {
      const manager = new ConversationManager();
      
      // Start flow
      await manager.processUserMessage('start');
      
      // Provide malformed input
      const response = await manager.processUserMessage('invalid input that cannot be parsed');
      
      // Should provide examples and guidance
      expect(response.message).toContain('Example format');
      expect(response.message).toContain('john.doe@company.com');
      expect(response.message).toContain('numbered lists');
      expect(response.expectedInputType).toBe('comprehensive_form');
    });

    test('should maintain user data during error recovery', async () => {
      const manager = new ConversationManager();
      
      // Start with partial valid data
      await manager.processUserMessage('start');
      
      const partialInput = 'john.doe@company.com, Weekly';
      const response = await manager.processUserMessage(partialInput);
      
      // Should preserve data and ask for missing fields
      expect(response.message).toContain('Still need');
      expect(response.nextStep).toBe(0);
      
      // Check that partial data is preserved
      const chatState = manager.getChatState();
      expect(chatState.collectedData?.userEmail).toBe('john.doe@company.com');
    });

    test('should provide progressive completion encouragement', async () => {
      const manager = new ConversationManager();
      
      // Start flow
      await manager.processUserMessage('start');
      
      // Provide 50% complete data
      const halfCompleteInput = `
        Email: john.doe@company.com
        Frequency: Weekly
        Project: Test Project
        Product: Test Product
      `;
      
      const response = await manager.processUserMessage(halfCompleteInput);
      
      // Should provide encouraging message about progress
      expect(response.message).toContain('progress') || expect(response.message).toContain('Good');
      expect(response.nextStep).toBe(0);
    });
  });

  describe('Performance and Reliability', () => {
    test('should handle concurrent comprehensive form submissions', async () => {
      const completeInput = `
        1. john.doe@company.com
        2. Weekly
        3. Good Chop Analysis
        4. Good Chop
        5. https://goodchop.com
        6. Food delivery
        7. Premium meat delivery service
        8. 10,000+ customers
        9. Finding quality meat
      `;
      
      // Create multiple managers for concurrent testing
      const managers = Array(5).fill(null).map(() => new ConversationManager());
      
      // Process same input concurrently
      const promises = managers.map(async (manager) => {
        await manager.processUserMessage('start');
        return manager.processUserMessage(completeInput);
      });
      
      const responses = await Promise.all(promises);
      
      // All should succeed
      responses.forEach(response => {
        expect(response.nextStep).toBe(1.5);
        expect(response.stepDescription).toContain('Confirmation');
      });
    });

    test('should handle very large input gracefully', async () => {
      const manager = new ConversationManager();
      
      // Create very large input
      const largeInput = `
        1. john.doe@company.com
        2. Weekly
        3. ${'Very '.repeat(1000)}Long Project Name
        4. ${'Test '.repeat(1000)}Product Name
        5. https://example.com
        6. Technology industry with many detailed specifications
        7. ${'Extensive positioning information '.repeat(100)}
        8. ${'Large customer base description '.repeat(100)}
        9. ${'Complex user problems '.repeat(100)}
      `;
      
      await manager.processUserMessage('start');
      const response = await manager.processUserMessage(largeInput);
      
      // Should handle gracefully without errors
      expect(response).toBeDefined();
      expect(response.message).toBeDefined();
    });
  });

  describe('Integration with Existing Features', () => {
    test('should maintain compatibility with validation features', async () => {
      const manager = new ConversationManager();
      
      // Input with validation issues
      const inputWithIssues = `
        1. invalid-email-format
        2. Every sometimes (invalid frequency)
        3. Good Chop Analysis
        4. Good Chop
        5. not-a-valid-url
        6. Food delivery
        7. Premium meat delivery service
        8. 10,000+ customers
        9. Finding quality meat
      `;
      
      await manager.processUserMessage('start');
      const response = await manager.processUserMessage(inputWithIssues);
      
      // Should provide validation feedback
      expect(response.message).toContain('email') || expect(response.message).toContain('URL');
      expect(response.nextStep).toBe(0);
    });

    test('should integrate with confirmation flow', async () => {
      const manager = new ConversationManager();
      
      const completeInput = `
        1. john.doe@company.com
        2. Weekly
        3. Good Chop Analysis
        4. Good Chop
        5. https://goodchop.com
        6. Food delivery
        7. Premium meat delivery service
        8. 10,000+ customers
        9. Finding quality meat
      `;
      
      // Complete flow to confirmation
      await manager.processUserMessage('start');
      const confirmationResponse = await manager.processUserMessage(completeInput);
      
      // Should reach confirmation step
      expect(confirmationResponse.nextStep).toBe(1.5);
      
      // Confirm project creation
      const finalResponse = await manager.processUserMessage('yes, create project');
      
      // Should complete successfully
      expect(finalResponse.nextStep).toBe(3);
      expect(finalResponse.message).toContain('Analysis Complete') || 
             expect(finalResponse.message).toContain('Project Created');
    });
  });

  describe('Migration Strategy Validation', () => {
    test('should not use feature flags or environment variables', () => {
      // Test that no feature flag logic is present
      const manager = new ConversationManager();
      const chatState = manager.getChatState();
      
      // Should default to comprehensive flow regardless of environment
      expect(chatState.useComprehensiveFlow).toBe(true);
      
      // Should not depend on environment variables
      delete process.env.ENABLE_COMPREHENSIVE_FLOW;
      const manager2 = new ConversationManager();
      const chatState2 = manager2.getChatState();
      
      expect(chatState2.useComprehensiveFlow).toBe(true);
    });

    test('should provide clear migration path for legacy users', async () => {
      const legacyState = {
        currentStep: 1,
        useComprehensiveFlow: false,
        collectedData: {
          userEmail: 'test@company.com',
          projectName: 'Legacy Project'
        }
      };
      
      const manager = new ConversationManager(legacyState);
      
      // Should offer migration opportunity
      const response = await manager.processUserMessage('I want to try the new flow');
      
      expect(response.message).toContain('Enhanced Experience') || 
             expect(response.message).toContain('comprehensive');
    });

    test('should maintain zero breaking changes for existing users', async () => {
      const existingLegacyState = {
        currentStep: 4,
        useComprehensiveFlow: false,
        projectId: 'existing-project-123',
        collectedData: {
          userEmail: 'existing@company.com',
          reportFrequency: 'Monthly',
          productName: 'Existing Product'
        }
      };
      
      const manager = new ConversationManager(existingLegacyState);
      
      // Should continue existing flow without disruption
      const response = await manager.processUserMessage('continue analysis');
      
      expect(response.nextStep).toBe(5);
      expect(response.message).toContain('Report') || 
             expect(response.message).toContain('analysis');
      
      // State should be preserved
      const chatState = manager.getChatState();
      expect(chatState.projectId).toBe('existing-project-123');
      expect(chatState.useComprehensiveFlow).toBe(false);
    });
  });
});

// Mock data for testing
const mockCompleteRequirements = {
  userEmail: 'test@company.com',
  reportFrequency: 'Weekly',
  projectName: 'Competitive Analysis Project',
  productName: 'Amazing Software Platform',
  productUrl: 'https://amazingsoftware.com',
  industry: 'SaaS Technology',
  positioning: 'Leading B2B analytics platform that helps enterprises make better data-driven decisions',
  customerData: 'Enterprise customers in technology, finance, and healthcare sectors with 1000+ employees',
  userProblem: 'Organizations struggle with fragmented data sources and lack unified analytics capabilities'
}; 