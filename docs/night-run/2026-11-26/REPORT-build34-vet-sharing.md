# Night run 2026-11-26: finder flow, vet sharing and the new build

Plain-language report. Dates and times are Buenos Aires time. The file keeps the planned name "build34"; the build that
exists is **number 36**.

## 1. In short

- **Build 36 (version 1.0.5) was uploaded to App Store Connect for TestFlight** on 2026-11-26, about 15:05. Apple was
  still to process it; that was not checked. Nothing was submitted to App Review.
- The first attempt failed at Apple's signing step. You refreshed the signing profile and built again from the same code.
- Everything on the list was merged, including the stretch item (inviting a vet by link). #802 (server-side AI consent
  check) and the AI consent wording (#812) wait as drafts, as planned.
- Three database changes are live and verified. The website and server changes are live.

## 2. What was merged

| PR | What it does | Reaches people through |
|---|---|---|
| #804 | Finder flow: someone who finds your dog can leave their phone or email; you and your family are told; details are deleted after 90 days; urgent notification | Website now; app parts in build 36 |
| #807 | Privacy policy: the finder flow | Website now |
| #809 | Removed a website route nothing used | Website now |
| #808 | Automatic check that fails when a new screen part is declared inside another, the main pattern that closed the keyboard on every letter | Development only |
| #811 | Database change for sharing the vet record by parts (0147) | Production database |
| #813 | Tighten sender identification | Website now |
| #814 | Share the vet record by parts, with an end date; the vet sees only those parts | Website now |
| #816 | Sharing with a vet whose request is pending now approves it, instead of failing | Website now |
| #817 | The vet is told when access is given or ended | Website now; app display in build 36 |
| #815 | Privacy policy: sharing the vet record | Website now |
| #810 | App screens: choose parts and duration, see who can see what, revoke | Build 36 |
| #818 | Invite a vet who has no booking, by a one-time link (database change 0148) | Website now |
| #819 | Access changes stay consistent when two happen at once; hourly limit on sharing (never on revoking) | Website now; part in build 36 |
| #821 | App screens for the invite link | Build 36 |
| #822 | Creating an account from an invite returns you to the invite | Website now |
| #823 | A request that came from an invite, from a business without a booking, is answered by choosing parts | Website now |
| #820 | Privacy policy: vet invite links | Website now |
| #824 | Two fixes from the final checks: an error logged on the AI review screen, and seven iPhone permission texts that existed only in English | Build 36 |
| #825 | Tighten request origin checks | Website now |

Left as drafts on purpose: #812 (AI consent privacy wording, merge together with #802 once the new build is live) and
#802. The closing documentation pull request (this report) is not in the table.

## 3. What was applied to the production database

| Change | Applied | Check |
|---|---|---|
| 0146, finder flow | 2026-11-26 (before this run) | `verify_0146.sql`: **19 of 19 PASS** (run again, read-only) |
| 0147, sharing by parts | 2026-11-26, about 11:19 | `verify_0147.sql`: **24 of 24 PASS** |
| 0148, vet invites | 2026-11-26, about 12:55 | `verify_0148.sql`: **15 of 15 PASS** |

The confirmation step for database changes did open, so nothing had to be left behind as a draft.

Note: after 0148, row 24 of `verify_0147.sql` (the list of notification types) reads FAIL. That is expected: 0148 added
one more type.

Supabase advisors: security reports nothing after each change. Performance shows the same four kinds of notice as before
(unindexed foreign keys, unused indexes, multiple permissive policies, auth connection setting); no new kind. The
"multiple permissive policies" list now also names the new read rules.

## 4. The build

| Item | Value |
|---|---|
| Version and build number | 1.0.5 (**36**) |
| Built from commit | `103d79b6` on `main` (everything merged up to #824) |
| EAS build | [ff7a63c0](https://expo.dev/accounts/augusto-firulais/projects/pawpi/builds/ff7a63c0-abdd-4fc8-a966-e64145a49dad): finished |
| TestFlight | Uploaded to App Store Connect ([submission](https://expo.dev/accounts/augusto-firulais/projects/pawpi/submissions/3c540a4e-28c6-4461-bf97-83d234340d05)). **Processing, not verified.** |
| App Review | **Not submitted** |

**The Apple signing incident and its fix**
- The first build (attempted as 34) failed: the stored signing profile lacked the Time Sensitive Notifications capability.
- Fix: you removed that profile and rebuilt from the same commit with your Apple sign-in, which created a new one.

What `main` gained after `103d79b6` is website and documentation only.

## 5. What is in build 36, and what is not

**In the app:**
- Keyboard no longer hides or closes text fields (#799).
- Faster emergency card, notification filters shown whole, QR code sharing, Back returns to the More menu (#800).
- The app asks permission before AI reads a vet document, with a switch in Settings (#803), and names the AI provider
  (#797).
- Finder flow: new notification card with Call / Send email, the new emergency card switch, and the Time Sensitive
  Notifications permission (#804).
- Vet sharing: choose parts and duration, "who can see what" review, revoke (#810); the new sharing notices (#817);
  pending requests can be answered by parts.
- Invite a vet with a one-time link; see and withdraw invites (#821). This was the stretch item.
- The seven permission texts now in English and Spanish, and the review screen fix (#824).

**Not in the build / not live:**
- #802 (server-side AI consent check) stays a draft until the build is live.
- The AI consent privacy wording (#812) is not published.
- No email is sent for invites: you share the link from your phone.
- Not built: picking an invited vet without a booking from the vet list, and more record parts (allergies, conditions,
  medications, surgeries).
- Anything merged after the build commit is on the website only.

**Languages:** new and changed app screens, notifications, web pages and privacy sections have English and Argentine
Spanish (voseo). The vet's record screen on the website is now fully bilingual; the rest of the provider panel is still
English only, as are the web sign-in and sign-up pages.

## 6. NOT tested

- Real push delivery, and whether a notification breaks through a Focus (Time Sensitive). An Apple push key is set up
  on Expo, but no push was sent.
- A physical phone (iPhone), Android, VoiceOver.
- The signing flow on a device: the build was signed with a new profile and has not been installed on a phone. Screens
  were checked in the iOS Simulator (Expo Go) against a local copy of the server, so the new permission and the
  permission prompts on a phone are untested.
- On production only signed-out, read-only checks were made. No signed-in action, no finder message, no real invite,
  and your real tag page (no link was provided).
- Tapping a push notification; most screens in English in the Simulator; a real payment notification.
- In the Simulator: the file picker, declining the AI question ("Ahora no"), revoking access from the app after the
  final merge, and the public finder web page.

## 7. Checks

Before the build, on `f78fe874`; the only later change in the build commit is #824, checked by its own tests.

| Check | Result |
|---|---|
| Web tests | Passed: 386 files, 4031 tests (one slow file times out when the machine is busy; it passes alone) |
| Web tests against a real database | Passed: 165 files, 1995 passed, 1 skipped |
| App tests | Passed: 3841 + 37 (3850 + 37 after #824) |
| Nested component check | Passed |
| Urgent notification permission in the app settings | Present |
| Permission texts in English and Spanish | 7 of 14 were English only: fixed in #824 |
| Simulator (Spanish; Settings also in English) | Launch, emergency card, QR share, AI consent and its switch, finder notification card, vet sharing, back to the More menu: all worked. One logged error on the AI review screen: fixed in #824 |

After the build was uploaded (production, read-only): the public, invite and sign-in pages load, the invite and sign-in
pages render in a headless browser without errors, signed-out requests are refused, and the hourly weekly-digest job
succeeded. The daily jobs (subscriptions, win-back, calendar sync) were not due again until the next day.

## 8. What to test (TestFlight)

Use your own account and your own dog, never the demo account.

### English
- [ ] **1. Version:** More > Settings: the footer shows `PawPi v1.0.5 (36)`.
- [ ] **2. Keyboard:** edit the medical profile (contact name, notes), the vet summary questions, a weight note and your
  dog's profile. Typing keeps the keyboard open and the field visible.
- [ ] **3. Emergency card:** taps respond at once. "Share QR" (image and link) and "Copy link" work.
- [ ] **4. Notifications:** the filter buttons are fully visible, also with larger text.
- [ ] **5. Back:** open a screen from the More menu and go back: the menu opens again.
- [ ] **6. AI consent:** Health > Vet Record > "Scan or upload a document". The app asks before AI reads it; "Not now"
  leaves it unread. In Settings (Privacy & data) turn "Let PawPi read my documents" on and off.
- [ ] **7. Finder:** with the emergency card on "Relay (private)", open your tag link on another phone, leave a phone or
  email and a message. You (and family members with access) get a notification with "Call" / "Send email".
- [ ] **8. Urgent notification:** do step 7 the first time with a Focus on: it should break through (Time Sensitive
  notifications allowed for PawPi). A second message within 10 minutes arrives as a normal one, and so can later tests
  the same day (intended).
- [ ] **9. Emergency card settings:** with "Phone" selected and no number, the tag page shows the message form. "Show my
  emergency contact on the pet tag" is off by default; on, the tag page shows it; off, it is gone.
- [ ] **10. Share by parts, with an end date:** Health > Vet Record > Share. Nothing is pre-selected. Pick a vet you have
  a booking with, two parts and 7 days, "Review", agree, "Give access". The list shows exactly those parts and the end
  date. "Revoke access".
- [ ] **11. Replace:** share again with one other part: only the new choice remains.
- [ ] **12. Pending request:** on a vet's request for the record, More > My Hub > Who has access (Data Access) >
  "Choose what to share": only the ticked parts are given.
- [ ] **13. Invite:** at the bottom of the sharing sheet, "Invite a vet by link": read the rules, "Create link and
  share", send it to a second account with a published vet business, open it on the web, ask for access. Nothing in the
  record is visible until you approve. Approve some parts. Create another invite and use "Withdraw invite" before it is
  opened.
- [ ] **14. Vet side (web):** the dog appears under Clinical > "Shared with us"; only the shared parts show; after you
  revoke, access ends on refresh.
- [ ] **15. Permission texts:** with the iPhone in Spanish, the permission questions PawPi shows (for example camera,
  photos, location) read in Spanish. The seven newly added texts (motion, contacts, Face ID, two for reminders, two for
  "always" location) belong to permissions the app does not ask for in normal use, so you may not see them.
- [ ] **16. Website and sign-in** (the website part needs no build): on the web, sign in and save a change in the
  provider panel; create an account from an invite; use "forgot password". In the app, sign in with email, Apple and
  Google, save a change and upload a photo.

### Español (es-AR)
- [ ] **1. Versión:** Más > Configuración: al pie figura `PawPi v1.0.5 (36)`.
- [ ] **2. Teclado:** editá el perfil médico (nombre del contacto, notas), las preguntas del resumen veterinario, una
  nota de peso y el perfil de tu perro. Al escribir, el teclado queda abierto y el campo a la vista.
- [ ] **3. Tarjeta de emergencia:** los toques responden al instante. Funcionan "Compartir QR" (imagen y enlace) y
  "Copiar enlace".
- [ ] **4. Notificaciones:** los filtros se ven completos, también con letra grande.
- [ ] **5. Volver:** abrí una pantalla desde el menú Más y volvé: el menú se abre otra vez.
- [ ] **6. Permiso de IA:** Salud > Historia clínica > "Escaneá o subí un documento". La app pregunta antes de que la IA
  lo lea; "Ahora no" lo deja sin leer. En Ajustes (Privacidad y datos) activá y desactivá "Dejar que PawPi lea mis
  documentos".
- [ ] **7. Quien encuentra a tu perro:** con la tarjeta de emergencia en "Retransmisión (privada)", abrí el enlace de la
  chapa en otro teléfono, dejá un teléfono o email y un mensaje. Te llega (a vos y a tu familia con acceso) con
  "Llamar" / "Enviar email".
- [ ] **8. Notificación urgente:** hacé el paso 7 la primera vez con un modo de concentración activado: tiene que
  aparecer igual (con las notificaciones urgentes permitidas para PawPi). Un segundo mensaje dentro de los 10 minutos
  llega como notificación común, y las pruebas siguientes del mismo día también pueden llegar así (es a propósito).
- [ ] **9. Opciones de la tarjeta:** con "Teléfono" elegido y sin número, la chapa muestra el formulario. "Mostrar mi
  contacto de emergencia en la chapa" viene desactivado; activado, la chapa lo muestra; desactivado, desaparece.
- [ ] **10. Compartir por partes, con fecha de fin:** Salud > Historia clínica > Compartir. No hay nada marcado. Elegí
  una veterinaria con la que tengas una reserva, dos partes y 7 días, "Revisar", aceptá, "Dar acceso". La lista muestra
  esas partes y la fecha. "Revocar acceso".
- [ ] **11. Reemplazar:** volvé a compartir con otra parte: queda solo lo nuevo.
- [ ] **12. Pedido pendiente:** ante un pedido de una veterinaria para ver la historia, Más > Mi centro > Quién tiene
  acceso (Acceso a datos) > "Elegir qué compartir": se da solo lo marcado.
- [ ] **13. Invitación:** al final de la pantalla para compartir, "Invitar a una veterinaria con un enlace": leé las
  reglas, "Crear enlace y compartir", mandalo a otra cuenta con un negocio veterinario publicado, abrilo en la web y
  pedí acceso. No se ve nada de la ficha hasta que apruebes. Aprobá algunas partes. Creá otra invitación y usá "Retirar
  invitación" antes de que la abran.
- [ ] **14. Del lado de la veterinaria (web):** el perro aparece en Clinical > "Compartidas con nosotros"; se ven solo
  las partes compartidas; al revocar, el acceso termina al actualizar.
- [ ] **15. Textos de permisos:** con el iPhone en español, las preguntas de permisos que muestra PawPi (por ejemplo
  cámara, fotos, ubicación) se leen en español. Los siete textos agregados (movimiento, contactos, Face ID, dos de
  recordatorios, dos de ubicación "siempre") son de permisos que la app no pide en el uso normal, así que quizás no los
  veas.
- [ ] **16. Web e inicio de sesión** (la parte web no necesita la build): en la web, iniciá sesión y guardá un cambio en
  el panel de proveedor; creá una cuenta desde una invitación; probá "olvidé mi contraseña". En la app, iniciá sesión
  con email, Apple y Google, guardá un cambio y subí una foto.

## 9. App Store texts (draft, check before pasting)

### What's New (English)
- You choose what your vet sees: pick parts of the record, how long, and revoke at any time.
- Invite a vet with a one-time link.
- If someone finds your dog, they can leave their phone or email, and you and your family are notified.
- PawPi now asks before reading a vet document with AI, and you can turn it off.
- Keyboard fixes across the app, a faster emergency card, QR sharing and smoother navigation.

### Novedades (español)
- Vos elegís qué ve tu veterinaria: las partes de la historia clínica, por cuánto tiempo, y podés revocarlo cuando
  quieras.
- Invitá a una veterinaria con un enlace de un solo uso.
- Si alguien encuentra a tu perro, puede dejar su teléfono o email, y te avisamos a vos y a tu familia.
- Ahora PawPi te pregunta antes de leer un documento veterinario con IA, y podés desactivarlo.
- Arreglos del teclado en toda la app, tarjeta de emergencia más rápida, QR para compartir y navegación más fluida.

### Notes for App Review (English)

Sign in with the demo account entered in App Store Connect.

**1. Finder flow**
- What it does: each dog has a tag link. A person who finds the dog opens it in a browser and, when the owner's settings
  allow messages, sends a phone number or email and a message. The owner, and family members and caregivers with access
  to the dog, receive an in-app notification and, where their settings allow it, a push.
- How to see it: Health > Vet Record > Emergency Card. Keep the contact setting on "Relay (private)". Tap "Copy link"
  under the tag QR and open the link on another device or a computer. Enter a phone number or email and a message, and
  send. In the app, open Notifications: the entry has "Call" and "Send email" buttons.

**2. Time Sensitive notification**
- What it does: used only for the "someone found your dog" message, because the dog may be lost. It is limited, so
  repeated messages arrive as ordinary notifications.
- How to see it: on an iPhone signed in to the demo account, allow notifications and turn on a Focus that allows Time
  Sensitive notifications. Then send the first finder message as above.

**3. Vet sharing**
- What it does: the owner chooses which parts of the record a vet business sees and for how long, and can revoke at any
  time. A vet without a booking can be invited with a one-time link; nothing in the record is shared until the owner
  approves.
- How to see it: Health > Vet Record > Share. Nothing is pre-selected. Choose a vet, the parts and a duration, tap
  "Review", agree and tap "Give access". Revoke from the same screen, or from More > My Hub > Who has access. The vet
  list shows businesses with a booking or a pending request; "Invite a vet by link" at the bottom creates the one-time
  link.

**4. AI document reading**
- Only after the user allows it, asked on first use (Health > Vet Record > Scan or upload a document) and changeable in
  Settings > Privacy & data. The document is sent to Anthropic to suggest records, which the user reviews.

## 10. Checklist before you submit the build

- [ ] TestFlight shows build 36 as ready, and you ran the "What to test" list.
- [ ] A finder message reached your iPhone as a push and broke through a Focus (this shows the push key and the new
  permission work).
- [ ] App Store Connect privacy answers updated (local file `NIGHT_RUN_2026-11-26/APPSTORE-PRIVACY-ANSWERS.md`, not in
  this repository), including the open points listed there.
- [ ] The demo account in App Store Connect works; its dog has an emergency card on "Relay (private)" and a booking with
  a vet business, so the reviewer can follow the notes.
- [ ] "What's New" and review notes pasted and read once.
- [ ] No pending Apple agreement in App Store Connect.

## 11. Decisions taken for you (change any of them)

- A new-style share must name parts and a duration; nothing is pre-selected.
- A share made from an older app never widens a share by parts; it is refused instead.
- "Approve all asked" stays for vets with a booking (it is the only way to let a vet add notes or vaccines). In the new
  app, a request from a business without a booking offers only "Choose what to share" or "Deny".
- Lab results are shared as result entries; lab documents are under Documents.
- The booking screen still offers sharing to any pet-care business you have a booking with, not only vets.
- The finder privacy text gained one true sentence about visitor addresses on public pages.
- The privacy policy is dated 26 November while the consent version number stays 25 November.

## 12. Leftovers (not done)

- Seven permission texts belong to features the app does not use (contacts, motion, Face ID and others). Apple can object
  to generic or unused texts; removing them would be a separate change.
- Existing screens flagged by the new nested-component check are listed in #808 and not changed.
- Sharing with an older app over an existing access of another kind can still show an error.
- The two "bookings" notification switches also control the new sharing notices; their labels do not say so.

## 13. Waiting for you

1. **Test the build on TestFlight** and send feedback.
2. **App Store Connect privacy answers**, with the local file `NIGHT_RUN_2026-11-26/APPSTORE-PRIVACY-ANSWERS.md`.
3. **Submit to App Review** when you are satisfied. Nothing was submitted for review.
4. **When it is live, say "build 34 is live"** (it is build 36). Then #802 is merged together with the AI consent
   wording (#812), and you decide whether to raise `PRIVACY_VERSION` / `TERMS_VERSION` (it was not raised).
   - Before that merge, check the Anthropic wording in #812 against Anthropic's terms, and that your Anthropic account
     is under them with no training opt-in.
5. **Turn the Supabase `apply_migration` permission back to "ask".**
6. **Account security review:**
   - [ ] Two-step sign-in on your accounts.
   - [ ] Team access: only the people who need it.
   - [ ] Unused tokens removed.
   - [ ] Branch protection on `main`.
   - [ ] Cloudflare rules.
