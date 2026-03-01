# Configuration Reference

This document lists every configurable value in Elu, where it lives, and what it controls.

---

## Source-level Config (`src/common/config.js`)

```js
export const simplificationLevelsConfig = {
    levels: 3  // 3 = compact mode (Low / Mid / High)  |  5 = full mode (1–5)
};
```

`levels` controls how many simplification buttons the popup renders:
- `3` — shows **Low** (level 1), **Mid** (level 3), **High** (level 5)
- `5` — shows all five levels with numeric labels

Change this value and rebuild to update the popup UI.

---

## Smart Chunking Config (`src/content/smart-chunking.js`)

```js
const CONFIG = {
    targetWordsPerChunk: 150,   // Ideal chunk size (words)
    minWordsPerChunk:    50,    // Minimum before forced flush
    maxWordsPerChunk:   300     // Hard cap; new chunk starts at this boundary
};
```

Modify these constants to tune the reading slice size for different content types.

---

## LLM Inference Config (`src/offscreen/index.js`)

```js
const DEFAULT_MODEL      = 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC';
const INIT_MAX_ATTEMPTS  = 3;
const INIT_BACKOFF_BASE_MS = 2000;           // 2s · 4s · 8s
const INFERENCE_TIMEOUT_MS = 180000;         // 3 minutes (for slow hardware)
```

`INFERENCE_TIMEOUT_MS` protects against hung inference on low-end GPUs. Increase for very slow devices; decrease to fail faster and show an error.

---

## Content Extractor Config (`src/common/content-extractor.js`)

The `MAIN_CONTENT_SELECTORS` export is a comma-joined CSS selector string used as a fallback when Readability fails. Add selectors for site-specific containers as needed.

---

## `chrome.storage.sync` Keys

All user preferences are read via `chrome.storage.sync.get(...)` and written via `chrome.storage.sync.set(...)`. No storage schema migration layer exists — keys are added or silently absent.

| Key | Type | Default | Description |
|---|---|---|---|
| `simplificationLevel` | `string` `'1'`–`'5'` | `'3'` | Active prompt intensity level |
| `optimizeFor` | `string` | `'textClarity'` | Active prompt family (`textClarity` \| `focusStructure` \| `wordPattern`) |
| `selectedModel` | `string` | `'Qwen2.5-0.5B-Instruct-q4f16_1-MLC'` | WebLLM model identifier |
| `selectedTheme` | `string` | `'default'` | Active colour theme key |
| `fontEnabled` | `boolean` | `false` | OpenDyslexic font active on all pages |
| `lineSpacing` | `number` | `1.5` | Line height multiplier (`1.0`–`3.0`) |
| `letterSpacing` | `number` | `0` | Letter spacing in px (`0`–`10`) |
| `wordSpacing` | `number` | `0` | Word spacing in px (`0`–`20`) |
| `focusMode` | `boolean` | `false` | Focus mode persisted state |
| `focusConfig` | `FocusConfig` | see below | Full focus-mode configuration object |
| `readingLevel` | `string` | — | Legacy key (migrated to `simplificationLevel`) |
| `chunkProgress_<url>` | `ReadingProgress` | — | Per-URL reading progress for chunking |

### FocusConfig Schema

```ts
interface FocusConfig {
    enabled:       boolean;   // currently active
    dimLevel:      number;    // 0.0–1.0 overlay opacity
    blockAnimations: boolean; // suppress CSS animations
    blockVideos:   boolean;   // pause all <video> elements
    hideComments:  boolean;   // hide comment sections
    hideSidebars:  boolean;   // hide sidebars and aside elements
    ambientSound:  'none' | 'brown-noise' | 'rain' | 'cafe';
    ambientVolume: number;    // 0.0–1.0
    timerEnabled:  boolean;   // show Pomodoro countdown
    timerDuration: number;    // minutes
}
```

### ReadingProgress Schema (`src/common/models/chunk.js`)

```ts
interface ReadingProgress {
    url:             string;
    title:           string;
    currentChunk:    number;  // 0-based index
    totalChunks:     number;
    completedChunks: number[];
    bookmarks:       number[];
    startTime:       number;
    lastReadTime:    number;
    totalReadTime:   number;
}
```

---

## Theme Keys

The following keys are valid for `selectedTheme`:

| Key | Background | Text |
|---|---|---|
| `default` | Page default | Page default |
| `highContrast` | `#FFFFFF` | `#000000` |
| `highContrastAlt` | `#000000` | `#FFFFFF` |
| `darkMode` | `#121212` | `#E0E0E0` |
| `sepia` | `#F5E9D5` | `#5B4636` |
| `lowBlueLight` | `#FFF8E1` | `#2E2E2E` |
| `softPastelBlue` | `#E3F2FD` | `#0D47A1` |
| `softPastelGreen` | `#F1FFF0` | `#00695C` |
| `creamPaper` | `#FFFFF0` | `#333333` |
| `grayScale` | `#F5F5F5` | `#424242` |
| `blueLightFilter` | `#FFF3E0` | `#4E342E` |
| `highContrastYellowBlack` | `#000000` | `#FFFF00` |
| `highContrastBlackYellow` | `#FFFF00` | `#000000` |
