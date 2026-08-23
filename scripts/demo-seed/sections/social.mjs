// Social: pet friendships (via follows — the only social-graph write the API
// exposes; true pet_friendships rows have no HTTP endpoint), a two-way DM
// conversation, and cross-account engagement that generates real notifications
// for the demo account.
export default async function seedSocial(ctx) {
  const { A, B, mango, bInfo, report } = ctx;
  const r = report.section("Social (DMs, friendships, notifications)");
  const aProfileId = ctx.profileId; // user_profiles.id of the demo account
  const bPetId = bInfo.petId;

  // --- Mutual follows (friendship-style link) ---
  try {
    const f1 = await B.post(`/api/pets/${mango.id}/follow`, { followerPetId: bPetId });
    if (f1.ok) r.created(`${bInfo.pet?.name || "support pet"} → follows Mango (followers ${f1.data?.followersCount ?? "?"})`);
    else r.error(`follow Mango: ${f1.status} ${JSON.stringify(f1.data).slice(0, 120)}`);

    const f2 = await A.post(`/api/pets/${bPetId}/follow`, { followerPetId: mango.id });
    if (f2.ok) r.created(`Mango → follows ${bInfo.pet?.name || "support pet"}`);
    else r.error(`follow back: ${f2.status} ${JSON.stringify(f2.data).slice(0, 120)}`);
  } catch (e) {
    r.error(`follows: ${e.message}`);
  }
  r.note("Pet friendships have no create API — mutual follows are the available primitive.");

  // --- DM conversation (B starts, A replies) ---
  try {
    const t = await B.post("/api/dm-threads", { otherUserId: aProfileId });
    const thread = t.data?.thread;
    if (thread) {
      const existing = await B.get(`/api/dm-threads/${thread.id}/messages`);
      const count = (existing.data?.messages || []).length;
      if (count < 2) {
        const m1 = await B.post(`/api/dm-threads/${thread.id}/messages`, {
          body: "¡Hola! Vi que Mango también pasea por Palermo 🐾 ¿Se conocen en la plaza alguna mañana?",
        });
        if (m1.ok) r.created(`DM from support account (msg ${m1.data?.message?.id})`);

        // A replies on the same shared thread (A is a participant, so it can
        // post directly by thread id — no need to re-list threads).
        const m2 = await A.post(`/api/dm-threads/${thread.id}/messages`, {
          body: "¡Hola! Sí, salimos a las 8. ¡Coordinemos para el finde! 🐶",
        });
        if (m2.ok) r.created("DM reply from demo account");
        else r.error(`DM reply: ${m2.status} ${JSON.stringify(m2.data).slice(0, 120)}`);
      } else {
        r.skipped(`DM thread already has ${count} messages`);
      }
    } else {
      r.error(`DM thread: ${t.status} ${JSON.stringify(t.data).slice(0, 120)}`);
    }
  } catch (e) {
    r.error(`DM: ${e.message}`);
  }

  // --- B engages with A's community content (generates notifications for A) ---
  // Event RSVP
  try {
    const events = await A.get("/api/events");
    const hosted = (events.data?.events || []).find((e) => e.is_host);
    if (hosted) {
      const rsvp = await B.post(`/api/events/${hosted.id}/rsvp`, { status: "going", pet_id: bPetId });
      if (rsvp.ok) r.created(`support account RSVP'd to event ${hosted.id}`);
    }
  } catch (e) {
    r.error(`event rsvp: ${e.message}`);
  }

  // Forum comment on A's newest thread
  try {
    const prof = await A.get("/api/user-profile");
    const aUser = prof.data?.profile?.username;
    const threads = await A.get("/api/forum/threads?sort=new");
    const mine = (threads.data?.threads || []).find((t) => t.username === aUser);
    if (mine) {
      const existing = await A.get(`/api/forum/threads/${mine.id}/comments`);
      const already = (existing.data?.comments || existing.data?.thread?.comments || []).length;
      if (already < 1) {
        const c = await B.post(`/api/forum/threads/${mine.id}/comments`, {
          body: "¡Buenísimo el tema! Nosotros vamos siempre a los Bosques temprano, hay sombra y poca gente.",
        });
        if (c.ok) r.created(`forum comment on thread ${mine.id}`);
        else r.error(`forum comment: ${c.status} ${JSON.stringify(c.data).slice(0, 120)}`);
      } else {
        r.skipped(`forum thread ${mine.id} already has comments`);
      }
    }
  } catch (e) {
    r.error(`forum comment: ${e.message}`);
  }

  // Join request to A's social walk
  try {
    const walks = await A.get("/api/social-walks?myWalks=true");
    const walk = (walks.data?.walks || [])[0];
    if (walk) {
      const jr = await B.post(`/api/social-walks/${walk.id}/join-request`, {
        petId: bPetId,
        message: "¿Podemos sumarnos? Luna es muy sociable 🐶",
      });
      if (jr.ok) r.created(`join request to social walk ${walk.id}`);
      else if (jr.status === 400 && /pending|approved/i.test(JSON.stringify(jr.data)))
        r.skipped("join request already exists");
      else r.error(`join request: ${jr.status} ${JSON.stringify(jr.data).slice(0, 120)}`);
    }
  } catch (e) {
    r.error(`join request: ${e.message}`);
  }

  // --- Lost-and-found: support pet files a nearby report (does NOT mark a demo
  // pet lost; shows in the community lost feed and alerts followers). ---
  try {
    const mine = await B.get("/api/lost-reports?mine=true");
    const active = (mine.data?.reports || []).some((x) => x.status === "active");
    if (!active) {
      const lr = await B.post("/api/lost-reports", {
        petId: bPetId,
        lat: -34.5889,
        lng: -58.4269,
        lastSeenArea: "Plaza Inmigrantes, Palermo",
        notes: "Border Collie con collar celeste, responde a «Luna». ¡Gracias por avisar!",
        reward: "Recompensa",
      });
      if (lr.ok) r.created(`lost-and-found report ${lr.data?.report?.id}`);
      else if (lr.status === 409) r.skipped("lost report already active");
      else r.error(`lost report: ${lr.status} ${JSON.stringify(lr.data).slice(0, 120)}`);
    } else {
      r.skipped("support pet already has an active lost report");
    }
  } catch (e) {
    r.error(`lost report: ${e.message}`);
  }
}
