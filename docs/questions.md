# JusticeOps System Design: Technical Ambiguities & Logic Resolution

---

### 1. Offline Time Synchronization
* **What sounded ambiguous:** The system enforces strict "10-minute no-show" and "2-hour cancellation" rules. In an air-gapped environment, client workstation clocks often drift from the server.
* **How it was understood:** Relying on the browser's local time for business logic would lead to disputed penalties and "impossible" timestamps.
* **How it was solved:** The Angular frontend will sync with the Fastify server time on handshake. All business-critical time calculations (lockouts, penalties, and job scheduling) are performed strictly via PostgreSQL `CURRENT_TIMESTAMP` to ensure a single source of truth across the LAN.

### 2. Job Sharding Without a Message Broker
* **What sounded ambiguous:** The prompt requires a "distributed job scheduling subsystem" but specifies only PostgreSQL for persistence, excluding tools like Redis or RabbitMQ.
* **How it was understood:** We must avoid adding infrastructure complexity (Redis) in air-gapped sites where maintenance is difficult.
* **How it was solved:** Implement a "Transactional Outbox" pattern in PostgreSQL. Fastify nodes will use `SELECT ... FOR UPDATE SKIP LOCKED` to claim jobs from a `job_queue` table. This prevents multiple nodes from processing the same report or record import simultaneously.

### 3. Session Revocation in a Distributed Setup
* **What sounded ambiguous:** "One active session per user" must be enforced across a distributed node environment without a shared memory cache.
* **How it was understood:** If a user logs in at Workstation A, and then logs in at Workstation B, Node 2 must be able to invalidate Node 1’s JWT immediately.
* **How it was solved:** Store a `session_nonce` or `jti` in a `user_sessions` table. Fastify middleware will check this table on every request. When a new login occurs, the old session record is deleted/flagged, effectively "killing" the old JWT across all nodes.

### 4. Encryption Key Persistence
* **What sounded ambiguous:** "AES-256 with a locally managed key" for sensitive fields. If the server hardware fails, the data is unrecoverable without a cloud KMS.
* **How it was understood:** Security must be balanced with disaster recovery in isolated environments.
* **How it was solved:** The `MASTER_KEY` is provided via an environment variable at startup. On the first system deployment, the Admin is forced to generate a "Paper Backup" of the key. The Fastify backend will use a `pre-save` hook to encrypt data before it hits the Postgres persistence layer.

### 5. Credit Score Floor Consequences
* **What sounded ambiguous:** The system tracks credit scores (0–100), but the "hard" consequence of reaching 0 is undefined.
* **How it was understood:** A legal services system cannot simply delete a user, but it must prevent them from exhausting system resources if they are unreliable.
* **How it was solved:** If a Client’s score drops below a configurable "Throttling Threshold" (e.g., 20), the Angular UI disables the "Book New Consultation" button. The API will return a `403` with an "Account Under Review" status until an Admin manually intervenes.

### 6. The 8:00 AM Notification Spike
* **What sounded ambiguous:** Scheduled report subscriptions generate notifications at exactly 8:00 AM daily. 
* **How it was understood:** In an organization with thousands of users, firing all report generations and notifications at 08:00:00 would cause a massive CPU/IO spike on the database.
* **How it was solved:** The job scheduler will use a "Jittered Start." While the logic is triggered at 8:00 AM, the actual execution for each user is staggered randomly across a 15-minute window (08:00–08:15) to level the load.

### 7. Multi-Tenant Administrative Boundary
* **What sounded ambiguous:** Admins can be "scoped to a single organization or granted multi-tenant oversight."
* **How it was understood:** Data isolation must be enforced at the database level to prevent accidental cross-contamination of sensitive legal matters.
* **How it was solved:** Implement **Row-Level Security (RLS)** in PostgreSQL. Every table includes an `org_id`. The Fastify API sets a local session variable in the DB transaction based on the JWT's claims, ensuring the database itself prevents a scoped admin from seeing other organizations' rows.

### 8. Audit Trail vs. Data Masking
* **What sounded ambiguous:** "Logs mask personal data... while retaining an immutable audit trail."
* **How it was understood:** Standard application logs (stdout) must be safe for developers to read, but auditors need the raw data for compliance.
* **How it was solved:** Two separate streams. The Fastify logger (Pino) is configured to redact fields like `phone` and `client_name`. Conversely, a PostgreSQL `audit_log` table captures the full row-level `OLD` and `NEW` JSONB states, accessible only via the "Super Admin" role.

### 9. Arbitration State Transitions
* **What sounded ambiguous:** Disputes can be appealed and routed into arbitration, but the impact on the credit score during the dispute is unclear.
* **How it was understood:** If a lawyer is penalized for a "no-show" that they are currently disputing, the penalty shouldn't be permanent until the arbitration is closed.
* **How it was solved:** When a dispute is filed, the credit score penalty is moved to a "Pending/Escrow" state. It does not affect the user's active score until an Admin selects "Upheld" or "Overturned" in the arbitration workspace.

### 10. Rate Limiting Persistence
* **What sounded ambiguous:** Token-bucket rate limiting (20/min/user).
* **How it was understood:** If the rate limit is only stored in the Fastify node's memory, a user could bypass limits by hitting different nodes or by the service restarting.
* **How it was solved:** Rate limit "buckets" are persisted in a small PostgreSQL table `rate_limit_buckets`. This ensures that in a multi-node, air-gapped setup, the "200 per minute per organization" limit is strictly synchronized.

### 11. Idempotency Key Cleanup
* **What sounded ambiguous:** "Client-generated request keys valid for 24 hours."
* **How it was understood:** These keys prevent double-bookings during lag, but if the table grows indefinitely, query performance will degrade.
* **How it was solved:** The sharded job scheduler will run a daily "vacuum" task at 2:00 AM to delete all idempotency keys older than 24 hours from the `idempotency_registry` table.

### 12. "Milestone" vs. "Consultation" Logic
* **What sounded ambiguous:** Clients can book "consultations" or "case milestones."
* **How it was understood:** Consultations are specific time slots (e.g., 2:00 PM), whereas milestones are often deadlines that don't occupy a specific hour but affect a lawyer's workload.
* **How it was solved:** The scheduling engine treats "Consultations" as hard-blocked time and "Milestones" as weight-based capacity. A lawyer can have 5 "Milestones" due in a day, which reduces their total available "Consultation" hours proportionately via a `workload_capacity` algorithm.