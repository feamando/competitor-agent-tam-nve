/**
 * Tests for Competitor Matching Service - TP-028 Option A
 */

import { CompetitorMatchingService } from '@/lib/competitors/competitorMatching';
import { WebsiteNormalizationService } from '@/lib/competitors/websiteNormalization';
import { PrismaClient } from '@prisma/client';

// Mock the dependencies
jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    competitor: {
      findFirst: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
    }
  }
}));

jest.mock('@/lib/profile/profileUtils', () => ({
  getCurrentProfileId: jest.fn(() => Promise.resolve('test-profile-id'))
}));

jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  }
}));

import prisma from '@/lib/prisma';
import { getCurrentProfileId } from '@/lib/profile/profileUtils';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockGetCurrentProfileId = getCurrentProfileId as jest.MockedFunction<typeof getCurrentProfileId>;

describe('CompetitorMatchingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCurrentProfileId.mockResolvedValue('test-profile-id');
  });

  describe('findExistingCompetitor', () => {
    it('should find competitor by normalized website', async () => {
      const mockCompetitor = {
        id: 'competitor-1',
        name: 'Test Company',
        website: 'https://testcompany.com',
        normalizedWebsite: 'testcompany.com',
        profileId: null,
        profile: null
      };

      mockPrisma.competitor.findFirst.mockResolvedValue(mockCompetitor);

      const result = await CompetitorMatchingService.findExistingCompetitor('https://www.testcompany.com/');

      expect(mockPrisma.competitor.findFirst).toHaveBeenCalledWith({
        where: {
          normalizedWebsite: 'testcompany.com'
        },
        include: {
          profile: true
        }
      });
      expect(result).toEqual(mockCompetitor);
    });

    it('should return null for invalid websites', async () => {
      const result = await CompetitorMatchingService.findExistingCompetitor('localhost');
      expect(mockPrisma.competitor.findFirst).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it('should handle database errors gracefully', async () => {
      mockPrisma.competitor.findFirst.mockRejectedValue(new Error('Database error'));

      const result = await CompetitorMatchingService.findExistingCompetitor('https://testcompany.com');
      expect(result).toBeNull();
    });
  });

  describe('createOrAssociateCompetitor', () => {
    const validCompetitorData = {
      name: 'Test Company',
      website: 'https://testcompany.com',
      industry: 'Technology',
      description: 'A test company'
    };

    it('should create new competitor when none exists', async () => {
      mockPrisma.competitor.findFirst.mockResolvedValue(null);
      
      const newCompetitor = {
        id: 'new-competitor-id',
        ...validCompetitorData,
        normalizedWebsite: 'testcompany.com',
        profileId: 'test-profile-id',
        profile: { id: 'test-profile-id', email: 'test@example.com' }
      };
      
      mockPrisma.competitor.create.mockResolvedValue(newCompetitor);

      const result = await CompetitorMatchingService.createOrAssociateCompetitor(validCompetitorData);

      expect(result.created).toBe(true);
      expect(result.competitor).toEqual(newCompetitor);
      expect(result.message).toBe('Created new competitor');
    });

    it('should claim unowned competitor', async () => {
      const existingCompetitor = {
        id: 'existing-competitor-id',
        name: 'Test Company',
        website: 'https://testcompany.com',
        normalizedWebsite: 'testcompany.com',
        profileId: null, // Unowned
        profile: null
      };
      
      mockPrisma.competitor.findFirst.mockResolvedValue(existingCompetitor);
      
      const updatedCompetitor = {
        ...existingCompetitor,
        profileId: 'test-profile-id',
        profile: { id: 'test-profile-id', email: 'test@example.com' }
      };
      
      mockPrisma.competitor.update.mockResolvedValue(updatedCompetitor);

      const result = await CompetitorMatchingService.createOrAssociateCompetitor(validCompetitorData);

      expect(mockPrisma.competitor.update).toHaveBeenCalledWith({
        where: { id: 'existing-competitor-id' },
        data: { profileId: 'test-profile-id' },
        include: { profile: true }
      });
      
      expect(result.created).toBe(false);
      expect(result.claimed).toBe(true);
      expect(result.message).toBe('Found existing competitor and claimed for your profile');
    });

    it('should return existing competitor if already owned by profile', async () => {
      const existingCompetitor = {
        id: 'existing-competitor-id',
        name: 'Test Company',
        website: 'https://testcompany.com',
        normalizedWebsite: 'testcompany.com',
        profileId: 'test-profile-id', // Already owned by current profile
        profile: { id: 'test-profile-id', email: 'test@example.com' }
      };
      
      mockPrisma.competitor.findFirst.mockResolvedValue(existingCompetitor);

      const result = await CompetitorMatchingService.createOrAssociateCompetitor(validCompetitorData);

      expect(result.created).toBe(false);
      expect(result.claimed).toBeUndefined();
      expect(result.competitor).toEqual(existingCompetitor);
      expect(result.message).toBe('You already have this competitor in your profile');
    });

    it('should throw error if competitor owned by different profile', async () => {
      const existingCompetitor = {
        id: 'existing-competitor-id',
        name: 'Test Company',
        website: 'https://testcompany.com',
        normalizedWebsite: 'testcompany.com',
        profileId: 'different-profile-id', // Owned by different profile
        profile: { id: 'different-profile-id', email: 'other@example.com' }
      };
      
      mockPrisma.competitor.findFirst.mockResolvedValue(existingCompetitor);

      await expect(
        CompetitorMatchingService.createOrAssociateCompetitor(validCompetitorData)
      ).rejects.toThrow('Competitor with website https://testcompany.com already exists under a different profile');
    });
  });

  describe('getProfileAccessibleCompetitors', () => {
    it('should return competitors owned by profile and unowned competitors', async () => {
      const mockCompetitors = [
        {
          id: 'competitor-1',
          name: 'Owned Competitor',
          profileId: 'test-profile-id',
          profile: { id: 'test-profile-id', email: 'test@example.com' }
        },
        {
          id: 'competitor-2',
          name: 'Shared Competitor',
          profileId: null,
          profile: null
        }
      ];

      mockPrisma.competitor.findMany.mockResolvedValue(mockCompetitors);

      const result = await CompetitorMatchingService.getProfileAccessibleCompetitors();

      expect(mockPrisma.competitor.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { profileId: 'test-profile-id' },
            { profileId: null }
          ]
        },
        include: {
          profile: {
            select: { id: true, email: true }
          }
        },
        orderBy: [
          { profileId: 'desc' },
          { name: 'asc' }
        ]
      });

      expect(result).toEqual(mockCompetitors);
    });
  });

  describe('canProfileAccessCompetitor', () => {
    it('should allow access to owned competitor', async () => {
      mockPrisma.competitor.findUnique.mockResolvedValue({
        profileId: 'test-profile-id'
      });

      const result = await CompetitorMatchingService.canProfileAccessCompetitor('competitor-id');
      expect(result).toBe(true);
    });

    it('should allow access to unowned competitor', async () => {
      mockPrisma.competitor.findUnique.mockResolvedValue({
        profileId: null
      });

      const result = await CompetitorMatchingService.canProfileAccessCompetitor('competitor-id');
      expect(result).toBe(true);
    });

    it('should deny access to competitor owned by different profile', async () => {
      mockPrisma.competitor.findUnique.mockResolvedValue({
        profileId: 'different-profile-id'
      });

      const result = await CompetitorMatchingService.canProfileAccessCompetitor('competitor-id');
      expect(result).toBe(false);
    });

    it('should deny access to non-existent competitor', async () => {
      mockPrisma.competitor.findUnique.mockResolvedValue(null);

      const result = await CompetitorMatchingService.canProfileAccessCompetitor('non-existent-id');
      expect(result).toBe(false);
    });
  });
});
