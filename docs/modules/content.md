# Content Scripts

**Location:** `src/content/`  
**Context:** Injected into every HTTP/HTTPS page. Has full DOM access, limited Chrome API access.

---

## Entry Point — `index.js`

The central orchestrator. Imports all feature modules and exposes a single `chrome.runtime.onMessage` listener that dispatches every action.

### Imports

| Module | Purpose |
|---|---|
| `marked` | Render Markdown returned by the LLM back into HTML |
| `logger` | Consistent prefixed console logging |
| `bionic.js` | `applyBionicReading`, `removeBionicReading` |
| `tts.js` | `handleTTSAction`, `getTTSState` |
| `glossary.js` | `initGlossary` |
| `smart-chunking.js` | `initChunking`, `renderChunkedView`, navigation helpers |
| `focus-mode.js` | `activateFocusMode`, `deactivateFocusMode`, `toggleFocusMode` |
| `content-extractor.js` | `extractArticleText`, `extractArticleParagraphs` |
| `content.css`, `chunking.css` | Injected stylesheets |

### Theme System

The `themes` object maps 13 key names to `{ backgroundColor, textColor }` pairs. When a theme is applied, `document.body` background and all paragraph/heading `/article/main` text colours are set inline.

Themes are applied by detecting article containers (via `MAIN_CONTENT_SELECTORS`) and setting inline styles directly. Resetting applies `removeProperty` on every modified element.

### Simplification Pipeline

1. User triggers `simplify` (popup or `Alt+S`).
2. `extractArticleParagraphs()` returns `{ container, elements }`.
3. Any previously simplified elements (marked with `data-original-html`) are restored.
4. Elements are grouped into batches of ≤ 800 estimated tokens, respecting heading and list boundaries.
5. For each batch: `resolveSystemPrompt()` fetches the active prompt, `chrome.runtime.sendMessage({ action: 'llmInfer', … })` submits to the background.
6. The LLM response (Markdown) is parsed with `marked` and written to the DOM. The original HTML is saved in `data-original-html` on the replacement element.
7. `showEluNotification()` surfaces progress and completion to the user.

### Message Dispatch Table

| action | Handler |
|---|---|
| `simplify` | Full AI simplification pipeline |
| `apply-theme` | Apply colour theme |
| `reset-theme` | Remove all theme overrides |
| `toggle-font` | Enable / disable OpenDyslexic |
| `update-spacing` | Set line / letter / word spacing |
| `toggle-bionic` | Toggle bionic reading |
| `chunk-start` | Init and render chunked view |
| `chunk-navigate` | Navigate chunks (`prev` / `next` / index) |
| `chunk-bookmark` | Toggle bookmark on current chunk |
| `chunk-complete` | Mark current chunk complete |
| `chunk-exit` | Exit chunked view |
| `chunk-get-progress` | Return `ReadingProgress` object |
| `toggle-focus-mode` | Toggle focus mode |
| `focus-activate` | Activate with supplied config |
| `focus-deactivate` | Deactivate |
| `focus-get-state` | Return `{ isActive }` |
| `focus-update-config` | Apply partial config update |
| `tts-play` … `tts-stop` | TTS playback controls |
| `tts-set-speed` | TTS rate change |
| `tts-set-voice` | TTS voice selection |
| `tts-get-state` | Return TTS playback state |
| `get-page-info` | Return `{ title, url, wordCount, readTime }` |
| `ping` | Health check — returns `{ alive: true }` |
| `getSystemPrompts` | Forward to background (legacy) |

---

## Feature Files

Each feature file exports a set of named functions. None have top-level side effects except `initGlossary()` which must be called explicitly to attach the `dblclick` listener.

| File | Exports |
|---|---|
| `bionic.js` | `applyBionicReading(root?)`, `removeBionicReading()` |
| `tts.js` | `handleTTSAction(action, options?)`, `getTTSState()` |
| `glossary.js` | `initGlossary()` |
| `smart-chunking.js` | `initChunking()`, `renderChunkedView()`, `goToChunk(n)`, `toggleBookmark()`, `completeCurrentChunk()`, `exitChunkedView()`, `getProgress()` |
| `focus-mode.js` | `activateFocusMode(config)`, `deactivateFocusMode()`, `toggleFocusMode()`, `isFocusModeActive()`, `updateFocusConfig(partial)` |

---

## CSS

| File | Scope |
|---|---|
| `content.css` | Global page styles injected by the manifest (via `assets/content.css`) |
| `chunking.css` | Chunked-view reading UI — slide card, progress bar, navigation controls |

Styles are scoped with `elu-` prefixed class names to avoid collisions with page stylesheets.

---

## Related Feature Docs

- [AI Text Simplification](../features/simplification.md)
- [Smart Chunking](../features/chunking.md)
- [Focus Mode](../features/focus-mode.md)
- [Bionic Reading](../features/bionic-reading.md)
- [Text-to-Speech](../features/tts.md)
- [Inline Glossary](../features/glossary.md)
- [Visual Accessibility](../features/visual-accessibility.md)
