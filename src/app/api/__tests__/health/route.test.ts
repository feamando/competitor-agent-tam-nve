/**
 * Phase 3.1: Comprehensive Tests for Health API Route
 * Critical for system monitoring and production readiness
 */

import { GET } from '../../health/route';
import { NextRequest } from 'next/server';

// Mock dependencies
jest.mock('@/lib/prisma', () => ({
  $queryRaw: jest.fn(),
  $disconnect: jest.fn()
}));

jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  }
}));

// Mock Redis if available
jest.mock('@/lib/redis', () => ({
  redis: {
    ping: jest.fn()
  }
}), { virtual: true });

describe('/api/health', () => {
  let mockPrisma: any;
  let mockLogger: any;

  beforeEach(() => {
    mockPrisma = require('@/lib/prisma');
    mockLogger = require('@/lib/logger').logger;
    
    // Reset mocks
    jest.clearAllMocks();
    
    // Setup default success responses
    mockPrisma.$queryRaw.mockResolvedValue([{ result: 1 }]);
    mockPrisma.$disconnect.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/health', () => {
    it('should return healthy status when all services are available', async () => {
      const request = new NextRequest('http://localhost:3000/api/health');
      
      const response = await GET(request);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.status).toBe('healthy');
      expect(data.timestamp).toBeDefined();
      expect(data.checks).toBeDefined();
      expect(data.checks.database).toBeDefined();
    });

    it('should check database connectivity', async () => {
      const request = new NextRequest('http://localhost:3000/api/health');
      
      await GET(request);
      
      expect(mockPrisma.$queryRaw).toHaveBeenCalledWith(
        expect.any(Object) // Template literal query
      );
    });

    it('should handle database connection failure', async () => {
      mockPrisma.$queryRaw.mockRejectedValue(new Error('Database connection failed'));
      
      const request = new NextRequest('http://localhost:3000/api/health');
      
      const response = await GET(request);
      const data = await response.json();
      
      expect(response.status).toBe(503);
      expect(data.status).toBe('unhealthy');
      expect(data.checks.database.status).toBe('fail');
      expect(data.checks.database.error).toContain('Database connection failed');
    });

    it('should include Redis check when available', async () => {
      // Mock Redis as available
      const mockRedis = { ping: jest.fn().mockResolvedValue('PONG') };
      jest.doMock('@/lib/redis', () => ({ redis: mockRedis }), { virtual: true });
      
      const request = new NextRequest('http://localhost:3000/api/health');
      
      const response = await GET(request);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.checks.redis).toBeDefined();
    });

    it('should handle Redis connection failure gracefully', async () => {
      const mockRedis = { ping: jest.fn().mockRejectedValue(new Error('Redis unavailable')) };
      jest.doMock('@/lib/redis', () => ({ redis: mockRedis }), { virtual: true });
      
      const request = new NextRequest('http://localhost:3000/api/health');
      
      const response = await GET(request);
      const data = await response.json();
      
      // Should still return 200 if only Redis fails (degraded but functional)
      expect(response.status).toBe(200);
      expect(data.status).toBe('degraded');
      expect(data.checks.redis.status).toBe('fail');
    });

    it('should include system metrics in response', async () => {
      const request = new NextRequest('http://localhost:3000/api/health');
      
      const response = await GET(request);
      const data = await response.json();
      
      expect(data.metrics).toBeDefined();
      expect(data.metrics.uptime).toBeDefined();
      expect(data.metrics.memory).toBeDefined();
      expect(typeof data.metrics.uptime).toBe('number');
    });

    it('should log health check results', async () => {
      const request = new NextRequest('http://localhost:3000/api/health');
      
      await GET(request);
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Health check'),
        expect.any(Object)
      );
    });

    it('should handle concurrent health check requests', async () => {
      const requests = Array.from({ length: 5 }, () => 
        new NextRequest('http://localhost:3000/api/health')
      );
      
      const promises = requests.map(request => GET(request));
      const responses = await Promise.all(promises);
      
      // All should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
      
      // Database should only be checked once per request
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(5);
    });

    it('should include version information', async () => {
      const request = new NextRequest('http://localhost:3000/api/health');
      
      const response = await GET(request);
      const data = await response.json();
      
      expect(data.version).toBeDefined();
      expect(data.environment).toBeDefined();
    });

    it('should handle timeout scenarios', async () => {
      // Mock slow database response
      mockPrisma.$queryRaw.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve([{ result: 1 }]), 10000))
      );
      
      const request = new NextRequest('http://localhost:3000/api/health');
      
      const startTime = Date.now();
      const response = await GET(request);
      const duration = Date.now() - startTime;
      
      // Should timeout and return error within reasonable time
      expect(duration).toBeLessThan(6000); // Should timeout before 6 seconds
      expect(response.status).toBe(503);
    });

    it('should validate response format', async () => {
      const request = new NextRequest('http://localhost:3000/api/health');
      
      const response = await GET(request);
      const data = await response.json();
      
      // Validate required fields
      expect(data).toHaveProperty('status');
      expect(data).toHaveProperty('timestamp');
      expect(data).toHaveProperty('checks');
      expect(data).toHaveProperty('metrics');
      
      // Validate status values
      expect(['healthy', 'degraded', 'unhealthy']).toContain(data.status);
      
      // Validate timestamp format
      expect(new Date(data.timestamp).toISOString()).toBe(data.timestamp);
    });

    it('should handle edge cases gracefully', async () => {
      // Test with malformed request
      const request = new NextRequest('http://localhost:3000/api/health?invalid=param');
      
      const response = await GET(request);
      
      // Should still process normally regardless of query params
      expect([200, 503]).toContain(response.status);
    });

    it('should properly disconnect from database after check', async () => {
      const request = new NextRequest('http://localhost:3000/api/health');
      
      await GET(request);
      
      expect(mockPrisma.$disconnect).toHaveBeenCalled();
    });

    it('should handle multiple service failures', async () => {
      mockPrisma.$queryRaw.mockRejectedValue(new Error('DB Error'));
      
      const request = new NextRequest('http://localhost:3000/api/health');
      
      const response = await GET(request);
      const data = await response.json();
      
      expect(response.status).toBe(503);
      expect(data.status).toBe('unhealthy');
      expect(data.checks.database.status).toBe('fail');
    });

    it('should include response time metrics', async () => {
      const request = new NextRequest('http://localhost:3000/api/health');
      
      const response = await GET(request);
      const data = await response.json();
      
      expect(data.responseTime).toBeDefined();
      expect(typeof data.responseTime).toBe('number');
      expect(data.responseTime).toBeGreaterThan(0);
    });

    it('should handle AWS service checks if configured', async () => {
      // Mock AWS credentials as available
      process.env.AWS_ACCESS_KEY_ID = 'test-key';
      process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';
      
      const request = new NextRequest('http://localhost:3000/api/health');
      
      const response = await GET(request);
      const data = await response.json();
      
      expect([200, 503]).toContain(response.status);
      
      // Clean up
      delete process.env.AWS_ACCESS_KEY_ID;
      delete process.env.AWS_SECRET_ACCESS_KEY;
    });
  });

  describe('Error Handling', () => {
    it('should handle unexpected errors gracefully', async () => {
      // Mock an unexpected error in the health check process
      mockPrisma.$queryRaw.mockImplementation(() => {
        throw new Error('Unexpected system error');
      });
      
      const request = new NextRequest('http://localhost:3000/api/health');
      
      const response = await GET(request);
      
      expect(response.status).toBe(503);
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should return valid JSON even on critical failures', async () => {
      mockPrisma.$queryRaw.mockRejectedValue(new Error('Critical DB failure'));
      
      const request = new NextRequest('http://localhost:3000/api/health');
      
      const response = await GET(request);
      
      // Should be valid JSON
      const data = await response.json();
      expect(data).toBeInstanceOf(Object);
      expect(data.status).toBe('unhealthy');
    });
  });

  describe('Performance', () => {
    it('should complete health check within acceptable time', async () => {
      const request = new NextRequest('http://localhost:3000/api/health');
      
      const startTime = Date.now();
      await GET(request);
      const duration = Date.now() - startTime;
      
      // Health check should complete quickly
      expect(duration).toBeLessThan(3000); // Within 3 seconds
    });

    it('should handle load efficiently', async () => {
      const requests = Array.from({ length: 20 }, () => 
        new NextRequest('http://localhost:3000/api/health')
      );
      
      const startTime = Date.now();
      const promises = requests.map(request => GET(request));
      await Promise.all(promises);
      const duration = Date.now() - startTime;
      
      // Should handle 20 concurrent requests efficiently
      expect(duration).toBeLessThan(5000); // Within 5 seconds for 20 requests
    });
  });
}); 