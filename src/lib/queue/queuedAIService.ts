import { BedrockService } from '@/services/bedrock/bedrock.service';
import { BedrockMessage } from '@/services/bedrock/types';
import { aiRequestQueue } from './aiRequestQueue';
import { logger, generateCorrelationId } from '@/lib/logger';

export interface QueuedAIRequestOptions {
  type: 'analysis' | 'report' | 'chat';
  priority?: 'low' | 'normal' | 'high';
  timeout?: number;
  correlationId?: string;
  context?: Record<string, any>;
}

/**
 * Queued AI Service wrapper that manages AI requests through the queue system
 * This prevents memory overload by controlling concurrent AI operations
 */
export class QueuedAIService {
  private bedrockService: BedrockService;

  constructor(bedrockService: BedrockService) {
    this.bedrockService = bedrockService;
  }

  /**
   * Generate AI completion through the queue system
   */
  async generateCompletion(
    messages: BedrockMessage[],
    options: QueuedAIRequestOptions
  ): Promise<string> {
    const correlationId = options.correlationId || generateCorrelationId();
    
    logger.info('Queuing AI completion request', {
      correlationId,
      type: options.type,
      priority: options.priority || 'normal',
      messagesCount: messages.length,
      context: options.context
    });

    try {
      // Queue the AI request to prevent memory overload
      const result = await aiRequestQueue.enqueue(
        async () => {
          logger.debug('Processing AI completion request', {
            correlationId,
            type: options.type,
            messagesCount: messages.length
          });

          // Execute the actual Bedrock call
          return await this.bedrockService.generateCompletion(messages);
        },
                 {
           type: options.type,
           priority: options.priority || 'normal',
           correlationId,
           ...(options.timeout && { timeout: options.timeout })
         }
      );

      logger.info('AI completion request completed successfully', {
        correlationId,
        type: options.type,
        responseLength: result?.length || 0
      });

      return result;
    } catch (error) {
      logger.error('AI completion request failed', error as Error, {
        correlationId,
        type: options.type,
        messagesCount: messages.length,
        context: options.context
      });
      throw error;
    }
  }

  /**
   * Generate analysis with automatic queuing and memory management
   */
  async generateAnalysis(
    prompt: string,
    options: Omit<QueuedAIRequestOptions, 'type'> & { 
      analysisType?: 'competitive' | 'ux' | 'comprehensive' 
    }
  ): Promise<string> {
    const messages: BedrockMessage[] = [
      {
        role: 'user',
        content: [{ type: 'text', text: prompt }]
      }
    ];

    return this.generateCompletion(messages, {
      ...options,
      type: 'analysis',
      context: {
        ...options.context,
        analysisType: options.analysisType || 'competitive',
        promptLength: prompt.length
      }
    });
  }

  /**
   * Generate report with specific optimizations for large data processing
   */
  async generateReport(
    reportPrompt: string,
    options: Omit<QueuedAIRequestOptions, 'type'> & {
      reportType?: 'comprehensive' | 'summary' | 'comparative';
      dataSize?: number;
    }
  ): Promise<string> {
    const messages: BedrockMessage[] = [
      {
        role: 'user',
        content: [{ type: 'text', text: reportPrompt }]
      }
    ];

    // Use high priority for reports and extended timeout for large data
    const reportOptions: QueuedAIRequestOptions = {
      ...options,
      type: 'report',
      priority: options.priority || 'high',
      timeout: options.timeout || (options.dataSize && options.dataSize > 100000 ? 180000 : 120000), // 3min for large data
      context: {
        ...options.context,
        reportType: options.reportType || 'comprehensive',
        promptLength: reportPrompt.length,
        dataSize: options.dataSize
      }
    };

    return this.generateCompletion(messages, reportOptions);
  }

  /**
   * Generate chat response with lower priority to not block analysis/reports
   */
  async generateChatResponse(
    messages: BedrockMessage[],
    options: Omit<QueuedAIRequestOptions, 'type'> = {}
  ): Promise<string> {
    return this.generateCompletion(messages, {
      ...options,
      type: 'chat',
      priority: options.priority || 'low', // Chat has lower priority
      timeout: options.timeout || 60000 // 1 minute timeout for chat
    });
  }

  /**
   * Batch process multiple AI requests with automatic queuing
   */
  async batchGenerate<T>(
    requests: Array<{
      taskFn: () => Promise<T>;
      options: QueuedAIRequestOptions;
    }>
  ): Promise<T[]> {
    const correlationId = generateCorrelationId();
    
    logger.info('Starting batch AI request processing', {
      correlationId,
      batchSize: requests.length,
      requestTypes: requests.map(r => r.options.type)
    });

    try {
      // Process all requests through the queue
      const results = await Promise.all(
        requests.map(async (request, index) => {
          const requestCorrelationId = `${correlationId}-batch-${index}`;
          
                     return aiRequestQueue.enqueue(
             request.taskFn,
             {
               type: request.options.type,
               priority: request.options.priority || 'normal',
               correlationId: requestCorrelationId,
               ...(request.options.timeout && { timeout: request.options.timeout })
             }
           );
        })
      );

      logger.info('Batch AI request processing completed', {
        correlationId,
        batchSize: requests.length,
        successCount: results.length
      });

      return results;
    } catch (error) {
      logger.error('Batch AI request processing failed', error as Error, {
        correlationId,
        batchSize: requests.length
      });
      throw error;
    }
  }

  /**
   * Get queue statistics for monitoring
   */
  getQueueStats() {
    return aiRequestQueue.getStats();
  }

  /**
   * Get detailed queue status
   */
  getQueueStatus() {
    return aiRequestQueue.getDetailedStatus();
  }
}

/**
 * Factory function to create a queued AI service
 */
export async function createQueuedAIService(): Promise<QueuedAIService> {
  const bedrockService = await BedrockService.createWithStoredCredentials();
  return new QueuedAIService(bedrockService);
}

/**
 * Singleton instance for application-wide use
 */
let queuedAIServiceInstance: QueuedAIService | null = null;

export async function getQueuedAIService(): Promise<QueuedAIService> {
  if (!queuedAIServiceInstance) {
    queuedAIServiceInstance = await createQueuedAIService();
  }
  return queuedAIServiceInstance;
} 