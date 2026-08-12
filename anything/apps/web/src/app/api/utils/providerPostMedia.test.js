import { describe, it, expect } from "vitest";
import { normalizeProviderPostMedia } from "./providerPostMedia";

describe("normalizeProviderPostMedia — business post media kind", () => {
  it("defaults to an image post with null video columns", () => {
    expect(normalizeProviderPostMedia({})).toEqual({
      ok: true,
      media_type: "image",
      video_url: null,
      video_thumbnail_url: null,
    });
  });

  it("treats media_type='image' as an image post (video fields ignored)", () => {
    const out = normalizeProviderPostMedia({
      media_type: "image",
      video_url: "https://cdn/x.mp4",
    });
    expect(out).toEqual({
      ok: true,
      media_type: "image",
      video_url: null,
      video_thumbnail_url: null,
    });
  });

  it("accepts a video post with a url + optional poster", () => {
    expect(
      normalizeProviderPostMedia({
        media_type: "video",
        video_url: "  https://cdn/x.mp4  ",
        video_thumbnail_url: "https://cdn/x.jpg",
      }),
    ).toEqual({
      ok: true,
      media_type: "video",
      video_url: "https://cdn/x.mp4",
      video_thumbnail_url: "https://cdn/x.jpg",
    });
  });

  it("a video post without a poster keeps video_thumbnail_url null", () => {
    expect(
      normalizeProviderPostMedia({ media_type: "video", video_url: "https://cdn/x.mp4" }),
    ).toMatchObject({ media_type: "video", video_thumbnail_url: null });
  });

  it("rejects a video post with no video_url", () => {
    expect(normalizeProviderPostMedia({ media_type: "video" })).toEqual({
      ok: false,
      error: "A video post needs a video",
    });
    expect(
      normalizeProviderPostMedia({ media_type: "video", video_url: "   " }),
    ).toMatchObject({ ok: false });
  });

  it("rejects an unknown media_type", () => {
    expect(normalizeProviderPostMedia({ media_type: "gif" })).toEqual({
      ok: false,
      error: "Invalid media type",
    });
  });
});
