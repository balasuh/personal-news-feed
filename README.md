# Personal News Feed

A self-hosted, personalized news aggregator. Add your interests, get relevant articles from curated RSS feeds.

## Features

- Keyword-based search across all indexed articles
- Interest-based filtering with per-interest article limits
- Anti-doomscroll: prompts before loading more
- Save/load interests as JSON
- Auto-refreshes feeds every 30 minutes
- No database, no API keys, no tracking

## Stack

- **Backend**: Node.js, Express, `rss-parser`, `dotenv`
- **Frontend**: Vanilla HTML/CSS/JS

## Setup

**1. Configure environment**

Copy `.env.example` to `.env` and set your desired port:

```
BACKEND_PORT=<port>
BACKEND_URL=http://localhost:<port>
```

**2. Install and start**

```bash
npm install
npm start
```

**3. Open the app**

Open `index.html` directly in your browser, or navigate to `http://localhost:<port>`.

## Configuration

**Add RSS feeds** — edit `feeds.json`:

```json
{
  "url": "https://example.com/rss",
  "category": "technology",
  "source": "Example",
  "keywords": ["tech", "ai", "innovation"]
}
```

**Change refresh interval** — edit `server.js`:

```js
const REFRESH_INTERVAL = 30 * 60 * 1000; // ms
```

## API

| Method | Endpoint                                 | Description            |
| ------ | ---------------------------------------- | ---------------------- |
| `GET`  | `/search?q=<query>&limit=<n>&offset=<n>` | Search articles        |
| `GET`  | `/stats`                                 | Index statistics       |
| `GET`  | `/health`                                | Health check           |
| `POST` | `/refresh`                               | Trigger manual refresh |

## File Structure

```
├── index.html          # Frontend UI
├── styles.css          # Styles
├── logic.js            # Frontend logic
├── config.js           # Runtime config fallback
├── server.js           # Express server
├── rss-aggregator.js   # RSS fetching and search
├── feeds.json          # Feed list
└── .env                # Environment config
```

## How Search Works

Articles are scored by:

- Title match: 10 pts
- Category match: 7 pts
- Snippet match: 5 pts
- Keyword match: 3 pts
- Recency bonus

Results are sorted by score, with offset-based pagination for "load more".

## Troubleshooting

**Backend not connected** — make sure `npm start` is running and `.env` has the correct `BACKEND_URL`.

**No articles found** — check the server console for feed fetch errors; some feeds may be unavailable.

**Port conflict** — update `BACKEND_PORT` and `BACKEND_URL` in `.env`.
