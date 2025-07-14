import { ChatState, ChatResponse } from '@/types/chat';

export interface ProductDataCollector {
  collectProductData(content: string, chatState: ChatState): Promise<ChatResponse>;
  validateProductData(chatState: ChatState): boolean;
  getNextProductStep(chatState: ChatState): number | null;
}

export class EnhancedProductChatProcessor implements ProductDataCollector {
  
  /**
   * Enhanced product data collection flow
   * Step 1: Product name → Product URL
   * Step 2: Product URL → Positioning  
   * Step 3: Positioning → Customer data
   * Step 4: Customer data → User problem
   * Step 5: User problem → Industry
   */
  public async collectProductData(content: string, chatState: ChatState): Promise<ChatResponse> {
    // *** COMPREHENSIVE NULL GUARDS: Safe chatState initialization ***
    if (!chatState.collectedData) {
      chatState.collectedData = {};
    }

    const collectedData = chatState.collectedData;
    
    // *** NULL SAFETY: Determine which step we're in based on what data is already collected ***
    if (!collectedData.productName) {
      return this.handleProductNameCollection(content, chatState);
    } else if (!collectedData.productUrl) {
      return this.handleProductUrlCollection(content, chatState);
    } else if (!collectedData.positioning) {
      return this.handlePositioningCollection(content, chatState);
    } else if (!collectedData.customerData) {
      return this.handleCustomerDataCollection(content, chatState);
    } else if (!collectedData.userProblem) {
      return this.handleUserProblemCollection(content, chatState);
    } else if (!collectedData.industry) {
      return this.handleIndustryCollection(content, chatState);
    }

    // All product data collected
    return this.handleProductDataComplete(chatState);
  }

  private handleProductNameCollection(content: string, chatState: ChatState): ChatResponse {
    // Parse and validate product name
    const productName = this.parseProductName(content);
    
    if (!productName) {
      return {
        message: 'Please provide a valid product name for the competitive analysis.',
        expectedInputType: 'text',
      };
    }

    chatState.collectedData!.productName = productName;

    return {
      message: `Great! Now I need the URL of **${productName}**'s website so I can analyze it against competitors.
      
Please provide the full URL (e.g., https://example.com):`,
      expectedInputType: 'url',
      stepDescription: 'Product URL Collection',
    };
  }

  private handleProductUrlCollection(content: string, chatState: ChatState): ChatResponse {
    // Parse and validate URL
    const productUrl = this.parseAndValidateUrl(content);
    
    if (!productUrl) {
      return {
        message: 'Please provide a valid URL for your product website (e.g., https://example.com). This is required for web scraping and comparison analysis.',
        expectedInputType: 'url',
      };
    }

    chatState.collectedData!.productUrl = productUrl;

    return {
      message: `Perfect! I'll analyze **${chatState.collectedData!.productName}** at ${productUrl}.

Now, what is the positioning of your product? Please share:
- Key value propositions
- Target market positioning
- Any financial, experience, or trend data relevant for the analysis`,
      expectedInputType: 'text',
      stepDescription: 'Product Positioning',
    };
  }

  private handlePositioningCollection(content: string, chatState: ChatState): ChatResponse {
    chatState.collectedData!.positioning = content.trim();

    return {
      message: `Excellent positioning information! 

Next, I need to understand your customers better. Please provide details about:
- Customer demographics and behavior
- How many customers you have
- How you classify different customer segments
- Any specific customer data that would help with competitive analysis`,
      expectedInputType: 'text',
      stepDescription: 'Customer Data Collection',
    };
  }

  private handleCustomerDataCollection(content: string, chatState: ChatState): ChatResponse {
    chatState.collectedData!.customerData = content.trim();

    return {
      message: `Great customer insights! 

Now, what are the core user problems that **${chatState.collectedData!.productName}** addresses? Please describe:
- Main pain points your product solves
- User needs and challenges
- Problems your customers face without your solution`,
      expectedInputType: 'text',
      stepDescription: 'User Problem Collection',
    };
  }

  private handleUserProblemCollection(content: string, chatState: ChatState): ChatResponse {
    chatState.collectedData!.userProblem = content.trim();

    return {
      message: `Perfect! Last question - what industry does **${chatState.collectedData!.productName}** operate in?

Please be detailed and specific about:
- Primary industry sector
- Market category
- Relevant sub-industries or niches`,
      expectedInputType: 'text',
      stepDescription: 'Industry Classification',
    };
  }

  private handleIndustryCollection(content: string, chatState: ChatState): ChatResponse {
    chatState.collectedData!.industry = content.trim();

    return this.handleProductDataComplete(chatState);
  }

  private handleProductDataComplete(chatState: ChatState): ChatResponse {
    const productData = chatState.collectedData!;

    return {
      message: `🎯 **Product Information Complete!**

I've collected all the necessary information about **${productData.productName}**:

✅ **Product:** ${productData.productName}
✅ **Website:** ${productData.productUrl}
✅ **Industry:** ${productData.industry}
✅ **Positioning:** ${productData.positioning?.substring(0, 100)}...
✅ **Customer Data:** ${productData.customerData?.substring(0, 100)}...
✅ **User Problems:** ${productData.userProblem?.substring(0, 100)}...

I'm now ready to create the PRODUCT entity and begin the comparative analysis. The system will:

1. Create your PRODUCT in the database
2. Scrape your product website (${productData.productUrl})
3. Scrape competitor websites
4. Perform AI-powered comparative analysis
5. Generate your PRODUCT vs COMPETITOR report

Shall I proceed with creating the PRODUCT entity and starting the analysis?`,
      expectedInputType: 'text',
      stepDescription: 'Product Creation Ready',
      nextStep: chatState.currentStep ? chatState.currentStep + 1 : 3,
    };
  }

  public validateProductData(chatState: ChatState): boolean {
    // *** COMPREHENSIVE NULL GUARDS: Safe data validation ***
    const data = chatState?.collectedData;
    if (!data || typeof data !== 'object') {
      return false;
    }

    // Safe property validation with type checking
    return !!(
      (typeof data.productName === 'string' && data.productName.trim()) &&
      (typeof data.productUrl === 'string' && data.productUrl.trim()) &&
      (typeof data.positioning === 'string' && data.positioning.trim()) &&
      (typeof data.customerData === 'string' && data.customerData.trim()) &&
      (typeof data.userProblem === 'string' && data.userProblem.trim()) &&
      (typeof data.industry === 'string' && data.industry.trim())
    );
  }

  public getNextProductStep(chatState: ChatState): number | null {
    const data = chatState.collectedData;
    if (!data) return 1;

    if (!data.productName) return 1;
    if (!data.productUrl) return 2;
    if (!data.positioning) return 3;
    if (!data.customerData) return 4;
    if (!data.userProblem) return 5;
    if (!data.industry) return 6;
    
    return null; // All steps complete
  }

  private parseProductName(content: string): string | null {
    const trimmed = content.trim();
    
    // Basic validation - product name should be reasonable length
    if (trimmed.length < 1 || trimmed.length > 200) {
      return null;
    }

    // Remove any quotes or extra formatting
    return trimmed.replace(/^["']|["']$/g, '');
  }

  private parseAndValidateUrl(content: string): string | null {
    const trimmed = content.trim();
    
    // Pre-validation - reject obviously invalid inputs
    if (!trimmed || trimmed.length < 3) {
      return null;
    }

    // Reject inputs that contain invalid characters for URLs before parsing
    const invalidChars = /[<>"{}`\s]/;
    if (invalidChars.test(trimmed)) {
      return null;
    }
    
    try {
      // Handle cases where user provides URL without protocol
      let urlToValidate = trimmed;
      
      // Special handling for FTP and other non-HTTP protocols - reject them
      if (urlToValidate.startsWith('ftp://') || urlToValidate.startsWith('file://') || 
          urlToValidate.startsWith('mailto:') || urlToValidate.startsWith('tel:')) {
        return null;
      }
      
      if (!urlToValidate.startsWith('http://') && !urlToValidate.startsWith('https://')) {
        urlToValidate = 'https://' + urlToValidate;
      }

      const url = new URL(urlToValidate);
      
      // Basic validation - must have valid hostname
      if (!url.hostname || url.hostname.length < 3) {
        return null;
      }

      // Ensure protocol is https or http
      if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        return null;
      }

      // Additional validation - hostname should contain at least one dot for real domains
      // Exception for localhost and similar development URLs
      if (!url.hostname.includes('.') && !url.hostname.startsWith('localhost') && !url.hostname.includes(':')) {
        return null;
      }

      // Reject single-word hostnames that aren't localhost variants
      const singleWordPattern = /^[a-zA-Z0-9-]+$/;
      if (singleWordPattern.test(url.hostname) && !url.hostname.startsWith('localhost')) {
        return null;
      }

      return url.toString();
    } catch (error) {
      return null;
    }
  }
}

export const productChatProcessor = new EnhancedProductChatProcessor(); 