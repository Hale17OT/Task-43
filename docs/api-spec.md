# JusticeOps API Specification

## Conventions

- Base URL: `http://localhost:3000`
- API prefix: `/api`
- Auth: `Authorization: Bearer <jwt>` for protected endpoints
- Content type: `application/json` unless export endpoints return files
- Error shape (global):

```json
{
  "error": "VALIDATION_ERROR",
  "message": "Invalid input",
  "details": []
}
```

Common error codes: `BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `VALIDATION_ERROR`, `LOCKED`, `RATE_LIMITED`, `INTERNAL_ERROR`, `SERVICE_UNAVAILABLE`.

## Public Endpoints

### `GET /api/health`

- Returns service liveness.
- Response: `{ "status": "ok", "timestamp": "ISO-8601" }`

### `GET /api/time`

- Returns server time for policy-time synchronization.
- Response: `{ "serverTime": "ISO-8601" }`

### `POST /api/auth/login`

- Body: `{ "username": string, "password": string }`
- Success `200`:

```json
{
  "token": "jwt",
  "user": {
    "id": "uuid",
    "orgId": "uuid",
    "username": "string",
    "role": "client|lawyer|admin|super_admin",
    "creditScore": 50,
    "isActive": true,
    "dailyCapacity": 10
  },
  "menuPermissions": ["string"],
  "serverTime": "ISO-8601"
}
```

- Errors:
  - `422` invalid payload
  - `401` bad credentials
  - `423 LOCKED` account locked (`retryAfterSeconds` may be included)

## Authenticated Session Endpoints

### `POST /api/auth/logout`

- Auth required.
- Revokes active session nonce.
- Response: `204 No Content`

### `GET /api/auth/me`

- Auth required.
- Response:

```json
{
  "user": {
    "id": "uuid",
    "orgId": "uuid",
    "username": "string",
    "role": "string",
    "creditScore": 50,
    "isActive": true,
    "dailyCapacity": 10
  },
  "permissions": ["string"]
}
```

## Users

### `GET /api/users`

- Roles: `admin`, `super_admin`
- Query: `orgId?`, `role?`, `page?`, `limit?`
- Response: `{ data: User[], total: number }`

### `POST /api/users`

- Roles: `admin`, `super_admin`
- Body:

```json
{
  "username": "string>=3",
  "password": "string>=12 with number+symbol",
  "role": "client|lawyer|admin|super_admin",
  "orgId": "uuid",
  "dailyCapacity": 10,
  "isSessionExempt": false
}
```

- Response `201`: `{ user: { id, orgId, username, role, creditScore, isActive } }`
- Constraints:
  - only `super_admin` can create `super_admin`
  - admin can only create within own org

### `PATCH /api/users/:id`

- Roles: `admin`, `super_admin`
- Body (partial): `{ isActive?, isSessionExempt?, role?, dailyCapacity? }`
- Response: `{ user: User | null }`

### `DELETE /api/users/:id`

- Role: `super_admin`
- Response: `204`

## Organizations

### `GET /api/organizations`

- Role: `super_admin`
- Query: `page?`, `limit?`
- Response: `{ data: Organization[], total: number }`

### `POST /api/organizations`

- Role: `super_admin`
- Body: `{ "name": string, "settings"?: object }`
- Response `201`: `{ organization: Organization }`

### `PATCH /api/organizations/:id`

- Role: `super_admin`
- Body: `{ name?, settings? }`
- Response: `{ organization: Organization }`

## Lawyer Directory and Availability

### `GET /api/lawyers`

- Any authenticated user.
- Response: `{ data: [{ id, username, dailyCapacity }] }`

### `GET /api/availability`

- Any authenticated user.
- Query: `lawyerId` (required for non-empty result)
- Response: `{ slots: AvailabilitySlot[] }`

### `POST /api/availability`

- Role: `lawyer`
- Body: `{ dayOfWeek, startTime, endTime, slotDurationMin? }`
- Response `201`: `{ slot: AvailabilitySlot }`

### `PATCH /api/availability/:id`

- Role: `lawyer` (owner only)
- Body: `{ startTime?, endTime?, isActive?, slotDurationMin? }`
- Response: `{ slot: AvailabilitySlot }`

### `DELETE /api/availability/:id`

- Role: `lawyer` (owner only)
- Response: `204`

## Bookings

### `GET /api/bookings`

- Any authenticated user.
- Query: `page?`, `limit?`, `status?`, `type?`, `from?`, `to?`, `orgId?`
- Response: paginated booking list (`{ data, total }` from repository)
- Role scoping:
  - client -> own bookings
  - lawyer -> assigned bookings
  - admin -> own org
  - super_admin -> optional cross-org with `orgId`

### `GET /api/bookings/:id`

- Any authenticated user (resource ownership enforced for client/lawyer).
- Response: `{ booking: Booking }`

### `POST /api/bookings`

- Role: `client`
- Rate-limited (user + org token buckets)
- Body:

```json
{
  "lawyerId": "uuid",
  "type": "consultation|milestone",
  "scheduledAt": "ISO-8601 (required for consultation)",
  "deadlineAt": "ISO-8601 (required for milestone)",
  "weight": 1,
  "idempotencyKey": "uuid"
}
```

- Response `201`: `{ booking: Booking }`
- Behavior:
  - scoped idempotency replay supported
  - enforces credit threshold and lawyer validity
  - consultation: conflict prevention on same slot
  - milestone: daily capacity protection

### `PATCH /api/bookings/:id/confirm`

- Role: `lawyer` (assignee)
- Response: `{ booking: Booking }`

### `PATCH /api/bookings/:id/decline`

- Role: `lawyer` (assignee)
- Response: `{ booking: Booking }`

### `PATCH /api/bookings/:id/cancel`

- Role: `client` (owner)
- Body: `{ reason?: string<=500 }`
- Response: `{ booking: Booking, creditPenaltyApplied: boolean }`

### `PATCH /api/bookings/:id/complete`

- Role: `lawyer` (assignee)
- Response: `{ booking: Booking, lateDeliveryApplied: boolean }`

### `PATCH /api/bookings/:id/no-show`

- Role: `lawyer` (assignee)
- Requires 10-minute grace after scheduled start.
- Response: `{ booking: Booking, creditPenalty: -10 }`

### `PATCH /api/bookings/:id/reschedule`

- Role: `client` (owner)
- Rate-limited and idempotent.
- Body: `{ newScheduledAt: ISO-8601, idempotencyKey: uuid }`
- Response `201`: `{ newBooking: Booking }`

## Reviews and Disputes

### `GET /api/reviews`

- Any authenticated user.
- Query options: `bookingId`, `reviewerId`, `revieweeId`, `userId`, `page`, `limit`
- Access checks enforce participant/admin visibility.
- Response: paginated reviews or `{ data, total }`.

### `POST /api/reviews`

- Any authenticated user, booking participant only.
- Body: `{ bookingId, timeliness(1-5), professionalism(1-5), communication(1-5), comment? }`
- Booking must be `completed`, one review per reviewer per booking.
- Response `201`: `{ review: Review }`

### `GET /api/disputes`

- Roles: `admin`, `super_admin`
- Query: `status?`, `page?`, `limit?`
- Response: paginated disputes.

### `POST /api/disputes`

- Any authenticated user (must be reviewee).
- Body: `{ reviewId, reason(10..2000) }`
- Must be within 7-day dispute window.
- Response `201`: `{ dispute: Dispute }`

### `PATCH /api/disputes/:id/resolve`

- Roles: `admin`, `super_admin`
- Body: `{ resolution: "upheld|dismissed", notes? }`
- Response: `{ dispute: Dispute }`

## Credit

### `GET /api/credit/:userId`

- Auth required.
- Access:
  - client: self only
  - lawyer: self or own clients (shared booking)
  - admin/super_admin: broader access per tenant policies
- Query: `page?`, `limit?`
- Response: `{ creditScore, data: CreditHistoryEntry[], total }`

## Notifications

### `GET /api/notifications`

- Auth required.
- Query: `unread?`, `page?`, `limit?`
- Response: paginated notification list.

### `PATCH /api/notifications/:id/read`

- Auth required (owner).
- Response: `{ notification: Notification }`

### `PATCH /api/notifications/read-all`

- Auth required.
- Response: `204`

## Jobs and Scheduler Outputs

### `GET /api/jobs`

- Roles: `admin`, `super_admin`
- Query: `status?`, `type?`, `page?`, `limit?`
- Response: `{ data: JobWithLatency[], total }`

### `GET /api/jobs/:id`

- Roles: `admin`, `super_admin`
- Response: `{ job: JobWithLatency }`

## Reports and Subscriptions

### `GET /api/reports/dashboard`

- Roles: `admin`, `super_admin`
- Query: `from?`, `to?`, `role?`, `orgId?`
- Response:

```json
{
  "availability": 0,
  "faultRate": 0,
  "utilization": 0,
  "throughput": 0,
  "closedLoopEfficiency": 100,
  "period": { "from": "ISO", "to": "ISO" }
}
```

### `GET /api/reports/export`

- Roles: `admin`, `super_admin`
- Query: `format=csv|xlsx`, `from?`, `to?`, `role?`, `orgId?`
- Response:
  - CSV file (`text/csv`) or
  - XLSX file (`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`)

### `GET /api/report-subscriptions`

- Roles: `admin`, `super_admin`
- Response: `{ data: ReportSubscription[] }`

### `POST /api/report-subscriptions`

- Roles: `admin`, `super_admin`
- Body: `{ reportType: string, filters?: object }`
- Response `201`: `{ subscription: ReportSubscription }`

### `PATCH /api/report-subscriptions/:id`

- Roles: `admin`, `super_admin`
- Body: `{ isActive?|is_active?, filters? }`
- Response: `{ subscription: ReportSubscription }`

### `DELETE /api/report-subscriptions/:id`

- Roles: `admin`, `super_admin`
- Response: `204`

## Admin

### `GET /api/admin/system-status`

- Roles: `admin`, `super_admin`
- Response: `{ keyBackupConfirmed: boolean }`

### `POST /api/admin/confirm-key-backup`

- Roles: `admin`, `super_admin`
- Response: `{ success: true, message: "Encryption key backup confirmed" }`

### `GET /api/admin/audit-log`

- Role: `super_admin`
- Query: `page?`, `limit?`, `entityType?`, `userId?`
- Response: `{ data: AuditRow[], total: number }`

## Webhooks

### `GET /api/webhooks`

- Roles: `admin`, `super_admin`
- Org-scoped list.
- Response: `{ data: WebhookConfigMasked[] }`

### `POST /api/webhooks`

- Roles: `admin`, `super_admin`
- Body: `{ url, events: string[], secret(min 8) }`
- Response `201`: `{ webhook: WebhookConfigMasked }`

### `PATCH /api/webhooks/:id`

- Roles: `admin`, `super_admin`
- Body: `{ url?, events?, isActive? }`
- Response: `{ webhook: WebhookConfigMasked }`

### `POST /api/webhooks/:id/rotate-secret`

- Roles: `admin`, `super_admin`
- Body: `{ secret(min 8) }`
- Response: `{ webhook: WebhookConfigMasked, message: "Secret rotated successfully" }`

## Config Dictionaries and Workflow Steps

### `GET /api/config/dictionaries`

- Roles: `admin`, `super_admin`
- Query: `category?`
- Response: `{ data: ConfigDictionary[] }`

### `POST /api/config/dictionaries`

- Roles: `admin`, `super_admin`
- Body: `{ category, key, value: object }`
- Response `201`: `{ entry: ConfigDictionary }`

### `PATCH /api/config/dictionaries/:id`

- Roles: `admin`, `super_admin`
- Body: `{ value: object }`
- Response: `{ entry: ConfigDictionary }`

### `DELETE /api/config/dictionaries/:id`

- Roles: `admin`, `super_admin`
- Response: `204`

### `GET /api/config/workflow-steps`

- Roles: `admin`, `super_admin`
- Query: `workflowType?`
- Response: `{ data: WorkflowStep[] }`

### `POST /api/config/workflow-steps`

- Roles: `admin`, `super_admin`
- Body: `{ workflowType, stepOrder, name, config? }`
- Response `201`: `{ step: WorkflowStep }`

### `PATCH /api/config/workflow-steps/:id`

- Roles: `admin`, `super_admin`
- Body: `{ stepOrder?, name?, config? }`
- Response: `{ step: WorkflowStep }`

### `DELETE /api/config/workflow-steps/:id`

- Roles: `admin`, `super_admin`
- Response: `204`
