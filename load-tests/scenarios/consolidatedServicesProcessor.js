/**
 * Task 8.2: Consolidated Services Load Test Processor
 * 
 * Advanced metrics collection and performance monitoring for load testing
 * consolidated Analysis and Reporting services under realistic conditions
 */

const os = require('os');
const fs = require('fs');
const path = require('path');

// Performance monitoring state
let loadTestState = {
  startTime: null,
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  analysisRequests: 0,
  reportRequests: 0,
  workflowRequests: 0,
  memorySnapshots: [],
  responseTimeMetrics: {
    analysis: [],
    report: [],
    workflow: []
  },
  errorLog: [],
  performanceAlerts: []
};

// Memory monitoring interval
let memoryMonitorInterval = null;

/**
 * Initialize load test monitoring
 */
function initializeLoadTest(requestParams, context, ee, next) {
  console.log('🚀 Initializing Consolidated Services Load Test');
  
  loadTestState.startTime = Date.now();
  
  // Start memory monitoring
  startMemoryMonitoring();
  
  // Log test configuration
  console.log('Load Test Configuration:');
  console.log(`- Target: ${context.target || 'http://localhost:3000'}`);
  console.log(`- Test Mode: ${requestParams.testMode}`);
  console.log(`- Consolidated Service: ${requestParams.consolidatedServiceV15}`);
  
  // Create reports directory
  const reportsDir = path.join(process.cwd(), 'load-tests/reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }
  
  return next();
}

/**
 * Setup analysis test with unique identifiers
 */
function setupAnalysisTest(requestParams, context, ee, next) {
  context.vars.projectId = `load-test-project-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  context.vars.correlationId = `load-test-analysis-${Date.now()}`;
  
  loadTestState.totalRequests++;
  loadTestState.analysisRequests++;
  
  return next();
}

/**
 * Setup report test with unique identifiers
 */
function setupReportTest(requestParams, context, ee, next) {
  context.vars.projectId = `load-test-project-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  context.vars.correlationId = `load-test-report-${Date.now()}`;
  
  loadTestState.totalRequests++;
  loadTestState.reportRequests++;
  
  return next();
}

/**
 * Setup end-to-end workflow test
 */
function setupWorkflowTest(requestParams, context, ee, next) {
  context.vars.projectId = `load-test-workflow-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  context.vars.correlationId = `load-test-workflow-${Date.now()}`;
  
  loadTestState.totalRequests++;
  loadTestState.workflowRequests++;
  
  return next();
}

/**
 * Record analysis-specific metrics
 */
function recordAnalysisMetrics(requestParams, response, context, ee, next) {
  const responseTime = Date.now() - context.startTime;
  
  if (response.statusCode === 200) {
    loadTestState.successfulRequests++;
    loadTestState.responseTimeMetrics.analysis.push(responseTime);
    
    // Custom metric for Artillery
    ee.emit('customMetric', 'analysisResponseTime', responseTime);
    
    // Performance alert if response time is too high
    if (responseTime > 60000) { // 60 seconds
      logPerformanceAlert('Analysis', responseTime, context.vars.correlationId);
    }
    
    console.log(`✅ Analysis completed: ${responseTime}ms (Correlation: ${context.vars.correlationId})`);
  } else {
    loadTestState.failedRequests++;
    logError('Analysis', response.statusCode, context.vars.correlationId, response.body);
  }
  
  return next();
}

/**
 * Record report generation metrics
 */
function recordReportMetrics(requestParams, response, context, ee, next) {
  const responseTime = Date.now() - context.startTime;
  
  if (response.statusCode === 200) {
    loadTestState.successfulRequests++;
    loadTestState.responseTimeMetrics.report.push(responseTime);
    
    // Custom metric for Artillery
    ee.emit('customMetric', 'reportGenerationTime', responseTime);
    
    // Performance alert if response time is too high
    if (responseTime > 90000) { // 90 seconds
      logPerformanceAlert('Report', responseTime, context.vars.correlationId);
    }
    
    console.log(`📄 Report generated: ${responseTime}ms (Correlation: ${context.vars.correlationId})`);
  } else {
    loadTestState.failedRequests++;
    logError('Report', response.statusCode, context.vars.correlationId, response.body);
  }
  
  return next();
}

/**
 * Record end-to-end workflow metrics
 */
function recordWorkflowMetrics(requestParams, response, context, ee, next) {
  const responseTime = Date.now() - context.startTime;
  
  if (response.statusCode === 200) {
    loadTestState.successfulRequests++;
    loadTestState.responseTimeMetrics.workflow.push(responseTime);
    
    // Custom metric for Artillery
    ee.emit('customMetric', 'workflowTime', responseTime);
    
    // Performance alert if workflow time is too high
    if (responseTime > 120000) { // 2 minutes
      logPerformanceAlert('Workflow', responseTime, context.vars.correlationId);
    }
    
    console.log(`🔄 Workflow completed: ${responseTime}ms (Correlation: ${context.vars.correlationId})`);
  } else {
    loadTestState.failedRequests++;
    logError('Workflow', response.statusCode, context.vars.correlationId, response.body);
  }
  
  return next();
}

/**
 * Record health check metrics
 */
function recordHealthMetrics(requestParams, response, context, ee, next) {
  if (response.statusCode === 200) {
    console.log(`💚 Health check passed (Correlation: ${context.vars.correlationId})`);
  } else {
    console.log(`❤️ Health check failed: ${response.statusCode} (Correlation: ${context.vars.correlationId})`);
  }
  
  return next();
}

/**
 * Start continuous memory monitoring
 */
function startMemoryMonitoring() {
  memoryMonitorInterval = setInterval(() => {
    const memoryUsage = process.memoryUsage();
    const systemMemory = {
      totalMem: os.totalmem(),
      freeMem: os.freemem(),
      usedMem: os.totalmem() - os.freemem()
    };
    
    const snapshot = {
      timestamp: Date.now(),
      nodeMemory: {
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024), // MB
        external: Math.round(memoryUsage.external / 1024 / 1024), // MB
        rss: Math.round(memoryUsage.rss / 1024 / 1024) // MB
      },
      systemMemory: {
        total: Math.round(systemMemory.totalMem / 1024 / 1024), // MB
        free: Math.round(systemMemory.freeMem / 1024 / 1024), // MB
        used: Math.round(systemMemory.usedMem / 1024 / 1024), // MB
        usagePercent: Math.round((systemMemory.usedMem / systemMemory.totalMem) * 100)
      },
      cpuUsage: os.loadavg()
    };
    
    loadTestState.memorySnapshots.push(snapshot);
    
    // Memory usage alert
    if (snapshot.nodeMemory.heapUsed > 1024) { // 1GB
      logPerformanceAlert('Memory', snapshot.nodeMemory.heapUsed, 'memory-monitor');
    }
    
    // Limit memory snapshots to last 1000 entries
    if (loadTestState.memorySnapshots.length > 1000) {
      loadTestState.memorySnapshots = loadTestState.memorySnapshots.slice(-1000);
    }
    
  }, 5000); // Every 5 seconds
}

/**
 * Log performance alerts
 */
function logPerformanceAlert(operation, value, correlationId) {
  const alert = {
    timestamp: new Date().toISOString(),
    operation,
    value,
    correlationId,
    message: `${operation} performance alert: ${value}${operation === 'Memory' ? 'MB' : 'ms'}`
  };
  
  loadTestState.performanceAlerts.push(alert);
  console.log(`⚠️ PERFORMANCE ALERT: ${alert.message}`);
}

/**
 * Log errors for analysis
 */
function logError(operation, statusCode, correlationId, responseBody) {
  const error = {
    timestamp: new Date().toISOString(),
    operation,
    statusCode,
    correlationId,
    responseBody: responseBody ? JSON.stringify(responseBody).substring(0, 500) : 'No response body'
  };
  
  loadTestState.errorLog.push(error);
  console.log(`❌ ${operation} Error: ${statusCode} (Correlation: ${correlationId})`);
}

/**
 * Calculate performance statistics
 */
function calculateStats(data) {
  if (data.length === 0) return null;
  
  const sorted = [...data].sort((a, b) => a - b);
  const length = sorted.length;
  
  return {
    count: length,
    min: sorted[0],
    max: sorted[length - 1],
    median: sorted[Math.floor(length / 2)],
    p95: sorted[Math.floor(length * 0.95)],
    p99: sorted[Math.floor(length * 0.99)],
    avg: Math.round(data.reduce((sum, val) => sum + val, 0) / length)
  };
}

/**
 * Finalize load test and cleanup
 */
function finalizeLoadTest(requestParams, context, ee, next) {
  console.log('🏁 Finalizing Consolidated Services Load Test');
  
  // Stop memory monitoring
  if (memoryMonitorInterval) {
    clearInterval(memoryMonitorInterval);
  }
  
  // Calculate test duration
  const testDuration = Date.now() - loadTestState.startTime;
  const testDurationMinutes = Math.round(testDuration / 60000);
  
  // Log final statistics
  console.log('\n📊 Load Test Summary:');
  console.log(`- Test Duration: ${testDurationMinutes} minutes`);
  console.log(`- Total Requests: ${loadTestState.totalRequests}`);
  console.log(`- Successful Requests: ${loadTestState.successfulRequests}`);
  console.log(`- Failed Requests: ${loadTestState.failedRequests}`);
  console.log(`- Success Rate: ${Math.round((loadTestState.successfulRequests / loadTestState.totalRequests) * 100)}%`);
  console.log(`- Analysis Requests: ${loadTestState.analysisRequests}`);
  console.log(`- Report Requests: ${loadTestState.reportRequests}`);
  console.log(`- Workflow Requests: ${loadTestState.workflowRequests}`);
  console.log(`- Performance Alerts: ${loadTestState.performanceAlerts.length}`);
  console.log(`- Errors Logged: ${loadTestState.errorLog.length}`);
  
  return next();
}

/**
 * Generate comprehensive load test report
 */
function generateLoadTestReport(requestParams, context, ee, next) {
  console.log('📄 Generating Load Test Report...');
  
  const reportData = {
    testMetadata: {
      timestamp: new Date().toISOString(),
      duration: Date.now() - loadTestState.startTime,
      target: context.target || 'http://localhost:3000'
    },
    requestStatistics: {
      total: loadTestState.totalRequests,
      successful: loadTestState.successfulRequests,
      failed: loadTestState.failedRequests,
      successRate: Math.round((loadTestState.successfulRequests / loadTestState.totalRequests) * 100),
      breakdown: {
        analysis: loadTestState.analysisRequests,
        report: loadTestState.reportRequests,
        workflow: loadTestState.workflowRequests
      }
    },
    performanceMetrics: {
      analysis: calculateStats(loadTestState.responseTimeMetrics.analysis),
      report: calculateStats(loadTestState.responseTimeMetrics.report),
      workflow: calculateStats(loadTestState.responseTimeMetrics.workflow)
    },
    memoryAnalysis: analyzeMemoryUsage(),
    performanceAlerts: loadTestState.performanceAlerts,
    errorAnalysis: analyzeErrors(),
    recommendations: generateRecommendations()
  };
  
  // Save detailed JSON report
  const reportPath = path.join(process.cwd(), 'load-tests/reports', `consolidated-services-load-test-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2));
  
  // Generate markdown summary
  const markdownReport = generateMarkdownReport(reportData);
  const markdownPath = path.join(process.cwd(), 'load-tests/reports', `consolidated-services-load-test-summary-${Date.now()}.md`);
  fs.writeFileSync(markdownPath, markdownReport);
  
  console.log(`✅ Load test reports generated:`);
  console.log(`- JSON Report: ${reportPath}`);
  console.log(`- Markdown Summary: ${markdownPath}`);
  
  return next();
}

/**
 * Analyze memory usage patterns
 */
function analyzeMemoryUsage() {
  if (loadTestState.memorySnapshots.length === 0) {
    return { error: 'No memory snapshots collected' };
  }
  
  const heapUsageData = loadTestState.memorySnapshots.map(s => s.nodeMemory.heapUsed);
  const systemUsageData = loadTestState.memorySnapshots.map(s => s.systemMemory.usagePercent);
  
  return {
    nodeMemory: {
      heap: calculateStats(heapUsageData),
      peakUsage: Math.max(...heapUsageData),
      averageUsage: Math.round(heapUsageData.reduce((sum, val) => sum + val, 0) / heapUsageData.length)
    },
    systemMemory: {
      usage: calculateStats(systemUsageData),
      peakUsage: Math.max(...systemUsageData),
      averageUsage: Math.round(systemUsageData.reduce((sum, val) => sum + val, 0) / systemUsageData.length)
    },
    memoryLeaks: detectMemoryLeaks(),
    totalSnapshots: loadTestState.memorySnapshots.length
  };
}

/**
 * Detect potential memory leaks
 */
function detectMemoryLeaks() {
  if (loadTestState.memorySnapshots.length < 10) {
    return { detected: false, reason: 'Insufficient data' };
  }
  
  const recentSnapshots = loadTestState.memorySnapshots.slice(-10);
  const oldSnapshots = loadTestState.memorySnapshots.slice(0, 10);
  
  const recentAvg = recentSnapshots.reduce((sum, s) => sum + s.nodeMemory.heapUsed, 0) / recentSnapshots.length;
  const oldAvg = oldSnapshots.reduce((sum, s) => sum + s.nodeMemory.heapUsed, 0) / oldSnapshots.length;
  
  const memoryGrowth = ((recentAvg - oldAvg) / oldAvg) * 100;
  
  return {
    detected: memoryGrowth > 50, // 50% growth threshold
    memoryGrowth: Math.round(memoryGrowth),
    recentAverage: Math.round(recentAvg),
    initialAverage: Math.round(oldAvg)
  };
}

/**
 * Analyze error patterns
 */
function analyzeErrors() {
  if (loadTestState.errorLog.length === 0) {
    return { totalErrors: 0, errorRate: 0 };
  }
  
  const errorsByOperation = {};
  const errorsByStatusCode = {};
  
  loadTestState.errorLog.forEach(error => {
    errorsByOperation[error.operation] = (errorsByOperation[error.operation] || 0) + 1;
    errorsByStatusCode[error.statusCode] = (errorsByStatusCode[error.statusCode] || 0) + 1;
  });
  
  return {
    totalErrors: loadTestState.errorLog.length,
    errorRate: Math.round((loadTestState.failedRequests / loadTestState.totalRequests) * 100),
    errorsByOperation,
    errorsByStatusCode,
    commonErrors: Object.entries(errorsByStatusCode)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
  };
}

/**
 * Generate performance recommendations
 */
function generateRecommendations() {
  const recommendations = [];
  
  // Success rate recommendations
  const successRate = (loadTestState.successfulRequests / loadTestState.totalRequests) * 100;
  if (successRate < 95) {
    recommendations.push({
      type: 'reliability',
      priority: 'high',
      message: `Success rate of ${Math.round(successRate)}% is below target of 95%. Investigate error patterns and implement retry mechanisms.`
    });
  }
  
  // Performance recommendations
  const analysisStats = calculateStats(loadTestState.responseTimeMetrics.analysis);
  if (analysisStats && analysisStats.p95 > 45000) {
    recommendations.push({
      type: 'performance',
      priority: 'medium',
      message: `Analysis service 95th percentile (${analysisStats.p95}ms) exceeds target of 45 seconds. Consider optimization or scaling.`
    });
  }
  
  const reportStats = calculateStats(loadTestState.responseTimeMetrics.report);
  if (reportStats && reportStats.p95 > 60000) {
    recommendations.push({
      type: 'performance',
      priority: 'medium',
      message: `Report service 95th percentile (${reportStats.p95}ms) exceeds target of 60 seconds. Consider optimization or scaling.`
    });
  }
  
  // Memory recommendations
  if (loadTestState.memorySnapshots.length > 0) {
    const memoryAnalysis = analyzeMemoryUsage();
    if (memoryAnalysis.memoryLeaks && memoryAnalysis.memoryLeaks.detected) {
      recommendations.push({
        type: 'memory',
        priority: 'high',
        message: `Potential memory leak detected with ${memoryAnalysis.memoryLeaks.memoryGrowth}% growth. Review memory management in services.`
      });
    }
  }
  
  // Performance alerts recommendations
  if (loadTestState.performanceAlerts.length > 10) {
    recommendations.push({
      type: 'monitoring',
      priority: 'medium',
      message: `${loadTestState.performanceAlerts.length} performance alerts generated. Review service performance under load.`
    });
  }
  
  return recommendations;
}

/**
 * Generate markdown report summary
 */
function generateMarkdownReport(reportData) {
  const timestamp = new Date().toISOString();
  
  return `# Consolidated Services Load Test Report

**Generated:** ${timestamp}  
**Test Duration:** ${Math.round(reportData.testMetadata.duration / 60000)} minutes  
**Target:** ${reportData.testMetadata.target}

## Executive Summary

- **Total Requests:** ${reportData.requestStatistics.total}
- **Success Rate:** ${reportData.requestStatistics.successRate}%
- **Failed Requests:** ${reportData.requestStatistics.failed}
- **Performance Alerts:** ${reportData.performanceAlerts.length}

## Performance Metrics

### Analysis Service
${reportData.performanceMetrics.analysis ? `
- **Average Response Time:** ${reportData.performanceMetrics.analysis.avg}ms
- **95th Percentile:** ${reportData.performanceMetrics.analysis.p95}ms
- **Max Response Time:** ${reportData.performanceMetrics.analysis.max}ms
- **Total Requests:** ${reportData.performanceMetrics.analysis.count}
` : 'No analysis requests completed'}

### Report Generation Service
${reportData.performanceMetrics.report ? `
- **Average Response Time:** ${reportData.performanceMetrics.report.avg}ms
- **95th Percentile:** ${reportData.performanceMetrics.report.p95}ms
- **Max Response Time:** ${reportData.performanceMetrics.report.max}ms
- **Total Requests:** ${reportData.performanceMetrics.report.count}
` : 'No report requests completed'}

### End-to-End Workflows
${reportData.performanceMetrics.workflow ? `
- **Average Workflow Time:** ${reportData.performanceMetrics.workflow.avg}ms
- **95th Percentile:** ${reportData.performanceMetrics.workflow.p95}ms
- **Max Workflow Time:** ${reportData.performanceMetrics.workflow.max}ms
- **Total Workflows:** ${reportData.performanceMetrics.workflow.count}
` : 'No workflow requests completed'}

## Memory Analysis

${reportData.memoryAnalysis.nodeMemory ? `
- **Peak Memory Usage:** ${reportData.memoryAnalysis.nodeMemory.peakUsage}MB
- **Average Memory Usage:** ${reportData.memoryAnalysis.nodeMemory.averageUsage}MB
- **Memory Leak Detection:** ${reportData.memoryAnalysis.memoryLeaks.detected ? '⚠️ Potential leak detected' : '✅ No leaks detected'}
` : 'Memory analysis unavailable'}

## Error Analysis

- **Total Errors:** ${reportData.errorAnalysis.totalErrors}
- **Error Rate:** ${reportData.errorAnalysis.errorRate}%

## Recommendations

${reportData.recommendations.map(rec => 
  `- **${rec.type.toUpperCase()} (${rec.priority}):** ${rec.message}`
).join('\n')}

## Performance Alerts

${reportData.performanceAlerts.length > 0 ? 
  reportData.performanceAlerts.slice(0, 10).map(alert => 
    `- ${alert.timestamp}: ${alert.message}`
  ).join('\n') : 
  'No performance alerts generated during test'
}

---

*Report generated by Consolidated Services Load Test Processor*
`;
}

// Export functions for Artillery
module.exports = {
  initializeLoadTest,
  setupAnalysisTest,
  setupReportTest,
  setupWorkflowTest,
  recordAnalysisMetrics,
  recordReportMetrics,
  recordWorkflowMetrics,
  recordHealthMetrics,
  finalizeLoadTest,
  generateLoadTestReport
}; 