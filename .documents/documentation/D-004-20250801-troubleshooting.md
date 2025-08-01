# 🔧 Competitive Analysis Platform - Troubleshooting Guide

## 🎯 Overview

This guide provides comprehensive troubleshooting procedures for the Competitive Analysis Platform. It covers common issues, diagnostic steps, and resolution procedures for both users and system administrators.

---

## 🚨 Quick Diagnostic Checklist

### **System Health Check (5 minutes)**

Before diving into specific issues, run this quick diagnostic:

```bash
# 1. Check system status
curl -s "https://your-domain.com/api/debug/comparative-reports" | jq '.status'

# 2. Verify queue health
curl -s "https://your-domain.com/api/queue/health" | jq '.status'

# 3. Check deployment status
curl -s "https://your-domain.com/api/deployment/rollout-status" | jq '.currentPhase'

# 4. Monitor key metrics
curl -s "https://your-domain.com/api/debug/comparative-reports" | jq '.metrics'
```

**Expected Healthy Responses:**
- System status: `"healthy"`
- Queue status: `"healthy"`
- Error rate: `< 5%`
- Processing time: `< 2 minutes`

---

## 🔍 Report Generation Issues

### **Problem: Reports Not Generating**

#### **Symptoms:**
- Reports stuck in "pending" status
- No reports generated for active projects
- Error messages during report creation

#### **Diagnostic Steps:**

1. **Check Project Status**
   ```bash
   # Verify project exists and is active
   curl -s "https://your-domain.com/api/projects/PROJECT_ID" | jq '.status'
   
   # Check last report generation
   curl -s "https://your-domain.com/api/projects/PROJECT_ID" | jq '.recentReports[0]'
   ```

2. **Verify Queue Processing**
   ```bash
   # Check queue depth and processing
   curl -s "https://your-domain.com/api/queue/health" | jq '.queueDepth, .processing'
   
   # Look for stuck jobs
   curl -s "https://your-domain.com/api/debug/comparative-reports" | jq '.queueStatus'
   ```

3. **Check Product Data**
   ```bash
   # Verify product website accessibility
   curl -s "https://your-domain.com/api/debug/comparative-reports?projectId=PROJECT_ID" | jq '.productStatus'
   
   # Check data freshness
   curl -s "https://your-domain.com/api/debug/comparative-reports?projectId=PROJECT_ID" | jq '.dataFreshness'
   ```

#### **Resolution Steps:**

1. **Restart Stalled Processes**
   ```bash
   # Clear stuck queue jobs
   curl -X POST "https://your-domain.com/api/queue/clear-stuck"
   
   # Restart report generation
   curl -X POST "https://your-domain.com/api/reports/restart-generation/PROJECT_ID"
   ```

2. **Force Product Data Refresh**
   ```bash
   # Refresh product data
   curl -X POST "https://your-domain.com/api/products/PRODUCT_ID/refresh" \
     -H "Content-Type: application/json" \
     -d '{"priority": "high", "fullScrape": true}'
   ```

3. **Manual Report Trigger**
   ```bash
   # Manually trigger report generation
   curl -X POST "https://your-domain.com/api/reports/generate" \
     -H "Content-Type: application/json" \
     -d '{"projectId": "PROJECT_ID", "priority": "high"}'
   ```

### **Problem: Slow Report Generation**

#### **Symptoms:**
- Processing time > 5 minutes
- Reports timing out
- High queue depth

#### **Diagnostic Steps:**

1. **Performance Analysis**
   ```bash
   # Check processing bottlenecks
   curl -s "https://your-domain.com/api/debug/performance-metrics" | jq '.metrics.processingTime'
   
   # Analyze slow projects
   curl -s "https://your-domain.com/api/debug/comparative-reports" | jq '.projects[] | select(.processingTime > 300)'
   ```

2. **Resource Monitoring**
   ```bash
   # Check system resources
   curl -s "https://your-domain.com/api/debug/system-resources" | jq '.'
   
   # Monitor database performance
   curl -s "https://your-domain.com/api/debug/database-performance" | jq '.'
   ```

#### **Resolution Steps:**

1. **Scale Processing Resources**
   ```bash
   # Increase worker concurrency
   export WORKER_CONCURRENCY=15
   
   # Scale database connections
   export DATABASE_POOL_SIZE=50
   
   # Restart services
   pm2 restart all
   ```

2. **Optimize Data Processing**
   ```bash
   # Clear old data
   curl -X POST "https://your-domain.com/api/maintenance/cleanup-old-data"
   
   # Optimize database
   curl -X POST "https://your-domain.com/api/maintenance/optimize-database"
   ```

3. **Prioritize Critical Reports**
   ```bash
   # Move project to high priority queue
   curl -X POST "https://your-domain.com/api/projects/PROJECT_ID/priority" \
     -H "Content-Type: application/json" \
     -d '{"priority": "high"}'
   ```

### **Problem: Report Quality Issues**

#### **Symptoms:**
- Low confidence scores (<70%)
- Missing competitor data
- Incomplete analysis sections

#### **Diagnostic Steps:**

1. **Data Quality Check**
   ```bash
   # Check data freshness
   curl -s "https://your-domain.com/api/debug/data-freshness-audit" | jq '.'
   
   # Verify competitor accessibility
   curl -s "https://your-domain.com/api/debug/competitor-accessibility-check" | jq '.'
   ```

2. **Analysis Quality Metrics**
   ```bash
   # Check report quality metrics
   curl -s "https://your-domain.com/api/debug/report-quality-metrics" | jq '.'
   
   # Analyze confidence scores
   curl -s "https://your-domain.com/api/reports/REPORT_ID" | jq '.metadata.confidenceScore'
   ```

#### **Resolution Steps:**

1. **Improve Data Quality**
   ```bash
   # Refresh all competitor data
   curl -X POST "https://your-domain.com/api/competitors/refresh-all/PROJECT_ID"
   
   # Update product information
   curl -X PUT "https://your-domain.com/api/products/PRODUCT_ID" \
     -H "Content-Type: application/json" \
     -d '{"website": "https://updated-website.com"}'
   ```

2. **Regenerate Report**
   ```bash
   # Force fresh report generation
   curl -X POST "https://your-domain.com/api/reports/generate" \
     -H "Content-Type: application/json" \
     -d '{"projectId": "PROJECT_ID", "options": {"forceRefresh": true}}'
   ```

---

## 🔄 System Performance Issues

### **Problem: High Memory Usage**

#### **Symptoms:**
- System sluggish performance
- Out of memory errors
- Process crashes

#### **Diagnostic Steps:**

1. **Memory Analysis**
   ```bash
   # Check memory usage
   curl -s "https://your-domain.com/api/debug/memory-usage" | jq '.'
   
   # Monitor process memory
   ps aux --sort=-%mem | head -10
   
   # Check for memory leaks
   curl -s "https://your-domain.com/api/debug/memory-leaks" | jq '.'
   ```

#### **Resolution Steps:**

1. **Immediate Relief**
   ```bash
   # Clear caches
   curl -X POST "https://your-domain.com/api/maintenance/clear-caches"
   
   # Restart services
   pm2 restart all
   
   # Force garbage collection
   curl -X POST "https://your-domain.com/api/maintenance/force-gc"
   ```

2. **Long-term Solutions**
   ```bash
   # Increase memory limits
   export NODE_OPTIONS="--max-old-space-size=4096"
   
   # Optimize cache settings
   export CACHE_MAX_SIZE=1000
   export CACHE_TTL=3600
   ```

### **Problem: Database Connection Issues**

#### **Symptoms:**
- Database connection errors
- Query timeouts
- Connection pool exhaustion

#### **Diagnostic Steps:**

1. **Database Health Check**
   ```bash
   # Check database connections
   curl -s "https://your-domain.com/api/debug/database-health" | jq '.'
   
   # Monitor connection pool
   curl -s "https://your-domain.com/api/debug/database-connections" | jq '.'
   ```

2. **Query Performance Analysis**
   ```sql
   -- Check active connections
   SELECT count(*) as active_connections, state 
   FROM pg_stat_activity 
   GROUP BY state;
   
   -- Identify slow queries
   SELECT query, mean_time, calls 
   FROM pg_stat_statements 
   ORDER BY mean_time DESC 
   LIMIT 10;
   ```

#### **Resolution Steps:**

1. **Connection Pool Optimization**
   ```bash
   # Increase connection pool size
   export DATABASE_POOL_SIZE=100
   
   # Optimize connection timeout
   export DATABASE_TIMEOUT=30000
   
   # Restart application
   pm2 restart all
   ```

2. **Database Maintenance**
   ```sql
   -- Vacuum and analyze
   VACUUM ANALYZE;
   
   -- Rebuild indexes
   REINDEX DATABASE competitive_analysis;
   
   -- Kill long-running queries
   SELECT pg_terminate_backend(pid) FROM pg_stat_activity 
   WHERE state = 'active' AND query_start < now() - interval '10 minutes';
   ```

---

## 🚀 Deployment Issues

### **Problem: Rollout Failures**

#### **Symptoms:**
- Deployment stuck in specific phase
- High error rates during rollout
- Automatic rollback triggered

#### **Diagnostic Steps:**

1. **Rollout Status Analysis**
   ```bash
   # Check current rollout status
   curl -s "https://your-domain.com/api/deployment/rollout-status" | jq '.'
   
   # Analyze rollout metrics
   curl -s "https://your-domain.com/api/deployment/rollout-metrics" | jq '.'
   ```

2. **Error Pattern Analysis**
   ```bash
   # Check deployment errors
   curl -s "https://your-domain.com/api/deployment/errors" | jq '.'
   
   # Monitor rollout health
   curl -s "https://your-domain.com/api/deployment/health" | jq '.'
   ```

#### **Resolution Steps:**

1. **Emergency Rollback**
   ```bash
   # Immediate rollback
   curl -X POST "https://your-domain.com/api/deployment/rollback" \
     -H "Content-Type: application/json" \
     -d '{"reason": "Deployment issues", "emergencyRollback": true}'
   ```

2. **Gradual Recovery**
   ```bash
   # Reset to stable phase
   curl -X POST "https://your-domain.com/api/deployment/reset-phase" \
     -H "Content-Type: application/json" \
     -d '{"targetPhase": "production-10"}'
   
   # Monitor recovery
   watch -n 5 'curl -s https://your-domain.com/api/deployment/rollout-status | jq ".currentPhase, .metrics.errorRate"'
   ```

### **Problem: Feature Flag Issues**

#### **Symptoms:**
- Features not rolling out correctly
- Inconsistent behavior across users
- Feature flag conflicts

#### **Diagnostic Steps:**

1. **Feature Flag Status**
   ```bash
   # Check feature flag configuration
   curl -s "https://your-domain.com/api/config/feature-flags" | jq '.'
   
   # Verify flag consistency
   curl -s "https://your-domain.com/api/debug/feature-flag-consistency" | jq '.'
   ```

#### **Resolution Steps:**

1. **Reset Feature Flags**
   ```bash
   # Reset to known good state
   curl -X PUT "https://your-domain.com/api/config/feature-flags" \
     -H "Content-Type: application/json" \
     -d '{"features": {"rolloutPercentage": 10, "comparativeReportsEnabled": true}}'
   ```

2. **Gradual Re-enable**
   ```bash
   # Slowly increase rollout percentage
   curl -X PUT "https://your-domain.com/api/config/feature-flags" \
     -H "Content-Type: application/json" \
     -d '{"features": {"rolloutPercentage": 25}}'
   ```

---

## 🔧 Data Issues

### **Problem: Stale Data**

#### **Symptoms:**
- Competitor data >7 days old
- Product information outdated
- Analysis based on old data

#### **Diagnostic Steps:**

1. **Data Freshness Audit**
   ```bash
   # Check data ages
   curl -s "https://your-domain.com/api/debug/data-freshness-audit" | jq '.'
   
   # Identify stale data sources
   curl -s "https://your-domain.com/api/debug/stale-data-sources" | jq '.'
   ```

#### **Resolution Steps:**

1. **Force Data Refresh**
   ```bash
   # Refresh all project data
   curl -X POST "https://your-domain.com/api/projects/PROJECT_ID/refresh-data" \
     -H "Content-Type: application/json" \
     -d '{"priority": "high", "fullRefresh": true}'
   
   # Bulk competitor refresh
   curl -X POST "https://your-domain.com/api/competitors/bulk-refresh" \
     -H "Content-Type: application/json" \
     -d '{"projects": ["PROJECT_ID"], "priority": "high"}'
   ```

2. **Schedule Regular Updates**
   ```bash
   # Configure automatic refresh
   curl -X PUT "https://your-domain.com/api/projects/PROJECT_ID/settings" \
     -H "Content-Type: application/json" \
     -d '{"autoRefreshInterval": "daily", "dataFreshnessThreshold": 168}'
   ```

### **Problem: Website Scraping Failures**

#### **Symptoms:**
- Websites not accessible
- Scraping timeouts
- Invalid data extracted

#### **Diagnostic Steps:**

1. **Scraping Health Check**
   ```bash
   # Check scraping service status
   curl -s "https://your-domain.com/api/debug/scraping-health" | jq '.'
   
   # Test specific website
   curl -X POST "https://your-domain.com/api/debug/test-scraping" \
     -H "Content-Type: application/json" \
     -d '{"url": "https://website.com"}'
   ```

#### **Resolution Steps:**

1. **Retry with Different Settings**
   ```bash
   # Retry with mobile user agent
   curl -X POST "https://your-domain.com/api/scraping/retry" \
     -H "Content-Type: application/json" \
     -d '{"url": "https://website.com", "userAgent": "mobile", "timeout": 30000}'
   
   # Use proxy if needed
   curl -X POST "https://your-domain.com/api/scraping/retry" \
     -H "Content-Type: application/json" \
     -d '{"url": "https://website.com", "useProxy": true}'
   ```

---

## 🔍 User Interface Issues

### **Problem: Chat Interface Not Working**

#### **Symptoms:**
- Chat not responding
- Project creation fails
- Error messages unclear

#### **Diagnostic Steps:**

1. **Chat Service Health**
   ```bash
   # Check chat service status
   curl -s "https://your-domain.com/api/debug/chat-health" | jq '.'
   
   # Test chat processing
   curl -X POST "https://your-domain.com/api/debug/test-chat" \
     -H "Content-Type: application/json" \
     -d '{"message": "test message"}'
   ```

#### **Resolution Steps:**

1. **Restart Chat Services**
   ```bash
   # Restart chat processing
   curl -X POST "https://your-domain.com/api/maintenance/restart-chat-service"
   
   # Clear chat cache
   curl -X POST "https://your-domain.com/api/maintenance/clear-chat-cache"
   ```

### **Problem: Report Display Issues**

#### **Symptoms:**
- Reports not loading
- Formatting problems
- Missing sections

#### **Diagnostic Steps:**

1. **Report API Test**
   ```bash
   # Test report retrieval
   curl -s "https://your-domain.com/api/reports/REPORT_ID" | jq '.analysis | keys'
   
   # Check report structure
   curl -s "https://your-domain.com/api/debug/report-structure/REPORT_ID" | jq '.'
   ```

#### **Resolution Steps:**

1. **Regenerate Report**
   ```bash
   # Force report regeneration
   curl -X POST "https://your-domain.com/api/reports/regenerate/REPORT_ID" \
     -H "Content-Type: application/json" \
     -d '{"includeUXAnalysis": true}'
   ```

---

## 🚨 Emergency Procedures

### **Critical System Failure (P0)**

#### **Immediate Actions (0-2 minutes):**

1. **System Status Check**
   ```bash
   # Quick health check
   curl -s "https://your-domain.com/api/debug/comparative-reports" | head -5
   
   # Check if emergency rollback is needed
   curl -s "https://your-domain.com/api/deployment/rollout-status" | jq '.metrics.errorRate'
   ```

2. **Emergency Rollback** (if error rate >15%)
   ```bash
   curl -X POST "https://your-domain.com/api/deployment/rollback" \
     -H "Content-Type: application/json" \
     -d '{"reason": "P0 incident", "emergencyRollback": true}'
   ```

3. **Service Restart** (if needed)
   ```bash
   # Restart all services
   pm2 restart all
   
   # Clear all caches
   redis-cli FLUSHALL
   ```

#### **Investigation Phase (2-10 minutes):**

1. **Log Analysis**
   ```bash
   # Check recent errors
   curl -s "https://your-domain.com/api/debug/recent-errors" | jq '.'
   
   # Correlation ID tracking
   curl -s "https://your-domain.com/api/debug/correlation-trace/CORRELATION_ID" | jq '.'
   ```

2. **Resource Monitoring**
   ```bash
   # System resources
   curl -s "https://your-domain.com/api/debug/system-resources" | jq '.'
   
   # Database health
   curl -s "https://your-domain.com/api/debug/database-health" | jq '.'
   ```

### **Recovery Verification**

After implementing fixes, verify recovery:

```bash
# 1. System health check
curl -s "https://your-domain.com/api/debug/comparative-reports" | jq '.status'

# 2. Test report generation
curl -X POST "https://your-domain.com/api/reports/test-generation" \
  -H "Content-Type: application/json" \
  -d '{"testMode": true}'

# 3. Monitor error rates
watch -n 30 'curl -s https://your-domain.com/api/debug/comparative-reports | jq ".metrics.errorRate"'

# 4. Check queue processing
curl -s "https://your-domain.com/api/queue/health" | jq '.status'
```

---

## 📊 Monitoring & Alerting

### **Key Metrics to Monitor**

1. **System Health Metrics**
   - Overall system status
   - Error rate (<5% healthy)
   - Processing time (<2 min healthy)
   - Queue depth (<50 healthy)

2. **Business Metrics**
   - Reports generated per day
   - User satisfaction scores
   - Data freshness metrics
   - Feature adoption rates

3. **Technical Metrics**
   - Memory usage
   - CPU utilization
   - Database connections
   - Cache hit rates

### **Alert Thresholds**

| Metric | Warning | Critical |
|--------|---------|----------|
| Error Rate | >5% | >10% |
| Processing Time | >2 min | >5 min |
| Queue Depth | >50 | >100 |
| Memory Usage | >70% | >85% |
| Database Connections | >80% | >90% |

### **Automated Monitoring Setup**

```bash
#!/bin/bash
# Monitoring script - run every 5 minutes

# Check system health
HEALTH=$(curl -s "https://your-domain.com/api/debug/comparative-reports" | jq -r '.status')

if [ "$HEALTH" != "healthy" ]; then
    echo "ALERT: System unhealthy - $HEALTH"
    # Send alert to monitoring system
    curl -X POST "https://monitoring.company.com/alert" \
      -d "System health: $HEALTH"
fi

# Check error rate
ERROR_RATE=$(curl -s "https://your-domain.com/api/debug/comparative-reports" | jq -r '.metrics.errorRate' | sed 's/%//')

if (( $(echo "$ERROR_RATE > 5" | bc -l) )); then
    echo "ALERT: High error rate - $ERROR_RATE%"
fi
```

---

## 📞 Escalation Matrix

### **Issue Severity Levels**

| Level | Response Time | Escalation |
|-------|---------------|------------|
| **P0 - Critical** | 5 minutes | 15 minutes |
| **P1 - High** | 15 minutes | 30 minutes |
| **P2 - Medium** | 1 hour | 2 hours |
| **P3 - Low** | 4 hours | Next day |

### **Escalation Contacts**

- **L1 Support**: Technical support team
- **L2 Support**: Engineering team
- **L3 Support**: Senior engineers
- **Executive**: Engineering manager (P0 only)

### **Communication Channels**

- **Slack**: #production-alerts
- **Email**: oncall@company.com
- **Phone**: Primary: +1-XXX-XXX-XXXX
- **PagerDuty**: https://company.pagerduty.com

---

## 📋 Maintenance Procedures

### **Preventive Maintenance**

1. **Daily Health Checks**
   - System status verification
   - Queue health monitoring
   - Error rate analysis
   - Performance metrics review

2. **Weekly Maintenance**
   - Database optimization
   - Cache cleanup
   - Log rotation
   - Performance analysis

3. **Monthly Reviews**
   - Capacity planning
   - Security updates
   - Performance trends
   - User feedback analysis

### **Emergency Maintenance**

When emergency maintenance is required:

1. **Notification**
   - Update status page
   - Notify users via email
   - Post in communication channels

2. **Maintenance Mode**
   ```bash
   # Enable maintenance mode
   curl -X POST "https://your-domain.com/api/maintenance/enable" \
     -H "Content-Type: application/json" \
     -d '{"message": "Emergency maintenance in progress"}'
   ```

3. **Post-Maintenance Verification**
   - Run full system health check
   - Verify all services operational
   - Monitor for any issues
   - Update stakeholders

---

**📞 Emergency Hotline**: +1-XXX-XXX-XXXX (24/7)  
**📧 Support Email**: support@company.com  
**🔄 Status Page**: https://status.your-domain.com  
**📚 Documentation**: Complete troubleshooting knowledge base

*Last Updated: [Current Date] | Version: 2.0 | Troubleshooting Guide* 