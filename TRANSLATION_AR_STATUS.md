# Argentine (es-AR) Voseo Submission Audit — DONE

Branch: `feat/es-ar-submission`. Scope: mobile app i18n + iOS permission strings + App Store listing.

## Files touched

- `anything/apps/mobile/src/i18n/locales/es.json` — voseo pass + leftovers translated
- `anything/apps/mobile/locales/es.json` — verified (already voseo, no changes needed)
- `docs/app-store-connect-content-es.md` — NEW, complete Spanish (es-AR) submission pack

## Key parity

- en.json leaves: 3184
- es.json leaves: 3184
- missing_in_es: 0 · extra_in_es: 0

## Phase 1 — Voseo consistency (neutral tú → voseo)

52 strings edited to voseo:

- [x] `care.walkerEntryBody` — Pide → Pedí, encuentra → encontrá
- [x] `health.trackerSoonBody` — puedes → podés
- [x] `health.careRing.empty` — Empieza → Empezá
- [x] `health.careRing.pauseHint` — Elige → Elegí
- [x] `health.careRing.hintWalk` — Registra → Registrá
- [x] `health.careRing.hintMoment` — Publica → Publicá
- [x] `health.careRing.hintCare` — Registra → Registrá
- [x] `notifications.bookingHint` — Toca → Tocá
- [x] `notifications.adoptionHint` — Toca → Tocá
- [x] `notifications.walkRequestHint` — Toca → Tocá
- [x] `map.tapToDrop` — Toca → Tocá
- [x] `map.addressPlaceholder` — Escribe → Escribí
- [x] `places.locationDenied` — Permite → Permití, ti → vos
- [x] `placeReviews.commentPlaceholder` — Escribe → Escribí
- [x] `placeReviews.submitFailedBody` — Intenta → Intentá
- [x] `events.empty` — ti → vos
- [x] `calendar.rsvpFirst` — Confirma → Confirmá, añadir → agregar
- [x] `booking.pickSlotTitle` — Elige → Elegí
- [x] `booking.pickSlotBody` — Elige → Elegí
- [x] `booking.pickDateForSlots` — Elige → Elegí
- [x] `providers.noMatchBody` — Prueba → Probá
- [x] `discover.subtitle` — Encuentra → Encontrá, ti → vos
- [x] `discover.mapComingSoonBody` — tienes → tenés (+ Aquí → Acá)
- [x] `discover.emptyBody` — Vuelve → Volvé
- [x] `discover.searchUnifiedPlaceholder` — Busca → Buscá
- [x] `discover.categoryPickerTitle` — Elige → Elegí
- [x] `discover.areaPickerTitle` — Elige → Elegí
- [x] `activity.a11yOpen` — Abre → Abrí
- [x] `activity.emptyMessages` — tienes → tenés
- [x] `activity.emptyBookings` — tienes → tenés
- [x] `activity.emptyOrders` — tienes → tenés
- [x] `activity.emptyPast` — tienes → tenés
- [x] `storefront.orderPlacedPayBody` — Completa → Completá
- [x] `business.home.emptyBody` — Comparte → Compartí
- [x] `business.home.switchTitle` — Elige → Elegí
- [x] `business.composer.heading` — Comparte → Compartí
- [x] `business.composer.subheading` — Publica → Publicá
- [x] `business.composer.captionLabel` — Agrega → Agregá
- [x] `business.composer.captionPlaceholder` — Cuéntanos → Contanos
- [x] `business.menu.subtitle` — Publica → Publicá, observa → observá
- [x] `business.today.walksHint` — Registra → Registrá, guarda → guardá
- [x] `business.profile.emptyBody` — Publica → Publicá
- [x] `business.adoption.searchPlaceholder` — Busca → Buscá
- [x] `business.adoption.noMatchesBody` — Prueba → Probá
- [x] `walkRequests.shareLocationHint` — Ayuda → Ayudá
- [x] `milestones.sendPaw` — Envía → Enviá
- [x] `share.deckEmpty.week_in_walks` — Registra → Registrá
- [x] `share.deckEmpty.streak` — Cierra → Cerrá
- [x] `share.deckEmpty.pet_of_the_day` — Agrega → Agregá
- [x] `gettingStarted.items.profile` — Completa → Completá
- [x] `gettingStarted.items.meal` — Registra → Registrá
- [x] `gettingStarted.items.post` — Comparte → Compartí

### Not changes (audit false positives — confirmed OK)

- `tu perro` — possessive `tu` (not pronoun `tú`), correct in voseo. No change.
- `vas` — 2s voseo of *ir* is `vas` (same form). No change.
- `estás` — 2s voseo is `estás` (identical form). No change.
- Nouns flagged by the imperative regex (kept as-is):
  - `notifications.booking_confirmedFallback` / `_declinedFallback` / `_cancelledFallback` → "Reserva …" = noun *booking*.
  - `bizNotifBell.biz_booking_change` → "Reserva modificada" = noun.
  - `nutrition.brand` → "Marca de alimento" = noun *brand*.
  - `business.profile.account` → "Cuenta" = noun *account*.
  - `health.reminders.settings.testScheduledTitle` / `reminderSettings.testScheduledTitle` → "Prueba programada" = noun *test*.

## Phase 2 — Untranslated English leftovers translated

3 strings translated to Spanish:

- [x] `notifications.welcomeTitle` — "PawPi Welcome 🐾" → "Bienvenida a PawPi 🐾"
- [x] `vetBusinessAccess.capShop` — "Pet shop" → "Tienda para mascotas"
- [x] `vetBusinessAccess.businessNamePlaceholder` — "Happy Paws Veterinary" → "Veterinaria Patitas Felices"

### Left as-is (cognates / universal / placeholder-only)

- `health.vetRecord.roleEditor` = "Editor" — same in both languages.
- `discover.placeCat.cafe` = "Cafés" — Spanish plural, already correct.
- `packStreaks.boop` = "Boop" — product coinage.
- `walkItem.paceNormal` = "normal" — cognate.
- `trackers.shared.no` / `noLabel`, `health.feeding.no` / `finishedNo` = "No" — same word in ES.
- Placeholder/emoji-only shells (`{{count}} min`, `{{xp}} XP`, `🎥 {{count}} video`, `🔥 {{count}}`, `-{{pct}}%`, `{{meal}} • {{time}} • {{pet}}`, `{{label}} *`).

## Phase 3 — iOS permission strings (`anything/apps/mobile/locales/es.json`)

Verified. All 8 `NS…UsageDescription` keys from `en.json` are present in Spanish, natural voseo (`hacés`, `puedas`, `creás`, `sacarle`, `guardá en tu galería`). No changes needed.

## Phase 4 — App Store Connect (es-AR) listing

New file `docs/app-store-connect-content-es.md`:

- §1 identity — subtitle 26/30
- §2 category — Lifestyle
- §3 promo text — 150/170
- §4 description — full voseo copy
- §5 keywords — trimmed to 90/100 (was 113/100 in the §13 draft — dropped duplicative "cuidado mascota", "historia clinica", "salud perro")
- §6 URLs — reuse hosted `pawpi-legal`
- §7 What's New — 206/4000
- §8 age rating notes — Spanish
- §9 privacy labels — Spanish
- §10 review notes — full Spanish translation with all guideline references
- §11 export compliance, §12 screenshots — brief Spanish notes

## Result

No user-facing English remains on the submission path in es.json. The submission pack is complete and voseo-consistent. Branch `feat/es-ar-submission` is ready for PR review.
