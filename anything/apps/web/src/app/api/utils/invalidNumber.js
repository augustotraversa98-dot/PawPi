// The 400 for a number the server will not guess at (lib/decimal.js reads them). Installed app builds show `error`
// as it comes, so it is written in the caller's language (utils/rateLimit.js pickLocale); both are also included.

import { DISTANCE_MAX, weightLimit } from "@/lib/decimal";
import { pickLocale } from "./rateLimit";

const MESSAGES = {
  weight_invalid: {
    en: "Enter a valid weight, up to {max} {unit}, for example 12.5.",
    es: "Ingresá un peso válido, de hasta {max} {unit}, por ejemplo 12,5.",
  },
  distance_invalid: {
    en: `Enter a valid distance, up to ${DISTANCE_MAX}, for example 2.5.`,
    es: `Ingresá una distancia válida, de hasta ${DISTANCE_MAX}, por ejemplo 2,5.`,
  },
  speed_invalid: {
    en: "Enter a valid average speed, up to {max}, for example 3.5.",
    es: "Ingresá una velocidad promedio válida, de hasta {max}, por ejemplo 3,5.",
  },
  whole_number_invalid: {
    en: "Enter a whole number, without commas or dots.",
    es: "Ingresá un número entero, sin comas ni puntos.",
  },
};

export function invalidWeightResponse(request, unit, field = "weight") {
  return invalidNumberResponse(request, "weight_invalid", field, weightLimit(unit));
}

// `values` fills the {placeholders}; `field` names the request field that was refused.
export function invalidNumberResponse(request, code, field, values = {}) {
  const text = (lang) =>
    MESSAGES[code][lang].replace(/\{(\w+)\}/g, (match, name) => String(values[name] ?? match));
  return Response.json(
    {
      error: text(pickLocale(request)),
      code,
      field,
      message_en: text("en"),
      message_es: text("es"),
    },
    { status: 400 },
  );
}
