# CompAI Integration API Documentation

## Overview
This document provides comprehensive API documentation for the CompAI (Competitive AI) prompt integration system. CompAI enables specialized competitive intelligence analysis using structured prompts optimized for market analyst workflows.

## Table of Contents
- [SmartAIService CompAI Integration](#smartaiservice-compai-integration)
- [ComparativeAnalyzer CompAI Integration](#comparativeanalyzer-compai-integration)
- [ReportGenerator CompAI Integration](#reportgenerator-compai-integration)
- [CompAI Prompt Builder Service](#compai-prompt-builder-service)
- [CompAI Template System](#compai-template-system)
- [Data Types and Interfaces](#data-types-and-interfaces)
- [Error Handling](#error-handling)
- [Usage Examples](#usage-examples)

## SmartAIService CompAI Integration

### Enhanced SmartAIAnalysisRequest Interface

The `SmartAIAnalysisRequest` interface has been extended with optional CompAI support:

```typescript
interface SmartAIAnalysisRequest {
  projectId: string;
  forceFreshData?: boolean;
  analysisType: 'competitive' | 'trend' | 'comprehensive';
  dataCutoff?: Date;
  context?: Record<string, any>;
  
  // NEW: CompAI Integration Options
  useCompAIFormat?: boolean;        // Enable CompAI prompt format
  compaiOptions?: CompAIPromptOptions; // CompAI configuration
}
```

### CompAI Integration Options

```typescript
interface CompAIPromptOptions {
  maxHTMLLength?: number;           // Max HTML content length per section (default: 50,000)
  maxCompetitors?: number;          // Max competitors to include (default: 5)
  includeMetadata?: boolean;        // Include technical metadata (default: false)
  truncationStrategy?: 'intelligent' | 'simple'; // HTML truncation approach
}
```

### Usage Example

```typescript
import { SmartAIService } from '@/services/smartAIService';

const smartAI = new SmartAIService();

// Legacy usage (unchanged)
const legacyRequest = {
  projectId: 'project-123',
  analysisType: 'competitive'
};

const legacyResult = await smartAI.analyzeProject(legacyRequest);

// CompAI usage (opt-in)
const compaiRequest = {
  projectId: 'project-123',
  analysisType: 'competitive',
  useCompAIFormat: true,
  compaiOptions: {
    maxHTMLLength: 75000,
    maxCompetitors: 3,
    includeMetadata: true
  }
};

const compaiResult = await smartAI.analyzeProject(compaiRequest);
```

### Response Format

The `SmartAIAnalysisResponse` format remains unchanged, ensuring backward compatibility:

```typescript
interface SmartAIAnalysisResponse {
  analysis: string;                 // Analysis result (format depends on CompAI usage)
  dataFreshness: ProjectFreshnessStatus;
  analysisMetadata: {
    correlationId: string;
    analysisType: string;
    dataFreshGuaranteed: boolean;
    scrapingTriggered: boolean;
    analysisTimestamp: Date;
    contextUsed: Record<string, any>;
  };
  recommendations?: {
    immediate: string[];
    longTerm: string[];
  };
}
```

## ComparativeAnalyzer CompAI Integration

### Enhanced buildAnalysisPrompt Method

The `ComparativeAnalyzer` service now supports CompAI prompts through extended method parameters:

```typescript
class ComparativeAnalyzer {
  private async buildAnalysisPrompt(
    input: ComparativeAnalysisInput,
    template: any,
    useCompAIFormat = false,          // NEW: Enable CompAI format
    compaiOptions?: CompAIPromptOptions // NEW: CompAI configuration
  ): Promise<string>
}
```

### Usage in Analysis Workflow

```typescript
import { ComparativeAnalyzer } from '@/services/domains/analysis/ComparativeAnalyzer';

const analyzer = new ComparativeAnalyzer(bedrockService, validator, config);

// The service automatically handles CompAI integration
// CompAI format is available but defaults to legacy for backward compatibility
const analysis = await analyzer.analyzeProductVsCompetitors(input);
```

## ReportGenerator CompAI Integration

### Enhanced buildComparativeAnalysisPrompt Method

The `ReportGenerator` service now supports CompAI prompts for enhanced report generation:

```typescript
class ReportGenerator {
  private async buildComparativeAnalysisPrompt(
    product: any,
    competitors: any[],
    options: any,
    useCompAIFormat = false,          // NEW: Enable CompAI format
    compaiOptions?: CompAIPromptOptions // NEW: CompAI configuration
  ): Promise<string>
}
```

### CompAI Report Generation

```typescript
import { ReportGenerator } from '@/lib/reports';

const reportGenerator = new ReportGenerator();

// Generate comparative report with CompAI enhancement
const report = await reportGenerator.generateComparativeReport('project-123', {
  reportName: 'Q4 Competitive Analysis',
  template: 'comprehensive',
  focusArea: 'overall',
  includeRecommendations: true
});

// CompAI format is available internally but uses legacy format by default
// for backward compatibility
```

## CompAI Prompt Builder Service

### Core Service

The `CompAIPromptBuilder` is the central service for generating CompAI-formatted prompts:

```typescript
import { CompAIPromptBuilder } from '@/services/analysis/compaiPromptBuilder';

const builder = new CompAIPromptBuilder();

const prompt = await builder.buildCompAIPrompt(
  project,              // Project with products and competitors
  'competitive',        // Analysis type (currently optimized for competitive)
  freshnessStatus,      // Data freshness from SmartScheduling
  options               // Optional CompAI configuration
);
```

### Project Data Structure

The CompAI builder expects project data in this format:

```typescript
interface ProjectWithRelations {
  id: string;
  name: string;
  description?: string;
  status: ProjectStatus;
  priority: ProjectPriority;
  userId: string;
  profileId: string;
  startDate: Date;
  endDate?: Date;
  parameters: Record<string, any>;
  tags: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  scrapingFrequency: ReportScheduleFrequency;
  userEmail?: string;
  industry?: string;
  products: Product[];
  competitors: Competitor[];
}
```

### Freshness Status Integration

CompAI integrates with the SmartScheduling system for data freshness context:

```typescript
interface ProjectFreshnessStatus {
  overallStatus: 'fresh' | 'stale' | 'mixed';
  products: Array<{
    id: string;
    name: string;
    needsScraping: boolean;
    lastSnapshot?: string;
    daysSinceLastSnapshot?: number;
  }>;
  competitors: Array<{
    id: string;
    name: string;
    needsScraping: boolean;
    lastSnapshot?: string;
    daysSinceLastSnapshot?: number;
  }>;
  recommendedActions: string[];
}
```

## CompAI Template System

### Template Structure

CompAI uses a structured template system available through the analysis prompts:

```typescript
import { getCompAIPrompt } from '@/services/analysis/analysisPrompts';

const compaiTemplate = getCompAIPrompt();
// Returns: AnalysisPromptTemplate with CompAI structure
```

### Template Components

```typescript
interface AnalysisPromptTemplate {
  system: string;           // System prompt with role definition
  userTemplate: string;     // User prompt template with variables
  outputFormat: 'MARKDOWN'; // Expected output format
  maxLength: number;        // Maximum response length (8000)
}
```

### Template Variables

CompAI templates support the following variables:

| Variable | Source | Description |
|----------|--------|-------------|
| `{{productName}}` | `product.name` | Product name |
| `{{productInfo}}` | Product model fields | Structured product information |
| `{{productWebsiteHTML}}` | ProductSnapshot.content.html | Raw HTML content |
| `{{competitorHTMLFiles}}` | Snapshot.metadata.html | Competitor HTML content |
| `{{lastAnalysisDate}}` | ProjectFreshnessStatus | Last analysis date |

### Output Structure

CompAI generates structured Markdown reports with these sections:

1. **Executive Summary** - High-level findings overview
2. **Introduction** - Analysis purpose and market context
3. **Competitor Profiles** - Detailed profiles for product and competitors
4. **Comparative Analysis** - Six key analysis areas:
   - Website Customer Experience (CX)
   - Key Claims & Communication
   - Offers & Promotions
   - Pricing & Value Proposition
   - Feature Differences & Gaps
   - Addressing Customer Pain Points
5. **SWOT Analysis** - Strengths, Weaknesses, Opportunities, Threats
6. **Changes Since Last Analysis** - Recent updates and changes
7. **Strategic Recommendations** - Actionable roadmap recommendations
8. **Conclusion** - Summary and strategic importance

## Data Types and Interfaces

### Core CompAI Types

```typescript
// CompAI prompt data structure
interface CompAIPromptData {
  productName: string;
  productInfo: string;
  productWebsiteHTML: string;
  competitorHTMLFiles: string;
  lastAnalysisDate: string;
}

// CompAI analysis result structure  
interface CompAIAnalysisResult {
  executiveSummary: string;
  competitorProfiles: CompetitorProfile[];
  comparativeAnalysis: ComparativeAnalysisSection;
  swotAnalysis: SWOTAnalysis;
  changesSinceLastAnalysis: string;
  strategicRecommendations: Recommendation[];
  conclusion: string;
  worksCited: string[];
}

// Individual competitor profile
interface CompetitorProfile {
  name: string;
  productOfferings: string;
  businessModel: string;
  keyClaimsAndPositioning: string;
}

// Strategic recommendations
interface Recommendation {
  title: string;
  justification: string;
  priority: 'high' | 'medium' | 'low';
  effort: 'low' | 'medium' | 'high';
  impact: 'low' | 'medium' | 'high';
}
```

### Configuration Types

```typescript
// Prompt builder configuration
interface PromptBuilderConfig {
  useCompAIFormat: boolean;
  fallbackToLegacy: boolean;
  contentLimits: {
    maxHTMLLength: number;
    maxCompetitors: number;
    maxPromptLength: number;
  };
  qualityThresholds: {
    minContentLength: number;
    minCompetitorCount: number;
  };
}

// Prompt generation result
interface PromptBuildResult {
  prompt: string;
  metadata: PromptMetadata;
  warnings: string[];
  truncated: boolean;
}
```

## Error Handling

### Graceful Fallback System

CompAI implements robust error handling with graceful fallback to legacy formats:

```typescript
// All services implement this pattern:
if (useCompAIFormat) {
  try {
    return await compaiBuilder.buildCompAIPrompt(project, type, freshness, options);
  } catch (error) {
    logger.error('CompAI failed, falling back to legacy format', error);
    // Continues with legacy format - no service disruption
  }
}
// Legacy format processing continues unchanged
```

### Common Error Scenarios

| Error Condition | Handling | Impact |
|----------------|----------|---------|
| Missing product data | Throws descriptive error | Request fails with clear message |
| No competitors found | Throws descriptive error | Request fails with clear message |
| HTML content too large | Intelligent truncation | Request continues with truncated content |
| CompAI builder failure | Falls back to legacy | Request continues with legacy format |
| Snapshot content missing | Uses fallback message | Request continues with placeholder content |

### Error Response Format

```typescript
// Standard error response format
interface APIErrorResponse {
  error: string;           // Human-readable error message
  code?: string;          // Machine-readable error code
  details?: any;          // Additional error context
  correlationId?: string; // Request tracking ID
}
```

## Usage Examples

### Basic CompAI Integration

```typescript
// Enable CompAI for competitive analysis
const request: SmartAIAnalysisRequest = {
  projectId: 'food-delivery-analysis',
  analysisType: 'competitive',
  useCompAIFormat: true
};

const result = await smartAIService.analyzeProject(request);
// Returns structured markdown competitive analysis
```

### Advanced CompAI Configuration

```typescript
// Fine-tuned CompAI analysis
const advancedRequest: SmartAIAnalysisRequest = {
  projectId: 'saas-platform-analysis',
  analysisType: 'competitive',
  forceFreshData: true,
  useCompAIFormat: true,
  compaiOptions: {
    maxHTMLLength: 100000,      // Larger content limit
    maxCompetitors: 3,          // Focus on top 3 competitors
    includeMetadata: true,      // Include technical details
    truncationStrategy: 'intelligent' // Preserve important sections
  },
  context: {
    focusArea: 'enterprise_features',
    customInstructions: 'Focus on enterprise pricing and security features'
  }
};

const detailedResult = await smartAIService.analyzeProject(advancedRequest);
```

### Mixed Usage Patterns

```typescript
// Support both legacy and CompAI in same application
class AnalysisService {
  async runLegacyAnalysis(projectId: string) {
    return await smartAI.analyzeProject({
      projectId,
      analysisType: 'competitive'
      // No CompAI options - uses legacy format
    });
  }
  
  async runCompAIAnalysis(projectId: string) {
    return await smartAI.analyzeProject({
      projectId,
      analysisType: 'competitive',
      useCompAIFormat: true,
      compaiOptions: { maxCompetitors: 4 }
    });
  }
}
```

### Error Handling Best Practices

```typescript
// Robust error handling with CompAI
async function safeCompAIAnalysis(projectId: string): Promise<string> {
  try {
    const result = await smartAIService.analyzeProject({
      projectId,
      analysisType: 'competitive',
      useCompAIFormat: true,
      compaiOptions: { maxHTMLLength: 50000 }
    });
    
    return result.analysis;
  } catch (error) {
    console.error('CompAI analysis failed:', error);
    
    // Fallback to legacy analysis
    try {
      const fallbackResult = await smartAIService.analyzeProject({
        projectId,
        analysisType: 'competitive'
        // No CompAI options - guaranteed legacy format
      });
      
      return fallbackResult.analysis;
    } catch (fallbackError) {
      console.error('Fallback analysis also failed:', fallbackError);
      throw new Error('Unable to generate analysis');
    }
  }
}
```

## Migration Considerations

### Backward Compatibility

- **100% Backward Compatible**: All existing code continues to work unchanged
- **Opt-in Only**: CompAI features require explicit enabling (`useCompAIFormat: true`)
- **Gradual Migration**: Services can be migrated independently
- **No Breaking Changes**: All existing interfaces and method signatures preserved

### Performance Considerations

- **Legacy Performance**: No impact on existing usage patterns
- **CompAI Overhead**: Minimal additional processing time (< 100ms typical)
- **Memory Usage**: Intelligent content truncation prevents memory issues
- **Concurrent Requests**: Thread-safe prompt generation

### Best Practices

1. **Start Small**: Enable CompAI for one analysis type at a time
2. **Monitor Performance**: Track prompt generation times in production
3. **Content Limits**: Use appropriate `maxHTMLLength` for your use case
4. **Error Handling**: Always implement fallback to legacy format
5. **Testing**: Validate CompAI output quality before production deployment

## Support and Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| "No product found" error | Project has no products | Ensure project has at least one product |
| "No competitors found" error | Project has no competitors | Add competitors to project |
| Content truncated warnings | HTML content exceeds limits | Increase `maxHTMLLength` or use intelligent truncation |
| CompAI fallback to legacy | CompAI builder error | Check logs for specific error details |

### Debugging

Enable detailed logging for CompAI troubleshooting:

```typescript
// CompAI operations are logged with correlation IDs
// Check application logs for entries containing 'CompAI' or 'compai-builder'
```

### Performance Monitoring

Monitor these metrics for CompAI performance:

- Prompt generation time (target: < 100ms)
- Content truncation frequency
- CompAI fallback rate
- Analysis quality feedback

For additional support, consult the integration testing documentation and manual validation scripts in the test suite.
