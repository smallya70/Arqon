/* One dataset. Both views derive every figure from it.

   Deliberately small: 4 completed workshops and 47 records, not the 200+ a real
   programme produces. Every number on every screen traces to a record below, so
   a reader can count them. A dashboard whose totals cannot be reconciled to its
   own data teaches people to distrust all of it.

   Synthetic throughout. Fictional client, constructed sessions. */

export const PROGRAMME = {
  client: "Northbridge Group", name: "Consolidation replacement", ref: "PRG-001",
  phase: "Design", entities: 214, weeksElapsed: 9, weeksPlanned: 20,
};

/* Programme responsibility. Separate from corporate ownership: a parent company
   does not decide who approves an accounting treatment. */
export const ROLES = [
  { role: "Accounting policy lead",      side: "client", email: "policy.lead@northbridge.example" },
  { role: "Group consolidation lead",    side: "client", email: "consolidation.lead@northbridge.example" },
  { role: "Group controller",            side: "client", email: "controller@northbridge.example" },
  { role: "Regional finance lead, EMEA", side: "client", email: "emea.finance@northbridge.example" },
  { role: "Regional finance lead, APAC", side: "client", email: "apac.finance@northbridge.example" },
  { role: "Finance control and audit",   side: "client", email: "control@northbridge.example" },
  { role: "Programme data architect",    side: "DI",     email: "data.architect@diintl.com" },
];

export const WORKSHOPS = [
  { id:"W-038", title:"Entity structure and ownership", region:"Group", state:"done", date:"2026-07-14" },
  { id:"W-041", title:"Currency translation",           region:"EMEA",  state:"done", date:"2026-07-23" },
  { id:"W-042", title:"Intercompany and eliminations",  region:"EMEA",  state:"done", date:"2026-07-28" },
  { id:"W-043", title:"Minority interests and equity",  region:"Group", state:"done", date:"2026-08-04" },
  { id:"W-047", title:"Management reporting",           region:"Group", state:"scheduled", date:"2026-09-29" },
  { id:"W-048", title:"Controls and reconciliation",    region:"Group", state:"scheduled", date:"2026-10-06" },
  { id:"W-049", title:"Intercompany and eliminations",  region:"Americas", state:"scheduled", date:"2026-10-13" },
  { id:"W-050", title:"Migration and opening balances", region:"Group", state:"scheduled", date:"2026-10-20" },
];

/* W-042 in full, so the workshop view can show the transcript that produced its
   records and each record can cite the passage behind it. */
export const PASSAGES = {
  "W-042": [
    ["P-001","14:28","Facilitator","Let's take intercompany submission. Walk me through what happens today."],
    ["P-002","14:29","Regional finance lead, EMEA","The European entities submit intercompany balances by account, but not by partner. It's never been a field in the local template."],
    ["P-003","14:31","Group controller","North America gives us partner detail. I pull both sides, match what I can in a spreadsheet, and chase the rest by email."],
    ["P-004","14:32","Facilitator","How long does that take you at close?"],
    ["P-005","14:32","Group controller","Two days. Three when the tolerances get argued. There's no agreed tolerance written down anywhere — I use fifty thousand euro as a rule of thumb but nobody has signed that off."],
    ["P-006","14:35","Accounting policy lead","That needs formalising. Different tolerance for trading balances versus loan balances, I'd expect. Loans should match exactly."],
    ["P-007","14:36","Group controller","Agreed. And we need to stop submissions arriving with no counterparty at all. Right now the system accepts them and I find out at day four."],
    ["P-008","14:38","Regional finance lead, EMEA","Two of the Spanish entities can't do that yet. They came in with last year's acquisition and they're still on their old ledger until the 2027 close. They'll have to upload manually."],
    ["P-009","14:39","Accounting policy lead","Fine as a documented exception, but it needs group sign-off, not a local arrangement."],
    ["P-010","14:42","Group controller","One more. The ownership register shows the Portuguese entity at sixty percent, but the consolidation workbook has treated it as an associate for two years. Somebody needs to tell me which is right before we design the elimination rules."],
    ["P-011","14:43","Facilitator","Who owns closing that?"],
    ["P-012","14:43","Accounting policy lead","I'll take it. I need legal to confirm the shareholder agreement first."],
  ].map(([id,t,who,text])=>({id,t,who,text})),
};

/* r(): id, workshop, kind, type, statement, owner, ownerOrigin, passages, quote,
        reviewStatus, blockers, ageDays */
const r = (id, ws, kind, type, statement, owner, ownerOrigin, passages, quote, reviewStatus, blockers, ageDays) =>
  ({ id, workshop: ws, kind, type, statement, owner, ownerOrigin, passages, quote,
     reviewStatus, blockers, ageDays });

const AP = "Accounting policy lead", GC = "Group consolidation lead", CTL = "Group controller",
      EMEA = "Regional finance lead, EMEA", APAC = "Regional finance lead, APAC",
      CTRL = "Finance control and audit", DA = "Programme data architect", NONE = null;

export const RECORDS = [
  /* ---- W-042 intercompany: the seven the workshop view shows, plus five more ---- */
  r("IC-001","W-042","Requirement","Control","Reject intercompany submissions with no valid counterparty at the point of entry.",
    GC,"reviewer-added",["P-007"],"we need to stop submissions arriving with no counterparty at all",
    "Approved",["priority","acceptance criteria"],22),
  r("D-001","W-042","Decision","Policy","Loan balances match exactly, with no tolerance applied.",
    NONE,null,["P-006","P-007"],"Loans should match exactly","Approved",[],22),
  r("Q-001","W-042","Open question","n/a","What tolerance applies, and does it differ by balance type?",
    GC,"reviewer-added",["P-005","P-006"],"no agreed tolerance written down anywhere","Approved",["answer outstanding"],22),
  r("EX-001","W-042","Exception","Process","Two Spanish entities submit intercompany manually until the 2027 close.",
    NONE,null,["P-008","P-009"],"still on their old ledger until the 2027 close","Approved",["baseline rule","approver"],22),
  r("IS-001","W-042","Issue","n/a","The controller reports the ownership register at 60% while the consolidation workbook treats the entity as an associate.",
    CTL,"reviewer-added",["P-010"],"register shows sixty percent... treated it as an associate","Approved",["impact"],22),
  r("Q-002","W-042","Open question","n/a","Which treatment is correct for the Portuguese entity?",
    AP,"stated",["P-010","P-011","P-012"],"Somebody needs to tell me which is right","Approved",["answer outstanding"],22),
  r("A-001","W-042","Action","n/a","Confirm the Portuguese shareholder agreement with legal.",
    AP,"stated",["P-012"],"I need legal to confirm the shareholder agreement first","Approved",["due date"],22),
  r("IC-002","W-042","Requirement","Data","Capture counterparty on intercompany balances at account level.",
    EMEA,"reviewer-added",["P-002"],"submit by account, but not by partner","Approved",["acceptance criteria"],22),
  r("IC-003","W-042","Requirement","Functional","Match intercompany balances by entity, counterparty and account.",
    GC,"reviewer-added",["P-003"],"I pull both sides, match what I can","Approved",[],22),
  r("R-001","W-042","Risk","n/a","Manual intercompany matching consumes two to three days of the close.",
    CTL,"reviewer-added",["P-005"],"Two days. Three when the tolerances get argued","Approved",[],22),
  r("IC-004","W-042","Requirement","Workflow","Route unmatched intercompany differences to the owning entity for response.",
    GC,"reviewer-added",["P-003"],"chase the rest by email","Approved",["priority","acceptance criteria"],22),
  r("AS-001","W-042","Assumption","n/a","All EMEA entities can add a counterparty field to the local submission template.",
    EMEA,"reviewer-added",["P-002"],"It's never been a field in the local template","Approved",["validation date"],22),

  /* ---- W-038 entity structure and ownership ---- */
  r("IC-010","W-038","Requirement","Data","Hold entity ownership with effective dates so mid-period acquisitions consolidate from the acquisition date.",
    DA,"reviewer-added",["P-019"],"The system must hold entity ownership with effective dates","Approved",["entity scope"],41),
  r("Q-010","W-038","Open question","n/a","Can legal supply ownership data carrying effective dates?",
    CTL,"stated",["P-021"],"I don't know whether their system holds effective dates at all","Approved",["answer outstanding"],41),
  r("A-010","W-038","Action","n/a","Ask legal whether their system holds ownership effective dates.",
    CTL,"stated",["P-021"],"I'll ask","Approved",["due date"],41),
  r("IC-011","W-038","Requirement","Integration","Feed the ownership register extract into the consolidation model at least monthly.",
    DA,"reviewer-added",["P-017"],"I'd want the register to feed through monthly at least","Approved",["priority","acceptance criteria"],41),
  r("IS-010","W-038","Issue","n/a","A November acquisition did not reach the consolidation model until February.",
    GC,"reviewer-added",["P-016"],"didn't reach the consolidation model until February","Approved",["impact"],41),
  r("D-010","W-038","Decision","Policy","Entity master is maintained by Legal and consumed, not edited, by Finance.",
    NONE,null,["P-015"],"Legal maintains it","Approved",[],41),
  r("IC-012","W-038","Requirement","Data","Record the twelve entity archetypes against every subsidiary in the entity master.",
    DA,"reviewer-added",["P-022"],"we need a way to group them","Approved",["acceptance criteria"],41),
  r("Q-011","W-038","Open question","n/a","How are dormant and in-liquidation entities treated in the consolidation scope?",
    NONE,null,["P-024"],"what about the dormant ones","Approved",["owner","answer outstanding"],41),
  r("Q-012","W-038","Open question","n/a","Which entity codes are authoritative where ERP and legal registers disagree?",
    NONE,null,["P-026"],"the codes don't always line up","Approved",["owner","answer outstanding"],41),
  r("IC-013","W-038","Requirement","Migration","Load historic entity membership so prior-period comparatives restate correctly.",
    DA,"reviewer-added",["P-028"],"we'll need the history as well","Approved",["priority","entity scope"],41),
  r("R-010","W-038","Risk","n/a","Ownership data may not be supplied with effective dates, changing the elimination design.",
    DA,"reviewer-added",["P-021"],"I don't know whether their system holds effective dates","Approved",[],41),

  /* ---- W-041 currency translation ---- */
  r("IC-020","W-041","Requirement","Functional","Apply closing rate to balance sheet accounts and average rate to income statement accounts.",
    AP,"reviewer-added",["P-009"],"the system must apply closing rate to balance sheet accounts","Approved",["priority","acceptance criteria"],34),
  r("IC-021","W-041","Requirement","Control","Prevent local override of the translation rate applied to each account type.",
    CTRL,"reviewer-added",["P-009"],"with no local override. That needs to be enforced","Approved",["acceptance criteria","owner"],34),
  r("IC-022","W-041","Requirement","Regulatory","Restate hyperinflationary entities under IAS 29 before translating at closing rate.",
    AP,"reviewer-added",["P-010","P-011"],"Those restate first and then translate at closing","Approved",["priority","acceptance criteria"],34),
  r("Q-020","W-041","Open question","n/a","How is a permanent departure from the group translation baseline classified?",
    AP,"reviewer-added",["P-012","P-013"],"So yes, indefinite","Approved",["answer outstanding"],34),
  r("IS-020","W-041","Issue","n/a","Three APAC entities applied period-end rate to revenue contrary to group policy.",
    APAC,"reviewer-added",["P-003"],"three entities have been using period-end for revenue","Approved",["impact"],34),
  r("Q-021","W-041","Open question","n/a","Was Vietnam's revenue translation corrected, and when?",
    APAC,"reviewer-added",["P-005","P-006","P-008"],"We fixed Vietnam in March","Approved",["answer outstanding"],34),
  r("IC-023","W-041","Requirement","Reporting","Present the cumulative translation adjustment as a separate component of equity.",
    AP,"reviewer-added",["P-030"],"CTA has to show separately","Approved",["acceptance criteria"],34),
  r("Q-022","W-041","Open question","n/a","Should CTA reconciliation be performed in the system, and does the platform support it?",
    NONE,null,["P-030","P-031","P-032"],"I don't know what the platform supports","Approved",["owner","answer outstanding"],34),
  r("A-020","W-041","Action","n/a","Check platform support for CTA reconciliation before committing to it.",
    DA,"reviewer-added",["P-032"],"I'd want someone to check before we commit","Approved",["due date"],34),
  r("D-020","W-041","Decision","Policy","Hyperinflationary treatment applies to Turkey and Argentina only.",
    NONE,null,["P-011"],"Turkey and Argentina","Approved",[],34),
  r("AS-020","W-041","Assumption","n/a","Rate tables are supplied monthly by Treasury in a consistent format.",
    NONE,null,["P-034"],"Treasury send the rates","Approved",["owner","validation date"],34),

  /* ---- W-043 minority interests and equity ---- */
  r("IC-030","W-043","Requirement","Functional","Calculate non-controlling interests from ownership percentages rather than by manual journal.",
    AP,"reviewer-added",["P-025"],"NCI should be calculated by the system","Approved",["acceptance criteria"],28),
  r("IS-030","W-043","Issue","n/a","A manual NCI journal was posted wrong by about four hundred thousand and corrected at review.",
    CTL,"reviewer-added",["P-024"],"that journal was wrong by about four hundred thousand","Approved",["impact"],28),
  r("R-030","W-043","Risk","n/a","Manual NCI calculation is the largest manual risk in the close.",
    CTL,"reviewer-added",["P-027"],"the single biggest manual risk in the close","Approved",[],28),
  r("IC-031","W-043","Requirement","Reporting","Present non-controlling interests by entity in the group reporting pack.",
    NONE,null,["P-028"],"NCI split by entity in the reporting pack","Approved",["owner","priority"],28),
  r("Q-030","W-043","Open question","n/a","How are changes in ownership percentage without loss of control accounted for?",
    AP,"reviewer-added",["P-031"],"what happens when we buy up","Approved",["answer outstanding"],28),
  r("IC-032","W-043","Requirement","Functional","Recalculate non-controlling interests when ownership changes mid-period.",
    AP,"reviewer-added",["P-031"],"what happens when we buy up","Approved",["priority","acceptance criteria"],28),
  r("D-030","W-043","Decision","Policy","Equity-accounted entities are reported at a single line with no proportionate consolidation.",
    NONE,null,["P-033"],"one line, that's all we need","Approved",[],28),
  r("EX-030","W-043","Exception","Process","The Kessler joint venture is proportionately consolidated until the 2027 review.",
    NONE,null,["P-035"],"proportionate for the JV until we revisit","Approved",["baseline rule","approver","end date"],28),
  r("Q-031","W-043","Open question","n/a","Which entities carry a shareholder agreement that overrides the ownership percentage?",
    AP,"reviewer-added",["P-036"],"there are agreements that change it","Approved",["answer outstanding"],28),
  r("IC-033","W-043","Requirement","Control","Reconcile the non-controlling interest balance to the ownership register each close.",
    CTRL,"reviewer-added",["P-037"],"we'd want that tied back","Approved",["acceptance criteria","owner"],28),
  r("A-030","W-043","Action","n/a","Obtain the shareholder agreements for the four entities with disputed percentages.",
    NONE,null,["P-036"],"there are agreements that change it","Approved",["owner","due date"],28),
  r("AS-030","W-043","Assumption","n/a","Ownership percentages in the register are current as at the reporting date.",
    DA,"reviewer-added",["P-038"],"we take the register as read","Approved",["validation date"],28),

  /* ---- awaiting analyst review: not yet in any approved figure ---- */
  r("IC-040","W-043","Requirement","Security","Restrict journal posting to users without submission rights.",
    NONE,null,["P-040"],"the same person shouldn't do both","Analyst reviewed",["owner","acceptance criteria"],28),
  r("Q-040","W-043","Open question","n/a","Does the platform support segregation of duties at entity level?",
    NONE,null,["P-041"],"can it do that per entity","Analyst reviewed",["owner","answer outstanding"],28),
];

/* Archetype coverage. Each maps to the workshops that establish its treatment. */
export const ARCHETYPES = [
  ["Wholly owned trading, single ERP",71,["W-038","W-042"]],
  ["Wholly owned trading, legacy ERP",34,["W-038"]],
  ["Majority owned with NCI",28,["W-043"]],
  ["Equity accounted associate",19,["W-043"]],
  ["Joint venture, proportionate",12,["W-043"]],
  ["Hyperinflationary economy",2,["W-041"]],
  ["Dormant / in liquidation",16,[]],
  ["Branch, no separate ledger",9,["W-038"]],
  ["Recently acquired, pre-integration",8,["W-042"]],
  ["Holding company, no trade",11,["W-038"]],
  ["Regulated entity, local GAAP",3,[]],
  ["Shared service centre",1,[]],
];

export const ANALYST_QUEUE = [
  ["M. Torres", 0, "clear"],
  ["P. Nair", 2, "W-043 segregation of duties, two candidates outstanding"],
];
