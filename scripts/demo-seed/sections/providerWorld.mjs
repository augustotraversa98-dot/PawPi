// Services / Adopt / Shop. The supporting account (B) stands up a minimal demo
// provider (published) with services, a location, shop products and adoptable
// dogs. The demo account (A) then books it via the no-payment "pay in person"
// path (PR #502 — omit order_id / pay_with_credit), grants the clinic care
// access, favorites + applies to adopt, and the vet issues a prescription.
import { dateOnly, daysAhead, daysAgo } from "../lib.mjs";

const PROVIDER_NAME = "Veterinaria y Refugio Palermo Sur (demo)";

async function findOrCreateProvider(B, imgB, r) {
  // Reuse a provider B already owns (idempotent across runs).
  try {
    const mine = await B.get("/api/providers");
    const existing = (mine.data?.providers || []).find((p) => p.name === PROVIDER_NAME);
    if (existing) {
      r.skipped(`provider ${existing.id} (${PROVIDER_NAME})`);
      return existing;
    }
  } catch {
    /* fall through to create */
  }

  let logo = null;
  try {
    logo = await imgB("vet-cover.jpg");
  } catch {
    /* optional */
  }
  const created = await B.post("/api/providers", {
    name: PROVIDER_NAME,
    provider_type: "vet",
    capabilities: ["vet", "groomer", "walker", "shop", "adoption"],
    bio: "Clínica veterinaria, peluquería, tienda y refugio en Palermo. Atención con turno y adopciones responsables.",
    logo_url: logo,
  });
  const provider = created.data?.provider;
  if (!provider) {
    throw new Error(`provider create failed: ${created.status} ${JSON.stringify(created.data).slice(0, 140)}`);
  }
  r.created(`provider ${provider.id} (${PROVIDER_NAME})`);
  const pub = await B.post(`/api/providers/${provider.id}/publish`, { status: "published" });
  if (pub.ok) r.created(`published provider ${provider.id}`);
  else r.error(`publish: ${pub.status} ${JSON.stringify(pub.data).slice(0, 120)}`);
  return provider;
}

export default async function seedProviderWorld(ctx) {
  const { A, B, mango, imgB, report } = ctx;
  const r = report.section("Services / Adopt / Shop (demo provider)");
  const petId = mango.id;

  let provider;
  try {
    provider = await findOrCreateProvider(B, imgB, r);
  } catch (e) {
    r.error(e.message);
    return;
  }
  const pid = provider.id;

  // --- Location ---
  let locationId = null;
  try {
    const locs = await B.get(`/api/providers/${pid}/locations`);
    const existing = (locs.data?.locations || [])[0];
    if (existing) {
      locationId = existing.id;
      r.skipped(`location ${locationId}`);
    } else {
      const loc = await B.post(`/api/providers/${pid}/locations`, {
        name: "Sede Palermo",
        address: "Av. Santa Fe 3900, Palermo, Buenos Aires",
        lat: -34.5822,
        lng: -58.4203,
        phone: "+54 11 4832-1100",
        hours_json: { mon: ["09:00-19:00"], tue: ["09:00-19:00"], wed: ["09:00-19:00"], thu: ["09:00-19:00"], fri: ["09:00-19:00"], sat: ["10:00-14:00"] },
      });
      locationId = loc.data?.location?.id || null;
      if (locationId) r.created(`location ${locationId}`);
      else r.error(`location: ${loc.status} ${JSON.stringify(loc.data).slice(0, 120)}`);
    }
  } catch (e) {
    r.error(`location: ${e.message}`);
  }

  // --- Services (pay-in-person: payment_policy 'none') ---
  let vetServiceId = null;
  try {
    const svcRes = await B.get(`/api/providers/${pid}/services`);
    let services = svcRes.data?.services || [];
    if (services.length === 0) {
      const toCreate = [
        { name: "Consulta veterinaria", description: "Consulta clínica general", duration_min: 30, price_cents: 1500000, currency: "ARS", payment_policy: "none" },
        { name: "Baño y corte", description: "Peluquería completa", duration_min: 60, price_cents: 1200000, currency: "ARS", payment_policy: "none" },
      ];
      for (const s of toCreate) {
        const res = await B.post(`/api/providers/${pid}/services`, s);
        if (res.ok && res.data?.service) {
          r.created(`service ${res.data.service.id} (${s.name})`);
          services.push(res.data.service);
        } else {
          r.error(`service ${s.name}: ${res.status} ${JSON.stringify(res.data).slice(0, 120)}`);
        }
      }
    } else {
      r.skipped(`services (${services.length})`);
    }
    vetServiceId = (services.find((s) => /consulta/i.test(s.name)) || services[0])?.id || null;
  } catch (e) {
    r.error(`services: ${e.message}`);
  }

  // --- Shop products ---
  try {
    const prodRes = await B.get(`/api/providers/${pid}/shop-products`);
    const products = prodRes.data?.products || [];
    if (products.length === 0) {
      let img5, img6, imgVet2;
      try { img5 = await imgB("dog-moment-5.jpg"); } catch { /* optional */ }
      try { img6 = await imgB("dog-moment-6.jpg"); } catch { /* optional */ }
      try { imgVet2 = await imgB("vet-2.jpg"); } catch { /* optional */ }
      const toCreate = [
        { name: "Alimento premium 10kg", description: "Balanceado súper premium para adultos", price_cents: 4500000, currency: "ARS", stock_qty: 24, category: "Alimento", image_urls: img5 ? [img5] : [] },
        { name: "Juguete mordillo resistente", description: "Caucho natural, ideal para masticadores", price_cents: 650000, currency: "ARS", stock_qty: 40, category: "Juguetes", image_urls: img6 ? [img6] : [] },
        { name: "Shampoo hipoalergénico", description: "Para piel sensible y dermatitis", price_cents: 380000, currency: "ARS", stock_qty: 30, category: "Higiene", image_urls: imgVet2 ? [imgVet2] : [] },
      ];
      for (const p of toCreate) {
        const res = await B.post(`/api/providers/${pid}/shop-products`, p);
        if (res.ok && res.data?.product) r.created(`product ${res.data.product.id} (${p.name})`);
        else r.error(`product ${p.name}: ${res.status} ${JSON.stringify(res.data).slice(0, 120)}`);
      }
    } else {
      r.skipped(`shop products (${products.length})`);
    }
  } catch (e) {
    r.error(`shop products: ${e.message}`);
  }

  // --- Adoptable listings ---
  let listingId = null;
  try {
    const listRes = await B.get(`/api/providers/${pid}/adoptable-listings`);
    let listings = listRes.data?.listings || [];
    if (listings.length === 0) {
      let photoA, photoB;
      try { photoA = await imgB("friend-1.jpg"); } catch { /* optional */ }
      try { photoB = await imgB("friend-2.jpg"); } catch { /* optional */ }
      // size / energy_level / vaccination_status are CHECK-constrained to English
      // enum values (small|medium|large|xlarge, low|medium|high,
      // up_to_date|partial|unknown). Free-text fields (name/breed/story) stay ES.
      const toCreate = [
        { name: "Rocco", breed: "Mestizo", age_years: 2, age_months: 0, gender: "male", size: "medium", photo_urls: photoA ? [photoA] : [], story: "Rocco es cariñoso y juguetón, rescatado de la calle. Busca una familia con patio.", good_with_kids: true, good_with_dogs: true, good_with_cats: false, energy_level: "medium", vaccination_status: "up_to_date", adoption_fee_cents: 0, currency: "ARS" },
        { name: "Nina", breed: "Caniche mestiza", age_years: 3, age_months: 6, gender: "female", size: "small", photo_urls: photoB ? [photoB] : [], story: "Nina es tranquila y compañera, ideal para departamento. Ya está castrada.", good_with_kids: true, good_with_dogs: true, good_with_cats: true, energy_level: "low", vaccination_status: "up_to_date", adoption_fee_cents: 0, currency: "ARS" },
      ];
      for (const l of toCreate) {
        const res = await B.post(`/api/providers/${pid}/adoptable-listings`, l);
        if (res.ok && res.data?.listing) {
          r.created(`adoption listing ${res.data.listing.id} (${l.name})`);
          listings.push(res.data.listing);
        } else {
          r.error(`listing ${l.name}: ${res.status} ${JSON.stringify(res.data).slice(0, 120)}`);
        }
      }
    } else {
      r.skipped(`adoption listings (${listings.length})`);
    }
    listingId = listings[0]?.id || null;
  } catch (e) {
    r.error(`adoption listings: ${e.message}`);
  }

  // --- Establish clinic care access (enables the vet Rx + the care-access UI).
  // Use the provider-request → owner-approve flow: the clinic (B) requests, the
  // owner (A) approves. The owner-initiated POST /api/care-access/grants is
  // blocked by the care_access_grants INSERT RLS policy (owner inserts are not
  // permitted; only requested_by='provider' by active staff), so it 500s — see
  // the bug write-up. This two-step path is the one RLS actually allows. ---
  try {
    const scopes = ["medical_read", "medical_write", "vaccinations_write", "appointments"];
    const req = await B.post(`/api/providers/${pid}/access-requests`, { petId, scopes });
    const grant = req.data?.grant;
    if (!grant) {
      r.error(`care-access request: ${req.status} ${JSON.stringify(req.data).slice(0, 120)}`);
    } else if (grant.status === "active") {
      r.skipped("care-access grant (already active)");
    } else {
      const appr = await A.patch(`/api/care-access/grants/${grant.id}`, { action: "approve" });
      if (appr.ok) r.created("care-access grant (clinic requested, owner approved)");
      else r.error(`care-access approve: ${appr.status} ${JSON.stringify(appr.data).slice(0, 120)}`);
    }
  } catch (e) {
    r.error(`care access: ${e.message}`);
  }

  // --- A books the provider (pay-in-person: no order_id, no pay_with_credit) ---
  try {
    const existing = await A.get("/api/me/bookings");
    const have = (existing.data?.upcoming || []).length + (existing.data?.past || []).length;
    if (have < 2) {
      const common = { petId, service_id: vetServiceId, provider_location_id: locationId, capability: "vet" };
      const upcoming = await A.post(`/api/providers/${pid}/book`, {
        ...common,
        appointment_date: dateOnly(daysAhead(9)),
        appointment_time: "11:00",
        reason_for_visit: "Control anual y refuerzo de vacunas",
      });
      if (upcoming.ok && upcoming.data?.appointment) r.created(`upcoming booking ${upcoming.data.appointment.id}`);
      else r.error(`upcoming booking: ${upcoming.status} ${JSON.stringify(upcoming.data).slice(0, 140)}`);

      const past = await A.post(`/api/providers/${pid}/book`, {
        ...common,
        appointment_date: dateOnly(daysAgo(30)),
        appointment_time: "16:00",
        reason_for_visit: "Consulta por picazón estacional",
      });
      if (past.ok && past.data?.appointment) r.created(`past booking ${past.data.appointment.id}`);
      else r.error(`past booking: ${past.status} ${JSON.stringify(past.data).slice(0, 140)}`);
    } else {
      r.skipped(`bookings (${have} already)`);
    }
  } catch (e) {
    r.error(`booking: ${e.message}`);
  }

  // --- A favorites + applies to an adoption listing ---
  if (listingId) {
    try {
      const fav = await A.post("/api/adoption/favorites", { listing_id: listingId });
      if (fav.ok) r.created(`favorited adoption listing ${listingId}`);
      const app = await A.post("/api/adoption/applications", {
        listing_id: listingId,
        answers: { home_type: "departamento", has_yard: false, other_pets: "1 perro (Mango)" },
        requested_placement: "adopt",
      });
      if (app.ok) r.created(`adoption application for listing ${listingId}`);
      else if (app.status === 409) r.skipped("adoption application already exists");
      else r.error(`application: ${app.status} ${JSON.stringify(app.data).slice(0, 120)}`);
    } catch (e) {
      r.error(`adoption apply: ${e.message}`);
    }
  }

  // --- The vet (B) issues a prescription for Mango (needs the grant above) ---
  try {
    const existingRx = await A.get(`/api/prescriptions?petId=${petId}`);
    if ((existingRx.data?.prescriptions || []).length === 0) {
      const rx = await B.post(`/api/providers/${pid}/pets/${petId}/prescriptions`, {
        drug_name: "Apoquel",
        strength: "16mg",
        dose: "1 comprimido",
        route: "oral",
        frequency: "una vez al día",
        duration: "30 días",
        quantity: "30 comprimidos",
        instructions: "Administrar con comida. Suspender si hay vómitos.",
        refills_authorized: 2,
        source: "in_person",
      });
      if (rx.ok && rx.data?.prescription) r.created(`prescription ${rx.data.prescription.id} (Apoquel)`);
      else r.error(`prescription: ${rx.status} ${JSON.stringify(rx.data).slice(0, 140)}`);
    } else {
      r.skipped("prescription (already present)");
    }
  } catch (e) {
    r.error(`prescription: ${e.message}`);
  }
}
