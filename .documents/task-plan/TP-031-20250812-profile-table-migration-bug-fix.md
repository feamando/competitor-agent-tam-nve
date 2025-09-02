# TP-031-20250812-profile-table-migration-bug-fix

## Overview

**Task Goal**: Fix missing Profile table in database causing profile creation failures
**Project Name**: Competitor Research Agent  
**Date**: 2025-08-12
**RequestID**: 031

**Problem**: User cannot create profiles because the Profile table doesn't exist in the database, despite being defined in the Prisma schema. This creates a critical schema drift issue blocking all profile-dependent functionality.

## Pre-requisites

- Current working directory: `/Users/nikita.gorshkov/competitor-research-agent`
- Prisma CLI installed and functional
- SQLite database accessible at `prisma/competitor_research.db`
- Next.js development server can be stopped/restarted

**Git Branch Creation**: 
```bash
git checkout -b feature/profile-table-migration-fix-20250812-031
```

## Dependencies

- **Database**: SQLite database must be accessible
- **Prisma Schema**: Current schema.prisma contains Profile model definition
- **Related Tables**: User, Project, Competitor tables exist and have foreign key relationships to Profile
- **Code Dependencies**: ProfileService, API routes, UI components depend on Profile table

## Task Breakdown

- [ ] 1.0 Database Schema Analysis and Verification
    - [ ] 1.1 Verify Profile model definition in prisma/schema.prisma is complete
    - [ ] 1.2 Confirm Profile table is missing from database using `.tables` command
    - [ ] 1.3 Check existing migration files to confirm Profile table creation was never included

- [ ] 2.0 Migration Generation and Application
    - [ ] 2.1 Generate new Prisma migration for Profile table using `npx prisma migrate dev --name add-profile-table`
    - [ ] 2.2 Review generated migration SQL to ensure Profile table and indexes are correctly defined
    - [ ] 2.3 Apply migration to database and verify success

- [ ] 3.0 Database Verification
    - [ ] 3.1 Verify Profile table exists using `sqlite3 prisma/competitor_research.db ".tables"`
    - [ ] 3.2 Check Profile table schema using `sqlite3 prisma/competitor_research.db ".schema Profile"`
    - [ ] 3.3 Verify all foreign key relationships are properly created

- [ ] 4.0 Prisma Client Regeneration  
    - [ ] 4.1 Generate updated Prisma client using `npx prisma generate`
    - [ ] 4.2 Restart Next.js development server to load updated client
    - [ ] 4.3 Verify Prisma client recognizes Profile model

- [ ] 5.0 Functionality Testing
    - [ ] 5.1 Test profile creation API endpoint with test email
    - [ ] 5.2 Verify profile creation through UI with user email `nikita.gorshklov@hellofresh.com`
    - [ ] 5.3 Check database to confirm profile record was created
    - [ ] 5.4 Test profile retrieval and session management

## Implementation Guidelines

### Migration Creation Approach
- Use Prisma's `migrate dev` command to generate proper migration
- Review generated SQL before applying to ensure completeness
- Include all indexes and constraints defined in schema

### Database Operations
- Use SQLite CLI commands for verification steps
- Check both table structure and data after operations
- Maintain referential integrity during migration

### Error Handling Considerations
- Monitor application logs during restart for any remaining issues
- Verify no other schema drift issues exist
- Ensure foreign key constraints don't cause cascade issues

### Code Integration
- No code changes required - fix is purely database schema
- Existing ProfileService and API routes should work after table creation
- UI components should function normally once backend is fixed

## Proposed File Structure

**New Migration File**: `prisma/migrations/[timestamp]_add_profile_table/migration.sql`

**Modified Files**: None (database-only fix)

**Verification Files**: Use existing test files and API endpoints

## Edge Cases & Error Handling

### Potential Issues
- **Migration conflicts**: If multiple developers have different schema states
- **Foreign key constraint errors**: If relationships to Profile table already exist
- **Prisma client cache**: Old client may need clearing

### Error Handling Strategy
- Verify migration applies cleanly before proceeding
- Check for any constraint violations during application
- Monitor application logs for any remaining database errors
- Have rollback plan ready if migration fails

### Rollback Procedure
If migration fails:
1. Run `npx prisma migrate reset --force` to return to previous state
2. Review schema.prisma for any syntax errors
3. Manually create table if migration generation fails

## Code Review Guidelines

### Database Review Points
- [ ] Verify migration SQL creates all required columns
- [ ] Confirm all indexes from schema are included
- [ ] Check foreign key constraints are properly defined
- [ ] Ensure migration is idempotent

### Testing Review Points  
- [ ] Profile creation works through API
- [ ] Profile creation works through UI
- [ ] Database constraints are enforced
- [ ] No remaining schema drift issues

## Acceptance Testing Checklist

### Functional Tests
- [ ] Profile API endpoint responds successfully to POST requests
- [ ] Profile table exists in database with correct schema
- [ ] Profile creation works with email `nikita.gorshklov@hellofresh.com`
- [ ] Profile data persists correctly in database
- [ ] Profile retrieval works for existing profiles
- [ ] Session management functions with profile system

### Technical Tests
- [ ] Migration applies without errors
- [ ] Prisma client generates without warnings
- [ ] Application starts without database errors
- [ ] Foreign key relationships work correctly
- [ ] Database indexes are created and functional

### User Experience Tests
- [ ] Profile access modal works correctly
- [ ] User can enter email and access workspace
- [ ] No error messages or loading states persist
- [ ] Navigation and features work after profile creation

## Notes / Open Questions

### Verification Notes
- Monitor application logs during testing to catch any subtle issues
- Verify performance is not impacted by new table/indexes
- Check that all profile-dependent features work correctly

### Future Considerations
- Consider adding database migration tests to prevent schema drift
- Document migration process for future schema changes
- Monitor for any data consistency issues post-fix

### Success Criteria
- Profile table exists in database matching schema definition
- User `nikita.gorshklov@hellofresh.com` can successfully create profile
- All profile-dependent functionality works normally
- No database errors in application logs
