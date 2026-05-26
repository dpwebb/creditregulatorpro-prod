# Credit Regulator Pro

Create a new app "Credit Regulator Pro"
TARGET AUDIENCE: Grade 8 education level. All user-facing text must use plain, everyday language. No jargon. Short sentences. Encouraging tone.

POLICY Canada only
* Region = CA only no cross border storage
* Evidence retention = 1 year
* Terminal labels follow a 4-phase progression system; any phase can be the current terminal state. The old PROCEDURALLY EXHAUSTED - CURRENTLY label has been retired.

Tables
* user_account
* report_artifact
* bureau
* furnisher
* tradeline
* statute
* obligation
* obligation_instance
* packet
* evidence_event
Indexes
* evidence_event region at
* obligation_instance tradeline_id state

ROLES & SUBSCRIPTIONS
* Three roles: "admin" (internal staff), "user" (all consumers), and "support" (CS agent)
* No "enterprise" role - it has been removed
* Subscription plans: Trial User (internal plan key: "beta", free for 7 days), monthly ($19.95 CAD, primary plan), annual ($49.95 CAD)
* Trial User accounts have full feature access during the trial - same feature set as paid users
* The system is now in PRODUCTION MODE (production_mode = true)
* Trial User accounts can upgrade to paid subscription plans via Stripe
* New registrations receive a 7-day free trial (plan: "beta", status: "trialing")
* After the 7-day trial, users must subscribe to monthly or annual plan or account is locked
* After trial, users must subscribe or account is locked
* The anonymous upload flow (try-upload page) exists for conversion
* Billing via Stripe (integration deferred - subscription tracking is in place)
* Subscription table: subscriptions (one per user)

SUPPORT ROLE & CUSTOMER SERVICE
* Three roles: "admin", "user", "support" (CS agent)
* Support accounts created by admin only (admin/create-support-agent_POST)
* Support agents bypass subscription checks and terms acceptance
* Support agents see a dedicated sidebar: Support Queue, Reference/Legal items, Report a Problem
* Users can submit support tickets, track status, and reply
* Support agents manage ticket queue, reply, assign tickets, update status/priority
* Admins can view all tickets and manage support agent accounts
* Email notifications sent via SendGrid on ticket creation, replies, status changes, assignments
* Near-real-time UI via React Query polling (list: 15s, detail: 10s)

REPORT INGESTION PIPELINE
* DocStrange HTML extraction returns creditor names correctly in the parsed HTML response
* htmlReportParser.parseAccount() extracts creditorName from HTML tables and tags
* Creditor names are stored in the `creditor` table (via creditor_id FK) and also denormalized into `tradeline.originalCreditorName` for all tradelines (not just collection accounts)
* The `packet/build_POST` endpoint joins with the creditor table and resolves creditor name with fallback chain: creditor.name -> originalCreditorName -> "Unknown Creditor"

REPORT INGESTION PIPELINE - PARSER ARCHITECTURE:
* Bureau-specific parsing is compartmentalized into separate modules
* HTML Path (primary - DocStrange reports): bureauDetectionRouter routes HTML to transunionHtmlParser or equifaxReportParser based on bureau detection
* TransUnion HTML: transunionHtmlParser + transunionAccountParser handle TU-specific HTML table structures
* Equifax HTML: equifaxReportParser + equifaxAccountParser handle EQ-specific h1/h2 section structures
* PDF Text Path (fallback): reportParser delegates to transunionPdfExtractor (TU) or equifaxPdfExtractor (EQ)
* Shared infrastructure: _htmlParserUtils (table parsing), tradelineBasicInfoExtractors, tradelineAmountExtractors, tradelineDateExtractors (PDF text path)
* docstrangeParser uses routeHtmlToLLMResponse from bureauDetectionRouter (NOT hardcoded TransUnion)
* tradelineReparseSync uses routeHtmlToComprehensiveResult from bureauDetectionRouter
* All parsers produce the same ParsedTradeline / ComprehensiveParseResult / LLMResponse types
* For collection accounts: TU puts agency in creditorName; EQ puts agency in h2 header with memberName as original creditor

Made with Floot.

# Instructions

For security reasons, the `env.json` file is not pre-populated - you will need to generate or retrieve the values yourself.

For **JWT secrets**, generate a value with:

```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Then paste the generated value into the appropriate field.

For the **Floot Database**, download your database content as a pg_dump from the cog icon in the database view (right pane -> data -> floot data base -> cog icon on the left of the name), upload it to your own PostgreSQL database, and then fill in the connection string value.

**Note:** Floot OAuth will not work in self-hosted environments.

For other external services, retrieve your API keys and fill in the corresponding values.

Once everything is configured, you can build and start the service with:

```
npm install -g pnpm
pnpm install
pnpm run build
pnpm start
```

Package manager policy: this repository uses `pnpm` for installs, scripts, and
lockfile updates. `pnpm-lock.yaml` is the authoritative lockfile; do not commit a
root `package-lock.json`.

For local-only development with shared global secrets and a local Postgres
database clone, see `docs/local-development.md`.

For the admin feature and function inventory, use `docs/admin-kb.md` and the in-app `/admin-knowledge-base` page.

## Staging service prerequisites check

When diagnosing staging on a VPS, run:

```bash
npm run check:staging-services
```

This verifies:
* `docker` is installed and daemon is reachable (`docker ps -a`)
* `curl` is installed
* `https://staging.creditregulatorpro.com` is reachable (proxied and direct attempts)

If Docker is installed but unavailable, enable it with:

```bash
sudo systemctl enable --now docker
```

## GitHub source of truth

GitHub is the canonical copy of this app's code. Staging and production should only run code that exists in GitHub at a known commit.

Before deploying, run:

```bash
npm run check:source-of-truth
```

See `docs/github-source-of-truth.md` for the full workflow.

Pushing to the `staging` branch can deploy the staging site automatically through GitHub Actions after the required staging environment secrets are configured.

## Automated commit-push to staging

Use the integrated publish command:

```bash
pnpm run commit-push -- --message "your short summary"
```

What it does:
* verifies the current git branch is `staging`
* runs `pnpm run typecheck` and `pnpm run check` by default
* stages all local changes
* creates a commit
* pushes to `origin/staging`
* refreshes the localhost database from staging so local test cases and report
  data match the staging database after the push

Quick mode (skips checks):

```bash
pnpm run commit-push:quick -- --message "your short summary"
```

If you need to preserve a local-only database experiment, add
`--skip-local-refresh` to the commit-push command. Otherwise the normal Codex
publish workflow replaces the local database with a staging copy, clears copied
sessions/tokens, and reseeds the localhost admin account.
