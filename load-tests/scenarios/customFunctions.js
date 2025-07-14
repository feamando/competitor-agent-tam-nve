/**
 * Custom functions for Artillery load tests
 * Task 6.3: Load Testing
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Generate a random string of specified length
function generateRandomString(context, events, done) {
  const length = context.vars.$randomStringLength || 10;
  context.vars.randomString = crypto.randomBytes(Math.ceil(length / 2))
    .toString('hex')
    .substring(0, length);
  return done();
}

// Generate a random company name for test data
function generateCompanyName(context, events, done) {
  const prefixes = ['Acme', 'Global', 'Elite', 'Prime', 'Summit', 'Pioneer', 'Tech', 'Alpha', 'Nexus', 'Omega'];
  const suffixes = ['Corp', 'Inc', 'Ltd', 'Solutions', 'Systems', 'Technologies', 'Services', 'Industries', 'Partners'];
  
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
  
  context.vars.companyName = `${prefix} ${suffix}`;
  return done();
}

// Generate a random website URL
function generateWebsiteUrl(context, events, done) {
  const domains = ['com', 'io', 'net', 'org', 'co', 'app'];
  
  const companyName = context.vars.companyName || 
    `company-${crypto.randomBytes(4).toString('hex')}`;
    
  const domain = domains[Math.floor(Math.random() * domains.length)];
  const url = `https://${companyName.toLowerCase().replace(/\s+/g, '-')}.${domain}`;
  
  context.vars.websiteUrl = url;
  return done();
}

// Record response time metrics
function recordResponseMetrics(requestParams, response, context, events, done) {
  const url = requestParams.url;
  const duration = response.timings.phases.total;
  const statusCode = response.statusCode;
  
  // Add metrics to context if they don't exist
  if (!context.vars.responseMetrics) {
    context.vars.responseMetrics = [];
  }
  
  context.vars.responseMetrics.push({
    url,
    duration,
    statusCode,
    timestamp: Date.now()
  });
  
  return done();
}

// Log results periodically
function logPerformanceMetrics(context, events, done) {
  if (context.vars.responseMetrics && context.vars.responseMetrics.length > 0) {
    // Calculate average response time
    const totalDuration = context.vars.responseMetrics.reduce(
      (sum, metric) => sum + metric.duration, 0
    );
    const avgDuration = totalDuration / context.vars.responseMetrics.length;
    
    // Count status codes
    const statusCodes = context.vars.responseMetrics.reduce((acc, metric) => {
      acc[metric.statusCode] = (acc[metric.statusCode] || 0) + 1;
      return acc;
    }, {});
    
    // Log summary
    console.log('-------------------------------------');
    console.log(`Performance metrics - ${new Date().toISOString()}`);
    console.log(`Total requests: ${context.vars.responseMetrics.length}`);
    console.log(`Average response time: ${Math.round(avgDuration)}ms`);
    console.log('Status codes:', statusCodes);
    console.log('-------------------------------------');
    
    // Export metrics to file if needed
    const testId = process.env.TEST_ID || Date.now();
    const metricsDir = path.join(__dirname, '..', 'reports');
    
    if (!fs.existsSync(metricsDir)) {
      fs.mkdirSync(metricsDir, { recursive: true });
    }
    
    const metricsFile = path.join(metricsDir, `custom-metrics-${testId}.json`);
    
    fs.writeFileSync(
      metricsFile,
      JSON.stringify({
        timestamp: Date.now(),
        metrics: {
          totalRequests: context.vars.responseMetrics.length,
          averageResponseTime: avgDuration,
          statusCodes
        },
        details: context.vars.responseMetrics
      }, null, 2)
    );
    
    // Reset metrics after logging
    context.vars.responseMetrics = [];
  }
  
  return done();
}

// Handle authentication if needed
function authenticate(context, events, done) {
  // This would be replaced with actual authentication logic
  // For example, making a login request and storing the token
  context.vars.authToken = `mock-token-${Date.now()}`;
  return done();
}

// Export functions
module.exports = {
  generateRandomString,
  generateCompanyName,
  generateWebsiteUrl,
  recordResponseMetrics,
  logPerformanceMetrics,
  authenticate,
  
  // Helper function to create a random string (used in scenario templates)
  $randomString: function(length) {
    return crypto.randomBytes(Math.ceil(length / 2))
      .toString('hex')
      .substring(0, length);
  },
  
  // Helper function to get current timestamp
  $timestamp: function() {
    return Date.now();
  }
}; 