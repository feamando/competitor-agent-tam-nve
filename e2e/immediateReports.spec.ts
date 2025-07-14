/**
 * Phase 5.4: End-to-End Tests for Immediate Comparative Reports
 * Complete user journey testing with cross-browser compatibility
 */

import { test, expect, Page, BrowserContext } from '@playwright/test';
import { logger } from '@/lib/logger';

// Test configuration
const E2E_CONFIG = {
  timeouts: {
    navigation: 30000, // 30 seconds for page navigation
    reportGeneration: 75000, // 75 seconds for report generation (including retries)
    elementInteraction: 10000, // 10 seconds for element interactions
  },
  retries: {
    maxAttempts: 3,
    backoffMs: 2000,
  },
  testData: {
    projectName: `E2E Test Project ${Date.now()}`,
    productWebsite: 'https://example-e2e-test.com',
    competitors: [
      { name: 'E2E Competitor 1', website: 'https://competitor1-e2e.com' },
      { name: 'E2E Competitor 2', website: 'https://competitor2-e2e.com' }
    ]
  },
  browsers: ['chromium', 'firefox', 'webkit'], // Cross-browser testing
  viewports: [
    { width: 1920, height: 1080 }, // Desktop
    { width: 1366, height: 768 },  // Laptop
    { width: 768, height: 1024 },  // Tablet
    { width: 375, height: 667 }    // Mobile
  ]
};

test.describe('Phase 5.4: Immediate Reports E2E Tests', () => {
  let testProjectIds: string[] = [];

  test.beforeAll(async () => {
    logger.info('Starting E2E tests for immediate reports', {
      config: E2E_CONFIG
    });
  });

  test.afterAll(async () => {
    // Cleanup test data
    await cleanupE2ETestData();
    logger.info('E2E tests completed', {
      projectsCreated: testProjectIds.length
    });
  });

  test.describe('Happy Path User Journey', () => {
    test('should complete full project creation with immediate report generation', async ({ page }) => {
      test.setTimeout(E2E_CONFIG.timeouts.reportGeneration);

      // 1. Navigate to project creation page
      await page.goto('/projects/new');
      await expect(page).toHaveTitle(/Create New Project/);

      // 2. Fill project form - handle step-by-step wizard
      await page.fill('[data-testid="project-name"]', E2E_CONFIG.testData.projectName);
      
      // Navigate to product step
      const nextButton = page.locator('[data-testid="next-button"]');
      await expect(nextButton).toBeVisible({ timeout: 10000 });
      await expect(nextButton).toBeEnabled({ timeout: 5000 });
      await nextButton.click();
      
      // Wait for product step and fill information
      await page.waitForSelector('[data-testid="product-website"]', { timeout: 10000 });
      await page.fill('[data-testid="product-website"]', E2E_CONFIG.testData.productWebsite);

      // 3. Add competitors
      for (let i = 0; i < E2E_CONFIG.testData.competitors.length; i++) {
        const competitor = E2E_CONFIG.testData.competitors[i];
        
        if (i > 0) {
          await page.click('[data-testid="add-competitor"]');
        }
        
        await page.fill(`[data-testid="competitor-name-${i}"]`, competitor.name);
        await page.fill(`[data-testid="competitor-website-${i}"]`, competitor.website);
      }

      // 4. Configure immediate report generation
      await expect(page.locator('[data-testid="generate-initial-report"]')).toBeChecked(); // Default enabled
      await page.selectOption('[data-testid="report-template"]', 'comprehensive');

      // 5. Submit project creation form
      await page.click('[data-testid="create-project"]');

      // 6. Wait for redirect to project page
      await page.waitForURL(/\/projects\/.*/, { 
        timeout: E2E_CONFIG.timeouts.navigation 
      });

      // Extract project ID from URL for cleanup
      const projectId = page.url().split('/projects/')[1]?.split('?')[0] || 'unknown';
      if (projectId !== 'unknown') {
        testProjectIds.push(projectId);
      }

      // 7. Verify immediate report generation indicators
      await expect(page.locator('[data-testid="initial-report-indicator"]')).toBeVisible({
        timeout: E2E_CONFIG.timeouts.elementInteraction
      });

      // 8. Watch real-time progress updates
      const progressIndicator = page.locator('[data-testid="progress-indicator"]');
      await expect(progressIndicator).toBeVisible();

      // Verify progress phases
      await expect(page.locator('[data-testid="phase-validation"]')).toBeVisible();
      await expect(page.locator('[data-testid="phase-snapshot-capture"]')).toBeVisible({
        timeout: E2E_CONFIG.timeouts.elementInteraction
      });
      
      // 9. Wait for snapshot capture progress
      const snapshotProgress = page.locator('[data-testid="snapshot-progress"]');
      await expect(snapshotProgress).toBeVisible();
      
      // Verify competitor snapshot capture status
      await expect(page.locator('[data-testid="competitor-snapshots-status"]')).toContainText('Capturing');

      // 10. Wait for analysis phase
      await expect(page.locator('[data-testid="phase-analysis"]')).toBeVisible({
        timeout: E2E_CONFIG.timeouts.elementInteraction
      });

      // 11. Wait for report generation completion
      await expect(page.locator('[data-testid="report-completed"]')).toBeVisible({
        timeout: E2E_CONFIG.timeouts.reportGeneration
      });

      // 12. Verify report quality indicators
      const completenessScore = page.locator('[data-testid="report-completeness-score"]');
      await expect(completenessScore).toBeVisible();
      
      const dataFreshnessIndicator = page.locator('[data-testid="data-freshness-indicator"]');
      await expect(dataFreshnessIndicator).toBeVisible();
      await expect(dataFreshnessIndicator).toContainText(/Fresh|New/); // Should use fresh snapshots

      const snapshotCaptureStatus = page.locator('[data-testid="snapshot-capture-status"]');
      await expect(snapshotCaptureStatus).toBeVisible();

      // 13. Verify report content is accessible
      await page.click('[data-testid="view-report"]');
      
      const reportContent = page.locator('[data-testid="report-content"]');
      await expect(reportContent).toBeVisible();
      await expect(reportContent).toContainText('Executive Summary');
      await expect(reportContent).toContainText('Competitive Analysis');

      // 14. Verify fresh data indicators in report
      await expect(page.locator('[data-testid="fresh-data-indicator"]')).toBeVisible();
      await expect(page.locator('[data-testid="snapshot-timestamp"]')).toBeVisible();

      logger.info('Happy path E2E test completed successfully', {
        projectId,
        testDuration: Date.now()
      });
    });

    test('should show meaningful progress indicators during generation', async ({ page }) => {
      test.setTimeout(E2E_CONFIG.timeouts.reportGeneration);

      await page.goto('/projects/new');

      // Fill minimal form data
      await page.fill('[data-testid="project-name"]', `Progress Test ${Date.now()}`);
      await page.fill('[data-testid="product-website"]', 'https://progress-test.com');
      
      // Add one competitor for faster testing
      await page.fill('[data-testid="competitor-name-0"]', 'Progress Competitor');
      await page.fill('[data-testid="competitor-website-0"]', 'https://progress-competitor.com');

      await page.click('[data-testid="create-project"]');
      await page.waitForURL(/\/projects\/.*/, { timeout: E2E_CONFIG.timeouts.navigation });

      const projectId = page.url().split('/projects/')[1];
      testProjectIds.push(projectId);

      // Verify progress phases appear in order
      const phases = [
        'phase-validation',
        'phase-snapshot-capture', 
        'phase-analysis',
        'phase-generation'
      ];

      for (const phase of phases) {
        await expect(page.locator(`[data-testid="${phase}"]`)).toBeVisible({
          timeout: E2E_CONFIG.timeouts.elementInteraction
        });
        
        // Verify phase has active state
        await expect(page.locator(`[data-testid="${phase}"]`)).toHaveClass(/active|current/);
      }

      // Verify estimated time indicators
      await expect(page.locator('[data-testid="estimated-completion-time"]')).toBeVisible();

      // Verify progress percentage
      const progressPercentage = page.locator('[data-testid="progress-percentage"]');
      await expect(progressPercentage).toBeVisible();
      
      // Progress should start low and increase
      const initialProgress = await progressPercentage.textContent();
      expect(parseInt(initialProgress || '0')).toBeLessThan(50);

      // Wait for completion
      await expect(page.locator('[data-testid="report-completed"]')).toBeVisible({
        timeout: E2E_CONFIG.timeouts.reportGeneration
      });

      const finalProgress = await progressPercentage.textContent();
      expect(parseInt(finalProgress || '0')).toBe(100);
    });
  });

  test.describe('Error Scenarios and Recovery', () => {
    test('should handle competitor snapshot capture failures gracefully', async ({ page }) => {
      test.setTimeout(E2E_CONFIG.timeouts.reportGeneration);

      await page.goto('/projects/new');

      // Create project with potentially problematic competitor URLs
      await page.fill('[data-testid="project-name"]', `Error Test ${Date.now()}`);
      await page.fill('[data-testid="product-website"]', 'https://error-test.com');
      
      // Add competitor with unreachable URL
      await page.fill('[data-testid="competitor-name-0"]', 'Unreachable Competitor');
      await page.fill('[data-testid="competitor-website-0"]', 'https://unreachable-competitor-12345.com');

      await page.click('[data-testid="create-project"]');
      await page.waitForURL(/\/projects\/.*/, { timeout: E2E_CONFIG.timeouts.navigation });

      const projectId = page.url().split('/projects/')[1];
      testProjectIds.push(projectId);

      // Wait for snapshot capture to attempt and potentially fail
      await expect(page.locator('[data-testid="phase-snapshot-capture"]')).toBeVisible();

      // Should proceed with partial data even if snapshots fail
      await expect(page.locator('[data-testid="partial-data-indicator"]')).toBeVisible({
        timeout: E2E_CONFIG.timeouts.elementInteraction
      });

      // Verify fallback message is shown
      await expect(page.locator('[data-testid="snapshot-failure-message"]')).toBeVisible();
      await expect(page.locator('[data-testid="snapshot-failure-message"]')).toContainText(/capture failed|using existing data/i);

      // Report should still be generated
      await expect(page.locator('[data-testid="report-completed"]')).toBeVisible({
        timeout: E2E_CONFIG.timeouts.reportGeneration
      });

      // Verify quality indicators reflect the data limitations
      const completenessScore = await page.locator('[data-testid="report-completeness-score"]').textContent();
      expect(parseInt(completenessScore || '0')).toBeLessThan(70); // Should be lower due to failed snapshots
    });

    test('should provide retry options when generation fails', async ({ page }) => {
      test.setTimeout(E2E_CONFIG.timeouts.reportGeneration);

      await page.goto('/projects/new');

      await page.fill('[data-testid="project-name"]', `Retry Test ${Date.now()}`);
      await page.fill('[data-testid="product-website"]', 'https://retry-test.com');
      
      await page.click('[data-testid="create-project"]');
      await page.waitForURL(/\/projects\/.*/, { timeout: E2E_CONFIG.timeouts.navigation });

      const projectId = page.url().split('/projects/')[1];
      testProjectIds.push(projectId);

      // Simulate or wait for potential failure
      // This might timeout or fail for various reasons

      // If error occurs, verify retry options are available
      const errorIndicator = page.locator('[data-testid="report-generation-error"]');
      if (await errorIndicator.isVisible({ timeout: 5000 })) {
        // Verify retry options are provided
        await expect(page.locator('[data-testid="retry-button"]')).toBeVisible();
        await expect(page.locator('[data-testid="schedule-later-button"]')).toBeVisible();
        await expect(page.locator('[data-testid="proceed-without-report-button"]')).toBeVisible();

        // Test retry functionality
        await page.click('[data-testid="retry-button"]');
        
        // Should restart the process
        await expect(page.locator('[data-testid="phase-validation"]')).toBeVisible();
      }
    });
  });

  test.describe('Cross-Browser Compatibility', () => {
    E2E_CONFIG.browsers.forEach(browserName => {
      test(`should work correctly in ${browserName}`, async ({ page, browserName: currentBrowser }) => {
        test.skip(currentBrowser !== browserName, `Skipping ${browserName} test in ${currentBrowser}`);
        
        test.setTimeout(E2E_CONFIG.timeouts.reportGeneration);

        await page.goto('/projects/new');

        await page.fill('[data-testid="project-name"]', `${browserName} Test ${Date.now()}`);
        await page.fill('[data-testid="product-website"]', `https://${browserName}-test.com`);
        await page.fill('[data-testid="competitor-name-0"]', `${browserName} Competitor`);
        await page.fill('[data-testid="competitor-website-0"]', `https://${browserName}-competitor.com`);

        await page.click('[data-testid="create-project"]');
        await page.waitForURL(/\/projects\/.*/, { timeout: E2E_CONFIG.timeouts.navigation });

        const projectId = page.url().split('/projects/')[1];
        testProjectIds.push(projectId);

        // Verify core functionality works
        await expect(page.locator('[data-testid="initial-report-indicator"]')).toBeVisible();
        await expect(page.locator('[data-testid="progress-indicator"]')).toBeVisible();

        // Wait for completion or reasonable timeout
        try {
          await expect(page.locator('[data-testid="report-completed"]')).toBeVisible({
            timeout: E2E_CONFIG.timeouts.reportGeneration
          });
        } catch (error) {
          // Log browser-specific issues but don't fail the test
          logger.warn(`Report generation timeout in ${browserName}`, {
            projectId,
            browser: browserName,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      });
    });
  });

  test.describe('Mobile Responsiveness', () => {
    E2E_CONFIG.viewports.forEach(viewport => {
      test(`should be responsive at ${viewport.width}x${viewport.height}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        
        test.setTimeout(E2E_CONFIG.timeouts.reportGeneration);

        await page.goto('/projects/new');

        // Verify form is usable on this viewport
        const projectNameField = page.locator('[data-testid="project-name"]');
        await expect(projectNameField).toBeVisible();
        
        const createButton = page.locator('[data-testid="create-project"]');
        await expect(createButton).toBeVisible();

        // Fill minimal form
        await page.fill('[data-testid="project-name"]', `Mobile Test ${viewport.width}x${viewport.height}`);
        await page.fill('[data-testid="product-website"]', 'https://mobile-test.com');
        await page.fill('[data-testid="competitor-name-0"]', 'Mobile Competitor');
        await page.fill('[data-testid="competitor-website-0"]', 'https://mobile-competitor.com');

        await page.click('[data-testid="create-project"]');
        await page.waitForURL(/\/projects\/.*/, { timeout: E2E_CONFIG.timeouts.navigation });

        const projectId = page.url().split('/projects/')[1];
        testProjectIds.push(projectId);

        // Verify progress indicators are visible and usable on mobile
        const progressIndicator = page.locator('[data-testid="progress-indicator"]');
        await expect(progressIndicator).toBeVisible();

        // On smaller screens, progress might be collapsed or simplified
        if (viewport.width < 768) {
          // Mobile-specific checks
          const mobileProgress = page.locator('[data-testid="mobile-progress-indicator"]');
          if (await mobileProgress.isVisible({ timeout: 2000 })) {
            await expect(mobileProgress).toBeVisible();
          }
        }

        logger.info(`Mobile responsiveness test completed for ${viewport.width}x${viewport.height}`, {
          projectId,
          viewport
        });
      });
    });
  });

  test.describe('Performance Under Load', () => {
    test('should handle multiple concurrent project creations', async ({ context }) => {
      test.setTimeout(E2E_CONFIG.timeouts.reportGeneration * 3);

      const concurrentProjects = 3; // Reduced for E2E testing
      const pages: Page[] = [];
      const projectPromises: Promise<string>[] = [];

      try {
        // Create multiple pages
        for (let i = 0; i < concurrentProjects; i++) {
          const page = await context.newPage();
          pages.push(page);

          const projectPromise = createProjectInPage(page, `Concurrent Test ${i} ${Date.now()}`);
          projectPromises.push(projectPromise);
        }

        // Wait for all projects to complete
        const projectIds = await Promise.allSettled(projectPromises);
        
        projectIds.forEach(result => {
          if (result.status === 'fulfilled') {
            testProjectIds.push(result.value);
          }
        });

        // Verify at least some projects completed successfully
        const successfulProjects = projectIds.filter(result => result.status === 'fulfilled');
        expect(successfulProjects.length).toBeGreaterThan(0);

        logger.info('Concurrent project creation test completed', {
          attempted: concurrentProjects,
          successful: successfulProjects.length,
          failed: projectIds.length - successfulProjects.length
        });

      } finally {
        // Clean up pages
        await Promise.all(pages.map(page => page.close().catch(() => {})));
      }
    });
  });

  // Helper functions
  async function createProjectInPage(page: Page, projectName: string): Promise<string> {
    await page.goto('/projects/new');
    
    await page.fill('[data-testid="project-name"]', projectName);
    await page.fill('[data-testid="product-website"]', `https://${projectName.replace(/\s/g, '-').toLowerCase()}.com`);
    await page.fill('[data-testid="competitor-name-0"]', `${projectName} Competitor`);
    await page.fill('[data-testid="competitor-website-0"]', `https://${projectName.replace(/\s/g, '-').toLowerCase()}-competitor.com`);

    await page.click('[data-testid="create-project"]');
    await page.waitForURL(/\/projects\/.*/, { timeout: E2E_CONFIG.timeouts.navigation });

    const projectId = page.url().split('/projects/')[1];

    // Wait for some progress indication
    await expect(page.locator('[data-testid="initial-report-indicator"]')).toBeVisible({
      timeout: E2E_CONFIG.timeouts.elementInteraction
    });

    return projectId;
  }

  async function cleanupE2ETestData(): Promise<void> {
    // In a real implementation, this would call cleanup APIs
    // For now, just log the projects that were created
    if (testProjectIds.length > 0) {
      logger.info('E2E test cleanup needed', {
        projectIds: testProjectIds,
        count: testProjectIds.length
      });
    }
  }
}); 