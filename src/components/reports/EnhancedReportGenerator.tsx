/**
 * Enhanced Report Generator Component
 * Leverages consolidated ReportingService capabilities for improved report generation
 * 
 * Task 7.3: React Component Updates
 * - Showcases consolidated reporting service capabilities
 * - Provides enhanced progress tracking and error handling
 * - Supports both immediate and scheduled report generation
 */

import React, { useState, useEffect } from 'react';
import { logger } from '@/lib/logger';

export interface ReportGenerationConfig {
  template: 'comprehensive' | 'executive' | 'technical' | 'strategic';
  immediate: boolean;
  notify: boolean;
  focusArea?: 'all' | 'features' | 'positioning' | 'pricing' | 'ux';
  includeRecommendations: boolean;
  generateTableOfContents: boolean;
}

export interface GeneratedReport {
  reportId: string;
  reportTitle: string;
  reportType: 'comparative';
  status: 'generating' | 'completed' | 'failed';
  progress?: number;
  generatedAt: string;
  downloadUrl?: string;
  previewAvailable: boolean;
}

interface EnhancedReportGeneratorProps {
  projectId: string;
  onReportGenerated?: (report: GeneratedReport) => void;
  onError?: (error: string) => void;
  className?: string;
  showAdvancedOptions?: boolean;
}

export default function EnhancedReportGenerator({
  projectId,
  onReportGenerated,
  onError,
  className = '',
  showAdvancedOptions = true
}: EnhancedReportGeneratorProps) {
  const [config, setConfig] = useState<ReportGenerationConfig>({
    template: 'comprehensive',
    immediate: true,
    notify: true,
    focusArea: 'all',
    includeRecommendations: true,
    generateTableOfContents: true
  });

  const [generating, setGenerating] = useState(false);
  const [currentReport, setCurrentReport] = useState<GeneratedReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [generationLogs, setGenerationLogs] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState(false);

  // Progress tracking
  useEffect(() => {
    if (generating && currentReport?.reportId) {
      const interval = setInterval(async () => {
        try {
          const response = await fetch(`/api/reports/generation-status/${projectId}`);
          if (response.ok) {
            const status = await response.json();
            setProgress(status.progress || 0);
            
            if (status.completed) {
              setGenerating(false);
              setCurrentReport(prev => prev ? { ...prev, status: 'completed' } : null);
              clearInterval(interval);
            }
          }
        } catch (err) {
          console.warn('Failed to fetch generation status:', err);
        }
      }, 2000);

      return () => clearInterval(interval);
    }
  }, [generating, currentReport?.reportId, projectId]);

  const generateReport = async () => {
    setGenerating(true);
    setError(null);
    setProgress(0);
    setGenerationLogs(['Starting report generation...']);

    try {
      logger.info('EnhancedReportGenerator: Starting report generation', { 
        projectId, 
        config,
        usingConsolidatedService: true 
      });

      addLog(`Initiating ${config.template} report generation...`);

      // Use the consolidated reporting service endpoint
      const response = await fetch('/api/reports/auto-generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId,
          template: config.template,
          immediate: config.immediate,
          notify: config.notify,
          reportOptions: {
            focusArea: config.focusArea,
            includeRecommendations: config.includeRecommendations,
            includeTableOfContents: config.generateTableOfContents,
            enhanceWithAI: true,
            includeDataFreshness: true
          }
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate report');
      }

      const result = await response.json();
      
      addLog('Report generation initiated successfully');
      addLog(`Report ID: ${result.reportId}`);
      addLog(`Template: ${result.template}`);
      addLog(`Competitors analyzed: ${result.competitorCount}`);

      const generatedReport: GeneratedReport = {
        reportId: result.reportId,
        reportTitle: result.reportTitle || `${config.template} Competitive Analysis`,
        reportType: 'comparative',
        status: config.immediate ? 'generating' : 'completed',
        generatedAt: result.generatedAt || new Date().toISOString(),
        previewAvailable: !!result.reportId
      };

      setCurrentReport(generatedReport);
      onReportGenerated?.(generatedReport);

      if (!config.immediate) {
        addLog('Report generation completed');
        setGenerating(false);
      } else {
        addLog('Report processing in background...');
      }

      logger.info('EnhancedReportGenerator: Report generation successful', { 
        projectId, 
        reportId: result.reportId,
        template: config.template
      });

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Report generation failed';
      setError(errorMessage);
      addLog(`Error: ${errorMessage}`);
      onError?.(errorMessage);
      setGenerating(false);

      logger.error('EnhancedReportGenerator: Report generation failed', err as Error, { 
        projectId, 
        config 
      });
    }
  };

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setGenerationLogs(prev => [...prev, `[${timestamp}] ${message}`]);
  };

  const downloadReport = async () => {
    if (!currentReport?.reportId) return;

    try {
      const response = await fetch(`/api/reports/${currentReport.reportId}`);
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${currentReport.reportTitle.replace(/[^a-zA-Z0-9]/g, '_')}.md`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (err) {
      console.error('Failed to download report:', err);
    }
  };

  const previewReport = () => {
    if (currentReport?.reportId) {
      window.open(`/reports/${currentReport.reportId}`, '_blank');
    }
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Enhanced Report Generator</h2>
          <p className="text-gray-600">Generate comprehensive competitive analysis reports using consolidated services</p>
        </div>
        <div className="flex items-center space-x-2 text-sm text-gray-500">
          <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full">v1.5 Enhanced</span>
        </div>
      </div>

      {/* Configuration */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Report Configuration</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Template Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Report Template</label>
            <select
              value={config.template}
              onChange={(e) => setConfig(prev => ({ ...prev, template: e.target.value as any }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={generating}
            >
              <option value="comprehensive">Comprehensive Analysis</option>
              <option value="executive">Executive Summary</option>
              <option value="technical">Technical Deep Dive</option>
              <option value="strategic">Strategic Overview</option>
            </select>
          </div>

          {/* Generation Mode */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Generation Mode</label>
            <div className="flex items-center space-x-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  checked={config.immediate}
                  onChange={() => setConfig(prev => ({ ...prev, immediate: true }))}
                  className="mr-2"
                  disabled={generating}
                />
                <span className="text-sm">Immediate</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  checked={!config.immediate}
                  onChange={() => setConfig(prev => ({ ...prev, immediate: false }))}
                  className="mr-2"
                  disabled={generating}
                />
                <span className="text-sm">Scheduled</span>
              </label>
            </div>
          </div>

          {/* Advanced Options */}
          {showAdvancedOptions && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Focus Area</label>
                <select
                  value={config.focusArea}
                  onChange={(e) => setConfig(prev => ({ ...prev, focusArea: e.target.value as any }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={generating}
                >
                  <option value="all">All Areas</option>
                  <option value="features">Features</option>
                  <option value="positioning">Positioning</option>
                  <option value="pricing">Pricing</option>
                  <option value="ux">User Experience</option>
                </select>
              </div>

              <div className="space-y-3">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={config.includeRecommendations}
                    onChange={(e) => setConfig(prev => ({ ...prev, includeRecommendations: e.target.checked }))}
                    className="mr-2"
                    disabled={generating}
                  />
                  <span className="text-sm">Include Recommendations</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={config.generateTableOfContents}
                    onChange={(e) => setConfig(prev => ({ ...prev, generateTableOfContents: e.target.checked }))}
                    className="mr-2"
                    disabled={generating}
                  />
                  <span className="text-sm">Generate Table of Contents</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={config.notify}
                    onChange={(e) => setConfig(prev => ({ ...prev, notify: e.target.checked }))}
                    className="mr-2"
                    disabled={generating}
                  />
                  <span className="text-sm">Email Notification</span>
                </label>
              </div>
            </>
          )}
        </div>

        {/* Generate Button */}
        <div className="mt-6 flex items-center justify-between">
          <button
            onClick={generateReport}
            disabled={generating}
            className={`px-6 py-3 rounded-md font-medium ${
              generating
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {generating ? 'Generating Report...' : 'Generate Report'}
          </button>

          {generationLogs.length > 0 && (
            <button
              onClick={() => setShowLogs(!showLogs)}
              className="px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-md"
            >
              {showLogs ? 'Hide Logs' : 'Show Logs'}
            </button>
          )}
        </div>
      </div>

      {/* Progress */}
      {generating && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Generation Progress</h3>
          <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
          <p className="text-sm text-gray-600">{progress}% Complete</p>
        </div>
      )}

      {/* Generation Logs */}
      {showLogs && generationLogs.length > 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">Generation Logs</h4>
          <div className="max-h-40 overflow-y-auto">
            {generationLogs.map((log, index) => (
              <div key={index} className="text-xs text-gray-600 font-mono">
                {log}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="border border-red-200 rounded-lg p-6 bg-red-50">
          <div className="flex items-center space-x-2 text-red-600 mb-2">
            <span className="text-xl">⚠️</span>
            <h3 className="font-semibold">Report Generation Error</h3>
          </div>
          <p className="text-red-700 mb-4">{error}</p>
          <button
            onClick={generateReport}
            className="px-4 py-2 bg-red-100 text-red-700 rounded-md hover:bg-red-200 transition-colors"
          >
            Retry Generation
          </button>
        </div>
      )}

      {/* Generated Report */}
      {currentReport && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Generated Report</h3>
          
          <div className="flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-lg">
            <div>
              <h4 className="font-medium text-green-900">{currentReport.reportTitle}</h4>
              <p className="text-sm text-green-700">
                Generated: {new Date(currentReport.generatedAt).toLocaleString()}
              </p>
              <p className="text-sm text-green-700">
                Status: <span className="capitalize">{currentReport.status}</span>
              </p>
            </div>
            
            <div className="flex items-center space-x-2">
              {currentReport.previewAvailable && (
                <button
                  onClick={previewReport}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                >
                  Preview
                </button>
              )}
              {currentReport.status === 'completed' && (
                <button
                  onClick={downloadReport}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
                >
                  Download
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Service Information */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <span className="text-blue-600">ℹ️</span>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-blue-800">Enhanced Reporting Service</h3>
            <p className="text-sm text-blue-700">
              This component uses the new Consolidated ReportingService v1.5 which provides 
              enhanced report generation with improved templates, better AI integration, 
              and comprehensive progress tracking.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
} 