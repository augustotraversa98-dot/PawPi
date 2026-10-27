# App Store — "What's New" for v1.0.4

**Status: DRAFT for the owner to review. Nothing is submitted or published.** Paste into App Store Connect → version 1.0.4 →
"What's New in This Version" (English U.S.) and the Spanish (Argentina) localization. Limit 4000 characters; each text is ~1,300.
Style: plain language, no internal terms (no PR numbers, build/ticket names, "telemetry", "session", "cache").
Earlier notes: [`app-store-whats-new-1.0.3.md`](app-store-whats-new-1.0.3.md).

## What this is based on (only what changed since v1.0.3 / build 27, `d49b494c`)

Every bullet below was checked against the merged code:

| Bullet | PRs | Verified in |
|---|---|---|
| Faster feed + images | #718, #724, #726 | Feed shows a skeleton and paints on posts instead of waiting for the lock lookup; images use a shared memory + disk cache with a 150 ms fade (`utils/feedImageProps.js`); locked rows memoised |
| Quieter in the background | #725 | `hooks/useFocusedPolling.js` — chat lists, messages and badges only poll while their screen is on screen |
| Business posts | #720 | `LockedFeedOverlay` renders followed-business posts through `BusinessPostCard` (provider name + logo) instead of a locked pet card. **Only businesses the viewer follows appear in the feed** — the copy says so |
| Tap a name → profile | #711 | Locked feed: avatar / name / @handle open the pet profile; only the photo / caption / CTA open the composer |
| Moments unlock after you post | #711, #712 | Another owner's Daily moments grid and photos stay hidden until the viewer has posted today (server + app) |
| Discover sneak peek | #715 | `search.jsx` — locked viewers see thumbnails + captions; a tap prompts "post your daily moment", then opens normally once posted |
| Weekly share card | #713 | `weekly-digest.jsx` + `utils/weeklyShareCard.js` — a real daily moment of the week, the pet's name in the label, only stats above zero |
| Cards, not pop-ups | #714 | `_layout.jsx` — Notifications and Messages are stack cards (`navigation-layers.test.js` guards it) |
| Large vet-document photos | #721 | `AddDocumentModal` downscales to 2200 px and uploads get a 120 s deadline |

Left OUT on purpose: server-only work (payments webhook, request pipeline, security), the profile-lock title wording (#722, too small to
mention), and anything that needs SQL still unapplied. Do **not** add a claim that pet handles are unique ignoring capital letters
(that index is not applied — see `db-migration-inventory.md`).

---

## English (en-US)

```
Version 1.0.4 — faster, clearer, smoother.

• A faster feed. Your feed shows up sooner, and photos load quickly and fade in smoothly. Photos you've already seen come back instantly.
• Posts from businesses you follow. They now always show in full, with the business name and logo, even before you've posted your own daily moment.
• Tap a name to meet the pet. In your feed, tap a pet's name or picture to open their profile. Their daily moments unlock as soon as you post yours.
• A sneak peek in Discover. See a peek of what other pets shared today, with a nudge to post your own moment to open it.
• A better weekly share card. It now features a real daily moment from your week, shows your pet's name, and only highlights the good numbers.
• Smoother navigation. Notifications and Messages open as full screens with a clear way back, instead of stacking pop-ups.
• Large vet-document photos upload reliably.
• Quieter in the background. Chats and badges refresh only while you're looking at them, which is kinder to your battery and data.

Thanks for all your feedback — keep it coming at support@pawpi.info.
```

## Español (es-AR)

```
Versión 1.0.4: más rápida, más clara y más fluida.

• Un feed más rápido. Tu feed aparece antes, y las fotos cargan rápido y se muestran con una transición suave. Las fotos que ya viste vuelven al instante.
• Publicaciones de los negocios que seguís. Ahora siempre se ven completas, con el nombre y el logo del negocio, incluso antes de publicar tu momento del día.
• Tocá un nombre para conocer a la mascota. En tu feed, tocá el nombre o la foto de perfil de una mascota para abrir su perfil. Sus momentos del día se desbloquean apenas publicás el tuyo.
• Un adelanto en Descubrir. Mirá un adelanto de lo que compartieron otras mascotas hoy, con una invitación a publicar tu momento para abrirlo.
• Una tarjeta semanal mejorada. Ahora muestra un momento real de tu semana, el nombre de tu mascota, y destaca solo los números buenos.
• Navegación más fluida. Notificaciones y Mensajes se abren como pantallas completas con una forma clara de volver, en lugar de apilar ventanas emergentes.
• Las fotos grandes de documentos del veterinario se suben sin problemas.
• Más tranquila en segundo plano. Los chats y los avisos se actualizan solo mientras los estás mirando, lo que cuida tu batería y tus datos.

Gracias por tus comentarios: seguí escribiéndonos a support@pawpi.info.
```

## Checks before pasting
- [ ] `support@pawpi.info` mailbox is live (same contact as the Review notes, `app-store-connect-content.md` §10).
- [ ] Every bullet is true for the binary you submit — device checks in [`release-1.0.4.md`](release-1.0.4.md) §5.
- [ ] If any checklist item fails on device, delete that bullet before pasting.
