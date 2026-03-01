# Elu — Developer Documentation

**Elu** (short for *Elucidate*) is a Chrome extension that makes web articles accessible to readers with dyslexia, ADHD, low vision, and other cognitive or sensory differences. It runs a quantized LLM entirely on-device using WebLLM + WebGPU — no cloud, no data transmission, no account required.

> AMD Slingshot 2026 — AI for Social Good

---

## Contents

| Document | Description |
|---|---|
| [Getting Started](getting-started.md) | Build, install, and load the extension |
| [Architecture](architecture.md) | System design, layers, and message-passing protocol |
| [Configuration](configuration.md) | `config.js`, `chrome.storage` keys, default values |
| [Privacy](privacy.md) | On-device model guarantee, permissions, and data handling |
| [Contributing](contributing.md) | Branch conventions, PR checklist, and offline-first constraints |
| **Modules** | |
| [Background Service Worker](modules/background.md) | Routing, offscreen lifecycle, keyboard commands |
| [Content Scripts](modules/content.md) | Orchestrator and all injected features |
| [Offscreen AI Engine](modules/offscreen.md) | WebLLM + WebGPU, Web Worker, inference protocol |
| [Popup](modules/popup.md) | Extension action popup — controls and state |
| [Options / Onboarding](modules/options.md) | Settings page and first-run onboarding flow |
| [Common Utilities](modules/common.md) | Shared helpers: extractor, logger, config, models |
| **Features** | |
| [AI Text Simplification](features/simplification.md) | Prompt library, 3 modes × 5 levels, inference pipeline |
| [Smart Chunking](features/chunking.md) | 150-word segmentation, progress, bookmarks |
| [Focus Mode](features/focus-mode.md) | Dim overlay, animations, ambient sound, timer |
| [Bionic Reading](features/bionic-reading.md) | DOM walker, bold-first-half, reversal |
| [Text-to-Speech](features/tts.md) | Web Speech API, voice & speed, controls |
| [Inline Glossary](features/glossary.md) | Double-click lookup, Shadow DOM tooltip |
| [Visual Accessibility](features/visual-accessibility.md) | 13 themes, OpenDyslexic, spacing sliders |

---

## Quick Start

```bash
git clone https://github.com/Sri-Krishna-V/Elu.git
cd Elu
npm install
npm run build
```

Load `dist/` as an unpacked extension in `chrome://extensions/` with Developer mode on.

---

## Technology at a Glance

| Layer | Technology |
|---|---|
| Extension platform | Chrome MV3 |
| Build | Vite 7 |
| On-device AI | WebLLM 0.2.x via WebGPU |
| Default model | `Qwen2.5-0.5B-Instruct-q4f16_1-MLC` (~400 MB) |
| Content parsing | `@mozilla/readability` 0.6 |
| Markdown rendering | `marked` 17 |
| Speech | Web Speech Synthesis API |
| Storage | `chrome.storage.sync` |
| Font | OpenDyslexic (self-hosted) |

---

## License

MIT — see [LICENSE](../LICENSE).
