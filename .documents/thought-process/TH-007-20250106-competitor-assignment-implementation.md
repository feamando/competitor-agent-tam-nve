# TH-007-20250106-Competitor-Assignment-Implementation

## Analysis Summary

### Current State Analysis
Based on codebase examination, I've identified the following key findings:

**Current Project Creation Flow:**
1. Chat interface collects 10 data points from user
2. Point 10 currently expects competitor list as comma-separated values
3. System auto-assigns ALL competitors from database regardless of user input
4. No validation or filtering of competitors based on user selection

**Key Code Locations:**
- **Chat Flow:** `src/lib/chat/conversation.ts` - Line 2096-2104 shows auto-assignment logic
- **API Route:** `src/app/api/projects/route.ts` - Lines 78-88 auto-assigns all competitors
- **Project Service:** `src/services/projectService.ts` - Lines 65-83 handles competitor connections
- **Database Schema:** Many-to-many relationship between Project and Competitor

**Current Auto-Assignment Logic:**
```typescript
// In conversation.ts, createProjectFromComprehensiveData()
const databaseProject = await this.createProjectWithAllCompetitors(requirements.projectName, requirements.userEmail);

// In projects/route.ts, POST()
const allCompetitors = await prisma.competitor.findMany({
  select: { id: true, name: true }
});
const competitorIds = allCompetitors.map(c => c.id);
```

### Problem Validation
The user story is accurate - projects are created with ALL competitors assigned, ignoring user input. This creates several issues:
1. Reports become too broad and unfocused
2. Performance impact from processing unnecessary competitors
3. User confusion when they specified specific competitors but get all

### Implementation Strategy Assessment

**Approach: Minimally Invasive Solution**
Given the constraint to be "minimally invasive" and implemented after TP-026, I propose:

1. **Modify Chat Flow:** Update step 10 validation to actually parse and validate competitor input
2. **Create Competitor Resolution Service:** New service to resolve names/URLs/IDs to database entities
3. **Update Project Creation:** Modify both chat and API routes to use selected competitors instead of all
4. **Maintain Backward Compatibility:** Ensure existing functionality doesn't break

**Validation Strategy:**
The user wants three input formats supported:
- Competitor name (exact match, ignore case)
- Competitor website URL
- Competitor ID (direct database lookup)

**Risk Assessment:**
- **Low Risk:** Changes are contained to specific modules
- **Database:** No schema changes needed (many-to-many already exists)
- **UI Impact:** Minimal - just validation feedback
- **Performance:** Actually improves performance by reducing competitor count per project

### Technical Implementation Plan

**Phase 1: Create Competitor Resolution Service**
- Build service to resolve user input to competitor IDs
- Handle validation errors and provide clear feedback
- Support fuzzy matching for names with confirmation

**Phase 2: Update Chat Interface**
- Modify conversation manager to validate point 10 input
- Parse comma-separated values and resolve to competitors
- Provide validation feedback to user

**Phase 3: Update Project Creation**
- Modify chat flow project creation to use selected competitors
- Update API route to accept competitor selection
- Ensure project service handles competitor filtering

**Phase 4: Testing & Validation**
- Test all three input formats
- Verify backward compatibility
- Test error handling and edge cases

### Dependencies Analysis
- **Database:** Current Prisma schema supports this (many-to-many relation exists)
- **External:** No external API changes needed
- **Services:** Will create new CompetitorResolutionService, minimal changes to existing services
- **UI:** No frontend changes needed (chat interface already supports input)

### Confidence Assessment
**High Confidence (85%)** - This is a straightforward feature with:
- Clear requirements
- Well-understood codebase structure
- Minimal breaking changes
- Existing database relationships support it
- Clear separation of concerns

### Next Steps
1. Create comprehensive task plan with specific implementation tasks
2. Break down work into manageable subtasks
3. Define acceptance criteria and testing strategy
4. Plan integration with existing TP-026 work 