# RSS Reader PWA - Cursor Agent Instructions

## Project Overview
Create a mobile-first RSS reader web application that serves as an alternative to corporate social media. Users can subscribe to their friends' personal websites via RSS, own their reading experience, and save the app to their phone's homescreen.

## Core Philosophy
- **Reader Owns Their Feed**: No algorithm, no corporate control
- **Privacy First**: All data stored locally in browser
- **Dead Simple UX**: Paste URL → Subscribe → Read
- **Progressive Web App**: Works offline, installs like native app
- **No Backend Required**: Pure client-side application

## Technical Requirements

### Framework & Architecture
- **Mobile-First PWA** (Progressive Web App)
- Single Page Application (SPA)
- Pure client-side JavaScript (no server required)
- LocalStorage or IndexedDB for feed data
- Service Worker for offline functionality
- Vanilla JS or lightweight framework (React/Vue acceptable if needed)

### Core Features

#### 1. Feed Management
**Add Feed:**
- Single input field: "Paste RSS feed URL"
- Auto-detect RSS feed from website URL if possible
- Validate feed before adding
- Show feed title/description after successful add
- Visual confirmation of subscription

**Feed List:**
- Display all subscribed feeds
- Show unread count per feed
- Delete/unsubscribe option
- Reorder feeds (drag and drop or up/down buttons)
- Pull-to-refresh to update all feeds

#### 2. Reading Interface
**Article List:**
- Chronological "River of News" view (all feeds mixed) as default
- Option to filter by individual feed
- Show: Title, source, timestamp, excerpt
- Mark as read/unread
- Star/favorite articles
- Clean, scannable list design

**Article Reader:**
- Full article content display
- Readable typography (18px+, 1.7 line-height)
- "Open in browser" link to original
- Share button (native share API)
- Previous/Next article navigation
- Mark read automatically on view

#### 3. Data Management
**Local Storage:**
- All feed subscriptions stored in browser
- All article data cached locally
- Settings/preferences saved
- Export subscriptions (OPML format)
- Import subscriptions (OPML format)

**Sync Strategy:**
- Fetch new articles on app open
- Background sync when online (service worker)
- Cache articles for offline reading
- Configurable: fetch frequency, article retention

### Design Specifications

#### Mobile-First UI

**Layout:**
```
Primary view: 320px - 768px
Tablet: 768px+
Desktop: Optional (but should work)
```

**Touch Targets:**
- Minimum 44x44px for all interactive elements
- Swipe gestures:
  - Swipe left on article: Mark as read
  - Swipe right on article: Star/favorite
  - Pull down: Refresh feeds
  
**Navigation:**
- Bottom tab bar (mobile standard):
  - All Articles (home icon)
  - Feeds (list icon)  
  - Starred (star icon)
  - Settings (gear icon)
- Single-tap to open article
- Back button returns to list (preserve scroll position)

#### Typography & Readability
- System font stack
- Article content: 18-20px base size
- Line height: 1.7-1.8
- Maximum content width: 680px
- Generous padding: 20px mobile, 40px desktop
- Clear visual hierarchy

#### Color Scheme
- Light/Dark mode (auto-detect `prefers-color-scheme`)
- Manual toggle in settings
- High contrast for readability
- Suggested palette:
  - Light: White/light gray background, dark text
  - Dark: Dark gray/black background, off-white text
  - Accent color for links, unread indicators

### Progressive Web App Requirements

#### Manifest (manifest.json)
```json
{
  "name": "RSS Reader",
  "short_name": "RSS",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#000000",
  "icons": [
    {
      "src": "icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

#### Service Worker
- Cache app shell for instant loading
- Cache article content for offline reading
- Background sync for feed updates
- Handle offline gracefully (show cached content)

#### Install Prompts
- Show "Add to Home Screen" prompt
- iOS Safari: Instructions for manual add
- Android: Native install prompt
- Desktop: Optional PWA install

### Feed Parsing

#### RSS/Atom Support
- Parse RSS 2.0
- Parse Atom feeds
- Parse JSON Feed (optional)
- Handle malformed feeds gracefully
- Extract:
  - Article title
  - Link
  - Publication date
  - Content/description
  - Author (if available)
  - Featured image (if available)

#### CORS Handling
Since RSS feeds can't be fetched directly due to CORS:
- Use a CORS proxy for feed fetching
- Options:
  - RSS2JSON (public API)
  - AllOrigins (public proxy)
  - Build simple proxy (optional)
  - Or use browser extension approach
- Make proxy configurable in settings

### Key User Flows

#### First Time User
1. Land on empty state with friendly onboarding
2. "Add your first feed" prominent CTA
3. Example: "Try pasting a blog URL or RSS feed"
4. After first feed: Show article list immediately
5. Subtle prompt to add to homescreen

#### Daily Usage
1. Open app (from homescreen icon)
2. See latest articles from all feeds
3. Scroll, tap to read
4. Swipe to mark read/star
5. Pull to refresh

#### Add Feed
1. Tap "+" button
2. Paste URL
3. App tries to auto-detect RSS feed
4. Confirm subscription
5. Return to feed with new articles

### Settings/Preferences

**Required Settings:**
- Add/Remove feeds
- Dark/Light mode toggle
- Export subscriptions (OPML)
- Import subscriptions (OPML)
- Clear all data

**Optional Settings:**
- Auto-refresh interval
- Article retention (days)
- Default view (all/unread)
- Font size adjustment
- Notification preferences (if implementing)

### File Structure
```
/
├── index.html
├── manifest.json
├── service-worker.js
├── css/
│   └── style.css
├── js/
│   ├── app.js
│   ├── feed-parser.js
│   ├── storage.js
│   └── ui.js
├── icons/
│   ├── icon-192.png
│   └── icon-512.png
└── README.md
```

### Performance Requirements
- First load: <2 seconds on 3G
- App shell: <50KB
- Cached articles available offline
- Smooth 60fps scrolling
- Lazy load article content
- Virtualized lists for 1000+ articles

### Data Privacy
- All data stored locally (LocalStorage/IndexedDB)
- No analytics/tracking
- No user accounts
- No data sent to any server (except RSS fetching via proxy)
- User owns and controls all data

### Error Handling
- Invalid feed URL: Clear error message
- Network offline: Show cached content, indicate offline
- Feed fetch failure: Retry logic, show last successful fetch
- Corrupt feed: Skip gracefully, notify user
- Storage quota exceeded: Prompt to clear old articles

## Development Instructions

1. **Start Mobile-Only**: Build and test exclusively at 375px width initially
2. **Offline-First**: Implement service worker early, test offline scenarios
3. **Touch Interactions**: All gestures must feel native
4. **Performance**: Test with 100+ feeds, 1000+ articles
5. **Real Feeds**: Test with various RSS feeds (blogs, news, podcasts)

## Testing Checklist
- [ ] Installs as PWA on iOS Safari
- [ ] Installs as PWA on Android Chrome
- [ ] Works completely offline after first load
- [ ] Handles 50+ subscribed feeds
- [ ] Smooth scrolling with 500+ articles
- [ ] Swipe gestures work reliably
- [ ] Pull-to-refresh updates feeds
- [ ] OPML import/export works
- [ ] Dark mode switches properly
- [ ] All touch targets ≥44px
- [ ] Accessible (keyboard navigation, screen readers)

## Example RSS Feeds for Testing
- https://waitbutwhy.com/feed
- https://world.hey.com/dhh/feed.atom
- https://blog.pragmaticengineer.com/rss/
- Any personal blog with RSS

## Nice-to-Have Features
- Search articles (full-text)
- Filter by date range
- Podcast support (audio player) (will just open it in whatever is the default app)
- Share button for articles/posts
- Full-content fetch for truncated feeds

## Philosophy Reminders
This is a **reader** not a **platform**. The goal is to help people consume content from independent websites without corporate intermediaries. Keep it simple, fast, and private. The user should feel like they own their reading experience.

## Output Deliverables
1. Complete working PWA
2. Service worker with offline support
3. Installation instructions
4. User guide (how to add feeds)
5. OPML import/export functionality
6. README for deployment (can host on GitHub Pages, Netlify, etc.)

Build something that replaces social media feeds with actual RSS feeds from real websites. It should feel like a native app but work anywhere.