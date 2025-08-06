'use client';

import React, { useState } from 'react';
import { BedrockHealthStatus } from '@/types/bedrockHealth';

interface ServiceDegradationActionsProps {
  serviceStatus?: BedrockHealthStatus;
  projectId?: string;
  reportId?: string;
  canRetry?: boolean;
  canSchedule?: boolean;
  canContinue?: boolean;
  onRetry?: () => Promise<void>;
  onScheduleBackground?: () => Promise<void>;
  onContinueBasic?: () => void;
  onCheckStatus?: () => void;
  className?: string;
}

interface ActionButton {
  id: string;
  label: string;
  description: string;
  icon: string;
  action: () => void | Promise<void>;
  variant: 'primary' | 'secondary' | 'outline' | 'warning';
  disabled?: boolean;
  loading?: boolean;
}

export function ServiceDegradationActions({
  serviceStatus,
  projectId,
  reportId,
  canRetry = true,
  canSchedule = true,
  canContinue = true,
  onRetry,
  onScheduleBackground,
  onContinueBasic,
  onCheckStatus,
  className = ''
}: ServiceDegradationActionsProps) {
  const [loadingActions, setLoadingActions] = useState<Set<string>>(new Set());
  const [lastAction, setLastAction] = useState<string | null>(null);

  const handleAction = async (actionId: string, action: () => void | Promise<void>) => {
    setLoadingActions(prev => new Set(prev).add(actionId));
    setLastAction(actionId);
    
    try {
      await action();
    } catch (error) {
      console.error(`Action ${actionId} failed:`, error);
    } finally {
      setLoadingActions(prev => {
        const newSet = new Set(prev);
        newSet.delete(actionId);
        return newSet;
      });
    }
  };

  const getActions = (): ActionButton[] => {
    const actions: ActionButton[] = [];

    // Retry with AI action
    if (canRetry && onRetry) {
      actions.push({
        id: 'retry-ai',
        label: 'Retry with AI',
        description: 'Attempt to generate an AI-enhanced version of this report',
        icon: 'retry',
        action: () => handleAction('retry-ai', onRetry),
        variant: 'primary',
        disabled: loadingActions.has('retry-ai'),
        loading: loadingActions.has('retry-ai')
      });
    }

    // Schedule for background processing
    if (canSchedule && onScheduleBackground) {
      actions.push({
        id: 'schedule-background',
        label: 'Schedule AI Version',
        description: 'Generate AI-enhanced report in the background and notify when complete',
        icon: 'schedule',
        action: () => handleAction('schedule-background', onScheduleBackground),
        variant: 'secondary',
        disabled: loadingActions.has('schedule-background'),
        loading: loadingActions.has('schedule-background')
      });
    }

    // Continue with basic report
    if (canContinue && onContinueBasic) {
      actions.push({
        id: 'continue-basic',
        label: 'Continue with Basic Report',
        description: 'Use the current basic template report and proceed',
        icon: 'continue',
        action: () => onContinueBasic(),
        variant: 'outline',
        disabled: false
      });
    }

    // Check service status
    if (onCheckStatus) {
      actions.push({
        id: 'check-status',
        label: 'Check Service Status',
        description: 'View current AI service health and diagnostics',
        icon: 'status',
        action: () => onCheckStatus(),
        variant: 'outline',
        disabled: false
      });
    }

    return actions;
  };

  const getIcon = (iconType: string) => {
    switch (iconType) {
      case 'retry':
        return (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
          </svg>
        );
      case 'schedule':
        return (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
          </svg>
        );
      case 'continue':
        return (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        );
      case 'status':
        return (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
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

  const getButtonStyles = (variant: ActionButton['variant'], disabled?: boolean, loading?: boolean) => {
    const baseStyles = "inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors";
    
    if (disabled || loading) {
      return `${baseStyles} opacity-50 cursor-not-allowed`;
    }

    switch (variant) {
      case 'primary':
        return `${baseStyles} bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500`;
      case 'secondary':
        return `${baseStyles} bg-gray-200 text-gray-900 hover:bg-gray-300 focus:ring-gray-500`;
      case 'outline':
        return `${baseStyles} border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 focus:ring-gray-500`;
      case 'warning':
        return `${baseStyles} bg-yellow-600 text-white hover:bg-yellow-700 focus:ring-yellow-500`;
    }
  };

  const actions = getActions();

  // Don't render if no actions available
  if (actions.length === 0) {
    return null;
  }

  return (
    <div className={`bg-white border border-gray-200 rounded-lg p-4 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-900">
          Available Actions
        </h3>
        {serviceStatus && (
          <div className="text-xs text-gray-500">
            Service: {serviceStatus.status}
          </div>
        )}
      </div>

      <div className="space-y-3">
        {actions.map((action) => (
          <div key={action.id} className="flex items-start gap-3">
            <button
              onClick={action.action}
              disabled={action.disabled}
              className={getButtonStyles(action.variant, action.disabled, action.loading)}
            >
              {action.loading ? (
                <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
              ) : (
                getIcon(action.icon)
              )}
              {action.label}
            </button>
            
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-600 mt-1">
                {action.description}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Service Status Details */}
      {serviceStatus && serviceStatus.status !== 'healthy' && (
        <div className="mt-4 pt-3 border-t border-gray-200">
          <div className="text-xs text-gray-600">
            <div className="flex items-center justify-between">
              <span className="font-medium">Current Status:</span>
              <span className={`px-2 py-1 rounded text-xs ${
                serviceStatus.status === 'healthy' 
                  ? 'bg-green-100 text-green-800'
                  : 'bg-red-100 text-red-800'
              }`}>
                {serviceStatus.status}
              </span>
            </div>
            
            {serviceStatus.details?.responseTime && (
              <div className="mt-1">
                <span className="font-medium">Response Time:</span> {serviceStatus.details.responseTime}
              </div>
            )}
            
            {serviceStatus.error && (
              <div className="mt-1">
                <span className="font-medium">Error:</span> {serviceStatus.error}
              </div>
            )}
            
            <div className="mt-1 text-gray-500">
              Last checked: {new Date(serviceStatus.timestamp).toLocaleTimeString()}
            </div>
          </div>
        </div>
      )}

      {/* Last Action Feedback */}
      {lastAction && (
        <div className="mt-3 pt-3 border-t border-gray-200">
          <div className="text-xs text-gray-600">
            <span className="font-medium">Last action:</span> {
              actions.find(a => a.id === lastAction)?.label || lastAction
            }
            {loadingActions.has(lastAction) && (
              <span className="ml-2 text-blue-600">In progress...</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default ServiceDegradationActions;