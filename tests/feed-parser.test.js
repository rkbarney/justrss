/**
 * Feed parser tests (parseXML, parseRSS2JSON).
 * Run with: npm test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadFeedParser() {
  const code = readFileSync(join(__dirname, '../js/feed-parser.js'), 'utf8');
  const html = `<!DOCTYPE html><html><body><script>${code}</script></body></html>`;
  const dom = new JSDOM(html, {
    url: 'http://localhost',
    runScripts: 'dangerously',
  });
  return dom.window.FeedParser;
}

const SAMPLE_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>Test Blog</title>
  <link>https://example.com</link>
  <description>A test blog</description>
  <item>
    <title>First Post</title>
    <link>https://example.com/1</link>
    <pubDate>Mon, 01 Jan 2024 12:00:00 GMT</pubDate>
    <description>Post content</description>
  </item>
  <item>
    <title>Second Post</title>
    <link>https://example.com/2</link>
    <pubDate>Tue, 02 Jan 2024 12:00:00 GMT</pubDate>
  </item>
</channel>
</rss>`;

const SAMPLE_ATOM = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Feed</title>
  <link rel="alternate" href="https://atom.example.com"/>
  <entry>
    <title>Atom Entry</title>
    <link rel="alternate" href="https://atom.example.com/entry/1"/>
    <content>Entry content</content>
    <updated>2024-01-01T12:00:00Z</updated>
  </entry>
</feed>`;

const SAMPLE_YOUTUBE_ATOM = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:yt="http://www.youtube.com/xml/schemas/2015">
  <title>Videos</title>
  <link href="https://www.youtube.com/feeds/videos.xml?channel_id=UC0pQPLQvijaB9eXyEcUA"/>
  <entry>
    <title>Video Title</title>
    <link href="https://www.youtube.com/watch?v=abc123"/>
    <author><name>Veritasium</name></author>
    <yt:duration seconds="600"/>
  </entry>
</feed>`;

const SAMPLE_RSS2JSON = {
  status: 'ok',
  feed: { title: 'JSON Feed', link: 'https://json.example.com' },
  items: [
    { title: 'Item 1', link: 'https://json.example.com/1', pubDate: 'Wed, 03 Jan 2024 12:00:00 GMT', content: 'Content 1' },
    { title: 'Item 2', link: 'https://json.example.com/2', duration: '5:30' },
  ],
};

describe('FeedParser parseXML (RSS)', () => {
  const FeedParser = loadFeedParser();

  it('parses RSS 2.0 channel and items', () => {
    const feed = FeedParser.parseXML(SAMPLE_RSS);
    assert.strictEqual(feed.title, 'Test Blog');
    assert.strictEqual(feed.link, 'https://example.com');
    assert.strictEqual(feed.items.length, 2);
    assert.strictEqual(feed.items[0].title, 'First Post');
    assert.strictEqual(feed.items[0].link, 'https://example.com/1');
    assert.strictEqual(feed.items[1].title, 'Second Post');
  });

  it('parses pubDate to timestamp', () => {
    const feed = FeedParser.parseXML(SAMPLE_RSS);
    assert.ok(typeof feed.items[0].published === 'number');
    assert.ok(feed.items[0].published > 0);
  });
});

describe('FeedParser parseXML (Atom)', () => {
  const FeedParser = loadFeedParser();

  it('parses Atom feed and entries', () => {
    const feed = FeedParser.parseXML(SAMPLE_ATOM);
    assert.strictEqual(feed.title, 'Atom Feed');
    assert.strictEqual(feed.link, 'https://atom.example.com');
    assert.strictEqual(feed.items.length, 1);
    assert.strictEqual(feed.items[0].title, 'Atom Entry');
    assert.strictEqual(feed.items[0].link, 'https://atom.example.com/entry/1');
  });
});

describe('FeedParser parseXML (YouTube Atom)', () => {
  const FeedParser = loadFeedParser();

  it('parses YouTube feed with generic title', () => {
    const feed = FeedParser.parseXML(SAMPLE_YOUTUBE_ATOM);
    assert.strictEqual(feed.title, 'Videos');
    assert.strictEqual(feed.items.length, 1);
    assert.strictEqual(feed.items[0].author, 'Veritasium');
  });

  it('parses YouTube duration in seconds', () => {
    const feed = FeedParser.parseXML(SAMPLE_YOUTUBE_ATOM);
    assert.strictEqual(feed.items[0].durationSeconds, 600);
  });
});

describe('FeedParser parseRSS2JSON', () => {
  const FeedParser = loadFeedParser();

  it('parses RSS2JSON format', () => {
    const feed = FeedParser.parseRSS2JSON(SAMPLE_RSS2JSON);
    assert.strictEqual(feed.title, 'JSON Feed');
    assert.strictEqual(feed.link, 'https://json.example.com');
    assert.strictEqual(feed.items.length, 2);
    assert.strictEqual(feed.items[0].title, 'Item 1');
    assert.strictEqual(feed.items[1].title, 'Item 2');
  });

  it('parses duration string (mm:ss)', () => {
    const feed = FeedParser.parseRSS2JSON(SAMPLE_RSS2JSON);
    assert.strictEqual(feed.items[1].durationSeconds, 330); // 5*60 + 30
  });
});

describe('FeedParser parseXML (invalid)', () => {
  const FeedParser = loadFeedParser();

  it('throws on invalid XML', () => {
    assert.throws(() => FeedParser.parseXML('not valid xml <<<'), /Invalid XML/);
  });
});
