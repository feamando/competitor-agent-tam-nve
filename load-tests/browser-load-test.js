/**
 * Browser Load Testing Script
 * Task 6.3: Load Testing
 * 
 * This script runs concurrent browser instances to simulate real user load
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Configuration
const CONFIG = {
  baseUrl: process.env.BASE_URL || 'http://localhost:3000',
  concurrentUsers: process.env.CONCURRENT_USERS ? parseInt(process.env.CONCURRENT_USERS) : 5,
  duration: process.env.TEST_DURATION ? parseInt(process.env.TEST_DURATION) : 60, // seconds
  rampUpTime: process.env.RAMP_UP_TIME ? parseInt(process.env.RAMP_UP_TIME) : 10, // seconds
  scenarios: ['basic-navigation', 'project-creation', 'report-view'],
  reportsDir: path.join(__dirname, 'reports', `browser-test-${Date.now()}`),
  screenshotsDir: path.join(__dirname, 'reports', `browser-test-${Date.now()}`, 'screenshots'),
  headless: process.env.HEADLESS !== 'false', // Run headless by default
};

// Ensure report directory exists
if (!fs.existsSync(CONFIG.reportsDir)) {
  fs.mkdirSync(CONFIG.reportsDir, { recursive: true });
}
if (!fs.existsSync(CONFIG.screenshotsDir)) {
  fs.mkdirSync(CONFIG.screenshotsDir, { recursive: true });
}

// Test scenarios
const scenarios = {
  'basic-navigation': async (page, metrics) => {
    const startTime = Date.now();
    
    try {
      // Go to homepage
      await page.goto(CONFIG.baseUrl);
      metrics.push({ action: 'navigate-to-home', duration: Date.now() - startTime, success: true });
      
      // Navigate to projects page
      const projectsStart = Date.now();
      await page.click('a[href*="/projects"]');
      await page.waitForSelector('h1:has-text("Projects")');
      metrics.push({ action: 'navigate-to-projects', duration: Date.now() - projectsStart, success: true });
      
      // Navigate to reports page
      const reportsStart = Date.now();
      await page.click('a[href*="/reports"]');
      await page.waitForSelector('h1:has-text("Reports")');
      metrics.push({ action: 'navigate-to-reports', duration: Date.now() - reportsStart, success: true });
    } catch (error) {
      console.error('Error in basic-navigation:', error);
      await page.screenshot({ path: path.join(CONFIG.screenshotsDir, `error-basic-navigation-${Date.now()}.png`) });
      metrics.push({ action: 'error', duration: Date.now() - startTime, success: false, error: error.message });
    }
    
    return metrics;
  },
  
  'project-creation': async (page, metrics) => {
    const startTime = Date.now();
    
    try {
      // Go to project creation page
      await page.goto(`${CONFIG.baseUrl}/projects/new`);
      metrics.push({ action: 'navigate-to-new-project', duration: Date.now() - startTime, success: true });
      
      // Fill project form
      const formStart = Date.now();
      const projectName = `Load Test Project ${Date.now()}`;
      await page.fill('[data-testid="project-name"]', projectName);
      await page.fill('[data-testid="product-website"]', `https://loadtest-${Date.now()}.com`);
      await page.fill('[data-testid="competitor-name-0"]', `Competitor ${Date.now()}`);
      await page.fill('[data-testid="competitor-website-0"]', `https://competitor-${Date.now()}.com`);
      metrics.push({ action: 'fill-project-form', duration: Date.now() - formStart, success: true });
      
      // Submit form
      const submitStart = Date.now();
      await page.click('[data-testid="create-project"]');
      await page.waitForURL(/\/projects\/[a-zA-Z0-9-]+$/);
      metrics.push({ action: 'submit-project-form', duration: Date.now() - submitStart, success: true });
      
      // Check if project details page loads
      await page.waitForSelector('[data-testid="project-details"]');
      metrics.push({ action: 'project-creation-complete', duration: Date.now() - startTime, success: true });
    } catch (error) {
      console.error('Error in project-creation:', error);
      await page.screenshot({ path: path.join(CONFIG.screenshotsDir, `error-project-creation-${Date.now()}.png`) });
      metrics.push({ action: 'error', duration: Date.now() - startTime, success: false, error: error.message });
    }
    
    return metrics;
  },
  
  'report-view': async (page, metrics) => {
    const startTime = Date.now();
    
    try {
      // Go to reports page
      await page.goto(`${CONFIG.baseUrl}/reports`);
      metrics.push({ action: 'navigate-to-reports', duration: Date.now() - startTime, success: true });
      
      // Check if reports list loads
      await page.waitForSelector('[data-testid="reports-list"]');
      metrics.push({ action: 'reports-list-loaded', duration: Date.now() - startTime, success: true });
      
      // Try to click on first report if available
      const reportLinks = await page.$$('[data-testid="report-link"]');
      if (reportLinks.length > 0) {
        const viewReportStart = Date.now();
        await reportLinks[0].click();
        await page.waitForSelector('[data-testid="report-content"]');
        metrics.push({ action: 'view-report-details', duration: Date.now() - viewReportStart, success: true });
      }
    } catch (error) {
      console.error('Error in report-view:', error);
      await page.screenshot({ path: path.join(CONFIG.screenshotsDir, `error-report-view-${Date.now()}.png`) });
      metrics.push({ action: 'error', duration: Date.now() - startTime, success: false, error: error.message });
    }
    
    return metrics;
  }
};

// Run a single user session with a given scenario
async function runUserSession(userId, scenarioName) {
  console.log(`Starting user session ${userId} with scenario: ${scenarioName}`);
  const browser = await chromium.launch({ headless: CONFIG.headless });
  const context = await browser.newContext();
  const page = await context.newPage();
  const metrics = [];
  
  try {
    // Run the selected scenario
    if (scenarios[scenarioName]) {
      await scenarios[scenarioName](page, metrics);
    } else {
      console.error(`Unknown scenario: ${scenarioName}`);
    }
  } catch (error) {
    console.error(`Error in user session ${userId}:`, error);
  } finally {
    await browser.close();
  }
  
  return { userId, scenario: scenarioName, metrics };
}

// Main function to run the load test
async function runLoadTest() {
  console.log(`Starting browser load test with ${CONFIG.concurrentUsers} concurrent users`);
  console.log(`Test will run for ${CONFIG.duration} seconds`);
  
  const startTime = Date.now();
  const allResults = [];
  const userPromises = [];
  
  // Calculate interval for user ramp-up
  const rampUpInterval = (CONFIG.rampUpTime * 1000) / CONFIG.concurrentUsers;
  
  // Start user sessions with a delay for ramp-up
  for (let i = 0; i < CONFIG.concurrentUsers; i++) {
    const scenarioName = CONFIG.scenarios[i % CONFIG.scenarios.length];
    
    // Add delay for ramping up users
    const delay = i * rampUpInterval;
    
    userPromises.push(
      new Promise(resolve => {
        setTimeout(async () => {
          const result = await runUserSession(i + 1, scenarioName);
          allResults.push(result);
          resolve();
        }, delay);
      })
    );
  }
  
  // Wait for all users to finish or timeout
  const timeoutPromise = new Promise(resolve => {
    setTimeout(() => {
      console.log(`Test duration (${CONFIG.duration}s) reached, finishing...`);
      resolve();
    }, CONFIG.duration * 1000);
  });
  
  await Promise.race([
    Promise.all(userPromises),
    timeoutPromise
  ]);
  
  // Calculate and save results
  const testDuration = (Date.now() - startTime) / 1000;
  console.log(`Browser load test completed in ${testDuration.toFixed(2)} seconds`);
  
  // Aggregate metrics
  const aggregatedMetrics = {};
  let totalRequests = 0;
  let successfulRequests = 0;
  
  allResults.forEach(result => {
    result.metrics.forEach(metric => {
      totalRequests++;
      if (metric.success) successfulRequests++;
      
      if (!aggregatedMetrics[metric.action]) {
        aggregatedMetrics[metric.action] = {
          count: 0,
          totalDuration: 0,
          successCount: 0,
          failures: 0
        };
      }
      
      aggregatedMetrics[metric.action].count++;
      aggregatedMetrics[metric.action].totalDuration += metric.duration;
      
      if (metric.success) {
        aggregatedMetrics[metric.action].successCount++;
      } else {
        aggregatedMetrics[metric.action].failures++;
      }
    });
  });
  
  // Calculate averages
  Object.keys(aggregatedMetrics).forEach(action => {
    const metrics = aggregatedMetrics[action];
    metrics.avgDuration = Math.round(metrics.totalDuration / metrics.count);
    metrics.successRate = Math.round((metrics.successCount / metrics.count) * 100);
  });
  
  // Generate report
  const report = {
    timestamp: new Date().toISOString(),
    config: CONFIG,
    summary: {
      testDuration,
      concurrentUsers: CONFIG.concurrentUsers,
      totalRequests,
      successRate: Math.round((successfulRequests / totalRequests) * 100),
      userSessions: allResults.length,
    },
    systemInfo: {
      platform: os.platform(),
      cpus: os.cpus().length,
      memory: Math.round(os.totalmem() / (1024 * 1024 * 1024)),
      hostname: os.hostname()
    },
    metrics: aggregatedMetrics,
  };
  
  // Save report
  const reportPath = path.join(CONFIG.reportsDir, 'browser-load-test-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`Report saved to ${reportPath}`);
  
  // Print summary
  console.log('\n============ LOAD TEST SUMMARY ============');
  console.log(`Total requests: ${totalRequests}`);
  console.log(`Success rate: ${report.summary.successRate}%`);
  console.log(`Concurrent users: ${CONFIG.concurrentUsers}`);
  console.log(`Test duration: ${testDuration.toFixed(2)} seconds`);
  console.log('===========================================\n');
  
  return report;
}

// Execute if run directly
if (require.main === module) {
  runLoadTest()
    .then(() => {
      process.exit(0);
    })
    .catch(error => {
      console.error('Error running browser load test:', error);
      process.exit(1);
    });
}

module.exports = {
  runLoadTest,
  runUserSession,
  scenarios,
  CONFIG
}; 