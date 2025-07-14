// Mock the dependencies first to avoid circular references
jest.mock('@/services/analysis/userExperienceAnalyzer', () => ({
  UserExperienceAnalyzer: jest.fn().mockImplementation(() => ({
    analyzeProductVsCompetitors: jest.fn().mockResolvedValue({
      summary: 'Strong UX foundation with room for mobile improvements',
      strengths: ['Clean design', 'Fast loading', 'Intuitive navigation'],
      weaknesses: ['Limited mobile optimization', 'Accessibility gaps'],
      opportunities: ['Mobile-first redesign', 'Voice interface'],
      recommendations: [
        'Implement responsive design',
        'Add accessibility features',
        'Optimize mobile performance',
        'Enhance user onboarding',
        'Improve search functionality',
        'Add dark mode support'
      ],
      competitorComparisons: [
        {
          competitorName: 'Competitor 1',
          competitorWebsite: 'https://competitor1.com',
          strengths: ['Better mobile experience'],
          weaknesses: ['Slower loading times'],
          keyDifferences: ['Different navigation approach'],
          learnings: ['Mobile-first design principles']
        }
      ],
      confidence: 0.85,
      metadata: {
        correlationId: 'test-correlation-id',
        analyzedAt: '2024-01-01T00:00:00Z',
        competitorCount: 1,
        analysisType: 'ux_focused'
      }
    })
  }))
}));

jest.mock('@/services/bedrock/bedrock.service', () => ({
  BedrockService: jest.fn().mockImplementation(() => ({
    generateCompletion: jest.fn().mockResolvedValue('Mock AI response')
  }))
}));

import { ComparativeReportService } from '@/services/reports/comparativeReportService';
import { UserExperienceAnalyzer } from '@/services/analysis/userExperienceAnalyzer';
import { ComparativeAnalysis } from '@/types/analysis';
import { Product, ProductSnapshot } from '@/types/product';

// Create a reference to the mocked constructor
const MockUserExperienceAnalyzer = UserExperienceAnalyzer as jest.MockedClass<typeof UserExperienceAnalyzer>;

// Mock logger
jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  }
}));

describe('ComparativeReportService - UX Enhancement', () => {
  let service: ComparativeReportService;
  let mockUXAnalyzer: jest.Mocked<UserExperienceAnalyzer>;
  let mockAnalysis: ComparativeAnalysis;
  let mockProduct: Product;
  let mockProductSnapshot: ProductSnapshot;
  let mockCompetitorSnapshots: Array<{ competitor: { name: string; website: string }; snapshot: any }>;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create service instance 
    service = new ComparativeReportService();
    
    // Create a mock UX analyzer and directly assign it to the service
    mockUXAnalyzer = {
      analyzeProductVsCompetitors: jest.fn().mockResolvedValue({
        summary: 'Strong UX foundation with room for mobile improvements',
        strengths: ['Clean design', 'Fast loading', 'Intuitive navigation'],
        weaknesses: ['Limited mobile optimization', 'Accessibility gaps'],
        opportunities: ['Mobile-first redesign', 'Voice interface'],
        recommendations: [
          'Implement responsive design',
          'Add accessibility features',
          'Optimize mobile performance',
          'Enhance user onboarding',
          'Improve search functionality',
          'Add dark mode support'
        ],
        competitorComparisons: [
          {
            competitorName: 'Competitor 1',
            competitorWebsite: 'https://competitor1.com',
            strengths: ['Better mobile experience'],
            weaknesses: ['Slower loading times'],
            keyDifferences: ['Different navigation approach'],
            learnings: ['Mobile-first design principles']
          }
        ],
        confidence: 0.85,
        metadata: {
          correlationId: 'test-correlation-id',
          analyzedAt: '2024-01-01T00:00:00Z',
          competitorCount: 1,
          analysisType: 'ux_focused'
        }
      }),
      generateFocusedAnalysis: jest.fn().mockResolvedValue({
        summary: 'Focused UX analysis',
        strengths: [],
        weaknesses: [],
        opportunities: [],
        recommendations: [],
        competitorComparisons: [],
        confidence: 0.8,
        metadata: {
          correlationId: 'test-correlation-id',
          analyzedAt: '2024-01-01T00:00:00Z',
          competitorCount: 0,
          analysisType: 'ux_focused'
        }
      })
    } as unknown as jest.Mocked<UserExperienceAnalyzer>;
    
    // Directly replace the service's uxAnalyzer with our mock
    (service as any).uxAnalyzer = mockUXAnalyzer;
    
    // Setup mock data
    mockAnalysis = {
      id: 'analysis-1',
      projectId: 'project-1',
      productId: 'product-1',
      competitorIds: ['competitor-1', 'competitor-2'],
      analysisDate: new Date(),
      summary: {
        overallPosition: 'competitive',
        keyStrengths: ['Feature A', 'Feature B'],
        keyWeaknesses: ['Area C', 'Area D'],
        opportunityScore: 75,
        threatLevel: 'medium',
      },
      detailed: {
        featureComparison: {
          productFeatures: ['Feature 1', 'Feature 2'],
          competitorFeatures: [
            {
              competitorId: 'comp_1',
              competitorName: 'Competitor A',
              features: ['Feature X', 'Feature Y']
            }
          ],
          uniqueToProduct: ['Unique Feature A'],
          uniqueToCompetitors: ['Unique Feature B'],
          commonFeatures: ['Shared Feature C'],
          featureGaps: ['Gap 1', 'Gap 2'],
          innovationScore: 80
        },
        positioningAnalysis: {
          productPositioning: {
            primaryMessage: 'Our primary message',
            valueProposition: 'Our value prop',
            targetAudience: 'Our target',
            differentiators: ['Diff 1', 'Diff 2']
          },
          competitorPositioning: [
            {
              competitorId: 'comp_1',
              competitorName: 'Competitor A',
              primaryMessage: 'Simple Automation Solutions',
              valueProposition: 'Easy-to-use automation for small teams',
              targetAudience: 'Small businesses',
              differentiators: ['Simplicity', 'Low cost']
            }
          ],
          positioningGaps: ['Market education', 'Brand awareness'],
          marketOpportunities: ['Enterprise market expansion', 'Industry-specific solutions'],
          messagingEffectiveness: 82
        },
        userExperienceComparison: {
          productUX: {
            designQuality: 85,
            usabilityScore: 90,
            navigationStructure: 'Modern sidebar navigation',
            keyUserFlows: ['Onboarding', 'Dashboard', 'Settings']
          },
          competitorUX: [
            {
              competitorId: 'comp_1',
              competitorName: 'Competitor A',
              designQuality: 70,
              usabilityScore: 75,
              navigationStructure: 'Traditional menu-based navigation',
              keyUserFlows: ['Simple workflow', 'Basic dashboard']
            }
          ],
          uxStrengths: ['Modern design', 'Intuitive navigation'],
          uxWeaknesses: ['Complex setup', 'Learning curve'],
          uxRecommendations: ['Simplify onboarding', 'Add tutorials']
        },
        customerTargeting: {
          productTargeting: {
            primarySegments: ['SMB', 'Enterprise'],
            customerTypes: ['Business owners', 'Operations managers'],
            useCases: ['Workflow automation', 'Data processing']
          },
          competitorTargeting: [
            {
              competitorId: 'comp_1',
              competitorName: 'Competitor A',
              primarySegments: ['Small business'],
              customerTypes: ['Small business owners'],
              useCases: ['Simple automation', 'Basic workflows']
            }
          ],
          targetingOverlap: ['Small business'],
          untappedSegments: ['Mid-market', 'Industry-specific'],
          competitiveAdvantage: ['Enterprise scalability', 'Advanced features']
        }
      },
      recommendations: {
        immediate: ['Improve X', 'Enhance Y'],
        shortTerm: ['Strategy A', 'Initiative B'],
        longTerm: ['Vision C', 'Goal D'],
        priorityScore: 85
      },
      metadata: {
        analysisMethod: 'ai_powered',
        modelUsed: 'claude-3',
        confidenceScore: 85,
        processingTime: 5000,
        dataQuality: 'high'
      }
    };

    mockProduct = {
      id: 'prod_123',
      name: 'Test Product',
      website: 'https://testproduct.com',
      positioning: 'Leading automation platform',
      customerData: 'SMB and Enterprise customers',
      userProblem: 'Manual processes are inefficient',
      industry: 'SaaS',
      projectId: 'proj_123',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    mockProductSnapshot = {
      id: 'snapshot-1',
      productId: 'product-1',
      content: {
        title: 'Test Product',
        description: 'A test product',
        features: ['Feature 1', 'Feature 2']
      },
      metadata: {
        scrapedAt: '2024-01-01T00:00:00Z',
        url: 'https://testproduct.com'
      },
      createdAt: new Date()
    };

    mockCompetitorSnapshots = [
      {
        competitor: { name: 'Competitor 1', website: 'https://competitor1.com' },
        snapshot: {
          id: 'comp-snapshot-1',
          competitorId: 'competitor-1',
          metadata: {
            title: 'Competitor 1',
            description: 'A competitor product'
          },
          createdAt: new Date(),
          updatedAt: new Date()
        }
      }
    ];
  });

  describe('generateUXEnhancedReport', () => {
    it('should generate UX-enhanced report successfully', async () => {
      // Mock the standard report generation
      const mockStandardReport = {
        report: {
          id: 'report-1',
          title: 'Standard Report',
          description: 'A standard comparative report',
          projectId: 'proj_123',
          productId: 'prod_123',
          analysisId: 'analysis_123',
          sections: [
            {
              id: 'section-1',
              title: 'Executive Summary',
              content: 'Executive summary content',
              type: 'executive_summary' as const,
              order: 1,
              charts: [],
              tables: []
            }
          ],
          executiveSummary: 'Executive summary content',
          keyFindings: ['Finding 1', 'Finding 2'],
          strategicRecommendations: {
            immediate: ['Action 1'],
            shortTerm: ['Strategy 1'],
            longTerm: ['Vision 1'],
            priorityScore: 85
          },
          competitiveIntelligence: {
            marketPosition: 'competitive',
            keyThreats: ['Threat 1'],
            opportunities: ['Opportunity 1'],
            competitiveAdvantages: ['Advantage 1']
          },
          createdAt: new Date(),
          updatedAt: new Date(),
          status: 'completed' as const,
          format: 'markdown' as const,
          metadata: {
            productName: 'Test Product',
            productUrl: 'https://testproduct.com',
            competitorCount: 1,
            analysisDate: new Date(),
            reportGeneratedAt: new Date(),
            analysisId: 'analysis_123',
            analysisMethod: 'ai_powered' as const,
            confidenceScore: 85,
            dataQuality: 'high' as const,
            reportVersion: '1.0',
            focusAreas: ['features', 'positioning'],
            analysisDepth: 'detailed' as const
          }
        },
        generationTime: 5000,
        tokensUsed: 1000,
        cost: 0.01,
        warnings: [],
        errors: []
      };

      // Mock the generateComparativeReport method
      jest.spyOn(service, 'generateComparativeReport').mockResolvedValue(mockStandardReport);

      const result = await service.generateUXEnhancedReport(
        mockAnalysis,
        mockProduct,
        mockProductSnapshot,
        mockCompetitorSnapshots
      );

      expect(result).toBeDefined();
      expect(result.report.sections).toHaveLength(3); // Original + 2 UX sections
      expect(result.report.sections[1].title).toBe('User Experience Analysis');
      expect(result.report.sections[2].title).toBe('Strategic UX Recommendations');
      expect(result.report.keyFindings).toContain('UX Analysis Confidence: 85%');
      
      // Verify UX analyzer was called with correct parameters
      expect(mockUXAnalyzer.analyzeProductVsCompetitors).toHaveBeenCalledWith(
        expect.objectContaining({
          product: { name: 'Test Product', website: 'https://testproduct.com' }
        }),
        expect.arrayContaining([
          expect.objectContaining({
            competitor: { name: 'Competitor 1', website: 'https://competitor1.com' }
          })
        ]),
        {
          focus: 'both',
          includeTechnical: true,
          includeAccessibility: true,
          maxCompetitors: 5
        }
      );
    });

    it('should handle UX analysis with low confidence', async () => {
      // Mock low confidence UX analysis
      mockUXAnalyzer.analyzeProductVsCompetitors.mockResolvedValue({
        summary: 'Limited analysis due to data constraints',
        strengths: ['Basic functionality'],
        weaknesses: ['Multiple areas need improvement'],
        opportunities: ['Comprehensive redesign needed'],
        recommendations: ['Conduct user research'],
        competitorComparisons: [],
        confidence: 0.6, // Low confidence
        metadata: {
          correlationId: 'test-correlation-id',
          analyzedAt: '2024-01-01T00:00:00Z',
          competitorCount: 1,
          analysisType: 'ux_focused'
        }
      });

      // Mock standard report
      jest.spyOn(service, 'generateComparativeReport').mockResolvedValue({
        report: {
          id: 'report-1',
          title: 'Standard Report',
          description: 'A standard comparative report',
          sections: [],
          keyFindings: [],
          keyThreats: [],
          metadata: {
            productName: 'Test Product',
            productUrl: 'https://testproduct.com',
            competitorCount: 1,
            analysisDate: new Date(),
            reportGeneratedAt: new Date(),
            analysisId: 'analysis_123',
            analysisMethod: 'ai_powered' as const,
            confidenceScore: 85,
            dataQuality: 'high' as const,
            reportVersion: '1.0',
            focusAreas: ['features', 'positioning'],
            analysisDepth: 'detailed' as const
          }
        },
        generationTime: 5000,
        tokensUsed: 1000,
        cost: 0.01,
        warnings: [],
        errors: []
      });

      const result = await service.generateUXEnhancedReport(
        mockAnalysis,
        mockProduct,
        mockProductSnapshot,
        mockCompetitorSnapshots
      );

      expect(result.warnings).toContain('UX analysis confidence is below 70%');
      expect(result.report.keyFindings).toContain('UX Analysis Confidence: 60%');
    });

    it('should handle UX analysis errors gracefully', async () => {
      mockUXAnalyzer.analyzeProductVsCompetitors.mockRejectedValue(
        new Error('UX analysis failed')
      );

      await expect(
        service.generateUXEnhancedReport(
          mockAnalysis,
          mockProduct,
          mockProductSnapshot,
          mockCompetitorSnapshots
        )
      ).rejects.toThrow('Failed to generate UX-enhanced report: UX analysis failed');
    });

    it('should limit competitors to maximum of 5', async () => {
      // Create more than 5 competitors
      const manyCompetitors = Array.from({ length: 7 }, (_, i) => ({
        competitor: { name: `Competitor ${i + 1}`, website: `https://competitor${i + 1}.com` },
        snapshot: {
          id: `comp-snapshot-${i + 1}`,
          competitorId: `competitor-${i + 1}`,
          metadata: { title: `Competitor ${i + 1}` },
          createdAt: new Date(),
          updatedAt: new Date()
        }
      }));

      // Mock standard report
      jest.spyOn(service, 'generateComparativeReport').mockResolvedValue({
        report: {
          id: 'report-1',
          title: 'Standard Report',
          description: 'A standard comparative report',
          sections: [],
          keyFindings: [],
          keyThreats: [],
          metadata: {
            productName: 'Test Product',
            productUrl: 'https://testproduct.com',
            competitorCount: 7,
            analysisDate: new Date(),
            reportGeneratedAt: new Date(),
            analysisId: 'analysis_123',
            analysisMethod: 'ai_powered' as const,
            confidenceScore: 85,
            dataQuality: 'high' as const,
            reportVersion: '1.0',
            focusAreas: ['features', 'positioning'],
            analysisDepth: 'detailed' as const
          }
        },
        generationTime: 5000,
        tokensUsed: 1000,
        cost: 0.01,
        warnings: [],
        errors: []
      });

      await service.generateUXEnhancedReport(
        mockAnalysis,
        mockProduct,
        mockProductSnapshot,
        manyCompetitors
      );

      // Verify that maxCompetitors option was set to 5
      expect(mockUXAnalyzer.analyzeProductVsCompetitors).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({
          maxCompetitors: 5
        })
      );
    });
  });
}); 