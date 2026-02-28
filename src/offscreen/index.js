/**
 * Elu – Offscreen Document (src/offscreen/index.js)
 *
 * This script runs inside the chrome.offscreen document.  It owns the
 * WebLLM engine (Llama-3.2-1B-Instruct-q4f16_1-MLC) which runs inside a
 * dedicated Web Worker so WebGPU work never blocks the extension UI.
 *
 * Message protocol (from background service-worker):
 *   { target: 'offscreen', action: 'initEngine' }
 *     → ensures the engine is loaded; responds { success: true }
 *
 *   { target: 'offscreen', action: 'llmInfer', systemPrompt, userPrompt }
 *     → runs one inference turn; responds { success: true, result: string }
 *        or { success: false, error: string }
 *
 *   { target: 'offscreen', action: 'checkStatus' }
 *     → responds { success: true, status: 'ready'|'loading'|'unavailable' }
 *
 * Progress broadcast (to all extension pages incl. popup):
 *   chrome.runtime.sendMessage({ action: 'modelProgress', progress: { ... } })
 */

import { CreateWebWorkerMLCEngine } from '@mlc-ai/web-llm';

const MODEL_ID = 'Llama-3.2-1B-Instruct-q4f16_1-MLC';

/** @type {import('@mlc-ai/web-llm').MLCEngineInterface | null} */
let engine = null;
let engineStatus = 'unavailable'; // 'unavailable' | 'loading' | 'ready'
let initPromise = null;

/**
 * Initialise (or return the existing) WebLLM engine.
 * Uses a Web Worker so WebGPU operations are off the main thread.
 */
async function initEngine() {
    if (engine && engineStatus === 'ready') return engine;
    if (initPromise) return initPromise;

    engineStatus = 'loading';

    initPromise = CreateWebWorkerMLCEngine(
        new Worker(
            chrome.runtime.getURL('assets/webllm-worker.js'),
            { type: 'module' }
        ),
        MODEL_ID,
        {
            initProgressCallback: (progress) => {
                // Forward download / compile progress to popup and other pages.
                chrome.runtime.sendMessage({
                    action: 'modelProgress',
                    progress
                }).catch(() => { /* popup may be closed — ignore */ });
            }
        }
    ).then((e) => {
        engine = e;
        engineStatus = 'ready';
        // Announce readiness
        chrome.runtime.sendMessage({
            action: 'modelProgress',
            progress: { progress: 1, timeElapsed: 0, text: 'Model ready' }
        }).catch(() => {});
        return engine;
    }).catch((err) => {
        engineStatus = 'unavailable';
        initPromise = null;
        throw err;
    });

    return initPromise;
}

/**
 * Run a single inference request.
 * Creates a fresh chat session each time so system prompts take effect
 * without carrying over prior conversation context.
 *
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @returns {Promise<string>}
 */
async function runInference(systemPrompt, userPrompt) {
    const e = await initEngine();

    const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
    ];

    const reply = await e.chat.completions.create({
        messages,
        temperature: 0.7,
        max_tokens: 1024,
        stream: false
    });

    return reply.choices[0]?.message?.content?.trim() ?? '';
}

// ─── Message listener ──────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    // Only handle messages explicitly targeting this offscreen document.
    if (message.target !== 'offscreen') return false;

    switch (message.action) {
        case 'initEngine': {
            initEngine()
                .then(() => sendResponse({ success: true }))
                .catch((err) => sendResponse({ success: false, error: err.message }));
            return true; // async
        }

        case 'llmInfer': {
            const { systemPrompt, userPrompt } = message;
            if (!systemPrompt || !userPrompt) {
                sendResponse({ success: false, error: 'systemPrompt and userPrompt are required' });
                return false;
            }
            runInference(systemPrompt, userPrompt)
                .then((result) => sendResponse({ success: true, result }))
                .catch((err) => sendResponse({ success: false, error: err.message }));
            return true; // async
        }

        case 'checkStatus': {
            sendResponse({ success: true, status: engineStatus });
            return false;
        }

        default:
            return false;
    }
});

// ─── Auto-initialise on document load ─────────────────────────────────────
// Start warming up the engine as soon as the offscreen document is created
// so the first real inference request is faster.
initEngine().catch((err) => {
    console.error('[Elu offscreen] Engine init failed:', err);
});
