'use client';

import React, { useState } from 'react';
import { BedrockHealthStatus } from '@/types/bedrockHealth';

interface ServiceControlPanelProps {
  currentStatus: BedrockHealthStatus;
  onAction: () => void;
  className?: string;
}

interface ControlAction {
  id: string;
  label: string;
  description: string;
  icon: string;
  variant: 'primary' | 'secondary' | 'warning' | 'danger';
  confirmRequired?: boolean;
  action: () => Promise<void>;
}

export function ServiceControlPanel({
  currentStatus,
  onAction,
  className = ''
}: ServiceControlPanelProps) {
  const [loadingActions, setLoadingActions] = useState<Set<string>>(new Set());
  const [confirmingAction, setConfirmingAction] = useState<string | null>(null);
  const [lastActionResult, setLastActionResult] = useState<{ action: string; success: boolean; message?: string } | null>(null);

  const executeAction = async (actionId: string, action: () => Promise<void>) => {
    setLoadingActions(prev => new Set(prev).add(actionId));
    setLastActionResult(null);
    
    try {
      await action();
      setLastActionResult({ action: actionId, success: true });
      onAction(); // Refresh dashboard
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error occurred';
      setLastActionResult({ action: actionId, success: false, message });
    } finally {
      setLoadingActions(prev => {
        const newSet = new Set(prev);
        newSet.delete(actionId);
        return newSet;
      });
      setConfirmingAction(null);
    }
  };

  const handleAction = (actionId: string, action: () => Promise<void>, confirmRequired: boolean = false) => {
    if (confirmRequired && confirmingAction !== actionId) {
      setConfirmingAction(actionId);
      return;
    }
    
    executeAction(actionId, action);
  };

  const getControlActions = (): ControlAction[] => {
    const actions: ControlAction[] = [
      {
        id: 'health-check',
        label: 'Run Health Check',
        description: 'Perform immediate health validation',
        icon: 'health',
        variant: 'primary',
        action: async () => {
          const response = await fetch('/api/system-health/bedrock', { method: 'GET' });
          if (!response.ok) {
            throw new Error('Health check failed');
          }
        }
      },
      {
        id: 'reset-circuit-breaker',
        label: 'Reset Circuit Breaker',
        description: 'Manually reset the circuit breaker to CLOSED state',
        icon: 'reset',
        variant: 'warning',
        confirmRequired: true,
        action: async () => {
          const response = await fetch('/api/services/bedrock/circuit-breaker/reset', { method: 'POST' });
          if (!response.ok) {
            throw new Error('Failed to reset circuit breaker');
          }
        }
      },
      {
        id: 'clear-metrics',
        label: 'Clear Metrics',
        description: 'Reset all performance metrics and counters',
        icon: 'clear',
        variant: 'secondary',
        confirmRequired: true,
        action: async () => {
          const response = await fetch('/api/services/bedrock/metrics/clear', { method: 'POST' });
          if (!response.ok) {
            throw new Error('Failed to clear metrics');
          }
        }
      },
      {
        id: 'force-reconnect',
        label: 'Force Reconnection',
        description: 'Force recreate all Bedrock service connections',
        icon: 'reconnect',
        variant: 'warning',
        confirmRequired: true,
        action: async () => {
          const response = await fetch('/api/services/bedrock/reconnect', { method: 'POST' });
          if (!response.ok) {
            throw new Error('Failed to force reconnection');
          }
        }
      },
      {
        id: 'emergency-disable',
        label: 'Emergency Disable',
        description: 'Temporarily disable Bedrock service (forces fallback mode)',
        icon: 'disable',
        variant: 'danger',
        confirmRequired: true,
        action: async () => {
          const response = await fetch('/api/services/bedrock/emergency-disable', { method: 'POST' });
          if (!response.ok) {
            throw new Error('Failed to disable service');
          }
        }
      }
    ];

    // Filter actions based on current status
    if (currentStatus.status === 'healthy') {
      return actions.filter(a => a.id !== 'reset-circuit-breaker');
    }
    
    return actions;
  };

  const getIcon = (iconType: string) => {
    switch (iconType) {
      case 'health':
        return (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        );
      case 'reset':
        return (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
          </svg>
        );
      case 'clear':
        return (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" clipRule="evenodd" />
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 012 0v4a1 1 0 11-2 0V7zM12 7a1 1 0 10-2 0v4a1 1 0 102 0V7z" clipRule="evenodd" />
          </svg>
        );
      case 'reconnect':
        return (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3z" />
          </svg>
        );
      case 'disable':
        return (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M13.477 14.89A6 6 0 015.11 6.524l8.367 8.368zm1.414-1.414L6.524 5.11a6 6 0 018.367 8.367zM18 10a8 8 0 11-16 0 8 8 0 0116 0z" clipRule="evenodd" />
          </svg>
        );
      default:
        return (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
          </svg>
        );
    }
  };

  const getButtonStyles = (variant: ControlAction['variant'], isLoading: boolean = false) => {
    const baseStyles = "inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
    
    if (isLoading) {
      return `${baseStyles} opacity-50 cursor-not-allowed`;
    }

    switch (variant) {
      case 'primary':
        return `${baseStyles} bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500`;
      case 'secondary':
        return `${baseStyles} bg-gray-200 text-gray-900 hover:bg-gray-300 focus:ring-gray-500`;
      case 'warning':
        return `${baseStyles} bg-yellow-600 text-white hover:bg-yellow-700 focus:ring-yellow-500`;
      case 'danger':
        return `${baseStyles} bg-red-600 text-white hover:bg-red-700 focus:ring-red-500`;
    }
  };

  const actions = getControlActions();

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Warning Banner */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <svg className="w-5 h-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-yellow-800">
              Administrator Controls
            </h3>
            <div className="mt-1 text-sm text-yellow-700">
              These controls affect the Bedrock service for all users. Use with caution and ensure proper authorization.
            </div>
          </div>
        </div>
      </div>

      {/* Current Status */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-900 mb-3">Current Service Status</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span>Status:</span>
            <span className={`font-medium ${
              currentStatus.status === 'healthy' ? 'text-green-600' : 'text-red-600'
            }`}>
              {currentStatus.status}
            </span>
          </div>
          {currentStatus.details?.responseTime && (
            <div className="flex justify-between">
              <span>Response Time:</span>
              <span>{currentStatus.details.responseTime}</span>
            </div>
          )}
          {currentStatus.details?.provider && (
            <div className="flex justify-between">
              <span>Provider:</span>
              <span>{currentStatus.details.provider}</span>
            </div>
          )}
          {currentStatus.details?.region && (
            <div className="flex justify-between">
              <span>Region:</span>
              <span>{currentStatus.details.region}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span>Last Checked:</span>
            <span>{new Date(currentStatus.timestamp).toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Control Actions */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-900 mb-4">Available Actions</h3>
        
        <div className="space-y-4">
          {actions.map((action) => {
            const isLoading = loadingActions.has(action.id);
            const isConfirming = confirmingAction === action.id;
            
            return (
              <div key={action.id} className="border border-gray-200 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="font-medium text-sm text-gray-900">
                      {action.label}
                    </div>
                    <div className="text-xs text-gray-600 mt-1">
                      {action.description}
                    </div>
                  </div>
                  
                  <div className="ml-4 flex gap-2">
                    {isConfirming ? (
                      <>
                        <button
                          onClick={() => setConfirmingAction(null)}
                          className="px-3 py-1 text-xs border border-gray-300 rounded text-gray-700 hover:bg-gray-50"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleAction(action.id, action.action, false)}
                          className="px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                          disabled={isLoading}
                        >
                          Confirm
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleAction(action.id, action.action, action.confirmRequired)}
                        disabled={isLoading}
                        className={getButtonStyles(action.variant, isLoading)}
                      >
                        {isLoading ? (
                          <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                        ) : (
                          getIcon(action.icon)
                        )}
                        {action.label}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Action Results */}
      {lastActionResult && (
        <div className={`border rounded-lg p-4 ${
          lastActionResult.success 
            ? 'bg-green-50 border-green-200' 
            : 'bg-red-50 border-red-200'
        }`}>
          <div className="flex items-start">
            <div className="flex-shrink-0">
              {lastActionResult.success ? (
                <svg className="w-5 h-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              )}
            </div>
            <div className="ml-3">
              <h3 className={`text-sm font-medium ${
                lastActionResult.success ? 'text-green-800' : 'text-red-800'
              }`}>
                Action {lastActionResult.success ? 'Completed' : 'Failed'}
              </h3>
              <div className={`mt-1 text-sm ${
                lastActionResult.success ? 'text-green-700' : 'text-red-700'
              }`}>
                {lastActionResult.success 
                  ? `${lastActionResult.action} completed successfully.`
                  : `${lastActionResult.action} failed: ${lastActionResult.message || 'Unknown error'}`
                }
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Emergency Contacts */}
      <div className="bg-gray-50 rounded-lg p-4 text-sm">
        <h4 className="font-medium text-gray-900 mb-2">Emergency Contacts</h4>
        <div className="text-gray-600 space-y-1">
          <div>• For critical issues: Use the emergency disable function above</div>
          <div>• For configuration help: Check the service documentation</div>
          <div>• For AWS issues: Verify credentials and region settings</div>
        </div>
      </div>
    </div>
  );
}

export default ServiceControlPanel;