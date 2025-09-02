'use client';

import React, { useState, useEffect } from 'react';
import { BedrockServiceMetrics, BedrockHealthStatus } from '@/types/bedrockHealth';
import ServiceMetricsDisplay from './ServiceMetricsDisplay';
import ServiceHistoryCharts from './ServiceHistoryCharts';
import ServiceControlPanel from './ServiceControlPanel';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { LoadingButton } from '@/components/composed/LoadingButton';

interface DashboardData {
  health: BedrockHealthStatus;
  metrics: BedrockServiceMetrics;
  history: ServiceHistoryPoint[];
  alerts: ServiceAlert[];
}

interface ServiceHistoryPoint {
  timestamp: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  responseTime: number;
  successRate: number;
  errorCount: number;
}

interface ServiceAlert {
  id: string;
  level: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  timestamp: string;
  resolved: boolean;
  details?: any;
}

interface BedrockServiceDashboardProps {
  className?: string;
  autoRefresh?: boolean;
  refreshInterval?: number;
  compact?: boolean;
  adminMode?: boolean;
}

export function BedrockServiceDashboard({
  className = '',
  autoRefresh = true,
  refreshInterval = 30000, // 30 seconds
  compact = false,
  adminMode = false
}: BedrockServiceDashboardProps) {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [selectedTab, setSelectedTab] = useState<'overview' | 'metrics' | 'history' | 'control'>('overview');

  const fetchDashboardData = async () => {
    try {
      setError(null);
      const response = await fetch('/api/services/bedrock/dashboard');
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch dashboard data');
      }
      
      setDashboardData(data);
      setLastUpdated(new Date());
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch dashboard data';
      setError(errorMessage);
      console.error('Dashboard data fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();

    let interval: NodeJS.Timeout | undefined;
    if (autoRefresh) {
      interval = setInterval(fetchDashboardData, refreshInterval);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh, refreshInterval]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'text-green-600 bg-green-50 border-green-200';
      case 'degraded':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'unhealthy':
      default:
        return 'text-red-600 bg-red-50 border-red-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return (
          <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
        );
      case 'degraded':
        return (
          <svg className="w-5 h-5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        );
      case 'unhealthy':
      default:
        return (
          <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
        );
    }
  };

  const getAlertIcon = (level: string) => {
    switch (level) {
      case 'critical':
      case 'error':
        return (
          <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
        );
      case 'warning':
        return (
          <svg className="w-4 h-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        );
      case 'info':
      default:
        return (
          <svg className="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
        );
    }
  };

  if (isLoading) {
    return (
      <Card className={className}>
        <CardContent className="p-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-6 w-32" />
            </div>
            <div className="space-y-4">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className={className}>
        <span className="text-xl">⚠️</span>
        <AlertDescription>
          <div className="text-center space-y-4">
            <div>
              <h3 className="font-semibold">Dashboard Error</h3>
              <p className="mt-2">{error}</p>
            </div>
            <LoadingButton
              variant="outline"
              onClick={fetchDashboardData}
              className="bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/20"
            >
              Retry
            </LoadingButton>
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  if (!dashboardData) {
    return null;
  }

  const tabs = [
    { id: 'overview', label: 'Overview', icon: 'overview' },
    { id: 'metrics', label: 'Metrics', icon: 'metrics' },
    { id: 'history', label: 'History', icon: 'history' },
    ...(adminMode ? [{ id: 'control', label: 'Control Panel', icon: 'control' }] : [])
  ];

  if (compact) {
    return (
      <Card className={className}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {getStatusIcon(dashboardData.health.status)}
              <div>
                <div className="font-medium text-sm">
                  Bedrock Service Status
                </div>
                <div className="text-xs text-muted-foreground">
                  {dashboardData.metrics.successfulRequests}/{dashboardData.metrics.totalRequests} successful
                </div>
              </div>
            </div>
            
            <Badge variant="outline" className="text-xs">
              Updated {lastUpdated?.toLocaleTimeString()}
            </Badge>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      {/* Header */}
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {getStatusIcon(dashboardData.health.status)}
            <div>
              <CardTitle className="text-lg">
                Bedrock Service Dashboard
              </CardTitle>
              <CardDescription>
                AWS Bedrock AI service monitoring and management
              </CardDescription>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchDashboardData}
            >
              <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
              </svg>
              Refresh
            </Button>
            
            {lastUpdated && (
              <Badge variant="outline" className="text-xs">
                Last updated: {lastUpdated.toLocaleTimeString()}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      {/* Status Overview */}
      <CardContent className="pt-0">
        <div className="p-4 bg-muted/30 rounded-lg">
          <Badge 
            variant={
              dashboardData.health.status === 'healthy' ? 'default' :
              dashboardData.health.status === 'degraded' ? 'secondary' :
              'destructive'
            }
            className="gap-2"
          >
            {getStatusIcon(dashboardData.health.status)}
            <span>
              Service {dashboardData.health.status.charAt(0).toUpperCase() + dashboardData.health.status.slice(1)}
            </span>
            {dashboardData.health.details?.responseTime && (
              <span className="text-xs">
                ({dashboardData.health.details.responseTime})
              </span>
            )}
          </Badge>
        </div>
      </CardContent>

      {/* Tabs */}
      <Tabs value={selectedTab} onValueChange={(value) => setSelectedTab(value as any)} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

      {/* Tab Content */}
      <div className="p-6">
        {selectedTab === 'overview' && (
          <div className="space-y-6">
            {/* Quick Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-2xl font-bold text-gray-900">
                  {dashboardData.metrics.totalRequests}
                </div>
                <div className="text-sm text-gray-600">Total Requests</div>
              </div>
              
              <div className="bg-green-50 rounded-lg p-4">
                <div className="text-2xl font-bold text-green-600">
                  {dashboardData.metrics.successfulRequests}
                </div>
                <div className="text-sm text-gray-600">Successful</div>
              </div>
              
              <div className="bg-red-50 rounded-lg p-4">
                <div className="text-2xl font-bold text-red-600">
                  {dashboardData.metrics.failedRequests}
                </div>
                <div className="text-sm text-gray-600">Failed</div>
              </div>
              
              <div className="bg-blue-50 rounded-lg p-4">
                <div className="text-2xl font-bold text-blue-600">
                  {dashboardData.metrics.averageResponseTime}ms
                </div>
                <div className="text-sm text-gray-600">Avg Response</div>
              </div>
            </div>

            {/* Active Alerts */}
            {dashboardData.alerts && dashboardData.alerts.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-3">Active Alerts</h3>
                <div className="space-y-2">
                  {dashboardData.alerts.filter(alert => !alert.resolved).map((alert) => (
                    <div
                      key={alert.id}
                      className="flex items-start gap-2 p-3 bg-gray-50 rounded-lg border-l-4 border-l-red-500"
                    >
                      {getAlertIcon(alert.level)}
                      <div className="flex-1">
                        <div className="text-sm font-medium text-gray-900">
                          {alert.message}
                        </div>
                        <div className="text-xs text-gray-600 mt-1">
                          {new Date(alert.timestamp).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {selectedTab === 'metrics' && (
          <ServiceMetricsDisplay metrics={dashboardData.metrics} />
        )}

        {selectedTab === 'history' && (
          <ServiceHistoryCharts history={dashboardData.history} />
        )}

        {selectedTab === 'control' && adminMode && (
          <ServiceControlPanel 
            currentStatus={dashboardData.health}
            onAction={fetchDashboardData}
          />
        )}
      </div>
    </div>
  );
}

export default BedrockServiceDashboard;