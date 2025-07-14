/**
 * Browser-Specific Feature Testing
 * Task 6.2: Cross-Browser Testing
 * 
 * This file contains tests for browser-specific features and quirks that need special handling.
 */

import { test, expect, Page } from '@playwright/test';
import { compareScreenshot } from '../helpers/visualRegressionHelper';

// Test setup helpers
async function setupTest(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000); // Allow time for any animations/lazy loading
}

test.describe('Browser-Specific Feature Tests', () => {
  // Different browsers for conditional test execution
  const chromiumOnly = test.extend({});
  chromiumOnly.describe.configure({ condition: ({ browserName }) => browserName === 'chromium' });
  
  const firefoxOnly = test.extend({});
  firefoxOnly.describe.configure({ condition: ({ browserName }) => browserName === 'firefox' });
  
  const webkitOnly = test.extend({});
  webkitOnly.describe.configure({ condition: ({ browserName }) => browserName === 'webkit' });
  
  // Common tests across all browsers
  test('Form input validation appearance', async ({ page, browserName }) => {
    await setupTest(page, '/projects/new');
    
    // Test HTML5 form validation (appears differently in browsers)
    const nameInput = page.locator('[data-testid="project-name"]');
    await nameInput.click();
    await nameInput.fill(''); // Empty value
    
    // Trigger validation by trying to submit
    await page.click('[data-testid="create-project"]');
    await page.waitForTimeout(500); // Wait for validation UI
    
    // Screenshot the validation state
    await compareScreenshot(page, {
      name: `form-validation-${browserName}`,
      selector: 'form',
      maskDynamicContent: true,
    });
    
    // Check if validation message is shown (implementation varies by browser)
    const isInvalid = await nameInput.evaluate((el: HTMLInputElement) => !el.validity.valid);
    expect(isInvalid).toBe(true);
  });
  
  test('CSS flexbox layout rendering', async ({ page, browserName }) => {
    await setupTest(page, '/projects/new');
    
    // Test flexbox rendering which can differ between browsers
    const flexContainer = page.locator('.competitor-list');
    if (await flexContainer.isVisible()) {
      await compareScreenshot(page, {
        name: `flexbox-layout-${browserName}`,
        selector: '.competitor-list',
        maskDynamicContent: true,
      });
    }
  });
  
  // Browser-specific tests
  
  // Chrome-specific tests
  chromiumOnly.describe('Chrome-specific features', () => {
    test('Chrome-specific CSS features', async ({ page }) => {
      await setupTest(page, '/projects/new');
      
      // Test Chrome-specific features like ::-webkit-scrollbar
      await page.addStyleTag({
        content: `
          .scrollable-element::-webkit-scrollbar {
            width: 12px;
            background-color: #f5f5f5;
          }
          .scrollable-element::-webkit-scrollbar-thumb {
            background-color: #0056b3;
            border-radius: 6px;
          }
        `
      });
      
      // Create a scrollable element for testing
      await page.evaluate(() => {
        const div = document.createElement('div');
        div.className = 'scrollable-element';
        div.style.height = '100px';
        div.style.overflow = 'auto';
        div.innerHTML = '<div style="height: 500px;">Scrollable content</div>';
        document.body.appendChild(div);
      });
      
      await page.waitForTimeout(500);
      
      // Take screenshot of scrollbar styles
      await compareScreenshot(page, {
        name: 'chrome-scrollbar',
        selector: '.scrollable-element',
      });
    });
  });
  
  // Firefox-specific tests
  firefoxOnly.describe('Firefox-specific features', () => {
    test('Firefox form element styling', async ({ page }) => {
      await setupTest(page, '/projects/new');
      
      // Firefox has different form control styling
      await compareScreenshot(page, {
        name: 'firefox-form-controls',
        selector: 'form',
      });
      
      // Test Firefox-specific form behaviors
      // Firefox handles some form validations differently
      const websiteInput = page.locator('[data-testid="product-website"]');
      await websiteInput.fill('not-a-valid-url');
      await page.click('[data-testid="create-project"]');
      
      await compareScreenshot(page, {
        name: 'firefox-url-validation',
        selector: 'form',
      });
    });
  });
  
  // Safari-specific tests
  webkitOnly.describe('Safari-specific features', () => {
    test('Safari textarea appearance', async ({ page }) => {
      await setupTest(page, '/projects/new');
      
      // Safari renders some form elements differently
      const textareas = page.locator('textarea');
      if (await textareas.count() > 0) {
        await textareas.first().click();
        await textareas.first().fill('Testing Safari textarea appearance');
        
        await compareScreenshot(page, {
          name: 'safari-textarea',
          selector: 'textarea',
        });
      }
    });
    
    test('Safari position:sticky behavior', async ({ page }) => {
      await setupTest(page, '/');
      
      // Safari has unique sticky positioning behavior
      await page.addStyleTag({
        content: `
          .sticky-test {
            position: sticky;
            top: 0;
            background-color: yellow;
            padding: 10px;
            z-index: 100;
          }
        `
      });
      
      // Create a test element
      await page.evaluate(() => {
        const header = document.createElement('div');
        header.className = 'sticky-test';
        header.textContent = 'Sticky Header Test';
        document.body.insertBefore(header, document.body.firstChild);
        
        // Add content to scroll
        const content = document.createElement('div');
        content.style.height = '2000px';
        content.textContent = 'Scrollable content';
        document.body.appendChild(content);
      });
      
      // Take screenshot before scrolling
      await compareScreenshot(page, {
        name: 'safari-sticky-before',
        selector: 'body',
      });
      
      // Scroll and take another screenshot
      await page.evaluate(() => window.scrollTo(0, 100));
      await page.waitForTimeout(500);
      
      await compareScreenshot(page, {
        name: 'safari-sticky-after',
        selector: 'body',
      });
    });
  });
});

// Tests for mobile browsers
test.describe('Mobile Browser Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Set viewport to mobile size
    await page.setViewportSize({ width: 375, height: 667 });
  });
  
  test('Mobile tap behavior on buttons', async ({ page, browserName }) => {
    await setupTest(page, '/projects/new');
    
    // Test tap target sizes
    const button = page.locator('[data-testid="create-project"]');
    
    // Take screenshot before tap
    await compareScreenshot(page, {
      name: `mobile-tap-before-${browserName}`,
      selector: '[data-testid="create-project"]',
    });
    
    // Simulate tap
    await button.tap();
    await page.waitForTimeout(300);
    
    // Take screenshot during tap effect
    await compareScreenshot(page, {
      name: `mobile-tap-after-${browserName}`,
      selector: '[data-testid="create-project"]',
    });
  });
  
  test('Mobile-specific UI adaptations', async ({ page, browserName }) => {
    await setupTest(page, '/');
    
    // Check if mobile navigation is displayed correctly
    const mobileNav = page.locator('.mobile-nav, [data-testid="mobile-nav"]');
    if (await mobileNav.isVisible()) {
      await compareScreenshot(page, {
        name: `mobile-nav-${browserName}`,
        selector: 'nav',
      });
      
      // Test hamburger menu if present
      const menuToggle = page.locator('.menu-toggle, [data-testid="menu-toggle"]');
      if (await menuToggle.isVisible()) {
        await menuToggle.click();
        await page.waitForTimeout(500); // Wait for animation
        
        await compareScreenshot(page, {
          name: `mobile-menu-open-${browserName}`,
          selector: 'nav',
        });
      }
    }
  });
}); 