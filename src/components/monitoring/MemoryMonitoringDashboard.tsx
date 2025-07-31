/**
 * Task 5.1: Comprehensive Memory Monitoring Dashboard
 * React component for real-time memory monitoring with alerts and controls
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
        value >= 95 ? 'bg-red-500' :
        value >= 90 ? 'bg-orange-500' :
        value >= 85 ? 'bg-yellow-500' :
        'bg-green-500'
      }`}
      style={{ width: `${Math.min(value, 100)}%` }}
    ></div>
  </div>
);

// Type definitions
interface MemorySnapshot {
  timestamp: Date;
  rss: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  arrayBuffers: number;
  systemUsed: number;
  systemTotal: number;
  systemPercentage: number;
  heapPercentage: number;
  gcCount: number;
  gcDuration: number;
  processUptime: number;
}

interface MemoryAlert {
  id: string;
  level: 'normal' | 'warning' | 'high' | 'critical';
  timestamp: Date;
  message: string;
  resolved: boolean;
  resolvedAt?: Date;
  correlationId: string;
}

interface MemoryTrend {
  timeWindow: '1m' | '5m' | '15m' | '1h' | '6h' | '24h';
  averageUsage: number;
  peakUsage: number;
  minUsage: number;
  gcFrequency: number;
  alertCount: number;
  trendDirection: 'stable' | 'increasing' | 'decreasing' | 'volatile';
}

interface MemoryMetrics {
  currentSnapshot: MemorySnapshot;
  trends: Record<string, MemoryTrend>;
  recentAlerts: MemoryAlert[];
  recommendations: string[];
  healthStatus: 'healthy' | 'warning' | 'critical' | 'emergency';
  nextCleanupAt: Date;
  autoCleanupEnabled: boolean;
}

export default function MemoryMonitoringDashboard() {
  const [metrics, setMetrics] = useState<MemoryMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshInterval, setRefreshInterval] = useState(5000); // 5 seconds
  const [selectedTimeWindow, setSelectedTimeWindow] = useState<'1m' | '5m' | '15m' | '1h' | '6h' | '24h'>('1h');
  const [executingAction, setExecutingAction] = useState<string | null>(null);

  // Fetch memory metrics
  const fetchMetrics = async () => {
    try {
      const response = await fetch('/api/monitoring/memory?action=metrics');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();
      if (result.success) {
        setMetrics(result.data);
        setError(null);
      } else {
        throw new Error(result.error || 'Failed to fetch memory metrics');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  // Auto-refresh metrics
  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, refreshInterval);
    return () => clearInterval(interval);
  }, [refreshInterval]);

  // Execute memory action
  const executeAction = async (action: string, params: any = {}) => {
    setExecutingAction(action);
    
    try {
      const response = await fetch('/api/monitoring/memory', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action, ...params }),
      });

      const result = await response.json();
      
      if (result.success) {
        alert(`${result.message}`);
        fetchMetrics(); // Refresh data
      } else {
        throw new Error(result.error || `Failed to execute ${action}`);
      }
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setExecutingAction(null);
    }
  };

  // Resolve memory alert
  const resolveAlert = async (alertId: string) => {
    await executeAction('resolve_alert', { alertId });
  };

  // Get status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'text-green-600 bg-green-100';
      case 'warning': return 'text-yellow-600 bg-yellow-100';
      case 'critical': return 'text-red-600 bg-red-100';
      case 'emergency': return 'text-red-800 bg-red-200';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  // Get alert level color
  const getAlertColor = (level: string) => {
    switch (level) {
      case 'normal': return 'bg-green-100 text-green-800';
      case 'warning': return 'bg-yellow-100 text-yellow-800';
      case 'high': return 'bg-orange-100 text-orange-800';
      case 'critical': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // Format bytes to MB
  const formatMB = (bytes: number) => `${bytes.toFixed(1)}MB`;

  // Format percentage
  const formatPercent = (value: number) => `${value.toFixed(1)}%`;

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
        <span className="ml-2">Loading memory monitoring data...</span>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="m-4">
        <AlertDescription>
          Error loading memory monitoring data: {error}
          <Button onClick={fetchMetrics} className="ml-2" size="sm">
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (!metrics) {
    return (
      <Alert className="m-4">
        <AlertDescription>No memory monitoring data available</AlertDescription>
      </Alert>
    );
  }

  const currentSnapshot = metrics.currentSnapshot;
  const selectedTrend = metrics.trends[selectedTimeWindow];

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Memory Monitoring Dashboard</h1>
        <div className="flex items-center space-x-2">
          <select
            value={refreshInterval}
            onChange={(e) => setRefreshInterval(Number(e.target.value))}
            className="border rounded px-2 py-1"
          >
            <option value={2000}>2s</option>
            <option value={5000}>5s</option>
            <option value={10000}>10s</option>
            <option value={30000}>30s</option>
          </select>
          <Button onClick={fetchMetrics} size="sm">
            Refresh
          </Button>
        </div>
      </div>

      {/* System Health Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>System Health Status</span>
            <Badge className={getStatusColor(metrics.healthStatus)}>
              {metrics.healthStatus.toUpperCase()}
            </Badge>
          </CardTitle>
          <CardDescription>
            Real-time memory usage monitoring with automatic thresholds
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>System Memory</span>
                <span>{formatPercent(currentSnapshot.systemPercentage * 100)}</span>
              </div>
              <Progress value={currentSnapshot.systemPercentage * 100} />
              <div className="text-xs text-gray-500">
                {formatMB(currentSnapshot.systemUsed)} / {formatMB(currentSnapshot.systemTotal)}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Heap Memory</span>
                <span>{formatPercent(currentSnapshot.heapPercentage)}</span>
              </div>
              <Progress value={currentSnapshot.heapPercentage} />
              <div className="text-xs text-gray-500">
                {formatMB(currentSnapshot.heapUsed)} / {formatMB(currentSnapshot.heapTotal)}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>RSS Memory</span>
                <span>{formatMB(currentSnapshot.rss)}</span>
              </div>
              <div className="text-xs text-gray-500">Resident Set Size</div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>GC Stats</span>
                <span>{currentSnapshot.gcCount} calls</span>
              </div>
              <div className="text-xs text-gray-500">
                {(currentSnapshot.gcDuration / 1000).toFixed(2)}s total
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Memory Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <Button
              onClick={() => executeAction('force_gc')}
              disabled={executingAction === 'force_gc'}
              className="w-full"
            >
              {executingAction === 'force_gc' ? 'Running GC...' : 'Force Garbage Collection'}
            </Button>
            <p className="text-xs text-gray-500 mt-2">
              Manually trigger garbage collection
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <Button
              onClick={() => executeAction('force_cleanup')}
              disabled={executingAction === 'force_cleanup'}
              className="w-full"
            >
              {executingAction === 'force_cleanup' ? 'Cleaning...' : 'Force Memory Cleanup'}
            </Button>
            <p className="text-xs text-gray-500 mt-2">
              Clear caches and free memory
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <Button
              onClick={() => executeAction('get_recommendations')}
              disabled={executingAction === 'get_recommendations'}
              variant="outline"
              className="w-full"
            >
              Get Recommendations
            </Button>
            <p className="text-xs text-gray-500 mt-2">
              Analyze current memory usage
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-sm">
              <div className="flex justify-between">
                <span>Auto Cleanup:</span>
                <span className={metrics.autoCleanupEnabled ? 'text-green-600' : 'text-red-600'}>
                  {metrics.autoCleanupEnabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Next: {timeAgo(metrics.nextCleanupAt)}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Memory Trends */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Memory Usage Trends</span>
            <select
              value={selectedTimeWindow}
              onChange={(e) => setSelectedTimeWindow(e.target.value as any)}
              className="border rounded px-2 py-1 text-sm"
            >
              <option value="1m">Last 1 minute</option>
              <option value="5m">Last 5 minutes</option>
              <option value="15m">Last 15 minutes</option>
              <option value="1h">Last 1 hour</option>
              <option value="6h">Last 6 hours</option>
              <option value="24h">Last 24 hours</option>
            </select>
          </CardTitle>
          <CardDescription>
            Memory usage patterns and trend analysis
          </CardDescription>
        </CardHeader>
        <CardContent>
          {selectedTrend ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-sm font-medium">Average Usage</div>
                <div className="text-2xl font-bold text-blue-600">
                  {formatPercent(selectedTrend.averageUsage)}
                </div>
              </div>
              <div>
                <div className="text-sm font-medium">Peak Usage</div>
                <div className="text-2xl font-bold text-red-600">
                  {formatPercent(selectedTrend.peakUsage)}
                </div>
              </div>
              <div>
                <div className="text-sm font-medium">Trend Direction</div>
                <div className={`text-lg font-medium ${
                  selectedTrend.trendDirection === 'increasing' ? 'text-red-600' :
                  selectedTrend.trendDirection === 'decreasing' ? 'text-green-600' :
                  selectedTrend.trendDirection === 'volatile' ? 'text-yellow-600' :
                  'text-blue-600'
                }`}>
                  {selectedTrend.trendDirection.toUpperCase()}
                </div>
              </div>
              <div>
                <div className="text-sm font-medium">GC Frequency</div>
                <div className="text-lg font-medium">
                  {selectedTrend.gcFrequency.toFixed(1)}/min
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center text-gray-500 py-4">
              No trend data available for selected time window
            </div>
          )}
        </CardContent>
      </Card>

      {/* System Recommendations */}
      {metrics.recommendations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>System Recommendations</CardTitle>
            <CardDescription>
              Intelligent recommendations based on current memory usage patterns
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {metrics.recommendations.map((recommendation, index) => (
                <li key={index} className="flex items-start space-x-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                  <span>{recommendation}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Recent Memory Alerts */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Memory Alerts</CardTitle>
          <CardDescription>
            Memory threshold alerts and system warnings
          </CardDescription>
        </CardHeader>
        <CardContent>
          {metrics.recentAlerts.length === 0 ? (
            <p className="text-center text-gray-500 py-4">
              No recent memory alerts - system is healthy!
            </p>
          ) : (
            <div className="space-y-3">
              {metrics.recentAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`border rounded-lg p-4 ${
                    alert.resolved ? 'border-gray-200 bg-gray-50' : 'border-yellow-200 bg-yellow-50'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <Badge className={getAlertColor(alert.level)}>
                          {alert.level.toUpperCase()}
                        </Badge>
                        {alert.resolved && (
                          <Badge variant="outline" className="bg-green-100 text-green-800">
                            RESOLVED
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm font-medium">{alert.message}</p>
                      <div className="text-xs text-gray-500">
                        {timeAgo(alert.timestamp)}
                        {alert.resolved && alert.resolvedAt && 
                          ` • Resolved ${timeAgo(alert.resolvedAt)}`
                        }
                      </div>
                    </div>
                    {!alert.resolved && (
                      <Button
                        onClick={() => resolveAlert(alert.id)}
                        size="sm"
                        variant="outline"
                      >
                        Resolve
                      </Button>
                    )}
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