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
import { withCache } from '@/lib/cache'
import { profileOperation, PERFORMANCE_THRESHOLDS } from '@/lib/profiling'
import { CompetitorMatchingService } from '@/lib/competitors/competitorMatching'

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
  
  try {
    // Parse and validate request body
    const json = await request.json();
    const validatedData = competitorSchema.parse(json);

    // TP-028: Use website-based matching with profile association
    const matchResult = await CompetitorMatchingService.createOrAssociateCompetitor(validatedData);

    logger.info('Competitor creation/matching completed', {
      competitorId: matchResult.competitor.id,
      competitorName: matchResult.competitor.name,
      created: matchResult.created,
      claimed: matchResult.claimed,
      message: matchResult.message,
      correlationId
    });

    // Return appropriate status based on what happened
    const statusCode = matchResult.created ? 201 : 200;
    
    return NextResponse.json({
      ...matchResult.competitor,
      created: matchResult.created,
      claimed: matchResult.claimed,
      message: matchResult.message,
      correlationId
    }, { status: statusCode });

  } catch (error) {
    logger.error('Failed to create/match competitor', error as Error, { correlationId });
    
    if (error instanceof z.ZodError) {
      const errors = error.errors.map(err => ({
        field: err.path.join('.'),
        message: err.message
      }));

      return NextResponse.json({ 
        error: 'Validation failed',
        validationErrors: errors,
        correlationId 
      }, { status: 400 });
    }

    // Handle specific competitor matching errors
    if (error instanceof Error && error.message.includes('already exists under a different profile')) {
      return NextResponse.json({
        error: 'Competitor exists under different profile',
        message: error.message,
        correlationId
      }, { status: 409 });
    }

    return NextResponse.json({ 
      error: 'Internal Server Error',
      message: 'Failed to create/match competitor',
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
  
  const context = {
    endpoint: '/api/competitors',
    method: 'GET',
    correlationId,
    queryParams: { page, limit, search }
  };
  
  return profileOperation(async () => {
    try {
      // Cache key parameters
      const cacheParams = { page, limit, search };
      
      // Use cache wrapper to efficiently cache results
      const result = await withCache(
        () => fetchCompetitorsWithBatching(page, limit, search, context),
        'competitors_list',
        cacheParams,
        COMPETITORS_CACHE_TTL
      );
      
      const responseTime = performance.now() - startTime;
      
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
          ...context,
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
    // TP-028: Use profile-accessible competitors instead of all competitors
    const profileAccessibleCompetitors = await CompetitorMatchingService.getProfileAccessibleCompetitors();
    
    // Filter accessible competitors by search criteria
    const filteredCompetitors = profileAccessibleCompetitors.filter(competitor => {
      if (!search) return true;
      
      const searchLower = search.toLowerCase();
      return (
        competitor.name.toLowerCase().includes(searchLower) ||
        competitor.website.toLowerCase().includes(searchLower) ||
        (competitor.description && competitor.description.toLowerCase().includes(searchLower)) ||
        competitor.industry.toLowerCase().includes(searchLower)
      );
    });
    
    const total = filteredCompetitors.length;
    const paginatedCompetitors = filteredCompetitors.slice(offset, offset + limit);
    
    // Enhance competitors with report/snapshot counts
    const competitors = await Promise.all(
      paginatedCompetitors.map(async (competitor) => {
        const [reportCount, snapshotCount, recentReports, recentSnapshot] = await Promise.all([
          prisma.report.count({ where: { competitorId: competitor.id } }),
          prisma.snapshot.count({ where: { competitorId: competitor.id } }),
          prisma.report.findMany({
            where: { competitorId: competitor.id },
            select: { id: true, name: true, createdAt: true },
            take: 3,
            orderBy: { createdAt: 'desc' }
          }),
          prisma.snapshot.findFirst({
            where: { competitorId: competitor.id },
            select: { id: true, createdAt: true },
            orderBy: { createdAt: 'desc' }
          })
        ]);
        
        return {
          ...competitor,
          _count: { reports: reportCount, snapshots: snapshotCount },
          reports: recentReports,
          snapshots: recentSnapshot ? [recentSnapshot] : []
        };
      })
    );

    // Efficient data transformation
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