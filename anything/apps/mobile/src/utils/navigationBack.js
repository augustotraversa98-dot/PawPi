// A back button that can never dead-end: go back when there is somewhere to go back to, otherwise open the given
// fallback screen in place of this one (a screen reached by a deep link or a notification has no history).
export function goBackOr(router, fallback) {
  if (router?.canGoBack?.() === false) {
    router.replace(fallback);
    return;
  }
  router.back();
}
