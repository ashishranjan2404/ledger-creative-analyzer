# Sub-question 7 — Power-dynamic and compensation models for Thedi

**Brief audience:** Ashish Ranjan. **Client:** Ramesh Nampalli. **Date:** 2026-04-19.
**Scope:** How to structure the Thedi arrangement so that a Saviynt employment
relationship, a personal-income side project, and a collegial/reporting-chain
dynamic don't end up poisoning each other.

---

## 1. The substrate: what actually governs this

Saviynt is HQ'd in El Segundo, California, and most senior engineering roles
are California-governed ([Saviynt HQ, El Segundo, CA](https://saviynt.com/company/about-saviynt)).
That matters because California gives Ashish more room than almost any other
state to own work done on his own time.

### California Labor Code §2870 (the load-bearing statute)

§2870(a) makes any employer IP-assignment clause **unenforceable** against an
invention the employee "developed entirely on his or her own time without
using the employer's equipment, supplies, facilities, or trade secret
information," **unless** the invention either:

1. "Relates at the time of conception or reduction to practice … to the
   employer's business, or actual or demonstrably anticipated research or
   development," **or**
2. "Result[s] from any work performed by the employee for the employer"
   ([Cal. Lab. Code §2870, Justia 2025](https://law.justia.com/codes/california/code-lab/division-3/chapter-2/article-3-5/section-2870/);
   [FindLaw](https://codes.findlaw.com/ca/labor-code/lab-sect-2870/)).

§2870(b) declares any broader assignment clause "against the public policy of
this state and … unenforceable." §2872 requires employers to give written
notice of §2870 rights when an IP clause is signed.

**Applied to Thedi:** Saviynt sells IAM / identity governance / cloud security
([Saviynt overview, CB Insights](https://www.cbinsights.com/company/saviynt)).
Thedi is a newsletter-research scout for agentic-AI-in-DevOps content. The
subject matter is arguably adjacent ("agentic AI" / "infrastructure") but the
*product category* (creator tooling / Substack editorial pipeline) is not in
Saviynt's business, anticipated R&D, or competitive space. A reasonable
§2870(a)(1) argument says Thedi is outside Saviynt's business. But
"demonstrably anticipated" is fuzzy, and "agentic AI + infrastructure" is
close enough to Saviynt's public roadmap that Ashish should not rely on
§2870 alone — he needs the written carve-out described in §4 below
([Stimmel Law on §2870](https://www.stimmel-law.com/en/articles/who-owns-employees-inventions-made-home)).

### Moonlighting / disclosure

California does **not** prohibit moonlighting, but employers can and do
require written disclosure and reserve the right to reject outside work that
creates a conflict of interest
([YMS LLP, "What is California's Moonlighting Law?" 2025](https://www.ymsllp.com/blog/2025/05/what-is-californias-moonlighting-law/);
[CEA, "Moonlighting & Polyworking in California" Aug 2025](https://employers.org/2025/08/27/kims-message-moonlighting-polyworking-in-california/)).
Standard tech-company moonlighting policies require:

- Written notice to HR/manager before starting outside work
- No use of employer time, devices, or information
- No conflict of interest, especially for senior roles with strategic access
  ([Lattice moonlighting template 2025](https://lattice.com/templates/moonlighting-policy-template);
  [Workable policy](https://resources.workable.com/moonlighting-policy))

**The extra wrinkle here:** the "outside employer" in this arrangement is
another Saviynt employee. Any compensation flowing from Ramesh → Ashish is a
**coworker-to-coworker financial relationship inside the company's
reporting chain.** Most moonlighting policies don't contemplate that; most
ethics policies do, and they're stricter. This is the risk Ashish must
engineer around, not §2870.

---

## 2. The seven arrangement structures, ranked by risk-adjusted fit

| # | Structure | Short description | W-2/IP risk | Relationship risk | Fit score |
|---|-----------|------------------|-------------|-------------------|-----------|
| A | **Open-source release + gift** | Thedi is MIT/Apache-licensed; Ramesh self-hosts or uses a shared instance | Low (public, non-commercial-to-Ashish) | Low (no money flows) | **Highest** |
| B | Pure gift, private | Ashish builds it, hands it over, no payment, no license | Medium (still a private transfer of value to coworker) | Medium (implicit debt) | High |
| C | Flat fee, one-time | Ramesh pays a single invoice for the build | Medium (1099 income, conflict disclosure) | Medium | Medium |
| D | Retainer | Monthly maintenance fee | Medium-High (ongoing financial tie to coworker) | Medium-High | Low |
| E | Revenue share on Substack | % of paid-subscriber revenue | High (ongoing entanglement, variable) | High (re-negotiated every quarter) | Low |
| F | Informal equity / "we'll figure it out" | Deferred decision | Highest | Highest | Disqualified |
| G | 1099 contractor through an LLC | Ashish forms Platformy LLC, invoices Ramesh | Medium (cleanest tax story) but adds overhead | Medium | Medium |

**Why F is disqualified outright:** every career-advice and employment-law
source hit says the same thing — unclear arrangements are where resentment
and lawsuits are born. "We'll figure it out" is the failure mode, not an
option ([Opticliff Law on side-project legal issues](https://opticliff.com/legal-issues-consider-startup-side-project-separate-day-job/);
[HN: "My company wants my side project"](https://news.ycombinator.com/item?id=21786111);
[Index.dev freelance contract template 2025](https://www.index.dev/blog/freelance-software-developer-contract-template)).

### Failure-mode notes by option

- **A (Open-source):** the cleanest structure in the literature. Open-source
  development is itself a canonical "gift economy" with socially-enforced
  reciprocity norms rather than financial ones
  ([Wikipedia: Gift economy](https://en.wikipedia.org/wiki/Gift_economy)).
  Ashish keeps copyright (with a §2870 carve-out letter from Saviynt),
  license governs use, Ramesh self-hosts. Revenue stays 100% with Ramesh;
  Ashish is not financially entangled with a coworker. Open-source release
  also reframes the project publicly — it is not "a favor for a boss," it
  is "Ashish shipped an OSS tool, Ramesh happens to use it."
  ([OSS Watch on IP & ownership](http://oss-watch.ac.uk/resources/iprguide);
  [Open Source Guides — Legal](https://opensource.guide/legal/)).

- **B (Private gift):** anthropology and psychology literature is emphatic
  that ungoverned gifts between asymmetric parties produce **implicit debt**
  and eventual resentment. Malinowski's classic finding: "there is no gift
  free of expectation." Recent work: one-way giving in power-asymmetric
  relationships "damages relationships across decades of research"
  ([Psychology Today, "Experiments in Gift Economy"](https://www.psychologytoday.com/us/blog/acquired-spontaneity/201602/experiments-in-gift-economy-part-i);
  [Slate, "Generosity that backfires," Mar 2025](https://slate.com/technology/2025/03/generosity-gifts-backfire-downside-relationships.html)).
  Ethics columns are explicit: **employees generally should not give
  individual gifts to supervisors** because of the quid-pro-quo appearance,
  even when innocently intended ([Insperity on workplace gifts](https://www.insperity.com/blog/workplace-gift-giving/)).
  A software system built specifically for a future boss is a very large gift.

- **C (Flat fee):** clean tax story (1099-NEC, schedule C, 15.3% SE tax on
  net) — [TaxSlayer on moonlighting](https://www.taxslayer.com/blog/moonlighting-tax-inforrmation/);
  [White Coat Investor on moonlighting tax](https://www.whitecoatinvestor.com/financial-considerations-for-moonlighting-physicians/).
  But it still requires Saviynt disclosure, and paying a coworker a large
  lump sum is exactly the scenario most conflict-of-interest policies flag.

- **D/E (Retainer / rev-share):** these maximize **ongoing** entanglement.
  Every month or every Substack payout becomes a potential dispute. The
  freelance-contract literature rates "unclear ongoing scope" as the #1
  failure mode of independent-contractor engagements
  ([Index.dev, 2025](https://www.index.dev/blog/freelance-software-developer-contract-template)).
  E is worse than D because it makes Ashish's income a function of Ramesh's
  writing output — creating a bizarre dynamic where Ashish's future manager
  is de-facto being compensated-for by his own employee's post cadence.

- **G (LLC-contractor):** fine mechanically, but an LLC for a ≤2-hr/week
  engagement is overkill and adds a $800/yr CA franchise tax floor plus
  admin. Only worth it if structure C is chosen *and* the dollar amount
  justifies it.

---

## 3. Recommendation (load-bearing, not a menu)

**Structure A: Release Thedi as an MIT-licensed open-source project under
Ashish's personal GitHub (`platformy.org` / personal handle), with a written
§2870 carve-out letter from Saviynt on file before the next commit. Ramesh
runs it (either self-hosted or on a shared Butterbase instance Ashish hosts
gratis). No money changes hands. No retainer. No revenue share.**

Rationale, in priority order:

1. **Eliminates the coworker-payment problem entirely.** No 1099, no
   disclosure of coworker-paid outside work, no conflict-of-interest
   filing. Ashish's obligation to Ramesh is the obligation any OSS
   maintainer has to any user: none, beyond goodwill.
2. **Preserves Ashish's §2870 position maximally.** A public OSS release
   under a permissive license with a paper trail (git history, email
   carve-out from Saviynt Legal) is the single strongest defense against
   any later Saviynt IP claim — it's prior art *by Ashish, timestamped,
   public* ([Open Source Guides — Legal](https://opensource.guide/legal/)).
3. **Caps the "≤2 hrs/week" promise credibly.** OSS maintainers set their
   own cadence. A paid retainer does not have that social norm.
4. **Protects the relationship.** The career-coaching literature is
   unanimous: the relationships that survive power asymmetry are the ones
   where **nobody owes anybody**. An OSS tool both parties use is a peer
   artifact, not a debt ([Ask a Manager archives on favors](https://www.askamanager.org/2016/12/our-boss-constantly-asks-us-to-do-personal-favors-for-her.html)).
5. **Ramesh benefits as-much-or-more.** He gets the tool, keeps 100% of
   Substack revenue, and avoids having to pay a direct report — which
   *also* helps him if he's ever asked to approve Ashish's compensation.

### Tradeoffs, acknowledged

- Ashish gets zero dollars. For ≤2 hrs/week this is the right trade; the
  career optionality of "I shipped and maintain an OSS agentic-AI tool"
  is worth more than a few thousand dollars of side income from a
  coworker.
- The MVP Butterbase function contains some keys/config. Those need to be
  externalized to env vars before the repo goes public. Standard pre-OSS
  hygiene — not a blocker.
- If Ramesh later wants *custom* features outside the OSS scope, that is a
  separate, later conversation (and probably still a "no" or a "submit a
  PR").

### Fallback if A is rejected

If Ramesh refuses OSS (e.g. wants proprietary edge): **Structure C, flat
fee, one invoice, written contract, scope frozen, with Saviynt
conflict-of-interest disclosure filed first.** Not the recommendation;
the fallback.

---

## 4. The conversation Ashish should have with Ramesh before writing more code

Suggested agenda, ~30 minutes, in person or on a call (not Slack/email —
this is a relationship conversation, not a spec review):

1. **Frame up front, in the first 60 seconds.** "I want Thedi to be
   something that helps you and doesn't put either of us in an awkward
   position at Saviynt. I've thought about how to structure it and I want
   to run my thinking by you before I write much more code."
2. **Name the power dynamic explicitly.** "You're going to be senior to
   me at Saviynt. I don't want a money relationship between us that could
   get weird — especially if you ever end up in my reporting chain or on
   a comp committee."
3. **Propose open-source.** "My preferred structure: I release Thedi as
   an MIT-licensed open-source project on my personal GitHub. You run it
   for your Substack. You keep 100% of your subscriber revenue. I
   maintain it on a best-effort basis, capped at a couple hours a week,
   same as any other OSS maintainer."
4. **Name the Saviynt piece.** "I'm going to file a moonlighting /
   outside-project disclosure with Saviynt HR and get a §2870 carve-out
   letter before I push the repo public. Normal hygiene."
5. **Ask, don't tell, on scope.** "For v2, what are the two or three
   things that would make the biggest difference to you? I want to nail
   those and stop — if you want more later, open an issue like anyone
   else."
6. **Name the exit.** "If Thedi ever takes off in a way that's
   commercially meaningful to either of us, we stop and re-paper it
   properly with a lawyer. Until then, OSS."
7. **Listen for resistance.** If Ramesh pushes for proprietary /
   private / paid retainer, that is a signal (see §5).

**What not to say:** "It's just a favor, don't worry about it." That
phrasing is the exact failure mode. Every gift-economy and
advice-columnist source names it as the setup to resentment.

---

## 5. Signals to watch

Any of these should cause Ashish to pause and re-evaluate:

- **Ramesh resists open-sourcing.** If the answer is "I'd rather it stay
  private," ask why. Legitimate reasons exist (competitive edge in
  newsletter tooling); they're rare. More often this signals a desire
  for control or exclusivity that will compound into scope creep.
- **Saviynt legal refuses a §2870 carve-out letter.** Means they
  consider Thedi adjacent to their business. Stop building until
  clarified in writing — an §2870 dispute after shipping is much worse
  than one before.
- **Ramesh asks for features unrelated to the stated Substack scope**
  (e.g. "can it also draft my LinkedIn posts," "can it summarize my work
  emails"). Classic scope creep. OSS norms make declining easier than
  contract norms do.
- **Reporting-chain change.** If Ramesh ends up as Ashish's direct
  manager or on his comp committee, the arrangement must be re-disclosed
  to HR, and any private transfer of value (even OSS maintenance
  specifically tailored to his use) should be audited for
  conflict-of-interest implications.
- **Third-party commercial interest.** If anyone else wants to pay for
  Thedi, or if Substack itself reaches out, stop and get a real lawyer.
  The arrangement changes the moment there is external revenue.
- **Ashish finds himself doing >2 hrs/week.** Non-negotiable personal
  signal. Either cut scope, or renegotiate the arrangement from scratch.
- **The word "just" appears** ("it's just a favor," "just a quick
  tweak," "just this one thing"). Canonical scope-creep tell in every
  freelance-contract failure-mode writeup.

---

*All legal claims in this brief cite statute or secondary sources. This
is not legal advice; the §2870 carve-out letter and the Saviynt
moonlighting disclosure should both be reviewed by an actual California
employment attorney before filing. Budget: 1 hour of an employment
attorney, ~$400–$600, will de-risk the entire arrangement.*
