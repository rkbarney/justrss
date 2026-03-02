/**
 * OPML import/export tests.
 * Run with: npm test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadStorage() {
  const storageCode = readFileSync(join(__dirname, '../js/storage.js'), 'utf8');
  const html = `<!DOCTYPE html><html><body><script>${storageCode}</script></body></html>`;
  const dom = new JSDOM(html, {
    url: 'http://localhost',
    runScripts: 'dangerously',
  });
  return dom.window.Storage;
}

describe('OPML parseOPML', () => {
  const Storage = loadStorage();

  it('parses basic OPML with xmlUrl and title', () => {
    const opml = `<?xml version="1.0"?>
<opml version="2.0">
<head><title>Export</title></head>
<body>
  <outline type="rss" title="Wait But Why" xmlUrl="https://waitbutwhy.com/feed"/>
  <outline type="rss" title="Hacker News" xmlUrl="https://news.ycombinator.com/rss"/>
</body>
</opml>`;
    const feeds = Storage.parseOPML(opml);
    assert.strictEqual(feeds.length, 2);
    assert.strictEqual(feeds[0].title, 'Wait But Why');
    assert.strictEqual(feeds[0].url, 'https://waitbutwhy.com/feed');
    assert.strictEqual(feeds[1].title, 'Hacker News');
    assert.strictEqual(feeds[1].url, 'https://news.ycombinator.com/rss');
  });

  it('parses OPML with text attribute instead of title', () => {
    const opml = `<?xml version="1.0"?>
<opml version="2.0"><body>
  <outline type="rss" text="My Blog" xmlUrl="https://example.com/feed.xml"/>
</body></opml>`;
    const feeds = Storage.parseOPML(opml);
    assert.strictEqual(feeds.length, 1);
    assert.strictEqual(feeds[0].title, 'My Blog');
    assert.strictEqual(feeds[0].url, 'https://example.com/feed.xml');
  });

  it('parses OPML with lowercase xmlurl', () => {
    const opml = `<?xml version="1.0"?>
<opml version="2.0"><body>
  <outline type="rss" title="Feed" xmlurl="https://example.com/rss"/>
</body></opml>`;
    const feeds = Storage.parseOPML(opml);
    assert.strictEqual(feeds.length, 1);
    assert.strictEqual(feeds[0].url, 'https://example.com/rss');
  });

  it('parses OPML with url attribute', () => {
    const opml = `<?xml version="1.0"?>
<opml version="2.0"><body>
  <outline type="rss" title="Feed" url="https://example.com/atom.xml"/>
</body></opml>`;
    const feeds = Storage.parseOPML(opml);
    assert.strictEqual(feeds.length, 1);
    assert.strictEqual(feeds[0].url, 'https://example.com/atom.xml');
  });

  it('rejects non-http(s) URLs', () => {
    const opml = `<?xml version="1.0"?>
<opml version="2.0"><body>
  <outline type="rss" title="Bad" xmlUrl="ftp://example.com/feed"/>
</body></opml>`;
    const feeds = Storage.parseOPML(opml);
    assert.strictEqual(feeds.length, 0);
  });

  it('returns empty array for invalid XML', () => {
    const feeds = Storage.parseOPML('not xml <<<');
    assert.strictEqual(feeds.length, 0);
  });

  it('parses nested outlines (flat)', () => {
    const opml = `<?xml version="1.0"?>
<opml version="2.0"><body>
  <outline text="Category">
    <outline type="rss" title="Feed A" xmlUrl="https://a.com/feed"/>
    <outline type="rss" title="Feed B" xmlUrl="https://b.com/feed"/>
  </outline>
</body></opml>`;
    const feeds = Storage.parseOPML(opml);
    assert.ok(feeds.length >= 2);
    const urls = feeds.map((f) => f.url);
    assert.ok(urls.includes('https://a.com/feed'));
    assert.ok(urls.includes('https://b.com/feed'));
  });

  it('parses YouTube feed URLs with full channel info', () => {
    const opml = `<?xml version="1.0"?>
<opml version="2.0"><body>
  <outline type="rss" title="Veritasium - Videos" xmlUrl="https://www.youtube.com/feeds/videos.xml?playlist_id=UULFUC0pQPLQvijaB9eXyEcUA"/>
  <outline type="rss" title="Channel All" xmlUrl="https://www.youtube.com/feeds/videos.xml?channel_id=UC0pQPLQvijaB9eXyEcUA"/>
</body></opml>`;
    const feeds = Storage.parseOPML(opml);
    assert.strictEqual(feeds.length, 2);
    assert.strictEqual(feeds[0].title, 'Veritasium - Videos');
    assert.ok(feeds[0].url.includes('youtube.com/feeds/videos.xml'));
    assert.strictEqual(feeds[1].title, 'Channel All');
  });
});

describe('OPML exportOPML', () => {
  const Storage = loadStorage();

  it('exports feeds with title and url', () => {
    const feeds = [
      { id: '1', title: 'Blog A', url: 'https://blog-a.com/feed' },
      { id: '2', title: 'Blog B', url: 'https://blog-b.com/rss' },
    ];
    const opml = Storage.exportOPML(feeds);
    assert.ok(opml.includes('<?xml version="1.0"'));
    assert.ok(opml.includes('<opml version="2.0">'));
    assert.ok(opml.includes('title="Blog A"'));
    assert.ok(opml.includes('xmlUrl="https://blog-a.com/feed"'));
    assert.ok(opml.includes('title="Blog B"'));
    assert.ok(opml.includes('xmlUrl="https://blog-b.com/rss"'));
  });

  it('escapes XML special characters in title and url', () => {
    const feeds = [
      { title: 'A & B <test>', url: 'https://example.com?foo=1&bar=2' },
    ];
    const opml = Storage.exportOPML(feeds);
    assert.ok(opml.includes('title="A &amp; B &lt;test&gt;"'));
    assert.ok(opml.includes('xmlUrl="https://example.com?foo=1&amp;bar=2"'));
  });

  it('uses url as title when title is missing', () => {
    const feeds = [{ url: 'https://example.com/feed' }];
    const opml = Storage.exportOPML(feeds);
    assert.ok(opml.includes('title="https://example.com/feed"'));
  });

  it('exports empty body when no feeds', () => {
    const opml = Storage.exportOPML([]);
    assert.ok(opml.includes('<body>'));
    assert.ok(opml.includes('</body>'));
    assert.ok(!opml.includes('<outline'));
  });
});

describe('OPML round-trip', () => {
  const Storage = loadStorage();

  it('export then parse preserves feed data', () => {
    const feeds = [
      { id: '1', title: 'Wait But Why', url: 'https://waitbutwhy.com/feed' },
      { id: '2', title: 'Substack Blog', url: 'https://blog.substack.com/feed' },
      { id: '3', title: 'YouTube - Veritasium', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC0pQPLQvijaB9eXyEcUA' },
    ];
    const opml = Storage.exportOPML(feeds);
    const parsed = Storage.parseOPML(opml);
    assert.strictEqual(parsed.length, feeds.length);
    for (let i = 0; i < feeds.length; i++) {
      assert.strictEqual(parsed[i].title, feeds[i].title);
      assert.strictEqual(parsed[i].url, feeds[i].url);
    }
  });

  it('parse then export preserves feed data', () => {
    const opml = `<?xml version="1.0"?>
<opml version="2.0"><body>
  <outline type="rss" title="Test Feed" xmlUrl="https://test.com/feed.xml"/>
</body></opml>`;
    const parsed = Storage.parseOPML(opml);
    const exported = Storage.exportOPML(parsed.map((p) => ({ ...p, id: 'x' })));
    const reparsed = Storage.parseOPML(exported);
    assert.strictEqual(reparsed.length, 1);
    assert.strictEqual(reparsed[0].title, 'Test Feed');
    assert.strictEqual(reparsed[0].url, 'https://test.com/feed.xml');
  });
});
