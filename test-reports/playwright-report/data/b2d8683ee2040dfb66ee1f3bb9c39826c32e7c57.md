# Test info

- Name: Task 8.1: Comprehensive User Journey Validation >> 1. Complete Project Workflow >> should handle concurrent user sessions gracefully
- Location: /Users/troy.edwards/code/competitor-agent-tam-nve/e2e/comprehensive-user-journeys.spec.ts:338:9

# Error details

```
TimeoutError: page.click: Timeout 15000ms exceeded.
Call log:
  - waiting for locator('[data-testid="nav-projects"]')

    at /Users/troy.edwards/code/competitor-agent-tam-nve/e2e/comprehensive-user-journeys.spec.ts:359:24
    at /Users/troy.edwards/code/competitor-agent-tam-nve/e2e/comprehensive-user-journeys.spec.ts:386:7
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
  - heading "Competitor Research Dashboard" [level=1]
  - paragraph: Automate your competitive intelligence with our intelligent agent. Set up projects, schedule reports, and get insights that help you stay ahead.
  - heading "🤖 AI Chat Agent" [level=2]
  - paragraph: Start a conversation with our AI agent to set up automated competitor research projects.
  - link "Start Chat Session":
    - /url: /chat
  - heading "Quick Actions" [level=2]
  - link "New Analysis Project":
    - /url: /chat
  - link "View All Reports":
    - /url: /reports
  - heading "Recent Reports" [level=2]
  - heading "System Status" [level=2]
  - text: Chat Agent Online Report Generator Ready Analysis Engine Active
```

# Test source

```ts
  259 |         .toBeVisible();
  260 |       
  261 |       // Check quality score
  262 |       const qualityScore = await page.locator(COMPREHENSIVE_E2E_CONFIG.selectors.analysis.qualityScore)
  263 |         .textContent();
  264 |       expect(parseFloat(qualityScore || '0')).toBeGreaterThan(0.7);
  265 |       
  266 |       // Validate consolidated service usage
  267 |       await helper.validateServiceVersion(
  268 |         COMPREHENSIVE_E2E_CONFIG.selectors.analysis.serviceVersion,
  269 |         'analysis'
  270 |       );
  271 |       
  272 |       // Capture correlation ID for tracing
  273 |       const analysisCorrelationId = await helper.captureCorrelationId();
  274 |       console.log(`📋 Analysis correlation ID: ${analysisCorrelationId}`);
  275 |
  276 |       // Phase 4: Generate Report
  277 |       console.log('📄 Phase 4: Generating report with consolidated service');
  278 |       const reportStartTime = Date.now();
  279 |       
  280 |       // Configure report options
  281 |       await page.selectOption(
  282 |         COMPREHENSIVE_E2E_CONFIG.selectors.reports.templateSelect,
  283 |         'comprehensive'
  284 |       );
  285 |       await page.selectOption(
  286 |         COMPREHENSIVE_E2E_CONFIG.selectors.reports.focusAreaSelect,
  287 |         'overall'
  288 |       );
  289 |       
  290 |       // Start report generation
  291 |       await page.click(COMPREHENSIVE_E2E_CONFIG.selectors.reports.generateButton);
  292 |       
  293 |       // Wait for report completion
  294 |       await expect(page.locator(COMPREHENSIVE_E2E_CONFIG.selectors.reports.status))
  295 |         .toContainText('Generating', { timeout: COMPREHENSIVE_E2E_CONFIG.timeouts.apiResponse });
  296 |       
  297 |       await expect(page.locator(COMPREHENSIVE_E2E_CONFIG.selectors.reports.status))
  298 |         .toContainText('Completed', { timeout: COMPREHENSIVE_E2E_CONFIG.timeouts.report });
  299 |       
  300 |       const reportTime = Date.now() - reportStartTime;
  301 |       console.log(`✅ Report generated in ${reportTime}ms`);
  302 |       
  303 |       // Validate report content
  304 |       const reportContent = await page.locator(COMPREHENSIVE_E2E_CONFIG.selectors.reports.content);
  305 |       await expect(reportContent).toBeVisible();
  306 |       
  307 |       const contentText = await reportContent.textContent();
  308 |       expect(contentText!.length).toBeGreaterThan(1000); // Substantial content
  309 |       expect(contentText).toContain('Competitive Analysis Report');
  310 |       expect(contentText).toContain(COMPREHENSIVE_E2E_CONFIG.testData.project.productName);
  311 |       
  312 |       // Validate consolidated service usage
  313 |       await helper.validateServiceVersion(
  314 |         COMPREHENSIVE_E2E_CONFIG.selectors.reports.serviceVersion,
  315 |         'reporting'
  316 |       );
  317 |       
  318 |       // Test download functionality
  319 |       const downloadPromise = page.waitForEvent('download');
  320 |       await page.click(COMPREHENSIVE_E2E_CONFIG.selectors.reports.downloadButton);
  321 |       const download = await downloadPromise;
  322 |       expect(download.suggestedFilename()).toContain('.md');
  323 |       
  324 |       console.log('✅ Report download functionality validated');
  325 |
  326 |       // Phase 5: Performance Validation
  327 |       const performance = await helper.measurePagePerformance();
  328 |       expect(performance.loadTime).toBeLessThan(5000); // 5 seconds max load time
  329 |       
  330 |       console.log(`🎉 Complete workflow validation successful`, {
  331 |         analysisTime: `${analysisTime}ms`,
  332 |         reportTime: `${reportTime}ms`,
  333 |         pageLoadTime: `${performance.loadTime}ms`,
  334 |         qualityScore: qualityScore
  335 |       });
  336 |     });
  337 |
  338 |     test('should handle concurrent user sessions gracefully', async ({ browser }) => {
  339 |       test.setTimeout(COMPREHENSIVE_E2E_CONFIG.timeouts.workflow);
  340 |       
  341 |       console.log('👥 Testing concurrent user sessions');
  342 |       
  343 |       const sessions = 3;
  344 |       const sessionPromises: Promise<void>[] = [];
  345 |
  346 |       for (let i = 0; i < sessions; i++) {
  347 |         const sessionPromise = (async () => {
  348 |           const context = await browser.newContext();
  349 |           const page = await context.newPage();
  350 |           const sessionHelper = new E2ETestHelper(page);
  351 |           
  352 |           try {
  353 |             await page.goto('/');
  354 |             await sessionHelper.waitForLoadingComplete();
  355 |             
  356 |             // Create unique project for each session
  357 |             const projectName = `${COMPREHENSIVE_E2E_CONFIG.testData.project.name} - Session ${i + 1}`;
  358 |             
> 359 |             await page.click(COMPREHENSIVE_E2E_CONFIG.selectors.navigation.projectsTab);
      |                        ^ TimeoutError: page.click: Timeout 15000ms exceeded.
  360 |             await page.click(COMPREHENSIVE_E2E_CONFIG.selectors.project.createButton);
  361 |             
  362 |             await page.fill(COMPREHENSIVE_E2E_CONFIG.selectors.project.nameInput, projectName);
  363 |             await page.fill(COMPREHENSIVE_E2E_CONFIG.selectors.project.productNameInput, 
  364 |               `${COMPREHENSIVE_E2E_CONFIG.testData.project.productName} ${i + 1}`);
  365 |             await page.fill(COMPREHENSIVE_E2E_CONFIG.selectors.project.productWebsiteInput,
  366 |               `https://session-${i + 1}-test.com`);
  367 |             
  368 |             await page.click(COMPREHENSIVE_E2E_CONFIG.selectors.project.saveButton);
  369 |             await sessionHelper.waitForLoadingComplete();
  370 |             
  371 |             // Validate project creation
  372 |             await expect(page.locator(COMPREHENSIVE_E2E_CONFIG.selectors.common.successMessage))
  373 |               .toBeVisible();
  374 |             
  375 |             console.log(`✅ Session ${i + 1} project created successfully`);
  376 |             
  377 |           } finally {
  378 |             await context.close();
  379 |           }
  380 |         })();
  381 |         
  382 |         sessionPromises.push(sessionPromise);
  383 |       }
  384 |
  385 |       // Wait for all sessions to complete
  386 |       await Promise.all(sessionPromises);
  387 |       
  388 |       console.log(`🎉 All ${sessions} concurrent sessions completed successfully`);
  389 |     });
  390 |   });
  391 |
  392 |   test.describe('2. Error Handling & Recovery', () => {
  393 |     test('should handle network errors gracefully', async ({ page, context }) => {
  394 |       console.log('🚨 Testing network error handling');
  395 |       
  396 |       // Start project creation
  397 |       await page.click(COMPREHENSIVE_E2E_CONFIG.selectors.navigation.projectsTab);
  398 |       await page.click(COMPREHENSIVE_E2E_CONFIG.selectors.project.createButton);
  399 |       
  400 |       // Fill project details
  401 |       await page.fill(
  402 |         COMPREHENSIVE_E2E_CONFIG.selectors.project.nameInput,
  403 |         'Network Error Test Project'
  404 |       );
  405 |       
  406 |       // Simulate network failure
  407 |       await context.setOffline(true);
  408 |       
  409 |       // Attempt to save project
  410 |       await page.click(COMPREHENSIVE_E2E_CONFIG.selectors.project.saveButton);
  411 |       
  412 |       // Should show error message
  413 |       await expect(page.locator(COMPREHENSIVE_E2E_CONFIG.selectors.common.errorMessage))
  414 |         .toBeVisible({ timeout: COMPREHENSIVE_E2E_CONFIG.timeouts.apiResponse });
  415 |       
  416 |       const errorMessage = await page.locator(COMPREHENSIVE_E2E_CONFIG.selectors.common.errorMessage)
  417 |         .textContent();
  418 |       expect(errorMessage).toContain('network');
  419 |       
  420 |       // Restore network and retry
  421 |       await context.setOffline(false);
  422 |       await page.click(COMPREHENSIVE_E2E_CONFIG.selectors.project.saveButton);
  423 |       
  424 |       // Should succeed after network recovery
  425 |       await expect(page.locator(COMPREHENSIVE_E2E_CONFIG.selectors.common.successMessage))
  426 |         .toBeVisible({ timeout: COMPREHENSIVE_E2E_CONFIG.timeouts.apiResponse });
  427 |       
  428 |       console.log('✅ Network error recovery validated');
  429 |     });
  430 |
  431 |     test('should handle analysis service errors gracefully', async ({ page }) => {
  432 |       console.log('🚨 Testing analysis service error handling');
  433 |       
  434 |       // Create minimal project for error testing
  435 |       await page.click(COMPREHENSIVE_E2E_CONFIG.selectors.navigation.projectsTab);
  436 |       await page.click(COMPREHENSIVE_E2E_CONFIG.selectors.project.createButton);
  437 |       
  438 |       await page.fill(
  439 |         COMPREHENSIVE_E2E_CONFIG.selectors.project.nameInput,
  440 |         'Error Test Project'
  441 |       );
  442 |       await page.fill(
  443 |         COMPREHENSIVE_E2E_CONFIG.selectors.project.productNameInput,
  444 |         'Error Test Product'
  445 |       );
  446 |       
  447 |       await page.click(COMPREHENSIVE_E2E_CONFIG.selectors.project.saveButton);
  448 |       await helper.waitForLoadingComplete();
  449 |       
  450 |       // Try to generate analysis without competitors (should trigger error)
  451 |       await page.selectOption(
  452 |         COMPREHENSIVE_E2E_CONFIG.selectors.analysis.typeSelect,
  453 |         'comparative_analysis'
  454 |       );
  455 |       
  456 |       await page.click(COMPREHENSIVE_E2E_CONFIG.selectors.analysis.generateButton);
  457 |       
  458 |       // Should show error about missing competitors
  459 |       await expect(page.locator(COMPREHENSIVE_E2E_CONFIG.selectors.common.errorMessage))
```