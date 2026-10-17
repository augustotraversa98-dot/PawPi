# PawPi — Launch Compliance Pack (App Store + privacy law)

**Prepared in Cowork:** 2026-08-15 · Everything that could be prepared now so submission + the lawyer pass
are copy-paste. Grounded in the current (2026) Apple App Review Guidelines, Apple's App Privacy details,
and Argentina's Law 25.326 (PDPL). Companion docs: `docs/legal/` (Privacy + Terms), the App Privacy data
map, `docs/app-store-connect-content.md` (metadata + reviewer notes), `docs/app-store-submission-runbook.md`.

---

## A. Requirements & bulletproofing checklist

### A1. Apple Guideline 1.2 — User-Generated Content (launch-blocking)
An app with UGC MUST have all four, plus act on reports:
| Requirement | PawPi status | To be bulletproof |
|---|---|---|
| Filter objectionable content | Report/flag ledger + block; text is user-posted | Keep a documented content-moderation policy (community standards) in Terms; consider a basic block/keyword pass on posts |
| Report mechanism | ✅ report on posts, comments/barks, provider-post comments, DMs, profiles, listings | Ensure every UGC surface exposes it (night run added comments) |
| Block abusive users | ✅ block + the admin **Ban** action | — |
| Published contact info | Support/abuse email must be public + in-app | Publish `support@pawpi.info` in Terms + App Store + in-app Settings (this is also the moderation admin inbox) |
| **Act on reports** | ❌ **no admin can see/act on the queue** | **MOD1 ticket** — admin flag + alerts + `/admin/moderation` console; commit to acting within **24h** and say so in Terms |
| EULA / terms addressing objectionable content | Terms exist | Add an explicit **zero-tolerance** clause (§C below) — Apple looks for this |
| Age restriction for creator content (1.2.1) | Age rating ~13+ | Confirm the ASC age-rating questionnaire matches (social + infrequent mild content) |

### A2. Apple Guideline 5.1.1 — Privacy & data
- **In-app account deletion** — ✅ exists (keep it reachable in Settings; reviewer note cites 5.1.1(v)).
- **Privacy policy** must state: what data / how collected / all uses; that third parties give equal
  protection; retention + deletion; how to revoke consent + request deletion. (Gap list in §D.)

### A3. Apple App Privacy "nutrition label" — must be accurate (§B is the answer sheet)
- Declare every data type collected; classify each as Linked / Not-Linked / Used-to-Track.
- **PawPi collects NO tracking data and shows NO third-party ads** → "Data Used to Track You" = none.
- **Nuance:** PawPi tracks *pet* health, which is **User Content**, NOT Apple's "Health & Fitness"
  (that category is the *user's* HealthKit-type data). Do **not** declare Health & Fitness.

### A4. Argentina — Law 25.326 (PDPL), regulator AAIP (the commonly-missed one)
PawPi is Argentina-based and collects **sensitive data** (health + precise location):
- **Explicit, prior, informed consent** for sensitive data — cannot be presumed. Add an explicit consent
  moment/toggle for health + location, and say so in the policy.
- **Data-subject rights within 10 days** (access; rectification notified to third parties within 5 business
  days; deletion). Provide a request channel (`support@pawpi.info`).
- **Database registration** with the AAIP's National Registry (RNBD) — a filing your lawyer handles.
- **International transfers** — data sits on Supabase/Railway (region `sa-east-1`, São Paulo) + Expo push;
  note transfers + that Argentina has EU adequacy. List the subprocessors (§D).
- Security per AAIP Resolution 47/2018; breach-notification practice (72h anticipated).

### A5. GDPR / CCPA (only if you take EU / California users)
Not required for an Argentina-only launch, but cheap to be ready: the policy should name a legal basis
(consent / legitimate interest / contract), and offer access/delete/opt-out. Our draft can include these
so you're covered if you expand — flag to the lawyer.

---

## B. App Privacy answer sheet (paste into ASC → App Privacy)

For each type: **Collected? · Linked to identity? · Used to track? · Purposes.** PawPi: everything is
**Linked to You**, **nothing is Used to Track You**, **no third-party ads**.

| Data type (Apple category) | Collected | Linked | Track | Purposes |
|---|---|---|---|---|
| **Email address** (Contact Info) | Yes | Yes | No | App Functionality; *(Developer Marketing IF you count the weekly digest/win-back emails — see note)* |
| **Name** (Contact Info) | Yes (display/handle) | Yes | No | App Functionality |
| **Photos or Videos** (User Content) | Yes | Yes | No | App Functionality, Product Personalization |
| **Other User Content** (posts, pet profiles, pet health notes, messages) | Yes | Yes | No | App Functionality, Product Personalization |
| **Precise Location** (Location) | Yes (walks) | Yes | No | App Functionality |
| **Coarse Location** (Location) | Yes (neighborhood) | Yes | No | App Functionality, Product Personalization |
| **User ID** (Identifiers) | Yes | Yes | No | App Functionality |
| **Device ID / push token** (Identifiers) | Yes | Yes | No | App Functionality |
| **Purchase History** (Purchases) | Yes (orders/bookings) | Yes | No | App Functionality |
| **Search History** | *Only if stored server-side — if search is ephemeral, declare No* | — | — | — |
| Health & Fitness | **No** (pet health = User Content, not user health) | — | — | — |
| Usage Data / Diagnostics | **No** *(verify: no third-party analytics/crash SDK is integrated — night run found none; if one is added later, declare it)* | — | — | — |
| Financial Info (card numbers) | **No** *(payments handled by the processor; you don't store card data)* | — | — | — |

- **Data Used to Track You:** *None.*
- **Data deletion:** **Yes** (in-app account deletion).
- **Privacy Policy URL:** the hosted EN Privacy Policy.
- **Note on marketing emails:** if the weekly digest / win-back emails count as marketing, add
  "Developer's Advertising or Marketing" to the Email purpose and offer an unsubscribe. If you frame them
  as transactional/engagement, App Functionality suffices — decide with the lawyer and keep the label + an
  opt-out consistent with what the app actually does.

---

## C. End-User License Agreement (EULA) — DRAFT, EN + ES

Apple 1.2 wants your terms to explicitly forbid objectionable content and abusive users. You can either
adopt Apple's standard EULA (link it in ASC) **or** use a custom one; a custom EULA with the clause below
reads better and is unambiguous. Add this as `docs/legal/eula.md` (+ es) or fold the clause into Terms.

### C1 — English (excerpt: the mandatory UGC clause)
> **Objectionable content & conduct — zero tolerance.** PawPi has no tolerance for objectionable,
> abusive, harassing, hateful, sexual, violent, or illegal content or behavior. By using PawPi you agree
> not to post such content or harass other users. You can report any content or user from within the app;
> we review reports and **act on violations within 24 hours**, including removing content and banning
> users. We may remove content and terminate accounts that violate these terms, our community standards,
> or the law, without notice. There is no in-app payment for physical pet services beyond what these
> terms permit, and you are solely responsible for content you post.

### C2 — Español (extracto: cláusula obligatoria de contenido)
> **Contenido y conducta objetables — tolerancia cero.** PawPi no tolera contenido ni conductas
> objetables, abusivas, de acoso, de odio, sexuales, violentas o ilegales. Al usar PawPi, aceptás no
> publicar dicho contenido ni acosar a otras personas usuarias. Podés reportar cualquier contenido o
> usuario desde la app; revisamos los reportes y **actuamos sobre las infracciones dentro de las 24
> horas**, incluida la eliminación de contenido y el bloqueo de cuentas. Podemos eliminar contenido y
> cerrar cuentas que infrinjan estos términos, nuestras normas comunitarias o la ley, sin aviso previo.
> Sos responsable del contenido que publicás.

*(The full EULA/Terms — license grant, acceptable use, provider/business terms, payments, disclaimers,
health-is-not-diagnostic, liability, termination, governing law (Argentina) — is in `docs/legal/`; the
strengthening list below says what to add.)*

---

## D. Strengthening list for the existing Privacy Policy + Terms

The drafts CC wrote are solid; to be bulletproof, add/confirm:

**Privacy Policy**
1. **Explicit sensitive-data consent** language for **health + precise location** (Argentina PDPL requires
   explicit consent — say how it's obtained in-app).
2. **Full subprocessor list** with purpose + region: **Supabase** (database/auth, `sa-east-1`), **Railway**
   (hosting), **Expo/EAS** (push delivery), the **email sender** (transactional/digest email), the
   **payment processor**, any **image/CDN** host, **Google/Apple Maps** (if used). State each provides
   equal-or-greater protection (Apple 5.1.1).
3. **Retention specifics** — how long each category is kept, that health *history* is preserved but
   deletable on account deletion, soft-delete vs hard-delete.
4. **Data-subject rights + channel** — access/rectification/deletion, **10-day** response (Argentina),
   `support@pawpi.info`; how to revoke consent.
5. **International transfer** note (data in São Paulo; Argentina EU-adequacy).
6. **Push tokens + notifications** as a collected identifier + how to turn them off.
7. **Children** — minimum age; PawPi is for adults managing pets.
8. **AAIP registration + regulator** mention (for the lawyer to complete the RNBD filing).

**Terms**
1. The **zero-tolerance UGC clause** (§C) + the **24h moderation commitment**.
2. **Community standards** (what's prohibited) + the **report/block** mechanics + appeal path.
3. **Provider/business terms** (bookings, cancellations, that PawPi is a marketplace, not the service
   provider) + **payments/refunds** handled by the processor.
4. **Health disclaimer** — PawPi is **not diagnostic**, not veterinary advice.
5. **Published abuse/support contact**, governing law = Argentina, liability + termination.

---

## E. Reviewer notes + store metadata — already prepared, cross-checked

- **Reviewer notes** live in `docs/app-store-connect-content.md` §10 and correctly cite the guidelines:
  demo login, external-payments rationale (**3.1.3(e)**), account deletion (**5.1.1(v)**), location usage,
  health positioning (**1.4.1**), UGC moderation (**1.2**) + contact. Add one line once MOD1 ships: *"Reports
  route to an in-app admin moderation console; violations actioned within 24h."*
- **EN + ES metadata** (name, subtitle, promo, description, keywords, What's New) are in
  `app-store-connect-content.md` §13 — ready to paste into both ASC localizations.
- **App Privacy** answers → §B above.

## F. What to do next (owner steps)
1. Run the **MOD1** ticket (report routing + moderation console) — Apple 1.2 needs it before submit.
2. Send `docs/legal/` (Privacy + Terms) + this pack (§C EULA, §D strengthening) to the lawyer; ask them
   specifically about the **AAIP/RNBD registration** and the **sensitive-data consent** wording.
3. Publish the reviewed policies to `pawpi-legal`; set the two `EXPO_PUBLIC_*` URLs.
4. Paste §B into ASC App Privacy; §E metadata into the ASC listing; §10 reviewer notes into App Review.

Sources: Apple App Review Guidelines (1.2, 5.1.1); Apple App Privacy Details; Argentina Law 25.326 (AAIP).
