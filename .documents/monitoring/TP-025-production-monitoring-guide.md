# TP-025 Production Monitoring Guide

## Overview
- **Fix:** Report Data Collection and Aggregation Fix
- **Issue Resolved:** `competitorSnapshotsCaptured: 0` despite existing snapshots
- **Impact:** Enables full comparative reports instead of emergency fallbacks
- **Monitoring Required:** Track `capturedCount` values and report generation patterns

## Key Metrics to Monitor

### 1. Smart Data Collection Logs
**Log Pattern:** `Smart data collection completed successfully`
**Key Fields to Monitor:**
```json
{
  "result": {
    "capturedCount": 5,          // NEW: Should show actual count, not 0
    "dataCompletenessScore": 85,
    "dataFreshness": "mixed",
    "priorityBreakdown": {...}
  }
}
```

**Expected Values:**
- `capturedCount > 0` for projects with competitor snapshots
- `capturedCount = 0` only for projects without competitor data

### 2. Report Generation Metrics
**Monitor:**
- Ratio of COMPARATIVE vs INDIVIDUAL reports
- Emergency fallback report frequency
- AI/Bedrock analysis engagement rates

**Expected Changes Post-Deployment:**
- ↑ Increase in COMPARATIVE report generation
- ↓ Decrease in emergency fallback reports  
- ↑ Increase in AI analysis utilization

### 3. Project-Specific Monitoring
**Test Case:** Project `cmdykesxt000jl81e01j69soo`
- **Before Fix:** Always generated emergency fallback reports
- **After Fix:** Should generate full comparative reports
- **Key Indicator:** `competitorSnapshotsCaptured: 5` in report metadata

## Alert Conditions

### 🚨 Critical Alerts
1. **Regression Detection:**
   - `capturedCount` consistently showing 0 for projects with known competitor snapshots
   - Emergency fallback rate returning to pre-fix levels

2. **Performance Issues:**
   - Report generation time significantly increased (>20% degradation)
   - Memory usage spikes in SmartDataCollectionService

### ⚠️ Warning Alerts  
1. **Data Quality:**
   - `capturedCount` values seem lower than expected competitor counts
   - Inconsistent `dataCompletenessScore` calculations

2. **Integration Issues:**
   - New types of errors in SmartDataCollectionService logs
   - Unexpected fallback to basic collection methods

## Monitoring Queries

### Log Search Queries

**1. Verify Fix is Working:**
```
service:"SmartDataCollectionService" AND 
message:"Smart data collection completed successfully" AND 
result.capturedCount:>0
```

**2. Detect Regression:**
```
service:"SmartDataCollectionService" AND 
result.capturedCount:0 AND 
competitorData.totalCompetitors:>0
```

**3. Monitor Specific Project:**
```
projectId:"cmdykesxt000jl81e01j69soo" AND 
(capturedCount OR competitorSnapshotsCaptured)
```

### Database Queries (if needed)

**1. Check Report Types Distribution:**
```sql
SELECT reportType, COUNT(*) as count
FROM reports 
WHERE createdAt > '2025-08-05' 
GROUP BY reportType;
```

**2. Verify Competitor Snapshots Captured:**
```sql
SELECT competitorSnapshotsCaptured, COUNT(*) as count
FROM reports 
WHERE createdAt > '2025-08-05' 
  AND competitorSnapshotsCaptured >= 0
GROUP BY competitorSnapshotsCaptured
ORDER BY competitorSnapshotsCaptured;
```

## Success Indicators

### ✅ Fix Working Correctly
1. **Logging Evidence:**
   - `capturedCount` values match actual competitor snapshot counts
   - Smart data collection logs show successful aggregation

2. **Report Generation:**
   - Projects with competitor snapshots generate COMPARATIVE reports
   - `competitorSnapshotsCaptured` shows actual values (not 0)
   - AI/Bedrock analysis logs show increased engagement

3. **User Impact:**
   - Reduced emergency fallback reports
   - More comprehensive competitive analysis content
   - Users see richer comparative insights

### ❌ Issues to Investigate
1. **Potential Regression:**
   - `capturedCount` values returning to 0
   - Emergency fallback reports increasing
   - COMPARATIVE → INDIVIDUAL report ratio reversing

2. **Integration Problems:**
   - New error patterns in collection logs
   - Performance degradation in report generation
   - Inconsistent data flow between services

## Rollback Indicators

**Consider rollback if:**
1. Critical regression detected (capturedCount returning to 0)
2. Significant performance degradation (>50% slowdown)
3. New critical errors introduced
4. Overall report quality decreases

**Rollback Process:**
1. Revert changes in `src/services/reports/smartDataCollectionService.ts`
2. Remove `capturedCount` field from interface and calculation
3. Deploy and monitor for stability restoration

## Post-Deployment Validation Checklist

### First 24 Hours
- [ ] Verify `capturedCount` values appear in logs
- [ ] Check project `cmdykesxt000jl81e01j69soo` generates comparative report
- [ ] Monitor for new error patterns
- [ ] Validate performance metrics remain stable

### First Week
- [ ] Analyze COMPARATIVE vs INDIVIDUAL report ratio
- [ ] Track emergency fallback frequency
- [ ] Monitor AI/Bedrock analysis engagement
- [ ] Review user feedback on report quality

### First Month
- [ ] Comprehensive analysis of fix impact
- [ ] Performance trend analysis
- [ ] User satisfaction metrics
- [ ] Plan for CR-117 stability improvements

## Troubleshooting Guide

### Issue: `capturedCount` showing 0 despite competitor snapshots
**Investigation Steps:**
1. Check if competitor snapshots actually exist in database
2. Verify `freshSnapshots` and `existingSnapshots` values in logs
3. Confirm calculation logic: `capturedCount = fresh + existing`
4. Review competitor data collection priority system

### Issue: Performance degradation after deployment
**Investigation Steps:**
1. Compare report generation times before/after
2. Check memory usage patterns in SmartDataCollectionService
3. Review database query performance
4. Analyze logging overhead impact

### Issue: Increased error rates
**Investigation Steps:**
1. Review new error patterns in logs
2. Check if errors related to TypeScript interface changes
3. Verify all services properly handle new `capturedCount` field
4. Confirm no breaking changes in data flow

## Contact Information
- **Primary:** Development team responsible for TP-025 implementation
- **Secondary:** Infrastructure team for monitoring setup
- **Escalation:** Product team for user impact assessment

---

**Document Version:** 1.0  
**Last Updated:** 2025-08-05  
**Next Review:** Post-deployment validation complete 