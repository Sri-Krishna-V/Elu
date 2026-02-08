
let utterance = null;
let currentParagraphIndex = 0;
let paragraphs = [];
let isPlaying = false;
let isPaused = false;

export function handleTTSAction(action) {
    if (action === 'tts-play') {
        if (isPaused) {
            resumeReading();
        } else {
            startReading();
        }
    } else if (action === 'tts-pause') {
        pauseReading();
    } else if (action === 'tts-resume') {
        resumeReading();
    } else if (action === 'tts-stop') {
        stopReading();
    }
}

function startReading() {
    stopReading(); 
    
    // 1. Try simplified text
    let elements = document.querySelectorAll('.simplified-text');
    
    // 2. Fallback to main content p tags if no simplified text
    if (!elements || elements.length === 0) {
        // Simple heuristic for main content
        const article = document.querySelector('article, main, [role="main"], .content, #content');
        if (article) {
            elements = article.querySelectorAll('h1, h2, h3, p, li');
        } else {
            // Very broad fallback
            elements = document.querySelectorAll('p');
        }
    }
    
    // Filter out empties/hidden
    paragraphs = Array.from(elements).filter(el => {
        return el.textContent.trim().length > 3 && el.offsetParent !== null;
    });
    
    if (paragraphs.length === 0) {
        alert("No text found to read.");
        return;
    }
    
    currentParagraphIndex = 0;
    isPlaying = true;
    isPaused = false;
    
    readNextParagraph();
}

function readNextParagraph() {
    if (!isPlaying) return;
    if (currentParagraphIndex >= paragraphs.length) {
        stopReading();
        return;
    }
    
    const element = paragraphs[currentParagraphIndex];
    const text = element.textContent;
    
    highlightElement(element);
    
    utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    
    utterance.onend = () => {
        unhighlightElement(element);
        currentParagraphIndex++;
        if (isPlaying && !isPaused) {
            readNextParagraph();
        }
    };
    
    utterance.onerror = (e) => {
        console.error("TTS Error:", e);
        // Continue? Or stop?
        unhighlightElement(element);
        currentParagraphIndex++;
        readNextParagraph();
    };
    
    window.speechSynthesis.speak(utterance);
}

function highlightElement(el) {
    el.dataset.originalBg = el.style.backgroundColor;
    el.style.backgroundColor = '#ffeb3b4d'; // Yellow highlight
    el.style.transition = 'background-color 0.3s';
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function unhighlightElement(el) {
    el.style.backgroundColor = el.dataset.originalBg || '';
    delete el.dataset.originalBg;
}

function pauseReading() {
    if (isPlaying) {
        window.speechSynthesis.pause();
        isPaused = true;
    }
}

function resumeReading() {
    if (isPlaying && isPaused) {
        window.speechSynthesis.resume();
        isPaused = false;
    }
}

function stopReading() {
    window.speechSynthesis.cancel();
    isPlaying = false;
    isPaused = false;
    
    // Clean highlights
    paragraphs.forEach(el => {
        if (el.dataset.originalBg !== undefined) {
             unhighlightElement(el);
        }
    });
    paragraphs = [];
    
    try {
        chrome.runtime.sendMessage({ action: 'tts-state-change', state: 'stopped' });
    } catch (e) {
        // Extensions context might be invalid if reloaded
    }
}

export function getTTSState() {
    if (isPaused) return 'paused';
    if (isPlaying) return 'playing';
    return 'stopped';
}
