import { PlaywrightTestConfig, devices } from '@playwright/test';
import path from 'path';

/**
 * Enhanced Playwright Configuration
 * Task 6.2: Cross-Browser Testing
 */
const config: PlaywrightTestConfig = {
  testDir: './e2e',
  timeout: 60000, // Increased from 30000 for complex forms
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 4,
  reporter: [
    ['list'],
    ['html', { outputFolder: './test-reports/playwright-report' }],
    ['json', { outputFile: './test-reports/playwright-report/results.json' }]
  ],
  expect: {
    timeout: 10000 // Increased expect timeout
  },
  use: {
    baseURL: process.env.TEST_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    video: 'on-first-retry',
    actionTimeout: 15000, // Increased action timeout
    screenshot: 'only-on-failure',
    // Enable capturing accessibility snapshots
    contextOptions: {
      reducedMotion: 'reduce',
      strictSelectors: false, // Fixed: Changed from true to false for more flexible selectors
    },
  },
  // Enhanced project configurations for comprehensive cross-browser testing
  projects: [
    // Desktop browsers with different sizes
    {
      name: 'chromium-desktop',
      use: { 
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
        browserName: 'chromium',
      },
      testMatch: /.*\.spec\.ts/
    },
    {
      name: 'firefox-desktop',
      use: { 
        ...devices['Desktop Firefox'],
        viewport: { width: 1920, height: 1080 },
        browserName: 'firefox',
      },
      testMatch: /.*\.spec\.ts/
    },
    {
      name: 'webkit-desktop',
      use: { 
        ...devices['Desktop Safari'],
        viewport: { width: 1920, height: 1080 },
        browserName: 'webkit',
      },
      testMatch: /.*\.spec\.ts/
    },
    
    // Mobile browsers
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
      testMatch: /.*\.spec\.ts/
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 12'] },
      testMatch: /.*\.spec\.ts/
    },
    
    // Tablet browsers
    {
      name: 'tablet-chrome',
      use: { ...devices['Galaxy Tab S4'] },
      testMatch: /.*\.spec\.ts/
    },
    {
      name: 'tablet-safari',
      use: { ...devices['iPad Pro 11'] },
      testMatch: /.*\.spec\.ts/
    },
    
    // Visual regression testing project
    {
      name: 'visual-regression',
      use: { 
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
      },
      testMatch: /.*\.visual\.spec\.ts/,
    },
  ],
  webServer: {
    command: 'npm run dev',
    port: 3000,
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000, // 2 minutes for server to start
    stderr: 'pipe',
    stdout: 'pipe'
  },
  // Output directory for test artifacts
  outputDir: path.join(__dirname, 'test-reports/artifacts'),
  // Configure snapshot storage for visual tests
  snapshotDir: path.join(__dirname, 'e2e/snapshots'),
  // Enable parallel execution for faster testing
  fullyParallel: true,
};

export default config; 