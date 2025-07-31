# Manual Testing Scenarios for Snapshot Collection System

**Task 8.3: Manual testing scenarios for each requirement**

This document provides comprehensive manual testing scenarios to validate all snapshot collection requirements and functionality implemented in the system.

## Test Environment Setup

### Prerequisites
- Development environment running with all services active
- Database accessible and populated with test data
- Access to API endpoints and monitoring dashboards
- Browser developer tools available for network inspection

### Test Data Setup
```sql
-- Create test project
INSERT INTO Project (id, name) VALUES ('manual-test-proj', 'Manual Test Project');

-- Create test competitors with different states
INSERT INTO Competitor (id, name, website, industry) VALUES 
  ('fresh-comp', 'Fresh Competitor', 'https://fresh.example.com', 'Technology'),
  ('stale-comp', 'Stale Competitor', 'https://stale.example.com', 'Technology'),
  ('missing-comp', 'Missing Competitor', 'https://missing.example.com', 'Technology'),
  ('error-comp', 'Error Competitor', 'https://error.example.com', 'Technology');

-- Create project-competitor relationships
INSERT INTO ProjectCompetitor (projectId, competitorId) VALUES 
  ('manual-test-proj', 'fresh-comp'),
  ('manual-test-proj', 'stale-comp'),
  ('manual-test-proj', 'missing-comp'),
  ('manual-test-proj', 'error-comp');

-- Create snapshots with different ages
INSERT INTO Snapshot (id, competitorId, captureSuccess, createdAt) VALUES
  ('fresh-snap', 'fresh-comp', true, NOW() - INTERVAL '2 days'),
  ('stale-snap', 'stale-comp', true, NOW() - INTERVAL '10 days');
```

---

## Scenario 1a: New Competitor Addition Trigger

### **Test Case 1a.1: Immediate Snapshot on Competitor Creation**

**Objective**: Verify that adding a new competitor triggers immediate snapshot collection

**Steps**:
1. Navigate to `/competitors` page
2. Click "Add New Competitor" button
3. Fill out competitor form:
   - Name: "Manual Test Competitor"
   - Website: "https://manual-test.example.com"
   - Industry: "Technology"
4. Submit the form
5. Monitor browser network tab for API calls
6. Check system logs for snapshot trigger events
7. Wait 30 seconds and refresh competitor list

**Expected Results**:
- ✅ Competitor is created successfully
- ✅ API response returns immediately (< 2 seconds)
- ✅ Background snapshot collection is triggered (visible in logs)
- ✅ Snapshot appears in database within 30 seconds
- ✅ No error messages displayed to user

**Verification Queries**:
```sql
-- Check competitor was created
SELECT * FROM Competitor WHERE name = 'Manual Test Competitor';

-- Check snapshot was triggered
SELECT * FROM Snapshot WHERE competitorId = [competitor-id] ORDER BY createdAt DESC LIMIT 1;
```

### **Test Case 1a.2: Error Handling During Snapshot Trigger**

**Objective**: Verify graceful handling when snapshot collection fails

**Steps**:
1. Temporarily block access to target website (use browser dev tools or firewall)
2. Add new competitor with blocked website URL
3. Submit competitor creation form
4. Monitor logs and UI for error handling

**Expected Results**:
- ✅ Competitor creation succeeds despite snapshot failure
- ✅ Error is logged but not shown to user
- ✅ System schedules retry for snapshot collection
- ✅ No UI errors or crashes

---

## Scenario 1b: Missing Snapshot Detection

### **Test Case 1b.1: Report Generation Detects Missing Snapshots**

**Objective**: Verify missing snapshot detection during report generation

**Steps**:
1. Navigate to `/projects/manual-test-proj/reports`
2. Click "Generate Initial Report" button
3. Monitor browser network tab for API calls
4. Watch for snapshot collection triggers in logs
5. Wait for report generation to complete

**Expected Results**:
- ✅ Missing snapshots detected during report preparation
- ✅ Automatic snapshot collection triggered for missing competitors
- ✅ Report generation continues even if some snapshots fail
- ✅ Report indicates which competitors have missing data

**Verification Steps**:
```bash
# Check logs for missing snapshot detection
grep "missing snapshots" /var/log/app.log

# Verify snapshot collection was triggered
curl GET /api/snapshot-monitoring?type=alerts
```

### **Test Case 1b.2: Batch Processing of Missing Snapshots**

**Objective**: Verify efficient batch processing of multiple missing snapshots

**Steps**:
1. Create 5 new competitors without snapshots
2. Trigger report generation for project
3. Monitor system performance during batch processing
4. Check snapshot collection progress

**Expected Results**:
- ✅ All missing snapshots detected in single operation
- ✅ Batch processing triggered (not individual requests)
- ✅ System remains responsive during batch operation
- ✅ Progress visible in monitoring dashboard

---

## Scenario 1c: Stale Snapshot Detection and Refresh

### **Test Case 1c.1: Stale Snapshot Detection**

**Objective**: Verify stale snapshots are detected and refreshed

**Steps**:
1. Navigate to `/api/snapshot-monitoring?type=health`
2. Check current system health metrics
3. Navigate to project with 10-day-old snapshots
4. Generate new report with `requireFreshSnapshots: true`
5. Monitor refresh trigger in logs

**Expected Results**:
- ✅ Stale snapshots (>7 days) detected
- ✅ Automatic refresh triggered during report generation
- ✅ System waits appropriate time for refresh to begin
- ✅ Report uses refreshed data when available

**API Testing**:
```bash
# Check stale snapshot detection
curl -X GET "/api/projects/manual-test-proj/snapshots/stale?maxAge=7"

# Trigger manual refresh
curl -X POST "/api/projects/manual-test-proj/snapshots/refresh" \
  -H "Content-Type: application/json" \
  -d '{"competitorIds": ["stale-comp"]}'
```

### **Test Case 1c.2: Configurable Staleness Threshold**

**Objective**: Verify staleness threshold can be configured

**Steps**:
1. Set environment variable: `SNAPSHOT_STALENESS_THRESHOLD_DAYS=3`
2. Restart application
3. Navigate to monitoring dashboard
4. Check that 5-day-old snapshots are now marked as stale
5. Reset to default (7 days) and verify

**Expected Results**:
- ✅ Environment variable changes staleness threshold
- ✅ Dashboard reflects new threshold
- ✅ Refresh triggers adjust to new threshold
- ✅ Default value works when env var not set

---

## Scenario 1d: Fresh Snapshot Optimization

### **Test Case 1d.1: Fresh Snapshot Skip Optimization**

**Objective**: Verify fresh snapshots are not unnecessarily re-collected

**Steps**:
1. Ensure competitor has fresh snapshot (< 7 days)
2. Navigate to `/api/competitors/[id]/snapshot` endpoint
3. Attempt to trigger manual snapshot
4. Monitor logs for optimization messages
5. Check efficiency metrics

**Expected Results**:
- ✅ Fresh snapshot collection is skipped
- ✅ Optimization message logged with reason
- ✅ Resource usage minimal for skipped operation
- ✅ Efficiency metrics show optimization

**API Testing**:
```bash
# Try to trigger snapshot for fresh competitor
curl -X POST "/api/competitors/fresh-comp/snapshot" \
  -H "Content-Type: application/json"

# Check efficiency metrics
curl -X GET "/api/snapshot-efficiency?overview=true"
```

### **Test Case 1d.2: Caching Performance**

**Objective**: Verify freshness check caching improves performance

**Steps**:
1. Clear any existing caches
2. Make 10 consecutive freshness checks for same competitor
3. Monitor database query count and response times
4. Check cache hit ratio in metrics

**Expected Results**:
- ✅ First check queries database
- ✅ Subsequent checks use cache (faster response)
- ✅ Cache hit ratio > 80% after multiple checks
- ✅ Overall performance improvement measurable

---

## Integration Testing Scenarios

### **Test Case INT.1: Complete Workflow Integration**

**Objective**: Verify all scenarios work together in realistic workflow

**Steps**:
1. Create new project: "Integration Test Project"
2. Add 3 new competitors (triggers immediate snapshots)
3. Wait 1 minute, then generate initial report
4. Manually age some snapshots in database (simulate time passage)
5. Generate another report (should trigger stale refresh)
6. Add more competitors and generate final report

**Expected Results**:
- ✅ All trigger scenarios activate appropriately
- ✅ Reports improve in quality with better data
- ✅ System optimizes unnecessary operations
- ✅ No conflicts between different triggers

### **Test Case INT.2: High Load Simulation**

**Objective**: Verify system handles concurrent operations gracefully

**Steps**:
1. Create 20 competitors simultaneously (multiple browser tabs)
2. Trigger 5 report generations concurrently
3. Monitor system resources and response times
4. Check for any race conditions or conflicts

**Expected Results**:
- ✅ All operations complete successfully
- ✅ No deadlocks or race conditions
- ✅ Response times remain reasonable
- ✅ Monitoring systems capture all events

---

## Error Handling and Fallback Testing

### **Test Case ERR.1: Network Failure Handling**

**Objective**: Verify graceful handling of network failures

**Steps**:
1. Block internet access temporarily
2. Attempt to create competitors and generate reports
3. Restore internet access
4. Check recovery behavior

**Expected Results**:
- ✅ Operations continue with available data
- ✅ Errors logged but don't crash system
- ✅ Automatic retry when connectivity restored
- ✅ Users see appropriate status messages

### **Test Case ERR.2: Fallback Mechanism Testing**

**Objective**: Verify fallback strategies activate correctly

**Steps**:
1. Create competitor with persistently failing website
2. Force 15+ consecutive snapshot failures
3. Generate report that requires this competitor's data
4. Verify fallback content is used

**Expected Results**:
- ✅ Fallback strategy selected automatically
- ✅ Report generated with fallback content
- ✅ Confidence level indicated appropriately
- ✅ Fallback source documented clearly

**Fallback Strategy Testing**:
```bash
# Trigger manual fallback test
curl -X POST "/api/snapshot-monitoring" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "trigger_fallback",
    "competitorId": "error-comp",
    "operationType": "snapshot_collection"
  }'
```

---

## Monitoring and Alerting Testing

### **Test Case MON.1: Alert System Testing**

**Objective**: Verify monitoring and alerting system functions correctly

**Steps**:
1. Force multiple snapshot failures (6+ in 30 minutes)
2. Check monitoring dashboard for alert escalation
3. Verify warning alerts appear first, then critical
4. Resolve alerts manually and verify resolution

**Expected Results**:
- ✅ Warning alerts trigger at 5 failures
- ✅ Critical alerts trigger at 10 failures
- ✅ Alerts can be resolved manually
- ✅ System health metrics update correctly

### **Test Case MON.2: Dashboard Functionality**

**Objective**: Verify monitoring dashboards display accurate information

**Steps**:
1. Navigate to `/api/snapshot-efficiency`
2. Generate various types of snapshot operations
3. Refresh dashboard and verify metrics update
4. Test different time ranges (24h, 7d, 30d)

**Expected Results**:
- ✅ Real-time metrics reflect actual system state
- ✅ Historical data shows correct trends
- ✅ Efficiency optimizations are tracked
- ✅ All time ranges function correctly

---

## Performance Testing Scenarios

### **Test Case PERF.1: Batch Operation Performance**

**Objective**: Verify batch operations meet performance requirements

**Steps**:
1. Create project with 50 competitors
2. Trigger batch snapshot operations
3. Measure total completion time
4. Monitor resource usage during operation

**Expected Results**:
- ✅ Batch operations complete within 5 minutes for 10 competitors
- ✅ Memory usage remains stable
- ✅ Database connections managed efficiently
- ✅ System remains responsive during operations

### **Test Case PERF.2: Concurrent User Simulation**

**Objective**: Verify system handles multiple simultaneous users

**Steps**:
1. Simulate 5 users creating competitors simultaneously
2. Have each user generate reports concurrently
3. Monitor system performance and error rates
4. Check for any performance degradation

**Expected Results**:
- ✅ All user operations complete successfully
- ✅ Response times increase gracefully under load
- ✅ No errors due to concurrent access
- ✅ Resource usage scales appropriately

---

## Validation Checklist

### Functional Requirements Validation
- [ ] **1a**: New competitor addition triggers immediate snapshot
- [ ] **1b**: Missing snapshots detected during report generation
- [ ] **1c**: Stale snapshots (>7 days) detected and refreshed
- [ ] **1d**: Fresh snapshots (<7 days) skipped to avoid waste
- [ ] Fixed snapshot detection counts existing snapshots correctly
- [ ] Reports use real data instead of template content

### Non-Functional Requirements Validation
- [ ] Snapshot operations don't block user interface
- [ ] Batch operations complete within reasonable time limits
- [ ] Error handling manages network failures gracefully
- [ ] Logging provides sufficient debugging information
- [ ] Performance impact on report generation is minimal
- [ ] Memory usage remains stable during operations

### System Integration Validation
- [ ] All four trigger scenarios work together seamlessly
- [ ] Monitoring and alerting capture all relevant events
- [ ] Fallback mechanisms activate when appropriate
- [ ] Dashboard metrics accurately reflect system state
- [ ] API endpoints respond correctly under load

### User Experience Validation
- [ ] Users see appropriate progress indicators
- [ ] Error messages are clear and actionable
- [ ] System remains responsive during background operations
- [ ] Report quality improves with real competitive data

---

## Test Execution Log Template

```
Test Date: _______________
Tester: __________________
Environment: _____________

Scenario 1a Tests:
□ Test Case 1a.1: _____ (Pass/Fail) - Notes: _________________
□ Test Case 1a.2: _____ (Pass/Fail) - Notes: _________________

Scenario 1b Tests:
□ Test Case 1b.1: _____ (Pass/Fail) - Notes: _________________
□ Test Case 1b.2: _____ (Pass/Fail) - Notes: _________________

Scenario 1c Tests:
□ Test Case 1c.1: _____ (Pass/Fail) - Notes: _________________
□ Test Case 1c.2: _____ (Pass/Fail) - Notes: _________________

Scenario 1d Tests:
□ Test Case 1d.1: _____ (Pass/Fail) - Notes: _________________
□ Test Case 1d.2: _____ (Pass/Fail) - Notes: _________________

Integration Tests:
□ Test Case INT.1: _____ (Pass/Fail) - Notes: _________________
□ Test Case INT.2: _____ (Pass/Fail) - Notes: _________________

Error Handling Tests:
□ Test Case ERR.1: _____ (Pass/Fail) - Notes: _________________
□ Test Case ERR.2: _____ (Pass/Fail) - Notes: _________________

Monitoring Tests:
□ Test Case MON.1: _____ (Pass/Fail) - Notes: _________________
□ Test Case MON.2: _____ (Pass/Fail) - Notes: _________________

Performance Tests:
□ Test Case PERF.1: _____ (Pass/Fail) - Notes: ________________
□ Test Case PERF.2: _____ (Pass/Fail) - Notes: ________________

Overall Test Result: _____ (Pass/Fail)
Issues Found: ________________________________________
Recommendations: ____________________________________
```

---

## Troubleshooting Guide

### Common Issues and Solutions

**Issue**: Snapshots not triggering after competitor creation
- **Check**: Verify competitor creation API includes snapshot trigger
- **Check**: Look for errors in application logs
- **Check**: Ensure background services are running

**Issue**: Stale snapshots not being refreshed
- **Check**: Verify staleness threshold configuration
- **Check**: Confirm report generation includes freshness check
- **Check**: Monitor logs for refresh trigger events

**Issue**: Fresh snapshots being collected unnecessarily
- **Check**: Verify optimization logic is enabled
- **Check**: Check freshness cache configuration
- **Check**: Review efficiency metrics for optimization rate

**Issue**: Monitoring alerts not triggering
- **Check**: Verify alert thresholds are configured correctly
- **Check**: Ensure failure events are being recorded
- **Check**: Confirm monitoring service is running

### Performance Troubleshooting

**Slow Response Times**:
- Check database query performance
- Monitor resource usage during operations
- Verify batch operations are optimized
- Review caching effectiveness

**High Resource Usage**:
- Check for memory leaks in long-running processes
- Monitor database connection pool usage
- Review batch operation sizing
- Verify proper cleanup of resources

**Inconsistent Behavior**:
- Check for race conditions in concurrent operations
- Verify proper error handling and recovery
- Review system logs for intermittent issues
- Test under various load conditions 