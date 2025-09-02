'use client';

import React, { useState } from 'react';

interface ServiceHistoryPoint {
  timestamp: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  responseTime: number;
  successRate: number;
  errorCount: number;
}

interface ServiceHistoryChartsProps {
  history: ServiceHistoryPoint[];
  className?: string;
}

export function ServiceHistoryCharts({
  history,
  className = ''
}: ServiceHistoryChartsProps) {
  const [selectedTimeRange, setSelectedTimeRange] = useState<'1h' | '6h' | '24h' | '7d'>('24h');
  const [selectedChart, setSelectedChart] = useState<'status' | 'response' | 'success' | 'errors'>('status');

  const filterDataByTimeRange = (data: ServiceHistoryPoint[]) => {
    const now = new Date();
    const cutoff = new Date();
    
    switch (selectedTimeRange) {
      case '1h':
        cutoff.setHours(now.getHours() - 1);
        break;
      case '6h':
        cutoff.setHours(now.getHours() - 6);
        break;
      case '24h':
        cutoff.setDate(now.getDate() - 1);
        break;
      case '7d':
        cutoff.setDate(now.getDate() - 7);
        break;
    }

    return data.filter(point => new Date(point.timestamp) >= cutoff);
  };

  const filteredHistory = filterDataByTimeRange(history);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return '#10B981'; // green-500
      case 'degraded':
        return '#F59E0B'; // yellow-500
      case 'unhealthy':
        return '#EF4444'; // red-500
      default:
        return '#6B7280'; // gray-500
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    if (selectedTimeRange === '1h' || selectedTimeRange === '6h') {
      return date.toLocaleTimeString();
    } else {
      return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
  };

  const getChartHeight = () => 200;
  const getChartWidth = () => 600;

  const createSVGPath = (points: number[], maxValue: number) => {
    if (points.length === 0) return '';
    
    const width = getChartWidth();
    const height = getChartHeight();
    const padding = 20;
    
    const stepX = (width - 2 * padding) / Math.max(points.length - 1, 1);
    const stepY = (height - 2 * padding) / Math.max(maxValue, 1);
    
    let path = '';
    points.forEach((point, index) => {
      const x = padding + index * stepX;
      const y = height - padding - (point * stepY);
      
      if (index === 0) {
        path += `M ${x} ${y}`;
      } else {
        path += ` L ${x} ${y}`;
      }
    });
    
    return path;
  };

  const renderStatusChart = () => {
    if (filteredHistory.length === 0) {
      return <div className="text-center text-gray-500 py-8">No data available</div>;
    }

    return (
      <div className="space-y-4">
        <div className="h-48 bg-gray-50 rounded-lg p-4 relative overflow-x-auto">
          <svg width="100%" height="100%" viewBox={`0 0 ${getChartWidth()} ${getChartHeight()}`}>
            {/* Grid lines */}
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#E5E7EB" strokeWidth="1"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
            
            {/* Status timeline */}
            {filteredHistory.map((point, index) => {
              const x = 20 + (index * (getChartWidth() - 40) / Math.max(filteredHistory.length - 1, 1));
              const y = getChartHeight() / 2;
              
              return (
                <g key={index}>
                  <circle
                    cx={x}
                    cy={y}
                    r="6"
                    fill={getStatusColor(point.status)}
                    stroke="white"
                    strokeWidth="2"
                  />
                  <title>{`${formatTimestamp(point.timestamp)}: ${point.status}`}</title>
                </g>
              );
            })}
          </svg>
        </div>
        
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
            <span>Healthy</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
            <span>Degraded</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            <span>Unhealthy</span>
          </div>
        </div>
      </div>
    );
  };

  const renderMetricChart = (metric: 'responseTime' | 'successRate' | 'errorCount') => {
    const values = filteredHistory.map(point => point[metric]);
    const maxValue = Math.max(...values, 1);
    const minValue = Math.min(...values, 0);
    
    const getColor = () => {
      switch (metric) {
        case 'responseTime': return '#3B82F6'; // blue-500
        case 'successRate': return '#10B981'; // green-500
        case 'errorCount': return '#EF4444'; // red-500
      }
    };

    const getUnit = () => {
      switch (metric) {
        case 'responseTime': return 'ms';
        case 'successRate': return '%';
        case 'errorCount': return 'errors';
      }
    };

    if (values.length === 0) {
      return <div className="text-center text-gray-500 py-8">No data available</div>;
    }

    return (
      <div className="space-y-4">
        <div className="h-48 bg-gray-50 rounded-lg p-4">
          <svg width="100%" height="100%" viewBox={`0 0 ${getChartWidth()} ${getChartHeight()}`}>
            {/* Grid lines */}
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#E5E7EB" strokeWidth="1"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
            
            {/* Chart line */}
            <path
              d={createSVGPath(values, maxValue)}
              fill="none"
              stroke={getColor()}
              strokeWidth="2"
            />
            
            {/* Data points */}
            {values.map((value, index) => {
              const x = 20 + (index * (getChartWidth() - 40) / Math.max(values.length - 1, 1));
              const y = getChartHeight() - 20 - ((value / maxValue) * (getChartHeight() - 40));
              
              return (
                <circle
                  key={index}
                  cx={x}
                  cy={y}
                  r="3"
                  fill={getColor()}
                  stroke="white"
                  strokeWidth="1"
                >
                  <title>{`${formatTimestamp(filteredHistory[index].timestamp)}: ${value} ${getUnit()}`}</title>
                </circle>
              );
            })}
            
            {/* Y-axis labels */}
            <text x="10" y="25" fontSize="10" fill="#6B7280">{maxValue}{getUnit()}</text>
            <text x="10" y={getChartHeight() - 10} fontSize="10" fill="#6B7280">{minValue}{getUnit()}</text>
          </svg>
        </div>
        
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div className="text-center">
            <div className="font-medium text-gray-900">Current</div>
            <div className="text-lg font-bold" style={{ color: getColor() }}>
              {values[values.length - 1]}{getUnit()}
            </div>
          </div>
          <div className="text-center">
            <div className="font-medium text-gray-900">Average</div>
            <div className="text-lg font-bold text-gray-600">
              {(values.reduce((a, b) => a + b, 0) / values.length).toFixed(1)}{getUnit()}
            </div>
          </div>
          <div className="text-center">
            <div className="font-medium text-gray-900">Peak</div>
            <div className="text-lg font-bold text-gray-600">
              {maxValue}{getUnit()}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Time Range Selector */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700">Time Range:</span>
          <div className="flex rounded-md shadow-sm">
            {(['1h', '6h', '24h', '7d'] as const).map((range) => (
              <button
                key={range}
                onClick={() => setSelectedTimeRange(range)}
                className={`px-3 py-1 text-sm font-medium first:rounded-l-md last:rounded-r-md border ${
                  selectedTimeRange === range
                    ? 'bg-blue-50 border-blue-500 text-blue-700'
                    : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                } ${range !== '1h' ? 'border-l-0' : ''}`}
              >
                {range}
              </button>
            ))}
          </div>
        </div>

        {/* Chart Type Selector */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700">Chart:</span>
          <select
            value={selectedChart}
            onChange={(e) => setSelectedChart(e.target.value as any)}
            className="border border-gray-300 rounded-md px-3 py-1 text-sm bg-white"
          >
            <option value="status">Service Status</option>
            <option value="response">Response Time</option>
            <option value="success">Success Rate</option>
            <option value="errors">Error Count</option>
          </select>
        </div>
      </div>

      {/* Chart Display */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="mb-4">
          <h3 className="text-lg font-medium text-gray-900">
            {selectedChart === 'status' && 'Service Status Over Time'}
            {selectedChart === 'response' && 'Response Time Trend'}
            {selectedChart === 'success' && 'Success Rate Trend'}
            {selectedChart === 'errors' && 'Error Count Trend'}
          </h3>
          <p className="text-sm text-gray-600 mt-1">
            Last {selectedTimeRange} • {filteredHistory.length} data points
          </p>
        </div>

        {selectedChart === 'status' && renderStatusChart()}
        {selectedChart === 'response' && renderMetricChart('responseTime')}
        {selectedChart === 'success' && renderMetricChart('successRate')}
        {selectedChart === 'errors' && renderMetricChart('errorCount')}
      </div>

      {/* Summary Statistics */}
      {filteredHistory.length > 0 && (
        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="text-sm font-medium text-gray-900 mb-3">
            Summary for {selectedTimeRange}
          </h4>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-gray-600">Uptime</div>
              <div className="font-medium">
                {((filteredHistory.filter(p => p.status === 'healthy').length / filteredHistory.length) * 100).toFixed(1)}%
              </div>
            </div>
            
            <div>
              <div className="text-gray-600">Avg Response</div>
              <div className="font-medium">
                {(filteredHistory.reduce((sum, p) => sum + p.responseTime, 0) / filteredHistory.length).toFixed(0)}ms
              </div>
            </div>
            
            <div>
              <div className="text-gray-600">Avg Success Rate</div>
              <div className="font-medium">
                {(filteredHistory.reduce((sum, p) => sum + p.successRate, 0) / filteredHistory.length).toFixed(1)}%
              </div>
            </div>
            
            <div>
              <div className="text-gray-600">Total Errors</div>
              <div className="font-medium">
                {filteredHistory.reduce((sum, p) => sum + p.errorCount, 0)}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ServiceHistoryCharts;