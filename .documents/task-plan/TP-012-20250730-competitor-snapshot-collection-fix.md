# Task Plan: Competitor Snapshot Collection System Fix

## Overview
Fix the competitor snapshot collection system to ensure automatic, intelligent scraping based on competitor lifecycle events and snapshot freshness. Address the current bug where manual scraping works but automatic detection and triggering is broken, causing report generation to fall back to template data.

- **Project Name**: Competitor Research Agent
- **Date**: 2025-07-30  
- **RequestID**: TP-012-20250730-competitor-snapshot-collection-fix

## Pre-requisites
- Node.js application running successfully
- Database connection working
- Existing web scraping infrastructure (`/src/app/api/competitors/[id]/snapshot/route.ts`) functional
- Git branch creation: `git checkout -b feature/competitor-snapshot-collection-fix-20250730-TP012`

## Dependencies
- **Internal**: 
  - `src/services/smartSchedulingService.ts` (existing)
  - `src/app/api/projects/[id]/initial-report-status/route.ts` (requires fixes)
  - `src/app/api/competitors/[id]/snapshot/route.ts` (working)
  - Database schema (Prisma) for snapshots and competitors
- **External**: 
  - Puppeteer web scraping service
  - Database (assumed PostgreSQL/SQLite)
- **Code Owners**: Check `.claim.json` for ownership of report generation and competitor services

## Task Breakdown

- [x] 1.0 Fix Snapshot Detection and Status Reporting **COMPLETED**
    - [x] 1.1 Debug and fix `getCompetitorSnapshotsStatus()` function in `/src/app/api/projects/[id]/initial-report-status/route.ts` to correctly count existing snapshots [Medium] **COMPLETED**
    - [x] 1.2 Add comprehensive logging to snapshot saving process to track database write operations [Small] **COMPLETED**
    - [x] 1.3 Implement snapshot metadata validation to ensure saved snapshots are properly indexed [Medium] **COMPLETED**
    - [x] 1.4 Create snapshot existence verification utility function [Small] **COMPLETED**

- [x] 2.0 Implement Snapshot Freshness Management System **COMPLETED**
    - [x] 2.1 Create `SnapshotFreshnessService` class in `/src/services/snapshotFreshnessService.ts` [Medium] **COMPLETED**
    - [x] 2.2 Implement `isSnapshotFresh(competitorId: string, maxAgeInDays: number = 7)` method [Small] **COMPLETED**
    - [x] 2.3 Implement `getStaleSnapshots(projectId: string)` method to identify competitors needing updates [Medium] **COMPLETED**
    - [x] 2.4 Add database queries for efficient snapshot age calculation [Small] **COMPLETED**

- [x] 3.0 Implement Competitor Addition Trigger (Requirement 1a) **COMPLETED**
    - [x] 3.1 Identify competitor creation endpoints in `/src/app/api/competitors/` [Small] **COMPLETED**
    - [x] 3.2 Add post-creation hook to trigger immediate snapshot collection [Medium] **COMPLETED**
    - [x] 3.3 Implement async snapshot triggering to avoid blocking competitor creation [Medium] **COMPLETED**
    - [x] 3.4 Add error handling and retry logic for failed initial snapshots [Small] **COMPLETED**

- [x] 4.0 Implement Missing Snapshot Detection Trigger (Requirement 1b) **COMPLETED**
    - [x] 4.1 Extend `SmartSchedulingService.checkAndTriggerScraping()` to detect competitors without snapshots [Medium] **COMPLETED**
    - [x] 4.2 Implement `getCompetitorsWithoutSnapshots(projectId: string)` utility function [Small] **COMPLETED**
    - [x] 4.3 Add automatic snapshot triggering for missing snapshots during report generation [Medium] **COMPLETED**
    - [x] 4.4 Implement batch processing for multiple missing snapshots [Large] **COMPLETED**

- [x] 5.0 Implement Stale Snapshot Detection and Refresh (Requirement 1c) **COMPLETED**
    - [x] 5.1 Integrate freshness checking into report generation workflow [Medium] **COMPLETED**
    - [x] 5.2 Modify `/src/services/reports/initialComparativeReportService.ts` to check snapshot age before analysis [Medium] **COMPLETED**
    - [x] 5.3 Implement automatic refresh trigger for stale snapshots (>7 days) [Medium] **COMPLETED**
    - [x] 5.4 Add configurable staleness threshold (defaulting to 7 days) [Small] **COMPLETED**

- [x] 6.0 Implement Fresh Snapshot Optimization (Requirement 1d) **COMPLETED**
    - [x] 6.1 Add pre-check in snapshot triggering logic to skip fresh snapshots (<7 days) [Small] **COMPLETED**
    - [x] 6.2 Implement caching mechanism for recent freshness checks [Medium] **COMPLETED**
    - [x] 6.3 Add performance logging for skipped snapshot operations [Small] **COMPLETED**
    - [x] 6.4 Create dashboard metrics for snapshot efficiency tracking [Medium] **COMPLETED**

- [x] 7.0 Integration and Error Handling **COMPLETED**
    - [x] 7.1 Update error handling in report generation to gracefully handle snapshot failures [Medium] **COMPLETED**
    - [x] 7.2 Implement comprehensive logging for all snapshot trigger points [Small] **COMPLETED**
    - [x] 7.3 Add monitoring and alerting for snapshot collection failures [Medium] **COMPLETED**
    - [x] 7.4 Create fallback mechanisms when snapshot collection consistently fails [Large] **COMPLETED**

- [x] 8.0 Testing and Validation **COMPLETED**
    - [x] 8.1 Create unit tests for `SnapshotFreshnessService` [Medium] **COMPLETED**
    - [x] 8.2 Create integration tests for all four trigger scenarios [Large] **COMPLETED**
    - [x] 8.3 Implement manual testing scenarios for each requirement [Medium] **COMPLETED**
    - [x] 8.4 Performance testing for batch snapshot operations [Medium] **COMPLETED**

## Implementation Guidelines

### Key Approaches and Patterns:
- **Event-driven architecture**: Use hooks and listeners for automatic triggering
- **Smart scheduling**: Leverage existing `SmartSchedulingService` infrastructure
- **Graceful degradation**: Ensure report generation continues with available data
- **Async processing**: Prevent snapshot collection from blocking user operations
- **Caching strategy**: Minimize redundant freshness checks and database queries

### Code Organization:
```
src/
├── services/
│   ├── snapshotFreshnessService.ts          # New: Freshness management
│   ├── competitorSnapshotTrigger.ts         # New: Trigger coordination
│   └── smartSchedulingService.ts            # Extended: Integrate new triggers
├── utils/
│   └── snapshotHelpers.ts                   # New: Utility functions
├── app/api/
│   ├── competitors/*/                       # Modified: Add creation hooks
│   └── projects/*/initial-report-status/    # Fixed: Status detection
└── types/
    └── snapshot.ts                          # Extended: New interfaces
```

### Database Considerations:
- Ensure snapshot timestamps are properly indexed for performance
- Consider adding snapshot metadata fields for better tracking
- Implement efficient queries for bulk freshness checking

### Error Handling Strategy:
- **Retry logic**: Exponential backoff for failed snapshot collection
- **Circuit breaker**: Prevent cascading failures
- **Fallback**: Graceful degradation to existing data or template content
- **Monitoring**: Comprehensive logging and alerting

## Proposed File Structure

### New Files:
- `src/services/snapshotFreshnessService.ts`
- `src/services/competitorSnapshotTrigger.ts`
- `src/utils/snapshotHelpers.ts`
- `src/types/snapshotTrigger.ts`

### Modified Files:
- `src/app/api/projects/[id]/initial-report-status/route.ts`
- `src/services/smartSchedulingService.ts`
- `src/services/reports/initialComparativeReportService.ts`
- `src/app/api/competitors/*/route.ts` (creation endpoints)

### Configuration Files:
- Update environment variables for snapshot freshness thresholds
- Add monitoring configuration for snapshot collection metrics

## Edge Cases & Error Handling

### Edge Cases:
1. **Concurrent snapshot requests** for same competitor - implement locking/deduplication
2. **Network failures during scraping** - retry with exponential backoff
3. **Database inconsistencies** - implement snapshot verification and repair
4. **High-frequency project usage** - rate limiting for snapshot triggers
5. **Large batch operations** - implement chunking and progress tracking
6. **Competitor website changes** - handle HTTP errors and content parsing failures

### Error Handling:
- **Graceful fallback**: Use existing snapshots even if stale when refresh fails
- **User notification**: Inform users when snapshot collection is in progress
- **Admin alerts**: Notify administrators of persistent snapshot failures
- **Recovery mechanisms**: Implement manual snapshot collection triggers

## Code Review Guidelines

### Focus Areas for Reviewers:
1. **Performance impact**: Ensure new freshness checks don't slow down report generation
2. **Database efficiency**: Verify optimal query patterns for snapshot operations
3. **Error handling**: Confirm robust handling of network and database failures
4. **Integration points**: Validate all trigger points work correctly without blocking user flows
5. **Memory usage**: Check for potential memory leaks in batch operations
6. **Security**: Ensure snapshot URLs and content are properly validated
7. **Logging**: Verify comprehensive logging without sensitive data exposure

### Specific Checkpoints:
- [ ] All async operations have proper error handling
- [ ] Database queries are optimized with appropriate indexes
- [ ] Rate limiting is implemented for external web scraping
- [ ] Caching mechanisms prevent redundant operations
- [ ] Integration tests cover all four requirement scenarios

## Acceptance Testing Checklist

### Functional Requirements:
- [ ] **1a**: Adding new competitor triggers immediate snapshot collection
- [ ] **1b**: Report generation detects missing snapshots and triggers collection
- [ ] **1c**: Report generation detects stale snapshots (>7 days) and triggers refresh
- [ ] **1d**: Fresh snapshots (<7 days) are not unnecessarily re-collected
- [ ] Fixed snapshot detection correctly counts existing snapshots
- [ ] Report generation uses real snapshot data instead of template content

### Non-Functional Requirements:
- [ ] Snapshot collection doesn't block user interface operations
- [ ] Batch operations complete within reasonable time limits (<5 minutes for 10 competitors)
- [ ] Error handling gracefully manages network failures
- [ ] Logging provides sufficient debugging information
- [ ] Performance impact on report generation is minimal (<10% increase)
- [ ] Memory usage remains stable during batch operations

### Integration Testing:
- [ ] Full end-to-end test from competitor creation to report generation
- [ ] Test with multiple concurrent projects using same competitors
- [ ] Verify database consistency across all operations
- [ ] Test recovery from various failure scenarios
- [ ] Validate monitoring and alerting functionality

### User Experience:
- [ ] Users see progress indicators during snapshot collection
- [ ] Error messages are clear and actionable
- [ ] Report quality improves with real competitive data
- [ ] System remains responsive during background operations

## Notes / Open Questions

### Configuration Decisions:
- **Snapshot freshness threshold**: Default 7 days, should this be configurable per project?
- **Batch processing size**: How many concurrent snapshots to process simultaneously?
- **Retry policy**: Maximum retry attempts and backoff strategy for failed snapshots

### Future Enhancements:
- **Intelligent scheduling**: Use competitor website update patterns to optimize refresh timing
- **Selective content extraction**: Only re-scrape changed sections of websites
- **Competitive intelligence**: Alert users when competitor websites show significant changes
- **Performance dashboard**: Real-time monitoring of snapshot collection system health

### Technical Debt Considerations:
- Current template fallback system should be gradually phased out
- Consider migrating to more efficient web scraping technology if volume increases
- Database schema may need optimization for large-scale snapshot storage

### Dependencies on External Systems:
- Monitor rate limiting from competitor websites
- Consider using web scraping proxy services for reliability
- Plan for handling anti-bot protection mechanisms 