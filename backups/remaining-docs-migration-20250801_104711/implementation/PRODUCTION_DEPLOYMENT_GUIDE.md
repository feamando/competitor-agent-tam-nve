# Production Deployment Guide
**Competitor Research Agent - Phase 4 Production Readiness**

## 🚀 **Quick Start (5 Minutes)**

```bash
# 1. Clone and prepare
git clone <your-repo>
cd competitor-research-agent

# 2. Create production environment file
cp .env.example .env.production

# 3. Configure environment (see Configuration section)
nano .env.production

# 4. Deploy with Docker
docker-compose -f docker-compose.prod.yml up -d

# 5. Verify deployment
curl http://localhost/api/health
```

## 📋 **Pre-Deployment Checklist**

### **✅ Infrastructure Requirements**
- [ ] **Server**: 4GB RAM, 2 CPU cores minimum
- [ ] **Storage**: 50GB SSD for database and reports
- [ ] **Network**: Static IP or domain name configured
- [ ] **Docker**: Docker Engine 20.10+ and Docker Compose 2.0+
- [ ] **Ports**: 80, 443, 3000, 9090, 3001 available

### **✅ Security Prerequisites**
- [ ] **SSL Certificate**: Valid SSL certificate for HTTPS
- [ ] **Firewall**: Configured to allow only necessary ports
- [ ] **Backup**: Automated backup strategy configured
- [ ] **Monitoring**: Log aggregation and alerting setup

## 🔧 **Environment Configuration**

### **Required Environment Variables**

Create `.env.production` with these values:

```bash
# Application
NODE_ENV=production
APP_VERSION=1.0.0
NEXTAUTH_URL=https://your-domain.com

# Security (GENERATE SECURE VALUES)
NEXTAUTH_SECRET=your-32-char-secure-random-string
POSTGRES_PASSWORD=your-secure-db-password
GRAFANA_PASSWORD=your-grafana-admin-password

# AI Services
ANTHROPIC_API_KEY=your-anthropic-key
AWS_ACCESS_KEY_ID=your-aws-access-key
AWS_SECRET_ACCESS_KEY=your-aws-secret-key
AWS_REGION=us-east-1

# Performance
CACHE_TTL_MINUTES=5
RATE_LIMIT_ENABLED=true
```

### **Generate Secure Secrets**

```bash
# Generate NextAuth secret
openssl rand -base64 32

# Generate strong passwords
openssl rand -base64 24
```

## 🐳 **Docker Deployment**

### **Production Deployment**

```bash
# Build and start all services
docker-compose -f docker-compose.prod.yml up -d

# Check service status
docker-compose -f docker-compose.prod.yml ps

# View logs
docker-compose -f docker-compose.prod.yml logs -f app

# Stop services
docker-compose -f docker-compose.prod.yml down
```

### **Service Architecture**

| Service | Port | Purpose | Resources |
|---------|------|---------|-----------|
| **App** | 3000 | Main application | 2GB RAM, 1 CPU |
| **Database** | 5432 | PostgreSQL | 1GB RAM, 0.5 CPU |
| **Redis** | 6379 | Caching | 512MB RAM, 0.25 CPU |
| **Nginx** | 80/443 | Reverse proxy | 256MB RAM, 0.25 CPU |
| **Prometheus** | 9090 | Metrics | 512MB RAM, 0.5 CPU |
| **Grafana** | 3001 | Dashboards | 512MB RAM, 0.5 CPU |

## 🛡️ **Security Configuration**

### **SSL/TLS Setup**

```bash
# Create SSL directory
mkdir -p nginx/ssl

# Copy your SSL certificates
cp your-domain.crt nginx/ssl/
cp your-domain.key nginx/ssl/
```

### **Nginx Configuration**

Create `nginx/nginx.conf`:

```nginx
events {
    worker_connections 1024;
}

http {
    upstream app {
        server app:3000;
    }

    server {
        listen 80;
        server_name your-domain.com;
        return 301 https://$server_name$request_uri;
    }

    server {
        listen 443 ssl http2;
        server_name your-domain.com;

        ssl_certificate /etc/nginx/ssl/your-domain.crt;
        ssl_certificate_key /etc/nginx/ssl/your-domain.key;

        location / {
            proxy_pass http://app;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        location /api/health {
            proxy_pass http://app;
            access_log off;
        }
    }
}
```

### **Firewall Configuration**

```bash
# Ubuntu/Debian with UFW
sudo ufw allow 22/tcp      # SSH
sudo ufw allow 80/tcp      # HTTP
sudo ufw allow 443/tcp     # HTTPS
sudo ufw deny 3000/tcp     # Block direct app access
sudo ufw enable
```

## 📊 **Monitoring & Health Checks**

### **Health Check Endpoints**

| Endpoint | Purpose | Expected Response |
|----------|---------|-------------------|
| `/api/health` | Overall system health | 200 OK with status |
| `/api/health/database` | Database connectivity | 200 OK if connected |
| `/api/health/memory` | Memory usage | 200 OK with metrics |

### **Performance Monitoring**

```bash
# Check system health
curl https://your-domain.com/api/health | jq

# Monitor performance metrics
curl https://your-domain.com/api/health | jq '.metrics'

# Expected response time: <100ms
# Expected memory usage: <75%
```

### **Grafana Dashboards**

Access at: `https://your-domain.com:3001`
- **Login**: admin / `${GRAFANA_PASSWORD}`
- **Dashboards**: Pre-configured with app metrics
- **Alerts**: Memory, CPU, and response time alerts

## 🔄 **Backup & Recovery**

### **Automated Backups**

```bash
# Create backup script
cat > backup.sh << 'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
docker exec competitor-research-db pg_dump -U postgres competitor_research > backups/db_backup_$DATE.sql
tar -czf backups/reports_backup_$DATE.tar.gz reports/
echo "Backup completed: $DATE"
EOF

chmod +x backup.sh

# Schedule daily backups
echo "0 2 * * * /path/to/backup.sh" | crontab -
```

### **Recovery Procedures**

```bash
# Restore database
docker exec -i competitor-research-db psql -U postgres competitor_research < backups/db_backup_YYYYMMDD_HHMMSS.sql

# Restore reports
tar -xzf backups/reports_backup_YYYYMMDD_HHMMSS.tar.gz
```

## 🚨 **Troubleshooting**

### **Common Issues**

#### **Service Won't Start**
```bash
# Check logs
docker-compose -f docker-compose.prod.yml logs app

# Check disk space
df -h

# Check memory
free -m
```

#### **Database Connection Issues**
```bash
# Test database connection
docker exec competitor-research-db pg_isready -U postgres

# Check database logs
docker-compose -f docker-compose.prod.yml logs db
```

#### **Performance Issues**
```bash
# Check API response times
curl -w "%{time_total}\n" -o /dev/null -s https://your-domain.com/api/health

# Monitor container resources
docker stats
```

### **Emergency Procedures**

#### **Rollback Deployment**
```bash
# Stop current deployment
docker-compose -f docker-compose.prod.yml down

# Restore from backup
./restore.sh BACKUP_DATE

# Start services
docker-compose -f docker-compose.prod.yml up -d
```

## 🎯 **Performance Optimization**

### **Database Optimization**

```sql
-- Add indexes for better performance
CREATE INDEX CONCURRENTLY idx_report_created_at ON reports(created_at DESC);
CREATE INDEX CONCURRENTLY idx_project_name ON projects(name);
```

### **Caching Strategy**

- **API Responses**: 5-minute TTL for report listings
- **Static Assets**: 1-year cache for images/CSS/JS
- **Database Queries**: Redis caching for frequent queries

### **Resource Monitoring**

```bash
# Set up resource alerts
echo "Memory usage > 80%: Alert"
echo "CPU usage > 85%: Alert"
echo "Response time > 1s: Alert"
echo "Error rate > 1%: Alert"
```

## 📈 **Scaling Considerations**

### **Horizontal Scaling**

```yaml
# Scale app instances
docker-compose -f docker-compose.prod.yml up -d --scale app=3
```

### **Load Balancing**

```nginx
upstream app {
    server app_1:3000;
    server app_2:3000;
    server app_3:3000;
}
```

## ✅ **Production Readiness Checklist**

### **Pre-Go-Live**
- [ ] All environment variables configured
- [ ] SSL certificates installed and valid
- [ ] Database backups automated
- [ ] Monitoring dashboards configured
- [ ] Load testing completed
- [ ] Security scan completed
- [ ] Documentation updated

### **Go-Live**
- [ ] DNS records updated
- [ ] Services deployed and healthy
- [ ] Health checks passing
- [ ] Monitoring active
- [ ] Backup verification completed
- [ ] Performance baseline established

### **Post-Go-Live**
- [ ] 24-hour monitoring period completed
- [ ] Performance metrics within targets
- [ ] Error rates below 0.1%
- [ ] Backup/restore tested
- [ ] Team trained on operations

## 🆘 **Support & Maintenance**

### **Daily Operations**
- Monitor health dashboard
- Check error logs
- Verify backup completion
- Review performance metrics

### **Weekly Maintenance**
- Update security patches
- Archive old reports
- Review capacity planning
- Test backup restoration

### **Monthly Reviews**
- Security audit
- Performance optimization
- Cost analysis
- Documentation updates

---

**🎉 Congratulations! Your Competitor Research Agent is now production-ready!**

**Next Steps:**
1. Complete the checklist above
2. Deploy to staging environment first
3. Run load tests and security scans
4. Deploy to production
5. Monitor closely for first 48 hours 