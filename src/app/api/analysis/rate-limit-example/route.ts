/**
 * Example API route demonstrating Task 4.2 rate limiting implementation
 * Shows how to apply rate limiting to analysis endpoints
 */

import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit } from '@/middleware/rateLimiting';

/**
 * Example analysis endpoint with rate limiting
 * Demonstrates 3 concurrent requests per user limit with proper queuing
 */
async function analysisHandler(req: NextRequest): Promise<NextResponse> {
  try {
    // Simulate analysis processing
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    return NextResponse.json({
      success: true,
      message: 'Analysis completed successfully',
      timestamp: new Date().toISOString(),
      processingTime: '2000ms'
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Analysis failed', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * Report generation endpoint with rate limiting
 * Uses longer cooldown period for large requests
 */
async function reportHandler(req: NextRequest): Promise<NextResponse> {
  try {
    // Simulate report generation (longer process)
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    return NextResponse.json({
      success: true,
      message: 'Report generated successfully',
      timestamp: new Date().toISOString(),
      processingTime: '5000ms'
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Report generation failed', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// Apply rate limiting middleware to handlers
export const GET = withRateLimit('analysis', 'normal')(analysisHandler);
export const POST = withRateLimit('report_generation', 'high')(reportHandler); 