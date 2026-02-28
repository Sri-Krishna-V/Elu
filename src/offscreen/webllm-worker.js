/**
 * Elu – WebLLM Web Worker (src/offscreen/webllm-worker.js)
 *
 * This script runs inside a dedicated Web Worker spawned by the offscreen
 * document.  It delegates all incoming messages to WebWorkerMLCEngineHandler,
 * which drives the actual WebGPU / WebAssembly inference pipeline provided
 * by @mlc-ai/web-llm.
 *
 * The offscreen document talks to this worker exclusively through the
 * CreateWebWorkerMLCEngine factory — no manual postMessage plumbing needed.
 */

import { WebWorkerMLCEngineHandler } from '@mlc-ai/web-llm';

// Instantiate the handler; it registers its own self.onmessage internally.
const handler = new WebWorkerMLCEngineHandler();

// Relay every message from the offscreen window to the handler.
self.onmessage = (event) => {
    handler.onmessage(event);
};
