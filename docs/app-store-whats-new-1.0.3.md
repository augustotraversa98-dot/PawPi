# App Store — "What's New" for v1.0.3 (build 27)

**Status: DRAFT for the owner to review. Nothing is submitted or published.** Paste into App Store Connect → version 1.0.3 →
"What's New in This Version" (EN) and the Spanish (Argentina) localization. Limit 4000 characters; these are ~900.
Style: plain language, no internal terms (no PR numbers, build/ticket names, "telemetry", "session", "Keychain").
Earlier release notes live in [`app-store-connect-content.md`](app-store-connect-content.md) §7 and
[`app-store-connect-content-es.md`](app-store-connect-content-es.md) §7.

## What this is based on (only what changed since build 26 / v1.0.2, per merged PRs)

Customer-visible, in the app: #650 tab bar, #651 handles, #652 streak friend picker, #643 / #644 / #648 layout + Settings,
#645 / #646 names, #647 / #655 / #657 Spanish + pop-ups, #656 dates, #659 reminders, #660 accessibility, #661 blocking,
#662 bookings, #698 stays signed in. Left OUT on purpose (server/internal or not live yet): CI, autofix, security hardening,
cron, database/migrations, anything that needs SQL that is still unapplied (username clean-up `0133`, payment settlement,
notification-type fix), and the hidden walk-tracking card.
Re-read this list against what actually ships in build 27 before pasting.

---

## English (en-US)

```
Version 1.0.3 — smoother, steadier, clearer.

• Stays signed in. We fixed a problem that could sign some people out when they didn't expect it.
• Pet handles that just work. When you choose a handle, PawPi tells you right away if it's taken and suggests free ones.
• Streak with a friend. Pick one of your friends from a list instead of typing a name.
• Your name stays yours. PawPi no longer shows names made up from an e-mail address.
• Settings. A clear "Log out" button (with a confirmation) and the app version at the bottom.
• More reliable reminders. No double alerts, and reminders you pause or delete stay quiet.
• Dates and times are more accurate, including late at night.
• Easier to use. Buttons and the last items on a screen no longer hide behind the tab bar, the tab bar stays light, pop-up buttons are clearer, and VoiceOver reads more buttons correctly.
• Better Spanish across notifications, profiles and alerts.
• Blocking works more thoroughly, and bookings with businesses are clearer.

Thanks for all your feedback — keep it coming at support@pawpi.info.
```

## Español (es-AR)

```
Versión 1.0.3: más fluida, más estable y más clara.

• Seguís con la sesión iniciada. Arreglamos un problema que podía cerrarte la sesión sin que lo esperaras.
• Usuarios de mascota que funcionan. Cuando elegís un usuario, PawPi te avisa al instante si ya está ocupado y te sugiere opciones libres.
• Racha con un amigo. Elegí a un amigo de una lista en lugar de escribir su nombre.
• Tu nombre es tuyo. PawPi ya no muestra nombres armados a partir de un e-mail.
• Ajustes. Un botón claro de "Cerrar sesión" (con confirmación) y la versión de la app al final.
• Recordatorios más confiables. Sin avisos repetidos, y los que pausás o borrás no suenan.
• Fechas y horas más precisas, también de noche.
• Más fácil de usar. Los botones y los últimos elementos de cada pantalla ya no quedan tapados por la barra de pestañas, la barra se mantiene clara, los botones de los avisos son más claros y VoiceOver lee más botones correctamente.
• Mejor español en notificaciones, perfiles y avisos.
• El bloqueo de usuarios funciona de forma más completa y las reservas con negocios se ven más claras.

Gracias por tus comentarios: seguí escribiéndonos a support@pawpi.info.
```

## Checks before pasting
- [ ] `support@pawpi.info` is the contact already used in the Review notes (`app-store-connect-content.md` §10); the App Store Connect Support URL is `https://www.pawpi.info/support`. Confirm the mailbox is live.
- [ ] Every bullet is true for the binary that is submitted (device checks in `docs/release-build-26.md` §8 and `docs/test-backlog.md`).
- [ ] Do not add the "handles are unique ignoring capital letters" or "old usernames cleaned up" claims until migration `0133` / the case-insensitive index are applied.
