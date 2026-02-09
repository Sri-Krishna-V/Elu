/**
 * Smart Content Chunking Algorithm
 * Breaks long-form content into digestible chunks with visual progress tracking
 */

import { createChunk, createProgress, getStoredProgress, saveProgress } from '../common/models/chunk.js';
import { logger } from '../common/logger.js';

let currentChunks = [];
let currentProgress = null;
let chunkContainer = null;
let originalContent = null;
let sessionStartTime = null;

// Default configuration
const CONFIG = {
    targetWordsPerChunk: 150,
    minWordsPerChunk: 50,
    maxWordsPerChunk: 300
};

/**
 * Main content selectors (reused from existing codebase)
 */
const CONTENT_SELECTORS = [
    'article',
    '[role="main"]',
    'main',
    '.post-content',
    '.article-content',
    '.entry-content',
    '.content-body',
    '#content',
    '.story-body',
    '.article-body'
].join(', ');

/**
 * Initialize chunking for current page
 * @returns {Promise<{chunks: ContentChunk[], progress: ReadingProgress}>}
 */
export async function initChunking() {
    logger.info('Initializing smart chunking...');

    // Find main content
    const mainContent = document.querySelector(CONTENT_SELECTORS);
    if (!mainContent) {
        logger.error('Could not find main content for chunking');
        return null;
    }

    // Store original for restoration
    originalContent = mainContent.cloneNode(true);

    // Get content elements
    const elements = getContentElements(mainContent);
    if (elements.length === 0) {
        logger.error('No content elements found');
        return null;
    }

    // Create chunks
    currentChunks = chunkContent(elements);
    logger.info(`Created ${currentChunks.length} chunks`);

    // Load or create progress
    const pageUrl = window.location.href;
    const storedProgress = await getStoredProgress(pageUrl);

    if (storedProgress && storedProgress.totalChunks === currentChunks.length) {
        currentProgress = storedProgress;
        logger.info('Restored previous progress');
    } else {
        currentProgress = createProgress(pageUrl, document.title, currentChunks.length);
    }

    sessionStartTime = Date.now();

    return { chunks: currentChunks, progress: currentProgress };
}

/**
 * Get all content elements from main content area
 * @param {HTMLElement} container
 * @returns {HTMLElement[]}
 */
function getContentElements(container) {
    const elements = container.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote');

    return Array.from(elements).filter(el => {
        // Skip hidden elements
        if (el.offsetParent === null) return false;

        // Skip very short content
        const text = el.textContent.trim();
        if (text.length < 10) return false;

        // Skip likely metadata
        if (el.closest('nav, footer, aside, .comments, .related')) return false;

        return true;
    });
}

/**
 * Chunk content elements into groups
 * @param {HTMLElement[]} elements
 * @returns {ContentChunk[]}
 */
function chunkContent(elements) {
    const chunks = [];
    let currentElements = [];
    let currentWordCount = 0;

    for (const element of elements) {
        const wordCount = countWords(element.textContent);

        // Check if adding this would exceed max
        if (currentWordCount + wordCount > CONFIG.maxWordsPerChunk && currentElements.length > 0) {
            // Save current chunk
            chunks.push(createChunk({
                index: chunks.length,
                elements: [...currentElements],
                wordCount: currentWordCount
            }));
            currentElements = [];
            currentWordCount = 0;
        }

        currentElements.push(element);
        currentWordCount += wordCount;

        // Check if we've reached target size
        if (currentWordCount >= CONFIG.targetWordsPerChunk) {
            chunks.push(createChunk({
                index: chunks.length,
                elements: [...currentElements],
                wordCount: currentWordCount
            }));
            currentElements = [];
            currentWordCount = 0;
        }
    }

    // Don't forget the last chunk
    if (currentElements.length > 0) {
        chunks.push(createChunk({
            index: chunks.length,
            elements: [...currentElements],
            wordCount: currentWordCount
        }));
    }

    return chunks;
}

/**
 * Count words in text
 * @param {string} text
 * @returns {number}
 */
function countWords(text) {
    return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}

/**
 * Render chunked view replacing original content
 */
export function renderChunkedView() {
    if (!currentChunks.length || !currentProgress) {
        logger.error('No chunks to render');
        return;
    }

    const mainContent = document.querySelector(CONTENT_SELECTORS);
    if (!mainContent) return;

    // Create chunk container
    chunkContainer = document.createElement('div');
    chunkContainer.className = 'elu-chunk-container';
    chunkContainer.innerHTML = `
        <div class="elu-chunk-header">
            <div class="elu-progress-bar">
                <div class="elu-progress-fill" style="width: ${getProgressPercent()}%"></div>
                <span class="elu-progress-text">${getProgressPercent()}% complete</span>
            </div>
            <div class="elu-chunk-nav">
                <button class="elu-chunk-btn elu-prev-btn" ${currentProgress.currentChunkIndex === 0 ? 'disabled' : ''}>
                    ← Previous
                </button>
                <span class="elu-chunk-indicator">
                    Chunk ${currentProgress.currentChunkIndex + 1} of ${currentChunks.length}
                </span>
                <button class="elu-chunk-btn elu-next-btn" ${currentProgress.currentChunkIndex >= currentChunks.length - 1 ? 'disabled' : ''}>
                    Next →
                </button>
                <button class="elu-chunk-btn elu-bookmark-btn" title="Bookmark this chunk">
                    ${isCurrentBookmarked() ? '🔖' : '📑'}
                </button>
            </div>
            <div class="elu-chunk-meta">
                <span class="elu-read-time">⏱️ ${formatReadTime(getCurrentChunk().estimatedReadTime)}</span>
                <span class="elu-complexity elu-complexity-${getCurrentChunk().complexity}">
                    ${getCurrentChunk().complexity.toUpperCase()}
                </span>
            </div>
        </div>
        <div class="elu-chunk-content">
            ${getCurrentChunkHtml()}
        </div>
        <div class="elu-chunk-footer">
            <button class="elu-chunk-btn elu-complete-btn">
                ${isCurrentChunkRead() ? '✓ Completed' : 'Mark as Read'}
            </button>
            <button class="elu-chunk-btn elu-exit-btn">
                Exit Chunk View
            </button>
        </div>
    `;

    // Replace content
    mainContent.innerHTML = '';
    mainContent.appendChild(chunkContainer);

    // Attach event listeners
    attachChunkEventListeners();

    logger.info('Rendered chunked view');
}

/**
 * Get current chunk
 * @returns {ContentChunk}
 */
function getCurrentChunk() {
    return currentChunks[currentProgress.currentChunkIndex];
}

/**
 * Get HTML for current chunk
 * @returns {string}
 */
function getCurrentChunkHtml() {
    const chunk = getCurrentChunk();
    return chunk.simplifiedHtml || chunk.originalHtml;
}

/**
 * Check if current chunk is bookmarked
 * @returns {boolean}
 */
function isCurrentBookmarked() {
    return currentProgress.bookmarks.includes(currentProgress.currentChunkIndex);
}

/**
 * Check if current chunk is read
 * @returns {boolean}
 */
function isCurrentChunkRead() {
    return currentProgress.chunksCompleted.includes(currentProgress.currentChunkIndex);
}

/**
 * Get progress percentage
 * @returns {number}
 */
function getProgressPercent() {
    return Math.round((currentProgress.chunksCompleted.length / currentChunks.length) * 100);
}

/**
 * Format read time
 * @param {number} seconds
 * @returns {string}
 */
function formatReadTime(seconds) {
    if (seconds < 60) return `${seconds}s`;
    return `${Math.ceil(seconds / 60)} min`;
}

/**
 * Attach event listeners to chunk controls
 */
function attachChunkEventListeners() {
    if (!chunkContainer) return;

    // Previous button
    chunkContainer.querySelector('.elu-prev-btn')?.addEventListener('click', () => {
        goToChunk(currentProgress.currentChunkIndex - 1);
    });

    // Next button
    chunkContainer.querySelector('.elu-next-btn')?.addEventListener('click', () => {
        goToChunk(currentProgress.currentChunkIndex + 1);
    });

    // Bookmark button
    chunkContainer.querySelector('.elu-bookmark-btn')?.addEventListener('click', toggleBookmark);

    // Complete button
    chunkContainer.querySelector('.elu-complete-btn')?.addEventListener('click', completeCurrentChunk);

    // Exit button
    chunkContainer.querySelector('.elu-exit-btn')?.addEventListener('click', exitChunkedView);

    // Keyboard navigation
    document.addEventListener('keydown', handleKeyboardNav);
}

/**
 * Handle keyboard navigation
 * @param {KeyboardEvent} e
 */
function handleKeyboardNav(e) {
    if (!chunkContainer) return;

    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        goToChunk(currentProgress.currentChunkIndex - 1);
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        goToChunk(currentProgress.currentChunkIndex + 1);
    } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        completeCurrentChunk();
    }
}

/**
 * Navigate to specific chunk
 * @param {number} index
 */
export function goToChunk(index) {
    if (index < 0 || index >= currentChunks.length) return;

    currentProgress.currentChunkIndex = index;
    saveProgressAsync();
    renderChunkedView();
}

/**
 * Toggle bookmark on current chunk
 */
export function toggleBookmark() {
    const idx = currentProgress.currentChunkIndex;
    const bookmarkIdx = currentProgress.bookmarks.indexOf(idx);

    if (bookmarkIdx > -1) {
        currentProgress.bookmarks.splice(bookmarkIdx, 1);
    } else {
        currentProgress.bookmarks.push(idx);
    }

    saveProgressAsync();
    updateBookmarkButton();
}

/**
 * Update bookmark button state
 */
function updateBookmarkButton() {
    const btn = chunkContainer?.querySelector('.elu-bookmark-btn');
    if (btn) {
        btn.textContent = isCurrentBookmarked() ? '🔖' : '📑';
    }
}

/**
 * Mark current chunk as complete and advance
 */
export function completeCurrentChunk() {
    const idx = currentProgress.currentChunkIndex;

    if (!currentProgress.chunksCompleted.includes(idx)) {
        currentProgress.chunksCompleted.push(idx);
    }

    currentChunks[idx].isRead = true;

    // Auto-advance if not at end
    if (idx < currentChunks.length - 1) {
        currentProgress.currentChunkIndex = idx + 1;
    }

    saveProgressAsync();
    renderChunkedView();
}

/**
 * Exit chunked view and restore original content
 */
export function exitChunkedView() {
    // Update time spent
    if (sessionStartTime) {
        currentProgress.totalTimeSpent += Math.round((Date.now() - sessionStartTime) / 1000);
    }

    saveProgressAsync();

    // Restore original content
    const mainContent = document.querySelector(CONTENT_SELECTORS);
    if (mainContent && originalContent) {
        mainContent.innerHTML = originalContent.innerHTML;
    }

    // Remove keyboard listener
    document.removeEventListener('keydown', handleKeyboardNav);

    chunkContainer = null;
    logger.info('Exited chunked view');
}

/**
 * Save progress asynchronously
 */
function saveProgressAsync() {
    saveProgress(currentProgress).catch(err => {
        logger.error('Failed to save progress', err);
    });
}

/**
 * Get current progress (for external use)
 * @returns {ReadingProgress}
 */
export function getProgress() {
    return currentProgress;
}

/**
 * Get all chunks (for external use)
 * @returns {ContentChunk[]}
 */
export function getChunks() {
    return currentChunks;
}
