/**
 * Profile Utils - Profile validation and helper functions
 * Part of TP-026 Basic User Profiles Implementation
 */

import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { SessionManager } from './sessionManager';
import { profileService } from './profileService';

/**
 * Get current profile ID from session or default
 */
export async function getCurrentProfileId(): Promise<string> {
  try {
    // Try to get from session first
    const sessionProfileId = SessionManager.validateSession();
    if (sessionProfileId) {
      // Verify profile still exists in database
      const profile = await profileService.getProfileById(sessionProfileId);
      if (profile) {
        return sessionProfileId;
      } else {
        // Profile was deleted, clear session
        SessionManager.clearSession();
      }
    }

    // Fallback to default profile
    const defaultProfile = await profileService.getDefaultProfile();
    return defaultProfile.id;
  } catch (error) {
    logger.error('Failed to get current profile ID:', error as Error);
    // Create and return default profile as last resort
    const defaultProfile = await profileService.getDefaultProfile();
    return defaultProfile.id;
  }
}

/**
 * Get current profile with full data
 */
export async function getCurrentProfile() {
  try {
    const profileId = await getCurrentProfileId();
    return await profileService.getProfileById(profileId);
  } catch (error) {
    logger.error('Failed to get current profile:', error as Error);
    return await profileService.getDefaultProfile();
  }
}

/**
 * Profile-scoped query helpers
 */
export class ProfileScopedQueries {
  /**
   * Get projects for current profile
   */
  static async getProjectsForCurrentProfile() {
    const profileId = await getCurrentProfileId();
    return prisma.project.findMany({
      where: { profileId },
      include: {
        user: true,
        competitors: true,
        reports: true,
        products: true
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  /**
   * Get competitors for current profile
   */
  static async getCompetitorsForCurrentProfile() {
    const profileId = await getCurrentProfileId();
    return prisma.competitor.findMany({
      where: { profileId },
      include: {
        projects: true,
        snapshots: true,
        reports: true
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  /**
   * Get reports for current profile (through project association)
   */
  static async getReportsForCurrentProfile() {
    const profileId = await getCurrentProfileId();
    return prisma.report.findMany({
      where: {
        project: {
          profileId
        }
      },
      include: {
        project: true,
        competitor: true,
        versions: true
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  /**
   * Create project with current profile association
   */
  static async createProjectForCurrentProfile(projectData: any) {
    const profileId = await getCurrentProfileId();
    return prisma.project.create({
      data: {
        ...projectData,
        profileId
      }
    });
  }

  /**
   * Create competitor with current profile association
   */
  static async createCompetitorForCurrentProfile(competitorData: any) {
    const profileId = await getCurrentProfileId();
    return prisma.competitor.create({
      data: {
        ...competitorData,
        profileId
      }
    });
  }

  /**
   * Check if resource belongs to current profile
   */
  static async verifyResourceAccess(resourceType: 'project' | 'competitor', resourceId: string): Promise<boolean> {
    try {
      const profileId = await getCurrentProfileId();
      
      switch (resourceType) {
        case 'project':
          const project = await prisma.project.findFirst({
            where: { id: resourceId, profileId }
          });
          return !!project;
          
        case 'competitor':
          const competitor = await prisma.competitor.findFirst({
            where: { id: resourceId, profileId }
          });
          return !!competitor;
          
        default:
          return false;
      }
    } catch (error) {
      logger.error(`Failed to verify ${resourceType} access for ${resourceId}:`, error as Error);
      return false;
    }
  }
}

/**
 * Email validation helpers
 */
export class EmailValidation {
  /**
   * Validate email format
   */
  static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Check if email is HelloFresh domain (optional constraint)
   */
  static isHelloFreshEmail(email: string): boolean {
    return email.toLowerCase().endsWith('@hellofresh.com');
  }

  /**
   * Normalize email (lowercase, trim)
   */
  static normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }
}

/**
 * Profile access middleware helper
 */
export async function requireProfileAccess(): Promise<string> {
  const profileId = await getCurrentProfileId();
  if (!profileId) {
    throw new Error('Profile access required');
  }
  return profileId;
}

/**
 * Update existing mock user system to use profiles
 */
export async function getOrCreateMockUserWithProfile(): Promise<{ user: any; profile: any }> {
  try {
    // Get current profile
    const profile = await getCurrentProfile();
    if (!profile) {
      throw new Error('Failed to get profile');
    }

    // Get or create user associated with profile
    let user = await prisma.user.findFirst({
      where: { profileId: profile.id }
    });

    if (!user) {
      // Create user linked to profile
      user = await prisma.user.create({
        data: {
          email: profile.email,
          name: profile.name || 'Profile User',
          profileId: profile.id
        }
      });
    }

    return { user, profile };
  } catch (error) {
    logger.error('Failed to get or create mock user with profile:', error as Error);
    
    // Fallback to default profile and user
    const defaultProfile = await profileService.getDefaultProfile();
    let defaultUser = await prisma.user.findFirst({
      where: { profileId: defaultProfile.id }
    });

    if (!defaultUser) {
      defaultUser = await prisma.user.create({
        data: {
          email: defaultProfile.email,
          name: 'System User',
          profileId: defaultProfile.id
        }
      });
    }

    return { user: defaultUser, profile: defaultProfile };
  }
}
