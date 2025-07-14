import { NextRequest, NextResponse } from 'next/server';
import { AWSCredentialService } from '@/services/aws/awsCredentialService';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const credentialService = new AWSCredentialService();

// Schema for validation request
const validationSchema = z.object({
  profileName: z.string().min(1, 'Profile name is required')
});

// POST /api/aws/credentials/validate - Validate credentials
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate input
    const validation = validationSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({
        success: false,
        error: 'Invalid input data',
        details: validation.error.errors
      }, { status: 400 });
    }

    const { profileName } = validation.data;
    
    // Validate credentials
    const validationResult = await credentialService.validateCredentials(profileName);
    
    if (validationResult.isValid) {
      logger.info('AWS credentials validated successfully', { 
        profileName,
        latency: validationResult.latency 
      });

      return NextResponse.json({
        success: true,
        valid: true,
        message: 'AWS credentials are valid and working',
        data: {
          profileName,
          latency: validationResult.latency,
          validatedAt: new Date().toISOString()
        }
      });
    } else {
      logger.warn('AWS credentials validation failed', { 
        profileName,
        error: validationResult.error 
      });

      return NextResponse.json({
        success: true,
        valid: false,
        message: 'AWS credentials are invalid',
        error: validationResult.error,
        data: {
          profileName,
          validatedAt: new Date().toISOString()
        }
      });
    }

  } catch (error) {
    logger.error('Failed to validate AWS credentials', error as Error);
    
    return NextResponse.json({
      success: false,
      error: 'Failed to validate AWS credentials'
    }, { status: 500 });
  }
}

// GET /api/aws/credentials/validate?profileName=xxx - Get validation status
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const profileName = searchParams.get('profileName');
    
    if (!profileName) {
      return NextResponse.json({
        success: false,
        error: 'Profile name is required'
      }, { status: 400 });
    }

    const credentials = await credentialService.getCredentialsByProfile(profileName);
    
    if (!credentials) {
      return NextResponse.json({
        success: false,
        error: 'Credentials not found'
      }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: {
        profileName: credentials.profileName,
        isValid: credentials.isValid,
        lastValidatedAt: credentials.lastValidatedAt,
        validationError: credentials.validationError,
        awsRegion: credentials.awsRegion
      }
    });

  } catch (error) {
    logger.error('Failed to get credential validation status', error as Error);
    
    return NextResponse.json({
      success: false,
      error: 'Failed to get validation status'
    }, { status: 500 });
  }
} 