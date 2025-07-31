import { logger } from '../logger';

// Streaming processor configuration
export const STREAMING_CONFIG = {
  BATCH_SIZE: 100,
  MAX_MEMORY_MB: 200,
  CLEANUP_INTERVAL_MS: 1000,
  MAX_RETRIES: 3
} as const;

/**
 * Streaming data processor for large datasets
 */
export class StreamingDataProcessor {
  private currentMemoryUsage = 0;
  private processedBatches = 0;
  private startTime = Date.now();
  private isProcessing = false;

  /**
   * Process large dataset in streaming fashion
   */
  async *streamProcess<T, R>(
    data: T[],
    processor: (batch: T[], batchIndex: number) => Promise<R[]>,
    options?: {
      batchSize?: number;
      maxMemoryMB?: number;
      onProgress?: (progress: { processed: number; total: number; memoryMB: number }) => void;
    }
  ): AsyncGenerator<R[], void, unknown> {
    const batchSize = options?.batchSize || STREAMING_CONFIG.BATCH_SIZE;
    const maxMemoryMB = options?.maxMemoryMB || STREAMING_CONFIG.MAX_MEMORY_MB;
    
    this.isProcessing = true;
    this.startTime = Date.now();
    
    logger.info('Starting streaming data processing', {
      totalItems: data.length,
      batchSize,
      maxMemoryMB,
      estimatedBatches: Math.ceil(data.length / batchSize)
    });

    try {
      for (let i = 0; i < data.length; i += batchSize) {
        // Check memory usage before processing batch
        const memoryUsage = this.getMemoryUsageMB();
        
        if (memoryUsage > maxMemoryMB) {
          logger.warn('Memory limit approached, forcing cleanup', {
            currentMemoryMB: memoryUsage,
            maxMemoryMB,
            batchIndex: Math.floor(i / batchSize)
          });
          
          await this.forceCleanup();
          
          // Check again after cleanup
          const postCleanupMemory = this.getMemoryUsageMB();
          if (postCleanupMemory > maxMemoryMB) {
            throw new Error(`Memory usage (${postCleanupMemory}MB) exceeds limit (${maxMemoryMB}MB) even after cleanup`);
          }
        }

        // Process batch
        const batch = data.slice(i, i + batchSize);
        const batchIndex = Math.floor(i / batchSize);
        
        logger.debug('Processing batch', {
          batchIndex,
          batchSize: batch.length,
          memoryMB: memoryUsage
        });

        const result = await this.processBatchWithRetry(batch, batchIndex, processor);
        
        this.processedBatches++;
        
        // Report progress
        if (options?.onProgress) {
          options.onProgress({
            processed: Math.min(i + batchSize, data.length),
            total: data.length,
            memoryMB: this.getMemoryUsageMB()
          });
        }
        
        yield result;
        
        // Cleanup after each batch
        await this.cleanupBatch();
      }

      const processingTime = Date.now() - this.startTime;
      logger.info('Streaming data processing completed', {
        totalBatches: this.processedBatches,
        processingTimeMs: processingTime,
        finalMemoryMB: this.getMemoryUsageMB()
      });

    } finally {
      this.isProcessing = false;
      await this.finalCleanup();
    }
  }

  /**
   * Process batch with retry logic
   */
  private async processBatchWithRetry<T, R>(
    batch: T[],
    batchIndex: number,
    processor: (batch: T[], batchIndex: number) => Promise<R[]>
  ): Promise<R[]> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= STREAMING_CONFIG.MAX_RETRIES; attempt++) {
      try {
        return await processor(batch, batchIndex);
      } catch (error) {
        lastError = error as Error;
        
        logger.warn('Batch processing failed, retrying', {
          batchIndex,
          attempt,
          maxRetries: STREAMING_CONFIG.MAX_RETRIES,
          error: lastError.message
        });
        
        if (attempt < STREAMING_CONFIG.MAX_RETRIES) {
          // Exponential backoff
          await this.delay(Math.pow(2, attempt) * 1000);
          
          // Force cleanup before retry
          await this.forceCleanup();
        }
      }
    }
    
    // If all retries failed, log error and return empty result
    logger.error('Batch processing failed after all retries', lastError!, {
      batchIndex,
      attempts: STREAMING_CONFIG.MAX_RETRIES
    });
    
    return [];
  }

  /**
   * Selective serialization to avoid large JSON.stringify operations
   */
  static selectiveSerialize(
    obj: any,
    options?: {
      maxDepth?: number;
      maxStringLength?: number;
      includeFields?: string[];
      excludeFields?: string[];
    }
  ): string {
    const maxDepth = options?.maxDepth || 3;
    const maxStringLength = options?.maxStringLength || 1000;
    const includeFields = options?.includeFields;
    const excludeFields = options?.excludeFields || [];

    const serialized = this.serializeSelective(obj, 0, maxDepth, maxStringLength, includeFields, excludeFields);
    
    try {
      return JSON.stringify(serialized);
    } catch (error) {
      logger.error('Selective serialization failed', error as Error);
      return JSON.stringify({ error: 'Serialization failed', type: typeof obj });
    }
  }

  private static serializeSelective(
    obj: any,
    currentDepth: number,
    maxDepth: number,
    maxStringLength: number,
    includeFields?: string[],
    excludeFields?: string[]
  ): any {
    if (currentDepth >= maxDepth) {
      return '[Max depth reached]';
    }

    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj === 'string') {
      return obj.length > maxStringLength 
        ? obj.substring(0, maxStringLength) + '[...truncated]'
        : obj;
    }

    if (typeof obj === 'number' || typeof obj === 'boolean') {
      return obj;
    }

    if (Array.isArray(obj)) {
      // Limit array size to prevent memory bloat
      const limitedArray = obj.slice(0, 100);
      return limitedArray.map(item => 
        this.serializeSelective(item, currentDepth + 1, maxDepth, maxStringLength, includeFields, excludeFields)
      );
    }

    if (typeof obj === 'object') {
      const result: any = {};
      
             for (const [key, value] of Object.entries(obj)) {
         // Skip excluded fields
         if (excludeFields && excludeFields.includes(key)) {
           continue;
         }
         
         // If includeFields is specified, only include those fields
         if (includeFields && !includeFields.includes(key)) {
           continue;
         }
        
        result[key] = this.serializeSelective(
          value,
          currentDepth + 1,
          maxDepth,
          maxStringLength,
          includeFields,
          excludeFields
        );
      }
      
      return result;
    }

    return String(obj);
  }

  /**
   * Memory-conscious data chunking
   */
  static createMemoryEfficientChunks<T>(
    data: T[],
    options?: {
      maxChunkSizeMB?: number;
      estimateItemSize?: (item: T) => number;
      minChunkSize?: number;
      maxChunkSize?: number;
    }
  ): T[][] {
    const maxChunkSizeMB = options?.maxChunkSizeMB || 10;
    const maxChunkSizeBytes = maxChunkSizeMB * 1024 * 1024;
    const minChunkSize = options?.minChunkSize || 1;
    const maxChunkSize = options?.maxChunkSize || 1000;
    
    const estimateItemSize = options?.estimateItemSize || ((item: T) => {
      try {
        return JSON.stringify(item).length;
      } catch {
        return 1000; // Default estimate
      }
    });

    const chunks: T[][] = [];
    let currentChunk: T[] = [];
    let currentChunkSize = 0;

    for (const item of data) {
      const itemSize = estimateItemSize(item);
      
      // Check if adding this item would exceed size limit
      if (currentChunkSize + itemSize > maxChunkSizeBytes && currentChunk.length >= minChunkSize) {
        chunks.push(currentChunk);
        currentChunk = [];
        currentChunkSize = 0;
      }
      
      currentChunk.push(item);
      currentChunkSize += itemSize;
      
      // Check if chunk has reached max size by count
      if (currentChunk.length >= maxChunkSize) {
        chunks.push(currentChunk);
        currentChunk = [];
        currentChunkSize = 0;
      }
    }

    // Add remaining items
    if (currentChunk.length > 0) {
      chunks.push(currentChunk);
    }

    logger.info('Created memory-efficient chunks', {
      totalItems: data.length,
      chunksCreated: chunks.length,
      avgChunkSize: Math.round(data.length / chunks.length),
      maxChunkSizeMB
    });

    return chunks;
  }

  /**
   * Memory usage monitoring
   */
  private getMemoryUsageMB(): number {
    try {
      const usage = process.memoryUsage();
      return Math.round(usage.heapUsed / 1024 / 1024);
    } catch {
      return 0;
    }
  }

  /**
   * Cleanup operations
   */
  private async cleanupBatch(): Promise<void> {
    // Small delay to allow GC
    await this.delay(10);
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
  }

  private async forceCleanup(): Promise<void> {
    logger.debug('Forcing memory cleanup');
    
    // Multiple GC calls to ensure cleanup
    if (global.gc) {
      global.gc();
      await this.delay(50);
      global.gc();
    }
    
    await this.delay(100);
  }

  private async finalCleanup(): Promise<void> {
    logger.info('Performing final cleanup', {
      processedBatches: this.processedBatches,
      totalProcessingTime: Date.now() - this.startTime,
      finalMemoryMB: this.getMemoryUsageMB()
    });
    
    this.currentMemoryUsage = 0;
    this.processedBatches = 0;
    
    await this.forceCleanup();
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Utility functions for report memory optimization
 */
export const streamingReportUtils = {
  /**
   * Process competitor data in streaming fashion
   */
  async processCompetitorsStreaming<T>(
    competitors: T[],
    processor: (competitor: T) => Promise<any>,
    options?: {
      maxConcurrent?: number;
      memoryLimitMB?: number;
      onProgress?: (progress: { completed: number; total: number }) => void;
    }
  ): Promise<any[]> {
    const maxConcurrent = options?.maxConcurrent || 2;
    const results: any[] = [];
    
    logger.info('Processing competitors with streaming approach', {
      totalCompetitors: competitors.length,
      maxConcurrent
    });

    for (let i = 0; i < competitors.length; i += maxConcurrent) {
      const batch = competitors.slice(i, i + maxConcurrent);
      
      // Check memory before processing batch
      const memoryUsage = process.memoryUsage().heapUsed / 1024 / 1024;
      const memoryLimit = options?.memoryLimitMB || STREAMING_CONFIG.MAX_MEMORY_MB;
      
      if (memoryUsage > memoryLimit) {
        logger.warn('Memory limit reached during competitor processing', {
          memoryUsageMB: Math.round(memoryUsage),
          memoryLimitMB: memoryLimit
        });
        
        // Force cleanup
        if (global.gc) {
          global.gc();
        }
        
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Process batch concurrently
      const batchPromises = batch.map(async (competitor) => {
        try {
          return await processor(competitor);
        } catch (error) {
          logger.error('Failed to process competitor', error as Error, {
            competitor: typeof competitor === 'object' && competitor !== null && 'id' in competitor 
              ? (competitor as any).id 
              : 'unknown'
          });
          return null;
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults.filter(result => result !== null));
      
      // Report progress
      if (options?.onProgress) {
        options.onProgress({
          completed: Math.min(i + maxConcurrent, competitors.length),
          total: competitors.length
        });
      }
      
      // Cleanup between batches
      if (i + maxConcurrent < competitors.length) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
    
    logger.info('Competitor streaming processing completed', {
      totalProcessed: competitors.length,
      successfulResults: results.length
    });
    
    return results;
  },

  /**
   * Create optimized prompt chunks to avoid large AI requests
   */
  createOptimizedPromptChunks(
    competitorData: any[],
    maxCompetitorsPerChunk: number = 2,
    maxContentSizeKB: number = 50
  ): Array<{ competitors: any[]; promptSize: number }> {
    const chunks: Array<{ competitors: any[]; promptSize: number }> = [];
    
    for (let i = 0; i < competitorData.length; i += maxCompetitorsPerChunk) {
      const competitorChunk = competitorData.slice(i, i + maxCompetitorsPerChunk);
      
      // Estimate prompt size
      const estimatedSize = competitorChunk.reduce((total, competitor) => {
        return total + JSON.stringify(competitor).length;
      }, 0);
      
      const promptSizeKB = Math.round(estimatedSize / 1024);
      
      if (promptSizeKB > maxContentSizeKB) {
        logger.warn('Prompt chunk exceeds size limit', {
          chunkIndex: Math.floor(i / maxCompetitorsPerChunk),
          promptSizeKB,
          maxSizeKB: maxContentSizeKB,
          competitorsInChunk: competitorChunk.length
        });
        
        // Further reduce the chunk if it's too large
        const reducedChunk = competitorChunk.slice(0, 1);
        chunks.push({
          competitors: reducedChunk,
          promptSize: Math.round(JSON.stringify(reducedChunk).length / 1024)
        });
      } else {
        chunks.push({
          competitors: competitorChunk,
          promptSize: promptSizeKB
        });
      }
    }
    
    logger.info('Created optimized prompt chunks', {
      totalCompetitors: competitorData.length,
      chunksCreated: chunks.length,
      avgChunkSize: Math.round(competitorData.length / chunks.length),
      maxContentSizeKB
    });
    
    return chunks;
  }
}; 