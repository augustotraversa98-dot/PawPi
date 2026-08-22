// Community: the demo account's own forum threads, a local event, and a social
// walk. (A supporting account also engages with these in the Social section, and
// files a nearby lost-and-found report, so the community tab looks alive.)
import { iso, daysAhead, atHour } from "../lib.mjs";

export default async function seedCommunity(ctx) {
  const { A, img, mango, report } = ctx;
  const r = report.section("Community");
  const petId = mango.id;

  // A's username (to detect our own existing threads).
  let username = null;
  try {
    const prof = await A.get("/api/user-profile");
    username = prof.data?.profile?.username || null;
  } catch {
    /* ignore */
  }

  // --- Forum threads ---
  let myThreads = 0;
  try {
    const res = await A.get(`/api/forum/threads?sort=new`);
    myThreads = (res.data?.threads || []).filter(
      (t) => username && t.username === username,
    ).length;
  } catch {
    /* ignore */
  }
  if (myThreads < 1) {
    const threads = [
      { title: "¿Mejor plaza para pasear en Palermo?", category: "General", body: "Busco recomendaciones de plazas tranquilas cerca de Palermo para pasear a Mango a la mañana. ¿Alguna con sombra?" },
      { title: "Tips para dermatitis atópica en verano", category: "Salud", body: "A Mango le agarra picazón estacional. ¿Qué shampoos o rutinas les funcionaron? Estamos con Apoquel pero busco cuidados extra." },
    ];
    for (const t of threads) {
      try {
        const res = await A.post("/api/forum/threads", { ...t, imageUrls: [] });
        if (res.ok && res.data?.thread) r.created(`forum thread ${res.data.thread.id}`);
        else r.error(`forum thread: ${res.status} ${JSON.stringify(res.data).slice(0, 140)}`);
      } catch (e) {
        r.error(`forum thread: ${e.message}`);
      }
    }
  } else {
    r.skipped(`forum threads (${myThreads} by you)`);
  }

  // --- Local event (caller is host) ---
  let hostedEvents = 0;
  try {
    const res = await A.get(`/api/events`);
    hostedEvents = (res.data?.events || []).filter((e) => e.is_host).length;
  } catch {
    /* ignore */
  }
  if (hostedEvents < 1) {
    let cover = null;
    try {
      cover = await img("friend-2.jpg");
    } catch {
      /* optional */
    }
    try {
      const res = await A.post("/api/events", {
        title: "Encuentro de perros en Parque Centenario",
        description: "Juntada canina relajada, traé agua y premios. Perros sociables. ¡Nos vemos!",
        starts_at: iso(atHour(daysAhead(7), 18, 0)),
        ends_at: iso(atHour(daysAhead(7), 20, 0)),
        lat: -34.6067,
        lng: -58.4358,
        location_name: "Parque Centenario",
        address: "Caballito, Buenos Aires",
        capacity: 30,
        cover_image_url: cover,
      });
      if (res.ok && res.data?.event) r.created(`event ${res.data.event.id}`);
      else r.error(`event: ${res.status} ${JSON.stringify(res.data).slice(0, 140)}`);
    } catch (e) {
      r.error(`event: ${e.message}`);
    }
  } else {
    r.skipped(`event (${hostedEvents} hosted)`);
  }

  // --- Social walk (caller is owner) ---
  let myWalks = 0;
  try {
    const res = await A.get(`/api/social-walks?myWalks=true`);
    myWalks = (res.data?.walks || []).length;
  } catch {
    /* ignore */
  }
  if (myWalks < 1) {
    try {
      const res = await A.post("/api/social-walks", {
        petId,
        walkName: "Caminata matutina en Palermo",
        scheduledAt: iso(atHour(daysAhead(3), 9, 0)),
        visibility: "nearby_pets",
        durationMinutes: 45,
        pace: "relajado",
        meetingArea: "Bosques de Palermo",
        meetingLocationDetails: "Entrada por Av. Sarmiento",
        maxPets: 5,
        approvalRequired: true,
        notesForGuests: "Perros sociables y con correa. ¡Bienvenidos!",
        lat: -34.5711,
        lng: -58.4172,
        locationName: "Palermo, Buenos Aires",
      });
      if (res.ok && res.data?.socialWalk) r.created(`social walk ${res.data.socialWalk.id}`);
      else r.error(`social walk: ${res.status} ${JSON.stringify(res.data).slice(0, 140)}`);
    } catch (e) {
      r.error(`social walk: ${e.message}`);
    }
  } else {
    r.skipped(`social walk (${myWalks} yours)`);
  }
}
