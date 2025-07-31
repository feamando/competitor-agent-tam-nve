/**
 * Consolidated Services Hook
 * Provides unified access to consolidated AnalysisService and ReportingService capabilities
 * 
 * Task 7.3: React Component Updates
 * - Unified interface for both analysis and reporting operations
 * - Enhanced error handling and state management
 * - Built-in observability and performance tracking
 */

import { useState, useCallback } from 'react';
import { logger, generateCorrelationId } from '@/lib/logger';

// Service capability types
export type AnalysisType = 'ai_comprehensive' | 'ux_comparison' | 'comparative_analysis';
export type ReportTemplate = 'comprehensive' | 'executive' | 'technical' | 'strategic';

export interface AnalysisOptions {
  forceFreshData?: boolean;
  analysisDepth?: 'basic' | 'detailed' | 'comprehensive';
  focusAreas?: string[];
  includeRecommendations?: boolean;
  timeout?: number;
}

export interface ReportOptions {
  template: ReportTemplate;
  immediate?: boolean;
  focusArea?: string;
  includeRecommendations?: boolean;
  enhanceWithAI?: boolean;
  notify?: boolean;
}

export interface ServiceOperation {
  id: string;
  type: 'analysis' | 'report';
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  progress?: number;
  result?: any;
  error?: string;
  startTime: Date;
  endTime?: Date | undefined;
}

export interface ConsolidatedServicesState {
  // Analysis state
  analysisLoading: boolean;
  analysisError: string | null;
  currentAnalysis: any | null;
  
  // Reporting state
  reportGenerating: boolean;
  reportError: string | null;
  currentReport: any | null;
  
  // Operations tracking
  operations: ServiceOperation[];
  activeOperations: number;
}

export interface ConsolidatedServicesHook {
  // State
  state: ConsolidatedServicesState;
  
  // Analysis methods
  runAnalysis: (projectId: string, analysisType: AnalysisType, options?: AnalysisOptions) => Promise<any>;
  refreshAnalysis: (projectId: string) => Promise<any>;
  
  // Reporting methods
  generateReport: (projectId: string, options: ReportOptions) => Promise<any>;
  getReportStatus: (reportId: string) => Promise<any>;
  
  // Operation management
  clearErrors: () => void;
  cancelOperation: (operationId: string) => void;
  getOperation: (operationId: string) => ServiceOperation | undefined;
  
  // Utility methods
  isServiceHealthy: () => Promise<boolean>;
  getServiceInfo: () => Promise<any>;
}

export function useConsolidatedServices(): ConsolidatedServicesHook {
  const [state, setState] = useState<ConsolidatedServicesState>({
    analysisLoading: false,
    analysisError: null,
    currentAnalysis: null,
    reportGenerating: false,
    reportError: null,
    currentReport: null,
    operations: [],
    activeOperations: 0
  });

  // Helper to update state
  const updateState = useCallback((updates: Partial<ConsolidatedServicesState>) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);

  // Helper to add operation
  const addOperation = useCallback((operation: Omit<ServiceOperation, 'id' | 'startTime'>) => {
    const newOperation: ServiceOperation = {
      ...operation,
      id: generateCorrelationId(),
      startTime: new Date()
    };

    setState(prev => ({
      ...prev,
      operations: [...prev.operations, newOperation],
      activeOperations: prev.activeOperations + 1
    }));

    return newOperation.id;
  }, []);

  // Helper to update operation
  const updateOperation = useCallback((operationId: string, updates: Partial<ServiceOperation>) => {
    setState(prev => ({
      ...prev,
      operations: prev.operations.map(op => 
        op.id === operationId 
          ? { 
              ...op, 
              ...updates, 
              endTime: (updates.status === 'completed' || updates.status === 'failed') ? new Date() : op.endTime
            }
          : op
      ),
      activeOperations: (updates.status === 'completed' || updates.status === 'failed') 
        ? prev.activeOperations - 1 
        : prev.activeOperations
    }));
  }, []);

  // Analysis methods
  const runAnalysis = useCallback(async (
    projectId: string, 
    analysisType: AnalysisType, 
    options: AnalysisOptions = {}
  ) => {
    const operationId = addOperation({
      type: 'analysis',
      status: 'pending'
    });

    const correlationId = generateCorrelationId();

    try {
      updateState({ analysisLoading: true, analysisError: null });
      updateOperation(operationId, { status: 'in_progress' });

      logger.info('useConsolidatedServices: Starting analysis', { 
        projectId, 
        analysisType, 
        correlationId,
        operationId
      });

      let endpoint = '';
      let requestBody = {};

      // Route to appropriate consolidated service endpoint
      switch (analysisType) {
        case 'ai_comprehensive':
          endpoint = `/api/projects/${projectId}/smart-ai-analysis`;
          requestBody = {
            analysisType: 'comprehensive',
            forceFreshData: options.forceFreshData,
            context: { 
              operationId,
              usingConsolidatedService: true,
              requestedDepth: options.analysisDepth
            }
          };
          break;
          
        case 'comparative_analysis':
          endpoint = `/api/projects/${projectId}/analysis`;
          requestBody = {
            analysisConfig: {
              focusAreas: options.focusAreas || ['features', 'positioning', 'user_experience'],
              depth: options.analysisDepth || 'detailed',
              includeRecommendations: options.includeRecommendations !== false
            }
          };
          break;
          
        default:
          throw new Error(`Unsupported analysis type: ${analysisType}`);
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Analysis failed');
      }

      const result = await response.json();
      
      updateState({ 
        currentAnalysis: result.analysis || result,
        analysisLoading: false 
      });

      updateOperation(operationId, { 
        status: 'completed', 
        result: result.analysis || result 
      });

      logger.info('useConsolidatedServices: Analysis completed', { 
        projectId, 
        analysisType, 
        correlationId,
        operationId,
        analysisId: result.analysis?.id || result.id
      });

      return result.analysis || result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Analysis failed';
      
      updateState({ 
        analysisError: errorMessage, 
        analysisLoading: false 
      });

      updateOperation(operationId, { 
        status: 'failed', 
        error: errorMessage 
      });

      logger.error('useConsolidatedServices: Analysis failed', error as Error, { 
        projectId, 
        analysisType, 
        correlationId,
        operationId
      });

      throw error;
    }
  }, [addOperation, updateOperation, updateState]);

  const refreshAnalysis = useCallback(async (projectId: string) => {
    // Use the most recent analysis type or default to comparative
    const lastAnalysisOp = state.operations
      .filter(op => op.type === 'analysis')
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())[0];
    
    const analysisType = lastAnalysisOp ? 
      (lastAnalysisOp.result?.analysisType || 'comparative_analysis') : 
      'comparative_analysis';

    return runAnalysis(projectId, analysisType, { forceFreshData: true });
  }, [runAnalysis, state.operations]);

  // Reporting methods
  const generateReport = useCallback(async (projectId: string, options: ReportOptions) => {
    const operationId = addOperation({
      type: 'report',
      status: 'pending'
    });

    const correlationId = generateCorrelationId();

    try {
      updateState({ reportGenerating: true, reportError: null });
      updateOperation(operationId, { status: 'in_progress' });

      logger.info('useConsolidatedServices: Starting report generation', { 
        projectId, 
        options, 
        correlationId,
        operationId
      });

      const response = await fetch('/api/reports/auto-generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId,
          template: options.template,
          immediate: options.immediate !== false,
          notify: options.notify !== false,
          reportOptions: {
            focusArea: options.focusArea || 'all',
            includeRecommendations: options.includeRecommendations !== false,
            enhanceWithAI: options.enhanceWithAI !== false,
            usingConsolidatedService: true,
            operationId
          }
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Report generation failed');
      }

      const result = await response.json();
      
      updateState({ 
        currentReport: result,
        reportGenerating: false 
      });

      updateOperation(operationId, { 
        status: 'completed', 
        result 
      });

      logger.info('useConsolidatedServices: Report generation completed', { 
        projectId, 
        correlationId,
        operationId,
        reportId: result.reportId
      });

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Report generation failed';
      
      updateState({ 
        reportError: errorMessage, 
        reportGenerating: false 
      });

      updateOperation(operationId, { 
        status: 'failed', 
        error: errorMessage 
      });

      logger.error('useConsolidatedServices: Report generation failed', error as Error, { 
        projectId, 
        correlationId,
        operationId
      });

      throw error;
    }
  }, [addOperation, updateOperation, updateState]);

  const getReportStatus = useCallback(async (reportId: string) => {
    try {
      const response = await fetch(`/api/reports/${reportId}`);
      if (response.ok) {
        return await response.json();
      }
      throw new Error('Failed to fetch report status');
    } catch (error) {
      logger.error('useConsolidatedServices: Failed to get report status', error as Error, { reportId });
      throw error;
    }
  }, []);

  // Operation management
  const clearErrors = useCallback(() => {
    updateState({ 
      analysisError: null, 
      reportError: null 
    });
  }, [updateState]);

  const cancelOperation = useCallback((operationId: string) => {
    updateOperation(operationId, { 
      status: 'failed', 
      error: 'Operation cancelled by user' 
    });
  }, [updateOperation]);

  const getOperation = useCallback((operationId: string) => {
    return state.operations.find(op => op.id === operationId);
  }, [state.operations]);

  // Utility methods
  const isServiceHealthy = useCallback(async () => {
    try {
      // Check both analysis and reporting service health
      const [analysisHealth, reportingHealth] = await Promise.all([
        fetch('/api/analysis-service/health').then(r => r.ok),
        fetch('/api/reporting-service/health').then(r => r.ok)
      ]);
      
      return analysisHealth && reportingHealth;
    } catch {
      return false;
    }
  }, []);

  const getServiceInfo = useCallback(async () => {
    try {
      const response = await fetch('/api/consolidated-services/info');
      if (response.ok) {
        return await response.json();
      }
      return {
        version: '1.5',
        features: ['consolidated-analysis', 'consolidated-reporting'],
        status: 'healthy'
      };
    } catch {
      return { status: 'unavailable' };
    }
  }, []);

  return {
    state,
    runAnalysis,
    refreshAnalysis,
    generateReport,
    getReportStatus,
    clearErrors,
    cancelOperation,
    getOperation,
    isServiceHealthy,
    getServiceInfo
  };
} 