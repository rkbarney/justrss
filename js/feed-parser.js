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
    items: (data.items || []).map((item) => {
      let durationSeconds = 0;
      if (item.duration != null) {
        if (typeof item.duration === 'number') durationSeconds = item.duration;
        else {
          const s = String(item.duration).trim();
          const parts = s.split(':').map((p) => parseInt(p, 10) || 0).reverse();
          durationSeconds = parts.reduce((acc, p, i) => acc + p * Math.pow(60, i), 0);
        }
      }
      return {
        title: item.title || '(No title)',
        link: item.link || item.url || '',
        content: item.content || item.description || '',
        published: item.pubDate ? new Date(item.pubDate).getTime() : Date.now(),
        author: item.author || '',
        image: item.thumbnail || item.enclosure?.link || '',
        durationSeconds: durationSeconds || undefined,
      };
    }),
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
    let content = contentEl?.textContent?.trim() || (contentEl?.innerHTML?.trim()) || '';
    const mediaNs = 'http://search.yahoo.com/mrss/';
    const mediaDesc = entry.getElementsByTagNameNS(mediaNs, 'description')[0];
    if (!content && mediaDesc) content = mediaDesc.textContent?.trim() || '';
    const mediaThumb = entry.getElementsByTagNameNS(mediaNs, 'thumbnail')[0];
    const thumbUrl = mediaThumb?.getAttribute('url') || '';
    const updated = entry.querySelector('updated') || entry.querySelector('published');
    const published = updated ? new Date(updated.textContent).getTime() : Date.now();
    const authorEl = entry.querySelector('author name');
    const author = authorEl?.textContent?.trim() || '';
    let durationSeconds = 0;
    const ytNs = ['http://gdata.youtube.com/schemas/2007', 'http://www.youtube.com/xml/schemas/2015'];
    for (const ns of ytNs) {
      const durationEl = entry.getElementsByTagNameNS(ns, 'duration')[0];
      if (durationEl) {
        const sec = durationEl.getAttribute('seconds');
        if (sec) durationSeconds = parseInt(sec, 10) || 0;
        break;
      }
    }

    items.push({
      title: itemTitle,
      link: itemLink,
      content,
      published: Number.isNaN(published) ? Date.now() : published,
      author,
      image: thumbUrl || '',
      durationSeconds: durationSeconds || undefined,
    });
  });

  return { title, description: '', link, items };
}

function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Extract YouTube channel ID from a channel URL (sync, no fetch).
 * Returns channelId or null.
 */
function getYouTubeChannelIdFromUrl(inputUrl) {
  try {
    const url = new URL(inputUrl.startsWith('http') ? inputUrl : 'https://' + inputUrl);
    const host = url.hostname.toLowerCase();
    if (host !== 'www.youtube.com' && host !== 'youtube.com' && host !== 'm.youtube.com') return null;
    const path = url.pathname.replace(/\/$/, '') || '/';
    const m = path.match(/^\/channel\/(UC[\w-]{21,24})/i);
    return m ? m[1].slice(0, 24) : null;
  } catch {
    return null;
  }
}

/**
 * Build standard YouTube feed URLs from channel ID. No fetch required.
 * YouTube uses deterministic URLs: channel_id for All, UULF/UUSH/UULV + suffix for Videos/Shorts/Live.
 * Returns [{ title, url }] - same format as News Keeper and other tools.
 */
function getYouTubeFeedsFromChannelId(channelId) {
  if (!channelId || !/^UC[\w-]{21,24}$/i.test(channelId)) return [];
  const suffix = channelId.slice(2); // drop "UC" prefix
  return [
    { title: 'All', url: `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}` },
    { title: 'Videos', url: `https://www.youtube.com/feeds/videos.xml?playlist_id=UULF${suffix}` },
    { title: 'Shorts', url: `https://www.youtube.com/feeds/videos.xml?playlist_id=UUSH${suffix}` },
    { title: 'Live', url: `https://www.youtube.com/feeds/videos.xml?playlist_id=UULV${suffix}` },
  ];
}

/**
 * Extract all feed options from ytInitialData (channel + playlists). No guessing.
 * Returns [{ title, url }]. Only what the page JSON actually has.
 * @deprecated Prefer getYouTubeFeedsFromChannelId for All/Videos/Shorts/Live - no fetch needed.
 */
function extractFeedsFromYtInitialData(html) {
  const feeds = [];
  const seenUrls = new Set();
  let channelTitle = null;
  let channelId = null;
  const start = html.indexOf('ytInitialData');
  if (start === -1) return [];
  const dataStart = html.indexOf('{', start);
  if (dataStart === -1) return [];
  let depth = 0;
  let end = dataStart;
  for (let i = dataStart; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}') {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  try {
    const json = JSON.parse(html.slice(dataStart, end));
    const titleText = (t) => {
      if (!t) return '';
      if (typeof t === 'string') return t.replace(/&amp;/g, '&').trim();
      return (t.simpleText || t.runs?.[0]?.text || '').replace(/&amp;/g, '&').trim();
    };
    const walk = (obj) => {
      if (!obj || typeof obj !== 'object') return;
      if (obj.channelId && /^UC[\w-]{21,24}$/i.test(obj.channelId)) {
        channelId = obj.channelId;
        if (obj.title) channelTitle = channelTitle || titleText(obj.title);
      }
      if (obj.metadata && obj.metadata.channelMetadataRenderer) {
        const m = obj.metadata.channelMetadataRenderer;
        if (m.channelId) channelId = m.channelId;
        if (m.title) channelTitle = channelTitle || m.title;
      }
      if (obj.playlistId && obj.title) {
        const title = titleText(obj.title);
        if (!title) return;
        const url = `https://www.youtube.com/feeds/videos.xml?playlist_id=${obj.playlistId}`;
        if (!seenUrls.has(url)) {
          seenUrls.add(url);
          feeds.push({ title, url });
        }
        return;
      }
      if (Array.isArray(obj)) obj.forEach(walk);
      else for (const k of Object.keys(obj)) walk(obj[k]);
    };
    walk(json);
    if (channelId && (channelTitle || feeds.length > 0)) {
      const allUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
      if (!seenUrls.has(allUrl)) {
        seenUrls.add(allUrl);
        feeds.unshift({ title: channelTitle || 'All', url: allUrl });
      }
    }
  } catch (e) {
    return [];
  }
  return feeds;
}

/**
 * Fetch channel page and return only custom playlists (PL*), excluding standard All/Videos/Shorts/Live.
 * Returns [{ title, url }]. Used to augment getYouTubeFeedsFromChannelId with channel-specific playlists.
 */
async function getYouTubeCustomPlaylistsFromPage(channelId, proxyBase) {
  const playlistsUrl = `https://www.youtube.com/channel/${channelId}/playlists`;
  const fullUrl = getProxyUrl(proxyBase, playlistsUrl);
  const res = await fetch(fullUrl);
  if (!res.ok) return [];
  const html = await res.text();
  const allFeeds = extractFeedsFromYtInitialData(html);
  const isStandard = (url) => /playlist_id=(UULF|UUSH|UULV)[\w-]+/.test(url);
  return allFeeds
    .filter((f) => !f.url.includes('channel_id=') && !isStandard(f.url))
    .map((f) => ({ ...f, title: f.title.startsWith('Playlist - ') ? f.title : `Playlist - ${f.title}` }));
}

/**
 * Fetch channel page and return only the feed options present in the page JSON.
 * Returns [{ title, url }]. Empty if parse fails.
 */
async function getYouTubeFeedsFromPage(channelId, proxyBase) {
  const pageUrl = `https://www.youtube.com/channel/${channelId}`;
  const fullUrl = getProxyUrl(proxyBase, pageUrl);
  const res = await fetch(fullUrl);
  if (!res.ok) return [];
  const html = await res.text();
  let feeds = extractFeedsFromYtInitialData(html);
  if (feeds.length > 0) return feeds;
  const playlistsUrl = `https://www.youtube.com/channel/${channelId}/playlists`;
  const res2 = await fetch(getProxyUrl(proxyBase, playlistsUrl));
  if (!res2.ok) return [];
  return extractFeedsFromYtInitialData(await res2.text());
}

/**
 * Extract channel ID from partial HTML. Prefer channelMetadataRenderer (main channel) so we don't
 * get a related/clips channel. Stop as soon as we have a match.
 */
function extractChannelIdFromHtml(html) {
  const ucId = /(?:channelId|externalId|browseId)"\s*:\s*"(UC[\w-]{21,24})"/;
  const metaIdx = html.indexOf('channelMetadataRenderer');
  if (metaIdx !== -1) {
    const slice = html.slice(metaIdx, metaIdx + 500);
    const m = slice.match(ucId);
    if (m) return m[1].slice(0, 24);
  }
  const m = html.match(ucId);
  if (m) return m[1].slice(0, 24);
  const channelUrl = html.match(/youtube\.com\/channel\/(UC[\w-]{21,24})/);
  if (channelUrl) return channelUrl[1].slice(0, 24);
  const pathChannel = html.match(/\/channel\/(UC[\w-]{21,24})/);
  if (pathChannel) return pathChannel[1].slice(0, 24);
  return null;
}

/**
 * Piped API instances (no API key). /c/:name returns channel JSON with "id". Try first for fast resolve.
 * See https://docs.piped.video/docs/api-documentation/
 */
const PIPED_API_BASES = [
  'https://pipedapi.kavin.rocks',
  'https://api.piped.yt',
];

/**
 * Fast path: resolve @handle or /c/name via Piped API (lightweight JSON, no CORS proxy). Returns channelId or null.
 */
async function resolveYouTubeChannelIdViaPiped(inputUrl) {
  let path;
  try {
    const u = new URL(inputUrl.startsWith('http') ? inputUrl : 'https://' + inputUrl);
    if (!/youtube\.com|youtube\.co\.uk/i.test(u.hostname)) return null;
    path = u.pathname.replace(/\/$/, '') || '/';
  } catch {
    return null;
  }
  const handleMatch = path.match(/^\/(@)([\w.-]+)/);
  const cMatch = path.match(/^\/c\/([\w.-]+)/);
  const userMatch = path.match(/^\/user\/([\w.-]+)/);
  const name = handleMatch ? handleMatch[2] : (cMatch ? cMatch[1] : (userMatch ? userMatch[1] : null));
  if (!name) return null;
  for (const base of PIPED_API_BASES) {
    try {
      const res = await fetch(`${base}/c/${encodeURIComponent(name)}`);
      if (!res.ok) continue;
      const data = await res.json();
      const id = data?.id && /^UC[\w-]{21,24}$/.test(data.id) ? data.id : null;
      if (id) return id;
    } catch (e) {
      continue;
    }
  }
  return null;
}

/**
 * Resolve YouTube @handle or /c/ URL to channel ID. Tries Piped API first (fast); else fetches channel page via proxy.
 * Prefers channelMetadataRenderer in HTML so we get the main channel, not a related one (e.g. Clips).
 */
async function resolveYouTubeChannelId(inputUrl, proxyBase) {
  const channelId = getYouTubeChannelIdFromUrl(inputUrl);
  if (channelId) return channelId;
  let url;
  try {
    url = new URL(inputUrl.startsWith('http') ? inputUrl : 'https://' + inputUrl);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (host !== 'www.youtube.com' && host !== 'youtube.com' && host !== 'm.youtube.com') return null;
  const path = url.pathname.replace(/\/$/, '') || '/';
  const handleMatch = path.match(/^\/(@[\w.-]+)/);
  const cMatch = path.match(/^\/c\/([\w.-]+)/);
  const userMatch = path.match(/^\/user\/([\w.-]+)/);
  if (!handleMatch && !cMatch && !userMatch) return null;

  const urlsToTry = [`https://m.youtube.com${path}`, `https://www.youtube.com${path}`];
  for (const pageUrl of urlsToTry) {
    try {
      const fullUrl = getProxyUrl(proxyBase, pageUrl);
      const res = await fetch(fullUrl);
      if (!res.ok) continue;
      const html = await res.text();
      const id = extractChannelIdFromHtml(html);
      if (id) return id;
    } catch (e) {
      continue;
    }
  }
  return null;
}

/**
 * Resolve @handle to channel ID. Tries: (1) URL has channel ID, (2) Piped API (fast), (3) all proxies in parallel.
 */
async function resolveYouTubeChannelIdParallel(inputUrl, proxyList) {
  const fromUrl = getYouTubeChannelIdFromUrl(inputUrl);
  if (fromUrl) return fromUrl;
  const fromPiped = await resolveYouTubeChannelIdViaPiped(inputUrl);
  if (fromPiped) return fromPiped;
  const results = await Promise.allSettled(
    proxyList.map((proxy) => resolveYouTubeChannelId(inputUrl, proxy))
  );
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) return r.value;
  }
  return null;
}

/**
 * Normalize known site URLs to their RSS/feed URL (Substack, YouTube).
 * For YouTube we return the "All" feed when normalizing (e.g. for import).
 */
async function normalizeInputToFeedUrl(inputUrl, proxyBase) {
  let url;
  try {
    url = new URL(inputUrl.startsWith('http') ? inputUrl : 'https://' + inputUrl);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();

  if (host.endsWith('.substack.com')) {
    const base = url.origin.replace(/\/$/, '');
    return base + '/feed';
  }

  if (host === 'www.youtube.com' || host === 'youtube.com' || host === 'm.youtube.com') {
    const channelId = await resolveYouTubeChannelId(inputUrl, proxyBase);
    if (channelId) return `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
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

const YOUTUBE_GENERIC_TITLES = ['Videos', 'Shorts', 'Live', 'All'];

/**
 * Fetch, parse, and return normalized feed + items.
 * For YouTube feeds with generic channel title (e.g. "Videos"), use first item's author as channel name.
 */
async function fetchAndParse(feedUrl, proxyBase) {
  const result = await fetchFeed(feedUrl, proxyBase);
  let feed;
  if (result.type === 'rss2json') {
    feed = parseRSS2JSON(result.data);
  } else {
    feed = parseXML(result.raw);
  }
  if (feedUrl && feedUrl.includes('youtube.com/feeds/videos.xml') &&
      YOUTUBE_GENERIC_TITLES.includes(feed.title?.trim()) &&
      feed.items?.length > 0) {
    const author = (feed.items[0].author || '').trim();
    if (author) feed.title = `${author} - ${feed.title.trim()}`;
  }
  return feed;
}

window.FeedParser = {
  fetchFeed,
  fetchAndParse,
  parseXML,
  parseRSS2JSON,
  discoverFeedUrl,
  normalizeInputToFeedUrl,
  resolveYouTubeChannelId,
  resolveYouTubeChannelIdParallel,
  getYouTubeChannelIdFromUrl,
  getYouTubeFeedsFromChannelId,
  getYouTubeCustomPlaylistsFromPage,
  getYouTubeFeedsFromPage,
  formatDuration,
  parseOPML: () => {}, // use Storage.parseOPML
};
