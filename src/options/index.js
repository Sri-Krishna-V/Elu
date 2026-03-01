
// ─── Onboarding / First-Time Experience ─────────────────────────────────────

const PROFILES = {
    default: {
        fontEnabled: false,
        selectedTheme: 'default',
        lineSpacing: 1.5,
        letterSpacing: 0,
        wordSpacing: 0,
        simplificationLevel: '3',
        focusMode: false,
        activeProfile: 'default'
    },
    dyslexia: {
        fontEnabled: true,
        selectedTheme: 'creamPaper',
        lineSpacing: 2.2,
        letterSpacing: 2.0,
        wordSpacing: 6,
        simplificationLevel: '3',
        focusMode: false,
        activeProfile: 'dyslexia'
    },
    adhd: {
        fontEnabled: false,
        selectedTheme: 'darkMode',
        lineSpacing: 1.8,
        letterSpacing: 0.5,
        wordSpacing: 3,
        simplificationLevel: '5',
        focusMode: false,
        activeProfile: 'adhd'
    },
    lowvision: {
        fontEnabled: false,
        selectedTheme: 'highContrast',
        lineSpacing: 2.5,
        letterSpacing: 1.5,
        wordSpacing: 5,
        simplificationLevel: '3',
        focusMode: false,
        activeProfile: 'lowvision'
    }
};

let selectedProfile = 'default';
let currentStep = 1;
const TOTAL_STEPS = 3;

/** Show the given step number and hide all others. */
function goToStep(stepNum) {
    for (let i = 1; i <= TOTAL_STEPS; i++) {
        const el = document.getElementById('step-' + i);
        if (el) el.classList.toggle('active', i === stepNum);
    }
    currentStep = stepNum;
}

/** Mark a profile card as selected. */
function selectProfile(profileName) {
    document.querySelectorAll('.profile-card').forEach(card => {
        card.classList.toggle('selected', card.dataset.profile === profileName);
    });
    selectedProfile = profileName;
}

/** Save profile + mark onboarding complete, then close tab. */
function finishOnboarding() {
    const btn = document.getElementById('finishBtn');
    if (btn) {
        btn.textContent = 'Saving…';
        btn.disabled = true;
    }

    const profile = PROFILES[selectedProfile] || PROFILES.default;
    const modelSelect = document.getElementById('aiModelSelect');
    const selectedModel = modelSelect ? modelSelect.value : 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC';
    
    chrome.storage.sync.set({ ...profile, onboardingComplete: true, selectedModel }, () => {
        window.close();
    });
}

// ─── Wire up buttons once the DOM is ready ───────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    // Navigation buttons
    document.getElementById('nextBtn1')?.addEventListener('click', () => goToStep(2));
    document.getElementById('backBtn2')?.addEventListener('click', () => goToStep(1));
    document.getElementById('nextBtn2')?.addEventListener('click', () => goToStep(3));
    document.getElementById('backBtn3')?.addEventListener('click', () => goToStep(2));
    document.getElementById('finishBtn')?.addEventListener('click', finishOnboarding);

    // Profile card selection
    document.querySelectorAll('.profile-card').forEach(card => {
        card.addEventListener('click', () => selectProfile(card.dataset.profile));
    });
    
    // Initialize model selector
    const modelSelect = document.getElementById('aiModelSelect');
    if (modelSelect) {
        // Load saved model or default to Qwen
        chrome.storage.sync.get(['selectedModel'], (result) => {
            let model = result.selectedModel;
            // Migrate from old Llama model to default Qwen
            if (!model || model === 'Llama-3.2-1B-Instruct-q4f16_1-MLC') {
                model = 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC';
                chrome.storage.sync.set({ selectedModel: model });
            }
            modelSelect.value = model;
        });
        
        // Handle model changes
        modelSelect.addEventListener('change', (e) => {
            const newModel = e.target.value;
            chrome.storage.sync.set({ selectedModel: newModel }, () => {
                console.log('[Elu Options] Model changed to:', newModel);
                // Notify background to reload engine
                chrome.runtime.sendMessage({ 
                    action: 'modelChanged', 
                    model: newModel 
                });
            });
        });
    }
});
