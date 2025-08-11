import { NextRequest, NextResponse } from 'next/server';
import { projectService } from '@/services/projectService';
import { logger, generateCorrelationId, trackBusinessEvent } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { productRepository } from '@/lib/repositories';
import { getAutoReportService } from '@/services/autoReportGenerationService';
import { ensureServicesInitialized } from '@/lib/startup';
import { getOrCreateMockUserWithProfile, ProfileScopedQueries, getCurrentProfileId } from '@/lib/profile/profileUtils';
import { SessionManager, ServerSessionManager } from '@/lib/profile/sessionManager';

// GET /api/projects
export async function GET(request: NextRequest) {
  try {
    const correlationId = generateCorrelationId();
    const context = { operation: 'GET /api/projects', correlationId };

    logger.info('Fetching projects', context);

    // Get profile-scoped projects
    const projects = await ProfileScopedQueries.getProjectsForCurrentProfile();

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

// POST /api/projects - Enhanced with automatic report generation and periodic scheduling
export async function POST(request: NextRequest) {
  const correlationId = generateCorrelationId();
  const context = { operation: 'POST /api/projects', correlationId };

  try {
    // TP-024: Ensure services are initialized on first API call
    await ensureServicesInitialized();
    
    logger.info('Creating new project with automatic report generation and scheduling', context);

    const json = await request.json();

    // Validate required fields
    if (!json.name) {
      return NextResponse.json({ error: 'Project name is required' }, { status: 400 });
    }

    // Get user and profile
    const { user: mockUser, profile } = await getOrCreateMockUserWithProfile();

    // Auto-assign all competitors for current profile
    const allCompetitors = await prisma.competitor.findMany({
      where: { profileId: profile.id },
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
          profileId: profile.id,
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
            fallbackToPartialData: false, // Let the service decide based on data completeness
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

    // Task 2.1: Set up periodic reports (ported from conversation.ts)
    if (json.frequency && ['weekly', 'monthly', 'daily', 'biweekly'].includes(json.frequency.toLowerCase())) {
      try {
        logger.info('Setting up periodic reports for API project', {
          ...context,
          projectId: result.project.id,
          frequency: json.frequency.toLowerCase()
        });
        
        const autoReportService = getAutoReportService();
        const schedule = await autoReportService.schedulePeriodicReports(
          result.project.id,
          json.frequency.toLowerCase() as 'daily' | 'weekly' | 'biweekly' | 'monthly',
          {
            reportTemplate: json.reportTemplate || 'comprehensive'
          }
        );
        
        reportGenerationInfo = {
          ...reportGenerationInfo,
          periodicReportsScheduled: true,
          frequency: json.frequency.toLowerCase(),
          nextScheduledReport: schedule.nextRunTime
        };

        trackBusinessEvent('periodic_reports_scheduled_via_api', {
          ...context,
          projectId: result.project.id,
          frequency: json.frequency.toLowerCase(),
          nextScheduledReport: schedule.nextRunTime.toISOString()
        });

        logger.info('Periodic reports scheduled for API project', {
          ...context,
          projectId: result.project.id,
          frequency: json.frequency.toLowerCase(),
          nextScheduledReport: schedule.nextRunTime.toISOString()
        });
      } catch (scheduleError) {
        logger.error('Failed to schedule periodic reports for API project', scheduleError as Error, {
          ...context,
          projectId: result.project.id,
          frequency: json.frequency
        });
        
        // Continue with project creation but log scheduling failure
        reportGenerationInfo = {
          ...reportGenerationInfo,
          periodicReportsScheduled: false,
          schedulingError: 'Failed to schedule periodic reports'
        };
      }
    }

    trackBusinessEvent('project_created_via_api', {
      ...context,
      projectId: result.project.id,
      projectName: result.project.name,
      competitorCount: result.project.competitors.length,
      reportGenerationTriggered: !!reportGenerationInfo?.initialReportGenerated,
      periodicReportsScheduled: !!reportGenerationInfo?.periodicReportsScheduled
    });

    logger.info('Project created successfully with report generation and scheduling', {
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