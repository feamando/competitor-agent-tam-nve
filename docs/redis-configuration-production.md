# Redis Configuration for Production Deployment

**Document ID:** TP-024-5.2-Redis-Production-Configuration  
**Date:** August 5, 2025  
**Version:** 1.0  
**Status:** Production Ready  

## Overview

This document provides comprehensive Redis configuration requirements for production deployment of the Competitor Research Agent, specifically focusing on the report generation queue system that was enhanced in TP-024 to resolve A-002 issues.

## Why Redis is Critical

**Primary Purpose:** Queue system for scheduled report generation

**Key Functions:**
- **Job Queue Management:** Asynchronous report generation tasks
- **Scheduled Report Execution:** Cron job manager dependencies  
- **System Resilience:** Task retry and recovery mechanisms
- **Performance:** Non-blocking report generation

**A-002 Context:** Redis connectivity issues were identified as a secondary root cause for scheduled report execution failures.

## Production Redis Configuration

### 1. Basic Redis Setup

**Installation (Ubuntu/Debian):**
```bash
# Install Redis server
sudo apt update
sudo apt install redis-server

# Start Redis service
sudo systemctl start redis-server
sudo systemctl enable redis-server
```

**Installation (CentOS/RHEL):**
```bash
# Install Redis
sudo yum install epel-release
sudo yum install redis

# Start Redis service
sudo systemctl start redis
sudo systemctl enable redis
```

**Installation (macOS - Development):**
```bash
# Install via Homebrew
brew install redis

# Start Redis service
brew services start redis
```

### 2. Production Configuration (/etc/redis/redis.conf)

**Critical Settings:**

```ini
# Network and Security
bind 127.0.0.1 ::1                    # Bind to specific interfaces
protected-mode yes                     # Enable protected mode
port 6379                             # Default port (change for security)
timeout 300                           # Client timeout (5 minutes)

# Authentication (CRITICAL for production)
requirepass your_secure_redis_password # Strong password required

# Memory Management
maxmemory 1gb                         # Set appropriate memory limit
maxmemory-policy allkeys-lru          # Eviction policy

# Persistence (Important for queue recovery)
save 900 1                            # Save snapshot if 1 key changed in 900 seconds
save 300 10                           # Save snapshot if 10 keys changed in 300 seconds  
save 60 10000                         # Save snapshot if 10000 keys changed in 60 seconds

# AOF (Append Only File) for better durability
appendonly yes                        # Enable AOF persistence
appendfilename "appendonly.aof"       # AOF filename
appendfsync everysec                  # Sync every second (balanced performance/durability)

# Logging
loglevel notice                       # Production log level
logfile /var/log/redis/redis-server.log

# Performance
tcp-keepalive 300                     # TCP keepalive
tcp-backlog 511                       # TCP listen backlog

# Slow Log (for debugging)
slowlog-log-slower-than 10000         # Log queries slower than 10ms
slowlog-max-len 128                   # Keep last 128 slow queries
```

### 3. Environment Variables

**Application Configuration (.env):**
```bash
# Redis Connection
REDIS_HOST=localhost                   # Redis server host
REDIS_PORT=6379                       # Redis server port  
REDIS_PASSWORD=your_secure_password   # Redis password (REQUIRED for production)
REDIS_DB=0                            # Redis database number

# Connection Pool Settings
REDIS_MAX_CONNECTIONS=10              # Maximum Redis connections
REDIS_MIN_CONNECTIONS=2               # Minimum Redis connections
REDIS_CONNECT_TIMEOUT=5000           # Connection timeout (5 seconds)
REDIS_COMMAND_TIMEOUT=10000          # Command timeout (10 seconds)

# Queue Configuration
REDIS_QUEUE_PREFIX=tp024-prod         # Queue name prefix
REDIS_MAX_JOBS_PER_QUEUE=100         # Maximum jobs per queue
REDIS_JOB_RETENTION_HOURS=24         # Keep completed jobs for 24 hours
```

### 4. Security Configuration

**Firewall Rules:**
```bash
# Allow Redis access only from application servers
sudo ufw allow from 10.0.1.0/24 to any port 6379

# Block Redis from public access
sudo ufw deny 6379
```

**Redis ACL (Access Control Lists) - Redis 6.0+:**
```redis
# Create dedicated user for application
ACL SETUSER tp024-app >your_app_password ~* +@all -flushdb -flushall -shutdown -debug

# Disable default user in production
ACL SETUSER default off
```

### 5. Monitoring and Health Checks

**Health Check Script:**
```bash
#!/bin/bash
# redis-health-check.sh

REDIS_HOST=${REDIS_HOST:-localhost}
REDIS_PORT=${REDIS_PORT:-6379}
REDIS_PASSWORD=${REDIS_PASSWORD}

if [ -z "$REDIS_PASSWORD" ]; then
    echo "ERROR: REDIS_PASSWORD not set"
    exit 1
fi

# Test Redis connectivity
redis-cli -h $REDIS_HOST -p $REDIS_PORT -a $REDIS_PASSWORD ping

if [ $? -eq 0 ]; then
    echo "✅ Redis health check: PASSED"
    exit 0
else
    echo "❌ Redis health check: FAILED"
    exit 1
fi
```

**Monitoring Commands:**
```bash
# Check Redis info
redis-cli -a your_password INFO

# Monitor Redis operations in real-time  
redis-cli -a your_password MONITOR

# Check memory usage
redis-cli -a your_password INFO memory

# Check connected clients
redis-cli -a your_password CLIENT LIST

# Check slow queries
redis-cli -a your_password SLOWLOG GET 10
```

### 6. Queue-Specific Configuration

**Bull Queue Settings (Application Code):**
```typescript
// Redis configuration for Bull queues
const queueConfig = {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    
    // Connection resilience (TP-024 improvements)
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3,
    connectTimeout: 5000,
    commandTimeout: 10000,
    
    // Connection pool
    family: 4, // IPv4
    keepAlive: true,
    
    // Reconnection strategy
    retryConnect: (retries: number) => {
      return Math.min(retries * 50, 2000); // Exponential backoff, max 2s
    }
  },
  
  defaultJobOptions: {
    removeOnComplete: 100,    // Keep last 100 completed jobs
    removeOnFail: 50,         // Keep last 50 failed jobs
    attempts: 3,              // Retry failed jobs 3 times
    backoff: {
      type: 'exponential',
      delay: 2000             // Start with 2 second delay
    }
  }
};
```

## High Availability Configuration

### 1. Redis Sentinel (Recommended for Production)

**Master Configuration:**
```ini
# redis-master.conf
port 6379
requirepass master_password
masterauth master_password
```

**Sentinel Configuration:**
```ini
# sentinel.conf
port 26379
sentinel monitor mymaster 127.0.0.1 6379 2
sentinel auth-pass mymaster master_password
sentinel down-after-milliseconds mymaster 5000
sentinel failover-timeout mymaster 10000
```

**Application Configuration for Sentinel:**
```typescript
const redisConfig = {
  sentinels: [
    { host: 'sentinel1.example.com', port: 26379 },
    { host: 'sentinel2.example.com', port: 26379 },
    { host: 'sentinel3.example.com', port: 26379 }
  ],
  name: 'mymaster',
  password: 'master_password'
};
```

### 2. Redis Cluster (For Large Scale)

**Minimum Cluster Setup:**
- 3 master nodes
- 3 slave nodes (1 per master)
- Each node on different physical servers

**Cluster Configuration:**
```ini
# redis-cluster.conf
cluster-enabled yes
cluster-config-file nodes.conf
cluster-node-timeout 5000
cluster-announce-ip 10.0.1.1
cluster-announce-port 6379
```

## Performance Tuning

### 1. Memory Optimization

**Memory Analysis:**
```bash
# Check memory usage by key type
redis-cli -a password --bigkeys

# Memory usage report
redis-cli -a password INFO memory

# Find memory usage by key pattern
redis-cli -a password MEMORY USAGE queue:*
```

**Optimization Settings:**
```ini
# Memory efficiency
hash-max-ziplist-entries 512
hash-max-ziplist-value 64
list-max-ziplist-size -2
set-max-intset-entries 512
zset-max-ziplist-entries 128
zset-max-ziplist-value 64
```

### 2. Network Optimization

**TCP Settings:**
```ini
# Increase backlog for high connection load
tcp-backlog 511

# Enable TCP keepalive
tcp-keepalive 300

# Pipeline optimization
tcp-nodelay yes
```

### 3. Queue Performance

**Optimized Queue Settings:**
```typescript
const performanceConfig = {
  // Connection pool
  maxConnections: 20,
  minConnections: 5,
  
  // Pipeline commands for better throughput
  enableAutoPipelining: true,
  
  // Lazy connection for better resource usage
  lazyConnect: true,
  
  // Optimized timeouts
  connectTimeout: 3000,
  commandTimeout: 5000
};
```

## Backup and Recovery

### 1. Automated Backups

**Backup Script:**
```bash
#!/bin/bash
# redis-backup.sh

BACKUP_DIR="/var/backups/redis"
DATE=$(date +%Y%m%d_%H%M%S)
REDIS_HOST=${REDIS_HOST:-localhost}
REDIS_PORT=${REDIS_PORT:-6379}

# Create backup directory
mkdir -p $BACKUP_DIR

# Create RDB backup
redis-cli -h $REDIS_HOST -p $REDIS_PORT -a $REDIS_PASSWORD BGSAVE

# Wait for backup to complete
while [ $(redis-cli -h $REDIS_HOST -p $REDIS_PORT -a $REDIS_PASSWORD LASTSAVE) -eq $(redis-cli -h $REDIS_HOST -p $REDIS_PORT -a $REDIS_PASSWORD LASTSAVE) ]; do
    sleep 1
done

# Copy backup file
cp /var/lib/redis/dump.rdb $BACKUP_DIR/dump_$DATE.rdb

# Keep only last 7 days of backups
find $BACKUP_DIR -name "dump_*.rdb" -mtime +7 -delete

echo "✅ Redis backup completed: dump_$DATE.rdb"
```

### 2. Recovery Procedures

**Recovery from RDB:**
```bash
# Stop Redis
sudo systemctl stop redis

# Replace dump.rdb
sudo cp /var/backups/redis/dump_YYYYMMDD_HHMMSS.rdb /var/lib/redis/dump.rdb
sudo chown redis:redis /var/lib/redis/dump.rdb

# Start Redis
sudo systemctl start redis
```

**Recovery from AOF:**
```bash
# Check AOF file integrity
redis-check-aof /var/lib/redis/appendonly.aof

# Fix AOF if corrupted (if safe to do so)
redis-check-aof --fix /var/lib/redis/appendonly.aof
```

## Troubleshooting

### Common Issues

1. **"Redis connection refused"**
   ```bash
   # Check if Redis is running
   sudo systemctl status redis
   
   # Check Redis logs
   sudo tail -f /var/log/redis/redis-server.log
   
   # Test connection
   redis-cli -h localhost -p 6379 ping
   ```

2. **"Authentication failed"**
   ```bash
   # Verify password
   redis-cli -a your_password ping
   
   # Check Redis configuration
   grep "requirepass" /etc/redis/redis.conf
   ```

3. **"Memory usage high"**
   ```bash
   # Check memory usage
   redis-cli -a password INFO memory
   
   # Find large keys
   redis-cli -a password --bigkeys
   
   # Check eviction policy
   redis-cli -a password CONFIG GET maxmemory-policy
   ```

4. **"Queue jobs not processing"**
   ```bash
   # Check queue status
   redis-cli -a password KEYS "bull:*"
   
   # Monitor queue operations
   redis-cli -a password MONITOR | grep "bull"
   
   # Check failed jobs
   redis-cli -a password LLEN "bull:report-generation:failed"
   ```

### Performance Issues

1. **Slow queries:**
   ```bash
   # Check slow log
   redis-cli -a password SLOWLOG GET 10
   
   # Reset slow log
   redis-cli -a password SLOWLOG RESET
   ```

2. **High CPU usage:**
   ```bash
   # Check command statistics
   redis-cli -a password INFO commandstats
   
   # Monitor operations
   redis-cli -a password --latency-history
   ```

## Integration with TP-024 Fixes

### Service Initialization (Task 2.4)

The middleware now initializes services that depend on Redis:

```typescript
// src/middleware.ts - TP-024 Task 2.4 implementation
async function initializeServices() {
  // This creates Redis connections for queue management
  const { getAutoReportService } = await import('./services/autoReportGenerationService');
  const autoReportService = getAutoReportService();
  
  // Validates Redis connectivity as part of initialization
}
```

### Queue Recovery (Task 4.5)

Enhanced error handling for Redis failures:

```typescript
// Queue configuration with recovery mechanisms
const queueConfig = {
  redis: redisConfig,
  settings: {
    stalledInterval: 30 * 1000,    // Check for stalled jobs every 30s
    maxStalledCount: 1             // Retry stalled jobs once
  }
};
```

## Production Checklist

### Pre-Deployment

- [ ] Redis server installed and configured
- [ ] Strong password set (`requirepass`)
- [ ] Firewall rules configured
- [ ] Memory limits set appropriately
- [ ] Persistence enabled (RDB + AOF)
- [ ] Monitoring configured
- [ ] Backup procedures tested

### Environment Variables

- [ ] `REDIS_HOST` set correctly
- [ ] `REDIS_PORT` configured
- [ ] `REDIS_PASSWORD` set (strong password)
- [ ] Connection pool settings configured
- [ ] Queue configuration validated

### Testing

- [ ] Basic connectivity test passed
- [ ] Queue operations test passed
- [ ] Health check endpoint working
- [ ] Failover scenarios tested (if using Sentinel/Cluster)
- [ ] Backup and recovery procedures validated

### Monitoring

- [ ] Redis monitoring dashboard configured
- [ ] Alerts set for memory usage
- [ ] Alerts set for connection failures
- [ ] Queue depth monitoring enabled
- [ ] Performance metrics collection active

## Support and Maintenance

### Regular Maintenance

1. **Weekly:**
   - Check memory usage trends
   - Review slow query log
   - Validate backup integrity

2. **Monthly:**
   - Update Redis to latest stable version
   - Review and rotate logs
   - Performance optimization review

3. **Quarterly:**
   - Security audit and password rotation
   - Disaster recovery testing
   - Capacity planning review

### Emergency Procedures

1. **Redis Down:**
   - Check system health endpoint
   - Restart Redis service
   - Validate queue recovery
   - Notify development team

2. **Memory Issues:**
   - Identify large keys
   - Implement key expiration
   - Scale Redis resources

3. **Performance Degradation:**
   - Check slow query log
   - Review connection pool settings
   - Monitor network latency

---

**Last Updated:** August 5, 2025  
**Maintained By:** TP-024 Implementation Team  
**Review Cycle:** Quarterly  
**Status:** Production Ready 