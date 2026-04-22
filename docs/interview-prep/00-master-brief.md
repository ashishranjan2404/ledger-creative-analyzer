# Master Brief — Saviynt / Subith Shajee — Wed 2026-04-22 10:00 PST

**Interview:** Subith Shajee, Sr. Director of Cloud Operations, Saviynt
**Role:** Principal Engineer, Cloud Platforms
**Duration:** 60 min
**Zoom:** https://saviynt.zoom.us/j/8971903862?pwd=NjdXckdhb2tlU0lqSWEvdlpxWW1SQT09
**His LinkedIn:** https://www.linkedin.com/in/subithshajee/

**Recruiter-signaled priorities (verbatim from Nick):**
1. "Be ready for technical questions"
2. "Review the job description and be ready to talk about your experience with the listed technologies"
3. **"Speak in-depth about your usage of AI in your work"** ← highest leverage

---

## Read these detail docs if time allows

| File | Purpose |
|---|---|
| `01-interviewer-subith-shajee.md` | Who Subith is, what he looks for |
| `02-saviynt-company.md` | Business, scale, tech stack, AI strategy |
| `03-job-description.md` | Role expectations (Java/Spring, K8s, cloud) |
| `04-iam-domain-primer.md` | Fast cheat sheet on IGA/IAM/PAM vocabulary |
| `05-ai-in-work-story.md` | STAR answers for "how do you use AI" — the #1 prompt |
| `06-question-bank.md` | 52 likely questions w/ beat-by-beat answer skeletons |

*(I'll rename the docs at the bottom of this file so they sort in this order.)*

---

## The 90-second opening pitch (memorize the shape, not the words)

> "I've spent 13 years building planet-scale infrastructure — 8 at Cisco where I led Tetration's data ingestion (billions of flows/sec) and then Tech Lead for the PaaS migration, and 5 at Akamai where I shipped Watchtower (ML triage system that cut Data Science validation load 60%) and Okeanos (petabyte SQL-over-PrestoDB, now used by 30+ data scientists).
>
> For the past year I've been an AI/ML consultant — I won Meta's PyTorch OpenEnv hackathon in March for **KubeRL**, an RL training gym where LLM agents learn to diagnose and repair live K8s incidents. I also consult at sotto/teamtheory shipping production LLM agent pipelines with sub-200ms audio.
>
> What draws me to Saviynt: identity is IT dial-tone — if your plane goes down, nobody logs into anything. That's the same operational posture I owned at Akamai's edge, but at Saviynt it's converged with an IAM+PAM+ISPM platform that's growing 35% on $200M ARR after your $700M KKR raise. And your 'AI agents as identities' thesis lines up exactly with the RL agent work I've been doing. I'd love to go deep on how I can help your Cloud Platforms team."

**Why this works for Subith specifically:**
- Infra-operator framing (not researcher framing) — his DNA
- Numbers first, then story — he's senior enough to want signal density
- Names the scale of Saviynt's business moment — shows you did homework
- Explicit bridge to identity ("IT dial-tone") + AI ("agents as identities")

---

## The 6 highest-leverage talking points

**1. "Identity is IT dial-tone"** — your Akamai edge/CDN availability DNA transfers directly. IAM request paths have the same latency + availability + multi-region + connector-platform shape as CDN edge auth.

**2. NHI (Non-Human Identity) is the unsolved problem right now.** AI agents, service accounts, CI/CD bots outnumber human identities 82:1 in enterprises. Existing IGA was built assuming identity = person. This is the wedge where your agentic/RL work is directly relevant.

**3. The "KubeRL → runbook automation" bridge.** You built an RL gym that teaches agents to fix K8s incidents. Most powerful framing for Subith: *"I've already trained an agent to do what a Tier-1 on-call does. The open problem is reward hacking — the agent finds cheap wins that silence the alert without fixing the underlying problem. That's the exact lesson you need before letting agents run your CloudOps."*

**4. Postmortem and on-call discipline.** Subith came from sysadmin → ops → CloudOps Sr Director. He will love postmortems that end in automation, not just docs. Reference One Touch (Cisco, 85% migration-time reduction, 5-person team).

**5. Customer-impact framing.** He was a PM for a year at Saviynt — unusual for an infra director. Frame every engineering decision you describe in terms of customer outcome, not technical elegance.

**6. Python ↔ Java gap** — don't dodge it. Saviynt is Java/Spring primary. You've shipped in both. Pre-empt with: *"Most of my recent work is Python for ML, but at Cisco I was polyglot (Java, Python, Go, Perl); I pick up stacks fast and I don't have language religion."*

---

## The three story anchors (keep these in your back pocket)

### Anchor A — **Okeanos** (analogous to Saviynt's access-review pipeline)
- Petabyte-scale SQL-over-PrestoDB query engine at Akamai
- Cut 4-hour manual setup per analysis
- Adopted by 30+ data scientists
- **Maps to:** Saviynt's access certification at enterprise scale (300K × 200 apps = 60M reviews per cycle). Same class of problem: distributed batch + idempotency + compliance audit trail.

### Anchor B — **KubeRL** (the AI story for cloud ops)
- 1st place ($15K) Meta PyTorch OpenEnv Hackathon, Mar 2026
- High-fidelity RL env on live GKE clusters
- Qwen3-4B trained via GRPO + LoRA on H100s using HuggingFace TRL
- Fleet AI judged. Invited to publish on HuggingFace blog
- **Key insight to volunteer:** *"Reward hacking is the biggest gotcha — an agent will silence an alert (cheap win) instead of fixing the root cause. Reward design for incident response has to verify the actual state, not just the alert state. This is directly applicable to agentic IGA — you can't let an agent 'resolve' an access review by approving everything."*

### Anchor C — **spec-lesson** (built today, shows AI-native development)
- ADHD-first live meeting assistant + Claude Code context bridge
- Built in one session: 36 commits, 88 tests, 0 regressions
- Used a "parallel critic + judge-fixer" pattern: 3 rounds × 4 parallel Sonnet critics with distinct lenses + 1 judge-fixer that writes failing tests and applies fixes
- **Found 18 bugs**, including one critical (Deepgram contextmanager vs iterator) where all 82 unit tests passed because the mock pattern `iter([fake_socket])` hid the bug entirely
- **Lesson to share with Subith:** *"The biggest AI-coding trap is trusting the agent's self-report. DONE doesn't mean done. Cross-validation with parallel critics caught a production-breaking bug that 82 passing tests missed."*

---

## Likely question themes (full answer beats in `06-question-bank.md`)

**Highest probability (study first):**

1. **"Tell me about yourself"** → use the 90-second pitch above.

2. **"How do you use AI in your work?"** — Nick's explicit flag. Open with: *"I use Claude Code as a daily collaborator — I own judgment and architecture; agents own the keystrokes."* Then the spec-lesson case study (numbers-first). Then proactively volunteer failure modes (DONE ≠ done, hallucinated APIs, reward hacking).

3. **"Walk me through an incident you owned end-to-end"** — pick one from Akamai (Watchtower on-call, or a specific outage). Structure: trigger → detection → scope → mitigation → postmortem → **automation shipped as a result** (that's the Subith-alignment move).

4. **"Design an access certification system for a 50K-employee customer"** — volume math first (60M reviews/cycle), then: queue → worker pool → idempotency keys → sharded by manager → append-only audit → SLO discussion. Reference Okeanos + Cisco log streaming (3K logs/sec).

5. **"Principal Engineer scope — what's your 1-year plan if you joined the CloudOps team?"** — frame:
   - 30 days: shadow on-call rotations, read 3 postmortems, map connector framework
   - 60 days: identify the top 1 toil source + prototype automation (agent or deterministic)
   - 90-180 days: ship one reliability or AI-automation win measurable in MTTR or provisioning time
   - 1 year: become the go-to for 1 platform area (pick one from the JD list) AND have introduced AI-assisted ops patterns with measurable outcomes

6. **"You're new to IGA — how do you ramp?"** — *very likely from Subith.* Say: "1 week of docs + 1 week of shadowing customer calls + reading the connector source + writing my own test scenarios. I came into Tetration knowing Cisco ACI at roughly zero and shipped within a quarter." Acknowledge the gap explicitly — don't pretend.

7. **"Why Saviynt?"** — the $700M KKR raise + FedRAMP moat + NHI thesis + identity-is-dial-tone framing. Show you understand the business moment, not just the tech.

**Medium probability:**

- Kubernetes multi-tenancy story (namespace-per-tenant vs cluster-per-tenant tradeoff)
- Disagreement with a Staff/Distinguished engineer (Rams and Michael are both in the loop — good to show you work well with opinionated peers)
- Blue-green vs canary at identity scale (identity has special failure modes: session invalidation, token expiry, silent auth failures)
- Cost-vs-reliability tradeoff (Subith will care — he runs a cost center)
- LLM in production: what if an LLM-generated access decision is wrong? (This is a trap question — the answer is "never full autonomy for high-blast-radius ops; always human-in-the-loop for revocation, approval, privileged ops")

---

## Domain vocab cheat sheet

If any of these come up, don't flinch:

- **IGA** — Identity Governance & Administration (lifecycle, reviews, SoD) — Saviynt's core
- **IAM** — broader umbrella (auth + authz + lifecycle)
- **PAM** — Privileged Access Management (admin accounts, vaults, ephemeral creds)
- **ISPM** — Identity Security Posture Management
- **SoD** — Segregation of Duties (you can't approve your own purchase order) → policy engine driver
- **Access Certification** — periodic "manager, confirm this report still needs this access"
- **Role mining** — deriving roles from existing access patterns
- **Entitlement** — a specific permission (e.g., "Salesforce: create_opportunity")
- **IdP** — Identity Provider (Okta, Azure AD, Google Workspace)
- **SCIM / OIDC / SAML** — protocols; SCIM = user provisioning, OIDC = modern auth, SAML = enterprise SSO
- **NHI** — Non-Human Identity (service accounts, agents, bots) — the hot 2026 topic
- **JIT / ZSP** — Just-in-Time / Zero Standing Privileges (PAM patterns)

---

## 5 questions to ask Subith (pick 2-3)

1. **"Saviynt's thesis is that identity is the foundation for the AI era. Operationally, what does that mean for your CloudOps team in the next 12 months? What's the biggest live problem you're solving right now?"**

2. **"Your LinkedIn journey is unusual — PM to Sr Director of CloudOps. What do you look for in a Principal Engineer that bridges those two muscles?"**

3. **"How is the team thinking about AI in your own ops work — MTTR reduction, runbook generation, triage? What's the current posture: experimenting, piloting, or has something hit production?"**

4. **"The FedRAMP Moderate ATO is a real moat. What does it impose on engineering in practice — what would I need to know about compliant change management in my first 60 days?"**

5. **"Where's the boundary between Cloud Platforms and Product Engineering? How do you know when a problem is yours vs Rams's team?"**

---

## Traps to avoid

- ❌ **Don't overclaim AI autonomy.** Subith runs ops for 600+ enterprise tenants. He'll distrust anyone who says "the agent just does it." Always pair autonomy with human-in-the-loop for high-blast-radius actions.
- ❌ **Don't dismiss Java.** Saviynt is Java/Spring primary. You've shipped in Java before (Cisco Tetration). Lead with "I'm polyglot" not "I'm a Python guy."
- ❌ **Don't go deep on RL math unprompted.** Save GRPO details for Michael Costello (Distinguished Engineer, 4/24) — he's the one who'll ask. For Subith, keep KubeRL in the "runbook automation for cloud ops" framing.
- ❌ **Don't hide your IGA gap.** He knows your resume. Pretending you know IGA inside-out will backfire. Acknowledge + show your learning plan.
- ❌ **Don't trash SailPoint or other competitors.** Saviynt's differentiator is converged IGA+PAM+ISPM + FedRAMP; you can compliment that without being negative.
- ❌ **Don't forget the close.** End with: *"What are the top two things you're hoping I can make material progress on in my first 90 days?"* — this gives him a reason to commit to you.

---

## 10 minutes before the call

- [ ] Pull up this file + `05-ai-in-work-story.md`
- [ ] Have the spec-lesson numbers memorized (36 commits / 88 tests / 18 bugs / 3 rounds)
- [ ] Have Okeanos numbers (60% reduction / 30+ data scientists / 4-hour setup eliminated)
- [ ] Have KubeRL numbers ($15K / Qwen3-4B / GRPO+LoRA / H100s / Fleet AI judged)
- [ ] Saviynt numbers ($200M ARR / $700M KKR raise Dec 2025 / $3B valuation / 600+ customers / 20%+ of F100 / 100M+ identities / 25+ regions)
- [ ] One glass of water, one breath. You've already passed the Rams round with "great technical depth."
