# Elu AI Features -- Failure Scenarios and Polish Plan

This document catalogs 10 realistic failure scenarios discovered across Elu's AI features (text simplification, inline glossary, model lifecycle) and the fixes applied to each.

---

## Product Context

Elu is a Chrome extension that runs **Llama-3.2-1B-Instruct** entirely on-device via **WebLLM + WebGPU** in an offscreen document with a Web Worker. The AI powers two features:

- **Text Simplification** -- rewrites page content for readers with dyslexia/ADHD
- **Inline Glossary** -- double-click word definitions

**Inference pipeline:**

```
Content Script  -->  Background Service Worker  -->  Offscreen Document  -->  Web Worker (WebGPU)
```

---

## Failure Scenarios

### 1. WebGPU Not Available (Hardware/Browser Incompatibility)

**Scenario:** User's GPU or browser doesn't support WebGPU. `CreateWebWorkerMLCEngine` throws. The popup shows a generic "AI Not Available" with no guidance.

**Root cause:** No WebGPU feature detection before engine init. No actionable error messaging.

**Fix applied:**

- Added `navigator.gpu` check in `src/offscreen/index.js` before calling `CreateWebWorkerMLCEngine`
- Engine now stores a structured `engineErrorReason` (`'no_webgpu'` or `'init_failed'`)
- `checkStatus` response includes `errorReason`
- Background forwards `errorReason` to the popup
- Popup shows actionable guidance: "WebGPU not supported. Update Chrome or check GPU compatibility at chrome://gpu"

**Files modified:** `src/offscreen/index.js`, `src/background/index.js`, `src/popup/index.js`

---

### 2. Model Download Failure (Network Interruption)

**Scenario:** The ~800MB model download is interrupted (Wi-Fi drops, laptop sleeps). `initEngine()` rejects and sets `initPromise = null`. There is no retry mechanism -- the user must reload the extension.

**Root cause:** No automatic retry. Popup shows "AI Not Available" forever.

**Fix applied:**

- `initEngine()` now retries up to 3 times with exponential backoff (2s, 4s, 8s)
- Progress messages broadcast during retry: "Download interrupted. Retrying in Ns..."
- On final failure: "Model download failed. Click Retry in the popup."
- Added a "Retry" button in the popup when status is `'unavailable'` (unless the error is `no_webgpu`)
- Retry button sends `{ action: 'retryEngine' }` to the background

**Files modified:** `src/offscreen/index.js`, `src/background/index.js`, `src/popup/index.js`

---

### 3. Offscreen Document Killed by Chrome (Memory Pressure)

**Scenario:** Chrome silently kills the offscreen document to reclaim memory. The loaded model (~800MB+ VRAM) is lost. The next inference call recreates the document but the engine isn't ready, causing a long unexplained hang.

**Root cause:** `ensureOffscreenDocument()` only checks document existence, not engine readiness.

**Fix applied:**

- Added `ensureEngineReady()` in `src/background/index.js` that checks `checkStatus` after ensuring the document exists
- If engine is not `ready`, automatically sends `initEngine` and waits for it
- The `llmInfer` handler now calls `ensureEngineReady()` before forwarding requests

**Files modified:** `src/background/index.js`

---

### 4. Concurrent Simplification Requests (Double-Click / Rapid Alt+S)

**Scenario:** `isSimplifying` was declared but never checked or set. Clicking "Simplify" twice or pressing Alt+S during simplification causes two parallel loops processing the same DOM elements, leading to "Node not found" errors or corrupted DOM.

**Root cause:** Missing guard against re-entrant simplification.

**Fix applied:**

- Set `isSimplifying = true` at the start of the `"simplify"` action
- Added early-return with notification ("Simplification already in progress...") if `isSimplifying` is true
- Set `isSimplifying = false` in a `finally` block so it always resets

**Files modified:** `src/content/index.js`

---

### 5. Empty / Minimal Content Pages (No Selectors Match)

**Scenario:** On pages without standard semantic markup, `mainContent` is null. The code did `console.error(...)` and `return` silently. The popup's simplify button showed "Simplifying..." forever because `sendResponse` was never called.

**Root cause:** Bare `return` inside the async IIFE didn't call `sendResponse`.

**Fix applied:**

- Replaced bare `return` with `sendResponse({ success: false, error: '...' })` when `mainContent` is null
- Added the same check when `contentElements.length === 0` and `chunks.length === 0`
- Shows user-friendly notification: "No article content detected on this page"

**Files modified:** `src/content/index.js`

---

### 6. Destructive Paragraph Removal on Count Mismatch

**Scenario:** When AI returns fewer paragraphs than the original, the code removed extra original paragraphs from the DOM. These removed elements had no `data-original-html` backup, so "Undo Simplify" could not restore them. Content was permanently lost until page reload.

**Root cause:** Mismatch handler prioritized 1:1 alignment over content preservation.

**Fix applied:**

- Extra original paragraphs are now hidden (`display: none`) instead of removed
- Hidden elements get `data-original-html` and `data-elu-hidden="true"` attributes
- Updated `undoSimplify` handler to restore hidden elements by removing the hide attributes and clearing `display: none`

**Files modified:** `src/content/index.js`

---

### 7. Glossary Blocked During Long Simplification

**Scenario:** Both glossary and simplification use the same serial inference queue. A glossary double-click during a 10-chunk simplification is queued behind all remaining chunks. The "Loading definition..." tooltip hangs for minutes.

**Root cause:** Single FIFO queue with no timeout.

**Fix applied:**

- Added a 30-second per-request timeout in `queuedInference()` using `Promise.race`
- Added a 10-second client-side timeout in the glossary's `getDefinition()`
- On timeout, glossary shows "AI is busy. Try again in a moment." instead of hanging indefinitely

**Files modified:** `src/offscreen/index.js`, `src/content/glossary.js`

---

### 8. Service Worker Goes Idle (MV3 Lifecycle)

**Scenario:** Chrome kills idle MV3 service workers after ~30s of inactivity. `chrome.runtime.sendMessage` can fail with "Receiving end does not exist." The retry loop only retried twice with 200ms delay -- not enough time for the service worker to restart.

**Root cause:** Message-send failures and LLM failures handled identically. Service worker restart needs a longer delay.

**Fix applied:**

- Added `sendMessageWithRetry()` helper in both `src/content/index.js` and `src/content/glossary.js`
- Detects "Receiving end does not exist" / "disconnected" errors specifically
- Retries up to 3 times with escalating delays (500ms, 1000ms, 2000ms)
- Simplification retry loop increased from 2 to 3 attempts with escalating delays

**Files modified:** `src/content/index.js`, `src/content/glossary.js`

---

### 9. Duplicate Style Tag Injection (Memory Leak)

**Scenario:** Inside the paragraph replacement loop, a `<style>` element for `.simplified-text` was appended to `<head>` for every single paragraph. On a page with 50 paragraphs, this injected 50 identical `<style>` tags.

**Root cause:** Style injection was inside the `forEach` loop instead of being done once.

**Fix applied:**

- Moved style injection out of the paragraph loop to a single injection before the chunk processing loop
- Uses `id="elu-simplified-styles"` with an existence check to prevent even cross-invocation duplicates
- Removed the per-paragraph `document.head.appendChild(simplifiedStyles)` call entirely

**Files modified:** `src/content/index.js`

---

### 10. AI Hallucination / Garbage Output on Edge-Case Content

**Scenario:** The 1B model can hallucinate on non-English content, technical text, or very short inputs. The only validation was `trim().length > 0`, so any non-empty string was accepted and injected into the DOM -- even completely unrelated text.

**Root cause:** No output quality validation or sanitization.

**Fix applied:**

- **Similarity check:** Extracts "content words" (excluding stop words) from both input and output. If fewer than 15% of input content words appear in the output, the result is discarded.
- **Length ratio guard:** If output is more than 3x longer or less than 5% of the input length, the result is discarded.
- **Sanitization:** `sanitizeAIOutput()` strips code fences, `<script>`, `<style>`, `<iframe>` tags, and inline event handlers before markdown parsing.
- **Glossary validation:** Response must be under 300 characters and 3 lines; otherwise shows "Definition unavailable."
- On any validation failure, original text is kept unchanged.

**Files modified:** `src/content/index.js`, `src/content/glossary.js`

---

## Summary of All Changes

| File | Scenarios Addressed | Changes |
|------|:-------------------:|---------|
| `src/offscreen/index.js` | 1, 2, 7 | WebGPU detection, retry with backoff, `engineErrorReason`, inference timeout |
| `src/background/index.js` | 3 | `ensureEngineReady()`, `retryEngine` handler, `errorReason` forwarding |
| `src/content/index.js` | 4, 5, 6, 8, 9, 10 | Concurrency guard, missing `sendResponse`, non-destructive mismatch handling, message retry helper, style dedup, output validation/sanitization |
| `src/content/glossary.js` | 7, 8, 10 | Client-side timeout, message retry helper, output validation |
| `src/popup/index.js` | 1, 2 | Actionable error messages, Retry button |

## Implementation Order (by severity)

1. **Scenario 4** -- concurrent requests guard (prevents DOM corruption)
2. **Scenario 5** -- missing sendResponse fix (prevents infinite loading)
3. **Scenario 9** -- duplicate style dedup (prevents memory leak)
4. **Scenario 6** -- non-destructive paragraph handling (prevents content loss)
5. **Scenario 1** -- WebGPU detection (improves first-run UX)
6. **Scenario 2** -- download retry with backoff (improves reliability)
7. **Scenario 3** -- offscreen document health check (improves mid-session resilience)
8. **Scenario 8** -- service worker message retry (improves messaging reliability)
9. **Scenario 7** -- inference timeout + glossary feedback (improves UX during heavy AI use)
10. **Scenario 10** -- hallucination guard + sanitization (improves output quality)
