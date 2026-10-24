// Shared expo-image props for feed media (perf audit 2026-10-23, finding 6 / section 5.4).
//
// expo-image defaults to a disk-only cache and swaps the picture in with no transition, so a re-render or a
// scroll back to a card re-decodes from disk and the photo pops in over blank white. `memory-disk` keeps the
// decoded image in RAM for the session (scrolling back is instant) and still persists it, and a short
// cross-fade replaces the pop. Uploaded media is served with a year-long cache-control (random UUID names),
// so the HTTP layer revalidates nothing either.
//
// Spread onto an expo-image <Image>:  <Image {...FEED_IMAGE_PROPS} source={...} />
export const FEED_IMAGE_PROPS = Object.freeze({
  cachePolicy: "memory-disk",
  transition: 150,
});
