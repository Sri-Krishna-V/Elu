# Privacy

Elu is designed from the ground up to be a privacy-preserving tool. This document explains the guarantees, the technical mechanisms that enforce them, and the extension's minimal permissions footprint.

---

## Core Guarantee

> **No page content, reading history, or usage analytics are ever transmitted to any external server.**

All text processing — including AI simplification — runs locally on the user's machine using WebGPU hardware acceleration. The extension has no backend, no telemetry endpoint, and no analytics SDK.

---

## On-Device Inference

When a user requests text simplification:

1. The article text is extracted from the DOM *inside the browser*.
2. The text is passed to the **offscreen document** via Chrome's internal message-passing API (`chrome.runtime.sendMessage`) — this call never leaves the process.
3. The offscreen document runs inference via **WebLLM** on the local GPU using WebGPU.
4. The rewritten text is returned via the same internal channel.

The model (`Qwen2.5-0.5B-Instruct-q4f16_1-MLC`) is downloaded once from the WebLLM CDN (model weights only, no user data sent), then cached in the browser's model storage. All subsequent inference is fully offline.

---

## No Account Required

Elu has no login, no registration, and no user identity. Preferences are stored in `chrome.storage.sync` and synced at the Chrome account level (same as any browser setting) — no Elu server is involved.

---

## Minimum Permissions

| Permission | What it enables | What it does NOT enable |
|---|---|---|
| `activeTab` | Read and modify the content of the *currently active tab* when the user explicitly clicks the extension | Access to background tabs or browsing history |
| `storage` | Read and write user preferences to `chrome.storage.sync` | Access to any external storage |
| `scripting` | Inject content scripts on demand | Passive script injection or background page scraping |
| `tts` | Access native browser TTS voices | Recording or transmitting audio |
| `offscreen` | Create an offscreen document to host the WebLLM engine | Any network access beyond the WebLLM CDN for model download |

No host permissions beyond `<all_urls>` (for content-script injection — required for a universal accessibility tool).

---

## Dictionary Lookup (Glossary Feature)

The inline glossary feature calls an external dictionary API (`https://api.dictionaryapi.dev/api/v2/entries/en/`) to retrieve word definitions. The only data sent is the selected word. No page URL, user identity, or surrounding text is transmitted. The API is a free public service with no account requirement.

If offline-only glossary is required, the `getDefinition()` call in `src/content/glossary.js` can be replaced with a bundled dictionary dataset.

---

## Source Audit

The extension is fully open-source at [https://github.com/Sri-Krishna-V/Elu](https://github.com/Sri-Krishna-V/Elu). Every network call can be independently verified. There are no minified proprietary blobs, no embedded tracking pixels, and no third-party analytics libraries.

---

## Summary Checklist

- [x] All AI inference runs on-device
- [x] No page content transmitted to any server
- [x] No user account or sign-in
- [x] No usage analytics or telemetry
- [x] Model downloaded once to local cache; never re-uploaded
- [x] Settings stored in `chrome.storage.sync` (browser-managed, no Elu server)
- [x] Only permission requested for external network: model weights CDN (one-time download)
- [x] Glossary lookup sends only the selected word (no page context)
- [x] Full source code available for audit
