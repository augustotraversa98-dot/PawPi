// The week / day calendar of bookings (/provider/calendar). Its booking actions come from bookings.js.

export default {
  en: {
    title: "Calendar",
    listView: "List view",
    // The English values are the view names; the screen capitalises them.
    views: {
      week: "week",
      day: "day",
    },
    previous: "Previous",
    next: "Next",
    today: "Today",
    loading: "Loading calendar…",
    loadError: "Couldn't load the calendar",
    tryAgain: "Please try again.",
    empty: {
      week: "No bookings this week",
      day: "No bookings this day",
    },
    emptyBody: "Bookings owners make will appear on the grid.",
    bookingFallback: "Booking",
    paid: "Paid",
    unpaid: "Unpaid",
    details: {
      aria: "Booking details",
      close: "Close",
      owner: "Owner",
      service: "Service",
      pet: "Pet",
      location: "Location",
      houseVisit: "House visit",
      status: "Status",
      payment: "Payment",
      notes: "Notes",
      assignTo: "Assign to",
      noActiveStaff: "No active staff to assign.",
      readOnly: "Read-only booking",
    },
    // Stored species; English shows the stored value.
    species: {
      dog: "dog",
      cat: "cat",
    },
    server: {
      rangeRequired: "from and to are required for the calendar view",
    },
  },
  es: {
    title: "Calendario",
    listView: "Ver lista",
    views: {
      week: "Semana",
      day: "Día",
    },
    previous: "Anterior",
    next: "Siguiente",
    today: "Hoy",
    loading: "Cargando calendario…",
    loadError: "No pudimos cargar el calendario",
    tryAgain: "Probá de nuevo.",
    empty: {
      week: "No hay reservas esta semana",
      day: "No hay reservas este día",
    },
    emptyBody: "Las reservas que hagan los dueños van a aparecer en el calendario.",
    bookingFallback: "Reserva",
    paid: "Pagada",
    unpaid: "Sin pagar",
    details: {
      aria: "Detalle de la reserva",
      close: "Cerrar",
      owner: "Dueño",
      service: "Servicio",
      pet: "Mascota",
      location: "Ubicación",
      houseVisit: "Visita a domicilio",
      status: "Estado",
      payment: "Pago",
      notes: "Notas",
      assignTo: "Asignar a",
      noActiveStaff: "No hay integrantes activos para asignar.",
      readOnly: "Reserva de solo lectura",
    },
    species: {
      dog: "Perro",
      cat: "Gato",
    },
    server: {
      rangeRequired: "Falta el rango de fechas del calendario.",
    },
  },
};
