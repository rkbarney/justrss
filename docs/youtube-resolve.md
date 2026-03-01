# How YouTube @handle resolution works (and how we compare)

## How News Keeper does it (from their source)

Their [YouTube RSS tool](https://www.newskeeper.io/tools/youtube-rss) is a **Next.js server-rendered page**:

1. **Form is GET, not client-side fetch.** The page has `<form method="GET">` with `<input name="query">`. When you click "Search", the browser navigates to the same URL with `?query=...` (e.g. `?query=https%3A%2F%2Fwww.youtube.com%2F%40stavvysworld`).

2. **The server does the work.** The response is full HTML with the feed list already rendered. So their Next.js server (or Edge function) receives the request, resolves the @handle to a channel ID **on the server**, builds the feed URLs, and returns the page. No CORS, no proxy: the server can call YouTube directly or use the YouTube Data API with a key.

3. **Why it feels instant.** From the browser’s point of view it’s one navigation; the heavy work (and any multi‑MB fetch) happens server-side. We can’t see their backend code, but the pattern is clear from the HTML and the GET form.

## How we do it (client-only)

We have **no backend**. Everything runs in the browser:

1. **Resolve @handle → channel ID**
   - **Fast path:** We try the [Piped API](https://docs.piped.video/docs/api-documentation/) first (`/c/:name` returns JSON with channel `id`). No CORS proxy, small response. If a Piped instance is up, resolve is quick.
   - **Fallback:** We use your chosen CORS proxy to fetch the YouTube channel page (m.youtube.com or www.youtube.com), then parse the HTML for the channel ID (we prefer `channelMetadataRenderer` so we get the main channel, not e.g. Clips). That can be slow because the page is large and the proxy streams it to the client.

2. **Feed options (All, Videos, Shorts, Live)**  
   We don’t fetch a channel page for these. Once we have the channel ID, we build the feed URLs with the known patterns (`channel_id=`, `playlist_id=UULF...`, etc.), same as News Keeper’s output.

3. **Custom playlists**  
   Only when we want to show extra playlists do we fetch the channel’s playlists page in the background (via proxy).

So the only inherently slow part for us is **resolving @handle when Piped isn’t available**: we must pull the channel page through a CORS proxy and parse it in the browser. News Keeper avoids that by doing that step on the server.

## Summary

| Step                    | News Keeper              | Just RSS (us)                          |
|-------------------------|--------------------------|----------------------------------------|
| Resolve @handle → ID    | Server (no CORS limit)   | Piped API first, else proxy + parse    |
| Build All/Videos/Shorts/Live | Server (same formulas) | Client (same formulas, no fetch)       |
| Custom playlists        | Server                   | Client (background fetch via proxy)     |

We added the Piped fast path so that when a Piped instance is reachable, @handle resolve can be close to instant without adding a backend.
