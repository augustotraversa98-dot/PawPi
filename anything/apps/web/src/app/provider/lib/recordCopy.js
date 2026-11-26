// Copy for the provider's clinical record screen (ProviderPetRecord), both languages: the ONE source for every word
// that screen shows. Spanish is es-AR (voseo). What the family typed (names, notes, file names) is shown as typed;
// only fixed values the app stores (spay/neuter status, photo body area) are translated here.
// Leaf module: no React, no router. recordCopy.test.js keeps the two languages in step.

export const RECORD_COPY = {
  en: {
    back: "Back to bookings",
    title: "Clinical record — {name}",
    thisPet: "this pet",
    consent:
      "Access is granted by the pet's owner and can be revoked anytime. Every view and entry is logged.",
    loading: "Loading record…",
    loadErrorTitle: "Couldn't load the record",
    tryAgain: "Please try again.",
    access: {
      requestedTitle: "Access requested — waiting for the owner to approve",
      requestedBody:
        "{name}'s owner approves clinical access from their PawPi app. Approval is effective immediately — refresh once they've granted it.",
      refresh: "Refresh",
      endedTitle: "Access to {name}'s record has ended",
      endedBody:
        "The owner revoked it, or it expired. You can request it again — they'll need to approve from their app.",
      requestTitle: "Request clinical access for {name}",
      requestBody:
        "You don't have access to this pet's medical record yet. Requesting sends the owner an approval in their PawPi app; once they approve, you can view and add notes and vaccinations.",
      requestAgain: "Request access again",
      request: "Request access",
    },
    toast: {
      revoked: "Access was revoked by the owner",
      requested: "Access requested",
      alreadyRequested: "Access already requested — waiting for approval",
      requestFailed: "Couldn't request access",
      noteAdded: "Note added",
      noteFailed: "Couldn't add note",
      vaccinationAdded: "Vaccination added",
      vaccinationFailed: "Couldn't add vaccination",
    },
    shared: {
      title: "The owner shared only some sections of the record",
      readOnly:
        "Read only: you can't add notes or vaccinations with this access.",
      shared: "Shared",
      notShared: "Not shared",
    },
    sections: {
      profile: "Medical profile",
      emergency_contact: "Emergency contact",
      insurance: "Insurance",
      vet_notes: "Vet notes",
      vaccines: "Vaccinations",
      files: "Files",
      photos: "Health photos",
      lab_results: "Lab results",
    },
    profile: {
      empty: "No medical profile on file for this pet yet.",
      microchip_id: "Microchip ID",
      spayed_neutered_status: "Spayed / neutered",
      spayed_neutered_date: "Spay / neuter date",
      primary_vet_name: "Primary vet",
      primary_clinic_name: "Primary clinic",
      vet_phone: "Vet phone",
      vet_email: "Vet email",
      medical_notes: "Medical notes",
    },
    spayValues: {
      Spayed: "Spayed",
      Neutered: "Neutered",
      "Not spayed/neutered": "Not spayed/neutered",
      Unknown: "Unknown",
    },
    emergencyContact: {
      empty: "No emergency contact on file.",
      emergency_contact_name: "Name",
      emergency_contact_phone: "Phone",
    },
    insurance: {
      empty: "No insurance details on file.",
      insurance_provider: "Insurer",
      insurance_policy_number: "Policy number",
    },
    notes: {
      addLabel: "Add a note",
      placeholder: "Exam findings, plan, observations…",
      required: "Note is required",
      date: "Date (optional)",
      add: "Add note",
      empty: "No vet notes yet.",
      booking: "Booking #{id}",
    },
    vaccinations: {
      writeHint:
        "Vaccinations you add here write to the pet's record and are visible to the owner in their app.",
      vaccine: "Vaccine",
      placeholder: "Rabies",
      required: "Vaccine name is required",
      dateGiven: "Date given",
      given: "Given",
      expires: "Expires",
      lot: "Lot",
      lotPlaceholder: "Lot #",
      add: "Add vaccination",
      empty: "No vaccinations on record yet.",
    },
    files: {
      empty: "No documents yet.",
      open: "Open file",
      unavailable: "File not available",
    },
    photos: {
      empty: "No health photos yet.",
      areas: {
        paws: "Paws",
        ears: "Ears",
        eyes: "Eyes",
        teeth: "Teeth",
        skin_fur: "Skin and coat",
        face: "Face",
        full_body: "Full body",
        other: "Other",
      },
    },
    labResults: {
      empty: "No lab results yet.",
      orderedBy: "Ordered by {name}",
    },
  },
  es: {
    back: "Volver a las reservas",
    title: "Historia clínica — {name}",
    thisPet: "esta mascota",
    consent:
      "El acceso lo da la persona dueña de la mascota, que puede revocarlo cuando quiera. Cada consulta y cada carga queda registrada.",
    loading: "Cargando la historia clínica…",
    loadErrorTitle: "No se pudo cargar la historia clínica",
    tryAgain: "Probá de nuevo.",
    access: {
      requestedTitle: "Acceso solicitado: falta la aprobación",
      requestedBody:
        "El acceso clínico a {name} se aprueba desde la app PawPi de su familia. La aprobación es inmediata: actualizá cuando te lo den.",
      refresh: "Actualizar",
      endedTitle: "Terminó tu acceso a la historia clínica de {name}",
      endedBody:
        "Lo revocaron o venció. Podés pedirlo de nuevo: lo tienen que aprobar desde la app.",
      requestTitle: "Pedí acceso clínico a {name}",
      requestBody:
        "Todavía no tenés acceso a la historia clínica de esta mascota. Si lo pedís, a su familia le llega una solicitud en la app PawPi; cuando la apruebe, vas a poder ver y agregar notas y vacunas.",
      requestAgain: "Pedir acceso de nuevo",
      request: "Pedir acceso",
    },
    toast: {
      revoked: "Revocaron el acceso",
      requested: "Acceso solicitado",
      alreadyRequested: "Ya hay una solicitud: falta la aprobación",
      requestFailed: "No se pudo pedir el acceso",
      noteAdded: "Nota agregada",
      noteFailed: "No se pudo agregar la nota",
      vaccinationAdded: "Vacuna agregada",
      vaccinationFailed: "No se pudo agregar la vacuna",
    },
    shared: {
      title: "Compartieron solo algunas partes de la historia clínica",
      readOnly:
        "Solo lectura: con este acceso no podés agregar notas ni vacunas.",
      shared: "Compartido",
      notShared: "No compartido",
    },
    sections: {
      profile: "Perfil médico",
      emergency_contact: "Contacto de emergencia",
      insurance: "Seguro",
      vet_notes: "Notas veterinarias",
      vaccines: "Vacunas",
      files: "Archivos",
      photos: "Fotos de salud",
      lab_results: "Estudios de laboratorio",
    },
    profile: {
      empty: "Todavía no hay un perfil médico cargado para esta mascota.",
      microchip_id: "Número de microchip",
      spayed_neutered_status: "Castración",
      spayed_neutered_date: "Fecha de castración",
      primary_vet_name: "Veterinaria o veterinario habitual",
      primary_clinic_name: "Clínica habitual",
      vet_phone: "Teléfono de la veterinaria",
      vet_email: "Email de la veterinaria",
      medical_notes: "Notas médicas",
    },
    spayValues: {
      Spayed: "Esterilizada",
      Neutered: "Castrado",
      "Not spayed/neutered": "Sin castrar/esterilizar",
      Unknown: "Desconocido",
    },
    emergencyContact: {
      empty: "No hay un contacto de emergencia cargado.",
      emergency_contact_name: "Nombre",
      emergency_contact_phone: "Teléfono",
    },
    insurance: {
      empty: "No hay datos de seguro cargados.",
      insurance_provider: "Compañía",
      insurance_policy_number: "Número de póliza",
    },
    notes: {
      addLabel: "Agregá una nota",
      placeholder: "Hallazgos del examen, plan, observaciones…",
      required: "Escribí la nota",
      date: "Fecha (opcional)",
      add: "Agregar nota",
      empty: "Todavía no hay notas veterinarias.",
      booking: "Reserva n.º {id}",
    },
    vaccinations: {
      writeHint:
        "Las vacunas que agregues acá quedan en la historia de la mascota y su familia las ve en la app.",
      vaccine: "Vacuna",
      placeholder: "Antirrábica",
      required: "Escribí el nombre de la vacuna",
      dateGiven: "Fecha de aplicación",
      given: "Aplicada",
      expires: "Vence",
      lot: "Lote",
      lotPlaceholder: "N.º de lote",
      add: "Agregar vacuna",
      empty: "Todavía no hay vacunas registradas.",
    },
    files: {
      empty: "Todavía no hay documentos.",
      open: "Abrir archivo",
      unavailable: "Archivo no disponible",
    },
    photos: {
      empty: "Todavía no hay fotos de salud.",
      areas: {
        paws: "Patas",
        ears: "Orejas",
        eyes: "Ojos",
        teeth: "Dientes",
        skin_fur: "Piel y pelaje",
        face: "Cara",
        full_body: "Cuerpo entero",
        other: "Otra zona",
      },
    },
    labResults: {
      empty: "Todavía no hay estudios de laboratorio.",
      orderedBy: "Pedido por {name}",
    },
  },
};

export function fill(template, values) {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ""));
}

// A date column or timestamp as the screen shows it: YYYY-MM-DD in English, dd/MM/yyyy in Spanish.
export function formatRecordDate(value, lang) {
  if (!value) return "—";
  const day = String(value).slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  return lang === "es" && match ? `${match[3]}/${match[2]}/${match[1]}` : day;
}

const PRIVATE_KEY = /^pets\/\d+\/[a-zA-Z0-9._-]+$/;

// Where a stored file opens from: a private key goes through the authenticated media route as this provider; an
// https address opens as it is; anything else is not linked.
export function recordFileHref(value, providerId) {
  if (typeof value !== "string") return null;
  if (PRIVATE_KEY.test(value) && !value.includes("..")) {
    return `/api/media?key=${encodeURIComponent(value)}&providerId=${encodeURIComponent(providerId)}`;
  }
  return /^https:\/\//i.test(value) ? value : null;
}
