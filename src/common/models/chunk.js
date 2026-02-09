/**
 * Data models for Smart Content Chunking feature
 */

/**
 * Represents a single content chunk
 * @typedef {Object} ContentChunk
 * @property {string} id - Unique identifier for the chunk
 * @property {number} index - Position in the sequence
 * @property {HTMLElement[]} elements - Original DOM elements in this chunk
 * @property {string} originalHtml - Original HTML content
 * @property {string|null} simplifiedHtml - Simplified version (if processed)
 * @property {number} wordCount - Number of words in chunk
 * @property {number} estimatedReadTime - Estimated read time in seconds
 * @property {'low'|'medium'|'high'} complexity - Content complexity level
 * @property {boolean} isRead - Whether chunk has been read
 * @property {boolean} bookmarked - Whether chunk is bookmarked
 */

/**
 * Reading progress for a page
 * @typedef {Object} ReadingProgress
 * @property {string} pageUrl - URL of the page
 * @property {string} pageTitle - Title of the page
 * @property {number} totalChunks - Total number of chunks
 * @property {number} currentChunkIndex - Current reading position
 * @property {number[]} chunksCompleted - Indices of completed chunks
 * @property {number[]} bookmarks - Indices of bookmarked chunks
 * @property {number} lastAccessed - Timestamp of last access
 * @property {number} totalTimeSpent - Total reading time in seconds
 */

/**
 * Create a new ContentChunk
 * @param {Object} params
 * @returns {ContentChunk}
 */
export function createChunk({ index, elements, wordCount }) {
    return {
        id: `chunk-${index}-${Date.now()}`,
        index,
        elements,
        originalHtml: elements.map(el => el.outerHTML).join(''),
        simplifiedHtml: null,
        wordCount,
        estimatedReadTime: Math.ceil(wordCount / 200 * 60), // 200 WPM average
        complexity: calculateComplexity(elements),
        isRead: false,
        bookmarked: false
    };
}

/**
 * Calculate content complexity based on sentence length and vocabulary
 * @param {HTMLElement[]} elements
 * @returns {'low'|'medium'|'high'}
 */
function calculateComplexity(elements) {
    const text = elements.map(el => el.textContent).join(' ');
    const sentences = text.split(/[.!?]+/).filter(s => s.trim());
    const words = text.split(/\s+/).filter(w => w.length > 0);
    
    if (sentences.length === 0) return 'low';
    
    const avgWordsPerSentence = words.length / sentences.length;
    const avgWordLength = words.reduce((sum, w) => sum + w.length, 0) / words.length;
    
    // Simple heuristic: long sentences + long words = high complexity
    if (avgWordsPerSentence > 25 || avgWordLength > 6) return 'high';
    if (avgWordsPerSentence > 15 || avgWordLength > 5) return 'medium';
    return 'low';
}

/**
 * Create initial reading progress
 * @param {string} pageUrl
 * @param {string} pageTitle
 * @param {number} totalChunks
 * @returns {ReadingProgress}
 */
export function createProgress(pageUrl, pageTitle, totalChunks) {
    return {
        pageUrl,
        pageTitle,
        totalChunks,
        currentChunkIndex: 0,
        chunksCompleted: [],
        bookmarks: [],
        lastAccessed: Date.now(),
        totalTimeSpent: 0
    };
}

/**
 * Storage key for progress data
 */
export const PROGRESS_STORAGE_KEY = 'elu_reading_progress';

/**
 * Get progress from storage
 * @param {string} pageUrl
 * @returns {Promise<ReadingProgress|null>}
 */
export async function getStoredProgress(pageUrl) {
    return new Promise((resolve) => {
        chrome.storage.local.get([PROGRESS_STORAGE_KEY], (result) => {
            const allProgress = result[PROGRESS_STORAGE_KEY] || {};
            resolve(allProgress[pageUrl] || null);
        });
    });
}

/**
 * Save progress to storage
 * @param {ReadingProgress} progress
 * @returns {Promise<void>}
 */
export async function saveProgress(progress) {
    return new Promise((resolve) => {
        chrome.storage.local.get([PROGRESS_STORAGE_KEY], (result) => {
            const allProgress = result[PROGRESS_STORAGE_KEY] || {};
            allProgress[progress.pageUrl] = {
                ...progress,
                lastAccessed: Date.now()
            };
            
            // Cleanup: keep only last 50 pages
            const entries = Object.entries(allProgress);
            if (entries.length > 50) {
                entries.sort((a, b) => b[1].lastAccessed - a[1].lastAccessed);
                const trimmed = Object.fromEntries(entries.slice(0, 50));
                chrome.storage.local.set({ [PROGRESS_STORAGE_KEY]: trimmed }, resolve);
            } else {
                chrome.storage.local.set({ [PROGRESS_STORAGE_KEY]: allProgress }, resolve);
            }
        });
    });
}

/**
 * Get all stored progress (for dashboard)
 * @returns {Promise<Object.<string, ReadingProgress>>}
 */
export async function getAllProgress() {
    return new Promise((resolve) => {
        chrome.storage.local.get([PROGRESS_STORAGE_KEY], (result) => {
            resolve(result[PROGRESS_STORAGE_KEY] || {});
        });
    });
}
