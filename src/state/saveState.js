// Saves a run in localStorage so it can be continued later. Only game progress is stored:
// UI and drag state are rebuilt from defaults when a save is loaded.
export const SAVE_KEY = 'farming101.save';
export const BEST_KEY = 'farming101.best';
export const SAVE_VERSION = 1;

const TRANSIENT_STATE_KEYS = [
  'activeSlotIndex',
  'dragPreview',
  'harvestFeedback',
  'harvestFlash',
  'highlightedGroup',
  'marketOpen',
  'shopFeedback',
  'shopScrollTop',
];

export function serializeGame(state) {
  const progress = { ...state };
  for (const key of TRANSIENT_STATE_KEYS) {
    delete progress[key];
  }

  return { version: SAVE_VERSION, savedAt: Date.now(), state: JSON.parse(JSON.stringify(progress)) };
}

// Returns a full game state, or null when the save is missing or from an unknown version.
// Saved fields override fresh defaults, so fields added after the save was written keep their defaults.
export function restoreGame(save, freshState) {
  if (!save || save.version !== SAVE_VERSION || typeof save.state !== 'object' || save.state === null) {
    return null;
  }

  return {
    ...freshState,
    ...save.state,
    market: { ...freshState.market, ...save.state.market },
  };
}

// Storage can be missing (Node, tests) or throw (private browsing, blocked storage).
function getStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function readStored(key) {
  try {
    const raw = getStorage()?.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeStored(key, value) {
  try {
    getStorage()?.setItem(key, JSON.stringify(value));
  } catch {
    // Saving is best-effort; the game keeps running without it.
  }
}

export function removeStored(key) {
  try {
    getStorage()?.removeItem(key);
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}
