/**
 * Task 8.2: Concurrent Operations Load Test
 * 
 * Tests consolidated services under concurrent load with real-time monitoring
 * Validates memory usage, response times, and system resource consumption
 */

import { performance } from 'perf_hooks';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { generateCorrelationId } from '@/lib/logger';

// Load Test Configuration
const CONCURRENT_LOAD_CONFIG = {
  // Test parameters
  phases: [
    { name: 'Warm-up', duration: 30000, concurrency: 2, rampUp: 0 },
    { name: 'Light Load', duration: 60000, concurrency: 5, rampUp: 10000 },
    { name: 'Medium Load', duration: 120000, concurrency: 15, rampUp: 20000 },
    { name: 'Heavy Load', duration: 180000, concurrency: 30, rampUp: 30000 },
    { name: 'Peak Load', duration: 120000, concurrency: 50, rampUp: 20000 },
    { name: 'Cool Down', duration: 60000, concurrency: 5, rampUp: 30000 }
  ],
  
  // Performance thresholds
  thresholds: {
    analysisResponseTime: {
      p50: 15000,  // 15 seconds
      p95: 45000,  // 45 seconds
      p99: 90000   // 90 seconds
    },
    reportResponseTime: {
      p50: 20000,  // 20 seconds
      p95: 60000,  // 60 seconds
      p99: 120000  // 120 seconds
    },
    memoryUsage: {
      maxHeapMB: 1024,     // 1GB
      maxRssMB: 2048,      // 2GB
      leakThreshold: 0.20  // 20% growth
    },
    errorRate: {
      max: 0.05  // 5% maximum error rate
    }
  },

  // API endpoints
  endpoints: {
    baseUrl: 'http://localhost:3000',
    analysis: '/api/projects/{projectId}/analysis',
    report: '/api/reports/auto-generate',
    health: '/api/health'
  }
};

// Performance monitoring state
interface LoadTestMetrics {
  startTime: number;
  phases: PhaseMetrics[];
  operations: {
    analysis: OperationMetrics;
    report: OperationMetrics;
    workflow: OperationMetrics;
  };
  system: SystemMetrics;
  errors: ErrorMetrics[];
  alerts: PerformanceAlert[];
}

interface PhaseMetrics {
  name: string;
  startTime: number;
  endTime?: number;
  concurrency: number;
  requestsCompleted: number;
  requestsFailed: number;
  avgResponseTime: number;
  memoryPeak: number;
}

interface OperationMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  responseTimes: number[];
  errorRate: number;
  throughput: number;
}

interface SystemMetrics {
  memorySnapshots: MemorySnapshot[];
  cpuUsage: number[];
  peakMemoryUsage: number;
  avgMemoryUsage: number;
}

interface MemorySnapshot {
  timestamp: number;
  heapUsed: number;
  heapTotal: number;
  rss: number;
  external: number;
  systemMemory: {
    total: number;
    free: number;
    used: number;
    percentage: number;
  };
  cpuLoad: number[];
}

interface ErrorMetrics {
  timestamp: number;
  operation: string;
  error: string;
  statusCode?: number;
  correlationId: string;
  phase: string;
}

interface PerformanceAlert {
  timestamp: number;
  type: 'memory' | 'response_time' | 'error_rate' | 'system';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  value: number;
}

class ConcurrentLoadTester {
  private metrics: LoadTestMetrics;
  private memoryMonitorInterval?: NodeJS.Timeout;
  private activeRequests = new Set<Promise<any>>();

  constructor() {
    this.metrics = {
      startTime: Date.now(),
      phases: [],
      operations: {
        analysis: this.initOperationMetrics(),
        report: this.initOperationMetrics(),
        workflow: this.initOperationMetrics()
      },
      system: {
        memorySnapshots: [],
        cpuUsage: [],
        peakMemoryUsage: 0,
        avgMemoryUsage: 0
      },
      errors: [],
      alerts: []
    };
  }

  private initOperationMetrics(): OperationMetrics {
    return {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      responseTimes: [],
      errorRate: 0,
      throughput: 0
    };
  }

  /**
   * Start the concurrent load test
   */
  async startLoadTest(): Promise<void> {
    console.log('🚀 Starting Concurrent Operations Load Test');
    console.log(`Total phases: ${CONCURRENT_LOAD_CONFIG.phases.length}`);
    
    this.startSystemMonitoring();
    
    try {
      for (const phase of CONCURRENT_LOAD_CONFIG.phases) {
        await this.executePhase(phase);
      }
    } finally {
      this.stopSystemMonitoring();
      await this.generateReport();
    }
  }

  /**
   * Execute a load test phase
   */
  private async executePhase(phaseConfig: any): Promise<void> {
    console.log(`\n📊 Starting Phase: ${phaseConfig.name}`);
    console.log(`- Duration: ${phaseConfig.duration / 1000}s`);
    console.log(`- Target Concurrency: ${phaseConfig.concurrency}`);
    console.log(`- Ramp-up Time: ${phaseConfig.rampUp / 1000}s`);

    const phaseMetrics: PhaseMetrics = {
      name: phaseConfig.name,
      startTime: Date.now(),
      concurrency: phaseConfig.concurrency,
      requestsCompleted: 0,
      requestsFailed: 0,
      avgResponseTime: 0,
      memoryPeak: 0
    };

    // Ramp up concurrency gradually
    const startTime = Date.now();
    const endTime = startTime + phaseConfig.duration;
    let currentConcurrency = 0;

    while (Date.now() < endTime) {
      // Calculate target concurrency based on ramp-up
      const elapsed = Date.now() - startTime;
      const rampProgress = Math.min(elapsed / phaseConfig.rampUp, 1);
      const targetConcurrency = Math.floor(phaseConfig.concurrency * rampProgress);

      // Adjust active requests to match target concurrency
      if (currentConcurrency < targetConcurrency) {
        const requestsToAdd = targetConcurrency - currentConcurrency;
        for (let i = 0; i < requestsToAdd; i++) {
          this.startConcurrentRequest(phaseConfig.name);
          currentConcurrency++;
        }
      }

      // Wait before next adjustment
      await this.sleep(1000);

      // Update phase metrics
      const currentMemory = process.memoryUsage().heapUsed / 1024 / 1024;
      phaseMetrics.memoryPeak = Math.max(phaseMetrics.memoryPeak, currentMemory);
    }

    // Wait for all requests in this phase to complete
    await Promise.allSettled(Array.from(this.activeRequests));
    this.activeRequests.clear();

    phaseMetrics.endTime = Date.now();
    this.metrics.phases.push(phaseMetrics);

    console.log(`✅ Phase ${phaseConfig.name} completed`);
    console.log(`- Requests Completed: ${phaseMetrics.requestsCompleted}`);
    console.log(`- Requests Failed: ${phaseMetrics.requestsFailed}`);
    console.log(`- Memory Peak: ${phaseMetrics.memoryPeak.toFixed(2)}MB`);
  }

  /**
   * Start a concurrent request (randomly chooses operation type)
   */
  private startConcurrentRequest(phaseName: string): void {
    const operations = ['analysis', 'report', 'workflow'];
    const randomIndex = Math.floor(Math.random() * operations.length);
    const operation = operations[randomIndex] || 'analysis'; // Fallback to 'analysis' if undefined
    
    const requestPromise = this.executeSingleRequest(operation, phaseName)
      .finally(() => {
        this.activeRequests.delete(requestPromise);
      });
    
    this.activeRequests.add(requestPromise);
  }

  /**
   * Execute a single request operation
   */
  private async executeSingleRequest(operation: string, phaseName: string): Promise<void> {
    const correlationId = generateCorrelationId();
    const startTime = performance.now();

    try {
      let response: Response;
      
      switch (operation) {
        case 'analysis':
          response = await this.makeAnalysisRequest(correlationId);
          break;
        case 'report':
          response = await this.makeReportRequest(correlationId);
          break;
        case 'workflow':
          response = await this.makeWorkflowRequest(correlationId);
          break;
        default:
          throw new Error(`Unknown operation: ${operation}`);
      }

      const duration = performance.now() - startTime;
      this.recordSuccess(operation, duration, response.status);

    } catch (error) {
      const duration = performance.now() - startTime;
      this.recordError(operation, error as Error, correlationId, phaseName, duration);
    }
  }

  /**
   * Make analysis request
   */
     private async makeAnalysisRequest(correlationId: string): Promise<Response> {
     const projectId = `load-test-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
     
     return fetch(`${CONCURRENT_LOAD_CONFIG.endpoints.baseUrl}/api/projects/${projectId}/analysis`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Correlation-ID': correlationId
      },
      body: JSON.stringify({
        analysisConfig: {
          focusAreas: ['features', 'user_experience'],
          depth: 'detailed',
          includeRecommendations: true,
          enhanceWithAI: true,
          consolidatedServiceV15: true
        },
        testMode: true
      })
    });
  }

  /**
   * Make report request
   */
     private async makeReportRequest(correlationId: string): Promise<Response> {
     const projectId = `load-test-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
     
     return fetch(`${CONCURRENT_LOAD_CONFIG.endpoints.baseUrl}/api/reports/auto-generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Correlation-ID': correlationId
      },
      body: JSON.stringify({
        projectId,
        template: 'comprehensive',
        immediate: true,
        reportOptions: {
          includeRecommendations: true,
          enhanceWithAI: true,
          includeDataFreshness: true,
          consolidatedServiceV15: true
        },
        testMode: true
      })
    });
  }

  /**
   * Make workflow request (analysis + report)
   */
  private async makeWorkflowRequest(correlationId: string): Promise<Response> {
    // First make analysis request, then report request
    const analysisResponse = await this.makeAnalysisRequest(`${correlationId}-analysis`);
    
    if (analysisResponse.ok) {
      return this.makeReportRequest(`${correlationId}-report`);
    } else {
      throw new Error(`Analysis failed with status ${analysisResponse.status}`);
    }
  }

  /**
   * Record successful request
   */
  private recordSuccess(operation: string, duration: number, statusCode: number): void {
    const opMetrics = this.metrics.operations[operation as keyof typeof this.metrics.operations];
    
    opMetrics.totalRequests++;
    opMetrics.successfulRequests++;
    opMetrics.responseTimes.push(duration);
    opMetrics.errorRate = opMetrics.failedRequests / opMetrics.totalRequests;

    // Check for performance alerts
    this.checkPerformanceThresholds(operation, duration);
    
    console.log(`✅ ${operation}: ${duration.toFixed(0)}ms (${statusCode})`);
  }

  /**
   * Record failed request
   */
  private recordError(operation: string, error: Error, correlationId: string, phase: string, duration: number): void {
    const opMetrics = this.metrics.operations[operation as keyof typeof this.metrics.operations];
    
    opMetrics.totalRequests++;
    opMetrics.failedRequests++;
    opMetrics.errorRate = opMetrics.failedRequests / opMetrics.totalRequests;

    const errorMetric: ErrorMetrics = {
      timestamp: Date.now(),
      operation,
      error: error.message,
      correlationId,
      phase
    };

    this.metrics.errors.push(errorMetric);
    
    // Check error rate alert
    if (opMetrics.errorRate > CONCURRENT_LOAD_CONFIG.thresholds.errorRate.max) {
      this.addAlert('error_rate', 'high', `${operation} error rate ${(opMetrics.errorRate * 100).toFixed(1)}% exceeds threshold`, opMetrics.errorRate);
    }

    console.log(`❌ ${operation}: ${error.message} (${duration.toFixed(0)}ms)`);
  }

  /**
   * Check performance thresholds and generate alerts
   */
  private checkPerformanceThresholds(operation: string, duration: number): void {
    const thresholds = CONCURRENT_LOAD_CONFIG.thresholds;
    
    if (operation === 'analysis' && duration > thresholds.analysisResponseTime.p95) {
      this.addAlert('response_time', 'medium', `Analysis response time ${duration.toFixed(0)}ms exceeds P95 threshold`, duration);
    }
    
    if (operation === 'report' && duration > thresholds.reportResponseTime.p95) {
      this.addAlert('response_time', 'medium', `Report response time ${duration.toFixed(0)}ms exceeds P95 threshold`, duration);
    }
  }

  /**
   * Add performance alert
   */
  private addAlert(type: PerformanceAlert['type'], severity: PerformanceAlert['severity'], message: string, value: number): void {
    const alert: PerformanceAlert = {
      timestamp: Date.now(),
      type,
      severity,
      message,
      value
    };

    this.metrics.alerts.push(alert);
    console.log(`⚠️ ALERT [${severity.toUpperCase()}]: ${message}`);
  }

  /**
   * Start system resource monitoring
   */
  private startSystemMonitoring(): void {
    this.memoryMonitorInterval = setInterval(() => {
      const memoryUsage = process.memoryUsage();
      const systemMemory = {
        total: os.totalmem(),
        free: os.freemem(),
        used: os.totalmem() - os.freemem()
      };

      const snapshot: MemorySnapshot = {
        timestamp: Date.now(),
        heapUsed: memoryUsage.heapUsed / 1024 / 1024, // MB
        heapTotal: memoryUsage.heapTotal / 1024 / 1024, // MB
        rss: memoryUsage.rss / 1024 / 1024, // MB
        external: memoryUsage.external / 1024 / 1024, // MB
        systemMemory: {
          total: systemMemory.total / 1024 / 1024, // MB
          free: systemMemory.free / 1024 / 1024, // MB
          used: systemMemory.used / 1024 / 1024, // MB
          percentage: (systemMemory.used / systemMemory.total) * 100
        },
        cpuLoad: os.loadavg()
      };

      this.metrics.system.memorySnapshots.push(snapshot);
      this.metrics.system.peakMemoryUsage = Math.max(this.metrics.system.peakMemoryUsage, snapshot.heapUsed);

      // Memory usage alerts
      if (snapshot.heapUsed > CONCURRENT_LOAD_CONFIG.thresholds.memoryUsage.maxHeapMB) {
        this.addAlert('memory', 'critical', `Heap usage ${snapshot.heapUsed.toFixed(0)}MB exceeds limit`, snapshot.heapUsed);
      }

      // Keep only last 1000 snapshots
      if (this.metrics.system.memorySnapshots.length > 1000) {
        this.metrics.system.memorySnapshots = this.metrics.system.memorySnapshots.slice(-1000);
      }

    }, 2000); // Every 2 seconds
  }

  /**
   * Stop system monitoring
   */
  private stopSystemMonitoring(): void {
    if (this.memoryMonitorInterval) {
      clearInterval(this.memoryMonitorInterval);
    }

    // Calculate average memory usage
    if (this.metrics.system.memorySnapshots.length > 0) {
      const totalMemory = this.metrics.system.memorySnapshots.reduce((sum, snap) => sum + snap.heapUsed, 0);
      this.metrics.system.avgMemoryUsage = totalMemory / this.metrics.system.memorySnapshots.length;
    }
  }

  /**
   * Generate comprehensive test report
   */
  private async generateReport(): Promise<void> {
    console.log('\n📄 Generating Load Test Report...');

    const reportData = {
      metadata: {
        timestamp: new Date().toISOString(),
        duration: Date.now() - this.metrics.startTime,
        phases: this.metrics.phases.length,
        totalRequests: Object.values(this.metrics.operations).reduce((sum, op) => sum + op.totalRequests, 0)
      },
      performance: {
        analysis: this.calculatePerformanceStats(this.metrics.operations.analysis),
        report: this.calculatePerformanceStats(this.metrics.operations.report),
        workflow: this.calculatePerformanceStats(this.metrics.operations.workflow)
      },
      system: {
        peakMemoryUsage: this.metrics.system.peakMemoryUsage,
        avgMemoryUsage: this.metrics.system.avgMemoryUsage,
        memorySnapshots: this.metrics.system.memorySnapshots.length
      },
      reliability: {
        totalErrors: this.metrics.errors.length,
        alerts: this.metrics.alerts.length,
        errorsByOperation: this.groupErrorsByOperation()
      },
      phases: this.metrics.phases,
      alerts: this.metrics.alerts,
      recommendations: this.generateRecommendations()
    };

    // Save detailed report
    const reportsDir = path.join(process.cwd(), 'load-tests/reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    const reportPath = path.join(reportsDir, `concurrent-load-test-${Date.now()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2));

    // Generate markdown summary
    const summaryPath = path.join(reportsDir, `concurrent-load-test-summary-${Date.now()}.md`);
    fs.writeFileSync(summaryPath, this.generateMarkdownSummary(reportData));

    console.log(`✅ Reports generated:`);
    console.log(`- JSON: ${reportPath}`);
    console.log(`- Summary: ${summaryPath}`);
  }

  /**
   * Calculate performance statistics
   */
  private calculatePerformanceStats(opMetrics: OperationMetrics): any {
    if (opMetrics.responseTimes.length === 0) {
      return null;
    }

    const sorted = [...opMetrics.responseTimes].sort((a, b) => a - b);
    const count = sorted.length;

    return {
      totalRequests: opMetrics.totalRequests,
      successfulRequests: opMetrics.successfulRequests,
      failedRequests: opMetrics.failedRequests,
      errorRate: (opMetrics.errorRate * 100).toFixed(2) + '%',
      responseTime: {
        min: sorted[0],
        max: sorted[count - 1],
        avg: sorted.reduce((sum, val) => sum + val, 0) / count,
        median: sorted[Math.floor(count / 2)],
        p95: sorted[Math.floor(count * 0.95)],
        p99: sorted[Math.floor(count * 0.99)]
      }
    };
  }

  /**
   * Group errors by operation
   */
  private groupErrorsByOperation(): Record<string, number> {
    const grouped: Record<string, number> = {};
    
    this.metrics.errors.forEach(error => {
      grouped[error.operation] = (grouped[error.operation] || 0) + 1;
    });

    return grouped;
  }

  /**
   * Generate performance recommendations
   */
  private generateRecommendations(): string[] {
    const recommendations: string[] = [];

    // Error rate recommendations
    Object.entries(this.metrics.operations).forEach(([operation, metrics]) => {
      if (metrics.errorRate > 0.05) {
        recommendations.push(`High error rate (${(metrics.errorRate * 100).toFixed(1)}%) in ${operation} service - investigate and implement error handling improvements`);
      }
    });

    // Memory recommendations
    if (this.metrics.system.peakMemoryUsage > CONCURRENT_LOAD_CONFIG.thresholds.memoryUsage.maxHeapMB * 0.8) {
      recommendations.push(`High memory usage detected (${this.metrics.system.peakMemoryUsage.toFixed(0)}MB) - consider memory optimization`);
    }

    // Alert-based recommendations
    if (this.metrics.alerts.length > 10) {
      recommendations.push(`${this.metrics.alerts.length} performance alerts generated - review service performance under concurrent load`);
    }

    return recommendations;
  }

  /**
   * Generate markdown summary
   */
  private generateMarkdownSummary(reportData: any): string {
    return `# Concurrent Operations Load Test Report

**Generated:** ${reportData.metadata.timestamp}  
**Duration:** ${Math.round(reportData.metadata.duration / 60000)} minutes  
**Total Requests:** ${reportData.metadata.totalRequests}

## Executive Summary

- **Peak Memory Usage:** ${reportData.system.peakMemoryUsage.toFixed(2)}MB
- **Average Memory Usage:** ${reportData.system.avgMemoryUsage.toFixed(2)}MB
- **Total Errors:** ${reportData.reliability.totalErrors}
- **Performance Alerts:** ${reportData.reliability.alerts}

## Performance Results

### Analysis Service
${reportData.performance.analysis ? `
- **Total Requests:** ${reportData.performance.analysis.totalRequests}
- **Success Rate:** ${(100 - parseFloat(reportData.performance.analysis.errorRate)).toFixed(1)}%
- **Average Response Time:** ${reportData.performance.analysis.responseTime.avg.toFixed(0)}ms
- **95th Percentile:** ${reportData.performance.analysis.responseTime.p95.toFixed(0)}ms
` : 'No analysis requests completed'}

### Report Service
${reportData.performance.report ? `
- **Total Requests:** ${reportData.performance.report.totalRequests}
- **Success Rate:** ${(100 - parseFloat(reportData.performance.report.errorRate)).toFixed(1)}%
- **Average Response Time:** ${reportData.performance.report.responseTime.avg.toFixed(0)}ms
- **95th Percentile:** ${reportData.performance.report.responseTime.p95.toFixed(0)}ms
` : 'No report requests completed'}

### Workflow Operations
${reportData.performance.workflow ? `
- **Total Workflows:** ${reportData.performance.workflow.totalRequests}
- **Success Rate:** ${(100 - parseFloat(reportData.performance.workflow.errorRate)).toFixed(1)}%
- **Average Time:** ${reportData.performance.workflow.responseTime.avg.toFixed(0)}ms
- **95th Percentile:** ${reportData.performance.workflow.responseTime.p95.toFixed(0)}ms
` : 'No workflow requests completed'}

## Load Test Phases

${reportData.phases.map((phase: PhaseMetrics) => `
### ${phase.name}
- **Duration:** ${Math.round((phase.endTime! - phase.startTime) / 1000)}s
- **Concurrency:** ${phase.concurrency}
- **Requests Completed:** ${phase.requestsCompleted}
- **Requests Failed:** ${phase.requestsFailed}
- **Memory Peak:** ${phase.memoryPeak.toFixed(2)}MB
`).join('')}

## Recommendations

${reportData.recommendations.map((rec: string) => `- ${rec}`).join('\n')}

## Performance Alerts

${reportData.alerts.length > 0 ? 
  reportData.alerts.slice(0, 10).map((alert: PerformanceAlert) => 
    `- **${alert.severity.toUpperCase()}:** ${alert.message} (${alert.value.toFixed(0)})`
  ).join('\n') : 
  'No performance alerts generated'
}

---

*Generated by Concurrent Operations Load Tester*
`;
  }

  /**
   * Utility: Sleep function
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export for testing
export { ConcurrentLoadTester, CONCURRENT_LOAD_CONFIG };

// Run load test if called directly
if (require.main === module) {
  const loadTester = new ConcurrentLoadTester();
  
  loadTester.startLoadTest()
    .then(() => {
      console.log('🎉 Concurrent Load Test completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Load Test failed:', error);
      process.exit(1);
    });
} 