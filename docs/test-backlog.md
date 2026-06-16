# PawPi — Device-test backlog (your queue, test on your own time)

**How this works.** Claude Code develops continuously and merges whenever CI is green — but CI can't
test real-phone behavior (navigation feel, push notifications, camera, layout on a device). Every time
something ships that needs a human check, an entry lands here. **You test when you have time, then tell
Claude Code or Cowork:**
- *"X passed"* → the entry moves to **Passed** below (or is deleted).
- *"X is wrong: <what you saw>"* → it becomes a fix ticket and gets reworked.

Merged + CI-green ≠ device-verified. This list is the gap between the two.

---

## To test

### [ ] 2.0 — Pet Services in the main nav  ·  PR #111 (merged 2026-06-17)
What shipped: the bottom bar is now **Feed · Health · Training · Services · More** (Community moved into More).
1. Bottom bar shows Feed, Health, Training, **Services**, More — Community is gone from the bar.
2. Tap **Services** → Pet Services opens; **Veterinary** is the only live/tappable one.
3. Tap **Veterinary** → vet list → pick a clinic → booking flow works (your existing vet loop).
4. Tap **More** → find **Community** → opens and works (search, filters, back button).
5. Nothing else broke — Feed, Health, Training, rest of More all open normally.
6. (2.0 follow-up, PR #113) The Services screen is a full grid: Veterinary live (tappable → vet), and Grooming/Walking/Daycare/Sitting/Training/Shop/Adoption show as dimmed **"Coming soon"** cards that do **nothing** when tapped. More no longer has leftover Adoption/Pet Shop entries.

### [ ] 2.1 — Provider capabilities (backend only)  ·  PR #114 (merged 2026-06-17)
No phone UI — backend foundation so one business can offer many services. Nothing to tap-test.
- ⚙️ **ACTION FOR YOU/COWORK — apply migration to Supabase:** `supabase/migrations/0027_provider_capabilities.sql` (creates the `provider_capabilities` table + backfills from each provider's current type). Hand-apply it after merge; until then the new capability features run only in the test harness, not on live data.
- ⚠️ **Heads-up:** the backfill maps each existing provider's `provider_type` to a capability. If any live provider has a non-standard/free-text `provider_type`, it gets **no** capability and won't show in discovery until an admin adds one. Tell me if you have such providers.

---

## Passed (archive)
_Nothing yet._
