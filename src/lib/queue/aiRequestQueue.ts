import PQueue from 'p-queue';
import { logger, generateCorrelationId } from '@/lib/logger';
import { BedrockMessage } from '@/services/bedrock/types';

export interface AIRequestTask {
  id: string;
  correlationId: string;
  type: 'analysis' | 'report' | 'chat';
  priority: 'low' | 'normal' | 'high';
  createdAt: Date;
  timeout?: number;
}

export interface AIQueueStats {
  pending: number;
  running: number;
  completed: number;
  failed: number;
  totalProcessed: number;
  averageProcessingTime: number;
  queueHealth: 'healthy' | 'degraded' | 'critical';
}

export class AIRequestQueue {
  private static instance: AIRequestQueue;
  private queue: PQueue;
  private stats: AIQueueStats;
  private processingTimes: number[] = [];
  private maxProcessingTimes = 100; // Keep last 100 processing times for average
  private readonly MAX_CONCURRENT = 3; // Max 3 concurrent AI requests
  private readonly DEFAULT_TIMEOUT = 120000; // 2 minutes in milliseconds
  private readonly MAX_QUEUE_SIZE = 50; // Prevent queue overflow

  private constructor() {
    this.queue = new PQueue({
      concurrency: this.MAX_CONCURRENT,
      timeout: this.DEFAULT_TIMEOUT,
      throwOnTimeout: true,
    });

    this.stats = {
      pending: 0,
      running: 0,
      completed: 0,
      failed: 0,
      totalProcessed: 0,
      averageProcessingTime: 0,
      queueHealth: 'healthy'
    };

    this.setupEventListeners();
    this.startHealthMonitoring();

    logger.info('AI Request Queue initialized', {
      maxConcurrent: this.MAX_CONCURRENT,
      defaultTimeout: this.DEFAULT_TIMEOUT,
      maxQueueSize: this.MAX_QUEUE_SIZE
    });
  }

  public static getInstance(): AIRequestQueue {
    if (!AIRequestQueue.instance) {
      AIRequestQueue.instance = new AIRequestQueue();
    }
    return AIRequestQueue.instance;
  }

  /**
   * Add an AI request to the queue
   */
  public async enqueue<T>(
    taskFn: () => Promise<T>,
    taskInfo: Omit<AIRequestTask, 'id' | 'createdAt' | 'correlationId'> & { correlationId?: string }
  ): Promise<T> {
    const correlationId = taskInfo.correlationId || generateCorrelationId();
    const taskId = `${taskInfo.type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const task: AIRequestTask = {
      id: taskId,
      correlationId,
      type: taskInfo.type,
      priority: taskInfo.priority || 'normal',
      createdAt: new Date(),
      timeout: taskInfo.timeout || this.DEFAULT_TIMEOUT
    };

    // Check queue size to prevent memory overflow
    if (this.queue.size >= this.MAX_QUEUE_SIZE) {
      const error = new Error(`AI request queue is full (${this.MAX_QUEUE_SIZE} requests). Please try again later.`);
      logger.error('AI request queue overflow', error, {
        correlationId,
        taskId,
        queueSize: this.queue.size,
        maxQueueSize: this.MAX_QUEUE_SIZE
      });
      throw error;
    }

    logger.info('AI request enqueued', {
      correlationId,
      taskId,
      type: task.type,
      priority: task.priority,
      queueSize: this.queue.size + 1,
      pendingTasks: this.queue.pending
    });

    this.stats.pending++;

    try {
      const startTime = Date.now();
      
                    // Add task to queue with appropriate priority
       const result = await this.queue.add(
         async (): Promise<T> => {
           this.stats.running++;
           this.stats.pending--;
           
           logger.info('AI request processing started', {
             correlationId,
             taskId,
             type: task.type,
             waitTime: Date.now() - startTime
           });

           try {
             const result = await taskFn();
             
             const processingTime = Date.now() - startTime;
             this.recordProcessingTime(processingTime);
             
             this.stats.running--;
             this.stats.completed++;
             this.stats.totalProcessed++;

             logger.info('AI request completed successfully', {
               correlationId,
               taskId,
               type: task.type,
               processingTime,
               totalProcessed: this.stats.totalProcessed
             });

             return result;
           } catch (error) {
             this.stats.running--;
             this.stats.failed++;
             this.stats.totalProcessed++;

             logger.error('AI request processing failed', error as Error, {
               correlationId,
               taskId,
               type: task.type,
               processingTime: Date.now() - startTime
             });

             throw error;
           }
         },
         {
           priority: this.getPriorityWeight(task.priority),
           ...(task.timeout && { timeout: task.timeout })
         }
       ) as T;

      return result;
    } catch (error) {
      // Handle queue-level errors (timeout, etc.)
      if (this.stats.pending > 0) this.stats.pending--;
      this.stats.failed++;
      this.stats.totalProcessed++;

      logger.error('AI request queue error', error as Error, {
        correlationId,
        taskId,
        type: task.type,
        queueSize: this.queue.size
      });

      throw error;
    }
  }

  /**
   * Get current queue statistics
   */
  public getStats(): AIQueueStats {
    return {
      ...this.stats,
      pending: this.queue.pending,
      running: this.queue.size - this.queue.pending,
      queueHealth: this.assessQueueHealth()
    };
  }

  /**
   * Get detailed queue status for monitoring
   */
  public getDetailedStatus() {
    const stats = this.getStats();
    return {
      ...stats,
      concurrency: this.MAX_CONCURRENT,
      maxQueueSize: this.MAX_QUEUE_SIZE,
      defaultTimeout: this.DEFAULT_TIMEOUT,
      queueSize: this.queue.size,
      isPaused: this.queue.isPaused,
      timeouts: {
        active: this.queue.timeout,
        configured: this.DEFAULT_TIMEOUT
      }
    };
  }

  /**
   * Pause the queue (for emergency situations)
   */
  public pause(): void {
    this.queue.pause();
    logger.warn('AI request queue paused', {
      reason: 'manual_pause',
      queueSize: this.queue.size,
      pendingTasks: this.queue.pending
    });
  }

  /**
   * Resume the queue
   */
  public resume(): void {
    this.queue.start();
    logger.info('AI request queue resumed', {
      queueSize: this.queue.size,
      pendingTasks: this.queue.pending
    });
  }

  /**
   * Clear all pending requests (emergency use only)
   */
  public clear(): void {
    const clearedCount = this.queue.size;
    this.queue.clear();
    this.stats.failed += clearedCount;
    
    logger.warn('AI request queue cleared', {
      reason: 'emergency_clear',
      clearedRequests: clearedCount
    });
  }

  private setupEventListeners(): void {
    this.queue.on('add', () => {
      logger.debug('Task added to AI queue', {
        queueSize: this.queue.size,
        pending: this.queue.pending
      });
    });

    this.queue.on('next', () => {
      logger.debug('Processing next AI task', {
        queueSize: this.queue.size,
        pending: this.queue.pending
      });
    });

    this.queue.on('idle', () => {
      logger.info('AI request queue is idle', {
        totalProcessed: this.stats.totalProcessed,
        completed: this.stats.completed,
        failed: this.stats.failed
      });
    });

    this.queue.on('error', (error) => {
      logger.error('AI request queue error', error, {
        queueSize: this.queue.size,
        pending: this.queue.pending,
        running: this.stats.running
      });
    });
  }

  private startHealthMonitoring(): void {
    // Check queue health every 30 seconds
    setInterval(() => {
      const health = this.assessQueueHealth();
      const stats = this.getStats();

      if (health !== 'healthy') {
        logger.warn('AI request queue health degraded', {
          health,
          stats,
          queueSize: this.queue.size,
          averageProcessingTime: this.stats.averageProcessingTime
        });
      }

      // Log stats periodically for monitoring
      if (this.stats.totalProcessed > 0 && this.stats.totalProcessed % 10 === 0) {
        logger.info('AI request queue periodic stats', {
          ...stats,
          queueSize: this.queue.size
        });
      }
    }, 30000);
  }

  private recordProcessingTime(time: number): void {
    this.processingTimes.push(time);
    
    // Keep only the last N processing times to prevent memory growth
    if (this.processingTimes.length > this.maxProcessingTimes) {
      this.processingTimes = this.processingTimes.slice(-this.maxProcessingTimes);
    }

    // Update average processing time
    this.stats.averageProcessingTime = 
      this.processingTimes.reduce((sum, time) => sum + time, 0) / this.processingTimes.length;
  }

  private getPriorityWeight(priority: AIRequestTask['priority']): number {
    switch (priority) {
      case 'high': return 10;
      case 'normal': return 5;
      case 'low': return 1;
      default: return 5;
    }
  }

  private assessQueueHealth(): AIQueueStats['queueHealth'] {
    const stats = this.getStats();
    const avgProcessingTime = this.stats.averageProcessingTime;
    const failureRate = stats.totalProcessed > 0 ? stats.failed / stats.totalProcessed : 0;

    // Critical: High failure rate or very long processing times
    if (failureRate > 0.5 || avgProcessingTime > 180000) { // 3 minutes
      return 'critical';
    }

    // Degraded: Moderate failure rate or long processing times or large queue
    if (failureRate > 0.2 || avgProcessingTime > 90000 || this.queue.size > 30) { // 1.5 minutes
      return 'degraded';
    }

    return 'healthy';
  }
}

// Export singleton instance
export const aiRequestQueue = AIRequestQueue.getInstance(); 