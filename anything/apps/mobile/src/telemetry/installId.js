// install_id: a random UUIDv4 created on first use, kept in the secure store, deleted on opt-out. It is not
// derived from, and never linked to, an account, device identifier or advertising id. PURE (store + uuid injected).

import { isUuidV4 } from './uuid';

export const INSTALL_ID_KEY = 'pawpi.telemetry.install_id';

export function createInstallIdStore({ store, uuid }) {
  let cached = null;
  let inflight = null;

  async function readStored() {
    try {
      const v = await store.getItem(INSTALL_ID_KEY);
      return isUuidV4(v) ? v : null;
    } catch {
      return null;
    }
  }

  return {
    /** The install id, creating (and persisting) one on first use. Never rejects. */
    async get() {
      if (cached) return cached;
      if (!inflight) {
        inflight = (async () => {
          let id = await readStored();
          if (!id) {
            id = uuid();
            try {
              await store.setItem(INSTALL_ID_KEY, id);
            } catch {
              // not persisted: still a valid id for this process
            }
          }
          cached = id;
          return id;
        })().finally(() => {
          inflight = null;
        });
      }
      return inflight;
    },

    /** The stored id WITHOUT creating one (used to send the final opt_out event), or null. */
    async peek() {
      if (cached) return cached;
      if (inflight) {
        try {
          return await inflight;
        } catch {
          return null;
        }
      }
      return readStored();
    },

    /** Delete the id (opt-out). A later get() creates a NEW random id. Never rejects. */
    async clear() {
      try {
        if (inflight) await inflight.catch(() => {});
      } catch {
        // ignore
      }
      cached = null;
      try {
        await store.removeItem(INSTALL_ID_KEY);
      } catch {
        // ignore
      }
    },
  };
}
