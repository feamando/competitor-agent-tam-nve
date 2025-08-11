/**
 * Profile Service - Core profile CRUD operations
 * Part of TP-026 Basic User Profiles Implementation
 */

import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

export interface Profile {
  id: string;
  email: string;
  name?: string;
  createdAt: Date;
  updatedAt: Date;
}

export class ProfileService {
  /**
   * Get or create a profile by email
   */
  async getOrCreateProfile(email: string): Promise<Profile> {
    try {
      // Validate email format
      if (!this.isValidEmail(email)) {
        throw new Error(`Invalid email format: ${email}`);
      }

      // Try to find existing profile
      let profile = await prisma.profile.findUnique({
        where: { email: email.toLowerCase() }
      });

      // Create profile if it doesn't exist
      if (!profile) {
        logger.info(`Creating new profile for email: ${email}`);
        profile = await prisma.profile.create({
          data: {
            email: email.toLowerCase(),
            name: this.extractNameFromEmail(email)
          }
        });
      }

      return profile;
    } catch (error) {
      logger.error(`Failed to get or create profile for ${email}:`, error as Error);
      throw error;
    }
  }

  /**
   * Get profile by ID
   */
  async getProfileById(profileId: string): Promise<Profile | null> {
    try {
      return await prisma.profile.findUnique({
        where: { id: profileId }
      });
    } catch (error) {
      logger.error(`Failed to get profile ${profileId}:`, error as Error);
      throw error;
    }
  }

  /**
   * Get profile by email
   */
  async getProfileByEmail(email: string): Promise<Profile | null> {
    try {
      return await prisma.profile.findUnique({
        where: { email: email.toLowerCase() }
      });
    } catch (error) {
      logger.error(`Failed to get profile by email ${email}:`, error as Error);
      throw error;
    }
  }

  /**
   * Update profile
   */
  async updateProfile(profileId: string, updates: Partial<Pick<Profile, 'name'>>): Promise<Profile> {
    try {
      return await prisma.profile.update({
        where: { id: profileId },
        data: updates
      });
    } catch (error) {
      logger.error(`Failed to update profile ${profileId}:`, error as Error);
      throw error;
    }
  }

  /**
   * List all profiles (admin function)
   */
  async listProfiles(): Promise<Profile[]> {
    try {
      return await prisma.profile.findMany({
        orderBy: { createdAt: 'desc' }
      });
    } catch (error) {
      logger.error('Failed to list profiles:', error as Error);
      throw error;
    }
  }

  /**
   * Get default profile for data migration
   */
  async getDefaultProfile(): Promise<Profile> {
    const defaultEmail = 'system@hellofresh.com';
    return this.getOrCreateProfile(defaultEmail);
  }

  /**
   * Validate email format
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Extract name from email for display purposes
   */
  private extractNameFromEmail(email: string): string {
    const localPart = email.split('@')[0];
    // Convert dots and underscores to spaces, capitalize words
    return localPart
      .replace(/[._]/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }
}

// Export singleton instance
export const profileService = new ProfileService();
