import { NextRequest, NextResponse } from 'next/server';
import { AWSCredentialService } from '@/services/aws/awsCredentialService';
import { logger } from '@/lib/logger';

const credentialService = new AWSCredentialService();

// GET /api/aws/credentials/status - Get overall credential status
export async function GET(request: NextRequest) {
  try {
    const profiles = await credentialService.listCredentialProfiles();
    const primaryCredentials = await credentialService.getPrimaryCredentials();
    
    const validProfiles = profiles.filter(p => p.isValid);
    const totalProfiles = profiles.length;
    
    // Determine overall status
    let status: 'healthy' | 'warning' | 'error' | 'not_configured';
    let message: string;
    let details: string;
    
    if (totalProfiles === 0) {
      status = 'not_configured';
      message = 'No AWS credentials configured';
      details = 'Click to add your AWS credentials for competitor analysis';
    } else if (validProfiles.length === 0) {
      status = 'error';
      message = 'All AWS credentials are invalid';
      details = 'Please check and update your AWS credentials';
    } else if (validProfiles.length < totalProfiles) {
      status = 'warning';
      message = `${validProfiles.length}/${totalProfiles} credential profiles are valid`;
      details = 'Some credentials need attention';
    } else {
      status = 'healthy';
      message = 'All AWS credentials are valid';
      details = `${validProfiles.length} credential profiles configured`;
    }

    return NextResponse.json({
      success: true,
      status,
      message,
      details,
      data: {
        totalProfiles,
        validProfiles: validProfiles.length,
        invalidProfiles: totalProfiles - validProfiles.length,
        hasPrimaryCredentials: !!primaryCredentials,
        primaryProfile: primaryCredentials?.profileName,
        primaryRegion: primaryCredentials?.awsRegion,
        profiles: profiles.map(p => ({
          profileName: p.profileName,
          awsRegion: p.awsRegion,
          isValid: p.isValid,
          lastValidatedAt: p.lastValidatedAt,
          validationError: p.validationError
        })),
        lastUpdated: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('Failed to get AWS credential status', error as Error);
    
    return NextResponse.json({
      success: false,
      status: 'error',
      message: 'Failed to check AWS credential status',
      details: 'Internal server error',
      error: 'Failed to retrieve AWS credential status'
    }, { status: 500 });
  }
} 