# PawPi — Infrastructure & Contacts (durable reference)

_Last updated 2026-08-21. Keep this current (Rule 6)._

## Email

- **Primary inbox (the real mailbox):** `augusto@pawpi.info`.
- **Aliases — all deliver to `augusto@pawpi.info`:** `support@pawpi.info` · `partner@pawpi.info` ·
  `business@pawpi.info` · `info@pawpi.info`.
- **Published / role-based contact = `support@pawpi.info`** (reaches the primary inbox via alias).
  Use it for: App Store support+contact, legal pages, moderation admin + alert emails.
- Email = **Google Workspace** (MX `pawpi.info` → `smtp.google.com`); app transactional send =
  **Resend / Amazon SES** on `send.pawpi.info`. DNS is now managed at **Cloudflare** (moved off one.com
  2026-08-21; see Web hosting below). ⚠️ These MX + email TXT records (SPF/DKIM/DMARC,
  google-site-verification) must be preserved whenever DNS is touched — they were carried into Cloudflare
  (all "DNS only"), and if any is dropped, email breaks.
- **Consistency note:** the public legal pages currently show `augusto@pawpi.info` (CC's cautious choice);
  moderation + EULA use `support@pawpi.info`. Both reach the same inbox. Unify the legal pages to
  `support@pawpi.info` in the next web pass for a clean role-based public face.

## Web hosting & domains

- **Host:** Railway. Project `surprising-clarity` (`12c03ddb-f02e-4033-b154-e2fc6d840b8d`), env
  `production` (`49fa55c1-6a69-4bde-9b06-d358801d63c5`), service **PawPi**
  (`77af1974-9fad-4547-ae81-b11be3b5b86c`), container port **8080**.
- **Railway service domain (always works):** `https://pawpi-production.up.railway.app`.
- **DNS moved to Cloudflare 2026-08-21** — registrar is still **one.com** (domain registration only); only
  the nameservers changed. Cloudflare NS: `carl.ns.cloudflare.com` + `sarah.ns.cloudflare.com` (free plan,
  zone `pawpi.info`). **Why:** the bare `pawpi.info` was showing "not secure" — it had an `A → 46.30.211.38`
  (one.com parking) that served a `*.one.com` cert → name mismatch. one.com has no ALIAS/ANAME so the apex
  couldn't CNAME to Railway; Cloudflare's **CNAME flattening** solves that. (`www` was always fine.)
- **Final working setup — www is the live site; apex is a Cloudflare redirect to www:**
  | Host | Cloudflare record | Serves how |
  |---|---|---|
  | `www.pawpi.info` | CNAME → `fx99vumj.up.railway.app`, **DNS only (grey)** | Railway direct; Railway LE cert. ✅ the app |
  | `pawpi.info` (apex) | CNAME → `gflxcfqb.up.railway.app`, **Proxied (orange)** | Cloudflare cert + Redirect Rule → `https://www.pawpi.info` (301, path+query preserved) |
  - ⚠️ **Do NOT try to serve the apex directly from Railway.** Cloudflare CNAME-flattens the apex (hides the
    CNAME), so Railway can't verify apex ownership → no cert → 404. Subdomains (www) aren't flattened, so www
    works. The apex is handled entirely by a **Cloudflare Redirect Rule** (`https://pawpi.info/*` →
    `https://www.pawpi.info/${1}`). The Railway custom domain `pawpi.info` is attached but unused/unverified —
    harmless. (Older apex target `z7ubhig1…` from the 2026-08-16 one.com attempt is retired.)
- **DNSSEC:** was ON at one.com (DS `64245 13 2 …`). one.com auto-disables DNSSEC when you move to external
  nameservers and the seal cleared. **Do NOT add a DS record at one.com** unless deliberately re-enabling
  DNSSEC via Cloudflare (Cloudflare would supply the new DS to paste into one.com's DS-Records tab).
- **All email/verification records were migrated into Cloudflare (every one "DNS only"):** MX `pawpi.info`
  → `smtp.google.com` (Google Workspace); MX `send.pawpi.info` → SES; TXT `_dmarc`; TXT apex
  google-site-verification; TXT `google._domainkey` (Google DKIM — **Cloudflare's auto-import MISSED this
  one**, re-added by hand); TXT `resend._domainkey`; TXT `send` SPF `include:amazonses.com`. **Never drop
  these.**
- **CANONICAL = `www.pawpi.info`** (Railway serves the app there). The apex `pawpi.info` now shows secure and
  301-redirects to www (Cloudflare Redirect Rule, live 2026-08-21). App + App Store URLs already use
  `www.pawpi.info`.
- **Optional follow-up (not yet done):** turn the Cloudflare proxy ON (orange) for **`www`** too + set
  SSL/TLS mode **Full (strict)** for CDN/WAF on the app itself. (`www` is currently grey/DNS-only = Railway
  direct, which works fine; the apex is already orange for the redirect.)

## Live URLs (after DNS)
- `www.pawpi.info/privacy · /terms · /eula · /support` — public legal/support pages (WEB1).
- `www.pawpi.info/` — branded homepage. `www.pawpi.info/admin/moderation` — admin moderation console.
- App Store: Privacy Policy URL = `www.pawpi.info/privacy`; Support URL = `www.pawpi.info/support`.
