# Elu - AI-Powered Accessible Reading Assistant

<div align="center">
  <img src="public/images/icon128.png" alt="Elu Logo" width="128" height="128" />
  <p><em>Making the web accessible for every mind.</em></p>
</div>

Elu (short for **Elucidate**) is a Chrome extension that transforms web content for readers with dyslexia, ADHD, or other cognitive processing differences. It applies on-device AI, bionic reading, smart content chunking, focus isolation, and visual customization — entirely within the browser, with no data leaving the device.

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Module Reference](#module-reference)
- [Data Models](#data-models)
- [AI Integration](#ai-integration)
- [Build System](#build-system)
- [Extension Manifest](#extension-manifest)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Getting Started](#getting-started)
- [Privacy](#privacy)
- [Contributing](#contributing)
- [License](#license)

---

## Features

### AI Text Simplification

Rewrites page content using **Llama-3.2-1B-Instruct-q4f16_1-MLC** running entirely on-device via [WebLLM](https://github.com/mlc-ai/web-llm) and WebGPU. The model runs inside a dedicated **offscreen document** with a Web Worker so inference never blocks the extension UI. The simplification pipeline selects a system prompt based on two user-controlled axes:

- **Optimization mode** — `textClarity` (general readability), `focusStructure` (ADHD-oriented paragraph chunking), or `wordPattern` (dyslexia-oriented sentence patterning).
- **Simplification level** — 1 through 5, where level 1 lightly improves structure and level 5 rewrites in the simplest possible language. The UI exposes 3 levels (Low / Mid / High) by default, configurable via `src/common/config.js`.

System prompts are defined in `src/background/prompts.js` as a nested object keyed by `[mode][level]`. They are fetched by the content script from the background service worker via `chrome.runtime.sendMessage`.

The content script sends inference requests to the background service worker, which routes them to the offscreen document. The offscreen document maintains a serial inference queue to prevent concurrent model conflicts. Responses are returned via the OpenAI-compatible chat completions API provided by WebLLM. The output is rendered as HTML using the `marked` library.

### Smart Content Chunking

Breaks long-form articles into manageable reading segments without modifying the source HTML permanently.

- **Content detection**: Queries a prioritized list of semantic selectors (`article`, `[role="main"]`, `main`, `.post-content`, `.article-body`, and others) to locate the primary content region.
- **Element filtering**: Extracts block elements (`p`, `h1`–`h6`, `li`, `blockquote`), skipping hidden elements, very short strings (under 10 characters), and elements inside `nav`, `footer`, `aside`, `.comments`, or `.related`.
- **Chunking algorithm**: Groups elements into chunks targeting 150 words, with a hard minimum of 50 and maximum of 300 words per chunk. A new chunk is forced when the running word count would exceed the maximum.
- **Complexity scoring**: Each chunk is assigned `low`, `medium`, or `high` complexity based on average words per sentence and average word length. Sentences averaging over 25 words or words averaging over 6 characters score `high`.
- **Reading time**: Estimated at 200 WPM (words per minute), stored in seconds.
- **Progress persistence**: Reading position, completed chunks, and bookmarks are saved to `chrome.storage.sync` under a URL-keyed record, allowing sessions to resume across page loads.

### Focus Mode

Creates a distraction-free reading environment by manipulating the live DOM:

- **Overlay system**: Injects a positioned overlay that dims all non-content areas to a configurable opacity (0–100).
- **Distraction suppression**: Hides comments (`.comments`, `#disqus_thread`, `.fb-comments`, and related selectors), sidebars (`aside`, `.sidebar`, `[role="complementary"]`), advertisements, popups, and related-content blocks.
- **Animation blocking**: Injects a `<style>` rule disabling CSS `animation` and `transition` on all elements.
- **Video pausing**: Calls `.pause()` on all `<video>` elements found at activation time.
- **Ambient sound**: Plays one of four ambient audio options (rain, cafe, forest, white noise) at a configurable volume.
- **Pomodoro timer**: Optional countdown timer with configurable focus duration (default 25 minutes) and break duration (default 5 minutes), rendered as a floating widget on the page.
- **State persistence**: Focus configuration is stored in `chrome.storage.sync` under `elu_focus_config` and restored on the next visit.

### Bionic Reading

Applies bionic reading formatting to the live page DOM:

- Uses a `TreeWalker` to traverse all text nodes under `document.body`.
- Skips nodes inside `SCRIPT`, `STYLE`, `TEXTAREA`, `INPUT`, `NOSCRIPT`, `CODE`, and `PRE` tags, as well as `contenteditable` elements.
- For each word, bolds the first half of its characters (minimum 1, using `Math.ceil(length / 2)`), wrapping the bold portion in a `<b class="bionic-highlight">` element.
- Wraps each processed text node in a `<span class="bionic-processed">` to prevent double-processing.
- Fully reversible: `removeBionicReading()` replaces all `.bionic-processed` spans with plain text nodes and calls `document.body.normalize()`.

### Text-to-Speech

Reads page content aloud using the Web Speech API (`SpeechSynthesis`):

- Splits `document.body.innerText` into paragraphs on double newlines, filtering out fragments under 20 characters.
- Reads paragraphs sequentially using chained `SpeechSynthesisUtterance` instances.
- Supports runtime-adjustable speech rate and voice selection (any voice returned by `speechSynthesis.getVoices()`).
- Broadcasts paragraph-level progress events via `chrome.runtime.sendMessage` so the popup can display playback state.
- Controls: play, pause, resume, stop. Changing rate or voice mid-playback cancels the current utterance and restarts from the current paragraph index.

### Inline Glossary

Provides on-demand word definitions via double-click:

- Filters out common English words using a pre-bundled dictionary set (`src/common/dictionary.js`) to avoid trivial lookups.
- Ignores selections containing whitespace (single words only) and words longer than 40 characters.
- Fetches a definition from the WebLLM engine via the background → offscreen inference pipeline (same Llama-3.2-1B model used for simplification).
- Renders the definition in a Shadow DOM tooltip anchored below the selected word, using a fade-in animation. Shadow DOM isolation prevents host-page styles from affecting the tooltip.

### Visual Accessibility and Customization

13 built-in color themes applied as inline `backgroundColor` and `textColor` CSS overrides on the page:

| Theme | Background | Text |
|---|---|---|
| Default | (browser default) | (browser default) |
| High Contrast | `#FFFFFF` | `#000000` |
| High Contrast Alt | `#000000` | `#FFFFFF` |
| Dark Mode | `#121212` | `#E0E0E0` |
| Sepia | `#F5E9D5` | `#5B4636` |
| Low Blue Light | `#FFF8E1` | `#2E2E2E` |
| Soft Pastel Blue | `#E3F2FD` | `#0D47A1` |
| Soft Pastel Green | `#F1FFF0` | `#00695C` |
| Cream Paper | `#FFFFF0` | `#333333` |
| Grayscale | `#F5F5F5` | `#424242` |
| Blue Light Filter | `#FFF3E0` | `#4E342E` |
| High Contrast Yellow/Black | `#000000` | `#FFFF00` |
| High Contrast Black/Yellow | `#FFFF00` | `#000000` |

Additional typography controls:

- **OpenDyslexic font**: Applied via a bundled font file in `public/fonts/`, toggled by a class on `document.body`.
- **Spacing sliders**: Line spacing, letter spacing, and word spacing are applied as inline CSS on the `<body>` element and stored in `chrome.storage.sync`.

---

## Architecture

Elu follows the standard Chrome Extension Manifest V3 architecture, composed of five execution contexts:

```
┌──────────────────────────────────────────────────────────────────┐
│                         Chrome Browser                           │
│                                                                  │
│  ┌─────────────────┐   ┌──────────────────┐                     │
│  │  Popup UI        │   │  Options Page    │                     │
│  │  (src/popup/)    │   │  (src/options/)  │                     │
│  └────────┬─────────┘   └──────────────────┘                     │
│           │ chrome.tabs.sendMessage                               │
│  ┌────────▼──────────────────────────────────┐                   │
│  │  Content Script (src/content/index.js)    │                   │
│  │  Injected into every web page             │                   │
│  │  - AI simplification (delegates to bg)    │                   │
│  │  - Smart chunking                         │                   │
│  │  - Focus mode                             │                   │
│  │  - Bionic reading                         │                   │
│  │  - TTS                                    │                   │
│  │  - Glossary                               │                   │
│  │  - Visual customization                   │                   │
│  └────────┬──────────────────────────────────┘                   │
│           │ chrome.runtime.sendMessage                            │
│  ┌────────▼──────────────────────────────────┐                   │
│  │  Background Service Worker                │                   │
│  │  (src/background/index.js)                │                   │
│  │  - Keyboard command routing               │                   │
│  │  - System prompt delivery                 │                   │
│  │  - Install-time onboarding                │                   │
│  │  - Offscreen document lifecycle           │                   │
│  │  - LLM request routing                    │                   │
│  └────────┬──────────────────────────────────┘                   │
│           │ chrome.runtime.sendMessage({ target: 'offscreen' })  │
│  ┌────────▼──────────────────────────────────┐                   │
│  │  Offscreen Document (src/offscreen/)      │                   │
│  │  - WebLLM engine manager                  │                   │
│  │  - Serial inference queue                 │  ┌─────────────┐ │
│  │  - Model download progress broadcast      ├──▶ Web Worker   │ │
│  │                                           │  │ (WebGPU /    │ │
│  │  Llama-3.2-1B-Instruct-q4f16_1-MLC       │  │  WebAssembly)│ │
│  └───────────────────────────────────────────┘  └─────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

**Communication flow:**

- The popup sends commands to the content script via `chrome.tabs.sendMessage`.
- The content script requests system prompts from the background service worker via `chrome.runtime.sendMessage({ action: 'getSystemPrompts' })`.
- LLM inference requests flow: **content script → background → offscreen document → Web Worker (WebGPU)**. The background service worker creates the offscreen document on demand and routes `llmInfer` messages to it.
- The offscreen document broadcasts model download/compile progress to all extension pages (popup, options) via `chrome.runtime.sendMessage({ action: 'modelProgress' })`.
- The background service worker routes keyboard shortcut commands (`Alt+S`, `Alt+F`, `Alt+R`) to the active tab's content script.
- All persistent state (settings, reading progress, focus config) is stored in `chrome.storage.sync`.

---

## Project Structure

```
Elu/
├── public/
│   ├── content-loader.js       # Injected at document_start; dynamically loads the content script
│   ├── manifest.json           # Extension manifest (MV3)
│   ├── fonts/                  # OpenDyslexic font files
│   └── images/                 # Extension icons (16, 48, 128px)
├── src/
│   ├── background/
│   │   ├── index.js            # Service worker: install handler, message router, command dispatcher
│   │   └── prompts.js          # System prompt definitions for all AI modes and levels
│   ├── common/
│   │   ├── config.js           # Shared configuration (e.g., simplification level count)
│   │   ├── dictionary.js       # Common English word set for glossary filtering
│   │   ├── logger.js           # Batched async logger (writes to chrome.storage every 5s)
│   │   └── models/
│   │       ├── chunk.js        # ContentChunk and ReadingProgress data model factories
│   │       └── focus-config.js # FocusConfig model, defaults, and storage helpers
│   ├── content/
│   │   ├── index.js            # Content script entry point; message handler and orchestration
│   │   ├── smart-chunking.js   # Chunking algorithm and progress management
│   │   ├── focus-mode.js       # Focus mode DOM manipulation and state management
│   │   ├── bionic.js           # Bionic reading TreeWalker implementation
│   │   ├── tts.js              # Text-to-speech via Web Speech API
│   │   ├── glossary.js         # Double-click word definition via Shadow DOM tooltip
│   │   ├── content.css         # Content script base styles
│   │   └── chunking.css        # Styles for chunked reading view
│   ├── popup/
│   │   ├── index.html          # Popup markup
│   │   ├── index.js            # Popup logic: settings, controls, TTS playback UI
│   │   └── popup.css           # Popup styles
│   ├── options/
│   │   ├── index.html          # Options/onboarding page markup
│   │   └── index.js            # Options page logic
│   └── offscreen/
│       ├── index.html          # Offscreen document markup (hosts WebLLM engine)
│       ├── index.js            # Engine manager, serial inference queue, message handler
│       └── webllm-worker.js    # Web Worker running WebGPU/WebAssembly inference
├── vite.config.js              # Vite build configuration (multi-entry)
└── package.json
```

---

## Module Reference

### `src/background/index.js`

The Manifest V3 service worker. Responsibilities:

- **Install handler**: On first install, clears any stale `readingLevel` from storage and opens the onboarding page (`src/options/index.html?onboarding=true`). Pre-warms the offscreen document on install/update so the first inference request isn't blocked by model loading.
- **Offscreen document lifecycle**: Creates and manages the offscreen document (`src/offscreen/index.html`) that hosts the WebLLM engine. Uses `chrome.offscreen.hasDocument()` to check existence and `chrome.offscreen.createDocument()` to create on demand.
- **LLM request routing**: Intercepts `llmInfer` messages from the content script and forwards them to the offscreen document via `chrome.runtime.sendMessage({ target: 'offscreen', ... })`.
- **AI status relay**: Handles `checkAIStatus` by querying the offscreen document's engine status (`ready`, `loading`, `unavailable`).
- **System prompt delivery**: Responds to `getSystemPrompts` by returning the full `systemPrompts` object from `prompts.js`.
- **Command dispatcher**: Listens to `chrome.commands.onCommand` for `simplify-page`, `toggle-focus`, and `toggle-tts`, and forwards the corresponding `action` string to the active tab's content script.

### `src/background/prompts.js`

Exports a `systemPrompts` object with three top-level keys (`textClarity`, `focusStructure`, `wordPattern`), each mapping level strings `"1"` through `"5"` to a tailored system prompt string. Prompts are written to instruct the model to rewrite text for specific cognitive accessibility needs while preserving proper names, places, and direct quotes.

### `src/content/index.js`

The main content script. Key responsibilities:

- **LLM delegation**: AI inference is no longer handled locally. The content script resolves the appropriate system prompt (from cached prompts fetched via the background worker) and sends `{ action: 'llmInfer', systemPrompt, userPrompt }` to the background, which routes it to the offscreen document. Includes a retry loop (up to 2 attempts) per chunk.
- **Message routing**: A `chrome.runtime.onMessage` listener dispatches incoming actions (`simplify`, `chunk-start`, `focus-toggle`, `tts-play`, `tts-pause`, `tts-stop`, `bionic-toggle`, `theme-change`, `font-toggle`, `spacing-change`, etc.) to the appropriate sub-module.
- **Theme application**: Applies `backgroundColor` and `textColor` via a scoped `<style>` element targeting text-bearing elements, preserving images, SVGs, and Elu's own injected UI.
- **Spacing**: Applies `lineHeight`, `letterSpacing`, and `wordSpacing` via a dynamic `<style>` element on `document.head`.

### `src/content/smart-chunking.js`

See [Smart Content Chunking](#smart-content-chunking) above. Exported API:

| Function | Description |
|---|---|
| `initChunking()` | Detects content, builds chunks, loads or creates progress. Returns `{ chunks, progress }`. |
| `renderChunkedView(chunks, progress)` | Replaces page content with the chunked UI. |
| `goToChunk(index)` | Navigates to a specific chunk, saving progress. |
| `toggleBookmark(index)` | Toggles the bookmarked state on a chunk. |
| `completeCurrentChunk()` | Marks the current chunk as read and advances. |
| `exitChunkedView()` | Restores the original DOM and saves session time. |
| `getProgress()` | Returns the current `ReadingProgress` object. |

### `src/content/focus-mode.js`

See [Focus Mode](#focus-mode) above. Exported API:

| Function | Description |
|---|---|
| `activateFocusMode(config)` | Applies all focus mode effects based on the provided `FocusConfig`. |
| `deactivateFocusMode()` | Removes all effects and restores original styles. |
| `toggleFocusMode(config)` | Calls activate or deactivate depending on current state. |
| `isFocusModeActive()` | Returns a boolean indicating current state. |
| `updateFocusConfig(config)` | Updates the persisted config without toggling state. |

### `src/content/bionic.js`

| Function | Description |
|---|---|
| `applyBionicReading(rootElement)` | Applies bionic formatting to all text nodes under `rootElement` (defaults to `document.body`). |
| `removeBionicReading()` | Strips all bionic formatting and normalizes text nodes. |

### `src/content/tts.js`

| Function | Description |
|---|---|
| `handleTTSAction(action, options)` | Dispatcher for `tts-play`, `tts-pause`, `tts-resume`, `tts-stop`, `tts-set-speed`, `tts-set-voice`. |
| `getTTSState()` | Returns `{ isPlaying, isPaused, currentParagraphIndex, totalParagraphs }`. |

### `src/content/glossary.js`

| Function | Description |
|---|---|
| `initGlossary()` | Attaches the `dblclick` event listener to `document`. Must be called once during content script initialization. |

Glossary definitions are fetched via the same `llmInfer` pipeline as simplification (background → offscreen), using a dedicated system prompt that instructs the model to return a concise one-sentence definition.

### `src/offscreen/index.js`

The offscreen document script. Owns the WebLLM engine instance and manages its lifecycle:

- **Engine initialization** (`initEngine`): Spawns a Web Worker at `assets/webllm-worker.js` and creates a `CreateWebWorkerMLCEngine` instance for the `Llama-3.2-1B-Instruct-q4f16_1-MLC` model. Broadcasts download/compile progress via `chrome.runtime.sendMessage({ action: 'modelProgress' })`. Auto-initialises on document load for faster first inference.
- **Serial inference queue** (`queuedInference`): Ensures only one completion request runs at a time. Failures are swallowed at the queue level so one bad request doesn't block subsequent ones.
- **Inference** (`runInference`): Creates a self-contained message history (`[system, user]`) per request — no conversation carry-over. Uses `temperature: 0.7` and `max_tokens: 2048`.

| Message action | Description |
|---|---|
| `initEngine` | Ensures the WebLLM engine is loaded; responds `{ success: true }` |
| `llmInfer` | Runs one inference turn; responds `{ success: true, result }` or `{ success: false, error }` |
| `checkStatus` | Returns the current engine status: `ready`, `loading`, or `unavailable` |

### `src/offscreen/webllm-worker.js`

A thin Web Worker that instantiates `WebWorkerMLCEngineHandler` from `@mlc-ai/web-llm` and relays messages from the offscreen document. All WebGPU / WebAssembly inference work runs in this worker to keep the extension UI responsive.

### `src/common/models/chunk.js`

| Export | Description |
|---|---|
| `createChunk({ index, elements, wordCount })` | Factory for `ContentChunk` objects. |
| `createProgress(pageUrl, pageTitle, totalChunks)` | Factory for `ReadingProgress` objects. |
| `getStoredProgress(pageUrl)` | Reads `ReadingProgress` from `chrome.storage.sync`. |
| `saveProgress(progress)` | Writes `ReadingProgress` to `chrome.storage.sync`. |
| `PROGRESS_STORAGE_KEY` | Storage key constant: `"elu_reading_progress"`. |

### `src/common/models/focus-config.js`

| Export | Description |
|---|---|
| `DEFAULT_FOCUS_CONFIG` | Default `FocusConfig` values. |
| `getFocusConfig()` | Reads `FocusConfig` from `chrome.storage.sync`, merged with defaults. |
| `saveFocusConfig(partial)` | Deep-merges and writes `FocusConfig` to storage. |
| `FOCUS_CONFIG_KEY` | Storage key constant: `"elu_focus_config"`. |
| `DISTRACTION_SELECTORS` | Object of CSS selector arrays for `comments`, `sidebars`, `ads`, `popups`, `related`. |
| `MAIN_CONTENT_SELECTORS` | CSS selector string for identifying primary content. |

### `src/common/logger.js`

A batched, async logging utility. Collects log entries in memory and flushes them to the background service worker every 5 seconds via `chrome.runtime.sendMessage`. Each flush is stored under a timestamp-keyed entry. Exposes `logger.log()`, `logger.info()`, `logger.warn()`, and `logger.error()`.

---

## Data Models

### `ContentChunk`

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Unique identifier (`chunk-{index}-{timestamp}`) |
| `index` | `number` | Zero-based position in the chunk sequence |
| `elements` | `HTMLElement[]` | References to the original DOM elements |
| `originalHtml` | `string` | Serialized outer HTML of all elements |
| `simplifiedHtml` | `string \| null` | AI-simplified HTML (null until processed) |
| `wordCount` | `number` | Word count of the chunk |
| `estimatedReadTime` | `number` | Estimated read time in seconds (at 200 WPM) |
| `complexity` | `'low' \| 'medium' \| 'high'` | Heuristic complexity score |
| `isRead` | `boolean` | Whether the user has completed this chunk |
| `bookmarked` | `boolean` | Whether the user has bookmarked this chunk |

### `ReadingProgress`

| Field | Type | Description |
|---|---|---|
| `pageUrl` | `string` | Canonical URL of the page |
| `pageTitle` | `string` | Document title at time of chunking |
| `totalChunks` | `number` | Total number of chunks on the page |
| `currentChunkIndex` | `number` | Current reading position (0-based) |
| `chunksCompleted` | `number[]` | Indices of completed chunks |
| `bookmarks` | `number[]` | Indices of bookmarked chunks |
| `lastAccessed` | `number` | Unix timestamp of last access |
| `totalTimeSpent` | `number` | Cumulative reading time in seconds |

### `FocusConfig`

| Field | Type | Default | Description |
|---|---|---|---|
| `enabled` | `boolean` | `false` | Whether focus mode is active |
| `dimLevel` | `number` | `60` | Opacity of the dim overlay (0–100) |
| `blockAnimations` | `boolean` | `true` | Inject CSS to disable animations |
| `blockVideos` | `boolean` | `true` | Pause all video elements |
| `hideComments` | `boolean` | `true` | Hide comment sections |
| `hideSidebars` | `boolean` | `true` | Hide sidebar elements |
| `ambientSound` | `string` | `'none'` | One of `none`, `rain`, `cafe`, `forest`, `whitenoise` |
| `ambientVolume` | `number` | `30` | Volume level (0–100) |
| `timerEnabled` | `boolean` | `false` | Enable Pomodoro timer |
| `timerDuration` | `number` | `25` | Focus session duration in minutes |
| `breakDuration` | `number` | `5` | Break duration in minutes |

---

## AI Integration

Elu uses **[WebLLM](https://github.com/mlc-ai/web-llm)** to run **Llama-3.2-1B-Instruct-q4f16_1-MLC** entirely on-device via WebGPU. No external API calls are made. All inference runs inside a Chrome offscreen document with a dedicated Web Worker, keeping the extension UI fully responsive.

**Inference lifecycle:**

1. On extension install or update, the background service worker pre-creates the offscreen document, which immediately starts warming up the WebLLM engine (`CreateWebWorkerMLCEngine`).
2. When the user triggers simplification, the content script resolves the appropriate system prompt by reading `simplificationLevel` (1–5) and `optimizeFor` mode from `chrome.storage.sync`, then fetching the prompt table from the background worker.
3. The content script sends `{ action: 'llmInfer', systemPrompt, userPrompt }` to the background service worker.
4. The background routes the request to the offscreen document via `chrome.runtime.sendMessage({ target: 'offscreen', ... })`.
5. The offscreen document queues the request (serial inference queue) and calls `engine.chat.completions.create()` with `temperature: 0.7` and `max_tokens: 2048`. Each request uses a fresh `[system, user]` message array — no conversation carry-over.
6. The result is returned to the content script, parsed by `marked`, and injected into the DOM.

**Model details:**

| Property | Value |
|---|---|
| Model | Llama-3.2-1B-Instruct-q4f16_1-MLC |
| Quantization | 4-bit (q4f16_1) |
| Runtime | WebLLM (`@mlc-ai/web-llm` ^0.2.81) |
| Backend | WebGPU (falls back to WebAssembly) |
| Inference location | Offscreen document → Web Worker |
| Download size | ~800 MB (cached by the browser after first download) |

**System prompt matrix:**

```
optimizeFor:  textClarity   |   focusStructure   |   wordPattern
              (readability)   (ADHD/structure)     (dyslexia/patterns)
level 1:      light edits   |   visual breaks     |   consistent layout
level 2:      clearer terms |   clearer headings  |   simpler patterns
level 3:      simple vocab  |   bullets/chunks    |   short sentences
level 4:      basic words   |   short paragraphs  |   basic patterns
level 5:      elementary    |   max structure     |   minimal vocabulary
```

**Glossary definitions** use the same inference pipeline (background → offscreen) with a dedicated system prompt that instructs the model to return a concise one-sentence definition.

---

## Build System

Elu uses **Vite 7** as the build tool. The build is configured for multi-entry Chrome extension output with six entry points.

```js
// vite.config.js (simplified)
worker: { format: 'es' },        // Web Workers use ES module format for top-level await
input: {
    popup:            'src/popup/index.html',
    options:          'src/options/index.html',
    background:       'src/background/index.js',
    content:          'src/content/index.js',
    offscreen:        'src/offscreen/index.html',
    'webllm-worker':  'src/offscreen/webllm-worker.js'
}
output: {
    entryFileNames: 'assets/[name].js',
    chunkFileNames: 'assets/[name].js',
    assetFileNames: 'assets/[name].[ext]'
}
outDir: 'dist'
```

The project uses ES Modules (`"type": "module"` in `package.json`). All six entry points are bundled as separate files to `dist/assets/`. The `content-loader.js` in `public/` is copied to `dist/` as-is and is responsible for dynamically importing the bundled content script at runtime. The `offscreen` entry hosts the WebLLM engine, and the `webllm-worker` entry runs WebGPU inference in a dedicated Web Worker.

**Dependencies:**

| Package | Version | Purpose |
|---|---|---|
| `vite` | `^7.3.1` | Build tool (dev dependency) |
| `@mlc-ai/web-llm` | `^0.2.81` | WebLLM runtime (available for local model inference) |
| `marked` | `^17.0.1` | Markdown-to-HTML rendering for AI output |

---

## Extension Manifest

The extension uses **Manifest Version 3** with the following permissions:

| Permission | Reason |
|---|---|
| `activeTab` | Read and modify the currently active tab's content |
| `storage` | Persist user settings and reading progress via `chrome.storage.sync` |
| `scripting` | Programmatically inject scripts into tabs when needed |
| `tts` | Access Chrome's native TTS engine as a fallback |
| `offscreen` | Create an offscreen document to host the WebLLM engine and Web Worker |

**Content Security Policy:**

```json
"content_security_policy": {
    "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'"
}
```

The `wasm-unsafe-eval` directive is required for WebLLM's WebAssembly runtime.

The background script runs as a **service worker** with `"type": "module"`, allowing ES module imports. The content script is loaded via a lightweight `content-loader.js` injected at `document_start`, which then imports the full bundled content module.

**Web-accessible resources**: All files under `dist/assets/`, `fonts/`, and `images/` are declared as web-accessible so they can be referenced from content scripts running in page contexts.

---

## Keyboard Shortcuts

| Shortcut | Command | Action |
|---|---|---|
| `Alt+S` | `simplify-page` | Trigger AI text simplification on the active tab |
| `Alt+F` | `toggle-focus` | Toggle focus mode on the active tab |
| `Alt+R` | `toggle-tts` | Start or stop Text-to-Speech on the active tab |

Shortcuts are defined in `manifest.json` under `commands` and dispatched by the background service worker to the content script.

---

## Getting Started

### Prerequisites

- **Google Chrome** version >= 113 (WebGPU support required; available in stable Chrome since May 2023)
- **GPU**: A WebGPU-compatible discrete or integrated GPU. Check compatibility at `chrome://gpu/` — look for "WebGPU" in the Graphics Feature Status section.
- **Disk space**: ~2 GB free for the Llama-3.2-1B-Instruct model weights (downloaded and cached by WebLLM on first use)
- **Node.js** >= 18 and **npm** >= 9

> **Note:** No Chrome flags are required. Unlike the earlier Prompt API approach, WebLLM works out of the box on any Chrome version with WebGPU support. The model is downloaded and compiled automatically on first launch.

### Installation

1. Clone the repository:

    ```bash
    git clone https://github.com/Sri-Krishna-V/Elu.git
    cd Elu
    ```

2. Install dependencies:

    ```bash
    npm install
    ```

3. Build the extension:

    ```bash
    npm run build
    ```

    For development with watch mode:

    ```bash
    npm run dev
    ```

4. Load into Chrome:
    - Open `chrome://extensions/`
    - Enable **Developer mode**
    - Click **Load unpacked**
    - Select the `dist/` directory

### Usage

1. Navigate to any article or content-heavy webpage.
2. Click the Elu icon in the Chrome toolbar to open the popup.
3. Select an optimization mode and simplification level, then click **Simplify Text** to rewrite the page content.
4. Click **Chunk Mode** to enter the chunked reading view, navigating section by section.
5. Click **Focus Mode** to activate distraction suppression and, optionally, ambient sound and the Pomodoro timer.
6. Use the settings panel (gear icon) to configure the OpenDyslexic font, color theme, and text spacing.
7. Use the TTS controls at the bottom of the popup to read the page aloud.

---

## Privacy

All text processing, AI inference, and data storage occur entirely on the local device.

- No page content, reading data, or user preferences are transmitted to any external server.
- The Llama-3.2-1B model runs inside Chrome's offscreen document via WebLLM and WebGPU — all inference is on-device.
- WebLLM downloads model weights from the MLC model hub on first launch. After the initial download, the model is cached locally and no further network requests are made during inference.
- `chrome.storage.sync` is used for preferences; this syncs across the user's devices via their Chrome account but is never accessible to or transmitted by Elu.

---

## Contributing

Contributions are welcome. Please follow the standard GitHub flow:

1. Fork the repository.
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. Commit your changes: `git commit -m 'feat: description of change'`
4. Push to the branch: `git push origin feature/your-feature-name`
5. Open a Pull Request against `main`.

---

## License

Distributed under the ISC License. See [LICENSE](LICENSE) for details.
