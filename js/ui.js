/**
 * JustRSS - A minimal, intentional RSS reader
 * Copyright (C) 2025 rkbarney
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Source: https://github.com/rkbarney/justrss
 */

/**
 * UI: views, list rendering, swipe gestures, pull-to-refresh, article reader.
 */

const UI = {
  scrollPositions: {},
  currentArticleList: [],
  currentArticleIndex: 0,

  _colorScheme: 'system',

  setTheme(colorScheme, style) {
    const root = document.documentElement;
    UI._colorScheme = colorScheme || 'system';
    root.setAttribute('data-style', style || 'minimal');
    const applyColor = (dark) => {
      if (UI._colorScheme === 'system') {
        root.setAttribute('data-color-scheme', dark ? 'dark' : 'light');
      }
    };
    if (colorScheme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      applyColor(mq.matches);
      if (!UI._mqListener) {
        UI._mqListener = (e) => applyColor(e.matches);
        mq.addEventListener('change', UI._mqListener);
      }
    } else {
      root.setAttribute('data-color-scheme', colorScheme === 'dark' ? 'dark' : 'light');
    }
  },

  setFontSize(size) {
    document.body.setAttribute('data-article-font', String(size));
  },

  setFontFamily(fontFamily) {
    document.body.setAttribute('data-font-family', fontFamily || 'courier');
  },

  setNavPosition(position) {
    document.body.setAttribute('data-nav-position', position || 'top');
  },

  showView(viewId) {
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('view-active'));
    const view = document.getElementById(`view-${viewId}`);
    if (view) view.classList.add('view-active');

    const loading = document.getElementById('loading-articles');
    if (loading) loading.hidden = true;

    if (viewId !== 'article' && typeof UI.setViewTitle === 'function') UI.setViewTitle();

    const backBtn = document.getElementById('btn-back');
    backBtn.hidden = viewId !== 'article';
    const headerMain = document.querySelector('.app-header-main');
    if (headerMain) headerMain.hidden = viewId === 'article';

    document.querySelectorAll('.header-nav-link[data-view]').forEach((n) => {
      const nView = n.getAttribute('data-view');
      if (nView) {
        n.classList.toggle('nav-active', nView === viewId);
        n.setAttribute('aria-current', nView === viewId ? 'page' : null);
      }
    });

    if (viewId === 'article') return;
    const scrollEl = viewId === 'feeds' ? view : view?.querySelector('.article-list, .feed-list, .settings-list, .about-content');
    if (scrollEl && UI.scrollPositions[viewId] != null) {
      scrollEl.scrollTop = UI.scrollPositions[viewId];
    }
  },

  saveScroll(viewId) {
    const view = document.getElementById(`view-${viewId}`);
    const scrollEl = viewId === 'feeds' ? view : view?.querySelector('.article-list, .feed-list, .settings-list, .about-content');
    if (scrollEl) UI.scrollPositions[viewId] = scrollEl.scrollTop;
  },

  formatDate(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    const diff = now - d;
    const timeStr = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    if (sameDay(d, now)) return 'Today ' + timeStr;
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (sameDay(d, yesterday)) return 'Yesterday ' + timeStr;
    const dateStr = d.toLocaleDateString([], { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
    return dateStr + ' ' + timeStr;
  },

  escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  },

  /** URL for "Open in browser". For podcast feeds (added via Podcasts tab): guid → enclosure → link. For others: existing behavior. */
  getArticleDisplayUrl(article, feed) {
    const articleLink = (article?.link || '').trim();
    const enclosureUrl = (article?.enclosureUrl || '').trim();
    const guid = (article?.guid || '').trim();
    const feedLink = (feed?.link || '').trim();
    const appleUrl = (feed?.appleUrl || '').trim();
    const feedUrl = (feed?.url || '').trim();
    const appleEpisodeUrl = (article?.appleEpisodeUrl || '').trim();
    const isPodcastFeed = feed?.type === 'podcast';
    const isPodcast = article?.durationSeconds != null && article.durationSeconds > 0;
    const mediaExt = /\.(mp3|m4a|mp4|wav|ogg|aac|mpa|webm|opus)(\?|$)/i;
    const articleLinkIsMedia = articleLink && mediaExt.test(articleLink);
    const isApplePodcastsUrl = (url) => url && /podcasts\.apple\.com/i.test(url);

    if (isPodcastFeed) {
      if (appleEpisodeUrl) return appleEpisodeUrl;
      if (guid) return guid;
      if (enclosureUrl) return enclosureUrl;
      if (articleLink && !articleLinkIsMedia && isApplePodcastsUrl(articleLink)) return articleLink;
      if (appleUrl) return appleUrl;
      if (articleLink) return articleLink;
      if (feedLink) return feedLink;
      return feedUrl || '';
    }

    if (isPodcast && appleEpisodeUrl) return appleEpisodeUrl;
    if (isPodcast && articleLink && !articleLinkIsMedia && isApplePodcastsUrl(articleLink)) return articleLink;
    if (isPodcast && appleUrl) return appleUrl;
    if (articleLink && !articleLinkIsMedia) return articleLink;
    if (isPodcast && enclosureUrl) return enclosureUrl;
    if (isPodcast && feedLink) return feedLink;
    if (feedLink) return feedLink;
    if (feedUrl) return feedUrl;
    return articleLink || enclosureUrl || '';
  },

  renderArticleList(containerId, articles, feedMap, options = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    const list = options.listId || 'article-list';
    const emptyId = options.emptyId || 'empty-state';
    const emptyEl = document.getElementById(emptyId);
    if (emptyEl) {
      emptyEl.hidden = articles.length > 0;
      if (articles.length === 0) {
        const newUser = document.getElementById('empty-state-new-user');
        const showAllRead = (options.feedsLength || 0) > 0;
        if (newUser) newUser.hidden = showAllRead;
        const loadMoreWrap = document.getElementById('load-more-all-wrap');
        if (loadMoreWrap) loadMoreWrap.hidden = true;
      }
    }

    articles.forEach((a) => {
      const feed = feedMap[a.feedId] || {};
      const metaParts = [UI.escapeHtml(feed.title || 'Feed'), UI.formatDate(a.published)];
      if (a.durationSeconds && window.FeedParser && typeof window.FeedParser.formatDuration === 'function') {
        metaParts.push(window.FeedParser.formatDuration(a.durationSeconds));
      }
      const el = document.createElement('div');
      el.className = 'article-item' + (a.read ? '' : ' unread');
      el.setAttribute('role', 'listitem');
      el.dataset.articleId = a.id;
      el.innerHTML = `
        <span class="article-item-swipe-hint left" aria-hidden="true">Read</span>
        <span class="article-item-swipe-hint right" aria-hidden="true">Hide</span>
        <h2 class="article-item-title">${UI.escapeHtml(a.title)}</h2>
        <div class="article-item-meta">${metaParts.join(' · ')}</div>
      `;
      container.appendChild(el);
    });
  },

  renderFeedList(feeds, unreadCounts) {
    const container = document.getElementById('feed-list');
    const empty = document.getElementById('empty-feeds');
    if (!container) return;
    container.innerHTML = '';
    if (empty) empty.hidden = feeds.length > 0;

    feeds.forEach((f) => {
      const unread = unreadCounts[f.id] || 0;
      const muted = !!f.muted;
      const el = document.createElement('div');
      el.className = 'feed-item' + (muted ? ' muted' : '');
      el.dataset.feedId = f.id;
      el.innerHTML = `
        <div class="feed-item-info">
          <div class="feed-item-title">
            ${UI.escapeHtml(f.title || f.url)}
          </div>
          <div class="feed-item-meta">${unread} unread</div>
        </div>
      `;
      container.appendChild(el);
    });
  },

  stripHtml(html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    return (div.textContent || div.innerText || '').replace(/\s+/g, ' ').trim();
  },

  renderArticleContent(article, feed) {
    const titleEl = document.getElementById('article-title');
    const displayUrl = UI.getArticleDisplayUrl(article, feed);
    titleEl.textContent = article?.title || '';
    titleEl.href = displayUrl || '#';
    titleEl.style.pointerEvents = displayUrl ? '' : 'none';
    document.getElementById('article-meta').innerHTML = feed
      ? `${UI.escapeHtml(feed.title)} · ${UI.formatDate(article?.published)}`
      : '';
    const body = document.getElementById('article-body');
    const content = (article?.content || '').trim();
    const plainText = content ? UI.stripHtml(content) : '';
    const TRUNCATE_LEN = 250;
    let html = '';
    if (article?.image && /^https?:\/\//i.test(article.image)) {
      html += `<p><img src="${article.image.replace(/"/g, '&quot;')}" alt="" style="max-width:100%;height:auto;"></p>`;
    }
    if (content) {
      const fullHtml = html + content;
      if (plainText.length > TRUNCATE_LEN) {
        const truncated = UI.escapeHtml(plainText.slice(0, TRUNCATE_LEN));
        html += `<p class="article-body-truncated">${truncated}<span class="article-body-expand" role="button" tabindex="0">...</span></p>`;
        body.innerHTML = html;
        const expandEl = body.querySelector('.article-body-expand');
        expandEl.addEventListener('click', () => {
          body.innerHTML = fullHtml;
        });
        expandEl.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            body.innerHTML = fullHtml;
          }
        });
      } else {
        body.innerHTML = fullHtml;
      }
    } else {
      html += '<p class="no-preview">No preview available. Use "Open in browser" above to read the full article.</p>';
      body.innerHTML = html;
    }
    const link = document.getElementById('article-link');
    link.href = displayUrl || '#';
    link.setAttribute('href', displayUrl || '#');
  },

  showArticle(article, feed, list, index) {
    UI.currentArticleList = list || [];
    UI.currentArticleIndex = index ?? 0;
    UI.renderArticleContent(article, feed);
    document.getElementById('view-article').classList.add('view-active');
    document.querySelectorAll('#view-all, #view-feeds, #view-settings, #view-about').forEach((v) => v.classList.remove('view-active'));
    document.getElementById('view-title').textContent = 'JustRSS';
    document.getElementById('btn-back').hidden = false;
    document.querySelectorAll('.header-nav-link[data-view]').forEach((n) => n.classList.remove('nav-active'));
  },

  initSwipe(el, onSwipeLeft, onSwipeRight) {
    let startX = 0;
    el.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX;
      el.classList.remove('swipe-left', 'swipe-right');
    }, { passive: true });
    el.addEventListener('touchend', (e) => {
      const endX = e.changedTouches[0].clientX;
      const dx = endX - startX;
      if (Math.abs(dx) > 60) {
        if (dx < 0) onSwipeLeft();
        else onSwipeRight();
      }
      el.classList.remove('swipe-left', 'swipe-right');
    }, { passive: true });
    el.addEventListener('touchmove', (e) => {
      const x = e.touches[0].clientX;
      const dx = x - startX;
      if (dx < -30) el.classList.add('swipe-left');
      else if (dx > 30) el.classList.add('swipe-right');
    }, { passive: true });
  },

  initPullToRefresh(container, onRefresh) {
    let startY = 0;
    const indicator = document.getElementById('pull-indicator');
    container.addEventListener('touchstart', (e) => {
      startY = e.touches[0].clientY;
    }, { passive: true });
    container.addEventListener('touchmove', (e) => {
      if (container.scrollTop <= 0 && e.touches[0].clientY - startY > 40 && indicator) {
        indicator.textContent = 'Release to refresh';
        indicator.classList.add('pulling');
      }
    }, { passive: true });
    container.addEventListener('touchend', () => {
      if (indicator?.classList.contains('pulling')) {
        indicator.classList.remove('pulling');
        indicator.textContent = '';
        onRefresh();
      }
    }, { passive: true });
  },
};

window.UI = UI;
