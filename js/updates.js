/**
 * Updates: fetch merged PRs from GitHub and render as a changelog.
 */

const Updates = (() => {
  const REPO = 'rkbarney/justrss';
  const API_URL = `https://api.github.com/repos/${REPO}/pulls?state=closed&base=main&per_page=30&sort=updated&direction=desc`;

  let loaded = false;

  function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s || '';
    return div.innerHTML;
  }

  function renderPR(pr) {
    const title = pr.title || 'Untitled';
    const date = formatDate(pr.merged_at);
    const url = pr.html_url || '';
    const el = document.createElement('div');
    el.className = 'article-item';
    el.setAttribute('role', 'listitem');
    el.innerHTML = `
      <h2 class="article-item-title" dir="auto"><a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(title)}</a></h2>
      <div class="article-item-meta">${escapeHtml(date)}</div>
    `;
    return el;
  }

  function renderError(container) {
    container.innerHTML = '<p class="hint" style="padding:16px">Could not load updates. Check your connection and try again.</p>';
  }

  function renderLoading(container) {
    container.innerHTML = '<p class="hint" style="padding:16px">Loading updates…</p>';
  }

  async function load() {
    if (loaded) return;
    const container = document.getElementById('updates-list');
    if (!container) return;

    renderLoading(container);

    try {
      const res = await fetch(API_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const prs = await res.json();

      // Only show merged PRs
      const merged = prs.filter((pr) => pr.merged_at);

      container.innerHTML = '';
      if (merged.length === 0) {
        container.innerHTML = '<p class="hint" style="padding:16px">No updates yet.</p>';
        return;
      }

      merged.forEach((pr) => container.appendChild(renderPR(pr)));
      loaded = true;
    } catch (e) {
      renderError(container);
    }
  }

  return { load };
})();
