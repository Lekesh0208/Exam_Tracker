// Mimics the window.storage.get/set/delete/list API (same shape the app already
// calls) but backed by the browser's own localStorage — no account, no server,
// no plan tier. Data lives on this device, in this browser, until cleared.

const PREFIX = 'examtracker:';

function isAvailable() {
  try {
    const testKey = PREFIX + '__test__';
    localStorage.setItem(testKey, '1');
    localStorage.removeItem(testKey);
    return true;
  } catch (e) {
    return false;
  }
}

window.storage = {
  async get(key) {
    if (!isAvailable()) throw new Error('localStorage unavailable');
    const raw = localStorage.getItem(PREFIX + key);
    if (raw === null) throw new Error('key not found');
    return { key, value: raw, shared: false };
  },

  async set(key, value) {
    if (!isAvailable()) return null;
    try {
      localStorage.setItem(PREFIX + key, value);
      return { key, value, shared: false };
    } catch (e) {
      return null;
    }
  },

  async delete(key) {
    if (!isAvailable()) return null;
    localStorage.removeItem(PREFIX + key);
    return { key, deleted: true, shared: false };
  },

  async list(prefix = '') {
    if (!isAvailable()) return null;
    const keys = Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX + prefix))
      .map((k) => k.slice(PREFIX.length));
    return { keys, prefix, shared: false };
  },
};
