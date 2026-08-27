# PawPi — Contenido de App Store Connect (es-AR)

Versión en español (Argentina, voseo) del pack de contenidos para App Store Connect. Este documento
es la **equivalencia es-AR** de `docs/app-store-connect-content.md`. Los límites de caracteres son los
de Apple; los conteos entre paréntesis están dentro del límite. Pegar cada campo en la localización
**Spanish (Mexico)** o **Spanish** de ASC según corresponda para el mercado AR.

> Docs compañeros: `docs/app-store-readiness.md` (compliance) y `docs/legal/` (Privacidad + Términos).

---

## 1. Identidad de la app

| Campo | Valor | Límite |
|---|---|---|
| **App Name** | PawPi | ≤ 30 |
| **Subtítulo** | Cuidá y conectá a tu perro (26/30) | ≤ 30 |
| **Bundle ID** | `com.pawpi.app` | — |
| **Idioma principal** | English (U.S.) — es-AR es localización adicional | — |
| **Copyright** | © 2026 Augusto Traversa | — |
| **SKU** | PAWPI-IOS-001 | — |

## 2. Categoría

**Primaria: Estilo de vida (Lifestyle). Sin categoría secundaria.**

Misma decisión que en la versión en inglés: Estilo de vida es la casa estándar de apps de mascotas y
evita sobre-señalar reclamos médicos.

## 3. Texto promocional (≤ 170, editable sin revisión)

> Seguí la salud de tu perro, poné recordatorios inteligentes, compartí momentos y reservá veterinarios, peluqueros, paseadores y más — todo en una app.

(150/170)

## 4. Descripción (≤ 4000)

```
PawPi es la app integral para personas con perros: reúne la salud, el día a día y el cuidado de tu perro en un solo lugar cálido y simple.

SEGUÍ LA SALUD, COMO CORRESPONDE
Registrá peso, chequeos de bienestar, fotos, medicación y vacunas. Llevá una historia clínica real: perfil médico, alergias, condiciones, recetas, resultados de laboratorio y documentos. PawPi te ayuda a registrar cambios y a preparar mejores conversaciones con tu veterinario/a — no diagnostica ni reemplaza la atención veterinaria profesional.

RECORDATORIOS Y RUTINAS INTELIGENTES
Configurá comidas, paseos, controles con foto, cuidados médicos, chequeos y turnos veterinarios. Cada ítem programado es su propio recordatorio, así no se te pasa nada — y tu vista de "Hoy" muestra exactamente qué toca.

UN FEED SOCIAL PARA TU PERRO
Dale un perfil a tu perro, compartí momentos del día, sumá patitas y ladridos, y hacé amigos. Armá una racha y celebrá cumpleaños y días de adopción.

COMUNIDAD
Sumate al foro, encontrá eventos y encuentros cerca, paseá con otros y ayudá a reunir perros perdidos con las alertas de perdidos y encontrados.

TODO LO QUE TU PERRO NECESITA, RESERVABLE
Descubrí y reservá proveedores de confianza — veterinaria y telemedicina, peluquería, paseos, guardería y hospedaje, cuidado, entrenamiento, transporte, farmacias y seguros — chateá, pagá de forma segura y dejá reseñas. Comprá productos y encontrá perros para adoptar o dar en tránsito.

FAMILIA Y CUIDADO COMPARTIDO
Compartí el cuidado de tu perro con familiares y cuidadores, con el nivel de acceso que elijas, y revocalo cuando quieras.

PENSADA PARA TU TRANQUILIDAD
Una tarjeta médica de emergencia imprimible, control total de tu cuenta y tus datos, y la opción de eliminar tu cuenta cuando quieras, desde la app.

Las funciones de salud de PawPi son solo para registro y organización y no brindan diagnóstico ni tratamiento veterinario. Consultá siempre a un veterinario/a matriculado/a.
```

## 5. Palabras clave (≤ 100, separadas por coma, sin espacios después de la coma)

```
perro,cachorro,mascota,veterinaria,salud,recordatorios,paseador,adopcion,comunidad,rescate
```

(90/100. Se acortó respecto del §13 del pack en inglés — "cuidado mascota", "historia clinica" y
"salud perro" duplicaban "perro" + "cuidado" + "salud" que ya están sueltos y sumaban al límite.)

## 6. URLs

| Campo | Valor |
|---|---|
| **Support URL** (obligatorio) | https://augustotraversa98-dot.github.io/pawpi-legal/support |
| **Marketing URL** (opcional) | https://www.pawpi.info |
| **Privacy Policy URL** (obligatorio) | https://augustotraversa98-dot.github.io/pawpi-legal/privacy |

Las páginas legales todavía están en inglés; ASC acepta reutilizar las mismas URLs para es. Si más
adelante publicamos `/es`, se cambian solo acá.

## 7. Novedades ("What's New") — v1.0

> ¡Bienvenido/a a PawPi! La app integral para personas con perros: salud, recordatorios inteligentes, un feed social para tu perro, comunidad y un mercado de servicios de confianza. Nos encantaría tu opinión.

(206/4000)

---

## 8. Cuestionario de clasificación por edad — respuestas recomendadas

PawPi tiene contenido generado por usuarios, red social y mensajería, así que va a caer en una banda
adolescente. **Recomendado: responder el cuestionario con honestidad; se espera ~13+.** Respuestas
clave:

- Contenido generado por usuarios / social: **Sí** (feed, foro, perfiles, mensajería, eventos).
- Acceso web sin restricciones: **No** (la app no incluye un navegador abierto).
- Violencia / contenido sexual / lenguaje soez / temas para adultos / juego / drogas: **Ninguno**.
- Concursos: **No**.

> ⚠️ **Guía 1.2 (UGC) — confirmar antes de enviar.** Como los usuarios publican y se envían mensajes,
> Apple exige: (1) **filtrar** contenido inapropiado, (2) **reportar** contenido ofensivo, (3)
> **bloquear** usuarios abusivos y (4) **datos de contacto publicados**. Verificar que cada uno
> exista (report + block en posts, perfiles y mensajes; moderación; contacto de soporte). Si falta
> algo, es ticket previo a la submission.

## 9. Privacidad de la app ("etiquetas nutricionales") — qué declarar

Nada de esto se usa para **Tracking**, ni para publicidad de terceros. El manifiesto de privacidad de
iOS ya declara `NSPrivacyTracking: false`. Declarar como **recolectado** y (salvo indicación
contraria) **vinculado a la identidad del usuario**, con propósito **App Functionality**:

| Tipo de dato | Específicos | Propósito | ¿Vinculado? |
|---|---|---|---|
| Datos de contacto | Correo, Nombre | App Functionality, Cuenta | Sí |
| Contenido del usuario | Fotos o videos; otro contenido (registros de mascota y salud, posts, mensajes, reseñas); Atención al cliente | App Functionality | Sí |
| Ubicación | Ubicación precisa | App Functionality (funciones "cerca") — **no** tracking | Sí |
| Identificadores | ID de usuario | App Functionality | Sí |
| Historial de compras | Referencias de órdenes/reservas/transacciones | App Functionality | Sí |

Notas / decisiones a confirmar:

- **Información financiera:** credenciales de tarjeta/wallet las manejan los procesadores de pago; no
  las guarda PawPi. Se declara **Historial de compras** (qué se compró), no Payment Info.
- **Diagnóstico / Datos de uso:** declarar **NINGUNO**. `@sentry/react-native` es un shim que no
  recolecta nada; no hay SDK de analítica.
- **Salud:** los registros de salud de la mascota se tratan como **User Content**, no como Apple
  "Health & Fitness" (esa categoría es para datos de salud del propio usuario vía HealthKit).
- **Eliminación de datos:** responder **Sí**, la app ofrece eliminación de cuenta (Ajustes →
  Eliminar cuenta).

## 10. Notas para App Review (pegar en "Notes" del revisor)

> **ACCIÓN previa a enviar:** crear la cuenta demo de abajo *dentro de la app* (registro con
> email/contraseña) y llenarla para que los revisores no vean pestañas vacías: **un perro** (nombre,
> raza, foto), **2–3 posts/momentos**, **2–3 recordatorios** (ej.: una comida + un paseo + un turno
> veterinario) y **una entrada de historia clínica** (ej.: un peso o una vacuna). Es una cuenta real,
> llenada a mano — no data mock — así se cumple la regla de "no fake data". Si el registro por email
> requiere verificación, el alias `+` de Gmail entra en la casilla real.

```
CUENTA DEMO
Email: augustotraversa98+appreview@gmail.com
Contraseña: PawpiReview2026!
(Precargada con un perro, algunos posts y recordatorios de ejemplo para que todas las pestañas sean revisables.)

PAGOS — PAGO EXTERNO INTENCIONAL (Guía 3.1.3(e))
Todos los flujos pagos son servicios del mundo real o bienes físicos (consultas veterinarias / telemedicina, peluquería, paseos, guardería y hospedaje, cuidado, entrenamiento, transporte, medicación física recetada, productos de tienda, gastos de adopción, primas de seguro, donaciones). No hay contenido solo-digital, moneda in-app, ni medios exclusivos de la app. El pago va por procesadores externos (MercadoPago / Binance Pay), permitido por 3.1.3(e). No se usa IAP.

ELIMINACIÓN DE CUENTA (Guía 5.1.1(v))
En la app: Ajustes → Eliminar cuenta → confirmación en dos pasos → borra la cuenta y los datos que le pertenecen de forma irreversible.

UBICACIÓN
La ubicación precisa se pide solo para funciones "cerca" (lugares, paseos, transporte, eventos, distancia de adopción, perdidos y encontrados). La app funciona con la ubicación denegada.

LOGIN SOCIAL
"Continuar con Apple / Google" están controlados por env vars y pueden aparecer deshabilitados ("Próximamente") en este build hasta que se configuren las claves OAuth; el registro por email/contraseña funciona 100%. Sign in with Apple está implementado con paridad respecto a Google.

POSICIONAMIENTO DE SALUD (Guía 1.4.1)
PawPi es una herramienta de registro/organización con avisos no-diagnósticos a lo largo de la app; no diagnostica, no receta, no reemplaza atención veterinaria.

CONTENIDO GENERADO POR USUARIOS (Guía 1.2)
Toda superficie con UGC tiene acción de Reportar; cualquier usuario se puede Bloquear. El contenido objetable se revisa y remueve en 24 h, y un filtro on-submit revisa posts al momento de crearse. Contacto: support@pawpi.info.
```

## 11. Cumplimiento de exportación

`ITSAppUsesNonExemptEncryption: false` ya está en `app.json`, así que la pregunta de encriptación se
autoresuelve. Confirmar en el upload.

## 12. Screenshots

v1 es **solo iPhone** (`ios.supportsTablet: false`). Se pueden pegar las mismas capturas EN para la
localización es, o subir un set en español si más adelante se rearman. ASC reutiliza el set inglés
automáticamente si no se suben capturas específicas de es.

---

_Preparado como parte del pack de submission. Actualizar conteos si cambia la copy._
