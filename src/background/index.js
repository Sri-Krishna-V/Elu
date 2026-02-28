/**
 * Elu – Background Service Worker (src/background/index.js)
 *
 * Responsibilities:
 *  1. Install-time onboarding
 *  2. System-prompt delivery ( getSystemPrompts )
 *  3. Offscreen-document lifecycle management
 *  4. Routing LLM inference requests  content → offscreen → content
 *  5. Keyboard-shortcut command dispatch
 */

import { systemPrompts } from './prompts.js';

// ─── Offscreen document helpers ────────────────────────────────────────────

const OFFSCREEN_HTML = 'src/offscreen/index.html';

/**
 * Returns true if an offscreen document is currently alive.
 */
async function hasOffscreenDocument() {
    // chrome.offscreen.hasDocument() is available in Chrome 116+.
    if (chrome.offscreen?.hasDocument) {
        return chrome.offscreen.hasDocument();
    }
    // Fallback: inspect all extension contexts.
    const contexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT']
    });
    return contexts.some((ctx) =>
        ctx.documentUrl?.endsWith(OFFSCREEN_HTML)
    );
}

/**
 * Creates the offscreen document if it does not already exist.
 */
async function ensureOffscreenDocument() {
    if (await hasOffscreenDocument()) return;

    await chrome.offscreen.createDocument({
        url: chrome.runtime.getURL(OFFSCREEN_HTML),
        reasons: ['WORKERS'],
        justification:
            'WebLLM (Llama-3.2-1B-Instruct) inference runs in a Web Worker ' +
            'inside the offscreen document using WebGPU.'
    });
}

/**
 * Sends a message to the offscreen document and resolves with its response.
 * Ensures the document is alive before sending.
 *
 * @param {object} payload – must include { target: 'offscreen', action: string, … }
 * @returns {Promise<object>}
 */
async function sendToOffscreen(payload) {
    await ensureOffscreenDocument();
    return chrome.runtime.sendMessage({ target: 'offscreen', ...payload });
}

// ─── Install handler ────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === 'install') {
        console.log('[Elu] Extension installed');
        await chrome.storage.sync.remove('readingLevel');
        chrome.tabs.create({
            url: chrome.runtime.getURL('src/options/index.html?onboarding=true')
        });
    }

    // Pre-warm the offscreen document & model on install / update so the
    // first simplification request is not blocked by model loading.
    try {
        await ensureOffscreenDocument();
    } catch (err) {
        console.warn('[Elu] Could not pre-create offscreen document:', err.message);
    }
});

// ─── Message router ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // ── System prompts (legacy / options page) ──────────────────────────────
    if (request.action === 'getSystemPrompts') {
        sendResponse({ success: true, prompts: systemPrompts });
        return false; // synchronous
    }

    // ── LLM inference (content script → offscreen) ──────────────────────────
    if (request.action === 'llmInfer') {
        (async () => {
            try {
                const { systemPrompt, userPrompt } = request;
                if (!systemPrompt || !userPrompt) {
                    sendResponse({ success: false, error: 'systemPrompt and userPrompt are required' });
                    return;
                }
                const result = await sendToOffscreen({
                    action: 'llmInfer',
                    systemPrompt,
                    userPrompt
                });
                sendResponse(result ?? { success: false, error: 'No response from offscreen' });
            } catch (err) {
                console.error('[Elu background] llmInfer error:', err);
                sendResponse({ success: false, error: err.message });
            }
        })();
        return true; // keep channel open
    }

    // ── AI / model status check ─────────────────────────────────────────────
    if (request.action === 'checkAIStatus') {
        (async () => {
            try {
                await ensureOffscreenDocument();
                const result = await sendToOffscreen({ action: 'checkStatus' });
                const statusMap = {
                    ready: { status: 'ready', message: 'WebLLM model ready' },
                    loading: { status: 'downloading', message: 'WebLLM model loading…' },
                    unavailable: { status: 'unavailable', message: 'WebLLM model unavailable' }
                };
                sendResponse(statusMap[result?.status] ?? statusMap.unavailable);
            } catch (err) {
                sendResponse({ status: 'unavailable', message: err.message });
            }
        })();
        return true;
    }

    return true; // default: keep channel open for other async handlers
});

// ─── Keyboard-shortcut command dispatcher ───────────────────────────────────

chrome.commands.onCommand.addListener(async (command) => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    const actionMap = {
        'simplify-page': 'simplify',
        'toggle-focus': 'focus-toggle',
        'toggle-tts': 'tts-play'
    };

    const action = actionMap[command];
    if (action) {
        try {
            await chrome.tabs.sendMessage(tab.id, { action });
        } catch (err) {
            console.log(`[Elu] Could not send "${action}" to tab ${tab.id}:`, err.message);
        }
    }
});
