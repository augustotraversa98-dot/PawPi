// Feed / daily moments: photo posts, a fresh multi-day streak, plus paws + barks.
import { daysAgo, dateOnly } from "../lib.mjs";

const MOMENT_IMAGES = [
  "dog-moment-1.jpg",
  "dog-moment-2.jpg",
  "dog-moment-3.jpg",
  "dog-moment-4.jpg",
  "dog-moment-5.jpg",
  "dog-moment-6.jpg",
];

// Argentine-Spanish, on-brand captions for daily updates (index by day offset).
const DAILY_CAPTIONS = [
  "Mañana de sol en Palermo con Mango 🐾",
  "Siesta bien merecida después del parque 😴",
  "Paseo largo por la costanera",
  "Cara de «¿me das un premio?» 🦴",
  "Domingo de juegos en la plaza",
  "Practicando «quedate» como un campeón",
];

const MOMENT_CAPTIONS = [
  "Amigos nuevos en el parque 🐶",
  "Primer chapuzón del verano 💦",
];

export default async function seedFeed(ctx) {
  const { A, img, mango, others, report } = ctx;
  const r = report.section("Feed / daily moments");

  // 1) Extend the daily-post streak over the most recent days that lack one.
  let covered = new Set();
  try {
    const s = await A.get(`/api/posts/streak?petId=${mango.id}`);
    covered = new Set((s.data?.dailyPostDates) || []);
  } catch (e) {
    r.note(`could not read streak: ${e.message}`);
  }

  const createdPostIds = [];
  let dailyCreated = 0;
  for (let offset = 0; offset < 6 && dailyCreated < 5; offset++) {
    const date = dateOnly(daysAgo(offset));
    if (covered.has(date)) {
      continue; // add-only: never a second daily post for a day already covered
    }
    try {
      const image_url = await img(MOMENT_IMAGES[offset % MOMENT_IMAGES.length]);
      const res = await A.post("/api/posts", {
        pet_id: mango.id,
        image_url,
        caption: DAILY_CAPTIONS[offset % DAILY_CAPTIONS.length],
        is_daily_update: true,
        post_date: date,
        media_type: "image",
      });
      if (res.ok && res.data?.post) {
        dailyCreated++;
        createdPostIds.push(res.data.post.id);
        r.created(`daily moment for ${date} (post ${res.data.post.id})`);
      } else if (res.status === 400 && /already posted/i.test(JSON.stringify(res.data))) {
        r.skipped(`daily moment for ${date}`);
      } else {
        r.error(`daily post ${date}: ${res.status} ${JSON.stringify(res.data)}`);
      }
    } catch (e) {
      r.error(`daily post ${date}: ${e.message}`);
    }
  }
  if (dailyCreated === 0 && covered.size > 0) {
    r.skipped(`streak already covers ${covered.size} day(s)`);
  }

  // 2) A couple of non-daily moment posts for variety — only if the feed is thin.
  let feedCount = 0;
  try {
    const feed = await A.get(`/api/posts?limit=20`);
    const posts = feed.data?.posts || [];
    feedCount = posts.filter((p) => p.pet_id === mango.id).length;
  } catch {
    /* ignore */
  }
  if (feedCount < 4) {
    for (let i = 0; i < MOMENT_CAPTIONS.length; i++) {
      try {
        const image_url = await img(MOMENT_IMAGES[(i + 3) % MOMENT_IMAGES.length]);
        const res = await A.post("/api/posts", {
          pet_id: mango.id,
          image_url,
          caption: MOMENT_CAPTIONS[i],
          is_daily_update: false,
          media_type: "image",
        });
        if (res.ok && res.data?.post) {
          createdPostIds.push(res.data.post.id);
          r.created(`moment post ${res.data.post.id}`);
        } else r.error(`moment post: ${res.status} ${JSON.stringify(res.data)}`);
      } catch (e) {
        r.error(`moment post: ${e.message}`);
      }
    }
  } else {
    r.skipped(`feed already has ${feedCount} posts for ${mango.name}`);
  }

  // 3) Paws + barks on a post so engagement isn't zero. Prefer a post we just
  // created; fall back to reading the feed.
  try {
    let target = createdPostIds.length ? { id: createdPostIds[0] } : null;
    if (!target) {
      const feed = await A.get(`/api/posts?limit=10`);
      const posts = (feed.data?.posts || []).filter((p) => p.pet_id === mango.id);
      target = posts[0] || null;
    }
    if (target) {
      const pawRes = await A.post(`/api/posts/${target.id}/paw`);
      if (pawRes.ok) r.created(`pawed post ${target.id} (count ${pawRes.data?.paw_count ?? "?"})`);

      // Bark as one of the owner's OTHER pets when available, else as Mango.
      const barkAs = (others && others[0]) || mango;
      const existing = await A.get(`/api/posts/${target.id}/barks`);
      const already = (existing.data?.barks || []).length;
      if (already < 1) {
        const barkRes = await A.post(`/api/posts/${target.id}/barks`, {
          text: "¡Qué hermoso, Mango! 🐾",
          petId: barkAs.id,
        });
        if (barkRes.ok) r.created(`bark on post ${target.id}`);
        else r.error(`bark: ${barkRes.status} ${JSON.stringify(barkRes.data)}`);
      } else {
        r.skipped(`post ${target.id} already has ${already} bark(s)`);
      }
    } else {
      r.note("no post available to paw/bark");
    }
  } catch (e) {
    r.error(`paw/bark: ${e.message}`);
  }
}
