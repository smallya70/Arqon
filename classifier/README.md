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

## The CLI

    node arqon.js prepare  <source> --out prompt.txt [--workshop W-049]
    node arqon.js ingest   <response.json> --transcript <source> [--model "..."]
    node arqon.js evaluate <set-id|response.json> --reference <reference.json>
    node arqon.js list

`prepare` writes the extraction prompt: transcript, policy, output contract.
**The reference answers are never in it** — a prompt containing the expected
records measures obedience, not extraction. A test asserts that no reference
statement or record id appears.

`ingest` reads a saved reply, fills the provenance the adapter can attest to,
runs the contract gate, and saves what passes as `awaiting_review`. Rejected
candidates are kept alongside, not discarded: a reviewer needs to see what was
refused. The store has no way to write an approved state.

The provider is separable. `providers/manual.js` implements `prepare`, `ingest`
and `provenance`; an API adapter implements the same three and nothing
downstream changes. The manual adapter reports its model as "supplied by a
person; not observed by the tool", because that is all it knows.

## Evaluation is coverage, not accuracy

`evaluate` counts obligations nobody extracted, candidates citing passages the
reference does not use, kind and requirement-type disagreements, and unsupported
fields. It does not produce a percentage and cannot: one synthetic transcript,
reviewed non-blind, with no Decisions, Assumptions, Risks or Exceptions in it.
The report names those absent kinds every time it runs.

Segmentation is not scored. Matching is by passage overlap, so a candidate
covering three reference records, or three covering one, is counted as covering
what it cites. Fourteen is the reference's decomposition, not a target.

## Message record

The sending is manual and will be backend-managed later. The record of it is
neither, and that is the gap this closes: "was the policy lead ever asked about
Q-002, and did they answer?" has to be answerable from the system rather than
from someone's sent items.

    node arqon.js sent    --to a@b.com --records Q-002,IC-001 --by "S. Mallya"
    node arqon.js reply   <message-id> --from a@b.com --text "..."
    node arqon.js resolve <message-id> --record Q-002 --decision answered \
                          --by "S. Okonjo" --authority "accounting policy lead"
    node arqon.js history <record-id>
    node arqon.js outbox

Three events, three authors, never collapsed:

| Event | What it is |
|---|---|
| sent | A question was put to someone, covering named records |
| reply | Something came back. Evidence, not an answer |
| resolution | Someone with authority decided the question is closed |

**A reply does not close anything.** `history` reports "replied, unresolved"
and says so. A resolution requires who decided and on what authority, because a
reply from someone without authority over the subject settles nothing — and a
system that resolves on reply accumulates decisions nobody made.

A manual send is recorded as a claim: "reported by the sender; the tool did not
send or observe this message". When Graph sends it, the attestation changes and
the rest of the shape does not.

## Not built here

The review queue and its operations — accept, edit, reject, defer with change
history (deliverable 3). One register feeding both views (deliverable 4). A
direct API adapter, which should come after the absent kinds and a held-out
transcript exist.

No accuracy claim is made or supportable: the reference is one synthetic
transcript, reviewed non-blind, with no Decisions, Assumptions or Exceptions in
the retained set. Those kinds, malformed inputs and a held-out transcript are
needed before any general statement about performance.
