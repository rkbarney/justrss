/**
 * Storage layer: IndexedDB for feeds + articles, localStorage for settings.
 * OPML import/export.
 */

const DB_NAME = 'justrss-db';
const DB_VERSION = 1;
const STORE_FEEDS = 'feeds';
const STORE_ARTICLES = 'articles';
const STORE_META = 'meta';

let db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    if (db) {
      resolve(db);
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      db = req.result;
      resolve(db);
    };
    req.onupgradeneeded = (e) => {
      const database = e.target.result;
      if (!database.objectStoreNames.contains(STORE_FEEDS)) {
        database.createObjectStore(STORE_FEEDS, { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains(STORE_ARTICLES)) {
        const os = database.createObjectStore(STORE_ARTICLES, { keyPath: 'id' });
        os.createIndex('feedId', 'feedId', { unique: false });
        os.createIndex('published', 'published', { unique: false });
        os.createIndex('read', 'read', { unique: false });
        os.createIndex('starred', 'starred', { unique: false });
      }
      if (!database.objectStoreNames.contains(STORE_META)) {
        database.createObjectStore(STORE_META, { keyPath: 'key' });
      }
    };
  });
}

function id() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// --- Feeds ---

async function getFeeds() {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_FEEDS, 'readonly');
    const req = tx.objectStore(STORE_FEEDS).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function addFeed(feed) {
  const database = await openDB();
  const withId = { ...feed, id: feed.id || id() };
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_FEEDS, 'readwrite');
    tx.objectStore(STORE_FEEDS).put(withId);
    tx.oncomplete = () => resolve(withId);
    tx.onerror = () => reject(tx.error);
  });
}

async function updateFeed(feed) {
  return addFeed(feed);
}

async function deleteFeed(feedId) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_FEEDS, STORE_ARTICLES], 'readwrite');
    tx.objectStore(STORE_FEEDS).delete(feedId);
    const idx = tx.objectStore(STORE_ARTICLES).index('feedId');
    const range = IDBKeyRange.only(feedId);
    idx.openCursor(range).onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function reorderFeeds(orderedIds) {
  const feeds = await getFeeds();
  const byId = Object.fromEntries(feeds.map((f) => [f.id, f]));
  let order = 0;
  for (const fid of orderedIds) {
    if (byId[fid]) {
      byId[fid].order = order++;
      await updateFeed(byId[fid]);
    }
  }
  for (const f of feeds) {
    if (!orderedIds.includes(f.id)) {
      f.order = order++;
      await updateFeed(f);
    }
  }
}

// --- Articles ---

async function getArticles(options = {}) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_ARTICLES, 'readonly');
    const store = tx.objectStore(STORE_ARTICLES);
    const idx = options.feedId ? store.index('feedId') : store.index('published');
    const range = options.feedId ? IDBKeyRange.only(options.feedId) : null;
    const req = range ? idx.getAll(range) : idx.getAll();
    req.onsuccess = () => {
      let list = req.result || [];
      if (options.starredOnly) list = list.filter((a) => a.starred);
      if (options.unreadOnly) list = list.filter((a) => !a.read);
      list.sort((a, b) => (b.published || 0) - (a.published || 0));
      if (options.limit) list = list.slice(0, options.limit);
      resolve(list);
    };
    req.onerror = () => reject(req.error);
  });
}

async function getArticle(articleId) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_ARTICLES, 'readonly');
    const req = tx.objectStore(STORE_ARTICLES).get(articleId);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function articleId(feedId, link) {
  return btoa(encodeURIComponent(feedId + '|' + (link || ''))).replace(/[/+=]/g, '_').slice(0, 120);
}

async function upsertArticles(feedId, items) {
  const database = await openDB();
  const existing = await getArticles({ feedId });
  const existingIds = new Set(existing.map((a) => a.id));
  const toPut = [];
  for (const item of items) {
    const id = articleId(feedId, item.link);
    const rec = {
      id,
      feedId,
      title: item.title,
      link: item.link,
      content: item.content,
      published: item.published || 0,
      author: item.author,
      image: item.image,
      read: existingIds.has(id) ? (existing.find((a) => a.id === id)?.read ?? false) : false,
      starred: existingIds.has(id) ? (existing.find((a) => a.id === id)?.starred ?? false) : false,
    };
    toPut.push(rec);
  }
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_ARTICLES, 'readwrite');
    const store = tx.objectStore(STORE_ARTICLES);
    for (const r of toPut) store.put(r);
    tx.oncomplete = () => resolve(toPut.length);
    tx.onerror = () => reject(tx.error);
  });
}

async function markArticleRead(articleId, read = true) {
  const a = await getArticle(articleId);
  if (!a) return;
  a.read = read;
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_ARTICLES, 'readwrite');
    tx.objectStore(STORE_ARTICLES).put(a);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function markArticleStarred(articleId, starred = true) {
  const a = await getArticle(articleId);
  if (!a) return;
  a.starred = starred;
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_ARTICLES, 'readwrite');
    tx.objectStore(STORE_ARTICLES).put(a);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// --- Settings (localStorage) ---

const SETTINGS_KEY = 'justrss-settings';
const DEFAULTS = {
  theme: 'auto',
  refreshInterval: 30,
  fontSize: 18,
  proxy: 'https://api.allorigins.win/raw?url=',
};

function getSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    return { ...DEFAULTS, ...s };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

// --- OPML ---

function exportOPML(feeds) {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<opml version="2.0">',
    '  <head><title>RSS Reader Export</title></head>',
    '  <body>',
  ];
  for (const f of feeds) {
    const title = (f.title || f.url || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const url = (f.url || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    lines.push(`    <outline type="rss" title="${title}" xmlUrl="${url}"/>`);
  }
  lines.push('  </body>', '</opml>');
  return lines.join('\n');
}

function parseOPML(xmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');
  const outlines = doc.querySelectorAll('outline[type="rss"], outline[xmlUrl]');
  const feeds = [];
  outlines.forEach((el) => {
    const url = el.getAttribute('xmlUrl') || el.getAttribute('url');
    if (url) {
      feeds.push({
        url,
        title: el.getAttribute('title') || url,
      });
    }
  });
  return feeds;
}

// --- Clear all ---

async function clearAllData() {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_FEEDS, STORE_ARTICLES, STORE_META], 'readwrite');
    tx.objectStore(STORE_FEEDS).clear();
    tx.objectStore(STORE_ARTICLES).clear();
    tx.objectStore(STORE_META).clear();
    tx.oncomplete = () => {
      localStorage.removeItem(SETTINGS_KEY);
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

// Export
window.Storage = {
  getFeeds,
  addFeed,
  updateFeed,
  deleteFeed,
  reorderFeeds,
  getArticles,
  getArticle,
  upsertArticles,
  markArticleRead,
  markArticleStarred,
  getSettings,
  saveSettings,
  exportOPML,
  parseOPML,
  clearAllData,
  articleId,
};
