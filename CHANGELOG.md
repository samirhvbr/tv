# Changelog

Entries in the commit-message format (`version - short description in English`,
see [docs/versioning.md](docs/versioning.md)), newest first. **Each `##` heading
is literally the commit subject** — the entry is written *before* the commit, so
the sentence that lands in `git log` is one that was weighed rather than
improvised at `git commit` time.

Bodies are narrative: what changed, why, and what was measured. This file is
never rewritten.

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
