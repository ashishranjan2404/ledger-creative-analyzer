# Substack + Beehiiv Automation APIs and Cross-Posting

**Agent 03 / Round 1 — 2026-04-19**
Audience: senior engineer scoping Thedi v2 publishing pipeline.
Scope: what is *actually* automatable end-to-end vs. what needs a human in the loop.

---

## 1. Substack publishing API

**There is no public publishing API in 2026.** Substack's official "Developer API" is read-only profile-lookup tooling that requires a creator's *public LinkedIn handle* — it cannot create, schedule, or publish posts ([Substack, "Substack Developer API"](https://support.substack.com/hc/en-us/articles/45099095296916-Substack-Developer-API)).

Available options, ranked by reliability:

| Path | Mechanism | TOS risk | Reliability |
|---|---|---|---|
| **Manual paste into Substack editor** | Human copy/paste of pre-drafted markdown | None | High |
| **RSS / cross-platform import** | One-time content import from Beehiiv, Ghost, WordPress, etc. ([Substack import docs](https://support.substack.com/hc/en-us/articles/360037830351)) | None | High, but **import-only**, not ongoing publish |
| **Reverse-engineered internal API** | E.g. `jakub-k-slys/substack-api` ([GitHub](https://github.com/jakub-k-slys/substack-api), [PyPI substack-api](https://pypi.org/project/substack-api/)) hits Substack's web-app endpoints with session cookies. Supports draft creation, publish, Notes posting. | **High.** Substack TOS explicitly bans "crawl, scrape, or spider … through manual or automated means" and processes "activated while you are not logged in" ([Substack TOS](https://substack.com/tos)). Could break or get the account flagged at any time. | Medium; brittle to UI changes |
| **Browser automation (Playwright)** | Driving the editor as a logged-in user | Same TOS concern (`auto-responder`, "processes that run while you are not logged in") but harder to detect | Medium; flaky |
| **Email-to-publish / Zapier / Make** | No native email-to-publish on Substack. Zapier's Substack actions are limited to *reading* publication data, not posting. | Low | Not a real publish path |

**Native scheduler:** posts can be scheduled up to **3 months out** ([Substack support](https://support.substack.com/hc/en-us/articles/360037870412)). Notes scheduling shipped early 2026, capped at ~5 queued notes ([on.substack.com](https://on.substack.com/p/new-on-substack-post-templates-notes), [hartlifecoach](https://hartlifecoach.substack.com/p/you-can-finally-schedule-substack-notes)). Scheduled posts can be edited or unscheduled.

**AI policy:** Substack has *no* explicit rule against AI-assisted content. They have stated they "don't proactively monitor or remove content solely based on its AI origins" ([eWeek, 2025](https://www.eweek.com/news/top-substack-newsletters-use-ai-tech/)). Disclosure is encouraged by the community, not required. Content Guidelines (last updated 2026-03-19) target spam/coordination, not authorship method ([Substack Content Guidelines](https://substack.com/content)).

**Analytics:** No public API. Web dashboard only; CSV export of subscribers and basic post stats. The `substack-api` reverse client can scrape stats but inherits the TOS risk above.

---

## 2. Beehiiv API

**Real REST API.** Base: `https://api.beehiiv.com/v2`, OAuth-scoped, JSON ([beehiiv Developer Docs](https://developers.beehiiv.com/welcome/getting-started)).

Endpoints that matter for a publishing pipeline:

- **Create post:** `POST /publications/{id}/posts` — accepts structured `blocks[]` or raw `body_content` HTML; `status` ∈ {`draft`, `confirmed`}; `scheduled_at` (ISO 8601) for future publish; supports SEO, thumbnails, content tags, recipient targeting ([Create post reference](https://developers.beehiiv.com/api-reference/posts/create)). Scope: `posts:write`.
- **List posts:** `GET /publications/{id}/posts` with `expand=[stats]` returns email stats (recipients, delivered, opens, unique opens, open rate, clicks, unique clicks, unsubscribes, spam reports) plus web views/clicks and per-URL click breakdowns ([List posts reference](https://developers.beehiiv.com/api-reference/posts/index)).
- **Subscriptions:** create, list, get-by-email, get-by-id with `subscriptions:read` / `subscriptions:write` ([Subscriptions index](https://developers.beehiiv.com/api-reference/subscriptions/index)).
- **Real-time webhooks:** new subscription, cancellation, content publishing events ([beehiiv API & integrations](https://www.beehiiv.com/features/api-and-integrations)).

**Caveats `[important]`:**
- `body_content` HTML is sanitized — `<style>` and `<link>` tags stripped; use inline styles only.
- Either `blocks` *or* `body_content`, never both.
- The Send API and the create-post endpoint were marked **beta for Enterprise users** in mid-2025 ([beehiiv help: Send API](https://www.beehiiv.com/support/article/29286794539671); [v2 announcement](https://product.beehiiv.com/p/api-v2-daily-growth-email-mailchimp-content-import)) — verify availability against Ramesh's plan tier before designing on it. `[assumption: still gated to Scale+ in April 2026]`
- Drafts cannot have `scheduled_at`; use `status=confirmed` + `scheduled_at` to schedule.

**Native scheduler:** `scheduled_at` is an arbitrary future ISO timestamp; no documented horizon limit. Posts can be unscheduled by reverting to `draft` via the dashboard `[unverified for API update endpoint]`.

**Pricing:** Launch (free, ≤2.5k subs) **includes API access** per [beehiiv pricing](https://www.beehiiv.com/pricing) and [MailCompared 2026](https://mailcompared.com/pricing/beehiiv-pricing/). Scale ($49/mo, $43 annual) adds monetization. The Send API is Enterprise-tier.

**AI policy:** Beehiiv's [Acceptable Use Policy](https://www.beehiiv.com/aup) (updated 2025-12-19) explicitly **bans publications that "rely entirely on AI-generated material without meaningful human input"** and prohibits "AI to create repetitive material like templated listicles or generic daily content designed solely to fill inboxes." AI-assisted writing supporting a creator's original voice is allowed. **This is the strictest stance among the platforms surveyed.**

---

## 3. Cross-posting

| Target | API status | Cost | Constraints |
|---|---|---|---|
| **LinkedIn (Posts)** | Official Posts API; supports text, images, video, links. ~100 calls/day per member ([Microsoft Learn: LinkedIn rate limits](https://learn.microsoft.com/en-us/linkedin/shared/api-guide/concepts/rate-limits); [Zernio LinkedIn Posting Guide 2026](https://zernio.com/blog/linkedin-posting-api)). OAuth 2.0 with `w_member_social` scope. | Free | Algorithm punishes >1–2 posts/day per page. |
| **LinkedIn (Articles / Newsletters)** | **No API**. Newsletters must be authored in-product. ([Zernio](https://zernio.com/blog/linkedin-posting-api)) | — | Disqualifies LinkedIn newsletters from Thedi automation. |
| **X / Twitter** | Pay-per-use is the default for new devs since **2026-02-06**: $0.01 per post created, $0.005 per read ([Postproxy X API Pricing 2026](https://postproxy.dev/blog/x-api-pricing-2026/); [Sorsa](https://api.sorsa.io/blog/twitter-api-pricing-2026)). Legacy Basic ($100/mo) closed to new signups. | ~$5/mo for ~500 tweets | Cheap *if* you can stomach the credits-prepay UX. |
| **Hacker News** | Official API is **read-only** (Firebase) ([HackerNews/API](https://github.com/HackerNews/API)). No submission API. Manual submission only; automated posting violates HN site etiquette. | Free | Human-in-the-loop forever. |

**LinkedIn AI policy:** No prohibition on AI-assisted posts. LinkedIn now opt-out trains on member content by default ([LinkedIn Help: Update to terms](https://www.linkedin.com/help/linkedin/answer/a8059228); [Help Net Security](https://www.helpnetsecurity.com/2025/09/18/linkedin-ai-data-privacy-policy/)). No platform-mandated disclosure label, though community/regulatory pressure for AI-content labels is rising ([Baretz+Brunelle: LinkedIn AI Disclosures](http://view.ceros.com/baretz-brunelle/linkedin-social-media-implementing-ai-content-disclosures)).

---

## 4. Comparison table

| Dimension | Substack | Beehiiv |
|---|---|---|
| **Public API for publishing** | None (official); reverse-engineered libs only | **Yes**, REST, OAuth-scoped |
| **Draft / schedule / publish via API** | Not officially supported | `POST /posts` with `status` + `scheduled_at` |
| **Native scheduler horizon** | 3 months for posts; ~5 Notes | Arbitrary ISO timestamp |
| **Analytics via API** | None official | Per-post opens/clicks/unsubs + per-URL breakdowns |
| **Cross-post primitives** | Substack Notes (manual or scheduled) | API can drive a cross-post workflow externally |
| **AI-content policy** | No prohibition; no disclosure required | **Bans wholly-AI publications**; AI-assist with human voice allowed |
| **Cost (≤2.5k subs)** | Free; 10% rev share on paid | Free (Launch); API included |
| **Paid-tier monetization** | Built-in, frictionless | Built-in on Scale ($49/mo) |
| **TOS risk if automated** | **High** for any non-import automation | Low — automation is the product |

---

## 5. Recommendation for Thedi

**Publish on Substack. Automate against Beehiiv as a staging surface.** Concretely:

1. Ramesh's *audience-facing* publication stays on **Substack** because (a) his stated goal is a Substack and (b) Substack's network effects (Notes, recommendations, paid-subs UX) materially help "build follower network." Forcing him to Beehiiv to fit our automation is tail-wagging-dog.
2. Thedi v2's pipeline writes **drafts as Beehiiv posts via API** (`status=draft`) — Beehiiv becomes the *content CMS* with version history, scheduled-publish primitives, and analytics for free. Voice-preservation review happens in Beehiiv's editor.
3. **Manual hop to Substack:** Ramesh copies the approved draft into Substack's editor and hits Schedule. Thinnest possible automation surface for the load-bearing voice-preservation step. Estimated 5–10 min/post — well inside the 2 hr/week budget.
4. Optional: Thedi auto-posts a **Substack Note** + **LinkedIn Post** (LinkedIn API) + **X tweet** (pay-per-use, ~$0.01) referencing the published Substack URL, after Ramesh confirms publish. This is the only network the automation should touch directly because all three have low TOS risk for short syndication posts.
5. **Do not** attempt direct Substack publish via reverse-engineered API. The TOS clause against automation + the catastrophic cost of an account ban for a future-boss project = unacceptable risk.

**Why not Beehiiv as the front door?** Their AUP explicitly disqualifies "publications that rely entirely on AI-generated material without meaningful human input" — Thedi's design must keep Ramesh as the editorial voice anyway, so this is fine, but it underscores that the AI-assist framing must hold up to scrutiny on either platform. Substack's silence is the safer regulatory surface in 2026 `[assumption: holds through 2026]`.

**The thinnest automation surface:** Thedi v1's research scout + a Beehiiv draft writer + Ramesh's manual paste-and-schedule. No reverse-engineering, no Playwright, no babysitting.

---

## 6. Signals to watch

- **Substack ships an official write API.** Would collapse the Beehiiv-as-CMS hop. Watch [Substack changelog](https://on.substack.com/) and developer support pages.
- **Substack adds an explicit AI-disclosure rule.** Would force Thedi to bake disclosure into every post template. Watch [Substack Content Guidelines](https://substack.com/content) revision dates.
- **Beehiiv removes Enterprise-only gating on Send API / create-post endpoint.** Would let a Launch-tier account (free) host the full Thedi pipeline.
- **LinkedIn opens a Newsletters/Articles API.** Would unlock a parallel distribution surface that matches the long-form format.
- **X reverses pay-per-use** or reintroduces a real free tier. Would change cross-post economics from "negligible" to "zero."
- **Reverse-engineered Substack libraries get cease-and-desisted** or accounts banned. Would confirm our decision to avoid that path.
- **HN policy on AI-generated submissions tightens.** Even though Thedi only suggests HN posts manually, broader AI-content sentiment shifts inform the voice-preservation guardrail.
