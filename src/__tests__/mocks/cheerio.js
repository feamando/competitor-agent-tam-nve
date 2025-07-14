// Mock Cheerio for testing
const mockCheerio = {
  load: jest.fn((html) => {
    // Return a mock jQuery-like object
    return jest.fn((selector) => {
      // Mock meta description extraction
      if (selector === 'meta[name="description"]') {
        return {
          attr: jest.fn((attribute) => {
            if (attribute === 'content') {
              // Return description if html contains meta description
              if (html && html.includes('meta name="description" content="Test description"')) {
                return 'Test description';
              }
              return '';
            }
            return null;
          })
        };
      }
      return {
        attr: jest.fn(() => null),
        text: jest.fn(() => ''),
        html: jest.fn(() => ''),
      };
    });
  })
};

module.exports = mockCheerio; 