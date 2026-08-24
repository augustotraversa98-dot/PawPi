// Vet Record: medical profile, allergies, conditions, lab results, surgeries,
// vet notes, documents, vaccinations, a vet appointment, and the Emergency Card.
import { topUp, dateOnly, daysAhead } from "../lib.mjs";

export default async function seedVet(ctx) {
  const { A, img, mango, report } = ctx;
  const r = report.section("Vet Record");
  const petId = mango.id;

  // --- Medical profile (single upsert row). Only fill it if it's empty, and
  // never pass pet-level fields (breed/birthday/…) so the existing pet row is
  // left untouched. ---
  try {
    const cur = await A.get(`/api/pet-medical-profiles?petId=${petId}`);
    const mp = cur.data?.medicalProfile;
    const hasData =
      mp &&
      (mp.primary_vet_name || mp.microchip_id || mp.medical_notes || mp.spayed_neutered_status);
    if (!hasData) {
      const res = await A.post("/api/pet-medical-profiles", {
        petId,
        spayedNeuteredStatus: "neutered",
        spayedNeuteredDate: "2022-03-15",
        microchipId: "AR-982000411223344",
        primaryVetName: "Dra. Camila Reyes",
        primaryClinicName: "Veterinaria Palermo Sur",
        vetPhone: "+54 11 4832-1100",
        vetEmail: "turnos@vetpalermosur.com.ar",
        emergencyContactName: "Augusto (dueño)",
        emergencyContactPhone: "+54 11 6555-0199",
        insuranceProvider: "MascotaSegura",
        insurancePolicyNumber: "MS-2026-00817",
        medicalNotes: "Sano y activo. Dermatitis atópica leve controlada con Apoquel.",
      });
      if (res.ok) r.created("medical profile");
      else r.error(`medical profile: ${res.status} ${JSON.stringify(res.data).slice(0, 140)}`);
    } else {
      r.skipped("medical profile (already filled)");
    }
  } catch (e) {
    r.error(`medical profile: ${e.message}`);
  }

  await topUp(A, r, {
    label: "allergy",
    listUrl: `/api/vet-record/allergies?petId=${petId}`,
    listKey: "allergies",
    target: 2,
    makers: [
      () => ({ path: "/api/vet-record/allergies", idKey: "allergy", body: { petId, allergen: "Polen", severity: "leve", reaction: "Picazón estacional", diagnosedDate: "2024-10-01", notes: "Primavera" } }),
      () => ({ path: "/api/vet-record/allergies", idKey: "allergy", body: { petId, allergen: "Pollo", severity: "moderada", reaction: "Molestias digestivas", diagnosedDate: "2023-06-15" } }),
    ],
  });

  await topUp(A, r, {
    label: "condition",
    listUrl: `/api/vet-record/conditions?petId=${petId}`,
    listKey: "conditions",
    target: 1,
    makers: [
      () => ({ path: "/api/vet-record/conditions", idKey: "condition", body: { petId, condition: "Dermatitis atópica", status: "managed", diagnosedDate: "2024-09-20", notes: "Controlada con Apoquel y baños medicados" } }),
    ],
  });

  await topUp(A, r, {
    label: "lab result",
    listUrl: `/api/vet-record/lab-results?petId=${petId}`,
    listKey: "labResults",
    target: 2,
    makers: [
      () => ({ path: "/api/vet-record/lab-results", idKey: "labResult", body: { petId, testName: "Hemograma completo", testDate: "2026-07-30", results: "Todos los valores dentro del rango normal", orderedBy: "Dra. Reyes", notes: "Chequeo anual" } }),
      () => ({ path: "/api/vet-record/lab-results", idKey: "labResult", body: { petId, testName: "Química sanguínea", testDate: "2026-07-30", results: "Función renal y hepática normales", orderedBy: "Dra. Reyes" } }),
    ],
  });

  await topUp(A, r, {
    label: "surgery",
    listUrl: `/api/vet-record/surgeries?petId=${petId}`,
    listKey: "surgeries",
    target: 1,
    makers: [
      () => ({ path: "/api/vet-record/surgeries", idKey: "surgery", body: { petId, procedure: "Castración", surgeryDate: "2022-03-15", surgeon: "Dr. Molina", clinic: "Veterinaria Palermo Sur", recovery: "Sin complicaciones", notes: "Recuperación completa en 10 días" } }),
    ],
  });

  await topUp(A, r, {
    label: "vet note",
    listUrl: `/api/vet-record/notes?petId=${petId}`,
    listKey: "notes",
    target: 2,
    makers: [
      () => ({ path: "/api/vet-record/notes", idKey: "note", body: { petId, noteDate: "2026-07-30", note: "Control anual: peso ideal, dentición buena. Continuar preventivos mensuales.", vetName: "Dra. Reyes" } }),
      () => ({ path: "/api/vet-record/notes", idKey: "note", body: { petId, noteDate: "2026-06-10", note: "Consulta por picazón estacional. Se indica Apoquel 16mg.", vetName: "Dra. Reyes" } }),
    ],
  });

  // Documents need a fileUrl — upload a demo image as the "scan".
  try {
    let docUrl;
    try {
      docUrl = await img("vet-cover.jpg");
    } catch {
      docUrl = null;
    }
    if (docUrl) {
      await topUp(A, r, {
        label: "document",
        listUrl: `/api/vet-record/documents?petId=${petId}`,
        listKey: "documents",
        target: 2,
        makers: [
          () => ({ path: "/api/vet-record/documents", idKey: "document", body: { petId, name: "Cartilla sanitaria", documentType: "Cartilla", fileUrl: docUrl, documentDate: "2026-07-30", category: "vaccine", notes: "Vacunas al día" } }),
          () => ({ path: "/api/vet-record/documents", idKey: "document", body: { petId, name: "Resultado de laboratorio", documentType: "Análisis", fileUrl: docUrl, documentDate: "2026-07-30", category: "lab" } }),
        ],
      });
    } else {
      r.note("documents skipped (no file URL)");
    }
  } catch (e) {
    r.error(`document: ${e.message}`);
  }

  await topUp(A, r, {
    label: "vaccination",
    listUrl: `/api/pet-vaccinations?petId=${petId}`,
    listKey: "vaccinations",
    target: 2,
    makers: [
      () => ({ path: "/api/pet-vaccinations", idKey: "vaccination", body: { petId, name: "Antirrábica", dateGiven: "2026-03-10", expiresOn: "2027-03-10", clinicName: "Veterinaria Palermo Sur", reminderEnabled: true } }),
      () => ({ path: "/api/pet-vaccinations", idKey: "vaccination", body: { petId, name: "Séxtuple", dateGiven: "2026-03-10", expiresOn: "2027-03-10", clinicName: "Veterinaria Palermo Sur", reminderEnabled: true } }),
    ],
  });

  // A vet appointment (also surfaces as an upcoming reminder).
  await topUp(A, r, {
    label: "vet appointment",
    listUrl: `/api/vet-appointments?petId=${petId}`,
    listKey: "appointments",
    target: 1,
    makers: [
      () => ({
        path: "/api/vet-appointments",
        idKey: "appointment",
        body: {
          petId,
          title: "Control anual",
          appointmentDate: dateOnly(daysAhead(14)),
          appointmentTime: "10:30",
          clinic: "Veterinaria Palermo Sur",
          veterinarian: "Dra. Camila Reyes",
          reasonForVisit: "Chequeo general y refuerzo de preventivos",
          reminderEnabled: true,
        },
      }),
    ],
  });

  // --- Emergency Card: minted on first GET, then set contact settings + a link.
  try {
    const cardRes = await A.get(`/api/emergency-card?petId=${petId}`);
    if (cardRes.ok && cardRes.data?.card) {
      r.created(`emergency card (token ${String(cardRes.data.card.tag_token).slice(0, 8)}…)`);
      const patch = await A.patch("/api/emergency-card", {
        petId,
        show_medical_on_tag: true,
        contact_mode: "phone",
        contact_value: "+54 11 6555-0199",
        blood_type: "DEA 1.1 negativo",
        extra_notes: "Responde a «Mango». Alérgico a pollo. Contacto 24h.",
        active: true,
      });
      if (patch.ok) r.created("emergency card settings");
      // A revocable vet share-link.
      const links = await A.get(`/api/emergency-card?petId=${petId}`);
      const haveLinks = (links.data?.links || []).length;
      if (haveLinks < 1) {
        const link = await A.post("/api/emergency-card/links", { petId, scope: "full", ttlHours: 720 });
        if (link.ok) r.created("emergency card share-link");
        else r.error(`emergency link: ${link.status} ${JSON.stringify(link.data).slice(0, 120)}`);
      } else {
        r.skipped(`emergency card link (${haveLinks} already)`);
      }
    } else {
      r.error(`emergency card: ${cardRes.status} ${JSON.stringify(cardRes.data).slice(0, 140)}`);
    }
  } catch (e) {
    r.error(`emergency card: ${e.message}`);
  }
}
