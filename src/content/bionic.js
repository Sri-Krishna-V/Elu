import { extractArticleElement } from '../common/content-extractor.js';

export function applyBionicReading(rootElement) {
    if (!rootElement) rootElement = extractArticleElement();

    const walker = document.createTreeWalker(
        rootElement,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode: (node) => {
                // Skip if already processed or inside specific tags
                if (node.parentElement.classList.contains('bionic-processed') ||
                    ['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'NOSCRIPT', 'CODE', 'PRE'].includes(node.parentElement.tagName) ||
                    node.parentElement.isContentEditable) {
                    return NodeFilter.FILTER_REJECT;
                }
                // Skip whitespace only
                if (!node.textContent.trim()) return NodeFilter.FILTER_REJECT;
                
                return NodeFilter.FILTER_ACCEPT;
            }
        }
    );

    const nodesToProcess = [];
    while (walker.nextNode()) {
        nodesToProcess.push(walker.currentNode);
    }

    nodesToProcess.forEach(node => {
        const text = node.textContent;
        // Split by whitespace but keep delimiters to preserve spacing
        const parts = text.split(/(\s+)/); 
        
        const fragment = document.createDocumentFragment();
        
        parts.forEach(part => {
             // If it's whitespace, just append
            if (/^\s+$/.test(part)) {
                fragment.appendChild(document.createTextNode(part));
                return;
            }
            
            // Process word
            const word = part;
            const len = word.length;
            
            // Simple logic: bold first half
            // For very short words, bold 1 char?
            let boldLen = 0;
            if (len === 1) boldLen = 1;
            else if (len <= 3) boldLen = 1;
            else boldLen = Math.ceil(len / 2);

            const boldPart = word.substring(0, boldLen);
            const normalPart = word.substring(boldLen);
            
            const b = document.createElement('b');
            b.textContent = boldPart;
            // Use inline style to ensure it overrides defaults, or rely on css class.
            // Using a class allows user customization later.
            b.className = 'bionic-highlight'; 
            b.style.fontWeight = '700'; 
            
            fragment.appendChild(b);
            fragment.appendChild(document.createTextNode(normalPart));
        });
        
        const wrapper = document.createElement('span');
        wrapper.className = 'bionic-processed';
        wrapper.appendChild(fragment);
        
        node.replaceWith(wrapper);
    });
}

export function removeBionicReading() {
    const processed = document.querySelectorAll('.bionic-processed');
    processed.forEach(span => {
        const text = span.textContent;
        const textNode = document.createTextNode(text);
        span.replaceWith(textNode);
    });
    document.body.normalize(); // Merge adjacent text nodes
}
