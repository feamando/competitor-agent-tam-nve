/**
 * TP-024 Task 2.4: Server-side Service Initialization
 * 
 * Initializes critical services at application startup to ensure
 * scheduled reports and cron jobs work properly.
 * This replaces the middleware initialization to avoid webpack issues with Puppeteer.
 */

let servicesInitialized = false;
let initializationPromise: Promise<void> | null = null;

/**
 * Initialize critical services that need to run at application startup
 * This should only run on the server side
 */
export async function initializeServices(): Promise<void> {
  // Prevent multiple simultaneous initializations
  if (initializationPromise) {
    return initializationPromise;
  }
  
  if (servicesInitialized) {
    return;
  }
  
  initializationPromise = doInitialization();
  return initializationPromise;
}

async function doInitialization(): Promise<void> {
  try {
    console.log('🚀 TP-024: Initializing critical services at startup...');
    
    // Initialize AutoReportGenerationService to start cron job manager
    // This must be done at startup to ensure scheduled reports work
    const { getAutoReportService } = await import('../services/autoReportGenerationService');
    const autoReportService = getAutoReportService();
    
    console.log('✅ TP-024: AutoReportGenerationService initialized - cron jobs should now work');
    servicesInitialized = true;
    
  } catch (error) {
    console.error('❌ TP-024: Failed to initialize services:', error);
    // Reset the promise so we can retry
    initializationPromise = null;
    throw error;
  }
}

/**
 * Check if services have been initialized
 */
export function areServicesInitialized(): boolean {
  return servicesInitialized;
}

/**
 * Initialize services and catch any errors (for use in API routes)
 * This ensures the first API call triggers service initialization
 */
export async function ensureServicesInitialized(): Promise<void> {
  try {
    await initializeServices();
  } catch (error) {
    console.warn('⚠️ TP-024: Service initialization failed, continuing with request:', error);
    // Don't throw - let the request continue even if initialization fails
    // Services will be retried on next request
  }
} 