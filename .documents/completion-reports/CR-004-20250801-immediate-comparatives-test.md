# Immediate Comparative Reports Test Plan

## Test Overview

**Feature:** Immediate comparative report generation for new projects  
**Test Scope:** End-to-end testing of immediate report generation functionality  
**Test Environment:** Development, Staging, Production  
**Test Duration:** 2 weeks (1 week dev testing, 1 week staging/integration)

## Test Strategy

### Testing Approach
- **Unit Testing:** Individual service methods and components
- **Integration Testing:** Cross-service communication and data flow
- **End-to-End Testing:** Complete user workflows
- **Performance Testing:** Load and stress testing
- **Regression Testing:** Ensure existing functionality remains intact

### Test Data Strategy
- **Realistic Test Data:** Use actual competitor websites and product data
- **Edge Case Data:** Empty, malformed, and incomplete data scenarios
- **Mock Data:** For consistent unit and integration testing
- **Performance Data:** Large datasets for load testing

## Unit Testing

### 3.1 InitialComparativeReportService Tests

**File:** `src/services/reports/__tests__/initialComparativeReportService.test.ts`

**Test Cases:**

#### 3.1.1 generateInitialComparativeReport()
```typescript
describe('generateInitialComparativeReport', () => {
  it('should generate report with complete data', async () => {
    // Test successful report generation with full competitor data
  });

  it('should generate report with partial competitor data', async () => {
    // Test graceful handling of incomplete competitor snapshots
  });

  it('should throw error when no product data available', async () => {
    // Test error handling for missing product information
  });

  it('should respect timeout configuration', async () => {
    // Test timeout handling during long-running operations
  });

  it('should apply fallback when competitor data unavailable', async () => {
    // Test fallback to basic report when competitor data missing
  });

  it('should generate report with fresh competitor snapshots', async () => {
    // Test report generation using newly captured competitor data
  });

  it('should handle mixed data scenarios (some fresh, some existing)', async () => {
    // Test report generation with partially fresh competitor data
  });

  it('should indicate data freshness in report metadata', async () => {
    // Test data freshness tracking and reporting
  });
});
```

#### 3.1.2 validateProjectReadiness()
```typescript
describe('validateProjectReadiness', () => {
  it('should return ready=true for complete project setup', async () => {
    // Project with product, competitors, and basic data
  });

  it('should return ready=false when missing critical data', async () => {
    // Project without product or competitors
  });

  it('should calculate accurate readiness score', async () => {
    // Test readiness scoring algorithm
  });

  it('should identify specific missing data', async () => {
    // Test detailed missing data identification
  });
});
```

#### 3.1.3 captureCompetitorSnapshots()
```typescript
describe('captureCompetitorSnapshots', () => {
  it('should capture snapshots for all project competitors', async () => {
    // Test successful snapshot capture for multiple competitors
  });

  it('should handle partial capture failures gracefully', async () => {
    // Test when some competitor snapshots fail but others succeed
  });

  it('should respect timeout for individual competitor captures', async () => {
    // Test timeout handling for slow competitor websites
  });

  it('should return detailed capture results with failures', async () => {
    // Test comprehensive result reporting including failed captures
  });

  it('should capture snapshots in parallel for performance', async () => {
    // Test parallel processing of multiple competitor snapshots
  });

  it('should retry failed captures with exponential backoff', async () => {
    // Test retry mechanisms for failed captures
  });

  it('should handle Single Page Applications (SPAs)', async () => {
    // Test snapshot capture with dynamic content loading
    // Verify JS execution and element waiting
  });

  it('should handle login-required sites gracefully', async () => {
    // Test capturing public pages when authentication required
    // Verify appropriate fallback to accessible content
  });

  it('should handle geo-restricted content', async () => {
    // Test capturing content that varies by geographic location
    // Verify fallback region handling
  });

  it('should respect high-security site policies', async () => {
    // Test handling of bot detection, CAPTCHA, and rate limiting
    // Verify respectful crawling practices
  });

  it('should handle mobile-only sites', async () => {
    // Test mobile viewport capture for mobile-first sites
    // Verify mobile-specific content handling
  });
});
```

#### 3.1.4 ensureBasicCompetitorData()
```typescript
describe('ensureBasicCompetitorData', () => {
  it('should prioritize fresh snapshots over existing data', async () => {
    // Test preference for newly captured snapshots
  });

  it('should fallback to existing data when capture fails', async () => {
    // Test fallback to cached competitor data
  });

  it('should handle complete data collection failures gracefully', async () => {
    // Test fallback when both fresh capture and existing data fail
  });
});
```

### 3.2 Competitor Snapshot Capture Tests

**File:** `src/services/__tests__/competitorSnapshotCapture.test.ts`

**Test Cases:**
```typescript
describe('CompetitorSnapshotCapture', () => {
  it('should capture snapshots for all competitors at project creation', async () => {
    // Test comprehensive snapshot capture workflow
  });

  it('should handle website timeouts gracefully', async () => {
    // Test timeout handling for slow competitor websites
  });

  it('should capture snapshots in parallel for performance', async () => {
    // Test concurrent snapshot capture operations
  });

  it('should store snapshot metadata correctly', async () => {
    // Test database storage of capture results and metadata
  });

  it('should handle various website types and structures', async () => {
    // Test snapshot capture across different website technologies
  });

  it('should retry failed captures with exponential backoff', async () => {
    // Test retry mechanisms for failed captures
  });

  it('should handle Single Page Applications (SPAs)', async () => {
    // Test snapshot capture with dynamic content loading
    // Verify JS execution and element waiting
  });

  it('should handle login-required sites gracefully', async () => {
    // Test capturing public pages when authentication required
    // Verify appropriate fallback to accessible content
  });

  it('should handle geo-restricted content', async () => {
    // Test capturing content that varies by geographic location
    // Verify fallback region handling
  });

  it('should respect high-security site policies', async () => {
    // Test handling of bot detection, CAPTCHA, and rate limiting
    // Verify respectful crawling practices
  });

  it('should handle mobile-only sites', async () => {
    // Test mobile viewport capture for mobile-first sites
    // Verify mobile-specific content handling
  });
});
```

### 3.3 Partial Data Report Generator Tests

**File:** `src/services/reports/__tests__/partialDataReportGenerator.test.ts`

**Test Cases:**
```typescript
describe('PartialDataReportGenerator', () => {
  it('should generate meaningful report with 60% data completeness', async () => {
    // Test report generation with fresh snapshot data
  });

  it('should clearly indicate data gaps and freshness in report', async () => {
    // Test gap identification and data age communication
  });

  it('should provide actionable recommendations despite partial data', async () => {
    // Test recommendation quality with limited data
  });

  it('should calculate accurate data completeness scores including freshness', async () => {
    // Test enhanced completeness scoring algorithm
  });

  it('should handle mixed fresh and stale data scenarios', async () => {
    // Test reports with combination of fresh and existing data
  });
});
```

### 3.4 Enhanced Project Creation API Tests

**File:** `src/app/api/projects/__tests__/route.initialReports.test.ts`

**Test Cases:**
```typescript
describe('POST /api/projects - Initial Reports', () => {
  it('should create project and generate initial report', async () => {
    // Test successful project creation with immediate report
  });

  it('should create project even when report generation fails', async () => {
    // Test project creation resilience
  });

  it('should return report status in response', async () => {
    // Test response format with report information
  });

  it('should handle different report template options', async () => {
    // Test template selection during project creation
  });

  it('should respect generateInitialReport flag', async () => {
    // Test opt-out functionality
  });

  it('should capture competitor snapshots before report generation', async () => {
    // Test snapshot capture integration in project creation flow
  });

  it('should return snapshot capture status in response', async () => {
    // Test API response includes snapshot capture results
  });

  it('should handle snapshot capture failures without breaking project creation', async () => {
    // Test resilience when snapshot capture fails
  });
});
```

## Integration Testing

### 4.1 Service Integration Tests

**File:** `src/__tests__/integration/immediateReportGeneration.integration.test.ts`

#### 4.1.1 Complete Workflow Tests
```typescript
describe('Immediate Report Generation Integration', () => {
  it('should complete full workflow with realistic data', async () => {
    // End-to-end test with actual competitor websites
    const projectData = {
      name: 'Test E-commerce Platform',
      productWebsite: 'https://example-ecommerce.com',
      competitorIds: ['competitor1', 'competitor2'],
      generateInitialReport: true,
      reportTemplate: 'comprehensive'
    };

    const response = await request(app)
      .post('/api/projects')
      .send(projectData)
      .expect(201);

    expect(response.body.reportGenerationInfo.initialReportGenerated).toBe(true);
    expect(response.body.reportGenerationInfo.reportId).toBeDefined();
    expect(response.body.reportGenerationInfo.competitorSnapshotsCaptured).toBe(true);
    expect(response.body.reportGenerationInfo.dataFreshness).toBe('new');

    // Verify report was actually created and stored with fresh data
    const report = await prisma.report.findUnique({
      where: { id: response.body.reportGenerationInfo.reportId }
    });

    expect(report).toBeDefined();
    expect(report.isInitialReport).toBe(true);
    expect(report.dataCompletenessScore).toBeGreaterThan(60);
    expect(report.dataFreshness).toBe('new');
    expect(report.competitorSnapshotsCaptured).toBeGreaterThan(0);
  });

  it('should handle concurrent project creations with snapshot capture', async () => {
    // Test multiple simultaneous project creations with competitor snapshot capture
  });

  it('should maintain data consistency across services including snapshots', async () => {
    // Test data integrity between project, product, snapshots, and report creation
  });

  it('should handle competitor snapshot capture failures gracefully', async () => {
    // Test workflow resilience when some competitor snapshots fail
  });
});
```

#### 4.1.2 Data Flow Tests
```typescript
describe('Data Flow Integration', () => {
  it('should correctly pass product data to report generation', async () => {
    // Test product data propagation through the system
  });

  it('should handle competitor data availability scenarios', async () => {
    // Test different competitor data states including fresh snapshots
  });

  it('should update report status correctly including snapshot capture', async () => {
    // Test status tracking throughout generation process including snapshot phase
  });

  it('should prioritize fresh snapshots over existing data', async () => {
    // Test data source prioritization logic
  });
});
```

### 4.2 Database Integration Tests

**File:** `src/__tests__/integration/database.immediateReports.test.ts`

**Test Cases:**
```typescript
describe('Database Integration - Immediate Reports', () => {
  it('should store initial reports with correct metadata', async () => {
    // Test database schema and data storage
  });

  it('should maintain referential integrity', async () => {
    // Test relationships between projects, products, and reports
  });

  it('should handle concurrent database operations', async () => {
    // Test database locking and consistency
  });

  it('should clean up failed report generation attempts', async () => {
    // Test cleanup of partial/failed report data
  });

  it('should store competitor snapshots with proper timestamps', async () => {
    // Test snapshot storage with accurate capture timestamps
  });

  it('should handle database constraints for concurrent snapshot captures', async () => {
    // Test database handling of simultaneous snapshot operations
  });
});
```

## End-to-End Testing

### 5.1 User Workflow Tests

**File:** `e2e/immediateReports.e2e.test.ts`

#### 5.1.1 Happy Path Tests
```typescript
describe('Immediate Reports E2E - Happy Path', () => {
  it('should create project and display initial report', async () => {
    // Navigate to project creation
    await page.goto('/projects/new');
    
    // Fill project form
    await page.fill('[data-testid="project-name"]', 'Test Project');
    await page.fill('[data-testid="product-website"]', 'https://example.com');
    await page.selectOption('[data-testid="report-template"]', 'comprehensive');
    
    // Submit form and verify redirect
    await page.click('[data-testid="create-project"]');
    await page.waitForURL(/\/projects\/.*/, { timeout: 30000 });
    
    // Verify initial report was generated with fresh data
    await expect(page.locator('[data-testid="initial-report-indicator"]')).toBeVisible();
    await expect(page.locator('[data-testid="report-completeness-score"]')).toBeVisible();
    await expect(page.locator('[data-testid="data-freshness-indicator"]')).toBeVisible();
    await expect(page.locator('[data-testid="snapshot-capture-status"]')).toBeVisible();
    
    // Verify report content is meaningful and includes fresh data indicators
    const reportContent = await page.locator('[data-testid="report-content"]').textContent();
    expect(reportContent).toContain('Executive Summary');
    expect(reportContent).toContain('Competitive Analysis');
    expect(reportContent).toContain('Fresh competitor data captured');
  });

  it('should show real-time report generation progress including snapshot capture', async () => {
    // Test progress indicators during both snapshot capture and report generation
  });

  it('should handle report generation timeout gracefully with snapshot capture', async () => {
    // Test timeout scenarios including snapshot capture phase
  });

  it('should display snapshot capture status in real-time', async () => {
    // Test real-time updates of competitor snapshot capture progress
  });
});
```

#### 5.1.2 Error Scenario Tests
```typescript
describe('Immediate Reports E2E - Error Scenarios', () => {
  it('should create project even when report generation fails', async () => {
    // Test project creation resilience
  });

  it('should display appropriate error messages', async () => {
    // Test error communication to users
  });

  it('should provide fallback options when reports fail', async () => {
    // Test fallback UI and scheduling options
  });
});
```

### 5.2 Cross-Browser Testing

**Browsers:** Chrome, Firefox, Safari, Edge  
**Test Cases:**
- Project creation with immediate report generation
- Real-time status updates
- Report display and formatting
- Error handling and messaging

## Performance Testing

### 6.1 Load Testing

**File:** `__tests__/performance/immediateReports.load.test.ts`

#### 6.1.1 Concurrent Project Creation with Snapshot Capture
```typescript
describe('Load Testing - Immediate Reports with Snapshots', () => {
  it('should handle 50 concurrent project creations with snapshot capture', async () => {
    const promises = [];
    
    for (let i = 0; i < 50; i++) {
      promises.push(createProjectWithReport({
        name: `Load Test Project ${i}`,
        productWebsite: `https://example${i}.com`,
        competitorIds: ['competitor1', 'competitor2'] // 2 competitors per project
      }));
    }
    
    const results = await Promise.allSettled(promises);
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    
    expect(successful).toBeGreaterThan(40); // 80% success rate minimum
    expect(failed).toBeLessThan(10); // 20% failure rate maximum
    
    // Verify average response time including snapshot capture
    const successfulResults = results
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value);
    
    const averageTime = successfulResults.reduce((sum, result) => 
      sum + result.responseTime, 0) / successfulResults.length;
    
    expect(averageTime).toBeLessThan(45000); // 45 seconds average with snapshots
    
    // Verify snapshot capture success rates
    const snapshotSuccessRate = successfulResults.reduce((sum, result) => 
      sum + (result.competitorSnapshotsCaptured ? 1 : 0), 0) / successfulResults.length;
    
    expect(snapshotSuccessRate).toBeGreaterThan(0.8); // 80% snapshot success rate
  });

  it('should maintain performance under sustained load with snapshots', async () => {
    // Test sustained load over 10 minutes including snapshot capture
  });

  it('should handle competitor website failures without affecting performance', async () => {
    // Test performance resilience when competitor websites are down
  });
});
```

#### 6.1.2 Memory and Resource Testing
```typescript
describe('Resource Usage Testing', () => {
  it('should not exceed memory limits during report generation with snapshots', async () => {
    // Monitor memory usage during concurrent report generation and snapshot capture
  });

  it('should clean up resources after report completion including snapshots', async () => {
    // Test resource cleanup and garbage collection for snapshots and reports
  });

  it('should limit concurrent snapshot captures to prevent resource exhaustion', async () => {
    // Test resource management for parallel snapshot operations
  });

  it('should handle large website snapshots efficiently', async () => {
    // Test memory usage with large competitor websites
  });

  it('should enforce rate limiting under load', async () => {
    // Test rate limiting enforcement during high concurrent usage
    const concurrentProjects = 10;
    const startTime = Date.now();
    
    const projectPromises = Array.from({ length: concurrentProjects }, (_, i) =>
      createProjectWithSnapshots({
        name: `Rate Limit Test ${i}`,
        competitors: ['example1.com', 'example2.com', 'example3.com'] // 3 competitors each
      })
    );
    
    const results = await Promise.allSettled(projectPromises);
    const endTime = Date.now();
    
    // Verify rate limiting was enforced (should take longer due to limits)
    expect(endTime - startTime).toBeGreaterThan(15000); // Should take at least 15 seconds due to rate limiting
    
    // Verify no more than 20 concurrent snapshots globally
    const maxConcurrentSnapshots = getMaxConcurrentSnapshots();
    expect(maxConcurrentSnapshots).toBeLessThanOrEqual(20);
  });

  it('should respect per-domain throttling', async () => {
    // Test per-domain throttling (1 request per domain every 10 seconds)
    const sameDomainRequests = [
      { domain: 'example.com', timestamp: Date.now() },
      { domain: 'example.com', timestamp: Date.now() + 5000 }, // 5 seconds later
      { domain: 'example.com', timestamp: Date.now() + 15000 } // 15 seconds later
    ];
    
    // First request should succeed, second should be throttled, third should succeed
    const results = await testDomainThrottling(sameDomainRequests);
    expect(results[0].success).toBe(true);
    expect(results[1].throttled).toBe(true);
    expect(results[2].success).toBe(true);
  });
});
```

### 6.2 Stress Testing

**Test Scenarios:**
- Maximum concurrent project creations with snapshot capture
- Large competitor datasets with multiple snapshots per project
- Complex product analysis requirements with fresh competitor data
- Extended report generation times including snapshot capture phase
- Competitor website timeouts and failures
- Mixed fresh and existing data scenarios

## Data Quality Testing

### 7.1 Data Completeness Tests

**File:** `__tests__/dataQuality/completeness.test.ts`

```typescript
describe('Data Completeness Testing with Fresh Snapshots', () => {
  it('should generate meaningful reports with fresh competitor snapshots', async () => {
    const projectWithSnapshots = {
      name: 'Fresh Data Test Project',
      productWebsite: 'https://fresh-example.com',
      competitorIds: ['competitor-1', 'competitor-2'],
      captureSnapshots: true
    };
    
    const report = await generateInitialReport(projectWithSnapshots);
    
    expect(report.dataCompletenessScore).toBeGreaterThan(60);
    expect(report.dataFreshness).toBe('new');
    expect(report.competitorSnapshotsCaptured).toBeGreaterThan(0);
    expect(report.sections.length).toBeGreaterThan(3);
    expect(report.executiveSummary).toBeDefined();
    expect(report.keyFindings.length).toBeGreaterThan(0);
  });

  it('should improve report quality with fresh competitor data', async () => {
    // Test report quality improvement with fresh snapshots vs existing data
  });

  it('should accurately calculate completeness scores including data freshness', async () => {
    // Test enhanced completeness scoring algorithm with freshness weighting
  });

  it('should handle partial snapshot capture gracefully', async () => {
    // Test quality scoring when some snapshots fail but others succeed
  });

  it('should indicate data freshness clearly in reports', async () => {
    // Test freshness indicators and timestamps in report content
  });
});
```

### 7.2 Data Accuracy and Freshness Tests

**Test Cases:**
- Verify competitor snapshot data accuracy and completeness
- Test product analysis accuracy with fresh competitor data
- Validate report recommendations relevance with current competitor state
- Check data freshness indicators and timestamps
- Compare fresh vs. existing data analysis quality
- Test snapshot capture metadata accuracy
- Verify competitor website change detection

## Security Testing

### 8.1 Input Validation Tests

**File:** `__tests__/security/inputValidation.test.ts`

```typescript
describe('Security - Input Validation', () => {
  it('should reject malicious product website URLs', async () => {
    const maliciousInputs = [
      'javascript:alert("xss")',
      'http://localhost:3000/admin',
      'file:///etc/passwd',
      'data:text/html,<script>alert("xss")</script>'
    ];
    
    for (const input of maliciousInputs) {
      await expect(createProject({
        name: 'Test Project',
        productWebsite: input
      })).rejects.toThrow();
    }
  });

  it('should sanitize project inputs properly', async () => {
    // Test input sanitization
  });

  it('should prevent injection attacks in report generation', async () => {
    // Test SQL injection and other injection attacks
  });
});
```

### 8.2 Authorization Tests

**Test Cases:**
- Verify project creation permissions
- Test report access controls
- Validate user isolation
- Check API authentication

### 8.3 Rate Limiting & Cost Control Tests

**File:** `__tests__/security/rateLimiting.test.ts`

```typescript
describe('Rate Limiting & Cost Controls', () => {
  it('should enforce concurrent snapshot capture limits per project', async () => {
    // Test maximum 5 concurrent snapshots per project
  });

  it('should enforce global concurrent snapshot limits', async () => {
    // Test maximum 20 concurrent snapshots across all projects
  });

  it('should throttle requests to same domain', async () => {
    // Test per-domain throttling (1 request per 10 seconds)
  });

  it('should enforce daily snapshot limits', async () => {
    // Test daily limits with configurable thresholds
  });

  it('should activate circuit breaker on high error rates', async () => {
    // Test circuit breaker when error rate > 50% over 5 minutes
  });

  it('should fall back gracefully when limits exceeded', async () => {
    // Test fallback to existing data when rate limits hit
  });
});
```

### 8.4 Data Retention & Privacy Tests

**File:** `__tests__/security/dataRetention.test.ts`

```typescript
describe('Data Retention & Privacy', () => {
  it('should respect robots.txt directives', async () => {
    // Test robots.txt compliance during snapshot capture
  });

  it('should automatically delete snapshots after retention period', async () => {
    // Test 30-day retention policy
  });

  it('should compress snapshots for storage optimization', async () => {
    // Test snapshot compression and storage efficiency
  });

  it('should clean up failed snapshot data after 7 days', async () => {
    // Test cleanup of partial/failed snapshot data
  });

  it('should anonymize captured data for analysis', async () => {
    // Test data anonymization processes
  });
});
```

## Regression Testing

### 9.1 Existing Functionality Tests

**Test Cases:**
- Verify existing project creation still works
- Test scheduled report generation remains intact
- Validate competitor management functionality
- Check report viewing and management features

### 9.2 Backward Compatibility Tests

**Test Cases:**
- Test API backward compatibility
- Verify database schema migrations
- Check existing reports remain accessible
- Validate configuration compatibility

## Monitoring and Observability Testing

### 10.1 Logging Tests

**File:** `__tests__/observability/logging.test.ts`

```typescript
describe('Logging and Monitoring', () => {
  it('should log report generation events correctly', async () => {
    // Test comprehensive logging throughout report generation
  });

  it('should track performance metrics', async () => {
    // Test metric collection and reporting
  });

  it('should alert on error conditions', async () => {
    // Test alerting system functionality
  });
});
```

### 10.2 Health Check Tests

**Test Cases:**
- API health endpoints
- Service dependency checks
- Database connectivity tests
- External service availability

## Test Data Management

### 11.1 Test Data Setup

**Realistic Test Scenarios:**
```typescript
const testScenarios = {
  ecommerce: {
    productWebsite: 'https://test-ecommerce.com',
    competitors: ['amazon.com', 'ebay.com', 'etsy.com'],
    expectedFeatures: ['product catalog', 'shopping cart', 'payment processing'],
    snapshotRequirements: {
      timeout: 15000, // 15 seconds for basic e-commerce sites
      retryAttempts: 2,
      expectedDataPoints: ['homepage', 'product pages', 'pricing']
    }
  },
  
  saas: {
    productWebsite: 'https://test-saas.com',
    competitors: ['salesforce.com', 'hubspot.com', 'pipedrive.com'],
    expectedFeatures: ['user management', 'dashboard', 'integrations'],
    snapshotRequirements: {
      timeout: 25000, // 25 seconds for complex SaaS sites
      retryAttempts: 3,
      expectedDataPoints: ['landing page', 'pricing', 'features', 'documentation']
    }
  },
  
  marketplace: {
    productWebsite: 'https://test-marketplace.com',
    competitors: ['uber.com', 'airbnb.com', 'upwork.com'],
    expectedFeatures: ['matching system', 'payment processing', 'reviews'],
    snapshotRequirements: {
      timeout: 30000, // 30 seconds for dynamic marketplace sites (matches implementation)
      retryAttempts: 2,
      expectedDataPoints: ['homepage', 'how it works', 'pricing', 'user onboarding']
    }
  }
};
```

### 11.2 Test Data Cleanup

**Automated Cleanup:**
- Remove test projects after test completion
- Clean up generated reports and snapshots
- Reset competitor data states and clear fresh snapshots
- Clear cached analysis results and snapshot metadata
- Remove temporary snapshot storage files
- Reset snapshot capture queues and status

## Test Automation

### 12.1 CI/CD Integration

**Pipeline Configuration:**
```yaml
test_immediate_reports:
  runs-on: ubuntu-latest
  steps:
    - name: Run Unit Tests
      run: npm run test:unit:immediate-reports
      
    - name: Run Integration Tests  
      run: npm run test:integration:immediate-reports
      
    - name: Run E2E Tests
      run: npm run test:e2e:immediate-reports
      
    - name: Run Performance Tests
      run: npm run test:performance:immediate-reports
      
    - name: Generate Test Reports
      run: npm run test:report
```

### 12.2 Test Reporting

**Metrics to Track:**
- Test coverage percentage including snapshot capture scenarios
- Test execution time including snapshot capture phase
- Failure rates by test category (snapshot capture vs. report generation)
- Performance benchmarks for concurrent snapshot operations
- Data quality metrics including freshness scores
- Snapshot capture success rates and failure reasons
- Resource usage during snapshot capture operations

## Test Environment Setup

### 13.1 Development Environment

**Requirements:**
- Local database with test competitor data and snapshot storage
- Mock external services for consistent testing
- Mock competitor websites for snapshot capture testing
- Development API keys for testing services
- Sample product websites for testing
- Snapshot capture service configuration
- Test competitor websites with various response times

### 13.2 Staging Environment

**Requirements:**
- Production-like data volumes including competitor snapshots
- External service integrations with real competitor websites
- Performance monitoring tools for snapshot capture operations
- User acceptance testing access
- Staging competitor snapshot storage
- Network monitoring for external website access

### 13.3 External Dependencies

The following services must be available in the test environments:

- **Redis** instance (`REDIS_URL`) powering the high-priority queue used by initial report generation.
- **Snapshot capture service** (Playwright / Puppeteer workers) with outbound internet access for competitor website screenshots.
- **WebSocket / SSE gateway** emitting `initial-report-status` events for real-time progress updates.
- **Feature flag management** (LaunchDarkly) to toggle the feature safely across environments.

### 13.4 Scope Adjustments (2025-07-01)

- **Cross-browser UI tests** have been moved to the Extended UI test suite and are **out-of-scope for v1**.
- **Stress tests** now target **20** concurrent project creations instead of 50 to match current infrastructure capacity.
- **Memory / resource-usage tests** are deferred until baseline metrics from the snapshot capture service are available.
- **New test coverage added**:
  - `GET /api/projects/{id}/initial-report-status` endpoint validation.
  - WebSocket real-time status event stream.
  - High-priority queue processing and fallback logic.

## Success Criteria

### 14.1 Test Coverage Targets

- **Unit Tests:** 90% code coverage
- **Integration Tests:** 85% critical path coverage
- **E2E Tests:** 100% user workflow coverage
- **Performance Tests:** All scenarios within SLA

### 14.2 Quality Gates

- **Functionality:** 95% test pass rate including snapshot capture scenarios
- **Performance:** Average response time < 45 seconds (including snapshot capture)
- **Peak Performance:** Maximum response time < 60 seconds (absolute limit)
- **Snapshot Capture:** 80% success rate for competitor snapshot capture
- **Individual Snapshots:** < 30 seconds per competitor (dynamic timeout based on site complexity)
- **Rate Limiting:** All rate limiting controls function correctly under load
- **Reliability:** 99% uptime during testing
- **Data Quality:** 90% reports meet minimum quality standards with fresh data
- **Data Freshness:** 85% of reports use fresh competitor snapshots
- **Data Retention:** Automated cleanup processes work correctly
- **Privacy Compliance:** Robots.txt and privacy controls tested and validated

## Test Schedule

### Week 1: Development Testing
- Days 1-2: Unit test development and execution
- Days 3-4: Integration test development and execution
- Day 5: Initial performance testing

### Week 2: System Testing
- Days 1-2: End-to-end test execution
- Days 3-4: Security and regression testing
- Day 5: Performance and stress testing

### Week 3: User Acceptance Testing
- User feedback collection
- Bug fixes and retesting
- Final validation

---

**Document Version:** 1.1  
**Last Updated:** 2025-07-01  
**Test Lead:** TBD  
**Estimated Test Effort:** 3 weeks  
**Test Environment Requirements:** Development, Staging, Production access 

## 🧪 **Critical Testing Checklist**

**Unit Testing Phase:**
- [ ] All service methods tested with mocked dependencies
- [ ] Rate limiting logic validated with unit tests
- [ ] Data retention and cleanup functions tested
- [ ] Website-specific capture scenarios covered
- [ ] Error handling for all failure modes tested

**Integration Testing Phase:**
- [ ] End-to-end project creation with snapshot capture
- [ ] Rate limiting enforcement under concurrent load
- [ ] Queue management and priority handling
- [ ] Database integrity with concurrent operations
- [ ] WebSocket real-time status updates tested

**Performance Testing Phase:**
- [ ] 20 concurrent project creations with snapshots
- [ ] Rate limiting prevents resource exhaustion
- [ ] Memory usage remains within acceptable limits
- [ ] Individual competitor timeouts respected
- [ ] Graceful degradation under high load

**Security & Compliance Testing:**
- [ ] Robots.txt compliance verified
- [ ] Data privacy controls tested
- [ ] Input validation prevents security issues
- [ ] Authorization controls validated
- [ ] Data retention policies enforced

**Production Readiness:**
- [ ] All monitoring and alerting systems tested
- [ ] Feature flag toggling works correctly
- [ ] Rollback procedures validated
- [ ] Cost monitoring thresholds verified
- [ ] Documentation and runbooks complete 