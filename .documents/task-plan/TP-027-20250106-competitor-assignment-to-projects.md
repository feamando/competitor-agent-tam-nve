# TP-027-20250106-Competitor-Assignment-To-Projects

## Overview
This task plan implements selective competitor assignment during project creation, allowing users to specify which competitors should be included in their project analysis rather than auto-assigning all available competitors.

- **Project Name:** Competitor Research Agent
- **Date:** January 6, 2025
- **RequestID:** TP-027-20250106-competitor-assignment-to-projects

## Pre-requisites
- **Git Branch Creation:** `git checkout -b feature/competitor-assignment-to-projects-20250106-TP-027`
- **TP-026 Completion:** This task plan builds on TP-026 (Basic User Profiles Implementation)
- **Database Access:** Functional Prisma client and competitor data
- **Chat Interface:** Working chat-based project creation flow
- **Testing Environment:** Local development setup with test database

## Dependencies
- **Database:** Existing many-to-many relationship between Project and Competitor models
- **Chat System:** `src/lib/chat/conversation.ts` - ConversationManager class
- **Project Service:** `src/services/projectService.ts` - ProjectService class
- **API Routes:** `src/app/api/projects/route.ts` - Project creation endpoint
- **Competitor Data:** Existing competitor records in database
- **Validation Libraries:** Zod schema validation (already in use)

## Task Breakdown

- [ ] 1.0 Create Competitor Resolution Service
    - [ ] 1.1 [Create new CompetitorResolutionService class with input parsing logic]
    - [ ] 1.2 [Implement competitor lookup by name (case-insensitive exact match)]
    - [ ] 1.3 [Implement competitor lookup by website URL]
    - [ ] 1.4 [Implement competitor lookup by database ID]
    - [ ] 1.5 [Add validation error handling with descriptive messages]
    - [ ] 1.6 [Create unit tests for all resolution methods]

- [ ] 2.0 Update Chat Interface Validation
    - [ ] 2.1 [Modify conversation manager to validate point 10 competitor input]
    - [ ] 2.2 [Parse comma-separated competitor list and resolve to IDs]
    - [ ] 2.3 [Add validation feedback for invalid competitor references]
    - [ ] 2.4 [Handle empty/missing competitor list with fallback behavior]
    - [ ] 2.5 [Update chat state to store resolved competitor IDs]

- [ ] 3.0 Update Project Creation Logic
    - [ ] 3.1 [Modify createProjectWithAllCompetitors to accept competitor ID array]
    - [ ] 3.2 [Update chat flow to use selected competitors instead of all]
    - [ ] 3.3 [Modify API route to accept competitorIds parameter]
    - [ ] 3.4 [Update project service to handle competitor filtering]
    - [ ] 3.5 [Maintain backward compatibility for existing API clients]

- [ ] 4.0 Testing and Validation
    - [ ] 4.1 [Create integration tests for competitor name resolution]
    - [ ] 4.2 [Test website URL resolution with various formats]
    - [ ] 4.3 [Test competitor ID resolution]
    - [ ] 4.4 [Test error handling for invalid competitor references]
    - [ ] 4.5 [Test chat flow end-to-end with selected competitors]
    - [ ] 4.6 [Validate project creation with different competitor combinations]

- [ ] 5.0 Documentation and Cleanup
    - [ ] 5.1 [Update API documentation for project creation endpoint]
    - [ ] 5.2 [Document competitor input formats for chat interface]
    - [ ] 5.3 [Create troubleshooting guide for validation errors]

## Implementation Guidelines

### Key Approaches and Technologies
- **Service Pattern:** Create CompetitorResolutionService following existing service patterns
- **Validation Strategy:** Use Zod schemas for input validation with clear error messages
- **Database Queries:** Leverage existing Prisma patterns for competitor lookups
- **Error Handling:** Provide user-friendly error messages with suggestions
- **Backward Compatibility:** Ensure existing API behavior remains unchanged when no competitors specified

### Code Organization
```typescript
// New service structure
src/services/competitorResolutionService.ts
├── CompetitorResolutionService class
├── resolveCompetitorInput(input: string[]): Promise<CompetitorResolution>
├── lookupByName(name: string): Promise<Competitor | null>
├── lookupByWebsite(website: string): Promise<Competitor | null>
├── lookupById(id: string): Promise<Competitor | null>
└── validateAndResolve(inputs: string[]): Promise<string[]>

// Updated existing files
src/lib/chat/conversation.ts - Add competitor validation step
src/app/api/projects/route.ts - Accept competitorIds parameter
src/services/projectService.ts - Handle competitor filtering
```

### Database Patterns
- **Existing Relationships:** Utilize current many-to-many Project ↔ Competitor relationship
- **Query Optimization:** Use selective includes to avoid over-fetching
- **Transaction Safety:** Maintain existing transaction patterns for project creation

### Example Implementation Patterns
```typescript
// Competitor resolution example
const resolveCompetitors = async (input: string[]): Promise<string[]> => {
  const resolved: string[] = [];
  for (const item of input) {
    if (item.startsWith('http')) {
      // Website lookup
      const competitor = await lookupByWebsite(item);
      if (competitor) resolved.push(competitor.id);
    } else if (item.match(/^[a-zA-Z0-9]{25}$/)) {
      // ID format
      const competitor = await lookupById(item);
      if (competitor) resolved.push(competitor.id);
    } else {
      // Name lookup
      const competitor = await lookupByName(item);
      if (competitor) resolved.push(competitor.id);
    }
  }
  return resolved;
};
```

## Proposed File Structure
```
src/services/
├── competitorResolutionService.ts          [NEW] - Main resolution service
└── __tests__/
    └── competitorResolutionService.test.ts [NEW] - Unit tests

src/lib/chat/
├── conversation.ts                         [MODIFY] - Add competitor validation

src/app/api/projects/
├── route.ts                                [MODIFY] - Accept competitorIds parameter

src/services/
├── projectService.ts                       [MODIFY] - Handle competitor filtering

docs/api/
├── competitor-input-formats.md             [NEW] - Input format documentation
```

## Edge Cases & Error Handling

### Input Validation Edge Cases
- **Empty Input:** Default to all competitors (maintain current behavior)
- **Mixed Valid/Invalid:** Process valid ones, report invalid with suggestions
- **Duplicate Entries:** De-duplicate automatically
- **Case Sensitivity:** Handle name matching case-insensitively
- **URL Variations:** Handle http/https and www variations
- **Partial Matches:** Provide suggestions for close matches

### Error Scenarios
- **Competitor Not Found:** Clear error with available competitor list
- **Invalid URL Format:** Suggest correct format
- **Database Errors:** Graceful degradation to all competitors
- **Malformed Input:** Helpful parsing error messages

### Logging Strategy
```typescript
logger.info('Competitor resolution started', {
  correlationId,
  inputCount: inputs.length,
  inputs: inputs.slice(0, 5) // Log first 5 for debugging
});

logger.warn('Competitor not found', {
  correlationId,
  input: sanitizedInput,
  suggestions: nearMatches.map(c => c.name)
});
```

## Code Review Guidelines

### Focus Areas for Reviewers
- **Input Validation:** Verify all three input formats (name, URL, ID) work correctly
- **Error Handling:** Ensure user-friendly error messages with actionable suggestions
- **Performance:** Check database query efficiency for competitor lookups
- **Backward Compatibility:** Confirm existing API behavior unchanged
- **Security:** Validate input sanitization and SQL injection prevention
- **Test Coverage:** Ensure comprehensive test coverage for all resolution methods

### Specific Review Points
1. **Service Pattern Adherence:** Follows existing service patterns in codebase
2. **Database Transactions:** Proper transaction usage in project creation
3. **Error Messages:** Clear, actionable error messages for users
4. **Edge Case Handling:** All edge cases properly handled
5. **Documentation:** Code is well-documented with examples

## Acceptance Testing Checklist

### Functional Requirements
- [ ] User can specify competitors by exact name (case-insensitive)
- [ ] User can specify competitors by website URL
- [ ] User can specify competitors by database ID
- [ ] System validates competitor input and provides clear error messages
- [ ] Project is created with only specified competitors assigned
- [ ] Empty competitor list defaults to all competitors (backward compatibility)
- [ ] Mixed valid/invalid input processes valid competitors and reports errors

### Technical Requirements
- [ ] CompetitorResolutionService properly resolves all input formats
- [ ] Chat interface validates point 10 input correctly
- [ ] Project creation uses selected competitors instead of all
- [ ] API endpoint accepts competitorIds parameter
- [ ] Database queries are efficient and properly indexed
- [ ] Error handling provides actionable feedback

### User Experience Requirements
- [ ] Chat flow provides immediate feedback on competitor validation
- [ ] Error messages include suggestions for correction
- [ ] Project creation confirms selected competitors
- [ ] Performance remains acceptable with competitor validation

### Integration Testing
- [ ] End-to-end chat flow works with competitor selection
- [ ] API route works with both legacy and new competitor selection
- [ ] Database relationships maintained correctly
- [ ] Error scenarios handled gracefully
- [ ] Backward compatibility preserved

## Notes / Open Questions

### Implementation Considerations
- **Performance Impact:** Competitor validation adds minimal overhead (single DB query per input)
- **Scalability:** Current approach works well up to ~100 competitors per project
- **Future Enhancements:** Could add fuzzy matching and auto-suggestions in future iterations

### Integration with TP-026
- This feature builds on TP-026's user profile system
- No conflicts expected - competitor assignment is orthogonal to user profiles
- Can leverage user preferences for default competitor lists in future

### Monitoring and Analytics
- Track competitor resolution success rates
- Monitor most commonly used competitor input formats
- Measure performance impact of validation step

### Future Roadmap
- **Phase 2:** Add competitor category/industry filtering
- **Phase 3:** Implement competitor recommendation based on project type
- **Phase 4:** Add bulk competitor management interface 