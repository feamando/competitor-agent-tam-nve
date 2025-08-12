'use client';

import React, { useState, useEffect } from 'react';
import { ReportGenerationFallbackInfo } from '@/types/bedrockHealth';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { LoadingButton } from '@/components/composed/LoadingButton';
import { cn } from '@/lib/utils';

interface ReportGenerationNotificationsProps {
  projectId?: string;
  reportId?: string;
  fallbackInfo?: ReportGenerationFallbackInfo;
  onRetry?: () => void;
  onDismiss?: () => void;
  className?: string;
}

interface NotificationAction {
  label: string;
  description: string;
  action: () => void;
  primary?: boolean;
  variant?: 'primary' | 'secondary' | 'outline';
}

export function ReportGenerationNotifications({
  projectId,
  reportId,
  fallbackInfo,
  onRetry,
  onDismiss,
  className = ''
}: ReportGenerationNotificationsProps) {
  const [isDismissed, setIsDismissed] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  // Don't show notification if dismissed or no fallback info
  if (isDismissed || !fallbackInfo) {
    return null;
  }

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      if (onRetry) {
        await onRetry();
      }
    } finally {
      setIsRetrying(false);
    }
  };

  const handleDismiss = () => {
    setIsDismissed(true);
    if (onDismiss) {
      onDismiss();
    }
  };

  const getNotificationConfig = (reason: ReportGenerationFallbackInfo['reason']) => {
    switch (reason) {
      case 'initialization_failed':
        return {
          title: 'AI Service Configuration Issue',
          message: 'AI service could not be initialized. Your report was generated using our basic template.',
          icon: 'configuration',
          severity: 'warning' as const,
          canRetry: true,
          actions: [
            {
              label: 'Retry with AI',
              description: 'Try generating an AI-enhanced version of this report',
              action: handleRetry,
              primary: true,
              variant: 'primary' as const
            },
            {
              label: 'Contact Support',
              description: 'Get help with AI service configuration',
              action: () => window.open('/help/contact', '_blank'),
              variant: 'outline' as const
            }
          ]
        };
      
      case 'validation_failed':
        return {
          title: 'AI Service Validation Error',
          message: 'AI service validation failed. Your report was generated using our basic template.',
          icon: 'validation',
          severity: 'warning' as const,
          canRetry: true,
          actions: [
            {
              label: 'Retry Generation',
              description: 'Attempt to generate an AI-enhanced report again',
              action: handleRetry,
              primary: true,
              variant: 'primary' as const
            }
          ]
        };
      
      case 'timeout':
        return {
          title: 'AI Service Timeout',
          message: 'AI service is responding slowly. Your report was generated using our basic template to avoid delays.',
          icon: 'timeout',
          severity: 'info' as const,
          canRetry: true,
          actions: [
            {
              label: 'Try AI Again',
              description: 'Retry with AI enhancement (may take longer)',
              action: handleRetry,
              primary: true,
              variant: 'primary' as const
            },
            {
              label: 'Schedule AI Version',
              description: 'Generate AI-enhanced version in background',
              action: () => {
                // TODO: Implement background scheduling
                console.log('Scheduling AI-enhanced version for background processing');
              },
              variant: 'secondary' as const
            }
          ]
        };
      
      case 'bedrock_unavailable':
      default:
        return {
          title: 'AI Service Temporarily Unavailable',
          message: 'AI analysis service is currently unavailable. Your report was generated using our basic template.',
          icon: 'unavailable',
          severity: 'warning' as const,
          canRetry: true,
          actions: [
            {
              label: 'Retry with AI',
              description: 'Check if AI service is available and retry',
              action: handleRetry,
              primary: true,
              variant: 'primary' as const
            },
            {
              label: 'Check Service Status',
              description: 'View current AI service status',
              action: () => window.open('/dashboard/system-health', '_blank'),
              variant: 'outline' as const
            }
          ]
        };
    }
  };

  const config = getNotificationConfig(fallbackInfo.reason);

  const getIcon = (iconType: string) => {
    switch (iconType) {
      case 'configuration':
        return (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.211 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
          </svg>
        );
      case 'validation':
        return (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
        );
      case 'timeout':
        return (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
          </svg>
        );
      case 'unavailable':
      default:
        return (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        );
    }
  };

  const getSeverityStyles = (severity: 'info' | 'warning' | 'error') => {
    switch (severity) {
      case 'info':
        return {
          container: 'bg-blue-50 border-blue-200',
          icon: 'text-blue-400',
          title: 'text-blue-800',
          message: 'text-blue-700'
        };
      case 'warning':
        return {
          container: 'bg-yellow-50 border-yellow-200',
          icon: 'text-yellow-400',
          title: 'text-yellow-800',
          message: 'text-yellow-700'
        };
      case 'error':
        return {
          container: 'bg-red-50 border-red-200',
          icon: 'text-red-400',
          title: 'text-red-800',
          message: 'text-red-700'
        };
    }
  };

  const getButtonStyles = (variant: 'primary' | 'secondary' | 'outline') => {
    switch (variant) {
      case 'primary':
        return 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500';
      case 'secondary':
        return 'bg-gray-200 text-gray-900 hover:bg-gray-300 focus:ring-gray-500';
      case 'outline':
        return 'border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 focus:ring-gray-500';
    }
  };

  const styles = getSeverityStyles(config.severity);

  return (
    <Alert className={cn(styles.container, className)} variant={
      config.severity === 'error' ? 'destructive' : 
      config.severity === 'warning' ? 'default' : 
      'default'
    }>
      <div className="flex">
        <div className="flex-shrink-0">
          <div className={styles.icon}>
            {getIcon(config.icon)}
          </div>
        </div>
        
        <div className="ml-3 flex-1">
          <div className="flex items-start justify-between">
            <div>
              <h3 className={`text-sm font-medium ${styles.title}`}>
                {config.title}
              </h3>
              <AlertDescription className={`mt-2 ${styles.message}`}>
                {config.message}
              </AlertDescription>
            </div>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDismiss}
              className="ml-4 h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
            >
              <span className="sr-only">Dismiss</span>
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </Button>
          </div>

          {/* Actions */}
          {config.actions && config.actions.length > 0 && (
            <div className="mt-4">
              <div className="flex gap-2 flex-wrap">
                {config.actions.map((action, index) => (
                  action.primary ? (
                    <LoadingButton
                      key={index}
                      onClick={action.action}
                      loading={isRetrying && action.primary}
                      variant={action.variant === 'primary' ? 'default' : action.variant === 'outline' ? 'outline' : 'secondary'}
                      size="sm"
                      title={action.description}
                    >
                      {action.label}
                    </LoadingButton>
                  ) : (
                    <Button
                      key={index}
                      onClick={action.action}
                      variant={action.variant === 'primary' ? 'default' : action.variant === 'outline' ? 'outline' : 'secondary'}
                      size="sm"
                      title={action.description}
                    >
                      {action.label}
                    </Button>
                  )
                ))}
              </div>
            </div>
          )}

          {/* Details Toggle */}
          {fallbackInfo.originalError && (
            <div className="mt-3">
              <Button
                variant="link"
                size="sm"
                onClick={() => setShowDetails(!showDetails)}
                className="h-auto p-0 text-xs underline"
              >
                {showDetails ? 'Hide technical details' : 'Show technical details'}
              </Button>
              
              {showDetails && (
                <Card className="mt-2">
                  <CardContent className="p-2 text-xs font-mono space-y-1">
                    <div><strong>Fallback Type:</strong> {fallbackInfo.fallbackType}</div>
                    <div><strong>Timestamp:</strong> {new Date(fallbackInfo.timestamp).toLocaleString()}</div>
                    <div><strong>Error:</strong> {fallbackInfo.originalError}</div>
                    {reportId && <div><strong>Report ID:</strong> {reportId}</div>}
                    {projectId && <div><strong>Project ID:</strong> {projectId}</div>}
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      </div>
    </Alert>
  );
}

export default ReportGenerationNotifications;