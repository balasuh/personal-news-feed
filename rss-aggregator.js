import Parser from 'rss-parser';
import fs from 'fs/promises';

class RSSAggregator {
    constructor() {
        this.parser = new Parser({
            customFields: {
                item: [
                    ['media:content', 'media:content'],
                    ['media:thumbnail', 'media:thumbnail'],
                ]
            }
        });
        this.articles = [];
        this.feeds = [];
        this.lastUpdate = null;
    }

    // Extract image directly from RSS item fields, avoiding a network round-trip
    extractImageFromItem(item) {
        // media:content (e.g. BBC, many news sites)
        const mediaContent = item['media:content'];
        if (mediaContent) {
            const entries = Array.isArray(mediaContent) ? mediaContent : [mediaContent];
            for (const m of entries) {
                const url = m?.$?.url || m?.url;
                const medium = m?.$ ? m.$.medium : m?.medium;
                if (url && (!medium || medium === 'image')) return url;
            }
        }

        // media:thumbnail
        const mediaThumbnail = item['media:thumbnail'];
        if (mediaThumbnail) {
            const url = mediaThumbnail?.$ ? mediaThumbnail.$.url : mediaThumbnail?.url;
            if (url) return url;
        }

        // enclosure (common in podcast/image feeds)
        if (item.enclosure?.url && item.enclosure.type?.startsWith('image/')) {
            return item.enclosure.url;
        }

        // First <img> in content or description HTML
        const html = item.content || item.description || '';
        const imgMatch = html.match(/<img[^>]+src=["']([^"']+)["']/i);
        if (imgMatch?.[1]) return imgMatch[1];

        return null;
    }

    async loadFeeds() {
        try {
            const feedsData = await fs.readFile('./feeds.json', 'utf-8');
            const config = JSON.parse(feedsData);
            this.feeds = config.feeds;
            console.log(`✓ Loaded ${this.feeds.length} RSS feed sources`);
        } catch (error) {
            console.error('Error loading feeds.json:', error.message);
            throw error;
        }
    }

    async fetchAllFeeds() {
        console.log('\n🔄 Starting RSS feed aggregation...');
        const startTime = Date.now();
        let successCount = 0;
        let errorCount = 0;

        // Fetch all feeds in parallel
        const results = await Promise.allSettled(
            this.feeds.map(feedConfig => this.parser.parseURL(feedConfig.url).then(feed => ({ feed, feedConfig })))
        );

        const newArticles = [];
        for (const result of results) {
            if (result.status === 'fulfilled') {
                const { feed, feedConfig } = result.value;
                feed.items.forEach(item => {
                    const url = item.link || item.guid || '';
                    if (!url) return;
                    newArticles.push({
                        title: item.title || 'Untitled',
                        url,
                        snippet: this.cleanDescription(item.contentSnippet || item.description || ''),
                        content: item.content || item.description || '',
                        imageUrl: this.extractImageFromItem(item), // Extract from feed data first
                        source: feedConfig.source,
                        category: feedConfig.category,
                        keywords: feedConfig.keywords,
                        pubDate: item.pubDate ? new Date(item.pubDate) : new Date(),
                        fetchedAt: new Date()
                    });
                });
                successCount++;
                console.log(`  ✓ ${feedConfig.source} (${feed.items.length} articles)`);
            } else {
                errorCount++;
                // Extract feed name from the rejected promise if possible
                console.log(`  ✗ Feed failed: ${result.reason?.message || result.reason}`);
            }
        }

        // Remove duplicates based on URL
        const uniqueArticles = this.removeDuplicates(newArticles);

        // Sort by publication date (newest first)
        uniqueArticles.sort((a, b) => b.pubDate - a.pubDate);

        this.articles = uniqueArticles;

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);

        console.log(`\n✓ RSS aggregation complete in ${duration}s`);
        console.log(`  - Feeds fetched: ${successCount}/${this.feeds.length}`);
        console.log(`  - Total articles: ${this.articles.length}`);
        console.log(`  - Failed feeds: ${errorCount}`);

        this.lastUpdate = new Date();
        return this.articles;
    }

    removeDuplicates(articles) {
        const seen = new Set();
        return articles.filter(article => {
            if (seen.has(article.url)) {
                return false;
            }
            seen.add(article.url);
            return true;
        });
    }

    cleanDescription(text) {
        // Remove HTML tags
        let cleaned = text.replace(/<[^>]*>/g, '');
        // Decode HTML entities
        cleaned = cleaned.replace(/&nbsp;/g, ' ')
                        .replace(/&amp;/g, '&')
                        .replace(/&lt;/g, '<')
                        .replace(/&gt;/g, '>')
                        .replace(/&quot;/g, '"')
                        .replace(/&#39;/g, "'");
        // Trim and limit length
        cleaned = cleaned.trim().substring(0, 300);
        return cleaned;
    }

    search(query, limit = 20, offset = 0) {
        if (!query || query.trim() === '') {
            // Return recent articles if no query
            return this.articles.slice(0, limit);
        }

        const queryLower = query.toLowerCase();
        const queryWords = queryLower.split(/\s+/);

        // Score each article
        const scoredArticles = this.articles.map(article => {
            let score = 0;

            // Check title (highest weight)
            const titleLower = article.title.toLowerCase();
            queryWords.forEach(word => {
                if (titleLower.includes(word)) {
                    score += 10;
                }
            });

            // Check snippet
            const snippetLower = article.snippet.toLowerCase();
            queryWords.forEach(word => {
                if (snippetLower.includes(word)) {
                    score += 5;
                }
            });

            // Check keywords
            article.keywords.forEach(keyword => {
                queryWords.forEach(word => {
                    if (keyword.toLowerCase().includes(word) || word.includes(keyword.toLowerCase())) {
                        score += 3;
                    }
                });
            });

            // Check category
            if (article.category.toLowerCase().includes(queryLower)) {
                score += 7;
            }

            // Boost recent articles
            const ageInDays = (Date.now() - article.pubDate) / (1000 * 60 * 60 * 24);
            if (ageInDays < 1) score += 2;
            else if (ageInDays < 7) score += 1;

            return { article, score };
        });

        // Filter articles with score > 0 and sort by score
        const results = scoredArticles
            .filter(item => item.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(offset, offset + limit)
            .map(item => item.article);

        return results;
    }

    getStats() {
        return {
            totalArticles: this.articles.length,
            totalFeeds: this.feeds.length,
            lastUpdate: this.lastUpdate,
            categories: [...new Set(this.articles.map(a => a.category))],
            sources: [...new Set(this.articles.map(a => a.source))]
        };
    }

    // Save articles to JSON file (optional, for persistence)
    async saveToFile() {
        try {
            const data = {
                articles: this.articles,
                lastUpdate: this.lastUpdate
            };
            await fs.writeFile('./articles-cache.json', JSON.stringify(data, null, 2));
            console.log('✓ Articles cached to file');
        } catch (error) {
            console.error('Error saving articles cache:', error.message);
        }
    }

    // Load articles from JSON file (optional, for persistence)
    async loadFromFile() {
        try {
            const data = await fs.readFile('./articles-cache.json', 'utf-8');
            const parsed = JSON.parse(data);
            this.articles = parsed.articles.map(a => ({
                ...a,
                pubDate: new Date(a.pubDate),
                fetchedAt: new Date(a.fetchedAt)
            }));
            this.lastUpdate = new Date(parsed.lastUpdate);
            console.log(`✓ Loaded ${this.articles.length} articles from cache`);
            return true;
        } catch (error) {
            console.log('ℹ No cache file found, will fetch fresh data');
            return false;
        }
    }
}

export default RSSAggregator;
