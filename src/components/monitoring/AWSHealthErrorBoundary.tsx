// Task 9.4.1: Create error boundary for AWS components
import React, { Component, ErrorInfo, ReactNode } from 'react';
import { logger } from '@/lib/logger';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
  errorId?: string;
}

class AWSHealthErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    // Task 9.4.1: Update state to show fallback UI
    return {
      hasError: true,
      error,
      errorId: `aws-error-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`
    };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Task 9.4.2: Capture and log unhandled errors
    const errorId = this.state.errorId || `aws-error-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    
    logger.error('AWS Health component error caught by boundary', error, {
      correlationId: errorId,
      operation: 'aws_component_error_boundary',
      operationType: 'error_handling',
      errorBoundary: 'AWSHealthErrorBoundary',
      componentStack: errorInfo.componentStack,
      errorInfo: {
        name: error.name,
        message: error.message,
        stack: error.stack
      },
      context: {
        userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : 'unknown',
        timestamp: new Date().toISOString(),
        url: typeof window !== 'undefined' ? window.location.href : 'unknown'
      }
    });

    // Task 9.4.3: Send error reports to monitoring service (placeholder)
    this.sendErrorReport(error, errorInfo, errorId);

    this.setState({ errorInfo, errorId });
  }

  // Task 9.4.3: Send error reports to monitoring service
  private sendErrorReport(error: Error, errorInfo: ErrorInfo, errorId: string) {
    // In production, this would send to actual monitoring service:
    // - Sentry
    // - AWS CloudWatch
    // - DataDog
    // - Custom error reporting endpoint
    
    console.error('[Error Report] AWS Health Component Error', {
      errorId,
      service: 'aws_health_monitoring',
      severity: 'error',
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack
      },
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString(),
      tags: ['aws', 'health_check', 'component_error', 'error_boundary']
    });
  }

  override render() {
    if (this.state.hasError) {
      // Task 9.4.4: Add user-friendly error messages
      const fallback = this.props.fallback || (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center mb-2">
            <div className="flex-shrink-0">
              <svg className="w-5 h-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">
                AWS Health Monitor Error
              </h3>
            </div>
          </div>
          <div className="text-sm text-red-700">
            <p className="mb-2">
              There was an unexpected error with the AWS health monitoring component. 
              This issue has been automatically reported for investigation.
            </p>
            <details className="mb-3">
              <summary className="cursor-pointer font-medium hover:text-red-900">
                Error Details (Error ID: {this.state.errorId})
              </summary>
              <div className="mt-2 p-2 bg-red-100 rounded text-xs font-mono">
                <p><strong>Error:</strong> {this.state.error?.message}</p>
                {process.env.NODE_ENV === 'development' && (
                  <p className="mt-1"><strong>Stack:</strong><br />
                    <pre className="whitespace-pre-wrap text-xs">
                      {this.state.error?.stack}
                    </pre>
                  </p>
                )}
              </div>
            </details>
            <div className="flex space-x-3">
              <button
                onClick={() => window.location.reload()}
                className="text-sm bg-red-100 hover:bg-red-200 text-red-800 px-3 py-1 rounded transition-colors"
              >
                Reload Page
              </button>
              <button
                onClick={() => this.setState({ hasError: false })}
                className="text-sm bg-red-100 hover:bg-red-200 text-red-800 px-3 py-1 rounded transition-colors"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      );

      return fallback;
    }

    return this.props.children;
  }
}

export default AWSHealthErrorBoundary; 