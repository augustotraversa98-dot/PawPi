# Legal / policy accuracy sweep — 2026-10-16

Scope: every legal, policy and third-party-disclosure surface, checked against what is actually live in
production (code paths + production variable **names** only; no values were read or printed). Follows
PR #636. Not legal advice; wording is factual only. Companion: `docs/app-store-privacy-data-map.md`
(vendor table + final App Store label list).

## 1. Surfaces inventoried

| Surface | Where | Result |
|---|---|---|
| Privacy Policy EN/ES | `web/src/content/legal/privacy.{en,es}.md` → `/privacy`; mirror `docs/legal/privacy-policy*.md` | Corrected (§2 payments, §5, §8, §9) |
| Terms of Service EN/ES | `terms.{en,es}.md` → `/terms`; mirror `docs/legal/terms-of-service*.md` | Corrected (stale Privacy link, payment processor, ES menu name, date) |
| EULA EN/ES | `eula.{en,es}.md` → `/eula` | No factual error found; open items in §5 |
| Support EN/ES | `support.{en,es}.md` → `/support`; `docs/legal/support.{md,html}` | Corrected (payment processor; stale GitHub Pages links in the docs copies) |
| In-app Settings links | `AppSettings.jsx` + `eas.json` production env | OK: Privacy / Terms / EULA / Help point to `www.pawpi.info/{privacy,terms,eula,support}` |
| Account-deletion info | Privacy §9/§11, Terms §10, Support, Settings → Delete account | Behaviour verified against `delete_my_account()` (0062); §9 retention wording corrected |
| Health disclaimer | Privacy §6, Terms §3, EULA §5, Support (EN+ES) | Consistent; "does not diagnose or replace professional veterinary care" present everywhere |
| AI-feature wording | App strings `aiDisclosure`, `askAiSoon`; no policy section | Feature inactive in prod (see §4) |
| Children / age | Privacy §12, Terms §1, Support: 16+. EULA §6: "legal age to form a binding contract" | Not changed; see §5 |
| Retention statements | Privacy §9 | Corrected |
| Contact details | `support@pawpi.info`, Augusto Traversa, Matacos y Alborada S/N | Consistent on every surface |
| Effective dates | Privacy 2026-10-16, Terms was 2026-08-15, EULA 2026-08-16 | Terms date and `TERMS_VERSION` aligned (see §6) |

## 2. What was wrong → what changed

1. **Public pages called third parties.** Google Fonts (Nunito, JetBrains Mono) was injected by `useBrandFonts()` and
   allowed in the CSP; a Font Awesome Pro kit (`ka-p.fontawesome.com`) was linked in `root.tsx` on every page, yet no
   Font Awesome icon is used anywhere and the CSP did not even permit its stylesheet (only the `preconnect` leaked).
   **Fixed:** fonts self-hosted (`public/fonts/*.woff2`, `@font-face` in `global.css`, SIL OFL licences included);
   FA links removed; Google origins dropped from the CSP; regression tests added
   (`publicPagesNoThirdParty.test.js`, `securityHeaders.test.js`). **Verified in a browser:** `/`, `/privacy`, `/terms`,
   `/eula`, `/support`, `/account/signin`, `/p/tag/*` make requests only to their own origin, and the fonts load from `/fonts`.
2. **Uploadcare** listed but not used. Real photo/document upload is `POST /api/upload` → Supabase Storage
   (`SUPABASE_*` set; no Uploadcare key exists). `utils/upload.js` (the `api.anything.com` helper) had zero importers
   → deleted. Policy entry removed; the Supabase entry now says it also stores uploaded files.
3. **Google Maps Platform** listed but not live. No Google key is set in production; iOS uses Apple Maps and Apple's
   geocoder; Android shows a "coming soon" map placeholder. Replaced with an Apple entry (maps + Sign in with Apple).
4. **Cloudflare** is a live proxy (not just DNS): `www.pawpi.info` incl. `/api/*` and the apex answer with
   `server: cloudflare`, `cf-ray`, Cloudflare IPs. Added to §8 (requests incl. IP and content pass through it in transit).
5. **Binance Pay and Stripe** listed but not live (no keys; Stripe is an unimported platform scaffold). Removed;
   processor now named as "currently MercadoPago" in Privacy, Terms and Support.
6. **Sign in with Apple / Google** were described in §2 but missing from §8. Added.
7. **Expo push** now notes delivery goes through Apple's/Google's push services.
8. **Grafana** §5: added a sentence that servers also send request records (route template, status, duration, request id;
   no IP, account, query string or content). Verified in `serverLogs.js` and `spanScrubber.js`.
9. **Retention (§9)** said transaction records are kept for accounting/tax. In reality account deletion cascades the
   user's orders/payments out of our DB, while other parties' records and business entities the user owns survive.
   Rewritten to say that.
10. **Terms**: link to Privacy pointed at the old GitHub Pages site → `/privacy`; ES said "Configuración → Eliminar
    cuenta" but the app says "Ajustes".
11. **Docs**: `docs/legal` mirrors regenerated from the served files; stale "Effective date: to be set at launch" removed;
    `support.html`/`support.md` links moved off GitHub Pages; App Store Connect runbooks' legal URLs updated to
    `www.pawpi.info`; `ARCHITECTURE.md` upload notes corrected; `LEGAL-REVIEW-CHECKLIST.md` vendor list corrected.

## 3. Spanish sentences that are new or changed (all in `privacy.es.md` unless noted)

New:
- §5: "Por separado, nuestros servidores envían a Grafana Cloud registros técnicos básicos … solo para detectar caídas y errores."
- §8 **Cloudflare** entry.
- §8 **Apple** entry (inicio de sesión + mapas de iOS) and **Google** entry (inicio de sesión).
- §8 closing paragraph: "Apple y Google son los servicios de inicio de sesión y de mapas integrados en tu dispositivo o elegidos por vos. …"
- §9: "Eliminar tu cuenta no borra los registros que pertenecen a otra persona o a un negocio aparte: …".

Changed:
- §2 pagos: "…lo procesa nuestro procesador de pago externo (actualmente **MercadoPago**)."
- §8 **Supabase** (ahora "base de datos PostgreSQL y almacenamiento de archivos"), **Expo** (push vía Apple/Google), **MercadoPago** (sin Binance Pay ni Stripe).
- §9 first half: "…incluidos tus pedidos y registros de pago en nuestra base de datos …" and the retention clause.
- `terms.es.md`: fecha 16 de octubre de 2026; "(actualmente MercadoPago)"; "Ajustes → Eliminar cuenta".
- `support.es.md`: "(actualmente MercadoPago)".

Removed: Uploadcare, Google Maps Platform, Binance Pay, Stripe entries.

## 4. Classification of every vendor / SDK that could receive data

See the table in `docs/app-store-privacy-data-map.md`. In short — **Live:** Supabase, Railway, Cloudflare, Expo (push,
updates), MercadoPago, Resend, Grafana Cloud, Daily.co, Apple/Google sign-in, Apple Maps (iOS), OSM Nominatim.
**Bundled-inactive:** RevenueCat, Anthropic document reading (and `ENRICHMENT_LLM_KEY`), Google Maps/Places, Binance Pay.
**Not used:** Uploadcare, `api.anything.com`, Stripe, Google Fonts, Font Awesome kit.

## 5. Left alone, and why (decisions or follow-ups for you)

Product decisions:
- **RevenueCat / Anthropic.** Not in the policy because not live. Before enabling either: update policy §2/§8 EN+ES and the
  App Store label. Note the app already contains AI wording (`aiDisclosure`: "PawPi's AI read your file…", and a
  "coming soon" *Ask AI about this photo* button) that would surface once an Anthropic key is set; the policy has no
  AI/automated-processing section yet.
- **Binance Pay** and **Google Maps/Places**: re-add to the policy only if you turn them on.
- **Age gate.** Policy says 16+, but sign-up has only the "I agree to the Terms and Privacy" checkbox (no age
  confirmation), the EULA says "legal age to form a binding contract", and `docs/LAUNCH-CHECKLIST.md` expects an App Store
  age rating of about 13+. Pick one position and align the Terms, EULA, sign-up copy and ASC age rating.
- **Android.** EULA/Privacy mention Android, but `eas.json` only submits iOS and the Android map is a placeholder.
  If Android ships, the policy needs Google's system geocoder/Maps and Play push (FCM).

Cleanup I did not do (mobile / lockfile territory; this PR is docs/web only):
- Remove the unused `@uploadcare/upload-client` dependency from the mobile `package.json` (needs an npm-10 lockfile regen).
- `mobile/src/data/mockData.js` (Unsplash hotlinks, no importers) and the `pravatar.cc` default avatar in
  `socialPetStore.js` (never rendered) are dead; both would be third-party image requests if ever wired.
- `api.anything.com` / `ucarecdn.com` stay in `enrichment/safeFetch.js`'s allowlist because old rows may still hold URLs
  on those hosts. A DB check of `image_url`/document URLs would tell you whether they can go.
- `app.all('/integrations/*')` in `web/__create/index.ts` proxies to create.xyz; no caller in the repo uses it. Candidate for removal.

Outside the repo (action for you):
- **The old GitHub Pages site is still live** at `augustotraversa98-dot.github.io/pawpi-legal/{privacy,terms,support}`
  (last-updated Oct 5; no Daily, Grafana or Nominatim disclosures). Confirm App Store Connect's Privacy Policy URL and
  Support URL point at `www.pawpi.info`, then unpublish or redirect that repo.
- Provider calendar feeds (ICS URLs the business pastes, e.g. Google Calendar) are fetched server-side. That is the
  business's own data and a user-supplied URL; not added to the policy.

## 6. Items for lawyer review

1. §9 retention rewrite (what survives account deletion; processor-held payment records).
2. New §8 entries for Cloudflare (TLS-terminating proxy), Apple, Google; the sentence that vendors "process data on our
   behalf under contract" now sits next to vendors that act under their own policies (Apple, Google, OSM).
3. §5 server-records sentence (Grafana) and the existing claim that this data is "not linked to your account".
4. Legal bases (§3), international transfers (§13), governing law (Terms §15 / EULA §10) — already flagged, still pending.
5. Age position (16+ vs. EULA "legal age" vs. ASC rating) and the absence of an age gate.
6. Whether Terms/Privacy should name specific AI processing before any AI feature ships.
7. Zero-tolerance clause's "act within 24 hours" (Terms §5, EULA §2): an operational promise, not verifiable from code.
8. Support's "reply within 2 business days" (same reason).

## 7. What a `PRIVACY_VERSION` bump does (verified in code)

`PRIVACY_VERSION`/`TERMS_VERSION` (`web/src/constants/legal.js`) are only read by `POST /api/legal/consent`, which stamps them
onto the `legal_consents` row written when someone signs up. Nothing compares a stored version with the constant, and the mobile
app has no version logic, so **a bump does not re-prompt any existing user**; it only changes the version recorded for future
sign-ups. (A "re-consent on version change" backstop is mentioned in the code comment but does not exist.)

Applied: `PRIVACY_VERSION` stays `2026-10-16` (today's date, already set by #636, and matches the policy's "Last updated").
`TERMS_VERSION` moved `2026-06-22` → `2026-10-16` to match the Terms' new date (it had drifted from the Aug 15 text). Neither
triggers re-consent. If you want the ledger to distinguish today's #636 text from today's sweep text, bump both to the merge date.
