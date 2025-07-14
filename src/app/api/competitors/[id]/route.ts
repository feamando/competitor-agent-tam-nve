import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { z } from 'zod';
import { 
  logger, 
  generateCorrelationId, 
  trackDatabaseOperation,
  trackCorrelation,
  trackError 
} from '@/lib/logger';
import { withRedisCache } from '@/lib/redis-cache';

const updateCompetitorSchema = z.object({
  name: z.string().min(1, 'Company name is required').max(255, 'Company name too long').optional(),
  website: z.string().url('Invalid website URL').optional(),
  description: z.string().max(1000, 'Description too long').optional(),
  industry: z.string().min(1, 'Industry is required').max(100, 'Industry name too long').optional(),
  employeeCount: z.number().int().positive().optional(),
  revenue: z.number().positive().optional(),
  founded: z.number().int().min(1800).max(new Date().getFullYear()).optional(),
  headquarters: z.string().max(255, 'Headquarters location too long').optional(),
  socialMedia: z.any().optional(),
});

// Define TTL for caching competitor details (in seconds)
const COMPETITOR_DETAIL_CACHE_TTL = 600; // 10 minutes

// GET /api/competitors/[id]
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const correlationId = generateCorrelationId();
  const logContext = {
    endpoint: `/api/competitors/${(await context.params).id}`,
    method: 'GET',
    correlationId,
    competitorId: (await context.params).id
  };

  try {
    trackCorrelation(correlationId, 'competitor_detail_request_received', logContext);
    logger.info('Competitor detail request received', logContext);

    // Validate competitor ID
    if (!(await context.params).id || (await context.params).id.length < 1) {
      trackCorrelation(correlationId, 'invalid_competitor_id', logContext);
      logger.warn('Invalid competitor ID provided', logContext);
      return NextResponse.json({ 
        error: 'Invalid competitor ID',
        correlationId 
      }, { status: 400 });
    }

    // Create fetch function for cache wrapper
    const fetchCompetitorDetail = async () => {
      trackDatabaseOperation('findUnique', 'competitor', {
        ...logContext,
        query: 'fetch competitor with relations'
      });

      const competitor = await prisma.competitor.findUnique({
        where: {
          id: (await context.params).id
        },
        include: {
          reports: {
            select: {
              id: true,
              name: true,
              createdAt: true,
              updatedAt: true
            },
            orderBy: { createdAt: 'desc' }
          },
          snapshots: {
            select: {
              id: true,
              createdAt: true,
              metadata: true
            },
            orderBy: { createdAt: 'desc' },
            take: 5
          }
        }
      });

      if (!competitor) {
        trackCorrelation(correlationId, 'competitor_not_found', logContext);
        trackDatabaseOperation('findUnique', 'competitor', {
          ...logContext,
          success: true,
          recordData: { found: false }
        });

        logger.warn('Competitor not found', logContext);
        return null;
      }

      trackCorrelation(correlationId, 'competitor_detail_retrieved', {
        ...logContext,
        competitorName: competitor.name,
        reportsCount: competitor.reports.length,
        snapshotsCount: competitor.snapshots.length,
        cached: false
      });

      trackDatabaseOperation('findUnique', 'competitor', {
        ...logContext,
        success: true,
        recordData: { 
          found: true,
          name: competitor.name,
          reportsCount: competitor.reports.length,
          snapshotsCount: competitor.snapshots.length
        }
      });

      logger.info('Competitor detail retrieved successfully', {
        ...logContext,
        competitorName: competitor.name,
        reportsCount: competitor.reports.length,
        snapshotsCount: competitor.snapshots.length,
        cached: false
      });

      return competitor;
    };

    // Use Redis cache
    const competitor = await withRedisCache(
      fetchCompetitorDetail,
      'competitor_detail',
      { id: (await context.params).id },
      COMPETITOR_DETAIL_CACHE_TTL,
      { logCacheHits: true }
    );
    
    // Handle case when competitor is not found (after cache)
    if (!competitor) {
      return NextResponse.json({ 
        error: 'Competitor not found',
        message: `No competitor found with ID: ${(await context.params).id}`,
        correlationId 
      }, { status: 404 });
    }

    return NextResponse.json({
      ...competitor,
      correlationId
    });

  } catch (error) {
    trackCorrelation(correlationId, 'competitor_detail_error', {
      ...logContext,
      errorMessage: (error as Error).message
    });

    logger.error('Failed to fetch competitor details', error as Error, logContext);
    trackError(error as Error, 'competitor_detail', logContext);

    return NextResponse.json({ 
      error: 'Internal Server Error',
      message: 'Failed to fetch competitor details',
      correlationId 
    }, { status: 500 });
  }
}

// PUT /api/competitors/[id]
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const correlationId = generateCorrelationId();
  const logContext = {
    endpoint: `/api/competitors/${(await context.params).id}`,
    method: 'PUT',
    correlationId,
    competitorId: (await context.params).id
  };

  try {
    trackCorrelation(correlationId, 'competitor_update_request_received', logContext);
    logger.info('Competitor update request received', logContext);

    // Validate competitor ID
    if (!(await context.params).id || (await context.params).id.length < 1) {
      trackCorrelation(correlationId, 'invalid_competitor_id', logContext);
      logger.warn('Invalid competitor ID provided', logContext);
      return NextResponse.json({ 
        error: 'Invalid competitor ID',
        correlationId 
      }, { status: 400 });
    }

    // Parse and validate request body
    let json;
    try {
      json = await request.json();
      trackCorrelation(correlationId, 'request_body_parsed', {
        ...logContext,
        hasBody: true,
        updateFields: Object.keys(json)
      });
    } catch (parseError) {
      trackCorrelation(correlationId, 'request_body_parse_failed', logContext);
      logger.warn('Invalid JSON in request body', logContext);
      return NextResponse.json({ 
        error: 'Invalid JSON in request body',
        correlationId 
      }, { status: 400 });
    }

    // Validate update data
    let validatedData;
    try {
      validatedData = updateCompetitorSchema.parse(json);
      trackCorrelation(correlationId, 'input_validation_passed', {
        ...logContext,
        updateFields: Object.keys(validatedData)
      });
    } catch (validationError) {
      trackCorrelation(correlationId, 'input_validation_failed', {
        ...logContext,
        validationErrors: validationError instanceof z.ZodError ? validationError.errors : []
      });
      
      logger.warn('Competitor update validation failed', {
        ...logContext,
        validationErrors: validationError instanceof z.ZodError ? validationError.errors : []
      });

      const errors = validationError instanceof z.ZodError 
        ? validationError.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message
          }))
        : [{ field: 'unknown', message: 'Validation failed' }];

      return NextResponse.json({ 
        error: 'Validation failed',
        validationErrors: errors,
        correlationId 
      }, { status: 400 });
    }

    // Check if update data is empty
    if (Object.keys(validatedData).length === 0) {
      trackCorrelation(correlationId, 'empty_update_data', logContext);
      logger.warn('No valid update fields provided', logContext);
      return NextResponse.json({ 
        error: 'No valid update data provided',
        message: 'At least one field must be provided for update',
        correlationId 
      }, { status: 400 });
    }

    // Check if competitor exists
    trackDatabaseOperation('findUnique', 'competitor', {
      ...logContext,
      query: 'check competitor exists before update'
    });

    const existingCompetitor = await prisma.competitor.findUnique({
      where: { id: (await context.params).id }
    });

    if (!existingCompetitor) {
      trackCorrelation(correlationId, 'competitor_not_found_for_update', logContext);
      trackDatabaseOperation('findUnique', 'competitor', {
        ...logContext,
        success: true,
        recordData: { found: false }
      });

      logger.warn('Competitor not found for update', logContext);
      return NextResponse.json({ 
        error: 'Competitor not found',
        message: `No competitor found with ID: ${(await context.params).id}`,
        correlationId 
      }, { status: 404 });
    }

    // Check for duplicate name/website if being updated
    if (validatedData.name || validatedData.website) {
      const duplicateConditions = [];
      if (validatedData.name && validatedData.name !== existingCompetitor.name) {
        duplicateConditions.push({ name: validatedData.name });
      }
      if (validatedData.website && validatedData.website !== existingCompetitor.website) {
        duplicateConditions.push({ website: validatedData.website });
      }

      if (duplicateConditions.length > 0) {
        trackDatabaseOperation('findFirst', 'competitor', {
          ...logContext,
          query: 'check for duplicates during update'
        });

        const duplicateCompetitor = await prisma.competitor.findFirst({
          where: {
            AND: [
              { id: { not: (await context.params).id } },
              { OR: duplicateConditions }
            ]
          }
        });

        if (duplicateCompetitor) {
          trackCorrelation(correlationId, 'duplicate_competitor_found_during_update', {
            ...logContext,
            duplicateCompetitorId: duplicateCompetitor.id
          });

          logger.warn('Duplicate competitor detected during update', {
            ...logContext,
            duplicateCompetitorId: duplicateCompetitor.id
          });

          return NextResponse.json({ 
            error: 'Competitor already exists',
            message: 'Another competitor with this name or website already exists',
            existingCompetitor: {
              id: duplicateCompetitor.id,
              name: duplicateCompetitor.name,
              website: duplicateCompetitor.website
            },
            correlationId 
          }, { status: 409 });
        }
      }
    }

    trackCorrelation(correlationId, 'competitor_update_started', logContext);
    trackDatabaseOperation('update', 'competitor', {
      ...logContext,
      recordData: validatedData
    });

    const competitor = await prisma.competitor.update({
      where: {
        id: (await context.params).id
      },
      data: validatedData,
      include: {
        reports: {
          select: {
            id: true,
            name: true,
            createdAt: true
          },
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    trackCorrelation(correlationId, 'competitor_update_completed', {
      ...logContext,
      competitorName: competitor.name
    });

    trackDatabaseOperation('update', 'competitor', {
      ...logContext,
      success: true,
      recordData: { name: competitor.name }
    });

    logger.info('Competitor updated successfully', {
      ...logContext,
      competitorName: competitor.name
    });

    return NextResponse.json({
      ...competitor,
      correlationId
    });

  } catch (error) {
    trackCorrelation(correlationId, 'competitor_update_error', {
      ...logContext,
      errorMessage: (error as Error).message
    });

    logger.error('Failed to update competitor', error as Error, logContext);
    trackError(error as Error, 'competitor_update', logContext);

    // Handle specific database errors
    if (error instanceof Error) {
      if (error.message.includes('Unique constraint')) {
        return NextResponse.json({ 
          error: 'Competitor already exists',
          message: 'A competitor with this name or website already exists',
          correlationId 
        }, { status: 409 });
      }
    }

    return NextResponse.json({ 
      error: 'Internal Server Error',
      message: 'Failed to update competitor',
      correlationId 
    }, { status: 500 });
  }
}

// DELETE /api/competitors/[id]
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const correlationId = generateCorrelationId();
  const logContext = {
    endpoint: `/api/competitors/${(await context.params).id}`,
    method: 'DELETE',
    correlationId,
    competitorId: (await context.params).id
  };

  try {
    trackCorrelation(correlationId, 'competitor_delete_request_received', logContext);
    logger.info('Competitor delete request received', logContext);

    // Validate competitor ID
    if (!(await context.params).id || (await context.params).id.length < 1) {
      trackCorrelation(correlationId, 'invalid_competitor_id', logContext);
      logger.warn('Invalid competitor ID provided', logContext);
      return NextResponse.json({ 
        error: 'Invalid competitor ID',
        correlationId 
      }, { status: 400 });
    }

    // Check if competitor exists and get related data count
    trackDatabaseOperation('findUnique', 'competitor', {
      ...logContext,
      query: 'check competitor exists before delete with relations count'
    });

    const existingCompetitor = await prisma.competitor.findUnique({
      where: { id: (await context.params).id },
      include: {
        reports: { select: { id: true } },
        snapshots: { select: { id: true } }
      }
    });

    if (!existingCompetitor) {
      trackCorrelation(correlationId, 'competitor_not_found_for_delete', logContext);
      trackDatabaseOperation('findUnique', 'competitor', {
        ...logContext,
        success: true,
        recordData: { found: false }
      });

      logger.warn('Competitor not found for deletion', logContext);
      return NextResponse.json({ 
        error: 'Competitor not found',
        message: `No competitor found with ID: ${(await context.params).id}`,
        correlationId 
      }, { status: 404 });
    }

    const relatedDataCount = {
      reports: existingCompetitor.reports.length,
      snapshots: existingCompetitor.snapshots.length
    };

    trackCorrelation(correlationId, 'competitor_delete_started', {
      ...logContext,
      competitorName: existingCompetitor.name,
      relatedDataCount
    });

    trackDatabaseOperation('delete', 'competitor', {
      ...logContext,
      recordData: { 
        name: existingCompetitor.name,
        relatedDataCount
      }
    });

    await prisma.competitor.delete({
      where: {
        id: (await context.params).id
      }
    });

    trackCorrelation(correlationId, 'competitor_delete_completed', {
      ...logContext,
      competitorName: existingCompetitor.name,
      relatedDataCount
    });

    trackDatabaseOperation('delete', 'competitor', {
      ...logContext,
      success: true,
      recordData: { name: existingCompetitor.name }
    });

    logger.info('Competitor deleted successfully', {
      ...logContext,
      competitorName: existingCompetitor.name,
      relatedDataCount
    });

    return NextResponse.json({
      message: 'Competitor deleted successfully',
      deletedCompetitor: {
        id: existingCompetitor.id,
        name: existingCompetitor.name
      },
      relatedDataCount,
      correlationId
    }, { status: 200 });

  } catch (error) {
    trackCorrelation(correlationId, 'competitor_delete_error', {
      ...logContext,
      errorMessage: (error as Error).message
    });

    logger.error('Failed to delete competitor', error as Error, logContext);
    trackError(error as Error, 'competitor_delete', logContext);

    // Handle specific database errors
    if (error instanceof Error) {
      if (error.message.includes('Foreign key constraint')) {
        return NextResponse.json({ 
          error: 'Cannot delete competitor',
          message: 'Competitor has associated data that must be removed first',
          correlationId 
        }, { status: 409 });
      }
    }

    return NextResponse.json({ 
      error: 'Internal Server Error',
      message: 'Failed to delete competitor',
      correlationId 
    }, { status: 500 });
  }
} 