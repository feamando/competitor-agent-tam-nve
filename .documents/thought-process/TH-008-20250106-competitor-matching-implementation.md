# TH-008-20250106-Competitor-Matching-Implementation

## Problem Analysis

The user has identified a critical issue: users are creating multiple competitors that represent the same company, leading to data duplication and fragmentation. This occurs because:

1. **No Duplicate Detection:** Current system doesn't check for existing competitors when creating new ones
2. **Website-based Matching:** The most reliable identifier for competitors is their website address
3. **Multi-user Environment:** With TP-026 implementing user profiles, multiple users might independently add the same competitor
4. **Many-to-Many Relationship Needed:** A single competitor should be associable with multiple users and projects

## Current System Analysis

### Database Schema (Competitor Model)
- `id`: Primary key (String/cuid)
- `name`: Company name (String)
- `website`: Website URL (String) - **Key field for matching**
- `description`, `industry`, `employeeCount`, etc. - Additional fields
- `projects`: Many-to-many relation with Project model

### Current API Flow (POST /api/competitors)
1. Validate input data using Zod schema
2. Transform website URL (add https:// if missing)
3. Create competitor directly with `prisma.competitor.create()`
4. Trigger snapshot collection
5. Return created competitor

**Problem:** No duplicate checking occurs before creation.

## Proposed Solution Analysis

### Core Strategy: Website-based Deduplication
- **Primary Matching:** Compare normalized website URLs
- **Association Logic:** If match found, associate existing competitor with current user
- **Fallback:** If no match, create new competitor

### Normalization Strategy for Website Matching
```typescript
function normalizeWebsite(website: string): string {
  // Remove protocol, www, trailing slashes, query params
  return website
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '')
    .split('?')[0]
    .toLowerCase();
}
```

### Integration with TP-026 Profile System
- **Profile-scoped Queries:** Users see only their associated competitors
- **Cross-profile Sharing:** Same competitor can be associated with multiple profiles
- **Association Table:** May need `ProfileCompetitor` junction table

### Database Schema Changes Needed

#### Option 1: Add ProfileCompetitor Junction Table
```sql
CREATE TABLE ProfileCompetitor (
  id TEXT PRIMARY KEY,
  profileId TEXT REFERENCES Profile(id),
  competitorId TEXT REFERENCES Competitor(id),
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(profileId, competitorId)
);
```

#### Option 2: Extend Existing Relations
- Leverage existing many-to-many through projects
- Add direct profile-competitor association to existing schema

**Recommendation:** Option 1 provides cleaner separation and explicit user-competitor relationships.

## Implementation Complexity Assessment

### Minimal Invasiveness Analysis
1. **API Changes:** Modify POST /api/competitors to check for duplicates first
2. **Database:** Add ProfileCompetitor table and update queries
3. **Frontend:** No major changes needed - existing UI continues to work
4. **Integration:** Must work with TP-026 profile system

### Risk Assessment
- **Low Risk:** Website matching is straightforward
- **Medium Risk:** Database migration and profile integration 
- **Low Risk:** API changes are backwards compatible

## Technical Decision Points

### Website Matching Algorithm
```typescript
// Proposed matching logic
async function findExistingCompetitor(website: string): Promise<Competitor | null> {
  const normalized = normalizeWebsite(website);
  
  // Check direct match first
  let competitor = await prisma.competitor.findFirst({
    where: { 
      website: { 
        contains: normalized,
        mode: 'insensitive' 
      } 
    }
  });
  
  // If not found, check all competitors for normalized match
  if (!competitor) {
    const allCompetitors = await prisma.competitor.findMany();
    competitor = allCompetitors.find(c => 
      normalizeWebsite(c.website) === normalized
    );
  }
  
  return competitor;
}
```

### User Experience Flow
1. User creates competitor with website "https://www.example.com"
2. System normalizes to "example.com"
3. System searches for existing competitors with matching normalized website
4. If found: Associate existing competitor with current user's profile
5. If not found: Create new competitor and associate with user's profile
6. Return success with competitor data

### Performance Considerations
- **Database Indexes:** Add index on normalized website field
- **Caching:** Cache normalized website mappings
- **Query Optimization:** Limit competitor search scope when possible

## Integration with TP-026

### Prerequisites
- TP-026 must be completed first (Profile system with user sessions)
- Profile service must provide `getCurrentProfileId()` function
- API routes must have profile-scoped data access

### Profile Association Strategy
```typescript
// When competitor found or created
await prisma.profileCompetitor.upsert({
  where: {
    profileId_competitorId: {
      profileId: getCurrentProfileId(),
      competitorId: competitor.id
    }
  },
  create: {
    profileId: getCurrentProfileId(),
    competitorId: competitor.id
  },
  update: {} // No-op if already exists
});
```

## Conclusion

The competitor matching solution should be:
1. **Simple:** Website-based matching with URL normalization
2. **Non-invasive:** Minimal changes to existing API and UI
3. **Profile-aware:** Integrated with TP-026 user profile system
4. **Scalable:** Efficient database queries and proper indexing

The implementation can be completed as a focused task plan building on TP-026's foundation. 