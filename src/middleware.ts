import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// TP-024 Task 2.4: Initialize services at application startup
let servicesInitialized = false;

async function initializeServices() {
  if (servicesInitialized) return;
  
  try {
    console.log('🚀 TP-024: Initializing critical services at startup...');
    
    // Initialize AutoReportGenerationService to start cron job manager
    const { getAutoReportService } = await import('./services/autoReportGenerationService');
    const autoReportService = getAutoReportService();
    
    console.log('✅ TP-024: AutoReportGenerationService initialized - cron jobs should now work');
    servicesInitialized = true;
    
  } catch (error) {
    console.error('❌ TP-024: Failed to initialize services:', error);
    // Don't set servicesInitialized = true so we can retry on next request
  }
}

export async function middleware(request: NextRequest) {
  // TP-024 Task 2.4: Initialize services on first request
  if (!servicesInitialized) {
    await initializeServices();
  }
  
  // Authentication disabled - all routes are now public
  // const path = request.nextUrl.pathname
  // const isPublicPath = path === '/auth/signin' || path === '/api/chat'
  // const mockUser = request.cookies.get('mockUser')?.value
  
  // if (path === '/auth/signin' && mockUser) {
  //   return NextResponse.redirect(new URL('/dashboard', request.url))
  // }
  
  // if (!isPublicPath && !mockUser) {
  //   return NextResponse.redirect(new URL('/auth/signin', request.url))
  // }
  
  // Allow all requests through without authentication
  return NextResponse.next()
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/projects/:path*',
    '/competitors/:path*',
    '/reports/:path*',
    '/api/:path*',
    '/auth/signin',
  ],
} 