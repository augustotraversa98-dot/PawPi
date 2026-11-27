// Messages that any screen of the panel can receive. Each `en` value is the text exactly as the server (or the
// shared upload helper, or the browser) sends it; `es` is what a Spanish reader sees. Messages of one area go in
// that area's own dictionary, under `server`. See lib/serverError.js.

export default {
  en: {
    unauthorized: "Unauthorized",
    sessionExpired: "Your session has expired. Please sign in again.",
    profileNotFound: "User profile not found",
    notAuthorized: "Not authorized for this provider",
    capabilityMissing: "Provider does not have the '{capability}' capability",
    nameAndTypeRequired: "name and provider_type are required",
    capabilitiesNotList: "capabilities must be an array",
    invalidCapability: "Invalid capability: {capability}",
    noPendingInvite: "No pending invite for this provider",
    uploadFailed: "Upload failed",
    uploadTooLarge: "Upload failed: File too large.",
    network: "Failed to fetch",
    networkSafari: "Load failed",
    networkFirefox: "NetworkError when attempting to fetch resource.",
  },
  es: {
    unauthorized: "Tu sesión venció. Iniciá sesión de nuevo.",
    sessionExpired: "Tu sesión venció. Iniciá sesión de nuevo.",
    profileNotFound: "No encontramos tu perfil.",
    notAuthorized: "No tenés permiso para hacer esto en este negocio.",
    capabilityMissing: "Este negocio no tiene activada la opción «{capability}».",
    nameAndTypeRequired: "El nombre y el tipo de negocio son obligatorios.",
    capabilitiesNotList: "La lista de lo que ofrece el negocio no es válida.",
    invalidCapability: "Una de las opciones elegidas no es válida ({capability}).",
    noPendingInvite: "Ya no tenés una invitación pendiente de este negocio.",
    uploadFailed: "No pudimos subir el archivo.",
    uploadTooLarge: "No pudimos subir el archivo: es demasiado grande.",
    network: "No pudimos conectarnos. Revisá tu conexión y probá de nuevo.",
    networkSafari: "No pudimos conectarnos. Revisá tu conexión y probá de nuevo.",
    networkFirefox: "No pudimos conectarnos. Revisá tu conexión y probá de nuevo.",
  },
};
