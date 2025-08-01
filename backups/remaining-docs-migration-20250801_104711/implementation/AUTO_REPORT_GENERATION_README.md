# 🤖 Automatic Report Generation

## Overview

The Automatic Report Generation system provides seamless, intelligent report creation for competitive analysis projects. This implementation addresses the gap where projects were created but no reports were generated automatically, ensuring users get immediate value from their competitive research.

## 🎯 Key Features

### ✅ **Immediate Report Generation**
- **Automatic Initial Reports**: Reports are generated immediately when projects are created with competitors
- **High Priority Processing**: Initial reports get priority in the queue for faster delivery
- **Smart Fallback**: Graceful degradation if report generation fails

### ✅ **Scheduled Report Generation**
- **Flexible Frequencies**: Daily, weekly, biweekly, and monthly reporting schedules
- **Template Selection**: Choose from comprehensive, executive, technical, or strategic report templates
- **Intelligent Scheduling**: Cron-based scheduling with timezone awareness

### ✅ **Event-Driven Reports**
- **Change Detection**: Automatic reports when significant competitor changes are detected
- **Priority-Based Processing**: Different event types get appropriate priority levels
- **Smart Triggers**: Configurable triggers for various business events

### ✅ **Queue Management**
- **Background Processing**: Non-blocking report generation using Bull queue
- **Retry Logic**: Automatic retry with exponential backoff for failed reports
- **Status Tracking**: Real-time status updates and queue position monitoring

## 🚀 Quick Start

### 1. Create a Project with Auto-Reports

```javascript
const projectData = {
  name: 'Q1 2025 Competitive Analysis',
  description: 'Quarterly competitive landscape analysis',
  autoAssignCompetitors: true,           // Auto-assign all competitors
  autoGenerateInitialReport: true,       // Generate initial report immediately
  frequency: 'weekly',                   // Schedule weekly reports
  reportTemplate: 'comprehensive',       // Use comprehensive template
  reportName: 'Weekly Competitive Update'
};

const response = await fetch('/api/projects', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(projectData)
});

const project = await response.json();
console.log('Report Generation Info:', project.reportGeneration);
```

### 2. Check Report Generation Status

```javascript
const projectId = 'your-project-id';
const response = await fetch(`/api/reports/generation-status/${projectId}`);
const status = await response.json();

console.log('Is Generating:', status.generationStatus.isGenerating);
console.log('Queue Position:', status.generationStatus.queuePosition);
console.log('Estimated Completion:', status.generationStatus.estimatedCompletion);
```

### 3. Manually Trigger Report Generation

```javascript
const reportData = {
  projectId: 'your-project-id',
  immediate: true,
  template: 'executive',
  notify: true
};

const response = await fetch('/api/reports/auto-generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(reportData)
});

const result = await response.json();
console.log('Task ID:', result.taskId);
console.log('Queue Position:', result.queuePosition);
```

## 📊 API Reference

### Project Creation with Auto-Reports

**Endpoint**: `POST /api/projects`

**Enhanced Request Body**:
```typescript
{
  name: string;
  description?: string;
  autoAssignCompetitors?: boolean;        // Default: true
  autoGenerateInitialReport?: boolean;    // Default: true
  frequency?: 'daily' | 'weekly' | 'biweekly' | 'monthly';
  reportTemplate?: 'comprehensive' | 'executive' | 'technical' | 'strategic';
  reportName?: string;
}
```

**Enhanced Response**:
```typescript
{
  ...project,
  reportGeneration: {
    initialReportQueued: boolean;
    taskId?: string;
    queuePosition?: number;
    estimatedCompletion?: Date;
    periodicReportsScheduled?: boolean;
    frequency?: string;
    nextScheduledReport?: Date;
  }
}
```

### Manual Report Generation

**Endpoint**: `POST /api/reports/auto-generate`

**Request Body**:
```typescript
{
  projectId: string;
  immediate?: boolean;                    // Default: true
  template?: 'comprehensive' | 'executive' | 'technical' | 'strategic';
  notify?: boolean;                       // Default: true
}
```

**Response**:
```typescript
{
  success: boolean;
  projectId: string;
  projectName: string;
  taskId: string;
  queuePosition: number;
  estimatedCompletion: Date;
  competitorCount: number;
  template: string;
  queueStatus: QueueStatus;
}
```

### Generation Status

**Endpoint**: `GET /api/reports/generation-status/{projectId}`

**Response**:
```typescript
{
  success: boolean;
  projectId: string;
  projectName: string;
  generationStatus: {
    isGenerating: boolean;
    queuePosition: number;
    estimatedCompletion: Date;
    lastGenerated?: Date;
    nextScheduled?: Date;
  };
  recentReportsCount: number;
  schedule?: {
    frequency: string;
    nextRunTime: Date;
    lastExecuted?: Date;
    isActive: boolean;
    reportTemplate: string;
  };
}
```

### Schedule Management

**Endpoint**: `POST /api/reports/schedule`

**Request Body**:
```typescript
{
  projectId: string;
  frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly';
  template?: 'comprehensive' | 'executive' | 'technical' | 'strategic';
  startDate?: string;                     // ISO date string
}
```

**Endpoint**: `GET /api/reports/schedule?projectId={projectId}`

## 🔧 Technical Architecture

### AutoReportGenerationService

The core service that orchestrates all automatic report generation:

```typescript
class AutoReportGenerationService {
  // Immediate report generation
  async generateInitialReport(projectId: string, options?: ReportOptions): Promise<TaskResult>;
  
  // Scheduled report generation
  async schedulePeriodicReports(projectId: string, frequency: string, options?: ScheduleOptions): Promise<Schedule>;
  
  // Event-driven generation
  async triggerReportOnEvent(projectId: string, event: ReportTriggerEvent): Promise<TaskResult>;
  
  // Queue management
  async getQueueStatus(projectId: string): Promise<QueueStatus>;
  async retryFailedTasks(): Promise<number>;
}
```

### Queue System

Built on **Bull** for robust background processing:

- **Redis-backed**: Persistent queue with Redis storage
- **Priority Processing**: High/Normal/Low priority levels
- **Retry Logic**: Exponential backoff with configurable attempts
- **Monitoring**: Real-time queue status and metrics

### Scheduling System

Built on **node-cron** for reliable periodic execution:

- **Cron Patterns**: Flexible scheduling with standard cron syntax
- **Timezone Support**: UTC-based scheduling with timezone awareness
- **Persistence**: Schedule state stored in project parameters
- **Recovery**: Automatic recovery of schedules on service restart

## 🎯 User Experience Flow

### Enhanced Chat-to-Report Flow

```
1. User: "user@company.com\nWeekly\nQ1 2025 Analysis"
   ↓
2. System: Creates project + assigns competitors
   ↓
3. System: Immediately queues web scraping
   ↓
4. System: Queues initial report generation
   ↓
5. System: "Project created! Generating your first report..."
   ↓
6. System: (Background) Scrapes competitor websites
   ↓
7. System: (Background) Generates comparative report
   ↓
8. System: "Your Q1 2025 Analysis report is ready!"
   ↓
9. User: Can immediately view report in reports list
   ↓
10. System: Continues generating weekly reports automatically
```

### Real-Time Feedback

Users receive immediate feedback at each step:

- ✅ **Project Created**: Confirmation with competitor count
- 🎯 **Competitors Assigned**: List of auto-assigned competitors
- 🕷️ **Scraping Started**: Data gathering in progress
- 📊 **Report Generating**: Comparative analysis in progress
- 🎉 **Report Ready**: Direct link to view the report
- ⏰ **Schedule Set**: Next report generation time

## 📈 Performance & Monitoring

### Key Metrics

- **Time to First Report**: Target < 2 minutes from project creation
- **Report Availability**: 100% of projects have reports within 5 minutes
- **Queue Processing**: Average < 30 seconds per report
- **Error Rate**: < 2% report generation failures
- **User Satisfaction**: Reports available when expected

### Monitoring Dashboard

Track system health with built-in observability:

```typescript
interface AutoReportMetrics {
  queueDepth: number;
  averageProcessingTime: number;
  errorRate: percentage;
  userSatisfactionScore: number;
  systemResourceUsage: ResourceMetrics;
}
```

### Logging & Correlation

Comprehensive logging with correlation IDs for end-to-end tracking:

- **Business Events**: Project creation, report generation, scheduling
- **Performance Tracking**: Processing times, queue metrics
- **Error Tracking**: Failures, retries, recovery actions
- **User Journey**: Complete flow from project to report

## 🔒 Error Handling & Resilience

### Failure Scenarios & Solutions

#### **Web Scraping Failures**
- **Problem**: Competitor website unreachable
- **Solution**: Generate report with available data, note missing data
- **Fallback**: Use cached data from previous scraping

#### **AI Service Failures**
- **Problem**: AWS Bedrock unavailable
- **Solution**: Queue for retry, use template-based report generation
- **Fallback**: Generate basic comparison report without AI analysis

#### **Queue Processing Failures**
- **Problem**: Background processing interrupted
- **Solution**: Persistent queue with retry mechanism
- **Fallback**: Manual report generation option always available

### Graceful Degradation

The system is designed to never completely fail:

1. **Primary Path**: Full AI-powered report generation
2. **Degraded Path**: Template-based reports with available data
3. **Fallback Path**: Basic competitor listing with manual generation option
4. **Emergency Path**: Error notification with retry instructions

## 🧪 Testing

### Running the Test Suite

```bash
# Run the auto-report generation test
node test-auto-report-generation.js

# Run unit tests
npm run test:unit

# Run integration tests
npm run test:integration

# Run end-to-end tests
npm run test:e2e
```

### Test Coverage

- **Unit Tests**: AutoReportGenerationService methods
- **Integration Tests**: Complete project-to-report flow
- **End-to-End Tests**: Chat interface to report generation
- **Performance Tests**: Queue processing under load
- **Regression Tests**: Critical user journeys

## 🚀 Deployment

### Environment Variables

```bash
# Redis Configuration (for queue)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password

# AWS Configuration (for AI services)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key

# Database Configuration
DATABASE_URL=postgresql://user:password@localhost:5432/competitor_research
```

### Production Checklist

- [ ] Redis instance configured and accessible
- [ ] AWS Bedrock permissions configured
- [ ] Database migrations applied
- [ ] Environment variables set
- [ ] Monitoring and alerting configured
- [ ] Queue processing workers started
- [ ] Cron jobs scheduled
- [ ] Error handling tested
- [ ] Performance benchmarks met

## 📚 Advanced Usage

### Custom Event Triggers

```typescript
// Trigger report on competitor website change
await autoReportService.triggerReportOnEvent(projectId, {
  type: 'competitorWebsiteChange',
  competitorId: 'competitor-id',
  metadata: { changeType: 'pricing', significance: 'high' }
});

// Trigger report on significant content update
await autoReportService.triggerReportOnEvent(projectId, {
  type: 'significantContentUpdate',
  metadata: { contentType: 'product-features', changeScore: 0.85 }
});
```

### Queue Management

```typescript
// Get detailed queue status
const status = await autoReportService.getQueueStatus(projectId);

// Retry failed tasks
const retriedCount = await autoReportService.retryFailedTasks();

// Handle specific generation failure
await autoReportService.handleGenerationFailure(taskId, error);
```

### Custom Report Templates

```typescript
// Use different templates for different audiences
const executiveReport = await autoReportService.generateInitialReport(projectId, {
  reportTemplate: 'executive',
  reportName: 'Executive Summary - Competitive Landscape'
});

const technicalReport = await autoReportService.generateInitialReport(projectId, {
  reportTemplate: 'technical',
  reportName: 'Technical Analysis - Feature Comparison'
});
```

## 🤝 Contributing

### Development Setup

1. **Clone the repository**
2. **Install dependencies**: `npm install`
3. **Set up environment variables**
4. **Start Redis**: `redis-server`
5. **Run database migrations**: `npx prisma migrate dev`
6. **Start the development server**: `npm run dev`

### Adding New Features

1. **Service Layer**: Extend `AutoReportGenerationService`
2. **API Layer**: Add new endpoints in `/api/reports/`
3. **Types**: Update TypeScript interfaces
4. **Tests**: Add comprehensive test coverage
5. **Documentation**: Update this README

## 📞 Support

For questions, issues, or feature requests:

1. **Check the logs**: Look for correlation IDs in error messages
2. **Review the queue**: Check Redis for stuck jobs
3. **Monitor metrics**: Use the observability dashboard
4. **Test manually**: Use the test script to verify functionality

---

**Status**: ✅ **Production Ready**  
**Version**: 1.0.0  
**Last Updated**: January 2025  
**Maintainer**: Competitor Research Team 