/**
 * Task 3.2: Memory Profiling Utilities
 * Development debugging tool for comprehensive memory analysis and profiling
 */

import { logger, LogContext, trackBusinessEvent } from '@/lib/logger';
import { createId } from '@paralleldrive/cuid2';
import * as fs from 'fs';
import * as path from 'path';
import * as v8 from 'v8';

// Memory profiling interfaces
export interface MemoryProfile {
  timestamp: Date;
  endpoint?: string;
  requestId?: string;
  memorySnapshot: {
    rss: number;
    heapUsed: number;
    heapTotal: number;
    external: number;
    arrayBuffers: number;
    systemPercentage: number;
    heapPercentage: number;
  };
  duration?: number;
  method?: string;
  statusCode?: number;
  responseSize?: number;
}

export interface HeapDumpInfo {
  id: string;
  timestamp: Date;
  filename: string;
  triggerReason: string;
  memoryUsage: {
    heapUsed: number;
    heapTotal: number;
    systemPercentage: number;
  };
  fileSize?: number;
  filePath: string;
}

export interface EndpointMemoryStats {
  endpoint: string;
  requestCount: number;
  averageMemoryUsage: number;
  peakMemoryUsage: number;
  minMemoryUsage: number;
  averageDuration: number;
  memoryGrowthRate: number;
  lastRequest: Date;
  profiles: MemoryProfile[];
}

export interface MemoryMetrics {
  currentHeapUsage: number;
  maxHeapSize: number;
  memoryPressure: 'low' | 'medium' | 'high' | 'critical';
  gcStats: {
    totalCollections: number;
    totalTime: number;
    averageTime: number;
  };
  topEndpointsByMemory: EndpointMemoryStats[];
  recentProfiles: MemoryProfile[];
  heapDumps: HeapDumpInfo[];
}

/**
 * Memory Profiler for Development Debugging
 */
export class MemoryProfiler {
  private static instance: MemoryProfiler;
  private isEnabled: boolean = false;
  private profiles: MemoryProfile[] = [];
  private endpointStats: Map<string, EndpointMemoryStats> = new Map();
  private heapDumps: HeapDumpInfo[] = [];
  private gcStats = { count: 0, totalDuration: 0 };
  
  // Configuration
  private readonly MAX_PROFILES = 1000;
  private readonly MAX_HEAP_DUMPS = 10;
  private readonly HEAP_DUMP_THRESHOLD = 0.90; // 90% memory usage
  private readonly PROFILE_CLEANUP_INTERVAL = 300000; // 5 minutes

  // Heap dump directory
  private readonly HEAP_DUMP_DIR = path.join(process.cwd(), 'heap-dumps');

  private cleanupInterval: NodeJS.Timeout | null = null;

  private constructor() {
    this.initialize();
  }

  public static getInstance(): MemoryProfiler {
    if (!MemoryProfiler.instance) {
      MemoryProfiler.instance = new MemoryProfiler();
    }
    return MemoryProfiler.instance;
  }

  /**
   * Initialize memory profiler
   */
  private initialize(): void {
    // Enable in development or when explicitly requested
    this.isEnabled = process.env.NODE_ENV === 'development' || 
                     process.env.ENABLE_MEMORY_PROFILER === 'true';

    if (this.isEnabled) {
      this.setupHeapDumpDirectory();
      this.startProfileCleanup();
      logger.info('Memory profiler initialized', {
        enabled: this.isEnabled,
        maxProfiles: this.MAX_PROFILES,
        heapDumpThreshold: `${this.HEAP_DUMP_THRESHOLD * 100}%`
      });
    }
  }

  /**
   * Enable or disable memory profiling
   */
  public setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    
    if (enabled && !this.cleanupInterval) {
      this.startProfileCleanup();
    } else if (!enabled && this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    logger.info('Memory profiler status changed', { enabled });
  }

  /**
   * Setup heap dump directory
   */
  private setupHeapDumpDirectory(): void {
    try {
      if (!fs.existsSync(this.HEAP_DUMP_DIR)) {
        fs.mkdirSync(this.HEAP_DUMP_DIR, { recursive: true });
        logger.info('Created heap dump directory', { path: this.HEAP_DUMP_DIR });
      }
    } catch (error) {
      logger.error('Failed to create heap dump directory', error as Error);
    }
  }

  /**
   * Start periodic cleanup of old profiles
   */
  private startProfileCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldProfiles();
    }, this.PROFILE_CLEANUP_INTERVAL);
  }

  /**
   * Profile memory usage for an API endpoint
   */
  public profileEndpoint(
    endpoint: string,
    method: string = 'GET',
    requestId?: string,
    additionalContext?: LogContext
  ): () => void {
    if (!this.isEnabled) {
      return () => {}; // Return no-op function
    }

    const startTime = Date.now();
    const startMemory = this.getCurrentMemorySnapshot();

    // Return end profiling function
    return (statusCode?: number, responseSize?: number) => {
      const endTime = Date.now();
      const endMemory = this.getCurrentMemorySnapshot();
      const duration = endTime - startTime;

             const profile: MemoryProfile = {
         timestamp: new Date(),
         endpoint,
         ...(requestId && { requestId }),
         method,
         ...(statusCode && { statusCode }),
         ...(responseSize && { responseSize }),
         duration,
         memorySnapshot: endMemory
       };

      this.addProfile(profile);
      this.updateEndpointStats(endpoint, profile, startMemory, endMemory);

      // Check if heap dump is needed
      this.checkHeapDumpConditions(endMemory, `API endpoint: ${endpoint}`);

      // Log memory metrics
      this.logMemoryMetrics(profile, additionalContext);
    };
  }

  /**
   * Profile a general operation
   */
  public profileOperation(operationName: string, requestId?: string): () => void {
    if (!this.isEnabled) {
      return () => {};
    }

    const startTime = Date.now();
    const startMemory = this.getCurrentMemorySnapshot();

    return (additionalData?: Record<string, any>) => {
      const endTime = Date.now();
      const endMemory = this.getCurrentMemorySnapshot();
      const duration = endTime - startTime;

             const profile: MemoryProfile = {
         timestamp: new Date(),
         endpoint: operationName,
         ...(requestId && { requestId }),
         duration,
         memorySnapshot: endMemory
       };

      this.addProfile(profile);

             // Log the operation
       const logData: Record<string, any> = {
         operation: operationName,
         duration: `${duration}ms`,
         memoryUsed: `${endMemory.heapUsed}MB`,
         memoryGrowth: `${(endMemory.heapUsed - startMemory.heapUsed).toFixed(2)}MB`,
         ...additionalData
       };
       
       if (requestId) {
         logData.requestId = requestId;
       }
       
       logger.info('Operation memory profile', logData);

      // Check heap dump conditions
      this.checkHeapDumpConditions(endMemory, `Operation: ${operationName}`);
    };
  }

  /**
   * Generate heap dump when memory threshold is breached
   */
  public generateHeapDump(reason: string = 'Manual trigger'): Promise<HeapDumpInfo | null> {
    return new Promise((resolve) => {
      if (!this.isEnabled) {
        resolve(null);
        return;
      }

      try {
        const timestamp = new Date();
        const id = createId();
        const filename = `heap-dump-${timestamp.toISOString().replace(/[:.]/g, '-')}-${id}.heapsnapshot`;
        const filePath = path.join(this.HEAP_DUMP_DIR, filename);

        const memoryUsage = this.getCurrentMemorySnapshot();

        // Generate heap snapshot
        const heapSnapshot = v8.getHeapSnapshot();
        const writeStream = fs.createWriteStream(filePath);

        heapSnapshot.pipe(writeStream);

        writeStream.on('finish', () => {
          try {
            const stats = fs.statSync(filePath);
            const heapDumpInfo: HeapDumpInfo = {
              id,
              timestamp,
              filename,
              triggerReason: reason,
              memoryUsage: {
                heapUsed: memoryUsage.heapUsed,
                heapTotal: memoryUsage.heapTotal,
                systemPercentage: memoryUsage.systemPercentage
              },
              fileSize: stats.size,
              filePath
            };

            this.heapDumps.push(heapDumpInfo);

            // Keep only the most recent heap dumps
            if (this.heapDumps.length > this.MAX_HEAP_DUMPS) {
              const oldDumps = this.heapDumps.splice(0, this.heapDumps.length - this.MAX_HEAP_DUMPS);
              this.cleanupOldHeapDumps(oldDumps);
            }

            logger.info('Heap dump generated', {
              filename,
              reason,
              fileSize: `${(stats.size / 1024 / 1024).toFixed(2)}MB`,
              memoryUsage: `${memoryUsage.heapUsed}MB`
            });

            trackBusinessEvent('heap_dump_generated', {
              reason,
              filename,
              heapUsed: memoryUsage.heapUsed,
              systemPercentage: memoryUsage.systemPercentage
            });

            resolve(heapDumpInfo);
          } catch (error) {
            logger.error('Error getting heap dump file stats', error as Error);
            resolve(null);
          }
        });

        writeStream.on('error', (error) => {
          logger.error('Error writing heap dump', error);
          resolve(null);
        });

      } catch (error) {
        logger.error('Error generating heap dump', error as Error);
        resolve(null);
      }
    });
  }

  /**
   * Get current memory snapshot
   */
  private getCurrentMemorySnapshot() {
    const memUsage = process.memoryUsage();
    const totalMem = require('os').totalmem();
    const freeMem = require('os').freemem();
    const usedMem = totalMem - freeMem;

    return {
      rss: Math.round(memUsage.rss / 1024 / 1024),
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      external: Math.round(memUsage.external / 1024 / 1024),
      arrayBuffers: Math.round(memUsage.arrayBuffers / 1024 / 1024),
      systemPercentage: usedMem / totalMem,
      heapPercentage: (memUsage.heapUsed / memUsage.heapTotal) * 100
    };
  }

  /**
   * Add memory profile
   */
  private addProfile(profile: MemoryProfile): void {
    this.profiles.push(profile);

    // Limit profiles to prevent memory growth
    if (this.profiles.length > this.MAX_PROFILES) {
      this.profiles = this.profiles.slice(-this.MAX_PROFILES);
    }
  }

  /**
   * Update endpoint statistics
   */
  private updateEndpointStats(
    endpoint: string,
    profile: MemoryProfile,
    startMemory: any,
    endMemory: any
  ): void {
    let stats = this.endpointStats.get(endpoint);

    if (!stats) {
      stats = {
        endpoint,
        requestCount: 0,
        averageMemoryUsage: 0,
        peakMemoryUsage: 0,
        minMemoryUsage: Infinity,
        averageDuration: 0,
        memoryGrowthRate: 0,
        lastRequest: new Date(),
        profiles: []
      };
      this.endpointStats.set(endpoint, stats);
    }

    // Update statistics
    stats.requestCount++;
    stats.lastRequest = profile.timestamp;
    stats.profiles.push(profile);

    // Keep only recent profiles per endpoint
    if (stats.profiles.length > 50) {
      stats.profiles = stats.profiles.slice(-50);
    }

    // Recalculate averages
    const memoryUsage = profile.memorySnapshot.heapUsed;
    stats.averageMemoryUsage = ((stats.averageMemoryUsage * (stats.requestCount - 1)) + memoryUsage) / stats.requestCount;
    stats.peakMemoryUsage = Math.max(stats.peakMemoryUsage, memoryUsage);
    stats.minMemoryUsage = Math.min(stats.minMemoryUsage, memoryUsage);

    if (profile.duration) {
      stats.averageDuration = ((stats.averageDuration * (stats.requestCount - 1)) + profile.duration) / stats.requestCount;
    }

    // Calculate memory growth rate
    const memoryGrowth = endMemory.heapUsed - startMemory.heapUsed;
    stats.memoryGrowthRate = ((stats.memoryGrowthRate * (stats.requestCount - 1)) + memoryGrowth) / stats.requestCount;
  }

  /**
   * Check if heap dump conditions are met
   */
  private checkHeapDumpConditions(memorySnapshot: any, reason: string): void {
    if (memorySnapshot.systemPercentage >= this.HEAP_DUMP_THRESHOLD ||
        memorySnapshot.heapPercentage >= (this.HEAP_DUMP_THRESHOLD * 100)) {
      
      // Only generate heap dump if we haven't generated one recently
      const recentDump = this.heapDumps.find(dump => 
        Date.now() - dump.timestamp.getTime() < 300000 // 5 minutes
      );

      if (!recentDump) {
        this.generateHeapDump(`Automatic: ${reason} - Memory threshold exceeded`);
      }
    }
  }

  /**
   * Log memory metrics to existing logging system
   */
     private logMemoryMetrics(profile: MemoryProfile, additionalContext?: LogContext): void {
     const context: LogContext = {
       endpoint: profile.endpoint,
       memoryUsed: `${profile.memorySnapshot.heapUsed}MB`,
       memoryPercentage: `${profile.memorySnapshot.heapPercentage.toFixed(1)}%`,
       systemMemoryPercentage: `${(profile.memorySnapshot.systemPercentage * 100).toFixed(1)}%`,
       ...additionalContext
     };
     
     if (profile.requestId) {
       context.requestId = profile.requestId;
     }
     
     if (profile.duration) {
       context.duration = `${profile.duration}ms`;
     }
     
     if (profile.statusCode) {
       context.statusCode = profile.statusCode;
     }
     
     if (profile.responseSize) {
       context.responseSize = profile.responseSize;
     }

    // Log based on memory pressure
    if (profile.memorySnapshot.systemPercentage >= 0.85) {
      logger.warn('High memory usage detected in API endpoint', context);
    } else if (profile.memorySnapshot.systemPercentage >= 0.75) {
      logger.info('Elevated memory usage in API endpoint', context);
    } else {
      logger.debug('API endpoint memory profile', context);
    }
  }

  /**
   * Get comprehensive memory metrics
   */
  public getMemoryMetrics(): MemoryMetrics {
    const currentMemory = this.getCurrentMemorySnapshot();
    const memoryPressure = this.calculateMemoryPressure(currentMemory);

    // Get top endpoints by memory usage
    const sortedEndpoints = Array.from(this.endpointStats.values())
      .sort((a, b) => b.averageMemoryUsage - a.averageMemoryUsage)
      .slice(0, 10);

    return {
      currentHeapUsage: currentMemory.heapUsed,
      maxHeapSize: currentMemory.heapTotal,
      memoryPressure,
      gcStats: {
        totalCollections: this.gcStats.count,
        totalTime: this.gcStats.totalDuration,
        averageTime: this.gcStats.count > 0 ? this.gcStats.totalDuration / this.gcStats.count : 0
      },
      topEndpointsByMemory: sortedEndpoints,
      recentProfiles: this.profiles.slice(-20),
      heapDumps: this.heapDumps.slice()
    };
  }

  /**
   * Calculate memory pressure level
   */
  private calculateMemoryPressure(memorySnapshot: any): 'low' | 'medium' | 'high' | 'critical' {
    const systemPercentage = memorySnapshot.systemPercentage;
    
    if (systemPercentage >= 0.90) return 'critical';
    if (systemPercentage >= 0.80) return 'high';
    if (systemPercentage >= 0.70) return 'medium';
    return 'low';
  }

  /**
   * Get endpoint statistics
   */
  public getEndpointStats(endpoint?: string): EndpointMemoryStats[] {
    if (endpoint) {
      const stats = this.endpointStats.get(endpoint);
      return stats ? [stats] : [];
    }
    return Array.from(this.endpointStats.values());
  }

  /**
   * Clear all profiling data
   */
  public clearProfiles(): void {
    this.profiles = [];
    this.endpointStats.clear();
    logger.info('Memory profiles cleared');
  }

  /**
   * Export profiling data
   */
  public exportProfiles(): {
    profiles: MemoryProfile[];
    endpointStats: Record<string, EndpointMemoryStats>;
    heapDumps: HeapDumpInfo[];
  } {
    return {
      profiles: this.profiles.slice(),
      endpointStats: Object.fromEntries(this.endpointStats),
      heapDumps: this.heapDumps.slice()
    };
  }

  /**
   * Cleanup old profiles
   */
  private cleanupOldProfiles(): void {
    const cutoff = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago
    
    // Remove old profiles
    this.profiles = this.profiles.filter(p => p.timestamp.getTime() > cutoff);

    // Cleanup endpoint stats
    for (const [endpoint, stats] of this.endpointStats.entries()) {
      stats.profiles = stats.profiles.filter(p => p.timestamp.getTime() > cutoff);
      
      // Remove endpoint stats if no recent activity
      if (stats.profiles.length === 0 && stats.lastRequest.getTime() < cutoff) {
        this.endpointStats.delete(endpoint);
      }
    }
  }

  /**
   * Cleanup old heap dumps
   */
  private cleanupOldHeapDumps(heapDumps: HeapDumpInfo[]): void {
    for (const dumpInfo of heapDumps) {
      try {
        if (fs.existsSync(dumpInfo.filePath)) {
          fs.unlinkSync(dumpInfo.filePath);
          logger.info('Deleted old heap dump', { filename: dumpInfo.filename });
        }
      } catch (error) {
        logger.error('Error deleting old heap dump', error as Error);
      }
    }
  }

  /**
   * Shutdown profiler
   */
  public shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    logger.info('Memory profiler shutdown completed');
  }
}

// Export singleton instance
export const memoryProfiler = MemoryProfiler.getInstance();

// Convenience functions for easy integration
export const profileEndpoint = (endpoint: string, method?: string, requestId?: string, context?: LogContext) => 
  memoryProfiler.profileEndpoint(endpoint, method, requestId, context);

export const profileOperation = (operationName: string, requestId?: string) => 
  memoryProfiler.profileOperation(operationName, requestId);

export const generateHeapDump = (reason?: string) => 
  memoryProfiler.generateHeapDump(reason);

export const getMemoryMetrics = () => 
  memoryProfiler.getMemoryMetrics(); 