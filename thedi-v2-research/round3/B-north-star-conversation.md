# Thedi v2 — Year-1 North Star: three scenarios for you to pick from

*One-page brief from Ashish, 2026-04-19. Goal: before I write v2, pick the Year-1 metric we're optimizing for. The three paths build different products — paywall UX vs. sponsor analytics vs. funnel attribution. Picking now saves a re-architecture in month 6.*

---

## TL;DR

Your stated goal — "build follower network, overtime make money through paid subs" — is three different Year-1 builds depending on which phrase we anchor on. Below is the honest math for each, the assumptions behind it, and what v2 has to look like under each. Pick one and I'll build it; don't pick and I'll build a compromise that serves none of them well.

All three assume you hit **~3,000–5,000 free subs by month 12** (roughly 50th–60th percentile for a senior-IC technical newsletter in this niche, weekly cadence, LinkedIn cross-posting, no pre-existing large audience). Tag this range as `[assumption]` — it's triangulated from Substack/Pragmatic-Engineer-style retros, not a hard distribution.

---

## The three scenarios

Shared assumptions (ranges, not point estimates):

- **Free subs at month 12:** 3,000–5,000 `[assumption, 50th–60th pct for this niche]`
- **Engaged-open rate:** 40–55% for senior-IC technical lists (higher than consumer newsletters)
- **Substack free→paid conversion:** 1–3% median, 3–5% good, 5%+ outlier (cited: Simon Owens; Substack's own 5–10% marketing is above real-world median)
- **Annualized paid ARPU:** ~$7–8/mo after annual discounts + churn
- **Engineer-newsletter CPM:** $40–60 median `[vendor-sourced, inflation risk]`; value-based placement on 5K engaged B2B list: $500–2,000/slot
- **Advisory/fractional engagement value:** $10–25K per engagement for a Principal Engineer `[assumption, anchored to 2025–26 fractional-CTO market]`

### Scenario A — Paid-subs-primary

| Path | Year-1 monthly revenue |
|---|---|
| Low (1% × $7, 3K subs) | **~$210/mo** |
| Mid (2% × $7, 4K subs) | **~$560/mo** |
| High (4% × $10, 5K subs) | **~$2,000/mo** ← 80th-pct |

**Honest Year-1 expectation: $200–600/mo.** Hitting the $2K ceiling requires both a top-decile sub curve *and* top-decile conversion. Paywalls throttle organic growth in months 1–9, which is when the compounding asset is forming — so this scenario usually *lowers* the month-12 sub count relative to the other two.

### Scenario B — Sponsorship-primary

| Path | Year-1 monthly revenue |
|---|---|
| Low (1 slot, 50% fill, $40 CPM, 3K subs) | **~$240/mo** |
| Mid (1 slot/week, 75% fill, $50 CPM, 4K subs) | **~$600/mo** |
| High (2 slots/week filled, $60 CPM, 5K subs, +value-based premium) | **~$2,400/mo** |

**Honest Year-1 expectation: $400–900/mo**, ramping from ~$0 in months 1–4 (sponsors won't touch <1K engaged-open lists) to run-rate by month 10–12. Requires demonstrable audience quality (senior-IC disclosed) and an analytics dashboard sponsors can read. Upside extends into Year 2 more cleanly than Scenario A.

### Scenario C — Advisory/consulting-funnel-primary

| Path | Year-1 value |
|---|---|
| Low (0 engagements) | **$0** |
| Mid (1 × $15K advisory) | **$15,000 one-time** |
| High (1 retainer + 1 advisory) | **$30–50K** |

Newsletter has **no direct revenue** in this scenario. It's a top-of-funnel attribution asset: reader → LinkedIn DM / discovery call → paid engagement. Attribution is noisy but real; the compounding asset is *name recognition* in the agentic-DevOps niche, measured by inbound DMs/mentions, not sub count. `[assumption]` — one closed engagement dwarfs a year of paid-sub revenue in the other two scenarios, but the conversion is non-deterministic.

---

## What each scenario changes in v2 engineering

| Build surface | A · Paid-primary | B · Sponsor-primary | C · Funnel-primary |
|---|---|---|---|
| **Platform** | Substack (paid UX is native) | Beehiiv preferred (real analytics API); Substack viable but analytics are a manual export | Either; LinkedIn cross-post is the critical surface |
| **Paywall UX** | Substack tiers + founding-member tier ($100–150/yr capped, no extra content obligation); teaser-post splits (40/60 free/paid) built into drafter | None — fully free | None — fully free |
| **Analytics** | Basic Substack dashboard sufficient | Beehiiv per-post `expand=[stats]` (opens, engaged-opens, click breakdowns); monthly "sponsor-ready audience report" auto-generated | Reader survey opt-in (role, company size, pain points); inbound attribution log |
| **Drafter focus** | Teaser/hook quality; curiosity gaps before paywall break | Sponsor-ad-slot placement (post-intro and mid-post); ad-copy-friendly structure | Bio/CTA placement in every post ("I advise on X at Y — reply to this email"); strong author-brand signals |
| **Cross-post priority** | Substack Notes (paid-conversion loop) | LinkedIn + X (broad reach → sub growth → CPM leverage) | LinkedIn *first* — that's where advisory buyers live; X and Notes secondary |
| **North-Star metric in dashboard** | Paid subs + MRR | Engaged-opens/week + slot fill rate | Inbound DMs/calls + name-mention velocity |
| **Thedi effort budget** | +2–4 hrs upfront for paywall/teaser logic | +4–6 hrs for analytics surfacing + sponsor-report generator | +1–2 hrs for survey + attribution tagging |

---

## The one question I need you to answer

**If Thedi works and we're here in 12 months with ~4,000 engaged free subs and *one* of: (a) $400/mo in paid, (b) $700/mo in sponsorships, (c) one $15K advisory engagement that came from the list — which one makes you say "this was worth it"?**

Three lines is fine. "(a) because X" or "somewhere between (b) and (c) because Y." That's the whole unblock.

---

## Ashish's opinion (not a research finding — my pick if you want one)

I'd anchor on **(C) with (B) as a free byproduct**: build v2 to maximize your advisory/speaker surface area in Year 1 (LinkedIn-first cross-posting, reader survey, bio-CTA in every post), keep it fully free so the sub curve compounds without paywall drag, and ship Beehiiv-grade analytics so that when sponsor conversations start in month 9–12 we already have the audience report ready. Paid-subs tier stays on the roadmap but as a **founding-member** tier in Year 2, not a paywalled-content tier — that keeps the Stratechery-style "support if you want, no gated content" door open without building the paywall machinery now.

Why this over (A): the math on (A) doesn't justify the engineering cost or the growth drag. $200–600/mo in Year 1 is a tip jar against the opportunity cost of one advisory engagement you'd have closed if your list were 30% bigger and fully open.

But this is your call — you know your appetite for advisory work, conference speaking, and how Saviynt would feel about either. Answer the one question above and I'll build accordingly.
