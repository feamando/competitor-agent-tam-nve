# Test info

- Name: Phase 5.4: Immediate Reports E2E Tests >> Happy Path User Journey >> should show meaningful progress indicators during generation
- Location: /Users/troy.edwards/code/competitor-agent-tam-nve/e2e/immediateReports.spec.ts:166:9

# Error details

```
TimeoutError: page.fill: Timeout 15000ms exceeded.
Call log:
  - waiting for locator('[data-testid="product-website"]')

    at /Users/troy.edwards/code/competitor-agent-tam-nve/e2e/immediateReports.spec.ts:173:18
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
  - textbox "Project Name *": Progress Test 1753963769114
  - text: Description
  - textbox "Description"
  - text: Priority
  - combobox "Priority":
    - option "Low"
    - option "Medium" [selected]
    - option "High"
    - option "Urgent"
  - text: Tags
  - textbox "Add a tag"
  - button "Add"
  - button "Previous" [disabled]
  - button "Next"
  - paragraph:
    - text: Need help? Check out our
    - link "project creation guide":
      - /url: /help/immediate-reports
    - text: or
    - link "contact support":
      - /url: /support
    - text: .
- alert
- button "Open Next.js Dev Tools":
  - img
```

# Test source

```ts
   73 |       await page.fill('[data-testid="product-website"]', E2E_CONFIG.testData.productWebsite);
   74 |
   75 |       // 3. Add competitors
   76 |       for (let i = 0; i < E2E_CONFIG.testData.competitors.length; i++) {
   77 |         const competitor = E2E_CONFIG.testData.competitors[i];
   78 |         
   79 |         if (i > 0) {
   80 |           await page.click('[data-testid="add-competitor"]');
   81 |         }
   82 |         
   83 |         await page.fill(`[data-testid="competitor-name-${i}"]`, competitor.name);
   84 |         await page.fill(`[data-testid="competitor-website-${i}"]`, competitor.website);
   85 |       }
   86 |
   87 |       // 4. Configure immediate report generation
   88 |       await expect(page.locator('[data-testid="generate-initial-report"]')).toBeChecked(); // Default enabled
   89 |       await page.selectOption('[data-testid="report-template"]', 'comprehensive');
   90 |
   91 |       // 5. Submit project creation form
   92 |       await page.click('[data-testid="create-project"]');
   93 |
   94 |       // 6. Wait for redirect to project page
   95 |       await page.waitForURL(/\/projects\/.*/, { 
   96 |         timeout: E2E_CONFIG.timeouts.navigation 
   97 |       });
   98 |
   99 |       // Extract project ID from URL for cleanup
  100 |       const projectId = page.url().split('/projects/')[1]?.split('?')[0] || 'unknown';
  101 |       if (projectId !== 'unknown') {
  102 |         testProjectIds.push(projectId);
  103 |       }
  104 |
  105 |       // 7. Verify immediate report generation indicators
  106 |       await expect(page.locator('[data-testid="initial-report-indicator"]')).toBeVisible({
  107 |         timeout: E2E_CONFIG.timeouts.elementInteraction
  108 |       });
  109 |
  110 |       // 8. Watch real-time progress updates
  111 |       const progressIndicator = page.locator('[data-testid="progress-indicator"]');
  112 |       await expect(progressIndicator).toBeVisible();
  113 |
  114 |       // Verify progress phases
  115 |       await expect(page.locator('[data-testid="phase-validation"]')).toBeVisible();
  116 |       await expect(page.locator('[data-testid="phase-snapshot-capture"]')).toBeVisible({
  117 |         timeout: E2E_CONFIG.timeouts.elementInteraction
  118 |       });
  119 |       
  120 |       // 9. Wait for snapshot capture progress
  121 |       const snapshotProgress = page.locator('[data-testid="snapshot-progress"]');
  122 |       await expect(snapshotProgress).toBeVisible();
  123 |       
  124 |       // Verify competitor snapshot capture status
  125 |       await expect(page.locator('[data-testid="competitor-snapshots-status"]')).toContainText('Capturing');
  126 |
  127 |       // 10. Wait for analysis phase
  128 |       await expect(page.locator('[data-testid="phase-analysis"]')).toBeVisible({
  129 |         timeout: E2E_CONFIG.timeouts.elementInteraction
  130 |       });
  131 |
  132 |       // 11. Wait for report generation completion
  133 |       await expect(page.locator('[data-testid="report-completed"]')).toBeVisible({
  134 |         timeout: E2E_CONFIG.timeouts.reportGeneration
  135 |       });
  136 |
  137 |       // 12. Verify report quality indicators
  138 |       const completenessScore = page.locator('[data-testid="report-completeness-score"]');
  139 |       await expect(completenessScore).toBeVisible();
  140 |       
  141 |       const dataFreshnessIndicator = page.locator('[data-testid="data-freshness-indicator"]');
  142 |       await expect(dataFreshnessIndicator).toBeVisible();
  143 |       await expect(dataFreshnessIndicator).toContainText(/Fresh|New/); // Should use fresh snapshots
  144 |
  145 |       const snapshotCaptureStatus = page.locator('[data-testid="snapshot-capture-status"]');
  146 |       await expect(snapshotCaptureStatus).toBeVisible();
  147 |
  148 |       // 13. Verify report content is accessible
  149 |       await page.click('[data-testid="view-report"]');
  150 |       
  151 |       const reportContent = page.locator('[data-testid="report-content"]');
  152 |       await expect(reportContent).toBeVisible();
  153 |       await expect(reportContent).toContainText('Executive Summary');
  154 |       await expect(reportContent).toContainText('Competitive Analysis');
  155 |
  156 |       // 14. Verify fresh data indicators in report
  157 |       await expect(page.locator('[data-testid="fresh-data-indicator"]')).toBeVisible();
  158 |       await expect(page.locator('[data-testid="snapshot-timestamp"]')).toBeVisible();
  159 |
  160 |       logger.info('Happy path E2E test completed successfully', {
  161 |         projectId,
  162 |         testDuration: Date.now()
  163 |       });
  164 |     });
  165 |
  166 |     test('should show meaningful progress indicators during generation', async ({ page }) => {
  167 |       test.setTimeout(E2E_CONFIG.timeouts.reportGeneration);
  168 |
  169 |       await page.goto('/projects/new');
  170 |
  171 |       // Fill minimal form data
  172 |       await page.fill('[data-testid="project-name"]', `Progress Test ${Date.now()}`);
> 173 |       await page.fill('[data-testid="product-website"]', 'https://progress-test.com');
      |                  ^ TimeoutError: page.fill: Timeout 15000ms exceeded.
  174 |       
  175 |       // Add one competitor for faster testing
  176 |       await page.fill('[data-testid="competitor-name-0"]', 'Progress Competitor');
  177 |       await page.fill('[data-testid="competitor-website-0"]', 'https://progress-competitor.com');
  178 |
  179 |       await page.click('[data-testid="create-project"]');
  180 |       await page.waitForURL(/\/projects\/.*/, { timeout: E2E_CONFIG.timeouts.navigation });
  181 |
  182 |       const projectId = page.url().split('/projects/')[1];
  183 |       testProjectIds.push(projectId);
  184 |
  185 |       // Verify progress phases appear in order
  186 |       const phases = [
  187 |         'phase-validation',
  188 |         'phase-snapshot-capture', 
  189 |         'phase-analysis',
  190 |         'phase-generation'
  191 |       ];
  192 |
  193 |       for (const phase of phases) {
  194 |         await expect(page.locator(`[data-testid="${phase}"]`)).toBeVisible({
  195 |           timeout: E2E_CONFIG.timeouts.elementInteraction
  196 |         });
  197 |         
  198 |         // Verify phase has active state
  199 |         await expect(page.locator(`[data-testid="${phase}"]`)).toHaveClass(/active|current/);
  200 |       }
  201 |
  202 |       // Verify estimated time indicators
  203 |       await expect(page.locator('[data-testid="estimated-completion-time"]')).toBeVisible();
  204 |
  205 |       // Verify progress percentage
  206 |       const progressPercentage = page.locator('[data-testid="progress-percentage"]');
  207 |       await expect(progressPercentage).toBeVisible();
  208 |       
  209 |       // Progress should start low and increase
  210 |       const initialProgress = await progressPercentage.textContent();
  211 |       expect(parseInt(initialProgress || '0')).toBeLessThan(50);
  212 |
  213 |       // Wait for completion
  214 |       await expect(page.locator('[data-testid="report-completed"]')).toBeVisible({
  215 |         timeout: E2E_CONFIG.timeouts.reportGeneration
  216 |       });
  217 |
  218 |       const finalProgress = await progressPercentage.textContent();
  219 |       expect(parseInt(finalProgress || '0')).toBe(100);
  220 |     });
  221 |   });
  222 |
  223 |   test.describe('Error Scenarios and Recovery', () => {
  224 |     test('should handle competitor snapshot capture failures gracefully', async ({ page }) => {
  225 |       test.setTimeout(E2E_CONFIG.timeouts.reportGeneration);
  226 |
  227 |       await page.goto('/projects/new');
  228 |
  229 |       // Create project with potentially problematic competitor URLs
  230 |       await page.fill('[data-testid="project-name"]', `Error Test ${Date.now()}`);
  231 |       await page.fill('[data-testid="product-website"]', 'https://error-test.com');
  232 |       
  233 |       // Add competitor with unreachable URL
  234 |       await page.fill('[data-testid="competitor-name-0"]', 'Unreachable Competitor');
  235 |       await page.fill('[data-testid="competitor-website-0"]', 'https://unreachable-competitor-12345.com');
  236 |
  237 |       await page.click('[data-testid="create-project"]');
  238 |       await page.waitForURL(/\/projects\/.*/, { timeout: E2E_CONFIG.timeouts.navigation });
  239 |
  240 |       const projectId = page.url().split('/projects/')[1];
  241 |       testProjectIds.push(projectId);
  242 |
  243 |       // Wait for snapshot capture to attempt and potentially fail
  244 |       await expect(page.locator('[data-testid="phase-snapshot-capture"]')).toBeVisible();
  245 |
  246 |       // Should proceed with partial data even if snapshots fail
  247 |       await expect(page.locator('[data-testid="partial-data-indicator"]')).toBeVisible({
  248 |         timeout: E2E_CONFIG.timeouts.elementInteraction
  249 |       });
  250 |
  251 |       // Verify fallback message is shown
  252 |       await expect(page.locator('[data-testid="snapshot-failure-message"]')).toBeVisible();
  253 |       await expect(page.locator('[data-testid="snapshot-failure-message"]')).toContainText(/capture failed|using existing data/i);
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
```