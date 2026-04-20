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

> **Trust Primitive Callout:** Yutori's user-visible audit trail is a key differentiator. Thedi currently has `audit_log` per step but **not user-visible**. This is a P0 action item to match Yutori's trust primitive in the Two-Week Sprint Plan (Section 12.1).
Every scout run exposes:
- Pages visited with timestamps
- Filters applied
- Content extracted (raw + distilled)
- Reasoning chain from the agent
- Rejected candidates and why

This is a **trust primitive** — users can verify what the agent saw before trusting the output. Thedi has `audit_log` per step but **not user-visible**; Yutori surfaces it in-product.

### 2.5 Cost transparency
Each scout displays token/compute cost per run and cumulative month-to-date. Pricing model billed on agent usage, not flat subscription.

### 2.6 Live Artifacts
Beyond monitoring, Scouts can create **Live Artifacts** — dynamic HTML dashboards, spreadsheets, or documents that auto-update as the web changes. Examples shown on yutori.com:
- **US Airports Shutdown Map** (HTML)
- **VCX Fund Dashboard** (HTML)
- **HTML RL Papers 3D** (interactive visualization)

Artifacts are shareable and can be subscribed to by others. This is a **publishing layer** on top of Scout monitoring — not just alerts, but living documents.

### 2.6.1 Artifact Examples
Homepage explicitly showcases three live artifact examples:
- **HTML RL Papers 3D** — interactive 3D visualization of reinforcement learning papers
- **HTML US Airports Shutdown Map** — live-updating map of airport closures
- **HTML VCX Fund Dashboard** — fund performance tracking dashboard

These artifacts are **shareable** and can be **subscribed to by others** (viewers don't need Yutori accounts). This is a **publishing layer** on top of Scout monitoring — not just alerts, but living documents that auto-update as the web changes.

### 2.7 Yutori Local

A separate product tier for **logged-in website tasks**. Credentials never leave the user's device. Use cases explicitly listed on homepage:
- Social feed monitoring
- Grocery delivery automation
- Expense report generation
- CRM data entry
- Scheduling tools

This is distinct from cloud-based Scouts — runs locally for privacy-sensitive workflows.

A Scout is a **natural-language-defined monitor** that runs asynchronously in the cloud.

## 3. Delivery channels

### 3.1 Team Collaboration
Yutori explicitly supports **team sharing** of Scout findings and artifacts:
- Invite others to view Scout results
- Subscribe to artifact updates (viewers don't need Yutori accounts)
- Shared dashboards for team monitoring

This is a **collaboration layer** that extends beyond individual use cases.

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

### 3.2 Reply-to-Refine
Homepage explicitly states: **"Reply directly to refine results or ask follow-ups."**

This is a **feedback loop** where users can reply to email digests or interact via web to adjust scout behavior. Not just thumbs up/down — natural language refinement.

**Homepage copy confirms**:
- "Reply directly to refine results or ask follow-ups"
- This applies to both email and web interactions

### 3.3 MCP Design Ecosystem
Homepage explicitly lists **MCP Design Ecosystem** as a connector framework:
- Connect Gmail, Slack, Notion, etc.
- Agents monitor inbox for leads, surface important messages
- Track updates in docs without manual checking

This suggests Yutori is building an **open connector standard** (Model Context Protocol) rather than just a fixed list of integrations. The MCP framework is a **design ecosystem** — not just a technical protocol.

**Homepage copy confirms**:
- "Connect your context. Connect Gmail, Slack, Notion, etc., and have agents monitor your inbox for leads, surface important messages, or track updates in your docs — without manual checking."
- "MCP Design Ecosystem" is explicitly named as a connector framework

## 4. Connectors (authenticated data sources)

### 4.1 MCP Design Ecosystem
The homepage explicitly lists **MCP Design Ecosystem** as a connector framework:
- Connect Gmail, Slack, Notion, etc.
- Agents monitor inbox for leads, surface important messages
- Track updates in docs without manual checking

This suggests Yutori is building an **open connector standard** (Model Context Protocol) rather than just a fixed list of integrations. The MCP framework is a **design ecosystem** — not just a technical protocol.

**Homepage copy confirms**:
- "Connect your context. Connect Gmail, Slack, Notion, etc., and have agents monitor your inbox for leads, surface important messages, or track updates in your docs — without manual checking."
- "MCP Design Ecosystem" is explicitly named as a connector framework

Yutori's differentiator vs. pure web-crawl tools — it can ingest **your stuff**:

- **Gmail** — monitor for keywords/senders, surface in digest
- **Google Calendar** — "remind me 24h before my flight"
- **Notion** — write digest results to a page; or monitor a page for changes
- **Slack** — read channel messages; post digest to channel
- **Linear** — watch for status/assignee changes
- **GitHub** — monitor issues, PRs, star counts, releases
- **(Stated on roadmap)**: Jira, Asana, Gong, Salesforce, Zendesk

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

### 8.1 Pricing Page Status
As of 2026-04-20, the pricing page is **live and publicly accessible** (not waitlist-gated):
- "See Pricing" link is visible on homepage
- Free tier exists and is publicly accessible
- Paid tiers not publicly disclosed in pricing page; billed by agent usage ($ per scout run) per community discussion

**Homepage copy confirms**:
- "Start for free" button visible
- "See Pricing" link visible
- Three product surfaces clearly distinguished

**Note**: Section 16 (Product Tiers) now contains the full tier breakdown. This section should reference Section 16 for detailed pricing model.

### 8.2 Pricing Details
Homepage explicitly states **"Start for free"** and **"See Pricing"** link is visible (not waitlist-gated as of 2026-04-20).

**Pricing model**:
- **Scouts**: Billed per agent usage (per scout run), not flat subscription
- **Yutori Local**: Separate tier (on-device automation)
- **Live Artifacts**: Subscription for viewers (shareable dashboards/documents)

**Homepage copy confirms**:
- "Start for free" button visible
- "See Pricing" link visible
- Three product surfaces clearly distinguished: Scouts, Yutori Local, Live Artifacts

**Critical architectural distinction**: Scouts and Local are not the same product. Scouts run in the cloud; Local runs on-device for privacy-sensitive workflows.

## 9. Technical foundations (inferred + public)

- **LLM backend**: not publicly stated, but Dhruv Batra has mentioned *"frontier models with heavy tool-use"* — likely GPT-4o / Claude + internal fine-tunes for browser agent
- **Browser automation**: internal stack; Batra published work on WebAgent benchmarks at FAIR (relevant prior art)
- **Scheduling infra**: not public, but "scale-to-zero per scout" implied by per-run billing
- **Storage**: Scout state + audit trail persists; users can browse full history of any scout

---

## 10. Known limitations (what Yutori ships today)

### 10.1 Team Collaboration Limitations
Per homepage and Fortune coverage:
- **Team sharing exists but is limited** — you can invite others to view and subscribe to Scout findings and artifacts, but there's no mention of multi-user editing or role-based access (vs. Feedly Leo's team workspaces)
- **No peer comparison** — scouts don't compare to peers' scouts (community gallery exists, but no social feed or benchmarking)
- **No multi-agent collaboration** — two scouts on similar topics don't cross-reference (vs. Thedi's MAKER-lite multi-agent loop)

**Homepage copy confirms**:
- "Share with your team. Invite others to view and subscribe to your Scout findings and artifacts."
- No mention of multi-user editing or role-based access

### 10.2 MCP Marketplace Status

While the **MCP Design Ecosystem** is explicitly listed as a connector framework on the homepage, there is **no public connector marketplace** yet. The MCP framework is a design ecosystem rather than a technical protocol alone.

**Homepage copy confirms**:
- "Connect your context. Connect Gmail, Slack, Notion, etc., and have agents monitor your inbox for leads, surface important messages, or track updates in your docs — without manual checking."
- "MCP Design Ecosystem" is explicitly named as a connector framework

### 10.3 Community Gallery Features

Homepage features a "Scouts from the community" section showcasing public scout examples:
- Examples include news tracking, live-updating websites, reservation booking
- **No peer comparison or social feed features** — scouts don't compare to peers' scouts
- Community gallery exists but lacks benchmarking or social features

**Homepage copy confirms**:
- "Scouts from the community" section visible
- "Here's what people are using Yutori's always-on AI to be amongst the first to know about."

Per community feedback + Fortune/blog coverage:

1. **Scouts are point-tools, not collaborating agents** — two scouts on similar topics don't cross-reference
2. **No MAKER-style multi-agent critique** — single agent per scout, no adversarial review layer
3. **Personalization is prompt-only** — no learned user-model
4. **No daily opinionated digest** — it's all monitor-style, not "here's the 10 things you should read this morning". **However**, Live Artifacts can serve as opinionated dashboards (e.g., VCX Fund Dashboard, US Airports Shutdown Map).
5. **No structured feedback extraction** → persistent preferences. **However**, Yutori now supports **artifact subscriptions** where users can refine via follow-up prompts on shared artifacts.
6. **English-first**; limited multilingual
7. **No community / social features** — scouts don't compare to peers' scouts. **Clarification**: there's a gallery of public scout examples, but no peer comparison or social feed.
8. **Limited team collaboration** — you can invite others to view and subscribe to Scout findings and artifact

## 11. Direct quotes (for positioning)

### 11.1 Additional Founder Quotes
From Fortune interview (Devi Parikh):
> "The web is simultaneously one of humanity's greatest inventions—and really, really clunky."

> "That's something that's harder for larger entities to think through from scratch, since they are incentivized to think about their existing products."

> "We have the luxury to be able to just think from scratch."

> "For example, if an AI agent is ordering food on DoorDash for you, it might need to show which restaurants it searched, what menu items it considered, and a few options you can quickly review and confirm. But if that same agent is monitoring the news and generating daily summaries, the format should be entirely different—perhaps organized like a briefing or timeline."

> "Ultimately, a system should intelligently decide how to present information and how users can interact with the agent to refine or redirect the task."

From Fortune interview (Devi Parikh on long-term vision):
> "Yutori's long-term dream... is to build AI personal assistants—in the form of web agents—that can take daily digital chores off your plate without you lifting a finger, leaving you with time to tackle whatever brings you joy."

> "The dream is digital agents that can do anything on the web. Scouts is the first product — we start with 'watch for me' because it's where AI agents provide immediate, daily value without being in the user's face."

From [blog.yutori.com on Scouts launch](https://blog.yutori.com/p/scouts):

> "Scouts work in the background while you live your life. They're not a chatbot you have to visit; they come to you when something's worth your attention."

> "It's like having a team of personal assistants working round the clock, just for you."

> "And if you're curious about the magic behind Scouts, you can inspect its work to see what it did to gather the information. That means seeing the steps it took— the todos it broke the task down to, the pages it visited, the filters it used, and the content it pulled. Like an audit trail to help you build confidence and trust Scouts in your daily life."

From [seed-funding announcement](https://www.globenewswire.com/news-release/2025/03/27/3050486/0/en/Yutori-Launches-from-Stealth-with-15M-Seed-Funding-to-Build-Consumer-AI-Assistants-Capable-of-Everyday-Tasks-on-the-Web.html):

> "Yutori is building consumer AI assistants that can complete everyday tasks on the web — from booking tickets, to tracking deals, to monitoring news, to reserving hard-to-get appointments."

## 12. What Thedi can adopt from Yutori

### 12.1 Two-Week Sprint Plan (Next 14 Days)

### 12.1.1 Refined Sprint Plan (Updated 2026-04-20)

**Goal:** Close the trust gap (Audit Trail) and enable multi-channel delivery (Webhooks) before Yutori's next feature drop.

| Priority | Action | Yutori Section | Est. Effort | Owner | Success Metric |
|---|---|---|---|---|---|
| **P0** | **Ship User-Visible Audit Trail** — Add a "View Scout Run" modal to the digest email footer and web dashboard. Show: pages visited, filters applied, reasoning chain, rejected candidates. | 2.4 Audit trail | 3 days | Eng | 80% of active users view audit trail at least once |
| **P1** | **Enable Reply-to-Refine** — Wire inbound email replies to `scout-feedback-submit` endpoint. Parse user text as prompt adjustment for next run. | 3. Delivery channels | 2 days | Eng | 30% of users enable webhook delivery |
| **P1** | **Add Webhook Delivery** — Allow users to configure a webhook URL per scout. Emit JSON payload on match. | 3. Delivery channels | 2 days | Eng | 50% reduction in "why did you send this?" support tickets |
| **P2** | **Cost Transparency Badge** — Display token/compute cost per digest in the email footer and dashboard. | 2.5 Cost transparency | 1 day | Eng | 20% increase in scout creation rate (due to templates) |
| **P2** | **Starter Scout Templates** — On signup, show 5 pre-built scouts (News, Research, Price, Launch, Mention) with one-click "Create". | 6. Scout types | 1 day | Design | |

**Why these first?**
- Audit trail is Yutori's **trust primitive** — we must match it to avoid being seen as a "black box".
- Reply-to-refine is **low-lift UX win** that leverages existing email infrastructure.
- Webhooks enable **programmatic downstream** (Zapier, custom code) — critical for power users.
- Cost transparency builds **pricing trust** before we scale usage.
- Templates reduce **onboarding friction** — Yutori's "one prompt box" is simpler than our form.

**What to skip for now:**
- Authenticated connectors (Gmail, Slack, Notion) — P2, requires OAuth infra.
- NL-to-structured scout parsing — P3, we already have form-based creation.
- iOS app — P3, web dashboard + email is sufficient for MVP.
- Live Artifacts — P3, not core to research digest use case.

**Goal:** Close the trust gap (Audit Trail) and enable multi-channel delivery (Webhooks) before Yutori's next feature drop.

| Priority | Action | Yutori Section | Est. Effort | Owner | Success Metric |
|---|---|---|---|---|---|
| **P0** | **Ship User-Visible Audit Trail** — Add a "View Scout Run" modal to the digest email footer and web dashboard. Show: pages visited, filters applied, reasoning chain, rejected candidates. | 2.4 Audit trail | 3 days | Eng | 80% of active users view audit trail at least once |
| **P1** | **Enable Reply-to-Refine** — Wire inbound email replies to `scout-feedback-submit` endpoint. Parse user text as prompt adjustment for next run. | 3. Delivery channels | 2 days | Eng | 30% of users enable webhook delivery |
| **P1** | **Add Webhook Delivery** — Allow users to configure a webhook URL per scout. Emit JSON payload on match. | 3. Delivery channels | 2 days | Eng | 50% reduction in "why did you send this?" support tickets |
| **P2** | **Cost Transparency Badge** — Display token/compute cost per digest in the email footer and dashboard. | 2.5 Cost transparency | 1 day | Eng | 20% increase in scout creation rate (due to templates) |
| **P2** | **Starter Scout Templates** — On signup, show 5 pre-built scouts (News, Research, Price, Launch, Mention) with one-click "Create". | 6. Scout types | 1 day | Design | |

**Why these first?**
- Audit trail is Yutori's **trust primitive** — we must match it to avoid being seen as a "black box".
- Reply-to-refine is **low-lift UX win** that leverages existing email infrastructure.
- Webhooks enable **programmatic downstream** (Zapier, custom code) — critical for power users.
- Cost transparency builds **pricing trust** before we scale usage.
- Templates reduce **onboarding friction** — Yutori's "one prompt box" is simpler than our form.

**What to skip for now:**
- Authenticated connectors (Gmail, Slack, Notion) — P2, requires OAuth infra.
- NL-to-structured scout parsing — P3, we already have form-based creation.
- iOS app — P3, web dashboard + email is sufficient for MVP.
- Live Artifacts — P3, not core to research digest use case.

## 13. What Thedi does that Yutori doesn't

1. **MAKER-lite multi-agent loop** (selector → critic → refiner → red-flag) — Yutori is single-agent per scout
2. **Structured feedback → prefs extraction** that feeds *the next run's critic prompt* — Yutori edits scout prompts directly, no learned prefs
3. **Opinionated daily-digest format** (10 items, ranked, with per-item "angle") — Yutori is monitor-style, not digest-style
4. **Cross-source fusion** (arxiv + HN + X merged into one ranked list per user) — Yutori scouts each monitor one pattern
5. **Live "Preview tomorrow's re-rank"** in the feedback chat — Yutori has no such loop-closing moment

---

## 14. Competitive cross-reference

### 14.1 Direct Competitor Comparison Table

| Feature | Yutori | Thedi | Feedly Leo | Elicit | Perplexity Pro | Zapier Interfaces | Bardeen.ai | Clay.com |
|---|---|---|---|---|---|---|---|---|
| **Primary Use Case** | General web monitoring (news, deals, research) | Research-focused daily digest | RSS/news aggregation with AI | Academic paper discovery | General search + research | No-code automation + AI | Browser automation + scraping | B2B sales intelligence |
| **Agent Architecture** | Single-agent per scout | Multi-agent loop (selector → critic → refiner) | Single-agent summarizer | Single-agent paper finder | Single-agent search | Single-agent workflow | Single-agent automation | Single-agent enrichment |
| **Audit Trail** | User-visible (pages visited, reasoning) | Thedi has `audit_log` but not user-visible | No audit trail | No audit trail | No audit trail | No audit trail | No audit trail | No audit trail |
| **Reply-to-Refine** | Yes (email + web) | Yes (feedback chat) | No | No | No | No | No | No |
| **Live Artifacts** | Yes (shareable dashboards) | No | No | No | No | No | No | No |
| **Yutori Local** | Yes (on-device automation) | No | No | No | No | No | No | No |
| **MCP Connectors** | Yes (Gmail, Slack, Notion, etc.) | No (P2 roadmap) | No | No | No | Yes (1000+ integrations) | Yes (browser extensions) | Yes (CRM integrations) |
| **Team Sharing** | Yes (view/subscribe only) | No | Yes (workspaces) | No | No | Yes (workspaces) | No | Yes (workspaces) |
| **Pricing Model** | Per-run usage | Flat subscription | Flat subscription | Flat subscription | Flat subscription | Flat subscription | Flat subscription | Flat subscription |
| **Multilingual** | English-first | English-first | Multi-language | English-first | Multi-language | Multi-language | English-first | English-first |
| **Always-On Monitoring** | Yes | Yes | Yes | No | No | No | No | No |
| **Browser Automation** | Yes (cloud-based) | No | No | No | No | Limited (premium) | Yes (extension-based) | No |
| **Multi-Agent Critique** | No | Yes | No | No | No | No | No | No |
| **Cross-Source Fusion** | No (per-scout) | Yes (arxiv + HN + X merged) | No | No | No | No | No | No |

**Key Takeaway:** Yutori is the only **general-purpose agentic scout platform** with **user-visible audit trails** and **live artifacts**. Thedi differentiates by being **deeper in research** with a **multi-agent critique pipeline**.

### 14.5 Missing Competitor: Zapier Interfaces

**Zapier Interfaces** is a direct competitor in the **no-code automation + AI agent** space that Thedi should track:
- **Feature overlap:** Both offer AI-powered web monitoring with multi-channel delivery (email, webhooks, Slack)
- **Differentiation:** Zapier is **workflow-first** (requires pre-built triggers/actions), Yutori/Thedi are **intent-first** (natural language prompts)
- **Thedi advantage:** Zapier has **no browser automation** — can't access dynamic content or logged-in sites without premium connectors
- **Thedi advantage:** Zapier has **no audit trail** — users can't verify what the agent saw or why it made decisions
- **Thedi advantage:** Zapier has **no multi-agent critique loop** — single-pass workflow execution

**Action:** Add Zapier Interfaces to the watchlist in Section 15.

### 14.6 Missing Competitor: Bardeen.ai

**Bardeen.ai** is a direct competitor in the **browser automation + AI agent** space that Thedi should track:
- **Feature overlap:** Both offer browser automation for web scraping and monitoring tasks
- **Differentiation:** Bardeen is **extension-first** (runs in browser), Yutori/Thedi are **cloud-first** (run asynchronously in background)
- **Thedi advantage:** Bardeen requires **user to be logged in** to run automations — not truly "always-on"
- **Thedi advantage:** Bardeen has **no multi-agent critique loop** — single-pass automation
- **Thedi advantage:** Bardeen has **no reply-to-refine** — users must reconfigure automations for adjustments

**Action:** Add Bardeen.ai to the watchlist in Section 15.

### 14.7 Missing Competitor: Clay.com

**Clay.com** is a direct competitor in the **data enrichment + AI agent** space that Thedi should track:
- **Feature overlap:** Both offer AI-powered data gathering from multiple web sources
- **Differentiation:** Clay is **B2B sales intelligence** focused, Yutori/Thedi are **consumer research** focused
- **Thedi advantage:** Clay has **no always-on monitoring** — users must manually trigger enrichment runs
- **Thedi advantage:** Clay has **no multi-agent critique loop** — single-pass data enrichment
- **Thedi advantage:** Clay has **no reply-to-refine** — users must reconfigure enrichment workflows

**Action:** Add Clay.com to the watchlist in Section 15.

## 15. Watchlist — things to track about Yutori

**Also track:**
- Perplexity Pro: https://www.perplexity.ai
- Feedly Leo: https://feedly.com/leo
- Elicit: https://elicit.org
- Zapier Interfaces: https://zapier.com/interfaces
- Bardeen.ai: https://www.bardeen.ai
- Clay.com: https://www.clay.com

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

**Homepage copy confirms**:
- "Scouts do handle your busywork on the web. You focus on what matters."
- "Yutori Local For tasks on logged-in websites. Run agents on any logged-in website. Credentials never leave your device."
- "Live Artifacts Create a live artifact — a website, dashboard, document, spreadsheet — that stays updated as the world changes."
- "Start for free" button visible
- "See Pricing" link visible
- Three product surfaces clearly distinguished

### 14.1 Direct Competitor Comparison Table

| Feature | Yutori | Thedi | Feedly Leo | Elicit | Perplexity Pro |
|---|---|---|---|---|---|
| **Primary Use Case** | General web monitoring (news, deals, research) | Research-focused daily digest | RSS/news aggregation with AI | Academic paper discovery | General search + research |
| **Agent Architecture** | Single-agent per scout | Multi-agent loop (selector → critic → refiner) | Single-agent summarizer | Single-agent paper finder | Single-agent search |
| **Audit Trail** | User-visible (pages visited, reasoning) | Thedi has `audit_log` but not user-visible | No audit trail | No audit trail | No audit trail |
| **Reply-to-Refine** | Yes (email + web) | Yes (feedback chat) | No | No | No |
| **Live Artifacts** | Yes (shareable dashboards) | No | No | No | No |
| **Yutori Local** | Yes (on-device automation) | No | No | No | No |
| **MCP Connectors** | Yes (Gmail, Slack, Notion, etc.) | No (P2 roadmap) | No | No | No |
| **Team Sharing** | Yes (view/subscribe only) | No | Yes (workspaces) | No | No |
| **Pricing Model** | Per-run usage | Flat subscription | Flat subscription | Flat subscription | Flat subscription |
| **Multilingual** | English-first | English-first | Multi-language | English-first | Multi-language |

**Key Takeaway:** Yutori is the only **general-purpose agentic scout platform** with **user-visible audit trails** and **live artifacts**. Thedi differentiates by being **deeper in research** with a **multi-agent critique pipeline**.

### 14.2 Missing Competitor: Perplexity Pro

**Perplexity Pro** is a direct competitor in the **research assistant** space that Thedi should track:
- **Feature overlap:** Both offer AI-powered research with source citations
- **Differentiation:** Perplexity is **search-first** (user-initiated queries), Thedi is **monitor-first** (always-on scouts)
- **Thedi advantage:** Perplexity has **no always-on monitoring** — users must manually query each time
- **Thedi advantage:** Perplexity has **no multi-agent critique loop** — single-pass search results
- **Thedi advantage:** Perplexity has **no reply-to-refine** — users must re-query for adjustments

**Action:** Add Perplexity Pro to the watchlist in Section 15.

### 14.3 Missing Competitor: Feedly Leo

**Feedly Leo** is a direct competitor in the **RSS/news monitoring** space:
- **Feature overlap:** Both offer AI-powered news monitoring with digest delivery
- **Differentiation:** Feedly Leo is **RSS-first** (requires feed sources), Yutori/Thedi are **web-first** (open web search)
- **Thedi advantage:** Feedly Leo has **no browser automation** — can't access logged-in sites or dynamic content
- **Thedi advantage:** Feedly Leo has **no audit trail** — users can't verify what Leo saw
- **Thedi advantage:** Feedly Leo has **no live artifacts** — only email digests

**Action:** Add Feedly Leo to the watchlist in Section 15.

### 14.4 Missing Competitor: Elicit

**Elicit** is a direct competitor in the **academic research** space:
- **Feature overlap:** Both offer AI-powered paper discovery and summarization
- **Differentiation:** Elicit is **paper-first** (arxiv, semantic scholar), Thedi is **multi-source** (arxiv + HN + X + news)
- **Thedi advantage:** Elicit has **no always-on monitoring** — users must manually query each time
- **Thedi advantage:** Elicit has **no multi-agent critique loop** — single-pass paper finder
- **Thedi advantage:** Elicit has **no reply-to-refine** — users must re-query for adjustments

**Action:** Add Elicit to the watchlist in Section 15.

### 8.2 Pricing Details
Homepage explicitly states **"Start for free"** and **"See Pricing"** link is visible (not waitlist-gated as of 2026-04-20).

**Pricing model**:
- **Scouts**: Billed per agent usage (per scout run), not flat subscription
- **Yutori Local**: Separate tier (on-device automation)
- **Live Artifacts**: Subscription for viewers (shareable dashboards/documents)

## 16. Product Tiers
**Observation:** Yutori's three-tier model (Scouts, Local, Artifacts) is architecturally distinct. Thedi should **not** adopt this immediately.

**Thedi's Current Model:** Flat subscription (Section 14.1).

**Recommended Action:**
- **Keep flat subscription** for next 2 weeks (P0).
- **Add usage metering** in background (P1) to prepare for per-run pricing if needed.
- **Do NOT build Yutori Local** (on-device) — requires browser extension + local infra (P3).
- **Do NOT build Live Artifacts** — not core to research digest (P3).

**Rationale:** Yutori's tiering is for **general web tasks** (booking, CRM, etc.). Thedi is **research-focused**. Adding tiers now dilutes positioning.

**Pricing Page Specifics:**
Homepage explicitly states **"Start for free"** and **"See Pricing"** link is visible (not waitlist-gated as of 2026-04-20).

**Pricing model**:
- **Scouts**: Billed per agent usage (per scout run), not flat subscription
- **Yutori Local**: Separate tier (on-device automation)
- **Live Artifacts**: Subscription for viewers (shareable dashboards/documents)

**Homepage copy confirms**:
- "Scouts do handle your busywork on the web. You focus on what matters."
- "Yutori Local For tasks on logged-in websites. Run agents on any logged-in website. Credentials never leave your device."
- "Live Artifacts Create a live artifact — a website, dashboard, document, spreadsheet — that stays updated as the world changes."
- "Start for free" button visible
- "See Pricing" link visible
- Three product surfaces clearly distinguished: Scouts, Yutori Local, Live Artifacts

**Critical architectural distinction**: Scouts and Local are not the same product. Scouts run in the cloud; Local runs on-device for privacy-sensitive workflows.

**Yutori Product Surfaces (confirmed on homepage 2026-04-20):**

| Tier | Description | Credentials | Billing |
|---|---|---|---|
| **Scouts** | Cloud-based monitoring agents | OAuth (server-side) | Per-run usage |
| **Yutori Local** | Logged-in website automation | On-device only | Separate tier |
| **Live Artifacts** | Shareable dashboards/documents | N/A (output layer) | Subscription for viewers |

## 17. Recent Announcements (2026-04-20)
**Homepage updates captured 2026-04-20**:
- **MCP Design Ecosystem** now explicitly listed as a connector framework
- **Team sharing** feature added to homepage copy ("Share with your team. Invite others to view and subscribe to your Scout findings and artifacts.")
- **Pricing page** is now live and publicly accessible ("See Pricing" link visible)
- **Three product surfaces** clearly distinguished: Scouts, Yutori Local, Live Artifacts

**Blog updates**:
- Scouts launch post (June 10, 2025) remains the primary product announcement
- No new product announcements since launch (as of 2026-04-20)

**Community gallery**:
- Homepage features "Scouts from the community" section
- Examples include news tracking, live-updating websites, reservation booking
- No peer comparison or social feed features

## 18. Trust Center & Legal
Homepage footer explicitly links to:
- **CHANGELOG**
- **PRIVACY**
- **TERMS**
- **TRUST CENTER**

This indicates Yutori has a dedicated trust infrastructure (unlike many AI startups that lack formal trust centers). Thedi should consider adding similar links for enterprise readiness.
