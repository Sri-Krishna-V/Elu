
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
    chrome.storage.sync.set({ ...profile, onboardingComplete: true }, () => {
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
});
