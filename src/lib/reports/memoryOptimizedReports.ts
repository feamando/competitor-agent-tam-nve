import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { TrendAnalyzer } from '../trends';
import prisma from '@/lib/prisma';
import {
  ReportData,
  ReportSection,
  ReportMetadata,
  APIResponse,
} from '@/types/reports';
import { logger, generateCorrelationId, trackBusinessEvent } from '../logger';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

// Memory optimization constants
const MAX_COMPETITORS_PER_CHUNK = 2;
const MAX_SNAPSHOTS_PER_COMPETITOR = 5;
const MAX_CONTENT_SIZE_KB = 50;
const CLEANUP_DELAY_MS = 100;

// Streaming data processor interface
interface DataChunk {
  competitorId: string;
  competitorName: string;
  data: any;
  size: number;
}

interface ProcessingContext {
  totalMemoryUsed: number;
  processedChunks: number;
  startTime: number;
  correlationId: string;
}

/**
 * Memory-optimized report generator with streaming data processing
 */
export class MemoryOptimizedReportGenerator {
  private prisma = prisma;
  private bedrock: BedrockRuntimeClient;
  private trendAnalyzer: TrendAnalyzer;
  private processingContext?: ProcessingContext;

  constructor() {
    logger.info('Initializing MemoryOptimizedReportGenerator');
    
    try {
      const awsConfig: any = {
        region: process.env.AWS_REGION || 'us-east-1',
      };

      if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
        awsConfig.credentials = {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          sessionToken: process.env.AWS_SESSION_TOKEN,
        };
      }

      this.bedrock = new BedrockRuntimeClient(awsConfig);
      this.trendAnalyzer = new TrendAnalyzer();
      
      logger.info('MemoryOptimizedReportGenerator initialized successfully', {
        region: process.env.AWS_REGION || 'us-east-1',
        maxCompetitorsPerChunk: MAX_COMPETITORS_PER_CHUNK,
        maxSnapshotsPerCompetitor: MAX_SNAPSHOTS_PER_COMPETITOR
      });
    } catch (error) {
      logger.error('Failed to initialize MemoryOptimizedReportGenerator', error as Error);
      throw error;
    }
  }

  /**
   * Generate a comparative report with memory optimization
   */
  async generateOptimizedComparativeReport(
    projectId: string,
    options?: {
      reportName?: string;
      template?: 'comprehensive' | 'executive' | 'technical' | 'strategic';
      focusArea?: 'user_experience' | 'pricing' | 'features' | 'marketing' | 'overall';
      includeRecommendations?: boolean;
      userId?: string;
    }
  ): Promise<APIResponse<ReportData>> {
    const correlationId = generateCorrelationId();
    const context: ProcessingContext = {
      totalMemoryUsed: 0,
      processedChunks: 0,
      startTime: Date.now(),
      correlationId
    };
    this.processingContext = context;

    try {
      logger.info('Starting memory-optimized comparative report generation', {
        projectId,
        correlationId,
        template: options?.template || 'comprehensive'
      });

      // Validate project and get basic info without loading all data
      const project = await this.validateProjectLight(projectId);
      if (!project.success) {
        return { error: project.error };
      }

      // Get competitor IDs for chunked processing
      const competitorIds = await this.getCompetitorIds(projectId);
      if (competitorIds.length === 0) {
        return { error: 'No competitors found for analysis' };
      }

      // Process competitors in chunks to limit memory usage
      const reportSections: ReportSection[] = [];
      const competitorChunks = this.chunkArray(competitorIds, MAX_COMPETITORS_PER_CHUNK);
      
      logger.info('Processing competitors in memory-optimized chunks', {
        totalCompetitors: competitorIds.length,
        chunksCount: competitorChunks.length,
        maxPerChunk: MAX_COMPETITORS_PER_CHUNK,
        correlationId
      });

      for (let i = 0; i < competitorChunks.length; i++) {
        const chunk = competitorChunks[i];
        const chunkSections = await this.processCompetitorChunk(
          chunk,
          i,
          projectId,
          options || {}
        );
        
        reportSections.push(...chunkSections);
        
        // Cleanup after each chunk
        await this.cleanupChunk(chunk);
        
        // Brief pause to allow garbage collection
        if (i < competitorChunks.length - 1) {
          await this.pauseForCleanup();
        }
      }

      // Build final report with selective serialization
      const reportData = await this.buildOptimizedReport(
        reportSections,
        project.data,
        competitorIds.length,
        options || {}
      );

      // Store report with memory-conscious approach
      await this.storeReportOptimized(reportData, projectId, correlationId);

      const processingTime = Date.now() - context.startTime;
      logger.info('Memory-optimized comparative report completed', {
        projectId,
        correlationId,
        processingTime,
        totalMemoryUsed: context.totalMemoryUsed,
        processedChunks: context.processedChunks,
        sectionsGenerated: reportSections.length
      });

      // Final cleanup
      await this.finalCleanup();

      return { data: reportData };

    } catch (error) {
      logger.error('Memory-optimized report generation failed', error as Error, {
        projectId,
        correlationId,
        memoryUsed: context.totalMemoryUsed
      });
      
      // Ensure cleanup on error
      await this.finalCleanup();
      
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Validate project without loading full data
   */
  private async validateProjectLight(projectId: string): Promise<{
    success: boolean;
    error?: string;
    data?: { name: string; id: string; productName?: string };
  }> {
    try {
      const project = await this.prisma.project.findUnique({
        where: { id: projectId },
        select: {
          id: true,
          name: true,
          products: {
            select: { name: true, website: true },
            take: 1
          },
          _count: {
            select: {
              competitors: true,
              products: true
            }
          }
        }
      });

      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      if (project._count.products === 0) {
        return { success: false, error: 'Project must have a product for comparative analysis' };
      }

      if (project._count.competitors === 0) {
        return { success: false, error: 'Project must have competitors for comparative analysis' };
      }

      return {
        success: true,
        data: {
          id: project.id,
          name: project.name,
          productName: project.products[0]?.name
        }
      };
    } catch (error) {
      logger.error('Project validation failed', error as Error, { projectId });
      return { success: false, error: 'Failed to validate project' };
    }
  }

  /**
   * Get competitor IDs without loading full data
   */
  private async getCompetitorIds(projectId: string): Promise<string[]> {
    try {
      const competitors = await this.prisma.competitor.findMany({
        where: {
          projects: {
            some: { id: projectId }
          }
        },
        select: { id: true },
        orderBy: { name: 'asc' }
      });

      return competitors.map(c => c.id);
    } catch (error) {
      logger.error('Failed to get competitor IDs', error as Error, { projectId });
      return [];
    }
  }

  /**
   * Process a chunk of competitors with memory limits
   */
  private async processCompetitorChunk(
    competitorIds: string[],
    chunkIndex: number,
    projectId: string,
    options: any
  ): Promise<ReportSection[]> {
    const startMemory = this.estimateMemoryUsage();
    
    logger.info('Processing competitor chunk', {
      chunkIndex,
      competitorIds: competitorIds.length,
      correlationId: this.processingContext?.correlationId
    });

    try {
      // Load competitor data with selective fields and limits
      const competitors = await this.loadCompetitorsSelective(competitorIds);
      
      // Process each competitor with streaming approach
      const sections: ReportSection[] = [];
      
      for (const competitor of competitors) {
        const competitorSections = await this.processCompetitorStreaming(
          competitor,
          chunkIndex,
          options
        );
        sections.push(...competitorSections);
        
        // Clean up competitor data immediately after processing
        await this.cleanupCompetitorData(competitor);
      }

      const endMemory = this.estimateMemoryUsage();
      const chunkMemoryUsage = endMemory - startMemory;
      
      if (this.processingContext) {
        this.processingContext.totalMemoryUsed += chunkMemoryUsage;
        this.processingContext.processedChunks++;
      }

      logger.info('Competitor chunk processed', {
        chunkIndex,
        sectionsGenerated: sections.length,
        memoryUsage: chunkMemoryUsage,
        correlationId: this.processingContext?.correlationId
      });

      return sections;

    } catch (error) {
      logger.error('Failed to process competitor chunk', error as Error, {
        chunkIndex,
        competitorIds
      });
      throw error;
    }
  }

  /**
   * Load competitors with selective fields to minimize memory usage
   */
  private async loadCompetitorsSelective(competitorIds: string[]): Promise<any[]> {
    try {
      return await this.prisma.competitor.findMany({
        where: {
          id: { in: competitorIds }
        },
        select: {
          id: true,
          name: true,
          website: true,
          industry: true,
          snapshots: {
            select: {
              id: true,
              createdAt: true,
              content: true,
              analyses: {
                select: {
                  id: true,
                  keyChanges: true,
                  marketingChanges: true,
                  productChanges: true,
                  trends: {
                    select: {
                      trend: true,
                      impact: true
                    }
                  }
                },
                take: 3 // Limit analyses per snapshot
              }
            },
            orderBy: { createdAt: 'desc' },
            take: MAX_SNAPSHOTS_PER_COMPETITOR
          }
        }
      });
    } catch (error) {
      logger.error('Failed to load selective competitor data', error as Error, {
        competitorIds
      });
      throw error;
    }
  }

  /**
   * Process competitor using streaming approach to minimize memory footprint
   */
  private async processCompetitorStreaming(
    competitor: any,
    chunkIndex: number,
    options: any
  ): Promise<ReportSection[]> {
    try {
      const sections: ReportSection[] = [];
      
      // Process snapshots in streaming fashion
      const streamedData = await this.streamCompetitorData(competitor);
      
      // Generate analysis with content size limits
      const analysis = await this.generateLimitedAnalysis(
        streamedData,
        competitor.name,
        options
      );
      
      // Create section with memory-conscious content
      const section: ReportSection = {
        title: `${competitor.name} Analysis`,
        content: this.limitContentSize(analysis.content),
        type: 'changes',
        order: chunkIndex + 1
      };
      
      sections.push(section);
      
      // Explicitly null large objects for GC
      streamedData.snapshots = null;
      streamedData.rawContent = null;
      
      return sections;
      
    } catch (error) {
      logger.error('Failed to process competitor streaming', error as Error, {
        competitorId: competitor.id,
        competitorName: competitor.name
      });
      
      // Return fallback section on error
      return [{
        title: `${competitor.name} Analysis`,
        content: 'Analysis data unavailable due to processing error.',
        type: 'changes',
        order: chunkIndex + 1
      }];
    }
  }

  /**
   * Stream competitor data to avoid loading everything into memory
   */
  private async streamCompetitorData(competitor: any): Promise<{
    competitorId: string;
    competitorName: string;
    snapshots: any[] | null;
    rawContent: any | null;
    keyChanges: string[];
    trends: Array<{ trend: string; impact: number }>;
  }> {
    try {
      // Process snapshots incrementally
      const keyChanges: string[] = [];
      const trends: Array<{ trend: string; impact: number }> = [];
      
      if (competitor.snapshots && Array.isArray(competitor.snapshots)) {
        for (const snapshot of competitor.snapshots) {
          // Process snapshot content with size limits
          const processedContent = this.processSnapshotSelective(snapshot);
          
          if (processedContent.changes) {
            keyChanges.push(...processedContent.changes.slice(0, 5)); // Limit changes per snapshot
          }
          
          if (processedContent.trends) {
            trends.push(...processedContent.trends.slice(0, 3)); // Limit trends per snapshot
          }
          
          // Clear processed content immediately
          snapshot.content = null;
          snapshot.analyses = null;
        }
      }
      
      return {
        competitorId: competitor.id,
        competitorName: competitor.name,
        snapshots: null, // Don't store snapshots after processing
        rawContent: null,
        keyChanges: keyChanges.slice(0, 10), // Global limit on changes
        trends: trends.slice(0, 5) // Global limit on trends
      };
      
    } catch (error) {
      logger.error('Failed to stream competitor data', error as Error, {
        competitorId: competitor.id
      });
      
      return {
        competitorId: competitor.id,
        competitorName: competitor.name,
        snapshots: null,
        rawContent: null,
        keyChanges: [],
        trends: []
      };
    }
  }

  /**
   * Process snapshot with selective content extraction
   */
  private processSnapshotSelective(snapshot: any): {
    changes: string[];
    trends: Array<{ trend: string; impact: number }>;
  } {
    const changes: string[] = [];
    const trends: Array<{ trend: string; impact: number }> = [];
    
    try {
      // Process analyses without storing full data
      if (snapshot.analyses && Array.isArray(snapshot.analyses)) {
        for (const analysis of snapshot.analyses) {
          // Extract key changes selectively
          if (analysis.keyChanges && Array.isArray(analysis.keyChanges)) {
            changes.push(...analysis.keyChanges.slice(0, 3));
          }
          
          if (analysis.marketingChanges && Array.isArray(analysis.marketingChanges)) {
            changes.push(...analysis.marketingChanges.slice(0, 2));
          }
          
          if (analysis.productChanges && Array.isArray(analysis.productChanges)) {
            changes.push(...analysis.productChanges.slice(0, 2));
          }
          
          // Extract trends selectively
          if (analysis.trends && Array.isArray(analysis.trends)) {
            trends.push(...analysis.trends.slice(0, 2));
          }
        }
      }
      
    } catch (error) {
      logger.warn('Failed to process snapshot selectively', {
        snapshotId: snapshot.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
    
    return {
      changes: changes.filter(change => change && change.length > 5).slice(0, 5),
      trends: trends.filter(trend => trend && trend.trend).slice(0, 3)
    };
  }

  /**
   * Generate analysis with content size limits
   */
  private async generateLimitedAnalysis(
    streamedData: any,
    competitorName: string,
    options: any
  ): Promise<{ content: string; confidence: number }> {
    try {
      // Build prompt with size constraints
      const limitedPrompt = this.buildLimitedPrompt(streamedData, competitorName, options);
      
      // Check prompt size before sending to AI
      if (limitedPrompt.length > MAX_CONTENT_SIZE_KB * 1024) {
        logger.warn('Prompt size exceeded limit, using fallback', {
          competitorName,
          promptSize: limitedPrompt.length,
          maxSize: MAX_CONTENT_SIZE_KB * 1024
        });
        
        return this.generateFallbackAnalysis(streamedData, competitorName);
      }
      
      // AI analysis with timeout and error handling
      const analysis = await this.callAIWithLimits(limitedPrompt);
      
      return {
        content: this.limitContentSize(analysis),
        confidence: 0.8
      };
      
    } catch (error) {
      logger.error('Failed to generate limited analysis', error as Error, {
        competitorName
      });
      
      return this.generateFallbackAnalysis(streamedData, competitorName);
    }
  }

  /**
   * Build prompt with size limitations
   */
  private buildLimitedPrompt(streamedData: any, competitorName: string, options: any): string {
    const maxChangesInPrompt = 5;
    const maxTrendsInPrompt = 3;
    
    const changes = streamedData.keyChanges.slice(0, maxChangesInPrompt);
    const trends = streamedData.trends.slice(0, maxTrendsInPrompt);
    
    return `
Analyze competitor ${competitorName} based on the following limited data:

Key Changes (${changes.length}):
${changes.map((change, index) => `${index + 1}. ${change}`).join('\n')}

Trends (${trends.length}):
${trends.map((trend, index) => `${index + 1}. ${trend.trend} (Impact: ${trend.impact})`).join('\n')}

Provide a concise analysis focusing on:
- Most significant competitive developments
- Key strategic implications
- Actionable insights

Limit response to 500 words maximum.
`;
  }

  /**
   * Call AI with content and timeout limits
   */
  private async callAIWithLimits(prompt: string): Promise<string> {
    try {
      const command = new InvokeModelCommand({
        modelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify({
          anthropic_version: 'bedrock-2023-05-31',
          max_tokens: 1000,
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
      
      return data.content?.[0]?.text || 'Analysis unavailable';
      
    } catch (error) {
      logger.error('AI call with limits failed', error as Error);
      throw error;
    }
  }

  /**
   * Generate fallback analysis when AI fails
   */
  private generateFallbackAnalysis(streamedData: any, competitorName: string): {
    content: string;
    confidence: number;
  } {
    const changesCount = streamedData.keyChanges.length;
    const trendsCount = streamedData.trends.length;
    
    const content = `
Competitive Analysis: ${competitorName}

Summary: Analysis based on ${changesCount} key changes and ${trendsCount} trends.

Key Developments:
${streamedData.keyChanges.slice(0, 3).map((change: string, index: number) => 
  `• ${change}`
).join('\n')}

Strategic Implications:
• Monitor competitive positioning
• Track market developments
• Review strategic alignment

${changesCount === 0 && trendsCount === 0 ? 
  'Note: Limited data available for comprehensive analysis.' : 
  'Analysis based on available competitive intelligence data.'
}
`;

    return {
      content: this.limitContentSize(content),
      confidence: 0.5
    };
  }

  /**
   * Limit content size to prevent memory bloat
   */
  private limitContentSize(content: string): string {
    const maxSizeBytes = MAX_CONTENT_SIZE_KB * 1024;
    
    if (content.length > maxSizeBytes) {
      const truncated = content.substring(0, maxSizeBytes - 100);
      const lastNewline = truncated.lastIndexOf('\n');
      const finalContent = lastNewline > 0 ? truncated.substring(0, lastNewline) : truncated;
      
      logger.info('Content size limited', {
        originalSize: content.length,
        limitedSize: finalContent.length,
        maxSizeKB: MAX_CONTENT_SIZE_KB
      });
      
      return finalContent + '\n\n[Content truncated for memory optimization]';
    }
    
    return content;
  }

  /**
   * Build optimized report with selective serialization
   */
  private async buildOptimizedReport(
    sections: ReportSection[],
    projectData: any,
    competitorCount: number,
    options: any
  ): Promise<ReportData> {
    // Use selective serialization instead of full JSON.stringify
    const reportData: ReportData = {
      title: options.reportName || `Optimized Competitive Analysis: ${projectData.productName || projectData.name}`,
      description: `Memory-optimized competitive analysis covering ${competitorCount} competitors with streamlined data processing.`,
      sections: sections.slice(0, 10), // Limit sections count
      metadata: {
        competitor: {
          name: projectData.productName || projectData.name,
          url: projectData.website || ''
        },
        dateRange: {
          start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          end: new Date()
        },
        analysisCount: competitorCount,
        significantChanges: sections.length
      }
    };
    
    // Add recommendations section if enabled
    if (options.includeRecommendations !== false) {
      reportData.sections.push({
        title: 'Strategic Recommendations',
        content: this.generateOptimizedRecommendations(competitorCount),
        type: 'recommendations',
        order: sections.length + 1
      });
    }
    
    return reportData;
  }

  /**
   * Generate optimized recommendations
   */
  private generateOptimizedRecommendations(competitorCount: number): string {
    return `
Strategic Recommendations (Memory-Optimized Analysis):

• Continue monitoring ${competitorCount} active competitors
• Implement streamlined competitive intelligence processes
• Focus on high-impact competitive developments
• Maintain regular analysis cycles with optimized data processing
• Leverage memory-efficient analysis for improved performance

Note: This analysis used optimized processing to handle large datasets efficiently.
`;
  }

  /**
   * Store report with memory-conscious approach
   */
  private async storeReportOptimized(
    reportData: ReportData,
    projectId: string,
    correlationId: string
  ): Promise<void> {
    try {
      // Use selective serialization for database storage
      const minimalContent = {
        title: reportData.title,
        description: reportData.description,
        sectionsCount: reportData.sections.length,
        competitorCount: reportData.metadata.analysisCount,
        generatedAt: new Date().toISOString()
      };
      
      await this.prisma.report.create({
        data: {
          name: reportData.title,
          description: reportData.description,
          projectId: projectId,
          status: 'COMPLETED',
          title: reportData.title,
          reportType: 'COMPARATIVE_OPTIMIZED',
          versions: {
            create: {
              version: 1,
              content: minimalContent as any
            }
          }
        }
      });

      logger.info('Optimized report stored', {
        projectId,
        correlationId,
        reportTitle: reportData.title
      });
      
    } catch (error) {
      logger.error('Failed to store optimized report', error as Error, {
        projectId,
        correlationId
      });
      throw error;
    }
  }

  /**
   * Utility methods for memory management
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  private async cleanupChunk(competitorIds: string[]): Promise<void> {
    // Force garbage collection hint
    if (global.gc) {
      global.gc();
    }
    
    logger.debug('Chunk cleanup completed', {
      competitorIds: competitorIds.length,
      correlationId: this.processingContext?.correlationId
    });
  }

  private async cleanupCompetitorData(competitor: any): Promise<void> {
    // Explicitly null large objects
    if (competitor.snapshots) {
      competitor.snapshots.forEach((snapshot: any) => {
        snapshot.content = null;
        snapshot.analyses = null;
      });
      competitor.snapshots = null;
    }
  }

  private async pauseForCleanup(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, CLEANUP_DELAY_MS));
  }

  private async finalCleanup(): Promise<void> {
    this.processingContext = undefined;
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
    
    logger.info('Final cleanup completed');
  }

  private estimateMemoryUsage(): number {
    if (process.memoryUsage) {
      return process.memoryUsage().heapUsed;
    }
    return 0;
  }
}

// Export memory optimization utilities
export const reportMemoryUtils = {
  MAX_COMPETITORS_PER_CHUNK,
  MAX_SNAPSHOTS_PER_COMPETITOR,
  MAX_CONTENT_SIZE_KB,
  
  // Utility function to check memory usage
  checkMemoryUsage(): { heapUsed: number; heapTotal: number; external: number } {
    const usage = process.memoryUsage();
    return {
      heapUsed: Math.round(usage.heapUsed / 1024 / 1024), // MB
      heapTotal: Math.round(usage.heapTotal / 1024 / 1024), // MB
      external: Math.round(usage.external / 1024 / 1024) // MB
    };
  },
  
  // Utility function to force cleanup
  forceCleanup(): void {
    if (global.gc) {
      global.gc();
    }
  }
}; 