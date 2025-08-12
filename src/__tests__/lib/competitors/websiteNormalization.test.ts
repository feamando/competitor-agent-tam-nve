/**
 * Tests for Website Normalization Service - TP-028 Option A
 */

import { WebsiteNormalizationService } from '@/lib/competitors/websiteNormalization';

describe('WebsiteNormalizationService', () => {
  describe('normalize', () => {
    it('should normalize basic URLs correctly', () => {
      expect(WebsiteNormalizationService.normalize('https://example.com')).toBe('example.com');
      expect(WebsiteNormalizationService.normalize('http://example.com')).toBe('example.com');
      expect(WebsiteNormalizationService.normalize('www.example.com')).toBe('example.com');
      expect(WebsiteNormalizationService.normalize('https://www.example.com')).toBe('example.com');
    });

    it('should remove trailing slashes', () => {
      expect(WebsiteNormalizationService.normalize('https://example.com/')).toBe('example.com');
      expect(WebsiteNormalizationService.normalize('https://example.com//')).toBe('example.com');
      expect(WebsiteNormalizationService.normalize('example.com///')).toBe('example.com');
    });

    it('should remove query parameters and hash fragments', () => {
      expect(WebsiteNormalizationService.normalize('https://example.com?param=value')).toBe('example.com');
      expect(WebsiteNormalizationService.normalize('https://example.com#section')).toBe('example.com');
      expect(WebsiteNormalizationService.normalize('https://example.com?param=value#section')).toBe('example.com');
    });

    it('should convert to lowercase', () => {
      expect(WebsiteNormalizationService.normalize('HTTPS://EXAMPLE.COM')).toBe('example.com');
      expect(WebsiteNormalizationService.normalize('Example.Com')).toBe('example.com');
    });

    it('should handle edge cases', () => {
      expect(WebsiteNormalizationService.normalize('')).toBe('');
      expect(WebsiteNormalizationService.normalize('   ')).toBe('');
      expect(WebsiteNormalizationService.normalize('invalid')).toBe('invalid');
    });

    it('should handle complex URLs', () => {
      expect(WebsiteNormalizationService.normalize('https://www.subdomain.example.com/path?query=value#hash')).toBe('subdomain.example.com/path');
    });

    it('should handle malformed input gracefully', () => {
      expect(WebsiteNormalizationService.normalize(null as any)).toBe('');
      expect(WebsiteNormalizationService.normalize(undefined as any)).toBe('');
      expect(WebsiteNormalizationService.normalize(123 as any)).toBe('');
    });
  });

  describe('areEquivalent', () => {
    it('should identify equivalent websites', () => {
      expect(WebsiteNormalizationService.areEquivalent(
        'https://www.example.com/',
        'http://example.com'
      )).toBe(true);
      
      expect(WebsiteNormalizationService.areEquivalent(
        'https://example.com?param=value',
        'example.com#section'
      )).toBe(true);
    });

    it('should identify non-equivalent websites', () => {
      expect(WebsiteNormalizationService.areEquivalent(
        'https://example.com',
        'https://different.com'
      )).toBe(false);
      
      expect(WebsiteNormalizationService.areEquivalent(
        'https://subdomain.example.com',
        'https://example.com'
      )).toBe(false);
    });

    it('should handle empty/invalid inputs', () => {
      expect(WebsiteNormalizationService.areEquivalent('', 'example.com')).toBe(false);
      expect(WebsiteNormalizationService.areEquivalent('example.com', '')).toBe(false);
      expect(WebsiteNormalizationService.areEquivalent('', '')).toBe(false);
    });
  });

  describe('isValidForMatching', () => {
    it('should validate reasonable URLs', () => {
      expect(WebsiteNormalizationService.isValidForMatching('realcompany.com')).toBe(true);
      expect(WebsiteNormalizationService.isValidForMatching('subdomain.realcompany.com')).toBe(true);
      expect(WebsiteNormalizationService.isValidForMatching('company-name.org')).toBe(true);
    });

    it('should reject generic/placeholder URLs', () => {
      expect(WebsiteNormalizationService.isValidForMatching('localhost')).toBe(false);
      expect(WebsiteNormalizationService.isValidForMatching('127.0.0.1')).toBe(false);
      expect(WebsiteNormalizationService.isValidForMatching('example.com')).toBe(false);
      expect(WebsiteNormalizationService.isValidForMatching('test.com')).toBe(false);
      expect(WebsiteNormalizationService.isValidForMatching('placeholder.com')).toBe(false);
    });

    it('should reject too short URLs', () => {
      expect(WebsiteNormalizationService.isValidForMatching('')).toBe(false);
      expect(WebsiteNormalizationService.isValidForMatching('a')).toBe(false);
      expect(WebsiteNormalizationService.isValidForMatching('ab')).toBe(false);
    });

    it('should reject localhost variations', () => {
      expect(WebsiteNormalizationService.isValidForMatching('localhost/path')).toBe(false);
      expect(WebsiteNormalizationService.isValidForMatching('127.0.0.1/app')).toBe(false);
    });
  });

  describe('normalizeWithFallback', () => {
    it('should return normalized website for valid URLs', () => {
      expect(WebsiteNormalizationService.normalizeWithFallback('https://valid-company.com')).toBe('valid-company.com');
      expect(WebsiteNormalizationService.normalizeWithFallback('www.real-business.org')).toBe('real-business.org');
    });

    it('should generate placeholder for invalid URLs', () => {
      const result1 = WebsiteNormalizationService.normalizeWithFallback('localhost', 'Test Company');
      expect(result1).toMatch(/^placeholder-test-company-\d+\.com$/);
      
      const result2 = WebsiteNormalizationService.normalizeWithFallback('example.com', 'My Business');
      expect(result2).toMatch(/^placeholder-my-business-\d+\.com$/);
    });

    it('should generate unique placeholders', async () => {
      const result1 = WebsiteNormalizationService.normalizeWithFallback('localhost'); // Use invalid URL
      // Small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 1));
      const result2 = WebsiteNormalizationService.normalizeWithFallback('127.0.0.1'); // Use invalid URL
      
      expect(result1).toMatch(/^placeholder-\d+\.com$/);
      expect(result2).toMatch(/^placeholder-\d+\.com$/);
      expect(result1).not.toBe(result2); // Should be unique due to timestamp
    });

    it('should handle special characters in company names', () => {
      const result = WebsiteNormalizationService.normalizeWithFallback('localhost', 'Test & Company, Inc.');
      expect(result).toMatch(/^placeholder-test-company-inc-\d+\.com$/);
    });
  });
});
