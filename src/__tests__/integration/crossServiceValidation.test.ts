/**
 * Cross-Service Integration Validation Tests
 * Phase 1.2: Core Workflow Restoration Validation
 * 
 * Tests the integration between services to ensure proper data flow
 * and prevent workflow failures.
 */

import { serviceCoordinator, WorkflowContext } from '@/lib/workflow/serviceCoordinator';
import { ComparativeAnalysisService } from '@/services/analysis/comparativeAnalysisService';
import { UserExperienceAnalyzer } from '@/services/analysis/userExperienceAnalyzer';
import { ConversationManager } from '@/lib/chat/conversation';
import { ComparativeAnalysisInput } from '@/types/analysis';

// Mock data for testing
const mockProductData = {
  id: 'prod-1',
  name: 'Test Product',
  website: 'https://testproduct.com',
  positioning: 'Leading solution for test market',
  customerData: 'Enterprise customers in technology sector',
  userProblem: 'Solving complex workflow automation challenges',
  industry: 'Technology'
};

const mockProductSnapshot = {
  id: 'snap-1',
  productId: 'prod-1',
  content: {
    title: 'Test Product - Workflow Automation',
    description: 'Advanced workflow automation platform for enterprise customers',
    features: ['Automated workflows', 'Real-time analytics', 'Enterprise security']
  },
  metadata: {
    scrapedAt: new Date().toISOString(),
    url: 'https://testproduct.com',
    text: 'Test Product offers comprehensive workflow automation solutions for enterprise customers. Our platform includes automated workflows, real-time analytics, and enterprise-grade security features.'
  },
  createdAt: new Date()
};

const mockCompetitors = [
  {
    competitor: {
      id: 'comp-1',
      name: 'Competitor A',
      website: 'https://competitora.com',
      industry: 'Technology'
    },
    snapshot: {
      id: 'snap-comp-1',
      competitorId: 'comp-1',
      metadata: {
        title: 'Competitor A - Business Automation',
        text: 'Competitor A provides business automation tools with focus on small to medium businesses.',
        features: ['Basic automation', 'Standard reporting']
      },
      createdAt: new Date(),
      updatedAt: new Date()
    }
  },
  {
    competitor: {
      id: 'comp-2',
      name: 'Competitor B',
      website: 'https://competitorb.com',
      industry: 'Technology'
    },
    snapshot: {
      id: 'snap-comp-2',
      competitorId: 'comp-2',
      metadata: {
        title: 'Competitor B - Process Management',
        text: 'Competitor B specializes in process management and workflow optimization for enterprises.',
        features: ['Process management', 'Workflow optimization', 'Team collaboration']
      },
      createdAt: new Date(),
      updatedAt: new Date()
    }
  }
];

const mockAnalysisInput: ComparativeAnalysisInput = {
  product: mockProductData,
  productSnapshot: mockProductSnapshot,
  competitors: mockCompetitors,
  analysisConfig: {
    focusAreas: ['features', 'positioning', 'user_experience'],
    depth: 'comprehensive',
    includeRecommendations: true
  }
};

describe('Cross-Service Integration Validation', () => {
  let comparativeAnalysisService: ComparativeAnalysisService;
  let userExperienceAnalyzer: UserExperienceAnalyzer;
  let conversationManager: ConversationManager;

  beforeEach(() => {
    comparativeAnalysisService = new ComparativeAnalysisService();
    userExperienceAnalyzer = new UserExperienceAnalyzer();
    conversationManager = new ConversationManager();
  });

  describe('Service Coordinator Integration', () => {
    it('should orchestrate analysis workflow successfully', async () => {
      const context: WorkflowContext = {
        correlationId: 'test-correlation-1',
        productId: 'prod-1',
        projectId: 'proj-1',
        analysisType: 'comprehensive'
      };

      // Mock the analysis data service
      jest.spyOn(serviceCoordinator as any, 'prepareAnalysisInput')
        .mockResolvedValue(mockAnalysisInput);

      const result = await serviceCoordinator.orchestrateAnalysis(context);

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.analysis || result.uxAnalysis).toBeDefined();
    });

    it('should handle service failures gracefully', async () => {
      const context: WorkflowContext = {
        correlationId: 'test-correlation-2',
        productId: 'invalid-product',
        projectId: 'invalid-project',
        analysisType: 'comprehensive'
      };

      const result = await serviceCoordinator.orchestrateAnalysis(context);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(typeof result.errors[0]).toBe('string');
    });

    it('should provide service health status', () => {
      const healthStatus = serviceCoordinator.getServiceHealth();
      
      expect(Array.isArray(healthStatus)).toBe(true);
      expect(healthStatus.length).toBeGreaterThan(0);
      
      healthStatus.forEach(health => {
        expect(health).toHaveProperty('serviceName');
        expect(health).toHaveProperty('status');
        expect(health).toHaveProperty('lastCheck');
        expect(['healthy', 'degraded', 'unhealthy']).toContain(health.status);
      });
    });
  });

  describe('Comparative Analysis Service Integration', () => {
    it('should generate complete analysis with all sections', async () => {
      const analysis = await comparativeAnalysisService.analyzeProductVsCompetitors(mockAnalysisInput);

      expect(analysis).toBeDefined();
      expect(analysis.id).toBeDefined();
      expect(analysis.summary).toBeDefined();
      expect(analysis.summary.length).toBeGreaterThan(50);
      
      expect(analysis.detailed).toBeDefined();
      expect(typeof analysis.detailed).toBe('object');
      
      expect(analysis.recommendations).toBeDefined();
      expect(analysis.metadata).toBeDefined();
      expect(analysis.metadata.confidenceScore).toBeGreaterThan(0);
    });

    it('should handle empty competitor data gracefully', async () => {
      const emptyInput: ComparativeAnalysisInput = {
        ...mockAnalysisInput,
        competitors: []
      };

      await expect(async () => {
        await comparativeAnalysisService.analyzeProductVsCompetitors(emptyInput);
      }).rejects.toThrow('At least one competitor is required for analysis');
    });

    it('should validate input data structure', async () => {
      const invalidInput: ComparativeAnalysisInput = {
        ...mockAnalysisInput,
        product: { ...mockProductData, id: '', name: '' }
      };

      await expect(async () => {
        await comparativeAnalysisService.analyzeProductVsCompetitors(invalidInput);
      }).rejects.toThrow('Product information is incomplete');
    });
  });

  describe('UX Analyzer Integration', () => {
    it('should generate UX analysis with complete metadata', async () => {
      const uxAnalysis = await userExperienceAnalyzer.analyzeProductVsCompetitors(
        mockProductSnapshot as any,
        mockCompetitors.map(c => c.snapshot) as any,
        { maxCompetitors: 5 }
      );

      expect(uxAnalysis).toBeDefined();
      expect(uxAnalysis.summary).toBeDefined();
      expect(uxAnalysis.metadata).toBeDefined();
      expect(uxAnalysis.metadata.correlationId).toBeDefined();
      expect(uxAnalysis.metadata.analyzedAt).toBeDefined();
      expect(uxAnalysis.metadata.competitorCount).toBe(2);
      expect(uxAnalysis.metadata.analysisType).toBe('ux_focused');
      
      expect(Array.isArray(uxAnalysis.strengths)).toBe(true);
      expect(Array.isArray(uxAnalysis.weaknesses)).toBe(true);
      expect(Array.isArray(uxAnalysis.opportunities)).toBe(true);
      expect(Array.isArray(uxAnalysis.recommendations)).toBe(true);
      expect(Array.isArray(uxAnalysis.competitorComparisons)).toBe(true);
      
      expect(typeof uxAnalysis.confidence).toBe('number');
      expect(uxAnalysis.confidence).toBeGreaterThan(0);
      expect(uxAnalysis.confidence).toBeLessThanOrEqual(1);
    });

    it('should handle malformed competitor data', async () => {
      const malformedCompetitors = [
        { invalid: 'data' },
        null,
        undefined
      ];

      const uxAnalysis = await userExperienceAnalyzer.analyzeProductVsCompetitors(
        mockProductSnapshot as any,
        malformedCompetitors as any,
        { maxCompetitors: 5 }
      );

      expect(uxAnalysis).toBeDefined();
      expect(uxAnalysis.metadata).toBeDefined();
      expect(uxAnalysis.metadata.fallbackMode).toBe(true);
      expect(uxAnalysis.confidence).toBeLessThan(0.5);
    });

    it('should provide fallback analysis when service fails', async () => {
      // Test with completely invalid data
      const uxAnalysis = await userExperienceAnalyzer.analyzeProductVsCompetitors(
        null as any,
        [] as any,
        {}
      );

      expect(uxAnalysis).toBeDefined();
      expect(uxAnalysis.summary).toBeDefined();
      expect(uxAnalysis.metadata).toBeDefined();
      expect(uxAnalysis.metadata.fallbackMode).toBe(true);
      expect(uxAnalysis.recommendations.length).toBeGreaterThan(0);
    });
  });

  describe('Conversation Manager Integration', () => {
    it('should handle undefined collectedData gracefully', async () => {
      const response = await conversationManager.processUserMessage(
        'Start a new competitive analysis project'
      );

      expect(response).toBeDefined();
      expect(response.message).toBeDefined();
      expect(typeof response.message).toBe('string');
      expect(response.message.length).toBeGreaterThan(0);
    });

    it('should initialize chat state properly', () => {
      const chatState = conversationManager.getChatState();
      
      expect(chatState).toBeDefined();
      expect(chatState.currentStep).toBeDefined();
      expect(chatState.stepDescription).toBeDefined();
      expect(chatState.expectedInputType).toBeDefined();
    });

    it('should handle comprehensive input without errors', async () => {
      const comprehensiveInput = `
        Email: test@example.com
        Project: Test Analysis Project
        Frequency: Weekly
        Product: Test Product
        Website: https://testproduct.com
        Industry: Technology
        Positioning: Leading workflow automation solution
        Customers: Enterprise technology companies
        Problem: Complex workflow automation challenges
      `;

      const response = await conversationManager.processUserMessage(comprehensiveInput);

      expect(response).toBeDefined();
      expect(response.error).toBeUndefined();
      expect(response.message).toBeDefined();
    });
  });

  describe('Data Flow Validation', () => {
    it('should maintain data consistency across service calls', async () => {
      const context: WorkflowContext = {
        correlationId: 'test-data-flow',
        productId: 'prod-1',
        projectId: 'proj-1',
        analysisType: 'comprehensive'
      };

      // Mock successful data preparation
      jest.spyOn(serviceCoordinator as any, 'prepareAnalysisInput')
        .mockResolvedValue(mockAnalysisInput);

      const result = await serviceCoordinator.orchestrateAnalysis(context);

      if (result.success && result.analysis) {
        expect(result.analysis.productId).toBe(mockAnalysisInput.product.id);
        expect(result.analysis.competitorIds).toHaveLength(mockCompetitors.length);
      }

      if (result.success && result.uxAnalysis) {
        expect(result.uxAnalysis.metadata.competitorCount).toBe(mockCompetitors.length);
      }
    });

    it('should handle service dependencies properly', async () => {
      // Test that UX analyzer can work even if comparative analysis fails
      const context: WorkflowContext = {
        correlationId: 'test-dependencies',
        productId: 'prod-1',
        projectId: 'proj-1',
        analysisType: 'ux-only'
      };

      jest.spyOn(serviceCoordinator as any, 'prepareAnalysisInput')
        .mockResolvedValue(mockAnalysisInput);

      const result = await serviceCoordinator.orchestrateAnalysis(context);

      expect(result).toBeDefined();
      expect(result.uxAnalysis).toBeDefined();
    });
  });

  describe('Error Recovery Validation', () => {
    it('should provide meaningful error messages', async () => {
      const context: WorkflowContext = {
        correlationId: 'test-error-recovery',
        productId: 'nonexistent',
        projectId: 'nonexistent',
        analysisType: 'comprehensive'
      };

      const result = await serviceCoordinator.orchestrateAnalysis(context);

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Failed to prepare analysis input data');
    });

    it('should continue workflow even with partial failures', async () => {
      const context: WorkflowContext = {
        correlationId: 'test-partial-failure',
        productId: 'prod-1',
        projectId: 'proj-1',
        analysisType: 'comprehensive'
      };

      // Mock partial success (input preparation succeeds but analysis has issues)
      const partialInput = {
        ...mockAnalysisInput,
        competitors: mockCompetitors.slice(0, 1) // Minimal competitor data
      };

      jest.spyOn(serviceCoordinator as any, 'prepareAnalysisInput')
        .mockResolvedValue(partialInput);

      const result = await serviceCoordinator.orchestrateAnalysis(context);

      // Should have warnings but still succeed
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.analysis || result.uxAnalysis).toBeDefined();
    });
  });
});

export {}; 