import { AnalysisPromptTemplate, AnalysisFocusArea } from '@/types/analysis';

export const COMPARATIVE_ANALYSIS_SYSTEM_PROMPT = `You are an expert business strategist and competitive intelligence analyst. Your role is to provide comprehensive, actionable insights by comparing a PRODUCT against its COMPETITORS based on website content and business information.

**Analysis Framework:**
1. Be objective and data-driven in your analysis
2. Focus on actionable insights and specific recommendations
3. Identify both strengths and weaknesses clearly
4. Provide quantitative scores where possible (0-100 scale)
5. Ensure all recommendations are practical and implementable

**Output Requirements:**
- Provide structured JSON response matching the specified format
- Include specific examples and evidence from the website content
- Quantify insights with confidence scores
- Prioritize recommendations by impact and feasibility

**Analysis Scope:**
- Feature comparison and capability gaps
- Positioning and messaging effectiveness
- User experience and design quality
- Pricing strategy and value proposition
- Customer targeting and market positioning
- Content strategy and communication approach`;

export const FEATURE_COMPARISON_PROMPT: AnalysisPromptTemplate = {
  system: COMPARATIVE_ANALYSIS_SYSTEM_PROMPT,
  userTemplate: `
**FEATURE COMPARISON ANALYSIS**

Compare the features and capabilities of the PRODUCT against COMPETITORS based on their website content.

**PRODUCT Information:**
- Name: {{productName}}
- Website: {{productWebsite}}
- Positioning: {{productPositioning}}
- Industry: {{productIndustry}}

**PRODUCT Website Content:**
{{productContent}}

**COMPETITORS:**
{{#competitors}}
**{{competitorName}}** ({{competitorWebsite}})
Industry: {{competitorIndustry}}
Content: {{competitorContent}}

{{/competitors}}

**Analysis Requirements:**
1. Extract and list specific features for the PRODUCT and each COMPETITOR
2. Identify unique features that only the PRODUCT has
3. Identify features that competitors have but the PRODUCT lacks
4. Assess innovation level and feature sophistication
5. Provide a feature gap analysis with actionable recommendations

Return analysis in JSON format with the following structure:
{
  "productFeatures": ["feature1", "feature2", ...],
  "competitorFeatures": [
    {
      "competitorId": "comp_id",
      "competitorName": "name",
      "features": ["feature1", "feature2", ...]
    }
  ],
  "uniqueToProduct": ["unique_feature1", ...],
  "uniqueToCompetitors": ["gap1", "gap2", ...],
  "commonFeatures": ["common1", "common2", ...],
  "featureGaps": ["critical_gap1", "nice_to_have_gap2", ...],
  "innovationScore": 85
}`,
  outputFormat: 'JSON',
  maxLength: 4000
};

export const POSITIONING_ANALYSIS_PROMPT: AnalysisPromptTemplate = {
  system: COMPARATIVE_ANALYSIS_SYSTEM_PROMPT,
  userTemplate: `
**POSITIONING & MESSAGING ANALYSIS**

Analyze how the PRODUCT positions itself in the market compared to COMPETITORS.

**PRODUCT Information:**
- Name: {{productName}}
- Positioning: {{productPositioning}}
- Target Problem: {{userProblem}}
- Customer Data: {{customerData}}

**PRODUCT Website Content:**
{{productContent}}

**COMPETITORS:**
{{#competitors}}
**{{competitorName}}**
Content: {{competitorContent}}

{{/competitors}}

**Analysis Requirements:**
1. Extract primary messaging and value propositions
2. Identify target audience and customer segments
3. Analyze differentiation strategies
4. Assess messaging clarity and effectiveness
5. Identify positioning gaps and opportunities

Return analysis in JSON format:
{
  "productPositioning": {
    "primaryMessage": "main message",
    "valueProposition": "core value prop",
    "targetAudience": "target audience",
    "differentiators": ["diff1", "diff2", ...]
  },
  "competitorPositioning": [
    {
      "competitorId": "comp_id",
      "competitorName": "name",
      "primaryMessage": "message",
      "valueProposition": "value prop",
      "targetAudience": "audience",
      "differentiators": ["diff1", ...]
    }
  ],
  "positioningGaps": ["gap1", "gap2", ...],
  "marketOpportunities": ["opportunity1", ...],
  "messagingEffectiveness": 78
}`,
  outputFormat: 'JSON',
  maxLength: 3500
};

export const UX_COMPARISON_PROMPT: AnalysisPromptTemplate = {
  system: COMPARATIVE_ANALYSIS_SYSTEM_PROMPT,
  userTemplate: `
**USER EXPERIENCE COMPARISON**

Analyze the user experience and design quality of the PRODUCT website compared to COMPETITORS.

**PRODUCT Website:**
- Name: {{productName}}
- URL: {{productWebsite}}
- Content: {{productContent}}

**COMPETITORS:**
{{#competitors}}
**{{competitorName}}** ({{competitorWebsite}})
Content: {{competitorContent}}

{{/competitors}}

**Analysis Requirements:**
1. Assess design quality, visual appeal, and modern UI elements
2. Evaluate navigation structure and information architecture
3. Identify key user flows and conversion paths
4. Analyze content organization and readability
5. Assess mobile responsiveness indicators
6. Evaluate call-to-action effectiveness

Return analysis in JSON format:
{
  "productUX": {
    "designQuality": 85,
    "usabilityScore": 78,
    "navigationStructure": "description",
    "keyUserFlows": ["flow1", "flow2", ...],
    "loadTime": null
  },
  "competitorUX": [
    {
      "competitorId": "comp_id",
      "competitorName": "name",
      "designQuality": 82,
      "usabilityScore": 80,
      "navigationStructure": "description",
      "keyUserFlows": ["flow1", ...],
      "loadTime": null
    }
  ],
  "uxStrengths": ["strength1", ...],
  "uxWeaknesses": ["weakness1", ...],
  "uxRecommendations": ["rec1", "rec2", ...]
}`,
  outputFormat: 'JSON',
  maxLength: 3000
};

export const PRICING_ANALYSIS_PROMPT: AnalysisPromptTemplate = {
  system: COMPARATIVE_ANALYSIS_SYSTEM_PROMPT,
  userTemplate: `
**PRICING STRATEGY ANALYSIS**

Analyze pricing information and strategy from the PRODUCT and COMPETITOR websites.

**PRODUCT Website:**
{{productContent}}

**COMPETITORS:**
{{#competitors}}
**{{competitorName}}**
Content: {{competitorContent}}

{{/competitors}}

**Analysis Requirements:**
1. Extract any pricing information mentioned on websites
2. Identify pricing models (subscription, one-time, freemium, etc.)
3. Assess pricing strategy (premium, competitive, value-based)
4. Identify pricing transparency and communication
5. Analyze value-to-price positioning

Return analysis in JSON format:
{
  "productPricing": {
    "strategy": "competitive",
    "pricePoints": ["$99/month", "Enterprise contact"],
    "pricingModel": "subscription with enterprise tier"
  },
  "competitorPricing": [
    {
      "competitorId": "comp_id",
      "competitorName": "name",
      "strategy": "premium",
      "pricePoints": ["$149/month"],
      "pricingModel": "subscription only"
    }
  ],
  "pricePosition": "below_average",
  "pricingOpportunities": ["opportunity1", ...]
}`,
  outputFormat: 'JSON',
  maxLength: 2500
};

export const CUSTOMER_TARGETING_PROMPT: AnalysisPromptTemplate = {
  system: COMPARATIVE_ANALYSIS_SYSTEM_PROMPT,
  userTemplate: `
**CUSTOMER TARGETING ANALYSIS**

Analyze how the PRODUCT and COMPETITORS target their customers based on website content.

**PRODUCT Information:**
- Customer Data: {{customerData}}
- User Problem: {{userProblem}}
- Website Content: {{productContent}}

**COMPETITORS:**
{{#competitors}}
**{{competitorName}}**
Content: {{competitorContent}}

{{/competitors}}

**Analysis Requirements:**
1. Identify primary customer segments and target markets
2. Extract customer types, industries, and company sizes mentioned
3. Analyze use cases and problem statements addressed
4. Assess customer success stories and testimonials
5. Identify market positioning and competitive advantages

Return analysis in JSON format:
{
  "productTargeting": {
    "primarySegments": ["SMBs", "Enterprise", ...],
    "customerTypes": ["type1", "type2", ...],
    "useCases": ["use_case1", ...]
  },
  "competitorTargeting": [
    {
      "competitorId": "comp_id",
      "competitorName": "name",
      "primarySegments": ["Enterprise"],
      "customerTypes": ["type1", ...],
      "useCases": ["use_case1", ...]
    }
  ],
  "targetingOverlap": ["overlap1", ...],
  "untappedSegments": ["segment1", ...],
  "competitiveAdvantage": ["advantage1", ...]
}`,
  outputFormat: 'JSON',
  maxLength: 2800
};

export const COMPREHENSIVE_ANALYSIS_PROMPT: AnalysisPromptTemplate = {
  system: COMPARATIVE_ANALYSIS_SYSTEM_PROMPT,
  userTemplate: `
**COMPREHENSIVE COMPARATIVE ANALYSIS**

Provide a complete competitive analysis comparing the PRODUCT against all COMPETITORS.

**PRODUCT:**
- Name: {{productName}}
- Website: {{productWebsite}}
- Positioning: {{productPositioning}}
- Customer Data: {{customerData}}
- User Problem: {{userProblem}}
- Industry: {{productIndustry}}

**PRODUCT Website Content:**
{{productContent}}

**COMPETITORS:**
{{#competitors}}
**{{competitorName}}** ({{competitorWebsite}})
Industry: {{competitorIndustry}}
{{competitorDescription}}

Website Content: {{competitorContent}}

{{/competitors}}

**Analysis Requirements:**
Provide comprehensive analysis covering:
1. **Executive Summary**: Overall competitive position, key strengths/weaknesses, opportunity score
2. **Feature Analysis**: Feature comparison, gaps, innovation assessment
3. **Positioning Analysis**: Messaging, value props, differentiation
4. **UX Comparison**: Design quality, usability, user flows
5. **Customer Targeting**: Segments, use cases, competitive advantages
6. **Strategic Recommendations**: Immediate, short-term, and long-term actions

Return complete analysis in JSON format matching the ComparativeAnalysis interface:
{
  "summary": {
    "overallPosition": "competitive",
    "keyStrengths": ["strength1", "strength2", ...],
    "keyWeaknesses": ["weakness1", "weakness2", ...],
    "opportunityScore": 75,
    "threatLevel": "medium"
  },
  "detailed": {
    "featureComparison": { /* FeatureComparison object */ },
    "positioningAnalysis": { /* PositioningAnalysis object */ },
    "userExperienceComparison": { /* UserExperienceComparison object */ },
    "pricingStrategy": { /* PricingStrategyAnalysis object */ },
    "customerTargeting": { /* CustomerTargetingAnalysis object */ }
  },
  "recommendations": {
    "immediate": ["action1", "action2", ...],
    "shortTerm": ["action1", "action2", ...],
    "longTerm": ["action1", "action2", ...],
    "priorityScore": 85
  },
  "metadata": {
    "analysisMethod": "ai_powered",
    "confidenceScore": 87,
    "dataQuality": "high"
  }
}`,
  outputFormat: 'JSON',
  maxLength: 8000
};

// Focus area specific prompts
export const FOCUS_AREA_PROMPTS: Record<AnalysisFocusArea, AnalysisPromptTemplate> = {
  features: FEATURE_COMPARISON_PROMPT,
  positioning: POSITIONING_ANALYSIS_PROMPT,
  user_experience: UX_COMPARISON_PROMPT,
  pricing: PRICING_ANALYSIS_PROMPT,
  customer_targeting: CUSTOMER_TARGETING_PROMPT,
  content_strategy: {
    system: COMPARATIVE_ANALYSIS_SYSTEM_PROMPT,
    userTemplate: `Analyze content strategy comparing PRODUCT vs COMPETITORS. Focus on content quality, SEO approach, messaging consistency, and content marketing effectiveness. Product: {{productName}} - {{productContent}}. Competitors: {{#competitors}}{{competitorName}}: {{competitorContent}}{{/competitors}}`,
    outputFormat: 'JSON',
    maxLength: 3000
  },
  technical_stack: {
    system: COMPARATIVE_ANALYSIS_SYSTEM_PROMPT,
    userTemplate: `Analyze technical implementation and performance indicators from website content. Compare technology choices, performance optimization, and technical capabilities. Product: {{productName}} - {{productContent}}. Competitors: {{#competitors}}{{competitorName}}: {{competitorContent}}{{/competitors}}`,
    outputFormat: 'JSON',
    maxLength: 2500
  },
  performance: {
    system: COMPARATIVE_ANALYSIS_SYSTEM_PROMPT,
    userTemplate: `Analyze website performance indicators and optimization from content. Compare loading speeds, technical optimization, and performance-related features. Product: {{productName}} - {{productContent}}. Competitors: {{#competitors}}{{competitorName}}: {{competitorContent}}{{/competitors}}`,
    outputFormat: 'JSON',
    maxLength: 2000
  }
};

// Utility function to select appropriate prompt
export function getAnalysisPrompt(
  focusAreas: AnalysisFocusArea[],
  depth: 'basic' | 'detailed' | 'comprehensive' = 'detailed'
): AnalysisPromptTemplate {
  if (depth === 'comprehensive' || focusAreas.length > 3) {
    return COMPREHENSIVE_ANALYSIS_PROMPT;
  }
  
  if (focusAreas.length === 1) {
    return FOCUS_AREA_PROMPTS[focusAreas[0]];
  }
  
  // For multiple focus areas, use comprehensive prompt
  return COMPREHENSIVE_ANALYSIS_PROMPT;
}

// TP-014: CompAI System Prompt
export const COMPAI_SYSTEM_PROMPT = `You are an expert Senior Market Analyst and Competitive Intelligence Strategist. Your primary function is to analyze market data, identify key competitive differentiators, and provide actionable strategic recommendations. You are methodical, data-driven, and possess a deep understanding of product marketing, user experience, and business strategy. Your analysis must be objective, thorough, and based strictly on the provided data.

**Analysis Framework:**
1. Focus on competitive differentiation and market positioning
2. Provide structured, comprehensive analysis with clear sections
3. Include specific evidence and examples from provided data
4. Generate actionable strategic recommendations for product roadmap
5. Maintain objectivity and data-driven approach throughout

**Output Requirements:**
- Generate detailed report in Markdown format
- Use structured sections with clear headers and subheaders
- Include tables for direct comparisons where appropriate
- Bold key findings and recommendations for emphasis
- Provide specific, implementable recommendations with justifications

**Competitive Intelligence Scope:**
- Website customer experience and user journey analysis
- Key claims, messaging, and value proposition comparison
- Pricing strategy and offers analysis
- Feature differences and capability gaps assessment
- Customer pain point addressing evaluation
- Market opportunities and threats identification`;

// TP-014: CompAI Prompt Template for Integration
export const COMPAI_PROMPT_TEMPLATE: AnalysisPromptTemplate = {
  system: COMPAI_SYSTEM_PROMPT,
  userTemplate: `### **CompAI Prompt**

**Role:**
You are an expert Senior Market Analyst and Competitive Intelligence Strategist. Your primary function is to analyze market data, identify key competitive differentiators, and provide actionable strategic recommendations. You are methodical, data-driven, and possess a deep understanding of product marketing, user experience, and business strategy. Your analysis must be objective, thorough, and based strictly on the provided data.

**Ask:**
Generate a comprehensive competitive analysis report comparing our product, **{{productName}}**, against its key competitors. Your analysis must synthesize the provided product information and scraped website data to identify critical differences, gaps, and opportunities. The ultimate goal is to produce actionable insights that will inform our product's strategic roadmap for the upcoming quarter.

**Context:**
You will be provided with the following data sources:

1. **Product Information:** 
{{productInfo}}

2. **Product Website Data:** 
{{productWebsiteHTML}}

3. **Competitor Website Data:** 
{{competitorHTMLFiles}}

4. **Last Analysis Date:** {{lastAnalysisDate}}

Your analysis must be confined to the information present within these provided files. Do not use external knowledge or perform live web searches.

**Output Guidance & Template:**
Generate a detailed report in Markdown format. The report must be structured, well-organized, and closely follow the template below. Use tables, bolding, and headers to enhance readability.

# Competitive Landscape Analysis: {{productName}} vs. Key Competitors

## I. Executive Summary
*(Provide a concise, high-level overview of the most critical findings. Summarize the key competitive advantages and disadvantages for **{{productName}}**. Briefly mention the most significant strategic opportunities identified in your analysis.)*

## II. Introduction
*(State the purpose of the report: to analyze **{{productName}}** against its rivals to inform the next product roadmap. Briefly describe the market/industry based on the provided context.)*

## III. Competitor Profiles
*(Create a detailed profile for **{{productName}}** and each competitor. Extract and synthesize information from the provided HTML to fill out these sections.)*

### A. {{productName}}
   - **Product Offerings:** *(Describe the core products/services, variety, and any unique items.)*
   - **Business/Subscription Model:** *(Detail the plans, pricing tiers, and flexibility.)*
   - **Key Claims & Positioning:** *(What are the main messages about quality, sourcing, or value?)*

### B. [COMPETITOR_1_NAME]
   - **Product Offerings:** *(Describe their core products/services, variety, and any unique items.)*
   - **Business/Subscription Model:** *(Detail their plans, pricing tiers, and flexibility.)*
   - **Key Claims & Positioning:** *(What are their main messages about quality, sourcing, or value?)*

### C. [COMPETITOR_2_NAME]
   - *(Repeat the structure above for each competitor.)*

## IV. Comparative Analysis
*(This is the core analytical section. Address each of the following points in detail, using comparative language and creating Markdown tables for direct, side-by-side comparisons where appropriate.)*

### A. Website Customer Experience (CX)
*(Analyze and compare the user journey on each website. Consider navigation clarity, ease of finding information, calls-to-action (CTAs), overall aesthetic, and mobile responsiveness. What are the key differences?)*

### B. Key Claims & Communication
*(Compare the primary marketing messages, value propositions, and unique selling points (USPs) communicated on each site. Use a table to compare claims related to quality, trust signals (e.g., certifications, testimonials), and brand narrative.)*

### C. Offers & Promotions
*(Detail and compare the customer offers, such as new subscriber discounts, free trials, long-term value promises ("free for life"), or referral programs. What are the different acquisition tactics?)*

### D. Pricing & Value Proposition
*(Create a detailed pricing comparison table. Include base prices, shipping costs, cost per unit/serving (if available), and any other fees. Analyze the overall perceived value each brand is trying to convey.)*

### E. Feature Differences & Gaps
*(Identify specific feature differences between **{{productName}}** and its competitors. This could relate to account management, product customization, delivery options, or unique site functionalities. Where does **{{productName}}** have gaps, and where does it excel?)*

### F. Addressing Customer Pain Points
*(Based on the Product Information provided, analyze how effectively each website's messaging and offerings address the defined customer problems and needs. Does one competitor solve a specific pain point more directly or convincingly than others?)*

## V. SWOT Analysis for {{productName}}
*(Based on your comparative analysis, generate a SWOT (Strengths, Weaknesses, Opportunities, Threats) analysis for **{{productName}}**.)*
   - **Strengths:** *(Internal factors that give it an advantage.)*
   - **Weaknesses:** *(Internal factors that are disadvantages.)*
   - **Opportunities:** *(External factors it can leverage for growth.)*
   - **Threats:** *(External factors that could harm the business, such as competitor actions.)*

## VI. Changes Since Last Analysis ({{lastAnalysisDate}})
*(Scrutinize the current website data against your understanding of its state as of the last analysis date. Detail any significant changes observed on the product or competitor websites. This could include new features, pricing changes, new promotional offers, or shifts in marketing messages.)*

## VII. Strategic Recommendations for Future Roadmap
*(This is the most critical section. Synthesize all your findings into a set of clear, actionable recommendations for **{{productName}}**. Frame these as potential roadmap items. For each recommendation, provide a brief justification based on your analysis.)*
   - **Recommendation 1:** *(e.g., "Eliminate Shipping Fees by Integrating Cost into Product Price.")*
      - **Justification:** *(e.g., "Both major competitors offer free shipping. Our $9.99 fee creates a pricing disadvantage and friction at checkout, impacting conversion rates.")*
   - **Recommendation 2:** *(e.g., "Pursue Third-Party 'X' Certification.")*
      - **Justification:** *(e.g., "Competitor Y prominently features its certification, building significant trust. Lacking this, our claims appear less credible to values-driven consumers.")*
   - *(Provide 3-5 key recommendations.)*

## VIII. Conclusion
*(Provide a final summary of the competitive landscape and reiterate the importance of the key strategic recommendations for **{{productName}}**'s continued growth and success.)*

#### Works Cited
*(List the website URLs of the product and all competitors analyzed as sources.)*`,
  outputFormat: 'MARKDOWN',
  maxLength: 8000
};

// TP-014: Utility function to get CompAI prompt
export function getCompAIPrompt(): AnalysisPromptTemplate {
  return COMPAI_PROMPT_TEMPLATE;
} 