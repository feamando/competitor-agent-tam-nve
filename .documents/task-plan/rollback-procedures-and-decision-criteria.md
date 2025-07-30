# Rollback Procedures and Decision Criteria

**Document Version:** 1.0  
**Task:** 8.3 - Rollback Testing  
**Date:** July 28, 2025  
**Status:** Production Ready

## 🎯 Overview

This document defines the procedures, decision criteria, and automated processes for rolling back from consolidated services (Analysis v1.5 & Reporting v1.5) to legacy services in case of production issues.

## 🚨 Rollback Decision Criteria

### Automatic Rollback Triggers

The following conditions will trigger an **automatic rollback** to legacy services:

#### 1. Error Rate Thresholds
- **Analysis Service Error Rate > 10%** over 5-minute window
- **Reporting Service Error Rate > 10%** over 5-minute window
- **Overall System Error Rate > 5%** over 3-minute window

#### 2. Response Time Thresholds
- **Analysis Service P95 > 90 seconds** over 5-minute window
- **Reporting Service P95 > 120 seconds** over 5-minute window
- **Critical API Endpoints P95 > 60 seconds** over 3-minute window

#### 3. Resource Utilization Thresholds
- **Memory Usage > 2GB** sustained for 3 minutes
- **CPU Usage > 95%** sustained for 2 minutes
- **Database Connection Pool > 90%** for 2 minutes

#### 4. Service Health Failures
- **Health Check Failures > 3 consecutive** within 2 minutes
- **Service Unavailable (503) > 5 requests** within 1 minute
- **Database Connectivity Failures** detected

### Manual Rollback Triggers

The following conditions require **manual assessment** and potential rollback:

#### 1. Quality Degradation
- Customer reports of analysis quality issues
- Significant deviation in report content quality
- Data consistency issues between services

#### 2. Performance Degradation
- Gradual performance decline over time
- Memory leak detection
- Increased resource consumption trends

#### 3. Business Impact
- Customer-facing functionality failures
- Critical workflow interruptions
- Revenue-impacting service disruptions

#### 4. Security Concerns
- Potential security vulnerabilities discovered
- Unusual traffic patterns or potential attacks
- Data integrity concerns

## 🔄 Rollback Procedures

### Phase 1: Emergency Rollback (< 2 minutes)

#### Immediate Actions
1. **Disable Consolidated Services**
   ```bash
   # Set feature flags for emergency rollback
   curl -X POST "http://localhost:3000/api/admin/feature-flags" \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer $ADMIN_TOKEN" \
     -d '{
       "CONSOLIDATED_ANALYSIS_V15": false,
       "CONSOLIDATED_REPORTING_V15": false,
       "LEGACY_SERVICES_FALLBACK": true,
       "reason": "Emergency rollback - [REASON]"
     }'
   ```

2. **Verify Legacy Services Health**
   ```bash
   # Check legacy service availability
   curl -f http://localhost:3000/api/health/legacy
   curl -f http://localhost:3000/api/analysis/health
   curl -f http://localhost:3000/api/reports/health
   ```

3. **Monitor Traffic Shift**
   - Verify traffic is routing to legacy services
   - Check error rates drop within 1 minute
   - Confirm response times improve

#### Emergency Rollback Script
```bash
#!/bin/bash
# Emergency rollback to legacy services

echo "🚨 EMERGENCY ROLLBACK INITIATED"
echo "Timestamp: $(date)"
echo "Reason: $1"

# Set feature flags
kubectl set env deployment/api-service \
  CONSOLIDATED_ANALYSIS_V15=false \
  CONSOLIDATED_REPORTING_V15=false \
  LEGACY_SERVICES_FALLBACK=true

# Wait for deployment rollout
kubectl rollout status deployment/api-service --timeout=60s

# Verify health
if curl -f http://localhost:3000/api/health > /dev/null 2>&1; then
  echo "✅ Emergency rollback completed successfully"
  exit 0
else
  echo "❌ Emergency rollback failed - manual intervention required"
  exit 1
fi
```

### Phase 2: Controlled Rollback (< 10 minutes)

#### Detailed Steps
1. **Document Rollback Reason**
   - Create incident ticket with detailed reason
   - Capture metrics and logs from the time of issue
   - Document timeline of events

2. **Gradual Traffic Shift**
   ```bash
   # Gradual rollback with traffic splitting
   # Step 1: 25% traffic to legacy
   kubectl patch service api-service -p '{"spec":{"selector":{"version":"legacy","weight":"25"}}}'
   
   # Step 2: Monitor for 2 minutes, then 50%
   kubectl patch service api-service -p '{"spec":{"selector":{"version":"legacy","weight":"50"}}}'
   
   # Step 3: Monitor for 2 minutes, then 100%
   kubectl patch service api-service -p '{"spec":{"selector":{"version":"legacy","weight":"100"}}}'
   ```

3. **Data Consistency Validation**
   ```bash
   # Run data consistency checks
   npm run test:rollback:consistency
   
   # Validate critical workflows
   npm run test:rollback:workflows
   ```

4. **Service Health Monitoring**
   - Monitor legacy service metrics for 10 minutes
   - Verify error rates remain < 2%
   - Confirm response times meet SLA requirements

### Phase 3: Post-Rollback Validation (< 30 minutes)

#### Validation Steps
1. **End-to-End Testing**
   ```bash
   # Run comprehensive rollback validation
   npm run test:rollback:validation
   ```

2. **Performance Verification**
   - Verify P95 response times < baseline + 10%
   - Confirm memory usage < 1GB
   - Validate throughput meets requirements

3. **User Experience Validation**
   - Test critical user journeys
   - Verify report generation functionality
   - Confirm analysis quality meets standards

4. **Data Integrity Checks**
   - Compare analysis results pre/post rollback
   - Verify report content consistency
   - Validate database state

## 🎯 Rollforward Procedures

### When to Rollforward
- Issue causing rollback has been resolved
- Consolidated services pass all validation tests
- Performance metrics show improvement
- Quality assurance tests pass

### Rollforward Process
1. **Pre-Rollforward Checklist**
   - [ ] Issue root cause identified and fixed
   - [ ] Consolidated services deployed with fix
   - [ ] All validation tests pass
   - [ ] Monitoring systems confirmed healthy
   - [ ] Stakeholder approval obtained

2. **Gradual Rollforward**
   ```bash
   # Step 1: Enable consolidated services for 10% traffic
   kubectl set env deployment/api-service \
     CONSOLIDATED_ANALYSIS_V15=true \
     CONSOLIDATED_REPORTING_V15=true \
     LEGACY_SERVICES_FALLBACK=false \
     TRAFFIC_SPLIT_CONSOLIDATED=10
   
   # Step 2: Monitor for 10 minutes, increase to 50%
   kubectl set env deployment/api-service TRAFFIC_SPLIT_CONSOLIDATED=50
   
   # Step 3: Monitor for 10 minutes, increase to 100%
   kubectl set env deployment/api-service TRAFFIC_SPLIT_CONSOLIDATED=100
   ```

3. **Post-Rollforward Monitoring**
   - Monitor for 1 hour with enhanced alerting
   - Validate performance metrics
   - Confirm user feedback is positive

## 📊 Monitoring and Alerting

### Key Metrics to Monitor

#### Performance Metrics
- **Response Time P95/P99** for all endpoints
- **Throughput (req/sec)** for critical operations
- **Error Rate (%)** across all services
- **Memory Usage (MB)** for service processes
- **CPU Utilization (%)** across instances

#### Quality Metrics
- **Analysis Confidence Scores** trending
- **Report Generation Success Rate**
- **Data Consistency Scores**
- **User-Reported Issues** count

#### Infrastructure Metrics
- **Database Connection Pool** utilization
- **Queue Length** for async operations
- **Network Latency** between services
- **Disk I/O** for report generation

### Alert Configuration

#### Critical Alerts (Immediate Response)
```yaml
# Analysis Service Error Rate
- alert: AnalysisServiceHighErrorRate
  expr: rate(http_requests_total{service="analysis",status=~"5.."}[5m]) > 0.10
  for: 2m
  severity: critical
  action: automatic_rollback

# Response Time Alert
- alert: AnalysisServiceHighLatency
  expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket{service="analysis"}[5m])) > 90
  for: 3m
  severity: critical
  action: automatic_rollback
```

#### Warning Alerts (Manual Assessment)
```yaml
# Memory Usage Alert
- alert: AnalysisServiceHighMemory
  expr: process_resident_memory_bytes{service="analysis"} > 1.5e9
  for: 5m
  severity: warning
  action: manual_assessment

# Quality Degradation Alert
- alert: AnalysisQualityDegradation
  expr: avg(analysis_confidence_score) < 0.7
  for: 10m
  severity: warning
  action: manual_assessment
```

## 🔧 Automation Scripts

### Rollback Test Script
```bash
#!/bin/bash
# Automated rollback testing

echo "🔄 Starting Rollback Testing"

# Run rollback tests
npm run test:rollback:procedures
npm run test:rollback:consistency
npm run test:rollback:load

# Generate rollback report
npm run test:rollback:report

echo "✅ Rollback testing completed"
```

### Health Check Script
```bash
#!/bin/bash
# Service health validation

SERVICES=("analysis" "reporting" "health")
FAILED_SERVICES=()

for service in "${SERVICES[@]}"; do
  if ! curl -f "http://localhost:3000/api/$service/health" > /dev/null 2>&1; then
    FAILED_SERVICES+=("$service")
  fi
done

if [ ${#FAILED_SERVICES[@]} -gt 0 ]; then
  echo "❌ Failed services: ${FAILED_SERVICES[*]}"
  exit 1
else
  echo "✅ All services healthy"
  exit 0
fi
```

## 📋 Rollback Decision Matrix

| Metric | Green | Yellow | Red | Action |
|--------|-------|--------|-----|---------|
| Error Rate | < 2% | 2-5% | > 5% | Monitor / Assess / **Rollback** |
| Response Time P95 | < 30s | 30-60s | > 60s | Monitor / Assess / **Rollback** |
| Memory Usage | < 512MB | 512MB-1GB | > 1GB | Monitor / Assess / **Rollback** |
| Quality Score | > 0.8 | 0.7-0.8 | < 0.7 | Monitor / Assess / **Rollback** |
| Health Checks | 100% | 95-99% | < 95% | Monitor / Assess / **Rollback** |

## 🎯 Success Criteria

### Rollback Success Indicators
- ✅ Error rate drops below 2% within 2 minutes
- ✅ Response times return to baseline within 5 minutes
- ✅ All health checks pass within 1 minute
- ✅ No data loss or corruption detected
- ✅ User-facing functionality fully restored

### Rollforward Success Indicators  
- ✅ Performance metrics equal or exceed baseline
- ✅ Quality metrics maintained or improved
- ✅ Error rates remain below 2% for 1 hour
- ✅ No user-reported issues for 24 hours
- ✅ Resource utilization within normal ranges

## 📚 Training and Documentation

### Team Training Requirements
- **On-call Engineers:** Complete rollback procedure training
- **Development Team:** Understand rollback triggers and procedures
- **QA Team:** Validate rollback testing procedures
- **Management:** Understand business impact and decision criteria

### Documentation Requirements
- **Runbooks:** Detailed step-by-step rollback procedures
- **Decision Trees:** Visual guides for rollback decisions
- **Contact Lists:** Emergency contacts and escalation procedures
- **Post-Incident:** Template for post-rollback analysis

## 🔄 Continuous Improvement

### Regular Testing
- **Monthly:** Rollback procedure drills
- **Quarterly:** Full disaster recovery testing
- **After Issues:** Update procedures based on lessons learned
- **Performance Reviews:** Analyze rollback decision accuracy

### Metrics Review
- **Weekly:** Review rollback trigger thresholds
- **Monthly:** Analyze false positive/negative rates
- **Quarterly:** Update decision criteria based on trends
- **Annually:** Comprehensive procedure review

---

**Document Approval:**
- Engineering Lead: [Signature Required]
- Operations Lead: [Signature Required]  
- QA Lead: [Signature Required]
- Date: July 28, 2025

*This document is reviewed and updated quarterly or after any significant rollback event.* 