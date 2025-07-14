/**
 * Phase 3.1: Comprehensive Tests for Data Integrity Validation Layer
 */

import { 
  dataIntegrityValidator,
  DataIntegrityValidator,
  ValidationResult,
  DetailedValidationResult,
  ValidationError 
} from '../dataIntegrity';
import { z } from 'zod';

describe('DataIntegrityValidator', () => {
  beforeEach(() => {
    // Reset singleton state if needed
    jest.clearAllMocks();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance when accessed multiple times', () => {
      const instance1 = dataIntegrityValidator;
      const instance2 = dataIntegrityValidator;
      expect(instance1).toBe(instance2);
    });

    it('should be an instance of DataIntegrityValidator', () => {
      expect(dataIntegrityValidator).toBeInstanceOf(DataIntegrityValidator);
    });
  });

  describe('Product Data Validation', () => {
    const validProductData = {
      id: 'product-123',
      name: 'Test Product',
      website: 'https://example.com',
      description: 'A test product',
      industry: 'Technology',
      projectId: 'project-123'
    };

    it('should validate correct product data', () => {
      const result = dataIntegrityValidator.validateProductData(validProductData);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject product data with missing required fields', () => {
      const invalidData = { ...validProductData };
      delete (invalidData as any).name;
      delete (invalidData as any).website;

      const result = dataIntegrityValidator.validateProductData(invalidData);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid product name');
      expect(result.errors).toContain('Invalid URL format');
    });

    it('should reject product data with invalid URL format', () => {
      const invalidData = { ...validProductData, website: 'not-a-url' };

      const result = dataIntegrityValidator.validateProductData(invalidData);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid URL format');
    });

    it('should reject product data with invalid ID format', () => {
      const invalidData = { ...validProductData, id: '' };

      const result = dataIntegrityValidator.validateProductData(invalidData);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid product ID');
    });

    it('should provide warnings for optional but recommended fields', () => {
      const dataWithoutOptionals = {
        id: 'product-123',
        name: 'Test Product',
        website: 'https://example.com',
        projectId: 'project-123'
      };

      const result = dataIntegrityValidator.validateProductData(dataWithoutOptionals);
      
      expect(result.valid).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings?.length).toBeGreaterThan(0);
    });
  });

  describe('Project Data Validation', () => {
    const validProjectData = {
      id: 'project-123',
      name: 'Test Project',
      userEmail: 'user@example.com',
      competitors: ['competitor-1', 'competitor-2'],
      status: 'active'
    };

    it('should validate correct project data', () => {
      const result = dataIntegrityValidator.validateProjectData(validProjectData);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject project data with invalid email', () => {
      const invalidData = { ...validProjectData, userEmail: 'invalid-email' };

      const result = dataIntegrityValidator.validateProjectData(invalidData);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid email format');
    });

    it('should reject project data with empty competitors array', () => {
      const invalidData = { ...validProjectData, competitors: [] };

      const result = dataIntegrityValidator.validateProjectData(invalidData);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('At least one competitor is required');
    });

    it('should reject project data with invalid status', () => {
      const invalidData = { ...validProjectData, status: 'invalid-status' };

      const result = dataIntegrityValidator.validateProjectData(invalidData);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid project status');
    });
  });

  describe('Chat Data Validation', () => {
    const validChatData = {
      id: 'chat-123',
      projectId: 'project-123',
      messages: [
        { role: 'user', content: 'Hello', timestamp: new Date() },
        { role: 'assistant', content: 'Hi there!', timestamp: new Date() }
      ],
      status: 'active'
    };

    it('should validate correct chat data', () => {
      const result = dataIntegrityValidator.validateChatData(validChatData);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject chat data with empty messages', () => {
      const invalidData = { ...validChatData, messages: [] };

      const result = dataIntegrityValidator.validateChatData(invalidData);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('At least one message is required');
    });

    it('should reject chat data with invalid message structure', () => {
      const invalidData = {
        ...validChatData,
        messages: [{ role: 'invalid', content: '', timestamp: 'not-a-date' }]
      };

      const result = dataIntegrityValidator.validateChatData(invalidData);
      
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Report Data Validation', () => {
    const validReportData = {
      id: 'report-123',
      projectId: 'project-123',
      productId: 'product-123',
      title: 'Test Report',
      status: 'completed',
      sections: [
        { id: 'section-1', title: 'Executive Summary', content: 'Summary content', type: 'executive_summary' }
      ],
      metadata: {
        generatedAt: new Date(),
        version: '1.0',
        confidenceScore: 85
      }
    };

    it('should validate correct report data', () => {
      const result = dataIntegrityValidator.validateReportData(validReportData);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject report data with invalid confidence score', () => {
      const invalidData = {
        ...validReportData,
        metadata: { ...validReportData.metadata, confidenceScore: 150 }
      };

      const result = dataIntegrityValidator.validateReportData(invalidData);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Confidence score must be between 0 and 100');
    });

    it('should reject report data with empty sections', () => {
      const invalidData = { ...validReportData, sections: [] };

      const result = dataIntegrityValidator.validateReportData(invalidData);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('At least one section is required');
    });
  });

  describe('Analysis Input Validation', () => {
    const validAnalysisInput = {
      productId: 'product-123',
      competitorIds: ['comp-1', 'comp-2'],
      focusAreas: ['features', 'pricing'],
      configuration: {
        includeRecommendations: true,
        maxCompetitors: 5
      }
    };

    it('should validate correct analysis input', () => {
      const result = dataIntegrityValidator.validateAnalysisInput(validAnalysisInput);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject analysis input with too many competitors', () => {
      const invalidData = {
        ...validAnalysisInput,
        competitorIds: Array.from({ length: 11 }, (_, i) => `comp-${i + 1}`)
      };

      const result = dataIntegrityValidator.validateAnalysisInput(invalidData);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Too many competitors (max 10)');
    });

    it('should reject analysis input with invalid focus areas', () => {
      const invalidData = {
        ...validAnalysisInput,
        focusAreas: ['invalid-area']
      };

      const result = dataIntegrityValidator.validateAnalysisInput(invalidData);
      
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Data Consistency Validation', () => {
    const validEntities = {
      product: {
        id: 'product-123',
        name: 'Test Product',
        projectId: 'project-123'
      },
      project: {
        id: 'project-123',
        name: 'Test Project',
        productIds: ['product-123']
      },
      competitors: [
        { id: 'comp-1', name: 'Competitor 1', projectIds: ['project-123'] }
      ]
    };

    it('should validate consistent data relationships', () => {
      const result = dataIntegrityValidator.validateDataConsistency(validEntities);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect orphaned product references', () => {
      const inconsistentData = {
        ...validEntities,
        project: {
          ...validEntities.project,
          productIds: ['product-123', 'nonexistent-product']
        }
      };

      const result = dataIntegrityValidator.validateDataConsistency(inconsistentData);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Project references non-existent product: nonexistent-product');
    });

    it('should detect mismatched project references', () => {
      const inconsistentData = {
        ...validEntities,
        product: {
          ...validEntities.product,
          projectId: 'different-project'
        }
      };

      const result = dataIntegrityValidator.validateDataConsistency(inconsistentData);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Product project reference mismatch');
    });
  });

  describe('Data Quality Assessment', () => {
    const highQualityData = {
      product: {
        id: 'product-123',
        name: 'Comprehensive Product Name',
        website: 'https://example.com',
        description: 'Very detailed product description with lots of useful information about features and benefits',
        industry: 'Technology',
        keyFeatures: ['Feature 1', 'Feature 2', 'Feature 3'],
        targetAudience: 'Enterprise customers',
        projectId: 'project-123'
      },
      competitors: [
        {
          id: 'comp-1',
          name: 'Detailed Competitor',
          website: 'https://competitor.com',
          description: 'Comprehensive competitor description'
        }
      ]
    };

    it('should assess high-quality data correctly', () => {
      const score = dataIntegrityValidator.calculateDataQualityScore(highQualityData);
      
      expect(score).toBeGreaterThanOrEqual(80);
    });

    it('should penalize incomplete data', () => {
      const lowQualityData = {
        product: {
          id: 'product-123',
          name: 'Product',
          projectId: 'project-123'
        },
        competitors: []
      };

      const score = dataIntegrityValidator.calculateDataQualityScore(lowQualityData);
      
      expect(score).toBeLessThan(50);
    });

    it('should provide quality recommendations', () => {
      const recommendations = dataIntegrityValidator.getDataQualityRecommendations(highQualityData);
      
      expect(Array.isArray(recommendations)).toBe(true);
      expect(recommendations.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle null input gracefully', () => {
      const result = dataIntegrityValidator.validateProductData(null as any);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid input data');
    });

    it('should handle undefined input gracefully', () => {
      const result = dataIntegrityValidator.validateProductData(undefined as any);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid input data');
    });

    it('should handle malformed data gracefully', () => {
      const malformedData = 'not-an-object';
      const result = dataIntegrityValidator.validateProductData(malformedData as any);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid input data');
    });

    it('should provide detailed error information', () => {
      const invalidData = {
        id: '',
        name: '',
        website: 'not-a-url',
        projectId: ''
      };

      const result = dataIntegrityValidator.validateProductData(invalidData) as DetailedValidationResult;
      
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
      expect(result.field).toBeDefined();
      expect(result.severity).toBeDefined();
    });
  });

  describe('Performance', () => {
    it('should validate data efficiently for large datasets', () => {
      const largeDataset = {
        product: {
          id: 'product-123',
          name: 'Test Product',
          website: 'https://example.com',
          description: 'A'.repeat(1000), // Large description
          projectId: 'project-123'
        },
        competitors: Array.from({ length: 10 }, (_, i) => ({
          id: `comp-${i}`,
          name: `Competitor ${i}`,
          website: `https://competitor${i}.com`,
          description: 'B'.repeat(500)
        }))
      };

      const startTime = Date.now();
      const score = dataIntegrityValidator.calculateDataQualityScore(largeDataset);
      const endTime = Date.now();

      expect(score).toBeGreaterThan(0);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
    });
  });
}); 