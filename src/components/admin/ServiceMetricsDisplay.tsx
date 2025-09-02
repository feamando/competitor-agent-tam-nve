'use client';

import React from 'react';
import { BedrockServiceMetrics } from '@/types/bedrockHealth';

interface ServiceMetricsDisplayProps {
  metrics: BedrockServiceMetrics;
  className?: string;
}

export function ServiceMetricsDisplay({
  metrics,
  className = ''
}: ServiceMetricsDisplayProps) {
  const successRate = metrics.totalRequests > 0 
    ? ((metrics.successfulRequests / metrics.totalRequests) * 100).toFixed(1)
    : '0';

  const errorRate = metrics.totalRequests > 0 
    ? ((metrics.failedRequests / metrics.totalRequests) * 100).toFixed(1)
    : '0';

  const getMetricColor = (value: number, thresholds: { good: number; warning: number }) => {
    if (value >= thresholds.good) return 'text-green-600';
    if (value >= thresholds.warning) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getCircuitBreakerColor = (state: string) => {
    switch (state) {
      case 'CLOSED':
        return 'text-green-600 bg-green-50 border-green-200';
      case 'HALF_OPEN':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'OPEN':
        return 'text-red-600 bg-red-50 border-red-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Performance Metrics */}
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-4">Performance Metrics</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Success Rate */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className={`text-2xl font-bold ${getMetricColor(parseFloat(successRate), { good: 95, warning: 85 })}`}>
                  {successRate}%
                </div>
                <div className="text-sm text-gray-600">Success Rate</div>
                <div className="text-xs text-gray-500 mt-1">
                  {metrics.successfulRequests} / {metrics.totalRequests} requests
                </div>
              </div>
              <div className="text-green-500">
                <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
            </div>
          </div>

          {/* Error Rate */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className={`text-2xl font-bold ${getMetricColor(100 - parseFloat(errorRate), { good: 95, warning: 85 })}`}>
                  {errorRate}%
                </div>
                <div className="text-sm text-gray-600">Error Rate</div>
                <div className="text-xs text-gray-500 mt-1">
                  {metrics.failedRequests} failures
                </div>
              </div>
              <div className="text-red-500">
                <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
            </div>
          </div>

          {/* Average Response Time */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className={`text-2xl font-bold ${getMetricColor(5000 - metrics.averageResponseTime, { good: 3000, warning: 1000 })}`}>
                  {formatDuration(metrics.averageResponseTime)}
                </div>
                <div className="text-sm text-gray-600">Avg Response Time</div>
                <div className="text-xs text-gray-500 mt-1">
                  Over {metrics.totalRequests} requests
                </div>
              </div>
              <div className="text-blue-500">
                <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Circuit Breaker Status */}
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-4">Circuit Breaker Status</h3>
        
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`px-3 py-1 rounded-full text-sm font-medium border ${getCircuitBreakerColor(metrics.circuitBreakerState)}`}>
                {metrics.circuitBreakerState}
              </div>
              <div>
                <div className="text-sm font-medium text-gray-900">
                  Circuit Breaker
                </div>
                <div className="text-xs text-gray-600">
                  {metrics.circuitBreakerState === 'CLOSED' && 'Normal operation - requests flowing through'}
                  {metrics.circuitBreakerState === 'OPEN' && 'Service unavailable - requests blocked, automatic recovery in progress'}
                  {metrics.circuitBreakerState === 'HALF_OPEN' && 'Testing service recovery - limited requests allowed'}
                </div>
              </div>
            </div>

            <div className="text-right text-xs text-gray-500">
              <div>Last Health Check:</div>
              <div>{new Date(metrics.lastHealthCheck).toLocaleString()}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Request Volume Trends */}
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-4">Request Volume</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
            <div className="text-3xl font-bold text-gray-900 mb-2">
              {metrics.totalRequests}
            </div>
            <div className="text-sm text-gray-600">Total Requests</div>
            <div className="text-xs text-gray-500 mt-1">
              Since service start
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
            <div className="text-3xl font-bold text-green-600 mb-2">
              {metrics.successfulRequests}
            </div>
            <div className="text-sm text-gray-600">Successful</div>
            <div className="text-xs text-green-600 mt-1">
              {successRate}% success rate
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
            <div className="text-3xl font-bold text-red-600 mb-2">
              {metrics.failedRequests}
            </div>
            <div className="text-sm text-gray-600">Failed</div>
            <div className="text-xs text-red-600 mt-1">
              {errorRate}% error rate
            </div>
          </div>
        </div>
      </div>

      {/* Performance Thresholds */}
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-4">Performance Thresholds</h3>
        
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <div className="font-medium text-gray-900 mb-2">Success Rate</div>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-green-600">Excellent:</span>
                  <span>≥95%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-yellow-600">Warning:</span>
                  <span>85-94%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-red-600">Critical:</span>
                  <span>&lt;85%</span>
                </div>
              </div>
            </div>

            <div>
              <div className="font-medium text-gray-900 mb-2">Response Time</div>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-green-600">Excellent:</span>
                  <span>&lt;2s</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-yellow-600">Warning:</span>
                  <span>2-4s</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-red-600">Critical:</span>
                  <span>&gt;4s</span>
                </div>
              </div>
            </div>

            <div>
              <div className="font-medium text-gray-900 mb-2">Circuit Breaker</div>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-green-600">CLOSED:</span>
                  <span>Normal</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-yellow-600">HALF_OPEN:</span>
                  <span>Testing</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-red-600">OPEN:</span>
                  <span>Failed</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ServiceMetricsDisplay;