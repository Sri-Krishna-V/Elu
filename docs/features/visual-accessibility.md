# Visual Accessibility

**Files:** `src/content/index.js` (theme/font/spacing logic) · `src/popup/index.html` (controls)  
**Actions:** `apply-theme` · `reset-theme` · `toggle-font` · `update-spacing`

---

## Overview

Elu provides a layered visual accessibility system covering colour, typography, and spacing. All settings are applied through inline styles to the article container (and `document.body` where needed), and all are persisted in `chrome.storage.sync` so preferences carry over between sessions.

---

## Colour Themes

13 built-in themes covering common visual accessibility needs:

| Key | Background | Text | Use case |
|---|---|---|---|
| `default` | Page default | Page default | Reset to native colours |
| `highContrast` | `#FFFFFF` | `#000000` | High contrast (WCAG AA+) |
| `highContrastAlt` | `#000000` | `#FFFFFF` | Reversed high contrast |
| `darkMode` | `#121212` | `#E0E0E0` | Low-light environments |
| `sepia` | `#F5E9D5` | `#5B4636` | Warm reading tone |
| `lowBlueLight` | `#FFF8E1` | `#2E2E2E` | Reduce blue light emission |
| `softPastelBlue` | `#E3F2FD` | `#0D47A1` | Soft cool tone |
| `softPastelGreen` | `#F1FFF0` | `#00695C` | Soft warm green tone |
| `creamPaper` | `#FFFFF0` | `#333333` | Paper-like, dyslexia-friendly |
| `grayScale` | `#F5F5F5` | `#424242` | Neutral monochrome |
| `blueLightFilter` | `#FFF3E0` | `#4E342E` | Amber warm filter |
| `highContrastYellowBlack` | `#000000` | `#FFFF00` | Achromatopsia / AAA contrast |
| `highContrastBlackYellow` | `#FFFF00` | `#000000` | Inverted yellow/black |

### Applying a Theme

The `apply-theme` message handler:
1. Retrieves `backgroundColor` and `textColor` for the selected key.
2. Sets `document.body.style.backgroundColor` and `document.body.style.color`.
3. Applies the same colours to all `p, h1–h6, span, li, blockquote` elements within the article container.
4. Saves `selectedTheme` to `chrome.storage.sync`.

### Resetting a Theme

`reset-theme` calls `removeProperty` on `backgroundColor` and `color` for every previously modified element, and saves `selectedTheme: 'default'`.

### WCAG Compliance

| Theme | WCAG Ratio | Grade |
|---|---|---|
| `highContrast` | 21:1 | AAA |
| `highContrastAlt` | 21:1 | AAA |
| `highContrastYellowBlack` | 19.8:1 | AAA |
| `highContrastBlackYellow` | 19.8:1 | AAA |
| `darkMode` | ~8:1 (E0 on 12) | AA |

---

## OpenDyslexic Font

The **OpenDyslexic** typeface is designed to reduce letter-confusion errors common in dyslexia. Its distinctive weighted bottoms make it harder to accidentally flip or mirror letters.

The font is **self-hosted** in `public/fonts/` and referenced in `content.css`. No CDN dependency means it is available in offline environments.

### Enabling the Font

`{ action: 'toggle-font', enabled: true }` applies:

```css
document.body.style.fontFamily = 'OpenDyslexic, sans-serif';
```

`enabled: false` removes the override.

`fontEnabled` is saved to `chrome.storage.sync` and re-applied on every page load via the content script initialization.

### Font Files

| Variant | Use |
|---|---|
| `OpenDyslexic-Regular.otf` | Body text |
| `OpenDyslexic-Bold.otf` | Bold text |
| `OpenDyslexic-Italic.otf` | Italic / emphasis |
| `OpenDyslexic-BoldItalic.otf` | Bold-italic |

---

## Spacing Controls

Three spacing dimensions are independently adjustable:

| Control | CSS Property | Units | Range | Default |
|---|---|---|---|---|
| Line Spacing | `line-height` | multiplier | 1.0 – 3.0 | 1.5 |
| Letter Spacing | `letter-spacing` | px | 0 – 10 | 0 |
| Word Spacing | `word-spacing` | px | 0 – 20 | 0 |

### Applying Spacing

`{ action: 'update-spacing', lineSpacing, letterSpacing, wordSpacing }` sets the corresponding CSS property on `document.body` and all paragraph-level elements in the article container:

```js
element.style.lineHeight     = `${lineSpacing}`;
element.style.letterSpacing  = `${letterSpacing}px`;
element.style.wordSpacing    = `${wordSpacing}px`;
```

All three values are saved to `chrome.storage.sync` and restored on next page load.

### Research Background

Increased line spacing (≥ 1.5), letter spacing (≥ 0.12 em), and word spacing (≥ 0.16 em) are associated with improved reading performance for readers with dyslexia in multiple studies (e.g., Zorzi et al., 2012).

---

## Persistence and Restoration

All visual preferences (`selectedTheme`, `fontEnabled`, `lineSpacing`, `letterSpacing`, `wordSpacing`) are read from `chrome.storage.sync` in the content script immediately after injection, and are applied without user interaction. The popup **Reset to Defaults** button sends `reset-theme` and sets all spacing back to defaults.

---

## Onboarding Profiles

The onboarding flow pre-configures visual accessibility settings per profile:

| Profile | Theme | Font | Line Spacing | Letter Spacing | Word Spacing |
|---|---|---|---|---|---|
| Default | `default` | off | 1.5 | 0 | 0 |
| Dyslexia | `creamPaper` | on | 2.0 | 2 | 4 |
| ADHD | `darkMode` | off | 1.8 | 1 | 2 |
| Low Vision | `highContrast` | off | 2.5 | 3 | 6 |
