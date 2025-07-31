/**
 * Next.js Instrumentation Hook
 * Implementation for Task 1.1 - Address Memory Pressure Issues
 * 
 * This file is automatically called by Next.js during application startup
 * and provides an ideal place to initialize memory monitoring
 */

export async function register() {
  // Only run on server side
  if (typeof window === 'undefined') {
    // Dynamic import to avoid bundling client-side
    const { initializeMemoryMonitoring } = await import('./src/lib/monitoring/memoryInitializer');
    
    // Initialize memory monitoring as early as possible
    initializeMemoryMonitoring();
    
    console.log('Task 1.1: Memory monitoring initialized during application startup');
  }
} 