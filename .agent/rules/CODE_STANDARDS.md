# Code Standards — Quanti Platform

**Status:** NON-NEGOTIABLE. These rules apply to every source file in the kernel,
in `services/`, in `packages/`, in `scripts/`, and in every fleet module repository
(`Quanti-CLI/quanti-module-*`).

Three rules. The first is about the language you write in. The second is about the
shape of what you write. The third is about where a fact is written: once.

---

## Rule 1 — Code is written in English.

Everything **inside a source file** is English. Two of the rows below carry a date,
and the section *"The one thing this rule does not ask for"* explains why:

| Artifact | Applies to | Example |
|---|---|---|
| identifiers (variables, functions, types, fields, parameters) | every file | `findOverflows`, `ChainNode`, `overflowPx` |
| log and console output | every file | `console.log('No wiring resolved for slot')` |
| thrown error messages | every file | `throw new Error('Missing --selector.')` |
| fixture and helper names in tests | every file | `function buttonNode()` |
| CLI flags, env var names, file names | every file | `--selector`, `QS_SESSION`, `ui-measure.ts` |
| comments (line, block, JSDoc, TODO) | **files created from 2026-08-08** | `// Parent already fits, so it is not a candidate.` |
| test descriptions (`describe` / `it`) | **files created from 2026-08-08** | `it('reports the child that refuses to shrink')` |

Polish exists in exactly **two** places, and nowhere else:

1. **`pl` i18n catalogs.** User-facing copy is translated, never hardcoded — see
   `LOCALIZATION_STANDARDS.md` Rule 1 (EN is the source of truth) and Rule 3
   (no hardcoded user-facing strings in components).
2. **Prose outside source files** — `.agent/**` documents, plans, session prompts,
   commit messages, and conversation. Those are not code.

### Why this is non-negotiable

A source file is read alongside the APIs it calls, and those APIs are English.
`const lancuch = element.getBoundingClientRect()` is two languages in one sentence:
it breaks autocompletion, it breaks `grep`, it breaks the reviewer's reading rhythm,
and it makes every later rename a translation exercise. The same applies to comments
and messages — a Polish comment above an English function forces the reader to switch
languages mid-file, and a Polish error message cannot be matched against the English
identifier that produced it.

Mixed-language code also does not survive contact with tooling: log aggregation,
error grouping, and search all assume one language.

### The trap this rule exists to close

Language drift reproduces itself. A file written in Polish becomes the template for
the next file, because the next author reads the neighbour and matches its style.
This is exactly how the drift measured on 2026-08-07 started: a draft script written
in Polish was extended into a tool written in Polish. Do not match a neighbour that
breaks this rule — fix the neighbour or leave it, but write yours in English.

### The one thing this rule does not ask for: retranslating what is already written

Names, log output and thrown messages are English in **every** file, without exception
and without a grace period. They were two weeks of drift and they were removed in one
pass on 2026-08-08.

Comments and test titles are English in **every file written from 2026-08-08 onwards**.
The 13 812 Polish comments and test titles that predate that date, across 1 153 files,
**stay as they are** — that is a decision, not a backlog, and it is recorded in
`.agent/artifacts/code-language-audit/legacy-polish-prose.txt`.

The reasoning, because a rule with an exception has to justify it or it decays into
"whatever anybody feels like":

- Those comments are not filler. They carry *why* — the constraint that forced a shape,
  the variant that was rejected, the incident a guard exists to prevent. Very often they
  are the only place that reasoning is written down at all.
- Translating them in bulk means paraphrasing them. Paraphrase reads fine on the day it
  is written and fails the reader six months later, when the sentence that would have
  explained the decision has been smoothed into something that merely describes the code.
- The cost lands where the value is lowest: rewriting text that is already understood by
  everyone who reads this repository, in order to satisfy a rule whose real purpose —
  keeping the codebase readable alongside the English APIs it calls — is already served
  by having the names in English.

What must not continue is the *drift*, and drift travels by example. Hence the shape of
the guard: the frozen set is frozen **by path**. A file created today has no neighbour to
inherit from, so its prose is English and the gate says so. The baseline only ever
shrinks — translate a file, drop its line. A line **added** to that list is a finding in
review, not housekeeping: it means somebody wrote new Polish prose and then widened the
exemption to cover it.

### What to do when you find a violation

Renaming is behaviour-preserving, so it is safe, but it is not free of review cost:
do it as its own commit, never folded into a change of behaviour. Exported symbols
first (they accumulate call sites), then production files, then tests.

---

## Rule 2 — Code follows SOLID

Each principle below is stated as the concrete thing it forbids in this codebase,
not as an abstraction.

### S — Single Responsibility

A file, a function, and a module each do one thing. The architectural version of
this rule already exists and is stricter: the kernel (`src/`) does routing, auth and
orchestration and **never** business logic (`CORE_ARCHITECTURE.md`). The everyday
version: a function that both fetches data and renders it has two reasons to change,
so split it. A pure core with an I/O shell around it is the default shape — it is
also what makes the core testable without a network, a browser, or a database.

### O — Open/Closed

Extend by adding, not by editing. Quanti's extension points are manifests,
capabilities, extension slots and queue events. Adding a module must not require
a line of change in the kernel — the kernel knows nothing about any specific module
(`architecture-guard.md`, and the guard `scripts/check-kernel-module-agnostic.ts`
enforces it). A `switch` on a module id is this principle being violated out loud.

### L — Liskov Substitution

A polymorphic backend must honour the contract it declares. Shared services are
polymorphic by `instance_key`; an implementation that silently narrows behaviour —
ignores a documented field, throws where the contract promises a value, returns
`undefined` where the contract promises a list — breaks every caller written against
the contract rather than against that implementation. If the behaviour genuinely
differs, it is a different capability, not a variant of the same one.

### I — Interface Segregation

Keep capability interfaces small. A module must not be forced to implement methods
it does not use in order to declare a capability. Prefer several narrow capabilities
over one broad one; a capability with optional halves is two capabilities.

### D — Dependency Inversion

Depend on contracts, not on concrete implementations. Modules communicate through
capability bindings, RPC service bindings and queue events — **never** by importing
each other (`CORE_ARCHITECTURE.md`, cross-module imports are forbidden). Inside a
file the same rule applies at smaller scale: take the clock, the fetcher and the
database as arguments, do not reach for globals, and the unit becomes testable
without mocking the world.

### SOLID is enforced, not admired

The principal's directive (2026-11-04): SOLID is applied and checked, not quoted. A review
that finds a violation names the letter and the line; "it works" is not an answer to it.
The machine-checkable halves are listed under *Enforcement*; for the rest, a change that
breaks a letter is refused in review the same way a red test is.

---

## Rule 3 — One source of truth (DRY)

**Every fact is written in exactly one place. Everything else reads it.** A copy is not
"the same knowledge twice" — it is two facts that agree today and drift apart silently
the first time only one of them is updated. Nobody is told when they drift.

A fact here means anything that can be known in more than one place: a list of shell
places and what each accepts, capability ids and their words, event types, registry
keys and their labels, enum values and their labels, colour values, a rule such as
"which element fits which place", a contract type, a threshold — **and a piece of
behaviour**: the code that draws a button, closes a window, formats a date, builds a
query.

**The source is the OWNER of the fact, wherever it lives** — the kernel, the registry,
another fleet module, a shared package, or one place inside the same module. The rule
is not "put everything in the kernel"; it is "write it once, where it belongs, and
reach it from everywhere else".

### Where a fact may live — and how others reach it

| The fact belongs to | Others reach it by | Never by |
|---|---|---|
| **the same module** (its components, helpers, constants, its own rules) | one exported function, component or constant inside the module, imported where needed | a second, hand-written version in another file of the module |
| **another fleet module** (Canvas Studio's rule marks and element picker, a module's tables and events) | that module's capability (opened through the kernel), its RPC, its queue events | an import of its code, a re-implementation of its behaviour, SQL against its table |
| a **shared package** (`@quanti/ui-kit`, `@quanti/dataflow`, carried engine) | a dependency or code **carried** by a script with a checksum (`src/vendor/**`, `scripts/vendor-*.ts --check`) | a copy pasted into the module |
| the **kernel** (shell places, capabilities, facts catalogue) | a read through the kernel gate at run time (`BACKEND.*`, `/api/...`) | a hand-written list, map or `switch` in a module |
| the **semantic registry** (field labels, group names and their nouns, enum labels) | the registry gate (`REGISTRY_ACCESS.md`) | a dictionary inside a module, a copy in a fixture used by production code |
| the **design system** (colours, sizes) | tokens `hsl(var(--…))` | a literal colour |

**Inside one module the rule is the same.** Two screens of one module drawing their own
"call to action", their own search box, their own close button, their own line style is
one fact written twice — DFS 2.2 fixed this by writing Canvas Studio's look once in
`src/components/studio/actions.tsx` and refusing a second version in a test. A third
copy of a helper inside a module is extracted on the spot, not "later".

**When the read you need does not exist, add it at the owner** — a capability mode of the
owning module, a registry entry, an export of the module's own helper, a field in an
existing answer — and read it.

**The kernel is not where homeless facts go** (the principal, 2026-11-04: "the kernel is
not to be stuffed with trifles"). The kernel gets a new read ONLY when the kernel itself
owns the fact — routing, auth, tenants and projects, the instance registry, shell places,
capability contracts — and then only as a pass-through, never with domain logic
(`CORE_ARCHITECTURE.md`). A noun for a registry group belongs in the registry; a widget,
a look or a rule of one editor belongs in that editor's module or in `@quanti/ui-kit`; a
helper two modules need belongs in a shared package. "Nobody else has it" is a reason to
find the owner, not to pick the kernel. A missing read is a gap in the
source, never a licence to copy. Session 16 of `data-flow-studio` is the worked example:
the module needed the applications of a project, the kernel had them, so the kernel got
`dataflow_projectApplications` instead of the module learning `ProjectDO`.

### Measured instances (2026-11-03, study `data-flow-studio/badania/13-badanie`)

| Copy | Where | Source it should read |
|---|---|---|
| the ten shell places with their accepted capabilities (39 hits) | `data-flow-studio` `src/model/module-screen.ts` `SHELL_PLACES` | `/api/slot-wirings/meta` — Canvas Studio already reads it and has 0 copies |
| a second, weaker "what fits this place" rule | `data-flow-studio` `candidatesFor` | the same meta answer + `scw_validateWiring` |
| words for capabilities and places | `data-flow-studio` `CAPABILITY_WORD`, `canvas.ts` | the capability specs the kernel already owns (`.agent/capabilities/specs`), read through the slot meta answer — not a new kernel table |
| nouns "osoby / firmy / produkty" per registry group | `data-flow-studio` applications locales (2026-11-03) | the registry group entry (owner: the registry, not the kernel) |
| the list of shell places itself, four times | kernel `shell-manifest.ts`, `modules/shell-slots.ts`, `modules/core/ui/registry.ts`, `dashboard/ModuleToolbar.tsx` | one of them; the other three read it |
| colour values outside tokens | 165 hits across 6 modules | tokens |

### What is NOT a copy

- A **contract** declared on both sides of a seam *and asserted by a test on each side*
  (`.agent/contracts/*.json`) — the test is what makes it one fact.
- Code **carried** by a script with a checksum — the script is the single writer.
- A module's **manifest** declaring what it needs — a declaration, not knowledge.
- A **test fixture** holding measured data — as long as production code never imports it.

### Duplicated code, not only duplicated facts

Two functions doing the same thing in two files is the same defect one level down: fix
one and the other keeps the bug. The fourth time a pattern is written, extract it
(`SCOPE_LADDER.md` measured nine hand-written copies of one resolution rule before it
got a function). Before writing a helper, search for it — `code_view query:`.

---

## Enforcement

- `LOCALIZATION_STANDARDS.md` — user-facing copy (EN is the source of truth).
- `CORE_ARCHITECTURE.md` + `architecture-guard.md` — the architectural half of SRP,
  OCP and DIP.
- `scripts/check-kernel-module-agnostic.ts` — OCP, enforced in `npm run validate:fleet`.
- Cross-module imports refused (DIP) — Fleet Guard and `architecture-guard.md`.
- `shell-slots.test.ts` — keeps the kernel's four shell-place lists equal until they
  become one (Rule 3).
- `scripts/vendor-*.ts --check` — carried code equals its source (Rule 3).
- Fleet Guard `error-reaches-ae` — the ratchet pattern Rule 3's fleet guard follows.
- **Rule 3 in the fleet — guard to be built (2026-11-04):** a Fleet Guard cold rule
  that refuses a hand-written kernel identifier (shell place id, capability id, fact
  type) and a literal colour in a module's production source, with a recorded per-file
  debt that may only shrink, fed by a kernel-generated vocabulary carried to the CLI.
  Until it exists, the measurement is `node .agent/artifacts/data-flow-studio/badania/13-badanie/pomiar-kopii.mjs`.
- `scripts/check-code-language.ts` — Rule 1. Parses each file with `ts-morph` and
  attributes every finding to a kind, because a regex over source text cannot tell a
  name from a comment from a sentence a user reads.

### What the Rule 1 guard reports, and what it enforces

Four kinds, each attributed to the node it came from, because a regex over source text
cannot tell a name from a sentence somebody reads:

| Kind | What it is | Blocks the gate in |
|---|---|---|
| `identifier` | a declared name | every file |
| `message` | a string handed to `console.*` or to a thrown error | every file |
| `comment` | line, block or JSDoc | files absent from the baseline |
| `test-description` | the title of a `describe` / `it` / `test` | files absent from the baseline |

The baseline is `.agent/artifacts/code-language-audit/legacy-polish-prose.txt` — 1 153
paths frozen on 2026-08-08, holding 13 812 Polish comments and test titles. A file on
that list keeps its prose. A file **not** on it is a file written after the decision, so
its prose is English and the gate says so.

The list only shrinks. Translate a file, delete its line, and the guard starts holding it
to the rule. A line **added** is the ratchet being undone and belongs in review as a
finding, not as housekeeping. Regenerating wholesale (`--write-baseline`) is a recovery
tool, not a routine step.

A missing baseline file makes every path count as new, so the gate fails loudly rather
than quietly waving 13 812 findings through.

**Strings rendered to the user are never reported.** A Polish label in a component is a
localisation debt (`LOCALIZATION_STANDARDS.md` Rule 3), not a code-language one, and
reporting it here would push authors to translate the interface while tidying up — a
behaviour change smuggled in as housekeeping. Rename the constant; leave its contents
alone. The same holds for prose a script writes INTO a generated document.

Useful invocations:

```bash
npx tsx scripts/check-code-language.ts --report          # counts by kind and by directory
npx tsx scripts/check-code-language.ts --path src/lib/nav --kind identifier
npx tsx scripts/check-code-language.ts --write-baseline  # recovery only — see above
```

## Distribution to fleet modules

`.agent/rules/*.md` reaches fleet module repositories through the CLI template
bundle, but **not automatically**: `scripts/sync-cli-templates.ts` carries an explicit
mapping list. A rule added here stays in the kernel until an entry is added there and
`packages/quanti-cli/src/templates/rules.generated.ts` is regenerated — and that is a
CLI change, which by `CLAUDE.md` never shares a commit with the kernel.