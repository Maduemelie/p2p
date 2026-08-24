/**
 * Headless Browser & DOM Environment Mock for Node.js E2E Tests
 */

class MockLocalStorage {
  constructor() {
    this.store = new Map();
  }

  getItem(key) {
    const val = this.store.get(String(key));
    return val !== undefined ? String(val) : null;
  }

  setItem(key, value) {
    this.store.set(String(key), String(value));
  }

  removeItem(key) {
    this.store.delete(String(key));
  }

  clear() {
    this.store.clear();
  }

  key(index) {
    return Array.from(this.store.keys())[index] || null;
  }

  get length() {
    return this.store.size;
  }
}

class MockClassList {
  constructor(element) {
    this.element = element;
    this.classes = new Set();
  }

  add(...classNames) {
    for (const cls of classNames) {
      if (cls) this.classes.add(cls);
    }
  }

  remove(...classNames) {
    for (const cls of classNames) {
      this.classes.delete(cls);
    }
  }

  toggle(className, force) {
    if (force !== undefined) {
      if (force) this.classes.add(className);
      else this.classes.delete(className);
      return force;
    }
    if (this.classes.has(className)) {
      this.classes.delete(className);
      return false;
    } else {
      this.classes.add(className);
      return true;
    }
  }

  contains(className) {
    return this.classes.has(className);
  }

  toString() {
    return Array.from(this.classes).join(' ');
  }
}

class MockElement {
  constructor(tagName = 'div', id = '', className = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.classList = new MockClassList(this);
    if (className) {
      className.split(/\s+/).filter(Boolean).forEach(c => this.classList.add(c));
    }
    this.attributes = new Map();
    if (id) this.attributes.set('id', id);
    if (className) this.attributes.set('class', className);

    this.children = [];
    this.parentElement = null;
    this._value = '';
    this._textContent = '';
    this._innerHTML = '';
    this.style = {};
    this.disabled = false;
    this.checked = false;
    this.type = 'text';
    this.listeners = new Map();
  }

  get value() {
    return this._value;
  }

  set value(val) {
    this._value = String(val);
  }

  get textContent() {
    if (this._textContent) return this._textContent;
    return this.children.map(c => c.textContent).join('');
  }

  set textContent(val) {
    this._textContent = String(val);
    this.children = [];
  }

  get innerHTML() {
    return this._innerHTML || this._textContent;
  }

  set innerHTML(htmlString) {
    this._innerHTML = String(htmlString);
    this._textContent = this._innerHTML.replace(/<[^>]+>/g, '');
    this.children = [];
    // Basic parser to create child nodes from simple elements with ids/classes
    parseSimpleHtml(this._innerHTML, this);
  }

  get options() {
    return this.children.filter(c => c.tagName === 'OPTION');
  }

  get className() {
    return this.classList.toString();
  }

  set className(name) {
    this.classList.classes.clear();
    if (name) {
      name.split(/\s+/).filter(Boolean).forEach(c => this.classList.add(c));
    }
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === 'id') this.id = String(value);
    if (name === 'class') this.className = String(value);
  }

  getAttribute(name) {
    const val = this.attributes.get(name);
    return val !== undefined ? val : null;
  }

  hasAttribute(name) {
    return this.attributes.has(name);
  }

  removeAttribute(name) {
    this.attributes.delete(name);
    if (name === 'id') this.id = '';
    if (name === 'class') this.classList.classes.clear();
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      child.parentElement = null;
      this.children.splice(idx, 1);
    }
    return child;
  }

  addEventListener(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  removeEventListener(event, callback) {
    if (this.listeners.has(event)) {
      const arr = this.listeners.get(event).filter(cb => cb !== callback);
      this.listeners.set(event, arr);
    }
  }

  dispatchEvent(event) {
    event.target = this;
    event.currentTarget = this;
    const callbacks = this.listeners.get(event.type) || [];
    for (const cb of callbacks) {
      cb.call(this, event);
    }
    return true;
  }

  click() {
    this.dispatchEvent({
      type: 'click',
      target: this,
      currentTarget: this,
      preventDefault: () => {},
      stopPropagation: () => {},
      closest: (sel) => this.closest(sel)
    });
  }

  reset() {
    this._value = '';
    this.children.forEach(c => {
      if (typeof c.reset === 'function') c.reset();
      else if ('value' in c) c.value = '';
    });
  }

  closest(selector) {
    let curr = this;
    while (curr) {
      if (matchesSelector(curr, selector)) return curr;
      curr = curr.parentElement;
    }
    return null;
  }

  querySelector(selector) {
    const matches = this.querySelectorAll(selector);
    return matches.length > 0 ? matches[0] : null;
  }

  querySelectorAll(selector) {
    const results = [];
    function search(node) {
      for (const child of node.children) {
        if (matchesSelector(child, selector)) {
          results.push(child);
        }
        search(child);
      }
    }
    search(this);
    return results;
  }

  scrollIntoView() {}
}

function matchesSelector(element, selector) {
  if (!selector || !element) return false;
  selector = selector.trim();

  // Compound/nested descendant selector: ancestor descendant
  if (selector.includes(' ')) {
    const parts = selector.split(/\s+/);
    if (parts.length === 2) {
      if (!matchesSelector(element, parts[1])) return false;
      let curr = element.parentElement;
      while (curr) {
        if (matchesSelector(curr, parts[0])) return true;
        curr = curr.parentElement;
      }
      return false;
    }
  }

  // Compound class + attribute: e.g. .assign-same-bank-check[data-order-id="123"]
  const classAttrMatch = selector.match(/^\.([a-zA-Z0-9_-]+)\[([a-zA-Z0-9_-]+)(?:=([^\],]+))?\]$/);
  if (classAttrMatch) {
    const cls = classAttrMatch[1];
    const attrName = classAttrMatch[2];
    const rawVal = classAttrMatch[3];
    const attrVal = rawVal ? rawVal.replace(/^["']|["']$/g, '') : null;
    const hasClass = element.classList.contains(cls);
    const hasAttr = element.hasAttribute(attrName) && (attrVal === null || element.getAttribute(attrName) === attrVal);
    return hasClass && hasAttr;
  }

  // ID selector #foo
  if (selector.startsWith('#')) {
    return element.id === selector.slice(1);
  }

  // Class selector .bar
  if (selector.startsWith('.')) {
    return element.classList.contains(selector.slice(1));
  }

  // Tag selector
  if (/^[A-Za-z0-9-]+$/.test(selector)) {
    return element.tagName.toLowerCase() === selector.toLowerCase();
  }

  // Attribute selector [data-xyz="123"]
  const attrMatch = selector.match(/^\[([a-zA-Z0-9_-]+)(?:=([^\],]+))?\]$/);
  if (attrMatch) {
    const attrName = attrMatch[1];
    const rawVal = attrMatch[2];
    const attrVal = rawVal ? rawVal.replace(/^["']|["']$/g, '') : null;
    if (!element.hasAttribute(attrName)) return false;
    return attrVal === null || element.getAttribute(attrName) === attrVal;
  }

  return false;
}

function parseSimpleHtml(htmlString, parent) {
  // Regex to extract elements with id or class or data attributes
  const tagRegex = /<([a-zA-Z0-9]+)([^>]*)>(?:([\s\S]*?)<\/\1>)?/g;
  let match;
  while ((match = tagRegex.exec(htmlString)) !== null) {
    const tagName = match[1];
    const rawAttrs = match[2];
    const innerText = match[3] || '';

    const el = new MockElement(tagName);
    
    // Extract ID
    const idMatch = rawAttrs.match(/id=["']([^"']+)["']/);
    if (idMatch) el.id = idMatch[1];

    // Extract classes
    const classMatch = rawAttrs.match(/class=["']([^"']+)["']/);
    if (classMatch) el.className = classMatch[1];

    // Extract other attributes
    const attrRegex = /([a-zA-Z0-9_-]+)=["']([^"']*)["']/g;
    let attrM;
    while ((attrM = attrRegex.exec(rawAttrs)) !== null) {
      el.setAttribute(attrM[1], attrM[2]);
    }

    if (/\bchecked\b/.test(rawAttrs)) {
      el.checked = true;
    }
    if (/\bdisabled\b/.test(rawAttrs)) {
      el.disabled = true;
    }

    if (innerText && !innerText.includes('<')) {
      el.textContent = innerText.trim();
    } else if (innerText) {
      parseSimpleHtml(innerText, el);
    }

    parent.appendChild(el);
  }
}

class MockCustomEvent {
  constructor(type, eventInitDict = {}) {
    this.type = type;
    this.detail = eventInitDict.detail || null;
    this.bubbles = eventInitDict.bubbles || false;
    this.cancelable = eventInitDict.cancelable || false;
  }
}

class MockDocument {
  constructor() {
    this.body = new MockElement('body', 'app-body');
    this.head = new MockElement('head');
    this.root = new MockElement('html');
    this.root.appendChild(this.head);
    this.root.appendChild(this.body);
    this.elementMap = new Map();
  }

  createElement(tagName) {
    return new MockElement(tagName);
  }

  getElementById(id) {
    if (!id) return null;
    return this.root.querySelector(`#${id}`);
  }

  querySelector(selector) {
    return this.root.querySelector(selector);
  }

  querySelectorAll(selector) {
    return this.root.querySelectorAll(selector);
  }
}

class MockWindow {
  constructor(documentInstance, localStorageInstance) {
    this.document = documentInstance;
    this.localStorage = localStorageInstance;
    this.listeners = new Map();
    this.location = {
      origin: 'http://localhost:3000',
      hostname: 'localhost',
      port: '3000',
      protocol: 'http:',
      href: 'http://localhost:3000/'
    };
    this.navigator = {
      clipboard: {
        lastCopied: '',
        writeText: async (text) => {
          this.navigator.clipboard.lastCopied = String(text);
          return Promise.resolve();
        }
      }
    };
    this.toasts = [];
    this.showToast = (msg, type = 'info') => {
      this.toasts.push({ msg, type, timestamp: Date.now() });
    };
    this.confirmModals = [];
    this.showConfirmModal = (title, message, onConfirm, type) => {
      this.confirmModals.push({ title, message, onConfirm, type });
      if (typeof onConfirm === 'function') onConfirm();
    };
    this.currentView = 'dashboard';
    this.switchView = (viewName) => {
      this.currentView = viewName;
    };
    this.lucide = {
      createIcons: () => {}
    };
  }

  addEventListener(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  removeEventListener(event, callback) {
    if (this.listeners.has(event)) {
      const arr = this.listeners.get(event).filter(cb => cb !== callback);
      this.listeners.set(event, arr);
    }
  }

  dispatchEvent(event) {
    const callbacks = this.listeners.get(event.type) || [];
    for (const cb of callbacks) {
      cb.call(this, event);
    }
    return true;
  }
}

/**
 * Setup global browser environment for Node.js
 */
function setupDomEnvironment() {
  const localStorage = new MockLocalStorage();
  const document = new MockDocument();
  const window = new MockWindow(document, localStorage);

  const prevGlobal = {
    window: global.window,
    document: global.document,
    localStorage: global.localStorage,
    CustomEvent: global.CustomEvent,
    navigator: global.navigator
  };

  global.window = window;
  global.document = document;
  global.localStorage = localStorage;
  global.CustomEvent = MockCustomEvent;
  global.navigator = window.navigator;

  return {
    window,
    document,
    localStorage,
    restore() {
      global.window = prevGlobal.window;
      global.document = prevGlobal.document;
      global.localStorage = prevGlobal.localStorage;
      global.CustomEvent = prevGlobal.CustomEvent;
      global.navigator = prevGlobal.navigator;
    }
  };
}

module.exports = {
  MockLocalStorage,
  MockElement,
  MockDocument,
  MockWindow,
  MockCustomEvent,
  setupDomEnvironment
};
