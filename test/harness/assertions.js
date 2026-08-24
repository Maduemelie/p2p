/**
 * Zero-Dependency Assertion Library for E2E Test Suite
 */

class AssertionError extends Error {
  constructor(message, actual, expected) {
    super(message);
    this.name = 'AssertionError';
    this.actual = actual;
    this.expected = expected;
  }
}

function formatValue(v) {
  if (typeof v === 'string') return `"${v}"`;
  if (typeof v === 'object' && v !== null) {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return String(v);
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (a === null || typeof a !== 'object' || b === null || typeof b !== 'object') {
    return false;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;

  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!deepEqual(a[key], b[key])) return false;
  }

  return true;
}

const assert = {
  ok(value, message = 'Expected value to be truthy') {
    if (!value) {
      throw new AssertionError(message, value, true);
    }
  },

  strictEqual(actual, expected, message) {
    if (actual !== expected) {
      const msg = message || `Expected ${formatValue(actual)} === ${formatValue(expected)}`;
      throw new AssertionError(msg, actual, expected);
    }
  },

  notStrictEqual(actual, expected, message) {
    if (actual === expected) {
      const msg = message || `Expected ${formatValue(actual)} !== ${formatValue(expected)}`;
      throw new AssertionError(msg, actual, expected);
    }
  },

  deepStrictEqual(actual, expected, message) {
    if (!deepEqual(actual, expected)) {
      const msg = message || `Expected deep equality: \nActual: ${formatValue(actual)}\nExpected: ${formatValue(expected)}`;
      throw new AssertionError(msg, actual, expected);
    }
  },

  match(string, regex, message) {
    const str = String(string);
    if (!regex.test(str)) {
      const msg = message || `Expected "${str}" to match ${regex}`;
      throw new AssertionError(msg, str, regex);
    }
  },

  doesNotMatch(string, regex, message) {
    const str = String(string);
    if (regex.test(str)) {
      const msg = message || `Expected "${str}" NOT to match ${regex}`;
      throw new AssertionError(msg, str, regex);
    }
  },

  includes(container, item, message) {
    if (typeof container === 'string') {
      if (!container.includes(item)) {
        throw new AssertionError(message || `Expected string "${container}" to include "${item}"`, container, item);
      }
    } else if (Array.isArray(container)) {
      const found = container.some(el => deepEqual(el, item) || el === item);
      if (!found) {
        throw new AssertionError(message || `Expected array to include item ${formatValue(item)}`, container, item);
      }
    } else if (container instanceof Set || container instanceof Map) {
      if (!container.has(item)) {
        throw new AssertionError(message || `Expected collection to contain key ${formatValue(item)}`, container, item);
      }
    } else {
      throw new AssertionError(`Unsupported container type: ${typeof container}`);
    }
  },

  closeTo(actual, expected, delta = 0.001, message) {
    const diff = Math.abs(actual - expected);
    if (diff > delta) {
      const msg = message || `Expected ${actual} to be close to ${expected} (within ±${delta}, got diff ${diff})`;
      throw new AssertionError(msg, actual, expected);
    }
  },

  isAbove(actual, min, message) {
    if (!(actual > min)) {
      const msg = message || `Expected ${actual} > ${min}`;
      throw new AssertionError(msg, actual, min);
    }
  },

  isBelow(actual, max, message) {
    if (!(actual < max)) {
      const msg = message || `Expected ${actual} < ${max}`;
      throw new AssertionError(msg, actual, max);
    }
  },

  throws(fn, errorMatcher, message) {
    let threw = false;
    let thrownError = null;
    try {
      fn();
    } catch (err) {
      threw = true;
      thrownError = err;
    }

    if (!threw) {
      throw new AssertionError(message || 'Expected function to throw an error, but it did not.');
    }

    if (errorMatcher) {
      if (typeof errorMatcher === 'function' && !(thrownError instanceof errorMatcher)) {
        throw new AssertionError(message || `Expected error to be instance of ${errorMatcher.name}, got ${thrownError?.constructor?.name}`, thrownError, errorMatcher);
      }
      if (errorMatcher instanceof RegExp && !errorMatcher.test(thrownError.message)) {
        throw new AssertionError(message || `Expected error message "${thrownError.message}" to match ${errorMatcher}`, thrownError.message, errorMatcher);
      }
      if (typeof errorMatcher === 'string' && !thrownError.message.includes(errorMatcher)) {
        throw new AssertionError(message || `Expected error message to include "${errorMatcher}"`, thrownError.message, errorMatcher);
      }
    }
  },

  doesNotThrow(fn, message) {
    try {
      fn();
    } catch (err) {
      throw new AssertionError(message || `Expected function not to throw, but it threw: ${err.message}`, err, null);
    }
  },

  async rejects(asyncFn, errorMatcher, message) {
    let threw = false;
    let thrownError = null;
    try {
      await asyncFn();
    } catch (err) {
      threw = true;
      thrownError = err;
    }

    if (!threw) {
      throw new AssertionError(message || 'Expected async function to reject, but it resolved successfully.');
    }

    if (errorMatcher) {
      if (typeof errorMatcher === 'function' && !(thrownError instanceof errorMatcher)) {
        throw new AssertionError(message || `Expected error to be instance of ${errorMatcher.name}, got ${thrownError?.constructor?.name}`, thrownError, errorMatcher);
      }
      if (errorMatcher instanceof RegExp && !errorMatcher.test(thrownError.message)) {
        throw new AssertionError(message || `Expected error message "${thrownError.message}" to match ${errorMatcher}`, thrownError.message, errorMatcher);
      }
      if (typeof errorMatcher === 'string' && !thrownError.message.includes(errorMatcher)) {
        throw new AssertionError(message || `Expected error message to include "${errorMatcher}"`, thrownError.message, errorMatcher);
      }
    }
  }
};

module.exports = { assert, AssertionError };
