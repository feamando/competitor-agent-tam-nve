/**
 * Visual Regression Testing Helper
 * Task 6.2: Cross-Browser Testing
 * 
 * This utility provides functions to perform visual regression testing
 * across different browsers and screen sizes.
 */

import { Page, expect, test } from '@playwright/test';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';
import { generateCorrelationId } from '../../src/lib/logger';

/**
 * Visual regression test configuration
 */
export interface VisualRegressionOptions {
  /** Name of the screenshot for identification */
  name: string;
  
  /** Custom selector to screenshot (default: body) */
  selector?: string;
  
  /** Threshold for pixel difference (0-1) */
  threshold?: number;
  
  /** Maximum allowed pixel difference */
  maxDiffPixels?: number;
  
  /** Whether to mask dynamic content */
  maskDynamicContent?: boolean;
  
  /** Custom folder path for snapshots */
  customSnapshotPath?: string;
  
  /** Add a unique suffix to prevent conflicts */
  uniqueSuffix?: boolean;
}

/**
 * Default options for visual regression testing
 */
const DEFAULT_OPTIONS: Partial<VisualRegressionOptions> = {
  selector: 'body',
  threshold: 0.1, // 10% threshold for differences
  maxDiffPixels: 500,
  maskDynamicContent: true,
  uniqueSuffix: false,
};

/**
 * Generates a snapshot name based on test info and options
 */
export function getSnapshotName(
  name: string, 
  browserName: string, 
  viewport: { width: number, height: number },
  options?: Partial<VisualRegressionOptions>
): string {
  const suffix = options?.uniqueSuffix ? `-${generateCorrelationId().substring(0, 6)}` : '';
  return `${name}-${browserName}-${viewport.width}x${viewport.height}${suffix}.png`;
}

/**
 * Creates directory for snapshots if it doesn't exist
 */
export function ensureSnapshotDirectoryExists(dirPath: string): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Take a screenshot and compare with baseline
 */
export async function compareScreenshot(
  page: Page,
  options: VisualRegressionOptions
): Promise<void> {
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };
  const { name, selector, threshold, maxDiffPixels, maskDynamicContent } = mergedOptions;
  
  // Get browser and viewport info
  const browserName = page.context().browser()?.browserType().name() || 'unknown';
  const viewport = page.viewportSize() || { width: 1920, height: 1080 };
  
  // Determine screenshot path
  const snapshotName = getSnapshotName(name, browserName, viewport, options);
  const customPath = mergedOptions.customSnapshotPath 
    ? path.resolve(process.cwd(), mergedOptions.customSnapshotPath) 
    : path.resolve(process.cwd(), 'e2e/snapshots');
  
  // Ensure directory exists
  ensureSnapshotDirectoryExists(customPath);
  
  // Mask dynamic content if needed
  if (maskDynamicContent) {
    await maskDynamicElements(page);
  }

  // Take screenshot and compare
  const locator = page.locator(selector || 'body');
  await expect(locator).toHaveScreenshot(snapshotName, {
    threshold: threshold,
    maxDiffPixels: maxDiffPixels,
  });
}

/**
 * Mask dynamic elements that may cause false positives
 */
export async function maskDynamicElements(page: Page): Promise<void> {
  // List of selectors for dynamic content that should be masked
  const dynamicElements = [
    // Time-based elements
    '[data-testid="timestamp"]',
    '[data-testid="date"]',
    '.timestamp',
    '.date-time',
    
    // User-specific content
    '[data-testid="user-info"]',
    '.user-avatar',
    
    // Dynamic metrics and counts
    '[data-testid="progress-percentage"]',
    '[data-testid="metrics"]',
    '.count',
    
    // Randomly generated content
    '[data-testid="random-id"]',
    '.random-content',
    
    // Dynamic images and media
    'img[src*="?"]',
    'video',
  ];
  
  for (const selector of dynamicElements) {
    const elements = page.locator(selector);
    const count = await elements.count();
    
    for (let i = 0; i < count; i++) {
      const element = elements.nth(i);
      if (await element.isVisible()) {
        // Add a colored overlay to mask the element
        await element.evaluate((el) => {
          el.style.backgroundColor = 'purple';
          el.style.color = 'purple';
        });
      }
    }
  }
}

/**
 * Take screenshot for multiple viewports
 */
export async function multiViewportScreenshot(
  page: Page, 
  name: string, 
  viewports: Array<{ width: number, height: number }>,
  options?: Partial<VisualRegressionOptions>
): Promise<void> {
  const originalViewport = page.viewportSize();
  
  for (const viewport of viewports) {
    // Set viewport
    await page.setViewportSize(viewport);
    
    // Take screenshot
    await compareScreenshot(page, {
      name: `${name}`,
      uniqueSuffix: false,
      ...options,
    });
  }
  
  // Reset viewport to original
  if (originalViewport) {
    await page.setViewportSize(originalViewport);
  }
}

/**
 * Run visual tests across multiple browsers
 * Note: This should be used in combination with Playwright projects
 */
export function visualTest(
  title: string,
  url: string,
  options: Partial<VisualRegressionOptions> = {}
): void {
  test(title, async ({ page, browserName }) => {
    await page.goto(url);
    
    // Wait for any loading states or animations to complete
    await page.waitForLoadState('networkidle');
    
    // Optional delay to ensure all content is rendered
    await page.waitForTimeout(1000);
    
    await compareScreenshot(page, {
      name: title.replace(/\s+/g, '-').toLowerCase(),
      ...options,
    });
  });
} 