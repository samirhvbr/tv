# References — tv

> **Status:** `ACTIVE` · What has been looked at so far, what each thing is, and
> what it can and cannot give an LG app. Checked on 26/10/2026; star counts are
> from that day and move fast.

None of these is a dependency. A reference without a license is an idea, never
code: no license means all rights reserved. Code taken from an MIT one gets its
attribution in [`../NOTICE`](../NOTICE) in the commit that brings it.

## What each one is

| Reference | What it is | Runs on LG? | License | What it gives this project |
|---|---|---|---|---|
| Instagram reel by `@travaoscroll` | The trigger. Claims one Claude Code prompt strips every ad from a smart TV, no root, open source, "17k stars in 4 days", 70+ models including LG and Samsung. Instagram marks the profile as AI-generated, and the caption sells a "system" by DM | — | — | Nothing to build on. Its numbers mix the two projects below |
| [Gathin23/cleanyourtv](https://github.com/Gathin23/cleanyourtv) | Debloats Android TV and Google TV over Wi-Fi ADB and installs an Apple TV-style launcher. Created 17/10/2026, ~38.7k stars. Python | **No** — webOS has no ADB | Not recognized by GitHub | The shape of the idea (an agent drives the install; everything reversible), not the mechanism |
| [simbasjungles/free-my-tv](https://github.com/simbasjungles/free-my-tv) | An ad-free home screen for Google TV, LG webOS and Samsung Tizen. Created 19/10/2026, ~4.8k stars | **Yes**, webOS 3 or newer | MIT | **Proof that the Developer Mode route works on LG**, and the closest thing to this project. Details below |
| [marcreichel/apple-tv](https://github.com/marcreichel/apple-tv) | A proof of concept of the Apple TV (tvOS) home screen in plain HTML, CSS and JavaScript: tiles with the tvOS parallax tilt, a dock row, drag and drop. 2021, last push 05/2023, 7 files, [live demo](https://marcreichel.github.io/apple-tv/). **The owner's favourite so far** | The technology does — a webOS app *is* a web page | MIT, as is its tilt component [apple-tv-card](https://github.com/marcreichel/apple-tv-card) (maintained, 06/2026) | The look. What it lacks on a TV is listed below |
| [kwameaj67/AppleTV](https://github.com/kwameaj67/AppleTV) | An iPhone clone (Swift, UIKit compositional layout) of the Apple TV app's *Store* tab: a hero carousel, a ranked chart, shelves of cards. 2022 | No — iOS | None | The section structure of a content screen, as an idea |
| [MrTangFB/TvNavigationLayout](https://github.com/MrTangFB/TvNavigationLayout) | An Android TV navigation bar (Java and Kotlin, 2018): a cursor that slides between items with a flip and a click sound | No — Android views | None | The focus-cursor animation, as an idea |
| [nesdeq/lg-smart-tv-pihole-blocklist](https://github.com/nesdeq/lg-smart-tv-pihole-blocklist) | A Pi-hole blocklist for LG webOS: ads, tracking, ACR, telemetry. Found while looking, not sent by the owner; 7 stars, not verified | It runs on the network, not on the TV | None | The half a separate app cannot do: LG's own home screen and apps keep their ads unless they are blocked at DNS or turned off in the TV's settings |

## Free My TV on LG — how the route works

- It is **a separate webOS app**, installed through LG's own **Developer Mode** app
  (free LG developer account, *Dev Mode Status* on, *Key Server* on, the TV's
  passphrase). Nothing is rooted, and LG's home screen stays where it is; holding
  a number key on the remote makes that key open the app from anywhere.
- On **webOS 6 and newer** an app installed this way cannot list the TV's apps;
  it asks, once, for the access LG's phone app uses, and the TV shows a prompt
  to allow it. On webOS 3 the list has to be pulled from a computer and built
  into the app.
- **Developer Mode expires in about 40 days** unless someone opens its app and
  presses *EXTEND*. A rooted TV with the
  [webOS Homebrew Channel](https://github.com/webosbrew/webos-homebrew-channel)
  does not have that limit, and Free My TV publishes a Homebrew repository too.
- Its code for LG is small: `webos/` (an `appinfo.json`, a JavaScript service,
  Python scripts that build the `.ipk` and install it) over a shared `web/`
  front end.

## marcreichel/apple-tv on a TV — what is missing

- **Everything loads from CDNs at `@latest`** — Tailwind, Alpine, Font Awesome,
  muuri, apple-tv-card, Google Fonts. On a TV it must be bundled into the app:
  it has to start offline, and code that changes under it is code nobody
  reviewed ([security.md §2](security.md#2-threat-model)).
- **It is built for a mouse.** The arrow keys move focus by a fixed jump of five;
  a remote needs real spatial navigation. LG's Magic Remote has a pointer, so
  hover works there, but a plain D-pad remote must work too.
- **The glass blur** (`backdrop-filter`) needs a Chromium 76 engine or newer, which on
  LG's published engine table means webOS 6 (2021) or newer. On an older TV it
  silently does not blur, and on a weak chip it costs frames. To be confirmed
  on the target TV.
- **Drag and drop** has no remote equivalent; reordering needs an edit mode.
- **The tiles open websites.** An LG app opens other apps through the system's
  application manager, which is what Free My TV's service does.
