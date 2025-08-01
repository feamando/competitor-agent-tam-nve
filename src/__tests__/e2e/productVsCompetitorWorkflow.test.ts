import { EnhancedProjectExtractor } from '@/lib/chat/enhancedProjectExtractor';
import { UserExperienceAnalyzer } from '@/services/analysis/userExperienceAnalyzer';
import { ComparativeReportService } from '@/services/reports/comparativeReportService';
import { logger } from '@/lib/logger';

describe('Product vs Competitor Workflow E2E', () => {
  let projectExtractor: EnhancedProjectExtractor;
  let uxAnalyzer: UserExperienceAnalyzer;
  let reportService: ComparativeReportService;

  beforeAll(async () => {
    // Initialize services
    projectExtractor = new EnhancedProjectExtractor();
    uxAnalyzer = new UserExperienceAnalyzer();
    reportService = new ComparativeReportService();

    logger.info('E2E Workflow Test Setup Complete');
  });

  describe('Phase 4.1: Complete Workflow Testing', () => {
    it('should extract valid project data from chat message', async () => {
      const chatMessage = `
        test-workflow@example.com
        Weekly
        TestCorp Competitive Analysis
        https://testcorp.com
        Product: TestCorp Platform
        Industry: SaaS
        Positioning: Enterprise automation platform
        Customer Data: Fortune 500 companies
        User Problem: Manual business processes
      `;

      // Step 1: Chat extraction
      const extractionResult = projectExtractor.extractProjectData(chatMessage);
      
      expect(extractionResult.success).toBe(true);
      expect(extractionResult.data).toBeDefined();
      expect(extractionResult.data!.userEmail).toBe('test-workflow@example.com');
      expect(extractionResult.data!.projectName).toBe('TestCorp Competitive Analysis');
      expect(extractionResult.data!.productWebsite || extractionResult.data!.productUrl).toBe('https://testcorp.com');
      expect(extractionResult.data!.productName).toBe('TestCorp Platform');
      expect(extractionResult.data!.industry).toBe('SaaS');
      expect(extractionResult.data!.positioning).toBe('Enterprise automation platform');

      logger.info('Chat extraction validation complete', {
        extracted: extractionResult.data
      });
    });

    it('should perform UX analysis with mock data', async () => {
      // Mock UX analysis input
      const mockAnalysisOptions = {
        focusAreas: ['user_experience', 'navigation', 'performance'] as const,
        mobileFirst: true,
        includeTechnicalAspects: true,
        includeAccessibility: true
      };

      const mockProduct = {
        name: 'TestCorp Platform',
        website: 'https://testcorp.com',
        positioning: 'Enterprise automation platform',
        features: ['Workflow automation', 'Analytics dashboard', 'API integrations'],
        userExperience: 'Clean, professional interface with guided onboarding'
      };

      const mockCompetitors = [
        {
          name: 'CompetitorA',
          website: 'https://competitora.com',
          features: ['Basic automation', 'Simple reporting'],
          userExperience: 'Traditional interface, steep learning curve'
        },
        {
          name: 'CompetitorB',
          website: 'https://competitorb.com',
          features: ['Advanced automation', 'Custom dashboards', 'Mobile app'],
          userExperience: 'Modern design, excellent mobile experience'
        }
      ];

      // Step 2: UX Analysis
      const uxAnalysis = await uxAnalyzer.analyzeCompetitiveUX(
        mockProduct,
        mockCompetitors,
        mockAnalysisOptions
      );

      expect(uxAnalysis).toBeDefined();
      expect(uxAnalysis.id).toBeDefined();
      expect(uxAnalysis.productAnalysis).toBeDefined();
      expect(uxAnalysis.competitorAnalyses).toHaveLength(2);
      expect(uxAnalysis.comparativeInsights).toBeDefined();
      expect(uxAnalysis.strategicRecommendations).toBeDefined();

      // Verify analysis structure
      expect(uxAnalysis.productAnalysis.overallScore).toBeGreaterThan(0);
      expect(uxAnalysis.productAnalysis.overallScore).toBeLessThanOrEqual(100);
      expect(uxAnalysis.competitorAnalyses[0].overallScore).toBeGreaterThan(0);
      expect(uxAnalysis.strategicRecommendations.immediate).toBeInstanceOf(Array);
      expect(uxAnalysis.strategicRecommendations.shortTerm).toBeInstanceOf(Array);
      expect(uxAnalysis.strategicRecommendations.longTerm).toBeInstanceOf(Array);

      logger.info('UX analysis validation complete', {
        analysisId: uxAnalysis.id,
        productScore: uxAnalysis.productAnalysis.overallScore,
        competitorCount: uxAnalysis.competitorAnalyses.length,
        confidenceScore: uxAnalysis.metadata.confidenceScore
      });
    });

    it('should generate comprehensive UX-enhanced report', async () => {
      // Mock comparative analysis
      const mockAnalysis = {
        id: 'test-analysis-001',
        projectId: 'test-project-001',
        productId: 'test-product-001',
        competitorIds: ['comp-001', 'comp-002'],
        analysisDate: new Date(),
        summary: {
          overallPosition: 'competitive' as const,
          keyStrengths: ['Strong automation features', 'User-friendly interface'],
          keyWeaknesses: ['Limited mobile support', 'Higher price point'],
          immediateRecommendations: ['Improve mobile experience', 'Add more integrations'],
          opportunityScore: 75,
          threatLevel: 'medium' as const,
          confidenceScore: 85
        },
        detailed: {
          featureComparison: {
            productFeatures: ['Workflow automation', 'Analytics dashboard', 'API integrations'],
            competitorFeatures: [
              {
                competitorId: 'comp-001',
                competitorName: 'CompetitorA',
                features: ['Basic automation', 'Simple reporting']
              },
              {
                competitorId: 'comp-002',
                competitorName: 'CompetitorB',
                features: ['Advanced automation', 'Custom dashboards', 'Mobile app']
              }
            ],
            uniqueToProduct: ['Advanced API integrations'],
            featureGaps: ['Mobile app', 'Custom reporting'],
            uniqueToCompetitors: ['Mobile app (CompetitorB)'],
            commonFeatures: ['Automation', 'Dashboard'],
            innovationScore: 80
          },
          positioningAnalysis: {
            productPositioning: {
              primaryMessage: 'Enterprise automation platform',
              valueProposition: 'Streamline business processes',
              targetAudience: 'Fortune 500 companies',
              differentiators: ['Enterprise focus', 'Advanced integrations']
            },
            competitorPositioning: [
              {
                competitorId: 'comp-001',
                competitorName: 'CompetitorA',
                primaryMessage: 'Simple automation tool',
                valueProposition: 'Easy to use automation',
                targetAudience: 'Small businesses',
                differentiators: ['Simplicity', 'Low cost']
              }
            ],
            positioningGaps: ['Mid-market segment'],
            marketOpportunities: ['Small-medium enterprises'],
            messagingEffectiveness: 75
          },
          userExperienceComparison: {
            productUX: {
              designQuality: 8,
              usabilityScore: 7,
              navigationStructure: 'Hierarchical with sidebar navigation',
              keyUserFlows: ['Onboarding', 'Workflow creation', 'Dashboard viewing']
            },
            competitorUX: [
              {
                competitorId: 'comp-001',
                competitorName: 'CompetitorA',
                designQuality: 6,
                usabilityScore: 5,
                navigationStructure: 'Traditional menu-based',
                keyUserFlows: ['Setup', 'Basic automation']
              }
            ],
            uxStrengths: ['Clean design', 'Guided onboarding'],
            uxWeaknesses: ['Mobile experience', 'Loading times'],
            uxRecommendations: ['Optimize mobile interface', 'Improve performance']
          },
          customerTargeting: {
            productTargeting: {
              primarySegments: ['Enterprise'],
              customerTypes: ['IT Directors', 'Operations Managers'],
              useCases: ['Process automation', 'Workflow optimization']
            },
            competitorTargeting: [
              {
                competitorId: 'comp-001',
                competitorName: 'CompetitorA',
                primarySegments: ['SMB'],
                customerTypes: ['Small business owners'],
                useCases: ['Simple automation']
              }
            ],
            targetingOverlap: ['Mid-market'],
            untappedSegments: ['Healthcare', 'Education'],
            competitiveAdvantage: ['Enterprise expertise', 'Advanced features']
          }
        },
        recommendations: {
          immediate: ['Improve mobile experience'],
          shortTerm: ['Add more integrations', 'Enhance performance'],
          longTerm: ['Expand to new markets'],
          priorityScore: 85
        },
        metadata: {
          analysisMethod: 'ai_powered' as const,
          modelUsed: 'claude-3',
          confidenceScore: 85,
          processingTime: 5000,
          dataQuality: 'high' as const
        }
      };

      const mockProduct = {
        id: 'test-product-001',
        name: 'TestCorp Platform',
        website: 'https://testcorp.com',
        positioning: 'Enterprise automation platform',
        customerData: 'Fortune 500 companies',
        userProblem: 'Manual business processes',
        industry: 'SaaS',
        projectId: 'test-project-001',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const mockProductSnapshot = {
        id: 'test-snapshot-001',
        productId: 'test-product-001',
        content: {
          title: 'TestCorp Platform - Enterprise Automation',
          description: 'Streamline your business processes with our automation platform',
          features: mockAnalysis.detailed.featureComparison.productFeatures,
          navigation: 'Clean sidebar navigation with contextual menus',
          userExperience: 'Professional interface with guided workflows'
        },
        metadata: {
          url: 'https://testcorp.com',
          scrapedAt: new Date().toISOString(),
          scrapeMethod: 'automated'
        },
        createdAt: new Date()
      };

      const mockCompetitorSnapshots = [
        {
          competitor: {
            name: 'CompetitorA',
            website: 'https://competitora.com'
          },
          snapshot: {
            id: 'snapshot-comp-001',
            competitorId: 'comp-001',
            metadata: {
              title: 'CompetitorA - Simple Automation',
              description: 'Basic automation for small businesses',
              features: ['Basic automation', 'Simple reporting'],
              navigation: 'Traditional menu structure',
              userExperience: 'Functional but dated interface'
            },
            createdAt: new Date(),
            updatedAt: new Date()
          }
        }
      ];

      // Step 3: Generate UX-enhanced report
      const startTime = Date.now();
      const reportResult = await reportService.generateUXEnhancedReport(
        mockAnalysis,
        mockProduct,
        mockProductSnapshot,
        mockCompetitorSnapshots
      );
      const endTime = Date.now();
      const processingTime = endTime - startTime;

      // Validate report structure
      expect(reportResult).toBeDefined();
      expect(reportResult.report).toBeDefined();
      expect(reportResult.report.sections).toBeInstanceOf(Array);
      expect(reportResult.report.sections.length).toBeGreaterThan(3);

      // Verify UX sections are present
      const sectionTitles = reportResult.report.sections.map(s => s.title);
      expect(sectionTitles).toContain('User Experience Analysis');
      expect(sectionTitles).toContain('Strategic UX Recommendations');

      // Verify report metadata
      expect(reportResult.report.metadata.productName).toBe('TestCorp Platform');
      expect(reportResult.report.metadata.competitorCount).toBe(2);
      expect(reportResult.report.keyFindings).toContain('UX Analysis Confidence:');

      // Verify performance requirements
      expect(processingTime).toBeLessThan(30000); // Should be under 30 seconds for mock data
      expect(reportResult.generationTime).toBeDefined();

      logger.info('UX-enhanced report generation complete', {
        reportSections: reportResult.report.sections.length,
        processingTime,
        reportSize: JSON.stringify(reportResult.report).length,
        keyFindings: reportResult.report.keyFindings.length
      });
    });

    it('should handle error scenarios gracefully', async () => {
      // Test invalid chat input
      const invalidChatMessage = `
        invalid-email
        Unknown
        No Product
      `;

      const extractionResult = projectExtractor.extractProjectData(invalidChatMessage);
      
      expect(extractionResult.success).toBe(false);
      expect(extractionResult.errors).toBeInstanceOf(Array);
      expect(extractionResult.errors.length).toBeGreaterThan(0);
      expect(extractionResult.suggestions).toBeInstanceOf(Array);
      expect(extractionResult.suggestions.length).toBeGreaterThan(0);

      // Test UX analysis with insufficient data
      const insufficientData = {
        name: 'Incomplete Product',
        website: 'https://example.com',
        // Missing required fields
      };

      try {
        await uxAnalyzer.analyzeCompetitiveUX(
          insufficientData as any,
          [],
          { focusAreas: ['user_experience'] }
        );
        throw new Error('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect(error.message).toContain('Invalid input');
      }

      logger.info('Error scenario validation complete');
    });
  });

  describe('Phase 4.1: Performance Validation', () => {
    it('should meet performance requirements for report generation', async () => {
      const mockAnalysis = {
        id: 'perf-test-001',
        projectId: 'perf-project-001',
        productId: 'perf-product-001',
        competitorIds: ['perf-comp-001', 'perf-comp-002'],
        analysisDate: new Date(),
        summary: {
          overallPosition: 'competitive' as const,
          keyStrengths: ['Performance test'],
          keyWeaknesses: ['Performance test'],
          immediateRecommendations: ['Performance test'],
          opportunityScore: 75,
          threatLevel: 'medium' as const,
          confidenceScore: 85
        },
        detailed: {
          featureComparison: {
            productFeatures: ['Feature 1'],
            competitorFeatures: [{ competitorId: 'comp-1', competitorName: 'Comp 1', features: ['Feature A'] }],
            uniqueToProduct: ['Unique'],
            featureGaps: ['Gap'],
            uniqueToCompetitors: ['Comp Unique'],
            commonFeatures: ['Common'],
            innovationScore: 80
          },
          positioningAnalysis: {
            productPositioning: {
              primaryMessage: 'Test message',
              valueProposition: 'Test value',
              targetAudience: 'Test audience',
              differentiators: ['Test diff']
            },
            competitorPositioning: [{
              competitorId: 'comp-1',
              competitorName: 'Comp 1',
              primaryMessage: 'Comp message',
              valueProposition: 'Comp value',
              targetAudience: 'Comp audience',
              differentiators: ['Comp diff']
            }],
            positioningGaps: ['Gap'],
            marketOpportunities: ['Opportunity'],
            messagingEffectiveness: 75
          },
          userExperienceComparison: {
            productUX: {
              designQuality: 8,
              usabilityScore: 7,
              navigationStructure: 'Modern',
              keyUserFlows: ['Flow']
            },
            competitorUX: [{
              competitorId: 'comp-1',
              competitorName: 'Comp 1',
              designQuality: 6,
              usabilityScore: 7,
              navigationStructure: 'Traditional',
              keyUserFlows: ['Comp Flow']
            }],
            uxStrengths: ['Strength'],
            uxWeaknesses: ['Weakness'],
            uxRecommendations: ['Recommendation']
          },
          customerTargeting: {
            productTargeting: {
              primarySegments: ['Segment'],
              customerTypes: ['Type'],
              useCases: ['Use case']
            },
            competitorTargeting: [{
              competitorId: 'comp-1',
              competitorName: 'Comp 1',
              primarySegments: ['Comp Segment'],
              customerTypes: ['Comp Type'],
              useCases: ['Comp Use case']
            }],
            targetingOverlap: ['Overlap'],
            untappedSegments: ['Untapped'],
            competitiveAdvantage: ['Advantage']
          }
        },
        recommendations: {
          immediate: ['Action'],
          shortTerm: ['Short Action'],
          longTerm: ['Long Action'],
          priorityScore: 85
        },
        metadata: {
          analysisMethod: 'ai_powered' as const,
          modelUsed: 'claude-3',
          confidenceScore: 85,
          processingTime: 5000,
          dataQuality: 'high' as const
        }
      };

      const mockProduct = {
        id: 'perf-product-001',
        name: 'Performance Test Product',
        website: 'https://perftest.com',
        positioning: 'Test positioning',
        customerData: 'Test customers',
        userProblem: 'Test problem',
        industry: 'Test industry',
        projectId: 'perf-project-001',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const mockProductSnapshot = {
        id: 'perf-snapshot-001',
        productId: 'perf-product-001',
        content: { title: 'Performance Test' },
        metadata: { url: 'https://perftest.com' },
        createdAt: new Date()
      };

      // Performance test with timing
      const startTime = Date.now();
      const reportResult = await reportService.generateUXEnhancedReport(
        mockAnalysis,
        mockProduct,
        mockProductSnapshot,
        []
      );
      const endTime = Date.now();
      const processingTime = endTime - startTime;

      // Performance requirements validation
      expect(processingTime).toBeLessThan(120000); // Should be under 2 minutes
      expect(reportResult.generationTime).toBeLessThan(120000);
      
      // Quality requirements
      expect(reportResult.report.sections.length).toBeGreaterThan(0);
      expect(reportResult.report.metadata).toBeDefined();

      logger.info('Performance test completed', {
        processingTime,
        reportSections: reportResult.report.sections.length,
        performanceTarget: '< 2 minutes',
        status: processingTime < 120000 ? 'PASS' : 'FAIL'
      });
    });
  });
}); 