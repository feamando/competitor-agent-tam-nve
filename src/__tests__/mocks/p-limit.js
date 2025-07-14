// Mock p-limit for testing
const pLimit = jest.fn((concurrency) => {
  // Return a function that acts like the p-limit function
  return jest.fn(async (fn, ...args) => {
    // Simply execute the function
    return await fn(...args);
  });
});

module.exports = pLimit; 