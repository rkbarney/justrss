/**
 * Feed sharing tests: encode/decode/validate, deduplication, URL param handling.
 * Run with: npm test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Load FeedShare into a JSDOM environment at the given URL.
 * Returns { FeedShare, dom } so callers can inspect window state.
 */
function loadFeedShareDom(url = 'http://localhost/') {
  const code = readFileSync(join(__dirname, '../js/share.js'), 'utf8');
  const html = `<!DOCTYPE html><html><body><script>${code}</script></body></html>`;
  const dom = new JSDOM(html, { url, runScripts: 'dangerously' });
  return { FeedShare: dom.window.FeedShare, dom };
}

// Module-level instance for pure-function tests (no window state needed).
const { FeedShare } = loadFeedShareDom();

// Helper: encode in the JSDOM context so atob/btoa are consistent.
function b64encode(str) {
  const { dom } = loadFeedShareDom();
  return dom.window.btoa(str);
}

// ---------------------------------------------------------------------------
// Encoding
// ---------------------------------------------------------------------------

describe('encodeFeedUrls', () => {
  it('encodes a valid list of URLs to a non-empty base64 string', () => {
    const encoded = FeedShare.encodeFeedUrls(['https://example.com/feed']);
    assert.ok(typeof encoded === 'string' && encoded.length > 0);
  });

  it('round-trip: decoding returns the original URLs unchanged', () => {
    const urls = ['https://a.com/feed', 'https://b.com/rss', 'https://c.org/atom.xml'];
    const encoded = FeedShare.encodeFeedUrls(urls);
    const result = FeedShare.decodeFeedUrls(encoded);
    assert.strictEqual(result.error, null);
    // deepEqual (not strict) handles cross-realm array comparison
    assert.deepEqual([...result.urls], urls);
  });

  it('encodes 1 feed', () => {
    const encoded = FeedShare.encodeFeedUrls(['https://single.com/feed']);
    assert.ok(encoded.length > 0);
  });

  it('encodes 10 feeds', () => {
    const urls = Array.from({ length: 10 }, (_, i) => `https://feed${i}.com/rss`);
    const encoded = FeedShare.encodeFeedUrls(urls);
    assert.ok(encoded.length > 0);
  });

  it('encodes 15 feeds (at cap)', () => {
    const urls = Array.from({ length: 15 }, (_, i) => `https://feed${i}.com/rss`);
    const encoded = FeedShare.encodeFeedUrls(urls);
    assert.ok(encoded.length > 0);
  });

  it('throws when encoding 16+ feeds (cap enforced)', () => {
    const urls = Array.from({ length: 16 }, (_, i) => `https://feed${i}.com/rss`);
    assert.throws(() => FeedShare.encodeFeedUrls(urls), /Maximum 15/);
  });

  it('throws when encoding 20 feeds', () => {
    const urls = Array.from({ length: 20 }, (_, i) => `https://feed${i}.com/rss`);
    assert.throws(() => FeedShare.encodeFeedUrls(urls));
  });
});

// ---------------------------------------------------------------------------
// Decoding & validation
// ---------------------------------------------------------------------------

describe('decodeFeedUrls', () => {
  it('handles malformed base64 without throwing (error: invalid_base64)', () => {
    const result = FeedShare.decodeFeedUrls('!!!not-base64!!!');
    assert.strictEqual(result.error, 'invalid_base64');
    assert.strictEqual(result.urls, null);
    assert.strictEqual(result.truncated, false);
  });

  it('handles valid base64 but non-JSON content (error: invalid_json)', () => {
    const encoded = b64encode('not-json-at-all{{{{');
    const result = FeedShare.decodeFeedUrls(encoded);
    assert.strictEqual(result.error, 'invalid_json');
    assert.strictEqual(result.urls, null);
  });

  it('handles valid base64 + valid JSON that is not an array — plain object (error: not_array)', () => {
    const encoded = b64encode(JSON.stringify({ url: 'https://example.com/feed' }));
    const result = FeedShare.decodeFeedUrls(encoded);
    assert.strictEqual(result.error, 'not_array');
    assert.strictEqual(result.urls, null);
  });

  it('handles valid base64 + valid JSON that is not an array — string (error: not_array)', () => {
    const encoded = b64encode(JSON.stringify('https://example.com/feed'));
    const result = FeedShare.decodeFeedUrls(encoded);
    assert.strictEqual(result.error, 'not_array');
    assert.strictEqual(result.urls, null);
  });

  it('handles valid base64 + valid JSON that is not an array — number (error: not_array)', () => {
    const encoded = b64encode(JSON.stringify(42));
    const result = FeedShare.decodeFeedUrls(encoded);
    assert.strictEqual(result.error, 'not_array');
    assert.strictEqual(result.urls, null);
  });

  it('handles an empty array (error: empty, urls: [])', () => {
    const encoded = b64encode(JSON.stringify([]));
    const result = FeedShare.decodeFeedUrls(encoded);
    assert.strictEqual(result.error, 'empty');
    assert.ok(result.urls !== null);
    assert.strictEqual(result.urls.length, 0);
    assert.strictEqual(result.truncated, false);
  });

  it('truncates arrays exceeding 15 items and sets truncated=true', () => {
    const urls = Array.from({ length: 20 }, (_, i) => `https://feed${i}.com/rss`);
    const encoded = b64encode(JSON.stringify(urls));
    const result = FeedShare.decodeFeedUrls(encoded);
    assert.strictEqual(result.error, null);
    assert.strictEqual(result.truncated, true);
    assert.strictEqual(result.urls.length, 15);
    // Compare individual strings (cross-realm safe)
    for (let i = 0; i < 15; i++) {
      assert.strictEqual(result.urls[i], urls[i]);
    }
  });

  it('does not truncate arrays of exactly 15 items', () => {
    const urls = Array.from({ length: 15 }, (_, i) => `https://feed${i}.com/rss`);
    const encoded = FeedShare.encodeFeedUrls(urls);
    const result = FeedShare.decodeFeedUrls(encoded);
    assert.strictEqual(result.error, null);
    assert.strictEqual(result.truncated, false);
    assert.strictEqual(result.urls.length, 15);
  });

  it('succeeds for a valid single-item array (no error)', () => {
    const encoded = FeedShare.encodeFeedUrls(['https://waitbutwhy.com/feed']);
    const result = FeedShare.decodeFeedUrls(encoded);
    assert.strictEqual(result.error, null);
    assert.strictEqual(result.urls.length, 1);
    assert.strictEqual(result.urls[0], 'https://waitbutwhy.com/feed');
    assert.strictEqual(result.truncated, false);
  });
});

// ---------------------------------------------------------------------------
// Import deduplication (planImport is pure)
// ---------------------------------------------------------------------------

describe('planImport', () => {
  it('skips a URL already in the existing feed list', () => {
    const existing = ['https://existing.com/feed', 'https://other.com/rss'];
    const { toAdd, skipped } = FeedShare.planImport(['https://existing.com/feed'], existing);
    assert.deepEqual([...toAdd], []);
    assert.strictEqual(skipped, 1);
  });

  it('adds URLs not in the existing list', () => {
    const existing = ['https://existing.com/feed'];
    const { toAdd, skipped } = FeedShare.planImport(
      ['https://existing.com/feed', 'https://new.com/rss', 'https://another.com/atom'],
      existing,
    );
    assert.deepEqual([...toAdd], ['https://new.com/rss', 'https://another.com/atom']);
    assert.strictEqual(skipped, 1);
  });

  it('returns 0 feeds to add when all are duplicates', () => {
    const existing = ['https://a.com/feed', 'https://b.com/rss'];
    const { toAdd, skipped } = FeedShare.planImport(
      ['https://a.com/feed', 'https://b.com/rss'],
      existing,
    );
    assert.strictEqual(toAdd.length, 0);
    assert.strictEqual(skipped, 2);
  });

  it('adds all URLs when none are duplicates', () => {
    const { toAdd, skipped } = FeedShare.planImport(
      ['https://new1.com/feed', 'https://new2.com/rss'],
      [],
    );
    assert.deepEqual([...toAdd], ['https://new1.com/feed', 'https://new2.com/rss']);
    assert.strictEqual(skipped, 0);
  });

  it('filters out falsy entries silently', () => {
    const { toAdd, skipped } = FeedShare.planImport(
      ['https://valid.com/feed', '', null, undefined],
      [],
    );
    assert.deepEqual([...toAdd], ['https://valid.com/feed']);
    assert.strictEqual(skipped, 3);
  });
});

// ---------------------------------------------------------------------------
// URL param handling
// ---------------------------------------------------------------------------

describe('getImportParam', () => {
  it('detects the ?import= param in a search string', () => {
    const param = FeedShare.getImportParam('?import=abc123');
    assert.strictEqual(param, 'abc123');
  });

  it('returns null when ?import= param is absent', () => {
    assert.strictEqual(FeedShare.getImportParam('?foo=bar'), null);
    assert.strictEqual(FeedShare.getImportParam(''), null);
    assert.strictEqual(FeedShare.getImportParam('?'), null);
  });

  it('returns the correct value when other params are also present', () => {
    const param = FeedShare.getImportParam('?foo=bar&import=xyz&baz=1');
    assert.strictEqual(param, 'xyz');
  });

  it('works with a real encoded share link', () => {
    const urls = ['https://example.com/feed'];
    const encoded = FeedShare.encodeFeedUrls(urls);
    const param = FeedShare.getImportParam(`?import=${encoded}`);
    assert.strictEqual(param, encoded);
  });
});

describe('stripImportParam', () => {
  it('removes ?import= from the URL via history.replaceState', () => {
    const { FeedShare: fs, dom } = loadFeedShareDom('http://localhost/?import=abc123');
    assert.ok(dom.window.location.search.includes('import'));
    fs.stripImportParam();
    assert.ok(!dom.window.location.search.includes('import'));
    assert.ok(!dom.window.location.href.includes('import'));
  });

  it('preserves other query params when stripping', () => {
    const { FeedShare: fs, dom } = loadFeedShareDom('http://localhost/?foo=bar&import=abc&baz=1');
    fs.stripImportParam();
    assert.ok(!dom.window.location.search.includes('import'));
    assert.ok(dom.window.location.search.includes('foo=bar'));
    assert.ok(dom.window.location.search.includes('baz=1'));
  });

  it('preserves the URL hash when stripping', () => {
    const { FeedShare: fs, dom } = loadFeedShareDom('http://localhost/?import=abc#feeds');
    fs.stripImportParam();
    assert.ok(!dom.window.location.href.includes('import'));
    assert.ok(dom.window.location.hash === '#feeds');
  });

  it('is a no-op when ?import= is not present', () => {
    const { FeedShare: fs, dom } = loadFeedShareDom('http://localhost/?foo=bar');
    fs.stripImportParam();
    assert.ok(!dom.window.location.href.includes('import'));
    assert.ok(dom.window.location.href.includes('foo=bar'));
  });

  it('param is stripped on error path (invalid param stripped at init)', () => {
    // Simulate: param detected → stripped immediately → then validation fails
    const { FeedShare: fs, dom } = loadFeedShareDom('http://localhost/?import=!!!bad!!!');
    const param = fs.getImportParam(dom.window.location.search);
    assert.ok(param !== null);
    fs.stripImportParam();
    assert.ok(!dom.window.location.href.includes('import'));
    // Now validate — this would show the error toast in app context
    const result = fs.decodeFeedUrls(param);
    assert.strictEqual(result.error, 'invalid_base64');
  });

  it('param is stripped on cancel path (stripped at init before dialog shown)', () => {
    // The app strips the param at the very start of init(), before the dialog appears.
    // This test verifies stripping works regardless of user action.
    const { FeedShare: fs, dom } = loadFeedShareDom('http://localhost/?import=abc123#all');
    fs.stripImportParam();
    assert.ok(!dom.window.location.href.includes('import'));
    assert.ok(dom.window.location.hash === '#all');
  });

  it('param is stripped on successful import path', () => {
    const urls = ['https://example.com/feed', 'https://another.com/rss'];
    const encoded = FeedShare.encodeFeedUrls(urls); // compute before destructuring
    const { FeedShare: fs, dom } = loadFeedShareDom(`http://localhost/?import=${encoded}`);
    fs.stripImportParam();
    assert.ok(!dom.window.location.href.includes('import'));
    // Decoding still works from the pre-captured encoded value
    const result = fs.decodeFeedUrls(encoded);
    assert.strictEqual(result.error, null);
    assert.strictEqual(result.urls.length, 2);
  });
});
