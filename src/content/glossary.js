import { commonEnglishWords } from '../common/dictionary.js';

let tooltipContainer = null;
let activeTooltip = null;
let dismissTimer = null;

const GLOSSARY_TIMEOUT_MS = 10000;      // how long tooltip stays AFTER result shows
const GLOSSARY_INFER_TIMEOUT_MS = 60000; // max time to wait for LLM inference

export function initGlossary() {
    document.addEventListener('dblclick', handleDoubleClick);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') removeTooltip();
    });
}

async function handleDoubleClick(e) {
    const selection = window.getSelection();
    const word = selection.toString().trim();

    if (!word || word.length > 40) return;
    if (/\s/.test(word)) return;

    const lowerWord = word.toLowerCase();
    if (commonEnglishWords.has(lowerWord)) return;

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2 + window.scrollX;
    const posY    = rect.bottom + window.scrollY + 10;

    showTooltip(centerX, posY, `<span class="loading">Looking up <em>${word}</em>…</span>`);

    // Escalate loading message after 5s so user knows the model is working
    const loadingTimer = setTimeout(() => {
        updateTooltipContent(`<span class="loading">⚙️ Model is generating definition…</span>`);
    }, 5000);

    try {
        const html = await getDefinition(word);
        clearTimeout(loadingTimer);
        updateTooltipContent(html);
        // Only start auto-dismiss once we have the actual result
        if (activeTooltip) {
            dismissTimer = setTimeout(removeTooltip, GLOSSARY_TIMEOUT_MS);
        }
    } catch (err) {
        clearTimeout(loadingTimer);
        console.error('[Elu Glossary] Error:', err);
        const msg = err.message?.includes('timed out') || err.message?.includes('timeout')
            ? `<span class="error">Model took too long. Try again once it's ready.</span>`
            : `<span class="error">Could not load definition: ${err.message}</span>`;
        updateTooltipContent(msg);
        if (activeTooltip) dismissTimer = setTimeout(removeTooltip, GLOSSARY_TIMEOUT_MS);
    }
}

function createTooltipContainer() {
    if (tooltipContainer) return tooltipContainer;

    const host = document.createElement('div');
    host.id = 'elu-glossary-host';
    host.style.cssText = 'position:absolute;left:0;top:0;z-index:2147483647;pointer-events:none;';

    const shadow = host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = `
        .tooltip {
            background: #1e1e2e;
            color: #cdd6f4;
            padding: 10px 14px;
            border-radius: 8px;
            font-family: system-ui, sans-serif;
            font-size: 13px;
            max-width: 320px;
            box-shadow: 0 6px 20px rgba(0,0,0,0.35);
            position: absolute;
            transform: translateX(-50%);
            animation: fadeIn 0.18s ease;
            pointer-events: auto;
            line-height: 1.5;
            border: 1px solid rgba(255,255,255,0.08);
        }
        .tooltip::before {
            content: '';
            position: absolute;
            top: -6px;
            left: 50%;
            margin-left: -6px;
            border-width: 0 6px 6px 6px;
            border-style: solid;
            border-color: transparent transparent #1e1e2e transparent;
        }
        .term {
            font-weight: 700;
            color: #89b4fa;
            font-size: 14px;
        }
        .phonetic {
            color: #a6adc8;
            font-size: 12px;
            margin-left: 4px;
        }
        .header {
            margin-bottom: 6px;
        }
        .definition-entry {
            margin-top: 5px;
        }
        .part-of-speech {
            color: #cba6f7;
            font-style: italic;
            font-size: 12px;
        }
        .definition-text {
            color: #cdd6f4;
        }
        .example {
            color: #a6adc8;
            font-style: italic;
            margin-top: 2px;
            font-size: 12px;
        }
        .loading {
            color: #a6adc8;
            font-style: italic;
        }
        .error {
            color: #f38ba8;
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: translateX(-50%) translateY(4px); }
            to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
    `;

    shadow.appendChild(style);
    document.body.appendChild(host);

    tooltipContainer = shadow;

    document.addEventListener('mousedown', (ev) => {
        if (activeTooltip && !host.contains(ev.target)) removeTooltip();
    });

    return shadow;
}

function showTooltip(x, y, htmlContent) {
    const shadow = createTooltipContainer();
    removeTooltip();

    const tooltip = document.createElement('div');
    tooltip.className = 'tooltip';

    // Clamp x so the tooltip never overflows the viewport edges.
    const HALF_WIDTH = 160; // approximate half of max-width (320px)
    const maxX = document.documentElement.scrollWidth - HALF_WIDTH;
    const clampedX = Math.max(HALF_WIDTH, Math.min(x, maxX));

    tooltip.style.left = `${clampedX}px`;
    tooltip.style.top  = `${y}px`;
    tooltip.innerHTML  = htmlContent;

    shadow.appendChild(tooltip);
    activeTooltip = tooltip;

    // Auto-dismiss timer is started AFTER inference completes (in handleDoubleClick)
    // so we do NOT set dismissTimer here.
}

function updateTooltipContent(html) {
    if (!activeTooltip) return;
    activeTooltip.innerHTML = html;
}

function removeTooltip() {
    if (dismissTimer) {
        clearTimeout(dismissTimer);
        dismissTimer = null;
    }
    if (activeTooltip) {
        activeTooltip.remove();
        activeTooltip = null;
    }
}

const GLOSSARY_SYSTEM_PROMPT =
    'You are a concise dictionary. ' +
    'Given a single word, respond with ONLY: ' +
    'one line "<part-of-speech>: <definition>" (e.g. "noun: A small furry animal."). ' +
    'No extra text, no repetition of the word, no markdown.';

/**
 * Asks the LLM (via background) to define a word and returns a rich HTML
 * string ready to inject into the tooltip.
 *
 * @param {string} word
 * @returns {Promise<string>} HTML snippet
 */
async function getDefinition(word) {
    const inferP = chrome.runtime.sendMessage({
        action: 'llmInfer',
        systemPrompt: GLOSSARY_SYSTEM_PROMPT,
        userPrompt: word
    });

    const timeoutP = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Inference timed out')), GLOSSARY_INFER_TIMEOUT_MS)
    );

    const response = await Promise.race([inferP, timeoutP]);

    if (!response?.success) {
        throw new Error(response?.error || 'LLM inference failed');
    }

    const raw = (response.result || '').trim();

    if (!raw) {
        return `<span class="term">${word}</span> <span class="error">— no definition returned.</span>`;
    }

    // Parse optional "part-of-speech: definition" format
    const match = raw.match(/^([a-z ]+):\s*(.+)$/i);
    let html = `<div class="header"><span class="term">${word}</span></div>`;
    if (match) {
        html += `<div class="definition-entry">`;
        html += `<span class="part-of-speech">${match[1]}:</span> `;
        html += `<span class="definition-text">${match[2]}</span>`;
        html += `</div>`;
    } else {
        html += `<div class="definition-entry"><span class="definition-text">${raw}</span></div>`;
    }
    return html;
}
