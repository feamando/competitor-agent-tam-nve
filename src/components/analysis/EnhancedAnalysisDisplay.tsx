/**
 * Enhanced Analysis Display Component
 * Leverages consolidated AnalysisService capabilities for improved user experience
 * 
 * Task 7.3: React Component Updates
 * - Showcases consolidated service capabilities
 * - Provides enhanced error handling and loading states
 * - Maintains backward compatibility with existing analysis data
 */

import React, { useState, useEffect } from 'react';
import { logger } from '@/lib/logger';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { LoadingButton } from '@/components/composed/LoadingButton';
import { cn } from '@/lib/utils';

export interface AnalysisData {
  id: string;
  metadata: {
    processingTime: number;
    confidenceScore: number;
    analysisDepth: string;
    focusAreas: string[];
    generatedBy?: string;
  };
  analysis: {
    summary: string;
    recommendations: string[] | Array<{ description: string; priority?: string }>;
    keyInsights?: Array<{ type: string; description: string; confidence?: number }>;
    competitivePosition?: 'leading' | 'competitive' | 'trailing';
  };
}

interface EnhancedAnalysisDisplayProps {
  projectId: string;
  analysisData?: AnalysisData;
  showMetadata?: boolean;
  enableRefresh?: boolean;
  onAnalysisUpdate?: (analysis: AnalysisData) => void;
  className?: string;
}

export default function EnhancedAnalysisDisplay({
  projectId,
  analysisData: initialData,
  showMetadata = true,
  enableRefresh = true,
  onAnalysisUpdate,
  className = ''
}: EnhancedAnalysisDisplayProps) {
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(initialData || null);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Fetch analysis data
  const fetchAnalysis = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      logger.info('EnhancedAnalysisDisplay: Fetching analysis data', { projectId });

      const response = await fetch(`/api/projects/${projectId}/analysis`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch analysis');
      }

      const data = await response.json();
      const analysis = data.analysis || data;

      logger.info('EnhancedAnalysisDisplay: Analysis data received', { 
        projectId, 
        analysisId: analysis.id,
        usingConsolidatedService: analysis.metadata?.generatedBy?.includes('consolidated') || false
      });

      setAnalysisData(analysis);
      onAnalysisUpdate?.(analysis);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load analysis';
      setError(errorMessage);
      logger.error('EnhancedAnalysisDisplay: Failed to fetch analysis', err as Error, { projectId });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Load analysis on mount
  useEffect(() => {
    if (!initialData) {
      fetchAnalysis();
    }
  }, [projectId]);

  // Handle refresh
  const handleRefresh = () => {
    fetchAnalysis(true);
  };

  const getConfidenceColor = (score: number) => {
    if (score >= 0.8) return 'text-green-600 bg-green-50';
    if (score >= 0.6) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  const getPositionColor = (position: string) => {
    switch (position) {
      case 'leading': return 'text-green-600 bg-green-50';
      case 'competitive': return 'text-blue-600 bg-blue-50';
      case 'trailing': return 'text-orange-600 bg-orange-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const renderRecommendations = (recommendations: AnalysisData['analysis']['recommendations']) => {
    if (!recommendations || !Array.isArray(recommendations)) return null;

    return (
      <div className="space-y-2">
        {recommendations.map((rec, index) => {
          const recommendation = typeof rec === 'string' ? rec : rec.description;
          const priority = typeof rec === 'object' && rec.priority ? rec.priority : null;
          
          return (
            <div key={index} className="flex items-start space-x-3 p-3 bg-primary/5 rounded-lg">
              <Badge variant="default" className="flex-shrink-0 w-6 h-6 rounded-full p-0 justify-center">
                {index + 1}
              </Badge>
              <div className="flex-1">
                <p>{recommendation}</p>
                {priority && (
                  <Badge
                    variant={
                      priority === 'high' ? 'destructive' :
                      priority === 'medium' ? 'secondary' :
                      'default'
                    }
                    className="mt-1 text-xs"
                  >
                    {priority} priority
                  </Badge>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  if (loading) {
    return (
      <div className={cn("space-y-4", className)}>
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-4/6" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className={className}>
        <span className="text-xl">⚠️</span>
        <AlertDescription>
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold">Analysis Error</h3>
              <p className="mt-2">{error}</p>
            </div>
            <Button
              variant="outline"
              onClick={() => fetchAnalysis()}
              className="bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/20"
            >
              Retry Analysis
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  if (!analysisData) {
    return (
      <div className={cn("text-center py-8", className)}>
        <p className="text-muted-foreground">No analysis data available</p>
        <Button
          variant="outline"
          onClick={() => fetchAnalysis()}
          className="mt-2"
        >
          Load Analysis
        </Button>
      </div>
    );
  }

  return (
    <div className={cn("space-y-6", className)}>
      {/* Header with refresh button */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Analysis Results</h2>
        {enableRefresh && (
          <LoadingButton
            variant="ghost"
            onClick={handleRefresh}
            loading={refreshing}
            className="h-auto p-2"
          >
            <span className="text-sm mr-2">🔄</span>
            <span>Refresh</span>
          </LoadingButton>
        )}
      </div>

      {/* Competitive Position (if available from consolidated service) */}
      {analysisData.analysis.competitivePosition && (
        <div className="flex items-center space-x-2">
          <span className="text-sm font-medium">Competitive Position:</span>
          <Badge className={getPositionColor(analysisData.analysis.competitivePosition)}>
            {analysisData.analysis.competitivePosition}
          </Badge>
        </div>
      )}

      {/* Analysis Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Executive Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="prose max-w-none">
            <p className="text-foreground leading-relaxed whitespace-pre-wrap">
              {analysisData.analysis.summary}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Key Insights (enhanced feature from consolidated service) */}
      {analysisData.analysis.keyInsights && analysisData.analysis.keyInsights.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Key Insights</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {analysisData.analysis.keyInsights.map((insight, index) => (
              <div key={index} className="flex items-start space-x-3 p-3 bg-muted/50 rounded-lg">
                <Badge variant={
                  insight.type === 'strength' ? 'default' :
                  insight.type === 'weakness' ? 'destructive' :
                  insight.type === 'opportunity' ? 'secondary' :
                  'outline'
                }>
                  {insight.type}
                </Badge>
                <div className="flex-1">
                  <p>{insight.description}</p>
                  {insight.confidence && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      Confidence: {Math.round(insight.confidence * 100)}%
                    </div>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Recommendations */}
      {analysisData.analysis.recommendations && (
        <Card>
          <CardHeader>
            <CardTitle>Recommendations</CardTitle>
          </CardHeader>
          <CardContent>
            {renderRecommendations(analysisData.analysis.recommendations)}
          </CardContent>
        </Card>
      )}

      {/* Metadata */}
      {showMetadata && (
        <Card className="bg-muted/30">
          <CardHeader>
            <CardTitle className="text-sm">Analysis Metadata</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="block text-muted-foreground">Processing Time</span>
                <span className="font-medium">{analysisData.metadata.processingTime}ms</span>
              </div>
              <div>
                <span className="block text-muted-foreground">Confidence Score</span>
                <Badge variant="outline" className={getConfidenceColor(analysisData.metadata.confidenceScore)}>
                  {Math.round(analysisData.metadata.confidenceScore * 100)}%
                </Badge>
              </div>
              <div>
                <span className="block text-muted-foreground">Analysis Depth</span>
                <span className="font-medium capitalize">{analysisData.metadata.analysisDepth}</span>
              </div>
              <div>
                <span className="block text-muted-foreground">Focus Areas</span>
                <Badge variant="secondary">{analysisData.metadata.focusAreas.length} areas</Badge>
              </div>
            </div>
            {analysisData.metadata.generatedBy && (
              <div className="mt-3 pt-3 border-t">
                <span className="text-xs text-muted-foreground">
                  Generated by: {analysisData.metadata.generatedBy}
                  {analysisData.metadata.generatedBy.includes('consolidated') && (
                    <Badge variant="default" className="ml-2 text-xs">
                      v1.5 Enhanced
                    </Badge>
                  )}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
} 