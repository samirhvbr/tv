# Runbook — tv

> **Status:** `ACTIVE` · From a clean machine to a running environment, and the
> checklists that gate a release.

<!-- Sections 1–4 are yours to fill in. Sections 5–7 are inherited from the
     fleet standard and are already correct — keep them. -->

## 1. Requirements

Nothing yet — the repository holds documents. The first code fills this in.

## 2. From a clean machine to running

```bash
git clone git@github.com:samirhvbr/tv.git
cd tv
git config core.hooksPath tools/git-hooks   # once per clone — see §5
```

Nothing to install or run yet.

## 3. Configuration

None yet.

## 4. Deploy

None yet. Whatever it becomes, putting anything on a real TV is the owner's act.

## 5. The git hooks

Once per clone — yours, and every collaborator's:

```bash
git config core.hooksPath tools/git-hooks
```

Confirm both directions before you rely on them:

```bash
git commit --allow-empty -m "feat: a test"                  # must be REJECTED
git commit --allow-empty -m "0.1.0 - the first commit"      # must be accepted
```

The escape hatch is `TV_NO_HOOK`, named by `HOOK_ESCAPE_VAR` at the top of each hook.
Rules: [versioning.md](versioning.md).

## 6. Pre-flight before making a repository public

A private repository accumulates content that assumed privacy. Before flipping
visibility:

- [ ] `git log -p | grep -iE 'password|secret|token|api[_-]?key'` — scan the
      **history**, not just the working tree. A secret removed from HEAD is
      still in every clone.
- [ ] Any secret ever committed has been **rotated**, not merely deleted.
- [ ] No internal hostname, private IP range or infrastructure path that should
      not be public.
- [ ] `LICENSE` is present and `NOTICE` agrees with it about the license and the
      copyright holder.
- [ ] `SECURITY.md` names a reporting address that is actually monitored.
- [ ] Every prescriptive document declares its status; nothing reads as current
      while describing something abandoned.
- [ ] `.continue/` holds no finished item and no half-page detail.
- [ ] `README.md` is in English and describes what the project **is**, not what
      it was going to be.
- [ ] No placeholder left over from the skeleton:
      `grep -rn '<[A-Z_]\+>' . --exclude-dir=.git`

## 7. Verifying the repository still conforms

```bash
# the twins are identical below the H1
diff <(tail -n +2 CLAUDE.md) <(tail -n +2 AGENTS.md)

# version.md is a bare X.Y.Z
grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$' version.md && echo ok

# settings.json parses
python3 -m json.tool .claude/settings.json > /dev/null && echo ok

# every version in history has a tag and a Release (prints what is missing)
./tools/release.sh --backfill --dry-run
```

If the `diff` on the twins reports anything other than the mirroring comment,
an edit was applied to one file and not the other.
