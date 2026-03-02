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

  setFontFamily(fontFamily) {
    document.body.setAttribute('data-font-family', fontFamily || 'times');
  },

  showView(viewId) {
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('view-active'));
    const view = document.getElementById(`view-${viewId}`);
    if (view) view.classList.add('view-active');

    const loading = document.getElementById('loading-articles');
    if (loading) loading.hidden = true;

    const title = document.getElementById('view-title');
    if (title && viewId !== 'article') title.textContent = 'JustRSS';

    const backBtn = document.getElementById('btn-back');
    backBtn.hidden = viewId !== 'article';
    const headerMain = document.querySelector('.app-header-main');
    if (headerMain) headerMain.hidden = viewId === 'article';

    document.querySelectorAll('.header-nav-link[data-view], #view-title').forEach((n) => {
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
    const scrollEl = viewId === 'feeds' ? view : view?.querySelector('.article-list, .feed-list, .about-content');
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
      const hasNew = unread > 0;
      const el = document.createElement('div');
      el.className = 'feed-item' + (muted ? ' muted' : '') + (hasNew ? ' has-new' : '');
      el.dataset.feedId = f.id;
      el.innerHTML = `
        <span class="feed-item-swipe-hint left" aria-hidden="true">Remove</span>
        <span class="feed-item-swipe-hint right" aria-hidden="true">${muted ? 'Unmute' : 'Mute'}</span>
        <div class="feed-item-info">
          <div class="feed-item-title">
            ${UI.escapeHtml(f.title || f.url)}
            ${hasNew ? '<span class="feed-item-new-dot" aria-hidden="true"></span>' : ''}
          </div>
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
    const content = (article?.content || '').trim();
    let html = '';
    if (article?.image && /^https?:\/\//i.test(article.image)) {
      html += `<p><img src="${article.image.replace(/"/g, '&quot;')}" alt="" style="max-width:100%;height:auto;"></p>`;
    }
    if (content) {
      html += content;
    } else {
      html += '<p class="no-preview">No preview available. Tap "Open in browser" below to read the full article.</p>';
    }
    body.innerHTML = html;
    const link = document.getElementById('article-link');
    link.href = article?.link || '#';
    link.setAttribute('href', article?.link || '#');
  },

  showArticle(article, feed, list, index) {
    UI.currentArticleList = list || [];
    UI.currentArticleIndex = index ?? 0;
    UI.renderArticleContent(article, feed);
    document.getElementById('view-article').classList.add('view-active');
    document.querySelectorAll('#view-all, #view-feeds, #view-settings').forEach((v) => v.classList.remove('view-active'));
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
