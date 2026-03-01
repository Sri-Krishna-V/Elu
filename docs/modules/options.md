# Options / Onboarding

**Location:** `src/options/index.html` · `src/options/index.js`  
**Context:** Standard extension page. Opened as the extension's `options_page` and also used for first-run onboarding.

---

## Two Modes

The options page serves two purposes, distinguished by the URL query parameter:

| URL | Mode |
|---|---|
| `src/options/index.html` | Settings page |
| `src/options/index.html?onboarding=true` | First-run onboarding flow |

---

## Onboarding Flow

Triggered automatically on first install by the background service worker:

```js
chrome.tabs.create({ url: chrome.runtime.getURL('src/options/index.html?onboarding=true') });
```

The onboarding flow is a 3-step wizard:

**Step 1 — Welcome**  
Introduces Elu and explains its purpose.

**Step 2 — Profile Selection**  
Users choose one of four accessibility profiles. Each profile pre-fills a set of `chrome.storage.sync` keys:

| Profile | `selectedTheme` | `fontEnabled` | `lineSpacing` | `letterSpacing` | `wordSpacing` | `simplificationLevel` |
|---|---|---|---|---|---|---|
| Default | `default` | `false` | `1.5` | `0` | `0` | `3` |
| Dyslexia | `creamPaper` | `true` | `2.0` | `2` | `4` | `3` |
| ADHD | `darkMode` | `false` | `1.8` | `1` | `2` | `5` |
| Low Vision | `highContrast` | `false` | `2.5` | `3` | `6` | `3` |

**Step 3 — Model Selection**  
Users choose the AI model. Currently only `Qwen2.5-0.5B-Instruct-q4f16_1-MLC` is offered (the default). The selected model is written to `chrome.storage.sync` as `selectedModel`.

Clicking **Finish** closes the onboarding wizard and the user can begin reading.

---

## Settings Page

When opened without the `?onboarding=true` parameter, the page functions as a full settings editor with the same controls as the popup but with more descriptive labels and additional options:

- Full simplification level range (1–5 regardless of `config.js`)
- Model selection (if additional models are available)
- Per-profile reset buttons
- Reading statistics summary (total chunks read, sessions, etc.)

---

## Storage Interactions

All settings are written to `chrome.storage.sync` immediately on change and read on page load to populate the UI. No save button is required.
