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
> Note: the "coming soon" category cards (Grooming/Walking/etc.) are added in the 2.0 follow-up — check those appear but aren't tappable once that PR lands.

---

## Passed (archive)
_Nothing yet._
