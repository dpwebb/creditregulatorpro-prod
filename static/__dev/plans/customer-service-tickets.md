---
created: 2026-04-14T12:41:24.303Z
updated: 2026-04-14T12:45:51.064Z
---

## Summary
Add a full customer service ticket system with a new **"support"** role. Users submit support tickets and track their status. Support agents manage a ticket queue, respond to tickets, and can view user profiles for troubleshooting. Admins can oversee all tickets and manage support agent accounts.

## Database Changes

### 1. Add "support" to `user_role` enum
```sql
ALTER TYPE user_role ADD VALUE 'support';
```

### 2. Create `support_ticket` table
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| user_id | INT NOT NULL FK→users | The user who submitted the ticket |
| assigned_agent_id | INT FK→users | The support agent assigned (nullable) |
| subject | VARCHAR(255) NOT NULL | |
| description | TEXT NOT NULL | Initial description |
| category | support_ticket_category ENUM | ACCOUNT, BILLING, DISPUTE_HELP, TECHNICAL, OTHER |
| priority | support_ticket_priority ENUM | LOW, MEDIUM, HIGH, URGENT |
| status | support_ticket_status ENUM | OPEN, IN_PROGRESS, WAITING_ON_USER, RESOLVED, CLOSED |
| created_at | TIMESTAMPTZ DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ DEFAULT NOW() | |
| resolved_at | TIMESTAMPTZ | |
| region | VARCHAR(2) DEFAULT 'CA' | |

### 3. Create `support_ticket_message` table
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| ticket_id | INT NOT NULL FK→support_ticket | |
| sender_id | INT NOT NULL FK→users | User or agent who sent the message |
| sender_role | user_role NOT NULL | 'user' or 'support' (for display purposes) |
| message | TEXT NOT NULL | |
| is_internal_note | BOOLEAN DEFAULT FALSE | Internal notes only visible to agents/admins |
| created_at | TIMESTAMPTZ DEFAULT NOW() | |

### 4. Indexes
- `support_ticket(user_id, status)` — user ticket lookups
- `support_ticket(assigned_agent_id, status)` — agent queue
- `support_ticket(status, priority)` — open ticket sorting
- `support_ticket_message(ticket_id, created_at)` — message thread ordering

## Files to Modify

### `helpers/User.tsx`
- Add `"support"` to the `role` union type: `role: "admin" | "user" | "support"`
- Update the RBAC Persona-to-Role Mapping documentation comment to include the Support Agent persona
- Update the Access Control Matrix comment

### `components/ProtectedRoute.tsx`
- Add a new `SupportRoute` export: `MakeProtectedRoute(["support", "admin"])` — support agents and admins
- Update `UserRoute` to include support: `MakeProtectedRoute(["user", "admin", "support"])` — all authenticated roles can access shared pages
- Keep `AdminRoute` as admin-only
- Keep `IndividualRoute` as user-only
- Support agents should bypass subscription checks (like admin)

### `components/AppLayout.tsx`
- Add a third sidebar nav configuration for the "support" role:
  - **Support Queue** group: Home (/), Ticket Queue (/support-tickets), 
  - **Reference** group: Knowledge base items (same Legal & Rules as admin for reference)
  - **Account** group: Report a Problem (/beta-issues)
- Support agents should NOT see: admin tools (user management, compliance config, version management, parser testing, etc.), consumer dispute tools (upload, my accounts, packets, evidence, etc.)
- The global banner "You are sending these letters yourself" should NOT show for support role

### `helpers/getServerUserSession.tsx`
- Support agents (like admins) should bypass subscription plan/status — set subscriptionPlan/subscriptionStatus/trialEnd to null for support role
- Support agents should be considered to have accepted terms (like admin)

### `helpers/schema.tsx`
- Will be auto-updated after `pullSQLDatabaseSchema` — no manual edit needed

### `pages/admin-user-management`
- Add an "Add Support Agent" button/action that opens a form to create a new support agent (email, display name, temporary password)
- The form calls a new endpoint to create the support user

### `endpoints/auth/register_with_password_POST`
- Add a guard to reject registration if the requested role is "support" — support accounts can only be created by admin

## Files to Create

### Endpoints

#### `endpoints/support-ticket/list_GET`
- For "user" role: returns only their own tickets
- For "support" role: returns tickets assigned to them + unassigned open tickets
- For "admin" role: returns all tickets
- Supports filtering by status, category, priority
- Returns ticket list with latest message preview and assigned agent name

#### `endpoints/support-ticket/get_GET`
- Returns a single ticket with all messages
- Users can only view their own tickets
- Support/admin can view any ticket
- Filters out `is_internal_note` messages for user role

#### `endpoints/support-ticket/create_POST`
- Available to "user" role only
- Creates a new ticket with subject, description, category, priority (default MEDIUM)
- Status defaults to OPEN
- After creating the ticket, calls `notifyNewTicket` (fire-and-forget)

#### `endpoints/support-ticket/update_POST`
- Available to "support" and "admin" roles
- Can update: status, priority, assigned_agent_id
- Setting status to RESOLVED sets resolved_at timestamp
- After updating, calls `notifyStatusChange` if status changed to RESOLVED, and calls `notifyTicketAssigned` if assigned_agent_id changed (fire-and-forget)

#### `endpoints/support-ticket/reply_POST`
- Available to all roles (user, support, admin)
- Users can only reply to their own tickets
- Support/admin can mark message as `is_internal_note`
- Replying as support auto-sets ticket status to IN_PROGRESS if currently OPEN
- User replying to a WAITING_ON_USER ticket auto-sets status to IN_PROGRESS
- After saving the reply, calls `notifyTicketReply` with sender info (fire-and-forget). Skip notification for internal notes.

#### `endpoints/admin/create-support-agent_POST`
- Admin-only endpoint
- Accepts: email, displayName, password
- Creates a new user with role='support', skipping subscription setup
- Returns the created user info
- Sends a welcome email to the new agent with their login credentials via SendGrid

### Helpers

#### `helpers/supportTicketQueries`
- React Query hooks: `useSupportTicketList`, `useSupportTicket`, `useCreateSupportTicket`, `useUpdateSupportTicket`, `useReplySupportTicket`
- `useSupportTicketList`: includes `refetchInterval: 15000` and `refetchIntervalInBackground: false`
- `useSupportTicket`: includes `refetchInterval: 10000` and `refetchIntervalInBackground: false`
- All mutations invalidate relevant queries

#### `helpers/supportTicketNotifications`
- Functions: `notifyNewTicket`, `notifyTicketReply`, `notifyStatusChange`, `notifyTicketAssigned`
- Uses `helpers/sendGridEmail` for sending
- Queries the database to get recipient emails (e.g., all support agents for new tickets, the ticket owner for replies)
- All functions are fire-and-forget (async, errors caught and logged)
- Email body includes ticket subject, brief context, and direct link to ticket page

### Components

#### `components/SupportTicketList`
- Table/list view of tickets with columns: Subject, Category, Priority, Status, Assigned Agent, Last Updated
- Status badges with color coding (OPEN=blue, IN_PROGRESS=yellow, WAITING_ON_USER=orange, RESOLVED=green, CLOSED=gray)
- Priority badges
- Click row to navigate to ticket detail page
- Filter controls for status, category, priority
- For users: simplified view (no Assigned Agent column)

#### `components/SupportTicketDetail`
- Shows ticket header (subject, status, priority, category, created date)
- Message thread with chronological messages, distinguishing user vs agent messages visually
- Internal notes shown with a distinct "staff only" styling (only visible to support/admin)
- Reply form at bottom (textarea + send button)
- Internal note toggle checkbox (only for support/admin)
- Status/priority/assignment controls in a sidebar or header (only for support/admin)

#### `components/CreateTicketDialog`
- Form with: subject (text input), category (select), priority (select, default MEDIUM), description (textarea)
- Opens from the user's "My Tickets" page or from sidebar

### Pages

#### `pages/support-tickets` (route: /support-tickets)
- **For users**: "My Support Tickets" — list of their tickets + "New Ticket" button that opens CreateTicketDialog
- **For support agents**: "Support Queue" — all tickets in their queue with filtering
- **For admins**: "All Tickets" — full ticket overview with all filters
- Uses `UserRoute` in pageLayout (accessible to all authenticated roles)
- Uses `AppLayout` for consistent navigation

#### `pages/support-tickets.$ticketId` (route: /support-tickets/:ticketId)
- Ticket detail page with `SupportTicketDetail` component
- Uses `UserRoute` in pageLayout
- Uses `AppLayout`

## Approach

1. **Database migration**: Add enum values, create tables with indexes
2. **Pull schema**: Update `helpers/schema.tsx`
3. **Update auth layer**: Modify `User.tsx`, `getServerUserSession.tsx`, `ProtectedRoute.tsx`
4. **Update sidebar**: Modify `AppLayout.tsx` for support role nav
4.5. **Create email notification helper**: Create `helpers/supportTicketNotifications` using existing `helpers/sendGridEmail`
5. **Create all endpoints + query hooks**: All 5 endpoints + supportTicketQueries helper in one createItems call
6. **Create UI components**: SupportTicketList, SupportTicketDetail, CreateTicketDialog
7. **Create pages**: support-tickets, support-tickets.$ticketId
8. **Update system prompt**: Document the new support role

## Email Notifications

Use the existing SendGrid resource (SENDGRID_API_KEY, SENDGRID_FROM_EMAIL) via the existing `helpers/sendGridEmail` helper.

### Trigger Points
- **Ticket created** → Email to all support agents notifying them of a new ticket (query users with role='support')
- **Support agent replies** → Email to the ticket's user (not for internal notes)
- **User replies** → Email to the assigned agent (if any)
- **Status changed to RESOLVED** → Email to the ticket's user confirming resolution
- **Ticket assigned** → Email to the newly assigned agent

### Implementation
- Add a `helpers/supportTicketNotifications` helper that handles all email sending logic
- Emails should be simple text/HTML with ticket subject, a brief message, and a link to the ticket detail page (using the published domain https://xapp.compnd.systems)
- Called from within the endpoint handlers (support-ticket/create_POST, support-ticket/reply_POST, support-ticket/update_POST) after the database operations succeed
- Fire-and-forget pattern (don't block the response on email sending, catch errors and log them)

## Real-Time Updates

Since Floot doesn't support WebSocket, use **React Query polling** for near-real-time experience.

### Implementation
- `useSupportTicketList` hook: Add `refetchInterval: 15000` (15 seconds) when the page is active — support agents see new tickets quickly
- `useSupportTicket` (detail view) hook: Add `refetchInterval: 10000` (10 seconds) — messages appear within 10 seconds of being sent
- Use `refetchIntervalInBackground: false` to only poll when the tab is active (saves resources)
- The polling combined with email notifications provides a good real-time experience without WebSocket

## Risks & Considerations
- **Backward compatible**: Adding a new enum value to user_role is additive. Existing "admin" and "user" roles are unchanged. Existing endpoints that check `user.role !== 'admin'` will treat support agents like regular users for data filtering — this is correct since support agents don't own dispute data.
- **Mobile app compatibility**: No endpoint inputs/outputs are changing. New endpoints are purely additive.
- **Support account creation**: Support agents cannot self-register. Only admins can create support accounts via the admin user management page. The registration endpoint should reject attempts to register with role='support'. The admin user management page needs an 'Add Support Agent' action that creates a user with the support role directly.
