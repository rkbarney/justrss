/**
 * UI: views, list rendering, swipe gestures, pull-to-refresh, article reader.
 */

const UI = {
  scrollPositions: {},
  currentArticleList: [],
  currentArticleIndex: 0,

  setTheme(theme) {
    const root = document.documentElement;
    if (theme === 'auto') {
      root.removeAttribute('data-theme');
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      root.setAttribute('data-theme', mq.matches ? 'dark' : 'light');
      mq.addEventListener('change', (e) => {
        root.setAttribute('data-theme', e.matches ? 'dark' : 'light');
      });
    } else {
      root.setAttribute('data-theme', theme);
    }
  },

  setFontSize(size) {
    document.body.setAttribute('data-article-font', String(size));
  },

  showView(viewId) {
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('view-active'));
    const view = document.getElementById(`view-${viewId}`);
    if (view) view.classList.add('view-active');

    const title = document.getElementById('view-title');
    const titles = { all: 'All Articles', feeds: 'Feeds', starred: 'Starred', settings: 'Settings', article: '' };
    title.textContent = titles[viewId] || 'Article';

    const backBtn = document.getElementById('btn-back');
    backBtn.hidden = viewId !== 'article';

    document.querySelectorAll('.nav-item').forEach((n) => {
      n.classList.toggle('nav-active', n.getAttribute('data-view') === viewId);
      n.setAttribute('aria-current', n.getAttribute('data-view') === viewId ? 'page' : null);
    });

    if (viewId === 'article') return;
    const scrollEl = view?.querySelector('.article-list, .feed-list, .settings-list');
    if (scrollEl && UI.scrollPositions[viewId] != null) {
      scrollEl.scrollTop = UI.scrollPositions[viewId];
    }
  },

  saveScroll(viewId) {
    const view = document.getElementById(`view-${viewId}`);
    const scrollEl = view?.querySelector('.article-list, .feed-list');
    if (scrollEl) UI.scrollPositions[viewId] = scrollEl.scrollTop;
  },

  formatDate(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    const diff = now - d;
    if (diff < 86400000) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (diff < 604800000) return d.toLocaleDateString([], { weekday: 'short' });
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
  },

  escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  },

  renderArticleList(containerId, articles, feedMap, options = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    const list = options.listId || 'article-list';
    const emptyId = options.emptyId || 'empty-state';
    const emptyEl = document.getElementById(emptyId);
    if (emptyEl) emptyEl.hidden = articles.length > 0;

    articles.forEach((a) => {
      const feed = feedMap[a.feedId] || {};
      const el = document.createElement('div');
      el.className = 'article-item' + (a.read ? '' : ' unread') + (a.starred ? ' starred' : '');
      el.setAttribute('role', 'listitem');
      el.dataset.articleId = a.id;
      el.innerHTML = `
        <span class="article-item-swipe-hint left" aria-hidden="true">Read</span>
        <span class="article-item-swipe-hint right" aria-hidden="true">★</span>
        <span class="article-item-star" aria-hidden="true">★</span>
        <h2 class="article-item-title">${UI.escapeHtml(a.title)}</h2>
        <div class="article-item-meta">${UI.escapeHtml(feed.title || 'Feed')} · ${UI.formatDate(a.published)}</div>
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
      const el = document.createElement('div');
      el.className = 'feed-item';
      el.dataset.feedId = f.id;
      el.innerHTML = `
        <div class="feed-item-info">
          <div class="feed-item-title">${UI.escapeHtml(f.title || f.url)}</div>
          <div class="feed-item-meta">${unread} unread</div>
        </div>
        <div class="feed-item-actions">
          <button type="button" class="btn-feed-delete" aria-label="Remove feed">✕</button>
        </div>
      `;
      container.appendChild(el);
    });
  },

  renderArticleContent(article, feed) {
    document.getElementById('article-title').textContent = article?.title || '';
    document.getElementById('article-meta').innerHTML = feed
      ? `${UI.escapeHtml(feed.title)} · ${UI.formatDate(article?.published)}`
      : '';
    const body = document.getElementById('article-body');
    if (article?.content) {
      body.innerHTML = article.content;
    } else {
      body.innerHTML = '<p>No content.</p>';
    }
    const link = document.getElementById('article-link');
    link.href = article?.link || '#';
    link.setAttribute('href', article?.link || '#');
  },

  showArticle(article, feed, list, index) {
    UI.currentArticleList = list || [];
    UI.currentArticleIndex = index ?? 0;
    UI.renderArticleContent(article, feed);
    document.getElementById('view-article').classList.add('view-active');
    document.querySelectorAll('#view-all, #view-feeds, #view-starred, #view-settings').forEach((v) => v.classList.remove('view-active'));
    document.getElementById('view-title').textContent = '';
    document.getElementById('btn-back').hidden = false;
    document.querySelectorAll('.nav-item').forEach((n) => n.classList.remove('nav-active'));
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
