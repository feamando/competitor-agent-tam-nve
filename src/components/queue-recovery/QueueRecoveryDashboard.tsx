/**
 * Task 4.2: Queue Recovery Monitoring Dashboard
 * React component for monitoring report generation queue recovery system
 */

'use client';

import React, { useState, useEffect } from 'react';

// Simple UI components for demonstration
const Card = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`bg-white border rounded-lg shadow-sm ${className}`}>{children}</div>
);

const CardHeader = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`p-4 pb-2 ${className}`}>{children}</div>
);

const CardTitle = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <h3 className={`font-semibold ${className}`}>{children}</h3>
);

const CardDescription = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <p className={`text-sm text-gray-600 ${className}`}>{children}</p>
);

const CardContent = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`p-4 pt-0 ${className}`}>{children}</div>
);

const Badge = ({ children, className = '', variant = 'default' }: { children: React.ReactNode; className?: string; variant?: string }) => (
  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
    variant === 'outline' ? 'border border-gray-300 text-gray-700' : 'bg-gray-100 text-gray-800'
  } ${className}`}>
    {children}
  </span>
);

const Button = ({ 
  children, 
  onClick, 
  disabled = false, 
  size = 'default', 
  variant = 'default',
  className = '' 
}: { 
  children: React.ReactNode; 
  onClick?: () => void; 
  disabled?: boolean; 
  size?: string; 
  variant?: string;
  className?: string;
}) => (
  <button 
    onClick={onClick} 
    disabled={disabled}
    className={`px-4 py-2 rounded font-medium ${
      size === 'sm' ? 'px-2 py-1 text-sm' : ''
    } ${
      variant === 'outline' 
        ? 'border border-gray-300 text-gray-700 hover:bg-gray-50' 
        : 'bg-blue-600 text-white hover:bg-blue-700'
    } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${className}`}
  >
    {children}
  </button>
);

const Alert = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`border border-yellow-200 bg-yellow-50 rounded-lg p-4 ${className}`}>{children}</div>
);

const AlertDescription = ({ children }: { children: React.ReactNode }) => (
  <div className="text-sm text-yellow-800">{children}</div>
);

interface QueueHealth {
  status: 'healthy' | 'degraded' | 'critical' | 'recovering';
  activeJobs: number;
  waitingJobs: number;
  failedJobs: number;
  deadLetterJobs: number;
  recoveryJobs: number;
  processingRate: number;
  errorRate: number;
  recommendations: string[];
}

interface RecoveryStats {
  totalJobs: number;
  succeededJobs: number;
  failedJobs: number;
  recoveredJobs: number;
  deadLetterJobs: number;  
  manualInterventionRequired: number;
  averageRecoveryTime: number;
  lastRecoveryAt?: string;
}

interface FailedJob {
  id: string;
  taskId: string;
  projectId: string;
  jobType: 'comparative' | 'intelligent' | 'initial';
  failureReason: string;
  failureCount: number;
  lastFailedAt: string;
  recoveryStrategy: 'retry' | 'manual' | 'fallback' | 'dead_letter';
  isRecoverable: boolean;
  isPermanentFailure: boolean;
  metadata: {
    priority: 'high' | 'normal' | 'low';
    errorCategory: string;
  };
}

interface QueueRecoveryData {
  queueHealth: QueueHealth;
  recoveryStats: RecoveryStats;
  metrics: {
    successRate: number;
    recoveryRate: number;
    averageRecoveryTimeMinutes: number;
    jobsRequiringAttention: number;
  };
  recentFailedJobs: FailedJob[];
  systemRecommendations: string[];
}

export default function QueueRecoveryDashboard() {
  const [data, setData] = useState<QueueRecoveryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshInterval, setRefreshInterval] = useState(30000); // 30 seconds
  const [selectedJobs, setSelectedJobs] = useState<string[]>([]);
  const [triggeringManual, setTriggeringManual] = useState(false);

  // Fetch queue recovery data
  const fetchData = async () => {
    try {
      const response = await fetch('/api/queue-recovery/status');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();
      if (result.success) {
        setData(result.data);
        setError(null);
      } else {
        throw new Error(result.error || 'Failed to fetch queue recovery data');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  // Auto-refresh data
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, refreshInterval);
    return () => clearInterval(interval);
  }, [refreshInterval]);

  // Handle manual recovery trigger
  const triggerManualRecovery = async (jobIds: string[], priority: 'high' | 'normal' | 'low' = 'normal') => {
    setTriggeringManual(true);
    
    try {
      const response = await fetch('/api/queue-recovery/manual-trigger', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          failedJobIds: jobIds,
          priority,
          reason: 'Manual trigger from dashboard'
        }),
      });

      const result = await response.json();
      
      if (result.success) {
        alert(`Successfully queued ${result.data.queued} jobs for recovery`);
        setSelectedJobs([]);
        fetchData(); // Refresh data
      } else {
        throw new Error(result.error || 'Failed to trigger manual recovery');
      }
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setTriggeringManual(false);
    }
  };

  // Get status badge color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'bg-green-500';
      case 'degraded': return 'bg-yellow-500';
      case 'critical': return 'bg-red-500';
      case 'recovering': return 'bg-blue-500';
      default: return 'bg-gray-500';
    }
  };

  // Get priority badge color
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-800';
      case 'normal': return 'bg-blue-100 text-blue-800';
      case 'low': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // Format time ago
  const timeAgo = (dateString: string) => {
    const now = new Date();
    const date = new Date(dateString);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2">Loading queue recovery data...</span>
      </div>
    );
  }

  if (error) {
    return (
      <Alert className="m-4">
        <AlertDescription>
          Error loading queue recovery data: {error}
          <Button onClick={fetchData} className="ml-2" size="sm">
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (!data) {
    return (
      <Alert className="m-4">
        <AlertDescription>No queue recovery data available</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Queue Recovery Dashboard</h1>
        <div className="flex items-center space-x-2">
          <select
            value={refreshInterval}
            onChange={(e) => setRefreshInterval(Number(e.target.value))}
            className="border rounded px-2 py-1"
          >
            <option value={15000}>15s</option>
            <option value={30000}>30s</option>
            <option value={60000}>1m</option>
            <option value={300000}>5m</option>
          </select>
          <Button onClick={fetchData} size="sm">
            Refresh
          </Button>
        </div>
      </div>

      {/* System Health Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Queue Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-2">
              <div className={`w-3 h-3 rounded-full ${getStatusColor(data.queueHealth.status)}`}></div>
              <span className="font-semibold capitalize">{data.queueHealth.status}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {data.metrics.successRate.toFixed(1)}%
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Recovery Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {data.metrics.recoveryRate.toFixed(1)}%
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Needs Attention</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {data.metrics.jobsRequiringAttention}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Queue Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Queue Health</CardTitle>
            <CardDescription>Current queue processing status</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between">
              <span>Active Jobs:</span>
              <span className="font-semibold">{data.queueHealth.activeJobs}</span>
            </div>
            <div className="flex justify-between">
              <span>Waiting Jobs:</span>
              <span className="font-semibold">{data.queueHealth.waitingJobs}</span>
            </div>
            <div className="flex justify-between">
              <span>Failed Jobs:</span>
              <span className="font-semibold text-red-600">{data.queueHealth.failedJobs}</span>
            </div>
            <div className="flex justify-between">
              <span>Dead Letter Jobs:</span>
              <span className="font-semibold text-orange-600">{data.queueHealth.deadLetterJobs}</span>
            </div>
            <div className="flex justify-between">
              <span>Processing Rate:</span>
              <span className="font-semibold">{data.queueHealth.processingRate}/min</span>
            </div>
            <div className="flex justify-between">
              <span>Error Rate:</span>
              <span className="font-semibold">{data.queueHealth.errorRate.toFixed(1)}%</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recovery Statistics</CardTitle>
            <CardDescription>Historical recovery performance</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between">
              <span>Total Jobs:</span>
              <span className="font-semibold">{data.recoveryStats.totalJobs}</span>
            </div>
            <div className="flex justify-between">
              <span>Succeeded:</span>
              <span className="font-semibold text-green-600">{data.recoveryStats.succeededJobs}</span>
            </div>
            <div className="flex justify-between">
              <span>Recovered:</span>
              <span className="font-semibold text-blue-600">{data.recoveryStats.recoveredJobs}</span>
            </div>
            <div className="flex justify-between">
              <span>Manual Intervention:</span>
              <span className="font-semibold text-yellow-600">{data.recoveryStats.manualInterventionRequired}</span>
            </div>
            <div className="flex justify-between">
              <span>Avg Recovery Time:</span>
              <span className="font-semibold">{data.metrics.averageRecoveryTimeMinutes}m</span>
            </div>
            {data.recoveryStats.lastRecoveryAt && (
              <div className="flex justify-between">
                <span>Last Recovery:</span>
                <span className="font-semibold">{timeAgo(data.recoveryStats.lastRecoveryAt)}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* System Recommendations */}
      {data.systemRecommendations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>System Recommendations</CardTitle>
            <CardDescription>Automated system health recommendations</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {data.systemRecommendations.map((recommendation, index) => (
                <li key={index} className="flex items-start space-x-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                  <span>{recommendation}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Failed Jobs List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Recent Failed Jobs</span>
            {selectedJobs.length > 0 && (
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-600">
                  {selectedJobs.length} selected
                </span>
                <Button
                  onClick={() => triggerManualRecovery(selectedJobs, 'high')}
                  disabled={triggeringManual}
                  size="sm"
                >
                  {triggeringManual ? 'Triggering...' : 'Trigger Recovery'}
                </Button>
                <Button
                  onClick={() => setSelectedJobs([])}
                  variant="outline"
                  size="sm"
                >
                  Clear
                </Button>
              </div>
            )}
          </CardTitle>
          <CardDescription>
            Jobs that have failed and are candidates for recovery
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.recentFailedJobs.length === 0 ? (
            <p className="text-center text-gray-500 py-4">
              No recent failed jobs - system is healthy!
            </p>
          ) : (
            <div className="space-y-3">
              {data.recentFailedJobs.map((job) => (
                <div
                  key={job.id}
                  className={`border rounded-lg p-4 ${
                    selectedJobs.includes(job.id) ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-3">
                      <input
                        type="checkbox"
                        checked={selectedJobs.includes(job.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedJobs([...selectedJobs, job.id]);
                          } else {
                            setSelectedJobs(selectedJobs.filter(id => id !== job.id));
                          }
                        }}
                        className="mt-1"
                      />
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="font-medium">Task: {job.taskId}</span>
                          <Badge variant="outline">{job.jobType}</Badge>
                          <Badge className={getPriorityColor(job.metadata.priority)}>
                            {job.metadata.priority}
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-600">
                          Project: {job.projectId}
                        </p>
                        <p className="text-sm text-red-600">
                          {job.failureReason}
                        </p>
                        <div className="flex items-center space-x-4 text-xs text-gray-500">
                          <span>Failures: {job.failureCount}</span>
                          <span>Strategy: {job.recoveryStrategy}</span>
                          <span>Error: {job.metadata.errorCategory}</span>
                          <span>Last Failed: {timeAgo(job.lastFailedAt)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {job.isRecoverable && (
                        <Button
                          onClick={() => triggerManualRecovery([job.id])}
                          disabled={triggeringManual}
                          size="sm"
                        >
                          Retry
                        </Button>
                      )}
                      <div className={`w-3 h-3 rounded-full ${
                        job.isPermanentFailure ? 'bg-red-500' : 
                        job.isRecoverable ? 'bg-green-500' : 'bg-yellow-500'
                      }`}></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
} 