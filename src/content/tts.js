
let utterance = null;
let currentParagraphIndex = 0;
let paragraphs = [];
let isPlaying = false;
let isPaused = false;
let currentRate = 1.0;
let currentVoiceName = '';

export function handleTTSAction(action, options = {}) {
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
    } else if (action === 'tts-set-speed') {
        currentRate = parseFloat(options.speed) || 1.0;
        // If currently playing, restart at current paragraph with new speed
        if (isPlaying && !isPaused) {
            speechSynthesis.cancel();
            speakParagraph(currentParagraphIndex);
        }
    } else if (action === 'tts-set-voice') {
        currentVoiceName = options.voiceName || '';
        // If currently playing, restart at current paragraph with new voice
        if (isPlaying && !isPaused) {
            speechSynthesis.cancel();
            speakParagraph(currentParagraphIndex);
        }
    }
}

function startReading() {
    const bodyText = document.body.innerText;
    paragraphs = bodyText
        .split(/\n\n+/)
        .map(p => p.trim())
        .filter(p => p.length > 20);

    if (paragraphs.length === 0) return;

    currentParagraphIndex = 0;
    isPlaying = true;
    isPaused = false;
    speakParagraph(currentParagraphIndex);
}

function speakParagraph(index) {
    if (index >= paragraphs.length) {
        stopReading();
        return;
    }

    utterance = new SpeechSynthesisUtterance(paragraphs[index]);
    utterance.rate = currentRate;
    utterance.pitch = 1;

    // Set voice if specified
    if (currentVoiceName) {
        const voices = speechSynthesis.getVoices();
        const voice = voices.find(v => v.name === currentVoiceName);
        if (voice) utterance.voice = voice;
    }

    utterance.onend = () => {
        currentParagraphIndex++;
        if (currentParagraphIndex < paragraphs.length) {
            broadcastProgress();
            speakParagraph(currentParagraphIndex);
        } else {
            stopReading();
        }
    };

    utterance.onstart = () => {
        broadcastProgress();
    };

    speechSynthesis.speak(utterance);
}

function pauseReading() {
    if (speechSynthesis.speaking) {
        speechSynthesis.pause();
        isPaused = true;
        isPlaying = true;
    }
}

function resumeReading() {
    if (isPaused) {
        speechSynthesis.resume();
        isPaused = false;
        isPlaying = true;
    }
}

function stopReading() {
    speechSynthesis.cancel();
    isPlaying = false;
    isPaused = false;
    currentParagraphIndex = 0;
    utterance = null;
    broadcastProgress();
}

function broadcastProgress() {
    try {
        chrome.runtime.sendMessage({
            action: 'ttsProgress',
            current: currentParagraphIndex,
            total: paragraphs.length,
            isPlaying,
            isPaused
        });
    } catch (e) {
        // Popup may not be open
    }
}

export function getTTSState() {
    return {
        isPlaying,
        isPaused,
        current: currentParagraphIndex,
        total: paragraphs.length,
        rate: currentRate,
        voiceName: currentVoiceName
    };
}
