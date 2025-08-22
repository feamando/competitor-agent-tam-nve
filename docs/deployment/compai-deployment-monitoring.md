# CompAI Deployment and Monitoring Guide

## Overview
This guide provides comprehensive instructions for deploying the CompAI integration and establishing monitoring for production environments. CompAI is designed for zero-downtime deployment with robust monitoring capabilities.

## Table of Contents
- [Pre-Deployment Checklist](#pre-deployment-checklist)
- [Deployment Strategy](#deployment-strategy)
- [Environment Configuration](#environment-configuration)
- [Monitoring Setup](#monitoring-setup)
- [Performance Metrics](#performance-metrics)
- [Health Checks](#health-checks)
- [Alerting Configuration](#alerting-configuration)
- [Rollback Procedures](#rollback-procedures)
- [Production Validation](#production-validation)

## Pre-Deployment Checklist

### ✅ Code Quality Verification
```bash
# Run comprehensive test suite
npm run test:compai
npm run test:integration
npm run test:unit

# Validate linting and type safety
npm run lint
npm run type-check

# Run manual validation
npx ts-node src/__tests__/manual/compai-bedrock-validation.ts
```

### ✅ Dependency Verification
```bash
# Verify all dependencies are installed
npm audit
npm list --depth=0

# Check for security vulnerabilities
npm audit --audit-level moderate
```

### ✅ Environment Variables
```bash
# Required environment variables for CompAI
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=<your-key>
AWS_SECRET_ACCESS_KEY=<your-secret>
NODE_ENV=production

# Optional CompAI configuration
COMPAI_DEFAULT_HTML_LIMIT=50000
COMPAI_DEFAULT_COMPETITOR_LIMIT=5
COMPAI_ENABLE_METRICS=true
```

### ✅ Database Readiness
```sql
-- Verify required tables and data exist
SELECT COUNT(*) FROM projects;
SELECT COUNT(*) FROM products;
SELECT COUNT(*) FROM competitors;
SELECT COUNT(*) FROM "ProductSnapshot";
SELECT COUNT(*) FROM "Snapshot";

-- Check for recent snapshots
SELECT COUNT(*) FROM "ProductSnapshot" WHERE "createdAt" > NOW() - INTERVAL '7 days';
SELECT COUNT(*) FROM "Snapshot" WHERE "createdAt" > NOW() - INTERVAL '7 days';
```

### ✅ AWS Bedrock Access
```typescript
// Test Bedrock connectivity
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

const client = new BedrockRuntimeClient({ region: 'us-east-1' });

async function testBedrockAccess() {
  try {
    const command = new InvokeModelCommand({
      modelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 100,
        messages: [{ role: 'user', content: 'Test connection' }]
      })
    });
    
    await client.send(command);
    console.log('✅ Bedrock access verified');
    return true;
  } catch (error) {
    console.error('❌ Bedrock access failed:', error);
    return false;
  }
}
```

## Deployment Strategy

### Zero-Downtime Deployment
CompAI is designed for zero-downtime deployment since it's backward compatible:

```bash
# Standard deployment process
git checkout main
git pull origin main
npm ci --production
npm run build

# Run health checks
npm run health-check

# Restart services (no downtime expected)
pm2 restart all
# or
docker-compose restart app
```

### Feature Flag Deployment
Use feature flags for gradual CompAI rollout:

```typescript
// Environment-based feature flag
const COMPAI_ENABLED = process.env.COMPAI_ENABLED === 'true';

// Request-level CompAI control
const request = {
  projectId,
  analysisType: 'competitive',
  useCompAIFormat: COMPAI_ENABLED && shouldUseCompAI(projectId)
};
```

### Canary Deployment
Deploy CompAI to a subset of traffic first:

```typescript
// Canary deployment logic
function shouldUseCompAI(projectId: string): boolean {
  // Enable for 10% of projects initially
  const hash = hashCode(projectId);
  return Math.abs(hash) % 100 < 10;
}

// Gradually increase percentage over time
const COMPAI_ROLLOUT_PERCENTAGE = parseInt(process.env.COMPAI_ROLLOUT || '10');
```

### Blue-Green Deployment
For high-availability environments:

```yaml
# docker-compose.yml
version: '3.8'
services:
  app-blue:
    image: competitor-agent:latest
    environment:
      - COMPAI_ENABLED=false
  
  app-green:
    image: competitor-agent:compai-latest
    environment:
      - COMPAI_ENABLED=true
      
  load-balancer:
    depends_on:
      - app-blue
      - app-green
```

## Environment Configuration

### Production Configuration
```bash
# Production environment variables
NODE_ENV=production
LOG_LEVEL=info

# AWS Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=<production-key>
AWS_SECRET_ACCESS_KEY=<production-secret>

# CompAI Configuration
COMPAI_DEFAULT_HTML_LIMIT=50000
COMPAI_DEFAULT_COMPETITOR_LIMIT=5
COMPAI_INTELLIGENT_TRUNCATION=true
COMPAI_ENABLE_FALLBACK=true

# Monitoring Configuration
ENABLE_METRICS=true
METRICS_PORT=9090
ENABLE_HEALTH_CHECKS=true
HEALTH_CHECK_PORT=8080
```

### Staging Configuration
```bash
# Staging environment for CompAI testing
NODE_ENV=staging
LOG_LEVEL=debug

# Use staging AWS credentials
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=<staging-key>
AWS_SECRET_ACCESS_KEY=<staging-secret>

# CompAI Testing Configuration
COMPAI_DEFAULT_HTML_LIMIT=25000
COMPAI_DEFAULT_COMPETITOR_LIMIT=3
COMPAI_ENABLE_DETAILED_LOGGING=true
```

### Development Configuration
```bash
# Development with CompAI testing
NODE_ENV=development
LOG_LEVEL=debug

# Local AWS credentials or localstack
AWS_REGION=us-east-1
AWS_ENDPOINT_URL=http://localhost:4566  # For localstack

# CompAI Development Settings
COMPAI_ENABLE_DEBUG_MODE=true
COMPAI_MOCK_BEDROCK_RESPONSES=true
```

## Monitoring Setup

### Application Metrics
```typescript
// metrics.ts - CompAI-specific metrics
import { register, Counter, Histogram, Gauge } from 'prom-client';

// CompAI usage metrics
export const compaiRequestsTotal = new Counter({
  name: 'compai_requests_total',
  help: 'Total number of CompAI requests',
  labelNames: ['project_id', 'analysis_type', 'success']
});

export const compaiPromptGenerationDuration = new Histogram({
  name: 'compai_prompt_generation_duration_seconds',
  help: 'Time spent generating CompAI prompts',
  labelNames: ['project_id'],
  buckets: [0.1, 0.5, 1, 2, 5, 10]
});

export const compaiPromptLength = new Histogram({
  name: 'compai_prompt_length_characters',
  help: 'Length of generated CompAI prompts',
  buckets: [1000, 5000, 10000, 25000, 50000, 100000]
});

export const compaiContentTruncated = new Counter({
  name: 'compai_content_truncated_total',
  help: 'Number of times content was truncated',
  labelNames: ['source_type', 'truncation_strategy']
});

export const compaiErrorsTotal = new Counter({
  name: 'compai_errors_total',
  help: 'Total number of CompAI errors',
  labelNames: ['error_type', 'service']
});

export const compaiFallbacksTotal = new Counter({
  name: 'compai_fallbacks_total',
  help: 'Number of CompAI fallbacks to legacy format',
  labelNames: ['service', 'reason']
});

// Active CompAI usage gauge
export const compaiActiveRequests = new Gauge({
  name: 'compai_active_requests',
  help: 'Number of currently active CompAI requests'
});
```

### Metrics Collection
```typescript
// Integrate metrics into CompAI services
class MetricsIntegratedCompAIBuilder extends CompAIPromptBuilder {
  async buildCompAIPrompt(
    project: ProjectWithRelations,
    analysisType: 'competitive',
    freshnessStatus: ProjectFreshnessStatus,
    options: CompAIPromptOptions = {}
  ): Promise<string> {
    const startTime = Date.now();
    compaiActiveRequests.inc();
    
    try {
      const prompt = await super.buildCompAIPrompt(
        project,
        analysisType,
        freshnessStatus,
        options
      );
      
      // Record success metrics
      compaiRequestsTotal.inc({ 
        project_id: project.id, 
        analysis_type: analysisType, 
        success: 'true' 
      });
      
      compaiPromptLength.observe(prompt.length);
      
      return prompt;
    } catch (error) {
      // Record error metrics
      compaiRequestsTotal.inc({ 
        project_id: project.id, 
        analysis_type: analysisType, 
        success: 'false' 
      });
      
      compaiErrorsTotal.inc({ 
        error_type: error.constructor.name, 
        service: 'compai_builder' 
      });
      
      throw error;
    } finally {
      const duration = (Date.now() - startTime) / 1000;
      compaiPromptGenerationDuration.observe({ project_id: project.id }, duration);
      compaiActiveRequests.dec();
    }
  }
}
```

### Logging Configuration
```typescript
// Enhanced logging for CompAI
import { logger } from '@/lib/logger';

// CompAI-specific logger with structured logging
export const compaiLogger = logger.child({ component: 'compai' });

// Usage in services
compaiLogger.info('CompAI prompt generation started', {
  projectId: project.id,
  analysisType,
  optionsProvided: !!options,
  correlationId
});

compaiLogger.warn('CompAI content truncated', {
  source: 'product-html',
  originalLength: html.length,
  truncatedLength: truncatedHtml.length,
  truncationStrategy: 'intelligent'
});

compaiLogger.error('CompAI prompt generation failed', {
  error: error.message,
  stack: error.stack,
  projectId: project.id,
  fallbackUsed: true
});
```

## Performance Metrics

### Key Performance Indicators (KPIs)
```typescript
// Define CompAI KPIs
const compaiKPIs = {
  // Performance metrics
  promptGenerationTime: {
    target: '< 500ms',
    warning: '> 1000ms',
    critical: '> 2000ms'
  },
  
  // Quality metrics
  successRate: {
    target: '> 95%',
    warning: '< 90%',
    critical: '< 85%'
  },
  
  // Usage metrics
  fallbackRate: {
    target: '< 5%',
    warning: '> 10%', 
    critical: '> 20%'
  },
  
  // Content metrics
  truncationRate: {
    target: '< 20%',
    warning: '> 40%',
    critical: '> 60%'
  }
};
```

### Performance Dashboard Queries
```promql
# Prometheus queries for CompAI monitoring

# Average prompt generation time
rate(compai_prompt_generation_duration_seconds_sum[5m]) / 
rate(compai_prompt_generation_duration_seconds_count[5m])

# CompAI success rate
rate(compai_requests_total{success="true"}[5m]) / 
rate(compai_requests_total[5m]) * 100

# CompAI error rate by type
rate(compai_errors_total[5m]) by (error_type, service)

# Content truncation frequency
rate(compai_content_truncated_total[5m]) by (source_type, truncation_strategy)

# CompAI fallback rate
rate(compai_fallbacks_total[5m]) / 
rate(compai_requests_total[5m]) * 100

# Active CompAI requests
compai_active_requests

# Prompt length distribution
histogram_quantile(0.95, compai_prompt_length_characters_bucket)
```

## Health Checks

### CompAI Health Check Endpoint
```typescript
// health-check.ts
import { Request, Response } from 'express';
import { CompAIPromptBuilder } from '@/services/analysis/compaiPromptBuilder';

export async function compaiHealthCheck(req: Request, res: Response) {
  const healthStatus = {
    compai: 'unknown',
    timestamp: new Date().toISOString(),
    checks: {
      compaiBuilder: 'unknown',
      bedrockAccess: 'unknown',
      templateSystem: 'unknown',
      dataFormatting: 'unknown'
    }
  };

  try {
    // Test CompAI builder instantiation
    const builder = new CompAIPromptBuilder();
    healthStatus.checks.compaiBuilder = 'healthy';

    // Test template system
    const template = getCompAIPrompt();
    if (template.system && template.userTemplate) {
      healthStatus.checks.templateSystem = 'healthy';
    }

    // Test data formatting utilities
    const testProduct = {
      name: 'Test Product',
      website: 'https://test.com',
      industry: 'Test',
      positioning: 'Test positioning',
      customerData: 'Test customers',
      userProblem: 'Test problem'
    };
    
    const formatted = formatProductInfo(testProduct);
    if (formatted.includes('Test Product')) {
      healthStatus.checks.dataFormatting = 'healthy';
    }

    // Test Bedrock access (optional - may be slow)
    if (req.query.deep === 'true') {
      try {
        await testBedrockAccess();
        healthStatus.checks.bedrockAccess = 'healthy';
      } catch (error) {
        healthStatus.checks.bedrockAccess = 'unhealthy';
      }
    }

    // Overall health determination
    const allChecks = Object.values(healthStatus.checks);
    const healthyChecks = allChecks.filter(check => check === 'healthy');
    
    if (healthyChecks.length === allChecks.length) {
      healthStatus.compai = 'healthy';
      res.status(200);
    } else if (healthyChecks.length > 0) {
      healthStatus.compai = 'degraded';
      res.status(200);
    } else {
      healthStatus.compai = 'unhealthy';  
      res.status(503);
    }

    res.json(healthStatus);
  } catch (error) {
    healthStatus.compai = 'unhealthy';
    healthStatus.error = error.message;
    res.status(503).json(healthStatus);
  }
}

// Register health check endpoint
app.get('/health/compai', compaiHealthCheck);
```

### Automated Health Monitoring
```bash
#!/bin/bash
# health-monitor.sh - Automated CompAI health monitoring

HEALTH_ENDPOINT="http://localhost:3000/health/compai"
ALERT_WEBHOOK="https://hooks.slack.com/services/YOUR/WEBHOOK/URL"

while true; do
  RESPONSE=$(curl -s -w "%{http_code}" $HEALTH_ENDPOINT)
  HTTP_CODE=${RESPONSE: -3}
  BODY=${RESPONSE%???}
  
  if [ "$HTTP_CODE" != "200" ]; then
    echo "CompAI health check failed: HTTP $HTTP_CODE"
    echo "$BODY"
    
    # Send alert
    curl -X POST -H 'Content-type: application/json' \
      --data "{\"text\":\"🚨 CompAI Health Check Failed\\nHTTP Code: $HTTP_CODE\\nDetails: $BODY\"}" \
      $ALERT_WEBHOOK
  else
    echo "CompAI health check passed"
  fi
  
  sleep 300  # Check every 5 minutes
done
```

## Alerting Configuration

### Prometheus Alerting Rules
```yaml
# compai-alerts.yml
groups:
  - name: compai
    rules:
      # CompAI error rate alert
      - alert: CompAIHighErrorRate
        expr: rate(compai_errors_total[5m]) / rate(compai_requests_total[5m]) > 0.1
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "CompAI error rate is high"
          description: "CompAI error rate is {{ $value | humanizePercentage }} over the last 5 minutes"

      # CompAI fallback rate alert
      - alert: CompAIHighFallbackRate
        expr: rate(compai_fallbacks_total[5m]) / rate(compai_requests_total[5m]) > 0.2
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "CompAI fallback rate is high"
          description: "CompAI is falling back to legacy format {{ $value | humanizePercentage }} of the time"

      # CompAI performance alert
      - alert: CompAISlowPerformance
        expr: histogram_quantile(0.95, compai_prompt_generation_duration_seconds_bucket) > 2
        for: 3m
        labels:
          severity: warning
        annotations:
          summary: "CompAI prompt generation is slow"
          description: "95th percentile CompAI prompt generation time is {{ $value }}s"

      # CompAI service down
      - alert: CompAIServiceDown
        expr: up{job="compai"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "CompAI service is down"
          description: "CompAI service has been down for more than 1 minute"

      # High content truncation rate
      - alert: CompAIHighTruncationRate
        expr: rate(compai_content_truncated_total[10m]) / rate(compai_requests_total[10m]) > 0.5
        for: 5m
        labels:
          severity: info
        annotations:
          summary: "CompAI content truncation rate is high"
          description: "{{ $value | humanizePercentage }} of CompAI requests are truncating content"
```

### Slack Alerting Integration
```typescript
// slack-alerts.ts
import { WebClient } from '@slack/web-api';

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

export async function sendCompAIAlert(alert: {
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  metrics?: Record<string, any>;
}) {
  const emoji = {
    info: '📊',
    warning: '⚠️',
    critical: '🚨'
  };

  const color = {
    info: '#36a64f',
    warning: '#ffaa00', 
    critical: '#ff4444'
  };

  await slack.chat.postMessage({
    channel: '#alerts',
    text: `${emoji[alert.severity]} CompAI Alert: ${alert.title}`,
    attachments: [{
      color: color[alert.severity],
      fields: [
        {
          title: 'Alert Details',
          value: alert.message,
          short: false
        },
        ...(alert.metrics ? Object.entries(alert.metrics).map(([key, value]) => ({
          title: key,
          value: String(value),
          short: true
        })) : [])
      ],
      footer: 'CompAI Monitoring',
      ts: Math.floor(Date.now() / 1000)
    }]
  });
}

// Usage in error handling
compaiErrorsTotal.inc({ error_type: 'bedrock_failure', service: 'compai_builder' });
await sendCompAIAlert({
  severity: 'warning',
  title: 'CompAI Bedrock Integration Error',
  message: 'CompAI experienced a Bedrock service error and fell back to legacy format',
  metrics: {
    'Error Count (5m)': await getErrorCount('bedrock_failure'),
    'Fallback Rate': await getFallbackRate()
  }
});
```

## Rollback Procedures

### Immediate CompAI Disable
```typescript
// Emergency CompAI disable
process.env.COMPAI_EMERGENCY_DISABLE = 'true';

// Or via feature flag
const COMPAI_ENABLED = process.env.COMPAI_EMERGENCY_DISABLE !== 'true' && 
                      process.env.COMPAI_ENABLED === 'true';
```

### Gradual Rollback
```bash
#!/bin/bash
# gradual-rollback.sh

echo "Starting CompAI gradual rollback..."

# Reduce CompAI traffic to 50%
kubectl set env deployment/app COMPAI_ROLLOUT_PERCENTAGE=50
sleep 300

# Reduce to 25%
kubectl set env deployment/app COMPAI_ROLLOUT_PERCENTAGE=25
sleep 300

# Disable CompAI completely
kubectl set env deployment/app COMPAI_ROLLOUT_PERCENTAGE=0
sleep 60

# Confirm rollback
curl -s http://localhost:3000/health/compai | jq '.compai'
echo "CompAI rollback completed"
```

### Database Rollback
```sql
-- CompAI doesn't modify database schema, no rollback needed
-- If any CompAI-specific data was stored:
-- DELETE FROM compai_analytics WHERE created_at > '2024-01-01';
```

## Production Validation

### Post-Deployment Validation Checklist
```bash
# 1. Health checks
curl http://localhost:3000/health/compai

# 2. Metrics validation
curl http://localhost:9090/metrics | grep compai

# 3. Test CompAI functionality
npx ts-node src/__tests__/manual/compai-bedrock-validation.ts

# 4. Integration test
npm run test:integration -- --testNamePattern="compai"

# 5. Performance validation
npm run test:performance -- --testNamePattern="compai"
```

### Production Smoke Tests
```typescript
// production-smoke-test.ts
import { SmartAIService } from '@/services/smartAIService';

async function productionSmokeTest() {
  const smartAI = new SmartAIService();
  const testResults = [];

  // Test 1: Legacy analysis (should always work)
  try {
    const legacyResult = await smartAI.analyzeProject({
      projectId: process.env.TEST_PROJECT_ID,
      analysisType: 'competitive'
    });
    testResults.push({ test: 'legacy_analysis', success: true });
  } catch (error) {
    testResults.push({ test: 'legacy_analysis', success: false, error: error.message });
  }

  // Test 2: CompAI analysis (may fallback)
  try {
    const compaiResult = await smartAI.analyzeProject({
      projectId: process.env.TEST_PROJECT_ID,
      analysisType: 'competitive',
      useCompAIFormat: true
    });
    testResults.push({ 
      test: 'compai_analysis', 
      success: true,
      isCompAI: compaiResult.analysis.includes('# Competitive Landscape Analysis')
    });
  } catch (error) {
    testResults.push({ test: 'compai_analysis', success: false, error: error.message });
  }

  console.log('Production smoke test results:', testResults);
  return testResults;
}

// Run smoke test every hour in production
setInterval(productionSmokeTest, 3600000);
```

### Performance Baseline Validation
```typescript
// performance-validation.ts
async function validatePerformanceBaseline() {
  const baseline = {
    legacyAnalysisTime: 2000,  // 2 seconds
    compaiAnalysisTime: 3000,  // 3 seconds
    errorRate: 0.05,           // 5%
    fallbackRate: 0.1          // 10%
  };

  const actual = await measureActualPerformance();

  const validation = {
    legacyPerformance: actual.legacyAnalysisTime <= baseline.legacyAnalysisTime,
    compaiPerformance: actual.compaiAnalysisTime <= baseline.compaiAnalysisTime,
    errorRate: actual.errorRate <= baseline.errorRate,
    fallbackRate: actual.fallbackRate <= baseline.fallbackRate
  };

  console.log('Performance validation:', validation);
  return validation;
}
```

## Conclusion

This deployment and monitoring guide ensures:

- **Zero-downtime deployment** with backward compatibility
- **Comprehensive monitoring** of CompAI performance and quality
- **Proactive alerting** for issues and degradation
- **Robust rollback procedures** for emergency situations
- **Production validation** to ensure system health

CompAI is designed to enhance competitive intelligence capabilities while maintaining the reliability and performance of existing systems. The monitoring and deployment procedures ensure smooth operation and quick resolution of any issues.

For additional support, consult the API documentation, migration guide, and service documentation provided in this package.
