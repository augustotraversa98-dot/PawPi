# App Store — "What's New" for v1.0.5

**Status: DRAFT for the owner to review. Nothing is submitted or published.** Paste into App Store Connect → version 1.0.5 →
"What's New in This Version" (English U.S.) and the Spanish (Argentina) localization. Limit 4000 characters; each text is well under 500.
Style: plain language, no internal terms (no PR numbers, build/ticket names, "telemetry", "session", "token", "cache").
Earlier notes: [`app-store-whats-new-1.0.4.md`](app-store-whats-new-1.0.4.md).

## What this is based on (only what changed since v1.0.4 / build 30, `280fc814`)

| Bullet | PRs | Verified in |
|---|---|---|
| Stay signed in longer | #732, #733 | Session lifetime 7 → 30 days with a rolling refresh (server, live) and the app storing the refreshed sign-in (`__create/fetch.ts`). **Only true on 1.0.5 after signing in once** — the copy says "stay signed in longer", never a number of days |
| Keyboard no longer hides what you type | #734 | Daily-moment caption + Post button stay above the keyboard (`PostComposerModal`), same fix on the health / reminder sheets and Nearby walks |

Left OUT on purpose: everything internal (refresh mechanics, diagnostics, launch-screen handling). Do **not** promise "never signed out" or a
number of days: users who haven't updated keep a 7-day sign-in, and a genuinely idle account still expires.

---

## English (en-US)

```
Version 1.0.5 — a couple of important fixes.

• Stay signed in longer. PawPi now keeps you signed in much longer, so you won't be asked to log in again every week.
• The keyboard no longer hides what you type. When you post a daily moment, your caption and the button to post it stay in view above the keyboard. The same goes for the notes and details fields in your pet's health logs, reminders and walks.

Thanks for all your feedback — keep it coming at support@pawpi.info.
```

## Español (es-AR)

```
Versión 1.0.5: dos arreglos importantes.

• Seguí con la sesión iniciada por más tiempo. PawPi ahora mantiene tu sesión abierta mucho más tiempo, así que no tenés que volver a iniciar sesión cada semana.
• El teclado ya no tapa lo que escribís. Cuando publicás un momento del día, el texto y el botón para publicar quedan a la vista arriba del teclado. Lo mismo pasa con las notas y los detalles en los registros de salud, los recordatorios y los paseos de tu mascota.

Gracias por tus comentarios: seguí escribiéndonos a support@pawpi.info.
```

## Checks before pasting
- [ ] The bullets say "the button to post it" / "el botón para publicar" on purpose: the real labels are "Post daily update 🐾" / "Publicar actualización diaria 🐾" (`postComposer.submit`).
- [ ] `support@pawpi.info` mailbox is live (same contact as the Review notes, `app-store-connect-content.md` §10).
- [ ] Every bullet is true for the binary you submit — device checks in [`release-1.0.5.md`](release-1.0.5.md) §5.
- [ ] If the keyboard checks failed on device, delete that bullet; if the sign-in checks failed, delete the first bullet before pasting.
- [ ] Reminder for support replies: someone on 1.0.4 or older stays on the 7-day sign-in until they update and sign in once.
