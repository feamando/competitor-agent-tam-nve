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
    competitor: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    competitorSnapshot: {
      create: jest.fn(),
      findFirst: jest.fn(),
    },
    project: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock('@/services/webScraper', () => ({
  webScraperService: {
    initialize: jest.fn(),
    captureSnapshot: jest.fn(),
    cleanup: jest.fn(),
  },
}));

// Service to test
let smartDataCollectionService: any;

describe('SmartDataCollectionService Edge Cases', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.resetModules();
  });
  
  it('should handle empty competitor list gracefully', async () => {
    const { SmartDataCollectionService } = await import('@/services/reports/smartDataCollectionService');
    smartDataCollectionService = new SmartDataCollectionService();
    
    const result = await smartDataCollectionService.collectCompetitorData([], { projectId: 'project-123' });
    
    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    expect(result.competitorCount).toBe(0);
    expect(result.competitorData).toEqual([]);
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('No competitors'), expect.any(Object));
  });
  
  it('should handle web scraper initialization failure', async () => {
    const { SmartDataCollectionService } = await import('@/services/reports/smartDataCollectionService');
    smartDataCollectionService = new SmartDataCollectionService();
    const { webScraperService } = require('@/services/webScraper');
    
    // Mock web scraper to fail initialization
    webScraperService.initialize.mockRejectedValue(
      new Error('Failed to initialize web scraper')
    );
    
    const competitors = [
      { id: 'comp-1', name: 'Competitor 1', website: 'https://competitor1.com' }
    ];
    
    // Should still complete with fallback data
    const result = await smartDataCollectionService.collectCompetitorData(competitors, { 
      projectId: 'project-123',
      requireFreshSnapshots: true
    });
    
    expect(result).toBeDefined();
    expect(result.success).toBe(true); // Should succeed with fallback
    expect(result.warnings).toBeDefined();
    expect(result.warnings).toContain(expect.stringContaining('scraper'));
    expect(logger.warn).toHaveBeenCalled();
  });
  
  it('should handle invalid competitor websites', async () => {
    const { SmartDataCollectionService } = await import('@/services/reports/smartDataCollectionService');
    smartDataCollectionService = new SmartDataCollectionService();
    const { webScraperService } = require('@/services/webScraper');
    
    webScraperService.initialize.mockResolvedValue(true);
    
    // Invalid website
    const competitors = [
      { 
        id: 'comp-1', 
        name: 'Invalid Website Competitor', 
        website: 'not-a-valid-url'
      }
    ];
    
    // Should handle invalid URL
    const result = await smartDataCollectionService.collectCompetitorData(competitors, { 
      projectId: 'project-123',
      requireFreshSnapshots: true
    });
    
    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    expect(result.competitorCount).toBe(1);
    expect(result.competitorData[0].dataQuality).toBe('minimal');
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Invalid'), expect.any(Object));
  });
  
  it('should handle timeouts during data collection', async () => {
    const { SmartDataCollectionService } = await import('@/services/reports/smartDataCollectionService');
    smartDataCollectionService = new SmartDataCollectionService();
    const { webScraperService } = require('@/services/webScraper');
    
    // Mock scraper to take too long
    webScraperService.initialize.mockResolvedValue(true);
    webScraperService.captureSnapshot.mockImplementation(() => {
      return new Promise(resolve => setTimeout(() => resolve({
        success: true,
        data: { metadata: { title: 'Slow Website' } }
      }), 1000)); // Long delay
    });
    
    // Set of competitors
    const competitors = [
      { id: 'comp-1', name: 'Competitor 1', website: 'https://competitor1.com' },
      { id: 'comp-2', name: 'Competitor 2', website: 'https://competitor2.com' }
    ];
    
    // Should timeout and fall back to existing data
    const result = await smartDataCollectionService.collectCompetitorData(competitors, { 
      projectId: 'project-123',
      requireFreshSnapshots: true,
      maxCaptureTime: 500 // Very short timeout (500ms)
    });
    
    expect(result).toBeDefined();
    expect(result.success).toBe(true); // Still succeeds with fallbacks
    expect(result.warnings).toBeDefined();
    expect(result.warnings).toContain(expect.stringContaining('timeout'));
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('timeout'), expect.any(Object));
  });
  
  it('should handle corrupted existing snapshot data', async () => {
    const { SmartDataCollectionService } = await import('@/services/reports/smartDataCollectionService');
    smartDataCollectionService = new SmartDataCollectionService();
    
    // Mock competitor with corrupted snapshot
    const competitors = [
      { 
        id: 'comp-corrupted', 
        name: 'Corrupted Data Competitor', 
        website: 'https://corrupted.com',
        snapshots: [
          {
            id: 'snapshot-1',
            competitorId: 'comp-corrupted',
            metadata: 'not-an-object', // Corrupted metadata (string instead of object)
            createdAt: new Date()
          }
        ]
      }
    ];
    
    // Mock scraper to fail
    const { webScraperService } = require('@/services/webScraper');
    webScraperService.initialize.mockResolvedValue(true);
    webScraperService.captureSnapshot.mockRejectedValue(
      new Error('Scraper error')
    );
    
    // Should handle corrupted data gracefully
    const result = await smartDataCollectionService.collectCompetitorData(competitors, { 
      projectId: 'project-123',
      requireFreshSnapshots: false // Fall back to existing data
    });
    
    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    expect(result.competitorCount).toBe(1);
    expect(result.competitorData[0].dataSource).toBe('basic_metadata');
    expect(result.competitorData[0].dataQuality).toBe('minimal');
    expect(logger.error).toHaveBeenCalled();
  });
  
  it('should handle database failures during collection', async () => {
    const { SmartDataCollectionService } = await import('@/services/reports/smartDataCollectionService');
    smartDataCollectionService = new SmartDataCollectionService();
    
    // Mock competitor
    const competitors = [
      { id: 'comp-1', name: 'Competitor 1', website: 'https://competitor1.com' }
    ];
    
    // Mock web scraper to succeed but database to fail
    const { webScraperService } = require('@/services/webScraper');
    webScraperService.initialize.mockResolvedValue(true);
    webScraperService.captureSnapshot.mockResolvedValue({
      success: true,
      data: { metadata: { title: 'Test Website' } }
    });
    
    // Database failure
    (prisma.competitorSnapshot.create as jest.Mock).mockRejectedValue(
      new Error('Database error')
    );
    
    // Should handle database error gracefully
    const result = await smartDataCollectionService.collectCompetitorData(competitors, { 
      projectId: 'project-123',
      requireFreshSnapshots: true
    });
    
    expect(result).toBeDefined();
    expect(result.success).toBe(true); // Still succeeds overall
    expect(result.warnings).toBeDefined();
    expect(result.warnings).toContain(expect.stringContaining('database'));
    expect(logger.error).toHaveBeenCalled();
  });
  
  it('should handle priority fallbacks properly', async () => {
    const { SmartDataCollectionService } = await import('@/services/reports/smartDataCollectionService');
    smartDataCollectionService = new SmartDataCollectionService();
    
    // Mock web scraper to fail
    const { webScraperService } = require('@/services/webScraper');
    webScraperService.initialize.mockResolvedValue(true);
    webScraperService.captureSnapshot.mockRejectedValue(
      new Error('Scraper failed')
    );
    
    // Mock competitor with existing snapshots
    const competitors = [
      { 
        id: 'comp-with-snapshot', 
        name: 'Competitor With Snapshot', 
        website: 'https://withsnapshot.com',
        snapshots: [
          {
            id: 'snapshot-1',
            competitorId: 'comp-with-snapshot',
            metadata: { title: 'Existing Snapshot' },
            createdAt: new Date()
          }
        ]
      }
    ];
    
    // Should fall back to existing snapshots (Priority 4)
    const result = await smartDataCollectionService.collectCompetitorData(competitors, { 
      projectId: 'project-123',
      requireFreshSnapshots: true // Try fresh first, but allow fallback
    });
    
    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    expect(result.competitorCount).toBe(1);
    expect(result.competitorData[0].dataSource).toBe('existing_snapshot');
    expect(result.competitorData[0].dataQuality).toBe('medium');
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Priority 4'), expect.any(Object));
  });
}); 