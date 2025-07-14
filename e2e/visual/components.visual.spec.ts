/**
 * Visual Regression Tests for UI Components
 * Task 6.2: Cross-Browser Testing
 * 
 * This file contains visual regression tests for key UI components
 * to ensure consistent appearance across browsers.
 */

import { test, expect } from '@playwright/test';
import { 
  visualTest, 
  compareScreenshot, 
  multiViewportScreenshot 
} from '../helpers/visualRegressionHelper';

// Define viewports to test
const VIEWPORTS = [
  { width: 1920, height: 1080 }, // Desktop
  { width: 1366, height: 768 },  // Laptop
  { width: 768, height: 1024 },  // Tablet
  { width: 375, height: 667 }    // Mobile
];

test.describe('Visual Regression Tests - Key UI Components', () => {
  // Run before all tests in this file
  test.beforeAll(async ({ browser }) => {
    // Any setup needed before tests
  });

  // Project Creation Form
  test('Project Creation Form appearance', async ({ page, browserName }) => {
    await page.goto('/projects/new');
    await page.waitForLoadState('networkidle');
    
    // Wait for any animations to complete
    await page.waitForTimeout(1000);
    
    await compareScreenshot(page, {
      name: 'project-creation-form',
      selector: 'form',
      maskDynamicContent: true,
    });
  });
  
  // Navigation Component
  test('Navigation Component appearance', async ({ page, browserName }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Wait for any animations to complete
    await page.waitForTimeout(1000);
    
    await compareScreenshot(page, {
      name: 'navigation-component',
      selector: 'nav',
      maskDynamicContent: true,
    });
  });
  
  // Progress Indicator Component
  test('Progress Indicator appearance', async ({ page, browserName }) => {
    // Navigate to a page that shows progress indicators
    await page.goto('/projects/new');
    
    // Fill minimal form data to proceed
    await page.fill('[data-testid="project-name"]', `Visual Test ${Date.now()}`);
    await page.fill('[data-testid="product-website"]', 'https://visual-test.com');
    await page.fill('[data-testid="competitor-name-0"]', 'Visual Competitor');
    await page.fill('[data-testid="competitor-website-0"]', 'https://visual-competitor.com');
    
    // Submit form to see progress indicator
    await page.click('[data-testid="create-project"]');
    
    // Wait for progress indicator to appear
    await page.waitForSelector('[data-testid="progress-indicator"]', { state: 'visible' });
    
    // Take screenshot of just the progress component
    await compareScreenshot(page, {
      name: 'progress-indicator',
      selector: '[data-testid="progress-indicator"]',
      maskDynamicContent: true,
    });
  });
  
  // Reports List Component - test across multiple viewports
  test('Reports List Component responsive layout', async ({ page, browserName }) => {
    // Navigate to reports page
    await page.goto('/reports');
    await page.waitForLoadState('networkidle');
    
    // Test across multiple viewports
    await multiViewportScreenshot(
      page,
      'reports-list',
      VIEWPORTS,
      {
        selector: 'main',
        maskDynamicContent: true,
      }
    );
  });
});

// Visual tests for specific browser compatibility issues
test.describe('Browser-Specific Visual Tests', () => {
  // CSS Grid layout test (often has browser differences)
  test('CSS Grid layout rendering', async ({ page, browserName }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    
    await compareScreenshot(page, {
      name: `grid-layout-${browserName}`,
      selector: '.dashboard-grid',
      maskDynamicContent: true,
    });
  });
  
  // Form controls appearance test
  test('Form controls appearance', async ({ page, browserName }) => {
    await page.goto('/projects/new');
    
    // Focus on form elements to test focus states
    await page.focus('input[type="text"]');
    
    await compareScreenshot(page, {
      name: `form-controls-${browserName}`,
      selector: 'form',
      maskDynamicContent: true,
    });
  });
  
  // Custom dropdown component test (often problematic across browsers)
  test('Custom dropdown component', async ({ page, browserName }) => {
    await page.goto('/projects/new');
    
    // Open dropdown if it exists
    const dropdown = page.locator('.custom-dropdown');
    if (await dropdown.isVisible()) {
      await dropdown.click();
      // Wait for animation
      await page.waitForTimeout(500);
    }
    
    await compareScreenshot(page, {
      name: `dropdown-${browserName}`,
      selector: '.custom-dropdown',
      maskDynamicContent: true,
      threshold: 0.2, // More tolerance for dropdown rendering differences
    });
  });
}); 