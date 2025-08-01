import { NextRequest, NextResponse } from 'next/server';
import { ReportGenerator } from '@/lib/reports';
import { handleAPIError } from '@/lib/utils/errorHandler';
import { 
  logger, 
  generateCorrelationId, 
  createCorrelationLogger,
  trackReportFlow,
  trackCorrelation 
} from '@/lib/logger';
import { ProjectDiscoveryService } from '@/services/projectDiscoveryService';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  // Generate correlation ID for end-to-end tracking
  const correlationId = generateCorrelationId();
  const correlatedLogger = createCorrelationLogger(correlationId);
  
  const context = {
    endpoint: '/api/reports/generate',
    method: 'POST',
    correlationId
  };

  try {
    trackCorrelation(correlationId, 'report_generation_request_received', context);
    logger.info('Report generation request received', context);

    const { searchParams } = new URL(request.url);
    const competitorId = searchParams.get('competitorId');
    const timeframe = parseInt(searchParams.get('timeframe') || '30', 10);

    // Task 2.4: Comprehensive edge case handling and input validation
    if (!competitorId || competitorId.trim() === '') {
      trackCorrelation(correlationId, 'edge_case_missing_competitor_id', {
        ...context,
        edgeCase: 'missing_competitor_id',
        task: 'Task 2.4'
      });
      logger.warn('Task 2.4: Edge case - Missing competitor ID in request', {
        ...context,
        edgeCase: 'missing_competitor_id'
      });
      
      return NextResponse.json(
        { 
          message: 'Competitor ID is required for report generation.',
          error: {
            type: 'VALIDATION_ERROR',
            details: 'competitorId parameter is missing or empty',
            guidance: {
              instruction: 'Provide a valid competitor ID in the URL query parameter',
              example: {
                correctUrl: '/api/reports/generate?competitorId=YOUR_COMPETITOR_ID&timeframe=30'
              }
            }
          },
          code: 'EDGE_CASE_MISSING_COMPETITOR_ID',
          retryable: false,
          correlationId 
        },
        { status: 400 }
      );
    }

    // Task 2.4: Edge case - Competitor ID format validation
    const competitorIdPattern = /^[a-zA-Z0-9_-]+$/;
    if (!competitorIdPattern.test(competitorId)) {
      trackCorrelation(correlationId, 'edge_case_invalid_competitor_id_format', {
        ...context,
        competitorId,
        edgeCase: 'invalid_competitor_id_format',
        task: 'Task 2.4'
      });
      logger.warn('Task 2.4: Edge case - Invalid competitor ID format', {
        ...context,
        competitorId,
        edgeCase: 'invalid_competitor_id_format'
      });
      
      return NextResponse.json(
        { 
          message: 'Invalid competitor ID format.',
          error: {
            type: 'VALIDATION_ERROR',
            details: 'Competitor ID contains invalid characters',
            guidance: {
              instruction: 'Competitor ID should contain only letters, numbers, hyphens, and underscores',
              providedValue: competitorId,
              expectedFormat: 'alphanumeric with hyphens and underscores'
            }
          },
          code: 'EDGE_CASE_INVALID_COMPETITOR_FORMAT',
          retryable: false,
          correlationId,
          competitorId
        },
        { status: 400 }
      );
    }

    // Task 2.4: Edge case - Competitor ID length validation  
    if (competitorId.length > 100) {
      trackCorrelation(correlationId, 'edge_case_competitor_id_too_long', {
        ...context,
        competitorId: competitorId.substring(0, 50) + '...',
        actualLength: competitorId.length,
        edgeCase: 'competitor_id_too_long',
        task: 'Task 2.4'
      });
      logger.warn('Task 2.4: Edge case - Competitor ID too long', {
        ...context,
        competitorIdLength: competitorId.length,
        edgeCase: 'competitor_id_too_long'
      });
      
      return NextResponse.json(
        { 
          message: 'Competitor ID is too long.',
          error: {
            type: 'VALIDATION_ERROR',
            details: `Competitor ID length (${competitorId.length}) exceeds maximum allowed (100)`,
            guidance: {
              instruction: 'Use a shorter competitor ID',
              maxLength: 100,
              providedLength: competitorId.length
            }
          },
          code: 'EDGE_CASE_COMPETITOR_ID_TOO_LONG',
          retryable: false,
          correlationId,
          competitorId: competitorId.substring(0, 50) + '...'
        },
        { status: 400 }
      );
    }

    // Task 2.4: Edge case - Timeframe validation enhancement
    if (isNaN(timeframe) || timeframe <= 0 || timeframe > 365) {
      trackCorrelation(correlationId, 'edge_case_invalid_timeframe', { 
        ...context, 
        timeframe,
        edgeCase: 'invalid_timeframe',
        task: 'Task 2.4'
      });
      logger.warn('Task 2.4: Edge case - Invalid timeframe in request', { 
        ...context, 
        timeframe,
        edgeCase: 'invalid_timeframe'
      });
      
      return NextResponse.json(
        { 
          message: 'Invalid timeframe specified for report generation.',
          error: {
            type: 'VALIDATION_ERROR',
            details: `Timeframe value '${timeframe}' is outside the valid range`,
            guidance: {
              instruction: 'Timeframe must be a number between 1 and 365 days',
              validRange: { min: 1, max: 365 },
              providedValue: timeframe,
              examples: [
                'timeframe=7 (for 7 days)',
                'timeframe=30 (for 30 days)', 
                'timeframe=90 (for 90 days)'
              ]
            }
          },
          code: 'EDGE_CASE_INVALID_TIMEFRAME',
          retryable: false,
          correlationId
        },
        { status: 400 }
      );
    }

    trackCorrelation(correlationId, 'input_validation_passed', { 
      ...context, 
      competitorId, 
      timeframe 
    });

    // Task 2.4: Edge case - Database connectivity validation
    try {
      await prisma.$queryRaw`SELECT 1`;
      trackCorrelation(correlationId, 'database_connectivity_verified', {
        ...context,
        task: 'Task 2.4'
      });
    } catch (dbError) {
      trackCorrelation(correlationId, 'edge_case_database_unavailable', {
        ...context,
        edgeCase: 'database_unavailable',
        error: dbError instanceof Error ? dbError.message : 'Unknown database error',
        task: 'Task 2.4'
      });
      logger.error('Task 2.4: Edge case - Database connectivity failed', dbError as Error, {
        ...context,
        edgeCase: 'database_unavailable'
      });

      return NextResponse.json(
        { 
          message: 'Database service temporarily unavailable.',
          error: {
            type: 'SERVICE_ERROR',
            details: 'Cannot connect to database for report generation',
            guidance: {
              instruction: 'Please try again in a few moments',
              retryRecommendation: 'exponential backoff',
              expectedRecoveryTime: '1-5 minutes'
            }
          },
          code: 'EDGE_CASE_DATABASE_UNAVAILABLE',
          retryable: true,
          correlationId,
          competitorId
        },
        { status: 503 } // 503 Service Unavailable
      );
    }

    // Task 2.4: Edge case - Competitor existence validation
    let competitorExists = false;
    try {
      const competitor = await prisma.competitor.findUnique({
        where: { id: competitorId },
        select: { id: true, name: true }
      });
      
      competitorExists = !!competitor;
      
      if (!competitor) {
        trackCorrelation(correlationId, 'edge_case_competitor_not_found', {
          ...context,
          competitorId,
          edgeCase: 'competitor_not_found',
          task: 'Task 2.4'
        });
        logger.warn('Task 2.4: Edge case - Competitor not found in database', {
          ...context,
          competitorId,
          edgeCase: 'competitor_not_found'
        });

        return NextResponse.json(
          { 
            message: 'Competitor not found in database.',
            error: {
              type: 'NOT_FOUND_ERROR',
              details: `No competitor with ID '${competitorId}' exists in the database`,
              guidance: {
                instruction: 'Verify the competitor ID is correct',
                troubleshooting: [
                  'Check if the competitor ID was typed correctly',
                  'Verify the competitor exists in your dashboard',
                  'Contact support if you believe this is an error'
                ],
                suggestedActions: [
                  'List available competitors via /api/competitors',
                  'Create the competitor if it should exist'
                ]
              }
            },
            code: 'EDGE_CASE_COMPETITOR_NOT_FOUND',
            retryable: false,
            correlationId,
            competitorId
          },
          { status: 404 } // 404 Not Found
        );
      }

      trackCorrelation(correlationId, 'competitor_existence_verified', {
        ...context,
        competitorId,
        competitorName: competitor.name,
        task: 'Task 2.4'
      });
      logger.debug('Task 2.4: Competitor existence verified', {
        ...context,
        competitorId,
        competitorName: competitor.name
      });

    } catch (competitorCheckError) {
      trackCorrelation(correlationId, 'edge_case_competitor_check_failed', {
        ...context,
        competitorId,
        edgeCase: 'competitor_check_failed',
        error: competitorCheckError instanceof Error ? competitorCheckError.message : 'Unknown error',
        task: 'Task 2.4'
      });
      logger.error('Task 2.4: Edge case - Failed to check competitor existence', competitorCheckError as Error, {
        ...context,
        competitorId,
        edgeCase: 'competitor_check_failed'
      });

      return NextResponse.json(
        { 
          message: 'Unable to verify competitor information.',
          error: {
            type: 'SERVICE_ERROR',
            details: 'Database query to verify competitor failed',
            guidance: {
              instruction: 'Please try again in a few moments',
              retryRecommendation: 'exponential backoff',
              expectedRecoveryTime: '1-5 minutes'
            }
          },
          code: 'EDGE_CASE_COMPETITOR_CHECK_FAILED',
          retryable: true,
          correlationId,
          competitorId
        },
        { status: 503 } // 503 Service Unavailable
      );
    }

    // Parse request body for additional options
    let requestBody: any = {};
    try {
      requestBody = await request.json();
      trackCorrelation(correlationId, 'request_body_parsed', { 
        ...context, 
        hasBody: true,
        bodyKeys: Object.keys(requestBody)
      });
    } catch (jsonError) {
      trackCorrelation(correlationId, 'request_body_empty', context);
      logger.debug('No valid JSON body provided, using defaults', context);
    }

    const { changeLog, reportOptions, reportName, projectId: explicitProjectId } = requestBody;

    // Task 2.2: Automatic ProjectId Resolution Before Report Generation
    let resolvedProjectId = explicitProjectId;
    let projectResolutionSource = 'explicit';
    
    if (!explicitProjectId) {
      // Automatic resolution required - this is the core of Task 2.2
      trackCorrelation(correlationId, 'automatic_project_resolution_started', { ...context, competitorId });
      logger.info('Initiating automatic projectId resolution before report generation', { 
        ...context, 
        competitorId,
        task: 'Task 2.2 - Automatic Resolution'
      });
      
      try {
        const projectDiscovery = new ProjectDiscoveryService();
        
        // Add validation step before resolution
        const isValidCompetitor = await projectDiscovery.validateProjectCompetitorRelationship(
          competitorId, 
          'validation-check'
        );
        
        logger.debug('Competitor validation for automatic resolution', {
          ...context,
          competitorId,
          validationAttempted: true
        });

        const discoveryResult = await projectDiscovery.resolveProjectId(competitorId, {
          correlationId,
          priorityRules: 'active_first', // Use default business logic for automatic resolution
          includeInactive: false // Task 2.2: Only active projects for automatic resolution
        });
        
        if (discoveryResult.success && discoveryResult.projectId) {
          resolvedProjectId = discoveryResult.projectId;
          projectResolutionSource = 'automatic';
          
          trackCorrelation(correlationId, 'automatic_project_resolution_success', { 
            ...context, 
            competitorId,
            resolvedProjectId,
            totalProjectsFound: discoveryResult.projects?.length || 0,
            resolutionMethod: 'automatic',
            task: 'Task 2.2'
          });
          
          logger.info('Task 2.2: Automatic projectId resolution completed successfully before report generation', {
            ...context,
            competitorId,
            resolvedProjectId,
            totalProjectsFound: discoveryResult.projects?.length || 0,
            resolutionSource: 'automatic',
            priorityRule: 'active_first'
          });
        } else if (discoveryResult.requiresExplicitSelection) {
          // Task 2.3: Graceful fallback for multiple projects - provide clear guidance
          trackCorrelation(correlationId, 'graceful_fallback_multiple_projects', { 
            ...context, 
            competitorId,
            availableProjects: discoveryResult.projects?.length || 0,
            task: 'Task 2.3 - Graceful Fallback'
          });
          
          logger.info('Task 2.3: Graceful fallback triggered - multiple projects found, providing manual selection guidance', {
            ...context,
            competitorId,
            availableProjects: discoveryResult.projects?.map(p => ({ id: p.id, name: p.name, status: p.status })),
            fallbackReason: 'multiple_projects'
          });
          
          return NextResponse.json(
            { 
              message: 'Automatic project resolution found multiple options. Please select one explicitly.',
              fallback: {
                reason: 'MULTIPLE_PROJECTS_FOUND',
                guidance: {
                  instruction: 'Add projectId to your request body to specify which project to use',
                  example: {
                    method: 'POST',
                    url: `/api/reports/generate?competitorId=${competitorId}&timeframe=${timeframe || 30}`,
                    body: {
                      projectId: 'YOUR_CHOSEN_PROJECT_ID',
                      reportName: 'Optional report name',
                      reportOptions: 'default'
                    }
                  }
                },
                availableProjects: discoveryResult.projects?.map(p => ({ 
                  id: p.id, 
                  name: p.name, 
                  status: p.status,
                  recommended: p.isActive ? 'Active project' : 'Inactive project'
                })) || []
              },
              code: 'GRACEFUL_FALLBACK_MANUAL_SELECTION',
              retryable: true,
              correlationId,
              competitorId
            },
            { status: 422 } // 422 Unprocessable Entity - client needs to provide additional info
          );
        } else {
          // Task 2.4: Check if competitor has only inactive projects (edge case)
          try {
            const allProjects = await projectDiscovery.findProjectsByCompetitorId(competitorId, {
              correlationId,
              includeInactive: true // Include all projects to check for inactive-only scenario
            });

            if (allProjects.length > 0 && allProjects.every(p => !p.isActive)) {
              // Edge case: Competitor has projects but they're all inactive
              trackCorrelation(correlationId, 'edge_case_inactive_projects_only', {
                ...context,
                competitorId,
                totalProjects: allProjects.length,
                inactiveProjects: allProjects.length,
                edgeCase: 'inactive_projects_only',
                task: 'Task 2.4'
              });
              
              logger.info('Task 2.4: Edge case - Competitor has only inactive projects', {
                ...context,
                competitorId,
                inactiveProjectCount: allProjects.length,
                edgeCase: 'inactive_projects_only'
              });

              return NextResponse.json(
                { 
                  message: 'Competitor belongs to inactive projects only. Manual project specification required.',
                  fallback: {
                    reason: 'INACTIVE_PROJECTS_ONLY',
                    guidance: {
                      instruction: 'This competitor belongs to projects that are currently inactive. You can either activate a project or specify a projectId explicitly.',
                      options: [
                        '1. Activate one of the existing projects, OR',
                        '2. Create a new active project for this competitor, OR', 
                        '3. Specify an inactive projectId explicitly if you want to generate a report anyway'
                      ],
                      inactiveProjects: allProjects.map(p => ({
                        id: p.id,
                        name: p.name,
                        status: p.status
                      })),
                      example: {
                        method: 'POST',
                        url: `/api/reports/generate?competitorId=${competitorId}&timeframe=${timeframe || 30}`,
                        body: {
                          projectId: 'INACTIVE_PROJECT_ID_IF_INTENDED',
                          reportName: 'Optional report name',
                          reportOptions: 'default'
                        }
                      }
                    },
                    debugInfo: {
                      competitorId,
                      totalProjectsFound: allProjects.length,
                      allProjectsInactive: true
                    }
                  },
                  code: 'EDGE_CASE_INACTIVE_PROJECTS_ONLY',
                  retryable: true,
                  correlationId,
                  competitorId
                },
                { status: 422 } // 422 Unprocessable Entity - client action required
              );
            }
          } catch (inactiveCheckError) {
            // If we can't check for inactive projects, fall through to normal no-projects handling
            logger.debug('Could not check for inactive projects, proceeding with normal no-projects handling', {
              ...context,
              competitorId,
              error: inactiveCheckError instanceof Error ? inactiveCheckError.message : 'Unknown error'
            });
          }

          // Task 2.3: Graceful fallback for no projects found - provide helpful guidance
          trackCorrelation(correlationId, 'graceful_fallback_no_projects', { 
            ...context, 
            competitorId,
            error: discoveryResult.error,
            task: 'Task 2.3 - Graceful Fallback'
          });
          
          logger.info('Task 2.3: Graceful fallback triggered - no projects found, providing guidance for manual specification', {
            ...context,
            competitorId,
            fallbackReason: 'no_projects_found',
            originalError: discoveryResult.error
          });
          
          return NextResponse.json(
            { 
              message: 'No projects found associated with this competitor. Manual project specification required.',
              fallback: {
                reason: 'NO_PROJECTS_FOUND',
                guidance: {
                  instruction: 'Create a project first, or specify an existing projectId if this competitor should belong to an existing project',
                  steps: [
                    '1. Create a new project that includes this competitor, OR',
                    '2. Add this competitor to an existing project, OR', 
                    '3. Specify a projectId explicitly in the request body if you know which project should contain this competitor'
                  ],
                  example: {
                    method: 'POST',
                    url: `/api/reports/generate?competitorId=${competitorId}&timeframe=${timeframe || 30}`,
                    body: {
                      projectId: 'YOUR_EXISTING_PROJECT_ID',
                      reportName: 'Optional report name',
                      reportOptions: 'default'
                    }
                  }
                },
                debugInfo: {
                  competitorId,
                  searchPerformed: 'Projects containing this competitor',
                  originalError: discoveryResult.error || 'No associated projects found'
                }
              },
              code: 'GRACEFUL_FALLBACK_NO_PROJECTS',
              retryable: true,
              correlationId,
              competitorId
            },
            { status: 422 } // 422 Unprocessable Entity - client action required
          );
        }
      } catch (discoveryError) {
        // Task 2.3: Graceful fallback for discovery service exceptions
        trackCorrelation(correlationId, 'graceful_fallback_service_exception', { 
          ...context, 
          competitorId,
          error: discoveryError instanceof Error ? discoveryError.message : 'Unknown error',
          task: 'Task 2.3 - Graceful Fallback'
        });
        
        logger.warn('Task 2.3: Graceful fallback triggered - discovery service exception, providing manual specification guidance', {
          ...context,
          competitorId,
          fallbackReason: 'service_exception',
          originalError: discoveryError instanceof Error ? discoveryError.message : 'Unknown error'
        });
        
        // Instead of falling back to 'unknown', provide graceful response
        return NextResponse.json(
          { 
            message: 'Project discovery service temporarily unavailable. Please specify projectId manually.',
            fallback: {
              reason: 'SERVICE_EXCEPTION',
              guidance: {
                instruction: 'The automatic project resolution service is experiencing issues. Please provide projectId explicitly.',
                steps: [
                  '1. Check which project this competitor belongs to in your dashboard',
                  '2. Add the projectId to your request body',
                  '3. Retry the request with explicit projectId'
                ],
                example: {
                  method: 'POST',
                  url: `/api/reports/generate?competitorId=${competitorId}&timeframe=${timeframe || 30}`,
                  body: {
                    projectId: 'YOUR_PROJECT_ID',
                    reportName: 'Optional report name',
                    reportOptions: 'default'
                  }
                }
              },
              debugInfo: {
                competitorId,
                serviceError: discoveryError instanceof Error ? discoveryError.message : 'Unknown error',
                timestamp: new Date().toISOString(),
                retryRecommendation: 'Try again in a few minutes, or use manual projectId specification'
              }
            },
            code: 'GRACEFUL_FALLBACK_SERVICE_ERROR',
            retryable: true,
            correlationId,
            competitorId
          },
          { status: 503 } // 503 Service Unavailable - temporary issue
        );
      }
    } else {
      trackCorrelation(correlationId, 'project_id_explicitly_provided', { 
        ...context, 
        competitorId,
        explicitProjectId 
      });
      logger.debug('Project ID explicitly provided in request body', { 
        ...context, 
        competitorId,
        explicitProjectId 
      });
    }

    // Enhanced context for logging - Task 2.2 completion tracking
    const enhancedContext = {
      ...context,
      competitorId,
      timeframe,
      hasChangeLog: !!changeLog,
      reportOptions: reportOptions || 'default',
      reportName: reportName || 'unnamed',
      projectId: resolvedProjectId || 'unknown',
      projectIdSource: projectResolutionSource,
      automaticResolutionUsed: !explicitProjectId,
      task22Completed: !explicitProjectId && resolvedProjectId !== 'unknown'
    };

    // Task 2.3: Enhanced final validation with graceful fallback guidance
    if (!resolvedProjectId || resolvedProjectId === 'unknown') {
      trackCorrelation(correlationId, 'graceful_fallback_final_validation', {
        ...enhancedContext,
        error: 'No valid projectId resolved before report generation',
        task: 'Task 2.3 - Final Graceful Fallback'
      });
      
      logger.info('Task 2.3: Final graceful fallback - no valid projectId resolved, providing comprehensive manual specification guidance', {
        ...enhancedContext,
        fallbackReason: 'final_validation_failed'
      });
      
      return NextResponse.json(
        { 
          message: 'Project could not be automatically resolved. Manual specification required to proceed.',
          fallback: {
            reason: 'FINAL_VALIDATION_FAILED',
            guidance: {
              instruction: 'All automatic resolution attempts were unsuccessful. Please provide projectId explicitly.',
              quickSolution: {
                step: 'Add projectId to your request body',
                example: {
                  method: 'POST',
                  url: `/api/reports/generate?competitorId=${competitorId}&timeframe=${timeframe || 30}`,
                  body: {
                    projectId: 'YOUR_PROJECT_ID',
                    reportName: reportName || 'Competitive Analysis Report',
                    reportOptions: reportOptions || 'default'
                  }
                }
              },
              troubleshooting: [
                'Check if this competitor is associated with any projects',
                'Verify the competitor ID is correct',
                'Ensure the project is active and accessible',
                'Contact support if the issue persists'
              ]
            },
            context: {
              competitorId,
              automaticResolutionAttempted: !explicitProjectId,
              timeframe: timeframe || 30,
              requestId: correlationId
            }
          },
          code: 'GRACEFUL_FALLBACK_FINAL_VALIDATION',
          retryable: true,
          correlationId,
          competitorId
        },
        { status: 422 } // 422 Unprocessable Entity - client action required
      );
    }

    trackReportFlow('initialization', {
      ...enhancedContext,
      stepStatus: 'started',
      stepData: { competitorId, timeframe, reportName, projectId: resolvedProjectId }
    });

    logger.info('Starting report generation with resolved projectId', {
      ...enhancedContext,
      task: 'Task 2.2 - Pre-Generation Validation Complete'
    });

    // Initialize generator and generate report with enhanced error handling
    const generator = new ReportGenerator();
    
    trackReportFlow('generator_initialized', {
      ...enhancedContext,
      stepStatus: 'completed'
    });

    const report = await generator.generateReport(competitorId, timeframe, {
      changeLog,
      reportName,
      projectId: resolvedProjectId,
      reportOptions: {
        fallbackToSimpleReport: true, // Always enable fallbacks for API
        maxRetries: 3,
        retryDelay: 1000,
        ...reportOptions
      }
    });

    // Check if report generation failed
    if (report.error) {
      trackReportFlow('generation_failed', {
        ...enhancedContext,
        stepStatus: 'failed',
        stepData: { error: report.error, validationErrors: report.validationErrors }
      });

      trackCorrelation(correlationId, 'report_generation_failed', { 
        ...enhancedContext, 
        error: report.error,
        validationErrors: report.validationErrors
      });

      logger.warn('Report generation failed', { 
        ...enhancedContext, 
        error: report.error,
        validationErrors: report.validationErrors
      });

      // Determine appropriate status code based on error type
      let statusCode = 500;
      let errorCode = 'REPORT_GENERATION_FAILED';

      if (report.error.includes('credentials')) {
        statusCode = 503;
        errorCode = 'AWS_CREDENTIALS_ERROR';
      } else if (report.error.includes('rate limit')) {
        statusCode = 429;
        errorCode = 'RATE_LIMIT_EXCEEDED';
      } else if (report.error.includes('not found')) {
        statusCode = 404;
        errorCode = 'COMPETITOR_NOT_FOUND';
      } else if (report.error.includes('No data available')) {
        statusCode = 422;
        errorCode = 'INSUFFICIENT_DATA';
      }

      return NextResponse.json({
        error: report.error,
        code: errorCode,
        validationErrors: report.validationErrors,
        retryable: statusCode >= 500 || statusCode === 429,
        retryAfter: statusCode === 429 ? 300 : 60,
        timestamp: new Date().toISOString(),
        correlationId
      }, { status: statusCode });
    }

    trackReportFlow('generation_completed', {
      ...enhancedContext,
      stepStatus: 'completed',
      stepData: { 
        reportTitle: report.data?.title || 'unknown',
        sectionsCount: report.data?.sections?.length || 0
      }
    });

    trackCorrelation(correlationId, 'report_generation_completed_successfully', {
      ...enhancedContext,
      reportTitle: report.data?.title || 'unknown'
    });

    logger.info('Report generation completed successfully', enhancedContext);

    return NextResponse.json({
      success: true,
      data: report.data,
      timestamp: new Date().toISOString(),
      correlationId
    });

  } catch (error) {
    trackReportFlow('unexpected_error', {
      ...context,
      stepStatus: 'failed',
      stepData: { errorMessage: (error as Error).message }
    });

    trackCorrelation(correlationId, 'unexpected_error_occurred', {
      ...context,
      errorMessage: (error as Error).message
    });

    logger.error('Unexpected error in report generation endpoint', error as Error, context);
    
    const errorResponse = handleAPIError(error as Error, 'report_generation', context);
    
    // Add correlation ID to error response
    if (errorResponse instanceof NextResponse) {
      const body = await errorResponse.json();
      return NextResponse.json({
        ...body,
        correlationId
      }, { status: errorResponse.status });
    }
    
    return errorResponse;
  }
} 