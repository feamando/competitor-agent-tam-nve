import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { 
  logger, 
  generateCorrelationId, 
  trackDatabaseOperation,
  trackCorrelation,
  trackError 
} from '@/lib/logger'
import { CompetitorSnapshotTrigger } from '@/services/competitorSnapshotTrigger'
import redisCacheService, { withRedisCache } from '@/lib/redis-cache'
import { withCache } from '@/lib/cache'
import { profileOperation, PERFORMANCE_THRESHOLDS } from '@/lib/profiling'

const competitorSchema = z.object({
  name: z.string().min(1, 'Company name is required').max(255, 'Company name too long'),
  website: z.string().optional().default('').transform(val => {
    if (!val || val.trim() === '') {
      // Generate a unique default website using timestamp
      return `https://placeholder-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.com`;
    }
    if (!val.startsWith('http://') && !val.startsWith('https://')) {
      return `https://${val}`;
    }
    return val;
  }),
  description: z.string().optional(),
  industry: z.string().max(100, 'Industry name too long').optional().default('Other'),
  employeeCount: z.number().int().positive().optional(),
  revenue: z.number().positive().optional(),
  founded: z.number().int().min(1800).max(new Date().getFullYear()).optional(),
  headquarters: z.string().max(255, 'Headquarters location too long').optional(),
  socialMedia: z.any().optional(),
})

export async function POST(request: Request) {
  const correlationId = generateCorrelationId();
  const context = {
    endpoint: '/api/competitors',
    method: 'POST',
    correlationId
  };

  try {
    trackCorrelation(correlationId, 'competitor_creation_request_received', context);
    logger.info('Competitor creation request received', context);

    // Parse and validate request body
    let json;
    try {
      json = await request.json();
      trackCorrelation(correlationId, 'request_body_parsed', {
        ...context,
        hasBody: true,
        bodyKeys: Object.keys(json)
      });
    } catch (parseError) {
      trackCorrelation(correlationId, 'request_body_parse_failed', context);
      logger.warn('Invalid JSON in request body', context);
      return NextResponse.json({ 
        error: 'Invalid JSON in request body',
        correlationId 
      }, { status: 400 });
    }

    // Validate input schema
    let validatedData;
    try {
      validatedData = competitorSchema.parse(json);
      trackCorrelation(correlationId, 'input_validation_passed', {
        ...context,
        competitorName: validatedData.name
      });
    } catch (validationError) {
      trackCorrelation(correlationId, 'input_validation_failed', {
        ...context,
        validationErrors: validationError instanceof z.ZodError ? validationError.errors : []
      });
      
      logger.warn('Competitor validation failed', {
        ...context,
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

    // Check for duplicate competitors
    trackCorrelation(correlationId, 'duplicate_check_started', context);
    trackDatabaseOperation('findFirst', 'competitor', {
      ...context,
      query: 'duplicate check by name and website'
    });

    const existingCompetitor = await prisma.competitor.findFirst({
      where: {
        OR: [
          { name: validatedData.name },
          { website: validatedData.website }
        ]
      }
    });

    if (existingCompetitor) {
      trackCorrelation(correlationId, 'duplicate_competitor_found', {
        ...context,
        existingCompetitorId: existingCompetitor.id,
        duplicateField: existingCompetitor.name === validatedData.name ? 'name' : 'website'
      });

      trackDatabaseOperation('findFirst', 'competitor', {
        ...context,
        success: true,
        recordData: { found: true, duplicateField: existingCompetitor.name === validatedData.name ? 'name' : 'website' }
      });

      logger.warn('Duplicate competitor detected', {
        ...context,
        existingCompetitorId: existingCompetitor.id,
        duplicateField: existingCompetitor.name === validatedData.name ? 'name' : 'website'
      });

      return NextResponse.json({ 
        error: 'Competitor already exists',
        message: existingCompetitor.name === validatedData.name 
          ? 'A competitor with this name already exists'
          : 'A competitor with this website already exists',
        existingCompetitor: {
          id: existingCompetitor.id,
          name: existingCompetitor.name,
          website: existingCompetitor.website
        },
        correlationId 
      }, { status: 409 });
    }

    trackCorrelation(correlationId, 'duplicate_check_passed', context);
    trackDatabaseOperation('findFirst', 'competitor', {
      ...context,
      success: true,
      recordData: { found: false }
    });

    // Create competitor
    trackCorrelation(correlationId, 'competitor_creation_started', context);
    trackDatabaseOperation('create', 'competitor', {
      ...context,
      recordData: {
        name: validatedData.name,
        website: validatedData.website,
        industry: validatedData.industry
      }
    });

    const competitor = await prisma.competitor.create({
      data: {
        ...validatedData,
      },
    });

    trackCorrelation(correlationId, 'competitor_creation_completed', {
      ...context,
      competitorId: competitor.id
    });

    trackDatabaseOperation('create', 'competitor', {
      ...context,
      recordId: competitor.id,
      success: true
    });

    logger.info('Competitor created successfully', {
      ...context,
      competitorId: competitor.id,
      competitorName: competitor.name
    });

    // Task 3.2: Trigger immediate snapshot collection for new competitor
    try {
      const snapshotTrigger = CompetitorSnapshotTrigger.getInstance();
      await snapshotTrigger.triggerImmediateSnapshot({
        competitorId: competitor.id,
        priority: 'high',
        correlationId
      });

      logger.info('Snapshot collection triggered for new competitor', {
        ...context,
        competitorId: competitor.id,
        competitorName: competitor.name
      });

      trackCorrelation(correlationId, 'snapshot_trigger_initiated', {
        ...context,
        competitorId: competitor.id
      });

    } catch (snapshotError) {
      // Don't fail competitor creation if snapshot trigger fails
      logger.warn('Failed to trigger snapshot for new competitor', snapshotError as Error, {
        ...context,
        competitorId: competitor.id,
        competitorName: competitor.name
      });

      trackCorrelation(correlationId, 'snapshot_trigger_failed', {
        ...context,
        competitorId: competitor.id,
        error: snapshotError instanceof Error ? snapshotError.message : String(snapshotError)
      });
    }

    return NextResponse.json({
      ...competitor,
      correlationId
    }, { status: 201 });

  } catch (error) {
    trackCorrelation(correlationId, 'competitor_creation_error', {
      ...context,
      errorMessage: (error as Error).message
    });

    logger.error('Failed to create competitor', error as Error, context);
    trackError(error as Error, 'competitor_creation', context);

    // Determine specific error type
    if (error instanceof Error) {
      if (error.message.includes('Unique constraint')) {
        return NextResponse.json({ 
          error: 'Competitor already exists',
          message: 'A competitor with this name or website already exists',
          correlationId 
        }, { status: 409 });
      }
      
      if (error.message.includes('Foreign key constraint')) {
        return NextResponse.json({ 
          error: 'Invalid reference',
          message: 'Referenced data does not exist',
          correlationId 
        }, { status: 400 });
      }
    }

    return NextResponse.json({ 
      error: 'Internal Server Error',
      message: 'Failed to create competitor',
      correlationId 
    }, { status: 500 });
  }
}

// Define TTL for caching competitors list (in seconds)
const COMPETITORS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function GET(request: NextRequest) {
  const correlationId = generateCorrelationId();
  const startTime = performance.now();
  
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '10');
  const search = url.searchParams.get('search') || '';
  
  // Logging context
  const context = {
    endpoint: '/api/competitors',
    method: 'GET',
    correlationId
  };
  
  const enhancedContext = {
    ...context,
    queryParams: { page, limit, search }
  };
  
  return profileOperation(async () => {
    try {
      trackCorrelation(correlationId, 'competitors_request_received', enhancedContext);
      logger.info('Competitors request received', enhancedContext);
      
      // Cache key parameters
      const cacheParams = { page, limit, search };
      
      // Use cache wrapper to efficiently cache results
      const result = await withCache(
        () => fetchCompetitorsWithBatching(page, limit, search, enhancedContext),
        'competitors_list',
        cacheParams,
        COMPETITORS_CACHE_TTL
      );
      
      const responseTime = performance.now() - startTime;
      
      // Track response time
      trackCorrelation(correlationId, 'competitors_request_completed', {
        ...enhancedContext,
        responseTime: `${responseTime.toFixed(2)}ms`,
        resultsCount: result.competitors.length,
        totalCount: result.total
      });
      
      // Set performance headers
      const headers = {
        'Cache-Control': 'public, max-age=60', // 1 minute browser cache
        'X-Response-Time': `${responseTime.toFixed(2)}ms`,
        'X-Correlation-ID': correlationId
      };
      
      return NextResponse.json({
        ...result,
        page,
        limit,
        responseTime: responseTime.toFixed(2)
      }, { headers });
      
    } catch (error) {
      const errorTime = performance.now() - startTime;
      
      trackError(
        error as Error,
        'competitors_request_failed',
        correlationId,
        {
          ...enhancedContext,
          responseTime: `${errorTime.toFixed(2)}ms`
        }
      );
      
      return NextResponse.json({
        error: 'Failed to fetch competitors',
        message: error instanceof Error ? error.message : 'Unknown error',
        correlationId
      }, { 
        status: 500,
        headers: {
          'X-Response-Time': `${errorTime.toFixed(2)}ms`,
          'X-Correlation-ID': correlationId
        }
      });
    }
  }, {
    label: 'API: GET /api/competitors',
    correlationId,
    additionalContext: {
      page,
      limit,
      search: search || 'none'
    }
  });
}

/**
 * Optimized function that fetches competitors with query batching
 * to reduce database round trips and improve performance
 */
async function fetchCompetitorsWithBatching(
  page: number,
  limit: number,
  search: string,
  context: Record<string, any>
) {
  const startTime = performance.now();
  trackCorrelation(context.correlationId, 'competitors_query_started', context);

  // Calculate offset for pagination
  const offset = (page - 1) * limit;

  // Build where clause for search
  const whereClause = search
    ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { website: { contains: search, mode: 'insensitive' as const } },
          { description: { contains: search, mode: 'insensitive' as const } },
          { industry: { contains: search, mode: 'insensitive' as const } },
        ],
      }
    : {};

  try {
    // OPTIMIZATION 1: Use Promise.all to batch queries
    const [total, competitors] = await Promise.all([
      // Count query
      profileOperation(
        () => prisma.competitor.count({ where: whereClause }),
        { label: 'COUNT competitors query', correlationId: context.correlationId }
      ),
      
      // Main data query with optimized select
      profileOperation(
        () => prisma.competitor.findMany({
          where: whereClause,
          skip: offset,
          take: limit,
          orderBy: { createdAt: 'desc' },
          // OPTIMIZATION 2: Optimize select with only necessary fields
          select: {
            id: true,
            name: true,
            website: true,
            description: true,
            industry: true,
            createdAt: true,
            updatedAt: true,
            // OPTIMIZATION 3: Use _count for efficient counting without fetching related data
            _count: {
              select: {
                reports: true,
                snapshots: true
              }
            },
            // OPTIMIZATION 4: Only fetch minimal data for related entities
            reports: {
              select: {
                id: true,
                name: true,
                createdAt: true
              },
              take: 3,
              orderBy: { createdAt: 'desc' }
            },
            snapshots: {
              select: {
                id: true,
                createdAt: true
              },
              take: 1,
              orderBy: { createdAt: 'desc' }
            }
          }
        }),
        { label: 'SELECT competitors query', correlationId: context.correlationId }
      )
    ]);

    // OPTIMIZATION 5: Efficient data transformation
    const enhancedCompetitors = competitors.map(competitor => ({
      id: competitor.id,
      name: competitor.name,
      website: competitor.website,
      description: competitor.description || '',
      industry: competitor.industry,
      createdAt: competitor.createdAt,
      updatedAt: competitor.updatedAt,
      reportCount: competitor._count.reports,
      snapshotCount: competitor._count.snapshots,
      lastReport: competitor.reports[0] || null,
      latestReports: competitor.reports,
      latestSnapshot: competitor.snapshots[0] || null,
      hasReports: competitor._count.reports > 0,
      hasSnapshots: competitor._count.snapshots > 0
    }));

    const queryTime = performance.now() - startTime;
    
    trackCorrelation(context.correlationId, 'competitors_query_completed', {
      ...context,
      queryTime: `${queryTime.toFixed(2)}ms`,
      resultsCount: competitors.length,
      totalCount: total
    });

    return {
      competitors: enhancedCompetitors,
      total,
      hasMore: offset + limit < total,
      queryTime
    };
  } catch (error) {
    trackError(
      error as Error,
      'competitors_query_failed',
      context.correlationId,
      {
        ...context,
        queryTime: `${(performance.now() - startTime).toFixed(2)}ms`
      }
    );
    
    throw error;
  }
} 