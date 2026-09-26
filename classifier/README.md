# Extraction contract and validators

Deliverables 2 (structural half) and 7 of the build plan. Node 22+, zero
dependencies, no network.

    node test.js      # 44 assertions against the reviewed W049 reference

## Files

| File | Purpose |
|---|---|
| `contract.js` | `arqon.candidates/2`, aligned to `arqon.working-review-policy/1` |
| `validate.js` | Deterministic checks against a frozen transcript |
| `fixture.js` | Adapts `W049-reference.json` to candidate shape for evaluation |
| `manifest.js` | Freezes source bytes with sha256 |
| `core.js` | The importer, unchanged, so refs are reproduced rather than trusted |

## The reference reconciles

The importer reproduces the review pack exactly: sha256
`51e01c62…4733f2`, fingerprint `1df000041775`, 32 passages, and all 23 cited
refs resolve. All 14 reference records pass the contract unchanged.

Four of those records failed on the first run. In each case the contract was
wrong and the adjudication was right, which is what a reference is for:

| Rejected | Cause | Correction |
|---|---|---|
| A-006, A-018 | `derived_from_explicit_uncertainty` unknown | An uncertainty stated in the room is an extracted origin, not reviewer output |
| A-012 | `statedPriority` assumed `ref`/`qualified` | The policy carries `sourceRefs[]` and a `qualifier`; "For me yes" must survive |
| A-005, A-014 | Issue required `reportedBy` | The working policy requires owner and impact |
| A-003 | Required `impactedEntities` | Scope and identity differ: Turkey and Argentina are named, their entity ids are the gap |

## What the four distinctions cost, and why they are in the schema

1. **Programme priority is not a stated must.** A-012's speaker said Must and
   qualified it "For me yes". Both are stored; neither becomes the other, and
   `programmePriority` is null on every record.
2. **A reported role is not a resolved person.** The Group controller
   volunteered to ask legal. That is a role on a follow-up, not an identified
   owner, and promoting it is an error the validator names.
3. **A condition is not a date.** "Before we commit" goes in `dueCondition`.
   Putting it in `dueDate` invents a deadline.
4. **Reviewer content is not a participant claim.** Clarifications,
   relationships and proposed acceptance criteria declare their origin, and
   reviewer-origin records are refused from the extracted set.

## What validation establishes

Well-formedness; every citation resolves in the document supplied; quoted words
are present in the passage cited; nothing absent is invented; no human act is
claimed by a machine.

## What it does not

**That a citation supports the claim made from it.** A passage can exist, be
quoted exactly, and still not entail the statement. That is semantic review and
stays with a person — the quote-mismatch error says so.

A confirmed speaker does not establish authority over a subject. The validator
refuses only a Decision resting entirely on unconfirmed speakers (C-03).

The settled-state check is a heuristic: it fires when an assertion contains
"corrected", "resolved" and similar while the cited passages hedge. It does not
detect every unsupported claim, and it deliberately does not fire on questions —
asking whether Vietnam was corrected is not asserting that it was.

## Adjudication is not approval

`fixture.js` resets `annotationReview` to `candidate` and holds
`businessApproval` at `not_evidenced`. A record Codex adjudicated is still a
record nobody approved, and the adapter refuses to carry the states across.
A test asserts this.

## Not built here

The classifier itself, and the review queue with local persistence
(deliverables 2 second half, and 3). Provider adapters stay separable.

No accuracy claim is made or supportable: the reference is one synthetic
transcript, reviewed non-blind, with no Decisions, Assumptions or Exceptions in
the retained set. Those kinds, malformed inputs and a held-out transcript are
needed before any general statement about performance.
