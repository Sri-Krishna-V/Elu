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
let engineErrorReason = '';        // structured reason: 'no_webgpu' | 'init_failed' | ''
let initPromise = null;

const INIT_MAX_ATTEMPTS = 3;
const INIT_BACKOFF_BASE_MS = 2000;
const INFERENCE_TIMEOUT_MS = 30000;

/**
 * Initialise (or return the existing) WebLLM engine.
 * Checks for WebGPU support first, then retries with exponential backoff.
 */
async function initEngine() {
    if (engine && engineStatus === 'ready') return engine;
    if (initPromise) return initPromise;

    // WebGPU feature detection
    if (!navigator.gpu) {
        engineStatus = 'unavailable';
        engineErrorReason = 'no_webgpu';
        chrome.runtime.sendMessage({
            action: 'modelProgress',
            progress: { progress: 0, text: 'WebGPU not supported by this browser or GPU' }
        }).catch(() => {});
        throw new Error('WebGPU is not supported by this browser or GPU.');
    }

    engineStatus = 'loading';
    engineErrorReason = '';

    initPromise = (async () => {
        let lastError;
        for (let attempt = 0; attempt < INIT_MAX_ATTEMPTS; attempt++) {
            try {
                const e = await CreateWebWorkerMLCEngine(
                    new Worker(
                        chrome.runtime.getURL('assets/webllm-worker.js'),
                        { type: 'module' }
                    ),
                    MODEL_ID,
                    {
                        initProgressCallback: (progress) => {
                            chrome.runtime.sendMessage({
                                action: 'modelProgress',
                                progress
                            }).catch(() => {});
                        }
                    }
                );
                engine = e;
                engineStatus = 'ready';
                engineErrorReason = '';
                chrome.runtime.sendMessage({
                    action: 'modelProgress',
                    progress: { progress: 1, timeElapsed: 0, text: 'Model ready' }
                }).catch(() => {});
                return engine;
            } catch (err) {
                lastError = err;
                console.warn(`[Elu offscreen] Engine init attempt ${attempt + 1}/${INIT_MAX_ATTEMPTS} failed:`, err.message);

                if (attempt < INIT_MAX_ATTEMPTS - 1) {
                    const delay = INIT_BACKOFF_BASE_MS * Math.pow(2, attempt);
                    chrome.runtime.sendMessage({
                        action: 'modelProgress',
                        progress: { progress: 0, text: `Download interrupted. Retrying in ${delay / 1000}s…` }
                    }).catch(() => {});
                    await new Promise(r => setTimeout(r, delay));
                }
            }
        }
        engineStatus = 'unavailable';
        engineErrorReason = 'init_failed';
        initPromise = null;
        chrome.runtime.sendMessage({
            action: 'modelProgress',
            progress: { progress: 0, text: 'Model download failed. Click Retry in the popup.' }
        }).catch(() => {});
        throw lastError;
    })();

    return initPromise;
}

// ─── Serial inference queue ───────────────────────────────────────────────
// Ensures only one completion request runs at a time, preventing engine
// instability when multiple chunks or glossary lookups fire concurrently.
let _inferenceQueue = Promise.resolve();

/**
 * Schedule an inference request to run after any currently in-flight one.
 * Applies a per-request timeout so one stalled inference can't block forever.
 */
function queuedInference(systemPrompt, userPrompt) {
    const task = _inferenceQueue.then(() => {
        const inferenceP = runInference(systemPrompt, userPrompt);
        const timeoutP = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Inference timed out')), INFERENCE_TIMEOUT_MS)
        );
        return Promise.race([inferenceP, timeoutP]);
    });
    _inferenceQueue = task.catch(() => {});
    return task;
}

/**
 * Run a single inference request against the engine.
 * Each call uses a self-contained message history so system prompts always
 * take effect without carrying over prior conversation context.
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
        max_tokens: 2048,
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
            queuedInference(systemPrompt, userPrompt)
                .then((result) => sendResponse({ success: true, result }))
                .catch((err) => sendResponse({ success: false, error: err.message }));
            return true; // async
        }

        case 'checkStatus': {
            sendResponse({ success: true, status: engineStatus, errorReason: engineErrorReason });
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
