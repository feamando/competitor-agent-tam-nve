// Mock Puppeteer for testing
const mockPage = {
  goto: jest.fn().mockResolvedValue(null),
  content: jest.fn().mockResolvedValue('<html><head><title>Test Page Title</title></head><body><h1>Test Page</h1><p>Test content</p></body></html>'),
  title: jest.fn().mockResolvedValue('Test Page Title'),
  evaluate: jest.fn().mockResolvedValue('Test Page\nTest content'),
  setViewport: jest.fn().mockResolvedValue(undefined),
  setRequestInterception: jest.fn().mockResolvedValue(undefined),
  close: jest.fn().mockResolvedValue(undefined),
  on: jest.fn(),
};

const mockBrowser = {
  newPage: jest.fn().mockResolvedValue(mockPage),
  close: jest.fn().mockResolvedValue(undefined),
};

const puppeteer = {
  launch: jest.fn().mockResolvedValue(mockBrowser),
  Browser: mockBrowser,
  Page: mockPage,
};

module.exports = puppeteer; 