import { FEED_IMAGE_PROPS } from "./feedImageProps";

test("feed images are cached in memory + disk and cross-fade in", () => {
  expect(FEED_IMAGE_PROPS).toEqual({ cachePolicy: "memory-disk", transition: 150 });
  expect(Object.isFrozen(FEED_IMAGE_PROPS)).toBe(true);
});
