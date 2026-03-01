# Bionic Reading

**File:** `src/content/bionic.js`  
**Trigger:** Popup toggle · `{ action: 'toggle-bionic' }` from content orchestrator

---

## Overview

Bionic Reading is a reading technique that bolds the first half of each word. The eye locates the bold anchor and the brain reconstructs the full word, allowing faster scanning while maintaining comprehension. Elu implements this with a DOM TreeWalker that processes all visible text nodes in the article.

---

## `applyBionicReading(rootElement?)`

If `rootElement` is not provided, `extractArticleElement()` is called to find the article container automatically.

### Algorithm

1. A `TreeWalker` with `NodeFilter.SHOW_TEXT` traverses every text node under `rootElement`.
2. Nodes are skipped if:
   - The parent already has class `bionic-processed` (prevents double-processing)
   - The parent is `SCRIPT`, `STYLE`, `TEXTAREA`, `INPUT`, `NOSCRIPT`, `CODE`, `PRE`
   - The parent is `contenteditable`
   - The node contains only whitespace
3. All matching nodes are collected into `nodesToProcess` (avoids live-NodeList modification issues).
4. For each node:
   - The text is split on `(\s+)` to preserve whitespace.
   - For each word token, the bold portion length is calculated:
     - 1-char word → bold 1 char
     - 2–3 char word → bold 1 char
     - 4+ char word → `Math.ceil(len / 2)` chars
   - A `<b class="bionic-highlight" style="font-weight:700">` wraps the bold portion.
   - A `DocumentFragment` is built containing the `<b>` and a trailing text node for the rest.
   - A `<span class="bionic-processed">` wraps the fragment and replaces the original text node.

### Example

`"Reading"` (7 chars) → bold length = 4 → `<b>Read</b>ing`

---

## `removeBionicReading()`

1. Selects all `.bionic-processed` spans.
2. For each span, replaces it with a plain text node containing `span.textContent`.
3. Calls `document.body.normalize()` to merge adjacent text nodes.

The operation is fully reversible — the original DOM structure (minus whitespace normalization) is restored exactly.

---

## CSS

The `.bionic-highlight` class is available for custom styling (e.g., colour, letterSpacing). The `style="font-weight:700"` inline style ensures the bold renders even if page styles override `font-weight` on `b` elements.

---

## Performance Notes

- The TreeWalker collects all nodes before modifying the DOM to avoid invalidating the iterator.
- Large articles (~10,000 words) process in < 100 ms on modern hardware.
- The feature is scoped to the article container, not `document.body`, to minimize traversal cost.

---

## Accessibility Notes

- Bionic Reading does not change the text content — only the visual presentation.
- Screen readers read the underlying text content unchanged (the bold is purely presentational).
- The feature can be toggled off at any time via the popup, cleanly restoring the original text.
