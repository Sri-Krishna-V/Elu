# Contributing

Contributions are welcome. Elu is an open-source project and has strict constraints that all contributions must respect.

---

## Non-Negotiable Constraints

1. **Offline-first** — Core features (bionic reading, focus mode, TTS, themes, spacing) must work without any network access. AI simplification may require initial model download but must work fully offline after that.
2. **No data transmission** — No contribution may add any mechanism that sends page content, user text, or behavioral data to an external server. This includes analytics SDKs, error reporting, A/B testing platforms, and feature flags services.
3. **Manifest V3 compliance** — All code must comply with Chrome Manifest V3 constraints (no `eval`, no remote code execution, service workers only — no persistent background pages).
4. **Minimum permissions footprint** — Do not add new `chrome` API permissions without a clear justification in the PR description.

---

## Development Workflow

### Setup

```bash
git clone https://github.com/Sri-Krishna-V/Elu.git
cd Elu
npm install
npm run build
```

Load `dist/` as an unpacked extension in `chrome://extensions/`.

### Branch Naming

| Prefix | When to use |
|---|---|
| `feat/` | New feature |
| `fix/` | Bug fix |
| `docs/` | Documentation only |
| `refactor/` | Code restructuring with no functional change |
| `chore/` | Build configuration, dependencies, CI |

Example: `feat/onboarding-skip-button`, `fix/tts-voice-selection-crash`

### Commits

Use imperative mood in the subject line, ≤72 characters:

```
Add ambient sound volume persistence
Fix glossary tooltip clipping on RTL pages
Refactor content extractor to use shared Readability instance
```

---

## Pull Request Checklist

Before opening a PR:

- [ ] `npm run build` exits successfully
- [ ] The feature works in Chrome with the built `dist/` folder
- [ ] No new `console.error` or unhandled promise rejections in DevTools
- [ ] Existing features still work (bionic, chunking, focus, TTS, themes)
- [ ] No external network calls added (except dictionary API pattern, with justification)
- [ ] `chrome.storage` keys documented in [configuration.md](configuration.md) if new keys added
- [ ] Privacy implications described in the PR description

---

## File Structure Conventions

```
src/
  background/   Service worker and prompt library only
  content/      One file per content feature; index.js is the orchestrator
  offscreen/    WebLLM engine host — no UI, no feature logic
  options/      Settings page and onboarding
  popup/        Extension popup only
  common/       Pure utilities with no Chrome API calls at module scope
    models/     Plain data-object factories (no side effects)
```

- `common/` modules must not call `chrome.*` APIs at module load time (they are imported by both content scripts and option pages which have different API surfaces).
- Feature modules in `content/` should export named functions only — no top-level side effects.
- All DOM mutations in content scripts must be reversible (store originals, expose a `remove*` or `deactivate*` counterpart).

---

## Adding a New Prompt Family

1. Add the new family key and five level objects to `src/background/prompts.js`.
2. Add the enum value to the `optimizeFor` selector in `src/popup/index.html`.
3. Update the popup JS to save the new key to `chrome.storage.sync`.
4. Document the new mode in [features/simplification.md](features/simplification.md).

---

## Adding a New Colour Theme

1. Add an entry to the `themes` object in `src/content/index.js` with `backgroundColor` and `textColor`.
2. Add a button for the theme in `src/popup/index.html` with `data-theme="yourKey"`.
3. Add the key and colours to the theme table in [features/visual-accessibility.md](features/visual-accessibility.md) and [configuration.md](configuration.md).

---

## License

By contributing to this project, you agree that your contributions will be licensed under the project's [MIT License](../LICENSE).
