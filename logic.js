let settings = {
    interests: [],
    totalArticles: 10,
    articlesPerInterest: 5
};

let loadedArticles = new Set(); // Track article URLs to avoid duplicates
let currentPage = 0;
let isLoading = false;

const BACKEND_URL = window.CONFIG.BACKEND_URL;

// Load settings from localStorage on page load
function initSettings() {
    const saved = localStorage.getItem('newsReaderSettings');
    if (saved) {
        try {
            settings = JSON.parse(saved);
            document.getElementById('totalArticles').value = settings.totalArticles;
            document.getElementById('articlesPerInterest').value = settings.articlesPerInterest;
            renderInterests();
        } catch (e) {
            console.error('Error loading settings:', e);
        }
    }
}

function addInterest() {
    const input = document.getElementById('interestInput');
    const interest = input.value.trim();
    
    if (interest && !settings.interests.includes(interest)) {
        settings.interests.push(interest);
        input.value = '';
        renderInterests();
        saveToLocalStorage();
    }
}

function removeInterest(interest) {
    settings.interests = settings.interests.filter(i => i !== interest);
    renderInterests();
    saveToLocalStorage();
}

function renderInterests() {
    const list = document.getElementById('interestList');
    if (settings.interests.length === 0) {
        list.innerHTML = '<p style="color: #999; font-size: 0.9em;">No interests added yet.</p>';
        return;
    }
    
    list.innerHTML = settings.interests.map(interest => 
        `<span class="interest-tag">${interest}<button onclick="removeInterest('${interest}')">×</button></span>`
    ).join('');
}

function saveToLocalStorage() {
    settings.totalArticles = parseInt(document.getElementById('totalArticles').value);
    settings.articlesPerInterest = parseInt(document.getElementById('articlesPerInterest').value);
    localStorage.setItem('newsReaderSettings', JSON.stringify(settings));
}

function saveSettings() {
    saveToLocalStorage();
    
    const dataStr = JSON.stringify(settings, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'news-feed-settings.json';
    a.click();
    URL.revokeObjectURL(url);
    
    showMessage('Settings saved successfully!', 'success');
}

function loadSettings(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const loaded = JSON.parse(e.target.result);
            settings = loaded;
            document.getElementById('totalArticles').value = settings.totalArticles;
            document.getElementById('articlesPerInterest').value = settings.articlesPerInterest;
            renderInterests();
            saveToLocalStorage();
            showMessage('Settings loaded successfully!', 'success');
        } catch (error) {
            showMessage('Error loading settings file: ' + error.message, 'error');
        }
    };
    reader.readAsText(file);
}

async function loadFeed(loadMore = false) {
    if (isLoading) return;
    
    if (settings.interests.length === 0) {
        showMessage('Please add at least one interest first!', 'error');
        return;
    }

    if (!loadMore) {
        currentPage = 0;
        loadedArticles.clear();
    }

    isLoading = true;
    const feed = document.getElementById('feed');
    
    if (!loadMore) {
        feed.innerHTML = '<div class="loading">Loading your personalized feed</div>';
    }

    try {
        const articles = await fetchArticles();
        
        if (!loadMore) {
            feed.innerHTML = '<h2>Your Feed</h2>';
        }

        if (articles.length === 0) {
            feed.innerHTML += '<p style="color: #666;">No articles found. Try different interests or check if the backend server is running!</p>';
        } else {
            articles.forEach(article => {
                feed.innerHTML += createArticleHTML(article);
            });

            // Add doomscroll warning
            feed.innerHTML += `
                <div class="doomscroll-warning">
                    <h3>⚠️ Are you sure you want more results?</h3>
                    <p>Don't doomscroll! Take a break and come back later.</p>
                    <div class="warning-buttons">
                        <button class="btn-secondary" onclick="location.reload()">No, I'm done</button>
                        <button onclick="loadMoreArticles()">Yes, load more</button>
                    </div>
                </div>
            `;
        }

        currentPage++;
    } catch (error) {
        feed.innerHTML = `<div class="error">Error loading feed: ${error.message}. Make sure the backend server is running!</div>`;
    }

    isLoading = false;
}

async function loadMoreArticles() {
    const warning = document.querySelector('.doomscroll-warning');
    if (warning) {
        warning.remove();
    }
    await loadFeed(true);
}

async function fetchArticles() {
    const articlesPerInterest = settings.articlesPerInterest;
    const allArticles = [];

    for (const interest of settings.interests) {
        try {
            const offset = currentPage * articlesPerInterest;
            const response = await fetch(`${BACKEND_URL}/search?q=${encodeURIComponent(interest)}&limit=${articlesPerInterest}&offset=${offset}`);
            
            if (!response.ok) {
                throw new Error(`Server returned ${response.status}`);
            }

            const data = await response.json();
            
            // Process search results
            let added = 0;
            for (const article of data.articles) {
                if (added >= articlesPerInterest) break;
                
                // Skip if we've already loaded this article
                if (loadedArticles.has(article.url)) continue;
                
                allArticles.push({
                    title: article.title,
                    url: article.url,
                    snippet: article.snippet || 'No description available',
                    interest: interest,
                    source: article.source,
                    category: article.category,
                    pubDate: article.pubDate,
                    imageUrl: article.imageUrl || null
                });
                
                loadedArticles.add(article.url);
                added++;
            }
        } catch (error) {
            console.error(`Error fetching articles for ${interest}:`, error);
            showMessage(`Failed to fetch articles for "${interest}". Is the backend running?`, 'error');
        }
    }

    // Shuffle and limit to total articles
    const shuffled = allArticles.sort(() => Math.random() - 0.5);
    return shuffled.slice(0, settings.totalArticles);
}

function createArticleHTML(article) {
    const pubDate = article.pubDate ? new Date(article.pubDate).toLocaleDateString() : '';
    
    // Create image HTML if image exists
    const imageHTML = article.imageUrl 
        ? `<div class="article-image">
               <img src="${article.imageUrl}" alt="${article.title}" onerror="this.parentElement.style.display='none'">
           </div>`
        : '';
    
    return `
        <div class="article">
            ${imageHTML}
            <div class="article-content">
                <h3><a href="${article.url}" target="_blank">${article.title}</a></h3>
                <div class="article-snippet">${article.snippet}</div>
                <div class="article-meta">
                    <span class="article-tag">${article.interest}</span>
                    <span>${article.source}</span>
                    ${pubDate ? `<span>• ${pubDate}</span>` : ''}
                </div>
            </div>
        </div>
    `;
}

function showMessage(message, type) {
    const feed = document.getElementById('feed');
    const msgDiv = document.createElement('div');
    msgDiv.className = type;
    msgDiv.textContent = message;
    feed.insertBefore(msgDiv, feed.firstChild);
    
    setTimeout(() => msgDiv.remove(), 5000);
}

// Check backend connection on load
async function checkBackend() {
    try {
        const response = await fetch(`${BACKEND_URL}/stats`);
        if (response.ok) {
            const stats = await response.json();
            console.log('✓ Backend connected:', stats);
            showMessage(`Backend ready! ${stats.totalArticles} articles indexed from ${stats.totalFeeds} sources.`, 'success');
        }
    } catch (error) {
        console.error('Backend connection failed:', error);
        showMessage('⚠️ Backend server not connected. Please start the server with: npm start', 'error');
    }
}

// Allow Enter key to add interests
document.getElementById('interestInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        addInterest();
    }
});

// Initialize on page load
initSettings();
checkBackend();
