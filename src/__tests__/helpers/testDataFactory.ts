/**
 * Test Data Factory - Task 3.2 Implementation
 * 
 * Helper functions to create test data for integration tests
 * Provides consistent test data creation for projects, products, competitors, and snapshots
 */

import prisma from '@/lib/prisma';
import { createId } from '@paralleldrive/cuid2';

export interface TestProjectData {
  name: string;
  industry?: string;
  description?: string;
  customerData?: string;
  userProblem?: string;
}

export interface TestProductData {
  projectId: string;
  name: string;
  website: string;
  industry?: string;
  positioning?: string;
  customerData?: string;
  userProblem?: string;
}

export interface TestCompetitorData {
  projectId: string;
  name: string;
  website: string;
  industry?: string;
  description?: string;
}

export interface TestSnapshotData {
  entityId: string;
  entityType: 'product' | 'competitor';
  content: any;
  metadata?: any;
}

/**
 * Create a test project with all necessary fields
 */
export async function createTestProject(data: TestProjectData) {
  const project = await prisma.project.create({
    data: {
      name: data.name,
      description: data.description || 'Test project for integration testing',
      userId: 'test-user-id', // Required field
      parameters: {},
      tags: []
    }
  });

  return project;
}

/**
 * Create a test product with snapshots
 */
export async function createTestProduct(data: TestProductData) {
  const product = await prisma.product.create({
    data: {
      id: createId(),
      projectId: data.projectId,
      name: data.name,
      website: data.website,
      industry: data.industry || 'Technology',
      positioning: data.positioning || 'Innovative solution',
      customerData: data.customerData || 'Business users',
      userProblem: data.userProblem || 'Workflow efficiency',
      createdAt: new Date(),
      updatedAt: new Date()
    }
  });

  // Create a test snapshot for the product
  const snapshot = await prisma.productSnapshot.create({
    data: {
      id: createId(),
      productId: product.id,
      content: {
        title: data.name,
        description: `${data.name} - Comprehensive business solution`,
        features: [
          'Advanced analytics',
          'Real-time monitoring', 
          'Automated workflows',
          'Custom integrations',
          'Enterprise security'
        ],
        navigation: {
          mainSections: ['Products', 'Solutions', 'Pricing', 'About'],
          userFlows: ['Sign up', 'Product demo', 'Contact sales']
        },
        value_proposition: data.positioning || 'Streamline your business operations',
        target_audience: 'Enterprise customers',
        pricing_model: 'Subscription-based',
        key_differentiators: [
          'Industry-leading performance',
          'Comprehensive feature set',
          'Exceptional customer support'
        ]
      },
      metadata: {
        scrapedAt: new Date().toISOString(),
        url: data.website,
        contentLength: 2500,
        scrapeQuality: 'high',
        dataCompleteness: 0.9
             },
       createdAt: new Date()
     }
   });

   return { ...product, snapshots: [snapshot] };
}

/**
 * Create a test competitor with snapshots
 */
export async function createTestCompetitor(data: TestCompetitorData) {
  const competitor = await prisma.competitor.create({
    data: {
      id: createId(),
      name: data.name,
      website: data.website,
      industry: data.industry || 'Technology',
      description: data.description || `${data.name} - Competitive solution`,
      createdAt: new Date(),
      updatedAt: new Date(),
      projects: {
        connect: { id: data.projectId }
      }
    }
  });

  // Create a test snapshot for the competitor
  const snapshot = await prisma.snapshot.create({
    data: {
      id: createId(),
      competitorId: competitor.id,
      metadata: {
        title: data.name,
        description: `${data.name} competitive analysis data`,
        features: [
          'Standard analytics',
          'Basic monitoring',
          'Manual workflows',
          'Limited integrations'
        ],
        navigation: {
          mainSections: ['Home', 'Products', 'Pricing', 'Support'],
          userFlows: ['Free trial', 'Product tour', 'Get quote']
        },
        value_proposition: 'Reliable business solution',
        target_audience: 'Mid-market customers',
        pricing_model: 'Tiered pricing',
        key_differentiators: [
          'Cost-effective solution',
          'Easy to use',
          'Quick implementation'
        ],
        strengths: [
          'Market presence',
          'Brand recognition',
          'Customer base'
        ],
        weaknesses: [
          'Limited features',
          'Older technology',
          'Slower innovation'
        ]
      },
      createdAt: new Date(),
      updatedAt: new Date()
    }
  });

  return { ...competitor, snapshots: [snapshot] };
}

/**
 * Create comprehensive test data for a complete analysis scenario
 */
export async function createCompleteTestScenario(scenarioName: string) {
  // Create test project
  const project = await createTestProject({
    name: `${scenarioName} Test Project`,
    industry: 'Technology',
    description: `Complete test scenario: ${scenarioName}`,
    customerData: 'Enterprise and mid-market businesses',
    userProblem: 'Need for comprehensive business automation'
  });

  // Create test product
  const product = await createTestProduct({
    projectId: project.id,
    name: `${scenarioName} Product`,
    website: `https://${scenarioName.toLowerCase().replace(/\s+/g, '')}.com`,
    industry: 'Technology',
    positioning: 'Next-generation business automation platform',
    customerData: 'Fortune 500 companies and growing enterprises',
    userProblem: 'Complex multi-system integration challenges'
  });

  // Create multiple competitors
  const competitors = await Promise.all([
    createTestCompetitor({
      projectId: project.id,
      name: `${scenarioName} Competitor A`,
      website: `https://${scenarioName.toLowerCase().replace(/\s+/g, '')}compa.com`,
      industry: 'Technology',
      description: 'Established market leader with comprehensive features'
    }),
    createTestCompetitor({
      projectId: project.id,
      name: `${scenarioName} Competitor B`,
      website: `https://${scenarioName.toLowerCase().replace(/\s+/g, '')}compb.com`,
      industry: 'Technology', 
      description: 'Agile startup with innovative approach'
    }),
    createTestCompetitor({
      projectId: project.id,
      name: `${scenarioName} Competitor C`,
      website: `https://${scenarioName.toLowerCase().replace(/\s+/g, '')}compc.com`,
      industry: 'Technology',
      description: 'Cost-effective solution with basic features'
    })
  ]);

  return {
    project,
    product,
    competitors,
    cleanup: async () => {
      // Cleanup function to remove all test data
      await prisma.project.delete({
        where: { id: project.id }
      }).catch(() => {}); // Ignore errors during cleanup
    }
  };
}

/**
 * Create analysis input data for testing
 */
export function createAnalysisInput(product: any, competitors: any[]) {
  return {
    product: {
      id: product.id,
      name: product.name,
      website: product.website,
      positioning: product.positioning,
      customerData: product.customerData,
      userProblem: product.userProblem,
      industry: product.industry
    },
    productSnapshot: product.snapshots[0],
    competitors: competitors.map(comp => ({
      competitor: {
        id: comp.id,
        name: comp.name,
        website: comp.website,
        industry: comp.industry,
        description: comp.description
      },
      snapshot: comp.snapshots[0]
    })),
    analysisConfig: {
      focusAreas: ['features', 'positioning', 'user_experience', 'customer_targeting'] as const,
      depth: 'detailed' as const,
      includeRecommendations: true
    }
  };
}

/**
 * Create mock Bedrock service responses for testing
 */
export function createMockBedrockResponse(analysisType: string) {
  const baseResponse = {
    timestamp: new Date().toISOString(),
    confidence: 0.85,
    processingTime: Math.floor(Math.random() * 5000) + 1000 // 1-6 seconds
  };

  switch (analysisType) {
    case 'ai_comprehensive':
      return {
        ...baseResponse,
        analysis: `
**Executive Summary:**
The product demonstrates strong competitive positioning with innovative features and clear value proposition. Market analysis reveals significant opportunities for growth in the enterprise segment.

**Key Strengths:**
- Advanced technology stack
- Comprehensive feature set
- Strong customer focus
- Competitive pricing model

**Market Opportunities:**
- Underserved enterprise segment
- Integration partnership potential
- International expansion possibilities

**Strategic Recommendations:**
- Focus on enterprise customer acquisition
- Develop integration partnerships
- Invest in customer success programs
        `,
        recommendations: {
          immediate: [
            'Enhance enterprise sales process',
            'Develop case studies and testimonials',
            'Optimize pricing for enterprise segment'
          ],
          longTerm: [
            'Build strategic partnerships',
            'Expand international presence', 
            'Develop platform ecosystem'
          ]
        }
      };

    case 'ux_comparison':
      return {
        ...baseResponse,
        executiveSummary: 'Product shows strong UX fundamentals with opportunities for mobile optimization',
        productStrengths: [
          'Clean and intuitive interface',
          'Fast loading times',
          'Comprehensive feature access',
          'Good navigation structure'
        ],
        productWeaknesses: [
          'Mobile responsiveness needs improvement',
          'Some complex workflows could be simplified',
          'Limited accessibility features'
        ],
        marketOpportunities: [
          'Mobile-first design approach',
          'Enhanced accessibility compliance',
          'Simplified onboarding process'
        ],
        strategicRecommendations: [
          'Implement responsive design principles',
          'Add accessibility features',
          'Streamline user onboarding',
          'Optimize for mobile usage patterns'
        ],
        detailedComparisons: [
          {
            competitorName: 'Competitor A',
            competitorWebsite: 'https://competitora.com',
            strengths: ['Better mobile experience', 'More intuitive navigation'],
            weaknesses: ['Slower performance', 'Limited customization'],
            keyDifferences: ['Mobile-first approach', 'Simplified interface'],
            learnings: ['Mobile optimization importance', 'User-centric design principles']
          }
        ]
      };

    case 'comparative_analysis':
      return {
        ...baseResponse,
        summary: {
          overallPosition: 'competitive',
          keyStrengths: [
            'Advanced feature set',
            'Competitive pricing',
            'Strong technology foundation',
            'Good customer support'
          ],
          keyWeaknesses: [
            'Limited brand recognition',
            'Smaller customer base',
            'Need for more integrations'
          ],
          opportunityScore: 78,
          threatLevel: 'manageable'
        },
        detailed: {
          featureComparison: {
            productFeatures: ['Advanced analytics', 'Real-time monitoring', 'Automated workflows'],
            competitorFeatures: [
              { competitorId: 'comp1', features: ['Basic analytics', 'Manual monitoring'] },
              { competitorId: 'comp2', features: ['Advanced analytics', 'Limited automation'] }
            ],
            uniqueToProduct: ['Real-time monitoring', 'Advanced automation'],
            uniqueToCompetitors: ['Established brand', 'Large customer base'],
            commonFeatures: ['Basic analytics', 'Customer support'],
            featureGaps: ['Mobile app', 'Third-party integrations'],
            innovationScore: 82
          }
        },
        recommendations: {
          immediate: [
            'Develop mobile application',
            'Build key integrations',
            'Enhance brand awareness'
          ],
          shortTerm: [
            'Expand customer success team',
            'Develop partner ecosystem',
            'Improve onboarding process'
          ],
          longTerm: [
            'Build platform marketplace',
            'Expand to adjacent markets',
            'Develop AI/ML capabilities'
          ],
          priorityScore: 85
        }
      };

    default:
      return {
        ...baseResponse,
        analysis: 'Generic analysis response for testing purposes',
        recommendations: {
          immediate: ['Test recommendation 1', 'Test recommendation 2'],
          longTerm: ['Long-term test recommendation']
        }
      };
  }
}

/**
 * Validate analysis response structure
 */
export function validateAnalysisResponse(response: any, analysisType: string): boolean {
  if (!response || typeof response !== 'object') {
    return false;
  }

  // Common validations
  const hasBasicStructure = response.analysisId && 
                           response.correlationId && 
                           response.analysisType === analysisType &&
                           response.summary &&
                           response.metadata &&
                           response.quality;

  if (!hasBasicStructure) {
    return false;
  }

  // Type-specific validations
  switch (analysisType) {
    case 'ai_comprehensive':
      return response.smartAnalysis && 
             response.smartAnalysis.analysis &&
             response.smartAnalysis.dataFreshness;

    case 'ux_comparison':
      return response.uxAnalysis &&
             response.uxAnalysis.summary &&
             Array.isArray(response.uxAnalysis.strengths) &&
             Array.isArray(response.uxAnalysis.weaknesses);

    case 'comparative_analysis':
      return response.comparativeAnalysis &&
             response.comparativeAnalysis.summary &&
             response.comparativeAnalysis.detailed &&
             response.comparativeAnalysis.recommendations;

    default:
      return true;
  }
}

/**
 * Performance test helper
 */
export async function measurePerformance<T>(
  operation: () => Promise<T>,
  maxExpectedTime: number
): Promise<{ result: T; processingTime: number; passedBenchmark: boolean }> {
  const startTime = Date.now();
  const result = await operation();
  const processingTime = Date.now() - startTime;
  const passedBenchmark = processingTime <= maxExpectedTime;

  return {
    result,
    processingTime,
    passedBenchmark
  };
} 