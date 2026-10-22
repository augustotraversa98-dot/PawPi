// Weekly share card: image fallback order, positive-only stat line, label interpolation (EN + ES).

const { makeReactI18nextMock } = require("@/i18n/testMock");
import {
  resolveShareImage,
  buildShareStatLine,
  buildWeeklyShareCard,
  weekMomentList,
} from "./weeklyShareCard";

const tFor = (lang) => makeReactI18nextMock(lang).useTranslation().t;
const tEn = tFor("en");
const tEs = tFor("es");

const m = (post_id, post_date, photo_url = `https://cdn/${post_id}.jpg`) => ({ post_id, post_date, photo_url });
const MOMENTS = [m(1, "2026-08-10"), m(2, "2026-08-12"), m(3, "2026-08-14")];

describe("resolveShareImage — fallback order", () => {
  it("1. the moment the owner picked wins", () => {
    const r = resolveShareImage({
      moments: MOMENTS,
      bestMoment: { post_id: 2, image_url: "https://cdn/2.jpg" },
      selectedId: 1,
      avatarUrl: "https://cdn/avatar.jpg",
    });
    expect(r).toEqual({ source: "chosen", uri: "https://cdn/1.jpg", momentId: 1 });
  });

  it("2. otherwise the digest's best moment", () => {
    const r = resolveShareImage({
      moments: MOMENTS,
      bestMoment: { post_id: 2, image_url: "https://cdn/2.jpg" },
      avatarUrl: "https://cdn/avatar.jpg",
    });
    expect(r).toMatchObject({ source: "best", uri: "https://cdn/2.jpg", momentId: 2 });
  });

  it("3. otherwise the most recent moment of the week", () => {
    const r = resolveShareImage({ moments: MOMENTS, bestMoment: null, avatarUrl: "https://cdn/avatar.jpg" });
    expect(r).toMatchObject({ source: "recent", uri: "https://cdn/3.jpg", momentId: 3 });
  });

  it("a stale selectedId that is not in the week is ignored", () => {
    const r = resolveShareImage({ moments: MOMENTS, bestMoment: null, selectedId: 999 });
    expect(r.source).toBe("recent");
  });

  it("4. no moments this week -> the pet's profile photo", () => {
    const r = resolveShareImage({ moments: [], bestMoment: null, avatarUrl: "https://cdn/avatar.jpg" });
    expect(r).toEqual({ source: "profile", uri: "https://cdn/avatar.jpg", momentId: null });
  });

  it("5. no moments and no profile photo -> no image (never a paw)", () => {
    const r = resolveShareImage({ moments: undefined, bestMoment: null, avatarUrl: null });
    expect(r).toEqual({ source: "none", uri: null, momentId: null });
  });

  it("moments without a photo are not offered", () => {
    expect(weekMomentList([{ post_id: 9, post_date: "2026-08-10", photo_url: null }, m(1, "2026-08-10")])).toHaveLength(1);
  });
});

describe("buildShareStatLine — positive only, never invented", () => {
  it("shows only the stats that are > 0", () => {
    expect(buildShareStatLine({ walks: 3, ring_days_closed: 0, ring_days_total: 7, moments: 0 }, tEn)).toBe("3 walks");
    expect(buildShareStatLine({ walks: 0, ring_days_closed: 4, ring_days_total: 7, moments: 0 }, tEn)).toBe("4/7 ring days");
    expect(buildShareStatLine({ walks: 1, ring_days_closed: 4, ring_days_total: 7, moments: 2 }, tEn)).toBe(
      "1 walk · 4/7 ring days · 2 daily moments",
    );
  });

  it("care actions only speak up when nothing else does", () => {
    expect(buildShareStatLine({ walks: 0, ring_days_closed: 0, moments: 0, care_actions: 2 }, tEn)).toBe("2 care actions");
    expect(buildShareStatLine({ walks: 2, care_actions: 5 }, tEn)).toBe("2 walks");
  });

  it("returns null for a week with nothing in it", () => {
    expect(buildShareStatLine({ walks: 0, ring_days_closed: 0, ring_days_total: 7, moments: 0, care_actions: 0 }, tEn)).toBeNull();
    expect(buildShareStatLine(undefined, tEn)).toBeNull();
  });

  it("is localized (Spanish)", () => {
    expect(buildShareStatLine({ walks: 1, ring_days_closed: 4, ring_days_total: 7 }, tEs)).toBe("1 paseo · 4/7 días con aro");
  });
});

describe("buildWeeklyShareCard", () => {
  const image = { source: "chosen", uri: "https://cdn/1.jpg", momentId: 1 };

  it("zero-activity week: warm line, no zeros and no x/7", () => {
    const card = buildWeeklyShareCard({
      data: { walks: 0, ring_days_closed: 0, ring_days_total: 7, moments: 0, care_actions: 0 },
      name: "Rex",
      image,
      t: tEn,
    });
    expect(card.headline).toBe("Rex's week 🐾");
    expect(card.subtitle).toBe("A fresh week starts today");
    expect(`${card.headline} ${card.subtitle}`).not.toMatch(/\d/);
    expect(card.photoUri).toBe("https://cdn/1.jpg");
  });

  it("zero-activity week reads warm in Spanish too", () => {
    const card = buildWeeklyShareCard({ data: {}, name: "Rex", image, t: tEs });
    expect(card.subtitle).toBe("Hoy empieza una semana nueva");
    expect(card.headline).toBe("La semana de Rex 🐾");
  });

  it("no image -> no card (the screen asks for a moment instead)", () => {
    expect(buildWeeklyShareCard({ data: {}, name: "Rex", image: { source: "none", uri: null }, t: tEn })).toBeNull();
  });

  it("never leaves an unresolved {{placeholder}} in the card", () => {
    const card = buildWeeklyShareCard({
      data: { walks: 2, ring_days_closed: 1, ring_days_total: 7, moments: 1 },
      name: "Rex",
      image,
      t: tEn,
    });
    expect(JSON.stringify(card)).not.toContain("{{");
  });
});
