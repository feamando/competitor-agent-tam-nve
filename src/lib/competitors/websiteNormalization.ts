/**
 * Website Normalization Service - TP-028 Option A
 * Normalizes website URLs for consistent competitor matching
 */

export class WebsiteNormalizationService {
  /**
   * Normalize a website URL for consistent matching
   * Removes protocol, www prefix, trailing slashes, and query parameters
   * Converts to lowercase for case-insensitive matching
   */
  static normalize(website: string): string {
    if (!website || typeof website !== 'string') {
      return '';
    }
    
    try {
      return website
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, '')    // Remove http:// or https://
        .replace(/^www\./, '')          // Remove www. prefix
        .replace(/\/+$/, '')            // Remove trailing slashes
        .split('?')[0]                  // Remove query parameters
        .split('#')[0];                 // Remove hash fragments
    } catch (error) {
      // If normalization fails, return empty string to avoid matches
      return '';
    }
  }

  /**
   * Check if two websites are equivalent after normalization
   */
  static areEquivalent(website1: string, website2: string): boolean {
    const normalized1 = this.normalize(website1);
    const normalized2 = this.normalize(website2);
    
    // Only consider them equivalent if both normalize to valid non-empty strings
    return normalized1 !== '' && normalized2 !== '' && normalized1 === normalized2;
  }

  /**
   * Validate that a normalized website is reasonable for matching
   * Helps avoid false positives from overly generic URLs
   */
  static isValidForMatching(normalizedWebsite: string): boolean {
    if (!normalizedWebsite || normalizedWebsite.length < 3) {
      return false;
    }
    
    // Avoid matching on overly generic domains
    const genericDomains = [
      'localhost',
      '127.0.0.1',
      'example.com',
      'test.com',
      'placeholder.com'
    ];
    
    return !genericDomains.some(generic => 
      normalizedWebsite === generic || normalizedWebsite.startsWith(generic + '/')
    );
  }

  /**
   * Generate a normalized website from raw input with fallback handling
   * Used during competitor creation to ensure we always have a normalized value
   */
  static normalizeWithFallback(website: string, competitorName?: string): string {
    const normalized = this.normalize(website);
    
    if (this.isValidForMatching(normalized)) {
      return normalized;
    }
    
    // If normalization results in invalid website, create a unique placeholder
    // This prevents false positive matches while allowing the competitor to be created
    if (competitorName) {
      const timestamp = Date.now();
      const slug = competitorName.toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
      return `placeholder-${slug}-${timestamp}.com`;
    }
    
    return `placeholder-${Date.now()}.com`;
  }
}
