import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import RSSAggregator from './rss-aggregator.js';
import dotenv from "dotenv";
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.BACKEND_PORT;
const REFRESH_INTERVAL = 30 * 60 * 1000; // 30 minutes

// Initialize RSS Aggregator
const aggregator = new RSSAggregator();

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'online',
        message: 'RSS News Aggregator API',
        endpoints: {
            search: '/search?q=your+query&limit=20',
            stats: '/stats'
        }
    });
});

// Inject backend URL into config.js before static middleware intercepts it
app.get("/config.js", (req, res) => {
  res.type("application/javascript");
  res.send(`window.CONFIG = { BACKEND_URL: "${process.env.BACKEND_URL}" };`);
});

// Serve static assets (logic.js, styles.css, etc.)
app.use(express.static(__dirname, { index: false }));

// Search endpoint
app.get('/search', (req, res) => {
    try {
        const query = req.query.q || '';
        const limit = parseInt(req.query.limit) || 20;
        const offset = parseInt(req.query.offset) || 0;

        if (aggregator.articles.length === 0) {
            return res.status(503).json({
                error: 'Articles not yet loaded. Please try again in a moment.',
                articles: []
            });
        }

        const results = aggregator.search(query, limit, offset);

        res.json({
            query: query,
            count: results.length,
            articles: results.map(article => ({
                title: article.title,
                url: article.url,
                snippet: article.snippet,
                imageUrl: article.imageUrl || null,
                source: article.source,
                category: article.category,
                pubDate: article.pubDate,
                interest: query // For frontend compatibility
            }))
        });
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({
            error: 'Search failed',
            message: error.message
        });
    }
});

// Stats endpoint
app.get('/stats', (req, res) => {
    const stats = aggregator.getStats();
    res.json(stats);
});

// Refresh endpoint (manual trigger)
app.post('/refresh', async (req, res) => {
    try {
        console.log('Manual refresh triggered');
        await aggregator.fetchAllFeeds();
        await aggregator.saveToFile();
        res.json({
            success: true,
            message: 'Articles refreshed successfully',
            stats: aggregator.getStats()
        });
    } catch (error) {
        console.error('Refresh error:', error);
        res.status(500).json({
            error: 'Refresh failed',
            message: error.message
        });
    }
});

// Catch-all: serve index.html for any unmatched route
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Initialize aggregator
async function initialize() {
    try {
        console.log('🚀 Starting RSS News Aggregator...\n');
        
        // Load feed configuration
        await aggregator.loadFeeds();
        
        // Try to load cached articles first
        const cacheLoaded = await aggregator.loadFromFile();
        
        // If no cache or cache is old, fetch fresh data
        if (!cacheLoaded) {
            await aggregator.fetchAllFeeds();
            await aggregator.saveToFile();
        }
        
        // Set up automatic refresh
        setInterval(async () => {
            try {
                console.log('⏰ Auto-refresh triggered');
                await aggregator.fetchAllFeeds();
                await aggregator.saveToFile();
            } catch (error) {
                console.error('Auto-refresh failed:', error.message);
            }
        }, REFRESH_INTERVAL);
        
        console.log(`⏰ Auto-refresh scheduled every ${REFRESH_INTERVAL / 60000} minutes\n`);
        
    } catch (error) {
        console.error('Initialization failed:', error);
        process.exit(1);
    }
}

// Start server
initialize().then(() => {
    app.listen(PORT, () => {
        console.log(`✓ Server running on http://localhost:${PORT}`);
        console.log(`✓ Search endpoint: http://localhost:${PORT}/search?q=AI`);
        console.log(`✓ Stats endpoint: http://localhost:${PORT}/stats\n`);
    });
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n\n🛑 Shutting down gracefully...');
    await aggregator.saveToFile();
    process.exit(0);
});
