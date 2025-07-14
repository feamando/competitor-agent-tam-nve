import { NextRequest, NextResponse } from 'next/server';
import { AWSCredentialService } from '@/services/aws/awsCredentialService';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const credentialService = new AWSCredentialService();

// Schema for credential validation
const credentialSchema = z.object({
  profileName: z.string().min(1, 'Profile name is required'),
  accessKeyId: z.string().min(1, 'Access Key ID is required'),
  secretAccessKey: z.string().min(1, 'Secret Access Key is required'),
  sessionToken: z.string().optional(),
  awsRegion: z.string().min(1, 'AWS Region is required')
});

// GET /api/aws/credentials - List all credential profiles
export async function GET(request: NextRequest) {
  try {
    const profiles = await credentialService.listCredentialProfiles();
    
    return NextResponse.json({
      success: true,
      data: profiles,
      count: profiles.length
    });

  } catch (error) {
    logger.error('Failed to list AWS credential profiles', error as Error);
    
    return NextResponse.json({
      success: false,
      error: 'Failed to retrieve AWS credentials'
    }, { status: 500 });
  }
}

// POST /api/aws/credentials - Save new credentials
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate input
    const validation = credentialSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({
        success: false,
        error: 'Invalid input data',
        details: validation.error.errors
      }, { status: 400 });
    }

    const credentials = validation.data;
    
    // Save credentials
    const savedCredentials = await credentialService.saveCredentials({
      profileName: credentials.profileName,
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      awsRegion: credentials.awsRegion,
      ...(credentials.sessionToken && { sessionToken: credentials.sessionToken })
    });
    
    logger.info('AWS credentials saved successfully', { 
      profileName: credentials.profileName 
    });

    return NextResponse.json({
      success: true,
      message: 'AWS credentials saved successfully',
      data: savedCredentials
    });

  } catch (error) {
    logger.error('Failed to save AWS credentials', error as Error);
    
    return NextResponse.json({
      success: false,
      error: 'Failed to save AWS credentials'
    }, { status: 500 });
  }
}

// DELETE /api/aws/credentials?profileName=xxx - Delete credentials
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const profileName = searchParams.get('profileName');
    
    if (!profileName) {
      return NextResponse.json({
        success: false,
        error: 'Profile name is required'
      }, { status: 400 });
    }

    const success = await credentialService.deleteCredentials(profileName);
    
    if (success) {
      logger.info('AWS credentials deleted successfully', { profileName });
      
      return NextResponse.json({
        success: true,
        message: 'AWS credentials deleted successfully'
      });
    } else {
      return NextResponse.json({
        success: false,
        error: 'Failed to delete AWS credentials'
      }, { status: 500 });
    }

  } catch (error) {
    logger.error('Failed to delete AWS credentials', error as Error);
    
    return NextResponse.json({
      success: false,
      error: 'Failed to delete AWS credentials'
    }, { status: 500 });
  }
} 