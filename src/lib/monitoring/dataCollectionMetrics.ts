import { logger, createCorrelationLogger, trackBusinessEvent } from '../logger';
import { createId } from '@paralleldrive/cuid2';

interface DataCollectionMetricsData {
  // Basic success/failure counts
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  partialSuccessOperations: number;
  
  // Timing metrics
  averageCollectionTime: number;
  totalCollectionTime: number;
  fastestCollection: number;
  slowestCollection: number;
  
  // Quality metrics  
  averageDataQuality: number;
  totalDataQualityScore: number;
  highQualityOperations: number; // >90% quality
  lowQualityOperations: number; // <70% quality
  
  // Data completeness metrics
  averageDataCompleteness: number;
  totalDataCompletenessScore: number;
  completeDataOperations: number; // 100% completeness
  incompleteDataOperations: number; // <100% completeness
  
  // Source-specific metrics
  productDataSuccessCount: number;
  productDataFailureCount: number;
  competitorDataSuccessCount: number;
  competitorDataFailureCount: number;
  
  // Time-based metrics
  lastSuccessTime: Date | null;
  lastFailureTime: Date | null;
  lastResetTime: Date;
  
  // Performance thresholds
  slowOperationThreshold: number; // ms
  slowOperationCount: number;
  criticalFailureCount: number;
  
  // Data freshness metrics
  freshDataHits: number;
  staleDataHits: number;
  dataFreshnessScore: number;
}

interface CollectionOperation {
  id: string;
  projectId: string;
  operationType: 'product' | 'competitor' | 'full_project';
  startTime: Date;
  endTime?: Date;
  status: 'in_progress' | 'completed' | 'failed' | 'partial_success';
  duration?: number;
  dataQuality?: number;
  dataCompleteness?: number;
  dataFreshness?: boolean;
  errorDetails?: string;
  correlationId: string;
}

/**
 * Task 6.1: Comprehensive Data Collection Success Metrics System
 */
export class DataCollectionMetrics {
  private static instance: DataCollectionMetrics;
  private metrics: DataCollectionMetricsData;
  private activeOperations = new Map<string, CollectionOperation>();
  private operationHistory: CollectionOperation[] = [];
  private readonly MAX_HISTORY_SIZE = 1000;

  private constructor() {
    this.metrics = {} as DataCollectionMetricsData;
    this.resetMetrics();
  }

  public static getInstance(): DataCollectionMetrics {
    if (!DataCollectionMetrics.instance) {
      DataCollectionMetrics.instance = new DataCollectionMetrics();
    }
    return DataCollectionMetrics.instance;
  }

  /**
   * Task 6.1: Start tracking a data collection operation
   */
  public startOperation(
    projectId: string,
    operationType: 'product' | 'competitor' | 'full_project',
    correlationId?: string
  ): string {
    const operationId = createId();
    const correlation = correlationId || createId();
    
    const operation: CollectionOperation = {
      id: operationId,
      projectId,
      operationType,
      startTime: new Date(),
      status: 'in_progress',
      correlationId: correlation
    };

    this.activeOperations.set(operationId, operation);
    this.metrics.totalOperations++;

    const correlatedLogger = createCorrelationLogger(correlation);
    correlatedLogger.info('Data collection operation started', {
      operationId,
      projectId,
      operationType
    });

    trackBusinessEvent('data_collection_started', {
      operationId,
      projectId,
      operationType,
      correlationId: correlation
    });

    return operationId;
  }

  /**
   * Task 6.1: Complete a data collection operation with success
   */
  public completeOperation(
    operationId: string,
    result: {
      dataQuality: number;
      dataCompleteness: number;
      dataFreshness?: boolean;
      isPartialSuccess?: boolean;
    }
  ): void {
    const operation = this.activeOperations.get(operationId);
    if (!operation) {
      logger.warn('Operation not found for completion', { operationId });
      return;
    }

    const endTime = new Date();
    const duration = endTime.getTime() - operation.startTime.getTime();
    
    operation.endTime = endTime;
    operation.duration = duration;
    operation.dataQuality = result.dataQuality;
    operation.dataCompleteness = result.dataCompleteness;
    operation.dataFreshness = result.dataFreshness ?? false;
    operation.status = result.isPartialSuccess ? 'partial_success' : 'completed';

    // Update metrics
    if (result.isPartialSuccess) {
      this.metrics.partialSuccessOperations++;
    } else {
      this.metrics.successfulOperations++;
    }

    this.updateTimingMetrics(duration);
    this.updateQualityMetrics(result.dataQuality);
    this.updateCompletenessMetrics(result.dataCompleteness);
    this.updateSourceSpecificMetrics(operation.operationType, true);
    this.updateFreshnessMetrics(result.dataFreshness);

    this.metrics.lastSuccessTime = endTime;

    // Move to history and cleanup
    this.moveToHistory(operation);
    this.activeOperations.delete(operationId);

    const correlatedLogger = createCorrelationLogger(operation.correlationId);
    correlatedLogger.info('Data collection operation completed successfully', {
      operationId,
      duration: `${duration}ms`,
      dataQuality: result.dataQuality,
      dataCompleteness: result.dataCompleteness,
      isPartialSuccess: result.isPartialSuccess
    });

    trackBusinessEvent('data_collection_completed', {
      operationId,
      projectId: operation.projectId,
      operationType: operation.operationType,
      duration,
      dataQuality: result.dataQuality,
      dataCompleteness: result.dataCompleteness,
      dataFreshness: result.dataFreshness,
      isPartialSuccess: result.isPartialSuccess,
      correlationId: operation.correlationId
    });
  }

  /**
   * Task 6.1: Mark a data collection operation as failed
   */
  public failOperation(
    operationId: string,
    error: Error,
    isCritical: boolean = false
  ): void {
    const operation = this.activeOperations.get(operationId);
    if (!operation) {
      logger.warn('Operation not found for failure', { operationId });
      return;
    }

    const endTime = new Date();
    const duration = endTime.getTime() - operation.startTime.getTime();
    
    operation.endTime = endTime;
    operation.duration = duration;
    operation.status = 'failed';
    operation.errorDetails = error.message;

    // Update metrics
    this.metrics.failedOperations++;
    this.updateSourceSpecificMetrics(operation.operationType, false);
    this.metrics.lastFailureTime = endTime;

    if (isCritical) {
      this.metrics.criticalFailureCount++;
    }

    // Move to history and cleanup
    this.moveToHistory(operation);
    this.activeOperations.delete(operationId);

    const correlatedLogger = createCorrelationLogger(operation.correlationId);
    correlatedLogger.error('Data collection operation failed', error, {
      operationId,
      duration: `${duration}ms`,
      isCritical
    });

    trackBusinessEvent('data_collection_failed', {
      operationId,
      projectId: operation.projectId,
      operationType: operation.operationType,
      duration,
      error: error.message,
      isCritical,
      correlationId: operation.correlationId
    });
  }

  /**
   * Task 6.1: Get comprehensive success metrics
   */
  public getSuccessMetrics(): {
    summary: any;
    detailed: DataCollectionMetricsData;
    rates: any;
    trends: any;
  } {
    const summary = {
      totalOperations: this.metrics.totalOperations,
      successRate: this.calculateSuccessRate(),
      averageCollectionTime: this.metrics.averageCollectionTime,
      averageDataQuality: this.metrics.averageDataQuality,
      averageDataCompleteness: this.metrics.averageDataCompleteness,
      dataFreshnessRate: this.calculateDataFreshnessRate(),
      criticalFailureRate: this.calculateCriticalFailureRate(),
      lastSuccessTime: this.metrics.lastSuccessTime,
      lastFailureTime: this.metrics.lastFailureTime
    };

    const rates = {
      overallSuccessRate: this.calculateSuccessRate(),
      productDataSuccessRate: this.calculateProductDataSuccessRate(),
      competitorDataSuccessRate: this.calculateCompetitorDataSuccessRate(),
      highQualityRate: this.calculateHighQualityRate(),
      completeDataRate: this.calculateCompleteDataRate(),
      fastOperationRate: this.calculateFastOperationRate()
    };

    const trends = this.calculateTrends();

    return {
      summary,
      detailed: this.metrics,
      rates,
      trends
    };
  }

  /**
   * Task 6.1: Reset metrics (for testing or periodic resets)
   */
  public resetMetrics(): void {
    this.metrics = {
      totalOperations: 0,
      successfulOperations: 0,
      failedOperations: 0,
      partialSuccessOperations: 0,
      averageCollectionTime: 0,
      totalCollectionTime: 0,
      fastestCollection: Number.MAX_SAFE_INTEGER,
      slowestCollection: 0,
      averageDataQuality: 0,
      totalDataQualityScore: 0,
      highQualityOperations: 0,
      lowQualityOperations: 0,
      averageDataCompleteness: 0,
      totalDataCompletenessScore: 0,
      completeDataOperations: 0,
      incompleteDataOperations: 0,
      productDataSuccessCount: 0,
      productDataFailureCount: 0,
      competitorDataSuccessCount: 0,
      competitorDataFailureCount: 0,
      lastSuccessTime: null,
      lastFailureTime: null,
      lastResetTime: new Date(),
      slowOperationThreshold: 30000, // 30 seconds
      slowOperationCount: 0,
      criticalFailureCount: 0,
      freshDataHits: 0,
      staleDataHits: 0,
      dataFreshnessScore: 0
    };
  }

  // Private helper methods for updating metrics

  private updateTimingMetrics(duration: number): void {
    this.metrics.totalCollectionTime += duration;
    const completedOps = this.metrics.successfulOperations + this.metrics.partialSuccessOperations;
    this.metrics.averageCollectionTime = this.metrics.totalCollectionTime / completedOps;
    
    this.metrics.fastestCollection = Math.min(this.metrics.fastestCollection, duration);
    this.metrics.slowestCollection = Math.max(this.metrics.slowestCollection, duration);
    
    if (duration > this.metrics.slowOperationThreshold) {
      this.metrics.slowOperationCount++;
    }
  }

  private updateQualityMetrics(quality: number): void {
    this.metrics.totalDataQualityScore += quality;
    const completedOps = this.metrics.successfulOperations + this.metrics.partialSuccessOperations;
    this.metrics.averageDataQuality = this.metrics.totalDataQualityScore / completedOps;
    
    if (quality >= 90) {
      this.metrics.highQualityOperations++;
    } else if (quality < 70) {
      this.metrics.lowQualityOperations++;
    }
  }

  private updateCompletenessMetrics(completeness: number): void {
    this.metrics.totalDataCompletenessScore += completeness;
    const completedOps = this.metrics.successfulOperations + this.metrics.partialSuccessOperations;
    this.metrics.averageDataCompleteness = this.metrics.totalDataCompletenessScore / completedOps;
    
    if (completeness === 100) {
      this.metrics.completeDataOperations++;
    } else {
      this.metrics.incompleteDataOperations++;
    }
  }

  private updateSourceSpecificMetrics(operationType: string, success: boolean): void {
    if (operationType === 'product') {
      if (success) {
        this.metrics.productDataSuccessCount++;
      } else {
        this.metrics.productDataFailureCount++;
      }
    } else if (operationType === 'competitor') {
      if (success) {
        this.metrics.competitorDataSuccessCount++;
      } else {
        this.metrics.competitorDataFailureCount++;
      }
    } else if (operationType === 'full_project') {
      // Full project affects both product and competitor metrics
      if (success) {
        this.metrics.productDataSuccessCount++;
        this.metrics.competitorDataSuccessCount++;
      } else {
        this.metrics.productDataFailureCount++;
        this.metrics.competitorDataFailureCount++;
      }
    }
  }

  private updateFreshnessMetrics(dataFreshness?: boolean): void {
    if (dataFreshness !== undefined) {
      if (dataFreshness) {
        this.metrics.freshDataHits++;
      } else {
        this.metrics.staleDataHits++;
      }
      
      const totalFreshnessChecks = this.metrics.freshDataHits + this.metrics.staleDataHits;
      this.metrics.dataFreshnessScore = (this.metrics.freshDataHits / totalFreshnessChecks) * 100;
    }
  }

  private moveToHistory(operation: CollectionOperation): void {
    this.operationHistory.push(operation);
    if (this.operationHistory.length > this.MAX_HISTORY_SIZE) {
      this.operationHistory.shift(); // Remove oldest operation
    }
  }

  // Calculation methods for rates and trends

  private calculateSuccessRate(): number {
    if (this.metrics.totalOperations === 0) return 0;
    const successful = this.metrics.successfulOperations + this.metrics.partialSuccessOperations;
    return (successful / this.metrics.totalOperations) * 100;
  }

  private calculateProductDataSuccessRate(): number {
    const total = this.metrics.productDataSuccessCount + this.metrics.productDataFailureCount;
    if (total === 0) return 0;
    return (this.metrics.productDataSuccessCount / total) * 100;
  }

  private calculateCompetitorDataSuccessRate(): number {
    const total = this.metrics.competitorDataSuccessCount + this.metrics.competitorDataFailureCount;
    if (total === 0) return 0;
    return (this.metrics.competitorDataSuccessCount / total) * 100;
  }

  private calculateHighQualityRate(): number {
    const completedOps = this.metrics.successfulOperations + this.metrics.partialSuccessOperations;
    if (completedOps === 0) return 0;
    return (this.metrics.highQualityOperations / completedOps) * 100;
  }

  private calculateCompleteDataRate(): number {
    const completedOps = this.metrics.successfulOperations + this.metrics.partialSuccessOperations;
    if (completedOps === 0) return 0;
    return (this.metrics.completeDataOperations / completedOps) * 100;
  }

  private calculateFastOperationRate(): number {
    const completedOps = this.metrics.successfulOperations + this.metrics.partialSuccessOperations;
    if (completedOps === 0) return 0;
    const fastOps = completedOps - this.metrics.slowOperationCount;
    return (fastOps / completedOps) * 100;
  }

  private calculateCriticalFailureRate(): number {
    if (this.metrics.totalOperations === 0) return 0;
    return (this.metrics.criticalFailureCount / this.metrics.totalOperations) * 100;
  }

  private calculateDataFreshnessRate(): number {
    return this.metrics.dataFreshnessScore;
  }

  private calculateTrends(): any {
    // This would include trend analysis based on historical data
    // For now, returning basic trend indicators
    const recentOperations = this.operationHistory.slice(-50); // Last 50 operations
    
    if (recentOperations.length === 0) {
      return { trend: 'no_data', message: 'Insufficient data for trend analysis' };
    }

    const recentSuccessCount = recentOperations.filter(op => 
      op.status === 'completed' || op.status === 'partial_success'
    ).length;
    
    const recentSuccessRate = (recentSuccessCount / recentOperations.length) * 100;
    const overallSuccessRate = this.calculateSuccessRate();
    
    const trendDirection = recentSuccessRate > overallSuccessRate ? 'improving' : 
                          recentSuccessRate < overallSuccessRate ? 'declining' : 'stable';
    
    return {
      trend: trendDirection,
      recentSuccessRate,
      overallSuccessRate,
      recentOperationCount: recentOperations.length,
      message: `Data collection success rate is ${trendDirection} based on recent operations`
    };
  }
} 