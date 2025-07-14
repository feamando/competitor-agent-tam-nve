/**
 * Cross-browser compatibility polyfills
 * Add any browser compatibility polyfills here to ensure consistent behavior across browsers.
 */

// Polyfill for Element.matches() method - used in event delegation
if (!Element.prototype.matches) {
  Element.prototype.matches = 
    Element.prototype.msMatchesSelector || 
    Element.prototype.webkitMatchesSelector;
}

// Polyfill for Element.closest() method - used to find parent elements
if (!Element.prototype.closest) {
  Element.prototype.closest = function(s) {
    let el = this;
    do {
      if (el.matches(s)) return el;
      el = el.parentElement || el.parentNode;
    } while (el !== null && el.nodeType === 1);
    return null;
  };
}

// Polyfill for Object.entries
if (!Object.entries) {
  Object.entries = function(obj) {
    return Object.keys(obj).map(function(key) {
      return [key, obj[key]];
    });
  };
}

// Polyfill for Object.fromEntries
if (!Object.fromEntries) {
  Object.fromEntries = function(entries) {
    return [...entries].reduce((obj, [key, val]) => {
      obj[key] = val;
      return obj;
    }, {});
  };
}

// Array.flat polyfill
if (!Array.prototype.flat) {
  Array.prototype.flat = function(depth = 1) {
    return function flat(arr, depth) {
      if (depth < 1) return arr.slice();
      return arr.reduce(function(acc, val) {
        return acc.concat(Array.isArray(val) ? flat(val, depth - 1) : val);
      }, []);
    }(this, depth);
  };
}

// IntersectionObserver polyfill for old browsers
export function loadIntersectionObserverPolyfill(): Promise<void> {
  if ('IntersectionObserver' in window) {
    return Promise.resolve();
  }
  return import('intersection-observer').then(() => {
    console.log('IntersectionObserver polyfill loaded');
  });
}

// ResizeObserver polyfill for old browsers
export function loadResizeObserverPolyfill(): Promise<void> {
  if ('ResizeObserver' in window) {
    return Promise.resolve();
  }
  return import('resize-observer-polyfill').then(() => {
    console.log('ResizeObserver polyfill loaded');
  });
}

// Focus-visible polyfill for better keyboard focus styles
export function loadFocusVisiblePolyfill(): Promise<void> {
  return import('focus-visible').then(() => {
    console.log('focus-visible polyfill loaded');
  });
}

// Initialize all polyfills
export function initPolyfills(): Promise<void[]> {
  return Promise.all([
    loadIntersectionObserverPolyfill(),
    loadResizeObserverPolyfill(),
    loadFocusVisiblePolyfill()
  ]);
}

export default initPolyfills; 