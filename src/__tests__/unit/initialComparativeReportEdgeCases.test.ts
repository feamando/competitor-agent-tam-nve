import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';

// Mock dependencies
jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  prisma: {
    project: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    competitor: {
      findMany: jest.fn(),
    },
    product: {
      findUnique: jest.fn(),
    },
    competitorSnapshot: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    report: {
      create: jest.fn(),
    },
    productSnapshot: {
      findFirst: jest.fn(),
    },
  },
}));

// Services to test
let initialComparativeReportService: any;

describe('InitialComparativeReportService Edge Cases', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.resetModules();
  });
  
  it('should handle missing project data gracefully', async () => {
    // Arrange - Missing project
    (prisma.project.findUnique as jest.Mock).mockResolvedValue(null);
    
    const { InitialComparativeReportService } = await import('@/services/reports/initialComparativeReportService');
    initialComparativeReportService = new InitialComparativeReportService();
    
    // Act
    const result = await initialComparativeReportService.generateInitialReport('non-existent-id');
    
    // Assert
    expect(result).toBeDefined();
    expect(result.success).toBe(false);
    expect(result.error).toContain('Project not found');
    expect(logger.error).toHaveBeenCalled();
  });
  
  it('should handle project with no competitors', async () => {
    // Arrange - Project with no competitors
    (prisma.project.findUnique as jest.Mock).mockResolvedValue({
      id: 'project-123',
      name: 'Test Project',
      competitors: [],
      product: {
        id: 'product-123',
        name: 'Test Product'
      }
    });
    
    const { InitialComparativeReportService } = await import('@/services/reports/initialComparativeReportService');
    initialComparativeReportService = new InitialComparativeReportService();
    
    // Act
    const result = await initialComparativeReportService.generateInitialReport('project-123');
    
    // Assert
    expect(result).toBeDefined();
    expect(result.success).toBe(false);
    expect(result.error).toContain('no competitors');
  });
  
  it('should handle project with missing product data', async () => {
    // Arrange - Project with missing product
    (prisma.project.findUnique as jest.Mock).mockResolvedValue({
      id: 'project-123',
      name: 'Test Project',
      competitors: [
        { id: 'comp-1', name: 'Competitor 1', website: 'https://competitor1.com' }
      ],
      product: null
    });
    
    const { InitialComparativeReportService } = await import('@/services/reports/initialComparativeReportService');
    initialComparativeReportService = new InitialComparativeReportService();
    
    // Act
    const result = await initialComparativeReportService.generateInitialReport('project-123');
    
    // Assert
    expect(result).toBeDefined();
    expect(result.success).toBe(false);
    expect(result.error).toContain('product data');
  });
  
  it('should handle competitors with no snapshots', async () => {
    // Arrange - Competitors with no snapshots
    (prisma.project.findUnique as jest.Mock).mockResolvedValue({
      id: 'project-123',
      name: 'Test Project',
      competitors: [
        { id: 'comp-1', name: 'Competitor 1', website: 'https://competitor1.com', snapshots: [] }
      ],
      product: {
        id: 'product-123',
        name: 'Test Product'
      }
    });
    
    (prisma.competitorSnapshot.findMany as jest.Mock).mockResolvedValue([]);
    
    const { InitialComparativeReportService } = await import('@/services/reports/initialComparativeReportService');
    initialComparativeReportService = new InitialComparativeReportService();
    
    // Act
    const result = await initialComparativeReportService.generateInitialReport('project-123', {
      fallbackToPartialData: false
    });
    
    // Assert
    expect(result).toBeDefined();
    expect(result.success).toBe(false);
    expect(result.error).toContain('No competitor snapshots');
  });
  
  it('should handle database connection failures during competitor snapshot capture', async () => {
    // Arrange - Project with all required data
    (prisma.project.findUnique as jest.Mock).mockResolvedValue({
      id: 'project-123',
      name: 'Test Project',
      competitors: [
        { id: 'comp-1', name: 'Competitor 1', website: 'https://competitor1.com', snapshots: [] }
      ],
      product: {
        id: 'product-123',
        name: 'Test Product'
      }
    });
    
    // Mock database connection failure
    (prisma.competitorSnapshot.create as jest.Mock).mockRejectedValue(
      new Error('Database connection error')
    );
    
    const { InitialComparativeReportService } = await import('@/services/reports/initialComparativeReportService');
    initialComparativeReportService = new InitialComparativeReportService();
    
    // Act
    const result = await initialComparativeReportService.captureCompetitorSnapshots('project-123');
    
    // Assert
    expect(result).toBeDefined();
    expect(result.success).toBe(false);
    expect(result.error).toContain('Database connection error');
  });
  
  it('should handle malformed data from competitors', async () => {
    // Arrange - Project with malformed competitor data
    (prisma.project.findUnique as jest.Mock).mockResolvedValue({
      id: 'project-123',
      name: 'Test Project',
      competitors: [
        { 
          id: 'comp-1',
          name: null, // Missing name
          website: 'not-a-valid-url', // Invalid URL
          snapshots: [
            {
              id: 'snap-1',
              metadata: null, // Missing metadata
              createdAt: new Date()
            }
          ]
        }
      ],
      product: {
        id: 'product-123',
        name: 'Test Product'
      }
    });
    
    const { InitialComparativeReportService } = await import('@/services/reports/initialComparativeReportService');
    initialComparativeReportService = new InitialComparativeReportService();
    
    // Act - Force partial data handling
    const result = await initialComparativeReportService.generateInitialReport('project-123', {
      fallbackToPartialData: true
    });
    
    // Assert - Should use partial data handling
    expect(result).toBeDefined();
    expect(logger.warn).toHaveBeenCalled();
  });
  
  it('should handle timeouts during report generation', async () => {
    // Arrange - Project with all required data
    (prisma.project.findUnique as jest.Mock).mockResolvedValue({
      id: 'project-123',
      name: 'Test Project',
      competitors: [
        { 
          id: 'comp-1',
          name: 'Competitor 1',
          website: 'https://competitor1.com',
          snapshots: [
            {
              id: 'snap-1',
              metadata: { data: 'test' },
              createdAt: new Date(),
              competitorId: 'comp-1'
            }
          ]
        }
      ],
      product: {
        id: 'product-123',
        name: 'Test Product'
      }
    });
    
    (prisma.productSnapshot.findFirst as jest.Mock).mockResolvedValue({
      id: 'prod-snap-1',
      productId: 'product-123',
      metadata: { data: 'test' },
      createdAt: new Date()
    });
    
    const { InitialComparativeReportService } = await import('@/services/reports/initialComparativeReportService');
    initialComparativeReportService = new InitialComparativeReportService();
    
    // Simulate timeout by making captureCompetitorSnapshots take a long time
    initialComparativeReportService.captureCompetitorSnapshots = jest.fn().mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve({
        success: false,
        error: 'Operation timed out',
        capturedCount: 0,
        totalCompetitors: 1
      }), 100))
    );
    
    // Act - Set very short timeout
    const result = await initialComparativeReportService.generateInitialReport('project-123', {
      timeout: 10 // Extremely short timeout to force failure
    });
    
    // Assert
    expect(result).toBeDefined();
    expect(result.success).toBe(false);
    expect(result.error).toContain('timed out');
  });
}); 