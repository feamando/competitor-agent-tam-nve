# Project Report Association API Documentation

## Overview

The `/api/reports/generate` endpoint has been enhanced with automatic project resolution capabilities, graceful fallback mechanisms, and comprehensive error handling to address the "projectId: unknown" issue and improve user experience.

**Last Updated:** 2025-08-01  
**Version:** Enhanced with Tasks 2.1-2.5 from TP-013  
**Related:** Project Report Association Fix Implementation

---

## Endpoint Details

### `POST /api/reports/generate`

Generates competitive analysis reports with automatic project association resolution.

**URL:** `/api/reports/generate?competitorId={id}&timeframe={days}`

---

## Request Format

### Query Parameters (Required)

| Parameter | Type | Description | Validation | Example |
|-----------|------|-------------|------------|---------|
| `competitorId` | string | Unique identifier for the competitor | Required, 1-100 chars, alphanumeric + hyphens/underscores | `cmdohri7p000dl807i3hjpphj` |
| `timeframe` | integer | Number of days for analysis period | Required, 1-365 days | `30` |

### Request Body (Optional)

```json
{
  "projectId": "string",           // Optional - for explicit project specification
  "reportName": "string",          // Optional - custom report name
  "reportOptions": "string",       // Optional - report generation options
  "changeLog": "string"           // Optional - changelog information
}
```

### Request Examples

#### Basic Request (Automatic Project Resolution)
```bash
curl -X POST "http://localhost:3000/api/reports/generate?competitorId=cmdohri7p000dl807i3hjpphj&timeframe=30"
```

#### Request with Explicit Project ID
```bash
curl -X POST "http://localhost:3000/api/reports/generate?competitorId=cmdohri7p000dl807i3hjpphj&timeframe=30" \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "cmdsn7gq7000pl8pffobxc1gu",
    "reportName": "Custom Report Name",
    "reportOptions": "detailed"
  }'
```

---

## Response Formats

### Success Response (200 OK)

```json
{
  "success": true,
  "data": {
    "title": "Competitive Analysis Report: Competitor Name - Date Range",
    "description": "Analysis description",
    "sections": [
      {
        "title": "Executive Summary",
        "content": "Summary content",
        "type": "summary",
        "order": 1
      }
    ],
    "metadata": {
      "competitor": {
        "name": "Competitor Name",
        "url": "https://competitor.com"
      },
      "dateRange": {
        "start": "2025-07-02T10:00:00.000Z",
        "end": "2025-08-01T10:00:00.000Z"
      },
      "analysisCount": 29,
      "significantChanges": 0
    }
  },
  "correlationId": "1754045518845-5y91uo6ns",
  "timestamp": "2025-08-01T10:51:59.065Z"
}
```

---

## Enhanced Error Handling

### Validation Errors (400 Bad Request)

#### Missing Competitor ID
```json
{
  "message": "Competitor ID is required for report generation.",
  "error": {
    "type": "VALIDATION_ERROR",
    "details": "competitorId parameter is missing or empty",
    "guidance": {
      "instruction": "Provide a valid competitor ID in the URL query parameter",
      "example": {
        "correctUrl": "/api/reports/generate?competitorId=YOUR_COMPETITOR_ID&timeframe=30"
      }
    }
  },
  "code": "EDGE_CASE_MISSING_COMPETITOR_ID",
  "retryable": false,
  "correlationId": "correlation-id"
}
```

#### Invalid Competitor ID Format
```json
{
  "message": "Invalid competitor ID format.",
  "error": {
    "type": "VALIDATION_ERROR",
    "details": "Competitor ID contains invalid characters",
    "guidance": {
      "instruction": "Competitor ID should contain only letters, numbers, hyphens, and underscores",
      "providedValue": "invalid@competitor",
      "expectedFormat": "alphanumeric with hyphens and underscores"
    }
  },
  "code": "EDGE_CASE_INVALID_COMPETITOR_FORMAT",
  "retryable": false,
  "correlationId": "correlation-id",
  "competitorId": "invalid@competitor"
}
```

#### Invalid Timeframe
```json
{
  "message": "Invalid timeframe specified for report generation.",
  "error": {
    "type": "VALIDATION_ERROR",
    "details": "Timeframe value '1000' is outside the valid range",
    "guidance": {
      "instruction": "Timeframe must be a number between 1 and 365 days",
      "validRange": { "min": 1, "max": 365 },
      "providedValue": 1000,
      "examples": [
        "timeframe=7 (for 7 days)",
        "timeframe=30 (for 30 days)",
        "timeframe=90 (for 90 days)"
      ]
    }
  },
  "code": "EDGE_CASE_INVALID_TIMEFRAME",
  "retryable": false,
  "correlationId": "correlation-id"
}
```

### Not Found Errors (404 Not Found)

#### Competitor Not Found
```json
{
  "message": "Competitor not found in database.",
  "error": {
    "type": "NOT_FOUND_ERROR",
    "details": "No competitor with ID 'non-existent-competitor' exists in the database",
    "guidance": {
      "instruction": "Verify the competitor ID is correct",
      "troubleshooting": [
        "Check if the competitor ID was typed correctly",
        "Verify the competitor exists in your dashboard",
        "Contact support if you believe this is an error"
      ],
      "suggestedActions": [
        "List available competitors via /api/competitors",
        "Create the competitor if it should exist"
      ]
    }
  },
  "code": "EDGE_CASE_COMPETITOR_NOT_FOUND",
  "retryable": false,
  "correlationId": "correlation-id",
  "competitorId": "non-existent-competitor"
}
```

### Graceful Fallback Responses (422 Unprocessable Entity)

#### Multiple Projects Found
```json
{
  "message": "Automatic project resolution found multiple options. Please select one explicitly.",
  "fallback": {
    "reason": "MULTIPLE_PROJECTS_FOUND",
    "guidance": {
      "instruction": "Add projectId to your request body to specify which project to use",
      "example": {
        "method": "POST",
        "url": "/api/reports/generate?competitorId=competitor-id&timeframe=30",
        "body": {
          "projectId": "YOUR_CHOSEN_PROJECT_ID",
          "reportName": "Optional report name",
          "reportOptions": "default"
        }
      }
    },
    "availableProjects": [
      {
        "id": "project-id-1",
        "name": "Project Name 1",
        "status": "ACTIVE",
        "recommended": "Active project"
      },
      {
        "id": "project-id-2",
        "name": "Project Name 2", 
        "status": "DRAFT",
        "recommended": "Active project"
      }
    ]
  },
  "code": "GRACEFUL_FALLBACK_MANUAL_SELECTION",
  "retryable": true,
  "correlationId": "correlation-id",
  "competitorId": "competitor-id"
}
```

#### No Projects Found
```json
{
  "message": "No projects found associated with this competitor. Manual project specification required.",
  "fallback": {
    "reason": "NO_PROJECTS_FOUND",
    "guidance": {
      "instruction": "Create a project first, or specify an existing projectId if this competitor should belong to an existing project",
      "steps": [
        "1. Create a new project that includes this competitor, OR",
        "2. Add this competitor to an existing project, OR",
        "3. Specify a projectId explicitly in the request body if you know which project should contain this competitor"
      ],
      "example": {
        "method": "POST",
        "url": "/api/reports/generate?competitorId=competitor-id&timeframe=30",
        "body": {
          "projectId": "YOUR_EXISTING_PROJECT_ID",
          "reportName": "Optional report name",
          "reportOptions": "default"
        }
      }
    },
    "debugInfo": {
      "competitorId": "competitor-id",
      "searchPerformed": "Projects containing this competitor",
      "originalError": "No associated projects found"
    }
  },
  "code": "GRACEFUL_FALLBACK_NO_PROJECTS",
  "retryable": true,
  "correlationId": "correlation-id",
  "competitorId": "competitor-id"
}
```

#### Inactive Projects Only
```json
{
  "message": "Competitor belongs to inactive projects only. Manual project specification required.",
  "fallback": {
    "reason": "INACTIVE_PROJECTS_ONLY",
    "guidance": {
      "instruction": "This competitor belongs to projects that are currently inactive. You can either activate a project or specify a projectId explicitly.",
      "options": [
        "1. Activate one of the existing projects, OR",
        "2. Create a new active project for this competitor, OR",
        "3. Specify an inactive projectId explicitly if you want to generate a report anyway"
      ],
      "inactiveProjects": [
        {
          "id": "inactive-project-id",
          "name": "Inactive Project Name",
          "status": "ARCHIVED"
        }
      ],
      "example": {
        "method": "POST",
        "url": "/api/reports/generate?competitorId=competitor-id&timeframe=30",
        "body": {
          "projectId": "INACTIVE_PROJECT_ID_IF_INTENDED",
          "reportName": "Optional report name",
          "reportOptions": "default"
        }
      }
    },
    "debugInfo": {
      "competitorId": "competitor-id",
      "totalProjectsFound": 2,
      "allProjectsInactive": true
    }
  },
  "code": "EDGE_CASE_INACTIVE_PROJECTS_ONLY",
  "retryable": true,
  "correlationId": "correlation-id",
  "competitorId": "competitor-id"
}
```

### Service Errors (503 Service Unavailable)

#### Database Unavailable
```json
{
  "message": "Database service temporarily unavailable.",
  "error": {
    "type": "SERVICE_ERROR",
    "details": "Cannot connect to database for report generation",
    "guidance": {
      "instruction": "Please try again in a few moments",
      "retryRecommendation": "exponential backoff",
      "expectedRecoveryTime": "1-5 minutes"
    }
  },
  "code": "EDGE_CASE_DATABASE_UNAVAILABLE",
  "retryable": true,
  "correlationId": "correlation-id",
  "competitorId": "competitor-id"
}
```

#### Project Discovery Service Error
```json
{
  "message": "Project discovery service temporarily unavailable. Please specify projectId manually.",
  "fallback": {
    "reason": "SERVICE_EXCEPTION",
    "guidance": {
      "instruction": "The automatic project resolution service is experiencing issues. Please provide projectId explicitly.",
      "steps": [
        "1. Check which project this competitor belongs to in your dashboard",
        "2. Add the projectId to your request body",
        "3. Retry the request with explicit projectId"
      ],
      "example": {
        "method": "POST",
        "url": "/api/reports/generate?competitorId=competitor-id&timeframe=30",
        "body": {
          "projectId": "YOUR_PROJECT_ID",
          "reportName": "Optional report name",
          "reportOptions": "default"
        }
      }
    },
    "debugInfo": {
      "competitorId": "competitor-id",
      "serviceError": "Service connection timeout",
      "timestamp": "2025-08-01T10:51:59.065Z",
      "retryRecommendation": "Try again in a few minutes, or use manual projectId specification"
    }
  },
  "code": "GRACEFUL_FALLBACK_SERVICE_ERROR",
  "retryable": true,
  "correlationId": "correlation-id",
  "competitorId": "competitor-id"
}
```

---

## Automatic Project Resolution

### How It Works

1. **Explicit Project ID:** If `projectId` is provided in the request body, it's used directly
2. **Automatic Resolution:** If no `projectId` is provided, the system automatically:
   - Finds all projects associated with the competitor
   - Applies priority rules to select the best project:
     - **Active projects** preferred over inactive
     - **Higher priority** projects preferred
     - **Newest projects** as tie-breaker
3. **Graceful Fallback:** If automatic resolution fails, detailed guidance is provided

### Priority Rules

The automatic resolution uses the following priority order:

1. **Active First:** Active projects (ACTIVE, DRAFT) are preferred over inactive (ARCHIVED, PAUSED)
2. **By Priority:** Projects with higher priority levels (URGENT > HIGH > MEDIUM > LOW)
3. **By Date:** Newer projects are preferred as tie-breakers

### Resolution Flow

```
Request without projectId
    ↓
Database connectivity check
    ↓
Competitor existence validation
    ↓
Find associated projects
    ↓
Apply priority rules
    ↓
Single project found → Use automatically
Multiple projects found → Request explicit selection
No projects found → Provide creation guidance
Service error → Fallback to manual specification
```

---

## Enhanced Features

### Task 2.1: Project Discovery Integration
- Automatic project ID resolution from competitor ID
- Caching for improved performance
- Multi-project handling with priority rules

### Task 2.2: Pre-Generation Validation
- Automatic resolution before report generation starts
- Enhanced logging and correlation tracking
- Success/failure metrics

### Task 2.3: Graceful Fallback System
- User-friendly error messages with actionable guidance
- Step-by-step resolution instructions  
- Concrete API examples in error responses

### Task 2.4: Comprehensive Edge Case Handling
- Input validation (format, length, range)
- Database connectivity verification
- Competitor existence validation
- Service availability checks

### Task 2.5: Enhanced Documentation
- Complete request/response schemas
- All error scenarios documented
- Real-world examples and troubleshooting guides

---

## Error Code Reference

| Code | HTTP Status | Description | Retryable |
|------|-------------|-------------|-----------|
| `EDGE_CASE_MISSING_COMPETITOR_ID` | 400 | Competitor ID parameter missing | No |
| `EDGE_CASE_INVALID_COMPETITOR_FORMAT` | 400 | Invalid competitor ID format | No |
| `EDGE_CASE_COMPETITOR_ID_TOO_LONG` | 400 | Competitor ID exceeds length limit | No |
| `EDGE_CASE_INVALID_TIMEFRAME` | 400 | Timeframe outside valid range | No |
| `EDGE_CASE_COMPETITOR_NOT_FOUND` | 404 | Competitor doesn't exist | No |
| `EDGE_CASE_DATABASE_UNAVAILABLE` | 503 | Database connection failed | Yes |
| `EDGE_CASE_COMPETITOR_CHECK_FAILED` | 503 | Competitor validation failed | Yes |
| `GRACEFUL_FALLBACK_MANUAL_SELECTION` | 422 | Multiple projects need selection | Yes |
| `GRACEFUL_FALLBACK_NO_PROJECTS` | 422 | No projects found for competitor | Yes |
| `EDGE_CASE_INACTIVE_PROJECTS_ONLY` | 422 | Only inactive projects found | Yes |
| `GRACEFUL_FALLBACK_SERVICE_ERROR` | 503 | Project discovery service error | Yes |
| `GRACEFUL_FALLBACK_FINAL_VALIDATION` | 422 | Final validation failed | Yes |

---

## Integration Guidelines

### Client Implementation

1. **Basic Usage:** Start with simple requests without projectId for automatic resolution
2. **Error Handling:** Implement proper error handling for all response codes
3. **Retry Logic:** Use exponential backoff for retryable errors (5xx status codes)
4. **User Guidance:** Display error guidance to help users resolve issues independently

### Example Error Handling (JavaScript)

```javascript
async function generateReport(competitorId, timeframe, options = {}) {
  try {
    const response = await fetch(`/api/reports/generate?competitorId=${competitorId}&timeframe=${timeframe}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options)
    });

    const data = await response.json();

    if (response.ok) {
      return { success: true, data: data.data };
    }

    // Handle specific error cases
    switch (data.code) {
      case 'GRACEFUL_FALLBACK_MANUAL_SELECTION':
        // Show project selection UI
        return { 
          success: false, 
          requiresProjectSelection: true,
          availableProjects: data.fallback.availableProjects 
        };

      case 'GRACEFUL_FALLBACK_NO_PROJECTS':
        // Show project creation guidance
        return { 
          success: false, 
          requiresProjectCreation: true,
          guidance: data.fallback.guidance 
        };

      case 'EDGE_CASE_COMPETITOR_NOT_FOUND':
        // Show competitor validation error
        return { 
          success: false, 
          invalidCompetitor: true,
          message: data.message 
        };

      default:
        // Handle other errors
        if (data.retryable) {
          // Implement retry logic for retryable errors
          return { success: false, retryable: true, error: data };
        } else {
          return { success: false, error: data };
        }
    }
  } catch (error) {
    return { success: false, networkError: true, error };
  }
}
```

---

## Performance Considerations

- **Caching:** Project discovery results are cached for 5 minutes
- **Database Optimization:** Queries use proper indexes for fast lookups
- **Connection Pooling:** Database connections are pooled for concurrent requests
- **Response Time:** Target response time under 250ms including project lookup

---

## Monitoring and Observability

### Key Metrics

- **Automatic Resolution Success Rate:** Percentage of requests resolved automatically
- **Edge Case Frequency:** Which edge cases occur most often
- **Response Times:** Including project discovery overhead
- **Database Health:** Connection success rates and query performance

### Correlation Tracking

All requests include correlation IDs for end-to-end tracking:
- `automatic_project_resolution_started`
- `automatic_project_resolution_success`
- `graceful_fallback_*` events
- `edge_case_*` tracking

---

## Changelog

### 2025-08-01 - TP-013 Implementation
- **Added:** Automatic project ID resolution (Task 2.1)
- **Added:** Pre-generation validation (Task 2.2)
- **Added:** Graceful fallback system (Task 2.3)
- **Added:** Comprehensive edge case handling (Task 2.4)
- **Updated:** Complete API documentation (Task 2.5)
- **Fixed:** "projectId: unknown" issue causing orphaned reports
- **Enhanced:** Error responses with actionable guidance
- **Improved:** User experience with detailed troubleshooting steps 