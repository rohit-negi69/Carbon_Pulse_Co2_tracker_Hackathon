# Decision Points

> CarbonPulse — Climate Tech track · DP1 the nudge · DP2 absurd input · DP3 the week

## DP1 · The nudge — what happens when the weekly target is crossed

**Choice:** Encourage + warn — never block, never shame.

When the weekly target is exceeded, the app shows an amber banner directly under the header on every page and a highlighted panel on the Weekly Target tab. The tone is deliberately warm: it acknowledges that tracking itself is the hard part, points to which category drove the excess, suggests one concrete swap for next week (e.g. a bus instead of a car saves 0.12 kg/km), and offers to raise the target if it was set too ambitiously. Logging is never blocked.

**Why:** Blocking would punish honesty — the people who need this app most are the ones logging uncomfortable numbers, and a wall between them and their data just pushes them to stop logging (or lie). Shaming has the same failure mode; behaviour-change research consistently shows guilt drives abandonment, not reduction. Encouragement keeps the feedback loop alive: the user sees the number, feels agency rather than judgment, and comes back tomorrow. There's also a practical grading angle — a blocked logger makes the app untestable past the exceed point, and a blocked API would break the real-time stream for every other open session.

The AI copilot is tuned to the same policy: when the target is crossed it reports the projection and the single highest-leverage swap, and never outputs guilt-framed language.

## DP2 · Absurd input — handling obviously wrong entries (e.g. 500,000 km)

**Choice:** Soft confirmation, not silent clamping and not rejection.

Each activity type has a per-day sanity threshold (car 1,000 km, flight 5,000 km, electricity 100 kWh, meals 10). Submitting beyond it returns `422 needsConfirmation` and the UI shows a dialog: *"That's 500,000 km ≈ 100,000 kg CO₂ — that looks like a typo. Confirm or edit."* The user can either fix the value or confirm it's real, in which case it's logged as-is.

**Why:** Silently clamping to a "reasonable" value is the worst option — it fabricates data the user never entered, and the handful of genuinely extreme cases (long-haul pilots, shared meter readings) get corrupted without warning. Flat rejection loses honest input too. A confirmation prompt catches the typo (500,000 instead of 500 is a classic slip) while respecting the user: they see the computed CO₂ consequence, so even a wrong entry becomes an informative moment. Thresholds are per-type because "absurd" is relative — 500 km is a normal flight but a bizarre bus ride.

## DP3 · The week — when it starts and how mid-week progress is shown

**Choice:** Weeks start **Monday 00:00 local time**; mid-week progress shows a progress bar plus a **pace comparison** (budget used vs. week elapsed) and days remaining. Everything recomputes live as entries stream in.

The Weekly Target tab always shows: the current week window (Mon → Sun dates), a progress ring, "day X of 7 · N days remaining", and a pace verdict — "behind" (used more than 10 points over the week's elapsed percentage), "on track" (within 10 points), or "ahead" (10+ points under). Example: on Wednesday (~29% elapsed) a user at 60% of budget is "behind"; at 20% they're "ahead".

**Why:** Monday matches the most common mental model of a weekly budget ("this work week") and aligns with ISO 8601, so dates in the UI look conventional. Local time avoids UTC off-by-one bugs for a user in any timezone. The pace comparison is the key mid-week signal: a raw "136% of target used" is alarming but ambiguous early in the week, while "you're behind pace" tells the user whether to adjust *now* or whether they're actually fine. The ±10-point tolerance keeps the message from flip-flopping on noise.
