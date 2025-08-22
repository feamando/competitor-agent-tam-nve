/**
 * TP-014 CompAI Prompt Integration Tests
 * 
 * Comprehensive integration tests for CompAI prompt generation across all services.
 * Tests prompt generation, data transformation, and backward compatibility.
 */

import { describe, it, expect, beforeEach, beforeAll, afterAll } from '@jest/globals';
import { CompAIPromptBuilder } from '@/services/analysis/compaiPromptBuilder';
import { SmartAIService } from '@/services/smartAIService';
import { CompAIPromptOptions } from '@/types/prompts';
import { getCompAIPrompt } from '@/services/analysis/analysisPrompts';
import prisma from '@/lib/prisma';
import { createId } from '@paralleldrive/cuid2';

describe('TP-014 CompAI Prompt Integration', () => {
  let testProjectId: string;
  let testProductId: string;
  let testCompetitorIds: string[] = [];
  let compaiBuilder: CompAIPromptBuilder;
  let smartAIService: SmartAIService;

  beforeAll(async () => {
    // Initialize services
    compaiBuilder = new CompAIPromptBuilder();
    smartAIService = new SmartAIService();
  });

  beforeEach(async () => {
    // Create test project with products and competitors
    const testProject = await prisma.project.create({
      data: {
        id: createId(),
        name: 'CompAI Integration Test Project',
        description: 'Test project for CompAI prompt generation',
        status: 'ACTIVE',
        priority: 'MEDIUM',
        userId: 'test-user',
        profileId: 'test-profile',
        parameters: {},
        tags: {},
        scrapingFrequency: 'WEEKLY'
      }
    });
    testProjectId = testProject.id;

    // Create test product
    const testProduct = await prisma.product.create({
      data: {
        id: createId(),
        name: 'TestFlow Pro',
        website: 'https://testflow.com',
        positioning: 'Premium workflow automation for growing businesses',
        customerData: 'SMB companies, 50-200 employees, focused on operational efficiency',
        userProblem: 'Manual processes causing delays and errors in business operations',
        industry: 'Business Automation',
        projectId: testProject.id
      }
    });
    testProductId = testProduct.id;

    // Create test product snapshot
    await prisma.productSnapshot.create({
      data: {
        id: createId(),
        productId: testProduct.id,
        content: {
          html: '<html><head><title>TestFlow Pro - Streamline Your Business</title></head><body><h1>TestFlow Pro</h1><p>Automate your business processes with our comprehensive platform.</p><div class="features"><h2>Key Features</h2><ul><li>Process Automation</li><li>Real-time Analytics</li><li>Team Collaboration</li></ul></div><div class="pricing"><h2>Pricing</h2><p>Starting at $49/month</p></div></body></html>',
          text: 'TestFlow Pro Streamline Your Business Automate your business processes Key Features Process Automation Real-time Analytics Team Collaboration Pricing Starting at $49/month',
          title: 'TestFlow Pro - Streamline Your Business',
          description: 'Comprehensive business process automation platform',
          url: 'https://testflow.com',
          timestamp: new Date()
        },
        metadata: {
          scrapingTimestamp: new Date(),
          contentLength: 450,
          statusCode: 200
        },
        captureSuccess: true
      }
    });

    // Create test competitors
    const competitor1 = await prisma.competitor.create({
      data: {
        id: createId(),
        name: 'AutoFlow Solutions',
        website: 'https://autoflow.com',
        industry: 'Business Automation',
        description: 'Enterprise workflow automation platform'
      }
    });

    const competitor2 = await prisma.competitor.create({
      data: {
        id: createId(),
        name: 'ProcessMaster',
        website: 'https://processmaster.com', 
        industry: 'Business Automation',
        description: 'Small business process optimization tool'
      }
    });

    testCompetitorIds = [competitor1.id, competitor2.id];

    // Connect competitors to project
    await prisma.project.update({
      where: { id: testProject.id },
      data: {
        competitors: {
          connect: [
            { id: competitor1.id },
            { id: competitor2.id }
          ]
        }
      }
    });

    // Create competitor snapshots
    await prisma.snapshot.create({
      data: {
        id: createId(),
        competitorId: competitor1.id,
        metadata: {
          html: '<html><head><title>AutoFlow Solutions</title></head><body><h1>AutoFlow Solutions</h1><p>Enterprise-grade workflow automation.</p><div class="features"><h2>Features</h2><ul><li>Advanced Analytics</li><li>Custom Workflows</li><li>API Integration</li></ul></div><div class="pricing"><h2>Enterprise Pricing</h2><p>Contact for quote</p></div></body></html>',
          text: 'AutoFlow Solutions Enterprise-grade workflow automation Features Advanced Analytics Custom Workflows API Integration Enterprise Pricing Contact for quote',
          title: 'AutoFlow Solutions',
          description: 'Enterprise workflow automation platform',
          url: 'https://autoflow.com',
          scrapedAt: new Date().toISOString(),
          contentLength: 380,
          statusCode: 200
        },
        captureSuccess: true
      }
    });

    await prisma.snapshot.create({
      data: {
        id: createId(),
        competitorId: competitor2.id,
        metadata: {
          html: '<html><head><title>ProcessMaster</title></head><body><h1>ProcessMaster</h1><p>Simple process optimization for small businesses.</p><div class="features"><h2>Features</h2><ul><li>Basic Automation</li><li>Simple Reporting</li><li>Email Support</li></ul></div><div class="pricing"><h2>Affordable Pricing</h2><p>$19/month</p></div></body></html>',
          text: 'ProcessMaster Simple process optimization for small businesses Features Basic Automation Simple Reporting Email Support Affordable Pricing $19/month',
          title: 'ProcessMaster', 
          description: 'Small business process optimization',
          url: 'https://processmaster.com',
          scrapedAt: new Date().toISOString(),
          contentLength: 320,
          statusCode: 200
        },
        captureSuccess: true
      }
    });
  });

  afterEach(async () => {
    // Clean up test data
    if (testProjectId) {
      await prisma.productSnapshot.deleteMany({
        where: { product: { projectId: testProjectId } }
      });
      await prisma.product.deleteMany({
        where: { projectId: testProjectId }
      });
      await prisma.snapshot.deleteMany({
        where: { competitorId: { in: testCompetitorIds } }
      });
      await prisma.project.update({
        where: { id: testProjectId },
        data: { competitors: { disconnect: testCompetitorIds.map(id => ({ id })) } }
      });
      await prisma.competitor.deleteMany({
        where: { id: { in: testCompetitorIds } }
      });
      await prisma.project.delete({
        where: { id: testProjectId }
      });
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('5.1 Prompt Generation with Sample Project Data', () => {
    it('should generate CompAI prompt with complete project data', async () => {
      // Get project with relations
      const project = await prisma.project.findUnique({
        where: { id: testProjectId },
        include: {
          products: true,
          competitors: true
        }
      });

      expect(project).toBeTruthy();
      expect(project!.products).toHaveLength(1);
      expect(project!.competitors).toHaveLength(2);

      // Create mock freshness status
      const mockFreshnessStatus = {
        overallStatus: 'fresh' as const,
        products: [{
          id: testProductId,
          name: 'TestFlow Pro',
          needsScraping: false,
          lastSnapshot: new Date().toISOString(),
          daysSinceLastSnapshot: 0
        }],
        competitors: testCompetitorIds.map((id, index) => ({
          id,
          name: index === 0 ? 'AutoFlow Solutions' : 'ProcessMaster',
          needsScraping: false,
          lastSnapshot: new Date().toISOString(),
          daysSinceLastSnapshot: 0
        })),
        recommendedActions: []
      };

      // Test CompAI prompt generation
      const compaiPrompt = await compaiBuilder.buildCompAIPrompt(
        project!,
        'competitive',
        mockFreshnessStatus
      );

      // Verify prompt structure
      expect(compaiPrompt).toContain('### **CompAI Prompt**');
      expect(compaiPrompt).toContain('**Role:**');
      expect(compaiPrompt).toContain('Senior Market Analyst and Competitive Intelligence Strategist');
      expect(compaiPrompt).toContain('**Ask:**');
      expect(compaiPrompt).toContain('TestFlow Pro');
      expect(compaiPrompt).toContain('**Context:**');
      expect(compaiPrompt).toContain('**Product Information:**');
      expect(compaiPrompt).toContain('**Product Website Data:**');
      expect(compaiPrompt).toContain('**Competitor Website Data:**');
      expect(compaiPrompt).toContain('**Last Analysis Date:**');

      // Verify product information is formatted correctly
      expect(compaiPrompt).toContain('**Product Name:** TestFlow Pro');
      expect(compaiPrompt).toContain('**Website:** https://testflow.com');
      expect(compaiPrompt).toContain('**Industry:** Business Automation');
      expect(compaiPrompt).toContain('Premium workflow automation');

      // Verify HTML content is included
      expect(compaiPrompt).toContain('<html>');
      expect(compaiPrompt).toContain('TestFlow Pro - Streamline Your Business');
      expect(compaiPrompt).toContain('Process Automation');

      // Verify competitor data is included
      expect(compaiPrompt).toContain('AutoFlow_Solutions_Website.html');
      expect(compaiPrompt).toContain('ProcessMaster_Website.html');
      expect(compaiPrompt).toContain('Enterprise-grade workflow automation');
      expect(compaiPrompt).toContain('Simple process optimization');

      // Verify template structure
      expect(compaiPrompt).toContain('# Competitive Landscape Analysis:');
      expect(compaiPrompt).toContain('## I. Executive Summary');
      expect(compaiPrompt).toContain('## II. Introduction');
      expect(compaiPrompt).toContain('## III. Competitor Profiles');
      expect(compaiPrompt).toContain('## IV. Comparative Analysis');
      expect(compaiPrompt).toContain('## V. SWOT Analysis');
      expect(compaiPrompt).toContain('## VI. Changes Since Last Analysis');
      expect(compaiPrompt).toContain('## VII. Strategic Recommendations');
      expect(compaiPrompt).toContain('## VIII. Conclusion');
    });

    it('should handle missing product snapshots gracefully', async () => {
      // Delete product snapshots to test fallback
      await prisma.productSnapshot.deleteMany({
        where: { product: { projectId: testProjectId } }
      });

      const project = await prisma.project.findUnique({
        where: { id: testProjectId },
        include: { products: true, competitors: true }
      });

      const mockFreshnessStatus = {
        overallStatus: 'stale' as const,
        products: [{
          id: testProductId,
          name: 'TestFlow Pro',
          needsScraping: true,
          lastSnapshot: null,
          daysSinceLastSnapshot: null
        }],
        competitors: [],
        recommendedActions: ['Update product data']
      };

      const compaiPrompt = await compaiBuilder.buildCompAIPrompt(
        project!,
        'competitive',
        mockFreshnessStatus
      );

      expect(compaiPrompt).toContain('Product website HTML content not available');
      expect(compaiPrompt).toContain('TestFlow Pro'); // Product name should still be there
      expect(compaiPrompt).toContain('Premium workflow automation'); // Product info should still be there
    });

    it('should apply content truncation for large HTML content', async () => {
      // Create a product snapshot with very large HTML content
      const largeHTML = '<html><head><title>Large Content</title></head><body>' + 
        '<div>'.repeat(10000) + 'Large content section' + '</div>'.repeat(10000) + '</body></html>';

      await prisma.productSnapshot.create({
        data: {
          id: createId(),
          productId: testProductId,
          content: {
            html: largeHTML,
            text: 'Large content repeated many times',
            title: 'Large Content Test',
            description: 'Test with large HTML content',
            url: 'https://testflow.com/large',
            timestamp: new Date()
          },
          metadata: {
            contentLength: largeHTML.length,
            statusCode: 200
          },
          captureSuccess: true
        }
      });

      const project = await prisma.project.findUnique({
        where: { id: testProjectId },
        include: { products: true, competitors: true }
      });

      const compaiOptions: CompAIPromptOptions = {
        maxHTMLLength: 1000 // Small limit to test truncation
      };

      const mockFreshnessStatus = {
        overallStatus: 'fresh' as const,
        products: [{
          id: testProductId,
          name: 'TestFlow Pro',
          needsScraping: false,
          lastSnapshot: new Date().toISOString(),
          daysSinceLastSnapshot: 0
        }],
        competitors: [],
        recommendedActions: []
      };

      const compaiPrompt = await compaiBuilder.buildCompAIPrompt(
        project!,
        'competitive',
        mockFreshnessStatus,
        compaiOptions
      );

      // Verify truncation occurred
      expect(compaiPrompt).toContain('Content truncated');
      expect(compaiPrompt.length).toBeLessThan(largeHTML.length + 5000); // Much smaller than original
    });

    it('should limit competitors to prevent prompt bloat', async () => {
      // Create additional competitors beyond the default limit
      const additionalCompetitors = [];
      for (let i = 3; i <= 7; i++) {
        const competitor = await prisma.competitor.create({
          data: {
            id: createId(),
            name: `Competitor ${i}`,
            website: `https://competitor${i}.com`,
            industry: 'Business Automation',
            description: `Test competitor ${i}`
          }
        });
        additionalCompetitors.push(competitor);

        await prisma.snapshot.create({
          data: {
            id: createId(),
            competitorId: competitor.id,
            metadata: {
              html: `<html><body><h1>Competitor ${i}</h1></body></html>`,
              text: `Competitor ${i}`,
              title: `Competitor ${i}`,
              scrapedAt: new Date().toISOString(),
              contentLength: 50,
              statusCode: 200
            },
            captureSuccess: true
          }
        });
      }

      // Connect additional competitors to project
      await prisma.project.update({
        where: { id: testProjectId },
        data: {
          competitors: {
            connect: additionalCompetitors.map(c => ({ id: c.id }))
          }
        }
      });

      const project = await prisma.project.findUnique({
        where: { id: testProjectId },
        include: { products: true, competitors: true }
      });

      expect(project!.competitors.length).toBeGreaterThan(5);

      const compaiOptions: CompAIPromptOptions = {
        maxCompetitors: 3 // Limit to 3 competitors
      };

      const mockFreshnessStatus = {
        overallStatus: 'fresh' as const,
        products: [{
          id: testProductId,
          name: 'TestFlow Pro',
          needsScraping: false,
          lastSnapshot: new Date().toISOString(),
          daysSinceLastSnapshot: 0
        }],
        competitors: project!.competitors.map(c => ({
          id: c.id,
          name: c.name,
          needsScraping: false,
          lastSnapshot: new Date().toISOString(),
          daysSinceLastSnapshot: 0
        })),
        recommendedActions: []
      };

      const compaiPrompt = await compaiBuilder.buildCompAIPrompt(
        project!,
        'competitive',
        mockFreshnessStatus,
        compaiOptions
      );

      // Count competitor sections in prompt
      const competitorMatches = compaiPrompt.match(/\*\*\w+_Website\.html:\*\*/g);
      expect(competitorMatches?.length).toBeLessThanOrEqual(3);

      // Clean up additional competitors
      await prisma.snapshot.deleteMany({
        where: { competitorId: { in: additionalCompetitors.map(c => c.id) } }
      });
      await prisma.project.update({
        where: { id: testProjectId },
        data: {
          competitors: {
            disconnect: additionalCompetitors.map(c => ({ id: c.id }))
          }
        }
      });
      await prisma.competitor.deleteMany({
        where: { id: { in: additionalCompetitors.map(c => c.id) } }
      });
    });
  });

  describe('5.2 Template System Integration', () => {
    it('should retrieve CompAI prompt template correctly', () => {
      const compaiTemplate = getCompAIPrompt();

      expect(compaiTemplate).toBeTruthy();
      expect(compaiTemplate.system).toContain('Senior Market Analyst and Competitive Intelligence Strategist');
      expect(compaiTemplate.userTemplate).toContain('### **CompAI Prompt**');
      expect(compaiTemplate.userTemplate).toContain('{{productName}}');
      expect(compaiTemplate.userTemplate).toContain('{{productInfo}}');
      expect(compaiTemplate.userTemplate).toContain('{{productWebsiteHTML}}');
      expect(compaiTemplate.userTemplate).toContain('{{competitorHTMLFiles}}');
      expect(compaiTemplate.userTemplate).toContain('{{lastAnalysisDate}}');
      expect(compaiTemplate.outputFormat).toBe('MARKDOWN');
      expect(compaiTemplate.maxLength).toBe(8000);
    });
  });

  describe('5.3 Error Handling and Fallback', () => {
    it('should handle invalid project data gracefully', async () => {
      const invalidProject = {
        id: 'invalid-project',
        name: 'Invalid Project',
        products: [], // No products
        competitors: []
      };

      const mockFreshnessStatus = {
        overallStatus: 'fresh' as const,
        products: [],
        competitors: [],
        recommendedActions: []
      };

      await expect(
        compaiBuilder.buildCompAIPrompt(
          invalidProject as any,
          'competitive',
          mockFreshnessStatus
        )
      ).rejects.toThrow('No product found for project');
    });

    it('should handle missing competitor data gracefully', async () => {
      const project = await prisma.project.findUnique({
        where: { id: testProjectId },
        include: { products: true, competitors: [] } // No competitors
      });

      // Remove competitors from project
      await prisma.project.update({
        where: { id: testProjectId },
        data: {
          competitors: { disconnect: testCompetitorIds.map(id => ({ id })) }
        }
      });

      const projectWithoutCompetitors = await prisma.project.findUnique({
        where: { id: testProjectId },
        include: { products: true, competitors: true }
      });

      const mockFreshnessStatus = {
        overallStatus: 'fresh' as const,
        products: [{
          id: testProductId,
          name: 'TestFlow Pro',
          needsScraping: false,
          lastSnapshot: new Date().toISOString(),
          daysSinceLastSnapshot: 0
        }],
        competitors: [],
        recommendedActions: []
      };

      await expect(
        compaiBuilder.buildCompAIPrompt(
          projectWithoutCompetitors!,
          'competitive',
          mockFreshnessStatus
        )
      ).rejects.toThrow('No competitors found for project');
    });
  });
});
