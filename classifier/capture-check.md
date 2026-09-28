# Obligation capture check — W049_v1_synthetic_codex_review1

Mark each pair: y = this candidate captures the obligation, n = it does not.
Sharing a passage is not capturing an obligation, which is why this cannot be
counted automatically.

| mark | obligation | kind | candidate | candidate kind | shared |
|---|---|---|---|---|---|
| y | A-001 | Requirement | C-001 | Requirement | 1df000041775/P-009 1df000041775/P-009 |
| y | A-002 | Requirement | C-001 | Requirement | 1df000041775/P-009 1df000041775/P-009 |
| y | A-003 | Requirement | C-002 | Requirement | 1df000041775/P-010 1df000041775/P-011 1df000041775/P-013 |
| n | A-005 | Issue | C-003 | Open question | 1df000041775/P-003 1df000041775/P-005 |
| y | A-006 | Open question | C-003 | Open question | 1df000041775/P-003 1df000041775/P-005 1df000041775/P-006 1df000041775/P-008 |
| y | A-007 | Requirement | C-004 | Requirement | 1df000041775/P-019 |
| n | A-009 | Open question | C-006 | Action | 1df000041775/P-020 1df000041775/P-021 |
| y | A-010 | Action | C-006 | Action | 1df000041775/P-020 1df000041775/P-021 |
| y | A-012 | Requirement | C-007 | Requirement | 1df000041775/P-025 |
| n | A-014 | Issue | C-005 | Requirement | 1df000041775/P-015 |
| n | A-015 | Open question | C-009 | Open question | 1df000041775/P-030 1df000041775/P-031 1df000041775/P-032 |
| n | A-016 | Action | C-009 | Open question | 1df000041775/P-030 1df000041775/P-031 1df000041775/P-032 |
| y | A-017 | Requirement | C-002 | Requirement | 1df000041775/P-010 |
| y | A-018 | Open question | C-009 | Open question | 1df000041775/P-030 1df000041775/P-031 1df000041775/P-032 |

## Obligations

- **A-001** (Requirement) Apply closing rate to balance sheet accounts and average rate to income statement accounts.
- **A-002** (Requirement) Prevent local override of the translation rate applied to each account type.
- **A-003** (Requirement) For the entities referred to as Turkey and Argentina, restate before translating at closing rate while those economies remain hyperinflationary.
- **A-005** (Issue) Three entities are reported to have used period-end rates for revenue despite the stated average-rate policy; Singapore and Malaysia are named, and Vietnam is uncertain.
- **A-006** (Open question) Has Vietnam's reported revenue translation issue been corrected, and when?
- **A-007** (Requirement) Hold entity ownership with effective dates so a mid-period acquisition consolidates from the acquisition date rather than the whole period.
- **A-009** (Open question) Can legal provide ownership data carrying effective dates?
- **A-010** (Action) Ask legal whether its system holds ownership effective dates and can provide them.
- **A-012** (Requirement) Calculate non-controlling interests from ownership percentages in the system rather than by manual journal.
- **A-014** (Issue) APAC reports a problem with the quarterly ownership feed, citing an acquisition that closed in November but reached the consolidation model only in February.
- **A-015** (Open question) Should CTA reconciliation be performed in the system?
- **A-016** (Action) Check whether the platform supports CTA reconciliation before committing to performing it in the system.
- **A-017** (Requirement) Provide an exception route for hyperinflationary entities.
- **A-018** (Open question) Does the platform support CTA reconciliation?

## Shortlisted candidates

- **C-001** (Requirement) Apply closing rate to balance sheet accounts and average rate to income statement accounts, with no local override.
- **C-002** (Requirement) Provide an exception route for hyperinflationary entities that restate before translating at closing rate.
- **C-003** (Open question) Confirm which entities still translate revenue at period-end rate, including whether Vietnam was corrected.
- **C-004** (Requirement) Hold entity ownership with effective dates so a mid-period acquisition consolidates from its acquisition date.
- **C-006** (Action) Ask Legal whether their system holds ownership effective dates and can provide them.
- **C-007** (Requirement) Calculate NCI in the system from ownership percentages instead of posting it manually.
- **C-005** (Requirement) Feed the ownership register maintained by Legal into consolidation at least monthly.
- **C-009** (Open question) Determine whether the platform can perform the CTA reconciliation currently done outside the system.

## Candidates citing passages the reference does not use

- **C-008** (Requirement) Show NCI split by entity in the reporting pack. — 1df000041775/P-028

These are not errors. The reference is one reviewer's reading; a supported
record it did not retain may still be correct.