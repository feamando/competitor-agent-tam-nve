// Task 3.3.1 & 3.3.2: Custom rate limiter for Next.js API routes
interface RateLimitEntry {
  count: number;
  resetTime: number;
}

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
  message?: string;
}

class RateLimiter {
  private cache = new Map<string, RateLimitEntry>();
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = config;
    // Clean up expired entries every minute
    setInterval(() => this.cleanup(), 60000);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (entry.resetTime < now) {
        this.cache.delete(key);
      }
    }
  }

  private getClientKey(request: Request): string {
    // Try to get IP from headers (for proxied requests)
    const forwarded = request.headers.get('x-forwarded-for');
    const realIp = request.headers.get('x-real-ip');
    const cfIp = request.headers.get('cf-connecting-ip');
    
    // Use the first available IP address
    let clientIp = forwarded?.split(',')[0]?.trim() || realIp || cfIp;
    
    // Fallback for development/local
    if (!clientIp || clientIp === '127.0.0.1' || clientIp === '::1') {
      clientIp = 'localhost';
    }
    
    return clientIp;
  }

  public check(request: Request): { allowed: boolean; remaining: number; resetTime: number } {
    const key = this.getClientKey(request);
    const now = Date.now();
    const resetTime = now + this.config.windowMs;

    let entry = this.cache.get(key);
    
    // If no entry exists or window has expired, create new entry
    if (!entry || entry.resetTime < now) {
      entry = { count: 1, resetTime };
      this.cache.set(key, entry);
      return {
        allowed: true,
        remaining: this.config.maxRequests - 1,
        resetTime
      };
    }

    // Increment count for existing entry
    entry.count++;
    
    const allowed = entry.count <= this.config.maxRequests;
    const remaining = Math.max(0, this.config.maxRequests - entry.count);
    
    return {
      allowed,
      remaining,
      resetTime: entry.resetTime
    };
  }

  public getRateLimitHeaders(result: { allowed: boolean; remaining: number; resetTime: number }) {
    return {
      'X-RateLimit-Limit': this.config.maxRequests.toString(),
      'X-RateLimit-Remaining': result.remaining.toString(),
      'X-RateLimit-Reset': Math.ceil(result.resetTime / 1000).toString(),
    };
  }
}

// Task 3.3.3: Set limit to 10 requests per minute per IP
export const healthEndpointRateLimiter = new RateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 10, // 10 requests per minute per IP
  message: 'Too many requests to health endpoint'
});

export { RateLimiter };
export type { RateLimitConfig }; 