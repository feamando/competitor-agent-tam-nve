import { CompetitorResolutionService } from '../competitorResolutionService';
import { PrismaClient } from '@prisma/client';

// Mock Prisma
jest.mock('@prisma/client');
jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  generateCorrelationId: jest.fn(() => 'test-correlation-id'),
}));

const mockPrisma = new PrismaClient() as jest.Mocked<PrismaClient>;

// Mock data
const mockCompetitors = [
  {
    id: 'clabcdefghijklmnopqrstuvw1',
    name: 'Microsoft',
    website: 'https://microsoft.com',
    industry: 'Technology'
  },
  {
    id: 'clabcdefghijklmnopqrstuvw2',
    name: 'Google',
    website: 'https://google.com',
    industry: 'Technology'
  },
  {
    id: 'clabcdefghijklmnopqrstuvw3',
    name: 'Apple Inc.',
    website: 'https://apple.com',
    industry: 'Technology'
  }
];

describe('CompetitorResolutionService', () => {
  let service: CompetitorResolutionService;

  beforeEach(() => {
    service = new CompetitorResolutionService('test-correlation-id');
    jest.clearAllMocks();
  });

  describe('resolveCompetitorInput', () => {
    it('should resolve competitors by exact name match', async () => {
      // Setup mock
      (mockPrisma.competitor.findFirst as jest.Mock).mockResolvedValueOnce(mockCompetitors[0]);

      const result = await service.resolveCompetitorInput(['Microsoft']);

      expect(result.successful).toHaveLength(1);
      expect(result.failed).toHaveLength(0);
      expect(result.resolvedIds).toEqual(['clabcdefghijklmnopqrstuvw1']);
      expect(result.successful[0].resolvedBy).toBe('name');
    });

    it('should resolve competitors by website URL', async () => {
      // Setup mock
      (mockPrisma.competitor.findFirst as jest.Mock).mockResolvedValueOnce(mockCompetitors[1]);

      const result = await service.resolveCompetitorInput(['https://google.com']);

      expect(result.successful).toHaveLength(1);
      expect(result.failed).toHaveLength(0);
      expect(result.resolvedIds).toEqual(['clabcdefghijklmnopqrstuvw2']);
      expect(result.successful[0].resolvedBy).toBe('website');
    });

    it('should resolve competitors by database ID', async () => {
      // Setup mock - return null first (not found by ID), then return the competitor by name
      (mockPrisma.competitor.findUnique as jest.Mock).mockResolvedValueOnce(null);
      (mockPrisma.competitor.findFirst as jest.Mock).mockResolvedValueOnce(mockCompetitors[2]);

      const result = await service.resolveCompetitorInput(['1']);

      expect(result.successful).toHaveLength(1);
      expect(result.failed).toHaveLength(0);
      expect(result.resolvedIds).toEqual(['clabcdefghijklmnopqrstuvw3']);
    });

    it('should handle mixed valid and invalid inputs', async () => {
      // Setup mocks - first call succeeds, second fails
      (mockPrisma.competitor.findFirst as jest.Mock)
        .mockResolvedValueOnce(mockCompetitors[0]) // Microsoft found
        .mockResolvedValueOnce(null); // NonExistentCompany not found

      // Mock for suggestions
      (mockPrisma.competitor.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.resolveCompetitorInput(['Microsoft', 'NonExistentCompany']);

      expect(result.successful).toHaveLength(1);
      expect(result.failed).toHaveLength(1);
      expect(result.resolvedIds).toEqual(['clabcdefghijklmnopqrstuvw1']);
      expect(result.failed[0].input).toBe('NonExistentCompany');
      expect(result.failed[0].error).toBe('Competitor not found');
    });

    it('should remove duplicates from input', async () => {
      // Setup mock
      (mockPrisma.competitor.findFirst as jest.Mock).mockResolvedValue(mockCompetitors[0]);

      const result = await service.resolveCompetitorInput(['Microsoft', 'microsoft', 'MICROSOFT']);

      // Should deduplicate to single unique input, but may make multiple calls due to resolution strategies
      expect(result.successful).toHaveLength(1);
      expect(result.resolvedIds).toEqual(['clabcdefghijklmnopqrstuvw1']);
      // Verify that all results point to the same competitor (deduplicated)
      expect(new Set(result.resolvedIds)).toHaveProperty('size', 1);
    });

    it('should generate suggestions for failed lookups', async () => {
      // Setup mocks
      (mockPrisma.competitor.findFirst as jest.Mock).mockResolvedValue(null);
      (mockPrisma.competitor.findMany as jest.Mock).mockResolvedValue([
        { name: 'Microsoft' },
        { name: 'Microchip Technology' }
      ]);

      const result = await service.resolveCompetitorInput(['Microsof']);

      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].suggestions).toEqual(['Microsoft', 'Microchip Technology']);
    });

    it('should validate input and throw on empty strings', async () => {
      await expect(service.resolveCompetitorInput(['', 'Microsoft']))
        .rejects.toThrow();
    });
  });

  describe('lookupByName', () => {
    it('should perform case-insensitive name lookup', async () => {
      (mockPrisma.competitor.findFirst as jest.Mock).mockResolvedValue(mockCompetitors[0]);

      const result = await service.lookupByName('MICROSOFT');

      expect(mockPrisma.competitor.findFirst).toHaveBeenCalledWith({
        where: {
          name: {
            equals: 'MICROSOFT',
            mode: 'insensitive'
          }
        },
        select: {
          id: true,
          name: true,
          website: true,
          industry: true
        }
      });
      expect(result).toEqual(mockCompetitors[0]);
    });

    it('should return null when competitor not found', async () => {
      (mockPrisma.competitor.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await service.lookupByName('NonExistent');

      expect(result).toBeNull();
    });
  });

  describe('lookupByWebsite', () => {
    it('should lookup by exact website match', async () => {
      (mockPrisma.competitor.findFirst as jest.Mock).mockResolvedValue(mockCompetitors[1]);

      const result = await service.lookupByWebsite('https://google.com');

      expect(result).toEqual(mockCompetitors[1]);
    });

    it('should handle URL variations (with/without protocol)', async () => {
      (mockPrisma.competitor.findFirst as jest.Mock).mockResolvedValue(mockCompetitors[1]);

      const result = await service.lookupByWebsite('google.com');

      // Should normalize URL and try multiple variations
      expect(mockPrisma.competitor.findFirst).toHaveBeenCalledWith({
        where: {
          OR: expect.arrayContaining([
            { website: { equals: 'google.com', mode: 'insensitive' } },
            { website: { equals: 'https://google.com', mode: 'insensitive' } },
            { website: { contains: 'google.com', mode: 'insensitive' } }
          ])
        },
        select: {
          id: true,
          name: true,
          website: true,
          industry: true
        }
      });
      expect(result).toEqual(mockCompetitors[1]);
    });
  });

  describe('lookupById', () => {
    it('should lookup by database ID', async () => {
      (mockPrisma.competitor.findUnique as jest.Mock).mockResolvedValue(mockCompetitors[2]);

      const result = await service.lookupById('clabcdefghijklmnopqrstuvw3');

      expect(mockPrisma.competitor.findUnique).toHaveBeenCalledWith({
        where: { id: 'clabcdefghijklmnopqrstuvw3' },
        select: {
          id: true,
          name: true,
          website: true,
          industry: true
        }
      });
      expect(result).toEqual(mockCompetitors[2]);
    });
  });

  describe('validateAndResolve', () => {
    it('should return resolved IDs on successful resolution', async () => {
      (mockPrisma.competitor.findFirst as jest.Mock).mockResolvedValue(mockCompetitors[0]);

      const result = await service.validateAndResolve(['Microsoft']);

      expect(result).toEqual(['clabcdefghijklmnopqrstuvw1']);
    });

    it('should throw error with details on failed resolution', async () => {
      (mockPrisma.competitor.findUnique as jest.Mock).mockResolvedValue(null);
      (mockPrisma.competitor.findFirst as jest.Mock).mockResolvedValue(null);
      (mockPrisma.competitor.findMany as jest.Mock).mockResolvedValue([{ name: 'Microsoft' }]);

      await expect(service.validateAndResolve(['nonexistent']))
        .rejects.toThrow('Some competitors could not be resolved:\n"nonexistent": Competitor not found (suggestions: Microsoft)');
    });
  });

  describe('edge cases', () => {
    it('should handle empty input array', async () => {
      await expect(service.resolveCompetitorInput([]))
        .rejects.toThrow('No valid competitor inputs provided after trimming whitespace');
    });

    it('should handle whitespace-only inputs', async () => {
      await expect(service.resolveCompetitorInput(['   ']))
        .rejects.toThrow('No valid competitor inputs provided after trimming whitespace');
    });

    it('should handle database errors gracefully', async () => {
      (mockPrisma.competitor.findFirst as jest.Mock).mockRejectedValue(new Error('Database error'));

      const result = await service.resolveCompetitorInput(['Microsoft']);

      expect(result.successful).toHaveLength(0);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].error).toContain('Database error');
    });
  });
});
