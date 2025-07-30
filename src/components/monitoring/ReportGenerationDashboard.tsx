/**
 * Task 5.2: Report Generation Monitoring Dashboard
 * React component for comprehensive report generation monitoring with metrics, alerts, and performance tracking
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
        : variant === 'destructive'
        ? 'bg-red-600 text-white hover:bg-red-700'
        : 'bg-blue-600 text-white hover:bg-blue-700'
    } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${className}`}
  >
    {children}
  </button>
);

const Alert = ({ children, className = '', variant = 'default' }: { children: React.ReactNode; className?: string; variant?: string }) => (
  <div className={`rounded-lg p-4 ${
    variant === 'destructive' 
      ? 'border border-red-200 bg-red-50' 
      : 'border border-yellow-200 bg-yellow-50'
  } ${className}`}>{children}</div>
);

const AlertDescription = ({ children }: { children: React.ReactNode }) => (
  <div className="text-sm text-yellow-800">{children}</div>
);

const Progress = ({ value, className = '' }: { value: number; className?: string }) => (
  <div className={`w-full bg-gray-200 rounded-full h-2 ${className}`}>
    <div 
      className={`h-2 rounded-full transition-all duration-300 ${
        value >= 95 ? 'bg-green-500' :
        value >= 85 ? 'bg-yellow-500' :
        value >= 70 ? 'bg-orange-500' :
        'bg-red-500'
      }`}
      style={{ width: `${Math.min(value, 100)}%` }}
    ></div>
  </div>
);

// Type definitions for report monitoring
interface ReportPerformanceMetrics {
  totalReports: number;
  successfulReports: number;
  failedReports: number;
  successRate: number;
  failureRate: number;
  averageProcessingTime: number;
  medianProcessingTime: number;
  p95ProcessingTime: number;
  p99ProcessingTime: number;
  queueDepth: number;
  averageQueueWaitTime: number;
  processingRate: number;
  correlationBreaks: number;
  endToEndTrackingRate: number;
  reportsLast1Hour: number;
  reportsLast24Hours: number;
  failuresLast1Hour: number;
  failuresLast24Hours: number;
  activeAlerts: number;
  recentAlerts: ReportAlert[];
  trends: {
    successRateTrend: 'improving' | 'stable' | 'degrading';
    performanceTrend: 'improving' | 'stable' | 'degrading';
    volumeTrend: 'increasing' | 'stable' | 'decreasing';
  };
}

interface ReportAlert {
  id: string;
  type: 'failure_rate' | 'processing_time' | 'queue_backlog' | 'correlation_break' | 'service_degradation';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  timestamp: Date;
  resolved: boolean;
  resolvedAt?: Date;
  metadata: {
    projectId?: string;
    reportType?: string;
    failureRate?: number;
    thresholdBreached?: string;
    recommendation?: string;
  };
}

interface ReportTypeBreakdown {
  reportType: string;
  count: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  averageProcessingTime: number;
}

interface MonitoringData {
  performanceMetrics: ReportPerformanceMetrics;
  reportTypeBreakdown: ReportTypeBreakdown[];
  timeWindow: string;
}

export default function ReportGenerationDashboard() {
  const [data, setData] = useState<MonitoringData | null>(null);
  const [alerts, setAlerts] = useState<ReportAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshInterval, setRefreshInterval] = useState(30000); // 30 seconds
  const [timeWindow, setTimeWindow] = useState<'1h' | '24h' | '7d'>('24h');
  const [selectedAlert, setSelectedAlert] = useState<ReportAlert | null>(null);
  const [resolvingAlerts, setResolvingAlerts] = useState<Set<string>>(new Set());

  // Fetch monitoring data
  const fetchData = async () => {
    try {
      const [metricsResponse, alertsResponse] = await Promise.all([
        fetch(`/api/monitoring/reports?action=metrics&timeWindow=${timeWindow}`),
        fetch('/api/monitoring/reports?action=alerts')
      ]);

      if (!metricsResponse.ok || !alertsResponse.ok) {
        throw new Error('Failed to fetch monitoring data');
      }

      const metricsResult = await metricsResponse.json();
      const alertsResult = await alertsResponse.json();

      if (metricsResult.success && alertsResult.success) {
        setData(metricsResult.data);
        setAlerts(alertsResult.data.activeAlerts);
        setError(null);
      } else {
        throw new Error(metricsResult.error || alertsResult.error || 'Failed to fetch data');
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
  }, [refreshInterval, timeWindow]);

  // Resolve alert
  const resolveAlert = async (alertId: string) => {
    setResolvingAlerts(prev => new Set(prev).add(alertId));
    
    try {
      const response = await fetch('/api/monitoring/reports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'resolve_alert',
          alertId
        }),
      });

      const result = await response.json();
      
      if (result.success && result.result.resolved) {
        setAlerts(prev => prev.filter(alert => alert.id !== alertId));
        setSelectedAlert(null);
      } else {
        throw new Error(result.error || 'Failed to resolve alert');
      }
    } catch (err) {
      alert(`Error resolving alert: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setResolvingAlerts(prev => {
        const next = new Set(prev);
        next.delete(alertId);
        return next;
      });
    }
  };

  // Get status color based on health
  const getHealthStatusColor = (metrics: ReportPerformanceMetrics) => {
    if (metrics.failureRate > 0.2) return 'text-red-600 bg-red-100';
    if (metrics.failureRate > 0.1) return 'text-yellow-600 bg-yellow-100';
    return 'text-green-600 bg-green-100';
  };

  // Get alert severity color
  const getAlertColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-100 text-red-800 border-red-200';
      case 'high': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low': return 'bg-blue-100 text-blue-800 border-blue-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  // Format time duration
  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  // Format percentage
  const formatPercent = (value: number) => `${(value * 100).toFixed(1)}%`;

  // Format time ago
  const timeAgo = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - new Date(date).getTime();
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
        <span className="ml-2">Loading report generation monitoring data...</span>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="m-4">
        <AlertDescription>
          Error loading monitoring data: {error}
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
        <AlertDescription>No monitoring data available</AlertDescription>
      </Alert>
    );
  }

  const metrics = data.performanceMetrics;

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Report Generation Monitoring</h1>
        <div className="flex items-center space-x-2">
          <select
            value={timeWindow}
            onChange={(e) => setTimeWindow(e.target.value as '1h' | '24h' | '7d')}
            className="border rounded px-2 py-1"
          >
            <option value="1h">Last 1 hour</option>
            <option value="24h">Last 24 hours</option>
            <option value="7d">Last 7 days</option>
          </select>
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
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>System Health Overview</span>
            <Badge className={getHealthStatusColor(metrics)}>
              {metrics.failureRate > 0.2 ? 'CRITICAL' : 
               metrics.failureRate > 0.1 ? 'WARNING' : 'HEALTHY'}
            </Badge>
          </CardTitle>
          <CardDescription>
            Report generation performance and health metrics
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{metrics.totalReports}</div>
              <div className="text-sm text-gray-600">Total Reports</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{formatPercent(metrics.successRate)}</div>
              <div className="text-sm text-gray-600">Success Rate</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">{formatPercent(metrics.failureRate)}</div>
              <div className="text-sm text-gray-600">Failure Rate</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">{formatDuration(metrics.averageProcessingTime)}</div>
              <div className="text-sm text-gray-600">Avg Processing Time</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Performance Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Success vs Failure Metrics</CardTitle>
            <CardDescription>Report generation outcomes over {timeWindow}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>Success Rate</span>
                <span>{formatPercent(metrics.successRate)}</span>
              </div>
              <Progress value={metrics.successRate * 100} />
            </div>
            
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-green-600 font-semibold">{metrics.successfulReports}</div>
                <div className="text-gray-600">Successful</div>
              </div>
              <div>
                <div className="text-red-600 font-semibold">{metrics.failedReports}</div>
                <div className="text-gray-600">Failed</div>
              </div>
            </div>

            <div className="pt-2 border-t">
              <div className="flex justify-between text-sm">
                <span>Last Hour:</span>
                <span>{metrics.reportsLast1Hour} reports</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Failures Last Hour:</span>
                <span className="text-red-600">{metrics.failuresLast1Hour}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Performance Metrics</CardTitle>
            <CardDescription>Processing time distribution and trends</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="font-semibold text-gray-700">Average:</div>
                <div className="text-lg">{formatDuration(metrics.averageProcessingTime)}</div>
              </div>
              <div>
                <div className="font-semibold text-gray-700">Median:</div>
                <div className="text-lg">{formatDuration(metrics.medianProcessingTime)}</div>
              </div>
              <div>
                <div className="font-semibold text-gray-700">95th percentile:</div>
                <div className="text-lg">{formatDuration(metrics.p95ProcessingTime)}</div>
              </div>
              <div>
                <div className="font-semibold text-gray-700">99th percentile:</div>
                <div className="text-lg">{formatDuration(metrics.p99ProcessingTime)}</div>
              </div>
            </div>

            <div className="pt-2 border-t">
              <div className="flex justify-between text-sm">
                <span>Processing Rate:</span>
                <span>{metrics.processingRate.toFixed(1)} reports/min</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Queue Depth:</span>
                <span className={metrics.queueDepth > 50 ? 'text-red-600' : 'text-green-600'}>
                  {metrics.queueDepth}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Report Type Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Report Type Breakdown</CardTitle>
          <CardDescription>Performance metrics by report type</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {data.reportTypeBreakdown.map((breakdown) => (
              <div key={breakdown.reportType} className="border rounded-lg p-4">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="font-medium capitalize">{breakdown.reportType} Reports</h4>
                  <Badge variant="outline">{breakdown.count} total</Badge>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <div className="text-green-600 font-semibold">{breakdown.successCount}</div>
                    <div className="text-gray-600">Successful</div>
                  </div>
                  <div>
                    <div className="text-red-600 font-semibold">{breakdown.failureCount}</div>
                    <div className="text-gray-600">Failed</div>
                  </div>
                  <div>
                    <div className="font-semibold">{formatPercent(breakdown.successRate)}</div>
                    <div className="text-gray-600">Success Rate</div>
                  </div>
                  <div>
                    <div className="font-semibold">{formatDuration(breakdown.averageProcessingTime)}</div>
                    <div className="text-gray-600">Avg Time</div>
                  </div>
                </div>

                <div className="mt-2">
                  <Progress value={breakdown.successRate * 100} />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Correlation Tracking */}
      <Card>
        <CardHeader>
          <CardTitle>End-to-End Correlation Tracking</CardTitle>
          <CardDescription>Correlation ID tracking and traceability metrics</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {formatPercent(metrics.endToEndTrackingRate)}
              </div>
              <div className="text-sm text-gray-600">Tracking Rate</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">{metrics.correlationBreaks}</div>
              <div className="text-sm text-gray-600">Correlation Breaks</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-medium">
                <Badge className={metrics.endToEndTrackingRate > 0.95 ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}>
                  {metrics.endToEndTrackingRate > 0.95 ? 'Excellent' : 
                   metrics.endToEndTrackingRate > 0.85 ? 'Good' : 'Poor'}
                </Badge>
              </div>
              <div className="text-sm text-gray-600">Tracking Quality</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Active Alerts */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Active Alerts</span>
            <Badge variant="outline">{alerts.length} alerts</Badge>
          </CardTitle>
          <CardDescription>
            System alerts and recommendations for report generation issues
          </CardDescription>
        </CardHeader>
        <CardContent>
          {alerts.length === 0 ? (
            <p className="text-center text-gray-500 py-4">
              No active alerts - system is healthy!
            </p>
          ) : (
            <div className="space-y-3">
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`border rounded-lg p-4 ${getAlertColor(alert.severity)}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center space-x-2">
                        <Badge className={getAlertColor(alert.severity)}>
                          {alert.severity.toUpperCase()}
                        </Badge>
                        <span className="font-medium">{alert.title}</span>
                      </div>
                      <p className="text-sm">{alert.message}</p>
                      <div className="text-xs text-gray-500">
                        {timeAgo(alert.timestamp)} • Type: {alert.type}
                      </div>
                      {alert.metadata.recommendation && (
                        <div className="text-xs bg-white bg-opacity-50 rounded p-2 mt-2">
                          <strong>Recommendation:</strong> {alert.metadata.recommendation}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center space-x-2 ml-4">
                      <Button
                        onClick={() => setSelectedAlert(alert)}
                        size="sm"
                        variant="outline"
                      >
                        Details
                      </Button>
                      <Button
                        onClick={() => resolveAlert(alert.id)}
                        disabled={resolvingAlerts.has(alert.id)}
                        size="sm"
                      >
                        {resolvingAlerts.has(alert.id) ? 'Resolving...' : 'Resolve'}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Alert Details Modal (simple version) */}
      {selectedAlert && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-96 overflow-auto">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-lg font-semibold">{selectedAlert.title}</h3>
                <Button
                  onClick={() => setSelectedAlert(null)}
                  variant="outline"
                  size="sm"
                >
                  Close
                </Button>
              </div>
              
              <div className="space-y-3">
                <div>
                  <strong>Type:</strong> {selectedAlert.type}
                </div>
                <div>
                  <strong>Severity:</strong> {selectedAlert.severity}
                </div>
                <div>
                  <strong>Message:</strong> {selectedAlert.message}
                </div>
                <div>
                  <strong>Timestamp:</strong> {new Date(selectedAlert.timestamp).toLocaleString()}
                </div>
                
                {selectedAlert.metadata.recommendation && (
                  <div>
                    <strong>Recommendation:</strong>
                    <div className="bg-blue-50 p-3 rounded mt-1">
                      {selectedAlert.metadata.recommendation}
                    </div>
                  </div>
                )}

                {selectedAlert.metadata.thresholdBreached && (
                  <div>
                    <strong>Threshold Breached:</strong> {selectedAlert.metadata.thresholdBreached}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 