Create a new app “Credit Regulator Pro”
TARGET AUDIENCE: Grade 8 education level. All user-facing text must use plain, everyday language. No jargon. Short sentences. Encouraging tone.

POLICY Canada only 
* Region = CA only no cross border storage
* Evidence retention = 1 year
* Terminal labels follow a 4-phase progression system; any phase can be the current terminal state. The old PROCEDURALLY EXHAUSTED — CURRENTLY label has been retired.

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
* No "enterprise" role — it has been removed
* Subscription plans: beta (free), monthly ($19 CAD, primary plan), annual ($49.99 CAD)
* Beta users have full feature access — same as paid users
* The system is now in PRODUCTION MODE (production_mode = true)
* Beta users can now upgrade to paid subscription plans via Stripe
* New registrations receive a 7-day free trial (plan: "beta", status: "trialing")
* After the 7-day trial, users must subscribe to monthly or annual plan or account is locked
* After trial, users must subscribe or account is locked
* The anonymous upload flow (try-upload page) exists for conversion
* Billing via Stripe (integration deferred — subscription tracking is in place)
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
* The `packet/build_POST` endpoint joins with the creditor table and resolves creditor name with fallback chain: creditor.name → originalCreditorName → "Unknown Creditor"

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