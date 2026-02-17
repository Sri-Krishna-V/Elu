/**
 * Focus Mode - Distraction-free reading environment
 * Dims non-essential content, blocks animations, and provides ambient sounds
 */

import { logger } from '../common/logger.js';
import {
    getFocusConfig,
    saveFocusConfig,
    DISTRACTION_SELECTORS,
    MAIN_CONTENT_SELECTORS
} from '../common/models/focus-config.js';

let isActive = false;
let overlay = null;
let timerWidget = null;
let timerInterval = null;
let timeRemaining = 0;
let audioElement = null;
let originalStyles = new Map();

/**
 * Activate focus mode with given configuration
 * @param {import('../common/models/focus-config.js').FocusConfig} config
 */
export async function activateFocusMode(config) {
    if (isActive) {
        deactivateFocusMode();
    }

    logger.info('Activating focus mode with config:', config);
    isActive = true;

    // Save config
    await saveFocusConfig({ ...config, enabled: true });

    // Create the focus overlay
    createFocusOverlay(config.dimLevel);

    // Apply blocking features
    if (config.blockAnimations) {
        blockAnimations();
    }

    if (config.blockVideos) {
        pauseVideos();
    }

    if (config.hideComments) {
        hideElements(DISTRACTION_SELECTORS.comments);
    }

    if (config.hideSidebars) {
        hideElements(DISTRACTION_SELECTORS.sidebars);
    }

    // Hide ads and popups by default
    hideElements(DISTRACTION_SELECTORS.ads);
    hideElements(DISTRACTION_SELECTORS.popups);
    hideElements(DISTRACTION_SELECTORS.related);

    // Start ambient sound if selected
    if (config.ambientSound && config.ambientSound !== 'none') {
        playAmbientSound(config.ambientSound, config.ambientVolume);
    }

    // Start timer if enabled
    if (config.timerEnabled) {
        startTimer(config.timerDuration);
    }

    // Notify user
    showNotification('Focus Mode Activated', '🎯');
}

/**
 * Deactivate focus mode and restore original page
 */
export function deactivateFocusMode() {
    if (!isActive) return;

    logger.info('Deactivating focus mode');
    isActive = false;

    // Remove overlay
    if (overlay) {
        overlay.remove();
        overlay = null;
    }

    // Remove timer widget
    if (timerWidget) {
        timerWidget.remove();
        timerWidget = null;
    }

    // Clear timer
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }

    // Stop audio
    if (audioElement) {
        audioElement.pause();
        audioElement.src = '';
        audioElement = null;
    }

    // Restore hidden elements
    restoreElements();

    // Remove animation blocking
    unblockAnimations();

    // Resume videos
    resumeVideos();

    // Save disabled state
    saveFocusConfig({ enabled: false });

    showNotification('Focus Mode Deactivated', '👋');
}

/**
 * Toggle focus mode
 * @param {import('../common/models/focus-config.js').FocusConfig} config
 */
export async function toggleFocusMode(config) {
    if (isActive) {
        deactivateFocusMode();
    } else {
        await activateFocusMode(config);
    }
}

/**
 * Create focus overlay that dims non-content areas
 * @param {number} dimLevel
 */
function createFocusOverlay(dimLevel) {
    // Find main content
    const mainContent = document.querySelector(MAIN_CONTENT_SELECTORS);
    if (!mainContent) {
        logger.warn('Could not find main content for focus mode');
        return;
    }

    // Create overlay container
    overlay = document.createElement('div');
    overlay.id = 'elu-focus-overlay';
    overlay.innerHTML = `
        <style>
            #elu-focus-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                pointer-events: none;
                z-index: 9998;
            }
            
            .elu-focus-dim {
                position: fixed;
                background: rgba(0, 0, 0, ${dimLevel / 100});
                transition: opacity 0.5s ease;
            }
            
            #elu-focus-spotlight {
                position: absolute;
                background: transparent;
                box-shadow: 0 0 0 100vmax rgba(0, 0, 0, ${dimLevel / 100});
                border-radius: 8px;
                transition: all 0.3s ease;
            }
            
            .elu-focus-exit-btn {
                position: fixed;
                top: 20px;
                right: 20px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                border: none;
                padding: 10px 20px;
                border-radius: 25px;
                cursor: pointer;
                font-family: 'Segoe UI', sans-serif;
                font-size: 14px;
                font-weight: 600;
                pointer-events: auto;
                z-index: 10001;
                box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
                transition: all 0.3s ease;
            }
            
            .elu-focus-exit-btn:hover {
                transform: translateY(-2px);
                box-shadow: 0 6px 20px rgba(102, 126, 234, 0.5);
            }
        </style>
        <div id="elu-focus-spotlight"></div>
        <button class="elu-focus-exit-btn">Exit Focus Mode ✕</button>
    `;

    document.body.appendChild(overlay);

    // Position spotlight over main content
    updateSpotlight(mainContent);

    // Update spotlight on scroll/resize
    window.addEventListener('scroll', () => updateSpotlight(mainContent));
    window.addEventListener('resize', () => updateSpotlight(mainContent));

    // Exit button handler
    overlay.querySelector('.elu-focus-exit-btn').addEventListener('click', deactivateFocusMode);
}

/**
 * Update spotlight position to follow main content
 * @param {HTMLElement} mainContent
 */
function updateSpotlight(mainContent) {
    const spotlight = document.getElementById('elu-focus-spotlight');
    if (!spotlight || !mainContent) return;

    const rect = mainContent.getBoundingClientRect();
    const padding = 20;

    spotlight.style.top = `${rect.top - padding}px`;
    spotlight.style.left = `${rect.left - padding}px`;
    spotlight.style.width = `${rect.width + padding * 2}px`;
    spotlight.style.height = `${rect.height + padding * 2}px`;
}

/**
 * Block CSS animations and transitions
 */
function blockAnimations() {
    const style = document.createElement('style');
    style.id = 'elu-block-animations';
    style.textContent = `
        *, *::before, *::after {
            animation-duration: 0s !important;
            animation-delay: 0s !important;
            transition-duration: 0s !important;
            transition-delay: 0s !important;
        }
    `;
    document.head.appendChild(style);
}

/**
 * Unblock animations
 */
function unblockAnimations() {
    const style = document.getElementById('elu-block-animations');
    if (style) style.remove();
}

/**
 * Pause all video elements
 */
function pauseVideos() {
    const videos = document.querySelectorAll('video');
    videos.forEach(video => {
        if (!video.paused) {
            video.dataset.eluWasPlaying = 'true';
            video.pause();
        }
    });
}

/**
 * Resume previously playing videos
 */
function resumeVideos() {
    const videos = document.querySelectorAll('video[data-elu-was-playing]');
    videos.forEach(video => {
        delete video.dataset.eluWasPlaying;
        video.play().catch(() => { }); // Ignore autoplay restrictions
    });
}

/**
 * Hide elements matching selectors
 * @param {string[]} selectors
 */
function hideElements(selectors) {
    selectors.forEach(selector => {
        try {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => {
                if (!originalStyles.has(el)) {
                    originalStyles.set(el, {
                        display: el.style.display,
                        visibility: el.style.visibility,
                        opacity: el.style.opacity
                    });
                }
                el.style.display = 'none';
                el.dataset.eluHidden = 'true';
            });
        } catch (e) {
            // Invalid selector, skip
        }
    });
}

/**
 * Restore hidden elements
 */
function restoreElements() {
    const hiddenElements = document.querySelectorAll('[data-elu-hidden]');
    hiddenElements.forEach(el => {
        const original = originalStyles.get(el);
        if (original) {
            el.style.display = original.display;
            el.style.visibility = original.visibility;
            el.style.opacity = original.opacity;
        } else {
            el.style.display = '';
        }
        delete el.dataset.eluHidden;
    });
    originalStyles.clear();
}

/**
 * Play ambient sound using Web Audio API (fully offline)
 * @param {'rain'|'cafe'|'forest'|'whitenoise'} sound
 * @param {number} volume
 */
function playAmbientSound(sound, volume) {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const gainNode = audioContext.createGain();
        gainNode.gain.value = (volume / 100) * 0.15;
        gainNode.connect(audioContext.destination);

        let sourceNode;

        if (sound === 'whitenoise') {
            // Pure white noise
            sourceNode = createNoiseSource(audioContext, 'white');
            sourceNode.connect(gainNode);
        } else if (sound === 'rain') {
            // Brown noise + low-pass filter to simulate rain
            sourceNode = createNoiseSource(audioContext, 'brown');
            const lpFilter = audioContext.createBiquadFilter();
            lpFilter.type = 'lowpass';
            lpFilter.frequency.value = 400;
            lpFilter.Q.value = 1.0;
            sourceNode.connect(lpFilter);
            lpFilter.connect(gainNode);
            // Add a second higher layer for rain droplet texture
            const textureNoise = createNoiseSource(audioContext, 'white');
            const hpFilter = audioContext.createBiquadFilter();
            hpFilter.type = 'bandpass';
            hpFilter.frequency.value = 4000;
            hpFilter.Q.value = 0.5;
            const textureGain = audioContext.createGain();
            textureGain.gain.value = 0.03;
            textureNoise.connect(hpFilter);
            hpFilter.connect(textureGain);
            textureGain.connect(audioContext.destination);
            textureNoise.start();
        } else if (sound === 'cafe') {
            // Pink noise (softer, more natural sounding)
            sourceNode = createNoiseSource(audioContext, 'pink');
            sourceNode.connect(gainNode);
        } else if (sound === 'forest') {
            // Layered: brown base + gentle high-frequency chirps via modulated noise
            sourceNode = createNoiseSource(audioContext, 'brown');
            const forestLP = audioContext.createBiquadFilter();
            forestLP.type = 'lowpass';
            forestLP.frequency.value = 800;
            sourceNode.connect(forestLP);
            forestLP.connect(gainNode);
            // Subtle high-tone shimmer
            const shimmer = createNoiseSource(audioContext, 'white');
            const shimmerBP = audioContext.createBiquadFilter();
            shimmerBP.type = 'bandpass';
            shimmerBP.frequency.value = 6000;
            shimmerBP.Q.value = 2.0;
            const shimmerGain = audioContext.createGain();
            shimmerGain.gain.value = 0.02;
            shimmer.connect(shimmerBP);
            shimmerBP.connect(shimmerGain);
            shimmerGain.connect(audioContext.destination);
            shimmer.start();
        }

        if (sourceNode) {
            sourceNode.start();
        }

        // Store reference for cleanup
        audioElement = {
            pause: () => {
                try {
                    audioContext.close();
                } catch (e) { /* already closed */ }
            },
            src: ''
        };

        logger.info(`Playing ${sound} ambient sound (offline)`);
    } catch (e) {
        logger.error('Failed to create ambient sound:', e);
        showNotification('Could not start ambient sound', '🔇');
    }
}

/**
 * Create a noise buffer source (white, brown, or pink)
 * @param {AudioContext} audioContext
 * @param {'white'|'brown'|'pink'} type
 * @returns {AudioBufferSourceNode}
 */
function createNoiseSource(audioContext, type) {
    const bufferSize = 2 * audioContext.sampleRate;
    const noiseBuffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
    const output = noiseBuffer.getChannelData(0);

    if (type === 'white') {
        for (let i = 0; i < bufferSize; i++) {
            output[i] = Math.random() * 2 - 1;
        }
    } else if (type === 'brown') {
        let lastOut = 0;
        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            output[i] = (lastOut + (0.02 * white)) / 1.02;
            lastOut = output[i];
            output[i] *= 3.5; // Compensate for volume loss
        }
    } else if (type === 'pink') {
        // Voss-McCartney approximation
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            b0 = 0.99886 * b0 + white * 0.0555179;
            b1 = 0.99332 * b1 + white * 0.0750759;
            b2 = 0.96900 * b2 + white * 0.1538520;
            b3 = 0.86650 * b3 + white * 0.3104856;
            b4 = 0.55000 * b4 + white * 0.5329522;
            b5 = -0.7616 * b5 - white * 0.0168980;
            output[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
            output[i] *= 0.11; // Normalize
            b6 = white * 0.115926;
        }
    }

    const source = audioContext.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;
    return source;
}


/**
 * Start Pomodoro timer
 * @param {number} minutes
 */
function startTimer(minutes) {
    timeRemaining = minutes * 60;

    // Create timer widget
    timerWidget = document.createElement('div');
    timerWidget.id = 'elu-focus-timer';
    timerWidget.innerHTML = `
        <style>
            #elu-focus-timer {
                position: fixed;
                bottom: 20px;
                right: 20px;
                background: #f5efe6;
                color: #2b2b2b;
                padding: 15px 25px;
                border-radius: 14px;
                border: 2.5px solid #2b2b2b;
                font-family: 'JetBrains Mono', 'IBM Plex Mono', monospace;
                z-index: 10001;
                box-shadow: 4px 4px 0 #2b2b2b;
                display: flex;
                align-items: center;
                gap: 15px;
                pointer-events: auto;
            }
            
            .elu-timer-time {
                font-size: 28px;
                font-weight: 700;
                font-variant-numeric: tabular-nums;
                color: #2b2b2b;
            }
            
            .elu-timer-label {
                font-size: 10px;
                color: #5a5a5a;
                text-transform: uppercase;
                letter-spacing: 1px;
                font-weight: 600;
            }
            
            .elu-timer-btn {
                background: #a8c3bc;
                border: 2px solid #2b2b2b;
                color: #2b2b2b;
                padding: 8px 12px;
                border-radius: 8px;
                cursor: pointer;
                font-size: 14px;
                font-family: 'JetBrains Mono', monospace;
                font-weight: 600;
                transition: all 0.2s ease;
            }
            
            .elu-timer-btn:hover {
                background: #93b3ab;
                transform: translateY(-1px);
            }
        </style>
        <div>
            <div class="elu-timer-label">Focus Time</div>
            <div class="elu-timer-time">${formatTime(timeRemaining)}</div>
        </div>
        <button class="elu-timer-btn" id="elu-timer-pause">⏸️</button>
    `;

    document.body.appendChild(timerWidget);

    // Pause/resume functionality
    let isPaused = false;
    timerWidget.querySelector('#elu-timer-pause').addEventListener('click', (e) => {
        isPaused = !isPaused;
        e.target.textContent = isPaused ? '▶️' : '⏸️';
    });

    // Start countdown
    timerInterval = setInterval(() => {
        if (!isPaused && timeRemaining > 0) {
            timeRemaining--;
            const timeDisplay = timerWidget.querySelector('.elu-timer-time');
            if (timeDisplay) {
                timeDisplay.textContent = formatTime(timeRemaining);
            }

            if (timeRemaining === 0) {
                clearInterval(timerInterval);
                showNotification('Time for a break! 🎉', '⏰');
                // Play a gentle sound or notification
            }
        }
    }, 1000);
}

/**
 * Format seconds as MM:SS
 * @param {number} seconds
 * @returns {string}
 */
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Show a temporary notification
 * @param {string} message
 * @param {string} icon
 */
function showNotification(message, icon) {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 12px 24px;
        border-radius: 25px;
        font-family: 'Segoe UI', sans-serif;
        font-size: 14px;
        font-weight: 500;
        z-index: 10002;
        box-shadow: 0 10px 40px rgba(102, 126, 234, 0.4);
        animation: elu-slide-in 0.5s ease;
    `;
    notification.innerHTML = `${icon} ${message}`;

    // Add animation keyframes
    const style = document.createElement('style');
    style.textContent = `
        @keyframes elu-slide-in {
            from { opacity: 0; transform: translateX(-50%) translateY(-20px); }
            to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
    `;
    document.head.appendChild(style);
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(-50%) translateY(-20px)';
        notification.style.transition = 'all 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

/**
 * Check if focus mode is active
 * @returns {boolean}
 */
export function isFocusModeActive() {
    return isActive;
}

/**
 * Update focus configuration while active
 * @param {Partial<import('../common/models/focus-config.js').FocusConfig>} config
 */
export function updateFocusConfig(config) {
    if (!isActive) return;

    // Handle dim level change
    if (config.dimLevel !== undefined) {
        const spotlight = document.getElementById('elu-focus-spotlight');
        if (spotlight) {
            spotlight.style.boxShadow = `0 0 0 100vmax rgba(0, 0, 0, ${config.dimLevel / 100})`;
        }
    }

    // Handle ambient sound change
    if (config.ambientSound !== undefined) {
        if (audioElement) {
            audioElement.pause();
            audioElement = null;
        }
        if (config.ambientSound !== 'none') {
            playAmbientSound(config.ambientSound, config.ambientVolume || 30);
        }
    }

    // Handle volume change
    if (config.ambientVolume !== undefined && audioElement) {
        // Volume adjustment handled by specific audio implementation
    }

    saveFocusConfig(config);
}
