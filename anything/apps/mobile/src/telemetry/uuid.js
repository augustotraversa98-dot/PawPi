// Random UUID v4 for install_id / session_id. Source order: globalThis.crypto.randomUUID, expo-crypto, then a
// Math.random/Date based generator. Every candidate is checked against the v4 shape (the server's install_id
// pattern), so an odd platform value can never produce an id the server would refuse.

const V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export const isUuidV4 = (v) => typeof v === 'string' && V4_RE.test(v);

function fallbackV4() {
  // Last resort only (no platform CSPRNG available): Math.random mixed with the clock. The id is anonymous and
  // never a secret, it only has to be unique enough to tell installs apart.
  let t = Date.now();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.floor(Math.random() * 16) + (t % 16)) % 16;
    t = Math.floor(t / 16) + 1;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function uuidv4() {
  try {
    const c = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
    if (c && typeof c.randomUUID === 'function') {
      const v = String(c.randomUUID()).toLowerCase();
      if (isUuidV4(v)) return v;
    }
  } catch {
    // fall through
  }
  try {
    // eslint-disable-next-line global-require
    const mod = require('expo-crypto');
    if (mod && typeof mod.randomUUID === 'function') {
      const v = String(mod.randomUUID()).toLowerCase();
      if (isUuidV4(v)) return v;
    }
  } catch {
    // fall through
  }
  return fallbackV4();
}
