/**
 * API Tests for Profile Route
 * Tests the profile creation, validation, and management endpoints
 */

import { NextRequest } from 'next/server';
import { POST, GET, PUT, DELETE } from '@/app/api/profile/route';
import { profileService } from '@/lib/profile/profileService';
import { SessionManager } from '@/lib/profile/sessionManager';

// Mock dependencies
jest.mock('@/lib/profile/profileService');
jest.mock('@/lib/profile/sessionManager');
jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

const mockProfileService = profileService as jest.Mocked<typeof profileService>;
const mockSessionManager = SessionManager as jest.Mocked<typeof SessionManager>;

// Helper to create mock NextRequest
const createMockRequest = (
  method: string,
  body?: any,
  headers?: Record<string, string>
) => {
  const url = 'http://localhost:3000/api/profile';
  const headersMap = new Headers(headers);
  
  const request = new NextRequest(url, {
    method,
    headers: headersMap,
    body: body ? JSON.stringify(body) : undefined,
  });

  return request;
};

describe('/api/profile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/profile', () => {
    it('should create new profile successfully', async () => {
      const mockProfile = {
        id: 'profile-123',
        email: 'test@hellofresh.com',
        name: 'Test User',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockSession = {
        profileId: 'profile-123',
        email: 'test@hellofresh.com',
        createdAt: Date.now(),
        expiresAt: Date.now() + (24 * 60 * 60 * 1000)
      };

      mockProfileService.getOrCreateProfile.mockResolvedValue(mockProfile);
      mockSessionManager.createSession.mockReturnValue(mockSession);

      const request = createMockRequest('POST', { email: 'test@hellofresh.com' });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.profile).toEqual({
        id: 'profile-123',
        email: 'test@hellofresh.com',
        name: 'Test User'
      });
      expect(data.session).toEqual({
        profileId: 'profile-123',
        email: 'test@hellofresh.com',
        expiresAt: mockSession.expiresAt
      });

      expect(mockProfileService.getOrCreateProfile).toHaveBeenCalledWith('test@hellofresh.com');
      expect(mockSessionManager.createSession).toHaveBeenCalledWith('profile-123', 'test@hellofresh.com');
    });

    it('should handle missing email', async () => {
      const request = createMockRequest('POST', {});
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Email is required');
    });

    it('should handle invalid email format', async () => {
      const request = createMockRequest('POST', { email: 'invalid-email' });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid email format');
    });

    it('should handle empty email', async () => {
      const request = createMockRequest('POST', { email: '' });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Email is required');
    });

    it('should handle non-string email', async () => {
      const request = createMockRequest('POST', { email: 123 });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Email is required');
    });

    it('should handle profile service errors', async () => {
      mockProfileService.getOrCreateProfile.mockRejectedValue(new Error('Database error'));

      const request = createMockRequest('POST', { email: 'test@hellofresh.com' });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to process profile request');
    });

    it('should normalize email', async () => {
      const mockProfile = {
        id: 'profile-123',
        email: 'test@hellofresh.com',
        name: 'Test User',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockProfileService.getOrCreateProfile.mockResolvedValue(mockProfile);
      mockSessionManager.createSession.mockReturnValue({
        profileId: 'profile-123',
        email: 'test@hellofresh.com',
        createdAt: Date.now(),
        expiresAt: Date.now() + (24 * 60 * 60 * 1000)
      });

      const request = createMockRequest('POST', { email: '  TEST@HELLOFRESH.COM  ' });
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(mockProfileService.getOrCreateProfile).toHaveBeenCalledWith('test@hellofresh.com');
    });
  });

  describe('GET /api/profile', () => {
    it('should return profile info for valid session', async () => {
      const mockProfile = {
        id: 'profile-123',
        email: 'test@hellofresh.com',
        name: 'Test User',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockProfileService.getProfileById.mockResolvedValue(mockProfile);

      const request = createMockRequest('GET', undefined, { 'x-profile-id': 'profile-123' });
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.profile).toEqual({
        id: 'profile-123',
        email: 'test@hellofresh.com',
        name: 'Test User',
        createdAt: mockProfile.createdAt.toISOString()
      });

      expect(mockProfileService.getProfileById).toHaveBeenCalledWith('profile-123');
    });

    it('should return 401 when no profile ID provided', async () => {
      const request = createMockRequest('GET');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('No active profile session');
    });

    it('should return 404 when profile not found', async () => {
      mockProfileService.getProfileById.mockResolvedValue(null);

      const request = createMockRequest('GET', undefined, { 'x-profile-id': 'nonexistent' });
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Profile not found');
    });

    it('should handle service errors', async () => {
      mockProfileService.getProfileById.mockRejectedValue(new Error('Database error'));

      const request = createMockRequest('GET', undefined, { 'x-profile-id': 'profile-123' });
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to get profile information');
    });
  });

  describe('PUT /api/profile', () => {
    it('should update profile successfully', async () => {
      const existingProfile = {
        id: 'profile-123',
        email: 'test@hellofresh.com',
        name: 'Old Name',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const updatedProfile = {
        ...existingProfile,
        name: 'New Name',
        updatedAt: new Date(),
      };

      mockProfileService.getProfileById.mockResolvedValue(existingProfile);
      mockProfileService.updateProfile.mockResolvedValue(updatedProfile);

      const request = createMockRequest(
        'PUT',
        { name: 'New Name' },
        { 'x-profile-id': 'profile-123' }
      );
      const response = await PUT(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.profile.name).toBe('New Name');

      expect(mockProfileService.getProfileById).toHaveBeenCalledWith('profile-123');
      expect(mockProfileService.updateProfile).toHaveBeenCalledWith('profile-123', { name: 'New Name' });
    });

    it('should return 401 when no profile ID provided', async () => {
      const request = createMockRequest('PUT', { name: 'New Name' });
      const response = await PUT(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('No active profile session');
    });

    it('should return 404 when profile not found', async () => {
      mockProfileService.getProfileById.mockResolvedValue(null);

      const request = createMockRequest(
        'PUT',
        { name: 'New Name' },
        { 'x-profile-id': 'nonexistent' }
      );
      const response = await PUT(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Profile not found');
    });

    it('should handle update errors', async () => {
      const existingProfile = {
        id: 'profile-123',
        email: 'test@hellofresh.com',
        name: 'Old Name',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockProfileService.getProfileById.mockResolvedValue(existingProfile);
      mockProfileService.updateProfile.mockRejectedValue(new Error('Update failed'));

      const request = createMockRequest(
        'PUT',
        { name: 'New Name' },
        { 'x-profile-id': 'profile-123' }
      );
      const response = await PUT(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to update profile');
    });
  });

  describe('DELETE /api/profile', () => {
    it('should clear session for existing profile', async () => {
      const mockProfile = {
        id: 'profile-123',
        email: 'test@hellofresh.com',
        name: 'Test User',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockProfileService.getProfileById.mockResolvedValue(mockProfile);

      const request = createMockRequest('DELETE', undefined, { 'x-profile-id': 'profile-123' });
      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toBe('Profile session cleared');

      expect(mockProfileService.getProfileById).toHaveBeenCalledWith('profile-123');
    });

    it('should handle logout without profile ID', async () => {
      const request = createMockRequest('DELETE');
      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toBe('Profile session cleared');
    });

    it('should handle logout with nonexistent profile', async () => {
      mockProfileService.getProfileById.mockResolvedValue(null);

      const request = createMockRequest('DELETE', undefined, { 'x-profile-id': 'nonexistent' });
      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toBe('Profile session cleared');
    });

    it('should handle service errors gracefully', async () => {
      mockProfileService.getProfileById.mockRejectedValue(new Error('Database error'));

      const request = createMockRequest('DELETE', undefined, { 'x-profile-id': 'profile-123' });
      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to clear session');
    });
  });

  describe('Content-Type handling', () => {
    it('should handle requests without Content-Type header', async () => {
      const mockProfile = {
        id: 'profile-123',
        email: 'test@hellofresh.com',
        name: 'Test User',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockProfileService.getOrCreateProfile.mockResolvedValue(mockProfile);
      mockSessionManager.createSession.mockReturnValue({
        profileId: 'profile-123',
        email: 'test@hellofresh.com',
        createdAt: Date.now(),
        expiresAt: Date.now() + (24 * 60 * 60 * 1000)
      });

      const request = createMockRequest('POST', { email: 'test@hellofresh.com' });
      const response = await POST(request);

      expect(response.status).toBe(200);
    });
  });

  describe('Edge cases', () => {
    it('should handle malformed JSON in POST request', async () => {
      const url = 'http://localhost:3000/api/profile';
      const request = new NextRequest(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid-json',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500); // Internal server error due to JSON parse failure
    });

    it('should handle very long email addresses', async () => {
      const longEmail = 'a'.repeat(250) + '@hellofresh.com';
      
      mockProfileService.getOrCreateProfile.mockResolvedValue({
        id: 'profile-123',
        email: longEmail,
        name: 'Test User',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockSessionManager.createSession.mockReturnValue({
        profileId: 'profile-123',
        email: longEmail,
        createdAt: Date.now(),
        expiresAt: Date.now() + (24 * 60 * 60 * 1000)
      });

      const request = createMockRequest('POST', { email: longEmail });
      const response = await POST(request);

      expect(response.status).toBe(200);
    });

    it('should handle special characters in email', async () => {
      const specialEmail = 'test+tag@hellofresh.com';
      
      mockProfileService.getOrCreateProfile.mockResolvedValue({
        id: 'profile-123',
        email: specialEmail,
        name: 'Test Tag',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockSessionManager.createSession.mockReturnValue({
        profileId: 'profile-123',
        email: specialEmail,
        createdAt: Date.now(),
        expiresAt: Date.now() + (24 * 60 * 60 * 1000)
      });

      const request = createMockRequest('POST', { email: specialEmail });
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(mockProfileService.getOrCreateProfile).toHaveBeenCalledWith(specialEmail);
    });
  });
});
