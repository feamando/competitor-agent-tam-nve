# TP-028-20250106-Competitor-Matching-Implementation

## Overview
- **Project:** Competitor Research Agent - Competitor Matching System
- **Date:** 2025-01-06
- **RequestID:** TP-028-20250106-competitor-matching-implementation
- **Goal:** Implement website-based competitor deduplication to prevent multiple users from creating duplicate competitor records

## Pre-requisites
- **TP-026 Completion:** Basic User Profiles implementation must be completed first
- **Database Access:** SQLite database with Prisma ORM
- **Development Environment:** Next.js 14+ with TypeScript
- **Git Branch Creation:** `git checkout -b feature/competitor-matching-20250106-TP-028`
- **Profile System:** Working profile service from TP-026 with `getCurrentProfileId()` function

## Dependencies
- **Profile System:** TP-026 profile service and session management
- **Competitor API:** Existing `/api/competitors` route and competitor creation flow
- **Database Schema:** Prisma schema modifications and migrations
- **URL Normalization:** Website comparison and matching algorithms
- **Code Owners:** Development team (internal tool, no external dependencies)

## Task Breakdown

- [ ] 1.0 Database Schema Enhancement for Profile-Competitor Association
    - [ ] 1.1 Add ProfileCompetitor junction table to Prisma schema
    - [ ] 1.2 Create database migration for new table with proper indexes
    - [ ] 1.3 Add normalizedWebsite field to Competitor table for efficient matching
    - [ ] 1.4 Create indexes on website fields for performance optimization

- [ ] 2.0 Website Normalization and Matching Service
    - [ ] 2.1 Create website normalization utility (remove protocol, www, trailing slashes)
    - [ ] 2.2 Implement competitor matching service with normalized URL comparison
    - [ ] 2.3 Add database query functions for finding competitors by normalized website
    - [ ] 2.4 Create profile-competitor association utilities

- [ ] 3.0 Enhanced Competitor Creation API
    - [ ] 3.1 Update POST /api/competitors to check for existing competitors before creation
    - [ ] 3.2 Implement competitor association logic for existing matches
    - [ ] 3.3 Update competitor creation flow to handle profile associations
    - [ ] 3.4 Add response differentiation between new creation and existing association

- [ ] 4.0 Profile-Scoped Competitor Queries
    - [ ] 4.1 Update GET /api/competitors to filter by profile associations
    - [ ] 4.2 Modify competitor detail queries to respect profile access
    - [ ] 4.3 Update project-competitor association to use profile-scoped competitors
    - [ ] 4.4 Add competitor sharing status indicators for UI

- [ ] 5.0 Data Migration and Validation
    - [ ] 5.1 Create migration script to populate normalizedWebsite field for existing competitors
    - [ ] 5.2 Create ProfileCompetitor associations for existing data with default profile
    - [ ] 5.3 Add validation tests for competitor matching algorithm
    - [ ] 5.4 Validate profile isolation and competitor sharing functionality

## Implementation Guidelines

### Key Approaches
- **Website-First Matching:** Use normalized website URLs as the primary deduplication key
- **Profile Association:** Enable multiple users to share the same competitor record
- **Backwards Compatibility:** Existing competitor data and API usage continue to work
- **Performance Optimization:** Efficient database queries with proper indexing

### Reference Existing Modules
- **Profile Service:** `src/lib/profile/profileService.ts` - from TP-026 for profile management
- **Competitor API:** `src/app/api/competitors/route.ts` - existing competitor creation logic
- **Prisma Schema:** `prisma/schema.prisma` - current database model structure
- **URL Transformation:** Existing website normalization in competitor schema validation

### Technical Patterns

```typescript
// Website Normalization Service
export class WebsiteNormalizationService {
  static normalize(website: string): string {
    return website
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/+$/, '')
      .split('?')[0]
      .toLowerCase();
  }
}

// Competitor Matching Service
export class CompetitorMatchingService {
  async findExistingCompetitor(website: string): Promise<Competitor | null> {
    const normalized = WebsiteNormalizationService.normalize(website);
    return await prisma.competitor.findFirst({
      where: { normalizedWebsite: normalized }
    });
  }

  async associateWithProfile(competitorId: string, profileId: string) {
    return await prisma.profileCompetitor.upsert({
      where: { profileId_competitorId: { profileId, competitorId } },
      create: { profileId, competitorId },
      update: {}
    });
  }
}

// Enhanced Competitor Creation Flow
export async function createOrAssociateCompetitor(data: CompetitorData, profileId: string) {
  const existing = await competitorMatching.findExistingCompetitor(data.website);
  
  if (existing) {
    await competitorMatching.associateWithProfile(existing.id, profileId);
    return { competitor: existing, created: false };
  } else {
    const competitor = await prisma.competitor.create({ data });
    await competitorMatching.associateWithProfile(competitor.id, profileId);
    return { competitor, created: true };
  }
}
```

## Proposed File Structure

### New Files
```
src/lib/competitors/
├── websiteNormalization.ts     # Website URL normalization utilities
├── competitorMatching.ts       # Core matching and association logic
└── profileCompetitorService.ts # Profile-competitor relationship management

src/app/api/competitors/
└── matching/
    └── route.ts                # API endpoint for checking existing competitors (optional)

prisma/migrations/
└── [timestamp]_add_competitor_matching/
    └── migration.sql           # Database schema changes
```

### Modified Files
```
prisma/schema.prisma            # Add ProfileCompetitor model and normalizedWebsite field
src/app/api/competitors/route.ts # Update creation logic with matching
src/app/api/competitors/[id]/route.ts # Update queries for profile-scoped access
src/services/competitorAnalysis.ts # Update service with profile associations
```

## Edge Cases & Error Handling

### Edge Cases to Consider
1. **Similar Website Variations:** Different subdomains, protocols, or paths for same company
2. **Profile Migration:** Users switching profiles should see correct competitor associations
3. **Bulk Competitor Creation:** Multiple users creating same competitor simultaneously
4. **Website Changes:** Existing competitors updating their website URLs
5. **Invalid Websites:** Handling competitors without valid website URLs
6. **Cross-Profile Access:** Users requesting competitors they don't have access to

### Error Handling Strategy
- **Matching Failures:** Log issues but don't block competitor creation
- **Profile Association Errors:** Ensure competitor is created even if association fails
- **Database Constraints:** Handle unique constraint violations gracefully
- **Migration Errors:** Comprehensive rollback and data validation procedures
- **Normalization Edge Cases:** Fallback to original website if normalization fails

## Code Review Guidelines

### Critical Review Points
- **Deduplication Logic:** Verify website matching correctly identifies duplicates
- **Profile Isolation:** Confirm users only see their associated competitors
- **Data Integrity:** Ensure ProfileCompetitor associations are correctly maintained
- **Performance Impact:** Validate additional queries don't significantly slow competitor operations
- **Migration Safety:** Verify database migrations preserve existing data and relationships
- **API Compatibility:** Confirm existing API consumers continue to work

### Specific Checks
- All competitor creation flows use the matching service
- Profile associations are created for all competitor-profile relationships
- Website normalization handles edge cases (empty, invalid URLs)
- Database indexes are properly created for new query patterns
- Error handling maintains system stability during edge cases

## Acceptance Testing Checklist

### Functional Requirements
- [ ] User creates competitor with existing website - gets associated with existing competitor
- [ ] User creates competitor with new website - creates new competitor record
- [ ] Multiple users can be associated with the same competitor
- [ ] Users only see competitors associated with their profile
- [ ] Website variations (www, https, trailing slashes) are matched correctly
- [ ] Existing competitor data is preserved and accessible
- [ ] Profile switching shows correct competitor associations

### Non-Functional Requirements
- [ ] Competitor creation performance remains within 2 seconds
- [ ] Website matching queries complete within 500ms
- [ ] Database migration completes without data loss
- [ ] System handles concurrent competitor creation without conflicts
- [ ] Profile-scoped queries maintain acceptable performance

### Integration Requirements
- [ ] TP-026 profile system integration works seamlessly
- [ ] Existing API endpoints maintain backward compatibility
- [ ] Project-competitor associations work with new profile system
- [ ] Competitor snapshot and analysis features work with shared competitors
- [ ] Error scenarios provide appropriate user feedback

## Notes / Open Questions

### Implementation Notes
- **Website Matching Precision:** Balance between strict matching (exact match) and flexible matching (domain similarity)
- **Profile Association Display:** Consider showing users if a competitor is shared with others
- **Data Ownership:** Clarify behavior when competitor data is updated by different users
- **Normalization Strategy:** Use conservative approach to avoid false positive matches

### Future Considerations
- **Competitor Merging:** Admin interface to merge incorrectly separated competitors (not in scope)
- **Bulk Import:** Handle bulk competitor imports with deduplication (not in scope)
- **Advanced Matching:** Machine learning-based company name matching (not in scope)
- **Audit Trail:** Track which profiles are associated with competitors over time (not in scope)
- **API Versioning:** Versioned API responses for different matching behaviors (not in scope)

### Performance Optimization Opportunities
- **Caching:** Cache normalized website lookups for frequently accessed competitors
- **Batch Processing:** Optimize bulk competitor operations with batch association creation
- **Index Strategy:** Consider composite indexes for complex profile-competitor queries

---

**Estimated Effort:** Medium (4-6 days)
**Risk Level:** Low-Medium
**Impact:** High - Eliminates duplicate competitor creation and enables multi-user competitor sharing
**Dependencies:** Must complete TP-026 before starting this implementation 