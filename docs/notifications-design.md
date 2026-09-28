# Notifications: backend-managed, with reply capture

Design for Phase One. Not built. Six things need agreeing first, and each of
them changes the code — so agreeing them after implementation means rewriting it.

## Where this replaces what exists

| Stage | Mechanism | Status |
|---|---|---|
| Demo | Analyst copies the text and sends it themselves | Built. Marked manual; nothing tracked |
| Phase One | Backend sends through Graph, captures replies, records the exchange against the record | This document |
| Later | MCP, if several tools together earn it | Not needed for email |

Claude Code is not a user dependency and never was a deployment model. The
existing MCP server stays in the repository as a working reference for the Graph
calls and the recipient-resolution discipline; it is not the delivery path.

## The flow

1. Analyst selects reviewed records and confirms recipients.
2. ARQON renders a templated message and shows it in full.
3. Analyst presses Send. The backend sends through Graph.
4. The message id, conversation id, recipients, template and timestamp are
   stored against every record it covered.
5. Replies are matched to that conversation and appear in each record's response
   history, as received text.
6. An authorised reviewer marks the item resolved. **A reply does not close
   anything** — it is evidence, and someone with authority over the subject
   decides whether it answers the question.

Step 6 is the one most easily lost. A reply saying "yes that's fine" from
someone without authority over the subject closes nothing, and a system that
auto-resolves on reply will quietly accumulate decisions nobody made.

## What is rules, and what is judgement

Eligibility and permissions are code, not model output:

- Which records may be sent (review state, ownership, dedupe window).
- Who may receive them, resolved from the programme role register.
- Who may mark an item resolved, by subject.
- Which mailbox sends, and who may press Send.

A model may draft wording or summarise a long reply. It may not decide who is
authorised, who receives something, or whether an answer resolves a question.
That boundary is what makes the audit story defensible, and it is cheap to hold
now and expensive to retrofit.

## Six decisions to make before any of this is written

**1. Hosting and data residency.** Where the service runs, where replies are
stored, and whether client material may sit there at all. A reply quotes the
question, which quotes the record, which quotes the workshop. Storing replies
means storing client content on infrastructure someone must be able to name.

**2. Sending identity.** Two options, and they are not interchangeable.
*Delegated* sends as the signed-in analyst: their identity, their sent items,
their audit trail, and the recipient sees a person. *Application* sends from a
service mailbox such as `arqon-notify@client.com`: consistent sender, replies
land where the system can read them, and it requires an Application Access
Policy scoping the app to that one mailbox — without which it can send as anyone
in the tenant. Delegated is safer; a service mailbox makes reply capture far
simpler. Pick deliberately.

**3. Mailbox permissions.** Reply capture needs `Mail.Read` on whichever mailbox
receives them. On a service mailbox that is narrow. On an analyst's own mailbox
it means the application can read their mail, which is a different conversation
with a different answer.

**4. Approved test recipients.** Named, real, consenting people for the first
sends. Not a distribution list, not a client contact who has not agreed. One
misdirected clarification on real content is a worse first impression than
having nothing to show.

**5. Reply matching.** Conversation id is reliable when the reply is a reply. It
is not when someone forwards, replies from another address, or answers verbally
and mentions it later. Decide what happens to an unmatched reply: held for
manual association, or dropped. Dropped is easier and loses evidence.

**6. Failure and retry.** What happens when Graph rejects a send, a token
lapses, or a recipient bounces. A queue that silently swallows failures is worse
than no queue, because the analyst believes the question was asked.

## Template rules, provisional

From the first message sent to a real reader. Provisional: one message to one
colleague is one data point.

**1. Never render a field name as its own value.** "outstanding: answer
outstanding" is the blocker list restating a field whose name and value say the
same thing. For an Open question the sentence is the question; the blocker line
is dropped. For every kind, the line states what is needed of the reader, not
what the schema calls it.

**2. Group by recipient and topic, and keep the message answerable.** Ten
records in one message was too much — not because ten is a limit, but because
each carried four lines and the reader had to decide where to start. Clarity and
the effort required to reply matter more than the count. A short message naming
what is needed, with a link to the full list, is likely better than an inlined
register; the batch size is a question for the pilot, not a constant to pick
now.

Both need testing with Udupa before they enter the server-side template.

## What can be built once those are settled

- An outbox with message id, conversation id, recipients, template, sender,
  timestamp and delivery state, keyed to every record covered.
- Reply capture: poll or subscribe, match on conversation id, store received
  text against the record with its sender and timestamp.
- Response history on the record, distinguishing the question asked, the reply
  received, and the resolution recorded — three separate things with three
  separate authors.
- Eligibility rules as code, with the same refusals the current MCP server
  already implements: records must belong to the role, an approval request must
  not claim a review that has not happened, and a repeat inside the dedupe
  window needs explicit confirmation.

## What not to build yet

Attachments — a link into the register beats a copy that drifts. Digest
scheduling until send volume is known. Unattended sending: analyst confirmation
before the send is the thing that makes this acceptable to a finance function,
and removing it should be a decision taken on evidence, not a convenience.
