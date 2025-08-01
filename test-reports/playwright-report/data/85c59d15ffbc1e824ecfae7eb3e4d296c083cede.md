# Test info

- Name: Task 5.1: Production Validation - Performance & Load >> should handle multiple concurrent page loads efficiently
- Location: /Users/troy.edwards/code/competitor-agent-tam-nve/e2e/production-validation.spec.ts:390:7

# Error details

```
Error: browserType.launch: Executable doesn't exist at /Users/troy.edwards/Library/Caches/ms-playwright/webkit-2158/pw_run.sh
╔═════════════════════════════════════════════════════════════════════════╗
║ Looks like Playwright Test or Playwright was just installed or updated. ║
║ Please run the following command to download new browsers:              ║
║                                                                         ║
║     npx playwright install                                              ║
║                                                                         ║
║ <3 Playwright Team                                                      ║
╚═════════════════════════════════════════════════════════════════════════╝
```

# Test source

```ts
  290 |     // 11. Validate navigation and UI responsiveness
  291 |     await page.click('text=Dashboard', { timeout: 5000 });
  292 |     await expect(page).toHaveURL('/');
  293 |     
  294 |     await page.goBack();
  295 |     await expect(page).toHaveURL(/\/projects\/.*/);
  296 |
  297 |     console.log('✅ End-to-end user journey validation completed successfully');
  298 |   });
  299 | });
  300 |
  301 | test.describe('Task 5.1: Production Validation - Error Handling & Resilience', () => {
  302 |   test('should gracefully handle invalid form submissions', async ({ page }) => {
  303 |     await page.goto('/projects/new');
  304 |
  305 |     // Test empty form submission - try to go to next step without filling required fields
  306 |     // The Next button should be disabled when required fields are empty
  307 |     const nextButton = page.locator('[data-testid="next-button"]');
  308 |     await expect(nextButton).toBeDisabled({ timeout: 5000 });
  309 |     
  310 |     console.log('✅ Next button correctly disabled for empty form');
  311 |
  312 |     // Fill basic info and proceed to product step to test URL validation
  313 |     await page.fill('[data-testid="project-name"]', 'Test Project');
  314 |     
  315 |     // Wait for button to be enabled after filling required field
  316 |     await page.waitForSelector('[data-testid="next-button"]:not([disabled])', { timeout: 10000 });
  317 |     await page.click('[data-testid="next-button"]');
  318 |     
  319 |     console.log('✅ Form validation works correctly - proceeding to next step after filling required fields');
  320 |     
  321 |     // Test invalid URL format - this step happens on the product step  
  322 |     await page.fill('[data-testid="product-website"]', 'invalid-url');
  323 |     
  324 |     // The Next button should be disabled due to invalid URL
  325 |     const nextButtonOnProduct = page.locator('[data-testid="next-button"]');
  326 |     await expect(nextButtonOnProduct).toBeDisabled({ timeout: 5000 });
  327 |     
  328 |     console.log('✅ URL validation works correctly - Next button disabled for invalid URL');
  329 |   });
  330 |
  331 |   test('should handle network failures gracefully', async ({ page, context }) => {
  332 |     await page.goto('/projects/new');
  333 |
  334 |     // Fill valid form data
  335 |     await page.fill('[data-testid="project-name"]', 'Network Test Project');
  336 |     
  337 |     // Navigate to product step and fill required fields
  338 |     await page.waitForSelector('[data-testid="next-button"]:not([disabled])', { timeout: 10000 });
  339 |     await page.click('[data-testid="next-button"]');
  340 |     
  341 |     await page.fill('[data-testid="product-name"]', 'Network Test Product');
  342 |     await page.fill('[data-testid="product-website"]', 'https://network-test.com');
  343 |
  344 |     // Navigate through remaining steps quickly
  345 |     for (let i = 0; i < 3; i++) {
  346 |       try {
  347 |         await page.waitForSelector('[data-testid="next-button"]:not([disabled])', { timeout: 5000 });
  348 |         await page.click('[data-testid="next-button"]');
  349 |       } catch (error) {
  350 |         break; // No more next buttons, we're at the final step
  351 |       }
  352 |     }
  353 |
  354 |     // Simulate network failure by intercepting requests
  355 |     await page.route('/api/projects', (route) => {
  356 |       route.abort('failed');
  357 |     });
  358 |
  359 |     await page.waitForSelector('[data-testid="create-project"]:not([disabled])', { timeout: 10000 });
  360 |     await page.click('[data-testid="create-project"]');
  361 |
  362 |     // Should show network error handling
  363 |     const networkErrorIndicators = [
  364 |       'text=Network error',
  365 |       'text=Connection failed',
  366 |       'text=Please try again',
  367 |       'text=Error',
  368 |       '.error'
  369 |     ];
  370 |
  371 |     let networkErrorFound = false;
  372 |     for (const indicator of networkErrorIndicators) {
  373 |       try {
  374 |         await expect(page.locator(indicator)).toBeVisible({
  375 |           timeout: PRODUCTION_VALIDATION_CONFIG.timeouts.errorRecovery
  376 |         });
  377 |         networkErrorFound = true;
  378 |         console.log(`✅ Network error handling validated: ${indicator}`);
  379 |         break;
  380 |       } catch (error) {
  381 |         // Continue checking
  382 |       }
  383 |     }
  384 |
  385 |     console.log('✅ Network failure handling tested');
  386 |   });
  387 | });
  388 |
  389 | test.describe('Task 5.1: Production Validation - Performance & Load', () => {
> 390 |   test('should handle multiple concurrent page loads efficiently', async ({ context }) => {
      |       ^ Error: browserType.launch: Executable doesn't exist at /Users/troy.edwards/Library/Caches/ms-playwright/webkit-2158/pw_run.sh
  391 |     const pages: Page[] = [];
  392 |     const loadTimes: number[] = [];
  393 |
  394 |     try {
  395 |       // Create 5 concurrent page loads
  396 |       const pagePromises = Array.from({ length: 5 }, async (_, index) => {
  397 |         const page = await context.newPage();
  398 |         pages.push(page);
  399 |         
  400 |         const startTime = Date.now();
  401 |         await page.goto('/');
  402 |         const loadTime = Date.now() - startTime;
  403 |         loadTimes.push(loadTime);
  404 |         
  405 |         await expect(page.locator('h1')).toContainText('Competitor Research Dashboard');
  406 |         
  407 |         console.log(`📊 Concurrent page ${index + 1} load time: ${loadTime}ms`);
  408 |         return { page, loadTime };
  409 |       });
  410 |
  411 |       await Promise.all(pagePromises);
  412 |
  413 |       // Validate performance under concurrent load
  414 |       const averageLoadTime = loadTimes.reduce((a, b) => a + b, 0) / loadTimes.length;
  415 |       const maxLoadTime = Math.max(...loadTimes);
  416 |
  417 |       expect(averageLoadTime).toBeLessThan(PRODUCTION_VALIDATION_CONFIG.performanceThresholds.pageLoadTime);
  418 |       expect(maxLoadTime).toBeLessThan(PRODUCTION_VALIDATION_CONFIG.performanceThresholds.pageLoadTime * 2);
  419 |
  420 |       console.log(`📊 Concurrent load test results:`);
  421 |       console.log(`   Average load time: ${Math.round(averageLoadTime)}ms`);
  422 |       console.log(`   Max load time: ${maxLoadTime}ms`);
  423 |       console.log(`   All pages within performance thresholds: ✅`);
  424 |
  425 |     } finally {
  426 |       // Cleanup pages
  427 |       for (const page of pages) {
  428 |         await page.close();
  429 |       }
  430 |     }
  431 |   });
  432 |
  433 |   test('should maintain responsiveness during API operations', async ({ page }) => {
  434 |     await page.goto('/projects');
  435 |
  436 |     // Measure time to load projects list
  437 |     const startTime = Date.now();
  438 |     await expect(page.locator('h1')).toContainText('Projects');
  439 |     const loadTime = Date.now() - startTime;
  440 |
  441 |     expect(loadTime).toBeLessThan(PRODUCTION_VALIDATION_CONFIG.performanceThresholds.pageLoadTime);
  442 |     console.log(`📊 Projects page load time: ${loadTime}ms`);
  443 |
  444 |     // Test navigation responsiveness
  445 |     const navStartTime = Date.now();
  446 |     await page.click('text=Create New Project');
  447 |     await expect(page).toHaveURL('/projects/new');
  448 |     const navTime = Date.now() - navStartTime;
  449 |
  450 |     expect(navTime).toBeLessThan(3000);
  451 |     console.log(`📊 Navigation time: ${navTime}ms`);
  452 |   });
  453 | });
  454 |
  455 | test.describe('Task 5.1: Production Validation - Integration & Feature Flags', () => {
  456 |   test('should validate feature flag integration', async ({ page, request }) => {
  457 |     // Test that the application loads without feature flag errors
  458 |     await page.goto('/');
  459 |     
  460 |     // Check console for any feature flag related errors
  461 |     const consoleLogs: string[] = [];
  462 |     page.on('console', (msg) => {
  463 |       if (msg.type() === 'error' && msg.text().includes('feature')) {
  464 |         consoleLogs.push(msg.text());
  465 |       }
  466 |     });
  467 |
  468 |     await page.waitForTimeout(2000); // Give time for any errors to surface
  469 |
  470 |     expect(consoleLogs.length).toBe(0);
  471 |     console.log('✅ No feature flag related errors detected');
  472 |
  473 |     // Test feature flag endpoints if available
  474 |     try {
  475 |       const flagResponse = await request.get('/api/feature-flags');
  476 |       if (flagResponse.status() === 200) {
  477 |         const flags = await flagResponse.json();
  478 |         console.log('✅ Feature flags endpoint accessible');
  479 |         console.log(`📊 Feature flags loaded: ${Object.keys(flags).length}`);
  480 |       }
  481 |     } catch (error) {
  482 |       console.log('ℹ️ Feature flags endpoint not available (using env variables)');
  483 |     }
  484 |   });
  485 |
  486 |   test('should validate monitoring integration', async ({ request }) => {
  487 |     // Test health endpoint
  488 |     const healthResponse = await request.get('/api/health');
  489 |     expect(healthResponse.status()).toBe(200);
  490 |
```