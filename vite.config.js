import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  // Ensure Web Workers bundled by Vite use ES-module format so they can
  // use top-level await and import WebLLM as an ES module.
  worker: {
    format: 'es'
  },
  build: {
    rollupOptions: {
      input: {
        popup:         resolve(__dirname, 'src/popup/index.html'),
        options:       resolve(__dirname, 'src/options/index.html'),
        background:    resolve(__dirname, 'src/background/index.js'),
        content:       resolve(__dirname, 'src/content/index.js'),
        // Offscreen document (hosts the WebLLM engine)
        offscreen:     resolve(__dirname, 'src/offscreen/index.html'),
        // Web Worker that runs inside the offscreen document
        'webllm-worker': resolve(__dirname, 'src/offscreen/webllm-worker.js')
      },
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]'
      }
    },
    outDir: 'dist',
    emptyOutDir: true
  }
});

