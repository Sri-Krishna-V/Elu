import { commonEnglishWords } from '../common/dictionary.js';

let tooltipContainer = null;
let activeTooltip = null;
// glossary no longer keeps a local AI session — inference goes through
// the background → offscreen pipeline.

export function initGlossary() {
    document.addEventListener('dblclick', handleDoubleClick);
    // document.addEventListener('click', closeTooltip); // Close on click elsewhere?
}

async function handleDoubleClick(e) {
    const selection = window.getSelection();
    const word = selection.toString().trim();
    
    // Basic validation
    if (!word || word.length > 40) return;
    if (/\s/.test(word)) return; // Only single words for now
    
    const lowerWord = word.toLowerCase();
    
    // Skip common words
    if (commonEnglishWords.has(lowerWord)) return;
    
    // We have an interesting word.
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const centerX = rect.left + (rect.width / 2) + window.scrollX;
    
    showTooltip(centerX, rect.bottom + window.scrollY + 10, "Loading definition...");
    
    try {
        const definition = await getDefinition(word);
        updateTooltipContent(definition);
    } catch (err) {
        console.error("Glossary Error:", err);
        updateTooltipContent("Could not load definition.");
    }
}

function createTooltipContainer() {
    if (tooltipContainer) return tooltipContainer;
    
    const host = document.createElement('div');
    host.id = 'elu-glossary-host';
    host.style.position = 'absolute';
    host.style.left = '0';
    host.style.top = '0';
    host.style.zIndex = '2147483647'; // Max z-index
    host.style.pointerEvents = 'none'; // Don't block clicks initially
    
    const shadow = host.attachShadow({ mode: 'open' });
    
    const style = document.createElement('style');
    style.textContent = `
        .tooltip {
            background: #333;
            color: #fff;
            padding: 8px 12px;
            border-radius: 6px;
            font-family: sans-serif;
            font-size: 14px;
            max-width: 300px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            position: absolute;
            transform: translateX(-50%);
            animation: fadeIn 0.2s ease;
            pointer-events: auto;
            line-height: 1.4;
        }
        .tooltip::before {
            content: '';
            position: absolute;
            top: -6px;
            left: 50%;
            margin-left: -6px;
            border-width: 6px;
            border-style: solid;
            border-color: transparent transparent #333 transparent;
        }
        .term {
            font-weight: bold;
            color: #4fc3f7;
            margin-right: 4px;
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: translateX(-50%) translateY(5px); }
            to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
    `;
    
    shadow.appendChild(style);
    document.body.appendChild(host);
    
    tooltipContainer = shadow;
    
    // Close on outside click logic could go here or globally
    document.addEventListener('mousedown', (e) => {
        if (activeTooltip && !host.contains(e.target)) {
            removeTooltip();
        }
    });

    return shadow;
}

function showTooltip(x, y, content) {
    const shadow = createTooltipContainer();
    removeTooltip(); // Clear existing
    
    const tooltip = document.createElement('div');
    tooltip.className = 'tooltip';
    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
    tooltip.textContent = content;
    
    shadow.appendChild(tooltip);
    activeTooltip = tooltip;
}

function updateTooltipContent(text) {
    if (!activeTooltip) return;
    activeTooltip.innerHTML = text; // Allow minimal HTML if needed
}

function removeTooltip() {
    if (activeTooltip) {
        activeTooltip.remove();
        activeTooltip = null;
    }
}

async function getDefinition(word) {
    const GLOSSARY_SYSTEM_PROMPT =
        'You are a concise dictionary assistant. ' +
        'Define the word simply in one short sentence. ' +
        'Do not repeat the word definition prefix.';

    try {
        const response = await chrome.runtime.sendMessage({
            action: 'llmInfer',
            systemPrompt: GLOSSARY_SYSTEM_PROMPT,
            userPrompt: `Define "${word}"`
        });
        if (!response?.success) {
            throw new Error(response?.error || 'LLM inference failed');
        }
        return `<span class="term">${word}</span>: ${response.result}`;
    } catch (e) {
        console.error('[Elu] Glossary inference error:', e);
        return 'Definition failed.';
    }
}
