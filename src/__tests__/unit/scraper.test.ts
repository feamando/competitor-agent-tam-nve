import { WebsiteScraper } from '@/lib/scraper';
import puppeteer from 'puppeteer';

describe('WebsiteScraper', () => {
  let scraper: WebsiteScraper;
  let mockBrowser: any;
  let mockPage: any;
  let responseCallback: Function | undefined;
  let requestCallback: Function | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    responseCallback = undefined;
    requestCallback = undefined;

    // Setup mock page
    mockPage = {
      setViewport: jest.fn(),
      setRequestInterception: jest.fn(),
      on: jest.fn().mockImplementation((event: string, callback: Function) => {
        if (event === 'response') {
          responseCallback = callback;
        } else if (event === 'request') {
          requestCallback = callback;
        }
        return mockPage;
      }),
      goto: jest.fn().mockImplementation(async (url: string) => {
        // Simulate response event after navigation
        if (responseCallback) {
          responseCallback({
            url: () => url,
            headers: () => ({
              'content-type': 'text/html',
              'content-length': '1000',
              'last-modified': 'Wed, 21 Oct 2015 07:28:00 GMT',
            }),
            status: () => 200,
          });
        }
        // Simulate request event
        if (requestCallback) {
          requestCallback({
            continue: jest.fn(),
          });
        }
        return null; // HTTPResponse | null
      }),
      content: jest.fn().mockResolvedValue('<html><head><title>Test Page Title</title></head><body><h1>Test Page</h1><p>Test content</p></body></html>'),
      evaluate: jest.fn().mockResolvedValue('Test Page\nTest content'),
      title: jest.fn().mockResolvedValue('Test Page Title'),
      close: jest.fn(),
    } as any;

    // Setup mock browser
    mockBrowser = {
      newPage: jest.fn().mockResolvedValue(mockPage),
      close: jest.fn(),
    } as any;

    // Mock puppeteer.launch
    (puppeteer.launch as jest.Mock).mockResolvedValue(mockBrowser);

    scraper = new WebsiteScraper();
  });

  afterEach(async () => {
    try {
      await scraper.close();
    } catch (error) {
      // Ignore cleanup errors in tests
    }
  });

  describe('Browser Initialization', () => {
    it('should initialize browser with correct options', async () => {
      await scraper.takeSnapshot('https://example.com');

      expect(puppeteer.launch).toHaveBeenCalledWith({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
    });

    it('should reuse existing browser instance', async () => {
      await scraper.takeSnapshot('https://example.com');
      await scraper.takeSnapshot('https://example2.com');

      expect(puppeteer.launch).toHaveBeenCalledTimes(1);
    });
  });

  describe('takeSnapshot', () => {
    it('should take a complete website snapshot', async () => {
      const url = 'https://example.com';

      const snapshot = await scraper.takeSnapshot(url);

      expect(snapshot).toEqual({
        url,
        title: 'Test Page Title',
        description: '',
        html: '<html><head><title>Test Page Title</title></head><body><h1>Test Page</h1><p>Test content</p></body></html>',
        text: 'Test Page\nTest content',
        timestamp: expect.any(Date),
        metadata: {
          headers: {
            'content-type': 'text/html',
            'content-length': '1000',
            'last-modified': 'Wed, 21 Oct 2015 07:28:00 GMT',
          },
          statusCode: 200,
          contentLength: 1000,
          lastModified: 'Wed, 21 Oct 2015 07:28:00 GMT',
        },
      });
    });

    it('should extract meta description when present', async () => {
      const htmlWithMeta = '<html><head><meta name="description" content="Test description"></head><body>Content</body></html>';
      mockPage.content.mockResolvedValue(htmlWithMeta);
      mockPage.title.mockResolvedValue('Test Title');
      mockPage.evaluate.mockResolvedValue('Content');

      const snapshot = await scraper.takeSnapshot('https://example.com');

      expect(snapshot.description).toBe('Test description');
    });

    it('should handle missing meta description', async () => {
      const htmlWithoutMeta = '<html><body>Content</body></html>';
      mockPage.content.mockResolvedValue(htmlWithoutMeta);
      mockPage.title.mockResolvedValue('Test Title');
      mockPage.evaluate.mockResolvedValue('Content');

      const snapshot = await scraper.takeSnapshot('https://example.com');

      expect(snapshot.description).toBe('');
    });

    it('should set viewport correctly', async () => {
      await scraper.takeSnapshot('https://example.com');

      expect(mockPage.setViewport).toHaveBeenCalledWith({
        width: 1920,
        height: 1080,
      });
    });

    it('should enable request interception', async () => {
      await scraper.takeSnapshot('https://example.com');

      expect(mockPage.setRequestInterception).toHaveBeenCalledWith(true);
    });

    it('should navigate to URL with correct options', async () => {
      const url = 'https://example.com';
      await scraper.takeSnapshot(url);

      expect(mockPage.goto).toHaveBeenCalledWith(url, {
        waitUntil: 'networkidle0',
        timeout: 30000,
      });
    });

    it('should close page after snapshot', async () => {
      await scraper.takeSnapshot('https://example.com');

      expect(mockPage.close).toHaveBeenCalled();
    });

    it('should handle navigation errors', async () => {
      const error = new Error('Navigation failed');
      mockPage.goto.mockRejectedValue(error);

      await expect(scraper.takeSnapshot('https://example.com')).rejects.toThrow('Navigation failed');
      expect(mockPage.close).toHaveBeenCalled();
    });

    it('should handle page content extraction errors', async () => {
      const error = new Error('Content extraction failed');
      mockPage.content.mockRejectedValue(error);

      await expect(scraper.takeSnapshot('https://example.com')).rejects.toThrow('Content extraction failed');
      expect(mockPage.close).toHaveBeenCalled();
    });

    it('should handle request events correctly', async () => {
      const mockRequest = {
        continue: jest.fn(),
      };

      // Override the goto mock for this specific test to track request handling
      mockPage.goto.mockImplementation(async (url: string) => {
        // Simulate response event after navigation
        if (responseCallback) {
          responseCallback({
            url: () => url,
            headers: () => ({
              'content-type': 'text/html',
              'content-length': '1000',
              'last-modified': 'Wed, 21 Oct 2015 07:28:00 GMT',
            }),
            status: () => 200,
          });
        }
        // Simulate request event with our tracked mock
        if (requestCallback) {
          requestCallback(mockRequest);
        }
        return null; // HTTPResponse | null
      });

      await scraper.takeSnapshot('https://example.com');

      // Verify request callback was called
      expect(mockRequest.continue).toHaveBeenCalled();
    });

    it('should capture response headers and status', async () => {
      const url = 'https://example.com';
      const expectedHeaders = {
        'content-type': 'text/html',
        'content-length': '2000',
      };
      const expectedStatus = 200;

      // Override the goto mock for this specific test
      mockPage.goto.mockImplementation(async (testUrl: string) => {
        if (responseCallback) {
          responseCallback({
            url: () => testUrl,
            headers: () => expectedHeaders,
            status: () => expectedStatus,
          });
        }
        return null; // HTTPResponse | null
      });

      const snapshot = await scraper.takeSnapshot(url);

      expect(snapshot.metadata.headers).toEqual(expectedHeaders);
      expect(snapshot.metadata.statusCode).toBe(expectedStatus);
    });

    it('should handle different status codes', async () => {
      const url = 'https://example.com';
      
      // Override the goto mock for this specific test
      mockPage.goto.mockImplementation(async (testUrl: string) => {
        if (responseCallback) {
          responseCallback({
            url: () => testUrl,
            headers: () => ({}),
            status: () => 404,
          });
        }
        return null; // HTTPResponse | null
      });

      const snapshot = await scraper.takeSnapshot(url);

      expect(snapshot.metadata.statusCode).toBe(404);
    });
  });

  describe('Content Parsing', () => {
    it('should handle special characters in content', async () => {
      const specialHtml = '<html><head><title>Special & Characters</title></head><body>Content with émojis 🚀</body></html>';
      mockPage.content.mockResolvedValue(specialHtml);
      mockPage.title.mockResolvedValue('Special & Characters');
      mockPage.evaluate.mockResolvedValue('Content with émojis 🚀');

      const snapshot = await scraper.takeSnapshot('https://example.com');

      expect(snapshot.title).toBe('Special & Characters');
      expect(snapshot.text).toBe('Content with émojis 🚀');
    });

    it('should handle empty content gracefully', async () => {
      mockPage.content.mockResolvedValue('<html></html>');
      mockPage.title.mockResolvedValue('');
      mockPage.evaluate.mockResolvedValue('');

      const snapshot = await scraper.takeSnapshot('https://example.com');

      expect(snapshot.title).toBe('');
      expect(snapshot.text).toBe('');
      expect(snapshot.description).toBe('');
    });
  });

  describe('close', () => {
    it('should close browser when it exists', async () => {
      // Initialize browser by taking a snapshot
      await scraper.takeSnapshot('https://example.com');
      
      await scraper.close();

      expect(mockBrowser.close).toHaveBeenCalled();
    });

    it('should handle close when browser does not exist', async () => {
      await scraper.close();

      expect(mockBrowser.close).not.toHaveBeenCalled();
    });

    it('should handle browser close errors', async () => {
      // Initialize browser
      await scraper.takeSnapshot('https://example.com');
      
      const error = new Error('Close failed');
      mockBrowser.close.mockRejectedValue(error);

      await expect(scraper.close()).rejects.toThrow('Close failed');
    });

    it('should set browser to null after closing', async () => {
      // Initialize browser
      await scraper.takeSnapshot('https://example.com');
      
      await scraper.close();

      // Taking another snapshot should initialize a new browser
      await scraper.takeSnapshot('https://example.com');
      
      expect(puppeteer.launch).toHaveBeenCalledTimes(2);
    });
  });
}); 