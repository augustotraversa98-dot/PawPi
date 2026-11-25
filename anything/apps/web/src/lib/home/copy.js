// Homepage copy, both languages — the ONE source for everything the public homepage says. HomePage
// renders it, lib/home/meta.js builds the <head> from it, and any other rendering of the page (e.g. a
// text version) must read it from here so the two never drift. Leaf module: no React, no router.
//
// Every claim below describes something that exists in the app today (docs/app-store-connect-content*.md
// and anything/apps/mobile). Screenshot captions come from docs/store/screenshot-storyboard.md.
// Spanish is es-AR (voseo).

// Anchor ids on the homepage; the footer links to them from every public page.
export const SECTION_IDS = {
  features: "features",
  screenshots: "screenshots",
  audiences: "audiences",
};

const shot = (file, height = 1341) => ({
  src: `/images/home/${file}.webp`,
  width: 640,
  height,
});

// Web derivatives of the store screenshots (device frame, transparent background).
export const HOME_IMAGES = {
  profile: shot("profile"),
  feed: shot("feed"),
  birthday: shot("birthday"),
  share: shot("share", 1105),
  health: shot("health"),
  vet: shot("vet"),
  services: shot("services"),
  community: shot("community"),
  adoption: shot("adoption"),
};

export const HOME_COPY = {
  es: {
    title: "PawPi — Tu perro. Toda su vida, en un solo lugar.",
    description:
      "La app para personas con perros: salud y recordatorios, historia clínica, feed social, familia y cuidadores, comunidad, adopción y servicios. En el App Store.",
    hero: {
      title: ["Tu perro.", "Toda su vida, en un solo lugar."],
      sub: "Salud y recordatorios, historia clínica, momentos diarios, familia y cuidadores, comunidad, adopción y servicios — todo en una sola app para iPhone.",
      // The app screens are in Spanish, so the Spanish page needs no note.
      screensNote: null,
      image: "profile",
      alt: "Perfil de un perro en PawPi, con sus momentos diarios, patitas y ladridos.",
    },
    featuresEyebrow: "Qué es PawPi",
    features: [
      { title: "Feed y perfiles", body: "Momentos diarios, patitas, ladridos, rachas y cumpleaños." },
      {
        title: "Salud y rutinas",
        body: "Recordatorios de comida, paseos, cuidados médicos y turnos veterinarios, con una vista de Hoy.",
      },
      {
        title: "Historia clínica",
        body: "Vacunas, medicación, documentos y una tarjeta médica de emergencia para compartir.",
      },
      {
        title: "Familia y cuidadores",
        body: "Compartí el cuidado de tu perro con el nivel de acceso que elijas, y revocalo cuando quieras.",
      },
      {
        title: "Entrenamiento y cuidado",
        body: "Programas para entrenar en casa, y paseadores, guarderías, cuidadores y adiestradores para contratar.",
      },
      {
        title: "Tiendas y veterinarias",
        body: "Descubrí veterinarias, telemedicina, peluquerías, tiendas, transporte y lugares pet friendly.",
      },
      {
        title: "Comunidad y perdidos",
        body: "Foro, eventos, paseos con otros y alertas de perros perdidos y encontrados.",
      },
      {
        title: "Adopción",
        body: "Perros para adoptar o dar en tránsito, con postulación desde la app.",
      },
    ],
    dailyEyebrow: "El día a día",
    daily: [
      {
        image: "feed",
        title: "Compartí cada momento",
        alt: "Feed de PawPi con fotos de perros, patitas y comentarios.",
      },
      {
        image: "birthday",
        title: "Cada cumpleaños, una celebración",
        alt: "Pantalla de Recuerdos con el saludo de cumpleaños de un perro y el botón Compartir.",
      },
      {
        image: "share",
        title: "Compartí sus mejores momentos",
        alt: "Tarjeta de PawPi para compartir, con la foto de un perro y su nombre de usuario.",
      },
    ],
    sections: [
      {
        key: "health",
        image: "health",
        eyebrow: "Salud · Hoy",
        title: "Comida, paseo y medicación, sin olvidos",
        bullets: [
          "Rutinas de comida, paseos, cuidados médicos, controles con foto, chequeos y turnos veterinarios.",
          "Cada ítem programado es su propio recordatorio, y la vista de Hoy muestra qué toca.",
          "El anillo del día reúne paseo, momento y cuidado, con una racha para cada perro.",
        ],
        // The app's own non-diagnostic wording (health.disclaimer). Keep it with this section.
        note: "PawPi te ayuda a registrar cambios y a prepararte para mejores conversaciones con tu veterinario. No diagnostica ni reemplaza la atención veterinaria profesional.",
        alt: "Centro de Salud de PawPi en la vista de Hoy, con el anillo del día completo.",
      },
      {
        key: "vet",
        image: "vet",
        eyebrow: "Historia clínica",
        title: "Todo el historial veterinario, ordenado",
        bullets: [
          "Vacunas, visitas y procedimientos, medicación, alergias, condiciones, resultados y documentos.",
          "Cada registro muestra quién lo agregó.",
          "Tarjeta médica de emergencia imprimible, con un enlace para compartir con tu veterinaria.",
        ],
        alt: "Historia clínica en PawPi con la lista de vacunas, sus fechas y vencimientos.",
      },
      {
        key: "services",
        image: "services",
        eyebrow: "Servicios",
        title: "Reservá veterinarios, peluqueros y más",
        bullets: [
          "Veterinarias, telemedicina, peluquerías, tiendas, transporte y lugares pet friendly, en lista o en mapa.",
          "Paseadores, guarderías, cuidadores y adiestradores en la sección Cuidado.",
          "Pedí turnos y chateá con los negocios que usan PawPi.",
        ],
        alt: "Buscador de servicios y lugares de PawPi, con filtros y resultados cercanos.",
      },
      {
        key: "community",
        image: "community",
        eyebrow: "Comunidad",
        title: "Encontrá tu comunidad canina",
        bullets: [
          "Un foro por temas: salud, comida, entrenamiento y más.",
          "Eventos, encuentros y paseos con otros cerca tuyo.",
          "Alertas de perros perdidos y encontrados.",
        ],
        alt: "Foro de la comunidad de PawPi con preguntas sobre salud, comida y entrenamiento.",
      },
      {
        key: "adoption",
        image: "adoption",
        eyebrow: "Adopción",
        title: "Encontrá un nuevo mejor amigo",
        bullets: [
          "Perros para adoptar o dar en tránsito, cerca tuyo.",
          "Guardá favoritos y filtrá la búsqueda.",
          "Postulate desde la app y seguí tu postulación.",
        ],
        alt: "Pantalla de Adopción de PawPi con dos perros disponibles cerca.",
      },
    ],
    audienceEyebrow: "Para quién es",
    audiences: [
      {
        title: "Dueños de perros",
        body: "Organizá la vida de tu perro y descubrí lugares, servicios y comunidad.",
        cta: { label: "Descargá la app", appStore: true },
      },
      {
        title: "Paseadores y proveedores",
        body: "Sumá tu servicio y llegá a más dueños cerca tuyo.",
        cta: { label: "Sumate", href: "/account/signup" },
      },
      {
        title: "Veterinarias y negocios",
        body: "Publicá tu negocio, o reclamá tu ficha desde la app, y gestioná reservas y clientes en un solo lugar.",
        cta: { label: "Listá tu negocio", href: "/account/signup" },
      },
    ],
    businessSignin: "¿Ya tenés una cuenta de negocio? Iniciá sesión",
    closing: {
      title: "Descargá PawPi",
      body: "Disponible para iPhone en el App Store.",
    },
  },
  en: {
    title: "PawPi — Your dog's whole life. In one place.",
    description:
      "The app for dog people: health and reminders, vet records, a social feed, family sharing, community, adoption, and services. On the App Store.",
    hero: {
      title: ["Your dog's whole life.", "In one place."],
      sub: "Health and reminders, vet records, daily moments, family sharing, community, adoption, and services — all in one iPhone app.",
      screensNote: "App screens are shown in Spanish.",
      image: "profile",
      alt: "A dog's profile in PawPi, in Spanish, with daily moments, paws and barks.",
    },
    featuresEyebrow: "What PawPi is",
    features: [
      { title: "Feed & profiles", body: "Daily moments, paws, barks, streaks and birthdays." },
      {
        title: "Health & routines",
        body: "Reminders for meals, walks, medical care and vet appointments, with a Today view.",
      },
      {
        title: "Vet record",
        body: "Vaccines, medications, documents and a shareable emergency medical card.",
      },
      {
        title: "Family & caregivers",
        body: "Share your dog's care at the access level you choose, and revoke it any time.",
      },
      {
        title: "Training & care",
        body: "Programs to train at home, plus walkers, daycares, sitters and trainers to hire.",
      },
      {
        title: "Stores & vets",
        body: "Discover vets, telehealth, groomers, shops, transport and pet-friendly places.",
      },
      {
        title: "Community & lost dogs",
        body: "A forum, events, group walks and lost-and-found alerts.",
      },
      {
        title: "Adoption",
        body: "Dogs to adopt or foster, with applications from the app.",
      },
    ],
    dailyEyebrow: "Day to day",
    daily: [
      {
        image: "feed",
        title: "Share every wag",
        alt: "The PawPi feed, in Spanish, with dog photos, paws and comments.",
      },
      {
        image: "birthday",
        title: "Every birthday, a celebration",
        alt: "The Memories screen, in Spanish, with a dog's birthday greeting and a share button.",
      },
      {
        image: "share",
        title: "Share their best moments",
        alt: "A PawPi share card, in Spanish, with a dog's photo and handle.",
      },
    ],
    sections: [
      {
        key: "health",
        image: "health",
        eyebrow: "Health · Today",
        title: "Never miss a meal, walk, or med",
        bullets: [
          "Routines for meals, walks, medical care, photo checks, wellness checks and vet appointments.",
          "Each scheduled item is its own reminder, and the Today view shows what's due.",
          "The daily care ring tracks walk, moment and care, with a streak for each dog.",
        ],
        note: "PawPi helps you track changes and prepare better conversations with your veterinarian. It does not diagnose or replace professional veterinary care.",
        alt: "PawPi's Health Center Today view, in Spanish, with the daily care ring complete.",
      },
      {
        key: "vet",
        image: "vet",
        eyebrow: "Vet record",
        title: "Every vet record, organized",
        bullets: [
          "Vaccines, visits and procedures, medications, allergies, conditions, lab results and documents.",
          "Each record shows who added it.",
          "A printable emergency medical card, with a link you can share with your vet.",
        ],
        alt: "The vet record in PawPi, in Spanish, listing vaccines with their dates and expiry.",
      },
      {
        key: "services",
        image: "services",
        eyebrow: "Services",
        title: "Book trusted vets, groomers & more",
        bullets: [
          "Vets, telehealth, groomers, shops, transport and pet-friendly places, in a list or on a map.",
          "Walkers, daycares, sitters and trainers in the Care tab.",
          "Request bookings and message the businesses that use PawPi.",
        ],
        alt: "PawPi's services and places search, in Spanish, with filters and nearby results.",
      },
      {
        key: "community",
        image: "community",
        eyebrow: "Community",
        title: "Find your local dog community",
        bullets: [
          "A forum organized by topic: health, food, training and more.",
          "Events, meetups and group walks near you.",
          "Lost-and-found alerts.",
        ],
        alt: "The PawPi community forum, in Spanish, with questions about health, food and training.",
      },
      {
        key: "adoption",
        image: "adoption",
        eyebrow: "Adoption",
        title: "Find a new best friend",
        bullets: [
          "Dogs to adopt or foster, near you.",
          "Save favorites and filter your search.",
          "Apply from the app and follow your application.",
        ],
        alt: "PawPi's Adoption screen, in Spanish, with two dogs available nearby.",
      },
    ],
    audienceEyebrow: "Who it's for",
    audiences: [
      {
        title: "Dog owners",
        body: "Organize your dog's whole life and discover places, services, and community.",
        cta: { label: "Get the app", appStore: true },
      },
      {
        title: "Walkers & providers",
        body: "List your service and reach more owners near you.",
        cta: { label: "Join", href: "/account/signup" },
      },
      {
        title: "Vets & businesses",
        body: "List your business, or claim your listing in the app, and manage bookings and clients in one place.",
        cta: { label: "List your business", href: "/account/signup" },
      },
    ],
    businessSignin: "Already have a business account? Sign in",
    closing: {
      title: "Get PawPi",
      body: "Available for iPhone on the App Store.",
    },
  },
};
