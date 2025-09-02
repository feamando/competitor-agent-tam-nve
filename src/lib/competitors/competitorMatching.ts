/**
 * Competitor Matching Service - TP-028 Option A
 * Handles website-based competitor deduplication with profile association
 */

import prisma from '@/lib/prisma';
import { getCurrentProfileId } from '@/lib/profile/profileUtils';
import { WebsiteNormalizationService } from './websiteNormalization';
import { logger } from '@/lib/logger';

export interface CompetitorMatchResult {
  competitor: any;
  created: boolean;
  claimed?: boolean;
  message?: string;
}

export class CompetitorMatchingService {
  /**
   * Find existing competitor by normalized website
   */
  static async findExistingCompetitor(website: string): Promise<any | null> {
    const normalizedWebsite = WebsiteNormalizationService.normalize(website);
    
    if (!WebsiteNormalizationService.isValidForMatching(normalizedWebsite)) {
      return null;
    }
    
    try {
      return await prisma.competitor.findFirst({
        where: {
          normalizedWebsite: normalizedWebsite
        },
        include: {
          profile: true
        }
      });
    } catch (error) {
      logger.error('Error finding existing competitor by website', error as Error, {
        normalizedWebsite,
        originalWebsite: website
      });
      return null;
    }
  }

  /**
   * Create or associate competitor with profile based on website matching (Option A logic)
   */
  static async createOrAssociateCompetitor(
    data: {
      name: string;
      website: string;
      description?: string;
      industry: string;
      employeeCount?: number;
      revenue?: number;
      founded?: number;
      headquarters?: string;
      socialMedia?: any;
    },
    profileId?: string
  ): Promise<CompetitorMatchResult> {
    // Get current profile ID if not provided
    const currentProfileId = profileId || await getCurrentProfileId();
    
    // Normalize website for matching
    const normalizedWebsite = WebsiteNormalizationService.normalizeWithFallback(
      data.website, 
      data.name
    );
    
    try {
      // Check for existing competitor by normalized website
      const existingCompetitor = await this.findExistingCompetitor(data.website);
      
      if (existingCompetitor) {
        // Handle different scenarios based on existing competitor's profile
        if (!existingCompetitor.profileId) {
          // Scenario: Unowned competitor - claim it for this profile
          const updatedCompetitor = await prisma.competitor.update({
            where: { id: existingCompetitor.id },
            data: { profileId: currentProfileId },
            include: { profile: true }
          });
          
          logger.info('Claimed unowned competitor for profile', {
            competitorId: existingCompetitor.id,
            competitorName: existingCompetitor.name,
            profileId: currentProfileId
          });
          
          return {
            competitor: updatedCompetitor,
            created: false,
            claimed: true,
            message: 'Found existing competitor and claimed for your profile'
          };
        } else if (existingCompetitor.profileId === currentProfileId) {
          // Scenario: User already owns this competitor
          logger.info('User already owns this competitor', {
            competitorId: existingCompetitor.id,
            competitorName: existingCompetitor.name,
            profileId: currentProfileId
          });
          
          return {
            competitor: existingCompetitor,
            created: false,
            message: 'You already have this competitor in your profile'
          };
        } else {
          // Scenario: Competitor owned by different profile
          // In Option A, we don't allow sharing, so this is an error case
          const errorMessage = `Competitor with website ${data.website} already exists under a different profile`;
          
          logger.warn('Attempted to create competitor owned by different profile', {
            competitorName: data.name,
            website: data.website,
            existingProfileId: existingCompetitor.profileId,
            currentProfileId
          });
          
          throw new Error(errorMessage);
        }
      } else {
        // Scenario: No existing competitor - create new one
        const newCompetitor = await prisma.competitor.create({
          data: {
            ...data,
            normalizedWebsite,
            profileId: currentProfileId
          },
          include: { profile: true }
        });
        
        logger.info('Created new competitor', {
          competitorId: newCompetitor.id,
          competitorName: newCompetitor.name,
          profileId: currentProfileId,
          normalizedWebsite
        });
        
        return {
          competitor: newCompetitor,
          created: true,
          message: 'Created new competitor'
        };
      }
    } catch (error) {
      logger.error('Error in createOrAssociateCompetitor', error as Error, {
        competitorName: data.name,
        website: data.website,
        profileId: currentProfileId
      });
      throw error;
    }
  }

  /**
   * Get competitors accessible to current profile (owned + unowned)
   */
  static async getProfileAccessibleCompetitors(profileId?: string): Promise<any[]> {
    const currentProfileId = profileId || await getCurrentProfileId();
    
    try {
      return await prisma.competitor.findMany({
        where: {
          OR: [
            { profileId: currentProfileId },  // Owned by current profile
            { profileId: null }               // Unowned (shared) competitors
          ]
        },
        include: {
          profile: {
            select: { id: true, email: true }
          }
        },
        orderBy: [
          { profileId: 'desc' },  // Own competitors first
          { name: 'asc' }         // Then alphabetical
        ]
      });
    } catch (error) {
      logger.error('Error getting profile accessible competitors', error as Error, {
        profileId: currentProfileId
      });
      throw error;
    }
  }

  /**
   * Check if competitor can be accessed by profile
   */
  static async canProfileAccessCompetitor(competitorId: string, profileId?: string): Promise<boolean> {
    const currentProfileId = profileId || await getCurrentProfileId();
    
    try {
      const competitor = await prisma.competitor.findUnique({
        where: { id: competitorId },
        select: { profileId: true }
      });
      
      if (!competitor) {
        return false;
      }
      
      // Profile can access if they own it or it's unowned (shared)
      return !competitor.profileId || competitor.profileId === currentProfileId;
    } catch (error) {
      logger.error('Error checking competitor access', error as Error, {
        competitorId,
        profileId: currentProfileId
      });
      return false;
    }
  }
}
