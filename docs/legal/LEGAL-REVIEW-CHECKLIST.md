# Legal-review checklist (before launch)

The Privacy Policy and Terms in this folder are **DRAFTS**. They are written to be accurate about
what PawPi actually collects and does, but they are **not legal advice** and must be reviewed by a
qualified attorney before launch. Give your lawyer this checklist.

## Documents to review
- `privacy-policy.md` (EN) and `privacy-policy.es.md` (ES) — must stay in sync.
- `terms-of-service.md` (EN) and `terms-of-service.es.md` (ES) — must stay in sync.

## Points to confirm with counsel
1. **Controller identity & address.** Currently "Augusto Traversa, Matacos y Alborada S/N,
   augusto@pawpi.info." Confirm this is the correct legal entity/address to name (individual vs. a
   company); add a business registration number if one applies.
2. **Legal bases (GDPR/■ local law).** The Privacy Policy lists contract / consent / legitimate
   interests / legal obligation. Confirm these map correctly to each processing purpose for the
   markets you launch in (Argentina + any others). Argentina's Ley 25.326 (and its successor) may
   need explicit mention.
3. **Minimum age.** Set to 16. Confirm against App Store age rating, COPPA (US, <13), and local law.
4. **Health data.** PawPi stores pet medical data plus, where the user enters them, the user's own
   emergency-contact and insurance details. Confirm whether any of this triggers special-category /
   sensitive-data obligations in your target markets and that the "not veterinary care" disclaimer is
   sufficient.
5. **Location.** Precise location is used (nearby, walks, pet-taxi live-share, lost & found). Confirm
   disclosure + consent language is adequate.
6. **Subprocessors.** Verify the list (Supabase, Railway, Expo, MercadoPago/Binance/Stripe, Resend,
   Uploadcare/media upload, Google Maps) is complete and that DPAs are in place with each.
7. **International transfers.** Data is hosted outside the user's country (Supabase region sa-east-1
   today, plus vendors elsewhere). Confirm transfer mechanism/safeguards.
8. **Payments.** Confirm refund/cancellation responsibility wording given providers set their own
   policies; confirm PawPi's fee-disclosure obligations.
9. **UGC / moderation.** The Terms commit to Report+Block on all UGC, review within 24h, and
   zero-tolerance ejection (Apple 1.2). Confirm the 24h commitment is operationally achievable and
   legally safe to state.
10. **Liability cap & governing law.** Cap = greater of 12-month spend or USD 100; governing law =
    Argentina, venue Buenos Aires. Confirm enforceability and whether consumer-protection law
    overrides.
11. **Retention specifics.** Confirm concrete retention periods where the law requires them (tax,
    accounting) and add exact durations if counsel wants them stated.
12. **Account deletion.** Confirm the "irreversibly removes the data you own, subject to limited legal
    retention" wording matches what the delete-account flow actually does.

## Publishing
- Source of truth = these files. The **hosted** copies live in the separate `pawpi-legal` GitHub
  Pages repo, linked from the app via `EXPO_PUBLIC_PRIVACY_POLICY_URL` / `EXPO_PUBLIC_TERMS_URL`
  (see `anything/apps/mobile/src/constants/legal.js`).
- **Action:** after counsel signs off, publish the final EN (and ES) versions to `pawpi-legal`, set
  the effective date, remove the DRAFT banner, and confirm the two env vars point at the live URLs so
  Settings → Legal and the signup consent line resolve.
- The App Store Connect "Privacy Policy URL" must equal the hosted EN Privacy Policy URL.
