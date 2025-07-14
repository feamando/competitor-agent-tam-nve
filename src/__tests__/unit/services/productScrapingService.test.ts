import { ProductScrapingService } from '@/services/productScrapingService';
import { Product, ProductSnapshot } from '@/types/product';

// Bypass the global mock for this specific test
jest.unmock('@/services/productScrapingService');

// Mock the dependencies
jest.mock('@/lib/repositories', () => ({
  productRepository: {
    findByWebsite: jest.fn(),
    findById: jest.fn(),
    list: jest.fn(),
  },
  productSnapshotRepository: {
    create: jest.fn(),
    findByProductId: jest.fn(),
  },
}));

// Mock the scraper functions
jest.mock('@/lib/scraper', () => ({
  WebsiteScraper: jest.fn().mockImplementation(() => ({
    takeSnapshot: jest.fn(),
    close: jest.fn(),
  })),
}));

// Mock setTimeout to avoid actual delays in tests
jest.useFakeTimers();

const { productRepository, productSnapshotRepository } = require('@/lib/repositories');
const { WebsiteScraper } = require('@/lib/scraper');

const mockTakeSnapshot = jest.fn();
const mockClose = jest.fn();

const mockWebsiteScraper = WebsiteScraper as jest.MockedClass<typeof WebsiteScraper>;

const mockProductRepository = productRepository as jest.Mocked<typeof productRepository>;
const mockProductSnapshotRepository = productSnapshotRepository as jest.Mocked<typeof productSnapshotRepository>;

describe('ProductScrapingService', () => {
  let productScrapingService: ProductScrapingService;
  let mockProduct: Product;
  let mockProductSnapshot: ProductSnapshot;
  let mockWebsiteSnapshot: any;

  beforeEach(() => {
    // Set up mock implementations before creating the service
    (WebsiteScraper as jest.MockedClass<typeof WebsiteScraper>).mockImplementation(() => ({
      takeSnapshot: mockTakeSnapshot,
      close: mockClose,
    } as any));
    
    productScrapingService = new ProductScrapingService();
    
    mockProduct = {
      id: 'prod_123',
      name: 'HelloFresh',
      website: 'https://hellofresh.com',
      positioning: 'Leading meal kit delivery service',
      customerData: '500k+ customers',
      userProblem: 'Time constraints',
      industry: 'Food Technology',
      projectId: 'proj_456',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    mockProductSnapshot = {
      id: 'snap_789',
      productId: 'prod_123',
      content: {
        html: '<html><head><title>HelloFresh - Fresh Ingredients</title></head><body><h1>HelloFresh</h1><p>Get fresh ingredients delivered to your door. We provide meal kits with pre-portioned ingredients and easy-to-follow recipes. Join millions of satisfied customers who love our convenient meal delivery service.</p><div class="features"><h2>Why Choose HelloFresh?</h2><ul><li>Fresh, high-quality ingredients</li><li>Easy-to-follow recipes</li><li>Flexible meal plans</li><li>Convenient delivery</li></ul></div></body></html>',
        text: 'HelloFresh - Fresh Ingredients HelloFresh Get fresh ingredients delivered to your door. We provide meal kits with pre-portioned ingredients and easy-to-follow recipes. Join millions of satisfied customers who love our convenient meal delivery service. Why Choose HelloFresh? Fresh, high-quality ingredients Easy-to-follow recipes Flexible meal plans Convenient delivery',
        title: 'HelloFresh - Fresh Ingredients',
        description: 'Get fresh ingredients delivered',
        url: 'https://hellofresh.com',
        timestamp: new Date()
      },
      metadata: {
        headers: { 'content-type': 'text/html' },
        statusCode: 200,
        contentLength: 1000,
        scrapingTimestamp: new Date(),
        scrapingMethod: 'automated',
        textLength: 100,
        htmlLength: 1000
      },
      createdAt: new Date()
    };

    mockWebsiteSnapshot = {
      url: 'https://hellofresh.com',
      title: 'HelloFresh - Fresh Ingredients',
      description: 'Get fresh ingredients delivered',
      html: '<html><head><title>HelloFresh - Fresh Ingredients</title></head><body><h1>HelloFresh</h1><p>Get fresh ingredients delivered to your door. We provide meal kits with pre-portioned ingredients and easy-to-follow recipes. Join millions of satisfied customers who love our convenient meal delivery service.</p><div class="features"><h2>Why Choose HelloFresh?</h2><ul><li>Fresh, high-quality ingredients</li><li>Easy-to-follow recipes</li><li>Flexible meal plans</li><li>Convenient delivery</li></ul></div></body></html>',
      text: 'HelloFresh - Fresh Ingredients HelloFresh Get fresh ingredients delivered to your door. We provide meal kits with pre-portioned ingredients and easy-to-follow recipes. Join millions of satisfied customers who love our convenient meal delivery service. Why Choose HelloFresh? Fresh, high-quality ingredients Easy-to-follow recipes Flexible meal plans Convenient delivery',
      timestamp: new Date(),
      metadata: {
        headers: { 'content-type': 'text/html' },
        statusCode: 200,
        contentLength: 1000,
        lastModified: 'Mon, 01 Jan 2024 00:00:00 GMT'
      }
    };

    // Reset all mocks completely to prevent cross-test contamination
    jest.clearAllMocks();
    mockTakeSnapshot.mockClear();
    mockClose.mockClear();
    mockProductRepository.findByWebsite.mockClear();
    mockProductRepository.findById.mockClear();
    mockProductRepository.list.mockClear();
    mockProductSnapshotRepository.create.mockClear();
    mockProductSnapshotRepository.findByProductId.mockClear();
    
    // Reset mock implementations to defaults
    mockTakeSnapshot.mockReset();
    mockClose.mockReset();
    mockProductRepository.findByWebsite.mockReset();
    mockProductRepository.findById.mockReset();
    mockProductRepository.list.mockReset();
    mockProductSnapshotRepository.create.mockReset();
    mockProductSnapshotRepository.findByProductId.mockReset();
    
    // Clear any pending timers
    jest.clearAllTimers();
  });

  afterEach(() => {
    // Run any pending timers and clear them
    jest.runOnlyPendingTimers();
    jest.clearAllTimers();
  });

  afterAll(() => {
    // Restore real timers after all tests
    jest.useRealTimers();
  });

  describe('scrapeProduct', () => {
    it('should successfully scrape a product website and store snapshot', async () => {
      // Setup mocks - scrapeProduct calls findByWebsite, then scrapeProductWebsite calls findById
      mockProductRepository.findByWebsite.mockResolvedValue(mockProduct);
      mockProductRepository.findById.mockResolvedValue(mockProduct);
      mockTakeSnapshot.mockResolvedValue(mockWebsiteSnapshot);
      mockProductSnapshotRepository.create.mockResolvedValue(mockProductSnapshot);

      // Execute
      const result = await productScrapingService.scrapeProduct('https://hellofresh.com');

      // Verify
      expect(mockProductRepository.findByWebsite).toHaveBeenCalledWith('https://hellofresh.com');
      expect(mockProductRepository.findById).toHaveBeenCalledWith('prod_123');
      expect(mockTakeSnapshot).toHaveBeenCalledWith('https://hellofresh.com');
      expect(mockProductSnapshotRepository.create).toHaveBeenCalledWith(expect.objectContaining({
        productId: 'prod_123',
        content: expect.objectContaining({
          html: mockWebsiteSnapshot.html,
          text: mockWebsiteSnapshot.text,
          title: mockWebsiteSnapshot.title,
          url: mockWebsiteSnapshot.url
        }),
        metadata: expect.objectContaining({
          contentLength: mockWebsiteSnapshot.html.length,
          textLength: mockWebsiteSnapshot.text.length,
          htmlLength: mockWebsiteSnapshot.html.length
        })
      }));
      expect(result).toEqual(mockProductSnapshot);
    });

    it('should throw error when product not found for URL', async () => {
      mockProductRepository.findByWebsite.mockResolvedValue(null);

      await expect(
        productScrapingService.scrapeProduct('https://nonexistent.com')
      ).rejects.toThrow(/No product found.*website.*nonexistent\.com/i);

      expect(mockProductRepository.findByWebsite).toHaveBeenCalledWith('https://nonexistent.com');
      expect(mockTakeSnapshot).not.toHaveBeenCalled();
      expect(mockProductSnapshotRepository.create).not.toHaveBeenCalled();
    });

    it('should propagate website scraper errors', async () => {
      // Temporarily use real timers for this test to handle retry logic properly
      jest.useRealTimers();
      
      const scrapingError = new Error('Failed to load page');
      mockProductRepository.findByWebsite.mockResolvedValue(mockProduct);
      mockProductRepository.findById.mockResolvedValue(mockProduct);
      mockTakeSnapshot.mockRejectedValue(scrapingError);

      // Test that the error is properly propagated after retries
      await expect(
        productScrapingService.scrapeProduct('https://hellofresh.com')
      ).rejects.toThrow(/All.*scraping attempts failed.*Failed to load page/i);

      expect(mockProductRepository.findByWebsite).toHaveBeenCalledWith('https://hellofresh.com');
      expect(mockProductRepository.findById).toHaveBeenCalledWith('prod_123');
      expect(mockTakeSnapshot).toHaveBeenCalledWith('https://hellofresh.com');
      expect(mockTakeSnapshot).toHaveBeenCalledTimes(3); // Should retry 3 times
      expect(mockProductSnapshotRepository.create).not.toHaveBeenCalled();
      
      // Restore fake timers for other tests
      jest.useFakeTimers();
    }, 15000);

    it('should propagate snapshot storage errors', async () => {
      const storageError = new Error('Database connection failed');
      mockProductRepository.findByWebsite.mockResolvedValue(mockProduct);
      mockProductRepository.findById.mockResolvedValue(mockProduct);
      mockTakeSnapshot.mockResolvedValue(mockWebsiteSnapshot);
      mockProductSnapshotRepository.create.mockRejectedValue(storageError);

      await expect(
        productScrapingService.scrapeProduct('https://hellofresh.com')
      ).rejects.toThrow('Database connection failed');

      expect(mockProductSnapshotRepository.create).toHaveBeenCalled();
    });
  });

  describe('scrapeProductById', () => {
    it('should successfully scrape product by ID', async () => {
      // scrapeProductById calls findById, then scrapeProductWebsite calls findById again
      // So we expect 2 calls to findById total
      mockProductRepository.findById.mockResolvedValue(mockProduct);
      mockTakeSnapshot.mockResolvedValue(mockWebsiteSnapshot);
      mockProductSnapshotRepository.create.mockResolvedValue(mockProductSnapshot);

      const result = await productScrapingService.scrapeProductById('prod_123');

      expect(mockProductRepository.findById).toHaveBeenCalledWith('prod_123');
      expect(mockProductRepository.findById).toHaveBeenCalledTimes(2); // Called twice due to service flow
      expect(mockTakeSnapshot).toHaveBeenCalledWith('https://hellofresh.com');
      expect(result).toEqual(mockProductSnapshot);
    });

    it('should throw error when product not found by ID', async () => {
      mockProductRepository.findById.mockResolvedValue(null);

      await expect(
        productScrapingService.scrapeProductById('nonexistent')
      ).rejects.toThrow('Product not found with ID: nonexistent');

      expect(mockProductRepository.findById).toHaveBeenCalledWith('nonexistent');
      expect(mockTakeSnapshot).not.toHaveBeenCalled();
    });
  });

  describe('triggerManualProductScraping', () => {
    it('should scrape all products in a project', async () => {
      const products = [
        { ...mockProduct, id: 'prod_1', name: 'Product 1', website: 'https://product1.com', projectId: 'proj_456' },
        { ...mockProduct, id: 'prod_2', name: 'Product 2', website: 'https://product2.com', projectId: 'proj_456' },
      ];

      const snapshots = [
        { ...mockProductSnapshot, id: 'snap_1', productId: 'prod_1' },
        { ...mockProductSnapshot, id: 'snap_2', productId: 'prod_2' },
      ];

      // Mock the repository calls
      mockProductRepository.list.mockResolvedValue(products);
      
      // Each product gets scraped: triggerManualProductScraping -> scrapeProductById -> scrapeProductWebsite -> findById
      // So for 2 products, we expect 4 calls to findById (2 per product)
      mockProductRepository.findById
        .mockResolvedValueOnce(products[0]) // scrapeProductById call
        .mockResolvedValueOnce(products[0]) // scrapeProductWebsite call
        .mockResolvedValueOnce(products[1]) // scrapeProductById call
        .mockResolvedValueOnce(products[1]); // scrapeProductWebsite call
      
      // Mock successful scraping for both products
      mockTakeSnapshot
        .mockResolvedValueOnce({ ...mockWebsiteSnapshot, url: 'https://product1.com' })
        .mockResolvedValueOnce({ ...mockWebsiteSnapshot, url: 'https://product2.com' });
      
      // Mock successful snapshot creation for both products
      mockProductSnapshotRepository.create
        .mockResolvedValueOnce(snapshots[0])
        .mockResolvedValueOnce(snapshots[1]);

      const result = await productScrapingService.triggerManualProductScraping('proj_456');

      expect(mockProductRepository.list).toHaveBeenCalled();
      expect(mockProductRepository.findById).toHaveBeenCalledTimes(4); // 2 calls per product
      expect(mockTakeSnapshot).toHaveBeenCalledTimes(2);
      expect(mockProductSnapshotRepository.create).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(2);
      expect(result).toEqual(snapshots);
    }, 10000);

    it('should handle empty project with no products', async () => {
      mockProductRepository.list.mockResolvedValue([]);

      const result = await productScrapingService.triggerManualProductScraping('proj_empty');

      expect(mockProductRepository.list).toHaveBeenCalled();
      expect(result).toEqual([]);
      expect(mockTakeSnapshot).not.toHaveBeenCalled();
    });

    it('should continue scraping other products when one fails', async () => {
      const products = [
        { ...mockProduct, id: 'prod_1', name: 'Product 1', website: 'https://product1.com', projectId: 'proj_456' },
        { ...mockProduct, id: 'prod_2', name: 'Product 2', website: 'https://product2.com', projectId: 'proj_456' },
      ];

      const successfulSnapshot = { ...mockProductSnapshot, id: 'snap_2', productId: 'prod_2' };

      mockProductRepository.list.mockResolvedValue(products);
      
      // First product fails during findById call
      mockProductRepository.findById
        .mockRejectedValueOnce(new Error('Scraping failed for product 1'))
        .mockResolvedValueOnce(products[1]) // Second product succeeds (scrapeProductById)
        .mockResolvedValueOnce(products[1]); // Second product succeeds (scrapeProductWebsite)
      
      // Only second product gets scraped successfully
      mockTakeSnapshot
        .mockResolvedValueOnce({ ...mockWebsiteSnapshot, url: 'https://product2.com' });
      
      // Only second product creates a snapshot
      mockProductSnapshotRepository.create
        .mockResolvedValueOnce(successfulSnapshot);

      const result = await productScrapingService.triggerManualProductScraping('proj_456');

      expect(mockProductRepository.list).toHaveBeenCalled();
      expect(mockProductRepository.findById).toHaveBeenCalledTimes(3); // First fails, second succeeds (2 calls)
      expect(mockTakeSnapshot).toHaveBeenCalledTimes(1); // Only successful product scraped
      expect(mockProductSnapshotRepository.create).toHaveBeenCalledTimes(1); // Only successful snapshot created
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(successfulSnapshot);
    }, 10000);
  });

  describe('getProductScrapingStatus', () => {
    it('should return correct status for project with products and snapshots', async () => {
      const products = [
        { ...mockProduct, id: 'prod_1', projectId: 'proj_456' },
        { ...mockProduct, id: 'prod_2', projectId: 'proj_456' },
      ];

      const snapshots1 = [
        { ...mockProductSnapshot, id: 'snap_1', productId: 'prod_1', createdAt: new Date('2024-01-01') },
        { ...mockProductSnapshot, id: 'snap_2', productId: 'prod_1', createdAt: new Date('2024-01-02') },
      ];

      const snapshots2 = [
        { ...mockProductSnapshot, id: 'snap_3', productId: 'prod_2', createdAt: new Date('2024-01-03') },
      ];

      mockProductRepository.list.mockResolvedValue(products);
      mockProductSnapshotRepository.findByProductId
        .mockResolvedValueOnce(snapshots1)
        .mockResolvedValueOnce(snapshots2);

      const result = await productScrapingService.getProductScrapingStatus('proj_456');

      expect(result).toEqual({
        productCount: 2,
        lastScraped: new Date('2024-01-03'),
        totalSnapshots: 3
      });
    });

    it('should return status for project with no snapshots', async () => {
      const products = [{ ...mockProduct, id: 'prod_1', projectId: 'proj_456' }];

      mockProductRepository.list.mockResolvedValue(products);
      mockProductSnapshotRepository.findByProductId.mockResolvedValue([]);

      const result = await productScrapingService.getProductScrapingStatus('proj_456');

      expect(result).toEqual({
        productCount: 1,
        lastScraped: undefined,
        totalSnapshots: 0
      });
    });

    it('should handle errors gracefully', async () => {
      mockProductRepository.list.mockRejectedValue(new Error('Database error'));

      const result = await productScrapingService.getProductScrapingStatus('proj_456');

      expect(result).toEqual({
        productCount: 0,
        totalSnapshots: 0
      });
    });
  });

  describe('cleanup', () => {
    it('should close the website scraper', async () => {
      await productScrapingService.cleanup();

      expect(mockClose).toHaveBeenCalled();
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete product scraping workflow', async () => {
      // Test the full workflow: scrape product → get status
      mockProductRepository.findByWebsite.mockResolvedValue(mockProduct);
      mockProductRepository.findById.mockResolvedValue(mockProduct);
      mockTakeSnapshot.mockResolvedValue(mockWebsiteSnapshot);
      mockProductSnapshotRepository.create.mockResolvedValue(mockProductSnapshot);

      // Step 1: Scrape a product
      const snapshot = await productScrapingService.scrapeProduct('https://hellofresh.com');
      expect(snapshot.productId).toBe('prod_123');
      expect(snapshot.content.html).toBe(mockWebsiteSnapshot.html);

      // Step 2: Check status - ensure product has correct projectId
      const productWithProjectId = { ...mockProduct, projectId: 'proj_456' };
      mockProductRepository.list.mockResolvedValue([productWithProjectId]);
      mockProductSnapshotRepository.findByProductId.mockResolvedValue([snapshot]);

      const status = await productScrapingService.getProductScrapingStatus('proj_456');
      expect(status.productCount).toBe(1);
      expect(status.totalSnapshots).toBe(1);
    }, 10000);

    it('should handle error recovery in manual scraping', async () => {
      const products = [
        { ...mockProduct, id: 'prod_1', website: 'https://working.com', projectId: 'proj_456' },
        { ...mockProduct, id: 'prod_2', website: 'https://broken.com', projectId: 'proj_456' },
        { ...mockProduct, id: 'prod_3', website: 'https://another.com', projectId: 'proj_456' },
      ];

      const snapshot1 = { ...mockProductSnapshot, id: 'snap_1', productId: 'prod_1' };
      const snapshot3 = { ...mockProductSnapshot, id: 'snap_3', productId: 'prod_3' };

      mockProductRepository.list.mockResolvedValue(products);
      
      // First product succeeds - 2 calls to findById
      mockProductRepository.findById.mockResolvedValueOnce(products[0]); // scrapeProductById
      mockProductRepository.findById.mockResolvedValueOnce(products[0]); // scrapeProductWebsite
      mockTakeSnapshot.mockResolvedValueOnce(mockWebsiteSnapshot);
      mockProductSnapshotRepository.create.mockResolvedValueOnce(snapshot1);

      // Second product fails during first findById call
      mockProductRepository.findById.mockRejectedValueOnce(new Error('Network error'));

      // Third product succeeds - 2 calls to findById
      mockProductRepository.findById.mockResolvedValueOnce(products[2]); // scrapeProductById
      mockProductRepository.findById.mockResolvedValueOnce(products[2]); // scrapeProductWebsite
      mockTakeSnapshot.mockResolvedValueOnce(mockWebsiteSnapshot);
      mockProductSnapshotRepository.create.mockResolvedValueOnce(snapshot3);

      const result = await productScrapingService.triggerManualProductScraping('proj_456');

      // Should have 2 successful snapshots despite 1 failure
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('snap_1');
      expect(result[1].id).toBe('snap_3');
      expect(mockProductRepository.findById).toHaveBeenCalledTimes(5); // 2 + 1 failed + 2 = 5 total calls
      expect(mockTakeSnapshot).toHaveBeenCalledTimes(2); // Only successful products scraped
      expect(mockProductSnapshotRepository.create).toHaveBeenCalledTimes(2); // Only successful snapshots created
    }, 15000);
  });
}); 