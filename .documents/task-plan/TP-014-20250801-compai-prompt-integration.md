# TP-014-20250801-CompAI-Prompt-Integration

## Overview
- **Brief Summary:** Update the AI prompt sent to the bedrock model for competitive analysis from the current generic structure to the specialized CompAI prompt template
- **Project Name:** Competitor Research Agent
- **Date:** 2025-08-01
- **RequestID:** TP-014-20250801-compai-prompt-integration

## Pre-requisites
- Access to AWS Bedrock service and Claude AI model
- Understanding of current prompt structure in the application
- Knowledge of CompAI prompt template requirements
- **Git Branch Creation:** `git checkout -b feature/compai-prompt-integration-20250801-TP-014`

## Dependencies
- **Internal Services:**
  - `BedrockService` (`src/services/bedrock/bedrock.service.ts`)
  - `SmartAIService` (`src/services/smartAIService.ts`)
  - `ComparativeAnalyzer` (`src/services/domains/analysis/ComparativeAnalyzer.ts`)
  - `AIAnalyzer` (`src/services/domains/analysis/AIAnalyzer.ts`)
  - `ReportGenerator` (`src/lib/reports.ts`)
  - Analysis prompt templates (`src/services/analysis/analysisPrompts.ts`)

- **Database Models:**
  - Project, Product, Competitor, Snapshot models (Prisma schema)
  - Product and competitor snapshot data structures

- **External Dependencies:**
  - AWS Bedrock API
  - Claude AI model (anthropic.claude-3-sonnet-20240229-v1:0)

## Task Breakdown

- [ ] 1.0 Analysis and Assessment Phase
    - [ ] 1.1 Document current prompt structure across all services (SmartAIService, ComparativeAnalyzer, ReportGenerator)
    - [ ] 1.2 Map data flow from database models to prompt variables
    - [ ] 1.3 Identify all services that generate prompts for bedrock integration
    - [ ] 1.4 Analyze CompAI prompt template requirements and expected data format

- [ ] 2.0 Data Model Compatibility Assessment  
    - [ ] 2.1 Map CompAI prompt placeholders to actual database fields
    - [ ] 2.2 Identify missing data fields required by CompAI prompt
    - [ ] 2.3 Assess if current snapshot content structure supports CompAI requirements
    - [ ] 2.4 Design data transformation layer if needed

- [ ] 3.0 CompAI Prompt Adaptation
    - [ ] 3.1 Create adapted CompAI prompt template using actual application data model
    - [ ] 3.2 Replace placeholder variables with actual database field mappings
    - [ ] 3.3 Integrate data freshness context from SmartScheduling system
    - [ ] 3.4 Preserve system prompt structure and role definitions

- [ ] 4.0 Service Implementation Updates
    - [ ] 4.1 Update `buildEnhancedPrompt` method in SmartAIService
    - [ ] 4.2 Update `buildAnalysisPrompt` method in ComparativeAnalyzer
    - [ ] 4.3 Update `buildComparativeAnalysisPrompt` method in ReportGenerator
    - [ ] 4.4 Update prompt templates in analysisPrompts.ts
    - [ ] 4.5 Ensure backward compatibility with existing analysis types

- [ ] 5.0 Integration and Testing
    - [ ] 5.1 Test prompt generation with sample project data
    - [ ] 5.2 Validate bedrock service integration with updated prompts
    - [ ] 5.3 Test all analysis types (competitive, trend, comprehensive)
    - [ ] 5.4 Verify output format matches expected analysis structure

- [ ] 6.0 Documentation and Deployment
    - [ ] 6.1 Update API documentation with new prompt structure
    - [ ] 6.2 Create migration guide for any breaking changes
    - [ ] 6.3 Update service documentation and examples
    - [ ] 6.4 Deploy and monitor bedrock integration performance

## Implementation Guidelines

### Key Approaches and Patterns

1. **Template Variable Mapping:**
   - `[PRODUCT_NAME]` → `project.products[0].name`
   - `[PRODUCT_INFO]` → structured data from Product model
   - `[PRODUCT_WEBSITE_HTML]` → latest ProductSnapshot.content
   - `[LIST_OF_COMPETITOR_HTML_FILES]` → competitor Snapshot.content array
   - `[LAST_ANALYSIS_DATE]` → project freshnessStatus data

2. **Data Transformation Strategy:**
   - Extract HTML content from snapshot.content JSON structure
   - Format product information according to CompAI template structure
   - Preserve existing data freshness indicators from SmartScheduling
   - Maintain JSON output format requirements for analysis results

3. **Service Integration Pattern:**
   - Preserve existing BedrockService.generateCompletion() interface
   - Maintain correlation ID tracking and error handling
   - Keep performance monitoring and logging intact
   - Ensure thread-safe prompt generation

### Reference Implementation Files

- Current prompt building: `src/services/smartAIService.ts:326-376`
- Bedrock integration: `src/services/bedrock/bedrock.service.ts`
- Analysis templates: `src/services/analysis/analysisPrompts.ts`
- Data models: `prisma/schema.prisma:177-237`

### Code Examples

**Current Prompt Structure (to be replaced):**
```typescript
// From SmartAIService.buildEnhancedPrompt()
return `${basePrompt}

**DATA FRESHNESS CONTEXT:**
${freshDataIndicators}

**PROJECT INFORMATION:**
- Name: ${project.name}
- Description: ${project.description || 'N/A'}
- Industry: ${project.industry || 'Not specified'}
...`;
```

**Target CompAI Structure:**
```typescript
// New CompAI-based prompt structure
return `### **CompAI Prompt**

**Role:**
You are an expert Senior Market Analyst and Competitive Intelligence Strategist...

**Context:**
You will be provided with the following data sources:
1. **Product Information:** ${formatProductInfo(project.products)}
2. **Product Website Data:** ${extractWebsiteContent(productSnapshots)}
3. **Competitor Website Data:** ${extractCompetitorContent(competitorSnapshots)}
4. **Last Analysis Date:** ${getLastAnalysisDate(freshnessStatus)}
...`;
```

## Proposed File Structure

### New/Modified Files:
```
src/
├── services/
│   ├── analysis/
│   │   ├── analysisPrompts.ts (MODIFY - add CompAI templates)
│   │   └── compaiPromptBuilder.ts (NEW - CompAI-specific prompt logic)
│   ├── domains/analysis/
│   │   ├── AIAnalyzer.ts (MODIFY - update buildEnhancedPrompt)
│   │   └── ComparativeAnalyzer.ts (MODIFY - update buildAnalysisPrompt)
│   └── smartAIService.ts (MODIFY - update buildEnhancedPrompt)
├── lib/
│   ├── reports.ts (MODIFY - update buildComparativeAnalysisPrompt)
│   └── prompts/ (NEW - shared prompt utilities)
│       └── compaiFormatter.ts (NEW - data formatting utilities)
└── types/
    └── prompts.ts (NEW - CompAI prompt type definitions)
```

## Edge Cases & Error Handling

### Data Availability Issues:
- **Missing product snapshots:** Fallback to basic product information with warning
- **Stale competitor data:** Include data freshness warnings in prompt
- **Empty snapshot content:** Use fallback content or skip analysis with appropriate error

### Prompt Size Limitations:
- **Large HTML content:** Implement content truncation with priority preservation
- **Multiple competitors:** Limit to top N competitors based on relevance/recency
- **Token limits:** Implement smart content summarization before sending to Bedrock

### Backward Compatibility:
- **Existing analysis types:** Maintain support for 'competitive', 'trend', 'comprehensive'
- **API consumers:** Preserve existing method signatures and response formats
- **Legacy prompt format:** Provide migration path with feature flag support

### Error Recovery:
- **Bedrock service failures:** Implement fallback to basic analysis
- **Prompt generation errors:** Log detailed context and provide meaningful user feedback
- **Data transformation errors:** Graceful degradation with partial data

## Code Review Guidelines

### Focus Areas for Reviewers:

1. **Prompt Template Accuracy:**
   - Verify CompAI template structure matches specification exactly
   - Ensure all placeholder variables are properly mapped to database fields
   - Check that data freshness context is preserved from existing system

2. **Data Transformation Logic:**
   - Review HTML content extraction from snapshot JSON structures
   - Validate product and competitor data formatting
   - Ensure proper handling of missing or malformed data

3. **Service Integration:**
   - Verify BedrockService integration remains unchanged
   - Check that correlation ID tracking is maintained
   - Ensure error handling patterns are consistent

4. **Performance Considerations:**
   - Review prompt generation performance impact
   - Check for potential memory leaks in large content processing
   - Validate efficient database queries for snapshot data

5. **Backward Compatibility:**
   - Ensure existing analysis consumers continue to work
   - Verify API response formats remain consistent
   - Check that configuration options are preserved

## Acceptance Testing Checklist

### Functional Requirements:
- [ ] CompAI prompt template generates correctly formatted prompts
- [ ] All database fields map correctly to prompt variables
- [ ] Product information section includes all required data
- [ ] Competitor data is properly formatted and includes HTML content
- [ ] Data freshness indicators are integrated into prompt structure
- [ ] Analysis output matches expected CompAI report format

### Integration Requirements:
- [ ] BedrockService successfully processes updated prompts
- [ ] Claude AI model returns structured competitive analysis
- [ ] All existing analysis types (competitive, trend, comprehensive) work
- [ ] Error handling gracefully manages missing or invalid data
- [ ] Performance remains within acceptable limits (< 5s prompt generation)

### Quality Requirements:
- [ ] Generated reports follow CompAI template structure exactly
- [ ] Analysis quality improves compared to previous prompt format
- [ ] Data accuracy is maintained throughout transformation process
- [ ] System logging provides adequate debugging information
- [ ] Memory usage stays within expected bounds during processing

### Regression Testing:
- [ ] Existing project analysis functionality works unchanged
- [ ] Report generation API endpoints continue to function
- [ ] Database queries perform efficiently with no degradation
- [ ] Error scenarios are handled consistently with existing behavior

## Notes / Open Questions

### Implementation Considerations:
1. **Content Size Management:** CompAI prompt expects full HTML content - may need intelligent truncation for large websites
2. **Multi-language Support:** Current system may have websites in different languages - consider content preprocessing
3. **Dynamic Competitor Lists:** Number of competitors varies by project - template should handle 1-N competitors gracefully

### Future Enhancements:
1. **Template Customization:** Allow users to customize CompAI template sections based on analysis focus
2. **Industry-Specific Templates:** Create specialized prompt variants for different industries
3. **Historical Analysis Integration:** Include trend analysis from previous snapshots in prompt context

### Monitoring Requirements:
1. **Prompt Performance:** Track generation time and Bedrock response quality
2. **Analysis Quality:** Monitor user feedback on CompAI vs. previous prompt results
3. **Error Rates:** Track failures in prompt generation and Bedrock integration

### Migration Strategy:
1. **Feature Flag:** Implement gradual rollout with ability to revert to previous prompt
2. **A/B Testing:** Compare CompAI prompt results with existing format
3. **User Communication:** Prepare documentation for any changes in analysis output format 