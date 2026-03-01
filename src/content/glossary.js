import { commonEnglishWords } from '../common/dictionary.js';

let tooltipContainer = null;
let activeTooltip = null;

const GLOSSARY_TIMEOUT_MS = 10000;

export function initGlossary() {
    document.addEventListener('dblclick', handleDoubleClick);
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
    host.style.zIndex = '2147483647';
    host.style.pointerEvents = 'none';
    
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
    
    document.addEventListener('mousedown', (e) => {
        if (activeTooltip && !host.contains(e.target)) {
            removeTooltip();
        }
    });

    return shadow;
}

function showTooltip(x, y, content) {
    const shadow = createTooltipContainer();
    removeTooltip();
    
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
    activeTooltip.innerHTML = text;
}

function removeTooltip() {
    if (activeTooltip) {
        activeTooltip.remove();
        activeTooltip = null;
    }
}

/**
 * Sends a message to the background with retry logic for service worker restarts.
 */
async function sendMessageWithRetry(message, maxAttempts = 3) {
    const delays = [500, 1000, 2000];
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            const response = await chrome.runtime.sendMessage(message);
            if (chrome.runtime.lastError) {
                throw new Error(chrome.runtime.lastError.message);
            }
            return response;
        } catch (err) {
            const isDisconnect = /receiving end does not exist|disconnected/i.test(err.message);
            if (!isDisconnect || attempt === maxAttempts - 1) throw err;
            console.warn(`[Elu Glossary] Service worker disconnected (attempt ${attempt + 1}), retrying…`);
            await new Promise(r => setTimeout(r, delays[Math.min(attempt, delays.length - 1)]));
        }
    }
}

async function getDefinition(word) {
    const GLOSSARY_SYSTEM_PROMPT =
        'You are a concise dictionary assistant. ' +
        'Define the word simply in one short sentence. ' +
        'Do not repeat the word definition prefix.';

    try {
        const inferenceP = sendMessageWithRetry({
            action: 'llmInfer',
            systemPrompt: GLOSSARY_SYSTEM_PROMPT,
            userPrompt: `Define "${word}"`
        });

        const timeoutP = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), GLOSSARY_TIMEOUT_MS)
        );

        const response = await Promise.race([inferenceP, timeoutP]);

        if (!response?.success) {
            throw new Error(response?.error || 'LLM inference failed');
        }

        const result = response.result || '';

        // Validate glossary output: should be a short sentence, not gibberish
        if (result.length > 300 || result.split('\n').length > 3) {
            return `<span class="term">${word}</span>: Definition unavailable (unexpected response).`;
        }

        return `<span class="term">${word}</span>: ${result}`;
    } catch (e) {
        console.error('[Elu] Glossary inference error:', e);
        if (e.message === 'timeout') {
            return 'AI is busy. Try again in a moment.';
        }
        return 'Definition failed.';
    }
}
