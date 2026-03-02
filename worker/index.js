/**
 * CORS proxy for JustRSS. Fetches URLs server-side and returns with CORS headers.
 * No logging, no storage — privacy-first.
 *
 * Security: Referer check, URL validation, private IP block, rate limit per IP.
 */

// Only allow requests originating from these domains. Add your deployment URL or localhost for dev.
const ALLOWED_ORIGINS = [
  'https://justrss.app',
  'https://rkbarney.github.io', // remove once fully moved to justrss.app
  'http://localhost:8080',
];

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

const BLOCKED_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^169\.254\./,
  /^::1$/i,
  /^fe80:/i,
  /^fc00:/i,
  /^fd00:/i,
];

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function textResponse(body, status = 200) {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', ...CORS_HEADERS },
  });
}

function isAllowedReferer(referer) {
  return ALLOWED_ORIGINS.some((origin) => referer.startsWith(origin));
}

function isBlockedHost(hostname) {
  const normalized = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  return BLOCKED_HOST_PATTERNS.some((p) => p.test(normalized));
}

export default {
  async fetch(request, env, ctx) {
    // 1. Handle OPTIONS preflight immediately
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    if (request.method !== 'GET') {
      return jsonResponse({ error: 'Method not allowed' }, 405);
    }

    // 2. Rate limit per IP (backstop if Referer is spoofed)
    if (env.PROXY_RATE_LIMITER) {
      const ip = request.headers.get('cf-connecting-ip') || 'unknown';
      const { success } = await env.PROXY_RATE_LIMITER.limit({ key: ip });
      if (!success) {
        return new Response('Too Many Requests', { status: 429, headers: { ...CORS_HEADERS, 'Content-Type': 'text/plain' } });
      }
    }

    // 3. Referer check — blocks casual and automated abuse
    const referer = request.headers.get('Referer') || '';
    if (!isAllowedReferer(referer)) {
      return new Response('Forbidden', { status: 403, headers: { ...CORS_HEADERS, 'Content-Type': 'text/plain' } });
    }

    // 4. Parse and validate target URL
    const url = new URL(request.url);
    const targetParam = url.searchParams.get('url');
    if (!targetParam) {
      return jsonResponse({ error: 'Missing url parameter' }, 400);
    }

    let target;
    try {
      target = new URL(targetParam);
    } catch {
      return jsonResponse({ error: 'Invalid URL' }, 400);
    }

    if (!['http:', 'https:'].includes(target.protocol)) {
      return jsonResponse({ error: 'Only http and https URLs are allowed' }, 400);
    }

    // 5. Block private/internal IP ranges (SSRF protection)
    if (isBlockedHost(target.hostname)) {
      return new Response('Forbidden', { status: 403, headers: { ...CORS_HEADERS, 'Content-Type': 'text/plain' } });
    }

    // 6. Fetch and return with CORS headers
    try {
      const res = await fetch(target.toString(), {
        method: 'GET',
        headers: {
          'User-Agent': 'JustRSS-Proxy/1.0',
          'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html, */*',
        },
        redirect: 'follow',
      });

      const text = await res.text();
      return textResponse(text, res.status);
    } catch {
      return jsonResponse({ error: 'Fetch failed' }, 502);
    }
  },
};
