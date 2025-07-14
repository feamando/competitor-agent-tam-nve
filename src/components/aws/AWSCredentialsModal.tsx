'use client';

import React, { useState } from 'react';
import { logger } from '@/lib/logger';

interface AWSCredentialsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (credentials: any) => void;
  initialData?: {
    profileName?: string;
    awsRegion?: string;
  };
}

interface FormData {
  profileName: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
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
    profileName: initialData?.profileName || '',
    accessKeyId: '',
    secretAccessKey: '',
    sessionToken: '',
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

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.profileName.trim()) {
      newErrors.profileName = 'Profile name is required';
    }

    if (!formData.accessKeyId.trim()) {
      newErrors.accessKeyId = 'Access Key ID is required';
    } else if (!/^(AKIA|ASIA|AROA)[A-Z0-9]{16}$/.test(formData.accessKeyId)) {
      newErrors.accessKeyId = 'Access Key ID must start with AKIA, ASIA, or AROA and be 20 characters total';
    }

    if (!formData.secretAccessKey.trim()) {
      newErrors.secretAccessKey = 'Secret Access Key is required';
    } else if (formData.secretAccessKey.length < 20) {
      newErrors.secretAccessKey = 'Secret Access Key is too short';
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
      // Save credentials
      const saveResponse = await fetch('/api/aws/credentials', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          profileName: formData.profileName,
          accessKeyId: formData.accessKeyId,
          secretAccessKey: formData.secretAccessKey,
          sessionToken: formData.sessionToken || undefined,
          awsRegion: formData.awsRegion
        }),
      });

      const saveResult = await saveResponse.json();

      if (!saveResult.success) {
        throw new Error(saveResult.error || 'Failed to save credentials');
      }

      // Validate credentials
      await handleValidate(false);

      logger.info('AWS credentials saved successfully', { 
        profileName: formData.profileName 
      });

      onSuccess(saveResult.data);
      onClose();

    } catch (error) {
      logger.error('Failed to save AWS credentials', error as Error);
      setErrors({ general: (error as Error).message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleValidate = async (showResult: boolean = true) => {
    if (!validateForm()) return;

    setIsValidating(true);
    if (showResult) setValidationResult(null);

    try {
      const response = await fetch('/api/aws/credentials/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          profileName: formData.profileName
        }),
      });

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
      logger.error('Failed to validate AWS credentials', error as Error);
      if (showResult) {
        setValidationResult({
          isValid: false,
          error: (error as Error).message
        });
      }
      return false;
    } finally {
      setIsValidating(false);
    }
  };

  const handleClose = () => {
    setFormData({
      profileName: initialData?.profileName || '',
      accessKeyId: '',
      secretAccessKey: '',
      sessionToken: '',
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
              Profile Name
            </label>
            <input
              type="text"
              value={formData.profileName}
              onChange={(e) => handleInputChange('profileName', e.target.value)}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.profileName ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="e.g., production-bedrock"
            />
            {errors.profileName && (
              <p className="mt-1 text-sm text-red-600">{errors.profileName}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Access Key ID
            </label>
            <input
              type="text"
              value={formData.accessKeyId}
              onChange={(e) => handleInputChange('accessKeyId', e.target.value)}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.accessKeyId ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="ASIA53FXCEVJI4T3XYYX"
            />
            {errors.accessKeyId && (
              <p className="mt-1 text-sm text-red-600">{errors.accessKeyId}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Secret Access Key
            </label>
            <input
              type="password"
              value={formData.secretAccessKey}
              onChange={(e) => handleInputChange('secretAccessKey', e.target.value)}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.secretAccessKey ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="Enter your secret access key"
            />
            {errors.secretAccessKey && (
              <p className="mt-1 text-sm text-red-600">{errors.secretAccessKey}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Session Token (Optional)
            </label>
            <textarea
              value={formData.sessionToken}
              onChange={(e) => handleInputChange('sessionToken', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={3}
              placeholder="Enter session token if using temporary credentials"
            />
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