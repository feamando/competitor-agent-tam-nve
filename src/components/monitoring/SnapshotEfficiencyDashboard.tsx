'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Task 6.4: Snapshot Efficiency Dashboard Component
 * Displays comprehensive metrics about snapshot optimization performance
 */

interface EfficiencyMetrics {
  optimizationStats: {
    totalSnapshots: number;
    skippedSnapshots: number;
    capturedSnapshots: number;
    efficiencyRate: number;
    resourcesSaved: number;
  };
  cachePerformance: {
    cacheSize: number;
    cacheHits: number;
    cacheMisses: number;
    cacheHitRatio: number;
  };
  timeRangeStats: {
    period: '24h' | '7d' | '30d';
    optimizationsCount: number;
    averageAgeOfSkipped: number;
    mostOptimizedProject?: string;
  };
  systemImpact: {
    estimatedTimesSaved: number;
    bandwidthSaved: number;
    databaseQueriesSaved: number;
  };
}

interface EfficiencyOverview {
  currentEfficiencyRate: number;
  todayOptimizations: number;
  cacheHitRate: number;
  estimatedSavings: string;
}

export const SnapshotEfficiencyDashboard: React.FC = () => {
  const [metrics, setMetrics] = useState<EfficiencyMetrics | null>(null);
  const [overview, setOverview] = useState<EfficiencyOverview | null>(null);
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d'>('24h');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMetrics();
  }, [timeRange]);

  useEffect(() => {
    fetchOverview();
    // Refresh overview every 5 minutes
    const interval = setInterval(fetchOverview, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const fetchMetrics = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/snapshot-efficiency?range=${timeRange}`);
      const data = await response.json();
      
      if (data.success) {
        setMetrics(data.data);
        setError(null);
      } else {
        setError(data.error?.message || 'Failed to fetch metrics');
      }
    } catch (err) {
      setError('Network error while fetching metrics');
      console.error('Error fetching efficiency metrics:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchOverview = async () => {
    try {
      const response = await fetch('/api/snapshot-efficiency?overview=true');
      const data = await response.json();
      
      if (data.success) {
        setOverview(data.data);
      }
    } catch (err) {
      console.error('Error fetching efficiency overview:', err);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatTime = (milliseconds: number): string => {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  const getEfficiencyColor = (rate: number): string => {
    if (rate >= 20) return 'text-green-600';
    if (rate >= 10) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getSystemStatus = (rate: number): { status: string; color: string } => {
    if (rate >= 15) return { status: 'Optimal', color: 'text-green-600' };
    if (rate >= 5) return { status: 'Good', color: 'text-yellow-600' };
    return { status: 'Needs Attention', color: 'text-red-600' };
  };

  if (loading && !metrics) {
    return (
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="h-4 bg-gray-200 rounded w-24"></div>
            </CardHeader>
            <CardContent>
              <div className="h-8 bg-gray-200 rounded w-16 mb-2"></div>
              <div className="h-3 bg-gray-200 rounded w-32"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-red-200">
        <CardHeader>
          <CardTitle className="text-red-600">Error Loading Efficiency Metrics</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-red-500">{error}</p>
          <button 
            onClick={fetchMetrics}
            className="mt-4 px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded"
          >
            Retry
          </button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Time Range Selector */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Snapshot Efficiency Dashboard</h2>
          <p className="text-muted-foreground">Monitor snapshot optimization performance and resource savings</p>
        </div>
        <div className="flex space-x-2">
          {(['24h', '7d', '30d'] as const).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                timeRange === range
                  ? 'bg-blue-100 text-blue-700 border border-blue-200'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {range}
            </button>
          ))}
        </div>
      </div>

      {/* Overview Cards */}
      {overview && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Efficiency Rate</CardTitle>
              <span className="text-xs text-muted-foreground">Real-time</span>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${getEfficiencyColor(overview.currentEfficiencyRate)}`}>
                {overview.currentEfficiencyRate.toFixed(1)}%
              </div>
              <p className="text-xs text-muted-foreground">
                {getSystemStatus(overview.currentEfficiencyRate).status}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Today's Optimizations</CardTitle>
              <span className="text-xs text-muted-foreground">24h</span>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{overview.todayOptimizations}</div>
              <p className="text-xs text-muted-foreground">Operations skipped</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Cache Hit Rate</CardTitle>
              <span className="text-xs text-muted-foreground">Performance</span>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{overview.cacheHitRate.toFixed(1)}%</div>
              <p className="text-xs text-muted-foreground">Freshness checks cached</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Resources Saved</CardTitle>
              <span className="text-xs text-muted-foreground">Estimated</span>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{overview.estimatedSavings}</div>
              <p className="text-xs text-muted-foreground">Time & bandwidth</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Detailed Metrics */}
      {metrics && (
        <div className="grid gap-6 md:grid-cols-2">
          {/* Optimization Statistics */}
          <Card>
            <CardHeader>
              <CardTitle>Optimization Statistics</CardTitle>
              <CardDescription>Snapshot collection optimization performance for {timeRange}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Total Operations</span>
                <span className="font-medium">{metrics.optimizationStats.totalSnapshots}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Optimized (Skipped)</span>
                <span className="font-medium text-green-600">{metrics.optimizationStats.skippedSnapshots}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Executed</span>
                <span className="font-medium">{metrics.optimizationStats.capturedSnapshots}</span>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span className="text-sm font-medium">Efficiency Rate</span>
                <span className={`font-bold ${getEfficiencyColor(metrics.optimizationStats.efficiencyRate)}`}>
                  {metrics.optimizationStats.efficiencyRate.toFixed(1)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Resources Saved</span>
                <span className="font-medium text-blue-600">{metrics.optimizationStats.resourcesSaved} units</span>
              </div>
            </CardContent>
          </Card>

          {/* Cache Performance */}
          <Card>
            <CardHeader>
              <CardTitle>Cache Performance</CardTitle>
              <CardDescription>Freshness check caching efficiency</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Cache Size</span>
                <span className="font-medium">{metrics.cachePerformance.cacheSize} entries</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Cache Hits</span>
                <span className="font-medium text-green-600">{metrics.cachePerformance.cacheHits}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Cache Misses</span>
                <span className="font-medium text-red-600">{metrics.cachePerformance.cacheMisses}</span>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span className="text-sm font-medium">Hit Ratio</span>
                <span className="font-bold text-blue-600">
                  {metrics.cachePerformance.cacheHitRatio.toFixed(1)}%
                </span>
              </div>
            </CardContent>
          </Card>

          {/* System Impact */}
          <Card>
            <CardHeader>
              <CardTitle>System Impact</CardTitle>
              <CardDescription>Estimated resource savings from optimizations</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Time Saved</span>
                <span className="font-medium text-green-600">
                  {formatTime(metrics.systemImpact.estimatedTimesSaved)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Bandwidth Saved</span>
                <span className="font-medium text-blue-600">
                  {formatBytes(metrics.systemImpact.bandwidthSaved)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">DB Queries Saved</span>
                <span className="font-medium text-purple-600">
                  {metrics.systemImpact.databaseQueriesSaved}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Time Range Stats */}
          <Card>
            <CardHeader>
              <CardTitle>Period Analysis</CardTitle>
              <CardDescription>Statistics for {metrics.timeRangeStats.period} period</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Total Optimizations</span>
                <span className="font-medium">{metrics.timeRangeStats.optimizationsCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Avg Age of Skipped</span>
                <span className="font-medium">
                  {metrics.timeRangeStats.averageAgeOfSkipped.toFixed(1)} days
                </span>
              </div>
              {metrics.timeRangeStats.mostOptimizedProject && (
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Top Project</span>
                  <span className="font-medium text-sm truncate">
                    {metrics.timeRangeStats.mostOptimizedProject}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Refresh Status */}
      <div className="text-xs text-muted-foreground text-center">
        Last updated: {new Date().toLocaleTimeString()} • Auto-refresh every 5 minutes
      </div>
    </div>
  );
};

export default SnapshotEfficiencyDashboard; 