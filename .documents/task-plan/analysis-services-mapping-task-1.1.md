# Analysis Services Mapping - Task 1.1

## Overview
This document provides a comprehensive mapping of the three existing analysis services that need to be consolidated into a unified `AnalysisService`. This analysis is critical for Task 1.4 implementation and preserving all functionality during consolidation.

**Date:** July 22, 2025  
**Request ID:** REQ001-TASK-1.1  
**Analysis Phase:** Pre-consolidation Service Architecture Review

## Services Analyzed

### 1. ComparativeAnalysisService
**Location:** `src/services/analysis/comparativeAnalysisService.ts`

#### Core Functionality
- **Primary Method:** `analyzeProductVsCompetitors(input: ComparativeAnalysisInput): Promise<ComparativeAnalysis>`
- **Purpose:** Structured competitive analysis comparing product against competitors
- **Analysis Depth:** Comprehensive comparative analysis with multiple focus areas

#### Key Features
- **Bedrock Integration:** Uses AWS Bedrock for AI analysis with anthropic.claude-3-sonnet-20240229-v1:0
- **Configuration Management:** Flexible analysis configuration with focus areas, depth settings
- **Data Validation:** Uses `dataIntegrityValidator` for comprehensive input validation
- **Error Handling:** Sophisticated error classification and handling with custom error types
- **Prompt Engineering:** Advanced prompt templates with context-aware generation

#### Dependencies
- `BedrockService` - AWS Bedrock integration for AI analysis
- `dataIntegrityValidator` - Input data validation
- `logger` - Correlation ID tracking and logging
- `analysisPrompts` - Comprehensive prompt templates
- `serviceRegistry` - Service registration and health checks

#### Analysis Configuration
```typescript
interface AnalysisConfiguration {
  provider: 'bedrock';
  model: 'anthropic.claude-3-sonnet-20240229-v1:0';
  maxTokens: 8000;
  temperature: 0.3;
  focusAreas: ['features', 'positioning', 'user_experience', 'customer_targeting'];
  includeMetrics: true;
  includeRecommendations: true;
  analysisDepth: 'detailed';
}
```

#### Output Structure
- **Summary:** Overall position, strengths/weaknesses, opportunity score, threat level
- **Detailed Analysis:** Feature comparison, positioning analysis, UX comparison, customer targeting
- **Recommendations:** Immediate, short-term, and long-term actions with priority scoring
- **Metadata:** Confidence scores, processing time, data quality assessment

#### Critical Integration Points
- Stored credentials handling with fallback to environment variables
- JSON parsing with structured fallback for malformed AI responses
- Comprehensive validation with relaxed content requirements (minimum 10 characters)

### 2. UserExperienceAnalyzer  
**Location:** `src/services/analysis/userExperienceAnalyzer.ts`

#### Core Functionality
- **Primary Method:** `analyzeProductVsCompetitors(productData, competitorData, options): Promise<UXAnalysisResult>`
- **Purpose:** UX-focused competitive analysis with design and usability insights
- **Specialization:** User experience, design quality, accessibility, mobile optimization

#### Key Features
- **UX-Specific Prompts:** Tailored prompts for UX analysis focusing on design, navigation, usability
- **Competitor Limiting:** Performance optimization by limiting competitors (max 5 by default)
- **Focused Analysis:** Specialized analysis for mobile, desktop, conversion, accessibility
- **Confidence Scoring:** Built-in confidence assessment for analysis quality

#### Dependencies
- `BedrockService` - AI analysis via Bedrock
- `generateCorrelationId` - Correlation tracking
- `logger` - Structured logging with correlation IDs

#### Analysis Options
```typescript
interface UXAnalysisOptions {
  focus?: 'mobile' | 'desktop' | 'both';
  includeTechnical?: boolean;
  includeAccessibility?: boolean;
  maxCompetitors?: number;
}
```

#### Output Structure
- **Summary:** Executive summary of UX competitive position
- **Strengths/Weaknesses:** Product-specific UX strengths and areas for improvement
- **Opportunities:** Market opportunities for UX enhancement
- **Recommendations:** Specific, actionable UX improvements
- **Competitor Comparisons:** Detailed comparison with each competitor
- **Metadata:** Correlation ID, analysis timestamp, confidence score

#### Specialized Methods
- `generateFocusedAnalysis()` - Target-specific analysis (navigation, mobile, conversion, content, accessibility)
- `analyzeCompetitiveUX()` - Comprehensive competitive UX assessment

### 3. SmartAIService
**Location:** `src/services/smartAIService.ts`

#### Core Functionality
- **Primary Method:** `analyzeWithSmartScheduling(request: SmartAIAnalysisRequest): Promise<SmartAIAnalysisResponse>`
- **Purpose:** AI analysis with smart scheduling integration for fresh data guarantee
- **Critical Feature:** Data freshness-aware analysis with automatic scraping triggers

#### Key Features
- **Smart Scheduling Integration:** CRITICAL dependency on `SmartSchedulingService`
- **Data Freshness Guarantee:** Automatic scraping trigger when data is stale
- **Enhanced Context:** Incorporates scheduling metadata into AI analysis
- **Auto Analysis Setup:** Configuration for automated analysis on project creation
- **Conversation Management:** Integration with chat/conversation system

#### CRITICAL Data Flow (Identified in Health Audit)
```typescript
// PRESERVE EXACTLY - Critical data flow
1. Check data freshness → SmartSchedulingService.getFreshnessStatus()
2. Trigger scraping if needed → SmartSchedulingService.checkAndTriggerScraping()
3. Wait for scraping completion (2 second delay)
4. Get updated freshness status
5. Generate analysis with fresh data context
```

#### Dependencies
- **SmartSchedulingService** - CRITICAL: Data freshness checking and scraping triggers
- **BedrockService** - AI analysis generation
- **ConversationManager** - Chat/conversation integration
- **prisma** - Database operations for project/product/competitor data

#### Analysis Types
- `'competitive'` - Comprehensive competitive analysis
- `'trend'` - Market trends and patterns analysis  
- `'comprehensive'` - Complete business intelligence analysis

#### Output Structure
```typescript
interface SmartAIAnalysisResponse {
  analysis: string;                    // Generated AI analysis
  dataFreshness: ProjectFreshnessStatus; // Freshness indicators
  analysisMetadata: {
    correlationId: string;
    analysisType: string;
    dataFreshGuaranteed: boolean;      // CRITICAL: Fresh data guarantee
    scrapingTriggered: boolean;
    analysisTimestamp: Date;
    contextUsed: Record<string, any>;
  };
  recommendations: {
    immediate: string[];
    longTerm: string[];
  };
}
```

#### Auto Analysis Configuration
```typescript
interface SmartAISetupConfig {
  analysisTypes: ('competitive' | 'trend' | 'comprehensive')[];
  frequency: 'daily' | 'weekly' | 'monthly';
  autoTrigger: boolean;
  freshnessThreshold: number;
}
```

## Consolidation Analysis

### Shared Dependencies
All three services share these common dependencies:
- **BedrockService** - Central AI service (can be shared instance)
- **logger** - Correlation tracking and structured logging
- **generateCorrelationId** - Request tracking across services

### Unique Dependencies
- **ComparativeAnalysisService:** `dataIntegrityValidator`, `analysisPrompts`, `serviceRegistry`
- **UserExperienceAnalyzer:** UX-specific prompts and focused analysis capabilities
- **SmartAIService:** `SmartSchedulingService` (CRITICAL), `ConversationManager`, `prisma`

### Integration Patterns

#### Error Handling Patterns
- **ComparativeAnalysisService:** Custom error types with detailed classification
- **UserExperienceAnalyzer:** Fallback analysis results with confidence degradation
- **SmartAIService:** Correlation-based error tracking with business event logging

#### Configuration Management
- **ComparativeAnalysisService:** Comprehensive configuration object with runtime updates
- **UserExperienceAnalyzer:** Simple options-based configuration
- **SmartAIService:** Auto-analysis configuration stored in project metadata

#### Response Parsing
- **ComparativeAnalysisService:** Structured JSON parsing with comprehensive fallbacks
- **UserExperienceAnalyzer:** Flexible parsing with guaranteed result structure
- **SmartAIService:** Enhanced prompt-based analysis with freshness context

### Critical Preservation Requirements

#### 1. Smart Scheduling Integration (CRITICAL)
The SmartAIService integration with SmartSchedulingService represents a critical data flow that MUST be preserved exactly:
- Data freshness checking before analysis
- Automatic scraping trigger for stale data
- 2-second wait period for scraping completion
- Fresh data guarantee in analysis response

#### 2. Analysis Quality and Depth
Each service provides specialized analysis capabilities:
- **Comparative:** Structured competitive analysis with detailed breakdowns
- **UX:** Design and user experience focused insights
- **Smart AI:** Fresh data-aware comprehensive analysis

#### 3. Backward Compatibility
All existing method signatures must be preserved for seamless migration:
- `analyzeProductVsCompetitors()` - ComparativeAnalysisService
- `analyzeWithSmartScheduling()` - SmartAIService
- UX analysis methods with options support

### Consolidation Strategy

#### Factory Pattern Implementation
```typescript
export class AnalysisService {
  private aiAnalyzer: AIAnalyzer;           // Migrated SmartAIService
  private uxAnalyzer: UXAnalyzer;           // Migrated UserExperienceAnalyzer
  private comparativeAnalyzer: ComparativeAnalyzer; // Migrated ComparativeAnalysisService
  
  // Shared infrastructure
  private bedrockService: BedrockService;
  private smartSchedulingService: SmartSchedulingService; // CRITICAL DEPENDENCY
}
```

#### Unified Interface Design
```typescript
async analyzeProduct(request: UnifiedAnalysisRequest): Promise<UnifiedAnalysisResponse> {
  const { analysisType, productData, competitorData, options } = request;
  
  switch (analysisType) {
    case 'ai_comprehensive':
      return this.aiAnalyzer.analyzeWithSmartScheduling(request);
    case 'ux_comparison':  
      return this.uxAnalyzer.analyzeProductVsCompetitors(productData, competitorData, options);
    case 'comparative_analysis':
      return this.comparativeAnalyzer.analyzeProductVsCompetitors(request);
  }
}
```

## Next Steps (Task 1.2)

1. **Design Unified Interface:** Create consolidated interface combining all analysis capabilities
2. **Preserve Critical Dependencies:** Ensure SmartSchedulingService integration remains intact
3. **Implement Factory Pattern:** Design modular sub-services for each analysis type
4. **Maintain Backward Compatibility:** Preserve all existing method signatures
5. **Error Handling Strategy:** Consolidate error handling patterns while preserving functionality

## Risk Assessment

### High Risk
- **Smart Scheduling Integration:** Any changes to this flow could break critical data freshness guarantees
- **Analysis Quality:** Consolidation must not degrade analysis depth or accuracy
- **Performance Impact:** Shared services must not create bottlenecks

### Medium Risk  
- **Configuration Management:** Multiple configuration patterns need harmonization
- **Error Handling:** Different error handling approaches need consolidation
- **Dependency Management:** Shared vs unique dependencies need careful management

### Low Risk
- **Logging Consolidation:** Similar logging patterns across services
- **Response Formatting:** Flexible response structures allow adaptation
- **Service Registration:** Existing patterns can be extended to unified service 