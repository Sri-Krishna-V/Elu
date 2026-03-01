# Architecture

Elu is a Chrome Manifest V3 extension composed of four distinct execution contexts. This document explains each layer, how they communicate, and why the design was chosen.

---

## Execution Contexts

```
┌─────────────────────────────────────────────────────────┐
│  Browser UI                                             │
│  ┌──────────────┐  ┌──────────────────────────────┐    │
│  │  Popup       │  │  Options / Onboarding         │    │
│  │  index.html  │  │  index.html?onboarding=true   │    │
│  └──────┬───────┘  └──────────────┬───────────────┘    │
│         │ chrome.runtime.sendMessage │                  │
└─────────┼──────────────────────────┼───────────────────┘
          │                          │
┌─────────▼──────────────────────────▼───────────────────┐
│  Background Service Worker  (src/background/index.js)   │
│                                                         │
│  • Install / update handler                             │
│  • Offscreen document lifecycle (create / reuse)        │
│  • Message router: popup → content & offscreen          │
│  • Keyboard command dispatcher                          │
│  • System-prompt library (prompts.js)                   │
└─────────────────────────┬───────────────────────────────┘
                          │ chrome.runtime.sendMessage
          ┌───────────────┴──────────────────────┐
          │                                      │
┌─────────▼──────────────┐       ┌───────────────▼────────────────┐
│  Content Scripts       │       │  Offscreen Document            │
│  (src/content/)        │       │  (src/offscreen/index.html)    │
│                        │       │                                │
│  index.js              │       │  index.js                      │
│  smart-chunking.js     │       │  └── spawns Web Worker         │
│  focus-mode.js         │       │       webllm-worker.js         │
│  bionic.js             │       │                                │
│  tts.js                │       │  WebLLM / WebGPU inference      │
│  glossary.js           │       │  Qwen2.5-0.5B-Instruct-q4f16_1│
└────────────────────────┘       └────────────────────────────────┘
          ↕                                      ↕
┌──────────────────────────────────────────────────────────┐
│  chrome.storage.sync                                     │
│  Preferences · Reading Progress · Selected Model         │
└──────────────────────────────────────────────────────────┘
```

---

## Layer Descriptions

### Browser UI — Popup & Options

Both pages are standard HTML/CSS/JS extension pages that run in their own isolated renderer. They communicate with the background worker exclusively through `chrome.runtime.sendMessage`. Neither page reaches content scripts directly.

### Background Service Worker

Defined in `src/background/index.js`. Responsibilities:

1. **Install-time onboarding** — opens the options page with `?onboarding=true` when the extension is first installed.
2. **Offscreen document lifecycle** — calls `chrome.offscreen.createDocument` with reason `WORKERS`. Has `hasOffscreenDocument()` / `ensureOffscreenDocument()` helpers to avoid duplicate creation; the document is destroyed and recreated if Chrome terminates it during idle periods.
3. **Message routing** — a single `chrome.runtime.onMessage` listener handles:
   - `getSystemPrompts` — returns the full prompt library (synchronous)
   - `llmInfer` — calls `ensureEngineReady()` then forwards to the offscreen document (async, returns `true` to hold channel open)
   - `checkAIStatus` — queries offscreen engine state and maps to `ready | downloading | unavailable`
   - `modelProgress` rebroadcast — relays progress events from the offscreen document to the popup
4. **Keyboard commands** — `chrome.commands.onCommand` dispatches `simplify-page`, `toggle-focus`, and `toggle-tts` to the active tab's content script.

### Content Scripts

Injected into every HTTP/HTTPS page via `content-loader.js` (stub loader) followed by the main `src/content/index.js` bundle. The content script:

- Hosts the single `chrome.runtime.onMessage` listener that dispatches all feature actions.
- Imports and delegates to feature modules: `smart-chunking`, `focus-mode`, `bionic`, `tts`, `glossary`.
- Manages the colour-theme and typography system (applied directly to `document.body` / article container styles).
- Handles AI simplification by grouping DOM paragraphs into ≤800-token batches, sending them to the background for inference, and streaming results back into the DOM.

### Offscreen Document + Web Worker

`src/offscreen/index.html` hosts `src/offscreen/index.js`, which:

1. Checks for `navigator.gpu` (WebGPU feature detection).
2. Creates the **Web Worker** (`webllm-worker.js`) via `CreateWebWorkerMLCEngine` from `@mlc-ai/web-llm`.
3. Manages an `engine` reference, an `initPromise` (prevents concurrent init calls), and exponential-backoff retry logic (3 attempts, 2-second base).
4. Broadcasts model download progress to all extension pages via `chrome.runtime.sendMessage({ action: 'modelProgress', … })`.

The Web Worker (`webllm-worker.js`) simply instantiates `WebWorkerMLCEngineHandler` from `@mlc-ai/web-llm`, which registers `self.onmessage` internally and delegates all message-passing to the WebLLM framework.

---

## Message-Passing Protocol

### Popup → Background

| action | Payload | Response |
|---|---|---|
| `getSystemPrompts` | — | `{ success: true, prompts: SystemPrompts }` |
| `llmInfer` | `{ systemPrompt, userPrompt }` | `{ success: true, result: string }` |
| `checkAIStatus` | — | `{ status: 'ready'|'downloading'|'unavailable'|'no_webgpu', message }` |
| `reloadModel` | `{ model: string }` | `{ success: true }` |

### Background → Offscreen

| action | Payload | Response |
|---|---|---|
| `initEngine` | `{ model?: string }` | `{ success: true }` |
| `reloadEngine` | `{ model: string }` | `{ success: true }` |
| `llmInfer` | `{ systemPrompt, userPrompt }` | `{ success: true, result: string }` |
| `checkStatus` | — | `{ success: true, status: string }` |

### Background → Content (tab message)

| action | Source | Purpose |
|---|---|---|
| `simplify` | keyboard `Alt+S` | Start simplification |
| `toggle-focus-mode` | keyboard `Alt+F` | Toggle focus mode |
| `toggle-tts` | keyboard `Alt+R` | Toggle TTS playback |
| `chunk-start` | popup | Start chunking mode |

### Offscreen → All Extension Pages (broadcast)

```js
chrome.runtime.sendMessage({ action: 'modelProgress', progress: { progress: 0–1, text: string } })
```

---

## Key Architectural Decisions

### Why an Offscreen Document?

Chrome MV3 does not allow WebGPU in service workers. The offscreen document is the only context in a MV3 extension that can host a Web Worker with WebGPU access. By running the LLM in a Web Worker *inside* the offscreen document, WebGPU matrix operations never block the extension UI or the content script.

### Why Readability for Content Extraction?

`@mozilla/readability` (the engine behind Firefox Reader View) reliably identifies the primary article body across a wide variety of page templates. It is used as the primary extraction strategy in `content-extractor.js`, with a CSS-selector fallback (13 common article container selectors) and a heuristic largest-text-block fallback for edge cases. All feature modules import from this single module.

### Why `chrome.storage.sync`?

Settings sync transparently across Chrome profiles without requiring any backend. The storage layer is a single source of truth for all user preferences; both the popup and content scripts read from it rather than passing state through messages.

### Why Three Prompt Families × Five Levels?

Different cognitive profiles respond differently to language changes. Rather than one generic "simplify" button, Elu exposes `textClarity` (fluency), `focusStructure` (ADHD), and `wordPattern` (dyslexia) as distinct rewriting personalities. Five intensity levels let users fine-tune without overwhelming choice — or the popup can be configured to show just 3 levels (coarse mode) via `config.js`.

---

## Build Configuration

`vite.config.js` declares six named entries so Vite produces deterministic output file names (`assets/background.js`, `assets/content.js`, etc.). Web Workers are built in ES module format (`worker.format: 'es'`) to support top-level `await` and ES module imports inside the worker, which WebLLM requires.
