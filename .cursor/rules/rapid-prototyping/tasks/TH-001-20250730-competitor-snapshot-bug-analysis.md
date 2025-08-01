# Thought Process: Competitor Snapshot Collection Bug Analysis

**Date:** 2025-07-30  
**RequestID:** TH-001-20250730-competitor-snapshot-bug-analysis  

## Problem Analysis

### Current Issues Identified:
1. **Manual snapshot capture works** - Confirmed Butcher Box scraping returned full HTML content
2. **Database counting mechanism broken** - Shows 0 captured despite successful capture at 2025-07-30T15:07:34.323Z
3. **Report generation falls back to template data** - Due to snapshot detection failure
4. **Missing automatic triggers** - No scraping on competitor addition, project usage, or staleness checks

### Technical Root Causes:
1. **Snapshot Status API Issue** - `getCompetitorSnapshotsStatus()` in `/src/app/api/projects/[id]/initial-report-status/route.ts` not detecting saved snapshots
2. **Missing Integration Points** - No hooks in competitor creation, project report generation
3. **Stale Snapshot Detection** - No 7-day freshness checks implemented
4. **Database-File Sync Issues** - Mismatch between snapshot saving and status checking

### Key Requirements Analysis:
- **1a**: Trigger on competitor addition (UI/API hook needed)
- **1b**: Trigger when competitor has no snapshot (detection + trigger)  
- **1c**: Trigger when snapshot >7 days old (freshness check + trigger)
- **1d**: Skip when snapshot <7 days old (optimization)

### Technical Scope Assessment:
- **High confidence** - Clear requirements, existing scraping works
- **Moderate complexity** - Requires multiple integration points
- **Database schema impact** - May need snapshot metadata improvements
- **Performance considerations** - Smart scheduling to avoid excessive scraping

### Implementation Strategy:
1. Fix snapshot detection/counting logic first
2. Implement freshness checking utility
3. Add trigger points in competitor lifecycle
4. Add trigger points in report generation flow
5. Implement smart scheduling to avoid redundant scraping

### Key Files to Modify:
- Snapshot status checking logic
- Competitor creation endpoints
- Report generation services
- Smart scheduling service (existing)
- Database queries for snapshot freshness

## Assumptions Made:
- Existing web scraping infrastructure is reliable
- Database schema supports timestamp-based freshness queries
- Smart scheduling service can be extended
- UI competitor addition flows are identifiable

## Risk Assessment:
- **Low risk** - Well-defined requirements, existing working components
- **Main concern** - Performance impact of frequent freshness checks
- **Mitigation** - Implement caching and smart batching 