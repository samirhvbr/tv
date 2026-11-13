# Decisions (ADR log)

> **Status:** `ACTIVE` · The single, chronological record of decisions taken in
> this repository. Format: Architecture Decision Record.

An ADR records a decision **and the reason it was taken**, so that the next
session does not re-litigate it. A how-to does not argue direction — it links
the ADR.

Numbering is sequential and never reused. A superseded ADR is not deleted: its
status changes to `SUPERSEDED` and it names the ADR that replaced it.

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

## ADR-002 — Build the Plex browser prototype independently of TV installation

**Status:** `ACCEPTED` · 13/11/2026

**Context.** The owner reported a fragmented series catalog, no obvious way to
return from one season to the season list, and watched indicators that only
updated after manually reloading Plex Web. The owner explicitly requested a
browser prototype in this repository using Plex Media Server for the catalog,
media and playback state. Physical TV installation under ADR-001 is not a
prerequisite for this work.

**Decision.** Build an original Portuguese browser interface in `public/` and
a Node.js 22.9+ gateway in `server/`, with no installed runtime npm dependencies. Bundle a pinned hls.js player
locally under its Apache-2.0 license for browser HLS support. Keep
series, seasons and episode identifiers from Plex; provide clickable ancestors
and explicit parent navigation. Report playback timelines, reconcile state on
return and focus, and update visible progress without reloading the document.
The gateway binds only to `127.0.0.1`; it holds Plex credentials in memory or
reads the ignored local `.env`. Media and artwork pass through fixed local
routes so tokens never appear in browser playback URLs. A clearly labeled,
synthetic demo exercises the UI without a Plex account. It is not evidence of
compatibility with the owner's server or televisions.

**Consequences.** Browser UI, adapter integration and playback can be tested
before a device is modified. Real server acceptance still requires the
owner's endpoint and user token. Bad Plex matches or an Other Videos library
need correction rather than guessed grouping that could corrupt watch state.
Codec, audio, subtitle and transcode behavior need validation on actual media;
this prototype does not claim full Plex player parity. ADR-001 continues to
record the separate physical-TV choice.

The LAN Plex connection is an explicit exception to the private-address
restriction in security §4.4: the operator selects one HTTP(S) server, and the
application permits only the catalog, artwork, media and timeline operations
required by this client. Per-request target URLs, embedded credentials,
redirects, and link-local/cloud-metadata targets are rejected. All state changes
require a local CSRF token and origin checks. The local process serves a single
Plex identity at a time and must not be published on a network or the internet.

## ADR-003 — Exclude reproducible dependencies and browser test artifacts

**Status:** `ACCEPTED` · 13/11/2026

**Context.** The first executable code adds pinned Playwright development
dependencies and reproducible browser acceptance checks. Installed dependencies
and generated reports are not project source; browser traces can also contain
private catalog details when a real server is connected.

**Decision.** Ignore only `node_modules/`, `test-results/` and
`playwright-report/` in addition to existing exceptions. Track `package.json`,
the exact lockfile, tests, all authored assets, and the small synthetic test
video. Document evidence in the changelog and keep local screenshots outside
the checkout unless deliberately reviewed for publication.

**Consequences.** `npm ci` reconstructs development dependencies. Generated reports stay local or in CI artifacts rather than entering git. Runtime operation has
no third-party npm dependency and does not need `node_modules/`.
