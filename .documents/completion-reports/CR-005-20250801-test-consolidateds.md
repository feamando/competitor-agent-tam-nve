# Test Plan: Consolidated Competitive Reports

## **Overview**
Test plan for implementing consolidated comparative reports instead of individual competitor reports.

## **Test Scope**

### **In Scope**
- ✅ Comparative Report API endpoint functionality
- ✅ Chat interface integration with comparative reports
- ✅ UI display of consolidated reports
- ✅ Database operations for comparative reports
- ✅ End-to-end chat-to-report workflow

### **Out of Scope**
- Individual report functionality (maintaining backward compatibility)
- Existing competitor management features
- Authentication and authorization

---

## **Unit Testing Strategy**

### **1. API Endpoint Tests**
**File:** `src/__tests__/api/reports/comparative.test.ts`

```typescript
describe('Comparative Report API', () => {
  // Test successful comparative report generation
  test('generates report for valid project with products and competitors')
  
  // Test validation scenarios  
  test('rejects request without project ID')
  test('rejects project without products')
  test('rejects project without competitors')
  test('handles project not found')
  
  // Test error handling
  test('handles report generation failures gracefully')
  test('returns proper error codes and messages')
  
  // Test GET endpoint
  test('fetches comparative reports list')
  test('handles database errors in fetch')
})
```

### **2. Report Generator Tests**
**File:** `src/__tests__/lib/reports-comparative.test.ts`

```typescript
describe('ReportGenerator - Comparative Reports', () => {
  // Test core functionality
  test('generateComparativeReport creates single consolidated report')
  test('report includes all competitors in analysis')
  test('report sections are properly structured')
  
  // Test integration with AI services
  test('calls ComparativeAnalysisService with correct parameters')
  test('handles AI service failures')
  
  // Test database operations
  test('saves report with COMPARATIVE type')
  test('creates proper report metadata')
})
```

### **3. Chat Interface Tests**
**File:** `src/__tests__/lib/chat/conversation-comparative.test.ts`

```typescript
describe('ConversationManager - Comparative Reports', () => {
  // Test chat flow
  test('triggers comparative report generation in step 4')
  test('calls correct API endpoint with project ID')
  test('handles successful report generation response')
  test('handles report generation failures')
  
  // Test state management
  test('updates chat state with report information')
  test('progresses to correct next step after report generation')
})
```

---

## **Integration Testing Strategy**

### **1. End-to-End Chat Flow**
**File:** `src/__tests__/integration/chat-to-comparative-report.test.ts`

```typescript
describe('Chat to Comparative Report Integration', () => {
  test('complete chat flow generates comparative report', async () => {
    // 1. Start chat conversation
    // 2. Provide project information  
    // 3. Provide product information
    // 4. Confirm analysis request
    // 5. Verify comparative report created
    // 6. Verify report appears in reports list
  })
  
  test('chat handles report generation failures gracefully')
  test('multiple chat sessions work independently')
})
```

### **2. API Integration**
**File:** `src/__tests__/integration/comparative-api-integration.test.ts`

```typescript
describe('Comparative Report API Integration', () => {
  test('API integrates with real database operations')
  test('API calls ReportGenerator correctly')
  test('API handles concurrent requests')
  test('API properly logs all operations')
})
```

### **3. UI Integration**
**File:** `src/__tests__/integration/ui-comparative-reports.test.ts`

```typescript
describe('UI Comparative Reports Integration', () => {
  test('reports page displays comparative reports')
  test('comparative reports have distinct UI elements')
  test('report viewer handles comparative report format')
  test('download functionality works for comparative reports')
})
```

---

## **Manual Testing Checklist**

### **Functional Testing**

#### **Chat Interface**
- [ ] Start new project via chat
- [ ] Complete full conversation flow
- [ ] Verify comparative report is generated (not individual reports)
- [ ] Check report appears in reports list
- [ ] Verify chat shows success message with report details

#### **API Testing**
- [ ] Test `/api/reports/comparative` POST with valid project
- [ ] Test `/api/reports/comparative` GET for report listing
- [ ] Verify proper error responses for invalid requests
- [ ] Check correlation IDs are present in all responses

#### **UI Testing**
- [ ] Reports page shows comparative reports prominently
- [ ] Comparative reports display differently from individual reports
- [ ] Report viewer opens comparative reports correctly
- [ ] Download functionality works for comparative reports

### **Error Scenarios**
- [ ] Project without products shows proper error
- [ ] Project without competitors shows proper error
- [ ] Non-existent project ID shows 404
- [ ] AI service failure handled gracefully
- [ ] Database connection issues handled

### **Performance Testing**
- [ ] Comparative report generation completes within 30 seconds
- [ ] API responds within acceptable timeframes
- [ ] UI loads reports list quickly
- [ ] No memory leaks during report generation

---

## **Test Data Setup**

### **Required Test Data**
```typescript
// Mock project with products and competitors
const testProject = {
  id: 'test-project-123',
  name: 'Test Project',
  products: [{
    id: 'product-1',
    name: 'Test Product',
    website: 'https://testproduct.com',
    industry: 'Technology',
    positioning: 'Premium solution'
  }],
  competitors: [
    {
      id: 'competitor-1', 
      name: 'Competitor A',
      website: 'https://competitora.com'
    },
    {
      id: 'competitor-2',
      name: 'Competitor B', 
      website: 'https://competitorb.com'
    }
  ]
}
```

### **Database Test Setup**
```sql
-- Create test project
INSERT INTO projects (id, name, status, priority, userId) 
VALUES ('test-project-123', 'Test Project', 'ACTIVE', 'MEDIUM', 'test-user');

-- Create test product
INSERT INTO products (id, name, website, industry, positioning, projectId)
VALUES ('product-1', 'Test Product', 'https://testproduct.com', 'Technology', 'Premium solution', 'test-project-123');

-- Create test competitors
INSERT INTO competitors (id, name, website, industry)
VALUES 
  ('competitor-1', 'Competitor A', 'https://competitora.com', 'Technology'),
  ('competitor-2', 'Competitor B', 'https://competitorb.com', 'Technology');

-- Link competitors to project
INSERT INTO _CompetitorToProject (A, B)
VALUES 
  ('competitor-1', 'test-project-123'),
  ('competitor-2', 'test-project-123');
```

---

## **Test Environment Setup**

### **Local Development**
```bash
# Setup test database
npm run test:db:setup

# Run unit tests
npm run test:unit

# Run integration tests  
npm run test:integration

# Run all tests
npm run test

# Generate coverage report
npm run test:coverage
```

### **CI/CD Pipeline**
```yaml
# .github/workflows/test-comparative-reports.yml
name: Test Comparative Reports
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Setup Node.js
        uses: actions/setup-node@v2
        with:
          node-version: '18'
      - name: Install dependencies
        run: npm ci
      - name: Setup test database
        run: npm run test:db:setup
      - name: Run unit tests
        run: npm run test:unit
      - name: Run integration tests
        run: npm run test:integration
      - name: Check coverage
        run: npm run test:coverage
```

---

## **Success Criteria**

### **Unit Tests**
- [ ] All new comparative report functionality has 95%+ test coverage
- [ ] All edge cases and error scenarios are tested
- [ ] Tests run in under 30 seconds total

### **Integration Tests**
- [ ] End-to-end chat flow works correctly
- [ ] API integrates properly with database and services
- [ ] UI displays comparative reports correctly

### **Manual Tests**
- [ ] Users can generate comparative reports via chat
- [ ] Reports appear as single consolidated documents
- [ ] No individual competitor reports are generated
- [ ] Error handling provides clear user feedback

### **Performance**
- [ ] Comparative report generation < 30 seconds
- [ ] API response times < 5 seconds
- [ ] UI loads reports list < 2 seconds

---

## **Rollback Testing**

### **Rollback Scenarios**
- [ ] Disable comparative reports feature flag
- [ ] Fall back to individual report generation
- [ ] Verify no data corruption during rollback
- [ ] Confirm existing functionality still works

### **Rollback Triggers**
- Test failure rate > 10%
- Performance degradation > 50%
- Critical bugs in production
- User complaints about missing functionality

---

## **Test Execution Timeline**

### **Phase 1: Unit Tests (Day 1)**
- Write and execute API endpoint tests
- Write and execute report generator tests
- Write and execute chat interface tests
- Achieve 95% code coverage

### **Phase 2: Integration Tests (Day 2)**
- Setup test data and environment
- Write and execute end-to-end tests
- Write and execute API integration tests
- Write and execute UI integration tests

### **Phase 3: Manual Testing (Day 3)**
- Execute functional testing checklist
- Test error scenarios
- Performance testing
- User acceptance testing

### **Phase 4: Final Validation (Day 4)**
- Run full test suite
- Manual verification of all features
- Performance benchmarking
- Documentation updates

---

## **Test Documentation**

### **Test Reports**
- Unit test coverage reports
- Integration test results
- Performance test benchmarks
- Manual test execution logs

### **Bug Tracking**
- Issues found during testing
- Severity and priority classification
- Resolution status and verification
- Regression testing requirements

This test plan ensures comprehensive validation of the consolidated comparative reports feature while maintaining quality and performance standards. 