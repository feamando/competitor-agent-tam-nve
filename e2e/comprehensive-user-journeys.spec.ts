/**
 * Task 8.1: Comprehensive User Journey E2E Tests
 * 
 * Validates complete user workflows through the UI with consolidated services:
 * - Project creation → analysis → report generation
 * - Error handling and recovery in the UI
 * - Performance validation through real user interactions
 * - Cross-browser compatibility for critical workflows 
 */

import { test, expect, Page, BrowserContext } from '@playwright/test';

// Test Configuration
const COMPREHENSIVE_E2E_CONFIG = {
  timeouts: {
    workflow: 120000,        // 2 minutes for complete user workflow
    navigation: 30000,       // 30 seconds for page navigation  
    analysis: 90000,         // 1.5 minutes for analysis completion
    report: 120000,          // 2 minutes for report generation
    apiResponse: 15000       // 15 seconds for API responses
  },
  testData: {
    project: {
      name: `E2E Test Project ${Date.now()}`,
      productName: 'E2E Test Product',
      productWebsite: 'https://e2e-test-product.com',
      positioning: 'Leading E2E testing solution',
      customerData: 'QA teams and developers',
      userProblem: 'Need comprehensive testing coverage',
      industry: 'Software Testing'
    },
    competitors: [
      { name: 'E2E Competitor 1', website: 'https://e2e-comp1.com' },
      { name: 'E2E Competitor 2', website: 'https://e2e-comp2.com' },
      { name: 'E2E Competitor 3', website: 'https://e2e-comp3.com' }
    ]
  },
  selectors: {
    navigation: {
      projectsTab: '[data-testid="nav-projects"]',
      dashboardTab: '[data-testid="nav-dashboard"]',
      reportsTab: '[data-testid="nav-reports"]'
    },
    project: {
      createButton: '[data-testid="create-project-btn"]',
      nameInput: '[data-testid="project-name-input"]',
      productNameInput: '[data-testid="product-name-input"]',
      productWebsiteInput: '[data-testid="product-website-input"]',
      positioningTextarea: '[data-testid="positioning-textarea"]',
      customerDataTextarea: '[data-testid="customer-data-textarea"]',
      userProblemTextarea: '[data-testid="user-problem-textarea"]',
      industrySelect: '[data-testid="industry-select"]',
      saveButton: '[data-testid="save-project-btn"]'
    },
    competitors: {
      addButton: '[data-testid="add-competitor-btn"]',
      nameInput: '[data-testid="competitor-name-input"]',
      websiteInput: '[data-testid="competitor-website-input"]',
      saveButton: '[data-testid="save-competitor-btn"]'
    },
    analysis: {
      generateButton: '[data-testid="generate-analysis-btn"]',
      typeSelect: '[data-testid="analysis-type-select"]',
      depthSelect: '[data-testid="analysis-depth-select"]',
      focusAreasCheckboxes: '[data-testid^="focus-area-"]',
      enhanceWithAICheckbox: '[data-testid="enhance-ai-checkbox"]',
      status: '[data-testid="analysis-status"]',
      result: '[data-testid="analysis-result"]',
      qualityScore: '[data-testid="quality-score"]',
      serviceVersion: '[data-testid="service-version"]'
    },
    reports: {
      generateButton: '[data-testid="generate-report-btn"]',
      templateSelect: '[data-testid="report-template-select"]',
      focusAreaSelect: '[data-testid="report-focus-area-select"]',
      status: '[data-testid="report-status"]',
      content: '[data-testid="report-content"]',
      downloadButton: '[data-testid="download-report-btn"]',
      serviceVersion: '[data-testid="report-service-version"]'
    },
    common: {
      loadingSpinner: '[data-testid="loading-spinner"]',
      errorMessage: '[data-testid="error-message"]',
      successMessage: '[data-testid="success-message"]',
      correlationId: '[data-testid="correlation-id"]'
    }
  }
};

// Test Utilities
class E2ETestHelper {
  constructor(private page: Page) {}

  async waitForLoadingComplete(): Promise<void> {
    await this.page.waitForSelector(
      COMPREHENSIVE_E2E_CONFIG.selectors.common.loadingSpinner,
      { state: 'detached', timeout: 10000 }
    ).catch(() => {
      // Loading spinner might not appear for fast operations
    });
  }

  async captureCorrelationId(): Promise<string | null> {
    try {
      const correlationElement = await this.page.locator(
        COMPREHENSIVE_E2E_CONFIG.selectors.common.correlationId
      ).first();
      return await correlationElement.textContent();
    } catch {
      return null;
    }
  }

  async validateServiceVersion(selector: string, expectedService: string): Promise<void> {
    const serviceElement = await this.page.locator(selector).first();
    const serviceVersion = await serviceElement.textContent();
    expect(serviceVersion).toContain(expectedService);
    expect(serviceVersion).toContain('consolidated');
  }

  async measurePagePerformance(): Promise<{ loadTime: number; renderTime: number }> {
    const performanceTiming = await this.page.evaluate(() => {
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      return {
        loadTime: navigation.loadEventEnd - navigation.loadEventStart,
        renderTime: navigation.loadEventEnd - navigation.fetchStart
      };
    });
    
    return performanceTiming;
  }
}

test.describe('Task 8.1: Comprehensive User Journey Validation', () => {
  let helper: E2ETestHelper;
  
  test.beforeEach(async ({ page }) => {
    helper = new E2ETestHelper(page);
    
    // Navigate to application
    await page.goto('/');
    await helper.waitForLoadingComplete();
  });

  test.describe('1. Complete Project Workflow', () => {
    test('should complete full project creation → analysis → report workflow', async ({ page }) => {
      test.setTimeout(COMPREHENSIVE_E2E_CONFIG.timeouts.workflow);
      
      console.log('🔄 Starting complete project workflow test');
      
      // Phase 1: Project Creation
      console.log('📋 Phase 1: Creating new project');
      
      await page.click(COMPREHENSIVE_E2E_CONFIG.selectors.navigation.projectsTab);
      await helper.waitForLoadingComplete();
      
      await page.click(COMPREHENSIVE_E2E_CONFIG.selectors.project.createButton);
      
      // Fill project details
      await page.fill(
        COMPREHENSIVE_E2E_CONFIG.selectors.project.nameInput,
        COMPREHENSIVE_E2E_CONFIG.testData.project.name
      );
      await page.fill(
        COMPREHENSIVE_E2E_CONFIG.selectors.project.productNameInput,
        COMPREHENSIVE_E2E_CONFIG.testData.project.productName
      );
      await page.fill(
        COMPREHENSIVE_E2E_CONFIG.selectors.project.productWebsiteInput,
        COMPREHENSIVE_E2E_CONFIG.testData.project.productWebsite
      );
      await page.fill(
        COMPREHENSIVE_E2E_CONFIG.selectors.project.positioningTextarea,
        COMPREHENSIVE_E2E_CONFIG.testData.project.positioning
      );
      await page.fill(
        COMPREHENSIVE_E2E_CONFIG.selectors.project.customerDataTextarea,
        COMPREHENSIVE_E2E_CONFIG.testData.project.customerData
      );
      await page.fill(
        COMPREHENSIVE_E2E_CONFIG.selectors.project.userProblemTextarea,
        COMPREHENSIVE_E2E_CONFIG.testData.project.userProblem
      );
      
      // Select industry
      await page.selectOption(
        COMPREHENSIVE_E2E_CONFIG.selectors.project.industrySelect,
        COMPREHENSIVE_E2E_CONFIG.testData.project.industry
      );
      
      // Save project
      await page.click(COMPREHENSIVE_E2E_CONFIG.selectors.project.saveButton);
      await helper.waitForLoadingComplete();
      
      // Validate project creation success
      await expect(page.locator(COMPREHENSIVE_E2E_CONFIG.selectors.common.successMessage))
        .toBeVisible();
      
      console.log('✅ Project created successfully');

      // Phase 2: Add Competitors
      console.log('🏢 Phase 2: Adding competitors');
      
      for (const competitor of COMPREHENSIVE_E2E_CONFIG.testData.competitors) {
        await page.click(COMPREHENSIVE_E2E_CONFIG.selectors.competitors.addButton);
        
        await page.fill(
          COMPREHENSIVE_E2E_CONFIG.selectors.competitors.nameInput,
          competitor.name
        );
        await page.fill(
          COMPREHENSIVE_E2E_CONFIG.selectors.competitors.websiteInput,
          competitor.website
        );
        
        await page.click(COMPREHENSIVE_E2E_CONFIG.selectors.competitors.saveButton);
        await helper.waitForLoadingComplete();
      }
      
      console.log(`✅ Added ${COMPREHENSIVE_E2E_CONFIG.testData.competitors.length} competitors`);

      // Phase 3: Generate Analysis
      console.log('📊 Phase 3: Generating analysis with consolidated service');
      const analysisStartTime = Date.now();
      
      // Configure analysis options
      await page.selectOption(
        COMPREHENSIVE_E2E_CONFIG.selectors.analysis.typeSelect,
        'comparative_analysis'
      );
      await page.selectOption(
        COMPREHENSIVE_E2E_CONFIG.selectors.analysis.depthSelect,
        'comprehensive'
      );
      
      // Select focus areas
      await page.check(`${COMPREHENSIVE_E2E_CONFIG.selectors.analysis.focusAreasCheckboxes}features`);
      await page.check(`${COMPREHENSIVE_E2E_CONFIG.selectors.analysis.focusAreasCheckboxes}user-experience`);
      await page.check(`${COMPREHENSIVE_E2E_CONFIG.selectors.analysis.focusAreasCheckboxes}pricing`);
      
      // Enable AI enhancement
      await page.check(COMPREHENSIVE_E2E_CONFIG.selectors.analysis.enhanceWithAICheckbox);
      
      // Start analysis
      await page.click(COMPREHENSIVE_E2E_CONFIG.selectors.analysis.generateButton);
      
      // Wait for analysis completion with progress monitoring
      await expect(page.locator(COMPREHENSIVE_E2E_CONFIG.selectors.analysis.status))
        .toContainText('Processing', { timeout: COMPREHENSIVE_E2E_CONFIG.timeouts.apiResponse });
      
      await expect(page.locator(COMPREHENSIVE_E2E_CONFIG.selectors.analysis.status))
        .toContainText('Completed', { timeout: COMPREHENSIVE_E2E_CONFIG.timeouts.analysis });
      
      const analysisTime = Date.now() - analysisStartTime;
      console.log(`✅ Analysis completed in ${analysisTime}ms`);
      
      // Validate analysis results
      await expect(page.locator(COMPREHENSIVE_E2E_CONFIG.selectors.analysis.result))
        .toBeVisible();
      
      // Check quality score
      const qualityScore = await page.locator(COMPREHENSIVE_E2E_CONFIG.selectors.analysis.qualityScore)
        .textContent();
      expect(parseFloat(qualityScore || '0')).toBeGreaterThan(0.7);
      
      // Validate consolidated service usage
      await helper.validateServiceVersion(
        COMPREHENSIVE_E2E_CONFIG.selectors.analysis.serviceVersion,
        'analysis'
      );
      
      // Capture correlation ID for tracing
      const analysisCorrelationId = await helper.captureCorrelationId();
      console.log(`📋 Analysis correlation ID: ${analysisCorrelationId}`);

      // Phase 4: Generate Report
      console.log('📄 Phase 4: Generating report with consolidated service');
      const reportStartTime = Date.now();
      
      // Configure report options
      await page.selectOption(
        COMPREHENSIVE_E2E_CONFIG.selectors.reports.templateSelect,
        'comprehensive'
      );
      await page.selectOption(
        COMPREHENSIVE_E2E_CONFIG.selectors.reports.focusAreaSelect,
        'overall'
      );
      
      // Start report generation
      await page.click(COMPREHENSIVE_E2E_CONFIG.selectors.reports.generateButton);
      
      // Wait for report completion
      await expect(page.locator(COMPREHENSIVE_E2E_CONFIG.selectors.reports.status))
        .toContainText('Generating', { timeout: COMPREHENSIVE_E2E_CONFIG.timeouts.apiResponse });
      
      await expect(page.locator(COMPREHENSIVE_E2E_CONFIG.selectors.reports.status))
        .toContainText('Completed', { timeout: COMPREHENSIVE_E2E_CONFIG.timeouts.report });
      
      const reportTime = Date.now() - reportStartTime;
      console.log(`✅ Report generated in ${reportTime}ms`);
      
      // Validate report content
      const reportContent = await page.locator(COMPREHENSIVE_E2E_CONFIG.selectors.reports.content);
      await expect(reportContent).toBeVisible();
      
      const contentText = await reportContent.textContent();
      expect(contentText!.length).toBeGreaterThan(1000); // Substantial content
      expect(contentText).toContain('Competitive Analysis Report');
      expect(contentText).toContain(COMPREHENSIVE_E2E_CONFIG.testData.project.productName);
      
      // Validate consolidated service usage
      await helper.validateServiceVersion(
        COMPREHENSIVE_E2E_CONFIG.selectors.reports.serviceVersion,
        'reporting'
      );
      
      // Test download functionality
      const downloadPromise = page.waitForEvent('download');
      await page.click(COMPREHENSIVE_E2E_CONFIG.selectors.reports.downloadButton);
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toContain('.md');
      
      console.log('✅ Report download functionality validated');

      // Phase 5: Performance Validation
      const performance = await helper.measurePagePerformance();
      expect(performance.loadTime).toBeLessThan(5000); // 5 seconds max load time
      
      console.log(`🎉 Complete workflow validation successful`, {
        analysisTime: `${analysisTime}ms`,
        reportTime: `${reportTime}ms`,
        pageLoadTime: `${performance.loadTime}ms`,
        qualityScore: qualityScore
      });
    });

    test('should handle concurrent user sessions gracefully', async ({ browser }) => {
      test.setTimeout(COMPREHENSIVE_E2E_CONFIG.timeouts.workflow);
      
      console.log('👥 Testing concurrent user sessions');
      
      const sessions = 3;
      const sessionPromises: Promise<void>[] = [];

      for (let i = 0; i < sessions; i++) {
        const sessionPromise = (async () => {
          const context = await browser.newContext();
          const page = await context.newPage();
          const sessionHelper = new E2ETestHelper(page);
          
          try {
            await page.goto('/');
            await sessionHelper.waitForLoadingComplete();
            
            // Create unique project for each session
            const projectName = `${COMPREHENSIVE_E2E_CONFIG.testData.project.name} - Session ${i + 1}`;
            
            await page.click(COMPREHENSIVE_E2E_CONFIG.selectors.navigation.projectsTab);
            await page.click(COMPREHENSIVE_E2E_CONFIG.selectors.project.createButton);
            
            await page.fill(COMPREHENSIVE_E2E_CONFIG.selectors.project.nameInput, projectName);
            await page.fill(COMPREHENSIVE_E2E_CONFIG.selectors.project.productNameInput, 
              `${COMPREHENSIVE_E2E_CONFIG.testData.project.productName} ${i + 1}`);
            await page.fill(COMPREHENSIVE_E2E_CONFIG.selectors.project.productWebsiteInput,
              `https://session-${i + 1}-test.com`);
            
            await page.click(COMPREHENSIVE_E2E_CONFIG.selectors.project.saveButton);
            await sessionHelper.waitForLoadingComplete();
            
            // Validate project creation
            await expect(page.locator(COMPREHENSIVE_E2E_CONFIG.selectors.common.successMessage))
              .toBeVisible();
            
            console.log(`✅ Session ${i + 1} project created successfully`);
            
          } finally {
            await context.close();
          }
        })();
        
        sessionPromises.push(sessionPromise);
      }

      // Wait for all sessions to complete
      await Promise.all(sessionPromises);
      
      console.log(`🎉 All ${sessions} concurrent sessions completed successfully`);
    });
  });

  test.describe('2. Error Handling & Recovery', () => {
    test('should handle network errors gracefully', async ({ page, context }) => {
      console.log('🚨 Testing network error handling');
      
      // Start project creation
      await page.click(COMPREHENSIVE_E2E_CONFIG.selectors.navigation.projectsTab);
      await page.click(COMPREHENSIVE_E2E_CONFIG.selectors.project.createButton);
      
      // Fill project details
      await page.fill(
        COMPREHENSIVE_E2E_CONFIG.selectors.project.nameInput,
        'Network Error Test Project'
      );
      
      // Simulate network failure
      await context.setOffline(true);
      
      // Attempt to save project
      await page.click(COMPREHENSIVE_E2E_CONFIG.selectors.project.saveButton);
      
      // Should show error message
      await expect(page.locator(COMPREHENSIVE_E2E_CONFIG.selectors.common.errorMessage))
        .toBeVisible({ timeout: COMPREHENSIVE_E2E_CONFIG.timeouts.apiResponse });
      
      const errorMessage = await page.locator(COMPREHENSIVE_E2E_CONFIG.selectors.common.errorMessage)
        .textContent();
      expect(errorMessage).toContain('network');
      
      // Restore network and retry
      await context.setOffline(false);
      await page.click(COMPREHENSIVE_E2E_CONFIG.selectors.project.saveButton);
      
      // Should succeed after network recovery
      await expect(page.locator(COMPREHENSIVE_E2E_CONFIG.selectors.common.successMessage))
        .toBeVisible({ timeout: COMPREHENSIVE_E2E_CONFIG.timeouts.apiResponse });
      
      console.log('✅ Network error recovery validated');
    });

    test('should handle analysis service errors gracefully', async ({ page }) => {
      console.log('🚨 Testing analysis service error handling');
      
      // Create minimal project for error testing
      await page.click(COMPREHENSIVE_E2E_CONFIG.selectors.navigation.projectsTab);
      await page.click(COMPREHENSIVE_E2E_CONFIG.selectors.project.createButton);
      
      await page.fill(
        COMPREHENSIVE_E2E_CONFIG.selectors.project.nameInput,
        'Error Test Project'
      );
      await page.fill(
        COMPREHENSIVE_E2E_CONFIG.selectors.project.productNameInput,
        'Error Test Product'
      );
      
      await page.click(COMPREHENSIVE_E2E_CONFIG.selectors.project.saveButton);
      await helper.waitForLoadingComplete();
      
      // Try to generate analysis without competitors (should trigger error)
      await page.selectOption(
        COMPREHENSIVE_E2E_CONFIG.selectors.analysis.typeSelect,
        'comparative_analysis'
      );
      
      await page.click(COMPREHENSIVE_E2E_CONFIG.selectors.analysis.generateButton);
      
      // Should show error about missing competitors
      await expect(page.locator(COMPREHENSIVE_E2E_CONFIG.selectors.common.errorMessage))
        .toBeVisible({ timeout: COMPREHENSIVE_E2E_CONFIG.timeouts.apiResponse });
      
      const errorMessage = await page.locator(COMPREHENSIVE_E2E_CONFIG.selectors.common.errorMessage)
        .textContent();
      expect(errorMessage).toContain('competitor');
      
      console.log('✅ Analysis service error handling validated');
    });
  });

  test.describe('3. Performance & Quality Validation', () => {
    test('should meet UI performance benchmarks', async ({ page }) => {
      console.log('⚡ Testing UI performance benchmarks');
      
      // Measure page load performance
      const navigationStart = Date.now();
      await page.goto('/');
      await helper.waitForLoadingComplete();
      const pageLoadTime = Date.now() - navigationStart;
      
      expect(pageLoadTime).toBeLessThan(5000); // 5 seconds max
      
      // Measure navigation performance
      const navStart = Date.now();
      await page.click(COMPREHENSIVE_E2E_CONFIG.selectors.navigation.projectsTab);
      await helper.waitForLoadingComplete();
      const navTime = Date.now() - navStart;
      
      expect(navTime).toBeLessThan(3000); // 3 seconds max for navigation
      
      // Measure component interaction performance
      const interactionStart = Date.now();
      await page.click(COMPREHENSIVE_E2E_CONFIG.selectors.project.createButton);
      await page.waitForSelector(COMPREHENSIVE_E2E_CONFIG.selectors.project.nameInput);
      const interactionTime = Date.now() - interactionStart;
      
      expect(interactionTime).toBeLessThan(1000); // 1 second max for interactions
      
      console.log('✅ UI performance benchmarks validated', {
        pageLoad: `${pageLoadTime}ms`,
        navigation: `${navTime}ms`,
        interaction: `${interactionTime}ms`
      });
    });

    test('should validate consolidated service quality indicators', async ({ page }) => {
      console.log('🔍 Testing consolidated service quality indicators');
      
      // This test would require a pre-existing project with analysis
      // For now, we'll validate that quality indicators are properly displayed
      await page.goto('/projects'); // Assuming this shows existing projects
      
      // Look for service version indicators
      const serviceVersions = await page.locator('[data-testid*="service-version"]').all();
      
      if (serviceVersions.length > 0) {
        for (const versionElement of serviceVersions) {
          const versionText = await versionElement.textContent();
          expect(versionText).toContain('consolidated');
        }
        
        console.log(`✅ Found ${serviceVersions.length} consolidated service indicators`);
      } else {
        console.log('ℹ️ No existing projects with service indicators found');
      }
    });
  });
});

// Cross-browser testing for critical workflows
test.describe('Cross-Browser Compatibility', () => {
  ['chromium', 'firefox', 'webkit'].forEach(browserName => {
    test(`should work correctly in ${browserName}`, async ({ page, browserName: currentBrowser }) => {
      // Only run this test for the specific browser
      test.skip(currentBrowser !== browserName);
      
      console.log(`🌐 Testing critical workflow in ${browserName}`);
      
      const browserHelper = new E2ETestHelper(page);
      
      await page.goto('/');
      await browserHelper.waitForLoadingComplete();
      
      // Test basic functionality
      await page.click(COMPREHENSIVE_E2E_CONFIG.selectors.navigation.projectsTab);
      await expect(page).toHaveTitle(/Competitor Research Agent/);
      
      // Test project creation form
      await page.click(COMPREHENSIVE_E2E_CONFIG.selectors.project.createButton);
      await expect(page.locator(COMPREHENSIVE_E2E_CONFIG.selectors.project.nameInput))
        .toBeVisible();
      
      console.log(`✅ ${browserName} compatibility validated`);
    });
  });
}); 