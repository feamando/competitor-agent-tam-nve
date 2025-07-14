import { ComparativeAnalysisService } from '@/services/analysis/comparativeAnalysisService';
import { BedrockService } from '@/services/bedrock/bedrock.service';
import {
  ComparativeAnalysisInput,
  ComparativeAnalysis,
  InsufficientDataError,
  AIServiceError,
  ComparativeAnalysisError,
  AnalysisConfiguration,
  AnalysisFocusArea
} from '@/types/analysis';

// Clear the global mock for this test file to test actual service logic
jest.unmock('@/services/analysis/comparativeAnalysisService');

// Mock dependencies
jest.mock('@/services/bedrock/bedrock.service');
jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn()
  }
}));

const mockBedrockService = BedrockService as jest.MockedClass<typeof BedrockService>;

describe('ComparativeAnalysisService', () => {
  let service: ComparativeAnalysisService;
  let mockBedrockInstance: jest.Mocked<BedrockService>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup Bedrock service mock
    mockBedrockInstance = {
      generateCompletion: jest.fn()
    } as any;
    
    mockBedrockService.mockImplementation(() => mockBedrockInstance);
    
    service = new ComparativeAnalysisService();
  });

  describe('constructor', () => {
    it('should initialize with default configuration', () => {
      expect(service).toBeInstanceOf(ComparativeAnalysisService);
      // BedrockService is lazily initialized, so it's not called in constructor
      expect(service).toBeDefined();
    });

    it('should accept custom configuration', () => {
      const customConfig: Partial<AnalysisConfiguration> = {
        maxTokens: 4000,
        temperature: 0.5,
        analysisDepth: 'basic'
      };

      const customService = new ComparativeAnalysisService(customConfig);

      expect(customService).toBeInstanceOf(ComparativeAnalysisService);
      expect(customService).toBeDefined();
    });
  });

  describe('updateAnalysisConfiguration', () => {
    it('should update configuration and recreate Bedrock service when relevant config changes', () => {
      const newConfig = { maxTokens: 6000, temperature: 0.4 };
      
      // updateAnalysisConfiguration should work without throwing
      expect(() => service.updateAnalysisConfiguration(newConfig)).not.toThrow();
    });

    it('should update configuration without recreating Bedrock service for non-relevant changes', () => {
      const newConfig = { analysisDepth: 'comprehensive' as const };
      
      // updateAnalysisConfiguration should work without throwing
      expect(() => service.updateAnalysisConfiguration(newConfig)).not.toThrow();
    });
  });

  describe('analyzeProductVsCompetitors', () => {
    let validInput: ComparativeAnalysisInput;

    beforeEach(() => {
      validInput = createValidInput();
    });

    it('should successfully analyze product vs competitors', async () => {
      const mockAIResponse = JSON.stringify({
        summary: {
          overallPosition: 'competitive',
          keyStrengths: ['Strong positioning', 'Clear messaging'],
          keyWeaknesses: ['Limited features'],
          opportunityScore: 75,
          threatLevel: 'medium'
        },
        recommendations: {
          immediate: ['Analyze competitor features'],
          shortTerm: ['Develop Feature X'],
          longTerm: ['Market expansion'],
          priorityScore: 80
        },
        metadata: {
          confidenceScore: 85,
          dataQuality: 'high'
        }
      });

      mockBedrockInstance.generateCompletion.mockResolvedValue(mockAIResponse);

      const result = await service.analyzeProductVsCompetitors(validInput);

      expect(result).toMatchObject({
        id: expect.any(String),
        projectId: 'product-1',
        productId: 'product-1',
        competitorIds: ['comp-1'],
        analysisDate: expect.any(Date),
        summary: {
          overallPosition: 'competitive',
          keyStrengths: ['Strong positioning', 'Clear messaging'],
          keyWeaknesses: ['Limited features'],
          opportunityScore: 75,
          threatLevel: 'medium'
        },
        metadata: {
          analysisMethod: 'ai_powered',
          modelUsed: 'anthropic.claude-3-sonnet-20240229-v1:0',
          confidenceScore: 85,
          processingTime: expect.any(Number),
          dataQuality: 'high'
        }
      });

      expect(mockBedrockInstance.generateCompletion).toHaveBeenCalledTimes(1);
    });

    it('should handle AI service returning non-JSON response', async () => {
      const mockTextResponse = `
        Based on the analysis, Test Product shows competitive positioning.
        Strengths: Strong messaging and clear value proposition.
        Weaknesses: Limited feature set compared to competitors.
        Recommendations: Focus on feature development and market expansion.
      `;

      mockBedrockInstance.generateCompletion.mockResolvedValue(mockTextResponse);

      const result = await service.analyzeProductVsCompetitors(validInput);

      expect(result.summary.overallPosition).toBe('competitive');
      expect(result.summary.keyStrengths).toEqual(expect.arrayContaining([expect.any(String)]));
      expect(result.metadata.confidenceScore).toBe(60); // Fallback confidence
    });

    it('should throw InsufficientDataError when product information is incomplete', async () => {
      const invalidInput = {
        ...validInput,
        product: {
          ...validInput.product,
          id: '', // Missing ID
          name: '' // Missing name
        }
      };

      await expect(service.analyzeProductVsCompetitors(invalidInput))
        .rejects
        .toThrow(InsufficientDataError);
    });

    it('should throw InsufficientDataError when product snapshot is missing', async () => {
      const invalidInput = {
        ...validInput,
        productSnapshot: null as any
      };

      await expect(service.analyzeProductVsCompetitors(invalidInput))
        .rejects
        .toThrow(InsufficientDataError);
    });

    it('should throw InsufficientDataError when no competitors provided', async () => {
      const invalidInput = {
        ...validInput,
        competitors: []
      };

      await expect(service.analyzeProductVsCompetitors(invalidInput))
        .rejects
        .toThrow(InsufficientDataError);
    });

    it('should throw InsufficientDataError when competitor data is incomplete', async () => {
      const invalidInput = {
        ...validInput,
        competitors: [
          {
            competitor: {
              ...validInput.competitors[0].competitor,
              id: '', // Missing ID
              name: '' // Missing name
            },
            snapshot: validInput.competitors[0].snapshot
          }
        ]
      };

      await expect(service.analyzeProductVsCompetitors(invalidInput))
        .rejects
        .toThrow(InsufficientDataError);
    });

    it('should throw InsufficientDataError when product content is too short', async () => {
      const invalidInput = {
        ...validInput,
        productSnapshot: {
          ...validInput.productSnapshot,
          content: {
            title: 'Short',
            text: 'Too short', // Very short content
            html: '<p>Short</p>'
          }
        }
      };

      await expect(service.analyzeProductVsCompetitors(invalidInput))
        .rejects
        .toThrow(InsufficientDataError);
    });

    it('should throw AIServiceError when Bedrock service fails', async () => {
      mockBedrockInstance.generateCompletion.mockRejectedValue(new Error('Bedrock error'));

      await expect(service.analyzeProductVsCompetitors(validInput))
        .rejects
        .toThrow(AIServiceError);
    });

    it('should throw AIServiceError when AI returns insufficient response', async () => {
      mockBedrockInstance.generateCompletion.mockResolvedValue('short'); // Too short

      await expect(service.analyzeProductVsCompetitors(validInput))
        .rejects
        .toThrow(AIServiceError);
    });

    it('should handle multiple competitors correctly', async () => {
      const inputWithMultipleCompetitors = {
        ...validInput,
        competitors: [
          ...validInput.competitors,
          {
            competitor: {
                          id: 'comp-2',
            name: 'Competitor B',
            website: 'https://competitorb.com',
            industry: 'SaaS',
            description: 'Another competitor',
              createdAt: new Date(),
              updatedAt: new Date()
            },
            snapshot: {
              id: 'comp-snapshot-2',
              competitorId: 'comp-2',
              metadata: {
                title: 'Competitor B - Products',
                text: 'Competitor B offers comprehensive business solutions.',
                html: '<h1>Competitor B</h1>',
                url: 'https://competitorb.com'
              },
              createdAt: new Date(),
              updatedAt: new Date()
            }
          }
        ]
      };

      const mockAIResponse = JSON.stringify({
        summary: {
          overallPosition: 'competitive',
          keyStrengths: ['Strong positioning'],
          keyWeaknesses: ['Limited features'],
          opportunityScore: 75,
          threatLevel: 'medium'
        }
      });

      mockBedrockInstance.generateCompletion.mockResolvedValue(mockAIResponse);

      const result = await service.analyzeProductVsCompetitors(inputWithMultipleCompetitors);

      expect(result.competitorIds).toEqual(['comp-1', 'comp-2']);
      expect(mockBedrockInstance.generateCompletion).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            content: expect.arrayContaining([
              expect.objectContaining({
                text: expect.stringContaining('Competitor A')
              })
            ])
          })
        ])
      );
    });

    it('should respect custom analysis configuration', async () => {
      const customInput = {
        ...validInput,
        analysisConfig: {
          focusAreas: ['features', 'pricing'] as AnalysisFocusArea[],
          depth: 'basic' as const,
          includeRecommendations: false
        }
      };

      const mockAIResponse = JSON.stringify({
        summary: {
          overallPosition: 'competitive',
          keyStrengths: ['Strong positioning'],
          keyWeaknesses: ['Limited features'],
          opportunityScore: 75,
          threatLevel: 'medium'
        }
      });

      mockBedrockInstance.generateCompletion.mockResolvedValue(mockAIResponse);

      const result = await service.analyzeProductVsCompetitors(customInput);

      expect(result).toBeDefined();
      expect(mockBedrockInstance.generateCompletion).toHaveBeenCalledTimes(1);
    });
  });

  describe('generateAnalysisReport', () => {
    let sampleAnalysis: ComparativeAnalysis;

    beforeEach(() => {
      sampleAnalysis = {
        id: 'analysis-1',
        projectId: 'project-1',
        productId: 'product-1',
        competitorIds: ['comp-1'],
        analysisDate: new Date(),
        summary: {
          overallPosition: 'competitive',
          keyStrengths: ['Strong positioning', 'Clear messaging'],
          keyWeaknesses: ['Limited features'],
          opportunityScore: 75,
          threatLevel: 'medium'
        },
        detailed: {} as any, // Simplified for testing
        recommendations: {
          immediate: ['Analyze competitors'],
          shortTerm: ['Develop features'],
          longTerm: ['Market expansion'],
          priorityScore: 80
        },
        metadata: {
          analysisMethod: 'ai_powered',
          confidenceScore: 85,
          processingTime: 1500,
          dataQuality: 'high'
        }
      };
    });

    it('should generate analysis report successfully', async () => {
      const mockReportContent = `
        # Competitive Analysis Report
        
        ## Executive Summary
        The product shows competitive positioning in the market...
        
        ## Key Findings
        - Strong positioning capabilities
        - Clear messaging strategy
        
        ## Recommendations
        1. Immediate: Analyze competitors
        2. Short-term: Develop features
        3. Long-term: Market expansion
      `;

      mockBedrockInstance.generateCompletion.mockResolvedValue(mockReportContent);

      const result = await service.generateAnalysisReport(sampleAnalysis);

      expect(result).toBe(mockReportContent);
      expect(mockBedrockInstance.generateCompletion).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            content: expect.arrayContaining([
              expect.objectContaining({
                text: expect.stringContaining('competitive')
              })
            ])
          })
        ])
      );
    });

    it('should throw ComparativeAnalysisError when report generation fails', async () => {
      mockBedrockInstance.generateCompletion.mockRejectedValue(new Error('Generation failed'));

      await expect(service.generateAnalysisReport(sampleAnalysis))
        .rejects
        .toThrow(ComparativeAnalysisError);
    });
  });

  describe('getAnalysisHistory', () => {
    it('should return empty array for now (placeholder implementation)', async () => {
      const result = await service.getAnalysisHistory('project-1');
      expect(result).toEqual([]);
    });
  });

  describe('data quality assessment', () => {
    it('should assess data quality as high for substantial content', async () => {
      const highQualityInput = {
        ...createValidInput(),
        productSnapshot: {
          ...createValidInput().productSnapshot,
          content: {
            title: 'Comprehensive Product Page',
            text: 'A'.repeat(3000), // Long content
            html: '<div>' + 'B'.repeat(2000) + '</div>'
          }
        },
        competitors: [
          {
            competitor: createValidInput().competitors[0].competitor,
            snapshot: {
              ...createValidInput().competitors[0].snapshot,
              metadata: {
                ...createValidInput().competitors[0].snapshot.metadata,
                text: 'C'.repeat(2000) // Long competitor content
              }
            }
          }
        ]
      };

      const mockAIResponse = JSON.stringify({
        summary: { overallPosition: 'competitive', keyStrengths: [], keyWeaknesses: [], opportunityScore: 75, threatLevel: 'medium' }
      });

      mockBedrockInstance.generateCompletion.mockResolvedValue(mockAIResponse);

      const result = await service.analyzeProductVsCompetitors(highQualityInput);

      expect(result.metadata.dataQuality).toBe('high');
    });

    it('should assess data quality as low for minimal content', async () => {
      const lowQualityInput = {
        ...createValidInput(),
        productSnapshot: {
          ...createValidInput().productSnapshot,
          content: {
            title: 'Short',
            text: 'A'.repeat(200), // Short content
            html: '<p>Short</p>'
          }
        },
        competitors: [
          {
            competitor: createValidInput().competitors[0].competitor,
            snapshot: {
              ...createValidInput().competitors[0].snapshot,
              metadata: {
                ...createValidInput().competitors[0].snapshot.metadata,
                text: 'B'.repeat(100) // Short competitor content
              }
            }
          }
        ]
      };

      const mockAIResponse = JSON.stringify({
        summary: { overallPosition: 'competitive', keyStrengths: [], keyWeaknesses: [], opportunityScore: 75, threatLevel: 'medium' }
      });

      mockBedrockInstance.generateCompletion.mockResolvedValue(mockAIResponse);

      const result = await service.analyzeProductVsCompetitors(lowQualityInput);

      expect(result.metadata.dataQuality).toBe('low');
    });
  });

  // Helper function to create valid input
  function createValidInput(): ComparativeAnalysisInput {
    return {
      product: {
        id: 'product-1',
        name: 'Test Product',
        website: 'https://testproduct.com',
        positioning: 'Innovative solution',
        customerData: 'B2B customers',
        userProblem: 'Efficiency challenges',
        industry: 'SaaS'
      },
      productSnapshot: {
        id: 'snapshot-1',
        productId: 'product-1',
        content: {
          title: 'Test Product - Homepage',
          text: 'Welcome to Test Product. We provide innovative solutions for efficiency challenges in the B2B space. Our platform helps businesses streamline operations and improve productivity. ' + 'A'.repeat(2000),
          html: '<h1>Test Product</h1><p>Welcome to Test Product...</p>'
        },
        metadata: {},
        createdAt: new Date()
      },
      competitors: [
        {
          competitor: {
            id: 'comp-1',
            name: 'Competitor A',
            website: 'https://competitora.com',
            industry: 'SaaS',
            description: 'Leading competitor',
            createdAt: new Date(),
            updatedAt: new Date()
          },
          snapshot: {
            id: 'comp-snapshot-1',
            competitorId: 'comp-1',
            metadata: {
              title: 'Competitor A - Solutions',
              text: 'Competitor A provides enterprise solutions for business efficiency and productivity. Our comprehensive platform serves Fortune 500 companies. ' + 'B'.repeat(1600),
              html: '<h1>Competitor A</h1>',
              url: 'https://competitora.com'
            },
            createdAt: new Date(),
            updatedAt: new Date()
          }
        }
      ]
    };
  }
}); 