import { UserExperienceAnalyzer } from '../userExperienceAnalyzer';
import { Snapshot } from '@prisma/client';

// Mock the BedrockService
jest.mock('@/services/bedrock/bedrock.service', () => ({
  BedrockService: jest.fn().mockImplementation(() => ({
    generateCompletion: jest.fn().mockResolvedValue(JSON.stringify({
      executiveSummary: 'Test product shows strong UX fundamentals with room for improvement',
      productStrengths: ['Clean design', 'Fast loading'],
      productWeaknesses: ['Limited mobile optimization', 'Unclear navigation'],
      marketOpportunities: ['Mobile-first redesign', 'Enhanced accessibility'],
      strategicRecommendations: ['Implement responsive design', 'Add accessibility features'],
      detailedComparisons: [{
        competitorName: 'Test Competitor',
        competitorWebsite: 'https://competitor.com',
        strengths: ['Better mobile experience'],
        weaknesses: ['Slower loading times'],
        keyDifferences: ['Different navigation approach'],
        learnings: ['Mobile-first design principles']
      }],
      confidenceScore: 0.85
    }))
  }))
}));

// Mock logger
jest.mock('@/lib/logger', () => ({
  generateCorrelationId: jest.fn(() => 'test-correlation-id'),
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

describe('UserExperienceAnalyzer', () => {
  let analyzer: UserExperienceAnalyzer;
  let mockProductData: any;
  let mockCompetitorData: any[];

  beforeEach(() => {
    analyzer = new UserExperienceAnalyzer();
    
    mockProductData = {
      id: 'product-snapshot-1',
      productId: 'product-1',
      content: {
        title: 'Good Chop - Premium Meat Delivery',
        description: 'High-quality meat delivery service',
        features: ['Premium cuts', 'Fast delivery', 'Subscription options']
      },
      metadata: {
        scrapedAt: '2024-01-01T00:00:00Z',
        url: 'https://goodchop.com'
      },
      createdAt: new Date(),
      product: {
        name: 'Good Chop',
        website: 'https://goodchop.com'
      }
    };

    mockCompetitorData = [{
      id: 'snapshot-1',
      competitorId: 'competitor-1',
      metadata: {
        title: 'Competitor Meat Co',
        description: 'Another meat delivery service',
        features: ['Standard cuts', 'Weekly delivery']
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      competitor: {
        name: 'Competitor Meat Co',
        website: 'https://competitor.com'
      }
    }];
  });

  describe('analyzeProductVsCompetitors', () => {
    it('should generate UX analysis successfully', async () => {
      const result = await analyzer.analyzeProductVsCompetitors(
        mockProductData,
        mockCompetitorData
      );

      expect(result).toBeDefined();
      expect(result.summary).toBe('Test product shows strong UX fundamentals with room for improvement');
      expect(result.strengths).toEqual(['Clean design', 'Fast loading']);
      expect(result.weaknesses).toEqual(['Limited mobile optimization', 'Unclear navigation']);
      expect(result.opportunities).toEqual(['Mobile-first redesign', 'Enhanced accessibility']);
      expect(result.recommendations).toEqual(['Implement responsive design', 'Add accessibility features']);
      expect(result.competitorComparisons).toHaveLength(1);
      expect(result.confidence).toBe(0.85);
      expect(result.metadata.analysisType).toBe('ux_focused');
      expect(result.metadata.correlationId).toBe('test-correlation-id');
    });

    it('should handle analysis options correctly', async () => {
      const options = {
        focus: 'mobile' as const,
        includeTechnical: true,
        includeAccessibility: true,
        maxCompetitors: 2
      };

      const result = await analyzer.analyzeProductVsCompetitors(
        mockProductData,
        mockCompetitorData,
        options
      );

      expect(result).toBeDefined();
      expect(result.metadata.competitorCount).toBe(1);
    });

    it('should limit competitors based on maxCompetitors option', async () => {
      // Add more competitors
      const moreCompetitors = [
        ...mockCompetitorData,
        {
          id: 'snapshot-2',
          competitorId: 'competitor-2',
          metadata: { title: 'Competitor 2' },
          createdAt: new Date(),
          updatedAt: new Date(),
          competitor: { name: 'Competitor 2', website: 'https://competitor2.com' }
        },
        {
          id: 'snapshot-3',
          competitorId: 'competitor-3',
          metadata: { title: 'Competitor 3' },
          createdAt: new Date(),
          updatedAt: new Date(),
          competitor: { name: 'Competitor 3', website: 'https://competitor3.com' }
        }
      ];

      const result = await analyzer.analyzeProductVsCompetitors(
        mockProductData,
        moreCompetitors,
        { maxCompetitors: 2 }
      );

      expect(result).toBeDefined();
      expect(result.metadata.competitorCount).toBe(2);
    });

    it('should handle malformed AI responses gracefully', async () => {
      const mockBedrockService = require('@/services/bedrock/bedrock.service').BedrockService;
      mockBedrockService.mockImplementation(() => ({
        generateCompletion: jest.fn().mockResolvedValue('invalid json response')
      }));

      const analyzer = new UserExperienceAnalyzer();
      const result = await analyzer.analyzeProductVsCompetitors(
        mockProductData,
        mockCompetitorData
      );

      expect(result).toBeDefined();
      expect(result.summary).toBe('Analysis completed but response format was invalid');
      expect(result.confidence).toBe(0.3);
      expect(result.recommendations).toEqual(['Review analysis input data and retry']);
    });
  });

  describe('generateFocusedAnalysis', () => {
    it('should generate focused mobile analysis', async () => {
      const result = await analyzer.generateFocusedAnalysis(
        mockProductData,
        mockCompetitorData,
        'mobile'
      );

      expect(result).toBeDefined();
      expect(result.metadata.analysisType).toBe('ux_focused');
    });

    it('should generate focused conversion analysis', async () => {
      const result = await analyzer.generateFocusedAnalysis(
        mockProductData,
        mockCompetitorData,
        'conversion'
      );

      expect(result).toBeDefined();
      expect(result.metadata.analysisType).toBe('ux_focused');
    });

    it('should generate focused accessibility analysis', async () => {
      const result = await analyzer.generateFocusedAnalysis(
        mockProductData,
        mockCompetitorData,
        'accessibility'
      );

      expect(result).toBeDefined();
      expect(result.metadata.analysisType).toBe('ux_focused');
    });
  });
}); 