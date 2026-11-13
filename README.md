# tv

> **Status:** `ACTIVE`

Our own media interface and home-screen customization, starting with a
**local Plex browser prototype** and LG webOS as the physical TV target.

The prototype groups series, seasons and episodes, provides explicit parent
navigation, and synchronizes playback progress without a page reload. Plex
remains the catalog, media and per-user playback-state server. The physical
Home replacement under ADR-001 remains separate work.

TV libraries use Plex's native hierarchy. Other Videos libraries can use a
local hierarchy inferred from their existing folders, while playback keeps the
original Plex video identity and history. No server files are renamed or moved.

## Getting started

Use Node.js **22.9+**. Clone it, enable the hooks, and start:

```bash
git clone git@github.com:samirhvbr/tv.git
cd tv
git config core.hooksPath tools/git-hooks
npm start
```

Open **http://127.0.0.1:4317**. Without credentials, the interface opens a
clearly labeled demo with an original short test video. Use **Conectar Plex**
to enter the server base URL and user token locally. Credentials remain in the
gateway's memory and are not saved in browser storage. For startup configuration,
copy `.env.example` to `.env` and fill it locally before restarting.

Runtime startup has no npm dependency. To run the tests:

```bash
npm ci --ignore-scripts
npm test
npx playwright install chromium
npm run test:browser
```

See [browser prototype](docs/browser-prototype.md) for supported behavior,
Plex setup, security boundaries and real-server/device acceptance limits.

## Documentation

| Path | What it is |
|---|---|
| [docs/](docs/README.md) | **The record** — architecture, decisions, security, runbooks |
| [.continue/](.continue/README.md) | **The queue** — what is still open, and whose call it is |
| [.claude/](.claude/README.md) | Permission posture for agents — the model is the user's choice, never this folder's |
| [CHANGELOG.md](CHANGELOG.md) | **The history** — newest first; each heading is a commit subject |
| [version.md](version.md) | **The single authority on the version** — read as the first `X.Y.Z` in the file. Every bump becomes a tag and a published Release |

## Contributing

```bash
git pull
git config core.hooksPath tools/git-hooks   # once per clone
```

Write the `CHANGELOG.md` entry, bump `version.md` in the same commit, and commit
with the entry's heading as the subject — `0.1.1 - short description`.
Rules: [docs/versioning.md](docs/versioning.md).

## Standard

The documentation structure of this repository comes from the fleet standard at
[samirhvbr/repodocs](https://github.com/samirhvbr/repodocs). The norm itself
lives there and is deliberately **not** copied here, so there is one place to
change it.

## Language

English (US) for everything in the repository — documents, commit messages,
pull requests, issues, code comments — and nothing bilingual. Exactly one thing
stays Portuguese: **end-user-facing strings**, because that is product i18n, not
repository content.

**In a repository we do not own, the upstream's conventions win** — the language
and the commit shape both. Check before opening a pull request or an issue
there; when you cannot tell, English (US). See
[conventions.md §8](https://github.com/samirhvbr/repodocs/blob/master/docs/conventions.md#8-language).
