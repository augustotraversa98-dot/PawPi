# Night run 2026-11-26 (evening): TestFlight feedback on build 36

Plain-language report. Times are Buenos Aires time.

## 1. In short

- **All nine items are built and merged** (fifteen pull requests, #840 to #854).
- **iOS 1.0.5 (37) was built from `41423911`** and uploaded to App Store Connect for TestFlight on 2026-11-27 at about 01:20 (Apple's
  processing was not checked). Nothing was submitted to App Review, and the earlier
  App Store submission was not touched.
- **The five database changes (0152 to 0156) were applied on 2026-11-27 and every one of their checks passed**
  (section 3).
- The website changes are already live: Spanish business panel, public pet pages, and the new server parts.
- A walkthrough in the iPhone Simulator against a local copy found no crash and no blocker. **Nothing was tested on a real
  phone.**

## 2. What was merged

| Item | PR | What changes | Reaches people through |
|---|---|---|---|
| 1. Phone and email for a finder | #843 | Two switches instead of one choice; with both off you choose private message or nothing | Public tag pages now; app switches in the new build; database 0152 (applied) |
| 2. Share by link, no account | #845 | A link shows the parts you tick to anyone who has it, until the date or until you remove it; optional "add notes", marked as external | Website now; app screens in the new build; database 0153 (applied) |
| 3. Invite a vet directly | #851 | Search a vet on PawPi, send, the vet accepts or declines | Website now; app screens in the new build; database 0154 (applied) |
| 4. Screens update at once | #852 | Sharing screens refresh themselves; a repeated tap or request gives one result | Mostly the new build |
| 5. Spanish by default | #844, #846, #847, #849, #853 | The business web panel is in Spanish by default, with an ES / EN switch | Website now |
| 5. Spanish by default | #848 | App: a phone in neither language opens in Spanish; business types and breeds in Spanish; public pet pages in Spanish unless the browser is English | Website now; app part in the new build |
| 6. Fewer subtitles | #840 | The repeated lines on the Health tab are removed or shortened | New build |
| 7. Friends' streaks | #841 | Flame and number next to a friend's dog from 7 days | New build; database 0155 (applied) |
| 8. Birthday posts | #842 | Festive frame and cake on the birthday; no notification | New build (single posts already had part of this) |
| 9. Birth date, estimate, adoption date | #850 | Birth date first; an estimated age that grows; separate optional adoption date | New build; database 0156 (applied) for the growing estimate |
| Walkthrough fixes | #854 | Six small defects found in the pre-build check | Website and new build |

All of these, and the walkthrough fixes (#854), were squash-merged with the four checks green. Draft #802 and #812 were not touched. No sign-in or login code was changed.

Merging: later pull requests were each brought up to the latest `main` and re-checked before merging; the first few were merged
when GitHub showed no conflict, and `main`'s checks were confirmed afterwards. No commit from the other session landed on
`main` during the run, so there was no conflict with it.

## 3. Database changes: **applied and checked on 2026-11-27**

Applied to the production database at the owner's request, about 09:32 to 09:37, in order, each followed by its check
before the next one:

| Order | Migration | Check | Result | Turns on |
|---|---|---|---|---|
| 1 | `0152_emergency_contact_channels.sql` | `verify_0152.sql` | **11 of 11 PASS** | Item 1 |
| 2 | `0153_vet_record_links.sql` | `verify_0153.sql` | **20 of 20 PASS** | Item 2 |
| 3 | `0154_vet_share_offers.sql` | `verify_0154.sql` | **17 of 17 PASS** | Item 3 |
| 4 | `0155_friend_streaks.sql` | `verify_0155.sql` | **5 of 5 PASS** | Item 7 |
| 5 | `0156_pet_age_estimate.sql` | `verify_0156.sql` | **10 of 10 PASS** | Item 9 growing estimate |

- Every function these files create or replace matches the repository (compared by checksum). The files' opening comment
  blocks were not sent.
- Before applying, one older function (`app_emergency_card_json`, from 0146) differed from the repository only by missing
  comment lines.
- Existing data is unchanged: the same number of emergency cards, dogs, vet notes, access grants and notifications; the
  emergency cards' earlier fields and the dogs' ages are identical; every emergency card still builds.
- Run again afterwards: `verify_0099.sql`, `verify_0146.sql` and `verify_0151.sql`, every row PASS, and the row of
  `verify_0152.sql` that 0156 could affect. `verify_0147.sql` and `verify_0148.sql` were **not** run again; row 24 of the
  first and row 15 of the second count notification types and are expected to read FAIL.
- Supabase advisors: security reports nothing. Performance shows the same four kinds of notice as before; "unused index"
  includes at least one new index.
- Live site afterwards: pages load, signed-out requests are refused, a made-up share link is refused, and the hosting
  logs showed no server error in the preceding hour. No signed-in action was tried.
- If 0146, 0147, 0151, 0099 or 0152 is ever run again, run the newer files that replace their functions again (each
  file's header says which).

## 4. The build

| Item | Value |
|---|---|
| Version and build number | 1.0.5 (**37**) |
| Built from commit | `41423911` on `main` (everything up to #854), from a clean copy holding committed files only |
| Checks on that commit | App tests, web tests and web tests against a real database: passed. The secret scan passed on #854 |
| EAS build | [0b3363d7](https://expo.dev/accounts/augusto-firulais/projects/pawpi/builds/0b3363d7-20b5-44f4-892f-3105a1f92fe0): finished |
| TestFlight | Uploaded to App Store Connect ([submission](https://expo.dev/accounts/augusto-firulais/projects/pawpi/submissions/f4d19d44-0650-483b-a74b-79712f9124cb)). **Apple processing not verified.** |
| App Review | **Not submitted** |

It built and signed without any manual step.

## 5. Product calls made without asking

**Item 1.** Both channels on shows both, with no message form. Both off shows a switch "Let the finder send me a private
message". Typed values are kept (not public) while a switch is off. Build 36 on a card showing both displays only the phone,
and saving anything there replaces the whole choice. Rate limits unchanged. The privacy paragraph about public pet pages was
reworded.

**Item 2.** A link needs no sign-in, so: nothing is pre-selected, you accept a warning, the choices are 7 days, 30 days or
1 year (no "until revoked"), and notes are off unless you turn them on. "Write" means **adding a note only**; nothing can be
edited or deleted through a link. Limits: 10 links in use per owner, 10 notes per link per day. A note shows the signed-in
person's account name, otherwise "Anonymous" / "Cambios de alguien externo", and older app builds show "(shared link)" after
it. Older uploads stored as long web addresses are listed through a link but not opened. The new app no longer creates the old
"request access" invite links; earlier ones still work and can be withdrawn. The privacy policy was updated to match.

**Item 3.** The vet sees only the dog's name, your name, the parts and the length until they accept. The length starts at
acceptance; an unanswered invitation lapses after 7 days. At most 20 waiting per owner. A vet is found by business name or
handle, or by the full account username. Only published businesses offering veterinary service can be found, and the app
asks you to check that it is your vet.

**Item 4.** Screens re-read every 5 seconds only while open with something waiting. The same share sent twice within 2 minutes
returns the existing access.

**Item 5.** A phone or browser set to **English stays English** (so that switching language keeps working). The app takes
the first English or Spanish entry in the phone's language list and uses Spanish when there is neither; the web uses English
only when the browser's first language is English. A language you chose
always wins. "Businesses section" was read as the business web panel plus the places in the app that showed business types
in English.

**Item 6.** The Health header keeps one short line, "does not diagnose or replace professional veterinary care", because App
Store review relies on it. The whole bottom box of Vet Record was removed. The care story card keeps its headline, bar, count
and link.

**Item 7.** "Friend" means a dog your own dog follows, is friends with, or shares a Pack streak with; never across a block.
The number is the care-ring streak. Your own number on feed cards is still the older daily-posting streak, so the two can differ.

**Item 8.** Every post by that dog shown in the feed that day gets the frame. A 29 February birthday is celebrated on
28 February in other years. Only month and day are sent with feed posts.

**Item 9.** The existing birthday and adoption-date fields are reused; no existing dog is changed. Adding a birth date clears
the stored age. An old build that saves back the age it was shown does not overwrite the estimate.

## 6. Deferred, and why

- **Privacy version:** the privacy policy text changed (items 1, 2 and 3); the consent version number was not bumped. Draft
  #812 edits nearby privacy text; it still showed no conflict when checked.
- **ITMS-90725 (iOS 27 SDK, April 2027):** logged in `docs/test-backlog.md`; Xcode 27 is not available yet.
- **Web sign-in and password pages and the password reset email stay English:** sign-in belongs to the other session's work.
- **Prices typed with a comma** in the business panel: some forms silently drop the cents ("49,90" saved as 49) and others
  reject it. This predates tonight, but the panel now shows Spanish number formats, so it is worth fixing soon.
- Still English in places: pet breeds in search results, adoption vaccination status, forum category labels, the "Moment" tags
  on posts, the email unsubscribe page.
- The "add another dog" sheet takes a birth date but no estimated age.
- The 29 February rule is not applied to the followed-pet milestone card or the server digest.
- Brand: one milestone card uses the paw emoji as a fallback picture, and the business sidebar uses a generic paw icon.

## Checked before the build

A walkthrough on the iPhone Simulator (Spanish, spot checks in English) against a local server and database covered items
1 to 9, plus the app on a database **without** 0152-0156 (no crash, new features hidden or reported unavailable). Six
small defects it found were fixed in #854: sharing sheet wording when links and search are
not available yet; author and date overlapping on a note added by link; that note's date showing the next day late at night;
an empty "Birth date" heading beside the estimate (three screens); the date calendar in English inside the Spanish app; and a
contradictory empty list in the business panel's Clinical screen.

Seen and **not** fixed (older behaviour):
- The Spanish feed shows "0 paws" / "0 barks" in English.
- Reopening onboarding without signing out can prefill the previous dog.
- Once, an app left open past midnight kept the feed locked until relaunch (not investigated).
- The business adoption screen in the app shows a timestamp's date in UTC.

## 7. NOT tested

- A real iPhone, the TestFlight build itself, Android, VoiceOver.
- Real push delivery, camera, QR scanning and the iOS share sheet.
- Opening a real file or photo through a share link (no real file storage in the local test).
- Saving an exact birth date through the screens (the calendar opens; dated dogs were seeded), and the software keyboard
  over the estimate fields in Edit profile and the medical profile.
- Accepting an invitation inside the app's business mode (declining there and accepting on the web were tested).
- The web adoption, insurance, daycare and shop screens; emails; rate limits and note limits.
- The walkthrough fixes in #854 were checked by automated tests only, not looked at again in the Simulator.
- On production only signed-out, read-only checks were made after the merges: pages load, and signed-out requests are
  refused. No signed-in action.

## 8. What to test on a real phone

The database changes are applied. Use your own account and dog, never the demo account.

### English
- [ ] **0. Version:** More > Settings shows `PawPi v1.0.5 (37)`.
- [ ] **1. Finder contact:** Emergency card: turn on "Show my phone number" and "Show my email", fill both, save. Scan the
  tag: both appear with call and email buttons, no message form. Turn one off: only the other. Turn both off: "Let the
  finder send me a private message" appears; on, the tag shows the form and the message reaches you; off, no contact. Type in
  each field: the keyboard stays open. A dog you did not touch behaves as before.
- [ ] **2. Link, no account:** Health > Vet Record > Share > create a link: nothing is pre-selected and notes are off. Pick
  two parts and 7 days, accept the warning, send it. Open it on a phone that is not signed in: only those parts; open one
  document and one photo. Create one with notes on: add a note signed out (shows "Anonymous") and one signed in (shows that
  name). Remove the link and reload: "This link isn't available".
- [ ] **3. Invite a vet:** Share > find a vet on PawPi, search your test vet by business name (or full username), pick parts
  and length, send; tap twice quickly: one invitation. As the vet (second account): open the notification or the business
  home card, check you see only dog, owner, parts and length, and Accept. In the web business panel > Clinical only those
  parts open. Send another and Decline it; send another and withdraw it. Revoke access.
- [ ] **4. Updates at once:** keep Data Access open on the owner phone while the vet accepts on the other: it moves to access
  within a few seconds without pulling. Repeat with the app in the background, then return. Double-tap "Give access": one
  entry.
- [ ] **5. Spanish by default:** with no language chosen in Settings, set the iPhone's language list (Settings >
  General > Language & Region) so it holds neither English nor Spanish and open the app: Spanish. English first: English. Choose a language in Settings, restart: it stays. Open a tag
  link, a shared record link and the business panel in a Spanish browser: Spanish, and the ES / EN switch works.
- [ ] **6. Subtitles:** look at Health (header, Today, Track, Vet Record): the repeated lines are gone and nothing looks
  cramped.
- [ ] **7. Friend streak:** a dog you follow with a streak of 7 or more shows the flame and number in the feed and on its
  profile; below 7, nothing.
- [ ] **8. Birthday:** set a dog's birthday to today and look at the feed from another account: frame and cake; no
  notification.
- [ ] **9. Age:** add or edit a dog: pick a birth date (no future dates): exact age. Tick "I don't know the exact date",
  enter 2 years: the keyboard does not cover fields or buttons and the age reads "~2 years". Add and remove an adoption date.
  Change only the name and save: the age is unchanged. A dog that only had an age keeps it.
- [ ] **Notes and calendar (#854):** a note added through a link with a long author name wraps and does not run into the date;
  with the app in Spanish the birth date calendar is in Spanish.

### Español (es-AR)
- [ ] **0. Versión:** Más > Configuración muestra `PawPi v1.0.5 (37)`.
- [ ] **1. Contacto para quien lo encuentre:** Tarjeta de emergencia: activá "Mostrar mi teléfono" y "Mostrar mi correo",
  cargá los dos y guardá. Escaneá la chapa: se ven los dos, con botones para llamar y escribir, sin formulario. Desactivá
  uno: queda el otro. Desactivá los dos: aparece "Dejar que quien lo encuentre me mande un mensaje privado"; activado, la
  chapa muestra el formulario y te llega el mensaje; desactivado, ningún contacto. Al escribir, el teclado no se cierra. Un
  perro que no tocaste se comporta como antes.
- [ ] **2. Enlace sin cuenta:** Salud > Historia clínica > Compartir > crear un enlace: nada marcado y notas desactivadas.
  Elegí dos partes y 7 días, aceptá la advertencia y mandalo. Abrilo en un teléfono sin sesión: solo esas partes; abrí un
  documento y una foto. Creá otro con notas activadas: agregá una sin sesión ("Cambios de alguien externo") y otra con
  sesión (ese nombre). Quitá el enlace y recargá: "Este enlace no está disponible".
- [ ] **3. Invitar a una veterinaria:** Compartir > buscar una veterinaria en PawPi, buscá la de prueba por el nombre del
  negocio (o el usuario completo), elegí partes y duración y enviá; tocá dos veces: una sola invitación. Como veterinaria
  (otra cuenta): abrí la notificación o la tarjeta del inicio del negocio, mirá que solo se ve perro, dueño, partes y
  duración, y aceptá. En el panel web > Historias clínicas solo se abren esas partes. Mandá otra y rechazala; mandá otra y
  retirala. Revocá el acceso.
- [ ] **4. Se actualiza solo:** dejá abierto Acceso a datos mientras la veterinaria acepta en el otro teléfono: pasa a
  acceso en segundos sin deslizar. Repetí con la app en segundo plano. Tocá dos veces "Dar acceso": una sola entrada.
- [ ] **5. Español por defecto:** sin idioma elegido en Configuración, dejá la lista de idiomas del iPhone (Ajustes >
  General > Idioma y región) sin inglés ni español y abrí la app: español. Con inglés primero: inglés. Elegí un idioma en Configuración y reiniciá: se mantiene. Abrí
  una chapa, un enlace compartido y el panel de negocios en un navegador en español: español, y el botón ES / EN funciona.
- [ ] **6. Subtítulos:** mirá Salud (encabezado, Hoy, Registrar, Historia clínica): no están las líneas repetidas y nada
  queda apretado.
- [ ] **7. Rachas de amigos:** un perro que seguís con racha de 7 o más muestra la llama y el número en el Feed y en su
  perfil; con menos de 7, nada.
- [ ] **8. Cumpleaños:** poné el cumpleaños de un perro hoy y mirá el Feed desde otra cuenta: marco y torta; ninguna
  notificación.
- [ ] **9. Edad:** agregá o editá un perro: elegí la fecha de nacimiento (sin fechas futuras): edad exacta. Marcá "No sé la
  fecha exacta" y poné 2 años: el teclado no tapa campos ni botones y se ve "~2 años". Agregá y quitá una fecha de adopción.
  Cambiá solo el nombre y guardá: la edad no cambia. Un perro que solo tenía edad la conserva.
- [ ] **Notas y calendario (#854):** en una nota agregada desde un enlace, un autor largo baja de línea y no se pega a la fecha;
  con la app en español, el calendario de nacimiento está en español.
