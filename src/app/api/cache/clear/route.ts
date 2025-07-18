import { NextRequest, NextResponse } from 'next/server';
import { cacheService } from '@/lib/cache';
import { generateCorrelationId, logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  const correlationId = generateCorrelationId();
  
  try {
    logger.info('Cache clear requested', { correlationId });
    
    // Clear all cache entries
    cacheService.clear();
    
    logger.info('Cache cleared successfully', { correlationId });
    
    return NextResponse.json({
      success: true,
      message: 'Cache cleared successfully',
      timestamp: new Date().toISOString(),
      correlationId
    });
    
  } catch (error) {
    logger.error('Failed to clear cache', error as Error, { correlationId });
    
    return NextResponse.json({
      success: false,
      error: 'Failed to clear cache',
      correlationId
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const correlationId = generateCorrelationId();
  
  try {
    // Get cache statistics
    const cacheStats = {
      size: cacheService.size(),
      timestamp: new Date().toISOString(),
      correlationId
    };
    
    return NextResponse.json({
      success: true,
      cache: cacheStats
    });
    
  } catch (error) {
    logger.error('Failed to get cache stats', error as Error, { correlationId });
    
    return NextResponse.json({
      success: false,
      error: 'Failed to get cache stats',
      correlationId
    }, { status: 500 });
  }
} 