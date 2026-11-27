// The dashboard home (/provider) and its "Getting started" card.

export default {
  en: {
    title: "Dashboard",
    subtitle: "Your business at a glance — only this provider's data.",
    loadError: "Couldn't load your dashboard.",
    stats: {
      revenue: "Revenue (paid)",
      paidOrders: { one: "{count} paid orders", other: "{count} paid orders" },
      bookings: "Bookings",
      upcoming: { one: "{count} upcoming", other: "{count} upcoming" },
      occupancy: "Occupancy",
      bookedAhead: { one: "{count} booked ahead", other: "{count} booked ahead" },
      rating: "Avg rating",
      reviews: { one: "{count} review", other: "{count} reviews" },
    },
    charts: {
      revenueByMonth: "Revenue by month ({currency})",
      noPaidOrders: "No paid orders yet.",
      bookingsByMonth: "Bookings by month",
      noBookings: "No bookings yet.",
      topServices: "Top services",
      noServiceBookings: "No service bookings yet.",
      // Series names shown in the chart tooltips.
      revenueSeries: "revenue",
      bookingsSeries: "booking_count",
    },
    upcomingList: {
      title: "Upcoming bookings",
      inbox: "Inbox",
      empty: "No upcoming bookings.",
      petFallback: "Pet",
      bookingFallback: "Booking",
    },
    gettingStarted: {
      title: "Getting started",
      progress: "{completed} of {total} done — finish setting up your storefront.",
      doneTitle: "You're all set! 🎉",
      doneBody: "Your storefront has everything it needs to shine.",
      items: {
        profile: { title: "Complete your business profile", desc: "Add a logo and a short description" },
        offering: { title: "Add what you offer", desc: "List a service or a product" },
        hours: { title: "Set your hours", desc: "Add your open hours so people can book" },
        location: { title: "Add a location", desc: "Put your business on the map" },
        post: { title: "Share your first post", desc: "Introduce your business to followers" },
      },
    },
  },
  es: {
    title: "Panel",
    subtitle: "Tu negocio de un vistazo, solo con sus propios datos.",
    loadError: "No pudimos cargar tu panel.",
    stats: {
      revenue: "Ingresos (cobrados)",
      paidOrders: { one: "{count} orden pagada", other: "{count} órdenes pagadas" },
      bookings: "Reservas",
      upcoming: { one: "{count} próxima", other: "{count} próximas" },
      occupancy: "Ocupación",
      bookedAhead: {
        one: "{count} reservada por adelantado",
        other: "{count} reservadas por adelantado",
      },
      rating: "Calificación promedio",
      reviews: { one: "{count} reseña", other: "{count} reseñas" },
    },
    charts: {
      revenueByMonth: "Ingresos por mes ({currency})",
      noPaidOrders: "Todavía no hay órdenes pagadas.",
      bookingsByMonth: "Reservas por mes",
      noBookings: "Todavía no hay reservas.",
      topServices: "Servicios más reservados",
      noServiceBookings: "Todavía no hay reservas de servicios.",
      revenueSeries: "Ingresos",
      bookingsSeries: "Reservas",
    },
    upcomingList: {
      title: "Próximas reservas",
      inbox: "Ver todas",
      empty: "No tenés próximas reservas.",
      petFallback: "Mascota",
      bookingFallback: "Reserva",
    },
    gettingStarted: {
      title: "Primeros pasos",
      progress: "{completed} de {total} listos: terminá de armar tu vidriera.",
      doneTitle: "¡Todo listo! 🎉",
      doneBody: "Tu vidriera tiene todo lo que necesita para lucirse.",
      items: {
        profile: {
          title: "Completá el perfil de tu negocio",
          desc: "Agregá un logo y una descripción corta",
        },
        offering: { title: "Sumá lo que ofrecés", desc: "Publicá un servicio o un producto" },
        hours: {
          title: "Definí tus horarios",
          desc: "Agregá tu horario de atención para que puedan reservar",
        },
        location: { title: "Agregá una ubicación", desc: "Poné tu negocio en el mapa" },
        post: {
          title: "Compartí tu primera publicación",
          desc: "Presentá tu negocio a quienes te siguen",
        },
      },
    },
  },
};
