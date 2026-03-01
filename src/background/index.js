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
 * chrome.offscreen.hasDocument() is guaranteed present in Chrome 116+,
 * which is the same minimum version that supports createDocument().
 */
function hasOffscreenDocument() {
    return chrome.offscreen.hasDocument();
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
            'WebLLM inference runs in a Web Worker inside the offscreen ' +
            'document using WebGPU for on-device AI processing.'
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

/**
 * Read the selected model from storage (with migration from old Llama model).
 */
async function getSelectedModel() {
    return new Promise((resolve) => {
        chrome.storage.sync.get(['selectedModel'], (result) => {
            let model = result.selectedModel;
            if (!model || model === 'Llama-3.2-1B-Instruct-q4f16_1-MLC') {
                model = 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC';
                chrome.storage.sync.set({ selectedModel: model });
            }
            resolve(model);
        });
    });
}

/**
 * Ensures the offscreen document exists AND the engine is initialized.
 * Handles the case where Chrome silently killed the offscreen document.
 */
async function ensureEngineReady() {
    await ensureOffscreenDocument();
    const status = await sendToOffscreen({ action: 'checkStatus' });
    if (status?.status !== 'ready') {
        const model = await getSelectedModel();
        const initResult = await sendToOffscreen({ action: 'initEngine', model });
        if (!initResult?.success) {
            throw new Error(initResult?.error || 'Engine initialization failed');
        }
    }
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
                await ensureEngineReady();
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
                const errorReason = result?.errorReason || '';
                const statusMap = {
                    ready: { status: 'ready', message: 'WebLLM model ready' },
                    loading: { status: 'downloading', message: 'WebLLM model loading…' },
                    unavailable: {
                        status: 'unavailable',
                        message: errorReason === 'no_webgpu'
                            ? 'WebGPU not supported. Update Chrome or check GPU compatibility at chrome://gpu'
                            : 'WebLLM model unavailable. Click Retry to try again.',
                        errorReason
                    }
                };
                sendResponse(statusMap[result?.status] ?? statusMap.unavailable);
            } catch (err) {
                sendResponse({ status: 'unavailable', message: err.message });
            }
        })();
        return true;
    }

    // ── Retry engine init (triggered from popup) ─────────────────────────────
    if (request.action === 'retryEngine') {
        (async () => {
            try {
                await ensureOffscreenDocument();
                const model = await getSelectedModel();
                const result = await sendToOffscreen({ action: 'initEngine', model });
                sendResponse(result ?? { success: false, error: 'No response from offscreen' });
            } catch (err) {
                sendResponse({ success: false, error: err.message });
            }
        })();
        return true;
    }

    // ── Model change handler (triggered from options page) ──────────────────
    if (request.action === 'modelChanged') {
        (async () => {
            try {
                const { model } = request;
                if (!model) {
                    sendResponse({ success: false, error: 'Model ID is required' });
                    return;
                }
                console.log('[Elu background] Model change requested:', model);
                await ensureOffscreenDocument();
                const result = await sendToOffscreen({ action: 'reloadEngine', model });
                sendResponse(result ?? { success: false, error: 'No response from offscreen' });
            } catch (err) {
                console.error('[Elu background] Model change failed:', err);
                sendResponse({ success: false, error: err.message });
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
