# Focus Mode

**File:** `src/content/focus-mode.js`  
**Trigger:** Popup "Focus" button · `Alt+F` keyboard shortcut  
**Actions:** `focus-activate` · `focus-deactivate` · `toggle-focus-mode` · `focus-update-config`

---

## Overview

Focus Mode creates a distraction-free reading environment by:
1. Dimming everything on the page except the main article.
2. Hiding ads, sidebars, comment sections, related content, and popups.
3. Blocking CSS animations and pausing autoplay videos.
4. Providing optional ambient sound.
5. Optionally running a Pomodoro-style countdown timer.

---

## Module State

| Variable | Description |
|---|---|
| `isActive` | Whether Focus Mode is currently on |
| `overlay` | The dim `<div>` element covering non-article content |
| `timerWidget` | The countdown timer DOM element |
| `timerInterval` | `setInterval` ID for the countdown |
| `audioElement` | The `<audio>` element for ambient sound |
| `originalStyles` | `Map<Element, CSSText>` — stores original inline styles for restoration |

---

## Exported Functions

### `activateFocusMode(config: FocusConfig) → Promise<void>`

1. If already active, deactivates first (clean re-apply).
2. Saves `{ ...config, enabled: true }` to `chrome.storage.sync`.
3. Calls `createFocusOverlay(config.dimLevel)` to add a semi-transparent overlay over non-article content.
4. Applies blocking features based on config flags:
   - `blockAnimations` → injects a `<style>` that sets `animation: none !important` page-wide
   - `blockVideos` → calls `.pause()` on all `<video>` elements
   - `hideComments` → hides `DISTRACTION_SELECTORS.comments`
   - `hideSidebars` → hides `DISTRACTION_SELECTORS.sidebars`
5. Always hides ads, popups, and related-content panels.
6. Starts ambient sound if `config.ambientSound !== 'none'`.
7. Starts Pomodoro timer if `config.timerEnabled`.

### `deactivateFocusMode() → void`

1. Removes the overlay element.
2. Removes the timer widget.
3. Clears `timerInterval`.
4. Stops and removes the audio element.
5. Restores all hidden elements from `originalStyles` map.
6. Removes the animation-blocking `<style>`.
7. Unpauses videos.
8. Saves `{ enabled: false }` config to storage.

### `toggleFocusMode() → void`

Calls `activateFocusMode` with the stored config if not active, or `deactivateFocusMode` if active.

### `isFocusModeActive() → boolean`

Returns the current `isActive` state.

### `updateFocusConfig(partial: Partial<FocusConfig>) → Promise<void>`

Merges `partial` into the stored config and re-applies Focus Mode with the updated settings.

---

## Dim Overlay

The overlay is a `position: fixed` full-screen `<div>` with:
- `background: rgba(0,0,0,{dimLevel})`
- A "hole" cut out around the article container using `mix-blend-mode` or `pointer-events: none`

The article container (found via `MAIN_CONTENT_SELECTORS`) is given a higher `z-index` so it visually sits above the overlay.

---

## Distraction Selectors

Defined in `src/common/models/focus-config.js` as `DISTRACTION_SELECTORS`:

| Category | Examples of matched elements |
|---|---|
| `ads` | `[class*="ad-"]`, `.ads`, `[id*="advertisement"]` |
| `sidebars` | `aside`, `[role="complementary"]`, `.sidebar` |
| `comments` | `#comments`, `.comment-section`, `[class*="comment"]` |
| `related` | `.related-posts`, `[class*="related"]`, `[class*="recommend"]` |
| `popups` | `.newsletter-popup`, `.subscribe-popup`, `[class*="modal"]` |

---

## Ambient Sound

| Value | Sound |
|---|---|
| `none` | Silence (no audio element created) |
| `brown-noise` | Low-frequency brown noise (relaxing, masking) |
| `rain` | Rain ambience |
| `cafe` | Coffeehouse background noise |

Audio files are loaded from `chrome.runtime.getURL('assets/…')`. The `ambientVolume` config key (`0.0` – `1.0`) controls the playback volume.

---

## Pomodoro Timer

When `timerEnabled: true`:
- A `timerWidget` div is injected into the page (fixed position, non-intrusive).
- Counts down from `config.timerDuration` minutes.
- Displays remaining time as `MM:SS`.
- Calls `deactivateFocusMode()` and shows a notification when the timer expires.

---

## Default Configuration

```js
DEFAULT_FOCUS_CONFIG = {
    enabled:         false,
    dimLevel:        0.6,
    blockAnimations: true,
    blockVideos:     true,
    hideComments:    true,
    hideSidebars:    true,
    ambientSound:    'none',
    ambientVolume:   0.3,
    timerEnabled:    false,
    timerDuration:   25,
}
```

See [configuration.md](../configuration.md#focusconfig-schema) for the full schema.

---

## Accessibility Notes

- Focus Mode does not move keyboard focus, so screen reader users are not disoriented.
- All removed elements are restored on deactivation — no permanent DOM changes.
- The `blockAnimations` option respects `prefers-reduced-motion` users by surfacing explicit control rather than overriding silently.
