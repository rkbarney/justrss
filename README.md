# RSS Reader PWA

A mobile-first RSS reader that runs entirely in your browser. No backend, no account, no algorithm. You own your feed.

Intentionally plain design (Drudge Report / Craigslist aesthetic)—the internet has gotten too polished; this one sucks a little more on purpose.

## Features

- **River of news** – All articles from all feeds in one chronological list
- **Add feeds** – Paste a blog URL or RSS feed; the app discovers the feed when possible
- **Star articles** – Swipe right to star, swipe left to mark read
- **Offline** – Service worker caches the app and articles for offline reading
- **Install** – Add to home screen on iOS/Android for an app-like experience
- **OPML** – Export and import subscriptions (Settings)
- **Dark/Light** – Follows system preference or set manually in Settings

## How to run

1. Serve the project over HTTP (required for service worker and CORS).
   - **Local:** `npx serve .` or `python3 -m http.server 8080` from the project root
   - **Deploy:** Push to GitHub and enable GitHub Pages, or use Netlify/Vercel (point to the repo root)

2. Open the app URL in your browser (e.g. `http://localhost:3000`).

3. Add a feed: go to **Feeds** → “Add your first feed” (or add from the empty state) → paste a blog or RSS URL → Add feed.

## Adding feeds

- You can paste either a **website URL** (e.g. `https://waitbutwhy.com`) or a **direct feed URL** (e.g. `https://waitbutwhy.com/feed`).
- If you paste a website URL, the app will try to discover the RSS/Atom link from the page.
- If a feed fails to load, try the other **CORS proxy** in Settings (e.g. AllOrigins vs RSS2JSON).

## File structure

```
/
├── index.html
├── manifest.json
├── service-worker.js
├── css/style.css
├── js/
│   ├── app.js
│   ├── feed-parser.js
│   ├── storage.js
│   └── ui.js
├── icons/
│   ├── icon-192.png
│   └── icon-512.png
├── scripts/
│   └── generate-icons.js   # optional: npm install pngjs && node scripts/generate-icons.js
└── README.md
```

## Deploy to GitHub Pages

1. Create a new repo on GitHub (e.g. `justrss`).
2. Push this project:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/justrss.git
   git push -u origin main
   ```
3. In the repo: **Settings → Pages → Build and deployment**
   - Source: **Deploy from a branch**
   - Branch: **main** (or **master**)
   - Folder: **/ (root)**
   - Save
4. Your site will be live at `https://YOUR_USERNAME.github.io/justrss/` in a minute or two.

The app uses relative paths, so it works both locally and on GitHub Pages. For installable PWA (Add to Home Screen), HTTPS is required—GitHub Pages provides that automatically.

## Data and privacy

- All data (feeds, articles, read/starred state, settings) is stored **locally** in your browser (IndexedDB + localStorage).
- No analytics, no accounts, no data sent to any server except when fetching feeds (via the chosen CORS proxy).

## Icons

The repo includes minimal placeholder icons. For better “Add to Home Screen” icons, replace `icons/icon-192.png` and `icons/icon-512.png` with your own 192×192 and 512×512 PNGs, or run `node scripts/generate-icons.js` after `npm install pngjs` to regenerate placeholders.

## License

Use and modify as you like.
