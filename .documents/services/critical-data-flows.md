# Critical Data Flows - Competitor Research Agent v1.5

This document outlines the critical data flows in the current service architecture that must be preserved during the architectural remediation effort. These flows represent the core business logic and functionality that needs to remain intact even as we refactor from an over-engineered microservice architecture to a modular monolith.

## 1. Smart Scheduling to Product Scraping Flow

```
SmartSchedulingService → ProductScrapingService → WebScraper
```

### Data Exchanged
- Project freshness status information
- Scraping tasks configuration
- Competitor and product URLs
- Scraping results and snapshot data

### Critical Methods
- `SmartSchedulingService.checkAndTriggerScraping()`: Verifies data freshness and initiates scraping when needed
- `SmartSchedulingService.getFreshnessStatus()`: Returns current data freshness information
- `ProductScrapingService.scrapeCompetitor()`: Performs scraping operations for competitor websites
- `WebScraper.scrapeUrl()`: Handles the actual web scraping functionality

### Business Importance
This flow is critical for ensuring that reports and analysis are based on up-to-date data. It manages the freshness thresholds, initiates scraping operations when data is stale, and orchestrates the scraping process across products and competitors.

## 2. Analysis and Report Generation Flow

```
SmartAIService → IntelligentReportingService → AutoReportGenerationService
```

### Data Exchanged
- Analysis results and insights
- Fresh data indicators and freshness metadata
- Competitor activity alerts
- Report generation tasks and templates

### Critical Methods
- `SmartAIService.analyzeWithSmartScheduling()`: Analyzes competitor data with freshness guarantees
- `IntelligentReportingService.generateIntelligentReport()`: Creates reports with data freshness indicators
- `AutoReportGenerationService.generateInitialReport()`: Creates initial comparative reports
- `AutoReportGenerationService.schedulePeriodicReports()`: Sets up automated report scheduling

### Business Importance
This flow represents the core value proposition of the application - generating insightful competitive analysis reports. It ensures that AI analysis incorporates data freshness, detects important competitive signals, and packages insights into structured reports.

## 3. Data Collection and Validation Flow

```
SmartDataCollectionService → ValidationService → AnalysisService
```

### Data Exchanged
- Raw product and competitor data
- Validation results and data quality metrics
- Processed data ready for analysis
- Metadata about collection sources and confidence

### Critical Methods
- `SmartDataCollectionService.collectProjectData()`: Gathers data with prioritization logic
- `SmartDataCollectionService.collectProductData()`: Collects specific product information
- `SmartDataCollectionService.collectCompetitorDataWithPriorities()`: Intelligently collects competitor data
- Various validation methods that ensure data integrity

### Business Importance
This flow ensures that all analysis is based on complete, valid data. It implements the priority system that determines which data sources to use (form data, fresh snapshots, existing data) and validates that the data meets quality thresholds before analysis.

## 4. Service Coordination and Health Monitoring Flow

```
ServiceCoordinator → AnalysisService → UX Analyzer → HealthMonitor
```

### Data Exchanged
- Service status information and health metrics
- Orchestration metadata and correlation IDs
- Cross-service context and state
- Error information and recovery actions

### Critical Methods
- `ServiceCoordinator.orchestrateAnalysis()`: Manages complete analysis pipeline
- `ServiceRegistry.checkServiceHealth()`: Verifies service operational status
- Health check methods across various services
- Error handling and recovery functions

### Business Importance
This flow ensures system reliability by monitoring service health, coordinating complex operations across multiple services, and providing graceful degradation when services encounter issues.

## 5. Report Scheduling and Delivery Flow

```
ReportSchedulingService → AutoReportGenerationService → NotificationService
```

### Data Exchanged
- Report schedules and frequency settings
- Report generation tasks and priorities
- Queue status and estimated completion times
- Delivery status and notification metadata

### Critical Methods
- `ReportSchedulingService.createSchedule()`: Sets up report schedules
- `AutoReportGenerationService.triggerReportOnEvent()`: Generates reports based on specific triggers
- `AutoReportGenerationService.getQueueStatus()`: Provides status of report generation queue
- Notification delivery methods

### Business Importance
This flow enables the automated, scheduled delivery of insights to users. It manages the queuing of report generation tasks, handles different priorities, and ensures users receive timely notifications about new insights.

---

## Implementation Considerations

When refactoring the architecture, these critical data flows must be preserved to maintain the core functionality of the application. The modular monolith approach should:

1. Maintain clear interfaces between modules that correspond to these flows
2. Preserve the existing business logic and validation rules
3. Ensure data consistency and quality checkpoints remain intact
4. Support the same scheduling and automation capabilities
5. Maintain or improve error handling and recovery mechanisms

The new domain-driven design should map these flows to clear domain boundaries while eliminating unnecessary complexity and reducing the number of service-to-service interactions.
