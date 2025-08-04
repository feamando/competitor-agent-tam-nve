# Task Plan: Fix Chat Project Creation - AWS Credentials Startup Hang

## Overview
**Project Name:** competitor-research-agent  
**Date:** 2025-08-04  
**RequestID:** TP-019-20250804-chat-project-creation-aws-fix  

**Goal:** Fix the "Failed to fetch" error occurring when users try to create projects via chat, caused by expired AWS credentials that hang the startup process and block project creation.

## Root Cause Analysis

Based on log analysis and code investigation:

1. **Primary Issue:** Chat project creation fails with "Failed to fetch" because the `createProjectWithAllCompetitors` method depends on AWS Bedrock services for initial report generation
2. **AWS Dependency Chain:** Chat → Project Creation → Initial Report Generation → AWS Bedrock → Expired Credentials
3. **Blocking Point:** The `generateInitialReportWithRetry` method initializes services that require valid AWS credentials, causing the entire chat flow to fail
4. **Error Pattern:** ExpiredTokenException with 401 responses from `/api/health/aws` endpoint

## Prerequisites

**Git Branch Creation:**
```bash
git checkout -b feature/chat-project-creation-aws-fix-20250804-TP-019
```

**Required Tools:**
- Next.js development environment
- AWS CLI (for credential validation)
- Database access via Prisma

## Dependencies

**Code Owners:** Based on .claim.json analysis
- Chat system: Frontend/Backend team
- AWS services: Infrastructure team
- Report generation: AI/ML team

**External Dependencies:**
- AWS Bedrock service availability
- Database connectivity
- Environment variable configuration

## Task Breakdown

- [ ] 1.0 Implement Graceful AWS Failure Handling in Chat Flow
    - [ ] 1.1 Add AWS credential validation check before report generation
    - [ ] 1.2 Implement fallback project creation without initial report when AWS fails
    - [ ] 1.3 Add proper error boundaries for AWS service failures

- [ ] 2.0 Enhance Error Handling in Project Creation Pipeline
    - [ ] 2.1 Modify `generateInitialReportWithRetry` to handle AWS credential failures gracefully
    - [ ] 2.2 Update `validateProjectCreationPrerequisites` to check AWS status
    - [ ] 2.3 Add retry logic with exponential backoff for AWS service initialization

- [ ] 3.0 Implement Chat-Specific Error Recovery
    - [ ] 3.1 Add AWS status check in chat API route (`/api/chat`)
    - [ ] 3.2 Provide meaningful error messages to users when AWS is unavailable
    - [ ] 3.3 Allow project creation to proceed without AI-generated reports when AWS fails

- [ ] 4.0 Add Configuration Options
    - [ ] 4.1 Add environment variable to disable AWS-dependent features in development
    - [ ] 4.2 Implement feature flags for optional report generation
    - [ ] 4.3 Add configuration to skip AWS validation for basic project creation

- [ ] 5.0 Improve AWS Credential Management
    - [ ] 5.1 Add credential refresh mechanism for expired tokens
    - [ ] 5.2 Implement credential validation caching to avoid repeated failures
    - [ ] 5.3 Add health check endpoint specifically for chat dependencies

- [ ] 6.0 Update Frontend Error Handling
    - [ ] 6.1 Enhance `useChat` hook to handle AWS-related failures gracefully
    - [ ] 6.2 Add user-friendly error messages for AWS credential issues
    - [ ] 6.3 Implement retry mechanism in chat UI for transient AWS failures

## Implementation Guidelines

### Key Approaches
1. **Graceful Degradation:** Allow core project creation to work even when AWS services are unavailable
2. **Fail-Fast Pattern:** Validate AWS credentials early in the chat flow to provide immediate feedback
3. **Circuit Breaker Pattern:** Implement circuit breaker for AWS services to prevent cascading failures

### Reference Files
- `src/lib/chat/conversation.ts` (lines 2570-2620, 2942-3000)
- `src/services/aws/awsCredentialsService.ts`
- `src/app/api/chat/route.ts`
- `src/hooks/useChat.ts`

### Implementation Examples
```typescript
// Example: Graceful AWS failure handling
try {
  const reportResult = await this.generateInitialReportWithRetry(/* params */);
} catch (awsError) {
  if (awsError.name === 'ExpiredTokenException') {
    logger.warn('AWS credentials expired, proceeding without initial report');
    return { projectCreated: true, reportGenerated: false, reason: 'AWS_UNAVAILABLE' };
  }
  throw awsError;
}
```

### Performance Considerations
- Implement timeout mechanisms for AWS service calls
- Add caching for credential validation status
- Use connection pooling for database operations

## Proposed File Structure

**New Files:**
- `src/lib/aws/gracefulFailureHandler.ts`
- `src/lib/chat/awsStatusChecker.ts`
- `src/constants/featureFlags.ts`

**Modified Files:**
- `src/lib/chat/conversation.ts` (Add AWS failure handling)
- `src/app/api/chat/route.ts` (Add error boundary)
- `src/hooks/useChat.ts` (Improve error handling)
- `src/services/aws/awsCredentialsService.ts` (Add refresh mechanism)

## Edge Cases & Error Handling

**Edge Cases:**
1. AWS credentials expire during project creation process
2. Network connectivity issues to AWS services
3. Partial AWS service availability (some services work, others don't)
4. Database connectivity issues during credential validation

**Error Handling Strategies:**
- Implement exponential backoff for AWS service retries
- Provide clear error messages distinguishing between AWS and application issues
- Log detailed error context for debugging
- Implement health checks for all critical dependencies

## Code Review Guidelines

**Focus Areas:**
1. Verify that project creation can proceed without AWS when configured to do so
2. Ensure error messages are user-friendly and actionable
3. Check that AWS credential refresh logic doesn't introduce security vulnerabilities
4. Validate that timeouts are appropriate and don't cause user experience issues
5. Review logging levels to ensure sensitive credential information isn't exposed

## Acceptance Testing Checklist

**Functional Checks:**
- [ ] Chat project creation works when AWS credentials are valid
- [ ] Chat project creation gracefully degrades when AWS credentials are expired
- [ ] Users receive clear error messages when AWS services are unavailable
- [ ] Project creation proceeds without initial report generation when AWS fails
- [ ] AWS credential refresh mechanism works correctly
- [ ] Health check endpoints accurately reflect AWS service status

**Non-functional Checks:**
- [ ] Chat response time remains under 3 seconds even when AWS is slow
- [ ] No memory leaks in AWS service initialization
- [ ] Error handling doesn't expose sensitive credential information
- [ ] Logging provides sufficient detail for debugging AWS issues

## Notes / Open Questions

1. **AWS Cost Considerations:** Should we implement request throttling to prevent excessive AWS API calls during credential validation?
2. **User Experience:** How should we communicate to users that some features are unavailable due to AWS issues?
3. **Monitoring:** What alerts should we set up to detect when AWS credential expiration affects user experience?
4. **Testing:** Should we create mock AWS services for comprehensive testing of failure scenarios?

## Risk Assessment

**High Risk:**
- Changes to core project creation flow could introduce regressions
- AWS credential refresh mechanism could create security vulnerabilities

**Medium Risk:**
- Error handling changes might not cover all failure scenarios
- Performance impact of additional validation checks

**Low Risk:**
- Frontend error message improvements
- Configuration additions

## Success Metrics

- Chat project creation success rate increases to >95%
- Time to failure detection for AWS issues reduces to <30 seconds
- User error reports related to "Failed to fetch" decrease by >80%
- Average chat response time remains under 3 seconds 