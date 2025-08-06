# TP-026-20250106-Basic-User-Profiles-Implementation

## Overview
- **Project:** Competitor Research Agent - Basic User Profiles
- **Date:** 2025-01-06
- **RequestID:** TP-026-20250106-basic-user-profiles-implementation
- **Goal:** Implement lightweight email-based user profiles to scope data access without authentication complexity

## Pre-requisites
- **Database Access:** SQLite database with Prisma ORM
- **Current State:** Application with mock authentication removed (per D-012)
- **Development Environment:** Next.js 14+ with TypeScript
- **Git Branch Creation:** `git checkout -b feature/basic-user-profiles-20250106-TP-026`

## Dependencies
- **Database:** Prisma schema modifications and migrations
- **Session Management:** Browser-based storage (localStorage/cookies)
- **UI Framework:** Existing React components and Tailwind CSS
- **Current Mock System:** Existing `getOrCreateMockUser()` infrastructure in API routes
- **Code Owners:** Development team (internal tool, no external dependencies)

## Task Breakdown

- [ ] 1.0 Database Schema Design and Migration
    - [ ] 1.1 Create Profile model in Prisma schema with email uniqueness constraint
    - [ ] 1.2 Add profileId foreign key to User, Project, Competitor tables
    - [ ] 1.3 Generate and test Prisma migration for schema changes
    - [ ] 1.4 Create seed script for default profile and data migration

- [ ] 2.0 Profile Service Layer Implementation
    - [ ] 2.1 Create profile service with CRUD operations and email validation
    - [ ] 2.2 Create profile session management utilities (create, validate, clear)
    - [ ] 2.3 Update existing getOrCreateMockUser to use profile-based lookup
    - [ ] 2.4 Add profile-scoped data filtering utilities for API queries

- [ ] 3.0 API Routes Profile Integration
    - [ ] 3.1 Update projects API routes to filter by profile (GET, POST, DELETE)
    - [ ] 3.2 Update competitors API routes to filter by profile (GET, POST, DELETE)
    - [ ] 3.3 Update reports API routes to filter by profile through project association
    - [ ] 3.4 Add profile creation/validation endpoint for email submission

- [ ] 4.0 Frontend Profile Access System
    - [ ] 4.1 Create ProfileAccessModal component for email entry
    - [ ] 4.2 Create profile context provider for session state management
    - [ ] 4.3 Add profile access gate to main application layout
    - [ ] 4.4 Implement logout button in header with profile session clearing

- [ ] 5.0 Data Migration and Testing
    - [ ] 5.1 Create migration script to associate existing data with default profile
    - [ ] 5.2 Add unit tests for profile service and session management
    - [ ] 5.3 Add integration tests for profile-scoped API endpoints
    - [ ] 5.4 Validate profile isolation across different email sessions

## Implementation Guidelines

### Key Approaches
- **Minimal Complexity:** Leverage existing mock user infrastructure rather than rebuilding
- **Profile-First Design:** All data access goes through profile context
- **Browser Session Management:** Use localStorage with configurable max session duration  
- **Defensive Programming:** Graceful fallback to default profile for any edge cases

### Reference Existing Modules
- **Mock User System:** `src/components/auth/SignInForm.tsx` - existing cookie-based session pattern
- **Database Patterns:** `src/lib/prisma.ts` - existing database connection and query patterns
- **API Route Structure:** `src/app/api/projects/route.ts` - existing getOrCreateMockUser pattern
- **Session Management:** Current cookie-based approach in SignInForm component

### Technical Patterns
```typescript
// Profile Service Pattern
export class ProfileService {
  async getOrCreateProfile(email: string): Promise<Profile>
  async validateSession(profileId: string): Promise<boolean>
}

// Profile-Scoped Query Pattern  
const projects = await prisma.project.findMany({
  where: { profileId: getCurrentProfileId() }
});

// Session Management Pattern
const profileSession = {
  profileId: string,
  email: string,
  createdAt: number,
  expiresAt: number
};
```

## Proposed File Structure

### New Files
```
src/lib/profile/
├── profileService.ts       # Core profile CRUD operations
├── sessionManager.ts       # Browser session management
└── profileUtils.ts         # Profile validation and helpers

src/components/profile/
├── ProfileAccessModal.tsx  # Email entry modal
├── ProfileProvider.tsx     # React context provider
└── LogoutButton.tsx        # Header logout component

src/app/api/profile/
└── route.ts                # Profile creation/validation endpoint

prisma/migrations/
└── [timestamp]_add_profile_system/
    └── migration.sql       # Database schema changes
```

### Modified Files
```
prisma/schema.prisma        # Add Profile model and foreign keys
src/app/layout.tsx          # Add profile access gate
src/components/Navigation.tsx # Add logout button
src/app/api/projects/route.ts # Add profile filtering
src/app/api/competitors/route.ts # Add profile filtering
```

## Edge Cases & Error Handling

### Edge Cases to Consider
1. **Invalid Email Format:** Validate HelloFresh domain requirements
2. **Session Expiration:** Handle expired sessions gracefully with re-prompt
3. **Profile Not Found:** Create profile automatically on first access
4. **Multiple Browser Sessions:** Handle concurrent sessions for same email
5. **Data Migration Failures:** Ensure rollback capability for existing data associations

### Error Handling Strategy
- **Profile Creation Errors:** Log error, show user-friendly message, allow retry
- **Session Validation Errors:** Clear invalid session, prompt for re-entry
- **Database Query Errors:** Fallback to empty results rather than application crash
- **Migration Errors:** Comprehensive rollback scripts and validation checkpoints

## Code Review Guidelines

### Critical Review Points
- **Data Isolation:** Verify all database queries include profile filtering
- **Session Security:** Validate session management prevents cross-profile data access
- **Migration Safety:** Ensure database migrations are reversible and tested
- **UI/UX Consistency:** Confirm minimal visual impact and intuitive flow
- **Error Handling:** Validate graceful handling of all edge cases
- **Performance Impact:** Ensure profile filtering doesn't significantly impact query performance
- **Code Simplicity:** Verify implementation maintains simplicity as requested

### Specific Checks
- All API routes use profile-scoped queries
- Profile session validation is consistent across components
- Database constraints properly enforce profile associations
- UI components handle loading and error states appropriately

## Acceptance Testing Checklist

### Functional Requirements
- [ ] User can enter email and gain access to application
- [ ] User sees only their associated projects, competitors, and reports
- [ ] User can logout and access different profile with different email
- [ ] Profile data isolation verified between different email sessions
- [ ] Existing data properly migrated to default profile
- [ ] New projects/competitors/reports are automatically associated with current profile

### Non-Functional Requirements  
- [ ] Profile access flow completes within 2 seconds
- [ ] Session management works across browser refresh
- [ ] Database queries with profile filtering perform within acceptable limits
- [ ] Application startup time not significantly impacted
- [ ] Profile system handles concurrent users without conflicts

### Integration Requirements
- [ ] All existing API endpoints maintain backward compatibility
- [ ] Profile system integrates seamlessly with existing UI components
- [ ] Database migrations complete successfully without data loss
- [ ] Error scenarios display appropriate user feedback

## Notes / Open Questions

### Implementation Notes
- **Email Validation:** Consider whether to enforce @hellofresh.com domain or allow any email for flexibility
- **Session Duration:** Default to 24-hour sessions but make configurable
- **Profile Naming:** Email address serves as both identifier and display name
- **Default Profile:** Use "system@hellofresh.com" for existing data migration

### Future Considerations
- **Profile Management:** Admin interface to manage profiles (not in scope)
- **Profile Deletion:** Cascade delete behavior for associated data (not in scope)
- **Audit Logging:** Track profile access and data changes (not in scope)
- **Enhanced Session Management:** Server-side session storage (not in scope)

---

**Estimated Effort:** Medium (5-7 days)
**Risk Level:** Low
**Impact:** High - Enables multi-user data segregation for internal tool usage 