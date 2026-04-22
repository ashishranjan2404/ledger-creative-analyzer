# Question bank — Subith Shajee round
**Role:** Principal Engineer, Cloud Platforms — Saviynt  
**Interviewer:** Sr Director of Cloud Operations  
**Round context:** Operational scale + platform leadership. You passed VP Eng warmly. This round is where Subith evaluates whether you can own cloud platform reliability, make hard tradeoffs under pressure, and lead eng teams through real incidents.

---

## A. System Design

### A1. "Design an access certification (campaign) system for a 50k-employee customer running monthly" (9/10 likely)

**Hit these beats:**
- Clarify first: output format (attestations, audit trail, compliance report)? SLA on cycle completion? Reviewer experience (email, portal)?
- Volume math: 50k employees × 30 entitlements avg = 1.5M review tasks/campaign. At 30-day deadline that's ~50k tasks/day resolved, ~600/sec peak burst.
- Architecture: campaign scheduler → SQS/Kafka fan-out → worker pool (K8s Deployments, horizontal) → idempotent writes to Postgres (attestation_id as dedup key) → append-only audit log (S3/GCS, Parquet, never mutate).
- Sharding insight: shard work by manager tree, not by employee. Locality means one reviewer's 50 reports all land on the same worker — better cache hit on entitlement data.
- Failure mode: worker crashes mid-batch → at-least-once delivery + idempotency key prevents double-count. Dead-letter queue for poison-pill records.
- Connect to Ashish's work: log streaming on K8s at 3000/sec (Cisco) — same fan-out pattern. Okeanos/PrestoDB at petabyte scale — you've seen what happens when "small" per-row operations compound.
- Ask back: "What SLOs do customers contractually demand? Is there a human escalation path if a manager misses the deadline?"

---

### A2. "Design a multi-tenant secret / credential vault for a PAM SaaS — think CyberArk but cloud-native" (8/10 likely)

**Hit these beats:**
- Tenants must be cryptographically isolated: per-tenant envelope keys stored in KMS (GCP Cloud KMS or AWS KMS), data keys rotated independently.
- Storage: encrypted blobs in object store (GCS), metadata in Postgres with row-level security by tenant_id.
- Access path: vault API → authn (JWT, short-lived) → authz (RBAC policy engine, can be OPA) → KMS decrypt → return plaintext only in memory, never persisted.
- Audit: every read/write emits an event — append-only log, immutable (S3 Object Lock or GCS retention policy). This is non-negotiable for SOC2/FedRAMP.
- Rotation: scheduled rotation jobs per credential type (DB passwords, API keys, SSH keys) — async, idempotent, rollback-safe.
- Connect: Tetration Analytics collected billions of network flow records — you know what "tamper-evident append-only logs at scale" means in practice. Watchtower's event pipeline is the same pattern.
- Ask back: "Are customers air-gapped? Does the vault need to work in a disconnected cluster? That changes the KMS story dramatically."

---

### A3. "Design a connector framework — Saviynt integrates with 200+ apps (Salesforce, SAP, AD, etc.). How would you architect this?" (8/10 likely)

**Hit these beats:**
- Core abstraction: Connector interface with `provision`, `deprovision`, `reconcile`, `test_connection`. Each connector is a stateless plugin (Docker image or WASM module). Runtime loads them dynamically.
- Execution model: connector invocations are side-effecting — run them in isolated processes, not in-process. Crash-safe via worker + result callback.
- Idempotency is critical: provisioning "add user to Salesforce" must be safe to retry. Connectors report idempotency keys upstream.
- Reconciliation loop: periodic job compares IGA's view of entitlements vs what the target app actually has — drift detection. Think Kubernetes controller reconcile loop.
- Failure isolation: one broken Salesforce connector should never starve AD provisioning. Per-connector queue + circuit breaker.
- Connect: Cisco's "One Touch" migration — you led a 5-person team across heterogeneous systems with an 85% time reduction. That IS a connector/integration problem at scale. Watchtower's ML triage is also a plugin-architecture system.
- Ask back: "What's the p99 latency SLA on provisioning? Real-time (sub-second) vs eventual (minutes) changes the design completely."

---

### A4. "Design a rate limiter for Saviynt's REST API platform — multi-tenant, 1000+ customers" (7/10 likely)

**Hit these beats:**
- Token bucket per (tenant_id, api_key, endpoint) at minimum. Sliding window preferred over fixed window (avoids burst at boundary).
- Distributed state: Redis with Lua scripts for atomic increment-and-check. Single Redis node is a SPOF — use Redis Cluster or a sidecar pattern.
- Latency budget: rate limit check must add < 1ms to p99. Redis cluster local to the API gateway; no cross-region hop on the hot path.
- Tenant tiers: enterprise customers get higher limits, burst credits. Store limits in config DB, cache per-tenant config in API gateway for TTL=60s.
- Graceful degradation: if Redis is unreachable, fail open (log, don't block) vs fail closed (block, protect backend). For IGA, audit access — fail open but log is likely right.
- Connect: Cisco K8s log streaming at 3000/sec — you've built high-throughput ingestion with back-pressure. Same concern: don't let one tenant starve shared infrastructure.

---

### A5. "Design the audit log pipeline for a compliance-critical SaaS — SOC2 + FedRAMP customers" (8/10 likely)

**Hit these beats:**
- Every write to Saviynt (provisioning, de-provisioning, policy change) emits an event synchronously (Kafka, SQS, or direct S3 append) before returning 200 to the caller.
- Audit log properties: append-only, immutable (S3 Object Lock, WORM), tamper-evident (hash chaining or Merkle tree on segments).
- Fan-out: audit events feed (a) compliance reports, (b) real-time anomaly detection, (c) customer-facing audit export API.
- Retention: 7 years for FedRAMP. S3 Intelligent-Tiering: hot → warm → Glacier. Cost model matters — estimate 1KB/event × 1M events/day × 365 × 7 = ~2.5TB/year/customer.
- Search: Athena over Parquet on S3. Pre-aggregate by (actor, resource, date) for common report patterns.
- Connect: Tetration Analytics — billions of network flow records, Spark for processing. You've designed at this scale. Okeanos/PrestoDB for ad-hoc audit queries is a direct parallel.
- Ask back: "Do customers need to bring their own key (BYOK) for audit log encryption? That's a FedRAMP Level High requirement."

---

### A6. "Design a multi-region active-active IGA deployment — what does failover look like?" (7/10 likely)

**Hit these beats:**
- IGA state: policies, entitlements, provisioning jobs. Policy reads can be globally replicated (eventually consistent is fine). Provisioning writes need care.
- CRDTs or last-write-wins for policy data. Provisioning jobs: leader-per-region with fencing tokens; cross-region leader election via etcd/Zookeeper or Cloud Spanner.
- RPO vs RTO: what customers actually need. RPO=0 (no lost provisioning events) is achievable with synchronous replication to a quorum. RTO=30s (traffic fails over in 30s) is achievable with health checks + DNS failover (Route53, Cloud DNS).
- Data gravity: connector calls go to target apps (Salesforce, AD) that may not be multi-region. Failover region needs credentials for those connectors.
- Connect: Akamai's global CDN background — you understand traffic steering, anycast, and latency geography. Apply that lens to IGA failover.

---

### A7. "Design a provisioning workflow engine — approvals, parallel steps, SLA timers" (6/10 likely)

**Hit these beats:**
- State machine: each provisioning request has states (PENDING_APPROVAL → APPROVED → PROVISIONING → DONE / REJECTED / TIMED_OUT). Store state transitions as events (event sourcing).
- Durable execution: use a workflow engine (Temporal, AWS Step Functions, or homegrown with Postgres + cron) for long-running workflows that survive restarts.
- SLA timers: escalation if approver doesn't act in N hours → reminder email → auto-escalate to manager. Timer stored as a scheduled event, not a sleep loop.
- Parallel steps: provision Salesforce and AD simultaneously; converge before marking DONE. DAG of tasks.
- Connect: Watchtower — you built ML triage that reduced engineer burden 60%. Same pattern: classify → route → resolve → audit. Workflow orchestration is in your DNA.
- Ask back: "Are workflows customer-configurable (drag-and-drop) or engineer-configured? That changes whether you need a DSL or just YAML."

---

### A8. "Design a webhook / event notification system — customers subscribe to IGA events (user provisioned, access revoked, etc.)" (6/10 likely)

**Hit these beats:**
- Publisher: every IGA action publishes to an internal event bus (Kafka or GCP Pub/Sub).
- Subscription model: per-customer, per-event-type subscriptions stored in DB. Fan-out service reads from internal bus, looks up subscribers, sends to their endpoints.
- Delivery guarantees: at-least-once. Customer endpoint must be idempotent. Provide idempotency key in webhook payload (event_id).
- Retry: exponential backoff with jitter. Dead-letter after N retries → alert customer.
- Security: sign payloads with HMAC-SHA256 (customer has shared secret). HTTPS only. Validate TLS cert on customer endpoint.
- Connect: Cisco log streaming at 3000/sec via aiohttp — you've built high-throughput async delivery. Same back-pressure concern: if a customer endpoint is slow, it shouldn't block other subscribers.

---

## B. Cloud Ops / SRE Scenarios

### B1. "Tell me about a production incident you owned end-to-end. Walk me through it." (10/10 likely)

**Hit these beats:**
- Pick Watchtower or Cisco K8s streaming incident — something with clear blast radius, time pressure, and a non-obvious root cause.
- Structure: detection (how? alert, customer, monitoring?) → triage → immediate mitigation (rollback? traffic shift? feature flag?) → root cause (the actual insight) → postmortem action.
- Quantify: how many customers/requests affected, for how long, what SLA commitment was at risk.
- Show ownership: you were the one who made the call to rollback / scale out / disable the feature. Not "we decided" — "I decided and here's why."
- Show learning: what monitoring gap let this happen? What did you add to prevent recurrence?
- Avoid: vague war stories. Be specific about the technical failure — latency spike due to GC pressure, OOM on a worker, thundering herd on DB reconnect.

---

### B2. "How would you design for 99.99% availability on a cloud platform? Walk me through what that means operationally." (9/10 likely)

**Hit these beats:**
- 99.99% = 52 minutes/year downtime. Translate to error budget: with 1M requests/day, 99.99% allows ~100 failed requests/day.
- Eliminate single points of failure: every service has ≥2 replicas across AZs. No single-replica databases. Connection pooling (PgBouncer, Cloud SQL Proxy) to absorb reconnect spikes.
- Graceful degradation: define what "partial availability" means. IGA can serve read-only (policy lookups, access reviews) even if provisioning is down.
- Change management: canary deployments — 1% → 5% → 20% → 100%. Every deploy has a rollback path. Blue-green for high-risk changes (DB migrations).
- Chaos engineering: inject failures in staging. You don't find out your circuit breaker is misconfigured during a production incident.
- Connect: Akamai 5 years — you've operated at 99.99%+ on global CDN. Apply that rigor: health checks, traffic steering, degraded-mode behavior.

---

### B3. "Your largest customer calls — their provisioning is broken. How do you run the incident?" (9/10 likely)

**Hit these beats:**
- Immediately: confirm scope (is it this customer only, or all customers?). Check status page / internal dashboards before touching anything.
- Incident command: declare severity, assign roles (IC, comms, scribe). Don't let everyone debug at once — parallel tracks with clear ownership.
- Hypothesis-driven debugging: don't grep logs randomly. Form a hypothesis (connector timeout? DB overload? quota exhaustion?), check it, discard or confirm.
- Mitigation first, root cause second: if you can restore service in 10 minutes with a rollback, do it. Don't chase the bug while the customer is down.
- Comms: keep customer and account team updated every 15-20 minutes. Use template: "We are investigating X. Current impact: Y. Next update in Z minutes."
- Connect: Watchtower — you built ML triage that triaged alerts 60% faster. You know what good incident triage looks like from the building side.

---

### B4. "How do you think about capacity planning for a SaaS platform that's growing 2× YoY?" (8/10 likely)

**Hit these beats:**
- Current baseline: instrument everything — CPU, memory, DB connections, queue depth, p99 latency. Without a baseline, capacity planning is guesswork.
- Growth projection: 2× user growth does not mean 2× resource consumption if you have O(n log n) or O(n²) workloads hiding in your pipeline. Find them now.
- Load test to find the cliff: what's the actual breaking point? Run synthetic load in staging at 2× current peak. Where does p99 diverge from p50? That's your bottleneck.
- Pre-provision vs autoscale: stateful components (DB, Kafka) can't scale instantly — pre-provision 20% headroom. Stateless workers (K8s Deployments) can autoscale with HPA.
- Cost: 2× users should cost <2× infra if you're doing it right (spot instances, committed use discounts, right-sizing). Track cost-per-provisioning-event as a KPI.
- Connect: Okeanos PrestoDB — you scaled a SQL engine to petabyte-scale. You've done query plan analysis, node sizing, and cluster capacity forecasting before.

---

### B5. "Blue-green vs canary — when do you use each at identity/IGA scale?" (7/10 likely)

**Hit these beats:**
- Blue-green: full environment swap. Instant rollback (flip traffic back). Best for: high-risk DB schema changes, major version upgrades, anything where you need a clean escape hatch. Cost: doubles infra temporarily.
- Canary: gradual traffic shift (1% → 5% → 25% → 100%). Best for: feature rollouts, performance-sensitive changes where you need to observe real traffic patterns. Can't easily undo mid-canary if data was mutated.
- IGA-specific wrinkle: if your canary handles a provisioning request and the blue version handles the same user's de-provisioning request, you need consistent routing (session affinity) or both versions must be compatible.
- Database migrations with both: expand-contract pattern. Additive migrations go first (add column, backfill). Old code runs fine. Deploy new code. Then contract (drop old column).
- Connect: K8s rolling upgrades — you've done zero-downtime deploys on the K8s log streaming pipeline at Cisco. Same principles.

---

### B6. "A dependent service (say, your cloud KMS) goes down. What's your playbook?" (7/10 likely)

**Hit these beats:**
- Circuit breaker fires: stop hammering KMS, return degraded response. Cache the last-known-good decrypted credential for N minutes (time-limited, audit-logged).
- Define acceptable degradation: can provisioning proceed with cached credentials? In PAM, probably not — fail safe (deny) is better than fail open (expose plaintext).
- Blast radius: which customers / flows are affected? KMS outage in us-east-1 shouldn't block customers in eu-west-1 if you've set up cross-region key replication.
- Runbook: every external dependency has a documented degraded-mode playbook. KMS outage → use cached key (if safe) or suspend provisioning + queue requests for replay.
- Post-incident: add SLO tracking for KMS dependency. If GCP KMS breaches 99.95%, that flows through to your customer SLA — make it visible.

---

### B7. "What's your philosophy on on-call rotation design for a platform team?" (7/10 likely)

**Hit these beats:**
- On-call should be boring. If your on-call is waking up nightly, that's a product bug, not a people problem. Alert fatigue kills response quality.
- Tiered escalation: L1 (team member, handles runbook issues) → L2 (senior, handles unknown unknowns) → L3 (architect / you, handles systemic issues).
- Every page must be actionable. If a page doesn't have a runbook entry and a human action, it shouldn't exist. Automated recovery first, page as last resort.
- Postmortem culture: blameless, but not consequence-free. Every major incident gets a written postmortem. Action items have owners and deadlines.
- Connect: Watchtower reduced engineer burden 60% — that was partly about reducing alert noise and routing the right signal to the right person. Same philosophy.

---

### B8. "How do you measure platform health — what's on your executive dashboard vs your on-call dashboard?" (6/10 likely)

**Hit these beats:**
- On-call dashboard (operational): error rates by service, p99 latency, queue depths, active incidents, deployment status. Real-time, 1-minute granularity.
- Executive dashboard (business): provisioning SLA compliance (% completed in <N minutes), certification campaign completion rates, customer-facing uptime, cost per transaction. Weekly / daily aggregates.
- SLOs drive both: define SLOs (e.g., "99.9% of provisioning requests complete in < 30 seconds") → derive SLIs → alert when error budget burns too fast.
- Connect: you've built Watchtower (ML triage with observability), Tetration Analytics (metrics at scale). You understand both the pipeline and the UI layer.

---

## C. Distributed Systems Fundamentals

### C1. "Explain CAP theorem and where IGA falls on the consistency-availability spectrum." (8/10 likely)

**Hit these beats:**
- CAP: in a network partition, you choose Consistency (read reflects latest write) or Availability (always return a response, possibly stale). CA without P is not a real option in distributed systems.
- IGA reads (policy lookups): availability preferred. A stale policy read is better than a 503 during a partition. Eventual consistency, TTL-based cache invalidation.
- IGA writes (provisioning, de-provisioning): consistency required. "De-provision this user from Salesforce" must not be lost or duplicated. Use quorum writes, fencing tokens.
- Audit logs: consistency preferred. Loss of an audit event is a compliance violation. Write to a durable queue (Kafka with replication=3, acks=all) before acknowledging.
- Connect: Tetration — billions of network flow records. You've dealt with the CAP tradeoff in real pipelines: you chose availability for flow collection (tolerate duplicate/out-of-order), consistency for aggregation (deduplicate before storing).

---

### C2. "How do you handle idempotency in a provisioning system?" (8/10 likely)

**Hit these beats:**
- Idempotency key: client provides a UUID per logical operation. Server stores key in DB; on duplicate, return the stored result without re-executing.
- Scope: idempotency at the API level (HTTP request) and at the connector level (the actual Salesforce call). Both layers need it independently.
- Implementation: `INSERT INTO provisioning_requests (idempotency_key, ...) ON CONFLICT (idempotency_key) DO NOTHING RETURNING *` in Postgres. Atomic.
- TTL on idempotency keys: store for 24-48 hours. After that, same key is treated as new (edge case: explicit re-provision).
- Connector-level: "add user to group in AD" — if user is already in group, connector returns success (not error). Idempotent by design.
- Connect: Cisco K8s log streaming — at-least-once delivery with dedup. You've implemented idempotency in a high-throughput pipeline.

---

### C3. "When would you use eventual consistency for audit logs vs strong consistency?" (7/10 likely)

**Hit these beats:**
- Strong consistency for audit events: the provisioning API must not return 200 until the audit event is durably recorded. Use synchronous write to Kafka (acks=all) or transactional outbox pattern.
- Eventual consistency for audit reads: report generation, dashboards, compliance exports can lag by seconds to minutes. Use a separate read replica or analytics store.
- Transactional outbox: write the business record and the audit event in the same DB transaction (avoids distributed transaction). A separate poller publishes events to Kafka. Guarantees no lost events.
- Risk of eventual-only: if you write audit events async and the app crashes before the write, you have a compliance gap. For SOC2/FedRAMP, that's unacceptable.
- Connect: Tetration Analytics — you processed billions of flow records and needed both durability (no lost records) and scale (sub-minute analytics). Outbox + async fan-out is the pattern.

---

### C4. "Distributed tracing in a microservices platform — how do you implement it and what do you actually use it for?" (7/10 likely)

**Hit these beats:**
- Instrumentation: propagate trace context (W3C TraceContext header) across all service calls. Use OpenTelemetry SDK — language-agnostic, vendor-neutral.
- Sampling: trace 100% in dev, 1-5% in prod. Head-based sampling loses rare errors — use tail-based sampling (collect full traces, decide to keep after seeing outcome).
- Backends: Jaeger, Zipkin, or GCP Cloud Trace. Export via OTLP.
- Use cases: (a) finding which microservice added latency to a slow provisioning request, (b) correlating a user complaint to a specific trace ID in logs, (c) identifying N+1 DB query patterns.
- Connect: Watchtower — ML triage system. You needed to understand which step in the triage pipeline was slow. Distributed tracing gives you that without adding print statements.

---

### C5. "How do you handle backpressure in a high-throughput event pipeline?" (7/10 likely)

**Hit these beats:**
- Backpressure = upstream produces faster than downstream can consume. Without it, you get OOM or cascading failure.
- Kafka/SQS: natural buffer. Consumer group reads at its own pace. Monitor consumer lag — if lag grows unboundedly, you have a capacity problem, not a backpressure problem.
- Async Python (aiohttp): use semaphores to cap in-flight requests. `asyncio.Semaphore(100)` prevents runaway concurrency. Without it, you open 10k connections and die.
- Circuit breaker: if downstream is slow, stop sending. Let the queue absorb upstream writes while downstream recovers.
- Connect: Cisco aiohttp log streaming at 3000/sec — you've explicitly managed this. asyncio semaphore pattern, bounded queues, graceful shedding under load.

---

### C6. "Explain the two-phase commit problem and what you'd use instead in a cloud-native system." (6/10 likely)

**Hit these beats:**
- 2PC: coordinator sends PREPARE to all participants, waits for OK, then sends COMMIT. If coordinator crashes between PREPARE and COMMIT, participants are stuck (blocked protocol).
- Problem in cloud-native: 2PC requires synchronous coordination, kills availability, doesn't work across microservices that own their own DB.
- Saga pattern: sequence of local transactions with compensating actions on failure. No distributed lock. Each step publishes an event; next step reacts. On failure, run compensating transactions in reverse.
- For IGA provisioning: provision-in-Salesforce → provision-in-AD → mark-complete. If AD fails, run deprovision-from-Salesforce as compensation.
- Eventual consistency + idempotency + observability > 2PC for most IGA workflows.
- Connect: Cisco's One Touch migration — you orchestrated multi-step operations across heterogeneous systems. Saga is exactly the pattern you'd have used if formalizing it.

---

## D. Kubernetes / Container Platforms

### D1. "How do you design a multi-tenant K8s cluster for a SaaS platform? Namespace-per-tenant vs cluster-per-tenant?" (9/10 likely)

**Hit these beats:**
- Cluster-per-tenant: hard isolation, no noisy neighbor, separate blast radius. Cost: operational overhead scales linearly with customer count. Good for regulated (FedRAMP High) customers.
- Namespace-per-tenant: shared control plane, lower cost. Require: NetworkPolicy (no cross-namespace traffic), ResourceQuotas (no tenant starves others), RBAC (no cross-namespace API access). LimitRanges to cap per-pod resource.
- Hybrid: shared cluster for SMB customers, dedicated cluster for enterprise/regulated. Tier by contract.
- Node isolation: for sensitive workloads, use node taints + pod tolerations to ensure tenant pods land on dedicated nodes (not just dedicated namespaces).
- Connect: Cisco K8s log streaming — you've run multi-tenant K8s workloads. You've dealt with ResourceQuota constraints and NetworkPolicy design in real clusters.

---

### D2. "Walk me through how you'd do a zero-downtime rolling upgrade of a stateful service on K8s (say, a workflow engine with in-flight jobs)." (8/10 likely)

**Hit these beats:**
- Pre-upgrade: drain in-flight jobs gracefully. Set `terminationGracePeriodSeconds` high enough for the longest expected job. Use `preStop` hook to stop accepting new work.
- PodDisruptionBudget: `minAvailable: 1` ensures at least one pod stays up during upgrade. K8s won't evict the last pod.
- StatefulSet rolling update: `maxUnavailable: 1`. New pod comes up, passes readiness probe, then old pod is terminated.
- Schema migration first: run additive migration (add column) before deploying new code. Both old and new code must be compatible with the schema simultaneously. Then deploy. Then run drop-column migration.
- Connect: Cisco K8s log streaming — zero-downtime deploys at 3000 logs/sec. You know what "readiness probe not tight enough" costs in a rolling upgrade.

---

### D3. "How do you autoscale a K8s workload for a bursty certification campaign — millions of tasks over a few hours?" (7/10 likely)

**Hit these beats:**
- HPA (Horizontal Pod Autoscaler): scale on CPU/memory OR custom metrics (queue depth is better for batch workloads). Use KEDA for event-driven autoscale directly from Kafka consumer lag.
- Scale-up lag: HPA polls every 15s by default. For a bursty campaign, pre-warm workers 30 minutes before the campaign fires (scheduled scale via KEDA CronTrigger or a pre-scale job).
- Node autoscaler: pod scaling is only useful if nodes are available. Cluster Autoscaler or Karpenter provisions nodes in ~2 minutes. Build that into your capacity estimate.
- Scale-down: after campaign, scale workers back to baseline. Be careful with drain — in-flight jobs must finish.
- Connect: Okeanos PrestoDB — you've dealt with query surges on a cluster that needed elastic capacity. Same problem: burst arrival, need to scale fast, cost matters.

---

### D4. "What's your take on service mesh (Istio, Linkerd) — worth the operational overhead?" (7/10 likely)

**Hit these beats:**
- What it buys: mTLS between services (zero-trust), traffic management (canary, circuit breaking), observability (distributed tracing, metrics) — all without changing app code.
- The cost: sidecar per pod adds memory (~50-100MB each), CPU overhead (~5-10%), and operational complexity (CRDs, control plane management, upgrade path).
- When it's worth it: FedRAMP/SOC2 mandates mTLS between services → service mesh pays for itself immediately. Large cluster (100+ services) where per-service TLS config is unmanageable.
- When it's not: small cluster, team without mesh expertise, latency-sensitive path where 5% CPU overhead matters. Use K8s NetworkPolicy + app-level TLS instead.
- Position: "I'd evaluate based on compliance requirement and team capacity to operate it. At Saviynt with FedRAMP customers, mTLS is probably non-negotiable — mesh is likely the right call."

---

### D5. "How do you handle secrets management in a K8s cluster — not just K8s Secrets, but the full lifecycle?" (7/10 likely)

**Hit these beats:**
- K8s Secrets are base64, not encrypted at rest by default. Enable etcd encryption at rest. Better: use External Secrets Operator (ESO) — secrets live in Vault / GCP Secret Manager, K8s Secrets are ephemeral projections.
- Rotation: when a secret rotates in Vault, ESO auto-syncs to K8s Secret, pod picks it up via volume mount (no restart needed). Avoid hardcoded in env vars (requires restart on rotation).
- Audit: every secret read in Vault is logged. K8s audit log captures who read the Secret object. Chain these for compliance.
- Least privilege: each service account gets only the Vault path it needs. No wildcard policies.
- Connect: Cisco — you've operated K8s log streaming in production. Secret management comes up the moment you're integrating with external services (DB creds, API keys). This is lived experience.

---

## E. Python / Technical Drill

### E1. "What are the common asyncio pitfalls and how do you avoid them?" (8/10 likely)

**Hit these beats:**
- Blocking the event loop: any synchronous call (file I/O, `time.sleep`, CPU-bound work) inside a coroutine blocks all other coroutines. Fix: `asyncio.to_thread()` or `loop.run_in_executor()` for blocking ops.
- Unbounded concurrency: `asyncio.gather(*[fetch(url) for url in 10000_urls])` creates 10,000 concurrent connections. Use `asyncio.Semaphore` to cap concurrency. You've done this at Cisco at 3000/sec.
- Task cancellation: cancelled tasks raise `CancelledError` — must be caught or the cleanup code doesn't run. Use `finally` blocks or `asyncio.shield()` for critical cleanup.
- Exception swallowing: `asyncio.gather()` with `return_exceptions=True` suppresses exceptions silently. Always log or re-raise.
- Not awaiting coroutines: `coro()` creates a coroutine but doesn't run it. `asyncio.ensure_future()` or `await` is required. Python 3.10+ warns on unawaited coroutines.
- Connect: aiohttp at Cisco — you've hit every one of these in real code. The semaphore pattern and executor for blocking I/O are muscle memory.

---

### E2. "Explain the GIL and when it matters for a Python platform service." (7/10 likely)

**Hit these beats:**
- GIL (Global Interpreter Lock): CPython allows only one thread to execute Python bytecode at a time. Threading doesn't give CPU parallelism for Python code — only for I/O-bound workloads.
- When it doesn't matter: asyncio is single-threaded by design. I/O-bound services (HTTP, DB queries) spend most time waiting, not executing Python. GIL is irrelevant.
- When it matters: CPU-bound work (ML inference, serialization, compression) in a Python thread will be serialized. Use `multiprocessing` (separate processes, no GIL) or offload to C extensions (numpy, pandas — which release the GIL).
- FastAPI note: FastAPI runs async routes in the event loop but sync routes in a threadpool. Sync routes still contend on the GIL for CPU work.
- In production: Watchtower ML triage — if you're running inference in the same process as request handling, GIL becomes a bottleneck. Sidecar inference service or subprocess call is the fix.

---

### E3. "You have a FastAPI service seeing p99 latency spikes. Walk me through diagnosing it." (8/10 likely)

**Hit these beats:**
- First: is the spike correlated with traffic volume, specific endpoints, specific customers, or time of day? Dashboards first, don't assume.
- Add profiling: `py-spy` for CPU profiling without code changes. `cProfile` for offline profiling. Look for hot loops, unexpected blocking calls, or GC pauses.
- asyncio-specific: use `asyncio.get_event_loop().slow_callback_duration = 0.05` to log any event loop tick > 50ms. That's your blocking call detector.
- DB query analysis: slow query log in Postgres. Missing index on a `WHERE` clause will spike p99 under load even when p50 is fine.
- External dependency: is the spike correlated with an upstream service's latency? Distributed tracing will show this.
- Connect: Cisco K8s streaming — you've debugged aiohttp latency at 3000/sec. The slow_callback pattern and py-spy are tools you've actually used.

---

### E4. "Design a Python worker pool for processing 1M certification tasks in < 1 hour." (7/10 likely)

**Hit these beats:**
- Math: 1M tasks / 3600 seconds = ~278 tasks/sec sustained. If each task takes 200ms (connector round-trip), you need ~56 concurrent workers minimum.
- Architecture: Kafka consumer group with N pods, each running an asyncio event loop with semaphore-limited concurrency. Scale pods via KEDA on consumer lag.
- Batching: instead of 1 task = 1 coroutine, batch 10-50 tasks per connector call if the target app supports bulk APIs (many do). 10× throughput improvement.
- Checkpointing: commit Kafka offsets only after successful write to DB. At-least-once delivery. Idempotency on DB write.
- Monitoring: emit task_completed_total, task_failed_total, task_duration_seconds as Prometheus metrics. Alert on lag growing.
- Connect: Cisco 3000 logs/sec — similar envelope, similar pattern. You've tuned the semaphore ceiling and seen what happens when you set it too high (OOM) vs too low (under-utilization).

---

### E5. "What's your approach to writing testable async Python code?" (6/10 likely)

**Hit these beats:**
- Dependency injection: pass HTTP clients, DB connections, and KMS clients as constructor arguments. In tests, pass mocks. Don't instantiate in the function body.
- `pytest-asyncio`: `@pytest.mark.asyncio` for async test functions. Use `asyncio.get_event_loop()` sparingly — let pytest-asyncio manage the loop.
- Mock external I/O: `aioresponses` for mocking aiohttp calls. `AsyncMock` (Python 3.8+) for async methods. Never hit real external services in unit tests.
- Integration tests: use `testcontainers-python` to spin up real Postgres/Redis/Kafka in Docker for integration tests. Closer to production than mocks.
- Property-based testing for data pipeline code: `hypothesis` generates edge cases you wouldn't think to write. Idempotency invariants are perfect for hypothesis.

---

## F. Data / Analytics

### F1. "Your PrestoDB (Trino) cluster is running slow — a query that ran in 30 seconds now takes 5 minutes. Debug it." (8/10 likely)

**Hit these beats:**
- Explain plan first: `EXPLAIN ANALYZE <query>`. Look for unexpected full table scans, missing partition pruning, data skew (one node processing 90% of data).
- Partition pruning: if the query doesn't include the partition key in its WHERE clause, Presto reads all partitions. Big win: always filter on partition column (typically date).
- Data skew: a `GROUP BY` or `JOIN` on a skewed key (e.g., tenant_id where one tenant has 80% of data) causes one task to run 50× longer. Add a salt to the key and union results.
- Network I/O: is the cluster running on cold S3 data (no caching)? Alluxio or Raptor storage layer can 10× read performance.
- Stats freshness: Presto's cost-based optimizer uses table statistics. If they're stale (post-large-insert), `ANALYZE TABLE` refreshes them and the optimizer picks a better plan.
- Connect: Okeanos — you built and operated PrestoDB at petabyte scale at Akamai. This is direct lived experience. Name specific tuning levers you've actually pulled.

---

### F2. "When would you use a materialized view vs a pre-aggregated table vs a real-time stream aggregate?" (7/10 likely)

**Hit these beats:**
- Materialized view: compute-on-read with refresh. Best for: moderately complex queries, data changes frequently, staleness of minutes is acceptable. Postgres native or dbt.
- Pre-aggregated table: compute-on-write, read is trivial. Best for: known query patterns (e.g., provisioning counts by tenant by day), high-volume dashboards, latency budget < 100ms for reads.
- Real-time stream aggregate: Kafka Streams / Flink / Spark Structured Streaming. Best for: operational dashboards where you need < 1 minute freshness (e.g., "how many certifications completed in last 5 minutes?").
- Cost: real-time aggregation is the most expensive to build and operate. Use it only when staleness is a business problem.
- Connect: Tetration Analytics — you processed billions of flow records with Spark and needed both historical analytics and near-real-time visibility. You've made these tradeoffs with real cost implications.

---

### F3. "How would you design the data architecture for Saviynt's compliance reporting — customers need SOX, SOD, access reviews on-demand?" (7/10 likely)

**Hit these beats:**
- Separation of concerns: operational store (Postgres, normalized, optimized for writes) vs analytical store (Parquet on GCS/S3, optimized for reads).
- ETL/ELT: CDC (Change Data Capture) via Debezium from Postgres → Kafka → write to data lake. Low latency (minutes), no impact on operational DB.
- Query layer: Athena (serverless, pay-per-query) or BigQuery for ad-hoc compliance queries. Pre-aggregate common report shapes (SOD violations by week, certification completion rates) as materialized views.
- Tenant isolation: partition data by tenant_id in both S3 path (`/tenant=acme/`) and query-time filter. Row-level security in the query layer.
- On-demand vs scheduled: scheduled reports run as batch jobs (cheaper). On-demand queries need a fast query layer. Two-tier approach.
- Connect: Okeanos PrestoDB at Akamai for petabyte analytics. Same pattern at a different domain.

---

### F4. "Spark job is failing on large datasets — worker OOM. How do you fix it?" (6/10 likely)

**Hit these beats:**
- Root cause: large shuffles (wide transformations: `groupBy`, `join`, `distinct`) materialize entire partition in memory. If partition is too large → OOM.
- Fix 1: increase partition count (`spark.sql.shuffle.partitions`, default 200 is often too low for large data). More, smaller partitions → less memory per task.
- Fix 2: check for data skew. One partition with 100× more data than others → that executor OOMs. Salt the key, repartition evenly.
- Fix 3: persist intermediate DataFrames only when needed (`persist(StorageLevel.DISK_ONLY)` if memory is tight). Don't persist everything.
- Fix 4: broadcast join for small tables. If one side of a join is < 10MB, broadcast it to all executors instead of shuffling.
- Connect: Tetration Analytics — billions of network flow records, Spark. You've hit partition skew and OOM in production. Specific fix you applied: name it.

---

## G. AI in Work + AI Strategy

### G1. "How do you use AI in your day-to-day engineering work right now?" (10/10 likely)

**Hit these beats:**
- Be specific and concrete, not abstract. "Claude Code for autonomous refactoring" > "I use AI for coding."
- Daily pattern: Claude Code for code generation, test writing, PR reviews. Autonomous agents for multi-file refactors (you built spec-lesson, thedi, KubeRL — you're not just a user, you're a builder of AI-powered tools).
- High-value use cases: (a) generating boilerplate for new services (FastAPI scaffolding, K8s manifests), (b) explaining unfamiliar codebases quickly, (c) writing first-draft runbooks, (d) generating test cases from specs.
- Where it accelerates you most: context-switching cost reduction. When jumping between Python, TypeScript, YAML, SQL in the same day, AI reduces the "syntax lookup" overhead dramatically.
- Quantify: "Tasks that used to take 2 hours take 30 minutes. The bottleneck shifted from writing to reviewing."
- You built KubeRL (hackathon winner) and GRPO+LoRA on H100s — you're not just using AI, you're building with RL and LLMs.

---

### G2. "Where does AI fail you? Where do you NOT use it?" (9/10 likely)

**Hit these beats:**
- Confidently wrong: LLMs hallucinate API signatures, library versions, and security details. Always verify AI-generated infrastructure code (IAM policies, K8s RBAC) — the stakes are high.
- Stale knowledge: AI training cutoffs mean it doesn't know about the Kubernetes 1.28 deprecation you just hit. For current security advisories and CVEs, go to the source.
- Lack of context: AI can't read your company's internal ADRs, runbooks, or incident history. It generates generic solutions. You add the judgment layer.
- Security-critical code: AI-generated crypto code, authentication logic, and secret handling needs a human security review. Never ship it without one.
- Complex debugging with sparse signals: when the bug is in the interaction between three microservices and the symptom is a 2-second p99 spike every 7 minutes, AI can't help without the actual trace data.
- Position: "I treat AI as a very fast junior engineer — great at execution, needs supervision on judgment."

---

### G3. "How would you introduce AI tooling into Saviynt's cloud ops team?" (9/10 likely)

**Hit these beats:**
- Start with high-ROI, low-risk: AI-assisted incident runbook generation, log summarization for postmortems, PR description generation. No customer data, no security decisions.
- Instrument before you automate: if you don't have baseline metrics for MTTR, toil hours, and alert volume, you can't measure AI's impact. Measure first.
- Build trust incrementally: AI suggests, human approves. Gradually expand autonomy as trust is established (e.g., AI closes low-severity alerts that match known patterns — but with audit trail).
- Guardrails: PII scrubbing before sending logs to external AI. Data classification policy. Internal model deployment for sensitive data.
- Change management: run a 2-sprint pilot with 2-3 engineers. Show concrete time savings. Let the team lead the rollout — top-down mandates don't work for tooling adoption.
- Connect: Watchtower at Cisco — you built ML-assisted triage that reduced engineer burden 60%. You have a playbook for exactly this: instrument, baseline, build, measure, iterate.

---

### G4. "How do you think about the cost of LLM API calls in a production system?" (7/10 likely)

**Hit these beats:**
- Token economics: know your cost per 1M tokens for the model you're using. Claude Sonnet ~$3/M input. At 10k API calls/day × 2k tokens/call = 20M tokens/day = $60/day = $22k/year. Model selection matters.
- Caching: identical prompts should be cached (semantic cache with embedding similarity or exact-match Redis cache). For IGA, "explain this policy" for the same policy is a cacheable pattern.
- Prompt optimization: shorter prompts cost less. Strip unnecessary context. Batch small requests.
- Async + queue: LLM calls are slow (1-5s). Never block a user request on an LLM call. Async queue: return request_id immediately, process async, push result via webhook or polling.
- Fallback: if LLM is unavailable or expensive, have a rule-based fallback. Especially for safety-critical paths (access decisions should never be LLM-only).
- Connect: you've built production AI systems (Watchtower, GRPO+LoRA, KubeRL). Cost modeling is part of the design — not an afterthought.

---

### G5. "There's a proposal to use an LLM to auto-approve low-risk access requests. How do you evaluate it?" (8/10 likely)

**Hit these beats:**
- First: define "low-risk" rigorously. What's the blast radius of a false approval? In IGA, an incorrect access grant can lead to SoD violations, data breach, audit finding. The bar is very high.
- Auditability: every AI-driven approval must produce an auditable reason (not just "model said yes"). Explainability is a compliance requirement.
- False positive vs false negative tradeoff: in access management, false positive (granting wrong access) is worse than false negative (requiring human review of safe request). Tune accordingly.
- Human-in-the-loop threshold: use AI to pre-screen and rank, human to approve. Auto-approve only for truly symmetric, low-blast-radius cases (e.g., access to a publicly readable internal wiki).
- Regulatory: SOX, SOD controls may require human approval regardless of AI confidence. Check compliance requirements before building.
- Rollout: pilot with shadow mode (AI decides, human approves, compare). Measure agreement rate. Only promote to auto-approve when agreement rate > 99.5% on the pilot class.

---

### G6. "What AI/ML use cases would you prioritize for a cloud ops team in your first 6 months?" (7/10 likely)

**Hit these beats:**
- Month 1-2: observability AI. LLM summarization of incident timelines, auto-generated postmortem drafts, log anomaly detection (not LLM — classical ML is better here, faster and cheaper).
- Month 3-4: toil reduction. AI-assisted runbook execution: on-call engineer describes symptom, AI suggests runbook steps, engineer executes with one-click. Watchtower pattern.
- Month 5-6: predictive. Capacity forecasting (ML on historical usage patterns), anomaly detection on provisioning throughput (flag unusual spikes that might indicate a customer migration going wrong).
- What I'd explicitly defer: AI-driven access decisions, AI-driven incident response without human-in-the-loop. Too high stakes for month 6.
- Connect: this is literally Watchtower's architecture — you've already built this. Translate the pattern to Saviynt's domain.

---

## H. Leadership + Tech-Lead Scenarios

### H1. "Tell me about a time you disagreed with a technical decision made by a senior engineer or architect. How did you handle it?" (9/10 likely)

**Hit these beats:**
- Pick a real disagreement — something architectural (not stylistic). "I disagreed about which DB to use for the audit pipeline" > "I disagreed about naming conventions."
- Your approach: (a) get curious before getting persuasive — understand their rationale fully. (b) propose a structured comparison (pros/cons, spike/prototype). (c) make the case with data, not opinion.
- What you did: you may have been right, you may have been wrong, or you may have both been partially right. What matters is how you engaged.
- If you lost: show that you executed the decision fully once it was made. Disagreement in the room, alignment outside it.
- If you won: focus on the collaborative process, not the victory. "We converged on a better solution together."
- Saviynt relevance: principal engineers have to disagree with architects regularly. Show you do it productively.

---

### H2. "How do you mentor a mid-level engineer who's technically strong but struggles with system design?" (8/10 likely)

**Hit these beats:**
- Diagnosis first: is the gap in vocabulary (they don't know CAP theorem)? Or in approach (they jump to implementation before understanding requirements)? Different interventions.
- Teaching system design: assign them to be the design doc author on the next medium-complexity project. You review and give structured feedback on the doc, not on the code.
- Paired design sessions: work through a design problem together, narrate your thought process out loud. "I'm asking about data volume first because that drives storage choices."
- Reading list + practice: "Designing Data-Intensive Applications" + doing real LeetCode-system-design problems. But reading without application doesn't stick.
- Signal of success: they start asking "what are the failure modes?" and "what scale does this need to handle?" before jumping to implementation.
- Connect: you led a 5-person team on One Touch migration. This kind of mentoring was implicit in that role. Make it explicit.

---

### H3. "You've discovered a critical security vulnerability in a system you own. What do you do?" (8/10 likely)

**Hit these beats:**
- Severity assessment: can it be exploited externally? Is there evidence of exploitation? What data is at risk? This drives urgency.
- Immediate: if exploitable now, mitigate first (take down the endpoint, disable the feature, rotate credentials). Don't wait for a perfect fix.
- Notification: loop in security team and management immediately. Don't sit on a critical vulnerability. In a public company, there may be disclosure obligations.
- Fix and test: develop the fix, test it thoroughly, deploy via emergency change management process. This is not the time for "move fast and break things."
- Disclosure: responsible disclosure timeline (90 days if a third-party vendor is involved). Postmortem on how the vulnerability existed and wasn't caught.
- Connect: PAM/IGA systems are extremely high-value targets. Saviynt has FedRAMP customers. This question is testing whether you understand the weight of what you'd be owning.

---

### H4. "How do you build cross-team alignment when your platform initiative requires changes from 4 other teams?" (8/10 likely)

**Hit these beats:**
- Don't arrive with a solution, arrive with a problem statement. "We have a consistency problem in audit logs that affects compliance" — let the teams participate in solution design.
- Working group: small (1 rep per team), time-boxed (8 weeks to a decision), with a clear charter. Not a committee — a decision-making body.
- Manage blockers explicitly: each team's objections are legitimate. Surface them early, address them in the design, don't steamroll.
- Executive sponsor: if the initiative is blocked, escalate cleanly. "I need a decision between approach A and B by [date] or the compliance deadline slips." Make the cost of inaction explicit.
- Sequence work to minimize dependencies: what can you build that doesn't require the other teams to change? Maximize your own team's autonomy in the early phases.
- Connect: One Touch migration — you led a 5-person cross-functional team. Same playbook: clear ownership, explicit blockers, stakeholder alignment.

---

### H5. "You're leading a team and you realize a project you've been advocating for 3 months is not going to work. What do you do?" (7/10 likely)

**Hit these beats:**
- Acknowledge the signal early: don't wait for catastrophic failure. The moment the evidence shifts, update your belief. Intellectual honesty is a principal-level trait.
- Document why: write a clear retrospective. What assumption was wrong? This isn't post-mortem theater — it's organizational learning and it protects you.
- Kill it cleanly: give the team a clear decision with rationale. Ambiguity about "is the project alive?" is demoralizing. Clean kill, clear date, clear pivot.
- Preserve the work: parts of it may be salvageable as infrastructure, learnings, or contributions to a related project. Extract the value before closing.
- Forward plan: come to leadership with "project X is cancelled, here's why, and here's what we're doing instead." Not just "we failed."

---

### H6. "How do you hire for a principal/staff engineer role? What are you actually testing?" (6/10 likely)

**Hit these beats:**
- You're testing judgment, not just knowledge. Can they identify what's missing from a design? Do they ask clarifying questions before answering? Do they know when to simplify vs when to add complexity?
- Technical depth in one area: every senior candidate should have an area where they know more than you do. That's a signal of genuine experience vs pattern-matching.
- System design: are they comfortable with ambiguity? Do they drive toward a clear recommendation or wallow in "it depends"?
- Culture add: will they make the team better? Specifically: will they improve decisions in a room, mentor junior engineers, and push back constructively on bad ideas?
- What I de-weight: algorithm puzzles (test preparation, not engineering judgment). Framework familiarity (can be learned in 2 weeks).
- Red flag: candidate who can't explain a tradeoff without disclaiming every sentence. Principal engineers make decisions.

---

## I. Principal-Level Judgment

### I1. "What would your technical strategy be for Saviynt's cloud platform in the first year? First 3 years?" (9/10 likely)

**Hit these beats:**
- Year 1: learn before prescribing. First 90 days are listening. Map the current architecture, understand the failure modes customers actually experience, identify the top-5 pieces of technical debt.
- Year 1 priorities (based on IGA domain): (a) observability foundation — you can't improve what you can't measure; (b) provisioning reliability — SLA on provisioning is the core product promise; (c) multi-tenant isolation — needed for enterprise and FedRAMP growth.
- Year 2-3: platform extensibility. Connector framework modernization (plugin model). Self-service for customer admin teams. ML-assisted certification (AI summarization, risk scoring for access reviews).
- North star: Saviynt should be the platform where enterprises can trust that access is always correct, always audited, and easy to manage. Technical strategy serves that.
- Show humility: "These are hypotheses based on what I know today. I'd validate them heavily in the first 90 days."

---

### I2. "Build vs buy — how do you make that call for a platform capability?" (8/10 likely)

**Hit these beats:**
- Buy when: it's not your core competency, the market has mature solutions, and the integration cost is low. Buy monitoring (Datadog), buy observability (Honeycomb), buy CDN.
- Build when: it's core to your competitive differentiation, buy options can't meet your security/compliance requirements, or the integration cost exceeds build cost.
- IGA-specific: the connector framework IS the core product. Don't buy that. But the underlying infrastructure (K8s, managed DB, KMS) — always buy.
- Hidden costs of buy: vendor lock-in, contract negotiation cycles, feature request timelines measured in quarters, and the integration work people forget to count.
- Hidden costs of build: ongoing maintenance, team expertise requirements, the opportunity cost of what you didn't build.
- Connect: Okeanos — you built a SQL engine on top of PrestoDB rather than building from scratch. That IS a build-vs-buy decision. You chose the right abstraction layer.

---

### I3. "How do you manage technical debt in a product team that's under constant feature pressure?" (8/10 likely)

**Hit these beats:**
- Make debt visible: tech debt that lives only in engineers' heads gets ignored. Write it down (ADR, tech debt register). Attach it to business risk ("this service has no circuit breaker — next outage will cascade").
- 20% rule: negotiate with product for a sustainable allocation (15-20% of capacity) for debt reduction. Frame it as risk reduction, not housekeeping.
- Prioritize debt by blast radius: fix the debt that blocks your next 3 features first. Paying off debt that's on the critical path accelerates feature delivery — this argument lands with product.
- Strangler fig for large rewrites: don't rewrite everything at once. Route traffic incrementally from the old system to the new. Rollback is always possible.
- Connect: Cisco One Touch migration — 85% time reduction from a tooling/automation investment. That was a bet on paying off process debt. You've made and won that argument before.

---

### I4. "A VP wants to migrate from GCP to AWS in 6 months for cost reasons. How do you evaluate and respond?" (7/10 likely)

**Hit these beats:**
- Clarify the cost claim: is it TCO (total cost of ownership including migration labor), or just unit compute cost? Cloud migrations often cost more in the first year than staying would have.
- Migration cost estimate: catalog all GCP-specific dependencies (Cloud Spanner, Pub/Sub, Cloud KMS, BigQuery). Each one needs an AWS equivalent and migration plan. At 100+ services, this is quarters of work.
- Risk: cloud migrations touch every service. Done poorly, it's an extended availability risk window. Done right, it's a 12-18 month project with careful parallel running.
- Alternative: reserved instances / committed use discounts on GCP can cut 30-40% of cost without a migration. Have you modeled that?
- My recommendation: run a 2-week architecture assessment. Produce a realistic cost model (migration + run cost over 3 years). Then decide. Don't let urgency skip due diligence on an irreversible decision.

---

### I5. "How do you decide when to deprecate an API or system?" (6/10 likely)

**Hit these beats:**
- Deprecation is a product decision, not a technical one. Internal APIs: you own the migration. External/customer-facing APIs: you need a contract (sunset date, migration path, support period).
- Pre-deprecation: instrument usage. Before you deprecate, know who's calling it and how often. You can't sunset what you don't measure.
- Communication timeline: announce deprecation at T-12 months. Brown-out (returns errors intermittently) at T-3 months. Sunset at T-0. Never surprise customers.
- Migration tooling: provide an automated migration path where possible (codemod, redirect, adapter layer). Lower the activation energy.
- Don't postpone indefinitely: the cost of maintaining a deprecated API grows over time and blocks architectural evolution. Set a date and hold it.
- Connect: Cisco's One Touch migration eliminated manual deprecation processes. You've automated the migration path, which is exactly what good API deprecation looks like.

---

## J. Motivation / Culture / Why Saviynt

### J1. "Why Saviynt? Why now?" (10/10 likely)

**Hit these beats:**
- The domain is genuinely important: identity is the perimeter now. Every enterprise security failure in the last 5 years has had an identity component. IGA/PAM is not compliance theater — it's critical infrastructure.
- The market moment: post-Okta breach, post-SolarWinds, the board-level interest in IGA is at an all-time high. Saviynt is positioned to capitalize and needs platform engineering at scale to do it.
- The problem set: multi-tenant cloud platform, compliance-grade reliability, ML-assisted access decisions, connector ecosystem at scale — this is exactly the intersection of distributed systems, cloud ops, and applied AI that you want to work on.
- The stage: you have 13 years of building at Akamai and Cisco — both organizations with operational excellence deeply in their DNA. Saviynt is at a growth inflection where that rigor can have an outsized impact.
- Be specific: "The conversation with Rams confirmed that the engineering culture here values technical depth and gives principal engineers real ownership. That's what I'm optimizing for."

---

### J2. "You're coming from CDN and networking infrastructure. How do you get up to speed on the IGA domain quickly?" (9/10 likely)

**Hit these beats:**
- Domain is learnable, engineering is transferable. Multi-tenancy, SLO reliability, audit pipelines, data at scale — you've built all of these. The acronyms change, the engineering doesn't.
- Active learning plan: 30 days — read the SOC2 and FedRAMP frameworks (not just summaries), shadow customer implementation calls, read the top 5 customer support tickets. 60 days — own a small production incident end-to-end. 90 days — write your first ADR.
- IGA terminology mapping: you already understand the concepts. Entitlements = permissions/scopes. Certification campaigns = scheduled access reviews. SoD = conflict-of-interest checks. PAM = privileged account management ≈ your production secrets management work.
- Leverage AI: use Claude Code to navigate the codebase fast. You've already built tools for this (spec-lesson, claude-notebook). Domain context loading is a solved problem for you.
- Honest: "I expect to be a net negative for 30 days while I'm learning. I'm optimizing for being a strong net positive by day 90."

---

### J3. "Where do you want to be in 3 years professionally?" (8/10 likely)

**Hit these beats:**
- Honest and relevant: "I want to be the engineer that Saviynt's cloud platform is built around — deep in the architecture, known for reliability, and someone who's grown two or three strong engineers alongside me."
- Technical trajectory: Principal → Distinguished Engineer track. You know Michael Costello is the DE in the process (next round). Frame your 3-year goal as growing toward that caliber of impact.
- Not just IC: "I want to be writing the 3-year technical strategy papers, not just executing them. That requires building credibility on Saviynt's specific domain — I'm investing in that."
- Avoid: vague answers ("I want to grow") or answers that imply you'll leave ("I want to start my own company"). You want to stay and build.

---

### J4. "What's your working style and how do you like to be managed?" (7/10 likely)

**Hit these beats:**
- Self-directed, not self-isolated: you work best with clear goals and autonomy on approach. You produce design docs before asking for feedback — you show your thinking, not just ask for direction.
- Direct communication: you prefer direct feedback, even uncomfortable feedback. You'd rather know an approach is wrong in week 1 than week 8.
- Async-friendly: you work well across time zones and with written communication (ADRs, design docs, postmortems) as the primary knowledge-sharing mechanism.
- What you need from a manager: visibility into company direction (so you can make the right architectural bets), top cover when you're making a hard call, and a path to real ownership (not just advisory).
- What you don't need: daily standups to feel like you're making progress. Let the output speak.

---

*Total questions: 52. Study order recommendation: A1-A3 (most likely), B1-B3, C1-C2, D1, E1, G1-G3, H1, I1-I2, J1-J2. The rest are likely 60%+ and worth a quick scan.*
