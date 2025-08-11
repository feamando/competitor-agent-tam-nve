/**
 * Profile API Route - Profile creation and validation endpoint
 * Part of TP-026 Basic User Profiles Implementation
 */

import { NextRequest, NextResponse } from 'next/server';
import { profileService } from '@/lib/profile/profileService';
import { SessionManager } from '@/lib/profile/sessionManager';
import { EmailValidation } from '@/lib/profile/profileUtils';
import { logger } from '@/lib/logger';

// POST /api/profile - Create or validate profile
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    // Validate email
    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    const normalizedEmail = EmailValidation.normalizeEmail(email);

    if (!EmailValidation.isValidEmail(normalizedEmail)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Optional: Check HelloFresh domain constraint
    // Uncomment if you want to restrict to HelloFresh emails only
    // if (!EmailValidation.isHelloFreshEmail(normalizedEmail)) {
    //   return NextResponse.json(
    //     { error: 'Only HelloFresh email addresses are allowed' },
    //     { status: 400 }
    //   );
    // }

    // Get or create profile
    const profile = await profileService.getOrCreateProfile(normalizedEmail);

    // Create session (will be stored client-side)
    const session = SessionManager.createSession(profile.id, profile.email);

    logger.info(`Profile access granted for ${profile.email}`);

    return NextResponse.json({
      success: true,
      profile: {
        id: profile.id,
        email: profile.email,
        name: profile.name
      },
      session: {
        profileId: session.profileId,
        email: session.email,
        expiresAt: session.expiresAt
      }
    });

  } catch (error) {
    logger.error('Profile creation/validation failed:', error as Error);
    return NextResponse.json(
      { error: 'Failed to process profile request' },
      { status: 500 }
    );
  }
}

// GET /api/profile - Get current profile info
export async function GET(request: NextRequest) {
  try {
    // Get profile ID from session (client will send it)
    const profileId = request.headers.get('x-profile-id');
    
    if (!profileId) {
      return NextResponse.json(
        { error: 'No active profile session' },
        { status: 401 }
      );
    }

    // Get profile from database
    const profile = await profileService.getProfileById(profileId);
    
    if (!profile) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      profile: {
        id: profile.id,
        email: profile.email,
        name: profile.name,
        createdAt: profile.createdAt
      }
    });

  } catch (error) {
    logger.error('Failed to get profile info:', error as Error);
    return NextResponse.json(
      { error: 'Failed to get profile information' },
      { status: 500 }
    );
  }
}

// PUT /api/profile - Update profile
export async function PUT(request: NextRequest) {
  try {
    const profileId = request.headers.get('x-profile-id');
    const body = await request.json();
    const { name } = body;

    if (!profileId) {
      return NextResponse.json(
        { error: 'No active profile session' },
        { status: 401 }
      );
    }

    // Validate profile exists
    const existingProfile = await profileService.getProfileById(profileId);
    if (!existingProfile) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404 }
      );
    }

    // Update profile
    const updatedProfile = await profileService.updateProfile(profileId, { name });

    logger.info(`Profile updated for ${updatedProfile.email}`);

    return NextResponse.json({
      success: true,
      profile: {
        id: updatedProfile.id,
        email: updatedProfile.email,
        name: updatedProfile.name
      }
    });

  } catch (error) {
    logger.error('Profile update failed:', error as Error);
    return NextResponse.json(
      { error: 'Failed to update profile' },
      { status: 500 }
    );
  }
}

// DELETE /api/profile - Clear session (logout)
export async function DELETE(request: NextRequest) {
  try {
    const profileId = request.headers.get('x-profile-id');
    
    if (profileId) {
      const profile = await profileService.getProfileById(profileId);
      if (profile) {
        logger.info(`Profile session cleared for ${profile.email}`);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Profile session cleared'
    });

  } catch (error) {
    logger.error('Failed to clear profile session:', error as Error);
    return NextResponse.json(
      { error: 'Failed to clear session' },
      { status: 500 }
    );
  }
}
