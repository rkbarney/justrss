/**
 * RTL support tests.
 * Verifies that Arabic/Hebrew/RTL content gets dir="auto" on the right elements,
 * and that LTR content is unaffected.
 * Run with: npm test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadUI() {
  const feedParserCode = readFileSync(join(__dirname, '../js/feed-parser.js'), 'utf8');
  const uiCode = readFileSync(join(__dirname, '../js/ui.js'), 'utf8');

  const html = `<!DOCTYPE html><html><body>
    <div id="view-all">
      <div id="article-list-container">
        <div id="article-list"></div>
      </div>
      <div id="empty-state" hidden></div>
    </div>
    <div id="view-article">
      <a id="article-title" href="#"></a>
      <div id="article-meta"></div>
      <div id="article-body"></div>
      <a id="article-link" href="#"></a>
    </div>
    <script>${feedParserCode}</script>
    <script>${uiCode}</script>
  </body></html>`;

  const dom = new JSDOM(html, { url: 'http://localhost', runScripts: 'dangerously' });
  return dom.window;
}

const ARABIC_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>الجزيرة</title>
  <link>https://aljazeera.example.com</link>
  <description>أخبار عربية</description>
  <item>
    <title>عاجل: أخبار اليوم في العالم العربي</title>
    <link>https://aljazeera.example.com/1</link>
    <pubDate>Mon, 01 Jan 2024 12:00:00 GMT</pubDate>
    <description>هذا هو وصف المقال باللغة العربية وهو نص طويل بما يكفي لاختبار الاقتطاع والعرض الصحيح.</description>
  </item>
</channel>
</rss>`;

const ENGLISH_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>English News</title>
  <link>https://news.example.com</link>
  <description>English language news</description>
  <item>
    <title>Breaking: News from around the world</title>
    <link>https://news.example.com/1</link>
    <pubDate>Mon, 01 Jan 2024 12:00:00 GMT</pubDate>
    <description>This is an English article description that is long enough to test truncation and correct rendering.</description>
  </item>
</channel>
</rss>`;

describe('RTL: feed parser handles Arabic content', () => {
  it('parses Arabic titles and descriptions without corruption', () => {
    const dom = new JSDOM('', { url: 'http://localhost', runScripts: 'dangerously' });
    const code = readFileSync(join(__dirname, '../js/feed-parser.js'), 'utf8');
    dom.window.eval(code);
    const feed = dom.window.FeedParser.parseXML(ARABIC_RSS);

    assert.strictEqual(feed.title, 'الجزيرة');
    assert.strictEqual(feed.items[0].title, 'عاجل: أخبار اليوم في العالم العربي');
    assert.ok(feed.items[0].content.includes('العربية'));
  });
});

describe('RTL: article list renders dir="auto" on titles', () => {
  it('article item title has dir="auto"', () => {
    const win = loadUI();
    const feed = win.FeedParser.parseXML(ARABIC_RSS);
    const articles = feed.items.map((item, i) => ({ ...item, id: String(i), feedId: 'f1', read: false }));
    const feedMap = { f1: { title: 'الجزيرة', url: 'https://aljazeera.example.com' } };

    win.UI.renderArticleList('article-list-container', articles, feedMap);

    const titleEl = win.document.querySelector('.article-item-title');
    assert.ok(titleEl, 'article-item-title element should exist');
    assert.strictEqual(titleEl.getAttribute('dir'), 'auto', 'title should have dir="auto"');
  });

  it('English article item title also has dir="auto" (browser handles LTR correctly)', () => {
    const win = loadUI();
    const feed = win.FeedParser.parseXML(ENGLISH_RSS);
    const articles = feed.items.map((item, i) => ({ ...item, id: String(i), feedId: 'f1', read: false }));
    const feedMap = { f1: { title: 'English News', url: 'https://news.example.com' } };

    win.UI.renderArticleList('article-list-container', articles, feedMap);

    const titleEl = win.document.querySelector('.article-item-title');
    assert.ok(titleEl, 'article-item-title element should exist');
    assert.strictEqual(titleEl.getAttribute('dir'), 'auto', 'LTR title should also have dir="auto" (browser resolves correctly)');
  });
});

describe('RTL: article reader renders dir="auto" on title and body', () => {
  it('article-title element has dir="auto"', () => {
    const win = loadUI();
    const feed = win.FeedParser.parseXML(ARABIC_RSS);
    const article = { ...feed.items[0], id: '1', feedId: 'f1', read: false };
    const feedObj = { title: 'الجزيرة', url: 'https://aljazeera.example.com' };

    win.UI.renderArticleContent(article, feedObj);

    const titleEl = win.document.getElementById('article-title');
    assert.strictEqual(titleEl.getAttribute('dir'), 'auto', 'article-title should have dir="auto"');
  });

  it('article-body element has dir="auto"', () => {
    const win = loadUI();
    const feed = win.FeedParser.parseXML(ARABIC_RSS);
    const article = { ...feed.items[0], id: '1', feedId: 'f1', read: false };
    const feedObj = { title: 'الجزيرة', url: 'https://aljazeera.example.com' };

    win.UI.renderArticleContent(article, feedObj);

    const bodyEl = win.document.getElementById('article-body');
    assert.strictEqual(bodyEl.getAttribute('dir'), 'auto', 'article-body should have dir="auto"');
  });
});
