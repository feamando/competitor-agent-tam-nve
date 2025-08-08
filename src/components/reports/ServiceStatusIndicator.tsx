'use client';

import React, { useState, useEffect } from 'react';
import { BedrockHealthStatus } from '@/types/bedrockHealth';

interface ServiceStatusIndicatorProps {
  className?: string;
  compact?: boolean;
  onStatusChange?: (status: BedrockHealthStatus) => void;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

interface ServiceStatusResponse {
  status: 'healthy' | 'unhealthy' | 'degraded';
  service: string;
  timestamp: string;
  responseTime: string;
  details?: {
    region?: string;
    provider?: string;
    validationPassed?: boolean;
    circuitBreakerState?: string;
    errorType?: string;
  };
  error?: string;
}

export function ServiceStatusIndicator({
  className = '',
  compact = false,
  onStatusChange,
  autoRefresh = true,
  refreshInterval = 30000 // 30 seconds
}: ServiceStatusIndicatorProps) {
  const [status, setStatus] = useState<ServiceStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchServiceStatus = async () => {
    try {
      setError(null);
      const response = await fetch('/api/system-health/bedrock');
      const data: ServiceStatusResponse = await response.json();
      
      setStatus(data);
      setLastUpdated(new Date());
      
      // Convert to BedrockHealthStatus format for callback
      if (onStatusChange) {
        const bedrockStatus: BedrockHealthStatus = {
          status: data.status === 'healthy' ? 'healthy' : 'unhealthy',
          timestamp: data.timestamp,
          details: {
            region: data.details?.region || 'us-east-1',
            provider: data.details?.provider || 'anthropic',
            validationPassed: data.details?.validationPassed || false,
            responseTime: data.responseTime
          },
          error: data.error
        };
        onStatusChange(bedrockStatus);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch service status';
      setError(errorMessage);
      setStatus({
        status: 'unhealthy',
        service: 'bedrock',
        timestamp: new Date().toISOString(),
        responseTime: 'N/A',
        error: errorMessage
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchServiceStatus();

    let interval: NodeJS.Timeout | undefined;
    if (autoRefresh) {
      interval = setInterval(fetchServiceStatus, refreshInterval);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh, refreshInterval]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return (
          <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
        );
      case 'degraded':
        return (
          <svg className="w-4 h-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        );
      case 'unhealthy':
      default:
        return (
          <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
        );
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'text-green-700 bg-green-50 border-green-200';
      case 'degraded':
        return 'text-yellow-700 bg-yellow-50 border-yellow-200';
      case 'unhealthy':
      default:
        return 'text-red-700 bg-red-50 border-red-200';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'AI Analysis Available';
      case 'degraded':
        return 'AI Analysis Limited';
      case 'unhealthy':
      default:
        return 'AI Analysis Unavailable';
    }
  };

  const getStatusDescription = (status: string, error?: string) => {
    switch (status) {
      case 'healthy':
        return 'Full AI-enhanced report generation is available';
      case 'degraded':
        return 'Limited AI features available, some reports may use basic templates';
      case 'unhealthy':
      default:
        if (error) {
          if (error.includes('credentials')) {
            return 'AWS credentials need to be configured. Reports will use basic templates.';
          } else if (error.includes('timeout')) {
            return 'AI service is responding slowly. Reports may take longer or use basic templates.';
          } else if (error.includes('rate limit')) {
            return 'AI service rate limit exceeded. Reports will use basic templates temporarily.';
          }
        }
        return 'AI service is unavailable. Reports will use basic templates.';
    }
  };

  if (isLoading) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-900"></div>
        <span className="text-sm text-gray-600">Checking AI service...</span>
      </div>
    );
  }

  if (compact) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        {status && getStatusIcon(status.status)}
        <span className="text-sm font-medium">
          {status ? getStatusText(status.status) : 'Unknown'}
        </span>
      </div>
    );
  }

  return (
    <div className={`border rounded-lg p-3 ${status ? getStatusColor(status.status) : 'border-gray-200'} ${className}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          {status && getStatusIcon(status.status)}
          <div>
            <div className="font-medium text-sm">
              {status ? getStatusText(status.status) : 'Service Status Unknown'}
            </div>
            <div className="text-xs mt-1">
              {status ? getStatusDescription(status.status, status.error) : 'Unable to determine service status'}
            </div>
          </div>
        </div>
        
        <div className="text-xs text-gray-500 ml-2">
          {lastUpdated && (
            <div>Updated {lastUpdated.toLocaleTimeString()}</div>
          )}
          {status?.responseTime && (
            <div className="mt-1">Response: {status.responseTime}</div>
          )}
        </div>
      </div>

      {status?.details?.circuitBreakerState && status.details.circuitBreakerState !== 'CLOSED' && (
        <div className="mt-2 text-xs p-2 bg-yellow-50 border border-yellow-200 rounded">
          <strong>Circuit Breaker:</strong> {status.details.circuitBreakerState}
          {status.details.circuitBreakerState === 'OPEN' && 
            <span className="ml-1">- Automatic retry in progress</span>
          }
        </div>
      )}

      {error && (
        <div className="mt-2 text-xs p-2 bg-red-50 border border-red-200 rounded">
          <strong>Error:</strong> {error}
        </div>
      )}
    </div>
  );
}

export default ServiceStatusIndicator;