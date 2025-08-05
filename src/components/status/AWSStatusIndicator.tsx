'use client';

import React, { useState } from 'react';
import { 
  useAWSStatus, 
  getAWSStatusColor, 
  getAWSStatusIcon, 
  formatLastUpdated,
  AWSStatus,
  isCredentialsNotConfigured 
} from '@/hooks/useAWSStatus';
import { AWSCredentialsModal } from '@/components/aws/AWSCredentialsModal';
import { SkeletonLoader } from '@/components/common/SkeletonLoader';

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
    isRefreshing,
    autoRefreshEnabled 
  } = useAWSStatus({
    autoRefresh: true,
    refreshInterval: 5 * 60 * 1000, // 5 minutes
    retryOnError: true,
    maxRetries: 2 // Reduce max retries to prevent UI blocking
  });

  const [showDetailedError, setShowDetailedError] = useState(false);
  const [showCredentialsModal, setShowCredentialsModal] = useState(false);
  
  // Task 2.4.3: Add loading state for manual check button
  const [isManualChecking, setIsManualChecking] = useState(false);
  // Task 2.4.4: Add success/error feedback for manual check
  const [manualCheckResult, setManualCheckResult] = useState<'success' | 'error' | null>(null);
  
  // Task 5.2.1: Add conditional rendering for setup instructions
  // Task 7.3.4: Remember panel state in localStorage
  const [showSetupInstructions, setShowSetupInstructions] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        return localStorage.getItem('aws-setup-instructions-visible') === 'true';
      } catch {
        return false;
      }
    }
    return false;
  });
  
  // Task 5.3.1: Add loadingTimeout state variable
  const [loadingTimeout, setLoadingTimeout] = useState<NodeJS.Timeout | null>(null);
  const [isLoadingTimedOut, setIsLoadingTimedOut] = useState(false);
  
  // Task 7.1.2: Add 3-second timer for skeleton display
  const [showSkeleton, setShowSkeleton] = useState(true);
  const [skeletonTimeout, setSkeletonTimeout] = useState<NodeJS.Timeout | null>(null);
  
  // Task 7.2.1: Add setupRequiredTimeout timer
  const [showSetupRequired, setShowSetupRequired] = useState(false);
  const [setupRequiredTimeout, setSetupRequiredTimeout] = useState<NodeJS.Timeout | null>(null);

  // Task 7.2.4: Add fade transition to setup state
  const renderSetupRequiredState = () => (
    <div className={`transition-opacity duration-500 ease-in-out ${showSetupRequired ? 'opacity-100' : 'opacity-0'}`}>
      {(() => {
        switch (mode) {
          case 'detailed':
            return (
              <div className={`p-4 rounded-lg bg-blue-50 border border-blue-200 ${className}`}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-3 h-3 rounded-full bg-blue-400" />
                  <div>
                    <h3 className="font-semibold text-blue-800">AWS Setup Required</h3>
                    <p className="text-sm text-blue-700">Configure AWS credentials to get started</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowCredentialsModal(true)}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  Configure AWS Credentials
                </button>
              </div>
            );
          case 'card':
            return (
              <div className={`p-6 rounded-xl shadow-sm bg-blue-50 border border-blue-200 ${className}`}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-4 h-4 rounded-full bg-blue-400" />
                    <h2 className="text-lg font-semibold text-blue-800">AWS Setup</h2>
                  </div>
                  <span className="text-2xl">⚙️</span>
                </div>
                <div className="text-sm text-blue-700 mb-4">
                  AWS credentials need to be configured to monitor service status
                </div>
                <button
                  onClick={() => setShowCredentialsModal(true)}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  Configure AWS Credentials
                </button>
              </div>
            );
          case 'compact':
          default:
            return (
              <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-blue-50 border border-blue-200 ${className}`}>
                <div className="w-2 h-2 rounded-full bg-blue-400" />
                <span className="text-sm font-medium text-blue-800">Setup Required</span>
                <button
                  onClick={() => setShowCredentialsModal(true)}
                  className="text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                >
                  Setup
                </button>
              </div>
            );
        }
      })()}
    </div>
  );

  // Task 5.2.2: Create step-by-step setup instruction text  
  // Task 7.3.3: Animate panel expansion/collapse
  const renderSetupInstructions = () => (
    <div className={`mt-4 p-4 bg-gray-50 border border-gray-200 rounded-lg transition-all duration-300 ease-in-out transform ${
      showSetupInstructions ? 'opacity-100 scale-100 max-h-full' : 'opacity-0 scale-95 max-h-0 overflow-hidden'
    }`}>
      <h4 className="font-semibold text-gray-800 mb-3">AWS Credentials Setup</h4>
      <div className="space-y-3 text-sm text-gray-700">
        <div>
          <span className="font-medium">Step 1:</span> Create AWS IAM User
          <p className="ml-6 text-xs text-gray-600 mt-1">
            Go to AWS Console → IAM → Users → Create User with programmatic access
          </p>
        </div>
        <div>
          <span className="font-medium">Step 2:</span> Attach Required Policies
          <p className="ml-6 text-xs text-gray-600 mt-1">
            Attach policies like AmazonEC2ReadOnlyAccess, or create custom policies as needed
          </p>
        </div>
        <div>
          <span className="font-medium">Step 3:</span> Get Access Keys
          <p className="ml-6 text-xs text-gray-600 mt-1">
            Download the Access Key ID and Secret Access Key (save securely)
          </p>
        </div>
        <div>
          <span className="font-medium">Step 4:</span> Configure Environment
          <p className="ml-6 text-xs text-gray-600 mt-1">
            Set environment variables: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION
          </p>
        </div>
        <div>
          <span className="font-medium">Step 5:</span> Restart Application
          <p className="ml-6 text-xs text-gray-600 mt-1">
            Restart the application to load the new AWS credentials
          </p>
        </div>
      </div>
    </div>
  );

  // Notify parent of status changes
  React.useEffect(() => {
    if (onStatusChange) {
      onStatusChange(status);
    }
  }, [status, onStatusChange]);

  // Task 5.3.2: Set 10-second timeout on component mount and when loading starts
  React.useEffect(() => {
    if (isLoading && !isLoadingTimedOut) {
      // Task 5.3.4: Clear any existing timeout first
      if (loadingTimeout) {
        clearTimeout(loadingTimeout);
      }
      
      // Set new 10-second timeout
      const timeout = setTimeout(() => {
        // Task 5.3.3: Switch to error state after timeout
        setIsLoadingTimedOut(true);
        console.warn('AWS status check timed out after 10 seconds');
      }, 10000); // 10 seconds
      
      setLoadingTimeout(timeout);
      
      return () => {
        clearTimeout(timeout);
      };
    } else if (!isLoading && loadingTimeout) {
      // Task 5.3.4: Clear timeout on successful response or when loading stops
      clearTimeout(loadingTimeout);
      setLoadingTimeout(null);
      setIsLoadingTimedOut(false);
    }
  }, [isLoading, isLoadingTimedOut]);

  // Task 5.3.4: Cleanup timeout on component unmount
  React.useEffect(() => {
    return () => {
      if (loadingTimeout) {
        clearTimeout(loadingTimeout);
      }
    };
  }, [loadingTimeout]);

  // Task 7.1.2: Add 3-second timer for skeleton display
  React.useEffect(() => {
    // Set 3-second timeout for skeleton display
    const timeout = setTimeout(() => {
      setShowSkeleton(false);
    }, 3000);
    
    setSkeletonTimeout(timeout);
    
    return () => {
      clearTimeout(timeout);
    };
  }, []);

  // Task 7.1.3: Replace skeleton with actual content on load
  React.useEffect(() => {
    // Hide skeleton when we have status data or when loading is complete
    if (status || (!isLoading && !showSkeleton)) {
      setShowSkeleton(false);
      if (skeletonTimeout) {
        clearTimeout(skeletonTimeout);
        setSkeletonTimeout(null);
      }
    }
  }, [status, isLoading, showSkeleton, skeletonTimeout]);

  // Task 7.2.1 & 7.2.2: Switch to setup state after skeleton timeout
  React.useEffect(() => {
    if (!showSkeleton && !status && !isLoading) {
      // Show setup required after skeleton timeout (additional 2 seconds)
      const timeout = setTimeout(() => {
        setShowSetupRequired(true);
      }, 2000);
      
      setSetupRequiredTimeout(timeout);
      
      return () => {
        clearTimeout(timeout);
      };
    }
  }, [showSkeleton, status, isLoading]);

  // Task 7.2.3: Clear timeout when data loads successfully
  React.useEffect(() => {
    if (status) {
      setShowSetupRequired(false);
      if (setupRequiredTimeout) {
        clearTimeout(setupRequiredTimeout);
        setSetupRequiredTimeout(null);
      }
    }
  }, [status, setupRequiredTimeout]);

  // Task 7.3.4: Remember panel state in localStorage
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('aws-setup-instructions-visible', showSetupInstructions.toString());
      } catch (error) {
        console.warn('Failed to save setup instructions visibility state:', error);
      }
    }
  }, [showSetupInstructions]);

  // Task 5.3.3: Use red color scheme for timeout state
  const statusColor = isLoadingTimedOut ? 'red' : getAWSStatusColor(status || undefined);
  const statusIcon = isLoadingTimedOut ? '⏰' : getAWSStatusIcon(status || undefined);

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
      // Task 5.1.1: Add gray color scheme for not configured state
      case 'gray':
        return {
          bg: 'bg-gray-50',
          border: 'border-gray-200',
          text: 'text-gray-800',
          dot: 'bg-gray-400'
        };
      // Task 2.2.3: Add specific styling for configuration required state (kept for backward compatibility)
      case 'blue':
        return {
          bg: 'bg-blue-50',
          border: 'border-blue-200',
          text: 'text-blue-800',
          dot: 'bg-blue-400'
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

  // Task 7.4.4: Refresh status after wizard completion
  const handleCredentialSuccess = () => {
    setShowCredentialsModal(false);
    
    // Clear setup states when credentials are configured
    setShowSetupRequired(false);
    setShowSkeleton(false);
    
    // Clear any cached configuration status
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('aws-configuration-status');
      } catch (error) {
        console.warn('Failed to clear configuration cache:', error);
      }
    }
    
    refreshStatus();
  };

  // Task 2.4.2: Add click handler to trigger manual status check
  const handleManualCheck = async () => {
    if (isManualChecking) return;
    
    setIsManualChecking(true);
    setManualCheckResult(null);
    
    try {
      await refreshStatus();
      // Task 2.4.4: Add success/error feedback for manual check
      setManualCheckResult('success');
      setTimeout(() => setManualCheckResult(null), 3000); // Clear after 3 seconds
    } catch (error) {
      console.error('Manual configuration check failed:', error);
      setManualCheckResult('error');
      setTimeout(() => setManualCheckResult(null), 5000); // Clear after 5 seconds
    } finally {
      setIsManualChecking(false);
    }
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
      <div className={`w-2 h-2 rounded-full ${colors.dot} ${(isLoading && !isLoadingTimedOut) || isRefreshing ? 'animate-pulse' : ''}`} />
      <span className={`text-sm font-medium ${colors.text}`}>
        {/* Task 5.3.3: Switch to error state after timeout */}
        {isLoadingTimedOut ? 'Connection Timeout' : 
         isLoading ? 'Checking...' : status?.message || 'AWS Status'}
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
      
      {/* Task 2.4.1: Add Check Configuration button when auto-refresh is disabled */}
      {!autoRefreshEnabled && isCredentialsNotConfigured(status || undefined) && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleManualCheck();
          }}
          disabled={isManualChecking || isLoading || isRefreshing}
          className={`text-xs px-2 py-1 rounded ${colors.text} ${colors.bg} border ${colors.border} hover:opacity-75 disabled:opacity-50 transition-colors`}
          title="Check AWS configuration"
        >
          {/* Task 2.4.3: Add loading state for manual check button */}
          {isManualChecking ? 'Checking...' : 'Check Config'}
          {/* Task 2.4.4: Add success/error feedback for manual check */}
          {manualCheckResult === 'success' && ' ✓'}
          {manualCheckResult === 'error' && ' ✗'}
        </button>
      )}
      
      {/* Task 5.4.1: Add "Retry" button for error states (Compact Mode) */}
      {(error || status?.errorMessage) && !showRefreshButton && !isLoadingTimedOut && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleRefresh();
          }}
          disabled={isLoading || isRefreshing}
          className={`text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors`}
          title="Retry AWS status check"
        >
          {/* Task 5.4.4: Add loading state during retry attempts */}
          {isRefreshing ? 'Retrying...' : 'Retry'}
        </button>
      )}
      
      {/* Task 5.3.3: Add retry button when loading times out */}
      {isLoadingTimedOut && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsLoadingTimedOut(false);
            handleRefresh();
          }}
          className={`text-xs px-2 py-1 rounded bg-red-100 text-red-800 border border-red-200 hover:bg-red-200 transition-colors`}
          title="Retry connection"
        >
          Retry
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
          <div className={`w-3 h-3 rounded-full ${colors.dot} ${(isLoading && !isLoadingTimedOut) || isRefreshing ? 'animate-pulse' : ''}`} />
          <div>
            <h3 className={`font-semibold ${colors.text}`}>AWS Service Status</h3>
            <p className={`text-sm ${colors.text} opacity-75`}>
              {/* Task 5.3.3: Switch to error state after timeout */}
              {isLoadingTimedOut ? 'Connection timed out after 10 seconds' :
               isLoading ? 'Checking AWS connectivity...' : status?.message || 'Unknown status'}
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
        
        {/* Task 2.4.1: Add Check Configuration button when auto-refresh is disabled */}
        {!autoRefreshEnabled && isCredentialsNotConfigured(status || undefined) && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleManualCheck();
            }}
            disabled={isManualChecking || isLoading || isRefreshing}
            className={`ml-2 px-3 py-1 text-sm rounded ${colors.text} hover:bg-opacity-20 hover:bg-black disabled:opacity-50 transition-colors border ${colors.border}`}
            title="Check AWS configuration"
          >
            {/* Task 2.4.3: Add loading state for manual check button */}
            {isManualChecking ? 'Checking...' : 'Check Configuration'}
            {/* Task 2.4.4: Add success/error feedback for manual check */}
            {manualCheckResult === 'success' && ' ✓'}
            {manualCheckResult === 'error' && ' ✗'}
          </button>
        )}
        
        {/* Task 5.3.3: Add retry button when loading times out (Detailed Mode) */}
        {isLoadingTimedOut && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsLoadingTimedOut(false);
              handleRefresh();
            }}
            className="ml-2 px-3 py-1 text-sm rounded bg-red-100 text-red-800 border border-red-200 hover:bg-red-200 transition-colors"
            title="Retry connection"
          >
            Retry Connection
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

          {/* Task 5.2.3: Add "Configure AWS Credentials" button when credentials are missing */}
          {isCredentialsNotConfigured(status || undefined) && (
            <div className="pt-2 space-y-2">
              <button
                onClick={() => setShowCredentialsModal(true)}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                Configure AWS Credentials
              </button>
              
              {/* Task 5.2.4: Add collapsible instructions panel */}
              <button
                onClick={() => setShowSetupInstructions(!showSetupInstructions)}
                className={`text-xs ${colors.text} hover:opacity-75 underline`}
              >
                {showSetupInstructions ? 'Hide' : 'Show'} setup instructions
              </button>
              
              {/* Task 5.2.1: Conditional rendering for setup instructions */}
              {/* Task 7.3.3: Always render for smooth animation */}
              {renderSetupInstructions()}
            </div>
          )}

          {(error || status.errorMessage) && (
            <div className="pt-2 space-y-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowDetailedError(!showDetailedError)}
                  className={`text-xs ${colors.text} hover:opacity-75 underline`}
                >
                  {showDetailedError ? 'Hide' : 'Show'} error details
                </button>
                
                {/* Task 5.4.1: Add "Retry" button for error states */}
                <button
                  onClick={handleRefresh}
                  disabled={isLoading || isRefreshing}
                  className="px-3 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  title="Retry AWS status check"
                >
                  {/* Task 5.4.4: Add loading state during retry attempts */}
                  {isRefreshing ? 'Retrying...' : 'Retry'}
                </button>
              </div>
              
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
          <div className={`w-4 h-4 rounded-full ${colors.dot} ${(isLoading && !isLoadingTimedOut) || isRefreshing ? 'animate-pulse' : ''}`} />
          <h2 className={`text-lg font-semibold ${colors.text}`}>AWS Service</h2>
        </div>
        <span className="text-2xl" title={status?.status || 'Unknown'}>
          {statusIcon}
        </span>
      </div>

      <div className={`text-sm ${colors.text} mb-4`}>
        {/* Task 5.3.3: Switch to error state after timeout */}
        {isLoadingTimedOut ? 'Connection timed out after 10 seconds' :
         isLoading ? 'Checking AWS connectivity...' : status?.message || 'AWS service status unknown'}
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
            <div className="flex gap-2">
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
              
              {/* Task 2.4.1: Add Check Configuration button when auto-refresh is disabled */}
              {!autoRefreshEnabled && isCredentialsNotConfigured(status || undefined) && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleManualCheck();
                  }}
                  disabled={isManualChecking || isLoading || isRefreshing}
                  className={`px-3 py-1 text-xs rounded-md ${colors.text} hover:bg-black hover:bg-opacity-10 disabled:opacity-50 transition-colors border ${colors.border}`}
                  title="Check AWS configuration"
                >
                  {/* Task 2.4.3: Add loading state for manual check button */}
                  {isManualChecking ? 'Checking...' : 'Check Config'}
                  {/* Task 2.4.4: Add success/error feedback for manual check */}
                  {manualCheckResult === 'success' && ' ✓'}
                  {manualCheckResult === 'error' && ' ✗'}
                </button>
              )}
              
              {/* Task 5.3.3: Add retry button when loading times out (Card Mode) */}
              {isLoadingTimedOut && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsLoadingTimedOut(false);
                    handleRefresh();
                  }}
                  className="px-3 py-1 text-xs rounded-md bg-red-100 text-red-800 border border-red-200 hover:bg-red-200 transition-colors"
                  title="Retry connection"
                >
                  Retry
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Task 5.2.3: Add "Configure AWS Credentials" button when credentials are missing (Card Mode) */}
      {isCredentialsNotConfigured(status || undefined) && (
        <div className="mt-4 pt-3 border-t border-opacity-20 border-gray-400 space-y-3">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowCredentialsModal(true);
            }}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            Configure AWS Credentials
          </button>
          
          {/* Task 5.2.4: Add collapsible instructions panel (Card Mode) */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowSetupInstructions(!showSetupInstructions);
            }}
            className={`text-xs ${colors.text} hover:opacity-75 underline`}
          >
            {showSetupInstructions ? 'Hide' : 'Show'} setup instructions
          </button>
          
                     {/* Task 5.2.1: Conditional rendering for setup instructions (Card Mode) */}
           {/* Task 7.3.3: Always render for smooth animation */}
           {renderSetupInstructions()}
        </div>
      )}

      {(showDetails && (error || status?.errorMessage)) && (
        <div className="mt-4 pt-3 border-t border-opacity-20 border-gray-400">
          <div className="flex items-center justify-between mb-2">
            <details className="text-xs">
              <summary className={`${colors.text} cursor-pointer hover:opacity-75`}>
                Error Details
              </summary>
              <div className="mt-2 p-2 bg-black bg-opacity-10 rounded">
                {error || status?.errorMessage}
              </div>
            </details>
            
            {/* Task 5.4.1: Add "Retry" button for error states (Card Mode) */}
            <button
              onClick={handleRefresh}
              disabled={isLoading || isRefreshing}
              className="px-3 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              title="Retry AWS status check"
            >
              {/* Task 5.4.4: Add loading state during retry attempts */}
              {isRefreshing ? 'Retrying...' : 'Retry'}
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      {(() => {
        // Task 7.1.3: Replace skeleton with actual content on load
        if (showSkeleton && !status) {
          return <SkeletonLoader mode={mode} className={className} />;
        }
        
        // Task 7.2.2: Switch to setup state after skeleton timeout
        if (showSetupRequired && !status && !isLoading) {
          return renderSetupRequiredState();
        }
        
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