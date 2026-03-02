/**
 * CORS proxy for JustRSS. Fetches URLs server-side and returns with CORS headers.
 * No logging, no storage — privacy-first.
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

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

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    if (request.method !== 'GET') {
      return jsonResponse({ error: 'Method not allowed' }, 405);
    }

    const url = new URL(request.url);
    const targetUrl = url.searchParams.get('url');

    if (!targetUrl) {
      return jsonResponse({ error: 'Missing url parameter. Use ?url=https://example.com/feed.xml' }, 400);
    }

    let target;
    try {
      target = new URL(targetUrl);
    } catch {
      return jsonResponse({ error: 'Invalid url parameter' }, 400);
    }

    if (!['http:', 'https:'].includes(target.protocol)) {
      return jsonResponse({ error: 'URL must be http or https' }, 400);
    }

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
    } catch (err) {
      return jsonResponse({ error: 'Fetch failed: ' + (err.message || 'Unknown error') }, 502);
    }
  },
};
