/**
 * Unit Tests for ProfileService
 * Tests the core profile CRUD operations and business logic
 */

import { ProfileService, profileService } from '@/lib/profile/profileService';

// Mock Prisma
jest.mock('@/lib/prisma', () => ({
  prisma: {
    profile: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
  },
}));

// Mock logger
jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

const mockPrisma = require('@/lib/prisma').prisma;

describe('ProfileService', () => {
  let service: ProfileService;

  beforeEach(() => {
    service = new ProfileService();
    jest.clearAllMocks();
  });

  describe('getOrCreateProfile', () => {
    it('should return existing profile when found', async () => {
      const existingProfile = {
        id: 'profile-123',
        email: 'test@hellofresh.com',
        name: 'Test User',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.profile.findUnique.mockResolvedValue(existingProfile);

      const result = await service.getOrCreateProfile('test@hellofresh.com');

      expect(mockPrisma.profile.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@hellofresh.com' }
      });
      expect(mockPrisma.profile.create).not.toHaveBeenCalled();
      expect(result).toEqual(existingProfile);
    });

    it('should create new profile when not found', async () => {
      const newProfile = {
        id: 'profile-456',
        email: 'newuser@hellofresh.com',
        name: 'Newuser',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.profile.findUnique.mockResolvedValue(null);
      mockPrisma.profile.create.mockResolvedValue(newProfile);

      const result = await service.getOrCreateProfile('newuser@hellofresh.com');

      expect(mockPrisma.profile.findUnique).toHaveBeenCalledWith({
        where: { email: 'newuser@hellofresh.com' }
      });
      expect(mockPrisma.profile.create).toHaveBeenCalledWith({
        data: {
          email: 'newuser@hellofresh.com',
          name: 'Newuser'
        }
      });
      expect(result).toEqual(newProfile);
    });

    it('should normalize email to lowercase', async () => {
      const profile = {
        id: 'profile-789',
        email: 'test@hellofresh.com',
        name: 'Test',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.profile.findUnique.mockResolvedValue(null);
      mockPrisma.profile.create.mockResolvedValue(profile);

      await service.getOrCreateProfile('TEST@HELLOFRESH.COM');

      expect(mockPrisma.profile.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@hellofresh.com' }
      });
      expect(mockPrisma.profile.create).toHaveBeenCalledWith({
        data: {
          email: 'test@hellofresh.com',
          name: 'Test'
        }
      });
    });

    it('should throw error for invalid email format', async () => {
      await expect(service.getOrCreateProfile('invalid-email'))
        .rejects.toThrow('Invalid email format: invalid-email');

      expect(mockPrisma.profile.findUnique).not.toHaveBeenCalled();
    });

    it('should handle database errors gracefully', async () => {
      mockPrisma.profile.findUnique.mockRejectedValue(new Error('Database connection failed'));

      await expect(service.getOrCreateProfile('test@hellofresh.com'))
        .rejects.toThrow('Database connection failed');
    });
  });

  describe('getProfileById', () => {
    it('should return profile when found', async () => {
      const profile = {
        id: 'profile-123',
        email: 'test@hellofresh.com',
        name: 'Test User',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.profile.findUnique.mockResolvedValue(profile);

      const result = await service.getProfileById('profile-123');

      expect(mockPrisma.profile.findUnique).toHaveBeenCalledWith({
        where: { id: 'profile-123' }
      });
      expect(result).toEqual(profile);
    });

    it('should return null when not found', async () => {
      mockPrisma.profile.findUnique.mockResolvedValue(null);

      const result = await service.getProfileById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getProfileByEmail', () => {
    it('should return profile when found', async () => {
      const profile = {
        id: 'profile-123',
        email: 'test@hellofresh.com',
        name: 'Test User',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.profile.findUnique.mockResolvedValue(profile);

      const result = await service.getProfileByEmail('test@hellofresh.com');

      expect(mockPrisma.profile.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@hellofresh.com' }
      });
      expect(result).toEqual(profile);
    });

    it('should normalize email before lookup', async () => {
      mockPrisma.profile.findUnique.mockResolvedValue(null);

      await service.getProfileByEmail('TEST@HELLOFRESH.COM');

      expect(mockPrisma.profile.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@hellofresh.com' }
      });
    });
  });

  describe('updateProfile', () => {
    it('should update profile successfully', async () => {
      const updatedProfile = {
        id: 'profile-123',
        email: 'test@hellofresh.com',
        name: 'Updated Name',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.profile.update.mockResolvedValue(updatedProfile);

      const result = await service.updateProfile('profile-123', { name: 'Updated Name' });

      expect(mockPrisma.profile.update).toHaveBeenCalledWith({
        where: { id: 'profile-123' },
        data: { name: 'Updated Name' }
      });
      expect(result).toEqual(updatedProfile);
    });
  });

  describe('listProfiles', () => {
    it('should return all profiles ordered by creation date', async () => {
      const profiles = [
        {
          id: 'profile-1',
          email: 'user1@hellofresh.com',
          name: 'User 1',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'profile-2',
          email: 'user2@hellofresh.com',
          name: 'User 2',
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      ];

      mockPrisma.profile.findMany.mockResolvedValue(profiles);

      const result = await service.listProfiles();

      expect(mockPrisma.profile.findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: 'desc' }
      });
      expect(result).toEqual(profiles);
    });
  });

  describe('getDefaultProfile', () => {
    it('should get or create system default profile', async () => {
      const defaultProfile = {
        id: 'default-profile',
        email: 'system@hellofresh.com',
        name: 'System Default',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.profile.findUnique.mockResolvedValue(defaultProfile);

      const result = await service.getDefaultProfile();

      expect(mockPrisma.profile.findUnique).toHaveBeenCalledWith({
        where: { email: 'system@hellofresh.com' }
      });
      expect(result).toEqual(defaultProfile);
    });
  });

  describe('email validation', () => {
    it('should validate correct email formats', () => {
      const service = new ProfileService();
      const validEmails = [
        'test@hellofresh.com',
        'user.name@company.org',
        'user+tag@domain.co.uk'
      ];

      validEmails.forEach(email => {
        expect(() => service['isValidEmail'](email)).not.toThrow();
      });
    });

    it('should reject invalid email formats', () => {
      const service = new ProfileService();
      const invalidEmails = [
        'invalid-email',
        '@domain.com', 
        'user@',
        '',
        'user name@domain.com'
      ];

      invalidEmails.forEach(email => {
        expect(service['isValidEmail'](email)).toBe(false);
      });
    });
  });

  describe('name extraction from email', () => {
    it('should extract and format name from email', () => {
      const service = new ProfileService();
      
      expect(service['extractNameFromEmail']('john.doe@hellofresh.com'))
        .toBe('John Doe');
      
      expect(service['extractNameFromEmail']('mary_jane@company.org'))
        .toBe('Mary Jane');
      
      expect(service['extractNameFromEmail']('test.user.name@domain.com'))
        .toBe('Test User Name');
    });
  });
});

describe('profileService singleton', () => {
  it('should be an instance of ProfileService', () => {
    expect(profileService).toBeInstanceOf(ProfileService);
  });
});
