// Observes Google OAuth sign-ins/sign-ups WITHOUT touching auth behaviour.
//
// @auth/core drives the OAuth dance and talks to the database only through the adapter, so the adapter is
// the one clean seam: every method of the returned adapter delegates to the original with the same
// arguments and returns/throws exactly what it does; we only count after the fact (try/catch, never
// throws).
//
//   - returning Google user  -> adapter.getUserByAccount hit for provider 'google'      -> signin ok google
//   - new Google user        -> adapter.createUser followed by linkAccount(oauth, google)
//                                                                                       -> signup ok google + signin ok google
//   - existing email, first Google link -> linkAccount(oauth, google) w/o createUser    -> signin ok google
//
// A failed/denied Google attempt never reaches the adapter, so Google has no `fail` outcome (documented
// limitation). Credentials and Apple are counted at their `authorize` instead (see observeAuthorize).

import { recordBusinessEvent } from './business.js';

const OAUTH_TYPES = new Set(['oauth', 'oidc']);
const MAX_REMEMBERED = 100;

export function instrumentAuthAdapter(adapter) {
  // Ids of users created in this process that are waiting for their linkAccount. In-memory only, never a
  // label; bounded so a flood of credentials sign-ups can't grow it.
  const justCreated = new Set();

  return {
    ...adapter,
    async createUser(...args) {
      const user = await adapter.createUser(...args);
      try {
        if (user?.id != null) {
          if (justCreated.size >= MAX_REMEMBERED) justCreated.delete(justCreated.values().next().value);
          justCreated.add(String(user.id));
        }
      } catch {}
      return user;
    },
    async getUserByAccount(account) {
      const user = await adapter.getUserByAccount(account);
      try {
        if (user && account?.provider === 'google') recordBusinessEvent('signin', 'ok', 'google');
      } catch {}
      return user;
    },
    async linkAccount(account) {
      const result = await adapter.linkAccount(account);
      try {
        if (account?.provider === 'google' && OAUTH_TYPES.has(account?.type)) {
          const key = String(account.userId);
          if (justCreated.delete(key)) recordBusinessEvent('signup', 'ok', 'google');
          recordBusinessEvent('signin', 'ok', 'google');
        }
      } catch {}
      return result;
    },
  };
}
