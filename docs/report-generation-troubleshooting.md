# Report Generation Troubleshooting Guide

**Document ID:** TP-024-5.3-Report-Generation-Troubleshooting  
**Date:** August 5, 2025  
**Version:** 2.0 (Updated with TP-024 fixes)  
**Status:** Production Ready  

## Overview

This guide provides comprehensive troubleshooting procedures for report generation issues in the Competitor Research Agent system. It includes solutions for problems identified in A-002 root cause analysis and validation procedures for all TP-024 fixes.

## Quick Diagnosis Checklist

**🚨 EMERGENCY CHECKLIST - Use this for immediate issue triage:**

- [ ] Check system health: `curl http://localhost:3000/api/health/report-generation`
- [ ] Verify Redis connectivity: `redis-cli ping`
- [ ] Check recent logs: `tail -f logs/application.log | grep TP-024`
- [ ] Validate AutoReportGenerationService status
- [ ] Confirm project parameters are correctly set

## Common Issues & Solutions

### 1. Reports Not Generating for Chat-Created Projects

**🔍 SYMPTOMS:**
- Chat interface creates project successfully
- No initial report appears after 5+ minutes
- Project shows in dashboard but reports section is empty
- No error messages displayed to user

**🎯 ROOT CAUSE:** Missing `autoGenerateInitialReport` flag (A-002 Primary Issue)

**✅ STATUS:** RESOLVED in TP-024 Task 1.2

**🔧 DIAGNOSIS:**
```bash
# Check project parameters for the flag
curl -s http://localhost:3000/api/projects/{project-id} | jq '.parameters.autoGenerateInitialReport'

# Should return: true
# If returns: null or false, this confirms the issue
```

**💊 SOLUTION:**
This issue has been resolved by TP-024 fixes. For legacy projects, manually update:

```sql
-- Update existing projects missing the flag
UPDATE Project 
SET parameters = JSON_SET(parameters, '$.autoGenerateInitialReport', true)
WHERE JSON_EXTRACT(parameters, '$.createdViaChat') = true
  AND JSON_EXTRACT(parameters, '$.autoGenerateInitialReport') IS NULL;
```

**🔍 PREVENTION:**
- Chat interface now automatically sets this flag
- Validation added to project creation process
- Monitoring alerts for projects missing initial reports

### 2. Scheduled Reports Not Executing

**🔍 SYMPTOMS:**
- Initial reports generate successfully
- Daily/weekly scheduled reports never appear
- Schedule configuration exists in project parameters
- No error messages about scheduling

**🎯 ROOT CAUSE:** AutoReportGenerationService not initialized at startup (A-002 Secondary Issue)

**✅ STATUS:** RESOLVED in TP-024 Task 2.4

**🔧 DIAGNOSIS:**
```bash
# Check if service initialized in logs
grep "AutoReportGenerationService initialized" logs/application.log

# Check Redis queue status
redis-cli KEYS "bull:*" | grep report-generation

# Check cron job manager status
curl -s http://localhost:3000/api/health/report-generation | jq '.components.scheduledReports'
```

**💊 SOLUTION:**
1. **Verify middleware fix is active:**
   ```bash
   # Should see this in startup logs:
   grep "TP-024.*AutoReportGenerationService initialized" logs/application.log
   ```

2. **Manual service restart (if needed):**
   ```bash
   # Restart application to trigger middleware initialization
   pm2 restart competitor-research-agent
   # or
   systemctl restart competitor-research-agent
   ```

3. **Verify Redis connectivity:**
   ```bash
   # Test Redis connection
   redis-cli ping
   # Should return: PONG
   ```

**🔍 PREVENTION:**
- Middleware now initializes services on app startup
- Health check endpoint monitors service status
- Alerting configured for service initialization failures

### 3. Redis Connection Failures

**🔍 SYMPTOMS:**
- Reports fail to generate with queue-related errors
- Health check shows scheduled reports as "critical"
- Error logs mention Redis connection refused
- Queue operations failing

**🎯 ROOT CAUSE:** Redis server not running or misconfigured

**🔧 DIAGNOSIS:**
```bash
# Check Redis server status
redis-cli ping

# Check Redis logs
sudo tail -f /var/log/redis/redis-server.log

# Test queue connectivity
curl -s http://localhost:3000/api/health/report-generation | jq '.components.scheduledReports.status'

# Check environment variables
env | grep REDIS
```

**💊 SOLUTION:**
1. **Start Redis server:**
   ```bash
   # macOS (development)
   brew services start redis
   
   # Linux (production)
   sudo systemctl start redis
   sudo systemctl enable redis
   ```

2. **Fix Redis configuration:**
   ```bash
   # Check Redis config
   redis-cli CONFIG GET "*"
   
   # Set password if required
   redis-cli CONFIG SET requirepass your_secure_password
   ```

3. **Update application environment:**
   ```bash
   # .env file
   REDIS_HOST=localhost
   REDIS_PORT=6379
   REDIS_PASSWORD=your_secure_password
   ```

**🔍 PREVENTION:**
- Redis monitoring and alerting
- Health check endpoint includes Redis connectivity
- Queue recovery mechanisms implemented

### 4. AWS Service Unavailability

**🔍 SYMPTOMS:**
- Chat interface creates project but reports not generated
- Error messages about AWS credentials or service unavailability
- Health check shows degraded status for report generation

**🔧 DIAGNOSIS:**
```bash
# Check AWS credentials
aws sts get-caller-identity

# Check application logs for AWS errors
grep -i "aws\|credential" logs/application.log | tail -20

# Test health endpoint
curl -s http://localhost:3000/api/health/report-generation | jq '.components.reportGeneration'
```

**💊 SOLUTION:**
1. **Verify AWS credentials:**
   ```bash
   # Check environment variables
   env | grep AWS
   
   # Should have:
   # AWS_ACCESS_KEY_ID
   # AWS_SECRET_ACCESS_KEY
   # AWS_REGION
   ```

2. **Test AWS connectivity:**
   ```bash
   # Test AWS CLI access
   aws sts get-caller-identity
   
   # Test specific services
   aws bedrock list-foundation-models
   ```

3. **Check application configuration:**
   ```typescript
   // Verify AWS SDK configuration
   const { AWS_REGION, AWS_ACCESS_KEY_ID } = process.env;
   console.log('AWS Config:', { region: AWS_REGION, hasKey: !!AWS_ACCESS_KEY_ID });
   ```

**🔍 PREVENTION:**
- AWS credential monitoring
- Service degradation fallback mechanisms
- User notification for AWS service issues

### 5. Database Connection Issues

**🔍 SYMPTOMS:**
- Project creation fails
- Reports exist but can't be retrieved
- General application errors
- Health check shows database issues

**🔧 DIAGNOSIS:**
```bash
# Check database connectivity
npx prisma studio --port 5555

# Test database queries
node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.project.count().then(count => console.log('Projects:', count)).catch(console.error);
"

# Check database logs (if using PostgreSQL)
sudo tail -f /var/log/postgresql/postgresql-*.log
```

**💊 SOLUTION:**
1. **Restart database services:**
   ```bash
   # PostgreSQL
   sudo systemctl restart postgresql
   
   # Check Prisma connection
   npx prisma db push
   npx prisma generate
   ```

2. **Fix database URL:**
   ```bash
   # .env file
   DATABASE_URL="postgresql://user:password@localhost:5432/competitor_research?schema=public"
   ```

3. **Run database migrations:**
   ```bash
   npx prisma migrate deploy
   ```

**🔍 PREVENTION:**
- Database connection monitoring
- Connection pool configuration
- Automated backup and recovery procedures

## Advanced Troubleshooting

### Service Health Monitoring

**Health Check Endpoint Analysis:**
```bash
# Get comprehensive health status
curl -s http://localhost:3000/api/health/report-generation | jq '.'

# Expected healthy response:
{
  "status": "healthy",
  "components": {
    "reportGeneration": {"status": "healthy"},
    "scheduledReports": {"status": "healthy"},
    "monitoring": {"status": "healthy"},
    "alerting": {"status": "healthy"},
    "validation": {"status": "healthy"}
  },
  "summary": {
    "totalProjects": 50,
    "healthyProjects": 48,
    "issuesDetected": 2
  }
}
```

**Component Status Interpretation:**
- **healthy**: Component functioning normally
- **degraded**: Component working but with issues
- **critical**: Component failure affecting functionality
- **unknown**: Component status cannot be determined

### Log Analysis Techniques

**Key Log Patterns to Monitor:**
```bash
# TP-024 specific logs
grep "TP-024" logs/application.log | tail -20

# Service initialization logs
grep "AutoReportGenerationService initialized" logs/application.log

# Redis connectivity logs
grep -i "redis\|queue" logs/application.log | tail -10

# Error patterns
grep -i "error\|failed\|exception" logs/application.log | tail -20

# Report generation tracking
grep "report.*generated\|report.*failed" logs/application.log | tail -10
```

**Log Level Configuration:**
```bash
# Increase logging for debugging
export LOG_LEVEL=debug

# Monitor real-time logs
tail -f logs/application.log | grep -E "(TP-024|ERROR|report)"
```

### Performance Troubleshooting

**Queue Performance Analysis:**
```bash
# Check Redis queue statistics
redis-cli INFO stats

# Monitor queue depth
redis-cli LLEN "bull:report-generation:waiting"
redis-cli LLEN "bull:report-generation:active"
redis-cli LLEN "bull:report-generation:completed"
redis-cli LLEN "bull:report-generation:failed"

# Check for stalled jobs
redis-cli KEYS "bull:report-generation:stalled"
```

**Memory and CPU Monitoring:**
```bash
# Check application memory usage
ps aux | grep node | grep -v grep

# Monitor Redis memory usage
redis-cli INFO memory

# System resource usage
top -p $(pgrep -f "node.*competitor-research")
```

### Database Troubleshooting

**Project Parameter Analysis:**
```sql
-- Check projects missing autoGenerateInitialReport flag
SELECT id, name, JSON_EXTRACT(parameters, '$.autoGenerateInitialReport') as hasFlag
FROM Project 
WHERE JSON_EXTRACT(parameters, '$.createdViaChat') = true
ORDER BY createdAt DESC
LIMIT 10;

-- Check scheduled report configurations
SELECT id, name, JSON_EXTRACT(parameters, '$.autoReportSchedule') as schedule
FROM Project 
WHERE JSON_EXTRACT(parameters, '$.autoReportSchedule.isActive') = true
ORDER BY createdAt DESC
LIMIT 5;

-- Find projects without reports
SELECT p.id, p.name, p.createdAt, COUNT(r.id) as reportCount
FROM Project p 
LEFT JOIN Report r ON p.id = r.projectId
GROUP BY p.id, p.name, p.createdAt
HAVING COUNT(r.id) = 0
ORDER BY p.createdAt DESC
LIMIT 10;
```

**Report Analysis:**
```sql
-- Check report generation patterns
SELECT 
  DATE(createdAt) as date,
  COUNT(*) as reportsGenerated,
  COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) as completed,
  COUNT(CASE WHEN status = 'FAILED' THEN 1 END) as failed
FROM Report 
WHERE createdAt >= DATE_SUB(NOW(), INTERVAL 7 DAY)
GROUP BY DATE(createdAt)
ORDER BY date DESC;
```

## Monitoring and Alerting

### Key Metrics to Monitor

1. **Report Generation Success Rate:**
   - Target: > 95% success rate
   - Alert: < 90% success rate over 1 hour

2. **Time to First Report:**
   - Target: < 5 minutes for chat-created projects
   - Alert: > 10 minutes average over 1 hour

3. **Scheduled Report Execution:**
   - Target: 100% of scheduled reports execute within 1 hour
   - Alert: Any scheduled report > 25 hours overdue

4. **System Component Health:**
   - Target: All components "healthy"
   - Alert: Any component "critical" for > 5 minutes

### Setting Up Monitoring

**Health Check Monitoring:**
```bash
#!/bin/bash
# health-monitor.sh

HEALTH_URL="http://localhost:3000/api/health/report-generation"
ALERT_WEBHOOK="https://your-monitoring-system.com/webhook"

response=$(curl -s $HEALTH_URL)
status=$(echo $response | jq -r '.status')

if [ "$status" != "healthy" ]; then
    echo "🚨 ALERT: System status is $status"
    # Send alert to monitoring system
    curl -X POST $ALERT_WEBHOOK \
         -H "Content-Type: application/json" \
         -d "{\"alert\":\"Report system unhealthy\",\"status\":\"$status\"}"
fi
```

**Cron Job for Regular Monitoring:**
```bash
# Add to crontab (every 5 minutes)
*/5 * * * * /path/to/health-monitor.sh >> /var/log/health-monitor.log 2>&1
```

## Emergency Procedures

### Complete System Recovery

**When everything is broken:**

1. **Stop all services:**
   ```bash
   pm2 stop all
   sudo systemctl stop redis
   ```

2. **Check system resources:**
   ```bash
   df -h          # Disk space
   free -m        # Memory
   top            # CPU usage
   ```

3. **Start services in order:**
   ```bash
   # 1. Database (if using PostgreSQL)
   sudo systemctl start postgresql
   
   # 2. Redis
   sudo systemctl start redis
   redis-cli ping  # Verify
   
   # 3. Application
   pm2 start ecosystem.config.js
   ```

4. **Verify system health:**
   ```bash
   # Wait 30 seconds for initialization
   sleep 30
   
   # Check health endpoint
   curl http://localhost:3000/api/health/report-generation | jq '.status'
   ```

### Data Recovery

**If reports are lost but projects exist:**
```bash
# Generate missing initial reports for recent projects
node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function regenerateReports() {
  const projectsWithoutReports = await prisma.project.findMany({
    where: {
      reports: { none: {} },
      createdAt: { gte: new Date(Date.now() - 7*24*60*60*1000) } // Last 7 days
    }
  });
  
  console.log(\`Found \${projectsWithoutReports.length} projects without reports\`);
  
  for (const project of projectsWithoutReports) {
    console.log(\`Triggering report for project: \${project.id}\`);
    // Manual trigger logic would go here
  }
}

regenerateReports().catch(console.error);
"
```

## Prevention Best Practices

### Development Practices

1. **Always test report generation in development:**
   ```bash
   # Create test project and verify report generation
   npm run test:e2e -- --grep "report generation"
   ```

2. **Monitor health checks during deployment:**
   ```bash
   # Add health check to deployment script
   curl http://localhost:3000/api/health/report-generation || exit 1
   ```

3. **Use feature flags for risky changes:**
   ```typescript
   if (process.env.ENABLE_NEW_REPORT_LOGIC === 'true') {
     // New report generation logic
   }
   ```

### Production Deployment

1. **Pre-deployment checklist:**
   - [ ] Health check endpoint responsive
   - [ ] Redis connectivity verified
   - [ ] Database migrations applied
   - [ ] Environment variables set correctly
   - [ ] Backup procedures tested

2. **Post-deployment verification:**
   ```bash
   # Create test project and verify report generation
   ./scripts/deployment-verification.sh
   ```

3. **Monitoring setup:**
   - [ ] Health check monitoring enabled
   - [ ] Log aggregation configured
   - [ ] Alert notifications working
   - [ ] Performance metrics collection active

## Getting Help

### Internal Escalation

1. **Level 1 - Self Service:**
   - Use this troubleshooting guide
   - Check health endpoint
   - Review application logs

2. **Level 2 - Development Team:**
   - Provide health check output
   - Include relevant log snippets
   - Share project IDs affected

3. **Level 3 - Infrastructure Team:**
   - Include system metrics
   - Provide Redis and database status
   - Share network connectivity information

### Information to Collect

**For any support request, provide:**

```bash
# System information
uname -a
node --version
npm --version

# Health status
curl -s http://localhost:3000/api/health/report-generation | jq '.'

# Recent logs
tail -100 logs/application.log | grep -E "(ERROR|TP-024|report)"

# Redis status
redis-cli INFO server | head -20

# Database connectivity
npx prisma db push --preview-feature
```

### External Resources

- **Redis Documentation:** https://redis.io/documentation
- **Prisma Documentation:** https://www.prisma.io/docs/
- **Bull Queue Documentation:** https://github.com/OptimalBits/bull
- **AWS SDK Documentation:** https://docs.aws.amazon.com/sdk-for-javascript/

## Appendix: TP-024 Validation Scripts

### Verify All Fixes Are Working

```bash
#!/bin/bash
# validate-tp024-fixes.sh

echo "🧪 TP-024 Fix Validation Script"
echo "================================"

# Test 1: Chat interface project creation
echo "✅ Testing chat project creation..."
curl -X POST http://localhost:3000/api/chat/create-project \
     -H "Content-Type: application/json" \
     -d '{"name":"TP-024 Validation Test","competitors":["test.com"]}' | jq '.parameters.autoGenerateInitialReport'

# Test 2: Service initialization
echo "✅ Testing service initialization..."
curl -s http://localhost:3000/api/health/report-generation | jq '.components.scheduledReports.status'

# Test 3: Redis connectivity
echo "✅ Testing Redis connectivity..."
redis-cli ping

# Test 4: Monitoring system
echo "✅ Testing monitoring system..."
curl -s http://localhost:3000/api/health/report-generation | jq '.components.monitoring.status'

echo "🎉 TP-024 validation complete!"
```

---

**Last Updated:** August 5, 2025  
**Version:** 2.0 (TP-024 Enhanced)  
**Maintained By:** TP-024 Implementation Team  
**Review Cycle:** Monthly  
**Status:** Production Ready 