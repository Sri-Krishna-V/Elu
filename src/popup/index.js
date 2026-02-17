import { simplificationLevelsConfig } from '../common/config.js';

function initializePopup() {
    // Restore selected simplification level and font settings
    chrome.storage.sync.get(['simplificationLevel', 'optimizeFor', 'fontEnabled'], function (result) {
        const level = result.simplificationLevel || '3'; // Default to '3' for "Mid"
        const button = document.querySelector(`.simplification-button[data-level="${level}"]`);
        if (button) {
            document.querySelectorAll('.simplification-button').forEach(btn => btn.classList.remove('selected'));
            button.classList.add('selected');
        }

        // Restore optimize for selection
        document.getElementById('optimizeSelector').value = result.optimizeFor || 'general';

        // Restore font toggle state
        document.getElementById('fontToggle').checked = result.fontEnabled || false;
    });


    // Restore theme, toggle and slider states
    chrome.storage.sync.get(['selectedTheme'], function (result) {
        const theme = result.selectedTheme || 'default';
        document.querySelectorAll('.theme-btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-theme') === theme);
        });
    });
    chrome.storage.sync.get(['lineSpacing', 'letterSpacing', 'wordSpacing'], function (result) {
        document.getElementById('lineSpacing').value = result.lineSpacing || 1.5;
        document.getElementById('lineSpacingValue').textContent = result.lineSpacing || 1.5;

        document.getElementById('letterSpacing').value = result.letterSpacing || 0;
        document.getElementById('letterSpacingValue').textContent = (result.letterSpacing || 0) + 'px';

        document.getElementById('wordSpacing').value = result.wordSpacing || 0;
        document.getElementById('wordSpacingValue').textContent = (result.wordSpacing || 0) + 'px';
    });

    chrome.storage.sync.get(['fontEnabled'], function (result) {
        document.getElementById('fontToggle').checked = result.fontEnabled || false;
    });

    chrome.storage.sync.get(['focusMode'], function (result) {
        document.getElementById('focusModeToggle').checked = result.focusMode || false;
    });

    // Chunk Mode button handler
    const chunkModeBtn = document.getElementById('chunkModeBtn');
    if (chunkModeBtn) {
        chunkModeBtn.addEventListener('click', function () {
            chunkModeBtn.disabled = true;
            chunkModeBtn.querySelector('span').textContent = 'Wait...';

            chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
                if (tabs[0] && /^https?:/.test(tabs[0].url)) {
                    chrome.tabs.sendMessage(tabs[0].id, { action: 'chunk-start' }, function (response) {
                        if (chrome.runtime.lastError) {
                            console.error('Could not start chunk mode:', chrome.runtime.lastError.message);
                            chunkModeBtn.querySelector('span').textContent = 'Error!';
                        } else if (response && response.success) {
                            chunkModeBtn.querySelector('span').textContent = 'On!';
                            // Close popup after activating
                            setTimeout(() => window.close(), 500);
                        } else {
                            chunkModeBtn.querySelector('span').textContent = 'No Content';
                        }

                        setTimeout(function () {
                            chunkModeBtn.disabled = false;
                            chunkModeBtn.querySelector('span').textContent = 'Chunk';
                        }, 2000);
                    });
                } else {
                    console.warn('Active tab is not a valid web page.');
                    chunkModeBtn.querySelector('span').textContent = 'Invalid Page';
                    setTimeout(function () {
                        chunkModeBtn.disabled = false;
                        chunkModeBtn.querySelector('span').textContent = 'Chunk';
                    }, 2000);
                }
            });
        });
    }

    // Focus Mode button handler
    const focusModeBtn = document.getElementById('focusModeBtn');
    if (focusModeBtn) {
        // Check current focus state
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            if (tabs[0] && /^https?:/.test(tabs[0].url)) {
                chrome.tabs.sendMessage(tabs[0].id, { action: 'focus-get-state' }, function (response) {
                    if (!chrome.runtime.lastError && response && response.isActive) {
                        focusModeBtn.classList.add('active');
                        focusModeBtn.querySelector('span').textContent = 'Exit Focus';
                    }
                });
            }
        });

        focusModeBtn.addEventListener('click', function () {
            focusModeBtn.disabled = true;

            chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
                if (tabs[0] && /^https?:/.test(tabs[0].url)) {
                    chrome.tabs.sendMessage(tabs[0].id, { action: 'focus-toggle' }, function (response) {
                        if (chrome.runtime.lastError) {
                            console.error('Could not toggle focus mode:', chrome.runtime.lastError.message);
                            focusModeBtn.querySelector('span').textContent = 'Error!';
                        } else if (response && response.success) {
                            if (response.isActive) {
                                focusModeBtn.classList.add('active');
                                focusModeBtn.querySelector('span').textContent = 'Exit Focus';
                            } else {
                                focusModeBtn.classList.remove('active');
                                focusModeBtn.querySelector('span').textContent = 'Focus Mode';
                            }
                            // Close popup after toggling
                            setTimeout(() => window.close(), 500);
                        }

                        setTimeout(function () {
                            focusModeBtn.disabled = false;
                        }, 500);
                    });
                } else {
                    console.warn('Active tab is not a valid web page.');
                    focusModeBtn.querySelector('span').textContent = 'Invalid Page';
                    setTimeout(function () {
                        focusModeBtn.disabled = false;
                        focusModeBtn.querySelector('span').textContent = 'Focus Mode';
                    }, 2000);
                }
            });
        });
    }
}

// Get references to the button and its elements
const simplifyButton = document.getElementById('simplifyText');
const simplifyButtonText = document.getElementById('simplifyButtonText');
const loader = document.getElementById('loader');

// Button click handler
simplifyButton.addEventListener('click', function () {
    // Disable the button
    simplifyButton.disabled = true;

    // Update the button text and show loader
    simplifyButtonText.textContent = 'Simplifying Text...';
    loader.style.display = 'inline-block';

    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        if (tabs[0] && /^https?:/.test(tabs[0].url)) {
            chrome.tabs.sendMessage(tabs[0].id, { action: "simplify" }, function (response) {
                if (chrome.runtime.lastError) {
                    console.error("Could not send simplify message:", chrome.runtime.lastError.message);

                    // Re-enable the button and reset text and loader
                    simplifyButton.disabled = false;
                    simplifyButtonText.textContent = 'Simplify Text';
                    loader.style.display = 'none';
                } else {
                    if (response && response.success) {
                        // Simplification succeeded
                        simplifyButtonText.textContent = 'Done!';
                    } else {
                        // Handle error
                        simplifyButtonText.textContent = 'Error!';
                        console.error("Simplification failed:", response.error);
                    }

                    // Hide the loader
                    loader.style.display = 'none';

                    // After a delay, reset the button
                    setTimeout(function () {
                        simplifyButton.disabled = false;
                        simplifyButtonText.textContent = 'Simplify Text';
                    }, 2000);
                }
            });
        } else {
            console.warn("Active tab is not a valid web page.");

            // Re-enable the button and reset text and loader
            simplifyButton.disabled = false;
            simplifyButtonText.textContent = 'Simplify Text';
            loader.style.display = 'none';
        }
    });
});

// Function to generate simplification buttons based on config
function generateSimplificationButtons() {
    const buttonRow = document.getElementById('simplificationButtonRow');
    if (!buttonRow) {
        console.error('Simplification button row element not found');
        return;
    }

    buttonRow.innerHTML = ''; // Clear existing buttons

    // Get configuration
    const levels = simplificationLevelsConfig.levels;
    const labels = levels === 3 ?
        ['Low', 'Mid', 'High'] :
        ['Very Low', 'Low', 'Mid', 'High', 'Very High'];
    const dataLevels = levels === 3 ?
        ['1', '3', '5'] :
        ['1', '2', '3', '4', '5'];

    labels.forEach((label, index) => {
        const button = document.createElement('button');
        button.classList.add('simplification-button');
        button.setAttribute('data-level', dataLevels[index]);
        button.textContent = label;

        if (label === 'Mid') {
            button.classList.add('selected');
        }

        button.addEventListener('click', function () {
            document.querySelectorAll('.simplification-button')
                .forEach(btn => btn.classList.remove('selected'));
            this.classList.add('selected');
            chrome.storage.sync.set({ simplificationLevel: this.getAttribute('data-level') });
        });

        buttonRow.appendChild(button);
    });
}

document.addEventListener('DOMContentLoaded', function () {
    generateSimplificationButtons();
    document.getElementById('mainContent').style.display = 'block';
    initializePopup();

    // ── Populate Page Info Card ──
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        if (tabs[0] && /^https?:/.test(tabs[0].url)) {
            const pageTitle = document.getElementById('pageTitle');
            if (pageTitle) {
                pageTitle.textContent = tabs[0].title || 'Untitled Page';
                pageTitle.title = tabs[0].title || '';
            }
            // Request page analysis from content script
            chrome.tabs.sendMessage(tabs[0].id, { action: 'getPageInfo' }, function (response) {
                if (!chrome.runtime.lastError && response) {
                    if (response.readTime) {
                        const readTimeLabel = document.getElementById('readTimeLabel');
                        if (readTimeLabel) readTimeLabel.textContent = response.readTime + ' min';
                    }
                    if (response.complexity) {
                        const complexityLabel = document.getElementById('complexityLabel');
                        const complexityTag = document.getElementById('complexityTag');
                        if (complexityLabel) complexityLabel.textContent = response.complexity;
                        if (complexityTag) {
                            complexityTag.classList.remove('complexity-easy', 'complexity-medium', 'complexity-hard');
                            complexityTag.classList.add('complexity-' + response.complexity.toLowerCase());
                        }
                    }
                }
            });
        } else {
            const pageTitle = document.getElementById('pageTitle');
            if (pageTitle) pageTitle.textContent = 'Open a webpage to get started';
        }
    });

    // Add help icon click handler
    const helpIcon = document.querySelector('.help-icon');
    const simplificationGuide = document.getElementById('simplificationGuide');

    helpIcon.addEventListener('click', function () {
        simplificationGuide.classList.toggle('expanded');
        const expanded = simplificationGuide.classList.contains('expanded');
        helpIcon.setAttribute('aria-expanded', expanded.toString());
    });

    // Reset to Defaults button handler
    document.getElementById('resetDefaults').addEventListener('click', function () {
        chrome.storage.sync.set({
            fontEnabled: false,
            selectedTheme: 'default',
            lineSpacing: 1.5,
            letterSpacing: 0,
            wordSpacing: 0
        }, function () {
            // Update the UI elements
            document.getElementById('fontToggle').checked = false;
            document.querySelectorAll('.theme-btn').forEach(btn => {
                btn.classList.toggle('active', btn.getAttribute('data-theme') === 'default');
            });

            document.getElementById('lineSpacing').value = 1.5;
            document.getElementById('lineSpacingValue').textContent = '1.5';

            document.getElementById('letterSpacing').value = 0;
            document.getElementById('letterSpacingValue').textContent = '0px';

            document.getElementById('wordSpacing').value = 0;
            document.getElementById('wordSpacingValue').textContent = '0px';

            // Apply defaults to the current tab
            chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
                if (tabs[0] && /^https?:/.test(tabs[0].url)) {
                    // Reset font
                    chrome.tabs.sendMessage(tabs[0].id, {
                        action: 'toggleFont',
                        enabled: false
                    }, function () { if (chrome.runtime.lastError) console.warn(chrome.runtime.lastError.message); });

                    // Reset theme
                    chrome.tabs.sendMessage(tabs[0].id, {
                        action: 'applyTheme',
                        theme: 'default'
                    }, function () { if (chrome.runtime.lastError) console.warn(chrome.runtime.lastError.message); });

                    // Reset spacing
                    chrome.tabs.sendMessage(tabs[0].id, {
                        action: 'adjustSpacing',
                        lineSpacing: 1.5,
                        letterSpacing: 0,
                        wordSpacing: 0
                    }, function () { if (chrome.runtime.lastError) console.warn(chrome.runtime.lastError.message); });
                }
            });

            // Show confirmation message
            const statusMessage = document.createElement('div');
            statusMessage.textContent = 'Settings have been reset to defaults.';
            statusMessage.style.color = '#27ae60';
            statusMessage.style.marginTop = '10px';
            document.querySelector('.container').appendChild(statusMessage);
            setTimeout(() => statusMessage.remove(), 3000);
        });
    });

    // Settings navigation
    const settingsButton = document.querySelector('.settings-button');
    const backButton = document.querySelector('.back-button');
    const mainContent = document.getElementById('mainContent');
    const settingsPage = document.getElementById('settingsPage');

    settingsButton.addEventListener('click', function () {
        mainContent.style.display = 'none';
        settingsPage.style.display = 'block';
    });

    backButton.addEventListener('click', function () {
        settingsPage.style.display = 'none';
        mainContent.style.display = 'block';
    });

    // Handle optimize for dropdown changes and help icon
    document.getElementById('optimizeSelector').addEventListener('change', function (e) {
        chrome.storage.sync.set({ optimizeFor: e.target.value });
    });

    const helpIconOptimize = document.getElementById('helpIconOptimize');
    const optimizeGuide = document.getElementById('optimizeGuide');

    if (helpIconOptimize && optimizeGuide) {
        helpIconOptimize.addEventListener('click', function () {
            optimizeGuide.classList.toggle('expanded');
            const expanded = optimizeGuide.classList.contains('expanded');
            helpIconOptimize.setAttribute('aria-expanded', expanded.toString());
        });
    }



    // OpenDyslexic font toggle handler
    const fontToggle = document.getElementById('fontToggle');

    // Request current font state when popup opens
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        if (tabs[0] && /^https?:/.test(tabs[0].url)) {
            chrome.tabs.sendMessage(tabs[0].id, { action: 'getFontState' }, function (response) {
                if (chrome.runtime.lastError) {
                    console.error("Could not get font state:", chrome.runtime.lastError.message);
                    fontToggle.checked = false; // Default to unchecked
                } else if (response && response.fontEnabled !== undefined) {
                    fontToggle.checked = response.fontEnabled;
                }
            });
        } else {
            fontToggle.checked = false; // Default to unchecked on non-web pages
        }
    });

    fontToggle.addEventListener('change', function (e) {
        const enabled = e.target.checked;

        // Save preference
        chrome.storage.sync.set({ fontEnabled: enabled });

        // Apply to current tab
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            if (tabs[0] && /^https?:/.test(tabs[0].url)) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    action: 'toggleFont',
                    enabled: enabled
                }, function (response) {
                    if (chrome.runtime.lastError) {
                        console.error('Could not toggle font:', chrome.runtime.lastError.message);
                    }
                });
            }
        });
    });

    // Focus Mode (Bionic) Toggle
    const focusModeToggle = document.getElementById('focusModeToggle');
    if (focusModeToggle) {
        focusModeToggle.addEventListener('change', function (e) {
            const enabled = e.target.checked;
            chrome.storage.sync.set({ focusMode: enabled });
            chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
                if (tabs[0] && /^https?:/.test(tabs[0].url)) {
                    chrome.tabs.sendMessage(tabs[0].id, {
                        action: "toggleBionic",
                        enabled: enabled
                    }, function () {
                        if (chrome.runtime.lastError) {
                            console.warn('Could not toggle bionic:', chrome.runtime.lastError.message);
                        }
                    });
                }
            });
        });
    }
    // Check TTS State
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        if (tabs[0] && /^https?:/.test(tabs[0].url)) {
            chrome.tabs.sendMessage(tabs[0].id, { action: "getTTSState" }, function (response) {
                if (!chrome.runtime.lastError && response && response.state) {
                    updateTTSControls(response.state);
                }
            });
        }
    });
    // TTS Controls
    const ttsPlay = document.getElementById('ttsPlay');
    const ttsPause = document.getElementById('ttsPause');
    const ttsResume = document.getElementById('ttsResume');
    const ttsStop = document.getElementById('ttsStop');

    function updateTTSControls(state) {
        if (!ttsPlay) return;
        ttsPlay.style.display = state === 'stopped' ? 'flex' : 'none';
        ttsPause.style.display = state === 'playing' ? 'flex' : 'none';
        ttsResume.style.display = state === 'paused' ? 'flex' : 'none';
    }

    if (ttsPlay) {
        ttsPlay.addEventListener('click', () => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0] && /^https?:/.test(tabs[0].url)) {
                    chrome.tabs.sendMessage(tabs[0].id, { action: 'tts-play' }, function () {
                        if (chrome.runtime.lastError) console.warn(chrome.runtime.lastError.message);
                    });
                }
                updateTTSControls('playing');
            });
        });
    }

    if (ttsPause) {
        ttsPause.addEventListener('click', () => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0] && /^https?:/.test(tabs[0].url)) {
                    chrome.tabs.sendMessage(tabs[0].id, { action: 'tts-pause' }, function () {
                        if (chrome.runtime.lastError) console.warn(chrome.runtime.lastError.message);
                    });
                }
                updateTTSControls('paused');
            });
        });
    }

    if (ttsResume) {
        ttsResume.addEventListener('click', () => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0] && /^https?:/.test(tabs[0].url)) {
                    chrome.tabs.sendMessage(tabs[0].id, { action: 'tts-resume' }, function () {
                        if (chrome.runtime.lastError) console.warn(chrome.runtime.lastError.message);
                    });
                }
                updateTTSControls('playing');
            });
        });
    }

    if (ttsStop) {
        ttsStop.addEventListener('click', () => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0] && /^https?:/.test(tabs[0].url)) {
                    chrome.tabs.sendMessage(tabs[0].id, { action: 'tts-stop' }, function () {
                        if (chrome.runtime.lastError) console.warn(chrome.runtime.lastError.message);
                    });
                }
                updateTTSControls('stopped');
            });
        });
    }

    // Listen for TTS state updates from content script
    chrome.runtime.onMessage.addListener((message) => {
        if (message.action === 'tts-state-change') {
            updateTTSControls(message.state);
        }
    });

    // Spacing adjustment handlers
    function debounce(func, wait) {
        let timeout;
        return function (...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    function applySpacingAdjustments() {
        const lineSpacing = document.getElementById('lineSpacing').value;
        const letterSpacing = document.getElementById('letterSpacing').value;
        const wordSpacing = document.getElementById('wordSpacing').value;

        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            if (tabs[0] && /^https?:/.test(tabs[0].url)) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    action: 'adjustSpacing',
                    lineSpacing: lineSpacing,
                    letterSpacing: letterSpacing,
                    wordSpacing: wordSpacing
                }, function (response) {
                    if (chrome.runtime.lastError) {
                        console.error('Could not adjust spacing:', chrome.runtime.lastError.message);
                    }
                });
            }
        });
    }

    const debouncedApplySpacing = debounce(applySpacingAdjustments, 100);

    // Define a debounced function to save settings and apply spacing
    const debouncedSaveAndApplySpacing = debounce(function () {
        const lineSpacing = document.getElementById('lineSpacing').value;
        const letterSpacing = document.getElementById('letterSpacing').value;
        const wordSpacing = document.getElementById('wordSpacing').value;

        // Save the current values to storage
        chrome.storage.sync.set({
            lineSpacing: lineSpacing,
            letterSpacing: letterSpacing,
            wordSpacing: wordSpacing
        });

        // Apply the spacing adjustments
        applySpacingAdjustments();
    }, 200);

    // Line Spacing Slider
    document.getElementById('lineSpacing').addEventListener('input', function (e) {
        const value = e.target.value;
        document.getElementById('lineSpacingValue').textContent = value;
        debouncedSaveAndApplySpacing();
    });

    // Letter Spacing Slider
    document.getElementById('letterSpacing').addEventListener('input', function (e) {
        const value = e.target.value;
        document.getElementById('letterSpacingValue').textContent = value + 'px';
        debouncedSaveAndApplySpacing();
    });

    // Word Spacing Slider
    document.getElementById('wordSpacing').addEventListener('input', function (e) {
        const value = e.target.value;
        document.getElementById('wordSpacingValue').textContent = value + 'px';
        debouncedSaveAndApplySpacing();
    });

    // Theme Buttons Handler
    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            const selectedTheme = this.getAttribute('data-theme');

            // Update active state
            document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');

            // Save the selected theme
            chrome.storage.sync.set({ selectedTheme: selectedTheme });

            // Send message to content script to apply the theme
            chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
                if (tabs[0] && /^https?:/.test(tabs[0].url)) {
                    chrome.tabs.sendMessage(tabs[0].id, {
                        action: 'applyTheme',
                        theme: selectedTheme
                    });
                }
            });
        });
    });

    // Apply initial spacing and theme
    debouncedApplySpacing();
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        if (tabs[0] && /^https?:/.test(tabs[0].url)) {
            chrome.storage.sync.get(['selectedTheme'], function (result) {
                const selectedTheme = result.selectedTheme || 'default';
                chrome.tabs.sendMessage(tabs[0].id, {
                    action: 'applyTheme',
                    theme: selectedTheme
                }, function (response) {
                    if (chrome.runtime.lastError) {
                        console.error('Could not apply theme:', chrome.runtime.lastError.message);
                    }
                });
            });
        } else {
        }
    });
});