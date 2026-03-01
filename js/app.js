/**
 * App: init, navigation, feed add/refresh, article open/prev/next, settings, OPML, install.
 */

(function () {
  const Storage = window.Storage;
  const FeedParser = window.FeedParser;
  const UI = window.UI;

  let feeds = [];
  let feedMap = {};
  let refreshTimeout = null;

  function applyTheme() {
    const s = Storage.getSettings();
    UI.setTheme(s.theme);
    UI.setFontSize(s.fontSize);
  }

  async function loadFeeds() {
    feeds = await Storage.getFeeds();
    feeds.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    feedMap = Object.fromEntries(feeds.map((f) => [f.id, f]));
    return feeds;
  }

  async function getUnreadCounts() {
    const articles = await Storage.getArticles({});
    const counts = {};
    articles.forEach((a) => {
      if (!a.read) counts[a.feedId] = (counts[a.feedId] || 0) + 1;
    });
    return counts;
  }

  async function refreshAllFeeds() {
    const settings = Storage.getSettings();
    const proxy = settings.proxy || 'https://api.allorigins.win/raw?url=';
    const list = document.getElementById('article-list');
    const loading = document.getElementById('loading-articles');
    if (loading) loading.hidden = false;

    for (const feed of feeds) {
      try {
        const parsed = await FeedParser.fetchAndParse(feed.url, proxy);
        await Storage.upsertArticles(feed.id, parsed.items);
        if (parsed.title && !feed.title) {
          feed.title = parsed.title;
          await Storage.updateFeed(feed);
        }
      } catch (e) {
        console.warn('Feed refresh failed:', feed.url, e);
      }
    }

    if (loading) loading.hidden = true;
    await renderAll();
    scheduleRefresh();
  }

  function scheduleRefresh() {
    if (refreshTimeout) clearTimeout(refreshTimeout);
    const s = Storage.getSettings();
    const mins = Number(s.refreshInterval) || 0;
    if (mins <= 0) return;
    refreshTimeout = setTimeout(refreshAllFeeds, mins * 60 * 1000);
  }

  async function renderAll() {
    await loadFeeds();
    const [articles, starred, unreadCounts] = await Promise.all([
      Storage.getArticles({ limit: 500 }),
      Storage.getArticles({ starredOnly: true, limit: 500 }),
      getUnreadCounts(),
    ]);

    UI.renderArticleList('article-list', articles, feedMap, { emptyId: 'empty-state' });
    UI.renderArticleList('starred-list', starred, feedMap, { emptyId: 'empty-starred' });
    UI.renderFeedList(feeds, unreadCounts);

    const feedsToolbar = document.querySelector('.feeds-toolbar');
    if (feedsToolbar) feedsToolbar.hidden = feeds.length === 0;

    const empty = document.getElementById('empty-state');
    if (empty) empty.hidden = articles.length > 0;

    // Re-attach list item listeners
    document.getElementById('article-list')?.querySelectorAll('.article-item').forEach((el) => {
      attachArticleItemListeners(el, articles, 'all');
    });
    document.getElementById('starred-list')?.querySelectorAll('.article-item').forEach((el) => {
      attachArticleItemListeners(el, starred, 'starred');
    });
    document.getElementById('feed-list')?.querySelectorAll('.feed-item').forEach((el) => {
      attachFeedItemListeners(el);
    });
  }

  function attachArticleItemListeners(el, list, source) {
    const id = el.dataset.articleId;
    const index = list.findIndex((a) => a.id === id);
    const article = list[index];
    const feed = feedMap[article?.feedId];

    el.addEventListener('click', (e) => {
      if (el.classList.contains('swipe-left') || el.classList.contains('swipe-right')) return;
      if (e.target.closest('.article-item-swipe-hint')) return;
      UI.saveScroll(source === 'all' ? 'all' : 'starred');
      Storage.markArticleRead(id, true);
      UI.showArticle(article, feed, list, index);
      el.classList.remove('unread');
    });

    UI.initSwipe(el, () => {
      Storage.markArticleRead(id, true);
      el.classList.remove('unread');
      renderAll();
    }, () => {
      Storage.markArticleStarred(id, true);
      el.classList.add('starred');
      renderAll();
    });
  }

  function attachFeedItemListeners(el) {
    const feedId = el.dataset.feedId;
    el.querySelector('.feed-item-info')?.addEventListener('click', async () => {
      const articles = await Storage.getArticles({ feedId, limit: 200 });
      const feed = feedMap[feedId];
      UI.saveScroll('all');
      UI.showView('all');
      document.getElementById('view-title').textContent = feed?.title || 'Feed';
      UI.renderArticleList('article-list', articles, feedMap, { emptyId: 'empty-state' });
      document.getElementById('article-list')?.querySelectorAll('.article-item').forEach((item) => {
        const aid = item.dataset.articleId;
        const art = articles.find((a) => a.id === aid);
        const f = feedMap[art?.feedId];
        attachArticleItemListeners(item, articles, 'all');
      });
    });
    el.querySelector('.btn-feed-delete')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm('Remove this feed?')) {
        await Storage.deleteFeed(feedId);
        await renderAll();
      }
    });
  }

  async function addFeed(urlInput) {
    let url = (urlInput || '').trim();
    if (!url) return false;
    if (!url.startsWith('http')) url = 'https://' + url;

    const settings = Storage.getSettings();
    const proxy = settings.proxy || 'https://api.allorigins.win/raw?url=';

    const hint = document.getElementById('feed-url-hint');
    hint.textContent = 'Detecting feed…';

    let feedUrl = url;
    try {
      const discovered = await FeedParser.discoverFeedUrl(url, proxy);
      if (discovered) feedUrl = discovered;
    } catch (e) {
      // might be direct RSS URL
    }

    hint.textContent = 'Fetching…';
    let parsed;
    try {
      parsed = await FeedParser.fetchAndParse(feedUrl, proxy);
    } catch (e) {
      hint.textContent = 'Could not load feed. Check URL or try another proxy in Settings.';
      return false;
    }

    const feed = {
      url: feedUrl,
      title: parsed.title,
      order: feeds.length,
    };
    const saved = await Storage.addFeed(feed);
    await Storage.upsertArticles(saved.id, parsed.items);
    hint.textContent = `Added: ${parsed.title}`;
    await loadFeeds();
    await renderAll();
    return true;
  }

  function wireNavigation() {
    window.addEventListener('hashchange', () => {
      const hash = (window.location.hash || '#all').slice(1);
      const viewId = ['all', 'feeds', 'starred', 'settings'].includes(hash) ? hash : 'all';
      UI.showView(viewId);
      if (viewId === 'feeds') {
        document.getElementById('add-feed-form').hidden = true;
        document.getElementById('empty-feeds').hidden = feeds.length > 0;
      }
    });

    document.querySelectorAll('.nav-item').forEach((n) => {
      n.addEventListener('click', (e) => {
        e.preventDefault();
        const view = n.getAttribute('data-view');
        window.location.hash = view;
      });
    });

    document.getElementById('btn-back')?.addEventListener('click', () => {
      window.location.hash = 'all';
      UI.showView('all');
      renderAll();
    });

    document.getElementById('btn-refresh')?.addEventListener('click', () => refreshAllFeeds());
  }

  function wireFeeds() {
    const form = document.getElementById('add-feed-form');
    const btnAdd = document.getElementById('btn-add-feed');
    const btnCancel = document.getElementById('btn-cancel-feed');
    const btnSave = document.getElementById('btn-save-feed');
    const input = document.getElementById('feed-url');

    function showAddFeedForm() {
      form.hidden = false;
      document.getElementById('empty-feeds').hidden = true;
      input.value = '';
      document.getElementById('feed-url-hint').textContent = '';
      input.focus();
    }
    btnAdd?.addEventListener('click', showAddFeedForm);
    document.getElementById('btn-add-feed-top')?.addEventListener('click', showAddFeedForm);

    btnCancel?.addEventListener('click', () => {
      form.hidden = true;
      if (feeds.length === 0) document.getElementById('empty-feeds').hidden = false;
    });

    btnSave?.addEventListener('click', async () => {
      const ok = await addFeed(input.value);
      if (ok) {
        form.hidden = true;
        document.getElementById('feed-url-hint').textContent = '';
      }
    });

    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') btnSave?.click();
    });
  }

  function wireArticleReader() {
    document.getElementById('btn-share')?.addEventListener('click', async () => {
      const article = UI.currentArticleList?.[UI.currentArticleIndex];
      if (!article) return;
      try {
        if (navigator.share) {
          await navigator.share({
            title: article.title,
            url: article.link,
            text: article.title,
          });
        } else {
          await navigator.clipboard.writeText(article.link);
          document.getElementById('btn-share').textContent = 'Copied!';
          setTimeout(() => { document.getElementById('btn-share').textContent = 'Share'; }, 2000);
        }
      } catch (e) {
        console.warn(e);
      }
    });

    document.getElementById('btn-prev-article')?.addEventListener('click', () => {
      const list = UI.currentArticleList;
      const i = UI.currentArticleIndex - 1;
      if (i < 0) return;
      const art = list[i];
      const feed = feedMap[art.feedId];
      Storage.markArticleRead(art.id, true);
      UI.showArticle(art, feed, list, i);
      renderAll();
    });

    document.getElementById('btn-next-article')?.addEventListener('click', () => {
      const list = UI.currentArticleList;
      const i = UI.currentArticleIndex + 1;
      if (i >= list.length) return;
      const art = list[i];
      const feed = feedMap[art.feedId];
      Storage.markArticleRead(art.id, true);
      UI.showArticle(art, feed, list, i);
      renderAll();
    });
  }

  function wireSettings() {
    const s = Storage.getSettings();
    document.getElementById('setting-theme').value = s.theme;
    document.getElementById('setting-refresh').value = String(s.refreshInterval);
    document.getElementById('setting-font-size').value = String(s.fontSize);
    document.getElementById('setting-proxy').value = s.proxy;

    document.getElementById('setting-theme')?.addEventListener('change', (e) => {
      s.theme = e.target.value;
      Storage.saveSettings(s);
      UI.setTheme(s.theme);
    });
    document.getElementById('setting-refresh')?.addEventListener('change', (e) => {
      s.refreshInterval = Number(e.target.value);
      Storage.saveSettings(s);
      scheduleRefresh();
    });
    document.getElementById('setting-font-size')?.addEventListener('change', (e) => {
      s.fontSize = Number(e.target.value);
      Storage.saveSettings(s);
      UI.setFontSize(s.fontSize);
    });
    document.getElementById('setting-proxy')?.addEventListener('change', (e) => {
      s.proxy = e.target.value;
      Storage.saveSettings(s);
    });

    document.getElementById('btn-export-opml')?.addEventListener('click', () => {
      const blob = new Blob([Storage.exportOPML(feeds)], { type: 'application/xml' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'subscriptions.opml';
      a.click();
      URL.revokeObjectURL(a.href);
    });

    document.getElementById('btn-import-opml')?.addEventListener('click', () => {
      document.getElementById('input-opml').click();
    });

    document.getElementById('input-opml')?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const text = await file.text();
      const imported = Storage.parseOPML(text);
      for (const f of imported) {
        try {
          const settings = Storage.getSettings();
          const parsed = await FeedParser.fetchAndParse(f.url, settings.proxy);
          const feed = { url: f.url, title: parsed.title || f.title, order: feeds.length };
          const saved = await Storage.addFeed(feed);
          await Storage.upsertArticles(saved.id, parsed.items);
          feeds = await loadFeeds();
        } catch (err) {
          console.warn('Import feed failed:', f.url, err);
        }
      }
      e.target.value = '';
      await renderAll();
    });

    document.getElementById('btn-clear-data')?.addEventListener('click', async () => {
      if (!confirm('Delete all feeds and articles? This cannot be undone.')) return;
      await Storage.clearAllData();
      feeds = [];
      feedMap = {};
      applyTheme();
      await renderAll();
      window.location.hash = 'all';
      UI.showView('all');
    });
  }

  function wireInstallPrompt() {
    let deferredPrompt;
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      document.getElementById('install-prompt').hidden = false;
    });
    document.getElementById('btn-install')?.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') document.getElementById('install-prompt').hidden = true;
    });
  }

  function wirePullToRefresh() {
    const list = document.getElementById('view-all');
    if (list) UI.initPullToRefresh(list, refreshAllFeeds);
  }

  async function init() {
    if ('serviceWorker' in navigator) {
      try {
        await navigator.serviceWorker.register('service-worker.js');
      } catch (e) {
        console.warn('SW registration failed', e);
      }
    }
    applyTheme();
    await loadFeeds();
    await renderAll();
    wireNavigation();
    wireFeeds();
    wireArticleReader();
    wireSettings();
    wireInstallPrompt();
    wirePullToRefresh();

    const hash = (window.location.hash || '#all').slice(1);
    UI.showView(['all', 'feeds', 'starred', 'settings'].includes(hash) ? hash : 'all');

    if (feeds.length > 0) await refreshAllFeeds();
    scheduleRefresh();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
