/**
 * Enhanced ReportGenerator Sub-service - Task 5.2
 * Migrates comparative report generation from ComparativeReportService
 * Focuses exclusively on markdown report generation with memory optimization
 */

import { createId } from '@paralleldrive/cuid2';
import Handlebars from 'handlebars';
import { logger, generateCorrelationId, trackBusinessEvent, trackErrorWithCorrelation } from '@/lib/logger';
import { BedrockService } from '../../bedrock/bedrock.service';
import { BedrockMessage } from '../../bedrock/types';
import { UserExperienceAnalyzer, UXAnalysisResult } from '../../analysis/userExperienceAnalyzer';
import { createStreamProcessor } from '@/lib/dataProcessing/streamProcessor';
import { memoryManager } from '@/lib/monitoring/memoryMonitoring';
import { prisma } from '@/lib/prisma';
import { Project, Competitor, Snapshot, Product as PrismaProduct, ReportStatus } from '@prisma/client';
import { SmartSchedulingService } from '../../smartSchedulingService';
import { ConversationManager } from '@/lib/chat/conversation';
import { dataIntegrityValidator } from '@/lib/validation/dataIntegrity';
import fs from 'fs/promises';
import path from 'path';
import { 
  ComparativeReport, 
  ComparativeReportSection, 
  ComparativeReportMetadata, 
  ReportGenerationOptions, 
  ReportGenerationResult,
  ReportTemplate,
  ComparativeReportError,
  ReportGenerationError,
  TemplateNotFoundError,
  REPORT_TEMPLATES,
  ComparativeReportTemplate,
  ComparativeReportSectionTemplate,
  ReportChart,
  ReportTable
} from '@/types/comparativeReport';
import { ComparativeAnalysis } from '@/types/analysis';
import { Product, ProductSnapshot } from '@/types/product';
import { 
  getReportTemplate, 
  listAvailableTemplates,
  COMPREHENSIVE_TEMPLATE 
} from '../../reports/comparativeReportTemplates';
import {
  IReportGenerator,
  ComparativeReportRequest,
  ComparativeReportResponse,
  IntelligentReportRequest,
  IntelligentReportResponse,
  InitialReportRequest,
  InitialReportResponse,
  ReportGeneratorConfig
} from './types';

/**
 * Enhanced ReportGenerator Sub-service - Task 5.2
 * Migrates comparative report generation from ComparativeReportService
 * Focuses exclusively on markdown report generation with memory optimization
 */
export class ReportGenerator implements IReportGenerator {
  private bedrockService: BedrockService | null = null;
  private uxAnalyzer: UserExperienceAnalyzer;
  private config: ReportGeneratorConfig;
  private performanceMetrics: Map<string, number[]> = new Map();
  private activeTasks: Map<string, Promise<InitialReportResponse>> = new Map(); // Task 11.4: Concurrent request handling

  constructor(config: ReportGeneratorConfig) {
    this.config = config || {} as ReportGeneratorConfig; // ✅ DEFENSIVE GUARD ADDED
    this.uxAnalyzer = new UserExperienceAnalyzer();
    
    logger.info('ReportGenerator initialized', {
      service: 'ReportGenerator',
      markdownOnly: this.config.markdownOnly,
      maxConcurrency: this.config.maxConcurrency,
      timeout: this.config.timeout
    });
  }

  /**
   * Generate comparative report - migrated from ComparativeReportService.generateComparativeReport()
   */
  async generateComparativeReport(request: ComparativeReportRequest): Promise<ComparativeReportResponse> {
    const startTime = Date.now();
    const correlationId = generateCorrelationId();
    const context = {
      correlationId,
      taskId: request.taskId,
      projectId: request.projectId,
      analysisId: request.analysis?.id,
      productName: request.product?.name,
      reportTemplate: request.options?.template || REPORT_TEMPLATES.COMPREHENSIVE
    };

    try {
      // MEMORY OPTIMIZATION: Take snapshot at start
      const initialMemory = process.memoryUsage();
      
      logger.info('Starting comparative report generation', context);

      // Validate request for comparative reports only (Task 5.2)
      if (request.reportType !== 'comparative') {
               throw new Error('Only comparative reports are supported in unified ReportingService');
      }

      // Get report template
      const template = this.getTemplate(request.options?.template || REPORT_TEMPLATES.COMPREHENSIVE);
      
      // Build report context from analysis
      const reportContext = this.buildReportContext(
        request.analysis!, 
        request.product!, 
        request.productSnapshot!
      );
      
      // MEMORY OPTIMIZATION: Generate report sections using stream processing
      const streamProcessor = createStreamProcessor({
        correlationId,
        operationName: 'report-section-generation',
        batchSize: 1,  // Process one section at a time
        concurrency: 2  // Allow some concurrency, but not too much
      });
      
      // Use stream processing for section generation
      const sections = await streamProcessor.processArray(
        template.sectionTemplates,
        async (sectionTemplate) => {
          const section = await this.generateSection(
            sectionTemplate,
            reportContext,
            request.options || {}
          );
          
          // Clear any large temporary objects after each section is generated
          if (global.gc) global.gc();
          
          return section;
        }
      );
      
      // Build complete report
      const report = this.buildComparativeReport(
        request.analysis!,
        request.product!,
        template,
        sections,
        reportContext,
        request.options || {}
      );

      // Calculate generation metrics
      const generationTime = Date.now() - startTime;
      const tokensUsed = this.estimateTokenUsage(report);
      const cost = this.calculateCost(tokensUsed);
      
      // MEMORY OPTIMIZATION: Take snapshot at end and log memory usage
      const finalMemory = memoryManager.takeSnapshot('report-generation-end');
      const memoryUsed = finalMemory.heapUsed - initialMemory.heapUsed;
      
      logger.info('Comparative report generated successfully', {
        ...context,
        generationTime,
        sectionsCount: sections.length,
        tokensUsed,
        memoryUsedMB: Math.round(memoryUsed / 1024 / 1024)
      });

      trackBusinessEvent('comparative_report_generated', {
        correlationId,
        projectId: request.projectId,
        generationTime,
        sectionsCount: sections.length,
        memoryUsedMB: Math.round(memoryUsed / 1024 / 1024)
      });

      return {
        success: true,
        taskId: request.taskId!,
        projectId: request.projectId,
        report,
        processingTime: generationTime,
        tokensUsed,
        cost,
        warnings: [],
        errors: [],
        dataFreshness: {
          overallStatus: 'FRESH', // TODO: Integrate with data freshness service
          lastUpdated: new Date()
        },
        correlationId
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error('Failed to generate comparative report', error as Error, context);
      
      trackErrorWithCorrelation(
        error as Error,
        correlationId,
        'comparative_report_generation_failed',
        context
      );

      return {
        success: false,
        taskId: request.taskId!,
        projectId: request.projectId,
        processingTime,
        error: (error as Error).message,
        dataFreshness: {
          overallStatus: 'STALE',
          lastUpdated: new Date()
        },
        correlationId
      };
    }
  }

  /**
   * Generate intelligent report - enhanced comparative with AI insights
   */
  async generateIntelligentReport(request: IntelligentReportRequest): Promise<IntelligentReportResponse> {
    const startTime = Date.now();
    const correlationId = generateCorrelationId();

    try {
      logger.info('Generating intelligent report', {
        correlationId,
        projectId: request.projectId,
        enhanceWithAI: request.enhanceWithAI
      });

      // First generate base comparative report
      const baseReportRequest: ComparativeReportRequest = {
        taskId: request.taskId,
        projectId: request.projectId,
        reportType: 'comparative',
        analysis: request.analysis,
        product: request.product,
        productSnapshot: request.productSnapshot,
        options: {
          ...request.options,
          template: request.options?.template || 'comprehensive'
        }
      };

      const baseResult = await this.generateComparativeReport(baseReportRequest);
      
      if (!baseResult.success) {
        throw new Error(`Failed to generate base report: ${baseResult.error}`);
      }

      // Enhance with AI if requested
      let enhancedContent = '';
      if (request.enhanceWithAI && baseResult.report) {
        enhancedContent = await this.generateEnhancedReportContent(
          request.analysis!.id,
          this.getTemplate(request.options?.template || REPORT_TEMPLATES.COMPREHENSIVE),
          request.options || {}
        );
      }

      const processingTime = Date.now() - startTime;

      return {
        success: true,
        report: baseResult.report!,
        taskId: request.taskId!,
        projectId: request.projectId,
        dataFreshnessIndicators: {
          overallStatus: 'FRESH',
          lastDataUpdate: new Date(),
          staleSources: []
        },
        competitiveActivityAlerts: [], // TODO: Implement competitive monitoring
        marketChangeDetection: {
          significantChanges: [],
          trendShifts: [],
          newCompetitors: []
        },
        actionableInsights: this.extractActionableInsights(baseResult.report!),
        enhancedContent,
        processingTime,
        correlationId
      };

    } catch (error) {
      logger.error('Failed to generate intelligent report', error as Error, {
        correlationId,
        projectId: request.projectId
      });

      throw new ReportGenerationError(
        `Failed to generate intelligent report: ${(error as Error).message}`,
        correlationId,
        { projectId: request.projectId }
      );
    }
  }

  /**
   * Generate initial report for new projects
   */
  async generateInitialReport(request: InitialReportRequest): Promise<InitialReportResponse> {
    const startTime = Date.now();
    const correlationId = generateCorrelationId();
    const context = {
      correlationId,
      projectId: request.projectId,
      taskId: request.taskId,
      operation: 'generateInitialReport'
    };

    // Task 11.4: Handle concurrent report generation requests for same project
    const projectKey = request.projectId;
    if (this.activeTasks.has(projectKey)) {
      logger.warn('Concurrent report generation detected, returning existing task', {
        ...context,
        existingTaskProjectId: projectKey
      });
      try {
        return await this.activeTasks.get(projectKey)!;
      } catch (error) {
        // If existing task failed, remove it and continue with new request
        this.activeTasks.delete(projectKey);
        logger.info('Previous task failed, proceeding with new request', context);
      }
    }

    // Create a promise for this task and store it
    const taskPromise = this.executeInitialReportGeneration(request, startTime, correlationId, context);
    this.activeTasks.set(projectKey, taskPromise);

    try {
      const result = await taskPromise;
      return result;
    } finally {
      // Clean up the active task
      this.activeTasks.delete(projectKey);
    }
  }

  private async executeInitialReportGeneration(
    request: InitialReportRequest, 
    startTime: number, 
    correlationId: string, 
    context: any
  ): Promise<InitialReportResponse> {
    try {
      logger.info('Starting initial report generation', context);

      // Task 3.4: Input validation
      if (!request.projectId) {
        throw new ReportGenerationError('Project ID is required', correlationId, { projectId: request.projectId });
      }

      // Task 4.1: Fetch project data including competitors and existing snapshots
      const project = await prisma.project.findUnique({
        where: { id: request.projectId },
        include: {
          product: true,
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

      // Task 4.2: Validate project exists and has assigned competitors  
      if (!project) {
        throw new ReportGenerationError(`Project with ID ${request.projectId} not found`, correlationId, { projectId: request.projectId });
      }

      // Task 11.1: Handle projects with no competitors assigned (Phase 4: Enhanced Edge Case Handling)
      if (!project.competitors || project.competitors.length === 0) {
        if (request.options?.fallbackToPartialData) {
          logger.warn('No competitors found, generating minimal project overview report', context);
          return await this.generateProjectOnlyReport(project, request, correlationId, startTime);
        } else {
          throw new ReportGenerationError(
            `Project ${request.projectId} has no competitors assigned. Add competitors or enable fallbackToPartialData to generate a project-only overview report.`,
            correlationId,
            { projectId: request.projectId, errorType: 'no_competitors_assigned' }
          );
        }
      }

      logger.info('Project data fetched successfully', {
        ...context,
        competitorCount: project.competitors.length,
        productName: project.product?.name
      });

      // Task 4.3: Check for existing competitor snapshots and data freshness
      const competitorsWithSnapshots = project.competitors.filter(comp => comp.snapshots.length > 0);
      const dataCompletenessScore = (competitorsWithSnapshots.length / project.competitors.length) * 100;

      logger.info('Data completeness assessed', {
        ...context,
        dataCompletenessScore,
        competitorsWithData: competitorsWithSnapshots.length,
        totalCompetitors: project.competitors.length
      });

      // Task 4.4: Implement fallback logic for partial data scenarios
      if (dataCompletenessScore < 50 && !request.options?.fallbackToPartialData) {
        throw new ReportGenerationError(
          `Insufficient data for initial report generation (${dataCompletenessScore}% complete). Enable fallbackToPartialData to proceed with partial data.`,
          correlationId,
          { projectId: request.projectId, dataCompletenessScore }
        );
      }

      // Task 5.1: Initialize BedrockService with enhanced error handling (Phase 4: Task 10.1)
      let bedrockService: BedrockService;
      try {
        bedrockService = await this.initializeBedrockService();
      } catch (bedrockError) {
        logger.error('BedrockService initialization failed', bedrockError as Error, {
          ...context,
          errorType: 'bedrock_initialization_failure'
        });
        
        // Task 10.2: Graceful degradation - generate report without AI analysis
        if (request.options?.fallbackToPartialData) {
          logger.warn('Falling back to basic report generation without AI analysis', context);
          return await this.generateFallbackReport(project, request, correlationId, startTime);
        } else {
          throw new ReportGenerationError(
            'AI analysis service unavailable. Enable fallbackToPartialData to generate a basic report without AI insights.',
            correlationId,
            { projectId: request.projectId, errorType: 'bedrock_service_unavailable' }
          );
        }
      }

      // For initial report, we'll use the product snapshot and competitor snapshots to generate a basic report
      let report: ComparativeReport | undefined;

      if (project.product && competitorsWithSnapshots.length > 0) {
        // Create analysis input using available data
        const competitorSnapshots = competitorsWithSnapshots.map(comp => comp.snapshots[0]);
        
        // Task 6.1: Compile analysis results with timeout and error handling (Phase 4: Task 10.3)
        let reportContent: string;
        try {
          // Task 10.3: Add timeout handling for long-running operations
          const analysisPromise = this.generateBasicCompetitiveAnalysis(
            project.product,
            competitorSnapshots,
            bedrockService,
            correlationId
          );
          
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Analysis timeout - operation took longer than 90 seconds')), 90000);
          });
          
          reportContent = await Promise.race([analysisPromise, timeoutPromise]);
          
        } catch (analysisError) {
          logger.error('Analysis generation failed', analysisError as Error, {
            ...context,
            errorType: 'analysis_generation_failure'
          });
          
          // Task 10.2: Graceful degradation for analysis service failures
          if (request.options?.fallbackToPartialData) {
            logger.warn('Falling back to template-based report generation', context);
            reportContent = this.generateFallbackAnalysisContent(project.product, competitorSnapshots);
          } else {
            throw new ReportGenerationError(
              'Failed to generate competitive analysis. Enable fallbackToPartialData to generate a basic template-based report.',
              correlationId,
              { projectId: request.projectId, errorType: 'analysis_generation_failure', originalError: (analysisError as Error).message }
            );
          }
        }

        // Task 6.2: Apply report template formatting (comprehensive template)
        const template = this.getTemplate(REPORT_TEMPLATES.COMPREHENSIVE);
        
        // Task 6.3: Generate report title and metadata
        report = {
          id: createId(),
          title: `Initial Competitive Analysis - ${project.product.name}`,
          content: reportContent,
          format: 'markdown',
          metadata: {
            generatedAt: new Date(),
            projectId: request.projectId,
            competitorCount: competitorsWithSnapshots.length,
            dataCompletenessScore,
            analysisMethod: 'ai_powered' as const,
            reportType: 'initial_competitive',
            correlationId
          },
          sections: []
        };

        logger.info('Initial report generated successfully', {
          ...context,
          reportId: report.id,
          contentLength: report.content.length
        });

        // Phase 3: Database Persistence and File System Storage
        try {
          await this.persistReportToDatabase(report, request.projectId, dataCompletenessScore, correlationId);
          await this.saveReportToFileSystem(report, request.projectId, correlationId);
        } catch (persistenceError) {
          logger.error('Failed to persist report, but generation succeeded', persistenceError as Error, {
            ...context,
            reportId: report.id
          });
          // Continue execution - report generation succeeded even if persistence failed
        }
      }

      const processingTime = Date.now() - startTime;

      const response: InitialReportResponse = {
        success: true,
        taskId: request.taskId || createId(),
        projectId: request.projectId,
        report,
        status: 'completed' as const,
        generatedAt: new Date(),
        processingTime,
        message: report ? 'Initial report generated successfully' : 'Partial report generated with limited data'
      };

      trackBusinessEvent('initial_report_generated', {
        correlationId,
        projectId: request.projectId,
        success: true,
        processingTime,
        dataCompletenessScore
      });

      return response;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error('Failed to generate initial report', error as Error, context);

      trackErrorWithCorrelation(
        error as Error,
        correlationId,
        'initial_report_generation_failed',
        context
      );

      return {
        success: false,
        taskId: request.taskId || createId(),
        projectId: request.projectId,
        status: 'failed' as const,
        generatedAt: new Date(),
        processingTime,
        error: (error as Error).message
      };
    }
  }

  /**
   * Phase 4: Generate fallback report when no AI service available
   */
  private async generateFallbackReport(
    project: any,
    request: InitialReportRequest,
    correlationId: string,
    startTime: number
  ): Promise<InitialReportResponse> {
    logger.info('Generating fallback report without AI analysis', { correlationId, projectId: project.id });
    
    const reportContent = `# Initial Project Overview - ${project.product?.name || 'Unknown Product'}

## Executive Summary
This is a basic project overview generated without AI analysis due to service unavailability.

## Project Information
- **Product Name:** ${project.product?.name || 'Not specified'}
- **Website:** ${project.product?.website || 'Not specified'}
- **Competitors:** ${project.competitors?.length || 0} identified

## Status
This report was generated in fallback mode. For comprehensive competitive analysis, ensure AI services are available and retry.

*Generated: ${new Date().toISOString()}*
*Correlation ID: ${correlationId}*`;

    const report: ComparativeReport = {
      id: createId(),
      title: `Basic Project Overview - ${project.product?.name || 'Unknown Product'}`,
      content: reportContent,
      format: 'markdown',
      metadata: {
        generatedAt: new Date(),
        projectId: project.id,
        competitorCount: project.competitors?.length || 0,
        dataCompletenessScore: 0,
        analysisMethod: 'rule_based' as const,
        reportType: 'fallback_overview',
        correlationId
      },
      sections: []
    };

    return {
      success: true,
      taskId: request.taskId || createId(),
      projectId: project.id,
      report,
      status: 'completed' as const,
      generatedAt: new Date(),
      processingTime: Date.now() - startTime,
      message: 'Fallback report generated without AI analysis'
    };
  }

  /**
   * Phase 4: Generate project-only report when no competitors available
   */
  private async generateProjectOnlyReport(
    project: any,
    request: InitialReportRequest,
    correlationId: string,
    startTime: number
  ): Promise<InitialReportResponse> {
    logger.info('Generating project-only report (no competitors)', { correlationId, projectId: project.id });
    
    const reportContent = `# Project Overview - ${project.product?.name || 'Unknown Product'}

## Product Information
- **Name:** ${project.product?.name || 'Not specified'}
- **Website:** ${project.product?.website || 'Not specified'}
- **Description:** ${project.product?.description || 'No description available'}

## Competitive Analysis Status
No competitors have been assigned to this project yet.

## Recommendations
1. Add competitor companies to enable comprehensive competitive analysis
2. Ensure competitor websites are accessible for data collection
3. Re-run report generation after adding competitors

*Generated: ${new Date().toISOString()}*
*Correlation ID: ${correlationId}*`;

    const report: ComparativeReport = {
      id: createId(),
      title: `Project Overview - ${project.product?.name || 'Unknown Product'}`,
      content: reportContent,
      format: 'markdown',
      metadata: {
        generatedAt: new Date(),
        projectId: project.id,
        competitorCount: 0,
        dataCompletenessScore: 100, // Complete for what's available
        analysisMethod: 'rule_based' as const,
        reportType: 'project_only',
        correlationId
      },
      sections: []
    };

    return {
      success: true,
      taskId: request.taskId || createId(),
      projectId: project.id,
      report,
      status: 'completed' as const,
      generatedAt: new Date(),
      processingTime: Date.now() - startTime,
      message: 'Project-only report generated (no competitors available)'
    };
  }

  /**
   * Phase 4: Generate fallback analysis content without AI
   */
  private generateFallbackAnalysisContent(product: PrismaProduct, competitorSnapshots: Snapshot[]): string {
    return `# Competitive Analysis - ${product.name}

## Executive Summary
This analysis was generated using template-based processing due to AI service unavailability.

## Product Overview
- **Name:** ${product.name}
- **Website:** ${product.website}

## Competitive Landscape
${competitorSnapshots.length} competitors identified:
${competitorSnapshots.map((snapshot, index) => 
  `${index + 1}. **Competitor ${index + 1}** - Data collected on ${snapshot.createdAt}`
).join('\n')}

## Analysis Limitations
This report was generated in fallback mode. For comprehensive AI-powered insights:
1. Ensure AI analysis services are properly configured
2. Verify network connectivity to analysis endpoints
3. Re-run the report generation process

## Next Steps
- Configure AI analysis services
- Collect fresh competitor data
- Generate comprehensive AI-powered analysis

*Generated using fallback template processing*`;
  }

  /**
   * Initialize Bedrock service for AI operations
   */
  private async initializeBedrockService(): Promise<BedrockService> {
    if (!this.bedrockService) {
      this.bedrockService = new BedrockService();
    }
    return this.bedrockService;
  }

  /**
   * Generate basic competitive analysis using AI
   */
  private async generateBasicCompetitiveAnalysis(
    product: PrismaProduct,
    competitorSnapshots: Snapshot[],
    bedrockService: BedrockService,
    correlationId: string
  ): Promise<string> {
    try {
      const competitorData = competitorSnapshots.map(snapshot => ({
        name: snapshot.competitorName,
        content: snapshot.content,
        url: snapshot.url
      }));

      const prompt = `Generate a comprehensive competitive analysis for "${product.name}" (${product.website}) against the following competitors:

${competitorData.map((comp, index) => `
${index + 1}. ${comp.name} (${comp.url})
   Key data: ${comp.content ? comp.content.substring(0, 500) : 'Limited data available'}...
`).join('\n')}

Please provide:
1. Executive Summary
2. Competitive Positioning
3. Key Strengths and Weaknesses
4. Market Opportunities
5. Strategic Recommendations

Format the response in markdown.`;

      const messages: BedrockMessage[] = [{
        role: 'user',
        content: [{ type: 'text', text: prompt }]
      }];

      const analysis = await bedrockService.generateCompletion(messages);
      
      logger.info('Basic competitive analysis generated', {
        correlationId,
        productName: product.name,
        competitorCount: competitorSnapshots.length,
        analysisLength: analysis.length
      });

      return analysis;
    } catch (error) {
      logger.error('Failed to generate basic competitive analysis', error as Error, {
        correlationId,
        productName: product.name
      });
      
      // Return fallback content
      return `# Initial Competitive Analysis - ${product.name}

## Executive Summary
This is an initial competitive analysis for ${product.name}. Due to limited data availability or processing constraints, this represents a basic overview.

## Competitive Landscape
${competitorSnapshots.length} competitors have been identified for analysis.

## Next Steps
- Gather more comprehensive data
- Conduct detailed analysis
- Generate updated reports with fresh insights

*Note: This report was generated automatically and may require manual review.*`;
    }
  }

  /**
   * Phase 3: Persist report to database (Task 7.1-7.4)
   */
  private async persistReportToDatabase(
    report: ComparativeReport,
    projectId: string,
    dataCompletenessScore: number,
    correlationId: string
  ): Promise<void> {
    try {
      // Task 7.1: Create database record in Report table with proper project association
      const dbReport = await prisma.report.create({
        data: {
          id: report.id,
          name: report.title,
          title: report.title,
          description: `Initial competitive analysis report generated automatically`,
          projectId: projectId,
          status: ReportStatus.COMPLETED,
          reportType: 'INITIAL_COMPARATIVE',
          // Task 7.2: Store report metadata and generated content
          isInitialReport: true,
          dataCompletenessScore: Math.round(dataCompletenessScore),
          dataFreshness: 'CURRENT',
          competitorSnapshotsCaptured: report.metadata.competitorCount,
          generationContext: {
            correlationId,
            analysisMethod: report.metadata.analysisMethod,
            generatedAt: report.metadata.generatedAt,
            reportType: report.metadata.reportType,
            projectId: projectId
          },
          generationStartTime: new Date(Date.now() - (report.metadata.processingTime || 0)),
          generationEndTime: new Date()
        }
      });

      // Store the report content as a version
      await prisma.reportVersion.create({
        data: {
          reportId: report.id,
          version: 1,
          content: {
            title: report.title,
            content: report.content,
            format: report.format,
            sections: report.sections,
            metadata: report.metadata
          }
        }
      });

      logger.info('Report persisted to database successfully', {
        correlationId,
        reportId: report.id,
        projectId,
        dbReportId: dbReport.id
      });

    } catch (error) {
      logger.error('Failed to persist report to database', error as Error, {
        correlationId,
        reportId: report.id,
        projectId
      });
      throw error; // Re-throw to be handled by caller
    }
  }

  /**
   * Phase 3: Save report to file system (Task 8.1-8.4)
   */
  private async saveReportToFileSystem(
    report: ComparativeReport,
    projectId: string,
    correlationId: string
  ): Promise<void> {
    try {
      // Task 8.1: Generate unique filename for report file
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `initial-report-${projectId}-${timestamp}.md`;
      
      // Setup reports directory structure
      const reportsDir = path.join(process.cwd(), 'reports');
      const projectReportsDir = path.join(reportsDir, projectId);
      const filePath = path.join(projectReportsDir, filename);

      // Ensure directories exist
      await fs.mkdir(projectReportsDir, { recursive: true });

      // Task 8.2: Write formatted report content to reports directory
      const reportContent = `# ${report.title}

**Generated:** ${report.metadata.generatedAt}
**Project ID:** ${projectId}
**Report ID:** ${report.id}
**Data Completeness:** ${report.metadata.dataCompletenessScore}%
**Analysis Method:** ${report.metadata.analysisMethod}

---

${report.content}

---

*Generated by CompAI Reporting System*
*Correlation ID: ${correlationId}*
`;

      await fs.writeFile(filePath, reportContent, 'utf8');

      // Task 8.3: Verify file creation and readability
      const stats = await fs.stat(filePath);
      const testRead = await fs.readFile(filePath, 'utf8');
      
      if (!testRead || testRead.length === 0) {
        throw new Error('File was created but appears to be empty or unreadable');
      }

      // Task 8.4: Log file location and size for debugging
      logger.info('Report saved to file system successfully', {
        correlationId,
        reportId: report.id,
        projectId,
        filePath,
        fileSize: stats.size,
        contentLength: reportContent.length,
        filename
      });

    } catch (error) {
      logger.error('Failed to save report to file system', error as Error, {
        correlationId,
        reportId: report.id,
        projectId
      });
      throw error; // Re-throw to be handled by caller
    }
  }

  /**
   * Get report template - migrated from ComparativeReportService
   */
  private getTemplate(templateName: string): ComparativeReportTemplate {
    try {
      return getReportTemplate(templateName);
    } catch (error) {
      logger.error('Failed to get report template', error as Error, { templateName });
      throw new TemplateNotFoundError(`Template not found: ${templateName}`);
    }
  }

  /**
   * Build report context from analysis - migrated from ComparativeReportService
   */
  private buildReportContext(
    analysis: ComparativeAnalysis,
    product: Product,
    productSnapshot: ProductSnapshot
  ): ReportContext {
    // Extract competitive intelligence
    const competitorCount = analysis.competitors?.length || 0;
    const overallPosition = analysis.competitivePosition?.marketPosition || 'Unknown';
    const confidenceScore = analysis.metadata?.confidenceScore || 0;

    // Extract key insights
    const keyStrengths = analysis.keyFindings?.strengths || [];
    const keyWeaknesses = analysis.keyFindings?.weaknesses || [];
    const immediateRecommendations = analysis.strategicRecommendations?.immediate || [];

    // Extract feature analysis
    const productFeatures = productSnapshot.features || [];
    const competitorFeatures = analysis.competitors?.map(comp => ({
      competitorName: comp.name,
      features: comp.features || []
    })) || [];

    // Calculate derived metrics
    const uniqueToProduct = this.calculateUniqueFeatures(productFeatures, competitorFeatures);
    const featureGaps = this.calculateFeatureGaps(productFeatures, competitorFeatures);
    const innovationScore = this.calculateInnovationScore(analysis);

    return {
      productName: product.name,
      competitorCount,
      overallPosition,
      opportunityScore: analysis.opportunityScore || 0,
      threatLevel: analysis.threatLevel || 'Medium',
      confidenceScore,
      keyStrengths,
      keyWeaknesses,
      immediateRecommendations,
      productFeatures,
      competitorFeatures,
      uniqueToProduct,
      featureGaps,
      innovationScore,
      primaryMessage: analysis.messaging?.primaryMessage || '',
      valueProposition: analysis.messaging?.valueProposition || '',
      targetAudience: analysis.messaging?.targetAudience || '',
      differentiators: analysis.messaging?.differentiators || [],
      competitorPositioning: analysis.competitors?.map(comp => ({
        competitorName: comp.name,
        primaryMessage: comp.messaging?.primaryMessage || '',
        valueProposition: comp.messaging?.valueProposition || '',
        targetAudience: comp.messaging?.targetAudience || ''
      })) || [],
      marketOpportunities: analysis.marketOpportunities || [],
      messagingEffectiveness: analysis.messaging?.effectivenessScore || 0,
      designQuality: productSnapshot.uxMetrics?.designQuality || 0,
      usabilityScore: productSnapshot.uxMetrics?.usabilityScore || 0,
      navigationStructure: productSnapshot.uxMetrics?.navigationStructure || '',
      keyUserFlows: productSnapshot.uxMetrics?.keyUserFlows || [],
      competitorUX: analysis.competitors?.map(comp => ({
        competitorName: comp.name,
        designQuality: comp.uxMetrics?.designQuality || 0,
        usabilityScore: comp.uxMetrics?.usabilityScore || 0,
        navigationStructure: comp.uxMetrics?.navigationStructure || ''
      })) || [],
      uxStrengths: analysis.uxAnalysis?.strengths || [],
      uxWeaknesses: analysis.uxAnalysis?.weaknesses || [],
      uxRecommendations: analysis.uxAnalysis?.recommendations || [],
      primarySegments: analysis.targetMarket?.primarySegments || [],
      customerTypes: analysis.targetMarket?.customerTypes || [],
      useCases: analysis.targetMarket?.useCases || [],
      competitorTargeting: analysis.competitors?.map(comp => ({
        competitorName: comp.name,
        primarySegments: comp.targetMarket?.primarySegments || [],
        customerTypes: comp.targetMarket?.customerTypes || []
      })) || [],
      targetingOverlap: analysis.targetMarket?.competitorOverlap || [],
      untappedSegments: analysis.targetMarket?.untappedSegments || [],
      competitiveAdvantage: analysis.competitiveAdvantages || [],
      priorityScore: analysis.strategicRecommendations?.priorityScore || 0,
      immediateActions: analysis.strategicRecommendations?.immediate || [],
      shortTermActions: analysis.strategicRecommendations?.shortTerm || [],
      longTermActions: analysis.strategicRecommendations?.longTerm || []
    };
  }

  /**
   * Generate individual report section - migrated from ComparativeReportService
   */
  private async generateSection(
    sectionTemplate: ComparativeReportSectionTemplate,
    context: ReportContext,
    options: ReportGenerationOptions
  ): Promise<ComparativeReportSection> {
    const sectionId = createId();
    
    // Track memory usage for this section if available
    const memoryBefore = process.memoryUsage();
    
    try {
      // Compile the section template with the context
      const compiledTemplate = Handlebars.compile(sectionTemplate.template);
      const content = compiledTemplate(context);
      
      return {
        id: sectionId,
        title: sectionTemplate.title,
        content,
        type: sectionTemplate.type,
        order: sectionTemplate.order
      };
    } finally {
      // Log memory usage if in debug mode
      if (process.env.NODE_ENV === 'development') {
        const memoryAfter = process.memoryUsage();
        const memoryDiff = memoryAfter.heapUsed - memoryBefore.heapUsed;
        logger.debug('Section memory usage', {
          sectionId,
          memoryDiff: `${Math.round(memoryDiff / 1024 / 1024 * 100) / 100}MB`
        });
      }
    }
  }

  /**
   * Build complete comparative report - migrated from ComparativeReportService
   */
  private buildComparativeReport(
    analysis: ComparativeAnalysis,
    product: Product,
    template: ComparativeReportTemplate,
    sections: ComparativeReportSection[],
    context: ReportContext,
    options: ReportGenerationOptions
  ): ComparativeReport {
    const reportId = createId();
    const now = new Date();

    const metadata: ComparativeReportMetadata = {
      productName: product.name,
      productUrl: product.website,
      competitorCount: context.competitorCount,
      analysisDate: analysis.analysisDate,
      reportGeneratedAt: now,
      analysisId: analysis.id,
      analysisMethod: analysis.metadata.analysisMethod,
      confidenceScore: analysis.metadata.confidenceScore,
      dataQuality: analysis.metadata.dataQuality,
      reportVersion: '1.0',
      focusAreas: template.focusAreas,
      analysisDepth: template.analysisDepth
    };

    return {
      id: reportId,
      title: this.generateReportTitle(product.name, template.name),
      description: this.generateReportDescription(product.name, context.competitorCount, template.description),
      projectId: product.projectId,
      productId: product.id,
      analysisId: analysis.id,
      metadata,
      sections,
      executiveSummary: this.extractExecutiveSummary(sections),
      keyFindings: this.extractKeyFindings(context),
      strategicRecommendations: {
        immediate: context.immediateActions,
        shortTerm: context.shortTermActions,
        longTerm: context.longTermActions,
        priorityScore: context.priorityScore
      },
      competitiveIntelligence: {
        marketPosition: context.overallPosition,
        keyThreats: this.extractKeyThreats(context),
        opportunities: context.marketOpportunities,
        competitiveAdvantages: context.competitiveAdvantage
      },
      createdAt: now,
      updatedAt: now,
      status: 'completed',
      format: 'markdown' // Task 5.2: Focus exclusively on markdown format
    };
  }

  /**
   * Generate enhanced report content using AI
   */
  private async generateEnhancedReportContent(
    analysisId: string,
    template: ReportTemplate,
    options: ReportGenerationOptions = {}
  ): Promise<string> {
    const context = { analysisId, template };

    try {
      logger.info('Generating enhanced report content with AI', context);

      const prompt = this.buildEnhancedReportPrompt(template, options);
      const messages: BedrockMessage[] = [
        {
          role: 'user',
          content: [{ type: 'text', text: prompt }]
        }
      ];
      const bedrockService = await this.initializeBedrockService();
      const enhancedContent = await bedrockService.generateCompletion(messages);

      logger.info('Enhanced report content generated successfully', {
        ...context,
        contentLength: enhancedContent.length
      });

      return enhancedContent;

    } catch (error) {
      logger.error('Failed to generate enhanced report content', error as Error, context);
      throw new ReportGenerationError(
        `Failed to generate enhanced report content: ${(error as Error).message}`,
        undefined,
        { analysisId, template }
      );
    }
  }

  // Helper methods for report building
  private calculateUniqueFeatures(productFeatures: string[], competitorFeatures: Array<{competitorName: string; features: string[]}>): string[] {
    const allCompetitorFeatures = competitorFeatures.flatMap(comp => comp.features);
    return productFeatures.filter(feature => !allCompetitorFeatures.includes(feature));
  }

  private calculateFeatureGaps(productFeatures: string[], competitorFeatures: Array<{competitorName: string; features: string[]}>): string[] {
    const allCompetitorFeatures = competitorFeatures.flatMap(comp => comp.features);
    return allCompetitorFeatures.filter(feature => !productFeatures.includes(feature));
  }

  private calculateInnovationScore(analysis: ComparativeAnalysis): number {
    // Simple innovation score calculation based on unique features and market position
    return Math.min(100, (analysis.innovationIndex || 0) * 100);
  }

  private generateReportTitle(productName: string, templateName: string): string {
    return `Comparative Analysis Report: ${productName} - ${templateName}`;
  }

  private generateReportDescription(productName: string, competitorCount: number, templateDescription: string): string {
    return `${templateDescription} - Analysis of ${productName} against ${competitorCount} competitors`;
  }

  private extractExecutiveSummary(sections: ComparativeReportSection[]): string {
    const summarySection = sections.find(section => section.type === 'executive_summary');
    return summarySection?.content || 'Executive summary not available';
  }

  private extractKeyFindings(context: ReportContext): string[] {
    return [
      ...context.keyStrengths.map(strength => `Strength: ${strength}`),
      ...context.keyWeaknesses.map(weakness => `Weakness: ${weakness}`)
    ];
  }

  private extractKeyThreats(context: ReportContext): string[] {
    // Extract threats from competitor positioning and market analysis
    return context.competitorPositioning
      .filter(comp => comp.primaryMessage.toLowerCase().includes('threat'))
      .map(comp => `${comp.competitorName}: ${comp.primaryMessage}`);
  }

  private extractActionableInsights(report: ComparativeReport): string[] {
    return [
      ...report.strategicRecommendations.immediate,
      ...report.strategicRecommendations.shortTerm.slice(0, 3), // Take first 3 short-term actions
      ...report.competitiveIntelligence.opportunities.slice(0, 2) // Take first 2 opportunities
    ];
  }

  private buildEnhancedReportPrompt(template: ReportTemplate, options: ReportGenerationOptions): string {
    return `Generate enhanced insights for a ${template} comparative analysis report. 
    Focus on actionable recommendations and strategic insights. 
    Include market positioning analysis and competitive advantages.
    ${options.includeCharts ? 'Include suggestions for data visualizations.' : ''}
    Provide content in markdown format only.`;
  }

  private estimateTokenUsage(report: ComparativeReport): number {
    // Simple token estimation based on content length
    const totalContent = report.sections.reduce((acc, section) => acc + section.content.length, 0);
    return Math.ceil(totalContent / 4); // Rough estimate: 4 characters per token
  }

  private calculateCost(tokensUsed: number): number {
    // Simple cost calculation - would need to be updated with actual pricing
    const costPerToken = 0.00002; // Example cost
    return tokensUsed * costPerToken;
  }
} 