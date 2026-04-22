# Saviynt — company brief for interview prep

## One-liner
Saviynt is a cloud-native Identity Security platform (IGA + PAM + ISPM converged) that governs access for human and non-human identities at Fortune 500 scale.

## Products
- **Identity Governance & Administration (IGA)** — full user lifecycle (joiner/mover/leaver), access requests, certifications, policy management. Core product, market leader positioning.
- **Privileged Access Management (PAM)** — built-in (not acquired), secures high-risk accounts, least-privilege enforcement, session monitoring. Key differentiator vs. SailPoint.
- **Application Access Governance (AAG)** — SoD enforcement across ERP/business apps (SAP, Oracle, Workday).
- **Third-Party Access Governance (TPAG)** — vendor/contractor lifecycle management.
- **Data Access Governance (DAG)** — governance over unstructured data.
- **Identity Security Posture Management (ISPM)** — launched 2025; AI-powered discovery and risk scoring across all identity types including non-human identities (NHIs) and AI agents.
- **AI Agent Identity Management** — announced Dec 2025; manages lifecycle of AI agents and MCP servers as first-class identities.

All of the above ship as one platform: **Saviynt Identity Cloud** (SaaS, cluster-based multi-tenant, 25+ global regions).

## Market position
- **Direct competitors**: SailPoint (biggest), One Identity, IBM Security Verify, Oracle IAM. Also faces Okta (IAM/SSO angle) and CyberArk (PAM angle).
- **Saviynt's wedge**: only vendor that converged IGA + PAM *by design* (not M&A), cloud-native vs. SailPoint's legacy on-prem lineage.
- **Scale**: ~$150M ARR as of end-2023; 2024 ARR grew 35%+ YoY; subscription gross margin ~80%; profitable (positive cash EBITDA) in 2024. Implies ~$200M+ ARR entering 2025.
- **Valuation**: $3B (Dec 2025, KKR-led $700M Series B).
- **Customers**: 600+ enterprise clients; 20%+ of Fortune 100; 100M+ identities secured.
- **Competitor revenue for context**: SailPoint is at ~$900M revenue, ~$12B market cap — Saviynt is ~4-5x smaller but growing faster.
- **Segments**: pure enterprise / Fortune 1000. Not mid-market.
- **Analyst standing**: Gartner Peer Insights Customers' Choice for IGA five consecutive years (most recent: Apr 2026). Also a Leader in KuppingerCole and SPARK Matrix PAM Q4 2025.

## Tech stack (inferred from job posts / architecture docs)
- **Languages**: Java (primary), Spring Framework, Groovy on Grails, Python, some React on frontend
- **Data**: MySQL/PostgreSQL, Elasticsearch, Redis, AWS Glue (ETL)
- **Messaging**: Kafka (event streaming)
- **Cloud**: AWS primary (marketplace listing, AWS Bedrock for GenAI, AWS re:Inforce gold sponsor 2025); Azure secondary; GCP referenced in job posts
- **Containers/orchestration**: Docker + Kubernetes (dedicated Sr. Kubernetes Operations Engineer role active)
- **CI/CD**: mature internal pipeline; "forklift-free" SaaS upgrades
- **Identity protocols**: SCIM, SAML, OAuth 2.0, REST APIs
- **Architecture**: cluster-based multi-tenant SaaS; data/network/service isolation per tenant; BYO key/vault support; 25+ geographic deployment sites
- **AI infra**: AWS Bedrock + Amazon Q for GenAI; "Computer Using Agent" tech for integration agent (UI automation, not just API)

## Cloud Platforms context
- Subith Shajee (your interviewer) owns **CloudOps**: tenant provisioning, network integrations with customer apps, platform stability/security, and software delivery. 20+ years of infra background; joined Saviynt ~5 years ago; rose from Director to Senior Director CloudOps.
- His team literally **spins up cloud tenants** for 600+ enterprise customers and maintains them — that is the "cloud platform" in the role title.
- Scale signals: 100M+ identities, 25+ geographic sites (data sovereignty per region), cluster-based multi-tenant SaaS. No public request-volume numbers, but the Fortune 100 customer base implies heavy 24/7 SLAs.
- $700M raise partly earmarked for "deeper integration with hyperscalers" — signals AWS/Azure infra investment ahead.
- 35%+ ARR growth means tenant provisioning velocity is accelerating; scaling automation is a real pressure.

## Recent news worth mentioning
- **2025-12**: Raised $700M at $3B valuation, KKR-led (Sixth Street, Carrick, TenEleven). Largest single round in company history. Positioned as "identity security as foundation for the AI era." ([SecurityWeek](https://www.securityweek.com/identity-security-firm-saviynt-raises-700-million-at-3-billion-valuation/), [PR Newswire](https://www.prnewswire.com/news-releases/saviynt-raises-700m-at-approximately-3b-valuation-in-kkr-led-round-to-establish-identity-security-as-the-foundation-for-the-ai-era-302636194.html))
- **2025-12**: Launched **AI Agent Identity Management** and **Agentic AI Onboarding** tool alongside the raise. ([Fintech Global](https://fintech.global/2025/12/10/saviynt-lands-700m-as-new-ai-identity-platform-launches/))
- **2025-10**: Unveiled major AI capabilities for Identity Security including ISPM, AI agent lifecycle mgmt. ([BusinessWire](https://www.businesswire.com/news/home/20251015731655/en/Saviynt-Unveils-Major-AI-Capabilities-for-Identity-Security))
- **2025 (ongoing)**: New integrations with CrowdStrike, Zscaler, Wiz, Cyera — positioning as a security ecosystem hub. ([Saviynt](https://saviynt.com/press-release/saviynt-raises-700m-in-kkr-led-round-to-establish-identity-security-as-the-foundation-for-the-ai-era))
- **2026-02**: Saviynt + Wiz partnership announced for cloud identity security. ([Saviynt blog](https://saviynt.com/blog))
- **2026-03**: Announced "Saviynt Identity Security for AI" — full product line for governing AI agents end-to-end. ([Saviynt blog](https://saviynt.com/blog))
- **2026-04**: Gartner Customers' Choice for IGA, fifth straight year. ([Saviynt](https://saviynt.com/blog))
- No public layoffs, outages, or negative news found.

## Engineering culture signals
- Small, high-impact teams: Distinguished Engineer roles described as "small, high-performance/high-impact team" — not a giant FAANG org
- Hands-on leadership expected: Distinguished/Principal Engineers write design docs *and* code
- Continuous improvement framing: Subith's own public quote — "every process and technology is bound to become obsolete; if you think it can be done better, don't hold back"
- Collaborative but execution-focused: daily standups, team problem-solving, on-time delivery emphasis
- GitHub org exists (`github.com/saviynt`) but minimal public repos — not an open-source-first culture
- Engineering blog is product/marketing-heavy; no public SRE war stories or conference talks found
- ~1,500 employees globally across 5 continents (large India engineering presence based on job postings)

## AI strategy
Saviynt has a dual AI thesis — **"Identity Security for AI" + "Identity Security by AI"**:

1. **Securing AI agents**: NHIs and AI agents now outnumber human identities 82:1 in enterprises. Saviynt treats AI agents, MCP servers, and automation scripts as first-class identity objects — with full lifecycle (registration → access → retirement), ISPM posture scoring, and runtime guardrails.
2. **AI-powered governance**: Embedded AI in access certification (reducing review fatigue), anomaly detection on access patterns, AI-driven application onboarding (Computer Using Agent that navigates UIs without APIs, reducing integration time from weeks to hours).
3. **LLM infrastructure**: Using AWS Bedrock + Amazon Q. Saviynt's president Paul Zolfaghari has publicly named Bedrock as the backbone for generative AI features.
4. **Positioning**: The $700M raise is explicitly themed "identity as the foundation for the AI era" — every sales motion and product release in 2025-2026 connects back to AI.
5. **Shadow AI blog post** (Apr 2026): "Shadow AI Is Creating the Largest Identity Blind Spot in Enterprise Security" — signals this is a GTM message they're actively pushing.

**For the interview**: The AI angle is not lip service. The $700M and the Q4 2025/Q1 2026 product cadence show genuine engineering investment. Expect questions about how you'd build/operate identity infrastructure that can handle AI agent identities at scale alongside human ones.

## Sources
- [Saviynt Identity Cloud product page](https://saviynt.com/products/the-identity-cloud)
- [Saviynt $700M raise press release](https://saviynt.com/press-release/saviynt-raises-700m-in-kkr-led-round-to-establish-identity-security-as-the-foundation-for-the-ai-era)
- [PR Newswire: $700M at $3B valuation](https://www.prnewswire.com/news-releases/saviynt-raises-700m-at-approximately-3b-valuation-in-kkr-led-round-to-establish-identity-security-as-the-foundation-for-the-ai-era-302636194.html)
- [SecurityWeek: $700M raise](https://www.securityweek.com/identity-security-firm-saviynt-raises-700-million-at-3-billion-valuation/)
- [Saviynt 2024 record results press release](https://saviynt.com/press-release/saviynt-a-global-leader-in-cloud-identity-security-achieves-record-results-for-2024)
- [Saviynt EIC Architecture solution guide](https://saviynt.com/solution-guides/saviynt-eic-architecture/)
- [Saviynt AI capabilities Oct 2025 (BusinessWire)](https://www.businesswire.com/news/home/20251015731655/en/Saviynt-Unveils-Major-AI-Capabilities-for-Identity-Security)
- [Saviynt final 2025 release AI blog](https://saviynt.com/blog/closing-out-2025-saviynts-final-release-brings-ai-innovation-full-circle)
- [Saviynt blog (all recent posts)](https://saviynt.com/blog)
- [Subith Shajee employee spotlight](https://saviynt.com/blog/saviynt-employee-spotlight-meet-subith-shajee)
- [Subith Shajee LinkedIn](https://www.linkedin.com/in/subithshajee/)
- [Saviynt Distinguished Engineer Cloud Architecture job (ZipRecruiter)](https://www.ziprecruiter.com/c/Saviynt/Job/Distinguished-Engineer,-Cloud-Architecture/-in-San-Francisco,CA?jid=a9662107e84a08e5)
- [Saviynt vs SailPoint vs Okta comparison (PeerSpot)](https://www.peerspot.com/products/comparisons/okta-workforce-identity_vs_sailpoint-identity-security-cloud_vs_saviynt)
- [Owler: Saviynt competitors and revenue](https://www.owler.com/company/saviynt)
- [Fintech Global: $700M raise + AI launch](https://fintech.global/2025/12/10/saviynt-lands-700m-as-new-ai-identity-platform-launches/)
- [IGA Gartner Customers' Choice Apr 2026](https://saviynt.com/blog/saviynt-named-a-gartner-peer-insights-customers-choice-for-identity-governance-and-administration-iga-for-fifth-straight-time)
