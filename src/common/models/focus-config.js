/**
 * Focus Mode Configuration Model
 */

/**
 * @typedef {Object} FocusConfig
 * @property {boolean} enabled - Whether focus mode is active
 * @property {number} dimLevel - Dim level for non-content (0-100)
 * @property {boolean} blockAnimations - Block CSS animations
 * @property {boolean} blockVideos - Pause video elements
 * @property {boolean} hideComments - Hide comment sections
 * @property {boolean} hideSidebars - Hide sidebars
 * @property {'none'|'rain'|'cafe'|'forest'|'whitenoise'} ambientSound - Selected ambient sound
 * @property {number} ambientVolume - Volume level (0-100)
 * @property {boolean} timerEnabled - Whether Pomodoro timer is enabled
 * @property {number} timerDuration - Focus duration in minutes
 * @property {number} breakDuration - Break duration in minutes
 */

/**
 * Default focus configuration
 * @type {FocusConfig}
 */
export const DEFAULT_FOCUS_CONFIG = {
    enabled: false,
    dimLevel: 60,
    blockAnimations: true,
    blockVideos: true,
    hideComments: true,
    hideSidebars: true,
    ambientSound: 'none',
    ambientVolume: 30,
    timerEnabled: false,
    timerDuration: 25,
    breakDuration: 5
};

/**
 * Storage key for focus config
 */
export const FOCUS_CONFIG_KEY = 'elu_focus_config';

/**
 * Get focus config from storage
 * @returns {Promise<FocusConfig>}
 */
export async function getFocusConfig() {
    return new Promise((resolve) => {
        chrome.storage.sync.get([FOCUS_CONFIG_KEY], (result) => {
            resolve({ ...DEFAULT_FOCUS_CONFIG, ...result[FOCUS_CONFIG_KEY] });
        });
    });
}

/**
 * Save focus config to storage
 * @param {Partial<FocusConfig>} config
 * @returns {Promise<void>}
 */
export async function saveFocusConfig(config) {
    return new Promise((resolve) => {
        chrome.storage.sync.get([FOCUS_CONFIG_KEY], (result) => {
            const current = result[FOCUS_CONFIG_KEY] || DEFAULT_FOCUS_CONFIG;
            const updated = { ...current, ...config };
            chrome.storage.sync.set({ [FOCUS_CONFIG_KEY]: updated }, resolve);
        });
    });
}

/**
 * Common distraction selectors
 */
export const DISTRACTION_SELECTORS = {
    comments: [
        '.comments',
        '#comments',
        '[data-testid="comments"]',
        '.comment-section',
        '.disqus_thread',
        '#disqus_thread',
        '.fb-comments',
        '[class*="comment"]',
        '[id*="comment"]'
    ],
    sidebars: [
        'aside',
        '.sidebar',
        '#sidebar',
        '[role="complementary"]',
        '.widget-area',
        '.side-bar',
        '[class*="sidebar"]'
    ],
    ads: [
        '.ad',
        '.ads',
        '.advertisement',
        '[class*="ad-"]',
        '[class*="advert"]',
        '[id*="google_ads"]',
        'iframe[src*="doubleclick"]',
        'iframe[src*="googlesyndication"]'
    ],
    related: [
        '.related-posts',
        '.related-articles',
        '.recommended',
        '.more-stories',
        '[class*="related"]',
        '[class*="recommend"]'
    ],
    popups: [
        '.modal',
        '.popup',
        '.overlay',
        '[class*="modal"]',
        '[class*="popup"]',
        '.newsletter-popup',
        '.subscribe-popup'
    ]
};

/**
 * Main content selectors
 */
export const MAIN_CONTENT_SELECTORS = [
    'article',
    '[role="main"]',
    'main',
    '.post-content',
    '.article-content',
    '.entry-content',
    '.content-body',
    '#content',
    '.story-body',
    '.article-body'
].join(', ');
