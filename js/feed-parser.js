/**
 * Fetch and parse RSS 2.0 / Atom feeds. Uses configurable CORS proxy.
 */

function getProxyUrl(proxyBase, feedUrl) {
  if (proxyBase.includes('rss2json')) {
    return `${proxyBase}${encodeURIComponent(feedUrl)}`;
  }
  return `${proxyBase}${encodeURIComponent(feedUrl)}`;
}

async function fetchFeed(url, proxyBase) {
  const fullUrl = getProxyUrl(proxyBase, url);
  const res = await fetch(fullUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  if (proxyBase.includes('rss2json')) {
    const json = JSON.parse(text);
    if (json.status !== 'ok') throw new Error(json.message || 'RSS2JSON error');
    return { type: 'rss2json', data: json, raw: text };
  }
  return { type: 'xml', raw: text };
}

function parseRSS2JSON(data) {
  const feed = {
    title: data.feed?.title || data.title || 'Untitled',
    description: data.feed?.description || data.description || '',
    link: data.feed?.link || data.link || '',
    items: (data.items || []).map((item) => ({
      title: item.title || '(No title)',
      link: item.link || item.url || '',
      content: item.content || item.description || '',
      published: item.pubDate ? new Date(item.pubDate).getTime() : Date.now(),
      author: item.author || '',
      image: item.thumbnail || item.enclosure?.link || '',
    })),
  };
  return feed;
}

function parseXML(raw) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(raw, 'text/xml');
  const parseError = doc.querySelector('parsererror');
  if (parseError) throw new Error('Invalid XML');

  const isAtom = doc.documentElement?.localName === 'feed';
  if (isAtom) return parseAtom(doc);
  return parseRSS(doc);
}

function parseRSS(doc) {
  const channel = doc.querySelector('channel');
  const title = channel?.querySelector('title')?.textContent?.trim() || 'Untitled';
  const description = channel?.querySelector('description')?.textContent?.trim() || '';
  const link = channel?.querySelector('link')?.textContent?.trim() || '';

  const items = [];
  const itemEls = doc.querySelectorAll('channel > item');
  itemEls.forEach((item) => {
    const itemTitle = item.querySelector('title')?.textContent?.trim() || '(No title)';
    const itemLink = item.querySelector('link')?.textContent?.trim() || '';
    const guid = item.querySelector('guid')?.textContent?.trim() || itemLink;
    const desc = item.querySelector('description')?.textContent?.trim() || '';
    const content = item.querySelector('content\\:encoded')?.textContent?.trim()
      || item.querySelector('content')?.textContent?.trim()
      || desc;
    const dateEl = item.querySelector('pubDate') || item.querySelector('date');
    const published = dateEl ? new Date(dateEl.textContent).getTime() : Date.now();
    const author = item.querySelector('creator')?.textContent?.trim()
      || item.querySelector('author')?.textContent?.trim() || '';
    const enclosure = item.querySelector('enclosure');
    const image = enclosure?.getAttribute('type')?.startsWith('image/')
      ? enclosure.getAttribute('url') : '';

    items.push({
      title: itemTitle,
      link: itemLink || guid,
      content,
      published: Number.isNaN(published) ? Date.now() : published,
      author,
      image: image || '',
    });
  });

  return { title, description, link, items };
}

function parseAtom(doc) {
  const root = doc.documentElement;
  const ns = root.getAttribute('xmlns') || '';
  const title = root.querySelector('title')?.textContent?.trim() || 'Untitled';
  const linkEl = root.querySelector('link[rel="alternate"], link[type="text/html"]');
  const link = linkEl?.getAttribute('href')?.trim() || '';

  const items = [];
  const entries = doc.querySelectorAll('entry');
  entries.forEach((entry) => {
    const itemTitle = entry.querySelector('title')?.textContent?.trim() || '(No title)';
    const linkEntry = entry.querySelector('link[rel="alternate"], link[type="text/html"]') || entry.querySelector('link');
    const itemLink = linkEntry?.getAttribute('href')?.trim() || '';
    const contentEl = entry.querySelector('content') || entry.querySelector('summary');
    const content = contentEl?.textContent?.trim() || (contentEl?.innerHTML?.trim()) || '';
    const updated = entry.querySelector('updated') || entry.querySelector('published');
    const published = updated ? new Date(updated.textContent).getTime() : Date.now();
    const authorEl = entry.querySelector('author name');
    const author = authorEl?.textContent?.trim() || '';

    items.push({
      title: itemTitle,
      link: itemLink,
      content,
      published: Number.isNaN(published) ? Date.now() : published,
      author,
      image: '',
    });
  });

  return { title, description: '', link, items };
}

/**
 * Normalize known site URLs to their RSS/feed URL (Substack, YouTube).
 * Returns the feed URL if we can derive it, otherwise null.
 */
async function normalizeInputToFeedUrl(inputUrl, proxyBase) {
  let url;
  try {
    url = new URL(inputUrl.startsWith('http') ? inputUrl : 'https://' + inputUrl);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();

  // Substack: https://anything.substack.com → https://anything.substack.com/feed
  if (host.endsWith('.substack.com')) {
    return url.origin + '/feed';
  }

  // YouTube: channel page or feed-style URL
  if (host === 'www.youtube.com' || host === 'youtube.com' || host === 'm.youtube.com') {
    const path = url.pathname;
    // /channel/UCxxxxxxxxxxxxxxxxxxxxxx → feed
    const channelMatch = path.match(/^\/channel\/(UC[\w-]{22})/i);
    if (channelMatch) {
      return `https://www.youtube.com/feeds/videos.xml?channel_id=${channelMatch[1]}`;
    }
    // /@handle or /c/name or /user/name → fetch page and find channel ID
    const handleMatch = path.match(/^\/(@[\w.-]+)/);
    const cMatch = path.match(/^\/c\/([\w.-]+)/);
    const userMatch = path.match(/^\/user\/([\w.-]+)/);
    if (handleMatch || cMatch || userMatch) {
      const pageUrl = url.origin + path;
      const fullUrl = getProxyUrl(proxyBase, pageUrl);
      const res = await fetch(fullUrl);
      const html = await res.text();
      const channelIdMatch = html.match(/"channelId"\s*:\s*"(UC[\w-]{22})"/) ||
        html.match(/youtube\.com\/channel\/(UC[\w-]{22})/);
      if (channelIdMatch) {
        return `https://www.youtube.com/feeds/videos.xml?channel_id=${channelIdMatch[1]}`;
      }
    }
  }

  return null;
}

/**
 * Resolve feed URL from a website URL (discover RSS/Atom link).
 */
async function discoverFeedUrl(websiteUrl, proxyBase) {
  const normalized = websiteUrl.replace(/\/$/, '');
  const fullUrl = getProxyUrl(proxyBase, normalized);
  const res = await fetch(fullUrl);
  const html = await res.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const links = doc.querySelectorAll('link[type="application/rss+xml"], link[type="application/atom+xml"], link[type="application/feed+json"]');
  for (const el of links) {
    const href = el.getAttribute('href');
    if (!href) continue;
    let url = href.startsWith('http') ? href : new URL(href, normalized).href;
    return url;
  }
  return null;
}

/**
 * Fetch, parse, and return normalized feed + items.
 */
async function fetchAndParse(feedUrl, proxyBase) {
  const result = await fetchFeed(feedUrl, proxyBase);
  let feed;
  if (result.type === 'rss2json') {
    feed = parseRSS2JSON(result.data);
  } else {
    feed = parseXML(result.raw);
  }
  return feed;
}

window.FeedParser = {
  fetchFeed,
  fetchAndParse,
  discoverFeedUrl,
  normalizeInputToFeedUrl,
  parseOPML: () => {}, // use Storage.parseOPML
};
