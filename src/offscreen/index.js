/**
 * Elu – Offscreen Document (src/offscreen/index.js)
 *
 * This script runs inside the chrome.offscreen document.  It owns the
 * WebLLM engine which runs inside a dedicated Web Worker so WebGPU work 
 * never blocks the extension UI.
 *
 * Message protocol (from background service-worker):
 *   { target: 'offscreen', action: 'initEngine' }
 *     → ensures the engine is loaded; responds { success: true }
 *
 *   { target: 'offscreen', action: 'reloadEngine', model: string }
 *     → unloads current engine and loads new model
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

const DEFAULT_MODEL = 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC';

/** @type {import('@mlc-ai/web-llm').MLCEngineInterface | null} */
let engine = null;
let currentModel = null;
let engineStatus = 'unavailable'; // 'unavailable' | 'loading' | 'ready'
let engineErrorReason = '';        // structured reason: 'no_webgpu' | 'init_failed' | ''
let initPromise = null;

const INIT_MAX_ATTEMPTS = 3;
const INIT_BACKOFF_BASE_MS = 2000;
const INFERENCE_TIMEOUT_MS = 180000; // 180 seconds (3 minutes) for slower hardware

/**
 * Properly destroy the existing engine to free VRAM
 */
async function destroyEngine() {
    if (!engine) return;
    
    try {
        console.log('[Elu offscreen] Destroying existing engine...');
        // Unload the model to free VRAM
        await engine.unload();
        engine = null;
        currentModel = null;
        engineStatus = 'unavailable';
        console.log('[Elu offscreen] Engine destroyed successfully');
    } catch (err) {
        console.error('[Elu offscreen] Error destroying engine:', err);
        // Force clear even if there's an error
        engine = null;
        currentModel = null;
        engineStatus = 'unavailable';
    }
}

/**
 * Initialise (or return the existing) WebLLM engine.
 * Checks for WebGPU support first, then retries with exponential backoff.
 * 
 * @param {string} forceModel - Optional model ID to force load (for reloading)
 */
async function initEngine(forceModel = null) {
    const modelToLoad = forceModel || DEFAULT_MODEL;
    
    // If we already have the right model loaded, return it
    if (engine && engineStatus === 'ready' && currentModel === modelToLoad) {
        return engine;
    }
    
    // If we're loading a different model, destroy the old one first
    if (engine && currentModel !== modelToLoad) {
        await destroyEngine();
    }
    
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
    currentModel = modelToLoad;

    console.log(`[Elu offscreen] Initializing model: ${modelToLoad}`);

    initPromise = (async () => {
        let lastError;
        for (let attempt = 0; attempt < INIT_MAX_ATTEMPTS; attempt++) {
            try {
                const e = await CreateWebWorkerMLCEngine(
                    new Worker(
                        chrome.runtime.getURL('assets/webllm-worker.js'),
                        { type: 'module' }
                    ),
                    modelToLoad,
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
                    progress: { progress: 1, timeElapsed: 0, text: `Model ready: ${modelToLoad}` }
                }).catch(() => {});
                console.log(`[Elu offscreen] Model loaded successfully: ${modelToLoad}`);
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
        currentModel = null;
        initPromise = null;
        engine = null;
        chrome.runtime.sendMessage({
            action: 'modelProgress',
            progress: { progress: 0, text: 'Model download failed. Click Retry in the popup.' }
        }).catch(() => {});
        throw lastError;
    })();

    const result = await initPromise;
    initPromise = null;
    return result;
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

    console.log('[Elu offscreen] Starting inference...');
    const startTime = Date.now();

    const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
    ];

    const reply = await e.chat.completions.create({
        messages,
        temperature: 0.3,
        max_tokens: 1200,
        stream: false
    });

    const elapsed = Date.now() - startTime;
    console.log(`[Elu offscreen] Inference completed in ${(elapsed / 1000).toFixed(2)}s`);

    return reply.choices[0]?.message?.content?.trim() ?? '';
}

// ─── Message listener ──────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    // Only handle messages explicitly targeting this offscreen document.
    if (message.target !== 'offscreen') return false;

    switch (message.action) {
        case 'initEngine': {
            initEngine(message.model || null)
                .then(() => sendResponse({ success: true }))
                .catch((err) => sendResponse({ success: false, error: err.message }));
            return true; // async
        }

        case 'reloadEngine': {
            const { model } = message;
            if (!model) {
                sendResponse({ success: false, error: 'Model ID is required' });
                return false;
            }
            console.log(`[Elu offscreen] Reloading engine with model: ${model}`);
            
            (async () => {
                try {
                    await destroyEngine();
                    await initEngine(model);
                    sendResponse({ success: true });
                } catch (err) {
                    console.error('[Elu offscreen] Engine reload failed:', err);
                    sendResponse({ success: false, error: err.message });
                }
            })();
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
            sendResponse({ success: true, status: engineStatus, errorReason: engineErrorReason, model: currentModel });
            return false;
        }

        default:
            return false;
    }
});

// ─── Auto-initialise on document load ─────────────────────────────────────
// Start warming up the engine as soon as the offscreen document is created.
// The background script will call initEngine(model) with the correct model;
// this fallback uses the default model in case of direct startup.
initEngine(DEFAULT_MODEL).catch((err) => {
    console.error('[Elu offscreen] Engine init failed:', err);
});
