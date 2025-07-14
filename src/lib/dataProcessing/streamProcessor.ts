/**
 * Stream Processor Utility
 * 
 * Provides memory-efficient stream processing for large data operations
 * Phase 5.2: Memory Optimization
 */

import { Readable, Transform, Writable, TransformCallback, pipeline } from 'stream';
import { promisify } from 'util';
import { logger } from '../logger';
import { generateCorrelationId } from '../logger';
import { memoryManager } from '../monitoring/memoryMonitoring';

// Promisify the stream pipeline for easier async usage
const pipelineAsync = promisify(pipeline);

/**
 * Stream processing options
 */
export interface StreamProcessingOptions {
  batchSize?: number;
  concurrency?: number;
  throttleMs?: number;
  reportProgressInterval?: number;
  correlationId?: string;
  operationName?: string;
}

/**
 * Default stream processing options
 */
export const DEFAULT_STREAM_OPTIONS: Required<StreamProcessingOptions> = {
  batchSize: 100,
  concurrency: 4,
  throttleMs: 0,
  reportProgressInterval: 1000,
  correlationId: '',
  operationName: 'stream-processing'
};

/**
 * Stream processor class for memory-efficient data operations
 */
export class StreamProcessor<TInput = any, TOutput = any> {
  private options: Required<StreamProcessingOptions>;
  private correlationId: string;
  private processedItems: number = 0;
  private startTime: number = 0;
  private lastProgressReport: number = 0;

  constructor(options: StreamProcessingOptions = {}) {
    this.options = {
      ...DEFAULT_STREAM_OPTIONS,
      ...options
    };
    
    // Set correlation ID
    this.correlationId = options.correlationId || generateCorrelationId();
    this.options.correlationId = this.correlationId;
  }

  /**
   * Create a readable stream from an array or iterable
   */
  public createArraySource(items: TInput[]): Readable {
    // Register approximate memory usage
    const approximateSize = items.length * 1000; // Rough estimate
    const sourceId = `array-source-${this.correlationId}`;
    memoryManager.registerLargeObject(
      sourceId, 
      approximateSize,
      'array-source'
    );

    let currentIndex = 0;
    const totalItems = items.length;
    const batchSize = this.options.batchSize;
    const throttleMs = this.options.throttleMs;
    const correlationId = this.correlationId;

    const source = new Readable({
      objectMode: true,
      read() {
        const processBatch = () => {
          if (currentIndex >= totalItems) {
            this.push(null); // End of stream
            memoryManager.unregisterLargeObject(sourceId);
            return;
          }

          // Push a batch of items
          const endIndex = Math.min(currentIndex + batchSize, totalItems);
          for (let i = currentIndex; i < endIndex; i++) {
            this.push(items[i]);
          }
          currentIndex = endIndex;
        };

        // Apply throttling if configured
        if (throttleMs > 0) {
          setTimeout(processBatch, throttleMs);
        } else {
          processBatch();
        }
      }
    });

    return source;
  }

  /**
   * Create a transform stream for processing items
   */
  public createTransform(
    processFn: (item: TInput) => Promise<TOutput | null | undefined>
  ): Transform {
    // Process items and track progress
    return new Transform({
      objectMode: true,
      highWaterMark: this.options.concurrency,
      async transform(chunk: TInput, encoding: BufferEncoding, callback: TransformCallback) {
        try {
          const result = await processFn(chunk);
          if (result !== null && result !== undefined) {
            this.push(result);
          }
          callback();
        } catch (error) {
          callback(error as Error);
        }
      }
    });
  }

  /**
   * Create a batch transform stream for processing items in batches
   */
  public createBatchTransform(
    batchProcessFn: (items: TInput[]) => Promise<TOutput[]>
  ): Transform {
    const batchSize = this.options.batchSize;
    let batch: TInput[] = [];

    return new Transform({
      objectMode: true,
      async transform(chunk: TInput, encoding: BufferEncoding, callback: TransformCallback) {
        try {
          batch.push(chunk);

          // Process when batch is full
          if (batch.length >= batchSize) {
            const currentBatch = batch;
            batch = [];
            
            const results = await batchProcessFn(currentBatch);
            for (const result of results) {
              if (result !== null && result !== undefined) {
                this.push(result);
              }
            }
          }
          callback();
        } catch (error) {
          callback(error as Error);
        }
      },
      async flush(callback: TransformCallback) {
        try {
          // Process remaining items in batch
          if (batch.length > 0) {
            const results = await batchProcessFn(batch);
            for (const result of results) {
              if (result !== null && result !== undefined) {
                this.push(result);
              }
            }
            batch = [];
          }
          callback();
        } catch (error) {
          callback(error as Error);
        }
      }
    });
  }

  /**
   * Create a destination stream that collects results
   */
  public createCollector(): { stream: Writable; getResults: () => TOutput[] } {
    const results: TOutput[] = [];
    const self = this; // Store this reference for use in stream

    const stream = new Writable({
      objectMode: true,
      write: (chunk: TOutput, encoding: BufferEncoding, callback: (error?: Error | null) => void) => {
        results.push(chunk);
        self.processedItems++;
        self.reportProgress();
        callback();
      }
    });

    return {
      stream,
      getResults: () => results
    };
  }

  /**
   * Process an array of items using streams
   */
  public async processArray(
    items: TInput[],
    processFn: (item: TInput) => Promise<TOutput | null | undefined>
  ): Promise<TOutput[]> {
    this.startTime = Date.now();
    this.processedItems = 0;
    this.lastProgressReport = 0;

    logger.info(`Starting stream processing operation: ${this.options.operationName}`, {
      correlationId: this.correlationId,
      itemCount: items.length,
      batchSize: this.options.batchSize,
      concurrency: this.options.concurrency
    });

    // Create the collector to gather results
    const collector = this.createCollector();

    // Set up pipeline
    await pipelineAsync(
      this.createArraySource(items),
      this.createTransform(processFn),
      collector.stream
    );

    const results = collector.getResults();
    const duration = Date.now() - this.startTime;

    logger.info(`Stream processing completed: ${this.options.operationName}`, {
      correlationId: this.correlationId,
      inputCount: items.length,
      outputCount: results.length,
      durationMs: duration,
      itemsPerSecond: Math.round((results.length / duration) * 1000)
    });

    return results;
  }

  /**
   * Process items in batches for better memory efficiency
   */
  public async processBatches(
    items: TInput[],
    batchProcessFn: (batch: TInput[]) => Promise<TOutput[]>
  ): Promise<TOutput[]> {
    this.startTime = Date.now();
    this.processedItems = 0;
    this.lastProgressReport = 0;

    logger.info(`Starting batch stream processing: ${this.options.operationName}`, {
      correlationId: this.correlationId,
      itemCount: items.length,
      batchSize: this.options.batchSize
    });

    // Create the collector to gather results
    const collector = this.createCollector();

    // Set up pipeline
    await pipelineAsync(
      this.createArraySource(items),
      this.createBatchTransform(batchProcessFn),
      collector.stream
    );

    const results = collector.getResults();
    const duration = Date.now() - this.startTime;

    logger.info(`Batch stream processing completed: ${this.options.operationName}`, {
      correlationId: this.correlationId,
      inputCount: items.length,
      outputCount: results.length,
      durationMs: duration,
      batchesProcessed: Math.ceil(items.length / this.options.batchSize)
    });

    return results;
  }

  /**
   * Process source stream with custom transform and sink
   */
  public async processStream<TStreamOutput>(
    source: Readable,
    transform: Transform | ((item: TInput) => Promise<TOutput | null | undefined>),
    sink: Writable
  ): Promise<void> {
    this.startTime = Date.now();

    // If transform is a function, convert it to a transform stream
    const transformStream = typeof transform === 'function' 
      ? this.createTransform(transform)
      : transform;

    // Set up pipeline
    await pipelineAsync(source, transformStream, sink);

    const duration = Date.now() - this.startTime;

    logger.info(`Custom stream processing completed: ${this.options.operationName}`, {
      correlationId: this.correlationId,
      durationMs: duration
    });
  }

  /**
   * Report processing progress
   */
  private reportProgress(): void {
    const now = Date.now();
    if (now - this.lastProgressReport >= this.options.reportProgressInterval) {
      const duration = now - this.startTime;
      const itemsPerSecond = Math.round((this.processedItems / duration) * 1000);

      logger.debug(`Stream processing progress: ${this.options.operationName}`, {
        correlationId: this.correlationId,
        itemsProcessed: this.processedItems,
        durationMs: duration,
        itemsPerSecond
      });

      // Take a memory snapshot occasionally
      memoryManager.takeSnapshot(`stream-${this.options.operationName}`);
      
      this.lastProgressReport = now;
    }
  }
}

/**
 * Create a memory-efficient stream processor
 */
export function createStreamProcessor<TInput = any, TOutput = any>(
  options: StreamProcessingOptions = {}
): StreamProcessor<TInput, TOutput> {
  return new StreamProcessor<TInput, TOutput>(options);
} 