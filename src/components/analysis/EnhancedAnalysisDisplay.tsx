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
            <div key={index} className="flex items-start space-x-3 p-3 bg-blue-50 rounded-lg">
              <span className="flex-shrink-0 w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-medium">
                {index + 1}
              </span>
              <div className="flex-1">
                <p className="text-gray-800">{recommendation}</p>
                {priority && (
                  <span className={`inline-block mt-1 px-2 py-1 text-xs rounded-full ${
                    priority === 'high' ? 'bg-red-100 text-red-800' :
                    priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-green-100 text-green-800'
                  }`}>
                    {priority} priority
                  </span>
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
      <div className={`animate-pulse space-y-4 ${className}`}>
        <div className="h-6 bg-gray-200 rounded w-3/4"></div>
        <div className="h-4 bg-gray-200 rounded w-1/2"></div>
        <div className="space-y-2">
          <div className="h-4 bg-gray-200 rounded"></div>
          <div className="h-4 bg-gray-200 rounded w-5/6"></div>
          <div className="h-4 bg-gray-200 rounded w-4/6"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`border border-red-200 rounded-lg p-6 ${className}`}>
        <div className="flex items-center space-x-2 text-red-600 mb-4">
          <span className="text-xl">⚠️</span>
          <h3 className="font-semibold">Analysis Error</h3>
        </div>
        <p className="text-red-700 mb-4">{error}</p>
        <button
          onClick={() => fetchAnalysis()}
          className="px-4 py-2 bg-red-50 text-red-700 rounded-md hover:bg-red-100 transition-colors"
        >
          Retry Analysis
        </button>
      </div>
    );
  }

  if (!analysisData) {
    return (
      <div className={`text-center py-8 text-gray-500 ${className}`}>
        <p>No analysis data available</p>
        <button
          onClick={() => fetchAnalysis()}
          className="mt-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-md hover:bg-blue-100 transition-colors"
        >
          Load Analysis
        </button>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header with refresh button */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Analysis Results</h2>
        {enableRefresh && (
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center space-x-2 px-3 py-2 text-blue-600 hover:bg-blue-50 rounded-md transition-colors disabled:opacity-50"
          >
            <span className={`text-sm ${refreshing ? 'animate-spin' : ''}`}>🔄</span>
            <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        )}
      </div>

      {/* Competitive Position (if available from consolidated service) */}
      {analysisData.analysis.competitivePosition && (
        <div className="flex items-center space-x-2">
          <span className="text-sm font-medium text-gray-600">Competitive Position:</span>
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${getPositionColor(analysisData.analysis.competitivePosition)}`}>
            {analysisData.analysis.competitivePosition}
          </span>
        </div>
      )}

      {/* Analysis Summary */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Executive Summary</h3>
        <div className="prose max-w-none">
          <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
            {analysisData.analysis.summary}
          </p>
        </div>
      </div>

      {/* Key Insights (enhanced feature from consolidated service) */}
      {analysisData.analysis.keyInsights && analysisData.analysis.keyInsights.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Key Insights</h3>
          <div className="space-y-3">
            {analysisData.analysis.keyInsights.map((insight, index) => (
              <div key={index} className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
                <span className={`px-2 py-1 text-xs rounded-full ${
                  insight.type === 'strength' ? 'bg-green-100 text-green-800' :
                  insight.type === 'weakness' ? 'bg-red-100 text-red-800' :
                  insight.type === 'opportunity' ? 'bg-blue-100 text-blue-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {insight.type}
                </span>
                <div className="flex-1">
                  <p className="text-gray-800">{insight.description}</p>
                  {insight.confidence && (
                    <div className="mt-1 text-xs text-gray-600">
                      Confidence: {Math.round(insight.confidence * 100)}%
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommendations */}
      {analysisData.analysis.recommendations && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Recommendations</h3>
          {renderRecommendations(analysisData.analysis.recommendations)}
        </div>
      )}

      {/* Metadata */}
      {showMetadata && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Analysis Metadata</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="block text-gray-600">Processing Time</span>
              <span className="font-medium">{analysisData.metadata.processingTime}ms</span>
            </div>
            <div>
              <span className="block text-gray-600">Confidence Score</span>
              <span className={`font-medium px-2 py-1 rounded ${getConfidenceColor(analysisData.metadata.confidenceScore)}`}>
                {Math.round(analysisData.metadata.confidenceScore * 100)}%
              </span>
            </div>
            <div>
              <span className="block text-gray-600">Analysis Depth</span>
              <span className="font-medium capitalize">{analysisData.metadata.analysisDepth}</span>
            </div>
            <div>
              <span className="block text-gray-600">Focus Areas</span>
              <span className="font-medium">{analysisData.metadata.focusAreas.length} areas</span>
            </div>
          </div>
          {analysisData.metadata.generatedBy && (
            <div className="mt-3 pt-3 border-t border-gray-200">
              <span className="text-xs text-gray-500">
                Generated by: {analysisData.metadata.generatedBy}
                {analysisData.metadata.generatedBy.includes('consolidated') && (
                  <span className="ml-2 px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs">
                    v1.5 Enhanced
                  </span>
                )}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
} 