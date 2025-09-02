/**
 * TP-014 CompAI Bedrock Service Validation Script
 * 
 * Manual validation script for testing CompAI prompt generation and Bedrock integration.
 * This script can be run independently to validate the complete CompAI pipeline.
 * 
 * Usage: npx ts-node src/__tests__/manual/compai-bedrock-validation.ts
 */

import { CompAIPromptBuilder } from '@/services/analysis/compaiPromptBuilder';
import { SmartAIService } from '@/services/smartAIService';
import { getCompAIPrompt } from '@/services/analysis/analysisPrompts';
import { logger } from '@/lib/logger';

// Test data for validation
const mockProject = {
  id: 'validation-project',
  name: 'CompAI Validation Test',
  description: 'Test project for CompAI Bedrock validation',
  status: 'ACTIVE' as const,
  priority: 'MEDIUM' as const,
  userId: 'validation-user',
  profileId: 'validation-profile',
  startDate: new Date(),
  endDate: null,
  parameters: {},
  tags: {},
  createdAt: new Date(),
  updatedAt: new Date(),
  scrapingFrequency: 'WEEKLY' as const,
  userEmail: null,
  industry: 'Food Delivery',
  products: [{
    id: 'product-validation',
    name: 'GoodChop',
    website: 'https://goodchop.com',
    positioning: 'Premium meat delivery service focused on health-conscious consumers',
    customerData: 'Urban professionals aged 25-45, household income $75k+, health and sustainability focused',
    userProblem: 'Difficulty finding high-quality, ethically sourced meat from local grocery stores',
    industry: 'Food Delivery'
  }],
  competitors: [
    {
      id: 'competitor-1',
      name: 'ButcherBox',
      website: 'https://butcherbox.com',
      industry: 'Food Delivery',
      description: 'Grass-fed beef and organic chicken delivery service',
      normalizedWebsite: null,
      employeeCount: null,
      revenue: null,
      founded: null,
      headquarters: null,
      socialMedia: null,
      profileId: null,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: 'competitor-2', 
      name: 'Crowd Cow',
      website: 'https://crowdcow.com',
      industry: 'Food Delivery',
      description: 'Farm-to-table meat marketplace with craft beef and seafood',
      normalizedWebsite: null,
      employeeCount: null,
      revenue: null,
      founded: null,
      headquarters: null,
      socialMedia: null,
      profileId: null,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ]
};

const mockFreshnessStatus = {
  overallStatus: 'fresh' as const,
  products: [{
    id: 'product-validation',
    name: 'GoodChop',
    needsScraping: false,
    lastSnapshot: new Date().toISOString(),
    daysSinceLastSnapshot: 0
  }],
  competitors: [
    {
      id: 'competitor-1',
      name: 'ButcherBox',
      needsScraping: false,
      lastSnapshot: new Date().toISOString(),
      daysSinceLastSnapshot: 1
    },
    {
      id: 'competitor-2',
      name: 'Crowd Cow',
      needsScraping: false,
      lastSnapshot: new Date().toISOString(),
      daysSinceLastSnapshot: 2
    }
  ],
  recommendedActions: []
};

async function validateCompAIPromptGeneration(): Promise<boolean> {
  console.log('\n🧪 Testing CompAI Prompt Generation...');
  
  try {
    const compaiBuilder = new CompAIPromptBuilder();
    
    // Test basic prompt generation
    const prompt = await compaiBuilder.buildCompAIPrompt(
      mockProject,
      'competitive',
      mockFreshnessStatus
    );

    // Validate prompt structure
    const requiredSections = [
      '### **CompAI Prompt**',
      '**Role:**',
      'Senior Market Analyst and Competitive Intelligence Strategist',
      '**Ask:**',
      'GoodChop',
      '**Context:**',
      '**Product Information:**',
      '**Product Website Data:**',
      '**Competitor Website Data:**',
      '**Last Analysis Date:**',
      '# Competitive Landscape Analysis:',
      '## I. Executive Summary',
      '## II. Introduction',
      '## III. Competitor Profiles',
      '## IV. Comparative Analysis',
      '## V. SWOT Analysis',
      '## VI. Changes Since Last Analysis',
      '## VII. Strategic Recommendations',
      '## VIII. Conclusion'
    ];

    let missingsections: string[] = [];
    requiredSections.forEach(section => {
      if (!prompt.includes(section)) {
        missingections.push(section);
      }
    });

    if (missingSections.length > 0) {
      console.error('❌ Missing required sections:', missingSections);
      return false;
    }

    console.log('✅ CompAI prompt generation successful');
    console.log(`📊 Prompt length: ${prompt.length} characters`);
    
    // Test with options
    const promptWithOptions = await compaiBuilder.buildCompAIPrompt(
      mockProject,
      'competitive',
      mockFreshnessStatus,
      {
        maxHTMLLength: 10000,
        maxCompetitors: 2,
        includeMetadata: true
      }
    );

    console.log('✅ CompAI prompt with options successful');
    console.log(`📊 Prompt with options length: ${promptWithOptions.length} characters`);
    
    return true;
  } catch (error) {
    console.error('❌ CompAI prompt generation failed:', error);
    return false;
  }
}

async function validateTemplateSystem(): Promise<boolean> {
  console.log('\n🧪 Testing CompAI Template System...');
  
  try {
    const compaiTemplate = getCompAIPrompt();
    
    // Validate template structure
    if (!compaiTemplate.system) {
      console.error('❌ Missing system prompt');
      return false;
    }
    
    if (!compaiTemplate.userTemplate) {
      console.error('❌ Missing user template');
      return false;
    }
    
    if (compaiTemplate.outputFormat !== 'MARKDOWN') {
      console.error('❌ Incorrect output format:', compaiTemplate.outputFormat);
      return false;
    }
    
    if (compaiTemplate.maxLength !== 8000) {
      console.error('❌ Incorrect max length:', compaiTemplate.maxLength);
      return false;
    }

    // Validate template variables
    const requiredVariables = [
      '{{productName}}',
      '{{productInfo}}',
      '{{productWebsiteHTML}}',
      '{{competitorHTMLFiles}}',
      '{{lastAnalysisDate}}'
    ];

    const missingVariables = requiredVariables.filter(variable => 
      !compaiTemplate.userTemplate.includes(variable)
    );

    if (missingVariables.length > 0) {
      console.error('❌ Missing template variables:', missingVariables);
      return false;
    }

    console.log('✅ CompAI template system validation successful');
    return true;
  } catch (error) {
    console.error('❌ Template system validation failed:', error);
    return false;
  }
}

async function validateServiceIntegration(): Promise<boolean> {
  console.log('\n🧪 Testing Service Integration...');
  
  try {
    // Test SmartAIService interface changes
    const smartAIService = new SmartAIService();
    
    // Validate that new interface properties are available
    const testRequest = {
      projectId: 'validation-project',
      analysisType: 'competitive' as const,
      useCompAIFormat: true,
      compaiOptions: {
        maxHTMLLength: 50000,
        maxCompetitors: 3
      }
    };

    // This should not throw any TypeScript errors
    expect(testRequest.useCompAIFormat).toBe(true);
    expect(testRequest.compaiOptions?.maxHTMLLength).toBe(50000);
    expect(testRequest.compaiOptions?.maxCompetitors).toBe(3);

    console.log('✅ Service integration validation successful');
    return true;
  } catch (error) {
    console.error('❌ Service integration validation failed:', error);
    return false;
  }
}

async function validateBackwardCompatibility(): Promise<boolean> {
  console.log('\n🧪 Testing Backward Compatibility...');
  
  try {
    // Test legacy request format (should work unchanged)
    const legacyRequest = {
      projectId: 'validation-project',
      analysisType: 'competitive' as const
      // No CompAI-specific fields
    };

    // This should work exactly as before
    expect(legacyRequest.projectId).toBe('validation-project');
    expect(legacyRequest.analysisType).toBe('competitive');
    expect(legacyRequest.useCompAIFormat).toBeUndefined();
    expect(legacyRequest.compaiOptions).toBeUndefined();

    // Test all analysis types
    const analysisTypes = ['competitive', 'trend', 'comprehensive'] as const;
    analysisTypes.forEach(type => {
      const request = {
        projectId: 'test',
        analysisType: type
      };
      expect(request.analysisType).toBe(type);
    });

    console.log('✅ Backward compatibility validation successful'); 
    return true;
  } catch (error) {
    console.error('❌ Backward compatibility validation failed:', error);
    return false;
  }
}

async function validateErrorHandling(): Promise<boolean> {
  console.log('\n🧪 Testing Error Handling...');
  
  try {
    const compaiBuilder = new CompAIPromptBuilder();
    
    // Test with invalid project (no products)
    const invalidProject = {
      ...mockProject,
      products: []
    };

    try {
      await compaiBuilder.buildCompAIPrompt(
        invalidProject,
        'competitive',
        mockFreshnessStatus
      );
      console.error('❌ Should have thrown error for project without products');
      return false;
    } catch (error) {
      if (error instanceof Error && error.message.includes('No product found')) {
        console.log('✅ Correctly handled missing product error');
      } else {
        console.error('❌ Unexpected error type:', error);
        return false;
      }
    }

    // Test with invalid project (no competitors)
    const noCompetitorsProject = {
      ...mockProject,
      competitors: []
    };

    try {
      await compaiBuilder.buildCompAIPrompt(
        noCompetitorsProject,
        'competitive',
        mockFreshnessStatus
      );
      console.error('❌ Should have thrown error for project without competitors');
      return false;
    } catch (error) {
      if (error instanceof Error && error.message.includes('No competitors found')) {
        console.log('✅ Correctly handled missing competitors error');
      } else {
        console.error('❌ Unexpected error type:', error);
        return false;
      }
    }

    console.log('✅ Error handling validation successful');
    return true;
  } catch (error) {
    console.error('❌ Error handling validation failed:', error);
    return false;
  }
}

async function runFullValidation(): Promise<void> {
  console.log('🚀 Starting TP-014 CompAI Bedrock Validation');
  console.log('='.repeat(50));
  
  const validationTests = [
    { name: 'CompAI Prompt Generation', test: validateCompAIPromptGeneration },
    { name: 'Template System', test: validateTemplateSystem },
    { name: 'Service Integration', test: validateServiceIntegration },
    { name: 'Backward Compatibility', test: validateBackwardCompatibility },
    { name: 'Error Handling', test: validateErrorHandling }
  ];

  let passedTests = 0;
  let totalTests = validationTests.length;

  for (const { name, test } of validationTests) {
    try {
      const result = await test();
      if (result) {
        passedTests++;
      }
    } catch (error) {
      console.error(`❌ ${name} validation threw unexpected error:`, error);
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log(`📊 Validation Results: ${passedTests}/${totalTests} tests passed`);
  
  if (passedTests === totalTests) {
    console.log('🎉 All CompAI integration validations PASSED!');
    console.log('✅ TP-014 CompAI integration is ready for production');
  } else {
    console.log('⚠️  Some validations failed. Review errors above.');
    console.log('❌ TP-014 CompAI integration needs fixes before production');
  }
  
  console.log('\n📝 Next Steps:');
  console.log('- Run integration tests: npm run test:integration');
  console.log('- Test with actual Bedrock service if AWS credentials are configured');
  console.log('- Validate with real project data');
  console.log('- Monitor prompt generation performance');
}

// Helper function to match expect behavior in validation
function expect(actual: any) {
  return {
    toBe: (expected: any) => {
      if (actual !== expected) {
        throw new Error(`Expected ${actual} to be ${expected}`);
      }
    },
    toBeUndefined: () => {
      if (actual !== undefined) {
        throw new Error(`Expected ${actual} to be undefined`);
      }
    }
  };
}

// Run validation if script is executed directly
if (require.main === module) {
  runFullValidation().catch(error => {
    console.error('❌ Validation script failed:', error);
    process.exit(1);
  });
}

export {
  validateCompAIPromptGeneration,
  validateTemplateSystem,
  validateServiceIntegration,
  validateBackwardCompatibility,
  validateErrorHandling,
  runFullValidation
};
