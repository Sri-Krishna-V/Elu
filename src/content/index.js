import { marked } from 'marked';
import { logger } from '../common/logger.js';
import { applyBionicReading, removeBionicReading } from './bionic.js';
import { handleTTSAction, getTTSState } from './tts.js';
import { initGlossary } from './glossary.js';
import { initChunking, renderChunkedView, goToChunk, toggleBookmark, completeCurrentChunk, exitChunkedView, getProgress } from './smart-chunking.js';
import { activateFocusMode, deactivateFocusMode, toggleFocusMode, isFocusModeActive, updateFocusConfig } from './focus-mode.js';
import { getFocusConfig, DEFAULT_FOCUS_CONFIG } from '../common/models/focus-config.js';
import './content.css';
import './chunking.css';

// WebLLM inference is now handled by the offscreen document via the
// background service-worker.  No local AI session is needed here.

// Theme definitions
const themes = {
    default: {
        backgroundColor: '',
        textColor: '',
    },
    highContrast: {
        backgroundColor: '#FFFFFF',
        textColor: '#000000',
    },
    highContrastAlt: {
        backgroundColor: '#000000',
        textColor: '#FFFFFF',
    },
    darkMode: {
        backgroundColor: '#121212',
        textColor: '#E0E0E0',
    },
    sepia: {
        backgroundColor: '#F5E9D5',
        textColor: '#5B4636',
    },
    lowBlueLight: {
        backgroundColor: '#FFF8E1',
        textColor: '#2E2E2E',
    },
    softPastelBlue: {
        backgroundColor: '#E3F2FD',
        textColor: '#0D47A1',
    },
    softPastelGreen: {
        backgroundColor: '#F1FFF0',
        textColor: '#00695C',
    },
    creamPaper: {
        backgroundColor: '#FFFFF0',
        textColor: '#333333',
    },
    grayScale: {
        backgroundColor: '#F5F5F5',
        textColor: '#424242',
    },
    blueLightFilter: {
        backgroundColor: '#FFF3E0',
        textColor: '#4E342E',
    },
    highContrastYellowBlack: {
        backgroundColor: '#000000',
        textColor: '#FFFF00',
    },
    highContrastBlackYellow: {
        backgroundColor: '#FFFF00',
        textColor: '#000000',
    },
};

// ─── Reading-level & system-prompt helpers ─────────────────────────────────

async function getReadingLevel() {
    return new Promise((resolve) => {
        chrome.storage.sync.get(['readingLevel', 'simplificationLevel'], function (result) {
            if (result.simplificationLevel) {
                resolve(result.simplificationLevel.toString());
                return;
            }
            const level = result.readingLevel ? result.readingLevel.toString() : '3';
            resolve(level);
        });
    });
}

/**
 * Fetches system prompts from the background, selects the one that matches
 * the user's current optimizeFor + readingLevel settings, and returns it.
 *
 * @returns {Promise<string>}
 */
async function resolveSystemPrompt() {
    const prompts = await loadSystemPrompts();
    const readingLevel = await getReadingLevel();
    const optimizeFor = await new Promise((resolve) => {
        chrome.storage.sync.get(['optimizeFor'], (result) => {
            resolve(result.optimizeFor || 'textClarity');
        });
    });
    const prompt = prompts?.[optimizeFor]?.[readingLevel];
    if (!prompt) throw new Error(`No system prompt found for ${optimizeFor} / level ${readingLevel}`);
    return prompt;
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Handle message asynchronously but keep connection open
    (async () => {
        console.log("Received action:", request.action);
        switch (request.action) {
            case "simplify":
                console.log('%c🚀 SIMPLIFY ACTION STARTED', 'background: #7B2CBF; color: white; font-size: 16px; padding: 8px; font-weight: bold;');
                console.log('Current page URL:', window.location.href);
                console.log('Document ready state:', document.readyState);
                
                if (isSimplifying) {
                    showEluNotification('Simplification already in progress…', '⏳');
                    sendResponse({ success: false, error: 'Simplification already in progress' });
                    break;
                }
                isSimplifying = true;
                try {
                    console.log('Finding main content element...');

                    // Try to find the main content using various selectors, including Straits Times specific ones
                    const mainContent = document.querySelector([
                        'main',
                        'article',
                        '.content',
                        '.post',
                        '#content',
                        '#main',
                        'div[role="main"]',
                        '.article-content',
                        '.article-body',
                        '.story-body',
                        '.article-text',
                        '.story-content',
                        '[itemprop="articleBody"]',
                        // Straits Times specific selectors
                        '.paid-premium-content',
                        '.str-story-body',
                        '.str-article-content',
                        '#story-body',
                        '.story-content'
                    ].join(', '));

                    // Log the found element and its hierarchy
                    if (mainContent) {
                        console.log('Main content element details:', {
                            element: mainContent,
                            path: getElementPath(mainContent),
                            parentClasses: mainContent.parentElement?.className,
                            childElements: Array.from(mainContent.children).map(child => ({
                                tag: child.tagName,
                                class: child.className,
                                id: child.id
                            }))
                        });
                    }

                    // Helper function to get element's DOM path
                    function getElementPath(element) {
                        const path = [];
                        while (element && element.nodeType === Node.ELEMENT_NODE) {
                            let selector = element.nodeName.toLowerCase();
                            if (element.id) {
                                selector += '#' + element.id;
                            } else if (element.className) {
                                selector += '.' + Array.from(element.classList).join('.');
                            }
                            path.unshift(selector);
                            element = element.parentNode;
                        }
                        return path.join(' > ');
                    }

                    if (!mainContent) {
                        console.error('Could not find main content element');
                        showEluNotification('No article content detected on this page', '⚠');
                        sendResponse({ success: false, error: 'No readable content found on this page' });
                        break;
                    }

                    // Restore original content if previously simplified
                    const previouslySimplifiedElements = mainContent.querySelectorAll('[data-original-html]');
                    previouslySimplifiedElements.forEach(el => {
                        const originalHTML = el.getAttribute('data-original-html');
                        // Create a temporary container to parse the original HTML
                        const tempDiv = document.createElement('div');
                        tempDiv.innerHTML = originalHTML;
                        const originalElement = tempDiv.firstChild;
                        // Replace the simplified element with the original element
                        el.parentNode.replaceChild(originalElement, el);
                    });

                    console.log('Found main content element:', {
                        tagName: mainContent.tagName,
                        className: mainContent.className,
                        id: mainContent.id
                    });

                    // Helper function to check if element is a header
                    const isHeader = (element) => {
                        return element.tagName.match(/^H[1-6]$/i);
                    };

                    // Helper function to estimate token count (rough approximation)
                    const estimateTokens = (text) => {
                        return text.split(/\s+/).length * 1.3; // Multiply by 1.3 as a safety factor
                    };

                    // Get all content elements (paragraphs, headers, and lists)
                    // More detailed logging of the main content element
                    console.log('Main content structure:', {
                        innerHTML: mainContent.innerHTML.substring(0, 200) + '...',
                        childNodes: mainContent.childNodes.length,
                        children: mainContent.children.length
                    });

                    // Try to find article content with more specific selectors
                    const contentElements = Array.from(mainContent.querySelectorAll([
                        'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'dl',
                        '.article-content p',
                        '.article-body p',
                        '.story-body p',
                        '.article-text p',
                        '.story-content p',
                        '[itemprop="articleBody"] p',
                        '.article p',
                        '.story p'
                    ].join(', ')))
                        .filter(el => {
                            if (isHeader(el)) return true;

                            // Skip elements that are likely metadata
                            const isMetadata =
                                el.closest('.author, .meta, .claps, .likes, .stats, .profile, .bio, header, footer, .premium-box') ||
                                (el.tagName !== 'UL' && el.tagName !== 'OL' && el.tagName !== 'DL' && el.textContent.trim().length < 50) ||
                                /^(By|Published|Updated|Written by|(\d+) min read|(\d+) claps)/i.test(el.textContent.trim());

                            const hasContent = el.textContent.trim().length > 0;

                            // Log skipped elements for debugging
                            if (isMetadata || !hasContent) {
                                console.log('Skipping element:', {
                                    type: el.tagName,
                                    class: el.className,
                                    text: el.textContent.substring(0, 50) + '...',
                                    reason: isMetadata ? 'metadata' : 'no content'
                                });
                            }

                            // Include if it's not metadata and either a list or paragraph/header
                            return !isMetadata && hasContent;
                        });

                    console.log(`Found ${contentElements.length} content elements to process`);

                    if (contentElements.length === 0) {
                        showEluNotification('No article content detected on this page', '⚠');
                        sendResponse({ success: false, error: 'No readable paragraphs found on this page' });
                        break;
                    }

                    // Helper function to check if element is a list
                    const isList = (element) => {
                        return ['UL', 'OL', 'DL'].includes(element.tagName);
                    };

                    // Group elements into chunks
                    const chunks = [];
                    let currentChunk = [];
                    let currentTokenCount = 0;
                    const MAX_TOKENS = 800; // Leave room for prompt text and response

                    for (let i = 0; i < contentElements.length; i++) {
                        const element = contentElements[i];

                        // If we hit a header, list, or the chunk is getting too big, start a new chunk
                        if (isHeader(element) || isList(element) ||
                            (currentChunk.length > 0 &&
                                (currentTokenCount + estimateTokens(element.textContent) > MAX_TOKENS))) {

                            if (currentChunk.length > 0) {
                                chunks.push(currentChunk);
                            }
                            currentChunk = [element];
                            currentTokenCount = estimateTokens(element.textContent);
                        } else {
                            currentChunk.push(element);
                            currentTokenCount += estimateTokens(element.textContent);
                        }
                    }

                    // Add the last chunk if it exists
                    if (currentChunk.length > 0) {
                        chunks.push(currentChunk);
                    }

                    console.log(`Grouped content into ${chunks.length} chunks`);

                    if (chunks.length === 0) {
                        showEluNotification('No article content detected on this page', '⚠');
                        sendResponse({ success: false, error: 'No content chunks could be created' });
                        break;
                    }

                    // Inject simplified-text styles once (not per paragraph)
                    if (!document.getElementById('elu-simplified-styles')) {
                        const simplifiedStyles = document.createElement('style');
                        simplifiedStyles.id = 'elu-simplified-styles';
                        simplifiedStyles.textContent = `
                            .simplified-text {
                                /* Inherits page's default styling */
                            }
                            .original-text-tooltip {
                                position: absolute;
                                max-width: 400px;
                                background-color: rgba(0, 0, 0, 0.8);
                                color: white;
                                padding: 10px;
                                border-radius: 5px;
                                font-size: 14px;
                                line-height: 1.4;
                                z-index: 10000;
                                pointer-events: none;
                                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                            }
                        `;
                        document.head.appendChild(simplifiedStyles);
                    }

                    // Process each chunk
                    let chunkIndex = 0;
                    for (let chunk of chunks) {
                        // Broadcast progress to popup
                        try {
                            chrome.runtime.sendMessage({
                                action: 'simplifyProgress',
                                current: chunkIndex,
                                total: chunks.length
                            });
                        } catch (e) { /* popup may be closed */ }
                        // Log full chunk details before processing
                        console.log('Processing chunk:', {
                            elements: chunk.length,
                            types: chunk.map(el => el.tagName).join(', '),
                            isHeaderOnly: chunk.length === 1 && isHeader(chunk[0])
                        });

                        // Skip chunks that only contain headers
                        if (chunk.length === 1 && isHeader(chunk[0])) {
                            console.log('Skipping header-only chunk');
                            continue;
                        }

                        // Combine paragraph texts in the chunk
                        const chunkText = chunk
                            .filter(el => !isHeader(el))
                            .map(el => el.textContent)
                            .join('\n\n');

                        try {
                            console.log('Attempting to simplify chunk:', {
                                fullText: chunkText,
                                length: chunkText.length,
                                paragraphs: chunkText.split('\n\n').length
                            });

                            // First attempt with original text
                            // Log the exact prompt being sent
                            console.log('Sending prompt to API:', {
                                text: chunkText,
                                length: chunkText.length,
                                wordCount: chunkText.split(/\s+/).length
                            });

                            // Resolve system prompt once before the retry loop.
                            const currentSystemPrompt = await resolveSystemPrompt();
                            let simplifiedText = '';
                            let attempts = 0;
                            const maxAttempts = 3;

                            while (attempts < maxAttempts) {
                                try {
                                    logPrompt(chunkText);

                                    const llmResponse = await sendMessageWithRetry({
                                        action: 'llmInfer',
                                        systemPrompt: currentSystemPrompt,
                                        userPrompt: chunkText
                                    });
                                    if (!llmResponse?.success) {
                                        throw new Error(llmResponse?.error || 'LLM inference failed');
                                    }
                                    simplifiedText = llmResponse.result || '';

                                    // Log the result
                                    console.log('Simplified Result:', simplifiedText.substring(0, 200) + (simplifiedText.length > 200 ? '...' : ''));

                                    if (simplifiedText && simplifiedText.trim().length > 0) {
                                        console.log(`✅ Successfully simplified text on attempt ${attempts + 1}`);
                                        break;
                                    }

                                    console.warn(`Empty response from LLM on attempt ${attempts + 1} — retrying…`);
                                } catch (error) {
                                    console.warn(`❌ LLM error on attempt ${attempts + 1}:`, error.message);
                                    if (attempts === maxAttempts - 1) {
                                        throw error;
                                    }
                                }

                                attempts++;
                                await new Promise(resolve => setTimeout(resolve, 1000 * attempts)); // Longer backoff
                            }

                            if (!simplifiedText || simplifiedText.trim().length === 0) {
                                console.warn('Failed to get valid response after all attempts - keeping original text');
                                continue;
                            }

                            // Sanitize and validate AI output
                            simplifiedText = sanitizeAIOutput(simplifiedText);
                            const validationError = validateSimplifiedOutput(chunkText, simplifiedText);
                            if (validationError) {
                                console.warn(`AI output failed validation (${validationError}) — keeping original text`);
                                continue;
                            }

                            // Split simplified text back into paragraphs and ensure we have the right number
                            const simplifiedParagraphs = simplifiedText.split('\n\n');
                            const originalParagraphs = chunk.filter(el => !isHeader(el));

                            console.log('Paragraph replacement:', {
                                originalCount: originalParagraphs.length,
                                simplifiedCount: simplifiedParagraphs.length,
                                originalTexts: originalParagraphs.map(p => p.textContent.substring(0, 50) + '...'),
                                simplifiedTexts: simplifiedParagraphs.map(p => p.substring(0, 50) + '...')
                            });

                            // Handle paragraph count mismatch
                            if (simplifiedParagraphs.length !== originalParagraphs.length) {
                                console.log(`Mismatch in paragraph counts: original=${originalParagraphs.length}, simplified=${simplifiedParagraphs.length}`);

                                // If we got more simplified paragraphs than original, trim the excess
                                if (simplifiedParagraphs.length > originalParagraphs.length) {
                                    simplifiedParagraphs.length = originalParagraphs.length;
                                }
                                // If we got fewer simplified paragraphs, hide (don't remove) the extras so undo can restore them
                                if (simplifiedParagraphs.length < originalParagraphs.length) {
                                    for (let i = simplifiedParagraphs.length; i < originalParagraphs.length; i++) {
                                        originalParagraphs[i].setAttribute('data-original-html', originalParagraphs[i].outerHTML);
                                        originalParagraphs[i].setAttribute('data-elu-hidden', 'true');
                                        originalParagraphs[i].style.display = 'none';
                                    }
                                    originalParagraphs.length = simplifiedParagraphs.length;
                                }
                            }

                            // Replace remaining original paragraphs with simplified versions
                            originalParagraphs.forEach((p, index) => {
                                let newElement;
                                if (isList(p)) {
                                    // Create the same type of list
                                    newElement = document.createElement(p.tagName);

                                    // Get original list items for comparison
                                    const originalItems = Array.from(p.children);

                                    // Split the simplified text into list items
                                    const items = simplifiedParagraphs[index].split('\n').filter(item => item.trim());

                                    // Create new list items
                                    items.forEach((item, idx) => {
                                        const li = document.createElement(p.tagName === 'DL' ? 'dt' : 'li');
                                        li.textContent = item.replace(/^[•\-*]\s*/, ''); // Remove bullet points if present

                                        // Preserve any nested lists from original
                                        if (originalItems[idx]) {
                                            const nestedLists = originalItems[idx].querySelectorAll('ul, ol, dl');
                                            nestedLists.forEach(nested => {
                                                li.appendChild(nested.cloneNode(true));
                                            });
                                        }

                                        newElement.appendChild(li);
                                    });
                                } else {
                                    // Handle regular paragraphs
                                    newElement = document.createElement('p');
                                    // Use marked to parse markdown
                                    newElement.innerHTML = marked.parse(sanitizeAIOutput(simplifiedParagraphs[index]), {
                                        breaks: true,
                                        gfm: true,
                                        headerIds: false,
                                        mangle: false
                                    });
                                }

                                newElement.classList.add('simplified-text');
                                // Store the original HTML content if it's not already stored
                                if (!p.hasAttribute('data-original-html')) {
                                    newElement.setAttribute('data-original-html', p.outerHTML);
                                } else {
                                    // Preserve the original HTML attribute
                                    newElement.setAttribute('data-original-html', p.getAttribute('data-original-html'));
                                }
                                // Keep original text for hover functionality
                                newElement.setAttribute('data-original-text', p.textContent);
                                
                                // Verify parent exists before replacing
                                if (!p.parentNode) {
                                    console.error('❌ Cannot replace element - no parent node found!', p);
                                    return;
                                }
                                
                                console.log('✅ REPLACING DOM element:', {
                                    originalElement: p,
                                    newElement: newElement,
                                    parentTag: p.parentNode.tagName,
                                    isConnected: p.isConnected,
                                    newText: newElement.textContent.substring(0, 100)
                                });
                                
                                p.parentNode.replaceChild(newElement, p);
                                
                                // Verify replacement worked
                                if (newElement.isConnected) {
                                    console.log('%c✨ DOM REPLACEMENT SUCCESSFUL!', 'background: green; color: white; font-size: 14px; padding: 4px; font-weight: bold;');
                                } else {
                                    console.error('%c❌ DOM REPLACEMENT FAILED - element not connected!', 'background: red; color: white; font-size: 14px; padding: 4px; font-weight: bold;');
                                }

                                // Store reference to simplified elements
                                simplifiedElements = simplifiedElements.filter(el => el !== p);
                                simplifiedElements.push(newElement);

                                // Add hover event listeners if enabled
                                if (hoverEnabled) {
                                    newElement.addEventListener('mouseenter', showOriginalText);
                                    newElement.addEventListener('mouseleave', hideOriginalText);
                                }

                                console.log(`Replaced paragraph ${index + 1}/${originalParagraphs.length}:`, {
                                    original: p.textContent.substring(0, 50) + '...',
                                    simplified: newElement.textContent.substring(0, 50) + '...'
                                });

                                // Check if OpenDyslexic is enabled and apply it
                                chrome.storage.sync.get('fontEnabled', function (result) {
                                    if (result.fontEnabled) {
                                        toggleOpenDyslexicFont(true);
                                    }
                                });
                            });
                            console.log('Successfully replaced paragraph with simplified version');
                        } catch (error) {
                            console.error('Error simplifying paragraph:', error, {
                                text: chunkText.substring(0, 100) + '...'
                            });
                        }
                        chunkIndex++;
                    }

                    // Add visual feedback (retro pastel theme)
                    showEluNotification('Text simplified ✓');

                    // Only send success response after everything is complete
                    sendResponse({ success: true });
                } catch (error) {
                    console.error('Error simplifying content:', error);
                    sendResponse({ success: false, error: error.message });
                } finally {
                    isSimplifying = false;
                }
                break;


            case "toggleFont":
                console.log("Toggling OpenDyslexic font...");
                fontEnabled = request.enabled;
                toggleOpenDyslexicFont(fontEnabled);
                break;

            case "applyTheme":
                console.log("Applying theme:", request.theme);
                applyTheme(request.theme);
                sendResponse({ success: true });
                break;

            case "getFontState":
                sendResponse({ fontEnabled: fontEnabled });
                break;

            case "adjustSpacing":
                const { lineSpacing, letterSpacing, wordSpacing } = request;
                applySpacingAdjustments(lineSpacing, letterSpacing, wordSpacing);
                sendResponse({ success: true });
                break;

            case "toggleHover":
                console.log("Toggling hover to show original text...");
                hoverEnabled = request.enabled;
                if (hoverEnabled) {
                    enableHoverFeature();
                } else {
                    disableHoverFeature();
                }
                break;

            case "getHoverState":
                sendResponse({ hoverEnabled: hoverEnabled });
                break;

            case "tts-play":
            case "tts-pause":
            case "tts-resume":
            case "tts-stop":
                handleTTSAction(request.action);
                sendResponse({ success: true });
                break;

            case "tts-set-speed":
                handleTTSAction('tts-set-speed', { speed: request.speed });
                sendResponse({ success: true });
                break;

            case "tts-set-voice":
                handleTTSAction('tts-set-voice', { voiceName: request.voiceName });
                sendResponse({ success: true });
                break;

            case "getTTSState":
                sendResponse({ state: getTTSState() });
                break;

            case "toggleBionic":
                console.log("Toggling Bionic Reading...", request.enabled);
                if (request.enabled) {
                    applyBionicReading();
                } else {
                    removeBionicReading();
                }
                sendResponse({ success: true });
                break;

            // Smart Chunking actions
            case "chunk-start":
                try {
                    const result = await initChunking();
                    if (result) {
                        renderChunkedView();
                        sendResponse({ success: true, progress: result.progress, totalChunks: result.chunks.length });
                    } else {
                        sendResponse({ success: false, error: 'Could not find content to chunk' });
                    }
                } catch (error) {
                    console.error('Error starting chunking:', error);
                    sendResponse({ success: false, error: error.message });
                }
                break;

            case "chunk-navigate":
                goToChunk(request.index);
                sendResponse({ success: true });
                break;

            case "chunk-bookmark":
                toggleBookmark();
                sendResponse({ success: true });
                break;

            case "chunk-complete":
                completeCurrentChunk();
                sendResponse({ success: true });
                break;

            case "chunk-exit":
                exitChunkedView();
                sendResponse({ success: true });
                break;

            case "chunk-get-progress":
                sendResponse({ success: true, progress: getProgress() });
                break;

            // Focus Mode actions
            case "focus-activate":
                try {
                    const focusConfig = request.config || await getFocusConfig();
                    await activateFocusMode(focusConfig);
                    sendResponse({ success: true });
                } catch (error) {
                    console.error('Error activating focus mode:', error);
                    sendResponse({ success: false, error: error.message });
                }
                break;

            case "focus-deactivate":
                deactivateFocusMode();
                sendResponse({ success: true });
                break;

            case "focus-toggle":
                try {
                    const config = request.config || await getFocusConfig();
                    await toggleFocusMode(config);
                    sendResponse({ success: true, isActive: isFocusModeActive() });
                } catch (error) {
                    console.error('Error toggling focus mode:', error);
                    sendResponse({ success: false, error: error.message });
                }
                break;

            case "focus-update":
                updateFocusConfig(request.config);
                sendResponse({ success: true });
                break;

            case "focus-get-state":
                sendResponse({ success: true, isActive: isFocusModeActive() });
                break;

            case "getPageInfo":
                try {
                    const bodyText = document.body.innerText || '';
                    const words = bodyText.split(/\s+/).filter(w => w.length > 0);
                    const wordCount = words.length;
                    const readTime = Math.max(1, Math.round(wordCount / 200));
                    const sentences = bodyText.split(/[.!?]+/).filter(s => s.trim().length > 0);
                    const avgSentenceLen = sentences.length ? wordCount / sentences.length : 0;
                    const avgWordLen = words.length ? words.reduce((sum, w) => sum + w.length, 0) / words.length : 0;
                    let complexity = 'Easy';
                    if (avgSentenceLen > 20 || avgWordLen > 6) complexity = 'Medium';
                    if (avgSentenceLen > 30 || avgWordLen > 7) complexity = 'Hard';
                    sendResponse({ readTime, complexity });
                } catch (err) {
                    console.error('Error computing page info:', err);
                    sendResponse({ readTime: null, complexity: null });
                }
                break;

            case "checkAIStatus":
                try {
                    const aiStatus = await chrome.runtime.sendMessage({ action: 'checkAIStatus' });
                    sendResponse(aiStatus);
                } catch (err) {
                    sendResponse({ status: 'unavailable', message: err.message });
                }
                break;

            case "undoSimplify":
                try {
                    const undoContent = document.querySelector('main, article, .content, .post, #content, #main, div[role="main"]');
                    if (undoContent) {
                        // Restore replaced elements
                        const simplified = undoContent.querySelectorAll('[data-original-html]:not([data-elu-hidden])');
                        simplified.forEach(el => {
                            const originalHTML = el.getAttribute('data-original-html');
                            const tempDiv = document.createElement('div');
                            tempDiv.innerHTML = originalHTML;
                            const originalElement = tempDiv.firstChild;
                            el.parentNode.replaceChild(originalElement, el);
                        });
                        // Restore hidden elements (from paragraph count mismatch)
                        const hidden = undoContent.querySelectorAll('[data-elu-hidden]');
                        hidden.forEach(el => {
                            el.style.display = '';
                            el.removeAttribute('data-elu-hidden');
                            el.removeAttribute('data-original-html');
                        });
                        showEluNotification('Original text restored ✓');
                        sendResponse({ success: true, restored: simplified.length + hidden.length });
                    } else {
                        sendResponse({ success: false, error: 'No content found' });
                    }
                } catch (err) {
                    sendResponse({ success: false, error: err.message });
                }
                break;
        }
        sendResponse({ success: true });
    })();
    return true; // Keep the message channel open for async response
});


// Logging function for prompts
function logPrompt(userPrompt) {
    console.log('[Elu] User Prompt:', userPrompt.substring(0, 200) + (userPrompt.length > 200 ? '...' : ''));
}

/**
 * Sends a message to the background with retry logic that handles
 * service worker restarts (MV3 idle shutdown).
 */
async function sendMessageWithRetry(message, maxAttempts = 3, delays = [500, 1000, 2000]) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            const response = await chrome.runtime.sendMessage(message);
            if (chrome.runtime.lastError) {
                throw new Error(chrome.runtime.lastError.message);
            }
            return response;
        } catch (err) {
            const isDisconnect = /receiving end does not exist|disconnected/i.test(err.message);
            if (!isDisconnect || attempt === maxAttempts - 1) {
                throw err;
            }
            console.warn(`[Elu] Service worker disconnected (attempt ${attempt + 1}), retrying…`);
            await new Promise(r => setTimeout(r, delays[Math.min(attempt, delays.length - 1)]));
        }
    }
}

// ─── AI output validation ──────────────────────────────────────────────────

const STOP_WORDS = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'shall', 'can', 'to', 'of', 'in', 'for',
    'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
    'before', 'after', 'above', 'below', 'between', 'out', 'off', 'over',
    'under', 'again', 'further', 'then', 'once', 'and', 'but', 'or', 'nor',
    'not', 'so', 'yet', 'both', 'each', 'few', 'more', 'most', 'other',
    'some', 'such', 'no', 'only', 'own', 'same', 'than', 'too', 'very',
    'just', 'because', 'if', 'when', 'while', 'that', 'this', 'it', 'its',
    'he', 'she', 'they', 'them', 'we', 'you', 'i', 'my', 'your', 'his',
    'her', 'their', 'our', 'all', 'also', 'about', 'up'
]);

function getContentWords(text) {
    return new Set(
        text.toLowerCase()
            .replace(/[^\w\s]/g, '')
            .split(/\s+/)
            .filter(w => w.length > 2 && !STOP_WORDS.has(w))
    );
}

/**
 * Checks whether AI output is plausible given the original input.
 * Returns null if valid, or a reason string if invalid.
 */
function validateSimplifiedOutput(input, output) {
    const inputLen = input.trim().length;
    const outputLen = output.trim().length;

    // Length ratio guard: reject output that is absurdly long or near-empty
    if (inputLen > 0) {
        const ratio = outputLen / inputLen;
        if (ratio > 3) return 'output_too_long';
        if (ratio < 0.05) return 'output_too_short';
    }

    // Word-level similarity: at least 15% of content words should overlap
    const inputWords = getContentWords(input);
    const outputWords = getContentWords(output);
    if (inputWords.size > 3) {
        let overlap = 0;
        for (const w of inputWords) {
            if (outputWords.has(w)) overlap++;
        }
        const similarity = overlap / inputWords.size;
        if (similarity < 0.15) return 'low_similarity';
    }

    return null;
}

/**
 * Strips dangerous or unexpected patterns from AI output before rendering.
 */
function sanitizeAIOutput(text) {
    return text
        .replace(/```[\s\S]*?```/g, '')      // remove code fences
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
        .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')  // inline event handlers
        .trim();
}

// Module-level prompt cache — avoids a background round-trip on every chunk.
let cachedPrompts = null;

// Load system prompts from background script (cached after first call).
async function loadSystemPrompts() {
    if (cachedPrompts) return cachedPrompts;
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: 'getSystemPrompts' }, (response) => {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
            } else if (response && response.success) {
                cachedPrompts = response.prompts;
                resolve(cachedPrompts);
            } else {
                reject(new Error(response?.error ?? 'Failed to load system prompts'));
            }
        });
    });
}

// Track feature states
let fontEnabled = false;
let hoverEnabled = false;
let simplifiedElements = []; // Array to track simplified elements
let isSimplifying = false; // Flag to track simplification in progress

// Load feature states from storage when script loads
chrome.storage.sync.get(['fontEnabled'], function (result) {
    fontEnabled = result.fontEnabled || false;
    if (fontEnabled) {
        toggleOpenDyslexicFont(true);
    }
});

// Function to toggle OpenDyslexic font
function toggleOpenDyslexicFont(enabled) {
    console.log(`${enabled ? 'Applying' : 'Removing'} OpenDyslexic font...`);

    if (enabled) {
        // Add font-face definition if it doesn't exist
        if (!document.getElementById('opendyslexic-font-face')) {
            const fontFaceStyle = document.createElement('style');
            fontFaceStyle.id = 'opendyslexic-font-face';
            fontFaceStyle.textContent = `
                @font-face {
                    font-family: 'OpenDyslexic';
                    src: url('${chrome.runtime.getURL('fonts/OpenDyslexic-Regular.otf')}') format('opentype');
                    font-weight: normal;
                    font-style: normal;
                    font-display: swap;
                }
            `;
            document.head.appendChild(fontFaceStyle);
        }

        // Create or update style element to apply font to entire page
        let fontStyle = document.getElementById('opendyslexic-font-style');
        if (!fontStyle) {
            fontStyle = document.createElement('style');
            fontStyle.id = 'opendyslexic-font-style';
            document.head.appendChild(fontStyle);
        }

        fontStyle.textContent = `
            body, body * {
                font-family: 'OpenDyslexic', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif !important;
                line-height: 1.5;
                letter-spacing: 0.5px;
                word-spacing: 3px;
            }
        `;
    } else {
        // Remove the font style applied to the entire page
        const fontStyle = document.getElementById('opendyslexic-font-style');
        if (fontStyle) {
            fontStyle.parentNode.removeChild(fontStyle);
        }

        // Optionally remove the font-face definition
        const fontFaceStyle = document.getElementById('opendyslexic-font-face');
        if (fontFaceStyle) {
            fontFaceStyle.parentNode.removeChild(fontFaceStyle);
        }
    }
}

function enableHoverFeature() {
    console.log("Enabling hover feature...");
    simplifiedElements = document.querySelectorAll('.simplified-text');
    simplifiedElements.forEach(el => {
        el.addEventListener('mouseenter', showOriginalText);
        el.addEventListener('mouseleave', hideOriginalText);
    });
}

function disableHoverFeature() {
    console.log("Disabling hover feature...");
    simplifiedElements.forEach(el => {
        el.removeEventListener('mouseenter', showOriginalText);
        el.removeEventListener('mouseleave', hideOriginalText);
    });
}

function showOriginalText(event) {
    const originalText = event.currentTarget.getAttribute('data-original-text');
    if (!originalText) return;

    const tooltip = document.createElement('div');
    tooltip.className = 'original-text-tooltip';
    tooltip.textContent = originalText;
    document.body.appendChild(tooltip);

    const rect = event.currentTarget.getBoundingClientRect();
    tooltip.style.left = `${rect.left + window.scrollX}px`;
    tooltip.style.top = `${rect.top + window.scrollY - tooltip.offsetHeight - 10}px`;

    event.currentTarget._originalTextTooltip = tooltip;
}

function hideOriginalText(event) {
    const tooltip = event.currentTarget._originalTextTooltip;
    if (tooltip) {
        tooltip.remove();
        event.currentTarget._originalTextTooltip = null;
    }
}

// ensureInitialized() removed — AI is now handled by the offscreen document.

// Function to apply spacing adjustments
function applySpacingAdjustments(lineSpacing, letterSpacing, wordSpacing) {
    const existingStyle = document.getElementById('spacing-adjustments-style');
    if (existingStyle) {
        existingStyle.remove();
    }

    const style = document.createElement('style');
    style.id = 'spacing-adjustments-style';
    style.textContent = `
        body, body * {
            line-height: ${lineSpacing} !important;
            letter-spacing: ${letterSpacing}px !important;
            word-spacing: ${wordSpacing}px !important;
        }
    `;
    document.head.appendChild(style);
}

// Function to apply selected theme (scoped to text-bearing elements only)
function applyTheme(themeName) {
    const theme = themes[themeName];
    if (!theme) return;

    const { backgroundColor, textColor } = theme;

    let themeStyle = document.getElementById('theme-style');
    if (!themeStyle) {
        themeStyle = document.createElement('style');
        themeStyle.id = 'theme-style';
        document.head.appendChild(themeStyle);
    }

    // Scope to text-bearing elements only — preserves images, SVGs, buttons, forms, code blocks
    const textSelectors = 'p, h1, h2, h3, h4, h5, h6, li, span:not([class^="elu-"]), a, td, th, blockquote, figcaption, label, dd, dt';

    themeStyle.textContent = `
        html, body {
            background-color: ${backgroundColor} !important;
            color: ${textColor} !important;
        }
        main, article, [role="main"], .content, #content {
            background-color: ${backgroundColor} !important;
        }
        ${textSelectors} {
            color: ${textColor} !important;
        }
        /* Exclude Elu's own injected UI */
        [class^="elu-"], [id^="elu-"] {
            background-color: unset !important;
            color: unset !important;
        }
    `;
}

// Themed in-page notification (retro pastel style)
function showEluNotification(message, icon = '✿') {
    const notification = document.createElement('div');
    notification.textContent = `${icon} ${message}`;
    Object.assign(notification.style, {
        position: 'fixed',
        top: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        background: '#f5efe6',
        color: '#2b2b2b',
        border: '2.5px solid #2b2b2b',
        padding: '12px 24px',
        borderRadius: '12px',
        fontFamily: "'JetBrains Mono', 'IBM Plex Mono', monospace",
        fontSize: '13px',
        fontWeight: '600',
        zIndex: '2147483646',
        boxShadow: '4px 4px 0 #2b2b2b',
        letterSpacing: '0.3px',
        textTransform: 'uppercase',
        animation: 'none',
        opacity: '0',
        transition: 'opacity 0.3s ease, transform 0.3s ease'
    });
    document.body.appendChild(notification);
    // Animate in
    requestAnimationFrame(() => {
        notification.style.opacity = '1';
        notification.style.transform = 'translateX(-50%) translateY(0)';
    });
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(-50%) translateY(-10px)';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}


// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Apply saved theme
    chrome.storage.sync.get(['selectedTheme'], function (result) {
        const selectedTheme = result.selectedTheme || 'default';
        applyTheme(selectedTheme);
    });

    // Load and apply initial spacing settings
    chrome.storage.sync.get(['lineSpacing', 'letterSpacing', 'wordSpacing'], function (result) {
        applySpacingAdjustments(
            result.lineSpacing || 1.5,
            result.letterSpacing || 0,
            result.wordSpacing || 0
        );
    });

    // Initialize Smart Glossary
    initGlossary();
});
