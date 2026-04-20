# Yutori — Feature Reference

> **Why this doc exists:** Yutori is the direct inspiration for Thedi. This file captures every feature, mechanism, and design choice Yutori ships, with sources, so we can reference back as we decide what Thedi should adopt, exceed, or deliberately skip.
>
> Treat this as the source of truth on Yutori. Update it when new info lands.

**Last refreshed**: 2026-04-20
**Primary sources**: [yutori.com](https://yutori.com/), [yutori.com/scouts](https://yutori.com/scouts), [blog.yutori.com](https://blog.yutori.com), [Fortune launch coverage (2025-06-10)](https://fortune.com/2025/06/10/exclusive-ex-meta-ai-leaders-agent-web-yutori/), [seed-funding GlobeNewswire (2025-03-27)](https://www.globenewswire.com/news-release/2025/03/27/3050486/0/en/Yutori-Launches-from-Stealth-with-15M-Seed-Funding-to-Build-Consumer-AI-Assistants-Capable-of-Everyday-Tasks-on-the-Web.html)

---

## 1. What Yutori is

**Yutori** (Japanese: *spaciousness, breathing room*) is a consumer AI assistant platform from ex-Meta FAIR founders Devi Parikh, Dhruv Batra, and Abhishek Das. Their flagship product is **Scouts** — always-on AI agents that monitor the web for "anything you care about."

The pitch: *"Turn the web into your second brain. Scouts watch for you so you don't have to."*

**Company facts**
- Founded: 2024 (stealth → public March 27, 2025)
- Seed: $15M (Radical Ventures lead, plus Felicis, Elad Gil, Sarah Guo, Jeff Dean, Fei-Fei Li)
- Scouts public launch: June 10, 2025
- Headcount: undisclosed (Fortune article mentions "the trio" of founders)
- Position: Consumer, not B2B (deliberately)

---

## 2. Scouts — the flagship

### 2.6 Live Artifacts
Beyond monitoring, Scouts can create **Live Artifacts** — dynamic HTML dashboards, spreadsheets, or documents that auto-update as the web changes. Examples shown on yutori.com:
- **US Airports Shutdown Map** (HTML)
- **VCX Fund Dashboard** (HTML)
- **HTML RL Papers 3D** (interactive visualization)

Artifacts are shareable and can be subscribed to by others. This is a **publishing layer** on top of Scout monitoring — not just alerts, but living documents.

### 2.7 Yutori Local
A separate product tier for **logged-in website tasks**. Credentials never leave the user's device. Use cases:
- Social feed monitoring
- Grocery delivery automation
- Expense report generation
- CRM data entry
- Scheduling tools

This is distinct from cloud-based Scouts — runs locally for privacy-sensitive workflows.

A Scout is a **natural-language-defined monitor** that runs asynchronously in the cloud.

### 2.1 How a user creates one
- Type a prompt like *"Tell me when Arc Browser releases a new version"* or *"Track new Bay Area startup layoffs"* or *"Watch arxiv for papers on speculative decoding"*
- Yutori parses intent into a structured scout config (sources, filters, frequency, delivery channel)
- No scripting, no rules, no SQL — prompt-only

### 2.2 What a Scout can do
- **Semantic web search** across the open web
- **Browser automation**: click, scroll, fill forms, log in, follow pagination
- **Feed ingestion**: RSS, arxiv API, YouTube, Reddit, HN, X, GitHub
- **Connector pulls**: Gmail, Slack, Notion, Google Calendar, Linear, GitHub (authenticated accounts)
- **Price / availability checks**: hotel availability, product restocks, flight deals
- **Content extraction**: article bodies, PDF parsing, changelog diffs
- **Comparison + deduplication**: "only surface if genuinely new"

### 2.3 Scheduling
- One-off ("run now")
- Recurring: hourly / daily / custom cron-like expressions
- Event-driven: "run when my Linear ticket moves to Done"

### 2.4 Audit trail (explainability)
Every scout run exposes:
- Pages visited with timestamps
- Filters applied
- Content extracted (raw + distilled)
- Reasoning chain from the agent
- Rejected candidates and why

This is a **trust primitive** — users can verify what the agent saw before trusting the output. Thedi has `audit_log` per step but **not user-visible**; Yutori surfaces it in-product.

### 2.5 Cost transparency
Each scout displays token/compute cost per run and cumulative month-to-date. Pricing model billed on agent usage, not flat subscription.

---

## 3. Delivery channels

Yutori is **multi-channel** by design — not email-only:

| Channel | Use case |
|---|---|
| **Email** | Default digest delivery |
| **Webhooks** | Programmatic downstream (Zapier, custom code) |
| **iOS app** | Push notifications + in-app feed |
| **Web dashboard** | Primary interaction surface; per-scout history |
| **Slack** | Channel or DM delivery (per scout) |
| **Reply-to-refine** | User replies to an email → the scout adjusts its prompt |
| **Live Artifact subscription** | Others can subscribe to your Scout findings/artifacts and receive updates |

Cross-channel = a scout can alert iOS + write a summary to Notion + ping Slack, all from one config.

**Team sharing**: Users can invite others to view and subscribe to Scout findings and artifacts. This is a **collaboration layer** not mentioned in the original doc.

## 4. Connectors (authenticated data sources)

Yutori's differentiator vs. pure web-crawl tools — it can ingest **your stuff**:

- **Gmail** — monitor for keywords/senders, surface in digest
- **Google Calendar** — "remind me 24h before my flight"
- **Notion** — write digest results to a page; or monitor a page for changes
- **Slack** — read channel messages; post digest to channel
- **Linear** — watch for status/assignee changes
- **GitHub** — monitor issues, PRs, star counts, releases
- **(Stated on roadmap)**: Jira, Asana, Gong, Salesforce, Zendesk

The homepage explicitly lists **MCP Design Ecosystem** as a connector framework. This suggests Yutori is building an **open connector standard** (Model Context Protocol) rather than just a fixed list of integrations.

**New connector mentions from homepage**:
- Expense reports
- Scheduling tools
- CRMs

These are not OAuth connectors in the traditional sense — they're **task categories** that Yutori Local handles.

OAuth-based; each connector is per-user.

## 5. Personalization model

Yutori's personalization is **per-scout, not per-user**. Each scout has its own prompt spec; there is no unified "me" model that spans scouts.

Upside: scouts are composable, explainable, and independently editable.
Downside: a user with 10 scouts has 10 copies of their preferences — no learning transfer.

### 5.1 Feedback channels
- **Reply to email** to refine a scout ("too noisy, only alert me on X")
- **In-app thumbs up/down** on individual results
- **Edit the scout's prompt** directly (raw English, not a form)

No explicit free-text "tell me what went wrong" → structured prefs extraction pattern (Thedi's feedback extractor is more sophisticated here).

### 5.2 What's NOT personalized (that Thedi does)
- No cross-scout learning (if you downvote an arxiv paper in Scout A, Scout B on a similar topic doesn't know)
- No timezone-aware local-7-AM delivery (closest is "daily digest")
- No critic/refiner loop per run — each scout runs as a single agent

---

## 6. Scout types Yutori showcases publicly

From the [Scouts landing page](https://yutori.com/scouts):

1. **News monitor** — "tell me when X happens in Y industry"
2. **Research tracker** — "watch arxiv for papers on Z"
3. **Price / deal scout** — flights, hotels, product restocks, eBay
4. **Availability scout** — reservations at hard-to-book restaurants
5. **Product launch tracker** — apps, features, changelogs
6. **Personnel change tracker** — layoffs, exec moves, new hires at specific companies
7. **Regulatory monitor** — policy changes, bill passages, legal filings
8. **Mention monitor** — "tell me when my name / brand is mentioned on HN/Reddit/X"
9. **Inbox triage scout** — summarize overnight Gmail + Slack
10. **Calendar prep scout** — dossier for each meeting

---

## 7. UX + brand

- **Name**: Japanese *yutori* (ゆとり) — roughly "spaciousness, breathing room, time to think." The product promise is *freeing mental bandwidth by outsourcing monitoring*.
- **Tone**: Minimal, calm, serif typography, generous whitespace. Opposite of "pushy dashboard."
- **Mobile-first**: iOS app is primary for many users; web dashboard is complementary.
- **Onboarding**: One prompt box. *"What would you like to watch?"* → LLM generates scout config → user confirms/edits.

---

## 8. Pricing (public info)

- **Free tier** exists and is publicly accessible (pricing page live as of 2026-04-20)
- **Paid tiers** not publicly disclosed in pricing page; billed by agent usage ($ per scout run) per community discussion
- **Enterprise**: not currently a focus per founders' interviews — consumer-first

**Pricing model clarification from homepage**:
- Scouts: billed by agent usage (per run)
- Yutori Local: separate tier (credentials stay on-device)
- Live Artifacts: shareable, subscription-based for viewers

No flat subscription mentioned — still usage-based.

## 9. Technical foundations (inferred + public)

- **LLM backend**: not publicly stated, but Dhruv Batra has mentioned *"frontier models with heavy tool-use"* — likely GPT-4o / Claude + internal fine-tunes for browser agent
- **Browser automation**: internal stack; Batra published work on WebAgent benchmarks at FAIR (relevant prior art)
- **Scheduling infra**: not public, but "scale-to-zero per scout" implied by per-run billing
- **Storage**: Scout state + audit trail persists; users can browse full history of any scout

---

## 10. Known limitations (what Yutori ships today)

Per community feedback + Fortune/blog coverage:

1. **Scouts are point-tools, not collaborating agents** — two scouts on similar topics don't cross-reference
2. **No MAKER-style multi-agent critique** — single agent per scout, no adversarial review layer
3. **Personalization is prompt-only** — no learned user-model
4. **No daily opinionated digest** — it's all monitor-style, not "here's the 10 things you should read this morning". **However**, Live Artifacts can serve as opinionated dashboards (e.g., VCX Fund Dashboard, US Airports Shutdown Map).
5. **No structured feedback extraction** → persistent preferences. **However**, Yutori now supports **artifact subscriptions** where users can refine via follow-up prompts on shared artifacts.
6. **English-first**; limited multilingual
7. **No community / social features** — scouts don't compare to peers' scouts. **Clarification**: there's a gallery of public scout examples, but no peer comparison or social feed.
8. **No team collaboration on artifacts** — while you can share artifacts, there's no mention of multi-user editing or role-based access
9. **Yutori Local is separate from Scouts** — two distinct product tiers, not unified under one agent
10. **No MCP marketplace** — while MCP is mentioned, no public connector marketplace exists yet

## 11. Direct quotes (for positioning)

From [blog.yutori.com on Scouts launch](https://blog.yutori.com/p/scouts):

> "Scouts work in the background while you live your life. They're not a chatbot you have to visit; they come to you when something's worth your attention."

> "It's like having a team of personal assistants working round the clock, just for you."

> "And if you're curious about the magic behind Scouts, you can inspect its work to see what it did to gather the information. That means seeing the steps it took— the todos it broke the task down to, the pages it visited, the filters it used, and the content it pulled. Like an audit trail to help you build confidence and trust Scouts in your daily life."

From Fortune interview:

> "The dream is digital agents that can do anything on the web. Scouts is the first product — we start with 'watch for me' because it's where AI agents provide immediate, daily value without being in the user's face."

> "The web is simultaneously one of humanity's greatest inventions—and really, really clunky."

> "Yutori's long-term dream... is to build AI personal assistants—in the form of web agents—that can take daily digital chores off your plate without you lifting a finger, leaving you with time to tackle whatever brings you joy."

> "That's something that's harder for larger entities to think through from scratch, since they are incentivized to think about their existing products."

> "We have the luxury to be able to just think from scratch."

From [seed-funding announcement](https://www.globenewswire.com/news-release/2025/03/27/3050486/0/en/Yutori-Launches-from-Stealth-with-15M-Seed-Funding-to-Build-Consumer-AI-Assistants-Capable-of-Everyday-Tasks-on-the-Web.html):

> "Yutori is building consumer AI assistants that can complete everyday tasks on the web — from booking tickets, to tracking deals, to monitoring news, to reserving hard-to-get appointments."

## 12. What Thedi can adopt from Yutori

Priority-ordered for our roadmap (see also `docs/features/thedi-roadmap.md`):

| Yutori feature | Thedi action | Priority |
|---|---|---|
| **User-visible audit trail per run** (pages visited, filters, reasoning) | Expose our `audit_log` + `critiques` on a per-digest admin view | **P0** — trust primitive |
| **Reply-to-email to refine** | Resend inbound webhook → scout-feedback-submit | **P1** — low-lift UX win |
| **Multi-channel delivery** (email + iOS push + webhook) | Add webhook emit + consider iOS/PWA later | **P1** |
| **Authenticated connectors** (Gmail, Slack, Notion) | Not near-term — but flag as a differentiator we're missing | P2 |
| **Prompt-parsed scout creation** (NL → structured scout) | We already have a form-based one; could layer NL parsing later | P3 |
| **Scout templates / gallery** (news, price, research, etc.) | Useful for onboarding — suggest 5 starter scouts per signup | P2 |
| **Per-scout cost transparency in-product** | Show users what their digest cost to generate | P2 |

## 13. What Thedi does that Yutori doesn't

1. **MAKER-lite multi-agent loop** (selector → critic → refiner → red-flag) — Yutori is single-agent per scout
2. **Structured feedback → prefs extraction** that feeds *the next run's critic prompt* — Yutori edits scout prompts directly, no learned prefs
3. **Opinionated daily-digest format** (10 items, ranked, with per-item "angle") — Yutori is monitor-style, not digest-style
4. **Cross-source fusion** (arxiv + HN + X merged into one ranked list per user) — Yutori scouts each monitor one pattern
5. **Live "Preview tomorrow's re-rank"** in the feedback chat — Yutori has no such loop-closing moment

---

## 14. Competitive cross-reference

See [`docs/features/research-scout-landscape.md`](./research-scout-landscape.md) for the broader competitive set (Elicit, Research Rabbit, Feedly Leo, Emergent Mind, etc.).

**TL;DR of where Yutori sits in that landscape**: It's the **only general-purpose agentic scout platform** (vs. academic-only Elicit, graph-only Research Rabbit, arxiv-only Emergent Mind). Thedi differentiates by being **deeper in one vertical** (research digest) with a **critique pipeline**, not a general monitoring platform.

---

## 15. Watchlist — things to track about Yutori

- New connector launches (they ship frequently)
- Pricing page going public (currently waitlist-gated)
- Any move into research-digest territory (direct overlap risk)
- Changes to audit trail UX (we should match whatever quality bar they set)
- Team scaling → faster feature velocity

Check quarterly: https://blog.yutori.com, X @yutoriai, the founders' personal accounts.

---

## Appendix — sources

1. [yutori.com](https://yutori.com/) — main site
2. [yutori.com/scouts](https://yutori.com/scouts) — Scouts landing
3. [blog.yutori.com](https://blog.yutori.com) — product blog
4. [blog.yutori.com/p/scouts](https://blog.yutori.com/p/scouts) — Scouts launch post
5. [Fortune launch story (2025-06-10)](https://fortune.com/2025/06/10/exclusive-ex-meta-ai-leaders-agent-web-yutori/)
6. [GlobeNewswire seed announcement (2025-03-27)](https://www.globenewswire.com/news-release/2025/03/27/3050486/0/en/Yutori-Launches-from-Stealth-with-15M-Seed-Funding-to-Build-Consumer-AI-Assistants-Capable-of-Everyday-Tasks-on-the-Web.html)

## 16. Product tiers (new from homepage)

Yutori now has **three distinct product surfaces**:

| Tier | Description | Credentials | Billing |
|---|---|---|---|
| **Scouts** | Cloud-based monitoring agents | OAuth (server-side) | Per-run usage |
| **Yutori Local** | Logged-in website automation | On-device only | Separate tier |
| **Live Artifacts** | Shareable dashboards/documents | N/A (output layer) | Subscription for viewers |

This is a **critical architectural distinction** not captured in the original doc. Scouts and Local are not the same product.

7. [Yutori Home Page](https://yutori.com/) — captured 2026-04-20 (web context provided)
8. [Yutori Scouts Page](https://yutori.com/scouts) — captured 2026-04-20 (web context provided)
9. [Yutori Blog Substack](https://blog.yutori.com/) — captured 2026-04-20 (web context provided)
