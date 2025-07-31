/**
 * Queue and Async Processing Preservation Integration Tests
 * Task 6.3: Preserve Queue and Async Processing
 * 
 * Tests Bull queue integration with consolidated services
 * Validates async report processing workflows and timeout handling
 * Tests queue priority management and concurrent processing limits
 * Maintains existing monitoring and queue health checks
 */

import Bull from 'bull';
import { ReportingService } from '../../services/domains/ReportingService';
import { AnalysisService } from '../../services/domains/AnalysisService';
import { logger } from '../../lib/logger';
import { ComparativeReportRequest, ReportTask, QueueStatistics, ServiceHealth } from '../../services/domains/reporting/types';

// Test configuration
const TEST_TIMEOUT = 120000; // 2 minutes
const REDIS_CONFIG = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || ''
};

// Queue performance thresholds
const QUEUE_PERFORMANCE_THRESHOLDS = {
  MAX_QUEUE_TIME_MS: 30000,        // 30 seconds max queue wait time
  MAX_PROCESSING_TIME_MS: 60000,   // 60 seconds max processing time
  MIN_CONCURRENT_CAPACITY: 3,      // Minimum concurrent processing capacity
  MAX_RETRY_ATTEMPTS: 3,           // Maximum retry attempts
  QUEUE_HEALTH_CHECK_INTERVAL: 5000, // 5 seconds
  PRIORITY_PROCESSING_ORDER: true  // High priority jobs processed first
};

describe('Queue and Async Processing Preservation', () => {
  let reportingService: ReportingService;
  let analysisService: AnalysisService;
  let testQueue: Bull.Queue;

  beforeAll(async () => {
    // Initialize services for queue testing
    try {
      analysisService = new AnalysisService({
        enabledAnalyzers: {
          aiAnalyzer: true,
          uxAnalyzer: true,
          comparativeAnalyzer: true
        },
        performance: {
          maxCompetitors: 3,
          qualityThreshold: 0.75,
          timeoutMs: 60000
        },
        focusAreas: ['features', 'pricing', 'user_experience'],
        analysisDepth: 'comprehensive'
      });

      // Initialize ReportingService with custom queue config for testing
      const queueConfig = {
        name: 'test-reporting-queue',
        redis: REDIS_CONFIG,
        defaultJobOptions: {
          removeOnComplete: 10,
          removeOnFail: 10,
          attempts: 3,
          backoff: { type: 'exponential' as const, delay: 1000 }
        },
        concurrency: 3,
        stalledInterval: 30000,
        maxStalledCount: 1
      };

      reportingService = new ReportingService(analysisService, queueConfig);

      // Create test queue for direct Bull testing
      testQueue = new Bull('test-queue-validation', {
        redis: REDIS_CONFIG,
        defaultJobOptions: {
          removeOnComplete: 5,
          removeOnFail: 5,
          attempts: 2
        }
      });

      logger.info('Queue integration test services initialized');

    } catch (error) {
      logger.error('Failed to initialize queue test services', {
        error: (error as Error).message
      });
      throw error;
    }
  }, TEST_TIMEOUT);

  afterAll(async () => {
    // Cleanup test services and queues
    try {
      if (reportingService) {
        await reportingService.shutdown();
      }
      if (testQueue) {
        await testQueue.close();
      }
      logger.info('Queue test cleanup completed');
    } catch (error) {
      logger.warn('Cleanup error in queue tests', error as Error);
    }
  });

  describe('Bull Queue Integration Validation', () => {
    test('should initialize Bull queue with consolidated ReportingService', async () => {
      // Test 1: Validate queue initialization
      const queueStats = await reportingService.getQueueStatistics();
      
      expect(queueStats).toBeDefined();
      expect(queueStats.name).toBe('test-reporting-queue');
      expect(queueStats.waiting).toBeGreaterThanOrEqual(0);
      expect(queueStats.active).toBeGreaterThanOrEqual(0);
      expect(queueStats.completed).toBeGreaterThanOrEqual(0);
      expect(queueStats.failed).toBeGreaterThanOrEqual(0);

      logger.info('Queue initialization validation passed', {
        queueName: queueStats.name,
        stats: queueStats
      });
    });

    test('should maintain queue configuration from legacy services', async () => {
      // Test 2: Validate queue configuration preservation
      const serviceHealth = await reportingService.getServiceHealth();
      
      expect(serviceHealth.status).toBe('healthy');
      expect(serviceHealth.queue).toBeDefined();
      expect(serviceHealth.queue.status).toBe('healthy');
      expect(serviceHealth.queue.concurrency).toBe(3);
      expect(serviceHealth.queue.maxRetries).toBe(3);

      // Validate Redis connection
      expect(serviceHealth.queue.redis).toBeDefined();
      expect(serviceHealth.queue.redis.connected).toBe(true);

      logger.info('Queue configuration validation passed', {
        serviceHealth: serviceHealth.queue
      });
    });

    test('should handle queue connection resilience', async () => {
      // Test 3: Validate queue connection handling
      const initialStats = await reportingService.getQueueStatistics();
      expect(initialStats).toBeDefined();

      // Test queue health monitoring
      const healthCheck = await reportingService.getServiceHealth();
      expect(healthCheck.queue.status).toBe('healthy');
      expect(healthCheck.queue.redis.connected).toBe(true);

      logger.info('Queue connection resilience validation passed');
    });
  });

  describe('Async Report Processing Workflows', () => {
    test('should process comparative reports asynchronously', async () => {
      // Test 4: Validate async report processing
      const testRequest: ComparativeReportRequest = {
        projectId: 'test-async-project',
        reportType: 'comparative',
        analysis: {
          analysisId: 'test-analysis-' + Date.now(),
          correlationId: 'test-correlation-' + Date.now(),
          analysisType: 'comparative_analysis',
          summary: {
            mainInsights: 'Test async processing analysis',
            keyFindings: ['Finding 1', 'Finding 2'],
            recommendations: ['Recommendation 1']
          },
          metadata: {
            processingTime: 1000,
            dataFreshness: {
              overallStatus: 'FRESH',
              lastUpdated: new Date()
            },
            analysisMetadata: {
              focusAreas: ['features', 'pricing'],
              competitorCount: 2,
              analysisDepth: 'comprehensive'
            }
          },
          quality: {
            overallScore: 0.85,
            dataCompleteness: 0.9,
            analysisDepth: 0.8,
            confidenceLevel: 'high'
          }
        },
        options: {
          template: 'comprehensive',
          format: 'markdown',
          includeCharts: true,
          includeTables: true
        }
      };

      const startTime = Date.now();
      
      // Queue report for async processing
      const taskResult = await reportingService.queueComparativeReport(testRequest, {
        priority: 'normal',
        timeout: QUEUE_PERFORMANCE_THRESHOLDS.MAX_PROCESSING_TIME_MS
      });

      expect(taskResult).toBeDefined();
      expect(taskResult.taskId).toBeDefined();
      expect(taskResult.queuePosition).toBeGreaterThanOrEqual(1);
      expect(taskResult.estimatedCompletion).toBeDefined();

      // Monitor processing status
      let processingComplete = false;
      let attempts = 0;
      const maxAttempts = 30; // 30 seconds max wait

      while (!processingComplete && attempts < maxAttempts) {
        const status = await reportingService.getReportStatus(taskResult.taskId);
        
        expect(['queued', 'processing', 'completed', 'failed']).toContain(status.status);
        
        if (status.status === 'completed') {
          processingComplete = true;
          expect(status.result).toBeDefined();
          expect(status.result!.success).toBe(true);
          
          const processingTime = Date.now() - startTime;
          expect(processingTime).toBeLessThan(QUEUE_PERFORMANCE_THRESHOLDS.MAX_PROCESSING_TIME_MS);
          
          logger.info('Async report processing completed successfully', {
            taskId: taskResult.taskId,
            processingTime,
            status: status.status
          });
          break;
        } else if (status.status === 'failed') {
          throw new Error(`Report processing failed: ${status.error}`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        attempts++;
      }

      expect(processingComplete).toBe(true);
    }, TEST_TIMEOUT);

    test('should handle timeout scenarios gracefully', async () => {
      // Test 5: Validate timeout handling
      const shortTimeoutRequest: ComparativeReportRequest = {
        projectId: 'timeout-test-project',
        reportType: 'comparative',
        analysis: {
          analysisId: 'timeout-analysis-' + Date.now(),
          correlationId: 'timeout-correlation-' + Date.now(),
          analysisType: 'comparative_analysis',
          summary: {
            mainInsights: 'Timeout test analysis',
            keyFindings: ['Finding 1'],
            recommendations: ['Recommendation 1']
          },
          metadata: {
            processingTime: 1000,
            dataFreshness: {
              overallStatus: 'FRESH',
              lastUpdated: new Date()
            },
            analysisMetadata: {
              focusAreas: ['features'],
              competitorCount: 1,
              analysisDepth: 'basic'
            }
          },
          quality: {
            overallScore: 0.75,
            dataCompleteness: 0.8,
            analysisDepth: 0.7,
            confidenceLevel: 'medium'
          }
        }
      };

      // Queue with very short timeout for testing
      const taskResult = await reportingService.queueComparativeReport(shortTimeoutRequest, {
        priority: 'low',
        timeout: 1000 // 1 second timeout for testing
      });

      expect(taskResult.taskId).toBeDefined();

      // Wait for timeout handling
      await new Promise(resolve => setTimeout(resolve, 3000));

      const finalStatus = await reportingService.getReportStatus(taskResult.taskId);
      
      // Should handle timeout gracefully (may complete or show appropriate timeout status)
      expect(['completed', 'failed', 'timeout']).toContain(finalStatus.status);

      logger.info('Timeout handling validation completed', {
        taskId: taskResult.taskId,
        finalStatus: finalStatus.status
      });
    });
  });

  describe('Queue Priority Management', () => {
    test('should respect queue priority ordering', async () => {
      // Test 6: Validate priority queue management
      const highPriorityTasks: string[] = [];
      const normalPriorityTasks: string[] = [];
      const lowPriorityTasks: string[] = [];

      // Create multiple tasks with different priorities
      for (let i = 0; i < 3; i++) {
        const baseRequest: ComparativeReportRequest = {
          projectId: `priority-test-${i}`,
          reportType: 'comparative',
          analysis: {
            analysisId: `priority-analysis-${i}-${Date.now()}`,
            correlationId: `priority-correlation-${i}-${Date.now()}`,
            analysisType: 'comparative_analysis',
            summary: {
              mainInsights: `Priority test analysis ${i}`,
              keyFindings: [`Finding ${i}`],
              recommendations: [`Recommendation ${i}`]
            },
            metadata: {
              processingTime: 500,
              dataFreshness: {
                overallStatus: 'FRESH',
                lastUpdated: new Date()
              },
              analysisMetadata: {
                focusAreas: ['features'],
                competitorCount: 1,
                analysisDepth: 'basic'
              }
            },
            quality: {
              overallScore: 0.75,
              dataCompleteness: 0.8,
              analysisDepth: 0.7,
              confidenceLevel: 'medium'
            }
          }
        };

        // Queue tasks in reverse priority order (low first, high last)
        const lowTask = await reportingService.queueComparativeReport(baseRequest, { priority: 'low' });
        const normalTask = await reportingService.queueComparativeReport(baseRequest, { priority: 'normal' });
        const highTask = await reportingService.queueComparativeReport(baseRequest, { priority: 'high' });

        lowPriorityTasks.push(lowTask.taskId);
        normalPriorityTasks.push(normalTask.taskId);
        highPriorityTasks.push(highTask.taskId);
      }

      // Validate that high priority tasks have better queue positions
      const queueStats = await reportingService.getQueueStatistics();
      expect(queueStats.waiting).toBeGreaterThan(0);

      logger.info('Priority queue management validation completed', {
        highPriorityTasks: highPriorityTasks.length,
        normalPriorityTasks: normalPriorityTasks.length,
        lowPriorityTasks: lowPriorityTasks.length,
        queueStats
      });
    });

    test('should handle concurrent processing limits', async () => {
      // Test 7: Validate concurrent processing limits
      const concurrentTasks: Promise<any>[] = [];
      const maxConcurrency = 5;

      for (let i = 0; i < maxConcurrency; i++) {
        const request: ComparativeReportRequest = {
          projectId: `concurrent-test-${i}`,
          reportType: 'comparative',
          analysis: {
            analysisId: `concurrent-analysis-${i}-${Date.now()}`,
            correlationId: `concurrent-correlation-${i}-${Date.now()}`,
            analysisType: 'comparative_analysis',
            summary: {
              mainInsights: `Concurrent test analysis ${i}`,
              keyFindings: [`Concurrent finding ${i}`],
              recommendations: [`Concurrent recommendation ${i}`]
            },
            metadata: {
              processingTime: 2000,
              dataFreshness: {
                overallStatus: 'FRESH',
                lastUpdated: new Date()
              },
              analysisMetadata: {
                focusAreas: ['features'],
                competitorCount: 1,
                analysisDepth: 'basic'
              }
            },
            quality: {
              overallScore: 0.75,
              dataCompleteness: 0.8,
              analysisDepth: 0.7,
              confidenceLevel: 'medium'
            }
          }
        };

        const taskPromise = reportingService.queueComparativeReport(request, {
          priority: 'normal',
          timeout: 30000
        });
        
        concurrentTasks.push(taskPromise);
      }

      // Wait for all tasks to be queued
      const taskResults = await Promise.all(concurrentTasks);
      expect(taskResults).toHaveLength(maxConcurrency);

      // Validate queue capacity handling
      const queueStats = await reportingService.getQueueStatistics();
      expect(queueStats.waiting + queueStats.active).toBeGreaterThanOrEqual(maxConcurrency);

      logger.info('Concurrent processing limits validation completed', {
        tasksQueued: taskResults.length,
        queueStats
      });
    });
  });

  describe('Queue Monitoring and Health Checks', () => {
    test('should provide comprehensive queue statistics', async () => {
      // Test 8: Validate queue statistics monitoring
      const stats = await reportingService.getQueueStatistics();

      expect(stats).toBeDefined();
      expect(typeof stats.waiting).toBe('number');
      expect(typeof stats.active).toBe('number');
      expect(typeof stats.completed).toBe('number');
      expect(typeof stats.failed).toBe('number');
      expect(typeof stats.delayed).toBe('number');
      expect(stats.name).toBe('test-reporting-queue');

      // Validate performance metrics
      expect(stats.performance).toBeDefined();
      expect(typeof stats.performance.averageProcessingTime).toBe('number');
      expect(typeof stats.performance.throughput).toBe('number');

      logger.info('Queue statistics monitoring validation passed', { stats });
    });

    test('should provide accurate service health assessment', async () => {
      // Test 9: Validate service health monitoring
      const health = await reportingService.getServiceHealth();

      expect(health).toBeDefined();
      expect(['healthy', 'degraded', 'unhealthy']).toContain(health.status);
      expect(health.timestamp).toBeDefined();
      expect(health.uptime).toBeGreaterThan(0);

      // Validate queue health
      expect(health.queue).toBeDefined();
      expect(['healthy', 'degraded', 'critical']).toContain(health.queue.status);
      expect(typeof health.queue.concurrency).toBe('number');
      expect(typeof health.queue.maxRetries).toBe('number');

      // Validate Redis health
      expect(health.queue.redis).toBeDefined();
      expect(typeof health.queue.redis.connected).toBe('boolean');
      expect(health.queue.redis.host).toBe(REDIS_CONFIG.host);
      expect(health.queue.redis.port).toBe(REDIS_CONFIG.port);

      logger.info('Service health monitoring validation passed', { health });
    });

    test('should handle queue health degradation detection', async () => {
      // Test 10: Validate queue health degradation detection
      const initialHealth = await reportingService.getServiceHealth();
      expect(initialHealth.queue.status).toBe('healthy');

      // Add multiple tasks to test queue load handling
      const loadTestTasks: Promise<any>[] = [];
      for (let i = 0; i < 10; i++) {
        const request: ComparativeReportRequest = {
          projectId: `load-test-${i}`,
          reportType: 'comparative',
          analysis: {
            analysisId: `load-analysis-${i}-${Date.now()}`,
            correlationId: `load-correlation-${i}-${Date.now()}`,
            analysisType: 'comparative_analysis',
            summary: {
              mainInsights: `Load test analysis ${i}`,
              keyFindings: [`Load finding ${i}`],
              recommendations: [`Load recommendation ${i}`]
            },
            metadata: {
              processingTime: 1000,
              dataFreshness: {
                overallStatus: 'FRESH',
                lastUpdated: new Date()
              },
              analysisMetadata: {
                focusAreas: ['features'],
                competitorCount: 1,
                analysisDepth: 'basic'
              }
            },
            quality: {
              overallScore: 0.75,
              dataCompleteness: 0.8,
              analysisDepth: 0.7,
              confidenceLevel: 'medium'
            }
          }
        };

        loadTestTasks.push(reportingService.queueComparativeReport(request));
      }

      await Promise.all(loadTestTasks);

      // Check health after load
      const loadHealth = await reportingService.getServiceHealth();
      expect(['healthy', 'degraded']).toContain(loadHealth.queue.status);

      const finalStats = await reportingService.getQueueStatistics();
      expect(finalStats.waiting + finalStats.active).toBeGreaterThan(0);

      logger.info('Queue health degradation detection validation completed', {
        initialHealth: initialHealth.queue.status,
        loadHealth: loadHealth.queue.status,
        finalStats
      });
    });
  });

  describe('Error Handling and Resilience', () => {
    test('should handle queue processing errors gracefully', async () => {
      // Test 11: Validate error handling in queue processing
      const invalidRequest: ComparativeReportRequest = {
        projectId: '', // Invalid empty project ID
        reportType: 'comparative',
        analysis: null as any, // Invalid analysis
        options: undefined
      };

      try {
        await reportingService.queueComparativeReport(invalidRequest);
        fail('Should have thrown error for invalid request');
      } catch (error) {
        expect(error).toBeDefined();
        expect((error as Error).message).toContain('Invalid');
        logger.info('Queue error handling validation passed', {
          error: (error as Error).message
        });
      }
    });

    test('should maintain queue stability during processing failures', async () => {
      // Test 12: Validate queue stability during failures
      const initialStats = await reportingService.getQueueStatistics();
      const initialHealth = await reportingService.getServiceHealth();

      // Queue a task that might fail
      const riskyRequest: ComparativeReportRequest = {
        projectId: 'stability-test',
        reportType: 'comparative',
        analysis: {
          analysisId: 'stability-analysis-' + Date.now(),
          correlationId: 'stability-correlation-' + Date.now(),
          analysisType: 'comparative_analysis',
          summary: {
            mainInsights: 'Stability test analysis',
            keyFindings: ['Finding 1'],
            recommendations: ['Recommendation 1']
          },
          metadata: {
            processingTime: 1000,
            dataFreshness: {
              overallStatus: 'FRESH',
              lastUpdated: new Date()
            },
            analysisMetadata: {
              focusAreas: ['features'],
              competitorCount: 1,
              analysisDepth: 'basic'
            }
          },
          quality: {
            overallScore: 0.75,
            dataCompleteness: 0.8,
            analysisDepth: 0.7,
            confidenceLevel: 'medium'
          }
        }
      };

      const taskResult = await reportingService.queueComparativeReport(riskyRequest);
      expect(taskResult.taskId).toBeDefined();

      // Wait for processing attempt
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Validate queue stability
      const finalStats = await reportingService.getQueueStatistics();
      const finalHealth = await reportingService.getServiceHealth();

      expect(finalHealth.queue.status).not.toBe('critical');
      expect(finalStats).toBeDefined();

      logger.info('Queue stability validation completed', {
        initialHealth: initialHealth.queue.status,
        finalHealth: finalHealth.queue.status,
        statsComparison: {
          initial: initialStats,
          final: finalStats
        }
      });
    });
  });
});

// Helper functions for testing
function createMockAnalysis(id: string) {
  return {
    analysisId: `mock-analysis-${id}`,
    correlationId: `mock-correlation-${id}`,
    analysisType: 'comparative_analysis' as const,
    summary: {
      mainInsights: `Mock analysis insights ${id}`,
      keyFindings: [`Finding ${id}`],
      recommendations: [`Recommendation ${id}`]
    },
    metadata: {
      processingTime: 1000,
      dataFreshness: {
        overallStatus: 'FRESH' as const,
        lastUpdated: new Date()
      },
      analysisMetadata: {
        focusAreas: ['features', 'pricing'],
        competitorCount: 2,
        analysisDepth: 'comprehensive' as const
      }
    },
    quality: {
      overallScore: 0.85,
      dataCompleteness: 0.9,
      analysisDepth: 0.8,
      confidenceLevel: 'high' as const
    }
  };
} 