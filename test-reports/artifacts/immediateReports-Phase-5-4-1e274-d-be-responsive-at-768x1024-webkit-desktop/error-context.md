# Test info

- Name: Phase 5.4: Immediate Reports E2E Tests >> Mobile Responsiveness >> should be responsive at 768x1024
- Location: /Users/nikita.gorshkov/competitor-research-agent/e2e/immediateReports.spec.ts:342:11

# Error details

```
Error: Timed out 10000ms waiting for expect(locator).toBeVisible()

Locator: locator('[data-testid="create-project"]')
Expected: visible
Received: <element(s) not found>
Call log:
  - expect.toBeVisible with timeout 10000ms
  - waiting for locator('[data-testid="create-project"]')

    at /Users/nikita.gorshkov/competitor-research-agent/e2e/immediateReports.spec.ts:354:36
```

# Page snapshot

```yaml
- navigation:
  - link "CompAI":
    - /url: /
  - link "Dashboard":
    - /url: /
  - link "Chat Agent":
    - /url: /chat
  - link "Projects":
    - /url: /projects
  - link "Competitors":
    - /url: /competitors
  - link "Reports":
    - /url: /reports
  - text: Competitor Research Agent
- main:
  - heading "Create New Project" [level=1]
  - paragraph: Set up your competitive analysis project with immediate report generation
  - heading "Project Basics" [level=2]
  - text: Step 1 of 7
  - paragraph: Start with basic project information
  - text: Project Name *
  - textbox "Project Name *"
  - text: Description
  - textbox "Description"
  - text: Priority
  - combobox "Priority":
    - option "Low" [selected]
    - option "Medium"
    - option "High"
    - option "Urgent"
  - text: Tags
  - textbox "Add a tag"
  - button "Add"
  - button "Previous" [disabled]
  - button "Next" [disabled]
  - paragraph:
    - text: Need help? Check out our
    - link "project creation guide":
      - /url: /help/immediate-reports
    - text: or
    - link "contact support":
      - /url: /support
    - text: .
```

# Test source

```ts
  254 |
  255 |       // Report should still be generated
  256 |       await expect(page.locator('[data-testid="report-completed"]')).toBeVisible({
  257 |         timeout: E2E_CONFIG.timeouts.reportGeneration
  258 |       });
  259 |
  260 |       // Verify quality indicators reflect the data limitations
  261 |       const completenessScore = await page.locator('[data-testid="report-completeness-score"]').textContent();
  262 |       expect(parseInt(completenessScore || '0')).toBeLessThan(70); // Should be lower due to failed snapshots
  263 |     });
  264 |
  265 |     test('should provide retry options when generation fails', async ({ page }) => {
  266 |       test.setTimeout(E2E_CONFIG.timeouts.reportGeneration);
  267 |
  268 |       await page.goto('/projects/new');
  269 |
  270 |       await page.fill('[data-testid="project-name"]', `Retry Test ${Date.now()}`);
  271 |       await page.fill('[data-testid="product-website"]', 'https://retry-test.com');
  272 |       
  273 |       await page.click('[data-testid="create-project"]');
  274 |       await page.waitForURL(/\/projects\/.*/, { timeout: E2E_CONFIG.timeouts.navigation });
  275 |
  276 |       const projectId = page.url().split('/projects/')[1];
  277 |       testProjectIds.push(projectId);
  278 |
  279 |       // Simulate or wait for potential failure
  280 |       // This might timeout or fail for various reasons
  281 |
  282 |       // If error occurs, verify retry options are available
  283 |       const errorIndicator = page.locator('[data-testid="report-generation-error"]');
  284 |       if (await errorIndicator.isVisible({ timeout: 5000 })) {
  285 |         // Verify retry options are provided
  286 |         await expect(page.locator('[data-testid="retry-button"]')).toBeVisible();
  287 |         await expect(page.locator('[data-testid="schedule-later-button"]')).toBeVisible();
  288 |         await expect(page.locator('[data-testid="proceed-without-report-button"]')).toBeVisible();
  289 |
  290 |         // Test retry functionality
  291 |         await page.click('[data-testid="retry-button"]');
  292 |         
  293 |         // Should restart the process
  294 |         await expect(page.locator('[data-testid="phase-validation"]')).toBeVisible();
  295 |       }
  296 |     });
  297 |   });
  298 |
  299 |   test.describe('Cross-Browser Compatibility', () => {
  300 |     E2E_CONFIG.browsers.forEach(browserName => {
  301 |       test(`should work correctly in ${browserName}`, async ({ page, browserName: currentBrowser }) => {
  302 |         test.skip(currentBrowser !== browserName, `Skipping ${browserName} test in ${currentBrowser}`);
  303 |         
  304 |         test.setTimeout(E2E_CONFIG.timeouts.reportGeneration);
  305 |
  306 |         await page.goto('/projects/new');
  307 |
  308 |         await page.fill('[data-testid="project-name"]', `${browserName} Test ${Date.now()}`);
  309 |         await page.fill('[data-testid="product-website"]', `https://${browserName}-test.com`);
  310 |         await page.fill('[data-testid="competitor-name-0"]', `${browserName} Competitor`);
  311 |         await page.fill('[data-testid="competitor-website-0"]', `https://${browserName}-competitor.com`);
  312 |
  313 |         await page.click('[data-testid="create-project"]');
  314 |         await page.waitForURL(/\/projects\/.*/, { timeout: E2E_CONFIG.timeouts.navigation });
  315 |
  316 |         const projectId = page.url().split('/projects/')[1];
  317 |         testProjectIds.push(projectId);
  318 |
  319 |         // Verify core functionality works
  320 |         await expect(page.locator('[data-testid="initial-report-indicator"]')).toBeVisible();
  321 |         await expect(page.locator('[data-testid="progress-indicator"]')).toBeVisible();
  322 |
  323 |         // Wait for completion or reasonable timeout
  324 |         try {
  325 |           await expect(page.locator('[data-testid="report-completed"]')).toBeVisible({
  326 |             timeout: E2E_CONFIG.timeouts.reportGeneration
  327 |           });
  328 |         } catch (error) {
  329 |           // Log browser-specific issues but don't fail the test
  330 |           logger.warn(`Report generation timeout in ${browserName}`, {
  331 |             projectId,
  332 |             browser: browserName,
  333 |             error: error instanceof Error ? error.message : 'Unknown error'
  334 |           });
  335 |         }
  336 |       });
  337 |     });
  338 |   });
  339 |
  340 |   test.describe('Mobile Responsiveness', () => {
  341 |     E2E_CONFIG.viewports.forEach(viewport => {
  342 |       test(`should be responsive at ${viewport.width}x${viewport.height}`, async ({ page }) => {
  343 |         await page.setViewportSize(viewport);
  344 |         
  345 |         test.setTimeout(E2E_CONFIG.timeouts.reportGeneration);
  346 |
  347 |         await page.goto('/projects/new');
  348 |
  349 |         // Verify form is usable on this viewport
  350 |         const projectNameField = page.locator('[data-testid="project-name"]');
  351 |         await expect(projectNameField).toBeVisible();
  352 |         
  353 |         const createButton = page.locator('[data-testid="create-project"]');
> 354 |         await expect(createButton).toBeVisible();
      |                                    ^ Error: Timed out 10000ms waiting for expect(locator).toBeVisible()
  355 |
  356 |         // Fill minimal form
  357 |         await page.fill('[data-testid="project-name"]', `Mobile Test ${viewport.width}x${viewport.height}`);
  358 |         await page.fill('[data-testid="product-website"]', 'https://mobile-test.com');
  359 |         await page.fill('[data-testid="competitor-name-0"]', 'Mobile Competitor');
  360 |         await page.fill('[data-testid="competitor-website-0"]', 'https://mobile-competitor.com');
  361 |
  362 |         await page.click('[data-testid="create-project"]');
  363 |         await page.waitForURL(/\/projects\/.*/, { timeout: E2E_CONFIG.timeouts.navigation });
  364 |
  365 |         const projectId = page.url().split('/projects/')[1];
  366 |         testProjectIds.push(projectId);
  367 |
  368 |         // Verify progress indicators are visible and usable on mobile
  369 |         const progressIndicator = page.locator('[data-testid="progress-indicator"]');
  370 |         await expect(progressIndicator).toBeVisible();
  371 |
  372 |         // On smaller screens, progress might be collapsed or simplified
  373 |         if (viewport.width < 768) {
  374 |           // Mobile-specific checks
  375 |           const mobileProgress = page.locator('[data-testid="mobile-progress-indicator"]');
  376 |           if (await mobileProgress.isVisible({ timeout: 2000 })) {
  377 |             await expect(mobileProgress).toBeVisible();
  378 |           }
  379 |         }
  380 |
  381 |         logger.info(`Mobile responsiveness test completed for ${viewport.width}x${viewport.height}`, {
  382 |           projectId,
  383 |           viewport
  384 |         });
  385 |       });
  386 |     });
  387 |   });
  388 |
  389 |   test.describe('Performance Under Load', () => {
  390 |     test('should handle multiple concurrent project creations', async ({ context }) => {
  391 |       test.setTimeout(E2E_CONFIG.timeouts.reportGeneration * 3);
  392 |
  393 |       const concurrentProjects = 3; // Reduced for E2E testing
  394 |       const pages: Page[] = [];
  395 |       const projectPromises: Promise<string>[] = [];
  396 |
  397 |       try {
  398 |         // Create multiple pages
  399 |         for (let i = 0; i < concurrentProjects; i++) {
  400 |           const page = await context.newPage();
  401 |           pages.push(page);
  402 |
  403 |           const projectPromise = createProjectInPage(page, `Concurrent Test ${i} ${Date.now()}`);
  404 |           projectPromises.push(projectPromise);
  405 |         }
  406 |
  407 |         // Wait for all projects to complete
  408 |         const projectIds = await Promise.allSettled(projectPromises);
  409 |         
  410 |         projectIds.forEach(result => {
  411 |           if (result.status === 'fulfilled') {
  412 |             testProjectIds.push(result.value);
  413 |           }
  414 |         });
  415 |
  416 |         // Verify at least some projects completed successfully
  417 |         const successfulProjects = projectIds.filter(result => result.status === 'fulfilled');
  418 |         expect(successfulProjects.length).toBeGreaterThan(0);
  419 |
  420 |         logger.info('Concurrent project creation test completed', {
  421 |           attempted: concurrentProjects,
  422 |           successful: successfulProjects.length,
  423 |           failed: projectIds.length - successfulProjects.length
  424 |         });
  425 |
  426 |       } finally {
  427 |         // Clean up pages
  428 |         await Promise.all(pages.map(page => page.close().catch(() => {})));
  429 |       }
  430 |     });
  431 |   });
  432 |
  433 |   // Helper functions
  434 |   async function createProjectInPage(page: Page, projectName: string): Promise<string> {
  435 |     await page.goto('/projects/new');
  436 |     
  437 |     await page.fill('[data-testid="project-name"]', projectName);
  438 |     await page.fill('[data-testid="product-website"]', `https://${projectName.replace(/\s/g, '-').toLowerCase()}.com`);
  439 |     await page.fill('[data-testid="competitor-name-0"]', `${projectName} Competitor`);
  440 |     await page.fill('[data-testid="competitor-website-0"]', `https://${projectName.replace(/\s/g, '-').toLowerCase()}-competitor.com`);
  441 |
  442 |     await page.click('[data-testid="create-project"]');
  443 |     await page.waitForURL(/\/projects\/.*/, { timeout: E2E_CONFIG.timeouts.navigation });
  444 |
  445 |     const projectId = page.url().split('/projects/')[1];
  446 |
  447 |     // Wait for some progress indication
  448 |     await expect(page.locator('[data-testid="initial-report-indicator"]')).toBeVisible({
  449 |       timeout: E2E_CONFIG.timeouts.elementInteraction
  450 |     });
  451 |
  452 |     return projectId;
  453 |   }
  454 |
```