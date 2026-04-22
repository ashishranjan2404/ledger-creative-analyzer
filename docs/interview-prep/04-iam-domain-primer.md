# IAM / IGA Domain Primer — Principal Engineer Interview @ Saviynt
**Date:** 2026-04-21 | **Role:** Principal Engineer, Cloud Platforms

---

## 1. Core Concepts & Acronyms (one-liner each)

| Term | Definition |
|------|-----------|
| **IAM** | Identity and Access Management — umbrella for who can access what. |
| **IGA** | Identity Governance & Administration — *lifecycle* management (provisioning, access reviews, policy) on top of IAM. |
| **PAM** | Privileged Access Management — controls for admin/root-level accounts (session recording, credential vaulting, JIT elevation). |
| **SSO** | Single Sign-On — one login token reused across many apps (SAML/OIDC-based). |
| **MFA** | Multi-Factor Authentication — second factor (TOTP, push, hardware key) in addition to password. |
| **CIAM** | Customer IAM — identity for external end-users vs. workforce IAM for employees. |
| **RBAC** | Role-Based Access Control — permissions attached to roles, roles assigned to users. |
| **ABAC** | Attribute-Based Access Control — fine-grained; policy uses attributes (dept, location, data classification). More dynamic than RBAC. |
| **Zero Trust** | "Never trust, always verify" — no implicit trust based on network location; continuous re-auth + least-privilege. |
| **SCIM** | System for Cross-domain Identity Management — REST API standard for automated user provisioning/deprovisioning to SaaS apps. |
| **OAuth 2.0** | Authorization framework — delegates scoped access (e.g., "app can read your calendar") without sharing credentials. |
| **OIDC** | OpenID Connect — thin identity layer on top of OAuth 2.0; issues ID tokens (JWTs) for authentication. |
| **SAML** | Security Assertion Markup Language — XML-based SSO standard; older, enterprise-dominant, used in Workday/SAP integrations. |
| **JIT Provisioning** | Just-in-Time — user account created at first login rather than batch-pre-provisioned. |
| **SoD** | Segregation of Duties — policy that prevents one user from holding conflicting roles (e.g., can't both create and approve a PO). Core SOX/audit concept. |
| **Entitlement** | A specific permission or access right granted to an identity (e.g., "read S3 bucket X"). |
| **Role Mining** | Data-driven analysis of existing access patterns to suggest clean RBAC roles from messy entitlement data. |
| **Access Review / Certification** | Periodic campaign where managers certify "yes, this user still needs this access." Heavy compliance driver (SOX, HIPAA). |
| **IdP** | Identity Provider — issues authentication tokens (Okta, Azure AD / Entra ID, Ping, Saviynt itself). |
| **Privileged Access** | Admin-level, root, or service-account access that can do destructive things; governed separately from regular access. |
| **Ephemeral Credentials** | Short-lived secrets (e.g., AWS STS tokens, Vault leases) that expire in minutes/hours — zero standing privilege. |
| **NHI** | Non-Human Identity — service accounts, API keys, CI/CD bots, cloud service principals, AI agents. Fastest-growing identity category. |
| **ITDR** | Identity Threat Detection & Response — real-time analytics on identity behavior to detect compromised accounts (analogous to EDR for endpoints). |
| **ISPM** | Identity Security Posture Management — continuous risk scoring across your identity estate (misconfigured roles, orphaned accounts, excessive permissions). |

---

## 2. Saviynt — Enterprise Identity Cloud (EIC)

**Tagline:** Native SaaS, AI-powered, converged IGA + PAM + ISPM on one platform.

**Why it matters vs. legacy IGA (SailPoint on-prem, Oracle IM):** Saviynt was cloud-native from the start. Most competitors bolt SaaS onto legacy stacks.

### Product pillars

| Pillar | What it does |
|--------|-------------|
| **IGA** | Full lifecycle: joiner/mover/leaver automation, access requests, SoD policy, access certifications. |
| **PAM (CPAM)** | Privileged session management, credential vaulting, JIT elevation, full session recording. |
| **Application Access Governance (AAG)** | Fine-grained governance inside SAP, Salesforce, Oracle ERP — SoD at the transaction level. |
| **External Identity Management** | Third-party contractors, partners, vendors — separate lifecycle from FTE. |
| **Non-Human Identity Management** | Service accounts, AI agents, cloud principals — discovery + lifecycle. |
| **ISPM** | Continuous risk visibility — finds over-privileged accounts, orphaned access, policy drift. |
| **ITDR** | Behavioral anomaly detection — flags suspicious access patterns in real time. |

**Connector platform:** Saviynt ships 200+ out-of-box connectors (Workday, SAP, Salesforce, AWS, GCP, Azure AD, ServiceNow, etc.) plus a generic REST/SCIM connector framework. The connector layer is the operational workhorse — it is where integration engineering effort concentrates.

**Architecture:** Cluster-based multi-tenant SaaS — "isolated cluster per customer" model giving full data/network/service separation with automated CI/CD-based upgrades (no forklift upgrades for customers). Runs across 25+ global sites. Bring-your-own-key (BYOK) encryption supported.

**Compliance posture:** SOC 1, SOC 2, ISO 27001, PCI-DSS, FedRAMP Moderate ATO — the only cloud-native IGA+PAM vendor with FedRAMP Moderate. This is a strong differentiator for federal/regulated verticals.

**Analyst standing:** Recognized in Gartner Market Guide for IGA (2024); 4× Gartner Peer Insights Customers' Choice in IGA.

---

## 3. Cloud Platforms — What Operationally Matters in IAM

### Multi-tenancy model
Saviynt's "isolated cluster" model means each enterprise customer gets dedicated compute/data layers, not a shared DB with row-level isolation. This matters for:
- **Blast radius containment** — a noisy neighbor or breach in tenant A cannot touch tenant B.
- **Data residency** — cluster can be pinned to EU/APAC regions for GDPR.
- **Upgrade cadence** — automated rolling upgrades per cluster without a global change freeze.

**Interview angle:** This is closer to "siloed SaaS" than pure shared-plane multi-tenancy. You can speak to trade-offs: higher infra cost vs. isolation guarantees, and how Kubernetes + Helm charts make this operationally feasible at scale.

### High availability — "identity is IT dial-tone"
If IAM goes down, users cannot log in to anything. SLA target is 99.95%+. Design requirements:
- Active-active multi-AZ (ideally multi-region with failover < 30s)
- Auth paths (token issuance, SAML/OIDC) must be on a hot-standby critical path, separate from slower governance workflows (access reviews can lag; auth cannot)
- Cache strategy: IdP metadata, group memberships, and entitlement snapshots are heavily cached — cache invalidation on policy changes is a hard problem

### Scale numbers (order of magnitude for context)
- Large enterprise: 100K–500K identities under management
- Auth requests: large IdPs process **50K–500K authentications/sec** at peak (Okta, Azure AD scale; Saviynt's IGA tier is lower — provisioning/governance events are lower-frequency than auth)
- Access certification campaigns: can generate millions of "certify or revoke" items in a single annual campaign run — batch processing architecture matters here
- Connector sync jobs: 10K–100K users × 200 apps = O(10M) entitlement records to reconcile nightly

### Compliance & data residency
- **SOC 2 Type II**: annual audit of security/availability controls; every cloud platforms engineer lives with this
- **FedRAMP Moderate**: US federal; strict controls on where data lives, who can access, FIPS 140-2 crypto
- **GDPR**: EU data cannot leave EU — drives regional cluster topology decisions
- **HIPAA**: healthcare; access audit logs must be tamper-proof and retained (typically 6–7 years)
- **Audit log retention:** identity audit logs are legally required for extended periods; high-write, append-only, cryptographically signed log streams (think Kafka → S3 + Athena, or equivalent)

### Integrations & connector platform
The connector platform is operationally complex:
- **SCIM push** for cloud-native apps (Salesforce, Slack, GitHub)
- **LDAP/AD sync** for legacy
- **Custom REST connectors** for long-tail SaaS
- **HR system as authoritative source** (Workday/SAP HCM → drives joiner/mover/leaver)
- Connector health monitoring, retry logic, and schema drift detection are real operational problems

### Secrets management / key management
- Credential vault for PAM: encrypted secrets DB, HSM-backed master keys
- BYOK: customer-managed keys in AWS KMS / Azure Key Vault
- Ephemeral credential issuance (JIT PAM): integrates with HashiCorp Vault / AWS STS
- Key rotation: PAM vault must rotate secrets without breaking active sessions

---

## 4. Your Background → IAM Intersections

| Your experience | IAM analog | Talking point |
|----------------|-----------|---------------|
| **Akamai edge** — latency-sensitive, globally distributed auth/DDoS | Auth token issuance is equally latency-critical; token caching at edge is the same problem as CDN cache TTLs | "I've operated systems where auth path latency directly hit SLA — same muscle applies to IdP token issuance paths." |
| **Tetration Analytics** — network flow anomaly detection at scale | ITDR / identity analytics: detect anomalous access patterns (user logging in at 3am from new geo, accessing 10× normal resources) | "Tetration's behavioral baselining is conceptually identical to identity anomaly detection — I can bring that modeling thinking here." |
| **RL/LLM agents (Thedi)** | NHI governance — AI agents are identities that need scoped credentials, rotation, and access reviews | "I've built agentic systems; I understand the governance gap — agents need identities with least privilege and audit trails." |
| **K8s / Python / asyncio** | Connector platform workers, audit log pipelines, provisioning job queues — all K8s workloads | Direct operational experience. |
| **Cisco security background** | Zero Trust, network-level access control → now extended to identity-level | "Network Zero Trust is the infrastructure; identity is the control plane sitting above it." |

---

## 5. Hot Topics in IGA (2025–2026)

1. **NHI / Agentic Identity** — Service accounts, CI/CD tokens, and AI agent identities now outnumber human identities in enterprises. Traditional IGA was designed around humans; NHI governance requires runtime behavior analysis, not just static roles. This is the #1 unsolved problem in the space.

2. **AI for Access Review Automation** — Access certification campaigns are manual bottlenecks. AI models trained on access patterns can auto-certify low-risk routine access and surface only anomalies to reviewers (Saviynt calls this "Albus" AI; launched AI-driven access review automation in late 2025).

3. **Converged IGA + PAM + ITDR** — Vendors are consolidating: IGA (who has access), PAM (privileged sessions), and ITDR (behavioral threat detection) on one data plane. Saviynt's platform convergence is a direct response to this.

4. **Cloud Identity Sprawl** — Average enterprise has 200+ SaaS apps, each with its own identity store. Shadow IT creates ungoverned identities. Discovery + normalization across all these is an unsolved scale problem.

5. **Ephemeral / Zero Standing Privilege** — JIT PAM replacing permanent privileged accounts. Instead of a DBA having permanent prod access, they request a 4-hour elevated session that auto-expires. Engineering challenge: low-latency credential issuance under access policy evaluation.

6. **IGA for AI (not just AI for IGA)** — Governance principles applied *to* AI agents: what is this agent allowed to do, who authorized it, full audit trail. Omada, Saviynt, and SailPoint are all racing here.

---

## 6. Smart Questions to Ask the Interviewer

1. **"How is Saviynt approaching non-human and agentic identity governance — is it a separate product surface or integrated into the core IGA lifecycle engine?"**
   *(Shows you've read the market; probes product strategy depth)*

2. **"What does the connector platform look like under the hood — is it Kubernetes-based worker pools? How do you handle connector schema drift when a SaaS vendor changes their API?"**
   *(Signals operational engineering instinct, not just architectural theory)*

3. **"How do you handle access certification campaigns at scale — say a 300K-user enterprise doing annual SoD reviews? Is that batch Spark/Flink, or something else?"**
   *(Demonstrates you think about the data engineering layer, not just the UI)*

4. **"Where does Saviynt sit on the shared-plane vs. isolated-cluster spectrum for your highest-compliance (FedRAMP) customers — and what's the headroom for density optimization?"**
   *(Shows you understand the multi-tenancy cost vs. compliance trade-off)*

---

## Quick Competitive Map

| Vendor | Position |
|--------|---------|
| **SailPoint** | Market-share leader; strong on-prem + IdentityNow SaaS; ServiceNow partnership |
| **Saviynt** | Cloud-native, converged IGA+PAM, FedRAMP differentiator |
| **Okta** | AuthN/AuthZ leader (IdP layer); IGA is lighter; Workforce + CIAM |
| **CyberArk** | PAM leader; expanding into IGA |
| **Microsoft Entra ID** | Azure AD + ID Governance; wins by bundling with M365 |
| **One Identity / IBM / Oracle** | Legacy enterprise; on-prem heavy |

---

## One-Paragraph Elevator Version

> "IGA is the system that governs who has access to what across an enterprise — not just granting access at hire, but reviewing it periodically, enforcing separation-of-duties, and revoking it at offboarding. PAM layers on top for high-risk admin accounts. Saviynt's differentiation is a cloud-native, converged platform that handles IGA + PAM + behavioral threat detection in one data model, with a strong FedRAMP posture. The hot engineering problems are: multi-tenant SaaS at scale, sub-second auth path availability (it's IT dial-tone), a connector platform touching 200+ enterprise apps, and — new in 2025 — governing non-human and AI agent identities, which are now the majority of identities in modern enterprises."

---

*Sources:*
- [Saviynt Enterprise Identity Cloud](https://saviynt.com/enterprise-identity-cloud/)
- [Saviynt Platform Tenancy Architecture](https://saviynt.com/enterprise-identity-cloud/platform-tenancy-architecture)
- [Saviynt IGA Product](https://saviynt.com/products/identity-governance-and-administration)
- [Saviynt FedRAMP Compliance](https://saviynt.com/press-release/saviynt-identity-governance-as-a-service-reaches-in-process-status-with-fedramp)
- [Saviynt Trust & Security Center](https://saviynt.com/trust-compliance-security)
- [Saviynt IGA+PAM Convergence blog](https://saviynt.com/blog/the-convergence-of-iga-and-cloud-pam)
- [Gartner Peer Insights: Saviynt 4× Customers' Choice](https://saviynt.com/blog/saviynt-recognized-as-gartner-peer-insights-customers-choice-in-identity-governance-and-administration-four-years-in-a-row)
- [Non-Human Identity Governance: Why IGA Falls Short (CSA/Oasis)](https://cloudsecurityalliance.org/blog/2026/02/05/non-human-identity-governance-why-iga-falls-short)
- [Omada: State of Identity Governance 2026](https://omadaidentity.com/resources/analyst-reports/state-of-iga/)
- [Omada: Agentic AI + IGA for AI](https://www.prnewswire.com/news-releases/omada-charts-the-future-of-identity-governance-in-the-age-of-agentic-ai-302632332.html)
- [NHI Forum: Agentic AI and NHIs](https://nhimg.org/community/agentic-ai-and-nhis/discover-5-key-benefits-of-ai-in-enhancing-iga-by-2026/)
