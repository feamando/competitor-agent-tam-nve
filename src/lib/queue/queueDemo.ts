import { aiRequestQueue } from './aiRequestQueue';
import { queueManager } from './queueManager';
import { logger } from '@/lib/logger';

/**
 * Demo script to test AI request queue functionality
 * This can be used to verify the queue is working properly
 */
export async function demonstrateQueueUsage() {
  logger.info('Starting AI request queue demonstration');

  // Start queue monitoring
  queueManager.startMonitoring(30000); // Monitor every 30 seconds

  try {
    // Simulate multiple AI requests being queued
    const requests = [
      { type: 'analysis' as const, priority: 'high' as const, duration: 5000 },
      { type: 'report' as const, priority: 'normal' as const, duration: 8000 },
      { type: 'chat' as const, priority: 'low' as const, duration: 2000 },
      { type: 'analysis' as const, priority: 'high' as const, duration: 6000 },
      { type: 'report' as const, priority: 'normal' as const, duration: 4000 },
    ];

    logger.info('Queueing multiple AI requests for demonstration', {
      requestCount: requests.length,
      types: requests.map(r => r.type)
    });

    // Queue all requests simultaneously to test concurrency control
    const results = await Promise.all(
      requests.map(async (request, index) => {
        return aiRequestQueue.enqueue(
          async () => {
            // Simulate AI processing time
            logger.info(`Simulating ${request.type} request processing`, {
              requestIndex: index,
              duration: request.duration
            });
            
            await new Promise(resolve => setTimeout(resolve, request.duration));
            
            return `Result for ${request.type} request ${index}`;
          },
          {
            type: request.type,
            priority: request.priority,
            timeout: 15000 // 15 second timeout
          }
        );
      })
    );

    logger.info('All AI requests completed successfully', {
      resultCount: results.length,
      results: results.slice(0, 3) // Log first 3 results
    });

    // Get final queue statistics
    const finalStats = aiRequestQueue.getDetailedStatus();
    logger.info('Final queue statistics', finalStats);

    // Perform health check
    const healthCheck = queueManager.performHealthCheck();
    logger.info('Queue health check results', {
      isHealthy: healthCheck.isHealthy,
      issues: healthCheck.issues,
      recommendations: healthCheck.recommendations
    });

  } catch (error) {
    logger.error('AI request queue demonstration failed', error as Error);
    throw error;
  } finally {
    // Stop monitoring
    queueManager.stopMonitoring();
    logger.info('AI request queue demonstration completed');
  }
}

/**
 * Test queue overflow handling
 */
export async function testQueueOverflow() {
  logger.info('Testing queue overflow handling');

  try {
    // Attempt to queue more requests than the limit allows
    const overflowRequests = Array.from({ length: 55 }, (_, index) => ({
      index,
      type: 'analysis' as const,
      priority: 'normal' as const
    }));

    const results = await Promise.allSettled(
      overflowRequests.map(async (request) => {
        return aiRequestQueue.enqueue(
          async () => {
            await new Promise(resolve => setTimeout(resolve, 1000));
            return `Overflow test result ${request.index}`;
          },
          {
            type: request.type,
            priority: request.priority
          }
        );
      })
    );

    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    logger.info('Queue overflow test completed', {
      totalRequests: overflowRequests.length,
      successful,
      failed,
      expectedToFail: overflowRequests.length > 50 // Queue limit is 50
    });

  } catch (error) {
    logger.error('Queue overflow test failed', error as Error);
    throw error;
  }
}

/**
 * Test queue performance under load
 */
export async function testQueuePerformance() {
  logger.info('Testing queue performance under load');

  const startTime = Date.now();
  const requestCount = 20;

  try {
    const requests = Array.from({ length: requestCount }, (_, index) => ({
      index,
      type: 'analysis' as const,
      priority: index % 3 === 0 ? 'high' as const : 'normal' as const,
      duration: Math.random() * 3000 + 1000 // 1-4 second processing time
    }));

    const results = await Promise.all(
      requests.map(async (request) => {
        const requestStart = Date.now();
        
        const result = await aiRequestQueue.enqueue(
          async () => {
            await new Promise(resolve => setTimeout(resolve, request.duration));
            return {
              index: request.index,
              processingTime: request.duration,
              totalTime: Date.now() - requestStart
            };
          },
          {
            type: request.type,
            priority: request.priority
          }
        );

        return result;
      })
    );

    const totalTime = Date.now() - startTime;
    const avgWaitTime = results.reduce((sum, r) => sum + (r.totalTime - r.processingTime), 0) / results.length;
    const avgProcessingTime = results.reduce((sum, r) => sum + r.processingTime, 0) / results.length;

    logger.info('Queue performance test completed', {
      requestCount,
      totalTime,
      avgWaitTime: Math.round(avgWaitTime),
      avgProcessingTime: Math.round(avgProcessingTime),
      throughput: Math.round((requestCount / totalTime) * 1000 * 60), // requests per minute
      queueStats: aiRequestQueue.getStats()
    });

  } catch (error) {
    logger.error('Queue performance test failed', error as Error);
    throw error;
  }
}

// Export functions for testing
export const queueTests = {
  demonstrateQueueUsage,
  testQueueOverflow,
  testQueuePerformance
}; 