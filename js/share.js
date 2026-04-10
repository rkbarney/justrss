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
 * Feed sharing: encode/decode feed URLs for share links.
 * Pure functions — no DOM dependency except buildShareUrl and stripImportParam.
 */

(function () {
  const MAX_FEEDS = 15;

  /**
   * Encode an array of feed URLs as base64 JSON.
   * Throws if urls is not an array or exceeds MAX_FEEDS.
   */
  function encodeFeedUrls(urls) {
    if (!Array.isArray(urls)) throw new Error('Expected array of URLs');
    if (urls.length > MAX_FEEDS) throw new Error(`Maximum ${MAX_FEEDS} feeds per share link`);
    return btoa(JSON.stringify(urls));
  }

  /**
   * Decode a base64 encoded feed URL list.
   * Returns { urls: string[]|null, error: string|null, truncated: boolean }
   * Possible error values: 'invalid_base64', 'invalid_json', 'not_array', 'empty'
   * On success: error is null, urls is an array (possibly truncated to MAX_FEEDS).
   */
  function decodeFeedUrls(encoded) {
    let decoded;
    try {
      decoded = atob(encoded);
    } catch {
      return { urls: null, error: 'invalid_base64', truncated: false };
    }
    let parsed;
    try {
      parsed = JSON.parse(decoded);
    } catch {
      return { urls: null, error: 'invalid_json', truncated: false };
    }
    if (!Array.isArray(parsed)) {
      return { urls: null, error: 'not_array', truncated: false };
    }
    if (parsed.length === 0) {
      return { urls: [], error: 'empty', truncated: false };
    }
    let truncated = false;
    if (parsed.length > MAX_FEEDS) {
      parsed = parsed.slice(0, MAX_FEEDS);
      truncated = true;
    }
    return { urls: parsed, error: null, truncated };
  }

  /**
   * Build a share URL for the given feed URLs.
   * Uses the current page's origin + pathname as the base.
   */
  function buildShareUrl(urls) {
    const encoded = encodeFeedUrls(urls);
    const base = window.location.origin + window.location.pathname;
    return `${base}?import=${encoded}`;
  }

  /**
   * Extract the ?import= param from a URL search string.
   * Returns null if not present.
   * Pure — does not touch window; pass window.location.search as argument.
   */
  function getImportParam(search) {
    const params = new URLSearchParams(search);
    return params.get('import');
  }

  /**
   * Strip the ?import= param from the current URL using history.replaceState.
   * No-op if there is no import param.
   */
  function stripImportParam() {
    const url = new URL(window.location.href);
    url.searchParams.delete('import');
    history.replaceState(null, '', url.pathname + url.search + url.hash);
  }

  /**
   * Given a list of URLs to import and a list of existing feed URLs,
   * return { toAdd: string[], skipped: number } where toAdd are new URLs only.
   * Pure — no side effects.
   */
  function planImport(urls, existingUrls) {
    const existingSet = new Set(existingUrls);
    const toAdd = urls.filter((url) => url && typeof url === 'string' && !existingSet.has(url));
    const skipped = urls.length - toAdd.length;
    return { toAdd, skipped };
  }

  window.FeedShare = {
    MAX_FEEDS,
    encodeFeedUrls,
    decodeFeedUrls,
    buildShareUrl,
    getImportParam,
    stripImportParam,
    planImport,
  };
})();
