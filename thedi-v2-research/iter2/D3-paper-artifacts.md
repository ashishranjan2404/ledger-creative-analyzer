# D3 — Paper Artifacts for Thedi v2

*Iter-2 deliverable. Three ready-to-use templates that precede any v2 code ship.*
*Date drafted: 2026-04-19. Ashish Ranjan / Saviynt / Ramesh Nampalli context.*

---

## IMPORTANT CAVEATS (read before using any of this)

- **This is not legal advice.** Ashish should have a California employment attorney (1 hour, ~$400-600) review Artifact 1 before filing it with Saviynt Legal. The template is drafted to make the attorney's review cheap — most of the structure is standard — but the specific factual claims about Saviynt's business scope, and any case-law reliance, must be vetted by counsel.
- **Case-law citations are marked `[verify with attorney]` where not confirmed from primary source.** Do not remove those tags before an attorney confirms the cite is accurate, currently good law, and applicable. Mis-citing a case in a formal legal letter to an employer is worse than not citing it at all.
- **Statements about Saviynt's specific policies are marked `[depends on Saviynt's actual employment agreement language — verify]`.** Ashish's signed offer letter, Proprietary Information and Inventions Agreement (PIIA), employee handbook, and Code of Ethics will contain the exact language that governs. Pull those before filing.
- **§2872 notice.** California requires employers to give written notice of §2870 rights when an IP clause is signed. Saviynt likely already did this in Ashish's onboarding paperwork; reference that notice in the letter (Artifact 1 has a placeholder).

---

## Cover Memo — How To Use These Three Artifacts, In Order

Ashish should use these sequentially and not out of order. **Step one:** have a California employment attorney review Artifact 1, then file it with Saviynt Legal (with a cc to HR and Ashish's hiring manager), and wait for a countersigned response. Do not push any new commits to the Thedi v2 repo while this is pending — the existing `FROZEN_UNTIL_CARVEOUT.md` marker stays in place. **Step two:** once the §2870 letter is countersigned (or Saviynt confirms in writing they have no objection), send Artifact 2 to Ramesh by email (personal email, not Saviynt work email) and wait for an explicit "yes" reply before any further commit lands. **Step three:** as part of the v2 repo's initial post-carve-out commit, include Artifact 3 (`RECUSAL.md`) at the repo root alongside the usual README and LICENSE. Artifact 3 is a commit, not a conversation; it exists to be in-tree before anything else ships, so there is a timestamped record of the recusal trigger predating any actual reporting-chain change.

---

## Artifact 1 — §2870 Carve-Out Letter Template

> *Formal legal-correspondence register. 1–1.5 pages. Every `[BRACKETED]` field is a fill-in. Pass this through a California employment attorney before filing.*

---

**[ASHISH RANJAN]**
[Personal mailing address — do NOT use Saviynt address]
[Personal email address — do NOT use Saviynt work email]
[Personal phone]

**Date:** [DATE OF FILING — on or after attorney review; before any public repo push]

**To:**
[NAME], General Counsel / Legal Department
Saviynt, Inc.
[SAVIYNT LEGAL MAILING ADDRESS — El Segundo, CA HQ or as directed]

**cc:** [NAME], Human Resources; [NAME], Hiring Manager / Reporting Manager

**Subject:** Written acknowledgment under California Labor Code §2870 — pre-existing personal project "Thedi" — request for countersignature within 14 days

---

Dear [GENERAL COUNSEL NAME or "Saviynt Legal Team"]:

I am writing to formally request Saviynt's written acknowledgment that my pre-existing personal open-source project, "Thedi," falls outside the scope of the invention-assignment provisions of my Saviynt employment agreement, pursuant to California Labor Code §2870. I am making this request proactively, before commencing or resuming substantive work on the project during my Saviynt employment, in order to establish a clear, mutually acknowledged record.

### 1. Purpose

The purpose of this letter is to obtain Saviynt's written confirmation, via countersignature, that: (a) the Thedi project as described below qualifies under California Labor Code §2870(a); (b) it is therefore excluded from any assignment-of-inventions obligations under my [Proprietary Information and Inventions Agreement / PIIA / offer letter dated [DATE] — insert exact title of the agreement you signed]; and (c) Saviynt asserts no ownership interest, license, or right of first refusal in the project, its source code, its trademarks, or any revenues derived therefrom.

This request is made in the spirit of California Labor Code §2872, under which Saviynt is required to provide written notice of §2870 rights at the time any invention-assignment agreement is signed. I received that notice on [DATE — pull from onboarding packet; typically the date the PIIA was signed] and this letter is responsive to it.

### 2. The §2870 Criteria (statutory recitation)

California Labor Code §2870(a) provides that any provision in an employment agreement requiring an employee to assign inventions to the employer does not apply to an invention that the employee develops **entirely on the employee's own time** and **without using the employer's equipment, supplies, facilities, or trade secret information**, *except* for inventions that either:

1. **Relate at the time of conception or reduction to practice** to the employer's business, or to the employer's actual or demonstrably anticipated research or development; or
2. **Result from any work performed by the employee for the employer.**

§2870(b) further provides that any employment-agreement term that purports to require assignment of inventions outside these limits is against the public policy of this state and is unenforceable.

Thedi satisfies the threshold criteria and falls outside both exceptions, as established below.

### 3. Description of the Thedi Project

Thedi is a small open-source research pipeline that scouts public sources (arXiv preprints, Hacker News discussions, and similar public data) and assists a newsletter author in drafting Substack posts through a structured question-and-answer interview workflow. It is written primarily in TypeScript, runs on the Butterbase serverless platform, and is released publicly under the MIT License on my personal GitHub account.

The project's scope is strictly **creator / newsletter-author tooling**. Specifically, Thedi:

- Reads public web sources (arXiv, HN) on a daily cron and scores them against a topic rubric;
- Emails a weekly topic-picker to a single newsletter author;
- Conducts a brief Socratic Q&A with that author to capture their verbatim phrasing;
- Drafts prose anchored to that verbatim Q&A, via third-party LLM APIs (IonRouter);
- Passes the draft through a rubric-based critic and up to two rewriting rounds;
- Delivers a human-editable draft that the author manually publishes to Substack.

The project is built on, and will continue to be built on, my personally owned hardware, on my personal time (evenings and weekends), using my personal accounts and API keys, and with no Saviynt-owned equipment, supplies, facilities, networks, software, documentation, or confidential or trade-secret information.

### 4. Why Thedi Satisfies §2870 — Each Element Addressed

I address each statutory element individually:

**(a) Developed entirely on my own time.** All Thedi work has been and will continue to be performed outside Saviynt working hours, on my personal time, with no use of Saviynt working time or on-call time. The project's git history is publicly visible on GitHub and is timestamped; commits predating my Saviynt start date are clearly identifiable and provide a contemporaneous record.

**(b) Without use of employer equipment, supplies, facilities, or trade secret information.** I have not used and will not use any Saviynt-owned laptop, server, network (including VPN, corporate Wi-Fi, or any Saviynt-issued cloud account), software license, subscription, or internal documentation in developing Thedi. I have not used and will not use any Saviynt confidential information or trade secret. The third-party services Thedi uses (GitHub, Butterbase, IonRouter, Resend) are accessed exclusively through my personal accounts, paid for from my personal funds, with no Saviynt involvement.

**(c) Does not relate to Saviynt's business or actual or demonstrably anticipated research or development.** Saviynt's business is Identity and Access Management (IAM), Identity Governance and Administration (IGA), Privileged Access Management (PAM), and related enterprise cybersecurity products, per Saviynt's publicly stated product line. Thedi is a **personal-newsletter authoring and drafting pipeline** targeting a single individual writer's Substack output. It does not process identity data, access control, entitlements, governance, privileged credentials, or any enterprise security function. It operates on public research content (arXiv papers, HN posts) and a single author's personal writing; it has no enterprise deployment, no multi-tenant architecture, no identity-administration feature, and no security-product function. The product *category* — OSS newsletter creator tooling — is not within Saviynt's business, not within Saviynt's publicly stated roadmap, and to the best of my knowledge not within Saviynt's demonstrably anticipated research and development.

**(d) Does not result from any work performed by me for Saviynt.** Thedi predates my Saviynt start date of [SAVIYNT START DATE]. Its core architecture, codebase, license terms, and operational design were established prior to any Saviynt employment relationship. No Saviynt work product, internal design document, customer conversation, roadmap discussion, or internal meeting has informed Thedi's development, and none will.

### 5. Supporting Legal Context

California law is protective of employee side-project ownership where the §2870 criteria are met, and California courts have construed the statute's "relate to the employer's business" exception narrowly where the employee's project is in a genuinely different product category. [*Applera Corp.-Applied Biosystems Group v. Illumina, Inc.*, 375 F. App'x 12 (Fed. Cir. 2010)] — **[verify citation with attorney]** — and [*Cubic Corp. v. Marty*, 185 Cal. App. 3d 438 (1986)] — **[verify citation with attorney]** — are frequently cited for the proposition that §2870 protections apply where an employee's outside invention is not within the employer's business or anticipated R&D at the time of conception.

I cite these cases for context only; this letter does not rely on any contested interpretation of §2870. The facts above fit the statute's plain language: Thedi is personal-time creator tooling, unrelated to Saviynt's IAM/IGA/PAM product lines, built with no Saviynt resources.

### 6. What I Am Asking Saviynt To Do

I respectfully request that Saviynt, via the signature block at the end of this letter, confirm in writing, within **14 calendar days of the date above**, that:

1. The Thedi project as described in Sections 3 and 4 above falls within California Labor Code §2870(a);
2. Saviynt asserts no ownership claim, assignment right, license, or right of first refusal over the Thedi project, its source code, its name or marks, or any revenues derived from it;
3. Continued personal-time maintenance of the Thedi project by me, consistent with Section 3 above, is not in conflict with my Saviynt employment obligations, subject to my ongoing compliance with Saviynt's Code of Conduct, Moonlighting / Outside Activities policy, and Conflict of Interest policy **[depends on Saviynt's actual employment agreement language — verify exact policy names]**.

If Saviynt believes the project falls outside §2870, I ask that Saviynt explain its reasoning in writing so that I can respond or amend the project's scope as appropriate. If Saviynt needs additional information to evaluate the request, I am available to meet at any time.

I am also concurrently filing an Outside Activities / Moonlighting Disclosure with Human Resources, referencing this letter and identifying the single current user of the Thedi project, Ramesh Nampalli, who is a Saviynt colleague. I am disclosing this user relationship proactively in the interest of full transparency. I want to be explicit: **no money flows between Mr. Nampalli and me in connection with Thedi; he runs the project on his own infrastructure, with his own accounts and keys, under the public MIT license; my role is that of any open-source maintainer toward any user of a public repository, and I hold no standing production credentials on his deployment.** Artifact 2 (the five-point arrangement acknowledgment) and Artifact 3 (`RECUSAL.md`) document the specific guardrails that govern that user relationship.

### 7. Attachments

For Saviynt's reference, I am attaching or linking to the following:

- **Attachment A:** Public GitHub repository URL — `https://github.com/[ASHISH-GITHUB-HANDLE]/thedi` — under Ashish Ranjan's personal account.
- **Attachment B:** Project license — MIT License, included in the repository root as `LICENSE`.
- **Attachment C:** Disclosure of the single current user: **Ramesh Nampalli**, a Saviynt colleague. I am separately filing an Outside Activities Disclosure naming Mr. Nampalli as the user of the open-source project and describing the guardrails in place (no money, public license, user runs own infrastructure, support via public GitHub issues only, written recusal protocol if reporting-chain changes).
- **Attachment D:** A one-page architectural summary of Thedi's scope and data flows, for the Saviynt Legal team's convenience.
- **Attachment E:** Copy of the §2872 written notice of §2870 rights I received during onboarding on [DATE], for reference.

### 8. Signatures

I look forward to Saviynt's written confirmation within 14 calendar days. Thank you for your prompt attention.

Sincerely,

_________________________________
**Ashish Ranjan**
[PERSONAL EMAIL]
[PERSONAL PHONE]
Date: ________________

---

**Saviynt Countersignature Block**

Saviynt, Inc., by the signature of its authorized representative below, confirms the acknowledgments requested in Section 6 of this letter, subject to the understandings recited therein.

_________________________________
Name: ________________________________
Title: ________________________________
For: Saviynt, Inc.
Date: ________________

*If Saviynt does not countersign within 14 calendar days, please provide a written response stating Saviynt's position so that the matter can be addressed.*

---

---

## Artifact 2 — The 5-Point Ramesh Agreement

> *Warm, supportive-peer register. ~1 page. Sent from Ashish's personal email to Ramesh's personal email. An emailed "yes" reply is sufficient; signature not required. Do not send via Saviynt work email — this is explicitly an out-of-work-channel artifact.*

### Email Template

**From:** [ashish personal email]
**To:** [ramesh personal email]
**Subject:** Thedi v2 — quick alignment on five things before I start the weekend build

Hey Ramesh,

Before I sink weekend hours into Thedi v2, I want us to be on the same page on five things. Nothing here should be surprising — it's all stuff we've talked around — but I'd rather have it written down once, and a one-word "yes" from you in reply, than discover in month 6 that we had different pictures in our heads. This is me trying to protect both of us, and the project, from the failure modes that happen to side-projects-between-coworkers when nobody writes things down.

I'm deliberately sending this from my personal email to yours, and asking for the reply there too. Part of the point of the arrangement below is that Thedi lives entirely outside our Saviynt relationship, so let's start as we mean to go on.

Here's what I'm asking you to agree to:

**1. OSS under my personal GitHub (MIT, I own the repo).**
Thedi v2 is released as an open-source project under my personal GitHub account, under the MIT License. I own the repository and the copyright on my contributions. You are one user among any number of possible future users. If the project goes anywhere else (renamed, forked, transferred), we talk first, but the default is: my repo, MIT, permissive.

**2. You run it on your own Butterbase account, with your own keys.**
You own the Butterbase app, the billing card, the IonRouter key, the Resend key, the LinkedIn OAuth, the Substack login, every credential end-to-end. I will build a one-shot installer and a rotation runbook (`docs/ROTATION.md`) to make that tractable. After the Phase 2 handoff, I hold **no** standing production credentials — no admin access, no service keys, no emergency backdoor. If you ever need to rotate me out, there's nothing to rotate; I was never in.

**3. Support happens in GitHub issues only. No Saviynt-channel crossover.**
If something breaks, you open a GitHub issue and I'll answer on the schedule of any OSS maintainer (best-effort, when I have time). Explicitly **not** via:
- Saviynt Slack (any channel, any DM)
- Saviynt work email
- In-person at the Saviynt office (including hallway conversations and coffee)
- Saviynt 1:1s or team meetings
- Any text or call that references our Saviynt work
This is the single rule I care about most. It's the one that keeps Thedi from accidentally becoming unpaid work-in-the-reporting-chain. If something is urgent enough to feel like it should break this rule, the right move is to open the issue first — there's a public record — and then if genuinely on fire, text me (personal phone) a link to the issue.

**4. Thedi pauses if you end up in my reporting chain.**
If you become my direct manager, a skip-level in my reporting line, or are placed on any performance or comp panel evaluating me, Thedi enters "read-only mode" until Saviynt HR reviews. That's: I close open issues with a "recusal triggered" label, archive the repo, stop committing. You're free to fork and self-maintain. We restart only if HR says it's fine, in writing. This is formalized in the `RECUSAL.md` file I'll commit at v1 launch. It's not a statement about trust; it's a protection I'm building into the project so neither of us has to make a judgment call in a bad moment.

**5. We re-paper at a stated revenue threshold.**
If Thedi-directly-attributable revenue (paid subs, sponsorships, advisory deals you attribute to the newsletter, founding-member tiers — whatever comes to exist) crosses **$500/month sustained over 3 consecutive months**, we pause, I call a California employment attorney, and we re-paper the arrangement properly. Until then, no money flows between us and the current OSS framing stands. $500/mo is a deliberately low number — the point isn't the dollar figure, it's that there's a stated threshold so the conversation in month 10 is scheduled, not ambushed.

That's it. Five things.

If all five feel right to you, a single-word reply — "yes" — to this email is all I need. If any of them feel off, let's talk, and nothing goes live until they do.

Talk soon,
Ashish

---

---

## Artifact 3 — `RECUSAL.md`

> *For commit at the root of the Thedi v2 repository. Formal but not hostile. Doubles as social-contract artifact and HR paper trail.*

```markdown
# RECUSAL.md

**Project:** Thedi
**Maintainer:** Ashish Ranjan ([personal GitHub handle])
**Repository:** https://github.com/[ASHISH-GITHUB-HANDLE]/thedi
**Governing law:** State of California, United States
**Version:** 1.0
**Effective date:** [DATE OF INITIAL COMMIT]

---

## Purpose

This document governs what happens to the Thedi project if the professional
relationship between the project maintainer (Ashish Ranjan) and a current user
of the project (Ramesh Nampalli) materially changes in a way that creates, or
could reasonably appear to create, a conflict of interest. It exists so that
both parties have a pre-agreed, timestamped protocol for such a change, rather
than having to make a judgment call in the moment it happens.

This is a protective artifact, not an accusation. It presumes good faith from
both parties at all times and is designed to preserve that good faith by
removing the need for ad-hoc decision-making under pressure.

---

## 1. Recusal Trigger

The recusal protocol in Section 2 is activated if, at any time while Ashish
Ranjan and Ramesh Nampalli are both employed by Saviynt, Inc. (or its
successors or affiliates), any of the following occurs:

1. Ramesh Nampalli becomes Ashish Ranjan's **direct manager** (formally, via
   an org-chart change or acting-manager assignment, or informally through
   delegated authority).
2. Ramesh Nampalli becomes a **skip-level manager** in Ashish Ranjan's
   reporting line.
3. Ramesh Nampalli is placed on **any performance-review panel, calibration
   committee, or compensation-review panel** evaluating Ashish Ranjan.
4. Ramesh Nampalli is placed on **any promotion committee** considering
   Ashish Ranjan for a role or level change.
5. Any other organizational arrangement that gives Ramesh Nampalli
   **material influence over Ashish Ranjan's compensation, role, or
   continued employment** at Saviynt.

The trigger is activated as of the earlier of: (a) the effective date of the
organizational change, or (b) the date either party becomes aware that the
change is planned.

---

## 2. Read-Only Mode — Operational Definition

When the recusal trigger fires, Ashish Ranjan will, within 7 calendar days:

1. **Close all open GitHub issues** on the Thedi repository with the label
   `recusal-triggered` and a short comment pointing to this file.
2. **Archive the GitHub repository** (GitHub's "Archive this repository"
   feature, which marks it read-only). The repository remains public so that
   Ramesh Nampalli and any other user may continue to read it, fork it, and
   self-maintain it.
3. **Make no further commits, tags, releases, or merges** to the repository
   under his own name.
4. **Not accept, review, or merge pull requests** to the repository.
5. **Respond to any new support requests** (whether via GitHub or any other
   channel) with a link to this file and no further engagement.
6. Ramesh Nampalli, and any other user, **retains the MIT-license rights** to
   fork, modify, and self-host the project. Nothing in this document limits
   those rights.

Read-only mode remains in effect until the review in Section 3 concludes.

---

## 3. Review Process

Within 14 calendar days of the recusal trigger firing, Ashish Ranjan will:

1. **File a written disclosure** with Saviynt Human Resources describing
   (a) the organizational change, (b) the existence of the Thedi project,
   (c) the pre-existing §2870 carve-out letter on file, and (d) the
   activation of this recusal protocol.
2. **Request a determination** from Saviynt HR as to whether, under what
   conditions, and in what form the Thedi project can continue during the
   period of the new organizational arrangement.
3. **Archive the written outcome** of that HR review in the repository (as
   a new entry in `RECUSAL_LOG.md`, see Section 5), so that there is a
   durable public record.

Possible HR outcomes include, but are not limited to:
- The project continues unchanged (HR determines no conflict).
- The project continues in read-only mode indefinitely (HR determines
  Ashish may not contribute while the reporting arrangement stands).
- The project transfers to another maintainer (e.g., Ramesh self-forks and
  self-maintains from his own GitHub).
- The project is retired (neither party maintains it; the public repo
  remains archived).

Whichever outcome HR directs, it is documented in `RECUSAL_LOG.md` with a
date and a one-line summary.

---

## 4. What This Document Is Not

- It is **not** a statement that either party has acted in bad faith. The
  purpose is to remove the need for a judgment call during a stressful
  organizational change.
- It is **not** a unilateral termination of anyone's rights under the MIT
  license. License rights persist.
- It is **not** a substitute for Saviynt's own Code of Conduct, Conflict of
  Interest policy, or HR processes. It is an additional, project-specific
  protocol that complements those.
- It is **not** binding on Saviynt. Saviynt's own policies govern the
  employment relationship; this file governs only the maintainer's conduct
  with respect to the Thedi repository.

---

## 5. `RECUSAL_LOG.md` Template

A sibling file, `RECUSAL_LOG.md`, is maintained in the repository root for
timestamped entries recording any activation, review, or resolution of the
recusal protocol. The template format is:

```

# RECUSAL_LOG.md

## Entry [N] — [YYYY-MM-DD]

- **Event type:** [trigger-activated | hr-review-filed | hr-outcome-received | read-only-mode-entered | read-only-mode-exited | project-retired | other]
- **Description:** [one or two sentences describing the event]
- **Who recorded this entry:** [Ashish Ranjan / other maintainer]
- **Supporting documents:** [links or file paths — e.g., HR outcome letter archived in `/recusal/2026-11-outcome.pdf`]

---

```

Initial state (at repo creation, before any trigger):

```

# RECUSAL_LOG.md

## Entry 1 — [DATE OF INITIAL COMMIT]

- **Event type:** file-initialized
- **Description:** `RECUSAL.md` committed at repo creation. No recusal trigger has been activated. Entry exists to timestamp the existence of the recusal protocol predating any organizational change.
- **Who recorded this entry:** Ashish Ranjan
- **Supporting documents:** `RECUSAL.md` (this repo, v1.0)

```

---

## 6. Contact

For questions about this document, open an issue on the Thedi GitHub
repository. Do not contact the maintainer through any employer-affiliated
channel; per the project's documented support policy, such contacts will be
redirected to GitHub issues.

---

*Version 1.0 — committed at repo creation. Amendments are themselves logged in `RECUSAL_LOG.md`.*
```

---

*End of D3 paper artifacts.*
