import { systemPrompts } from './prompts.js';

chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        console.log('Elu extension installed');
        chrome.storage.sync.remove('readingLevel');
        // Open onboarding tab on first install
        chrome.tabs.create({
            url: chrome.runtime.getURL('src/options/index.html?onboarding=true')
        });
    }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getSystemPrompts') {
        console.log('Received getSystemPrompts message in background script');
        console.log('systemPrompts:', systemPrompts);
        sendResponse({ success: true, prompts: systemPrompts });
        return true;
    }
    return true;
});

// Handle keyboard shortcut commands
chrome.commands.onCommand.addListener(async (command) => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    const actionMap = {
        'simplify-page': 'simplifyText',
        'toggle-focus': 'toggleFocusMode',
        'toggle-tts': 'tts-play'
    };

    const action = actionMap[command];
    if (action) {
        try {
            await chrome.tabs.sendMessage(tab.id, { action });
        } catch (err) {
            console.log(`Could not send ${action} to tab ${tab.id}:`, err.message);
        }
    }
});
