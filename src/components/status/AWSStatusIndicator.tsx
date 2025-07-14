'use client';

import React, { useState } from 'react';
import { 
  useAWSStatus, 
  getAWSStatusColor, 
  getAWSStatusIcon, 
  formatLastUpdated,
  AWSStatus 
} from '@/hooks/useAWSStatus';
import { AWSCredentialsModal } from '@/components/aws/AWSCredentialsModal';

interface AWSStatusIndicatorProps {
  mode?: 'compact' | 'detailed' | 'card';
  showRefreshButton?: boolean;
  showDetails?: boolean;
  className?: string;
  onStatusChange?: (status: AWSStatus | null) => void;
  enableCredentialModal?: boolean;
}

export function AWSStatusIndicator({
  mode = 'compact',
  showRefreshButton = true,
  showDetails = false,
  className = '',
  onStatusChange,
  enableCredentialModal = true
}: AWSStatusIndicatorProps) {
  const { 
    status, 
    isLoading, 
    error, 
    lastUpdated, 
    refreshStatus, 
    isRefreshing 
  } = useAWSStatus({
    autoRefresh: true,
    refreshInterval: 5 * 60 * 1000, // 5 minutes
    retryOnError: true,
    maxRetries: 3
  });

  const [showDetailedError, setShowDetailedError] = useState(false);
  const [showCredentialsModal, setShowCredentialsModal] = useState(false);

  // Notify parent of status changes
  React.useEffect(() => {
    if (onStatusChange) {
      onStatusChange(status);
    }
  }, [status, onStatusChange]);

  const statusColor = getAWSStatusColor(status || undefined);
  const statusIcon = getAWSStatusIcon(status || undefined);

  // Determine display colors
  const getColorClasses = (color: string) => {
    switch (color) {
      case 'green':
        return {
          bg: 'bg-green-50',
          border: 'border-green-200',
          text: 'text-green-800',
          dot: 'bg-green-400'
        };
      case 'red':
        return {
          bg: 'bg-red-50',
          border: 'border-red-200',
          text: 'text-red-800',
          dot: 'bg-red-400'
        };
      case 'yellow':
        return {
          bg: 'bg-yellow-50',
          border: 'border-yellow-200',
          text: 'text-yellow-800',
          dot: 'bg-yellow-400'
        };
      default:
        return {
          bg: 'bg-gray-50',
          border: 'border-gray-200',
          text: 'text-gray-800',
          dot: 'bg-gray-400'
        };
    }
  };

  const colors = getColorClasses(statusColor);

  const handleRefresh = async () => {
    try {
      await refreshStatus();
    } catch (error) {
      console.error('Failed to refresh AWS status:', error);
    }
  };

  const handleStatusClick = () => {
    if (enableCredentialModal && (!status?.configured || !status?.valid)) {
      setShowCredentialsModal(true);
    }
  };

  const handleCredentialSuccess = () => {
    setShowCredentialsModal(false);
    refreshStatus();
  };

  // Determine if status is clickable
  const isClickable = enableCredentialModal && (!status?.configured || !status?.valid);
  const clickableClasses = isClickable ? 'cursor-pointer hover:opacity-80 transition-opacity' : '';

  const renderCompactMode = () => (
    <div 
      className={`inline-flex items-center gap-2 px-3 py-1 rounded-lg ${colors.bg} ${colors.border} border ${className} ${clickableClasses}`}
      onClick={handleStatusClick}
      title={isClickable ? 'Click to configure AWS credentials' : undefined}
    >
      <div className={`w-2 h-2 rounded-full ${colors.dot} ${isLoading || isRefreshing ? 'animate-pulse' : ''}`} />
      <span className={`text-sm font-medium ${colors.text}`}>
        {isLoading ? 'Checking...' : status?.message || 'AWS Status'}
      </span>
      {showRefreshButton && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleRefresh();
          }}
          disabled={isLoading || isRefreshing}
          className={`text-xs ${colors.text} hover:opacity-75 disabled:opacity-50`}
          title="Refresh AWS status"
        >
          {isRefreshing ? '⟳' : '↻'}
        </button>
      )}
    </div>
  );

  const renderDetailedMode = () => (
    <div 
      className={`p-4 rounded-lg ${colors.bg} ${colors.border} border ${className} ${clickableClasses}`}
      onClick={handleStatusClick}
      title={isClickable ? 'Click to configure AWS credentials' : undefined}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${colors.dot} ${isLoading || isRefreshing ? 'animate-pulse' : ''}`} />
          <div>
            <h3 className={`font-semibold ${colors.text}`}>AWS Service Status</h3>
            <p className={`text-sm ${colors.text} opacity-75`}>
              {isLoading ? 'Checking AWS connectivity...' : status?.message || 'Unknown status'}
            </p>
          </div>
        </div>
        {showRefreshButton && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleRefresh();
            }}
            disabled={isLoading || isRefreshing}
            className={`px-3 py-1 text-sm rounded ${colors.text} hover:bg-opacity-20 hover:bg-black disabled:opacity-50 transition-colors`}
            title="Refresh AWS status"
          >
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        )}
      </div>

      {status && (
        <div className="space-y-2 text-sm">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className={`${colors.text} font-medium`}>Configuration:</span>
              <span className={`ml-2 ${colors.text}`}>
                {status.configured ? '✓ Configured' : '✗ Not configured'}
              </span>
            </div>
            <div>
              <span className={`${colors.text} font-medium`}>Credentials:</span>
              <span className={`ml-2 ${colors.text}`}>
                {status.valid ? '✓ Valid' : '✗ Invalid'}
              </span>
            </div>
            <div>
              <span className={`${colors.text} font-medium`}>Region:</span>
              <span className={`ml-2 ${colors.text}`}>{status.region}</span>
            </div>
            {status.connectionTest && (
              <div>
                <span className={`${colors.text} font-medium`}>Latency:</span>
                <span className={`ml-2 ${colors.text}`}>
                  {status.connectionTest.latency ? `${status.connectionTest.latency}ms` : 'Unknown'}
                </span>
              </div>
            )}
          </div>

          <div className="pt-2 border-t border-opacity-20 border-gray-400">
            <span className={`${colors.text} text-xs opacity-75`}>
              Last checked: {formatLastUpdated(lastUpdated)}
            </span>
          </div>

          {(error || status.errorMessage) && (
            <div className="pt-2">
              <button
                onClick={() => setShowDetailedError(!showDetailedError)}
                className={`text-xs ${colors.text} hover:opacity-75 underline`}
              >
                {showDetailedError ? 'Hide' : 'Show'} error details
              </button>
              {showDetailedError && (
                <div className="mt-2 p-2 bg-black bg-opacity-10 rounded text-xs">
                  {error || status.errorMessage}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );

  const renderCardMode = () => (
    <div 
      className={`p-6 rounded-xl shadow-sm ${colors.bg} ${colors.border} border ${className} ${clickableClasses}`}
      onClick={handleStatusClick}
      title={isClickable ? 'Click to configure AWS credentials' : undefined}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-4 h-4 rounded-full ${colors.dot} ${isLoading || isRefreshing ? 'animate-pulse' : ''}`} />
          <h2 className={`text-lg font-semibold ${colors.text}`}>AWS Service</h2>
        </div>
        <span className="text-2xl" title={status?.status || 'Unknown'}>
          {statusIcon}
        </span>
      </div>

      <div className={`text-sm ${colors.text} mb-4`}>
        {isLoading ? 'Checking AWS connectivity...' : status?.message || 'AWS service status unknown'}
      </div>

      {status && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="flex justify-between">
              <span className={`${colors.text} opacity-75`}>Configuration:</span>
              <span className={`${colors.text} font-medium`}>
                {status.configured ? '✓' : '✗'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className={`${colors.text} opacity-75`}>Credentials:</span>
              <span className={`${colors.text} font-medium`}>
                {status.valid ? '✓' : '✗'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className={`${colors.text} opacity-75`}>Region:</span>
              <span className={`${colors.text} font-medium`}>{status.region}</span>
            </div>
            {status.connectionTest && (
              <div className="flex justify-between">
                <span className={`${colors.text} opacity-75`}>Response:</span>
                <span className={`${colors.text} font-medium`}>
                  {status.connectionTest.latency ? `${status.connectionTest.latency}ms` : 'N/A'}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-opacity-20 border-gray-400">
            <span className={`${colors.text} text-xs opacity-75`}>
              Updated {formatLastUpdated(lastUpdated)}
            </span>
            {showRefreshButton && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleRefresh();
                }}
                disabled={isLoading || isRefreshing}
                className={`px-3 py-1 text-xs rounded-md ${colors.text} hover:bg-black hover:bg-opacity-10 disabled:opacity-50 transition-colors`}
              >
                {isRefreshing ? 'Refreshing...' : 'Refresh'}
              </button>
            )}
          </div>
        </div>
      )}

      {(showDetails && (error || status?.errorMessage)) && (
        <div className="mt-4 pt-3 border-t border-opacity-20 border-gray-400">
          <details className="text-xs">
            <summary className={`${colors.text} cursor-pointer hover:opacity-75`}>
              Error Details
            </summary>
            <div className="mt-2 p-2 bg-black bg-opacity-10 rounded">
              {error || status?.errorMessage}
            </div>
          </details>
        </div>
      )}
    </div>
  );

  return (
    <>
      {(() => {
        switch (mode) {
          case 'detailed':
            return renderDetailedMode();
          case 'card':
            return renderCardMode();
          case 'compact':
          default:
            return renderCompactMode();
        }
      })()}
      
      {enableCredentialModal && (
        <AWSCredentialsModal
          isOpen={showCredentialsModal}
          onClose={() => setShowCredentialsModal(false)}
          onSuccess={handleCredentialSuccess}
          initialData={{
            awsRegion: status?.region || 'us-east-1'
          }}
        />
      )}
    </>
  );
}

// Quick status indicator for navigation bars
export function AWSStatusBadge({ className = '' }: { className?: string }) {
  return (
    <AWSStatusIndicator 
      mode="compact" 
      showRefreshButton={false}
      className={className}
    />
  );
}

// Status indicator with tooltip for detailed information
export function AWSStatusTooltip({ children, className = '' }: { 
  children: React.ReactNode;
  className?: string;
}) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className={`relative ${className}`}>
      <div 
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className="cursor-help"
      >
        {children}
      </div>
      {showTooltip && (
        <div className="absolute z-50 bottom-full left-1/2 transform -translate-x-1/2 mb-2">
          <AWSStatusIndicator mode="detailed" showRefreshButton={false} />
        </div>
      )}
    </div>
  );
} 