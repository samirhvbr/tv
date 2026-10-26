# Decisions (ADR log)

> **Status:** `ACTIVE` · The single, chronological record of decisions taken in
> this repository. Format: Architecture Decision Record.

An ADR records a decision **and the reason it was taken**, so that the next
session does not re-litigate it. A how-to does not argue direction — it links
the ADR.

Numbering is sequential and never reused. A superseded ADR is not deleted: its
status changes to `SUPERSEDED` and it names the ADR that replaced it.

The template for an entry:

---

## ADR-001 — Root the first target TV, then build on cleanyourtv-WebOS

**Status:** `ACCEPTED` · 26/10/2026

**Context.** Two routes were open on the first target (LG 43UP7500PSF,
webOS 6.x, firmware 03.53.45): Developer Mode — no root, reversible, but
sessions expire in about 40 days and take the installed app with them — or
root, which is persistent but runs a third-party exploit against the TV and
freezes its firmware below whatever release patches that exploit. Both were
genuinely open on this firmware; [docs/references.md](references.md) has the
evidence and the tradeoffs for each. The owner chose root, on this specific
TV, with the risk stated plainly: *"se der problema, ok faz parte."*

**Decision.** Root the first target and build on top of
[lasharor/cleanyourtv-WebOS](https://github.com/lasharor/cleanyourtv-WebOS) as
the Home replacement, reached with
[throwaway96/slopbro](https://github.com/throwaway96/slopbro) (AGPL-3.0-or-later)
and the [webOS Homebrew Channel](https://github.com/webosbrew/webos-homebrew-channel)
it installs for persistence. **The owner runs all three against the physical
TV**, following each project's own README and install guide —
[CLAUDE.md](../CLAUDE.md) (*Never touch*) keeps that act the owner's, never
the agent's, and this repository does not keep a rewritten copy of those
install steps. What this repository tracks is the decision and what gets built
once the TV is rooted.

**Consequences.**
- The TV stops receiving further LG OTA updates from the moment it is rooted —
  the firmware is frozen at or below whatever release patches the exploit used.
- A failed root attempt, or a bad flash afterward, can brick the TV. The owner
  accepted that cost for this TV before this ADR was written.
- No 40-day Developer Mode session to renew, and no risk of an installed app
  disappearing when one expires ([runbook.md](runbook.md)).
- LG's Home is **replaced outright** by cleanyourtv-WebOS, not reached by a
  number key from alongside it. That changes what building "our own layout"
  means here: it becomes a customization of cleanyourtv-WebOS's launcher
  rather than a separate app in the Free My TV shape this project first
  considered. Exactly how — a theme, a fork, a mode it adds — is still open
  and is its own ADR, informed by what cleanyourtv-WebOS looks like once
  installed, not decided sight unseen here.
- [docs/references.md](references.md) already reflects both routes as real
  (0.1.4); this ADR is what makes one of them the project's direction.

---
