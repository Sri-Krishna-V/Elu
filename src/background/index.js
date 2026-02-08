import { systemPrompts } from './prompts.js';

chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        console.log('Elu extension installed');
        chrome.storage.sync.remove('readingLevel');
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
