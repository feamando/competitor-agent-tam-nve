'use client';

import React, { useState, useEffect } from 'react';
// Simple Card components
interface CardProps {
  children: React.ReactNode;
  className?: string;
}

const Card: React.FC<CardProps> = ({ children, className = '' }) => (
  <div className={`bg-white rounded-lg border shadow ${className}`}>
    {children}
  </div>
);

const CardHeader: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="px-6 py-4 border-b">
    {children}
  </div>
);

const CardTitle: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <h3 className={`text-lg font-semibold text-gray-900 ${className}`}>
    {children}
  </h3>
);

const CardContent: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="px-6 py-4">
    {children}
  </div>
);

/**
 * Zombie Report Detection Dashboard Component
 * Task 5.5: Implement zombie report detection in monitoring dashboard
 */

interface ZombieReport {
  reportId: string;
  projectId: string;
  projectName: string;
  reportName: string;
  createdAt: string;
  status: string;
}

interface ZombieReportStats {
  totalZombies: number;
  reports: ZombieReport[];
  lastScanTime: string;
  alertLevel: 'NONE' | 'WARNING' | 'CRITICAL';
}

interface PipelineHealthMetrics {
  overallHealth: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  components: {
    database: 'HEALTHY' | 'WARNING' | 'CRITICAL';
    zombieReports: 'HEALTHY' | 'WARNING' | 'CRITICAL';
    reportGeneration: 'HEALTHY' | 'WARNING' | 'CRITICAL';
    dataCollection: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  };
  metrics: {
    totalComponents: number;
    healthyComponents: number;
    warningComponents: number;
    criticalComponents: number;
    healthScore: number;
  };
  lastCheckTime: string;
}

const ZombieReportDashboard: React.FC = () => {
  const [zombieStats, setZombieStats] = useState<ZombieReportStats>({
    totalZombies: 0,
    reports: [],
    lastScanTime: '',
    alertLevel: 'NONE'
  });
  
  const [pipelineHealth, setPipelineHealth] = useState<PipelineHealthMetrics>({
    overallHealth: 'HEALTHY',
    components: {
      database: 'HEALTHY',
      zombieReports: 'HEALTHY',
      reportGeneration: 'HEALTHY',
      dataCollection: 'HEALTHY'
    },
    metrics: {
      totalComponents: 4,
      healthyComponents: 4,
      warningComponents: 0,
      criticalComponents: 0,
      healthScore: 1.0
    },
    lastCheckTime: ''
  });
  
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  // Fetch zombie report data
  const fetchZombieReports = async () => {
    try {
      const response = await fetch('/api/monitoring/zombie-reports');
      if (response.ok) {
        const data = await response.json();
        setZombieStats({
          totalZombies: data.zombiesFound || 0,
          reports: data.reports || [],
          lastScanTime: data.scannedAt || new Date().toISOString(),
          alertLevel: data.zombiesFound > 5 ? 'CRITICAL' : 
                     data.zombiesFound > 0 ? 'WARNING' : 'NONE'
        });
      }
    } catch (error) {
      console.error('Failed to fetch zombie reports:', error);
    }
  };

  // Fetch pipeline health data
  const fetchPipelineHealth = async () => {
    try {
      const response = await fetch('/api/monitoring/pipeline-health');
      if (response.ok) {
        const data = await response.json();
        setPipelineHealth({
          overallHealth: data.overallHealth || 'HEALTHY',
          components: data.componentHealths ? {
            database: data.componentHealths.database?.status || 'HEALTHY',
            zombieReports: data.componentHealths.zombieReports?.status || 'HEALTHY',
            reportGeneration: data.componentHealths.reportGeneration?.status || 'HEALTHY',
            dataCollection: data.componentHealths.dataCollection?.status || 'HEALTHY'
          } : {
            database: 'HEALTHY',
            zombieReports: 'HEALTHY',
            reportGeneration: 'HEALTHY',
            dataCollection: 'HEALTHY'
          },
          metrics: data.metrics || {
            totalComponents: 4,
            healthyComponents: 4,
            warningComponents: 0,
            criticalComponents: 0,
            healthScore: 1.0
          },
          lastCheckTime: data.timestamp || new Date().toISOString()
        });
      }
    } catch (error) {
      console.error('Failed to fetch pipeline health:', error);
    }
  };

  // Refresh all data
  const refreshData = async () => {
    setIsLoading(true);
    try {
      await Promise.all([
        fetchZombieReports(),
        fetchPipelineHealth()
      ]);
      setLastRefresh(new Date());
    } finally {
      setIsLoading(false);
    }
  };

  // Initial data load and auto-refresh setup
  useEffect(() => {
    refreshData();
    
    // Auto-refresh every 2 minutes
    const interval = setInterval(refreshData, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Helper functions
  const getHealthColor = (status: string) => {
    switch (status) {
      case 'HEALTHY': return 'text-green-600 bg-green-100';
      case 'WARNING': return 'text-yellow-600 bg-yellow-100';
      case 'CRITICAL': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getAlertColor = (level: string) => {
    switch (level) {
      case 'CRITICAL': return 'border-red-500 bg-red-50';
      case 'WARNING': return 'border-yellow-500 bg-yellow-50';
      default: return 'border-green-500 bg-green-50';
    }
  };

  const formatDateTime = (dateString: string) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleString();
  };

  const triggerManualScan = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/monitoring/trigger-scan', {
        method: 'POST'
      });
      if (response.ok) {
        // Refresh data after scan
        setTimeout(refreshData, 2000);
      }
    } catch (error) {
      console.error('Failed to trigger manual scan:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Report Pipeline Monitoring</h1>
          <p className="text-gray-600 mt-1">
            Monitor report generation health and detect zombie reports
          </p>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={refreshData}
            disabled={isLoading}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {isLoading ? 'Refreshing...' : 'Refresh'}
          </button>
          <button
            onClick={triggerManualScan}
            disabled={isLoading}
            className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50"
          >
            Manual Scan
          </button>
        </div>
      </div>

      {/* Last Refresh Info */}
      <div className="text-sm text-gray-500">
        Last refreshed: {lastRefresh.toLocaleString()}
      </div>

      {/* Zombie Reports Alert Card */}
      <Card className={`border-2 ${getAlertColor(zombieStats.alertLevel)}`}>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center">
              <span className="mr-2">🧟</span>
              Zombie Report Detection
            </span>
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${
              zombieStats.alertLevel === 'CRITICAL' ? 'bg-red-100 text-red-800' :
              zombieStats.alertLevel === 'WARNING' ? 'bg-yellow-100 text-yellow-800' :
              'bg-green-100 text-green-800'
            }`}>
              {zombieStats.alertLevel === 'NONE' ? 'HEALTHY' : zombieStats.alertLevel}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-gray-900">
                {zombieStats.totalZombies}
              </div>
              <div className="text-sm text-gray-600">Zombie Reports Found</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold text-gray-700">
                {formatDateTime(zombieStats.lastScanTime)}
              </div>
              <div className="text-sm text-gray-600">Last Scan Time</div>
            </div>
            <div className="text-center">
              <div className={`text-lg font-semibold ${
                zombieStats.totalZombies === 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {zombieStats.totalZombies === 0 ? '✓ Clean' : '⚠ Issues Detected'}
              </div>
              <div className="text-sm text-gray-600">System Status</div>
            </div>
          </div>

          {/* Zombie Reports List */}
          {zombieStats.reports.length > 0 && (
            <div className="mt-4">
              <h4 className="text-lg font-semibold mb-3 text-red-800">
                Detected Zombie Reports ({zombieStats.reports.length})
              </h4>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {zombieStats.reports.map((report) => (
                  <div key={report.reportId} className="bg-white border border-red-200 rounded-lg p-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium text-gray-900">
                          {report.reportName}
                        </div>
                        <div className="text-sm text-gray-600">
                          Project: {report.projectName}
                        </div>
                        <div className="text-xs text-gray-500">
                          ID: {report.reportId}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium text-red-600">
                          Status: {report.status}
                        </div>
                        <div className="text-xs text-gray-500">
                          Created: {formatDateTime(report.createdAt)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {zombieStats.totalZombies === 0 && (
            <div className="text-center py-4 text-green-600">
              <div className="text-2xl mb-2">✅</div>
              <div className="font-medium">No zombie reports detected</div>
              <div className="text-sm text-gray-600">All reports have proper content versions</div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pipeline Health Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <span className="mr-2">🏥</span>
            Pipeline Health Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="text-center">
              <div className={`text-2xl font-bold ${
                pipelineHealth.overallHealth === 'HEALTHY' ? 'text-green-600' :
                pipelineHealth.overallHealth === 'WARNING' ? 'text-yellow-600' :
                'text-red-600'
              }`}>
                {pipelineHealth.overallHealth}
              </div>
              <div className="text-sm text-gray-600">Overall Health</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900">
                {(pipelineHealth.metrics.healthScore * 100).toFixed(0)}%
              </div>
              <div className="text-sm text-gray-600">Health Score</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {pipelineHealth.metrics.healthyComponents}
              </div>
              <div className="text-sm text-gray-600">Healthy Components</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">
                {pipelineHealth.metrics.criticalComponents}
              </div>
              <div className="text-sm text-gray-600">Critical Issues</div>
            </div>
          </div>

          {/* Component Status Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {Object.entries(pipelineHealth.components).map(([component, status]) => (
              <div key={component} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-medium text-gray-900 capitalize">
                    {component.replace(/([A-Z])/g, ' $1').trim()}
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getHealthColor(status)}`}>
                    {status}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${
                      status === 'HEALTHY' ? 'bg-green-500' :
                      status === 'WARNING' ? 'bg-yellow-500' :
                      'bg-red-500'
                    }`}
                    style={{
                      width: status === 'HEALTHY' ? '100%' :
                             status === 'WARNING' ? '60%' : '20%'
                    }}
                  ></div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 text-sm text-gray-600">
            Last health check: {formatDateTime(pipelineHealth.lastCheckTime)}
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              onClick={() => window.open('/api/monitoring/zombie-reports/fix', '_blank')}
              className="p-4 border border-blue-200 rounded-lg hover:bg-blue-50 text-left"
            >
              <div className="font-medium text-blue-900">Fix Zombie Reports</div>
              <div className="text-sm text-blue-600 mt-1">
                Run automated fix for detected zombie reports
              </div>
            </button>
            <button
              onClick={() => window.open('/api/monitoring/health-report', '_blank')}
              className="p-4 border border-green-200 rounded-lg hover:bg-green-50 text-left"
            >
              <div className="font-medium text-green-900">Download Health Report</div>
              <div className="text-sm text-green-600 mt-1">
                Get detailed pipeline health analysis
              </div>
            </button>
            <button
              onClick={() => window.open('/reports', '_blank')}
              className="p-4 border border-purple-200 rounded-lg hover:bg-purple-50 text-left"
            >
              <div className="font-medium text-purple-900">View All Reports</div>
              <div className="text-sm text-purple-600 mt-1">
                Browse and validate report accessibility
              </div>
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ZombieReportDashboard; 