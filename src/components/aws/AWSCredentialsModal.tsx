'use client';

import React, { useState } from 'react';
import { logger } from '@/lib/logger';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { LoadingButton } from '@/components/composed/LoadingButton';

interface AWSCredentialsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (credentials: Record<string, unknown>) => void;
  initialData?: {
    profileName?: string;
    awsRegion?: string;
  };
}

interface FormData {
  credentialsText: string;
  awsRegion: string;
}

interface FormErrors {
  [key: string]: string;
}

export function AWSCredentialsModal({ 
  isOpen, 
  onClose, 
  onSuccess, 
  initialData 
}: AWSCredentialsModalProps) {
  const [formData, setFormData] = useState<FormData>({
    credentialsText: '',
    awsRegion: initialData?.awsRegion || 'us-east-1'
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    isValid: boolean;
    error?: string;
    latency?: number;
  } | null>(null);

  const awsRegions = [
    { value: 'us-east-1', label: 'US East (N. Virginia)' },
    { value: 'us-west-2', label: 'US West (Oregon)' },
    { value: 'eu-west-1', label: 'Europe (Ireland)' },
    { value: 'eu-west-2', label: 'Europe (London)' },
    { value: 'eu-central-1', label: 'Europe (Frankfurt)' },
    { value: 'ap-southeast-1', label: 'Asia Pacific (Singapore)' },
    { value: 'ap-southeast-2', label: 'Asia Pacific (Sydney)' },
    { value: 'ap-northeast-1', label: 'Asia Pacific (Tokyo)' }
  ];

  const parseAwsCredentials = (credentialsText: string) => {
    const lines = credentialsText.trim().split('\n');
    const credentials: Record<string, Record<string, string>> = {};
    let currentProfile = '';

    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Skip empty lines and comments
      if (!trimmedLine || trimmedLine.startsWith('#')) continue;
      
      // Profile section
      if (trimmedLine.startsWith('[') && trimmedLine.endsWith(']')) {
        currentProfile = trimmedLine.slice(1, -1).trim();
        if (!credentials[currentProfile]) {
          credentials[currentProfile] = {};
        }
        continue;
      }
      
      // Key-value pairs
      const equalIndex = trimmedLine.indexOf('=');
      if (equalIndex > 0) {
        const key = trimmedLine.substring(0, equalIndex).trim();
        const value = trimmedLine.substring(equalIndex + 1).trim();
        
        if (currentProfile && credentials[currentProfile]) {
          credentials[currentProfile]![key] = value;
        }
      }
    }
    
    return credentials;
  };

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.credentialsText.trim()) {
      newErrors.credentialsText = 'AWS credentials are required';
    } else {
      try {
        const parsedCredentials = parseAwsCredentials(formData.credentialsText);
        const profiles = Object.keys(parsedCredentials);
        
        if (profiles.length === 0) {
          newErrors.credentialsText = 'No valid AWS profiles found in credentials';
        } else {
          // Validate at least one profile has required fields
          let hasValidProfile = false;
          for (const profile of profiles) {
            const creds = parsedCredentials[profile];
            if (creds && creds.aws_access_key_id && creds.aws_secret_access_key) {
              // Validate access key format
              if (!/^(AKIA|ASIA|AROA)[A-Z0-9]{16}$/.test(creds.aws_access_key_id)) {
                newErrors.credentialsText = `Invalid Access Key ID format in profile [${profile}]. Must start with AKIA, ASIA, or AROA and be 20 characters total`;
                break;
              }
              // Validate secret key length
              if (creds.aws_secret_access_key.length < 20) {
                newErrors.credentialsText = `Secret Access Key too short in profile [${profile}]`;
                break;
              }
              hasValidProfile = true;
            }
          }
          
          if (!hasValidProfile && !newErrors.credentialsText) {
            newErrors.credentialsText = 'At least one profile must have aws_access_key_id and aws_secret_access_key';
          }
        }
      } catch {
        newErrors.credentialsText = 'Invalid AWS credentials format';
      }
    }

    if (!formData.awsRegion) {
      newErrors.awsRegion = 'AWS Region is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (field: keyof FormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    setIsLoading(true);
    setValidationResult(null);

    try {
      // Parse credentials text to get the first valid profile
      const parsedCredentials = parseAwsCredentials(formData.credentialsText);
      const profiles = Object.keys(parsedCredentials);
      const firstProfile = profiles[0];
      if (!firstProfile) {
        throw new Error('No profiles found');
      }
      const credentials = parsedCredentials[firstProfile];

      if (!credentials) {
        throw new Error('No valid credentials found');
      }

      // Save credentials with improved error handling and timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.warn('AWS credential save operation timed out after 30 seconds');
        controller.abort();
      }, 30000); // 30 second timeout

      const saveResponse = await fetch('/api/aws/credentials', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          profileName: firstProfile,
          accessKeyId: credentials.aws_access_key_id,
          secretAccessKey: credentials.aws_secret_access_key,
          sessionToken: credentials.aws_session_token || undefined,
          awsRegion: formData.awsRegion
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // Check if response is ok before trying to parse JSON
      if (!saveResponse.ok) {
        const contentType = saveResponse.headers.get('content-type');
        let errorMessage = `HTTP ${saveResponse.status}: ${saveResponse.statusText}`;
        
        try {
          if (contentType && contentType.includes('application/json')) {
            const errorData = await saveResponse.json();
            errorMessage = errorData.error || errorMessage;
          }
        } catch (parseError) {
          logger.warn('Failed to parse error response as JSON', { error: parseError as Error });
        }
        
        throw new Error(errorMessage);
      }

      const saveResult = await saveResponse.json();

      if (!saveResult.success) {
        throw new Error(saveResult.error || 'Failed to save credentials');
      }

      // Add a small delay before validation to ensure database consistency
      await new Promise(resolve => setTimeout(resolve, 100));

      // Validate credentials
      await handleValidate(false);

      logger.info('AWS credentials saved successfully', { 
        profileName: firstProfile 
      });

      onSuccess(saveResult.data);
      onClose();

    } catch (error) {
      logger.error('Failed to save AWS credentials', error as Error, { 
        profileName: 'unknown' 
      });
      
      // Provide more specific error messages
      let errorMessage = (error as Error).message;
      if ((error as DOMException).name === 'AbortError' || errorMessage.includes('AbortError')) {
        errorMessage = 'Request timeout - please check your connection and try again';
      } else if (errorMessage.includes('NetworkError') || errorMessage.includes('Failed to fetch')) {
        errorMessage = 'Network error - please check your connection and try again';
      } else if (errorMessage.includes('401')) {
        errorMessage = 'Authentication error - please verify your credentials';
      } else if (errorMessage.includes('429')) {
        errorMessage = 'Too many requests - please wait a moment and try again';
      }
      
      setErrors({ general: errorMessage });
    } finally {
      setIsLoading(false);
    }
  };

  const handleValidate = async (showResult: boolean = true) => {
    if (!validateForm()) return;

    setIsValidating(true);
    if (showResult) setValidationResult(null);

    try {
      // Add timeout and better error handling for validation
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

      const response = await fetch('/api/aws/credentials/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          profileName: (() => {
            try {
              const parsedCredentials = parseAwsCredentials(formData.credentialsText);
              const profiles = Object.keys(parsedCredentials);
              return profiles[0];
            } catch {
              return '';
            }
          })()
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // Check if response is ok before trying to parse JSON
      if (!response.ok) {
        const contentType = response.headers.get('content-type');
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        
        try {
          if (contentType && contentType.includes('application/json')) {
            const errorData = await response.json();
            errorMessage = errorData.error || errorMessage;
          }
        } catch (parseError) {
          logger.warn('Failed to parse validation error response as JSON', { error: parseError as Error });
        }
        
        throw new Error(errorMessage);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to validate credentials');
      }

      if (showResult) {
        setValidationResult({
          isValid: result.valid,
          error: result.error,
          latency: result.data?.latency
        });
      }

      return result.valid;

    } catch (error) {
      logger.error('Failed to validate AWS credentials', error as Error, { 
        profileName: 'unknown' 
      });
      
      // Provide more specific error messages for validation
      let errorMessage = (error as Error).message;
      if (errorMessage.includes('AbortError')) {
        errorMessage = 'Validation timeout - please try again';
      } else if (errorMessage.includes('NetworkError') || errorMessage.includes('Failed to fetch')) {
        errorMessage = 'Network error during validation - please check your connection';
      }
      
      if (showResult) {
        setValidationResult({
          isValid: false,
          error: errorMessage
        });
      }
      return false;
    } finally {
      setIsValidating(false);
    }
  };

  const handleClose = () => {
    setFormData({
      credentialsText: '',
      awsRegion: initialData?.awsRegion || 'us-east-1'
    });
    setErrors({});
    setValidationResult(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>AWS Credentials</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {errors.general && (
            <Alert variant="destructive">
              <AlertDescription>{errors.general}</AlertDescription>
            </Alert>
          )}

          {validationResult && (
            <Alert variant={validationResult.isValid ? "default" : "destructive"}>
              <AlertDescription>
                {validationResult.isValid 
                  ? `✅ Credentials are valid${validationResult.latency ? ` (${validationResult.latency}ms)` : ''}`
                  : `❌ ${validationResult.error}`
                }
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label>AWS Credentials</Label>
            <p className="text-sm text-muted-foreground">
              Paste your AWS credentials file content below:
            </p>
            <Textarea
              value={formData.credentialsText}
              onChange={(e) => handleInputChange('credentialsText', e.target.value)}
              className={`font-mono text-sm ${
                errors.credentialsText ? 'border-destructive' : ''
              }`}
              rows={10}
              placeholder={`[default]
aws_access_key_id = YOUR_ACCESS_KEY
aws_secret_access_key = YOUR_SECRET_KEY
aws_session_token = YOUR_SESSION_TOKEN (optional)

[production]
aws_access_key_id = YOUR_ACCESS_KEY 
aws_secret_access_key = YOUR_SECRET_KEY`}
            />
            {errors.credentialsText && (
              <p className="text-sm text-destructive">{errors.credentialsText}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>AWS Region</Label>
            <Select
              value={formData.awsRegion}
              onValueChange={(value) => handleInputChange('awsRegion', value)}
            >
              <SelectTrigger className={errors.awsRegion ? 'border-destructive' : ''}>
                <SelectValue placeholder="Select AWS Region" />
              </SelectTrigger>
              <SelectContent>
                {awsRegions.map(region => (
                  <SelectItem key={region.value} value={region.value}>
                    {region.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.awsRegion && (
              <p className="text-sm text-destructive">{errors.awsRegion}</p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between pt-4 border-t">
          <LoadingButton
            variant="ghost"
            onClick={() => handleValidate(true)}
            loading={isValidating}
          >
            Test Connection
          </LoadingButton>
          
          <div className="flex space-x-3">
            <Button
              variant="outline"
              onClick={handleClose}
            >
              Cancel
            </Button>
            <LoadingButton
              onClick={handleSave}
              loading={isLoading}
            >
              Save
            </LoadingButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
} 