# 🛠️ Competitive Analysis Platform - Operational Runbook

## 🎯 Overview

This runbook provides comprehensive procedures for operating, monitoring, and maintaining the Competitive Analysis Platform in production. It covers routine operations, incident response, deployment procedures, and troubleshooting guides.

---

## 📊 System Architecture Overview

### **Core Components**
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Web Frontend  │ ── │   API Gateway   │ ── │   Background    │
│   (Next.js)     │    │   (Next.js API) │    │   Processing   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │                        │
                       ┌─────────────────┐    ┌─────────────────┐
                       │   PostgreSQL    │    │     Redis       │
                       │   (Primary DB)  │    │   (Queue/Cache) │
                       └─────────────────┘    └─────────────────┘
                                │
                       ┌─────────────────┐    ┌─────────────────┐
                       │   AWS Bedrock   │    │   Web Scraping  │
                       │   (AI Analysis) │    │   Services      │
                       └─────────────────┘    └─────────────────┘
```

### **Key Services**
- **AutoReportGenerationService**: Queue management and orchestration
- **ComparativeReportService**: Unified analysis generation
- **ProductScrapingService**: Product website data collection
- **ComparativeReportMonitoring**: Real-time system monitoring
- **ProductionRollout**: Gradual deployment management

---

## 🔍 Monitoring & Health Checks

### **Real-Time System Monitoring**

#### **Primary Health Dashboard**
```bash
# System-wide health check
curl -s "https://your-domain.com/api/debug/comparative-reports" | jq '.'

# Expected healthy response:
{
  "status": "healthy",
  "systemHealth": {
    "overall": "healthy",
    "reportGeneration": "healthy", 
    "queueProcessing": "healthy",
    "database": "healthy"
  },
  "metrics": {
    "activeProjects": 150,
    "reportsGenerated24h": 45,
    "avgProcessingTime": "1.8min",
    "errorRate": "2.1%"
  }
}
```

#### **Project-Specific Monitoring**
```bash
# Check specific project health
curl -s "https://your-domain.com/api/debug/comparative-reports?projectId=PROJECT_ID" | jq '.'

# Monitor queue health
curl -s "https://your-domain.com/api/queue/health" | jq '.'
```

#### **Deployment Status Monitoring**
```bash
# Check rollout status
curl -s "https://your-domain.com/api/deployment/rollout-status" | jq '.'

# Monitor deployment health
curl -s "https://your-domain.com/api/deployment/health" | jq '.'
```

### **Key Performance Indicators (KPIs)**

#### **Health Thresholds**
| Metric | Healthy | Warning | Critical |
|--------|---------|---------|----------|
| **Processing Time** | <2 min | 2-5 min | >5 min |
| **Error Rate** | <5% | 5-10% | >10% |
| **Queue Depth** | <50 | 50-100 | >100 |
| **Memory Usage** | <70% | 70-85% | >85% |
| **Database Connections** | <80% | 80-90% | >90% |

#### **Business Metrics**
- **Reports Generated/Day**: Target >100, Alert if <50
- **User Satisfaction**: Target >90%, Alert if <80%
- **System Uptime**: Target >99.9%, Alert if <99.5%
- **Data Freshness**: Target <7 days, Alert if >14 days

---

## 🚨 Incident Response Procedures

### **Incident Classification**

#### **Severity Levels**
- **🔴 Critical (P0)**: System down, no reports generating
- **🟡 High (P1)**: Degraded performance, high error rates
- **🟢 Medium (P2)**: Individual features affected
- **🔵 Low (P3)**: Minor issues, cosmetic problems

### **P0 - Critical Incident Response**

#### **Immediate Actions (0-5 minutes)**
1. **Acknowledge Alert**
   ```bash
   # Check system status immediately
   curl -s "https://your-domain.com/api/debug/comparative-reports"
   
   # Check database connectivity
   npx prisma db push --preview-feature
   
   # Verify Redis connection
   redis-cli ping
   ```

2. **Emergency Rollback** (if recent deployment)
   ```bash
   # Emergency rollback
   curl -X POST "https://your-domain.com/api/deployment/rollback" \
     -H "Content-Type: application/json" \
     -d '{"reason": "P0 incident - immediate rollback", "emergencyRollback": true}'
   ```

3. **Service Restart** (if needed)
   ```bash
   # Restart application
   pm2 restart all
   
   # Restart Redis if needed
   sudo systemctl restart redis
   
   # Clear stuck queues
   redis-cli FLUSHDB
   ```

#### **Investigation Phase (5-15 minutes)**
1. **Log Analysis**
   ```bash
   # Check application logs
   tail -n 100 /var/log/app/error.log
   
   # Check database logs
   tail -n 100 /var/log/postgresql/postgresql.log
   
   # Monitor system resources
   htop
   df -h
   ```

2. **Correlation ID Tracking**
   ```bash
   # Find related errors using correlation IDs
   grep "CORRELATION_ID" /var/log/app/*.log
   ```

### **P1 - High Priority Response**

#### **Performance Degradation**
1. **Identify Bottlenecks**
   ```bash
   # Check processing times by project
   curl -s "https://your-domain.com/api/debug/comparative-reports" | jq '.projects[] | select(.processingTime > 300)'
   
   # Monitor queue depth
   curl -s "https://your-domain.com/api/queue/health" | jq '.queueDepth'
   ```

2. **Scale Resources**
   ```bash
   # Increase worker processes
   export WORKER_CONCURRENCY=10
   pm2 restart all
   
   # Scale database connections
   export DATABASE_POOL_SIZE=50
   ```

#### **High Error Rates**
1. **Error Pattern Analysis**
   ```bash
   # Analyze error types
   curl -s "https://your-domain.com/api/debug/comparative-reports" | jq '.errors | group_by(.type)'
   
   # Check recent failed reports
   curl -s "https://your-domain.com/api/reports/failed-reports" | jq '.'
   ```

2. **Data Quality Checks**
   ```bash
   # Check for stale data
   curl -s "https://your-domain.com/api/debug/data-freshness" | jq '.'
   
   # Verify competitor data availability
   curl -s "https://your-domain.com/api/debug/competitor-health" | jq '.'
   ```

---

## 🔧 Routine Maintenance Procedures

### **Daily Operations**

#### **Morning Health Check (9:00 AM)**
```bash
#!/bin/bash
# Daily health check script

echo "=== Daily Health Check - $(date) ==="

# System health
curl -s "https://your-domain.com/api/debug/comparative-reports" | jq '.systemHealth'

# Key metrics
echo "Processing metrics:"
curl -s "https://your-domain.com/api/debug/comparative-reports" | jq '.metrics'

# Check for stuck queues
echo "Queue status:"
curl -s "https://your-domain.com/api/queue/health" | jq '.'

# Database health
echo "Database connections:"
psql -c "SELECT count(*) as active_connections FROM pg_stat_activity;"

# Disk space
echo "Disk usage:"
df -h /var/lib/postgresql/data
df -h /var/log
```

#### **Evening Report Generation Review (6:00 PM)**
```bash
#!/bin/bash
# Evening report review

echo "=== Evening Report Review - $(date) ==="

# Daily statistics
curl -s "https://your-domain.com/api/debug/comparative-reports" | jq '.dailyStats'

# Failed reports review
curl -s "https://your-domain.com/api/reports/failed-reports?since=24h" | jq '.[] | {projectId, error, timestamp}'

# Performance trends
curl -s "https://your-domain.com/api/debug/performance-trends?period=24h" | jq '.'
```

### **Weekly Operations**

#### **Weekly System Optimization (Sundays 2:00 AM)**
```bash
#!/bin/bash
# Weekly maintenance script

echo "=== Weekly Maintenance - $(date) ==="

# Database maintenance
echo "Running database maintenance..."
psql -c "VACUUM ANALYZE;"
psql -c "REINDEX DATABASE competitive_analysis;"

# Clear old logs (keep 30 days)
find /var/log/app -name "*.log" -mtime +30 -delete

# Archive old reports (move to cold storage)
psql -c "
  UPDATE reports 
  SET archived = true 
  WHERE created_at < NOW() - INTERVAL '90 days' 
  AND archived = false;
"

# Performance analysis
curl -s "https://your-domain.com/api/debug/weekly-performance-report" > /tmp/weekly_perf.json

# System resource cleanup
docker system prune -f
npm cache clean --force
```

#### **Data Quality Audit (Wednesdays 3:00 AM)**
```bash
#!/bin/bash
# Weekly data quality audit

echo "=== Data Quality Audit - $(date) ==="

# Check data freshness
curl -s "https://your-domain.com/api/debug/data-freshness-audit" | jq '.'

# Verify competitor website accessibility
curl -s "https://your-domain.com/api/debug/competitor-accessibility-check" | jq '.'

# Product data validation
curl -s "https://your-domain.com/api/debug/product-data-validation" | jq '.'

# Report quality metrics
curl -s "https://your-domain.com/api/debug/report-quality-metrics" | jq '.'
```

### **Monthly Operations**

#### **Monthly Performance Review**
```bash
#!/bin/bash
# Monthly performance and capacity planning

# Generate comprehensive performance report
curl -s "https://your-domain.com/api/debug/monthly-performance-report" > /tmp/monthly_perf.json

# Database size analysis
psql -c "
  SELECT schemaname,tablename,attname,n_distinct,correlation 
  FROM pg_stats 
  WHERE schemaname = 'public' 
  ORDER BY n_distinct DESC;
"

# Capacity planning metrics
df -h
free -h
psql -c "SELECT pg_size_pretty(pg_database_size('competitive_analysis'));"
```

---

## 🚀 Deployment Procedures

### **Production Deployment Process**

#### **Pre-Deployment Checklist**
- [ ] All tests passing in staging environment
- [ ] Database migrations tested and verified
- [ ] Feature flags configured for gradual rollout
- [ ] Rollback plan documented and tested
- [ ] Monitoring alerts configured
- [ ] Team notified of deployment window

#### **Deployment Execution**
```bash
# 1. Prepare deployment
./scripts/deploy.sh prepare

# 2. Deploy to production with health checks
./scripts/deploy.sh deploy --environment=production --health-checks

# 3. Monitor deployment
watch -n 5 'curl -s https://your-domain.com/api/deployment/rollout-status | jq "."'

# 4. Advance through rollout phases
# Development -> 10% -> 50% -> 100%
curl -X POST "https://your-domain.com/api/deployment/advance-phase" \
  -H "Content-Type: application/json" \
  -d '{"confirmationToken": "PROD_ADVANCE_TOKEN"}'
```

#### **Post-Deployment Verification**
```bash
# Health check after deployment
curl -s "https://your-domain.com/api/debug/comparative-reports" | jq '.systemHealth'

# Verify new features
curl -s "https://your-domain.com/api/debug/feature-flags" | jq '.'

# Monitor error rates
curl -s "https://your-domain.com/api/debug/error-rates?since=30min" | jq '.'

# Test report generation
curl -X POST "https://your-domain.com/api/reports/test-generation" \
  -H "Content-Type: application/json" \
  -d '{"testMode": true}'
```

### **Emergency Rollback Procedures**

#### **Automatic Rollback Triggers**
- Error rate >15% for >5 minutes
- Processing time >10 minutes average
- System health check failures >3 consecutive
- Database connection failures >50%

#### **Manual Rollback**
```bash
# Emergency rollback with immediate feature disable
curl -X POST "https://your-domain.com/api/deployment/rollback" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "High error rates detected",
    "emergencyRollback": true,
    "disableFeatures": ["comparative-reports-v2"]
  }'

# Verify rollback success
curl -s "https://your-domain.com/api/deployment/rollout-status" | jq '.currentPhase'
```

---

## 🔧 Database Maintenance

### **Regular Database Operations**

#### **Daily Database Health Check**
```sql
-- Connection monitoring
SELECT count(*) as active_connections, state 
FROM pg_stat_activity 
GROUP BY state;

-- Query performance
SELECT query, mean_time, calls, total_time 
FROM pg_stat_statements 
ORDER BY mean_time DESC 
LIMIT 10;

-- Table sizes
SELECT schemaname, tablename, 
       pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables 
WHERE schemaname = 'public' 
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

#### **Weekly Optimization**
```sql
-- Update table statistics
ANALYZE;

-- Rebuild indexes
REINDEX DATABASE competitive_analysis;

-- Clean up old data
DELETE FROM queue_jobs 
WHERE completed_at < NOW() - INTERVAL '7 days' 
AND status = 'completed';

-- Archive old reports
UPDATE reports 
SET archived = true 
WHERE created_at < NOW() - INTERVAL '90 days' 
AND archived = false;
```

### **Backup Procedures**

#### **Automated Backups**
```bash
#!/bin/bash
# Daily backup script (runs at 2:00 AM)

BACKUP_DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/competitive-analysis"

# Create database backup
pg_dump competitive_analysis > "${BACKUP_DIR}/db_backup_${BACKUP_DATE}.sql"

# Compress backup
gzip "${BACKUP_DIR}/db_backup_${BACKUP_DATE}.sql"

# Upload to S3 (if configured)
aws s3 cp "${BACKUP_DIR}/db_backup_${BACKUP_DATE}.sql.gz" \
  s3://your-backup-bucket/database/

# Clean old backups (keep 30 days locally)
find "${BACKUP_DIR}" -name "db_backup_*.sql.gz" -mtime +30 -delete
```

#### **Backup Verification**
```bash
#!/bin/bash
# Weekly backup verification

LATEST_BACKUP=$(ls -t /backups/competitive-analysis/db_backup_*.sql.gz | head -1)

# Test restore to temporary database
createdb test_restore_$(date +%s)
gunzip -c "$LATEST_BACKUP" | psql test_restore_$(date +%s)

# Verify data integrity
psql test_restore_$(date +%s) -c "SELECT count(*) FROM reports;"
psql test_restore_$(date +%s) -c "SELECT count(*) FROM projects;"

# Cleanup test database
dropdb test_restore_$(date +%s)
```

---

## 🔍 Troubleshooting Guide

### **Common Issues and Solutions**

#### **Issue: High Memory Usage**
**Symptoms**: System sluggish, OOM errors
**Diagnosis**:
```bash
# Check memory usage
free -h
ps aux --sort=-%mem | head -10

# Check for memory leaks
curl -s "https://your-domain.com/api/debug/memory-usage" | jq '.'
```
**Resolution**:
```bash
# Restart application with memory profiling
NODE_OPTIONS="--max-old-space-size=4096" pm2 restart all

# Clear caches
redis-cli FLUSHALL
npm cache clean --force
```

#### **Issue: Slow Report Generation**
**Symptoms**: Processing time >5 minutes
**Diagnosis**:
```bash
# Check processing bottlenecks
curl -s "https://your-domain.com/api/debug/processing-bottlenecks" | jq '.'

# Analyze slow queries
psql -c "SELECT query, mean_time FROM pg_stat_statements ORDER BY mean_time DESC LIMIT 5;"
```
**Resolution**:
```bash
# Scale worker processes
export WORKER_CONCURRENCY=15
pm2 restart all

# Optimize database
psql -c "VACUUM ANALYZE reports;"
psql -c "REINDEX TABLE reports;"
```

#### **Issue: Queue Stalls**
**Symptoms**: Reports stuck in queue
**Diagnosis**:
```bash
# Check queue status
curl -s "https://your-domain.com/api/queue/health" | jq '.'

# Check worker processes
pm2 status
```
**Resolution**:
```bash
# Clear stuck jobs
redis-cli DEL queue:comparative-reports:stalled

# Restart workers
pm2 restart workers

# Re-queue failed jobs
curl -X POST "https://your-domain.com/api/queue/requeue-failed"
```

### **Performance Optimization**

#### **Database Optimization**
```sql
-- Identify slow queries
SELECT query, calls, total_time, mean_time, rows 
FROM pg_stat_statements 
WHERE mean_time > 1000 
ORDER BY mean_time DESC;

-- Add missing indexes
CREATE INDEX CONCURRENTLY idx_reports_project_created 
ON reports(project_id, created_at);

CREATE INDEX CONCURRENTLY idx_queue_jobs_status_created 
ON queue_jobs(status, created_at);
```

#### **Application Optimization**
```bash
# Enable caching
export REDIS_CACHE_ENABLED=true
export CACHE_TTL=3600

# Optimize Node.js settings
export NODE_OPTIONS="--max-old-space-size=4096 --optimize-for-size"

# Enable compression
export COMPRESSION_ENABLED=true
```

---

## 📞 Escalation Procedures

### **On-Call Rotation**
- **Primary**: Senior DevOps Engineer
- **Secondary**: Lead Backend Developer  
- **Escalation**: Engineering Manager
- **Executive**: CTO (P0 incidents only)

### **Contact Information**
```
Primary On-Call: +1-XXX-XXX-XXXX
Slack Channel: #production-alerts
Email: oncall@company.com
PagerDuty: https://company.pagerduty.com
```

### **Escalation Matrix**
| Severity | Response Time | Escalation Time |
|----------|---------------|-----------------|
| **P0** | 5 minutes | 15 minutes |
| **P1** | 15 minutes | 30 minutes |
| **P2** | 1 hour | 2 hours |
| **P3** | 4 hours | Next business day |

---

## 📋 Maintenance Schedules

### **Daily Tasks**
- **9:00 AM**: Morning health check
- **12:00 PM**: Midday performance review
- **6:00 PM**: Evening report generation review
- **11:00 PM**: Daily backup verification

### **Weekly Tasks**
- **Sunday 2:00 AM**: System optimization and cleanup
- **Wednesday 3:00 AM**: Data quality audit
- **Friday 5:00 PM**: Weekly performance review

### **Monthly Tasks**
- **1st Sunday**: Comprehensive performance review
- **15th**: Security audit and updates
- **Last Friday**: Capacity planning review

---

**📞 Emergency Contact**: For P0 incidents, call primary on-call immediately
**📚 Documentation**: Keep this runbook updated with new procedures
**🔄 Version**: 2.0 | Last Updated: [Current Date] 