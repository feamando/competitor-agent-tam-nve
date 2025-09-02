import { 
  ComparativeAnalysisInput, 
  Competitor, 
  CompetitorSnapshot 
} from '@/types/analysis';
import { ProductWithSnapshots } from '@/types/product';
import { productRepository } from '@/lib/repositories/productRepository';
import { productSnapshotRepository } from '@/lib/repositories/productSnapshotRepository';
import { PrismaClient, Product, ProductSnapshot, Competitor as PrismaCompetitor, Snapshot } from '@prisma/client';

interface ProductWithSnapshotsType extends Product {
  snapshots: ProductSnapshot[];
}

interface CompetitorWithSnapshotsType extends PrismaCompetitor {
  snapshots: Snapshot[];
}

export class AnalysisDataService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  /**
   * Fetches product and competitor data for a comparative analysis
   */
  async prepareAnalysisInput(productId: string, projectId?: string): Promise<ComparativeAnalysisInput> {
    try {
      // Fetch product with latest snapshot
      const product = await productRepository.findById(productId);
      if (!product) {
        throw new Error(`Product with ID ${productId} not found`);
      }

      // Determine project ID
      const resolvedProjectId = projectId || product.projectId;

      // Get latest product snapshot
      const productSnapshot = await productSnapshotRepository.findLatestByProductId(productId);
      if (!productSnapshot) {
        throw new Error(`No snapshots found for product ${productId}`);
      }

      // Fetch competitors for the same project
      const competitors = await this.fetchCompetitorsWithSnapshots(resolvedProjectId);

      // Build the analysis input
      const analysisInput: ComparativeAnalysisInput = {
        product: {
          id: product.id,
          name: product.name,
          website: product.website,
          positioning: product.positioning,
          customerData: product.customerData,
          userProblem: product.userProblem,
          industry: product.industry
        },
        productSnapshot: productSnapshot,
        competitors: competitors,
        analysisConfig: {
          focusAreas: ['features', 'positioning', 'user_experience', 'customer_targeting'],
          depth: 'comprehensive',
          includeRecommendations: true
        }
      };

      console.log('Analysis input prepared successfully', {
        productId,
        projectId: resolvedProjectId,
        competitorCount: competitors.length,
        hasProductSnapshot: !!productSnapshot,
        productSnapshotContentLength: this.getContentLength(productSnapshot)
      });

      return analysisInput;

    } catch (error) {
      console.error('Failed to prepare analysis input', error, { productId, projectId });
      throw error;
    }
  }

  /**
   * Fetches all products for a project for bulk analysis
   */
  async prepareProjectAnalysisInputs(projectId: string): Promise<ComparativeAnalysisInput[]> {
    try {
      // Get all products in the project using repository pattern
      const projectProducts = await this.getProjectProducts(projectId);

      if (projectProducts.length === 0) {
        throw new Error(`No products found for project ${projectId}`);
      }

      // Get competitors for the project
      const competitors = await this.fetchCompetitorsWithSnapshots(projectId);

      // Create analysis inputs for each product
      const analysisInputs: ComparativeAnalysisInput[] = [];

      for (const product of projectProducts) {
        if (product.snapshots.length === 0) {
          console.warn(`Skipping product ${product.id} - no snapshots available`);
          continue;
        }

        const analysisInput: ComparativeAnalysisInput = {
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
          competitors: competitors,
          analysisConfig: {
            focusAreas: ['features', 'positioning', 'user_experience', 'customer_targeting'],
            depth: 'detailed',
            includeRecommendations: true
          }
        };

        analysisInputs.push(analysisInput);
      }

      console.log('Project analysis inputs prepared', {
        projectId,
        productCount: projectProducts.length,
        validInputCount: analysisInputs.length,
        competitorCount: competitors.length
      });

      return analysisInputs;

    } catch (error) {
      console.error('Failed to prepare project analysis inputs', error, { projectId });
      throw error;
    }
  }

  /**
   * Helper method to get products for a project with snapshots
   */
  private async getProjectProducts(projectId: string): Promise<ProductWithSnapshotsType[]> {
    // Use raw query to avoid Prisma client type issues
    const productsWithSnapshots = await this.prisma.$queryRaw<ProductWithSnapshotsType[]>`
      SELECT p.*, 
             COALESCE(
               JSON_AGG(
                 JSON_BUILD_OBJECT(
                   'id', ps.id,
                   'productId', ps."productId",
                   'content', ps.content,
                   'metadata', ps.metadata,
                   'createdAt', ps."createdAt"
                 ) ORDER BY ps."createdAt" DESC
               ) FILTER (WHERE ps.id IS NOT NULL), 
               '[]'::json
             ) as snapshots
      FROM "Product" p
      LEFT JOIN "ProductSnapshot" ps ON p.id = ps."productId"
      WHERE p."projectId" = ${projectId}
      GROUP BY p.id
    `;

    return productsWithSnapshots.map(product => ({
      ...product,
      snapshots: Array.isArray(product.snapshots) ? product.snapshots : []
    }));
  }

  /**
   * Fetches competitors with their latest snapshots for a project
   */
  private async fetchCompetitorsWithSnapshots(projectId: string): Promise<Array<{
    competitor: Competitor;
    snapshot: CompetitorSnapshot;
  }>> {
    try {
      // Fetch competitors associated with the project
      const project = await this.prisma.project.findUnique({
        where: { id: projectId },
        include: {
          competitors: {
            include: {
              snapshots: {
                orderBy: { createdAt: 'desc' },
                take: 1
              }
            }
          }
        }
      });

      if (!project) {
        throw new Error(`Project ${projectId} not found`);
      }

      // Transform competitors to the expected format
      const competitorsWithSnapshots = (project.competitors || []) // ✅ DEFENSIVE GUARD ADDED
        .filter((comp: CompetitorWithSnapshotsType) => comp.snapshots.length > 0) // Only include competitors with snapshots
        .map((comp: CompetitorWithSnapshotsType) => ({
          competitor: {
            id: comp.id,
            name: comp.name,
            website: comp.website,
            description: comp.description,
            industry: comp.industry,
            employeeCount: comp.employeeCount,
            revenue: comp.revenue,
            founded: comp.founded,
            headquarters: comp.headquarters,
            socialMedia: comp.socialMedia,
            createdAt: comp.createdAt,
            updatedAt: comp.updatedAt
          } as Competitor,
          snapshot: {
            id: comp.snapshots[0].id,
            competitorId: comp.snapshots[0].competitorId,
            metadata: comp.snapshots[0].metadata,
            createdAt: comp.snapshots[0].createdAt,
            updatedAt: comp.snapshots[0].updatedAt
          } as CompetitorSnapshot
        }));

      console.log('Competitors with snapshots fetched', {
        projectId,
        totalCompetitors: (project.competitors || []).length, // ✅ DEFENSIVE GUARD ADDED
        competitorsWithSnapshots: competitorsWithSnapshots.length
      });

      return competitorsWithSnapshots;

    } catch (error) {
      console.error('Failed to fetch competitors with snapshots', error, { projectId });
      throw error;
    }
  }

  /**
   * Validates that sufficient data is available for analysis
   */
  async validateAnalysisReadiness(productId: string): Promise<{
    ready: boolean;
    issues: string[];
    recommendations: string[];
  }> {
    const issues: string[] = [];
    const recommendations: string[] = [];

    try {
      // Check product exists
      const product = await productRepository.findById(productId);
      if (!product) {
        issues.push('Product not found');
        return { ready: false, issues, recommendations };
      }

      // Check product snapshot
      const productSnapshot = await productSnapshotRepository.findLatestByProductId(productId);
      if (!productSnapshot) {
        issues.push('No product snapshots available');
        recommendations.push('Run product scraping to collect website data');
      } else {
        const contentLength = this.getContentLength(productSnapshot);
        if (contentLength < 500) {
          issues.push('Product snapshot content is too short for quality analysis');
          recommendations.push('Verify product website is accessible and contains sufficient content');
        }
      }

      // Check competitors
      const competitors = await this.fetchCompetitorsWithSnapshots(product.projectId);
      if (competitors.length === 0) {
        issues.push('No competitors with snapshots found');
        recommendations.push('Add competitors to the project and run competitor scraping');
      } else if (competitors.length < 2) {
        recommendations.push('Add more competitors for more comprehensive analysis');
      }

      // Check competitor content quality
      const lowQualityCompetitors = competitors.filter(c => 
        (c.snapshot.metadata?.text?.length || 0) < 300
      );
      if (lowQualityCompetitors.length > 0) {
        recommendations.push(`${lowQualityCompetitors.length} competitors have insufficient content - consider re-scraping`);
      }

      const ready = issues.length === 0;

      console.log('Analysis readiness validated', {
        productId,
        ready,
        issueCount: issues.length,
        recommendationCount: recommendations.length
      });

      return { ready, issues, recommendations };

    } catch (error) {
      console.error('Failed to validate analysis readiness', error, { productId });
      return {
        ready: false,
        issues: ['Failed to validate analysis readiness'],
        recommendations: ['Check system connectivity and try again']
      };
    }
  }

  /**
   * Gets a summary of available data for analysis
   */
  async getAnalysisDataSummary(projectId: string): Promise<{
    products: number;
    productsWithSnapshots: number;
    competitors: number;
    competitorsWithSnapshots: number;
    totalSnapshots: number;
    lastSnapshotDate?: Date;
  }> {
    try {
      const [products, competitors] = await Promise.all([
        this.getProjectProducts(projectId),
        this.fetchCompetitorsWithSnapshots(projectId)
      ]);

      const productsWithSnapshots = products.filter((p: ProductWithSnapshotsType) => p.snapshots.length > 0).length;
      const totalSnapshots = products.reduce((sum: number, p: ProductWithSnapshotsType) => sum + p.snapshots.length, 0) + 
                            competitors.length;

      // Get latest snapshot date
      const allSnapshotDates = [
        ...products.flatMap((p: ProductWithSnapshotsType) => p.snapshots.map((s: ProductSnapshot) => s.createdAt)),
        ...competitors.map(c => c.snapshot.createdAt)
      ];
      const lastSnapshotDate = allSnapshotDates.length > 0 
        ? new Date(Math.max(...allSnapshotDates.map(d => d.getTime())))
        : undefined;

      return {
        products: products.length,
        productsWithSnapshots,
        competitors: competitors.length,
        competitorsWithSnapshots: competitors.length,
        totalSnapshots,
        lastSnapshotDate
      };

    } catch (error) {
      console.error('Failed to get analysis data summary', error, { projectId });
      throw error;
    }
  }

  private getContentLength(snapshot: any): number {
    const content = snapshot.content;
    if (typeof content === 'string') return content.length;
    return (content?.text || content?.html || '').length;
  }

  async close(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

// Export singleton instance
export const analysisDataService = new AnalysisDataService(); 