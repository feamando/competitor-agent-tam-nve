# Load Testing Guide

## Overview

This document outlines the load testing strategy and implementation for the Competitor Research Agent application. Load testing is crucial to ensure the application can handle expected user loads and identify performance bottlenecks before they impact real users.

## Load Testing Framework

The load testing framework consists of three main components:

1. **API Load Testing**: Tests the backend API endpoints under various load conditions using Artillery.
2. **General Application Load Testing**: Tests the full application stack with simulated user scenarios.
3. **Browser-Based Load Testing**: Simulates real user interactions through headless browsers using Playwright.

## Test Types and Scenarios

### API Load Tests

API tests target specific endpoints to measure their performance characteristics:

- **Critical API Endpoints**: Tests core endpoints like `/api/health`, `/api/projects`, `/api/competitors`, and `/api/reports`.
- **Project Creation**: Tests the creation of new projects and associated resources.
- **Report Generation**: Tests the resource-intensive report generation process.
- **Performance Monitoring**: Tests monitoring endpoints under load.

### General Application Tests

Full-stack tests that simulate complete user flows:

- **Homepage and Navigation**: Tests basic page navigation and content loading.
- **Project Creation and View**: Tests the end-to-end project creation workflow.
- **API Endpoints**: Tests all API endpoints in sequence to simulate realistic user activity.

### Browser-Based Tests

Tests that use real browser instances to simulate user behavior:

- **Basic Navigation**: Tests page-to-page navigation in the application.
- **Project Creation**: Tests form filling and submission for creating projects.
- **Report View**: Tests loading and viewing reports.

## Running Load Tests

### Prerequisites

- Node.js 16+ and npm installed
- Artillery installed: `npm install -g artillery`
- Application dependencies installed: `npm install`

### Running Full Test Suite

To run the complete load testing suite:

```bash
./scripts/run-load-tests.sh
```

This script will:
1. Start the application (if not already running)
2. Run API load tests
3. Run general application load tests
4. Run browser-based load tests
5. Generate a unified HTML report

### Running Individual Tests

#### API Load Tests

```bash
npm run test:load:api
```

#### General Load Tests

```bash
npm run test:load
```

#### Browser Load Tests

```bash
npm run test:load:browser
```

### Configuration

Load tests can be configured through environment variables:

- `BASE_URL`: Target URL for testing (default: http://localhost:3000)
- `CONCURRENT_USERS`: Number of concurrent users (default varies by test type)
- `TEST_DURATION`: Duration of the test in seconds
- `RAMP_UP_TIME`: Time in seconds to gradually ramp up to full load
- `HEADLESS`: Whether to run browser tests in headless mode (true/false)

## Test Reports

After running tests, reports are generated in:

```
load-tests/reports/<timestamp>/
```

The report directory contains:

- `index.html`: Main HTML report combining all test results
- `api-load-test-results.json`: Detailed API test results
- `general-load-test-results.json`: Detailed general test results
- `browser-load-test-report.json`: Detailed browser test results
- `load-test.log`: Combined test logs

## Performance Baselines

These baselines should be maintained to ensure application performance:

| Metric | Target |
|--------|--------|
| API Response Time (P95) | < 2000ms |
| Page Load Time | < 3000ms |
| Max Error Rate | < 5% |
| Max Memory Usage | < 1GB |
| Concurrent Users Supported | 50+ |

## CI/CD Integration

Load tests are integrated into the CI/CD pipeline:

- **Pull Requests**: Basic load tests with reduced concurrency
- **Release Branches**: Full load test suite
- **Production Deployments**: Extended load tests with production-level concurrency

Configuration for CI/CD is in:

```
load-tests/config/ci.yml
```

## Common Issues and Solutions

### High Response Times

If response times exceed targets:
- Check database queries for optimization opportunities
- Verify indexes are being used effectively
- Consider implementing caching for frequently accessed data
- Check for N+1 query issues

### High Error Rates

If error rates exceed targets:
- Check server logs for exceptions
- Verify connection pooling settings
- Check for resource constraints (memory, connections)
- Verify timeout configurations

### Memory Leaks

If memory usage grows over time:
- Use the memory monitoring endpoints to track usage patterns
- Review resource cleanup in services, especially for long-running operations
- Check for retained references in closures

## Extending the Framework

### Adding New Scenarios

1. For Artillery tests:
   - Add new scenarios in `load-tests/config/artillery.yml`

2. For Browser tests:
   - Add new scenarios in `load-tests/browser-load-test.js`

### Adding Custom Metrics

Custom metrics can be added:

1. For Artillery tests:
   - Use the processor functions in `load-tests/scenarios/customFunctions.js`

2. For Browser tests:
   - Add metrics collection in the scenario functions

## Best Practices

1. **Start Small**: Begin with low concurrency and ramp up gradually
2. **Isolate Components**: Test API endpoints individually before testing full flows
3. **Use Realistic Data**: Generate test data that resembles production patterns
4. **Monitor Resources**: Watch CPU, memory, and database connections during tests
5. **Regular Testing**: Run load tests regularly, not just before releases

## Conclusion

The load testing framework provides comprehensive coverage of the application's performance characteristics. By regularly running these tests and analyzing the results, we can ensure the application meets its performance targets and scales effectively under load. 