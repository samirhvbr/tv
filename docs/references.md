# References — tv

> **Status:** `ACTIVE` · What has been looked at so far, what each thing is, what
> it can and cannot give an LG app, and **how each fact was checked**. Checked
> on 26/10/2026; star counts are from that day and move fast.

None of these is a dependency. A reference without a license is an idea, never
code: no license means all rights reserved. Code taken from an MIT one gets its
attribution in [`../NOTICE`](../NOTICE) in the commit that brings it.

**Evidence levels**, used in every table below:

| Level | Means |
|---|---|
| **documented** | What the project or vendor says about itself — a README, a doc page, a forum answer. Not checked further |
| **code read** | We read the code (or the screenshots) and the claim matches it |
| **tested** | It ran on our TV. **Nothing is at this level yet** |

## The projects

| Reference | What it is | Runs on LG? | License | What it gives this project | Evidence |
|---|---|---|---|---|---|
| Instagram reel by `@travaoscroll` | The trigger. Claims one Claude Code prompt strips every ad from a smart TV, no root, open source, "17k stars in 4 days", 70+ models including LG and Samsung. Instagram marks the profile as AI-generated, and the caption sells a "system" by DM | — | — | Nothing to build on. Its numbers mix CleanYourTV and Free My TV | documented (the caption) |
| [Gathin23/cleanyourtv](https://github.com/Gathin23/cleanyourtv) | Debloats Android TV and Google TV over Wi-Fi ADB and installs an Apple TV-style launcher. Created 17/10/2026, ~38.7k stars. Python | **No** — webOS has no ADB | Not recognized by GitHub | The shape of the idea (an agent drives the install; everything reversible), not the mechanism | documented |
| [simbasjungles/free-my-tv](https://github.com/simbasjungles/free-my-tv) | An ad-free home screen for Google TV, LG webOS and Samsung Tizen. Created 19/10/2026, ~4.8k stars | **Yes**, webOS 3 or newer, through Developer Mode | MIT | **The closest thing to this project**, and the integration to study: listing apps, launching them, inputs, persistence, the shelf editor. Details below | documented; `web/tv.js` code read |
| [lasharor/cleanyourtv-WebOS](https://github.com/lasharor/cleanyourtv-WebOS) | A launcher that **replaces** LG's Home, plus an optional debloat of LG's ads and telemetry. Takes over Home with a RAM-only mount, so a reboot without its boot scripts brings LG's Home back. Created 21/10/2026, ~240 stars; its author tested one OLED on webOS 25 | Only **rooted** TVs with the Homebrew Channel, webOS 5 or newer | Not recognized by GitHub | The route to study if replacing LG's Home becomes the direction — root is open on the first target after all, see [below](#root-on-the-first-target) | documented |
| [throwaway96/slopbro](https://github.com/throwaway96/slopbro) | A public PoC that roots a webOS TV by exploiting a vulnerability in its `jsserver` component, then installs the Homebrew Channel for persistence. Reported to work on webOS 4–11. Created 08/06/2026, ~520 stars | Yes — and **it reaches the first target's exact firmware**, see below | AGPL-3.0-or-later | The route to root, if the owner decides that is the direction | documented |
| [marcreichel/apple-tv](https://github.com/marcreichel/apple-tv) | A proof of concept of the Apple TV (tvOS) home screen in plain HTML, CSS and JavaScript: tiles with the tvOS parallax tilt, a dock row, drag and drop. 2021, last push 05/2023, 7 files, [live demo](https://marcreichel.github.io/apple-tv/). **The owner's favourite look** | The technology does — a webOS app *is* a web page | MIT, as is its tilt component [apple-tv-card](https://github.com/marcreichel/apple-tv-card) (maintained, 06/2026) | The look, and only the look. What it lacks on a TV is listed below | code read |
| [kwameaj67/AppleTV](https://github.com/kwameaj67/AppleTV) | An iPhone clone (Swift, UIKit compositional layout) of the Apple TV app's *Store* tab: a hero carousel, a ranked chart, shelves of cards. 2022 | No — iOS | None | The section structure of a content screen, as an idea | code listing and screenshots read |
| [lechium/tvOSSettingsViewAuto](https://github.com/lechium/tvOSSettingsViewAuto) | A tvOS app (Objective-C, 2016, by Kevin Bradley, the author of nitoTV) recreating the pre-tvOS Apple TV menu: a settings-style list on the right and, on the left, a large preview — image, description, metadata — that follows the focus; selecting a row cycles its value. The *Weather*, *RSS* and *YouTube* entries are sample rows with a static icon, **not live widgets** | No — tvOS | MIT | The list-plus-preview pattern, for a settings or app-detail screen | code and screenshot read |
| [MrTangFB/TvNavigationLayout](https://github.com/MrTangFB/TvNavigationLayout) | An Android TV navigation bar (Java and Kotlin, 2018): a cursor that slides between items with a flip and a click sound | No — Android views | None | The focus-cursor animation, as an idea | code read |
| [nesdeq/lg-smart-tv-pihole-blocklist](https://github.com/nesdeq/lg-smart-tv-pihole-blocklist) | A Pi-hole blocklist for LG webOS: ads, tracking, ACR, telemetry. Found while looking, not sent by the owner; 7 stars | It runs on the network, not on the TV | None | The half a separate app cannot do: LG's own Home and apps keep their ads unless they are blocked at DNS or turned off in the TV's settings | documented (description only) |

## What LG's own documentation says

| Fact | Source | Evidence |
|---|---|---|
| webOS TV 6.x (2021) runs **Chromium 79** — the engine every web app on the first target gets | [Web API and web engine](https://webostv.developer.lge.com/develop/specifications/web-api-and-web-engine) | documented |
| The primary input is the pointer, but **every app must also work with the five-way keys**; an arrow press switches the Magic Remote to five-way mode | [Magic Remote guide](https://webostv.developer.lge.com/develop/guides/magic-remote) | documented |
| Developer Mode lasts a limited time, is extended with *EXTEND* while the TV is online, **cannot be extended once it has run out**, and **when it is disabled the apps installed through it are uninstalled** | [Developer Mode app](https://webostv.developer.lge.com/develop/getting-started/developer-mode-app) | documented |
| **There is no API to launch an app when the TV turns on** — LG staff, May 2025, repeated in February 2026 | [LG developer forum](https://forum.webostv.developer.lge.com/t/detect-the-tv-on-off-status-to-reload-app/25654) | documented |

## Root on the first target

**Correction, same day:** the paragraph below, in 0.1.3, concluded root was
"very likely closed" on firmware 03.53.45 from the *faultmanager* and
*DejaVuln* patch histories alone, without checking the tool that actually
tracks this. The owner checked [CanI.RootMy.TV](https://cani.rootmy.tv) and it
is wrong: **03.53.45 is itself the latest version a current tool can root.**
The lesson, not just the fact: when a checker for the exact question exists,
use it first — don't infer the answer from adjacent patch notes.

Four older exploits (`faultmanager`, `DejaVuln`, `ASM`, `crashd`) are patched,
each below 03.41.00. [**SlopBro**](https://github.com/throwaway96/slopbro) is
not: CanI.RootMy.TV lists `03.53.45` as its latest known rootable version for
this exact model (`UP7500PSF.AWZ`, webOS 6.x). SlopBro is a public PoC
(AGPL-3.0, ~520 stars, last pushed 28/09/2026) for a webOS vulnerability,
reported to work on webOS 4–11; it pairs with the TV over its own
remote-control service and, once run, installs the
[webOS Homebrew Channel](https://github.com/webosbrew/webos-homebrew-channel)
for persistence. Evidence: documented (CanI.RootMy.TV, checked by the owner;
SlopBro's own README, read in full).

**What this changes:** the route decision in [the queue](../.continue/README.md)
reopens as a real two-way choice, not a proposal with root foreclosed. It
carries real costs the Developer Mode route does not — using a third-party
exploit against your own TV, and keeping the firmware frozen below whatever
version patches it, which means no further LG OTA updates once rooted. That
tradeoff is the owner's to weigh, not this document's to resolve.

## Free My TV on LG — how the route works

- It is **a separate webOS app**, installed through LG's own **Developer Mode** app
  (free LG developer account, *Dev Mode Status* on, *Key Server* on, the TV's
  passphrase). Nothing is rooted, and LG's Home stays where it is; holding a
  number key on the remote makes that key open the app from anywhere.
- It talks to the TV over Luna, the TV's service bus — the same calls LG's own
  launcher makes. **On webOS 6, Developer Mode apps only get the public group,
  which leaves out the app list**; the app then asks the TV's remote-control API
  on `127.0.0.1:3000` (the one LG's phone app uses), and the TV shows a prompt to
  allow it once. HDMI inputs are opened as LG's own `com.webos.app.hdmiN` apps.
  *(code read: `web/tv.js`)*
- Developer Mode runs out in about 40 days unless someone presses *EXTEND* — and
  per LG (above), the app disappears with it. A rooted TV with the
  [webOS Homebrew Channel](https://github.com/webosbrew/webos-homebrew-channel)
  has no such limit.
- Its LG code is small: `webos/` (an `appinfo.json`, a JavaScript service,
  Python scripts that build the `.ipk` and install it) over a shared `web/`
  front end.

## marcreichel/apple-tv on a TV — what is missing

- **Everything loads from CDNs at `@latest`** — Tailwind, Alpine, Font Awesome,
  muuri, apple-tv-card, Google Fonts. On a TV it must be bundled into the app:
  it has to start offline, and code that changes under it is code nobody
  reviewed ([security.md §2](security.md#2-threat-model)).
- **It is built for a mouse.** The arrow keys move focus by a fixed jump of five;
  LG requires real five-way navigation, and the first target ships with a
  conventional remote.
- **The glass blur** (`backdrop-filter`) needs Chromium 76 or newer, so webOS 6
  has it — whether the first target's chip keeps 60 fps with it is a
  measurement, not a given.
- **Drag and drop** has no remote equivalent; reordering needs an edit mode.
- **The tiles open websites.** An LG app opens other apps through the system's
  application manager, which is what Free My TV does.

## What Chromium 79 means for the code

From Chromium's release history, not yet checked on the TV:

- Missing in 79: flexbox `gap` (84 — use grid `gap` or margins), optional
  chaining `?.` and `??` (80), CSS `aspect-ratio`, `:is()` and `:where()` (88).
  Code is written for, or compiled down to, what 79 runs.
- Present: CSS custom properties, grid, `backdrop-filter` (76),
  `IntersectionObserver`, `ResizeObserver`.
- A webOS app is loaded from `file://`, where ES module scripts may be refused;
  Free My TV ships classic scripts. Assume a classic-script bundle until the TV
  says otherwise.
- `appinfo.json` declares the app's resolution; `1920x1080` is the layout grid
  even on a 4K panel.
