/**
 * Integration Tests for Profile Database Operations
 * Tests the profile system's database interactions and data integrity
 */

import { PrismaClient } from '@prisma/client';
import { profileService } from '@/lib/profile/profileService';
import { 
  getCurrentProfileId, 
  ProfileScopedQueries, 
  getOrCreateMockUserWithProfile 
} from '@/lib/profile/profileUtils';

// Use test database for integration tests
const prisma = new PrismaClient({
  // In a real test environment, you'd use a test database URL
  datasources: {
    db: {
      url: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL,
    },
  },
});

describe('Profile Database Integration', () => {
  // Clean up function
  const cleanupProfiles = async () => {
    await prisma.user.deleteMany({
      where: {
        email: {
          contains: 'test-integration'
        }
      }
    });
    
    await prisma.project.deleteMany({
      where: {
        name: { contains: 'Test Integration' }
      }
    });
    
    await prisma.competitor.deleteMany({
      where: {
        name: { contains: 'Test Integration' }
      }
    });
    
    await prisma.profile.deleteMany({
      where: {
        email: {
          contains: 'test-integration'
        }
      }
    });
  };

  beforeAll(async () => {
    await cleanupProfiles();
  });

  afterAll(async () => {
    await cleanupProfiles();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Clean up between tests
    await cleanupProfiles();
  });

  describe('Profile CRUD Operations', () => {
    it('should create and retrieve profile', async () => {
      const email = 'test-integration-1@hellofresh.com';
      
      // Create profile
      const createdProfile = await profileService.getOrCreateProfile(email);
      
      expect(createdProfile).toBeDefined();
      expect(createdProfile.email).toBe(email);
      expect(createdProfile.id).toBeTruthy();
      
      // Retrieve profile
      const retrievedProfile = await profileService.getProfileById(createdProfile.id);
      
      expect(retrievedProfile).toEqual(createdProfile);
    });

    it('should return existing profile on duplicate email', async () => {
      const email = 'test-integration-2@hellofresh.com';
      
      // Create profile first time
      const firstProfile = await profileService.getOrCreateProfile(email);
      
      // Create profile second time - should return existing
      const secondProfile = await profileService.getOrCreateProfile(email);
      
      expect(firstProfile.id).toBe(secondProfile.id);
      expect(firstProfile.email).toBe(secondProfile.email);
    });

    it('should update profile name', async () => {
      const email = 'test-integration-3@hellofresh.com';
      
      // Create profile
      const profile = await profileService.getOrCreateProfile(email);
      
      // Update name
      const updatedProfile = await profileService.updateProfile(profile.id, {
        name: 'Updated Test Name'
      });
      
      expect(updatedProfile.name).toBe('Updated Test Name');
      expect(updatedProfile.id).toBe(profile.id);
      expect(updatedProfile.email).toBe(profile.email);
    });

    it('should list profiles ordered by creation date', async () => {
      const emails = [
        'test-integration-4a@hellofresh.com',
        'test-integration-4b@hellofresh.com',
        'test-integration-4c@hellofresh.com'
      ];
      
      // Create profiles in sequence
      const profiles = [];
      for (const email of emails) {
        const profile = await profileService.getOrCreateProfile(email);
        profiles.push(profile);
        // Small delay to ensure different timestamps
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      
      // List all profiles
      const allProfiles = await profileService.listProfiles();
      
      // Find our test profiles
      const testProfiles = allProfiles.filter(p => 
        p.email.includes('test-integration-4')
      );
      
      expect(testProfiles).toHaveLength(3);
      
      // Should be ordered by creation date (desc)
      expect(testProfiles[0].email).toBe(emails[2]); // Most recent first
      expect(testProfiles[2].email).toBe(emails[0]); // Oldest last
    });
  });

  describe('Profile-Scoped Data Operations', () => {
    let testProfile: any;
    let otherProfile: any;

    beforeEach(async () => {
      // Create test profiles
      testProfile = await profileService.getOrCreateProfile('test-integration-main@hellofresh.com');
      otherProfile = await profileService.getOrCreateProfile('test-integration-other@hellofresh.com');
    });

    it('should create profile-scoped projects', async () => {
      // Mock session to use test profile
      jest.spyOn(require('@/lib/profile/sessionManager'), 'SessionManager', 'get').mockReturnValue({
        validateSession: () => testProfile.id
      });
      
      const projectData = {
        name: 'Test Integration Project 1',
        description: 'Test project for integration testing',
        userId: 'test-user-id',
        status: 'ACTIVE',
        priority: 'MEDIUM',
        startDate: new Date(),
        parameters: {},
        tags: {}
      };

      const project = await ProfileScopedQueries.createProjectForCurrentProfile(projectData);

      expect(project.profileId).toBe(testProfile.id);
      expect(project.name).toBe(projectData.name);
    });

    it('should create profile-scoped competitors', async () => {
      // Mock session to use test profile
      jest.spyOn(require('@/lib/profile/sessionManager'), 'SessionManager', 'get').mockReturnValue({
        validateSession: () => testProfile.id
      });

      const competitorData = {
        name: 'Test Integration Competitor 1',
        website: 'https://test-integration-competitor.com',
        industry: 'Technology',
        description: 'Test competitor for integration testing'
      };

      const competitor = await ProfileScopedQueries.createCompetitorForCurrentProfile(competitorData);

      expect(competitor.profileId).toBe(testProfile.id);
      expect(competitor.name).toBe(competitorData.name);
    });

    it('should isolate data between profiles', async () => {
      // Create project for first profile
      const project1 = await prisma.project.create({
        data: {
          name: 'Test Integration Project Profile 1',
          description: 'Project for profile 1',
          profileId: testProfile.id,
          status: 'ACTIVE',
          priority: 'MEDIUM',
          userId: 'test-user-1',
          startDate: new Date(),
          parameters: {},
          tags: {}
        }
      });

      // Create project for second profile
      const project2 = await prisma.project.create({
        data: {
          name: 'Test Integration Project Profile 2',
          description: 'Project for profile 2',
          profileId: otherProfile.id,
          status: 'ACTIVE',
          priority: 'MEDIUM',
          userId: 'test-user-2',
          startDate: new Date(),
          parameters: {},
          tags: {}
        }
      });

      // Query projects for first profile
      const profile1Projects = await prisma.project.findMany({
        where: { profileId: testProfile.id }
      });

      // Query projects for second profile
      const profile2Projects = await prisma.project.findMany({
        where: { profileId: otherProfile.id }
      });

      expect(profile1Projects).toHaveLength(1);
      expect(profile1Projects[0].id).toBe(project1.id);

      expect(profile2Projects).toHaveLength(1);
      expect(profile2Projects[0].id).toBe(project2.id);

      // Ensure no cross-contamination
      expect(profile1Projects[0].id).not.toBe(profile2Projects[0].id);
    });

    it('should verify resource access correctly', async () => {
      // Create project for test profile
      const project = await prisma.project.create({
        data: {
          name: 'Test Integration Access Project',
          description: 'Project for access testing',
          profileId: testProfile.id,
          status: 'ACTIVE',
          priority: 'MEDIUM',
          userId: 'test-user-access',
          startDate: new Date(),
          parameters: {},
          tags: {}
        }
      });

      // Create competitor for other profile
      const competitor = await prisma.competitor.create({
        data: {
          name: 'Test Integration Access Competitor',
          website: 'https://test-access-competitor.com',
          industry: 'Technology',
          profileId: otherProfile.id
        }
      });

      // Mock session for test profile
      jest.spyOn(require('@/lib/profile/sessionManager'), 'SessionManager', 'get').mockReturnValue({
        validateSession: () => testProfile.id
      });

      // Should have access to own project
      const hasProjectAccess = await ProfileScopedQueries.verifyResourceAccess('project', project.id);
      expect(hasProjectAccess).toBe(true);

      // Should not have access to other profile's competitor
      const hasCompetitorAccess = await ProfileScopedQueries.verifyResourceAccess('competitor', competitor.id);
      expect(hasCompetitorAccess).toBe(false);
    });
  });

  describe('User-Profile Integration', () => {
    it('should create user linked to profile', async () => {
      const profile = await profileService.getOrCreateProfile('test-integration-user@hellofresh.com');

      // Mock session
      jest.spyOn(require('@/lib/profile/sessionManager'), 'SessionManager', 'get').mockReturnValue({
        validateSession: () => profile.id
      });

      const { user, profile: returnedProfile } = await getOrCreateMockUserWithProfile();

      expect(user.profileId).toBe(profile.id);
      expect(user.email).toBe(profile.email);
      expect(returnedProfile.id).toBe(profile.id);
    });

    it('should return existing user for profile', async () => {
      const profile = await profileService.getOrCreateProfile('test-integration-existing-user@hellofresh.com');

      // Create user first
      const existingUser = await prisma.user.create({
        data: {
          email: profile.email,
          name: 'Existing Test User',
          profileId: profile.id
        }
      });

      // Mock session
      jest.spyOn(require('@/lib/profile/sessionManager'), 'SessionManager', 'get').mockReturnValue({
        validateSession: () => profile.id
      });

      const { user, profile: returnedProfile } = await getOrCreateMockUserWithProfile();

      expect(user.id).toBe(existingUser.id);
      expect(user.profileId).toBe(profile.id);
      expect(returnedProfile.id).toBe(profile.id);
    });
  });

  describe('Database Constraints and Integrity', () => {
    it('should enforce unique email constraint', async () => {
      const email = 'test-integration-unique@hellofresh.com';
      
      // Create first profile
      await profileService.getOrCreateProfile(email);
      
      // Attempt to create duplicate directly in database should fail
      await expect(
        prisma.profile.create({
          data: {
            email,
            name: 'Duplicate Profile'
          }
        })
      ).rejects.toThrow();
    });

    it('should enforce foreign key constraints', async () => {
      // Attempt to create project with non-existent profile ID should fail
      await expect(
        prisma.project.create({
          data: {
            name: 'Invalid Profile Project',
            description: 'Should fail',
            profileId: 'nonexistent-profile-id',
            status: 'ACTIVE',
            priority: 'MEDIUM',
            userId: 'test-user',
            startDate: new Date(),
            parameters: {},
            tags: {}
          }
        })
      ).rejects.toThrow();
    });

    it('should handle profile deletion with proper cascade behavior', async () => {
      const profile = await profileService.getOrCreateProfile('test-integration-cascade@hellofresh.com');

      // Create associated data
      const project = await prisma.project.create({
        data: {
          name: 'Test Integration Cascade Project',
          description: 'Project for cascade testing',
          profileId: profile.id,
          status: 'ACTIVE',
          priority: 'MEDIUM',
          userId: 'test-user-cascade',
          startDate: new Date(),
          parameters: {},
          tags: {}
        }
      });

      const competitor = await prisma.competitor.create({
        data: {
          name: 'Test Integration Cascade Competitor',
          website: 'https://test-cascade-competitor.com',
          industry: 'Technology',
          profileId: profile.id
        }
      });

      // Verify data exists
      expect(await prisma.project.findUnique({ where: { id: project.id } })).toBeTruthy();
      expect(await prisma.competitor.findUnique({ where: { id: competitor.id } })).toBeTruthy();

      // Delete profile should fail due to foreign key constraints (RESTRICT)
      await expect(
        prisma.profile.delete({ where: { id: profile.id } })
      ).rejects.toThrow();

      // Data should still exist
      expect(await prisma.project.findUnique({ where: { id: project.id } })).toBeTruthy();
      expect(await prisma.competitor.findUnique({ where: { id: competitor.id } })).toBeTruthy();
    });
  });

  describe('Performance and Indexing', () => {
    it('should efficiently query projects by profile (indexed query)', async () => {
      const profile = await profileService.getOrCreateProfile('test-integration-performance@hellofresh.com');

      // Create multiple projects
      const projects = [];
      for (let i = 0; i < 10; i++) {
        const project = await prisma.project.create({
          data: {
            name: `Test Integration Performance Project ${i}`,
            description: `Performance test project ${i}`,
            profileId: profile.id,
            status: 'ACTIVE',
            priority: 'MEDIUM',
            userId: `test-user-${i}`,
            startDate: new Date(),
            parameters: {},
            tags: {}
          }
        });
        projects.push(project);
      }

      const startTime = Date.now();
      
      // Query projects by profile (should use index)
      const queriedProjects = await prisma.project.findMany({
        where: { profileId: profile.id },
        orderBy: { createdAt: 'desc' }
      });

      const queryTime = Date.now() - startTime;

      expect(queriedProjects).toHaveLength(10);
      expect(queryTime).toBeLessThan(100); // Should be very fast with proper indexing
    });

    it('should efficiently query profile by email (indexed query)', async () => {
      const email = 'test-integration-email-performance@hellofresh.com';
      
      // Create profile
      await profileService.getOrCreateProfile(email);

      const startTime = Date.now();
      
      // Query profile by email (should use index)
      const profile = await prisma.profile.findUnique({
        where: { email }
      });

      const queryTime = Date.now() - startTime;

      expect(profile).toBeTruthy();
      expect(profile!.email).toBe(email);
      expect(queryTime).toBeLessThan(50); // Should be very fast with unique index
    });
  });
});
