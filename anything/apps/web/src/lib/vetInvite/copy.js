// Copy for inviting a vet by link, both languages: the invite page (/vet-invite) and the provider panel's
// "Shared with us" list. Spanish is es-AR (voseo). Leaf module: no React, no router.

export const VET_INVITE_COPY = {
  en: {
    documentTitle: "Vet invite · PawPi",
    languageLabel: "Language",
    title: "Invitation for your vet clinic",
    loading: "Opening the invitation…",
    noLink: {
      title: "Open your invite link",
      body: "This page opens from the link a pet owner sent you. Open that link again.",
    },
    signedOut: {
      title: "Sign in to see this invitation",
      body: "A pet owner invited your vet clinic. Sign in with your business account, or create one, to continue.",
      signIn: "Sign in",
      signUp: "Create an account",
    },
    noBusiness: {
      title: "You need a vet business account",
      body: "This invitation is for a vet clinic. Your account isn't part of a published business that offers veterinary care. Set one up in the provider area, then open the invite link again. If you created this link for your pet, send it to your vet.",
      provider: "Go to the provider area",
      signOut: "Use another account",
    },
    invalid: {
      title: "This link isn't valid",
      body: "It may have expired, been used or been withdrawn. Ask the owner for a new one.",
    },
    invite: {
      heading: "{owner} invited your clinic to see {pet}'s record",
      someone: "A pet owner",
      pet: "Pet",
      owner: "Owner",
      expires: "Link valid until {date}",
      business: "Clinic",
      choose: "Choose a clinic",
      explain:
        "Asking for access sends the owner a request. You can't see anything in the record unless they approve it, and they choose what to share.",
      accept: "Ask for access",
      accepting: "Sending…",
    },
    requested: {
      title: "Request sent",
      body: "The owner now decides what to share about {pet}. Once they approve, you'll find {pet} under Clinical, in “Shared with us”.",
    },
    alreadyOpen: {
      title: "Already requested or shared",
      body: "Your clinic already has a pending request or access for {pet}. Check Clinical in the provider area.",
    },
    openClinical: "Go to Clinical",
    errors: {
      tooMany: "Too many attempts. Wait a few minutes and try again.",
      generic: "Something went wrong. Try again.",
      retry: "Try again",
    },
    shared: {
      title: "Shared with us",
      body: "Pets whose owner is sharing the record with your clinic now.",
      open: "Open record",
    },
  },
  es: {
    documentTitle: "Invitación para veterinarias · PawPi",
    languageLabel: "Idioma",
    title: "Invitación para tu veterinaria",
    loading: "Abriendo la invitación…",
    noLink: {
      title: "Abrí tu enlace de invitación",
      body: "Esta página se abre desde el enlace que te mandó el dueño de una mascota. Volvé a abrir ese enlace.",
    },
    signedOut: {
      title: "Iniciá sesión para ver esta invitación",
      body: "El dueño de una mascota invitó a tu veterinaria. Iniciá sesión con la cuenta de tu negocio, o creá una, para continuar.",
      signIn: "Iniciar sesión",
      signUp: "Crear una cuenta",
    },
    noBusiness: {
      title: "Necesitás una cuenta de negocio veterinario",
      body: "Esta invitación es para una veterinaria. Tu cuenta no pertenece a un negocio publicado que ofrezca atención veterinaria. Configurá uno en el área de proveedores y volvé a abrir el enlace. Si creaste este enlace para tu mascota, mandáselo a tu veterinario.",
      provider: "Ir al área de proveedores",
      signOut: "Usar otra cuenta",
    },
    invalid: {
      title: "Este enlace no es válido",
      body: "Puede que haya vencido, que ya se haya usado o que lo hayan anulado. Pedile uno nuevo al dueño.",
    },
    invite: {
      heading: "{owner} invitó a tu veterinaria a ver la ficha de {pet}",
      someone: "El dueño de una mascota",
      pet: "Mascota",
      owner: "Dueño",
      expires: "Enlace válido hasta el {date}",
      business: "Veterinaria",
      choose: "Elegí una veterinaria",
      explain:
        "Al pedir acceso, le mandás una solicitud al dueño. No vas a ver nada de la ficha si no la aprueba, y elige qué compartir.",
      accept: "Pedir acceso",
      accepting: "Enviando…",
    },
    requested: {
      title: "Solicitud enviada",
      body: "Ahora el dueño decide qué compartir sobre {pet}. Cuando lo apruebe, vas a encontrar a {pet} en Clinical, en “Compartidas con nosotros”.",
    },
    alreadyOpen: {
      title: "Ya está pedido o compartido",
      body: "Tu veterinaria ya tiene una solicitud pendiente o acceso para {pet}. Revisá Clinical en el área de proveedores.",
    },
    openClinical: "Ir a Clinical",
    errors: {
      tooMany: "Demasiados intentos. Esperá unos minutos y probá de nuevo.",
      generic: "Algo salió mal. Probá de nuevo.",
      retry: "Probar de nuevo",
    },
    shared: {
      title: "Compartidas con nosotros",
      body: "Mascotas cuyo dueño está compartiendo la ficha con tu veterinaria en este momento.",
      open: "Abrir ficha",
    },
  },
};
