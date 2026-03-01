# Popup

**Location:** `src/popup/index.html` · `src/popup/index.js`  
**Context:** Chrome extension action popup — standard extension page, runs in its own renderer.

---

## Purpose

The popup is the primary control surface for Elu. It is opened by clicking the Elu icon in the Chrome toolbar and provides access to every feature without requiring the user to navigate to a settings page.

---

## Sections

### AI Simplification Panel

- Simplification-level buttons rendered according to `simplificationLevelsConfig.levels` (3 or 5 buttons).
- Optimize-for selector: `textClarity` | `focusStructure` | `wordPattern` (maps to `optimizeFor` in storage).
- **Simplify** button sends `{ action: 'simplify' }` to the active tab's content script.
- AI status indicator shows `ready` / `downloading (n%)` / `unavailable`.

### Chunking

- **Chunk** button sends `{ action: 'chunk-start' }` to the active tab.
- Closes the popup after activating chunking mode.

### Focus Mode

- Toggle button sends `{ action: 'toggle-focus-mode' }`.
- Button label changes to **Exit Focus** while focus mode is active.

### Text-to-Speech

- Play / Pause / Stop controls send the corresponding `tts-*` actions.
- Speed slider (`0.5 ×` – `3.0 ×`) sends `tts-set-speed`.
- Voice selector (populated from `window.speechSynthesis.getVoices()`) sends `tts-set-voice`.

### Bionic Reading

- Toggle button sends `{ action: 'toggle-bionic' }`.

### Visual Accessibility

- **13 theme buttons** send `{ action: 'apply-theme', theme: key }` / `{ action: 'reset-theme' }`.
- **OpenDyslexic toggle** sends `{ action: 'toggle-font', enabled: bool }`.
- **Line / Letter / Word spacing sliders** send `{ action: 'update-spacing', … }`.

---

## State Persistence

On load, `initializePopup()` reads from `chrome.storage.sync`:

- `simplificationLevel` → pre-select the matching button
- `optimizeFor` → pre-select the dropdown
- `fontEnabled` → set the font toggle
- `selectedTheme` → mark the active theme button
- `lineSpacing`, `letterSpacing`, `wordSpacing` → set slider values

All UI changes write back to `chrome.storage.sync` immediately.

---

## AI Status Polling

The popup listens for `chrome.runtime.onMessage` with action `modelProgress` to update the download progress bar in real time. It also calls `{ action: 'checkAIStatus' }` on popup open to get the current engine state.

---

## Page Info

The popup queries `{ action: 'get-page-info' }` to display word count and estimated read time for the current page.

---

## Tab Safety Guards

All messages to the content script are guarded with a URL pattern check:

```js
if (tabs[0] && /^https?:/.test(tabs[0].url)) { /* send message */ }
```

This prevents errors on `chrome://` pages, `about:blank`, and similar non-web URLs.
