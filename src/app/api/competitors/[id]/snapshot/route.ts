import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { WebsiteScraper } from '@/lib/scraper';

// Default mock user for testing without authentication
const DEFAULT_USER_EMAIL = 'mock@example.com';

async function getOrCreateMockUser() {
  let mockUser = await prisma.user.findFirst({
    where: { email: DEFAULT_USER_EMAIL }
  });
  
  if (!mockUser) {
    mockUser = await prisma.user.create({
      data: {
        email: DEFAULT_USER_EMAIL,
        name: 'Mock User'
      }
    });
  }
  return mockUser;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // Always use mock user (auth disabled)
    const mockUser = await getOrCreateMockUser();

    // Get the competitor
    const competitor = await prisma.competitor.findFirst({
      where: {
        id: (await context.params).id,
      },
    });

    if (!competitor) {
      return new NextResponse('Competitor not found', { status: 404 });
    }

    // Take a snapshot
    const scraper = new WebsiteScraper();
    try {
      const snapshot = await scraper.takeSnapshot(competitor.website);

      // Store the snapshot in the database with comprehensive logging
      console.log('📊 Creating snapshot record in database', {
        competitorId: competitor.id,
        competitorName: competitor.name,
        snapshotSize: JSON.stringify(snapshot).length,
        hasContent: !!(snapshot.html && snapshot.text),
        statusCode: snapshot.metadata?.statusCode,
        timestamp: snapshot.timestamp
      });

      const savedSnapshot = await prisma.snapshot.create({
        data: {
          competitorId: competitor.id,
          metadata: JSON.parse(JSON.stringify(snapshot)),
          captureStartTime: new Date(),
          captureEndTime: new Date(),
          captureSuccess: true,
          captureSize: JSON.stringify(snapshot).length
        },
      });

      console.log('✅ Snapshot saved successfully', {
        snapshotId: savedSnapshot.id,
        competitorId: competitor.id,
        competitorName: competitor.name,
        createdAt: savedSnapshot.createdAt,
        metadataSize: JSON.stringify(savedSnapshot.metadata).length
      });

      return NextResponse.json(savedSnapshot);
    } finally {
      await scraper.close();
    }
  } catch (error) {
    console.error('❌ Error taking snapshot:', error, {
      competitorId: (await context.params).id,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString()
    });

    // Log failed snapshot attempt to database if possible
    try {
      const competitor = await prisma.competitor.findFirst({
        where: { id: (await context.params).id },
        select: { id: true, name: true }
      });

      if (competitor) {
        await prisma.snapshot.create({
          data: {
            competitorId: competitor.id,
            metadata: {
              error: error instanceof Error ? error.message : String(error),
              status: 'failed',
              timestamp: new Date(),
              errorType: error instanceof Error ? error.constructor.name : 'unknown'
            },
            captureStartTime: new Date(),
            captureSuccess: false,
            errorMessage: error instanceof Error ? error.message : String(error)
          }
        });

        console.log('📝 Failed snapshot attempt logged to database', {
          competitorId: competitor.id,
          competitorName: competitor.name,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    } catch (dbError) {
      console.error('Failed to log error snapshot to database:', dbError);
    }

    return new NextResponse('Internal Server Error', { status: 500 });
  }
} 