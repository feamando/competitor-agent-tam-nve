import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { TrendAnalyzer, TrendAnalysisOptions } from './trends';
import prisma from '@/lib/prisma';
import {
  ReportData,
  ReportSection,
  ReportMetadata,
  ReportVersion,
  APIResponse,
  ValidationError
} from '@/types/reports';
import { z } from 'zod';
import { 
  logger, 
  trackError, 
  trackPerformance, 
  trackBusinessEvent,
  trackDatabaseOperation,
  trackFileSystemOperation,
  trackReportFlow,
  generateCorrelationId
} from './logger';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { StreamingDataProcessor, streamingReportUtils } from './reports/streamingProcessor';
import { MemoryOptimizedReportGenerator } from './reports/memoryOptimizedReports';

// Validation schemas
const reportSectionSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  content: z.string().min(1, 'Content is required'),
  type: z.enum(['summary', 'changes', 'trends', 'recommendations']),
  order: z.number().int().min(0),
});

const reportMetadataSchema = z.object({
  competitor: z.object({
    name: z.string().min(1, 'Competitor name is required'),
    url: z.string().url('Invalid URL'),
  }),
  dateRange: z.object({
    start: z.date(),
    end: z.date(),
  }),
  analysisCount: z.number().int().min(0),
  significantChanges: z.number().int().min(0),
});

const reportDataSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string(),
  sections: z.array(reportSectionSchema),
  metadata: reportMetadataSchema,
  version: z.object({
    number: z.number().int().min(1),
    createdAt: z.date(),
    changeLog: z.string().optional(),
  }).optional(),
});

export interface ReportGenerationOptions {
  maxRetries?: number;
  retryDelay?: number;
  fallbackToSimpleReport?: boolean;
  aiTimeout?: number;
}

export class ReportGenerator {
  private prisma = prisma;
  private bedrock: BedrockRuntimeClient;
  private trendAnalyzer: TrendAnalyzer;
  private streamingProcessor: StreamingDataProcessor;
  private memoryOptimizedGenerator: MemoryOptimizedReportGenerator;
  private readonly defaultOptions: ReportGenerationOptions = {
    maxRetries: 3,
    retryDelay: 1000,
    fallbackToSimpleReport: true,
    aiTimeout: 30000, // 30 seconds
  };

  constructor() {
    logger.info('Initializing ReportGenerator');
    
    try {
      // Use default AWS credential chain if explicit credentials are not provided
      const awsConfig: any = {
        region: process.env.AWS_REGION || 'us-east-1',
      };

      // Only set explicit credentials if they are provided in environment
      if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
        awsConfig.credentials = {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          sessionToken: process.env.AWS_SESSION_TOKEN,
        };
      }
      // Otherwise, let AWS SDK use default credential chain (AWS CLI, IAM roles, etc.)

      this.bedrock = new BedrockRuntimeClient(awsConfig);
      this.trendAnalyzer = new TrendAnalyzer();
      this.streamingProcessor = new StreamingDataProcessor();
      this.memoryOptimizedGenerator = new MemoryOptimizedReportGenerator();
      
      logger.info('ReportGenerator initialized successfully', {
        region: process.env.AWS_REGION || 'us-east-1',
        usingExplicitCredentials: !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY),
        memoryOptimizationEnabled: true
      });
    } catch (error) {
      logger.error('Failed to initialize ReportGenerator', error as Error);
      throw error;
    }
  }

  async generateReport(
    competitorId: string,
    timeframe: number = 30,
    options?: {
      userId?: string;
      changeLog?: string;
      reportName?: string;
      projectId?: string;
      reportOptions?: ReportGenerationOptions;
    }
  ): Promise<APIResponse<ReportData>> {
    return logger.timeOperation('report_generation', async () => {
      const reportOptions = { ...this.defaultOptions, ...options?.reportOptions };
      const correlationId = generateCorrelationId();
      const context = {
        competitorId,
        timeframe,
        userId: options?.userId,
        changeLog: options?.changeLog,
        reportName: options?.reportName,
        projectId: options?.projectId,
        correlationId
      };

      try {
        trackReportFlow('report_generation_started', {
          ...context,
          stepStatus: 'started',
          stepData: { competitorId, timeframe, reportName: options?.reportName, projectId: options?.projectId }
        });

        logger.info('Starting report generation', context);

        // Input validation
        trackReportFlow('input_validation', { ...context, stepStatus: 'started' });
        const inputValidation = this.validateInputs(competitorId, timeframe);
        if (inputValidation) {
          trackReportFlow('input_validation', { 
            ...context, 
            stepStatus: 'failed',
            stepData: { error: 'Input validation failed' }
          });
          return inputValidation;
        }
        trackReportFlow('input_validation', { ...context, stepStatus: 'completed' });

        // Get competitor data with snapshots and analyses
        trackReportFlow('competitor_data_fetch', { ...context, stepStatus: 'started' });
        logger.debug('Fetching competitor data', context);
        
        trackDatabaseOperation('findUnique', 'competitor', {
          ...context,
          recordId: competitorId,
          query: 'competitor with snapshots and analyses'
        });

        const competitor = await this.prisma.competitor.findUnique({
          where: { id: competitorId },
          include: {
            snapshots: {
              include: {
                analyses: {
                  include: {
                    trends: true
                  }
                }
              },
              orderBy: { createdAt: 'desc' },
              take: Math.min(timeframe, 100), // Limit for performance
            },
          },
        });

        if (!competitor) {
          trackReportFlow('competitor_data_fetch', {
            ...context,
            stepStatus: 'failed',
            stepData: { error: 'Competitor not found' }
          });
          trackDatabaseOperation('findUnique', 'competitor', {
            ...context,
            recordId: competitorId,
            success: false,
            error: 'Competitor not found'
          });
          logger.warn('Competitor not found', context);
          return { error: 'Competitor not found' };
        }

        trackReportFlow('competitor_data_fetch', {
          ...context,
          stepStatus: 'completed',
          stepData: { 
            competitorName: competitor.name,
            snapshotsCount: competitor.snapshots?.length || 0
          }
        });

        trackDatabaseOperation('findUnique', 'competitor', {
          ...context,
          recordId: competitorId,
          success: true,
          recordData: {
            name: competitor.name,
            snapshotsCount: competitor.snapshots?.length || 0
          }
        });

        // Ensure snapshots is an array
        if (!Array.isArray(competitor.snapshots)) {
          logger.warn('Competitor snapshots is not an array', {
            ...context,
            snapshotsType: typeof competitor.snapshots
          });
          competitor.snapshots = [];
        }

        // Filter snapshots by timeframe
        trackReportFlow('snapshot_filtering', { ...context, stepStatus: 'started' });
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - timeframe);

        const filteredSnapshots = competitor.snapshots.filter(
          (snapshot: any) => snapshot.createdAt >= startDate
        );

        trackReportFlow('snapshot_filtering', {
          ...context,
          stepStatus: 'completed',
          stepData: {
            totalSnapshots: competitor.snapshots.length,
            filteredSnapshots: filteredSnapshots.length,
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString()
          }
        });

        if (filteredSnapshots.length === 0) {
          trackReportFlow('snapshot_filtering', {
            ...context,
            stepStatus: 'failed',
            stepData: { error: 'No snapshots found in timeframe' }
          });
          logger.info('No snapshots found in timeframe', {
            ...context,
            startDate,
            endDate
          });
          return { error: 'No data available for the specified timeframe' };
        }

        // Analyze trends with enhanced error handling
        trackReportFlow('trend_analysis', { ...context, stepStatus: 'started' });
        logger.debug('Analyzing trends', {
          ...context,
          snapshotsCount: filteredSnapshots.length
        });

        let trends: Array<{ trend: string; impact: number }> = [];
        try {
          trends = await this.trendAnalyzer.analyzeTrends(
            competitorId, 
            timeframe,
            { 
              fallbackToSimpleAnalysis: reportOptions.fallbackToSimpleReport,
              maxRetries: reportOptions.maxRetries,
              retryDelay: reportOptions.retryDelay
            }
          );
          trackReportFlow('trend_analysis', {
            ...context,
            stepStatus: 'completed',
            stepData: { trendsCount: trends.length }
          });
        } catch (trendError) {
          trackReportFlow('trend_analysis', {
            ...context,
            stepStatus: 'failed',
            stepData: { error: (trendError as Error).message }
          });
          logger.warn('Trend analysis failed, continuing with empty trends', {
            ...context,
            error: trendError instanceof Error ? trendError.message : 'Unknown error'
          });
        }

        // Generate report data with enhanced logging
        trackReportFlow('report_data_generation', { ...context, stepStatus: 'started' });
        
        const reportData: ReportData = {
          title: await this.generateTitleWithFallback(
            competitor.name,
            startDate,
            endDate,
            reportOptions
          ),
                     description: await this.generateDescriptionWithFallback(
             {
               name: competitor.name,
               url: competitor.website
             },
             filteredSnapshots.length,
             this.countSignificantChanges(filteredSnapshots),
             trends,
             reportOptions
           ),
          sections: await this.generateSectionsWithRetry(
            competitor,
            trends,
            startDate,
            endDate,
            reportOptions
          ),
          metadata: {
            competitor: {
              name: competitor.name,
              url: competitor.website,
            },
            dateRange: {
              start: startDate,
              end: endDate,
            },
            analysisCount: filteredSnapshots.length,
            significantChanges: this.countSignificantChanges(filteredSnapshots),
          },
          version: {
            number: 1,
            createdAt: new Date(),
            changeLog: options?.changeLog,
          },
        };

        trackReportFlow('report_data_generation', {
          ...context,
          stepStatus: 'completed',
          stepData: {
            title: reportData.title,
            sectionsCount: reportData.sections.length,
            analysisCount: reportData.metadata.analysisCount
          }
        });

        // Validate the generated report
        trackReportFlow('report_validation', { ...context, stepStatus: 'started' });
        try {
          reportDataSchema.parse(reportData);
          trackReportFlow('report_validation', { ...context, stepStatus: 'completed' });
        } catch (validationError) {
          trackReportFlow('report_validation', {
            ...context,
            stepStatus: 'failed',
            stepData: { error: (validationError as Error).message }
          });
          logger.error('Report validation failed', validationError as Error, context);
          return {
            error: 'Generated report failed validation',
            validationErrors: validationError instanceof z.ZodError 
              ? validationError.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
              : [{ field: 'unknown', message: 'Validation failed' }]
          };
        }

        // Save report to database
        trackReportFlow('database_save', { ...context, stepStatus: 'started' });
        let savedReport;
        try {
          trackDatabaseOperation('create', 'report', {
            ...context,
            recordData: {
              name: options?.reportName || reportData.title,
              competitorId,
              description: reportData.description
            }
          });

          savedReport = await this.prisma.report.create({
            data: {
              name: options?.reportName || reportData.title,
              description: reportData.description,
              competitorId,
              projectId: options?.projectId, // Link report to project
              title: reportData.title,
              status: 'COMPLETED',
            },
          });

          trackReportFlow('database_save', {
            ...context,
            stepStatus: 'completed',
            stepData: { reportId: savedReport.id }
          });

          trackDatabaseOperation('create', 'report', {
            ...context,
            recordId: savedReport.id,
            success: true
          });

          logger.info('Report saved to database', {
            ...context,
            reportId: savedReport.id
          });
        } catch (dbError) {
          trackReportFlow('database_save', {
            ...context,
            stepStatus: 'failed',
            stepData: { error: (dbError as Error).message }
          });

          trackDatabaseOperation('create', 'report', {
            ...context,
            success: false,
            error: (dbError as Error).message
          });

          logger.error('Failed to save report to database', dbError as Error, context);
          return { error: 'Failed to save report to database' };
        }

        // Save report version
        trackReportFlow('version_save', { ...context, stepStatus: 'started' });
        try {
          trackDatabaseOperation('create', 'reportVersion', {
            ...context,
            recordData: {
              reportId: savedReport.id,
              version: 1,
              content: reportData
            }
          });

          await this.prisma.reportVersion.create({
            data: {
              reportId: savedReport.id,
              version: 1,
              content: reportData as any,
            },
          });

          trackReportFlow('version_save', { ...context, stepStatus: 'completed' });

          trackDatabaseOperation('create', 'reportVersion', {
            ...context,
            success: true
          });
        } catch (versionError) {
          trackReportFlow('version_save', {
            ...context,
            stepStatus: 'failed',
            stepData: { error: (versionError as Error).message }
          });

          trackDatabaseOperation('create', 'reportVersion', {
            ...context,
            success: false,
            error: (versionError as Error).message
          });

          logger.error('Failed to save report version', versionError as Error, context);
        }

        // Save report to file system
        trackReportFlow('file_save', { ...context, stepStatus: 'started' });
        try {
          const projectName = options?.projectId || options?.reportName || competitor.name;
          await this.saveReportToFile(reportData, savedReport.id, projectName, competitor.name);
          
          trackReportFlow('file_save', {
            ...context,
            stepStatus: 'completed',
            stepData: { projectName }
          });
        } catch (fileError) {
          trackReportFlow('file_save', {
            ...context,
            stepStatus: 'failed',
            stepData: { error: (fileError as Error).message }
          });
          
          // Don't fail the entire operation if file save fails
          logger.error('Failed to save report file, but continuing', fileError as Error, context);
        }

        trackReportFlow('report_generation_completed', {
          ...context,
          stepStatus: 'completed',
          stepData: {
            reportId: savedReport.id,
            title: reportData.title,
            sectionsCount: reportData.sections.length
          }
        });

        trackBusinessEvent('report_generated', {
          competitorId,
          competitorName: competitor.name,
          reportId: savedReport.id,
          sectionsCount: reportData.sections.length,
          analysisCount: reportData.metadata.analysisCount,
          projectId: options?.projectId
        }, context);

        return { data: reportData };

      } catch (error) {
        trackReportFlow('report_generation_error', {
          ...context,
          stepStatus: 'failed',
          stepData: { error: (error as Error).message }
        });

        const enhancedError = this.enhanceReportError(error as Error, 'generateReport');
        logger.error('Report generation failed', enhancedError, context);
        trackError(enhancedError, 'report_generation', context);
        return { error: enhancedError.message };
      }
    });
  }

  /**
   * Generate a comparative report analyzing a product against its competitors
   */
  async generateComparativeReport(
    projectId: string,
    options?: {
      reportName?: string;
      template?: 'comprehensive' | 'executive' | 'technical' | 'strategic';
      focusArea?: 'user_experience' | 'pricing' | 'features' | 'marketing' | 'overall';
      includeRecommendations?: boolean;
      userId?: string;
    }
  ): Promise<APIResponse<ReportData>> {
    return logger.timeOperation('comparative_report_generation', async () => {
      const correlationId = generateCorrelationId();
      const context = {
        projectId,
        correlationId,
        operation: 'generateComparativeReport',
        template: options?.template || 'comprehensive',
        focusArea: options?.focusArea || 'overall'
      };

      try {
        trackReportFlow('comparative_report_generation_started', {
          ...context,
          stepStatus: 'started',
          stepData: {
            projectId,
            reportName: options?.reportName,
            template: options?.template,
            focusArea: options?.focusArea
          }
        });

        logger.info('Starting comparative report generation', context);

        // Validate project exists and has product + competitors
        trackReportFlow('project_validation', { ...context, stepStatus: 'started' });
        
        const project = await this.prisma.project.findUnique({
          where: { id: projectId },
          include: {
            products: {
              include: {
                snapshots: {
                  orderBy: { createdAt: 'desc' },
                  take: 5
                }
              }
            },
            competitors: {
              include: {
                snapshots: {
                  include: {
                    analyses: {
                      include: {
                        trends: true
                      }
                    }
                  },
                  orderBy: { createdAt: 'desc' },
                  take: 5
                }
              }
            }
          }
        });

        if (!project) {
          trackReportFlow('project_validation', {
            ...context,
            stepStatus: 'failed',
            stepData: { error: 'Project not found' }
          });
          logger.warn('Project not found for comparative report', context);
          return { error: 'Project not found' };
        }

        if (!project.products || project.products.length === 0) {
          trackReportFlow('project_validation', {
            ...context,
            stepStatus: 'failed',
            stepData: { error: 'No product found in project' }
          });
          logger.warn('No product found in project', context);
          return { error: 'Project must have a product for comparative analysis' };
        }

        if (!project.competitors || project.competitors.length === 0) {
          trackReportFlow('project_validation', {
            ...context,
            stepStatus: 'failed',
            stepData: { error: 'No competitors found in project' }
          });
          logger.warn('No competitors found in project', context);
          return { error: 'Project must have competitors for comparative analysis' };
        }

        trackReportFlow('project_validation', { ...context, stepStatus: 'completed' });

        // Generate comparative analysis using AI
        trackReportFlow('ai_analysis', { ...context, stepStatus: 'started' });
        
        const analysisResult = await this.performComparativeAnalysis(
          project.products[0],
          project.competitors,
          options || {}
        );

        trackReportFlow('ai_analysis', {
          ...context,
          stepStatus: 'completed',
          stepData: {
            analysisQuality: analysisResult.confidence,
            competitorCount: project.competitors.length
          }
        });

        // Build structured report
        const reportData: ReportData = {
          title: options?.reportName || `Comparative Analysis: ${project.products[0].name} vs Competitors`,
          description: analysisResult.summary,
          sections: [
            {
              title: 'Executive Summary',
              content: analysisResult.summary,
              type: 'summary',
              order: 0
            },
            {
              title: 'Product Strengths',
              content: this.formatStringArray(analysisResult.strengths),
              type: 'summary',
              order: 1
            },
            {
              title: 'Areas for Improvement',
              content: this.formatStringArray(analysisResult.weaknesses),
              type: 'recommendations',
              order: 2
            },
            {
              title: 'Competitive Analysis',
              content: analysisResult.competitorComparisons,
              type: 'changes',
              order: 3
            }
          ],
          metadata: {
            competitor: {
              name: project.products[0].name,
              url: project.products[0].website
            },
            dateRange: {
              start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
              end: new Date()
            },
            analysisCount: project.competitors.length,
            significantChanges: analysisResult.opportunities.length
          }
        };

        if (options?.includeRecommendations !== false) {
          reportData.sections.push({
            title: 'Strategic Recommendations',
            content: this.formatStringArray(analysisResult.recommendations),
            type: 'recommendations',
            order: 4
          });
        }

        // Store the report
        trackReportFlow('report_storage', { ...context, stepStatus: 'started' });
        
        await this.storeComparativeReport(reportData, projectId, correlationId);

        trackReportFlow('report_storage', { ...context, stepStatus: 'completed' });

        trackReportFlow('comparative_report_generation_completed', {
          ...context,
          stepStatus: 'completed',
          stepData: {
            reportTitle: reportData.title,
            sectionCount: reportData.sections.length,
            confidence: analysisResult.confidence
          }
        });

        logger.info('Comparative report generation completed successfully', {
          ...context,
          reportTitle: reportData.title,
          confidence: analysisResult.confidence
        });

        return { data: reportData };

      } catch (error) {
        const enhancedError = this.enhanceReportError(error as Error, 'generateComparativeReport');
        logger.error('Comparative report generation failed', enhancedError, context);
        trackError(enhancedError, 'comparative_report_generation', context);
        return { error: enhancedError.message };
      }
    });
  }

  private async performComparativeAnalysis(
    product: any,
    competitors: any[],
    options: any
  ): Promise<{
    summary: string;
    strengths: string[];
    weaknesses: string[];
    opportunities: string[];
    recommendations: string[];
    competitorComparisons: string;
    confidence: number;
  }> {
    const prompt = this.buildComparativeAnalysisPrompt(product, competitors, options);
    
    try {
      const command = new InvokeModelCommand({
        modelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify({
          anthropic_version: 'bedrock-2023-05-31',
          max_tokens: 4000,
          temperature: 0.3,
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
        }),
      });

      const response = await this.bedrock.send(command);
      const rawResponse = new TextDecoder().decode(response.body);
      const data = JSON.parse(rawResponse);
      
      const analysisText = data.content?.[0]?.text || '';
      
      // Parse the structured response
      return this.parseComparativeAnalysis(analysisText, product, competitors);
      
    } catch (error) {
      logger.error('AI comparative analysis failed, using fallback', error as Error);
      return this.generateFallbackComparativeAnalysis(product, competitors);
    }
  }

  private buildComparativeAnalysisPrompt(product: any, competitors: any[], options: any): string {
    const focusArea = options.focusArea || 'overall';
    const template = options.template || 'comprehensive';

    return `
As a competitive analysis expert, analyze the following product against its competitors with a focus on ${focusArea}.

PRODUCT BEING ANALYZED:
Name: ${product.name}
Website: ${product.website}
Industry: ${product.industry}
Positioning: ${product.positioning}
Customer Problem: ${product.userProblem}

Recent Product Data:
${product.snapshots?.slice(0, 2).map((snapshot: any, index: number) => `
Snapshot ${index + 1} (${new Date(snapshot.createdAt).toLocaleDateString()}):
${JSON.stringify(snapshot.content, null, 2)}
`).join('\n')}

COMPETITORS:
${competitors.map((competitor, index) => `
Competitor ${index + 1}: ${competitor.name}
Website: ${competitor.website}
Industry: ${competitor.industry}

Recent Data:
${competitor.snapshots?.slice(0, 2).map((snapshot: any, snapshotIndex: number) => `
Snapshot ${snapshotIndex + 1} (${new Date(snapshot.createdAt).toLocaleDateString()}):
${JSON.stringify(snapshot.content, null, 2)}
`).join('\n')}
`).join('\n\n')}

Please provide a ${template} competitive analysis focusing on ${focusArea} with the following structure:

EXECUTIVE_SUMMARY:
[2-3 sentence overview of competitive position]

PRODUCT_STRENGTHS:
- [Strength 1]
- [Strength 2]
- [Strength 3]

AREAS_FOR_IMPROVEMENT:
- [Weakness 1]
- [Weakness 2]
- [Weakness 3]

COMPETITOR_COMPARISONS:
[Detailed comparison paragraph highlighting key differences and positioning]

STRATEGIC_RECOMMENDATIONS:
- [Recommendation 1]
- [Recommendation 2]
- [Recommendation 3]

MARKET_OPPORTUNITIES:
- [Opportunity 1]
- [Opportunity 2]

Focus on actionable insights and specific improvements based on the competitive landscape.
`;
  }

  private parseComparativeAnalysis(analysisText: string, product: any, competitors: any[]): any {
    try {
      const sections = {
        summary: this.extractSection(analysisText, 'EXECUTIVE_SUMMARY'),
        strengths: this.extractListSection(analysisText, 'PRODUCT_STRENGTHS'),
        weaknesses: this.extractListSection(analysisText, 'AREAS_FOR_IMPROVEMENT'),
        recommendations: this.extractListSection(analysisText, 'STRATEGIC_RECOMMENDATIONS'),
        opportunities: this.extractListSection(analysisText, 'MARKET_OPPORTUNITIES'),
        competitorComparisons: this.extractSection(analysisText, 'COMPETITOR_COMPARISONS'),
        confidence: 0.85 // Default confidence for successful AI analysis
      };

      return sections;
    } catch (error) {
      logger.error('Failed to parse comparative analysis', error as Error);
      return this.generateFallbackComparativeAnalysis(product, competitors);
    }
  }

  private extractSection(text: string, sectionName: string): string {
    const regex = new RegExp(`${sectionName}:\\s*([\\s\\S]*?)(?=\\n[A-Z_]+:|$)`, 'i');
    const match = text.match(regex);
    return match ? match[1].trim() : '';
  }

  private extractListSection(text: string, sectionName: string): string[] {
    const section = this.extractSection(text, sectionName);
    return section
      .split('\n')
      .filter(line => line.trim().startsWith('-'))
      .map(line => line.replace(/^-\s*/, '').trim())
      .filter(line => line.length > 0);
  }

  private generateFallbackComparativeAnalysis(product: any, competitors: any[]): any {
    return {
      summary: `Competitive analysis of ${product.name} against ${competitors.length} competitors in the ${product.industry} space.`,
      strengths: [
        `Established presence in ${product.industry}`,
        'Clear value proposition',
        'Active web presence'
      ],
      weaknesses: [
        'Competitive landscape analysis needed',
        'Market positioning could be strengthened',
        'Feature comparison required'
      ],
      recommendations: [
        'Conduct detailed feature comparison',
        'Enhance unique value proposition',
        'Monitor competitor activities regularly'
      ],
      opportunities: [
        'Market expansion potential',
        'Feature differentiation opportunities'
      ],
      competitorComparisons: `Analysis shows ${product.name} competes with ${competitors.map(c => c.name).join(', ')} in the ${product.industry} market. Further analysis recommended.`,
      confidence: 0.6
    };
  }

  private formatStringArray(items: string[]): string {
    return items.map(item => `• ${item}`).join('\n');
  }

  private async storeComparativeReport(reportData: ReportData, projectId: string, correlationId: string): Promise<void> {
    try {
      // Store the report in the database
      await this.prisma.report.create({
        data: {
          name: reportData.title,
          description: reportData.description,
          projectId: projectId,
          status: 'COMPLETED',
          title: reportData.title,
          reportType: 'COMPARATIVE',
          versions: {
            create: {
              version: 1,
              content: reportData as any
            }
          }
        }
      });

      logger.info('Comparative report stored successfully', {
        projectId,
        correlationId,
        reportTitle: reportData.title
      });
    } catch (error) {
      logger.error('Failed to store comparative report', error as Error, {
        projectId,
        correlationId
      });
      throw error;
    }
  }

  private validateInputs(competitorId: string, timeframe: number): APIResponse<ReportData> | null {
    if (!competitorId || competitorId.trim() === '') {
      logger.warn('Competitor ID is required');
      return { 
        error: 'Competitor ID is required',
        validationErrors: [{
          field: 'competitorId',
          message: 'Competitor ID is required'
        }]
      };
    }

    if (timeframe <= 0 || timeframe > 365) {
      logger.warn('Invalid timeframe');
      return { 
        error: 'Invalid timeframe. Must be between 1 and 365 days',
        validationErrors: [{
          field: 'timeframe',
          message: 'Timeframe must be between 1 and 365 days'
        }]
      };
    }

    return null;
  }

  private enhanceReportError(error: Error, operation: string): Error {
    if (error.name === 'CredentialsExpiredError' || error.name === 'ExpiredTokenException') {
      const enhancedError = new Error(
        'Report generation failed: AWS credentials have expired. Please refresh your AWS session token.'
      );
      enhancedError.name = 'ReportCredentialsError';
      enhancedError.stack = error.stack;
      return enhancedError;
    }

    if (error.name === 'CredentialsInvalidError') {
      const enhancedError = new Error(
        'Report generation failed: AWS credentials are invalid. Please check your configuration.'
      );
      enhancedError.name = 'ReportCredentialsError';
      enhancedError.stack = error.stack;
      return enhancedError;
    }

    if (error.name === 'InvalidRegionError') {
      const enhancedError = new Error(
        `Report generation failed: AWS Bedrock is not available in region ${process.env.AWS_REGION}. Please use a supported region.`
      );
      enhancedError.name = 'ReportRegionError';
      enhancedError.stack = error.stack;
      return enhancedError;
    }

    if (error.name === 'RateLimitError') {
      const enhancedError = new Error(
        'Report generation failed: AWS Bedrock rate limit exceeded. Please try again later.'
      );
      enhancedError.name = 'ReportRateLimitError';
      enhancedError.stack = error.stack;
      return enhancedError;
    }

    // For database connection errors
    if (error.message.includes('database') || error.message.includes('connection')) {
      const enhancedError = new Error(
        'Report generation failed: Database connection error. Please try again later.'
      );
      enhancedError.name = 'ReportDatabaseError';
      enhancedError.stack = error.stack;
      return enhancedError;
    }

    return error;
  }

  async getReportVersions(reportId: string): Promise<ReportVersion[]> {
    const versions = await this.prisma.reportVersion.findMany({
      where: { reportId },
      orderBy: { version: 'desc' },
      select: {
        id: true,
        version: true,
        content: true,
        createdAt: true,
      },
    });

    return versions.map((version: any) => {
      const content = version.content as any;
      return {
        number: version.version,
        createdAt: version.createdAt,
        changeLog: content?.changeLog || undefined,
      };
    });
  }

  async getReportVersion(versionId: string): Promise<ReportData | null> {
    const version = await this.prisma.reportVersion.findUnique({
      where: { id: versionId },
      include: {
        report: {
          include: {
            competitor: true,
          },
        },
      },
    });

    if (!version) {
      return null;
    }

    const content = version.content as any;
    return {
      title: content.title || '',
      description: content.description || '',
      sections: content.sections || [],
      metadata: content.metadata || {},
      version: {
        number: version.version,
        createdAt: version.createdAt,
        changeLog: content.changeLog || undefined,
      },
    };
  }

  private async generateTitle(
    competitorName: string,
    startDate: Date,
    endDate: Date
  ): Promise<string> {
    const dateRange = this.formatDateRange(startDate, endDate);
    return `Competitive Analysis Report: ${competitorName} - ${dateRange}`;
  }

  private async generateDescription(
    competitor: {
      name: string;
      url: string;
    },
    analysisCount: number,
    significantChanges: number,
    trends: Array<{ trend: string; impact: number }>
  ): Promise<string> {
    const prompt = `
Generate a concise executive summary for a competitive analysis report with the following details:

Competitor: ${competitor.name}
Website: ${competitor.url}
Analysis Period: ${analysisCount} analyses performed
Significant Changes: ${significantChanges} major changes detected

Key Trends:
${trends
  .filter(t => t.impact > 0.5 || t.impact < -0.5)
  .map(t => `- ${t.trend} (Impact: ${(t.impact * 100).toFixed(1)}%)`)
  .join('\n')}

Format the summary in 2-3 sentences, highlighting the most important findings and their business implications.
`;

    try {
      const command = new InvokeModelCommand({
        modelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify({
          anthropic_version: 'bedrock-2023-05-31',
          max_tokens: 300,
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
        }),
      });

      const response = await this.bedrock.send(command);
      const rawResponse = new TextDecoder().decode(response.body);
      const data = JSON.parse(rawResponse);
      
      return data.content?.[0]?.text || `Analysis of ${competitor.name} showing ${significantChanges} significant changes over ${analysisCount} analyses.`;
    } catch (error) {
      logger.error('Failed to generate description', error as Error);
      return `Analysis of ${competitor.name} showing ${significantChanges} significant changes over ${analysisCount} analyses.`;
    }
  }

  private async generateSections(
    competitor: {
      name: string;
      snapshots: Array<{
        analyses: Array<{
          keyChanges: string[];
          marketingChanges: string[];
          productChanges: string[];
        }>;
      }>;
    },
    trends: Array<{ trend: string; impact: number }>,
    startDate: Date,
    endDate: Date
  ): Promise<ReportSection[]> {
    const sections: ReportSection[] = [];

    // Executive Summary
    sections.push({
      title: 'Executive Summary',
      content: await this.generateExecutiveSummary(competitor, trends),
      type: 'summary',
      order: 1,
    });

    // Key Changes
    sections.push({
      title: 'Significant Changes',
      content: await this.generateChangesSection(competitor.snapshots),
      type: 'changes',
      order: 2,
    });

    // Trend Analysis
    sections.push({
      title: 'Trend Analysis',
      content: await this.generateTrendsSection(trends),
      type: 'trends',
      order: 3,
    });

    // Strategic Recommendations
    sections.push({
      title: 'Strategic Recommendations',
      content: await this.generateRecommendations(competitor, trends),
      type: 'recommendations',
      order: 4,
    });

    return sections;
  }

  private async generateExecutiveSummary(
    competitor: { name: string },
    trends: Array<{ trend: string; impact: number }>
  ): Promise<string> {
    const topTrends = trends
      .filter(t => Math.abs(t.impact) > 0.3)
      .slice(0, 3)
      .map(t => `${t.trend} (impact: ${(t.impact * 100).toFixed(1)}%)`)
      .join(', ');
    
    return `Executive summary for ${competitor.name}: Analysis reveals ${trends.length} trends with key developments including ${topTrends || 'steady market position'}. Strategic monitoring continues to track competitive positioning and market opportunities.`;
  }

  private async generateChangesSection(snapshots: Array<{
    analyses: Array<{
      keyChanges: string[];
      marketingChanges: string[];
      productChanges: string[];
    }>;
  }>): Promise<string> {
    const allChanges = snapshots.flatMap(snapshot => 
      snapshot.analyses.flatMap(analysis => [
        ...(Array.isArray(analysis.keyChanges) ? analysis.keyChanges : []),
        ...(Array.isArray(analysis.marketingChanges) ? analysis.marketingChanges : []),
        ...(Array.isArray(analysis.productChanges) ? analysis.productChanges : [])
      ])
    );
    
    if (allChanges.length === 0) {
      return 'No significant changes detected during the analysis period.';
    }
    
    const significantChanges = allChanges.filter(change => change && change.length > 10);
    const summary = significantChanges.slice(0, 5).join('\n• ');
    
    return `Key changes detected:\n• ${summary}${significantChanges.length > 5 ? `\n• ...and ${significantChanges.length - 5} additional changes` : ''}`;
  }

  private async generateTrendsSection(
    trends: Array<{ trend: string; impact: number }>
  ): Promise<string> {
    if (trends.length === 0) {
      return 'No significant trends identified during the analysis period.';
    }
    
    const positiveTrends = trends.filter(t => t.impact > 0.2).slice(0, 3);
    const negativeTrends = trends.filter(t => t.impact < -0.2).slice(0, 3);
    
    let content = 'Trend Analysis:\n\n';
    
    if (positiveTrends.length > 0) {
      content += 'Positive Trends:\n';
      content += positiveTrends.map(t => `• ${t.trend} (${(t.impact * 100).toFixed(1)}% impact)`).join('\n');
      content += '\n\n';
    }
    
    if (negativeTrends.length > 0) {
      content += 'Areas of Concern:\n';
      content += negativeTrends.map(t => `• ${t.trend} (${(Math.abs(t.impact) * 100).toFixed(1)}% negative impact)`).join('\n');
    }
    
    return content.trim() || 'Market trends are stable with no significant changes detected.';
  }

  private async generateRecommendations(
    competitor: { name: string },
    trends: Array<{ trend: string; impact: number }>
  ): Promise<string> {
    const highImpactTrends = trends.filter(t => Math.abs(t.impact) > 0.5);
    
    if (highImpactTrends.length === 0) {
      return `Strategic Recommendations for ${competitor.name}:\n\n• Continue monitoring competitive position\n• Maintain current market strategy\n• Review analysis quarterly for emerging trends`;
    }
    
    let recommendations = `Strategic Recommendations for ${competitor.name}:\n\n`;
    
    highImpactTrends.slice(0, 3).forEach((trend, index) => {
      if (trend.impact > 0) {
        recommendations += `• Leverage ${trend.trend.toLowerCase()} opportunity for competitive advantage\n`;
      } else {
        recommendations += `• Address ${trend.trend.toLowerCase()} to mitigate competitive risk\n`;
      }
    });
    
    recommendations += `• Implement regular monitoring of identified trends\n`;
    recommendations += `• Review strategy alignment with market developments`;
    
    return recommendations;
  }

  private countSignificantChanges(snapshots: Array<{
    analyses: Array<{
      data?: any;
    }>;
  }>): number {
    return snapshots.reduce((total, snapshot) => {
      return total + snapshot.analyses.reduce((count, analysis) => {
        const data = analysis.data as any;
        const changes = [
          ...(data?.primary?.keyChanges || []),
          ...(data?.primary?.marketingChanges || []),
          ...(data?.primary?.productChanges || [])
        ];
        return count + changes.filter(change => 
          change && typeof change === 'string' && change.length > 10
        ).length;
      }, 0);
    }, 0);
  }

  private formatDateRange(startDate: Date, endDate: Date): string {
    const options: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    };
    return `${startDate.toLocaleDateString(undefined, options)} - ${endDate.toLocaleDateString(
      undefined,
      options
    )}`;
  }

  private async generateTitleWithFallback(
    competitorName: string,
    startDate: Date,
    endDate: Date,
    options: ReportGenerationOptions
  ): Promise<string> {
    try {
      return await this.generateTitle(competitorName, startDate, endDate);
    } catch (error) {
      logger.warn('AI title generation failed, using fallback', { 
        competitorName,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return `${competitorName} Competitive Analysis - ${this.formatDateRange(startDate, endDate)}`;
    }
  }

  private async generateDescriptionWithFallback(
    competitor: { name: string; url: string },
    analysisCount: number,
    significantChanges: number,
    trends: Array<{ trend: string; impact: number }>,
    options: ReportGenerationOptions
  ): Promise<string> {
    try {
      return await this.generateDescription(competitor, analysisCount, significantChanges, trends);
    } catch (error) {
      logger.warn('AI description generation failed, using fallback', { 
        competitorName: competitor.name,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return `Comprehensive analysis of ${competitor.name} covering ${analysisCount} data points with ${significantChanges} significant changes detected. This report provides insights into competitive positioning, market trends, and strategic recommendations based on ${trends.length} identified trends.`;
    }
  }

  private async generateSectionsWithRetry(
    competitor: any,
    trends: Array<{ trend: string; impact: number }>,
    startDate: Date,
    endDate: Date,
    options: ReportGenerationOptions
  ): Promise<ReportSection[]> {
    try {
      return await this.generateSections(competitor, trends, startDate, endDate);
    } catch (error) {
      logger.warn('AI section generation failed, using fallback', { 
        competitorName: competitor.name,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      if (options.fallbackToSimpleReport) {
        return this.generateFallbackSections(competitor, trends);
      } else {
        throw error;
      }
    }
  }

  private generateFallbackSections(
    competitor: any,
    trends: Array<{ trend: string; impact: number }>
  ): ReportSection[] {
    const sections: ReportSection[] = [];

    // Executive Summary
    sections.push({
      title: 'Executive Summary',
      content: `This report analyzes ${competitor.name}'s competitive position based on available data. ${trends.length} key trends have been identified, indicating ${trends.length > 0 ? 'active market development' : 'stable market conditions'}.`,
      type: 'summary',
      order: 1,
    });

    // Key Changes
    const allChanges = competitor.snapshots.flatMap((snapshot: any) => 
      snapshot.analyses.flatMap((analysis: any) => [
        ...(Array.isArray(analysis.keyChanges) ? analysis.keyChanges : []),
        ...(Array.isArray(analysis.marketingChanges) ? analysis.marketingChanges : []),
        ...(Array.isArray(analysis.productChanges) ? analysis.productChanges : [])
      ])
    );

    sections.push({
      title: 'Significant Changes',
      content: allChanges.length > 0 
        ? `Key changes detected:\n• ${allChanges.slice(0, 5).join('\n• ')}`
        : 'No significant changes detected during the analysis period.',
      type: 'changes',
      order: 2,
    });

    // Trend Analysis
    sections.push({
      title: 'Trend Analysis',
      content: trends.length > 0
        ? `Trends identified:\n• ${trends.map(t => `${t.trend} (${(t.impact * 100).toFixed(1)}% impact)`).join('\n• ')}`
        : 'No significant trends identified during the analysis period.',
      type: 'trends',
      order: 3,
    });

    // Strategic Recommendations
    sections.push({
      title: 'Strategic Recommendations',
      content: `Strategic recommendations for ${competitor.name}:\n• Continue monitoring competitive position\n• Review market developments regularly\n• Analyze competitor responses to market changes`,
      type: 'recommendations',
      order: 4,
    });

    return sections;
  }

  private async saveReportToFile(reportData: ReportData, reportId: string, projectName: string, competitorName: string): Promise<void> {
    const context = { reportId, projectName, competitorName };
    
    try {
                    // Create reports directory if it doesn't exist
       const reportsDir = join(process.cwd(), 'reports');
       await mkdir(reportsDir, { recursive: true });

              trackFileSystemOperation('mkdir', reportsDir);

       // Generate filename with timestamp
       const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
       const sanitizedProjectName = projectName.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
       const filename = `${sanitizedProjectName}_${timestamp}.md`;
       const filePath = join(reportsDir, filename);

       // Convert report data to markdown
       const markdownContent = this.convertToMarkdown(reportData);

       // Write file
       await writeFile(filePath, markdownContent, 'utf-8');

       trackFileSystemOperation('writeFile', filePath);

      logger.info('Report file saved', {
        reportId,
        filename,
        filePath,
        competitorName,
        fileSize: markdownContent.length
      });

      trackBusinessEvent('report_file_saved', {
        reportId,
        filename,
        filePath,
        competitorName,
        projectName,
        fileSize: markdownContent.length
      }, context);

    } catch (error) {
             trackFileSystemOperation('saveReportToFile', 'reports');

      logger.error('Failed to save report file', error as Error, {
        reportId,
        competitorName
      });
      throw error;
    }
  }

  private convertToMarkdown(reportData: ReportData): string {
    let markdown = `# ${reportData.title}\n\n`;
    
    if (reportData.description) {
      markdown += `${reportData.description}\n\n`;
    }

    // Add metadata
    markdown += `## Report Details\n\n`;
    markdown += `- **Competitor**: ${reportData.metadata.competitor.name}\n`;
    markdown += `- **Website**: ${reportData.metadata.competitor.url}\n`;
    markdown += `- **Analysis Period**: ${this.formatDateRange(reportData.metadata.dateRange.start, reportData.metadata.dateRange.end)}\n`;
    markdown += `- **Data Points Analyzed**: ${reportData.metadata.analysisCount}\n`;
    markdown += `- **Significant Changes**: ${reportData.metadata.significantChanges}\n`;
    markdown += `- **Generated**: ${new Date().toLocaleString()}\n\n`;

    // Add sections
    const sortedSections = reportData.sections.sort((a, b) => a.order - b.order);
    for (const section of sortedSections) {
      markdown += `## ${section.title}\n\n`;
      markdown += `${section.content}\n\n`;
    }

    // Add footer
    markdown += `---\n\n`;
    markdown += `*This report was generated automatically by the Competitor Research Agent.*\n`;

    return markdown;
  }

  /**
   * Memory-optimized comparative report generation
   */
  async generateMemoryOptimizedComparativeReport(
    projectId: string,
    options?: {
      reportName?: string;
      template?: 'comprehensive' | 'executive' | 'technical' | 'strategic';
      focusArea?: 'user_experience' | 'pricing' | 'features' | 'marketing' | 'overall';
      includeRecommendations?: boolean;
      userId?: string;
    }
  ): Promise<APIResponse<ReportData>> {
    // Delegate to memory-optimized generator
    return this.memoryOptimizedGenerator.generateOptimizedComparativeReport(projectId, options);
  }

  /**
   * Replace large JSON.stringify operations with selective serialization
   */
  private serializeSelectively(obj: any, maxDepth: number = 3, maxStringLength: number = 1000): string {
    return StreamingDataProcessor.selectiveSerialize(obj, {
      maxDepth,
      maxStringLength,
      excludeFields: ['snapshots', 'analyses', 'content'] // Exclude heavy fields
    });
  }

  /**
   * Process competitors in chunks to limit memory usage
   */
  private async processCompetitorsInChunks<T>(
    competitors: T[],
    processor: (chunk: T[]) => Promise<any>,
    chunkSize: number = 2
  ): Promise<any[]> {
    const results: any[] = [];
    const chunks = this.chunkArray(competitors, chunkSize);

    logger.info('Processing competitors in memory-optimized chunks', {
      totalCompetitors: competitors.length,
      chunksCount: chunks.length,
      chunkSize
    });

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      
      // Process chunk
      const chunkResult = await processor(chunk);
      results.push(chunkResult);
      
      // Memory cleanup after each chunk
      await this.cleanupMemoryAfterChunk();
      
      // Progress logging
      logger.debug('Processed competitor chunk', {
        chunkIndex: i + 1,
        totalChunks: chunks.length,
        competitorsInChunk: chunk.length
      });
    }

    logger.info('All competitor chunks processed', {
      totalChunks: chunks.length,
      totalResults: results.length
    });

    return results;
  }

  /**
   * Chunk array utility
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * Memory cleanup after processing chunks
   */
  private async cleanupMemoryAfterChunk(): Promise<void> {
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
    
    // Small delay to allow cleanup
    await new Promise(resolve => setTimeout(resolve, 50));
    
    logger.debug('Memory cleanup completed after chunk processing');
  }

  /**
   * Enhanced buildComparativeAnalysisPrompt with size limits
   */
  private buildOptimizedPrompt(product: any, competitors: any[], options: any): string {
    // Limit competitors to max 2 per prompt to prevent memory bloat
    const limitedCompetitors = competitors.slice(0, 2);
    
    // Use selective serialization for prompt content
    const productData = this.serializeSelectively(product, 2, 500);
    const competitorData = limitedCompetitors.map(c => this.serializeSelectively(c, 2, 500));
    
    const focusArea = options.focusArea || 'overall';
    const template = options.template || 'comprehensive';

    return `
As a competitive analysis expert, analyze the following product against its competitors with a focus on ${focusArea}.

PRODUCT BEING ANALYZED:
${productData}

COMPETITORS (Limited to ${limitedCompetitors.length} for memory efficiency):
${competitorData.map((data, index) => `
Competitor ${index + 1}:
${data}
`).join('\n')}

Please provide a ${template} competitive analysis focusing on ${focusArea} with the following structure:

EXECUTIVE_SUMMARY:
[2-3 sentence overview of competitive position]

PRODUCT_STRENGTHS:
- [Strength 1]
- [Strength 2]
- [Strength 3]

AREAS_FOR_IMPROVEMENT:
- [Weakness 1]
- [Weakness 2]
- [Weakness 3]

COMPETITOR_COMPARISONS:
[Detailed comparison paragraph highlighting key differences and positioning]

STRATEGIC_RECOMMENDATIONS:
- [Recommendation 1]
- [Recommendation 2]
- [Recommendation 3]

MARKET_OPPORTUNITIES:
- [Opportunity 1]
- [Opportunity 2]

Focus on actionable insights and specific improvements based on the competitive landscape.
IMPORTANT: Keep response under 2000 words for memory efficiency.
`;
  }

  /**
   * Monitor memory usage during report generation
   */
  private logMemoryUsage(operation: string): void {
    try {
      const usage = process.memoryUsage();
      const memoryMB = {
        heapUsed: Math.round(usage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(usage.heapTotal / 1024 / 1024),
        external: Math.round(usage.external / 1024 / 1024),
        rss: Math.round(usage.rss / 1024 / 1024)
      };

      logger.info(`Memory usage during ${operation}`, memoryMB);

      // Warn if memory usage is high
      if (memoryMB.heapUsed > 400) {
        logger.warn('High memory usage detected', {
          operation,
          heapUsedMB: memoryMB.heapUsed,
          threshold: 400
        });
      }
    } catch (error) {
      logger.debug('Could not log memory usage', { operation });
    }
  }
} 