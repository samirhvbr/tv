# Changelog

Entries in the commit-message format (`version - short description in English`,
see [docs/versioning.md](docs/versioning.md)), newest first. **Each `##` heading
is literally the commit subject** — the entry is written *before* the commit, so
the sentence that lands in `git log` is one that was weighed rather than
improvised at `git commit` time.

Bodies are narrative: what changed, why, and what was measured. This file is
never rewritten.

## 0.1.3 - the first target TV is the owner's 43UP7500PSF

The owner named the TV everything is built and measured against first: an LG
43UP7500PSF, a 2021 model on webOS 6.x with Chromium 79 and a conventional
remote, on firmware 03.53.45 as LG's support page lists it. `CLAUDE.md` and
`AGENTS.md` carry it where an agent reads first; the queue's row about target
TVs now asks only for the other ones, and the route row records Developer Mode
as the proposal waiting on the owner.

## 0.1.3 - the references say how each fact was checked, and bring in LG's own documentation

A second review of the page asked for it, rightly: a claim copied from a README
and a claim we read in the code were written the same way. Every row now carries
its evidence — *documented*, *code read*, or *tested*, and nothing is tested yet.
The page gains LG's own statements that bound the project — Chromium 79 on
webOS 6, five-way navigation required of every app, Developer Mode uninstalling
its apps when it is disabled, no API to start an app at power-on — and
lasharor/cleanyourtv-WebOS, the launcher that replaces LG's Home but needs a
rooted TV. On the first target that root is very likely closed: firmware
03.53.45 is newer than every build the published exploits are known to reach.

## 0.1.2 - lechium/tvOSSettingsViewAuto joins the references, as a menu pattern rather than widgets

The owner sent it as the project that managed to put widgets on the screen. Read
closely — the README, the code and its screenshot — it is a 2016 tvOS settings
screen: a list on the right and a preview on the left that follows the focus.
Its *Weather* row shows a static icon and sample metadata; nothing on it is live.
The page now says so, and points at Free My TV's drawer as the reference that
does show live weather and prices on an LG TV.

## 0.1.1 - the references studied so far, and what each one can give an LG app

The owner sent the Instagram reel that started this, and three repositories:
two Apple TV-style layouts and an Android TV navigation bar. Following the reel
led to the two projects it was talking about. `docs/references.md` records what
each one is, whether it can run on an LG TV, its license, and what this project
can take from it — with the two that matter most worked out: Free My TV, which
already ships an ad-free home screen to LG through Developer Mode without root,
and marcreichel/apple-tv, the owner's favourite look, which is plain HTML, CSS
and JavaScript and therefore the same technology a webOS app is made of.

The references row leaves the queue because the thing exists now; the route and
the layout rows point at the page. Nothing was installed or run against a TV.

## 0.1.0 - initial documentation structure

First commit of tv: our own home-screen layout and operating-system customization for smart TVs, starting with LG (webOS). The repository holds
documents only — the route on LG and the stack are open questions in the queue,
and the code starts once they are answered.

The documentation skeleton comes from the fleet standard at
[samirhvbr/repodocs](https://github.com/samirhvbr/repodocs) — the norm itself
lives there and is **not** copied into this repository, so there is one place to
change it.
