# Background Service Worker

**Location:** `src/background/index.js`  
**Context:** Chrome MV3 service worker — no DOM access, limited lifetime.

---

## Responsibilities

| # | Concern | Code surface |
|---|---|---|
| 1 | First-install onboarding | `chrome.runtime.onInstalled` |
| 2 | Offscreen document lifecycle | `ensureOffscreenDocument()`, `hasOffscreenDocument()` |
| 3 | LLM inference routing | `sendToOffscreen()`, `ensureEngineReady()` |
| 4 | Model selection + migration | `getSelectedModel()` |
| 5 | Message router | `chrome.runtime.onMessage` |
| 6 | Keyboard command dispatch | `chrome.commands.onCommand` |

---

## Functions

### `hasOffscreenDocument() → Promise<boolean>`

Wraps `chrome.offscreen.hasDocument()`. Returns `true` if the offscreen document is currently alive.

### `ensureOffscreenDocument() → Promise<void>`

Creates the offscreen document if it does not already exist. Uses `src/offscreen/index.html` with reason `WORKERS`.

```js
await chrome.offscreen.createDocument({
    url: chrome.runtime.getURL(OFFSCREEN_HTML),
    reasons: ['WORKERS'],
    justification: '…'
});
```

### `sendToOffscreen(payload) → Promise<object>`

Calls `ensureOffscreenDocument()` then forwards `payload` (with `target: 'offscreen'` injected) via `chrome.runtime.sendMessage`.

### `getSelectedModel() → Promise<string>`

Reads `selectedModel` from `chrome.storage.sync`. Performs a one-time migration: if the stored value is the old `Llama-3.2-1B-Instruct-q4f16_1-MLC` model, it is replaced with `Qwen2.5-0.5B-Instruct-q4f16_1-MLC`.

### `ensureEngineReady() → Promise<void>`

1. Calls `ensureOffscreenDocument()`.
2. Sends `checkStatus` to the offscreen document.
3. If status is not `'ready'`, reads the selected model and sends `initEngine` with the model ID.
4. Throws if initialization fails.

---

## Message Handlers

### `getSystemPrompts`

Synchronous. Returns the full `systemPrompts` object from `prompts.js`.

```js
sendResponse({ success: true, prompts: systemPrompts });
```

### `llmInfer`

Async. Requires `systemPrompt` and `userPrompt` in the request payload.

1. Calls `ensureEngineReady()`.
2. Forwards the inference request to the offscreen document.
3. Returns `{ success: true, result: string }` or `{ success: false, error: string }`.

Returns `true` from the listener to hold the message channel open.

### `checkAIStatus`

Async. Queries offscreen `checkStatus` and maps the result:

| Offscreen status | Response status | Message |
|---|---|---|
| `ready` | `ready` | `'WebLLM model ready'` |
| `loading` | `downloading` | `'WebLLM model loading…'` |
| `unavailable` + `no_webgpu` reason | `no_webgpu` | `'WebGPU is not supported…'` |
| `unavailable` (other) | `unavailable` | `'WebLLM unavailable'` |

### `modelProgress` (broadcast relay)

Messages from the offscreen document with action `modelProgress` are re-sent to all extension pages so the popup can show a download progress bar.

---

## Keyboard Commands

Declared in `public/manifest.json` and handled by `chrome.commands.onCommand`:

| Command | Shortcut | Action sent to active tab |
|---|---|---|
| `simplify-page` | `Alt+S` | `{ action: 'simplify' }` |
| `toggle-focus` | `Alt+F` | `{ action: 'toggle-focus-mode' }` |
| `toggle-tts` | `Alt+R` | `{ action: 'toggle-tts' }` |

---

## Related

- [Prompt Library](../features/simplification.md#prompt-library) — `src/background/prompts.js`
- [Offscreen Document](offscreen.md) — the target of `sendToOffscreen`
- [Architecture — Message Protocol](../architecture.md#message-passing-protocol)
