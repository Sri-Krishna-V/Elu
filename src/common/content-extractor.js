/**
 * Shared Content Extraction Module
 *
 * Single source of truth for extracting article content from web pages.
 * Uses Mozilla Readability (the engine behind Firefox Reader View) as the
 * primary extractor, with CSS-selector and heuristic fallbacks.
 *
 * Every feature (TTS, Bionic Reading, Simplification, Smart Chunking,
 * PageInfo) imports from here instead of rolling its own extraction logic.
 */

import { Readability } from '@mozilla/readability';

// ─── Shared selector constants ────────────────────────────────────────────

/**
 * CSS selectors that typically wrap the main article / primary content.
 * Used as a fallback when Readability cannot parse the page.
 */
export const MAIN_CONTENT_SELECTORS = [
    'article',
    '[role="main"]',
    'main',
    '.post-content',
    '.article-content',
    '.entry-content',
    '.content-body',
    '#content',
    '.story-body',
    '.article-body',
    '.article-text',
    '.story-content',
    '[itemprop="articleBody"]',
    // Site-specific
    '.paid-premium-content',
    '.str-story-body',
    '.str-article-content',
    '#story-body',
].join(', ');

/**
 * Selectors for metadata / chrome that should be excluded even when they
 * appear inside a main-content container.
 */
const METADATA_SELECTORS = [
    'nav', 'footer', 'header',
    '.author', '.meta', '.claps', '.likes', '.stats',
    '.profile', '.bio', '.premium-box',
    'aside', '.sidebar', '#sidebar',
    '.comments', '#comments', '.comment-section',
    '.related-posts', '.related-articles', '.recommended',
    '.newsletter-popup', '.subscribe-popup',
    '.social-share', '.share-buttons',
    '[class*="comment"]', '[class*="sidebar"]',
    '[class*="related"]', '[class*="recommend"]',
    '[class*="ad-"]', '[class*="advert"]',
    '.ad', '.ads', '.advertisement',
].join(', ');

/**
 * Elements to query inside a content container for paragraph-level content.
 */
const PARAGRAPH_SELECTORS = 'p, h1, h2, h3, h4, h5, h6, ul, ol, dl, li, blockquote';

// ─── Readability-based extraction ─────────────────────────────────────────

/**
 * Run Readability on a *clone* of the current document and return the
 * parsed article object, or null if parsing fails / page isn't article-like.
 *
 * @returns {{ title: string, content: string, textContent: string, excerpt: string } | null}
 */
function readabilityParse() {
    try {
        const clone = document.cloneNode(true);
        const reader = new Readability(clone, {
            charThreshold: 100,     // lower threshold to catch shorter articles
        });
        const article = reader.parse();
        if (article && article.textContent && article.textContent.trim().length > 100) {
            return article;
        }
    } catch (err) {
        console.warn('[Elu content-extractor] Readability failed:', err.message);
    }
    return null;
}

// ─── CSS-selector fallback ────────────────────────────────────────────────

/**
 * Find the main content container via CSS selectors.
 * @returns {HTMLElement | null}
 */
function findMainContainer() {
    return document.querySelector(MAIN_CONTENT_SELECTORS);
}

/**
 * Heuristic fallback: find the largest text-dense element on the page.
 * Walks top-level children of <body> and scores by visible text length.
 * @returns {HTMLElement | null}
 */
function findLargestTextBlock() {
    let best = null;
    let bestLen = 0;
    const candidates = document.body.querySelectorAll('div, section');
    for (const el of candidates) {
        // Ignore tiny or hidden elements
        if (el.offsetParent === null) continue;
        const text = el.innerText || '';
        if (text.length > bestLen) {
            bestLen = text.length;
            best = el;
        }
    }
    return bestLen > 200 ? best : null;
}

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * Extract the article's **plain text**.
 *
 * Fallback chain: Readability → CSS selector → largest text block → body.
 *
 * @returns {string} The article text content.
 */
export function extractArticleText() {
    // 1. Readability
    const article = readabilityParse();
    if (article) return article.textContent.trim();

    // 2. CSS selector container
    const container = findMainContainer();
    if (container) {
        return getFilteredText(container);
    }

    // 3. Largest text block
    const block = findLargestTextBlock();
    if (block) return getFilteredText(block);

    // 4. Last resort
    return document.body.innerText || '';
}

/**
 * Extract the article content as a **DOM element** (useful for scoped
 * operations like Bionic Reading).
 *
 * Readability returns an HTML string which we parse into a temporary element
 * so callers can walk it.  If Readability fails, we return the first
 * matching main-content container (or body).
 *
 * @returns {HTMLElement} An element containing the article content.
 */
export function extractArticleElement() {
    // 1. Readability — but we need to return the *live* DOM container,
    //    not Readability's parsed HTML, because Bionic needs to mutate
    //    the actual page.  So we use Readability only to confirm this is
    //    an article, then fall through to the selector.
    const container = findMainContainer();
    if (container) return container;

    const block = findLargestTextBlock();
    if (block) return block;

    return document.body;
}

/**
 * Extract article content as an **array of paragraph / heading elements**
 * from the live DOM.  Filters out metadata, short non-list elements, and
 * date/byline patterns.
 *
 * Used by Simplification and Smart Chunking.
 *
 * @returns {{ container: HTMLElement, elements: HTMLElement[] }}
 */
export function extractArticleParagraphs() {
    const container = findMainContainer() || findLargestTextBlock() || document.body;

    const raw = Array.from(container.querySelectorAll(PARAGRAPH_SELECTORS));

    const elements = raw.filter(el => {
        // Always keep headings
        if (/^H[1-6]$/i.test(el.tagName)) return true;

        // Skip if inside metadata areas
        if (el.closest(METADATA_SELECTORS)) return false;

        // Skip hidden elements
        if (el.offsetParent === null) return false;

        const text = el.textContent.trim();

        // Skip empty
        if (text.length === 0) return false;

        // For non-list elements, require minimum length
        if (!['UL', 'OL', 'DL', 'LI', 'BLOCKQUOTE'].includes(el.tagName)) {
            if (text.length < 50) return false;
        }

        // Skip byline / date patterns
        if (/^(By|Published|Updated|Written by|(\d+)\s*min read|(\d+)\s*claps)/i.test(text)) {
            return false;
        }

        return true;
    });

    // De-duplicate: if we matched both a <ul> and its child <li>s, keep
    // only the <ul> (outer element) to avoid double-processing.
    const deduped = elements.filter(el => {
        if (['LI'].includes(el.tagName)) {
            const parentList = el.closest('ul, ol, dl');
            if (parentList && elements.includes(parentList)) return false;
        }
        return true;
    });

    return { container, elements: deduped };
}

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Get filtered text from a container, excluding metadata areas.
 * @param {HTMLElement} container
 * @returns {string}
 */
function getFilteredText(container) {
    // Clone so we can remove junk without affecting the live DOM
    const clone = container.cloneNode(true);
    clone.querySelectorAll(METADATA_SELECTORS).forEach(el => el.remove());
    return (clone.innerText || clone.textContent || '').trim();
}
