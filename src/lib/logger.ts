export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

const COLOR_RESET = '\x1b[0m';

const getColor = (level: LogLevel, bright = false): string => {
  switch (level) {
    case LogLevel.DEBUG: return bright ? '\x1b[96m' : '\x1b[36m';
    case LogLevel.INFO:  return bright ? '\x1b[92m' : '\x1b[32m';
    case LogLevel.WARN:  return bright ? '\x1b[93m' : '\x1b[33m';
    case LogLevel.ERROR: return bright ? '\x1b[91m' : '\x1b[31m';
    default: return '';
  }
};

// Type-safe metadata for different contexts
export interface DatabaseContext {
  recordId?: string;
  recordData?: Record<string, unknown>;
  query?: string;
  duration?: number;
}

export interface FileSystemContext {
  fileSize?: number;
  success?: boolean;
  error?: string;
}

export interface ReportFlowContext {
  reportName?: string;
  competitorName?: string;
  stepStatus?: 'started' | 'completed' | 'failed';
  stepData?: Record<string, unknown>;
}

export interface LogContext {
  requestId?: string;
  userId?: string;
  competitorId?: string;
  reportId?: string;
  sessionId?: string;
  projectId?: string;
  projectName?: string;
  operationStep?: string;
  correlationId?: string;
  // Allow for various data types including nested objects and arrays
  [key: string]: unknown;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  performance?: {
    duration: number;
    operation: string;
  };
}

export interface EventData {
  eventType: string;
  category: 'user_action' | 'system_event' | 'error' | 'performance' | 'business';
  metadata?: Record<string, unknown>;
}

class Logger {
  private logLevel: LogLevel;
  private context: LogContext = {};

  constructor(level: LogLevel = LogLevel.INFO) {
    this.logLevel = level;
  }

  setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  setContext(context: LogContext): void {
    this.context = { ...this.context, ...context };
  }

  clearContext(): void {
    this.context = {};
  }

  debug(message: string, context?: LogContext): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  info(message: string, context?: LogContext): void {
    this.log(LogLevel.INFO, message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.log(LogLevel.WARN, message, context);
  }

  error(message: string, error?: Error, context?: LogContext): void {
    const errorContext = error ? {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      }
    } : {};
    
    this.log(LogLevel.ERROR, message, { ...context, ...errorContext });
  }

  performance(operation: string, duration: number, context?: LogContext): void {
    this.log(LogLevel.INFO, `Performance: ${operation}`, {
      ...context,
      performance: {
        duration,
        operation,
      }
    });
  }

  event(eventData: EventData, context?: LogContext): void {
    this.log(LogLevel.INFO, `Event: ${eventData.eventType}`, {
      ...context,
      event: eventData,
    });
  }

  // New method for database operation logging
  database(operation: string, table: string, context?: LogContext & { 
    recordId?: string; 
    recordData?: Record<string, unknown>; 
    query?: string;
    duration?: number;
  }): void {
    this.log(LogLevel.DEBUG, `Database: ${operation} on ${table}`, {
      ...context,
      operation: 'database',
      table,
    });
  }

  // New method for file system operation logging
  filesystem(operation: string, filePath: string, context?: LogContext & {
    fileSize?: number;
    success?: boolean;
    error?: string;
  }): void {
    this.log(LogLevel.DEBUG, `FileSystem: ${operation} - ${filePath}`, {
      ...context,
      operation: 'filesystem',
      filePath,
    });
  }

  // New method for report generation flow tracking
  reportFlow(step: string, context?: LogContext & {
    reportName?: string;
    competitorName?: string;
    stepStatus?: 'started' | 'completed' | 'failed';
    stepData?: Record<string, unknown>;
  }): void {
    this.log(LogLevel.INFO, `ReportFlow: ${step}`, {
      ...context,
      operation: 'report_flow',
      operationStep: step,
    });
  }

  // New method for correlation tracking
  correlation(correlationId: string, event: string, context?: LogContext): void {
    this.log(LogLevel.INFO, `Correlation[${correlationId}]: ${event}`, {
      ...context,
      correlationId,
      operation: 'correlation',
    });
  }

  private log(level: LogLevel, message: string, context?: LogContext): void {
    if (level < this.logLevel) {
      return;
    }

    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: { ...this.context, ...context },
    };

    // Extract error and performance data to top level
    if (context && 'error' in context && context.error && 
        typeof context.error === 'object' && 
        'name' in context.error && 'message' in context.error) {
      logEntry.error = context.error as { name: string; message: string; stack?: string };
    }
    if (context && 'performance' in context && context.performance && 
        typeof context.performance === 'object' && 
        'duration' in context.performance && 'operation' in context.performance) {
      logEntry.performance = context.performance as { duration: number; operation: string };
    }

    const formattedMessage = this.formatLog(logEntry);
    
    // Output to console with appropriate method
    switch (level) {
      case LogLevel.DEBUG:
        console.debug(formattedMessage);
        break;
      case LogLevel.INFO:
        console.log(formattedMessage);
        break;
      case LogLevel.WARN:
        console.warn(formattedMessage);
        break;
      case LogLevel.ERROR:
        console.error(formattedMessage);
        break;
    }

    // In production, you might want to send logs to external services
    this.sendToExternalService(logEntry);
  }

  private formatLog(entry: LogEntry): string {
    const level = entry.level;
    const timestamp = entry.timestamp;
    const message = entry.message;

    const shouldColor = process.stdout?.isTTY ?? false;
    const color_bright = getColor(entry.level, true);
    const color_normal = getColor(entry.level, false);
    
    let formatted = `[${timestamp}] [${level}] ${message}`;
    if (shouldColor) {
      formatted = color_bright + formatted + color_normal;
    }
    
    if (entry.context && Object.keys(entry.context).length > 0) {
      try {
        formatted += ` | Context: ${JSON.stringify(entry.context)}`;
      } catch (e) {
        formatted += ` | Context: context could not be serialized: ${e}`;
      }
    }
    
    if (entry.error) {
      formatted += ` | Error: ${entry.error.name}: ${entry.error.message}`;
      if (entry.error.stack) {
        formatted += `\nStack: ${entry.error.stack}`;
      }
    }
    
    if (entry.performance) {
      formatted += ` | Performance: ${entry.performance.operation} took ${entry.performance.duration}ms`;
    }
    
    return formatted + (shouldColor ? COLOR_RESET : '');
  }

  private sendToExternalService(entry: LogEntry): void {
    // This is where you would send logs to external services like:
    // - CloudWatch Logs
    // - DataDog
    // - Sentry
    // - Custom logging endpoint
    
    // For now, we'll just store in memory or local file in development
    if (process.env.NODE_ENV === 'development') {
      // Could write to file or send to local logging service
      return;
    }

    // Example: Send to AWS CloudWatch (implement as needed)
    // this.sendToCloudWatch(entry);
  }

  // Helper method to create performance timing
  async timeOperation<T>(
    operation: string,
    fn: () => Promise<T>,
    context?: LogContext
  ): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      const duration = Date.now() - start;
      this.performance(operation, duration, context);
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      this.error(`${operation} failed after ${duration}ms`, error as Error, context);
      throw error;
    }
  }

  // Helper method to create a child logger with additional context
  child(context: LogContext): Logger {
    const childLogger = new Logger(this.logLevel);
    childLogger.setContext({ ...this.context, ...context });
    return childLogger;
  }
}

// Create and export a singleton logger instance
const logger = new Logger(
  process.env.NODE_ENV === 'development' ? LogLevel.DEBUG : LogLevel.INFO
);

export { logger };

// Export specific event tracking functions
export const trackEvent = (eventData: EventData, context?: LogContext) => {
  logger.event(eventData, context);
};

export const trackError = (error: Error, operation: string, context?: LogContext) => {
  logger.error(`Error in ${operation}`, error, context);
  
  // Track as event for analytics
  trackEvent({
    eventType: 'error_occurred',
    category: 'error',
    metadata: {
      operation,
      errorType: error.name,
      errorMessage: error.message,
    }
  }, context);
};

export const trackPerformance = (operation: string, duration: number, context?: LogContext) => {
  logger.performance(operation, duration, context);
  
  // Track as event for analytics
  trackEvent({
    eventType: 'performance_metric',
    category: 'performance',
    metadata: {
      operation,
      duration,
    }
  }, context);
};

export const trackUserAction = (action: string, context?: LogContext) => {
  trackEvent({
    eventType: action,
    category: 'user_action',
  }, context);
};

export const trackBusinessEvent = (event: string, metadata?: Record<string, unknown>, context?: LogContext) => {
  trackEvent({
    eventType: event,
    category: 'business',
    metadata,
  }, context);
};

// New correlation utility functions
export const generateCorrelationId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

export const createCorrelationLogger = (correlationId: string, baseContext?: LogContext) => {
  return logger.child({ correlationId, ...baseContext });
};

// Enhanced tracking functions with correlation support
export const trackDatabaseOperation = (
  operation: string, 
  table: string, 
  context?: LogContext & { recordId?: string; recordData?: any; duration?: number }
) => {
  logger.database(operation, table, context);
};

export const trackFileSystemOperation = (
  operation: string, 
  filePath: string, 
  context?: LogContext & { fileSize?: number; success?: boolean; error?: string }
) => {
  logger.filesystem(operation, filePath, context);
};

export const trackReportFlow = (
  step: string, 
  context?: LogContext & { 
    reportName?: string; 
    competitorName?: string; 
    stepStatus?: 'started' | 'completed' | 'failed';
    stepData?: any;
  }
) => {
  logger.reportFlow(step, context);
};

export const trackCorrelation = (correlationId: string, event: string, context?: LogContext) => {
  logger.correlation(correlationId, event, context);
};

// NEW: Enhanced error correlation tracking for Phase 2.1
export const trackErrorWithCorrelation = (
  error: Error, 
  operation: string, 
  correlationId: string,
  context?: LogContext & {
    service?: string;
    method?: string;
    stepNumber?: number;
    totalSteps?: number;
    retryAttempt?: number;
    maxRetries?: number;
    errorCode?: string;
    isRecoverable?: boolean;
    suggestedAction?: string;
    affectedResources?: string[];
  }
): void => {
  const errorContext = {
    ...context,
    correlationId,
    operation,
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    },
    errorMetadata: {
      service: context?.service || 'unknown',
      method: context?.method || 'unknown',
      stepNumber: context?.stepNumber,
      totalSteps: context?.totalSteps,
      retryAttempt: context?.retryAttempt,
      maxRetries: context?.maxRetries,
      errorCode: context?.errorCode,
      isRecoverable: context?.isRecoverable ?? false,
      suggestedAction: context?.suggestedAction,
      affectedResources: context?.affectedResources || []
    }
  };

  logger.error(`[${correlationId}] Error in ${operation}`, error, errorContext);

  // Track specific error pattern for debugging
  trackBusinessEvent('error_with_correlation', {
    correlationId,
    operation,
    errorType: error.name,
    errorMessage: error.message,
    service: context?.service,
    method: context?.method,
    stepNumber: context?.stepNumber,
    isRecoverable: context?.isRecoverable,
    retryAttempt: context?.retryAttempt
  }, errorContext);
};

// NEW: Track cross-service operations with correlation
export const trackCrossServiceOperation = (
  correlationId: string,
  operation: string,
  fromService: string,
  toService: string,
  operationData?: Record<string, any>,
  context?: LogContext
): void => {
  const crossServiceContext = {
    ...context,
    correlationId,
    operation,
    fromService,
    toService,
    operationType: 'cross_service',
    operationData,
    timestamp: new Date().toISOString()
  };

  logger.info(`[${correlationId}] Cross-service: ${fromService} → ${toService} | ${operation}`, crossServiceContext);

  trackBusinessEvent('cross_service_operation', {
    correlationId,
    operation,
    fromService,
    toService,
    operationData
  }, crossServiceContext);
};

// NEW: Track queue operations with correlation
export const trackQueueOperation = (
  correlationId: string,
  queueName: string,
  operation: 'enqueue' | 'dequeue' | 'process' | 'complete' | 'fail',
  taskData?: Record<string, any>,
  context?: LogContext & {
    queuePosition?: number;
    estimatedProcessingTime?: number;
    retryCount?: number;
    priority?: string;
  }
): void => {
  const queueContext = {
    ...context,
    correlationId,
    queueName,
    operation,
    operationType: 'queue',
    taskData,
    queueMetadata: {
      queuePosition: context?.queuePosition,
      estimatedProcessingTime: context?.estimatedProcessingTime,
      retryCount: context?.retryCount,
      priority: context?.priority
    },
    timestamp: new Date().toISOString()
  };

  logger.info(`[${correlationId}] Queue[${queueName}]: ${operation}`, queueContext);

  trackBusinessEvent('queue_operation', {
    correlationId,
    queueName,
    operation,
    queuePosition: context?.queuePosition,
    priority: context?.priority,
    retryCount: context?.retryCount
  }, queueContext);
};

// NEW: Track data pipeline operations with correlation
export const trackDataPipelineOperation = (
  correlationId: string,
  pipelineStep: string,
  operation: 'started' | 'completed' | 'failed' | 'skipped',
  inputData?: Record<string, any>,
  outputData?: Record<string, any>,
  context?: LogContext & {
    stepNumber?: number;
    totalSteps?: number;
    processingTime?: number;
    dataSize?: number;
    transformationType?: string;
  }
): void => {
  const pipelineContext = {
    ...context,
    correlationId,
    pipelineStep,
    operation,
    operationType: 'data_pipeline',
    inputData,
    outputData,
    pipelineMetadata: {
      stepNumber: context?.stepNumber,
      totalSteps: context?.totalSteps,
      processingTime: context?.processingTime,
      dataSize: context?.dataSize,
      transformationType: context?.transformationType
    },
    timestamp: new Date().toISOString()
  };

  logger.info(`[${correlationId}] Pipeline[${pipelineStep}]: ${operation}`, pipelineContext);

  trackBusinessEvent('data_pipeline_operation', {
    correlationId,
    pipelineStep,
    operation,
    stepNumber: context?.stepNumber,
    totalSteps: context?.totalSteps,
    processingTime: context?.processingTime,
    dataSize: context?.dataSize
  }, pipelineContext);
};

// NEW: Enhanced correlation ID generation with metadata
export const generateEnhancedCorrelationId = (
  operationType: string,
  service?: string
): string => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const servicePrefix = service ? `${service.substring(0, 3).toUpperCase()}-` : '';
  const typePrefix = operationType.substring(0, 3).toUpperCase();
  
  return `${servicePrefix}${typePrefix}-${timestamp}-${random}`;
};

// NEW: Create correlation context for service operations
export const createCorrelationContext = (
  correlationId: string,
  service: string,
  operation: string,
  additionalContext?: LogContext
): LogContext => {
  return {
    ...additionalContext,
    correlationId,
    service,
    operation,
    operationStartTime: new Date().toISOString()
  };
};

export default logger; 