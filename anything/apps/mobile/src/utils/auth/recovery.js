// recovery — the "never strand a signed-in-but-broken user" helpers shared by the entry gate, the
// post-auth loading screen and the auth modal.

// A session JWT (@auth/core compact JWE) is dot-separated base64url segments. Anything else (empty,
// non-string, whitespace/control chars) cannot be a valid Bearer value and makes header
// construction throw on the next fetch — which the EntryPoint surfaces as "couldn't reach PawPi"
// on every relaunch. Such a stored token is dead: clear it instead of retrying forever.
const JWT_SHAPE = /^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]*)*$/;

export function isUsableToken(jwt) {
  return typeof jwt === "string" && JWT_SHAPE.test(jwt);
}

// Drop the stored session (setAuth(null) also clears SecureStore + the React Query cache) and go
// back to Welcome. Safe to call from any screen; never throws.
export function startOver({ setAuth, router }) {
  try {
    setAuth(null);
  } catch {
    // best-effort — navigation below still gets the user out
  }
  try {
    router.replace("/welcome");
  } catch {
    // ignore
  }
}
