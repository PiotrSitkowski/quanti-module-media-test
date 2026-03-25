# Versioning Standards (SemVer + Conventional Commits + Release Flow)

**Version:** 1.0
**Enforced by:** `quanti deploy` (Git Working Tree Check — WARNING) + developer discipline

---

## Semantic Versioning (SemVer)

Every module uses `MAJOR.MINOR.PATCH` versioning in `package.json`.

| Bump | When | Example |
|------|------|---------|
| `PATCH` | Bug fix, no API change | `1.0.0` → `1.0.1` |
| `MINOR` | New feature, backward-compatible | `1.0.0` → `1.1.0` |
| `MAJOR` | Breaking change, new required field, changed API contract | `1.0.0` → `2.0.0` |

**Special rule:** changing `schemaVersion` in `definition.ts` → always MINOR or MAJOR (never PATCH).

---

## Conventional Commits

All commits MUST use a conventional prefix:

| Prefix | Meaning | Version bump |
|--------|---------|--------------|
| `feat:` | New feature | MINOR |
| `fix:` | Bug fix | PATCH |
| `docs:` | Documentation only | none |
| `chore:` | Config, tooling, maintenance | none |
| `refactor:` | Code refactor, no behavior change | PATCH |
| `test:` | Tests added or updated | none |

**Breaking change:** add `BREAKING CHANGE:` footer to the commit body → MAJOR bump.

### Example commit
```
feat: add bulk-delete endpoint

BREAKING CHANGE: delete endpoint now requires `ids[]` array instead of single `id`
```

---

## Release Flow (MANDATORY before `quanti deploy`)

An AI Agent or developer MUST follow these 5 steps before deploying:

1. `npm run test` — all tests MUST be green
2. Bump `version` in `package.json` according to SemVer rules above
3. `git add package.json`
4. `git commit -m "chore: bump version to vX.Y.Z"`
5. `git tag vX.Y.Z`

Then run `quanti deploy`.

---

## First Publication (after `quanti create`)

```bash
git init
git add .
git commit -m "chore: init module"
git tag v1.0.0
quanti deploy
```

---

See project root `.agent/rules/VERSIONING_STANDARDS.md` for full reference.
