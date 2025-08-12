'use client';

import React from 'react';
import Link from 'next/link';
import { InitialReportStatus } from '@/hooks/useInitialReportStatus';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

interface InitialReportStatusCardProps {
  projectId: string;
  status?: InitialReportStatus | null;
  onViewReport?: (reportId: string) => void;
  showProgress?: boolean;
}

const STATUS_CONFIG = {
  not_started: {
    color: 'gray',
    icon: 'clock',
    label: 'Not Started',
    description: 'Report generation has not been initiated'
  },
  generating: {
    color: 'blue',
    icon: 'spinner',
    label: 'Generating',
    description: 'Creating your competitive analysis report'
  },
  completed: {
    color: 'green',
    icon: 'check',
    label: 'Complete',
    description: 'Report is ready to view'
  },
  failed: {
    color: 'red',
    icon: 'x',
    label: 'Failed',
    description: 'Report generation encountered an error'
  }
};

const getQualityTier = (score?: number): { label: string; color: string } => {
  if (!score) return { label: 'Unknown', color: 'gray' };
  
  if (score >= 90) return { label: 'Excellent', color: 'green' };
  if (score >= 75) return { label: 'Good', color: 'blue' };
  if (score >= 60) return { label: 'Fair', color: 'yellow' };
  return { label: 'Needs Improvement', color: 'red' };
};

const getFreshnessLabel = (freshness: string): { label: string; color: string } => {
  switch (freshness) {
    case 'new':
      return { label: 'Fresh Data', color: 'green' };
    case 'existing':
      return { label: 'Existing Data', color: 'yellow' };
    case 'mixed':
      return { label: 'Mixed Data', color: 'blue' };
    case 'basic':
      return { label: 'Basic Data', color: 'gray' };
    default:
      return { label: 'Unknown', color: 'gray' };
  }
};

const StatusIcon: React.FC<{ type: string; className?: string }> = ({ type, className = "h-4 w-4" }) => {
  switch (type) {
    case 'spinner':
      return (
        <svg className={`animate-spin ${className}`} viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      );
    case 'check':
      return (
        <svg className={className} viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
        </svg>
      );
    case 'x':
      return (
        <svg className={className} viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
        </svg>
      );
    case 'clock':
    default:
      return (
        <svg className={className} viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
        </svg>
      );
  }
};

export default function InitialReportStatusCard({
  projectId,
  status,
  onViewReport,
  showProgress = true
}: InitialReportStatusCardProps) {
  const currentStatus = status?.status || 'not_started';
  const config = STATUS_CONFIG[currentStatus];
  const qualityTier = getQualityTier(status?.dataCompletenessScore);
  const freshnessInfo = getFreshnessLabel(status?.dataFreshness || 'basic');

  // Determine card styling based on status
  const getCardVariant = () => {
    switch (config.color) {
      case 'green':
        return 'border-green-200 hover:border-green-300';
      case 'red':
        return 'border-red-200 hover:border-red-300';
      case 'blue':
        return 'border-blue-200 hover:border-blue-300';
      case 'yellow':
        return 'border-yellow-200 hover:border-yellow-300';
      default:
        return 'border-border hover:border-border/80';
    }
  };

  const getBadgeVariant = () => {
    switch (config.color) {
      case 'green':
        return 'default' as const;
      case 'red':
        return 'destructive' as const;
      case 'blue':
        return 'default' as const;
      case 'yellow':
        return 'secondary' as const;
      default:
        return 'secondary' as const;
    }
  };

  const getIconBgColor = () => {
    switch (config.color) {
      case 'green':
        return 'text-green-600 bg-green-50';
      case 'red':
        return 'text-red-600 bg-red-50';
      case 'blue':
        return 'text-blue-600 bg-blue-50';
      case 'yellow':
        return 'text-yellow-600 bg-yellow-50';
      default:
        return 'text-muted-foreground bg-muted';
    }
  };

  return (
    <Card className={cn("transition-all duration-200", getCardVariant())}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start space-x-3">
            <div className={cn("flex-shrink-0 p-2 rounded-lg", getIconBgColor())}>
              <StatusIcon type={config.icon} className="h-5 w-5" />
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2">
                <h3 className="text-sm font-medium">
                  Initial Report
                </h3>
                <Badge variant={getBadgeVariant()} className="text-xs">
                  {config.label}
                </Badge>
              </div>
              
              <p className="mt-1 text-sm text-muted-foreground">
                {config.description}
              </p>

              {/* Quality and Freshness Indicators */}
              {status && currentStatus !== 'not_started' && (
                <div className="mt-2 flex items-center space-x-3">
                  {status.dataCompletenessScore !== undefined && (
                    <div className="flex items-center space-x-1">
                      <span className="text-xs text-muted-foreground">Quality:</span>
                      <Badge variant="outline" className="text-xs">
                        {status.dataCompletenessScore}%
                      </Badge>
                    </div>
                  )}
                  
                  <div className="flex items-center space-x-1">
                    <span className="text-xs text-muted-foreground">Data:</span>
                    <Badge variant="outline" className="text-xs">
                      {freshnessInfo.label}
                    </Badge>
                  </div>
                </div>
              )}

              {/* Competitor Snapshots Summary */}
              {status?.competitorSnapshotsStatus && showProgress && (
                <div className="mt-2 text-xs text-muted-foreground">
                  Snapshots: {status.competitorSnapshotsStatus.captured} captured
                  {status.competitorSnapshotsStatus.failures && status.competitorSnapshotsStatus.failures.length > 0 && (
                    <span className="text-destructive ml-1">
                      ({status.competitorSnapshotsStatus.failures.length} failed)
                    </span>
                  )}
                </div>
              )}

              {/* Error Message */}
              {currentStatus === 'failed' && status?.error && (
                <Alert variant="destructive" className="mt-2">
                  <AlertDescription className="text-xs">
                    {status.error}
                  </AlertDescription>
                </Alert>
              )}
          </div>
        </div>

          {/* Action Buttons */}
          <div className="flex-shrink-0 ml-4">
            {currentStatus === 'completed' && status?.reportId && (
              <div className="space-y-1">
                {onViewReport ? (
                  <Button
                    onClick={() => onViewReport(status.reportId!)}
                    size="sm"
                    variant="default"
                  >
                    View Report
                  </Button>
                ) : (
                  <Button asChild size="sm" variant="default">
                    <Link href={`/reports/${status.reportId}`}>
                      View Report
                    </Link>
                  </Button>
                )}
                
                {status.generatedAt && (
                  <div className="text-xs text-muted-foreground">
                    {new Date(status.generatedAt).toLocaleDateString()}
                  </div>
                )}
              </div>
            )}

            {currentStatus === 'failed' && (
              <Button asChild size="sm" variant="outline">
                <Link href={`/projects/${projectId}/reports/new`}>
                  Retry
                </Link>
              </Button>
            )}

            {currentStatus === 'not_started' && (
              <Button asChild size="sm" variant="default">
                <Link href={`/projects/${projectId}/reports/new?initial=true`}>
                  Generate
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>

        {/* Minimal Progress Bar for Generating Status */}
        {currentStatus === 'generating' && showProgress && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <span>Progress</span>
              <span>In Progress...</span>
            </div>
            <Progress value={60} className="h-1.5 animate-pulse" />
          </div>
        )}
      </CardContent>
    </Card>
  );
} 