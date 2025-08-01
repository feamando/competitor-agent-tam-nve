# 📡 Competitive Analysis Platform - API Reference

## 🎯 Overview

This document provides comprehensive API documentation for the Competitive Analysis Platform, covering all endpoints for report generation, monitoring, deployment management, and system health.

**Base URL**: `https://your-domain.com`  
**API Version**: `v2.0`  
**Authentication**: API Key required for production endpoints

---

## 📊 Core Report Generation APIs

### **Generate Comparative Report**

Generate a new comparative report for a project.

```http
POST /api/reports/generate
Content-Type: application/json

{
  "projectId": "string",
  "priority": "normal|high|urgent",
  "options": {
    "forceRefresh": boolean,
    "includeUXAnalysis": boolean,
    "customCompetitors": ["string"]
  }
}
```

**Response**:
```json
{
  "success": true,
  "reportId": "report_abc123",
  "estimatedCompletionTime": "2-5 minutes",
  "correlationId": "corr_xyz789",
  "queuePosition": 3
}
```

**Status Codes**:
- `200`: Report generation started
- `400`: Invalid project ID or parameters
- `429`: Rate limit exceeded
- `500`: Internal server error

### **Get Report Generation Status**

Check the status of report generation.

```http
GET /api/reports/generation-status/{reportId}
```

**Response**:
```json
{
  "reportId": "report_abc123",
  "status": "pending|processing|completed|failed",
  "progress": {
    "percentage": 75,
    "currentStep": "Analyzing competitor websites",
    "estimatedTimeRemaining": "30 seconds"
  },
  "correlationId": "corr_xyz789",
  "startedAt": "2024-01-15T10:30:00Z",
  "completedAt": null,
  "error": null
}
```

### **Get Comparative Report**

Retrieve a completed comparative report.

```http
GET /api/reports/{reportId}
```

**Response**:
```json
{
  "reportId": "report_abc123",
  "projectId": "project_def456",
  "type": "comparative",
  "generatedAt": "2024-01-15T10:35:00Z",
  "product": {
    "name": "Your Product",
    "website": "https://yourproduct.com",
    "lastScrapedAt": "2024-01-15T10:30:00Z"
  },
  "competitors": [
    {
      "name": "Competitor A",
      "website": "https://competitora.com",
      "lastScrapedAt": "2024-01-15T09:45:00Z"
    }
  ],
  "analysis": {
    "executiveSummary": "string",
    "userExperienceAnalysis": { /* UX analysis object */ },
    "featureComparison": { /* Feature comparison matrix */ },
    "strategicRecommendations": {
      "immediate": ["string"],
      "mediumTerm": ["string"],
      "longTerm": ["string"]
    },
    "competitiveIntelligence": { /* Intelligence data */ }
  },
  "metadata": {
    "processingTime": "1.8 minutes",
    "confidenceScore": 0.87,
    "dataFreshness": "2 days"
  }
}
```

---

## 🔍 System Monitoring APIs

### **System Health Dashboard**

Get comprehensive system health information.

```http
GET /api/debug/comparative-reports
```

**Query Parameters**:
- `projectId` (optional): Get project-specific health data

**Response**:
```json
{
  "status": "healthy|degraded|unhealthy",
  "timestamp": "2024-01-15T10:35:00Z",
  "systemHealth": {
    "overall": "healthy",
    "reportGeneration": "healthy",
    "queueProcessing": "healthy",
    "database": "healthy",
    "externalServices": "healthy"
  },
  "metrics": {
    "activeProjects": 150,
    "reportsGenerated24h": 45,
    "avgProcessingTime": "1.8min",
    "errorRate": "2.1%",
    "queueDepth": 12,
    "systemLoad": "0.65"
  },
  "alerts": [
    {
      "level": "warning",
      "message": "Processing time above threshold",
      "timestamp": "2024-01-15T10:30:00Z"
    }
  ],
  "projects": [
    {
      "projectId": "project_def456",
      "status": "healthy",
      "lastReportAt": "2024-01-15T09:00:00Z",
      "processingTime": "1.2min",
      "errorCount": 0
    }
  ]
}
```

### **Queue Health Status**

Monitor queue processing status.

```http
GET /api/queue/health
```

**Response**:
```json
{
  "status": "healthy",
  "queueDepth": 12,
  "processing": 3,
  "completed24h": 45,
  "failed24h": 2,
  "avgWaitTime": "30 seconds",
  "workerStatus": {
    "active": 5,
    "idle": 2,
    "total": 7
  },
  "queues": {
    "comparative-reports": {
      "depth": 8,
      "processing": 2
    },
    "product-scraping": {
      "depth": 4,
      "processing": 1
    }
  }
}
```

### **Performance Metrics**

Get detailed performance metrics.

```http
GET /api/debug/performance-metrics
```

**Query Parameters**:
- `period`: `1h|24h|7d|30d` (default: `24h`)
- `granularity`: `minute|hour|day` (default: `hour`)

**Response**:
```json
{
  "period": "24h",
  "metrics": {
    "processingTime": {
      "avg": 108.5,
      "min": 45.2,
      "max": 245.8,
      "percentiles": {
        "50": 95.3,
        "90": 180.2,
        "95": 210.5,
        "99": 240.1
      }
    },
    "errorRate": {
      "overall": 0.021,
      "byType": {
        "scrapingError": 0.015,
        "analysisError": 0.004,
        "systemError": 0.002
      }
    },
    "throughput": {
      "reportsPerHour": 15.2,
      "peakHour": "14:00-15:00",
      "peakThroughput": 28.5
    }
  },
  "trends": [
    {
      "timestamp": "2024-01-15T10:00:00Z",
      "processingTime": 105.2,
      "errorRate": 0.018,
      "throughput": 16.5
    }
  ]
}
```

---

## 🚀 Deployment Management APIs

### **Rollout Status**

Get current deployment rollout status.

```http
GET /api/deployment/rollout-status
```

**Response**:
```json
{
  "currentPhase": "production-50",
  "rolloutPercentage": 50,
  "phaseStartedAt": "2024-01-15T08:00:00Z",
  "phaseStatus": "stable",
  "metrics": {
    "errorRate": 0.018,
    "avgProcessingTime": 95.2,
    "successRate": 0.982
  },
  "rolloutHistory": [
    {
      "phase": "development",
      "startedAt": "2024-01-14T10:00:00Z",
      "completedAt": "2024-01-15T08:00:00Z",
      "status": "completed",
      "successCriteria": {
        "errorRate": { "target": 0.10, "actual": 0.008 },
        "processingTime": { "target": 180, "actual": 92.5 }
      }
    }
  ],
  "nextPhase": {
    "name": "production-100",
    "eligibleAt": "2024-01-17T08:00:00Z",
    "requiresApproval": true
  }
}
```

### **Advance Rollout Phase**

Manually advance to the next rollout phase.

```http
POST /api/deployment/advance-phase
Content-Type: application/json

{
  "confirmationToken": "PROD_ADVANCE_TOKEN",
  "skipWaitTime": false
}
```

**Response**:
```json
{
  "success": true,
  "previousPhase": "production-50",
  "newPhase": "production-100",
  "advancedAt": "2024-01-15T10:35:00Z",
  "rolloutPercentage": 100
}
```

### **Emergency Rollback**

Perform emergency rollback to previous stable version.

```http
POST /api/deployment/rollback
Content-Type: application/json

{
  "reason": "High error rates detected",
  "emergencyRollback": true,
  "disableFeatures": ["comparative-reports-v2"]
}
```

**Response**:
```json
{
  "success": true,
  "rolledBackAt": "2024-01-15T10:35:00Z",
  "previousPhase": "production-50",
  "rollbackPhase": "production-10",
  "disabledFeatures": ["comparative-reports-v2"],
  "estimatedRecoveryTime": "2-5 minutes"
}
```

---

## 🛠️ Project Management APIs

### **Create Project**

Create a new competitive analysis project.

```http
POST /api/projects
Content-Type: application/json

{
  "name": "Project Name",
  "productName": "Your Product",
  "productWebsite": "https://yourproduct.com",
  "industry": "SaaS",
  "reportingFrequency": "weekly",
  "competitors": ["https://competitor1.com", "https://competitor2.com"]
}
```

**Response**:
```json
{
  "projectId": "project_abc123",
  "name": "Project Name",
  "product": {
    "id": "product_def456",
    "name": "Your Product",
    "website": "https://yourproduct.com",
    "scrapedAt": "2024-01-15T10:35:00Z"
  },
  "competitors": [
    {
      "id": "comp_ghi789",
      "name": "Competitor 1",
      "website": "https://competitor1.com"
    }
  ],
  "status": "active",
  "createdAt": "2024-01-15T10:35:00Z"
}
```

### **Get Project Details**

Retrieve project information and recent reports.

```http
GET /api/projects/{projectId}
```

**Response**:
```json
{
  "projectId": "project_abc123",
  "name": "Project Name",
  "status": "active",
  "product": {
    "name": "Your Product",
    "website": "https://yourproduct.com",
    "lastScrapedAt": "2024-01-15T10:30:00Z"
  },
  "competitors": [
    {
      "name": "Competitor 1",
      "website": "https://competitor1.com",
      "lastScrapedAt": "2024-01-15T10:28:00Z"
    }
  ],
  "recentReports": [
    {
      "reportId": "report_xyz789",
      "generatedAt": "2024-01-15T09:00:00Z",
      "type": "comparative",
      "status": "completed"
    }
  ],
  "settings": {
    "reportingFrequency": "weekly",
    "nextReportDue": "2024-01-22T09:00:00Z"
  }
}
```

---

## 🔧 Data Management APIs

### **Product Data Refresh**

Force refresh of product website data.

```http
POST /api/products/{productId}/refresh
Content-Type: application/json

{
  "priority": "normal|high",
  "fullScrape": false
}
```

**Response**:
```json
{
  "success": true,
  "scrapeId": "scrape_abc123",
  "estimatedCompletionTime": "30-60 seconds",
  "previousScrapeAt": "2024-01-15T08:00:00Z"
}
```

### **Competitor Data Status**

Check competitor data freshness and availability.

```http
GET /api/competitors/data-status
```

**Query Parameters**:
- `projectId` (optional): Filter by project
- `staleThreshold` (optional): Hours to consider data stale (default: 168)

**Response**:
```json
{
  "totalCompetitors": 25,
  "dataStatus": {
    "fresh": 20,
    "stale": 3,
    "unavailable": 2
  },
  "competitors": [
    {
      "id": "comp_abc123",
      "name": "Competitor 1",
      "website": "https://competitor1.com",
      "lastScrapedAt": "2024-01-15T08:00:00Z",
      "status": "fresh",
      "dataAge": "2.5 hours"
    }
  ]
}
```

---

## ⚙️ Configuration APIs

### **Feature Flags Status**

Get current feature flag configuration.

```http
GET /api/config/feature-flags
```

**Response**:
```json
{
  "features": {
    "comparativeReportsEnabled": true,
    "uxAnalysisEnabled": true,
    "rolloutPercentage": 50,
    "advancedMonitoring": true
  },
  "environment": "production",
  "lastUpdated": "2024-01-15T10:00:00Z"
}
```

### **Update Feature Flags**

Update feature flag configuration (admin only).

```http
PUT /api/config/feature-flags
Content-Type: application/json
Authorization: Bearer admin_token

{
  "features": {
    "rolloutPercentage": 75,
    "newFeatureEnabled": true
  }
}
```

---

## 🔒 Authentication & Rate Limiting

### **API Authentication**

All production endpoints require API key authentication:

```http
Authorization: Bearer your-api-key
```

### **Rate Limits**

| Endpoint Category | Rate Limit | Window |
|------------------|------------|--------|
| **Report Generation** | 10 requests | 1 minute |
| **Monitoring** | 100 requests | 1 minute |
| **Data Refresh** | 5 requests | 1 minute |
| **Configuration** | 20 requests | 1 minute |

### **Rate Limit Headers**

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1642248000
```

---

## 📋 Error Handling

### **Error Response Format**

```json
{
  "error": {
    "code": "INVALID_PROJECT_ID",
    "message": "The specified project ID does not exist",
    "details": {
      "projectId": "invalid_id",
      "correlationId": "corr_xyz789"
    },
    "timestamp": "2024-01-15T10:35:00Z"
  }
}
```

### **Common Error Codes**

| Code | Status | Description |
|------|--------|-------------|
| `INVALID_PROJECT_ID` | 400 | Project not found |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `INSUFFICIENT_DATA` | 422 | Not enough data for analysis |
| `SCRAPING_FAILED` | 503 | Website scraping failed |
| `ANALYSIS_TIMEOUT` | 504 | Report generation timeout |
| `SYSTEM_MAINTENANCE` | 503 | System under maintenance |

---

## 🔄 Webhooks

### **Report Completion Webhook**

Configure webhooks to receive notifications when reports are completed:

```json
{
  "event": "report.completed",
  "timestamp": "2024-01-15T10:35:00Z",
  "data": {
    "reportId": "report_abc123",
    "projectId": "project_def456",
    "status": "completed",
    "processingTime": "1.8 minutes",
    "downloadUrl": "https://your-domain.com/api/reports/report_abc123"
  }
}
```

### **System Alert Webhook**

Receive system health alerts:

```json
{
  "event": "system.alert",
  "timestamp": "2024-01-15T10:35:00Z",
  "data": {
    "alertLevel": "warning",
    "message": "Processing time above threshold",
    "metrics": {
      "avgProcessingTime": "5.2 minutes",
      "threshold": "2 minutes"
    },
    "correlationId": "corr_xyz789"
  }
}
```

---

## 📚 SDKs and Examples

### **JavaScript/Node.js Example**

```javascript
const CompetitiveAnalysisClient = require('@company/competitive-analysis-sdk');

const client = new CompetitiveAnalysisClient({
  apiKey: 'your-api-key',
  baseUrl: 'https://your-domain.com'
});

// Generate a report
const report = await client.reports.generate({
  projectId: 'project_abc123',
  options: {
    includeUXAnalysis: true,
    forceRefresh: false
  }
});

// Monitor progress
const status = await client.reports.getStatus(report.reportId);
console.log(`Report progress: ${status.progress.percentage}%`);

// Get completed report
if (status.status === 'completed') {
  const fullReport = await client.reports.get(report.reportId);
  console.log(fullReport.analysis.executiveSummary);
}
```

### **Python Example**

```python
from competitive_analysis import CompetitiveAnalysisClient

client = CompetitiveAnalysisClient(
    api_key='your-api-key',
    base_url='https://your-domain.com'
)

# Generate report
report = client.reports.generate(
    project_id='project_abc123',
    options={
        'include_ux_analysis': True,
        'force_refresh': False
    }
)

# Monitor system health
health = client.monitoring.get_system_health()
print(f"System status: {health['status']}")
print(f"Error rate: {health['metrics']['errorRate']}")
```

---

## 🔄 API Versioning

### **Current Version**: `v2.0`
### **Supported Versions**: `v1.0`, `v2.0`
### **Deprecation Notice**: `v1.0` will be deprecated on June 1, 2024

### **Version Headers**

```http
API-Version: v2.0
Accept: application/vnd.competitive-analysis.v2+json
```

---

**📞 Support**: For API support, contact api-support@company.com  
**📚 Updates**: Subscribe to API changelog at /api/changelog  
**🔄 Status**: Check API status at https://status.your-domain.com

*Last Updated: [Current Date] | Version: 2.0 | Comparative Analysis Platform* 