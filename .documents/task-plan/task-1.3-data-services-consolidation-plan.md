# Technical Task Plan: Data Domain Consolidation - Task 1.3

## Overview
* **Goal:** Consolidate Data Domain Services (WebScraperService, ProductScrapingService, SmartDataCollectionService) into unified DataService for architectural stability and reduced complexity
* **Project Name:** Competitor Research Agent v1.5 - Data Domain Consolidation
* **Date:** January 22, 2025  
* **Request ID:** REQ001-TASK-1.3

This plan addresses the consolidation of over-engineered data collection services into one unified service that maintains all critical functionality while reducing architectural complexity. Focus on preserving critical data flows identified in the system health audit, particularly the Smart Scheduling integration patterns.

## Pre-requisites
* Node.js 18+ and npm installed
* Existing service architecture analysis completed (Task 1.1 ✅)
* Database connectivity with Prisma client
* Puppeteer and web scraping dependencies configured
* Understanding of critical data flows: `SmartSchedulingService → ProductScrapingService → WebScraperService`
* **Git Branch Creation:** `git checkout -b feature/data_domain_consolidation_20250122_REQ001`
* Feature flag system for gradual rollout of consolidated services
* Backup of current service implementations in case of rollback need

## Dependencies
* **Internal Service Dependencies:**
  - `SmartSchedulingService` - Critical for data freshness checks (must be preserved)
  - `InitialComparativeReportService` - Primary consumer of SmartDataCollectionService
  - `AutoReportGenerationService` - Uses ProductScrapingService for data validation
  - `ComparativeReportScheduler` - Integrates with ProductScrapingService
  - Database schema: `Project`, `Product`, `Competitor`, `ProductSnapshot`, `CompetitorSnapshot` entities
* **External Libraries:**
  - Puppeteer for web scraping operations
  - Prisma ORM for database operations  
  - Cheerio for HTML parsing and content extraction
  - WebsiteScraper utility class for scraping operations
* **Code Owners:** Based on .claim.json analysis - services owned by core platform team

## Task Breakdown

### Phase 1: Data Domain Architecture Design

- [ ] 1.0 Data Domain Service Analysis
    - [ ] 1.1 **Map Existing Data Services** (Effort: Medium)
        - Analyze `WebScraperService` in `src/services/webScraper.ts`
        - Analyze `ProductScrapingService` in `src/services/productScrapingService.ts`
        - Analyze `SmartDataCollectionService` in `src/services/reports/smartDataCollectionService.ts`
        - Document all public methods, interfaces, and dependencies
        - Identify overlapping functionality and integration points
    - [ ] 1.2 **Design Unified DataService Interface** (Effort: Large)
        - Create consolidated interface that combines all data collection capabilities
        - Design modular sub-services: `WebScrapingModule`, `ProductScrapingModule`, `SmartCollectionModule`
        - Preserve critical method signatures for backward compatibility
        - Define clear error handling and logging patterns using existing correlation IDs
    - [ ] 1.3 **Create Data Domain Types** (Effort: Small)
        - Consolidate all data-related TypeScript interfaces from existing services
        - Create unified `DataRequest`, `DataResponse`, `ScrapingConfig` types
        - Ensure type compatibility with existing consumers

### Phase 2: Implement Unified DataService

- [ ] 2.0 Core DataService Implementation
    - [ ] 2.1 **Create Core DataService Class** (Effort: Large)
        - Implement main `DataService` class in `src/services/domains/DataService.ts`
        - Integrate existing Puppeteer browser management and lifecycle
        - Implement factory pattern for sub-modules (WebScraping, ProductScraping, SmartCollection)
        - Add comprehensive error handling with correlation ID tracking
        - Preserve existing logging patterns and performance monitoring
    - [ ] 2.2 **Implement WebScrapingModule Sub-service** (Effort: Medium)
        - Migrate `WebScraperService` functionality for core Puppeteer operations
        - Preserve browser initialization, lifecycle management, and cleanup
        - Maintain all URL scraping capabilities and retry logic
        - Keep existing screenshot and content extraction features
        - Preserve competitor-specific scraping methods
    - [ ] 2.3 **Implement ProductScrapingModule Sub-service** (Effort: Medium)
        - Migrate `ProductScrapingService` functionality for product-specific scraping
        - Preserve enhanced retry logic and content validation
        - Maintain product snapshot creation and quality checks
        - Keep existing freshness validation and data integrity checks
        - Preserve integration with productRepository and database operations
    - [ ] 2.4 **Implement SmartCollectionModule Sub-service** (Effort: Large)
        - Migrate `SmartDataCollectionService` functionality for intelligent data prioritization
        - Preserve priority-based collection strategies and fallback mechanisms
        - Maintain data quality scoring and completeness metrics
        - Keep existing data freshness analysis and optimization logic
        - Preserve all collection workflow orchestration

### Phase 3: Critical Data Flow Preservation

- [ ] 3.0 Smart Scheduling Integration Preservation
    - [ ] 3.1 **Preserve SmartSchedulingService Integration** (Effort: Medium)
        - Ensure `SmartSchedulingService.checkAndTriggerScraping()` works with new DataService
        - Validate data freshness checking continues to function correctly
        - Test automatic scraping triggers and task execution workflows
        - Maintain performance characteristics of existing smart scheduling
        - Preserve existing correlation ID tracking and business event logging
    - [ ] 3.2 **Preserve Report Generation Integration** (Effort: Medium)
        - Ensure `InitialComparativeReportService` integration with SmartCollectionModule
        - Validate seamless data flow from collection to report generation
        - Test integrated workflow: project creation → data collection → analysis
        - Maintain existing quality thresholds and validation checkpoints
    - [ ] 3.3 **Preserve API Route Integration** (Effort: Small)
        - Update API routes in `src/pages/api/scrape/competitors.ts` to use DataService
        - Ensure all existing API endpoints continue to function without regression
        - Maintain existing error handling and response formatting
        - Preserve authentication and validation patterns

### Phase 4: Service Integration & Testing

- [ ] 4.0 Consumer Service Updates
    - [ ] 4.1 **Update Service Dependencies** (Effort: Large)
        - Update `SmartSchedulingService` to use new DataService interface
        - Modify `InitialComparativeReportService` to use SmartCollectionModule
        - Update `AutoReportGenerationService` to use ProductScrapingModule
        - Update `ComparativeReportScheduler` to use new data collection interfaces
        - Ensure backward compatibility during transition period using feature flags
    - [ ] 4.2 **Implement Feature Flags** (Effort: Small)
        - Add feature flags to control usage of new vs. old data services
        - Enable gradual rollout starting with low-risk operations
        - Implement fallback mechanisms to original services if issues arise
        - Add monitoring to compare performance between old and new services
    - [ ] 4.3 **Update Service Registry** (Effort: Small)
        - Register new unified DataService in service registry
        - Configure health check endpoints for each sub-module
        - Add service discovery patterns for existing consumers
        - Implement graceful degradation if sub-modules fail

- [ ] 5.0 Comprehensive Testing & Validation
    - [ ] 5.1 **Implement Integration Tests** (Effort: Large)
        - Create comprehensive integration tests for unified DataService
        - Test all critical data flows: scheduling → scraping → collection
        - Validate that data quality and performance meet existing standards
        - Test error handling and fallback scenarios with comprehensive edge cases
        - Ensure browser lifecycle management works correctly under load
    - [ ] 5.2 **Add Observability and Monitoring** (Effort: Medium)
        - Implement performance metrics collection for consolidated service
        - Add health check endpoints for each sub-module (WebScraping, ProductScraping, SmartCollection)
        - Configure alerts for scraping failures and performance degradation
        - Preserve existing correlation ID tracking and business event logging
        - Add Puppeteer-specific monitoring (browser crashes, memory leaks)
    - [ ] 5.3 **Performance and Load Testing** (Effort: Medium)
        - Test consolidated services under realistic load conditions
        - Validate memory usage and browser resource consumption
        - Ensure scraping and data collection times remain acceptable
        - Test concurrent scraping operations and browser management
        - Validate Puppeteer browser pool management efficiency

## Implementation Guidelines

### Service Consolidation Patterns
```typescript
// New Unified DataService Structure
export class DataService {
  private webScrapingModule: WebScrapingModule;
  private productScrapingModule: ProductScrapingModule;
  private smartCollectionModule: SmartCollectionModule;
  private browser: Browser | null = null;
  private defaultScrapingOptions: ScrapingOptions;

  constructor() {
    this.defaultScrapingOptions = {
      timeout: 30000,
      retries: 3,
      enableJavaScript: true,
      blockedResourceTypes: ['image', 'font', 'media']
    };
    
    this.webScrapingModule = new WebScrapingModule(this.defaultScrapingOptions);
    this.productScrapingModule = new ProductScrapingModule(this.webScrapingModule);
    this.smartCollectionModule = new SmartCollectionModule(this.webScrapingModule);
  }

  // Factory methods for backward compatibility
  getWebScraper(): WebScrapingInterface {
    return this.webScrapingModule;
  }

  getProductScraper(): ProductScrapingInterface {
    return this.productScrapingModule;
  }

  getSmartCollector(): SmartCollectionInterface {
    return this.smartCollectionModule;
  }

  // Unified data collection interface
  async collectData(request: UnifiedDataRequest): Promise<UnifiedDataResponse> {
    const { collectionType, targetId, options } = request;
    
    switch (collectionType) {
      case 'web_scraping':
        return this.webScrapingModule.scrapeUrl(request.url, options);
      case 'product_scraping':
        return this.productScrapingModule.scrapeProductById(targetId, options);
      case 'smart_collection':
        return this.smartCollectionModule.collectProjectData(targetId, options);
      default:
        throw new Error(`Unsupported collection type: ${collectionType}`);
    }
  }

  // Browser lifecycle management (shared across all modules)
  async initialize(): Promise<void> {
    await this.webScrapingModule.initialize();
  }

  async close(): Promise<void> {
    await this.webScrapingModule.close();
  }
}
```

### WebScrapingModule Pattern
```typescript
// WebScrapingModule - Core Puppeteer Management
export class WebScrapingModule implements WebScrapingInterface {
  private browser: Browser | null = null;
  private defaultOptions: ScrapingOptions;

  constructor(defaultOptions: ScrapingOptions) {
    this.defaultOptions = defaultOptions;
  }

  async initialize(): Promise<void> {
    if (this.browser) return;

    this.browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });
  }

  async scrapeUrl(url: string, options: ScrapingOptions = {}): Promise<ScrapedData> {
    const mergedOptions = { ...this.defaultOptions, ...options };
    const correlationId = generateCorrelationId();
    
    try {
      // Preserve existing scraping logic with enhanced error handling
      const page = await this.browser!.newPage();
      await page.setUserAgent(mergedOptions.userAgent!);
      
      // Enhanced retry logic with exponential backoff
      let lastError: Error | null = null;
      for (let attempt = 1; attempt <= mergedOptions.retries!; attempt++) {
        try {
          await page.goto(url, { timeout: mergedOptions.timeout });
          const content = await page.content();
          const title = await page.title();
          
          await page.close();
          
          return {
            url,
            html: content,
            text: await page.evaluate(() => document.body.innerText),
            title,
            timestamp: new Date(),
            correlationId
          };
        } catch (error) {
          lastError = error as Error;
          if (attempt < mergedOptions.retries!) {
            await new Promise(resolve => setTimeout(resolve, mergedOptions.retryDelay! * attempt));
          }
        }
      }
      
      throw lastError;
    } catch (error) {
      logger.error('Web scraping failed', error as Error, { url, correlationId });
      throw error;
    }
  }

  // Preserve existing competitor-specific methods
  async scrapeCompetitor(competitorId: string, options: ScrapingOptions = {}): Promise<string> {
    // Implementation preserving existing SmartSchedulingService integration
  }

  async scrapeAllCompetitors(options: ScrapingOptions = {}): Promise<string[]> {
    // Implementation for batch competitor scraping
  }
}
```

### Critical Data Flow Preservation
```typescript
// Preserve Smart Scheduling → Data Collection → Analysis Flow
class DataService {
  async collectDataWithFreshness(request: DataRequest): Promise<DataResponse> {
    // Step 1: Check data freshness (preserve existing logic)
    const freshnessStatus = await this.smartCollectionModule.checkDataFreshness(request.projectId);
    
    // Step 2: Execute collection based on freshness and priority
    if (request.forceFreshData || freshnessStatus.requiresUpdate) {
      return this.smartCollectionModule.collectProjectData(request.projectId, {
        priority: DataCollectionPriority.FRESH_COMPETITOR_SNAPSHOTS,
        forceFreshData: true
      });
    }
    
    // Step 3: Return existing data or collect with lower priority
    return this.smartCollectionModule.collectProjectData(request.projectId, {
      priority: DataCollectionPriority.EXISTING_SNAPSHOTS
    });
  }
}
```

## Proposed File Structure

### New Domain Services Structure
```
src/services/domains/
├── DataService.ts                  # Main unified data service
├── data/                          # Data sub-modules
│   ├── WebScrapingModule.ts       # Core Puppeteer operations
│   ├── ProductScrapingModule.ts   # Product-specific scraping
│   ├── SmartCollectionModule.ts   # Intelligent data collection
│   └── types.ts                   # Data domain types
├── shared/
│   ├── interfaces/                # Shared service contracts
│   ├── types/                     # Common type definitions
│   └── utils/                     # Shared utilities
└── legacy/
    ├── webScraper.ts             # Original WebScraperService (preserved for rollback)
    ├── productScrapingService.ts  # Original ProductScrapingService
    └── smartDataCollectionService.ts # Original SmartDataCollectionService
```

### Migration Strategy Files
```
src/services/migration/
├── DataServiceMigration.ts        # Migration utilities for data services
├── FeatureFlags.ts               # Feature flag management for gradual rollout
└── DataServiceHealthCheck.ts     # Health monitoring during migration
```

### Updated Integration Points
```
src/services/
├── smartSchedulingService.ts      # Updated to use DataService
├── reports/
│   └── initialComparativeReportService.ts # Updated to use SmartCollectionModule
└── autoReportGenerationService.ts # Updated to use ProductScrapingModule
```

## Edge Cases & Error Handling

### Data Collection Risks
- **Browser Memory Leaks**: Implement proper Puppeteer browser lifecycle management
- **Concurrent Scraping Limits**: Add browser pool management and request queuing
- **Network Timeout Issues**: Implement comprehensive retry logic with exponential backoff
- **Content Validation Failures**: Add data quality checks and fallback mechanisms
- **Database Connection Issues**: Implement connection pooling and retry strategies

### Service Consolidation Risks
- **Smart Scheduling Integration**: Monitor data freshness workflows and scraping triggers
- **Performance Regression**: Add performance monitoring and automatic rollback triggers
- **Memory Usage Spikes**: Monitor browser memory consumption and implement cleanup
- **Data Quality Degradation**: Implement comprehensive data validation and quality scoring

### Migration Strategy Risks
- **Feature Flag Failures**: Implement monitoring and automatic rollback for feature flag issues
- **Partial Migration Issues**: Ensure consistent behavior during gradual rollout
- **Puppeteer Browser Issues**: Implement browser crash recovery and automatic restart
- **Data Consistency**: Validate that collected data remains consistent during service transition

## Code Review Guidelines

### Consolidation Review Focus
- **Interface Compatibility**: Ensure all existing consumers can still call consolidated services
- **Performance Impact**: Verify no performance regression in scraping or data collection
- **Memory Management**: Review Puppeteer browser management and memory usage patterns
- **Error Handling**: Confirm comprehensive error handling with proper correlation ID tracking
- **Data Quality**: Ensure data validation and quality checks are preserved

### Critical Flow Validation
- **Smart Scheduling**: Verify data freshness checking and scraping trigger logic is preserved
- **Data Collection**: Confirm all collection workflows maintain quality and completeness
- **Browser Management**: Verify Puppeteer browser lifecycle is properly managed
- **Database Operations**: Ensure all database interactions maintain existing patterns

### Testing Requirements
- **Integration Tests**: All critical user workflows must have integration test coverage
- **Performance Tests**: Load testing for consolidated services under realistic conditions
- **Browser Tests**: Comprehensive testing of Puppeteer operations and memory management
- **Rollback Tests**: Verify feature flag rollback works correctly under various conditions

## Acceptance Testing Checklist

### Phase 1 Completion (Data Domain Consolidation)
- [ ] `DataService` provides all functionality of original data services
- [ ] Smart scheduling integration preserves data freshness workflows
- [ ] Data collection quality metrics meet or exceed original service performance
- [ ] All existing data consumers work without code changes (backward compatibility)
- [ ] Browser memory usage remains within acceptable limits for concurrent scraping
- [ ] Integration tests pass with 95%+ reliability

### Critical Data Flow Validation
- [ ] SmartSchedulingService → DataService integration works correctly
- [ ] InitialComparativeReportService → SmartCollectionModule integration preserved
- [ ] AutoReportGenerationService → ProductScrapingModule integration maintained
- [ ] API routes continue to function with new DataService interfaces
- [ ] Puppeteer browser lifecycle management works correctly under load
- [ ] Data quality and completeness metrics match original services

### Production Readiness Checklist
- [ ] All critical data flows identified in health audit continue to function
- [ ] Monitoring and alerting configured for consolidated data services
- [ ] Browser pool management and memory optimization implemented
- [ ] Documentation updated for new service interfaces
- [ ] Rollback procedures documented and tested
- [ ] Feature flag configuration validated in production environment
- [ ] Load testing completed under production-equivalent conditions

## Integration Plan

### Phase 1: Core DataService Implementation (Weeks 1-2)
1. **Week 1**: Implement unified `DataService` with all sub-modules
2. **Week 2**: Add comprehensive error handling, monitoring, and health checks

### Phase 2: Consumer Service Integration (Weeks 3-4)
1. **Week 3**: Update SmartSchedulingService and other critical consumers with feature flags
2. **Week 4**: Update remaining consumers and API routes

### Phase 3: Testing and Validation (Weeks 5-6)
1. **Week 5**: Comprehensive integration testing and performance validation
2. **Week 6**: Load testing and production readiness validation

### Phase 4: Gradual Rollout (Weeks 7-8)
1. **Week 7**: Gradual rollout with monitoring and performance tracking
2. **Week 8**: Full rollout and legacy service deprecation

## Notes / Open Questions

### Implementation Considerations
- **Browser Pool Management**: How many concurrent Puppeteer browsers should be maintained?
- **Memory Optimization**: What's the optimal strategy for browser cleanup and memory management?
- **Queue Management**: Should scraping requests be queued to prevent resource exhaustion?
- **Caching Strategy**: How should scraped data be cached to improve performance?

### Future Enhancements (Post-Consolidation)
- **Advanced Scraping**: Enhanced content extraction and parsing capabilities
- **Performance Optimization**: Browser pool optimization and resource management
- **Data Quality**: Advanced data validation and quality scoring algorithms
- **Real-time Collection**: Streaming data collection for large-scale operations

### Success Metrics
- **Architectural Complexity**: 67% reduction in data service dependencies (3 → 1 services)
- **Developer Productivity**: 40% improvement in data collection feature development time
- **System Reliability**: Maintain 99.9% uptime during and after migration
- **Performance**: No regression in scraping times, improved browser resource management
- **Memory Usage**: 30% reduction in peak memory usage through shared browser management 