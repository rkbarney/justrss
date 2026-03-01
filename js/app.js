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
  let starredArticles = [];

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
    const limit = Storage.getSettings().postsPerPage || 15;
    const [articles, starred, unreadCounts] = await Promise.all([
      Storage.getArticles({ limit }),
      Storage.getArticles({ starredOnly: true, limit }),
      getUnreadCounts(),
    ]);

    allArticles = articles;
    starredArticles = starred;

    UI.renderArticleList('article-list', allArticles, feedMap, { emptyId: 'empty-state' });
    UI.renderArticleList('starred-list', starredArticles, feedMap, { emptyId: 'empty-starred' });
    UI.renderFeedList(feeds, unreadCounts);

    const feedsToolbar = document.querySelector('.feeds-toolbar');
    if (feedsToolbar) feedsToolbar.hidden = feeds.length === 0;

    const empty = document.getElementById('empty-state');
    if (empty) empty.hidden = allArticles.length > 0;

    const loadMoreAllWrap = document.getElementById('load-more-all-wrap');
    if (loadMoreAllWrap) loadMoreAllWrap.hidden = allArticles.length < limit;

    const loadMoreStarredWrap = document.getElementById('load-more-starred-wrap');
    if (loadMoreStarredWrap) loadMoreStarredWrap.hidden = starredArticles.length < limit;

    // Re-attach list item listeners
    document.getElementById('article-list')?.querySelectorAll('.article-item').forEach((el) => {
      attachArticleItemListeners(el, allArticles, 'all');
    });
    document.getElementById('starred-list')?.querySelectorAll('.article-item').forEach((el) => {
      attachArticleItemListeners(el, starredArticles, 'starred');
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
      const limit = Storage.getSettings().postsPerPage || 15;
      const articles = await Storage.getArticles({ feedId, limit });
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

  const PROXIES = [
    'https://api.allorigins.win/raw?url=',
    'https://corsproxy.io/?url=',
    'https://api.rss2json.com/v1/api.json?rss_url=',
  ];

  function getProxyList() {
    const settings = Storage.getSettings();
    const preferred = settings.proxy || PROXIES[0];
    return PROXIES.includes(preferred)
      ? [preferred, ...PROXIES.filter((p) => p !== preferred)]
      : [preferred, ...PROXIES];
  }

  function isYouTubeUrl(url) {
    try {
      const u = new URL(url.startsWith('http') ? url : 'https://' + url);
      const h = u.hostname.toLowerCase();
      return (h === 'www.youtube.com' || h === 'youtube.com' || h === 'm.youtube.com') &&
        (u.pathname.startsWith('/channel/') || u.pathname.startsWith('/@') || u.pathname.startsWith('/c/') || u.pathname.startsWith('/user/'));
    } catch {
      return false;
    }
  }

  function isSubstackUrl(url) {
    try {
      const u = new URL(url.startsWith('http') ? url : 'https://' + url);
      return u.hostname.toLowerCase().endsWith('.substack.com');
    } catch {
      return false;
    }
  }

  function feedErrorHint(err) {
    const msg = err?.message || String(err);
    if (msg.includes('HTTP 404') || msg.includes('404')) return 'Feed not found (404).';
    if (msg.includes('HTTP 5') || msg.includes('50')) return 'Server error. Try again later.';
    if (msg.includes('Invalid XML') || msg.includes('parsererror')) return 'Feed returned invalid XML.';
    if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('timeout')) return 'Network error or proxy timeout. Try another proxy in Settings.';
    if (msg.includes('RSS2JSON') || msg.includes('rss2json')) return msg;
    return 'Could not load feed. Try another proxy in Settings.';
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
    let title = parsed.title;
    if (feedUrl.includes('youtube.com/feeds/videos.xml')) {
      const generic = ['Videos', 'Shorts', 'Live'];
      const typeMatch = feedUrl.match(/playlist_id=(UULF|UUSH|UULV)([\w-]+)/);
      const channelId = typeMatch ? 'UC' + typeMatch[2] : (feedUrl.match(/channel_id=([^&]+)/) || [])[1];
      if (channelId && typeMatch && generic.some((g) => title === g || title.startsWith(g))) {
        for (const proxy of proxyList) {
          try {
            const allUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
            const allFeed = await FeedParser.fetchAndParse(allUrl, proxy);
            if (allFeed && allFeed.title) {
              const typeLabel = generic.find((g) => title === g || title.startsWith(g + ' -')) || title;
              title = allFeed.title + ' - ' + typeLabel;
            }
            break;
          } catch (e) {
            continue;
          }
        }
      }
    }
    const f = await Storage.getFeeds().then((list) => list.find((x) => x.id === feedId));
    if (f) {
      f.title = title;
      await Storage.updateFeed(f);
    }
    await Storage.upsertArticles(feedId, parsed.items);
    await loadFeeds();
    await renderAll();
  }

  /** Add a feed when we already have the feed URL. Adds immediately, fetches in background. */
  async function addFeedByUrl(feedUrl) {
    const feed = { url: feedUrl, title: 'Loading…', order: feeds.length };
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

    const feed = { url, title: 'Loading…', order: feeds.length };
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
    window.addEventListener('hashchange', () => {
      const hash = (window.location.hash || '#all').slice(1);
      const viewId = ['all', 'feeds', 'starred', 'settings', 'about'].includes(hash) ? hash : 'all';
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
    const formActions = document.getElementById('add-feed-form-actions');
    const pendingListEl = document.getElementById('add-feed-pending-list');
    const pendingYouTubeList = [];

    function shortUrl(url) {
      try {
        const u = new URL(url);
        return u.hostname.replace('www.', '') + u.pathname;
      } catch {
        return url.slice(0, 40) + (url.length > 40 ? '…' : '');
      }
    }

    function removePending(id) {
      const idx = pendingYouTubeList.findIndex((p) => p.id === id);
      if (idx !== -1) pendingYouTubeList.splice(idx, 1);
      const el = document.getElementById(`pending-${id}`);
      if (el) el.remove();
    }

    function renderPendingChoices(pending, feedList) {
      const choicesEl = pending.el.querySelector('.add-feed-pending-choices');
      if (!choicesEl) return;
      choicesEl.innerHTML = '';
      feedList.forEach((f) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-secondary youtube-choice-btn';
        btn.textContent = f.title;
        btn.dataset.feedUrl = f.url;
        choicesEl.appendChild(btn);
      });
    }

    function showAddFeedForm() {
      form.hidden = false;
      document.getElementById('empty-feeds').hidden = true;
      input.value = '';
      document.getElementById('feed-url-hint').textContent = '';
      formActions.hidden = false;
      input.focus();
    }
    btnAdd?.addEventListener('click', showAddFeedForm);
    document.getElementById('btn-add-feed-top')?.addEventListener('click', showAddFeedForm);

    btnCancel?.addEventListener('click', () => {
      pendingYouTubeList.forEach((p) => {
        const el = document.getElementById(`pending-${p.id}`);
        if (el) el.remove();
      });
      pendingYouTubeList.length = 0;
      form.hidden = true;
      formActions.hidden = false;
      if (feeds.length === 0) document.getElementById('empty-feeds').hidden = false;
    });

    pendingListEl?.addEventListener('click', async (e) => {
      const btn = e.target.closest('.youtube-choice-btn');
      if (!btn) return;
      const feedUrl = btn.dataset.feedUrl;
      if (!feedUrl) return;
      const card = e.target.closest('.add-feed-pending-card');
      const id = card?.dataset?.pendingId;
      const ok = await addFeedByUrl(feedUrl);
      if (id) removePending(id);
      if (ok) {
        input.value = '';
        document.getElementById('feed-url-hint').textContent = 'Added. Add another or cancel.';
      }
    });

    btnSave?.addEventListener('click', async () => {
      const url = input.value.trim() ? (input.value.startsWith('http') ? input.value : 'https://' + input.value) : '';
      if (!url) return;

      const hint = document.getElementById('feed-url-hint');

      if (isYouTubeUrl(url)) {
        const channelIdFromUrl = FeedParser.getYouTubeChannelIdFromUrl(url);
        if (channelIdFromUrl) {
          const standardFeeds = FeedParser.getYouTubeFeedsFromChannelId(channelIdFromUrl);
          if (standardFeeds.length > 0) {
            const id = `yt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            const card = document.createElement('div');
            card.id = `pending-${id}`;
            card.className = 'add-feed-pending-card';
            card.dataset.pendingId = id;
            card.innerHTML = `
              <p class="add-feed-pending-label">${shortUrl(url)}</p>
              <div class="add-feed-pending-choices"></div>
            `;
            pendingListEl.appendChild(card);
            const pending = { id, url, channelId: channelIdFromUrl, feeds: [...standardFeeds], el: card };
            pendingYouTubeList.push(pending);
            renderPendingChoices(pending, standardFeeds);
            input.value = '';
            hint.textContent = 'Choose a feed above, or add another URL below.';
            loadPlaylistsForPending(pending);
            return;
          }
        }
        const id = `yt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const card = document.createElement('div');
        card.id = `pending-${id}`;
        card.className = 'add-feed-pending-card';
        card.dataset.pendingId = id;
        card.innerHTML = `
          <p class="add-feed-pending-label">${shortUrl(url)}</p>
          <p class="hint add-feed-pending-status">Resolving…</p>
          <div class="add-feed-pending-choices" hidden></div>
        `;
        pendingListEl.appendChild(card);
        const pending = { id, url, el: card };
        pendingYouTubeList.push(pending);
        input.value = '';
        hint.textContent = 'Resolving. Add another URL below while you wait.';

        (async () => {
          const proxyList = getProxyList();
          const channelId = await FeedParser.resolveYouTubeChannelIdParallel(url, proxyList);
          const statusEl = card.querySelector('.add-feed-pending-status');
          const choicesEl = card.querySelector('.add-feed-pending-choices');
          if (!channelId || !choicesEl) {
            if (statusEl) statusEl.textContent = 'Could not resolve channel.';
            return;
          }
          pending.channelId = channelId;
          const standardFeeds = FeedParser.getYouTubeFeedsFromChannelId(channelId);
          pending.feeds = [...standardFeeds];
          if (statusEl) statusEl.hidden = true;
          choicesEl.hidden = false;
          renderPendingChoices(pending, standardFeeds);
          loadPlaylistsForPending(pending);
        })();
        return;
      }

      if (isSubstackUrl(url)) {
        try {
          const u = new URL(url);
          const feedUrl = u.origin.replace(/\/$/, '') + '/feed';
          const ok = await addFeedByUrl(feedUrl);
          if (ok) {
            input.value = '';
            hint.textContent = 'Added. Add another or cancel.';
          }
        } catch (e) {
          hint.textContent = 'Invalid URL.';
        }
        return;
      }

      const ok = await addFeed(input.value);
      if (ok) {
        input.value = '';
        hint.textContent = 'Added. Add another or cancel.';
      }
    });

    async function loadPlaylistsForPending(pending) {
      if (!pending.channelId || !pending.el) return;
      const proxyList = getProxyList();
      for (const proxy of proxyList) {
        try {
          const custom = await FeedParser.getYouTubeCustomPlaylistsFromPage(pending.channelId, proxy);
          if (custom.length > 0 && pending.feeds) {
            pending.feeds = [...pending.feeds, ...custom];
            renderPendingChoices(pending, pending.feeds);
          }
          break;
        } catch (e) {
          continue;
        }
      }
    }

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
    document.getElementById('setting-posts-per-page').value = String(s.postsPerPage ?? 15);
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
      const statusEl = document.getElementById('import-status');
      statusEl.textContent = 'Importing…';
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
      const settings = Storage.getSettings();
      let added = 0;
      let failed = 0;
      for (const f of imported) {
        try {
          let feedUrl = f.url;
          const normalized = await FeedParser.normalizeInputToFeedUrl(f.url, settings.proxy);
          if (normalized) feedUrl = normalized;
          const parsed = await FeedParser.fetchAndParse(feedUrl, settings.proxy);
          const feed = { url: feedUrl, title: parsed.title || f.title, order: feeds.length };
          const saved = await Storage.addFeed(feed);
          await Storage.upsertArticles(saved.id, parsed.items);
          feeds = await loadFeeds();
          added++;
        } catch (err) {
          console.warn('Import feed failed:', f.url, err);
          failed++;
        }
      }
      if (added > 0) statusEl.textContent = `Imported ${added} feed${added !== 1 ? 's' : ''}.`;
      if (failed > 0) statusEl.textContent += ` ${failed} failed (check console).`;
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
    function doInstall() {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(({ outcome }) => {
          if (outcome === 'accepted') document.getElementById('install-prompt').hidden = true;
        });
      } else {
        window.location.hash = 'about';
      }
    }
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      document.getElementById('install-prompt').hidden = false;
    });
    document.getElementById('btn-install')?.addEventListener('click', doInstall);
    document.getElementById('btn-install-main')?.addEventListener('click', doInstall);
  }

  function wirePullToRefresh() {
    const list = document.getElementById('view-all');
    if (list) UI.initPullToRefresh(list, refreshAllFeeds);
  }

  function wireLoadMore() {
    const limit = () => Storage.getSettings().postsPerPage || 15;

    document.getElementById('btn-load-more-all')?.addEventListener('click', async () => {
      const next = await Storage.getArticles({ limit: limit(), offset: allArticles.length });
      allArticles = allArticles.concat(next);
      UI.renderArticleList('article-list', allArticles, feedMap, { emptyId: 'empty-state' });
      document.getElementById('empty-state').hidden = allArticles.length > 0;
      document.getElementById('load-more-all-wrap').hidden = next.length < limit();
      document.getElementById('article-list')?.querySelectorAll('.article-item').forEach((el) => {
        attachArticleItemListeners(el, allArticles, 'all');
      });
    });

    document.getElementById('btn-load-more-starred')?.addEventListener('click', async () => {
      const next = await Storage.getArticles({ starredOnly: true, limit: limit(), offset: starredArticles.length });
      starredArticles = starredArticles.concat(next);
      UI.renderArticleList('starred-list', starredArticles, feedMap, { emptyId: 'empty-starred' });
      document.getElementById('empty-starred').hidden = starredArticles.length > 0;
      document.getElementById('load-more-starred-wrap').hidden = next.length < limit();
      document.getElementById('starred-list')?.querySelectorAll('.article-item').forEach((el) => {
        attachArticleItemListeners(el, starredArticles, 'starred');
      });
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
    wireFeeds();
    wireLoadMore();
    wireArticleReader();
    wireSettings();
    wireInstallPrompt();
    wirePullToRefresh();

    const hash = (window.location.hash || '#all').slice(1);
    UI.showView(['all', 'feeds', 'starred', 'settings', 'about'].includes(hash) ? hash : 'all');

    if (feeds.length > 0) await refreshAllFeeds();
    scheduleRefresh();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
