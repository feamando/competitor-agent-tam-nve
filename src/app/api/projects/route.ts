import { NextRequest, NextResponse } from 'next/server';
import { projectService } from '@/services/projectService';
import { logger, generateCorrelationId, trackBusinessEvent } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { productRepository } from '@/lib/repositories';

// Default mock user for testing without authentication
const DEFAULT_USER_EMAIL = 'mock@example.com';

async function getOrCreateMockUser() {
  let mockUser = await prisma.user.findFirst({
    where: { email: DEFAULT_USER_EMAIL }
  });
  
  if (!mockUser) {
    mockUser = await prisma.user.create({
      data: {
        email: DEFAULT_USER_EMAIL,
        name: 'Mock User'
      }
    });
  }
  return mockUser;
}

// GET /api/projects
export async function GET() {
  try {
    const correlationId = generateCorrelationId();
    const context = { operation: 'GET /api/projects', correlationId };

    logger.info('Fetching projects', context);

    // Get or create mock user for testing
    const mockUser = await getOrCreateMockUser();

    // Fetch projects for mock user
    const projects = await projectService.getProjectsByUserId(mockUser.id);

    logger.info('Projects fetched successfully', {
      ...context,
      projectCount: projects.length
    });

    return NextResponse.json(projects);

  } catch (error) {
    console.error('Error fetching projects:', error);
    const errorObj = error instanceof Error ? error : new Error(String(error));
    logger.error('Error fetching projects', errorObj);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// POST /api/projects - Enhanced with automatic report generation
export async function POST(request: NextRequest) {
  const correlationId = generateCorrelationId();
  const context = { operation: 'POST /api/projects', correlationId };

  try {
    logger.info('Creating new project with automatic report generation', context);

    const json = await request.json();

    // Validate required fields
    if (!json.name) {
      return NextResponse.json({ error: 'Project name is required' }, { status: 400 });
    }

    // Get or create mock user for testing
    const mockUser = await getOrCreateMockUser();

    // Auto-assign all competitors
    const allCompetitors = await prisma.competitor.findMany({
      select: { id: true, name: true }
    });
    const competitorIds = allCompetitors.map(c => c.id);
    
    logger.info(`Auto-assigning ${allCompetitors.length} competitors to project`, {
      ...context,
      projectName: json.name,
      competitorNames: allCompetitors.map(c => c.name)
    });

    // Create project with competitors in transaction
    const result = await prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: {
          name: json.name,
          description: json.description || `Competitive analysis project`,
          status: 'ACTIVE', // Auto-activate projects
          userId: mockUser.id,
          parameters: {
            ...json.parameters || {},
            autoAssignedCompetitors: competitorIds.length > 0,
            assignedCompetitorCount: competitorIds.length,
            frequency: json.frequency || 'weekly',
            autoGenerateInitialReport: json.autoGenerateInitialReport !== false,
            reportTemplate: json.reportTemplate || 'comprehensive',
            hasProduct: !!json.productWebsite,
            productWebsite: json.productWebsite,
            productName: json.productName
          },
          tags: [], // Required field for Prisma schema
          competitors: {
            connect: competitorIds.map((id: string) => ({ id }))
          }
        },
        include: {
          competitors: true,
          products: true,
          reports: {
            orderBy: { createdAt: 'desc' },
            take: 3
          }
        }
      });

      return { project };
    });

    // Create product entity if product information provided
    let productCreated: any = null;
    if (json.productName && json.productWebsite) {
      try {
        logger.info('Creating product entity for project', {
          ...context,
          projectId: result.project.id,
          productName: json.productName,
          productUrl: json.productWebsite
        });

        productCreated = await productRepository.create({
          name: json.productName,
          website: json.productWebsite,
          positioning: json.positioning || 'Competitive product analysis',
          customerData: json.customerData || 'To be analyzed through competitive research',
          userProblem: json.userProblem || 'Market positioning and competitive advantage',
          industry: json.industry || 'General',
          projectId: result.project.id
        });

        trackBusinessEvent('product_created_via_api', {
          ...context,
          projectId: result.project.id,
          productId: productCreated.id,
          productName: productCreated.name,
          productUrl: productCreated.website
        });

        logger.info('Product entity created successfully', {
          ...context,
          projectId: result.project.id,
          productId: productCreated.id
        });
      } catch (productError) {
        logger.error('Failed to create product entity', productError as Error, {
          ...context,
          projectId: result.project.id,
          productName: json.productName
        });
      }
    }

    // NEW: Automatic initial report generation
    let reportGenerationInfo: any = null;
    if (json.autoGenerateInitialReport !== false && competitorIds.length > 0) {
      try {
        logger.info('Generating initial report for project', {
          ...context,
          projectId: result.project.id
        });

        // Use InitialComparativeReportService for automatic report generation
        const { InitialComparativeReportService } = await import('@/services/reports/initialComparativeReportService');
        const initialComparativeReportService = new InitialComparativeReportService();

        const comparativeReport = await initialComparativeReportService.generateInitialComparativeReport(
          result.project.id,
          {
            template: json.reportTemplate || 'comprehensive',
            priority: 'high',
            timeout: 120000, // 2 minutes
            fallbackToPartialData: true,
            notifyOnCompletion: true,
            requireFreshSnapshots: false // Allow existing data for immediate reports
          }
        );

        reportGenerationInfo = {
          initialReportGenerated: true,
          reportId: comparativeReport.id,
          reportTitle: comparativeReport.title,
          reportType: 'comparative',
          generatedAt: comparativeReport.createdAt
        };

        trackBusinessEvent('initial_report_generated_via_api', {
          ...context,
          projectId: result.project.id,
          reportId: comparativeReport.id,
          reportTitle: comparativeReport.title
        });

        logger.info('Initial report generated successfully', {
          ...context,
          projectId: result.project.id,
          reportId: comparativeReport.id
        });
      } catch (reportError) {
        logger.error('Failed to generate initial report', reportError as Error, {
          ...context,
          projectId: result.project.id
        });
        reportGenerationInfo = {
          initialReportGenerated: false,
          error: 'Failed to generate initial report'
        };
      }
    }

    trackBusinessEvent('project_created_via_api', {
      ...context,
      projectId: result.project.id,
      projectName: result.project.name,
      competitorCount: result.project.competitors.length,
      reportGenerationTriggered: !!reportGenerationInfo?.initialReportGenerated
    });

    logger.info('Project created successfully with report generation', {
      ...context,
      projectId: result.project.id,
      projectName: result.project.name,
      competitorCount: result.project.competitors.length,
      reportGenerationInfo
    });

    const responseData = {
      ...result.project,
      product: productCreated,
      reportGeneration: reportGenerationInfo
    };

    return NextResponse.json(responseData, { status: 201 });

  } catch (error) {
    console.error('Error creating project:', error);
    const errorObj = error instanceof Error ? error : new Error(String(error));
    logger.error('Failed to create project', errorObj, context);
    
    return NextResponse.json({ 
      error: 'Failed to create project',
      message: error instanceof Error ? error.message : 'Unknown error',
      correlationId
    }, { status: 500 });
  }
} 