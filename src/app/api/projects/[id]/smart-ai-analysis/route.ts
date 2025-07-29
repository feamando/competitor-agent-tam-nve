/**
 * Smart AI Analysis API - Phase AI-1 Implementation
 * REST endpoint for Claude AI integration with Smart Scheduling
 * 
 * Features:
 * - Fresh data-guaranteed AI analysis
 * - Smart scheduling integration
 * - Enhanced context with freshness metadata
 * 
 * UPDATED: Now uses consolidated AnalysisService (Task 7.2)
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger, generateCorrelationId, trackErrorWithCorrelation } from '@/lib/logger';
// Updated to use consolidated AnalysisService
import { AnalysisService } from '@/services/domains/AnalysisService';
import { AnalysisRequest } from '@/services/domains/types/analysisTypes';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const correlationId = generateCorrelationId();
  const projectId = (await context.params).id;
  const logContext = { projectId, correlationId, operation: 'smartAIAnalysis', endpoint: 'POST' };

  try {
    logger.info('Smart AI analysis API called', logContext);

    const body = await request.json();
    const {
      analysisType = 'comprehensive',
      forceFreshData = false,
      dataCutoff,
      context: additionalContext
    } = body;

    // Validate analysis type
    const validTypes = ['competitive', 'trend', 'comprehensive'];
    if (!validTypes.includes(analysisType)) {
      return NextResponse.json({
        error: 'Invalid analysis type',
        validTypes,
        correlationId
      }, { status: 400 });
    }

    // Build unified analysis request for consolidated service
    const unifiedAnalysisRequest: AnalysisRequest = {
      analysisType: 'ai_comprehensive', // Map to unified analysis type
      projectId,
      forceFreshData,
      dataCutoff: dataCutoff ? new Date(dataCutoff) : undefined,
      context: additionalContext || {},
      correlationId,
      priority: 'medium',
      options: {
        analysisType, // Preserve original analysis type in options
        includeRecommendations: true
      }
    };

    // Execute analysis using consolidated service
    const analysisService = new AnalysisService();
    const result = await analysisService.analyzeProduct(unifiedAnalysisRequest);

    // Extract smart AI analysis from unified response for backward compatibility
    const smartAnalysis = result.smartAnalysis;
    if (!smartAnalysis) {
      throw new Error('Smart AI analysis data not found in response');
    }

    logger.info('Smart AI analysis completed successfully', {
      ...logContext,
      analysisType,
      dataFreshGuaranteed: smartAnalysis.analysisMetadata.dataFreshGuaranteed,
      scrapingTriggered: smartAnalysis.analysisMetadata.scrapingTriggered,
      analysisLength: smartAnalysis.analysis.length
    });

    // Return response in original format for backward compatibility
    return NextResponse.json({
      success: true,
      analysis: smartAnalysis.analysis,
      dataFreshness: smartAnalysis.dataFreshness,
      metadata: smartAnalysis.analysisMetadata,
      recommendations: smartAnalysis.recommendations,
      correlationId
    });

  } catch (error) {
    trackErrorWithCorrelation(
      error as Error,
      'smartAIAnalysis-POST',
      correlationId,
      {
        ...logContext,
        service: 'SmartAIAnalysisAPI'
      }
    );

    logger.error('Smart AI analysis failed', {
      ...logContext,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    return NextResponse.json({
      error: 'Failed to generate smart AI analysis',
      correlationId,
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const correlationId = generateCorrelationId();
  const projectId = (await context.params).id;
  const logContext = { projectId, correlationId, operation: 'smartAIStatus', endpoint: 'GET' };

  try {
    logger.info('Smart AI status check called', logContext);

    // Get project AI configuration and freshness status
    const smartScheduler = smartAIService['smartScheduler'];
    const freshnessStatus = await smartScheduler.getFreshnessStatus(projectId);

    // Check if project has AI analysis configured
    const project = await smartAIService['prisma'] || require('@/lib/prisma').default;
    const projectData = await project.project.findUnique({
      where: { id: projectId },
      select: { description: true, name: true, status: true }
    });

    if (!projectData) {
      return NextResponse.json({
        error: 'Project not found',
        correlationId
      }, { status: 404 });
    }

    // Try to parse AI configuration from description
    let aiConfig = null;
    try {
      const parsedDescription = JSON.parse(projectData.description || '{}');
      aiConfig = parsedDescription.aiAnalysisConfig || null;
    } catch {
      // Description is not JSON, that's okay
    }

    const response = {
      success: true,
      projectId,
      projectName: projectData.name,
      projectStatus: projectData.status,
      dataFreshness: freshnessStatus,
      aiAnalysisEnabled: !!aiConfig,
      aiConfiguration: aiConfig,
      smartSchedulingAvailable: true,
      recommendations: [
        ...(freshnessStatus.overallStatus !== 'FRESH' ? 
          ['Consider running analysis with forceFreshData=true for most current insights'] : []),
        ...(freshnessStatus.recommendedActions || [])
      ],
      correlationId
    };

    logger.info('Smart AI status retrieved', {
      ...logContext,
      freshnessStatus: freshnessStatus.overallStatus,
      aiEnabled: !!aiConfig
    });

    return NextResponse.json(response);

  } catch (error) {
    trackErrorWithCorrelation(
      error as Error,
      'smartAIStatus-GET',
      correlationId,
      {
        ...logContext,
        service: 'SmartAIAnalysisAPI'
      }
    );

    logger.error('Smart AI status check failed', {
      ...logContext,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    return NextResponse.json({
      error: 'Failed to get smart AI status',
      correlationId,
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 