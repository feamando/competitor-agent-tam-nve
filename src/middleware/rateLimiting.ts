/**
 * Task 4.2: Request Rate Limiting Middleware
 * Implements comprehensive rate limiting for analysis endpoints with user-specific queuing
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { comprehensiveMemoryMonitor } from '@/lib/monitoring/ComprehensiveMemoryMonitor';
import { createId } from '@paralleldrive/cuid2';

// Rate limiting configuration
export interface RateLimitConfig {
  maxConcurrentRequests: number;
  cooldownPeriodMs: number;
  largeRequestCooldownMs: number;
  queueMaxSize: number;
  requestTimeoutMs: number;
  cleanupIntervalMs: number;
}

// Request types and priorities
export type RequestType = 'analysis' | 'report_generation' | 'competitor_snapshot' | 'bulk_analysis';
export type RequestPriority = 'low' | 'normal' | 'high' | 'urgent';

// Rate limit decision result
export interface RateLimitResult {
  allowed: boolean;
  reason?: string;
  waitTimeMs?: number;
  queuePosition?: number;
  retryAfter?: number;
  requestId: string;
}

// User request tracking
export interface UserRequestInfo {
  userId: string;
  activeRequests: Map<string, ActiveRequest>;
  requestQueue: QueuedRequest[];
  lastRequestTime: number;
  totalRequests: number;
  violations: number;
  lastViolationTime?: number;
}

// Active request tracking
export interface ActiveRequest {
  requestId: string;
  type: RequestType;
  priority: RequestPriority;
  startTime: number;
  endpoint: string;
  ipAddress?: string;
  userAgent?: string;
}

// Queued request tracking
export interface QueuedRequest {
  requestId: string;
  type: RequestType;
  priority: RequestPriority;
  queuedAt: number;
  endpoint: string;
  userId: string;
  resolve: (result: RateLimitResult) => void;
  reject: (error: Error) => void;
}

// Default configuration
const DEFAULT_CONFIG: RateLimitConfig = {
  maxConcurrentRequests: 3, // As specified in task 4.2
  cooldownPeriodMs: 5000, // 5 seconds between requests
  largeRequestCooldownMs: 30000, // 30 seconds for large analysis requests
  queueMaxSize: 10, // Max 10 requests per user in queue
  requestTimeoutMs: 120000, // 2 minutes timeout
  cleanupIntervalMs: 300000 // 5 minutes cleanup interval
};

/**
 * Comprehensive Rate Limiting Service
 */
export class RateLimitingService {
  private static instance: RateLimitingService;
  private userRequests: Map<string, UserRequestInfo> = new Map();
  private config: RateLimitConfig;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private isInitialized = false;

  private constructor(config: RateLimitConfig = DEFAULT_CONFIG) {
    this.config = config;
    this.initialize();
  }

  public static getInstance(config?: RateLimitConfig): RateLimitingService {
    if (!RateLimitingService.instance) {
      RateLimitingService.instance = new RateLimitingService(config);
    }
    return RateLimitingService.instance;
  }

  /**
   * Initialize rate limiting service
   */
  private initialize(): void {
    if (this.isInitialized) return;

    // Start cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.performCleanup();
    }, this.config.cleanupIntervalMs);

    this.isInitialized = true;
    logger.info('Rate limiting service initialized', {
      maxConcurrentRequests: this.config.maxConcurrentRequests,
      cooldownPeriod: this.config.cooldownPeriodMs,
      queueMaxSize: this.config.queueMaxSize
    });
  }

  /**
   * Check if request should be rate limited
   */
  public async checkRateLimit(
    userId: string,
    requestType: RequestType,
    endpoint: string,
    priority: RequestPriority = 'normal',
    ipAddress?: string,
    userAgent?: string
  ): Promise<RateLimitResult> {
    const requestId = createId();

    try {
      // Check memory pressure first - reject if critical
      const shouldRejectDueToMemory = comprehensiveMemoryMonitor.shouldRejectRequest();
      if (shouldRejectDueToMemory) {
        logger.warn('Request rejected due to memory pressure', {
          userId,
          requestType,
          endpoint,
          requestId
        });

        return {
          allowed: false,
          reason: 'System under memory pressure - requests temporarily rejected',
          retryAfter: 60, // Retry after 1 minute
          requestId
        };
      }

      // Get or create user request info
      const userInfo = this.getUserRequestInfo(userId);

      // Check cooldown period
      const cooldownCheck = this.checkCooldownPeriod(userInfo, requestType);
      if (!cooldownCheck.allowed) {
        return { ...cooldownCheck, requestId };
      }

      // Check concurrent request limit
      if (userInfo.activeRequests.size >= this.config.maxConcurrentRequests) {
        // Try to queue the request
        const queueResult = await this.queueRequest(
          requestId,
          userId,
          requestType,
          endpoint,
          priority
        );
        
        return { ...queueResult, requestId };
      }

      // Allow the request
      const activeRequest: ActiveRequest = {
        requestId,
        type: requestType,
        priority,
        startTime: Date.now(),
        endpoint,
        ...(ipAddress && { ipAddress }),
        ...(userAgent && { userAgent })
      };

      userInfo.activeRequests.set(requestId, activeRequest);
      userInfo.lastRequestTime = Date.now();
      userInfo.totalRequests++;

      logger.info('Request allowed', {
        userId,
        requestType,
        endpoint,
        requestId,
        activeRequests: userInfo.activeRequests.size
      });

      return {
        allowed: true,
        requestId
      };

    } catch (error) {
      logger.error('Error in rate limit check', error as Error);
      
      // Fail open - allow request but log error
      return {
        allowed: true,
        reason: 'Rate limiting check failed - allowing request',
        requestId
      };
    }
  }

  /**
   * Mark request as completed
   */
  public completeRequest(userId: string, requestId: string): void {
    const userInfo = this.userRequests.get(userId);
    if (!userInfo) return;

    const activeRequest = userInfo.activeRequests.get(requestId);
    if (activeRequest) {
      userInfo.activeRequests.delete(requestId);
      
      const duration = Date.now() - activeRequest.startTime;
      logger.info('Request completed', {
        userId,
        requestId,
        requestType: activeRequest.type,
        duration: `${duration}ms`,
        remainingActive: userInfo.activeRequests.size
      });

      // Process queued requests
      this.processQueue(userId);
    }
  }

  /**
   * Get or create user request info
   */
  private getUserRequestInfo(userId: string): UserRequestInfo {
    let userInfo = this.userRequests.get(userId);
    
    if (!userInfo) {
      userInfo = {
        userId,
        activeRequests: new Map(),
        requestQueue: [],
        lastRequestTime: 0,
        totalRequests: 0,
        violations: 0
      };
      this.userRequests.set(userId, userInfo);
    }

    return userInfo;
  }

  /**
   * Check cooldown period between requests
   */
  private checkCooldownPeriod(
    userInfo: UserRequestInfo,
    requestType: RequestType
  ): { allowed: boolean; reason?: string; waitTimeMs?: number } {
    const now = Date.now();
    const timeSinceLastRequest = now - userInfo.lastRequestTime;
    
    // Determine cooldown period based on request type
    const isLargeRequest = ['report_generation', 'bulk_analysis'].includes(requestType);
    const requiredCooldown = isLargeRequest 
      ? this.config.largeRequestCooldownMs 
      : this.config.cooldownPeriodMs;

    if (timeSinceLastRequest < requiredCooldown) {
      const waitTime = requiredCooldown - timeSinceLastRequest;
      
      // Record violation
      userInfo.violations++;
      userInfo.lastViolationTime = now;
      
      logger.warn('Request blocked due to cooldown period', {
        userId: userInfo.userId,
        requestType,
        timeSinceLastRequest,
        requiredCooldown,
        waitTime
      });

      return {
        allowed: false,
        reason: `Cooldown period active - ${isLargeRequest ? 'large request' : 'normal'} cooldown`,
        waitTimeMs: waitTime
      };
    }

    return { allowed: true };
  }

  /**
   * Queue a request when concurrent limit is reached
   */
  private async queueRequest(
    requestId: string,
    userId: string,
    requestType: RequestType,
    endpoint: string,
    priority: RequestPriority
  ): Promise<{ allowed: boolean; reason?: string; queuePosition?: number; waitTimeMs?: number }> {
    const userInfo = this.getUserRequestInfo(userId);

    // Check queue size limit
    if (userInfo.requestQueue.length >= this.config.queueMaxSize) {
      logger.warn('Request queue full', {
        userId,
        requestType,
        endpoint,
        queueSize: userInfo.requestQueue.length,
        maxQueueSize: this.config.queueMaxSize
      });

      return {
        allowed: false,
        reason: 'Request queue full - too many pending requests',
        waitTimeMs: this.estimateWaitTime(userInfo)
      };
    }

    // Create queued request
    return new Promise((resolve, reject) => {
      const queuedRequest: QueuedRequest = {
        requestId,
        type: requestType,
        priority,
        queuedAt: Date.now(),
        endpoint,
        userId,
        resolve: (result) => resolve(result),
        reject: (error) => reject(error)
      };

      // Insert request in queue based on priority
      this.insertInQueue(userInfo.requestQueue, queuedRequest);

      const queuePosition = userInfo.requestQueue.findIndex(r => r.requestId === requestId) + 1;
      
      logger.info('Request queued', {
        userId,
        requestId,
        requestType,
        priority,
        queuePosition,
        queueSize: userInfo.requestQueue.length
      });

      // Set timeout for queued request
      setTimeout(() => {
        const index = userInfo.requestQueue.findIndex(r => r.requestId === requestId);
        if (index !== -1) {
          userInfo.requestQueue.splice(index, 1);
          resolve({
            allowed: false,
            reason: 'Request timed out in queue',
            queuePosition
          });
        }
      }, this.config.requestTimeoutMs);
    });
  }

  /**
   * Insert request in queue based on priority
   */
  private insertInQueue(queue: QueuedRequest[], request: QueuedRequest): void {
    const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 };
    const requestPriorityValue = priorityOrder[request.priority];

    let insertIndex = queue.length;
    for (let i = 0; i < queue.length; i++) {
      const queuedPriorityValue = priorityOrder[queue[i].priority];
      if (requestPriorityValue < queuedPriorityValue) {
        insertIndex = i;
        break;
      }
    }

    queue.splice(insertIndex, 0, request);
  }

  /**
   * Process queued requests for a user
   */
  private processQueue(userId: string): void {
    const userInfo = this.userRequests.get(userId);
    if (!userInfo || userInfo.requestQueue.length === 0) return;

    // Check if we can process more requests
    const availableSlots = this.config.maxConcurrentRequests - userInfo.activeRequests.size;
    if (availableSlots <= 0) return;

    // Process requests from queue (up to available slots)
    const requestsToProcess = Math.min(availableSlots, userInfo.requestQueue.length);
    
    for (let i = 0; i < requestsToProcess; i++) {
      const queuedRequest = userInfo.requestQueue.shift();
      if (!queuedRequest) break;

      // Move to active requests
      const activeRequest: ActiveRequest = {
        requestId: queuedRequest.requestId,
        type: queuedRequest.type,
        priority: queuedRequest.priority,
        startTime: Date.now(),
        endpoint: queuedRequest.endpoint
      };

      userInfo.activeRequests.set(queuedRequest.requestId, activeRequest);
      userInfo.lastRequestTime = Date.now();
      userInfo.totalRequests++;

      // Resolve the queued promise
      queuedRequest.resolve({
        allowed: true,
        requestId: queuedRequest.requestId
      });

      logger.info('Queued request processed', {
        userId,
        requestId: queuedRequest.requestId,
        requestType: queuedRequest.type,
        queueWaitTime: Date.now() - queuedRequest.queuedAt,
        activeRequests: userInfo.activeRequests.size
      });
    }
  }

  /**
   * Estimate wait time for queued requests
   */
  private estimateWaitTime(userInfo: UserRequestInfo): number {
    if (userInfo.activeRequests.size === 0) return 0;

    // Calculate average request duration from active requests
    const now = Date.now();
    let totalDuration = 0;
    let count = 0;

    for (const request of userInfo.activeRequests.values()) {
      totalDuration += now - request.startTime;
      count++;
    }

    const averageDuration = count > 0 ? totalDuration / count : 30000; // Default 30s
    const queuePosition = userInfo.requestQueue.length + 1;
    
    return Math.round(averageDuration * (queuePosition / this.config.maxConcurrentRequests));
  }

  /**
   * Perform periodic cleanup
   */
  private performCleanup(): void {
    const now = Date.now();
    const cleanupThreshold = now - (24 * 60 * 60 * 1000); // 24 hours ago

    let usersRemoved = 0;
    let stalledRequestsRemoved = 0;

    for (const [userId, userInfo] of this.userRequests.entries()) {
      // Clean up stalled active requests
      for (const [requestId, request] of userInfo.activeRequests.entries()) {
        if (now - request.startTime > this.config.requestTimeoutMs) {
          userInfo.activeRequests.delete(requestId);
          stalledRequestsRemoved++;
          
          logger.warn('Removed stalled request', {
            userId,
            requestId,
            requestType: request.type,
            stalledDuration: now - request.startTime
          });
        }
      }

      // Clean up old queued requests
      userInfo.requestQueue = userInfo.requestQueue.filter(request => {
        if (now - request.queuedAt > this.config.requestTimeoutMs) {
          request.resolve({
            allowed: false,
            reason: 'Request expired in queue',
            requestId: request.requestId
          });
          return false;
        }
        return true;
      });

      // Remove inactive users
      if (userInfo.lastRequestTime < cleanupThreshold && 
          userInfo.activeRequests.size === 0 && 
          userInfo.requestQueue.length === 0) {
        this.userRequests.delete(userId);
        usersRemoved++;
      }
    }

    if (usersRemoved > 0 || stalledRequestsRemoved > 0) {
      logger.info('Rate limiting cleanup completed', {
        usersRemoved,
        stalledRequestsRemoved,
        activeUsers: this.userRequests.size
      });
    }
  }

  /**
   * Get rate limiting statistics
   */
  public getStats(): {
    totalUsers: number;
    totalActiveRequests: number;
    totalQueuedRequests: number;
    userStats: Array<{
      userId: string;
      activeRequests: number;
      queuedRequests: number;
      totalRequests: number;
      violations: number;
    }>;
  } {
    const userStats: Array<{
      userId: string;
      activeRequests: number;
      queuedRequests: number;
      totalRequests: number;
      violations: number;
    }> = [];

    let totalActiveRequests = 0;
    let totalQueuedRequests = 0;

    for (const [userId, userInfo] of this.userRequests.entries()) {
      totalActiveRequests += userInfo.activeRequests.size;
      totalQueuedRequests += userInfo.requestQueue.length;

      userStats.push({
        userId,
        activeRequests: userInfo.activeRequests.size,
        queuedRequests: userInfo.requestQueue.length,
        totalRequests: userInfo.totalRequests,
        violations: userInfo.violations
      });
    }

    return {
      totalUsers: this.userRequests.size,
      totalActiveRequests,
      totalQueuedRequests,
      userStats
    };
  }

  /**
   * Update configuration
   */
  public updateConfig(newConfig: Partial<RateLimitConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.info('Rate limiting configuration updated', this.config as any);
  }

  /**
   * Shutdown rate limiting service
   */
  public shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Reject all queued requests
    for (const userInfo of this.userRequests.values()) {
      for (const queuedRequest of userInfo.requestQueue) {
        queuedRequest.resolve({
          allowed: false,
          reason: 'Service shutting down',
          requestId: queuedRequest.requestId
        });
      }
    }

    this.userRequests.clear();
    this.isInitialized = false;
    
    logger.info('Rate limiting service shutdown completed');
  }
}

// Export singleton instance
export const rateLimitingService = RateLimitingService.getInstance();

/**
 * Rate limiting middleware for Next.js API routes
 */
export function withRateLimit(
  requestType: RequestType = 'analysis',
  priority: RequestPriority = 'normal'
) {
  return function (handler: (req: NextRequest) => Promise<NextResponse>) {
    return async function (req: NextRequest): Promise<NextResponse> {
      try {
        // Extract user identification (from headers, auth, etc.)
        const userId = req.headers.get('x-user-id') || 
                      req.headers.get('authorization')?.split(' ')[1] || 
                      req.ip || 
                      'anonymous';

        const endpoint = req.nextUrl.pathname;
        const ipAddress = req.ip;
        const userAgent = req.headers.get('user-agent') || undefined;

        // Check rate limit
        const rateLimitResult = await rateLimitingService.checkRateLimit(
          userId,
          requestType,
          endpoint,
          priority,
          ipAddress,
          userAgent
        );

        if (!rateLimitResult.allowed) {
          logger.warn('Request rate limited', {
            userId,
            endpoint,
            reason: rateLimitResult.reason,
            waitTime: rateLimitResult.waitTimeMs,
            queuePosition: rateLimitResult.queuePosition,
            requestId: rateLimitResult.requestId
          });

          // Return rate limit response
          const response = NextResponse.json(
            {
              error: 'Rate limit exceeded',
              message: rateLimitResult.reason,
              retryAfter: rateLimitResult.retryAfter || Math.ceil((rateLimitResult.waitTimeMs || 0) / 1000),
              queuePosition: rateLimitResult.queuePosition,
              requestId: rateLimitResult.requestId
            },
            { status: 429 }
          );

          // Add rate limit headers
          if (rateLimitResult.retryAfter) {
            response.headers.set('Retry-After', rateLimitResult.retryAfter.toString());
          }
          if (rateLimitResult.waitTimeMs) {
            response.headers.set('X-RateLimit-Wait-Time', rateLimitResult.waitTimeMs.toString());
          }
          if (rateLimitResult.queuePosition) {
            response.headers.set('X-RateLimit-Queue-Position', rateLimitResult.queuePosition.toString());
          }

          return response;
        }

        // Execute the handler
        let response: NextResponse;
        try {
          response = await handler(req);
        } catch (error) {
          // Complete the request even if handler fails
          rateLimitingService.completeRequest(userId, rateLimitResult.requestId);
          throw error;
        }

        // Complete the request
        rateLimitingService.completeRequest(userId, rateLimitResult.requestId);

        // Add rate limit info to response headers
        response.headers.set('X-RateLimit-Request-Id', rateLimitResult.requestId);
        
        return response;

      } catch (error) {
        logger.error('Rate limiting middleware error', error as Error);
        
        // Fail open - execute handler without rate limiting
        return await handler(req);
      }
    };
  };
}

/**
 * Utility function to check current rate limit status
 */
export async function checkUserRateLimit(
  userId: string,
  requestType: RequestType
): Promise<{
  canProceed: boolean;
  activeRequests: number;
  queuedRequests: number;
  waitTimeMs?: number;
}> {
  const stats = rateLimitingService.getStats();
  const userStat = stats.userStats.find(u => u.userId === userId);

  if (!userStat) {
    return {
      canProceed: true,
      activeRequests: 0,
      queuedRequests: 0
    };
  }

  const canProceed = userStat.activeRequests < DEFAULT_CONFIG.maxConcurrentRequests;
  
  return {
    canProceed,
    activeRequests: userStat.activeRequests,
    queuedRequests: userStat.queuedRequests,
    waitTimeMs: canProceed ? 0 : undefined
  };
} 