'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  RefreshCw, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Activity,
  Zap,
  Settings
} from 'lucide-react';

// Types for the dashboard
interface CronJobHealth {
  jobId: string;
  isActive: boolean;
  isScheduled: boolean;
  hasDbRecord: boolean;
  lastExecution?: Date;
  nextExecution?: Date;
  consecutiveFailures: number;
  healthStatus: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' | 'DISCONNECTED' | 'ZOMBIE';
  issues: string[];
  cronPattern?: string;
  projectId?: string;
}

interface HealthCheckResult {
  timestamp: Date;
  overallHealth: 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'DEGRADED';
  healthScore: number;
  totalJobs: number;
  healthyJobs: number;
  unhealthyJobs: number;
  stuckJobs: number;
  autoRestartAttempts: number;
  issues: HealthIssue[];
  recommendations: string[];
}

interface HealthIssue {
  jobId: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  type: 'DISCONNECTED' | 'STUCK' | 'FAILING' | 'OVERDUE' | 'ZOMBIE';
  description: string;
  actionTaken?: string;
  timestamp: Date;
}

interface MonitoringStatus {
  isMonitoring: boolean;
  config?: {
    checkInterval: number;
    maxConsecutiveFailures: number;
    autoRestartEnabled: boolean;
    healthThresholds: {
      warningThreshold: number;
      criticalThreshold: number;
    };
  };
  lastCheckTime?: Date;
  historyCount: number;
}

export default function CronJobStatusDashboard() {
  const [jobHealthData, setJobHealthData] = useState<CronJobHealth[]>([]);
  const [currentHealth, setCurrentHealth] = useState<HealthCheckResult | null>(null);
  const [monitoringStatus, setMonitoringStatus] = useState<MonitoringStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Fetch cron job status data
  const fetchJobStatus = async () => {
    try {
      setIsRefreshing(true);
      setError(null);

      // Fetch job health status
      const healthResponse = await fetch('/api/monitoring/cron-health');
      if (!healthResponse.ok) {
        throw new Error('Failed to fetch job health status');
      }
      const healthData = await healthResponse.json();
      setJobHealthData(healthData.jobs || []);

      // Fetch current health check result
      const currentHealthResponse = await fetch('/api/monitoring/current-health');
      if (currentHealthResponse.ok) {
        const currentHealthData = await currentHealthResponse.json();
        setCurrentHealth(currentHealthData);
      }

      // Fetch monitoring status
      const monitoringResponse = await fetch('/api/monitoring/status');
      if (monitoringResponse.ok) {
        const monitoringData = await monitoringResponse.json();
        setMonitoringStatus(monitoringData);
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setIsRefreshing(false);
      setIsLoading(false);
    }
  };

  // Force recovery of degraded jobs
  const handleForceRecovery = async () => {
    try {
      setIsRefreshing(true);
      const response = await fetch('/api/monitoring/force-recovery', {
        method: 'POST'
      });
      
      if (!response.ok) {
        throw new Error('Failed to trigger recovery');
      }

      const result = await response.json();
      
      // Refresh data after recovery attempt
      setTimeout(() => {
        fetchJobStatus();
      }, 2000);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Recovery failed');
    } finally {
      setIsRefreshing(false);
    }
  };

  // Start/stop monitoring
  const handleToggleMonitoring = async () => {
    try {
      const action = monitoringStatus?.isMonitoring ? 'stop' : 'start';
      const response = await fetch(`/api/monitoring/${action}`, {
        method: 'POST'
      });
      
      if (!response.ok) {
        throw new Error(`Failed to ${action} monitoring`);
      }

      // Refresh monitoring status
      fetchJobStatus();

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle monitoring');
    }
  };

  // Auto-refresh effect
  useEffect(() => {
    fetchJobStatus();

    let interval: NodeJS.Timeout | undefined;
    if (autoRefresh) {
      interval = setInterval(fetchJobStatus, 30000); // Refresh every 30 seconds
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh]);

  // Get health status color
  const getHealthColor = (status: string) => {
    switch (status) {
      case 'HEALTHY': return 'text-green-600 bg-green-50';
      case 'WARNING': return 'text-yellow-600 bg-yellow-50';
      case 'CRITICAL': return 'text-red-600 bg-red-50';
      case 'DEGRADED': return 'text-orange-600 bg-orange-50';
      case 'DISCONNECTED': return 'text-purple-600 bg-purple-50';
      case 'ZOMBIE': return 'text-gray-600 bg-gray-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  // Get health icon
  const getHealthIcon = (status: string) => {
    switch (status) {
      case 'HEALTHY': return <CheckCircle className="h-4 w-4" />;
      case 'WARNING': return <AlertTriangle className="h-4 w-4" />;
      case 'CRITICAL': return <XCircle className="h-4 w-4" />;
      case 'DEGRADED': return <Clock className="h-4 w-4" />;
      case 'DISCONNECTED': return <Activity className="h-4 w-4" />;
      case 'ZOMBIE': return <Zap className="h-4 w-4" />;
      default: return <Activity className="h-4 w-4" />;
    }
  };

  // Format date/time
  const formatDateTime = (date?: Date | string | null) => {
    if (!date) return 'Never';
    const d = new Date(date);
    return d.toLocaleString();
  };

  // Calculate time since
  const getTimeSince = (date?: Date | string | null) => {
    if (!date) return 'Never';
    const now = new Date();
    const then = new Date(date);
    const diffMs = now.getTime() - then.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return `${Math.floor(diffMins / 1440)}d ago`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading cron job status...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Cron Job Status Dashboard</h2>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            <Activity className="h-4 w-4 mr-1" />
            Auto-refresh: {autoRefresh ? 'On' : 'Off'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchJobStatus}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleToggleMonitoring}
          >
            <Settings className="h-4 w-4 mr-1" />
            {monitoringStatus?.isMonitoring ? 'Stop' : 'Start'} Monitoring
          </Button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Overall Health Status */}
      {currentHealth && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              {getHealthIcon(currentHealth.overallHealth)}
              <span className="ml-2">Overall System Health</span>
              <Badge className={`ml-auto ${getHealthColor(currentHealth.overallHealth)}`}>
                {currentHealth.overallHealth}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{currentHealth.healthScore}</div>
                <div className="text-sm text-gray-500">Health Score</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">{currentHealth.totalJobs}</div>
                <div className="text-sm text-gray-500">Total Jobs</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{currentHealth.healthyJobs}</div>
                <div className="text-sm text-gray-500">Healthy</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">{currentHealth.unhealthyJobs}</div>
                <div className="text-sm text-gray-500">Unhealthy</div>
              </div>
            </div>

            {/* Quick Actions */}
            {currentHealth.unhealthyJobs > 0 && (
              <div className="flex items-center justify-between bg-yellow-50 p-3 rounded-md">
                <span className="text-sm">
                  {currentHealth.unhealthyJobs} jobs need attention
                </span>
                <Button
                  size="sm"
                  onClick={handleForceRecovery}
                  disabled={isRefreshing}
                >
                  <Zap className="h-4 w-4 mr-1" />
                  Force Recovery
                </Button>
              </div>
            )}

            {/* Recommendations */}
            {currentHealth.recommendations.length > 0 && (
              <div className="mt-4">
                <h4 className="font-medium mb-2">Recommendations:</h4>
                <ul className="list-disc list-inside text-sm space-y-1">
                  {currentHealth.recommendations.map((rec, index) => (
                    <li key={index} className="text-gray-600">{rec}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Monitoring Status */}
      {monitoringStatus && (
        <Card>
          <CardHeader>
            <CardTitle>Monitoring Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <div className="flex items-center">
                  <Badge className={monitoringStatus.isMonitoring ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                    {monitoringStatus.isMonitoring ? 'Active' : 'Inactive'}
                  </Badge>
                  <span className="ml-2 text-sm">Monitoring</span>
                </div>
              </div>
              <div>
                <div className="text-sm">
                  <span className="font-medium">Last Check:</span>
                  <div className="text-gray-600">{formatDateTime(monitoringStatus.lastCheckTime)}</div>
                </div>
              </div>
              <div>
                <div className="text-sm">
                  <span className="font-medium">History:</span>
                  <div className="text-gray-600">{monitoringStatus.historyCount} checks</div>
                </div>
              </div>
            </div>

            {monitoringStatus.config && (
              <div className="mt-4 p-3 bg-gray-50 rounded-md">
                <h4 className="font-medium mb-2">Configuration:</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                  <div>
                    <span className="font-medium">Check Interval:</span>
                    <div>{Math.round(monitoringStatus.config.checkInterval / 1000)}s</div>
                  </div>
                  <div>
                    <span className="font-medium">Auto-restart:</span>
                    <div>{monitoringStatus.config.autoRestartEnabled ? 'Enabled' : 'Disabled'}</div>
                  </div>
                  <div>
                    <span className="font-medium">Warning Threshold:</span>
                    <div>{monitoringStatus.config.healthThresholds.warningThreshold}%</div>
                  </div>
                  <div>
                    <span className="font-medium">Critical Threshold:</span>
                    <div>{monitoringStatus.config.healthThresholds.criticalThreshold}%</div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Individual Job Status */}
      <Card>
        <CardHeader>
          <CardTitle>Individual Job Status</CardTitle>
        </CardHeader>
        <CardContent>
          {jobHealthData.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No cron jobs found
            </div>
          ) : (
            <div className="space-y-3">
              {jobHealthData.map((job) => (
                <div
                  key={job.jobId}
                  className="border rounded-lg p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center">
                      {getHealthIcon(job.healthStatus)}
                      <span className="ml-2 font-medium">{job.jobId}</span>
                      <Badge className={`ml-2 ${getHealthColor(job.healthStatus)}`}>
                        {job.healthStatus}
                      </Badge>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge variant={job.isActive ? 'default' : 'secondary'}>
                        {job.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                      <Badge variant={job.isScheduled ? 'default' : 'destructive'}>
                        {job.isScheduled ? 'Scheduled' : 'Not Scheduled'}
                      </Badge>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="font-medium">Last Execution:</span>
                      <div className="text-gray-600">
                        {formatDateTime(job.lastExecution)} 
                        {job.lastExecution && (
                          <span className="text-xs ml-1">({getTimeSince(job.lastExecution)})</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <span className="font-medium">Next Execution:</span>
                      <div className="text-gray-600">{formatDateTime(job.nextExecution)}</div>
                    </div>
                    <div>
                      <span className="font-medium">Failures:</span>
                      <div className="text-gray-600">
                        {job.consecutiveFailures} consecutive
                      </div>
                    </div>
                  </div>

                  {job.cronPattern && (
                    <div className="mt-2 text-sm">
                      <span className="font-medium">Pattern:</span>
                      <code className="ml-2 px-2 py-1 bg-gray-100 rounded text-xs">
                        {job.cronPattern}
                      </code>
                    </div>
                  )}

                  {job.issues.length > 0 && (
                    <div className="mt-3">
                      <span className="font-medium text-sm">Issues:</span>
                      <ul className="list-disc list-inside text-sm text-red-600 mt-1">
                        {job.issues.map((issue, index) => (
                          <li key={index}>{issue}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Issues */}
      {currentHealth && currentHealth.issues.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Issues</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {currentHealth.issues.map((issue, index) => (
                <div
                  key={index}
                  className="border-l-4 pl-4 py-2"
                  style={{
                    borderLeftColor: 
                      issue.severity === 'CRITICAL' ? '#dc2626' :
                      issue.severity === 'HIGH' ? '#ea580c' :
                      issue.severity === 'MEDIUM' ? '#d97706' : '#65a30d'
                  }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium">{issue.jobId}</span>
                    <Badge
                      className={
                        issue.severity === 'CRITICAL' ? 'bg-red-100 text-red-800' :
                        issue.severity === 'HIGH' ? 'bg-orange-100 text-orange-800' :
                        issue.severity === 'MEDIUM' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-green-100 text-green-800'
                      }
                    >
                      {issue.severity}
                    </Badge>
                  </div>
                  <div className="text-sm text-gray-600 mb-1">{issue.description}</div>
                  {issue.actionTaken && (
                    <div className="text-sm text-blue-600">Action: {issue.actionTaken}</div>
                  )}
                  <div className="text-xs text-gray-400 mt-1">
                    {formatDateTime(issue.timestamp)}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
} 