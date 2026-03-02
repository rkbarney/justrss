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
  let allArticles = [];
  let openAddFeedOnFeeds = false;

  function applyTheme() {
    const s = Storage.getSettings();
    UI.setTheme(s.colorScheme, s.style);
    UI.setFontSize(s.fontSize);
    UI.setFontFamily(s.fontFamily);
    UI.setNavPosition(s.navPosition);
  }

  async function loadFeeds() {
    feeds = await Storage.getFeeds();
    const order = Storage.getSettings().feedOrder || 'alphabetical';
    if (order === 'recent') {
      feeds.sort((a, b) => (b.lastUpdate || 0) - (a.lastUpdate || 0));
    } else {
      feeds.sort((a, b) => ((a.title || a.url || '').toLowerCase()).localeCompare((b.title || b.url || '').toLowerCase()));
    }
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

  function setViewTitle(feedName) {
    const titleEl = document.getElementById('view-title');
    const subEl = document.getElementById('view-title-sub');
    if (titleEl) titleEl.textContent = 'JustRSS';
    if (subEl) {
      if (feedName) {
        subEl.textContent = feedName;
        subEl.hidden = false;
      } else {
        subEl.textContent = '';
        subEl.hidden = true;
      }
    }
  }
  UI.setViewTitle = setViewTitle;

  async function refreshAllFeeds(opts = {}) {
    const { noCache = false } = opts;
    const settings = Storage.getSettings();
    const proxy = getEffectiveProxy();
    const loading = document.getElementById('loading-articles');
    const refreshBtn = document.getElementById('btn-refresh');
    if (loading) loading.hidden = false;
    if (refreshBtn) refreshBtn.hidden = true;
    const forceHide = setTimeout(() => {
      if (loading) loading.hidden = true;
      if (refreshBtn) refreshBtn.hidden = false;
    }, 30000);
    try {
      for (const feed of feeds) {
        try {
          const parsed = await FeedParser.fetchAndParse(feed.url, proxy, { noCache });
          await Storage.upsertArticles(feed.id, parsed.items);
          const updates = { ...feed };
          if (parsed.title && !feed.title) updates.title = parsed.title;
          if (parsed.link) updates.link = parsed.link;
          const hasPodcastItems = parsed.items?.some((i) => i.isPodcast || (i.durationSeconds != null && i.durationSeconds > 0));
          if (hasPodcastItems && !feed.appleUrl) {
            const appleUrl = await lookupApplePodcastUrl(feed.title || parsed.title);
            if (appleUrl) updates.appleUrl = appleUrl;
          }
          updates.lastUpdate = Date.now();
          await Storage.updateFeed(updates);
        } catch (e) {
          console.warn('Feed refresh failed:', feed.url, e);
        }
      }
    } finally {
      clearTimeout(forceHide);
      if (loading) loading.hidden = true;
      if (refreshBtn) refreshBtn.hidden = false;
    }
    await renderAll();
    scheduleRefresh();
    showToast(noCache ? 'Force refreshed' : 'Refreshed');
  }

  function showToast(message) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.hidden = false;
    toast.classList.add('visible');
    clearTimeout(showToast._tid);
    showToast._tid = setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => { toast.hidden = true; }, 200);
    }, 2000);
  }

  function scheduleRefresh() {
    if (refreshTimeout) clearTimeout(refreshTimeout);
    const s = Storage.getSettings();
    const mins = Number(s.refreshInterval) || 0;
    if (mins <= 0) return;
    refreshTimeout = setTimeout(refreshAllFeeds, mins * 60 * 1000);
  }

  function getArticleOptions(overrides = {}) {
    const s = Storage.getSettings();
    const excludeMuted = feeds.filter((f) => f.muted).map((f) => f.id);
    return {
      limit: s.postsPerPage || 15,
      excludeFeedIds: excludeMuted,
      ...overrides,
    };
  }

  async function renderAll() {
    const loading = document.getElementById('loading-articles');
    if (loading) loading.hidden = true;
    await loadFeeds();
    const opts = getArticleOptions();
    const [articles, unreadCounts] = await Promise.all([
      Storage.getArticles(opts),
      getUnreadCounts(),
    ]);

    allArticles = articles;

    setViewTitle();

    UI.renderArticleList('article-list', allArticles, feedMap, { emptyId: 'empty-state', feedsLength: feeds.length });
    UI.renderFeedList(feeds, unreadCounts);

    const feedsToolbar = document.querySelector('.feeds-toolbar');
    if (feedsToolbar) feedsToolbar.hidden = feeds.length === 0;

    const empty = document.getElementById('empty-state');
    if (empty) empty.hidden = allArticles.length > 0;

    currentFeedId = null;
    const loadMoreAllWrap = document.getElementById('load-more-all-wrap');
    if (loadMoreAllWrap) loadMoreAllWrap.hidden = allArticles.length === 0;
    const loadMoreBtn = document.getElementById('btn-load-more-all');
    if (loadMoreBtn) loadMoreBtn.hidden = allArticles.length < opts.limit;

    const markAllReadFeedsWrap = document.getElementById('mark-all-read-feeds-wrap');
    if (markAllReadFeedsWrap) markAllReadFeedsWrap.hidden = feeds.length === 0;

    document.getElementById('article-list')?.querySelectorAll('.article-item').forEach((el) => {
      attachArticleItemListeners(el, allArticles, 'all');
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
      UI.saveScroll('all');
      Storage.markArticleRead(id, true);
      beforeArticleView = { view: 'all', feedId: currentFeedId };
      history.pushState({ from: 'article' }, '', location.href);
      UI.showArticle(article, feed, list, index);
      el.classList.remove('unread');
    });

    UI.initSwipe(el, () => {
      Storage.markArticleRead(id, true);
      el.classList.remove('unread');
      renderAll();
    }, async () => {
      await Storage.markArticleHidden(id, true);
      renderAll();
    });
  }

  let currentFeedId = null;
  let feedDialogJustShown = false;
  let beforeArticleView = null;
  let navigatingToFeed = false;

  let restoringView = false;

  function restoreView(viewId, feedId = null) {
    beforeArticleView = null;
    restoringView = true;
    window.location.hash = viewId;
    UI.showView(viewId);
    if (viewId === 'all') {
      if (feedId) {
        currentFeedId = feedId;
        Storage.getArticles(getArticleOptions({ feedId })).then((articles) => {
          const feed = feedMap[feedId];
          setViewTitle(feed?.title || 'Feed');
          UI.renderArticleList('article-list', articles, feedMap, { emptyId: 'empty-state', feedsLength: feeds.length });
          const loadMoreWrap = document.getElementById('load-more-all-wrap');
          const loadMoreBtn = document.getElementById('btn-load-more-all');
          if (loadMoreWrap) loadMoreWrap.hidden = articles.length === 0;
          Storage.getArticles(getArticleOptions({ feedId, limit: 1, offset: articles.length })).then((next) => {
            if (loadMoreBtn) loadMoreBtn.hidden = next.length === 0;
          });
          document.getElementById('article-list')?.querySelectorAll('.article-item').forEach((item) => {
            attachArticleItemListeners(item, articles, 'all');
          });
          restoringView = false;
        });
      } else {
        currentFeedId = null;
        renderAll();
        restoringView = false;
      }
    } else if (viewId === 'feeds') {
      currentFeedId = null;
      document.getElementById('add-feed-form').hidden = true;
      const emptyFeeds = document.getElementById('empty-feeds');
      const markAllReadFeedsWrap = document.getElementById('mark-all-read-feeds-wrap');
      if (emptyFeeds) emptyFeeds.hidden = feeds.length > 0;
      if (markAllReadFeedsWrap) markAllReadFeedsWrap.hidden = feeds.length === 0;
      restoringView = false;
    } else {
      restoringView = false;
    }
  }

  function showFeedActionDialog(feedId) {
    feedDialogJustShown = true;
    setTimeout(() => { feedDialogJustShown = false; }, 100);
    const feed = feedMap[feedId];
    const dialog = document.getElementById('feed-action-dialog');
    const titleEl = document.getElementById('feed-action-dialog-title');
    const muteBtn = document.getElementById('feed-action-mute');
    if (!dialog || !feed) return;
    titleEl.textContent = feed.title || feed.url || 'Feed';
    muteBtn.textContent = feed.muted ? 'Unmute' : 'Mute';
    dialog.hidden = false;
    const close = () => { dialog.hidden = true; };
    dialog.querySelector('.feed-action-dialog-backdrop').onclick = close;
    document.getElementById('feed-action-cancel').onclick = close;
    document.getElementById('feed-action-mark-read').onclick = async () => {
      await Storage.markAllArticlesRead(feedId);
      close();
      await renderAll();
    };
    muteBtn.onclick = async () => {
      feed.muted = !feed.muted;
      await Storage.updateFeed(feed);
      close();
      await renderAll();
    };
    document.getElementById('feed-action-remove').onclick = async () => {
      if (confirm('Remove this feed?')) {
        await Storage.deleteFeed(feedId);
        close();
        await renderAll();
      }
    };
  }

  function attachFeedItemListeners(el) {
    const feedId = el.dataset.feedId;
    const info = el.querySelector('.feed-item-info');
    let longPressTimer = null;
    const LONG_PRESS_MS = 500;
    info?.addEventListener('touchstart', (e) => {
      longPressTimer = setTimeout(() => {
        longPressTimer = null;
        e.preventDefault();
        showFeedActionDialog(feedId);
      }, LONG_PRESS_MS);
    }, { passive: true });
    info?.addEventListener('touchend', () => {
      if (longPressTimer) clearTimeout(longPressTimer);
      longPressTimer = null;
    }, { passive: true });
    info?.addEventListener('touchcancel', () => {
      if (longPressTimer) clearTimeout(longPressTimer);
      longPressTimer = null;
    }, { passive: true });
    info?.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showFeedActionDialog(feedId);
    });
    info?.addEventListener('click', async (e) => {
      if (feedDialogJustShown) return;
      navigatingToFeed = true;
      const articles = await Storage.getArticles(getArticleOptions({ feedId }));
      const feed = feedMap[feedId];
      currentFeedId = feedId;
      window.location.hash = 'all';
      UI.saveScroll('all');
      UI.showView('all');
      setViewTitle(feed?.title || 'Feed');
      UI.renderArticleList('article-list', articles, feedMap, { emptyId: 'empty-state', feedsLength: feeds.length });
      const loadMoreWrap = document.getElementById('load-more-all-wrap');
      const loadMoreBtn = document.getElementById('btn-load-more-all');
      if (loadMoreWrap) loadMoreWrap.hidden = articles.length === 0;
      const next = await Storage.getArticles(getArticleOptions({ feedId, limit: 1, offset: articles.length }));
      if (loadMoreBtn) loadMoreBtn.hidden = next.length === 0;
      document.getElementById('article-list')?.querySelectorAll('.article-item').forEach((item) => {
        attachArticleItemListeners(item, articles, 'all');
      });
      navigatingToFeed = false;
    });
  }

  function normalizeProxyUrl(url) {
    if (!url || !url.trim()) return '';
    const u = url.trim().replace(/\/$/, '');
    if (/[?&]url=/.test(u)) return u;
    return u + '/?url=';
  }

  function parseProxyUrls(text) {
    if (!text || !text.trim()) return [];
    const raw = text.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
    const seen = new Set();
    return raw.map(normalizeProxyUrl).filter((u) => u && !seen.has(u) && seen.add(u));
  }

  function getProxyList() {
    const settings = Storage.getSettings();
    const text = settings?.proxyUrls || '';
    let list = parseProxyUrls(text);
    if (list.length === 0) {
      const fallback = normalizeProxyUrl(window.JUSTRSS_CONFIG?.defaultProxyUrl || '');
      if (fallback) list = [fallback];
    }
    return list;
  }

  function getEffectiveProxy() {
    const list = getProxyList();
    return list[0] || '';
  }

  function getProxyLabel(proxyUrl) {
    if (!proxyUrl) return '?';
    try {
      const u = new URL(proxyUrl.split('?')[0]);
      return u.hostname.replace(/^www\./, '') || 'proxy';
    } catch {
      return 'proxy';
    }
  }

  function isYouTubeUrl(url) {
    try {
      const u = new URL(url.startsWith('http') ? url : 'https://' + url);
      const h = u.hostname.toLowerCase();
      if (h !== 'www.youtube.com' && h !== 'youtube.com' && h !== 'm.youtube.com' && h !== 'youtu.be') return false;
      if (h === 'youtu.be') return true;
      return u.pathname.startsWith('/channel/') || u.pathname.startsWith('/@') || u.pathname.startsWith('/c/') || u.pathname.startsWith('/user/') || (u.pathname === '/watch' && u.searchParams.has('v'));
    } catch {
      return false;
    }
  }

  function isSubstackUrl(url) {
    try {
      const u = new URL(url.startsWith('http') ? url : 'https://' + url);
      const h = u.hostname.toLowerCase();
      return h.endsWith('.substack.com') || h === 'substack.com' || h === 'www.substack.com';
    } catch {
      return false;
    }
  }

  function feedErrorHint(err) {
    const msg = err?.message || String(err);
    if (msg.includes('HTTP 404') || msg.includes('404')) return 'Feed not found (404).';
    if (msg.includes('HTTP 5') || msg.includes('50')) return 'Server error. Try again later.';
    if (msg.includes('Invalid XML') || msg.includes('parsererror')) return 'Feed returned invalid XML.';
    if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('timeout')) return 'Network error or proxy timeout. Check proxy URL in Settings.';
    return 'Could not load feed. Check proxy URL in Settings.';
  }

  /** Resolve YouTube feed title when it's generic (Videos, Shorts, Live, All). */
  async function resolveYouTubeFeedTitle(feedUrl, parsed, proxyList) {
    if (!feedUrl?.includes('youtube.com/feeds/videos.xml') || !parsed) return parsed?.title || '';
    const generic = ['Videos', 'Shorts', 'Live', 'All'];
    const title = parsed.title || '';
    if (!generic.some((g) => title === g || title.startsWith(g))) return title;
    const typeMatch = feedUrl.match(/playlist_id=(UULF|UUSH|UULV)([\w-]+)/);
    const channelId = typeMatch ? 'UC' + typeMatch[2] : (feedUrl.match(/channel_id=([^&]+)/) || [])[1];
    if (!channelId || !typeMatch) return title;
    for (const proxy of proxyList) {
      try {
        const allUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
        const allFeed = await FeedParser.fetchAndParse(allUrl, proxy);
        if (allFeed?.title) {
          const typeLabel = generic.find((g) => title === g || title.startsWith(g + ' -')) || title;
          return allFeed.title + ' - ' + typeLabel;
        }
        break;
      } catch (e) {
        continue;
      }
    }
    return title;
  }

  /** Fetch feed in background and update storage. Called after feed is added with "Loading…". */
  async function fetchFeedInBackground(feedId, feedUrl) {
    const proxyList = getProxyList();
    let parsed = null;
    for (const proxy of proxyList) {
      try {
        parsed = await FeedParser.fetchAndParse(feedUrl, proxy);
        break;
      } catch (e) {
        continue;
      }
    }
    if (!parsed) {
      const f = await Storage.getFeeds().then((list) => list.find((x) => x.id === feedId));
      if (f) {
        f.title = 'Failed to load';
        await Storage.updateFeed(f);
      }
      await loadFeeds();
      await renderAll();
      return;
    }
    let title = await resolveYouTubeFeedTitle(feedUrl, parsed, proxyList) || parsed.title;
    const f = await Storage.getFeeds().then((list) => list.find((x) => x.id === feedId));
    if (f) {
      f.title = title;
      if (parsed.link) f.link = parsed.link;
      const hasPodcastItems = parsed.items?.some((i) => i.isPodcast || (i.durationSeconds != null && i.durationSeconds > 0));
      if (hasPodcastItems && !f.appleUrl) {
        const appleUrl = await lookupApplePodcastUrl(f.title || title);
        if (appleUrl) f.appleUrl = appleUrl;
      }
      await Storage.updateFeed(f);
    }
    await Storage.upsertArticles(feedId, parsed.items);
    await loadFeeds();
    await renderAll();
  }

  function titleFromUrl(url) {
    try {
      const u = new URL(url.startsWith('http') ? url : 'https://' + url);
      const host = u.hostname.replace(/^www\./, '');
      if (host.endsWith('.substack.com')) return host.slice(0, -'.substack.com'.length);
      return host;
    } catch {
      return 'Loading…';
    }
  }

  /** Look up Apple Podcasts URL for a podcast feed. Returns trackViewUrl or ''. */
  async function lookupApplePodcastUrl(feedTitle) {
    try {
      const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(feedTitle)}&entity=podcast&limit=1`);
      if (!res.ok) return '';
      const data = await res.json();
      const p = data.results?.[0];
      return (p?.trackViewUrl || '').trim();
    } catch {
      return '';
    }
  }

  /** Add a feed when we already have the feed URL. Adds immediately, fetches in background. appleUrl = Apple Podcasts link (for podcasts from iTunes search). */
  async function addFeedByUrl(feedUrl, title, appleUrl = '') {
    const feed = { url: feedUrl, title: title || titleFromUrl(feedUrl) || 'Loading…', order: feeds.length, lastUpdate: Date.now() };
    if (appleUrl) feed.appleUrl = appleUrl;
    const saved = await Storage.addFeed(feed);
    await loadFeeds();
    await renderAll();
    fetchFeedInBackground(saved.id, feedUrl);
    return true;
  }

  /** Add feed from URL (blog or direct feed). Adds immediately, discovers + fetches in background. */
  async function addFeed(urlInput) {
    let url = (urlInput || '').trim();
    if (!url) return false;
    if (!url.startsWith('http')) url = 'https://' + url;

    const feed = { url, title: titleFromUrl(url), order: feeds.length, lastUpdate: Date.now() };
    const saved = await Storage.addFeed(feed);
    await loadFeeds();
    await renderAll();

    (async () => {
      const proxyList = getProxyList();
      let feedUrl = url;
      const looksLikeFeed = /\.(rss|atom|xml)(\?|$)/i.test(url) || /\/(feed|rss|atom)(\?|$|\/)/i.test(url);
      if (!looksLikeFeed) {
        for (const proxy of proxyList) {
          try {
            const normalized = await FeedParser.normalizeInputToFeedUrl(url, proxy);
            if (normalized) {
              feedUrl = normalized;
              break;
            }
            const discovered = await FeedParser.discoverFeedUrl(url, proxy);
            if (discovered) {
              feedUrl = discovered;
              break;
            }
          } catch (e) {
            continue;
          }
        }
      }
      const f = await Storage.getFeeds().then((list) => list.find((x) => x.id === saved.id));
      if (feedUrl !== url && f) {
        f.url = feedUrl;
        await Storage.updateFeed(f);
      }
      if (!looksLikeFeed && feedUrl === url) {
        if (f) {
          f.title = 'Could not find feed';
          await Storage.updateFeed(f);
        }
        await loadFeeds();
        await renderAll();
        return;
      }
      await fetchFeedInBackground(saved.id, feedUrl);
    })();
    return true;
  }

  function wireNavigation() {
    document.getElementById('view-title-wrap')?.addEventListener('click', (e) => {
      if (currentFeedId) {
        e.preventDefault();
        currentFeedId = null;
        setViewTitle();
        renderAll();
      }
    });

    window.addEventListener('hashchange', () => {
      if (beforeArticleView || restoringView || navigatingToFeed) return;
      const hash = (window.location.hash || '#all').slice(1);
      const viewId = ['all', 'feeds', 'settings', 'about', 'help'].includes(hash) ? hash : 'all';
      UI.showView(viewId);
      if (viewId === 'all') {
        currentFeedId = null;
        renderAll();
      } else if (viewId === 'feeds') {
        currentFeedId = null;
        if (openAddFeedOnFeeds) {
          openAddFeedOnFeeds = false;
          if (typeof window.openAddFeedDialog === 'function') window.openAddFeedDialog();
        } else {
          document.getElementById('add-feed-dialog').hidden = true;
        }
        document.getElementById('empty-feeds').hidden = feeds.length > 0;
      }
    });

    document.querySelectorAll('.header-nav-link[data-view]').forEach((n) => {
      n.addEventListener('click', (e) => {
        e.preventDefault();
        const view = n.getAttribute('data-view');
        window.location.hash = view;
      });
    });

    window.addEventListener('popstate', (e) => {
      if (beforeArticleView && document.getElementById('view-article')?.classList.contains('view-active')) {
        restoreView(beforeArticleView.view, beforeArticleView.feedId);
      }
    });

    document.getElementById('btn-back')?.addEventListener('click', () => {
      if (beforeArticleView) {
        history.back();
      } else {
        window.location.hash = 'all';
        UI.showView('all');
        renderAll();
      }
    });

    document.getElementById('btn-refresh')?.addEventListener('click', () => refreshAllFeeds());
  }

  function wireAddFeedDialog() {
    const dialog = document.getElementById('add-feed-dialog');
    const backdrop = dialog?.querySelector('.add-feed-dialog-backdrop');
    const tabs = dialog?.querySelectorAll('.add-feed-tab');
    const panels = dialog?.querySelectorAll('.add-feed-tab-panel');
    const inputRss = document.getElementById('add-feed-input-rss');
    const inputPodcasts = document.getElementById('add-feed-input-podcasts');
    const inputYoutube = document.getElementById('add-feed-input-youtube');
    const hintRss = document.getElementById('add-feed-hint-rss');
    const hintPodcasts = document.getElementById('add-feed-hint-podcasts');
    const hintYoutube = document.getElementById('add-feed-hint-youtube');
    const pendingRss = document.getElementById('add-feed-pending-rss');
    const pendingYoutube = document.getElementById('add-feed-pending-youtube');
    const resultsPodcasts = document.getElementById('add-feed-podcasts-results');

    function showAddFeedDialog() {
      if (!dialog) return;
      dialog.hidden = false;
      document.getElementById('empty-feeds').hidden = true;
      setActiveTab('rss');
      inputRss.value = inputPodcasts.value = inputYoutube.value = '';
      hintRss.textContent = hintPodcasts.textContent = hintYoutube.textContent = '';
      pendingRss.innerHTML = pendingYoutube.innerHTML = '';
      resultsPodcasts.innerHTML = '';
      inputRss.focus();
    }
    window.openAddFeedDialog = showAddFeedDialog;

    function closeAddFeedDialog() {
      if (dialog) dialog.hidden = true;
      if (feeds.length === 0) document.getElementById('empty-feeds').hidden = false;
    }

    function setActiveTab(tabId) {
      tabs?.forEach((t) => {
        const active = t.dataset.tab === tabId;
        t.classList.toggle('add-feed-tab-active', active);
        t.setAttribute('aria-selected', active);
      });
      panels?.forEach((p) => {
        const pid = p.id;
        const match = (pid === 'add-feed-tab-rss-panel' && tabId === 'rss') || (pid === 'add-feed-tab-podcasts-panel' && tabId === 'podcasts') || (pid === 'add-feed-tab-youtube-panel' && tabId === 'youtube');
        p.hidden = !match;
      });
    }

    document.getElementById('btn-add-feed')?.addEventListener('click', showAddFeedDialog);
    document.getElementById('btn-add-feed-top')?.addEventListener('click', showAddFeedDialog);

    document.getElementById('empty-add-to-feed')?.addEventListener('click', (e) => {
      e.preventDefault();
      openAddFeedOnFeeds = true;
      window.location.hash = 'feeds';
    });

    tabs?.forEach((t) => {
      t.addEventListener('click', () => setActiveTab(t.dataset.tab));
    });

    backdrop?.addEventListener('click', closeAddFeedDialog);
    document.getElementById('add-feed-cancel')?.addEventListener('click', closeAddFeedDialog);
    document.getElementById('add-feed-cancel-yt')?.addEventListener('click', closeAddFeedDialog);

    document.getElementById('add-feed-whats-this')?.addEventListener('click', (e) => {
      e.preventDefault();
      closeAddFeedDialog();
      window.location.hash = 'help';
      UI.showView('help');
    });

    dialog?.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeAddFeedDialog();
    });

    function shortUrl(url) {
      try {
        const u = new URL(url);
        return u.hostname.replace('www.', '') + u.pathname;
      } catch {
        return url.slice(0, 40) + (url.length > 40 ? '…' : '');
      }
    }

    function renderYoutubeChoices(container, feedList, onAdd) {
      container.innerHTML = '';
      feedList.forEach((f) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-secondary youtube-choice-btn';
        btn.textContent = f.title;
        btn.dataset.feedUrl = f.url;
        btn.addEventListener('click', () => onAdd(f.url, f.title));
        container.appendChild(btn);
      });
    }

    document.getElementById('add-feed-submit-rss')?.addEventListener('click', async () => {
      const url = inputRss.value.trim() ? (inputRss.value.startsWith('http') ? inputRss.value : 'https://' + inputRss.value) : '';
      if (!url) return;

      if (isYouTubeUrl(url)) {
        hintRss.textContent = 'Resolving…';
        const proxyList = getProxyList();
        const channelId = await FeedParser.resolveYouTubeUrl(url, proxyList);
        if (channelId) {
          const standardFeeds = FeedParser.getYouTubeFeedsFromChannelId(channelId);
          const proxyList2 = getProxyList();
          let custom = [];
          for (const proxy of proxyList2) {
            try {
              custom = await FeedParser.getYouTubeCustomPlaylistsFromPage(channelId, proxy);
              break;
            } catch { continue; }
          }
          const allFeeds = [...standardFeeds, ...custom];
          pendingRss.innerHTML = `<p class="add-feed-pending-label">${shortUrl(url)}</p><div class="add-feed-pending-choices"></div>`;
          const choicesEl = pendingRss.querySelector('.add-feed-pending-choices');
          renderYoutubeChoices(choicesEl, allFeeds, async (feedUrl, feedTitle) => {
            const ok = await addFeedByUrl(feedUrl, feedTitle);
            if (ok) { closeAddFeedDialog(); }
          });
          hintRss.textContent = 'Choose a feed above.';
        } else {
          hintRss.textContent = "Couldn't find a channel at that URL — try the channel page directly.";
        }
        return;
      }

      if (isSubstackUrl(url)) {
        try {
          const u = new URL(url);
          const base = u.origin.replace(/\/$/, '');
          const path = u.pathname.replace(/\/p\/[^/]*$/, '').replace(/\/$/, '') || '';
          const feedUrl = base + path + '/feed';
          const subName = u.hostname.replace(/^www\./, '').replace(/\.substack\.com$/, '') || u.pathname.split('/')[1] || u.hostname;
          const ok = await addFeedByUrl(feedUrl, subName);
          if (ok) closeAddFeedDialog();
        } catch {
          hintRss.textContent = 'Invalid URL.';
        }
        return;
      }

      const ok = await addFeed(inputRss.value);
      if (ok) closeAddFeedDialog();
    });

    inputRss?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('add-feed-submit-rss')?.click();
    });

    let podcastsDebounce;
    inputPodcasts?.addEventListener('input', () => {
      clearTimeout(podcastsDebounce);
      const q = inputPodcasts.value.trim();
      hintPodcasts.textContent = '';
      if (!q) {
        resultsPodcasts.innerHTML = '';
        return;
      }
      podcastsDebounce = setTimeout(async () => {
        resultsPodcasts.innerHTML = '<p class="hint">Searching…</p>';
        try {
          const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=podcast&limit=10`);
          if (!res.ok) throw new Error('Search failed');
          const data = await res.json();
          const results = data.results || [];
          if (results.length === 0) {
            resultsPodcasts.innerHTML = '<p class="hint">No results found — try a different name</p>';
            return;
          }
          resultsPodcasts.innerHTML = results.map((p) => `
            <div class="add-feed-podcast-item">
              <img src="${(p.artworkUrl100 || p.artworkUrl60 || '').replace('100x100', '60x60')}" alt="">
              <div class="add-feed-podcast-item-info">
                <strong>${UI.escapeHtml(p.collectionName || '')}</strong>
                <span>${UI.escapeHtml(p.artistName || '')}</span>
              </div>
              <button type="button" class="btn-secondary add-feed-podcast-add" data-feed-url="${UI.escapeHtml(p.feedUrl || '')}" data-title="${UI.escapeHtml(p.collectionName || '')}" data-apple-url="${UI.escapeHtml(p.trackViewUrl || '')}">Add</button>
            </div>
          `).join('');
          resultsPodcasts.querySelectorAll('.add-feed-podcast-add').forEach((btn) => {
            btn.addEventListener('click', async () => {
              const feedUrl = btn.dataset.feedUrl;
              const title = btn.dataset.title;
              const appleUrl = btn.dataset.appleUrl || '';
              if (feedUrl) {
                const ok = await addFeedByUrl(feedUrl, title, appleUrl);
                if (ok) closeAddFeedDialog();
              } else {
                hintPodcasts.textContent = 'Search unavailable right now — try pasting the podcast\'s RSS feed directly in the RSS tab';
              }
            });
          });
        } catch {
          resultsPodcasts.innerHTML = '<p class="hint">Search unavailable right now — try pasting the podcast\'s RSS feed directly in the RSS tab</p>';
        }
      }, 400);
    });

    let youtubeResolving = false;
    async function resolveYoutubeInput() {
      const raw = inputYoutube.value.trim();
      if (!raw || youtubeResolving) return;
      const url = raw.startsWith('http') ? raw : (raw.startsWith('@') ? `https://www.youtube.com/${raw}` : `https://${raw}`);
      hintYoutube.textContent = 'Resolving…';
      youtubeResolving = true;
      try {
        const proxyList = getProxyList();
        const channelId = await FeedParser.resolveYouTubeUrl(url, proxyList);
        if (channelId) {
          const standardFeeds = FeedParser.getYouTubeFeedsFromChannelId(channelId);
          let custom = [];
          for (const proxy of proxyList) {
            try {
              custom = await FeedParser.getYouTubeCustomPlaylistsFromPage(channelId, proxy);
              break;
            } catch { continue; }
          }
          const allFeeds = [...standardFeeds, ...custom];
          pendingYoutube.innerHTML = `<p class="add-feed-pending-label">${shortUrl(url)}</p><div class="add-feed-pending-choices"></div>`;
          const choicesEl = pendingYoutube.querySelector('.add-feed-pending-choices');
          renderYoutubeChoices(choicesEl, allFeeds, async (feedUrl, feedTitle) => {
            const ok = await addFeedByUrl(feedUrl, feedTitle);
            if (ok) closeAddFeedDialog();
          });
          hintYoutube.textContent = 'Choose a feed above.';
        } else {
          hintYoutube.textContent = "Couldn't find a channel at that URL — try the channel page directly.";
        }
      } finally {
        youtubeResolving = false;
      }
    }
    inputYoutube?.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') { e.preventDefault(); resolveYoutubeInput(); }
    });
    document.getElementById('add-feed-resolve-yt')?.addEventListener('click', resolveYoutubeInput);
  }

  function wireFeeds() {
  }

  function wireArticleReader() {
    document.getElementById('btn-share')?.addEventListener('click', async () => {
      const article = UI.currentArticleList?.[UI.currentArticleIndex];
      if (!article) return;
      const feed = feedMap[article.feedId];
      const shareUrl = UI.getArticleDisplayUrl(article, feed) || article.link;
      try {
        if (navigator.share) {
          await navigator.share({
            title: article.title,
            url: shareUrl,
            text: article.title,
          });
        } else {
          await navigator.clipboard.writeText(shareUrl);
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
    document.getElementById('setting-color-scheme').value = s.colorScheme || 'system';
    document.getElementById('setting-style').value = s.style || 'minimal';
    document.getElementById('setting-nav-position').value = s.navPosition || 'top';
    document.getElementById('setting-refresh').value = String(s.refreshInterval);
    document.getElementById('setting-posts-per-page').value = String(s.postsPerPage ?? 15);
    document.getElementById('setting-font-size').value = String(s.fontSize);
    document.getElementById('setting-font-family').value = s.fontFamily || 'times';
    document.getElementById('setting-proxy-urls').value = s.proxyUrls || '';
    document.getElementById('setting-feed-order').value = s.feedOrder || 'alphabetical';

    document.getElementById('setting-color-scheme')?.addEventListener('change', (e) => {
      s.colorScheme = e.target.value;
      Storage.saveSettings(s);
      UI.setTheme(s.colorScheme, s.style);
    });
    document.getElementById('setting-style')?.addEventListener('change', (e) => {
      s.style = e.target.value;
      Storage.saveSettings(s);
      UI.setTheme(s.colorScheme, s.style);
    });
    document.getElementById('setting-nav-position')?.addEventListener('change', (e) => {
      s.navPosition = e.target.value;
      Storage.saveSettings(s);
      UI.setNavPosition(s.navPosition);
    });
    document.getElementById('setting-refresh')?.addEventListener('change', (e) => {
      s.refreshInterval = Number(e.target.value);
      Storage.saveSettings(s);
      scheduleRefresh();
    });
    document.getElementById('setting-posts-per-page')?.addEventListener('change', (e) => {
      s.postsPerPage = Number(e.target.value);
      Storage.saveSettings(s);
      renderAll();
    });
    document.getElementById('setting-font-size')?.addEventListener('change', (e) => {
      s.fontSize = Number(e.target.value);
      Storage.saveSettings(s);
      UI.setFontSize(s.fontSize);
    });
    document.getElementById('setting-font-family')?.addEventListener('change', (e) => {
      s.fontFamily = e.target.value;
      Storage.saveSettings(s);
      UI.setFontFamily(s.fontFamily);
    });
    document.getElementById('setting-proxy-urls')?.addEventListener('input', (e) => {
      s.proxyUrls = e.target.value.trim();
      Storage.saveSettings(s);
    });
    document.getElementById('setting-feed-order')?.addEventListener('change', (e) => {
      s.feedOrder = e.target.value;
      Storage.saveSettings(s);
      renderAll();
    });

    document.getElementById('btn-force-refresh')?.addEventListener('click', async () => {
      if (feeds.length === 0) {
        showToast('No feeds to refresh');
        return;
      }
      await refreshAllFeeds({ noCache: true });
    });

    document.getElementById('btn-force-reload-app')?.addEventListener('click', async () => {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const reg of regs) await reg.unregister();
      }
      location.reload();
    });

    document.getElementById('btn-restore-hidden')?.addEventListener('click', async () => {
      await Storage.restoreHiddenArticles();
      await renderAll();
    });

    document.getElementById('btn-export-opml')?.addEventListener('click', () => {
      const blob = new Blob([Storage.exportOPML(feeds)], { type: 'application/xml' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'subscriptions.opml';
      a.click();
      URL.revokeObjectURL(a.href);
    });

    const triggerOpmlImport = () => document.getElementById('input-opml')?.click();
    document.getElementById('btn-import-opml')?.addEventListener('click', triggerOpmlImport);
    document.getElementById('empty-import-opml')?.addEventListener('click', (e) => { e.preventDefault(); triggerOpmlImport(); });
    document.getElementById('empty-import-opml-feeds')?.addEventListener('click', (e) => { e.preventDefault(); triggerOpmlImport(); });

    document.getElementById('input-opml')?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      window.location.hash = 'settings';
      UI.showView('settings');
      const statusEl = document.getElementById('import-status');
      const failedListEl = document.getElementById('import-failed-list');
      statusEl.textContent = 'Importing…';
      if (failedListEl) {
        failedListEl.innerHTML = '';
        failedListEl.hidden = true;
      }
      let text;
      try {
        text = await file.text();
      } catch (err) {
        statusEl.textContent = 'Could not read file.';
        e.target.value = '';
        return;
      }
      const imported = Storage.parseOPML(text);
      if (imported.length === 0) {
        statusEl.textContent = 'No feeds found in file. Use an OPML export from another reader.';
        e.target.value = '';
        return;
      }
      let added = 0;
      const failedUrls = [];
      const failedDetails = [];
      const proxyList = getProxyList();
      const total = imported.length;
      const orderLabel = proxyList.map((px) => getProxyLabel(px)).join(' → ');
      statusEl.textContent = `Importing 0/${total}\nProxy order: ${orderLabel}`;
      for (let i = 0; i < imported.length; i++) {
        const f = imported[i];
        const feedLabel = (f.title && f.title.trim()) || f.url || `Feed ${i + 1}`;
        statusEl.textContent = `Importing ${i + 1}/${total}: ${feedLabel}`;
        let parsed = null;
        let feedUrl = f.url;
        for (const proxy of proxyList) {
          statusEl.textContent = `Importing ${i + 1}/${total}: ${feedLabel}\nTrying: ${getProxyLabel(proxy)}`;
          try {
            const normalized = await FeedParser.normalizeInputToFeedUrl(f.url, proxy);
            if (normalized) feedUrl = normalized;
            parsed = await FeedParser.fetchAndParse(feedUrl, proxy);
            break;
          } catch {
            continue;
          }
        }
        if (parsed) {
          try {
            let title = (f.title && f.title.trim()) ? f.title.trim() : (parsed.title || '');
            const generic = ['Videos', 'Shorts', 'Live', 'All'];
            if (feedUrl.includes('youtube.com/feeds/videos.xml') && generic.some((g) => title === g || title.startsWith(g))) {
              title = await resolveYouTubeFeedTitle(feedUrl, parsed, proxyList) || title;
            }
            const feed = { url: feedUrl, title, order: feeds.length, lastUpdate: Date.now() };
            if (parsed.link) feed.link = parsed.link;
            const saved = await Storage.addFeed(feed);
            await Storage.upsertArticles(saved.id, parsed.items);
            feeds = await loadFeeds();
            added++;
          } catch (err) {
            console.warn('Import feed failed:', f.url, err);
            failedUrls.push(feedLabel);
            failedDetails.push(err?.message || String(err));
          }
        } else {
          failedUrls.push(feedLabel);
          failedDetails.push('All proxies failed');
        }
      }
      if (added > 0) statusEl.textContent = `Imported ${added} feed${added !== 1 ? 's' : ''}.`;
      if (failedUrls.length > 0) {
        statusEl.textContent += (added > 0 ? ' ' : '') + `${failedUrls.length} failed. Check proxy URL in Settings.`;
        if (failedListEl) {
          failedListEl.innerHTML = failedUrls.map((name, i) => {
            const detail = failedDetails[i] ? ` — ${UI.escapeHtml(failedDetails[i])}` : '';
            return `<li>${UI.escapeHtml(name)}${detail}</li>`;
          }).join('');
          failedListEl.hidden = false;
        }
      } else if (failedListEl) {
        failedListEl.hidden = true;
      }
      if (added === 0 && failedUrls.length > 0) {
        statusEl.textContent = `All ${failedUrls.length} feeds failed. Check proxy URL in Settings.`;
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

  function wireShareAndInstall() {
    const shareBtn = document.getElementById('btn-share-main');
    const installBtn = document.getElementById('btn-install');
    let deferredPrompt;

    async function doShare() {
      const url = window.location.href;
      const title = 'JustRSS';
      const text = 'A lightweight RSS reader that runs entirely in your browser. No ads, no algorithms, no logins. Your feed, your control.';
      try {
        if (navigator.share) {
          await navigator.share({ title, text, url });
          showToast('Shared');
        } else {
          await navigator.clipboard.writeText(url);
          showToast('Link copied');
        }
      } catch (e) {
        if (e.name !== 'AbortError') {
          await navigator.clipboard.writeText(url);
          showToast('Link copied');
        }
      }
    }

    function doInstall() {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(({ outcome }) => {
          if (outcome === 'accepted') document.getElementById('install-prompt').hidden = true;
        });
      } else {
        doShare();
      }
    }

    shareBtn?.addEventListener('click', doShare);

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      document.getElementById('install-prompt').hidden = false;
    });
    installBtn?.addEventListener('click', doInstall);
  }

  function wirePullToRefresh() {
    const list = document.getElementById('view-all');
    if (list) UI.initPullToRefresh(list, refreshAllFeeds);
  }

  function wireLoadMore() {
    const limit = () => Storage.getSettings().postsPerPage || 15;

    document.getElementById('btn-mark-all-read')?.addEventListener('click', async () => {
      await Storage.markAllArticlesRead(currentFeedId);
      if (currentFeedId) {
        const articles = await Storage.getArticles(getArticleOptions({ feedId: currentFeedId }));
        UI.renderArticleList('article-list', articles, feedMap, { emptyId: 'empty-state', feedsLength: feeds.length });
        document.getElementById('article-list')?.querySelectorAll('.article-item').forEach((el) => {
          attachArticleItemListeners(el, articles, 'all');
        });
      } else {
        await renderAll();
      }
    });

    document.getElementById('btn-mark-all-read-feeds')?.addEventListener('click', async () => {
      await Storage.markAllArticlesRead();
      await renderAll();
    });

    document.getElementById('btn-load-more-all')?.addEventListener('click', async () => {
      let next;
      let articles;
      if (currentFeedId) {
        const currentCount = document.getElementById('article-list')?.querySelectorAll('.article-item').length || 0;
        next = await Storage.getArticles(getArticleOptions({ feedId: currentFeedId, offset: currentCount }));
        articles = await Storage.getArticles(getArticleOptions({ feedId: currentFeedId, limit: currentCount + next.length }));
        UI.renderArticleList('article-list', articles, feedMap, { emptyId: 'empty-state', feedsLength: feeds.length });
        document.getElementById('btn-load-more-all').hidden = next.length < limit();
        document.getElementById('article-list')?.querySelectorAll('.article-item').forEach((el) => {
          attachArticleItemListeners(el, articles, 'all');
        });
      } else {
        next = await Storage.getArticles(getArticleOptions({ offset: allArticles.length }));
        allArticles = allArticles.concat(next);
        articles = allArticles;
        UI.renderArticleList('article-list', allArticles, feedMap, { emptyId: 'empty-state', feedsLength: feeds.length });
        document.getElementById('btn-load-more-all').hidden = next.length < limit();
        document.getElementById('article-list')?.querySelectorAll('.article-item').forEach((el) => {
          attachArticleItemListeners(el, allArticles, 'all');
        });
      }
      const emptyState = document.getElementById('empty-state');
      const loadMoreWrap = document.getElementById('load-more-all-wrap');
      if (emptyState) emptyState.hidden = articles.length > 0;
      if (loadMoreWrap) loadMoreWrap.hidden = articles.length === 0;
    });
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
    wireAddFeedDialog();
    wireFeeds();
    wireLoadMore();
    wireArticleReader();
    wireSettings();
    wireShareAndInstall();
    wirePullToRefresh();

    const hash = (window.location.hash || '#all').slice(1);
    UI.showView(['all', 'feeds', 'settings', 'about', 'help'].includes(hash) ? hash : 'all');

    if (feeds.length > 0) await refreshAllFeeds();
    scheduleRefresh();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
