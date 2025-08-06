'use client';

import React, { useState } from 'react';
import { ReportGenerationFallbackInfo } from '@/types/bedrockHealth';

interface FallbackTransparencyIndicatorProps {
  fallbackInfo: ReportGenerationFallbackInfo | null;
  reportType?: 'basic' | 'ai_enhanced' | 'hybrid';
  generationTime?: number;
  onUpgradeRequest?: () => void;
  className?: string;
  compact?: boolean;
}

export function FallbackTransparencyIndicator({
  fallbackInfo,
  reportType = 'basic',
  generationTime,
  onUpgradeRequest,
  className = '',
  compact = false
}: FallbackTransparencyIndicatorProps) {
  const [showDetails, setShowDetails] = useState(false);

  // If no fallback info and report is AI enhanced, don't show indicator
  if (!fallbackInfo && reportType === 'ai_enhanced') {
    return null;
  }

  const getReportTypeConfig = () => {
    if (fallbackInfo) {
      return {
        type: 'Template Report',
        description: 'This report was generated using a basic template due to AI service unavailability',
        icon: 'template',
        color: 'yellow',
        canUpgrade: true
      };
    }

    switch (reportType) {
      case 'ai_enhanced':
        return {
          type: 'AI-Enhanced Report',
          description: 'This report includes comprehensive AI analysis and insights',
          icon: 'ai',
          color: 'green',
          canUpgrade: false
        };
      case 'hybrid':
        return {
          type: 'Hybrid Report',
          description: 'This report combines AI analysis with template components',
          icon: 'hybrid',
          color: 'blue',
          canUpgrade: true
        };
      case 'basic':
      default:
        return {
          type: 'Basic Report',
          description: 'This report uses standard templates and analysis',
          icon: 'basic',
          color: 'gray',
          canUpgrade: true
        };
    }
  };

  const config = getReportTypeConfig();

  const getIcon = (iconType: string) => {
    switch (iconType) {
      case 'ai':
        return (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" clipRule="evenodd" />
          </svg>
        );
      case 'hybrid':
        return (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm0 4a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1V8zm8 0a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1h-4a1 1 0 01-1-1V8zm0 4a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1h-4a1 1 0 01-1-1v-2z" clipRule="evenodd" />
          </svg>
        );
      case 'template':
        return (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2H4zm0 2h5v8H4V6zm7 0h5v2h-5V6zm0 4h5v4h-5v-4z" clipRule="evenodd" />
          </svg>
        );
      case 'basic':
      default:
        return (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2H4zm0 2v8h12V6H4z" clipRule="evenodd" />
          </svg>
        );
    }
  };

  const getColorClasses = (color: string) => {
    switch (color) {
      case 'green':
        return {
          bg: 'bg-green-50',
          border: 'border-green-200',
          text: 'text-green-700',
          icon: 'text-green-500',
          badge: 'bg-green-100 text-green-800'
        };
      case 'blue':
        return {
          bg: 'bg-blue-50',
          border: 'border-blue-200',
          text: 'text-blue-700',
          icon: 'text-blue-500',
          badge: 'bg-blue-100 text-blue-800'
        };
      case 'yellow':
        return {
          bg: 'bg-yellow-50',
          border: 'border-yellow-200',
          text: 'text-yellow-700',
          icon: 'text-yellow-500',
          badge: 'bg-yellow-100 text-yellow-800'
        };
      case 'gray':
      default:
        return {
          bg: 'bg-gray-50',
          border: 'border-gray-200',
          text: 'text-gray-700',
          icon: 'text-gray-500',
          badge: 'bg-gray-100 text-gray-800'
        };
    }
  };

  const colors = getColorClasses(config.color);

  const getFallbackReasonText = (reason: ReportGenerationFallbackInfo['reason']) => {
    switch (reason) {
      case 'initialization_failed':
        return 'AI service could not be initialized';
      case 'validation_failed':
        return 'AI service validation failed';
      case 'timeout':
        return 'AI service request timed out';
      case 'bedrock_unavailable':
      default:
        return 'AI service was unavailable';
    }
  };

  if (compact) {
    return (
      <div className={`inline-flex items-center gap-2 px-2 py-1 rounded text-xs border ${colors.border} ${colors.bg} ${className}`}>
        <div className={colors.icon}>
          {getIcon(config.icon)}
        </div>
        <span className={colors.text}>{config.type}</span>
        {fallbackInfo && (
          <span className={`px-1.5 py-0.5 rounded text-xs ${colors.badge}`}>
            Fallback
          </span>
        )}
      </div>
    );
  }

  return (
    <div className={`border rounded-lg p-3 ${colors.border} ${colors.bg} ${className}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className={colors.icon}>
            {getIcon(config.icon)}
          </div>
          <div>
            <div className={`font-medium text-sm ${colors.text}`}>
              {config.type}
            </div>
            <div className={`text-xs mt-1 ${colors.text} opacity-80`}>
              {config.description}
            </div>
          </div>
        </div>

        {config.canUpgrade && onUpgradeRequest && (
          <button
            onClick={onUpgradeRequest}
            className="text-xs bg-white border border-gray-300 text-gray-700 px-2 py-1 rounded hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500"
          >
            Upgrade to AI
          </button>
        )}
      </div>

      {/* Fallback Information */}
      {fallbackInfo && (
        <div className="mt-3 pt-3 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <div className="text-xs text-gray-600">
              <strong>Reason:</strong> {getFallbackReasonText(fallbackInfo.reason)}
            </div>
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="text-xs text-blue-600 hover:text-blue-800 underline"
            >
              {showDetails ? 'Hide details' : 'Show details'}
            </button>
          </div>

          {showDetails && (
            <div className="mt-2 space-y-1 text-xs text-gray-600">
              <div>
                <strong>Fallback Type:</strong> {fallbackInfo.fallbackType}
              </div>
              <div>
                <strong>Occurred:</strong> {new Date(fallbackInfo.timestamp).toLocaleString()}
              </div>
              {generationTime && (
                <div>
                  <strong>Generation Time:</strong> {(generationTime / 1000).toFixed(2)}s
                </div>
              )}
              {fallbackInfo.originalError && (
                <div>
                  <strong>Error:</strong> {fallbackInfo.originalError}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Performance Info */}
      {generationTime && !fallbackInfo && (
        <div className="mt-2 pt-2 border-t border-gray-200">
          <div className="text-xs text-gray-600">
            <strong>Generation Time:</strong> {(generationTime / 1000).toFixed(2)}s
          </div>
        </div>
      )}
    </div>
  );
}

export default FallbackTransparencyIndicator;