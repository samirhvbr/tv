# tv

> **Status:** `ACTIVE`

Our own home-screen layout and operating-system customization for smart TVs, starting with LG (webOS).

**Phase: design — there is no code yet.** What is being decided, and in what
order, is in [the queue](.continue/README.md).

## Getting started

Nothing to install or run yet. Clone it and enable the hooks:

```bash
git clone git@github.com:samirhvbr/tv.git
cd tv
git config core.hooksPath tools/git-hooks
```

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
