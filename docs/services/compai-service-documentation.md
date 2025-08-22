# CompAI Service Documentation

## Overview
This document provides comprehensive service-level documentation for the CompAI (Competitive AI) integration across all enhanced services. Each service maintains full backward compatibility while providing optional CompAI capabilities.

## Table of Contents
- [CompAI Prompt Builder Service](#compai-prompt-builder-service)
- [SmartAI Service Integration](#smartai-service-integration)
- [Comparative Analyzer Integration](#comparative-analyzer-integration)
- [Report Generator Integration](#report-generator-integration)
- [Analysis Prompts Template System](#analysis-prompts-template-system)
- [Data Formatting Utilities](#data-formatting-utilities)
- [Implementation Examples](#implementation-examples)
- [Best Practices](#best-practices)

## CompAI Prompt Builder Service

### Service Overview
The `CompAIPromptBuilder` is the core service responsible for generating specialized competitive intelligence prompts optimized for market analyst workflows.

**Location**: `src/services/analysis/compaiPromptBuilder.ts`

### Key Features
- **Structured Prompt Generation**: Creates comprehensive competitive analysis prompts
- **HTML Content Integration**: Extracts and processes website HTML content
- **Intelligent Truncation**: Manages large content with smart truncation strategies
- **Competitor Limiting**: Configurable competitor selection to prevent prompt bloat
- **Data Freshness Integration**: Incorporates SmartScheduling freshness context

### Class Definition

```typescript
export class CompAIPromptBuilder {
  private readonly DEFAULT_MAX_HTML_LENGTH = 50000;
  private readonly DEFAULT_MAX_COMPETITORS = 5;

  /**
   * Build CompAI prompt from project data
   */
  async buildCompAIPrompt(
    project: ProjectWithRelations,
    analysisType: 'competitive' = 'competitive',
    freshnessStatus: ProjectFreshnessStatus,
    options: CompAIPromptOptions = {}
  ): Promise<string>

  // Private helper methods for data transformation and content extraction
}
```

### Usage Examples

#### Basic CompAI Prompt Generation
```typescript
import { CompAIPromptBuilder } from '@/services/analysis/compaiPromptBuilder';

const builder = new CompAIPromptBuilder();

// Get project with relations
const project = await prisma.project.findUnique({
  where: { id: projectId },
  include: { products: true, competitors: true }
});

// Get freshness status
const freshnessStatus = await smartSchedulingService.getProjectFreshness(projectId);

// Generate CompAI prompt
const prompt = await builder.buildCompAIPrompt(
  project,
  'competitive',
  freshnessStatus
);

console.log('Generated CompAI prompt:', prompt.length, 'characters');
```

#### Advanced Configuration
```typescript
const advancedPrompt = await builder.buildCompAIPrompt(
  project,
  'competitive',
  freshnessStatus,
  {
    maxHTMLLength: 100000,        // Large content analysis
    maxCompetitors: 3,            // Focus on top 3
    includeMetadata: true         // Technical details
  }
);
```

#### Error Handling
```typescript
try {
  const prompt = await builder.buildCompAIPrompt(project, 'competitive', freshness);
  return prompt;
} catch (error) {
  if (error.message.includes('No product found')) {
    throw new Error('Project must have at least one product for CompAI analysis');
  }
  if (error.message.includes('No competitors found')) {
    throw new Error('Project must have competitors for competitive analysis');
  }
  throw error; // Re-throw other errors
}
```

### Content Processing Features

#### HTML Content Extraction
```typescript
// Product HTML extraction
const productHTML = extractProductHTML(productSnapshot, {
  maxLength: 50000,
  preserveStructure: true
});

// Competitor HTML extraction  
const competitorHTML = extractCompetitorHTML(competitorSnapshots, {
  maxLength: 30000,
  preserveStructure: true
});
```

#### Intelligent Truncation
```typescript
// Automatic intelligent truncation for large content
const truncatedHTML = intelligentHTMLTruncation(
  originalHTML,
  maxLength,
  'competitor-name'
);

// Preserves important sections:
// - <head> content
// - <nav> navigation
// - <main> content areas
// - Adds truncation notices
```

## SmartAI Service Integration

### Service Overview
The `SmartAIService` has been enhanced with optional CompAI support while maintaining complete backward compatibility with existing workflows.

**Location**: `src/services/smartAIService.ts`

### Enhanced Interface

```typescript
// Extended SmartAIAnalysisRequest interface
export interface SmartAIAnalysisRequest {
  projectId: string;
  forceFreshData?: boolean;
  analysisType: 'competitive' | 'trend' | 'comprehensive';
  dataCutoff?: Date;
  context?: Record<string, any>;
  
  // NEW: CompAI Integration
  useCompAIFormat?: boolean;
  compaiOptions?: CompAIPromptOptions;
}
```

### Implementation Details

#### Constructor Integration
```typescript
export class SmartAIService {
  private smartScheduler: SmartSchedulingService;
  private bedrockService: BedrockService | null = null;
  private conversationManager: ConversationManager;
  private compaiBuilder: CompAIPromptBuilder; // NEW: CompAI integration

  constructor() {
    this.smartScheduler = new SmartSchedulingService();
    this.conversationManager = new ConversationManager();
    this.compaiBuilder = new CompAIPromptBuilder(); // NEW: CompAI integration
  }
}
```

#### Enhanced Prompt Building
```typescript
private async buildEnhancedPrompt(
  project: any,
  analysisType: string,
  freshnessStatus: ProjectFreshnessStatus,
  additionalContext?: Record<string, any>,
  useCompAIFormat = false,           // NEW: CompAI option
  compaiOptions?: CompAIPromptOptions // NEW: CompAI configuration
): Promise<string> {
  // CompAI format with fallback
  if (useCompAIFormat && analysisType === 'competitive') {
    try {
      return await this.compaiBuilder.buildCompAIPrompt(
        project,
        'competitive',
        freshnessStatus,
        compaiOptions
      );
    } catch (error) {
      logger.error('CompAI failed, falling back to legacy format', error);
      // Falls through to legacy format
    }
  }
  
  // Legacy format (unchanged)
  // ... existing implementation
}
```

### Usage Examples

#### Standard Legacy Usage (Unchanged)
```typescript
const smartAI = new SmartAIService();

// This works exactly as before
const legacyResult = await smartAI.analyzeProject({
  projectId: 'business-analysis-2024',
  analysisType: 'competitive'
});

console.log('Legacy analysis:', legacyResult.analysis);
```

#### CompAI Enhanced Usage
```typescript
// Enable CompAI for competitive analysis
const compaiResult = await smartAI.analyzeProject({
  projectId: 'business-analysis-2024',
  analysisType: 'competitive',
  useCompAIFormat: true,
  compaiOptions: {
    maxHTMLLength: 75000,
    maxCompetitors: 4
  }
});

console.log('CompAI analysis:', compaiResult.analysis);
// Returns structured markdown report instead of generic analysis
```

#### Mixed Usage Pattern
```typescript
class AnalysisOrchestrator {
  async runComprehensiveAnalysis(projectId: string) {
    // Use CompAI for competitive analysis
    const competitive = await smartAI.analyzeProject({
      projectId,
      analysisType: 'competitive',
      useCompAIFormat: true
    });
    
    // Use legacy for trend analysis (CompAI not optimized for trends)
    const trends = await smartAI.analyzeProject({
      projectId,
      analysisType: 'trend'
    });
    
    return { competitive: competitive.analysis, trends: trends.analysis };
  }
}
```

## Comparative Analyzer Integration

### Service Overview
The `ComparativeAnalyzer` has been enhanced with internal CompAI support while maintaining its existing interface and backward compatibility.

**Location**: `src/services/domains/analysis/ComparativeAnalyzer.ts`

### Enhanced Implementation

#### Constructor Integration
```typescript
class ComparativeAnalyzer implements IComparativeAnalyzer {
  private bedrockService: BedrockService;
  private dataIntegrityValidator: any;
  private configuration: AnalysisConfiguration;
  private compaiBuilder: CompAIPromptBuilder; // NEW: CompAI integration

  constructor(
    bedrockService: BedrockService,
    dataIntegrityValidator: any,
    configuration: AnalysisConfiguration
  ) {
    this.bedrockService = bedrockService;
    this.dataIntegrityValidator = dataIntegrityValidator;
    this.configuration = { /* ... */ };
    this.compaiBuilder = new CompAIPromptBuilder(); // NEW: CompAI integration
  }
}
```

#### Enhanced Prompt Building
```typescript
private async buildAnalysisPrompt(
  input: ComparativeAnalysisInput,
  template: any,
  useCompAIFormat = false,           // NEW: CompAI option
  compaiOptions?: CompAIPromptOptions // NEW: CompAI configuration
): Promise<string> {
  // CompAI format with project data transformation
  if (useCompAIFormat) {
    try {
      // Transform input to project format
      const projectData = {
        id: 'comparative-analysis',
        name: input.product.name, 
        // ... full project structure
        products: [input.product],
        competitors: input.competitors.map(c => c.competitor)
      };

      const mockFreshnessStatus = {
        overallStatus: 'fresh' as const,
        products: [{ /* ... */ }],
        competitors: [{ /* ... */ }],
        recommendedActions: []
      };

      return await this.compaiBuilder.buildCompAIPrompt(
        projectData,
        'competitive',
        mockFreshnessStatus,
        compaiOptions
      );
    } catch (error) {
      logger.error('CompAI failed, falling back to legacy format', error);
      // Falls through to legacy template system
    }
  }
  
  // Legacy template system (unchanged)
  // ... existing implementation
}
```

### Usage Examples

#### Standard Usage (No Changes Required)
```typescript
const analyzer = new ComparativeAnalyzer(bedrockService, validator, config);

// This works exactly as before
const result = await analyzer.analyzeProductVsCompetitors({
  product: productData,
  productSnapshot: productSnapshot,
  competitors: competitorData,
  analysisConfig: config
});
```

#### Internal CompAI Integration
```typescript
// CompAI integration is handled automatically internally
// No interface changes required for consumers
// The service uses appropriate prompt format based on internal logic
```

## Report Generator Integration

### Service Overview
The `ReportGenerator` has been enhanced with CompAI support for generating professional competitive analysis reports.

**Location**: `src/lib/reports.ts`

### Enhanced Implementation

#### Constructor Integration
```typescript
export class ReportGenerator {
  private prisma = prisma;
  private bedrock: BedrockRuntimeClient;
  private trendAnalyzer: TrendAnalyzer;
  private streamingProcessor: StreamingDataProcessor;
  private memoryOptimizedGenerator: MemoryOptimizedReportGenerator;
  private compaiBuilder: CompAIPromptBuilder; // NEW: CompAI integration

  constructor() {
    // ... existing initialization
    this.compaiBuilder = new CompAIPromptBuilder(); // NEW: CompAI integration
  }
}
```

#### Enhanced Report Generation
```typescript
private async buildComparativeAnalysisPrompt(
  product: any,
  competitors: any[],
  options: any,
  useCompAIFormat = false,           // NEW: CompAI option
  compaiOptions?: CompAIPromptOptions // NEW: CompAI configuration
): Promise<string> {
  // CompAI format with data transformation
  if (useCompAIFormat) {
    try {
      const projectData = {
        // Transform report data to project format
        id: 'report-generator',
        name: product.name,
        // ... full project structure
        products: [product],
        competitors: competitors
      };

      const mockFreshnessStatus = {
        // Generate freshness status from report data
        overallStatus: 'fresh' as const,
        // ... freshness data
      };

      return await this.compaiBuilder.buildCompAIPrompt(
        projectData,
        'competitive',
        mockFreshnessStatus,
        compaiOptions
      );
    } catch (error) {
      logger.error('CompAI failed in ReportGenerator, falling back', error);
      // Falls through to legacy format
    }
  }
  
  // Legacy format (unchanged)
  // ... existing implementation
}
```

### Usage Examples

#### Standard Report Generation (Unchanged)
```typescript
const reportGenerator = new ReportGenerator();

// This works exactly as before
const report = await reportGenerator.generateComparativeReport('project-123', {
  reportName: 'Q4 Competitive Analysis',
  template: 'comprehensive',
  focusArea: 'overall',
  includeRecommendations: true
});
```

#### Internal CompAI Enhancement
```typescript
// CompAI integration is internal to the report generation process
// Enhanced reports automatically benefit from CompAI when appropriate
// No interface changes required for consumers
```

## Analysis Prompts Template System

### Service Overview
The analysis prompts system has been extended with CompAI templates while preserving all existing templates.

**Location**: `src/services/analysis/analysisPrompts.ts`

### New CompAI Templates

#### CompAI System Prompt
```typescript
export const COMPAI_SYSTEM_PROMPT = `You are an expert Senior Market Analyst and Competitive Intelligence Strategist. Your primary function is to analyze market data, identify key competitive differentiators, and provide actionable strategic recommendations...`;
```

#### CompAI Prompt Template
```typescript
export const COMPAI_PROMPT_TEMPLATE: AnalysisPromptTemplate = {
  system: COMPAI_SYSTEM_PROMPT,
  userTemplate: `### **CompAI Prompt**

**Role:**
You are an expert Senior Market Analyst...

**Ask:**
Generate a comprehensive competitive analysis report...

**Context:**
You will be provided with the following data sources:
1. **Product Information:** {{productInfo}}
2. **Product Website Data:** {{productWebsiteHTML}}
3. **Competitor Website Data:** {{competitorHTMLFiles}}
4. **Last Analysis Date:** {{lastAnalysisDate}}

**Output Guidance & Template:**
Generate a detailed report in Markdown format...`,
  outputFormat: 'MARKDOWN',
  maxLength: 8000
};
```

#### Template Access Function
```typescript
export function getCompAIPrompt(): AnalysisPromptTemplate {
  return COMPAI_PROMPT_TEMPLATE;
}
```

### Usage Examples

#### Accessing CompAI Templates
```typescript
import { getCompAIPrompt, getAnalysisPrompt } from '@/services/analysis/analysisPrompts';

// Get CompAI template
const compaiTemplate = getCompAIPrompt();
console.log('CompAI system prompt:', compaiTemplate.system);

// Existing templates still available
const legacyTemplate = getAnalysisPrompt(['features'], 'detailed');
console.log('Legacy template:', legacyTemplate.userTemplate);
```

#### Template Integration
```typescript
// CompAI templates integrate with existing prompt system
function selectPromptTemplate(useCompAI: boolean, focusAreas: AnalysisFocusArea[]) {
  if (useCompAI) {
    return getCompAIPrompt();
  }
  return getAnalysisPrompt(focusAreas, 'comprehensive');
}
```

## Data Formatting Utilities

### Service Overview
Shared utilities for transforming database models into CompAI prompt format.

**Location**: `src/lib/prompts/compaiFormatter.ts`

### Key Utilities

#### Product Information Formatting
```typescript
export function formatProductInfo(product: Product): string {
  return `
**Product Name:** ${product.name}
**Website:** ${product.website}
**Industry:** ${product.industry}
**Product Description:** ${product.positioning}
**Target Customer Segments:** ${product.customerData}
**Customer Problems/Needs:** ${product.userProblem}
**How Our Product Addresses Them:** ${product.positioning}
  `.trim();
}
```

#### HTML Content Extraction
```typescript
export function extractProductHTML(
  snapshot: ProductSnapshot | null,
  options: ContentExtractionOptions = {}
): string;

export function extractCompetitorHTML(
  competitorSnapshots: CompetitorWithSnapshot[],
  options: ContentExtractionOptions = {}
): string;
```

#### Content Quality Validation
```typescript
export function validateHTMLContent(html: string, source: string): {
  isValid: boolean;
  issues: string[];
  quality: 'high' | 'medium' | 'low';
};
```

### Usage Examples

#### Manual Content Formatting
```typescript
import { 
  formatProductInfo, 
  extractProductHTML, 
  extractCompetitorHTML 
} from '@/lib/prompts/compaiFormatter';

// Format product information
const productInfo = formatProductInfo(product);

// Extract HTML content
const productHTML = extractProductHTML(productSnapshot, {
  maxLength: 50000,
  preserveStructure: true
});

const competitorHTML = extractCompetitorHTML(competitorSnapshots, {
  maxLength: 30000
});
```

#### Content Statistics
```typescript
import { calculateContentStatistics } from '@/lib/prompts/compaiFormatter';

const stats = calculateContentStatistics(
  productHTML,
  competitorHTML,
  competitorSnapshots
);

console.log('Content statistics:', {
  totalLength: stats.totalHTMLLength,
  avgCompetitorLength: stats.averageCompetitorLength,
  qualityIssues: stats.qualityIssues
});
```

## Implementation Examples

### Complete CompAI Workflow
```typescript
class CompAIWorkflowExample {
  private smartAI = new SmartAIService();
  private compaiBuilder = new CompAIPromptBuilder();

  async runCompleteCompAIAnalysis(projectId: string) {
    try {
      // Step 1: Get project data
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: { products: true, competitors: true }
      });

      if (!project) {
        throw new Error('Project not found');
      }

      // Step 2: Check data freshness
      const freshness = await this.smartScheduler.getProjectFreshness(projectId);

      // Step 3: Generate CompAI analysis
      const result = await this.smartAI.analyzeProject({
        projectId,
        analysisType: 'competitive',
        useCompAIFormat: true,
        compaiOptions: {
          maxHTMLLength: 75000,
          maxCompetitors: 4,
          includeMetadata: false
        }
      });

      // Step 4: Process results
      return {
        analysis: result.analysis,
        metadata: result.analysisMetadata,
        freshness: result.dataFreshness,
        recommendations: result.recommendations
      };

    } catch (error) {
      console.error('CompAI workflow failed:', error);
      
      // Fallback to legacy analysis
      return await this.smartAI.analyzeProject({
        projectId,
        analysisType: 'competitive'
      });
    }
  }
}
```

### Service Integration Pattern
```typescript
class ServiceIntegrationExample {
  async integrateCompAIAcrossServices(projectId: string) {
    const results = {};

    // SmartAI with CompAI
    try {
      results.smartAI = await new SmartAIService().analyzeProject({
        projectId,
        analysisType: 'competitive',
        useCompAIFormat: true
      });
    } catch (error) {
      console.warn('SmartAI CompAI failed:', error.message);
    }

    // Report generation with CompAI benefits
    try {
      results.report = await new ReportGenerator().generateComparativeReport(
        projectId,
        { template: 'comprehensive', focusArea: 'overall' }
      );
    } catch (error) {
      console.warn('Report generation failed:', error.message);
    }

    return results;
  }
}
```

### Error Handling Best Practices
```typescript
class ErrorHandlingExample {
  async robustCompAIUsage(projectId: string) {
    const smartAI = new SmartAIService();

    // Multi-level fallback strategy
    try {
      // Try CompAI with full configuration
      return await smartAI.analyzeProject({
        projectId,
        analysisType: 'competitive',
        useCompAIFormat: true,
        compaiOptions: { maxHTMLLength: 100000, maxCompetitors: 5 }
      });
    } catch (error) {
      console.warn('Full CompAI failed:', error.message);

      try {
        // Try CompAI with default settings
        return await smartAI.analyzeProject({
          projectId,
          analysisType: 'competitive',
          useCompAIFormat: true
        });
      } catch (error) {
        console.warn('Default CompAI failed:', error.message);

        // Final fallback to legacy
        return await smartAI.analyzeProject({
          projectId,
          analysisType: 'competitive'
        });
      }
    }
  }
}
```

## Best Practices

### 1. Service Selection
- **SmartAIService**: Use for direct competitive analysis requests
- **ComparativeAnalyzer**: Use for detailed comparative analysis workflows
- **ReportGenerator**: Use for comprehensive report generation
- **CompAIPromptBuilder**: Use for custom prompt generation needs

### 2. Configuration Guidelines
```typescript
// Recommended CompAI options by use case
const configs = {
  quick: { maxHTMLLength: 25000, maxCompetitors: 2 },
  standard: { maxHTMLLength: 50000, maxCompetitors: 3 },
  comprehensive: { maxHTMLLength: 100000, maxCompetitors: 5 },
  enterprise: { maxHTMLLength: 150000, maxCompetitors: 8, includeMetadata: true }
};
```

### 3. Error Handling Strategy
- Always implement fallback to legacy format
- Log CompAI failures for monitoring
- Provide meaningful error messages to users
- Use correlation IDs for debugging

### 4. Performance Optimization
```typescript
// Monitor CompAI performance
function monitorCompAIPerformance<T>(
  operation: () => Promise<T>,
  operationName: string
): Promise<T> {
  const start = Date.now();
  return operation().finally(() => {
    const duration = Date.now() - start;
    console.log(`${operationName} took ${duration}ms`);
  });
}
```

### 5. Content Management
- Use appropriate content limits based on website sizes
- Monitor truncation frequency
- Validate HTML content quality
- Implement intelligent truncation for important content

### 6. Testing Strategy
```typescript
// Comprehensive testing approach
class CompAITestingStrategy {
  async validateCompAIIntegration() {
    // Test prompt generation
    await this.testPromptGeneration();
    
    // Test service integration
    await this.testServiceIntegration();
    
    // Test error handling
    await this.testErrorHandling();
    
    // Test performance
    await this.testPerformance();
  }
}
```

### 7. Monitoring and Observability
- Track CompAI usage patterns
- Monitor prompt generation times
- Alert on high CompAI failure rates
- Measure analysis quality improvements

This documentation provides comprehensive guidance for implementing and using CompAI across all integrated services while maintaining robust error handling and backward compatibility.
