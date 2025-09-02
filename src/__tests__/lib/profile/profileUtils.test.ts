/**
 * Unit Tests for ProfileUtils
 * Tests profile utilities, scoped queries, and helper functions
 */

import {
  getCurrentProfileId,
  getCurrentProfile,
  ProfileScopedQueries,
  EmailValidation,
  requireProfileAccess,
  getOrCreateMockUserWithProfile
} from '@/lib/profile/profileUtils';
import { SessionManager } from '@/lib/profile/sessionManager';
import { profileService } from '@/lib/profile/profileService';

// Mock dependencies
jest.mock('@/lib/profile/sessionManager');
jest.mock('@/lib/profile/profileService');
jest.mock('@/lib/prisma', () => ({
  prisma: {
    project: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    competitor: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    user: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
  },
}));
jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

const mockSessionManager = SessionManager as jest.Mocked<typeof SessionManager>;
const mockProfileService = profileService as jest.Mocked<typeof profileService>;
const mockPrisma = require('@/lib/prisma').prisma;

describe('getCurrentProfileId', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return profile ID from valid session', async () => {
    mockSessionManager.validateSession.mockReturnValue('profile-123');
    mockProfileService.getProfileById.mockResolvedValue({
      id: 'profile-123',
      email: 'test@hellofresh.com',
      name: 'Test User',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await getCurrentProfileId();

    expect(result).toBe('profile-123');
    expect(mockSessionManager.validateSession).toHaveBeenCalled();
    expect(mockProfileService.getProfileById).toHaveBeenCalledWith('profile-123');
  });

  it('should fallback to default profile when session invalid', async () => {
    mockSessionManager.validateSession.mockReturnValue(null);
    mockProfileService.getDefaultProfile.mockResolvedValue({
      id: 'default-profile',
      email: 'system@hellofresh.com',
      name: 'System Default',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await getCurrentProfileId();

    expect(result).toBe('default-profile');
    expect(mockProfileService.getDefaultProfile).toHaveBeenCalled();
  });

  it('should clear session and fallback when profile deleted', async () => {
    mockSessionManager.validateSession.mockReturnValue('deleted-profile');
    mockProfileService.getProfileById.mockResolvedValue(null);
    mockProfileService.getDefaultProfile.mockResolvedValue({
      id: 'default-profile',
      email: 'system@hellofresh.com',
      name: 'System Default',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await getCurrentProfileId();

    expect(result).toBe('default-profile');
    expect(mockSessionManager.clearSession).toHaveBeenCalled();
    expect(mockProfileService.getDefaultProfile).toHaveBeenCalled();
  });

  it('should handle errors gracefully', async () => {
    mockSessionManager.validateSession.mockImplementation(() => {
      throw new Error('Session validation failed');
    });
    mockProfileService.getDefaultProfile.mockResolvedValue({
      id: 'default-profile',
      email: 'system@hellofresh.com',
      name: 'System Default',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await getCurrentProfileId();

    expect(result).toBe('default-profile');
    expect(mockProfileService.getDefaultProfile).toHaveBeenCalled();
  });
});

describe('getCurrentProfile', () => {
  it('should return current profile', async () => {
    const mockProfile = {
      id: 'profile-123',
      email: 'test@hellofresh.com',
      name: 'Test User',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockSessionManager.validateSession.mockReturnValue('profile-123');
    mockProfileService.getProfileById.mockResolvedValue(mockProfile);

    const result = await getCurrentProfile();

    expect(result).toEqual(mockProfile);
  });

  it('should fallback to default profile on error', async () => {
    const defaultProfile = {
      id: 'default-profile',
      email: 'system@hellofresh.com',
      name: 'System Default',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockSessionManager.validateSession.mockImplementation(() => {
      throw new Error('Session error');
    });
    mockProfileService.getDefaultProfile.mockResolvedValue(defaultProfile);

    const result = await getCurrentProfile();

    expect(result).toBeDefined();
    expect(typeof result.id).toBe('string');
    expect(typeof result.email).toBe('string');
  });
});

describe('ProfileScopedQueries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getProjectsForCurrentProfile', () => {
    it('should return projects for current profile', async () => {
      const mockProjects = [
        {
          id: 'project-1',
          name: 'Test Project',
          profileId: 'profile-123',
          userId: 'user-1',
          description: 'Test',
          status: 'ACTIVE' as const,
          priority: 'MEDIUM' as const,
          startDate: new Date(),
          endDate: null,
          parameters: {},
          tags: {},
          createdAt: new Date(),
          updatedAt: new Date(),
          scrapingFrequency: null,
          userEmail: null,
          user: { id: 'user-1', email: 'test@hellofresh.com', name: 'Test' },
          competitors: [],
          reports: [],
          products: []
        }
      ];

      mockSessionManager.validateSession.mockReturnValue('profile-123');
      mockProfileService.getProfileById.mockResolvedValue({
        id: 'profile-123',
        email: 'test@hellofresh.com',
        name: 'Test User',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockPrisma.project.findMany.mockResolvedValue(mockProjects);

      const result = await ProfileScopedQueries.getProjectsForCurrentProfile();

      expect(mockPrisma.project.findMany).toHaveBeenCalledWith({
        where: { profileId: 'profile-123' },
        include: {
          user: true,
          competitors: true,
          reports: true,
          products: true
        },
        orderBy: { createdAt: 'desc' }
      });
      expect(result).toEqual(mockProjects);
    });
  });

  describe('getCompetitorsForCurrentProfile', () => {
    it('should return competitors for current profile', async () => {
      const mockCompetitors = [
        {
          id: 'competitor-1',
          name: 'Test Competitor',
          website: 'https://test.com',
          profileId: 'profile-123',
          industry: 'Tech',
          description: null,
          employeeCount: null,
          revenue: null,
          founded: null,
          headquarters: null,
          socialMedia: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          projects: [],
          snapshots: [],
          reports: []
        }
      ];

      mockSessionManager.validateSession.mockReturnValue('profile-123');
      mockProfileService.getProfileById.mockResolvedValue({
        id: 'profile-123',
        email: 'test@hellofresh.com',
        name: 'Test User',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockPrisma.competitor.findMany.mockResolvedValue(mockCompetitors);

      const result = await ProfileScopedQueries.getCompetitorsForCurrentProfile();

      expect(mockPrisma.competitor.findMany).toHaveBeenCalledWith({
        where: { profileId: 'profile-123' },
        include: {
          projects: true,
          snapshots: true,
          reports: true
        },
        orderBy: { createdAt: 'desc' }
      });
      expect(result).toEqual(mockCompetitors);
    });
  });

  describe('createProjectForCurrentProfile', () => {
    it('should create project with current profile ID', async () => {
      const projectData = {
        name: 'New Project',
        description: 'Test project',
        userId: 'user-1'
      };

      const mockProject = {
        id: 'project-new',
        ...projectData,
        profileId: 'profile-123',
        status: 'DRAFT' as const,
        priority: 'MEDIUM' as const,
        startDate: new Date(),
        endDate: null,
        parameters: {},
        tags: {},
        createdAt: new Date(),
        updatedAt: new Date(),
        scrapingFrequency: null,
        userEmail: null,
      };

      mockSessionManager.validateSession.mockReturnValue('profile-123');
      mockProfileService.getProfileById.mockResolvedValue({
        id: 'profile-123',
        email: 'test@hellofresh.com',
        name: 'Test User',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockPrisma.project.create.mockResolvedValue(mockProject);

      const result = await ProfileScopedQueries.createProjectForCurrentProfile(projectData);

      expect(mockPrisma.project.create).toHaveBeenCalledWith({
        data: {
          ...projectData,
          profileId: 'profile-123'
        }
      });
      expect(result).toEqual(mockProject);
    });
  });

  describe('verifyResourceAccess', () => {
    it('should return true for accessible project', async () => {
      mockSessionManager.validateSession.mockReturnValue('profile-123');
      mockProfileService.getProfileById.mockResolvedValue({
        id: 'profile-123',
        email: 'test@hellofresh.com',
        name: 'Test User',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockPrisma.project.findFirst.mockResolvedValue({
        id: 'project-1',
        profileId: 'profile-123'
      } as any);

      const result = await ProfileScopedQueries.verifyResourceAccess('project', 'project-1');

      expect(result).toBe(true);
      expect(mockPrisma.project.findFirst).toHaveBeenCalledWith({
        where: { id: 'project-1', profileId: 'profile-123' }
      });
    });

    it('should return false for inaccessible project', async () => {
      mockSessionManager.validateSession.mockReturnValue('profile-123');
      mockProfileService.getProfileById.mockResolvedValue({
        id: 'profile-123',
        email: 'test@hellofresh.com',
        name: 'Test User',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockPrisma.project.findFirst.mockResolvedValue(null);

      const result = await ProfileScopedQueries.verifyResourceAccess('project', 'project-1');

      expect(result).toBe(false);
    });

    it('should return true for accessible competitor', async () => {
      mockSessionManager.validateSession.mockReturnValue('profile-123');
      mockProfileService.getProfileById.mockResolvedValue({
        id: 'profile-123',
        email: 'test@hellofresh.com',
        name: 'Test User',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockPrisma.competitor.findFirst.mockResolvedValue({
        id: 'competitor-1',
        profileId: 'profile-123'
      } as any);

      const result = await ProfileScopedQueries.verifyResourceAccess('competitor', 'competitor-1');

      expect(result).toBe(true);
    });

    it('should handle database errors gracefully', async () => {
      mockSessionManager.validateSession.mockReturnValue('profile-123');
      mockProfileService.getProfileById.mockResolvedValue({
        id: 'profile-123',
        email: 'test@hellofresh.com',
        name: 'Test User',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockPrisma.project.findFirst.mockRejectedValue(new Error('Database error'));

      const result = await ProfileScopedQueries.verifyResourceAccess('project', 'project-1');

      expect(result).toBe(false);
    });
  });
});

describe('EmailValidation', () => {
  describe('isValidEmail', () => {
    it('should validate correct email formats', () => {
      const validEmails = [
        'test@hellofresh.com',
        'user.name@company.org',
        'user+tag@domain.co.uk',
        'test123@domain.com'
      ];

      validEmails.forEach(email => {
        expect(EmailValidation.isValidEmail(email)).toBe(true);
      });
    });

    it('should reject invalid email formats', () => {
      const invalidEmails = [
        'invalid-email',
        '@domain.com',
        'user@',
        '',
        'user@domain',
        'user name@domain.com'
      ];

      invalidEmails.forEach(email => {
        expect(EmailValidation.isValidEmail(email)).toBe(false);
      });
    });
  });

  describe('isHelloFreshEmail', () => {
    it('should return true for HelloFresh emails', () => {
      const helloFreshEmails = [
        'test@hellofresh.com',
        'user.name@hellofresh.com',
        'TEST@HELLOFRESH.COM'
      ];

      helloFreshEmails.forEach(email => {
        expect(EmailValidation.isHelloFreshEmail(email)).toBe(true);
      });
    });

    it('should return false for non-HelloFresh emails', () => {
      const otherEmails = [
        'test@gmail.com',
        'user@company.org',
        'test@hellofresh.co.uk'
      ];

      otherEmails.forEach(email => {
        expect(EmailValidation.isHelloFreshEmail(email)).toBe(false);
      });
    });
  });

  describe('normalizeEmail', () => {
    it('should normalize email to lowercase and trim', () => {
      expect(EmailValidation.normalizeEmail(' TEST@HELLOFRESH.COM ')).toBe('test@hellofresh.com');
      expect(EmailValidation.normalizeEmail('User.Name@Company.Org')).toBe('user.name@company.org');
      expect(EmailValidation.normalizeEmail('test@domain.com')).toBe('test@domain.com');
    });
  });
});

describe('requireProfileAccess', () => {
  it('should return profile ID when available', async () => {
    mockSessionManager.validateSession.mockReturnValue('profile-123');
    mockProfileService.getProfileById.mockResolvedValue({
      id: 'profile-123',
      email: 'test@hellofresh.com',
      name: 'Test User',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await requireProfileAccess();

    expect(result).toBe('profile-123');
  });

  it('should throw error when no profile available', async () => {
    // Mock both sessionManager to return null and profileService to reject
    mockSessionManager.validateSession.mockReturnValue(null);
    mockProfileService.getDefaultProfile.mockRejectedValue(new Error('No default profile available'));

    await expect(requireProfileAccess()).rejects.toThrow();
  });
});

describe('getOrCreateMockUserWithProfile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return existing user and profile', async () => {
    const mockProfile = {
      id: 'profile-123',
      email: 'test@hellofresh.com',
      name: 'Test User',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const mockUser = {
      id: 'user-123',
      email: 'test@hellofresh.com',
      name: 'Test User',
      profileId: 'profile-123',
      emailVerified: null,
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockSessionManager.validateSession.mockReturnValue('profile-123');
    mockProfileService.getProfileById.mockResolvedValue(mockProfile);
    mockPrisma.user.findFirst.mockResolvedValue(mockUser);

    const result = await getOrCreateMockUserWithProfile();

    expect(result).toEqual({ user: mockUser, profile: mockProfile });
    expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({
      where: { profileId: 'profile-123' }
    });
  });

  it('should create new user for existing profile', async () => {
    const mockProfile = {
      id: 'profile-123',
      email: 'test@hellofresh.com',
      name: 'Test User',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const mockNewUser = {
      id: 'user-new',
      email: 'test@hellofresh.com',
      name: 'Test User',
      profileId: 'profile-123',
      emailVerified: null,
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockSessionManager.validateSession.mockReturnValue('profile-123');
    mockProfileService.getProfileById.mockResolvedValue(mockProfile);
    mockPrisma.user.findFirst.mockResolvedValue(null);
    mockPrisma.user.create.mockResolvedValue(mockNewUser);

    const result = await getOrCreateMockUserWithProfile();

    expect(result).toEqual({ user: mockNewUser, profile: mockProfile });
    expect(mockPrisma.user.create).toHaveBeenCalledWith({
      data: {
        email: 'test@hellofresh.com',
        name: 'Test User',
        profileId: 'profile-123'
      }
    });
  });

  it('should fallback to default profile on error', async () => {
    const defaultProfile = {
      id: 'default-profile',
      email: 'system@hellofresh.com',
      name: 'System Default',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const defaultUser = {
      id: 'default-user',
      email: 'system@hellofresh.com',
      name: 'System User',
      profileId: 'default-profile',
      emailVerified: null,
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockSessionManager.validateSession.mockImplementation(() => {
      throw new Error('Session error');
    });
    mockProfileService.getDefaultProfile.mockResolvedValue(defaultProfile);
    mockPrisma.user.findFirst.mockResolvedValue(defaultUser);

    const result = await getOrCreateMockUserWithProfile();

    expect(result).toBeDefined();
    expect(result.user).toBeDefined();
    expect(result.profile).toBeDefined();
    expect(typeof result.user.profileId).toBe('string');
    expect(typeof result.profile.id).toBe('string');
    expect(mockProfileService.getDefaultProfile).toHaveBeenCalled();
  });
});
