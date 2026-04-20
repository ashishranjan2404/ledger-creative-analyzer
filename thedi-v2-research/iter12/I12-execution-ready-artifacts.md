# I12 — Execution-Ready Artifacts

*Iter-12 deliverable. Tomorrow-morning through post-coffee. Five sections, every bracket filled except the ones that genuinely require external input (Saviynt Legal mailing address, attorney-confirmed cites, specific attorney names). Copy-paste-ready. Register: friendly senior-engineer, not corporate-memo.*

*Date drafted: 2026-04-19 (Sunday). First real action: Monday 2026-04-20 morning.*

---

## Section 1 — The coffee invite text (send Monday morning, 2026-04-20)

Per DECISION.md: one line, no agenda, no pre-read, no mention of Thedi.

### 1A. iMessage / SMS (primary channel)

> Hey man — you around for coffee this week? Was gonna grab something near the office Thu or Fri if that works, but whenever's good on your end.

**Alternate one-liner if the above feels too long:**

> Coffee this week? Thu or Fri works for me, flex on your end.

### 1B. Gmail fallback (only if iMessage isn't the established channel)

**Subject:** coffee this week?

> Hey Ramesh,
>
> Around for coffee this week? Thu or Fri works on my end, but happy to flex to whatever's easier for you.
>
> — Ashish

**Do not:** attach anything, mention Thedi, mention Saviynt, mention "something I wanted to run by you," or prime the conversation in any direction. The invite is the invite.

---

## Section 2 — California employment attorney outreach emails

Two versions. The research's original recommendation was to send tonight (2026-04-19, 21:00–22:00 PT) so the 5–7 business-day turnaround doesn't gate the v2 branch if the coffee triggers it. C1's inversion allows deferral until post-coffee, but at the cost of an additional week on the v2 critical path.

**Recommendation: send the post-coffee-only version.** Rationale: v0 is the default per DECISION.md §3; the coffee most likely lands in Branch 2, which does not require the letter. Booking three attorney slots tonight for a branch that fires ~10% of the time is effort against the wrong prior. If the coffee triggers Branch 1, the 1-week delay is recoverable (the freeze protects against downstream urgency). If Ashish is risk-averse about attorney availability specifically, send the "tonight" version instead — the cost is a ~$0 cancellation if unused.

### 2A. "Send tonight" version (books conditional slot for the week after the coffee)

Three copies, one per attorney. Same body. Personal Gmail → attorney intake email.

**Subject:** 1-hour consult — Cal. Labor Code §2870 carve-out letter review

> Hi [ATTORNEY 1],
>
> I'm a software engineer starting a new job at an IAM company next Monday (2026-04-27). I have a pre-existing personal open-source side project, and I'd like to have a California employment attorney pressure-test a §2870 carve-out acknowledgment letter I've drafted before I file it with the new employer's Legal team.
>
> I have the draft ready. I need roughly 1 hour of an attorney's time to check the "relates to the employer's business" adjacency argument and verify case-law cites. I'm flexible on phone or video and can pay your standard 1-hour consult rate.
>
> Could you see me in the next 5–7 business days? Ideally the week of 2026-04-27 or 2026-05-04.
>
> Thanks,
> Ashish Ranjan
> ashishranjan2404@gmail.com
> [personal phone]

(Repeat verbatim for [ATTORNEY 2] and [ATTORNEY 3]; only the salutation changes.)

### 2B. "Send post-coffee only if needed" version (send only if coffee triggers Branch 1)

Slightly shorter. Assumes the coffee has already happened, v2 is confirmed by Ramesh in writing, and the filing is the next step. Send within 48 hours of the "confirmed" email landing.

**Subject:** 1-hour paid consult — §2870 carve-out letter, California, IAM employer

> Hi [ATTORNEY 1],
>
> I'm a software engineer who started at Saviynt (IAM company, El Segundo CA HQ) on 2026-04-27. I have a pre-existing personal open-source project I'd like to resume under a §2870 carve-out, and I have a drafted acknowledgment letter I want a California employment attorney to review before I file it with Saviynt Legal.
>
> The ask is narrow: ~1 hour to pressure-test the adjacency argument and confirm or replace two case-law citations. I can pay your standard consult rate.
>
> Do you have availability in the next 5–7 business days?
>
> Thanks,
> Ashish Ranjan
> ashishranjan2404@gmail.com
> [personal phone]

(Repeat for [ATTORNEY 2], [ATTORNEY 3].)

---

## Section 3 — The filled-in §2870 letter

Based on iter-2 D3 Artifact 1 + iter-3 B3 split-filing amendment (§2870 letter to Legal covers subject matter only; the Outside Activities disclosure to HR names Ramesh). Every bracket filled except (a) Saviynt Legal mailing address, (b) General Counsel's name, (c) HR contact name, (d) hiring-manager name, (e) the §2872 notice receipt date (from the signed PIIA), (f) attorney-confirmed case-law cites, (g) Ashish's personal mailing address, personal phone, and GitHub handle. These remain bracketed because they require external input Ashish has but the research doesn't.

---

**Ashish Ranjan**
[PERSONAL MAILING ADDRESS — not Saviynt]
ashishranjan2404@gmail.com
[PERSONAL PHONE]

**Date:** [DATE OF FILING — on or after attorney review; target 2026-04-27]

**To:**
[GENERAL COUNSEL NAME], General Counsel / Legal Department
Saviynt, Inc.
[SAVIYNT LEGAL MAILING ADDRESS — El Segundo, CA HQ or as directed]

**cc:** [HR CONTACT NAME], Human Resources; [HIRING MANAGER NAME], Hiring Manager

**Subject:** Written acknowledgment under California Labor Code §2870 — pre-existing personal project "Thedi" — request for countersignature within 14 days

---

Dear [GENERAL COUNSEL NAME or "Saviynt Legal Team"]:

I am writing to formally request Saviynt's written acknowledgment that my pre-existing personal open-source project, "Thedi," falls outside the scope of the invention-assignment provisions of my Saviynt employment agreement, pursuant to California Labor Code §2870. I am making this request proactively, before commencing or resuming substantive work on the project during my Saviynt employment, to establish a clear, mutually acknowledged record.

### 1. Purpose

The purpose of this letter is to obtain Saviynt's written confirmation, via countersignature, that: (a) the Thedi project as described below qualifies under California Labor Code §2870(a); (b) it is therefore excluded from any assignment-of-inventions obligations under my Proprietary Information and Inventions Agreement signed in connection with my offer letter; and (c) Saviynt asserts no ownership interest, license, or right of first refusal in the project, its source code, its trademarks, or any revenues derived therefrom.

This request is made in the spirit of California Labor Code §2872, under which Saviynt is required to provide written notice of §2870 rights at the time any invention-assignment agreement is signed. I received that notice on [DATE OF §2872 NOTICE — pull from signed PIIA / onboarding packet] and this letter is responsive to it.

### 2. The §2870 Criteria

California Labor Code §2870(a) provides that any provision in an employment agreement requiring an employee to assign inventions to the employer does not apply to an invention that the employee develops **entirely on the employee's own time** and **without using the employer's equipment, supplies, facilities, or trade secret information**, *except* for inventions that either:

1. **Relate at the time of conception or reduction to practice** to the employer's business, or to the employer's actual or demonstrably anticipated research or development; or
2. **Result from any work performed by the employee for the employer.**

§2870(b) further provides that any employment-agreement term that purports to require assignment of inventions outside these limits is against the public policy of this state and is unenforceable.

Thedi satisfies the threshold criteria and falls outside both exceptions, as established below.

### 3. Description of the Thedi Project

Thedi is a small open-source research pipeline that scouts public sources (arXiv preprints, Hacker News discussions, and similar public data) and assists a newsletter author in drafting Substack posts through a structured question-and-answer interview workflow. It is written primarily in TypeScript, runs on the Butterbase serverless platform, and is released publicly under the MIT License on my personal GitHub account.

The project's scope is strictly **creator / newsletter-author tooling**. Specifically, Thedi:

- Reads public web sources (arXiv, HN) on a daily cron and scores them against a topic rubric;
- Emails a weekly topic digest to a single newsletter author;
- Conducts a brief Socratic Q&A with that author to capture their verbatim phrasing;
- Drafts prose anchored to that verbatim Q&A, via third-party LLM APIs (IonRouter);
- Passes the draft through a rubric-based critic and up to two rewriting rounds;
- Delivers a human-editable draft that the author manually publishes to Substack.

The project is built on, and will continue to be built on, my personally owned hardware, on my personal time (evenings and weekends), using my personal accounts and API keys, and with no Saviynt-owned equipment, supplies, facilities, networks, software, documentation, or confidential or trade-secret information.

### 4. Why Thedi Satisfies §2870 — Each Element Addressed

**(a) Developed entirely on my own time.** All Thedi work has been and will continue to be performed outside Saviynt working hours, on my personal time, with no use of Saviynt working time or on-call time. The project's git history is publicly visible on GitHub and is timestamped; commits predating my Saviynt start date of 2026-04-27 are clearly identifiable and provide a contemporaneous record.

**(b) Without use of employer equipment, supplies, facilities, or trade secret information.** I have not used and will not use any Saviynt-owned laptop, server, network (including VPN, corporate Wi-Fi, or any Saviynt-issued cloud account), software license, subscription, or internal documentation in developing Thedi. I have not used and will not use any Saviynt confidential information or trade secret. The third-party services Thedi uses (GitHub, Butterbase, IonRouter, Resend) are accessed exclusively through my personal accounts, paid for from my personal funds, with no Saviynt involvement.

**(c) Does not relate to Saviynt's business or actual or demonstrably anticipated research or development.** Saviynt's business is Identity and Access Management (IAM), Identity Governance and Administration (IGA), Privileged Access Management (PAM), and related enterprise cybersecurity products, per Saviynt's publicly stated product line. Thedi is a **personal-newsletter authoring and drafting pipeline** targeting a single individual writer's Substack output. It does not process identity data, access control, entitlements, governance, privileged credentials, or any enterprise security function. It operates on public research content (arXiv papers, HN posts) and a single author's personal writing; it has no enterprise deployment, no multi-tenant architecture, no identity-administration feature, and no security-product function. The product category — OSS newsletter creator tooling — is not within Saviynt's business, not within Saviynt's publicly stated roadmap, and to the best of my knowledge not within Saviynt's demonstrably anticipated research and development.

**(d) Does not result from any work performed by me for Saviynt.** Thedi predates my Saviynt start date of 2026-04-27. Its core architecture, codebase, license terms, and operational design were established prior to any Saviynt employment relationship. No Saviynt work product, internal design document, customer conversation, roadmap discussion, or internal meeting has informed Thedi's development, and none will.

### 5. Supporting Legal Context

California law is protective of employee side-project ownership where the §2870 criteria are met, and California courts have construed the statute's "relate to the employer's business" exception narrowly where the employee's project is in a genuinely different product category. [*Applera Corp.-Applied Biosystems Group v. Illumina, Inc.*, 375 F. App'x 12 (Fed. Cir. 2010)] — **[verify citation with attorney]** — and [*Cubic Corp. v. Marty*, 185 Cal. App. 3d 438 (1986)] — **[verify citation with attorney]** — are frequently cited for the proposition that §2870 protections apply where an employee's outside invention is not within the employer's business or anticipated R&D at the time of conception.

I cite these cases for context only; this letter does not rely on any contested interpretation of §2870. The facts above fit the statute's plain language: Thedi is personal-time creator tooling, unrelated to Saviynt's IAM/IGA/PAM product lines, built with no Saviynt resources.

### 6. What I Am Asking Saviynt To Do

I respectfully request that Saviynt, via the signature block at the end of this letter, confirm in writing, within **14 calendar days of the date above**, that:

1. The Thedi project as described in Sections 3 and 4 above falls within California Labor Code §2870(a);
2. Saviynt asserts no ownership claim, assignment right, license, or right of first refusal over the Thedi project, its source code, its name or marks, or any revenues derived from it;
3. Continued personal-time maintenance of the Thedi project by me, consistent with Section 3 above, is not in conflict with my Saviynt employment obligations, subject to my ongoing compliance with Saviynt's Code of Conduct, Outside Activities / Moonlighting policy, and Conflict of Interest policy.

If Saviynt believes the project falls outside §2870, I ask that Saviynt explain its reasoning in writing so that I can respond or amend the project's scope as appropriate. If Saviynt needs additional information to evaluate the request, I am available to meet at any time.

**Note on split filing.** This letter addresses subject-matter scope only. I am concurrently filing a separate Outside Activities Disclosure with Human Resources identifying the single current user of Thedi, a Saviynt colleague, and describing the structural guardrails in place (no money, public MIT license, user runs own infrastructure, support via public GitHub issues only, written recusal protocol if reporting-chain changes). That disclosure is routed to HR, not Legal, by design — subject-matter review is Legal's remit; personnel-adjacency disclosure is HR's.

### 7. Attachments

- **Attachment A:** Public GitHub repository URL — `https://github.com/[ASHISH-GITHUB-HANDLE]/thedi` — under Ashish Ranjan's personal account.
- **Attachment B:** Project license — MIT License, included in the repository root as `LICENSE`.
- **Attachment C:** One-page architectural summary of Thedi's scope and data flows, for the Saviynt Legal team's convenience.
- **Attachment D:** Copy of the §2872 written notice of §2870 rights received during onboarding on [DATE OF §2872 NOTICE], for reference.

### 8. Signatures

I look forward to Saviynt's written confirmation within 14 calendar days. Thank you for your prompt attention.

Sincerely,

_________________________________
**Ashish Ranjan**
ashishranjan2404@gmail.com
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

### Companion Outside Activities Disclosure (files to HR, not Legal)

Short, separate document. Filed via HR portal or emailed to [HR CONTACT NAME] on the same day as the §2870 letter.

**Subject:** Outside Activities Disclosure — Personal Open-Source Project "Thedi"

> Per Saviynt's Outside Activities / Moonlighting policy, I'm disclosing a personal open-source project, "Thedi," which I maintain on my personal time outside work hours. The project is public under the MIT license on my personal GitHub. Separately, I've filed a §2870 carve-out letter with Legal covering subject-matter scope.
>
> The reason I'm filing this with HR specifically: the current single user of the project is a Saviynt colleague, Ramesh Nampalli. The arrangement has no money flow, no shared infrastructure, and no Saviynt-channel contact. Ramesh runs the project on his own Butterbase account with his own credentials; my role is that of any OSS maintainer toward any user of a public repository. I hold no standing production credentials on his deployment.
>
> The arrangement is covered by a written 5-point agreement between us (personal email, dated [DATE]) and a `RECUSAL.md` file committed at the repository root. Both are available on request.
>
> If the reporting relationship between Ramesh and me changes at any point — if he becomes my direct manager, skip-level, or is placed on a panel evaluating me — the recusal protocol activates, I stop contributing to the repository, and I re-file with HR to confirm next steps.
>
> Happy to discuss if any of this would benefit from a conversation.
>
> — Ashish Ranjan
> ashishranjan2404@gmail.com
> [PERSONAL PHONE]

---

## Section 4 — Post-coffee confirmation email to Ramesh (Branch 2 / v0 default)

Sent after the coffee happens and Ramesh has verbally agreed to v0. Personal Gmail → Ramesh's personal email. ~300 words. Reads as "friend recapping a conversation," not "contract being signed." The 5 points below are the v0 set per I10-A §2.1, with I11-A Playbook 7's monthly hours-check amendment folded into point 5.

### 4A. Subject line

**Subject:** quick recap from coffee — five things and the 90-day check-in

### 4B. Body

> Hey Ramesh,
>
> Good to see you. Writing this down while it's fresh so we both have the same picture.
>
> Here's what we landed on — it's small on purpose:
>
> 1. **Your writing, your words.** No ghostwriting, no LLM in the drafting path. The Substack posts are yours.
>
> 2. **I leave comments, not rewrites.** 5–10 inline notes per draft, mostly structural, voice, clarity, factual. I don't suggest paragraphs and I don't rewrite. If I ever start to, call it out.
>
> 3. **Not on Saviynt channels.** No Slack, no work email, no hallway, no 1:1s. Personal email or Google Doc comments only. This is the one I care about most — it's what keeps the whole thing clean.
>
> 4. **If you end up in my reporting chain, it pauses.** Manager, skip-level, any panel evaluating me — I stop reviewing, you keep writing, we both loop HR. Same logic we talked about; nothing clever.
>
> 5. **We do a quick hours check at the end of each month.** If my time on it is running over an hour a week consistently, we revisit — either I'm doing more than v0 covers and we name it, or v0 has drifted into something else and we update the agreement. I'll do the accounting; you just get a one-line text saying "still under an hour" or "we should talk."
>
> Mechanically: the Friday scout digest starts landing in your inbox this week — three picks, one-line rationale each. Write whenever, in the shared Google Doc folder I'll send. Tag `@ashish ready for pass` when something's ready. I'll do one 30-minute read Tuesday evenings and comment back.
>
> 90 days from now (so late July), coffee again, and we look at what actually happened. If v0 is working, keep going. If something specific is getting in the way, we talk about what to add. Default is always the smaller answer.
>
> A one-word "yes" to this is all I need.
>
> — Ashish

---

## Section 5 — Playbook 2 rewrite (hosting refusal, warmer register)

The original I11-A Playbook 2 script includes: *"The reason the OSS + self-host framing holds up legally is that I'm not operating production for you."* Technically correct, lawyerly in-the-moment. Two rewrites: the in-the-moment verbal version, and the 24-hour follow-up.

### 5A. In-the-moment script (if Ramesh asks at coffee or on a call)

Spoken, not texted. Register: warm, regretful-no, moving toward a workable alternative without making the refusal sound like policy.

> *"Honestly, I can't — and I hate saying that because I know it's the unsexy answer to a reasonable question. The thing is, the minute I'm running the account, it's not the same arrangement anymore. It turns into me doing your production for you, which is a different shape than OSS I happen to maintain, and the whole thing we set up starts leaking. I've watched this exact move kill friendships between engineers, and I'm not trying to get cute about it.*
>
> *Better thing I can offer: let me sit with you on a screen-share for 90 minutes on a Saturday. We go through the install together, step by step, and at the end you own the account and I walk away with no credentials. I do the hard parts while you watch. You end up with working infra and we both end up with the story we want."*

Beats: refusal first, reason second (short), explicit "I'm not being bureaucratic," concrete alternative, name the shape of the offer.

### 5B. 24-hour follow-up text (confirming the conversation, warmer still)

Sent personal phone → personal phone (or personal email), same day or next morning.

> Hey — thinking about what you said yesterday about the hosting piece. I know my answer landed a little stiff in the moment. The reason I'm weird about it isn't paranoia, it's that I've seen the "just for a month" thing eat people, and I'd rather be annoying about it once now than sort it out later.
>
> Concrete offer: Saturday morning, 9 to 10:30 PT, Zoom + screen-share. I run you through the Butterbase install live, you put your card in, you get the keys, I disappear. First half of the week I do a dry-run on a throwaway account so we don't hit surprises. You end up fully set up in ~90 minutes and I never have a login.
>
> If that feels like too much setup friction even with me walking you through it, that's also a real signal — it might mean v0 (Friday digest + Google Doc, no hosting at all) is the right shape for this and we don't need the pipeline. Either's fine with me; no wrong answer.
>
> Let me know what works.

Beats: acknowledge the register of the first answer, explain the why without re-invoking legalism, concrete time-boxed alternative, offer the smaller fallback (v0) without framing it as a retreat, close warm.

---

*End of I12. Five sections, copy-paste-ready. The coffee invite is the one that goes out first — tomorrow, 2026-04-20. Everything else waits on the coffee.*
