# Common Utilities

**Location:** `src/common/`  
**Context:** Pure utilities — imported by both content scripts and extension pages. No top-level Chrome API calls.

---

## `content-extractor.js`

Single source of truth for extracting article content from web pages. Every feature module imports from here.

### Exported Constants

#### `MAIN_CONTENT_SELECTORS: string`

A comma-joined CSS selector string covering 18 common article container patterns (`article`, `[role="main"]`, `main`, `.post-content`, site-specific selectors, etc.). Used as a fallback when Readability fails.

### Exported Functions

#### `extractArticleText() → string`

Returns the full text content of the article as a plain string. Extraction strategy:
1. **Readability** — parses a DOM clone via `@mozilla/readability`; returns `article.textContent` if successful and > 100 chars.
2. **CSS selector fallback** — queries `MAIN_CONTENT_SELECTORS`, collects `p, h1–h6, ul, ol, li, blockquote` text.
3. **Heuristic fallback** — finds the element with the most text-dense children.

#### `extractArticleParagraphs() → { container: HTMLElement | null, elements: HTMLElement[] }`

Same three-strategy extraction but returns the container element and an array of individual paragraph-level elements for per-element processing (used by simplification and chunking).

#### `extractArticleElement() → HTMLElement | null`

Returns the container element used by bionic reading to scope the DOM walker.

---

## `config.js`

```js
export const simplificationLevelsConfig = {
    levels: 3  // 3 | 5
};
```

Controls popup button count. See [Configuration Reference](../configuration.md).

---

## `logger.js`

Thin wrapper around `console` that prefixes all messages with `[Elu]`:

```js
logger.info('Message');   // → [Elu] Message
logger.warn('Warning');
logger.error('Error');
```

Import and use in all modules instead of raw `console` calls to make log filtering easy in DevTools.

---

## `dictionary.js`

Exports `commonEnglishWords: Set<string>` — a pre-compiled set of ~3000 high-frequency English words. Used by the glossary to skip common words and avoid unnecessary API calls.

---

## `models/chunk.js`

Factory functions for the reading-progress data model.

### `createChunk({ index, elements, wordCount }) → ContentChunk`

```ts
interface ContentChunk {
    index:     number;
    elements:  HTMLElement[];
    wordCount: number;
    id:        string;   // 'chunk-{index}'
}
```

### `createProgress(url, title, totalChunks) → ReadingProgress`

Creates a fresh `ReadingProgress` object. See [configuration.md](../configuration.md#readingprogress-schema) for the full schema.

### `getStoredProgress(url) → Promise<ReadingProgress | null>`

Reads `chunkProgress_<url>` from `chrome.storage.sync`.

### `saveProgress(progress) → Promise<void>`

Writes `progress` to `chrome.storage.sync` under `chunkProgress_<url>`.

---

## `models/focus-config.js`

### `DEFAULT_FOCUS_CONFIG`

```js
{
    enabled:         false,
    dimLevel:        0.6,
    blockAnimations: true,
    blockVideos:     true,
    hideComments:    true,
    hideSidebars:    true,
    ambientSound:    'none',
    ambientVolume:   0.3,
    timerEnabled:    false,
    timerDuration:   25,
}
```

### `DISTRACTION_SELECTORS`

Object of CSS selector arrays keyed by category: `ads`, `sidebars`, `comments`, `related`, `popups`. Used by Focus Mode to hide elements.

### `getFocusConfig() → Promise<FocusConfig>`

Reads `focusConfig` from `chrome.storage.sync`, merging with `DEFAULT_FOCUS_CONFIG` to fill absent keys.

### `saveFocusConfig(config) → Promise<void>`

Writes the merged config to `chrome.storage.sync`.
