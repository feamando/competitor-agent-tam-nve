'use client';

import React, { useState } from 'react';
import { logger } from '@/lib/logger';

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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-lg font-semibold text-gray-900">
            AWS Credentials
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-4">
          {errors.general && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3">
              <p className="text-sm text-red-800">{errors.general}</p>
            </div>
          )}

          {validationResult && (
            <div className={`border rounded-md p-3 ${
              validationResult.isValid 
                ? 'bg-green-50 border-green-200' 
                : 'bg-red-50 border-red-200'
            }`}>
              <p className={`text-sm ${
                validationResult.isValid ? 'text-green-800' : 'text-red-800'
              }`}>
                {validationResult.isValid 
                  ? `✅ Credentials are valid${validationResult.latency ? ` (${validationResult.latency}ms)` : ''}`
                  : `❌ ${validationResult.error}`
                }
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              AWS Credentials
            </label>
            <p className="text-sm text-gray-600 mb-2">
              Paste your AWS credentials file content below:
            </p>
            <textarea
              value={formData.credentialsText}
              onChange={(e) => handleInputChange('credentialsText', e.target.value)}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm ${
                errors.credentialsText ? 'border-red-500' : 'border-gray-300'
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
              <p className="mt-1 text-sm text-red-600">{errors.credentialsText}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              AWS Region
            </label>
            <select
              value={formData.awsRegion}
              onChange={(e) => handleInputChange('awsRegion', e.target.value)}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.awsRegion ? 'border-red-500' : 'border-gray-300'
              }`}
            >
              {awsRegions.map(region => (
                <option key={region.value} value={region.value}>
                  {region.label}
                </option>
              ))}
            </select>
            {errors.awsRegion && (
              <p className="mt-1 text-sm text-red-600">{errors.awsRegion}</p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between p-6 border-t bg-gray-50">
          <button
            onClick={() => handleValidate(true)}
            disabled={isValidating}
            className="px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-500 disabled:opacity-50"
          >
            {isValidating ? 'Validating...' : 'Test Connection'}
          </button>
          
          <div className="flex space-x-3">
            <button
              onClick={handleClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-500"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isLoading}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-50"
            >
              {isLoading ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
} 