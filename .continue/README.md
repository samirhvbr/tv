# `.continue/` — the queue

> **Status:** `ACTIVE` · Last reviewed 26/10/2026, repository at 0.1.0

Work in progress: drafts, plans under discussion, notes on things still being
built, briefings for picking the work back up later.

**The norm this folder obeys lives once, in the fleet standard:**
[samirhvbr/repodocs `docs/conventions.md`](https://github.com/samirhvbr/repodocs/blob/master/docs/conventions.md)
— §1 (queue vs. record) and §2 (this README is mandatory). Read it there; a copy
here would be a second source of truth.

## How it works

- **Git-tracked on purpose — deliberately NOT in `.gitignore`.** Opening the
  project on another machine brings the context along, which is the whole point:
  you can *continue* from where you stopped.
- **Nothing here is source of truth.** The moment a document describes something
  that already exists, it moves to [`../docs/`](../docs/) and the permanent
  record of *when* is [`../CHANGELOG.md`](../CHANGELOG.md).
- **A finished item leaves — and *finished* means the thing exists.** It is
  deleted here, not ticked off; the permanent record of completion is the
  changelog. A queue holding an already-done item costs more than an incomplete
  queue: it makes the next session redo work.
- **Nothing leaves for any other reason.** Not length, not language, not a
  session ending, not an agent who would have written it differently. **To
  produce an item is to make the thing exist**, and deleting the document is the
  last step of the commit that carries the work — never a step of its own.
- **If an item needs half a page to describe something that already exists**, it
  is in the wrong place. Write it in
  `../docs/` and leave one line and a pointer here.
- **In a contradiction between this folder and a document in `../docs/`, the
  document wins.**
- The **Continue** IDE also uses this folder for its own configuration.

## 1. What is left here

<!-- One line per item. Delete a row when the item is done — do not tick it. -->

| Item | State | Who unblocks it |
|---|---|---|
| The other TVs — model and webOS version of each of the owner's other TVs, for after the first target works | Open | Owner |
| The first target TV rooted and running cleanyourtv-WebOS — [ADR-001](../docs/decisions.md) decided the route; the owner runs SlopBro, the Homebrew Channel and cleanyourtv-WebOS against the physical TV, each from its own README. Nothing to build here until it's done | Open | Owner |
| What "layout" covers, now that it means customizing cleanyourtv-WebOS's launcher — a theme, a fork, a mode it adds — seen against what the installed launcher actually looks like, not decided sight unseen. The favourite look so far is still the Apple TV home screen of marcreichel/apple-tv ([references](../docs/references.md)) | Open — needs the row above first | Owner |

## 2. Where things went

<!-- When a document leaves for ../docs/, give it a row with a relative link.
     This is what keeps "it misleads whoever opens it" from becoming "nobody
     can find it". -->

| It was here | It is now at |
|---|---|
| _(nothing yet)_ | |

## 3. Pending decisions

| Decision | Whose | Note |
|---|---|---|
| _(nothing yet)_ | | |
